// Uji Coba Pola Zona OB (§169) -- semua staf OB & CS jadi "Office Boy", dibedakan ZONA kerja:
//   Tenant  = melayani & membersihkan ruang tenant (semua lantai, semua tenant) + permintaan portal
//   Publik  = lobby, koridor, toilet, tangga, parkiran, taman, dll.
// 2 minggu: minggu 1 tim_tenant/tim_publik sesuai pilihan admin, minggu 2 ditukar otomatis.
// Selama uji coba checklist lama (per lantai, 3 sesi) disembunyikan, potong poin & pengingat sesi
// lama dilewati (scripts/points-deduction.mjs, scripts/fcm-reminder.mjs membaca dokumen yang sama).
//
//   ob_settings/uji_pola_zona { aktif, mulai, tukar_mulai, selesai, tim_tenant[], tim_publik[],
//                               area_tenant[], area_publik[], min_ronde, dibuat_oleh, waktu_update }
//   ob_zona_laporan/{id}      { jenis: "ronde", tanggal, nama, zona, minggu, area[], foto[] (2-3), catatan }
//   Pembagian area per orang per lantai: src/lib/bagiZona.ts (§173, dari luas Okupansi)
//   Rencana harian (pola Toilet / Area Lain, skenario tidak hadir): src/lib/rencanaZona.ts (§176)
import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, updateDoc, type Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { CHECKLIST_OB_BAWAAN, type AreaChecklist } from "./sopChecklist";
import { uraiArea, type LantaiOk } from "./bagiZona";
import { pemegangToilet, rencanaHari, type RencanaHari } from "./rencanaZona";
import { isiPaket, paketCocok, pekanDitukar, pemegangPada, rapikanPaket, type PaketZona } from "./paketZona";
import { barisAreaTenant, ruangTenantOkupansi, selaraskanPagi, selaraskanPelayanan } from "./areaOkupansi";

export type Zona = "Tenant" | "Publik";
export const DOC_UJI_POLA = () => doc(db, "ob_settings", "uji_pola_zona");
export const KOLEKSI_LAPORAN_ZONA = "ob_zona_laporan";
// §173 foto ronde: minimal 2, maksimal 3, boleh dari galeri (keputusan user)
export const FOTO_MIN = 2;
export const FOTO_MAX = 3;

export interface UjiPolaZona {
  aktif: boolean;
  mulai: string;        // Senin minggu 1 (YYYY-MM-DD)
  tukar_mulai: string;  // Senin minggu 2 -- zona ditukar
  selesai: string;      // Jumat minggu 2
  tim_tenant: string[]; // zona Tenant minggu 1
  tim_publik: string[]; // zona Publik minggu 1
  area_tenant: string[];
  area_publik: string[];
  luas_area: Record<string, number>; // §174 luas manual per area (m²), dari baris "Area | luas"
  mingguan: string[];                // §175 area cukup 1x/minggu (baris "Area | mingguan")
  // §175 pembagian beban (keputusan user 2 Nov): ruang tenant dibersihkan SEMUA orang di pagi hari,
  // lalu 1 orang Zona Publik bergiliran jadi cadangan pelayanan di jam sibuk.
  pagi_bersama: boolean; jam_pagi: string;
  cadangan_publik: boolean; jam_cadangan: string;
  min_ronde: number;
  // §176 pola Toilet / Area Lain: pemegang toilet tiap minggu (anggota Zona Publik minggu itu)
  toilet_mg1: string; toilet_mg2: string;
  // §179 tukar lantai Zona Tenant per minggu (balik urutan -> orang ke-1 tidak selalu dapat lantai yang sama)
  tukar_lantai_mg1: boolean; tukar_lantai_mg2: boolean;
  // §176 ketidakhadiran per tanggal (ditandai Admin) -> tugas hari itu dibagi ulang otomatis
  tidak_hadir: Record<string, string[]>;
  // §180 "mingguan" = zona ditukar tiap minggu; §181 "tetap" = Tenant tetap Tenant, Publik tetap Publik, tetapi
  // tugas DI DALAM zona ditukar tiap pekan: lantai Tenant dibalik & pemegang Toilet / Area Lain bergantian.
  rotasi: "mingguan" | "tetap";
  // §180 pola zona dipermanenkan: berlaku terus sejak `mulai` (tanpa tanggal selesai), plotting lama tidak dipakai
  permanen: boolean;
  // §182 paket area tetap (pembagian dibekukan, pemegang bergantian tiap pekan) -- null = dihitung otomatis
  paket_zona: PaketZona | null;
  dibuat_oleh?: string;
  waktu_update?: Timestamp | null;
}

