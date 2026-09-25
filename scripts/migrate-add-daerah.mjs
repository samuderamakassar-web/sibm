// scripts/migrate-add-daerah.mjs
//
// Script migrasi SATU KALI (bukan cron, jalankan manual): backfill field `daerah` ke
// SEMUA dokumen users_master yang belum punya field itu -- prasyarat fitur multi-daerah
// (Super Admin vs Admin Daerah, lihat firestore.rules & analisis_project.md §56).
//
// Aturan default:
//   - Akun dengan email EMAIL_SUPER_ADMIN di bawah -> daerah: "PUSAT" (Super Admin, akses
//     semua wilayah).
//   - SEMUA akun lain yang belum punya field `daerah` -> daerah: DAERAH_DEFAULT (saat ini
//     seluruh tim memang berbasis di 1 wilayah itu).
//
// Idempotent: skip dokumen yang SUDAH punya field `daerah` (aman dijalankan ulang, tidak
// menimpa perubahan manual yang sudah dilakukan lewat admin/users setelah migrasi awal).
//
// CARA PAKAI: sama seperti migrate-users-to-auth.mjs (set FIREBASE_SERVICE_ACCOUNT_BASE64,
// lalu `node scripts/migrate-add-daerah.mjs`).

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  console.error("FIREBASE_SERVICE_ACCOUNT_BASE64 belum di-set. Lihat komentar di atas file ini.");
  process.exit(1);
}

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// PENTING: ini email akun LOGIN users_master Reza (beda dari email pribadi
// samudera.makassar@gmail.com yang dipakai sehari-hari di luar app) -- ketauan salah tebak
// di percobaan pertama migrasi ini (semua akun kena "Makassar", gak ada yang jadi Super
// Admin). Dicek ulang, benar reza.rahmat@samudera.id.
const EMAIL_SUPER_ADMIN = "reza.rahmat@samudera.id";
const DAERAH_DEFAULT = "Makassar";

async function jalankan() {
  const snap = await db.collection("users_master").get();
  if (snap.empty) {
    console.log("Tidak ada dokumen di users_master.");
    return;
  }

  let diupdate = 0;
  let dilewati = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const emailCocokSuperAdmin = (data.email || "").toLowerCase() === EMAIL_SUPER_ADMIN;

    // Akun super admin SELALU dikoreksi ke "PUSAT" walau sudah punya daerah lain (self-heal
    // dari percobaan migrasi sebelumnya yang salah email) -- akun lain tetap idempotent normal
    // (skip kalau sudah punya daerah, gak menimpa perubahan manual yang sudah dilakukan).
    if (data.daerah && !(emailCocokSuperAdmin && data.daerah !== "PUSAT")) {
      console.log(`- ${data.nama} (${data.email}): sudah punya daerah="${data.daerah}", skip.`);
      dilewati++;
      continue;
    }
    const daerah = emailCocokSuperAdmin ? "PUSAT" : DAERAH_DEFAULT;
    await d.ref.update({ daerah });
    console.log(`+ ${data.nama} (${data.email}): daerah diset ke "${daerah}".`);
    diupdate++;
  }

  console.log(`\nSelesai. ${diupdate} akun di-update, ${dilewati} akun dilewati (sudah punya daerah).`);
}

jalankan()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error saat migrasi daerah:", err);
    process.exit(1);
  });
