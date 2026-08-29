"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconPrinter = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M6 17v4h12v-4" /></svg>
);
const IconSearch = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);

// ==========================================
// INTERFACES — disamakan sama bentuk data ASLI yang ditulis oleh ChecklistOBPage,
// StockOpnamePage, PlottingOBPage, dan InspeksiFasilitasPage (components/pages/).
// Interface lama di file ini gak nyambung sama sekali ke data real (detail_tugas,
// purchase_requests, plot.tanggal sbg field, dst — semua gak pernah ditulis kemanapun),
// itu sebabnya laporan yang tampil sebelumnya gak sesuai.
// ==========================================
interface JawabanPertanyaan { pertanyaan_id: string; teks: string; jawaban: "Ya" | "Tidak"; }
interface SegmentLog { segment_id: string; nama_segment: string; jawaban: JawabanPertanyaan[]; }
interface FotoPasangan { before: string; after: string; }
interface ChecklistOB {
  id: string;
  area: string;
  pic_bertugas: string;
  tanggal?: string; // baru ada di dokumen mulai sesi redesign checklist — dok lama mungkin gak punya
  waktu_selesai: Timestamp | null;
  detail_segmen: SegmentLog[];
  foto_bukti: FotoPasangan[];
}

const getStatusRingkas = (segmen: SegmentLog[]) => {
  const semuaJawaban = (segmen || []).flatMap((s) => s.jawaban || []);
  if (semuaJawaban.length === 0) return "Belum Ada Data";
  const jumlahTidak = semuaJawaban.filter((j) => j.jawaban === "Tidak").length;
  if (jumlahTidak === 0) return "Bersih Sempurna";
  return `${jumlahTidak} Item Perlu Perhatian`;
};

