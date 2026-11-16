// §180 Roster cuci piring/gelas pantry -- murni (tanpa Firebase), dipakai portal (halaman utama), Checklist Zona
// & admin Uji Coba Pola Zona.
//
// Hitungan ideal (keputusan §180): ± 67 karyawan × 2 minuman/hari (pagi & siang) ≈ 130 gelas/cangkir + gelas meeting.
// 2x cuci -> ± 65 gelas menumpuk per putaran (gelas habis sebelum makan siang). 3x cuci -> ± 45 gelas/putaran
// (± 15-20 menit), pantry bersih tiap habis jam minum. Akhir pekan kantor hampir kosong -> 2x oleh Security yang jaga.
//   Hari kerja : 10.00 (setelah minuman pagi) · 13.30 (setelah makan siang) · 16.00 (sebelum pulang)
//   Sabtu/Minggu: 12.00 oleh Security Shift 1 · 21.00 oleh Security Shift 2
// Bergiliran adil: slot hari kerja diberikan berurutan ke petugas OB yang hadir, melanjutkan urutan hari kerja
// sebelumnya (dihitung dari tanggal acuan) -> setiap orang kebagian sama banyak, tidak 2 slot di hari yang sama.

export interface SlotCuci { jam: string; ket: string; nama: string[]; shift?: string }

export const SLOT_HARI_KERJA = [
  { jam: "10.00", ket: "setelah minuman pagi" },
  { jam: "13.30", ket: "setelah makan siang" },
  { jam: "16.00", ket: "sebelum pulang, pantry kosong" },
] as const;
export const SLOT_AKHIR_PEKAN = [
  { jam: "12.00", ket: "siang", shift: "Shift 1" },
  { jam: "21.00", ket: "malam", shift: "Shift 2" },
] as const;

const ACUAN = "2026-01-05"; // Senin -- titik nol urutan giliran
const hariUTC = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
const hariMinggu = (iso: string) => new Date(hariUTC(iso) * 86400000).getUTCDay(); // 0 Minggu .. 6 Sabtu
export const akhirPekanISO = (iso: string) => { const h = hariMinggu(iso); return h === 0 || h === 6; };

/** Jumlah hari kerja (Sen-Jum) dari tanggal acuan sampai sebelum `iso`. */
export function urutanHariKerja(iso: string): number {
  const selisih = hariUTC(iso) - hariUTC(ACUAN);
  if (selisih <= 0) return 0;
  const minggu = Math.floor(selisih / 7);
  let n = minggu * 5;
  for (let i = minggu * 7; i < selisih; i++) if ((1 + i) % 7 !== 6 && (1 + i) % 7 !== 0) n++; // ACUAN = Senin (hari 1)
  return n;
}

/**
 * Roster hari itu.
 * @param petugasOB  petugas OB yang HADIR hari itu (urutan tetap, mis. anggota zona Tenant lalu Publik)
 * @param security   roster security tanggal itu: nama -> label shift ("Shift 1" / "Shift 2" / "Off")
 */
export function rosterCuciPiring(iso: string, petugasOB: string[], security: Record<string, string> = {}): SlotCuci[] {
  if (akhirPekanISO(iso)) {
    return SLOT_AKHIR_PEKAN.map((s) => ({ jam: s.jam, ket: s.ket, shift: s.shift, nama: Object.keys(security).filter((n) => (security[n] || "").includes(s.shift)).sort() }));
  }
  // urut nama supaya giliran tidak bergeser saat zona ditukar (urutan rencana berubah tiap minggu)
  const urut = [...petugasOB].sort((x, y) => x.localeCompare(y));
  const n = urut.length;
  const awal = urutanHariKerja(iso) * SLOT_HARI_KERJA.length;
  return SLOT_HARI_KERJA.map((s, i) => ({ jam: s.jam, ket: s.ket, nama: n ? [urut[(awal + i) % n]] : [] }));
}

/** Slot milik orang tsb hari itu (untuk pengingat di halaman staf). */
export const slotMilik = (roster: SlotCuci[], nama: string) =>
  roster.filter((s) => s.nama.some((x) => x.trim().toLowerCase() === nama.trim().toLowerCase()));
