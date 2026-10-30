// Evaluasi Uji Coba Pola Zona OB (§169, §171) -- OTOMATIS dari data aplikasi, tanpa penilaian staf.
// 1. Beban terukur (rumus sama dengan /admin/sla, asumsi settings/beban_asumsi):
//    Zona Publik  = area bersama/lobi/koridor/toilet (intensif) + area kosong/parkir (ringan × bobot) + toilet × m² setara
//                   ÷ m²/orang × cadangan
//    Zona Tenant  = luas unit tenant terisi ÷ m²/orang × cadangan  +  pelayanan (menit permintaan nyata ÷ menit efektif,
//                   atau perkiraan karyawan + meeting bila data permintaan belum cukup) × cadangan
//    Indeks = kebutuhan ÷ jumlah orang di zona (Longgar <70, Seimbang 70-100, Padat 100-120, Kelebihan >120).
// 2. Kerja nyata selama uji coba: ronde, cakupan area per hari, permintaan & menit pelayanan, respon, lembur.
// 3. Pembanding pola lama (hari kerja terakhir sebelum mulai): respon, permintaan, lembur, kepatuhan laporan.
import type { Timestamp } from "firebase/firestore";
import { menitJenis, timJenis } from "./pelayanan";
import { statusBeban, type AsumsiBeban, type StatusBeban } from "./sla";
import type { AreaChecklist } from "./sopChecklist";
import { hariKerja, tambahHari, zonaUntuk, anggotaZona, type LaporanZona, type UjiPolaZona, type Zona } from "./ujiPolaZona";

export interface Permintaan { jenis?: string; jumlah?: number; diterima_oleh?: string; waktu_minta?: Timestamp | null; waktu_terima?: Timestamp | null; status?: string }
export interface KlaimLembur { nama_pemohon?: string; status?: string; items?: { tanggal?: string; jam_mulai?: string; jam_selesai?: string }[] }
export interface ChecklistLama { tanggal?: string; pic_bertugas?: string; sesi?: string }
interface UnitOk { nama?: string; luas?: number; status?: string }
export interface DataOkupansi { lantai?: { nama?: string; luas_total?: number; unit?: UnitOk[] }[]; gedung?: { luas_total?: number; luas_bersama?: number } }
export interface DataPendukung { okupansi: DataOkupansi; sopArea: AreaChecklist[]; jumlahKaryawan: number; tanggalMeeting: string[]; asumsi: AsumsiBeban }

const tglWITA = (ts: Timestamp | null | undefined) => (ts ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(ts.toDate()) : "");
const rata = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const samaNama = (a = "", b = "") => a.trim().toLowerCase() === b.trim().toLowerCase();
const menitPermintaan = (p: Permintaan) => menitJenis(p.jenis || "") + (p.jenis === "minuman" ? Math.max(0, (Number(p.jumlah) || 1) - 1) * 2 : 0);
const respon = (p: Permintaan[]) => p.filter((x) => x.waktu_minta && x.waktu_terima).map((x) => (x.waktu_terima!.toMillis() - x.waktu_minta!.toMillis()) / 60000).filter((m) => m >= 0);
const f1 = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);

export function jamLembur(mulai = "", selesai = ""): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(mulai), s = /^(\d{1,2}):(\d{2})/.exec(selesai);
  if (!m || !s) return 0;
  let menit = Number(s[1]) * 60 + Number(s[2]) - (Number(m[1]) * 60 + Number(m[2]));
  if (menit <= 0) menit += 24 * 60;
  return menit / 60;
}
const lemburJam = (lembur: KlaimLembur[], nama: string[], hari: string[]) => lembur
  .filter((k) => k.status !== "Rejected" && nama.some((n) => samaNama(n, k.nama_pemohon)))
  .flatMap((k) => k.items || []).filter((i) => i.tanggal && hari.includes(i.tanggal))
  .reduce((t, i) => t + jamLembur(i.jam_mulai, i.jam_selesai), 0);

// ---------------- 1. beban terukur per zona ----------------
export interface BebanZona { zona: Zona; orang: number; kebutuhan: number; indeks: number; status: StatusBeban; dasar: string[]; dataKurang?: string }

