// §184 Tagihan utilitas & pembelian rutin -- murni (tanpa Firebase), dipakai /admin/tagihan.
//
// Satu sumber data: setiap tagihan PLN / PDAM / pembelian disimpan sebagai 1 dokumen `realisasi_biaya`
// dengan field `catat` ("PLN" | "PDAM" | "BELI") + rinciannya. Jadi otomatis ikut terhitung di Anggaran &
// Realisasi (item_id = baris RAB) tanpa input ganda.
//   PLN  : dibaca dari PDF "Rincian Rekening" PLN (teks PDF, tanpa OCR) -> kWh LWBP/WBP, kVArh, stand meter, Rp.
//   PDAM : dibaca dari PDF "Informasi Tagihan" PDAM Makassar -> meter awal/akhir, pakai m3, rincian biaya.
//   BELI : pembelian utilitas/fasilitas/tools cleaning/chemical/solar & oli genset; item bisa menambah stok OB.

export type JenisCatat = "PLN" | "PDAM" | "BELI";

export interface DataPLN {
  id_pel: string; golongan: string; daya_va: number; faktor_kali: number;
  lwbp_awal: number; lwbp_akhir: number; wbp_awal: number; wbp_akhir: number; kvarh_awal: number; kvarh_akhir: number;
  kwh_lwbp: number; kwh_wbp: number; kvarh: number;
  tarif_lwbp: number; tarif_wbp: number;
  rp_ttl: number; ppn: number; ppj: number; materai: number; denda: number; subsidi: number; total: number;
  jatuh_tempo: string; tgl_bayar: string; status: string;
}
export interface DataPDAM {
  no_air: string; golongan: string;
  m_awal: number; m_akhir: number; pakai: number;
  by_pakai: number; by_adm: number; by_pem: number; denda: number; lain: number; total: number;
}
export interface ItemBeli { nama: string; qty: number; satuan: string; harga: number; stok_id?: string; stok_nama?: string }
export interface DataBeli { kategori: KategoriBeli; vendor: string; items: ItemBeli[]; jam_genset?: number }

/** Dokumen realisasi_biaya yang dibuat menu Tagihan & Pembelian. */
export interface CatatanBiaya {
  id: string; catat: JenisCatat; tanggal: string; periode: string; item_id: string; kategori: string;
  uraian: string; jumlah: number; daerah?: string; file_path?: string; file_nama?: string;
  pln?: DataPLN; pdam?: DataPDAM; beli?: DataBeli; catatan?: string; dicatat_oleh?: string;
}

export const KATEGORI_BELI = ["Utilitas", "Fasilitas", "Tools & Alat Cleaning", "Chemical & Consumable OB", "Solar Genset", "Oli & Consumable Genset", "Pantry & Rumah Tangga", "Lainnya"] as const;
export type KategoriBeli = (typeof KATEGORI_BELI)[number];
export const KATEGORI_GENSET: KategoriBeli[] = ["Solar Genset", "Oli & Consumable Genset"];
/** Kata kunci baris RAB yang disarankan per jenis (dicocokkan ke uraian baris, urutan = prioritas). */
export const SARAN_RAB: Record<string, string[]> = {
  PLN: ["pln", "biaya listrik"], PDAM: ["pdam", "pam"],
  "Solar Genset": ["solar"], "Oli & Consumable Genset": ["consumabel goods", "consumable goods", "servis genset"],
  "Tools & Alat Cleaning": ["soap dispenser", "floor cleaner"], "Chemical & Consumable OB": ["soap dispenser", "floor cleaner", "pewangi"],
  Utilitas: [], Fasilitas: [], "Pantry & Rumah Tangga": ["pantry"], Lainnya: [],
};

/** Pilih baris RAB pertama yang uraiannya memuat kata kunci (kosong bila tidak ada). */
export function saranBarisRab(items: { id: string; uraian: string; jenis?: string }[], kunci: string): string {
  for (const k of SARAN_RAB[kunci] || []) {
    const re = new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    const hit = items.find((i) => i.jenis !== "CAPEX" && re.test(i.uraian));
    if (hit) return hit.id;
  }
  return "";
}