function formatBulanLabel(bulanKey: string): string {
  if (bulanKey === "unknown") return "Tanpa Tanggal";
  const [y, m] = bulanKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// Label periode utk kop cetak, dari 2 filter independen (bulan 0-11 / "SEMUA", tahun / "SEMUA")
function formatPeriodeLabel(filterBulan: string, filterTahun: string): string {
  if (filterBulan === "SEMUA" && filterTahun === "SEMUA") return "Semua Periode";
  const bulanLabel = filterBulan !== "SEMUA" ? NAMA_BULAN[Number(filterBulan)] : "";
  const tahunLabel = filterTahun !== "SEMUA" ? filterTahun : "";
  return [bulanLabel, tahunLabel].filter(Boolean).join(" ");
}

// Ambil {tahun, bulan (0-11)} dari sebuah dokumen ChecklistOB -- prioritas field `tanggal`
// (lebih akurat, ini tanggal kerja beneran), fallback ke waktu_selesai buat dokumen lama yang
// belum punya field tanggal. Dipakai buat filter Bulan & Tahun terpisah (bukan 1 dropdown gabungan).
function getTahunBulanChecklist(item: ChecklistOB): { tahun: number; bulan: number } | null {
  if (item.tanggal) {
    const [y, m] = item.tanggal.split("-").map(Number);
    if (y && m) return { tahun: y, bulan: m - 1 };
  }
  if (item.waktu_selesai) {
    const d = item.waktu_selesai.toDate();
    return { tahun: d.getFullYear(), bulan: d.getMonth() };
  }
  return null;
}

interface StockItem {
  id: string;
  nama_barang: string;
  qty: number;
  batas_minimum: number;
  diupdate_oleh?: string;
  terakhir_diupdate: Timestamp | null;
}
interface StockLog {
  id: string;
  id_barang?: string;
  nama_barang: string;
  jenis_transaksi: string;
  jumlah_perubahan: number;
  waktu_transaksi: Timestamp | null;
}

// Sama persis logicnya dgn StockOpnamePage.tsx (hitungAnalisaPemakaian) — sengaja
// diduplikasi bukan diimpor, konsisten sama pola project ini (duplikasi kecil per
// file drpd premature abstraction lintas halaman OB & admin).
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LIMIT_LOG_ANALISA = 400;
interface AnalisaPemakaian {
  item: StockItem;
  adaDataPemakaian: boolean;
  rataRataPerBulan: number;
  proyeksiHabisHari: number | null;
  proyeksiSisaAkhirBulan: number | null;
  jumlahDisarankan: number;
  isUrgent: boolean;
  isPerluBulanDepan: boolean;
}
function hitungAnalisaPemakaian(item: StockItem, semuaLog: StockLog[]): AnalisaPemakaian {
  const logKeluar = semuaLog.filter(
    (l) => l.waktu_transaksi && l.jenis_transaksi.includes("KELUAR") && (l.id_barang ? l.id_barang === item.id : l.nama_barang === item.nama_barang)
  );
  const isUrgent = item.qty <= item.batas_minimum;

  if (logKeluar.length === 0) {
    const jumlahDisarankan = isUrgent ? Math.max(0, item.batas_minimum * 2 - item.qty) : 0;
    return { item, adaDataPemakaian: false, rataRataPerBulan: 0, proyeksiHabisHari: null, proyeksiSisaAkhirBulan: null, jumlahDisarankan, isUrgent, isPerluBulanDepan: false };
  }

  const totalKeluar = logKeluar.reduce((sum, l) => sum + l.jumlah_perubahan, 0);
  const waktuTertua = Math.min(...logKeluar.map((l) => l.waktu_transaksi!.toMillis()));
  const rentangHari = Math.max(1, (Date.now() - waktuTertua) / MS_PER_DAY);
  const rataRataPerHari = totalKeluar / rentangHari;
  const rataRataPerBulan = rataRataPerHari * 30;
  const proyeksiHabisHari = rataRataPerHari > 0 ? Math.floor(item.qty / rataRataPerHari) : null;
  const proyeksiSisaAkhirBulan = Math.round((item.qty - rataRataPerBulan) * 10) / 10;
  const isPerluBulanDepan = !isUrgent && proyeksiSisaAkhirBulan <= item.batas_minimum;
  const targetSehat = item.batas_minimum + rataRataPerBulan;
  const jumlahDisarankan = Math.max(0, Math.ceil(targetSehat - item.qty));

  return { item, adaDataPemakaian: true, rataRataPerBulan, proyeksiHabisHari, proyeksiSisaAkhirBulan, jumlahDisarankan, isUrgent, isPerluBulanDepan };
}

interface DailyPlot {
  id: string; // format YYYY-MM-DD — ini SATU-SATUNYA sumber tanggal (dokumen gak punya field "tanggal")
  plot_lantai: Record<string, string>;
  waktu_update: Timestamp | null;
  dibuat_otomatis?: boolean;
}
function isWeekend(dateISO: string): boolean {
  const hari = new Date(`${dateISO}T00:00:00`).getDay();
  return hari === 0 || hari === 6;
}

type Kondisi = "Baik" | "Rusak" | "Tidak Ada";
interface InspeksiLog {
  id: string;
  area: string;
  pic_bertugas: string;
  minggu_mulai: string;
  waktu_selesai: Timestamp | null;
  hasil: { nama: string; kondisi: Kondisi; catatan: string; foto: string }[];
}

// Sama polanya dgn getTahunBulanChecklist -- minggu_mulai selalu ada (field wajib), jadi gak perlu fallback.
function getTahunBulanInspeksi(item: InspeksiLog): { tahun: number; bulan: number } | null {
  const [y, m] = (item.minggu_mulai || "").split("-").map(Number);
  if (!y || !m) return null;
  return { tahun: y, bulan: m - 1 };
}

export default function MonitorOBPage() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState("Admin");
  const [activeTab, setActiveTab] = useState<"CHECKLIST" | "STOCK" | "INSPEKSI" | "PLOT">("CHECKLIST");
  // Filter Bulan & Tahun Log Pembersihan (dipisah jadi 2 dropdown independen)
  const [filterBulanChecklist, setFilterBulanChecklist] = useState<string>("SEMUA");
  const [filterTahunChecklist, setFilterTahunChecklist] = useState<string>("SEMUA");
  // Filter Bulan & Tahun Inspeksi Fasilitas
  const [filterBulanInspeksi, setFilterBulanInspeksi] = useState<string>("SEMUA");
  const [filterTahunInspeksi, setFilterTahunInspeksi] = useState<string>("SEMUA");
  const [bulanFilterPlot, setBulanFilterPlot] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // States Data
  const [checklists, setChecklists] = useState<ChecklistOB[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stockLogs, setStockLogs] = useState<StockLog[]>([]);
  const [dailyPlots, setDailyPlots] = useState<DailyPlot[]>([]);
  const [inspeksiList, setInspeksiList] = useState<InspeksiLog[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  // Kosong di render awal (server & client SAMA — hindari hydration mismatch dari jam
  // live), baru diisi pas tombol Export PDF diklik.
  const [waktuCetak, setWaktuCetak] = useState("");

  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");

    if (!role || (!role.includes("Admin") && !role.includes("Koordinator"))) {
      alert("Akses Ditolak! Halaman ini khusus Administrator.");
      router.push("/dashboard");
      return;
    }
    setTimeout(() => setAdminName(nama || "Admin"), 0);

    // Log checklist harian TIDAK dibatasi limit() — ini sumber data audit, sengaja
    // gak dipotong biar filter "Semua Bulan" & export PDF beneran lengkap.
    const qChecklist = query(collection(db, "ob_checklists"), orderBy("waktu_selesai", "desc"));
    const unsubChecklist = onSnapshot(qChecklist, (snap) => {
      setChecklists(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ChecklistOB[]);
    });

    const qStock = query(collection(db, "ob_stock"), orderBy("nama_barang", "asc"));
    const unsubStock = onSnapshot(qStock, (snap) => {
      setStocks(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as StockItem[]);
    });

    const qStockLog = query(collection(db, "ob_stock_logs"), orderBy("waktu_transaksi", "desc"), limit(LIMIT_LOG_ANALISA));
    const unsubStockLog = onSnapshot(qStockLog, (snap) => {
      setStockLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as StockLog[]);
    });

    // Plot harian: dokumen daily_plots gak punya field "tanggal" — ID dokumennya SENDIRI
    // adalah tanggalnya (YYYY-MM-DD). orderBy("tanggal") versi lama gak pernah nge-match
    // apapun (field itu emang gak ada), jadi tab ini selalu kosong sebelumnya.
    // Diambil polos tanpa orderBy/limit (collection-nya kecil, ~1 dok/hari, orderBy(documentId())
    // butuh index khusus yang gak perlu-perlu amat buat collection sekecil ini) — gak dipotong
    // sama sekali (bukan cuma 90 terakhir) karena sekarang ada pilihan bulan, termasuk bulan-bulan
    // yang udah digenerate jauh ke depan (lihat §10), jadi datanya harus lengkap.
    const unsubPlot = onSnapshot(collection(db, "daily_plots"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as DailyPlot[];
      list.sort((a, b) => b.id.localeCompare(a.id));
      setDailyPlots(list);
    });

    const qInspeksi = query(collection(db, "inspeksi_fasilitas"), orderBy("waktu_selesai", "desc"), limit(200));
    const unsubInspeksi = onSnapshot(qInspeksi, (snap) => {
      setInspeksiList(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as InspeksiLog[]);
    });

    return () => {
      unsubChecklist(); unsubStock(); unsubStockLog(); unsubPlot(); unsubInspeksi();
    };
  }, [router]);

  const formatWaktu = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  // Filter Data
  const filteredStocks = stocks.filter((i) => i.nama_barang?.toLowerCase().includes(searchQuery.toLowerCase()));
  const analisaSemuaBarang = stocks.map((item) => hitungAnalisaPemakaian(item, stockLogs));
  const daftarUrgent = analisaSemuaBarang.filter((a) => a.isUrgent);
  const daftarBulanDepan = analisaSemuaBarang.filter((a) => a.isPerluBulanDepan);

  const tahunTersediaChecklist = Array.from(
    new Set(checklists.map((c) => getTahunBulanChecklist(c)?.tahun).filter((y): y is number => !!y))
  ).sort((a, b) => b - a);
  const filteredChecklists = checklists.filter((c) => {
    const tb = getTahunBulanChecklist(c);
    const matchBulan = filterBulanChecklist === "SEMUA" || tb?.bulan === Number(filterBulanChecklist);
    const matchTahun = filterTahunChecklist === "SEMUA" || tb?.tahun === Number(filterTahunChecklist);
    const matchSearch = c.pic_bertugas?.toLowerCase().includes(searchQuery.toLowerCase()) || c.area?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchBulan && matchTahun && matchSearch;
  });

  const tahunTersediaInspeksi = Array.from(
    new Set(inspeksiList.map((i) => getTahunBulanInspeksi(i)?.tahun).filter((y): y is number => !!y))
  ).sort((a, b) => b - a);
  const filteredInspeksi = inspeksiList.filter((i) => {
    const tb = getTahunBulanInspeksi(i);
    const matchBulan = filterBulanInspeksi === "SEMUA" || tb?.bulan === Number(filterBulanInspeksi);
    const matchTahun = filterTahunInspeksi === "SEMUA" || tb?.tahun === Number(filterTahunInspeksi);
    const matchSearch = i.pic_bertugas?.toLowerCase().includes(searchQuery.toLowerCase()) || i.area?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchBulan && matchTahun && matchSearch;
  });
  const rusakBaruBaruIni = inspeksiList.slice(0, 30).reduce((sum, i) => sum + i.hasil.filter((h) => h.kondisi === "Rusak").length, 0);

  const kolomLantai = ["Basement", "Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Lantai 5", "Pelayanan Khusus OB"];
  const NAMA_HARI_SINGKAT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  // Daftar bulan yang beneran ada plot-nya (biar dropdown gak nampilin bulan kosong).
  const bulanTersediaPlot = Array.from(new Set(dailyPlots.map((p) => p.id.slice(0, 7)))).sort().reverse();
  const bulanPlotAktif = bulanTersediaPlot.includes(bulanFilterPlot) ? bulanFilterPlot : (bulanTersediaPlot[0] || bulanFilterPlot);
  const plotMapBulanIni: Record<string, DailyPlot> = {};
  dailyPlots.forEach((p) => { if (p.id.startsWith(bulanPlotAktif)) plotMapBulanIni[p.id] = p; });
  const [tahunPlot, bulanAngkaPlot] = bulanPlotAktif.split("-").map(Number);
  const jumlahHariBulanPlot = tahunPlot && bulanAngkaPlot ? new Date(tahunPlot, bulanAngkaPlot, 0).getDate() : 0;
  const daftarTanggalBulanPlot = Array.from({ length: jumlahHariBulanPlot }, (_, i) => `${bulanPlotAktif}-${String(i + 1).padStart(2, "0")}`);

  const handlePrint = () => {
    setWaktuCetak(new Date().toLocaleString("id-ID"));
    setTimeout(() => window.print(), 0);
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
        .tab-count { background: var(--red-600); color: white; padding: 2px 7px; border-radius: 10px; font-size: 10px; }
        .print-only { display: none; }

        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          html, body { background-color: white !important; -webkit-print-color-adjust: exact; font-size: 11px; }
          .no-print { display: none !important; }
          .print-area { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; }
          .print-only { display: block !important; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          th, td { border: 1px solid #cbd5e0 !important; padding: 6px 8px !important; text-align: left; }
          th { background-color: #f1f5f9 !important; font-weight: bold !important; color: #2d3748 !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="site-header no-print">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> Admin: {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="admin-hero no-print">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>PANTAU KINERJA OB & CS</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Monitoring log kebersihan, stok gudang, inspeksi fasilitas, dan plotting tugas</p>
        </div>
      </div>

      {/* 🖨️ KOP CETAK — cuma muncul pas print */}
      <div className="print-only" style={{ marginBottom: "15px", borderBottom: "2px solid #2d3748", paddingBottom: "10px" }}>
        <h2 style={{ margin: 0 }}>
          {activeTab === "PLOT" ? "Plot Tugas Harian OB & CS" : activeTab === "INSPEKSI" ? "Laporan Inspeksi Fasilitas" : "Log Pembersihan OB & CS"}
          {activeTab === "PLOT"
            ? ` — ${formatBulanLabel(bulanPlotAktif)}`
            : activeTab === "CHECKLIST"
            ? ` — ${formatPeriodeLabel(filterBulanChecklist, filterTahunChecklist)}`
            : activeTab === "INSPEKSI"
            ? ` — ${formatPeriodeLabel(filterBulanInspeksi, filterTahunInspeksi)}`
            : ""}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: "11px" }}>Dicetak: {waktuCetak}</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }} className="print-area">

        {/* NAVIGASI TAB */}
        <div className="no-print" style={{ display: "flex", gap: "10px", marginBottom: "25px", overflowX: "auto", paddingBottom: "10px" }}>
          <button onClick={() => { setActiveTab("CHECKLIST"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "CHECKLIST" ? "var(--surface)" : "rgba(255,255,255,0.7)", color: activeTab === "CHECKLIST" ? "var(--ok)" : "var(--muted)", boxShadow: activeTab === "CHECKLIST" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "CHECKLIST" ? "3px solid var(--ok)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            📋 Log Pembersihan
          </button>
          <button onClick={() => { setActiveTab("STOCK"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "STOCK" ? "var(--surface)" : "rgba(255,255,255,0.7)", color: activeTab === "STOCK" ? "var(--warn)" : "var(--muted)", boxShadow: activeTab === "STOCK" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "STOCK" ? "3px solid var(--warn)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            📦 Stok & Pengadaan {daftarUrgent.length > 0 && <span className="tab-count">{daftarUrgent.length}</span>}
          </button>
          <button onClick={() => { setActiveTab("INSPEKSI"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "INSPEKSI" ? "var(--surface)" : "rgba(255,255,255,0.7)", color: activeTab === "INSPEKSI" ? "var(--accent)" : "var(--muted)", boxShadow: activeTab === "INSPEKSI" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "INSPEKSI" ? "3px solid var(--accent)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            <IconSearch size={14} /> Inspeksi Fasilitas {rusakBaruBaruIni > 0 && <span className="tab-count">{rusakBaruBaruIni}</span>}
          </button>
          <button onClick={() => { setActiveTab("PLOT"); setSearchQuery(""); }} style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "PLOT" ? "var(--surface)" : "rgba(255,255,255,0.7)", color: activeTab === "PLOT" ? "var(--info)" : "var(--muted)", boxShadow: activeTab === "PLOT" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "PLOT" ? "3px solid var(--info)" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}>
            📅 Plot Tugas Harian
          </button>
        </div>

        {/* CONTAINER KONTEN */}
        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)" }}>

          {/* SEARCH BAR + FILTER BULAN (Checklist) + Export PDF */}
          {activeTab !== "PLOT" && (
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>
                {activeTab === "CHECKLIST" ? "📋 Laporan Pembersihan" : activeTab === "STOCK" ? "📦 Inventory & Pengadaan Gudang OB" : "🔍 Inspeksi Fasilitas Mingguan"}
              </h2>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                {activeTab === "CHECKLIST" && (
                  <>
                    <select value={filterBulanChecklist} onChange={(e) => setFilterBulanChecklist(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                      <option value="SEMUA">Semua Bulan</option>
                      {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
                    </select>
                    <select value={filterTahunChecklist} onChange={(e) => setFilterTahunChecklist(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                      <option value="SEMUA">Semua Tahun</option>
                      {tahunTersediaChecklist.map((th) => <option key={th} value={String(th)}>{th}</option>)}
                    </select>
                    <button onClick={handlePrint} style={{ background: "var(--info)", color: "white", padding: "10px 15px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                      <IconPrinter /> Export PDF
                    </button>
                  </>
                )}
                {activeTab === "INSPEKSI" && (
                  <>
                    <select value={filterBulanInspeksi} onChange={(e) => setFilterBulanInspeksi(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                      <option value="SEMUA">Semua Bulan</option>
                      {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
                    </select>
                    <select value={filterTahunInspeksi} onChange={(e) => setFilterTahunInspeksi(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                      <option value="SEMUA">Semua Tahun</option>
                      {tahunTersediaInspeksi.map((th) => <option key={th} value={String(th)}>{th}</option>)}
                    </select>
                    <button onClick={handlePrint} style={{ background: "var(--accent)", color: "white", padding: "10px 15px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                      <IconPrinter /> Export PDF
                    </button>
                  </>
                )}
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                  <input
                    type="text" placeholder="Ketik untuk mencari..."
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "220px", background: "var(--bg)", outline: "none" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* HEADER TAB PLOT: pilihan bulan + Buat Plot Baru + Export PDF */}
          {activeTab === "PLOT" && (
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>📅 Plot Tugas Harian</h2>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <select value={bulanPlotAktif} onChange={(e) => setBulanFilterPlot(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                  {bulanTersediaPlot.length > 0 ? bulanTersediaPlot.map((b) => <option key={b} value={b}>{formatBulanLabel(b)}</option>) : <option value={bulanPlotAktif}>{formatBulanLabel(bulanPlotAktif)}</option>}
                </select>
                <button onClick={() => router.push("/dashboard/ob/plotting")} style={{ background: "var(--ok)", color: "white", padding: "10px 15px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  + Buat Plot Baru
                </button>
                <button onClick={handlePrint} style={{ background: "var(--info)", color: "white", padding: "10px 15px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  <IconPrinter /> Export PDF
                </button>
              </div>
            </div>
          )}

          {/* ============================== TAB 1: CHECKLIST ============================== */}
          {activeTab === "CHECKLIST" && (
            <>
              {/* Versi cetak: laporan lengkap per entri — rincian checklist per segmen (Ya/Tidak) + foto bukti before/after,
                  bukan cuma ringkasan status. Dibatasi filteredChecklists yang sama dgn layar (ikut bulan & pencarian aktif). */}
              <div className="print-only">
                <div style={{ fontSize: "10px", marginBottom: "10px" }}>Total laporan: {filteredChecklists.length}</div>
                {filteredChecklists.map((item) => {
                  const statusRingkas = getStatusRingkas(item.detail_segmen);
                  return (
                    <div key={item.id} style={{ border: "1px solid #cbd5e0", borderRadius: "6px", padding: "10px 12px", marginBottom: "12px", breakInside: "avoid" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "12px", marginBottom: "3px" }}>
                        <span>{item.area}</span>
                        <span>{formatWaktu(item.waktu_selesai)}</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#4a5568", marginBottom: "8px" }}>
                        Petugas: {item.pic_bertugas} &nbsp;|&nbsp; Status: {statusRingkas}
                      </div>

                      {(item.detail_segmen || []).map((segment, sIdx) => (
                        <div key={sIdx} style={{ marginBottom: "6px" }}>
                          <div style={{ fontWeight: "bold", fontSize: "10px", textTransform: "uppercase", marginBottom: "3px" }}>{segment.nama_segment}</div>
                          {(segment.jawaban || []).map((j, jIdx) => (
                            <div key={jIdx} style={{ display: "flex", justifyContent: "space-between", fontSize: "9.5px", padding: "2px 0", borderBottom: "1px dotted #cbd5e0" }}>
                              <span>{j.teks}</span>
                              <span style={{ fontWeight: "bold" }}>{j.jawaban}</span>
                            </div>
                          ))}
                        </div>
                      ))}

                      {(item.foto_bukti || []).length > 0 && (
                        <div style={{ marginTop: "8px" }}>
                          <div style={{ fontSize: "9.5px", fontWeight: "bold", marginBottom: "4px" }}>Foto Bukti (Sebelum / Sesudah)</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {item.foto_bukti.map((f, fIdx) => (
                              <Fragment key={fIdx}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={f.before} alt="Sebelum" style={{ width: "90px", height: "110px", objectFit: "cover", border: "1px solid #cbd5e0", borderRadius: "4px" }} />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={f.after} alt="Sesudah" style={{ width: "90px", height: "110px", objectFit: "cover", border: "1px solid #cbd5e0", borderRadius: "4px" }} />
                              </Fragment>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="no-print" style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                      <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Waktu Laporan</th>
                      <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Petugas OB</th>
                      <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Area</th>
                      <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "center" }}>Status Kebersihan</th>
                      <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "center" }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChecklists.length > 0 ? filteredChecklists.map((item) => {
                      const statusRingkas = getStatusRingkas(item.detail_segmen);
                      const isOpen = expandedId === item.id;
                      const isBersih = statusRingkas === "Bersih Sempurna";
                      const isKosong = statusRingkas === "Belum Ada Data";
                      return (
                        <Fragment key={item.id}>
                          <tr style={{ borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: "12px 15px", color: "var(--muted)" }}>{formatWaktu(item.waktu_selesai)}</td>
                            <td style={{ padding: "12px 15px", fontWeight: "bold", color: "var(--info)" }}>{item.pic_bertugas}</td>
                            <td style={{ padding: "12px 15px", color: "var(--ink-soft)" }}>{item.area}</td>
                            <td style={{ padding: "12px 15px", textAlign: "center" }}>
                              <span style={{
                                background: isBersih ? "var(--ok-50)" : isKosong ? "var(--bg)" : "var(--red-50)",
                                color: isBersih ? "var(--ok)" : isKosong ? "var(--muted)" : "var(--red-700)",
                                padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold"
                              }}>
                                {statusRingkas}
                              </span>
                            </td>
                            <td style={{ padding: "12px 15px", textAlign: "center" }}>
                              <button
                                onClick={() => setExpandedId(isOpen ? null : item.id)}
                                style={{ background: isOpen ? "var(--ok)" : "var(--bg)", color: isOpen ? "white" : "var(--ink-soft)", border: "none", padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}
                              >
                                {isOpen ? "Tutup ▲" : "Lihat Detail ▼"}
                              </button>
                            </td>
                          </tr>

                          {isOpen && (
                            <tr>
                              <td colSpan={5} style={{ padding: "0", background: "var(--bg)" }}>
                                <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px" }}>
                                  {(item.detail_segmen || []).map((segment, sIdx) => (
                                    <div key={sIdx} style={{ background: "var(--surface)", padding: "15px", borderRadius: "12px", border: "1px solid var(--line)" }}>
                                      <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "12.5px", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{segment.nama_segment}</div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                        {segment.jawaban.map((j, jIdx) => (
                                          <div key={jIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: "8px", background: j.jawaban === "Ya" ? "var(--ok-50)" : "var(--red-50)" }}>
                                            <span style={{ fontSize: "12px", color: "var(--ink)" }}>{j.teks}</span>
                                            <span style={{ fontSize: "10px", fontWeight: "900", padding: "3px 8px", borderRadius: "6px", background: j.jawaban === "Ya" ? "var(--ok)" : "var(--red-600)", color: "white" }}>{j.jawaban.toUpperCase()}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}

                                  {(item.foto_bukti || []).length > 0 && (
                                    <div>
                                      <div style={{ fontWeight: "bold", color: "var(--ink-soft)", fontSize: "11px", marginBottom: "8px", textTransform: "uppercase" }}>Foto Bukti</div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        {item.foto_bukti.map((f, fIdx) => (
                                          <div key={fIdx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", maxWidth: "400px" }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={f.before} alt="Sebelum" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--red-50)", cursor: "pointer" }} onClick={() => window.open(f.before, "_blank")} />
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={f.after} alt="Sesudah" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--ok-50)", cursor: "pointer" }} onClick={() => window.open(f.after, "_blank")} />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {(!item.detail_segmen || item.detail_segmen.length === 0) && (!item.foto_bukti || item.foto_bukti.length === 0) && (
                                    <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>Tidak ada rincian untuk laporan ini.</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    }) : (
                      <tr><td colSpan={5} style={{ padding: "50px", textAlign: "center", color: "var(--muted)" }}>Belum ada log laporan kebersihan{(filterBulanChecklist !== "SEMUA" || filterTahunChecklist !== "SEMUA") ? " di periode ini" : ""}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ============================== TAB 2: STOCK & PENGADAAN ============================== */}
          {activeTab === "STOCK" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>

              {/* PENGADAAN URGENT */}
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "var(--red-700)", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>🚨 Pengadaan Urgent</h3>
                <p style={{ margin: "0 0 12px 0", color: "var(--muted)", fontSize: "12px" }}>Sudah di titik/bawah batas minimum — perlu dibeli sekarang.</p>
                {daftarUrgent.length > 0 ? (
                  <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                      <thead><tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                        <th style={{ padding: "12px 15px" }}>Nama Barang</th><th style={{ padding: "12px 15px" }}>Sisa</th><th style={{ padding: "12px 15px" }}>Batas Min.</th><th style={{ padding: "12px 15px" }}>Pemakaian/Bulan</th><th style={{ padding: "12px 15px" }}>Disarankan Beli</th>
                      </tr></thead>
                      <tbody>
                        {daftarUrgent.map((a) => (
                          <tr key={a.item.id} style={{ borderTop: "1px solid var(--line)" }}>
                            <td style={{ padding: "10px 15px", fontWeight: "bold" }}>{a.item.nama_barang}</td>
                            <td style={{ padding: "10px 15px", color: "var(--red-600)", fontWeight: "bold" }}>{a.item.qty}</td>
                            <td style={{ padding: "10px 15px", color: "var(--muted)" }}>{a.item.batas_minimum}</td>
                            <td style={{ padding: "10px 15px" }}>{a.adaDataPemakaian ? `${Math.round(a.rataRataPerBulan)} / bulan` : "Belum ada data"}</td>
                            <td style={{ padding: "10px 15px" }}><span style={{ background: "var(--red-600)", color: "white", padding: "4px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 800 }}>Beli {a.jumlahDisarankan} pcs</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px", border: "1px dashed var(--line)", borderRadius: "10px" }}>Aman — tidak ada barang urgent.</div>}
              </div>

              {/* RENCANA BELANJA BULAN DEPAN */}
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "var(--warn)", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>🛒 Rencana Belanja Bulan Depan</h3>
                <p style={{ margin: "0 0 12px 0", color: "var(--muted)", fontSize: "12px" }}>Masih aman, tapi diproyeksikan turun ke batas minimum akhir bulan ini.</p>
                {daftarBulanDepan.length > 0 ? (
                  <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                      <thead><tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                        <th style={{ padding: "12px 15px" }}>Nama Barang</th><th style={{ padding: "12px 15px" }}>Sisa</th><th style={{ padding: "12px 15px" }}>Pemakaian/Bulan</th><th style={{ padding: "12px 15px" }}>Proyeksi Akhir Bulan</th><th style={{ padding: "12px 15px" }}>Disarankan Beli</th>
                      </tr></thead>
                      <tbody>
                        {daftarBulanDepan.map((a) => (
                          <tr key={a.item.id} style={{ borderTop: "1px solid var(--line)" }}>
                            <td style={{ padding: "10px 15px", fontWeight: "bold" }}>{a.item.nama_barang}</td>
                            <td style={{ padding: "10px 15px" }}>{a.item.qty}</td>
                            <td style={{ padding: "10px 15px" }}>{Math.round(a.rataRataPerBulan)} / bulan</td>
                            <td style={{ padding: "10px 15px", color: "var(--warn)", fontWeight: "bold" }}>{a.proyeksiSisaAkhirBulan !== null && a.proyeksiSisaAkhirBulan > 0 ? `≈ ${a.proyeksiSisaAkhirBulan}` : "Bakal habis sebelum akhir bulan"}</td>
                            <td style={{ padding: "10px 15px" }}><span style={{ background: "var(--warn-50)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.3)", padding: "4px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 800 }}>Beli {a.jumlahDisarankan} pcs</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px", border: "1px dashed var(--line)", borderRadius: "10px" }}>Belum ada barang yang diproyeksikan turun bulan ini.</div>}
              </div>

              {/* KONDISI STOK GUDANG (mentah) */}
              <div>
                <h3 style={{ margin: "0 0 12px 0", color: "var(--ink)", fontSize: "14px" }}>📋 Kondisi Stok Gudang (Semua Item)</h3>
                <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                        <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Nama Barang</th>
                        <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "center" }}>Sisa Stok (Qty)</th>
                        <th style={{ padding: "15px", borderBottom: "2px solid var(--line)", textAlign: "center" }}>Batas Minimum</th>
                        <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Diupdate Oleh</th>
                        <th style={{ padding: "15px", borderBottom: "2px solid var(--line)" }}>Terakhir Diupdate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStocks.length > 0 ? filteredStocks.map((item) => {
                        const isLowStock = item.qty <= item.batas_minimum;
                        return (
                          <tr key={item.id} style={{ borderBottom: "1px solid var(--line)", background: isLowStock ? "var(--red-50)" : "var(--surface)" }}>
                            <td style={{ padding: "12px 15px", fontWeight: "bold", color: "var(--ink)" }}>{item.nama_barang}</td>
                            <td style={{ padding: "12px 15px", textAlign: "center", fontWeight: "900", color: isLowStock ? "var(--red-600)" : "var(--ok)", fontSize: "14px" }}>{item.qty}</td>
                            <td style={{ padding: "12px 15px", textAlign: "center", color: "var(--muted)", fontWeight: "bold" }}>{item.batas_minimum}</td>
                            <td style={{ padding: "12px 15px", color: "var(--ink-soft)" }}><span style={{ background: "var(--bg)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold" }}>{item.diupdate_oleh || "-"}</span></td>
                            <td style={{ padding: "12px 15px", color: "var(--muted)", fontSize: "11px" }}>{formatWaktu(item.terakhir_diupdate)}</td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={5} style={{ padding: "50px", textAlign: "center", color: "var(--muted)" }}>Belum ada data barang di inventori.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================== TAB 3: INSPEKSI FASILITAS ============================== */}
          {activeTab === "INSPEKSI" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {/* Versi cetak: rincian lengkap tiap sesi inspeksi — semua titik cek (Baik/Rusak/Tidak Ada), catatan, dan foto. */}
              <div className="print-only">
                <div style={{ fontSize: "10px", marginBottom: "10px" }}>Total sesi inspeksi: {filteredInspeksi.length}</div>
                {filteredInspeksi.map((log) => (
                  <div key={log.id} style={{ border: "1px solid #cbd5e0", borderRadius: "6px", padding: "10px 12px", marginBottom: "12px", breakInside: "avoid" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "12px", marginBottom: "3px" }}>
                      <span>{log.area}</span>
                      <span>{formatWaktu(log.waktu_selesai)}</span>
                    </div>
                    <div style={{ fontSize: "10px", color: "#4a5568", marginBottom: "8px" }}>
                      Petugas: {log.pic_bertugas} &nbsp;|&nbsp; Minggu: {log.minggu_mulai}
                    </div>
                    {(log.hasil || []).map((h, hIdx) => (
                      <div key={hIdx} style={{ marginBottom: "4px", fontSize: "9.5px", padding: "2px 0", borderBottom: "1px dotted #cbd5e0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>{h.nama}</span>
                          <span style={{ fontWeight: "bold" }}>{h.kondisi}</span>
                        </div>
                        {h.catatan && <div style={{ color: "#4a5568", fontStyle: "italic" }}>Catatan: {h.catatan}</div>}
                        {h.foto && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.foto} alt={h.nama} style={{ width: "90px", height: "90px", objectFit: "cover", border: "1px solid #cbd5e0", borderRadius: "4px", marginTop: "4px" }} />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                {filteredInspeksi.length > 0 ? filteredInspeksi.map((log) => {
                  const rusak = log.hasil.filter((h) => h.kondisi === "Rusak");
                  return (
                    <div key={log.id} style={{ border: "1px solid var(--line)", borderRadius: "16px", padding: "18px", background: rusak.length > 0 ? "var(--red-50)" : "var(--surface)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <h3 style={{ margin: "0 0 3px 0", color: "var(--ink)", fontSize: "15px" }}>{log.area}</h3>
                          <span style={{ fontSize: "11px", color: "var(--muted)" }}>{log.pic_bertugas} &middot; Minggu {log.minggu_mulai} &middot; {formatWaktu(log.waktu_selesai)}</span>
                        </div>
                        <span style={{ padding: "5px 11px", borderRadius: "20px", fontSize: "11px", fontWeight: 800, background: rusak.length > 0 ? "var(--red-600)" : "var(--ok-50)", color: rusak.length > 0 ? "white" : "var(--ok)" }}>
                          {rusak.length > 0 ? `${rusak.length} Rusak` : "Semua Baik"}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {log.hasil.map((h, i) => (
                          <span key={i} title={h.catatan || undefined} style={{ fontSize: "11px", fontWeight: 700, padding: "5px 10px", borderRadius: "8px", color: "white", background: h.kondisi === "Rusak" ? "var(--red-600)" : h.kondisi === "Tidak Ada" ? "var(--muted)" : "var(--ok)" }}>
                            {h.nama}: {h.kondisi}
                          </span>
                        ))}
                      </div>
                      {rusak.length > 0 && (
                        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {rusak.map((h, i) => (
                            <div key={i} style={{ fontSize: "12px", color: "var(--red-700)", background: "var(--surface)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(220,38,38,0.2)" }}>
                              <strong>{h.nama}:</strong> {h.catatan}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <div style={{ padding: "50px", textAlign: "center", color: "var(--muted)" }}>Belum ada laporan inspeksi fasilitas.</div>
                )}
              </div>
            </div>
          )}

          {/* ============================== TAB 4: PLOT PENEMPATAN — 1 TABEL PER BULAN ============================== */}
          {activeTab === "PLOT" && (
            <div>
              {dailyPlots.length > 0 ? (
                <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "12.5px" }}>
                    <thead>
                      <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                        <th style={{ padding: "12px 15px", borderBottom: "2px solid var(--line)", whiteSpace: "nowrap" }}>Tanggal</th>
                        {kolomLantai.map((l) => <th key={l} style={{ padding: "12px 15px", borderBottom: "2px solid var(--line)", minWidth: "110px" }}>{l}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {daftarTanggalBulanPlot.map((tgl) => {
                        const weekend = isWeekend(tgl);
                        const plot = plotMapBulanIni[tgl];
                        const namaHari = NAMA_HARI_SINGKAT[new Date(`${tgl}T00:00:00`).getDay()];
                        return (
                          <tr key={tgl} style={{ borderBottom: "1px solid var(--line)", background: weekend ? "var(--bg)" : "var(--surface)" }}>
                            <td style={{ padding: "10px 15px", fontWeight: "bold", color: weekend ? "var(--muted)" : "var(--ink)", whiteSpace: "nowrap" }}>
                              {Number(tgl.slice(8, 10))} {namaHari}{weekend ? " · Libur" : ""}
                            </td>
                            {kolomLantai.map((l) => {
                              const petugas = weekend ? "-" : (plot?.plot_lantai?.[l] || "Belum diplot");
                              return <td key={l} style={{ padding: "10px 15px", color: petugas === "Belum diplot" || petugas === "-" ? "var(--muted)" : "var(--ink-soft)", fontWeight: petugas === "Belum diplot" || petugas === "-" ? "normal" : "bold" }}>{petugas}</td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px" }}>Belum ada catatan pembagian tugas OB.</div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
