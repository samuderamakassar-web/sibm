// §176 Rencana tugas harian pola zona (keputusan user 2 Nov) -- murni, tanpa Firebase supaya mudah diuji.
//
// Pola normal (4 orang):
//   Zona Tenant (2)  : pagi 1 lantai tenant, lalu PELAYANAN lantai tenant masing-masing (dibagi rata jumlah tenant)
//   Zona Publik      : 1 orang TOILET (semua toilet, tanpa cadangan)
//                      1 orang AREA LAIN (lobby, basement, parkiran, pantry, mushallah, koridor, mingguan)
//                      + cadangan pelayanan setiap hari (jam_cadangan)
//   Pagi bersama     : lantai tenant terberat ke orang Tenant, sisa (L1) dibagi Area Lain (bagian besar) & Toilet (kecil)
//
// Kalau ada yang tidak hadir (ditandai Admin):
//   A1 1 orang Tenant  : bagian paginya -> Area Lain (bagian pagi Area Lain -> Toilet); Tenant yang hadir melayani
//                        semua lantai; Area Lain cadangan diperpanjang & hanya area prioritas, sisanya cek 1x
//   A2 orang Toilet    : Area Lain jadi Toilet (+ lobby); Tenant menjaga pantry/mushallah lantainya + koridor
//   A3 orang Area Lain : Toilet tetap toilet (+ lobby); Tenant menjaga pantry/mushallah lantainya + koridor
//   B  2 orang hadir   : X = pelayanan semua tenant + koridor, Y = toilet (2 ronde) + lobby + pantry; pagi cara cepat
//   1 orang hadir      : darurat -- pelayanan, toilet, lobby; lainnya ditunda
import { bagiPagi, bagiPerOrang, lantaiDari, type HasilBagi, type LantaiOk } from "./bagiZona";

export type Peran = "Tenant" | "Toilet" | "Area Lain";
export type Skenario = "normal" | "kurang-tenant" | "kurang-toilet" | "kurang-arealain" | "dua-orang" | "satu-orang" | "kosong";

export interface RencanaOrang {
  nama: string;
  zona: "Tenant" | "Publik";
  peran: Peran;      // peran tetap minggu ini
  tugas: string;     // peran hari ini (bisa berubah karena ada yang tidak hadir)
  pagi: string[];    // ruang tenant pagi bersama
  area: string[];    // area harian setelah pagi
  cekSekali: string[]; // cukup dicek 1x hari ini (orang kurang)
  mingguan: string[];
  pelayanan: string[]; // lantai tenant yang dilayani
  cadangan: string | null; // jam cadangan pelayanan
  catatan: string[];
}
export interface RencanaHari {
  skenario: Skenario;
  judul: string;
  orang: RencanaOrang[];
  tidakHadir: string[];
  ditunda: string[];   // area yang tidak dikerjakan hari ini
  cepat: boolean;      // pagi cara cepat (sampah, meja, sapu)
}
export interface InputRencana {
  tenant: string[]; publik: string[]; toilet: string;
  areaTenant: string[]; areaPublik: string[]; luas: Record<string, number>; mingguan: string[];
  lantai: LantaiOk[]; tidakHadir: string[];
  pagiBersama: boolean; cadangan: boolean; jamCadangan: string;
}

export const JUDUL_SKENARIO: Record<Skenario, string> = {
  normal: "Normal — semua hadir",
  "kurang-tenant": "A1 — 1 orang Zona Tenant tidak hadir",
  "kurang-toilet": "A2 — pemegang Toilet tidak hadir",
  "kurang-arealain": "A3 — pemegang Area Lain tidak hadir",
  "dua-orang": "B — hanya 2 orang hadir (tugas inti saja)",
  "satu-orang": "Darurat — hanya 1 orang hadir",
  kosong: "Tidak ada petugas hadir",
};

const sama = (a = "", b = "") => a.trim().toLowerCase() === b.trim().toLowerCase();
const ada = (daftar: string[], n: string) => daftar.some((x) => sama(x, n));
export const areaToilet = (a: string) => /toilet|wc/i.test(a);
const areaLobby = (a: string) => /lobby|lobi/i.test(a);
const areaPantry = (a: string) => /pantry/i.test(a);
const areaMushallah = (a: string) => /mushal|musholl|musala/i.test(a);
const areaKoridor = (a: string) => lantaiDari(a) === "Bersama";
const unik = (a: string[]) => Array.from(new Set(a));

/** Jam cadangan diperpanjang saat Zona Tenant kurang orang: "11.00–14.00" -> "09.00–15.00". */
export const JAM_CADANGAN_PANJANG = "09.00–15.00";

