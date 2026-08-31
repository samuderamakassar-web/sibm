// scripts/kendaraan-reminder.mjs
//
// Cek kendaraan yang statusnya "Keluar" tapi udah lewat ambang jam tertentu tanpa update "Tiba".
// Tulis notifikasi in-app SEKALI ke driver yang tercatat (idempotency guard per log entry, bukan per
// kendaraan — jadi kalau kendaraan yang sama keluar lagi di trip lain, dapet reminder baru lagi
// kalau kejadian telat lagi).
//
// Reuse arsitektur reminder yang sudah ada di project ini (patroli-reminder.mjs, checklist-reminder.mjs):
// Firebase Admin SDK, dijalankan lewat GitHub Actions cron (bukan Cloud Functions, karena masih Spark
// plan). Reuse secret yang sama, tidak perlu secret baru: FIREBASE_SERVICE_ACCOUNT_BASE64
// (notifikasi WhatsApp via Fonnte SUDAH DIHAPUS TOTAL -- token invalid/expired, sekarang cuma
// notifikasi in-app lewat NotifikasiKendaraanListener.tsx)

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

// ── Setup Firebase Admin ────────────────────────────────────────────────
const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8");
const serviceAccount = JSON.parse(serviceAccountJson);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Ambang waktu (jam) sebelum kendaraan "Keluar" dianggap kelewat lama tanpa update.
// Bisa di-override lewat env AMBANG_JAM_KELUAR kalau suatu saat mau diubah tanpa ubah kode.
const AMBANG_JAM_KELUAR = Number(process.env.AMBANG_JAM_KELUAR || 6);

const isStandbyLabel = (s) => !!s && (s.includes("Standby") || s.includes("Tiba"));

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

  let dicatat = 0;
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
      `Kendaraan ${kendaraan} tercatat KELUAR sejak ${jamKeluarStr} WITA (${jamBerlalu.toFixed(1)} jam lalu)` +
      (data.tujuan_keperluan && data.tujuan_keperluan !== "-" ? ` untuk keperluan: ${data.tujuan_keperluan}.` : `.`) +
      ` Kalau sudah kembali ke kantor, mohon update status Tiba di aplikasi SIBM ya.`;

    console.log(`  📨 ${kendaraan} (${namaDriver}), ${jamBerlalu.toFixed(1)} jam keluar -> catat reminder in-app`);

    // Catat notifikasi in-app (dibaca NotifikasiKendaraanListener.tsx) -- sebelumnya juga kirim WA
    // (Fonnte), TAPI SUDAH DIHAPUS TOTAL karena token invalid/expired. Sekarang cuma in-app.
    await db.collection("notifikasi_kendaraan").add({
      kendaraan,
      driver: namaDriver,
      tujuan: data.tujuan_keperluan || "-",
      jam_keluar_str: jamKeluarStr,
      jam_berlalu: Math.round(jamBerlalu * 10) / 10,
      pesan,
      waktu_kirim: FieldValue.serverTimestamp(),
    });
    dicatat++;

    // Tandai sudah diingatkan (guard), biar tidak spam re-attempt tiap run
    await guardRef.set({
      kendaraan, docId, jam_berlalu: jamBerlalu,
      waktu: FieldValue.serverTimestamp(),
    });
  }

  console.log(`✅ Selesai. ${dicatat}/${kandidat.length} reminder in-app dicatat.`);
}

main().catch((err) => {
  console.error("❌ Reminder kendaraan gagal jalan:", err);
  process.exit(1);
});
