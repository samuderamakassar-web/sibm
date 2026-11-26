// §182 Paket area TETAP pola zona (keputusan user 25 Nov 2026) -- murni, tanpa Firebase.
//
// Pembagian area dibekukan jadi 4 paket. Isinya tidak berubah; yang berganti tiap pekan hanya PEMEGANGNYA:
//   T1 / T2      = paket Zona Tenant (pagi ruang tenant + pelayanan lantai + keliling ruang tenant lantai itu)
//   TOILET / LAIN = paket Zona Publik (Toilet / Area Lain + cadangan pelayanan)
// Pekan acuan: pemegang sesuai `pemegang`; pekan berikutnya ditukar dengan pasangannya (T1<->T2, TOILET<->LAIN),
// begitu seterusnya bergantian. Kalau ada yang sakit/izin, rencanaHari (§176) membagi ulang memakai isi paket ini.
//
//   ob_settings/uji_pola_zona.paket_zona = { acuan, pemegang{T1,T2,TOILET,LAIN}, pagi[{area,kode}],
//                                           pelayanan[{lantai,kode}], publik[{area,kode}] }
// (disimpan sebagai array, bukan map: nama area bisa mengandung titik, mis. "Lantai 2. Pantry")
import { lantaiDari } from "./bagiZona";
import type { RencanaHari } from "./rencanaZona";

export type KodePaket = "T1" | "T2" | "TOILET" | "LAIN";
export type KodeTenant = "T1" | "T2";
export type KodePublik = "TOILET" | "LAIN";
export const SEMUA_PAKET: KodePaket[] = ["T1", "T2", "TOILET", "LAIN"];
export const PAKET_TENANT: KodeTenant[] = ["T1", "T2"];
export const PAKET_PUBLIK: KodePublik[] = ["TOILET", "LAIN"];
export const LABEL_PAKET: Record<KodePaket, string> = { T1: "Tenant A", T2: "Tenant B", TOILET: "Publik · Toilet", LAIN: "Publik · Area Lain" };
export const WARNA_PAKET: Record<KodePaket, string> = { T1: "#2563eb", T2: "#7c3aed", TOILET: "#0d9488", LAIN: "#d97706" };
export const PASANGAN: Record<KodePaket, KodePaket> = { T1: "T2", T2: "T1", TOILET: "LAIN", LAIN: "TOILET" };

export interface PaketZona {
  acuan: string;                          // Senin pekan acuan (YYYY-MM-DD)
  pemegang: Record<KodePaket, string>;    // pemegang paket di pekan acuan
  pagi: { area: string; kode: KodePaket }[];      // ruang tenant 07.00-09.00 (boleh ke paket mana pun)
  pelayanan: { lantai: string; kode: KodeTenant }[];
  publik: { area: string; kode: KodePublik }[];
}
export interface IsiPaket { pagi: string[]; pelayanan: string[]; area: string[]; mingguan: string[] }

