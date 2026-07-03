"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, doc, addDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { kirimWA, kirimEmail, template } from "../../../lib/notify";

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
}

export default function AdminAtkPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  // States Tab & Data
  const [activeTab, setActiveTab] = useState<"REQUEST" | "MASTER">("REQUEST");
  const [atkRequests, setAtkRequests] = useState<AtkRequest[]>([]);
  const [masterAtkList, setMasterAtkList] = useState<MasterAtk[]>([]);
  
  // States Form Master ATK
  const [newItemName, setNewItemName] = useState("");
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

    if (!window.confirm(`Ubah status pesanan ini menjadi "${newStatus}"?`)) return;

    try {
      await updateDoc(doc(db, "ga_atk_requests", id), { status: newStatus });
    } catch (error) {
      console.error(error);
      alert("Gagal mengupdate status.");
      return;
    }

    // Notifikasi prioritas tinggi hanya dikirim saat barang benar-benar SIAP DIAMBIL
    if (newStatus === "Selesai / Diambil") {
      setSedangUpdateId(id);
      try {
        const req = atkRequests.find(r => r.id === id);
        if (req) {
          await kirimNotifikasiAtkSiap(req.nama_pemohon, req.resi);
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

  // Kirim WA + Email ke pemohon saat ATK siap diambil
  const kirimNotifikasiAtkSiap = async (namaPemohon: string, kodeResi: string) => {
    const kontak = cariKontakKaryawan(namaPemohon);

    if (!kontak || (!kontak.no_wa && !kontak.email)) {
      console.warn(`[notify] Kontak untuk "${namaPemohon}" tidak ditemukan / belum lengkap di Master Data Karyawan. Notifikasi ATK dilewati.`);
      return;
    }

    const pesan = template.atkSiapDiambil(namaPemohon, kodeResi);

    if (kontak.no_wa) {
      const hasilWA = await kirimWA(kontak.no_wa, pesan);
      if (!hasilWA.sukses) console.error("[notify] Gagal kirim WA ATK:", hasilWA.pesanError);
    }

    if (kontak.email) {
      const hasilEmail = await kirimEmail(kontak.email, `ATK Siap Diambil - Resi ${kodeResi}`, pesan, namaPemohon);
      if (!hasilEmail.sukses) console.error("[notify] Gagal kirim Email ATK:", hasilEmail.pesanError);
    }
  };

  const handleExportExcel = () => {
    if (atkRequests.length === 0) return alert("Data kosong!");

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
  const handleAddMasterItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    setIsLoading(true);
    try {
      await addDoc(collection(db, "master_atk"), { nama_barang: newItemName.trim().toUpperCase() });
      setNewItemName("");
      alert("Barang berhasil ditambahkan ke database Master ATK!");
    } catch (error) {
      console.error(error);
      alert("Gagal menambahkan barang.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMasterItem = async (id: string, nama: string) => {
    if (!window.confirm(`Yakin ingin menghapus "${nama}" dari Master Data? Barang ini tidak akan muncul lagi di pilihan pencarian form depan.`)) return;
    try {
      await deleteDoc(doc(db, "master_atk", id));
    } catch (error) {
      console.error(error);
      alert("Gagal menghapus barang.");
    }
  };

  const formatJam = (ts: Timestamp | null | undefined) => ts ? new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  // Filtering
  const filteredRequests = atkRequests.filter(req => req.resi.toLowerCase().includes(searchQuery.toLowerCase()) || req.nama_pemohon.toLowerCase().includes(searchQuery.toLowerCase()));

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Admin Desk</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>GUDANG ATK GA</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Manajemen pemenuhan alat tulis kantor dan master data logistik SIBM.</p>
      </div>

      <div style={{ maxWidth: "1100px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* NAVIGASI TAB MODERN */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", overflowX: "auto", paddingBottom: "5px" }}>
          <button 
            onClick={() => setActiveTab("REQUEST")} 
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "REQUEST" ? "white" : "rgba(255,255,255,0.8)", color: activeTab === "REQUEST" ? "#d53f8c" : "#718096", boxShadow: activeTab === "REQUEST" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "REQUEST" ? "3px solid #d53f8c" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            📋 Pesanan Masuk 
            <span style={{ background: activeTab === "REQUEST" ? "#fdf4ff" : "#e2e8f0", color: activeTab === "REQUEST" ? "#97266d" : "#4a5568", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>
              {atkRequests.filter(r => r.status !== "Selesai / Diambil").length}
            </span>
          </button>
          <button 
            onClick={() => setActiveTab("MASTER")} 
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "MASTER" ? "white" : "rgba(255,255,255,0.8)", color: activeTab === "MASTER" ? "#3182ce" : "#718096", boxShadow: activeTab === "MASTER" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "MASTER" ? "3px solid #3182ce" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            📦 Master Data Barang 
            <span style={{ background: activeTab === "MASTER" ? "#ebf8ff" : "#e2e8f0", color: activeTab === "MASTER" ? "#2b6cb0" : "#4a5568", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>
              {masterAtkList.length} Item
            </span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: DAFTAR REQUEST ATK */}
        {/* ========================================================= */}
        {activeTab === "REQUEST" && (
          <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <input 
                type="text" 
                placeholder="🔍 Cari Resi / Nama Pemohon..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", width: "100%", maxWidth: "300px", fontSize: "14px", background: "#f8fafc", outline: "none" }}
              />
              <button onClick={handleExportExcel} style={{ background: "#2f855a", color: "white", padding: "12px 18px", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(47,133,90,0.2)" }}>
                <span>📊</span> Export Excel
              </button>
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead style={{ background: "#fdf4ff", color: "#97266d" }}>
                  <tr>
                    <th style={{ padding: "15px", borderBottom: "2px solid #fbb6ce", whiteSpace: "nowrap" }}>No. Resi</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #fbb6ce" }}>Pemohon</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #fbb6ce", minWidth: "250px" }}>Daftar Barang Diminta</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #fbb6ce" }}>Waktu Request</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #fbb6ce", textAlign: "center" }}>Status & Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.length > 0 ? filteredRequests.map((req) => {
                    const isSelesai = req.status === "Selesai / Diambil";
                    const isProses = req.status === "Sedang Disiapkan";
                    return (
                      <tr key={req.id} style={{ borderBottom: "1px solid #edf2f7", background: isSelesai ? "#f8fafc" : "white" }}>
                        <td style={{ padding: "15px", fontWeight: "900", color: "#d53f8c", letterSpacing: "0.5px" }}>{req.resi}</td>
                        <td style={{ padding: "15px" }}>
                          <div style={{ fontWeight: "bold", color: "#2d3748" }}>{req.nama_pemohon}</div>
                          <div style={{ fontSize: "11px", color: "#718096", marginTop: "4px", background: "#edf2f7", padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>{req.departemen}</div>
                        </td>
                        <td style={{ padding: "15px" }}>
                          <ul style={{ margin: 0, paddingLeft: "15px", color: "#4a5568" }}>
                            {req.items?.map((item, idx) => (
                              <li key={idx} style={{ marginBottom: "5px" }}>
                                <b>{item.nama_barang}</b> ({item.jumlah})
                                {item.deskripsi && <div style={{ fontSize: "11px", color: "#a0aec0", fontStyle: "italic" }}>Note: {item.deskripsi}</div>}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td style={{ padding: "15px", color: "#718096" }}>{formatJam(req.waktu_request)}</td>
                        <td style={{ padding: "15px", textAlign: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
                            <span style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", background: isSelesai ? "#c6f6d5" : isProses ? "#ebf8ff" : "#fed7d7", color: isSelesai ? "#22543d" : isProses ? "#2b6cb0" : "#9b2c2c", whiteSpace: "nowrap" }}>
                              {req.status.toUpperCase()}
                            </span>
                            {!isSelesai && (
                              <button 
                                onClick={() => handleUpdateStatus(req.id, req.status)}
                                disabled={sedangUpdateId === req.id}
                                style={{ padding: "6px 12px", background: sedangUpdateId === req.id ? "#a0aec0" : (isProses ? "#38a169" : "#3182ce"), color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "11px", cursor: sedangUpdateId === req.id ? "not-allowed" : "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", whiteSpace: "nowrap" }}
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
                      <td colSpan={5} style={{ textAlign: "center", padding: "50px 20px", color: "#a0aec0" }}>
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
            <div style={{ flex: "1 1 300px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", position: "sticky", top: "80px" }}>
              <h2 style={{ margin: "0 0 20px 0", color: "#1a202c", fontSize: "18px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>➕</span> Tambah Item Baru
              </h2>
              <form onSubmit={handleAddMasterItem} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Barang Lengkap *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Cth: KERTAS HVS A4 80GSM SINAR DUNIA" 
                    value={newItemName} 
                    onChange={(e) => setNewItemName(e.target.value)} 
                    style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none", boxSizing: "border-box", textTransform: "uppercase" }} 
                  />
                  <p style={{ margin: "8px 0 0 0", fontSize: "11px", color: "#a0aec0", lineHeight: "1.4" }}>Tuliskan nama beserta merknya agar memudahkan Karyawan saat melakukan pencarian di form utama.</p>
                </div>
                <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "14px", background: isLoading ? "#a0aec0" : "#3182ce", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "14px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "5px", boxShadow: isLoading ? "none" : "0 4px 6px rgba(49, 130, 206, 0.3)" }}>
                  {isLoading ? "Menambahkan..." : "Simpan Barang"}
                </button>
              </form>
            </div>

            {/* Tabel Master Data */}
            <div style={{ flex: "2 1 500px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
              <h2 style={{ margin: "0 0 20px 0", color: "#1a202c", fontSize: "18px", fontWeight: "bold" }}>Daftar Master ATK SIBM</h2>
              
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "15px" }}>
                {masterAtkList.length > 0 ? masterAtkList.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #edf2f7" }}>
                    <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "13px" }}>{item.nama_barang}</span>
                    <button 
                      onClick={() => handleDeleteMasterItem(item.id, item.nama_barang)}
                      style={{ background: "#fff5f5", color: "#e53e3e", border: "1px solid #fed7d7", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "12px", fontWeight: "bold" }}
                      title="Hapus Barang"
                    >
                      ✖
                    </button>
                  </div>
                )) : (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px", color: "#a0aec0", border: "1px dashed #cbd5e0", borderRadius: "12px" }}>
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