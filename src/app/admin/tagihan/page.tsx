"use client";

/**
 * §184 Tagihan & Pembelian -- PLN, PDAM, pembelian rutin (utilitas, fasilitas, tools cleaning, chemical,
 * solar & oli genset) + rekap mingguan/bulanan/tahunan + anggaran vs realisasi + ESG.
 * Setiap catatan = 1 dokumen realisasi_biaya (field `catat`), jadi langsung jadi realisasi di menu Anggaran.
 * File tagihan/nota di Firebase Storage tagihan/** (privat, Admin GA).
 */
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, increment, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { deleteObject, getBlob, ref, uploadBytes } from "firebase/storage";
import * as XLSX from "xlsx";
import { db, storage } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import Modal from "../../../components/ui/Modal";
import { daerahTulis } from "../../../lib/daerah";
import { tanggalISOWITASekarang } from "../../../lib/shift";
import type { ItemRab } from "../../../lib/realisasiBiaya";
import { bacaBarisPdf } from "../../../lib/bacaPdf";
import {
  bacaPDAM, bacaPLN, FAKTOR_DEFAULT, hitungEsg, KATEGORI_BELI, KATEGORI_GENSET, kwhTotal, literBeli, PDAM_KOSONG, PLN_KOSONG, rekapBulanan,
  rentangPekan, saranBarisRab,
  type CatatanBiaya, type DataBeli, type DataPDAM, type DataPLN, type FaktorEsg, type ItemBeli, type JenisCatat, type KategoriBeli,
} from "../../../lib/tagihanUtilitas";

type Tab = "REKAP" | "PLN" | "PDAM" | "BELI" | "ESG";
interface Stok { id: string; nama_barang: string; qty: number; kategori?: string; satuan?: string }
interface Real { id: string; item_id?: string; jumlah: number; tanggal: string; catat?: JenisCatat }
interface FormTagihan { jenis: "PLN" | "PDAM"; editId?: string; periode: string; tanggal: string; item_id: string; jumlah: string; catatan: string; pln: DataPLN; pdam: DataPDAM; file: File | null; file_path?: string; file_nama?: string; info: string }
interface FormBeli { tanggal: string; kategori: KategoriBeli; vendor: string; item_id: string; items: (Omit<ItemBeli, "qty" | "harga"> & { qty: string; harga: string })[]; jam_genset: string; catatan: string; file: File | null }

