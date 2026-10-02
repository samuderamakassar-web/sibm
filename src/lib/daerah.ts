// Multi-daerah FASE 2 -- Tahap 1 (fondasi, §78). Satu tempat untuk menentukan "daerah" (wilayah/gedung)
// sebuah tulisan data. Tahap 1 hanya MENANDAI data baru dengan field `daerah` (+ migrasi data lama ke
// "Makassar"); cara aplikasi membaca data BELUM berubah. Filter baca, ID dokumen per daerah, cron per
// daerah & rules per daerah = tahap 2-4 (lihat analisis_project.md §78).
//
// Sumber daerah, berurutan:
//   1. Staf login dengan daerah biasa (pic_daerah, mis. "Makassar")       -> daerah akun itu.
//   2. Super Admin (pic_daerah = "PUSAT")                                  -> wilayah aktif pilihan di header.
//   3. Portal publik tanpa login                                           -> gedung dari link ?gedung=... (diingat di HP).
//   4. Selain itu                                                          -> DAERAH_DEFAULT.

export const DAERAH_DEFAULT = "Makassar";
export const DAERAH_PUSAT = "PUSAT";
const KUNCI_WILAYAH_AKTIF = "sibm_wilayah_aktif";
const KUNCI_GEDUNG = "sibm_gedung";

function baca(kunci: string): string {
  try { return (typeof window !== "undefined" && localStorage.getItem(kunci)) || ""; } catch { return ""; }
}
function tulis(kunci: string, nilai: string) {
  try { localStorage.setItem(kunci, nilai); } catch { /* storage diblokir -- abaikan */ }
}

/** "jakarta" / "JAKARTA" / "Jakarta" -> "Jakarta" (huruf awal tiap kata kapital). */
export function rapikanNamaDaerah(s: string): string {
  return (s || "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Wilayah yang sedang dipilih Super Admin di header (default Makassar). */
export function wilayahAktifSuperAdmin(): string {
  return baca(KUNCI_WILAYAH_AKTIF) || DAERAH_DEFAULT;
}
export function setWilayahAktifSuperAdmin(daerah: string) {
  tulis(KUNCI_WILAYAH_AKTIF, rapikanNamaDaerah(daerah) || DAERAH_DEFAULT);
}

/**
 * Gedung portal publik. Link per gedung: https://sibm-app.web.app/?gedung=makassar (dicetak jadi QR).
 * Dipanggil sekali saat portal dibuka untuk mengingat pilihan dari link; tanpa parameter memakai yang
 * terakhir diingat, atau Makassar (link lama tetap jalan).
 */
export function gedungPortal(): string {
  if (typeof window !== "undefined") {
    const dariLink = new URLSearchParams(window.location.search).get("gedung");
    if (dariLink) {
      const nama = rapikanNamaDaerah(dariLink);
      tulis(KUNCI_GEDUNG, nama);
      return nama;
    }
  }
  return baca(KUNCI_GEDUNG) || DAERAH_DEFAULT;
}

/** Daerah untuk menandai dokumen yang ditulis dari perangkat ini (lihat urutan di atas). */
export function daerahTulis(): string {
  const akun = baca("pic_daerah");
  const sudahLogin = !!baca("pic_nama");
  if (sudahLogin && akun && akun !== DAERAH_PUSAT) return akun;
  if (sudahLogin && akun === DAERAH_PUSAT) return wilayahAktifSuperAdmin();
  return gedungPortal();
}
