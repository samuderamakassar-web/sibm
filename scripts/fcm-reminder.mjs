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

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const messaging = getMessaging();

// Duplikat dari patroli-push-reminder.mjs -- lihat catatan sinkronisasi di sana.
async function tulisNotifPersonal(namaList, judul, pesan) {
  await Promise.all(namaList.map((nama) =>
    db.collection("notifikasi_personal").add({ untukNama: nama, judul, pesan, dibaca: false, waktu: FieldValue.serverTimestamp() })
  ));
}

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

  // §169 uji coba pola zona OB: pengingat sesi lama diganti 2 pengingat per hari --
  // 12:00-12:29 & 16:30-16:59 bila ronde hari ini masih kurang dari minimal.
  const uji = (await db.collection("ob_settings").doc("uji_pola_zona").get()).data();
  if (uji?.aktif && hariIni >= uji.mulai && hariIni <= uji.selesai) {
    await pengingatZona(uji);
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

  const bodyPesan = "Checklist kebersihan area kamu hari ini belum disubmit. Yuk selesaikan sebelum sesi berikutnya.";
  const response = await messaging.sendEachForMulticast({
    tokens: target.map((t) => t.token),
    notification: { title: `Pengingat Checklist Sesi ${sesiSekarang}`, body: bodyPesan },
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
  await tulisNotifPersonal(picBelumLapor, `Pengingat Checklist Sesi ${sesiSekarang}`, bodyPesan);
}

async function pengingatZona(uji) {
  const menit = now.getHours() * 60 + now.getMinutes();
  const siang = menit >= 12 * 60 && menit < 12 * 60 + 30;
  const sore = menit >= 16 * 60 + 30 && menit < 17 * 60;
  if (!siang && !sore) {
    console.log("Uji coba pola zona: di luar jam pengingat (12:00 & 16:30 WITA), skip.");
    return;
  }
  const libur = (await db.collection("settings").doc("validasi_karyawan").get()).data()?.hari_libur || [];
  if (libur.includes(hariIni)) {
    console.log("Uji coba pola zona: hari libur, skip.");
    return;
  }
  const peserta = [...(uji.tim_tenant || []), ...(uji.tim_publik || [])];
  const laporan = (await db.collection("ob_zona_laporan").where("tanggal", "==", hariIni).get()).docs.map((d) => d.data());
  const minRonde = Math.max(1, Number(uji.min_ronde) || 1);
  const pesanPer = {};
  for (const nama of peserta) {
    const milik = laporan.filter((l) => String(l.nama || "").trim().toLowerCase() === nama.trim().toLowerCase());
    const ronde = milik.filter((l) => l.jenis === "ronde").length;
    // §171 tanpa penilaian dari staf -- yang diingatkan hanya ronde
    if (ronde < minRonde) pesanPer[nama] = `Checklist Zona hari ini belum lengkap: ronde ${ronde}/${minRonde}. Isi di menu Checklist Zona.`;
  }
  const namaKirim = Object.keys(pesanPer);
  if (namaKirim.length === 0) {
    console.log("Uji coba pola zona: semua peserta sudah lengkap.");
    return;
  }
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "OB & CS").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => { const x = d.data(); if (x.token && x.pic_nama) tokenPerNama[x.pic_nama] = x.token; });
  const judul = "Pengingat Checklist Zona";
  for (const nama of namaKirim) {
    const token = tokenPerNama[nama];
    if (!token) { console.log(`Tanpa token FCM: ${nama}`); continue; }
    try {
      await messaging.send({ token, notification: { title: judul, body: pesanPer[nama] }, webpush: { notification: { icon: "/icons/icon-192.png" } } });
      console.log(`Terkirim ke ${nama}`);
    } catch (e) { console.log(`Gagal kirim ke ${nama}:`, e?.code); }
  }
  await Promise.all(namaKirim.map((nama) => tulisNotifPersonal([nama], judul, pesanPer[nama])));
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
