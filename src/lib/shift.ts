/**
 * src/lib/shift.ts
 * ------------------------------------------------------------------
 * Kalkulator shift & sesi patroli Security, dipakai bareng oleh UI
 * (PatroliSecurityPage, banner pengingat, admin monitor) supaya semua
 * bagian aplikasi sepakat soal "sekarang sesi berapa / shift apa".
 *
 * ATURAN (dikonfirmasi user):
 * - Shift 1: 08:00–20:00 WITA -> Sesi 1 (08-12), Sesi 2 (12-16), Sesi 3 (16-20)
 * - Shift 2: 20:00–08:00 WITA -> Sesi 1 (20-00), Sesi 2 (00-04), Sesi 3 (04-08)
 * - Minimal 2 dari 3 sesi per shift harus ada laporan patroli (security_patrols).
 *
 * PENTING: script cron (scripts/patroli-reminder.mjs) TIDAK bisa import file
 * TypeScript ini (plain Node ESM, tanpa build step/path alias) -- logikanya
 * diduplikasi manual di sana. Kalau aturan sesi di atas berubah, ubah juga
 * fungsi sejenis di scripts/patroli-reminder.mjs biar tetap sinkron.
 * ------------------------------------------------------------------
 */

export type ShiftLabel = "Shift 1" | "Shift 2";
export type SesiLabel = "Sesi 1" | "Sesi 2" | "Sesi 3";

export const MINIMUM_SESI_PER_SHIFT = 2;
export const TOTAL_SESI_PER_SHIFT = 3;

export const BATAS_SESI: Record<ShiftLabel, { sesi: SesiLabel; jam: string }[]> = {
  "Shift 1": [
    { sesi: "Sesi 1", jam: "08:00 - 12:00" },
    { sesi: "Sesi 2", jam: "12:00 - 16:00" },
    { sesi: "Sesi 3", jam: "16:00 - 20:00" },
  ],
  "Shift 2": [
    { sesi: "Sesi 1", jam: "20:00 - 00:00" },
    { sesi: "Sesi 2", jam: "00:00 - 04:00" },
    { sesi: "Sesi 3", jam: "04:00 - 08:00" },
  ],
};

/** Waktu sekarang dalam wall-clock WITA (Asia/Makassar), dipakai sebagai input hitungShiftSesi(). */
export function waktuWITASekarang(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
}

function formatTanggal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

export interface ShiftSesiInfo {
  tanggal_shift: string; // "YYYY-MM-DD" -- tanggal MULAI shift yang sedang aktif (bukan tanggal kalender jam sekarang)
  shift: ShiftLabel;
  sesi: SesiLabel;
}

/** Hitung shift & sesi aktif dari 1 waktu WITA (pakai waktuWITASekarang() sebagai input di client). */
export function hitungShiftSesi(now: Date): ShiftSesiInfo {
  const h = now.getHours();
  const hariIni = formatTanggal(now);
  const kemarin = formatTanggal(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  if (h >= 8 && h < 20) {
    const sesi: SesiLabel = h < 12 ? "Sesi 1" : h < 16 ? "Sesi 2" : "Sesi 3";
    return { tanggal_shift: hariIni, shift: "Shift 1", sesi };
  }

  // Shift 2 (20:00 - 08:00), melewati tengah malam -- tanggal_shift = tanggal MULAI shift malam yang aktif.
  const sesi: SesiLabel = h >= 20 ? "Sesi 1" : h < 4 ? "Sesi 2" : "Sesi 3";
  const tanggal_shift = h >= 20 ? hariIni : kemarin;
  return { tanggal_shift, shift: "Shift 2", sesi };
}

/** Minimal 2 sesi BERBEDA harus tercatat (>= 2 nilai unik dari daftar sesi yang sudah dilaporkan). */
export function sesiMinimumTerpenuhi(sesiList: (string | undefined | null)[]): boolean {
  const unik = new Set(sesiList.filter((s): s is string => !!s));
  return unik.size >= MINIMUM_SESI_PER_SHIFT;
}