export interface LaporanZona {
  id: string;
  // §171 hanya "ronde" -- penilaian dari staf ditiadakan (evaluasi otomatis dari data aplikasi)
  jenis: "ronde";
  tanggal: string;
  nama: string;
  zona: Zona;
  minggu: 1 | 2;
  waktu?: Timestamp | null;
  area?: string[];
  foto?: string[];         // §173 2-3 foto
  foto_sebelum?: string;   // laporan lama (2 Nov pagi, sebelum §173)
  foto_sesudah?: string;
  catatan?: string;
}

/** Semua foto laporan (format baru foto[] atau lama sebelum/sesudah). */
export const fotoLaporan = (l: LaporanZona): string[] => (l.foto?.length ? l.foto : [l.foto_sebelum, l.foto_sesudah].filter((x): x is string => !!x));

/** Tanggal ISO + n hari (aman zona waktu: dihitung di UTC murni). */
export function tambahHari(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const akhirPekan = (iso: string) => { const h = new Date(`${iso}T00:00:00Z`).getUTCDay(); return h === 0 || h === 6; };

/** Mulai = Senin -> tukar = Senin berikutnya, selesai = Jumat minggu ke-2. */
export function jadwalDariMulai(mulai: string) {
  return { mulai, tukar_mulai: tambahHari(mulai, 7), selesai: tambahHari(mulai, 11) };
}

/** Hari kerja (Senin-Jumat, di luar hari libur) dari a s.d. b inklusif. */
export function hariKerja(a: string, b: string, libur: string[] = []): string[] {
  const out: string[] = [];
  for (let d = a; d <= b; d = tambahHari(d, 1)) if (!akhirPekan(d) && !libur.includes(d)) out.push(d);
  return out;
}

/** Pola zona berlaku pada tanggal tsb: periode uji coba, atau sejak `mulai` tanpa batas bila dipermanenkan (§180). */
export const dalamUjiCoba = (c: UjiPolaZona | null, tanggal: string) => !!c && c.aktif && tanggal >= c.mulai && (c.permanen || tanggal <= c.selesai);
/** Pekan ke-1/2 dalam siklus 2 minggu sejak `mulai` (bergantian terus bila permanen). */
export const mingguKe = (c: UjiPolaZona, tanggal: string): 1 | 2 => {
  const pk = paketBerlaku(c);
  if (pk) return pekanDitukar(pk, tanggal) ? 2 : 1; // §182 pekan 1 = pekan acuan paket
  const hari = Math.round((Date.parse(`${tanggal}T00:00:00Z`) - Date.parse(`${c.mulai}T00:00:00Z`)) / 86400000);
  return hari >= 0 && Math.floor(hari / 7) % 2 === 1 ? 2 : 1;
};

/** §182 paket area tetap yang berlaku (rotasi "tetap" + pemegang cocok dengan anggota zona), selain itu null. */
export const paketBerlaku = (c: UjiPolaZona | null): PaketZona | null =>
  c && c.rotasi === "tetap" && paketCocok(c.paket_zona, c.tim_tenant, c.tim_publik) ? c.paket_zona : null;

/** Pekan untuk penentuan ZONA: rotasi "tetap" -> zona tidak pernah ditukar. */
const mingguZona = (c: UjiPolaZona, tanggal: string): 1 | 2 => (c.rotasi === "tetap" ? 1 : mingguKe(c, tanggal));

/** Zona staf pada tanggal tsb (null = tidak ikut uji coba / di luar periode). */
export function zonaUntuk(c: UjiPolaZona | null, nama: string, tanggal: string): Zona | null {
  if (!c || !dalamUjiCoba(c, tanggal)) return null;
  const n = nama.trim().toLowerCase();
  const diTenant = c.tim_tenant.some((x) => x.trim().toLowerCase() === n);
  const diPublik = c.tim_publik.some((x) => x.trim().toLowerCase() === n);
  if (!diTenant && !diPublik) return null;
  const awal: Zona = diTenant ? "Tenant" : "Publik";
  return mingguZona(c, tanggal) === 1 ? awal : awal === "Tenant" ? "Publik" : "Tenant";
}

/** Anggota zona pada tanggal tsb. */
export function anggotaZona(c: UjiPolaZona, zona: Zona, tanggal: string): string[] {
  const m1 = zona === "Tenant" ? c.tim_tenant : c.tim_publik;
  const m2 = zona === "Tenant" ? c.tim_publik : c.tim_tenant;
  return mingguZona(c, tanggal) === 1 ? m1 : m2;
}

/** §181 susunan satu pekan: siapa Zona Tenant (urutan = lantai), Zona Publik & pemegang toilet.
 *  - rotasi "mingguan": pekan 2 zona ditukar (Tenant <-> Publik), setelan mg2 dipakai.
 *  - rotasi "tetap": anggota zona tetap; pekan 2 = kebalikan pekan 1 (lantai Tenant dibalik, toilet ke rekan). */
export function susunanPekan(p: { tetap: boolean; mg: 1 | 2; timTenant: string[]; timPublik: string[]; toiletMg1: string; toiletMg2: string; tukarMg1: boolean; tukarMg2: boolean }) {
  if (p.tetap) {
    const toilet1 = pemegangToilet(p.timPublik, p.toiletMg1);
    const toilet = p.mg === 1 ? toilet1 : p.timPublik.find((n) => n.trim().toLowerCase() !== toilet1.trim().toLowerCase()) || toilet1;
    return { tenant: tukarLantai(p.timTenant, p.mg === 1 ? p.tukarMg1 : !p.tukarMg1), publik: p.timPublik, toilet };
  }
  const tenant = p.mg === 1 ? p.timTenant : p.timPublik, publik = p.mg === 1 ? p.timPublik : p.timTenant;
  // bawaan pemegang toilet pekan 2 = orang terakhir supaya tidak sama urutan dengan pekan 1
  return { tenant: tukarLantai(tenant, p.mg === 1 ? p.tukarMg1 : p.tukarMg2), publik, toilet: pemegangToilet(p.mg === 1 ? publik : [...publik].reverse(), p.mg === 1 ? p.toiletMg1 : p.toiletMg2) };
}
const susunanUntuk = (c: UjiPolaZona, tanggal: string) => susunanPekan({
  tetap: c.rotasi === "tetap", mg: mingguKe(c, tanggal), timTenant: c.tim_tenant, timPublik: c.tim_publik,
  toiletMg1: c.toilet_mg1, toiletMg2: c.toilet_mg2, tukarMg1: c.tukar_lantai_mg1, tukarMg2: c.tukar_lantai_mg2,
});

// ---------- §176 tugas harian per orang (pola Toilet / Area Lain + ketidakhadiran) ----------
/** Pemegang toilet minggu itu (pilihan admin; bawaan anggota pertama Zona Publik minggu itu). */
export const toiletMinggu = (c: UjiPolaZona, tanggal: string) => {
  const pk = paketBerlaku(c);
  return pk ? pemegangPada(pk, tanggal).TOILET : susunanUntuk(c, tanggal).toilet;
};
export const tidakHadirPada = (c: UjiPolaZona | null, tanggal: string): string[] => c?.tidak_hadir?.[tanggal] || [];
/** §179 urutan anggota Zona Tenant minggu itu: urutan menentukan lantai pagi & pelayanan (orang ke-1 = lantai
 *  terberat pertama). "Tukar lantai" membalik urutan supaya lantai bergilir antar periode. */
export const tukarLantai = (tenant: string[], tukar: boolean) => (tukar ? [...tenant].reverse() : tenant);
export const tenantMinggu = (c: UjiPolaZona, tanggal: string) => susunanUntuk(c, tanggal).tenant;
/** Senin pekan tanggal tsb. */
export const seninPekan = (iso: string) => tambahHari(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

/** Rencana tugas hari itu untuk semua peserta (null = di luar uji coba / akhir pekan). */
export function rencanaUntuk(c: UjiPolaZona | null, tanggal: string, lantai: LantaiOk[]): RencanaHari | null {
  if (!c || !dalamUjiCoba(c, tanggal) || akhirPekan(tanggal)) return null;
  const pk = paketBerlaku(c);
  if (pk) {
    // §182 paket tetap: pemegang pekan itu + isi paket (tidak bergantung luas Okupansi -> sama di semua halaman)
    const h = pemegangPada(pk, tanggal);
    const { isi } = isiPaket(pk, c.area_tenant, c.area_publik, c.mingguan);
    const tetap = Object.fromEntries((["T1", "T2", "TOILET", "LAIN"] as const).filter((k) => h[k]).map((k) => [h[k].trim().toLowerCase(), isi[k]]));
    return rencanaHari({
      tenant: [h.T1, h.T2].filter(Boolean), publik: [h.TOILET, h.LAIN].filter(Boolean), toilet: h.TOILET,
      areaTenant: c.area_tenant, areaPublik: c.area_publik, luas: c.luas_area, mingguan: c.mingguan, lantai,
      tidakHadir: tidakHadirPada(c, tanggal), pagiBersama: c.pagi_bersama, cadangan: c.cadangan_publik, jamCadangan: c.jam_cadangan, tetap,
    });
  }
  return rencanaHari({
    tenant: tenantMinggu(c, tanggal), publik: anggotaZona(c, "Publik", tanggal), toilet: toiletMinggu(c, tanggal),
    areaTenant: c.area_tenant, areaPublik: c.area_publik, luas: c.luas_area, mingguan: c.mingguan, lantai,
    tidakHadir: tidakHadirPada(c, tanggal), pagiBersama: c.pagi_bersama, cadangan: c.cadangan_publik, jamCadangan: c.jam_cadangan,
  });
}
/** Cadangan pelayanan hari itu = pemegang Area Lain (jam diperpanjang bila Zona Tenant kurang orang). */
export function cadanganHariIni(c: UjiPolaZona | null, tanggal: string): { nama: string; jam: string } | null {
  const o = rencanaUntuk(c, tanggal, [])?.orang.find((x) => x.cadangan);
  return o ? { nama: o.nama, jam: o.cadangan! } : null;
}
/** Jam "11.00–14.00" -> apakah sekarang (menit WITA) di dalam rentang. */
export function dalamJam(rentang: string, menitSekarang: number): boolean {
  const m = /(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})/.exec(rentang);
  if (!m) return false;
  const a = Number(m[1]) * 60 + Number(m[2]), b = Number(m[3]) * 60 + Number(m[4]);
  return menitSekarang >= a && menitSekarang < b;
}
/** Panjang rentang jam dalam jam (untuk kapasitas cadangan). */
export function lamaJam(rentang: string): number {
  const m = /(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})/.exec(rentang);
  return m ? Math.max(0, (Number(m[3]) * 60 + Number(m[4]) - Number(m[1]) * 60 - Number(m[2])) / 60) : 0;
}

