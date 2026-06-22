"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, getDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";

// --- INTERFACES ---
interface ChecklistOB {
  id: string;
  waktu: Timestamp | null;
  petugas: string;
  lantai: string;
  area: string;
  status: string;
  foto_bukti?: string;
  catatan?: string;
}

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
    const qChecklist = query(collection(db, "ob_checklists"), orderBy("waktu", "desc"));
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
  const filteredChecklists = checklists.filter(c => c.petugas?.toLowerCase().includes(searchQuery.toLowerCase()) || c.area?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredStocks = stocks.filter(i => i.nama_barang?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredPR = purchaseRequests.filter(pr => pr.nama_barang?.toLowerCase().includes(searchQuery.toLowerCase()) || pr.diajukan_oleh?.toLowerCase().includes(searchQuery.toLowerCase()));

  const kolomLantai = ["Area Basement", "Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Lantai 5", "Pelayanan Khusus OB"];
  
  // Hitung notifikasi (Berapa banyak PR yang Menunggu)
  const pendingPRCount = purchaseRequests.filter(pr => pr.status === "Menunggu Approval").length;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Control Panel</span>
        </div>
        
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
          
          <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
            👑 Admin: {adminName}
          </div>
        </div>
      </div>

      {/* 🔹 HERO SECTION (TEMA MERAH SAMUDERA) */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>PANTAU KINERJA OB & CS</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Monitoring laporan kebersihan, stok gudang, dan permintaan pembelian barang</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* NAVIGASI TAB MODEREN */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", overflowX: "auto", paddingBottom: "10px" }}>
          <button onClick={() => { setActiveTab("CHECKLIST"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "CHECKLIST" ? "white" : "rgba(255,255,255,0.7)", color: activeTab === "CHECKLIST" ? "#319795" : "#718096", boxShadow: activeTab === "CHECKLIST" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "CHECKLIST" ? "3px solid #319795" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            📋 Log Pembersihan
          </button>
          <button onClick={() => { setActiveTab("STOCK"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "STOCK" ? "white" : "rgba(255,255,255,0.7)", color: activeTab === "STOCK" ? "#dd6b20" : "#718096", boxShadow: activeTab === "STOCK" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "STOCK" ? "3px solid #dd6b20" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            📦 Data Stock Opname
          </button>
          <button onClick={() => { setActiveTab("RESTOCK"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "RESTOCK" ? "white" : "rgba(255,255,255,0.7)", color: activeTab === "RESTOCK" ? "#e53e3e" : "#718096", boxShadow: activeTab === "RESTOCK" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "RESTOCK" ? "3px solid #e53e3e" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            🛒 Pengajuan Barang {pendingPRCount > 0 && <span style={{ background: "#e53e3e", color: "white", padding: "2px 6px", borderRadius: "10px", fontSize: "10px" }}>{pendingPRCount}</span>}
          </button>
          <button onClick={() => { setActiveTab("PLOT"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "PLOT" ? "white" : "rgba(255,255,255,0.7)", color: activeTab === "PLOT" ? "#3182ce" : "#718096", boxShadow: activeTab === "PLOT" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "PLOT" ? "3px solid #3182ce" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            📅 Plot Tugas Harian
          </button>
        </div>

        {/* CONTAINER KONTEN */}
        <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          
          {/* SEARCH BAR (Bisa dipakai di semua tab kecuali Plot) */}
          {activeTab !== "PLOT" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px" }}>
                {activeTab === "CHECKLIST" ? "📋 Laporan Pembersihan" : activeTab === "STOCK" ? "📦 Inventory Gudang OB" : "🛒 Permintaan Pembelian"}
              </h2>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Ketik untuk mencari..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid #cbd5e0", fontSize: "13px", width: "260px", background: "#f8fafc", outline: "none" }}
                />
              </div>
            </div>
          )}

          {/* ============================== TAB 1: CHECKLIST ============================== */}
          {activeTab === "CHECKLIST" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Waktu Laporan</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Petugas OB</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Lokasi / Area</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Status Kebersihan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChecklists.length > 0 ? filteredChecklists.map((item) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #edf2f7" }}>
                      <td style={{ padding: "12px 15px", color: "#718096" }}>{formatWaktu(item.waktu)}</td>
                      <td style={{ padding: "12px 15px", fontWeight: "bold", color: "#2c5282" }}>{item.petugas}</td>
                      <td style={{ padding: "12px 15px", color: "#4a5568" }}>
                        <span style={{ fontWeight: "bold" }}>{item.lantai}</span><br/>
                        <span style={{ fontSize: "11px", color: "#a0aec0" }}>{item.area}</span>
                      </td>
                      <td style={{ padding: "12px 15px", textAlign: "center" }}>
                        <span style={{ background: item.status?.includes("Bersih") ? "#c6f6d5" : "#feebc8", color: item.status?.includes("Bersih") ? "#22543d" : "#9c4221", padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold" }}>
                          {item.status || "Selesai"}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} style={{ padding: "50px", textAlign: "center", color: "#a0aec0" }}>Belum ada log laporan kebersihan.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ============================== TAB 2: STOCK OPNAME ============================== */}
          {activeTab === "STOCK" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Nama Barang</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Sisa Stok (Qty)</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Batas Minimum</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Diupdate Oleh</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Terakhir Diupdate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.length > 0 ? filteredStocks.map((item) => {
                    const isLowStock = item.qty <= item.batas_minimum;
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #edf2f7", background: isLowStock ? "#fff5f5" : "white" }}>
                        <td style={{ padding: "12px 15px", fontWeight: "bold", color: "#2d3748" }}>{item.nama_barang}</td>
                        <td style={{ padding: "12px 15px", textAlign: "center", fontWeight: "900", color: isLowStock ? "#e53e3e" : "#38a169", fontSize: "14px" }}>
                          {item.qty}
                          {isLowStock && <div style={{ fontSize: "9px", color: "#e53e3e", marginTop: "4px", background: "#fed7d7", padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>LOW STOCK</div>}
                        </td>
                        <td style={{ padding: "12px 15px", textAlign: "center", color: "#718096", fontWeight: "bold" }}>{item.batas_minimum}</td>
                        <td style={{ padding: "12px 15px", color: "#4a5568" }}>
                          <span style={{ background: "#edf2f7", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold" }}>{item.diupdate_oleh || "-"}</span>
                        </td>
                        <td style={{ padding: "12px 15px", color: "#a0aec0", fontSize: "11px" }}>{formatWaktu(item.terakhir_diupdate)}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={5} style={{ padding: "50px", textAlign: "center", color: "#a0aec0" }}>Belum ada data barang di inventori.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ============================== TAB 3: RESTOCK PENGAJUAN BARANG ============================== */}
          {activeTab === "RESTOCK" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Waktu Pengajuan</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Barang Diminta</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Stok Saat Diminta</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Pemohon</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Status & Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPR.length > 0 ? filteredPR.map((pr) => {
                    const isPending = pr.status === "Menunggu Approval";
                    return (
                      <tr key={pr.id} style={{ borderBottom: "1px solid #edf2f7", background: isPending ? "#fffaf0" : "white" }}>
                        <td style={{ padding: "12px 15px", color: "#718096" }}>{formatWaktu(pr.waktu_pengajuan)}</td>
                        <td style={{ padding: "12px 15px", fontWeight: "bold", color: "#2d3748", fontSize: "14px" }}>{pr.nama_barang}</td>
                        <td style={{ padding: "12px 15px" }}>
                          <span style={{ background: "#fed7d7", color: "#c53030", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold" }}>Sisa: {pr.sisa_stok}</span>
                        </td>
                        <td style={{ padding: "12px 15px", color: "#4a5568" }}>{pr.diajukan_oleh}</td>
                        <td style={{ padding: "12px 15px", textAlign: "center" }}>
                          {isPending ? (
                            <div style={{ display: "flex", gap: "5px", justifyContent: "center" }}>
                              <button onClick={() => handleUpdatePR(pr.id, "Disetujui / Proses Beli")} style={{ background: "#38a169", color: "white", border: "none", padding: "6px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>✔️ Setujui</button>
                              <button onClick={() => handleUpdatePR(pr.id, "Ditolak / Ditunda")} style={{ background: "#e53e3e", color: "white", border: "none", padding: "6px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>❌ Tolak</button>
                            </div>
                          ) : (
                            <span style={{ 
                              background: pr.status.includes("Disetujui") ? "#c6f6d5" : "#fed7d7", 
                              color: pr.status.includes("Disetujui") ? "#22543d" : "#9b2c2c", 
                              padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold" 
                            }}>
                              {pr.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={5} style={{ padding: "50px", textAlign: "center", color: "#a0aec0" }}>Belum ada pengajuan pembelian barang dari OB.</td></tr>
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
                    <div key={plot.id} style={{ border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
                      <div style={{ background: "#f8fafc", padding: "15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between" }}>
                        <div><h3 style={{ margin: 0, color: "#3182ce", fontSize: "16px" }}>{formatDateOnly(plot.tanggal)}</h3><p style={{ margin: "4px 0 0", fontSize: "12px", color: "#718096" }}>Oleh: {plot.dibuat_oleh}</p></div>
                        <span style={{ fontSize: "11px", background: "#e2e8f0", color: "#4a5568", padding: "4px 10px", borderRadius: "20px", fontWeight: "bold", height: "fit-content" }}>Diupdate: {formatWaktu(plot.waktu_update)}</span>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                          <thead>
                            <tr>{kolomLantai.map(l => <th key={l} style={{ padding: "12px", borderBottom: "1px solid #edf2f7", borderRight: "1px solid #edf2f7", color: "#4a5568", minWidth: "120px" }}>{l}</th>)}</tr>
                          </thead>
                          <tbody>
                            <tr>{kolomLantai.map(l => {
                              const petugas = plot.plot_lantai?.[l] || "Belum diplot";
                              return <td key={l} style={{ padding: "12px", borderRight: "1px solid #edf2f7", color: petugas === "Belum diplot" ? "#a0aec0" : "#2d3748", fontWeight: petugas === "Belum diplot" ? "normal" : "bold" }}>{petugas}</td>;
                            })}</tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#a0aec0", border: "1px dashed #cbd5e0", borderRadius: "12px" }}>Belum ada catatan pembagian tugas OB.</div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}