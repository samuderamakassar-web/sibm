"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useFcmSetup } from "@/hooks/useFcmSetup";
import { logoutWithConfirm, useAuthGuard } from "@/hooks/useAuthGuard";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import AbsensiCard from "@/components/AbsensiCard";
import KlaimLemburModal from "../KlaimLemburModal";
import AdminShell from "../admin/AdminShell";
import Tile from "../admin/Tile";
import { useMasterKondisiAset } from "@/lib/kondisiAset";
import PermintaanPelayananPanel from "../PermintaanPelayananPanel";
import KinerjaSayaPanel from "../KinerjaSayaPanel";

// ==========================================
// IKON — SVG garis, set sama dengan portal utama & shell admin (src/app/page.tsx, src/app/admin/page.tsx)
// ==========================================
type IconProps = { size?: number; color?: string };
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

  const picName = session?.nama || "";
  const picRole = session?.role || "";

  // §122 menu Inspeksi hanya untuk yang punya tugas: plot area hari ini, memegang alat, atau petugas utilitas
  const { nilai: masterAset } = useMasterKondisiAset();
  const [jumlahAlat, setJumlahAlat] = useState(0);
  // §123 peran tugas dari Master User (OB Pelayanan / CS Cleaning) -- urutan tampilan menyesuaikan
  const [peranTugas, setPeranTugas] = useState("");
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!picName || !uid) return;
    return onSnapshot(doc(db, "users_master", uid), (s) => setPeranTugas(String(s.data()?.peran_tugas || "")), () => setPeranTugas(""));
  }, [picName]);
  const isOBPelayanan = peranTugas === "OB Pelayanan";
  useEffect(() => {
    if (!picName) return;
    return onSnapshot(query(collection(db, "aset_alat"), where("pemegang", "==", picName)), (s) => setJumlahAlat(s.docs.filter((d) => d.data().status !== "Afkir").length), () => setJumlahAlat(0));
  }, [picName]);
  const petugasUtilitas = masterAset.petugas_utilitas.some((n) => n.trim().toLowerCase() === picName.trim().toLowerCase());
  const punyaTugasInspeksi = assignedFloors.length > 0 || jumlahAlat > 0 || petugasUtilitas || /koordinator|admin/i.test(picRole);

