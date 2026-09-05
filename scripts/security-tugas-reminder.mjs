// scripts/security-tugas-reminder.mjs
//
// Push notification (FCM) buat 2 tugas tambahan Security yang diminta user:
//   1. Siram tanaman & kebersihan Pantry Lt 1/2 -- Sabtu & Minggu, jam 06:00-07:00 WITA.
//   2. Pastikan semua AC menyala -- Senin-Jumat, jam 07:20 WITA.
// Keduanya cuma relevan buat petugas Shift 2 (kerja sampai jam 08:00 pagi) yang
// masih standby pas jam segitu. Dipanggil via GitHub Actions cron tiap 30 menit
// (lihat .github/workflows/security-tugas-reminder.yml), pola slot+toleransi sama
// seperti scripts/patroli-reminder.mjs biar tahan telatnya cron GitHub Actions.
//
// Reuse secret yang sama kayak script reminder lain: FIREBASE_SERVICE_ACCOUNT_BASE64

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const messaging = getMessaging();

// ==========================================
// WAKTU SEKARANG (WITA)
// ==========================================
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
const jamMenit = now.getHours() * 60 + now.getMinutes();
const toWaktu = (h, m) => h * 60 + m;
const hariMinggu = now.getDay(); // 0 = Minggu ... 6 = Sabtu
const isWeekend = hariMinggu === 0 || hariMinggu === 6;

const TOLERANSI_MENIT = 20;
function selisihMenit(target) {
  return Math.abs(jamMenit - target);
}

function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
const hariIni = formatTanggal(now);

// Tentukan slot yang berlaku HARI INI (weekend vs weekday saling eksklusif).
let slotAktif = null;
if (isWeekend) {
  // Jendela 06:00-07:00 -- pakai titik tengah 06:30 + toleransi lebar (30 menit)
  // biar seluruh jendela 1 jam kecakup oleh 1 kali kirim.
  const target = toWaktu(6, 30);
  if (selisihMenit(target) <= 30) {
    slotAktif = { id: "siram-tanaman-weekend", pesan: "🌱 Waktunya siram tanaman & bersihkan Pantry Lt 1 & Lt 2 (tugas weekend)." };
  }
} else {
  const target = toWaktu(7, 20);
  if (selisihMenit(target) <= TOLERANSI_MENIT) {
    slotAktif = { id: "cek-ac-pagi", pesan: "❄️ Pastikan SEMUA AC sudah menyala jam segini, tanpa terkecuali." };
  }
}

if (!slotAktif) {
  console.log(`Jam ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")} WITA (${isWeekend ? "weekend" : "weekday"}) bukan waktu tugas tambahan Security, skip.`);
  process.exit(0);
}
console.log("Slot aktif:", slotAktif.id);

// ==========================================
// PIC SHIFT 2 HARI INI (sama pola dengan scripts/patroli-reminder.mjs)
// ==========================================
async function ambilPicShift2HariIni() {
  const bulanKey = hariIni.substring(0, 7);
  const monthSnap = await db.collection("security_monthly_schedules").doc(bulanKey).get();
  if (!monthSnap.exists) return [];

  const plotHariIni = monthSnap.data().data_hari?.[hariIni] || {};
  const namaTerjadwal = Object.keys(plotHariIni).filter((nama) => plotHariIni[nama] === "Shift 2");
  if (namaTerjadwal.length === 0) return [];

  const usersSnap = await db.collection("users_master").where("departemen", "==", "Security").get();
  const semuaStaf = usersSnap.docs.map((d) => d.data());
  return namaTerjadwal.map((nama) => semuaStaf.find((u) => u.nama === nama)).filter((u) => u).map((u) => u.nama);
}

async function jalankan() {
  const idLogHariIni = `${hariIni}_${slotAktif.id}`;
  const logRef = db.collection("reminder_security_tugas_log").doc(idLogHariIni);
  const logSnap = await logRef.get();
  if (logSnap.exists) {
    console.log(`Slot "${slotAktif.id}" hari ini sudah pernah diproses, skip (anti-double-kirim).`);
    return;
  }
  await logRef.set({ slot: slotAktif.id, diproses_pada: FieldValue.serverTimestamp() });

  const daftarNama = await ambilPicShift2HariIni();
  if (daftarNama.length === 0) {
    console.log("Tidak ada petugas Shift 2 terjadwal hari ini, skip.");
    return;
  }

  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "Security").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => {
    const data = d.data();
    if (data.token && data.pic_nama) tokenPerNama[data.pic_nama] = data.token;
  });

  const tokens = daftarNama.map((nama) => tokenPerNama[nama]).filter(Boolean);
  if (tokens.length === 0) {
    console.log("Tidak ada token FCM terdaftar untuk petugas Shift 2 hari ini, skip kirim.");
    return;
  }

  console.log(`Mengirim "${slotAktif.id}" ke ${tokens.length} petugas:`, daftarNama.join(", "));
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: "Tugas Tambahan Security", body: slotAktif.pesan },
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
    console.error("Error saat menjalankan reminder tugas Security:", err);
    process.exit(1);
  });
