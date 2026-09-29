// scripts/generate-icons.mjs
//
// Membuat ulang ikon aplikasi (PWA/install, iOS, favicon, logo kecil di header) dari logogram
// Samudera (public/LOGOGRAM SAMUDERA_BACKGROUND MERAH.jpg -- bendera garis merah + huruf S di
// latar putih). Jalankan manual kalau logo berubah:  node scripts/generate-icons.mjs
//
// Sebelumnya manifest.json menunjuk icon-512.png & icon-maskable-512.png yang TIDAK ADA, dan
// icon-192.png berukuran 3713x2231 (bukan kotak) -- ikon install jadi jelek/terpotong (§58K).
import sharp from "sharp";

const SUMBER = "public/LOGOGRAM SAMUDERA_BACKGROUND MERAH.jpg";
const PUTIH = { r: 255, g: 255, b: 255, alpha: 1 };

// Bendera dipotong dari latar putihnya (trim) supaya bisa diposisikan presisi.
const bendera = await sharp(SUMBER).trim({ background: "#ffffff", threshold: 30 }).png().toBuffer();

async function benderaSelebar(lebar) {
  return sharp(bendera).resize({ width: Math.round(lebar) }).png().toBuffer();
}

/** Kotak putih ukuran n, bendera selebar rasioLebar*n di tengah; radius>0 = sudut membulat transparan. */
async function buatIkon(n, rasioLebar, radius, keluaran) {
  const logo = await benderaSelebar(n * rasioLebar);
  let kanvas = sharp({ create: { width: n, height: n, channels: 4, background: PUTIH } }).composite([{ input: logo, gravity: "center" }]);
  if (radius > 0) {
    const r = Math.round(n * radius);
    const topeng = Buffer.from(`<svg width="${n}" height="${n}"><rect width="${n}" height="${n}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
    kanvas = sharp(await kanvas.png().toBuffer()).composite([{ input: topeng, blend: "dest-in" }]);
  }
  await kanvas.png().toFile(keluaran);
  console.log("dibuat", keluaran);
}

// Ikon "any": sudut membulat (22%) dengan sudut transparan -- tampil membulat di desktop/launcher
// yang tidak menerapkan masker sendiri.
await buatIkon(192, 0.74, 0.22, "public/icons/icon-192.png");
await buatIkon(512, 0.74, 0.22, "public/icons/icon-512.png");
// Maskable: kotak penuh (Android memotong jadi bulat/rounded sendiri), logo di dalam zona aman ~80%.
await buatIkon(512, 0.58, 0, "public/icons/icon-maskable-512.png");
// iOS: wajib kotak penuh tanpa transparansi (iOS membulatkan sendiri).
await buatIkon(180, 0.72, 0, "public/icons/apple-touch-icon.png");
// Favicon & logo kecil di header AdminShell.
await buatIkon(48, 0.8, 0.22, "public/icons/favicon-48.png");
await buatIkon(128, 0.76, 0.24, "public/icons/logo-mark.png");
