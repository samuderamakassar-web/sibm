// Evaluasi Uji Coba Pola Zona OB (§169): uji coba (2 minggu) vs 2 minggu sebelumnya (pola lama),
// Zona Tenant vs Zona Publik, dan minggu 1 vs minggu 2 per orang (rotasi -> beban karena zona atau orangnya).
import type { Timestamp } from "firebase/firestore";
import { hariKerja, tambahHari, zonaUntuk, type LaporanZona, type UjiPolaZona, type Zona } from "./ujiPolaZona";

export interface Permintaan { jenis?: string; diterima_oleh?: string; waktu_minta?: Timestamp | null; waktu_terima?: Timestamp | null; status?: string }
export interface KlaimLembur { nama_pemohon?: string; status?: string; items?: { tanggal?: string; jam_mulai?: string; jam_selesai?: string }[] }
export interface ChecklistLama { tanggal?: string; pic_bertugas?: string; sesi?: string }

const tglWITA = (ts: Timestamp | null | undefined) => (ts ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(ts.toDate()) : "");
const rata = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const samaNama = (a = "", b = "") => a.trim().toLowerCase() === b.trim().toLowerCase();

export function jamLembur(mulai = "", selesai = ""): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(mulai), s = /^(\d{1,2}):(\d{2})/.exec(selesai);
  if (!m || !s) return 0;
  let menit = Number(s[1]) * 60 + Number(s[2]) - (Number(m[1]) * 60 + Number(m[2]));
  if (menit <= 0) menit += 24 * 60; // lewat tengah malam
  return menit / 60;
}

export interface RingkasPeriode {
  hari: number;               // hari kerja
  permintaan: number;         // permintaan masuk
  permintaanPerHari: number;
  responMenit: number | null; // rata-rata menit minta -> terima
  persenCepat: number | null; // % diterima <= 10 menit
  lemburJam: number;
  lemburPerHari: number;
  laporanPerOrangHari: number | null; // lama: sesi checklist/orang/hari; uji: ronde/orang/hari
}

function ringkas(dari: string, sampai: string, libur: string[], staf: string[], permintaan: Permintaan[], lembur: KlaimLembur[], laporanHarian: number): RingkasPeriode {
  const hari = hariKerja(dari, sampai, libur);
  const set = new Set(hari);
  const p = permintaan.filter((x) => x.status !== "Batal" && set.has(tglWITA(x.waktu_minta)));
  const respon = p.filter((x) => x.waktu_minta && x.waktu_terima).map((x) => (x.waktu_terima!.toMillis() - x.waktu_minta!.toMillis()) / 60000).filter((m) => m >= 0);
  const jam = lembur.filter((k) => k.status !== "Rejected" && staf.some((n) => samaNama(n, k.nama_pemohon)))
    .flatMap((k) => k.items || []).filter((i) => i.tanggal && i.tanggal >= dari && i.tanggal <= sampai)
    .reduce((t, i) => t + jamLembur(i.jam_mulai, i.jam_selesai), 0);
  const n = hari.length || 1;
  return {
    hari: hari.length, permintaan: p.length, permintaanPerHari: p.length / n,
    responMenit: rata(respon), persenCepat: respon.length ? (respon.filter((m) => m <= 10).length / respon.length) * 100 : null,
    lemburJam: jam, lemburPerHari: jam / n,
    laporanPerOrangHari: staf.length && hari.length ? laporanHarian / (staf.length * hari.length) : null,
  };
}

export interface BarisOrang {
  nama: string; minggu: 1 | 2; zona: Zona; hari: number; ronde: number; hariPatuh: number;
  penilaian: number; beban: number | null; bantu: number; permintaanDiterima: number; responMenit: number | null; lemburJam: number;
}
export interface RingkasZona { zona: Zona; beban: number | null; rondePerOrangHari: number | null; permintaanDiterima: number; bantu: number; penilaian: number; lemburJam: number }

export interface HasilEvaluasi {
  uji: { dari: string; sampai: string } & RingkasPeriode;
  lama: { dari: string; sampai: string } & RingkasPeriode;
  orang: BarisOrang[];
  zona: RingkasZona[];
  kendala: { tanggal: string; nama: string; zona: Zona; teks: string }[];
  kesimpulan: { warna: "hijau" | "oranye" | "merah"; judul: string; alasan: string[] };
  bebanRata: number | null;
  hariBerjalan: number;
}