// 🔔 Setup FCM — aktif otomatis begitu picName ke-set dari sesi Firebase Auth
  useFcmSetup(picName, !!picName, "OB & CS");

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


  // MENU UTAMA OB & CS — warna dipetakan ke token desain (lihat tokenColors di bawah)
  const menuOB = [
    { title: "Kerjaan Rutin Harian", desc: "Checklist kebersihan (Toilet, Lobby, dll).", path: "/dashboard/ob/checklist", action: "link", token: "ok", icon: IconClipboard },
    { title: "Stock Opname Gudang", desc: "Catat sisa chemical, sabun, dan tisu.", path: "/dashboard/ob/stok", action: "link", token: "warn", icon: IconDroplet },
    ...(punyaTugasInspeksi ? [{ title: "Inspeksi Kondisi Aset", desc: "Foto & kondisi fasilitas, alat kebersihan, utilitas — mingguan.", path: "/dashboard/ob/laporan", action: "link", token: "info", icon: IconSearch }] : []),
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


  if (!isAuthReady || !session || !isReady) return null;

  return (
    <AdminShell
      userName={picName || "Staf"}
      backHref={null}
      brandSub="OB & CS"
      onLogout={handleKeluar}
      bottomNav={
        <>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/")}>
            <IconHome size={20} />
            <span>Home</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/dashboard/ob/checklist")}>
            <IconClipboard size={20} />
            <span>Checklist</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/dashboard/ob/stok")}>
            <IconDroplet size={20} />
            <span>Stok</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => setActiveModal("lembur")}>
            <IconClock size={20} />
            <span>Lembur</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/dashboard/ob/laporan")}>
            <IconSearch size={20} />
            <span>Inspeksi</span>
          </button>
          <button type="button" className="sa-nav-item is-danger" onClick={handleKeluar}>
            <IconLogOut size={20} />
            <span>Keluar</span>
          </button>
        </>
      }
    >

      {/* 💡 TOKEN DESAIN & CSS RESPONSIVE — satu ekosistem dengan portal (src/app/page.tsx) & admin (src/app/admin/page.tsx) */}
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }

        .section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .section-title-icon { background: var(--red-50); color: var(--red-600); padding: 8px; border-radius: 12px; display: flex; }

        .shift-card {
          background: var(--surface); padding: 20px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
          margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 15px; border: 1px solid var(--line);
        }
        .shift-badge { padding: 10px 20px; border-radius: 12px; font-weight: 800; font-size: 15px; display: flex; align-items: center; gap: 8px; width: fit-content; border: 1px solid; }

        .stock-banner { background: var(--red-50); border: 1px solid rgba(220,38,38,0.25); border-radius: 20px; padding: 20px; margin-bottom: 20px; display: flex; gap: 15px; align-items: center; box-shadow: 0 4px 6px -1px rgba(220,38,38,0.08); }
        .stock-icon { background: var(--brand); color: white; width: 45px; height: 45px; border-radius: 50%; display: flex; justify-content: center; align-items: center; flex-shrink: 0; }
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

          .input-grid-mobile { grid-template-columns: 1fr !important; gap: 10px !important; }
          .dc-row { flex-direction: column; align-items: flex-start !important; gap: 10px; }

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
        <span className="staff-hero-label">Cleaning Center · {peranTugas || "OB & CS"}</span>
        <h1 className="staff-hero-title">Halo, {picName.split(/\s+/)[0]}.<br />{isOBPelayanan ? "Siap melayani hari ini?" : "Siap bersih-bersih hari ini?"}</h1>
      </Tile>

      <div>

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

        <AbsensiCard picName={picName} departemen="OB & CS" />

        {/* §123 OB Pelayanan: permintaan pelayanan paling atas */}
        {picName && isOBPelayanan && <PermintaanPelayananPanel nama={picName} peran={peranTugas} />}

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

        {/* §122 permintaan pelayanan dari karyawan (portal) */}
        {picName && !isOBPelayanan && <PermintaanPelayananPanel nama={picName} peran={peranTugas} />}

        {/* §123 kinerja pribadi -- hanya angka sendiri, bahan introspeksi */}
        {picName && <KinerjaSayaPanel nama={picName} peran={peranTugas} />}

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
            {/* §116 register alat kerja & PIC */}
            <div
              className="coord-card"
              onClick={() => router.push("/dashboard/ob/alat")}
              style={{ background: "linear-gradient(to right, var(--ok-solid), #166534)", boxShadow: "0 10px 15px -3px rgba(22,163,74,0.3)" }}
            >
              <div className="coord-icon"><IconCalendar size={28} /></div>
              <div>
                <h2 style={{ margin: "0 0 5px 0", fontSize: "16px" }}>Alat Kerja Tim</h2>
                <p style={{ margin: "0", fontSize: "12px", opacity: 0.8 }}>PIC alat, serah terima, rusak/hilang.</p>
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
              <div className="section-title-icon" style={{ background: "var(--accent-50)", color: "var(--accent)" }}><IconCalendar size={20} /></div>
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
                        <span className="dc-badge" style={isToday ? { background: "var(--warn-solid)", color: "#fff" } : { background: "var(--line)", color: "var(--muted-solid)" }}>
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

      {/* Klaim lembur tim -- komponen bersama Security/OB/Driver (§63) */}
      <KlaimLemburModal open={activeModal === "lembur"} onClose={() => setActiveModal("none")} picName={picName} departemen="OB & CS" judul="Klaim Lembur OB & CS" labelArea="Area / Lokasi Ruangan" placeholderArea="Cth: Lt. 2 R. Rapat" placeholderAlasan="Cth: Persiapan acara kantor" />

    </AdminShell>
  );
}
