/**
 * Daftar Aset terpadu (§167) + As-Built Drawing (§168).
 *
 * aset_gedung/{id}  (aset yang belum punya register sendiri: utilitas, AC, IT, furniture, ...)
 *   { kode, nama, kategori, jenis, merek_tipe, no_seri, lokasi, pemilik, pic, tanggal_perolehan, nilai_perolehan,
 *     umur_ekonomis_tahun, status, interval_bulan (0 = tidak rutin), peremajaan_terakhir, riwayat[], catatan, daerah }
 * Register lama tetap di tempatnya & ikut tampil (baca saja) di daftar gabungan:
 *   master_laptop (sewa), master_kendaraan (+ kendaraan_service_logs), apar_units, aset_alat.
 *
 * asbuilt_gambar/{id}  1 dokumen = 1 sheet gambar; revisi_aktif = versi berlaku, riwayat[] = versi lama.
 *   { disiplin, lantai, nomor_sheet, judul, kunci, revisi_aktif{rev,tanggal,file_path,file_nama,catatan,oleh}, riwayat[], daerah }
 *   Upload set baru dicocokkan ke sheet lama lewat nomor sheet / nama file -> otomatis menggantikan revisi aktif,
 *   versi lama tetap tersimpan & bisa dibandingkan. File di Firebase Storage asbuilt/** (khusus Admin GA).
 */

import { getBlob, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

// ===================== Aset =====================
export const KATEGORI_ASET = ["Utilitas Gedung", "AC & Tata Udara", "Elektronik & IT", "Keselamatan & Keamanan", "Furniture", "Peralatan Kantor", "Lainnya"] as const;
export const STATUS_ASET = ["Aktif", "Dalam perbaikan", "Rusak", "Disposal", "Dimusnahkan"] as const;
export type StatusAset = (typeof STATUS_ASET)[number];
export const WARNA_STATUS_ASET: Record<string, { bg: string; fg: string }> = {
  Aktif: { bg: "var(--ok-50)", fg: "var(--ok)" },
  "Dalam perbaikan": { bg: "var(--info-50)", fg: "var(--info)" },
  Rusak: { bg: "var(--warn-50)", fg: "var(--warn)" },
  Disposal: { bg: "var(--line)", fg: "var(--ink-soft)" },
  Dimusnahkan: { bg: "var(--line)", fg: "var(--muted)" },
  Sewa: { bg: "var(--info-50)", fg: "var(--info)" },
};
export const JENIS_PEREMAJAAN = ["Servis rutin", "Perbaikan", "Ganti part", "Overhaul", "Kalibrasi / uji", "Pembersihan"] as const;

/** Usulan interval peremajaan (bulan) per jenis aset -- dipakai saat jenis diketik, tetap bisa diubah. */
export const INTERVAL_USULAN: { pola: RegExp; bulan: number; kategori: string }[] = [
  { pola: /\bac\b|split|cassette|vrv|vrf|chiller|ahu|fcu/i, bulan: 3, kategori: "AC & Tata Udara" },
  { pola: /genset|generator/i, bulan: 12, kategori: "Utilitas Gedung" },
  { pola: /pompa|pump/i, bulan: 6, kategori: "Utilitas Gedung" },
  { pola: /panel|lvmdp|sdp|trafo|ups/i, bulan: 12, kategori: "Utilitas Gedung" },
  { pola: /lift|elevator|eskalator/i, bulan: 1, kategori: "Utilitas Gedung" },
  { pola: /tank|tandon|stp|ipal|wtp/i, bulan: 6, kategori: "Utilitas Gedung" },
  { pola: /fire alarm|hydrant|sprinkler|mcfa/i, bulan: 6, kategori: "Keselamatan & Keamanan" },
  { pola: /cctv|access|door lock/i, bulan: 6, kategori: "Keselamatan & Keamanan" },
  { pola: /printer|komputer|pc\b|server|switch|router|proyektor/i, bulan: 12, kategori: "Elektronik & IT" },
];
export function usulanInterval(jenis: string) { return INTERVAL_USULAN.find((x) => x.pola.test(jenis)) || null; }

export interface RiwayatPeremajaan { tanggal: string; jenis: string; uraian: string; vendor?: string; biaya?: number; oleh: string }
export interface AsetGedung {
  id: string; kode: string; nama: string; kategori: string; jenis: string; merek_tipe?: string; no_seri?: string;
  lokasi?: string; pemilik?: string; pic?: string; tanggal_perolehan?: string; nilai_perolehan?: number;
  umur_ekonomis_tahun?: number; status: StatusAset; interval_bulan?: number; peremajaan_terakhir?: string;
  riwayat?: RiwayatPeremajaan[]; catatan?: string;
}

export const tambahBulanIso = (iso: string, bulan: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + bulan, 1));
  const akhir = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, akhir)).padStart(2, "0")}`;
};
export const selisihHari = (dari: string, ke: string) => Math.round((new Date(`${ke}T12:00:00Z`).getTime() - new Date(`${dari}T12:00:00Z`).getTime()) / 864e5);

/** Jatuh tempo peremajaan berikutnya (null bila tidak rutin / belum ada tanggal dasar). */
export function jatuhTempo(a: Pick<AsetGedung, "interval_bulan" | "peremajaan_terakhir" | "tanggal_perolehan">): string | null {
  const dasar = a.peremajaan_terakhir || a.tanggal_perolehan;
  return a.interval_bulan && a.interval_bulan > 0 && dasar ? tambahBulanIso(dasar, a.interval_bulan) : null;
}
/** Umur ekonomis habis -> kandidat penggantian. */
export function umurHabis(a: Pick<AsetGedung, "umur_ekonomis_tahun" | "tanggal_perolehan">, hari: string): boolean {
  return !!(a.umur_ekonomis_tahun && a.tanggal_perolehan && tambahBulanIso(a.tanggal_perolehan, a.umur_ekonomis_tahun * 12) <= hari);
}
export const PREFIX_KATEGORI: Record<string, string> = {
  "Utilitas Gedung": "UTL", "AC & Tata Udara": "AC", "Elektronik & IT": "IT", "Keselamatan & Keamanan": "SAF",
  Furniture: "FUR", "Peralatan Kantor": "KTR", Lainnya: "LN",
};

// ===================== As-Built Drawing =====================
export const DISIPLIN_GAMBAR = ["Arsitektur", "Struktur", "Elektrikal", "Plumbing", "Tata Udara (HVAC)", "Fire Protection", "Elektronik (CCTV/Data/Sound)", "Site / Lansekap", "Lainnya"] as const;
export const MAX_FILE_GAMBAR_MB = 50;

export interface RevisiGambar { rev: number; tanggal: string; file_path: string; file_nama: string; catatan: string; oleh: string }
export interface GambarAsBuilt {
  id: string; disiplin: string; lantai: string; nomor_sheet: string; judul: string; kunci: string;
  revisi_aktif: RevisiGambar; riwayat?: RevisiGambar[];
}

/** Nomor sheet dari nama file, mis. "AR-101_Denah Lt1 rev2.pdf" -> "AR-101". */
export function nomorSheetDari(nama: string): string {
  const dasar = nama.replace(/\.[^.]+$/, "");
  const m = dasar.match(/\b([A-Za-z]{1,4})[\s._-]?(\d{1,4}[A-Za-z]?)\b/);
  return m ? `${m[1].toUpperCase()}-${m[2].toUpperCase()}` : "";
}
/** Judul bersih: tanpa nomor sheet, penanda revisi/versi/tanggal & ekstensi. */
export function judulDari(nama: string): string {
  return nama.replace(/\.[^.]+$/, "")
    .replace(/\b([A-Za-z]{1,4})[\s._-]?(\d{1,4}[A-Za-z]?)\b/, "")
    .replace(/[\s._-]*(rev(isi)?|r|v|ver)[\s._-]?\d+\b/gi, "")
    .replace(/\b(19|20)\d{2}[-_.]?\d{2}([-_.]?\d{2})?\b/g, "")
    .replace(/[_]+/g, " ").replace(/\s{2,}/g, " ").replace(/^[\s-]+|[\s-]+$/g, "").trim();
}
/** Kunci pencocokan sheet lama vs file baru: nomor sheet bila ada, selain itu judul ternormalisasi. */
export function kunciGambar(nomor: string, judul: string, disiplin = "", lantai = ""): string {
  if (nomor) return `no:${nomor.toUpperCase()}`;
  return `jd:${disiplin}|${lantai}|${judul.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}