export function hitungEvaluasi(cfg: UjiPolaZona, hariIni: string, libur: string[], laporan: LaporanZona[], permintaan: Permintaan[], lembur: KlaimLembur[], checklistLama: ChecklistLama[]): HasilEvaluasi {
  const c = { ...cfg, aktif: true }; // evaluasi tetap terbaca setelah uji coba dihentikan/selesai
  const staf = [...c.tim_tenant, ...c.tim_publik];
  const sampaiUji = hariIni < c.selesai ? (hariIni < c.mulai ? c.mulai : hariIni) : c.selesai;
  const lamaDari = tambahHari(c.mulai, -14), lamaSampai = tambahHari(c.mulai, -1);
  // pembanding pola lama dipotong sepanjang hari kerja uji coba yang sudah berjalan -> adil saat uji coba belum selesai
  const hariUji = hariKerja(c.mulai, sampaiUji, libur).filter((d) => d <= hariIni);
  const hariLamaSemua = hariKerja(lamaDari, lamaSampai, libur);
  const hariLama = hariLamaSemua.slice(Math.max(0, hariLamaSemua.length - Math.max(hariUji.length, 1)));
  const lamaDariAdil = hariLama[0] || lamaDari;

  const ronde = laporan.filter((l) => l.jenis === "ronde" && hariUji.includes(l.tanggal));
  const penilaian = laporan.filter((l) => l.jenis === "penilaian" && hariUji.includes(l.tanggal));
  const sesiLama = checklistLama.filter((x) => x.tanggal && hariLama.includes(x.tanggal) && staf.some((n) => samaNama(n, x.pic_bertugas)));

  const uji = { dari: c.mulai, sampai: sampaiUji, ...ringkas(c.mulai, sampaiUji, libur, staf, permintaan, lembur, ronde.length) };
  const lama = { dari: lamaDariAdil, sampai: lamaSampai, ...ringkas(lamaDariAdil, lamaSampai, libur, staf, permintaan, lembur, sesiLama.length) };

  // ---- per orang per minggu ----
  const orang: BarisOrang[] = [];
  for (const nama of staf) {
    for (const minggu of [1, 2] as const) {
      const hari = hariUji.filter((d) => (minggu === 1 ? d < c.tukar_mulai : d >= c.tukar_mulai));
      if (!hari.length) continue;
      const zona = zonaUntuk(c, nama, hari[0])!;
      const r = ronde.filter((l) => samaNama(l.nama, nama) && hari.includes(l.tanggal));
      const pn = penilaian.filter((l) => samaNama(l.nama, nama) && hari.includes(l.tanggal));
      const p = permintaan.filter((x) => x.status !== "Batal" && samaNama(x.diterima_oleh, nama) && hari.includes(tglWITA(x.waktu_minta)));
      const resp = p.filter((x) => x.waktu_minta && x.waktu_terima).map((x) => (x.waktu_terima!.toMillis() - x.waktu_minta!.toMillis()) / 60000).filter((m) => m >= 0);
      const lj = lembur.filter((k) => k.status !== "Rejected" && samaNama(k.nama_pemohon, nama)).flatMap((k) => k.items || [])
        .filter((i) => i.tanggal && hari.includes(i.tanggal)).reduce((t, i) => t + jamLembur(i.jam_mulai, i.jam_selesai), 0);
      const perHari = new Map<string, number>();
      r.forEach((l) => perHari.set(l.tanggal, (perHari.get(l.tanggal) || 0) + 1));
      orang.push({
        nama, minggu, zona, hari: hari.length, ronde: r.length, hariPatuh: Array.from(perHari.values()).filter((n) => n >= c.min_ronde).length,
        penilaian: pn.length, beban: rata(pn.map((x) => x.beban || 0).filter(Boolean)), bantu: pn.reduce((t, x) => t + (x.bantu_zona_lain || 0), 0),
        permintaanDiterima: p.length, responMenit: rata(resp), lemburJam: lj,
      });
    }
  }

  const zona: RingkasZona[] = (["Tenant", "Publik"] as Zona[]).map((z) => {
    const b = orang.filter((o) => o.zona === z);
    const pn = penilaian.filter((l) => l.zona === z);
    const orangHari = b.reduce((t, o) => t + o.hari, 0);
    return {
      zona: z, beban: rata(pn.map((x) => x.beban || 0).filter(Boolean)), rondePerOrangHari: orangHari ? b.reduce((t, o) => t + o.ronde, 0) / orangHari : null,
      permintaanDiterima: b.reduce((t, o) => t + o.permintaanDiterima, 0), bantu: b.reduce((t, o) => t + o.bantu, 0), penilaian: pn.length,
      lemburJam: b.reduce((t, o) => t + o.lemburJam, 0),
    };
  });

  const kendala = penilaian.filter((l) => l.kendala).map((l) => ({ tanggal: l.tanggal, nama: l.nama, zona: l.zona, teks: l.kendala! })).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  const bebanRata = rata(penilaian.map((x) => x.beban || 0).filter(Boolean));

  // ---- kesimpulan ----
  const alasan: string[] = [];
  let skorBuruk = 0, skorBaik = 0;
  if (bebanRata !== null) {
    if (bebanRata >= 3.5) { skorBuruk += 2; alasan.push(`Rata-rata beban dari staf ${bebanRata.toFixed(1)}/5 (berat).`); }
    else if (bebanRata <= 2.5) { skorBaik += 2; alasan.push(`Rata-rata beban dari staf ${bebanRata.toFixed(1)}/5 (ringan).`); }
    else alasan.push(`Rata-rata beban dari staf ${bebanRata.toFixed(1)}/5 (sedang).`);
  } else alasan.push("Belum ada penilaian akhir shift dari staf.");
  if (uji.responMenit !== null && lama.responMenit !== null && lama.responMenit > 0) {
    const d = (uji.responMenit - lama.responMenit) / lama.responMenit;
    if (d <= -0.15) { skorBaik++; alasan.push(`Respon permintaan lebih cepat (${lama.responMenit.toFixed(0)} → ${uji.responMenit.toFixed(0)} menit).`); }
    else if (d >= 0.2) { skorBuruk++; alasan.push(`Respon permintaan lebih lambat (${lama.responMenit.toFixed(0)} → ${uji.responMenit.toFixed(0)} menit).`); }
    else alasan.push(`Respon permintaan relatif sama (${lama.responMenit.toFixed(0)} → ${uji.responMenit.toFixed(0)} menit).`);
  }
  if (lama.lemburPerHari > 0 || uji.lemburPerHari > 0) {
    if (uji.lemburPerHari > lama.lemburPerHari * 1.2 + 0.1) { skorBuruk++; alasan.push(`Lembur naik (${lama.lemburJam.toFixed(1)} → ${uji.lemburJam.toFixed(1)} jam).`); }
    else if (uji.lemburPerHari < lama.lemburPerHari * 0.8) { skorBaik++; alasan.push(`Lembur turun (${lama.lemburJam.toFixed(1)} → ${uji.lemburJam.toFixed(1)} jam).`); }
  }
  const [zt, zp] = zona;
  if (zt.beban !== null && zp.beban !== null && Math.abs(zt.beban - zp.beban) >= 1) {
    skorBuruk++;
    alasan.push(`Beban tidak seimbang: Zona ${zt.beban > zp.beban ? "Tenant" : "Publik"} lebih berat (${Math.max(zt.beban, zp.beban).toFixed(1)} vs ${Math.min(zt.beban, zp.beban).toFixed(1)}) — pertimbangkan geser area/orang.`);
  }
  const totalBantu = zt.bantu + zp.bantu;
  if (totalBantu > 0 && hariUji.length) alasan.push(`Saling bantu antar zona ${totalBantu}× (${(totalBantu / hariUji.length).toFixed(1)}/hari).`);
  const warna = skorBuruk >= 2 && skorBuruk > skorBaik ? "merah" : skorBaik >= 2 && skorBaik > skorBuruk ? "hijau" : "oranye";
  const judul = hariUji.length === 0 ? "Uji coba belum dimulai"
    : warna === "hijau" ? "Pola zona cenderung MERINGANKAN" : warna === "merah" ? "Pola zona cenderung MEMBERATKAN" : "Belum ada perbedaan jelas";

  return { uji, lama, orang, zona, kendala, kesimpulan: { warna: hariUji.length ? warna : "oranye", judul, alasan }, bebanRata, hariBerjalan: hariUji.length };
}
