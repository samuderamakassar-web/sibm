"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan dashboard/security & dashboard/ob
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
const IconSteeringWheel = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.2" /><path d="M12 5v5" /><path d="m7.5 15 3-2" /><path d="m16.5 15-3-2" /></svg>
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
const IconDisc = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /></svg>
);
const IconGauge = ({ size = 11, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15a8 8 0 1 1 16 0" /><path d="M12 15 15 10" /><path d="M4 15h1M19 15h1M12 5v1" /></svg>
);
const IconUsers = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8.5" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.7-5.8 6-5.8s6 2.4 6 5.8" /><path d="M16 8.2a3 3 0 1 1 0-6" /><path d="M15 14.5c2.8.4 4.8 2.5 4.8 5.5" /></svg>
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
const IconCheckCircle = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
);
const IconRefresh = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" /><path d="M3 21v-5h5" /></svg>
);
const IconSave = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h8V3" /><path d="M8 21v-7h8v7" /></svg>
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

interface DriverStatusLog {
  id: string;
  nama_driver: string;
  status: string;
  waktu_ubah: Timestamp | null;
  petugas_security: string;
}

interface KendaraanMaster {
  id: string;
  kendaraan: string;
}

interface Employee {
  id: string;
  nama: string;
}

// ==========================================
// MASTER DATA
// ==========================================
// Pilihan "siapa yang membawa kendaraan" — dulu ada 2 opsi generik yang tumpang tindih
// ("Penanggung Jawab Kendaraan (PIC)" & "Karyawan / PIC Kendaraan"), sekarang disederhanakan
// jadi 1 opsi "Karyawan" yang begitu dipilih, wajib isi nama karyawan spesifiknya (lihat state
// `namaKaryawan` & field kondisional di form).
const DAFTAR_DRIVER = ["Amal Setiawan", "Muhammad Renaldy", "Karyawan"];

// Daftar Driver Murni untuk Card Manajemen Absensi Driver
const DRIVER_ONLY = ["Amal Setiawan", "Muhammad Renaldy"];

