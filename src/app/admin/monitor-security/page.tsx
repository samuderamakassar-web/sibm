"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, getDoc, getDocs, doc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { MINIMUM_SESI_PER_SHIFT } from "../../../lib/shift";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import EvaluasiManualButton, { EvaluasiManualData } from "../../../components/EvaluasiManualButton";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon, { type AdminIconName } from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";

type TabId = "PATROLI" | "TAMU" | "PAKET" | "ROSTER";
const TABS: { id: TabId; label: string; icon: AdminIconName }[] = [
  { id: "PATROLI", label: "Log Patroli", icon: "shield" },
  { id: "TAMU", label: "Buku Tamu", icon: "idCard" },
  { id: "PAKET", label: "Log Paket", icon: "box" },
  { id: "ROSTER", label: "Roster Danru", icon: "clipboardList" },
];

// --- INTERFACES ---
interface TitikPatroli {
  id: string;
  waktu_patroli: string;
  kondisi: string;
  foto?: string;
}

interface AreaTerlewat {
  id: string;
  nama: string;
  alasan: string;
}

interface PatroliLog {
  id: string;
  petugas: string;
  waktu_laporan: Timestamp | null;
  status: string;
  catatan_shift: string;
  titik_patroli: TitikPatroli[];
  area_terlewat?: AreaTerlewat[];
  tanggal_shift?: string;
  shift?: string;
  sesi?: string;
  evaluasiManual?: EvaluasiManualData | null;
}

interface VisitorLog {
  id: string;
  nama: string;
  jenis: string;
  instansi_dept: string;
  tujuan: string;
  bertemu_dengan?: string;
  status: string;
  waktu_masuk: Timestamp | null;
  waktu_keluar: Timestamp | null;
  pic_bertugas: string;
}

interface PackageLog {
  id: string;
  jenis_barang: string;
  penerima: string;
  kurir: string;
  status: string;
  waktu_diterima: Timestamp | null;
  waktu_diambil: Timestamp | null;
  foto_bukti_url: string;
}

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function formatPeriodeLabel(filterBulan: string, filterTahun: string): string {
  if (filterBulan === "SEMUA" && filterTahun === "SEMUA") return "Semua Periode";
  const bulanLabel = filterBulan !== "SEMUA" ? NAMA_BULAN[Number(filterBulan)] : "";
  const tahunLabel = filterTahun !== "SEMUA" ? filterTahun : "";
  return [bulanLabel, tahunLabel].filter(Boolean).join(" ");
}

// {tahun, bulan (0-11)} dari waktu_laporan (Timestamp) -- dipakai buat filter Bulan/Tahun Log Patroli
function getTahunBulanPatroli(item: PatroliLog): { tahun: number; bulan: number } | null {
  if (!item.waktu_laporan) return null;
  const d = item.waktu_laporan.toDate();
  return { tahun: d.getFullYear(), bulan: d.getMonth() };
}

const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Roster Danru jalan per siklus 11 -> 10 bulan berikutnya (BUKAN kalender bulan penuh), datanya digabung dari
// 2 dokumen bulanan (data_hari berisi field per-hari 1..akhir bulan). Sebelumnya tabel nampilin SEMUA key yang
// ada di kedua dokumen gabungan itu (jadi kebaca 2 bulan penuh) -- fungsi ini kasih rentang tanggal PERSIS
// sesuai siklusnya (11 bulanAwal s.d. 10 bulan berikutnya), dipakai buat filter tanggal yang ditampilkan.
function hitungPeriodeRoster(bulanAwalStr: string) {
  const [tahunAwal, bulanAwal] = bulanAwalStr.split("-").map(Number); // bulanAwal: 1-12
  const docBulan1 = bulanAwalStr;
  const tglSelesai = new Date(tahunAwal, bulanAwal, 10); // bulanAwal (0-index = bulan berikutnya), tgl 10
  const docBulan2 = `${tglSelesai.getFullYear()}-${String(tglSelesai.getMonth() + 1).padStart(2, "0")}`;
  const tglMulai = new Date(tahunAwal, bulanAwal - 1, 11);
  const labelAwal = tglMulai.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const labelAkhir = tglSelesai.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  return { docBulan1, docBulan2, tglMulaiISO: toISODate(tglMulai), tglAkhirISO: toISODate(tglSelesai), labelPeriode: `${labelAwal} - ${labelAkhir}` };
}

// Default periode: siklus yang lagi aktif hari ini (tgl < 11 -> siklus masih yang mulai bulan lalu)
function hitungBulanAwalDefault(): string {
  const today = new Date();
  let bulanAwal = today.getMonth() + 1;
  let tahunAwal = today.getFullYear();
  if (today.getDate() < 11) {
    bulanAwal -= 1;
    if (bulanAwal === 0) { bulanAwal = 12; tahunAwal -= 1; }
  }
  return `${tahunAwal}-${String(bulanAwal).padStart(2, "0")}`;
}

