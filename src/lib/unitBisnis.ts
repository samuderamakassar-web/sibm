// Daftar resmi 11 unit bisnis (PT) dalam grup — dipakai sebagai pilihan dropdown
// di semua form yang sebelumnya isi manual (Master Data Karyawan, Master Data Kendaraan,
// Buku Tamu Digital - Magang). Nama SELALU pakai prefix "PT" di depan.
export const DAFTAR_UNIT_BISNIS = [
  "PT Samudera Indonesia",
  "PT Samudera Agencies Indonesia",
  "PT Silkargo Indonesia",
  "PT Samudera Makassar Logistik",
  "PT Asuransi Bintang",
  "PT Perusahaan Pelayaran Nusantara Panurjwan",
  "PT Makassar Jaya Samudera",
  "PT Kendari Jaya Samudera",
  "PT Samudera Kendari Logistik",
  "PT Masaji Kargosentra Tama",
  "PT PAD Samudera Perdana",
];

// Kategori internal gedung — buat staf yang bekerja langsung di bawah Building Management/GA
// (bukan staf salah satu PT tenant), pakai label yang SAMA PERSIS dengan enum departemen di
// users_master (dipakai role/auth di useAuthGuard) biar konsisten di seluruh sistem.
export const DAFTAR_DEPARTEMEN_INTERNAL = [
  "Admin GA",
  "Management",
  "OB & CS",
  "Security",
  "Driver",
  "QHSE",
];
