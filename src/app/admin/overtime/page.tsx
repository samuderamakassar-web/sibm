"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { kirimWA, kirimEmail, template } from "../../../lib/notify";

// ==========================================
// INTERFACES (GABUNGAN GEDUNG & TIM)
// ==========================================
interface OvertimeItemRequest {
  tanggal?: string;
  jam_mulai?: string;
  jam_selesai?: string;
  area_ruangan?: string;
  alasan?: string;
}

interface OvertimeRequest {
  id: string;
  nama_pemohon?: string;
  departemen?: string;
  status?: string;
  waktu_request?: Timestamp | null;
  
  // Format Lembur Tim (Multi-Row / Kolektif)
  periode?: string;
  items?: OvertimeItemRequest[];
  
  // Format Lembur Gedung (Single-Row / Satuan)
  area_ruangan?: string;
  tanggal?: string;
  jam_mulai?: string;
  jam_selesai?: string;
  alasan?: string;
}

interface KontakKaryawan {
  nama: string;
  no_wa?: string;
  email?: string;
}

export default function AdminOvertimePage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  // States Navigasi Tab
  const [activeTab, setActiveTab] = useState<"GEDUNG" | "TIM">("GEDUNG");

  // States Data Database
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [daftarKontak, setDaftarKontak] = useState<KontakKaryawan[]>([]);
  const [sedangKirimNotif, setSedangKirimNotif] = useState<string | null>(null); // id request yang sedang dikirimi notif

  // States Filter Universal
  const [filterStatus, setFilterStatus] = useState<string>("SEMUA");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // State Filter Khusus Tab Tim
  const [filterPeriode, setFilterPeriode] = useState<string>("SEMUA");

  useEffect(() => {
    // 1. Verifikasi Akses Admin
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

    // 2. Tarik Data Request Overtime Real-time
    const q = query(collection(db, "ga_overtime_requests"), orderBy("waktu_request", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OvertimeRequest));
      setOvertimeRequests(data);
    });

    // 3. Tarik Master Data Karyawan (untuk lookup no_wa/email saat kirim notifikasi)
    const unsubscribeKontak = onSnapshot(collection(db, "employees_directory"), (snapshot) => {
      const data = snapshot.docs.map(d => d.data() as KontakKaryawan);
      setDaftarKontak(data);
    });

    return () => {
      unsubscribe();
      unsubscribeKontak();
    };
  }, [router]);

  // ==========================================
  // PEMISAHAN DATA (GEDUNG vs TIM)
  // ==========================================
  const dataGedung = overtimeRequests.filter(req => !req.periode && !req.items);
  const dataTim = overtimeRequests.filter(req => req.periode && req.items);

  const daftarPeriodeUnik = Array.from(new Set(dataTim.map(req => req.periode).filter(Boolean))) as string[];

  // ==========================================
  // HANDLERS AKSI APPROVAL
  // ==========================================
  const handleProcessDecision = async (id: string, nama: string, keputusan: "Approved" | "Rejected") => {
    const namaAman = nama || "Pemohon";
    const pesanKonfirmasi = keputusan === "Approved" 
      ? `Apakah Anda yakin ingin MENYETUJUI permohonan overtime dari ${namaAman}?`
      : `Apakah Anda yakin ingin MENOLAK permohonan overtime dari ${namaAman}?`;

    if (!window.confirm(pesanKonfirmasi)) return;

    // Alasan penolakan opsional, ikut dikirim di pesan notifikasi
    let alasanTolak: string | undefined;
    if (keputusan === "Rejected") {
      alasanTolak = window.prompt("Alasan penolakan (opsional, boleh dikosongkan):") || undefined;
    }

    try {
      await updateDoc(doc(db, "ga_overtime_requests", id), {
        status: keputusan
      });
    } catch (error) {
      console.error(error);
      alert("Gagal memperbarui status permohonan lembur.");
      return; // Jangan lanjut kirim notifikasi jika update status saja sudah gagal
    }

    // Update status berhasil -> lanjut kirim notifikasi WA/Email ke pemohon (best-effort, tidak memblokir UI)
    setSedangKirimNotif(id);
    try {
      const req = overtimeRequests.find(r => r.id === id);
      const tanggalLembur = req?.tanggal || req?.items?.[0]?.tanggal || "-";
      const tanggalFormat = tanggalLembur !== "-" ? new Date(tanggalLembur).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-";

      await kirimNotifikasiOvertime(namaAman, keputusan, tanggalFormat, alasanTolak);
    } finally {
      setSedangKirimNotif(null);
    }
  };

  // Cari kontak (no_wa/email) karyawan berdasarkan nama_pemohon (cocok tanpa peduli besar/kecil huruf)
  const cariKontakKaryawan = (nama: string): KontakKaryawan | undefined => {
    const namaNormal = nama.trim().toLowerCase();
    return daftarKontak.find(k => (k.nama || "").trim().toLowerCase() === namaNormal);
  };

  // Kirim WA + Email ke pemohon overtime sesuai hasil keputusan
  const kirimNotifikasiOvertime = async (nama: string, keputusan: "Approved" | "Rejected", tanggal: string, alasanTolak?: string) => {
    const kontak = cariKontakKaryawan(nama);

    if (!kontak || (!kontak.no_wa && !kontak.email)) {
      // Nama pemohon tidak ketemu di Master Data Karyawan, atau belum punya no_wa/email.
      // Tidak menghentikan alur approval -- cukup dicatat agar Admin GA tahu harus hubungi manual.
      console.warn(`[notify] Kontak untuk "${nama}" tidak ditemukan / belum lengkap di Master Data Karyawan. Notifikasi dilewati.`);
      return;
    }

    const pesan = keputusan === "Approved"
      ? template.overtimeDisetujui(nama, tanggal)
      : template.overtimeDitolak(nama, tanggal, alasanTolak);

    if (kontak.no_wa) {
      const hasilWA = await kirimWA(kontak.no_wa, pesan);
      if (!hasilWA.sukses) console.error("[notify] Gagal kirim WA overtime:", hasilWA.pesanError);
    }

    if (kontak.email) {
      const subjek = `Update Overtime Gedung: ${keputusan === "Approved" ? "Disetujui" : "Ditolak"}`;
      const hasilEmail = await kirimEmail(kontak.email, subjek, pesan, nama);
      if (!hasilEmail.sukses) console.error("[notify] Gagal kirim Email overtime:", hasilEmail.pesanError);
    }
  };

  // ==========================================
  // HANDLERS EXPORT EXCEL (TERPISAH)
  // ==========================================
  const handleExportGedung = () => {
    const filtered = dataGedung.filter(req => checkFilter(req, false));
    if (filtered.length === 0) return alert("Data permohonan Gedung masih kosong / tidak ada yang cocok dengan filter!");

    const headers = ["Nama Pemohon", "Departemen/Tenant", "Area Ruangan", "Tanggal Lembur", "Jam Mulai", "Jam Selesai", "Alasan", "Status", "Waktu Pengajuan"];
    const rows = filtered.map(req => {
      const aman = (text: string | undefined) => `"${(text || "-").replace(/"/g, '""')}"`;
      return [
        aman(req.nama_pemohon), aman(req.departemen), aman(req.area_ruangan), aman(req.tanggal),
        aman(req.jam_mulai), aman(req.jam_selesai), aman(req.alasan), aman(req.status), aman(formatJam(req.waktu_request))
      ].join(",");
    });

    unduhCSV("Laporan_Overtime_Gedung", headers, rows);
  };

  const handleExportTim = () => {
    const filtered = dataTim.filter(req => checkFilter(req, true));
    if (filtered.length === 0) return alert("Data permohonan Tim Operasional masih kosong / tidak ada yang cocok dengan filter!");

    const headers = ["ID Request", "Siklus / Periode", "Nama Staf", "Departemen", "Tanggal Lembur", "Lokasi/Tugas", "Jam Mulai", "Jam Selesai", "Detail Alasan", "Status Approval", "Waktu Diajukan"];
    const rows: string[] = [];

    const aman = (text: string | undefined) => `"${(text || "-").replace(/"/g, '""')}"`;

    filtered.forEach(req => {
      const id = aman(req.id);
      const periode = aman(req.periode);
      const nama = aman(req.nama_pemohon);
      const dept = aman(req.departemen);
      const status = aman(req.status);
      const waktu = aman(formatJam(req.waktu_request));

      if (req.items && req.items.length > 0) {
        req.items.forEach(item => {
          rows.push([
            id, periode, nama, dept, aman(item.tanggal), aman(item.area_ruangan),
            aman(item.jam_mulai), aman(item.jam_selesai), aman(item.alasan), status, waktu
          ].join(","));
        });
      }
    });

    unduhCSV("Rekap_Lemburan_Kolektif_Tim", headers, rows);
  };

  const unduhCSV = (namaFile: string, headers: string[], rows: string[]) => {
    const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${namaFile}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatJam = (ts: Timestamp | null | undefined) => ts ? new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  // ==========================================
  // LOGIKA FILTERING
  // ==========================================
  const checkFilter = (req: OvertimeRequest, isTim: boolean) => {
    const safeStatus = req.status || "";
    const matchStatus = filterStatus === "SEMUA" || safeStatus === filterStatus || (filterStatus === "PENDING" && safeStatus.includes("Menunggu"));
    
    const safeNama = (req.nama_pemohon || "").toLowerCase();
    const safeDept = (req.departemen || "").toLowerCase();
    const queryStr = searchQuery.toLowerCase();
    
    let matchSearch = safeNama.includes(queryStr) || safeDept.includes(queryStr);
    if (!isTim) {
      const safeArea = (req.area_ruangan || "").toLowerCase();
      matchSearch = matchSearch || safeArea.includes(queryStr);
    }

    let matchPeriode = true;
    if (isTim && filterPeriode !== "SEMUA") {
      matchPeriode = req.periode === filterPeriode;
    }

    return matchStatus && matchSearch && matchPeriode;
  };

  const currentFilteredData = activeTab === "GEDUNG" 
    ? dataGedung.filter(req => checkFilter(req, false))
    : dataTim.filter(req => checkFilter(req, true));

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px", overflowX: "hidden" }}>
      
      {/* 💡 CSS RESPONSIVE & ANTI-OVERFLOW MAGIC */}
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }
        
        .overtime-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .overtime-table th { padding: 15px; font-weight: bold; }
        .overtime-table td { padding: 15px; vertical-align: top; border-bottom: 1px solid #edf2f7; transition: background 0.2s; word-wrap: break-word; }
        .overtime-table tbody tr:hover td { filter: brightness(0.98); }
        
        .filter-wrapper { display: flex; justify-content: space-between; gap: 15px; flex-wrap: wrap; margin-bottom: 20px; align-items: center; }
        .filter-controls { display: flex; gap: 10px; flex-wrap: wrap; }
        
        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .filter-wrapper { flex-direction: column; align-items: stretch !important; }
          .filter-controls { flex-direction: column; width: 100%; }
          .filter-controls input, .filter-controls select, .filter-wrapper button { width: 100% !important; max-width: 100% !important; }
          
          /* Transformasi Tabel Menjadi Kartu */
          .overtime-table, .overtime-table tbody { display: block; width: 100%; }
          .overtime-table thead { display: none; }
          .overtime-table tr { 
            display: block; width: 100%; margin-bottom: 15px; 
            border: 1px solid #e2e8f0; border-radius: 12px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;
          }
          .overtime-table td { 
            display: block; width: 100%; padding: 15px !important; 
            border-bottom: 1px dashed #edf2f7 !important; 
          }
          .overtime-table td:last-child { border-bottom: none !important; }
          
          /* Tombol Approve/Reject Berjejer Kiri-Kanan di HP */
          .action-btns { display: flex; flex-direction: row !important; width: 100%; gap: 10px; margin-top: 10px; }
          .action-btns button { flex: 1; padding: 12px !important; font-size: 13px !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span className="hide-mobile" style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Control Panel</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 <span className="hide-mobile">Admin:</span> {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)", width: "100%" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PERSETUJUAN OVERTIME</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Validasi kontrol lembur utilitas gedung tenant dan rekap lemburan tim operasional SIBM.</p>
      </div>

      {/* 🔹 MAIN CONTENT */}
      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>
        
        {/* NAVIGASI TAB */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", overflowX: "auto", paddingBottom: "5px" }}>
          <button 
            onClick={() => { setActiveTab("GEDUNG"); setFilterStatus("SEMUA"); setSearchQuery(""); }} 
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "GEDUNG" ? "white" : "rgba(255,255,255,0.8)", color: activeTab === "GEDUNG" ? "#dd6b20" : "#718096", boxShadow: activeTab === "GEDUNG" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "GEDUNG" ? "3px solid #dd6b20" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            🏢 Lembur Gedung (Tenant)
            <span style={{ background: activeTab === "GEDUNG" ? "#fffff0" : "#e2e8f0", color: activeTab === "GEDUNG" ? "#b7791f" : "#4a5568", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>{dataGedung.filter(r=>r.status?.includes("Menunggu")).length} Pending</span>
          </button>
          <button 
            onClick={() => { setActiveTab("TIM"); setFilterStatus("SEMUA"); setSearchQuery(""); setFilterPeriode("SEMUA"); }} 
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "TIM" ? "white" : "rgba(255,255,255,0.8)", color: activeTab === "TIM" ? "#3182ce" : "#718096", boxShadow: activeTab === "TIM" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "TIM" ? "3px solid #3182ce" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            👷‍♂️ Lembur Tim Operasional
            <span style={{ background: activeTab === "TIM" ? "#ebf8ff" : "#e2e8f0", color: activeTab === "TIM" ? "#2b6cb0" : "#4a5568", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>{dataTim.filter(r=>r.status?.includes("Menunggu")).length} Pending</span>
          </button>
        </div>

        <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", width: "100%" }}>
          
          {/* BAR FILTER KONTROL */}
          <div className="filter-wrapper">
            <div className="filter-controls">
              <input 
                type="text" 
                placeholder={activeTab === "GEDUNG" ? "🔍 Cari Pemohon / Tenant / Ruangan..." : "🔍 Cari Nama Staf / Jabatan..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", width: "260px", fontSize: "13px", background: "#f8fafc", outline: "none" }}
              />
              
              {activeTab === "TIM" && (
                <select 
                  value={filterPeriode}
                  onChange={(e) => setFilterPeriode(e.target.value)}
                  style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "13px", background: "#ebf8ff", outline: "none", cursor: "pointer", fontWeight: "bold", color: "#2b6cb0" }}
                >
                  <option value="SEMUA">📅 SEMUA PERIODE SIKLUS</option>
                  {daftarPeriodeUnik.map(per => <option key={per} value={per}>{per}</option>)}
                </select>
              )}

              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "13px", background: "white", outline: "none", cursor: "pointer", fontWeight: "bold", color: "#4a5568" }}
              >
                <option value="SEMUA">📂 SEMUA STATUS</option>
                <option value="PENDING">⏳ MENUNGGU APPROVAL</option>
                <option value="Approved">🟢 DISETUJUI (APPROVED)</option>
                <option value="Rejected">🔴 DITOLAK (REJECTED)</option>
              </select>
            </div>

            <button 
              onClick={activeTab === "GEDUNG" ? handleExportGedung : handleExportTim} 
              style={{ background: "#2f855a", color: "white", padding: "12px 18px", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(47,133,90,0.2)" }}
            >
              <span style={{margin: "0 auto", display: "flex", gap: "8px"}}>📊 {activeTab === "GEDUNG" ? "Export Laporan Gedung" : "Export Rekap Lembur Tim"}</span>
            </button>
          </div>

          {/* TABEL DATA OVERTIME */}
          <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0", width: "100%" }}>
            <table className="overtime-table">
              <thead style={{ background: activeTab === "GEDUNG" ? "#fffff0" : "#ebf8ff", color: activeTab === "GEDUNG" ? "#b7791f" : "#2b6cb0" }}>
                <tr>
                  <th style={{ width: "30%", borderBottom: activeTab === "GEDUNG" ? "2px solid #fefcbf" : "2px solid #bee3f8" }}>Info Pemohon</th>
                  <th style={{ width: "45%", borderBottom: activeTab === "GEDUNG" ? "2px solid #fefcbf" : "2px solid #bee3f8" }}>{activeTab === "GEDUNG" ? "Area & Waktu Pemakaian" : "Daftar Klaim Tanggal & Pekerjaan"}</th>
                  <th style={{ width: "25%", textAlign: "center", borderBottom: activeTab === "GEDUNG" ? "2px solid #fefcbf" : "2px solid #bee3f8" }}>Status Keputusan</th>
                </tr>
              </thead>
              <tbody>
                {currentFilteredData.length > 0 ? currentFilteredData.map((req) => {
                  const safeStatus = req.status || "";
                  const isApproved = safeStatus === "Approved";
                  const isRejected = safeStatus === "Rejected";
                  const isPending = !isApproved && !isRejected;

                  return (
                    <tr key={req.id} style={{ background: isPending ? "white" : "#f8fafc" }}>
                      
                      {/* KOLOM PEMOHON */}
                      <td>
                        <div style={{ fontWeight: "900", color: "#1a202c", fontSize: "15px" }}>{req.nama_pemohon || "-"}</div>
                        <div style={{ fontSize: "11px", color: activeTab === "GEDUNG" ? "#dd6b20" : "#3182ce", marginTop: "4px", background: activeTab === "GEDUNG" ? "#fffff0" : "#ebf8ff", padding: "4px 8px", borderRadius: "6px", display: "inline-block", fontWeight: "bold", border: `1px solid ${activeTab === "GEDUNG" ? "#fefcbf" : "#bee3f8"}` }}>
                          🏢 {req.departemen || "-"}
                        </div>
                        {req.periode && (
                          <div style={{ fontSize: "11px", color: "#4a5568", marginTop: "8px", fontWeight: "bold", borderLeft: "2px solid #cbd5e0", paddingLeft: "5px" }}>
                            Siklus: {req.periode}
                          </div>
                        )}
                        <div style={{ fontSize: "10px", color: "#a0aec0", marginTop: "6px" }}>
                          Diajukan: {formatJam(req.waktu_request)}
                        </div>
                      </td>

                      {/* KOLOM DETAIL LEMBUR */}
                      <td>
                        {/* Jika Data Kolektif (Tim) */}
                        {activeTab === "TIM" && req.items && req.items.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div style={{ fontSize: "11px", fontWeight: "bold", color: "#718096" }}>Mengajukan {req.items.length} Hari Lembur:</div>
                            {req.items.map((item, idx) => (
                              <div key={idx} style={{ background: "white", border: "1px solid #e2e8f0", padding: "10px", borderRadius: "8px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                  <span style={{ fontWeight: "bold", color: "#3182ce", fontSize: "12px" }}>
                                    📅 {item.tanggal ? new Date(item.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-"}
                                  </span>
                                  <span style={{ fontWeight: "900", color: "#2d3748", fontSize: "12px" }}>
                                    🕒 {item.jam_mulai || "-"} s/d {item.jam_selesai || "-"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "12px", color: "#4a5568", fontWeight: "bold" }}>📍 {item.area_ruangan || "-"}</div>
                                <div style={{ fontSize: "12px", color: "#718096", fontStyle: "italic", marginTop: "4px" }}>&quot;{item.alasan || "-"}&quot;</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* Jika Data Satuan (Gedung) */
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div style={{ fontWeight: "bold", color: "#2d3748" }}>📍 {req.area_ruangan || "-"}</div>
                            <div style={{ fontSize: "12px", color: "#dd6b20", fontWeight: "bold" }}>
                              📅 {req.tanggal ? new Date(req.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-"} | 🕒 {req.jam_mulai || "-"} - {req.jam_selesai || "-"}
                            </div>
                            <div style={{ fontSize: "12px", color: "#718096", fontStyle: "italic", marginTop: "4px", background: "white", padding: "8px", borderRadius: "6px", border: "1px dashed #cbd5e0" }}>
                              &quot;{req.alasan || "-"}&quot;
                            </div>
                          </div>
                        )}
                      </td>

                      {/* KOLOM STATUS & AKSI */}
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", padding: "6px 12px", borderRadius: "8px", fontWeight: "900", background: isApproved ? "#c6f6d5" : isRejected ? "#fed7d7" : "#feebc8", color: isApproved ? "#22543d" : isRejected ? "#9b2c2c" : "#9c4221", whiteSpace: "nowrap", border: `1px solid ${isApproved ? "#9ae6b4" : isRejected ? "#feb2b2" : "#fbd38d"}` }}>
                            {isPending ? "MENUNGGU APPROVAL" : safeStatus.toUpperCase()}
                          </span>
                          
                          {isPending && (
                            <div className="action-btns" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", marginTop: "5px" }}>
                              <button 
                                onClick={() => handleProcessDecision(req.id, req.nama_pemohon || "", "Approved")}
                                disabled={sedangKirimNotif === req.id}
                                style={{ padding: "8px 16px", background: sedangKirimNotif === req.id ? "#a0aec0" : "#38a169", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: sedangKirimNotif === req.id ? "not-allowed" : "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}
                              >
                                {sedangKirimNotif === req.id ? "Mengirim notifikasi..." : "Setujui ✓"}
                              </button>
                              <button 
                                onClick={() => handleProcessDecision(req.id, req.nama_pemohon || "", "Rejected")}
                                disabled={sedangKirimNotif === req.id}
                                style={{ padding: "8px 12px", background: "white", color: "#e53e3e", border: "1px solid #fed7d7", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: sedangKirimNotif === req.id ? "not-allowed" : "pointer", transition: "0.2s" }}
                              >
                                Tolak ✖
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", padding: "60px 20px", color: "#a0aec0" }}>
                      <div style={{ fontSize: "40px", marginBottom: "10px" }}>{activeTab === "GEDUNG" ? "🏢" : "👷‍♂️"}</div>
                      <div style={{ fontSize: "16px", fontWeight: "bold", color: "#718096" }}>Data Kosong</div>
                      <div>Tidak ada permohonan lembur yang ditemukan di tab ini.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>
    </div>
  );
}