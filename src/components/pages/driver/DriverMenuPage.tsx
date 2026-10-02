"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, limit, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard, logoutWithConfirm } from "../../../hooks/useAuthGuard";
import { useFcmSetup } from "../../../hooks/useFcmSetup";
import { useToast } from "../../ui/ToastProvider";
import { useConfirm } from "../../ui/ConfirmProvider";
import AbsensiCard from "../../AbsensiCard";
import KlaimLemburModal from "../../KlaimLemburModal";
import AdminShell from "../../admin/AdminShell";
import Tile from "../../admin/Tile";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan dashboard/security
// ==========================================
type IconProps = { size?: number; color?: string };
const IconCar = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14" /><path d="M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M23 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M3 17v-4l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v4" /><path d="M3 13h18" /></svg>
);
const IconSearch = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
const IconWrench = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>
);
const IconClipboardList = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6" /><path d="M9 15h6" /><path d="M9 19h3" /></svg>
);
const IconClock = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconLogOut = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
);
const IconBook = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
);

export default function DriverMenuPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();

  const { session, isReady } = useAuthGuard({
    depts: ["Driver"],
    adminBypass: false,
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Driver.",
  });
  const activeDriver = session?.nama || "Driver";
  // Dulu FCM cuma didaftarkan di DriverArmadaPage.tsx (menu "Bawa Armada") -- driver yang gak
  // pernah buka menu itu jadi GAK PERNAH punya token FCM sama sekali, otomatis gak pernah
  // kebagian push notif apa pun (ketemu pas audit notifikasi 19 Sep 2026). Dipindah/ditambah di
  // sini (halaman utama Driver, pasti dibuka tiap login) biar semua driver kebagian token.
  useFcmSetup(session?.nama || "", !!session?.nama, "Driver");

  const [waktuSekarang, setWaktuSekarang] = useState<string>("");
  const [isLoadingPersonel, setIsLoadingPersonel] = useState<boolean>(false);
  const [statusTerkini, setStatusTerkini] = useState<string>("Memuat...");

  const [activeModal, setActiveModal] = useState<"none" | "lembur">("none");

  useEffect(() => {
    const timer = setInterval(() => {
      setWaktuSekarang(new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeDriver) return;
    const qStatus = query(collection(db, "driver_status_logs"), where("nama_driver", "==", activeDriver), orderBy("waktu_ubah", "desc"), limit(1));
    const unsub = onSnapshot(qStatus, (snap) => {
      setStatusTerkini(snap.empty ? "Standby" : snap.docs[0].data().status);
    });
    return () => unsub();
  }, [activeDriver]);

  const handleLogout = () => logoutWithConfirm(confirm, router);

  const handleUpdateStatusPersonel = async (statusBaru: string) => {
    setIsLoadingPersonel(true);
    try {
      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: activeDriver,
        status: statusBaru,
        waktu_ubah: serverTimestamp(),
        petugas_security: "Aplikasi Driver"
      });
      showToast(`Status Anda berhasil diubah menjadi: ${statusBaru}`, "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal mengupdate status.", "error");
    } finally {
      setIsLoadingPersonel(false);
    }
  };



  // hideOnMobile: true = card disembunyikan di HP karena modulnya sudah ada shortcut permanen di bottom nav
  const menuDriver = [
    { title: "Bawa Armada", desc: "Catat pergerakan kendaraan keluar/tiba & KM.", path: "/dashboard/driver/armada", action: "link", token: "info", icon: IconCar, hideOnMobile: true },
    { title: "Inspeksi Mingguan", desc: "Checklist kondisi kendaraan tiap minggu.", path: "/dashboard/driver/inspeksi", action: "link", token: "ok", icon: IconSearch, hideOnMobile: true },
    { title: "Servis, Emisi & Odometer", desc: "Laporan servis, uji emisi, & catat odometer.", path: "/dashboard/driver/servis", action: "link", token: "warn", icon: IconWrench, hideOnMobile: true },
    { title: "Riwayat Armada Saya", desc: "Lihat semua log perjalanan Anda.", path: "/dashboard/driver/riwayat", action: "link", token: "accent", icon: IconClipboardList, hideOnMobile: false },
    { title: "Klaim Lembur / Perjalanan Dinas", desc: "Rekap & input lemburan periode berjalan.", path: "", action: "modal_lembur", token: "red", icon: IconClock, hideOnMobile: false },
    { title: "SOP & Instruksi Kerja", desc: "Pelajari dokumen SOP/IK terbaru untuk Tim Driver.", path: "/dashboard/driver/sop", action: "link", token: "info", icon: IconBook, hideOnMobile: false },
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
    <AdminShell
      userName={activeDriver || "Staf"}
      backHref={null}
      brandSub="Driver"
      onLogout={handleLogout}
      bottomNav={
        <>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/dashboard/driver/armada")}>
            <IconCar size={20} />
            <span>Armada</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/dashboard/driver/inspeksi")}>
            <IconSearch size={20} />
            <span>Inspeksi</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/dashboard/driver/servis")}>
            <IconWrench size={20} />
            <span>Servis</span>
          </button>
          <button type="button" className="sa-nav-item is-danger" onClick={handleLogout}>
            <IconLogOut size={20} />
            <span>Keluar</span>
          </button>
        </>
      }
    >
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }

        .driver-menu-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 18px; }
        .driver-menu-card {
          background: var(--surface); padding: 24px; border-radius: 22px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
          cursor: pointer; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 14px;
          transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
        }
        .driver-menu-card:hover { transform: translateY(-4px); box-shadow: 0 18px 30px -8px rgba(0,0,0,0.14); }
        .driver-menu-card-icon { width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
        .driver-menu-card-title { margin: 0 0 4px 0; color: var(--ink); font-size: 16px; font-weight: 800; }
        .driver-menu-card-desc { margin: 0; color: var(--ink-soft); font-size: 12.5px; line-height: 1.5; }

        @media (max-width: 640px) {
          .driver-page-root { padding-bottom: 90px !important; }
          .driver-menu-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .hide-card-mobile { display: none !important; }
          .driver-menu-card { flex-direction: row !important; align-items: center !important; padding: 16px 18px !important; border-radius: 18px !important; }
          .driver-menu-card-icon { width: 46px !important; height: 46px !important; flex-shrink: 0; }

          /* 📱 DESAIN BOTTOM NAV MODERN — samain pola sama dashboard/security & dashboard/qhse */
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
        <span className="staff-hero-label">Dashboard Operasional Pengemudi</span>
        <h1 className="staff-hero-title">Halo, {activeDriver.split(/\s+/)[0]}.<br />Siap jalan hari ini?</h1>
        <span className="staff-hero-chip">{waktuSekarang}</span>
      </Tile>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* 🔹 CARD STATUS KESIAGAAN INSTAN */}
        <div style={{ background: "var(--surface)", padding: "20px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "15px", fontWeight: "800" }}>📡 Status Anda Saat Ini:</h3>
            <span style={{ fontSize: "11px", fontWeight: "bold", padding: "6px 12px", borderRadius: "8px", background: statusTerkini === "Standby" ? "#c6f6d5" : statusTerkini === "Keluar Beroperasi" ? "#fed7d7" : "#e2e8f0", color: statusTerkini === "Standby" ? "#22543d" : statusTerkini === "Keluar Beroperasi" ? "#9b2c2c" : "#4a5568" }}>
              {statusTerkini === "Standby" ? "🟢 STANDBY" : statusTerkini === "Keluar Beroperasi" ? "🔴 KELUAR" : "⚪ OFF DUTY"}
            </span>
          </div>

          <p style={{ fontSize: "12px", color: "var(--ink-soft)", marginBottom: "15px", lineHeight: "1.5" }}>Tekan tombol di bawah jika Anda keluar/pulang <b>tanpa membawa armada kantor</b> (misal: naik motor/kendaraan pribadi). Kalau membawa mobil kantor, status Anda otomatis tersinkron lewat menu <b>Bawa Armada</b>.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button disabled={isLoadingPersonel} onClick={() => handleUpdateStatusPersonel("Keluar Beroperasi")} style={{ padding: "14px", background: "#fff5f5", color: "#c53030", border: "2px solid #feb2b2", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", transition: "0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
              <span style={{ fontSize: "20px" }}>🏃‍♂️</span> Keluar Pos
            </button>
            <button disabled={isLoadingPersonel} onClick={() => handleUpdateStatusPersonel("Standby")} style={{ padding: "14px", background: "#f0fff4", color: "#2f855a", border: "2px solid #9ae6b4", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", transition: "0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
              <span style={{ fontSize: "20px" }}>🛋️</span> Kembali Standby
            </button>
          </div>
        </div>

        <AbsensiCard picName={session?.nama || ""} departemen="Driver" />

        {/* 🔹 GRID MENU UTAMA DRIVER */}
        <div className="driver-menu-grid">
          {menuDriver.map((menu, index) => {
            const tc = tokenColors[menu.token];
            const MenuIcon = menu.icon;
            return (
              <div key={index} className={`driver-menu-card${menu.hideOnMobile ? " hide-card-mobile" : ""}`} onClick={() => menu.action === "modal_lembur" ? setActiveModal("lembur") : router.push(menu.path)}>
                <div className="driver-menu-card-icon" style={{ background: tc.bg, color: tc.color }}>
                  <MenuIcon size={24} />
                </div>
                <div>
                  <h2 className="driver-menu-card-title">{menu.title}</h2>
                  <p className="driver-menu-card-desc">{menu.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* 📱 BOTTOM NAVIGATION EKSKLUSIF LAPANGAN (HANYA MUNCUL DI HP) — 4 menu paling sering dipakai + Keluar.
          Tidak ada shortcut langsung ke Portal Utama: keluar dari app Driver wajib lewat logout (tombol Keluar),
          bukan pindah halaman sambil sesi login masih menempel di localStorage. */}

      {/* Klaim lembur tim -- komponen bersama Security/OB/Driver (§63) */}
      <KlaimLemburModal open={activeModal === "lembur"} onClose={() => setActiveModal("none")} picName={session?.nama || ""} departemen="Driver" judul="Klaim Lembur / Perjalanan Dinas" labelArea="Tujuan / Keterangan" placeholderArea="Cth: Perjalanan dinas Maros" areaBawaan="Perjalanan Dinas Luar Kota / Lembur" alasanBawaan="Antar Jemput Manajemen" placeholderAlasan="Cth: Antar jemput manajemen" />

    </AdminShell>
  );
}
