import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

// Konfigurasi PWA
// cacheOnFrontEndNav/aggressiveFrontEndNavCaching SENGAJA DIMATIKAN (sebelumnya true) —
// dua opsi ini bikin Workbox nge-cache payload navigasi App Router secara agresif demi
// transisi halaman terasa instan, TAPI trade-off-nya data/JS chunk hasil deploy BARU bisa
// ketutup cache lama sampai terasa "gak update" walau app-nya sudah di-reinstall (laporan
// user: buka versi web pun ada yang gak muncul). Karena SIBM adalah app data real-time
// (Firestore onSnapshot di mana-mana, dipakai online terus, bukan app offline-first),
// kesegaran data JAUH lebih penting daripada kecepatan transisi halaman.
const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development", // PWA hanya aktif saat di-build/production
});

// PENGAMAN BUILD: variabel NEXT_PUBLIC_* ditanam ke kode SAAT BUILD. Kalau .env.local tidak ada
// (mis. build dari laptop baru), hasil build tetap "sukses" tapi SEMUA upload foto (Cloudinary)
// dan email (EmailJS) diam-diam rusak di production -- pernah kejadian 29 Sep 2026 (§58H).
// Jadi build production sengaja dibuat GAGAL kalau salah satu variabel wajib ini kosong.
const ENV_WAJIB = [
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
  "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET",
  "NEXT_PUBLIC_EMAILJS_SERVICE_ID",
  "NEXT_PUBLIC_EMAILJS_TEMPLATE_ID",
  "NEXT_PUBLIC_EMAILJS_PUBLIC_KEY",
];
if (process.env.NODE_ENV === "production") {
  const kosong = ENV_WAJIB.filter((k) => !process.env[k]);
  if (kosong.length > 0) {
    throw new Error(
      `Build dibatalkan: variabel lingkungan berikut kosong -> ${kosong.join(", ")}. ` +
        "Buat/isi file .env.local di root project dulu (lihat analisis_project.md §58H)."
    );
  }
}

// Konfigurasi Bawaan Next.js Anda
const nextConfig: NextConfig = {
  output: "export", // JANGAN DIHAPUS: Ini wajib untuk Firebase Hosting
};

// Bungkus nextConfig dengan PWA
export default withPWA(nextConfig);