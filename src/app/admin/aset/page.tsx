"use client";

/**
 * Daftar Aset & As-Built Drawing (§167/§168) -- 1 menu untuk semua aset gedung.
 * Tab Aset: register aset_gedung (utilitas, AC, IT, keselamatan, furniture, ...) + register lama yang ikut tampil
 *   (Laptop sewa, Kendaraan, APAR, Alat kerja OB) dengan tautan ke halaman kelolanya. Peremajaan rutin per aset
 *   (interval bulan) -> jatuh tempo, riwayat peremajaan, biaya bisa langsung dicatat ke Anggaran (realisasi_biaya).
 * Tab As-Built: 1 sheet = 1 dokumen; upload set baru otomatis menggantikan revisi aktif sheet yang cocok
 *   (nomor sheet / nama file), versi lama tersimpan & bisa dibandingkan berdampingan / ditumpuk.
 * Lihat src/lib/asetGedung.ts.
 */

import { useEffect, useState, type ChangeEvent } from "react";
import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import * as XLSX from "xlsx";
import { db, storage } from "../../../lib/firebase";
import { isMagangSaatIni, useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import Modal from "../../../components/ui/Modal";
import { daerahTulis } from "../../../lib/daerah";
import { PERUSAHAAN_LEGAL } from "../../../lib/legalBank";
import type { ItemRab } from "../../../lib/realisasiBiaya";
import {
  KATEGORI_ASET, STATUS_ASET, WARNA_STATUS_ASET, JENIS_PEREMAJAAN, PREFIX_KATEGORI, DISIPLIN_GAMBAR, MAX_FILE_GAMBAR_MB,
  usulanInterval, jatuhTempo, umurHabis, selisihHari, nomorSheetDari, judulDari, kunciGambar, tebakDisiplin, unggahGambar, urlGambar, bisaPratinjau, ekstensiGambar,
  type AsetGedung, type GambarAsBuilt, type RevisiGambar, type StatusAset,
} from "../../../lib/asetGedung";

const hariIni = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
const fmtTgl = (iso?: string | null) => (iso ? new Date(`${iso}T12:00:00+08:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");
const rupiah = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
const angka = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d]/g, "")) || 0);
const LANTAI_USUL = ["Basement", "Lt 1", "Lt 2", "Lt 3", "Lt 4", "Lt 5", "Atap", "Site / Luar gedung", "Semua lantai"];

type Sumber = "aset" | "laptop" | "kendaraan" | "apar" | "alat";
const LABEL_SUMBER: Record<Sumber, string> = { aset: "Aset gedung", laptop: "Laptop", kendaraan: "Kendaraan", apar: "APAR", alat: "Alat kerja OB" };
const LINK_SUMBER: Partial<Record<Sumber, string>> = { laptop: "/admin/laptop", kendaraan: "/admin/kendaraan", apar: "/admin/apar", alat: "/admin/alat-kerja" };
interface Baris {
  id: string; sumber: Sumber; kode: string; nama: string; sub: string; kategori: string; lokasi: string; pemilik: string; pic: string;
  status: string; terakhir: string | null; tempo: string | null; labelTempo: string; perluGanti: string; aset?: AsetGedung;
}
const ASET_KOSONG: AsetGedung = { id: "", kode: "", nama: "", kategori: "Utilitas Gedung", jenis: "", merek_tipe: "", no_seri: "", lokasi: "", pemilik: "", pic: "", tanggal_perolehan: "", nilai_perolehan: 0, umur_ekonomis_tahun: 0, status: "Aktif", interval_bulan: 0, peremajaan_terakhir: "", catatan: "" };

function Pill({ teks, w }: { teks: string; w?: { bg: string; fg: string } }) {
  const x = w || { bg: "var(--bg)", fg: "var(--ink-soft)" };
  return <span style={{ display: "inline-block", fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "999px", background: x.bg, color: x.fg, whiteSpace: "nowrap" }}>{teks}</span>;
}

export default function AsetPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const magang = isMagangSaatIni();
  const hari = hariIni();
  const [tab, setTab] = useState<"ASET" | "ASBUILT">("ASET");

  // ---------- data aset ----------
  const [aset, setAset] = useState<AsetGedung[]>([]);
  const [luar, setLuar] = useState<Baris[] | null>(null);
  const [rab, setRab] = useState<ItemRab[]>([]);
  const [filterSumber, setFilterSumber] = useState<string>("Semua");
  const [filterPemilik, setFilterPemilik] = useState("Semua");
  const [filterTempo, setFilterTempo] = useState<"SEMUA" | "TELAT" | "SEGERA" | "GANTI">("SEMUA");
  const [cari, setCari] = useState("");
  const [formAset, setFormAset] = useState<AsetGedung | null>(null);
  const [formRawat, setFormRawat] = useState<{ a: AsetGedung; tanggal: string; jenis: string; uraian: string; vendor: string; biaya: string; item_id: string; aktifkan: boolean } | null>(null);
  const [lihatRiwayat, setLihatRiwayat] = useState<AsetGedung | null>(null);
  const [impor, setImpor] = useState<Omit<AsetGedung, "id">[] | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  // ---------- data as-built ----------
  const [gambar, setGambar] = useState<GambarAsBuilt[]>([]);
  const [filterDisiplin, setFilterDisiplin] = useState("Semua");
  const [filterLantai, setFilterLantai] = useState("Semua");
  const [unggah, setUnggah] = useState<{ file: File; nomor: string; judul: string; disiplin: string; lantai: string }[] | null>(null);
  const [catatanSet, setCatatanSet] = useState("");
  const [detailGambar, setDetailGambar] = useState<GambarAsBuilt | null>(null);
  const [banding, setBanding] = useState<{ a: RevisiGambar; b: RevisiGambar; urlA: string; urlB: string; tumpuk: number } | null>(null);
  const [progres, setProgres] = useState("");

  useEffect(() => {
    if (!isReady) return;
    const u1 = onSnapshot(collection(db, "aset_gedung"), (s) => setAset(s.docs.map((d) => ({ ...ASET_KOSONG, ...(d.data() as Omit<AsetGedung, "id">), id: d.id })).sort((a, b) => a.kode.localeCompare(b.kode, undefined, { numeric: true }))), (e) => console.error("[aset]", e));
    const u2 = onSnapshot(collection(db, "asbuilt_gambar"), (s) => setGambar(s.docs.map((d) => ({ ...(d.data() as Omit<GambarAsBuilt, "id">), id: d.id })).sort((a, b) => `${a.disiplin}${a.nomor_sheet}${a.judul}`.localeCompare(`${b.disiplin}${b.nomor_sheet}${b.judul}`, undefined, { numeric: true }))), (e) => console.error("[asbuilt]", e));
    let batal = false;
    (async () => {
      const hasil: Baris[] = [];
      try {
        const s = await getDocs(collection(db, "master_laptop"));
        s.docs.forEach((d) => {
          const x = d.data();
          if (x.dikembalikan) return;
          hasil.push({ id: `lp-${d.id}`, sumber: "laptop", kode: x.no_seri || "-", nama: x.merk_model || "Laptop", sub: `Sewa · ${x.vendor || "-"}`, kategori: "Laptop", lokasi: x.departemen || "-", pemilik: x.departemen || "-", pic: x.nama_user || "-", status: "Sewa", terakhir: x.tanggal_mulai || null, tempo: x.tanggal_berakhir || null, labelTempo: "Sewa berakhir", perluGanti: "" });
        });
      } catch (e) { console.error("[aset] laptop:", e); }
      try {
        const [k, sv] = await Promise.all([getDocs(collection(db, "master_kendaraan")), getDocs(query(collection(db, "kendaraan_service_logs"), orderBy("tanggal", "desc"), limit(800)))]);
        const servis = new Map<string, string>();
        sv.docs.forEach((d) => { const x = d.data(); if (x.kendaraan_id && !servis.has(x.kendaraan_id)) servis.set(x.kendaraan_id, x.tanggal); });
        k.docs.forEach((d) => {
          const x = d.data();
          hasil.push({ id: `kd-${d.id}`, sumber: "kendaraan", kode: x.plat_nomor || String(x.kendaraan || "").split(" - ")[0], nama: x.jenis || x.kendaraan || "Kendaraan", sub: x.status_kepemilikan === "Sewa" ? "Sewa" : "Milik", kategori: "Kendaraan", lokasi: "-", pemilik: x.unit_bisnis || "-", pic: x.pic_kendaraan || "-", status: x.status_kepemilikan === "Sewa" ? "Sewa" : "Aktif", terakhir: servis.get(d.id) || null, tempo: x.tanggal_servis_berikutnya || null, labelTempo: "Servis berikutnya", perluGanti: "" });
        });
      } catch (e) { console.error("[aset] kendaraan:", e); }
      try {
        const s = await getDocs(collection(db, "apar_units"));
        s.docs.forEach((d) => {
          const x = d.data();
          const t = x.terakhir_inspeksi?.waktu?.toDate ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(x.terakhir_inspeksi.waktu.toDate()) : null;
          hasil.push({ id: `ap-${d.id}`, sumber: "apar", kode: x.kode || "-", nama: "APAR", sub: x.lokasi || "", kategori: "APAR", lokasi: x.lantai || "-", pemilik: "Gedung", pic: "Security", status: "Aktif", terakhir: t, tempo: x.kadaluarsa || null, labelTempo: "Kadaluarsa", perluGanti: "" });
        });
      } catch (e) { console.error("[aset] apar:", e); }
      try {
        const s = await getDocs(collection(db, "aset_alat"));
        s.docs.forEach((d) => {
          const x = d.data();
          if (x.status === "Afkir") return;
          const t = x.inspeksi_terakhir?.toDate ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(x.inspeksi_terakhir.toDate()) : null;
          hasil.push({ id: `al-${d.id}`, sumber: "alat", kode: x.kode || "-", nama: x.nama || "Alat", sub: x.kategori || "", kategori: "Alat kerja OB", lokasi: "-", pemilik: "Gedung", pic: x.pemegang || "-", status: x.status === "Aktif" ? "Aktif" : x.status, terakhir: t, tempo: null, labelTempo: "", perluGanti: x.status === "Rusak" || x.status === "Hilang" ? x.status : "" });
        });
      } catch (e) { console.error("[aset] alat:", e); }
      try {
        const r = await getDoc(doc(db, "anggaran_rab", hari.slice(0, 4)));
        if (!batal) setRab(Array.isArray(r.data()?.items) ? (r.data()!.items as ItemRab[]) : []);
      } catch (e) { console.error("[aset] rab:", e); }
      if (!batal) setLuar(hasil);
    })();
    return () => { batal = true; u1(); u2(); };
  }, [isReady, hari]);

  if (!isReady || !session) return null;

  // ---------- olah aset ----------
  const barisAset: Baris[] = aset.filter((a) => a.status !== "Dimusnahkan").map((a) => {
    const tempo = jatuhTempo(a);
    const ganti = a.status === "Rusak" || a.status === "Disposal" ? a.status : umurHabis(a, hari) ? "Umur ekonomis habis" : "";
    return { id: a.id, sumber: "aset", kode: a.kode, nama: a.nama, sub: [a.jenis, a.merek_tipe].filter(Boolean).join(" · "), kategori: a.kategori, lokasi: a.lokasi || "-", pemilik: a.pemilik || "-", pic: a.pic || "-", status: a.status, terakhir: a.peremajaan_terakhir || null, tempo, labelTempo: tempo ? `Peremajaan /${a.interval_bulan} bln` : "", perluGanti: ganti, aset: a };
  });
  const semua = [...barisAset, ...(luar || [])];
  const telat = (b: Baris) => !!b.tempo && b.tempo < hari;
  const segera = (b: Baris) => !!b.tempo && b.tempo >= hari && selisihHari(hari, b.tempo) <= 30;
  const daftarSumber = ["Semua", ...KATEGORI_ASET.filter((k) => barisAset.some((b) => b.kategori === k)), ...(["Laptop", "Kendaraan", "APAR", "Alat kerja OB"].filter((k) => (luar || []).some((b) => b.kategori === k)))];
  const pemilikHitung = new Map<string, number>();
  semua.forEach((b) => pemilikHitung.set(b.pemilik || "-", (pemilikHitung.get(b.pemilik || "-") || 0) + 1));
  const daftarPemilik = Array.from(pemilikHitung.entries()).sort((a, b) => b[1] - a[1]);
  const tampil = semua.filter((b) => (filterSumber === "Semua" || b.kategori === filterSumber) && (filterPemilik === "Semua" || b.pemilik === filterPemilik)
    && (filterTempo === "SEMUA" || (filterTempo === "TELAT" ? telat(b) : filterTempo === "SEGERA" ? segera(b) : !!b.perluGanti))
    && (!cari.trim() || `${b.kode} ${b.nama} ${b.sub} ${b.lokasi} ${b.pemilik} ${b.pic}`.toLowerCase().includes(cari.toLowerCase())))
    .sort((a, b) => (telat(b) ? 1 : 0) - (telat(a) ? 1 : 0) || (a.tempo || "9999").localeCompare(b.tempo || "9999"));
  const pemilikUsul = Array.from(new Set(["Gedung", ...PERUSAHAAN_LEGAL.map((p) => p.nama), ...aset.map((a) => a.pemilik || "").filter(Boolean)]));

  const kodeBaru = (kategori: string) => {
    const pre = PREFIX_KATEGORI[kategori] || "AS";
    const n = aset.filter((a) => a.kode.startsWith(`${pre}-`)).map((a) => Number(a.kode.split("-").pop()) || 0);
    return `${pre}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(4, "0")}`;
  };
  const simpanAset = async () => {
    const f = formAset;
    if (!f) return;
    if (!f.nama.trim()) return showToast("Isi nama aset.", "warning");
    setMenyimpan(true);
    try {
      const { id, ...isi } = f;
      const data = { ...isi, nama: f.nama.trim(), kode: f.kode.trim() || kodeBaru(f.kategori), nilai_perolehan: angka(f.nilai_perolehan), umur_ekonomis_tahun: angka(f.umur_ekonomis_tahun), interval_bulan: angka(f.interval_bulan), riwayat: f.riwayat || [], diperbarui_oleh: session.nama || "-", diperbarui_pada: serverTimestamp() };
      if (id) await updateDoc(doc(db, "aset_gedung", id), data);
      else await addDoc(collection(db, "aset_gedung"), { ...data, daerah: daerahTulis(), dibuat_pada: serverTimestamp() });
      showToast("Aset tersimpan.", "success");
      setFormAset(null);
    } catch (e) { console.error(e); showToast("Gagal menyimpan aset.", "error"); }
    finally { setMenyimpan(false); }
  };
  const hapusAset = async (a: AsetGedung) => {
    if (!(await confirm({ title: "Hapus aset", message: `Hapus ${a.kode} ${a.nama} beserta riwayatnya? Untuk aset yang dibuang/dijual, lebih baik ubah status ke Dimusnahkan agar jejaknya tetap ada.`, confirmText: "Hapus", variant: "danger" }))) return;
    try { await deleteDoc(doc(db, "aset_gedung", a.id)); setFormAset(null); showToast("Aset dihapus.", "success"); } catch (e) { console.error(e); showToast("Gagal menghapus.", "error"); }
  };
  const simpanRawat = async () => {
    const f = formRawat;
    if (!f) return;
    if (!f.tanggal || !f.uraian.trim()) return showToast("Isi tanggal & uraian peremajaan.", "warning");
    const biaya = angka(f.biaya);
    setMenyimpan(true);
    try {
      const oleh = session.nama || "-";
      await updateDoc(doc(db, "aset_gedung", f.a.id), {
        riwayat: arrayUnion({ tanggal: f.tanggal, jenis: f.jenis, uraian: f.uraian.trim(), vendor: f.vendor.trim(), biaya, oleh }),
        peremajaan_terakhir: !f.a.peremajaan_terakhir || f.tanggal > f.a.peremajaan_terakhir ? f.tanggal : f.a.peremajaan_terakhir,
        ...(f.aktifkan ? { status: "Aktif" } : {}),
        diperbarui_oleh: oleh, diperbarui_pada: serverTimestamp(),
      });
      // biaya langsung jadi realisasi anggaran (baris RAB dipilih)
      if (biaya > 0 && f.item_id) {
        const item = rab.find((i) => i.id === f.item_id);
        await addDoc(collection(db, "realisasi_biaya"), { daerah: daerahTulis(), tanggal: f.tanggal, item_id: f.item_id, kategori: item?.kelompok || "", uraian: `${f.a.kode} ${f.a.nama}: ${f.jenis} — ${f.uraian.trim()}`.slice(0, 160), jumlah: biaya, sumber_aset: f.a.id, dibuat_oleh: oleh, dibuat_pada: serverTimestamp() });
      }
      showToast(`Peremajaan ${f.a.kode} tercatat${biaya > 0 && f.item_id ? " & masuk realisasi anggaran" : ""}.`, "success");
      setFormRawat(null);
    } catch (e) { console.error(e); showToast("Gagal mencatat peremajaan.", "error"); }
    finally { setMenyimpan(false); }
  };

  // ---------- import / export aset ----------
  const KOLOM = ["Nama", "Kategori", "Jenis", "Merek/Tipe", "No Seri", "Lokasi", "Pemilik", "PIC", "Tgl Perolehan", "Nilai Perolehan", "Umur Ekonomis (th)", "Interval Peremajaan (bln)", "Peremajaan Terakhir", "Status", "Catatan"];
  const unduhTemplate = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([KOLOM, ["AC Split Ruang Rapat", "AC & Tata Udara", "AC Split 2 PK", "Daikin FTKC50", "SN123", "Lt 2 - Ruang Rapat", "Gedung", "Teknisi", "2022-03-15", 8500000, 8, 3, "2026-08-10", "Aktif", ""], ["Genset 60 kVA", "Utilitas Gedung", "Genset", "Perkins", "", "Basement", "Gedung", "Engineering", "2018-01-10", 250000000, 15, 12, "2026-01-20", "Aktif", ""]]), "Aset");
    XLSX.writeFile(wb, "Template_Aset_SIBM.xlsx");
  };
  const tglExcel = (v: unknown) => {
    if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : ""; }
    const s = String(v || "").trim();
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  };
  const pilihImpor = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const ambil = (r: Record<string, unknown>, ...k: string[]) => { const kunci = Object.keys(r).find((x) => k.some((y) => x.toLowerCase().replace(/[^a-z]/g, "").startsWith(y))); return kunci ? r[kunci] : ""; };
      const hasil = rows.map((r) => {
        const jenis = String(ambil(r, "jenis") || "").trim();
        const kat = String(ambil(r, "kategori") || "").trim();
        const kategori = (KATEGORI_ASET as readonly string[]).find((k) => k.toLowerCase() === kat.toLowerCase()) || usulanInterval(jenis)?.kategori || "Lainnya";
        const st = String(ambil(r, "status") || "Aktif").trim();
        return {
          kode: "", nama: String(ambil(r, "nama") || "").trim(), kategori, jenis, merek_tipe: String(ambil(r, "merek", "tipe") || "").trim(), no_seri: String(ambil(r, "noseri", "serial") || "").trim(),
          lokasi: String(ambil(r, "lokasi") || "").trim(), pemilik: String(ambil(r, "pemilik") || "").trim(), pic: String(ambil(r, "pic") || "").trim(),
          tanggal_perolehan: tglExcel(ambil(r, "tglperolehan", "tanggalperolehan")), nilai_perolehan: angka(ambil(r, "nilai")), umur_ekonomis_tahun: angka(ambil(r, "umur")),
          interval_bulan: angka(ambil(r, "interval")) || usulanInterval(jenis)?.bulan || 0, peremajaan_terakhir: tglExcel(ambil(r, "peremajaan")),
          status: ((STATUS_ASET as readonly string[]).includes(st) ? st : "Aktif") as StatusAset, catatan: String(ambil(r, "catatan") || "").trim(), riwayat: [],
        };
      }).filter((x) => x.nama);
      if (!hasil.length) return showToast("Tidak ada baris dengan kolom Nama.", "warning");
      setImpor(hasil);
    } catch (err) { console.error(err); showToast("File tidak terbaca.", "error"); }
  };
  const jalankanImpor = async () => {
    if (!impor) return;
    setMenyimpan(true);
    try {
      const hitung: Record<string, number> = {};
      for (const x of impor) {
        const pre = PREFIX_KATEGORI[x.kategori] || "AS";
        const dasar = aset.filter((a) => a.kode.startsWith(`${pre}-`)).map((a) => Number(a.kode.split("-").pop()) || 0);
        hitung[pre] = (hitung[pre] ?? (dasar.length ? Math.max(...dasar) : 0)) + 1;
        await addDoc(collection(db, "aset_gedung"), { ...x, kode: `${pre}-${String(hitung[pre]).padStart(4, "0")}`, daerah: daerahTulis(), dibuat_pada: serverTimestamp(), diperbarui_oleh: session.nama || "-" });
      }
      showToast(`${impor.length} aset diimport.`, "success");
      setImpor(null);
    } catch (e) { console.error(e); showToast("Import terhenti karena galat.", "error"); }
    finally { setMenyimpan(false); }
  };
  const ekspor = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Kode", "Sumber", "Kategori", "Nama", "Keterangan", "Lokasi", "Pemilik", "PIC", "Status", "Terakhir", "Jatuh Tempo", "Keterangan Tempo", "Perlu Diganti"],
      ...semua.map((b) => [b.kode, LABEL_SUMBER[b.sumber], b.kategori, b.nama, b.sub, b.lokasi, b.pemilik, b.pic, b.status, b.terakhir || "", b.tempo || "", b.labelTempo, b.perluGanti]),
    ]), "Daftar Aset");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Kode", "Aset", "Tanggal", "Jenis", "Uraian", "Vendor", "Biaya", "Oleh"],
      ...aset.flatMap((a) => (a.riwayat || []).map((r) => [a.kode, a.nama, r.tanggal, r.jenis, r.uraian, r.vendor || "", r.biaya || 0, r.oleh])),
    ]), "Riwayat Peremajaan");
    XLSX.writeFile(wb, `Daftar_Aset_${hari}.xlsx`);
  };

  // ---------- as-built ----------
  const indeksKunci = new Map(gambar.map((g) => [g.kunci, g]));
  const cocokkan = (u: { nomor: string; judul: string; disiplin: string; lantai: string }) => indeksKunci.get(kunciGambar(u.nomor, u.judul, u.disiplin, u.lantai));
  const pilihFileGambar = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if (!files.length) return;
    setCatatanSet("");
    setUnggah(files.map((file) => {
      const nomor = nomorSheetDari(file.name);
      const judul = judulDari(file.name) || file.name;
      const lama = indeksKunci.get(kunciGambar(nomor, judul));
      return { file, nomor, judul: lama?.judul || judul, disiplin: lama?.disiplin || tebakDisiplin(nomor) || "Arsitektur", lantai: lama?.lantai || "" };
    }));
  };
  const jalankanUnggah = async () => {
    if (!unggah) return;
    const adaRevisi = unggah.some((u) => cocokkan(u));
    if (adaRevisi && !catatanSet.trim()) return showToast("Isi catatan perubahan (apa yang diperbaiki / berbeda dari gambar lama).", "warning");
    setMenyimpan(true);
    let ok = 0;
    try {
      for (const [i, u] of unggah.entries()) {
        setProgres(`Mengunggah ${i + 1}/${unggah.length}: ${u.file.name}`);
        const lama = cocokkan(u);
        const up = await unggahGambar(u.file, u.disiplin);
        const rev: RevisiGambar = { rev: lama ? (lama.revisi_aktif?.rev || 0) + 1 : 0, tanggal: hari, file_path: up.path, file_nama: up.nama, catatan: lama ? catatanSet.trim() : catatanSet.trim() || "Gambar awal", oleh: session.nama || "-" };
        if (lama) await updateDoc(doc(db, "asbuilt_gambar", lama.id), { revisi_aktif: rev, riwayat: arrayUnion(lama.revisi_aktif), diperbarui_pada: serverTimestamp() });
        else await addDoc(collection(db, "asbuilt_gambar"), { disiplin: u.disiplin, lantai: u.lantai.trim(), nomor_sheet: u.nomor.trim().toUpperCase(), judul: u.judul.trim(), kunci: kunciGambar(u.nomor, u.judul, u.disiplin, u.lantai.trim()), revisi_aktif: rev, riwayat: [], daerah: daerahTulis(), dibuat_pada: serverTimestamp() });
        ok++;
      }
      showToast(`${ok} gambar tersimpan — set as-built diperbarui.`, "success");
      setUnggah(null);
    } catch (e) { console.error(e); showToast(`${(e as Error).message || "Gagal mengunggah."} (${ok} berhasil)`, "error"); }
    finally { setMenyimpan(false); setProgres(""); }
  };
  const bukaRevisi = async (r: RevisiGambar) => {
    const tabBaru = bisaPratinjau(r.file_nama) ? window.open("", "_blank") : null;
    try {
      const url = await urlGambar(r.file_path);
      if (tabBaru) tabBaru.location.href = url;
      else { const a = document.createElement("a"); a.href = url; a.download = r.file_nama; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) { console.error(e); tabBaru?.close(); showToast("File tidak bisa dibuka (izin / koneksi).", "error"); }
  };
  const mulaiBanding = async (a: RevisiGambar, b: RevisiGambar) => {
    if (!bisaPratinjau(a.file_nama) || !bisaPratinjau(b.file_nama)) return showToast("Perbandingan hanya untuk PDF / gambar. File DWG silakan diunduh.", "warning");
    try { setBanding({ a, b, urlA: await urlGambar(a.file_path), urlB: await urlGambar(b.file_path), tumpuk: 50 }); }
    catch (e) { console.error(e); showToast("Gagal memuat file.", "error"); }
  };
  const tutupBanding = () => { if (banding) { URL.revokeObjectURL(banding.urlA); URL.revokeObjectURL(banding.urlB); } setBanding(null); };
  const hapusGambar = async (g: GambarAsBuilt) => {
    if (!(await confirm({ title: "Hapus sheet", message: `Hapus ${g.nomor_sheet || ""} ${g.judul} beserta ${1 + (g.riwayat?.length || 0)} revisinya?`, confirmText: "Hapus", variant: "danger" }))) return;
    try {
      await Promise.all([g.revisi_aktif, ...(g.riwayat || [])].map((r) => deleteObject(ref(storage, r.file_path)).catch(() => undefined)));
      await deleteDoc(doc(db, "asbuilt_gambar", g.id));
      setDetailGambar(null);
      showToast("Sheet dihapus.", "success");
    } catch (e) { console.error(e); showToast("Gagal menghapus.", "error"); }
  };
  const lantaiGambar = Array.from(new Set(gambar.map((g) => g.lantai).filter(Boolean))).sort();
  const gambarTampil = gambar.filter((g) => (filterDisiplin === "Semua" || g.disiplin === filterDisiplin) && (filterLantai === "Semua" || g.lantai === filterLantai)
    && (!cari.trim() || `${g.nomor_sheet} ${g.judul} ${g.revisi_aktif?.catatan || ""}`.toLowerCase().includes(cari.toLowerCase())));
  const terakhirUpdate = gambar.reduce((m, g) => (g.revisi_aktif?.tanggal > m ? g.revisi_aktif.tanggal : m), "");

  const kartu = (judul: string, nilai: string | number, sub: string, warna: string, aktif: boolean, onClick?: () => void) => (
    <button type="button" onClick={onClick} style={{ textAlign: "left", padding: "12px 14px", borderRadius: "16px", border: `1px solid ${aktif ? warna : "var(--line)"}`, background: "var(--surface)", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", color: "var(--ink)" }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>{judul}</div>
      <div style={{ fontSize: "26px", fontWeight: 800, color: warna, fontVariantNumeric: "tabular-nums" }}>{nilai}</div>
      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{sub}</div>
    </button>
  );

  return (
    <AdminShell title="Daftar Aset" subtitle="Semua aset gedung, peremajaan rutin & gambar as-built dalam 1 menu" userName={session.nama || "Admin"}>
      <style dangerouslySetInnerHTML={{ __html: `
        .as-in { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 13px; font-family: inherit; box-sizing: border-box; min-width: 0; }
        .as-lbl { display: block; font-size: 11.5px; font-weight: 800; color: var(--ink-soft); margin-bottom: 4px; }
        .as-chip { border: 1px solid var(--line); background: var(--bg); color: var(--ink-soft); border-radius: 999px; padding: 6px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .as-chip.is-on { background: var(--ink); color: var(--surface); border-color: transparent; }
        .as-tabel { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 980px; }
        .as-tabel th { text-align: left; padding: 9px 10px; background: var(--bg); color: var(--ink-soft); font-size: 11.5px; font-weight: 800; border-bottom: 1px solid var(--line); white-space: nowrap; }
        .as-tabel td { padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
        .as-kartu { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 12px; }
        .as-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
      ` }} />

      <div className="sa-tabs" role="tablist" aria-label="Bagian aset" style={{ width: "fit-content", maxWidth: "100%", marginBottom: "14px" }}>
        {([["ASET", `Aset (${semua.length})`], ["ASBUILT", `As-Built Drawing (${gambar.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sa-tab${tab === k ? " is-active" : ""}`} onClick={() => { setTab(k); setCari(""); }}>{l}</button>
        ))}
      </div>

      {/* ===================== ASET ===================== */}
      {tab === "ASET" && (
        <>
          <div className="as-kartu">
            {kartu("Total aset", semua.length, `${barisAset.length} aset gedung · ${(luar || []).length} dari register lain`, "var(--ink)", filterTempo === "SEMUA", () => setFilterTempo("SEMUA"))}
            {kartu("Peremajaan terlambat", semua.filter(telat).length, "lewat jatuh tempo", "var(--red-600)", filterTempo === "TELAT", () => setFilterTempo("TELAT"))}
            {kartu("Jatuh tempo ≤ 30 hari", semua.filter(segera).length, "jadwalkan vendor / anggaran", "var(--warn)", filterTempo === "SEGERA", () => setFilterTempo("SEGERA"))}
            {kartu("Perlu diganti", semua.filter((b) => b.perluGanti).length, "rusak, disposal, umur ekonomis habis", "var(--accent)", filterTempo === "GANTI", () => setFilterTempo("GANTI"))}
            <div style={{ padding: "12px 14px", borderRadius: "16px", border: "1px solid var(--line)", background: "var(--surface)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", marginBottom: "6px" }}>Kepemilikan</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px", maxHeight: "86px", overflowY: "auto" }}>
                {daftarPemilik.map(([p, n]) => (
                  <button key={p} type="button" onClick={() => setFilterPemilik(filterPemilik === p ? "Semua" : p)} style={{ display: "flex", justifyContent: "space-between", gap: "8px", border: "none", background: filterPemilik === p ? "var(--bg)" : "transparent", borderRadius: "6px", padding: "1px 4px", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", color: "var(--ink)" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span><b>{n}</b>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px", overflowX: "auto" }}>
            {daftarSumber.map((k) => <button key={k} type="button" className={`as-chip${filterSumber === k ? " is-on" : ""}`} onClick={() => setFilterSumber(k)}>{k}{k !== "Semua" ? ` (${semua.filter((b) => b.kategori === k).length})` : ""}</button>)}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            <input className="as-in" style={{ width: "260px" }} placeholder="Cari kode, nama, lokasi, PIC..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari aset" />
            {filterPemilik !== "Semua" && <button type="button" className="as-chip is-on" onClick={() => setFilterPemilik("Semua")}>Pemilik: {filterPemilik} ×</button>}
            <div style={{ flex: 1 }} />
            <button type="button" className="sa-btn is-soft" onClick={ekspor}>Export</button>
            <button type="button" className="sa-btn is-soft" onClick={unduhTemplate}>Template</button>
            <label className="sa-btn is-soft" style={{ cursor: "pointer" }}>Import Excel<input type="file" accept=".xlsx,.xls,.csv" onChange={pilihImpor} style={{ display: "none" }} /></label>
            <button type="button" className="sa-btn is-primary" onClick={() => setFormAset({ ...ASET_KOSONG, pemilik: "Gedung" })}>+ Aset</button>
          </div>

          <Tile>
            {luar === null && <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>Memuat laptop, kendaraan, APAR & alat kerja…</div>}
            {tampil.length === 0 ? <div style={{ padding: "26px", textAlign: "center", color: "var(--muted)" }}>{semua.length ? "Tidak ada aset pada filter ini." : "Belum ada aset. Mulai dari + Aset atau Import Excel (unduh Template dulu)."}</div> : (
              <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
                <table className="as-tabel">
                  <thead><tr><th>Kode</th><th>Aset</th><th>Lokasi</th><th>Pemilik / PIC</th><th>Status</th><th>Peremajaan terakhir</th><th>Jatuh tempo</th><th /></tr></thead>
                  <tbody>
                    {tampil.slice(0, 500).map((b) => {
                      const sisa = b.tempo ? selisihHari(hari, b.tempo) : null;
                      return (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{b.kode}<div style={{ fontSize: "10.5px", color: "var(--muted)", fontWeight: 700 }}>{b.kategori}</div></td>
                          <td style={{ minWidth: "200px" }}><div style={{ fontWeight: 700, color: "var(--ink)" }}>{b.nama}</div>{b.sub && <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{b.sub}</div>}{b.perluGanti && <div style={{ fontSize: "11.5px", color: "var(--accent)", fontWeight: 800 }}>Perlu diganti: {b.perluGanti}</div>}</td>
                          <td>{b.lokasi}</td>
                          <td><div>{b.pemilik}</div><div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{b.pic}</div></td>
                          <td><Pill teks={b.status} w={WARNA_STATUS_ASET[b.status]} /></td>
                          <td style={{ whiteSpace: "nowrap" }}>{fmtTgl(b.terakhir)}{b.aset?.riwayat?.length ? <div style={{ fontSize: "11px", color: "var(--muted)" }}>{b.aset.riwayat[b.aset.riwayat.length - 1].jenis}</div> : null}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {b.tempo ? <>
                              <div style={{ fontWeight: 800, color: sisa! < 0 ? "var(--red-600)" : sisa! <= 30 ? "var(--warn)" : "var(--ink)" }}>{fmtTgl(b.tempo)}</div>
                              <div style={{ fontSize: "11px", color: sisa! < 0 ? "var(--red-600)" : "var(--muted)" }}>{sisa! < 0 ? `lewat ${-sisa!} hari` : `${sisa} hari lagi`} · {b.labelTempo}</div>
                            </> : <span style={{ color: "var(--muted)", fontSize: "12px" }}>{b.sumber === "aset" ? "tidak rutin" : "—"}</span>}
                          </td>
                          <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                            {b.aset ? <>
                              <button type="button" className="sa-btn is-soft" style={{ height: "30px", fontSize: "12px" }} onClick={() => setLihatRiwayat(b.aset!)}>Riwayat{b.aset.riwayat?.length ? ` (${b.aset.riwayat.length})` : ""}</button>{" "}
                              <button type="button" className="sa-btn is-primary" style={{ height: "30px", fontSize: "12px" }} onClick={() => setFormRawat({ a: b.aset!, tanggal: hari, jenis: "Servis rutin", uraian: "", vendor: "", biaya: "", item_id: "", aktifkan: b.aset!.status === "Dalam perbaikan" || b.aset!.status === "Rusak" })}>+ Catat</button>{" "}
                              <button type="button" className="sa-btn is-soft" style={{ height: "30px", fontSize: "12px" }} onClick={() => setFormAset({ ...ASET_KOSONG, ...b.aset! })}>Ubah</button>
                            </> : <a href={LINK_SUMBER[b.sumber]} className="sa-btn is-soft" style={{ height: "30px", fontSize: "12px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Kelola di {LABEL_SUMBER[b.sumber]} →</a>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ margin: "8px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Laptop, Kendaraan, APAR & Alat kerja OB tetap dikelola di halamannya masing-masing — di sini ikut tampil supaya semua aset terlihat dalam 1 daftar. Jatuh tempo aset gedung = peremajaan terakhir + interval.</p>
          </Tile>
        </>
      )}

      {/* ===================== AS-BUILT ===================== */}
      {tab === "ASBUILT" && (
        <>
          <div className="as-kartu">
            {kartu("Sheet berlaku", gambar.length, `${gambar.reduce((a, g) => a + (g.riwayat?.length || 0), 0)} revisi lama tersimpan`, "var(--ink)", false)}
            {kartu("Disiplin", new Set(gambar.map((g) => g.disiplin)).size, DISIPLIN_GAMBAR.filter((d) => gambar.some((g) => g.disiplin === d)).slice(0, 3).join(", ") || "—", "var(--info)", false)}
            {kartu("Pernah direvisi", gambar.filter((g) => (g.riwayat?.length || 0) > 0).length, "sheet dengan perubahan", "var(--warn)", false)}
            {kartu("Update terakhir", terakhirUpdate ? fmtTgl(terakhirUpdate) : "—", "tanggal upload terbaru", "var(--ok)", false)}
          </div>
          <Tile style={{ marginBottom: "12px", background: "var(--info-50)" }}>
            <div style={{ fontSize: "12.5px", color: "var(--ink)", lineHeight: 1.6 }}>
              <b>Cara kerja:</b> upload sekaligus semua file gambar baru (PDF / JPG / PNG / DWG). Sistem mencocokkan tiap file ke sheet lama lewat <b>nomor sheet</b> di nama file (mis. <code>AR-101 Denah Lt1 rev2.pdf</code>) — yang cocok otomatis <b>menggantikan</b> versi lama (versi lama tetap tersimpan sebagai riwayat), yang tidak cocok menjadi sheet baru. Hasilnya selalu 1 set gambar terbaru. Isi catatan apa yang berubah, lalu bandingkan lama vs baru dari tombol Riwayat.
            </div>
          </Tile>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
            {["Semua", ...DISIPLIN_GAMBAR.filter((d) => gambar.some((g) => g.disiplin === d))].map((d) => <button key={d} type="button" className={`as-chip${filterDisiplin === d ? " is-on" : ""}`} onClick={() => setFilterDisiplin(d)}>{d}{d !== "Semua" ? ` (${gambar.filter((g) => g.disiplin === d).length})` : ""}</button>)}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            <select className="as-in" style={{ width: "180px" }} value={filterLantai} onChange={(e) => setFilterLantai(e.target.value)} aria-label="Filter lantai"><option value="Semua">Semua lantai</option>{lantaiGambar.map((l) => <option key={l}>{l}</option>)}</select>
            <input className="as-in" style={{ width: "240px" }} placeholder="Cari nomor / judul / catatan..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari gambar" />
            <div style={{ flex: 1 }} />
            <label className="sa-btn is-primary" style={{ cursor: "pointer" }}>Upload gambar / set revisi<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf" onChange={pilihFileGambar} style={{ display: "none" }} /></label>
          </div>
          <Tile>
            {gambarTampil.length === 0 ? <div style={{ padding: "26px", textAlign: "center", color: "var(--muted)" }}>{gambar.length ? "Tidak ada gambar pada filter ini." : "Belum ada gambar as-built. Upload set gambar lama dulu, lalu set baru — sistem menggabungkannya otomatis."}</div> : (
              <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
                <table className="as-tabel" style={{ minWidth: "820px" }}>
                  <thead><tr><th>No. sheet</th><th>Judul</th><th>Disiplin</th><th>Lantai</th><th>Revisi berlaku</th><th>Perubahan terakhir</th><th /></tr></thead>
                  <tbody>
                    {gambarTampil.map((g) => (
                      <tr key={g.id}>
                        <td style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{g.nomor_sheet || "—"}</td>
                        <td style={{ minWidth: "200px", fontWeight: 700, color: "var(--ink)" }}>{g.judul}<div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 500 }}>{g.revisi_aktif?.file_nama}</div></td>
                        <td>{g.disiplin}</td>
                        <td>{g.lantai || "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}><Pill teks={`Rev ${g.revisi_aktif?.rev ?? 0}`} w={(g.riwayat?.length || 0) > 0 ? { bg: "var(--warn-50)", fg: "var(--warn)" } : undefined} /><div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>{fmtTgl(g.revisi_aktif?.tanggal)}</div></td>
                        <td style={{ minWidth: "200px", fontSize: "12px", color: "var(--ink-soft)" }}>{g.revisi_aktif?.catatan || "—"}</td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          <button type="button" className="sa-btn is-soft" style={{ height: "30px", fontSize: "12px" }} onClick={() => bukaRevisi(g.revisi_aktif)}>{bisaPratinjau(g.revisi_aktif?.file_nama || "") ? "Buka" : "Unduh"}</button>{" "}
                          <button type="button" className="sa-btn is-soft" style={{ height: "30px", fontSize: "12px" }} onClick={() => setDetailGambar(g)}>Riwayat ({1 + (g.riwayat?.length || 0)})</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tile>
        </>
      )}

      {/* ===================== MODAL ASET ===================== */}
      <Modal open={!!formAset} onClose={() => !menyimpan && setFormAset(null)} maxWidth="720px">
        {formAset && (
          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: "18px", color: "var(--ink)" }}>{formAset.id ? `Ubah ${formAset.kode}` : "Aset baru"}</h3>
            <div className="as-grid2">
              <label style={{ gridColumn: "1 / -1" }}><span className="as-lbl">Nama aset *</span><input className="as-in" value={formAset.nama} onChange={(e) => setFormAset({ ...formAset, nama: e.target.value })} placeholder="Mis. AC Split Ruang Rapat Lt 2" /></label>
              <label><span className="as-lbl">Kategori</span><select className="as-in" value={formAset.kategori} onChange={(e) => setFormAset({ ...formAset, kategori: e.target.value })}>{KATEGORI_ASET.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label><span className="as-lbl">Jenis</span><input className="as-in" value={formAset.jenis} onChange={(e) => { const jenis = e.target.value; const u = usulanInterval(jenis); setFormAset({ ...formAset, jenis, ...(u && !formAset.id && !formAset.interval_bulan ? { interval_bulan: u.bulan, kategori: u.kategori } : {}) }); }} placeholder="AC split, Genset, Pompa..." /></label>
              <label><span className="as-lbl">Kode</span><input className="as-in" value={formAset.kode} onChange={(e) => setFormAset({ ...formAset, kode: e.target.value.toUpperCase() })} placeholder={`otomatis: ${kodeBaru(formAset.kategori)}`} /></label>
              <label><span className="as-lbl">Merek / tipe</span><input className="as-in" value={formAset.merek_tipe || ""} onChange={(e) => setFormAset({ ...formAset, merek_tipe: e.target.value })} /></label>
              <label><span className="as-lbl">No. seri</span><input className="as-in" value={formAset.no_seri || ""} onChange={(e) => setFormAset({ ...formAset, no_seri: e.target.value })} /></label>
              <label><span className="as-lbl">Lokasi</span><input className="as-in" list="as-lantai" value={formAset.lokasi || ""} onChange={(e) => setFormAset({ ...formAset, lokasi: e.target.value })} placeholder="Lt 2 - Ruang Rapat" /></label>
              <label><span className="as-lbl">Pemilik</span><input className="as-in" list="as-pemilik" value={formAset.pemilik || ""} onChange={(e) => setFormAset({ ...formAset, pemilik: e.target.value })} placeholder="Gedung / nama PT / tenant" /></label>
              <label><span className="as-lbl">PIC</span><input className="as-in" value={formAset.pic || ""} onChange={(e) => setFormAset({ ...formAset, pic: e.target.value })} placeholder="Teknisi / Engineering / nama" /></label>
              <label><span className="as-lbl">Status</span><select className="as-in" value={formAset.status} onChange={(e) => setFormAset({ ...formAset, status: e.target.value as StatusAset })}>{STATUS_ASET.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label><span className="as-lbl">Tgl perolehan</span><input type="date" className="as-in" value={formAset.tanggal_perolehan || ""} onChange={(e) => setFormAset({ ...formAset, tanggal_perolehan: e.target.value })} /></label>
              <label><span className="as-lbl">Nilai perolehan (Rp)</span><input className="as-in" inputMode="numeric" value={formAset.nilai_perolehan ? new Intl.NumberFormat("id-ID").format(formAset.nilai_perolehan) : ""} onChange={(e) => setFormAset({ ...formAset, nilai_perolehan: angka(e.target.value) })} /></label>
              <label><span className="as-lbl">Umur ekonomis (tahun)</span><input className="as-in" inputMode="numeric" value={formAset.umur_ekonomis_tahun || ""} onChange={(e) => setFormAset({ ...formAset, umur_ekonomis_tahun: angka(e.target.value) })} placeholder="mis. 8" /></label>
              <label><span className="as-lbl">Peremajaan rutin</span>
                <select className="as-in" value={formAset.interval_bulan || 0} onChange={(e) => setFormAset({ ...formAset, interval_bulan: Number(e.target.value) })}>
                  {[[0, "Tidak rutin"], [1, "Tiap bulan"], [2, "Tiap 2 bulan"], [3, "Tiap 3 bulan"], [4, "Tiap 4 bulan"], [6, "Tiap 6 bulan"], [12, "Tiap 1 tahun"], [24, "Tiap 2 tahun"], [36, "Tiap 3 tahun"], [60, "Tiap 5 tahun"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label><span className="as-lbl">Peremajaan terakhir</span><input type="date" className="as-in" value={formAset.peremajaan_terakhir || ""} max={hari} onChange={(e) => setFormAset({ ...formAset, peremajaan_terakhir: e.target.value })} /></label>
              <label style={{ gridColumn: "1 / -1" }}><span className="as-lbl">Catatan</span><input className="as-in" value={formAset.catatan || ""} onChange={(e) => setFormAset({ ...formAset, catatan: e.target.value })} /></label>
            </div>
            {jatuhTempo(formAset) && <p style={{ margin: "10px 0 0", fontSize: "12.5px", color: "var(--ink-soft)" }}>Jatuh tempo peremajaan berikutnya: <b>{fmtTgl(jatuhTempo(formAset))}</b></p>}
            <datalist id="as-lantai">{LANTAI_USUL.map((l) => <option key={l} value={l} />)}</datalist>
            <datalist id="as-pemilik">{pemilikUsul.map((p) => <option key={p} value={p} />)}</datalist>
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              {formAset.id && !magang && <button type="button" className="sa-btn is-soft" style={{ color: "var(--red-600)" }} onClick={() => hapusAset(formAset)} disabled={menyimpan}>Hapus</button>}
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setFormAset(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={simpanAset} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODAL CATAT PEREMAJAAN ===================== */}
      <Modal open={!!formRawat} onClose={() => !menyimpan && setFormRawat(null)} maxWidth="600px">
        {formRawat && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>Catat peremajaan</h3>
            <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>{formRawat.a.kode} · {formRawat.a.nama}{formRawat.a.interval_bulan ? ` · rutin tiap ${formRawat.a.interval_bulan} bulan` : ""}</p>
            <div className="as-grid2">
              <label><span className="as-lbl">Tanggal *</span><input type="date" className="as-in" max={hari} value={formRawat.tanggal} onChange={(e) => setFormRawat({ ...formRawat, tanggal: e.target.value })} /></label>
              <label><span className="as-lbl">Jenis</span><select className="as-in" value={formRawat.jenis} onChange={(e) => setFormRawat({ ...formRawat, jenis: e.target.value })}>{JENIS_PEREMAJAAN.map((j) => <option key={j}>{j}</option>)}</select></label>
              <label style={{ gridColumn: "1 / -1" }}><span className="as-lbl">Uraian pekerjaan *</span><input className="as-in" value={formRawat.uraian} onChange={(e) => setFormRawat({ ...formRawat, uraian: e.target.value })} placeholder="Mis. cuci AC + isi freon R32" /></label>
              <label><span className="as-lbl">Vendor / teknisi</span><input className="as-in" value={formRawat.vendor} onChange={(e) => setFormRawat({ ...formRawat, vendor: e.target.value })} /></label>
              <label><span className="as-lbl">Biaya (Rp)</span><input className="as-in" inputMode="numeric" value={formRawat.biaya} onChange={(e) => setFormRawat({ ...formRawat, biaya: e.target.value })} /></label>
              {angka(formRawat.biaya) > 0 && (
                <label style={{ gridColumn: "1 / -1" }}><span className="as-lbl">Catat juga ke Anggaran (baris RAB {hari.slice(0, 4)})</span>
                  <select className="as-in" value={formRawat.item_id} onChange={(e) => setFormRawat({ ...formRawat, item_id: e.target.value })}>
                    <option value="">— Tidak dicatat ke anggaran —</option>
                    {rab.map((i) => <option key={i.id} value={i.id}>{i.jenis} · {i.kelompok} — {i.kode} {i.uraian}</option>)}
                  </select>
                </label>
              )}
            </div>
            {(formRawat.a.status === "Dalam perbaikan" || formRawat.a.status === "Rusak") && (
              <label style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px", fontSize: "13px" }}><input type="checkbox" checked={formRawat.aktifkan} onChange={(e) => setFormRawat({ ...formRawat, aktifkan: e.target.checked })} />Aset sudah berfungsi lagi → status Aktif</label>
            )}
            {formRawat.a.interval_bulan ? <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--muted)" }}>Jatuh tempo berikutnya menjadi {fmtTgl(jatuhTempo({ ...formRawat.a, peremajaan_terakhir: !formRawat.a.peremajaan_terakhir || formRawat.tanggal > formRawat.a.peremajaan_terakhir ? formRawat.tanggal : formRawat.a.peremajaan_terakhir }))}.</p> : null}
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setFormRawat(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={simpanRawat} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODAL RIWAYAT PEREMAJAAN ===================== */}
      <Modal open={!!lihatRiwayat} onClose={() => setLihatRiwayat(null)} maxWidth="640px">
        {lihatRiwayat && (() => {
          const a = aset.find((x) => x.id === lihatRiwayat.id) || lihatRiwayat;
          const r = [...(a.riwayat || [])].sort((x, y) => y.tanggal.localeCompare(x.tanggal));
          const total = r.reduce((s, x) => s + (x.biaya || 0), 0);
          return (
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>Riwayat peremajaan · {a.kode}</h3>
              <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>{a.nama} · {a.lokasi || "-"} · total biaya {rupiah(total)}{a.nilai_perolehan ? ` (${Math.round((total / a.nilai_perolehan) * 100)}% dari nilai perolehan)` : ""}</p>
              {a.nilai_perolehan && total > a.nilai_perolehan * 0.5 ? <div style={{ padding: "8px 12px", borderRadius: "10px", background: "var(--warn-50)", fontSize: "12.5px", marginBottom: "10px" }}>Biaya perawatan sudah lebih dari 50% nilai perolehan — pertimbangkan penggantian unit.</div> : null}
              {r.length === 0 ? <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)" }}>Belum ada riwayat.</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "55vh", overflowY: "auto" }}>
                  {r.map((x, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr) auto", gap: "10px", padding: "9px 12px", borderRadius: "12px", background: "var(--bg)", fontSize: "12.5px" }}>
                      <span style={{ color: "var(--muted)" }}>{fmtTgl(x.tanggal)}</span>
                      <div><b>{x.jenis}</b> — {x.uraian}<div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{x.vendor ? `${x.vendor} · ` : ""}dicatat {x.oleh}</div></div>
                      <b style={{ whiteSpace: "nowrap" }}>{x.biaya ? rupiah(x.biaya) : "—"}</b>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                <div style={{ flex: 1 }} />
                <button type="button" className="sa-btn is-primary" onClick={() => { setLihatRiwayat(null); setFormRawat({ a, tanggal: hari, jenis: "Servis rutin", uraian: "", vendor: "", biaya: "", item_id: "", aktifkan: a.status === "Dalam perbaikan" || a.status === "Rusak" }); }}>+ Catat peremajaan</button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ===================== MODAL IMPORT ASET ===================== */}
      <Modal open={!!impor} onClose={() => !menyimpan && setImpor(null)} maxWidth="760px">
        {impor && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>Pratinjau import · {impor.length} aset</h3>
            <p style={{ margin: "0 0 10px", fontSize: "12.5px", color: "var(--muted)" }}>Kode dibuat otomatis per kategori. Interval peremajaan kosong diisi usulan dari jenis aset.</p>
            <div style={{ maxHeight: "50vh", overflow: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
              <table className="as-tabel" style={{ minWidth: "640px" }}>
                <thead><tr><th>Nama</th><th>Kategori</th><th>Lokasi</th><th>Pemilik</th><th>Interval</th><th>Terakhir</th></tr></thead>
                <tbody>{impor.slice(0, 200).map((x, i) => <tr key={i}><td>{x.nama}<div style={{ fontSize: "11px", color: "var(--muted)" }}>{x.jenis}</div></td><td>{x.kategori}</td><td>{x.lokasi}</td><td>{x.pemilik}</td><td>{x.interval_bulan ? `${x.interval_bulan} bln` : "—"}</td><td>{fmtTgl(x.peremajaan_terakhir)}</td></tr>)}</tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setImpor(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={jalankanImpor} disabled={menyimpan}>{menyimpan ? "Mengimport..." : `Import ${impor.length} aset`}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODAL UPLOAD AS-BUILT ===================== */}
      <Modal open={!!unggah} onClose={() => !menyimpan && setUnggah(null)} maxWidth="900px">
        {unggah && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>Upload {unggah.length} gambar</h3>
            <p style={{ margin: "0 0 10px", fontSize: "12.5px", color: "var(--muted)" }}>
              <b style={{ color: "var(--warn)" }}>{unggah.filter((u) => cocokkan(u)).length} menggantikan sheet lama</b> · <b style={{ color: "var(--ok)" }}>{unggah.filter((u) => !cocokkan(u)).length} sheet baru</b>. Periksa nomor sheet — nomor yang sama dengan sheet lama berarti revisi. Maks {MAX_FILE_GAMBAR_MB} MB per file.
            </p>
            <div style={{ maxHeight: "48vh", overflow: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
              <table className="as-tabel" style={{ minWidth: "820px" }}>
                <thead><tr><th>File</th><th>No. sheet</th><th>Judul</th><th>Disiplin</th><th>Lantai</th><th>Hasil</th><th /></tr></thead>
                <tbody>
                  {unggah.map((u, i) => {
                    const lama = cocokkan(u);
                    const ubahU = (p: Partial<typeof u>) => setUnggah(unggah.map((x, j) => (j === i ? { ...x, ...p } : x)));
                    return (
                      <tr key={i}>
                        <td style={{ fontSize: "11.5px", maxWidth: "160px", wordBreak: "break-all" }}>{u.file.name}<div style={{ color: "var(--muted)" }}>{(u.file.size / 1048576).toFixed(1)} MB · {ekstensiGambar(u.file.name).toUpperCase()}</div></td>
                        <td><input className="as-in" style={{ width: "90px", padding: "5px 7px" }} value={u.nomor} onChange={(e) => ubahU({ nomor: e.target.value.toUpperCase() })} /></td>
                        <td><input className="as-in" style={{ padding: "5px 7px" }} value={u.judul} onChange={(e) => ubahU({ judul: e.target.value })} disabled={!!lama} /></td>
                        <td><select className="as-in" style={{ padding: "5px 7px" }} value={u.disiplin} onChange={(e) => ubahU({ disiplin: e.target.value })} disabled={!!lama}>{DISIPLIN_GAMBAR.map((d) => <option key={d}>{d}</option>)}</select></td>
                        <td><input className="as-in" list="as-lantai" style={{ width: "100px", padding: "5px 7px" }} value={u.lantai} onChange={(e) => ubahU({ lantai: e.target.value })} disabled={!!lama} /></td>
                        <td style={{ fontSize: "11.5px", fontWeight: 800, color: lama ? "var(--warn)" : "var(--ok)", whiteSpace: "nowrap" }}>{lama ? `Revisi ${(lama.revisi_aktif?.rev || 0) + 1} (ganti Rev ${lama.revisi_aktif?.rev || 0})` : "Sheet baru"}</td>
                        <td><button type="button" className="as-chip" style={{ padding: "3px 8px" }} onClick={() => setUnggah(unggah.filter((_, j) => j !== i))} aria-label="Buang file">×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <datalist id="as-lantai">{LANTAI_USUL.map((l) => <option key={l} value={l} />)}</datalist>
            <label style={{ display: "block", marginTop: "10px" }}><span className="as-lbl">Catatan perubahan {unggah.some((u) => cocokkan(u)) ? "*" : "(opsional)"}</span>
              <textarea className="as-in" style={{ minHeight: "60px" }} value={catatanSet} onChange={(e) => setCatatanSet(e.target.value)} placeholder="Mis. As-built setelah renovasi toilet Lt 2 & relokasi panel SDP-3 (Okt 2026)" />
            </label>
            {progres && <div style={{ marginTop: "8px", fontSize: "12.5px", color: "var(--info)", fontWeight: 700 }}>{progres}</div>}
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setUnggah(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={jalankanUnggah} disabled={menyimpan || !unggah.length}>{menyimpan ? "Mengunggah..." : `Simpan ${unggah.length} gambar`}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODAL RIWAYAT GAMBAR ===================== */}
      <Modal open={!!detailGambar && !banding} onClose={() => setDetailGambar(null)} maxWidth="680px">
        {detailGambar && (() => {
          const g = gambar.find((x) => x.id === detailGambar.id) || detailGambar;
          const semuaRev = [g.revisi_aktif, ...[...(g.riwayat || [])].sort((a, b) => b.rev - a.rev)];
          return (
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>{g.nomor_sheet ? `${g.nomor_sheet} · ` : ""}{g.judul}</h3>
              <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>{g.disiplin}{g.lantai ? ` · ${g.lantai}` : ""} · {semuaRev.length} revisi</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {semuaRev.map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) auto", gap: "10px", alignItems: "center", padding: "9px 12px", borderRadius: "12px", background: i === 0 ? "var(--ok-50)" : "var(--bg)", fontSize: "12.5px" }}>
                    <b>Rev {r.rev}{i === 0 ? " ✓" : ""}</b>
                    <div style={{ minWidth: 0 }}>{r.catatan}<div style={{ fontSize: "11px", color: "var(--muted)" }}>{fmtTgl(r.tanggal)} · {r.oleh} · {r.file_nama}</div></div>
                    <span style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="sa-btn is-soft" style={{ height: "28px", fontSize: "11.5px" }} onClick={() => bukaRevisi(r)}>{bisaPratinjau(r.file_nama) ? "Buka" : "Unduh"}</button>
                      {i > 0 && <> <button type="button" className="sa-btn is-soft" style={{ height: "28px", fontSize: "11.5px" }} onClick={() => mulaiBanding(r, g.revisi_aktif)}>Bandingkan</button></>}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                {!magang && <button type="button" className="sa-btn is-soft" style={{ color: "var(--red-600)" }} onClick={() => hapusGambar(g)}>Hapus sheet</button>}
                <div style={{ flex: 1 }} />
                <button type="button" className="sa-btn is-soft" onClick={() => setDetailGambar(null)}>Tutup</button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ===================== BANDINGKAN ===================== */}
      <Modal open={!!banding} onClose={tutupBanding} maxWidth="1200px">
        {banding && (() => {
          const gambarSaja = ekstensiGambar(banding.a.file_nama) !== "pdf" && ekstensiGambar(banding.b.file_nama) !== "pdf";
          return (
            <div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "10px" }}>
                <h3 style={{ margin: 0, fontSize: "17px", color: "var(--ink)" }}>Rev {banding.a.rev} (lama) vs Rev {banding.b.rev} (berlaku)</h3>
                <div style={{ flex: 1 }} />
                {gambarSaja && <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px" }}>Tumpuk: lama<input type="range" min={0} max={100} value={banding.tumpuk} onChange={(e) => setBanding({ ...banding, tumpuk: Number(e.target.value) })} />baru</label>}
                <button type="button" className="sa-btn is-soft" onClick={tutupBanding}>Tutup</button>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: "12.5px", color: "var(--ink-soft)" }}>Perubahan: {banding.b.catatan}</p>
              {gambarSaja ? (
                <div style={{ position: "relative", width: "100%", background: "#fff", borderRadius: "12px", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={banding.urlA} alt={`Rev ${banding.a.rev}`} style={{ width: "100%", display: "block", opacity: 1 - banding.tumpuk / 100 }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={banding.urlB} alt={`Rev ${banding.b.rev}`} style={{ position: "absolute", inset: 0, width: "100%", opacity: banding.tumpuk / 100, mixBlendMode: "multiply" }} />
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {[banding.a, banding.b].map((r, i) => (
                    <div key={i}>
                      <div style={{ fontSize: "12px", fontWeight: 800, marginBottom: "4px" }}>Rev {r.rev} · {fmtTgl(r.tanggal)}</div>
                      <iframe src={i === 0 ? banding.urlA : banding.urlB} title={`Rev ${r.rev}`} style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: "10px", background: "#fff" }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </AdminShell>
  );
}
