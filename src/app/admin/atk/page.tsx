"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, doc, addDoc, deleteDoc, Timestamp, serverTimestamp, arrayUnion } from "firebase/firestore";
import { isAdministrator } from "../../../hooks/useAuthGuard";
import { db } from "../../../lib/firebase";
import { kirimEmail } from "../../../lib/notify";
import { buildAtkDibatalkanEmailHtml, buildAtkSiapEmailHtml } from "../../../lib/emailTemplates";
import Modal from "../../../components/ui/Modal";

// §101: status akhir tambahan -- pesanan tidak diproses
const STATUS_BATAL = "Dibatalkan";
const STATUS_SELESAI = "Selesai / Diambil";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import { daerahTulis } from "@/lib/daerah";


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
  alasan_batal?: string;
  dibatalkan_oleh?: string;
  diubah_admin?: boolean;
  catatan_admin?: string;
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
  // §101 batal & ubah barang
  const [batalReq, setBatalReq] = useState<AtkRequest | null>(null);
  const [alasanBatal, setAlasanBatal] = useState("");
  const [ubahReq, setUbahReq] = useState<AtkRequest | null>(null);
  const [itemsEdit, setItemsEdit] = useState<AtkItemRequest[]>([]);
  const [catatanUbah, setCatatanUbah] = useState("");
  const [barangBaru, setBarangBaru] = useState("");
  const [jumlahBaru, setJumlahBaru] = useState("1");
  const [menyimpanAksi, setMenyimpanAksi] = useState(false);

  useEffect(() => {
    // 1. Verifikasi Auth
    const nama = localStorage.getItem("pic_nama");
    const dept = localStorage.getItem("pic_dept");

    // §68: dulu redirect ke /shift-checkin (rute tidak ada -> 404) & Administrator dept lain ditolak,
    // beda dengan aturan useAuthGuard di halaman admin lain.
    if (!nama || (dept !== "Admin GA" && !isAdministrator(localStorage.getItem("pic_role") || ""))) {
      router.push("/");
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

  // ==========================================
  // §101 BATALKAN & UBAH BARANG
  // ==========================================
  const simpanBatal = async () => {
    if (!batalReq) return;
    if (!alasanBatal.trim()) return showToast("Isi alasan pembatalan.", "warning");
    setMenyimpanAksi(true);
    try {
      await updateDoc(doc(db, "ga_atk_requests", batalReq.id), {
        status: STATUS_BATAL, alasan_batal: alasanBatal.trim(), dibatalkan_oleh: adminName, waktu_batal: serverTimestamp(),
      });
      showToast(`Pesanan ${batalReq.resi} dibatalkan.`, "success");
      const kontak = cariKontakKaryawan(batalReq.nama_pemohon);
      if (kontak?.email) {
        kirimEmail(kontak.email, `Permintaan ATK Dibatalkan - Resi ${batalReq.resi}`, buildAtkDibatalkanEmailHtml({
          namaPemohon: batalReq.nama_pemohon, kodeResi: batalReq.resi, departemen: batalReq.departemen, alasan: alasanBatal.trim(), items: batalReq.items || [],
        }), batalReq.nama_pemohon).catch((e) => console.error("[notify] email batal ATK:", e));
      }
      setBatalReq(null); setAlasanBatal("");
    } catch (e) { console.error(e); showToast("Gagal membatalkan pesanan.", "error"); }
    finally { setMenyimpanAksi(false); }
  };

  const bukaUbah = (req: AtkRequest) => {
    setUbahReq(req); setItemsEdit((req.items || []).map((i) => ({ ...i }))); setCatatanUbah(""); setBarangBaru(""); setJumlahBaru("1");
  };
  const ubahJumlah = (idx: number, delta: number) => setItemsEdit((l) => l.map((it, i) => {
    if (i !== idx) return it;
    const n = Math.max(1, (parseInt(it.jumlah, 10) || 1) + delta);
    return { ...it, jumlah: String(n) };
  }));
  const tambahItemEdit = () => {
    const nama = barangBaru.trim();
    if (!nama) return showToast("Pilih / ketik nama barang.", "warning");
    const jml = String(Math.max(1, parseInt(jumlahBaru, 10) || 1));
    setItemsEdit((l) => {
      const ada = l.findIndex((x) => x.nama_barang.toLowerCase() === nama.toLowerCase());
      if (ada >= 0) return l.map((x, i) => (i === ada ? { ...x, jumlah: String((parseInt(x.jumlah, 10) || 0) + Number(jml)) } : x));
      return [...l, { nama_barang: nama.toUpperCase(), jumlah: jml, deskripsi: "" }];
    });
    setBarangBaru(""); setJumlahBaru("1");
  };
  const simpanUbah = async () => {
    if (!ubahReq) return;
    const bersih = itemsEdit.filter((i) => i.nama_barang.trim()).map((i) => ({ ...i, jumlah: String(Math.max(1, parseInt(i.jumlah, 10) || 1)) }));
    if (bersih.length === 0) return showToast("Minimal 1 barang. Untuk menolak semua, pakai Batalkan.", "warning");
    const ringkas = (l: AtkItemRequest[]) => l.map((i) => `${i.nama_barang} x${i.jumlah}`).join(", ");
    if (ringkas(bersih) === ringkas(ubahReq.items || []) && !catatanUbah.trim()) { setUbahReq(null); return; }
    setMenyimpanAksi(true);
    try {
      await updateDoc(doc(db, "ga_atk_requests", ubahReq.id), {
        items: bersih, diubah_admin: true, catatan_admin: catatanUbah.trim() || "Jumlah / daftar barang disesuaikan Admin GA",
        riwayat_ubah: arrayUnion({ oleh: adminName, waktu: Timestamp.now(), sebelum: ringkas(ubahReq.items || []), sesudah: ringkas(bersih), catatan: catatanUbah.trim() }),
      });
      showToast(`Barang pesanan ${ubahReq.resi} diperbarui.`, "success");
      setUbahReq(null);
    } catch (e) { console.error(e); showToast("Gagal menyimpan perubahan.", "error"); }
    finally { setMenyimpanAksi(false); }
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
      await addDoc(collection(db, "master_atk"), { daerah: daerahTulis(),
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
    <AdminShell title="Gudang ATK" subtitle="Pemenuhan permintaan alat tulis kantor dan master data logistik SIBM" userName={adminName || "Admin"}>
      <style dangerouslySetInnerHTML={{__html: `
      `}} />
      <div>

        {/* NAVIGASI TAB MODERN */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", overflowX: "auto", paddingBottom: "5px" }}>
          <button
            onClick={() => setActiveTab("REQUEST")}
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "REQUEST" ? "var(--surface)" : "rgba(255,255,255,0.8)", color: activeTab === "REQUEST" ? "var(--accent)" : "var(--muted)", boxShadow: activeTab === "REQUEST" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "REQUEST" ? "3px solid var(--accent)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            📋 Pesanan Masuk
            <span style={{ background: activeTab === "REQUEST" ? "var(--accent-50)" : "var(--line)", color: activeTab === "REQUEST" ? "var(--accent)" : "var(--ink-soft)", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>
              {atkRequests.filter(r => r.status !== STATUS_SELESAI && r.status !== STATUS_BATAL).length}
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
              <button onClick={handleExportExcel} style={{ background: "var(--ok-solid)", color: "#fff", padding: "12px 18px", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(22,163,74,0.2)" }}>
                <span>📊</span> Export Excel
              </button>
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead style={{ background: "var(--accent-50)", color: "var(--accent)" }}>
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
                    const isBatal = req.status === STATUS_BATAL;
                    const isSelesai = req.status === STATUS_SELESAI || isBatal;
                    const isProses = req.status === "Sedang Disiapkan";
                    return (
                      <tr key={req.id} style={{ borderBottom: "1px solid var(--line)", background: isSelesai ? "var(--bg)" : "var(--surface)" }}>
                        <td style={{ padding: "15px", fontWeight: "900", color: "var(--accent)", letterSpacing: "0.5px" }}>{req.resi}</td>
                        <td style={{ padding: "15px" }}>
                          <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{req.nama_pemohon}</div>
                          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px", background: "var(--line)", padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>{req.departemen}</div>
                        </td>
                        <td style={{ padding: "15px", opacity: isBatal ? 0.6 : 1, textDecoration: isBatal ? "line-through" : "none" }}>
                          {req.diubah_admin && !isBatal && <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--warn)", marginBottom: "6px" }}>✎ Disesuaikan admin{req.catatan_admin ? `: ${req.catatan_admin}` : ""}</div>}
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
                            <span style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", background: isBatal ? "var(--line)" : isSelesai ? "var(--ok-50)" : isProses ? "var(--info-50)" : "var(--red-50)", color: isBatal ? "var(--ink-soft)" : isSelesai ? "var(--ok)" : isProses ? "var(--info)" : "var(--red-600)", whiteSpace: "nowrap" }}>
                              {req.status.toUpperCase()}
                            </span>
                            {isBatal && <div style={{ fontSize: "11px", color: "var(--muted)", maxWidth: "180px" }}>{req.alasan_batal}{req.dibatalkan_oleh ? ` — ${req.dibatalkan_oleh}` : ""}</div>}
                            {!isSelesai && (
                              <button
                                onClick={() => handleUpdateStatus(req.id, req.status)}
                                disabled={sedangUpdateId === req.id}
                                style={{ padding: "6px 12px", background: sedangUpdateId === req.id ? "var(--muted-solid)" : (isProses ? "var(--ok-solid)" : "var(--info-solid)"), color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "11px", cursor: sedangUpdateId === req.id ? "not-allowed" : "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", whiteSpace: "nowrap" }}
                              >
                                {sedangUpdateId === req.id ? "Mengirim notifikasi..." : (isProses ? "Tandai Selesai ✓" : "Mulai Siapkan ➔")}
                              </button>
                            )}
                            {!isSelesai && (
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button type="button" onClick={() => bukaUbah(req)} style={{ padding: "5px 10px", background: "var(--warn-50)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: "8px", fontWeight: "bold", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>✎ Ubah Barang</button>
                                <button type="button" onClick={() => { setBatalReq(req); setAlasanBatal(""); }} style={{ padding: "5px 10px", background: "var(--red-50)", color: "var(--red-600)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "8px", fontWeight: "bold", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>✕ Batalkan</button>
                              </div>
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
                      <button type="button" onClick={() => setNewItemFoto("")} style={{ position: "absolute", top: "-8px", right: "-8px", background: "var(--brand)", color: "#fff", border: "none", width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer", fontSize: "11px", fontWeight: "bold" }}>✖</button>
                    </div>
                  )}
                </div>

                <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "14px", background: isLoading ? "var(--muted-solid)" : "var(--info-solid)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "14px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "5px", boxShadow: isLoading ? "none" : "0 4px 6px rgba(37,99,235,0.3)" }}>
                  {isLoading ? "Menambahkan..." : "Simpan Barang"}
                </button>
              </form>
            </div>

            {/* Tabel Master Data */}
            <div style={{ flex: "2 1 500px", background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid var(--line)" }}>
              <h2 style={{ margin: "0 0 20px 0", color: "var(--ink)", fontSize: "18px", fontWeight: "bold" }}>Daftar Master ATK SIBM</h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "15px" }}>
                {masterAtkList.length > 0 ? masterAtkList.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px", background: "var(--bg)", borderRadius: "12px", border: "1px solid var(--line)" }}>
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

      {/* §101 MODAL BATALKAN */}
      <Modal open={!!batalReq} onClose={() => !menyimpanAksi && setBatalReq(null)} maxWidth="440px">
        {batalReq && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>Batalkan pesanan {batalReq.resi}?</h3>
            <p style={{ margin: "0 0 14px", fontSize: "13px", color: "var(--muted)" }}>{batalReq.nama_pemohon} · {batalReq.departemen}. Pemohon diberi tahu lewat email (bila terdaftar) beserta alasannya.</p>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>Alasan pembatalan *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "6px 0 8px" }}>
              {["Stok kosong", "Permintaan ganda", "Tidak sesuai ketentuan", "Dibatalkan pemohon"].map((a) => (
                <button key={a} type="button" onClick={() => setAlasanBatal(a)} style={{ padding: "5px 10px", borderRadius: "999px", border: "1px solid var(--line)", background: alasanBatal === a ? "var(--ink)" : "var(--bg)", color: alasanBatal === a ? "var(--surface)" : "var(--ink-soft)", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>{a}</button>
              ))}
            </div>
            <textarea value={alasanBatal} onChange={(e) => setAlasanBatal(e.target.value)} placeholder="Tulis alasan..." style={{ width: "100%", minHeight: "80px", padding: "10px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit", fontSize: "13px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <button type="button" onClick={() => setBatalReq(null)} disabled={menyimpanAksi} className="sa-btn is-soft" style={{ flex: 1 }}>Kembali</button>
              <button type="button" onClick={simpanBatal} disabled={menyimpanAksi} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", background: "var(--red-600)", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{menyimpanAksi ? "Menyimpan..." : "Batalkan pesanan"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* §101 MODAL UBAH BARANG */}
      <Modal open={!!ubahReq} onClose={() => !menyimpanAksi && setUbahReq(null)} maxWidth="520px">
        {ubahReq && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>Ubah barang · {ubahReq.resi}</h3>
            <p style={{ margin: "0 0 14px", fontSize: "13px", color: "var(--muted)" }}>{ubahReq.nama_pemohon} · {ubahReq.departemen}. Atur jumlah, hapus, atau tambah barang.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {itemsEdit.map((it, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: "8px", alignItems: "center", padding: "8px 10px", borderRadius: "10px", background: "var(--bg)", border: "1px solid var(--line)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.nama_barang}</div>
                    {it.deskripsi && <div style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic" }}>{it.deskripsi}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <button type="button" aria-label="Kurangi" onClick={() => ubahJumlah(idx, -1)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontWeight: 800 }}>−</button>
                    <input value={it.jumlah} inputMode="numeric" aria-label="Jumlah" onChange={(e) => setItemsEdit((l) => l.map((x, i) => (i === idx ? { ...x, jumlah: e.target.value.replace(/\D/g, "") } : x)))} style={{ width: "44px", textAlign: "center", padding: "5px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontWeight: 800 }} />
                    <button type="button" aria-label="Tambah" onClick={() => ubahJumlah(idx, 1)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontWeight: 800 }}>+</button>
                  </div>
                  <button type="button" aria-label={`Hapus ${it.nama_barang}`} onClick={() => setItemsEdit((l) => l.filter((_, i) => i !== idx))} style={{ border: "none", background: "transparent", color: "var(--red-600)", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>Hapus</button>
                </div>
              ))}
              {itemsEdit.length === 0 && <div style={{ fontSize: "12.5px", color: "var(--muted)", padding: "10px", textAlign: "center", border: "1px dashed var(--line)", borderRadius: "10px" }}>Belum ada barang.</div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 64px auto", gap: "6px", marginTop: "10px" }}>
              <input list="atk-master-list" value={barangBaru} onChange={(e) => setBarangBaru(e.target.value)} placeholder="Tambah barang (pilih dari master)" style={{ padding: "9px 10px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: "13px", minWidth: 0 }} />
              <datalist id="atk-master-list">{masterAtkList.map((m) => <option key={m.id} value={m.nama_barang} />)}</datalist>
              <input value={jumlahBaru} inputMode="numeric" onChange={(e) => setJumlahBaru(e.target.value.replace(/\D/g, ""))} aria-label="Jumlah barang baru" style={{ padding: "9px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", textAlign: "center" }} />
              <button type="button" onClick={tambahItemEdit} className="sa-btn is-soft">+ Tambah</button>
            </div>
            <input value={catatanUbah} onChange={(e) => setCatatanUbah(e.target.value)} placeholder="Catatan untuk pemohon (opsional), mis. stok map bening tinggal 1" style={{ width: "100%", marginTop: "10px", padding: "9px 10px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: "13px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <button type="button" onClick={() => setUbahReq(null)} disabled={menyimpanAksi} className="sa-btn is-soft" style={{ flex: 1 }}>Batal</button>
              <button type="button" onClick={simpanUbah} disabled={menyimpanAksi} className="sa-btn is-primary" style={{ flex: 1 }}>{menyimpanAksi ? "Menyimpan..." : "Simpan perubahan"}</button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}