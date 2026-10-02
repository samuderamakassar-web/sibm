// SOP Checklist yang bisa diatur Admin GA (§81) -- checklist harian OB & CS, inspeksi fasilitas OB,
// inspeksi mingguan kendaraan Driver. Dulu ditulis di kode tiap halaman; sekarang disimpan di
// settings/checklist_ob, settings/fasilitas_ob, settings/inspeksi_driver dan diedit di /admin/sop-checklist.
// Selama dokumen belum ada, dipakai daftar BAWAAN di bawah (= isi kode lama).
//
// ID pertanyaan/segmen/item disimpan di laporan -> jangan dipakai ulang untuk arti lain. Laporan juga
// menyimpan teks/label saat itu, jadi riwayat lama tetap terbaca walau master berubah.
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export interface PertanyaanItem { id: string; teks: string; }
export interface SegmentConfig { id: string; nama: string; pertanyaan: PertanyaanItem[]; aktif?: boolean; }
export interface AreaChecklist { area: string; segmen: SegmentConfig[]; }
export interface TugasTambahan { nama_staf: string; segmen: SegmentConfig; }
export interface ItemSederhana { nama: string; aktif: boolean; }
export interface ItemInspeksiDriver { key: string; label: string; aktif: boolean; }

export const ID_SEGMENT_PELAYANAN = "pelayanan";
export const NAMA_STAF_MUSHALLAH_TETAP = "Zainal";

// ---------- Bawaan checklist harian OB (dipindahkan apa adanya dari ChecklistOBPage) ----------
const SEGMENTS_BASEMENT: SegmentConfig[] = [
  {
    id: "basement-parkiran",
    nama: "Parkiran & Tangga",
    pertanyaan: [
      { id: "bsm-1", teks: "Area parkiran basement: apakah sudah disapu dengan bersih?" },
      { id: "bsm-2", teks: "Apakah area parkiran sudah tidak ada sampah berserakan?" },
      { id: "bsm-3", teks: "Area parkiran luar: apakah sudah disapu bersih?" },
      { id: "bsm-4", teks: "Area tangga basement ke lobby: apakah sudah disapu dan dipel?" },
      { id: "bsm-5", teks: "Area tangga utama ke lobby: apakah sudah disapu dan dipel?" },
    ],
  },
  {
    id: "basement-genset",
    nama: "Genset",
    pertanyaan: [
      { id: "bsm-g1", teks: "Apakah area sekitar genset sudah disapu bersih?" },
      { id: "bsm-g2", teks: "Apakah ruang genset bebas dari sampah/kotoran?" },
    ],
  },
  {
    id: "basement-gudang",
    nama: "Gudang",
    pertanyaan: [
      { id: "bsm-gd1", teks: "Apakah lantai gudang sudah disapu?" },
      { id: "bsm-gd2", teks: "Apakah barang di gudang sudah tertata rapi?" },
    ],
  },
  {
    id: "basement-mesin-air",
    nama: "Mesin Air",
    pertanyaan: [
      { id: "bsm-ma1", teks: "Apakah area ruang mesin air sudah dibersihkan dari debu?" },
      { id: "bsm-ma2", teks: "Apakah lantai ruang mesin air sudah disapu?" },
    ],
  },
  {
    id: "basement-hydrant",
    nama: "Pompa Hydrant",
    pertanyaan: [
      { id: "bsm-ph1", teks: "Apakah area ruang pompa hydrant sudah disapu bersih?" },
      { id: "bsm-ph2", teks: "Apakah ruang pompa hydrant bebas dari sampah/kotoran?" },
    ],
  },
  {
    id: "basement-taman",
    nama: "Taman",
    pertanyaan: [
      { id: "bsm-tm1", teks: "Apakah area taman sudah dibersihkan dari sampah/daun kering?" },
      { id: "bsm-tm2", teks: "Apakah tanaman & rumput taman sudah rapi?" },
    ],
  },
];

