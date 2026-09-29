// Periode buku lembur tim (siklus payroll 11 -> 10 bulan berikutnya), dihitung dari tanggal
// hari ini di WITA. Menggantikan 3 opsi yang dulu di-hardcode "11 Mei/Juni/Juli 2026" di
// dashboard Security, OB & CS, dan Driver -- sejak pertengahan Agustus 2026 opsi "Aktif" itu
// sudah basi sehingga klaim lembur tercatat dengan periode yang salah (§58J).
// Format label SENGAJA sama dengan data lama ("11 Juni - 10 Juli 2026") supaya filter periode
// di admin/overtime tetap bisa mengelompokkan data lama & baru dengan cara yang sama.

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export interface OpsiPeriodeLembur {
  value: string;
  keterangan: "Lalu" | "Aktif" | "Depan";
}

/** Label siklus yang mulai tanggal 11 pada bulan (0-11) & tahun tertentu. */
function labelSiklus(tahun: number, bulan: number): string {
  const akhirBulan = (bulan + 1) % 12;
  const akhirTahun = bulan === 11 ? tahun + 1 : tahun;
  const awal = tahun === akhirTahun ? `11 ${NAMA_BULAN[bulan]}` : `11 ${NAMA_BULAN[bulan]} ${tahun}`;
  return `${awal} - 10 ${NAMA_BULAN[akhirBulan]} ${akhirTahun}`;
}

/** Siklus lalu, aktif, dan depan -- urutan tampil: aktif dulu (default), lalu lalu, lalu depan. */
export function daftarPeriodeLembur(sekarang: Date = new Date()): OpsiPeriodeLembur[] {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" })
    .format(sekarang)
    .split("-")
    .map(Number);
  // Tanggal < 11 masih termasuk siklus yang mulai tanggal 11 bulan lalu.
  let tahun = y;
  let bulan = m - 1;
  if (d < 11) {
    bulan -= 1;
    if (bulan < 0) { bulan = 11; tahun -= 1; }
  }
  const geser = (delta: number) => {
    const total = tahun * 12 + bulan + delta;
    return labelSiklus(Math.floor(total / 12), ((total % 12) + 12) % 12);
  };
  return [
    { value: geser(0), keterangan: "Aktif" },
    { value: geser(-1), keterangan: "Lalu" },
    { value: geser(1), keterangan: "Depan" },
  ];
}

/** Label siklus yang sedang aktif hari ini -- dipakai sebagai nilai awal form. */
export function periodeLemburAktif(sekarang: Date = new Date()): string {
  return daftarPeriodeLembur(sekarang)[0].value;
}
