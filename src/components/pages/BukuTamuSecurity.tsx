"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { collection, addDoc, serverTimestamp, updateDoc, doc, setDoc, onSnapshot, query, orderBy, where, limit, Timestamp, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useToast } from "../ui/ToastProvider";
import { useConfirm } from "../ui/ConfirmProvider";
import Modal from "../ui/Modal";
import { DAFTAR_UNIT_BISNIS, DAFTAR_DEPARTEMEN_INTERNAL } from "../../lib/unitBisnis";
import { normalizePlat } from "../../lib/platUtils";

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
const IconEdit = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);
const IconUsers = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8.5" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.7-5.8 6-5.8s6 2.4 6 5.8" /><path d="M16 8.2a3 3 0 1 1 0-6" /><path d="M15 14.5c2.8.4 4.8 2.5 4.8 5.5" /></svg>
);
const IconHistory = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l4 2" /></svg>
);
const IconDownload = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></svg>
);
const IconBriefcase = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" /></svg>
);
const IconBuilding = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" /></svg>
);
const IconGraduationCap = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m2 9 10-5 10 5-10 5-10-5z" /><path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5" /><path d="M22 9v6" /></svg>
);
const IconCamera = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A1.5 1.5 0 0 1 9.5 3.6h5a1.5 1.5 0 0 1 1.3.8L17 6h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const IconX = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
);
const IconCheck = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const IconCar = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14" /><path d="M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M23 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M3 17v-4l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v4" /><path d="M3 13h18" /></svg>
);
const IconHandshake = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m11 13-2.5 2.5a1.7 1.7 0 0 1-2.4-2.4L9 10" /><path d="m14 10 2 2" /><path d="M9 10 12.5 6.5a2 2 0 0 1 2.8 0L18 9" /><path d="m6 11-3 3 3 3" /><path d="m18 9 3 3-3 3" /></svg>
);
const IconSearch = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
const IconShieldCheck = ({ size = 30, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-0.6 8-4 8-9V6z" /><path d="m9.5 12 1.8 1.8L15 10" /></svg>
);
const IconScroll = ({ size = 30, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21a2 2 0 0 1-2-2V6a2 2 0 0 0-4 0v1h4" /><path d="M8 21h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H8" /><path d="M12 8h4M12 12h4" /></svg>
);
const IconAlertTriangle = ({ size = 26, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 4.5 2.9 18a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.5 4.5a2 2 0 0 0-3 0z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
const IconFilter = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6 8v6l-4-2v-4z" /></svg>
);

type JenisPengunjung = "Tamu Eksternal" | "Magang" | "Karyawan";
type KategoriEksternal = "Tamu Eksternal" | "Magang";

interface VisitorLog {
  id: string;
  jenis: JenisPengunjung;
  nama: string;
  instansi_dept: string;
  tujuan: string;
  bertemu_dengan: string;
  no_kendaraan: string;
  foto_bukti: string | null;
  status: "Di Dalam Area" | "Selesai / Keluar";
  waktu_masuk: Timestamp | null;
  waktu_keluar: Timestamp | null;
  pic_bertugas: string;
}

interface EmployeeData {
  nama: string;
  departemen: string;
  plat_kendaraan?: string;
}

interface MagangData {
  nama: string;
  instansi: string;
}

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const jenisBadgeColor = (j: JenisPengunjung) => {
  if (j === "Karyawan") return { bg: "var(--info-50)", color: "var(--info)" };
  if (j === "Magang") return { bg: "#f5f3ff", color: "var(--accent)" };
  return { bg: "var(--red-50)", color: "var(--red-600)" };
};

const slugifyNama = (nama: string) => nama.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function BukuTamuSecurity() {
  const router = useRouter();
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);
  const showToast = useToast();
  const confirm = useConfirm();

  const [picName, setPicName] = useState("");
  const [activeTab, setActiveTab] = useState<"input" | "aktif" | "riwayat">("input");
  const [visitorLogs, setVisitorLogs] = useState<VisitorLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showInvalidKaryawanModal, setShowInvalidKaryawanModal] = useState(false);

  // State Pencarian Tabel
  const [searchNamaTamu, setSearchNamaTamu] = useState("");
  const [searchTanggalTamu, setSearchTanggalTamu] = useState("");

  // State Filter Khusus Tab Riwayat
  const [filterJenisRiwayat, setFilterJenisRiwayat] = useState<"Semua" | JenisPengunjung>("Semua");
  const [filterBulanRiwayat, setFilterBulanRiwayat] = useState<string>("Semua");
  const [filterTahunRiwayat, setFilterTahunRiwayat] = useState<string>("Semua");
  const [filterPTRiwayat, setFilterPTRiwayat] = useState<string>("Semua");

  // State untuk Autocomplete Karyawan
  const [karyawanDB, setKaryawanDB] = useState<EmployeeData[]>([]);
  const [searchKaryawan, setSearchKaryawan] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // State untuk Autocomplete Magang (riwayat nama & PT biar gak salah tulis lagi)
  const [magangDB, setMagangDB] = useState<MagangData[]>([]);
  const [searchMagang, setSearchMagang] = useState("");

  // 💡 Master kendaraan (buat sinkronisasi otomatis: Karyawan check-in dengan kendaraan -> Standby)
  const [kendaraanDB, setKendaraanDB] = useState<{ id: string; kendaraan: string; plat_nomor: string }[]>([]);

  // State Form & Kamera
  const [jenisPengunjung, setJenisPengunjung] = useState<"Tamu Eksternal" | "Karyawan">("Tamu Eksternal");
  const [kategoriEksternal, setKategoriEksternal] = useState<KategoriEksternal>("Tamu Eksternal");
  const [formData, setFormData] = useState({
    nama: "",
    instansi_dept: "",
    tujuan: "",
    bertemu_dengan: "",
    no_kendaraan: ""
  });
  const [fotoBukti, setFotoBukti] = useState<string | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const resetFormLengkap = () => {
    setFormData({ nama: "", instansi_dept: "", tujuan: "", bertemu_dengan: "", no_kendaraan: "" });
    setSearchKaryawan("");
    setSearchMagang("");
    setKategoriEksternal("Tamu Eksternal");
    setFotoBukti(null);
    setShowDropdown(false);
  };

  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) {
      router.push("/dashboard/security");
      return;
    }
    setTimeout(() => setPicName(nama), 0);

    const logsRef = collection(db, "security_visitor_logs");
    const q = query(logsRef, orderBy("waktu_masuk", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: VisitorLog[] = [];
      snapshot.forEach(docSnap => {
        logs.push({ ...docSnap.data(), id: docSnap.id } as VisitorLog);
      });
      setVisitorLogs(logs);
    });

    const fetchKaryawan = async () => {
      try {
        const empRef = collection(db, "employees_directory");
        const empSnap = await getDocs(empRef);
        const empList: EmployeeData[] = [];
        empSnap.forEach(doc => {
          const d = doc.data();
          empList.push({
            nama: d.nama || "",
            departemen: d.departemen || "Umum",
            plat_kendaraan: d.plat_kendaraan || ""
          });
        });
        setKaryawanDB(empList);
      } catch (error) {
        console.error("Gagal memuat data karyawan:", error);
      }
    };
    fetchKaryawan();

    const fetchMagang = async () => {
      try {
        const magRef = collection(db, "security_magang_directory");
        const magSnap = await getDocs(magRef);
        const magList: MagangData[] = [];
        magSnap.forEach(doc => {
          const d = doc.data();
          magList.push({ nama: d.nama || "", instansi: d.instansi_dept || "" });
        });
        setMagangDB(magList);
      } catch (error) {
        console.error("Gagal memuat riwayat nama magang:", error);
      }
    };
    fetchMagang();

    const unsubKendaraan = onSnapshot(collection(db, "master_kendaraan"), (snap) => {
      setKendaraanDB(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, kendaraan: data.kendaraan || "", plat_nomor: data.plat_nomor || "" };
      }));
    });

    return () => {
      unsubscribe();
      unsubKendaraan();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [router]);

  // 💡 SINKRON OTOMATIS: karyawan check-in yang PUNYA kendaraan terdaftar (plat_kendaraan di
  // Master Data Karyawan cocok dengan plat di Master Data Kendaraan) -> kendaraannya otomatis
  // tercatat "Tiba di Kantor (Standby)" di Log Operasional Gerbang. Karyawan tanpa jatah kendaraan
  // (plat kosong) tidak memicu apa-apa. Kalau kendaraan sudah Standby, tidak dobel-catat.
  const syncKendaraanStandby = async (namaKaryawan: string, platKaryawan: string) => {
    const platNorm = normalizePlat(platKaryawan);
    if (!platNorm) return;
    const kendaraanCocok = kendaraanDB.find((k) => normalizePlat(k.plat_nomor) === platNorm);
    if (!kendaraanCocok) return;

    try {
      const qLog = query(
        collection(db, "operational_vehicle_logs"),
        where("kendaraan", "==", kendaraanCocok.kendaraan),
        orderBy("waktu_catat", "desc"),
        limit(1)
      );
      const snapLog = await getDocs(qLog);
      const statusTerkini = snapLog.empty ? "" : (snapLog.docs[0].data().status_kendaraan || "");
      if (statusTerkini === "Tiba di Kantor (Standby)") return;

      await addDoc(collection(db, "operational_vehicle_logs"), {
        petugas_security: `${picName} (Auto-Sync Buku Tamu)`,
        waktu_catat: serverTimestamp(),
        kendaraan: kendaraanCocok.kendaraan,
        status_kendaraan: "Tiba di Kantor (Standby)",
        driver_bertugas: namaKaryawan,
        tujuan_keperluan: "-",
        kilometer_kendaraan: "Tidak dicatat",
      });
    } catch (error) {
      console.error("Gagal sinkron status kendaraan otomatis:", error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const pilihKaryawan = (emp: EmployeeData) => {
    setSearchKaryawan(emp.nama);
    setFormData({
      ...formData,
      nama: emp.nama,
      instansi_dept: emp.departemen,
      no_kendaraan: emp.plat_kendaraan || ""
    });
    setShowDropdown(false);
  };

  const pilihMagang = (mag: MagangData) => {
    setSearchMagang(mag.nama);
    setFormData({ ...formData, instansi_dept: mag.instansi });
    setShowDropdown(false);
  };

  const bukaKamera = async () => {
    setIsCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error(error);
      showToast("Gagal mengakses kamera. Pastikan izin kamera telah diberikan.", "error");
      setIsCameraOpen(false);
    }
  };

  const matikanKamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  async function uploadToCloudinary(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
    formData.append("folder", "sibm/buku-tamu");

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
    const data = await res.json();
    return data.secure_url as string;
  }

  const ambilFoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const MAX_WIDTH = 600;
    const scale = MAX_WIDTH / video.videoWidth;
    canvas.width = MAX_WIDTH;
    canvas.height = video.videoHeight * scale;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    matikanKamera();

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setIsUploadingFoto(true);
      try {
        const url = await uploadToCloudinary(blob);
        setFotoBukti(url);
      } catch (err) {
        console.error(err);
        showToast("Gagal upload foto, coba lagi.", "error");
      } finally {
        setIsUploadingFoto(false);
      }
    }, "image/jpeg", 0.7);
  };

  const hapusFoto = () => setFotoBukti(null);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();

    // 💡 VALIDASI KARYAWAN — nama wajib cocok dengan Master Data Karyawan, gak boleh ngasal ketik
    if (jenisPengunjung === "Karyawan") {
      const namaCocok = karyawanDB.some(emp => emp.nama.trim().toLowerCase() === searchKaryawan.trim().toLowerCase());
      if (!namaCocok) {
        setShowInvalidKaryawanModal(true);
        return;
      }
    }

    if (jenisPengunjung === "Tamu Eksternal" && isUploadingFoto) {
      return showToast("Tunggu foto selesai diunggah dulu.", "warning");
    }
    setIsLoading(true);

    const jenisFinal: JenisPengunjung = jenisPengunjung === "Karyawan" ? "Karyawan" : kategoriEksternal;
    const namaFinal = jenisPengunjung === "Karyawan" ? searchKaryawan : (kategoriEksternal === "Magang" ? searchMagang : formData.nama);

    try {
      await addDoc(collection(db, "security_visitor_logs"), {
        nama: namaFinal,
        instansi_dept: formData.instansi_dept,
        no_kendaraan: jenisPengunjung === "Karyawan" ? formData.no_kendaraan : "",
        tujuan: jenisFinal === "Karyawan" ? "Bekerja / Operasional" : jenisFinal === "Magang" ? "Magang Kerja" : formData.tujuan,
        bertemu_dengan: jenisFinal === "Tamu Eksternal" ? formData.bertemu_dengan : "-",
        jenis: jenisFinal,
        foto_bukti: jenisPengunjung === "Karyawan" ? null : fotoBukti,
        status: "Di Dalam Area",
        waktu_masuk: serverTimestamp(),
        waktu_keluar: null,
        pic_bertugas: picName
      });

      // 💡 SINKRON OTOMATIS KE KENDARAAN — hanya berlaku kalau karyawan ini punya jatah kendaraan
      if (jenisFinal === "Karyawan") {
        await syncKendaraanStandby(namaFinal, formData.no_kendaraan);
      }

      // 💡 SIMPAN/PERBARUI RIWAYAT NAMA MAGANG — biar nama & PT auto-lengkap di kunjungan berikutnya
      if (jenisFinal === "Magang") {
        const slug = slugifyNama(namaFinal);
        if (slug) {
          await setDoc(doc(db, "security_magang_directory", slug), {
            nama: namaFinal.trim(),
            instansi_dept: formData.instansi_dept,
            updated_at: serverTimestamp()
          }, { merge: true });

          setMagangDB(prev => {
            const sudahAda = prev.some(m => m.nama.trim().toLowerCase() === namaFinal.trim().toLowerCase());
            return sudahAda
              ? prev.map(m => m.nama.trim().toLowerCase() === namaFinal.trim().toLowerCase() ? { nama: namaFinal.trim(), instansi: formData.instansi_dept } : m)
              : [...prev, { nama: namaFinal.trim(), instansi: formData.instansi_dept }];
          });
        }
      }

      showToast(`${jenisFinal} berhasil didaftarkan (Check-In)!`, "success");
      resetFormLengkap();
      setActiveTab("aktif");
    } catch (error) {
      console.error("Gagal Check-In:", error);
      showToast("Terjadi kesalahan sistem.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckOut = async (id: string, namaPengunjung: string) => {
    const yakin = await confirm({
      title: "Konfirmasi Check-Out",
      message: `Apakah ${namaPengunjung} sudah meninggalkan area SIBM?`,
      confirmText: "Ya, Check-Out",
      variant: "danger"
    });
    if (!yakin) return;

    try {
      await updateDoc(doc(db, "security_visitor_logs", id), {
        status: "Selesai / Keluar",
        waktu_keluar: serverTimestamp()
      });
      showToast(`${namaPengunjung} berhasil di-check-out.`, "success");
    } catch (error) {
      console.error("Gagal Check-Out:", error);
      showToast("Gagal memproses check-out pengunjung.", "error");
    }
  };

  const formatJam = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const exportVisitorLogsToCsv = (data: VisitorLog[], namaFileSuffix: string) => {
    if (data.length === 0) {
      return showToast("Data masih kosong, tidak ada yang bisa di-export.", "warning");
    }

    const headers = ["Kategori", "Nama Pengunjung", "Instansi/Dept", "Tujuan", "Bertemu Dengan", "Plat Kendaraan", "Status", "Waktu Masuk", "Waktu Keluar", "Petugas Gate"];
    const rows = data.map(log => {
      const aman = (teks: string) => `"${teks ? teks.replace(/"/g, '""') : "-"}"`;
      return [
        aman(log.jenis), aman(log.nama), aman(log.instansi_dept), aman(log.tujuan),
        aman(log.bertemu_dengan), aman(log.no_kendaraan), aman(log.status),
        aman(formatJam(log.waktu_masuk)), aman(log.waktu_keluar ? formatJam(log.waktu_keluar) : "Belum Keluar"),
        aman(log.pic_bertugas)
      ].join(",");
    });

    const csvContent = "﻿" + headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const namaFile = `Laporan_Gerbang_SIBM_${namaFileSuffix}_${new Date().toISOString().split("T")[0]}.csv`;
    link.setAttribute("download", namaFile);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => exportVisitorLogsToCsv(visitorLogs, "Semua");
  const handleExportExcelRiwayatFiltered = () => exportVisitorLogsToCsv(riwayatPengunjung, "Riwayat-Filter");

  // 💡 FUNGSI FILTER TAB "DI DALAM AREA" — search nama/instansi + tanggal spesifik
  const pengunjungAktif = visitorLogs.filter(log => {
    if (log.status !== "Di Dalam Area") return false;
    const matchName = log.nama.toLowerCase().includes(searchNamaTamu.toLowerCase()) ||
                      log.instansi_dept.toLowerCase().includes(searchNamaTamu.toLowerCase());
    let matchDate = true;
    if (searchTanggalTamu && log.waktu_masuk) {
      const logDateObj = log.waktu_masuk.toDate();
      const logDateStr = `${logDateObj.getFullYear()}-${String(logDateObj.getMonth() + 1).padStart(2, '0')}-${String(logDateObj.getDate()).padStart(2, '0')}`;
      matchDate = logDateStr === searchTanggalTamu;
    }
    return matchName && matchDate;
  });

  // 💡 FUNGSI FILTER TAB "RIWAYAT KELUAR" — search + tanggal + kategori + bulan/tahun + PT
  const riwayatPengunjung = visitorLogs.filter(log => {
    if (log.status !== "Selesai / Keluar") return false;

    const matchName = log.nama.toLowerCase().includes(searchNamaTamu.toLowerCase()) ||
                      log.instansi_dept.toLowerCase().includes(searchNamaTamu.toLowerCase());

    let matchDate = true;
    if (searchTanggalTamu && log.waktu_masuk) {
      const logDateObj = log.waktu_masuk.toDate();
      const logDateStr = `${logDateObj.getFullYear()}-${String(logDateObj.getMonth() + 1).padStart(2, '0')}-${String(logDateObj.getDate()).padStart(2, '0')}`;
      matchDate = logDateStr === searchTanggalTamu;
    }

    const matchJenis = filterJenisRiwayat === "Semua" || log.jenis === filterJenisRiwayat;

    let matchBulanTahun = true;
    if (log.waktu_masuk) {
      const d = log.waktu_masuk.toDate();
      if (filterBulanRiwayat !== "Semua" && String(d.getMonth()) !== filterBulanRiwayat) matchBulanTahun = false;
      if (filterTahunRiwayat !== "Semua" && String(d.getFullYear()) !== filterTahunRiwayat) matchBulanTahun = false;
    } else if (filterBulanRiwayat !== "Semua" || filterTahunRiwayat !== "Semua") {
      matchBulanTahun = false;
    }

    const matchPT = filterPTRiwayat === "Semua" || log.instansi_dept === filterPTRiwayat;

    return matchName && matchDate && matchJenis && matchBulanTahun && matchPT;
  });

  const tahunTersediaRiwayat = Array.from(new Set(
    visitorLogs.filter(l => l.status === "Selesai / Keluar" && l.waktu_masuk).map(l => l.waktu_masuk!.toDate().getFullYear())
  )).sort((a, b) => b - a);

  const ptTersediaRiwayat = Array.from(new Set(
    visitorLogs.filter(l => l.status === "Selesai / Keluar" && l.instansi_dept).map(l => l.instansi_dept)
  )).sort((a, b) => a.localeCompare(b));

  const resetFilterRiwayat = () => {
    setSearchNamaTamu("");
    setSearchTanggalTamu("");
    setFilterJenisRiwayat("Semua");
    setFilterBulanRiwayat("Semua");
    setFilterTahunRiwayat("Semua");
    setFilterPTRiwayat("Semua");
  };

  const filteredKaryawan = karyawanDB.filter(emp => emp.nama.toLowerCase().includes(searchKaryawan.toLowerCase()));
  const filteredMagang = magangDB.filter(mag => mag.nama.toLowerCase().includes(searchMagang.toLowerCase()));

  // 💡 KOMPONEN SEARCH BAR REUSABLE
  const renderSearchBar = () => (
    <div className="search-bar">
      <div className="search-input-wrap">
        <IconSearch size={15} color="var(--muted)" />
        <input
          type="text"
          placeholder="Cari nama atau instansi..."
          value={searchNamaTamu}
          onChange={(e) => setSearchNamaTamu(e.target.value)}
        />
      </div>
      <input
        type="date"
        value={searchTanggalTamu}
        onChange={(e) => setSearchTanggalTamu(e.target.value)}
        className="search-date"
      />
      <button
        onClick={() => { setSearchNamaTamu(""); setSearchTanggalTamu(""); }}
        className="search-reset-btn"
      >
        <IconX size={12} /> Reset
      </button>
    </div>
  );

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
          padding: 36px 20px 60px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .page-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .page-hero-content { position: relative; }

        .tab-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        .tab-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; flex: 1; scrollbar-width: none; }
        .tab-scroll::-webkit-scrollbar { display: none; }
        .tab-pill { flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 11px 18px; border-radius: 12px; font-weight: 700; font-size: 13px; border: none; cursor: pointer; transition: all 0.2s; background: rgba(255,255,255,0.7); color: var(--muted); font-family: inherit; }
        .tab-pill.active { background: var(--surface); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .tab-pill .count { padding: 2px 8px; border-radius: 20px; font-size: 11px; background: var(--line); color: var(--ink-soft); }
        .tab-pill.active .count.aktif { background: var(--ok-50); color: var(--ok); }
        .tab-pill.active .count.riwayat { background: var(--warn-50); color: var(--warn); }
        .export-btn { background: var(--ok); color: white; padding: 11px 18px; border: none; border-radius: 12px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 6px rgba(22,163,74,0.2); transition: 0.2s; font-family: inherit; flex-shrink: 0; }
        .export-btn:hover { transform: translateY(-2px); }

        .panel { background: var(--surface); padding: 25px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid var(--line); }

        .type-toggle { display: flex; gap: 10px; margin-bottom: 26px; background: var(--bg); padding: 8px; border-radius: 16px; border: 1px solid var(--line); }
        .type-btn { flex: 1; padding: 12px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; transition: 0.2s; background: transparent; color: var(--muted); font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; }
        .type-btn.tamu.active { background: var(--red-600); color: white; box-shadow: 0 4px 6px rgba(220,38,38,0.3); }
        .type-btn.karyawan.active { background: var(--info); color: white; box-shadow: 0 4px 6px rgba(37,99,235,0.3); }

        .kategori-toggle { display: flex; gap: 8px; }
        .kategori-btn { flex: 1; padding: 12px 8px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s; border: 1px solid var(--line); background: var(--bg); color: var(--muted); }
        .kategori-btn.tamu.active { border: 2px solid var(--red-600); background: var(--red-50); color: var(--red-600); }
        .kategori-btn.magang.active { border: 2px solid var(--accent); background: #f5f3ff; color: var(--accent); }

        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; position: relative; }
        .form-field { display: flex; flex-direction: column; }
        .form-field.span-2 { grid-column: span 2; }
        .form-field label { font-size: 13px; font-weight: 700; margin-bottom: 8px; color: var(--ink-soft); }
        .form-field input { width: 100%; padding: 14px 15px; border-radius: 12px; border: 1px solid var(--line); font-size: 14px; background: var(--bg); outline: none; font-family: inherit; transition: 0.2s; }
        .form-field input:focus { border-color: var(--info); background: var(--surface); }
        .form-field select { width: 100%; padding: 14px 15px; border-radius: 12px; border: 1px solid var(--line); font-size: 14px; background: var(--bg); outline: none; font-family: inherit; transition: 0.2s; cursor: pointer; }
        .form-field select:focus { border-color: var(--info); background: var(--surface); }

        .foto-box { grid-column: span 2; margin-top: 4px; background: var(--bg); padding: 20px; border-radius: 16px; border: 2px dashed var(--line); text-align: center; }
        .foto-open-btn { width: 100%; padding: 20px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); border-radius: 12px; font-weight: 700; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 10px; font-size: 15px; transition: 0.2s; font-family: inherit; }
        .foto-open-btn:hover { border-color: var(--red-600); color: var(--red-600); }

        .submit-btn { width: 100%; padding: 17px; color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; transition: 0.2s; font-family: inherit; }

        .responsive-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        .responsive-table thead tr { background: var(--bg); color: var(--ink-soft); }
        .responsive-table th { padding: 14px; border-bottom: 2px solid var(--line); font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
        .responsive-table td { padding: 14px; border-bottom: 1px solid var(--line); }
        .avatar-chip { width: 42px; height: 42px; border-radius: 8px; display: inline-flex; justify-content: center; align-items: center; font-size: 16px; font-weight: 900; border: 1px solid var(--line); }
        .type-tag { font-size: 9px; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; font-weight: 700; }
        .empty-state { text-align: center; padding: 45px 20px; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 10px; }

        .search-bar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; background: var(--bg); padding: 12px; border-radius: 12px; border: 1px solid var(--line); }
        .search-input-wrap { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; flex: 1; min-width: 200px; }
        .search-input-wrap input { border: none; outline: none; padding: 10px 0; font-size: 14px; background: transparent; flex: 1; font-family: inherit; }
        .search-date { padding: 10px 15px; border-radius: 10px; border: 1px solid var(--line); min-width: 140px; outline: none; font-size: 14px; color: var(--ink-soft); background: var(--surface); font-family: inherit; }
        .search-reset-btn { padding: 10px 18px; border-radius: 10px; border: none; background: var(--line); color: var(--ink-soft); font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; font-size: 13px; font-family: inherit; }
        .search-reset-btn:hover { background: var(--red-50); color: var(--red-600); }

        .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; background: var(--surface); padding: 4px 0; }
        .filter-select { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); font-size: 13px; outline: none; cursor: pointer; font-family: inherit; color: var(--ink-soft); }

        @media (max-width: 700px) {
          .form-grid { grid-template-columns: 1fr !important; }
          .form-field.span-2 { grid-column: span 1 !important; }
          .panel { padding: 18px !important; border-radius: 16px !important; }
          .responsive-table { font-size: 12px; }
          .responsive-table th, .responsive-table td { padding: 10px 8px !important; }
          .tab-row { flex-direction: column; align-items: stretch; }
          .export-btn { justify-content: center; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="back-btn" onClick={() => router.push("/dashboard/security")}><IconArrowLeft size={16} /></button>
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Buku Tamu Digital</span>
        </div>
        <div className="pic-badge"><IconUserCircle size={14} /> {picName}</div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="page-hero">
        <div className="page-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>BUKU TAMU DIGITAL</h1>
          <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>Registrasi dan pemantauan pergerakan akses area SIBM</p>
        </div>
      </div>

      <div style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>

        {/* 🔹 NAVIGASI TAB + EXPORT EXCEL */}
        <div className="tab-row">
          <div className="tab-scroll">
            <button onClick={() => { setActiveTab("input"); setSearchNamaTamu(""); setSearchTanggalTamu(""); }} className={`tab-pill ${activeTab === "input" ? "active" : ""}`} style={activeTab === "input" ? { color: "var(--red-600)", borderBottom: "3px solid var(--red-600)" } : {}}>
              <IconEdit size={14} /> Input Kedatangan
            </button>
            <button onClick={() => { setActiveTab("aktif"); setSearchNamaTamu(""); setSearchTanggalTamu(""); }} className={`tab-pill ${activeTab === "aktif" ? "active" : ""}`} style={activeTab === "aktif" ? { color: "var(--ok)" } : {}}>
              <IconUsers size={14} /> Di Dalam Area <span className="count aktif">{visitorLogs.filter(l => l.status === "Di Dalam Area").length}</span>
            </button>
            <button onClick={() => { setActiveTab("riwayat"); resetFilterRiwayat(); }} className={`tab-pill ${activeTab === "riwayat" ? "active" : ""}`} style={activeTab === "riwayat" ? { color: "var(--warn)" } : {}}>
              <IconHistory size={14} /> Riwayat Keluar <span className="count riwayat">{visitorLogs.filter(l => l.status === "Selesai / Keluar").length}</span>
            </button>
          </div>

          <button onClick={handleExportExcel} className="export-btn">
            <IconDownload size={15} /> Export Excel
          </button>
        </div>

        {/* 🔹 TAB 1: FORM INPUT KEDATANGAN */}
        {activeTab === "input" && (
          <div className="panel">

            {/* TOGGLE KARYAWAN VS TAMU EKSTERNAL/MAGANG (Karyawan didahulukan — paling sering dipakai petugas gerbang) */}
            <div className="type-toggle">
              <button type="button" onClick={() => { setJenisPengunjung("Karyawan"); resetFormLengkap(); }} className={`type-btn karyawan ${jenisPengunjung === "Karyawan" ? "active" : ""}`}>
                <IconBuilding size={15} /> Karyawan / Staf
              </button>
              <button type="button" onClick={() => { setJenisPengunjung("Tamu Eksternal"); resetFormLengkap(); }} className={`type-btn tamu ${jenisPengunjung === "Tamu Eksternal" ? "active" : ""}`}>
                <IconBriefcase size={15} /> Tamu Eksternal / Magang
              </button>
            </div>

            <form onSubmit={handleCheckIn} className="form-grid">

              {/* KATEGORI TAMU — dipilih dulu sebelum Nama, biar field yang muncul di bawahnya langsung menyesuaikan */}
              {jenisPengunjung === "Tamu Eksternal" && (
                <div className="form-field span-2">
                  <label>Kategori Tamu *</label>
                  <div className="kategori-toggle">
                    <button type="button" onClick={() => setKategoriEksternal("Tamu Eksternal")} className={`kategori-btn tamu ${kategoriEksternal === "Tamu Eksternal" ? "active" : ""}`}>
                      <IconBriefcase size={13} /> Tamu Eksternal
                    </button>
                    <button type="button" onClick={() => setKategoriEksternal("Magang")} className={`kategori-btn magang ${kategoriEksternal === "Magang" ? "active" : ""}`}>
                      <IconGraduationCap size={13} /> Magang
                    </button>
                  </div>
                </div>
              )}

              <div className="form-field span-2" style={{ position: "relative" }}>
                <label>Nama Lengkap *</label>

                {jenisPengunjung === "Karyawan" ? (
                  <div style={{ position: "relative" }}>
                    <input type="text" value={searchKaryawan} onChange={(e) => { setSearchKaryawan(e.target.value); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} required placeholder="Ketik nama karyawan..." style={{ border: "2px solid var(--info)", background: "var(--info-50)", color: "var(--info)", fontWeight: "bold" }} />

                    {showDropdown && searchKaryawan && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "12px", marginTop: "8px", zIndex: 50, maxHeight: "250px", overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
                        {filteredKaryawan.length > 0 ? filteredKaryawan.map((emp, idx) => (
                          <div key={idx} onClick={() => pilihKaryawan(emp)} style={{ padding: "15px", borderBottom: "1px solid var(--line)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "var(--bg)"} onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
                            <span style={{ fontWeight: "bold", color: "var(--ink)" }}>{emp.nama}</span>
                            <span style={{ fontSize: "11px", color: "var(--muted)", background: "var(--bg)", padding: "4px 8px", borderRadius: "8px", fontWeight: "bold" }}>{emp.departemen}</span>
                          </div>
                        )) : (
                          <div style={{ padding: "15px", color: "var(--muted)", textAlign: "center", fontSize: "13px" }}>Karyawan tidak ditemukan.</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : kategoriEksternal === "Magang" ? (
                  <div style={{ position: "relative" }}>
                    <input type="text" value={searchMagang} onChange={(e) => { setSearchMagang(e.target.value); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} required placeholder="Ketik nama anak magang..." style={{ border: "2px solid var(--accent)", background: "#f5f3ff", color: "var(--accent)", fontWeight: "bold" }} />

                    {showDropdown && searchMagang && filteredMagang.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "12px", marginTop: "8px", zIndex: 50, maxHeight: "250px", overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
                        {filteredMagang.map((mag, idx) => (
                          <div key={idx} onClick={() => pilihMagang(mag)} style={{ padding: "15px", borderBottom: "1px solid var(--line)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "var(--bg)"} onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
                            <span style={{ fontWeight: "bold", color: "var(--ink)" }}>{mag.nama}</span>
                            <span style={{ fontSize: "11px", color: "var(--muted)", background: "var(--bg)", padding: "4px 8px", borderRadius: "8px", fontWeight: "bold" }}>{mag.instansi}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "6px" }}>Nama baru? Ketik langsung — otomatis tersimpan ke riwayat untuk kunjungan berikutnya.</div>
                  </div>
                ) : (
                  <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Budi Santoso" />
                )}
              </div>

              {jenisPengunjung === "Karyawan" ? (
                <>
                  <div className="form-field">
                    <label>Unit Bisnis / Departemen *</label>
                    <input type="text" name="instansi_dept" value={formData.instansi_dept} onChange={handleInputChange} required readOnly placeholder="Otomatis Terisi..." style={{ background: "var(--line)" }} />
                  </div>
                  <div className="form-field">
                    <label>No. Plat Kendaraan</label>
                    <input type="text" name="no_kendaraan" value={formData.no_kendaraan} onChange={handleInputChange} placeholder="Opsional" />
                  </div>
                </>
              ) : kategoriEksternal === "Magang" ? (
                <>
                  {/* MAGANG — form dipangkas: cukup Nama, Unit Bisnis, dan Foto ID Card. Tujuan otomatis "Magang Kerja". */}
                  <div className="form-field span-2">
                    <label>Unit Bisnis *</label>
                    <select name="instansi_dept" value={formData.instansi_dept} onChange={handleInputChange} required>
                      <option value="" disabled>Pilih Unit Bisnis...</option>
                      <optgroup label="Unit Bisnis (PT)">
                        {DAFTAR_UNIT_BISNIS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                      <optgroup label="Departemen Internal Gedung">
                        {DAFTAR_DEPARTEMEN_INTERNAL.map((d) => <option key={d} value={d}>{d}</option>)}
                      </optgroup>
                    </select>
                  </div>

                  <div className="foto-box">
                    <label style={{ display: "block", fontSize: "14px", fontWeight: "bold", marginBottom: "15px", color: "var(--ink-soft)" }}>
                      Wajib Foto Bersama ID Card Magang
                    </label>
                    {isUploadingFoto ? (
                      <div style={{ padding: "20px", color: "var(--muted)", fontWeight: "bold", fontSize: "14px" }}>
                        Mengunggah foto...
                      </div>
                    ) : fotoBukti ? (
                      <div style={{ position: "relative", display: "inline-block" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotoBukti} alt="Bukti Kedatangan" style={{ height: "150px", borderRadius: "12px", border: "3px solid var(--accent)", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }} />
                        <button type="button" onClick={hapusFoto} style={{ position: "absolute", top: "-15px", right: "-15px", background: "var(--red-600)", color: "white", border: "3px solid white", borderRadius: "50%", width: "40px", height: "40px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}><IconX size={16} color="white" /></button>
                      </div>
                    ) : (
                      <button type="button" onClick={bukaKamera} className="foto-open-btn">
                        <IconCamera size={20} /> Buka Kamera Perangkat
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* TAMU EKSTERNAL — form lengkap, tidak berubah */}
                  <div className="form-field">
                    <label>Asal Instansi / Sekolah / Kampus *</label>
                    <input type="text" name="instansi_dept" value={formData.instansi_dept} onChange={handleInputChange} required placeholder="Contoh: PT. Maju Bersama" />
                  </div>
                  <div className="form-field">
                    <label>Bertemu Dengan (Host) *</label>
                    <input type="text" name="bertemu_dengan" value={formData.bertemu_dengan} onChange={handleInputChange} required placeholder="Contoh: Pak Anton (HRD)" />
                  </div>
                  <div className="form-field span-2">
                    <label>Tujuan Kunjungan *</label>
                    <input type="text" name="tujuan" value={formData.tujuan} onChange={handleInputChange} required placeholder="Contoh: Meeting / Interview" />
                  </div>

                  {/* AREA KAMERA */}
                  <div className="foto-box">
                    <label style={{ display: "block", fontSize: "14px", fontWeight: "bold", marginBottom: "15px", color: "var(--ink-soft)" }}>
                      Wajib Foto KTP Tamu
                    </label>
                    {isUploadingFoto ? (
                      <div style={{ padding: "20px", color: "var(--muted)", fontWeight: "bold", fontSize: "14px" }}>
                        Mengunggah foto...
                      </div>
                    ) : fotoBukti ? (
                      <div style={{ position: "relative", display: "inline-block" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotoBukti} alt="Bukti Kedatangan" style={{ height: "150px", borderRadius: "12px", border: "3px solid var(--red-600)", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }} />
                        <button type="button" onClick={hapusFoto} style={{ position: "absolute", top: "-15px", right: "-15px", background: "var(--red-600)", color: "white", border: "3px solid white", borderRadius: "50%", width: "40px", height: "40px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}><IconX size={16} color="white" /></button>
                      </div>
                    ) : (
                      <button type="button" onClick={bukaKamera} className="foto-open-btn">
                        <IconCamera size={20} /> Buka Kamera Perangkat
                      </button>
                    )}
                  </div>
                </>
              )}

              <div className="form-field span-2" style={{ marginTop: "16px" }}>
                <button type="submit" disabled={isLoading} className="submit-btn" style={{ background: isLoading ? "#a0aec0" : (jenisPengunjung === "Tamu Eksternal" ? "var(--red-600)" : "var(--info)"), cursor: isLoading ? "not-allowed" : "pointer", boxShadow: isLoading ? "none" : `0 10px 15px -3px ${jenisPengunjung === "Tamu Eksternal" ? "rgba(220,38,38,0.4)" : "rgba(37,99,235,0.4)"}` }}>
                  {isLoading ? "Menyimpan Data..." : `Check-In ${jenisPengunjung === "Tamu Eksternal" ? kategoriEksternal : jenisPengunjung}`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 🔹 TAB 2: PENGUNJUNG DI DALAM AREA (TABLE VIEW) */}
        {activeTab === "aktif" && (
          <div className="panel">

            {renderSearchBar()}

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th style={{ width: "60px", textAlign: "center" }}>Foto</th>
                    <th>Identitas</th>
                    <th>Tujuan & Host</th>
                    <th>Waktu Masuk</th>
                    <th style={{ textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {pengunjungAktif.length > 0 ? pengunjungAktif.map(visitor => {
                    const badge = jenisBadgeColor(visitor.jenis);
                    return (
                    <tr key={visitor.id}>

                      <td style={{ textAlign: "center" }}>
                        {visitor.jenis !== "Karyawan" ? (
                          visitor.foto_bukti ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={visitor.foto_bukti} alt="Foto" style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--line)" }} />
                          ) : (
                            <div className="avatar-chip" style={{ background: "var(--bg)", color: "var(--muted)" }}><IconCamera size={16} /></div>
                          )
                        ) : (
                          <div className="avatar-chip" style={{ background: "var(--info-50)", color: "var(--info)" }}>
                            {visitor.nama.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </td>

                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          {visitor.nama}
                          <span className="type-tag" style={{ background: badge.bg, color: badge.color }}>{visitor.jenis}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}><IconBuilding size={12} /> {visitor.instansi_dept}</div>
                        {visitor.no_kendaraan && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}><IconCar size={11} /> {visitor.no_kendaraan}</div>}
                      </td>

                      <td>
                        <div style={{ color: "var(--ink)", fontSize: "13px", fontWeight: "500" }}>{visitor.tujuan}</div>
                        {visitor.jenis === "Tamu Eksternal" && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}><IconHandshake size={12} /> Bertemu: <b>{visitor.bertemu_dengan}</b></div>}
                      </td>

                      <td>
                        <div style={{ color: "var(--ok)", fontWeight: "bold", fontSize: "13px" }}>{formatJam(visitor.waktu_masuk)}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>Gate: {visitor.pic_bertugas.split(" ")[0]}</div>
                      </td>

                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => handleCheckOut(visitor.id, visitor.nama)}
                          style={{ padding: "8px 14px", background: "var(--red-600)", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "11px", boxShadow: "0 2px 4px rgba(220,38,38,0.2)", transition: "0.2s", whiteSpace: "nowrap" }}
                        >
                          Check-Out ➔
                        </button>
                      </td>

                    </tr>
                  );}) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="empty-state">
                          <IconShieldCheck size={30} color="var(--muted)" />
                          {searchNamaTamu || searchTanggalTamu ? "Pencarian tidak ditemukan." : "Area Clear. Tidak ada yang tertahan di dalam area saat ini."}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 🔹 TAB 3: RIWAYAT KELUAR (TABLE VIEW) */}
        {activeTab === "riwayat" && (
          <div className="panel">

            {renderSearchBar()}

            <div className="filter-bar">
              <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "bold", color: "var(--muted)" }}><IconFilter size={13} /> Filter:</span>
              <select value={filterJenisRiwayat} onChange={(e) => setFilterJenisRiwayat(e.target.value as "Semua" | JenisPengunjung)} className="filter-select">
                <option value="Semua">Semua Kategori</option>
                <option value="Karyawan">Internal (Karyawan)</option>
                <option value="Tamu Eksternal">Eksternal (Tamu)</option>
                <option value="Magang">Magang</option>
              </select>
              <select value={filterBulanRiwayat} onChange={(e) => setFilterBulanRiwayat(e.target.value)} className="filter-select">
                <option value="Semua">Semua Bulan</option>
                {NAMA_BULAN.map((b, i) => <option key={b} value={String(i)}>{b}</option>)}
              </select>
              <select value={filterTahunRiwayat} onChange={(e) => setFilterTahunRiwayat(e.target.value)} className="filter-select">
                <option value="Semua">Semua Tahun</option>
                {tahunTersediaRiwayat.map(th => <option key={th} value={String(th)}>{th}</option>)}
              </select>
              <select value={filterPTRiwayat} onChange={(e) => setFilterPTRiwayat(e.target.value)} className="filter-select">
                <option value="Semua">Semua PT / Instansi</option>
                {ptTersediaRiwayat.map(pt => <option key={pt} value={pt}>{pt}</option>)}
              </select>

              <button onClick={handleExportExcelRiwayatFiltered} className="export-btn" style={{ padding: "9px 16px", marginLeft: "auto" }}>
                <IconDownload size={14} /> Export Sesuai Filter ({riwayatPengunjung.length})
              </button>
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th style={{ width: "60px", textAlign: "center" }}>Foto</th>
                    <th>Identitas</th>
                    <th>Tujuan & Host</th>
                    <th>Waktu Log</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {riwayatPengunjung.length > 0 ? riwayatPengunjung.map(visitor => {
                    const badge = jenisBadgeColor(visitor.jenis);
                    return (
                    <tr key={visitor.id} style={{ background: "var(--bg)" }}>

                      <td style={{ textAlign: "center" }}>
                        {visitor.jenis !== "Karyawan" ? (
                          visitor.foto_bukti ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={visitor.foto_bukti} alt="Foto" style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--line)", filter: "grayscale(50%)" }} />
                          ) : (
                            <div className="avatar-chip" style={{ background: "var(--surface)", color: "var(--muted)" }}><IconBriefcase size={16} /></div>
                          )
                        ) : (
                          <div className="avatar-chip" style={{ background: "var(--surface)", color: "var(--info)" }}>
                            <IconBuilding size={16} />
                          </div>
                        )}
                      </td>

                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--ink-soft)", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          {visitor.nama}
                          <span className="type-tag" style={{ background: "var(--line)", color: badge.color }}>{visitor.jenis}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>{visitor.instansi_dept}</div>
                      </td>

                      <td>
                        <div style={{ color: "var(--muted)", fontSize: "13px" }}>{visitor.tujuan}</div>
                        {visitor.jenis === "Tamu Eksternal" && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}><IconHandshake size={12} /> Bertemu: {visitor.bertemu_dengan}</div>}
                      </td>

                      <td>
                        <div style={{ fontSize: "11px", color: "var(--ink-soft)", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "8px", rowGap: "4px" }}>
                          <span style={{ color: "var(--ok)", fontWeight: "bold" }}>In:</span>
                          <span>{formatJam(visitor.waktu_masuk)}</span>
                          <span style={{ color: "var(--red-600)", fontWeight: "bold" }}>Out:</span>
                          <span>{formatJam(visitor.waktu_keluar)}</span>
                        </div>
                      </td>

                      <td style={{ textAlign: "center" }}>
                        <span style={{ background: "var(--ok-50)", color: "var(--ok)", padding: "6px 12px", borderRadius: "8px", fontSize: "10px", fontWeight: "bold", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <IconCheck size={10} /> KELUAR
                        </span>
                      </td>

                    </tr>
                  );}) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="empty-state">
                          <IconScroll size={30} color="var(--muted)" />
                          {searchNamaTamu || searchTanggalTamu || filterJenisRiwayat !== "Semua" || filterBulanRiwayat !== "Semua" || filterTahunRiwayat !== "Semua" || filterPTRiwayat !== "Semua" ? "Pencarian / filter tidak ditemukan." : "Belum ada riwayat pergerakan keluar yang terekam."}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* 🔹 OVERLAY KAMERA */}
      {isCameraOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.95)", zIndex: 100, display: "flex", flexDirection: "column", backdropFilter: "blur(10px)" }}>
          <div style={{ padding: "20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontWeight: "bold", fontSize: "16px", display: "flex", alignItems: "center", gap: "10px" }}><IconCamera size={18} /> Arahkan Wajah / KTP</span>
            <button onClick={matikanKamera} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: "40px", height: "40px", borderRadius: "50%", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center" }}><IconX size={18} color="white" /></button>
          </div>

          <div style={{ flex: 1, position: "relative", display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
            <canvas ref={canvasRef} style={{ display: "none" }}></canvas>

            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80%", maxWidth: "350px", height: "50%", maxHeight: "350px", border: "3px dashed rgba(255,255,255,0.7)", borderRadius: "24px", boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}></div>
          </div>

          <div style={{ padding: "40px", display: "flex", justifyContent: "center", background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)" }}>
            <button onClick={ambilFoto} style={{ width: "80px", height: "80px", borderRadius: "50%", background: "white", border: "6px solid rgba(255,255,255,0.3)", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.5)", transition: "transform 0.1s" }} onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.9)"} onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}></button>
          </div>
        </div>
      )}

      {/* 🔹 MODAL NAMA KARYAWAN TIDAK SESUAI */}
      <Modal open={showInvalidKaryawanModal} onClose={() => setShowInvalidKaryawanModal(false)} maxWidth="380px">
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--warn-50)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <IconAlertTriangle size={26} color="var(--warn)" />
          </div>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "17px", fontWeight: 800, color: "var(--ink)" }}>Nama Karyawan Tidak Sesuai</h3>
          <p style={{ margin: "0 0 22px 0", fontSize: "13px", color: "var(--muted)" }}>Nama yang Anda ketik tidak ditemukan di Master Data Karyawan. Silakan ketik ulang dan pilih nama dari daftar saran yang muncul.</p>
          <button onClick={() => setShowInvalidKaryawanModal(false)} style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "none", background: "var(--info)", color: "white", fontWeight: 700, fontSize: "13px", fontFamily: "inherit", cursor: "pointer" }}>
            Mengerti
          </button>
        </div>
      </Modal>

    </div>
  );
}
