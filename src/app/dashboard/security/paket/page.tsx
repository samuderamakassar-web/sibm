"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, doc, updateDoc, Timestamp, getDocs } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { kirimEmail } from "../../../..//lib/notify";
import { buildPaketEmailHtml } from "../../../../lib/emailTemplates";
import { useToast } from "../../../..//components/ui/ToastProvider";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import Input from "../../../../components/ui/Input";
import Select from "../../../../components/ui/Select";
import Textarea from "../../../../components/ui/Textarea";
import Badge from "../../../../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../../../../components/ui/Table";

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
const IconInboxDown = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /><path d="M12 4v6M9.5 8 12 10.5 14.5 8" /></svg>
);
const IconPackage = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></svg>
);
const IconCheckCircle = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
);
const IconCamera = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A1.5 1.5 0 0 1 9.5 3.6h5a1.5 1.5 0 0 1 1.3.8L17 6h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const IconFolder = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>
);
const IconX = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
);
const IconSearch = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconInboxEmpty = ({ size = 30, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);
const IconArrowRight = ({ size = 12, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
);
const IconUserCircle2 = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

interface TipePaket {
  id: string;
  jenis_barang: string;
  penerima: string;
  kurir: string;
  keterangan: string;
  waktu_diterima: Timestamp | null;
  waktu_diambil: Timestamp | null;
  status: "Belum Diambil" | "Sudah Diambil";
  foto_bukti_url: string;
  foto_bukti_ambil_url: string;
  petugas_input: string;
  petugas_ambil: string;
}

interface EmployeeData {
  nama: string;
  departemen: string;
  no_wa?: string;
  email?: string;
}

export default function PaketPage() {
  const router = useRouter();
  const showToast = useToast();

  const [picName, setPicName] = useState("");
  const [waktuSekarang, setWaktuSekarang] = useState("");

  const [jenisBarang, setJenisBarang] = useState("Paket / Barang");
  const [penerima, setPenerima] = useState("");
  const [kurir, setKurir] = useState("");
  const [keterangan, setKeterangan] = useState("");

  const [previewUrl, setPreviewUrl] = useState<string>("");

  const [karyawanDB, setKaryawanDB] = useState<EmployeeData[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [searchTabel, setSearchTabel] = useState("");
  const [daftarPaket, setDaftarPaket] = useState<TipePaket[]>([]);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraMode, setCameraMode] = useState<"input" | "serahkan">("input");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 💡 STATE SERAH TERIMA — modal foto bukti saat paket diserahkan ke penerima
  const [serahkanTarget, setSerahkanTarget] = useState<TipePaket | null>(null);
  const [fotoSerahTerima, setFotoSerahTerima] = useState<string>("");
  const [isSavingSerah, setIsSavingSerah] = useState(false);

  // 💡 STATE DETAIL — modal riwayat lengkap 1 paket (kapan tiba, diinput siapa, diambil siapa, foto before/after)
  const [detailTarget, setDetailTarget] = useState<TipePaket | null>(null);

  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) {
      router.push("/");
      return;
    }

    setTimeout(() => setPicName(nama), 0);

    const timer = setInterval(() => {
      setWaktuSekarang(new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" }));
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    const q = query(collection(db, "packages"), orderBy("waktu_diterima", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const paketArr: TipePaket[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        paketArr.push({
          id: docSnap.id,
          jenis_barang: data.jenis_barang,
          penerima: data.penerima,
          kurir: data.kurir,
          keterangan: data.keterangan,
          waktu_diterima: data.waktu_diterima,
          waktu_diambil: data.waktu_diambil,
          status: data.status,
          foto_bukti_url: data.foto_bukti_url || "",
          foto_bukti_ambil_url: data.foto_bukti_ambil_url || "",
          petugas_input: data.petugas_input || "-",
          petugas_ambil: data.petugas_ambil || "-",
        });
      });
      setDaftarPaket(paketArr);
    });

    const fetchKaryawan = async () => {
      try {
        const empRef = collection(db, "employees_directory");
        const empSnap = await getDocs(empRef);
        const empList: EmployeeData[] = [];
        empSnap.forEach((doc) => {
          empList.push({ nama: doc.data().nama, departemen: doc.data().departemen, no_wa: doc.data().no_wa, email: doc.data().email });
        });
        setKaryawanDB(empList);
      } catch (error) {
        console.error("Gagal memuat karyawan:", error);
      }
    };
    fetchKaryawan();

    return () => unsubscribe();
  }, []);

  const paketTerfilter = daftarPaket.filter(
    (pkt) => pkt.penerima.toLowerCase().includes(searchTabel.toLowerCase()) || pkt.kurir.toLowerCase().includes(searchTabel.toLowerCase())
  );

  const filteredKaryawan = karyawanDB.filter((emp) => emp.nama.toLowerCase().includes(penerima.toLowerCase()));

  const pilihKaryawan = (emp: EmployeeData) => {
    setPenerima(emp.nama);
    setShowDropdown(false);
  };

  const startCamera = async (mode: "input" | "serahkan" = "input") => {
    setCameraMode(mode);
    if (mode === "input") setPreviewUrl(""); else setFotoSerahTerima("");
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Gagal mengakses kamera:", err);
      showToast("Gagal mengakses kamera. Pastikan Anda memberikan izin.", "error");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach((track) => track.stop());
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      const MAX_WIDTH = 500;
      const scaleSize = MAX_WIDTH / video.videoWidth;
      canvas.width = MAX_WIDTH;
      canvas.height = video.videoHeight * scaleSize;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 0.6);
        if (cameraMode === "input") setPreviewUrl(base64); else setFotoSerahTerima(base64);
        stopCamera();
      }
    }
  };

  const resizeFileToBase64 = (file: File, onDone: (base64: string) => void) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 500;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          onDone(canvas.toDataURL("image/jpeg", 0.6));
        }
      };
      if (typeof ev.target?.result === "string") img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) resizeFileToBase64(file, setPreviewUrl);
  };

  const handleFileChangeSerah = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) resizeFileToBase64(file, setFotoSerahTerima);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);

    try {
      const waktuKirim = new Date(); // serverTimestamp() belum resolve saat itu juga -- pakai jam lokal untuk isi notif/email
      await addDoc(collection(db, "packages"), {
        jenis_barang: jenisBarang,
        penerima: penerima,
        kurir: kurir,
        keterangan: keterangan,
        waktu_diterima: serverTimestamp(),
        waktu_diambil: null,
        status: "Belum Diambil",
        foto_bukti_url: previewUrl,
        foto_bukti_ambil_url: "",
        petugas_input: picName,
        petugas_ambil: "",
      });

      await kirimNotifikasiPaketDiterima(penerima, jenisBarang, kurir, keterangan, waktuKirim, previewUrl);

      setPenerima("");
      setKurir("");
      setKeterangan("");
      setPreviewUrl("");
      setIsSuccess(true);

      setTimeout(() => setIsSuccess(false), 4000);
    } catch (error) {
      console.error("Error:", error);
      showToast("Gagal menyimpan data log paket.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // 💡 SERAH TERIMA — ganti confirm() polos jadi modal + wajib foto bukti, biar gak ada kesalahpahaman siapa yang ambil
  const bukaSerahkan = (pkt: TipePaket) => {
    setSerahkanTarget(pkt);
    setFotoSerahTerima("");
  };

  const handleSubmitSerahkan = async () => {
    if (!serahkanTarget) return;
    if (!fotoSerahTerima) {
      return showToast("Foto bukti serah terima wajib diambil dulu.", "warning");
    }
    setIsSavingSerah(true);
    try {
      await updateDoc(doc(db, "packages", serahkanTarget.id), {
        waktu_diambil: serverTimestamp(),
        status: "Sudah Diambil",
        foto_bukti_ambil_url: fotoSerahTerima,
        petugas_ambil: picName,
      });
      showToast(`Paket berhasil diserahkan ke ${serahkanTarget.penerima}.`, "success");
      setSerahkanTarget(null);
      setFotoSerahTerima("");
    } catch (error) {
      console.error("Gagal update:", error);
      showToast("Gagal memperbarui status paket.", "error");
    } finally {
      setIsSavingSerah(false);
    }
  };

  const cariKontakKaryawan = (nama: string): EmployeeData | undefined => {
    const namaNormal = nama.trim().toLowerCase();
    return karyawanDB.find((k) => (k.nama || "").trim().toLowerCase() === namaNormal);
  };

  const kirimNotifikasiPaketDiterima = async (
    namaPenerima: string,
    jenis: string,
    kurirPengirim: string,
    ket: string,
    waktuKirim: Date,
    fotoUrl: string
  ) => {
    const kontak = cariKontakKaryawan(namaPenerima);

    if (!kontak || !kontak.email) {
      console.warn(`[notify] Kontak untuk "${namaPenerima}" tidak ditemukan / belum punya email di Master Data Karyawan. Notifikasi paket dilewati.`);
      return;
    }

    const htmlEmail = buildPaketEmailHtml({
      namaPenerima,
      namaPetugas: picName,
      tanggal: waktuKirim.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }),
      jam: waktuKirim.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      jenisBarang: jenis,
      keterangan: ket,
      kurir: kurirPengirim,
      fotoUrl: fotoUrl || undefined,
    });
    const hasilEmail = await kirimEmail(kontak.email, "Notifikasi Paket Masuk", htmlEmail, namaPenerima);
    if (!hasilEmail.sukses) console.error("[notify] Gagal kirim Email paket:", hasilEmail.pesanError);
  };

  const formatWaktu = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

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

        .panel-title { margin-top: 0; color: var(--ink); border-bottom: 2px solid var(--bg); padding-bottom: 12px; display: flex; align-items: center; gap: 10px; font-size: 17px; }
        .panel-title-icon { background: var(--red-50); color: var(--red-600); padding: 8px; border-radius: 12px; display: flex; }

        .autocomplete-list { position: absolute; top: 100%; left: 0; right: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; margin-top: 5px; z-index: 50; max-height: 200px; overflow-y: auto; box-shadow: 0 10px 15px rgba(0,0,0,0.1); }
        .autocomplete-item { padding: 12px; border-bottom: 1px solid var(--bg); cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: 0.15s; }
        .autocomplete-item:hover { background: var(--bg); }

        .foto-box { background: var(--bg); padding: 22px 18px; border-radius: 16px; border: 2px dashed var(--line); text-align: center; }
        .foto-pick-btn { padding: 12px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: bold; color: var(--ink-soft); display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: 0.2s; }
        .foto-pick-btn:hover { border-color: var(--red-600); color: var(--red-600); }

        .table-search { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--line); border-radius: 20px; padding: 0 15px; width: 250px; }
        .table-search input { border: none; outline: none; background: transparent; padding: 12px 0; font-size: 14px; flex: 1; font-family: inherit; }
        .before-after-thumb { display: flex; align-items: center; flex-shrink: 0; }

        @media (max-width: 900px) {
          .paket-layout { flex-direction: column !important; }
          .paket-layout > * { flex: 1 1 auto !important; width: 100% !important; }
        }
        @media (max-width: 640px) {
          .table-search { width: 100% !important; }
          .paket-header-row { flex-direction: column; align-items: stretch !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="back-btn" onClick={() => router.push("/dashboard/security")}><IconArrowLeft size={16} /></button>
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Manajemen Paket</span>
        </div>
        <div className="pic-badge"><IconUserCircle size={14} /> {picName}</div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="page-hero">
        <div className="page-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>MANAJEMEN PAKET MASUK</h1>
          <p style={{ margin: "0 0 15px 0", fontSize: "13px", opacity: 0.9 }}>Pencatatan resi kurir, surat, dan paket karyawan SIBM</p>
          <div className="page-hero-badge">
            <IconClock size={14} /> {waktuSekarang || "Memuat waktu..."}
          </div>
        </div>
      </div>

      <div className="paket-layout" style={{ maxWidth: "1200px", margin: "-20px auto 0", padding: "0 20px", position: "relative", zIndex: 10, display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <Card style={{ flex: "1 1 350px" }}>
          <h3 className="panel-title">
            <span className="panel-title-icon"><IconInboxDown size={18} /></span> Input Penerimaan
          </h3>

          {isSuccess && (
            <div style={{ background: "var(--ok-50)", color: "var(--ok)", padding: "12px", borderRadius: "12px", marginTop: "20px", fontSize: "13px", fontWeight: "bold", border: "1px solid rgba(22,163,74,0.25)", display: "flex", alignItems: "center", gap: "8px" }}>
              <IconCheckCircle size={16} /> Paket berhasil dicatat ke sistem!
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "20px" }}>
            <Select label="Jenis Titipan:" value={jenisBarang} onChange={(e) => setJenisBarang(e.target.value)}>
              <option value="Paket / Barang">Paket / Barang</option>
              <option value="Dokumen / Surat">Dokumen / Surat</option>
              <option value="Makanan / Minuman">Makanan / Minuman</option>
            </Select>

            <div style={{ position: "relative" }}>
              <Input
                label="Karyawan Penerima *"
                placeholder="Ketik nama karyawan..."
                value={penerima}
                onChange={(e) => {
                  setPenerima(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                required
                style={{ border: "2px solid var(--info)", background: "var(--info-50)", color: "var(--info)", fontWeight: "bold" }}
              />

              {showDropdown && penerima && (
                <div className="autocomplete-list">
                  {filteredKaryawan.length > 0 ? (
                    filteredKaryawan.map((emp, idx) => (
                      <div key={idx} onClick={() => pilihKaryawan(emp)} className="autocomplete-item">
                        <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "13px" }}>{emp.nama}</span>
                        <span style={{ fontSize: "11px", color: "var(--muted)", background: "var(--bg)", padding: "2px 8px", borderRadius: "8px" }}>{emp.departemen}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: "12px", color: "var(--muted)", textAlign: "center", fontSize: "12px" }}>Nama tidak ditemukan.</div>
                  )}
                </div>
              )}
            </div>

            <Input label="Nama Kurir / Ekspedisi *" placeholder="Cth: JNE, GoSend, SiCepat..." value={kurir} onChange={(e) => setKurir(e.target.value)} required />

            <div className="foto-box">
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "12px", fontSize: "13px", color: "var(--ink-soft)" }}>Bukti Fisik Paket</label>

              {previewUrl ? (
                <div style={{ position: "relative", display: "inline-block" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Preview" style={{ height: "150px", borderRadius: "10px", border: "1px solid var(--line)", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} />
                  <button type="button" onClick={() => setPreviewUrl("")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "var(--red-600)", color: "white", border: "none", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}><IconX size={12} color="white" /></button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: "none" }} id="fileInput" />
                  <label htmlFor="fileInput" className="foto-pick-btn">
                    <IconFolder size={16} /> Galeri
                  </label>
                  <button type="button" onClick={() => startCamera("input")} className="foto-pick-btn">
                    <IconCamera size={16} /> Kamera
                  </button>
                </div>
              )}
            </div>

            <Textarea label="Keterangan Tambahan / No. Resi" placeholder="Opsional..." value={keterangan} onChange={(e) => setKeterangan(e.target.value)} style={{ height: "80px" }} />

            <Button type="submit" loading={isLoading} loadingText="Menyimpan & Mengirim Notifikasi..." style={{ marginTop: "10px" }}>
              Simpan Log Paket
            </Button>
          </form>
        </Card>

        <Card style={{ flex: "2 1 500px" }}>
          <div className="paket-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <IconPackage size={18} color="var(--muted)" /> Riwayat Paket
            </h3>
            <div className="table-search">
              <IconSearch size={14} color="var(--muted)" />
              <input
                type="text"
                placeholder="Cari penerima / kurir..."
                value={searchTabel}
                onChange={(e) => setSearchTabel(e.target.value)}
              />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <Table>
              <THead>
                <Tr>
                  <Th>Barang</Th>
                  <Th>Penerima</Th>
                  <Th>Kurir</Th>
                  <Th>Tiba</Th>
                  <Th style={{ textAlign: "center" }}>Status</Th>
                </Tr>
              </THead>
              <TBody>
                {paketTerfilter.length === 0 ? (
                  <Tr>
                    <Td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "40px 20px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                        <IconInboxEmpty size={30} color="var(--muted)" />
                        Belum ada pergerakan paket.
                      </div>
                    </Td>
                  </Tr>
                ) : (
                  paketTerfilter.map((pkt) => (
                    <Tr key={pkt.id} onClick={() => setDetailTarget(pkt)} style={{ background: pkt.status === "Sudah Diambil" ? "var(--bg)" : "var(--surface)" }}>
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div className="before-after-thumb">
                            {pkt.foto_bukti_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={pkt.foto_bukti_url} alt="Sebelum" title="Foto saat diterima" style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "6px", border: "1px solid var(--line)" }} />
                            ) : (
                              <div style={{ width: "32px", height: "32px", background: "var(--bg)", borderRadius: "6px", display: "flex", justifyContent: "center", alignItems: "center", color: "var(--muted)" }}><IconPackage size={14} /></div>
                            )}
                            {pkt.foto_bukti_ambil_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={pkt.foto_bukti_ambil_url} alt="Sesudah" title="Foto saat diambil" style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "6px", border: "2px solid var(--ok)", marginLeft: "-10px" }} />
                            ) : null}
                          </div>
                          <span style={{ fontWeight: "bold", color: "var(--ink-soft)" }}>{pkt.jenis_barang}</span>
                        </div>
                      </Td>
                      <Td style={{ color: "var(--info)", fontWeight: "900" }}>{pkt.penerima}</Td>
                      <Td style={{ color: "var(--muted)" }}>{pkt.kurir}</Td>
                      <Td style={{ color: "var(--ink-soft)" }}>{formatWaktu(pkt.waktu_diterima)}</Td>
                      <Td style={{ textAlign: "center" }}>
                        {pkt.status === "Belum Diambil" ? (
                          <Button fullWidth={false} variant="warning" style={{ padding: "8px 14px", fontSize: "11px" }} onClick={(e) => { e.stopPropagation(); bukaSerahkan(pkt); }}>
                            Serahkan ➔
                          </Button>
                        ) : (
                          <div>
                            <Badge tone="success">✓ DIAMBIL</Badge>
                            <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "6px", fontWeight: "bold" }}>{formatWaktu(pkt.waktu_diambil)}</div>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>

      {isCameraActive && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.95)", zIndex: 100, display: "flex", flexDirection: "column", backdropFilter: "blur(10px)" }}>
          <div style={{ padding: "20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontWeight: "bold", fontSize: "16px", display: "flex", alignItems: "center", gap: "10px" }}><IconCamera size={18} /> {cameraMode === "serahkan" ? "Foto Bukti Serah Terima" : "Foto Fisik Paket"}</span>
            <button onClick={stopCamera} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: "40px", height: "40px", borderRadius: "50%", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center" }}><IconX size={18} color="white" /></button>
          </div>

          <div style={{ flex: 1, position: "relative", display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
            <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80%", maxWidth: "400px", height: "60%", border: "3px dashed rgba(255,255,255,0.7)", borderRadius: "16px", boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}></div>
          </div>

          <div style={{ padding: "40px", display: "flex", justifyContent: "center", background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)" }}>
            <button onClick={capturePhoto} style={{ width: "80px", height: "80px", borderRadius: "50%", background: "white", border: "6px solid rgba(255,255,255,0.3)", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.5)" }}></button>
          </div>
        </div>
      )}

      {/* 🔹 MODAL SERAH TERIMA — wajib foto bukti sebelum status berubah jadi "Sudah Diambil" */}
      {serahkanTarget && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "15px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "420px", borderRadius: "24px", padding: "25px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", boxSizing: "border-box" }}>
            <button onClick={() => setSerahkanTarget(null)} style={{ position: "absolute", top: "15px", right: "15px", background: "#edf2f7", border: "none", width: "36px", height: "36px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={16} /></button>

            <h2 style={{ margin: "0 0 4px 0", color: "#1a202c", fontSize: "18px", fontWeight: 800, paddingRight: "30px" }}>Serah Terima Paket</h2>
            <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>
              Konfirmasi <b>{serahkanTarget.jenis_barang}</b> ({serahkanTarget.kurir}) diserahkan kepada <b style={{ color: "var(--info)" }}>{serahkanTarget.penerima}</b>.
            </p>

            <div className="foto-box" style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "12px", fontSize: "13px", color: "var(--ink-soft)" }}>Wajib Foto Bukti Serah Terima *</label>

              {fotoSerahTerima ? (
                <div style={{ position: "relative", display: "inline-block" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoSerahTerima} alt="Preview" style={{ height: "150px", borderRadius: "10px", border: "1px solid var(--line)", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} />
                  <button type="button" onClick={() => setFotoSerahTerima("")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "var(--red-600)", color: "white", border: "none", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}><IconX size={12} color="white" /></button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <input type="file" accept="image/*" capture="environment" onChange={handleFileChangeSerah} style={{ display: "none" }} id="fileInputSerah" />
                  <label htmlFor="fileInputSerah" className="foto-pick-btn">
                    <IconFolder size={16} /> Galeri
                  </label>
                  <button type="button" onClick={() => startCamera("serahkan")} className="foto-pick-btn">
                    <IconCamera size={16} /> Kamera
                  </button>
                </div>
              )}
            </div>

            <Button loading={isSavingSerah} loadingText="Menyimpan..." disabled={!fotoSerahTerima} onClick={handleSubmitSerahkan}>
              Konfirmasi Serah Terima
            </Button>
          </div>
        </div>
      )}

      {/* 🔹 MODAL DETAIL PAKET — riwayat lengkap: kapan tiba, diinput siapa, diambil siapa, foto before/after */}
      {detailTarget && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "15px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "480px", borderRadius: "24px", padding: "25px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box" }}>
            <button onClick={() => setDetailTarget(null)} style={{ position: "absolute", top: "15px", right: "15px", background: "#edf2f7", border: "none", width: "36px", height: "36px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}><IconX size={16} /></button>

            <h2 style={{ margin: "0 0 4px 0", color: "#1a202c", fontSize: "18px", fontWeight: 800, paddingRight: "30px", display: "flex", alignItems: "center", gap: "8px" }}>
              <IconPackage size={18} color="var(--red-600)" /> {detailTarget.jenis_barang}
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>
              Kurir/Ekspedisi: <b>{detailTarget.kurir}</b>{detailTarget.keterangan ? ` · ${detailTarget.keterangan}` : ""}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div style={{ background: "var(--bg)", borderRadius: "14px", padding: "14px", border: "1px solid var(--line)" }}>
                <div style={{ fontSize: "10px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>Diterima (Masuk)</div>
                {detailTarget.foto_bukti_url ? (
                  <a href={detailTarget.foto_bukti_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detailTarget.foto_bukti_url} alt="Foto diterima" style={{ width: "100%", height: "110px", objectFit: "cover", borderRadius: "10px", border: "1px solid var(--line)", marginBottom: "10px" }} />
                  </a>
                ) : (
                  <div style={{ width: "100%", height: "110px", background: "var(--surface)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", marginBottom: "10px" }}><IconPackage size={22} /></div>
                )}
                <div style={{ fontSize: "12px", color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}><IconClock size={12} color="var(--muted)" /> {formatWaktu(detailTarget.waktu_diterima)}</div>
                <div style={{ fontSize: "12px", color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: "5px" }}><IconUserCircle2 size={12} color="var(--muted)" /> Diinput: <b>{detailTarget.petugas_input}</b></div>
              </div>

              <div style={{ background: detailTarget.status === "Sudah Diambil" ? "var(--ok-50)" : "var(--bg)", borderRadius: "14px", padding: "14px", border: "1px solid " + (detailTarget.status === "Sudah Diambil" ? "rgba(22,163,74,0.25)" : "var(--line)") }}>
                <div style={{ fontSize: "10px", fontWeight: 800, color: detailTarget.status === "Sudah Diambil" ? "var(--ok)" : "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>Diambil (Keluar)</div>
                {detailTarget.status === "Sudah Diambil" ? (
                  <>
                    {detailTarget.foto_bukti_ambil_url ? (
                      <a href={detailTarget.foto_bukti_ambil_url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={detailTarget.foto_bukti_ambil_url} alt="Foto diambil" style={{ width: "100%", height: "110px", objectFit: "cover", borderRadius: "10px", border: "1px solid rgba(22,163,74,0.3)", marginBottom: "10px" }} />
                      </a>
                    ) : (
                      <div style={{ width: "100%", height: "110px", background: "var(--surface)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", marginBottom: "10px" }}><IconPackage size={22} /></div>
                    )}
                    <div style={{ fontSize: "12px", color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}><IconClock size={12} color="var(--muted)" /> {formatWaktu(detailTarget.waktu_diambil)}</div>
                    <div style={{ fontSize: "12px", color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}><IconUserCircle2 size={12} color="var(--muted)" /> Diserahkan oleh: <b>{detailTarget.petugas_ambil}</b></div>
                    <div style={{ fontSize: "12px", color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: "5px" }}><IconArrowRight size={12} color="var(--ok)" /> Penerima: <b style={{ color: "var(--info)" }}>{detailTarget.penerima}</b></div>
                  </>
                ) : (
                  <div style={{ padding: "30px 0", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                    Belum diambil.<br />Ditujukan untuk <b>{detailTarget.penerima}</b>
                  </div>
                )}
              </div>
            </div>

            {detailTarget.status === "Belum Diambil" && (
              <Button variant="warning" onClick={() => { setDetailTarget(null); bukaSerahkan(detailTarget); }}>
                Serahkan Sekarang ➔
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
