"use client";

import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import AdminShell from "../admin/AdminShell";
import { daerahTulis } from "@/lib/daerah";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan halaman OB lain (DashboardOBPage/ChecklistOBPage)
// ==========================================
type IconProps = { size?: number; color?: string };
const IconPackage = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></svg>
);
const IconAlertTriangle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 4.5 2.9 18a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.5 4.5a2 2 0 0 0-3 0z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
const IconShoppingCart = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M2.5 3h2l2.4 12.2a2 2 0 0 0 2 1.6h7a2 2 0 0 0 2-1.6L20 7H6" /></svg>
);
const IconTrendingUp = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17 9 11 13 15 21 7" /><path d="M15 7h6v6" /></svg>
);
const IconClipboard = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6" /><path d="M9 15h6" /><path d="M9 19h3" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconEdit = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
);
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
);
const IconCheck = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);

// ==========================================
// INTERFACES
// ==========================================
interface StockItem {
  id: string;
  nama_barang: string;
  qty: number;
  batas_minimum: number;
  kategori?: Kategori; // §97 -- kosong (data lama) = ditebak dari nama
}

// ==========================================
// §97 KATEGORI BARANG -- Chemical / Utilitas Gedung / Dapur & Rumah Tangga.
// Barang lama tanpa field kategori ditebak dari namanya (bisa dikoreksi lewat Edit).
// ==========================================
const KATEGORI = ["Chemical", "Utilitas Gedung", "Dapur & Rumah Tangga"] as const;
type Kategori = (typeof KATEGORI)[number];
const WARNA_KAT: Record<Kategori, { bg: string; fg: string }> = {
  "Chemical": { bg: "var(--info-50)", fg: "var(--info)" },
  "Utilitas Gedung": { bg: "var(--warn-50)", fg: "var(--warn)" },
  "Dapur & Rumah Tangga": { bg: "var(--ok-50)", fg: "var(--ok)" },
};
const POLA_DAPUR = /cuci piring|sunlight|mama lemon|gula|kopi|^teh|teh|susu|creamer|air mineral|galon|aqua|gelas|piring|sendok|tisu|tissue|kantong|plastik|kresek|kanebo|spons|sponge|sapu|pel|lap|serbet|ember|sikat|keset|sarung tangan|masker/i;
const POLA_UTILITAS = /lampu|tl|led|bohlam|watt|kabel|stop ?kontak|terminal|baterai|batre|fitting|saklar|kran|keran|selang|kunci|gembok|filter|lem|isolasi|lakban|paku|sekring|mcb|starter|ballast|klep|pipa|engsel|obeng/i;
const POLA_CHEMICAL = /sabun|vixal|wipol|porstex|karbol|kamper|kapur barus|pengharum|pewangi|stella|glade|baygon|hit|cairan|deterjen|detergen|rinso|soklin|so klin|desinfektan|disinfektan|alkohol|sanitizer|cleaner|cling|superpell|super pell|bayclin|molto|kispray|chemical|pembersih|semir|polish|lilin|wax|asam|soda|clorox|lysol|dettol|lifeboy|lifebuoy|hand ?soap/i;
function tebakKategori(nama: string): Kategori {
  if (POLA_DAPUR.test(nama)) return "Dapur & Rumah Tangga";
  if (POLA_UTILITAS.test(nama)) return "Utilitas Gedung";
  if (POLA_CHEMICAL.test(nama)) return "Chemical";
  return "Dapur & Rumah Tangga";
}
const kategoriOf = (item: StockItem): Kategori => (item.kategori && KATEGORI.includes(item.kategori) ? item.kategori : tebakKategori(item.nama_barang));

/** Baris pemisah kelompok di tabel (hanya saat filter "Semua"). */
function BarisKelompok({ k, n, kolom }: { k: Kategori; n: number; kolom: number }) {
  return (
    <tr><td colSpan={kolom} style={{ background: WARNA_KAT[k].bg, color: WARNA_KAT[k].fg, fontWeight: 800, fontSize: "12px", padding: "7px 12px", letterSpacing: ".02em" }}>{k} · {n}</td></tr>
  );
}

interface StockLog {
  id: string;
  id_barang?: string;
  nama_barang: string;
  jenis_transaksi: string;
  jumlah_perubahan: number;
  sisa_stok_akhir: number;
  pic_bertugas: string;
  waktu_transaksi: Timestamp | null;
}

