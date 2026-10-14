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
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const messaging = getMessaging();

// Tulis 1 entri notifikasi_personal per penerima, dibaca oleh kotak masuk in-app
// (NotifikasiInboxPage.tsx) & badge lonceng (NotifikasiBellButton.tsx) -- pelengkap push FCM,
// bukan pengganti, supaya tetap kelihatan kalau push-nya kelewat/gak diklik.
async function tulisNotifPersonal(namaList, judul, pesan) {
  await Promise.all(namaList.map((nama) =>
    db.collection("notifikasi_personal").add({ untukNama: nama, judul, pesan, dibaca: false, waktu: FieldValue.serverTimestamp() })
  ));
}

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

// §142 Lapor ke Danru: dalam 60 menit setelah sebuah sesi berakhir, petugas roster yang TIDAK melaporkan sesi itu
// dikabarkan ke Danru/Koordinator Security (push + in-app), 1x per sesi (penanda lapor_danru_patroli/{tgl}_{shift}_{sesi}).
async function laporDanru() {
  const MULAI = { "Shift 1": 8, "Shift 2": 20 };
  const jamSejakMulai = (jam - MULAI[shiftLabel] + 24) % 24;
  const idx = Math.floor(jamSejakMulai / 4); // 0..2 = sesi berjalan
  const menitSejakBatas = (jamSejakMulai % 4) * 60 + now.getMinutes();
  if (menitSejakBatas >= 60) return;
  let sesiLalu, shiftLalu, tanggalLalu;
  if (idx > 0) { sesiLalu = `Sesi ${idx}`; shiftLalu = shiftLabel; tanggalLalu = tanggalShift; }
  else if (shiftLabel === "Shift 1") { sesiLalu = "Sesi 3"; shiftLalu = "Shift 2"; tanggalLalu = kemarin; }
  else { sesiLalu = "Sesi 3"; shiftLalu = "Shift 1"; tanggalLalu = hariIni; }

  const penandaRef = db.collection("lapor_danru_patroli").doc(`${tanggalLalu}_${shiftLalu.replace(" ", "")}_${sesiLalu.replace(" ", "")}`);
  if ((await penandaRef.get()).exists) return;

  const monthSnap = await db.collection("security_monthly_schedules").doc(tanggalLalu.substring(0, 7)).get();
  const plot = (monthSnap.exists && monthSnap.data().data_hari?.[tanggalLalu]) || {};
  const petugas = Object.keys(plot).filter((n) => String(plot[n]).includes(shiftLalu));
  if (!petugas.length) { await penandaRef.set({ dicek: true, kosong: true }); return; }

  const laporSnap = await db.collection("security_patrols").where("tanggal_shift", "==", tanggalLalu).where("shift", "==", shiftLalu).get();
  const sudah = new Set(laporSnap.docs.map((d) => d.data()).filter((x) => x.sesi === sesiLalu).map((x) => String(x.petugas || "").trim().toLowerCase()));
  const absen = petugas.filter((n) => !sudah.has(n.trim().toLowerCase()));
  await penandaRef.set({ dicek: true, absen, waktu: new Date().toISOString() });
  if (!absen.length) { console.log(`Lapor Danru: ${shiftLalu} ${sesiLalu} lengkap.`); return; }

  const usersSnap = await db.collection("users_master").where("departemen", "==", "Security").get();
  const danru = usersSnap.docs.map((d) => d.data()).filter((u) => /danru|koordinator/i.test(u.role || "")).map((u) => u.nama).filter(Boolean);
  if (!danru.length) { console.log("Lapor Danru: belum ada akun Danru/Koordinator Security."); return; }
  const jamSesi = { "Shift 1": ["08:00–12:00", "12:00–16:00", "16:00–20:00"], "Shift 2": ["20:00–00:00", "00:00–04:00", "04:00–08:00"] }[shiftLalu][Number(sesiLalu.slice(-1)) - 1];
  const judul = "🛡️ Sesi Patroli Terlewat";
  const pesan = `${shiftLalu} ${sesiLalu} (${jamSesi}, ${tanggalLalu.split("-").reverse().join("/")}) berakhir tanpa laporan patroli dari: ${absen.join(", ")}. Mohon ditindaklanjuti.`;
  await tulisNotifPersonal(danru, judul, pesan);
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "Security").get();
  const tokens = tokenSnap.docs.map((d) => d.data()).filter((x) => x.token && danru.includes(x.pic_nama)).map((x) => x.token);
  if (tokens.length) await messaging.sendEachForMulticast({ tokens, notification: { title: judul, body: pesan }, webpush: { notification: { icon: "/icons/icon-192.png" } } });
  console.log(`Lapor Danru (${danru.join(", ")}): ${pesan}`);
}

async function jalankan() {
  await laporDanru().catch((e) => console.error("Lapor Danru gagal:", e));
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
  const bodyPesan = `Sesi patroli minimum (${MINIMUM_SESI_PER_SHIFT} dari 3) belum terpenuhi untuk ${shiftLabel} ini. Yuk lanjut patroli.`;
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: "Pengingat Patroli", body: bodyPesan },
    webpush: { notification: { icon: "/icons/icon-192.png" } },
  });
  console.log(`${response.successCount} sukses, ${response.failureCount} gagal.`);
  await tulisNotifPersonal(belumPatuh, "Pengingat Patroli", bodyPesan);
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