/** Tebak disiplin dari prefix nomor sheet. */
export function tebakDisiplin(nomor: string): string {
  const p = nomor.split("-")[0];
  if (/^(A|AR|ARS)$/.test(p)) return "Arsitektur";
  if (/^(S|ST|STR)$/.test(p)) return "Struktur";
  if (/^(E|EL|ME|ML)$/.test(p)) return "Elektrikal";
  if (/^(P|PL|PB)$/.test(p)) return "Plumbing";
  if (/^(M|MH|AC|HV|HVAC)$/.test(p)) return "Tata Udara (HVAC)";
  if (/^(F|FP|FA|FH)$/.test(p)) return "Fire Protection";
  if (/^(EL|LV|CC|EC)$/.test(p)) return "Elektronik (CCTV/Data/Sound)";
  return "";
}
const TIPE_GAMBAR: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  dwg: "application/acad", dxf: "application/dxf",
};
export const ekstensiGambar = (nama: string) => (nama.split(".").pop() || "").toLowerCase();
export const bisaPratinjau = (nama: string) => ["pdf", "png", "jpg", "jpeg", "webp"].includes(ekstensiGambar(nama));

export async function unggahGambar(file: File, folder: string): Promise<{ path: string; nama: string }> {
  if (file.size > MAX_FILE_GAMBAR_MB * 1024 * 1024) throw new Error(`${file.name}: terlalu besar (maks ${MAX_FILE_GAMBAR_MB} MB).`);
  const eks = ekstensiGambar(file.name);
  if (!TIPE_GAMBAR[eks]) throw new Error(`${file.name}: format tidak didukung (PDF, gambar, DWG, DXF).`);
  const bersih = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `asbuilt/${folder.replace(/[^\w-]+/g, "_") || "umum"}/${Date.now()}_${bersih}`;
  try {
    await uploadBytes(ref(storage, path), file, { contentType: TIPE_GAMBAR[eks] });
  } catch (e) {
    const kode = (e as { code?: string }).code || "";
    throw new Error(kode.includes("unauthorized") ? "Tidak berhak mengunggah (khusus Admin GA)." : `${file.name}: gagal diunggah.`);
  }
  return { path, nama: file.name };
}
/** URL blob sementara (file privat, lewat rules Storage). Panggil URL.revokeObjectURL setelah selesai. */
export async function urlGambar(path: string): Promise<string> {
  return URL.createObjectURL(await getBlob(ref(storage, path)));
}