const sama = (a = "", b = "") => a.trim().toLowerCase() === b.trim().toLowerCase();
const hariKe = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
/** Senin pekan tanggal tsb. */
export function seninDari(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const tambahHariISO = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Pekan tanggal tsb kebalikan pekan acuan? (selang pekan ganjil) */
export function pekanDitukar(p: PaketZona, tanggal: string): boolean {
  const n = Math.round((hariKe(seninDari(tanggal)) - hariKe(seninDari(p.acuan))) / 7);
  return ((n % 2) + 2) % 2 === 1;
}

/** Pemegang tiap paket pada tanggal tsb. */
export function pemegangPada(p: PaketZona, tanggal: string): Record<KodePaket, string> {
  const tukar = pekanDitukar(p, tanggal);
  const out = { T1: "", T2: "", TOILET: "", LAIN: "" } as Record<KodePaket, string>;
  SEMUA_PAKET.forEach((k) => { out[k] = (tukar ? p.pemegang[PASANGAN[k]] : p.pemegang[k]) || p.pemegang[k] || ""; });
  return out;
}

/** Isi tiap paket dari daftar area yang berlaku sekarang (area lama yang sudah dihapus diabaikan). */
export function isiPaket(p: PaketZona, areaTenant: string[], areaPublik: string[], mingguan: string[]): { isi: Record<KodePaket, IsiPaket>; belum: string[] } {
  const isi = Object.fromEntries(SEMUA_PAKET.map((k) => [k, { pagi: [], pelayanan: [], area: [], mingguan: [] } as IsiPaket])) as Record<KodePaket, IsiPaket>;
  const belum: string[] = [];
  const mg = new Set(mingguan);
  areaTenant.forEach((a) => {
    const e = p.pagi.find((x) => x.area === a);
    // §186 ruang tenant baru (dari Okupansi) yang belum dipetakan -> paket pemegang pelayanan lantainya
    if (e) isi[e.kode].pagi.push(a);
    else { belum.push(a); isi[p.pelayanan.find((x) => x.lantai === lantaiDari(a))?.kode || "T1"].pagi.push(a); }
  });
  const lantai = Array.from(new Set(areaTenant.map(lantaiDari).filter((l) => l !== "Bersama"))).sort();
  lantai.forEach((l) => {
    const e = p.pelayanan.find((x) => x.lantai === l);
    isi[e?.kode || "T1"].pelayanan.push(l);
    if (!e) belum.push(`Pelayanan ${l}`);
  });
  PAKET_TENANT.forEach((k) => { isi[k].area = areaTenant.filter((a) => isi[k].pelayanan.includes(lantaiDari(a))); });
  areaPublik.forEach((a) => {
    const e = p.publik.find((x) => x.area === a);
    const k = e?.kode || "LAIN";
    if (!e) belum.push(a);
    (mg.has(a) ? isi[k].mingguan : isi[k].area).push(a);
  });
  return { isi, belum };
}

/** Bekukan rencana hari normal (semua hadir) jadi paket. `tenantUrut` = urutan Zona Tenant pekan itu. */
export function paketDariRencana(r: RencanaHari, tenantUrut: string[], acuan: string): PaketZona {
  const p: PaketZona = { acuan: seninDari(acuan), pemegang: { T1: "", T2: "", TOILET: "", LAIN: "" }, pagi: [], pelayanan: [], publik: [] };
  r.orang.forEach((o) => {
    const kode: KodePaket = o.zona === "Tenant" ? (sama(tenantUrut[0], o.nama) ? "T1" : "T2") : o.peran === "Toilet" ? "TOILET" : "LAIN";
    p.pemegang[kode] = o.nama;
    o.pagi.forEach((area) => p.pagi.push({ area, kode }));
    if (kode === "T1" || kode === "T2") o.pelayanan.forEach((lantai) => p.pelayanan.push({ lantai, kode }));
    else [...o.area, ...o.mingguan].forEach((area) => { if (!p.publik.some((x) => x.area === area)) p.publik.push({ area, kode }); });
  });
  return p;
}

/** Paket dari Firestore (null bila tidak valid). */
export function rapikanPaket(v: unknown): PaketZona | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (typeof d.acuan !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.acuan)) return null;
  const pm = (d.pemegang || {}) as Record<string, unknown>;
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((e) => e && typeof e === "object") as Record<string, unknown>[] : []);
  const kodeOk = <K extends string>(k: unknown, daftar: K[]): k is K => daftar.includes(k as K);
  return {
    acuan: d.acuan,
    pemegang: { T1: String(pm.T1 || ""), T2: String(pm.T2 || ""), TOILET: String(pm.TOILET || ""), LAIN: String(pm.LAIN || "") },
    pagi: arr(d.pagi).filter((e) => typeof e.area === "string" && kodeOk(e.kode, SEMUA_PAKET)).map((e) => ({ area: e.area as string, kode: e.kode as KodePaket })),
    pelayanan: arr(d.pelayanan).filter((e) => typeof e.lantai === "string" && kodeOk(e.kode, PAKET_TENANT)).map((e) => ({ lantai: e.lantai as string, kode: e.kode as KodeTenant })),
    publik: arr(d.publik).filter((e) => typeof e.area === "string" && kodeOk(e.kode, PAKET_PUBLIK)).map((e) => ({ area: e.area as string, kode: e.kode as KodePublik })),
  };
}

/** Paket bisa dipakai bila pemegang Tenant = anggota Zona Tenant dan pemegang Publik = anggota Zona Publik (maks 2+2). */
export function paketCocok(p: PaketZona | null, timTenant: string[], timPublik: string[]): p is PaketZona {
  if (!p || timTenant.length > 2 || timPublik.length > 2) return false;
  const di = (daftar: string[], n: string) => daftar.some((x) => sama(x, n));
  const t = [p.pemegang.T1, p.pemegang.T2].filter(Boolean), u = [p.pemegang.TOILET, p.pemegang.LAIN].filter(Boolean);
  return t.length === timTenant.length && u.length === timPublik.length && t.every((n) => di(timTenant, n)) && u.every((n) => di(timPublik, n));
}
