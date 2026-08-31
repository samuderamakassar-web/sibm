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

// Konfigurasi Bawaan Next.js Anda
const nextConfig: NextConfig = {
  output: "export", // JANGAN DIHAPUS: Ini wajib untuk Firebase Hosting
};

// Bungkus nextConfig dengan PWA
export default withPWA(nextConfig);