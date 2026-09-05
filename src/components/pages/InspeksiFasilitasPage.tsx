"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, doc, getDoc, getDocs, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { kirimEmail } from "@/lib/notify";
import { buildRequestBaruEmailHtml } from "@/lib/emailTemplates";
import { useToast } from "@/components/ui/ToastProvider";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan halaman OB lain
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconSearch = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
const IconMapPin = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.7 7-12a7 7 0 1 0-14 0c0 5.3 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
const IconAlertTriangle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 4.5 2.9 18a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.5 4.5a2 2 0 0 0-3 0z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
const IconCamera = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A1.5 1.5 0 0 1 9.5 3.6h5a1.5 1.5 0 0 1 1.3.8L17 6h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
);
const IconCheck = ({ size = 13, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const IconX = ({ size = 13, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
);
const IconMinus = ({ size = 13, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconInbox = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);

// ==========================================
// KONFIGURASI FASILITAS PER AREA
// Disederhanakan atas permintaan user: cukup peralatan dapur + genset (bukan lagi daftar
// generik toilet/meja/kursi/AC/dll) -- sama untuk SEMUA area, item yang gak relevan/gak ada
// fisiknya di area tertentu (mis. Genset di luar Basement) tinggal dinilai "Tidak Ada" (N/A).
// "dll fasilitas gedung lainnya" ditangani lewat tombol "+ Tambah Fasilitas Lain" di form
// (item custom dgn nama bebas), bukan hardcode semua kemungkinan fasilitas gedung.
// ==========================================
const FASILITAS_DEFAULT = ["Kulkas", "Dispenser Pantry Lantai 1", "Dispenser Pantry Lantai 2", "Genset (Tugas Khusus)"];
function getFasilitasUntukArea(): string[] {
  return FASILITAS_DEFAULT;
}

type Kondisi = "Baik" | "Rusak" | "Tidak Ada";

interface HasilItem {
  nama: string;
  kondisi: Kondisi | "";
  catatan: string;
  foto: string;
}

interface InspeksiLog {
  id: string;
  area: string;
  pic_bertugas: string;
  minggu_mulai: string;
  waktu_selesai: Timestamp | null;
  hasil: { nama: string; kondisi: Kondisi; catatan: string; foto: string }[];
}

// ==========================================
// HELPER TANGGAL — WITA (Asia/Makassar), pola sama dengan halaman OB lain (hindari bug
// UTC dari toISOString()). "Minggu berjalan" dihitung dari hari Senin (awal minggu ISO).
// ==========================================
function getTodayISOLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
// OB & CS tidak ada jadwal di akhir pekan -- jaga-jaga kalau daily_plots weekend kebetulan
// masih nyimpan data lama.
function isWeekend(dateISO: string): boolean {
  const hari = new Date(dateISO + "T00:00:00").getDay();
  return hari === 0 || hari === 6;
}
function toISOFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getSeninMingguIni(): string {
  const d = new Date(`${getTodayISOLocal()}T00:00:00`);
  const dow = d.getDay(); // 0 = Minggu ... 6 = Sabtu
  const mundur = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - mundur);
  return toISOFromDate(d);
}
function formatRentangMinggu(seninISO: string): string {
  const senin = new Date(`${seninISO}T00:00:00`);
  const minggu = new Date(senin);
  minggu.setDate(senin.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return `${fmt(senin)} - ${fmt(minggu)}`;
}

export default function InspeksiFasilitasPage() {
  const router = useRouter();
  const showToast = useToast();

  const [picName, setPicName] = useState("");
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [assignedAreas, setAssignedAreas] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedArea, setSelectedArea] = useState("");

  const [riwayatInspeksi, setRiwayatInspeksi] = useState<InspeksiLog[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  // Diisi ulang tiap kali masuk step 2 (lihat tombol "Mulai Inspeksi") — daftarnya beda-beda
  // per area (getFasilitasUntukArea), jadi gak bisa di-inisialisasi sekali pas mount.
  const [hasilList, setHasilList] = useState<HasilItem[]>([]);

  const seninMingguIni = getSeninMingguIni();

  // ==========================================
  // EFEK 1: Identitas & Data Plotting Hari Ini (dipakai buat batasi pilihan area, sama
  // pola dengan ChecklistOBPage — inspeksi tetap dikerjakan di area yang jadi tanggung
  // jawab hari itu, walau cadence-nya mingguan)
  // ==========================================
  useEffect(() => {
    const muatDataAwal = async () => {
      const nama = localStorage.getItem("pic_nama") || "";
      const dept = (localStorage.getItem("pic_dept") || "").toLowerCase();

      if (!nama || !dept.includes("ob & cs")) {
        showToast("Akses Ditolak! Halaman ini khusus staf OB & CS.", "error");
        setTimeout(() => router.push("/dashboard/ob"), 1200);
        return;
      }
      setPicName(nama);

      try {
        const todayISO = getTodayISOLocal();
        if (!isWeekend(todayISO)) {
          const plotSnap = await getDoc(doc(db, "daily_plots", todayISO));
          if (plotSnap.exists()) {
            const plots = (plotSnap.data().plot_lantai || {}) as Record<string, string>;
            const lantaiKu = Object.keys(plots).filter((l) => plots[l] === nama || plots[l] === "Semua / All");
            setAssignedAreas(lantaiKu);
            if (lantaiKu.length > 0) setSelectedArea(lantaiKu[0]);
          }
        }
      } catch (error) {
        console.error("Gagal memuat data plotting:", error);
      } finally {
        setIsPageLoading(false);
      }
    };
    muatDataAwal();
  }, [router]);

  // ==========================================
  // EFEK 2: Listener Riwayat Inspeksi (punya PIC ini sendiri)
  // ==========================================
  useEffect(() => {
    if (!picName) return;
    const q = query(collection(db, "inspeksi_fasilitas"), where("pic_bertugas", "==", picName), orderBy("waktu_selesai", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const logs: InspeksiLog[] = [];
      snap.forEach((d) => logs.push({ ...d.data(), id: d.id } as InspeksiLog));
      setRiwayatInspeksi(logs);
    });
    return () => unsub();
  }, [picName]);

  // Sudah ada inspeksi buat area terpilih minggu ini? (info aja, gak nge-block submit ulang)
  const sudahInspeksiMingguIni = riwayatInspeksi.find((l) => l.area === selectedArea && l.minggu_mulai === seninMingguIni);

  // ==========================================
  // UPLOAD FOTO
  // ==========================================
  async function uploadToCloudinary(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
    formData.append("folder", "sibm/inspeksi-fasilitas");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
    if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
    const data = await res.json();
    return data.secure_url as string;
  }

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setUploadingIdx(index);
          try {
            const url = await uploadToCloudinary(blob);
            setHasilList((prev) => { const next = [...prev]; next[index] = { ...next[index], foto: url }; return next; });
          } catch (err) {
            console.error(err);
            showToast("Gagal upload foto, coba lagi.", "error");
          } finally {
            setUploadingIdx(null);
          }
        }, "image/jpeg", 0.6);
      };
      if (typeof ev.target?.result === "string") img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const ubahKondisi = (index: number, kondisi: Kondisi) => {
    setHasilList((prev) => { const next = [...prev]; next[index] = { ...next[index], kondisi }; return next; });
  };
  const ubahCatatan = (index: number, catatan: string) => {
    setHasilList((prev) => { const next = [...prev]; next[index] = { ...next[index], catatan }; return next; });
  };
  const tambahFasilitasLain = () => {
    setHasilList((prev) => [...prev, { nama: "", kondisi: "", catatan: "", foto: "" }]);
  };
  const ubahNamaCustom = (index: number, nama: string) => {
    setHasilList((prev) => { const next = [...prev]; next[index] = { ...next[index], nama }; return next; });
  };
  const hapusItemCustom = (index: number) => {
    setHasilList((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setHasilList([]);
    setStep(1);
  };

  // ==========================================
  // SUBMIT
  // ==========================================
  const handleSubmit = async () => {
    // Item standar wajib semua dinilai; item custom yang belum diisi nama/kondisi diabaikan (opsional).
    const jumlahStandar = getFasilitasUntukArea().length;
    const itemStandar = hasilList.slice(0, jumlahStandar);
    const itemCustomTerisi = hasilList.slice(jumlahStandar).filter((h) => h.nama.trim() && h.kondisi);

    if (itemStandar.some((h) => !h.kondisi)) {
      return showToast("Mohon nilai kondisi (Baik/Rusak/Tidak Ada) untuk semua fasilitas standar sebelum mengirim.", "warning");
    }
    const semuaDinilai = [...itemStandar, ...itemCustomTerisi] as { nama: string; kondisi: Kondisi; catatan: string; foto: string }[];
    const rusakTanpaCatatan = semuaDinilai.find((h) => h.kondisi === "Rusak" && !h.catatan.trim());
    if (rusakTanpaCatatan) {
      return showToast(`Mohon isi keterangan kerusakan untuk "${rusakTanpaCatatan.nama}" sebelum mengirim.`, "warning");
    }

    setIsLoading(true);
    try {
      await addDoc(collection(db, "inspeksi_fasilitas"), {
        area: selectedArea,
        pic_bertugas: picName,
        minggu_mulai: seninMingguIni,
        waktu_selesai: serverTimestamp(),
        hasil: semuaDinilai,
      });

      // Fasilitas yang Rusak tetap diteruskan ke Helpdesk Admin GA — bagian yang dipertahankan
      // dari fitur lama, cuma sumbernya sekarang checklist terstruktur, bukan form bebas.
      // Sekalian kirim email ke Admin GA (sebelumnya cuma masuk tabel, gak ada notifikasi
      // email sama sekali buat temuan dari inspeksi) supaya langsung ketahuan, bukan cuma
      // nongol diam-diam di tabel admin/helpdesk.
      const rusak = semuaDinilai.filter((h) => h.kondisi === "Rusak");
      await Promise.all(rusak.map((h) => addDoc(collection(db, "helpdesk_tickets"), {
        nama_pelapor: picName,
        departemen: "OB & CS",
        waktu_lapor: serverTimestamp(),
        lokasi: `${selectedArea} - ${h.nama}`,
        deskripsi: `[Temuan Inspeksi Mingguan] ${h.catatan}`,
        foto_awal: h.foto || "",
        status: "Menunggu",
      })));

      if (rusak.length > 0) {
        try {
          const adminSnap = await getDocs(query(collection(db, "users_master"), where("departemen", "==", "Admin GA")));
          const daftarAdminGA = adminSnap.docs.map((d) => d.data() as { nama: string; email?: string });
          for (const h of rusak) {
            const htmlEmail = buildRequestBaruEmailHtml({
              jenisRequest: "Laporan Kerusakan (Inspeksi Mingguan)",
              namaPemohon: picName,
              departemen: "OB & CS",
              rows: [
                { label: "Lokasi", value: `${selectedArea} - ${h.nama}` },
                { label: "Keterangan", value: h.catatan },
              ],
              fotoUrl: h.foto || undefined,
            });
            for (const admin of daftarAdminGA) {
              if (!admin.email) continue;
              const hasilEmail = await kirimEmail(admin.email, `Laporan Kerusakan Baru: ${selectedArea} - ${h.nama}`, htmlEmail, admin.nama);
              if (!hasilEmail.sukses) console.error(`[notify] Gagal kirim email temuan inspeksi ke ${admin.nama}:`, hasilEmail.pesanError);
            }
          }
        } catch (emailError) {
          // Best-effort -- kegagalan kirim email TIDAK boleh membatalkan laporan inspeksi yang
          // sudah kesimpan (helpdesk_tickets di atas sudah berhasil, itu yang lebih penting).
          console.error("[notify] Gagal memproses notifikasi email temuan inspeksi:", emailError);
        }
      }

      showToast(rusak.length > 0
        ? `Inspeksi terkirim! ${rusak.length} temuan rusak sudah diteruskan ke Admin GA.`
        : "Inspeksi terkirim! Semua fasilitas dalam kondisi baik.", "success");
      resetForm();
      setActiveTab("history");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      showToast("Terjadi kesalahan sistem saat mengirim inspeksi.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const formatJam = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const rootTokenCSS = `
    :root {
      --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
      --bg: #f7f6f5; --surface: #ffffff;
      --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
      --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
      --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
    }
  `;

  if (isPageLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "var(--bg)", fontFamily: "'Inter', sans-serif" }}>
        <style dangerouslySetInnerHTML={{ __html: `${rootTokenCSS} @keyframes spin { to { transform: rotate(360deg); } }` }} />
        <div style={{ width: "44px", height: "44px", borderRadius: "50%", border: "4px solid var(--info-50)", borderTopColor: "var(--info)", animation: "spin 0.8s linear infinite", marginBottom: "16px" }} />
        <div style={{ fontWeight: "bold", fontSize: "14px", color: "var(--ink-soft)" }}>Menyiapkan Inspeksi Fasilitas...</div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>

      <style dangerouslySetInnerHTML={{__html: `
        ${rootTokenCSS}
        * { box-sizing: border-box; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .top-bar {
          display: flex; justify-content: space-between; align-items: center; padding: 14px 20px;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line);
          position: sticky; top: 0; z-index: 20;
        }
        .back-btn {
          background: var(--bg); border: 1px solid var(--line); border-radius: 10px; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-soft); transition: 0.2s;
        }
        .back-btn:hover { background: var(--line); }
        .tab-switch { background: var(--bg); padding: 4px; border-radius: 10px; display: flex; gap: 4px; }
        .tab-btn { border: none; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; background: transparent; color: var(--muted); transition: all 0.2s; display: flex; align-items: center; gap: 6px; font-family: inherit; }
        .tab-btn.active { background: var(--surface); color: var(--info); box-shadow: 0 2px 4px rgba(0,0,0,0.06); }
        .icon-chip { display: inline-flex; align-items: center; justify-content: center; border-radius: 16px; flex-shrink: 0; }
        .fasilitas-row { background: var(--surface); padding: 16px; border-radius: 16px; box-shadow: 0 6px 12px -4px rgba(0,0,0,0.05); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 12px; }
        .kondisi-btn { display: flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); font-weight: bold; font-size: 12.5px; cursor: pointer; font-family: inherit; transition: 0.15s; }
        .kondisi-btn.baik.active { border-color: var(--ok); background: var(--ok); color: white; }
        .kondisi-btn.rusak.active { border-color: var(--red-600); background: var(--red-600); color: white; }
        .kondisi-btn.tidakada.active { border-color: var(--muted); background: var(--muted); color: white; }
        .foto-dropzone { width: 90px; height: 90px; background: var(--bg); border: 1px dashed var(--line); border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 10px; font-weight: bold; color: var(--muted); flex-shrink: 0; }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="top-bar">
        <button className="back-btn" onClick={() => router.push("/dashboard/ob")}><IconArrowLeft size={16} /></button>
        <div className="tab-switch">
          <button onClick={() => setActiveTab("form")} className={`tab-btn ${activeTab === "form" ? "active" : ""}`}>
            <IconSearch size={14} /> Inspeksi
          </button>
          <button onClick={() => setActiveTab("history")} className={`tab-btn ${activeTab === "history" ? "active" : ""}`}>
            <IconClock size={14} /> Riwayat ({riwayatInspeksi.length})
          </button>
        </div>
      </div>

      <div style={{ maxWidth: "640px", margin: "30px auto 0", padding: "0 20px" }}>

        {/* ========================================================================================= */}
        {/* TAB 1: FORM INSPEKSI */}
        {/* ========================================================================================= */}
        {activeTab === "form" && (
          <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
            {step === 1 && (
              <div style={{ background: "var(--surface)", padding: "40px 25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", textAlign: "center", borderTop: "6px solid var(--info)" }}>
                {assignedAreas.length > 0 ? (
                  <>
                    <div className="icon-chip" style={{ width: "72px", height: "72px", background: "var(--info-50)", color: "var(--info)", margin: "0 auto 18px" }}><IconSearch size={32} /></div>
                    <h2 style={{ margin: "0 0 10px 0", color: "var(--ink)", fontSize: "22px" }}>Inspeksi Fasilitas Mingguan</h2>
                    <p style={{ color: "var(--muted)", marginBottom: "10px", fontSize: "14px", lineHeight: "1.5" }}>Cek kondisi fasilitas gedung di area Anda — dilakukan 1x seminggu.</p>
                    <div style={{ display: "inline-block", background: "var(--bg)", color: "var(--ink-soft)", fontSize: "11px", fontWeight: "bold", padding: "5px 12px", borderRadius: "20px", marginBottom: "25px" }}>
                      Minggu ini: {formatRentangMinggu(seninMingguIni)}
                    </div>

                    <select
                      value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}
                      style={{ width: "100%", padding: "18px", borderRadius: "12px", border: "2px solid var(--info)", fontSize: "16px", fontWeight: "bold", color: "var(--info)", marginBottom: "15px", cursor: "pointer", background: "var(--info-50)", outline: "none", appearance: "none", textAlign: "center" }}
                    >
                      {assignedAreas.map((area) => <option key={area} value={area}>{area}</option>)}
                    </select>

                    {sudahInspeksiMingguIni && (
                      <div style={{ background: "var(--ok-50)", color: "var(--ok)", fontSize: "12px", fontWeight: "bold", padding: "10px 12px", borderRadius: "10px", marginBottom: "20px" }}>
                        ✓ Area ini sudah diinspeksi minggu ini ({formatJam(sudahInspeksiMingguIni.waktu_selesai)}). Masih bisa diulang kalau perlu update.
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setHasilList(getFasilitasUntukArea().map((nama) => ({ nama, kondisi: "", catatan: "", foto: "" })));
                        setStep(2);
                      }}
                      style={{ width: "100%", padding: "18px", background: "var(--info)", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: "pointer", boxShadow: "0 10px 15px -3px rgba(37,99,235,0.3)" }}
                    >
                      Mulai Inspeksi ➔
                    </button>
                  </>
                ) : (
                  <div style={{ padding: "20px" }}>
                    <div className="icon-chip" style={{ width: "72px", height: "72px", background: "var(--red-50)", color: "var(--red-600)", margin: "0 auto 18px" }}><IconAlertTriangle size={34} /></div>
                    <h3 style={{ color: "var(--red-700)", margin: "0 0 10px 0", fontSize: "20px" }}>Anda Tidak Memiliki Jadwal</h3>
                    <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0, lineHeight: "1.6" }}>
                      Koordinator belum memetakan lokasi kerja Anda untuk hari ini. Silakan hubungi koordinator Anda untuk mendapatkan plot area.
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
                <div style={{ background: "var(--surface)", padding: "20px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--line)", borderLeft: "6px solid var(--info)" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Area Inspeksi:</span>
                    <h2 style={{ margin: "5px 0 0 0", color: "var(--ink)", fontSize: "18px" }}>{selectedArea}</h2>
                  </div>
                  <button onClick={() => setStep(1)} style={{ background: "var(--bg)", border: "1px solid var(--line)", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)" }}>Ganti Area</button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {hasilList.map((h, index) => {
                    const isCustom = index >= getFasilitasUntukArea().length;
                    return (
                      <div key={index} className="fasilitas-row">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          {isCustom ? (
                            <input
                              type="text" placeholder="Nama fasilitas lain..." value={h.nama}
                              onChange={(e) => ubahNamaCustom(index, e.target.value)}
                              style={{ flex: "1 1 160px", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "14px", fontWeight: "bold", color: "var(--ink)", outline: "none" }}
                            />
                          ) : (
                            <span style={{ fontWeight: "bold", fontSize: "15px", color: "var(--ink)" }}>{h.nama}</span>
                          )}
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button type="button" onClick={() => ubahKondisi(index, "Baik")} className={`kondisi-btn baik ${h.kondisi === "Baik" ? "active" : ""}`}><IconCheck /> Baik</button>
                            <button type="button" onClick={() => ubahKondisi(index, "Rusak")} className={`kondisi-btn rusak ${h.kondisi === "Rusak" ? "active" : ""}`}><IconX /> Rusak</button>
                            <button type="button" onClick={() => ubahKondisi(index, "Tidak Ada")} className={`kondisi-btn tidakada ${h.kondisi === "Tidak Ada" ? "active" : ""}`}><IconMinus /> N/A</button>
                            {isCustom && (
                              <button type="button" onClick={() => hapusItemCustom(index)} className="kondisi-btn" style={{ color: "var(--red-600)" }} title="Hapus item"><IconTrash size={13} /></button>
                            )}
                          </div>
                        </div>

                        {h.kondisi === "Rusak" && (
                          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", background: "var(--red-50)", padding: "12px", borderRadius: "12px", border: "1px solid rgba(220,38,38,0.2)" }}>
                            <textarea
                              placeholder="Keterangan kerusakan (wajib)... contoh: keran bocor, air netes terus."
                              value={h.catatan} onChange={(e) => ubahCatatan(index, e.target.value)}
                              style={{ flex: 1, minHeight: "60px", padding: "10px", borderRadius: "8px", border: "1px solid rgba(220,38,38,0.25)", fontSize: "13px", resize: "none", outline: "none", background: "var(--surface)" }}
                            />
                            <label className="foto-dropzone">
                              {h.foto ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={h.foto} alt="Bukti" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "11px" }} />
                              ) : uploadingIdx === index ? (
                                <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "3px solid rgba(220,38,38,0.2)", borderTopColor: "var(--red-600)", animation: "spin 0.8s linear infinite" }} />
                              ) : (
                                <><IconCamera size={18} color="var(--red-600)" /> Foto</>
                              )}
                              <input type="file" accept="image/*" onChange={(e) => handleFotoChange(e, index)} style={{ display: "none" }} disabled={uploadingIdx === index} />
                            </label>
                          </div>
                        )}

                        {/* Foto tetap bisa ditambahkan buat kondisi Baik/N/A juga (opsional, bukan cuma
                            pas Rusak) -- dokumentasi kondisi fasilitas gak harus nunggu rusak dulu. */}
                        {(h.kondisi === "Baik" || h.kondisi === "Tidak Ada") && (
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <label className="foto-dropzone">
                              {h.foto ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={h.foto} alt="Bukti" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "11px" }} />
                              ) : uploadingIdx === index ? (
                                <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "3px solid var(--line)", borderTopColor: "var(--ok)", animation: "spin 0.8s linear infinite" }} />
                              ) : (
                                <><IconCamera size={18} color="var(--muted)" /> Foto</>
                              )}
                              <input type="file" accept="image/*" onChange={(e) => handleFotoChange(e, index)} style={{ display: "none" }} disabled={uploadingIdx === index} />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button type="button" onClick={tambahFasilitasLain} style={{ width: "100%", padding: "13px", background: "var(--surface)", color: "var(--info)", border: "2px dashed var(--info)", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", marginTop: "12px" }}>
                  + Tambah Fasilitas Lain
                </button>

                <button
                  onClick={handleSubmit} disabled={isLoading}
                  style={{ width: "100%", padding: "20px", background: isLoading ? "#a0aec0" : "var(--info)", color: "white", border: "none", borderRadius: "16px", fontWeight: "bold", fontSize: "16px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "20px", boxShadow: isLoading ? "none" : "0 10px 20px -5px rgba(37,99,235,0.4)" }}
                >
                  {isLoading ? "Mengirim Inspeksi..." : "Kirim Hasil Inspeksi"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================================= */}
        {/* TAB 2: RIWAYAT INSPEKSI */}
        {/* ========================================================================================= */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeIn 0.3s ease-in-out" }}>
            {riwayatInspeksi.length > 0 ? riwayatInspeksi.map((log) => {
              const jumlahRusak = log.hasil.filter((h) => h.kondisi === "Rusak").length;
              return (
                <div key={log.id} style={{ background: "var(--surface)", borderRadius: "20px", padding: "22px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", border: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h3 style={{ margin: "0 0 4px 0", color: "var(--ink)", fontSize: "17px", display: "flex", alignItems: "center", gap: "6px" }}><IconMapPin size={15} color="var(--info)" /> {log.area}</h3>
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>Minggu {formatRentangMinggu(log.minggu_mulai)} &middot; {formatJam(log.waktu_selesai)}</span>
                    </div>
                    <span className="icon-chip" style={jumlahRusak > 0 ? { padding: "5px 11px", background: "var(--red-50)", color: "var(--red-600)", fontSize: "11px", fontWeight: 800 } : { padding: "5px 11px", background: "var(--ok-50)", color: "var(--ok)", fontSize: "11px", fontWeight: 800 }}>
                      {jumlahRusak > 0 ? `${jumlahRusak} Rusak` : "Semua Baik"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {log.hasil.map((h, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderRadius: "10px", background: h.kondisi === "Rusak" ? "var(--red-50)" : h.kondisi === "Tidak Ada" ? "var(--bg)" : "var(--ok-50)" }}>
                        <span style={{ fontSize: "12.5px", color: "var(--ink)", fontWeight: 600 }}>{h.nama}</span>
                        <span style={{ fontSize: "10px", fontWeight: 800, padding: "3px 8px", borderRadius: "6px", color: "white", background: h.kondisi === "Rusak" ? "var(--red-600)" : h.kondisi === "Tidak Ada" ? "var(--muted)" : "var(--ok)" }}>{h.kondisi.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }) : (
              <div style={{ padding: "60px 20px", textAlign: "center", background: "var(--surface)", borderRadius: "20px", border: "2px dashed var(--line)" }}>
                <div className="icon-chip" style={{ width: "60px", height: "60px", background: "var(--bg)", color: "var(--muted)", margin: "0 auto 15px" }}><IconInbox size={28} /></div>
                <h3 style={{ color: "var(--ink-soft)", margin: "0 0 10px 0" }}>Belum Ada Riwayat</h3>
                <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0 }}>Hasil inspeksi mingguan Anda akan muncul di sini.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
