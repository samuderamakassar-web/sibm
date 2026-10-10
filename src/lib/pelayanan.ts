// Permintaan Pelayanan OB (§122) -- karyawan minta lewat portal, OB terima & selesaikan di Dashboard OB.
// Mengukur beban OB pelayanan dengan data nyata (jumlah permintaan & waktu respon) untuk halaman Beban Kerja.
//   permintaan_pelayanan/{id} { jenis, lokasi, jumlah, catatan, nama_pemohon, departemen, status: Baru|Diproses|Selesai|Batal,
//                               waktu_minta, waktu_terima, diterima_oleh, waktu_selesai }

import type { Timestamp } from "firebase/firestore";

export const JENIS_PELAYANAN = [
  { key: "minuman", label: "Minuman (kopi / teh / air)", menit: 10 },
  { key: "meeting", label: "Persiapan / beres ruang meeting", menit: 25 },
  { key: "dokumen", label: "Antar / ambil dokumen", menit: 15 },
  { key: "bersih", label: "Bersih cepat (tumpahan, sampah)", menit: 10 },
  { key: "lainnya", label: "Lainnya", menit: 15 },
] as const;
export type JenisPelayanan = (typeof JENIS_PELAYANAN)[number]["key"];
export const labelJenis = (k: string) => JENIS_PELAYANAN.find((j) => j.key === k)?.label || k;
export const menitJenis = (k: string) => JENIS_PELAYANAN.find((j) => j.key === k)?.menit || 15;

export type StatusPelayanan = "Baru" | "Diproses" | "Selesai" | "Batal";
export interface PermintaanPelayanan {
  id: string; jenis: JenisPelayanan; lokasi: string; jumlah?: number; catatan?: string;
  nama_pemohon: string; departemen?: string; status: StatusPelayanan;
  waktu_minta?: Timestamp | null; waktu_terima?: Timestamp | null; diterima_oleh?: string; waktu_selesai?: Timestamp | null;
}
export const LOKASI_PELAYANAN = ["Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Ruang Meeting Lt 1", "Ruang Meeting Lt 3", "Lobby", "Pantry"];
