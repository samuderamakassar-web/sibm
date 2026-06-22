"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";

// Interface
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

export default function OBDashboard() {
  const router = useRouter();
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [assignedFloors, setAssignedFloors] = useState<string[]>([]);

  // State Fitur
  const [stokMenipis, setStokMenipis] = useState<StockItem[]>([]);
  const [tugasDeepCleaning, setTugasDeepCleaning] = useState<DeepCleaningTask[]>([]);

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

    const todayISO = new Date().toISOString().split("T")[0];

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
  }, [picName]);

  const handleKeluar = () => {
    localStorage.removeItem("pic_nama");
    localStorage.removeItem("pic_dept");
    localStorage.removeItem("pic_role");
    router.push("/shift-checkin");
  };

  // MENU UTAMA OB & CS
  const menuOB = [
    { title: "Kerjaan Rutin Harian", desc: "Checklist kebersihan (Toilet, Lobby, dll).", path: "/dashboard/ob/checklist", color: "#319795", bg: "#e6fffa", icon: "✨" },
    { title: "Stock Opname Gudang", desc: "Catat sisa chemical, sabun, dan tisu.", path: "/dashboard/ob/stok", color: "#dd6b20", bg: "#fffaf0", icon: "🧴" },
    { title: "Laporan Kerusakan", desc: "Lapor fasilitas rusak ke tim GA.", path: "/dashboard/ob/laporan", color: "#e53e3e", bg: "#fff5f5", icon: "🛠️" },
  ];

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

      {/* 🔹 HERO SECTION (TEMA MERAH SAMUDERA) */}
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
              key={index} onClick={() => router.push(menu.path)} 
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

        {/* 🗓️ JADWAL DEEP CLEANING */}
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
    </div>
  );
}