"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy,
  where, limit, Timestamp, serverTimestamp
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../../../components/ui/Table";
import VehicleIcon3D, { KATEGORI_KENDARAAN, WARNA_KENDARAAN } from "../../../components/VehicleIcon3D";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

interface Employee {
  id: string;
  nama: string;
  departemen?: string;
}

interface Kendaraan {
  id: string;
  kendaraan: string; // Nama identifier - HARUS SAMA PERSIS dengan yang dipilih driver di form lapor status
  plat_nomor: string;
  jenis: string; // merk/tipe bebas, cth: "Toyota Avanza" — BEDA dari `kategori` (dipakai buat pilih bentuk icon 3D)
  kategori: string; // Sedan/SUV-MPV/Pickup/Truck/Motor — nentuin bentuk icon 3D
  warna: string; // nentuin warna icon 3D
  pic_kendaraan: string;
  unit_bisnis: string;
  no_rangka?: string;
  no_mesin?: string;
  tanggal_pajak?: string; // tanggal STNK/pajak berlaku sampai (YYYY-MM-DD)
  foto_url?: string;
}

interface OdometerLog {
  id: string;
  kendaraan_id: string;
  kendaraan: string;
  odometer: number;
  tanggal: string;
  dicatat_oleh?: string;
  waktu_catat?: Timestamp | null;
}

interface ServiceLog {
  id: string;
  kendaraan_id: string;
  kendaraan: string;
  tanggal: string;
  jenis_service: string;
  deskripsi: string;
  biaya?: string;
  foto_emisi_url?: string;
  waktu_catat?: Timestamp | null;
}

interface PemakaianLog {
  kendaraan: string;
  status_kendaraan: string;
  driver_bertugas: string;
  tujuan_keperluan: string;
  waktu_catat?: Timestamp | null;
}

interface InspeksiLog {
  id: string;
  kendaraan_id: string;
  kendaraan: string;
  driver: string;
  tanggal: string;
  checklist: Record<string, string>;
  catatan?: string;
  foto_url?: string;
  waktu_catat?: Timestamp | null;
}

const CHECKLIST_LABELS: Record<string, string> = {
  ban: "Ban & Tekanan Angin",
  rem: "Rem",
  lampu: "Lampu (Depan/Belakang/Sein)",
  oli: "Oli Mesin",
  air_radiator_aki: "Air Radiator & Aki",
  wiper_kaca: "Wiper & Kaca",
  ac: "AC",
  kebersihan: "Kebersihan Interior/Eksterior",
};

// Data lama yang sebelumnya hardcode di halaman driver, dipakai sekali untuk migrasi awal
const MIGRASI_KENDARAAN_LAMA = [
  "BB 1164 XBC - Muhammad Yusuf (PT Makassar Jaya Samudera)",
  "B 2306 PZQ - Bernard Hutagaol (PT Makassar Jaya Samudera)",
  "B 2137 PZA - Joko Susilo (PT Makassar Jaya Samudera)",
  "B 2737 PIW - Agussalim (PT Samudera Agencies Indonesia)",
  "DD 1591 XBG - Saipul Mirah (PT SILkargo Indonesia)",
  "DD 1278 XCS - SML Operational (PT Samudera Makassar Logistik)",
  "DD 1412 XBO - Marketing/UMUM (PT Makassar Jaya Samudera)",
  "DD 1273 XBO - Wahyu Hermawan (PT Makassar Jaya Samudera)",
  "B 5597 KDB - Agusri (PT Samudera Makassar Logistik)",
  "B 1828 DYKI - Mildawaty (PT Samudera Perdana)",
  "DD 1384 XBN - PPNP OPS (PT Perusahaan Pelayaran Nusantara Panurjwan)",
  "B 1629 RKP - Mattias Hotma (PT Perusahaan Pelayaran Nusantara Panurjwan)"
];

function buildKendaraanId(plat: string, pic: string, unit: string): string {
  const platT = plat.trim();
  const picT = pic.trim();
  const unitT = unit.trim();
  let out = platT;
  if (picT) out += ` - ${picT}`;
  if (unitT) out += ` (${unitT})`;
  return out;
}

// Parser buat migrasi data lama: "PLAT - PIC (UNIT)" -> {plat, pic, unit}
function parseKendaraanLama(raw: string): { plat_nomor: string; pic_kendaraan: string; unit_bisnis: string } {
  const match = raw.match(/^(.*?) - (.*?) \((.*)\)$/);
  if (match) {
    return { plat_nomor: match[1].trim(), pic_kendaraan: match[2].trim(), unit_bisnis: match[3].trim() };
  }
  return { plat_nomor: raw, pic_kendaraan: "", unit_bisnis: "" };
}

async function uploadFotoToCloudinary(blob: Blob, folder: string = "sibm/kendaraan"): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
  formData.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
  const data = await res.json();
  return data.secure_url as string;
}

