// Pengumuman Gedung (collection `pengumuman_gedung`) -- logika bersama portal utama & admin/broadcast.
// §58O: dari teks saja jadi 3 jenis (teks / gambar / video), plus tanggal tayang, tanda "penting",
// dan tombol link opsional. Dokumen lama (tanpa field baru) otomatis dianggap jenis "teks", tayang
// tanpa batas tanggal, tidak penting -- jadi tidak ada pengumuman lama yang rusak.
import type { Timestamp } from "firebase/firestore";
import { uploadFotoToCloudinary } from "./uploadFoto";
import { uploadDokumenToCloudinary } from "./uploadDokumen";

export type JenisPengumuman = "teks" | "gambar" | "video";

export interface PengumumanGedung {
  id: string;
  judul: string;
  teks: string;
  warnaTema: string;
  aktif?: boolean;
  dibuatPada?: Timestamp | null;
  dibuatOleh?: string;
  jenis?: JenisPengumuman;
  gambar_url?: string;
  /** "youtube" = link YouTube (disarankan untuk video panjang), "upload" = klip pendek di Cloudinary. */
  video_sumber?: "youtube" | "upload";
  youtube_id?: string;
  video_url?: string;
  link_url?: string;
  link_label?: string;
  /** "YYYY-MM-DD" (WITA). Kosong = tanpa batas. */
  mulai?: string;
  berakhir?: string;
  penting?: boolean;
}

// Palet tema kartu -- satu-satunya sumber (dulu diduplikasi di portal & admin).
export const PALET_TEMA = [
  { key: "merah", label: "Merah", gradient: "linear-gradient(150deg,#9f1d1d 0%,#dc2626 55%,#c62828 100%)" },
  { key: "biru", label: "Biru", gradient: "linear-gradient(150deg,#1e3a8a 0%,#2563eb 55%,#1d4ed8 100%)" },
  { key: "hijau", label: "Hijau", gradient: "linear-gradient(150deg,#14532d 0%,#16a34a 55%,#15803d 100%)" },
  { key: "kuning", label: "Kuning", gradient: "linear-gradient(150deg,#92400e 0%,#d97706 55%,#b45309 100%)" },
  { key: "ungu", label: "Ungu", gradient: "linear-gradient(150deg,#4c1d95 0%,#7c3aed 55%,#6d28d9 100%)" },
  { key: "gelap", label: "Gelap", gradient: "linear-gradient(150deg,#18181b 0%,#3f3f46 55%,#27272a 100%)" },
];

export function gradientUntukTema(key: string): string {
  return PALET_TEMA.find((p) => p.key === key)?.gradient || PALET_TEMA[0].gradient;
}

export function jenisPengumuman(p: PengumumanGedung): JenisPengumuman {
  return p.jenis || "teks";
}

/** Tayang hari ini? (aktif dicek terpisah lewat query Firestore / toggle admin.) */
export function dalamTanggalTayang(p: PengumumanGedung, hariIniISO: string): boolean {
  if (p.mulai && hariIniISO < p.mulai) return false;
  if (p.berakhir && hariIniISO > p.berakhir) return false;
  return true;
}

export function statusTanggal(p: PengumumanGedung, hariIniISO: string): "terjadwal" | "tayang" | "berakhir" {
  if (p.mulai && hariIniISO < p.mulai) return "terjadwal";
  if (p.berakhir && hariIniISO > p.berakhir) return "berakhir";
  return "tayang";
}

/** Penting selalu di depan; sisanya terbaru dulu. */
export function urutkanPengumuman<T extends PengumumanGedung>(daftar: T[]): T[] {
  return [...daftar].sort((a, b) => {
    if (!!a.penting !== !!b.penting) return a.penting ? -1 : 1;
    return (b.dibuatPada?.toMillis?.() || 0) - (a.dibuatPada?.toMillis?.() || 0);
  });
}

/** Lama slide (ms): teks panjang diberi waktu baca lebih lama, gambar/video lebih lama dari teks pendek. */
export function durasiSlide(p: PengumumanGedung): number {
  const jenis = jenisPengumuman(p);
  if (jenis === "gambar") return 10000;
  if (jenis === "video") return 12000;
  const panjang = (p.judul?.length || 0) + (p.teks?.length || 0);
  return Math.min(15000, Math.max(6000, 4000 + panjang * 45));
}

/** Ambil ID video dari berbagai bentuk link YouTube (watch, youtu.be, shorts, embed). */
export function ambilYoutubeId(link: string): string | null {
  const s = link.trim();
  const pola = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const re of pola) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null;
}

/** Gambar sampul video untuk carousel. */
export function sampulVideo(p: PengumumanGedung): string | null {
  if (p.video_sumber === "youtube" && p.youtube_id) return `https://i.ytimg.com/vi/${p.youtube_id}/hqdefault.jpg`;
  if (p.video_url) {
    // Cloudinary bisa membuat frame detik ke-1 sebagai JPG lewat transformasi URL.
    return p.video_url.replace("/video/upload/", "/video/upload/so_1/").replace(/\.[a-z0-9]+$/i, ".jpg");
  }
  return null;
}

export function urlPemutar(p: PengumumanGedung): string | null {
  if (p.video_sumber === "youtube" && p.youtube_id) {
    return `https://www.youtube-nocookie.com/embed/${p.youtube_id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  }
  return p.video_url || null;
}

/** Klip video yang diunggah langsung dibatasi supaya kuota bandwidth Cloudinary (dipakai juga untuk
 *  foto patroli/checklist staf) tidak cepat habis. Video panjang -> pakai link YouTube Unlisted. */
export const MAX_KLIP_VIDEO_MB = 20;

/** Gambar poster dikecilkan (sisi terpanjang 1600px, JPEG) sebelum diunggah -- cukup tajam untuk
 *  layar, jauh lebih hemat kuota dibanding foto asli kamera 4-12 MB. */
export async function uploadGambarPengumuman(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Gagal membaca file gambar"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("File bukan gambar yang valid"));
    i.src = dataUrl;
  });
  const skala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * skala);
  canvas.height = Math.round(img.height * skala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung kompresi gambar");
  ctx.fillStyle = "#fff"; // PNG transparan -> latar putih (JPEG tidak punya transparansi)
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal mengompres gambar"))), "image/jpeg", 0.85)
  );
  return uploadFotoToCloudinary(blob, "sibm/pengumuman");
}

export async function uploadKlipPengumuman(file: File): Promise<string> {
  if (file.size > MAX_KLIP_VIDEO_MB * 1024 * 1024) {
    throw new Error(`Klip ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas ${MAX_KLIP_VIDEO_MB} MB. Untuk video panjang gunakan link YouTube (Unlisted).`);
  }
  return uploadDokumenToCloudinary(file, "sibm/pengumuman");
}