/** Pemegang toilet minggu tsb: pilihan admin bila anggota Publik minggu itu, selain itu anggota pertama. */
export function pemegangToilet(publik: string[], pilihan?: string): string {
  return pilihan && ada(publik, pilihan) ? publik.find((x) => sama(x, pilihan))! : publik[0] || "";
}

/** Lantai tenant -> jumlah tenant (untuk membagi pelayanan rata). */
function lantaiTenant(areaTenant: string[]) {
  const m = new Map<string, number>();
  areaTenant.forEach((a) => { const l = lantaiDari(a); if (l !== "Bersama") m.set(l, (m.get(l) || 0) + 1); });
  return m;
}

/** Pelayanan: tiap orang Tenant melayani lantai pagi-nya, sisa lantai ke yang tenantnya paling sedikit. */
function bagiPelayanan(orang: { nama: string; pagi: string[] }[], areaTenant: string[]): Map<string, string[]> {
  const jumlah = lantaiTenant(areaTenant);
  const hasil = new Map<string, string[]>(orang.map((o) => [o.nama, []]));
  if (!orang.length) return hasil;
  const beban = (n: string) => (hasil.get(n) || []).reduce((t, l) => t + (jumlah.get(l) || 0), 0);
  const sisa: string[] = [];
  Array.from(jumlah.keys()).sort((x, y) => (jumlah.get(y)! - jumlah.get(x)!) || x.localeCompare(y)).forEach((l) => {
    const pemilik = orang.find((o) => o.pagi.some((a) => lantaiDari(a) === l));
    if (pemilik && !hasil.get(pemilik.nama)!.length) hasil.get(pemilik.nama)!.push(l); else sisa.push(l);
  });
  sisa.forEach((l) => {
    const o = orang.reduce((m, x) => (beban(x.nama) < beban(m.nama) ? x : m), orang[0]);
    hasil.get(o.nama)!.push(l);
  });
  hasil.forEach((v) => v.sort());
  return hasil;
}

/** Ruang tenant pagi: lantai utuh terberat ke orang berurutan, lantai sisa dipecah ke yang belum kebagian. */
function bagiPagiOrang(c: InputRencana, urutan: string[]): HasilBagi {
  if (!urutan.length || !c.pagiBersama) return { orang: urutan.map((nama) => ({ nama, area: [], m2: 0, lantai: [] })), bersama: [] };
  return bagiPagi(c.areaTenant, urutan, c.lantai, c.luas, c.mingguan);
}

