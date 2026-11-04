// §177 Stok gudang OB -- kategori, jadwal opname harian (Pagi & Sore) dan rekap selisih otomatis.
// Murni (tanpa Firebase) supaya dipakai StockOpnamePage, DashboardOBPage & mudah diuji.
//
//   ob_stock/{id}   { nama_barang, qty, batas_minimum, kategori, satuan?, foto? }
//   ob_opname/{id}  { sesi: "Pagi"|"Sore"|"Lainnya", tanggal, dibuat_oleh, dibuat_pada, status, items[] (SEMUA barang
//                     yang dihitung: sistem, fisik, selisih, alasan), foto? }
//   Selisih = fisik − sistem. Sistem sudah memuat semua transaksi tercatat, jadi selisih = pemakaian/penambahan
//   yang TIDAK dicatat sejak hitungan sebelumnya. Koreksi stok tetap lewat persetujuan Koordinator/Admin (§116).

export const KATEGORI = ["Chemical", "Tools Cleaning", "Pantry & Habis Pakai", "Utilitas Gedung", "Fasilitas", "Tools & Lainnya"] as const;
export type Kategori = (typeof KATEGORI)[number];

export const WARNA_KAT: Record<Kategori, { bg: string; fg: string }> = {
  "Chemical": { bg: "var(--info-50)", fg: "var(--info)" },
  "Tools Cleaning": { bg: "var(--ok-50)", fg: "var(--ok)" },
  "Pantry & Habis Pakai": { bg: "var(--warn-50)", fg: "var(--warn)" },
  "Utilitas Gedung": { bg: "var(--red-50)", fg: "var(--red-600)" },
  "Fasilitas": { bg: "var(--accent-50, var(--info-50))", fg: "var(--accent)" },
  "Tools & Lainnya": { bg: "var(--bg)", fg: "var(--ink-soft)" },
};

export const KET_KAT: Record<Kategori, string> = {
  "Chemical": "Sabun, pembersih lantai/kaca, pengharum, kamper, desinfektan",
  "Tools Cleaning": "Sapu, pel, lap, kanebo, spons, sikat, ember, sarung tangan",
  "Pantry & Habis Pakai": "Kopi, gula, teh, air, gelas, tisu, kantong sampah",
  "Utilitas Gedung": "Lampu, kran, bidet, kabel, stop kontak, MCB, pipa",
  "Fasilitas": "Dispenser, tempat sampah, keset, payung, rak, kursi",
  "Tools & Lainnya": "Obeng, tang, tangga, gunting, lakban, lainnya",
};

// urutan uji penting: chemical dulu (sabun cuci piring = chemical), lalu pantry/tisu (tisu "toilet" bukan utilitas),
// tools cleaning, utilitas, fasilitas; sisanya Tools & Lainnya
const POLA: [Kategori, RegExp][] = [
  ["Chemical", /sabun|vixal|wipol|porstex|karbol|kamper|kapur barus|pengharum|pewangi|stella|glade|baygon|\bhit\b|cairan|deterjen|detergen|rinso|soklin|so klin|desinfektan|disinfektan|alkohol|sanitizer|cleaner|cling|superpell|super pell|bayclin|molto|kispray|chemical|pembersih|semir|polish|lilin|wax|asam|soda|clorox|lysol|dettol|lifeboy|lifebuoy|hand ?soap|urinoir|naphthalene|obat nyamuk/i],
  ["Pantry & Habis Pakai", /\b(kopi|gula|teh|susu|creamer|air mineral|galon|aqua|gelas|cangkir|piring|sendok|garpu|sedotan|tisu|tissu|tissue|kantong|plastik|kresek|trash ?bag|snack|biskuit)/i],
  ["Tools Cleaning", /sapu|\bpel\b|mop|lap\b|kain lap|serbet|kanebo|spons|sponge|sikat|ember|serok|pengki|kemoceng|wiper|squeegee|sarung tangan|masker|scrub|sabut|botol semprot|sprayer|trolley|troli/i],
  ["Utilitas Gedung", /lampu|\btl\b|\bled\b|bohlam|watt|kabel|stop ?kontak|terminal|fitting|saklar|kran|keran|selang|bidet|shower|closet|kloset|wastafel|flush|filter|sekring|mcb|starter|ballast|klep|pipa|engsel|kunci pintu|gembok|handle pintu|ac\b|freon/i],
  ["Fasilitas", /dispenser|tempat sampah|tong sampah|keset|karpet|payung|rak|kursi|meja|gorden|tirai|jam dinding|hand ?dryer|cermin|vas|pot|papan|signage|rambu/i],
];
export function tebakKategori(nama: string): Kategori {
  for (const [k, p] of POLA) if (p.test(nama)) return k;
  return "Tools & Lainnya";
}
/** Kategori tersimpan bila masih ada di daftar baru; data lama ("Dapur & Rumah Tangga", kosong) ditebak dari nama. */
export const kategoriBarang = (x: { nama_barang: string; kategori?: string }): Kategori =>
  (KATEGORI as readonly string[]).includes(x.kategori || "") ? (x.kategori as Kategori) : tebakKategori(x.nama_barang);

