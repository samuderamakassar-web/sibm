"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useConfirm } from "../ui/ConfirmProvider";
import { logoutWithConfirm } from "../../hooks/useAuthGuard";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan portal utama & dashboard/ob (components/pages/DashboardOBPage.tsx)
// ==========================================
type IconProps = { size?: number; color?: string };
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconLogOut = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
);
const IconChevronRight = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
);
const IconHome = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-6h4v6" /></svg>
);
const IconClipboard = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6" /><path d="M9 15h6" /><path d="M9 19h3" /></svg>
);
const IconFireExtinguisher = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3v2" /><path d="M8 5h6l1 2H7z" /><path d="M9 7v3" /><path d="M15 7l4-2" /><path d="M9 10h4a3 3 0 0 1 3 3v8H8v-8a3 3 0 0 1 1-2z" /><path d="M8 15h8" /></svg>
);
const IconCar = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14" /><path d="M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M23 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M3 17v-4l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v4" /><path d="M3 13h18" /></svg>
);

export default function DashboardQHSEPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [picName, setPicName] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");
    const dept = localStorage.getItem("pic_dept");

    if (!role || dept !== "QHSE") {
      router.push("/");
      return;
    }
    setTimeout(() => { setPicName(nama || "Staf QHSE"); setIsReady(true); }, 0);
  }, [router]);

  const handleKeluar = () => logoutWithConfirm(confirm, router);

  // MENU UTAMA QHSE — warna dipetakan ke token desain (lihat tokenColors di bawah)
  const menuQHSE = [
    { title: "Safety Behavior Observation", desc: "Database temuan bahaya & tindak lanjut SBO.", path: "/dashboard/qhse/sbo", token: "ok", icon: IconClipboard },
    { title: "Inspeksi APAR", desc: "Riwayat & status inspeksi APAR per lantai gedung.", path: "/admin/apar", token: "red", icon: IconFireExtinguisher },
    { title: "Hasil Inspeksi Kendaraan", desc: "Rekap hasil uji emisi & jadwal servis armada.", path: "/admin/uji-emisi", token: "info", icon: IconCar },
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

      {/* 💡 TOKEN DESAIN & CSS RESPONSIVE — satu ekosistem dengan portal (src/app/page.tsx) & dashboard/ob (components/pages/DashboardOBPage.tsx) */}
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        * { box-sizing: border-box; }
        .main-container { padding-bottom: 50px; }

        .site-header {
          position: sticky; top: 0; z-index: 50;
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
          padding: 40px 20px 80px; text-align: center;
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

        .admin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .admin-card {
          background: var(--surface); padding: 25px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
          cursor: pointer; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 15px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;
        }
        .admin-card:hover { transform: translateY(-5px); border-color: var(--hover-color); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        .admin-card-icon { width: 55px; height: 55px; border-radius: 16px; display: flex; justify-content: center; align-items: center; }
        .admin-card-title { margin: 0 0 5px 0; color: var(--ink); font-size: 17px; font-weight: bold; }
        .admin-card-desc { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
        .admin-card-arrow { margin-top: auto; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 4px; }

        .mobile-nav { display: none; }
        .hide-on-mobile { display: flex; }

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .main-container { padding-bottom: 90px !important; }
          .hide-on-mobile { display: none !important; }

          .admin-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .admin-card { flex-direction: row !important; align-items: center !important; padding: 15px 20px !important; gap: 15px !important; border-radius: 16px !important; }
          .admin-card:hover { transform: translateY(-2px); }
          .admin-card:active { transform: scale(0.98); }
          .admin-card-icon { width: 48px !important; height: 48px !important; border-radius: 12px !important; flex-shrink: 0; }
          .admin-card-title { font-size: 15px !important; margin-bottom: 2px !important; }
          .admin-card-desc { font-size: 11px !important; line-height: 1.4 !important; }
          .admin-card-arrow { display: none !important; }

          /* DESAIN BOTTOM NAV KHUSUS STAF LAPANGAN */
          .mobile-nav {
            display: flex !important; position: fixed; bottom: 0; left: 0; right: 0;
            background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(15px); border-top: 1px solid var(--line);
            z-index: 90; padding: 12px 10px; justify-content: space-between; box-shadow: 0 -10px 25px -5px rgba(0,0,0,0.1);
            overflow-x: auto; scroll-snap-type: x mandatory;
          }
          .mobile-nav::-webkit-scrollbar { display: none; }
          .m-nav-item {
            display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--ink-soft);
            font-size: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; background: none; border: none; font-family: inherit;
            flex: 0 0 auto; min-width: 65px; scroll-snap-align: start; text-align: center;
          }
          .m-nav-item:active { transform: scale(0.9); }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR (desktop) */}
      <div className="hide-on-mobile site-header">
        <div className="site-header-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-samudera.png" alt="Logo" style={{ height: "30px" }} />
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "16px", borderLeft: "2px solid var(--line)", paddingLeft: "10px" }}>QHSE Desk</span>
        </div>
        <button className="logout-btn" onClick={handleKeluar}>
          <IconLogOut size={15} /> Keluar
        </button>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>QHSE COMMAND CENTER</h1>
          <p style={{ margin: "0 0 20px 0", fontSize: "14px", opacity: 0.9 }}>Sistem Pemantauan Keselamatan & Lingkungan Kerja Gedung</p>
          <div className="admin-hero-badge">
            <IconUserCircle size={16} /> PIC: {picName}
          </div>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1100px", margin: "-45px auto 0", padding: "0 15px", position: "relative", zIndex: 10 }}>

        {/* 🔹 GRID MENU UTAMA QHSE */}
        <div className="admin-grid">
          {menuQHSE.map((menu, index) => {
            const tc = tokenColors[menu.token];
            const MenuIcon = menu.icon;
            return (
              <div
                key={index}
                className="admin-card"
                onClick={() => router.push(menu.path)}
                style={{ "--hover-color": tc.color } as React.CSSProperties}
              >
                <div className="admin-card-icon" style={{ background: tc.bg, color: tc.color }}>
                  <MenuIcon size={26} />
                </div>
                <div>
                  <h2 className="admin-card-title">{menu.title}</h2>
                  <p className="admin-card-desc">{menu.desc}</p>
                </div>
                <div className="admin-card-arrow" style={{ color: tc.color }}>Buka Modul <IconChevronRight size={14} /></div>
              </div>
            );
          })}
        </div>

      </div>

      {/* 📱 BOTTOM NAVIGATION EKSKLUSIF LAPANGAN (HANYA MUNCUL DI HP) */}
      <div className="mobile-nav">
        <button className="m-nav-item" onClick={() => router.push("/")}>
          <IconHome size={20} />
          <span>Portal Utama</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/dashboard/qhse/sbo")} style={{ color: "var(--ok)" }}>
          <IconClipboard size={20} />
          <span>SBO</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/admin/apar")} style={{ color: "var(--red-600)" }}>
          <IconFireExtinguisher size={20} />
          <span>APAR</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/admin/uji-emisi")} style={{ color: "var(--info)" }}>
          <IconCar size={20} />
          <span>Kendaraan</span>
        </button>
        <button className="m-nav-item" onClick={handleKeluar} style={{ color: "var(--red-600)" }}>
          <IconLogOut size={20} />
          <span>Keluar</span>
        </button>
      </div>

    </div>
  );
}