function labelPeriodeOption(docId: string): string {
  const [y, m] = docId.split("-").map(Number);
  if (!y || !m) return docId;
  return `Mulai ${new Date(y, m - 1, 11).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
}

export default function MonitorSecurityPage() {
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });

  const [activeTab, setActiveTab] = useState<TabId>("PATROLI");
  const [searchQuery, setSearchQuery] = useState("");

  const [patrols, setPatrols] = useState<PatroliLog[]>([]);
  const [visitors, setVisitors] = useState<VisitorLog[]>([]);
  const [packages, setPackages] = useState<PackageLog[]>([]);
  
  const [rosterData, setRosterData] = useState<Record<string, Record<string, string>>>({});
  const [rosterBulan, setRosterBulan] = useState("");
  const [rosterRentang, setRosterRentang] = useState<{ tglMulaiISO: string; tglAkhirISO: string } | null>(null);
  const [rosterPeriodeAwal, setRosterPeriodeAwal] = useState<string>(() => hitungBulanAwalDefault());
  const [rosterDocsTersedia, setRosterDocsTersedia] = useState<string[]>([]);
  const [timSecurity, setTimSecurity] = useState<string[]>([]);
  const [detailPatroli, setDetailPatroli] = useState<PatroliLog | null>(null);

  // Overlay "EXTEND" di tab Roster -- sama data & logika dengan dashboard/security/page.tsx
  // (lihat EskalasiShiftModal.tsx / scripts/shift-handover-escalation.mjs).
  const [daftarExtend, setDaftarExtend] = useState<{ id: string; tanggal_shift: string; shift: string; status: string; personil_extend: string | null; petugas_masuk: string[] }[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "security_shift_extend"), (snap) => {
      setDaftarExtend(snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; tanggal_shift: string; shift: string; status: string; personil_extend: string | null; petugas_masuk: string[] })));
    });
    return () => unsub();
  }, []);
  const cariExtend = (tglKey: string, shiftVal: string, nama: string) =>
    daftarExtend.find((e) => e.tanggal_shift === tglKey && e.shift === shiftVal && e.status !== "selesai" && e.petugas_masuk?.includes(nama));

  // Filter Bulan & Tahun Log Patroli (sama polanya dgn admin/monitor-ob)
  const [filterBulanPatroli, setFilterBulanPatroli] = useState<string>("SEMUA");
  const [filterTahunPatroli, setFilterTahunPatroli] = useState<string>("SEMUA");
  // Kosong di render awal (server & client sama, hindari hydration mismatch), diisi pas tombol print diklik.
  const [waktuCetak, setWaktuCetak] = useState("");

  useEffect(() => {
    if (!isReady || !session) return;

    const unsubPatrol = onSnapshot(query(collection(db, "security_patrols"), orderBy("waktu_laporan", "desc")), (snap) => {
      setPatrols(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as PatroliLog[]);
    });

    const unsubVisitor = onSnapshot(query(collection(db, "security_visitor_logs"), orderBy("waktu_masuk", "desc")), (snap) => {
      setVisitors(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as VisitorLog[]);
    });

    const unsubPackage = onSnapshot(query(collection(db, "packages"), orderBy("waktu_diterima", "desc")), (snap) => {
      setPackages(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as PackageLog[]);
    });

    // Daftar periode roster yang tersedia (buat dropdown pilihan periode) -- one-time fetch, jarang berubah.
    getDocs(collection(db, "security_monthly_schedules")).then((snap) => {
      setRosterDocsTersedia(snap.docs.map((d) => d.id).sort().reverse());
    }).catch((e) => console.error(e));

    return () => { unsubPatrol(); unsubVisitor(); unsubPackage(); };
  }, [isReady, session]);

  // Muat ulang data roster tiap kali periode yang dipilih berubah (default: siklus yang aktif hari ini)
  useEffect(() => {
    const fetchRoster = async () => {
      try {
        const { docBulan1, docBulan2, tglMulaiISO, tglAkhirISO, labelPeriode } = hitungPeriodeRoster(rosterPeriodeAwal);

        const dataSaves: Record<string, Record<string, string>> = {};

        const snap1 = await getDoc(doc(db, "security_monthly_schedules", docBulan1));
        if (snap1.exists()) Object.assign(dataSaves, snap1.data().data_hari || {});

        const snap2 = await getDoc(doc(db, "security_monthly_schedules", docBulan2));
        if (snap2.exists()) Object.assign(dataSaves, snap2.data().data_hari || {});

        setRosterData(dataSaves);
        setRosterBulan(labelPeriode);
        setRosterRentang({ tglMulaiISO, tglAkhirISO });

        const staff = new Set<string>();
        Object.values(dataSaves).forEach(d => Object.keys(d).forEach(n => staff.add(n)));
        setTimSecurity(Array.from(staff).sort());
      } catch (e) { console.error(e); }
    };
    fetchRoster();
  }, [rosterPeriodeAwal]);

  const formatWaktu = (ts: Timestamp | string | null) => {
    if (!ts) return "-";
    const d = (ts as Timestamp).toDate ? (ts as Timestamp).toDate() : new Date(ts as string);
    return d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const tahunTersediaPatroli = Array.from(
    new Set(patrols.map((p) => getTahunBulanPatroli(p)?.tahun).filter((y): y is number => !!y))
  ).sort((a, b) => b - a);
  const fPatrols = patrols.filter((p) => {
    const tb = getTahunBulanPatroli(p);
    const matchBulan = filterBulanPatroli === "SEMUA" || tb?.bulan === Number(filterBulanPatroli);
    const matchTahun = filterTahunPatroli === "SEMUA" || tb?.tahun === Number(filterTahunPatroli);
    const matchSearch = p.petugas?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchBulan && matchTahun && matchSearch;
  });
  const fVisitors = visitors.filter(v => v.nama?.toLowerCase().includes(searchQuery.toLowerCase()) || v.instansi_dept?.toLowerCase().includes(searchQuery.toLowerCase()));
  const fPackages = packages.filter(p => p.penerima?.toLowerCase().includes(searchQuery.toLowerCase()) || p.kurir?.toLowerCase().includes(searchQuery.toLowerCase()));

  // Tanggal yang ditampilkan di tabel Roster -- PERSIS rentang siklus (11 s.d. 10 bulan berikutnya),
  // bukan seluruh key gabungan 2 dokumen bulanan (itu penyebab dulu kebaca "1 bulan penuh").
  const daftarTanggalPeriode: string[] = [];
  if (rosterRentang) {
    const [y1, m1, d1] = rosterRentang.tglMulaiISO.split("-").map(Number);
    const [y2, m2, d2] = rosterRentang.tglAkhirISO.split("-").map(Number);
    const cur = new Date(y1, m1 - 1, d1);
    const end = new Date(y2, m2 - 1, d2);
    while (cur <= end) {
      daftarTanggalPeriode.push(toISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Rekap kepatuhan sesi -- gabungan dari log yang benar-benar ada (fPatrols) + jadwal roster periode
  // aktif, supaya staf yang DIJADWALKAN tapi nihil laporan sama sekali ikut kelihatan (bukan cuma yang kurang).
  // Data patroli sebelum fitur sesi dirilis tidak punya tanggal_shift/shift/sesi -- dilewati (bukan dianggap gagal).
  const rekapSesiMap = new Map<string, { tanggal_shift: string; shift: string; petugas: string; sesiSet: Set<string> }>();
  fPatrols.forEach((p) => {
    if (!p.tanggal_shift || !p.shift || !p.sesi) return;
    const key = `${p.tanggal_shift}|${p.shift}|${p.petugas}`;
    if (!rekapSesiMap.has(key)) rekapSesiMap.set(key, { tanggal_shift: p.tanggal_shift, shift: p.shift, petugas: p.petugas, sesiSet: new Set() });
    rekapSesiMap.get(key)!.sesiSet.add(p.sesi);
  });
  if (rosterRentang) {
    daftarTanggalPeriode.forEach((tgl) => {
      const hariData = rosterData[tgl] || {};
      Object.entries(hariData).forEach(([staf, shiftLabel]) => {
        if (shiftLabel !== "Shift 1" && shiftLabel !== "Shift 2") return;
        const key = `${tgl}|${shiftLabel}|${staf}`;
        if (!rekapSesiMap.has(key)) rekapSesiMap.set(key, { tanggal_shift: tgl, shift: shiftLabel, petugas: staf, sesiSet: new Set() });
      });
    });
  }
  const rekapSesiRows = Array.from(rekapSesiMap.values())
    .filter((row) => filterBulanPatroli === "SEMUA" || Number(row.tanggal_shift.split("-")[1]) - 1 === Number(filterBulanPatroli))
    .filter((row) => filterTahunPatroli === "SEMUA" || row.tanggal_shift.split("-")[0] === filterTahunPatroli)
    .sort((a, b) => b.tanggal_shift.localeCompare(a.tanggal_shift) || a.petugas.localeCompare(b.petugas));

  const handlePrint = () => {
    setWaktuCetak(new Date().toLocaleString("id-ID"));
    setTimeout(() => window.print(), 0);
  };

  if (!isReady || !session) return null;
  const adminName = session.nama || "Admin";

  return (
    <AdminShell
      title="Pantau Laporan Security"
      subtitle="Log patroli, buku tamu, paket, dan roster regu jaga"
      userName={adminName}
    >
      {/* 💡 CSS RESPONSIVE & ANTI-OVERFLOW MAGIC */}
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }
        
        /* Table Styles Desktop */
        .sec-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .sec-table th { padding: 15px; font-weight: bold; background: var(--bg); color: var(--ink-soft); border-bottom: 2px solid var(--line); }
        .sec-table td { padding: 15px; vertical-align: middle; border-bottom: 1px solid var(--line); word-wrap: break-word; }

        /* Detail Modal Grid */
        .grid-foto { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .header-title-container { flex-direction: column; align-items: stretch !important; gap: 15px; }
          .search-input-wrapper { width: 100% !important; margin-top: 10px; }
          .search-input-wrapper input { width: 100% !important; max-width: 100% !important; }
          
          /* Transformasi Tabel ke Card */
          .sec-table, .sec-table tbody { display: block; width: 100%; }
          .sec-table thead { display: none; }
          .sec-table tr { 
            display: block; width: 100%; margin-bottom: 15px; 
            border: 1px solid var(--line); border-radius: 12px; 
            background: var(--surface); box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;
          }
          .sec-table td { 
            display: block; width: 100%; padding: 15px !important; 
            border-bottom: 1px dashed var(--line) !important; text-align: left !important;
          }
          .sec-table td:last-child { border-bottom: none !important; }
          
          /* Roster Table Specific Scroll */
          .roster-wrapper { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .roster-table { width: 100%; min-width: 600px; display: table !important; }
          .roster-table thead { display: table-header-group !important; }
          .roster-table tr { display: table-row !important; border: none; box-shadow: none; border-bottom: 1px solid var(--line); }
          .roster-table td, .roster-table th { display: table-cell !important; padding: 10px !important; border-bottom: 1px solid var(--line) !important; text-align: center !important;}
          .roster-table th:first-child, .roster-table td:first-child { position: sticky; left: 0; background: var(--surface); z-index: 5; border-right: 1px solid var(--line); }
          .roster-table th:first-child { z-index: 6; background: var(--bg); }

          /* Modal Grid */
          .grid-foto { grid-template-columns: 1fr; }
        }
      `}} />

      {/* 🖨️ CSS CETAK — Log Patroli dicetak A4 potrait, Roster dicetak A4 landscape (nentuin orientasi via activeTab). */}
      <style dangerouslySetInnerHTML={{__html: `
        .print-only { display: none; }
        @media print {
          @page { size: A4 ${activeTab === "ROSTER" ? "landscape" : "portrait"}; margin: ${activeTab === "ROSTER" ? "10mm" : "15mm"}; }
          html, body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; }
          .no-print { display: none !important; }
          .print-area { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; }
          .print-only { display: block !important; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          th, td { border: 1px solid #cbd5e0 !important; padding: 6px 8px !important; text-align: left; }
          th { background-color: #f1f5f9 !important; font-weight: bold !important; color: #2d3748 !important; }

          /* Roster dipadatkan biar 1 periode (maks 31 hari) muat 1 lembar A4 landscape */
          .roster-wrapper { border: none !important; overflow: visible !important; }
          .roster-table th, .roster-table td { padding: 2px 4px !important; font-size: 8px !important; }
          .roster-table span { font-size: 7.5px !important; padding: 1px 5px !important; }
        }
      `}} />

      {/* 🖨️ KOP CETAK — cuma muncul pas print. Roster pakai logo Samudera + judul "Roster Security Periode ...",
          Patroli pakai kop teks polos sama seperti admin/monitor-ob. */}
      <div className="print-only" style={{ marginBottom: "15px" }}>
        {activeTab === "ROSTER" ? (
          <div style={{ display: "flex", alignItems: "center", gap: "15px", borderBottom: "2px solid #2d3748", paddingBottom: "10px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-samudera.png" alt="Logo Samudera" style={{ height: "42px" }} />
            <div>
              <h2 style={{ margin: 0, fontSize: "17px" }}>ROSTER SECURITY — PERIODE {rosterBulan || "-"}</h2>
              <p style={{ margin: "4px 0 0", fontSize: "11px" }}>Dicetak: {waktuCetak}</p>
            </div>
          </div>
        ) : (
          <div style={{ borderBottom: "2px solid #2d3748", paddingBottom: "10px" }}>
            <h2 style={{ margin: 0 }}>Log Patroli Keliling Security — {formatPeriodeLabel(filterBulanPatroli, filterTahunPatroli)}</h2>
            <p style={{ margin: "4px 0 0", fontSize: "11px" }}>Dicetak: {waktuCetak}</p>
          </div>
        )}
      </div>

      {/* 🔹 KONTEN UTAMA */}
      <div className="print-area">

        {/* TABS */}
        <div className="sa-tabs no-print" role="tablist" aria-label="Jenis laporan">
          {TABS.map((tab) => (
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
            </button>
          ))}
        </div>

        <Tile>

          {activeTab !== "ROSTER" && (
            <div className="header-title-container no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px", fontWeight: 700 }}>
                {activeTab === "PATROLI" ? "Laporan Patroli Keliling" : activeTab === "TAMU" ? "Catatan Akses Keluar/Masuk" : "Penerimaan Paket & Dokumen"}
              </h2>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                {activeTab === "PATROLI" && (
                  <>
                    <select className="sa-field" aria-label="Filter bulan" value={filterBulanPatroli} onChange={(e) => setFilterBulanPatroli(e.target.value)}>
                      <option value="SEMUA">Semua Bulan</option>
                      {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
                    </select>
                    <select className="sa-field" aria-label="Filter tahun" value={filterTahunPatroli} onChange={(e) => setFilterTahunPatroli(e.target.value)}>
                      <option value="SEMUA">Semua Tahun</option>
                      {tahunTersediaPatroli.map((th) => <option key={th} value={String(th)}>{th}</option>)}
                    </select>
                    <button type="button" className="sa-btn is-primary" onClick={handlePrint}>
                      <AdminIcon name="printer" size={16} /> Export PDF
                    </button>
                  </>
                )}
                <label className="sa-search search-input-wrapper" style={{ width: "260px" }}>
                  <AdminIcon name="search" size={15} strokeWidth={2} />
                  <input type="search" aria-label="Cari" placeholder={activeTab === "PATROLI" ? "Cari nama petugas…" : activeTab === "TAMU" ? "Cari nama / instansi…" : "Cari penerima / kurir…"} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {/* TAB 1: PATROLI */}
          {activeTab === "PATROLI" && (
            <>
            {/* Versi cetak: laporan lengkap per patroli -- semua titik dipatroli (kondisi+waktu+foto), area terlewat, catatan shift. */}
            <div className="print-only">
              <div style={{ fontSize: "10px", marginBottom: "10px" }}>Total laporan patroli: {fPatrols.length}</div>
              {fPatrols.map((p) => (
                <div key={p.id} style={{ border: "1px solid #cbd5e0", borderRadius: "6px", padding: "10px 12px", marginBottom: "12px", breakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "12px", marginBottom: "3px" }}>
                    <span>👮 {p.petugas}</span>
                    <span>{formatWaktu(p.waktu_laporan)}</span>
                  </div>
                  <div style={{ fontSize: "10px", color: "#4a5568", marginBottom: "8px" }}>
                    Status: {p.status} &nbsp;|&nbsp; {p.titik_patroli?.length || 0} titik terpantau
                    {p.area_terlewat && p.area_terlewat.length > 0 ? ` | ${p.area_terlewat.length} area terlewat` : ""}
                  </div>
                  {p.catatan_shift && (
                    <div style={{ fontSize: "9.5px", fontStyle: "italic", color: "#4a5568", marginBottom: "6px" }}>Catatan shift: &quot;{p.catatan_shift}&quot;</div>
                  )}

                  {(p.titik_patroli || []).map((t, tIdx) => (
                    <div key={tIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "9.5px", padding: "2px 0", borderBottom: "1px dotted #cbd5e0", gap: "8px" }}>
                      <span>{t.id.split("::")[0]} — {t.id.split("::")[1]} &nbsp;<span style={{ color: "#718096" }}>({t.waktu_patroli})</span></span>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        <span style={{ fontWeight: "bold" }}>{t.kondisi}</span>
                        {t.foto && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.foto} alt={t.id} style={{ width: "40px", height: "40px", objectFit: "cover", border: "1px solid #cbd5e0", borderRadius: "4px" }} />
                        )}
                      </span>
                    </div>
                  ))}

                  {p.area_terlewat && p.area_terlewat.length > 0 && (
                    <div style={{ marginTop: "6px" }}>
                      <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#9f1d1d" }}>Area Tidak Difoto:</div>
                      {p.area_terlewat.map((a, aIdx) => (
                        <div key={aIdx} style={{ fontSize: "9.5px", color: "#9f1d1d" }}>
                          {a.id.split("::")[0]} — {a.nama}: &quot;{a.alasan || "Tidak ada alasan dicantumkan"}&quot;
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="no-print" style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
              <table className="sec-table">
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Waktu Laporan</th>
                    <th style={{ width: "25%" }}>Petugas Patroli</th>
                    <th style={{ width: "20%" }}>Total Titik Di-Scan</th>
                    <th style={{ width: "20%" }}>Lantai Dipatroli</th>
                    <th style={{ width: "20%", textAlign: "center" }}>Status Keliling</th>
                    <th style={{ width: "15%", textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {fPatrols.length > 0 ? fPatrols.map(p => (
                    <tr key={p.id}>
                      <td style={{ color: "var(--muted)" }}>{formatWaktu(p.waktu_laporan)}</td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{p.petugas}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{p.titik_patroli?.length || 0} Titik Terpantau</div>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "var(--ink)" }}>
                          {Array.from(new Set((p.titik_patroli || []).map((t) => t.id.split("::")[0]))).join(", ") || "-"}
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ background: p.status.includes("Sempurna") ? "var(--ok-50)" : "var(--warn-50)", color: p.status.includes("Sempurna") ? "var(--ok)" : "var(--warn)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", display: "inline-block" }}>{p.status}</span>
                        {p.area_terlewat && p.area_terlewat.length > 0 && (
                          <div style={{ fontSize: "10px", color: "var(--red-700)", marginTop: "4px" }}>{p.area_terlewat.length} area terlewat</div>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <button type="button" className="sa-btn is-soft" onClick={() => setDetailPatroli(p)} style={{ width: "100%", height: "36px", fontSize: "12px" }}>
                            <AdminIcon name="fileText" size={15} /> Lihat Laporan
                          </button>
                          {p.tanggal_shift && (
                            <EvaluasiManualButton nama={p.petugas} departemen="Security" sumberJenis="Patroli Security" sumberCollection="security_patrols" sumberId={p.id} tanggalLaporan={p.tanggal_shift} dievaluasiOleh={adminName} evaluasiSebelumnya={p.evaluasiManual} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada log patroli yang cocok dengan pencarian.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* REKAP KEPATUHAN SESI PATROLI -- minimal 2 dari 3 sesi per shift */}
            <div className="no-print" style={{ marginTop: "25px" }}>
              <h3 style={{ margin: "0 0 12px 0", color: "var(--ink)", fontSize: "16px" }}>Rekap Kepatuhan Sesi Patroli</h3>
              <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "var(--muted)" }}>
                Setiap petugas wajib patroli minimal {MINIMUM_SESI_PER_SHIFT} dari 3 sesi per shift. Data sesi tersedia sejak fitur ini dirilis — laporan lama ditandai belum tersedia, bukan gagal.
              </p>
              <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
                <table className="sec-table">
                  <thead>
                    <tr>
                      <th style={{ width: "16%" }}>Tanggal Shift</th>
                      <th style={{ width: "14%" }}>Shift</th>
                      <th style={{ width: "22%" }}>Petugas</th>
                      <th style={{ width: "12%", textAlign: "center" }}>Sesi 1</th>
                      <th style={{ width: "12%", textAlign: "center" }}>Sesi 2</th>
                      <th style={{ width: "12%", textAlign: "center" }}>Sesi 3</th>
                      <th style={{ width: "12%", textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rekapSesiRows.length > 0 ? rekapSesiRows.map((row) => {
                      const jumlah = row.sesiSet.size;
                      const memenuhi = jumlah >= MINIMUM_SESI_PER_SHIFT;
                      const statusLabel = memenuhi ? "Memenuhi Minimum" : jumlah === 0 ? "Tidak Ada Laporan" : "Kurang";
                      const statusWarna = memenuhi ? "var(--ok)" : jumlah === 0 ? "var(--red-600)" : "var(--warn)";
                      const statusBg = memenuhi ? "var(--ok-50)" : jumlah === 0 ? "var(--red-50)" : "var(--warn-50)";
                      return (
                        <tr key={`${row.tanggal_shift}|${row.shift}|${row.petugas}`}>
                          <td style={{ color: "var(--muted)" }}>{row.tanggal_shift}</td>
                          <td style={{ fontWeight: "bold" }}>{row.shift}</td>
                          <td style={{ fontWeight: "bold", color: "var(--ink)" }}>{row.petugas}</td>
                          {["Sesi 1", "Sesi 2", "Sesi 3"].map((s) => (
                            <td key={s} style={{ textAlign: "center", color: row.sesiSet.has(s) ? "var(--ok)" : "var(--muted)", fontWeight: "bold" }}>
                              {row.sesiSet.has(s) ? "✓" : "—"}
                            </td>
                          ))}
                          <td style={{ textAlign: "center" }}>
                            <span style={{ background: statusBg, color: statusWarna, padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", display: "inline-block" }}>{statusLabel}</span>
                          </td>
                        </tr>
                      );
                    }) : <tr><td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada data sesi patroli untuk periode ini.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}

          {/* TAB 2: TAMU */}
          {activeTab === "TAMU" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
              <table className="sec-table">
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Identitas</th>
                    <th style={{ width: "30%" }}>Asal & Tujuan</th>
                    <th style={{ width: "25%", textAlign: "center" }}>Status & Waktu</th>
                    <th style={{ width: "15%" }}>PIC Security</th>
                  </tr>
                </thead>
                <tbody>
                  {fVisitors.length > 0 ? fVisitors.map(v => (
                    <tr key={v.id}>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--info)", fontSize: "14px" }}>{v.nama}</div>
                        <span style={{ fontSize: "10px", background: v.jenis === "Karyawan" ? "var(--bg)" : "var(--red-50)", color: v.jenis === "Karyawan" ? "var(--ink-soft)" : "var(--red-700)", padding: "2px 6px", borderRadius: "4px", display: "inline-block", marginTop: "4px" }}>{v.jenis}</span>
                      </td>
                      <td>
                        <div style={{ color: "var(--ink-soft)" }}>{v.instansi_dept}</div>
                        {v.jenis !== "Karyawan" && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>Host: {v.bertemu_dengan}</div>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ background: v.status.includes("Dalam") ? "var(--ok-50)" : "var(--line)", color: v.status.includes("Dalam") ? "var(--ok)" : "var(--ink-soft)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", marginBottom: "6px", display: "inline-block" }}>{v.status}</div>
                        <div style={{ fontSize: "11px", color: "var(--ok)", fontWeight: "bold" }}>In: {formatWaktu(v.waktu_masuk)}</div>
                        <div style={{ fontSize: "11px", color: "var(--red-600)", fontWeight: "bold" }}>Out: {formatWaktu(v.waktu_keluar)}</div>
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "12px", fontWeight: "bold" }}>{v.pic_bertugas}</td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada log akses masuk.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: PAKET */}
          {activeTab === "PAKET" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
              <table className="sec-table">
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Jenis Barang</th>
                    <th style={{ width: "30%" }}>Penerima & Kurir</th>
                    <th style={{ width: "25%" }}>Waktu Diterima Pos</th>
                    <th style={{ width: "25%", textAlign: "center" }}>Status Pengambilan</th>
                  </tr>
                </thead>
                <tbody>
                  {fPackages.length > 0 ? fPackages.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{p.jenis_barang}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: "bold", color: "var(--info)" }}>{p.penerima}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>Kurir: {p.kurir}</div>
                      </td>
                      <td>
                        <div style={{ color: "var(--ink-soft)", fontSize: "12px" }}>{formatWaktu(p.waktu_diterima)}</div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ background: p.status === "Belum Diambil" ? "var(--warn-50)" : "var(--ok-50)", color: p.status === "Belum Diambil" ? "var(--warn)" : "var(--ok)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", marginBottom: "6px", display: "inline-block" }}>{p.status}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "bold" }}>{p.status !== "Belum Diambil" ? formatWaktu(p.waktu_diambil) : "-"}</div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada resi paket.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: ROSTER */}
          {activeTab === "ROSTER" && (
            <div>
              <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  Roster Danru Security
                  <span style={{ background: "var(--info-50)", color: "var(--info)", padding: "4px 10px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 700 }}>{rosterBulan || "Belum Diterbitkan"}</span>
                </h2>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    className="sa-field"
                    aria-label="Periode roster"
                    value={rosterPeriodeAwal}
                    onChange={(e) => setRosterPeriodeAwal(e.target.value)}
                  >
                    {!rosterDocsTersedia.includes(rosterPeriodeAwal) && <option value={rosterPeriodeAwal}>{labelPeriodeOption(rosterPeriodeAwal)}</option>}
                    {rosterDocsTersedia.map((docId) => <option key={docId} value={docId}>{labelPeriodeOption(docId)}</option>)}
                  </select>
                  {Object.keys(rosterData).length > 0 && (
                    <button type="button" className="sa-btn is-dark" onClick={handlePrint}>
                      <AdminIcon name="printer" size={16} /> Print (A4 Landscape)
                    </button>
                  )}
                </div>
              </div>
              {Object.keys(rosterData).length > 0 ? (
                <div className="roster-wrapper" style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid var(--line)" }}>
                  <table className="roster-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                        <th style={{ padding: "8px 12px", borderBottom: "2px solid var(--line)", textAlign: "left", fontSize: "11px" }}>Tgl</th>
                        {timSecurity.map(staf => <th key={staf} style={{ padding: "8px 10px", borderBottom: "2px solid var(--line)", minWidth: "84px", fontSize: "11px" }}>{staf}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {daftarTanggalPeriode.map(tglKey => {
                        const isHariIni = tglKey === toISODate(new Date());
                        const hariData = rosterData[tglKey] || {};
                        return (
                          <tr key={tglKey} style={{ background: isHariIni ? "var(--red-50)" : "var(--surface)", borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: "5px 12px", textAlign: "left", fontWeight: isHariIni ? "900" : "bold", color: isHariIni ? "var(--red-700)" : "var(--muted)", fontSize: "11.5px", whiteSpace: "nowrap" }}>
                              {tglKey.split("-")[2]}{isHariIni && <span style={{ fontSize: "8px", background: "var(--brand)", color: "#fff", padding: "1px 5px", borderRadius: "4px", marginLeft: "5px" }}>HARI INI</span>}
                            </td>
                            {timSecurity.map(staf => {
                              const shift = hariData[staf] || "-";
                              const isOff = shift.toLowerCase().includes("off");
                              const isKosong = shift === "-";
                              const extend = cariExtend(tglKey, shift, staf);
                              const chipBg = extend ? (extend.status === "menunggu_keputusan" ? "var(--red-50)" : "var(--accent-50)") : isKosong ? "transparent" : isOff ? "var(--red-50)" : shift.includes("2") ? "var(--accent-50)" : "var(--info-50)";
                              const chipColor = extend ? (extend.status === "menunggu_keputusan" ? "var(--red-600)" : "var(--accent)") : isKosong ? "var(--muted)" : isOff ? "var(--red-600)" : shift.includes("2") ? "var(--accent)" : "var(--info)";
                              const label = extend
                                ? extend.status === "menunggu_keputusan" ? "⚠️ TERLAMBAT" : `${shift} → ${extend.personil_extend} (EXTEND)`
                                : shift;
                              return (
                                <td key={staf} style={{ padding: "5px 6px" }}>
                                  <span style={{ display: "inline-block", padding: isKosong ? "0" : "3px 9px", borderRadius: "20px", background: chipBg, color: chipColor, fontWeight: 700, fontSize: "10.5px" }}>{label}</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px" }}>Danru belum menerbitkan roster untuk periode ini.</div>}
            </div>
          )}

        </Tile>
      </div>

      {/* 🔹 MODAL DETAIL PATROLI */}
      {detailPatroli && (
        <div className="no-print" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "15px", backdropFilter: "blur(5px)" }}>
          <div role="dialog" aria-modal="true" aria-label="Laporan titik patroli" style={{ background: "var(--tile)", padding: "0", borderRadius: "24px", width: "100%", maxWidth: "800px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* Header Modal */}
            <div style={{ background: "var(--tile)", color: "var(--ink)", padding: "18px 20px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <div>
                <h2 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: 700 }}>Laporan Titik Patroli</h2>
                <div style={{ fontSize: "12px", color: "var(--ink-soft)" }}>Oleh {detailPatroli.petugas} · {formatWaktu(detailPatroli.waktu_laporan)}</div>
              </div>
              <button type="button" className="sa-icon-btn" onClick={() => setDetailPatroli(null)} aria-label="Tutup" style={{ background: "var(--hover)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div style={{ padding: "20px", overflowY: "auto", flex: 1, background: "var(--bg)" }}>
              <div style={{ background: "var(--info-50)", padding: "15px", borderRadius: "12px", marginBottom: "20px", border: "1px solid var(--info)", color: "var(--info)", fontSize: "13px", lineHeight: "1.5" }}>
                <strong>Catatan Shift:</strong> <br/><i style={{ color: "var(--info)" }}>&quot;{detailPatroli.catatan_shift || "Tidak ada catatan khusus dari petugas."}&quot;</i>
              </div>

              {/* Grid Foto Titik */}
              <div className="grid-foto">
                {detailPatroli.titik_patroli?.map((t, i) => {
                  const isAman = t.kondisi.includes("Aman");
                  return (
                    <div key={i} style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--line)", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                      <div style={{ position: "relative" }}>
                        {t.foto ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={t.foto} alt="Titik Patroli" style={{ width: "100%", height: "200px", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "200px", background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", color: "var(--muted)", fontSize: "12px", fontStyle: "italic" }}>Tanpa Foto</div>
                        )}
                        <div style={{ position: "absolute", bottom: "10px", right: "10px", background: "rgba(0,0,0,0.7)", color: "white", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold" }}>{t.waktu_patroli}</div>
                      </div>
                      
                      <div style={{ padding: "15px" }}>
                        <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: "bold", textTransform: "uppercase" }}>{t.id.split("::")[0]}</div>
                        <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "13px", margin: "4px 0 10px 0", lineHeight: "1.3" }}>{t.id.split("::")[1]}</div>
                        <span style={{ fontSize: "11px", background: isAman ? "var(--ok-50)" : "var(--red-50)", color: isAman ? "var(--ok)" : "var(--red-700)", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", display: "inline-block" }}>
                          {t.kondisi}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {detailPatroli.area_terlewat && detailPatroli.area_terlewat.length > 0 && (
                  <div style={{ marginTop: "20px", background: "var(--red-50)", border: "1px solid var(--red-600)", borderRadius: "12px", padding: "15px" }}>
                    <h3 style={{ margin: "0 0 10px 0", color: "var(--red-700)", fontSize: "14px" }}>⚠️ {detailPatroli.area_terlewat.length} Area Tidak Difoto</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {detailPatroli.area_terlewat.map((a, i) => (
                        <div key={i} style={{ background: "var(--surface)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--red-600)" }}>
                          <div style={{ fontSize: "11px", color: "var(--red-700)", fontWeight: "bold" }}>{a.id.split("::")[0]} — {a.nama}</div>
                          <div style={{ fontSize: "12px", color: "var(--ink-soft)", marginTop: "4px" }}><i>&quot;{a.alasan || "Tidak ada alasan dicantumkan"}&quot;</i></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </AdminShell>
  );
}