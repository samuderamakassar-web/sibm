"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, doc, Timestamp } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { kirimEmail } from "../../../lib/notify";
import { buildOvertimeEmailHtml } from "../../../lib/emailTemplates";
import Modal from "../../../components/ui/Modal";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

// ==========================================
// INTERFACES (GABUNGAN GEDUNG & TIM)
// ==========================================
interface OvertimeItemRequest {
  tanggal?: string;
  jam_mulai?: string;
  jam_selesai?: string;
  area_ruangan?: string;
  alasan?: string;
}

interface OvertimeRequest {
  id: string;
  nama_pemohon?: string;
  departemen?: string;
  status?: string;
  waktu_request?: Timestamp | null;
  
  // Format Lembur Tim (Multi-Row / Kolektif)
  periode?: string;
  items?: OvertimeItemRequest[];
  
  // Format Lembur Gedung (Single-Row / Satuan)
  area_ruangan?: string;
  tanggal?: string;
  jam_mulai?: string;
  jam_selesai?: string;
  alasan?: string;
}

interface KontakKaryawan {
  nama: string;
  no_wa?: string;
  email?: string;
}

export default function AdminOvertimePage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const [adminName, setAdminName] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  // States Navigasi Tab
  const [activeTab, setActiveTab] = useState<"GEDUNG" | "TIM">("GEDUNG");

  // States Data Database
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [daftarKontak, setDaftarKontak] = useState<KontakKaryawan[]>([]);
  const [sedangKirimNotif, setSedangKirimNotif] = useState<string | null>(null); // id request yang sedang dikirimi notif

  // States Filter Universal
  const [filterStatus, setFilterStatus] = useState<string>("SEMUA");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // State Filter Khusus Tab Gedung (tidak ada approval lagi, filter yang relevan cuma bulan)
  const [filterBulanGedung, setFilterBulanGedung] = useState<string>("SEMUA");

  // State Filter Khusus Tab Tim
  const [filterPeriode, setFilterPeriode] = useState<string>("SEMUA");

  // State Modal Detail Lemburan (Tab Tim, saat staf input lebih dari 1 baris lembur)
  const [detailModalReq, setDetailModalReq] = useState<OvertimeRequest | null>(null);

  // State loading tombol "Kirim Email Rekap"
  const [sedangSiapkanRekap, setSedangSiapkanRekap] = useState(false);

  useEffect(() => {
    // 1. Verifikasi Akses Admin
    const nama = localStorage.getItem("pic_nama");
    const dept = localStorage.getItem("pic_dept");

    if (!nama || dept !== "Admin GA") {
      router.push("/shift-checkin");
      return;
    }
    
    setTimeout(() => {
      setAdminName(nama);
      setIsReady(true);
    }, 0);

    // 2. Tarik Data Request Overtime Real-time
    const q = query(collection(db, "ga_overtime_requests"), orderBy("waktu_request", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OvertimeRequest));
      setOvertimeRequests(data);
    });

    // 3. Tarik Master Data Karyawan (untuk lookup no_wa/email saat kirim notifikasi)
    const unsubscribeKontak = onSnapshot(collection(db, "employees_directory"), (snapshot) => {
      const data = snapshot.docs.map(d => d.data() as KontakKaryawan);
      setDaftarKontak(data);
    });

    return () => {
      unsubscribe();
      unsubscribeKontak();
    };
  }, [router]);

  // ==========================================
  // PEMISAHAN DATA (GEDUNG vs TIM)
  // ==========================================
  const dataGedung = overtimeRequests.filter(req => !req.periode && !req.items);
  const dataTim = overtimeRequests.filter(req => req.periode && req.items);

  const daftarPeriodeUnik = Array.from(new Set(dataTim.map(req => req.periode).filter(Boolean))) as string[];

  // Bulan unik dari tanggal lembur Gedung (format value "YYYY-MM", dipakai untuk filter & label dropdown)
  const daftarBulanGedungUnik = useMemo(() => {
    const set = new Set(dataGedung.map(req => (req.tanggal || "").slice(0, 7)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [dataGedung]);

  // "Periode aktif" tab Tim: pakai periode yang lagi dipilih di filter, atau kalau "SEMUA" pakai periode
  // pengajuan paling baru (dataTim sudah urut desc dari waktu_request, jadi periode unik pertama = terbaru)
  const periodeAktifUntukEmail = filterPeriode !== "SEMUA" ? filterPeriode : (daftarPeriodeUnik[0] || "");

  // ==========================================
  // HANDLERS AKSI APPROVAL
  // ==========================================
  const handleProcessDecision = async (id: string, nama: string, keputusan: "Approved" | "Rejected") => {
    const namaAman = nama || "Pemohon";
    const yakin = await confirm({
      title: keputusan === "Approved" ? "Setujui Overtime" : "Tolak Overtime",
      message: keputusan === "Approved"
        ? `Apakah Anda yakin ingin MENYETUJUI permohonan overtime dari ${namaAman}?`
        : `Apakah Anda yakin ingin MENOLAK permohonan overtime dari ${namaAman}?`,
      confirmText: keputusan === "Approved" ? "Ya, Setujui" : "Ya, Tolak",
      variant: keputusan === "Approved" ? "default" : "danger",
    });
    if (!yakin) return;

    // Alasan penolakan opsional, ikut dikirim di pesan notifikasi
    let alasanTolak: string | undefined;
    if (keputusan === "Rejected") {
      alasanTolak = window.prompt("Alasan penolakan (opsional, boleh dikosongkan):") || undefined;
    }

    try {
      await updateDoc(doc(db, "ga_overtime_requests", id), {
        status: keputusan
      });
    } catch (error) {
      console.error(error);
      showToast("Gagal memperbarui status permohonan lembur.", "error");
      return; // Jangan lanjut kirim notifikasi jika update status saja sudah gagal
    }

    // Update status berhasil -> lanjut kirim notifikasi WA/Email ke pemohon (best-effort, tidak memblokir UI)
    setSedangKirimNotif(id);
    try {
      const req = overtimeRequests.find(r => r.id === id);
      const tanggalLembur = req?.tanggal || req?.items?.[0]?.tanggal || "-";
      const tanggalFormat = tanggalLembur !== "-" ? new Date(tanggalLembur).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-";
      const jamMulai = req?.jam_mulai || req?.items?.[0]?.jam_mulai || "-";
      const jamSelesai = req?.jam_selesai || req?.items?.[0]?.jam_selesai || "-";
      const departemen = req?.departemen || "";

      await kirimNotifikasiOvertime(namaAman, keputusan, tanggalFormat, alasanTolak, jamMulai, jamSelesai, departemen);
    } finally {
      setSedangKirimNotif(null);
    }
  };

  // Cari kontak (no_wa/email) karyawan berdasarkan nama_pemohon (cocok tanpa peduli besar/kecil huruf)
  const cariKontakKaryawan = (nama: string): KontakKaryawan | undefined => {
    const namaNormal = nama.trim().toLowerCase();
    return daftarKontak.find(k => (k.nama || "").trim().toLowerCase() === namaNormal);
  };

  // Kirim WA + Email ke pemohon overtime sesuai hasil keputusan
  const kirimNotifikasiOvertime = async (
    nama: string,
    keputusan: "Approved" | "Rejected",
    tanggal: string,
    alasanTolak: string | undefined,
    jamMulai: string,
    jamSelesai: string,
    departemen: string
  ) => {
    const kontak = cariKontakKaryawan(nama);

    if (!kontak || !kontak.email) {
      // Nama pemohon tidak ketemu di Master Data Karyawan, atau belum punya email.
      // Tidak menghentikan alur approval -- cukup dicatat agar Admin GA tahu harus hubungi manual.
      console.warn(`[notify] Kontak untuk "${nama}" tidak ditemukan / belum punya email di Master Data Karyawan. Notifikasi dilewati.`);
      return;
    }

    const subjek = `Update Overtime Gedung: ${keputusan === "Approved" ? "Disetujui" : "Ditolak"}`;
    const htmlEmail = buildOvertimeEmailHtml({
      namaPemohon: nama,
      departemen: departemen || undefined,
      tanggal,
      jamMulai,
      jamSelesai,
      status: keputusan,
      alasanTolak: keputusan === "Rejected" ? alasanTolak : undefined,
    });
    const hasilEmail = await kirimEmail(kontak.email, subjek, htmlEmail, nama);
    if (!hasilEmail.sukses) console.error("[notify] Gagal kirim Email overtime:", hasilEmail.pesanError);
  };

  const formatJam = (ts: Timestamp | null | undefined) => ts ? new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  // Format tanggal ISO (YYYY-MM-DD) -> "Senin, 12 Agustus 2026"
  const formatTanggalHari = (iso?: string) => {
    if (!iso) return "-";
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return new Date(y, m - 1, d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  // Label dropdown bulan dari value "YYYY-MM" -> "Agustus 2026"
  const labelBulan = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) return ym;
    return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  };

  // Hitung durasi lembur dalam jam (desimal) dari "HH:MM" - "HH:MM", termasuk lembur lewat tengah malam
  const hitungDurasiJam = (mulai?: string, selesai?: string): number => {
    if (!mulai || !selesai) return 0;
    const [jm, mm] = mulai.split(":").map(Number);
    const [js, ms] = selesai.split(":").map(Number);
    if ([jm, mm, js, ms].some(n => Number.isNaN(n))) return 0;
    let menit = (js * 60 + ms) - (jm * 60 + mm);
    if (menit < 0) menit += 24 * 60; // lewat tengah malam
    return Math.round((menit / 60) * 100) / 100;
  };

  // ==========================================
  // HANDLERS EXPORT EXCEL (TERPISAH, PAKAI SHEETJS BIAR BENERAN .xlsx)
  // ==========================================
  const unduhExcel = (namaFile: string, sheetName: string, headers: string[], rows: (string | number)[][]) => {
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = headers.map(() => ({ wch: 22 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    XLSX.writeFile(workbook, `${namaFile}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleExportGedung = () => {
    const filtered = dataGedung.filter(req => checkFilter(req, false));
    if (filtered.length === 0) return showToast("Data lembur Gedung masih kosong / tidak ada yang cocok dengan filter!", "warning");

    const headers = ["Nama Pemohon", "Aktivitas / Keterangan Lembur", "Tanggal Lembur", "Hari", "Jam Mulai", "Jam Selesai", "Jumlah Jam", "Unit Bisnis / Departemen", "Lantai / Lokasi", "Waktu Pengajuan"];
    const rows = filtered.map(req => [
      req.nama_pemohon || "-",
      req.alasan || "-",
      req.tanggal || "-",
      req.tanggal ? formatTanggalHari(req.tanggal).split(",")[0] : "-",
      req.jam_mulai || "-",
      req.jam_selesai || "-",
      hitungDurasiJam(req.jam_mulai, req.jam_selesai),
      req.departemen || "-",
      req.area_ruangan || "-",
      formatJam(req.waktu_request),
    ]);

    unduhExcel("Laporan_Overtime_Gedung", "Overtime Gedung", headers, rows);
  };

  const handleExportTim = () => {
    const filtered = dataTim.filter(req => checkFilter(req, true));
    if (filtered.length === 0) return showToast("Data permohonan Tim Operasional masih kosong / tidak ada yang cocok dengan filter!", "warning");

    const headers = ["Siklus / Periode", "Nama Staf", "Departemen", "Tanggal Lembur", "Hari", "Jam Mulai", "Jam Selesai", "Jumlah Jam", "Lokasi/Tugas", "Keterangan Lembur", "Status Approval", "Waktu Diajukan"];
    const rows: (string | number)[][] = [];

    filtered.forEach(req => {
      (req.items && req.items.length > 0 ? req.items : []).forEach(item => {
        rows.push([
          req.periode || "-",
          req.nama_pemohon || "-",
          req.departemen || "-",
          item.tanggal || "-",
          item.tanggal ? formatTanggalHari(item.tanggal).split(",")[0] : "-",
          item.jam_mulai || "-",
          item.jam_selesai || "-",
          hitungDurasiJam(item.jam_mulai, item.jam_selesai),
          item.area_ruangan || "-",
          item.alasan || "-",
          req.status || "-",
          formatJam(req.waktu_request),
        ]);
      });
    });

    unduhExcel("Rekap_Lemburan_Kolektif_Tim", "Overtime Tim", headers, rows);
  };

  // ==========================================
  // REKAP PERIODE SELESAI -> KIRIM EMAIL (TAB TIM)
  // ==========================================
  // Sebuah periode dianggap "selesai diproses" kalau tidak ada lagi request berstatus Menunggu di periode itu
  const semuaPeriodeSelesai = (periode: string): boolean => {
    const requestPeriode = dataTim.filter(req => req.periode === periode);
    if (requestPeriode.length === 0) return false;
    return requestPeriode.every(req => req.status === "Approved" || req.status === "Rejected");
  };

  // Susun & unduh excel rekap 1 periode (khusus yang Approved -- ini yang benar-benar lembur & perlu dibayar),
  // lalu buka aplikasi email default supaya tinggal isi penerima & lampirkan file yang baru terunduh.
  // CATATAN: browser tidak bisa melampirkan file ke email secara otomatis (batasan mailto:), jadi file excel-nya
  // diunduh duluan dan admin tinggal drag file itu ke email yang sudah terbuka.
  const handleKirimEmailRekap = () => {
    const periode = periodeAktifUntukEmail;
    if (!periode) return showToast("Belum ada periode lembur Tim yang bisa direkap.", "warning");
    if (!semuaPeriodeSelesai(periode)) return showToast(`Masih ada pengajuan periode "${periode}" yang belum diputuskan (Setujui/Tolak). Selesaikan dulu semua approval sebelum kirim rekap.`, "warning");

    const requestDisetujui = dataTim.filter(req => req.periode === periode && req.status === "Approved");
    if (requestDisetujui.length === 0) return showToast(`Tidak ada pengajuan yang Disetujui di periode "${periode}" untuk direkap.`, "warning");

    setSedangSiapkanRekap(true);
    try {
      const headers = ["Nama Staf", "Departemen", "Tanggal Lembur", "Hari", "Jam Mulai", "Jam Selesai", "Jumlah Jam", "Lokasi/Tugas", "Keterangan Lembur"];
      const rows: (string | number)[][] = [];
      let totalJam = 0;
      const namaUnik = new Set<string>();

      requestDisetujui.forEach(req => {
        namaUnik.add(req.nama_pemohon || "-");
        (req.items || []).forEach(item => {
          const durasi = hitungDurasiJam(item.jam_mulai, item.jam_selesai);
          totalJam += durasi;
          rows.push([
            req.nama_pemohon || "-",
            req.departemen || "-",
            item.tanggal || "-",
            item.tanggal ? formatTanggalHari(item.tanggal).split(",")[0] : "-",
            item.jam_mulai || "-",
            item.jam_selesai || "-",
            durasi,
            item.area_ruangan || "-",
            item.alasan || "-",
          ]);
        });
      });

      unduhExcel(`Rekap_Lembur_Tim_${periode}`, "Rekap Lembur", headers, rows);

      const subjek = `Rekap Lembur Tim - Periode ${periode}`;
      const isiEmail = [
        `Berikut rekap lemburan tim operasional periode ${periode}.`,
        ``,
        `Jumlah staf: ${namaUnik.size} orang`,
        `Total baris lemburan: ${rows.length}`,
        `Total jam lembur: ${Math.round(totalJam * 100) / 100} jam`,
        ``,
        `File Excel rekap sudah otomatis terunduh ke perangkat ini (Rekap_Lembur_Tim_${periode}_...xlsx).`,
        `Mohon lampirkan file tersebut secara manual sebelum mengirim email ini (browser tidak bisa melampirkan file otomatis).`,
        ``,
        `- SIBM Admin GA`,
      ].join("\n");

      const mailtoUrl = `mailto:?subject=${encodeURIComponent(subjek)}&body=${encodeURIComponent(isiEmail)}`;
      // Beri jeda sedikit supaya dialog unduh file tidak tabrakan dengan pembukaan aplikasi email
      setTimeout(() => { window.location.href = mailtoUrl; }, 400);
    } finally {
      setTimeout(() => setSedangSiapkanRekap(false), 500);
    }
  };

  // ==========================================
  // LOGIKA FILTERING
  // ==========================================
  const checkFilter = (req: OvertimeRequest, isTim: boolean) => {
    const safeStatus = req.status || "";
    const matchStatus = !isTim || filterStatus === "SEMUA" || safeStatus === filterStatus || (filterStatus === "PENDING" && safeStatus.includes("Menunggu"));

    const safeNama = (req.nama_pemohon || "").toLowerCase();
    const safeDept = (req.departemen || "").toLowerCase();
    const queryStr = searchQuery.toLowerCase();

    let matchSearch = safeNama.includes(queryStr) || safeDept.includes(queryStr);
    if (!isTim) {
      const safeArea = (req.area_ruangan || "").toLowerCase();
      matchSearch = matchSearch || safeArea.includes(queryStr);
    }

    let matchPeriode = true;
    if (isTim && filterPeriode !== "SEMUA") {
      matchPeriode = req.periode === filterPeriode;
    }

    let matchBulan = true;
    if (!isTim && filterBulanGedung !== "SEMUA") {
      matchBulan = (req.tanggal || "").slice(0, 7) === filterBulanGedung;
    }

    return matchStatus && matchSearch && matchPeriode && matchBulan;
  };

  const currentFilteredData = activeTab === "GEDUNG"
    ? dataGedung.filter(req => checkFilter(req, false))
    : dataTim.filter(req => checkFilter(req, true));

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px", overflowX: "hidden" }}>
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

      {/* 💡 CSS RESPONSIVE & ANTI-OVERFLOW MAGIC */}
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }

        .overtime-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .overtime-table th { padding: 15px; font-weight: bold; }
        .overtime-table td { padding: 15px; vertical-align: top; border-bottom: 1px solid var(--line); transition: background 0.2s; word-wrap: break-word; }
        .overtime-table tbody tr:hover td { filter: brightness(0.98); }
        
        .filter-wrapper { display: flex; justify-content: space-between; gap: 15px; flex-wrap: wrap; margin-bottom: 20px; align-items: center; }
        .filter-controls { display: flex; gap: 10px; flex-wrap: wrap; }
        
        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .filter-wrapper { flex-direction: column; align-items: stretch !important; }
          .filter-controls { flex-direction: column; width: 100%; }
          .filter-controls input, .filter-controls select, .filter-wrapper button { width: 100% !important; max-width: 100% !important; }
          
          /* Transformasi Tabel Menjadi Kartu */
          .overtime-table, .overtime-table tbody { display: block; width: 100%; }
          .overtime-table thead { display: none; }
          .overtime-table tr {
            display: block; width: 100%; margin-bottom: 15px;
            border: 1px solid var(--line); border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;
          }
          .overtime-table td {
            display: block; width: 100%; padding: 15px !important;
            border-bottom: 1px dashed var(--line) !important;
          }
          .overtime-table td:last-child { border-bottom: none !important; }
          
          /* Tombol Approve/Reject Berjejer Kiri-Kanan di HP */
          .action-btns { display: flex; flex-direction: row !important; width: 100%; gap: 10px; margin-top: 10px; }
          .action-btns button { flex: 1; padding: 12px !important; font-size: 13px !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>REKAP &amp; PERSETUJUAN OVERTIME</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Rekap lembur utilitas gedung/tenant (tercatat otomatis) dan validasi lemburan tim operasional SIBM.</p>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT */}
      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>
        
        {/* NAVIGASI TAB */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", overflowX: "auto", paddingBottom: "5px" }}>
          <button
            onClick={() => { setActiveTab("GEDUNG"); setSearchQuery(""); }}
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "GEDUNG" ? "var(--surface)" : "rgba(255,255,255,0.8)", color: activeTab === "GEDUNG" ? "var(--warn)" : "var(--muted)", boxShadow: activeTab === "GEDUNG" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "GEDUNG" ? "3px solid var(--warn)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            🏢 Lembur Gedung (Tenant)
            <span style={{ background: activeTab === "GEDUNG" ? "var(--warn-50)" : "var(--line)", color: activeTab === "GEDUNG" ? "var(--warn)" : "var(--ink-soft)", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>{dataGedung.length} Tercatat</span>
          </button>
          <button
            onClick={() => { setActiveTab("TIM"); setFilterStatus("SEMUA"); setSearchQuery(""); setFilterPeriode("SEMUA"); }}
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "TIM" ? "var(--surface)" : "rgba(255,255,255,0.8)", color: activeTab === "TIM" ? "var(--info)" : "var(--muted)", boxShadow: activeTab === "TIM" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "TIM" ? "3px solid var(--info)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            👷‍♂️ Lembur Tim Operasional
            <span style={{ background: activeTab === "TIM" ? "var(--info-50)" : "var(--line)", color: activeTab === "TIM" ? "var(--info)" : "var(--ink-soft)", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>{dataTim.filter(r=>r.status?.includes("Menunggu")).length} Pending</span>
          </button>
        </div>

        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", width: "100%" }}>
          
          {/* BAR FILTER KONTROL */}
          <div className="filter-wrapper">
            <div className="filter-controls">
              <input
                type="text"
                placeholder={activeTab === "GEDUNG" ? "🔍 Cari Pemohon / Tenant / Ruangan..." : "🔍 Cari Nama Staf / Jabatan..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--line)", width: "260px", fontSize: "13px", background: "var(--bg)", outline: "none" }}
              />

              {activeTab === "GEDUNG" && (
                <select
                  value={filterBulanGedung}
                  onChange={(e) => setFilterBulanGedung(e.target.value)}
                  style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--warn-50)", outline: "none", cursor: "pointer", fontWeight: "bold", color: "var(--warn)" }}
                >
                  <option value="SEMUA">📅 SEMUA BULAN</option>
                  {daftarBulanGedungUnik.map(bln => <option key={bln} value={bln}>{labelBulan(bln)}</option>)}
                </select>
              )}

              {activeTab === "TIM" && (
                <>
                  <select
                    value={filterPeriode}
                    onChange={(e) => setFilterPeriode(e.target.value)}
                    style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--info-50)", outline: "none", cursor: "pointer", fontWeight: "bold", color: "var(--info)" }}
                  >
                    <option value="SEMUA">📅 SEMUA PERIODE SIKLUS</option>
                    {daftarPeriodeUnik.map(per => <option key={per} value={per}>{per}</option>)}
                  </select>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--surface)", outline: "none", cursor: "pointer", fontWeight: "bold", color: "var(--ink-soft)" }}
                  >
                    <option value="SEMUA">📂 SEMUA STATUS</option>
                    <option value="PENDING">⏳ MENUNGGU APPROVAL</option>
                    <option value="Approved">🟢 DISETUJUI (APPROVED)</option>
                    <option value="Rejected">🔴 DITOLAK (REJECTED)</option>
                  </select>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {activeTab === "TIM" && periodeAktifUntukEmail && semuaPeriodeSelesai(periodeAktifUntukEmail) && (
                <button
                  onClick={handleKirimEmailRekap}
                  disabled={sedangSiapkanRekap}
                  title={`Semua pengajuan periode ${periodeAktifUntukEmail} sudah diputuskan`}
                  style={{ background: sedangSiapkanRekap ? "var(--muted)" : "var(--accent)", color: "white", padding: "12px 18px", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "13px", cursor: sedangSiapkanRekap ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(124,58,237,0.2)" }}
                >
                  📧 {sedangSiapkanRekap ? "Menyiapkan rekap..." : `Kirim Email Rekap (${periodeAktifUntukEmail})`}
                </button>
              )}

              <button
                onClick={activeTab === "GEDUNG" ? handleExportGedung : handleExportTim}
                style={{ background: "var(--ok)", color: "white", padding: "12px 18px", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(22,163,74,0.2)" }}
              >
                <span style={{margin: "0 auto", display: "flex", gap: "8px"}}>📊 {activeTab === "GEDUNG" ? "Export Excel Gedung" : "Export Excel Rekap Tim"}</span>
              </button>
            </div>
          </div>

          {/* TABEL DATA OVERTIME */}
          <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
            {activeTab === "GEDUNG" ? (
              <table className="overtime-table">
                <thead style={{ background: "var(--warn-50)", color: "var(--warn)" }}>
                  <tr>
                    <th style={{ width: "22%", borderBottom: "2px solid var(--warn)" }}>Nama Yang Lembur</th>
                    <th style={{ width: "28%", borderBottom: "2px solid var(--warn)" }}>Aktivitas / Keterangan</th>
                    <th style={{ width: "25%", borderBottom: "2px solid var(--warn)" }}>Tanggal, Hari &amp; Jam</th>
                    <th style={{ width: "25%", borderBottom: "2px solid var(--warn)" }}>Unit Bisnis / Lantai / Lokasi</th>
                  </tr>
                </thead>
                <tbody>
                  {currentFilteredData.length > 0 ? currentFilteredData.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <div style={{ fontWeight: "900", color: "var(--ink)", fontSize: "15px" }}>{req.nama_pemohon || "-"}</div>
                        <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "6px" }}>Diajukan: {formatJam(req.waktu_request)}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic" }}>&quot;{req.alasan || "-"}&quot;</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--ink)" }}>📅 {formatTanggalHari(req.tanggal)}</div>
                        <div style={{ fontSize: "12px", color: "var(--warn)", fontWeight: "bold", marginTop: "4px" }}>🕒 {req.jam_mulai || "-"} - {req.jam_selesai || "-"} ({hitungDurasiJam(req.jam_mulai, req.jam_selesai)} jam)</div>
                      </td>
                      <td>
                        <div style={{ fontSize: "11px", color: "var(--warn)", background: "var(--warn-50)", padding: "4px 8px", borderRadius: "6px", display: "inline-block", fontWeight: "bold", border: "1px solid var(--warn)" }}>
                          🏢 {req.departemen || "-"}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--ink-soft)", fontWeight: "bold", marginTop: "6px" }}>📍 {req.area_ruangan || "-"}</div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
                        <div style={{ fontSize: "40px", marginBottom: "10px" }}>🏢</div>
                        <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--muted)" }}>Data Kosong</div>
                        <div>Tidak ada lembur Gedung/Tenant yang ditemukan di bulan ini.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="overtime-table">
                <thead style={{ background: "var(--info-50)", color: "var(--info)" }}>
                  <tr>
                    <th style={{ width: "30%", borderBottom: "2px solid var(--info)" }}>Info Pemohon</th>
                    <th style={{ width: "45%", borderBottom: "2px solid var(--info)" }}>Daftar Klaim Tanggal &amp; Pekerjaan</th>
                    <th style={{ width: "25%", textAlign: "center", borderBottom: "2px solid var(--info)" }}>Status Keputusan</th>
                  </tr>
                </thead>
                <tbody>
                  {currentFilteredData.length > 0 ? currentFilteredData.map((req) => {
                    const safeStatus = req.status || "";
                    const isApproved = safeStatus === "Approved";
                    const isRejected = safeStatus === "Rejected";
                    const isPending = !isApproved && !isRejected;
                    const items = req.items || [];
                    const totalJamReq = items.reduce((sum, it) => sum + hitungDurasiJam(it.jam_mulai, it.jam_selesai), 0);

                    return (
                      <tr key={req.id} style={{ background: isPending ? "var(--surface)" : "var(--bg)" }}>

                        {/* KOLOM PEMOHON */}
                        <td>
                          <div style={{ fontWeight: "900", color: "var(--ink)", fontSize: "15px" }}>{req.nama_pemohon || "-"}</div>
                          <div style={{ fontSize: "11px", color: "var(--info)", marginTop: "4px", background: "var(--info-50)", padding: "4px 8px", borderRadius: "6px", display: "inline-block", fontWeight: "bold", border: "1px solid var(--info)" }}>
                            🏢 {req.departemen || "-"}
                          </div>
                          {req.periode && (
                            <div style={{ fontSize: "11px", color: "var(--ink-soft)", marginTop: "8px", fontWeight: "bold", borderLeft: "2px solid var(--line)", paddingLeft: "5px" }}>
                              Siklus: {req.periode}
                            </div>
                          )}
                          <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "6px" }}>
                            Diajukan: {formatJam(req.waktu_request)}
                          </div>
                        </td>

                        {/* KOLOM DETAIL LEMBUR */}
                        <td>
                          {items.length > 1 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              <div style={{ fontSize: "12px", color: "var(--ink-soft)" }}>
                                <b>{items.length} hari lembur</b> — total {Math.round(totalJamReq * 100) / 100} jam
                              </div>
                              <button
                                onClick={() => setDetailModalReq(req)}
                                style={{ alignSelf: "flex-start", padding: "8px 14px", background: "var(--info-50)", color: "var(--info)", border: "1px solid var(--info)", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: "pointer" }}
                              >
                                📋 Lihat Detail Tabel
                              </button>
                            </div>
                          ) : items.length === 1 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                                <span style={{ fontWeight: "bold", color: "var(--info)", fontSize: "12px" }}>
                                  📅 {formatTanggalHari(items[0].tanggal)}
                                </span>
                                <span style={{ fontWeight: "900", color: "var(--ink)", fontSize: "12px" }}>
                                  🕒 {items[0].jam_mulai || "-"} s/d {items[0].jam_selesai || "-"} ({hitungDurasiJam(items[0].jam_mulai, items[0].jam_selesai)} jam)
                                </span>
                              </div>
                              <div style={{ fontSize: "12px", color: "var(--ink-soft)", fontWeight: "bold" }}>📍 {items[0].area_ruangan || "-"}</div>
                              <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic", marginTop: "4px" }}>&quot;{items[0].alasan || "-"}&quot;</div>
                            </div>
                          ) : (
                            <div style={{ fontSize: "12px", color: "var(--muted)" }}>Tidak ada detail lemburan.</div>
                          )}
                        </td>

                        {/* KOLOM STATUS & AKSI */}
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
                            <span style={{ fontSize: "11px", padding: "6px 12px", borderRadius: "8px", fontWeight: "900", background: isApproved ? "var(--ok-50)" : isRejected ? "var(--red-50)" : "var(--warn-50)", color: isApproved ? "var(--ok)" : isRejected ? "var(--red-700)" : "var(--warn)", whiteSpace: "nowrap", border: `1px solid ${isApproved ? "var(--ok)" : isRejected ? "var(--red-500)" : "var(--warn)"}` }}>
                              {isPending ? "MENUNGGU APPROVAL" : safeStatus.toUpperCase()}
                            </span>

                            {isPending && (
                              <div className="action-btns" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", marginTop: "5px" }}>
                                <button
                                  onClick={() => handleProcessDecision(req.id, req.nama_pemohon || "", "Approved")}
                                  disabled={sedangKirimNotif === req.id}
                                  style={{ padding: "8px 16px", background: sedangKirimNotif === req.id ? "var(--muted)" : "var(--ok)", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: sedangKirimNotif === req.id ? "not-allowed" : "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}
                                >
                                  {sedangKirimNotif === req.id ? "Mengirim notifikasi..." : "Setujui ✓"}
                                </button>
                                <button
                                  onClick={() => handleProcessDecision(req.id, req.nama_pemohon || "", "Rejected")}
                                  disabled={sedangKirimNotif === req.id}
                                  style={{ padding: "8px 12px", background: "var(--surface)", color: "var(--red-600)", border: "1px solid var(--red-50)", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: sedangKirimNotif === req.id ? "not-allowed" : "pointer", transition: "0.2s" }}
                                >
                                  Tolak ✖
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
                        <div style={{ fontSize: "40px", marginBottom: "10px" }}>👷‍♂️</div>
                        <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--muted)" }}>Data Kosong</div>
                        <div>Tidak ada permohonan lembur yang ditemukan di tab ini.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

        </div>

      </div>

      {/* 🔹 MODAL DETAIL LEMBURAN TIM (dalam bentuk tabel, dipakai saat 1 pengajuan berisi >1 baris lembur) */}
      <Modal open={detailModalReq !== null} onClose={() => setDetailModalReq(null)} maxWidth="700px">
        {detailModalReq && (
          <div>
            <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: "900", color: "var(--ink)" }}>{detailModalReq.nama_pemohon || "-"}</h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "var(--muted)" }}>
              {detailModalReq.departemen || "-"} · Siklus {detailModalReq.periode || "-"} · {(detailModalReq.items || []).length} hari lembur
            </p>
            <div style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead style={{ background: "var(--info-50)", color: "var(--info)" }}>
                  <tr>
                    <th style={{ padding: "10px", textAlign: "left" }}>Tanggal</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Hari</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Jam</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Jml Jam</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Lokasi/Tugas</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailModalReq.items || []).map((item, idx) => (
                    <tr key={idx} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "10px", whiteSpace: "nowrap" }}>{item.tanggal || "-"}</td>
                      <td style={{ padding: "10px", whiteSpace: "nowrap" }}>{item.tanggal ? formatTanggalHari(item.tanggal).split(",")[0] : "-"}</td>
                      <td style={{ padding: "10px", whiteSpace: "nowrap" }}>{item.jam_mulai || "-"} - {item.jam_selesai || "-"}</td>
                      <td style={{ padding: "10px", whiteSpace: "nowrap", fontWeight: "bold" }}>{hitungDurasiJam(item.jam_mulai, item.jam_selesai)}</td>
                      <td style={{ padding: "10px" }}>{item.area_ruangan || "-"}</td>
                      <td style={{ padding: "10px", fontStyle: "italic", color: "var(--muted)" }}>{item.alasan || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}