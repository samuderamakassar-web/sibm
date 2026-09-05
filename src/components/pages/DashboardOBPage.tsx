"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useFcmSetup } from "@/hooks/useFcmSetup";
import { logoutWithConfirm, useAuthGuard } from "@/hooks/useAuthGuard";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";

// ==========================================
// IKON — SVG garis, set sama dengan portal utama & shell admin (src/app/page.tsx, src/app/admin/page.tsx)
// ==========================================
type IconProps = { size?: number; color?: string };
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconClipboard = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6" /><path d="M9 15h6" /><path d="M9 19h3" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconSearch = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
const IconChevronRight = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
);
const IconLogOut = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
);
const IconMapPin = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.7 7-12a7 7 0 1 0-14 0c0 5.3 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
const IconAlertTriangle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 4.5 2.9 18a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.5 4.5a2 2 0 0 0-3 0z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
const IconMap = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z" /><path d="M9 3v16" /><path d="M15 5v18" /></svg>
);
const IconCalendar = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>
);
const IconDroplet = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3s6 7.2 6 11.2a6 6 0 0 1-12 0C6 10.2 12 3 12 3z" /></svg>
);
const IconHome = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-6h4v6" /></svg>
);
const IconBook = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
);

// ==========================================
// INTERFACES
// ==========================================
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

// Interface Baru untuk Item Lembur Kolektif
interface OvertimeItemRequest {
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  area_ruangan: string;
  alasan: string;
}

// ==========================================
// FIX TIMEZONE: "hari ini" harus dihitung berdasarkan WITA (Asia/Makassar, UTC+8),
// bukan new Date().toISOString() yang formatnya UTC. Kalau pakai toISOString(),
// tanggal baru "ganti" jam 00:00 UTC = jam 08:00 WITA — jadi dari jam 00:00-07:59 WITA
// data yang muncul masih plotting hari SEBELUMNYA.
// ==========================================
function getTodayISOLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// OB & CS tidak ada jadwal di akhir pekan (sama aturan dengan PlottingOBPage.tsx) --
// dipakai buat jaga-jaga di sisi tampilan kalau dokumen daily_plots hari weekend
// kebetulan masih nyimpan data lama yang belum sempat dibersihkan ulang.
function isWeekend(dateISO: string): boolean {
  const hari = new Date(dateISO + "T00:00:00").getDay();
  return hari === 0 || hari === 6;
}

