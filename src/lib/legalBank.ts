// Bank Dokumen Legal multi-perusahaan (§143) -- koleksi `master_legalitas` (nama lama dipertahankan agar
// pengingat scripts/legalitas-reminder.mjs & hitungan admin tetap jalan).
//   Perusahaan (pt[], bisa >1 PT) -> Kategori -> Dokumen (riwayat versi).
//   Kode arsip  : <KODE PT>-<KODE KATEGORI>-<TAHUN>-<NO URUT 3 DIGIT>, mis. MJS-PRJ-2026-003 (tulis juga di map fisik).
//   File        : Firebase Storage legal/<kode arsip>/... (hanya Admin GA, lihat storage.rules) -- dibuka lewat getBlob
//                 (lewat rules, tanpa link publik). Data lama (Cloudinary, file_url) tetap bisa dibuka.
//   Eksekutif Tenant: hanya daftar (tanpa file) untuk PT miliknya (users_master.unit_bisnis ada di pt[]), lihat firestore.rules.

import { getBlob, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

export interface PerusahaanLegal { kode: string; nama: string }
/** Perusahaan yang dipegang (keputusan user 14 Okt 2026). Nama sama persis dengan DAFTAR_UNIT_BISNIS. */
export const PERUSAHAAN_LEGAL: PerusahaanLegal[] = [
  { kode: "MJS", nama: "PT Makassar Jaya Samudera" },
  { kode: "SML", nama: "PT Samudera Makassar Logistik" },
  { kode: "KEJS", nama: "PT Kendari Jaya Samudera" },
  { kode: "SKEL", nama: "PT Samudera Kendari Logistik" },
  { kode: "SAG", nama: "PT Samudera Agencies Indonesia" },
  { kode: "SP", nama: "PT PAD Samudera Perdana" },
  { kode: "SKI", nama: "PT Silkargo Indonesia" },
  { kode: "MKT", nama: "PT Masaji Kargosentra Tama" },
  { kode: "SPI", nama: "PT Samudera Properti Indonesia" },
];
export const PT_BELUM = "Belum ditentukan";
/** Kode PT: daftar resmi, selain itu 3 huruf awal kata (PT Lainnya yang diketik). */
export function kodePT(nama: string): string {
  const resmi = PERUSAHAAN_LEGAL.find((p) => p.nama.toLowerCase() === nama.trim().toLowerCase());
  if (resmi) return resmi.kode;
  const huruf = nama.replace(/^PT\s+/i, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase();
  return (huruf || "LN").slice(0, 4);
}

export type KategoriLegal = "LGL" | "IZN" | "PRJ" | "BA" | "SRU" | "KSA" | "POL" | "SRM";
export const KATEGORI_LEGAL: { kode: KategoriLegal; label: string; contoh: string; masaBerlaku: boolean }[] = [
  { kode: "LGL", label: "Legalitas Perusahaan", contoh: "Akta pendirian & perubahan, SK Kemenkumham, NIB, NPWP, PKP", masaBerlaku: false },
  { kode: "IZN", label: "Perizinan", contoh: "Izin usaha, PBG/SLF, izin lingkungan, reklame", masaBerlaku: true },
  { kode: "PRJ", label: "Perjanjian / Kontrak", contoh: "Sewa, vendor, kerja sama", masaBerlaku: true },
  { kode: "BA", label: "Berita Acara", contoh: "Serah terima, pemeriksaan, opname", masaBerlaku: false },
  { kode: "SRU", label: "Sertifikat & Riksa Uji", contoh: "K3, SLO, riksa uji lift/genset/hydrant", masaBerlaku: true },
  { kode: "KSA", label: "Surat Kuasa", contoh: "Kuasa pengurusan, kuasa direksi", masaBerlaku: true },
  { kode: "POL", label: "Polis Asuransi", contoh: "Polis gedung, kendaraan, aset", masaBerlaku: true },
  { kode: "SRM", label: "Surat Resmi", contoh: "Surat instansi, pemberitahuan, korespondensi", masaBerlaku: false },
];
export const labelKategori = (k?: string) => KATEGORI_LEGAL.find((x) => x.kode === k)?.label || "Lainnya";
/** Data lama (field jenis) -> kategori. */
export const kategoriDari = (d: { kategori?: string; jenis?: string }): KategoriLegal =>
  (d.kategori as KategoriLegal) || (d.jenis === "Perizinan" ? "IZN" : d.jenis === "Perjanjian" ? "PRJ" : "LGL");

export type RisikoLegal = "Kritis" | "Penting" | "Biasa";
export const RISIKO_LEGAL: RisikoLegal[] = ["Kritis", "Penting", "Biasa"];

export interface VersiLegal {
  tanggal_mulai: string; tanggal_berakhir: string; catatan: string; diupload_pada: string;
  file_url?: string;   // lama (Cloudinary)
  file_path?: string;  // §143 Firebase Storage
  nama_file?: string;
}
export interface DokumenLegal {
  id: string; nama_dokumen: string; jenis?: string;
  pt?: string[]; kategori?: KategoriLegal; kode_arsip?: string; nomor_dokumen?: string; tanggal_terbit?: string;
  tanpa_masa_berlaku?: boolean; penerbit?: string; pic?: string; lokasi_arsip?: string; risiko?: RisikoLegal;
  riwayat: VersiLegal[]; tanggal_mulai_aktif: string; tanggal_berakhir_aktif: string; catatan_aktif: string;
  file_url_aktif?: string; file_path_aktif?: string;
}

/** Kode arsip berikutnya untuk kombinasi PT + kategori + tahun. */
export function kodeArsipBerikut(ptUtama: string, kategori: KategoriLegal, tahun: string, semua: Pick<DokumenLegal, "kode_arsip">[]): string {
  const awal = `${kodePT(ptUtama)}-${kategori}-${tahun}-`;
  const no = semua.map((d) => d.kode_arsip || "").filter((k) => k.startsWith(awal)).map((k) => Number(k.slice(awal.length)) || 0);
  return `${awal}${String((no.length ? Math.max(...no) : 0) + 1).padStart(3, "0")}`;
}

export const MAX_FILE_LEGAL_MB = 20;
/** Unggah ke Firebase Storage (privat). Melempar Error berbahasa Indonesia bila gagal. */
export async function unggahFileLegal(file: File, kodeArsip: string): Promise<{ path: string; nama: string }> {
  if (file.size > MAX_FILE_LEGAL_MB * 1024 * 1024) throw new Error(`File terlalu besar (maks ${MAX_FILE_LEGAL_MB} MB).`);
  const bersih = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `legal/${kodeArsip || "tanpa-kode"}/${Date.now()}_${bersih}`;
  try {
    await uploadBytes(ref(storage, path), file, { contentType: file.type || "application/pdf" });
  } catch (e) {
    const kode = (e as { code?: string }).code || "";
    if (kode.includes("unauthorized")) throw new Error("Tidak berhak mengunggah (khusus Admin GA).");
    throw new Error("Penyimpanan file legal belum aktif / gagal. Pastikan Firebase Storage sudah diaktifkan.");
  }
  return { path, nama: file.name };
}
/** Buka file privat di tab baru (lewat rules Storage, tanpa link publik). */
export async function bukaFileLegal(v: { file_path?: string; file_url?: string }): Promise<void> {
  if (v.file_path) {
    const tab = window.open("", "_blank");
    const blob = await getBlob(ref(storage, v.file_path));
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  if (v.file_url) window.open(v.file_url, "_blank", "noopener");
}