// ---------- jadwal opname harian ----------
export type SesiOpname = "Pagi" | "Sore";
export const JADWAL_OPNAME: { sesi: SesiOpname; jam: string; mulai: number; selesai: number }[] = [
  { sesi: "Pagi", jam: "07.00–09.00", mulai: 7 * 60, selesai: 9 * 60 },
  { sesi: "Sore", jam: "15.30–17.00", mulai: 15 * 60 + 30, selesai: 17 * 60 },
];
/** Sesi yang sedang berjalan / paling dekat (dipakai sebagai pilihan bawaan form opname). */
export function sesiOpnameBawaan(menit: number): SesiOpname {
  return menit < 12 * 60 ? "Pagi" : "Sore";
}
export type StatusSesi = "belum-mulai" | "berjalan" | "terlambat" | "selesai";
export function statusSesi(sesi: SesiOpname, menit: number, sudah: boolean): StatusSesi {
  const j = JADWAL_OPNAME.find((x) => x.sesi === sesi)!;
  if (sudah) return "selesai";
  if (menit < j.mulai) return "belum-mulai";
  return menit < j.selesai ? "berjalan" : "terlambat";
}

// ---------- rekap harian ----------
export interface BarisOpname { id: string; nama: string; sistem: number; fisik: number; selisih: number; alasan: string }
export interface OpnameRingkas { sesi?: string; tanggal?: string; dibuat_oleh: string; waktuMs: number; status: string; items: BarisOpname[] }
export interface LogRingkas { id_barang?: string; nama_barang: string; jenis_transaksi: string; jumlah_perubahan: number; waktuMs: number }
export interface BarisRekap { id: string; nama: string; pagi: number | null; masuk: number; keluar: number; sore: number | null; seharusnya: number | null; selisih: number | null }

/**
 * Rekap hari itu per barang: fisik pagi + masuk − keluar tercatat (di antara 2 hitungan) = seharusnya sore;
 * selisih = fisik sore − seharusnya (negatif = terpakai tanpa dicatat / hilang).
 */
export function rekapHarian(barang: { id: string; nama_barang: string }[], pagi: OpnameRingkas | undefined, sore: OpnameRingkas | undefined, log: LogRingkas[]): BarisRekap[] {
  const dari = pagi?.waktuMs ?? 0, sampai = sore?.waktuMs ?? Date.now();
  const cocok = (l: LogRingkas, b: { id: string; nama_barang: string }) => (l.id_barang ? l.id_barang === b.id : l.nama_barang === b.nama_barang);
  return barang.map((b) => {
    const p = pagi?.items.find((x) => x.id === b.id), s = sore?.items.find((x) => x.id === b.id);
    const dalam = log.filter((l) => cocok(l, b) && l.waktuMs > dari && l.waktuMs <= sampai);
    const masuk = dalam.filter((l) => l.jenis_transaksi.startsWith("MASUK")).reduce((t, l) => t + l.jumlah_perubahan, 0);
    const keluar = dalam.filter((l) => l.jenis_transaksi.startsWith("KELUAR")).reduce((t, l) => t + l.jumlah_perubahan, 0);
    const seharusnya = p ? p.fisik + masuk - keluar : null;
    return { id: b.id, nama: b.nama_barang, pagi: p ? p.fisik : null, masuk, keluar, sore: s ? s.fisik : null, seharusnya, selisih: s && seharusnya !== null ? s.fisik - seharusnya : s ? s.selisih : null };
  });
}