/** Angka dari teks. gaya "en" = 9,415,833.50 (PLN); "id" = 1.285.300,50 (PDAM). */
export function angka(s: string | undefined | null, gaya: "en" | "id"): number {
  if (!s) return 0;
  let t = s.replace(/[^\d.,-]/g, "");
  if (gaya === "en") t = t.replace(/,/g, "");
  else t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

const BULAN: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
const dua = (n: number) => String(n).padStart(2, "0");
/** "20 Februari 2026" / "12/02/2026" -> "2026-02-20" (kosong bila gagal). */
export function tanggalDari(s: string): string {
  const a = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (a) return `${a[3]}-${dua(+a[2])}-${dua(+a[1])}`;
  const b = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (b && BULAN[b[2].slice(0, 3).toLowerCase()]) return `${b[3]}-${dua(BULAN[b[2].slice(0, 3).toLowerCase()])}-${dua(+b[1])}`;
  return "";
}

const NUM = "(\\d[\\d.,]*)";
function cari(teks: string, re: RegExp): string { return teks.match(re)?.[1] ?? ""; }

export const PLN_KOSONG: DataPLN = {
  id_pel: "", golongan: "", daya_va: 0, faktor_kali: 0, lwbp_awal: 0, lwbp_akhir: 0, wbp_awal: 0, wbp_akhir: 0, kvarh_awal: 0, kvarh_akhir: 0,
  kwh_lwbp: 0, kwh_wbp: 0, kvarh: 0, tarif_lwbp: 0, tarif_wbp: 0, rp_ttl: 0, ppn: 0, ppj: 0, materai: 0, denda: 0, subsidi: 0, total: 0,
  jatuh_tempo: "", tgl_bayar: "", status: "",
};
export const PDAM_KOSONG: DataPDAM = { no_air: "", golongan: "", m_awal: 0, m_akhir: 0, pakai: 0, by_pakai: 0, by_adm: 0, by_pem: 0, denda: 0, lain: 0, total: 0 };

/** Baca teks "Rincian Rekening" PLN. `baris` = baris teks PDF (urut atas-bawah). */
export function bacaPLN(baris: string[]): { periode: string; data: DataPLN; terbaca: number } {
  const t = baris.join("\n");
  const d: DataPLN = { ...PLN_KOSONG };
  const en = (re: RegExp) => angka(cari(t, re), "en");
  const per = t.match(/Rekening\s+(\d{1,2})-(\d{4})/i);
  const periode = per ? `${per[2]}-${dua(+per[1])}` : "";
  d.id_pel = cari(t, /ID\s*Pelanggan\s*:?\s*(\d{8,14})/i);
  const gol = t.match(/Golongan\s*Tarif\s*:?\s*([A-Z0-9-]+)\s*\/\s*([\d.,]+)\s*VA/i);
  if (gol) { d.golongan = gol[1]; d.daya_va = angka(gol[2], "en"); }
  d.faktor_kali = en(new RegExp(`Faktor\\s*Kali\\s*Meter\\s*:?\\s*${NUM}`, "i"));
  const stand = (label: string) => {
    const m = t.match(new RegExp(`Stand\\s*${label}[^\\n\\d]*(?:\\([\\d\\s/-]+\\))?\\s*${NUM}\\s+${NUM}\\s+${NUM}`, "i"));
    return m ? [angka(m[1], "en"), angka(m[2], "en"), angka(m[3], "en")] : null;
  };
  const akhir = stand("Akhir"), awal = stand("Awal");
  if (akhir) [d.lwbp_akhir, d.wbp_akhir, d.kvarh_akhir] = akhir;
  if (awal) [d.lwbp_awal, d.wbp_awal, d.kvarh_awal] = awal;
  d.kwh_lwbp = en(new RegExp(`kWh\\s*LWBP\\s*:\\s*${NUM}`, "i"));
  d.kwh_wbp = en(new RegExp(`kWh\\s*WBP\\s*:\\s*${NUM}`, "i"));
  d.kvarh = en(new RegExp(`(?:^|\\s)kVArh\\s*:\\s*${NUM}`, "im"));
  // kWh dari stand x faktor kali bila baris kWh tidak terbaca
  if (!d.kwh_lwbp && d.lwbp_akhir && d.faktor_kali) d.kwh_lwbp = Math.round((d.lwbp_akhir - d.lwbp_awal) * d.faktor_kali);
  if (!d.kwh_wbp && d.wbp_akhir && d.faktor_kali) d.kwh_wbp = Math.round((d.wbp_akhir - d.wbp_awal) * d.faktor_kali);
  d.tarif_lwbp = en(new RegExp(`Tarif\\s*LWBP\\s*:\\s*Rp\\s*${NUM}`, "i"));
  d.tarif_wbp = en(new RegExp(`Tarif\\s*WBP\\s*:\\s*Rp\\s*${NUM}`, "i"));
  d.rp_ttl = en(new RegExp(`Rupiah\\s*TTL\\s*Terpakai\\s*:?\\s*Rp\\s*${NUM}`, "i"));
  d.ppn = en(new RegExp(`PPN\\**\\s*\\(\\s*\\d+\\s*%\\s*\\)\\s*:?\\s*Rp\\s*${NUM}`, "i"));
  d.ppj = en(new RegExp(`(?:PBJT-TL|PPJ)[^\\n]*?\\(\\s*\\d+\\s*%\\s*\\)\\s*:?\\s*Rp\\s*${NUM}`, "i"));
  d.materai = en(new RegExp(`Bea\\s*Meterai[^:\\n]*:?\\s*Rp\\s*${NUM}`, "i"));
  d.denda = en(new RegExp(`Biaya\\s*Keterlambatan\\s*:?\\s*Rp\\s*${NUM}`, "i"));
  d.subsidi = en(new RegExp(`Subsidi\\**\\s*:?\\s*Rp\\s*${NUM}`, "i"));
  d.total = en(new RegExp(`Total\\s*Tagihan\\**\\s*:?\\s*Rp\\s*${NUM}`, "i"))
    || en(new RegExp(`Total\\s*Yang\\s*Dibayarkan\\**\\s*:?\\s*Rp\\s*${NUM}`, "i"));
  d.jatuh_tempo = tanggalDari(cari(t, /Jatuh\s*Tempo\s*:?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i));
  d.tgl_bayar = tanggalDari(cari(t, /Tanggal\s*Bayar\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/i));
  d.status = cari(t, /Status\s*:?\s*(LUNAS|BELUM\s*LUNAS|BELUM\s*BAYAR)/i).toUpperCase();
  const terbaca = [periode, d.id_pel, d.total, d.kwh_lwbp || d.lwbp_akhir, d.rp_ttl].filter(Boolean).length;
  return { periode, data: d, terbaca };
}

/** Baca teks "Informasi Tagihan" PDAM. */
export function bacaPDAM(baris: string[]): { periode: string; data: DataPDAM; terbaca: number } {
  const t = baris.join("\n");
  const d: DataPDAM = { ...PDAM_KOSONG };
  d.no_air = cari(t, /No\.?\s*AIR\s*:?\s*(\d{6,})/i);
  d.golongan = cari(t, /Gol\s*\/\s*Tarif\s*:?\s*([A-Z0-9]+(?:\s*\([^)\n]*\))?)/i).trim();
  let periode = "";
  // baris rincian: "Feb 2026 237 360 123 1.252.800 27.500 5.000 1.285.300 [denda] [angsuran] 1.285.300"
  const re = /(?:^|\s)(Jan|Feb|Mar|Apr|Mei|May|Jun|Jul|Agu|Agt|Aug|Sep|Okt|Oct|Nov|Des|Dec)[a-z]*\s+(\d{4})((?:\s+\d[\d.,]*){7,10})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const nums = m[3].trim().split(/\s+/).map((x) => angka(x, "id"));
    periode = `${m[2]}-${dua(BULAN[m[1].slice(0, 3).toLowerCase()])}`;
    [d.m_awal, d.m_akhir, d.pakai, d.by_pakai, d.by_adm, d.by_pem] = nums;
    const rek = nums[6] || 0;
    const jml = nums[nums.length - 1] || rek;
    if (nums.length >= 10) d.denda = nums[7];
    d.lain = Math.max(0, jml - rek - d.denda);
    d.total = jml;
    break; // baris pertama = bulan tagihan (baris "Jumlah" diabaikan)
  }
  const tot = angka(cari(t, /TOTAL\s*TAGIHAN\s*:?\s*(\d[\d.,]*)/i), "id");
  if (tot) d.total = tot;
  if (!d.pakai && d.m_akhir) d.pakai = d.m_akhir - d.m_awal;
  const terbaca = [periode, d.no_air, d.total, d.m_akhir].filter(Boolean).length;
  return { periode, data: d, terbaca };
}

