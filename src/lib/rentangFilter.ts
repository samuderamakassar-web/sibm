// Rentang tanggal dari filter Bulan/Tahun halaman riwayat (§61) -- supaya query Firestore cukup
// memuat rentang yang sedang dilihat, bukan SELURUH koleksi sejak awal (dulu dibaca ulang tiap buka
// halaman & tiap ada data baru, biaya ikut membengkak seiring waktu).
//
// bulan: "0".."11" atau nilai "semua"; tahun: "2026" dst atau nilai "semua".
// Tanpa filter -> `hariDefault` hari terakhir.
export interface RentangFilter {
  dari: Date;
  sampai: Date | null;
  label: string;
  kunci: string;
}

export function rentangBulanTahun(bulan: string, tahun: string, nilaiSemua: string, hariDefault = 60): RentangFilter {
  const adaTahun = tahun !== nilaiSemua;
  const adaBulan = bulan !== nilaiSemua;
  let dari: Date;
  let sampai: Date | null;
  let label: string;
  if (adaTahun || adaBulan) {
    const th = adaTahun ? Number(tahun) : new Date().getFullYear();
    if (adaBulan) {
      dari = new Date(th, Number(bulan), 1);
      sampai = new Date(th, Number(bulan) + 1, 1);
      label = "bulan dipilih";
    } else {
      dari = new Date(th, 0, 1);
      sampai = new Date(th + 1, 0, 1);
      label = "tahun dipilih";
    }
  } else {
    dari = new Date();
    dari.setHours(0, 0, 0, 0);
    dari.setDate(dari.getDate() - hariDefault);
    sampai = null;
    label = `${hariDefault} hari terakhir`;
  }
  return { dari, sampai, label, kunci: `${dari.getTime()}-${sampai?.getTime() ?? "kini"}` };
}

/** Pilihan tahun untuk dropdown (data dimuat per rentang, jadi tidak bisa diturunkan dari data). */
export function daftarTahunSejak(awal = 2024): number[] {
  const kini = new Date().getFullYear();
  return Array.from({ length: kini - awal + 1 }, (_, i) => kini - i);
}
