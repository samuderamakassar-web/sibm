// §187 Catatan Perjalanan Dinas Luar Kota (Driver) -- murni, tanpa Firebase.
// Koleksi driver_perjalanan_dinas: 1 dokumen = 1 perjalanan (berangkat s.d. pulang). Driver mengisi sendiri,
// termasuk susulan sejak 1 Januari 2026, supaya 2026 bisa dibandingkan dengan 2027 (frekuensi, hari, KM, biaya).

export const KOLEKSI_DINAS = "driver_perjalanan_dinas";
export const AWAL_PENCATATAN = "2026-01-01";

export const JENIS_BIAYA = [
  { kunci: "bbm", label: "BBM" },
  { kunci: "tol", label: "Tol" },
  { kunci: "parkir", label: "Parkir" },
  { kunci: "penginapan", label: "Penginapan" },
  { kunci: "uang_makan", label: "Uang makan / saku" },
  { kunci: "lain", label: "Lain-lain" },
] as const;
export type KunciBiaya = (typeof JENIS_BIAYA)[number]["kunci"];
export type BiayaDinas = Partial<Record<KunciBiaya, number>>;

export interface PerjalananDinas {
  id: string;
  driver: string;
  tanggal_berangkat: string;   // YYYY-MM-DD
  tanggal_pulang: string;      // YYYY-MM-DD
  kota_tujuan: string;
  keperluan: string;
  penumpang?: string;
  unit_bisnis?: string;        // PT yang dilayani
  kendaraan?: string;
  km_berangkat?: number | null;
  km_pulang?: number | null;
  biaya?: BiayaDinas;
  catatan?: string;
  lampiran?: string[];         // URL foto nota / surat tugas
  susulan?: boolean;           // diisi > 3 hari setelah pulang
}

export const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const hari = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

/** Lama perjalanan dalam hari (berangkat & pulang dihitung; minimal 1). */
export function lamaHari(p: Pick<PerjalananDinas, "tanggal_berangkat" | "tanggal_pulang">): number {
  if (!p.tanggal_berangkat) return 0;
  const n = hari(p.tanggal_pulang || p.tanggal_berangkat) - hari(p.tanggal_berangkat) + 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Jarak tempuh (KM pulang - KM berangkat); null bila tidak dicatat / tidak masuk akal. */
export function jarakKm(p: Pick<PerjalananDinas, "km_berangkat" | "km_pulang">): number | null {
  const a = Number(p.km_berangkat), b = Number(p.km_pulang);
  if (!p.km_berangkat || !p.km_pulang || !Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 5000) return null;
  return b - a;
}

export function totalBiaya(b?: BiayaDinas): number {
  return JENIS_BIAYA.reduce((s, j) => s + (Number(b?.[j.kunci]) || 0), 0);
}

/** Validasi form; kembalikan pesan galat atau "" bila lolos. */
export function cekPerjalanan(p: Omit<PerjalananDinas, "id">, hariIni: string): string {
  if (!p.tanggal_berangkat) return "Tanggal berangkat wajib diisi.";
  if (p.tanggal_berangkat < AWAL_PENCATATAN) return "Pencatatan dimulai 1 Januari 2026.";
  if (p.tanggal_berangkat > hariIni) return "Tanggal berangkat belum lewat — catat setelah berangkat.";
  if (p.tanggal_pulang && p.tanggal_pulang < p.tanggal_berangkat) return "Tanggal pulang tidak boleh sebelum berangkat.";
  if (!p.kota_tujuan.trim()) return "Kota tujuan wajib diisi.";
  if (!p.keperluan.trim()) return "Keperluan wajib diisi.";
  if (p.km_berangkat && p.km_pulang && Number(p.km_pulang) <= Number(p.km_berangkat)) return "KM pulang harus lebih besar dari KM berangkat.";
  return "";
}

export interface RekapDinas { trip: number; hari: number; km: number; biaya: number }
const kosong = (): RekapDinas => ({ trip: 0, hari: 0, km: 0, biaya: 0 });
function tambah(r: RekapDinas, p: PerjalananDinas) {
  r.trip += 1; r.hari += lamaHari(p); r.km += jarakKm(p) || 0; r.biaya += totalBiaya(p.biaya);
}

/** Rekap satu tahun: total, per bulan (berdasarkan bulan berangkat), per driver, per kota tujuan. */
export function rekapTahun(list: PerjalananDinas[], tahun: number, sampaiBulan = 12) {
  const isi = list.filter((p) => p.tanggal_berangkat?.startsWith(String(tahun)) && Number(p.tanggal_berangkat.slice(5, 7)) <= sampaiBulan);
  const total = kosong();
  const bulan = Array.from({ length: 12 }, kosong);
  const driver: Record<string, RekapDinas> = {};
  const kota: Record<string, RekapDinas> = {};
  isi.forEach((p) => {
    tambah(total, p);
    tambah(bulan[Number(p.tanggal_berangkat.slice(5, 7)) - 1], p);
    tambah((driver[p.driver || "-"] ||= kosong()), p);
    const k = rapikanKota(p.kota_tujuan);
    tambah((kota[k] ||= kosong()), p);
  });
  return { total, bulan, driver, kota, jumlah: isi.length };
}

/** "  maros " -> "Maros" supaya rekap per kota tidak pecah karena penulisan. */
export function rapikanKota(k = ""): string {
  return k.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s/-])\S/g, (c) => c.toUpperCase()) || "-";
}

/** Persen perubahan a terhadap b ("+12%"), "—" bila pembanding 0. */
export function selisihPersen(a: number, b: number): string {
  if (!b) return "—";
  const p = Math.round(((a - b) / b) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

export const rupiah = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;

/** Normalisasi data Firestore -> PerjalananDinas. */
export function dariFirestore(id: string, d: Record<string, unknown>): PerjalananDinas {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const b = (d.biaya && typeof d.biaya === "object" ? d.biaya : {}) as Record<string, unknown>;
  const biaya: BiayaDinas = {};
  JENIS_BIAYA.forEach((j) => { const v = Number(b[j.kunci]); if (v > 0) biaya[j.kunci] = v; });
  return {
    id, driver: s(d.driver), tanggal_berangkat: s(d.tanggal_berangkat), tanggal_pulang: s(d.tanggal_pulang) || s(d.tanggal_berangkat),
    kota_tujuan: s(d.kota_tujuan), keperluan: s(d.keperluan), penumpang: s(d.penumpang), unit_bisnis: s(d.unit_bisnis),
    kendaraan: s(d.kendaraan), km_berangkat: n(d.km_berangkat), km_pulang: n(d.km_pulang), biaya, catatan: s(d.catatan),
    lampiran: Array.isArray(d.lampiran) ? d.lampiran.map(String).filter(Boolean) : [], susulan: d.susulan === true,
  };
}