// ==========================================
// ANALISA PEMAKAIAN
// Dihitung dari histori transaksi KELUAR (pemakaian) per barang — bukan query baru per
// item, cuma diturunkan dari 1 batch log yang sama (lihat LIMIT_LOG_ANALISA di bawah).
// Formula sengaja simpel & bisa dijelasin ke staf non-teknis, bukan model statistik rumit:
//   - rata-rata/hari = total qty KELUAR / rentang hari data yang ada (dari log tertua ke sekarang)
//   - rata-rata/bulan = rata-rata/hari x 30
//   - proyeksi habis = sisa stok / rata-rata per hari (kalau ada histori pemakaian)
//   - target stok sehat = batas minimum + rata-rata pemakaian/bulan (buffer + kebutuhan 1 bulan ke depan)
//   - jumlah disarankan beli = target stok sehat - sisa stok sekarang (minimal 0)
// ==========================================
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LIMIT_LOG_ANALISA = 400;

interface AnalisaPemakaian {
  item: StockItem;
  adaDataPemakaian: boolean;
  rataRataPerBulan: number;
  rataRataPerHari: number;
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
    return { item, adaDataPemakaian: false, rataRataPerBulan: 0, rataRataPerHari: 0, proyeksiHabisHari: null, proyeksiSisaAkhirBulan: null, jumlahDisarankan, isUrgent, isPerluBulanDepan: false };
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

  return { item, adaDataPemakaian: true, rataRataPerBulan, rataRataPerHari, proyeksiHabisHari, proyeksiSisaAkhirBulan, jumlahDisarankan, isUrgent, isPerluBulanDepan };
}