const rupiah = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));
const ringkas = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(Math.round(n)));
const fmt = (n: number, d = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d }).format(n);
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const labelBulan = (ym: string) => (ym ? `${NAMA_BULAN[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : "—");
const tglPendek = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");
const WARNA: Record<JenisCatat, string> = { PLN: "#d97706", PDAM: "#0284c7", BELI: "#7c3aed" };
const ITEM_BARU = { nama: "", qty: "1", satuan: "pcs", harga: "" };
const MAKS_MB = 15;

function Kpi({ label, nilai, sub, warna }: { label: string; nilai: string; sub?: string; warna?: string }) {
  return (
    <Tile compact>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 800, color: warna || "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{nilai}</div>
      {sub && <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{sub}</div>}
    </Tile>
  );
}
function Bar({ nilai, maks, warna }: { nilai: number; maks: number; warna: string }) {
  return (
    <div style={{ height: 8, borderRadius: 4, background: "var(--line)", overflow: "hidden" }}>
      <div style={{ width: `${maks > 0 ? Math.min(100, (nilai / maks) * 100) : 0}%`, height: "100%", background: warna }} />
    </div>
  );
}
/** Grafik batang 12 bulan sederhana. */
function GrafikBulan({ data, warna, satuan }: { data: { bulan: string; nilai: number }[]; warna: string; satuan: string }) {
  const maks = Math.max(1, ...data.map((d) => d.nilai));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "140px", padding: "6px 0" }}>
      {data.map((d) => (
        <div key={d.bulan} title={`${labelBulan(d.bulan)}: ${fmt(d.nilai)} ${satuan}`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", height: "100%", justifyContent: "flex-end" }}>
          <div style={{ fontSize: "9.5px", color: "var(--muted)", whiteSpace: "nowrap" }}>{d.nilai ? ringkas(d.nilai) : ""}</div>
          <div style={{ width: "100%", maxWidth: "34px", height: `${(d.nilai / maks) * 100}%`, minHeight: d.nilai ? 3 : 0, background: warna, borderRadius: "4px 4px 0 0" }} />
          <div style={{ fontSize: "10px", color: "var(--ink-soft)" }}>{NAMA_BULAN[+d.bulan.slice(5, 7) - 1]}</div>
        </div>
      ))}
    </div>
  );
}

async function unggah(file: File, folder: string): Promise<{ path: string; nama: string }> {
  if (file.size > MAKS_MB * 1024 * 1024) throw new Error(`File terlalu besar (maks ${MAKS_MB} MB).`);
  const path = `tagihan/${folder}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type || "application/pdf" });
  return { path, nama: file.name };
}
async function bukaFile(path: string) {
  const tab = window.open("", "_blank");
  const url = URL.createObjectURL(await getBlob(ref(storage, path)));
  if (tab) tab.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default function TagihanPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const hariIni = tanggalISOWITASekarang();
  const tahunIni = Number(hariIni.slice(0, 4));
  const [tahun, setTahun] = useState(tahunIni);
  const [tab, setTab] = useState<Tab>("REKAP");
  const [items, setItems] = useState<ItemRab[]>([]);
  const [real, setReal] = useState<Real[]>([]);
  const [catatan, setCatatan] = useState<CatatanBiaya[] | null>(null);
  const [stok, setStok] = useState<Stok[]>([]);
  const [faktor, setFaktor] = useState<FaktorEsg>(FAKTOR_DEFAULT);
  const [luas, setLuas] = useState(0);
  const [formT, setFormT] = useState<FormTagihan | null>(null);
  const [formB, setFormB] = useState<FormBeli | null>(null);
  const [membaca, setMembaca] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [modeRekap, setModeRekap] = useState<"PEKAN" | "BULAN" | "TAHUN">("PEKAN");
  const [tglRekap, setTglRekap] = useState(hariIni);
  const [filterBeli, setFilterBeli] = useState<string>("SEMUA");
  const [draftFaktor, setDraftFaktor] = useState<{ grid: string; solar: string } | null>(null);

  useEffect(() => {
    if (!isReady) return;
    // tagihan periode Des dibayar Jan -> ambil sampai pertengahan Jan tahun berikutnya juga; disaring per periode di bawah
    const u1 = onSnapshot(query(collection(db, "realisasi_biaya"), where("tanggal", ">=", `${tahun}-01-01`), where("tanggal", "<", `${tahun + 1}-02-01`)), (s) => {
      const semua = s.docs.map((d) => ({ id: d.id, ...d.data() }) as Real & Partial<CatatanBiaya>);
      setReal(semua.filter((r) => r.tanggal < `${tahun + 1}-01-01`).map((r) => ({ id: r.id, item_id: r.item_id, jumlah: Number(r.jumlah) || 0, tanggal: r.tanggal, catat: r.catat })));
      setCatatan(semua.filter((r) => r.catat).map((r) => r as CatatanBiaya)
        .filter((c) => (c.catat === "BELI" ? c.tanggal : c.periode || c.tanggal).startsWith(String(tahun)))
        .sort((a, b) => (b.catat === "BELI" ? b.tanggal : b.periode).localeCompare(a.catat === "BELI" ? a.tanggal : a.periode) || b.tanggal.localeCompare(a.tanggal)));
    }, (e) => { console.error("[tagihan] realisasi:", e); setCatatan([]); });
    const u2 = onSnapshot(doc(db, "anggaran_rab", String(tahun)), (s) => setItems(Array.isArray(s.data()?.items) ? (s.data()!.items as ItemRab[]) : []), (e) => console.error("[tagihan] rab:", e));
    return () => { u1(); u2(); };
  }, [isReady, tahun]);

  useEffect(() => {
    if (!isReady) return;
    const u = onSnapshot(collection(db, "ob_stock"), (s) => setStok(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Stok).sort((a, b) => a.nama_barang.localeCompare(b.nama_barang))), (e) => console.error("[tagihan] stok:", e));
    getDoc(doc(db, "settings", "esg_faktor")).then((s) => { const d = s.data(); if (d) setFaktor({ grid_kgco2_kwh: Number(d.grid_kgco2_kwh) || 0, solar_kgco2_liter: Number(d.solar_kgco2_liter) || FAKTOR_DEFAULT.solar_kgco2_liter }); }).catch(() => {});
    getDoc(doc(db, "okupansi_gedung", "data")).then((s) => {
      const d = s.data();
      const g = Number(d?.gedung?.luas_total) || 0;
      setLuas(g || ((d?.lantai as { luas_total?: number }[]) || []).reduce((a, l) => a + (Number(l.luas_total) || 0), 0));
    }).catch(() => {});
    return u;
  }, [isReady]);

  const cat = useMemo(() => catatan || [], [catatan]);
  const bulanTahun = useMemo(() => Array.from({ length: 12 }, (_, i) => `${tahun}-${String(i + 1).padStart(2, "0")}`), [tahun]);
  const rekap = useMemo(() => rekapBulanan(cat), [cat]);
  const perBulan = bulanTahun.map((b) => rekap.get(b) || { bulan: b, kwh: 0, rpPln: 0, m3: 0, rpPdam: 0, literSolar: 0, rpSolar: 0, rpOli: 0, rpBeli: 0, perKategori: {} as Record<string, number> });

  if (!isReady) return null;

  const itemPerId = new Map(items.map((i) => [i.id, i]));
  const pagu = (id: string) => { const i = itemPerId.get(id); return i ? (i.qty || 0) * (i.harga || 0) : 0; };
  const realBaris = (id: string, sampai?: string) => real.filter((r) => r.item_id === id && (!sampai || r.tanggal <= sampai)).reduce((a, r) => a + r.jumlah, 0);
  const opsiRab = (
    <>
      <option value="">— belum dialokasikan —</option>
      {(["OPEX", "CAPEX", "PL"] as const).map((j) => (
        <optgroup key={j} label={j}>{items.filter((i) => i.jenis === j).map((i) => <option key={i.id} value={i.id}>{i.kelompok} — {i.kode} {i.uraian}</option>)}</optgroup>
      ))}
    </>
  );
  const pln = cat.filter((c) => c.catat === "PLN").sort((a, b) => a.periode.localeCompare(b.periode));
  const pdam = cat.filter((c) => c.catat === "PDAM").sort((a, b) => a.periode.localeCompare(b.periode));
  const beli = cat.filter((c) => c.catat === "BELI");

  // ---------- form tagihan ----------
  const bukaFormTagihan = (jenis: "PLN" | "PDAM", c?: CatatanBiaya) => {
    if (c) {
      setFormT({ jenis, editId: c.id, periode: c.periode, tanggal: c.tanggal, item_id: c.item_id || "", jumlah: String(c.jumlah), catatan: c.catatan || "", pln: { ...PLN_KOSONG, ...c.pln }, pdam: { ...PDAM_KOSONG, ...c.pdam }, file: null, file_path: c.file_path, file_nama: c.file_nama, info: "" });
    } else {
      setFormT({ jenis, periode: hariIni.slice(0, 7), tanggal: hariIni, item_id: saranBarisRab(items, jenis), jumlah: "", catatan: "", pln: { ...PLN_KOSONG }, pdam: { ...PDAM_KOSONG }, file: null, info: "" });
    }
  };
  const pilihFile = async (f: File | null) => {
    if (!formT || !f) return;
    const dasar = { ...formT, file: f };
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { setFormT({ ...dasar, info: "File gambar tersimpan sebagai bukti — angka diisi manual (pembacaan otomatis hanya untuk PDF dari PLN/PDAM)." }); return; }
    setMembaca(true);
    try {
      const baris = await bacaBarisPdf(f);
      if (!baris.length) { setFormT({ ...dasar, info: "PDF ini tidak punya teks (hasil scan). Isi angka manual." }); return; }
      if (formT.jenis === "PLN") {
        const h = bacaPLN(baris);
        const jumlah = h.data.total + h.data.materai + h.data.denda;
        setFormT({ ...dasar, periode: h.periode || dasar.periode, tanggal: h.data.tgl_bayar || (h.periode ? `${h.periode}-01` : dasar.tanggal), pln: h.data, jumlah: jumlah ? String(jumlah) : dasar.jumlah,
          info: h.terbaca >= 4 ? `✓ Terbaca otomatis: rekening ${labelBulan(h.periode)}, ${fmt(kwhTotal(h.data))} kWh, ${rupiah(h.data.total)}. Cek lalu simpan.` : "⚠️ Sebagian data tidak terbaca — lengkapi manual. Pastikan ini PDF Rincian Rekening PLN." });
      } else {
        const h = bacaPDAM(baris);
        setFormT({ ...dasar, periode: h.periode || dasar.periode, tanggal: h.periode ? `${h.periode}-01` : dasar.tanggal, pdam: h.data, jumlah: h.data.total ? String(h.data.total) : dasar.jumlah,
          info: h.terbaca >= 3 ? `✓ Terbaca otomatis: ${labelBulan(h.periode)}, meter ${fmt(h.data.m_awal)} → ${fmt(h.data.m_akhir)} (${fmt(h.data.pakai)} m³), ${rupiah(h.data.total)}. Cek lalu simpan.` : "⚠️ Sebagian data tidak terbaca — lengkapi manual. Pastikan ini PDF Informasi Tagihan PDAM." });
      }
    } catch (e) {
      console.error("[tagihan] baca pdf:", e);
      setFormT({ ...dasar, info: "Gagal membaca PDF — isi angka manual." });
    } finally { setMembaca(false); }
  };
  const simpanTagihan = async () => {
    if (!formT) return;
    const f = formT;
    const jumlah = num(f.jumlah);
    if (!/^\d{4}-\d{2}$/.test(f.periode)) return showToast("Periode tagihan wajib diisi.", "warning");
    if (!f.tanggal) return showToast("Tanggal bayar wajib diisi.", "warning");
    if (!(jumlah > 0)) return showToast("Jumlah dibayar wajib diisi.", "warning");
    const kembar = cat.find((c) => c.catat === f.jenis && c.periode === f.periode && c.id !== f.editId && (f.jenis === "PLN" ? (c.pln?.id_pel || "") === f.pln.id_pel : (c.pdam?.no_air || "") === f.pdam.no_air));
    if (kembar && !(await confirm(`Tagihan ${f.jenis} ${labelBulan(f.periode)} sudah tercatat (${rupiah(kembar.jumlah)}). Tetap simpan sebagai catatan kedua?`))) return;
    setMenyimpan(true);
    try {
      let file: { path: string; nama: string } | null = null;
      if (f.file) file = await unggah(f.file, `${f.periode.slice(0, 4)}/${f.jenis.toLowerCase()}`);
      const rinci = f.jenis === "PLN" ? { pln: f.pln } : { pdam: { ...f.pdam, pakai: f.pdam.pakai || Math.max(0, f.pdam.m_akhir - f.pdam.m_awal) } };
      const uraian = f.jenis === "PLN" ? `PLN rekening ${labelBulan(f.periode)} · ${fmt(kwhTotal(f.pln))} kWh` : `PDAM ${labelBulan(f.periode)} · ${fmt(rinci.pdam!.pakai)} m³`;
      const data = { catat: f.jenis, periode: f.periode, tanggal: f.tanggal, item_id: f.item_id, kategori: itemPerId.get(f.item_id)?.kelompok || "Utilitas", uraian, jumlah, catatan: f.catatan.trim(), ...rinci,
        ...(file ? { file_path: file.path, file_nama: file.nama } : {}) };
      if (f.editId) {
        await updateDoc(doc(db, "realisasi_biaya", f.editId), { ...data, diubah_oleh: session?.nama || "-", diubah_pada: serverTimestamp() });
        if (file && f.file_path) deleteObject(ref(storage, f.file_path)).catch(() => {});
      } else {
        await setDoc(doc(collection(db, "realisasi_biaya")), { ...data, daerah: daerahTulis(), dicatat_oleh: session?.nama || "-", dibuat_pada: serverTimestamp() });
      }
      showToast(`Tagihan ${f.jenis} ${labelBulan(f.periode)} tersimpan & masuk realisasi anggaran.`, "success");
      setFormT(null);
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error && e.message.includes("terlalu besar") ? e.message : "Gagal menyimpan tagihan.", "error");
    } finally { setMenyimpan(false); }
  };

  // ---------- form pembelian ----------
  const bukaFormBeli = (kategori: KategoriBeli = "Utilitas") => setFormB({ tanggal: hariIni, kategori, vendor: "", item_id: saranBarisRab(items, kategori), items: [{ ...ITEM_BARU, ...(kategori === "Solar Genset" ? { nama: "Solar", satuan: "liter" } : kategori === "Oli & Consumable Genset" ? { nama: "Oli genset", satuan: "liter" } : {}) }], jam_genset: "", catatan: "", file: null });
  const totalFormBeli = formB ? formB.items.reduce((a, i) => a + num(i.qty) * num(i.harga), 0) : 0;
  const simpanBeli = async () => {
    if (!formB) return;
    const f = formB;
    const its = f.items.filter((i) => i.nama.trim() && num(i.qty) > 0).map((i) => ({ nama: i.nama.trim(), qty: num(i.qty), satuan: i.satuan.trim() || "pcs", harga: num(i.harga), ...(i.stok_id ? { stok_id: i.stok_id, stok_nama: i.stok_nama || "" } : {}) }));
    if (!f.tanggal) return showToast("Tanggal pembelian wajib diisi.", "warning");
    if (!its.length) return showToast("Isi minimal 1 barang (nama & jumlah).", "warning");
    const total = its.reduce((a, i) => a + i.qty * i.harga, 0);
    if (!(total > 0)) return showToast("Harga barang wajib diisi.", "warning");
    setMenyimpan(true);
    try {
      let file: { path: string; nama: string } | null = null;
      if (f.file) file = await unggah(f.file, `${f.tanggal.slice(0, 4)}/nota`);
      const dataBeli: DataBeli = { kategori: f.kategori, vendor: f.vendor.trim(), items: its, ...(num(f.jam_genset) ? { jam_genset: num(f.jam_genset) } : {}) };
      const uraian = `${f.kategori}: ${its.map((i) => `${i.nama} ${fmt(i.qty, 2)} ${i.satuan}`).join(", ")}${f.vendor.trim() ? ` · ${f.vendor.trim()}` : ""}`.slice(0, 160);
      const b = writeBatch(db);
      b.set(doc(collection(db, "realisasi_biaya")), { catat: "BELI", periode: f.tanggal.slice(0, 7), tanggal: f.tanggal, item_id: f.item_id, kategori: itemPerId.get(f.item_id)?.kelompok || f.kategori, uraian, jumlah: total, beli: dataBeli, catatan: f.catatan.trim(),
        ...(file ? { file_path: file.path, file_nama: file.nama } : {}), daerah: daerahTulis(), dicatat_oleh: session?.nama || "-", dibuat_pada: serverTimestamp() });
      // barang yang ditautkan ke stok OB -> stok bertambah + riwayat stok
      its.filter((i) => i.stok_id).forEach((i) => {
        const s = stok.find((x) => x.id === i.stok_id);
        b.update(doc(db, "ob_stock", i.stok_id!), { qty: increment(i.qty), terakhir_diupdate: serverTimestamp(), diupdate_oleh: session?.nama || "-" });
        b.set(doc(collection(db, "ob_stock_logs")), { daerah: daerahTulis(), id_barang: i.stok_id, nama_barang: s?.nama_barang || i.stok_nama || i.nama, jenis_transaksi: "MASUK (PEMBELIAN)", jumlah_perubahan: i.qty,
          sisa_stok_akhir: (s?.qty || 0) + i.qty, pic_bertugas: session?.nama || "-", waktu_transaksi: serverTimestamp(), keperluan: `Pembelian ${f.vendor.trim() || f.kategori} (${f.tanggal})`, foto_bukti: "" });
      });
      await b.commit();
      const nStok = its.filter((i) => i.stok_id).length;
      showToast(`Pembelian ${rupiah(total)} tersimpan${nStok ? ` · ${nStok} barang menambah stok OB` : ""}.`, "success");
      setFormB(null);
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error && e.message.includes("terlalu besar") ? e.message : "Gagal menyimpan pembelian.", "error");
    } finally { setMenyimpan(false); }
  };

  const hapus = async (c: CatatanBiaya) => {
    const tautStok = (c.beli?.items || []).filter((i) => i.stok_id);
    if (!(await confirm(`Hapus catatan "${c.uraian}" (${rupiah(c.jumlah)})?${tautStok.length ? ` Stok OB ${tautStok.length} barang akan dikurangi kembali.` : ""} Realisasi anggaran ikut berkurang.`))) return;
    try {
      const b = writeBatch(db);
      b.delete(doc(db, "realisasi_biaya", c.id));
      tautStok.forEach((i) => {
        const s = stok.find((x) => x.id === i.stok_id);
        if (!s) return;
        b.update(doc(db, "ob_stock", s.id), { qty: increment(-i.qty), terakhir_diupdate: serverTimestamp(), diupdate_oleh: session?.nama || "-" });
        b.set(doc(collection(db, "ob_stock_logs")), { daerah: daerahTulis(), id_barang: s.id, nama_barang: s.nama_barang, jenis_transaksi: "KOREKSI ADMIN (-)", jumlah_perubahan: i.qty,
          sisa_stok_akhir: s.qty - i.qty, pic_bertugas: session?.nama || "-", waktu_transaksi: serverTimestamp(), keperluan: `Batal pembelian (${c.tanggal})`, foto_bukti: "" });
      });
      await b.commit();
      if (c.file_path) deleteObject(ref(storage, c.file_path)).catch(() => {});
      showToast("Catatan dihapus.", "success");
    } catch (e) { console.error(e); showToast("Gagal menghapus.", "error"); }
  };

  // ---------- rekap ----------
  const [awalPekan, akhirPekan] = rentangPekan(tglRekap);
  const bulanRekap = tglRekap.slice(0, 7);
  const dalamRekap = (c: CatatanBiaya) => {
    if (modeRekap === "PEKAN") return c.tanggal >= awalPekan && c.tanggal <= akhirPekan;
    if (modeRekap === "BULAN") return (c.catat === "BELI" ? c.tanggal : c.periode).startsWith(bulanRekap);
    return true;
  };
  const isiRekap = cat.filter(dalamRekap);
  const totalRekap = isiRekap.reduce((a, c) => a + c.jumlah, 0);
  const perJenis = (["PLN", "PDAM", "BELI"] as JenisCatat[]).map((j) => ({ j, n: isiRekap.filter((c) => c.catat === j).reduce((a, c) => a + c.jumlah, 0) }));
  const perKat = new Map<string, number>();
  isiRekap.filter((c) => c.catat === "BELI").forEach((c) => perKat.set(c.beli?.kategori || "Lainnya", (perKat.get(c.beli?.kategori || "Lainnya") || 0) + c.jumlah));
  // anggaran: baris RAB yang dipakai menu ini
  const batasSerapan = modeRekap === "TAHUN" ? `${tahun}-12-31` : modeRekap === "BULAN" ? `${bulanRekap}-31` : akhirPekan;
  const bulanKe = modeRekap === "TAHUN" ? (tahun < tahunIni ? 12 : tahun > tahunIni ? 0 : +hariIni.slice(5, 7)) : +batasSerapan.slice(5, 7);
  const barisDipakai = Array.from(new Set(cat.map((c) => c.item_id).filter(Boolean))).map((id) => {
    const p = pagu(id), r = realBaris(id, batasSerapan), target = (p * bulanKe) / 12;
    return { id, i: itemPerId.get(id), p, r, target };
  }).filter((x) => x.i).sort((a, b) => b.p - a.p);
  const belumAlokasi = cat.filter((c) => !c.item_id || !itemPerId.has(c.item_id));
  const judulRekap = modeRekap === "PEKAN" ? `Pekan ${tglPendek(awalPekan)} – ${tglPendek(akhirPekan)}` : modeRekap === "BULAN" ? labelBulan(bulanRekap) : `Tahun ${tahun}`;

  const salinRingkasan = async () => {
    const baris = [`*Rekap Tagihan & Pembelian — ${judulRekap}*`, `Total: ${rupiah(totalRekap)} (${isiRekap.length} catatan)`];
    perJenis.forEach(({ j, n }) => { if (n) baris.push(`• ${j === "BELI" ? "Pembelian" : j}: ${rupiah(n)}`); });
    perKat.forEach((n, k) => baris.push(`   – ${k}: ${rupiah(n)}`));
    const r = modeRekap === "BULAN" ? rekap.get(bulanRekap) : null;
    if (r?.kwh) baris.push(`Listrik: ${fmt(r.kwh)} kWh (${rupiah(r.rpPln / r.kwh)}/kWh)`);
    if (r?.m3) baris.push(`Air PDAM: ${fmt(r.m3)} m³`);
    if (r?.literSolar) baris.push(`Solar genset: ${fmt(r.literSolar)} liter`);
    const lewat = barisDipakai.filter((x) => x.r > x.p);
    if (lewat.length) baris.push(`⚠️ Melebihi pagu: ${lewat.map((x) => `${x.i!.uraian} (${Math.round((x.r / Math.max(1, x.p)) * 100)}%)`).join("; ")}`);
    try { await navigator.clipboard.writeText(baris.join("\n")); showToast("Ringkasan disalin — tempel di WA / notulen meeting.", "success"); }
    catch { showToast("Gagal menyalin.", "error"); }
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(perBulan.map((r) => ({
      Bulan: labelBulan(r.bulan), "Listrik kWh": r.kwh, "PLN (Rp)": r.rpPln, "Rp/kWh": r.kwh ? Math.round(r.rpPln / r.kwh) : "", "Air m3": r.m3, "PDAM (Rp)": r.rpPdam,
      "Solar (L)": r.literSolar, "Solar (Rp)": r.rpSolar, "Oli & cons. genset (Rp)": r.rpOli, ...Object.fromEntries(KATEGORI_BELI.filter((k) => !KATEGORI_GENSET.includes(k)).map((k) => [`${k} (Rp)`, r.perKategori[k] || 0])),
      "Total (Rp)": r.rpPln + r.rpPdam + r.rpBeli,
    }))), "Rekap Bulanan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pln.map((c) => ({ Rekening: labelBulan(c.periode), "Tgl bayar": c.tanggal, "ID Pel": c.pln?.id_pel, "Stand awal LWBP": c.pln?.lwbp_awal, "Stand akhir LWBP": c.pln?.lwbp_akhir, "Faktor kali": c.pln?.faktor_kali,
      "kWh LWBP": c.pln?.kwh_lwbp, "kWh WBP": c.pln?.kwh_wbp, kVArh: c.pln?.kvarh, "Rp TTL": c.pln?.rp_ttl, PPN: c.pln?.ppn, "PBJT/PPJ": c.pln?.ppj, Materai: c.pln?.materai, "Total tagihan": c.pln?.total, Dibayar: c.jumlah, Subsidi: c.pln?.subsidi }))), "PLN");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pdam.map((c) => ({ Bulan: labelBulan(c.periode), "Tgl": c.tanggal, "No Air": c.pdam?.no_air, "Meter awal": c.pdam?.m_awal, "Meter akhir": c.pdam?.m_akhir, "Pakai m3": c.pdam?.pakai,
      "By. pakai": c.pdam?.by_pakai, "By. adm": c.pdam?.by_adm, "By. pem": c.pdam?.by_pem, Denda: c.pdam?.denda, Total: c.jumlah }))), "PDAM");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(beli.flatMap((c) => (c.beli?.items || []).map((i) => ({ Tanggal: c.tanggal, Kategori: c.beli?.kategori, Vendor: c.beli?.vendor, Barang: i.nama, Qty: i.qty, Satuan: i.satuan, Harga: i.harga, Subtotal: i.qty * i.harga,
      "Ke stok OB": i.stok_nama || "", "Jam genset": c.beli?.jam_genset || "", "Baris RAB": itemPerId.get(c.item_id)?.uraian || "", "Dicatat": c.dicatat_oleh || "" })))), "Pembelian");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(barisDipakai.map((x) => ({ Kelompok: x.i!.kelompok, Kode: x.i!.kode, Uraian: x.i!.uraian, "Pagu tahun": x.p, Realisasi: x.r, "Serapan %": x.p ? Math.round((x.r / x.p) * 100) : "", Sisa: x.p - x.r }))), "Anggaran");
    XLSX.writeFile(wb, `Tagihan-Pembelian-${tahun}.xlsx`);
  };

  const esg = hitungEsg(perBulan, faktor);
  const bulanTerisi = perBulan.filter((r) => r.kwh || r.m3).length;

  // ---------- render ----------
  const lbl: React.CSSProperties = { display: "block", fontSize: "11.5px", fontWeight: 800, color: "var(--ink-soft)", marginBottom: "4px" };
  const inp = "tg-in";
  const kolomAngka = (label: string, v: number, on: (n: number) => void) => (
    <label key={label}><span style={lbl}>{label}</span><input className={inp} type="number" step="any" value={v || ""} onChange={(e) => on(Number(e.target.value) || 0)} /></label>
  );
  const barisCatat = (c: CatatanBiaya) => (
    <div key={c.id} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "2px 7px", borderRadius: "999px", background: WARNA[c.catat], color: "#fff", flexShrink: 0 }}>{c.catat === "BELI" ? c.beli?.kategori || "Beli" : c.catat}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{c.uraian}</div>
        <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{tglPendek(c.tanggal)} · {itemPerId.get(c.item_id)?.uraian ? `RAB: ${itemPerId.get(c.item_id)!.uraian}` : <span style={{ color: "var(--warn)" }}>belum dialokasikan ke RAB</span>}{c.dicatat_oleh ? ` · ${c.dicatat_oleh}` : ""}</div>
      </div>
      <div style={{ fontSize: "13px", fontWeight: 800, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{rupiah(c.jumlah)}</div>
      <div style={{ display: "flex", gap: "4px" }}>
        {c.file_path && <button type="button" className="sa-btn is-soft" style={{ height: "30px", padding: "0 9px" }} title="Buka file" onClick={() => bukaFile(c.file_path!).catch(() => showToast("Gagal membuka file.", "error"))}>📄</button>}
        {c.catat !== "BELI" && <button type="button" className="sa-btn is-soft" style={{ height: "30px", padding: "0 9px" }} title="Ubah" onClick={() => bukaFormTagihan(c.catat as "PLN" | "PDAM", c)}>✎</button>}
        <button type="button" className="sa-btn is-soft" style={{ height: "30px", padding: "0 9px", color: "var(--red-600)" }} title="Hapus" onClick={() => hapus(c)}>✕</button>
      </div>
    </div>
  );

  return (
    <AdminShell title="Tagihan & Pembelian" subtitle="PLN, PDAM, pembelian rutin & genset — otomatis jadi realisasi anggaran" userName={session?.nama || "Admin"}
      actions={<select className="sa-field" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} aria-label="Tahun">{[tahunIni + 1, tahunIni, tahunIni - 1, tahunIni - 2].map((t) => <option key={t} value={t}>{t}</option>)}</select>}>
      <style dangerouslySetInnerHTML={{ __html: `
        .tg-in { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 13px; font-family: inherit; box-sizing: border-box; min-width: 0; }
        .tg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .tg-tabel { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .tg-tabel th { text-align: left; padding: 8px; background: var(--bg); color: var(--ink-soft); font-size: 11.5px; font-weight: 800; border-bottom: 1px solid var(--line); white-space: nowrap; }
        .tg-tabel td { padding: 7px 8px; border-bottom: 1px solid var(--line); }
        .tg-tabel .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .tg-chip { border: 1px solid var(--line); background: var(--bg); color: var(--ink-soft); border-radius: 999px; padding: 6px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .tg-chip.is-on { background: var(--ink); color: var(--surface); border-color: transparent; }
      ` }} />

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
        <button type="button" className="sa-btn is-primary" onClick={() => bukaFormTagihan("PLN")}>⚡ Tagihan PLN</button>
        <button type="button" className="sa-btn is-primary" onClick={() => bukaFormTagihan("PDAM")}>💧 Tagihan PDAM</button>
        <button type="button" className="sa-btn is-primary" onClick={() => bukaFormBeli()}>🛒 Pembelian</button>
        <button type="button" className="sa-btn is-soft" onClick={() => bukaFormBeli("Solar Genset")}>⛽ Solar / Oli genset</button>
        <a className="sa-btn is-soft" href="/admin/anggaran" style={{ marginLeft: "auto" }}>Anggaran & Realisasi →</a>
      </div>

      <div className="sa-tabs" role="tablist" style={{ width: "fit-content", maxWidth: "100%", marginBottom: "16px" }}>
        {([["REKAP", "Rekap & Meeting"], ["PLN", `Listrik PLN (${pln.length})`], ["PDAM", `Air PDAM (${pdam.length})`], ["BELI", `Pembelian (${beli.length})`], ["ESG", "ESG"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sa-tab${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {catatan === null && <Tile><div style={{ color: "var(--muted)", fontSize: "13px" }}>Memuat…</div></Tile>}

      {catatan !== null && tab === "REKAP" && (
        <>
          <Tile style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              {(["PEKAN", "BULAN", "TAHUN"] as const).map((m) => <button key={m} type="button" className={`tg-chip${modeRekap === m ? " is-on" : ""}`} onClick={() => setModeRekap(m)}>{m === "PEKAN" ? "Mingguan (meeting)" : m === "BULAN" ? "Bulanan" : "Tahunan (raker)"}</button>)}
              {modeRekap !== "TAHUN" && <input type="date" className="sa-field" value={tglRekap} onChange={(e) => setTglRekap(e.target.value || hariIni)} />}
              <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                <button type="button" className="sa-btn is-soft" onClick={salinRingkasan}>📋 Salin ringkasan</button>
                <button type="button" className="sa-btn is-soft" onClick={exportExcel}>⬇ Excel {tahun}</button>
              </div>
            </div>
            <h2 style={{ margin: "12px 0 8px", fontSize: "16px", fontWeight: 800 }}>{judulRekap}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
              <Kpi label="Total pengeluaran" nilai={rupiah(totalRekap)} sub={`${isiRekap.length} catatan`} />
              {perJenis.map(({ j, n }) => <Kpi key={j} label={j === "BELI" ? "Pembelian" : j === "PLN" ? "Listrik PLN" : "Air PDAM"} nilai={rupiah(n)} warna={WARNA[j]} />)}
            </div>
            {perKat.size > 0 && (
              <div style={{ marginTop: "12px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {Array.from(perKat).sort((a, b) => b[1] - a[1]).map(([k, n]) => <span key={k} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "999px", background: "var(--bg)", border: "1px solid var(--line)" }}>{k}: <b>{rupiah(n)}</b></span>)}
              </div>
            )}
          </Tile>

          {modeRekap === "TAHUN" && (
            <Tile style={{ marginBottom: "14px", overflowX: "auto" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 800 }}>Per bulan {tahun}</h3>
              <table className="tg-tabel" style={{ minWidth: "760px" }}>
                <thead><tr><th>Bulan</th><th className="n">kWh</th><th className="n">PLN</th><th className="n">m³</th><th className="n">PDAM</th><th className="n">Solar L</th><th className="n">Genset Rp</th><th className="n">Pembelian lain</th><th className="n">Total</th></tr></thead>
                <tbody>
                  {perBulan.map((r) => (
                    <tr key={r.bulan}><td>{labelBulan(r.bulan)}</td><td className="n">{r.kwh ? fmt(r.kwh) : "–"}</td><td className="n">{r.rpPln ? ringkas(r.rpPln) : "–"}</td><td className="n">{r.m3 ? fmt(r.m3) : "–"}</td><td className="n">{r.rpPdam ? ringkas(r.rpPdam) : "–"}</td>
                      <td className="n">{r.literSolar ? fmt(r.literSolar) : "–"}</td><td className="n">{r.rpSolar + r.rpOli ? ringkas(r.rpSolar + r.rpOli) : "–"}</td><td className="n">{r.rpBeli - r.rpSolar - r.rpOli ? ringkas(r.rpBeli - r.rpSolar - r.rpOli) : "–"}</td><td className="n"><b>{ringkas(r.rpPln + r.rpPdam + r.rpBeli)}</b></td></tr>
                  ))}
                  <tr style={{ fontWeight: 800 }}><td>Total</td><td className="n">{fmt(esg.kwh)}</td><td className="n">{ringkas(perBulan.reduce((a, r) => a + r.rpPln, 0))}</td><td className="n">{fmt(esg.m3)}</td><td className="n">{ringkas(perBulan.reduce((a, r) => a + r.rpPdam, 0))}</td>
                    <td className="n">{fmt(esg.literSolar)}</td><td className="n">{ringkas(perBulan.reduce((a, r) => a + r.rpSolar + r.rpOli, 0))}</td><td className="n">{ringkas(perBulan.reduce((a, r) => a + r.rpBeli - r.rpSolar - r.rpOli, 0))}</td><td className="n">{ringkas(perBulan.reduce((a, r) => a + r.rpPln + r.rpPdam + r.rpBeli, 0))}</td></tr>
                </tbody>
              </table>
            </Tile>
          )}

          <Tile style={{ marginBottom: "14px" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 800 }}>Anggaran vs realisasi (baris RAB {tahun} yang dipakai)</h3>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px" }}>Realisasi s.d. {tglPendek(batasSerapan.slice(0, 7) + (batasSerapan.endsWith("-31") ? "-01" : batasSerapan.slice(7)))}{batasSerapan.endsWith("-31") ? " (akhir bulan)" : ""} dari semua sumber · target = pagu × {bulanKe}/12 bulan.</div>
            {barisDipakai.length === 0 && <div style={{ fontSize: "13px", color: "var(--muted)" }}>Belum ada catatan yang dialokasikan ke baris RAB {tahun}.</div>}
            {barisDipakai.map((x) => {
              const pr = x.p ? Math.round((x.r / x.p) * 100) : 0;
              const warna = x.r > x.p ? "var(--red-600)" : x.r > x.target * 1.1 ? "var(--warn)" : "var(--ok)";
              return (
                <div key={x.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
                    <span><b>{x.i!.uraian}</b> <span style={{ color: "var(--muted)", fontSize: "11.5px" }}>{x.i!.kelompok} {x.i!.kode}</span></span>
                    <span style={{ whiteSpace: "nowrap", fontWeight: 800, color: warna }}>{rupiah(x.r)} / {rupiah(x.p)} · {pr}%</span>
                  </div>
                  <div style={{ marginTop: "4px" }}><Bar nilai={x.r} maks={x.p} warna={warna} /></div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>
                    {x.r > x.p ? `Melebihi pagu ${rupiah(x.r - x.p)}` : x.r > x.target * 1.1 ? `Di atas target berjalan (${rupiah(x.target)})` : `Sesuai target berjalan (${rupiah(x.target)}) · sisa ${rupiah(x.p - x.r)}`}
                  </div>
                </div>
              );
            })}
            {belumAlokasi.length > 0 && <div style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--warn)" }}>⚠️ {belumAlokasi.length} catatan ({rupiah(belumAlokasi.reduce((a, c) => a + c.jumlah, 0))}) belum dialokasikan ke baris RAB — atur di menu Anggaran tab Realisasi.</div>}
          </Tile>

          <Tile>
            <h3 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 800 }}>Rincian {judulRekap.toLowerCase()}</h3>
            {isiRekap.length === 0 ? <div style={{ fontSize: "13px", color: "var(--muted)" }}>Tidak ada catatan.</div> : isiRekap.map((c) => barisCatat(c))}
          </Tile>
        </>
      )}

      {catatan !== null && tab === "PLN" && (() => {
        const terisi = pln.filter((c) => kwhTotal(c.pln));
        const rata = terisi.length ? terisi.reduce((a, c) => a + kwhTotal(c.pln), 0) / terisi.length : 0;
        const tot = pln.reduce((a, c) => a + c.jumlah, 0);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "14px" }}>
              <Kpi label={`Total PLN ${tahun}`} nilai={rupiah(tot)} sub={`${pln.length} rekening`} warna={WARNA.PLN} />
              <Kpi label="Rata-rata pemakaian" nilai={`${fmt(rata)} kWh`} sub="per bulan" />
              <Kpi label="Rata-rata biaya" nilai={esg.kwh ? `${rupiah(perBulan.reduce((a, r) => a + r.rpPln, 0) / esg.kwh)}` : "—"} sub="per kWh (termasuk pajak)" />
              <Kpi label="Daya / golongan" nilai={pln.at(-1)?.pln?.daya_va ? `${fmt(pln.at(-1)!.pln!.daya_va)} VA` : "—"} sub={pln.at(-1)?.pln?.golongan || ""} />
            </div>
            <Tile style={{ marginBottom: "14px" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 800 }}>Pola pemakaian listrik (kWh per rekening)</h3>
              <GrafikBulan data={perBulan.map((r) => ({ bulan: r.bulan, nilai: r.kwh }))} warna={WARNA.PLN} satuan="kWh" />
            </Tile>
            <Tile style={{ overflowX: "auto" }}>
              <table className="tg-tabel" style={{ minWidth: "820px" }}>
                <thead><tr><th>Rekening</th><th className="n">Stand LWBP</th><th className="n">kWh LWBP</th><th className="n">kWh WBP</th><th className="n">kVArh</th><th className="n">vs bln lalu</th><th className="n">Rp TTL</th><th className="n">Pajak</th><th className="n">Dibayar</th><th className="n">Rp/kWh</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {pln.length === 0 && <tr><td colSpan={12} style={{ color: "var(--muted)" }}>Belum ada tagihan. Klik “⚡ Tagihan PLN” lalu unggah PDF Rincian Rekening.</td></tr>}
                  {pln.map((c, i) => {
                    const k = kwhTotal(c.pln), kl = i > 0 ? kwhTotal(pln[i - 1].pln) : 0;
                    const d = kl ? Math.round(((k - kl) / kl) * 100) : null;
                    return (
                      <tr key={c.id}>
                        <td><b>{labelBulan(c.periode)}</b><div style={{ fontSize: "11px", color: "var(--muted)" }}>bayar {tglPendek(c.tanggal)}</div></td>
                        <td className="n">{c.pln?.lwbp_akhir ? `${fmt(c.pln.lwbp_awal, 3)} → ${fmt(c.pln.lwbp_akhir, 3)}` : "–"}</td>
                        <td className="n">{fmt(c.pln?.kwh_lwbp || 0)}</td><td className="n">{fmt(c.pln?.kwh_wbp || 0)}</td><td className="n">{fmt(c.pln?.kvarh || 0)}</td>
                        <td className="n" style={{ color: d === null ? "var(--muted)" : d > 10 ? "var(--red-600)" : d < -10 ? "var(--ok)" : "var(--ink-soft)" }}>{d === null ? "–" : `${d > 0 ? "+" : ""}${d}%`}</td>
                        <td className="n">{ringkas(c.pln?.rp_ttl || 0)}</td><td className="n">{ringkas((c.pln?.ppn || 0) + (c.pln?.ppj || 0))}</td><td className="n"><b>{rupiah(c.jumlah)}</b></td>
                        <td className="n">{k ? fmt(c.jumlah / k) : "–"}</td><td>{c.pln?.status || "–"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {c.file_path && <button type="button" className="sa-btn is-soft" style={{ height: "28px", padding: "0 8px" }} onClick={() => bukaFile(c.file_path!).catch(() => showToast("Gagal membuka file.", "error"))}>📄</button>}{" "}
                          <button type="button" className="sa-btn is-soft" style={{ height: "28px", padding: "0 8px" }} onClick={() => bukaFormTagihan("PLN", c)}>✎</button>{" "}
                          <button type="button" className="sa-btn is-soft" style={{ height: "28px", padding: "0 8px", color: "var(--red-600)" }} onClick={() => hapus(c)}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "8px" }}>Rekening bulan N = pemakaian bulan N-1 (stand meter tgl 1). Merah = naik &gt;10% dari rekening sebelumnya.</div>
            </Tile>
          </>
        );
      })()}

      {catatan !== null && tab === "PDAM" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "14px" }}>
            <Kpi label={`Total PDAM ${tahun}`} nilai={rupiah(pdam.reduce((a, c) => a + c.jumlah, 0))} sub={`${pdam.length} tagihan`} warna={WARNA.PDAM} />
            <Kpi label="Total pemakaian" nilai={`${fmt(esg.m3)} m³`} sub={pdam.length ? `rata-rata ${fmt(esg.m3 / pdam.length)} m³/bulan` : ""} />
            <Kpi label="Rata-rata biaya" nilai={esg.m3 ? rupiah(perBulan.reduce((a, r) => a + r.rpPdam, 0) / esg.m3) : "—"} sub="per m³" />
          </div>
          <Tile style={{ marginBottom: "14px" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 800 }}>Pola pemakaian air (m³)</h3>
            <GrafikBulan data={perBulan.map((r) => ({ bulan: r.bulan, nilai: r.m3 }))} warna={WARNA.PDAM} satuan="m³" />
          </Tile>
          <Tile style={{ overflowX: "auto" }}>
            <table className="tg-tabel" style={{ minWidth: "720px" }}>
              <thead><tr><th>Bulan</th><th className="n">Meter awal</th><th className="n">Meter akhir</th><th className="n">Pakai m³</th><th className="n">By. pakai</th><th className="n">Adm + pem.</th><th className="n">Denda</th><th className="n">Total</th><th className="n">Rp/m³</th><th></th></tr></thead>
              <tbody>
                {pdam.length === 0 && <tr><td colSpan={10} style={{ color: "var(--muted)" }}>Belum ada tagihan. Klik “💧 Tagihan PDAM”.</td></tr>}
                {pdam.map((c, i) => {
                  const sebelum = i > 0 ? pdam[i - 1].pdam?.m_akhir : undefined;
                  const putus = sebelum !== undefined && c.pdam && c.pdam.m_awal !== sebelum;
                  return (
                    <tr key={c.id}>
                      <td><b>{labelBulan(c.periode)}</b></td>
                      <td className="n" style={{ color: putus ? "var(--red-600)" : undefined }} title={putus ? `Tidak sama dengan meter akhir bulan lalu (${sebelum})` : ""}>{fmt(c.pdam?.m_awal || 0)}{putus ? " ⚠" : ""}</td>
                      <td className="n">{fmt(c.pdam?.m_akhir || 0)}</td><td className="n"><b>{fmt(c.pdam?.pakai || 0)}</b></td><td className="n">{ringkas(c.pdam?.by_pakai || 0)}</td>
                      <td className="n">{ringkas((c.pdam?.by_adm || 0) + (c.pdam?.by_pem || 0))}</td><td className="n">{c.pdam?.denda ? ringkas(c.pdam.denda) : "–"}</td><td className="n"><b>{rupiah(c.jumlah)}</b></td>
                      <td className="n">{c.pdam?.pakai ? fmt(c.jumlah / c.pdam.pakai) : "–"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {c.file_path && <button type="button" className="sa-btn is-soft" style={{ height: "28px", padding: "0 8px" }} onClick={() => bukaFile(c.file_path!).catch(() => showToast("Gagal membuka file.", "error"))}>📄</button>}{" "}
                        <button type="button" className="sa-btn is-soft" style={{ height: "28px", padding: "0 8px" }} onClick={() => bukaFormTagihan("PDAM", c)}>✎</button>{" "}
                        <button type="button" className="sa-btn is-soft" style={{ height: "28px", padding: "0 8px", color: "var(--red-600)" }} onClick={() => hapus(c)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "8px" }}>⚠ = meter awal tidak sama dengan meter akhir bulan sebelumnya (cek kemungkinan salah catat / meter diganti).</div>
          </Tile>
        </>
      )}

      {catatan !== null && tab === "BELI" && (() => {
        const tampil = beli.filter((c) => filterBeli === "SEMUA" || (filterBeli === "GENSET" ? KATEGORI_GENSET.includes(c.beli?.kategori as KategoriBeli) : c.beli?.kategori === filterBeli));
        const genset = beli.filter((c) => KATEGORI_GENSET.includes(c.beli?.kategori as KategoriBeli)).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
        const solar = genset.filter((c) => c.beli?.kategori === "Solar Genset");
        const lSolar = solar.reduce((a, c) => a + literBeli(c.beli), 0), rpSolar = solar.reduce((a, c) => a + c.jumlah, 0);
        const lOli = genset.filter((c) => c.beli?.kategori === "Oli & Consumable Genset").reduce((a, c) => a + literBeli(c.beli), 0);
        const jam = genset.filter((c) => c.beli?.jam_genset).map((c) => c.beli!.jam_genset!);
        const selisihJam = jam.length >= 2 ? Math.max(...jam) - Math.min(...jam) : 0;
        const rabSolar = items.find((i) => /solar/i.test(i.uraian));
        return (
          <>
            <Tile style={{ marginBottom: "14px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 800 }}>⛽ Jejak solar & oli genset {tahun}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                <Kpi label="Solar dibeli" nilai={`${fmt(lSolar)} L`} sub={`${rupiah(rpSolar)}${lSolar ? ` · ${rupiah(rpSolar / lSolar)}/L` : ""}`} />
                <Kpi label="Rencana RAB solar" nilai={rabSolar ? `${fmt(rabSolar.qty)} ${rabSolar.uom}` : "—"} sub={rabSolar ? `${rupiah(rabSolar.qty * rabSolar.harga)} · terpakai ${rabSolar.qty ? Math.round((lSolar / rabSolar.qty) * 100) : 0}%` : "tidak ada baris solar di RAB"} warna={rabSolar && lSolar > rabSolar.qty ? "var(--red-600)" : undefined} />
                <Kpi label="Oli & consumable" nilai={rupiah(genset.filter((c) => c.beli?.kategori === "Oli & Consumable Genset").reduce((a, c) => a + c.jumlah, 0))} sub={lOli ? `${fmt(lOli, 1)} L oli` : ""} />
                <Kpi label="Jam operasi genset" nilai={selisihJam ? `${fmt(selisihJam, 1)} jam` : "—"} sub={selisihJam && lSolar ? `≈ ${fmt(lSolar / selisihJam, 1)} L/jam` : "isi hour meter saat beli solar"} />
              </div>
              {genset.length > 0 && (
                <table className="tg-tabel" style={{ marginTop: "12px" }}>
                  <thead><tr><th>Tanggal</th><th>Jenis</th><th>Barang</th><th className="n">Liter</th><th className="n">Hour meter</th><th className="n">Rp</th><th>Vendor</th></tr></thead>
                  <tbody>{genset.map((c) => (
                    <tr key={c.id}><td>{tglPendek(c.tanggal)}</td><td>{c.beli?.kategori === "Solar Genset" ? "Solar" : "Oli/cons."}</td><td>{(c.beli?.items || []).map((i) => i.nama).join(", ")}</td>
                      <td className="n">{literBeli(c.beli) ? fmt(literBeli(c.beli), 1) : "–"}</td><td className="n">{c.beli?.jam_genset ? fmt(c.beli.jam_genset, 1) : "–"}</td><td className="n">{rupiah(c.jumlah)}</td><td>{c.beli?.vendor || "–"}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </Tile>
            <Tile>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                {["SEMUA", "GENSET", ...KATEGORI_BELI.filter((k) => !KATEGORI_GENSET.includes(k))].map((k) => (
                  <button key={k} type="button" className={`tg-chip${filterBeli === k ? " is-on" : ""}`} onClick={() => setFilterBeli(k)}>{k === "SEMUA" ? "Semua" : k === "GENSET" ? "Genset" : k}</button>
                ))}
              </div>
              {tampil.length === 0 ? <div style={{ fontSize: "13px", color: "var(--muted)" }}>Belum ada pembelian.</div> : tampil.map((c) => (
                <div key={c.id}>
                  {barisCatat(c)}
                  {(c.beli?.items || []).some((i) => i.stok_id) && <div style={{ fontSize: "11.5px", color: "var(--ok)", padding: "2px 0 6px 0" }}>↳ masuk stok OB: {c.beli!.items.filter((i) => i.stok_id).map((i) => `${i.stok_nama || i.nama} +${fmt(i.qty)}`).join(", ")}</div>}
                </div>
              ))}
            </Tile>
          </>
        );
      })()}

      {catatan !== null && tab === "ESG" && (
        <>
          <Tile style={{ marginBottom: "14px" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 800 }}>🌱 Data lingkungan (E dari ESG) {tahun}</h3>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px" }}>Dihitung otomatis dari tagihan PLN, PDAM & pembelian solar di menu ini. {bulanTerisi < 12 && tahun <= tahunIni ? `Data baru ${bulanTerisi} dari 12 bulan.` : ""}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
              <Kpi label="Energi listrik" nilai={`${fmt(esg.kwh)} kWh`} sub={luas ? `${fmt(esg.kwh / luas, 1)} kWh/m² (luas ${fmt(luas)} m²)` : "isi luas gedung di Okupansi"} />
              <Kpi label="Air PDAM" nilai={`${fmt(esg.m3)} m³`} sub={luas ? `${fmt((esg.m3 * 1000) / luas, 1)} liter/m²` : ""} />
              <Kpi label="Solar genset" nilai={`${fmt(esg.literSolar)} L`} />
              <Kpi label="Emisi Scope 1 (solar)" nilai={`${fmt(esg.scope1, 2)} tCO₂e`} sub={`${faktor.solar_kgco2_liter} kg/L`} />
              <Kpi label="Emisi Scope 2 (listrik)" nilai={esg.scope2 === null ? "—" : `${fmt(esg.scope2, 2)} tCO₂e`} sub={esg.scope2 === null ? "isi faktor emisi grid dulu" : `${faktor.grid_kgco2_kwh} kg/kWh`} warna={esg.scope2 === null ? "var(--warn)" : undefined} />
              <Kpi label="Total emisi" nilai={esg.total === null ? "—" : `${fmt(esg.total, 2)} tCO₂e`} sub={esg.total !== null && luas ? `${fmt((esg.total * 1000) / luas, 1)} kgCO₂e/m²` : ""} />
            </div>
          </Tile>
          <Tile style={{ marginBottom: "14px", overflowX: "auto" }}>
            <table className="tg-tabel" style={{ minWidth: "600px" }}>
              <thead><tr><th>Bulan</th><th className="n">kWh</th><th className="n">m³ air</th><th className="n">Solar L</th><th className="n">Scope 1 tCO₂e</th><th className="n">Scope 2 tCO₂e</th></tr></thead>
              <tbody>{perBulan.map((r) => { const e = hitungEsg([r], faktor); return (
                <tr key={r.bulan}><td>{labelBulan(r.bulan)}</td><td className="n">{r.kwh ? fmt(r.kwh) : "–"}</td><td className="n">{r.m3 ? fmt(r.m3) : "–"}</td><td className="n">{r.literSolar ? fmt(r.literSolar) : "–"}</td>
                  <td className="n">{e.scope1 ? fmt(e.scope1, 3) : "–"}</td><td className="n">{e.scope2 ? fmt(e.scope2, 3) : "–"}</td></tr>); })}</tbody>
            </table>
          </Tile>
          <Tile>
            <h3 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 800 }}>Faktor emisi</h3>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px" }}>
              Faktor grid listrik (kg CO₂/kWh) isi sesuai faktor emisi sistem Sulbagsel terbitan Kementerian ESDM (atau yang dipakai kantor pusat untuk laporan keberlanjutan). Solar default 2,68 kg CO₂/liter.
            </div>
            {draftFaktor ? (
              <div className="tg-grid" style={{ alignItems: "end" }}>
                <label><span style={lbl}>Grid listrik (kg CO₂/kWh)</span><input className={inp} type="number" step="0.001" value={draftFaktor.grid} onChange={(e) => setDraftFaktor({ ...draftFaktor, grid: e.target.value })} /></label>
                <label><span style={lbl}>Solar (kg CO₂/liter)</span><input className={inp} type="number" step="0.01" value={draftFaktor.solar} onChange={(e) => setDraftFaktor({ ...draftFaktor, solar: e.target.value })} /></label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button type="button" className="sa-btn is-primary" onClick={async () => {
                    const f = { grid_kgco2_kwh: Number(draftFaktor.grid) || 0, solar_kgco2_liter: Number(draftFaktor.solar) || FAKTOR_DEFAULT.solar_kgco2_liter };
                    try { await setDoc(doc(db, "settings", "esg_faktor"), { ...f, diubah_oleh: session?.nama || "-", diubah_pada: serverTimestamp() }); setFaktor(f); setDraftFaktor(null); showToast("Faktor emisi tersimpan.", "success"); }
                    catch { showToast("Gagal menyimpan.", "error"); }
                  }}>Simpan</button>
                  <button type="button" className="sa-btn is-soft" onClick={() => setDraftFaktor(null)}>Batal</button>
                </div>
              </div>
            ) : <button type="button" className="sa-btn is-soft" onClick={() => setDraftFaktor({ grid: faktor.grid_kgco2_kwh ? String(faktor.grid_kgco2_kwh) : "", solar: String(faktor.solar_kgco2_liter) })}>Ubah faktor emisi</button>}
          </Tile>
        </>
      )}

      {/* ---------- modal tagihan ---------- */}
      <Modal open={!!formT} onClose={() => !menyimpan && setFormT(null)} maxWidth="760px">
        {formT && (
          <div style={{ maxHeight: "85vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 800 }}>{formT.editId ? "Ubah" : "Catat"} tagihan {formT.jenis === "PLN" ? "⚡ PLN" : "💧 PDAM"}</h2>
            <div style={{ fontSize: "12.5px", color: "var(--muted)", marginBottom: "12px" }}>
              {formT.jenis === "PLN" ? "Unggah PDF “Rincian Rekening” dari PLN Mobile / web PLN — angka terisi otomatis." : "Unggah PDF “Informasi Tagihan” PDAM — meter awal/akhir & biaya terisi otomatis."} Bisa juga diisi manual.
            </div>
            <label style={{ display: "block", padding: "14px", borderRadius: "12px", border: "2px dashed var(--line)", textAlign: "center", cursor: "pointer", marginBottom: "10px", background: "var(--bg)" }}>
              <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => pilihFile(e.target.files?.[0] || null)} />
              <b>{membaca ? "Membaca PDF…" : formT.file ? `📄 ${formT.file.name}` : formT.file_nama ? `📄 ${formT.file_nama} (ganti?)` : "📤 Pilih / unggah file tagihan"}</b>
            </label>
            {formT.info && <div style={{ padding: "8px 12px", borderRadius: "10px", background: formT.info.startsWith("✓") ? "var(--ok-50)" : "var(--warn-50)", fontSize: "12.5px", marginBottom: "10px" }}>{formT.info}</div>}
            <div className="tg-grid">
              <label><span style={lbl}>{formT.jenis === "PLN" ? "Rekening bulan" : "Bulan tagihan"}</span><input className={inp} type="month" value={formT.periode} onChange={(e) => setFormT({ ...formT, periode: e.target.value })} /></label>
              <label><span style={lbl}>Tanggal bayar</span><input className={inp} type="date" value={formT.tanggal} onChange={(e) => setFormT({ ...formT, tanggal: e.target.value })} /></label>
              <label><span style={lbl}>Jumlah dibayar (Rp)</span><input className={inp} inputMode="numeric" value={formT.jumlah} onChange={(e) => setFormT({ ...formT, jumlah: e.target.value.replace(/[^\d]/g, "") })} /></label>
            </div>
            {formT.jenis === "PLN" ? (() => {
              const p = formT.pln, set = (x: Partial<DataPLN>) => setFormT({ ...formT, pln: { ...p, ...x } });
              return (
                <>
                  <div style={{ fontSize: "12px", fontWeight: 800, margin: "12px 0 6px" }}>Meter & pemakaian</div>
                  <div className="tg-grid">
                    {kolomAngka("Stand awal LWBP", p.lwbp_awal, (n) => set({ lwbp_awal: n }))}
                    {kolomAngka("Stand akhir LWBP", p.lwbp_akhir, (n) => set({ lwbp_akhir: n }))}
                    {kolomAngka("Faktor kali meter", p.faktor_kali, (n) => set({ faktor_kali: n }))}
                    {kolomAngka("kWh LWBP", p.kwh_lwbp, (n) => set({ kwh_lwbp: n }))}
                    {kolomAngka("kWh WBP", p.kwh_wbp, (n) => set({ kwh_wbp: n }))}
                    {kolomAngka("kVArh", p.kvarh, (n) => set({ kvarh: n }))}
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: 800, margin: "12px 0 6px" }}>Rincian biaya</div>
                  <div className="tg-grid">
                    {kolomAngka("Rupiah TTL terpakai", p.rp_ttl, (n) => set({ rp_ttl: n }))}
                    {kolomAngka("PPN", p.ppn, (n) => set({ ppn: n }))}
                    {kolomAngka("PBJT-TL / PPJ", p.ppj, (n) => set({ ppj: n }))}
                    {kolomAngka("Total tagihan", p.total, (n) => set({ total: n }))}
                    {kolomAngka("Bea meterai", p.materai, (n) => set({ materai: n }))}
                    {kolomAngka("Denda / keterlambatan", p.denda, (n) => set({ denda: n }))}
                  </div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "6px" }}>
                    ID pel {p.id_pel || "–"} · {p.golongan || "–"} {p.daya_va ? `/ ${fmt(p.daya_va)} VA` : ""} · tarif LWBP {p.tarif_lwbp ? rupiah(p.tarif_lwbp) : "–"} · subsidi {p.subsidi ? rupiah(p.subsidi) : "–"} · status {p.status || "–"}
                    {p.lwbp_akhir && p.faktor_kali && p.kwh_lwbp && Math.abs((p.lwbp_akhir - p.lwbp_awal) * p.faktor_kali - p.kwh_lwbp) > 2 ? <span style={{ color: "var(--red-600)" }}> · ⚠ stand × faktor kali ≠ kWh LWBP, cek ulang</span> : ""}
                  </div>
                </>
              );
            })() : (() => {
              const p = formT.pdam, set = (x: Partial<DataPDAM>) => setFormT({ ...formT, pdam: { ...p, ...x } });
              const sebelum = pdam.filter((c) => c.periode < formT.periode && c.id !== formT.editId).at(-1);
              return (
                <>
                  <div style={{ fontSize: "12px", fontWeight: 800, margin: "12px 0 6px" }}>Meter air</div>
                  <div className="tg-grid">
                    {kolomAngka("Meter awal", p.m_awal, (n) => set({ m_awal: n, pakai: Math.max(0, p.m_akhir - n) }))}
                    {kolomAngka("Meter akhir", p.m_akhir, (n) => set({ m_akhir: n, pakai: Math.max(0, n - p.m_awal) }))}
                    {kolomAngka("Pakai (m³)", p.pakai, (n) => set({ pakai: n }))}
                  </div>
                  {sebelum?.pdam && sebelum.pdam.m_akhir !== p.m_awal && p.m_awal > 0 && <div style={{ fontSize: "11.5px", color: "var(--red-600)", marginTop: "4px" }}>⚠ Meter akhir {labelBulan(sebelum.periode)} = {fmt(sebelum.pdam.m_akhir)}, tidak sama dengan meter awal ini.</div>}
                  <div style={{ fontSize: "12px", fontWeight: 800, margin: "12px 0 6px" }}>Rincian biaya</div>
                  <div className="tg-grid">
                    {kolomAngka("Biaya pakai", p.by_pakai, (n) => set({ by_pakai: n }))}
                    {kolomAngka("Biaya adm", p.by_adm, (n) => set({ by_adm: n }))}
                    {kolomAngka("Biaya pemeliharaan", p.by_pem, (n) => set({ by_pem: n }))}
                    {kolomAngka("Denda", p.denda, (n) => set({ denda: n }))}
                    {kolomAngka("Total tagihan", p.total, (n) => set({ total: n }))}
                  </div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "6px" }}>No. air {p.no_air || "–"} · {p.golongan || "–"}</div>
                </>
              );
            })()}
            <div className="tg-grid" style={{ marginTop: "12px", gridTemplateColumns: "1fr" }}>
              <label><span style={lbl}>Baris anggaran (RAB {formT.tanggal.slice(0, 4)})</span><select className={inp} value={formT.item_id} onChange={(e) => setFormT({ ...formT, item_id: e.target.value })}>{opsiRab}</select></label>
              <label><span style={lbl}>Catatan (opsional)</span><input className={inp} value={formT.catatan} onChange={(e) => setFormT({ ...formT, catatan: e.target.value })} placeholder="mis. naik karena AC lembur tenant" /></label>
            </div>
            {formT.tanggal.slice(0, 4) !== String(tahun) && <div style={{ fontSize: "11.5px", color: "var(--warn)", marginTop: "4px" }}>Tanggal bayar di tahun {formT.tanggal.slice(0, 4)} — pilihan baris RAB di atas dari tahun {tahun}; ganti tahun di kanan atas bila perlu.</div>}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "14px" }}>
              <button type="button" className="sa-btn is-soft" disabled={menyimpan} onClick={() => setFormT(null)}>Batal</button>
              <button type="button" className="sa-btn is-primary" disabled={menyimpan || membaca} onClick={simpanTagihan}>{menyimpan ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- modal pembelian ---------- */}
      <Modal open={!!formB} onClose={() => !menyimpan && setFormB(null)} maxWidth="820px">
        {formB && (
          <div style={{ maxHeight: "85vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: "18px", fontWeight: 800 }}>🛒 Catat pembelian</h2>
            <div className="tg-grid">
              <label><span style={lbl}>Tanggal</span><input className={inp} type="date" value={formB.tanggal} onChange={(e) => setFormB({ ...formB, tanggal: e.target.value })} /></label>
              <label><span style={lbl}>Kategori</span><select className={inp} value={formB.kategori} onChange={(e) => { const k = e.target.value as KategoriBeli; setFormB({ ...formB, kategori: k, item_id: saranBarisRab(items, k) || formB.item_id }); }}>{KATEGORI_BELI.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label><span style={lbl}>Toko / vendor</span><input className={inp} value={formB.vendor} onChange={(e) => setFormB({ ...formB, vendor: e.target.value })} /></label>
              {KATEGORI_GENSET.includes(formB.kategori) && <label><span style={lbl}>Hour meter genset (jam)</span><input className={inp} type="number" step="0.1" value={formB.jam_genset} onChange={(e) => setFormB({ ...formB, jam_genset: e.target.value })} placeholder="opsional" /></label>}
            </div>
            <div style={{ fontSize: "12px", fontWeight: 800, margin: "12px 0 6px" }}>Barang {KATEGORI_GENSET.includes(formB.kategori) ? "(satuan “liter” dihitung ke jejak solar/oli)" : ""}</div>
            {formB.items.map((it, idx) => {
              const ubah = (x: Partial<typeof it>) => setFormB({ ...formB, items: formB.items.map((y, j) => (j === idx ? { ...y, ...x } : y)) });
              return (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 2fr) 70px 80px minmax(100px, 1fr) minmax(140px, 1.5fr) 34px", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                  <input className={inp} placeholder="Nama barang" value={it.nama} onChange={(e) => ubah({ nama: e.target.value })} />
                  <input className={inp} placeholder="Qty" inputMode="decimal" value={it.qty} onChange={(e) => ubah({ qty: e.target.value })} />
                  <input className={inp} placeholder="Satuan" value={it.satuan} onChange={(e) => ubah({ satuan: e.target.value })} />
                  <input className={inp} placeholder="Harga satuan" inputMode="numeric" value={it.harga} onChange={(e) => ubah({ harga: e.target.value.replace(/[^\d]/g, "") })} />
                  <select className={inp} value={it.stok_id || ""} title="Tambahkan ke stok OB" onChange={(e) => { const s = stok.find((x) => x.id === e.target.value); ubah({ stok_id: s?.id, stok_nama: s?.nama_barang, ...(s && !it.nama ? { nama: s.nama_barang } : {}) }); }}>
                    <option value="">— tidak ke stok OB —</option>
                    {stok.map((s) => <option key={s.id} value={s.id}>+ stok: {s.nama_barang} ({s.qty})</option>)}
                  </select>
                  <button type="button" className="sa-btn is-soft" style={{ height: "36px", padding: 0 }} disabled={formB.items.length === 1} onClick={() => setFormB({ ...formB, items: formB.items.filter((_, j) => j !== idx) })}>✕</button>
                </div>
              );
            })}
            <button type="button" className="sa-btn is-soft" onClick={() => setFormB({ ...formB, items: [...formB.items, { ...ITEM_BARU }] })}>+ Barang</button>
            <div style={{ textAlign: "right", fontSize: "15px", fontWeight: 800, marginTop: "6px" }}>Total {rupiah(totalFormBeli)}</div>
            <div className="tg-grid" style={{ marginTop: "10px", gridTemplateColumns: "1fr" }}>
              <label><span style={lbl}>Baris anggaran (RAB)</span><select className={inp} value={formB.item_id} onChange={(e) => setFormB({ ...formB, item_id: e.target.value })}>{opsiRab}</select></label>
              <label><span style={lbl}>Foto / PDF nota (opsional)</span><input className={inp} type="file" accept="application/pdf,image/*" onChange={(e) => setFormB({ ...formB, file: e.target.files?.[0] || null })} /></label>
              <label><span style={lbl}>Catatan (opsional)</span><input className={inp} value={formB.catatan} onChange={(e) => setFormB({ ...formB, catatan: e.target.value })} /></label>
            </div>
            {formB.items.some((i) => i.stok_id) && <div style={{ fontSize: "12px", color: "var(--ok)", marginTop: "6px" }}>✓ Barang bertanda “+ stok” langsung menambah stok OB & tercatat di riwayat stok (MASUK (PEMBELIAN)).</div>}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "14px" }}>
              <button type="button" className="sa-btn is-soft" disabled={menyimpan} onClick={() => setFormB(null)}>Batal</button>
              <button type="button" className="sa-btn is-primary" disabled={menyimpan} onClick={simpanBeli}>{menyimpan ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
