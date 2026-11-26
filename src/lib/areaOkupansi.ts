// §186 Area Zona Tenant langsung dari Okupansi (keputusan user 26 Nov 2026) -- murni, tanpa Firebase.
// Setiap unit "terisi" di okupansi_gedung = 1 ruang tenant di pola zona ("Lantai 3 · SAG | 50").
// Okupansi disimpan -> area_tenant pola zona disinkronkan (ujiPolaZona.sinkronAreaTenantZona), jadi tenant
// pindah / tambah / keluar otomatis ikut. Ruang baru masuk paket pagi yang cocok dengan nama lama, atau ke
// paket pemegang pelayanan lantai itu.
import type { PaketZona, KodePaket } from "./paketZona";

export interface UnitOk { nama?: string; tenant?: string; status?: string; luas?: number }
export interface LantaiOk { nama?: string; luas_total?: number; unit?: UnitOk[] }
export interface RuangTenant { area: string; luas: number; lantai: string; kata: string[] }

/** "LANTAI 5" -> "Lantai 5", "BASEMENT" -> "Basement". */
export function namaLantai(n = ""): string {
  const s = n.trim().replace(/\s+/g, " ");
  const m = /^lantai\s*(\d+)$/i.exec(s);
  if (m) return `Lantai ${m[1]}`;
  if (/^basement$/i.test(s)) return "Basement";
  return s;
}
const pendekTenant = (t = "") => t.replace(/^PT\.?\s+/i, "").trim();
const generik = (nama: string) => !/^[A-Z0-9&.,\s/-]{2,8}$/.test(nama) && nama.length > 6;

/** Ruang tenant dari Okupansi (unit berstatus terisi), urut lantai lalu nama. */
export function ruangTenantOkupansi(lantai: LantaiOk[] | undefined): RuangTenant[] {
  const out: RuangTenant[] = [];
  (lantai || []).forEach((l) => {
    const ln = namaLantai(l.nama);
    const unit = (l.unit || []).filter((u) => u.status === "terisi" && (u.tenant || u.nama));
    unit.forEach((u) => {
      const nama = (u.nama || "").trim() || pendekTenant(u.tenant);
      const kembar = unit.filter((x) => (x.nama || "").trim() === nama).length > 1;
      const label = generik(nama) || kembar ? `${nama} (${pendekTenant(u.tenant) || "-"})` : nama;
      const kata = [nama, u.tenant || "", ...pendekTenant(u.tenant).split(/\s+/).filter((w) => w.length >= 5)].map((k) => k.trim().toLowerCase()).filter(Boolean);
      out.push({ area: `${ln} · ${label}`, luas: Number(u.luas) || 0, lantai: ln, kata });
    });
  });
  return out.sort((a, b) => a.area.localeCompare(b.area));
}

/** Baris area_tenant untuk config pola zona ("Area | luas"). */
export const barisAreaTenant = (r: RuangTenant[]) => r.map((x) => (x.luas > 0 ? `${x.area} | ${x.luas}` : x.area));

/** Lantai dari label area ("Lantai 2. Pantry", "Basement · Gudang"). */
const lantaiLabel = (a: string) => namaLantai(/^(lantai\s*\d+|basement)/i.exec(a.trim())?.[1] || a.split("·")[0]);

/**
 * Paket pagi untuk daftar ruang tenant baru. Kode lama dipertahankan bila ruang baru cocok dengan entri lama
 * di lantai yang sama (nama unit / nama tenant / kata nama tenant ada di label lama); selain itu ikut paket
 * yang memegang pelayanan lantai itu (T1 bila lantai belum punya pemegang).
 */
export function selaraskanPagi(p: PaketZona, ruang: RuangTenant[]): PaketZona["pagi"] {
  return ruang.map((r) => {
    const persis = p.pagi.find((e) => e.area === r.area);
    if (persis) return { area: r.area, kode: persis.kode };
    const mirip = p.pagi.find((e) => lantaiLabel(e.area) === r.lantai && r.kata.some((k) => e.area.split("·").slice(1).join("·").toLowerCase().includes(k)));
    const kode: KodePaket = mirip?.kode || p.pelayanan.find((x) => x.lantai === r.lantai)?.kode || "T1";
    return { area: r.area, kode };
  });
}

/** Unit area bersama di Okupansi yang belum tercakup daftar Zona Publik (saran tambahan untuk admin). */
export function bersamaBelumDiZona(lantai: LantaiOk[] | undefined, areaPublik: string[]): string[] {
  const umum = new Set(["ruang", "area", "lantai", "basement", "kosong"]);
  const out: string[] = [];
  (lantai || []).forEach((l) => {
    const ln = namaLantai(l.nama);
    (l.unit || []).filter((u) => u.status === "bersama" && (u.nama || "").trim()).forEach((u) => {
      const kata = (u.nama || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !umum.has(w));
      const sama = areaPublik.filter((a) => lantaiLabel(a).toLowerCase() === ln.toLowerCase() || (ln === "Lantai 1" && /^lobby/i.test(a)));
      if (!kata.length || !sama.some((a) => kata.some((k) => a.toLowerCase().includes(k)))) out.push(`${ln} · ${(u.nama || "").trim()}`);
    });
  });
  return out;
}
