"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useAuthGuard } from "@/hooks/useAuthGuard";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan halaman OB lain (DashboardOBPage/ChecklistOBPage)
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
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
  const router = useRouter();
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
  const [formData, setFormData] = useState({ nama_barang: "", qty: 0, batas_minimum: 5 });
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
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === "nama_barang" ? value : Number(value) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama_barang.trim()) return showToast("Nama barang wajib diisi!", "warning");

    setIsLoading(true);
    try {
      if (isEditMode && editId) {
        await updateDoc(doc(db, "ob_stock", editId), {
          nama_barang: formData.nama_barang, qty: formData.qty, batas_minimum: formData.batas_minimum, terakhir_diupdate: serverTimestamp(), diupdate_oleh: picRef.current
        });
      } else {
        await addDoc(collection(db, "ob_stock"), {
          nama_barang: formData.nama_barang, qty: formData.qty, batas_minimum: formData.batas_minimum, terakhir_diupdate: serverTimestamp(), diupdate_oleh: picRef.current
        });
      }
      setFormData({ nama_barang: "", qty: 0, batas_minimum: 5 });
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
      await addDoc(collection(db, "ob_stock_logs"), {
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
    setFormData({ nama_barang: item.nama_barang, qty: item.qty, batas_minimum: item.batas_minimum });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatJam = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  // Analisa per barang — dasar buat 3 section baru (Urgent, Belanja Bulan Depan, Analisa Pemakaian).
  const analisaSemuaBarang = items.map((item) => hitungAnalisaPemakaian(item, riwayatLogs));
  const daftarUrgent = analisaSemuaBarang.filter((a) => a.isUrgent);
  const daftarBulanDepan = analisaSemuaBarang.filter((a) => a.isPerluBulanDepan);

  if (!isAuthReady || !session || !isReady) return null;
  const picName = session.nama || "";

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
          display: flex; justify-content: space-between; align-items: center; padding: 14px 24px;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line);
          position: sticky; top: 0; z-index: 20;
        }
        .back-btn {
          background: var(--bg); border: 1px solid var(--line); border-radius: 10px; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-soft); transition: 0.2s;
        }
        .back-btn:hover { background: var(--line); }
        .hero-stok {
          position: relative; overflow: hidden; border-radius: 0 0 30px 30px; color: #fff;
          padding: 40px 20px 70px; text-align: center;
          background: linear-gradient(150deg, #9a3412 0%, var(--warn) 55%, #c2680f 100%);
          box-shadow: 0 16px 30px -16px rgba(217,119,6,0.4);
        }
        .hero-stok::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .hero-stok-content { position: relative; }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.15);
          backdrop-filter: blur(5px); padding: 8px 20px; border-radius: 50px; font-size: 13px; font-weight: 700;
          border: 1px solid rgba(255,255,255,0.3);
        }
        .card { background: var(--surface); padding: 25px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); border: 1px solid var(--line); }
        .section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .section-title-icon { padding: 8px; border-radius: 12px; display: flex; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .data-table th { text-align: left; padding: 10px 12px; background: var(--bg); color: var(--ink-soft); font-weight: 700; white-space: nowrap; border-bottom: 2px solid var(--line); }
        .data-table td { padding: 10px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
        .data-table tr:last-child td { border-bottom: none; }
        .badge { font-size: 10.5px; font-weight: 800; padding: 4px 9px; border-radius: 20px; white-space: nowrap; display: inline-block; }
        .empty-state { padding: 30px 20px; text-align: center; color: var(--muted); border: 2px dashed var(--line); border-radius: 16px; font-size: 13px; }
        .stock-row { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-radius: 16px; flex-wrap: wrap; gap: 15px; transition: 0.2s; }
        .qty-btn { width: 34px; height: 34px; border-radius: 10px; font-size: 17px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; border: 1px solid; }
        .icon-btn { background: transparent; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; border: 1px solid; }
        .form-col, .right-col { min-width: 0; }
        @media (max-width: 900px) {
          .stok-wrapper { flex-direction: column; }
          .form-col { position: static !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="top-bar">
        <button className="back-btn" onClick={() => router.push("/dashboard/ob")}><IconArrowLeft size={16} /></button>
        <div className="hero-badge" style={{ background: "var(--warn-50)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.25)" }}>
          <IconPackage size={15} /> Petugas: {picName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="hero-stok">
        <div className="hero-stok-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>INVENTORI GUDANG OB</h1>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Pantau stok, analisa pemakaian, dan rencana belanja — biar stok selalu sehat & gak pernah habis</p>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>

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
                <button type="submit" disabled={isLoading} style={{ flex: 1, padding: "15px", background: isLoading ? "#a0aec0" : (isEditMode ? "var(--accent)" : "var(--warn)"), color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: isLoading ? "not-allowed" : "pointer", transition: "0.2s" }}>
                  {isLoading ? "Memproses..." : (isEditMode ? "Simpan Perubahan" : "+ Tambahkan")}
                </button>
                {isEditMode && (
                  <button type="button" onClick={() => { setIsEditMode(false); setEditId(null); setFormData({ nama_barang: "", qty: 0, batas_minimum: 5 }); }} style={{ padding: "15px 20px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", color: "var(--ink-soft)", transition: "0.2s" }}>
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
                      {daftarUrgent.map((a) => (
                        <tr key={a.item.id}>
                          <td style={{ fontWeight: "bold", color: "var(--ink)" }}>{a.item.nama_barang}</td>
                          <td style={{ color: "var(--red-600)", fontWeight: "bold" }}>{a.item.qty}</td>
                          <td style={{ color: "var(--muted)" }}>{a.item.batas_minimum}</td>
                          <td style={{ color: "var(--ink-soft)" }}>{a.adaDataPemakaian ? `${Math.round(a.rataRataPerBulan)} / bulan` : "Belum ada data"}</td>
                          <td>
                            <span className="badge" style={{ background: "var(--red-600)", color: "white" }}>Beli {a.jumlahDisarankan} pcs</span>
                          </td>
                        </tr>
                      ))}
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
                      {daftarBulanDepan.map((a) => (
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
                      ))}
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
              {items.length > 0 ? (
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
                      {analisaSemuaBarang.map((a) => (
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
                      ))}
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
                <span style={{ fontSize: "12px", background: "var(--bg)", color: "var(--ink-soft)", padding: "4px 10px", borderRadius: "20px" }}>{items.length} Item</span>
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                {items.length > 0 ? items.map((item) => {
                  const isLowStock = item.qty <= item.batas_minimum;
                  return (
                    <div key={item.id} className="stock-row" style={{ border: isLowStock ? "2px solid rgba(220,38,38,0.3)" : "1px solid var(--line)", background: isLowStock ? "var(--red-50)" : "var(--bg)" }}>

                      <div style={{ flex: "1 1 200px" }}>
                        <div style={{ fontWeight: "bold", fontSize: "16px", color: isLowStock ? "var(--red-700)" : "var(--ink)", display: "flex", alignItems: "center", gap: "8px" }}>
                          {item.nama_barang} {isLowStock && <IconAlertTriangle size={14} color="var(--red-600)" />}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                          Batas minimum: <strong style={{ color: "var(--ink-soft)" }}>{item.batas_minimum}</strong>
                        </div>
                      </div>

                      {/* Kontrol Kuantitas */}
                      <div style={{ display: "flex", alignItems: "center", gap: "15px", background: "var(--surface)", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)" }}>
                        <button onClick={() => handleQuickUpdate(item.id, item.nama_barang, item.qty, -1)} className="qty-btn" style={{ background: "var(--red-50)", borderColor: "rgba(220,38,38,0.25)", color: "var(--red-600)" }}>−</button>
                        <div style={{ textAlign: "center", minWidth: "50px" }}>
                          <span style={{ display: "block", fontSize: "22px", fontWeight: "900", color: isLowStock ? "var(--red-600)" : "var(--warn)", lineHeight: "1" }}>{item.qty}</span>
                          <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "1px" }}>Sisa</span>
                        </div>
                        <button onClick={() => handleQuickUpdate(item.id, item.nama_barang, item.qty, 1)} className="qty-btn" style={{ background: "var(--ok-50)", borderColor: "rgba(22,163,74,0.25)", color: "var(--ok)" }}>+</button>
                      </div>

                      {/* Tombol Aksi */}
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => handleEdit(item)} className="icon-btn" style={{ color: "var(--accent)", borderColor: "var(--accent)" }} title="Edit"><IconEdit size={14} /></button>
                        <button onClick={() => handleDelete(item.id, item.nama_barang)} className="icon-btn" style={{ color: "var(--red-600)", borderColor: "var(--red-600)" }} title="Hapus"><IconTrash size={14} /></button>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="empty-state">Gudang masih kosong.</div>
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
    </div>
  );
}
