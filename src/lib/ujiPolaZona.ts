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
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { CHECKLIST_OB_BAWAAN, type AreaChecklist } from "./sopChecklist";
import { uraiArea, type LantaiOk } from "./bagiZona";
import { pemegangToilet, rencanaHari, type RencanaHari } from "./rencanaZona";

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
  // §176 ketidakhadiran per tanggal (ditandai Admin) -> tugas hari itu dibagi ulang otomatis
  tidak_hadir: Record<string, string[]>;
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

export const dalamUjiCoba = (c: UjiPolaZona | null, tanggal: string) => !!c && c.aktif && tanggal >= c.mulai && tanggal <= c.selesai;
export const mingguKe = (c: UjiPolaZona, tanggal: string): 1 | 2 => (tanggal >= c.tukar_mulai ? 2 : 1);

/** Zona staf pada tanggal tsb (null = tidak ikut uji coba / di luar periode). */
export function zonaUntuk(c: UjiPolaZona | null, nama: string, tanggal: string): Zona | null {
  if (!c || !dalamUjiCoba(c, tanggal)) return null;
  const n = nama.trim().toLowerCase();
  const diTenant = c.tim_tenant.some((x) => x.trim().toLowerCase() === n);
  const diPublik = c.tim_publik.some((x) => x.trim().toLowerCase() === n);
  if (!diTenant && !diPublik) return null;
  const awal: Zona = diTenant ? "Tenant" : "Publik";
  return mingguKe(c, tanggal) === 1 ? awal : awal === "Tenant" ? "Publik" : "Tenant";
}

/** Anggota zona pada tanggal tsb. */
export function anggotaZona(c: UjiPolaZona, zona: Zona, tanggal: string): string[] {
  const m1 = zona === "Tenant" ? c.tim_tenant : c.tim_publik;
  const m2 = zona === "Tenant" ? c.tim_publik : c.tim_tenant;
  return mingguKe(c, tanggal) === 1 ? m1 : m2;
}

// ---------- §176 tugas harian per orang (pola Toilet / Area Lain + ketidakhadiran) ----------
/** Pemegang toilet minggu itu (pilihan admin; bawaan anggota pertama Zona Publik minggu itu). */
export const toiletMinggu = (c: UjiPolaZona, tanggal: string) =>
  pemegangToilet(anggotaZona(c, "Publik", tanggal), mingguKe(c, tanggal) === 1 ? c.toilet_mg1 : c.toilet_mg2);
export const tidakHadirPada = (c: UjiPolaZona | null, tanggal: string): string[] => c?.tidak_hadir?.[tanggal] || [];

/** Rencana tugas hari itu untuk semua peserta (null = di luar uji coba / akhir pekan). */
export function rencanaUntuk(c: UjiPolaZona | null, tanggal: string, lantai: LantaiOk[]): RencanaHari | null {
  if (!c || !dalamUjiCoba(c, tanggal) || akhirPekan(tanggal)) return null;
  return rencanaHari({
    tenant: anggotaZona(c, "Tenant", tanggal), publik: anggotaZona(c, "Publik", tanggal), toilet: toiletMinggu(c, tanggal),
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

/** Zona Tenant: tiap tenant per lantai dari Okupansi; tanpa data -> "Ruang tenant Lantai 1..4". */
export function areaTenantBawaan(lantai: LantaiOkupansi[] | undefined): string[] {
  const daftar = new Set<string>();
  (lantai || []).forEach((l) => (l.unit || []).forEach((u) => {
    if (u.status === "terisi" && u.tenant) daftar.add(`${l.nama || "Lantai ?"} · ${u.tenant}`);
  }));
  if (daftar.size) return Array.from(daftar).sort();
  return ["Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4"].map((l) => `Ruang tenant ${l}`);
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
    console.error("[uji-pola-zona]", e); setDimuat(true);
  }), []);
  return { config, dimuat };
}
