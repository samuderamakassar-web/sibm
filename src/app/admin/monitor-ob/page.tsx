"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, getDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
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
interface TugasDetail {
  nama_tugas: string;
  foto_before: string | null;
  foto_after: string | null;
  status: string;
}

interface ChecklistOB {
  id: string;
  waktu_selesai: Timestamp | null;
  pic_bertugas: string;
  area: string;
  detail_tugas: TugasDetail[];
}

const getStatusRingkas = (detail: TugasDetail[]) => {
  if (!detail || detail.length === 0) return "Belum Ada Data";
  if (detail.every(t => t.status === "Selesai Sempurna")) return "Bersih Sempurna";
  if (detail.some(t => t.status === "Dilewati")) return "Belum Lengkap";
  return "Sebagian Selesai";
};

interface StockOB {
  id: string;
  nama_barang: string;
  qty: number;
  batas_minimum: number;
  diupdate_oleh: string;
  terakhir_diupdate: Timestamp | null;
}

interface DailyPlot {
  id: string;
  tanggal: string;
  dibuat_oleh: string;
  plot_lantai: Record<string, string>;
  waktu_update: Timestamp | null;
}

// BARU: Interface untuk Purchase Request
interface PurchaseRequest {
  id: string;
  nama_barang: string;
  sisa_stok: number;
  status: string;
  diajukan_oleh: string;
  waktu_pengajuan: Timestamp | null;
}

