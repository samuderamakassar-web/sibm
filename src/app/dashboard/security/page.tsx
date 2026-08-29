"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import Modal from "../../../components/ui/Modal";

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
const IconMapPin = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.7 7-12a7 7 0 1 0-14 0c0 5.3 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
const IconAlertTriangle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 4.5 2.9 18a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.5 4.5a2 2 0 0 0-3 0z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconCalendar = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>
);
const IconUserPlus = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6" /><path d="M18 8v6" /><path d="M15 11h6" /></svg>
);
const IconPackage = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></svg>
);
const IconShield = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-0.6 8-4 8-9V6z" /><path d="m9.5 12 1.8 1.8L15 10" /></svg>
);
const IconCar = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14" /><path d="M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M23 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M3 17v-4l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v4" /><path d="M3 13h18" /></svg>
);
const IconPrinter = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M6 17v4h12v-4" /></svg>
);
const IconHome = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-6h4v6" /></svg>
);
const IconLayoutGrid = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>
);
const IconInbox = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);
const IconFireExtinguisher = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3v2" /><path d="M8 5h6l1 2H7z" /><path d="M9 7v3" /><path d="M15 7l4-2" /><path d="M9 10h4a3 3 0 0 1 3 3v8H8v-8a3 3 0 0 1 1-2z" /><path d="M8 15h8" /></svg>
);

// ==========================================
// INTERFACES
// ==========================================
interface OvertimeItemRequest {
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  area_ruangan: string;
  alasan: string;
}

