// Uji Coba Pola Zona OB (§169) -- semua staf OB & CS jadi "Office Boy", dibedakan ZONA kerja:
//   Tenant  = melayani & membersihkan ruang tenant (semua lantai, semua tenant) + permintaan portal
//   Publik  = lobby, koridor, toilet, tangga, parkiran, taman, dll.
// 2 minggu: minggu 1 tim_tenant/tim_publik sesuai pilihan admin, minggu 2 ditukar otomatis.
// Selama uji coba checklist lama (per lantai, 3 sesi) disembunyikan, potong poin & pengingat sesi
// lama dilewati (scripts/points-deduction.mjs, scripts/fcm-reminder.mjs membaca dokumen yang sama).
//
//   ob_settings/uji_pola_zona { aktif, mulai, tukar_mulai, selesai, tim_tenant[], tim_publik[],
//                               area_tenant[], area_publik[], min_ronde, dibuat_oleh, waktu_update }
//   ob_zona_laporan/{id}      { jenis: "ronde", tanggal, nama, zona, minggu, area[], foto_sebelum, foto_sesudah, catatan }
import { useEffect, useState } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { CHECKLIST_OB_BAWAAN, type AreaChecklist } from "./sopChecklist";

export type Zona = "Tenant" | "Publik";
export const DOC_UJI_POLA = () => doc(db, "ob_settings", "uji_pola_zona");
export const KOLEKSI_LAPORAN_ZONA = "ob_zona_laporan";
export const FOTO_PER_LAPORAN = 2; // sebelum & sesudah (keputusan user)

export interface UjiPolaZona {
  aktif: boolean;
  mulai: string;        // Senin minggu 1 (YYYY-MM-DD)
  tukar_mulai: string;  // Senin minggu 2 -- zona ditukar
  selesai: string;      // Jumat minggu 2
  tim_tenant: string[]; // zona Tenant minggu 1
  tim_publik: string[]; // zona Publik minggu 1
  area_tenant: string[];
  area_publik: string[];
  min_ronde: number;
  dibuat_oleh?: string;
  waktu_update?: Timestamp | null;
}

export interface LaporanZona {
  id: string;
  // §171 hanya "ronde" -- penilaian dari staf ditiadakan (evaluasi otomatis dari data aplikasi)
  jenis: "ronde";
  tanggal: string;
  nama: string;
  zona: Zona;
  minggu: 1 | 2;
  waktu?: Timestamp | null;
  area?: string[];
  foto_sebelum?: string;
  foto_sesudah?: string;
  catatan?: string;
}

