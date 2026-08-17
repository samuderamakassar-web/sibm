// scripts/kendaraan-reminder.mjs
//
// Cek kendaraan yang statusnya "Keluar" tapi udah lewat ambang jam tertentu tanpa update "Tiba".
// Kirim WA reminder SEKALI ke driver yang tercatat (idempotency guard per log entry, bukan per
// kendaraan — jadi kalau kendaraan yang sama keluar lagi di trip lain, dapet reminder baru lagi
// kalau kejadian telat lagi).
//
// Reuse arsitektur reminder yang sudah ada di project ini (patroli-reminder.mjs, checklist-reminder.mjs):
// Firebase Admin SDK + Fonnte WA API, dijalankan lewat GitHub Actions cron (bukan Cloud Functions,
// karena masih Spark plan). Reuse secret yang sama, tidak perlu secret baru:
//   FIREBASE_SERVICE_ACCOUNT_BASE64, FONNTE_TOKEN

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

// ── Setup Firebase Admin ────────────────────────────────────────────────
const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8");
const serviceAccount = JSON.parse(serviceAccountJson);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
// Ambang waktu (jam) sebelum kendaraan "Keluar" dianggap kelewat lama tanpa update.
// Bisa di-override lewat env AMBANG_JAM_KELUAR kalau suatu saat mau diubah tanpa ubah kode.
const AMBANG_JAM_KELUAR = Number(process.env.AMBANG_JAM_KELUAR || 6);

const isStandbyLabel = (s) => !!s && (s.includes("Standby") || s.includes("Tiba"));

// Normalisasi nomor WA Indonesia: 08xxx -> 62xxx (pola yang sama dipakai di patroli-reminder.mjs)
function normalisasiNomor(nomor) {
  if (!nomor) return null;
  let n = String(nomor).replace(/[^0-9]/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  if (!n.startsWith("62")) n = "62" + n;
  return n;
}

async function kirimWA(nomor, pesan) {
  const nomorFix = normalisasiNomor(nomor);
  if (!nomorFix) {
    console.log(`  ⚠️ Nomor WA kosong/tidak valid, skip kirim.`);
    return false;
  }
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: FONNTE_TOKEN, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ target: nomorFix, message: pesan }),
    });
    const text = await res.text();
    console.log(`  📤 Fonnte response (${nomorFix}): ${text}`);
    return res.ok;
  } catch (err) {
    console.error(`  ❌ Gagal kirim WA ke ${nomorFix}:`, err);
    return false;
  }
}

async function main() {
  console.log(`🚗 Cek kendaraan yang lupa update status (ambang: ${AMBANG_JAM_KELUAR} jam)...`);

  // 1. Ambil status TERKINI per kendaraan (dedup dari log terbaru, sama seperti logika di portal)
  const logsSnap = await db
    .collection("operational_vehicle_logs")
    .orderBy("waktu_catat", "desc")
    .limit(200) // cukup besar buat cover semua kendaraan aktif tanpa nge-scan seluruh koleksi tiap run
    .get();

  const statusTerkiniPerKendaraan = new Map(); // kendaraan -> { docId, data }
  logsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (!data.kendaraan) return;
    if (!statusTerkiniPerKendaraan.has(data.kendaraan)) {
      statusTerkiniPerKendaraan.set(data.kendaraan, { docId: docSnap.id, data });
    }
  });

  // 2. Filter yang statusnya "Keluar" (bukan Standby/Tiba) dan sudah lewat ambang jam
  const sekarang = Timestamp.now();
  const kandidat = [];
  for (const [kendaraan, { docId, data }] of statusTerkiniPerKendaraan) {
    if (isStandbyLabel(data.status_kendaraan)) continue;
    if (!data.waktu_catat) continue;
    const jamBerlalu = (sekarang.toMillis() - data.waktu_catat.toMillis()) / (1000 * 60 * 60);
    if (jamBerlalu >= AMBANG_JAM_KELUAR) {
      kandidat.push({ kendaraan, docId, data, jamBerlalu });
    }
  }

  console.log(`🔎 Ditemukan ${kandidat.length} kendaraan kandidat reminder.`);
  if (kandidat.length === 0) return;

  // 3. Tarik nomor WA semua staf sekali (dipakai buat lookup driver)
  const usersSnap = await db.collection("users_master").get();
  const nomorWaPerNama = new Map();
  usersSnap.forEach((d) => {
    const u = d.data();
    if (u.nama) nomorWaPerNama.set(u.nama, u.whatsapp);
  });

  let terkirim = 0;
  for (const { kendaraan, docId, data, jamBerlalu } of kandidat) {
    // Idempotency guard: 1 reminder per LOG ENTRY (docId operational_vehicle_logs), bukan per kendaraan —
    // supaya trip berikutnya dari kendaraan yang sama tetap dapet reminder baru kalau telat lagi
    const guardRef = db.collection("reminder_kendaraan_log").doc(docId);
    const guardSnap = await guardRef.get();
    if (guardSnap.exists) {
      console.log(`  ⏭️  ${kendaraan}: sudah pernah diingatkan untuk trip ini, skip.`);
      continue;
    }

    const namaDriver = (data.driver_bertugas || "").replace("Standby: ", "").trim();
    const jamKeluarStr = data.waktu_catat.toDate().toLocaleString("id-ID", {
      timeZone: "Asia/Makassar", dateStyle: "short", timeStyle: "short",
    });
    const pesan =
      `⏰ *Reminder SIBM*\n\n` +
      `Kendaraan *${kendaraan}* tercatat *KELUAR* sejak ${jamKeluarStr} WITA (${jamBerlalu.toFixed(1)} jam lalu)` +
      (data.tujuan_keperluan && data.tujuan_keperluan !== "-" ? ` untuk keperluan: ${data.tujuan_keperluan}.` : `.`) +
      `\n\nKalau sudah kembali ke kantor, mohon update status *Tiba* di aplikasi SIBM ya.\n` +
      `Kalau masih di perjalanan (misal luar kota), abaikan pesan ini — statusnya akan otomatis aman begitu di-update nanti.`;

    console.log(`  📨 ${kendaraan} (${namaDriver}), ${jamBerlalu.toFixed(1)} jam keluar -> kirim reminder`);

    const nomorWa = nomorWaPerNama.get(namaDriver);
    const berhasilKirim = await kirimWA(nomorWa, pesan);
    if (berhasilKirim) terkirim++;

    // Catat notifikasi in-app juga (dibaca NotifikasiKendaraanListener.tsx), best-effort — tetap ditulis
    // walau WA gagal terkirim, supaya minimal notifnya kelihatan di portal
    await db.collection("notifikasi_kendaraan").add({
      kendaraan,
      driver: namaDriver,
      tujuan: data.tujuan_keperluan || "-",
      jam_keluar_str: jamKeluarStr,
      jam_berlalu: Math.round(jamBerlalu * 10) / 10,
      pesan,
      waktu_kirim: FieldValue.serverTimestamp(),
    });

    // Tandai sudah diingatkan (guard) SETELAH percobaan kirim, terlepas WA sukses/gagal —
    // biar tidak spam re-attempt tiap run kalau nomor WA-nya memang bermasalah
    await guardRef.set({
      kendaraan, docId, jam_berlalu: jamBerlalu, wa_terkirim: berhasilKirim,
      waktu: FieldValue.serverTimestamp(),
    });
  }

  console.log(`✅ Selesai. ${terkirim}/${kandidat.length} reminder WA berhasil terkirim.`);
}

main().catch((err) => {
  console.error("❌ Reminder kendaraan gagal jalan:", err);
  process.exit(1);
});