function bebanTerukur(c: UjiPolaZona, hariUji: string[], d: DataPendukung, permUji: Permintaan[]): BebanZona[] {
  const a = d.asumsi, cadangan = 1 + a.cadangan_pct / 100;
  const lantai = d.okupansi.lantai || [];
  const gedung = d.okupansi.gedung || {};
  let tenant = 0, publik = 0, ringan = 0, toiletUnit = 0, terisiU = 0, kosongU = 0, bersamaU = 0, totalLantai = 0;
  lantai.forEach((l) => {
    let tercatat = 0;
    (l.unit || []).forEach((u) => {
      const n = u.nama || "", luas = Number(u.luas) || 0;
      tercatat += luas;
      if (u.status === "terisi") terisiU += luas; else if (u.status === "kosong") kosongU += luas; else if (u.status === "bersama") bersamaU += luas;
      if (/gudang|pompa|server|rooftop|panel/i.test(n)) return;
      if (/toilet|wc/i.test(n)) { toiletUnit++; publik += luas; return; }
      if (u.status === "terisi") tenant += luas;
      else if (u.status === "kosong" || /parkir|teras|garden|taman/i.test(n)) ringan += luas;
      else publik += luas;
    });
    totalLantai += Math.max(Number(l.luas_total) || 0, tercatat);
  });
  const bersamaGedung = Number(gedung.luas_bersama) > 0 ? Number(gedung.luas_bersama) : bersamaU;
  const totalGedung = Number(gedung.luas_total) > 0 ? Number(gedung.luas_total) : totalLantai;
  publik += Math.max(0, bersamaGedung - bersamaU);
  ringan += Math.max(0, totalGedung - terisiU - kosongU - bersamaGedung);
  const toiletSop = d.sopArea.filter((x) => !x.area.toLowerCase().includes("pelayanan"))
    .flatMap((x) => x.segmen.filter((s) => s.aktif !== false && /toilet|wc/i.test(s.nama))).length;
  const toilet = Math.max(toiletUnit, toiletSop);

  // Zona Publik
  const m2Publik = publik + ringan * a.cs_bobot_ringan + toilet * a.cs_m2_per_toilet;
  const kPublik = (m2Publik / a.cs_m2_per_orang) * cadangan;
  // Zona Tenant: cleaning ruang tenant + pelayanan
  const kTenantBersih = (tenant / a.cs_m2_per_orang) * cadangan;
  const n = Math.max(1, hariUji.length);
  const permOB = permUji.filter((p) => timJenis(p.jenis || "") === "OB");
  const pakaiNyata = permOB.length >= a.ob_min_permintaan;
  const menitOB = permOB.reduce((t, p) => t + menitPermintaan(p), 0);
  const meetingPerHari = d.tanggalMeeting.filter((t) => hariUji.includes(t)).length / n;
  const kPelayanan = pakaiNyata
    ? ((menitOB / n) / a.ob_menit_produktif) * cadangan
    : ((d.jumlahKaryawan + meetingPerHari * a.ob_karyawan_per_meeting) / a.ob_karyawan_per_orang) * cadangan;
  const kTenant = kTenantBersih + kPelayanan;

  const tgl = hariUji[0] || c.mulai;
  const orangT = anggotaZona(c, "Tenant", tgl).length, orangP = anggotaZona(c, "Publik", tgl).length;
  const buat = (zona: Zona, orang: number, kebutuhan: number, dasar: string[]): BebanZona => {
    const indeks = orang ? (kebutuhan / orang) * 100 : 0;
    return { zona, orang, kebutuhan, indeks, status: statusBeban(indeks), dasar, dataKurang: lantai.length ? undefined : "Isi luas lantai & tenant di menu Okupansi agar beban terhitung." };
  };
  return [
    buat("Tenant", orangT, kTenant, [
      `Cleaning ruang tenant: ${f1(tenant)} m² ÷ ${a.cs_m2_per_orang} m²/orang × cadangan ${a.cadangan_pct}% = ${f1(kTenantBersih)} orang`,
      pakaiNyata
        ? `Pelayanan (data nyata): ${permOB.length} permintaan, ± ${Math.round(menitOB)} menit (${f1(menitOB / n)} menit/hari) ÷ ${a.ob_menit_produktif} menit efektif × cadangan = ${f1(kPelayanan)} orang`
        : `Pelayanan (perkiraan): ${d.jumlahKaryawan} karyawan + ${f1(meetingPerHari)} meeting/hari × ${a.ob_karyawan_per_meeting} ÷ ${a.ob_karyawan_per_orang} × cadangan = ${f1(kPelayanan)} orang (data permintaan baru ${permOB.length}, dipakai setelah ≥ ${a.ob_min_permintaan})`,
      `Total kebutuhan ${f1(kTenant)} orang, sekarang ${orangT} orang`,
    ]),
    buat("Publik", orangP, kPublik, [
      `Area bersama intensif (lobi, koridor, toilet, tangga) ${f1(publik)} m²`,
      `Area ringan (kosong, parkir, taman) ${f1(ringan)} m² × bobot ${a.cs_bobot_ringan}`,
      `${toilet} toilet × ${a.cs_m2_per_toilet} m² setara`,
      `${f1(m2Publik)} m² ÷ ${a.cs_m2_per_orang} m²/orang × cadangan ${a.cadangan_pct}% = ${f1(kPublik)} orang, sekarang ${orangP} orang`,
    ]),
  ];
}