// ---------- Daftar area bawaan (bisa diubah admin di halaman uji coba) ----------
interface UnitOkupansi { nama?: string; tenant?: string; status?: string }
interface LantaiOkupansi { nama?: string; unit?: UnitOkupansi[] }

/** Zona Tenant (§186): tiap unit terisi di Okupansi + luasnya ("Lantai 3 · SAG | 50"); tanpa data -> "Ruang tenant Lantai 1..4". */
export function areaTenantBawaan(lantai: LantaiOkupansi[] | undefined): string[] {
  const ruang = barisAreaTenant(ruangTenantOkupansi(lantai));
  if (ruang.length) return ruang;
  return ["Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4"].map((l) => `Ruang tenant ${l}`);
}

/**
 * §186 Samakan area_tenant pola zona dengan Okupansi (dipanggil saat Okupansi disimpan & dari admin Pola Zona).
 * Paket pagi ikut diselaraskan (nama lama yang cocok dipertahankan). Mengembalikan true bila ada perubahan.
 */
export async function sinkronAreaTenantZona(lantai: LantaiOkupansi[] | undefined): Promise<boolean> {
  const ruang = ruangTenantOkupansi(lantai);
  if (!ruang.length) return false;
  const snap = await getDoc(DOC_UJI_POLA());
  const d = snap.data();
  if (!d) return false;
  const baris = barisAreaTenant(ruang);
  const lama = Array.isArray(d.area_tenant) ? (d.area_tenant as string[]).map(String) : [];
  // pertahankan penanda "| mingguan" bila ada di baris lama yang sama
  const mingguan = new Set(lama.filter((x) => /\|\s*mingguan/i.test(x)).map((x) => x.split("|")[0].trim()));
  const final = baris.map((b) => (mingguan.has(b.split("|")[0].trim()) ? `${b} | mingguan` : b));
  const paket = rapikanPaket(d.paket_zona);
  const pagiBaru = paket ? selaraskanPagi(paket, ruang) : null;
  // §187 pelayanan per lantai juga ikut Okupansi (lantai kosong dilepas, lantai baru ke paket Tenant yang lebih ringan)
  const pelayananBaru = paket ? selaraskanPelayanan(paket, ruang) : null;
  const samaArea = JSON.stringify(final) === JSON.stringify(lama);
  const samaPagi = !paket || (JSON.stringify(pagiBaru) === JSON.stringify(paket.pagi) && JSON.stringify(pelayananBaru) === JSON.stringify(paket.pelayanan));
  if (samaArea && samaPagi) return false;
  await updateDoc(DOC_UJI_POLA(), { area_tenant: final, ...(paket ? { paket_zona: { ...paket, pagi: pagiBaru, pelayanan: pelayananBaru } } : {}) });
  return true;
}

