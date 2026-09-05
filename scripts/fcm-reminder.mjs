// scripts/fcm-reminder.mjs
//
// Kirim push notification (FCM) TERTARGET ke staf OB & CS yang checklist
// kebersihannya masih pending di sesi berjalan (Pagi/Siang/Sore) -- bukan
// lagi blast generik ke semua token. Dipanggil via GitHub Actions cron
// (lihat .github/workflows/fcm-reminder.yml) tiap 30 menit, SEPANJANG hari
// -- script ini sendiri yang memutuskan skip kalau lagi di luar jendela
// sesi/weekend (biar gak perlu utak-atik cron UTC vs WITA yang rawan salah
// hitung buat "cuma weekday").
//
// Reuse secret yang sama kayak script reminder lain: FIREBASE_SERVICE_ACCOUNT_BASE64

import admin from "firebase-admin";

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const messaging = admin.messaging();

// ==========================================
// WAKTU SEKARANG (WITA)
// ==========================================
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));

function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
const hariIni = formatTanggal(now);
const hariMinggu = now.getDay(); // 0 = Minggu, 6 = Sabtu

// ==========================================
// SESI CHECKLIST OB -- duplikat manual dari src/lib/shift.ts (script plain Node ESM,
// tidak bisa import TypeScript/path alias). Kalau jendela sesi berubah, ubah juga di sana.
// ==========================================
function sesiOBSekarang(d) {
  const menit = d.getHours() * 60 + d.getMinutes();
  if (menit >= 7 * 60 && menit < 10 * 60) return "Pagi";
  if (menit >= 11 * 60 + 30 && menit < 14 * 60 + 30) return "Siang";
  if (menit >= 14 * 60 + 30 && menit < 17 * 60 + 30) return "Sore";
  return null;
}

async function jalankan() {
  if (hariMinggu === 0 || hariMinggu === 6) {
    console.log("Weekend, OB & CS tidak ada jadwal, skip.");
    return;
  }

  const sesiSekarang = sesiOBSekarang(now);
  if (!sesiSekarang) {
    console.log(`Jam ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")} WITA di luar jendela sesi checklist, skip.`);
    return;
  }

  const plotSnap = await db.collection("daily_plots").doc(hariIni).get();
  if (!plotSnap.exists) {
    console.log("Belum ada plotting hari ini, skip.");
    return;
  }
  const plotLantai = plotSnap.data().plot_lantai || {};

  // Kumpulkan area per-PIC (1 PIC bisa pegang lebih dari 1 area, mis. Basement+Lantai 1).
  const areaPerPic = {};
  for (const [area, nama] of Object.entries(plotLantai)) {
    if (!nama) continue;
    if (!areaPerPic[nama]) areaPerPic[nama] = [];
    areaPerPic[nama].push(area);
  }
  const daftarPic = Object.keys(areaPerPic);
  if (daftarPic.length === 0) {
    console.log("Tidak ada PIC terplot hari ini, skip.");
    return;
  }

  // Cek siapa yang SUDAH lapor di sesi ini (query 1x, filter di memory -- jumlah dokumen
  // per hari kecil, gak perlu query per-PIC).
  const checklistSnap = await db
    .collection("ob_checklists")
    .where("tanggal", "==", hariIni)
    .where("sesi", "==", sesiSekarang)
    .get();
  const picSudahLapor = new Set(checklistSnap.docs.map((d) => d.data().pic_bertugas));

  const picBelumLapor = daftarPic.filter((nama) => !picSudahLapor.has(nama));
  if (picBelumLapor.length === 0) {
    console.log(`Semua PIC sudah lapor sesi ${sesiSekarang} hari ini.`);
    return;
  }

  // Ambil token FCM cuma buat PIC yang belum lapor (bukan semua token OB & CS).
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "OB & CS").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => {
    const data = d.data();
    if (data.token && data.pic_nama) tokenPerNama[data.pic_nama] = data.token;
  });

  const target = picBelumLapor
    .map((nama) => ({ nama, token: tokenPerNama[nama], area: areaPerPic[nama].join(", ") }))
    .filter((t) => t.token);

  if (target.length === 0) {
    console.log("Belum lapor tapi tidak ada token FCM terdaftar untuk PIC-PIC itu, skip kirim.");
    return;
  }

  console.log(`Mengirim reminder sesi ${sesiSekarang} ke ${target.length} PIC yang belum lapor:`, target.map((t) => t.nama).join(", "));

  const response = await messaging.sendEachForMulticast({
    tokens: target.map((t) => t.token),
    notification: {
      title: `Pengingat Checklist Sesi ${sesiSekarang}`,
      body: "Checklist kebersihan area kamu hari ini belum disubmit. Yuk selesaikan sebelum sesi berikutnya.",
    },
    webpush: {
      notification: { icon: "/icons/icon-192.png" },
    },
  });

  console.log(`${response.successCount} sukses, ${response.failureCount} gagal.`);
  response.responses.forEach((res, idx) => {
    if (!res.success) {
      console.log(`Gagal kirim ke ${target[idx].nama}:`, res.error?.code);
    }
  });
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FCM reminder gagal jalan:", err);
    process.exit(1);
  });
