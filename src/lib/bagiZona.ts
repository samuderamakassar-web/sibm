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
// §175 penanda "mingguan" (cukup 1x/minggu): "Lantai 5 · Rooftop | mingguan" atau "... | 70 | mingguan".
export const FAKTOR_MINGGUAN = 0.2; // 1x dari 5 hari kerja -> bobot harian 1/5
export function uraiArea(baris: string[]): { area: string[]; luas: Record<string, number>; mingguan: string[] } {
  const area: string[] = [], luas: Record<string, number> = {}, mingguan: string[] = [];
  baris.map((b) => b.trim()).filter(Boolean).forEach((b) => {
    const [kepala, ...ekor] = b.split("|").map((s) => s.trim());
    const label = kepala;
    if (!label || area.includes(label)) return;
    area.push(label);
    for (const t of ekor) {
      if (/^mingguan$/i.test(t)) mingguan.push(label);
      else { const m = /^([\d]+(?:[.,]\d+)?)\s*(?:m2|m²)?$/i.exec(t); if (m) luas[label] = Number(m[1].replace(",", ".")); }
    }
  });
  return { area, luas, mingguan };
}
/** Kebalikan uraiArea -- untuk mengisi kembali textarea admin. */
export const gabungArea = (area: string[], luas: Record<string, number> = {}, mingguan: string[] = []) =>
  area.map((a) => [a, luas[a] ? String(luas[a]) : "", mingguan.includes(a) ? "mingguan" : ""].filter(Boolean).join(" | "));

/**
 * §175 pagi bersama (ruang tenant oleh SEMUA): lantai utuh, terberat dulu, ke orang berurutan -- anggota Zona Tenant
 * dulu (siangnya hanya pelayanan), lalu Zona Publik (siangnya masih area publik yang luas). Bila orang lebih banyak
 * dari lantai, lantai terakhir yang dipegang (paling ringan) dipecah dengan orang yang belum kebagian.
 * Contoh: L3, L4 -> 2 orang Tenant; L1 (Asuransi + PPNP) -> dibagi 2 orang Publik.
 */
export function bagiPagi(area: string[], urutanOrang: string[], lantai: LantaiOk[], luasManual: Record<string, number> = {}, mingguan: string[] = []): HasilBagi {
  const per = bagiPerOrang(area, [], "Tenant", lantai, luasManual, mingguan); // hanya untuk memisah "bersama"
  const dibagi = area.filter((a) => !per.bersama.includes(a));
  const orang: TugasOrang[] = urutanOrang.map((nama) => ({ nama, area: [], m2: 0, lantai: [] }));
  if (!orang.length) return { orang, bersama: per.bersama };
  const bobot = (a: string) => (luasManual[a] > 0 ? luasManual[a] : bobotArea(a, "Tenant", lantai)) * (mingguan.includes(a) ? FAKTOR_MINGGUAN : 1);
  const perLantai = new Map<string, string[]>();
  dibagi.forEach((a) => { const l = lantaiDari(a); perLantai.set(l, [...(perLantai.get(l) || []), a]); });
  const lantaiUrut = Array.from(perLantai.entries()).map(([l, items]) => ({ l, items, m2: items.reduce((t, a) => t + bobot(a), 0) }))
    .sort((x, y) => y.m2 - x.m2 || x.l.localeCompare(y.l));
  const beri = (o: TugasOrang, a: string) => { o.area.push(a); o.m2 += bobot(a); };
  lantaiUrut.forEach((f, i) => {
    if (i < orang.length) f.items.forEach((a) => beri(orang[i], a));
    else f.items.forEach((a) => beri(orang.reduce((m, o) => (o.m2 < m.m2 ? o : m), orang[0]), a)); // lantai lebih banyak dari orang
  });
  // orang tanpa lantai -> ikut memecah lantai yang dipegang orang terakhir yang kebagian (yang paling ringan)
  const tanpa = orang.filter((o) => !o.area.length);
  if (tanpa.length && lantaiUrut.length) {
    const pemegang = orang[Math.min(lantaiUrut.length, orang.length) - 1];
    const items = [...pemegang.area].sort((x, y) => bobot(y) - bobot(x) || x.localeCompare(y));
    const kelompok = [pemegang, ...tanpa];
    kelompok.forEach((o) => { o.area = []; o.m2 = 0; });
    items.forEach((a) => beri(kelompok.reduce((m, o) => (o.m2 < m.m2 ? o : m), kelompok[0]), a));
  }
  orang.forEach((o) => {
    o.area.sort((x, y) => area.indexOf(x) - area.indexOf(y));
    o.lantai = Array.from(new Set(o.area.map(lantaiDari)));
    o.m2 = Math.round(o.m2 * 10) / 10;
  });
  return { orang, bersama: per.bersama };
}

export function bagiPerOrang(area: string[], anggota: string[], zona: "Tenant" | "Publik", lantai: LantaiOk[], luasManual: Record<string, number> = {}, mingguan: string[] = []): HasilBagi {
  const bersama = area.filter((a) => lantaiDari(a) === SEMUA);
  const dibagi = area.filter((a) => lantaiDari(a) !== SEMUA);
  const orang: TugasOrang[] = anggota.map((nama) => ({ nama, area: [], m2: 0, lantai: [] }));
  if (!orang.length) return { orang, bersama };
  const bobot = new Map(dibagi.map((a) => [a, (luasManual[a] > 0 ? luasManual[a] : bobotArea(a, zona, lantai)) * (mingguan.includes(a) ? FAKTOR_MINGGUAN : 1)]));
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
