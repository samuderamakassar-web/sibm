"use client";

import { useRouter } from "next/navigation";
import { useConfirm } from "../ui/ConfirmProvider";
import { logoutWithConfirm, useAuthGuard } from "../../hooks/useAuthGuard";
import AbsensiCard from "../AbsensiCard";
import { useFcmSetup } from "../../hooks/useFcmSetup";
import AdminShell from "../admin/AdminShell";
import Tile from "../admin/Tile";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan portal utama & dashboard/ob (components/pages/DashboardOBPage.tsx)
// ==========================================
type IconProps = { size?: number; color?: string };
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
  const { session, isReady } = useAuthGuard({
    depts: ["QHSE"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus divisi QHSE.",
  });
  // QHSE belum pernah pasang push notif sama sekali sebelum ini -- dibutuhkan supaya
  // notifikasi Laporan Bahaya SBO baru (scripts/laporan-baru-reminder.mjs) beneran bisa
  // nyampe sebagai push, bukan cuma masuk kotak masuk in-app.
  useFcmSetup(session?.nama || "", !!session?.nama, "QHSE");

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

  if (!isReady || !session) return null;
  const picName = session.nama || "Staf QHSE";

  return (
    <AdminShell
      userName={picName || "Staf"}
      backHref={null}
      brandSub="QHSE"
      onLogout={handleKeluar}
      bottomNav={
        <>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/")}>
            <IconHome size={20} />
            <span>Portal Utama</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/dashboard/qhse/sbo")}>
            <IconClipboard size={20} />
            <span>SBO</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/admin/apar")}>
            <IconFireExtinguisher size={20} />
            <span>APAR</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/admin/uji-emisi")}>
            <IconCar size={20} />
            <span>Kendaraan</span>
          </button>
          <button type="button" className="sa-nav-item is-danger" onClick={handleKeluar}>
            <IconLogOut size={20} />
            <span>Keluar</span>
          </button>
        </>
      }
    >

      {/* 💡 TOKEN DESAIN & CSS RESPONSIVE — satu ekosistem dengan portal (src/app/page.tsx) & dashboard/ob (components/pages/DashboardOBPage.tsx) */}
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }

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

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {

          .admin-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .admin-card { flex-direction: row !important; align-items: center !important; padding: 15px 20px !important; gap: 15px !important; border-radius: 16px !important; }
          .admin-card:hover { transform: translateY(-2px); }
          .admin-card:active { transform: scale(0.98); }
          .admin-card-icon { width: 48px !important; height: 48px !important; border-radius: 12px !important; flex-shrink: 0; }
          .admin-card-title { font-size: 15px !important; margin-bottom: 2px !important; }
          .admin-card-desc { font-size: 11px !important; line-height: 1.4 !important; }
          .admin-card-arrow { display: none !important; }

          /* DESAIN BOTTOM NAV KHUSUS STAF LAPANGAN */
        }
      
        /* 🎨 Tema Bento Hangat (§58L) -- menimpa gaya kartu lama, token dari admin-theme.css */
        .staff-hero { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .staff-hero-label { font-size: 13px; font-weight: 600; opacity: 0.85; }
        .staff-hero-title { margin: 0; font-size: 28px; font-weight: 800; line-height: 1.12; letter-spacing: -0.02em; }
        .staff-hero-chip { align-self: flex-start; margin-top: 6px; padding: 6px 14px; border-radius: 16px; background: rgba(0,0,0,0.22); font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .section-title-icon { background: var(--red-50) !important; color: var(--red-600) !important; border-radius: 14px !important; }
        .shift-card { background: var(--tile) !important; border: none !important; box-shadow: none !important; border-radius: 28px !important; }
        .shift-badge { border: none !important; border-radius: 16px !important; }
        .coord-card { border-radius: 28px !important; box-shadow: none !important; }
        .admin-grid { gap: 12px !important; margin: 16px 0 !important; }
        .admin-card { background: var(--tile) !important; border: none !important; box-shadow: none !important; border-radius: 24px !important; }
        .admin-card:hover { transform: translateY(-2px) !important; box-shadow: none !important; }
        .admin-card-icon { border-radius: 16px !important; }
        .admin-card-title { color: var(--ink) !important; font-weight: 700 !important; }
        .admin-card-desc { color: var(--ink-soft) !important; }
        @media (max-width: 768px) {
          .staff-hero-title { font-size: 24px; }
          .admin-card { border-radius: 22px !important; }
        }
      `}} />

      {/* 🔹 KARTU SAPAAN (pengganti hero merah lama) */}
      <Tile variant="brand" className="staff-hero">
        <span className="staff-hero-label">QHSE Command Center</span>
        <h1 className="staff-hero-title">Halo, {picName.split(/\s+/)[0]}.<br />Gedung aman & sehat hari ini?</h1>
      </Tile>

      <div>

        <AbsensiCard picName={picName} departemen="QHSE" />

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

    </AdminShell>
  );
}
