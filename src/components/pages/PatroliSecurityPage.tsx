"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Html5QrcodeScanner } from "html5-qrcode";
import { useToast } from "../ui/ToastProvider";
import { useConfirm } from "../ui/ConfirmProvider";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan dashboard/security & dashboard/ob
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconSiren = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18v-6a5 5 0 0 1 10 0v6" /><path d="M5 18h14v2H5z" /><path d="M12 2v2M4.2 6.2l1.4 1.4M19.8 6.2l-1.4 1.4" /></svg>
);
const IconHistory = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l4 2" /></svg>
);
const IconTarget = ({ size = 17, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>
);
const IconChevronDown = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
);
const IconCamera = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A1.5 1.5 0 0 1 9.5 3.6h5a1.5 1.5 0 0 1 1.3.8L17 6h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const IconCheck = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const IconX = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
);
const IconClipboardCheck = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="m9 14 2 2 4-4" /></svg>
);
const IconRocket = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 16s-1-5 4-9c4-3.4 8-3 8-3s.4 4-3 8c-4 5-9 4-9 4z" /><path d="M9 15l-4 4" /><circle cx="14.5" cy="9.5" r="1.5" /></svg>
);
const IconAlertTriangle = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 4.5 2.9 18a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.5 4.5a2 2 0 0 0-3 0z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
const IconInboxEmpty = ({ size = 40, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);
const IconSettings = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
const IconMapPin = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.7 7-12a7 7 0 1 0-14 0c0 5.3 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);

// ==========================================
// 1. DATA TITIK PATROLI
// ==========================================
const GROUPED_PATROLI: Record<string, { id: string, nama: string }[]> = {
  "Ground (Basement)": [
    { id: "Ground::Parkiran Basement", nama: "Area Parkiran Basement" },
    { id: "Ground::Toilet", nama: "Toilet Basement" },
    { id: "Ground::Ruang Genset", nama: "Ruang Genset" },
    { id: "Ground::Ruang Pompa", nama: "Ruang Pompa Utama" },
    { id: "Ground::Gudang", nama: "Gudang Basement" },
    { id: "Ground::Mushallah Basement", nama: "Mushallah Basement" },
  ],
  "Lantai 1": [
    { id: "Lantai 1::Lobby", nama: "Lobby Utama" },
    { id: "Lantai 1::Asbin", nama: "Ruang Asbin" },
    { id: "Lantai 1::Ruang Meeting", nama: "Ruang Meeting Lt 1" },
    { id: "Lantai 1::Toilet", nama: "Toilet Lt 1" },
    { id: "Lantai 1::Ruang Tamu", nama: "Ruang Tamu" },
    { id: "Lantai 1::Pantry", nama: "Pantry Lt 1" },
  ],
  "Lantai 2": [
    { id: "Lantai 2::Ruang Kerja Utama", nama: "Ruang Kerja Utama" },
    { id: "Lantai 2::Pantry", nama: "Pantry Lt 2" },
    { id: "Lantai 2::Toilet", nama: "Toilet Lt 2" },
    { id: "Lantai 2::Ruang Kerja SAI", nama: "Ruang Kerja SAI" },
    { id: "Lantai 2::Ruang Direktur", nama: "Ruang Direktur" },
    { id: "Lantai 2::Ruang GM", nama: "Ruang General Manager" },
    { id: "Lantai 2::Server", nama: "Ruang Server (IT)" },
    { id: "Lantai 2::Ruang Arsip", nama: "Ruang Arsip" },
  ],
  "Lantai 3": [
    { id: "Lantai 3::Gudang", nama: "Gudang Lt 3" },
    { id: "Lantai 3::Toilet", nama: "Toilet Lt 3" },
    { id: "Lantai 3::Ruang Kesehatan", nama: "Klinik / Ruang Kesehatan" },
    { id: "Lantai 3::Ruang Meeting", nama: "Ruang Meeting Lt 3" },
    { id: "Lantai 3::Ruang Kerja Kosong", nama: "Ruang Kerja Kosong" },
    { id: "Lantai 3::Ruang Kerja PPNP", nama: "Ruang Kerja PPNP" },
  ],
  "Lantai 4": [
    { id: "Lantai 4::Ruang Kerja Kosong", nama: "Ruang Kerja Kosong" },
    { id: "Lantai 4::Toilet", nama: "Toilet Lt 4" },
    { id: "Lantai 4::Pantry", nama: "Pantry Lt 4" },
    { id: "Lantai 4::Mushallah", nama: "Mushallah Utama" },
  ],
  "Lantai 5": [
    { id: "Lantai 5::Rooftop", nama: "Area Rooftop" },
    { id: "Lantai 5::Gudang", nama: "Gudang Lt 5" },
    { id: "Lantai 5::Ruang Pompa", nama: "Ruang Pompa Air Lt 5" },
  ]
};

