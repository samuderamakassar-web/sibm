"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Ikon SVG garis — set sama dengan portal utama (src/app/page.tsx) & shell subhalaman admin
type IconProps = { size?: number; color?: string };
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconIdCard = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M6 16c.5-1.7 1.6-2.5 2.5-2.5s2 .8 2.5 2.5" /><path d="M14 10h5" /><path d="M14 13.5h5" /></svg>
);
const IconClipboard = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6" /><path d="M9 15h6" /><path d="M9 19h3" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconWrench = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.6 5l-6 6 2.6 2.6 6-6a4 4 0 0 0 5.6-5.6l-3 3-2.6-2.6 3-3z" /></svg>
);
const IconTruck = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13" /><rect x="3" y="13" width="18" height="5" rx="1.5" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" /></svg>
);
const IconShield = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3z" /></svg>
);
const IconChevronRight = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
);
const IconBuilding = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 21v-4h6v4" /><path d="M8 7h1" /><path d="M8 11h1" /><path d="M8 15h1" /><path d="M15 7h1" /><path d="M15 11h1" /></svg>
);
const IconMegaphone = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1z" /><path d="M15 8a4 4 0 0 1 0 8" /><path d="M18 5a7.5 7.5 0 0 1 0 14" /></svg>
);
const IconBroom = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 3 11 11" /><path d="M11 11 4 18" /><path d="M4 18l-1.5 3.5L6 20" /><path d="M6.5 15.5 8 17" /><path d="M9 12.5 10.5 14" /></svg>
);
const IconPrinter = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M6 17v4h12v-4" /></svg>
);
const IconFileText = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5" /><path d="M9.5 16.5h5" /></svg>
);
const IconLogOut = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
);

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
      token: "info",
      icon: IconIdCard,
    },
    {
      title: "Master Data Karyawan",
      desc: "Upload CSV dan kelola direktori 70+ karyawan SIBM.",
      path: "/admin/karyawan",
      token: "warn",
      icon: IconBuilding,
    },
    {
      title: "Master Data Kendaraan",
      desc: "Kelola foto, PIC, odometer, dan riwayat servis armada.",
      path: "/admin/kendaraan",
      token: "ok",
      icon: IconTruck,
    },
    {
      title: "Pengumuman Gedung",
      desc: "Update teks berjalan (Info GA) di halaman utama Portal SIBM.",
      path: "/admin/broadcast",
      token: "red",
      icon: IconMegaphone,
    },
    {
      title: "Gudang ATK",
      desc: "Proses permintaan alat tulis kantor dan update status resi.",
      path: "/admin/atk",
      token: "accent",
      icon: IconClipboard,
    },
    {
      title: "Persetujuan Overtime",
      desc: "Setujui/Tolak request lembur AC & Listrik dari tenant.",
      path: "/admin/overtime",
      token: "info",
      icon: IconClock,
    },
    {
      title: "Helpdesk & Tiket Kerusakan",
      desc: "Terima keluhan karyawan dan atur status perbaikan gedung.",
      path: "/admin/helpdesk",
      token: "warn",
      icon: IconWrench,
    },
    {
      title: "Pantau Laporan OB & CS",
      desc: "Monitoring data checklist harian dan stok gudang.",
      path: "/admin/monitor-ob",
      token: "ok",
      icon: IconBroom,
    },
    {
      title: "Pantau Laporan Security",
      desc: "Monitoring log patroli, tamu, dan mobilitas kendaraan.",
      path: "/admin/monitor-security",
      token: "red",
      icon: IconShield,
    },
    {
      title: "QR Code Generator",
      desc: "Cetak label QR Code untuk titik patroli & kebersihan.",
      path: "/admin/qr-manager",
      token: "accent",
      icon: IconPrinter,
    },
    {
      title: "Laporan Eksekutif",
      desc: "Cetak rekapitulasi data operasional & logistik bulanan (PDF/Print).",
      path: "/admin/report",
      token: "info",
      icon: IconFileText,
    },
  ];

  const tokenColors: Record<string, { bg: string; color: string }> = {
    info: { bg: "var(--info-50)", color: "var(--info)" },
    warn: { bg: "var(--warn-50)", color: "var(--warn)" },
    ok: { bg: "var(--ok-50)", color: "var(--ok)" },
    red: { bg: "var(--red-50)", color: "var(--red-600)" },
    accent: { bg: "#f5f3ff", color: "var(--accent)" },
  };

  if (!isReady) return null;

  return (
    <div className="main-container" style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>

      {/* 💡 CSS RESPONSIVE & MOBILE BOTTOM NAV */}
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        .main-container { padding-bottom: 50px; }
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .site-header-brand { display: flex; align-items: center; gap: 10px; }
        .logout-btn {
          display: flex; align-items: center; gap: 6px; background: var(--red-50); color: var(--red-600);
          border: 1px solid rgba(220,38,38,0.2); padding: 8px 15px; border-radius: 8px; font-size: 13px;
          font-weight: 700; font-family: inherit; cursor: pointer; transition: 0.2s;
        }
        .logout-btn:hover { background: var(--red-600); color: white; }
        .admin-hero {
          position: relative; overflow: hidden; border-radius: 0 0 30px 30px; color: #fff;
          padding: 50px 20px 90px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .admin-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .admin-hero-content { position: relative; }
        .admin-hero-badge {
          display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.15);
          backdrop-filter: blur(5px); padding: 8px 22px; border-radius: 50px; font-size: 14px; font-weight: 700;
          border: 1px solid rgba(255,255,255,0.3);
        }
        .admin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; }
        .admin-card {
          background: var(--surface); padding: 30px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
          cursor: pointer; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 15px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;
        }
        .admin-card:hover { transform: translateY(-8px); border-color: var(--hover-color); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        .admin-card-icon { width: 60px; height: 60px; border-radius: 16px; display: flex; justify-content: center; align-items: center; position: relative; z-index: 2; }
        .admin-card-title { margin: 0 0 8px 0; color: var(--ink); font-size: 20px; font-weight: bold; }
        .admin-card-desc { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; }
        .admin-card-arrow { margin-top: auto; font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 5px; position: relative; z-index: 2; }
        .mobile-nav { display: none; }

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .main-container { padding-bottom: 90px !important; }
          .admin-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .admin-card { flex-direction: row !important; align-items: center !important; padding: 15px 20px !important; gap: 15px !important; border-radius: 16px !important; }
          .admin-card:hover { transform: translateY(-2px); }
          .admin-card:active { transform: scale(0.98); }
          .admin-card-icon { width: 48px !important; height: 48px !important; border-radius: 12px !important; flex-shrink: 0; }
          .admin-card-title { font-size: 15px !important; margin-bottom: 2px !important; }
          .admin-card-desc { font-size: 11px !important; line-height: 1.4 !important; }
          .admin-card-arrow { display: none !important; }
          .admin-bg-decor { display: none !important; }

          /* DESAIN BOTTOM NAV KHUSUS RUANG ADMIN (SECURE AREA) */
          .mobile-nav {
            display: flex !important; position: fixed; bottom: 0; left: 0; right: 0;
            background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(15px); border-top: 1px solid var(--line);
            z-index: 90; padding: 12px 15px; justify-content: space-around; box-shadow: 0 -10px 25px -5px rgba(0,0,0,0.1);
          }
          .m-nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--ink-soft); font-size: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; background: none; border: none; font-family: inherit; }
          .m-nav-item:active { transform: scale(0.9); }
          .hide-on-mobile { display: none !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="hide-on-mobile site-header">
        <div className="site-header-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-samudera.png" alt="Logo" style={{ height: "30px", filter: "invert(1) brightness(0.2)" }} />
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "18px", borderLeft: "2px solid var(--line)", paddingLeft: "10px" }}>Admin Desk</span>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          <IconLogOut size={15} /> Keluar Sesi Admin
        </button>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 36px)", fontWeight: "900", letterSpacing: "1px" }}>CONTROL PANEL</h1>
          <p style={{ margin: "0 0 20px 0", fontSize: "14px", opacity: 0.9 }}>Pusat Kendali Sistem Informasi Building Management</p>
          <div className="admin-hero-badge">
            <IconUserCircle size={16} /> Halo, {adminName}
          </div>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1100px", margin: "-45px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>

        {/* GRID MENU ADMIN */}
        <div className="admin-grid">
          {menuAdmin.map((menu, index) => {
            const tc = tokenColors[menu.token];
            const MenuIcon = menu.icon;
            return (
              <div
                key={index}
                className="admin-card"
                onClick={() => router.push(menu.path)}
                style={{ "--hover-color": tc.color } as React.CSSProperties}
              >
                {/* Dekorasi Sudut (Hidden on Mobile) */}
                <div className="admin-bg-decor" style={{ position: "absolute", top: "-15px", right: "-15px", width: "80px", height: "80px", background: tc.bg, borderRadius: "50%", opacity: 0.5 }}></div>

                <div className="admin-card-icon" style={{ background: tc.bg, color: tc.color }}>
                  <MenuIcon size={26} />
                </div>

                <div style={{ position: "relative", zIndex: 2 }}>
                  <h2 className="admin-card-title">{menu.title}</h2>
                  <p className="admin-card-desc">{menu.desc}</p>
                </div>

                <div className="admin-card-arrow" style={{ color: tc.color }}>
                  Kelola <IconChevronRight size={14} />
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* 📱 BOTTOM NAVIGATION EKSKLUSIF ADMIN (HANYA MUNCUL DI HP) */}
      <div className="mobile-nav">
        {/* Mengembalikan ke posisi atas (Dashboard Admin) bukan Portal Utama */}
        <button className="m-nav-item" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} style={{ color: "var(--info)" }}>
          <IconShield size={20} />
          <span>Beranda</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/admin/users")}>
          <IconIdCard size={20} />
          <span>Pengguna</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/admin/report")}>
          <IconFileText size={20} />
          <span>Laporan</span>
        </button>
        <button className="m-nav-item" onClick={handleLogout} style={{ color: "var(--red-600)" }}>
          <IconLogOut size={20} />
          <span>Keluar</span>
        </button>
      </div>

    </div>
  );
}
