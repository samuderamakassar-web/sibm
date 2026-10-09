// Kondisi Aset & Temuan (§113) -- pengganti alur "inspeksi OB -> tiket Helpdesk".
// Keputusan user: inspeksi hanya mencatat KONDISI + FOTO (wajib 1 foto per area & per item), dipisah:
//   gedung   = fasilitas gedung per area (OB plot harian)
//   alat     = peralatan kebersihan (alat kerja OB)
//   utilitas = utilitas teknis (genset, panel, pompa, ...) -- hanya OB tetap yang ditunjuk (petugas_utilitas)
// Item yang ditandai "butuh perbaikan/penggantian" menjadi TEMUAN (koleksi temuan_aset) untuk Admin GA,
// BUKAN tiket Helpdesk (Helpdesk khusus laporan pengguna kantor).
// Master daftar item: settings/master_kondisi_aset (diedit di /admin/sop-checklist tab "Kondisi Aset").

import { useEffect, useState } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { ItemSederhana } from "./sopChecklist";

export type JenisInspeksi = "gedung" | "alat" | "utilitas";
export const JENIS_INSPEKSI: JenisInspeksi[] = ["gedung", "alat", "utilitas"];
export const LABEL_JENIS: Record<JenisInspeksi, string> = { gedung: "Fasilitas Gedung", alat: "Peralatan Kebersihan", utilitas: "Utilitas Teknis" };
export const LABEL_TINDAKAN: Record<JenisInspeksi, string> = { gedung: "Perbaikan Gedung", alat: "Penggantian Alat", utilitas: "Perbaikan Utilitas" };
/** Area tetap untuk jenis yang tidak mengikuti plot lantai. */
export const AREA_TETAP: Partial<Record<JenisInspeksi, string>> = { alat: "Peralatan Kebersihan", utilitas: "Utilitas Gedung" };

export const KONDISI: Record<JenisInspeksi, string[]> = {
  gedung: ["Baik", "Perlu Perhatian", "Rusak", "Tidak Ada"],
  alat: ["Baik", "Aus", "Rusak", "Hilang"],
  utilitas: ["Baik", "Perlu Perhatian", "Rusak", "Tidak Ada"],
};
/** Kondisi yang wajib diberi keterangan & bisa diajukan jadi temuan. */
export const kondisiBermasalah = (k: string) => k !== "" && k !== "Baik" && k !== "Tidak Ada";
/** Kondisi yang otomatis dicentang "butuh tindakan". */
export const kondisiDefaultTindakan = (k: string) => k === "Rusak" || k === "Hilang";
export const WARNA_KONDISI: Record<string, { bg: string; fg: string }> = {
  Baik: { bg: "var(--ok-50)", fg: "var(--ok)" },
  "Perlu Perhatian": { bg: "var(--warn-50)", fg: "var(--warn)" },
  Aus: { bg: "var(--warn-50)", fg: "var(--warn)" },
  Rusak: { bg: "var(--red-50)", fg: "var(--red-600)" },
  Hilang: { bg: "var(--red-50)", fg: "var(--red-600)" },
  "Tidak Ada": { bg: "var(--line)", fg: "var(--muted)" },
};

export type StatusTemuan = "Baru" | "Dijadwalkan" | "Dikerjakan" | "Selesai" | "Ditolak";
export const STATUS_TEMUAN: StatusTemuan[] = ["Baru", "Dijadwalkan", "Dikerjakan", "Selesai", "Ditolak"];
export const STATUS_TEMUAN_TERBUKA: StatusTemuan[] = ["Baru", "Dijadwalkan", "Dikerjakan"];
export const WARNA_STATUS_TEMUAN: Record<StatusTemuan, { bg: string; fg: string }> = {
  Baru: { bg: "var(--red-50)", fg: "var(--red-600)" },
  Dijadwalkan: { bg: "var(--warn-50)", fg: "var(--warn)" },
  Dikerjakan: { bg: "var(--info-50)", fg: "var(--info)" },
  Selesai: { bg: "var(--ok-50)", fg: "var(--ok)" },
  Ditolak: { bg: "var(--line)", fg: "var(--muted)" },
};

export interface HasilInspeksiItem { nama: string; kondisi: string; catatan: string; foto: string; butuh_tindakan?: boolean }
export interface InspeksiAsetLog {
  id: string; jenis?: JenisInspeksi; area: string; pic_bertugas: string; minggu_mulai: string;
  waktu_selesai: Timestamp | null; foto_area?: string; hasil: HasilInspeksiItem[];
}
export interface TemuanAset {
  id: string; jenis: JenisInspeksi; area: string; item: string; kondisi: string; catatan: string; foto: string;
  pelapor: string; waktu_lapor?: Timestamp | null; status: StatusTemuan; inspeksi_id?: string;
  rencana?: string; catatan_admin?: string; alasan_tolak?: string; biaya?: number; foto_hasil?: string;
  waktu_selesai?: Timestamp | null; ditangani_oleh?: string; dari_helpdesk_id?: string;
}

export interface MasterKondisiAset { gedung: ItemSederhana[]; alat: ItemSederhana[]; utilitas: ItemSederhana[]; petugas_utilitas: string[] }
const daftar = (xs: string[]): ItemSederhana[] => xs.map((nama) => ({ nama, aktif: true }));
export const MASTER_KONDISI_BAWAAN: MasterKondisiAset = {
  gedung: daftar(["Lampu", "Stop kontak & saklar", "AC", "Pintu & handle", "Kaca jendela", "Plafon", "Lantai", "Wastafel & keran", "Kloset & flush", "Urinoir", "Hand dryer / tisu", "Dispenser", "Kulkas", "Kursi & meja", "Tempat sampah"]),
  alat: daftar(["Mop / pel", "Ember peras", "Sapu & pengki", "Vacuum cleaner", "Floor polisher", "Trolley kebersihan", "Wiper kaca", "Sikat toilet", "Kain microfiber", "Tangga lipat", "Sign lantai basah"]),
  utilitas: daftar(["Genset", "Panel listrik (LVMDP)", "Pompa air bersih", "Pompa hydrant", "Roof tank / ground tank", "STP / IPAL", "Lift"]),
  petugas_utilitas: [],
};

export function useMasterKondisiAset() {
  const [nilai, setNilai] = useState<MasterKondisiAset>(MASTER_KONDISI_BAWAAN);
  const [dariBawaan, setDariBawaan] = useState(true);
  const [dimuat, setDimuat] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "master_kondisi_aset"), (s) => {
      const d = s.data();
      if (d && Array.isArray(d.gedung)) {
        setNilai({ ...MASTER_KONDISI_BAWAAN, ...(d as Partial<MasterKondisiAset>) } as MasterKondisiAset);
        setDariBawaan(false);
      } else { setNilai(MASTER_KONDISI_BAWAAN); setDariBawaan(true); }
      setDimuat(true);
    }, (e) => { console.error("[kondisi aset] master:", e); setDimuat(true); });
    return () => unsub();
  }, []);
  return { nilai, dariBawaan, dimuat };
}

/** Tebak jenis dari nama item (dipakai saat memindahkan tiket Helpdesk lama). */
export const tebakJenisDariItem = (item: string): JenisInspeksi =>
  /genset|panel|pompa|hydrant|lift|stp|ipal|tank|tangki|trafo|mcb/i.test(item) ? "utilitas"
    : /mop|pel\b|ember|sapu|vacuum|polisher|trolley|wiper|sikat|microfiber|tangga/i.test(item) ? "alat" : "gedung";
export const kodeTemuan = (id: string) => `TM-${id.slice(0, 6).toUpperCase()}`;
