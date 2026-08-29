"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, limit, Timestamp, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuthGuard, logout } from "../../hooks/useAuthGuard";

// ==========================================
// INTERFACES
// ==========================================
interface KendaraanLog {
  id: string;
  kendaraan: string;
  status_kendaraan: string;
  tujuan_keperluan: string;
  kilometer_kendaraan: string;
  waktu_catat: Timestamp | null;
}

interface KendaraanMaster {
  id: string;
  kendaraan: string;
  foto_url?: string;
}

interface InspeksiTerakhir {
  tanggal: string;
  minggu_of: string;
}

interface OvertimeItemRequest {
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  area_ruangan: string;
  alasan: string;
}

// ==========================================
// CHECKLIST INSPEKSI MINGGUAN
// ==========================================
const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "ban", label: "Ban & Tekanan Angin" },
  { key: "rem", label: "Rem" },
  { key: "lampu", label: "Lampu (Depan/Belakang/Sein)" },
  { key: "oli", label: "Oli Mesin" },
  { key: "air_radiator_aki", label: "Air Radiator & Aki" },
  { key: "wiper_kaca", label: "Wiper & Kaca" },
  { key: "ac", label: "AC" },
  { key: "kebersihan", label: "Kebersihan Interior/Eksterior" },
];

const STATUS_OPSI = ["Baik", "Perlu Perhatian", "Rusak"];

function getMondayOfWeek(d: Date = new Date()): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  // Format pakai timezone WITA (Asia/Makassar), bukan toISOString() yang UTC-based — bug berulang di project ini
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(date);
}

function checklistDefault(): Record<string, string> {
  const obj: Record<string, string> = {};
  CHECKLIST_ITEMS.forEach((item) => { obj[item.key] = "Baik"; });
  return obj;
}