export default function LogOperasionalPage() {
  const router = useRouter();

  const [picName, setPicName] = useState<string>("");
  const [waktuSekarang, setWaktuSekarang] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);

  // Loading & Success States
  const [isLoadingMobil, setIsLoadingMobil] = useState<boolean>(false);
  const [isLoadingDriver, setIsLoadingDriver] = useState<boolean>(false);
  const [isSuccessMobil, setIsSuccessMobil] = useState<boolean>(false);
  const [isSuccessDriver, setIsSuccessDriver] = useState<boolean>(false);

  // 🚙 STATE FORM KENDARAAN — daftar armada ditarik live dari master_kendaraan (bukan hardcode lagi,
  // biar gak ada lagi drift kayak PIC/unit yang udah ganti di admin tapi dropdown ini masih versi lama)
  const [kendaraanMaster, setKendaraanMaster] = useState<KendaraanMaster[]>([]);
  const [kendaraan, setKendaraan] = useState<string>("");
  const [statusMobil, setStatusMobil] = useState<string>("Keluar Beroperasi");
  const [driverMobil, setDriverMobil] = useState<string>(DAFTAR_DRIVER[0]);
  const [namaKaryawan, setNamaKaryawan] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tujuan, setTujuan] = useState<string>("");
  const [kilometer, setKilometer] = useState<string>("");

  // Kalau belum ada yang dipilih manual, jatuhkan ke kendaraan pertama begitu master data kebaca
  const kendaraanEfektif = kendaraan || kendaraanMaster[0]?.kendaraan || "";

  // 🧑‍✈️ STATE FORM STATUS DRIVER MURNI
  const [targetDriver, setTargetDriver] = useState<string>(DRIVER_ONLY[0]);
  const [statusDriver, setStatusDriver] = useState<string>("Standby");

  // STATE MONITORING (KANAN)
  const [searchTabel, setSearchTabel] = useState<string>("");
  const [daftarLogMobil, setDaftarLogMobil] = useState<KendaraanLog[]>([]);
  const [driverStatusTerkini, setDriverStatusTerkini] = useState<Record<string, DriverStatusLog>>({});

  // 1. Inisialisasi Jam Live & PIC
  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) {
      router.push("/dashboard/security");
      return;
    }

    setTimeout(() => {
      setPicName(nama);
      setIsReady(true);
    }, 0);

    const timer = setInterval(() => {
      setWaktuSekarang(new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" }));
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  // 1B. Tarik Master Data Kendaraan (live dari admin/kendaraan) & Karyawan (buat datalist saran nama)
  useEffect(() => {
    const unsubKendaraan = onSnapshot(query(collection(db, "master_kendaraan"), orderBy("kendaraan", "asc")), (snap) => {
      setKendaraanMaster(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KendaraanMaster)));
    });
    const unsubEmployees = onSnapshot(collection(db, "employees_directory"), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
    });
    return () => { unsubKendaraan(); unsubEmployees(); };
  }, []);

  // 2. Tarik Data Real-time (Mobil & Driver)
  useEffect(() => {
    // Stream Log Mobil
    const qMobil = query(collection(db, "operational_vehicle_logs"), orderBy("waktu_catat", "desc"));
    const unsubMobil = onSnapshot(qMobil, (snapshot) => {
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

    // Stream Status Driver
    const qDriver = query(collection(db, "driver_status_logs"), orderBy("waktu_ubah", "desc"));
    const unsubDriver = onSnapshot(qDriver, (snapshot) => {
      const statusMap: Record<string, DriverStatusLog> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const nama = data.nama_driver;
        if (nama && !statusMap[nama]) {
          statusMap[nama] = {
            id: docSnap.id,
            nama_driver: nama,
            status: data.status || "Standby",
            waktu_ubah: data.waktu_ubah || null,
            petugas_security: data.petugas_security || "-"
          };
        }
      });
      setDriverStatusTerkini(statusMap);
    });

    return () => { unsubMobil(); unsubDriver(); };
  }, []);

  // 3. Submit Log Mobil (DENGAN OTOMATISASI STATUS DRIVER)
  const handleSubmitMobil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (statusMobil === "Keluar Beroperasi" && !tujuan.trim()) {
      alert("Tujuan/Keperluan wajib diisi jika kendaraan keluar!");
      return;
    }
    if (driverMobil === "Karyawan" && !namaKaryawan.trim()) {
      alert("Nama karyawan yang membawa kendaraan wajib diisi!");
      return;
    }

    // Kalau yang bawa "Karyawan", simpan NAMA KARYAWAN-nya langsung ke field driver_bertugas
    // (bukan label generik "Karyawan") — biar kolom Driver Pengendara di tabel ini & kolom
    // PIC/Driver di Riwayat admin/kendaraan langsung kebaca siapa orangnya, tanpa kolom baru.
    const driverBertugasFinal = driverMobil === "Karyawan" ? namaKaryawan.trim() : driverMobil;

    setIsLoadingMobil(true);
    setIsSuccessMobil(false);

    try {
      // A. Simpan log kendaraan ke Firestore
      await addDoc(collection(db, "operational_vehicle_logs"), {
        petugas_security: picName,
        waktu_catat: serverTimestamp(),
        kendaraan: kendaraanEfektif,
        status_kendaraan: statusMobil,
        driver_bertugas: driverBertugasFinal,
        tujuan_keperluan: tujuan || "-",
        kilometer_kendaraan: kilometer || "Tidak dicatat",
      });

      // 💡 B. AUTO-UPDATE STATUS DRIVER (Hanya jika driver yang dipilih adalah Amal/Renaldy)
      if (DRIVER_ONLY.includes(driverMobil)) {
        let otomatisStatusDriver = "Standby";
        if (statusMobil === "Keluar Beroperasi" || statusMobil === "Masuk Bengkel / Service") {
          otomatisStatusDriver = "Keluar Beroperasi";
        }

        await addDoc(collection(db, "driver_status_logs"), {
          nama_driver: driverMobil,
          status: otomatisStatusDriver,
          waktu_ubah: serverTimestamp(),
          petugas_security: picName + " (Sistem Auto-Sync)"
        });
      }

      setIsSuccessMobil(true);
      setTujuan("");
      setKilometer("");
      setNamaKaryawan("");
      setTimeout(() => setIsSuccessMobil(false), 4000);
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan data kendaraan.");
    } finally {
      setIsLoadingMobil(false);
    }
  };

  // 4. Submit Status Driver Murni (Manual via Card Bawah)
  const handleSubmitDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingDriver(true);
    setIsSuccessDriver(false);

    try {
      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: targetDriver,
        status: statusDriver,
        waktu_ubah: serverTimestamp(),
        petugas_security: picName
      });

      setIsSuccessDriver(true);
      setTimeout(() => setIsSuccessDriver(false), 4000);
    } catch (error) {
      console.error(error);
      alert("Gagal mengubah status driver.");
    } finally {
      setIsLoadingDriver(false);
    }
  };

  const formatWaktu = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const logMobilTerfilter = daftarLogMobil.filter((log) =>
    log.kendaraan.toLowerCase().includes(searchTabel.toLowerCase()) ||
    log.driver_bertugas.toLowerCase().includes(searchTabel.toLowerCase())
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

        .panel { background: var(--surface); padding: 22px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid var(--line); box-sizing: border-box; }
        .panel-flat { background: var(--surface); padding: 20px; border-radius: 20px; border: 1px solid var(--line); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); box-sizing: border-box; }
        .panel-title { margin-top: 0; color: var(--ink); border-bottom: 2px solid var(--bg); padding-bottom: 12px; display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 800; }
        .panel-title-icon { padding: 7px; border-radius: 10px; display: flex; }

        .field-label { display: block; font-weight: 700; margin-bottom: 5px; font-size: 11px; color: var(--muted); letter-spacing: 0.3px; }
        .field-input { width: 100%; padding: 13px 15px; border-radius: 12px; border: 1px solid var(--line); font-size: 14px; background: var(--bg); outline: none; box-sizing: border-box; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); transition: all 0.2s; color: var(--ink-soft); font-family: inherit; }
        .field-input:focus { border-color: var(--info); background: var(--surface); }

        .choice-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .choice-item { padding: 10px 5px; border-radius: 10px; cursor: pointer; text-align: center; font-weight: 700; font-size: 11px; transition: 0.2s; display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid var(--line); background: var(--bg); color: var(--muted); }

        .status-card { padding: 15px; border-radius: 14px; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; transition: 0.3s; }
        .status-pill { font-size: 10px; font-weight: bold; padding: 3px 9px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; }

        .responsive-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        .responsive-table thead tr { background: var(--bg); color: var(--ink-soft); }
        .responsive-table th { padding: 12px 15px; border-bottom: 2px solid var(--line); font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
        .responsive-table td { padding: 12px 15px; border-bottom: 1px solid var(--line); }
        .table-search { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--line); border-radius: 20px; padding: 0 15px; width: 220px; }
        .table-search input { border: none; outline: none; background: transparent; padding: 10px 0; font-size: 14px; flex: 1; font-family: inherit; }

        @media (max-width: 900px) {
          .parkir-layout { flex-direction: column !important; }
          .parkir-layout > * { flex: 1 1 auto !important; width: 100% !important; }
        }
        @media (max-width: 640px) {
          .table-search { width: 100% !important; }
          .parkir-header-row { flex-direction: column; align-items: stretch !important; }
          .choice-grid { gap: 6px; }
          .choice-item { font-size: 10px; padding: 8px 3px; }
        }
      `}} />

      {/* NAVBAR */}
      <div className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="back-btn" onClick={() => router.push("/dashboard/security")}><IconArrowLeft size={16} /></button>
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Log Operasional</span>
        </div>
        <div className="pic-badge"><IconUserCircle size={14} /> {picName}</div>
      </div>

      {/* HERO SECTION */}
      <div className="page-hero">
        <div className="page-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>LOG OPERASIONAL GERBANG</h1>
          <p style={{ margin: "0 0 15px 0", fontSize: "13px", opacity: 0.9 }}>Manajemen terpisah status pergerakan armada dan kesiagaan team driver SIBM</p>
          <div className="page-hero-badge">
            <IconClock size={14} /> {waktuSekarang || "Memuat waktu..."}
          </div>
        </div>
      </div>

      {/* WRAPPER UTAMA SPLIT SCREEN */}
      <div className="parkir-layout" style={{ maxWidth: "1250px", margin: "-20px auto 0", padding: "0 20px", position: "relative", zIndex: 10, display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" }}>

        {/* SISI KIRI: KUMPULAN FORM INPUT */}
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "25px" }}>

          {/* CARD 1: FORM KENDARAAN */}
          <div className="panel">
            <h3 className="panel-title">
              <span className="panel-title-icon" style={{ background: "var(--red-50)", color: "var(--red-600)" }}><IconCar size={16} /></span> LOG PERGERAKAN ARMADA
            </h3>
            {isSuccessMobil && (
              <div style={{ background: "var(--ok-50)", color: "var(--ok)", padding: "10px", borderRadius: "8px", marginBottom: "15px", fontSize: "12px", fontWeight: "bold", border: "1px solid rgba(22,163,74,0.25)", display: "flex", alignItems: "center", gap: "8px" }}><IconCheckCircle size={14} /> Log armada dan status driver berhasil sinkron!</div>
            )}
            <form onSubmit={handleSubmitMobil} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="field-label">PILIH ARMADA GEDUNG *</label>
                {kendaraanMaster.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "var(--muted)", padding: "13px 15px", background: "var(--bg)", borderRadius: "12px", border: "1px dashed var(--line)" }}>
                    Belum ada data kendaraan di Master Data.
                  </div>
                ) : (
                  <select value={kendaraanEfektif} onChange={(e) => setKendaraan(e.target.value)} className="field-input" style={{ fontWeight: "bold", fontSize: "13px" }}>
                    {kendaraanMaster.map(mobil => <option key={mobil.id} value={mobil.kendaraan}>{mobil.kendaraan}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="field-label">AKTIVITAS MOBIL *</label>
                <div className="choice-grid">
                  {["Keluar Beroperasi", "Tiba di Kantor (Standby)", "Masuk Bengkel / Service"].map((st) => {
                    const active = statusMobil === st;
                    const StIcon = st === "Keluar Beroperasi" ? IconPlaneTakeoff : st === "Tiba di Kantor (Standby)" ? IconPlaneLand : IconWrench;
                    return (
                      <div
                        key={st} onClick={() => setStatusMobil(st)}
                        className="choice-item"
                        style={active ? { border: "2px solid var(--info)", background: "var(--info-50)", color: "var(--info)" } : {}}
                      >
                        <StIcon size={14} />
                        {st === "Keluar Beroperasi" ? "Keluar" : st === "Tiba di Kantor (Standby)" ? "Standby" : "Service"}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="field-label">SIAPA YANG MEMBAWA KENDARAAN? *</label>
                <select value={driverMobil} onChange={(e) => setDriverMobil(e.target.value)} className="field-input">
                  {DAFTAR_DRIVER.map(drv => <option key={drv} value={drv}>{drv}</option>)}
                </select>
                {DRIVER_ONLY.includes(driverMobil) && (
                  <div style={{ fontSize: "10px", color: "var(--ok)", marginTop: "5px", fontWeight: "bold" }}>Info: Status absensi driver ini akan ikut ter-update otomatis.</div>
                )}
              </div>
              {driverMobil === "Karyawan" && (
                <div>
                  <label className="field-label">NAMA KARYAWAN YANG MEMBAWA *</label>
                  <input
                    type="text" list="daftar-nama-karyawan" placeholder="Ketik nama — bisa pilih dari master karyawan"
                    value={namaKaryawan} onChange={(e) => setNamaKaryawan(e.target.value)} className="field-input"
                  />
                  <datalist id="daftar-nama-karyawan">
                    {employees.map((emp) => <option key={emp.id} value={emp.nama} />)}
                  </datalist>
                </div>
              )}
              <div>
                <label className="field-label">TUJUAN / KEPERLUAN PERJALANAN</label>
                <textarea placeholder="Contoh: Mengantar dokumen ke Pelabuhan..." value={tujuan} onChange={(e) => setTujuan(e.target.value)} className="field-input" style={{ height: "60px", resize: "none" }} />
              </div>
              <div>
                <label className="field-label">SPEEDOMETER (KM)</label>
                <input type="number" placeholder="KM saat ini (Opsional)" value={kilometer} onChange={(e) => setKilometer(e.target.value)} className="field-input" />
              </div>
              <button type="submit" disabled={isLoadingMobil} style={{ width: "100%", padding: "14px", background: "var(--info)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}>
                <IconSave size={15} /> {isLoadingMobil ? "Menyimpan..." : "Kirim Log Armada"}
              </button>
            </form>
          </div>

          {/* CARD 2: FORM STATUS DRIVER MURNI */}
          <div className="panel">
            <h3 className="panel-title">
              <span className="panel-title-icon" style={{ background: "var(--info-50)", color: "var(--info)" }}><IconSteeringWheel size={16} /></span> KOREKSI MANUAL ABSENSI DRIVER
            </h3>
            {isSuccessDriver && (
              <div style={{ background: "var(--ok-50)", color: "var(--ok)", padding: "10px", borderRadius: "8px", marginBottom: "15px", fontSize: "12px", fontWeight: "bold", border: "1px solid rgba(22,163,74,0.25)", display: "flex", alignItems: "center", gap: "8px" }}><IconCheckCircle size={14} /> Status kesiagaan Driver diperbarui!</div>
            )}
            <form onSubmit={handleSubmitDriver} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="field-label">PILIH NAMA DRIVER *</label>
                <select value={targetDriver} onChange={(e) => setTargetDriver(e.target.value)} className="field-input" style={{ fontWeight: "bold" }}>
                  {DRIVER_ONLY.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">KONDISI DRIVER SAAT INI *</label>
                <div className="choice-grid">
                  {["Standby", "Keluar Beroperasi", "Off Duty / Izin"].map((sd) => {
                    const active = statusDriver === sd;
                    const SdIcon = sd === "Standby" ? IconPlaneLand : sd === "Keluar Beroperasi" ? IconPlaneTakeoff : IconDisc;
                    return (
                      <div
                        key={sd} onClick={() => setStatusDriver(sd)}
                        className="choice-item"
                        style={active ? { border: "2px solid var(--ok)", background: "var(--ok-50)", color: "var(--ok)" } : {}}
                      >
                        <SdIcon size={14} />
                        {sd === "Standby" ? "Standby" : sd === "Keluar Beroperasi" ? "Keluar" : "Off / Izin"}
                      </div>
                    );
                  })}
                </div>
              </div>
              <button type="submit" disabled={isLoadingDriver} style={{ width: "100%", padding: "14px", background: "var(--ok)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", marginTop: "5px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}>
                <IconRefresh size={14} /> {isLoadingDriver ? "Memperbarui..." : "Update Manual Personel"}
              </button>
            </form>
          </div>

        </div>

        {/* SISI KANAN: MONITORING MONITOR REAL-TIME */}
        <div style={{ flex: "2 1 550px", display: "flex", flexDirection: "column", gap: "25px", boxSizing: "border-box" }}>

          {/* PANEL KANAN ATAS: MONITOR STATUS SIAGA DRIVER TERKINI */}
          <div className="panel-flat">
            <h4 style={{ margin: "0 0 15px 0", color: "var(--ink)", fontSize: "14px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}><IconUsers size={16} color="var(--muted)" /> STATUS KESIAGAAN DRIVER TERKINI (REAL-TIME)</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "15px" }}>
              {DRIVER_ONLY.map(nama => {
                const liveStatus = driverStatusTerkini[nama];
                const statusStr = liveStatus ? liveStatus.status : "Standby";
                const isStandby = statusStr === "Standby";
                const isKeluar = statusStr === "Keluar Beroperasi";

                return (
                  <div key={nama} className="status-card" style={{ background: isStandby ? "var(--ok-50)" : isKeluar ? "var(--red-50)" : "var(--bg)" }}>
                    <div style={{ fontWeight: "800", color: "var(--ink)", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}><IconSteeringWheel size={14} color="var(--muted)" /> {nama}</div>
                    <div style={{ marginTop: "2px" }}>
                      <span className="status-pill" style={{
                        background: isStandby ? "var(--ok-50)" : isKeluar ? "rgba(220,38,38,0.15)" : "var(--line)",
                        color: isStandby ? "var(--ok)" : isKeluar ? "var(--red-600)" : "var(--ink-soft)"
                      }}>
                        {isStandby ? "STANDBY DI POS" : isKeluar ? "SEDANG KELUAR" : "OFF DUTY / IZIN"}
                      </span>
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "5px", fontWeight: "bold" }}>
                      Diperbarui: {liveStatus ? formatWaktu(liveStatus.waktu_ubah) : "Bawaan Sistem"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PANEL KANAN BAWAH: TABEL MONITOR PERGERAKAN MOBIL */}
          <div className="panel-flat">
            <div className="parkir-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "15px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}><IconClipboardList size={16} color="var(--muted)" /> LOG AKTIVITAS MOBIL HARI INI</h3>
              <div className="table-search">
                <IconSearch size={13} color="var(--muted)" />
                <input type="text" placeholder="Cari mobil / driver..." value={searchTabel} onChange={(e) => setSearchTabel(e.target.value)} />
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
                          <IconInboxEmpty size={26} color="var(--muted)" /> Belum ada riwayat pergerakan hari ini.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    logMobilTerfilter.map((log) => {
                      const isStandby = log.status_kendaraan.includes("Standby");
                      const isBengkel = log.status_kendaraan.includes("Bengkel");

                      return (
                        <tr key={log.id}>
                          <td>
                            <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{log.kendaraan.split(" - ")[0]}</div>
                            <div style={{ marginTop: "4px" }}>
                              <span className="status-pill" style={{
                                background: isStandby ? "var(--ok-50)" : isBengkel ? "var(--line)" : "var(--red-50)",
                                color: isStandby ? "var(--ok)" : isBengkel ? "var(--ink-soft)" : "var(--red-600)"
                              }}>
                                {isStandby ? "STANDBY" : isBengkel ? "SERVICE" : "KELUAR POOL"}
                              </span>
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

        </div>

      </div>
    </div>
  );
}
