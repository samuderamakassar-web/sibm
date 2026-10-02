// scripts/generate-email-banner.mjs (§68)
// Membuat banner email persegi panjang (1200x420, tampil 600px di email = tajam di layar retina):
// penjelasan singkat SIBM + QR code ke URL aplikasi. Hasil: public/email/sibm-banner.png
// (ter-deploy di https://sibm-app.web.app/email/sibm-banner.png, dipakai template email).
// Jalankan ulang bila URL/teks berubah:  node scripts/generate-email-banner.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import QRCode from "qrcode";

const URL_APP = "https://sibm-app.web.app";
const W = 1200;
const H = 420;
const OUT = path.join("public", "email", "sibm-banner.png");

const FITUR = ["Lapor Kerusakan", "Lacak Tamu & Paket", "Request ATK", "Lembur AC", "Laporan Bahaya (SBO)", "Pengumuman Gedung"];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const FONT = "Segoe UI, Arial, Helvetica, sans-serif";

// Chip fitur: 2 baris x 3, lebar kira-kira dari jumlah huruf.
let chips = "";
FITUR.forEach((f, i) => {
  const baris = Math.floor(i / 3);
  const kolomSebelum = FITUR.slice(baris * 3, i);
  const x = 60 + kolomSebelum.reduce((a, s) => a + s.length * 10.2 + 40 + 12, 0);
  const y = 232 + baris * 52;
  const w = f.length * 10.2 + 40;
  chips += `<rect x="${x}" y="${y}" width="${w}" height="40" rx="20" fill="#ffffff" fill-opacity="0.14"/>
  <text x="${x + w / 2}" y="${y + 26}" text-anchor="middle" font-family="${FONT}" font-size="17" font-weight="600" fill="#ffffff">${esc(f)}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b3172f"/>
      <stop offset="1" stop-color="#6e0b1c"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="1010" cy="-40" r="260" fill="#ffffff" fill-opacity="0.05"/>
  <circle cx="760" cy="470" r="200" fill="#ffffff" fill-opacity="0.04"/>

  <rect x="60" y="48" width="76" height="76" rx="20" fill="#ffffff"/>
  <text x="156" y="94" font-family="${FONT}" font-size="46" font-weight="800" fill="#ffffff">SIBM</text>
  <text x="156" y="122" font-family="${FONT}" font-size="19" fill="#ffffff" fill-opacity="0.85">Sistem Informasi Bangunan &amp; Manajemen</text>

  <text x="60" y="198" font-family="${FONT}" font-size="31" font-weight="800" fill="#ffffff">Semua urusan gedung dalam satu aplikasi</text>
  ${chips}

  <text x="60" y="382" font-family="${FONT}" font-size="22" font-weight="700" fill="#ffffff">sibm-app.web.app</text>
  <text x="262" y="382" font-family="${FONT}" font-size="18" fill="#ffffff" fill-opacity="0.75">· Gedung Samudera Makassar</text>

  <rect x="878" y="44" width="272" height="332" rx="28" fill="#ffffff"/>
  <text x="1014" y="322" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="800" fill="#231f1c">Pindai untuk membuka</text>
  <text x="1014" y="350" text-anchor="middle" font-family="${FONT}" font-size="15" fill="#776e66">atau ketuk banner ini</text>
</svg>`;

const qr = await QRCode.toBuffer(URL_APP, { type: "png", width: 220, margin: 1, errorCorrectionLevel: "M", color: { dark: "#231f1c", light: "#ffffff" } });
const logo = await sharp(path.join("public", "icons", "logo-mark.png")).resize(60, 60).png().toBuffer();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(Buffer.from(svg))
  .composite([
    { input: qr, left: 904, top: 70 },
    { input: logo, left: 68, top: 56 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(OUT);
console.log(`OK ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB) -> ${URL_APP}`);