// ---------------- 2 & 3. kerja nyata & pembanding ----------------
export interface RingkasPeriode {
  dari: string; sampai: string; hari: number;
  permintaanPerHari: number; responMenit: number | null; persenCepat: number | null;
  lemburJam: number; kepatuhan: number | null; // % laporan sesuai target (lama: sesi 3/hari; uji: minimal ronde)
}
export interface KerjaZona {
  zona: Zona; rondePerOrangHari: number | null; cakupan: number | null; // % area zona tercentang per hari
  permintaan: number; menitPelayananPerOrangHari: number | null; utilisasiPelayanan: number | null; // % dari menit efektif
  responMenit: number | null; persenCepat: number | null; lemburJam: number; kepatuhan: number | null;
}
export interface BarisOrang {
  nama: string; minggu: 1 | 2; zona: Zona; hari: number; ronde: number; hariPatuh: number; areaPerHari: number | null;
  permintaan: number; menitPelayanan: number; responMenit: number | null; lemburJam: number;
}
export interface HasilEvaluasi {
  beban: BebanZona[]; kerja: KerjaZona[]; orang: BarisOrang[]; uji: RingkasPeriode; lama: RingkasPeriode;
  bantuZonaLain: number; saranPembagian: string | null; catatan: { tanggal: string; nama: string; zona: Zona; teks: string }[];
  kesimpulan: { warna: "hijau" | "oranye" | "merah"; judul: string; alasan: string[] }; hariBerjalan: number;
}

