"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { kirimWA, kirimEmail, template } from "../../../lib/notify";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

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
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px", overflowX: "hidden" }}>
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

      {/* 💡 CSS RESPONSIVE & ANTI-OVERFLOW MAGIC */}
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }

        .overtime-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .overtime-table th { padding: 15px; font-weight: bold; }
        .overtime-table td { padding: 15px; vertical-align: top; border-bottom: 1px solid var(--line); transition: background 0.2s; word-wrap: break-word; }
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
            border: 1px solid var(--line); border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;
          }
          .overtime-table td {
            display: block; width: 100%; padding: 15px !important;
            border-bottom: 1px dashed var(--line) !important;
          }
          .overtime-table td:last-child { border-bottom: none !important; }
          
          /* Tombol Approve/Reject Berjejer Kiri-Kanan di HP */
          .action-btns { display: flex; flex-direction: row !important; width: 100%; gap: 10px; margin-top: 10px; }
          .action-btns button { flex: 1; padding: 12px !important; font-size: 13px !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PERSETUJUAN OVERTIME</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Validasi kontrol lembur utilitas gedung tenant dan rekap lemburan tim operasional SIBM.</p>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT */}
      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>
        
        {/* NAVIGASI TAB */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", overflowX: "auto", paddingBottom: "5px" }}>
          <button
            onClick={() => { setActiveTab("GEDUNG"); setFilterStatus("SEMUA"); setSearchQuery(""); }}
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "GEDUNG" ? "var(--surface)" : "rgba(255,255,255,0.8)", color: activeTab === "GEDUNG" ? "var(--warn)" : "var(--muted)", boxShadow: activeTab === "GEDUNG" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "GEDUNG" ? "3px solid var(--warn)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            🏢 Lembur Gedung (Tenant)
            <span style={{ background: activeTab === "GEDUNG" ? "var(--warn-50)" : "var(--line)", color: activeTab === "GEDUNG" ? "var(--warn)" : "var(--ink-soft)", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>{dataGedung.filter(r=>r.status?.includes("Menunggu")).length} Pending</span>
          </button>
          <button
            onClick={() => { setActiveTab("TIM"); setFilterStatus("SEMUA"); setSearchQuery(""); setFilterPeriode("SEMUA"); }}
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "TIM" ? "var(--surface)" : "rgba(255,255,255,0.8)", color: activeTab === "TIM" ? "var(--info)" : "var(--muted)", boxShadow: activeTab === "TIM" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "TIM" ? "3px solid var(--info)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            👷‍♂️ Lembur Tim Operasional
            <span style={{ background: activeTab === "TIM" ? "var(--info-50)" : "var(--line)", color: activeTab === "TIM" ? "var(--info)" : "var(--ink-soft)", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>{dataTim.filter(r=>r.status?.includes("Menunggu")).length} Pending</span>
          </button>
        </div>

        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", width: "100%" }}>
          
          {/* BAR FILTER KONTROL */}
          <div className="filter-wrapper">
            <div className="filter-controls">
              <input 
                type="text" 
                placeholder={activeTab === "GEDUNG" ? "🔍 Cari Pemohon / Tenant / Ruangan..." : "🔍 Cari Nama Staf / Jabatan..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--line)", width: "260px", fontSize: "13px", background: "var(--bg)", outline: "none" }}
              />

              {activeTab === "TIM" && (
                <select
                  value={filterPeriode}
                  onChange={(e) => setFilterPeriode(e.target.value)}
                  style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--info-50)", outline: "none", cursor: "pointer", fontWeight: "bold", color: "var(--info)" }}
                >
                  <option value="SEMUA">📅 SEMUA PERIODE SIKLUS</option>
                  {daftarPeriodeUnik.map(per => <option key={per} value={per}>{per}</option>)}
                </select>
              )}

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--surface)", outline: "none", cursor: "pointer", fontWeight: "bold", color: "var(--ink-soft)" }}
              >
                <option value="SEMUA">📂 SEMUA STATUS</option>
                <option value="PENDING">⏳ MENUNGGU APPROVAL</option>
                <option value="Approved">🟢 DISETUJUI (APPROVED)</option>
                <option value="Rejected">🔴 DITOLAK (REJECTED)</option>
              </select>
            </div>

            <button
              onClick={activeTab === "GEDUNG" ? handleExportGedung : handleExportTim}
              style={{ background: "var(--ok)", color: "white", padding: "12px 18px", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(22,163,74,0.2)" }}
            >
              <span style={{margin: "0 auto", display: "flex", gap: "8px"}}>📊 {activeTab === "GEDUNG" ? "Export Laporan Gedung" : "Export Rekap Lembur Tim"}</span>
            </button>
          </div>

          {/* TABEL DATA OVERTIME */}
          <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
            <table className="overtime-table">
              <thead style={{ background: activeTab === "GEDUNG" ? "var(--warn-50)" : "var(--info-50)", color: activeTab === "GEDUNG" ? "var(--warn)" : "var(--info)" }}>
                <tr>
                  <th style={{ width: "30%", borderBottom: activeTab === "GEDUNG" ? "2px solid var(--warn)" : "2px solid var(--info)" }}>Info Pemohon</th>
                  <th style={{ width: "45%", borderBottom: activeTab === "GEDUNG" ? "2px solid var(--warn)" : "2px solid var(--info)" }}>{activeTab === "GEDUNG" ? "Area & Waktu Pemakaian" : "Daftar Klaim Tanggal & Pekerjaan"}</th>
                  <th style={{ width: "25%", textAlign: "center", borderBottom: activeTab === "GEDUNG" ? "2px solid var(--warn)" : "2px solid var(--info)" }}>Status Keputusan</th>
                </tr>
              </thead>
              <tbody>
                {currentFilteredData.length > 0 ? currentFilteredData.map((req) => {
                  const safeStatus = req.status || "";
                  const isApproved = safeStatus === "Approved";
                  const isRejected = safeStatus === "Rejected";
                  const isPending = !isApproved && !isRejected;

                  return (
                    <tr key={req.id} style={{ background: isPending ? "var(--surface)" : "var(--bg)" }}>

                      {/* KOLOM PEMOHON */}
                      <td>
                        <div style={{ fontWeight: "900", color: "var(--ink)", fontSize: "15px" }}>{req.nama_pemohon || "-"}</div>
                        <div style={{ fontSize: "11px", color: activeTab === "GEDUNG" ? "var(--warn)" : "var(--info)", marginTop: "4px", background: activeTab === "GEDUNG" ? "var(--warn-50)" : "var(--info-50)", padding: "4px 8px", borderRadius: "6px", display: "inline-block", fontWeight: "bold", border: `1px solid ${activeTab === "GEDUNG" ? "var(--warn)" : "var(--info)"}` }}>
                          🏢 {req.departemen || "-"}
                        </div>
                        {req.periode && (
                          <div style={{ fontSize: "11px", color: "var(--ink-soft)", marginTop: "8px", fontWeight: "bold", borderLeft: "2px solid var(--line)", paddingLeft: "5px" }}>
                            Siklus: {req.periode}
                          </div>
                        )}
                        <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "6px" }}>
                          Diajukan: {formatJam(req.waktu_request)}
                        </div>
                      </td>

                      {/* KOLOM DETAIL LEMBUR */}
                      <td>
                        {/* Jika Data Kolektif (Tim) */}
                        {activeTab === "TIM" && req.items && req.items.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--muted)" }}>Mengajukan {req.items.length} Hari Lembur:</div>
                            {req.items.map((item, idx) => (
                              <div key={idx} style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px", borderRadius: "8px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                  <span style={{ fontWeight: "bold", color: "var(--info)", fontSize: "12px" }}>
                                    📅 {item.tanggal ? new Date(item.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-"}
                                  </span>
                                  <span style={{ fontWeight: "900", color: "var(--ink)", fontSize: "12px" }}>
                                    🕒 {item.jam_mulai || "-"} s/d {item.jam_selesai || "-"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "12px", color: "var(--ink-soft)", fontWeight: "bold" }}>📍 {item.area_ruangan || "-"}</div>
                                <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic", marginTop: "4px" }}>&quot;{item.alasan || "-"}&quot;</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* Jika Data Satuan (Gedung) */
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div style={{ fontWeight: "bold", color: "var(--ink)" }}>📍 {req.area_ruangan || "-"}</div>
                            <div style={{ fontSize: "12px", color: "var(--warn)", fontWeight: "bold" }}>
                              📅 {req.tanggal ? new Date(req.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-"} | 🕒 {req.jam_mulai || "-"} - {req.jam_selesai || "-"}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic", marginTop: "4px", background: "var(--surface)", padding: "8px", borderRadius: "6px", border: "1px dashed var(--line)" }}>
                              &quot;{req.alasan || "-"}&quot;
                            </div>
                          </div>
                        )}
                      </td>

                      {/* KOLOM STATUS & AKSI */}
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", padding: "6px 12px", borderRadius: "8px", fontWeight: "900", background: isApproved ? "var(--ok-50)" : isRejected ? "var(--red-50)" : "var(--warn-50)", color: isApproved ? "var(--ok)" : isRejected ? "var(--red-700)" : "var(--warn)", whiteSpace: "nowrap", border: `1px solid ${isApproved ? "var(--ok)" : isRejected ? "var(--red-500)" : "var(--warn)"}` }}>
                            {isPending ? "MENUNGGU APPROVAL" : safeStatus.toUpperCase()}
                          </span>

                          {isPending && (
                            <div className="action-btns" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", marginTop: "5px" }}>
                              <button
                                onClick={() => handleProcessDecision(req.id, req.nama_pemohon || "", "Approved")}
                                disabled={sedangKirimNotif === req.id}
                                style={{ padding: "8px 16px", background: sedangKirimNotif === req.id ? "var(--muted)" : "var(--ok)", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: sedangKirimNotif === req.id ? "not-allowed" : "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}
                              >
                                {sedangKirimNotif === req.id ? "Mengirim notifikasi..." : "Setujui ✓"}
                              </button>
                              <button
                                onClick={() => handleProcessDecision(req.id, req.nama_pemohon || "", "Rejected")}
                                disabled={sedangKirimNotif === req.id}
                                style={{ padding: "8px 12px", background: "var(--surface)", color: "var(--red-600)", border: "1px solid var(--red-50)", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: sedangKirimNotif === req.id ? "not-allowed" : "pointer", transition: "0.2s" }}
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
                    <td colSpan={3} style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
                      <div style={{ fontSize: "40px", marginBottom: "10px" }}>{activeTab === "GEDUNG" ? "🏢" : "👷‍♂️"}</div>
                      <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--muted)" }}>Data Kosong</div>
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