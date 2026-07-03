"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, getDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

// --- INTERFACES ---
interface TitikPatroli {
  id: string;
  waktu_patroli: string;
  kondisi: string;
  foto?: string;
}

interface PatroliLog {
  id: string;
  petugas: string;
  waktu_laporan: Timestamp | null;
  status: string;
  catatan_shift: string;
  titik_patroli: TitikPatroli[];
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
        const metaSnap = await getDoc(doc(db, "security_schedules", "active_meta"));
        if (metaSnap.exists()) {
          const docId = metaSnap.data().current_doc_id;
          const mSnap = await getDoc(doc(db, "security_monthly_schedules", docId));
          if (mSnap.exists()) {
            const data = mSnap.data();
            setRosterBulan(data.nama_bulan_id || "");
            const dataHari = (data.data_hari || {}) as Record<string, Record<string, string>>;
            setRosterData(dataHari);
            
            const staff = new Set<string>();
            Object.values(dataHari).forEach(d => Object.keys(d).forEach(n => staff.add(n)));
            setTimSecurity(Array.from(staff).sort());
          }
        }
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
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px", overflowX: "hidden" }}>
      
      {/* 💡 CSS RESPONSIVE & ANTI-OVERFLOW MAGIC */}
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }
        
        .tab-buttons { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 5px; scrollbar-width: none; -ms-overflow-style: none; }
        .tab-buttons::-webkit-scrollbar { display: none; }
        .tab-btn { flex-shrink: 0; padding: 12px 20px; border-radius: 12px; font-weight: bold; border: none; cursor: pointer; transition: all 0.2s; box-shadow: none; }
        
        /* Table Styles Desktop */
        .sec-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .sec-table th { padding: 15px; font-weight: bold; background: #f8fafc; color: #4a5568; border-bottom: 2px solid #e2e8f0; }
        .sec-table td { padding: 15px; vertical-align: middle; border-bottom: 1px solid #edf2f7; word-wrap: break-word; }

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
            border: 1px solid #e2e8f0; border-radius: 12px; 
            background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;
          }
          .sec-table td { 
            display: block; width: 100%; padding: 15px !important; 
            border-bottom: 1px dashed #edf2f7 !important; text-align: left !important;
          }
          .sec-table td:last-child { border-bottom: none !important; }
          
          /* Roster Table Specific Scroll */
          .roster-wrapper { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .roster-table { width: 100%; min-width: 600px; display: table !important; }
          .roster-table thead { display: table-header-group !important; }
          .roster-table tr { display: table-row !important; border: none; box-shadow: none; border-bottom: 1px solid #edf2f7; }
          .roster-table td, .roster-table th { display: table-cell !important; padding: 10px !important; border-bottom: 1px solid #edf2f7 !important; text-align: center !important;}
          .roster-table th:first-child, .roster-table td:first-child { position: sticky; left: 0; background: white; z-index: 5; border-right: 1px solid #e2e8f0; }
          .roster-table th:first-child { z-index: 6; background: #f8fafc; }

          /* Modal Grid */
          .grid-foto { grid-template-columns: 1fr; }
        }
      `}} />

      {/* 🔹 NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span className="hide-mobile" style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Control Panel</span>
        </div>
        <div style={{ background: "#fff5f5", color: "#e53e3e", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #fed7d7" }}>
          👑 <span className="hide-mobile">Admin:</span> {adminName}
        </div>
      </div>

      {/* 🔹 HERO */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)", width: "100%" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PANTAU KINERJA SECURITY</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Pengawasan lalu lintas aset, tamu, patroli, dan jadwal regu</p>
      </div>

      {/* 🔹 KONTEN UTAMA */}
      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>
        
        {/* TABS */}
        <div className="tab-buttons" style={{ marginBottom: "20px" }}>
          {[
            { id: "PATROLI", label: "🚨 Log Patroli", color: "#e53e3e" },
            { id: "TAMU", label: "📋 Buku Tamu", color: "#3182ce" },
            { id: "PAKET", label: "📦 Log Paket", color: "#dd6b20" },
            { id: "ROSTER", label: "📅 Roster Danru", color: "#805ad5" }
          ].map(tab => (
            <button 
              key={tab.id} 
              className="tab-btn"
              onClick={() => { setActiveTab(tab.id as "PATROLI" | "TAMU" | "PAKET" | "ROSTER"); setSearchQuery(""); }}
              style={{ background: activeTab === tab.id ? "white" : "rgba(255,255,255,0.8)", color: activeTab === tab.id ? tab.color : "#718096", borderBottom: activeTab === tab.id ? `3px solid ${tab.color}` : "3px solid transparent" }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", width: "100%" }}>
          
          {activeTab !== "ROSTER" && (
            <div className="header-title-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px" }}>
                {activeTab === "PATROLI" ? "Laporan Patroli Keliling" : activeTab === "TAMU" ? "Catatan Akses Keluar/Masuk" : "Penerimaan Paket & Dokumen"}
              </h2>
              <div className="search-input-wrapper" style={{ position: "relative", width: "260px" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input type="text" placeholder="Pencarian spesifik..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid #cbd5e0", fontSize: "13px", width: "100%", background: "#f8fafc", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
          )}

          {/* TAB 1: PATROLI */}
          {activeTab === "PATROLI" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0", width: "100%" }}>
              <table className="sec-table">
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Waktu Laporan</th>
                    <th style={{ width: "25%" }}>Petugas Patroli</th>
                    <th style={{ width: "20%" }}>Total Titik Di-Scan</th>
                    <th style={{ width: "20%", textAlign: "center" }}>Status Keliling</th>
                    <th style={{ width: "15%", textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {fPatrols.length > 0 ? fPatrols.map(p => (
                    <tr key={p.id}>
                      <td style={{ color: "#718096" }}>{formatWaktu(p.waktu_laporan)}</td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "#e53e3e" }}>👮 {p.petugas}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "#2d3748" }}>{p.titik_patroli?.length || 0} Titik Terpantau</div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ background: p.status.includes("Sempurna") ? "#c6f6d5" : "#feebc8", color: p.status.includes("Sempurna") ? "#22543d" : "#9c4221", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", display: "inline-block" }}>{p.status}</span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button onClick={() => setDetailPatroli(p)} style={{ background: "#ebf8ff", color: "#3182ce", border: "1px solid #bee3f8", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold", width: "100%" }}>
                          📸 Lihat Laporan
                        </button>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={5} style={{ padding: "30px", textAlign: "center", color: "#a0aec0" }}>Belum ada log patroli yang cocok dengan pencarian.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: TAMU */}
          {activeTab === "TAMU" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0", width: "100%" }}>
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
                        <div style={{ fontWeight: "bold", color: "#2b6cb0", fontSize: "14px" }}>{v.nama}</div>
                        <span style={{ fontSize: "10px", background: v.jenis === "Karyawan" ? "#edf2f7" : "#fff5f5", color: v.jenis === "Karyawan" ? "#4a5568" : "#c53030", padding: "2px 6px", borderRadius: "4px", display: "inline-block", marginTop: "4px" }}>{v.jenis}</span>
                      </td>
                      <td>
                        <div style={{ color: "#4a5568" }}>🏢 {v.instansi_dept}</div>
                        {v.jenis !== "Karyawan" && <div style={{ fontSize: "11px", color: "#718096", marginTop: "4px" }}>🤝 Host: {v.bertemu_dengan}</div>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ background: v.status.includes("Dalam") ? "#c6f6d5" : "#e2e8f0", color: v.status.includes("Dalam") ? "#22543d" : "#4a5568", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", marginBottom: "6px", display: "inline-block" }}>{v.status}</div>
                        <div style={{ fontSize: "11px", color: "#38a169", fontWeight: "bold" }}>In: {formatWaktu(v.waktu_masuk)}</div>
                        <div style={{ fontSize: "11px", color: "#e53e3e", fontWeight: "bold" }}>Out: {formatWaktu(v.waktu_keluar)}</div>
                      </td>
                      <td style={{ color: "#718096", fontSize: "12px", fontWeight: "bold" }}>👮 {v.pic_bertugas}</td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "#a0aec0" }}>Belum ada log akses masuk.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: PAKET */}
          {activeTab === "PAKET" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0", width: "100%" }}>
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
                        <div style={{ fontWeight: "bold", color: "#2d3748" }}>{p.jenis_barang}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "#2b6cb0" }}>{p.penerima}</div>
                        <div style={{ fontSize: "11px", color: "#718096", marginTop: "2px" }}>Kurir: {p.kurir}</div>
                      </td>
                      <td>
                        <div style={{ color: "#4a5568", fontSize: "12px" }}>{formatWaktu(p.waktu_diterima)}</div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ background: p.status === "Belum Diambil" ? "#feebc8" : "#c6f6d5", color: p.status === "Belum Diambil" ? "#9c4221" : "#22543d", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", marginBottom: "6px", display: "inline-block" }}>{p.status}</div>
                        <div style={{ fontSize: "11px", color: "#718096", fontWeight: "bold" }}>{p.status !== "Belum Diambil" ? formatWaktu(p.waktu_diambil) : "-"}</div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "#a0aec0" }}>Belum ada resi paket.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: ROSTER */}
          {activeTab === "ROSTER" && (
            <div>
              <h2 style={{ margin: "0 0 20px 0", color: "#2d3748", fontSize: "18px" }}>📅 Roster Danru Security <span style={{ background: "#ebf8ff", color: "#3182ce", padding: "4px 10px", borderRadius: "8px", fontSize: "12px" }}>{rosterBulan || "Belum Diterbitkan"}</span></h2>
              {Object.keys(rosterData).length > 0 ? (
                <div className="roster-wrapper" style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <table className="roster-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                        <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>Tanggal</th>
                        {timSecurity.map(staf => <th key={staf} style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", minWidth: "100px" }}>{staf}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(rosterData).sort().map(tglKey => {
                        const isHariIni = tglKey === new Date().toISOString().split("T")[0];
                        return (
                          <tr key={tglKey} style={{ background: isHariIni ? "#fff5f5" : "white", borderBottom: "1px solid #edf2f7" }}>
                            <td style={{ padding: "12px 15px", textAlign: "left", fontWeight: isHariIni ? "900" : "bold", color: isHariIni ? "#c53030" : "#718096" }}>
                              {tglKey.split("-")[2]} {isHariIni && <span style={{ fontSize: "9px", background: "#e53e3e", color: "white", padding: "2px 6px", borderRadius: "4px", display: "block", width: "fit-content", marginTop: "2px" }}>HARI INI</span>}
                            </td>
                            {timSecurity.map(staf => {
                              const shift = rosterData[tglKey][staf] || "-";
                              const isOff = shift.toLowerCase().includes("off");
                              return <td key={staf} style={{ padding: "12px", color: isOff ? "#e53e3e" : "#3182ce", fontWeight: isOff ? "normal" : "bold" }}>{shift}</td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <div style={{ padding: "40px", textAlign: "center", color: "#a0aec0", border: "1px dashed #cbd5e0", borderRadius: "12px" }}>Danru belum menerbitkan roster bulanan.</div>}
            </div>
          )}

        </div>
      </div>

      {/* 🔹 MODAL DETAIL PATROLI */}
      {detailPatroli && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "15px", backdropFilter: "blur(5px)" }}>
          <div style={{ background: "white", padding: "0", borderRadius: "20px", width: "100%", maxWidth: "800px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            
            {/* Header Modal */}
            <div style={{ background: "#2d3748", color: "white", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: "0 0 5px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}><span>📸</span> Laporan Titik Patroli</h2>
                <div style={{ fontSize: "11px", color: "#a0aec0" }}>Oleh {detailPatroli.petugas} - {formatWaktu(detailPatroli.waktu_laporan)}</div>
              </div>
              <button onClick={() => setDetailPatroli(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", color: "white", fontSize: "16px" }}>✖</button>
            </div>
            
            <div style={{ padding: "20px", overflowY: "auto", flex: 1, background: "#f8fafc" }}>
              <div style={{ background: "#ebf8ff", padding: "15px", borderRadius: "12px", marginBottom: "20px", border: "1px solid #bee3f8", color: "#2b6cb0", fontSize: "13px", lineHeight: "1.5" }}>
                <strong>Catatan Shift:</strong> <br/><i style={{ color: "#2c5282" }}>&quot;{detailPatroli.catatan_shift || "Tidak ada catatan khusus dari petugas."}&quot;</i>
              </div>

              {/* Grid Foto Titik */}
              <div className="grid-foto">
                {detailPatroli.titik_patroli?.map((t, i) => {
                  const isAman = t.kondisi.includes("Aman");
                  return (
                    <div key={i} style={{ background: "white", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                      <div style={{ position: "relative" }}>
                        {t.foto ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={t.foto} alt="Titik Patroli" style={{ width: "100%", height: "200px", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "200px", background: "#edf2f7", display: "flex", justifyContent: "center", alignItems: "center", color: "#a0aec0", fontSize: "12px", fontStyle: "italic" }}>Tanpa Foto</div>
                        )}
                        <div style={{ position: "absolute", bottom: "10px", right: "10px", background: "rgba(0,0,0,0.7)", color: "white", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold" }}>{t.waktu_patroli}</div>
                      </div>
                      
                      <div style={{ padding: "15px" }}>
                        <div style={{ fontSize: "10px", color: "#718096", fontWeight: "bold", textTransform: "uppercase" }}>{t.id.split("::")[0]}</div>
                        <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "13px", margin: "4px 0 10px 0", lineHeight: "1.3" }}>{t.id.split("::")[1]}</div>
                        <span style={{ fontSize: "11px", background: isAman ? "#c6f6d5" : "#fed7d7", color: isAman ? "#22543d" : "#9b2c2c", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", display: "inline-block" }}>
                          {t.kondisi}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}