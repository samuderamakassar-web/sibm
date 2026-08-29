"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, getDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

// --- INTERFACES ---
interface TitikPatroli {
  id: string;
  waktu_patroli: string;
  kondisi: string;
  foto?: string;
}

interface AreaTerlewat {
  id: string;
  nama: string;
  alasan: string;
}

interface PatroliLog {
  id: string;
  petugas: string;
  waktu_laporan: Timestamp | null;
  status: string;
  catatan_shift: string;
  titik_patroli: TitikPatroli[];
  area_terlewat?: AreaTerlewat[];
}

interface VisitorLog {
  id: string;
  nama: string;
  jenis: string;
  instansi_dept: string;
  tujuan: string;
  bertemu_dengan?: string;
  status: string;
  waktu_masuk: Timestamp | null;
  waktu_keluar: Timestamp | null;
  pic_bertugas: string;
}

interface PackageLog {
  id: string;
  jenis_barang: string;
  penerima: string;
  kurir: string;
  status: string;
  waktu_diterima: Timestamp | null;
  waktu_diambil: Timestamp | null;
  foto_bukti_url: string;
}

export default function MonitorSecurityPage() {
  const router = useRouter();
  
  const [adminName, setAdminName] = useState("Admin");
  const [activeTab, setActiveTab] = useState<"PATROLI" | "TAMU" | "PAKET" | "ROSTER">("PATROLI");
  const [searchQuery, setSearchQuery] = useState("");

  const [patrols, setPatrols] = useState<PatroliLog[]>([]);
  const [visitors, setVisitors] = useState<VisitorLog[]>([]);
  const [packages, setPackages] = useState<PackageLog[]>([]);
  
  const [rosterData, setRosterData] = useState<Record<string, Record<string, string>>>({});
  const [rosterBulan, setRosterBulan] = useState("");
  const [timSecurity, setTimSecurity] = useState<string[]>([]);
  const [detailPatroli, setDetailPatroli] = useState<PatroliLog | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");
    
    if (!role || (!role.includes("Admin") && !role.includes("Koordinator"))) {
      alert("Akses Ditolak! Halaman ini khusus Administrator.");
      router.push("/");
      return;
    }
    setTimeout(() => {
      setAdminName(nama || "Admin");
      setIsReady(true);
    }, 0);

    const unsubPatrol = onSnapshot(query(collection(db, "security_patrols"), orderBy("waktu_laporan", "desc")), (snap) => {
      setPatrols(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as PatroliLog[]);
    });

    const unsubVisitor = onSnapshot(query(collection(db, "security_visitor_logs"), orderBy("waktu_masuk", "desc")), (snap) => {
      setVisitors(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as VisitorLog[]);
    });

    const unsubPackage = onSnapshot(query(collection(db, "packages"), orderBy("waktu_diterima", "desc")), (snap) => {
      setPackages(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as PackageLog[]);
    });

    const fetchRoster = async () => {
      try {
        const today = new Date();
        let bulanAwal = today.getMonth() + 1; // 1-12
        let tahunAwal = today.getFullYear();
        if (today.getDate() < 11) {
          bulanAwal -= 1;
          if (bulanAwal === 0) { bulanAwal = 12; tahunAwal -= 1; }
        }

        const docBulan1 = `${tahunAwal}-${String(bulanAwal).padStart(2, "0")}`;
        const tglSelesai = new Date(tahunAwal, bulanAwal, 10);
        const docBulan2 = `${tglSelesai.getFullYear()}-${String(tglSelesai.getMonth() + 1).padStart(2, "0")}`;

        const dataSaves: Record<string, Record<string, string>> = {};

        const snap1 = await getDoc(doc(db, "security_monthly_schedules", docBulan1));
        if (snap1.exists()) Object.assign(dataSaves, snap1.data().data_hari || {});

        const snap2 = await getDoc(doc(db, "security_monthly_schedules", docBulan2));
        if (snap2.exists()) Object.assign(dataSaves, snap2.data().data_hari || {});

        setRosterData(dataSaves);

        const tglMulai = new Date(tahunAwal, bulanAwal - 1, 11);
        const labelAwal = tglMulai.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
        const labelAkhir = tglSelesai.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
        setRosterBulan(`${labelAwal} - ${labelAkhir}`);

        const staff = new Set<string>();
        Object.values(dataSaves).forEach(d => Object.keys(d).forEach(n => staff.add(n)));
        setTimSecurity(Array.from(staff).sort());
      } catch (e) { console.error(e); }
    };
    fetchRoster();

    return () => { unsubPatrol(); unsubVisitor(); unsubPackage(); };
  }, [router]);

  const formatWaktu = (ts: Timestamp | string | null) => {
    if (!ts) return "-";
    const d = (ts as Timestamp).toDate ? (ts as Timestamp).toDate() : new Date(ts as string);
    return d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const fPatrols = patrols.filter(p => p.petugas?.toLowerCase().includes(searchQuery.toLowerCase()));
  const fVisitors = visitors.filter(v => v.nama?.toLowerCase().includes(searchQuery.toLowerCase()) || v.instansi_dept?.toLowerCase().includes(searchQuery.toLowerCase()));
  const fPackages = packages.filter(p => p.penerima?.toLowerCase().includes(searchQuery.toLowerCase()) || p.kurir?.toLowerCase().includes(searchQuery.toLowerCase()));

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
        
        .tab-buttons { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 5px; scrollbar-width: none; -ms-overflow-style: none; }
        .tab-buttons::-webkit-scrollbar { display: none; }
        .tab-btn { flex-shrink: 0; padding: 12px 20px; border-radius: 12px; font-weight: bold; border: none; cursor: pointer; transition: all 0.2s; box-shadow: none; }
        
        /* Table Styles Desktop */
        .sec-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .sec-table th { padding: 15px; font-weight: bold; background: var(--bg); color: var(--ink-soft); border-bottom: 2px solid var(--line); }
        .sec-table td { padding: 15px; vertical-align: middle; border-bottom: 1px solid var(--line); word-wrap: break-word; }

        /* Detail Modal Grid */
        .grid-foto { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .header-title-container { flex-direction: column; align-items: stretch !important; gap: 15px; }
          .search-input-wrapper { width: 100% !important; margin-top: 10px; }
          .search-input-wrapper input { width: 100% !important; max-width: 100% !important; }
          
          /* Transformasi Tabel ke Card */
          .sec-table, .sec-table tbody { display: block; width: 100%; }
          .sec-table thead { display: none; }
          .sec-table tr { 
            display: block; width: 100%; margin-bottom: 15px; 
            border: 1px solid var(--line); border-radius: 12px; 
            background: var(--surface); box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;
          }
          .sec-table td { 
            display: block; width: 100%; padding: 15px !important; 
            border-bottom: 1px dashed var(--line) !important; text-align: left !important;
          }
          .sec-table td:last-child { border-bottom: none !important; }
          
          /* Roster Table Specific Scroll */
          .roster-wrapper { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .roster-table { width: 100%; min-width: 600px; display: table !important; }
          .roster-table thead { display: table-header-group !important; }
          .roster-table tr { display: table-row !important; border: none; box-shadow: none; border-bottom: 1px solid var(--line); }
          .roster-table td, .roster-table th { display: table-cell !important; padding: 10px !important; border-bottom: 1px solid var(--line) !important; text-align: center !important;}
          .roster-table th:first-child, .roster-table td:first-child { position: sticky; left: 0; background: var(--surface); z-index: 5; border-right: 1px solid var(--line); }
          .roster-table th:first-child { z-index: 6; background: var(--bg); }

          /* Modal Grid */
          .grid-foto { grid-template-columns: 1fr; }
        }
      `}} />

      {/* 🔹 NAVBAR */}
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> <span className="hide-mobile">Kembali ke Control Panel</span>
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> <span className="hide-mobile">Admin:</span> {adminName}
        </div>
      </div>

      {/* 🔹 HERO */}
      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PANTAU KINERJA SECURITY</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Pengawasan lalu lintas aset, tamu, patroli, dan jadwal regu</p>
        </div>
      </div>

      {/* 🔹 KONTEN UTAMA */}
      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>
        
        {/* TABS */}
        <div className="tab-buttons" style={{ marginBottom: "20px" }}>
          {[
            { id: "PATROLI", label: "🚨 Log Patroli", color: "var(--red-600)" },
            { id: "TAMU", label: "📋 Buku Tamu", color: "var(--info)" },
            { id: "PAKET", label: "📦 Log Paket", color: "var(--warn)" },
            { id: "ROSTER", label: "📅 Roster Danru", color: "var(--accent)" }
          ].map(tab => (
            <button 
              key={tab.id} 
              className="tab-btn"
              onClick={() => { setActiveTab(tab.id as "PATROLI" | "TAMU" | "PAKET" | "ROSTER"); setSearchQuery(""); }}
              style={{ background: activeTab === tab.id ? "var(--surface)" : "rgba(255,255,255,0.8)", color: activeTab === tab.id ? tab.color : "var(--muted)", borderBottom: activeTab === tab.id ? `3px solid ${tab.color}` : "3px solid transparent" }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", width: "100%" }}>
          
          {activeTab !== "ROSTER" && (
            <div className="header-title-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>
                {activeTab === "PATROLI" ? "Laporan Patroli Keliling" : activeTab === "TAMU" ? "Catatan Akses Keluar/Masuk" : "Penerimaan Paket & Dokumen"}
              </h2>
              <div className="search-input-wrapper" style={{ position: "relative", width: "260px" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input type="text" placeholder="Pencarian spesifik..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "100%", background: "var(--bg)", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
          )}

          {/* TAB 1: PATROLI */}
          {activeTab === "PATROLI" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
              <table className="sec-table">
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Waktu Laporan</th>
                    <th style={{ width: "25%" }}>Petugas Patroli</th>
                    <th style={{ width: "20%" }}>Total Titik Di-Scan</th>
                    <th style={{ width: "20%" }}>Lantai Dipatroli</th>
                    <th style={{ width: "20%", textAlign: "center" }}>Status Keliling</th>
                    <th style={{ width: "15%", textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {fPatrols.length > 0 ? fPatrols.map(p => (
                    <tr key={p.id}>
                      <td style={{ color: "var(--muted)" }}>{formatWaktu(p.waktu_laporan)}</td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--red-600)" }}>👮 {p.petugas}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{p.titik_patroli?.length || 0} Titik Terpantau</div>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "var(--ink)" }}>
                          {Array.from(new Set((p.titik_patroli || []).map((t) => t.id.split("::")[0]))).join(", ") || "-"}
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ background: p.status.includes("Sempurna") ? "var(--ok-50)" : "var(--warn-50)", color: p.status.includes("Sempurna") ? "var(--ok)" : "var(--warn)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", display: "inline-block" }}>{p.status}</span>
                        {p.area_terlewat && p.area_terlewat.length > 0 && (
                          <div style={{ fontSize: "10px", color: "var(--red-700)", marginTop: "4px" }}>{p.area_terlewat.length} area terlewat</div>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button onClick={() => setDetailPatroli(p)} style={{ background: "var(--info-50)", color: "var(--info)", border: "1px solid var(--info)", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold", width: "100%" }}>
                          📸 Lihat Laporan
                        </button>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada log patroli yang cocok dengan pencarian.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: TAMU */}
          {activeTab === "TAMU" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
              <table className="sec-table">
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Identitas</th>
                    <th style={{ width: "30%" }}>Asal & Tujuan</th>
                    <th style={{ width: "25%", textAlign: "center" }}>Status & Waktu</th>
                    <th style={{ width: "15%" }}>PIC Security</th>
                  </tr>
                </thead>
                <tbody>
                  {fVisitors.length > 0 ? fVisitors.map(v => (
                    <tr key={v.id}>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--info)", fontSize: "14px" }}>{v.nama}</div>
                        <span style={{ fontSize: "10px", background: v.jenis === "Karyawan" ? "var(--bg)" : "var(--red-50)", color: v.jenis === "Karyawan" ? "var(--ink-soft)" : "var(--red-700)", padding: "2px 6px", borderRadius: "4px", display: "inline-block", marginTop: "4px" }}>{v.jenis}</span>
                      </td>
                      <td>
                        <div style={{ color: "var(--ink-soft)" }}>🏢 {v.instansi_dept}</div>
                        {v.jenis !== "Karyawan" && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>🤝 Host: {v.bertemu_dengan}</div>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ background: v.status.includes("Dalam") ? "var(--ok-50)" : "var(--line)", color: v.status.includes("Dalam") ? "var(--ok)" : "var(--ink-soft)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", marginBottom: "6px", display: "inline-block" }}>{v.status}</div>
                        <div style={{ fontSize: "11px", color: "var(--ok)", fontWeight: "bold" }}>In: {formatWaktu(v.waktu_masuk)}</div>
                        <div style={{ fontSize: "11px", color: "var(--red-600)", fontWeight: "bold" }}>Out: {formatWaktu(v.waktu_keluar)}</div>
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "12px", fontWeight: "bold" }}>👮 {v.pic_bertugas}</td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada log akses masuk.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: PAKET */}
          {activeTab === "PAKET" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
              <table className="sec-table">
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Jenis Barang</th>
                    <th style={{ width: "30%" }}>Penerima & Kurir</th>
                    <th style={{ width: "25%" }}>Waktu Diterima Pos</th>
                    <th style={{ width: "25%", textAlign: "center" }}>Status Pengambilan</th>
                  </tr>
                </thead>
                <tbody>
                  {fPackages.length > 0 ? fPackages.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{p.jenis_barang}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--info)" }}>{p.penerima}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>Kurir: {p.kurir}</div>
                      </td>
                      <td>
                        <div style={{ color: "var(--ink-soft)", fontSize: "12px" }}>{formatWaktu(p.waktu_diterima)}</div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ background: p.status === "Belum Diambil" ? "var(--warn-50)" : "var(--ok-50)", color: p.status === "Belum Diambil" ? "var(--warn)" : "var(--ok)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", marginBottom: "6px", display: "inline-block" }}>{p.status}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "bold" }}>{p.status !== "Belum Diambil" ? formatWaktu(p.waktu_diambil) : "-"}</div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada resi paket.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: ROSTER */}
          {activeTab === "ROSTER" && (
            <div>
              <h2 style={{ margin: "0 0 20px 0", color: "var(--ink)", fontSize: "18px" }}>📅 Roster Danru Security <span style={{ background: "var(--info-50)", color: "var(--info)", padding: "4px 10px", borderRadius: "8px", fontSize: "12px" }}>{rosterBulan || "Belum Diterbitkan"}</span></h2>
              {Object.keys(rosterData).length > 0 ? (
                <div className="roster-wrapper" style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
                  <table className="roster-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                        <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "left" }}>Tanggal</th>
                        {timSecurity.map(staf => <th key={staf} style={{ padding: "15px", borderBottom: "2px solid var(--line)", minWidth: "100px" }}>{staf}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(rosterData).sort().map(tglKey => {
                        const isHariIni = tglKey === new Date().toISOString().split("T")[0];
                        return (
                          <tr key={tglKey} style={{ background: isHariIni ? "var(--red-50)" : "var(--surface)", borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: "12px 15px", textAlign: "left", fontWeight: isHariIni ? "900" : "bold", color: isHariIni ? "var(--red-700)" : "var(--muted)" }}>
                              {tglKey.split("-")[2]} {isHariIni && <span style={{ fontSize: "9px", background: "var(--red-600)", color: "white", padding: "2px 6px", borderRadius: "4px", display: "block", width: "fit-content", marginTop: "2px" }}>HARI INI</span>}
                            </td>
                            {timSecurity.map(staf => {
                              const shift = rosterData[tglKey][staf] || "-";
                              const isOff = shift.toLowerCase().includes("off");
                              return <td key={staf} style={{ padding: "12px", color: isOff ? "var(--red-600)" : "var(--info)", fontWeight: isOff ? "normal" : "bold" }}>{shift}</td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px" }}>Danru belum menerbitkan roster bulanan.</div>}
            </div>
          )}

        </div>
      </div>

      {/* 🔹 MODAL DETAIL PATROLI */}
      {detailPatroli && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "15px", backdropFilter: "blur(5px)" }}>
          <div style={{ background: "var(--surface)", padding: "0", borderRadius: "20px", width: "100%", maxWidth: "800px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            
            {/* Header Modal */}
            <div style={{ background: "var(--ink)", color: "white", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: "0 0 5px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}><span>📸</span> Laporan Titik Patroli</h2>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Oleh {detailPatroli.petugas} - {formatWaktu(detailPatroli.waktu_laporan)}</div>
              </div>
              <button onClick={() => setDetailPatroli(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", color: "white", fontSize: "16px" }}>✖</button>
            </div>
            
            <div style={{ padding: "20px", overflowY: "auto", flex: 1, background: "var(--bg)" }}>
              <div style={{ background: "var(--info-50)", padding: "15px", borderRadius: "12px", marginBottom: "20px", border: "1px solid var(--info)", color: "var(--info)", fontSize: "13px", lineHeight: "1.5" }}>
                <strong>Catatan Shift:</strong> <br/><i style={{ color: "var(--info)" }}>&quot;{detailPatroli.catatan_shift || "Tidak ada catatan khusus dari petugas."}&quot;</i>
              </div>

              {/* Grid Foto Titik */}
              <div className="grid-foto">
                {detailPatroli.titik_patroli?.map((t, i) => {
                  const isAman = t.kondisi.includes("Aman");
                  return (
                    <div key={i} style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--line)", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                      <div style={{ position: "relative" }}>
                        {t.foto ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={t.foto} alt="Titik Patroli" style={{ width: "100%", height: "200px", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "200px", background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", color: "var(--muted)", fontSize: "12px", fontStyle: "italic" }}>Tanpa Foto</div>
                        )}
                        <div style={{ position: "absolute", bottom: "10px", right: "10px", background: "rgba(0,0,0,0.7)", color: "white", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold" }}>{t.waktu_patroli}</div>
                      </div>
                      
                      <div style={{ padding: "15px" }}>
                        <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: "bold", textTransform: "uppercase" }}>{t.id.split("::")[0]}</div>
                        <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "13px", margin: "4px 0 10px 0", lineHeight: "1.3" }}>{t.id.split("::")[1]}</div>
                        <span style={{ fontSize: "11px", background: isAman ? "var(--ok-50)" : "var(--red-50)", color: isAman ? "var(--ok)" : "var(--red-700)", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", display: "inline-block" }}>
                          {t.kondisi}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {detailPatroli.area_terlewat && detailPatroli.area_terlewat.length > 0 && (
                  <div style={{ marginTop: "20px", background: "var(--red-50)", border: "1px solid var(--red-500)", borderRadius: "12px", padding: "15px" }}>
                    <h3 style={{ margin: "0 0 10px 0", color: "var(--red-700)", fontSize: "14px" }}>⚠️ {detailPatroli.area_terlewat.length} Area Tidak Difoto</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {detailPatroli.area_terlewat.map((a, i) => (
                        <div key={i} style={{ background: "var(--surface)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--red-500)" }}>
                          <div style={{ fontSize: "11px", color: "var(--red-700)", fontWeight: "bold" }}>{a.id.split("::")[0]} — {a.nama}</div>
                          <div style={{ fontSize: "12px", color: "var(--ink-soft)", marginTop: "4px" }}><i>&quot;{a.alasan || "Tidak ada alasan dicantumkan"}&quot;</i></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}