export function rencanaHari(c: InputRencana): RencanaHari {
  const mingguanSet = new Set(c.mingguan);
  const harianPublik = c.areaPublik.filter((a) => !mingguanSet.has(a));
  const mingguanPublik = c.areaPublik.filter((a) => mingguanSet.has(a));
  const toiletList = harianPublik.filter(areaToilet);
  const lainList = harianPublik.filter((a) => !areaToilet(a));

  const absen = (n: string) => ada(c.tidakHadir, n);
  const toilet = pemegangToilet(c.publik, c.toilet);
  const areaLain = c.publik.filter((n) => !sama(n, toilet));
  const tH = c.tenant.filter((n) => !absen(n));
  const toiletH = !!toilet && !absen(toilet);
  const lainH = areaLain.filter((n) => !absen(n));
  const semua = [...c.tenant, ...c.publik];
  const hadir = semua.filter((n) => !absen(n));
  const tidakHadir = semua.filter(absen);

  const buat = (nama: string): RencanaOrang => {
    const zona = ada(c.tenant, nama) ? "Tenant" : "Publik";
    const peran: Peran = zona === "Tenant" ? "Tenant" : sama(nama, toilet) ? "Toilet" : "Area Lain";
    return { nama, zona, peran, tugas: peran, pagi: [], area: [], cekSekali: [], mingguan: [], pelayanan: [], cadangan: null, catatan: [] };
  };

  let skenario: Skenario;
  if (!hadir.length) skenario = "kosong";
  else if (hadir.length === 1 && semua.length > 1) skenario = "satu-orang";
  else if (semua.length >= 4 && hadir.length <= semua.length / 2) skenario = "dua-orang";
  else if (tH.length < c.tenant.length) skenario = "kurang-tenant";
  else if (toilet && !toiletH) skenario = "kurang-toilet";
  else if (lainH.length < areaLain.length) skenario = "kurang-arealain";
  else skenario = "normal";

  const orang = hadir.map(buat);
  const cari = (n: string) => orang.find((o) => sama(o.nama, n))!;
  const ditunda: string[] = [];
  let cepat = false;

  // ---------- pagi: rencana normal dulu, lalu bagian yang tidak hadir dipindah ----------
  const pagiNormal = bagiPagiOrang(c, [...c.tenant, ...areaLain, ...(toilet ? [toilet] : [])]);
  const pagiDari = (n: string) => pagiNormal.orang.find((o) => sama(o.nama, n))?.area || [];
  const pindahPagi = (dari: string, ke: string) => { cari(ke).pagi.push(...pagiDari(dari)); };

  if (skenario === "dua-orang" || skenario === "satu-orang") {
    cepat = c.pagiBersama;
    // X = pelayanan (orang Tenant bila ada; kalau tidak, Area Lain), Y = toilet & publik inti (pemegang toilet bila hadir)
    const y = toiletH ? toilet : lainH[0] || hadir.find((n) => !ada(tH, n)) || hadir[hadir.length - 1];
    const x = hadir.find((n) => !sama(n, y)) || "";
    const urut = [x, y].filter(Boolean);
    if (c.pagiBersama) {
      const p = bagiPerOrang(c.areaTenant, urut, "Tenant", c.lantai, c.luas, c.mingguan);
      p.orang.forEach((o) => cari(o.nama).pagi.push(...o.area, ...p.bersama));
    }
    const lantaiSemua = Array.from(lantaiTenant(c.areaTenant).keys()).sort();
    if (skenario === "satu-orang") {
      const o = cari(hadir[0]);
      o.tugas = "Semua (darurat)";
      o.pelayanan = lantaiSemua;
      o.area = unik([...toiletList, ...lainList.filter(areaLobby)]);
      o.catatan.push("Hanya kamu yang hadir: pelayanan tenant didahulukan, lalu toilet & lobby. Area lain ditunda.");
      ditunda.push(...lainList.filter((a) => !areaLobby(a)), ...mingguanPublik);
    } else {
      const ox = cari(x), oy = cari(y);
      ox.tugas = "Pelayanan semua tenant";
      ox.pelayanan = lantaiSemua;
      ox.area = lainList.filter(areaKoridor);
      ox.catatan.push("Hanya 2 orang hadir: kamu pegang pelayanan semua lantai tenant + koridor.");
      oy.tugas = "Toilet & publik inti";
      oy.area = unik([...toiletList, ...lainList.filter((a) => areaLobby(a) || areaPantry(a))]);
      oy.cekSekali = lainList.filter(areaMushallah);
      oy.catatan.push("Hanya 2 orang hadir: toilet cukup 2 ronde (pagi & setelah makan siang), lalu lobby & pantry.");
      ditunda.push(...lainList.filter((a) => !ox.area.includes(a) && !oy.area.includes(a) && !oy.cekSekali.includes(a)), ...mingguanPublik);
    }
    if (cepat) orang.forEach((o) => o.pagi.length && o.catatan.unshift("Pagi cara cepat: buang sampah, lap meja, sapu (pel menyeluruh ditunda)."));
  } else if (skenario !== "kosong") {
    // pagi
    hadir.forEach((n) => cari(n).pagi.push(...pagiDari(n)));
    if (skenario === "kurang-tenant") {
      const al = lainH[0];
      if (al) {
        if (toiletH) { cari(toilet).pagi.push(...cari(al).pagi); cari(al).pagi = []; }
        c.tenant.filter(absen).forEach((n) => pindahPagi(n, al));
      } else c.tenant.filter(absen).forEach((n) => pindahPagi(n, tH[0] || hadir[0]));
    } else if (skenario === "kurang-toilet") {
      pindahPagi(toilet, lainH[0] || hadir[0]);
    } else if (skenario === "kurang-arealain") {
      areaLain.filter(absen).forEach((n) => pindahPagi(n, toiletH ? toilet : hadir[0]));
    }

    // pelayanan Zona Tenant
    const tenantO = tH.map(cari);
    if (skenario === "kurang-tenant") {
      const semuaLantai = Array.from(lantaiTenant(c.areaTenant).keys()).sort();
      tenantO.forEach((o) => { o.pelayanan = semuaLantai; o.tugas = "Pelayanan semua tenant"; });
    } else {
      const p = bagiPelayanan(tenantO.map((o) => ({ nama: o.nama, pagi: o.pagi })), c.areaTenant);
      tenantO.forEach((o) => { o.pelayanan = p.get(o.nama) || []; });
    }
    // keliling ruang tenant di lantai pelayanannya
    tenantO.forEach((o) => { o.area = c.areaTenant.filter((a) => o.pelayanan.includes(lantaiDari(a))); });

    if (skenario === "normal" || skenario === "kurang-tenant") {
      if (toiletH) cari(toilet).area = [...toiletList];
      const alO = lainH.map(cari);
      if (alO.length) {
        // area lain dibagi per orang bila lebih dari 1 (koridor tetap bersama)
        const bagi = bagiPerOrang(lainList, alO.map((o) => o.nama), "Publik", c.lantai, c.luas, c.mingguan);
        alO.forEach((o) => { o.area = [...(bagi.orang.find((x) => sama(x.nama, o.nama))?.area || []), ...bagi.bersama]; });
        if (!toiletH) alO[0].area.unshift(...toiletList);
        if (skenario === "normal") {
          alO.forEach((o) => { o.mingguan = mingguanPublik.filter((_, i) => i % alO.length === alO.indexOf(o)); });
          if (c.cadangan) alO[0].cadangan = c.jamCadangan;
        } else {
          // A1: Area Lain jadi cadangan panjang, hanya area prioritas; sisanya cek 1x, mingguan ditunda
          const o = alO[0];
          const prioritas = o.area.filter((a) => areaToilet(a) || areaLobby(a) || areaPantry(a) || areaKoridor(a));
          o.cekSekali = o.area.filter((a) => !prioritas.includes(a));
          o.area = prioritas;
          o.cadangan = JAM_CADANGAN_PANJANG;
          o.tugas = "Area Lain + cadangan panjang";
          o.catatan.push(`Zona Tenant kurang orang: cadangan pelayanan diperpanjang ${JAM_CADANGAN_PANJANG}. Di sela itu cukup lobby, pantry, koridor.`);
          alO.slice(1).forEach((x) => { x.cekSekali = x.area.filter((a) => !areaLobby(a) && !areaPantry(a) && !areaKoridor(a)); x.area = x.area.filter((a) => !x.cekSekali.includes(a)); });
          ditunda.push(...mingguanPublik);
        }
      } else if (toiletH) {
        // tidak ada Area Lain sama sekali (zona Publik 1 orang): toilet pegang semua
        cari(toilet).area.push(...lainList);
        cari(toilet).mingguan = [...mingguanPublik];
        if (c.cadangan && skenario === "normal") cari(toilet).cadangan = c.jamCadangan;
      }
      if (skenario === "kurang-tenant" && toiletH && cari(toilet).pagi.length)
        cari(toilet).catatan.push("Pagi kamu pegang ruang tenant Lantai 1 penuh — ronde toilet pertama mulai 09.00.");
    } else {
      // A2 / A3: 1 orang Publik tersisa pegang toilet + lobby; Tenant jaga pantry/mushallah lantainya + koridor
      const sisa = toiletH ? cari(toilet) : cari(lainH[0] || hadir[0]);
      sisa.tugas = toiletH ? "Toilet + lobby" : "Toilet + lobby (menggantikan)";
      sisa.area = unik([...toiletList, ...lainList.filter(areaLobby)]);
      const diTenant = new Set<string>();
      tenantO.forEach((o) => {
        const ikut = lainList.filter((a) => (areaPantry(a) || areaMushallah(a)) && o.pelayanan.includes(lantaiDari(a)));
        const koridor = lainList.filter(areaKoridor);
        o.area = unik([...o.area, ...ikut, ...koridor]);
        [...ikut, ...koridor].forEach((a) => diTenant.add(a));
        if (ikut.length || koridor.length) o.catatan.push("Rekan Zona Publik kurang: jaga juga koridor & pantry/mushallah di lantai tenantmu.");
      });
      sisa.cekSekali = lainList.filter((a) => !sisa.area.includes(a) && !diTenant.has(a));
      sisa.catatan.push(`${toiletH ? "Rekan Area Lain" : "Pemegang toilet"} tidak hadir: kamu pegang semua toilet + lobby. Area lain cukup dicek 1x.`);
      lainH.filter((n) => !sama(n, sisa.nama)).forEach((n) => { const o = cari(n); o.area = lainList.filter((a) => !sisa.area.includes(a) && !diTenant.has(a)); });
      if (lainH.length > 1) sisa.cekSekali = [];
      ditunda.push(...mingguanPublik);
    }
  }

  orang.forEach((o) => {
    o.pagi = unik(o.pagi).sort((x, y) => c.areaTenant.indexOf(x) - c.areaTenant.indexOf(y));
    o.area = unik(o.area);
  });
  // urutan tampil: Tenant dulu lalu Publik, sesuai daftar
  orang.sort((a, b) => semua.findIndex((n) => sama(n, a.nama)) - semua.findIndex((n) => sama(n, b.nama)));
  return { skenario, judul: JUDUL_SKENARIO[skenario], orang, tidakHadir, ditunda: unik(ditunda), cepat };
}
