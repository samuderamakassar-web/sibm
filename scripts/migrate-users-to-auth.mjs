// scripts/migrate-users-to-auth.mjs
//
// Script migrasi SATU KALI (bukan cron, jalankan manual): pindahkan semua akun
// di collection `users_master` (yang lama pakai auto-ID Firestore + field
// `password` plaintext) ke Firebase Authentication sungguhan, lalu tulis ulang
// dokumen profilnya dengan ID = Firebase Auth UID (dibutuhkan Firestore Rules
// untuk resolve role lewat get() by path, lihat firestore.rules).
//
// Password lama dipakai APA ADANYA sebagai password awal akun Firebase Auth
// (langsung di-hash aman oleh Firebase saat dibuat) -- tidak ada reset paksa,
// tim tetap login pakai password yang sama seperti biasa.
//
// CARA PAKAI:
//   1. Download service account JSON dari Firebase Console (Project Settings
//      > Service Accounts > Generate new private key) untuk project sibm-app.
//   2. Set env var (PowerShell):
//        $env:FIREBASE_SERVICE_ACCOUNT_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("path/ke/service-account.json"))
//   3. node scripts/migrate-users-to-auth.mjs
//   4. Cek ringkasan di console. Aman dijalankan ulang (idempotent) -- user
//      yang emailnya sudah ada di Firebase Auth otomatis di-skip.

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  console.error("FIREBASE_SERVICE_ACCOUNT_BASE64 belum di-set. Lihat komentar di atas file ini.");
  process.exit(1);
}

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const auth = getAuth();

async function jalankan() {
  const snap = await db.collection("users_master").get();
  if (snap.empty) {
    console.log("Tidak ada dokumen di users_master, tidak ada yang dimigrasikan.");
    return;
  }

  console.log(`Ditemukan ${snap.size} dokumen di users_master. Mulai migrasi...\n`);

  let sukses = 0, dilewati = 0, gagal = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const { nama, email, departemen, role, whatsapp, foto_url, password } = data;

    if (!email) {
      console.log(`[SKIP] Dokumen ${docSnap.id} (${nama || "?"}) tidak punya field email, dilewati.`);
      dilewati++;
      continue;
    }

    try {
      let uid;
      try {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        console.log(`[SKIP-AUTH] ${email} sudah ada di Firebase Auth (uid ${uid}), pakai uid yang ada.`);
      } catch {
        if (!password) {
          console.log(`[SKIP] ${email} tidak punya field password & belum ada di Firebase Auth, dilewati -- perlu dibuat manual.`);
          dilewati++;
          continue;
        }
        const created = await auth.createUser({ email, password, displayName: nama || undefined });
        uid = created.uid;
        console.log(`[AUTH-BARU] ${email} -> uid ${uid}`);
      }

      const profileRef = db.collection("users_master").doc(uid);
      const profileSnap = await profileRef.get();
      if (!profileSnap.exists) {
        await profileRef.set({
          nama: nama || "",
          email,
          departemen: departemen || "",
          role: role || "Staff",
          whatsapp: whatsapp || "",
          foto_url: foto_url || "",
          waktu_dibuat: FieldValue.serverTimestamp(),
        });
        console.log(`[PROFIL-BARU] users_master/${uid} dibuat.`);
      } else {
        console.log(`[PROFIL-ADA] users_master/${uid} sudah ada, tidak ditimpa.`);
      }

      // Hapus dokumen lama (auto-ID) HANYA kalau ID-nya beda dari uid target
      // (mencegah menghapus dokumen yang baru saja kita buat kalau di-run ulang).
      if (docSnap.id !== uid) {
        await docSnap.ref.delete();
        console.log(`[HAPUS-LAMA] Dokumen lama users_master/${docSnap.id} dihapus.`);
      }

      sukses++;
      console.log(`[OK] ${nama || email} selesai dimigrasikan.\n`);
    } catch (err) {
      gagal++;
      console.error(`[GAGAL] ${email || docSnap.id}:`, err.message, "\n");
    }
  }

  console.log("=".repeat(50));
  console.log(`Selesai. Sukses: ${sukses}, Dilewati: ${dilewati}, Gagal: ${gagal}`);
  if (gagal > 0) {
    console.log("Ada yang gagal -- aman jalankan ulang script ini, yang sudah sukses akan di-skip.");
  }
}

jalankan()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error fatal saat migrasi:", err);
    process.exit(1);
  });