// ==========================================
// INTERFACES
// ==========================================
interface TitikAman {
  id: string;
  waktu_patroli: string;
  kondisi: string;
  foto: string;
}

interface PatroliLog {
  id: string;
  waktu_laporan: Timestamp | null;
  status: string;
  catatan_shift: string;
  titik_patroli: TitikAman[];
}

export default function PatroliSecurityPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);

  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"FORM" | "HISTORY">("FORM"); // FITUR TAB BARU

  const [scannedItems, setScannedItems] = useState<TitikAman[]>([]);
  const [catatanUmum, setCatatanUmum] = useState<string>("");
  const [alasanTerlewat, setAlasanTerlewat] = useState<Record<string, string>>({});
  const [riwayatSaya, setRiwayatSaya] = useState<PatroliLog[]>([]); // DATA RIWAYAT BARU

  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [kondisiTitik, setKondisiTitik] = useState<string>("Aman Terkendali");
  const [lantaiAktif, setLantaiAktif] = useState<string>("Ground (Basement)");
  const [showReview, setShowReview] = useState<boolean>(false);

  const [photoTarget, setPhotoTarget] = useState<{ id: string, nama: string } | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const totalTitikKeseluruhan = useMemo(() => Object.values(GROUPED_PATROLI).reduce((acc, curr) => acc + curr.length, 0), []);
  const progressPersen = (scannedItems.length / totalTitikKeseluruhan) * 100;
  const semuaTitikPatroli = useMemo(() => Object.values(GROUPED_PATROLI).flat(), []);
  const titikTerlewat = useMemo(
    () => semuaTitikPatroli.filter((t) => !scannedItems.some((s) => s.id === t.id)),
    [scannedItems, semuaTitikPatroli]
  );
  const belumLengkapAlasan = titikTerlewat.some((t) => !(alasanTerlewat[t.id] || "").trim());

  // ==========================================
  // FUNGSI KAMERA
  // ==========================================
  const bukaKamera = useCallback(async (idTitik: string, namaTitik: string) => {
    setPhotoTarget({ id: idTitik, nama: namaTitik });
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error(error);
      showToast("Gagal mengakses kamera. Pastikan izin kamera diberikan di browser Anda.", "error");
      setPhotoTarget(null);
    }
  }, []);

  const matikanKamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setPhotoTarget(null);
  };

  async function uploadToCloudinary(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
    formData.append("folder", "sibm/patroli-security");

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
    const data = await res.json();
    return data.secure_url as string;
  }

  const ambilFotoWatermark = () => {
    if (!videoRef.current || !canvasRef.current || !photoTarget) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 720;
    canvas.height = (video.videoHeight / video.videoWidth) * 720;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, canvas.height - 90, canvas.width, 90);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Arial";
    ctx.fillText(`📍 ${photoTarget.nama}`, 20, canvas.height - 55);
    ctx.font = "18px Arial";
    ctx.fillText(`🕒 ${currentTime}`, 20, canvas.height - 25);

    ctx.fillStyle = kondisiTitik === "Aman Terkendali" ? "#86efac" : "#fca5a5";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`Status: ${kondisiTitik}`, canvas.width - 20, canvas.height - 35);

    const targetSaatIni = photoTarget;
    const jamSekarang = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    matikanKamera();

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setIsUploadingFoto(true);
      try {
        const url = await uploadToCloudinary(blob);
        setScannedItems(prev => [...prev, { id: targetSaatIni.id, waktu_patroli: jamSekarang, kondisi: kondisiTitik, foto: url }]);
      } catch (err) {
        console.error(err);
        showToast(`Gagal upload foto untuk ${targetSaatIni.nama}. Titik ini belum tercatat, coba ulangi.`, "error");
      } finally {
        setIsUploadingFoto(false);
      }
    }, "image/jpeg", 0.7);
  };

  // ==========================================
  // EFFECTS
  // ==========================================
  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) return router.push("/dashboard/security");

    setTimeout(() => {
      setPicName(nama);
      setIsReady(true);
    }, 0);
  }, [router]);

  // Efek Tarik Riwayat (BARU)
  useEffect(() => {
    if (!picName) return;

    // Mengambil riwayat yang dilaporkan oleh user ini
    const q = query(collection(db, "security_patrols"), where("petugas", "==", picName), orderBy("waktu_laporan", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: PatroliLog[] = [];
      snapshot.forEach(docSnap => data.push({ id: docSnap.id, ...docSnap.data() } as PatroliLog));
      setRiwayatSaya(data);
    });

    return () => unsubscribe();
  }, [picName]);

  useEffect(() => {
    if (photoTarget) {
      const interval = setInterval(() => {
        setCurrentTime(new Date().toLocaleString("id-ID", { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [photoTarget]);

  useEffect(() => {
    if (scanTarget) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }, false);
      scanner.render((decodedText) => {
        if (decodedText === scanTarget) {
          scanner.clear();
          const targetNama = scanTarget.split("::")[1];
          setScanTarget(null);
          bukaKamera(scanTarget, targetNama);
        } else {
          showToast(`❌ QR Code Salah! Anda tidak berada di titik ${scanTarget.split("::")[1]}`, "warning");
        }
      }, () => {});

      return () => { scanner.clear().catch(e => console.error(e)); };
    }
  }, [scanTarget, kondisiTitik, bukaKamera]);

  const handleUbahAlasan = (id: string, alasan: string) => {
    setAlasanTerlewat((prev) => ({ ...prev, [id]: alasan }));
  };

  // ==========================================
  // HANDLERS
  // ==========================================
  const handleSubmitFinal = async () => {
    setIsLoading(true);
    try {
      await addDoc(collection(db, "security_patrols"), {
        petugas: picName,
        waktu_laporan: serverTimestamp(),
        titik_patroli: scannedItems,
        area_terlewat: titikTerlewat.map((t) => ({ id: t.id, nama: t.nama, alasan: alasanTerlewat[t.id] || "" })),
        catatan_shift: catatanUmum,
        status: scannedItems.length === totalTitikKeseluruhan ? "Selesai Sempurna" : "Selesai Sebagian"
      });

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setShowReview(false);
        setScannedItems([]);
        setAlasanTerlewat({});
        setCatatanUmum("");
        setActiveTab("HISTORY"); // PERBAIKAN: Arahkan ke Tab Riwayat setelah submit
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 2000);
    } catch (error) {
      console.error(error);
      showToast("Gagal mengirim laporan patroli.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusLantai = (namaLantai: string) => {
    const titikLantai = GROUPED_PATROLI[namaLantai];
    const scannedDiLantai = titikLantai.filter(t => scannedItems.some(s => s.id === t.id)).length;
    return { total: titikLantai.length, selesai: scannedDiLantai };
  };

  const formatWaktu = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return new Date(ts.toDate()).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

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
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .top-bar {
          display: flex; justify-content: space-between; align-items: center; padding: 14px 20px;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line);
          position: sticky; top: 0; z-index: 50;
        }
        .back-link { background: transparent; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--ink-soft); font-weight: bold; font-size: 14px; font-family: inherit; }
        .tab-switch { background: var(--bg); padding: 4px; border-radius: 10px; display: flex; gap: 4px; }
        .tab-btn { border: none; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; background: transparent; color: var(--muted); transition: all 0.2s; display: flex; align-items: center; gap: 6px; font-family: inherit; }
        .tab-btn.active { background: var(--surface); color: var(--red-600); box-shadow: 0 2px 4px rgba(0,0,0,0.06); }

        .page-hero {
          position: relative; overflow: hidden; border-radius: 0 0 30px 30px; color: #fff;
          padding: 36px 20px 70px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .page-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .page-hero-content { position: relative; }

        .panel { background: var(--surface); padding: 22px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid var(--line); }
        .floor-card { background: var(--surface); border-radius: 16px; overflow: hidden; }
        .floor-head { padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .point-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: var(--surface); border-radius: 10px; }
        .scan-btn { background: var(--red-600); color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 6px; font-family: inherit; }
        .missed-input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(217,119,6,0.4); font-size: 13px; font-family: inherit; outline: none; }

        @media (max-width: 640px) {
          .panel { padding: 16px !important; border-radius: 16px !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="top-bar">
        <button className="back-link" onClick={() => router.push("/dashboard/security")}><IconArrowLeft size={16} /> Kembali</button>

        {/* FITUR TAB BARU (FORM VS HISTORY) */}
        <div className="tab-switch">
          <button onClick={() => setActiveTab("FORM")} className={`tab-btn ${activeTab === "FORM" ? "active" : ""}`}>
            <IconSiren size={14} /> Lapor
          </button>
          <button onClick={() => setActiveTab("HISTORY")} className={`tab-btn ${activeTab === "HISTORY" ? "active" : ""}`}>
            <IconHistory size={14} /> Riwayat
          </button>
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="page-hero">
        <div className="page-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PATROLI AREA</h1>
          <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>Pemantauan keliling titik rawan Gedung SIBM</p>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT */}
      <div style={{ maxWidth: "800px", margin: "-45px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>

        {/* ========================================================= */}
        {/* TAB 1: FORM PENGISIAN PATROLI                             */}
        {/* ========================================================= */}
        {activeTab === "FORM" && (
          <div style={{ animation: "fadeIn 0.3s" }}>
            {/* KARTU PROGRESS */}
            <div className="panel" style={{ marginBottom: "25px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}><IconTarget size={17} color="var(--muted)" /> Progres Keliling</h2>
                <span style={{ fontWeight: "900", color: progressPersen === 100 ? "var(--ok)" : "var(--red-600)" }}>{scannedItems.length} / {totalTitikKeseluruhan} Titik</span>
              </div>
              <div style={{ width: "100%", background: "var(--line)", borderRadius: "50px", height: "12px", overflow: "hidden" }}>
                <div style={{ height: "100%", background: progressPersen === 100 ? "var(--ok)" : "linear-gradient(90deg, var(--red-600), var(--warn))", width: `${progressPersen}%`, transition: "width 0.5s ease-in-out" }}></div>
              </div>
              {isSuccess && (
                <div style={{ background: "var(--ok-50)", color: "var(--ok)", padding: "12px", borderRadius: "10px", marginTop: "15px", fontSize: "13px", fontWeight: "bold", border: "1px solid rgba(22,163,74,0.25)", display: "flex", alignItems: "center", gap: "8px" }}><IconCheck size={14} /> Laporan patroli berhasil dikirim! Mengalihkan...</div>
              )}
            </div>

            {/* DAFTAR AKORDEON */}
            {!showReview && (
              <div>
                <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginBottom: "25px" }}>
                  {Object.keys(GROUPED_PATROLI).map((lantai) => {
                    const stat = getStatusLantai(lantai);
                    const isLengkap = stat.selesai === stat.total;
                    const isAktif = lantaiAktif === lantai;

                    return (
                      <div key={lantai} className="floor-card" style={{ border: isLengkap ? "2px solid rgba(22,163,74,0.3)" : "1px solid var(--line)" }}>
                        <div onClick={() => setLantaiAktif(isAktif ? "" : lantai)} className="floor-head" style={{ background: isLengkap ? "var(--ok-50)" : (isAktif ? "var(--bg)" : "var(--surface)") }}>
                          <div>
                            <h3 style={{ margin: "0 0 4px 0", color: isLengkap ? "var(--ok)" : "var(--ink)", fontSize: "16px" }}>{lantai}</h3>
                            <div style={{ fontSize: "12px", color: isLengkap ? "var(--ok)" : "var(--muted)", fontWeight: "bold" }}>{stat.selesai} / {stat.total} Titik Selesai</div>
                          </div>
                          <div style={{ transform: isAktif ? "rotate(180deg)" : "rotate(0deg)", transition: "0.3s", color: "var(--muted)" }}><IconChevronDown size={18} /></div>
                        </div>

                        {isAktif && (
                          <div style={{ padding: "15px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "10px", background: "var(--bg)" }}>
                            {GROUPED_PATROLI[lantai].map((titik) => {
                              const dataSelesai = scannedItems.find((item) => item.id === titik.id);

                              return (
                                <div key={titik.id} className="point-row" style={{ border: dataSelesai ? "1px solid rgba(22,163,74,0.35)" : "1px solid var(--line)" }}>
                                  <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                                    {dataSelesai && (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img src={dataSelesai.foto} alt="Thumb" style={{ width: "40px", height: "40px", borderRadius: "8px", objectFit: "cover", border: "1px solid rgba(22,163,74,0.35)" }} />
                                    )}
                                    <div>
                                      <div style={{ fontSize: "14px", color: dataSelesai ? "var(--ok)" : "var(--ink-soft)", fontWeight: "bold" }}>{titik.nama}</div>
                                      {dataSelesai ? (
                                        <div style={{ fontSize: "11px", color: dataSelesai.kondisi === "Aman Terkendali" ? "var(--ok)" : "var(--red-600)", marginTop: "4px", fontWeight: "bold" }}>
                                          ↳ {dataSelesai.kondisi} ({dataSelesai.waktu_patroli})
                                        </div>
                                      ) : <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>Belum dikunjungi</div>}
                                    </div>
                                  </div>

                                  {!dataSelesai ? (
                                    <button onClick={() => { setKondisiTitik("Aman Terkendali"); setScanTarget(titik.id); }} className="scan-btn"><IconCamera size={13} /> Scan</button>
                                  ) : <div style={{ color: "var(--ok)", fontWeight: "bold", display: "flex", alignItems: "center", gap: "4px" }}><IconCheck size={12} /> Selesai</div>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="panel" style={{ marginBottom: "25px" }}>
                  <label style={{ display: "block", fontWeight: "bold", marginBottom: "10px", color: "var(--ink)", fontSize: "14px" }}>Catatan Akhir Shift (Opsional):</label>
                  <textarea value={catatanUmum} onChange={(e) => setCatatanUmum(e.target.value)} placeholder="Tuliskan kendala atau temuan penting..." style={{ width: "100%", padding: "15px", height: "100px", borderRadius: "10px", border: "1px solid var(--line)", resize: "none", fontSize: "14px", background: "var(--bg)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>

                <button onClick={() => {
                  if (scannedItems.length === 0) return alert("Belum ada titik yang dipatroli!");
                  setShowReview(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }} style={{ width: "100%", padding: "18px", background: scannedItems.length === 0 ? "#a0aec0" : "var(--info)", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: scannedItems.length === 0 ? "not-allowed" : "pointer", boxShadow: "0 10px 15px -3px rgba(37,99,235,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}>
                  <IconClipboardCheck size={16} /> Review Hasil Patroli ➔
                </button>
              </div>
            )}

            {/* TABEL REVIEW SEBELUM SUBMIT */}
            {showReview && (
              <div className="panel" style={{ animation: "fadeIn 0.3s ease-in-out" }}>
                <h2 style={{ margin: "0 0 10px 0", color: "var(--ink)", fontSize: "20px", borderBottom: "2px solid var(--bg)", paddingBottom: "10px" }}>Verifikasi Laporan</h2>
                <p style={{ color: "var(--muted)", fontSize: "13px", marginBottom: "20px" }}>Pastikan tidak ada titik yang terlewat sebelum mengunci laporan.</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginBottom: "30px", maxHeight: "60vh", overflowY: "auto", paddingRight: "10px" }}>
                  {scannedItems.map((item, idx) => {
                    const isAman = item.kondisi === "Aman Terkendali";
                    return (
                      <div key={idx} style={{ display: "flex", gap: "15px", padding: "15px", border: "1px solid var(--line)", borderRadius: "12px", background: "var(--bg)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.foto} alt="Patroli" style={{ width: "80px", height: "100px", objectFit: "cover", borderRadius: "8px", border: "2px solid var(--line)" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "12px", color: "var(--muted)", fontWeight: "bold" }}>{item.id.split("::")[0]}</div>
                          <div style={{ fontSize: "15px", fontWeight: "bold", color: "var(--ink)", marginBottom: "5px" }}>{item.id.split("::")[1]}</div>
                          <span style={{ fontSize: "11px", background: isAman ? "var(--ok-50)" : "var(--red-50)", color: isAman ? "var(--ok)" : "var(--red-600)", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold" }}>{item.kondisi}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: "15px" }}>
                  <button onClick={() => setShowReview(false)} style={{ flex: 1, padding: "15px", background: "var(--line)", color: "var(--ink-soft)", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}><IconArrowLeft size={14} /> Cek Area Lain</button>
                  <button
                    onClick={handleSubmitFinal}
                    disabled={isLoading || belumLengkapAlasan}
                    style={{ flex: 2, padding: "15px", background: (isLoading || belumLengkapAlasan) ? "#a0aec0" : "var(--red-600)", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: (isLoading || belumLengkapAlasan) ? "not-allowed" : "pointer", boxShadow: "0 4px 6px rgba(220,38,38,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}
                  >
                    {isLoading ? "Mengunggah..." : belumLengkapAlasan ? <><IconAlertTriangle size={14} /> Isi Alasan Dulu</> : <><IconRocket size={15} /> Kunci & Kirim Laporan</>}
                  </button>
                </div>
              </div>
            )}
            {titikTerlewat.length > 0 && (
              <div style={{ background: "var(--warn-50)", border: "1px solid rgba(217,119,6,0.3)", borderRadius: "12px", padding: "20px", marginBottom: "25px" }}>
                <h3 style={{ margin: "0 0 5px 0", color: "var(--warn)", fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}><IconAlertTriangle size={15} /> {titikTerlewat.length} Titik Belum Terpantau</h3>
                <p style={{ margin: "0 0 15px 0", color: "var(--warn)", fontSize: "12px" }}>Wajib isi alasan kenapa titik ini belum sempat difoto sebelum laporan bisa dikirim.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {titikTerlewat.map((t) => (
                    <div key={t.id}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                        {t.id.split("::")[0]} — {t.nama}
                      </label>
                      <input
                        type="text"
                        value={alasanTerlewat[t.id] || ""}
                        onChange={(e) => handleUbahAlasan(t.id, e.target.value)}
                        placeholder="Alasan tidak sempat difoto..."
                        className="missed-input"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: RIWAYAT SAYA (HISTORY VIEW)                        */}
        {/* ========================================================= */}
        {activeTab === "HISTORY" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "25px", animation: "fadeIn 0.3s" }}>
            {riwayatSaya.length > 0 ? riwayatSaya.map((log) => (
              <div key={log.id} className="panel" style={{ padding: "25px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "2px solid var(--bg)", paddingBottom: "15px", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", fontWeight: "bold" }}>Diserahkan Pada:</span>
                    <h3 style={{ margin: "5px 0 0 0", color: "var(--ink)", fontSize: "16px" }}>{formatWaktu(log.waktu_laporan)}</h3>
                  </div>
                  <span style={{ background: log.status.includes("Sempurna") ? "var(--ok-50)" : "var(--red-50)", color: log.status.includes("Sempurna") ? "var(--ok)" : "var(--red-600)", border: log.status.includes("Sempurna") ? "1px solid rgba(22,163,74,0.3)" : "1px solid rgba(220,38,38,0.3)", padding: "8px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold" }}>
                    {log.status}
                  </span>
                </div>

                {log.catatan_shift && (
                  <div style={{ background: "var(--bg)", padding: "15px", borderRadius: "12px", marginBottom: "20px", fontSize: "13px", color: "var(--ink-soft)", border: "1px dashed var(--line)" }}>
                    <strong>Catatan:</strong> <i style={{ color: "var(--muted)" }}>&quot;{log.catatan_shift}&quot;</i>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "15px" }}>
                  {log.titik_patroli.map((t, i) => {
                    const isAman = t.kondisi.includes("Aman");
                    return (
                      <div key={i} style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--line)", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                        <div style={{ position: "relative" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={t.foto} alt="Titik" style={{ width: "100%", height: "200px", objectFit: "cover" }} />
                          <div style={{ position: "absolute", bottom: "8px", right: "8px", background: "rgba(0,0,0,0.7)", color: "white", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold" }}>{t.waktu_patroli}</div>
                        </div>
                        <div style={{ padding: "10px" }}>
                          <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: "bold" }}>{t.id.split("::")[0]}</div>
                          <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "13px", margin: "2px 0 8px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.id.split("::")[1]}</div>
                          <span style={{ fontSize: "10px", background: isAman ? "var(--ok-50)" : "var(--red-50)", color: isAman ? "var(--ok)" : "var(--red-600)", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold" }}>{t.kondisi}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )) : (
              <div style={{ padding: "60px 20px", textAlign: "center", background: "var(--surface)", borderRadius: "20px", border: "2px dashed var(--line)" }}>
                <div style={{ color: "var(--muted)", marginBottom: "15px", display: "flex", justifyContent: "center" }}><IconInboxEmpty size={40} /></div>
                <h3 style={{ color: "var(--ink-soft)", margin: "0 0 10px 0" }}>Belum Ada Riwayat</h3>
                <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0 }}>Catatan patroli keliling Anda akan terekam dan ditampilkan di sini.</p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ======================================= */}
      {/* MODAL SCANNER QR                        */}
      {/* ======================================= */}
      {scanTarget && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.95)", zIndex: 1000, display: "flex", flexDirection: "column", backdropFilter: "blur(5px)" }}>
          <div style={{ padding: "20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontWeight: "bold", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}><IconMapPin size={16} /> Scan Lokasi: {scanTarget.split("::")[1]}</span>
            <button onClick={() => setScanTarget(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: "40px", height: "40px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={16} color="white" /></button>
          </div>
          <div style={{ padding: "20px", background: "#1a202c", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", overflowY: "auto" }}>
            <div style={{ background: "white", padding: "15px", borderRadius: "16px", marginBottom: "20px", width: "100%", maxWidth: "400px" }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "8px", fontSize: "14px", color: "#4a5568" }}>Pilih Kondisi Titik:</label>
              <select value={kondisiTitik} onChange={(e) => setKondisiTitik(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "2px solid #e2e8f0", fontWeight: "bold", color: kondisiTitik === "Aman Terkendali" ? "#38a169" : "#e53e3e", fontSize: "15px", outline: "none" }}>
                <option value="Aman Terkendali">✅ Aman Terkendali</option>
                <option value="Ada Temuan / Mencurigakan">⚠️ Ada Temuan / Mencurigakan</option>
                <option value="Pintu/Jendela Terbuka">🚪 Pintu/Jendela Terbuka</option>
                <option value="Kebocoran Air">💧 Kebocoran Air</option>
              </select>
            </div>
            <div style={{ width: "100%", maxWidth: "400px", background: "white", padding: "10px", borderRadius: "16px", overflow: "hidden", marginBottom: "20px" }}>
              <div id="reader" style={{ width: "100%" }}></div>
            </div>
            <button onClick={() => { const targetNama = scanTarget.split("::")[1]; setScanTarget(null); bukaKamera(scanTarget, targetNama); }} style={{ width: "100%", maxWidth: "400px", padding: "15px", background: "rgba(255,255,255,0.1)", color: "white", border: "1px dashed rgba(255,255,255,0.3)", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}>
              <IconSettings size={14} /> By-pass QR (Simulasi Langsung Foto)
            </button>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* MODAL KAMERA WATERMARK                  */}
      {/* ======================================= */}
      {photoTarget && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000", zIndex: 1100, display: "flex", flexDirection: "column" }}>
          <div style={{ position: "absolute", top: 20, left: 20, right: 20, zIndex: 10, display: "flex", justifyContent: "space-between" }}>
            <div style={{ background: "rgba(0,0,0,0.6)", color: "white", padding: "8px 15px", borderRadius: "20px", backdropFilter: "blur(5px)", fontSize: "12px" }}>
              <div style={{ fontWeight: "bold", fontSize: "14px", color: "#fef08a", display: "flex", alignItems: "center", gap: "6px" }}><IconMapPin size={13} color="#fef08a" /> {photoTarget.nama}</div>
              <div>{currentTime}</div>
            </div>
            <button onClick={matikanKamera} style={{ background: "rgba(255,0,0,0.8)", border: "none", color: "white", width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconX size={16} color="white" /></button>
          </div>
          <div style={{ flex: 1, position: "relative", display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
            <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "120px", background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)", pointerEvents: "none" }}></div>
          </div>
          <div style={{ padding: "30px", display: "flex", justifyContent: "center", background: "#000" }}>
            <button onClick={ambilFotoWatermark} disabled={isUploadingFoto} style={{ width: "80px", height: "80px", borderRadius: "50%", background: isUploadingFoto ? "#a0aec0" : "white", border: "6px solid #e2e8f0", cursor: isUploadingFoto ? "not-allowed" : "pointer", boxShadow: "0 0 15px rgba(255,255,255,0.4)" }}></button>
          </div>
        </div>
      )}

    </div>
  );
}
