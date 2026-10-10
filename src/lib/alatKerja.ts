// Register alat kerja OB & CS dengan PIC (§116, Tahap 1 pengetatan).
// Tiap alat punya kode (mis. VAC-01) & SATU pemegang yang bertanggung jawab penuh (dibawa sendiri saat pindah
// lantai). §127: tanpa serah terima/konfirmasi -- Koordinator/Admin cukup "Ganti PIC" (resign/mutasi). Rusak/hilang dicatat
// dengan kronologi atas nama pemegang. Inspeksi Peralatan Kebersihan memakai alat milik pemegang sendiri.
// Label: QR dicetak dari halaman alat, ATAU cukup tulis kode di label nama biasa (pemilihan alat via daftar).
//   aset_alat/{id} { kode, nama, kategori, pemegang, status, dikonfirmasi, foto, catatan, kondisi_terakhir,
//                     foto_terakhir, inspeksi_terakhir, riwayat[] }

import type { Timestamp } from "firebase/firestore";

export type StatusAlat = "Aktif" | "Rusak" | "Hilang" | "Afkir";
export const STATUS_ALAT: StatusAlat[] = ["Aktif", "Rusak", "Hilang", "Afkir"];
export const WARNA_STATUS_ALAT: Record<StatusAlat, { bg: string; fg: string }> = {
  Aktif: { bg: "var(--ok-50)", fg: "var(--ok)" },
  Rusak: { bg: "var(--warn-50)", fg: "var(--warn)" },
  Hilang: { bg: "var(--red-50)", fg: "var(--red-600)" },
  Afkir: { bg: "var(--line)", fg: "var(--muted)" },
};
export const KATEGORI_ALAT = ["Alat kebersihan", "Mesin / elektrik", "Perlengkapan", "Lainnya"];
export const PEMEGANG_GUDANG = "Gudang OB";

export interface RiwayatAlat { waktu: Timestamp; aksi: string; dari?: string; ke?: string; oleh: string; catatan?: string }
export interface AlatKerja {
  id: string; kode: string; nama: string; kategori: string; pemegang: string; status: StatusAlat;
  dikonfirmasi?: boolean; foto?: string; catatan?: string;
  kondisi_terakhir?: string; foto_terakhir?: string; inspeksi_terakhir?: Timestamp | null;
  riwayat?: RiwayatAlat[];
}

/** Prefix kode dari nama alat, mis. "Vacuum cleaner" -> "VAC", "Mop / pel" -> "MOP". */
export function prefixKode(nama: string): string {
  const peta: [RegExp, string][] = [[/vacuum/i, "VAC"], [/polish/i, "POL"], [/mop|pel\b/i, "MOP"], [/ember/i, "EMB"], [/sapu/i, "SPU"], [/trolley|troli/i, "TRL"], [/wiper|kaca/i, "WPR"], [/sikat/i, "SKT"], [/tangga/i, "TGA"], [/sign|rambu/i, "SGN"], [/microfiber|lap/i, "LAP"]];
  const cocok = peta.find(([r]) => r.test(nama));
  if (cocok) return cocok[1];
  const huruf = nama.replace(/[^A-Za-z ]/g, "").trim().split(/\s+/).map((w) => w[0]).join("").toUpperCase();
  return (huruf.length >= 2 ? huruf : nama.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()).slice(0, 3) || "ALT";
}
export function kodeBerikut(nama: string, semua: Pick<AlatKerja, "kode">[]): string {
  const pre = prefixKode(nama);
  const n = semua.filter((a) => a.kode.startsWith(`${pre}-`)).map((a) => Number(a.kode.split("-").pop()) || 0);
  return `${pre}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(2, "0")}`;
}
