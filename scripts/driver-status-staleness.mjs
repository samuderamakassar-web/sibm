// scripts/driver-status-staleness.mjs
//
// Push notification (FCM) kalau status kendaraan (operational_vehicle_logs)
// sudah lama tidak diupdate (baik oleh Security maupun Driver sendiri) padahal
// statusnya BUKAN standby -- misal kendaraan tercatat "Keluar Beroperasi" tapi
// tidak ada update apa pun (belum "Tiba Kantor Kembali" dll) lebih dari
// AMBANG_STALE_MENIT. Dikirim ke driver yang tercatat sedang bertugas
// (driver_bertugas di log terakhir) DAN ke Security yang sedang jaga saat ini
// (roster shift diambil dari security_monthly_schedules, sama seperti
// scripts/patroli-push-reminder.mjs).
//
// SENGAJA TIDAK ada guard anti-double-kirim -- sama seperti
// patroli-push-reminder.mjs, memang didesain terus muncul lagi tiap 30 menit
// selama status belum diupdate, baru berhenti otomatis begitu statusnya berubah.
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

// Ambang waktu "belum diupdate" -- default 2 jam. Sengaja dibuat konstanta di
// atas biar gampang diubah kalau user minta lebih ketat/longgar nanti.
const AMBANG_STALE_MENIT = 120;

const isStandbyLabel = (s) => !!s && (s.includes("Standby") || s.includes("Tiba"));

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

// Duplikat dari patroli-push-reminder.mjs -- lihat catatan sinkronisasi di sana.
async function ambilSecurityJaga() {
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

async function ambilKendaraanStale() {
  const snap = await db.collection("operational_vehicle_logs").orderBy("waktu_catat", "desc").limit(200).get();
  const terakhirPerKendaraan = new Map();
  snap.forEach((d) => {
    const data = d.data();
    if (!data.kendaraan || terakhirPerKendaraan.has(data.kendaraan)) return;
    terakhirPerKendaraan.set(data.kendaraan, data);
  });

  const stale = [];
  const nowMs = now.getTime();
  terakhirPerKendaraan.forEach((data, kendaraan) => {
    if (isStandbyLabel(data.status_kendaraan)) return;
    const waktuCatat = data.waktu_catat?.toDate?.();
    if (!waktuCatat) return;
    const menitBerlalu = (nowMs - waktuCatat.getTime()) / 60000;
    if (menitBerlalu >= AMBANG_STALE_MENIT) {
      stale.push({ kendaraan, status: data.status_kendaraan, driver: data.driver_bertugas, menitBerlalu: Math.round(menitBerlalu) });
    }
  });
  return stale;
}

async function jalankan() {
  const kendaraanStale = await ambilKendaraanStale();
  if (kendaraanStale.length === 0) {
    console.log("Tidak ada status kendaraan yang basi, skip.");
    return;
  }

  const securityJaga = await ambilSecurityJaga();
  console.log(`Ditemukan ${kendaraanStale.length} kendaraan basi:`, kendaraanStale.map((k) => `${k.kendaraan} (${k.status}, ${k.menitBerlalu} menit, driver: ${k.driver || "-"})`).join("; "));
  console.log(`Security jaga saat ini (${shiftLabel}, ${tanggalShift}):`, securityJaga.join(", ") || "(tidak ada)");

  const tokenSnap = await db.collection("fcm_tokens").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => {
    const data = d.data();
    if (data.token && data.pic_nama) tokenPerNama[data.pic_nama] = data.token;
  });

  for (const k of kendaraanStale) {
    const penerima = new Set();
    if (k.driver && tokenPerNama[k.driver]) penerima.add(k.driver);
    securityJaga.forEach((nama) => { if (tokenPerNama[nama]) penerima.add(nama); });

    const tokens = Array.from(penerima).map((nama) => tokenPerNama[nama]).filter(Boolean);
    if (tokens.length === 0) {
      console.log(`${k.kendaraan}: tidak ada token FCM terdaftar untuk driver/Security terkait, skip kirim.`);
      continue;
    }

    const jamStr = `${Math.floor(k.menitBerlalu / 60)} jam ${k.menitBerlalu % 60} menit`;
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: "Status Kendaraan Belum Diupdate",
        body: `${k.kendaraan} masih berstatus "${k.status}" sejak ${jamStr} lalu. Mohon update statusnya.`,
      },
      webpush: { notification: { icon: "/icons/icon-192.png" } },
    });
    console.log(`${k.kendaraan}: mengirim ke ${tokens.length} penerima (${Array.from(penerima).join(", ")}) -> ${response.successCount} sukses, ${response.failureCount} gagal.`);
  }
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan cek staleness status kendaraan:", err);
    process.exit(1);
  });
