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
  tanggal: string; // <-- Tambahkan baris ini
  area: string;
  tugas: string;
  status: string;
}

export default function OBDashboard() {
  const router = useRouter();
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [assignedFloors, setAssignedFloors] = useState<string[]>([]);

  // State Fitur Baru
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
    // Menggunakan ">=" agar menarik semua jadwal yang akan datang
    const qDC = query(dcRef, where("tanggal", ">=", todayISO)); 
    
    const unsubDC = onSnapshot(qDC, (snapshot) => {
      const tasks: DeepCleaningTask[] = [];
      snapshot.forEach(doc => {
        tasks.push({ ...doc.data(), id: doc.id } as DeepCleaningTask);
      });
      
      // Urutkan jadwal yang terdekat berada di paling atas
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

  // MENU UTAMA OB & CS (YANG SEMPAT HILANG)
  const menuOB = [
    {
      title: "✨ Kerjaan Rutin Harian",
      desc: "Checklist kebersihan area (Toilet, Lobby, Pantry, dll).",
      path: "/dashboard/ob/checklist", 
      color: "#319795", 
      icon: "📸"
    },
    {
      title: "🧴 Stock Opname Gudang",
      desc: "Catat sisa stok chemical, sabun, tisu, dan alat pel.",
      path: "/dashboard/ob/stok", 
      color: "#dd6b20", 
      icon: "📦"
    },
    {
      title: "🛠️ Laporan Kerusakan",
      desc: "Laporkan fasilitas rusak (lampu mati, keran bocor) ke GA.",
      path: "/dashboard/ob/laporan", 
      color: "#e53e3e", 
      icon: "🔧"
    },
  ];

  if (!isReady) return null;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1200px", margin: "0 auto", minHeight: "100vh", background: "#f7fafc" }}>
      
      {/* 1. HEADER DASHBOARD */}
      <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", marginBottom: "25px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px", borderLeft: "6px solid #319795" }}>
        <div>
          <h1 style={{ margin: "0 0 5px 0", color: "#234e52" }}>🧹 Dashboard OB & CS</h1>
          <p style={{ margin: "0", color: "#718096", fontSize: "14px" }}>Pilih menu operasional kebersihan dan fasilitas di bawah ini.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
          <div style={{ background: "#e6fffa", color: "#285e61", padding: "8px 15px", borderRadius: "50px", fontSize: "13px", fontWeight: "bold", border: "1px solid #b2f5ea", display: "flex", alignItems: "center", gap: "5px" }}>
            <span>👤</span> PIC: {picName}
          </div>
          <button onClick={handleKeluar} style={{ padding: "10px 15px", background: "#edf2f7", color: "#4a5568", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
            🔄 Ganti Shift / Keluar
          </button>
        </div>
      </div>

      {/* 2. BANNER PERINGATAN LOW STOCK */}
      {stokMenipis.length > 0 && (
        <div style={{ background: "#fff5f5", border: "2px solid #feb2b2", borderRadius: "12px", padding: "20px", marginBottom: "25px", display: "flex", gap: "15px", alignItems: "flex-start" }}>
          <div style={{ fontSize: "30px" }}>⚠️</div>
          <div>
            <h3 style={{ margin: "0 0 5px 0", color: "#c53030" }}>Peringatan Stok Gudang Menipis!</h3>
            <p style={{ margin: "0 0 10px 0", color: "#742a2a", fontSize: "14px" }}>Beberapa item kebersihan di gudang sudah melewati batas minimum:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {stokMenipis.map(item => (
                <span key={item.id} style={{ background: "#e53e3e", color: "white", padding: "4px 10px", borderRadius: "6px", fontSize: "13px", fontWeight: "bold" }}>
                  {item.nama_barang} (Sisa: {item.qty})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. BANNER PENGUMUMAN SHIFT */}
      {assignedFloors.length > 0 ? (
        <div style={{ background: "#e6fffa", color: "#234e52", padding: "15px 20px", borderRadius: "12px", marginBottom: "25px", border: "1px solid #38b2ac", fontWeight: "bold", fontSize: "15px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
          📢 SHIFT HARI INI: Anda diplot di area <span style={{ color: "#319795", textDecoration: "underline" }}>{assignedFloors.join(", ")}</span>. Laksanakan tugas dengan baik!
        </div>
      ) : (
        <div style={{ background: "#fff5f5", color: "#c53030", padding: "15px 20px", borderRadius: "12px", marginBottom: "25px", border: "1px solid #feb2b2", fontWeight: "bold", fontSize: "15px" }}>
          ⚠️ PENGUMUMAN SHIFT: Anda belum diplot di lantai manapun hari ini. Hubungi Koordinator.
        </div>
      )}

      {/* 4. PANEL KHUSUS KOORDINATOR (HILAL) */}
      {picName.toLowerCase().includes("hilal") && (
        <div style={{ display: "flex", gap: "20px", marginBottom: "25px", flexWrap: "wrap" }}>
          
          <div 
            onClick={() => router.push("/dashboard/ob/plotting")}
            style={{ flex: 1, minWidth: "250px", background: "#ebf8ff", border: "2px dashed #3182ce", padding: "20px", borderRadius: "8px", cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}
            onMouseOver={(e) => (e.currentTarget.style.background = "#bee3f8")}
            onMouseOut={(e) => (e.currentTarget.style.background = "#ebf8ff")}
          >
            <h2 style={{ margin: "0 0 5px 0", color: "#2c5282", fontSize: "18px" }}>🗺️ PLOTTING TUGAS HARIAN</h2>
            <p style={{ margin: "0", color: "#4a5568", fontSize: "13px" }}>Atur penugasan lantai dan absen staf.</p>
          </div>

          <div 
            onClick={() => router.push("/dashboard/ob/deep-cleaning")}
            style={{ flex: 1, minWidth: "250px", background: "#faf5ff", border: "2px dashed #805ad5", padding: "20px", borderRadius: "8px", cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}
            onMouseOver={(e) => (e.currentTarget.style.background = "#e9d8fd")}
            onMouseOut={(e) => (e.currentTarget.style.background = "#faf5ff")}
          >
            <h2 style={{ margin: "0 0 5px 0", color: "#44337a", fontSize: "18px" }}>📅 JADWAL DEEP CLEANING</h2>
            <p style={{ margin: "0", color: "#4a5568", fontSize: "13px" }}>Buat jadwal pembersihan ekstra (bulanan).</p>
          </div>

        </div>
      )}

      {/* 5. GRID MENU UTAMA OB */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "30px" }}>
        {menuOB.map((menu, index) => (
          <div key={index} onClick={() => router.push(menu.path)} style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", cursor: "pointer", borderTop: `5px solid ${menu.color}`, display: "flex", gap: "15px", alignItems: "flex-start", transition: "transform 0.2s" }} onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-5px)")} onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}>
            <div style={{ fontSize: "30px" }}>{menu.icon}</div>
            <div>
              <h2 style={{ marginTop: "0", color: menu.color, fontSize: "18px", marginBottom: "8px" }}>{menu.title}</h2>
              <p style={{ margin: "0", color: "#718096", fontSize: "13px", lineHeight: "1.5" }}>{menu.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 6. JADWAL DEEP CLEANING HARI INI */}
      {tugasDeepCleaning.length > 0 && (
        <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", borderTop: "4px solid #805ad5" }}>
          <h2 style={{ margin: "0 0 15px 0", color: "#44337a", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>📅</span> Daftar Tugas Ekstra (Deep Cleaning)
          </h2>
          <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Daftar tugas perawatan khusus yang telah dijadwalkan oleh Koordinator.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {tugasDeepCleaning.map((tugas) => {
              // Highlight kuning jika tugasnya hari ini
              const isToday = tugas.tanggal === new Date().toISOString().split("T")[0];

              return (
                <div key={tugas.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px", background: tugas.status === "Selesai" ? "#f0fff4" : (isToday ? "#fffff0" : "#faf5ff"), borderRadius: "8px", border: "1px solid #e2e8f0", borderLeft: isToday && tugas.status !== "Selesai" ? "4px solid #ecc94b" : "1px solid #e2e8f0" }}>
                  <div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "5px" }}>
                      <span style={{ fontSize: "11px", background: isToday ? "#ecc94b" : "#edf2f7", color: isToday ? "#744210" : "#4a5568", padding: "3px 8px", borderRadius: "4px", fontWeight: "bold" }}>
                        {isToday ? "🔥 HARI INI" : `📅 ${tugas.tanggal}`}
                      </span>
                    </div>
                    <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "15px" }}>{tugas.tugas}</div>
                    <div style={{ fontSize: "13px", color: "#718096", marginTop: "4px" }}>Lokasi: 📍 {tugas.area}</div>
                  </div>
                  
                  <button disabled={tugas.status === "Selesai"} style={{ padding: "8px 15px", borderRadius: "6px", fontWeight: "bold", border: "none", background: tugas.status === "Selesai" ? "#c6f6d5" : "#805ad5", color: tugas.status === "Selesai" ? "#22543d" : "white", cursor: tugas.status === "Selesai" ? "default" : "pointer" }}>
                    {tugas.status === "Selesai" ? "✔ Selesai" : "Menunggu"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}