const todayISO = () => new Date().toISOString().split("T")[0];

// Status pajak/STNK dari tanggal berlaku (YYYY-MM-DD): Kadaluarsa / Segera Habis (<=30 hari) / Aktif
function getPajakStatus(tanggal?: string): { label: string; tone: "danger" | "warning" | "success" | "neutral" } {
  if (!tanggal) return { label: "Belum diisi", tone: "neutral" };
  const target = new Date(tanggal);
  const now = new Date();
  const diffHari = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffHari < 0) return { label: "Kadaluarsa", tone: "danger" };
  if (diffHari <= 30) return { label: `${diffHari} hari lagi`, tone: "warning" };
  return { label: "Aktif", tone: "success" };
}

export default function ManajemenKendaraanPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();

  const [adminName, setAdminName] = useState("");
  const [kendaraanList, setKendaraanList] = useState<Kendaraan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    plat_nomor: "",
    jenis: "",
    kategori: "Sedan",
    warna: "Putih",
    pic_kendaraan: "",
    unit_bisnis: "",
    no_rangka: "",
    no_mesin: "",
    tanggal_pajak: "",
    foto_url: "",
  });
  const [isMigrating, setIsMigrating] = useState(false);

  // STATE MODAL RIWAYAT
  const [riwayatKendaraan, setRiwayatKendaraan] = useState<Kendaraan | null>(null);
  const [riwayatTab, setRiwayatTab] = useState<"ODOMETER" | "SERVICE" | "PEMAKAIAN" | "INSPEKSI">("ODOMETER");
  const [odometerLogs, setOdometerLogs] = useState<OdometerLog[]>([]);
  const [serviceLogs, setServiceLogs] = useState<ServiceLog[]>([]);
  const [inspeksiLogs, setInspeksiLogs] = useState<InspeksiLog[]>([]);
  const [pemakaianLogs, setPemakaianLogs] = useState<PemakaianLog[]>([]);
  const [formOdometer, setFormOdometer] = useState({ odometer: "", tanggal: todayISO() });
  const [formService, setFormService] = useState({ tanggal: todayISO(), jenis_service: "", deskripsi: "", biaya: "", foto_emisi_url: "" });
  const [isSavingOdometer, setIsSavingOdometer] = useState(false);
  const [isSavingService, setIsSavingService] = useState(false);
  const [isUploadingEmisi, setIsUploadingEmisi] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");

    if (!role || (!role.includes("Admin") && !role.includes("Koordinator"))) {
      showToast("Akses Ditolak! Halaman ini khusus untuk Administrator.", "error");
      router.push("/dashboard");
      return;
    }

    setTimeout(() => setAdminName(nama || "Admin"), 0);

    const ref = collection(db, "master_kendaraan");
    const q = query(ref, orderBy("kendaraan", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Kendaraan[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Kendaraan);
      });
      setKendaraanList(list);
    });

    // Daftar karyawan master (buat autocomplete PIC Kendaraan)
    const unsubEmployees = onSnapshot(collection(db, "employees_directory"), (snapshot) => {
      const list: Employee[] = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() } as Employee));
      setEmployees(list);
    });

    return () => { unsubscribe(); unsubEmployees(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // TARIK RIWAYAT SAAT MODAL DIBUKA (untuk kendaraan yang dipilih)
  useEffect(() => {
    if (!riwayatKendaraan) return;

    const unsubOdo = onSnapshot(
      query(collection(db, "kendaraan_odometer_logs"), where("kendaraan_id", "==", riwayatKendaraan.id), orderBy("tanggal", "desc"), limit(15)),
      (snap) => setOdometerLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as OdometerLog)))
    );

    const unsubService = onSnapshot(
      query(collection(db, "kendaraan_service_logs"), where("kendaraan_id", "==", riwayatKendaraan.id), orderBy("tanggal", "desc"), limit(15)),
      (snap) => setServiceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceLog)))
    );

    const unsubPemakaian = onSnapshot(
      query(collection(db, "operational_vehicle_logs"), where("kendaraan", "==", riwayatKendaraan.kendaraan), orderBy("waktu_catat", "desc"), limit(15)),
      (snap) => setPemakaianLogs(snap.docs.map(d => d.data() as PemakaianLog))
    );

    const unsubInspeksi = onSnapshot(
      query(collection(db, "kendaraan_inspeksi_logs"), where("kendaraan_id", "==", riwayatKendaraan.id), orderBy("tanggal", "desc"), limit(15)),
      (snap) => setInspeksiLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as InspeksiLog)))
    );

    return () => { unsubOdo(); unsubService(); unsubPemakaian(); unsubInspeksi(); };
  }, [riwayatKendaraan]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 600 / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setIsUploadingFoto(true);
          try {
            const url = await uploadFotoToCloudinary(blob);
            setFormData((prev) => ({ ...prev, foto_url: url }));
          } catch (err) {
            console.error(err);
            showToast("Gagal upload foto, coba lagi.", "error");
          } finally {
            setIsUploadingFoto(false);
          }
        }, "image/jpeg", 0.85);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitKendaraan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploadingFoto) {
      showToast("Tunggu foto selesai diunggah dulu.", "warning");
      return;
    }
    if (!formData.plat_nomor.trim() || !formData.pic_kendaraan.trim()) {
      showToast("Plat Nomor dan PIC Kendaraan wajib diisi.", "warning");
      return;
    }
    setIsLoading(true);

    const kendaraanId = buildKendaraanId(formData.plat_nomor, formData.pic_kendaraan, formData.unit_bisnis);

    const dataToSave = {
      kendaraan: kendaraanId,
      plat_nomor: formData.plat_nomor.trim(),
      jenis: formData.jenis.trim(),
      kategori: formData.kategori,
      warna: formData.warna,
      pic_kendaraan: formData.pic_kendaraan.trim(),
      unit_bisnis: formData.unit_bisnis.trim(),
      no_rangka: formData.no_rangka.trim(),
      no_mesin: formData.no_mesin.trim(),
      tanggal_pajak: formData.tanggal_pajak,
      foto_url: formData.foto_url || "",
    };

    try {
      const duplikat = kendaraanList.find(
        (k) => k.kendaraan.toLowerCase() === dataToSave.kendaraan.toLowerCase() && k.id !== editingId
      );
      if (duplikat) {
        showToast("Kombinasi Plat/PIC/Unit Bisnis ini sudah terdaftar. Cek data yang ada.", "warning");
        setIsLoading(false);
        return;
      }

      if (editingId) {
        await updateDoc(doc(db, "master_kendaraan", editingId), dataToSave);
        setEditingId(null);
        showToast(`Data ${dataToSave.kendaraan} berhasil diperbarui.`, "success");
      } else {
        await addDoc(collection(db, "master_kendaraan"), dataToSave);
        showToast(`${dataToSave.kendaraan} berhasil ditambahkan.`, "success");
      }

      setFormData({ plat_nomor: "", jenis: "", kategori: "Sedan", warna: "Putih", pic_kendaraan: "", unit_bisnis: "", no_rangka: "", no_mesin: "", tanggal_pajak: "", foto_url: "" });
    } catch (error) {
      console.error("Error menyimpan kendaraan:", error);
      showToast("Gagal menyimpan data.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportDataLama = async () => {
    const yakin = await confirm({
      title: "Import Data Kendaraan Lama",
      message: `Ini akan menambahkan ${MIGRASI_KENDARAAN_LAMA.length} kendaraan dari data lama (yang sebelumnya hardcode di halaman driver). Data yang sudah terdaftar akan dilewati otomatis. Lanjutkan?`,
      confirmText: "Ya, Import",
    });
    if (!yakin) return;

    setIsMigrating(true);
    let sukses = 0;
    try {
      for (const raw of MIGRASI_KENDARAAN_LAMA) {
        const parsed = parseKendaraanLama(raw);
        const kendaraanId = buildKendaraanId(parsed.plat_nomor, parsed.pic_kendaraan, parsed.unit_bisnis);
        const sudahAda = kendaraanList.some((k) => k.kendaraan.toLowerCase() === kendaraanId.toLowerCase());
        if (sudahAda) continue;
        await addDoc(collection(db, "master_kendaraan"), {
          kendaraan: kendaraanId,
          plat_nomor: parsed.plat_nomor,
          jenis: "",
          kategori: "Sedan",
          warna: "Putih",
          pic_kendaraan: parsed.pic_kendaraan,
          unit_bisnis: parsed.unit_bisnis,
          no_rangka: "",
          no_mesin: "",
          tanggal_pajak: "",
          foto_url: "",
        });
        sukses++;
      }
      showToast(`${sukses} kendaraan berhasil diimport. Sisanya sudah terdaftar sebelumnya.`, "success");
    } catch (error) {
      console.error("Error import data lama:", error);
      showToast("Gagal mengimport sebagian/semua data.", "error");
    } finally {
      setIsMigrating(false);
    }
  };

  const handleMulaiEdit = (k: Kendaraan) => {
    setEditingId(k.id);
    setFormData({
      plat_nomor: k.plat_nomor || "",
      jenis: k.jenis || "",
      kategori: k.kategori || "Sedan",
      warna: k.warna || "Putih",
      pic_kendaraan: k.pic_kendaraan || "",
      unit_bisnis: k.unit_bisnis || "",
      no_rangka: k.no_rangka || "",
      no_mesin: k.no_mesin || "",
      tanggal_pajak: k.tanggal_pajak || "",
      foto_url: k.foto_url || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBatalEdit = () => {
    setEditingId(null);
    setFormData({ plat_nomor: "", jenis: "", kategori: "Sedan", warna: "Putih", pic_kendaraan: "", unit_bisnis: "", no_rangka: "", no_mesin: "", tanggal_pajak: "", foto_url: "" });
  };

  const handleHapusKendaraan = async (id: string, nama: string) => {
    const yakin = await confirm({
      title: "Hapus Data Kendaraan",
      message: `Yakin ingin menghapus data kendaraan "${nama}"? Riwayat odometer/servis yang tersimpan tidak ikut terhapus otomatis.`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (!yakin) return;

    try {
      await deleteDoc(doc(db, "master_kendaraan", id));
      showToast(`Data ${nama} berhasil dihapus.`, "success");
    } catch (error) {
      console.error("Error menghapus data:", error);
      showToast("Gagal menghapus data kendaraan.", "error");
    }
  };

  const bukaRiwayat = (k: Kendaraan) => {
    setRiwayatKendaraan(k);
    setRiwayatTab("ODOMETER");
    setFormOdometer({ odometer: "", tanggal: todayISO() });
    setFormService({ tanggal: todayISO(), jenis_service: "", deskripsi: "", biaya: "", foto_emisi_url: "" });
  };

  const tutupRiwayat = () => {
    setRiwayatKendaraan(null);
    setOdometerLogs([]);
    setServiceLogs([]);
    setPemakaianLogs([]);
  };

  const handleSubmitOdometer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riwayatKendaraan) return;
    if (!formOdometer.odometer || Number(formOdometer.odometer) <= 0) {
      showToast("Isi angka odometer yang valid.", "warning");
      return;
    }
    setIsSavingOdometer(true);
    try {
      await addDoc(collection(db, "kendaraan_odometer_logs"), {
        kendaraan_id: riwayatKendaraan.id,
        kendaraan: riwayatKendaraan.kendaraan,
        odometer: Number(formOdometer.odometer),
        tanggal: formOdometer.tanggal,
        dicatat_oleh: adminName,
        waktu_catat: serverTimestamp(),
      });
      showToast("Odometer berhasil dicatat.", "success");
      setFormOdometer({ odometer: "", tanggal: todayISO() });
    } catch (error) {
      console.error(error);
      showToast("Gagal mencatat odometer.", "error");
    } finally {
      setIsSavingOdometer(false);
    }
  };

  const handleFotoEmisiUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 600 / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setIsUploadingEmisi(true);
          try {
            const url = await uploadFotoToCloudinary(blob, "sibm/uji-emisi");
            setFormService((prev) => ({ ...prev, foto_emisi_url: url }));
          } catch (err) {
            console.error(err);
            showToast("Gagal upload foto uji emisi, coba lagi.", "error");
          } finally {
            setIsUploadingEmisi(false);
          }
        }, "image/jpeg", 0.85);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riwayatKendaraan) return;
    if (!formService.jenis_service.trim()) {
      showToast("Isi jenis servis (cth: Ganti Oli, Servis Berkala).", "warning");
      return;
    }
    setIsSavingService(true);
    try {
      await addDoc(collection(db, "kendaraan_service_logs"), {
        kendaraan_id: riwayatKendaraan.id,
        kendaraan: riwayatKendaraan.kendaraan,
        tanggal: formService.tanggal,
        jenis_service: formService.jenis_service.trim(),
        deskripsi: formService.deskripsi.trim(),
        biaya: formService.biaya.trim(),
        foto_emisi_url: formService.foto_emisi_url || "",
        waktu_catat: serverTimestamp(),
      });
      showToast("Riwayat servis berhasil dicatat.", "success");
      setFormService({ tanggal: todayISO(), jenis_service: "", deskripsi: "", biaya: "", foto_emisi_url: "" });
    } catch (error) {
      console.error(error);
      showToast("Gagal mencatat servis.", "error");
    } finally {
      setIsSavingService(false);
    }
  };

  const formatTgl = (ts?: Timestamp | null) => ts ? new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

  const filteredKendaraan = kendaraanList.filter(
    (k) =>
      k.kendaraan.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (k.plat_nomor || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (k.jenis || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (k.pic_kendaraan || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (k.unit_bisnis || "").toLowerCase().includes(searchTerm.toLowerCase())
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
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .back-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px;
        }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge {
          display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info);
          padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2);
        }
        .admin-hero {
          position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff;
          padding: 34px 20px 50px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .admin-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .admin-hero-content { position: relative; }
      `}} />
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> {adminName}
        </div>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>MASTER DATA KENDARAAN</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Kelola foto, PIC, dan riwayat armada operasional</p>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 350px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <Card>
              <h2 style={{ margin: "0 0 20px 0", color: editingId ? "var(--warn)" : "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid var(--line)", paddingBottom: "10px" }}>
                <span>{editingId ? "✏️" : "🚗"}</span> {editingId ? "Edit Data Kendaraan" : "Input Kendaraan Baru"}
              </h2>

              <form onSubmit={handleSubmitKendaraan} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>

                {/* PREVIEW ICON 3D + PILIHAN KATEGORI & WARNA */}
                <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                  <div style={{ width: "80px", height: "70px", borderRadius: "10px", overflow: "hidden", flexShrink: 0, background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", border: "2px solid var(--line)" }}>
                    <VehicleIcon3D jenis={formData.kategori} warna={formData.warna} size={56} />
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "4px", display: "block" }}>Kategori Kendaraan</label>
                      <select
                        value={formData.kategori}
                        onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--surface)", cursor: "pointer" }}
                      >
                        {KATEGORI_KENDARAAN.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "4px", display: "block" }}>Warna</label>
                      <select
                        value={formData.warna}
                        onChange={(e) => setFormData({ ...formData, warna: e.target.value })}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--surface)", cursor: "pointer" }}
                      >
                        {WARNA_KENDARAAN.map((w) => <option key={w.label} value={w.label}>{w.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* UPLOAD FOTO DOKUMENTASI (opsional — bukan icon utama, cuma buat referensi/arsip) */}
                <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                  <div style={{ width: "80px", height: "60px", borderRadius: "10px", overflow: "hidden", flexShrink: 0, background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", border: "2px solid var(--line)" }}>
                    {formData.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={formData.foto_url} alt="Foto kendaraan" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: "22px", color: "var(--muted)" }}>📷</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "inline-block", padding: "8px 14px", background: "var(--bg)", border: "1px dashed var(--muted)", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", cursor: "pointer" }}>
                      {isUploadingFoto ? "⏳ Mengunggah..." : (formData.foto_url ? "📸 Ganti Foto Dokumentasi" : "📸 Upload Foto Dokumentasi (opsional)")}
                      <input type="file" accept="image/*" onChange={handleFotoUpload} disabled={isUploadingFoto} style={{ display: "none" }} />
                    </label>
                    {formData.foto_url && !isUploadingFoto && (
                      <button type="button" onClick={() => setFormData((prev) => ({ ...prev, foto_url: "" }))} style={{ marginLeft: "8px", background: "none", border: "none", color: "var(--red-600)", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                        Hapus
                      </button>
                    )}
                  </div>
                </div>

                <Input label="Plat Nomor *" name="plat_nomor" value={formData.plat_nomor} onChange={handleInputChange} required placeholder="Contoh: DD 1234 AB" />
                <Input
                  label="PIC Kendaraan *"
                  name="pic_kendaraan"
                  value={formData.pic_kendaraan}
                  onChange={handleInputChange}
                  required
                  placeholder="Ketik nama — bisa pilih dari master karyawan"
                  datalistId="pic-kendaraan-list"
                  datalistOptions={employees.map((emp) => emp.nama)}
                />
                <Input label="Unit Bisnis" name="unit_bisnis" value={formData.unit_bisnis} onChange={handleInputChange} placeholder="Contoh: PT Samudera Makassar Logistik" />
                <Input label="Jenis / Tipe" name="jenis" value={formData.jenis} onChange={handleInputChange} placeholder="Contoh: Toyota Avanza, Motor, dll (opsional)" />

                <div style={{ display: "flex", gap: "10px" }}>
                  <Input containerStyle={{ flex: 1 }} label="No. Rangka" name="no_rangka" value={formData.no_rangka} onChange={handleInputChange} placeholder="Nomor rangka (opsional)" />
                  <Input containerStyle={{ flex: 1 }} label="No. Mesin" name="no_mesin" value={formData.no_mesin} onChange={handleInputChange} placeholder="Nomor mesin (opsional)" />
                </div>
                <Input label="Pajak/STNK Berlaku Sampai" name="tanggal_pajak" type="date" value={formData.tanggal_pajak} onChange={handleInputChange} />

                {(formData.plat_nomor || formData.pic_kendaraan) && (
                  <div style={{ background: "var(--bg)", border: "1px dashed var(--line)", borderRadius: "10px", padding: "10px 14px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "bold", color: "var(--muted)", marginBottom: "3px" }}>IDENTIFIER OTOMATIS (dipakai driver & log)</div>
                    <div style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink)" }}>{buildKendaraanId(formData.plat_nomor, formData.pic_kendaraan, formData.unit_bisnis)}</div>
                  </div>
                )}

                <Button type="submit" loading={isLoading} loadingText="Menyimpan..." variant={editingId ? "warning" : "primary"} style={{ marginTop: "10px" }}>
                  {editingId ? "💾 Update Data" : "➕ Simpan Kendaraan"}
                </Button>

                {editingId && (
                  <Button type="button" variant="secondary" onClick={handleBatalEdit}>
                    Batal Edit
                  </Button>
                )}
              </form>
            </Card>

            {kendaraanList.length === 0 && (
              <Card>
                <h2 style={{ margin: "0 0 10px 0", color: "var(--info)", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>📥</span> Import Data Lama
                </h2>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "12px", lineHeight: "1.5" }}>
                  Ada {MIGRASI_KENDARAAN_LAMA.length} kendaraan yang sebelumnya hardcode di halaman driver. Klik tombol ini biar nggak perlu input manual satu-satu.
                </p>
                <Button type="button" loading={isMigrating} loadingText="Mengimport..." onClick={handleImportDataLama} style={{ background: "var(--info)" }}>
                  Import {MIGRASI_KENDARAAN_LAMA.length} Kendaraan
                </Button>
              </Card>
            )}
          </div>

          <Card style={{ flex: "2 1 600px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>📋</span> Daftar Kendaraan <span style={{ background: "var(--bg)", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", color: "var(--ink-soft)" }}>{kendaraanList.length} Unit</span>
              </h2>

              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input
                  type="text"
                  placeholder="Cari nama, plat, PIC, unit bisnis..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "260px", background: "var(--bg)", outline: "none" }}
                />
              </div>
            </div>

            <Table>
              <THead>
                <Tr>
                  <Th>Kendaraan</Th>
                  <Th>PIC / Unit Bisnis</Th>
                  <Th>Pajak/STNK</Th>
                  <Th style={{ textAlign: "center" }}>Aksi</Th>
                </Tr>
              </THead>
              <TBody>
                {filteredKendaraan.length > 0 ? (
                  filteredKendaraan.map((k) => {
                    const pajak = getPajakStatus(k.tanggal_pajak);
                    return (
                    <Tr key={k.id}>
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "48px", height: "40px", borderRadius: "8px", background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
                            <VehicleIcon3D jenis={k.kategori} warna={k.warna} size={36} />
                          </div>
                          <div>
                            <div style={{ fontWeight: "bold", color: "var(--info)" }}>{k.kendaraan}</div>
                            <div style={{ fontSize: "12px", color: "var(--muted)" }}>{k.plat_nomor || "-"} {k.jenis ? `• ${k.jenis}` : ""}</div>
                            {(k.no_rangka || k.no_mesin) && (
                              <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                                {k.no_rangka ? `Rangka: ${k.no_rangka}` : ""}{k.no_rangka && k.no_mesin ? " • " : ""}{k.no_mesin ? `Mesin: ${k.no_mesin}` : ""}
                              </div>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td style={{ color: "var(--ink-soft)", fontSize: "13px" }}>
                        <div>{k.pic_kendaraan || <span style={{ opacity: 0.5 }}>PIC belum diisi</span>}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>{k.unit_bisnis || "-"}</div>
                      </Td>
                      <Td style={{ fontSize: "12px" }}>
                        <Badge tone={pajak.tone}>{pajak.label}</Badge>
                        {k.tanggal_pajak && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>{k.tanggal_pajak.split("-").reverse().join("/")}</div>}
                      </Td>
                      <Td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => bukaRiwayat(k)}
                          style={{ background: "var(--ok-50)", color: "var(--ok)", border: "1px solid rgba(22,163,74,0.2)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", marginRight: "6px" }}
                        >
                          📊 Riwayat
                        </button>
                        <button
                          onClick={() => handleMulaiEdit(k)}
                          style={{ background: "var(--warn-50)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.2)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", marginRight: "6px" }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleHapusKendaraan(k.id, k.kendaraan)}
                          style={{ background: "var(--red-50)", color: "var(--red-600)", border: "1px solid rgba(220,38,38,0.2)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}
                        >
                          Hapus
                        </button>
                      </Td>
                    </Tr>
                    );
                  })
                ) : (
                  <Tr>
                    <Td colSpan={4} style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)" }}>
                      <div style={{ fontSize: "30px", marginBottom: "10px" }}>🚗</div>
                      Belum ada kendaraan terdaftar.
                    </Td>
                  </Tr>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>

      {/* MODAL RIWAYAT KENDARAAN */}
      <Modal open={!!riwayatKendaraan} onClose={tutupRiwayat}>
        {riwayatKendaraan && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ marginBottom: "15px", paddingRight: "20px" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "var(--ink)", fontSize: "20px", fontWeight: "800" }}>Riwayat: {riwayatKendaraan.kendaraan}</h2>
            </div>
            <div style={{ display: "flex", background: "var(--bg)", padding: "6px", borderRadius: "14px", marginBottom: "20px", border: "1px solid var(--line)" }}>
              <button onClick={() => setRiwayatTab("ODOMETER")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "12px", background: riwayatTab === "ODOMETER" ? "var(--surface)" : "transparent", color: riwayatTab === "ODOMETER" ? "var(--ok)" : "var(--muted)" }}>🛣️ Odometer</button>
              <button onClick={() => setRiwayatTab("SERVICE")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "12px", background: riwayatTab === "SERVICE" ? "var(--surface)" : "transparent", color: riwayatTab === "SERVICE" ? "var(--ok)" : "var(--muted)" }}>🔧 Servis</button>
              <button onClick={() => setRiwayatTab("PEMAKAIAN")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "12px", background: riwayatTab === "PEMAKAIAN" ? "var(--surface)" : "transparent", color: riwayatTab === "PEMAKAIAN" ? "var(--ok)" : "var(--muted)" }}>🚙 Pemakaian</button>
              <button onClick={() => setRiwayatTab("INSPEKSI")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "12px", background: riwayatTab === "INSPEKSI" ? "var(--surface)" : "transparent", color: riwayatTab === "INSPEKSI" ? "var(--ok)" : "var(--muted)" }}>🔍 Inspeksi</button>
            </div>

            {riwayatTab === "ODOMETER" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "var(--ok-50)", border: "1px solid rgba(22,163,74,0.2)", borderRadius: "12px", padding: "15px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ok)", marginBottom: "4px" }}>ODOMETER TERAKHIR</div>
                  <div style={{ fontSize: "22px", fontWeight: "900", color: "var(--ok)" }}>
                    {odometerLogs.length > 0 ? `${odometerLogs[0].odometer.toLocaleString("id-ID")} km` : "Belum ada data"}
                  </div>
                  {odometerLogs.length > 0 && <div style={{ fontSize: "11px", color: "var(--muted)" }}>Dicatat {odometerLogs[0].tanggal}</div>}
                </div>

                <form onSubmit={handleSubmitOdometer} style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                  <Input containerStyle={{ flex: 1 }} label="Angka Odometer (km)" type="number" value={formOdometer.odometer} onChange={(e) => setFormOdometer({ ...formOdometer, odometer: e.target.value })} placeholder="Cth: 45200" />
                  <Input containerStyle={{ flex: 1 }} label="Tanggal" type="date" value={formOdometer.tanggal} onChange={(e) => setFormOdometer({ ...formOdometer, tanggal: e.target.value })} />
                  <Button type="submit" fullWidth={false} loading={isSavingOdometer} loadingText="..." style={{ height: "44px" }}>Catat</Button>
                </form>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
                  {odometerLogs.length > 0 ? odometerLogs.map((log) => (
                    <div key={log.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg)", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px" }}>
                      <span style={{ fontWeight: "bold", color: "var(--ink)" }}>{log.odometer.toLocaleString("id-ID")} km</span>
                      <span style={{ color: "var(--muted)" }}>{log.tanggal}{log.dicatat_oleh ? ` • ${log.dicatat_oleh}` : ""}</span>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "13px" }}>Belum ada riwayat odometer.</div>}
                </div>
              </div>
            )}

            {riwayatTab === "SERVICE" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "var(--warn-50)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: "12px", padding: "15px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--warn)", marginBottom: "4px" }}>SERVIS TERAKHIR</div>
                  <div style={{ fontSize: "16px", fontWeight: "900", color: "var(--warn)" }}>
                    {serviceLogs.length > 0 ? serviceLogs[0].jenis_service : "Belum ada data"}
                  </div>
                  {serviceLogs.length > 0 && <div style={{ fontSize: "11px", color: "var(--muted)" }}>{serviceLogs[0].tanggal}</div>}
                </div>

                <form onSubmit={handleSubmitService} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <Input containerStyle={{ flex: 1 }} label="Jenis Servis" value={formService.jenis_service} onChange={(e) => setFormService({ ...formService, jenis_service: e.target.value })} placeholder="Cth: Ganti Oli, Servis Berkala" />
                    <Input containerStyle={{ flex: 1 }} label="Tanggal" type="date" value={formService.tanggal} onChange={(e) => setFormService({ ...formService, tanggal: e.target.value })} />
                  </div>
                  <Input label="Deskripsi" value={formService.deskripsi} onChange={(e) => setFormService({ ...formService, deskripsi: e.target.value })} placeholder="Detail servis (opsional)" />
                  <Input label="Biaya (opsional)" value={formService.biaya} onChange={(e) => setFormService({ ...formService, biaya: e.target.value })} placeholder="Cth: 350000" />

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--bg)", border: "1px dashed var(--line)", borderRadius: "10px", padding: "10px 12px" }}>
                    {formService.foto_emisi_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={formService.foto_emisi_url} alt="Hasil uji emisi" style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
                    ) : (
                      <span style={{ fontSize: "20px" }}>🌫️</span>
                    )}
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "inline-block", padding: "6px 12px", background: "var(--bg)", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", cursor: "pointer" }}>
                        {isUploadingEmisi ? "⏳ Mengunggah..." : (formService.foto_emisi_url ? "Ganti Foto Uji Emisi" : "Upload Hasil Uji Emisi (opsional)")}
                        <input type="file" accept="image/*" onChange={handleFotoEmisiUpload} disabled={isUploadingEmisi} style={{ display: "none" }} />
                      </label>
                      {formService.foto_emisi_url && !isUploadingEmisi && (
                        <button type="button" onClick={() => setFormService((prev) => ({ ...prev, foto_emisi_url: "" }))} style={{ marginLeft: "8px", background: "none", border: "none", color: "var(--red-600)", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>

                  <Button type="submit" loading={isSavingService} loadingText="Menyimpan..." disabled={isUploadingEmisi}>Catat Riwayat Servis</Button>
                </form>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
                  {serviceLogs.length > 0 ? serviceLogs.map((log) => (
                    <div key={log.id} style={{ padding: "10px 14px", background: "var(--bg)", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: "bold", color: "var(--ink)" }}>{log.jenis_service}</span>
                        <span style={{ color: "var(--muted)" }}>{log.tanggal}</span>
                      </div>
                      {log.deskripsi && <div style={{ color: "var(--muted)", marginTop: "4px" }}>{log.deskripsi}</div>}
                      {log.biaya && <div style={{ color: "var(--ok)", fontWeight: "bold", marginTop: "4px" }}>Rp {log.biaya}</div>}
                      {log.foto_emisi_url && (
                        <a href={log.foto_emisi_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "12px", fontWeight: "bold", color: "var(--info)", textDecoration: "none" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={log.foto_emisi_url} alt="Uji emisi" style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "6px" }} />
                          🌫️ Lihat Hasil Uji Emisi
                        </a>
                      )}
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "13px" }}>Belum ada riwayat servis.</div>}
                </div>
              </div>
            )}

            {riwayatTab === "PEMAKAIAN" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "400px", overflowY: "auto" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "5px" }}>Ditarik otomatis dari log status kendaraan (Driver) — data ini tidak diinput dari halaman ini.</div>
                {pemakaianLogs.length > 0 ? pemakaianLogs.map((log, idx) => (
                  <div key={idx} style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: "bold", color: "var(--ink)" }}>{log.status_kendaraan}</span>
                      <span style={{ color: "var(--muted)" }}>{formatTgl(log.waktu_catat)}</span>
                    </div>
                    <div style={{ color: "var(--muted)", marginTop: "4px" }}>👤 {log.driver_bertugas?.replace("Standby: ", "") || "-"}</div>
                    {log.tujuan_keperluan && <div style={{ color: "var(--muted)", fontStyle: "italic" }}>📍 {log.tujuan_keperluan}</div>}
                  </div>
                )) : <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "13px" }}>Belum ada riwayat pemakaian.</div>}
              </div>
            )}

            {riwayatTab === "INSPEKSI" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "450px", overflowY: "auto" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "5px" }}>Diisi driver setiap minggu — data ini tidak diinput dari halaman ini.</div>
                {inspeksiLogs.length > 0 ? inspeksiLogs.map((log) => {
                  const items = Object.entries(log.checklist || {});
                  const bermasalah = items.filter(([, v]) => v !== "Baik");
                  return (
                    <div key={log.id} style={{ padding: "14px", background: "var(--bg)", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "13px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontWeight: "bold", color: "var(--ink)" }}>👤 {log.driver}</span>
                        <span style={{ color: "var(--muted)" }}>{log.tanggal}</span>
                      </div>
                      {bermasalah.length === 0 ? (
                        <div style={{ color: "var(--ok)", fontWeight: "bold", fontSize: "12px" }}>✅ Semua item kondisi Baik</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {bermasalah.map(([key, status]) => (
                            <div key={key} style={{ fontSize: "12px", color: status === "Rusak" ? "var(--red-600)" : "var(--warn)" }}>
                              {status === "Rusak" ? "🔴" : "🟡"} {CHECKLIST_LABELS[key] || key}: <b>{status}</b>
                            </div>
                          ))}
                        </div>
                      )}
                      {log.catatan && <div style={{ color: "var(--muted)", marginTop: "8px", fontStyle: "italic" }}>&quot;{log.catatan}&quot;</div>}
                      {log.foto_url && (
                        <a href={log.foto_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: "8px" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={log.foto_url} alt="Foto inspeksi" style={{ width: "60px", height: "60px", objectFit: "cover", borderRadius: "8px" }} />
                        </a>
                      )}
                    </div>
                  );
                }) : <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "13px" }}>Belum ada riwayat inspeksi.</div>}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}