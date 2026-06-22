import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

// Konfigurasi PWA
const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development", // PWA hanya aktif saat di-build/production
});

// Konfigurasi Bawaan Next.js Anda
const nextConfig: NextConfig = {
  output: "export", // JANGAN DIHAPUS: Ini wajib untuk Firebase Hosting
};

// Bungkus nextConfig dengan PWA
export default withPWA(nextConfig);