export default function MonitorOBPage() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState("Admin");
  const [activeTab, setActiveTab] = useState<"CHECKLIST" | "STOCK" | "PLOT" | "RESTOCK">("CHECKLIST");
  
  // States Data
  const [checklists, setChecklists] = useState<ChecklistOB[]>([]);
  const [stocks, setStocks] = useState<StockOB[]>([]);
  const [dailyPlots, setDailyPlots] = useState<DailyPlot[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]); // State PR Baru
  
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // 1. Verifikasi Admin
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");
    
    if (!role || (!role.includes("Admin") && !role.includes("Koordinator"))) {
      alert("Akses Ditolak! Halaman ini khusus Administrator.");
      router.push("/dashboard");
      return;
    }
    setTimeout(() => setAdminName(nama || "Admin"), 0);

    // 2. Fetch Laporan Checklist OB
    const qChecklist = query(collection(db, "ob_checklists"), orderBy("waktu_selesai", "desc"));
    const unsubChecklist = onSnapshot(qChecklist, (snap) => {
      setChecklists(snap.docs.map(d => ({ id: d.id, ...d.data() })) as ChecklistOB[]);
    });

    // 3. Fetch Stock Gudang
    const qStock = query(collection(db, "ob_stock"), orderBy("nama_barang", "asc"));
    const unsubStock = onSnapshot(qStock, (snap) => {
      setStocks(snap.docs.map(d => ({ id: d.id, ...d.data() })) as StockOB[]);
    });

    // 4. Fetch Daily Plots
    const qPlot = query(collection(db, "daily_plots"), orderBy("tanggal", "desc"));
    const unsubPlot = onSnapshot(qPlot, (snap) => {
      setDailyPlots(snap.docs.map(d => ({ id: d.id, ...d.data() })) as DailyPlot[]);
    });

    // 5. Fetch Purchase Requests (BARU)
    const qPR = query(collection(db, "purchase_requests"), orderBy("waktu_pengajuan", "desc"));
    const unsubPR = onSnapshot(qPR, (snap) => {
      setPurchaseRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })) as PurchaseRequest[]);
    });

    return () => {
      unsubChecklist(); unsubStock(); unsubPlot(); unsubPR();
    };
  }, [router]);

  const formatWaktu = (timestamp: Timestamp | string | null) => {
    if (!timestamp) return "-";
    const date = (timestamp as Timestamp).toDate ? (timestamp as Timestamp).toDate() : new Date(timestamp as string);
    return date.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const formatDateOnly = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // FUNGSI UPDATE STATUS PR
  const handleUpdatePR = async (id: string, newStatus: string) => {
    const isConfirm = window.confirm(`Ubah status pengajuan menjadi: ${newStatus}?`);
    if (!isConfirm) return;

    try {
      await updateDoc(doc(db, "purchase_requests", id), {
        status: newStatus
      });

      // TODO: INTEGRASI EMAILJS DI SINI (Contoh)
      // if (newStatus === "Disetujui") {
      //   emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", { status: newStatus, ... });
      // }
      
    } catch (error) {
      console.error(error);
      alert("Gagal mengupdate status pengajuan.");
    }
  };

  // Filter Data
  const filteredChecklists = checklists.filter(c =>
    c.pic_bertugas?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.area?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredStocks = stocks.filter(i => i.nama_barang?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredPR = purchaseRequests.filter(pr => pr.nama_barang?.toLowerCase().includes(searchQuery.toLowerCase()) || pr.diajukan_oleh?.toLowerCase().includes(searchQuery.toLowerCase()));

  const kolomLantai = ["Area Basement", "Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Lantai 5", "Pelayanan Khusus OB"];
  
  // Hitung notifikasi (Berapa banyak PR yang Menunggu)
  const pendingPRCount = purchaseRequests.filter(pr => pr.status === "Menunggu Approval").length;

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

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {/* LONCENG NOTIFIKASI */}
          <div onClick={() => setActiveTab("RESTOCK")} style={{ position: "relative", cursor: "pointer", fontSize: "20px", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#edf2f7", borderRadius: "50%" }}>
            🔔
            {pendingPRCount > 0 && (
              <span style={{ position: "absolute", top: "-5px", right: "-5px", background: "#e53e3e", color: "white", borderRadius: "50%", padding: "2px 6px", fontSize: "10px", fontWeight: "bold", border: "2px solid white", animation: "pulse 2s infinite" }}>
                {pendingPRCount}
              </span>
            )}
          </div>

          <div className="admin-badge">
            <IconUserCircle size={14} /> Admin: {adminName}
          </div>
        </div>
      </div>

      {/* 🔹 HERO SECTION (TEMA MERAH SAMUDERA) */}
      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>PANTAU KINERJA OB & CS</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Monitoring laporan kebersihan, stok gudang, dan permintaan pembelian barang</p>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* NAVIGASI TAB MODEREN */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", overflowX: "auto", paddingBottom: "10px" }}>
          <button onClick={() => { setActiveTab("CHECKLIST"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "CHECKLIST" ? "var(--surface)" : "rgba(255,255,255,0.7)", color: activeTab === "CHECKLIST" ? "var(--ok)" : "var(--muted)", boxShadow: activeTab === "CHECKLIST" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "CHECKLIST" ? "3px solid var(--ok)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            📋 Log Pembersihan
          </button>
          <button onClick={() => { setActiveTab("STOCK"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "STOCK" ? "var(--surface)" : "rgba(255,255,255,0.7)", color: activeTab === "STOCK" ? "var(--warn)" : "var(--muted)", boxShadow: activeTab === "STOCK" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "STOCK" ? "3px solid var(--warn)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            📦 Data Stock Opname
          </button>
          <button onClick={() => { setActiveTab("RESTOCK"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "RESTOCK" ? "var(--surface)" : "rgba(255,255,255,0.7)", color: activeTab === "RESTOCK" ? "var(--red-600)" : "var(--muted)", boxShadow: activeTab === "RESTOCK" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "RESTOCK" ? "3px solid var(--red-600)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            🛒 Pengajuan Barang {pendingPRCount > 0 && <span style={{ background: "var(--red-600)", color: "white", padding: "2px 6px", borderRadius: "10px", fontSize: "10px" }}>{pendingPRCount}</span>}
          </button>
          <button onClick={() => { setActiveTab("PLOT"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "PLOT" ? "var(--surface)" : "rgba(255,255,255,0.7)", color: activeTab === "PLOT" ? "var(--info)" : "var(--muted)", boxShadow: activeTab === "PLOT" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "PLOT" ? "3px solid var(--info)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            📅 Plot Tugas Harian
          </button>
        </div>

        {/* CONTAINER KONTEN */}
        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)" }}>
          
          {/* SEARCH BAR (Bisa dipakai di semua tab kecuali Plot) */}
          {activeTab !== "PLOT" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>
                {activeTab === "CHECKLIST" ? "📋 Laporan Pembersihan" : activeTab === "STOCK" ? "📦 Inventory Gudang OB" : "🛒 Permintaan Pembelian"}
              </h2>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Ketik untuk mencari..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "260px", background: "var(--bg)", outline: "none" }}
                />
              </div>
            </div>
          )}

          {/* ============================== TAB 1: CHECKLIST ============================== */}
          {activeTab === "CHECKLIST" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Waktu Laporan</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Petugas OB</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Area</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "center" }}>Status Kebersihan</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "center" }}>Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChecklists.length > 0 ? filteredChecklists.map((item) => {
                    const statusRingkas = getStatusRingkas(item.detail_tugas);
                    const isOpen = expandedId === item.id;
                    return (
                      <Fragment key={item.id}>
                        <tr style={{ borderBottom: "1px solid var(--line)" }}>
                          <td style={{ padding: "12px 15px", color: "var(--muted)" }}>{formatWaktu(item.waktu_selesai)}</td>
                          <td style={{ padding: "12px 15px", fontWeight: "bold", color: "var(--info)" }}>{item.pic_bertugas}</td>
                          <td style={{ padding: "12px 15px", color: "var(--ink-soft)" }}>{item.area}</td>
                          <td style={{ padding: "12px 15px", textAlign: "center" }}>
                            <span style={{
                              background: statusRingkas === "Bersih Sempurna" ? "var(--ok-50)" : statusRingkas === "Belum Lengkap" ? "var(--red-50)" : "var(--warn-50)",
                              color: statusRingkas === "Bersih Sempurna" ? "var(--ok)" : statusRingkas === "Belum Lengkap" ? "var(--red-700)" : "var(--warn)",
                              padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold"
                            }}>
                              {statusRingkas}
                            </span>
                          </td>
                          <td style={{ padding: "12px 15px", textAlign: "center" }}>
                            <button
                              onClick={() => setExpandedId(isOpen ? null : item.id)}
                              style={{ background: isOpen ? "var(--ok)" : "var(--bg)", color: isOpen ? "white" : "var(--ink-soft)", border: "none", padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}
                            >
                              {isOpen ? "Tutup ▲" : "Lihat Foto ▼"}
                            </button>
                          </td>
                        </tr>
          
                        {isOpen && (
                          <tr>
                            <td colSpan={5} style={{ padding: "0", background: "var(--bg)" }}>
                              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px" }}>
                                {item.detail_tugas && item.detail_tugas.length > 0 ? item.detail_tugas.map((sub, sIdx) => (
                                  <div key={sIdx} style={{ background: "var(--surface)", padding: "15px", borderRadius: "12px", border: "1px solid var(--line)" }}>
                                    <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "13px", marginBottom: "10px", display: "flex", justifyContent: "space-between" }}>
                                      <span>{sub.nama_tugas}</span>
                                      <span style={{ fontSize: "10px", padding: "3px 8px", background: "var(--bg)", borderRadius: "6px", color: "var(--ink-soft)" }}>{sub.status}</span>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", maxWidth: "400px" }}>
                                      <div>
                                        <div style={{ fontSize: "10px", color: "var(--red-600)", fontWeight: "900", marginBottom: "6px", textAlign: "center" }}>SEBELUM</div>
                                        {sub.foto_before ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={sub.foto_before} alt="Sebelum" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--red-50)", cursor: "pointer" }} onClick={() => window.open(sub.foto_before!, "_blank")} />
                                        ) : (
                                          <div style={{ height: "100px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", borderRadius: "8px", color: "var(--muted)", fontSize: "11px", fontStyle: "italic" }}>Tidak ada foto</div>
                                        )}
                                      </div>
                                      <div>
                                        <div style={{ fontSize: "10px", color: "var(--ok)", fontWeight: "900", marginBottom: "6px", textAlign: "center" }}>SESUDAH</div>
                                        {sub.foto_after ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={sub.foto_after} alt="Sesudah" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--ok-50)", cursor: "pointer" }} onClick={() => window.open(sub.foto_after!, "_blank")} />
                                        ) : (
                                          <div style={{ height: "100px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", borderRadius: "8px", color: "var(--muted)", fontSize: "11px", fontStyle: "italic" }}>Tidak ada foto</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )) : (
                                  <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>Tidak ada rincian tugas untuk laporan ini.</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  }) : (
                    <tr><td colSpan={5} style={{ padding: "50px", textAlign: "center", color: "var(--muted)" }}>Belum ada log laporan kebersihan.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ============================== TAB 2: STOCK OPNAME ============================== */}
          {activeTab === "STOCK" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Nama Barang</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "center" }}>Sisa Stok (Qty)</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "center" }}>Batas Minimum</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Diupdate Oleh</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Terakhir Diupdate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.length > 0 ? filteredStocks.map((item) => {
                    const isLowStock = item.qty <= item.batas_minimum;
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid var(--line)", background: isLowStock ? "var(--red-50)" : "var(--surface)" }}>
                        <td style={{ padding: "12px 15px", fontWeight: "bold", color: "var(--ink)" }}>{item.nama_barang}</td>
                        <td style={{ padding: "12px 15px", textAlign: "center", fontWeight: "900", color: isLowStock ? "var(--red-600)" : "var(--ok)", fontSize: "14px" }}>
                          {item.qty}
                          {isLowStock && <div style={{ fontSize: "9px", color: "var(--red-600)", marginTop: "4px", background: "var(--red-50)", padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>LOW STOCK</div>}
                        </td>
                        <td style={{ padding: "12px 15px", textAlign: "center", color: "var(--muted)", fontWeight: "bold" }}>{item.batas_minimum}</td>
                        <td style={{ padding: "12px 15px", color: "var(--ink-soft)" }}>
                          <span style={{ background: "var(--bg)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold" }}>{item.diupdate_oleh || "-"}</span>
                        </td>
                        <td style={{ padding: "12px 15px", color: "var(--muted)", fontSize: "11px" }}>{formatWaktu(item.terakhir_diupdate)}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={5} style={{ padding: "50px", textAlign: "center", color: "var(--muted)" }}>Belum ada data barang di inventori.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ============================== TAB 3: RESTOCK PENGAJUAN BARANG ============================== */}
          {activeTab === "RESTOCK" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Waktu Pengajuan</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Barang Diminta</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Stok Saat Diminta</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Pemohon</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "center" }}>Status & Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPR.length > 0 ? filteredPR.map((pr) => {
                    const isPending = pr.status === "Menunggu Approval";
                    return (
                      <tr key={pr.id} style={{ borderBottom: "1px solid var(--line)", background: isPending ? "var(--warn-50)" : "var(--surface)" }}>
                        <td style={{ padding: "12px 15px", color: "var(--muted)" }}>{formatWaktu(pr.waktu_pengajuan)}</td>
                        <td style={{ padding: "12px 15px", fontWeight: "bold", color: "var(--ink)", fontSize: "14px" }}>{pr.nama_barang}</td>
                        <td style={{ padding: "12px 15px" }}>
                          <span style={{ background: "var(--red-50)", color: "var(--red-700)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold" }}>Sisa: {pr.sisa_stok}</span>
                        </td>
                        <td style={{ padding: "12px 15px", color: "var(--ink-soft)" }}>{pr.diajukan_oleh}</td>
                        <td style={{ padding: "12px 15px", textAlign: "center" }}>
                          {isPending ? (
                            <div style={{ display: "flex", gap: "5px", justifyContent: "center" }}>
                              <button onClick={() => handleUpdatePR(pr.id, "Disetujui / Proses Beli")} style={{ background: "var(--ok)", color: "white", border: "none", padding: "6px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>✔️ Setujui</button>
                              <button onClick={() => handleUpdatePR(pr.id, "Ditolak / Ditunda")} style={{ background: "var(--red-600)", color: "white", border: "none", padding: "6px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>❌ Tolak</button>
                            </div>
                          ) : (
                            <span style={{ 
                              background: pr.status.includes("Disetujui") ? "var(--ok-50)" : "var(--red-50)", 
                              color: pr.status.includes("Disetujui") ? "var(--ok)" : "var(--red-700)", 
                              padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold" 
                            }}>
                              {pr.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={5} style={{ padding: "50px", textAlign: "center", color: "var(--muted)" }}>Belum ada pengajuan pembelian barang dari OB.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ============================== TAB 4: PLOT PENEMPATAN ============================== */}
          {activeTab === "PLOT" && (
            <div>
              {dailyPlots.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  {dailyPlots.map((plot) => (
                    <div key={plot.id} style={{ border: "1px solid var(--line)", borderRadius: "12px", overflow: "hidden" }}>
                      <div style={{ background: "var(--bg)", padding: "15px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
                        <div><h3 style={{ margin: 0, color: "var(--info)", fontSize: "16px" }}>{formatDateOnly(plot.tanggal)}</h3><p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)" }}>Oleh: {plot.dibuat_oleh}</p></div>
                        <span style={{ fontSize: "11px", background: "var(--line)", color: "var(--ink-soft)", padding: "4px 10px", borderRadius: "20px", fontWeight: "bold", height: "fit-content" }}>Diupdate: {formatWaktu(plot.waktu_update)}</span>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                          <thead>
                            <tr>{kolomLantai.map(l => <th key={l} style={{ padding: "12px", borderBottom: "1px solid var(--line)", borderRight: "1px solid var(--line)", color: "var(--ink-soft)", minWidth: "120px" }}>{l}</th>)}</tr>
                          </thead>
                          <tbody>
                            <tr>{kolomLantai.map(l => {
                              const petugas = plot.plot_lantai?.[l] || "Belum diplot";
                              return <td key={l} style={{ padding: "12px", borderRight: "1px solid var(--line)", color: petugas === "Belum diplot" ? "var(--muted)" : "var(--ink)", fontWeight: petugas === "Belum diplot" ? "normal" : "bold" }}>{petugas}</td>;
                            })}</tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px" }}>Belum ada catatan pembagian tugas OB.</div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}