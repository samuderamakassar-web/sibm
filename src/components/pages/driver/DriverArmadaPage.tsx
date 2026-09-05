"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../ui/ToastProvider";
import { normalizePlat } from "../../../lib/platUtils";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan dashboard/security/parkir (tampilan dibuat sama persis)
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconCar = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14" /><path d="M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M23 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M3 17v-4l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v4" /><path d="M3 13h18" /></svg>
);
const IconWrench = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>
);
const IconPlaneTakeoff = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M6 16l5-1.5 6.5 2a1.2 1.2 0 0 0 1-2.2L9 9V4a1.3 1.3 0 0 0-2.6 0v4l-2 .6L3 7l-1 .5 1.4 4L2 12v2l4 1z" /></svg>
);
const IconPlaneLand = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="m7 15 12-3-1.5-2.6-4 .5-4.3-6-2 .5 2 6.3L4 12l-.7-1.7-1.3.3.7 3.4z" /></svg>
);
const IconHome = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
);
const IconGauge = ({ size = 11, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15a8 8 0 1 1 16 0" /><path d="M12 15 15 10" /><path d="M4 15h1M19 15h1M12 5v1" /></svg>
);
const IconClipboardList = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6" /><path d="M9 15h6" /><path d="M9 19h3" /></svg>
);
const IconSearch = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
const IconInboxEmpty = ({ size = 26, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);
const IconX = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
const IconSave = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h8V3" /><path d="M8 21v-7h8v7" /></svg>
);
const IconChevronRight = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
);

// ==========================================
// INTERFACES
// ==========================================
interface KendaraanLog {
  id: string;
  petugas_security: string;
  kendaraan: string;
  status_kendaraan: string;
  driver_bertugas: string;
  tujuan_keperluan: string;
  kilometer_kendaraan: string;
  waktu_catat: Timestamp | null;
}

interface KendaraanMaster {
  id: string;
  kendaraan: string;
  jenis?: string;
  pic_kendaraan?: string;
  plat_nomor?: string;
}

interface EmployeeMini {
  nama: string;
  departemen?: string;
  plat_kendaraan?: string;
}

interface VisitorLogMini {
  jenis: string;
  nama: string;
  status: string;
}

// 4 aksi pergerakan armada — string status_kendaraan SENGAJA dipertahankan sama seperti di
// dashboard/security/parkir supaya kompatibel dengan logika halaman lain (portal utama & admin/kendaraan).
// `instant: true` = klik langsung tercatat (tanpa modal), dipakai untuk Parkir/Standby & Pulang.
const STATUS_AKSI = [
  { key: "standby", label: "Parkir/Standby", status: "Tiba di Kantor (Standby)", icon: IconPlaneLand, tone: "ok" as const, instant: true },
  { key: "pulang", label: "Pulang", status: "Pulang (Selesai Tugas Hari Ini)", icon: IconHome, tone: "accent" as const, instant: true },
  { key: "keluar", label: "Keluar", status: "Keluar Beroperasi", icon: IconPlaneTakeoff, tone: "red" as const, instant: false },
  { key: "service", label: "Service", status: "Masuk Bengkel / Service", icon: IconWrench, tone: "warn" as const, instant: false },
];

function autoDriverStatus(statusKendaraan: string): string {
  if (statusKendaraan === "Keluar Beroperasi" || statusKendaraan === "Masuk Bengkel / Service") return "Keluar Beroperasi";
  if (statusKendaraan === "Pulang (Selesai Tugas Hari Ini)") return "Off Duty / Izin";
  return "Standby"; // Tiba di Kantor (Standby)
}

function classifyStatus(status: string): { label: string; bg: string; color: string } {
  if (status.includes("Bengkel") || status.includes("Service")) return { label: "SERVICE", bg: "var(--line)", color: "var(--ink-soft)" };
  if (status.includes("Pulang")) return { label: "PULANG", bg: "rgba(124,58,237,0.12)", color: "var(--accent)" };
  if (status.includes("Standby") || status.includes("Tiba")) return { label: "STANDBY", bg: "var(--ok-50)", color: "var(--ok)" };
  return { label: "KELUAR", bg: "var(--red-50)", color: "var(--red-600)" };
}

