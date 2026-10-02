// Master Titik Patroli Security (§79) -- SATU sumber untuk halaman Patroli (titik wajib scan) & QR Manager
// (label QR). Dulu ditulis di kode, 2 salinan yang sudah berbeda (QR Manager tidak punya Taman Belakang &
// Parkiran Utama). Sekarang diatur Admin GA di /admin/titik-patroli, disimpan di settings/titik_patroli.
//
// ID titik (`id`) = isi QR yang ditempel di lokasi -> JANGAN diubah setelah dicetak. Mengganti nama tampilan
// aman. Titik "nonaktif" (mis. area renovasi) tidak wajib discan & tidak dihitung terlewat, QR-nya tetap ada.
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export interface TitikPatroli {
  id: string;
  nama: string;
  aktif: boolean;
  catatan?: string;
}
export interface LantaiPatroli {
  lantai: string;
  titik: TitikPatroli[];
}

const t = (id: string, nama: string): TitikPatroli => ({ id, nama, aktif: true });

/** Daftar awal = isi kode lama (dipakai sampai admin menyimpan versi sendiri). */
export const TITIK_PATROLI_BAWAAN: LantaiPatroli[] = [
  { lantai: "Ground (Basement)", titik: [t("Ground::Parkiran Basement", "Area Parkiran Basement"), t("Ground::Toilet", "Toilet Basement"), t("Ground::Ruang Genset", "Ruang Genset"), t("Ground::Ruang Pompa", "Ruang Pompa Utama"), t("Ground::Gudang", "Gudang Basement"), t("Ground::Mushallah Basement", "Mushallah Basement")] },
  { lantai: "Lantai 1", titik: [t("Lantai 1::Lobby", "Lobby Utama"), t("Lantai 1::Asbin", "Ruang Asbin"), t("Lantai 1::Ruang Meeting", "Ruang Meeting Lt 1"), t("Lantai 1::Toilet", "Toilet Lt 1"), t("Lantai 1::Ruang Tamu", "Ruang Tamu"), t("Lantai 1::Pantry", "Pantry Lt 1"), t("Lantai 1::Taman Belakang", "Taman Belakang / Garden")] },
  { lantai: "Lantai 2", titik: [t("Lantai 2::Ruang Kerja Utama", "Ruang Kerja Utama"), t("Lantai 2::Pantry", "Pantry Lt 2"), t("Lantai 2::Toilet", "Toilet Lt 2"), t("Lantai 2::Ruang Kerja SAI", "Ruang Kerja SAI"), t("Lantai 2::Ruang Direktur", "Ruang Direktur"), t("Lantai 2::Ruang GM", "Ruang General Manager"), t("Lantai 2::Server", "Ruang Server (IT)"), t("Lantai 2::Ruang Arsip", "Ruang Arsip")] },
  { lantai: "Lantai 3", titik: [t("Lantai 3::Gudang", "Gudang Lt 3"), t("Lantai 3::Toilet", "Toilet Lt 3"), t("Lantai 3::Ruang Kesehatan", "Klinik / Ruang Kesehatan"), t("Lantai 3::Ruang Meeting", "Ruang Meeting Lt 3"), t("Lantai 3::Ruang Kerja Kosong", "Ruang Kerja Kosong"), t("Lantai 3::Ruang Kerja PPNP", "Ruang Kerja PPNP")] },
  { lantai: "Lantai 4", titik: [t("Lantai 4::Ruang Kerja Kosong", "Ruang Kerja Kosong"), t("Lantai 4::Toilet", "Toilet Lt 4"), t("Lantai 4::Pantry", "Pantry Lt 4"), t("Lantai 4::Mushallah", "Mushallah Utama")] },
  { lantai: "Lantai 5", titik: [t("Lantai 5::Rooftop", "Area Rooftop"), t("Lantai 5::Gudang", "Gudang Lt 5"), t("Lantai 5::Ruang Pompa", "Ruang Pompa Air Lt 5")] },
  { lantai: "Parkiran", titik: [t("Parkiran::Parkiran Utama", "Parkiran Utama")] },
];

export const REF_TITIK_PATROLI = () => doc(db, "settings", "titik_patroli");

/** Buat ID titik baru dari lantai & nama: "Lantai 3::Ruang Meeting B". */
export function idTitikBaru(lantai: string, nama: string): string {
  const prefixLantai = lantai.startsWith("Ground") ? "Ground" : lantai.trim();
  return `${prefixLantai}::${nama.trim().replace(/::/g, ":")}`;
}

/** Live dari Firestore; selama dokumen belum ada (atau gagal dimuat) memakai TITIK_PATROLI_BAWAAN. */
export function useTitikPatroli(): { daftar: LantaiPatroli[]; dariBawaan: boolean; dimuat: boolean } {
  const [daftar, setDaftar] = useState<LantaiPatroli[]>(TITIK_PATROLI_BAWAAN);
  const [dariBawaan, setDariBawaan] = useState(true);
  const [dimuat, setDimuat] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(REF_TITIK_PATROLI(), (snap) => {
      const data = snap.data()?.lantai as LantaiPatroli[] | undefined;
      if (Array.isArray(data) && data.length) { setDaftar(data); setDariBawaan(false); } else { setDaftar(TITIK_PATROLI_BAWAAN); setDariBawaan(true); }
      setDimuat(true);
    }, (err) => { console.error("[titik patroli] Gagal memuat, pakai bawaan:", err); setDimuat(true); });
    return () => unsub();
  }, []);
  return { daftar, dariBawaan, dimuat };
}
