// scripts/fcm-reminder.mjs
//
// Kirim push notification reminder ke semua token yang terdaftar di
// koleksi `fcm_tokens`. Dipanggil via GitHub Actions cron (lihat
// .github/workflows/fcm-reminder.yml), jam 08:30 / 13:00 / 16:00 WITA
// hari kerja. Sengaja gak butuh Blaze — cuma pakai Admin SDK biasa.
//
// Reuse secret yang sama kayak patroli-reminder.mjs / checklist-reminder.mjs:
//   FIREBASE_SERVICE_ACCOUNT_BASE64

import admin from "firebase-admin";

// ---- Init Firebase Admin dari service account base64 (sama kayak script lain) ----
const serviceAccountJson = Buffer.from(
  process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  "base64"
).toString("utf-8");
const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const messaging = admin.messaging();

// Isi notifikasi. Ganti kapan pun tanpa nyentuh logic di bawah.
const NOTIF_TITLE = "Pengingat SIBM";
const NOTIF_BODY = "Jangan lupa submit checklist tugas OB & CS hari ini ya.";

// Kalau nanti mau filter cuma dept "OB & CS", tambah field `dept` pas
// nyimpen token di useFcmSetup.ts, terus filter di sini:
//   .where("dept", "==", "OB & CS")
// Untuk sekarang kirim ke semua token yang ada.
async function getAllTokens() {
  const snap = await db.collection("fcm_tokens").get();
  const tokens = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.token) tokens.push(data.token);
  });
  return tokens;
}

async function main() {
  const tokens = await getAllTokens();

  if (tokens.length === 0) {
    console.log("Gak ada token FCM terdaftar, skip kirim.");
    return;
  }

  console.log(`Mengirim reminder ke ${tokens.length} token...`);

  // sendEachForMulticast otomatis batch max 500 token per call,
  // tapi kita chunk manual biar aman kalau suatu saat lebih dari itu.
  const CHUNK = 500;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);

    const response = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: NOTIF_TITLE,
        body: NOTIF_BODY,
      },
      webpush: {
        // dipakai kalau notif diterima lewat firebase-messaging-sw.js
        notification: {
          icon: "/icons/icon-192.png",
        },
      },
    });

    console.log(
      `Chunk ${i / CHUNK + 1}: ${response.successCount} sukses, ${response.failureCount} gagal`
    );

    // Bersihin token yang udah invalid/expired biar fcm_tokens gak numpuk sampah
    response.responses.forEach((res, idx) => {
      if (
        !res.success &&
        (res.error?.code === "messaging/registration-token-not-registered" ||
          res.error?.code === "messaging/invalid-registration-token")
      ) {
        console.log(`Token invalid, perlu dibersihkan: ${chunk[idx]}`);
        // Optional: hapus dari Firestore. Diaktifin manual kalau mau,
        // karena kita gak simpen doc-id token di sini (key-nya pic_nama).
      }
    });
  }

  console.log("Selesai.");
}

main().catch((err) => {
  console.error("FCM reminder gagal jalan:", err);
  process.exit(1);
});
