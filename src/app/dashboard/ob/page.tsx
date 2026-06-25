"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

// ==========================================
// INTERFACES
// ==========================================
interface StockItem {
  id: string;
  nama_barang: string;
  qty: number;
  batas_minimum: number;
}

interface DeepCleaningTask {
  id: string;
  tanggal: string; 
  area: string;
  tugas: string;
  status: string;
}

// Interface Baru untuk Item Lembur Kolektif
interface OvertimeItemRequest {
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  area_ruangan: string;
  alasan: string;
}

export default function OBDashboard() {
  const router = useRouter();
  const todayISO = new Date().toISOString().split("T")[0];
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [assignedFloors, setAssignedFloors] = useState<string[]>([]);

  // State Fitur OB & CS
  const [stokMenipis, setStokMenipis] = useState<StockItem[]>([]);
  const [tugasDeepCleaning, setTugasDeepCleaning] = useState<DeepCleaningTask[]>([]);

  // 💡 STATE BARU: PERIODE & MULTI-ROW OVERTIME
  const [activeModal, setActiveModal] = useState<"none" | "lembur">("none");
  const [isLemburLoading, setIsLemburLoading] = useState(false);
  const [periodeLembur, setPeriodeLembur] = useState("11 Juni - 10 Juli 2026");
  const [formLemburItems, setFormLemburItems] = useState<OvertimeItemRequest[]>([
    { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "", alasan: "" }
  ]);

  // EFEK 1: Ambil Identitas
  useEffect(() => {
    const siapkanIdentitas = async () => {
      const nama = localStorage.getItem("pic_nama");
      if (!nama) {
        router.push("/shift-checkin");
      } else {
        setPicName(nama);
      }
    };
    siapkanIdentitas();
  }, [router]);

  // EFEK 2: Listener Data Real-time (Plotting, Stok, Deep Cleaning)
  useEffect(() => {
    if (!picName) return; 

    // A. Listener Plot Lantai
    const plotRef = doc(db, "daily_plots", todayISO);
    const unsubPlot = onSnapshot(plotRef, (docSnap) => {
      if (docSnap.exists()) {
        const plots = docSnap.data().plot_lantai || {};
        const lantaiKu = Object.keys(plots).filter(
          (lantai) => plots[lantai] === picName || plots[lantai] === "Semua / All"
        );
        setAssignedFloors(lantaiKu);
      } else {
        setAssignedFloors([]); 
      }
      setIsReady(true);
    });

    // B. Listener Stok Gudang Menipis
    const stockRef = collection(db, "ob_stock");
    const unsubStock = onSnapshot(stockRef, (snapshot) => {
      const items: StockItem[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as StockItem;
        const batas = data.batas_minimum || 5;
        if (data.qty <= batas) {
          items.push({ ...data, id: doc.id, batas_minimum: batas });
        }
      });
      setStokMenipis(items);
    });

    // C. Listener Tugas Deep Cleaning Hari Ini
    const dcRef = collection(db, "deep_cleaning_tasks");
    const qDC = query(dcRef, where("tanggal", ">=", todayISO)); 
    
    const unsubDC = onSnapshot(qDC, (snapshot) => {
      const tasks: DeepCleaningTask[] = [];
      snapshot.forEach(doc => {
        tasks.push({ ...doc.data(), id: doc.id } as DeepCleaningTask);
      });
      
      tasks.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
      setTugasDeepCleaning(tasks);
    });

    return () => {
      unsubPlot();
      unsubStock();
      unsubDC();
    };
  }, [picName, todayISO]);

  const handleKeluar = () => {
    localStorage.removeItem("pic_nama");
    localStorage.removeItem("pic_dept");
    localStorage.removeItem("pic_role");
    router.push("/shift-checkin");
  };

  // 💡 MULTI-ROW OVERTIME LOGIC HANDLERS
  const handleAddLemburRow = () => {
    setFormLemburItems([...formLemburItems, { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "", alasan: "" }]);
  };

  const handleRemoveLemburRow = (index: number) => {
    const newItems = [...formLemburItems];
    newItems.splice(index, 1);
    setFormLemburItems(newItems);
  };

  const handleLemburRowChange = (index: number, field: keyof OvertimeItemRequest, value: string) => {
    const newItems = [...formLemburItems];
    newItems[index][field] = value;
    setFormLemburItems(newItems);
  };

  const handleSubmitLemburKolektif = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formLemburItems.some(i => !i.tanggal || !i.jam_mulai || !i.jam_selesai || !i.area_ruangan || !i.alasan)) {
      return alert("Mohon lengkapi seluruh kolom tanggal, jam, dan lokasi lembur yang Anda tambahkan!");
    }

    setIsLemburLoading(true);

    try {
      const dept = localStorage.getItem("pic_dept") || "OB & CS";
      
      // Mengirimkan satu dokumen bundle lemburan periode ke koleksi Firebase
      await addDoc(collection(db, "ga_overtime_requests"), {
        nama_pemohon: picName,
        departemen: dept,
        periode: periodeLembur, // Siklus Buku (Cth: 11 Juni - 10 Juli 2026)
        items: formLemburItems,  // Array berisi daftar tanggal lemburan
        status: "Menunggu Approval GA",
        waktu_request: serverTimestamp()
      });

      alert(`✅ Berhasil! ${formLemburItems.length} klaim lembur Anda untuk periode ${periodeLembur} telah dikirim ke Admin GA.`);
      setFormLemburItems([{ tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "", alasan: "" }]);
      setActiveModal("none");
    } catch (error) {
      console.error(error);
      alert("❌ Gagal mengirim rekapan klaim lembur.");
    } finally {
      setIsLemburLoading(false);
    }
  };

  // MENU UTAMA OB & CS
  const menuOB = [
    { title: "Kerjaan Rutin Harian", desc: "Checklist kebersihan (Toilet, Lobby, dll).", path: "/dashboard/ob/checklist", action: "link", color: "#319795", bg: "#e6fffa", icon: "✨" },
    { title: "Stock Opname Gudang", desc: "Catat sisa chemical, sabun, dan tisu.", path: "/dashboard/ob/stok", action: "link", color: "#dd6b20", bg: "#fffaf0", icon: "🧴" },
    { title: "Laporan Kerusakan", desc: "Lapor fasilitas rusak ke tim GA.", path: "/dashboard/ob/laporan", action: "link", color: "#e53e3e", bg: "#fff5f5", icon: "🛠️" },
    { title: "Klaim Lembur Bulan Ini", desc: "Rekap & input data lemburan Anda.", path: "", action: "modal_lembur", color: "#d69e2e", bg: "#fffff0", icon: "⏱️" },
  ];

  const sharedInputStyle = { width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const, transition: "all 0.2s" };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LOGOGRAM SAMUDERA_BACKGROUND MERAH.jpg" alt="Logo" style={{ height: "30px", filter: "invert(1) brightness(0.2)" }} />
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>OB & CS Desk</span>
        </div>
        <button onClick={handleKeluar} style={{ background: "#edf2f7", color: "#4a5568", border: "none", padding: "8px 15px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#e2e8f0"} onMouseOut={(e) => e.currentTarget.style.background = "#edf2f7"}>
          Keluar ➔
        </button>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 80px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>CLEANING CENTER</h1>
        <p style={{ margin: "0 0 20px 0", fontSize: "14px", opacity: 0.9 }}>Pusat Manajemen Kebersihan & Fasilitas Gedung</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 20px", borderRadius: "50px", fontSize: "13px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.3)" }}>
          <span>🧹</span> PIC: {picName}
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1100px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* 📢 KARTU PENGUMUMAN SHIFT */}
        <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", marginBottom: "25px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px", border: "1px solid #e2e8f0" }}>
          <div>
            <p style={{ margin: "0 0 5px 0", color: "#718096", fontSize: "13px", fontWeight: "bold", textTransform: "uppercase" }}>Lokasi Shift Anda Hari Ini</p>
            <h2 style={{ margin: 0, color: "#1a202c", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
            </h2>
          </div>
          <div style={{ background: assignedFloors.length > 0 ? "#e6fffa" : "#fff5f5", color: assignedFloors.length > 0 ? "#234e52" : "#c53030", padding: "10px 20px", borderRadius: "12px", border: assignedFloors.length > 0 ? "1px solid #b2f5ea" : "1px solid #feb2b2", fontWeight: "900", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
            {assignedFloors.length > 0 ? `📍 AREA: ${assignedFloors.join(", ")}` : "⚠️ BELUM DIPLOT"}
          </div>
        </div>

        {/* ⚠️ BANNER PERINGATAN LOW STOCK */}
        {stokMenipis.length > 0 && (
          <div style={{ background: "#fff5f5", border: "1px solid #feb2b2", borderRadius: "20px", padding: "20px", marginBottom: "25px", display: "flex", gap: "15px", alignItems: "center", boxShadow: "0 4px 6px -1px rgba(229, 62, 62, 0.1)" }}>
            <div style={{ background: "#fc8181", color: "white", width: "45px", height: "45px", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "20px", flexShrink: 0 }}>⚠️</div>
            <div>
              <h3 style={{ margin: "0 0 5px 0", color: "#c53030", fontSize: "16px" }}>Stok Gudang Menipis!</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "5px" }}>
                {stokMenipis.map(item => (
                  <span key={item.id} style={{ background: "white", color: "#e53e3e", border: "1px solid #fc8181", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold" }}>
                    {item.nama_barang} <span style={{ opacity: 0.7 }}>(Sisa: {item.qty})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 👑 PANEL KHUSUS KOORDINATOR (HILAL) */}
        {picName.toLowerCase().includes("hilal") && (
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px", flexWrap: "wrap" }}>
            <div 
              onClick={() => router.push("/dashboard/ob/plotting")}
              style={{ flex: 1, minWidth: "250px", background: "linear-gradient(to right, #234e52, #319795)", color: "white", padding: "20px", borderRadius: "20px", cursor: "pointer", display: "flex", alignItems: "center", gap: "20px", boxShadow: "0 10px 15px -3px rgba(49, 151, 149, 0.3)", transition: "transform 0.2s" }}
              onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"}
              onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{ background: "rgba(255,255,255,0.2)", fontSize: "28px", padding: "12px", borderRadius: "16px" }}>🗺️</div>
              <div>
                <h2 style={{ margin: "0 0 5px 0", fontSize: "16px" }}>Plotting Tugas Harian</h2>
                <p style={{ margin: "0", fontSize: "12px", opacity: 0.8 }}>Atur area tugas staf OB & CS.</p>
              </div>
            </div>
            <div 
              onClick={() => router.push("/dashboard/ob/deep-cleaning")}
              style={{ flex: 1, minWidth: "250px", background: "linear-gradient(to right, #44337a, #6b46c1)", color: "white", padding: "20px", borderRadius: "20px", cursor: "pointer", display: "flex", alignItems: "center", gap: "20px", boxShadow: "0 10px 15px -3px rgba(107, 70, 193, 0.3)", transition: "transform 0.2s" }}
              onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"}
              onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{ background: "rgba(255,255,255,0.2)", fontSize: "28px", padding: "12px", borderRadius: "16px" }}>📅</div>
              <div>
                <h2 style={{ margin: "0 0 5px 0", fontSize: "16px" }}>Jadwal Deep Cleaning</h2>
                <p style={{ margin: "0", fontSize: "12px", opacity: 0.8 }}>Manajemen tugas perawatan khusus.</p>
              </div>
            </div>
          </div>
        )}

        {/* 🔹 GRID MENU UTAMA OB */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px", marginBottom: "35px" }}>
          {menuOB.map((menu, index) => (
            <div 
              key={index} 
              onClick={() => menu.action === "modal_lembur" ? setActiveModal("lembur") : router.push(menu.path)} 
              style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", cursor: "pointer", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "15px", transition: "all 0.2s" }}
              onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-5px)"; e.currentTarget.style.boxShadow = `0 10px 20px -5px ${menu.color}40`; e.currentTarget.style.borderColor = menu.color; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
            >
              <div style={{ background: menu.bg, color: menu.color, width: "55px", height: "55px", borderRadius: "16px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "28px" }}>
                {menu.icon}
              </div>
              <div>
                <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "17px" }}>{menu.title}</h2>
                <p style={{ margin: "0", color: "#718096", fontSize: "13px", lineHeight: "1.5" }}>{menu.desc}</p>
              </div>
              <div style={{ marginTop: "auto", color: menu.color, fontSize: "12px", fontWeight: "bold" }}>Buka Modul ➔</div>
            </div>
          ))}
        </div>

        {/* JADWAL DEEP CLEANING */}
        {tugasDeepCleaning.length > 0 && (
          <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <div style={{ background: "#faf5ff", color: "#6b46c1", padding: "8px", borderRadius: "12px", fontSize: "20px" }}>📅</div>
              <div>
                <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px" }}>Tugas Ekstra (Deep Cleaning)</h2>
                <p style={{ margin: "0", color: "#718096", fontSize: "13px" }}>Daftar tugas perawatan terjadwal dari Koordinator.</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {tugasDeepCleaning.map((tugas) => {
                const isToday = tugas.tanggal === new Date().toISOString().split("T")[0];

                return (
                  <div key={tugas.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: tugas.status === "Selesai" ? "#f0fff4" : (isToday ? "#fffff0" : "#f8fafc"), borderRadius: "16px", border: isToday && tugas.status !== "Selesai" ? "1px solid #ecc94b" : "1px solid #e2e8f0" }}>
                    <div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "5px" }}>
                        <span style={{ fontSize: "10px", background: isToday ? "#ecc94b" : "#e2e8f0", color: isToday ? "#744210" : "#4a5568", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", textTransform: "uppercase" }}>
                          {isToday ? "🔥 HARI INI" : `📅 ${tugas.tanggal}`}
                        </span>
                      </div>
                      <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "15px" }}>{tugas.tugas}</div>
                      <div style={{ fontSize: "12px", color: "#718096", marginTop: "4px" }}>Lokasi: 📍 {tugas.area}</div>
                    </div>
                    <span style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", background: tugas.status === "Selesai" ? "#c6f6d5" : "#edf2f7", color: tugas.status === "Selesai" ? "#22543d" : "#718096" }}>
                      {tugas.status === "Selesai" ? "✔ Selesai" : "Menunggu"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ========================================== */}
      {/* 💡 MODAL PENGAJUAN LEMBUR MULTI-ROW BERDASARKAN PERIODE */}
      {/* ========================================== */}
      {activeModal === "lembur" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "650px", borderRadius: "24px", padding: "30px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box" }}>
            
            <button onClick={() => setActiveModal("none")} style={{ position: "absolute", top: "20px", right: "20px", background: "#edf2f7", border: "none", width: "36px", height: "36px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>✖</button>

            <div style={{ marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "20px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{background:"#fffff0", padding:"8px", borderRadius:"12px"}}>⏱️</span> Klaim Overtime Kolektif
              </h2>
              <p style={{ margin: 0, color: "#718096", fontSize: "13px" }}>Karyawan dapat memasukkan beberapa tanggal lembur sekaligus dalam satu siklus payroll.</p>
            </div>

            <form onSubmit={handleSubmitLemburKolektif} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {/* Pilihan Periode Cut-Off Gaji */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Pemohon</label>
                  <input type="text" readOnly value={picName} style={{...sharedInputStyle, background: "#e2e8f0"}} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Siklus / Periode Buku *</label>
                  <select value={periodeLembur} onChange={(e) => setPeriodeLembur(e.target.value)} style={{...sharedInputStyle, cursor: "pointer", background: "white", fontWeight: "bold", color: "#2d3748"}}>
                    <option value="11 Juni - 10 Juli 2026">🗓️ 11 Juni - 10 Juli 2026 (Aktif)</option>
                    <option value="11 Mei - 10 Juni 2026">🗓️ 11 Mei - 10 Juni 2026 (Lalu)</option>
                    <option value="11 Juli - 10 Agustus 2026">🗓️ 11 Juli - 10 Agustus 2026 (Depan)</option>
                  </select>
                </div>
              </div>

              <div style={{ fontWeight: "bold", fontSize: "13px", color: "#b7791f", marginTop: "10px" }}>📍 Daftar Tanggal Kerja Overtime:</div>

              {/* Loop Form Dinamis */}
              {formLemburItems.map((item, index) => (
                <div key={index} style={{ border: "1px solid #cbd5e0", padding: "20px 15px 15px", borderRadius: "16px", background: "#f8fafc", position: "relative" }}>
                  {index > 0 && (
                    <button type="button" onClick={() => handleRemoveLemburRow(index)} style={{ position: "absolute", top: "10px", right: "10px", background: "white", color: "#e53e3e", border: "1px solid #fed7d7", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>Hapus ✖</button>
                  )}
                  
                  <span style={{ position: "absolute", top: "10px", left: "15px", fontSize: "11px", fontWeight: "900", color: "#d69e2e", background: "#fffff0", padding: "2px 8px", borderRadius: "4px", border: "1px solid #fefcbf" }}>DATA KLAIM #{index + 1}</span>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "15px", marginBottom: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Tanggal Lembur *</label>
                      <input type="date" required value={item.tanggal} onChange={(e) => handleLemburRowChange(index, "tanggal", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Area / Lokasi Ruangan *</label>
                      <input type="text" required placeholder="Cth: Lt. 2 R. Rapat" value={item.area_ruangan} onChange={(e) => handleLemburRowChange(index, "area_ruangan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Jam Mulai *</label>
                      <input type="time" required value={item.jam_mulai} onChange={(e) => handleLemburRowChange(index, "jam_mulai", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Jam Selesai *</label>
                      <input type="time" required value={item.jam_selesai} onChange={(e) => handleLemburRowChange(index, "jam_selesai", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Detail Tugas / Pekerjaan yang Diselesaikan *</label>
                    <input type="text" required placeholder="Cth: Pembersihan karpet koridor utama pasca rapat besar" value={item.alasan} onChange={(e) => handleLemburRowChange(index, "alasan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                  </div>
                </div>
              ))}

              <button type="button" onClick={handleAddLemburRow} style={{ background: "white", color: "#d69e2e", border: "2px dashed #feccbf", padding: "12px", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}>
                ➕ Tambah Tanggal Lembur Lain
              </button>

              <button type="submit" disabled={isLemburLoading} style={{ width: "100%", padding: "16px", background: isLemburLoading ? "#a0aec0" : "#d69e2e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", marginTop: "10px", cursor: isLemburLoading ? "not-allowed" : "pointer", boxShadow: isLemburLoading ? "none" : "0 4px 6px rgba(214,158,46,0.3)" }}>
                {isLemburLoading ? "Sedang Mengirim..." : "Kirim Semua Klaim Overtime"}
              </button>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}