/** Zona Publik: segmen SOP checklist (kecuali ruang kerja = wilayah tenant & pelayanan) + lobby & koridor. */
export function areaPublikBawaan(master: AreaChecklist[] = CHECKLIST_OB_BAWAAN): string[] {
  const daftar: string[] = ["Lobby", "Koridor & lift semua lantai"];
  master.filter((a) => !a.area.toLowerCase().includes("pelayanan")).forEach((a) => {
    a.segmen.filter((s) => s.aktif !== false && !/ruang kerja/i.test(s.nama)).forEach((s) => daftar.push(`${a.area} · ${s.nama}`));
  });
  return Array.from(new Set(daftar));
}

function rapikanTidakHadir(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (v && typeof v === "object") Object.entries(v as Record<string, unknown>).forEach(([k, x]) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(x) && x.length) out[k] = x.map(String).filter(Boolean);
  });
  return out;
}

export function rapikanConfig(d: Record<string, unknown> | undefined): UjiPolaZona | null {
  if (!d || typeof d.mulai !== "string") return null;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  return {
    aktif: d.aktif === true,
    mulai: d.mulai,
    tukar_mulai: String(d.tukar_mulai || tambahHari(d.mulai, 7)),
    selesai: String(d.selesai || tambahHari(d.mulai, 11)),
    tim_tenant: arr(d.tim_tenant),
    tim_publik: arr(d.tim_publik),
    // §174 baris "Area | luas" -> label bersih + luas manual (disimpan apa adanya di Firestore)
    area_tenant: uraiArea(arr(d.area_tenant)).area,
    area_publik: uraiArea(arr(d.area_publik)).area,
    luas_area: { ...uraiArea(arr(d.area_tenant)).luas, ...uraiArea(arr(d.area_publik)).luas },
    mingguan: [...uraiArea(arr(d.area_tenant)).mingguan, ...uraiArea(arr(d.area_publik)).mingguan],
    pagi_bersama: d.pagi_bersama !== false, jam_pagi: String(d.jam_pagi || "07.00–09.00"),
    cadangan_publik: d.cadangan_publik !== false, jam_cadangan: String(d.jam_cadangan || "11.00–14.00"),
    min_ronde: Math.max(1, Number(d.min_ronde) || 1),
    toilet_mg1: String(d.toilet_mg1 || ""), toilet_mg2: String(d.toilet_mg2 || ""),
    tukar_lantai_mg1: d.tukar_lantai_mg1 === true, tukar_lantai_mg2: d.tukar_lantai_mg2 === true,
    rotasi: d.rotasi === "tetap" ? "tetap" : "mingguan",
    permanen: d.permanen === true,
    paket_zona: rapikanPaket(d.paket_zona),
    tidak_hadir: rapikanTidakHadir(d.tidak_hadir),
    dibuat_oleh: typeof d.dibuat_oleh === "string" ? d.dibuat_oleh : "",
    waktu_update: (d.waktu_update as Timestamp) || null,
  };
}

/** Konfigurasi uji coba (live). dimuat=false selama belum terbaca. */
export function useUjiPolaZona() {
  const [config, setConfig] = useState<UjiPolaZona | null>(null);
  const [dimuat, setDimuat] = useState(false);
  useEffect(() => onSnapshot(DOC_UJI_POLA(), (s) => { setConfig(rapikanConfig(s.data())); setDimuat(true); }, (e) => {
    console.error("[pola-zona]", e); setDimuat(true);
  }), []);
  return { config, dimuat };
}
