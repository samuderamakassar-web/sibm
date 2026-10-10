// Beban Kerja & Kebutuhan Personel (§119, pengganti SLA per-orang §118 atas arahan user).
// Tujuan: kesimpulan seberapa sibuk tim OB (pelayanan), CS (cleaning), Driver, Security -> apakah perlu tambah
// OB / CS / Driver / Security / resepsionis. 4 penilaian + 1 penilaian resepsionis.
// PENTING: rasio kapasitas di bawah adalah ASUMSI standar industri (bisa diubah), BUKAN aturan Disnaker.
// Yang dari aturan hanya jam kerja normal 40 jam/minggu & lembur maks 4 jam/hari, 18 jam/minggu (PP 35/2021).

export interface AsumsiBeban {
  cs_m2_per_orang: number;      // luas area intensif yang sanggup dibersihkan 1 CS per hari
  cs_bobot_ringan: number;      // bobot area ringan (kosong, teras, garden, parkir) dibanding area intensif
  cs_m2_per_toilet: number;     // 1 toilet setara berapa m2 area intensif (pengecekan berkala)
  ob_karyawan_per_orang: number;// karyawan yang sanggup dilayani 1 OB pelayanan
  ob_karyawan_per_meeting: number; // 1 meeting per hari setara berapa karyawan
  drv_jam_kerja: number;        // jam kerja driver per hari
  drv_utilisasi_sehat: number;  // % jam di jalan yang dianggap sehat (sisanya standby/administrasi)
  sec_pos: number;              // jumlah pos jaga 24 jam
  sec_jam_normal: number;       // jam kerja normal per orang per minggu (UU: 40)
  sec_batas_lembur: number;     // batas lembur per minggu (PP 35/2021: 18)
  sec_lembur_wajar: number;     // lembur RUTIN yang wajar per orang/minggu (sisa batas legal untuk menutup cuti/sakit)
  res_tamu_per_jam: number;     // tamu per jam (jam sibuk) yang butuh resepsionis khusus
  cadangan_pct: number;         // cadangan cuti/sakit (%)
}
export const ASUMSI_BAWAAN: AsumsiBeban = {
  cs_m2_per_orang: 600, cs_bobot_ringan: 0.3, cs_m2_per_toilet: 60,
  ob_karyawan_per_orang: 40, ob_karyawan_per_meeting: 5,
  drv_jam_kerja: 8, drv_utilisasi_sehat: 75,
  sec_pos: 1, sec_jam_normal: 40, sec_batas_lembur: 18, sec_lembur_wajar: 4,
  res_tamu_per_jam: 4, cadangan_pct: 10,
};
export const LABEL_ASUMSI: Record<keyof AsumsiBeban, string> = {
  cs_m2_per_orang: "CS: m² area intensif per orang per hari",
  cs_bobot_ringan: "CS: bobot area ringan (0–1)",
  cs_m2_per_toilet: "CS: 1 toilet setara m²",
  ob_karyawan_per_orang: "OB: karyawan dilayani per orang",
  ob_karyawan_per_meeting: "OB: 1 meeting/hari setara karyawan",
  drv_jam_kerja: "Driver: jam kerja per hari",
  drv_utilisasi_sehat: "Driver: utilisasi sehat (%)",
  sec_pos: "Security: jumlah pos 24 jam",
  sec_jam_normal: "Security: jam normal/orang/minggu (UU)",
  sec_batas_lembur: "Security: batas lembur/minggu (PP 35/2021)",
  sec_lembur_wajar: "Security: lembur rutin wajar/orang/minggu",
  res_tamu_per_jam: "Resepsionis: tamu/jam yang butuh petugas khusus",
  cadangan_pct: "Cadangan cuti/sakit (%)",
};

export type StatusBeban = "Longgar" | "Seimbang" | "Padat" | "Kelebihan beban";
export const statusBeban = (indeks: number): StatusBeban => (indeks < 70 ? "Longgar" : indeks <= 100 ? "Seimbang" : indeks <= 120 ? "Padat" : "Kelebihan beban");
export const WARNA_STATUS_BEBAN: Record<StatusBeban, string> = { Longgar: "var(--info)", Seimbang: "var(--ok)", Padat: "var(--warn)", "Kelebihan beban": "var(--red-600)" };

/** Jumlah hari kerja (Senin-Jumat) antara dua waktu, dihitung per hari kalender. */
export function hariKerjaAntara(mulai: Date, selesai: Date): number {
  let n = 0;
  const d = new Date(mulai.getFullYear(), mulai.getMonth(), mulai.getDate());
  const akhir = new Date(selesai.getFullYear(), selesai.getMonth(), selesai.getDate());
  while (d < akhir) { d.setDate(d.getDate() + 1); const h = d.getDay(); if (h !== 0 && h !== 6) n++; }
  return n;
}
/** Senin (ISO) dari tanggal YYYY-MM-DD. */
export function seninDari(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
