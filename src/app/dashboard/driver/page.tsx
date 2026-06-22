"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DriverDashboard() {
  const router = useRouter();
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);

  // State Dummy untuk UI (Logika akan kita bangun nanti)
  const [statusMobil, setStatusMobil] = useState("Standby di Kantor");
  const [mobilAktif, setMobilAktif] = useState("Innova Reborn - DD 1234 XY");

  // EFEK: Ambil Identitas
  useEffect(() => {
    const siapkanIdentitas = async () => {
      const nama = localStorage.getItem("pic_nama");
      const dept = localStorage.getItem("pic_dept");
      
      if (!nama || dept !== "Driver") {
        router.push("/shift-checkin");
      } else {
        setPicName(nama);
        setIsReady(true);
      }
    };
    siapkanIdentitas();
  }, [router]);

  const handleKeluar = () => {
    localStorage.removeItem("pic_nama");
    localStorage.removeItem("pic_dept");
    localStorage.removeItem("pic_role");
    router.push("/shift-checkin");
  };

  // MENU UTAMA DRIVER (Rancangan Awal)
  const menuDriver = [
    { title: "Log Perjalanan (Trip)", desc: "Catat KM awal/akhir, tujuan, dan jam keberangkatan.", path: "/dashboard/driver/trip", color: "#3182ce", bg: "#ebf8ff", icon: "🛣️" },
    { title: "Inspeksi Kendaraan", desc: "Checklist kondisi mesin, ban, kebersihan, dan oli mobil.", path: "/dashboard/driver/inspeksi", color: "#38a169", bg: "#f0fff4", icon: "🔧" },
    { title: "Klaim & Pengeluaran", desc: "Input struk bensin, tol, parkir, atau biaya cuci mobil.", path: "/dashboard/driver/klaim", color: "#dd6b20", bg: "#fffaf0", icon: "⛽" },
  ];

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LOGO BRAND SAMUDERA_WHITE.jpg" alt="Logo" style={{ height: "30px", filter: "invert(1) brightness(0.2)" }} />
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Driver Desk</span>
        </div>
        <button onClick={handleKeluar} style={{ background: "#edf2f7", color: "#4a5568", border: "none", padding: "8px 15px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#e2e8f0"} onMouseOut={(e) => e.currentTarget.style.background = "#edf2f7"}>
          Keluar ➔
        </button>
      </div>

      {/* 🔹 HERO SECTION (TEMA MERAH SAMUDERA) */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 80px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>TRANSPORT CENTER</h1>
        <p style={{ margin: "0 0 20px 0", fontSize: "14px", opacity: 0.9 }}>Manajemen Armada & Mobilitas SIBM</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 20px", borderRadius: "50px", fontSize: "13px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.3)" }}>
          <span>🚗</span> PIC: {picName}
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1100px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* 📢 KARTU STATUS KENDARAAN (DUMMY) */}
        <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", marginBottom: "25px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px", border: "1px solid #e2e8f0" }}>
          <div>
            <p style={{ margin: "0 0 5px 0", color: "#718096", fontSize: "13px", fontWeight: "bold", textTransform: "uppercase" }}>Armada Anda Saat Ini</p>
            <h2 style={{ margin: 0, color: "#1a202c", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              {mobilAktif}
            </h2>
          </div>
          <div style={{ background: statusMobil.includes("Standby") ? "#e6fffa" : "#fff5f5", color: statusMobil.includes("Standby") ? "#234e52" : "#c53030", padding: "10px 20px", borderRadius: "12px", border: statusMobil.includes("Standby") ? "1px solid #b2f5ea" : "1px solid #feb2b2", fontWeight: "900", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
            {statusMobil.includes("Standby") ? "🟢 STANDBY" : "🔴 SEDANG JALAN"}
          </div>
        </div>

        {/* 🔹 GRID MENU UTAMA DRIVER */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px", marginBottom: "35px" }}>
          {menuDriver.map((menu, index) => (
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

        {/* 🗓️ PANEL JADWAL BOOKING (DUMMY) */}
        <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px", borderRadius: "12px", fontSize: "20px" }}>📅</div>
            <div>
              <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px" }}>Jadwal Antar/Jemput Hari Ini</h2>
              <p style={{ margin: "0", color: "#718096", fontSize: "13px" }}>Daftar pesanan kendaraan dari tim GA atau Manajemen.</p>
            </div>
          </div>

          <div style={{ padding: "40px 20px", textAlign: "center", color: "#a0aec0", border: "1px dashed #cbd5e0", borderRadius: "12px", background: "#f8fafc" }}>
            <div style={{ fontSize: "30px", marginBottom: "10px" }}>📭</div>
            Belum ada jadwal perjalanan untuk hari ini.
          </div>
        </div>

      </div>
    </div>
  );
}