export const kwhTotal = (p?: DataPLN) => (p ? (p.kwh_lwbp || 0) + (p.kwh_wbp || 0) : 0);
export const literBeli = (b?: DataBeli) => (b ? b.items.filter((i) => /^(l|liter|ltr)$/i.test(i.satuan.trim())).reduce((a, i) => a + i.qty, 0) : 0);
export const totalBeli = (b?: DataBeli) => (b ? b.items.reduce((a, i) => a + i.qty * i.harga, 0) : 0);

// ===================== ESG (lingkungan) =====================
export interface FaktorEsg { grid_kgco2_kwh: number; solar_kgco2_liter: number }
/** Faktor solar default: ±2,68 kg CO2/liter (nilai umum IPCC untuk diesel). Faktor grid harus diisi admin
 *  sesuai faktor emisi sistem Sulbagsel terbitan ESDM -- 0 = belum diisi (Scope 2 tidak dihitung). */
export const FAKTOR_DEFAULT: FaktorEsg = { grid_kgco2_kwh: 0, solar_kgco2_liter: 2.68 };

export interface RekapBulan { bulan: string; kwh: number; rpPln: number; m3: number; rpPdam: number; literSolar: number; rpSolar: number; rpOli: number; rpBeli: number; perKategori: Record<string, number> }