// Template segment untuk lantai 2-4 (Toilet pria+wanita terpisah + Area Ruang Kerja).
// Lantai 1 & Lantai 5 areanya beda (lihat SEGMENTS_LANTAI1/SEGMENTS_LANTAI5 di bawah), jadi
// gak ikut template ini.
function buatSegmenLantai(nomorLantai: number): SegmentConfig[] {
  return [
    {
      id: `lt${nomorLantai}-toilet`,
      nama: "Toilet",
      pertanyaan: [
        { id: `lt${nomorLantai}-t1`, teks: "Apakah wastafel bagian wanita sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t2`, teks: "Apakah wastafel bagian pria sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t3`, teks: "Apakah kloset pria sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t4`, teks: "Apakah kloset wanita sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t5`, teks: "Apakah urinoir sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t6`, teks: "Apakah keseluruhan lantai toilet wanita dan pria sudah di pel?" },
      ],
    },
    {
      id: `lt${nomorLantai}-kerja`,
      nama: "Area Ruang Kerja",
      pertanyaan: [
        { id: `lt${nomorLantai}-k1`, teks: "Apakah lantai sudah disapu?" },
        { id: `lt${nomorLantai}-k2`, teks: "Apakah lantai sudah dipel?" },
        { id: `lt${nomorLantai}-k3`, teks: "Apakah area kolong meja sudah dibersihkan?" },
      ],
    },
  ];
}

// Lantai 1: cuma 1 toilet (bukan pria/wanita terpisah kayak lantai 2-4), ditambah
// Gudang, Parkiran, Bagian Depan Parkiran, dan Taman.
const SEGMENTS_LANTAI1: SegmentConfig[] = [
  {
    id: "lt1-toilet",
    nama: "Toilet",
    pertanyaan: [
      { id: "lt1-t1", teks: "Apakah wastafel toilet sudah dibersihkan?" },
      { id: "lt1-t2", teks: "Apakah kloset sudah dibersihkan?" },
      { id: "lt1-t3", teks: "Apakah lantai toilet sudah di pel?" },
    ],
  },
  {
    id: "lt1-gudang",
    nama: "Gudang",
    pertanyaan: [
      { id: "lt1-g1", teks: "Apakah lantai gudang sudah disapu?" },
      { id: "lt1-g2", teks: "Apakah barang di gudang sudah tertata rapi?" },
    ],
  },
  {
    id: "lt1-parkiran",
    nama: "Parkiran",
    pertanyaan: [
      { id: "lt1-p1", teks: "Apakah area parkiran sudah disapu bersih?" },
      { id: "lt1-p2", teks: "Apakah area parkiran sudah tidak ada sampah berserakan?" },
    ],
  },
  {
    id: "lt1-depan-parkiran",
    nama: "Bagian Depan Parkiran",
    pertanyaan: [
      { id: "lt1-dp1", teks: "Apakah bagian depan parkiran sudah disapu bersih?" },
      { id: "lt1-dp2", teks: "Apakah bagian depan parkiran sudah tidak ada sampah berserakan?" },
    ],
  },
  {
    id: "lt1-taman",
    nama: "Taman",
    pertanyaan: [
      { id: "lt1-tm1", teks: "Apakah area taman sudah dibersihkan dari sampah/daun kering?" },
      { id: "lt1-tm2", teks: "Apakah tanaman & rumput taman sudah rapi?" },
    ],
  },
];

// Lantai 5: gak ada toilet — isinya Gudang, Ruang Pompa, Rooftop, dan Tandon Air.
// Dikerjakan bersama semua staff (plot bernilai "Semua / All", lihat NILAI_BERSAMA), cukup 1x per hari.
const SEGMENTS_LANTAI5: SegmentConfig[] = [
  {
    id: "lt5-gudang",
    nama: "Gudang",
    pertanyaan: [
      { id: "lt5-g1", teks: "Apakah lantai gudang sudah disapu?" },
      { id: "lt5-g2", teks: "Apakah barang di gudang sudah tertata rapi?" },
    ],
  },
  {
    id: "lt5-pompa",
    nama: "Ruang Pompa",
    pertanyaan: [
      { id: "lt5-rp1", teks: "Apakah area ruang pompa sudah dibersihkan dari debu?" },
      { id: "lt5-rp2", teks: "Apakah lantai ruang pompa sudah disapu?" },
    ],
  },
  {
    id: "lt5-rooftop",
    nama: "Rooftop",
    pertanyaan: [
      { id: "lt5-rt1", teks: "Apakah area rooftop sudah disapu bersih?" },
      { id: "lt5-rt2", teks: "Apakah rooftop sudah tidak ada sampah/daun berserakan?" },
    ],
  },
  {
    id: "lt5-tandon",
    nama: "Tandon Air",
    pertanyaan: [
      { id: "lt5-ta1", teks: "Apakah area sekitar tandon air sudah bersih?" },
      { id: "lt5-ta2", teks: "Apakah tidak ada genangan air/sampah di sekitar tandon?" },
    ],
  },
];

// Tugas ekstra tetap buat Zainal -- apa pun area yang diplot untuknya hari itu, checklist
// hariannya selalu dapat tambahan segment ini di akhir (permintaan user, bukan bagian dari
// rotasi plotting biasa).
const SEGMENT_MUSHALLAH_L4: SegmentConfig = {
  id: "mushallah-l4-zainal",
  nama: "Mushallah Lantai 4",
  pertanyaan: [
    { id: "mus-1", teks: "Apakah lantai Mushallah sudah disapu?" },
    { id: "mus-2", teks: "Apakah karpet Mushallah sudah divakum?" },
    { id: "mus-3", teks: "Apakah sajadah/karpet sudah dirapikan?" },
    { id: "mus-4", teks: "Apakah area wudhu sudah dibersihkan?" },
  ],
};

const SEGMENTS_PELAYANAN: SegmentConfig[] = [
  {
    id: ID_SEGMENT_PELAYANAN,
    nama: "Pelayanan",
    pertanyaan: [
      { id: "plyn-1", teks: "Apakah belanja / beli makan sudah dilakukan?" },
      { id: "plyn-2", teks: "Apakah meja sudah dibersihkan?" },
      { id: "plyn-3", teks: "Apakah piring sudah dicuci?" },
      { id: "plyn-4", teks: "Apakah minum sudah disajikan?" },
    ],
  },
];

export const CHECKLIST_OB_BAWAAN: AreaChecklist[] = [
  { area: "Basement", segmen: SEGMENTS_BASEMENT },
  { area: "Lantai 1", segmen: SEGMENTS_LANTAI1 },
  { area: "Lantai 2", segmen: buatSegmenLantai(2) },
  { area: "Lantai 3", segmen: buatSegmenLantai(3) },
  { area: "Lantai 4", segmen: buatSegmenLantai(4) },
  { area: "Lantai 5", segmen: SEGMENTS_LANTAI5 },
  { area: "Pelayanan", segmen: SEGMENTS_PELAYANAN },
];
export const TUGAS_TAMBAHAN_BAWAAN: TugasTambahan[] = [{ nama_staf: NAMA_STAF_MUSHALLAH_TETAP, segmen: SEGMENT_MUSHALLAH_L4 }];

// ---------- Bawaan inspeksi fasilitas OB & inspeksi kendaraan Driver ----------
export const FASILITAS_OB_BAWAAN: ItemSederhana[] = ["Kulkas", "Dispenser Pantry Lantai 1", "Dispenser Pantry Lantai 2", "Genset (Tugas Khusus)"].map((nama) => ({ nama, aktif: true }));
export const INSPEKSI_DRIVER_BAWAAN: ItemInspeksiDriver[] = [
  { key: "ban", label: "Ban & Tekanan Angin", aktif: true },
  { key: "rem", label: "Rem", aktif: true },
  { key: "lampu", label: "Lampu (Depan/Belakang/Sein)", aktif: true },
  { key: "oli", label: "Oli Mesin", aktif: true },
  { key: "air_radiator_aki", label: "Air Radiator & Aki", aktif: true },
  { key: "wiper_kaca", label: "Wiper & Kaca", aktif: true },
  { key: "ac", label: "AC", aktif: true },
  { key: "kebersihan", label: "Kebersihan Interior/Eksterior", aktif: true },
];

/** Segmen checklist untuk area plot (logika pencocokan sama dengan versi lama) + tugas tambahan per staf. */
export function getSegmenUntukArea(master: AreaChecklist[], tugasTambahan: TugasTambahan[], area: string, picName?: string): SegmentConfig[] {
  const peta: Record<string, SegmentConfig[]> = {};
  master.forEach((a) => { peta[a.area] = a.segmen; });
  let segmen: SegmentConfig[];
  if (peta[area]) segmen = peta[area];
  else if (area.toLowerCase().includes("pelayanan") && peta["Pelayanan"]) segmen = peta["Pelayanan"];
  else {
    const cocok = Object.keys(peta).find((k) => area.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(area.toLowerCase()));
    segmen = cocok ? peta[cocok] : peta["Lantai 1"] || [];
  }
  const tambahan = tugasTambahan.filter((t) => t.nama_staf === picName).map((t) => t.segmen);
  return [...segmen, ...tambahan].filter((s) => s.aktif !== false && s.pertanyaan.length > 0);
}

function useDokumen<T>(id: string, bawaan: T, ambil: (data: Record<string, unknown>) => T | null): { nilai: T; dariBawaan: boolean; dimuat: boolean } {
  const [nilai, setNilai] = useState<T>(bawaan);
  const [dariBawaan, setDariBawaan] = useState(true);
  const [dimuat, setDimuat] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", id), (snap) => {
      const v = snap.exists() ? ambil(snap.data()) : null;
      if (v) { setNilai(v); setDariBawaan(false); } else { setNilai(bawaan); setDariBawaan(true); }
      setDimuat(true);
    }, (err) => { console.error(`[sop] Gagal memuat settings/${id}, pakai bawaan:`, err); setDimuat(true); });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bawaan/ambil konstanta modul
  }, [id]);
  return { nilai, dariBawaan, dimuat };
}

export function useChecklistOB() {
  return useDokumen<{ area: AreaChecklist[]; tugas_tambahan: TugasTambahan[] }>(
    "checklist_ob",
    { area: CHECKLIST_OB_BAWAAN, tugas_tambahan: TUGAS_TAMBAHAN_BAWAAN },
    (d) => (Array.isArray(d.area) && d.area.length ? { area: d.area as AreaChecklist[], tugas_tambahan: (d.tugas_tambahan as TugasTambahan[]) || [] } : null)
  );
}
export function useFasilitasOB() {
  return useDokumen<ItemSederhana[]>("fasilitas_ob", FASILITAS_OB_BAWAAN, (d) => (Array.isArray(d.daftar) && d.daftar.length ? (d.daftar as ItemSederhana[]) : null));
}
export function useInspeksiDriver() {
  return useDokumen<ItemInspeksiDriver[]>("inspeksi_driver", INSPEKSI_DRIVER_BAWAAN, (d) => (Array.isArray(d.daftar) && d.daftar.length ? (d.daftar as ItemInspeksiDriver[]) : null));
}

/** ID unik singkat untuk item/pertanyaan baru. */
export const idBaru = (awalan: string) => `${awalan}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
