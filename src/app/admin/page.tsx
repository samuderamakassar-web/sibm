"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState<string>("Admin");

  useEffect(() => {
    // Mengambil nama admin dari sesi login
    const nama = localStorage.getItem("pic_nama");
    if (nama) {
      // PERBAIKAN: Gunakan setTimeout agar tidak memicu error linter
      setTimeout(() => setAdminName(nama), 0);
    }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    router.push("/");
  };

  const menuAdmin = [
    {
      title: "Manajemen Pengguna",
      desc: "Tambah, edit, hapus akun login untuk staf operasional.",
      path: "/admin/users",
      color: "#3182ce", 
      bg: "#ebf8ff",
      icon: "👥"
    },
    {
      title: "Master Data Karyawan",
      desc: "Upload CSV dan kelola direktori 70+ karyawan SIBM.",
      path: "/admin/karyawan", 
      color: "#d69e2e", 
      bg: "#fffff0",
      icon: "🏢"
    },
    {
      title: "Pengumuman Gedung",
      desc: "Update teks berjalan (Info GA) di halaman utama Portal SIBM.",
      path: "/admin/broadcast",
      color: "#e53e3e",
      bg: "#fff5f5",
      icon: "📢"
    },
    {
      title: "Gudang ATK",
      desc: "Proses permintaan alat tulis kantor dan update status resi.",
      path: "/admin/atk",
      color: "#d53f8c",
      bg: "#fdf4ff",
      icon: "🖇️"
    },
    {
      title: "Persetujuan Overtime",
      desc: "Setujui/Tolak request lembur AC & Listrik dari tenant.",
      path: "/admin/overtime",
      color: "#dd6b20",
      bg: "#fffff0",
      icon: "⏱️"
    },
    {
      title: "Helpdesk & Tiket Kerusakan",
      desc: "Terima keluhan karyawan dan atur status perbaikan gedung.",
      path: "/admin/helpdesk", 
      color: "#2b6cb0", 
      bg: "#ebf8ff",
      icon: "🛠️"
    },
    {
      title: "Pantau Laporan OB & CS",
      desc: "Monitoring data checklist harian dan stok gudang.",
      path: "/admin/monitor-ob", 
      color: "#319795", 
      bg: "#e6fffa",
      icon: "🧹"
    },
    {
      title: "Pantau Laporan Security",
      desc: "Monitoring log patroli, tamu, dan mobilitas kendaraan.",
      path: "/admin/monitor-security", 
      color: "#4a5568", 
      bg: "#f7fafc",
      icon: "🛡️"
    },
    {
      title: "QR Code Generator",
      desc: "Cetak label QR Code untuk titik patroli & kebersihan.",
      path: "/admin/qr-manager", 
      color: "#805ad5", 
      bg: "#faf5ff",
      icon: "🖨️"
    },
    {
      title: "Laporan Eksekutif",
      desc: "Cetak rekapitulasi data operasional & logistik bulanan (PDF/Print).",
      path: "/admin/report",
      color: "#805ad5",
      bg: "#faf5ff",
      icon: "📑"
    },
  ];

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-samudera.png" alt="Logo" style={{ height: "30px", filter: "invert(1) brightness(0.2)" }} />
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "18px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Admin Desk</span>
        </div>
        <button 
          onClick={handleLogout} 
          style={{ background: "#fff5f5", color: "#e53e3e", border: "1px solid #fed7d7", padding: "8px 15px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", transition: "0.2s", display: "flex", alignItems: "center", gap: "5px" }}
          onMouseOver={(e) => { e.currentTarget.style.background = "#e53e3e"; e.currentTarget.style.color = "white"; }}
          onMouseOut={(e) => { e.currentTarget.style.background = "#fff5f5"; e.currentTarget.style.color = "#e53e3e"; }}
        >
          <span>🚪</span> Keluar Sesi
        </button>
      </div>

      {/* 🔹 HERO SECTION (TEMA MERAH SAMUDERA) */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "50px 20px 90px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 36px)", fontWeight: "900", letterSpacing: "1px" }}>CONTROL PANEL</h1>
        <p style={{ margin: "0 0 20px 0", fontSize: "15px", opacity: 0.9 }}>Pusat Kendali Sistem Informasi Building Management (SIBM)</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 25px", borderRadius: "50px", fontSize: "14px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.3)" }}>
          <span>👑</span> Halo, {adminName}
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1100px", margin: "-45px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* GRID MENU ADMIN */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "25px" }}>
          {menuAdmin.map((menu, index) => (
            <div 
              key={index}
              onClick={() => router.push(menu.path)}
              style={{
                background: "white",
                padding: "30px",
                borderRadius: "20px",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)",
                cursor: "pointer",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: "15px",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                position: "relative",
                overflow: "hidden"
              }}
              onMouseOver={(e) => { 
                e.currentTarget.style.transform = "translateY(-8px)"; 
                e.currentTarget.style.boxShadow = `0 20px 25px -5px ${menu.color}30`; 
                e.currentTarget.style.borderColor = menu.color; 
              }}
              onMouseOut={(e) => { 
                e.currentTarget.style.transform = "translateY(0)"; 
                e.currentTarget.style.boxShadow = "0 10px 25px -5px rgba(0,0,0,0.05)"; 
                e.currentTarget.style.borderColor = "#e2e8f0"; 
              }}
            >
              {/* Dekorasi Sudut Kanan Atas */}
              <div style={{ position: "absolute", top: "-15px", right: "-15px", width: "80px", height: "80px", background: menu.bg, borderRadius: "50%", opacity: 0.5 }}></div>

              <div style={{ background: menu.bg, color: menu.color, width: "65px", height: "65px", borderRadius: "18px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "32px", position: "relative", zIndex: 2 }}>
                {menu.icon}
              </div>
              
              <div style={{ position: "relative", zIndex: 2 }}>
                <h2 style={{ margin: "0 0 8px 0", color: "#1a202c", fontSize: "20px", fontWeight: "bold" }}>{menu.title}</h2>
                <p style={{ margin: "0", color: "#718096", fontSize: "14px", lineHeight: "1.6" }}>{menu.desc}</p>
              </div>
              
              <div style={{ marginTop: "auto", color: menu.color, fontSize: "14px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "5px", position: "relative", zIndex: 2 }}>
                Kelola Modul <span style={{ fontSize: "16px" }}>➔</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}