// Pembagian tugas zona per orang (§173) -- area zona dibagi ke anggota zona per LANTAI dengan beban luas
// seimbang (data Okupansi). File ini murni (tanpa Firebase) supaya mudah diuji.
//
// Bobot per item area (m² setara, sama dengan asumsi Beban Kerja §119):
//   Tenant : luas unit tenant tsb di lantainya (Okupansi), tanpa data = 30 m²
//   Publik : toilet = m² setara toilet (60); area cocok dengan unit Okupansi di lantai yang sama = luasnya
//            (parkir/teras/taman/garden/rooftop × bobot ringan 0,3); tidak ketemu = 15 m²
//   Area "semua lantai"/koridor = tugas BERSAMA (semua anggota), tidak ikut dibagi.
// Algoritma: lantai terberat dulu -> diberikan utuh ke anggota paling ringan bila tidak melewati 115% beban rata-rata;
// kalau melewati, item lantai itu dipecah ke anggota (item terbesar ke yang paling ringan). Hasil selalu sama
// untuk data yang sama (deterministik).

export interface UnitOk { nama?: string; tenant?: string; luas?: number; status?: string }
export interface LantaiOk { nama?: string; unit?: UnitOk[] }

export const BOBOT_RINGAN = 0.3;
export const M2_PER_TOILET = 60;
const BAWAAN_TENANT = 30;
const BAWAAN_PUBLIK = 15;
const SEMUA = "Bersama";

/** "Lantai 2 · Toilet", "Lantai 2. Pantry", "LANTAI 5", "Basement · Gudang", "Lobby" -> nama lantai baku. */
export function lantaiDari(teks: string): string {
  const s = teks.toLowerCase();
  if (/semua lantai|koridor/.test(s)) return SEMUA;
  if (/basement|ground/.test(s)) return "Basement";
  const m = /lantai\s*(\d+)/.exec(s);
  if (m) return `Lantai ${m[1]}`;
  if (/lobby|lobi/.test(s)) return "Lantai 1";
  return "Lainnya";
}
const bagianNama = (area: string) => area.replace(/^.*?(lantai\s*\d+|basement)\s*[·.:\-]\s*/i, "").trim();
// kata umum (nama lantai, "ruang", "area") tidak dipakai mencocokkan -- "Basement · Gudang" harus ke unit Gudang,
// bukan ke "Mushallah Basement" hanya karena sama-sama memuat kata basement
const KATA_UMUM = new Set(["basement", "ground", "lantai", "ruang", "ruangan", "area", "bagian", "depan", "belakang"]);
const kata = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !KATA_UMUM.has(w));
const ringan = (s: string) => /parkir|teras|garden|taman|rooftop/i.test(s);

export function bobotArea(area: string, zona: "Tenant" | "Publik", lantai: LantaiOk[]): number {
  const nmLantai = lantaiDari(area);
  const unitLantai = lantai.filter((l) => lantaiDari(l.nama || "") === nmLantai).flatMap((l) => l.unit || []);
  const nama = bagianNama(area);
  if (zona === "Tenant") {
    const luas = unitLantai.filter((u) => u.status === "terisi" && (u.tenant || "").trim().toLowerCase() === nama.toLowerCase())
      .reduce((t, u) => t + (Number(u.luas) || 0), 0);
    return luas > 0 ? luas : BAWAAN_TENANT;
  }
  if (/toilet|wc/i.test(area)) return M2_PER_TOILET;
  const kunci = kata(area);
  const cocok = unitLantai.find((u) => kata(u.nama || "").some((w) => kunci.some((k) => k.startsWith(w) || w.startsWith(k))));
  if (cocok && Number(cocok.luas) > 0) return Number(cocok.luas) * (ringan(`${area} ${cocok.nama}`) ? BOBOT_RINGAN : 1);
  return ringan(area) ? BAWAAN_PUBLIK * BOBOT_RINGAN : BAWAAN_PUBLIK;
}

export interface TugasOrang { nama: string; area: string[]; m2: number; lantai: string[] }
export interface HasilBagi { orang: TugasOrang[]; bersama: string[] }

// §174 luas manual per area: baris daftar area "Lantai 3 · PT X | 60" -> label "Lantai 3 · PT X", luas 60 m².
// Dipakai saat data Okupansi tidak sesuai kondisi lapangan (mis. renovasi). Mengalahkan bobot dari Okupansi.
export function uraiArea(baris: string[]): { area: string[]; luas: Record<string, number> } {
  const area: string[] = [], luas: Record<string, number> = {};
  baris.map((b) => b.trim()).filter(Boolean).forEach((b) => {
    const m = /^(.*?)\s*\|\s*([\d]+(?:[.,]\d+)?)\s*(?:m2|m²)?\s*$/i.exec(b);
    const label = (m ? m[1] : b).trim();
    if (!label || area.includes(label)) return;
    area.push(label);
    if (m) luas[label] = Number(m[2].replace(",", "."));
  });
  return { area, luas };
}
/** Kebalikan uraiArea -- untuk mengisi kembali textarea admin. */
export const gabungArea = (area: string[], luas: Record<string, number> = {}) => area.map((a) => (luas[a] ? `${a} | ${luas[a]}` : a));

export function bagiPerOrang(area: string[], anggota: string[], zona: "Tenant" | "Publik", lantai: LantaiOk[], luasManual: Record<string, number> = {}): HasilBagi {
  const bersama = area.filter((a) => lantaiDari(a) === SEMUA);
  const dibagi = area.filter((a) => lantaiDari(a) !== SEMUA);
  const orang: TugasOrang[] = anggota.map((nama) => ({ nama, area: [], m2: 0, lantai: [] }));
  if (!orang.length) return { orang, bersama };
  const bobot = new Map(dibagi.map((a) => [a, luasManual[a] > 0 ? luasManual[a] : bobotArea(a, zona, lantai)]));
  const perLantai = new Map<string, string[]>();
  dibagi.forEach((a) => { const l = lantaiDari(a); perLantai.set(l, [...(perLantai.get(l) || []), a]); });
  const total = dibagi.reduce((t, a) => t + (bobot.get(a) || 0), 0);
  const batas = (total / orang.length) * 1.15;
  const termurah = () => orang.reduce((min, o) => (o.m2 < min.m2 ? o : min), orang[0]);
  const beri = (o: TugasOrang, a: string) => { o.area.push(a); o.m2 += bobot.get(a) || 0; };
  const urutLantai = Array.from(perLantai.entries())
    .map(([l, items]) => ({ l, items, m2: items.reduce((t, a) => t + (bobot.get(a) || 0), 0) }))
    .sort((x, y) => y.m2 - x.m2 || x.l.localeCompare(y.l));
  for (const { items, m2 } of urutLantai) {
    const o = termurah();
    if (orang.length === 1 || o.m2 + m2 <= batas) items.forEach((a) => beri(o, a));
    else [...items].sort((x, y) => (bobot.get(y) || 0) - (bobot.get(x) || 0) || x.localeCompare(y)).forEach((a) => beri(termurah(), a));
  }
  orang.forEach((o) => {
    o.area.sort((x, y) => area.indexOf(x) - area.indexOf(y));
    o.lantai = Array.from(new Set(o.area.map(lantaiDari)));
    o.m2 = Math.round(o.m2 * 10) / 10;
  });
  return { orang, bersama };
}