export default function StockOpnamePage() {
  const showToast = useToast();
  const confirm = useConfirm();

  const { session, isReady: isAuthReady } = useAuthGuard({
    depts: ["OB & CS"],
    redirectTo: "/dashboard/ob",
    deniedMessage: "Akses Ditolak! Halaman ini khusus tim operasional OB & CS.",
  });
  const [isReady, setIsReady] = useState(false);

  // Data States
  const [items, setItems] = useState<StockItem[]>([]);
  const [riwayatLogs, setRiwayatLogs] = useState<StockLog[]>([]);

  // Form States
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ nama_barang: "", qty: 0, batas_minimum: 5, kategori: "" as Kategori | "" });
  const [filterKat, setFilterKat] = useState<Kategori | "Semua">("Semua");
  const [isLoading, setIsLoading] = useState(false);

  const picRef = useRef("");

  // ==========================================
  // EFEK 2: Listener Stok & Riwayat (Real-time)
  // ==========================================
  useEffect(() => {
    if (!isAuthReady || !session) return;
    picRef.current = session.nama;

    // A. Listener Stok Utama
    const stockRef = collection(db, "ob_stock");
    const unsubscribeStock = onSnapshot(stockRef, (snapshot) => {
      const stockList: StockItem[] = [];
      snapshot.forEach(docSnap => stockList.push({ ...docSnap.data(), id: docSnap.id } as StockItem));
      stockList.sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));
      setItems(stockList);
      setIsReady(true);
    });

    // B. Listener Riwayat Transaksi — batch lebih besar dari sebelumnya (bukan cuma 20)
    // karena datanya sekarang dipakai dobel: tabel "Riwayat Transaksi" (tampil 25 terbaru)
    // DAN basis perhitungan Analisa Pemakaian per barang (butuh histori lebih panjang).
    const logRef = collection(db, "ob_stock_logs");
    const qLog = query(logRef, orderBy("waktu_transaksi", "desc"), limit(LIMIT_LOG_ANALISA));
    const unsubscribeLog = onSnapshot(qLog, (snapshot) => {
      const logsData: StockLog[] = [];
      snapshot.forEach(docSnap => logsData.push({ ...docSnap.data(), id: docSnap.id } as StockLog));
      setRiwayatLogs(logsData);
    });

    return () => {
      unsubscribeStock();
      unsubscribeLog();
    };
  }, [isAuthReady, session]);

  // ==========================================
  // FUNGSI HANDLER
  // ==========================================
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === "nama_barang" || name === "kategori" ? value : Number(value) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama_barang.trim()) return showToast("Nama barang wajib diisi!", "warning");

    setIsLoading(true);
    const kategori: Kategori = formData.kategori || tebakKategori(formData.nama_barang);
    try {
      if (isEditMode && editId) {
        await updateDoc(doc(db, "ob_stock", editId), {
          nama_barang: formData.nama_barang, qty: formData.qty, batas_minimum: formData.batas_minimum, kategori, terakhir_diupdate: serverTimestamp(), diupdate_oleh: picRef.current
        });
      } else {
        await addDoc(collection(db, "ob_stock"), { daerah: daerahTulis(),
          nama_barang: formData.nama_barang, qty: formData.qty, batas_minimum: formData.batas_minimum, kategori, terakhir_diupdate: serverTimestamp(), diupdate_oleh: picRef.current
        });
      }
      setFormData({ nama_barang: "", qty: 0, batas_minimum: 5, kategori: "" });
      setIsEditMode(false);
      setEditId(null);
    } catch (error) {
      console.error(error);
      showToast("Terjadi kesalahan sistem saat menyimpan data.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickUpdate = async (id: string, nama_barang: string, currentQty: number, change: number) => {
    const newQty = currentQty + change;
    if (newQty < 0) return;

    try {
      await updateDoc(doc(db, "ob_stock", id), { qty: newQty, terakhir_diupdate: serverTimestamp(), diupdate_oleh: picRef.current });
      await addDoc(collection(db, "ob_stock_logs"), { daerah: daerahTulis(),
        id_barang: id, nama_barang: nama_barang, jenis_transaksi: change > 0 ? "MASUK (TAMBAH)" : "KELUAR (PAKAI)", jumlah_perubahan: Math.abs(change), sisa_stok_akhir: newQty, pic_bertugas: picRef.current, waktu_transaksi: serverTimestamp()
      });
    } catch (error) {
      console.error(error);
      showToast("Gagal memproses transaksi stok.", "error");
    }
  };

  const handleDelete = async (id: string, nama_barang: string) => {
    const yakin = await confirm({
      title: "Hapus Item Inventori",
      message: `Hapus permanen item "${nama_barang}" dari daftar inventori?`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (!yakin) return;
    try { await deleteDoc(doc(db, "ob_stock", id)); } catch (error) { console.error(error); showToast("Gagal menghapus item.", "error"); }
  };

  const handleEdit = (item: StockItem) => {
    setIsEditMode(true);
    setEditId(item.id);
    setFormData({ nama_barang: item.nama_barang, qty: item.qty, batas_minimum: item.batas_minimum, kategori: kategoriOf(item) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatJam = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  // Analisa per barang — dasar buat 3 section baru (Urgent, Belanja Bulan Depan, Analisa Pemakaian).
  const urutKat = (a: StockItem, b: StockItem) => KATEGORI.indexOf(kategoriOf(a)) - KATEGORI.indexOf(kategoriOf(b)) || a.nama_barang.localeCompare(b.nama_barang);
  const itemTampil = items.filter((i) => filterKat === "Semua" || kategoriOf(i) === filterKat).sort(urutKat);
  const jumlahPerKat = (k: Kategori) => items.filter((i) => kategoriOf(i) === k).length;
  const analisaSemuaBarang = itemTampil.map((item) => hitungAnalisaPemakaian(item, riwayatLogs));
  const ambilItem = (a: AnalisaPemakaian) => a.item;
  /** Sisipkan baris kelompok kategori di tabel saat filter "Semua". */
  const denganKelompok = (daftar: AnalisaPemakaian[], baris: (x: AnalisaPemakaian) => React.ReactNode, kolom: number) => {
    if (filterKat !== "Semua") return daftar.map(baris);
    return KATEGORI.flatMap((k) => {
      const isi = daftar.filter((x) => kategoriOf(ambilItem(x)) === k);
      return isi.length ? [<BarisKelompok key={`kel-${k}`} k={k} n={isi.length} kolom={kolom} />, ...isi.map(baris)] : [];
    });
  };
  const daftarUrgent = analisaSemuaBarang.filter((a) => a.isUrgent);
  const daftarBulanDepan = analisaSemuaBarang.filter((a) => a.isPerluBulanDepan);

  if (!isAuthReady || !session || !isReady) return null;
  const picName = session.nama || "";

  return (
    <AdminShell title="Inventori Gudang OB" subtitle="Pantau stok, analisa pemakaian, dan rencana belanja supaya stok selalu sehat" userName={picName || "Staf"} backHref={"/dashboard/ob"} backLabel={"Dashboard OB"}>

      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }
        .card { background: var(--surface); padding: 25px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); border: 1px solid var(--line); }
        .section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .section-title-icon { padding: 8px; border-radius: 12px; display: flex; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .data-table th { text-align: left; padding: 10px 12px; background: var(--bg); color: var(--ink-soft); font-weight: 700; white-space: nowrap; border-bottom: 2px solid var(--line); }
        .data-table td { padding: 10px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
        .data-table tr:last-child td { border-bottom: none; }
        .badge { font-size: 10.5px; font-weight: 800; padding: 4px 9px; border-radius: 20px; white-space: nowrap; display: inline-block; }
        .empty-state { padding: 30px 20px; text-align: center; color: var(--muted); border: 2px dashed var(--line); border-radius: 16px; font-size: 13px; }
        /* §98: 1 baris per barang (dulu kartu ~220px tinggi di HP) */
        .stock-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 9px 10px 9px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); }
        .stock-row.is-low { border-left: 4px solid var(--red-600); padding-left: 11px; }
        .sr-nama { font-weight: 700; font-size: 14px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sr-sub { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
        .sr-qty { display: flex; align-items: center; gap: 4px; }
        .sr-angka { min-width: 30px; text-align: center; font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .sr-aksi { display: flex; gap: 2px; }
        .qty-btn { width: 30px; height: 30px; border-radius: 9px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; border: 1px solid; font-family: inherit; }
        .icon-btn { background: transparent; width: 30px; height: 30px; border-radius: 9px; cursor: pointer; display: flex; align-items: center; justify-content: center; border: none; }
        .icon-btn:hover { background: var(--surface); }
        .form-col, .right-col { min-width: 0; }
        .kat-filter { display: flex; gap: 8px; flex-wrap: wrap; }
        .kat-chip { border: 1px solid; border-radius: 999px; padding: 9px 14px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
        @media (max-width: 900px) {
          /* §86: align-items flex-start (inline) membuat kartu selebar isinya -> tabel nowrap mendorong
             kartu keluar layar HP. Di mode kolom kartu dipaksa selebar layar. */
          .stok-wrapper { flex-direction: column; align-items: stretch !important; }
          .form-col, .right-col { width: 100%; flex-basis: auto !important; }
          .form-col { position: static !important; }
        }
        @media (max-width: 520px) {
          .card { padding: 18px; }
        }
      `}} />

      <div>

        <div className="stok-wrapper" style={{ display: "flex", flexWrap: "wrap", gap: "25px", alignItems: "flex-start" }}>

          {/* ======================================= */}
          {/* KOLOM KIRI: FORM (STICKY)               */}
          {/* ======================================= */}
          <div className="form-col card" style={{ flex: "1 1 340px", position: "sticky", top: "80px", borderTop: isEditMode ? "5px solid var(--accent)" : "5px solid var(--warn)" }}>
            <h2 style={{ margin: "0 0 5px 0", color: isEditMode ? "var(--accent)" : "var(--warn)", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              {isEditMode ? <IconEdit size={17} /> : <IconPackage size={17} />} {isEditMode ? "Edit Item Gudang" : "Tambah Item Baru"}
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "var(--muted)", fontSize: "13px" }}>Pastikan data sistem sesuai dengan fisik di gudang.</p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--ink-soft)" }}>Nama Barang</label>
                <input type="text" name="nama_barang" value={formData.nama_barang} onChange={handleInputChange} required placeholder="Contoh: Sabun Lantai" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "14px", outline: "none", background: "var(--bg)" }} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--ink-soft)" }}>Kategori</label>
                <select name="kategori" value={formData.kategori} onChange={handleInputChange} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "14px", outline: "none", background: "var(--bg)", color: "var(--ink)" }}>
                  <option value="">Otomatis{formData.nama_barang.trim() ? ` (${tebakKategori(formData.nama_barang)})` : " dari nama barang"}</option>
                  {KATEGORI.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", gap: "15px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--ink-soft)" }}>Stok (Qty)</label>
                  <input type="number" name="qty" value={formData.qty} onChange={handleInputChange} required min="0" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "14px", outline: "none", background: "var(--bg)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--ink-soft)" }}>Limit Alert</label>
                  <input type="number" name="batas_minimum" value={formData.batas_minimum} onChange={handleInputChange} required min="1" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "14px", outline: "none", background: "var(--bg)" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" disabled={isLoading} style={{ flex: 1, padding: "15px", background: isLoading ? "#a0aec0" : (isEditMode ? "var(--accent-solid)" : "var(--warn-solid)"), color: "#fff", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: isLoading ? "not-allowed" : "pointer", transition: "0.2s" }}>
                  {isLoading ? "Memproses..." : (isEditMode ? "Simpan Perubahan" : "+ Tambahkan")}
                </button>
                {isEditMode && (
                  <button type="button" onClick={() => { setIsEditMode(false); setEditId(null); setFormData({ nama_barang: "", qty: 0, batas_minimum: 5, kategori: "" }); }} style={{ padding: "15px 20px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", color: "var(--ink-soft)", transition: "0.2s" }}>
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* ======================================= */}
          {/* KOLOM KANAN                              */}
          {/* ======================================= */}
          <div className="right-col" style={{ flex: "2 1 500px", display: "flex", flexDirection: "column", gap: "25px" }}>

            {/* §97 FILTER KATEGORI */}
            <div className="kat-filter" role="tablist" aria-label="Filter kategori barang">
              {(["Semua", ...KATEGORI] as const).map((k) => {
                const aktif = filterKat === k;
                const warnaAktif = k === "Semua" ? "var(--ink)" : WARNA_KAT[k].fg;
                return (
                  <button key={k} type="button" role="tab" aria-selected={aktif} onClick={() => setFilterKat(k)} className="kat-chip"
                    style={{ background: aktif ? warnaAktif : "var(--surface)", color: aktif ? (k === "Semua" ? "var(--surface)" : "#fff") : "var(--ink-soft)", borderColor: aktif ? "transparent" : "var(--line)" }}>
                    {k} <span style={{ opacity: 0.75 }}>{k === "Semua" ? items.length : jumlahPerKat(k)}</span>
                  </button>
                );
              })}
            </div>

            {/* 🚨 PENGADAAN URGENT */}
            <div className="card" style={{ borderTop: "5px solid var(--red-600)" }}>
              <div className="section-title">
                <div className="section-title-icon" style={{ background: "var(--red-50)", color: "var(--red-600)" }}><IconAlertTriangle size={18} /></div>
                <div>
                  <h2 style={{ margin: 0, color: "var(--red-700)", fontSize: "17px" }}>Pengadaan Urgent</h2>
                  <p style={{ margin: "2px 0 0 0", color: "var(--muted)", fontSize: "12px" }}>Sudah di titik/bawah batas minimum — beli sekarang, jangan tunggu siklus belanja bulanan.</p>
                </div>
              </div>
              {daftarUrgent.length > 0 ? (
                <div style={{ overflowX: "auto", marginTop: "15px" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nama Barang</th>
                        <th>Sisa Stok</th>
                        <th>Batas Min.</th>
                        <th>Pemakaian/Bulan</th>
                        <th>Jumlah Disarankan Beli</th>
                      </tr>
                    </thead>
                    <tbody>
                      {denganKelompok(daftarUrgent, (a) => (
                        <tr key={a.item.id}>
                          <td style={{ fontWeight: "bold", color: "var(--ink)" }}>{a.item.nama_barang}</td>
                          <td style={{ color: "var(--red-600)", fontWeight: "bold" }}>{a.item.qty}</td>
                          <td style={{ color: "var(--muted)" }}>{a.item.batas_minimum}</td>
                          <td style={{ color: "var(--ink-soft)" }}>{a.adaDataPemakaian ? `${Math.round(a.rataRataPerBulan)} / bulan` : "Belum ada data"}</td>
                          <td>
                            <span className="badge" style={{ background: "var(--brand)", color: "#fff" }}>Beli {a.jumlahDisarankan} pcs</span>
                          </td>
                        </tr>
                      ), 5)}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state" style={{ marginTop: "15px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--ok-50)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconCheck size={18} /></div>
                  Aman — tidak ada barang di bawah batas minimum saat ini.
                </div>
              )}
            </div>

            {/* 🛒 RENCANA BELANJA BULAN DEPAN */}
            <div className="card" style={{ borderTop: "5px solid var(--warn)" }}>
              <div className="section-title">
                <div className="section-title-icon" style={{ background: "var(--warn-50)", color: "var(--warn)" }}><IconShoppingCart size={18} /></div>
                <div>
                  <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px" }}>Rencana Belanja Bulan Depan</h2>
                  <p style={{ margin: "2px 0 0 0", color: "var(--muted)", fontSize: "12px" }}>Masih aman sekarang, tapi diproyeksikan turun ke batas minimum akhir bulan ini kalau gak dibelanjakan.</p>
                </div>
              </div>
              {daftarBulanDepan.length > 0 ? (
                <div style={{ overflowX: "auto", marginTop: "15px" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nama Barang</th>
                        <th>Sisa Stok</th>
                        <th>Pemakaian/Bulan</th>
                        <th>Proyeksi Akhir Bulan</th>
                        <th>Jumlah Disarankan Beli</th>
                      </tr>
                    </thead>
                    <tbody>
                      {denganKelompok(daftarBulanDepan, (a) => (
                        <tr key={a.item.id}>
                          <td style={{ fontWeight: "bold", color: "var(--ink)" }}>{a.item.nama_barang}</td>
                          <td style={{ color: "var(--ink-soft)" }}>{a.item.qty}</td>
                          <td style={{ color: "var(--ink-soft)" }}>{Math.round(a.rataRataPerBulan)} / bulan</td>
                          <td style={{ color: "var(--warn)", fontWeight: "bold" }}>
                            {a.proyeksiSisaAkhirBulan !== null && a.proyeksiSisaAkhirBulan > 0 ? `≈ ${a.proyeksiSisaAkhirBulan}` : "Bakal habis sebelum akhir bulan"}
                          </td>
                          <td>
                            <span className="badge" style={{ background: "var(--warn-50)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.3)" }}>Beli {a.jumlahDisarankan} pcs</span>
                          </td>
                        </tr>
                      ), 5)}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state" style={{ marginTop: "15px" }}>Belum ada barang yang diproyeksikan turun ke batas minimum bulan ini.</div>
              )}
            </div>

            {/* 📊 ANALISA PEMAKAIAN GUDANG */}
            <div className="card">
              <div className="section-title">
                <div className="section-title-icon" style={{ background: "var(--info-50)", color: "var(--info)" }}><IconTrendingUp size={18} /></div>
                <div>
                  <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px" }}>Analisa Pemakaian Gudang</h2>
                  <p style={{ margin: "2px 0 0 0", color: "var(--muted)", fontSize: "12px" }}>Rata-rata pemakaian & proyeksi habis semua barang, dihitung dari histori transaksi.</p>
                </div>
              </div>
              {itemTampil.length > 0 ? (
                <div style={{ overflowX: "auto", marginTop: "15px" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nama Barang</th>
                        <th>Sisa Stok</th>
                        <th>Rata-rata / Bulan</th>
                        <th>Proyeksi Habis</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {denganKelompok(analisaSemuaBarang, (a) => (
                        <tr key={a.item.id}>
                          <td style={{ fontWeight: "bold", color: "var(--ink)" }}>{a.item.nama_barang}</td>
                          <td style={{ color: "var(--ink-soft)" }}>{a.item.qty}</td>
                          <td style={{ color: "var(--ink-soft)" }}>{a.adaDataPemakaian ? `${Math.round(a.rataRataPerBulan)} pcs` : "Belum ada data"}</td>
                          <td style={{ color: "var(--ink-soft)" }}>{a.proyeksiHabisHari !== null ? `± ${a.proyeksiHabisHari} hari lagi` : "-"}</td>
                          <td>
                            {a.isUrgent ? (
                              <span className="badge" style={{ background: "var(--red-50)", color: "var(--red-600)" }}>Urgent</span>
                            ) : a.isPerluBulanDepan ? (
                              <span className="badge" style={{ background: "var(--warn-50)", color: "var(--warn)" }}>Perlu Bulan Depan</span>
                            ) : a.adaDataPemakaian ? (
                              <span className="badge" style={{ background: "var(--ok-50)", color: "var(--ok)" }}>Sehat</span>
                            ) : (
                              <span className="badge" style={{ background: "var(--bg)", color: "var(--muted)" }}>Belum Ada Data</span>
                            )}
                          </td>
                        </tr>
                      ), 5)}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state" style={{ marginTop: "15px" }}>Belum ada barang di gudang.</div>
              )}
            </div>

            {/* DAFTAR STOK GUDANG */}
            <div className="card">
              <h2 style={{ margin: "0 0 15px 0", color: "var(--ink)", fontSize: "18px", borderBottom: "2px solid var(--bg)", paddingBottom: "15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><IconClipboard size={17} color="var(--warn)" /> Kondisi Stok Gudang</span>
                <span style={{ fontSize: "12px", background: "var(--bg)", color: "var(--ink-soft)", padding: "4px 10px", borderRadius: "20px" }}>{itemTampil.length} Item</span>
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {itemTampil.length > 0 ? itemTampil.map((item, idx) => {
                  const isLowStock = item.qty <= item.batas_minimum;
                  const kat = kategoriOf(item);
                  const judulKelompok = filterKat === "Semua" && (idx === 0 || kategoriOf(itemTampil[idx - 1]) !== kat);
                  return (
                    <div key={item.id} style={{ display: "contents" }}>
                    {judulKelompok && <div style={{ fontSize: "12px", fontWeight: 800, color: WARNA_KAT[kat].fg, marginTop: idx === 0 ? 0 : "6px", letterSpacing: ".02em" }}>{kat} · {jumlahPerKat(kat)}</div>}
                    <div className={`stock-row${isLowStock ? " is-low" : ""}`}>
                      <div style={{ minWidth: 0 }}>
                        <div className="sr-nama" title={item.nama_barang}>{item.nama_barang}</div>
                        <div className="sr-sub">min. {item.batas_minimum}{isLowStock && <b style={{ color: "var(--red-600)" }}> · perlu beli</b>}</div>
                      </div>
                      <div className="sr-qty">
                        <button onClick={() => handleQuickUpdate(item.id, item.nama_barang, item.qty, -1)} className="qty-btn" aria-label={`Kurangi ${item.nama_barang}`} style={{ background: "var(--red-50)", borderColor: "rgba(220,38,38,0.25)", color: "var(--red-600)" }}>−</button>
                        <span className="sr-angka" style={{ color: isLowStock ? "var(--red-600)" : "var(--ink)" }}>{item.qty}</span>
                        <button onClick={() => handleQuickUpdate(item.id, item.nama_barang, item.qty, 1)} className="qty-btn" aria-label={`Tambah ${item.nama_barang}`} style={{ background: "var(--ok-50)", borderColor: "rgba(22,163,74,0.25)", color: "var(--ok)" }}>+</button>
                      </div>
                      <div className="sr-aksi">
                        <button onClick={() => handleEdit(item)} className="icon-btn" style={{ color: "var(--accent)" }} title="Edit" aria-label={`Edit ${item.nama_barang}`}><IconEdit size={15} /></button>
                        <button onClick={() => handleDelete(item.id, item.nama_barang)} className="icon-btn" style={{ color: "var(--red-600)" }} title="Hapus" aria-label={`Hapus ${item.nama_barang}`}><IconTrash size={15} /></button>
                      </div>
                    </div>
                    </div>
                  );
                }) : (
                  <div className="empty-state">{items.length ? `Belum ada barang kategori ${filterKat}.` : "Gudang masih kosong."}</div>
                )}
              </div>
            </div>

            {/* RIWAYAT LOG TRANSAKSI */}
            <div className="card">
              <h2 style={{ margin: "0 0 5px 0", color: "var(--info)", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                <IconClock size={17} /> Riwayat Transaksi Stok
              </h2>
              <p style={{ margin: "0 0 20px 0", color: "var(--muted)", fontSize: "13px" }}>Audit trail pencatatan aktivitas keluar-masuk barang (25 terbaru).</p>

              <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Petugas OB</th>
                      <th>Nama Barang</th>
                      <th style={{ textAlign: "center" }}>Aktivitas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riwayatLogs.length > 0 ? riwayatLogs.slice(0, 25).map((log) => {
                      const isMasuk = log.jenis_transaksi.includes("MASUK");
                      return (
                        <tr key={log.id}>
                          <td style={{ color: "var(--muted)" }}>{formatJam(log.waktu_transaksi)}</td>
                          <td style={{ fontWeight: "bold", color: "var(--info)" }}>{log.pic_bertugas}</td>
                          <td style={{ color: "var(--ink)", fontWeight: "bold" }}>{log.nama_barang}</td>
                          <td style={{ textAlign: "center" }}>
                            <span className="badge" style={isMasuk ? { background: "var(--ok-50)", color: "var(--ok)" } : { background: "var(--red-50)", color: "var(--red-600)" }}>
                              {isMasuk ? `+${log.jumlah_perubahan}` : `-${log.jumlah_perubahan}`} (Sisa: {log.sisa_stok_akhir})
                            </span>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada aktivitas.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </AdminShell>
  );
}