async function uploadFotoToCloudinary(blob: Blob, folder: string): Promise<string> {
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

export default function DriverDashboardPage() {
  const router = useRouter();

  // Akses & sesi login sekarang dari hook terpusat (menggantikan blok localStorage manual)
  const { session, isReady } = useAuthGuard({
    depts: ["Driver"],
    adminBypass: false, // halaman ini memang khusus dept Driver saja, Admin tidak otomatis lolos (sesuai perilaku lama)
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Driver.",
  });
  const activeDriver = session?.nama || "Driver";

  const [waktuSekarang, setWaktuSekarang] = useState<string>("");

  // States Loading & Data
  const [isLoadingPersonel, setIsLoadingPersonel] = useState<boolean>(false);
  const [isLoadingMobil, setIsLoadingMobil] = useState<boolean>(false);
  const [statusTerkini, setStatusTerkini] = useState<string>("Memuat...");

  // Master Kendaraan (ditarik live dari admin/kendaraan, bukan hardcode lagi)
  const [kendaraanMaster, setKendaraanMaster] = useState<KendaraanMaster[]>([]);
  const [kendaraanId, setKendaraanId] = useState<string>("");

  // State Form Mobil
  const [statusMobil, setStatusMobil] = useState<string>("Keluar Beroperasi");
  const [tujuan, setTujuan] = useState<string>("");
  const [kilometer, setKilometer] = useState<string>("");

  // Riwayat Terakhir
  const [riwayatKu, setRiwayatKu] = useState<KendaraanLog[]>([]);

  // STATE INSPEKSI MINGGUAN
  const [inspeksiChecklist, setInspeksiChecklist] = useState<Record<string, string>>(checklistDefault());
  const [catatanInspeksi, setCatatanInspeksi] = useState("");
  const [fotoInspeksi, setFotoInspeksi] = useState("");
  const [isUploadingFotoInspeksi, setIsUploadingFotoInspeksi] = useState(false);
  const [isSavingInspeksi, setIsSavingInspeksi] = useState(false);
  const [inspeksiTerakhir, setInspeksiTerakhir] = useState<InspeksiTerakhir | null>(null);

  // STATE SERVIS & UJI EMISI (baru — sebelumnya cuma bisa diinput Admin, sekarang Driver bisa lapor langsung)
  const [servisJenis, setServisJenis] = useState("");
  const [servisDeskripsi, setServisDeskripsi] = useState("");
  const [servisBiaya, setServisBiaya] = useState("");
  const [fotoEmisi, setFotoEmisi] = useState("");
  const [isUploadingFotoEmisi, setIsUploadingFotoEmisi] = useState(false);
  const [isSavingServis, setIsSavingServis] = useState(false);

  // STATE CATAT ODOMETER CEPAT (baru — riwayat odometer periodik, terpisah dari KM per-perjalanan)
  const [odometerInput, setOdometerInput] = useState("");
  const [isSavingOdometer, setIsSavingOdometer] = useState(false);

  // STATE MODAL OVERTIME — pakai tanggal WITA (Asia/Makassar), BUKAN toISOString() yang UTC-based
  // (bug berulang di project ini: tanggal baru "ganti" jam 08:00 WITA, bukan jam 00:00 WITA)
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const [activeModal, setActiveModal] = useState<"none" | "lembur">("none");
  const [isLemburLoading, setIsLemburLoading] = useState(false);
  const [periodeLembur, setPeriodeLembur] = useState("11 Juni - 10 Juli 2026");
  const [formLemburItems, setFormLemburItems] = useState<OvertimeItemRequest[]>([
    { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Perjalanan Dinas Luar Kota / Lembur", alasan: "Antar Jemput Manajemen" }
  ]);

  // 1. Jam berjalan di header — auth sudah ditangani useAuthGuard di atas
  useEffect(() => {
    const timer = setInterval(() => {
      setWaktuSekarang(new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Tarik Riwayat Real-time Khusus Driver yang Sedang Aktif
  useEffect(() => {
    if (!activeDriver) return;

    // Tarik Status Personel Terkini
    const qStatus = query(collection(db, "driver_status_logs"), where("nama_driver", "==", activeDriver), orderBy("waktu_ubah", "desc"), limit(1));
    const unsubStatus = onSnapshot(qStatus, (snap) => {
      if (!snap.empty) {
        setStatusTerkini(snap.docs[0].data().status);
      } else {
        setStatusTerkini("Standby"); // Default jika belum ada riwayat
      }
    });

    // Tarik Riwayat Bawa Mobil
    const qMobil = query(collection(db, "operational_vehicle_logs"), where("driver_bertugas", "==", activeDriver), orderBy("waktu_catat", "desc"), limit(5));
    const unsubMobil = onSnapshot(qMobil, (snap) => {
      const logsArr: KendaraanLog[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        logsArr.push({
          id: docSnap.id,
          kendaraan: data.kendaraan,
          status_kendaraan: data.status_kendaraan,
          tujuan_keperluan: data.tujuan_keperluan,
          kilometer_kendaraan: data.kilometer_kendaraan,
          waktu_catat: data.waktu_catat
        });
      });
      setRiwayatKu(logsArr);
    });

    return () => { unsubStatus(); unsubMobil(); };
  }, [activeDriver]);

  // 3. Tarik Master Data Kendaraan (live dari admin, gantikan array hardcode lama)
  useEffect(() => {
    const q = query(collection(db, "master_kendaraan"), orderBy("kendaraan", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: KendaraanMaster[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as KendaraanMaster));
      setKendaraanMaster(list);
    });
    return () => unsub();
  }, []);

  // Set default kendaraan terpilih begitu master data kebaca
  useEffect(() => {
    if (kendaraanMaster.length === 0) return;
    if (!kendaraanId || !kendaraanMaster.some((k) => k.id === kendaraanId)) {
      setTimeout(() => setKendaraanId(kendaraanMaster[0].id), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kendaraanMaster]);

  // 4. Tarik inspeksi terakhir untuk kendaraan yang sedang dipilih (cek sudah inspeksi minggu ini atau belum)
  useEffect(() => {
    if (!kendaraanId) return;
    const q = query(collection(db, "kendaraan_inspeksi_logs"), where("kendaraan_id", "==", kendaraanId), orderBy("tanggal", "desc"), limit(1));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setInspeksiTerakhir({ tanggal: data.tanggal, minggu_of: data.minggu_of });
      } else {
        setInspeksiTerakhir(null);
      }
    });
    return () => unsub();
  }, [kendaraanId]);

  const kendaraanTerpilih = kendaraanMaster.find((k) => k.id === kendaraanId);
  const kendaraan = kendaraanTerpilih?.kendaraan || "";
  const sudahInspeksiMingguIni = inspeksiTerakhir?.minggu_of === getMondayOfWeek();

  const handleLogout = () => logout(router, "/");

  // 5. Fungsi Update Status Personel Cepat (Jika keluar tanpa mobil kantor)
  const handleUpdateStatusPersonel = async (statusBaru: string) => {
    setIsLoadingPersonel(true);
    try {
      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: activeDriver,
        status: statusBaru,
        waktu_ubah: serverTimestamp(),
        petugas_security: "Aplikasi Driver"
      });
      alert(`✅ Status Anda berhasil diubah menjadi: ${statusBaru}`);
    } catch (error) {
      console.error(error);
      alert("Gagal mengupdate status.");
    } finally {
      setIsLoadingPersonel(false);
    }
  };

  // 6. Fungsi Submit Log Mobil (Sistem Auto-Sync)
  const handleSubmitMobil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraan) {
      return alert("Belum ada kendaraan terdaftar. Hubungi Admin untuk menambahkan data kendaraan.");
    }
    if (statusMobil === "Keluar Beroperasi" && !tujuan.trim()) {
      return alert("Tujuan/Keperluan wajib diisi jika membawa mobil keluar!");
    }

    setIsLoadingMobil(true);
    try {
      // A. Simpan log kendaraan
      await addDoc(collection(db, "operational_vehicle_logs"), {
        petugas_security: "Aplikasi Driver",
        waktu_catat: serverTimestamp(),
        kendaraan: kendaraan,
        status_kendaraan: statusMobil,
        driver_bertugas: activeDriver,
        tujuan_keperluan: tujuan || "-",
        kilometer_kendaraan: kilometer || "Tidak dicatat",
      });

      // B. AUTO-UPDATE STATUS DRIVER
      let otomatisStatusDriver = "Standby";
      if (statusMobil === "Keluar Beroperasi" || statusMobil === "Masuk Bengkel / Service") {
        otomatisStatusDriver = "Keluar Beroperasi";
      }

      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: activeDriver,
        status: otomatisStatusDriver,
        waktu_ubah: serverTimestamp(),
        petugas_security: "Aplikasi Driver (Auto-Sync)"
      });

      alert("✅ Log Perjalanan & KM berhasil disimpan!");
      setTujuan("");
      setKilometer("");
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan data kendaraan.");
    } finally {
      setIsLoadingMobil(false);
    }
  };

  // 7. Upload Foto Inspeksi
  const handleFotoInspeksiUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          setIsUploadingFotoInspeksi(true);
          try {
            const url = await uploadFotoToCloudinary(blob, "sibm/inspeksi");
            setFotoInspeksi(url);
          } catch (err) {
            console.error(err);
            alert("Gagal upload foto inspeksi, coba lagi.");
          } finally {
            setIsUploadingFotoInspeksi(false);
          }
        }, "image/jpeg", 0.8);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 8. Submit Inspeksi Mingguan
  const handleSubmitInspeksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraanId) {
      return alert("Pilih kendaraan dulu di form Bawa Armada di atas.");
    }
    if (isUploadingFotoInspeksi) {
      return alert("Tunggu foto selesai diunggah dulu.");
    }
    setIsSavingInspeksi(true);
    try {
      await addDoc(collection(db, "kendaraan_inspeksi_logs"), {
        kendaraan_id: kendaraanId,
        kendaraan: kendaraan,
        driver: activeDriver,
        tanggal: todayISO,
        minggu_of: getMondayOfWeek(),
        checklist: inspeksiChecklist,
        catatan: catatanInspeksi.trim(),
        foto_url: fotoInspeksi || "",
        waktu_catat: serverTimestamp(),
      });
      alert("✅ Inspeksi mingguan berhasil disimpan!");
      setInspeksiChecklist(checklistDefault());
      setCatatanInspeksi("");
      setFotoInspeksi("");
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan inspeksi.");
    } finally {
      setIsSavingInspeksi(false);
    }
  };

  // 9. Upload Foto Bukti Uji Emisi (pola sama seperti upload foto inspeksi)
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
          setIsUploadingFotoEmisi(true);
          try {
            const url = await uploadFotoToCloudinary(blob, "sibm/emisi");
            setFotoEmisi(url);
          } catch (err) {
            console.error(err);
            alert("Gagal upload foto uji emisi, coba lagi.");
          } finally {
            setIsUploadingFotoEmisi(false);
          }
        }, "image/jpeg", 0.8);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 10. Submit Laporan Servis & Uji Emisi (sebelumnya cuma bisa diinput Admin di admin/kendaraan, sekarang Driver bisa lapor langsung)
  const handleSubmitServis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraanId) {
      return alert("Pilih kendaraan dulu di form Bawa Armada di atas.");
    }
    if (!servisJenis.trim()) {
      return alert("Jenis servis wajib diisi (misal: Ganti Oli, Uji Emisi, Servis Berkala).");
    }
    if (isUploadingFotoEmisi) {
      return alert("Tunggu foto selesai diunggah dulu.");
    }
    setIsSavingServis(true);
    try {
      await addDoc(collection(db, "kendaraan_service_logs"), {
        kendaraan_id: kendaraanId,
        kendaraan: kendaraan,
        tanggal: todayISO,
        jenis_service: servisJenis.trim(),
        deskripsi: servisDeskripsi.trim() || "-",
        biaya: servisBiaya.trim() || "-",
        foto_emisi_url: fotoEmisi || "",
        dicatat_oleh: activeDriver,
        waktu_catat: serverTimestamp(),
      });
      alert("✅ Laporan servis/uji emisi berhasil disimpan! Bisa dicek Admin di Riwayat Kendaraan.");
      setServisJenis("");
      setServisDeskripsi("");
      setServisBiaya("");
      setFotoEmisi("");
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan laporan servis.");
    } finally {
      setIsSavingServis(false);
    }
  };

  // 11. Catat Odometer Cepat (riwayat odometer periodik, terpisah dari KM per-perjalanan di Form Bawa Armada)
  const handleSubmitOdometer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraanId) {
      return alert("Pilih kendaraan dulu di form Bawa Armada di atas.");
    }
    if (!odometerInput.trim()) {
      return alert("Isi angka odometer dulu.");
    }
    setIsSavingOdometer(true);
    try {
      await addDoc(collection(db, "kendaraan_odometer_logs"), {
        kendaraan_id: kendaraanId,
        kendaraan: kendaraan,
        odometer: odometerInput.trim(),
        tanggal: todayISO,
        dicatat_oleh: activeDriver,
        waktu_catat: serverTimestamp(),
      });
      alert("✅ Odometer berhasil dicatat!");
      setOdometerInput("");
    } catch (error) {
      console.error(error);
      alert("Gagal mencatat odometer.");
    } finally {
      setIsSavingOdometer(false);
    }
  };

  // 💡 HANDLERS MULTI-ROW OVERTIME
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
      return alert("Mohon lengkapi seluruh kolom tanggal, jam, dan keterangan lembur yang Anda tambahkan!");
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
      alert(`✅ Berhasil! ${formLemburItems.length} klaim lembur Anda untuk periode ${periodeLembur} telah dikirim ke Admin GA.`);
      setFormLemburItems([{ tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Perjalanan Dinas Luar Kota / Lembur", alasan: "Antar Jemput Manajemen" }]);
      setActiveModal("none");
    } catch (error) {
      console.error(error);
      alert("❌ Gagal mengirim rekapan klaim lembur.");
    } finally {
      setIsLemburLoading(false);
    }
  };

  const formatWaktu = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return ts.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const sharedInputStyle = {
    width: "100%", padding: "16px", borderRadius: "14px", border: "1px solid #cbd5e0",
    fontSize: "15px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const,
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s", color: "#2d3748"
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f1f5f9", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "100px" }}>

      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ fontWeight: "900", color: "#e53e3e", fontSize: "18px", letterSpacing: "1px" }}>SIBM <span style={{color:"#2d3748"}}>DRIVER</span></div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={handleLogout} style={{ background: "#fff5f5", color: "#e53e3e", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", border: "1px solid #fed7d7", cursor: "pointer" }}>
            Keluar ➔
          </button>
        </div>
      </div>

      {/* 🔹 HERO SECTION PROFILE */}
      <div style={{ background: "linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%)", padding: "30px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(43, 108, 176, 0.2)" }}>
        <div style={{ fontSize: "50px", marginBottom: "10px" }}>🧑‍✈️</div>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "22px", fontWeight: "900" }}>Halo, {activeDriver.split(" ")[0]}!</h1>
        <p style={{ margin: "0 0 15px 0", fontSize: "13px", opacity: 0.9 }}>Dashboard Operasional Pengemudi</p>
        <div style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 20px", borderRadius: "50px", fontSize: "12px", fontWeight: "bold", display: "inline-block", border: "1px solid rgba(255,255,255,0.3)" }}>
          {waktuSekarang}
        </div>
      </div>

      <div style={{ maxWidth: "500px", margin: "-30px auto 0", padding: "0 15px", display: "flex", flexDirection: "column", gap: "20px", position: "relative", zIndex: 10 }}>

        {/* 🔹 CARD 1: STATUS KESIAGAAN INSTAN */}
        <div style={{ background: "white", padding: "20px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, color: "#2d3748", fontSize: "15px", fontWeight: "800" }}>📡 Status Anda Saat Ini:</h3>
            <span style={{ fontSize: "11px", fontWeight: "bold", padding: "6px 12px", borderRadius: "8px", background: statusTerkini === "Standby" ? "#c6f6d5" : statusTerkini === "Keluar Beroperasi" ? "#fed7d7" : "#e2e8f0", color: statusTerkini === "Standby" ? "#22543d" : statusTerkini === "Keluar Beroperasi" ? "#9b2c2c" : "#4a5568" }}>
              {statusTerkini === "Standby" ? "🟢 STANDBY" : statusTerkini === "Keluar Beroperasi" ? "🔴 KELUAR" : "⚪ OFF DUTY"}
            </span>
          </div>

          <p style={{ fontSize: "12px", color: "#718096", marginBottom: "15px", lineHeight: "1.5" }}>Tekan tombol di bawah jika Anda keluar/pulang <b>tanpa membawa armada kantor</b> (misal: naik motor/kendaraan pribadi).</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button disabled={isLoadingPersonel} onClick={() => handleUpdateStatusPersonel("Keluar Beroperasi")} style={{ padding: "14px", background: "#fff5f5", color: "#c53030", border: "2px solid #feb2b2", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", transition: "0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
              <span style={{ fontSize: "20px" }}>🏃‍♂️</span> Keluar Pos
            </button>
            <button disabled={isLoadingPersonel} onClick={() => handleUpdateStatusPersonel("Standby")} style={{ padding: "14px", background: "#f0fff4", color: "#2f855a", border: "2px solid #9ae6b4", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", transition: "0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
              <span style={{ fontSize: "20px" }}>🛋️</span> Kembali Standby
            </button>
          </div>
        </div>

        {/* 🔹 CARD 2: FORM BAWA KENDARAAN */}
        <div style={{ background: "white", padding: "25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "16px", fontWeight: "900", borderBottom: "2px solid #edf2f7", paddingBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{background: "#ebf8ff", padding: "6px", borderRadius: "8px"}}>🚙</span> Form Bawa Armada
          </h3>

          {kendaraanMaster.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#a0aec0", fontSize: "13px", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e0" }}>
              Belum ada data kendaraan. Hubungi Admin untuk menambahkan kendaraan di Master Data.
            </div>
          ) : (
            <form onSubmit={handleSubmitMobil} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>PILIH MOBIL OPERASIONAL *</label>
                <select value={kendaraanId} onChange={(e) => setKendaraanId(e.target.value)} style={{...sharedInputStyle, fontWeight:"bold", border: "2px solid #cbd5e0"}}>
                  {kendaraanMaster.map(mobil => <option key={mobil.id} value={mobil.id}>{mobil.kendaraan}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>AKTIVITAS *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div onClick={() => setStatusMobil("Keluar Beroperasi")} style={{ padding: "12px", borderRadius: "12px", cursor: "pointer", textAlign: "center", fontWeight: "bold", fontSize: "13px", border: statusMobil === "Keluar Beroperasi" ? "2px solid #fc8181" : "1px solid #e2e8f0", background: statusMobil === "Keluar Beroperasi" ? "#fff5f5" : "#f8fafc", color: statusMobil === "Keluar Beroperasi" ? "#c53030" : "#718096" }}>
                    🛫 Keluar Pool
                  </div>
                  <div onClick={() => setStatusMobil("Tiba di Kantor (Standby)")} style={{ padding: "12px", borderRadius: "12px", cursor: "pointer", textAlign: "center", fontWeight: "bold", fontSize: "13px", border: statusMobil === "Tiba di Kantor (Standby)" ? "2px solid #68d391" : "1px solid #e2e8f0", background: statusMobil === "Tiba di Kantor (Standby)" ? "#f0fff4" : "#f8fafc", color: statusMobil === "Tiba di Kantor (Standby)" ? "#22543d" : "#718096" }}>
                    🛬 Tiba (Selesai)
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>TUJUAN PERJALANAN</label>
                <textarea placeholder={statusMobil === "Keluar Beroperasi" ? "Wajib diisi..." : "Contoh: Selesai antar manajemen..."} value={tujuan} onChange={(e) => setTujuan(e.target.value)} style={{ ...sharedInputStyle, height: "70px", resize: "none" }} />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>ANGKA SPEEDOMETER (KM) AWAL/AKHIR</label>
                <input type="number" placeholder="Contoh: 45200" value={kilometer} onChange={(e) => setKilometer(e.target.value)} style={{...sharedInputStyle, fontSize: "18px", fontWeight: "bold"}} />
              </div>

              <button type="submit" disabled={isLoadingMobil} style={{ width: "100%", padding: "18px", background: "#2b6cb0", color: "white", border: "none", borderRadius: "14px", fontWeight: "900", fontSize: "15px", cursor: isLoadingMobil ? "not-allowed" : "pointer", marginTop: "5px", boxShadow: "0 4px 15px rgba(43, 108, 176, 0.3)" }}>
                {isLoadingMobil ? "Menyimpan Data..." : "💾 Kirim Laporan Armada"}
              </button>
            </form>
          )}
        </div>

        {/* 🔹 CARD BARU: INSPEKSI MINGGUAN KENDARAAN */}
        {kendaraanId && (
          <div style={{ background: "white", padding: "25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #edf2f7", paddingBottom: "12px", marginBottom: "15px" }}>
              <h3 style={{ margin: 0, color: "#2d3748", fontSize: "16px", fontWeight: "900", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{background: "#f0fff4", padding: "6px", borderRadius: "8px"}}>🔍</span> Inspeksi Mingguan
              </h3>
              <span style={{ fontSize: "10px", fontWeight: "bold", padding: "5px 10px", borderRadius: "8px", background: sudahInspeksiMingguIni ? "#c6f6d5" : "#feebc8", color: sudahInspeksiMingguIni ? "#22543d" : "#9c4221" }}>
                {sudahInspeksiMingguIni ? "✅ SUDAH MINGGU INI" : "⚠️ BELUM MINGGU INI"}
              </span>
            </div>

            <p style={{ fontSize: "12px", color: "#718096", marginBottom: "15px" }}>
              Untuk kendaraan: <b style={{ color: "#2d3748" }}>{kendaraan}</b>
            </p>

            <form onSubmit={handleSubmitInspeksi} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {CHECKLIST_ITEMS.map((item) => (
                <div key={item.key}>
                  <label style={{ display: "block", fontWeight: "700", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>{item.label}</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                    {STATUS_OPSI.map((opsi) => {
                      const dipilih = inspeksiChecklist[item.key] === opsi;
                      const warna = opsi === "Baik" ? "#38a169" : opsi === "Perlu Perhatian" ? "#d69e2e" : "#e53e3e";
                      return (
                        <button
                          type="button"
                          key={opsi}
                          onClick={() => setInspeksiChecklist((prev) => ({ ...prev, [item.key]: opsi }))}
                          style={{
                            padding: "8px 4px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer",
                            border: dipilih ? `2px solid ${warna}` : "1px solid #e2e8f0",
                            background: dipilih ? `${warna}1a` : "#f8fafc",
                            color: dipilih ? warna : "#a0aec0",
                          }}
                        >
                          {opsi}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>CATATAN TAMBAHAN</label>
                <textarea placeholder="Opsional — jelaskan kalau ada item Perlu Perhatian/Rusak" value={catatanInspeksi} onChange={(e) => setCatatanInspeksi(e.target.value)} style={{ ...sharedInputStyle, height: "60px", resize: "none", fontSize: "13px" }} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f8fafc", border: "1px dashed #cbd5e0", borderRadius: "12px", padding: "12px" }}>
                {fotoInspeksi ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoInspeksi} alt="Foto inspeksi" style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: "22px" }}>📸</span>
                )}
                <div style={{ flex: 1 }}>
                  <label style={{ display: "inline-block", padding: "8px 14px", background: "white", border: "1px solid #cbd5e0", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "#4a5568", cursor: "pointer" }}>
                    {isUploadingFotoInspeksi ? "⏳ Mengunggah..." : (fotoInspeksi ? "Ganti Foto" : "Upload Foto (opsional)")}
                    <input type="file" accept="image/*" capture="environment" onChange={handleFotoInspeksiUpload} disabled={isUploadingFotoInspeksi} style={{ display: "none" }} />
                  </label>
                </div>
              </div>

              <button type="submit" disabled={isSavingInspeksi || isUploadingFotoInspeksi} style={{ width: "100%", padding: "16px", background: isSavingInspeksi ? "#a0aec0" : "#38a169", color: "white", border: "none", borderRadius: "14px", fontWeight: "900", fontSize: "14px", cursor: isSavingInspeksi ? "not-allowed" : "pointer", boxShadow: isSavingInspeksi ? "none" : "0 4px 15px rgba(56, 161, 105, 0.3)" }}>
                {isSavingInspeksi ? "Menyimpan..." : "✅ Kirim Inspeksi Mingguan"}
              </button>
            </form>
          </div>
        )}

        {/* 🔹 CARD BARU: SERVIS, UJI EMISI & CATAT ODOMETER — biar Driver bisa lapor langsung, gak semua beban nyatet ke Security */}
        {kendaraanId && (
          <div style={{ background: "white", padding: "25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "16px", fontWeight: "900", borderBottom: "2px solid #edf2f7", paddingBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ background: "#ebf8ff", padding: "6px", borderRadius: "8px" }}>🛠️</span> Servis, Uji Emisi &amp; Odometer
            </h3>
            <p style={{ fontSize: "12px", color: "#718096", marginBottom: "15px" }}>
              Untuk kendaraan: <b style={{ color: "#2d3748" }}>{kendaraan}</b> — laporan ini langsung masuk Riwayat Kendaraan yang bisa dicek Admin.
            </p>

            {/* Catat Odometer Cepat */}
            <form onSubmit={handleSubmitOdometer} style={{ display: "flex", gap: "10px", marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px dashed #e2e8f0" }}>
              <input
                type="number" placeholder="Catat odometer terkini (km)" value={odometerInput}
                onChange={(e) => setOdometerInput(e.target.value)}
                style={{ ...sharedInputStyle, flex: 1 }}
              />
              <button type="submit" disabled={isSavingOdometer} style={{ padding: "0 20px", background: isSavingOdometer ? "#a0aec0" : "#2b6cb0", color: "white", border: "none", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: isSavingOdometer ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                {isSavingOdometer ? "..." : "📟 Catat"}
              </button>
            </form>

            {/* Laporan Servis / Uji Emisi */}
            <form onSubmit={handleSubmitServis} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>JENIS SERVIS *</label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {["Ganti Oli", "Uji Emisi", "Servis Berkala", "Ban", "Rem", "Lainnya"].map(j => (
                    <button
                      key={j} type="button" onClick={() => setServisJenis(j)}
                      style={{ padding: "8px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", border: servisJenis === j ? "2px solid #3182ce" : "1px solid #e2e8f0", background: servisJenis === j ? "#ebf8ff" : "#f8fafc", color: servisJenis === j ? "#2b6cb0" : "#718096" }}
                    >
                      {j}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>DESKRIPSI</label>
                <textarea placeholder="Contoh: Ganti oli mesin + filter di bengkel resmi" value={servisDeskripsi} onChange={(e) => setServisDeskripsi(e.target.value)} style={{ ...sharedInputStyle, height: "60px", resize: "none", fontSize: "13px" }} />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>BIAYA (OPSIONAL)</label>
                <input type="text" placeholder="Contoh: 350000" value={servisBiaya} onChange={(e) => setServisBiaya(e.target.value)} style={sharedInputStyle} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f8fafc", border: "1px dashed #cbd5e0", borderRadius: "12px", padding: "12px" }}>
                {fotoEmisi ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoEmisi} alt="Foto bukti uji emisi" style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: "22px" }}>📸</span>
                )}
                <div style={{ flex: 1 }}>
                  <label style={{ display: "inline-block", padding: "8px 14px", background: "white", border: "1px solid #cbd5e0", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "#4a5568", cursor: "pointer" }}>
                    {isUploadingFotoEmisi ? "⏳ Mengunggah..." : (fotoEmisi ? "Ganti Foto Bukti" : "Upload Bukti Servis/Emisi (opsional)")}
                    <input type="file" accept="image/*" capture="environment" onChange={handleFotoEmisiUpload} disabled={isUploadingFotoEmisi} style={{ display: "none" }} />
                  </label>
                </div>
              </div>

              <button type="submit" disabled={isSavingServis || isUploadingFotoEmisi} style={{ width: "100%", padding: "16px", background: isSavingServis ? "#a0aec0" : "#dd6b20", color: "white", border: "none", borderRadius: "14px", fontWeight: "900", fontSize: "14px", cursor: isSavingServis ? "not-allowed" : "pointer", boxShadow: isSavingServis ? "none" : "0 4px 15px rgba(221, 107, 32, 0.3)" }}>
                {isSavingServis ? "Menyimpan..." : "✅ Kirim Laporan Servis"}
              </button>
            </form>
          </div>
        )}

        {/* 🔹 CARD 3: RIWAYAT SAYA HARI INI */}
        <div style={{ background: "white", padding: "20px", borderRadius: "24px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "14px", fontWeight: "800" }}>🕒 Riwayat Armada Terakhir Anda</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {riwayatKu.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px", color: "#a0aec0", fontSize: "13px", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e0" }}>Belum ada log armada dari Anda.</div>
            ) : (
              riwayatKu.map((log) => {
                const isStandby = log.status_kendaraan.includes("Standby");
                return (
                  <div key={log.id} style={{ padding: "12px", border: "1px solid #edf2f7", borderRadius: "12px", background: isStandby ? "#f0fff4" : "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                      <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "13px" }}>{log.kendaraan.split(" - ")[0]}</span>
                      <span style={{ fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", background: isStandby ? "#c6f6d5" : "#fed7d7", color: isStandby ? "#22543d" : "#9b2c2c" }}>
                        {isStandby ? "TIBA" : "KELUAR"}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#4a5568", fontStyle: "italic", marginBottom: "5px" }}>&quot;{log.tujuan_keperluan}&quot;</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#a0aec0", fontWeight: "bold" }}>
                      <span>📟 KM: {log.kilometer_kendaraan}</span>
                      <span>{formatWaktu(log.waktu_catat)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* 💡 FLOATING ACTION BUTTON (FAB) UNTUK KLAIM LEMBUR */}
      <button
        onClick={() => setActiveModal("lembur")}
        style={{
          position: "fixed",
          bottom: "30px",
          right: "30px",
          background: "#d69e2e",
          color: "white",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          border: "none",
          boxShadow: "0 10px 25px rgba(214, 158, 46, 0.5)",
          cursor: "pointer",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "28px",
          zIndex: 90,
          transition: "transform 0.2s"
        }}
        onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.1)"}
        onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
        title="Ajukan Lembur / Perjalanan Dinas"
      >
        ⏱️
      </button>

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

              {/* Pilihan Periode Cut-Off Gaji */}
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

              {/* Loop Form Dinamis */}
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
