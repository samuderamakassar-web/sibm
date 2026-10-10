// Permintaan Pelayanan OB (§122) -- karyawan minta lewat portal, OB terima & selesaikan di Dashboard OB.
// Mengukur beban OB pelayanan dengan data nyata (jumlah permintaan & waktu respon) untuk halaman Beban Kerja.
//   permintaan_pelayanan/{id} { jenis, lokasi, jumlah, catatan, nama_pemohon, departemen, status: Baru|Diproses|Selesai|Batal,
//                               waktu_minta, waktu_terima, diterima_oleh, waktu_selesai }

import type { Timestamp } from "firebase/firestore";

// §124 tim: OB = pelayanan (beban OB), CS = cleaning sesuai permintaan (sinyal beban CS)
export type TimPelayanan = "OB" | "CS";
export const JENIS_PELAYANAN = [
  { key: "minuman", label: "Minuman (kopi / teh / air)", menit: 10, tim: "OB" },
  { key: "meeting", label: "Persiapan / beres ruang meeting", menit: 25, tim: "OB" },
  { key: "dokumen", label: "Antar / ambil dokumen", menit: 15, tim: "OB" },
  { key: "lainnya", label: "Lainnya", menit: 15, tim: "OB" },
  { key: "bersih", label: "Tumpahan / lantai kotor", menit: 10, tim: "CS" },
  { key: "sampah", label: "Tempat sampah penuh", menit: 10, tim: "CS" },
  { key: "toilet", label: "Toilet kotor / sabun & tisu habis", menit: 15, tim: "CS" },
  { key: "ruangan", label: "Bersihkan ruangan / meja", menit: 20, tim: "CS" },
  { key: "lainnya_cs", label: "Cleaning lainnya", menit: 15, tim: "CS" },
] as const;
export type JenisPelayanan = (typeof JENIS_PELAYANAN)[number]["key"];
export const labelJenis = (k: string) => JENIS_PELAYANAN.find((j) => j.key === k)?.label || k;
export const menitJenis = (k: string) => JENIS_PELAYANAN.find((j) => j.key === k)?.menit || 15;
export const timJenis = (k: string): TimPelayanan => JENIS_PELAYANAN.find((j) => j.key === k)?.tim || "OB";

export type StatusPelayanan = "Baru" | "Diproses" | "Selesai" | "Batal";
export interface PermintaanPelayanan {
  id: string; jenis: JenisPelayanan; lokasi: string; jumlah?: number; catatan?: string;
  nama_pemohon: string; departemen?: string; status: StatusPelayanan;
  waktu_minta?: Timestamp | null; waktu_terima?: Timestamp | null; diterima_oleh?: string; waktu_selesai?: Timestamp | null;
}
export const LOKASI_PELAYANAN = ["Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Ruang Meeting Lt 1", "Ruang Meeting Lt 3", "Lobby", "Pantry"];