export default function DriverArmadaPage() {
  const router = useRouter();
  const showToast = useToast();

  const { session, isReady } = useAuthGuard({
    depts: ["Driver"],
    adminBypass: false,
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Driver.",
  });
  const activeDriver = session?.nama || "Driver";

  const [waktuSekarang, setWaktuSekarang] = useState<string>("");

  // TAB AKTIF: "kendaraan" = daftar armada + aksi cepat, "log" = riwayat pergerakan
  const [activeTab, setActiveTab] = useState<"kendaraan" | "log">("kendaraan");

  const [kendaraanMaster, setKendaraanMaster] = useState<KendaraanMaster[]>([]);
  const [employees, setEmployees] = useState<EmployeeMini[]>([]);
  const [visitorLogs, setVisitorLogs] = useState<VisitorLogMini[]>([]);
  const [searchKendaraan, setSearchKendaraan] = useState<string>("");
  const [searchLog, setSearchLog] = useState<string>("");
  const [daftarLogMobil, setDaftarLogMobil] = useState<KendaraanLog[]>([]);

  // 🪟 MODAL AKSI (khusus Keluar & Service — butuh Tujuan/Keperluan & KM)
  const [modalAksi, setModalAksi] = useState<{ kendaraan: KendaraanMaster; status: string; label: string } | null>(null);
  const [tujuan, setTujuan] = useState<string>("");
  const [kilometer, setKilometer] = useState<string>("");
  const [isLoadingAksi, setIsLoadingAksi] = useState<boolean>(false);

  // 💡 AKSI INSTAN (Parkir/Standby & Pulang) — klik langsung tercatat, tanpa modal
  const [loadingInstantKey, setLoadingInstantKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setWaktuSekarang(new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "master_kendaraan"), orderBy("kendaraan", "asc")), (snap) => {
      setKendaraanMaster(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KendaraanMaster)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubEmployees = onSnapshot(collection(db, "employees_directory"), (snap) => {
      setEmployees(snap.docs.map((d) => d.data() as EmployeeMini));
    });
    const unsubVisitorLogs = onSnapshot(collection(db, "security_visitor_logs"), (snap) => {
      setVisitorLogs(snap.docs.map((d) => {
        const data = d.data();
        return { jenis: data.jenis || "", nama: data.nama || "", status: data.status || "" };
      }));
    });
    return () => { unsubEmployees(); unsubVisitorLogs(); };
  }, []);

  // 💡 SINKRON OTOMATIS: kendaraan di-set Standby (dari aplikasi Driver sendiri) -> karyawan pemilik
  // kendaraan itu (dicocokkan via plat_kendaraan di Master Data Karyawan) otomatis tercatat hadir di
  // Buku Tamu Digital — pola sama persis dengan dashboard/security/parkir.
  const syncKaryawanHadir = async (kendaraan: KendaraanMaster) => {
    const platNorm = normalizePlat(kendaraan.plat_nomor || "");
    if (!platNorm) return;
    const karyawanCocok = employees.find((emp) => normalizePlat(emp.plat_kendaraan || "") === platNorm);
    if (!karyawanCocok) return;

    const sudahHadir = visitorLogs.some(
      (log) => log.jenis === "Karyawan" && log.status === "Di Dalam Area" &&
        log.nama.trim().toLowerCase() === karyawanCocok.nama.trim().toLowerCase()
    );
    if (sudahHadir) return;

    try {
      await addDoc(collection(db, "security_visitor_logs"), {
        nama: karyawanCocok.nama,
        instansi_dept: karyawanCocok.departemen || "",
        no_kendaraan: kendaraan.plat_nomor || "",
        tujuan: "Bekerja / Operasional",
        bertemu_dengan: "-",
        jenis: "Karyawan",
        foto_bukti: null,
        status: "Di Dalam Area",
        waktu_masuk: serverTimestamp(),
        waktu_keluar: null,
        pic_bertugas: "Aplikasi Driver (Auto-Sync Kendaraan)",
      });
    } catch (error) {
      console.error("Gagal sinkron kehadiran karyawan otomatis:", error);
    }
  };

  useEffect(() => {
    const qMobil = query(collection(db, "operational_vehicle_logs"), orderBy("waktu_catat", "desc"));
    const unsub = onSnapshot(qMobil, (snapshot) => {
      const logsArr: KendaraanLog[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        logsArr.push({
          id: docSnap.id,
          petugas_security: data.petugas_security || "-",
          kendaraan: data.kendaraan || "-",
          status_kendaraan: data.status_kendaraan || "-",
          driver_bertugas: data.driver_bertugas || "-",
          tujuan_keperluan: data.tujuan_keperluan || "-",
          kilometer_kendaraan: data.kilometer_kendaraan || "-",
          waktu_catat: data.waktu_catat || null
        });
      });
      setDaftarLogMobil(logsArr);
    });
    return () => unsub();
  }, []);

  const statusPerKendaraan = useMemo(() => {
    const map: Record<string, KendaraanLog> = {};
    daftarLogMobil.forEach((log) => {
      if (!map[log.kendaraan]) map[log.kendaraan] = log;
    });
    return map;
  }, [daftarLogMobil]);

  // 🔔 KARTU "KENDARAAN SEDANG KELUAR" — diturunkan otomatis dari statusPerKendaraan, jadi begitu status
  // kendaraan berubah (klik "Tiba Kantor Kembali" di kartu INI, atau klik "Pulang" langsung dari daftar
  // kendaraan karena driver ternyata pulang ke rumah), kartu otomatis hilang tanpa logika tambahan.
  const kendaraanSedangKeluar = useMemo(() => {
    return kendaraanMaster
      .map((k) => ({ k, log: statusPerKendaraan[k.kendaraan] }))
      .filter((item): item is { k: KendaraanMaster; log: KendaraanLog } => !!item.log && item.log.status_kendaraan === "Keluar Beroperasi");
  }, [kendaraanMaster, statusPerKendaraan]);

  const aksiStandby = STATUS_AKSI.find((a) => a.key === "standby")!;

  // Catat 1 log pergerakan armada. `syncDriverStatus` HANYA true untuk Keluar/Service (lewat modal) —
  // itu yang beneran berarti driver-nya sedang bertugas di luar bareng kendaraan itu. Parkir/Standby &
  // Pulang (aksi instan) cuma soal status KENDARAAN, jadi TIDAK ikut mengubah status kesiagaan driver.
  const catatPergerakan = async (kendaraanNama: string, status: string, tujuanIsi: string, kmIsi: string, syncDriverStatus: boolean) => {
    await addDoc(collection(db, "operational_vehicle_logs"), {
      petugas_security: "Aplikasi Driver",
      waktu_catat: serverTimestamp(),
      kendaraan: kendaraanNama,
      status_kendaraan: status,
      driver_bertugas: activeDriver,
      tujuan_keperluan: tujuanIsi || "-",
      kilometer_kendaraan: kmIsi || "Tidak dicatat",
    });

    if (syncDriverStatus) {
      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: activeDriver,
        status: autoDriverStatus(status),
        waktu_ubah: serverTimestamp(),
        petugas_security: "Aplikasi Driver (Auto-Sync)"
      });
    }
  };

  const bukaModalAksi = (kendaraan: KendaraanMaster, status: string, label: string) => {
    setTujuan("");
    setKilometer("");
    setModalAksi({ kendaraan, status, label });
  };

  const handleAksiInstan = async (kendaraan: KendaraanMaster, aksi: typeof STATUS_AKSI[number]) => {
    const uniqueKey = `${kendaraan.id}-${aksi.key}`;
    setLoadingInstantKey(uniqueKey);
    try {
      await catatPergerakan(kendaraan.kendaraan, aksi.status, "-", "Tidak dicatat", false);
      if (aksi.key === "standby") {
        await syncKaryawanHadir(kendaraan);
      }
      showToast(`Berhasil dicatat: ${kendaraan.kendaraan.split(" - ")[0]} — ${aksi.label}`, "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan data kendaraan.", "error");
    } finally {
      setLoadingInstantKey(null);
    }
  };

  const handleSubmitAksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalAksi) return;
    if (modalAksi.status === "Keluar Beroperasi" && !tujuan.trim()) {
      showToast("Tujuan/Keperluan wajib diisi jika kendaraan keluar!", "warning");
      return;
    }

    setIsLoadingAksi(true);
    try {
      await catatPergerakan(modalAksi.kendaraan.kendaraan, modalAksi.status, tujuan, kilometer, true);
      showToast(`Berhasil dicatat: ${modalAksi.kendaraan.kendaraan.split(" - ")[0]} — ${modalAksi.label}`, "success");
      setModalAksi(null);
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan data kendaraan.", "error");
    } finally {
      setIsLoadingAksi(false);
    }
  };

  const formatWaktu = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const kendaraanTerfilter = kendaraanMaster.filter((k) =>
    k.kendaraan.toLowerCase().includes(searchKendaraan.toLowerCase()) ||
    (k.jenis || "").toLowerCase().includes(searchKendaraan.toLowerCase()) ||
    (k.pic_kendaraan || "").toLowerCase().includes(searchKendaraan.toLowerCase())
  );

  const logMobilTerfilter = daftarLogMobil.filter((log) =>
    log.kendaraan.toLowerCase().includes(searchLog.toLowerCase()) ||
    log.driver_bertugas.toLowerCase().includes(searchLog.toLowerCase())
  );

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>

      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        * { box-sizing: border-box; }
        .top-bar {
          display: flex; justify-content: space-between; align-items: center; padding: 14px 20px;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line);
          position: sticky; top: 0; z-index: 50;
        }
        .back-btn {
          background: var(--bg); border: 1px solid var(--line); border-radius: 10px; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-soft); transition: 0.2s;
        }
        .back-btn:hover { background: var(--line); }
        .pic-badge { display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info); padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: bold; border: 1px solid rgba(37,99,235,0.2); }

        .page-hero {
          position: relative; overflow: hidden; border-radius: 0 0 30px 30px; color: #fff;
          padding: 36px 20px 55px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .page-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .page-hero-content { position: relative; }
        .page-hero-badge {
          display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.15);
          backdrop-filter: blur(5px); padding: 6px 16px; border-radius: 50px; font-size: 12px; font-weight: 700;
          border: 1px solid rgba(255,255,255,0.3);
        }

        .panel-flat { background: var(--surface); padding: 20px; border-radius: 20px; border: 1px solid var(--line); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); box-sizing: border-box; }
        .field-label { display: block; font-weight: 700; margin-bottom: 5px; font-size: 11px; color: var(--muted); letter-spacing: 0.3px; }
        .field-input { width: 100%; padding: 13px 15px; border-radius: 12px; border: 1px solid var(--line); font-size: 14px; background: var(--bg); outline: none; box-sizing: border-box; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); transition: all 0.2s; color: var(--ink-soft); font-family: inherit; }
        .field-input:focus { border-color: var(--info); background: var(--surface); }

        .status-pill { font-size: 10px; font-weight: bold; padding: 3px 9px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }

        .responsive-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        .responsive-table thead tr { background: var(--bg); color: var(--ink-soft); }
        .responsive-table th { padding: 12px 15px; border-bottom: 2px solid var(--line); font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
        .responsive-table td { padding: 12px 15px; border-bottom: 1px solid var(--line); vertical-align: top; }
        .table-search { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--line); border-radius: 20px; padding: 0 15px; width: 240px; flex-shrink: 0; }
        .table-search input { border: none; outline: none; background: transparent; padding: 10px 0; font-size: 14px; flex: 1; font-family: inherit; }

        .tab-nav { display: flex; gap: 8px; background: var(--surface); padding: 6px; border-radius: 16px; border: 1px solid var(--line); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .tab-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 10px;
          border-radius: 12px; border: none; background: transparent; color: var(--muted); font-weight: 800;
          font-size: 13px; cursor: pointer; font-family: inherit; transition: 0.2s;
        }
        .tab-btn.active { background: var(--red-600); color: #fff; box-shadow: 0 6px 14px -6px rgba(220,38,38,0.6); }

        .aksi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; min-width: 200px; }
        .aksi-btn {
          display: flex; align-items: center; justify-content: center; gap: 5px; padding: 8px 6px;
          border-radius: 9px; border: 1px solid var(--line); background: var(--bg); color: var(--ink-soft);
          font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; transition: 0.2s; white-space: nowrap;
        }
        .aksi-btn:hover { filter: brightness(0.97); transform: translateY(-1px); }
        .aksi-btn.ok { color: var(--ok); border-color: rgba(22,163,74,0.3); }
        .aksi-btn.red { color: var(--red-600); border-color: rgba(220,38,38,0.3); }
        .aksi-btn.warn { color: var(--warn); border-color: rgba(217,119,6,0.3); }
        .aksi-btn.accent { color: var(--accent); border-color: rgba(124,58,237,0.3); }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .modal-box { background: var(--surface); width: 100%; max-width: 440px; border-radius: 22px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35); max-height: 90vh; overflow-y: auto; }

        .riwayat-link { width: 100%; display: flex; align-items: center; justify-content: space-between; background: var(--surface); border: 1px solid var(--line); padding: 16px 20px; border-radius: 16px; color: var(--ink); font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }

        @media (max-width: 640px) {
          .table-search { width: 100% !important; }
          .header-row { flex-direction: column; align-items: stretch !important; }
          .aksi-grid { grid-template-columns: 1fr 1fr; min-width: 170px; }
        }
      `}} />

      {/* NAVBAR */}
      <div className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="back-btn" onClick={() => router.push("/dashboard/driver")}><IconArrowLeft size={16} /></button>
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Log & Daftar Kendaraan</span>
        </div>
        <div className="pic-badge"><IconUserCircle size={14} /> {activeDriver}</div>
      </div>

      {/* HERO SECTION */}
      <div className="page-hero">
        <div className="page-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>🚙 ARMADA SAYA</h1>
          <p style={{ margin: "0 0 15px 0", fontSize: "13px", opacity: 0.9 }}>Catat pergerakan kendaraan — cukup 1 tombol, status Anda otomatis tersinkron</p>
          <div className="page-hero-badge">
            <IconClock size={14} /> {waktuSekarang || "Memuat waktu..."}
          </div>
        </div>
      </div>

      {/* WRAPPER UTAMA */}
      <div style={{ maxWidth: "1100px", margin: "-20px auto 0", padding: "0 20px", position: "relative", zIndex: 10, display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* 🔔 KENDARAAN SEDANG KELUAR — kartu notif per kendaraan yang masih "Keluar Beroperasi",
            tombol "Tiba Kantor Kembali" langsung menutup pergerakan (sama seperti klik Parkir/Standby) */}
        {kendaraanSedangKeluar.length > 0 && (
          <div className="panel-flat" style={{ borderColor: "rgba(220,38,38,0.3)", background: "var(--red-50)" }}>
            <h4 style={{ margin: "0 0 15px 0", color: "var(--red-700)", fontSize: "14px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
              <IconPlaneTakeoff size={16} color="var(--red-600)" /> KENDARAAN SEDANG KELUAR ({kendaraanSedangKeluar.length})
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {kendaraanSedangKeluar.map(({ k, log }) => {
                const isLoadingIni = loadingInstantKey === `${k.id}-standby`;
                return (
                  <div key={k.id} style={{ background: "var(--surface)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "14px", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: "800", color: "var(--ink)", fontSize: "14px" }}>{k.kendaraan.split(" - ")[0]}</div>
                      <div style={{ fontSize: "12px", color: "var(--ink-soft)", marginTop: "3px" }}>
                        Sedang keluar bersama <b>{log.driver_bertugas}</b> — &quot;{log.tujuan_keperluan}&quot;
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                        <IconClock size={11} /> Keluar sejak {formatWaktu(log.waktu_catat)}
                      </div>
                    </div>
                    <button
                      className="aksi-btn ok"
                      style={{ padding: "10px 14px" }}
                      disabled={isLoadingIni}
                      onClick={() => handleAksiInstan(k, aksiStandby)}
                    >
                      <IconPlaneLand size={13} /> {isLoadingIni ? "..." : "Tiba Kantor Kembali"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB NAV */}
        <div className="tab-nav">
          <button className={`tab-btn ${activeTab === "kendaraan" ? "active" : ""}`} onClick={() => setActiveTab("kendaraan")}>
            <IconCar size={15} /> Daftar Kendaraan
          </button>
          <button className={`tab-btn ${activeTab === "log" ? "active" : ""}`} onClick={() => setActiveTab("log")}>
            <IconClipboardList size={15} /> Log Pergerakan Armada
          </button>
        </div>

        {/* TAB 1: DAFTAR KENDARAAN */}
        {activeTab === "kendaraan" && (
          <div className="panel-flat">
            <div className="header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "15px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}><IconCar size={16} color="var(--muted)" /> DAFTAR ARMADA GEDUNG</h3>
              <div className="table-search">
                <IconSearch size={13} color="var(--muted)" />
                <input type="text" placeholder="Cari kendaraan / jenis / PIC..." value={searchKendaraan} onChange={(e) => setSearchKendaraan(e.target.value)} />
              </div>
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>Kendaraan</th>
                    <th>Jenis</th>
                    <th>PIC Kendaraan</th>
                    <th>Status Terkini</th>
                    <th>Aksi Cepat</th>
                  </tr>
                </thead>
                <tbody>
                  {kendaraanMaster.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "40px 20px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                          <IconInboxEmpty size={26} color="var(--muted)" /> Belum ada data kendaraan di Master Data.
                        </div>
                      </td>
                    </tr>
                  ) : kendaraanTerfilter.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "40px 20px" }}>Tidak ada kendaraan yang cocok dengan pencarian.</td>
                    </tr>
                  ) : (
                    kendaraanTerfilter.map((k) => {
                      const logTerkini = statusPerKendaraan[k.kendaraan];
                      const statusStr = logTerkini?.status_kendaraan || "Tiba di Kantor (Standby)";
                      const cls = classifyStatus(statusStr);

                      return (
                        <tr key={k.id}>
                          <td>
                            <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{k.kendaraan.split(" - ")[0]}</div>
                            {logTerkini && (
                              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px" }}>Terakhir: {formatWaktu(logTerkini.waktu_catat)}</div>
                            )}
                          </td>
                          <td style={{ color: "var(--ink-soft)" }}>{k.jenis || "-"}</td>
                          <td style={{ color: "var(--ink-soft)", fontWeight: "600" }}>{k.pic_kendaraan || <span style={{ opacity: 0.5 }}>Belum diisi</span>}</td>
                          <td>
                            <span className="status-pill" style={{ background: cls.bg, color: cls.color }}>{cls.label}</span>
                          </td>
                          <td>
                            <div className="aksi-grid">
                              {STATUS_AKSI.map((aksi) => {
                                const AksiIcon = aksi.icon;
                                const isLoadingIni = loadingInstantKey === `${k.id}-${aksi.key}`;
                                return (
                                  <button
                                    key={aksi.key}
                                    className={`aksi-btn ${aksi.tone}`}
                                    disabled={isLoadingIni}
                                    onClick={() => aksi.instant ? handleAksiInstan(k, aksi) : bukaModalAksi(k, aksi.status, aksi.label)}
                                  >
                                    <AksiIcon size={12} /> {isLoadingIni ? "..." : aksi.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: LOG PERGERAKAN ARMADA */}
        {activeTab === "log" && (
          <div className="panel-flat">
            <div className="header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "15px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}><IconClipboardList size={16} color="var(--muted)" /> LOG AKTIVITAS MOBIL</h3>
              <div className="table-search">
                <IconSearch size={13} color="var(--muted)" />
                <input type="text" placeholder="Cari mobil / driver..." value={searchLog} onChange={(e) => setSearchLog(e.target.value)} />
              </div>
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>Mobil Operasional</th>
                    <th>Driver Pengendara</th>
                    <th>Tujuan & KM</th>
                    <th>Waktu & Petugas</th>
                  </tr>
                </thead>
                <tbody>
                  {logMobilTerfilter.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: "40px 20px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                          <IconInboxEmpty size={26} color="var(--muted)" /> Belum ada riwayat pergerakan.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    logMobilTerfilter.map((log) => {
                      const cls = classifyStatus(log.status_kendaraan);

                      return (
                        <tr key={log.id}>
                          <td>
                            <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{log.kendaraan.split(" - ")[0]}</div>
                            <div style={{ marginTop: "4px" }}>
                              <span className="status-pill" style={{ background: cls.bg, color: cls.color }}>{cls.label}</span>
                            </div>
                          </td>
                          <td style={{ color: "var(--info)", fontWeight: "800" }}>{log.driver_bertugas}</td>
                          <td style={{ color: "var(--ink-soft)" }}>
                            <div style={{ fontStyle: "italic", fontSize: "12px" }}>&quot;{log.tujuan_keperluan}&quot;</div>
                            <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}><IconGauge size={11} /> KM: {log.kilometer_kendaraan}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: "bold", color: "var(--ink-soft)" }}>{formatWaktu(log.waktu_catat)}</div>
                            <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}><IconUserCircle size={11} /> {log.petugas_security.split(" ")[0]}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button className="riwayat-link" onClick={() => router.push("/dashboard/driver/riwayat")}>
          Lihat Riwayat Armada Saya <IconChevronRight size={16} color="var(--muted)" />
        </button>

      </div>

      {/* 🪟 MODAL AKSI — dipicu dari tombol Keluar / Service (butuh Tujuan/Keperluan & KM) */}
      {modalAksi && (
        <div className="modal-overlay" onClick={() => !isLoadingAksi && setModalAksi(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{modalAksi.label}</div>
                <h3 style={{ margin: "4px 0 0", fontSize: "17px", fontWeight: "900", color: "var(--ink)" }}>{modalAksi.kendaraan.kendaraan.split(" - ")[0]}</h3>
              </div>
              <button onClick={() => !isLoadingAksi && setModalAksi(null)} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "10px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--ink-soft)" }}><IconX size={14} /></button>
            </div>

            <form onSubmit={handleSubmitAksi} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="field-label">TUJUAN / KEPERLUAN {modalAksi.status === "Keluar Beroperasi" ? "*" : ""}</label>
                <textarea placeholder="Contoh: Mengantar dokumen ke Pelabuhan..." value={tujuan} onChange={(e) => setTujuan(e.target.value)} className="field-input" style={{ height: "60px", resize: "none" }} />
              </div>
              <div>
                <label className="field-label">SPEEDOMETER (KM)</label>
                <input type="number" placeholder="KM saat ini (Opsional)" value={kilometer} onChange={(e) => setKilometer(e.target.value)} className="field-input" />
              </div>
              <button type="submit" disabled={isLoadingAksi} style={{ width: "100%", padding: "14px", background: "var(--info)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}>
                <IconSave size={15} /> {isLoadingAksi ? "Menyimpan..." : "Konfirmasi & Kirim"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
