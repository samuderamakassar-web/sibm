// SLA personel otomatis (§118, Tahap 2). Semua indikator dihitung dari data yang sudah terekam aplikasi --
// tanpa input tambahan. Target bawaan = usulan §116/§117 (bisa diubah Admin, settings/sla_target).
// Batas lembur mengikuti PP 35/2021: maks 4 jam/hari & 18 jam/minggu. Rasio beban kerja (Tahap 3) BUKAN
// aturan Disnaker -- ditandai sebagai asumsi standar industri.

export type PeranSla = "OB & CS" | "Security" | "Driver" | "QHSE" | "Admin GA";
export const PERAN_SLA: PeranSla[] = ["OB & CS", "Security", "Driver", "QHSE", "Admin GA"];

export interface IndikatorSla { key: string; peran: PeranSla; label: string; target: number; satuan?: string; tim?: boolean; keterangan: string }
export const INDIKATOR_SLA: IndikatorSla[] = [
  { key: "ob_checklist", peran: "OB & CS", label: "Checklist sesi terisi", target: 95, keterangan: "Sesi Pagi/Siang/Sore yang dilaporkan dari semua area plot hari kerja" },
  { key: "ob_inspeksi", peran: "OB & CS", label: "Inspeksi kondisi aset mingguan", target: 100, keterangan: "Minggu yang ada inspeksi gedung/alat dari minggu yang ia bertugas" },
  { key: "ob_alat", peran: "OB & CS", label: "Alat kerja lengkap", target: 100, keterangan: "Alat yang dipegang tidak berstatus Hilang" },
  { key: "sec_patroli", peran: "Security", label: "Shift dengan patroli ≥ 2 sesi", target: 95, keterangan: "Shift roster yang memenuhi minimal 2 dari 3 sesi patroli" },
  { key: "sec_tukar", peran: "Security", label: "Tukar jaga ≤ 10 menit", target: 95, keterangan: "Serah terima yang ia terima (scan) tepat waktu" },
  { key: "sec_lembur", peran: "Security", label: "Minggu patuh batas lembur", target: 100, keterangan: "Minggu dengan lembur ≤ 18 jam (shift 12 jam = 4 jam lembur)" },
  { key: "drv_inspeksi", peran: "Driver", label: "Inspeksi kendaraan mingguan", target: 100, keterangan: "Minggu yang ada laporan inspeksi kendaraan" },
  { key: "drv_servis", peran: "Driver", label: "Armada servis tepat jadwal", target: 100, tim: true, keterangan: "Kendaraan armada driver yang tidak lewat jadwal servis" },
  { key: "qhse_respon", peran: "QHSE", label: "SBO ditanggapi ≤ 24 jam", target: 90, tim: true, keterangan: "Laporan SBO bulan ini yang ditanggapi (rencana tindakan) ≤ 24 jam" },
  { key: "qhse_tutup", peran: "QHSE", label: "SBO ditutup ≤ 7 hari", target: 80, tim: true, keterangan: "Laporan SBO bulan ini yang ditutup (foto after) ≤ 7 hari" },
  { key: "ga_helpdesk", peran: "Admin GA", label: "Helpdesk selesai ≤ 3 hari kerja", target: 80, tim: true, keterangan: "Tiket pengguna bulan ini yang selesai ≤ 3 hari kerja" },
  { key: "ga_temuan", peran: "Admin GA", label: "Temuan aset selesai ≤ 7 hari", target: 80, tim: true, keterangan: "Temuan inspeksi bulan ini yang selesai ≤ 7 hari" },
];

export const BATAS_LEMBUR_MINGGU = 18;
export const LEMBUR_PER_SHIFT_12_JAM = 4;

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
export const persen = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
