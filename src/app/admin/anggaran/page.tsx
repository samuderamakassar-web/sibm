"use client";

/**
 * Anggaran & Realisasi -- format RAB (§106, menggantikan pagu per kategori §89).
 * Data RAB per tahun di anggaran_rab/{tahun}: items[] { jenis CAPEX|OPEX|PL, kelompok (MEP, Sipil, General Affairs, ...),
 * kode, uraian, qty, uom, harga, q[4] rencana kuartal, deskripsi/risiko/usulan (dasar pengajuan) } + peta_otomatis.
 * Realisasi = realisasi_biaya (manual, item_id -> baris RAB) + otomatis:
 *   - helpdesk_tickets Selesai dgn biaya (waktu_selesai di tahun itu)
 *   - kendaraan_service_logs (biaya teks bebas, diambil angkanya)
 *   - ga_atk_requests "Selesai / Diambil" x harga master_atk per satuan (§103)
 * Sumber otomatis dialokasikan ke 1 baris RAB lewat peta_otomatis (diatur di tab Realisasi).
 * Import: template SIBM ATAU file RAB lama (kolom No/Uraian|Description, Qty|Jumlah, UoM, Unit Price; baris "A  MEP" = kelompok).
 */

import { useEffect, useState, type ChangeEvent } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import Modal from "../../../components/ui/Modal";
import { daerahTulis } from "../../../lib/daerah";

type Jenis = "CAPEX" | "OPEX" | "PL";
const JENIS: Jenis[] = ["CAPEX", "OPEX", "PL"];
const LABEL_JENIS: Record<Jenis, string> = { CAPEX: "CAPEX · Investasi", OPEX: "OPEX · Operasional", PL: "PL" };
const WARNA_JENIS: Record<Jenis, string> = { CAPEX: "var(--info)", OPEX: "var(--warn)", PL: "var(--accent)" };
const UOM_UMUM = ["unit", "pcs", "set", "ls", "lumpsum", "bulan", "tahun", "kali", "orang", "m2", "liter", "kaleng", "box", "pack", "roll", "kg"];
const Q_LABEL = ["Q1", "Q2", "Q3", "Q4"];

interface ItemRab {
  id: string; jenis: Jenis; kelompok: string; kode: string; uraian: string;
  qty: number; uom: string; harga: number; q: boolean[];
  deskripsi?: string; risiko?: string; usulan?: string;
}
interface PetaOtomatis { helpdesk?: string; servis?: string; atk?: string }
type Sumber = "manual" | "helpdesk" | "servis" | "atk";
interface Realisasi { id: string; sumber: Sumber; item_id?: string; tanggal: string; uraian: string; jumlah: number; kategori?: string }
interface HasilImport { sheet: string; jenis: Jenis; items: ItemRab[] }

const rupiah = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));
const ringkas = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(Math.round(n)));
const angka = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d]/g, "")) || 0);
const idBaru = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const amount = (i: ItemRab) => (i.qty || 0) * (i.harga || 0);
const persen = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const warnaSerapan = (p: number) => (p > 100 ? "var(--red-600)" : p >= 80 ? "var(--warn)" : "var(--ok)");
const ITEM_KOSONG: ItemRab = { id: "", jenis: "OPEX", kelompok: "", kode: "", uraian: "", qty: 1, uom: "unit", harga: 0, q: [false, false, false, false] };

/** Rencana per kuartal: amount dibagi rata ke kuartal yang dicentang (tanpa centang = rata 4 kuartal). */
function rencanaKuartal(i: ItemRab): number[] {
  const dipilih = i.q.filter(Boolean).length;
  return [0, 1, 2, 3].map((k) => (dipilih ? (i.q[k] ? amount(i) / dipilih : 0) : amount(i) / 4));
}

