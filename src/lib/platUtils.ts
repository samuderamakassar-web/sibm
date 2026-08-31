// Menormalkan nomor plat biar perbandingan "DD 1234 AB" vs "dd1234ab" vs "DD-1234-AB"
// tetap dianggap sama — dipakai buat mencocokkan Karyawan <-> Kendaraan via plat nomor
// (sinkronisasi otomatis Buku Tamu Digital <-> Log Operasional Gerbang).
export function normalizePlat(plat: string): string {
  return (plat || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
