"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, limit, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard, logoutWithConfirm } from "../../../hooks/useAuthGuard";
import { useToast } from "../../ui/ToastProvider";
import { useConfirm } from "../../ui/ConfirmProvider";

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

interface OvertimeItemRequest {
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  area_ruangan: string;
  alasan: string;
}

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

  const [waktuSekarang, setWaktuSekarang] = useState<string>("");
  const [isLoadingPersonel, setIsLoadingPersonel] = useState<boolean>(false);
  const [statusTerkini, setStatusTerkini] = useState<string>("Memuat...");

  // STATE MODAL & MULTI-ROW OVERTIME — pakai tanggal WITA (Asia/Makassar), BUKAN toISOString() (UTC-based)
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const [activeModal, setActiveModal] = useState<"none" | "lembur">("none");
  const [isLemburLoading, setIsLemburLoading] = useState(false);
  const [periodeLembur, setPeriodeLembur] = useState("11 Juni - 10 Juli 2026");
  const [formLemburItems, setFormLemburItems] = useState<OvertimeItemRequest[]>([
    { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Perjalanan Dinas Luar Kota / Lembur", alasan: "Antar Jemput Manajemen" }
  ]);

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

  const handleAddLemburRow = () => {
    setFormLemburItems([...formLemburItems, { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Perjalanan Dinas Luar Kota / Lembur", alasan: "Antar Jemput Manajemen" }]);
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
      return showToast("Mohon lengkapi seluruh kolom tanggal, jam, dan keterangan lembur yang Anda tambahkan!", "warning");
    }
    setIsLemburLoading(true);
    try {
      const dept = localStorage.getItem("pic_dept") || "Driver";
      await addDoc(collection(db, "ga_overtime_requests"), {
        nama_pemohon: activeDriver,
        departemen: dept,
        periode: periodeLembur,
        items: formLemburItems,
        status: "Menunggu Approval GA",
        waktu_request: serverTimestamp()
      });
      showToast(`Berhasil! ${formLemburItems.length} klaim lembur Anda untuk periode ${periodeLembur} telah dikirim ke Admin GA.`, "success");
      setFormLemburItems([{ tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Perjalanan Dinas Luar Kota / Lembur", alasan: "Antar Jemput Manajemen" }]);
      setActiveModal("none");
    } catch (error) {
      console.error(error);
      showToast("Gagal mengirim rekapan klaim lembur.", "error");
    } finally {
      setIsLemburLoading(false);
    }
  };

  const sharedInputStyle = {
    width: "100%", padding: "16px", borderRadius: "14px", border: "1px solid #cbd5e0",
    fontSize: "15px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const,
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s", color: "#2d3748"
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
    <div className="driver-page-root" style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        * { box-sizing: border-box; }
        .driver-site-header {
          position: sticky; top: 0; z-index: 50;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 20px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .driver-hero {
          position: relative; overflow: hidden; border-radius: 0 0 30px 30px; color: #fff;
          padding: 30px 20px 55px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .driver-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .driver-hero-content { position: relative; }

        .driver-menu-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 18px; }
        .driver-menu-card {
          background: white; padding: 24px; border-radius: 22px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
          cursor: pointer; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 14px;
          transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
        }
        .driver-menu-card:hover { transform: translateY(-4px); box-shadow: 0 18px 30px -8px rgba(0,0,0,0.14); }
        .driver-menu-card-icon { width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
        .driver-menu-card-title { margin: 0 0 4px 0; color: #1a202c; font-size: 16px; font-weight: 800; }
        .driver-menu-card-desc { margin: 0; color: #718096; font-size: 12.5px; line-height: 1.5; }

        .mobile-nav { display: none; }

        @media (max-width: 640px) {
          .driver-page-root { padding-bottom: 90px !important; }
          .driver-menu-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .hide-card-mobile { display: none !important; }
          .driver-menu-card { flex-direction: row !important; align-items: center !important; padding: 16px 18px !important; border-radius: 18px !important; }
          .driver-menu-card-icon { width: 46px !important; height: 46px !important; flex-shrink: 0; }

          /* 📱 DESAIN BOTTOM NAV MODERN — samain pola sama dashboard/security & dashboard/qhse */
          .mobile-nav {
            display: flex !important; position: fixed; bottom: 0; left: 0; right: 0;
            background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(15px); border-top: 1px solid #e2e8f0;
            z-index: 90; padding: 12px 10px; justify-content: space-between; box-shadow: 0 -10px 25px -5px rgba(0,0,0,0.1);
            overflow-x: auto; scroll-snap-type: x mandatory;
          }
          .mobile-nav::-webkit-scrollbar { display: none; }
          .m-nav-item {
            display: flex; flex-direction: column; align-items: center; gap: 4px; color: #4a5568;
            font-size: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; background: none; border: none; font-family: inherit;
            flex: 0 0 auto; min-width: 70px; scroll-snap-align: start; text-align: center;
          }
          .m-nav-item:active { transform: scale(0.9); }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="driver-site-header">
        <div style={{ fontWeight: "900", color: "var(--red-600)", fontSize: "18px", letterSpacing: "1px" }}>SIBM <span style={{color:"var(--ink)"}}>DRIVER</span></div>
        <button onClick={handleLogout} style={{ background: "var(--red-50)", color: "var(--red-600)", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", border: "1px solid rgba(220,38,38,0.2)", cursor: "pointer", fontFamily: "inherit" }}>
          Keluar ➔
        </button>
      </div>

      {/* 🔹 HERO SECTION PROFILE */}
      <div className="driver-hero">
        <div className="driver-hero-content">
          <div style={{ fontSize: "50px", marginBottom: "10px" }}>🧑‍✈️</div>
          <h1 style={{ margin: "0 0 5px 0", fontSize: "22px", fontWeight: "900" }}>Halo, {activeDriver.split(" ")[0]}!</h1>
          <p style={{ margin: "0 0 15px 0", fontSize: "13px", opacity: 0.9 }}>Dashboard Operasional Pengemudi</p>
          <div style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 20px", borderRadius: "50px", fontSize: "12px", fontWeight: "bold", display: "inline-block", border: "1px solid rgba(255,255,255,0.3)" }}>
            {waktuSekarang}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "700px", margin: "-30px auto 0", padding: "0 15px", display: "flex", flexDirection: "column", gap: "20px", position: "relative", zIndex: 10 }}>

        {/* 🔹 CARD STATUS KESIAGAAN INSTAN */}
        <div style={{ background: "white", padding: "20px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, color: "#2d3748", fontSize: "15px", fontWeight: "800" }}>📡 Status Anda Saat Ini:</h3>
            <span style={{ fontSize: "11px", fontWeight: "bold", padding: "6px 12px", borderRadius: "8px", background: statusTerkini === "Standby" ? "#c6f6d5" : statusTerkini === "Keluar Beroperasi" ? "#fed7d7" : "#e2e8f0", color: statusTerkini === "Standby" ? "#22543d" : statusTerkini === "Keluar Beroperasi" ? "#9b2c2c" : "#4a5568" }}>
              {statusTerkini === "Standby" ? "🟢 STANDBY" : statusTerkini === "Keluar Beroperasi" ? "🔴 KELUAR" : "⚪ OFF DUTY"}
            </span>
          </div>

          <p style={{ fontSize: "12px", color: "#718096", marginBottom: "15px", lineHeight: "1.5" }}>Tekan tombol di bawah jika Anda keluar/pulang <b>tanpa membawa armada kantor</b> (misal: naik motor/kendaraan pribadi). Kalau membawa mobil kantor, status Anda otomatis tersinkron lewat menu <b>Bawa Armada</b>.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button disabled={isLoadingPersonel} onClick={() => handleUpdateStatusPersonel("Keluar Beroperasi")} style={{ padding: "14px", background: "#fff5f5", color: "#c53030", border: "2px solid #feb2b2", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", transition: "0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
              <span style={{ fontSize: "20px" }}>🏃‍♂️</span> Keluar Pos
            </button>
            <button disabled={isLoadingPersonel} onClick={() => handleUpdateStatusPersonel("Standby")} style={{ padding: "14px", background: "#f0fff4", color: "#2f855a", border: "2px solid #9ae6b4", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", transition: "0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
              <span style={{ fontSize: "20px" }}>🛋️</span> Kembali Standby
            </button>
          </div>
        </div>

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
      <div className="mobile-nav">
        <button className="m-nav-item" onClick={() => router.push("/dashboard/driver/armada")} style={{ color: "var(--info)" }}>
          <IconCar size={20} />
          <span>Armada</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/dashboard/driver/inspeksi")} style={{ color: "var(--ok)" }}>
          <IconSearch size={20} />
          <span>Inspeksi</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/dashboard/driver/servis")} style={{ color: "var(--warn)" }}>
          <IconWrench size={20} />
          <span>Servis</span>
        </button>
        <button className="m-nav-item" onClick={handleLogout} style={{ color: "var(--red-600)" }}>
          <IconLogOut size={20} />
          <span>Keluar</span>
        </button>
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
                <span style={{background:"#fffff0", padding:"8px", borderRadius:"12px"}}>⏱️</span> Klaim Overtime Driver
              </h2>
              <p style={{ margin: 0, color: "#718096", fontSize: "13px" }}>Input tanggal lembur operasional atau perjalanan dinas dalam satu siklus payroll.</p>
            </div>

            <form onSubmit={handleSubmitLemburKolektif} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Pengemudi</label>
                  <input type="text" readOnly value={activeDriver} style={{...sharedInputStyle, background: "#e2e8f0"}} />
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
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Jenis Lembur *</label>
                      <input type="text" required placeholder="Cth: Perjalanan Dinas Luar Kota" value={item.area_ruangan} onChange={(e) => handleLemburRowChange(index, "area_ruangan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
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
                    <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Detail Tugas / Kendaraan yang Digunakan *</label>
                    <input type="text" required placeholder="Cth: Antar tamu VIP pakai B 1629 RKP" value={item.alasan} onChange={(e) => handleLemburRowChange(index, "alasan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
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
