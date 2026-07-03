"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState<string>("Admin");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 💡 VALIDASI KEAMANAN TINGKAT TINGGI (STRICT MODE)
    const role = localStorage.getItem("pic_role") || "";
    const dept = localStorage.getItem("pic_dept") || "";
    const nama = localStorage.getItem("pic_nama");

    // Jika bukan Admin GA, langsung tendang keluar dan hapus sesi (Force Logout)
    if (!nama || dept !== "Admin GA" || !role.includes("Admin")) {
      localStorage.clear();
      router.replace("/");
      return;
    }

    setTimeout(() => {
      setAdminName(nama);
      setIsReady(true);
    }, 0);
  }, [router]);

  const handleLogout = () => {
    if (window.confirm("Apakah Anda yakin ingin keluar dari Sesi Admin?")) {
      localStorage.clear();
      router.replace("/");
    }
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

  if (!isReady) return null;

  return (
    <div className="main-container" style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      
      {/* 💡 CSS RESPONSIVE & MOBILE BOTTOM NAV */}
      <style dangerouslySetInnerHTML={{__html: `
        .main-container { padding-bottom: 50px; }
        .admin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; }
        .admin-card {
          background: white; padding: 30px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
          cursor: pointer; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 15px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;
        }
        .admin-card:hover { transform: translateY(-8px); border-color: var(--hover-color); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        .admin-card-icon { width: 65px; height: 65px; border-radius: 18px; display: flex; justify-content: center; align-items: center; font-size: 32px; position: relative; z-index: 2; }
        .admin-card-title { margin: 0 0 8px 0; color: #1a202c; font-size: 20px; font-weight: bold; }
        .admin-card-desc { margin: 0; color: #718096; font-size: 14px; line-height: 1.6; }
        .admin-card-arrow { margin-top: auto; font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 5px; position: relative; z-index: 2; }
        .mobile-nav { display: none; }

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .main-container { padding-bottom: 90px !important; }
          .admin-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .admin-card { flex-direction: row !important; align-items: center !important; padding: 15px 20px !important; gap: 15px !important; border-radius: 16px !important; }
          .admin-card:hover { transform: translateY(-2px); }
          .admin-card:active { transform: scale(0.98); }
          .admin-card-icon { width: 50px !important; height: 50px !important; font-size: 24px !important; border-radius: 12px !important; flex-shrink: 0; }
          .admin-card-title { font-size: 15px !important; margin-bottom: 2px !important; }
          .admin-card-desc { font-size: 11px !important; line-height: 1.4 !important; }
          .admin-card-arrow { display: none !important; } 
          .admin-bg-decor { display: none !important; }

          /* DESAIN BOTTOM NAV KHUSUS RUANG ADMIN (SECURE AREA) */
          .mobile-nav {
            display: flex !important; position: fixed; bottom: 0; left: 0; right: 0;
            background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(15px); border-top: 1px solid #e2e8f0;
            z-index: 90; padding: 12px 15px; justify-content: space-around; box-shadow: 0 -10px 25px -5px rgba(0,0,0,0.1);
          }
          .m-nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; color: #4a5568; font-size: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; }
          .m-nav-icon { font-size: 22px; margin-bottom: 2px; }
          .m-nav-item:active { transform: scale(0.9); }
          .hide-on-mobile { display: none !important; }
        }
      `}} />
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div className="hide-on-mobile" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
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
          <span>🚪</span> Keluar Sesi Admin
        </button>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "50px 20px 90px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 36px)", fontWeight: "900", letterSpacing: "1px" }}>CONTROL PANEL</h1>
        <p style={{ margin: "0 0 20px 0", fontSize: "14px", opacity: 0.9 }}>Pusat Kendali Sistem Informasi Building Management</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 25px", borderRadius: "50px", fontSize: "14px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.3)" }}>
          <span>👑</span> Halo, {adminName}
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1100px", margin: "-45px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* GRID MENU ADMIN */}
        <div className="admin-grid">
          {menuAdmin.map((menu, index) => (
            <div 
              key={index}
              className="admin-card"
              onClick={() => router.push(menu.path)}
              style={{ "--hover-color": menu.color } as React.CSSProperties}
            >
              {/* Dekorasi Sudut (Hidden on Mobile) */}
              <div className="admin-bg-decor" style={{ position: "absolute", top: "-15px", right: "-15px", width: "80px", height: "80px", background: menu.bg, borderRadius: "50%", opacity: 0.5 }}></div>

              <div className="admin-card-icon" style={{ background: menu.bg, color: menu.color }}>
                {menu.icon}
              </div>
              
              <div style={{ position: "relative", zIndex: 2 }}>
                <h2 className="admin-card-title">{menu.title}</h2>
                <p className="admin-card-desc">{menu.desc}</p>
              </div>
              
              <div className="admin-card-arrow" style={{ color: menu.color }}>
                Kelola <span style={{ fontSize: "16px" }}>➔</span>
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* 📱 BOTTOM NAVIGATION EKSKLUSIF ADMIN (HANYA MUNCUL DI HP) */}
      <div className="mobile-nav">
        {/* Mengembalikan ke posisi atas (Dashboard Admin) bukan Portal Utama */}
        <div className="m-nav-item" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
          <div className="m-nav-icon" style={{color: "#2b6cb0"}}>🛡️</div>
          <span style={{color: "#2b6cb0"}}>Beranda</span>
        </div>
        <div className="m-nav-item" onClick={() => router.push("/admin/users")}>
          <div className="m-nav-icon">👥</div>
          <span>Pengguna</span>
        </div>
        <div className="m-nav-item" onClick={() => router.push("/admin/report")}>
          <div className="m-nav-icon">📊</div>
          <span>Laporan</span>
        </div>
        <div className="m-nav-item" onClick={handleLogout}>
          <div className="m-nav-icon" style={{color: "#e53e3e"}}>🔒</div>
          <span style={{color: "#e53e3e"}}>Keluar</span>
        </div>
      </div>

    </div>
  );
}