export default function DashboardOBPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const todayISO = getTodayISOLocal();
  const { session, isReady: isAuthReady } = useAuthGuard({
    depts: ["OB & CS"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus tim OB & CS.",
  });

  const [isReady, setIsReady] = useState<boolean>(false);
  const [assignedFloors, setAssignedFloors] = useState<string[]>([]);

  // State Fitur OB & CS
  const [stokMenipis, setStokMenipis] = useState<StockItem[]>([]);
  const [tugasDeepCleaning, setTugasDeepCleaning] = useState<DeepCleaningTask[]>([]);

  // 💡 STATE BARU: PERIODE & MULTI-ROW OVERTIME
  const [activeModal, setActiveModal] = useState<"none" | "lembur">("none");
  const [isLemburLoading, setIsLemburLoading] = useState(false);
  const [periodeLembur, setPeriodeLembur] = useState("11 Juni - 10 Juli 2026");
  const [formLemburItems, setFormLemburItems] = useState<OvertimeItemRequest[]>([
    { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "", alasan: "" }
  ]);

  const picName = session?.nama || "";
  const picRole = session?.role || "";

// 🔔 Setup FCM — aktif otomatis begitu picName ke-set dari sesi Firebase Auth
  useFcmSetup(picName, !!picName);

  // EFEK 2: Listener Data Real-time (Plotting, Stok, Deep Cleaning)
  useEffect(() => {
    if (!isAuthReady || !session) return;

    // A. Listener Plot Lantai
    const plotRef = doc(db, "daily_plots", todayISO);
    const unsubPlot = onSnapshot(plotRef, (docSnap) => {
      if (docSnap.exists() && !isWeekend(todayISO)) {
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
  }, [isAuthReady, session, picName, todayISO]);

  const handleKeluar = () => logoutWithConfirm(confirm, router);

  // 💡 MULTI-ROW OVERTIME LOGIC HANDLERS
  const handleAddLemburRow = () => {
    setFormLemburItems([...formLemburItems, { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "", alasan: "" }]);
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
      return showToast("Mohon lengkapi seluruh kolom tanggal, jam, dan lokasi lembur yang Anda tambahkan!", "warning");
    }

    setIsLemburLoading(true);

    try {
      const dept = localStorage.getItem("pic_dept") || "OB & CS";

      // Mengirimkan satu dokumen bundle lemburan periode ke koleksi Firebase
      await addDoc(collection(db, "ga_overtime_requests"), {
        nama_pemohon: picName,
        departemen: dept,
        periode: periodeLembur, // Siklus Buku (Cth: 11 Juni - 10 Juli 2026)
        items: formLemburItems,  // Array berisi daftar tanggal lemburan
        status: "Menunggu Approval GA",
        waktu_request: serverTimestamp()
      });

      showToast(`Berhasil! ${formLemburItems.length} klaim lembur Anda untuk periode ${periodeLembur} telah dikirim ke Admin GA.`, "success");
      setFormLemburItems([{ tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "", alasan: "" }]);
      setActiveModal("none");
    } catch (error) {
      console.error(error);
      showToast("Gagal mengirim rekapan klaim lembur.", "error");
    } finally {
      setIsLemburLoading(false);
    }
  };

  // MENU UTAMA OB & CS — warna dipetakan ke token desain (lihat tokenColors di bawah)
  const menuOB = [
    { title: "Kerjaan Rutin Harian", desc: "Checklist kebersihan (Toilet, Lobby, dll).", path: "/dashboard/ob/checklist", action: "link", token: "ok", icon: IconClipboard },
    { title: "Stock Opname Gudang", desc: "Catat sisa chemical, sabun, dan tisu.", path: "/dashboard/ob/stok", action: "link", token: "warn", icon: IconDroplet },
    { title: "Inspeksi Fasilitas", desc: "Checklist kondisi fasilitas per area, tiap minggu.", path: "/dashboard/ob/laporan", action: "link", token: "info", icon: IconSearch },
    { title: "Klaim Lembur Bulan Ini", desc: "Rekap & input data lemburan Anda.", path: "", action: "modal_lembur", token: "accent", icon: IconClock },
    { title: "SOP & Instruksi Kerja", desc: "Pelajari dokumen SOP/IK terbaru untuk Tim OB & CS.", path: "/dashboard/ob/sop", action: "link", token: "info", icon: IconBook },
  ];

  const tokenColors: Record<string, { bg: string; color: string }> = {
    info: { bg: "var(--info-50)", color: "var(--info)" },
    warn: { bg: "var(--warn-50)", color: "var(--warn)" },
    ok: { bg: "var(--ok-50)", color: "var(--ok)" },
    red: { bg: "var(--red-50)", color: "var(--red-600)" },
    accent: { bg: "#f5f3ff", color: "var(--accent)" },
  };

  const sharedInputStyle = { width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const, transition: "all 0.2s" };

  if (!isAuthReady || !session || !isReady) return null;

  return (
    <div className="main-container" style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>

      {/* 💡 TOKEN DESAIN & CSS RESPONSIVE — satu ekosistem dengan portal (src/app/page.tsx) & admin (src/app/admin/page.tsx) */}
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

        .section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .section-title-icon { background: var(--red-50); color: var(--red-600); padding: 8px; border-radius: 12px; display: flex; }

        .shift-card {
          background: var(--surface); padding: 20px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
          margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 15px; border: 1px solid var(--line);
        }
        .shift-badge { padding: 10px 20px; border-radius: 12px; font-weight: 800; font-size: 15px; display: flex; align-items: center; gap: 8px; width: fit-content; border: 1px solid; }

        .stock-banner { background: var(--red-50); border: 1px solid rgba(220,38,38,0.25); border-radius: 20px; padding: 20px; margin-bottom: 20px; display: flex; gap: 15px; align-items: center; box-shadow: 0 4px 6px -1px rgba(220,38,38,0.08); }
        .stock-icon { background: var(--red-600); color: white; width: 45px; height: 45px; border-radius: 50%; display: flex; justify-content: center; align-items: center; flex-shrink: 0; }
        .stock-chip { background: var(--surface); color: var(--red-600); border: 1px solid rgba(220,38,38,0.3); padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; }

        .coord-card { flex: 1; min-width: 250px; color: white; padding: 20px; border-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 20px; transition: transform 0.2s; }
        .coord-card:hover { transform: translateY(-3px); }
        .coord-icon { background: rgba(255,255,255,0.2); font-size: 28px; padding: 12px; border-radius: 16px; display: flex; }

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

        .dc-row { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-radius: 16px; border: 1px solid var(--line); }
        .dc-badge { font-size: 10px; padding: 4px 8px; border-radius: 6px; font-weight: bold; text-transform: uppercase; }
        .dc-status { padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: bold; }

        .input-grid-mobile { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
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

          .input-grid-mobile { grid-template-columns: 1fr !important; gap: 10px !important; }
          .dc-row { flex-direction: column; align-items: flex-start !important; gap: 10px; }

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
          <img src="/LOGOGRAM SAMUDERA_BACKGROUND MERAH.jpg" alt="Logo" style={{ height: "30px", filter: "invert(1) brightness(0.2)" }} />
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "16px", borderLeft: "2px solid var(--line)", paddingLeft: "10px" }}>OB & CS Desk</span>
        </div>
        <button className="logout-btn" onClick={handleKeluar}>
          <IconLogOut size={15} /> Keluar
        </button>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>CLEANING CENTER</h1>
          <p style={{ margin: "0 0 20px 0", fontSize: "14px", opacity: 0.9 }}>Pusat Manajemen Kebersihan & Fasilitas Gedung</p>
          <div className="admin-hero-badge">
            <IconUserCircle size={16} /> PIC: {picName}
          </div>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1100px", margin: "-45px auto 0", padding: "0 15px", position: "relative", zIndex: 10 }}>

        {/* 📢 KARTU LOKASI SHIFT */}
        <div className="shift-card">
          <div>
            <p style={{ margin: "0 0 5px 0", color: "var(--muted)", fontSize: "13px", fontWeight: "bold", textTransform: "uppercase" }}>Lokasi Shift Anda Hari Ini</p>
            <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>
              {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
            </h2>
          </div>
          <div className="shift-badge" style={assignedFloors.length > 0
            ? { background: "var(--ok-50)", color: "var(--ok)", borderColor: "rgba(22,163,74,0.3)" }
            : { background: "var(--red-50)", color: "var(--red-600)", borderColor: "rgba(220,38,38,0.3)" }}>
            {assignedFloors.length > 0 ? (
              <><IconMapPin size={16} /> AREA: {assignedFloors.join(", ")}</>
            ) : (
              <><IconAlertTriangle size={16} /> BELUM DIPLOT</>
            )}
          </div>
        </div>

        {/* ⚠️ BANNER PERINGATAN LOW STOCK */}
        {stokMenipis.length > 0 && (
          <div className="stock-banner">
            <div className="stock-icon"><IconAlertTriangle size={20} /></div>
            <div>
              <h3 style={{ margin: "0 0 5px 0", color: "var(--red-700)", fontSize: "16px" }}>Stok Gudang Menipis!</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "5px" }}>
                {stokMenipis.map(item => (
                  <span key={item.id} className="stock-chip">
                    {item.nama_barang} <span style={{ opacity: 0.7 }}>(Sisa: {item.qty})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 👑 PANEL KHUSUS KOORDINATOR */}
        {(picRole.includes("Koordinator") || picRole.includes("Administrator")) && (
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px", flexWrap: "wrap" }}>
            <div
              className="coord-card"
              onClick={() => router.push("/dashboard/ob/plotting")}
              style={{ background: "linear-gradient(to right, var(--info), #1d4ed8)", boxShadow: "0 10px 15px -3px rgba(37,99,235,0.3)" }}
            >
              <div className="coord-icon"><IconMap size={28} /></div>
              <div>
                <h2 style={{ margin: "0 0 5px 0", fontSize: "16px" }}>Plotting Tugas Harian</h2>
                <p style={{ margin: "0", fontSize: "12px", opacity: 0.8 }}>Atur area tugas staf OB & CS.</p>
              </div>
            </div>
            <div
              className="coord-card"
              onClick={() => router.push("/dashboard/ob/deep-cleaning")}
              style={{ background: "linear-gradient(to right, var(--accent), #5b21b6)", boxShadow: "0 10px 15px -3px rgba(124,58,237,0.3)" }}
            >
              <div className="coord-icon"><IconCalendar size={28} /></div>
              <div>
                <h2 style={{ margin: "0 0 5px 0", fontSize: "16px" }}>Jadwal Deep Cleaning</h2>
                <p style={{ margin: "0", fontSize: "12px", opacity: 0.8 }}>Manajemen tugas perawatan khusus.</p>
              </div>
            </div>
          </div>
        )}

        {/* 🔹 GRID MENU UTAMA OB */}
        <div className="admin-grid">
          {menuOB.map((menu, index) => {
            const tc = tokenColors[menu.token];
            const MenuIcon = menu.icon;
            return (
              <div
                key={index}
                className="admin-card"
                onClick={() => menu.action === "modal_lembur" ? setActiveModal("lembur") : router.push(menu.path)}
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

        {/* JADWAL DEEP CLEANING */}
        {tugasDeepCleaning.length > 0 && (
          <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid var(--line)" }}>
            <div className="section-title" style={{ marginBottom: "20px" }}>
              <div className="section-title-icon" style={{ background: "#f5f3ff", color: "var(--accent)" }}><IconCalendar size={20} /></div>
              <div>
                <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>Tugas Ekstra (Deep Cleaning)</h2>
                <p style={{ margin: "0", color: "var(--muted)", fontSize: "13px" }}>Daftar tugas perawatan terjadwal dari Koordinator.</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {tugasDeepCleaning.map((tugas) => {
                const isToday = tugas.tanggal === getTodayISOLocal();
                const selesai = tugas.status === "Selesai";

                return (
                  <div key={tugas.id} className="dc-row" style={{
                    background: selesai ? "var(--ok-50)" : (isToday ? "var(--warn-50)" : "var(--bg)"),
                    borderColor: isToday && !selesai ? "var(--warn)" : "var(--line)",
                  }}>
                    <div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "5px" }}>
                        <span className="dc-badge" style={isToday ? { background: "var(--warn)", color: "white" } : { background: "var(--line)", color: "var(--ink-soft)" }}>
                          {isToday ? "🔥 HARI INI" : `📅 ${tugas.tanggal}`}
                        </span>
                      </div>
                      <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>{tugas.tugas}</div>
                      <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}><IconMapPin size={12} /> {tugas.area}</div>
                    </div>
                    <span className="dc-status" style={selesai ? { background: "var(--ok-50)", color: "var(--ok)" } : { background: "var(--bg)", color: "var(--muted)" }}>
                      {selesai ? "✔ Selesai" : "Menunggu"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* 📱 BOTTOM NAVIGATION EKSKLUSIF LAPANGAN (HANYA MUNCUL DI HP) */}
      <div className="mobile-nav">
        <button className="m-nav-item" onClick={() => router.push("/")}>
          <IconHome size={20} />
          <span>Portal Utama</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/dashboard/ob/checklist")} style={{ color: "var(--ok)" }}>
          <IconClipboard size={20} />
          <span>Checklist</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/dashboard/ob/stok")} style={{ color: "var(--warn)" }}>
          <IconDroplet size={20} />
          <span>Stok Barang</span>
        </button>
        <button className="m-nav-item" onClick={() => setActiveModal("lembur")} style={{ color: "var(--accent)" }}>
          <IconClock size={20} />
          <span>Lembur</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/dashboard/ob/laporan")} style={{ color: "var(--info)" }}>
          <IconSearch size={20} />
          <span>Inspeksi</span>
        </button>
        <button className="m-nav-item" onClick={handleKeluar} style={{ color: "var(--red-600)" }}>
          <IconLogOut size={20} />
          <span>Keluar</span>
        </button>
      </div>

      {/* ========================================== */}
      {/* 💡 MODAL PENGAJUAN LEMBUR MULTI-ROW BERDASARKAN PERIODE */}
      {/* (tampilan modal sengaja tidak disentuh — konsisten dengan keputusan redesign portal §8B) */}
      {/* ========================================== */}
      {activeModal === "lembur" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "15px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "650px", borderRadius: "24px", padding: "25px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box" }}>

            <button onClick={() => setActiveModal("none")} style={{ position: "absolute", top: "15px", right: "15px", background: "#edf2f7", border: "none", width: "36px", height: "36px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", zIndex: 10 }}>✖</button>

            <div style={{ marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px", paddingRight: "30px" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "18px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{background:"#fffff0", padding:"8px", borderRadius:"12px"}}>⏱️</span> Klaim Overtime
              </h2>
              <p style={{ margin: 0, color: "#718096", fontSize: "12px", lineHeight: "1.4" }}>Karyawan dapat memasukkan beberapa tanggal lembur sekaligus dalam satu siklus payroll.</p>
            </div>

            <form onSubmit={handleSubmitLemburKolektif} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>

              {/* Pilihan Periode Cut-Off Gaji */}
              <div className="input-grid-mobile">
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Pemohon</label>
                  <input type="text" readOnly value={picName} style={{...sharedInputStyle, background: "#e2e8f0"}} />
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

              {/* Loop Form Dinamis */}
              {formLemburItems.map((item, index) => (
                <div key={index} style={{ border: "1px solid #cbd5e0", padding: "20px 15px 15px", borderRadius: "16px", background: "#f8fafc", position: "relative" }}>
                  {index > 0 && (
                    <button type="button" onClick={() => handleRemoveLemburRow(index)} style={{ position: "absolute", top: "10px", right: "10px", background: "white", color: "#e53e3e", border: "1px solid #fed7d7", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer", zIndex: 5 }}>Hapus ✖</button>
                  )}

                  <span style={{ position: "absolute", top: "10px", left: "15px", fontSize: "11px", fontWeight: "900", color: "#d69e2e", background: "#fffff0", padding: "2px 8px", borderRadius: "4px", border: "1px solid #fefcbf" }}>DATA KLAIM #{index + 1}</span>

                  <div className="input-grid-mobile" style={{ marginTop: "15px", marginBottom: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Tanggal Lembur *</label>
                      <input type="date" required value={item.tanggal} onChange={(e) => handleLemburRowChange(index, "tanggal", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Area / Lokasi Ruangan *</label>
                      <input type="text" required placeholder="Cth: Lt. 2 R. Rapat" value={item.area_ruangan} onChange={(e) => handleLemburRowChange(index, "area_ruangan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                  </div>

                  <div className="input-grid-mobile" style={{ marginBottom: "10px" }}>
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
                    <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Detail Tugas / Pekerjaan yang Diselesaikan *</label>
                    <input type="text" required placeholder="Cth: Pembersihan karpet koridor utama pasca rapat besar" value={item.alasan} onChange={(e) => handleLemburRowChange(index, "alasan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
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