export default function SecurityDashboard() {
  const router = useRouter();

  const [picName, setPicName] = useState<string>("");
  const [picRole, setPicRole] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [showLogoutModal, setShowLogoutModal] = useState<boolean>(false);

  const [securityStaff, setSecurityStaff] = useState<string[]>([]);
  const [hariIniShift, setHariIniShift] = useState<string>("Tidak Ada Shift / Belum Diplot");
  const [namaBulanAktif, setNamaBulanAktif] = useState<string>("");
  const [semuaPlotBulanIni, setSemuaPlotBulanIni] = useState<Record<string, Record<string, string>>>({});
  const [waktuCetak, setWaktuCetak] = useState<string>("");

  // 💡 STATE MODAL & MULTI-ROW OVERTIME
  const todayISO = new Date().toISOString().split("T")[0];
  const [activeModal, setActiveModal] = useState<"none" | "lembur">("none");
  const [isLemburLoading, setIsLemburLoading] = useState(false);
  const [periodeLembur, setPeriodeLembur] = useState("11 Juni - 10 Juli 2026");
  const [formLemburItems, setFormLemburItems] = useState<OvertimeItemRequest[]>([
    { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Area Pos Security", alasan: "Lembur Back-up Shift" }
  ]);

  // 1. VERIFIKASI IDENTITAS & TARIK DAFTAR STAF
  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      let role = localStorage.getItem("pic_role") || "Staff";
      const dept = localStorage.getItem("pic_dept") || "";

      if (!nama || (dept !== "Security" && !dept.includes("Admin"))) {
        router.push("/dashboard");
        return;
      }

      setPicName(nama);

      try {
        const q = query(collection(db, "users_master"), where("departemen", "==", "Security"));
        const snap = await getDocs(q);
        const staffList: string[] = [];

        snap.forEach(doc => {
          const data = doc.data();
          staffList.push(data.nama);

          if (data.nama === nama) {
            const actualRole = data.role || "Staff";
            role = actualRole;
            localStorage.setItem("pic_role", actualRole);
          }
        });

        setPicRole(role);

        staffList.sort((a, b) => {
          if (a.toLowerCase().includes("danru")) return -1;
          if (b.toLowerCase().includes("danru")) return 1;
          return a.localeCompare(b);
        });

        setSecurityStaff(staffList);
      } catch (error) {
        console.error("Gagal menarik data staf:", error);
      }
    };

    siapkanHalaman();
  }, [router]);

  // 2. TARIK DATA JADWAL BERDASARKAN PERIODE TGL 11 S/D 10
  useEffect(() => {
    if (!picName) return;

    const getLocalDateString = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const today = new Date();
    const currentDay = today.getDate();

    let startPeriode: Date;
    let endPeriode: Date;

    if (currentDay >= 11) {
      startPeriode = new Date(today.getFullYear(), today.getMonth(), 11);
      endPeriode = new Date(today.getFullYear(), today.getMonth() + 1, 10);
    } else {
      startPeriode = new Date(today.getFullYear(), today.getMonth() - 1, 11);
      endPeriode = new Date(today.getFullYear(), today.getMonth(), 10);
    }

    const docBulan1 = `${startPeriode.getFullYear()}-${String(startPeriode.getMonth() + 1).padStart(2, "0")}`;
    const docBulan2 = `${endPeriode.getFullYear()}-${String(endPeriode.getMonth() + 1).padStart(2, "0")}`;

    const tglAwalFormat = startPeriode.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const tglAkhirFormat = endPeriode.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

    setTimeout(() => {
      setNamaBulanAktif(`Periode ${tglAwalFormat} - ${tglAkhirFormat}`);
    }, 0);

    let dataBulan1: Record<string, Record<string, string>> = {};
    let dataBulan2: Record<string, Record<string, string>> = {};

    const updateMergedData = () => {
      const merged = { ...dataBulan1, ...dataBulan2 };
      const finalData: Record<string, Record<string, string>> = {};

      for (let d = new Date(startPeriode); d <= endPeriode; d.setDate(d.getDate() + 1)) {
        const dateStr = getLocalDateString(d);
        finalData[dateStr] = merged[dateStr] || {};
      }

      setSemuaPlotBulanIni(finalData);

      const localTodayStr = getLocalDateString(new Date());
      const shiftKuHariIni = finalData[localTodayStr]?.[picName] || "Off / Belum Diplot";
      setHariIniShift(shiftKuHariIni);
      setIsReady(true);
    };

    const unsub1 = onSnapshot(doc(db, "security_monthly_schedules", docBulan1), (snap) => {
      dataBulan1 = snap.exists() ? snap.data().data_hari || {} : {};
      updateMergedData();
    });

    const unsub2 = onSnapshot(doc(db, "security_monthly_schedules", docBulan2), (snap) => {
      dataBulan2 = snap.exists() ? snap.data().data_hari || {} : {};
      updateMergedData();
    });

    return () => { unsub1(); unsub2(); };
  }, [picName]);

  const handleKeluar = () => setShowLogoutModal(true);

  const confirmLogout = () => {
    localStorage.removeItem("pic_nama");
    localStorage.removeItem("pic_dept");
    localStorage.removeItem("pic_role");
    router.push("/");
  };

  const handlePrint = () => {
    setWaktuCetak(new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => window.print(), 0);
  };

  // LOGIKA KONVERSI JAM UNTUK KARTU DASHBOARD
  const getWaktuShift = (shift: string) => {
    if (shift.includes("Shift 1")) return "08:00 - 20:00";
    if (shift.includes("Shift 2")) return "20:00 - 08:00";
    return "";
  };

  const getInisialDanJam = (shiftVal: string) => {
    if (!shiftVal || shiftVal === "-") return "-";
    if (shiftVal.includes("Off")) return "OFF";
    if (shiftVal.includes("Izin")) return "IZIN";
    if (shiftVal.includes("Shift 1")) return "S1 (08-20)";
    if (shiftVal.includes("Shift 2")) return "S2 (20-08)";
    return shiftVal;
  };

  // 💡 MULTI-ROW OVERTIME LOGIC HANDLERS
  const handleAddLemburRow = () => {
    setFormLemburItems([...formLemburItems, { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Area Pos Security", alasan: "Lembur Back-up Shift" }]);
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
      return alert("Mohon lengkapi seluruh kolom tanggal, jam, dan lokasi lembur yang Anda tambahkan!");
    }

    setIsLemburLoading(true);

    try {
      const dept = localStorage.getItem("pic_dept") || "Security";

      await addDoc(collection(db, "ga_overtime_requests"), {
        nama_pemohon: picName,
        departemen: dept,
        periode: periodeLembur,
        items: formLemburItems,
        status: "Menunggu Approval GA",
        waktu_request: serverTimestamp()
      });

      alert(`✅ Berhasil! ${formLemburItems.length} klaim lembur Anda untuk periode ${periodeLembur} telah dikirim ke Admin GA.`);
      setFormLemburItems([{ tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Area Pos Security", alasan: "Lembur Back-up Shift" }]);
      setActiveModal("none");
    } catch (error) {
      console.error(error);
      alert("❌ Gagal mengirim rekapan klaim lembur.");
    } finally {
      setIsLemburLoading(false);
    }
  };

  const isOff = hariIniShift.includes("Off") || hariIniShift.includes("Belum") || hariIniShift.includes("Izin");
  const waktuTeks = getWaktuShift(hariIniShift);

  // MENU UTAMA SECURITY — warna dipetakan ke token desain (lihat tokenColors di bawah)
  // hideOnMobile: true = card disembunyikan di HP karena modulnya sudah ada shortcut permanen di bottom nav
  const menuSecurity = [
    { title: "Buku Tamu Digital", desc: "Registrasi tamu dan akses karyawan.", path: "/dashboard/security/buku-tamu", action: "link", token: "red", icon: IconUserPlus, hideOnMobile: true },
    { title: "Manajemen Paket", desc: "Pencatatan resi kurir & ekspedisi.", path: "/dashboard/security/paket", action: "link", token: "warn", icon: IconPackage, hideOnMobile: true },
    { title: "Patroli Area", desc: "Scan QR code & checklist keamanan.", path: "/dashboard/security/patroli", action: "link", token: "ok", icon: IconShield, hideOnMobile: false },
    { title: "Log Kendaraan", desc: "Pencatatan kendaraan keluar-masuk.", path: "/dashboard/security/parkir", action: "link", token: "info", icon: IconCar, hideOnMobile: false },
    { title: "Inspeksi APAR", desc: "Scan QR & catat kondisi APAR per lantai tiap bulan.", path: "/dashboard/security/inspeksi-apar", action: "link", token: "accent", icon: IconFireExtinguisher, hideOnMobile: false },
    { title: "Klaim Lembur Bulan Ini", desc: "Rekap & input lemburan (Back-up Shift).", path: "", action: "modal_lembur", token: "accent", icon: IconClock, hideOnMobile: false },
  ];

  const tokenColors: Record<string, { bg: string; color: string }> = {
    info: { bg: "var(--info-50)", color: "var(--info)" },
    warn: { bg: "var(--warn-50)", color: "var(--warn)" },
    ok: { bg: "var(--ok-50)", color: "var(--ok)" },
    red: { bg: "var(--red-50)", color: "var(--red-600)" },
    accent: { bg: "#f5f3ff", color: "var(--accent)" },
  };

  if (!isReady) return null;

  const roleLower = picRole.toLowerCase();
  const isKoordinatorArea = roleLower.includes("danru") || roleLower.includes("koordinator") || roleLower.includes("admin");

  const sharedInputStyle = { width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const, transition: "all 0.2s" };

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

        .section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .section-title-icon { background: var(--red-50); color: var(--red-600); padding: 8px; border-radius: 12px; display: flex; }

        .shift-card {
          background: var(--surface); padding: 20px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
          margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 15px; border: 1px solid var(--line);
        }
        .shift-badge { padding: 10px 20px; border-radius: 12px; font-weight: 800; font-size: 15px; display: flex; align-items: center; gap: 8px; width: fit-content; border: 1px solid; }

        .coord-card { color: white; padding: 20px; border-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 20px; transition: transform 0.2s; margin-bottom: 25px; }
        .coord-card:hover { transform: translateY(-3px); }
        .coord-icon { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 16px; display: flex; }

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

        .roster-legend { display: flex; gap: 8px; font-size: 11px; font-weight: bold; flex-wrap: wrap; }
        .roster-chip { padding: 4px 8px; border-radius: 6px; }
        .print-btn { padding: 9px 16px; background: var(--red-600); color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: inherit; transition: 0.2s; }
        .print-btn:hover { background: var(--red-700); }

        .input-grid-mobile { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .mobile-nav { display: none; }
        .hide-on-mobile { display: flex; }

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .main-container { padding-bottom: 90px !important; }
          .hide-on-mobile { display: none !important; }

          .admin-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .hide-card-mobile { display: none !important; }
          .admin-card { flex-direction: row !important; align-items: center !important; padding: 15px 20px !important; gap: 15px !important; border-radius: 16px !important; }
          .admin-card:hover { transform: translateY(-2px); }
          .admin-card:active { transform: scale(0.98); }
          .admin-card-icon { width: 48px !important; height: 48px !important; border-radius: 12px !important; flex-shrink: 0; }
          .admin-card-title { font-size: 15px !important; margin-bottom: 2px !important; }
          .admin-card-desc { font-size: 11px !important; line-height: 1.4 !important; }
          .admin-card-arrow { display: none !important; }

          .input-grid-mobile { grid-template-columns: 1fr !important; gap: 10px !important; }

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
            flex: 0 0 auto; min-width: 60px; scroll-snap-align: start; text-align: center;
          }
          .m-nav-item:active { transform: scale(0.9); }
        }
      `}} />

      {/* 🔹 CSS PRINT — cetak roster A4 landscape, 1 halaman, dgn kop logo Samudera */}
      <style dangerouslySetInnerHTML={{__html: `
        @media screen { .print-only { display: none !important; } }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background-color: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-area { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
          .roster-wrapper { border: none !important; overflow: visible !important; }
          .roster-table { width: 100% !important; }
          .roster-table th, .roster-table td { padding: 3px 4px !important; font-size: 9px !important; }
          .roster-table span { font-size: 8.5px !important; padding: 1px 6px !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR (desktop) */}
      <div className="hide-on-mobile site-header no-print">
        <div className="site-header-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-samudera.png" alt="Logo" style={{ height: "30px" }} />
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "16px", borderLeft: "2px solid var(--line)", paddingLeft: "10px" }}>Security Desk</span>
        </div>
        <button className="logout-btn" onClick={handleKeluar}>
          <IconLogOut size={15} /> Keluar
        </button>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="admin-hero no-print">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>COMMAND CENTER</h1>
          <p style={{ margin: "0 0 20px 0", fontSize: "14px", opacity: 0.9 }}>Sistem Pengamanan Terpadu SIBM</p>
          <div className="admin-hero-badge">
            <IconUserCircle size={16} /> PIC: {picName} ({picRole})
          </div>
        </div>
      </div>

      {/* 🖨️ KOP CETAK — cuma muncul pas print, logo Samudera + judul periode roster */}
      <div className="print-only" style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px", borderBottom: "2px solid #2d3748", paddingBottom: "10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-samudera.png" alt="Logo Samudera" style={{ height: "42px", objectFit: "contain" }} />
          <div>
            <h2 style={{ margin: 0, fontSize: "17px" }}>ROSTER SECURITY — {namaBulanAktif ? namaBulanAktif.toUpperCase() : "PERIODE BELUM TERBIT"}</h2>
            <p style={{ margin: "4px 0 0", fontSize: "11px" }}>Dicetak: {waktuCetak}</p>
          </div>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1100px", margin: "-45px auto 0", padding: "0 15px", position: "relative", zIndex: 10 }}>

        {/* 📢 KARTU SHIFT HARI INI */}
        <div className="shift-card no-print">
          <div>
            <p style={{ margin: "0 0 5px 0", color: "var(--muted)", fontSize: "13px", fontWeight: "bold", textTransform: "uppercase" }}>Jadwal Anda Hari Ini</p>
            <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>
              {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
            </h2>
          </div>
          <div className="shift-badge" style={isOff
            ? { background: "var(--red-50)", color: "var(--red-600)", borderColor: "rgba(220,38,38,0.3)" }
            : { background: "var(--ok-50)", color: "var(--ok)", borderColor: "rgba(22,163,74,0.3)" }}>
            {isOff ? (
              <><IconAlertTriangle size={16} /> {hariIniShift.toUpperCase()}</>
            ) : (
              <><IconMapPin size={16} /> ON DUTY : {hariIniShift.toUpperCase()} {waktuTeks ? `(${waktuTeks})` : ""}</>
            )}
          </div>
        </div>

        {/* 👑 MENU KHUSUS DANRU */}
        {isKoordinatorArea && (
          <div
            className="coord-card no-print"
            onClick={() => router.push("/dashboard/security/jadwal")}
            style={{ background: "linear-gradient(to right, #1a365d, #2c5282)", boxShadow: "0 10px 15px -3px rgba(44, 82, 130, 0.4)" }}
          >
            <div className="coord-icon"><IconCalendar size={28} /></div>
            <div>
              <h2 style={{ margin: "0 0 5px 0", fontSize: "18px" }}>Pembuatan Jadwal Rotasi 2-2-2</h2>
              <p style={{ margin: "0", fontSize: "13px", opacity: 0.8 }}>Akses khusus Danru untuk men-generate matriks shift otomatis periode 11-10.</p>
            </div>
          </div>
        )}

        {/* 🔹 GRID MENU UTAMA SECURITY */}
        <div className="admin-grid no-print">
          {menuSecurity.map((menu, index) => {
            const tc = tokenColors[menu.token];
            const MenuIcon = menu.icon;
            return (
              <div
                key={index}
                className={`admin-card${menu.hideOnMobile ? " hide-card-mobile" : ""}`}
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
                <div className="admin-card-arrow" style={{ color: tc.color }}>Buka Modul ➔</div>
              </div>
            );
          })}
        </div>

        {/* 🗓️ PAPAN MONITORING ROSTER BULANAN */}
        <div className="print-area" style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid var(--line)" }}>
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              <div className="section-title-icon"><IconLayoutGrid size={20} /></div>
              <div>
                <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>Roster Shift Security</h2>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>{namaBulanAktif || "Belum Terbit"}</p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div className="roster-legend">
                <span className="roster-chip" style={{ background: "var(--line)", color: "var(--ink-soft)" }}>S1: 08-20</span>
                <span className="roster-chip" style={{ background: "var(--line)", color: "var(--ink-soft)" }}>S2: 20-08</span>
                <span className="roster-chip" style={{ background: "var(--red-50)", color: "var(--red-600)" }}>Off</span>
              </div>

              {isKoordinatorArea && Object.keys(semuaPlotBulanIni).length > 0 && (
                <button onClick={handlePrint} className="print-btn">
                  <IconPrinter size={15} /> Cetak Roster A4
                </button>
              )}
            </div>
          </div>

          {Object.keys(semuaPlotBulanIni).length > 0 ? (
            <div className="roster-wrapper" style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table className="roster-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                    <th style={{ padding: "8px 10px", borderBottom: "2px solid var(--line)", textAlign: "left", fontSize: "11px" }}>Tgl</th>
                    {securityStaff.map(staf => <th key={staf} style={{ padding: "8px 10px", borderBottom: "2px solid var(--line)", minWidth: "84px", fontSize: "11px" }}>{staf}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(semuaPlotBulanIni).sort().map((tglKey) => {
                    const tglDisplay = tglKey.split("-")[2];
                    const dataHari = semuaPlotBulanIni[tglKey];

                    const localTodayStr = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0");
                    const isHariIni = tglKey === localTodayStr;

                    return (
                      <tr key={tglKey} style={{ background: isHariIni ? "var(--red-50)" : "var(--surface)", borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "5px 10px", textAlign: "left", fontWeight: isHariIni ? "900" : "bold", color: isHariIni ? "var(--red-700)" : "var(--muted)", fontSize: "11.5px", whiteSpace: "nowrap" }}>
                          {tglDisplay}
                          {isHariIni && <span style={{ fontSize: "8px", background: "var(--red-600)", color: "white", padding: "1px 5px", borderRadius: "4px", marginLeft: "5px" }}>HARI INI</span>}
                        </td>
                        {securityStaff.map((staf) => {
                          const sVal = dataHari[staf] || "-";
                          const isOffCell = sVal.includes("Off");
                          const isIzin = sVal.includes("Izin");
                          const isKosong = sVal === "-";
                          const displayShift = getInisialDanJam(sVal);

                          const chipBg = isKosong ? "transparent" : isOffCell ? "var(--red-50)" : isIzin ? "var(--warn-50)" : "var(--info-50)";
                          const chipColor = isKosong ? "var(--muted)" : isOffCell ? "var(--red-600)" : isIzin ? "var(--warn)" : "var(--info)";

                          return (
                            <td key={staf} style={{ padding: "5px 6px" }}>
                              <span style={{ display: "inline-block", padding: isKosong ? "0" : "3px 9px", borderRadius: "20px", background: chipBg, color: chipColor, fontWeight: 700, fontSize: "10.5px", whiteSpace: "nowrap" }}>{displayShift}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-print" style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              <IconInbox size={30} />
              Jadwal Roster Belum Terbit. Silakan hubungi Danru.
            </div>
          )}
        </div>
      </div>

      {/* 📱 BOTTOM NAVIGATION EKSKLUSIF LAPANGAN (HANYA MUNCUL DI HP) — cukup 4 menu paling sering dipakai + Keluar, biar gak ramai */}
      <div className="mobile-nav no-print">
        <button className="m-nav-item" onClick={() => router.push("/")}>
          <IconHome size={20} />
          <span>Home</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/dashboard/security/buku-tamu")} style={{ color: "var(--red-600)" }}>
          <IconUserPlus size={20} />
          <span>Tamu</span>
        </button>
        <button className="m-nav-item" onClick={() => router.push("/dashboard/security/paket")} style={{ color: "var(--warn)" }}>
          <IconPackage size={20} />
          <span>Paket</span>
        </button>
        <button className="m-nav-item" onClick={handleKeluar} style={{ color: "var(--red-600)" }}>
          <IconLogOut size={20} />
          <span>Keluar</span>
        </button>
      </div>

      {/* 🔹 MODAL KONFIRMASI LOGOUT — ganti window.confirm() native biar lebih modern & konsisten sama admin/page.tsx */}
      <Modal open={showLogoutModal} onClose={() => setShowLogoutModal(false)} maxWidth="380px">
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--red-50)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <IconLogOut size={26} color="var(--red-600)" />
          </div>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "17px", fontWeight: 800, color: "var(--ink)" }}>Keluar dari Sesi Security?</h3>
          <p style={{ margin: "0 0 22px 0", fontSize: "13px", color: "var(--muted)" }}>Anda perlu login ulang untuk mengakses Command Center setelah ini.</p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => setShowLogoutModal(false)} style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-soft)", fontWeight: 700, fontSize: "13px", fontFamily: "inherit", cursor: "pointer" }}>
              Batal
            </button>
            <button onClick={confirmLogout} style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", background: "var(--red-600)", color: "white", fontWeight: 700, fontSize: "13px", fontFamily: "inherit", cursor: "pointer" }}>
              Ya, Keluar
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================== */}
      {/* 💡 MODAL PENGAJUAN LEMBUR MULTI-ROW BERDASARKAN PERIODE */}
      {/* ========================================== */}
      {activeModal === "lembur" && (
        <div className="no-print" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "15px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "650px", borderRadius: "24px", padding: "25px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box" }}>

            <button onClick={() => setActiveModal("none")} style={{ position: "absolute", top: "15px", right: "15px", background: "#edf2f7", border: "none", width: "36px", height: "36px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", zIndex: 10 }}>✖</button>

            <div style={{ marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px", paddingRight: "30px" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "18px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{background:"#fffff0", padding:"8px", borderRadius:"12px"}}>⏱️</span> Klaim Overtime Security
              </h2>
              <p style={{ margin: 0, color: "#718096", fontSize: "12px", lineHeight: "1.4" }}>Input tanggal kerja lembur (back-up shift / tugas ekstra) dalam satu siklus payroll.</p>
            </div>

            <form onSubmit={handleSubmitLemburKolektif} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>

              {/* Pilihan Periode Cut-Off Gaji */}
              <div className="input-grid-mobile">
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Petugas</label>
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
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Area Penjagaan *</label>
                      <input type="text" required placeholder="Cth: Area Pos Security Utama" value={item.area_ruangan} onChange={(e) => handleLemburRowChange(index, "area_ruangan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
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
                    <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Alasan Lembur *</label>
                    <input type="text" required placeholder="Cth: Back-up shift personil yang sakit" value={item.alasan} onChange={(e) => handleLemburRowChange(index, "alasan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
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