/** Rekap per bulan (YYYY-MM) dari catatan. Tagihan memakai `periode`, pembelian memakai `tanggal`. */
export function rekapBulanan(cat: CatatanBiaya[]): Map<string, RekapBulan> {
  const out = new Map<string, RekapBulan>();
  const ambil = (b: string) => {
    if (!out.has(b)) out.set(b, { bulan: b, kwh: 0, rpPln: 0, m3: 0, rpPdam: 0, literSolar: 0, rpSolar: 0, rpOli: 0, rpBeli: 0, perKategori: {} });
    return out.get(b)!;
  };
  cat.forEach((c) => {
    const r = ambil(c.catat === "BELI" ? c.tanggal.slice(0, 7) : c.periode || c.tanggal.slice(0, 7));
    if (c.catat === "PLN") { r.kwh += kwhTotal(c.pln); r.rpPln += c.jumlah; }
    else if (c.catat === "PDAM") { r.m3 += c.pdam?.pakai || 0; r.rpPdam += c.jumlah; }
    else {
      const k = c.beli?.kategori || "Lainnya";
      r.rpBeli += c.jumlah;
      r.perKategori[k] = (r.perKategori[k] || 0) + c.jumlah;
      if (k === "Solar Genset") { r.literSolar += literBeli(c.beli); r.rpSolar += c.jumlah; }
      if (k === "Oli & Consumable Genset") r.rpOli += c.jumlah;
    }
  });
  return out;
}

export interface Esg { kwh: number; m3: number; literSolar: number; scope1: number; scope2: number | null; total: number | null }
export function hitungEsg(bulan: RekapBulan[], f: FaktorEsg): Esg {
  const kwh = bulan.reduce((a, b) => a + b.kwh, 0), m3 = bulan.reduce((a, b) => a + b.m3, 0), literSolar = bulan.reduce((a, b) => a + b.literSolar, 0);
  const scope1 = (literSolar * f.solar_kgco2_liter) / 1000;
  const scope2 = f.grid_kgco2_kwh > 0 ? (kwh * f.grid_kgco2_kwh) / 1000 : null;
  return { kwh, m3, literSolar, scope1, scope2, total: scope2 === null ? null : scope1 + scope2 };
}

/** Senin-Minggu pekan tanggal tsb. */
export function rentangPekan(iso: string): [string, string] {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const a = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return [a, d.toISOString().slice(0, 10)];
}