export function hitungEvaluasi(cfg: UjiPolaZona, hariIni: string, libur: string[], laporan: LaporanZona[], permintaan: Permintaan[], lembur: KlaimLembur[], checklistLama: ChecklistLama[], data: DataPendukung): HasilEvaluasi {
  const c = { ...cfg, aktif: true }; // evaluasi tetap terbaca setelah uji coba dihentikan/selesai
  const staf = [...c.tim_tenant, ...c.tim_publik];
  const a = data.asumsi;
  const sampaiUji = hariIni < c.selesai ? (hariIni < c.mulai ? c.mulai : hariIni) : c.selesai;
  const hariUji = hariKerja(c.mulai, sampaiUji, libur).filter((d) => d <= hariIni);
  const hariLamaSemua = hariKerja(tambahHari(c.mulai, -14), tambahHari(c.mulai, -1), libur);
  const hariLama = hariLamaSemua.slice(Math.max(0, hariLamaSemua.length - Math.max(hariUji.length, 1)));

  const perm = permintaan.filter((p) => p.status !== "Batal");
  const permPada = (hari: string[]) => perm.filter((p) => hari.includes(tglWITA(p.waktu_minta)));
  const permUji = permPada(hariUji), permLama = permPada(hariLama);
  const ronde = laporan.filter((l) => l.jenis === "ronde" && hariUji.includes(l.tanggal));

  // pembanding
  const ringkas = (hari: string[], p: Permintaan[], kepatuhan: number | null): RingkasPeriode => {
    const r = respon(p);
    return {
      dari: hari[0] || "", sampai: hari[hari.length - 1] || "", hari: hari.length,
      permintaanPerHari: p.length / Math.max(1, hari.length), responMenit: rata(r), persenCepat: r.length ? (r.filter((m) => m <= 10).length / r.length) * 100 : null,
      lemburJam: lemburJam(lembur, staf, hari), kepatuhan,
    };
  };
  const sesiLama = new Set(checklistLama.filter((x) => x.tanggal && hariLama.includes(x.tanggal) && staf.some((n) => samaNama(n, x.pic_bertugas)))
    .map((x) => `${(x.pic_bertugas || "").trim().toLowerCase()}|${x.tanggal}|${x.sesi}`));
  const targetLama = staf.length * hariLama.length * 3;
  const hariPatuhUji = staf.reduce((t, n) => t + hariUji.filter((h) => ronde.filter((l) => samaNama(l.nama, n) && l.tanggal === h).length >= c.min_ronde).length, 0);
  const lama = ringkas(hariLama, permLama, targetLama ? Math.min(100, (sesiLama.size / targetLama) * 100) : null);
  const uji = ringkas(hariUji, permUji, staf.length && hariUji.length ? (hariPatuhUji / (staf.length * hariUji.length)) * 100 : null);

  // per orang per minggu
  const orang: BarisOrang[] = [];
  for (const nama of staf) for (const minggu of [1, 2] as const) {
    const hari = hariUji.filter((d) => (minggu === 1 ? d < c.tukar_mulai : d >= c.tukar_mulai));
    if (!hari.length) continue;
    const r = ronde.filter((l) => samaNama(l.nama, nama) && hari.includes(l.tanggal));
    const p = permUji.filter((x) => samaNama(x.diterima_oleh, nama) && hari.includes(tglWITA(x.waktu_minta)));
    const areaHarian = hari.map((h) => new Set(r.filter((l) => l.tanggal === h).flatMap((l) => l.area || [])).size);
    orang.push({
      nama, minggu, zona: zonaUntuk(c, nama, hari[0])!, hari: hari.length, ronde: r.length,
      hariPatuh: hari.filter((h) => r.filter((l) => l.tanggal === h).length >= c.min_ronde).length,
      areaPerHari: rata(areaHarian), permintaan: p.length, menitPelayanan: p.reduce((t, x) => t + menitPermintaan(x), 0),
      responMenit: rata(respon(p)), lemburJam: lemburJam(lembur, [nama], hari),
    });
  }

  // per zona
  const kerja: KerjaZona[] = (["Tenant", "Publik"] as Zona[]).map((z) => {
    const b = orang.filter((o) => o.zona === z);
    const orangHari = b.reduce((t, o) => t + o.hari, 0);
    const totalArea = (z === "Tenant" ? c.area_tenant : c.area_publik).length;
    const cak = hariUji.map((h) => {
      const set = new Set(ronde.filter((l) => l.tanggal === h && l.zona === z).flatMap((l) => l.area || []));
      return totalArea ? (set.size / totalArea) * 100 : 0;
    });
    const p = permUji.filter((x) => staf.some((n) => samaNama(n, x.diterima_oleh)) && zonaUntuk(c, x.diterima_oleh || "", tglWITA(x.waktu_minta)) === z);
    const r = respon(p);
    const menitHari = orangHari ? p.reduce((t, x) => t + menitPermintaan(x), 0) / orangHari : null;
    return {
      zona: z, rondePerOrangHari: orangHari ? b.reduce((t, o) => t + o.ronde, 0) / orangHari : null, cakupan: rata(cak),
      permintaan: p.length, menitPelayananPerOrangHari: menitHari, utilisasiPelayanan: menitHari === null ? null : (menitHari / a.ob_menit_produktif) * 100,
      responMenit: rata(r), persenCepat: r.length ? (r.filter((m) => m <= 10).length / r.length) * 100 : null,
      lemburJam: b.reduce((t, o) => t + o.lemburJam, 0), kepatuhan: orangHari ? (b.reduce((t, o) => t + o.hariPatuh, 0) / orangHari) * 100 : null,
    };
  });
  const bantuZonaLain = kerja.find((k) => k.zona === "Publik")?.permintaan || 0; // permintaan tenant yang diambil Zona Publik

  const beban = bebanTerukur(c, hariUji, data, permUji);
  const [bT, bP] = beban;
  const totalOrang = bT.orang + bP.orang;
  let saranPembagian: string | null = null;
  if (bT.kebutuhan + bP.kebutuhan > 0 && totalOrang > 0) {
    const idealT = Math.min(totalOrang - 1, Math.max(1, Math.round((totalOrang * bT.kebutuhan) / (bT.kebutuhan + bP.kebutuhan))));
    saranPembagian = idealT === bT.orang ? `Pembagian ${bT.orang}-${bP.orang} sudah sesuai proporsi beban.` : `Proporsi beban menyarankan ${idealT} orang Tenant - ${totalOrang - idealT} orang Publik.`;
  }

  // kesimpulan otomatis
  const alasan: string[] = [];
  let buruk = 0, baik = 0;
  for (const b of beban) {
    alasan.push(`Zona ${b.zona}: butuh ${f1(b.kebutuhan)} orang, ada ${b.orang} → indeks ${Math.round(b.indeks)}% (${b.status}).`);
    if (b.indeks > 120) buruk += 2; else if (b.indeks > 100) buruk += 1;
  }
  if (bT.indeks <= 100 && bP.indeks <= 100) baik++;
  if (Math.abs(bT.indeks - bP.indeks) >= 30) { buruk++; alasan.push(`Beban antar zona tidak seimbang (selisih ${Math.round(Math.abs(bT.indeks - bP.indeks))} poin). ${saranPembagian || ""}`); }
  if (uji.responMenit !== null && lama.responMenit !== null && lama.responMenit > 0) {
    const d = (uji.responMenit - lama.responMenit) / lama.responMenit;
    if (d <= -0.15) { baik++; alasan.push(`Respon permintaan lebih cepat (${f1(lama.responMenit)} → ${f1(uji.responMenit)} menit).`); }
    else if (d >= 0.2) { buruk++; alasan.push(`Respon permintaan lebih lambat (${f1(lama.responMenit)} → ${f1(uji.responMenit)} menit).`); }
    else alasan.push(`Respon permintaan relatif sama (${f1(lama.responMenit)} → ${f1(uji.responMenit)} menit).`);
  } else if (uji.responMenit !== null) alasan.push(`Respon permintaan rata-rata ${f1(uji.responMenit)} menit (pola lama belum ada data pembanding).`);
  if (uji.lemburJam > lama.lemburJam * 1.2 + 1) { buruk++; alasan.push(`Lembur naik (${f1(lama.lemburJam)} → ${f1(uji.lemburJam)} jam).`); }
  else if (lama.lemburJam > 0 && uji.lemburJam < lama.lemburJam * 0.8) { baik++; alasan.push(`Lembur turun (${f1(lama.lemburJam)} → ${f1(uji.lemburJam)} jam).`); }
  for (const k of kerja) if (k.cakupan !== null && hariUji.length) {
    if (k.cakupan < 80) { buruk++; alasan.push(`Zona ${k.zona}: rata-rata hanya ${Math.round(k.cakupan)}% area tercentang per hari — ada area yang tidak terpegang.`); }
    else if (k.cakupan >= 95) baik++;
  }
  if (bantuZonaLain > 0) alasan.push(`Zona Publik ikut mengambil ${bantuZonaLain} permintaan tenant (tanda Zona Tenant kewalahan bila sering).`);
  const warna: "hijau" | "oranye" | "merah" = !hariUji.length ? "oranye" : buruk >= 2 && buruk > baik ? "merah" : baik >= 2 && baik > buruk ? "hijau" : "oranye";
  const judul = !hariUji.length ? "Uji coba belum dimulai" : warna === "hijau" ? "Pola zona cenderung MERINGANKAN" : warna === "merah" ? "Pola zona cenderung MEMBERATKAN" : "Belum ada perbedaan jelas";

  const catatan = ronde.filter((l) => l.catatan).map((l) => ({ tanggal: l.tanggal, nama: l.nama, zona: l.zona, teks: l.catatan! })).sort((x, y) => y.tanggal.localeCompare(x.tanggal));
  return { beban, kerja, orang, uji, lama, bantuZonaLain, saranPembagian, catatan, kesimpulan: { warna, judul, alasan }, hariBerjalan: hariUji.length };
}