/** Parser Excel toleran: template SIBM & format RAB lama (lihat komentar atas). */
function parseWorkbook(wb: XLSX.WorkBook): HasilImport[] {
  const hasil: HasilImport[] = [];
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: "" });
    const teks = (v: unknown) => String(v ?? "").trim();
    const hIdx = rows.findIndex((r) => {
      const s = r.map((c) => teks(c).toLowerCase());
      return s.some((c) => c === "uom" || c === "satuan") && s.some((c) => c.includes("price") || c.includes("harga"));
    });
    if (hIdx < 0) continue;
    const head = rows[hIdx].map((c) => teks(c).toLowerCase());
    const kol = (uji: (c: string) => boolean) => head.findIndex(uji);
    const cNo = kol((c) => c === "no" || c === "kode");
    const cUraian = kol((c) => c.includes("uraian") || c.includes("description") || c === "item");
    const cQty = kol((c) => c === "qty" || c === "quantity" || c === "jumlah");
    const cUom = kol((c) => c === "uom" || c === "satuan");
    const cHarga = kol((c) => c.includes("unit price") || c.includes("harga"));
    const cJenis = kol((c) => c === "jenis");
    const cKelompok = kol((c) => c === "kelompok");
    const cDasar = kol((c) => c.includes("dasar"));
    const cDesk = kol((c) => c === "deskripsi"), cRisiko = kol((c) => c === "risiko"), cUsulan = kol((c) => c === "usulan");
    const cQ = [0, 1, 2, 3].map((k) => kol((c) => c === `q${k + 1}`));
    if (cUraian < 0 || cHarga < 0) continue;
    const jenisSheet: Jenis = /capex/i.test(sheet) ? "CAPEX" : /(^|\W)(pl|p&l)(\W|$)/i.test(sheet) ? "PL" : "OPEX";
    let kelompok = sheet;
    let huruf = "";
    let urut = 0;
    const items: ItemRab[] = [];
    for (const r of rows.slice(hIdx + 1)) {
      const no = cNo >= 0 ? teks(r[cNo]) : "";
      const ur = teks(r[cUraian]);
      if (!ur || /^total/i.test(ur) || r.some((c) => /^total\b/i.test(teks(c)))) continue;
      const qty = cQty >= 0 ? angka(r[cQty]) : 0;
      const harga = angka(r[cHarga]);
      if (/^[A-Z]$/.test(no) && !qty && !harga) { kelompok = ur; huruf = no; urut = 0; continue; }
      if (!no && !qty && !harga && ur === ur.toUpperCase() && ur.length < 40) { kelompok = ur; continue; }
      urut++;
      const dasar = cDasar >= 0 ? teks(r[cDasar]) : "";
      const ambilDasar = (label: string) => (dasar.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=(Deskripsi|Risiko|Usulan)\\s*:|$)`, "i"))?.[1] || "").trim();
      const jenisBaris = cJenis >= 0 ? teks(r[cJenis]).toUpperCase() : "";
      items.push({
        id: idBaru(),
        jenis: (JENIS as string[]).includes(jenisBaris) ? (jenisBaris as Jenis) : jenisSheet,
        kelompok: (cKelompok >= 0 && teks(r[cKelompok])) || kelompok,
        kode: no || `${huruf}${urut}`,
        uraian: ur, qty, uom: cUom >= 0 ? teks(r[cUom]) : "", harga,
        q: cQ.map((c) => c >= 0 && !!teks(r[c])),
        deskripsi: cDesk >= 0 ? teks(r[cDesk]) : ambilDasar("Deskripsi"),
        risiko: cRisiko >= 0 ? teks(r[cRisiko]) : ambilDasar("Risiko"),
        usulan: cUsulan >= 0 ? teks(r[cUsulan]) : ambilDasar("Usulan"),
      });
    }
    if (items.length) hasil.push({ sheet, jenis: jenisSheet, items });
  }
  return hasil;
}

function Kpi({ label, nilai, sub, warna }: { label: string; nilai: string; sub: string; warna?: string }) {
  return (
    <Tile compact>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: "21px", fontWeight: 800, color: warna || "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{nilai}</div>
      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{sub}</div>
    </Tile>
  );
}

function Bar({ nilai, maks, warna, tinggi = 8 }: { nilai: number; maks: number; warna: string; tinggi?: number }) {
  return (
    <div style={{ height: tinggi, borderRadius: tinggi / 2, background: "var(--line)", overflow: "hidden" }}>
      <div style={{ width: `${maks > 0 ? Math.min(100, (nilai / maks) * 100) : 0}%`, height: "100%", background: warna }} />
    </div>
  );
}

export default function AnggaranPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const tahunIni = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()).slice(0, 4));
  const [tahun, setTahun] = useState(tahunIni);
  const [tab, setTab] = useState<"RINGKASAN" | "RAB" | "REALISASI">("RINGKASAN");
  const [items, setItems] = useState<ItemRab[]>([]);
  const [peta, setPeta] = useState<PetaOtomatis>({});
  const [lokasi, setLokasi] = useState("");
  const [manual, setManual] = useState<Realisasi[]>([]);
  const [otomatis, setOtomatis] = useState<Realisasi[] | null>(null);
  const [filterJenis, setFilterJenis] = useState<Jenis | "SEMUA">("SEMUA");
  const [cari, setCari] = useState("");
  const [formItem, setFormItem] = useState<ItemRab | null>(null);
  const [impor, setImpor] = useState<HasilImport[] | null>(null);
  const [modeImpor, setModeImpor] = useState<"GANTI" | "TAMBAH">("GANTI");
  const [menyimpan, setMenyimpan] = useState(false);
  const [formReal, setFormReal] = useState({ tanggal: "", item_id: "", uraian: "", jumlah: "" });

  const awal = `${tahun}-01-01`;
  const akhir = `${tahun + 1}-01-01`;

  useEffect(() => {
    if (!isReady) return;
    const u1 = onSnapshot(doc(db, "anggaran_rab", String(tahun)), (s) => {
      const d = s.data();
      setItems(Array.isArray(d?.items) ? (d!.items as ItemRab[]) : []);
      setPeta((d?.peta_otomatis as PetaOtomatis) || {});
      setLokasi((d?.lokasi as string) || "");
    }, (e) => console.error("[anggaran] rab:", e));
    const u2 = onSnapshot(query(collection(db, "realisasi_biaya"), where("tanggal", ">=", awal), where("tanggal", "<", akhir)), (s) => {
      setManual(s.docs.map((d) => ({ id: d.id, sumber: "manual" as const, ...(d.data() as Omit<Realisasi, "id" | "sumber">) })));
    }, (e) => console.error("[anggaran] realisasi:", e));
    let batal = false;
    (async () => {
      const hasil: Realisasi[] = [];
      const tgl = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(d);
      const tsAwal = Timestamp.fromDate(new Date(`${awal}T00:00:00+08:00`));
      const tsAkhir = Timestamp.fromDate(new Date(`${akhir}T00:00:00+08:00`));
      try {
        const t = await getDocs(query(collection(db, "helpdesk_tickets"), where("waktu_selesai", ">=", tsAwal), where("waktu_selesai", "<", tsAkhir)));
        t.docs.forEach((d) => {
          const x = d.data();
          if (!(x.biaya > 0) || x.status !== "Selesai") return;
          hasil.push({ id: `hd-${d.id}`, sumber: "helpdesk", tanggal: tgl(x.waktu_selesai.toDate()), uraian: `${x.lokasi || "-"}: ${x.deskripsi || ""}`.slice(0, 140), jumlah: x.biaya });
        });
      } catch (e) { console.error("[anggaran] helpdesk:", e); }
      try {
        const s = await getDocs(query(collection(db, "kendaraan_service_logs"), where("tanggal", ">=", awal), where("tanggal", "<", akhir)));
        s.docs.forEach((d) => {
          const x = d.data();
          const n = angka(x.biaya);
          if (!n) return;
          hasil.push({ id: `sv-${d.id}`, sumber: "servis", tanggal: x.tanggal, uraian: `${String(x.kendaraan || "").split(" - ")[0]}: ${x.jenis_service || "Servis"}`, jumlah: n });
        });
      } catch (e) { console.error("[anggaran] servis:", e); }
      try {
        const [mst, req] = await Promise.all([
          getDocs(collection(db, "master_atk")),
          getDocs(query(collection(db, "ga_atk_requests"), where("waktu_request", ">=", tsAwal), where("waktu_request", "<", tsAkhir))),
        ]);
        const harga = new Map(mst.docs.map((d) => [d.data().nama_barang as string, (d.data().harga || {}) as Record<string, number>]));
        const satuanDefault = new Map(mst.docs.map((d) => [d.data().nama_barang as string, ((d.data().satuan as string[]) || ["PCS"])[0]]));
        req.docs.forEach((d) => {
          const x = d.data();
          if (x.status !== "Selesai / Diambil" || !x.waktu_request) return;
          let total = 0;
          for (const it of (x.items || []) as { nama_barang: string; jumlah: string; satuan?: string }[]) {
            const h = harga.get(it.nama_barang)?.[it.satuan || satuanDefault.get(it.nama_barang) || "PCS"];
            if (h) total += h * (parseInt(it.jumlah, 10) || 0);
          }
          if (total > 0) hasil.push({ id: `atk-${d.id}`, sumber: "atk", tanggal: tgl(x.waktu_request.toDate()), uraian: `ATK ${x.resi || ""} · ${x.departemen || "-"}`, jumlah: total });
        });
      } catch (e) { console.error("[anggaran] atk:", e); }
      if (!batal) setOtomatis(hasil);
    })();
    return () => { batal = true; u1(); u2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, tahun]);

  if (!isReady) return null;

  // ---------- turunan ----------
  const itemPerId = new Map(items.map((i) => [i.id, i]));
  const semuaReal: Realisasi[] = [
    ...manual,
    ...(otomatis || []).map((r) => ({ ...r, item_id: peta[r.sumber as keyof PetaOtomatis] })),
  ].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  const realPerItem = new Map<string, number>();
  semuaReal.forEach((r) => { if (r.item_id && itemPerId.has(r.item_id)) realPerItem.set(r.item_id, (realPerItem.get(r.item_id) || 0) + r.jumlah); });
  const belumAlokasi = semuaReal.filter((r) => !r.item_id || !itemPerId.has(r.item_id));
  const totalRencana = items.reduce((a, i) => a + amount(i), 0);
  const totalReal = semuaReal.reduce((a, r) => a + r.jumlah, 0);
  const totalRealTeralokasi = semuaReal.filter((r) => r.item_id && itemPerId.has(r.item_id)).reduce((a, r) => a + r.jumlah, 0);
  const kuartalIni = tahun === tahunIni ? Math.floor((Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()).slice(5, 7)) - 1) / 3) : 3;
  const rencanaQ = [0, 1, 2, 3].map((k) => items.reduce((a, i) => a + rencanaKuartal(i)[k], 0));
  const realQ = [0, 1, 2, 3].map((k) => semuaReal.filter((r) => Math.floor((Number(r.tanggal.slice(5, 7)) - 1) / 3) === k).reduce((a, r) => a + r.jumlah, 0));
  const maksQ = Math.max(1, ...rencanaQ, ...realQ);
  const kelompokDari = (j: Jenis) => Array.from(new Set(items.filter((i) => i.jenis === j).map((i) => i.kelompok || "Lainnya")));
  const sumKelompok = (j: Jenis, k: string) => {
    const isi = items.filter((i) => i.jenis === j && (i.kelompok || "Lainnya") === k);
    return { rencana: isi.reduce((a, i) => a + amount(i), 0), real: isi.reduce((a, i) => a + (realPerItem.get(i.id) || 0), 0), isi };
  };
  const sumJenis = (j: Jenis) => {
    const isi = items.filter((i) => i.jenis === j);
    return { rencana: isi.reduce((a, i) => a + amount(i), 0), real: isi.reduce((a, i) => a + (realPerItem.get(i.id) || 0), 0) };
  };
  const melebihi = items.filter((i) => (realPerItem.get(i.id) || 0) > amount(i) && amount(i) > 0);
  const labelItem = (id?: string) => { const i = id ? itemPerId.get(id) : undefined; return i ? `${i.kode} · ${i.uraian}` : "Belum dialokasikan"; };

  // ---------- simpan ----------
  const simpanRab = async (baru: ItemRab[], petaBaru: PetaOtomatis = peta, pesan = "RAB tersimpan.") => {
    setMenyimpan(true);
    try {
      await setDoc(doc(db, "anggaran_rab", String(tahun)), {
        tahun, lokasi, items: baru.map((i) => ({ ...i, qty: Number(i.qty) || 0, harga: Number(i.harga) || 0 })), peta_otomatis: petaBaru,
        daerah: daerahTulis(), diperbarui_oleh: session?.nama || "-", diperbarui_pada: serverTimestamp(),
      });
      showToast(pesan, "success");
      return true;
    } catch (e) { console.error(e); showToast("Gagal menyimpan RAB.", "error"); return false; }
    finally { setMenyimpan(false); }
  };
  const simpanItem = async () => {
    if (!formItem) return;
    if (!formItem.uraian.trim() || !formItem.kelompok.trim()) return showToast("Isi kelompok & uraian.", "warning");
    const it = { ...formItem, uraian: formItem.uraian.trim(), kelompok: formItem.kelompok.trim(), kode: formItem.kode.trim() };
    const baru = it.id ? items.map((x) => (x.id === it.id ? it : x)) : [...items, { ...it, id: idBaru() }];
    if (await simpanRab(baru)) setFormItem(null);
  };
  const hapusItem = async (it: ItemRab) => {
    if (!(await confirm({ title: "Hapus baris RAB", message: `Hapus "${it.kode} ${it.uraian}"? Realisasi yang terhubung jadi "belum dialokasikan".`, confirmText: "Hapus", variant: "danger" }))) return;
    if (await simpanRab(items.filter((x) => x.id !== it.id))) setFormItem(null);
  };
  const pilihFileImpor = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    f.arrayBuffer().then((buf) => {
      const hasil = parseWorkbook(XLSX.read(buf, { type: "array" }));
      if (!hasil.length) return showToast("Tidak ada tabel RAB yang dikenali (butuh kolom Uraian/Description, UoM & Unit Price/Harga).", "warning");
      setImpor(hasil);
      setModeImpor(items.length ? "TAMBAH" : "GANTI");
    }).catch((err) => { console.error(err); showToast("File tidak bisa dibaca.", "error"); });
  };
  const jalankanImpor = async () => {
    if (!impor) return;
    const masuk = impor.flatMap((h) => h.items.map((i) => ({ ...i, jenis: h.jenis === i.jenis ? h.jenis : i.jenis })));
    if (await simpanRab(modeImpor === "GANTI" ? masuk : [...items, ...masuk], peta, `${masuk.length} baris RAB diimport.`)) setImpor(null);
  };
  const unduhTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Jenis", "Kelompok", "Kode", "Uraian", "Qty", "UoM", "Harga Satuan", "Q1", "Q2", "Q3", "Q4", "Deskripsi", "Risiko", "Usulan"],
      ["CAPEX", "MEP", "A1", "AC Split Daikin 2PK", 5, "unit", 15000000, "x", "", "", "", "Peremajaan unit AC > 10 tahun", "Biaya perawatan tinggi", "Ganti unit baru"],
      ["OPEX", "General Affairs", "A7", "Pest control", 12, "bulan", 3000000, "x", "x", "x", "x", "", "", ""],
    ]);
    ws["!cols"] = [8, 18, 6, 40, 6, 8, 14, 4, 4, 4, 4, 30, 30, 30].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RAB");
    XLSX.writeFile(wb, "Template_RAB_SIBM.xlsx");
  };
  const eksporExcel = () => {
    const baris = items.map((i) => [i.jenis, i.kelompok, i.kode, i.uraian, i.qty, i.uom, i.harga, amount(i), ...i.q.map((b) => (b ? "x" : "")), realPerItem.get(i.id) || 0, persen(realPerItem.get(i.id) || 0, amount(i)) + "%", i.deskripsi || "", i.risiko || "", i.usulan || ""]);
    const ws = XLSX.utils.aoa_to_sheet([["Jenis", "Kelompok", "Kode", "Uraian", "Qty", "UoM", "Harga Satuan", "Amount", "Q1", "Q2", "Q3", "Q4", "Realisasi", "Serapan", "Deskripsi", "Risiko", "Usulan"], ...baris]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `RAB ${tahun}`);
    XLSX.writeFile(wb, `RAB_Realisasi_${tahun}.xlsx`);
  };
  const tambahRealisasi = async () => {
    const jumlah = angka(formReal.jumlah);
    if (!formReal.tanggal || !formReal.item_id || !formReal.uraian.trim() || !jumlah) return showToast("Isi tanggal, baris RAB, uraian & jumlah.", "warning");
    try {
      await addDoc(collection(db, "realisasi_biaya"), { daerah: daerahTulis(), tanggal: formReal.tanggal, item_id: formReal.item_id, kategori: itemPerId.get(formReal.item_id)?.kelompok || "", uraian: formReal.uraian.trim(), jumlah, dicatat_oleh: session?.nama || "-", dibuat_pada: serverTimestamp() });
      setFormReal((f) => ({ ...f, uraian: "", jumlah: "" }));
      showToast("Realisasi dicatat.", "success");
    } catch (e) { console.error(e); showToast("Gagal mencatat realisasi.", "error"); }
  };
  const alokasikan = async (r: Realisasi, itemId: string) => {
    if (r.sumber !== "manual") return;
    await updateDoc(doc(db, "realisasi_biaya", r.id), { item_id: itemId }).catch(() => showToast("Gagal mengalokasikan.", "error"));
  };
  const hapusRealisasi = async (r: Realisasi) => {
    if (!(await confirm({ title: "Hapus realisasi", message: `Hapus "${r.uraian}" (${rupiah(r.jumlah)})?`, confirmText: "Hapus", variant: "danger" }))) return;
    await deleteDoc(doc(db, "realisasi_biaya", r.id)).catch(() => showToast("Gagal menghapus.", "error"));
  };

  const pilihItemOptions = JENIS.map((j) => (
    <optgroup key={j} label={LABEL_JENIS[j]}>
      {items.filter((i) => i.jenis === j).map((i) => <option key={i.id} value={i.id}>{i.kelompok} — {i.kode} {i.uraian}</option>)}
    </optgroup>
  ));
  const itemTampil = items.filter((i) => (filterJenis === "SEMUA" || i.jenis === filterJenis) && (!cari.trim() || `${i.kode} ${i.uraian} ${i.kelompok}`.toLowerCase().includes(cari.toLowerCase())));

  return (
    <AdminShell title="Anggaran & Realisasi" subtitle="RAB (CAPEX / OPEX / PL) vs biaya aktual — otomatis dari Helpdesk, servis kendaraan & ATK" userName={session?.nama || "Admin"}
      actions={<select className="sa-field" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} aria-label="Tahun anggaran">{[tahunIni + 1, tahunIni, tahunIni - 1, tahunIni - 2].map((t) => <option key={t} value={t}>{t}</option>)}</select>}>
      <style dangerouslySetInnerHTML={{ __html: `
        .rab-tabel { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 980px; }
        .rab-tabel th { text-align: left; padding: 9px 10px; background: var(--bg); color: var(--ink-soft); font-size: 11.5px; font-weight: 800; border-bottom: 1px solid var(--line); white-space: nowrap; position: sticky; top: 0; }
        .rab-tabel td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
        .rab-tabel .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .rab-jenis td { background: var(--ink); color: var(--surface); font-weight: 800; font-size: 13px; }
        .rab-kel td { background: var(--bg); font-weight: 800; color: var(--ink); }
        .rab-item:hover td { background: var(--bg); cursor: pointer; }
        .rab-q { display: inline-block; width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--line); }
        .rab-chip { border: 1px solid var(--line); background: var(--bg); color: var(--ink-soft); border-radius: 999px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .rab-chip.is-on { background: var(--ink); color: var(--surface); border-color: transparent; }
        .rab-in { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 13px; font-family: inherit; box-sizing: border-box; min-width: 0; }
        .rab-lbl { display: block; font-size: 11.5px; font-weight: 800; color: var(--ink-soft); margin-bottom: 4px; }
      ` }} />

      <div className="sa-tabs" role="tablist" aria-label="Tampilan anggaran" style={{ width: "fit-content", maxWidth: "100%", marginBottom: "16px" }}>
        {([["RINGKASAN", "Ringkasan"], ["RAB", `RAB (${items.length})`], ["REALISASI", `Realisasi (${semuaReal.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sa-tab${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px", marginBottom: "16px" }}>
        <Kpi label="Total RAB" nilai={rupiah(totalRencana)} sub={`${items.length} baris · ${tahun}${lokasi ? ` · ${lokasi}` : ""}`} />
        <Kpi label="Realisasi" nilai={rupiah(totalReal)} sub={otomatis === null ? "memuat..." : `${semuaReal.length} transaksi`} />
        <Kpi label="Serapan" nilai={totalRencana ? `${persen(totalRealTeralokasi, totalRencana)}%` : "—"} sub={`target s.d. Q${kuartalIni + 1}: ${persen(rencanaQ.slice(0, kuartalIni + 1).reduce((a, b) => a + b, 0), totalRencana)}%`} warna={warnaSerapan(persen(totalRealTeralokasi, totalRencana))} />
        <Kpi label="Sisa anggaran" nilai={rupiah(Math.max(0, totalRencana - totalRealTeralokasi))} sub={belumAlokasi.length ? `${belumAlokasi.length} realisasi belum dialokasikan` : "semua realisasi teralokasi"} warna={belumAlokasi.length ? "var(--warn)" : "var(--ok)"} />
      </div>

      {items.length === 0 && tab !== "REALISASI" && (
        <Tile style={{ marginBottom: "16px" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 800 }}>Belum ada RAB {tahun}</h2>
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--muted)" }}>Import file RAB Excel yang sudah ada (CAPEX, OPEX Engineering/GA/HSE/Training/Perdin, PL — tiap sheet otomatis dikenali), atau isi baris satu per satu.</p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <label className="sa-btn is-primary" style={{ cursor: "pointer" }}>Import Excel<input type="file" accept=".xlsx,.xls" onChange={pilihFileImpor} style={{ display: "none" }} /></label>
            <button type="button" className="sa-btn is-soft" onClick={() => setFormItem({ ...ITEM_KOSONG })}>+ Tambah baris</button>
            <button type="button" className="sa-btn is-soft" onClick={unduhTemplate}>Unduh template</button>
          </div>
        </Tile>
      )}

      {/* ===================== RINGKASAN ===================== */}
      {tab === "RINGKASAN" && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))", gap: "16px", alignItems: "start" }}>
          <Tile>
            <h2 style={{ margin: "0 0 12px", fontSize: "16px", fontWeight: 800 }}>Rencana vs realisasi per kelompok</h2>
            {JENIS.filter((j) => sumJenis(j).rencana > 0).map((j) => {
              const sj = sumJenis(j);
              return (
                <div key={j} style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px", fontWeight: 800, color: WARNA_JENIS[j] }}>
                    <span>{LABEL_JENIS[j]}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{ringkas(sj.real)} / {ringkas(sj.rencana)} · {persen(sj.real, sj.rencana)}%</span>
                  </div>
                  <div style={{ margin: "4px 0 8px" }}><Bar nilai={sj.real} maks={sj.rencana} warna={WARNA_JENIS[j]} tinggi={10} /></div>
                  {kelompokDari(j).map((k) => {
                    const sk = sumKelompok(j, k);
                    const p = persen(sk.real, sk.rencana);
                    return (
                      <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 44px", gap: "8px", alignItems: "center", fontSize: "12.5px", padding: "3px 0 3px 10px" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>{k}</div>
                          <Bar nilai={sk.real} maks={sk.rencana} warna={warnaSerapan(p)} tinggi={5} />
                        </div>
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-soft)" }}>{ringkas(sk.real)} / {ringkas(sk.rencana)}</span>
                        <b style={{ textAlign: "right", color: warnaSerapan(p) }}>{p}%</b>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </Tile>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Tile>
              <h2 style={{ margin: "0 0 12px", fontSize: "16px", fontWeight: 800 }}>Rencana vs realisasi per kuartal</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", alignItems: "end", height: "150px" }}>
                {[0, 1, 2, 3].map((k) => (
                  <div key={k} style={{ display: "flex", gap: "4px", alignItems: "end", height: "100%", opacity: k > kuartalIni ? 0.5 : 1 }}>
                    <div title={`Rencana ${Q_LABEL[k]}: ${rupiah(rencanaQ[k])}`} style={{ flex: 1, height: `${Math.max(2, (rencanaQ[k] / maksQ) * 100)}%`, background: "var(--line)", borderRadius: "6px 6px 2px 2px" }} />
                    <div title={`Realisasi ${Q_LABEL[k]}: ${rupiah(realQ[k])}`} style={{ flex: 1, height: `${Math.max(2, (realQ[k] / maksQ) * 100)}%`, background: realQ[k] > rencanaQ[k] ? "var(--red-600)" : "var(--info-solid)", borderRadius: "6px 6px 2px 2px" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginTop: "6px", fontSize: "11.5px", textAlign: "center", color: "var(--muted)" }}>
                {[0, 1, 2, 3].map((k) => <div key={k}><b style={{ color: "var(--ink)" }}>{Q_LABEL[k]}</b><br />{ringkas(realQ[k])} / {ringkas(rencanaQ[k])}</div>)}
              </div>
              <p style={{ margin: "10px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Abu = rencana (dari centang Q1–Q4 tiap baris RAB), biru = realisasi, merah = melebihi rencana kuartal.</p>
            </Tile>
            <Tile>
              <h2 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: 800 }}>Perlu perhatian</h2>
              {melebihi.length === 0 && belumAlokasi.length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--ok)", fontWeight: 700 }}>Tidak ada baris yang melebihi anggaran.</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px" }}>
                  {melebihi.map((i) => <div key={i.id} style={{ color: "var(--red-600)" }}><b>{i.kode} {i.uraian}</b> — realisasi {rupiah(realPerItem.get(i.id) || 0)} &gt; RAB {rupiah(amount(i))}</div>)}
                  {belumAlokasi.length > 0 && <button type="button" className="sa-btn is-soft" style={{ alignSelf: "flex-start" }} onClick={() => setTab("REALISASI")}>{belumAlokasi.length} realisasi ({rupiah(belumAlokasi.reduce((a, r) => a + r.jumlah, 0))}) belum dialokasikan →</button>}
                </div>
              )}
            </Tile>
          </div>
        </div>
      )}

      {/* ===================== RAB ===================== */}
      {tab === "RAB" && items.length > 0 && (
        <Tile>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(["SEMUA", ...JENIS] as const).map((j) => (
                <button key={j} type="button" className={`rab-chip${filterJenis === j ? " is-on" : ""}`} onClick={() => setFilterJenis(j)}>{j === "SEMUA" ? "Semua" : j}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <input className="rab-in" style={{ width: "200px" }} placeholder="Cari uraian / kode..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari baris RAB" />
              <button type="button" className="sa-btn is-primary" onClick={() => setFormItem({ ...ITEM_KOSONG, jenis: filterJenis === "SEMUA" ? "OPEX" : filterJenis })}>+ Baris</button>
              <label className="sa-btn is-soft" style={{ cursor: "pointer" }}>Import<input type="file" accept=".xlsx,.xls" onChange={pilihFileImpor} style={{ display: "none" }} /></label>
              <button type="button" className="sa-btn is-soft" onClick={eksporExcel}>Export</button>
              <button type="button" className="sa-btn is-soft" onClick={unduhTemplate}>Template</button>
            </div>
          </div>
          <input className="rab-in" style={{ marginBottom: "10px", maxWidth: "360px" }} placeholder="Lokasi / nama project RAB, mis. Makassar - Sulawesi" value={lokasi} onChange={(e) => setLokasi(e.target.value)} onBlur={() => simpanRab(items, peta, "Lokasi tersimpan.")} aria-label="Lokasi RAB" />
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "12px", maxHeight: "70vh" }}>
            <table className="rab-tabel">
              <thead>
                <tr><th>Kode</th><th>Uraian</th><th className="num">Qty</th><th>UoM</th><th className="num">Harga Satuan</th><th className="num">Amount</th>{Q_LABEL.map((q) => <th key={q} style={{ textAlign: "center" }}>{q}</th>)}<th className="num">Realisasi</th><th className="num">%</th></tr>
              </thead>
              <tbody>
                {JENIS.filter((j) => itemTampil.some((i) => i.jenis === j)).flatMap((j) => {
                  const sj = sumJenis(j);
                  return [
                    <tr key={`j-${j}`} className="rab-jenis"><td colSpan={5}>{LABEL_JENIS[j]}</td><td className="num">{rupiah(sj.rencana)}</td><td colSpan={4} /><td className="num">{rupiah(sj.real)}</td><td className="num">{persen(sj.real, sj.rencana)}%</td></tr>,
                    ...kelompokDari(j).filter((k) => itemTampil.some((i) => i.jenis === j && (i.kelompok || "Lainnya") === k)).flatMap((k) => {
                      const sk = sumKelompok(j, k);
                      return [
                        <tr key={`k-${j}-${k}`} className="rab-kel"><td colSpan={5}>{k}</td><td className="num">{rupiah(sk.rencana)}</td><td colSpan={4} /><td className="num">{rupiah(sk.real)}</td><td className="num" style={{ color: warnaSerapan(persen(sk.real, sk.rencana)) }}>{persen(sk.real, sk.rencana)}%</td></tr>,
                        ...itemTampil.filter((i) => i.jenis === j && (i.kelompok || "Lainnya") === k).map((i) => {
                          const real = realPerItem.get(i.id) || 0;
                          const p = persen(real, amount(i));
                          return (
                            <tr key={i.id} className="rab-item" onClick={() => setFormItem({ ...i, q: [...(i.q || [false, false, false, false])] })} title="Klik untuk edit">
                              <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{i.kode}</td>
                              <td style={{ minWidth: "240px" }}>
                                <div style={{ fontWeight: 700, color: "var(--ink)" }}>{i.uraian}</div>
                                {(i.deskripsi || i.usulan) && <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{[i.deskripsi, i.usulan && `Usulan: ${i.usulan}`].filter(Boolean).join(" · ")}</div>}
                              </td>
                              <td className="num">{i.qty || "-"}</td>
                              <td>{i.uom}</td>
                              <td className="num">{i.harga ? new Intl.NumberFormat("id-ID").format(i.harga) : "-"}</td>
                              <td className="num" style={{ fontWeight: 700 }}>{amount(i) ? new Intl.NumberFormat("id-ID").format(amount(i)) : "-"}</td>
                              {[0, 1, 2, 3].map((k2) => <td key={k2} style={{ textAlign: "center" }}><span className="rab-q" style={i.q?.[k2] ? { background: WARNA_JENIS[i.jenis], borderColor: "transparent" } : undefined} /></td>)}
                              <td className="num" style={{ color: real ? "var(--ink)" : "var(--muted)" }}>{real ? new Intl.NumberFormat("id-ID").format(real) : "-"}</td>
                              <td className="num" style={{ fontWeight: 800, color: real ? warnaSerapan(p) : "var(--muted)" }}>{real ? `${p}%` : "-"}</td>
                            </tr>
                          );
                        }),
                      ];
                    }),
                  ];
                })}
                <tr className="rab-jenis"><td colSpan={5}>TOTAL RAB {tahun}</td><td className="num">{rupiah(totalRencana)}</td><td colSpan={4} /><td className="num">{rupiah(totalRealTeralokasi)}</td><td className="num">{persen(totalRealTeralokasi, totalRencana)}%</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Klik baris untuk edit. Kotak Q1–Q4 berwarna = rencana pelaksanaan di kuartal itu.</p>
        </Tile>
      )}

      {/* ===================== REALISASI ===================== */}
      {tab === "REALISASI" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Tile>
            <h2 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 800 }}>Sumber otomatis → baris RAB</h2>
            <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--muted)" }}>Biaya dari menu lain masuk ke baris RAB yang dipilih di sini.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
              {([["helpdesk", "Biaya perbaikan Helpdesk"], ["servis", "Biaya servis kendaraan"], ["atk", "ATK keluar (harga master)"]] as const).map(([k, l]) => (
                <label key={k}>
                  <span className="rab-lbl">{l} <span style={{ fontWeight: 600, color: "var(--muted)" }}>· {rupiah((otomatis || []).filter((r) => r.sumber === k).reduce((a, r) => a + r.jumlah, 0))}</span></span>
                  <select className="rab-in" value={peta[k] || ""} onChange={(e) => { const p = { ...peta, [k]: e.target.value || undefined }; setPeta(p); simpanRab(items, p, "Alokasi otomatis tersimpan."); }}>
                    <option value="">— Belum dialokasikan —</option>
                    {pilihItemOptions}
                  </select>
                </label>
              ))}
            </div>
          </Tile>

          <Tile>
            <h2 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: 800 }}>Catat realisasi</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
              <input type="date" className="rab-in" value={formReal.tanggal} onChange={(e) => setFormReal({ ...formReal, tanggal: e.target.value })} aria-label="Tanggal" />
              <select className="rab-in" style={{ gridColumn: "span 2" }} value={formReal.item_id} onChange={(e) => setFormReal({ ...formReal, item_id: e.target.value })} aria-label="Baris RAB">
                <option value="">Pilih baris RAB...</option>
                {pilihItemOptions}
              </select>
              <input className="rab-in" style={{ gridColumn: "span 2" }} placeholder="Uraian, mis. Pest control Oktober" value={formReal.uraian} onChange={(e) => setFormReal({ ...formReal, uraian: e.target.value })} />
              <input className="rab-in" inputMode="numeric" placeholder="Jumlah (Rp)" value={formReal.jumlah ? new Intl.NumberFormat("id-ID").format(angka(formReal.jumlah)) : ""} onChange={(e) => setFormReal({ ...formReal, jumlah: e.target.value.replace(/\D/g, "") })} />
              <button type="button" className="sa-btn is-primary" onClick={tambahRealisasi}>+ Catat</button>
            </div>
          </Tile>

          <Tile>
            <h2 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: 800 }}>Daftar realisasi {tahun}</h2>
            {semuaReal.length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>{otomatis === null ? "Memuat..." : "Belum ada realisasi."}</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {semuaReal.slice(0, 300).map((r) => (
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: "84px minmax(0,1fr) auto", gap: "10px", alignItems: "center", padding: "9px 12px", borderRadius: "12px", background: "var(--bg)" }}>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>{r.tanggal.split("-").reverse().join("/")}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "13px", color: "var(--ink)", fontWeight: 600 }}>{r.uraian}
                        <span style={{ marginLeft: "6px", fontSize: "10.5px", fontWeight: 800, padding: "1px 7px", borderRadius: "7px", background: r.sumber === "manual" ? "var(--line)" : "var(--info-50)", color: r.sumber === "manual" ? "var(--ink-soft)" : "var(--info)" }}>
                          {r.sumber === "helpdesk" ? "Helpdesk" : r.sumber === "servis" ? "Servis" : r.sumber === "atk" ? "ATK" : "Manual"}
                        </span>
                      </div>
                      {r.sumber === "manual" && (!r.item_id || !itemPerId.has(r.item_id)) && items.length > 0 ? (
                        <select className="rab-in" style={{ marginTop: "4px", padding: "5px 8px", fontSize: "12px", borderColor: "var(--warn)" }} value="" onChange={(e) => alokasikan(r, e.target.value)} aria-label="Alokasikan ke baris RAB">
                          <option value="">⚠ Alokasikan ke baris RAB{r.kategori ? ` (dulu: ${r.kategori})` : ""}...</option>
                          {pilihItemOptions}
                        </select>
                      ) : <div style={{ fontSize: "11.5px", color: r.item_id && itemPerId.has(r.item_id) ? "var(--muted)" : "var(--warn)" }}>{labelItem(r.item_id)}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <b style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{rupiah(r.jumlah)}</b>
                      {r.sumber === "manual" && <button type="button" className="sa-btn is-soft" style={{ height: "28px", fontSize: "11.5px", color: "var(--red-600)" }} onClick={() => hapusRealisasi(r)}>Hapus</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Tile>
        </div>
      )}

      {/* ===================== MODAL BARIS RAB ===================== */}
      <Modal open={!!formItem} onClose={() => !menyimpan && setFormItem(null)} maxWidth="620px">
        {formItem && (
          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: "18px", color: "var(--ink)" }}>{formItem.id ? "Edit baris RAB" : "Tambah baris RAB"}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
              <label><span className="rab-lbl">Jenis</span>
                <select className="rab-in" value={formItem.jenis} onChange={(e) => setFormItem({ ...formItem, jenis: e.target.value as Jenis })}>{JENIS.map((j) => <option key={j} value={j}>{LABEL_JENIS[j]}</option>)}</select>
              </label>
              <label><span className="rab-lbl">Kelompok *</span>
                <input className="rab-in" list="rab-kelompok" value={formItem.kelompok} onChange={(e) => setFormItem({ ...formItem, kelompok: e.target.value })} placeholder="MEP, Sipil, General Affairs..." />
                <datalist id="rab-kelompok">{Array.from(new Set(items.map((i) => i.kelompok))).map((k) => <option key={k} value={k} />)}</datalist>
              </label>
              <label><span className="rab-lbl">Kode</span><input className="rab-in" value={formItem.kode} onChange={(e) => setFormItem({ ...formItem, kode: e.target.value })} placeholder="A1" /></label>
            </div>
            <label style={{ display: "block", marginTop: "10px" }}><span className="rab-lbl">Uraian *</span><input className="rab-in" value={formItem.uraian} onChange={(e) => setFormItem({ ...formItem, uraian: e.target.value })} placeholder="Mis. AC Split Daikin 2PK" /></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px", marginTop: "10px" }}>
              <label><span className="rab-lbl">Qty</span><input className="rab-in" inputMode="decimal" value={formItem.qty || ""} onChange={(e) => setFormItem({ ...formItem, qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></label>
              <label><span className="rab-lbl">UoM</span><input className="rab-in" list="rab-uom" value={formItem.uom} onChange={(e) => setFormItem({ ...formItem, uom: e.target.value })} /><datalist id="rab-uom">{UOM_UMUM.map((u) => <option key={u} value={u} />)}</datalist></label>
              <label><span className="rab-lbl">Harga satuan (Rp)</span><input className="rab-in" inputMode="numeric" value={formItem.harga ? new Intl.NumberFormat("id-ID").format(formItem.harga) : ""} onChange={(e) => setFormItem({ ...formItem, harga: angka(e.target.value) })} /></label>
              <div><span className="rab-lbl">Amount</span><div style={{ padding: "9px 0", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{rupiah(amount(formItem))}</div></div>
            </div>
            <span className="rab-lbl" style={{ marginTop: "10px" }}>Rencana pelaksanaan</span>
            <div style={{ display: "flex", gap: "6px" }}>
              {Q_LABEL.map((q, k) => (
                <button key={q} type="button" className={`rab-chip${formItem.q[k] ? " is-on" : ""}`} onClick={() => setFormItem({ ...formItem, q: formItem.q.map((b, x) => (x === k ? !b : b)) })}>{q}</button>
              ))}
            </div>
            <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
              <label><span className="rab-lbl">Dasar pengajuan — Deskripsi</span><input className="rab-in" value={formItem.deskripsi || ""} onChange={(e) => setFormItem({ ...formItem, deskripsi: e.target.value })} /></label>
              <label><span className="rab-lbl">Risiko</span><input className="rab-in" value={formItem.risiko || ""} onChange={(e) => setFormItem({ ...formItem, risiko: e.target.value })} /></label>
              <label><span className="rab-lbl">Usulan</span><input className="rab-in" value={formItem.usulan || ""} onChange={(e) => setFormItem({ ...formItem, usulan: e.target.value })} /></label>
            </div>
            {formItem.id && <div style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--ink-soft)" }}>Realisasi baris ini: <b>{rupiah(realPerItem.get(formItem.id) || 0)}</b> ({persen(realPerItem.get(formItem.id) || 0, amount(formItem))}%)</div>}
            <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
              {formItem.id && <button type="button" className="sa-btn is-soft" style={{ color: "var(--red-600)" }} onClick={() => hapusItem(formItem)} disabled={menyimpan}>Hapus</button>}
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setFormItem(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={simpanItem} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODAL PRATINJAU IMPORT ===================== */}
      <Modal open={!!impor} onClose={() => !menyimpan && setImpor(null)} maxWidth="600px">
        {impor && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>Pratinjau import RAB</h3>
            <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>Periksa jenis tiap sheet (ditebak dari nama sheet), lalu import.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "45vh", overflowY: "auto" }}>
              {impor.map((h, idx) => (
                <div key={h.sheet} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: "10px", alignItems: "center", padding: "9px 12px", borderRadius: "12px", background: "var(--bg)", border: "1px solid var(--line)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: "13px" }}>{h.sheet}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{h.items.length} baris · {Array.from(new Set(h.items.map((i) => i.kelompok))).slice(0, 4).join(", ")}</div>
                  </div>
                  <b style={{ fontVariantNumeric: "tabular-nums", fontSize: "12.5px" }}>{ringkas(h.items.reduce((a, i) => a + amount(i), 0))}</b>
                  <select className="rab-in" style={{ width: "100px", padding: "6px" }} value={h.jenis} onChange={(e) => setImpor(impor.map((x, i) => (i === idx ? { ...x, jenis: e.target.value as Jenis, items: x.items.map((it) => ({ ...it, jenis: e.target.value as Jenis })) } : x)))} aria-label={`Jenis sheet ${h.sheet}`}>
                    {JENIS.map((j) => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "10px", fontSize: "13px", fontWeight: 800 }}>Total: {impor.reduce((a, h) => a + h.items.length, 0)} baris · {rupiah(impor.reduce((a, h) => a + h.items.reduce((b, i) => b + amount(i), 0), 0))}</div>
            {items.length > 0 && (
              <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                <button type="button" className={`rab-chip${modeImpor === "TAMBAH" ? " is-on" : ""}`} onClick={() => setModeImpor("TAMBAH")}>Tambahkan ke RAB yang ada</button>
                <button type="button" className={`rab-chip${modeImpor === "GANTI" ? " is-on" : ""}`} onClick={() => setModeImpor("GANTI")}>Ganti semua ({items.length} baris lama dihapus)</button>
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button type="button" className="sa-btn is-soft" style={{ flex: 1 }} onClick={() => setImpor(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" style={{ flex: 1 }} onClick={jalankanImpor} disabled={menyimpan}>{menyimpan ? "Mengimport..." : "Import"}</button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
