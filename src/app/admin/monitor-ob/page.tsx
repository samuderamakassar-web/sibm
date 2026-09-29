"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import EvaluasiManualButton, { EvaluasiManualData } from "../../../components/EvaluasiManualButton";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";

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
  evaluasiManual?: EvaluasiManualData | null;
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
  evaluasiManual?: EvaluasiManualData | null;
}

// Sama polanya dgn getTahunBulanChecklist -- minggu_mulai selalu ada (field wajib), jadi gak perlu fallback.
function getTahunBulanInspeksi(item: InspeksiLog): { tahun: number; bulan: number } | null {
  const [y, m] = (item.minggu_mulai || "").split("-").map(Number);
  if (!y || !m) return null;
  return { tahun: y, bulan: m - 1 };
}

export default function MonitorOBPage() {
  const router = useRouter();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    if (!isReady || !session) return;

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
  }, [isReady, session]);

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

  if (!isReady || !session) return null;
  const adminName = session.nama || "Admin";

  return (
    <AdminShell
      title="Pantau Laporan OB & CS"
      subtitle="Log kebersihan, stok gudang, inspeksi fasilitas, dan plot tugas harian"
      userName={adminName}
    >
      <style dangerouslySetInnerHTML={{__html: `
        .tab-count { background: var(--brand); color: #fff; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 700; }
        .print-only { display: none; }
        .ob-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        .ob-table th { padding: 13px 15px; background: var(--bg); color: var(--ink-soft); border-bottom: 2px solid var(--line); font-weight: 700; }
        .ob-table td { padding: 12px 15px; border-bottom: 1px solid var(--line); vertical-align: middle; }
        .plot-table th:first-child, .plot-table td:first-child { position: sticky; left: 0; z-index: 2; }
        .plot-table th:first-child { background: var(--bg); }

        /* HP: tabel jadi kartu per baris (sebelumnya cuma scroll horizontal, lihat §51F).
           Tabel Plot sengaja TIDAK ditransform -- 8 kolom lantai lebih jelas tetap tabel + kolom tanggal lengket. */
        @media (max-width: 768px) {
          .ob-table, .ob-table tbody { display: block; width: 100%; }
          .ob-table thead { display: none; }
          .ob-table tr { display: block; margin-bottom: 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); overflow: hidden; }
          .ob-table tr.ob-detail-row { margin-top: -12px; border-top: none; border-radius: 0 0 16px 16px; }
          .ob-table td { display: block; padding: 10px 15px !important; border-bottom: 1px dashed var(--line); text-align: left !important; }
          .ob-table td:last-child { border-bottom: none; }
          .ob-table td[data-label]::before { content: attr(data-label); display: block; font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
          .ob-table td.ob-empty { text-align: center !important; }
          .ob-filter { width: 100%; }
          .ob-filter .sa-search { width: 100% !important; }
        }

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
      <div className="print-area">

        {/* NAVIGASI TAB */}
        <div className="sa-tabs no-print" role="tablist" aria-label="Jenis laporan OB & CS">
          {([
            { id: "CHECKLIST", label: "Log Pembersihan", icon: "broom", count: 0 },
            { id: "STOCK", label: "Stok & Pengadaan", icon: "box", count: daftarUrgent.length },
            { id: "INSPEKSI", label: "Inspeksi Fasilitas", icon: "search", count: rusakBaruBaruIni },
            { id: "PLOT", label: "Plot Tugas Harian", icon: "clipboardList", count: 0 },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`sa-tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(""); }}
            >
              <AdminIcon name={tab.icon} size={17} />
              {tab.label}
              {tab.count > 0 && <span className="tab-count">{tab.count}</span>}
            </button>
          ))}
        </div>

        {/* CONTAINER KONTEN */}
        <Tile>

          {/* SEARCH BAR + FILTER BULAN (Checklist) + Export PDF */}
          {activeTab !== "PLOT" && (
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px", fontWeight: 700 }}>
                {activeTab === "CHECKLIST" ? "Laporan Pembersihan" : activeTab === "STOCK" ? "Inventory & Pengadaan Gudang OB" : "Inspeksi Fasilitas Mingguan"}
              </h2>
              <div className="ob-filter" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                {activeTab === "CHECKLIST" && (
                  <>
                    <select className="sa-field" aria-label="Filter bulan" value={filterBulanChecklist} onChange={(e) => setFilterBulanChecklist(e.target.value)}>
                      <option value="SEMUA">Semua Bulan</option>
                      {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
                    </select>
                    <select className="sa-field" aria-label="Filter tahun" value={filterTahunChecklist} onChange={(e) => setFilterTahunChecklist(e.target.value)}>
                      <option value="SEMUA">Semua Tahun</option>
                      {tahunTersediaChecklist.map((th) => <option key={th} value={String(th)}>{th}</option>)}
                    </select>
                    <button type="button" className="sa-btn is-primary" onClick={handlePrint}>
                      <AdminIcon name="printer" size={16} /> Export PDF
                    </button>
                  </>
                )}
                {activeTab === "INSPEKSI" && (
                  <>
                    <select className="sa-field" aria-label="Filter bulan" value={filterBulanInspeksi} onChange={(e) => setFilterBulanInspeksi(e.target.value)}>
                      <option value="SEMUA">Semua Bulan</option>
                      {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
                    </select>
                    <select className="sa-field" aria-label="Filter tahun" value={filterTahunInspeksi} onChange={(e) => setFilterTahunInspeksi(e.target.value)}>
                      <option value="SEMUA">Semua Tahun</option>
                      {tahunTersediaInspeksi.map((th) => <option key={th} value={String(th)}>{th}</option>)}
                    </select>
                    <button type="button" className="sa-btn is-primary" onClick={handlePrint}>
                      <AdminIcon name="printer" size={16} /> Export PDF
                    </button>
                  </>
                )}
                <label className="sa-search" style={{ width: "240px" }}>
                  <AdminIcon name="search" size={15} strokeWidth={2} />
                  <input
                    type="search" aria-label="Cari"
                    placeholder={activeTab === "STOCK" ? "Cari nama barang…" : "Cari petugas / area…"}
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}

          {/* HEADER TAB PLOT: pilihan bulan + Buat Plot Baru + Export PDF */}
          {activeTab === "PLOT" && (
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px", fontWeight: 700 }}>Plot Tugas Harian</h2>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <select className="sa-field" aria-label="Bulan plot" value={bulanPlotAktif} onChange={(e) => setBulanFilterPlot(e.target.value)}>
                  {bulanTersediaPlot.length > 0 ? bulanTersediaPlot.map((b) => <option key={b} value={b}>{formatBulanLabel(b)}</option>) : <option value={bulanPlotAktif}>{formatBulanLabel(bulanPlotAktif)}</option>}
                </select>
                <button type="button" className="sa-btn is-dark" onClick={() => router.push("/dashboard/ob/plotting")}>
                  + Buat Plot Baru
                </button>
                <button type="button" className="sa-btn is-primary" onClick={handlePrint}>
                  <AdminIcon name="printer" size={16} /> Export PDF
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

              <div className="no-print" style={{ overflowX: "auto", borderRadius: "14px", border: "1px solid var(--line)" }}>
                <table className="ob-table">
                  <thead>
                    <tr>
                      <th>Waktu Laporan</th>
                      <th>Petugas OB</th>
                      <th>Area</th>
                      <th style={{ textAlign: "center" }}>Status Kebersihan</th>
                      <th style={{ textAlign: "center" }}>Detail</th>
                      <th style={{ textAlign: "center" }}>Evaluasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChecklists.length > 0 ? filteredChecklists.map((item) => {
                      const statusRingkas = getStatusRingkas(item.detail_segmen);
                      const isOpen = expandedId === item.id;
                      const isBersih = statusRingkas === "Bersih Sempurna";
                      const isKosong = statusRingkas === "Belum Ada Data";
                      const tanggalItem = item.tanggal || item.waktu_selesai?.toDate().toISOString().substring(0, 10) || "";
                      return (
                        <Fragment key={item.id}>
                          <tr>
                            <td data-label="Waktu Laporan" style={{ color: "var(--muted)" }}>{formatWaktu(item.waktu_selesai)}</td>
                            <td data-label="Petugas OB" style={{ fontWeight: "bold", color: "var(--ink)" }}>{item.pic_bertugas}</td>
                            <td data-label="Area" style={{ color: "var(--ink-soft)" }}>{item.area}</td>
                            <td data-label="Status Kebersihan" style={{ textAlign: "center" }}>
                              <span style={{
                                background: isBersih ? "var(--ok-50)" : isKosong ? "var(--hover)" : "var(--red-50)",
                                color: isBersih ? "var(--ok)" : isKosong ? "var(--muted)" : "var(--red-700)",
                                padding: "6px 12px", borderRadius: "10px", fontSize: "11.5px", fontWeight: "bold", display: "inline-block"
                              }}>
                                {statusRingkas}
                              </span>
                            </td>
                            <td data-label="Detail" style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className={`sa-btn ${isOpen ? "is-dark" : "is-soft"}`}
                                aria-expanded={isOpen}
                                onClick={() => setExpandedId(isOpen ? null : item.id)}
                                style={{ height: "34px", fontSize: "12px", padding: "0 12px" }}
                              >
                                {isOpen ? "Tutup" : "Lihat Detail"}
                                <AdminIcon name="chevronRight" size={13} strokeWidth={2.2} style={{ transform: isOpen ? "rotate(-90deg)" : "rotate(90deg)" }} />
                              </button>
                            </td>
                            <td data-label="Evaluasi" style={{ textAlign: "center" }}>
                              {tanggalItem && (
                                <EvaluasiManualButton nama={item.pic_bertugas} departemen="OB & CS" sumberJenis="Checklist OB" sumberCollection="ob_checklists" sumberId={item.id} tanggalLaporan={tanggalItem} dievaluasiOleh={adminName} evaluasiSebelumnya={item.evaluasiManual} />
                              )}
                            </td>
                          </tr>

                          {isOpen && (
                            <tr className="ob-detail-row">
                              <td colSpan={6} style={{ padding: "0", background: "var(--bg)" }}>
                                <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
                                  {(item.detail_segmen || []).map((segment, sIdx) => (
                                    <div key={sIdx} style={{ background: "var(--surface)", padding: "15px", borderRadius: "16px" }}>
                                      <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "12.5px", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{segment.nama_segment}</div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                        {segment.jawaban.map((j, jIdx) => (
                                          <div key={jIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "10px", background: j.jawaban === "Ya" ? "var(--ok-50)" : "var(--red-50)" }}>
                                            <span style={{ fontSize: "12.5px", color: "var(--ink)" }}>{j.teks}</span>
                                            <span style={{ flexShrink: 0, fontSize: "10.5px", fontWeight: 900, padding: "3px 8px", borderRadius: "6px", background: j.jawaban === "Ya" ? "var(--ok-solid, var(--ok))" : "var(--brand, var(--red-600))", color: "#fff" }}>{j.jawaban.toUpperCase()}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}

                                  {(item.foto_bukti || []).length > 0 && (
                                    <div>
                                      <div style={{ fontWeight: "bold", color: "var(--ink-soft)", fontSize: "11px", marginBottom: "8px", textTransform: "uppercase" }}>Foto Bukti (Sebelum / Sesudah)</div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        {item.foto_bukti.map((f, fIdx) => (
                                          <div key={fIdx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", maxWidth: "400px" }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={f.before} alt="Sebelum" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "12px", cursor: "pointer" }} onClick={() => window.open(f.before, "_blank")} />
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={f.after} alt="Sesudah" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "12px", cursor: "pointer" }} onClick={() => window.open(f.after, "_blank")} />
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
                      <tr><td colSpan={6} className="ob-empty" style={{ padding: "50px", textAlign: "center", color: "var(--muted)" }}>Belum ada log laporan kebersihan{(filterBulanChecklist !== "SEMUA" || filterTahunChecklist !== "SEMUA") ? " di periode ini" : ""}.</td></tr>
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
                <h3 style={{ margin: "0 0 4px 0", color: "var(--red-600)", fontSize: "15px", fontWeight: 700 }}>Pengadaan Urgent</h3>
                <p style={{ margin: "0 0 12px 0", color: "var(--muted)", fontSize: "12.5px" }}>Sudah di titik/bawah batas minimum — perlu dibeli sekarang.</p>
                {daftarUrgent.length > 0 ? (
                  <div style={{ overflowX: "auto", borderRadius: "14px", border: "1px solid var(--line)" }}>
                    <table className="ob-table">
                      <thead><tr>
                        <th>Nama Barang</th><th>Sisa</th><th>Batas Min.</th><th>Pemakaian/Bulan</th><th>Disarankan Beli</th>
                      </tr></thead>
                      <tbody>
                        {daftarUrgent.map((a) => (
                          <tr key={a.item.id}>
                            <td data-label="Nama Barang" style={{ fontWeight: "bold" }}>{a.item.nama_barang}</td>
                            <td data-label="Sisa" style={{ color: "var(--red-600)", fontWeight: "bold" }}>{a.item.qty}</td>
                            <td data-label="Batas Min." style={{ color: "var(--muted)" }}>{a.item.batas_minimum}</td>
                            <td data-label="Pemakaian/Bulan">{a.adaDataPemakaian ? `${Math.round(a.rataRataPerBulan)} / bulan` : "Belum ada data"}</td>
                            <td data-label="Disarankan Beli"><span style={{ background: "var(--brand)", color: "#fff", padding: "4px 10px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 800, display: "inline-block" }}>Beli {a.jumlahDisarankan} pcs</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12.5px", border: "1px dashed var(--line)", borderRadius: "14px" }}>Aman — tidak ada barang urgent.</div>}
              </div>

              {/* RENCANA BELANJA BULAN DEPAN */}
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "var(--warn)", fontSize: "15px", fontWeight: 700 }}>Rencana Belanja Bulan Depan</h3>
                <p style={{ margin: "0 0 12px 0", color: "var(--muted)", fontSize: "12.5px" }}>Masih aman, tapi diproyeksikan turun ke batas minimum akhir bulan ini.</p>
                {daftarBulanDepan.length > 0 ? (
                  <div style={{ overflowX: "auto", borderRadius: "14px", border: "1px solid var(--line)" }}>
                    <table className="ob-table">
                      <thead><tr>
                        <th>Nama Barang</th><th>Sisa</th><th>Pemakaian/Bulan</th><th>Proyeksi Akhir Bulan</th><th>Disarankan Beli</th>
                      </tr></thead>
                      <tbody>
                        {daftarBulanDepan.map((a) => (
                          <tr key={a.item.id}>
                            <td data-label="Nama Barang" style={{ fontWeight: "bold" }}>{a.item.nama_barang}</td>
                            <td data-label="Sisa">{a.item.qty}</td>
                            <td data-label="Pemakaian/Bulan">{Math.round(a.rataRataPerBulan)} / bulan</td>
                            <td data-label="Proyeksi Akhir Bulan" style={{ color: "var(--warn)", fontWeight: "bold" }}>{a.proyeksiSisaAkhirBulan !== null && a.proyeksiSisaAkhirBulan > 0 ? `≈ ${a.proyeksiSisaAkhirBulan}` : "Bakal habis sebelum akhir bulan"}</td>
                            <td data-label="Disarankan Beli"><span style={{ background: "var(--warn-50)", color: "var(--warn)", padding: "4px 10px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 800, display: "inline-block" }}>Beli {a.jumlahDisarankan} pcs</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12.5px", border: "1px dashed var(--line)", borderRadius: "14px" }}>Belum ada barang yang diproyeksikan turun bulan ini.</div>}
              </div>

              {/* KONDISI STOK GUDANG (mentah) */}
              <div>
                <h3 style={{ margin: "0 0 12px 0", color: "var(--ink)", fontSize: "15px", fontWeight: 700 }}>Kondisi Stok Gudang (Semua Item)</h3>
                <div style={{ overflowX: "auto", borderRadius: "14px", border: "1px solid var(--line)" }}>
                  <table className="ob-table">
                    <thead>
                      <tr>
                        <th>Nama Barang</th>
                        <th style={{ textAlign: "center" }}>Sisa Stok (Qty)</th>
                        <th style={{ textAlign: "center" }}>Batas Minimum</th>
                        <th>Diupdate Oleh</th>
                        <th>Terakhir Diupdate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStocks.length > 0 ? filteredStocks.map((item) => {
                        const isLowStock = item.qty <= item.batas_minimum;
                        return (
                          <tr key={item.id} style={{ background: isLowStock ? "var(--red-50)" : undefined }}>
                            <td data-label="Nama Barang" style={{ fontWeight: "bold", color: "var(--ink)" }}>{item.nama_barang}</td>
                            <td data-label="Sisa Stok (Qty)" style={{ textAlign: "center", fontWeight: 900, color: isLowStock ? "var(--red-600)" : "var(--ok)", fontSize: "14px" }}>{item.qty}</td>
                            <td data-label="Batas Minimum" style={{ textAlign: "center", color: "var(--muted)", fontWeight: "bold" }}>{item.batas_minimum}</td>
                            <td data-label="Diupdate Oleh" style={{ color: "var(--ink-soft)" }}><span style={{ background: "var(--hover)", padding: "4px 8px", borderRadius: "8px", fontSize: "11.5px", fontWeight: "bold" }}>{item.diupdate_oleh || "-"}</span></td>
                            <td data-label="Terakhir Diupdate" style={{ color: "var(--muted)", fontSize: "12px" }}>{formatWaktu(item.terakhir_diupdate)}</td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={5} className="ob-empty" style={{ padding: "50px", textAlign: "center", color: "var(--muted)" }}>Belum ada data barang di inventori.</td></tr>
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
                    <div key={log.id} style={{ border: "1px solid var(--line)", borderRadius: "20px", padding: "18px", background: rusak.length > 0 ? "var(--red-50)" : "var(--surface)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <h3 style={{ margin: "0 0 3px 0", color: "var(--ink)", fontSize: "15px" }}>{log.area}</h3>
                          <span style={{ fontSize: "11px", color: "var(--muted)" }}>{log.pic_bertugas} &middot; Minggu {log.minggu_mulai} &middot; {formatWaktu(log.waktu_selesai)}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ padding: "5px 11px", borderRadius: "20px", fontSize: "11px", fontWeight: 800, background: rusak.length > 0 ? "var(--brand)" : "var(--ok-50)", color: rusak.length > 0 ? "#fff" : "var(--ok)" }}>
                            {rusak.length > 0 ? `${rusak.length} Rusak` : "Semua Baik"}
                          </span>
                          <EvaluasiManualButton nama={log.pic_bertugas} departemen="OB & CS" sumberJenis="Inspeksi Fasilitas" sumberCollection="inspeksi_fasilitas" sumberId={log.id} tanggalLaporan={log.minggu_mulai} dievaluasiOleh={adminName} evaluasiSebelumnya={log.evaluasiManual} />
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {log.hasil.map((h, i) => (
                          <span key={i} title={h.catatan || undefined} style={{ fontSize: "11.5px", fontWeight: 700, padding: "5px 10px", borderRadius: "10px", color: h.kondisi === "Rusak" ? "var(--red-600)" : h.kondisi === "Tidak Ada" ? "var(--ink-soft)" : "var(--ok)", background: h.kondisi === "Rusak" ? "var(--surface)" : h.kondisi === "Tidak Ada" ? "var(--hover)" : "var(--ok-50)" }}>
                            {h.nama}: {h.kondisi}
                          </span>
                        ))}
                      </div>
                      {rusak.length > 0 && (
                        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {rusak.map((h, i) => (
                            <div key={i} style={{ fontSize: "12.5px", color: "var(--red-700)", background: "var(--surface)", padding: "8px 12px", borderRadius: "12px" }}>
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
                <div style={{ overflowX: "auto", borderRadius: "14px", border: "1px solid var(--line)" }}>
                  <table className="plot-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "12.5px" }}>
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
                            <td style={{ padding: "10px 15px", fontWeight: "bold", color: weekend ? "var(--muted)" : "var(--ink)", whiteSpace: "nowrap", background: weekend ? "var(--bg)" : "var(--surface)" }}>
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

        </Tile>
      </div>
    </AdminShell>
  );
}
