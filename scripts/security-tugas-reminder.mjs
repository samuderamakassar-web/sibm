// scripts/security-tugas-reminder.mjs
//
// Push notification (FCM) buat tugas tambahan Security:
//   1. "Notifikasi dadakan" siram tanaman -- TIAP HARI, jendela Pagi 06:00-07:00 &
//      Malam 20:00-22:00 WITA (dulu titik patroli weekend-only Pantry Lt 1/2, sekarang
//      dipindah kesini atas permintaan user jadi notifikasi terpisah yang wajib upload
//      foto bukti -- lihat NotifikasiDadakanSiramPage.tsx & collection
//      notifikasi_dadakan_siram). Ini CUMA push pengingatnya; submit bukti fotonya
//      dilakukan staf lewat halaman /dashboard/security/notifikasi-dadakan.
//   2. Pastikan semua AC menyala -- Senin-Jumat, jam 07:20 WITA.
// Semuanya cuma relevan buat petugas Shift 2 (kerja sampai jam 08:00 pagi) yang masih
// standby pas jam segitu. Dipanggil via GitHub Actions cron tiap 30 menit (lihat
// .github/workflows/security-tugas-reminder.yml), pola slot+toleransi sama seperti
// scripts/patroli-reminder.mjs biar tahan telatnya cron GitHub Actions.
//
// PENTING: jendela jam disini HARUS sinkron dengan jendelaAktifSekarang() di
// NotifikasiDadakanSiramPage.tsx -- kalau salah satu diubah, ubah juga yang lain.
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
const kemarin = formatTanggal(new Date(now.getTime() - 24 * 60 * 60 * 1000));

// Shift 2 (20:00-08:00) yang relevan tergantung jam sekarang: kalau masih pagi (sebelum
// tengah hari), Shift 2 yang relevan itu yang MULAI kemarin malam; kalau sudah malam,
// Shift 2 yang relevan itu yang mulai hari ini.
const tanggalShift2Relevan = now.getHours() < 12 ? kemarin : hariIni;

// Tentukan slot yang berlaku sekarang -- siram tanaman jalan TIAP HARI (tidak lagi
// weekend-only), AC check tetap Senin-Jumat saja.
let slotAktif = null;
const targetPagi = toWaktu(6, 30); // jendela 06:00-07:00, titik tengah 06:30 +-30 menit
const targetMalam = toWaktu(21, 0); // jendela 20:00-22:00, titik tengah 21:00 +-60 menit
const targetAC = toWaktu(7, 20);

if (selisihMenit(targetPagi) <= 30) {
  slotAktif = { id: "siram-tanaman-pagi", tanggalShift: tanggalShift2Relevan, pesan: "🌱 Notifikasi Dadakan: waktunya siram tanaman! Buka menu \"Notifikasi Dadakan\" di aplikasi & upload foto bukti." };
} else if (selisihMenit(targetMalam) <= 60) {
  slotAktif = { id: "siram-tanaman-malam", tanggalShift: tanggalShift2Relevan, pesan: "🌱 Notifikasi Dadakan: waktunya siram tanaman! Buka menu \"Notifikasi Dadakan\" di aplikasi & upload foto bukti." };
} else if (!isWeekend && selisihMenit(targetAC) <= TOLERANSI_MENIT) {
  slotAktif = { id: "cek-ac-pagi", tanggalShift: tanggalShift2Relevan, pesan: "❄️ Pastikan SEMUA AC sudah menyala jam segini, tanpa terkecuali." };
}

if (!slotAktif) {
  console.log(`Jam ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")} WITA bukan waktu tugas tambahan Security, skip.`);
  process.exit(0);
}
console.log("Slot aktif:", slotAktif.id);

// ==========================================
// PIC SHIFT 2 (sama pola dengan scripts/patroli-reminder.mjs) -- pakai tanggalShift
// slot yang aktif, BUKAN tanggal kalender hari ini, karena Shift 2 yang relevan pas
// jendela pagi (06:00-07:00) itu yang mulai KEMARIN malam.
// ==========================================
async function ambilPicShift2(tanggalShift) {
  const bulanKey = tanggalShift.substring(0, 7);
  const monthSnap = await db.collection("security_monthly_schedules").doc(bulanKey).get();
  if (!monthSnap.exists) return [];

  const plotHariIni = monthSnap.data().data_hari?.[tanggalShift] || {};
  const namaTerjadwal = Object.keys(plotHariIni).filter((nama) => plotHariIni[nama] === "Shift 2");
  if (namaTerjadwal.length === 0) return [];

  const usersSnap = await db.collection("users_master").where("departemen", "==", "Security").get();
  const semuaStaf = usersSnap.docs.map((d) => d.data());
  return namaTerjadwal.map((nama) => semuaStaf.find((u) => u.nama === nama)).filter((u) => u).map((u) => u.nama);
}

async function jalankan() {
  const idLogHariIni = `${slotAktif.tanggalShift}_${slotAktif.id}`;
  const logRef = db.collection("reminder_security_tugas_log").doc(idLogHariIni);
  const logSnap = await logRef.get();
  if (logSnap.exists) {
    console.log(`Slot "${slotAktif.id}" hari ini sudah pernah diproses, skip (anti-double-kirim).`);
    return;
  }
  await logRef.set({ slot: slotAktif.id, diproses_pada: FieldValue.serverTimestamp() });

  const daftarNama = await ambilPicShift2(slotAktif.tanggalShift);
  if (daftarNama.length === 0) {
    console.log(`Tidak ada petugas Shift 2 terjadwal (${slotAktif.tanggalShift}), skip.`);
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