/** Tanggal ISO + n hari (aman zona waktu: dihitung di UTC murni). */
export function tambahHari(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const akhirPekan = (iso: string) => { const h = new Date(`${iso}T00:00:00Z`).getUTCDay(); return h === 0 || h === 6; };

/** Mulai = Senin -> tukar = Senin berikutnya, selesai = Jumat minggu ke-2. */
export function jadwalDariMulai(mulai: string) {
  return { mulai, tukar_mulai: tambahHari(mulai, 7), selesai: tambahHari(mulai, 11) };
}

/** Hari kerja (Senin-Jumat, di luar hari libur) dari a s.d. b inklusif. */
export function hariKerja(a: string, b: string, libur: string[] = []): string[] {
  const out: string[] = [];
  for (let d = a; d <= b; d = tambahHari(d, 1)) if (!akhirPekan(d) && !libur.includes(d)) out.push(d);
  return out;
}

export const dalamUjiCoba = (c: UjiPolaZona | null, tanggal: string) => !!c && c.aktif && tanggal >= c.mulai && tanggal <= c.selesai;
export const mingguKe = (c: UjiPolaZona, tanggal: string): 1 | 2 => (tanggal >= c.tukar_mulai ? 2 : 1);

/** Zona staf pada tanggal tsb (null = tidak ikut uji coba / di luar periode). */
export function zonaUntuk(c: UjiPolaZona | null, nama: string, tanggal: string): Zona | null {
  if (!c || !dalamUjiCoba(c, tanggal)) return null;
  const n = nama.trim().toLowerCase();
  const diTenant = c.tim_tenant.some((x) => x.trim().toLowerCase() === n);
  const diPublik = c.tim_publik.some((x) => x.trim().toLowerCase() === n);
  if (!diTenant && !diPublik) return null;
  const awal: Zona = diTenant ? "Tenant" : "Publik";
  return mingguKe(c, tanggal) === 1 ? awal : awal === "Tenant" ? "Publik" : "Tenant";
}

/** Anggota zona pada tanggal tsb. */
export function anggotaZona(c: UjiPolaZona, zona: Zona, tanggal: string): string[] {
  const m1 = zona === "Tenant" ? c.tim_tenant : c.tim_publik;
  const m2 = zona === "Tenant" ? c.tim_publik : c.tim_tenant;
  return mingguKe(c, tanggal) === 1 ? m1 : m2;
}

// ---------- Daftar area bawaan (bisa diubah admin di halaman uji coba) ----------
interface UnitOkupansi { nama?: string; tenant?: string; status?: string }
interface LantaiOkupansi { nama?: string; unit?: UnitOkupansi[] }

/** Zona Tenant: tiap tenant per lantai dari Okupansi; tanpa data -> "Ruang tenant Lantai 1..4". */
export function areaTenantBawaan(lantai: LantaiOkupansi[] | undefined): string[] {
  const daftar = new Set<string>();
  (lantai || []).forEach((l) => (l.unit || []).forEach((u) => {
    if (u.status === "terisi" && u.tenant) daftar.add(`${l.nama || "Lantai ?"} · ${u.tenant}`);
  }));
  if (daftar.size) return Array.from(daftar).sort();
  return ["Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4"].map((l) => `Ruang tenant ${l}`);
}

/** Zona Publik: segmen SOP checklist (kecuali ruang kerja = wilayah tenant & pelayanan) + lobby & koridor. */
export function areaPublikBawaan(master: AreaChecklist[] = CHECKLIST_OB_BAWAAN): string[] {
  const daftar: string[] = ["Lobby", "Koridor & lift semua lantai"];
  master.filter((a) => !a.area.toLowerCase().includes("pelayanan")).forEach((a) => {
    a.segmen.filter((s) => s.aktif !== false && !/ruang kerja/i.test(s.nama)).forEach((s) => daftar.push(`${a.area} · ${s.nama}`));
  });
  return Array.from(new Set(daftar));
}

export function rapikanConfig(d: Record<string, unknown> | undefined): UjiPolaZona | null {
  if (!d || typeof d.mulai !== "string") return null;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  return {
    aktif: d.aktif === true,
    mulai: d.mulai,
    tukar_mulai: String(d.tukar_mulai || tambahHari(d.mulai, 7)),
    selesai: String(d.selesai || tambahHari(d.mulai, 11)),
    tim_tenant: arr(d.tim_tenant),
    tim_publik: arr(d.tim_publik),
    area_tenant: arr(d.area_tenant),
    area_publik: arr(d.area_publik),
    min_ronde: Math.max(1, Number(d.min_ronde) || 1),
    dibuat_oleh: typeof d.dibuat_oleh === "string" ? d.dibuat_oleh : "",
    waktu_update: (d.waktu_update as Timestamp) || null,
  };
}

/** Konfigurasi uji coba (live). dimuat=false selama belum terbaca. */
export function useUjiPolaZona() {
  const [config, setConfig] = useState<UjiPolaZona | null>(null);
  const [dimuat, setDimuat] = useState(false);
  useEffect(() => onSnapshot(DOC_UJI_POLA(), (s) => { setConfig(rapikanConfig(s.data())); setDimuat(true); }, (e) => {
    console.error("[uji-pola-zona]", e); setDimuat(true);
  }), []);
  return { config, dimuat };
}
