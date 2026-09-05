// scripts/patroli-push-reminder.mjs
//
// Push notification (FCM) buat Security yang sesi patroli minimumnya (2 dari
// 3 sesi per shift) belum terpenuhi di shift yang SEDANG berjalan. Ini
// GANTI banner in-app PatroliShiftBanner.tsx (dicopot dari
// dashboard/security/layout.tsx atas permintaan user -- banner in-app
// dirasa gampang kelewat, kudu tab/app kebuka dulu).
//
// SENGAJA dibuat sebagai script TERPISAH dari scripts/patroli-reminder.mjs
// (bukan diubah langsung) -- patroli-reminder.mjs sudah production-proven
// buat notifikasi in-app + eskalasi pre-shift/shift-start di jam-jam
// spesifik, gak mau resiko ganggu itu. Script ini murni nambahin push,
// dicek ulang tiap kali dipanggil (tiap 30 menit, lihat
// .github/workflows/patroli-push-reminder.yml) -- SENGAJA TIDAK ada guard
// anti-double-kirim per hari (beda dari script reminder lain), karena
// justru itu yang diminta: terus muncul lagi tiap 30 menit selama belum
// diselesaikan, baru berhenti otomatis begitu syarat kepatuhan terpenuhi.
//
// Reuse secret yang sama kayak script reminder lain: FIREBASE_SERVICE_ACCOUNT_BASE64

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const messaging = getMessaging();

// ==========================================
// SHIFT & SESI -- duplikat manual dari src/lib/shift.ts (script plain Node ESM,
// tidak bisa import TypeScript/path alias). Kalau aturan berubah, ubah juga di sana
// DAN di scripts/patroli-reminder.mjs (sudah ada catatan sinkronisasi serupa di situ).
// Shift 1 (08-20): Sesi1 08-12, Sesi2 12-16, Sesi3 16-20
// Shift 2 (20-08): Sesi1 20-00, Sesi2 00-04, Sesi3 04-08
// Minimal 2 dari 3 sesi per shift harus ada laporan patroli.
// ==========================================
const MINIMUM_SESI_PER_SHIFT = 2;

const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));

function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
const hariIni = formatTanggal(now);
const kemarin = formatTanggal(new Date(now.getTime() - 24 * 60 * 60 * 1000));

const jam = now.getHours();
let shiftLabel, tanggalShift;
if (jam >= 8 && jam < 20) {
  shiftLabel = "Shift 1";
  tanggalShift = hariIni;
} else {
  shiftLabel = "Shift 2";
  tanggalShift = jam >= 20 ? hariIni : kemarin;
}

async function ambilPicShift() {
  const bulanKey = tanggalShift.substring(0, 7);
  const monthSnap = await db.collection("security_monthly_schedules").doc(bulanKey).get();
  if (!monthSnap.exists) return [];

  const plotHariIni = monthSnap.data().data_hari?.[tanggalShift] || {};
  const namaTerjadwal = Object.keys(plotHariIni).filter((nama) => plotHariIni[nama] === shiftLabel);
  if (namaTerjadwal.length === 0) return [];

  const usersSnap = await db.collection("users_master").where("departemen", "==", "Security").get();
  const semuaStaf = usersSnap.docs.map((d) => d.data());
  return namaTerjadwal.map((nama) => semuaStaf.find((u) => u.nama === nama)).filter((u) => u).map((u) => u.nama);
}

async function hitungSesiTerpenuhi(namaPetugas) {
  const snap = await db
    .collection("security_patrols")
    .where("petugas", "==", namaPetugas)
    .where("tanggal_shift", "==", tanggalShift)
    .where("shift", "==", shiftLabel)
    .get();
  const sesiUnik = new Set(snap.docs.map((d) => d.data().sesi).filter(Boolean));
  return sesiUnik.size >= MINIMUM_SESI_PER_SHIFT;
}

async function jalankan() {
  const daftarNama = await ambilPicShift();
  if (daftarNama.length === 0) {
    console.log(`Tidak ada petugas terjadwal ${shiftLabel} (${tanggalShift}), skip.`);
    return;
  }

  const belumPatuh = [];
  for (const nama of daftarNama) {
    const patuh = await hitungSesiTerpenuhi(nama);
    if (!patuh) belumPatuh.push(nama);
    else console.log(`${nama} sudah memenuhi minimal ${MINIMUM_SESI_PER_SHIFT} sesi, skip.`);
  }

  if (belumPatuh.length === 0) {
    console.log("Semua petugas shift ini sudah memenuhi minimum sesi patroli.");
    return;
  }

  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "Security").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => {
    const data = d.data();
    if (data.token && data.pic_nama) tokenPerNama[data.pic_nama] = data.token;
  });

  const tokens = belumPatuh.map((nama) => tokenPerNama[nama]).filter(Boolean);
  if (tokens.length === 0) {
    console.log("Belum patuh tapi tidak ada token FCM terdaftar untuk mereka, skip kirim.");
    return;
  }

  console.log(`Mengirim reminder patroli ke ${tokens.length} petugas:`, belumPatuh.join(", "));
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: "Pengingat Patroli",
      body: `Sesi patroli minimum (${MINIMUM_SESI_PER_SHIFT} dari 3) belum terpenuhi untuk ${shiftLabel} ini. Yuk lanjut patroli.`,
    },
    webpush: { notification: { icon: "/icons/icon-192.png" } },
  });
  console.log(`${response.successCount} sukses, ${response.failureCount} gagal.`);
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan push reminder patroli:", err);
    process.exit(1);
  });
