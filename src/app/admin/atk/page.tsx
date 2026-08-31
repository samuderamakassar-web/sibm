"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, doc, addDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { kirimEmail } from "../../../lib/notify";
import { buildAtkSiapEmailHtml } from "../../../lib/emailTemplates";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

interface KontakKaryawan {
  nama: string;
  no_wa?: string;
  email?: string;
}

// ==========================================
// INTERFACES
// ==========================================
interface AtkItemRequest {
  nama_barang: string;
  jumlah: string;
  deskripsi: string;
}

interface AtkRequest {
  id: string;
  resi: string;
  nama_pemohon: string;
  departemen: string;
  items: AtkItemRequest[];
  status: string;
  waktu_request: Timestamp | null;
}

interface MasterAtk {
  id: string;
  nama_barang: string;
  foto_url?: string;
}

export default function AdminAtkPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const [adminName, setAdminName] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  // States Tab & Data
  const [activeTab, setActiveTab] = useState<"REQUEST" | "MASTER">("REQUEST");
  const [atkRequests, setAtkRequests] = useState<AtkRequest[]>([]);
  const [masterAtkList, setMasterAtkList] = useState<MasterAtk[]>([]);

  // States Form Master ATK
  const [newItemName, setNewItemName] = useState("");
  const [newItemFoto, setNewItemFoto] = useState<string>("");
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [daftarKontak, setDaftarKontak] = useState<KontakKaryawan[]>([]);
  const [sedangUpdateId, setSedangUpdateId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Verifikasi Auth
    const nama = localStorage.getItem("pic_nama");
    const dept = localStorage.getItem("pic_dept");

    if (!nama || dept !== "Admin GA") {
      router.push("/shift-checkin");
      return;
    }

    setTimeout(() => {
      setAdminName(nama);
      setIsReady(true);
    }, 0);

    // 2. Tarik Data Request ATK Real-time
    const qRequest = query(collection(db, "ga_atk_requests"), orderBy("waktu_request", "desc"));
    const unsubRequest = onSnapshot(qRequest, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AtkRequest));
      setAtkRequests(data);
    });

    // 3. Tarik Master Data ATK Real-time
    const qMaster = query(collection(db, "master_atk"), orderBy("nama_barang", "asc"));
    const unsubMaster = onSnapshot(qMaster, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MasterAtk));
      setMasterAtkList(data);
    });

    // 4. Tarik Master Data Karyawan (untuk lookup no_wa/email saat kirim notifikasi)
    const unsubKontak = onSnapshot(collection(db, "employees_directory"), (snapshot) => {
      const data = snapshot.docs.map(d => d.data() as KontakKaryawan);
      setDaftarKontak(data);
    });

    return () => {
      unsubRequest();
      unsubMaster();
      unsubKontak();
    };
  }, [router]);

  // ==========================================
  // HANDLERS REQUEST ATK
  // ==========================================
  const handleUpdateStatus = async (id: string, currentStatus: string) => {
    let newStatus = "";
    if (currentStatus === "Menunggu Disiapkan") newStatus = "Sedang Disiapkan";
    else if (currentStatus === "Sedang Disiapkan") newStatus = "Selesai / Diambil";
    else return; // Jika sudah selesai, tidak bisa diklik lagi

    const yakin = await confirm(`Ubah status pesanan ini menjadi "${newStatus}"?`);
    if (!yakin) return;

    try {
      await updateDoc(doc(db, "ga_atk_requests", id), { status: newStatus });
    } catch (error) {
      console.error(error);
      showToast("Gagal mengupdate status.", "error");
      return;
    }

    // Notifikasi prioritas tinggi hanya dikirim saat barang benar-benar SIAP DIAMBIL
    if (newStatus === "Selesai / Diambil") {
      setSedangUpdateId(id);
      try {
        const req = atkRequests.find(r => r.id === id);
        if (req) {
          await kirimNotifikasiAtkSiap(req);
        }
      } finally {
        setSedangUpdateId(null);
      }
    }
  };

  // Cari kontak (no_wa/email) karyawan berdasarkan nama_pemohon (cocok tanpa peduli besar/kecil huruf)
  const cariKontakKaryawan = (nama: string): KontakKaryawan | undefined => {
    const namaNormal = nama.trim().toLowerCase();
    return daftarKontak.find(k => (k.nama || "").trim().toLowerCase() === namaNormal);
  };

  // Kirim Email ke pemohon saat ATK siap diambil (WA sudah dihapus, token Fonnte invalid/expired)
  const kirimNotifikasiAtkSiap = async (req: AtkRequest) => {
    const kontak = cariKontakKaryawan(req.nama_pemohon);

    if (!kontak || !kontak.email) {
      console.warn(`[notify] Kontak untuk "${req.nama_pemohon}" tidak ditemukan / belum punya email di Master Data Karyawan. Notifikasi ATK dilewati.`);
      return;
    }

    const htmlEmail = buildAtkSiapEmailHtml({
      namaPemohon: req.nama_pemohon,
      kodeResi: req.resi,
      departemen: req.departemen,
      items: req.items,
    });
    const hasilEmail = await kirimEmail(kontak.email, `ATK Siap Diambil - Resi ${req.resi}`, htmlEmail, req.nama_pemohon);
    if (!hasilEmail.sukses) console.error("[notify] Gagal kirim Email ATK:", hasilEmail.pesanError);
  };

  const handleExportExcel = () => {
    if (atkRequests.length === 0) return showToast("Data kosong!", "warning");

    const headers = ["Resi", "Tanggal", "Pemohon", "Departemen", "Detail Barang", "Status"];
    const rows = atkRequests.map(req => {
      const aman = (text: string) => `"${(text || "").replace(/"/g, '""')}"`;
      const itemString = req.items?.map(i => `${i.nama_barang} (${i.jumlah}) - ${i.deskripsi || "-"}`).join(" | ");
      return [
        aman(req.resi),
        aman(formatJam(req.waktu_request)),
        aman(req.nama_pemohon),
        aman(req.departemen),
        aman(itemString),
        aman(req.status)
      ].join(",");
    });

    const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_ATK_SIBM_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ==========================================
  // HANDLERS MASTER DATA ATK
  // ==========================================
  async function uploadToCloudinary(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
    formData.append("folder", "sibm/master-atk");

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
    const data = await res.json();
    return data.secure_url as string;
  }

  const handleFotoBarangUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 500 / img.width;
        canvas.width = 500;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setIsUploadingFoto(true);
          try {
            const url = await uploadToCloudinary(blob);
            setNewItemFoto(url);
          } catch (err) {
            console.error(err);
            showToast("Gagal upload foto barang, coba lagi.", "error");
          } finally {
            setIsUploadingFoto(false);
          }
        }, "image/jpeg", 0.7);
      };
      if (typeof ev.target?.result === 'string') img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleAddMasterItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    setIsLoading(true);
    try {
      await addDoc(collection(db, "master_atk"), {
        nama_barang: newItemName.trim().toUpperCase(),
        foto_url: newItemFoto || null,
      });
      setNewItemName("");
      setNewItemFoto("");
      showToast("Barang berhasil ditambahkan ke database Master ATK!", "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menambahkan barang.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMasterItem = async (id: string, nama: string) => {
    const yakin = await confirm({
      title: "Hapus Master Barang ATK",
      message: `Yakin ingin menghapus "${nama}" dari Master Data? Barang ini tidak akan muncul lagi di pilihan pencarian form depan.`,
      confirmText: "Ya, Hapus",
      variant: "danger"
    });
    if (!yakin) return;
    try {
      await deleteDoc(doc(db, "master_atk", id));
      showToast(`"${nama}" berhasil dihapus dari Master Data.`, "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus barang.", "error");
    }
  };

  const formatJam = (ts: Timestamp | null | undefined) => ts ? new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  // Filtering
  const filteredRequests = atkRequests.filter(req => req.resi.toLowerCase().includes(searchQuery.toLowerCase()) || req.nama_pemohon.toLowerCase().includes(searchQuery.toLowerCase()));

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .back-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px;
        }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge {
          display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info);
          padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2);
        }
        .admin-hero {
          position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff;
          padding: 34px 20px 50px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .admin-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .admin-hero-content { position: relative; }
      `}} />
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> {adminName}
        </div>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>GUDANG ATK GA</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Manajemen pemenuhan alat tulis kantor dan master data logistik SIBM.</p>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>

        {/* NAVIGASI TAB MODERN */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", overflowX: "auto", paddingBottom: "5px" }}>
          <button
            onClick={() => setActiveTab("REQUEST")}
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "REQUEST" ? "var(--surface)" : "rgba(255,255,255,0.8)", color: activeTab === "REQUEST" ? "var(--accent)" : "var(--muted)", boxShadow: activeTab === "REQUEST" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "REQUEST" ? "3px solid var(--accent)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            📋 Pesanan Masuk
            <span style={{ background: activeTab === "REQUEST" ? "#f5f3ff" : "var(--line)", color: activeTab === "REQUEST" ? "var(--accent)" : "var(--ink-soft)", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>
              {atkRequests.filter(r => r.status !== "Selesai / Diambil").length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("MASTER")}
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "MASTER" ? "var(--surface)" : "rgba(255,255,255,0.8)", color: activeTab === "MASTER" ? "var(--info)" : "var(--muted)", boxShadow: activeTab === "MASTER" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "MASTER" ? "3px solid var(--info)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            📦 Master Data Barang
            <span style={{ background: activeTab === "MASTER" ? "var(--info-50)" : "var(--line)", color: activeTab === "MASTER" ? "var(--info)" : "var(--ink-soft)", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>
              {masterAtkList.length} Item
            </span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: DAFTAR REQUEST ATK */}
        {/* ========================================================= */}
        {activeTab === "REQUEST" && (
          <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <input
                type="text"
                placeholder="🔍 Cari Resi / Nama Pemohon..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--line)", width: "100%", maxWidth: "300px", fontSize: "14px", background: "var(--bg)", outline: "none" }}
              />
              <button onClick={handleExportExcel} style={{ background: "var(--ok)", color: "white", padding: "12px 18px", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(22,163,74,0.2)" }}>
                <span>📊</span> Export Excel
              </button>
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead style={{ background: "#f5f3ff", color: "var(--accent)" }}>
                  <tr>
                    <th style={{ padding: "15px", borderBottom: "2px solid rgba(124,58,237,0.35)", whiteSpace: "nowrap" }}>No. Resi</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid rgba(124,58,237,0.35)" }}>Pemohon</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid rgba(124,58,237,0.35)", minWidth: "250px" }}>Daftar Barang Diminta</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid rgba(124,58,237,0.35)" }}>Waktu Request</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid rgba(124,58,237,0.35)", textAlign: "center" }}>Status & Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.length > 0 ? filteredRequests.map((req) => {
                    const isSelesai = req.status === "Selesai / Diambil";
                    const isProses = req.status === "Sedang Disiapkan";
                    return (
                      <tr key={req.id} style={{ borderBottom: "1px solid var(--line)", background: isSelesai ? "#f8fafc" : "var(--surface)" }}>
                        <td style={{ padding: "15px", fontWeight: "900", color: "var(--accent)", letterSpacing: "0.5px" }}>{req.resi}</td>
                        <td style={{ padding: "15px" }}>
                          <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{req.nama_pemohon}</div>
                          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px", background: "var(--line)", padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>{req.departemen}</div>
                        </td>
                        <td style={{ padding: "15px" }}>
                          <ul style={{ margin: 0, paddingLeft: "15px", color: "var(--ink-soft)" }}>
                            {req.items?.map((item, idx) => (
                              <li key={idx} style={{ marginBottom: "5px" }}>
                                <b>{item.nama_barang}</b> ({item.jumlah})
                                {item.deskripsi && <div style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic" }}>Note: {item.deskripsi}</div>}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td style={{ padding: "15px", color: "var(--muted)" }}>{formatJam(req.waktu_request)}</td>
                        <td style={{ padding: "15px", textAlign: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
                            <span style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", background: isSelesai ? "var(--ok-50)" : isProses ? "var(--info-50)" : "var(--red-50)", color: isSelesai ? "var(--ok)" : isProses ? "var(--info)" : "var(--red-600)", whiteSpace: "nowrap" }}>
                              {req.status.toUpperCase()}
                            </span>
                            {!isSelesai && (
                              <button
                                onClick={() => handleUpdateStatus(req.id, req.status)}
                                disabled={sedangUpdateId === req.id}
                                style={{ padding: "6px 12px", background: sedangUpdateId === req.id ? "var(--muted)" : (isProses ? "var(--ok)" : "var(--info)"), color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "11px", cursor: sedangUpdateId === req.id ? "not-allowed" : "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", whiteSpace: "nowrap" }}
                              >
                                {sedangUpdateId === req.id ? "Mengirim notifikasi..." : (isProses ? "Tandai Selesai ✓" : "Mulai Siapkan ➔")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "50px 20px", color: "var(--muted)" }}>
                        <div style={{ fontSize: "35px", marginBottom: "10px" }}>📭</div>
                        {searchQuery ? "Data tidak ditemukan." : "Belum ada pesanan ATK yang masuk."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: MASTER DATA ATK */}
        {/* ========================================================= */}
        {activeTab === "MASTER" && (
          <div style={{ display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" }}>

            {/* Form Tambah Item */}
            <div style={{ flex: "1 1 300px", background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", position: "sticky", top: "80px" }}>
              <h2 style={{ margin: "0 0 20px 0", color: "var(--ink)", fontSize: "18px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>➕</span> Tambah Item Baru
              </h2>
              <form onSubmit={handleAddMasterItem} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "6px", display: "block" }}>Nama Barang Lengkap *</label>
                  <input
                    type="text"
                    required
                    placeholder="Cth: KERTAS HVS A4 80GSM SINAR DUNIA"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "14px", background: "var(--bg)", outline: "none", boxSizing: "border-box", textTransform: "uppercase" }}
                  />
                  <p style={{ margin: "8px 0 0 0", fontSize: "11px", color: "var(--muted)", lineHeight: "1.4" }}>Tuliskan nama beserta merknya agar memudahkan Karyawan saat melakukan pencarian di form utama.</p>
                </div>

                {/* UPLOAD FOTO BARANG */}
                <div style={{ background: newItemFoto ? "var(--ok-50)" : "var(--bg)", border: newItemFoto ? "2px solid var(--ok)" : "2px dashed var(--line)", padding: "15px", borderRadius: "12px", textAlign: "center" }}>
                  <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "24px" }}>📷</span>
                    <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)" }}>{newItemFoto ? "Foto Terlampir ✓" : "Unggah Foto Barang (Opsional)"}</div>
                    <input type="file" accept="image/*" onChange={handleFotoBarangUpload} style={{ display: "none" }} />
                  </label>
                  {isUploadingFoto ? (
                    <div style={{ fontSize: "12px", color: "var(--warn)", marginTop: "8px" }}>⏳ Mengunggah...</div>
                  ) : newItemFoto && (
                    <div style={{ marginTop: "10px", position: "relative", display: "inline-block" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={newItemFoto} alt="Preview" style={{ width: "100px", height: "100px", objectFit: "cover", borderRadius: "8px" }} />
                      <button type="button" onClick={() => setNewItemFoto("")} style={{ position: "absolute", top: "-8px", right: "-8px", background: "var(--red-600)", color: "white", border: "none", width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer", fontSize: "11px", fontWeight: "bold" }}>✖</button>
                    </div>
                  )}
                </div>

                <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "14px", background: isLoading ? "var(--muted)" : "var(--info)", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "14px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "5px", boxShadow: isLoading ? "none" : "0 4px 6px rgba(37,99,235,0.3)" }}>
                  {isLoading ? "Menambahkan..." : "Simpan Barang"}
                </button>
              </form>
            </div>

            {/* Tabel Master Data */}
            <div style={{ flex: "2 1 500px", background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid var(--line)" }}>
              <h2 style={{ margin: "0 0 20px 0", color: "var(--ink)", fontSize: "18px", fontWeight: "bold" }}>Daftar Master ATK SIBM</h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "15px" }}>
                {masterAtkList.length > 0 ? masterAtkList.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px", background: "#f8fafc", borderRadius: "12px", border: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {item.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.foto_url} alt={item.nama_barang} style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "6px" }} />
                      ) : (
                        <div style={{ width: "36px", height: "36px", borderRadius: "6px", background: "var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>🖇️</div>
                      )}
                      <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "13px" }}>{item.nama_barang}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteMasterItem(item.id, item.nama_barang)}
                      style={{ background: "var(--red-50)", color: "var(--red-600)", border: "1px solid rgba(220,38,38,0.25)", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "12px", fontWeight: "bold" }}
                      title="Hapus Barang"
                    >
                      ✖
                    </button>
                  </div>
                )) : (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px" }}>
                    Belum ada master data barang. Silakan tambah barang pertama Anda.
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}