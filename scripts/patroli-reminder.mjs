import admin from "firebase-admin";

// ==========================================
// SETUP FIREBASE ADMIN
// ==========================================
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

// ==========================================
// WAKTU SEKARANG (WITA)
// ==========================================
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
const jamMenit = now.getHours() * 60 + now.getMinutes();
const toWaktu = (h, m) => h * 60 + m;

// GitHub Actions cron sering telat 30-90+ menit dari jadwal (terutama di menit :00/:30
// yang padat), jadi toleransi dilebarkan jauh dari versi awal (10 menit -> 45 menit).
const TOLERANSI_MENIT = 45;

function selisihMenit(target) {
  let selisih = Math.abs(jamMenit - target);
  return Math.min(selisih, 1440 - selisih); // handle wrap tengah malam
}

const SLOTS = [
  { id: "reminder-11", target: toWaktu(11, 0), jenis: "reminder", shift: "pagi" },
  { id: "reminder-14", target: toWaktu(14, 0), jenis: "reminder", shift: "pagi" },
  { id: "reminder-17", target: toWaktu(17, 0), jenis: "reminder", shift: "pagi" },
  { id: "preshift-1930", target: toWaktu(19, 30), jenis: "pre-shift", shift: "pagi" },
  { id: "shiftstart-2000", target: toWaktu(20, 0), jenis: "shift-start", shift: "malam" },
  { id: "reminder-23", target: toWaktu(23, 0), jenis: "reminder", shift: "malam" },
  { id: "reminder-02", target: toWaktu(2, 0), jenis: "reminder", shift: "malam" },
  { id: "reminder-05", target: toWaktu(5, 0), jenis: "reminder", shift: "malam" },
  { id: "preshift-0730", target: toWaktu(7, 30), jenis: "pre-shift", shift: "malam" },
  { id: "shiftstart-0800", target: toWaktu(8, 0), jenis: "shift-start", shift: "pagi" },
];

// Pilih slot TERDEKAT yang masih dalam toleransi (bukan sekadar yang pertama cocok),
// supaya kalau toleransi lebar bikin 2 slot berdekatan sama-sama "masuk" (mis. 19:30 & 20:00
// cuma beda 30 menit), yang kepilih tetap yang paling pas.
let slotAktif = null;
let selisihTerkecil = Infinity;
for (const s of SLOTS) {
  const selisih = selisihMenit(s.target);
  if (selisih <= TOLERANSI_MENIT && selisih < selisihTerkecil) {
    selisihTerkecil = selisih;
    slotAktif = s;
  }
}

if (!slotAktif) {
  console.log(`Jam ${now.getHours()}:${now.getMinutes()} WITA bukan waktu reminder, skip.`);
  process.exit(0);
}
console.log("Slot aktif:", slotAktif, `(selisih ${selisihTerkecil} menit dari target)`);

// ==========================================
// HELPER TANGGAL
// ==========================================
function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

const hariIni = formatTanggal(now);
const kemarin = formatTanggal(new Date(now.getTime() - 24 * 60 * 60 * 1000));

// Tanggal mulai shift malam yang SEDANG AKTIF sekarang: kalau jam sekarang masih di
// atas jam 12 siang (before midnight), shift malam yang aktif dimulai HARI INI (20:00 hari ini).
// Kalau sudah lewat tengah malam (dini hari), shift malam yang aktif dimulai KEMARIN (20:00 kemarin).
// (Bug lama: reminder 23:00 selalu pakai "kemarin" padahal seharusnya "hari ini".)
const tanggalShiftMalamAktif = now.getHours() >= 12 ? hariIni : kemarin;

// Guard anti-double-kirim: kalau workflow ke-trigger dua kali dan sama-sama nyangkut ke
// slot yang sama di hari yang sama, jangan kirim WA dua kali ke orang yang sama.
const idLogHariIni = `${hariIni}_${slotAktif.id}`;

// Fonnte butuh format 62xxx, bukan 08xxx atau +62xxx — data di users_master kadang
// disimpan mentah dari input form, jadi dinormalisasi dulu di sini sebagai jaring pengaman.
function normalisasiNomor(nomor) {
  if (!nomor) return nomor;
  let n = String(nomor).replace(/[^0-9]/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  return n;
}

// ==========================================
// AMBIL PIC YANG TERJADWAL DI SHIFT TERTENTU
// ==========================================
async function ambilPicShift(tanggalStr, shiftLabel) {
  const bulanKey = tanggalStr.substring(0, 7); // "2026-07"
  const monthSnap = await db.collection("security_monthly_schedules").doc(bulanKey).get();
  if (!monthSnap.exists) return [];

  const plotHariIni = monthSnap.data().data_hari?.[tanggalStr] || {};
  const namaTerjadwal = Object.keys(plotHariIni).filter(nama => plotHariIni[nama] === shiftLabel);
  if (namaTerjadwal.length === 0) return [];

  const usersSnap = await db.collection("users_master").where("departemen", "==", "Security").get();
  const semuaStaf = usersSnap.docs.map(d => d.data());

  return namaTerjadwal
    .map(nama => semuaStaf.find(u => u.nama === nama))
    .filter(u => u && u.whatsapp)
    .map(u => ({ nama: u.nama, whatsapp: normalisasiNomor(u.whatsapp) }));
}

// ==========================================
// KIRIM WA (FONNTE) + TULIS NOTIF IN-APP
// ==========================================
async function kirimWA(nomor, pesan) {
  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: FONNTE_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ target: nomor, message: pesan }),
  });
  const teks = await res.text();
  if (!res.ok) {
    console.error(`Gagal kirim WA ke ${nomor} (HTTP ${res.status}):`, teks);
  } else {
    console.log(`Respon Fonnte untuk ${nomor}:`, teks);
  }
}

async function tulisNotifApp(namaPic, pesan, jenis) {
  await db.collection("notifikasi_patroli").add({
    untuk_nama: namaPic,
    pesan,
    jenis,
    waktu: admin.firestore.FieldValue.serverTimestamp(),
    dibaca: false,
  });
}

async function kirimKeSemua(picList, pesan, jenis) {
  if (picList.length === 0) {
    console.log(`Tidak ada PIC terjadwal untuk jenis "${jenis}", skip kirim.`);
    return;
  }
  await Promise.all(
    picList.map(pic => Promise.all([kirimWA(pic.whatsapp, pesan), tulisNotifApp(pic.nama, pesan, jenis)]))
  );
  picList.forEach(pic => console.log(`Terkirim ke ${pic.nama} (${pic.whatsapp})`));
}

// ==========================================
// EKSEKUSI SESUAI JENIS SLOT
// ==========================================
async function jalankan() {
  // Guard anti-double-kirim: cek dulu apakah slot ini sudah pernah diproses hari ini.
  const logRef = db.collection("reminder_patroli_log").doc(idLogHariIni);
  const logSnap = await logRef.get();
  if (logSnap.exists) {
    console.log(`Slot "${slotAktif.id}" hari ini sudah pernah diproses, skip (anti-double-kirim).`);
    return;
  }
  await logRef.set({
    slot: slotAktif.id,
    diproses_pada: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (slotAktif.jenis === "reminder") {
    const list =
      slotAktif.shift === "pagi"
        ? await ambilPicShift(hariIni, "Shift 1")
        : await ambilPicShift(tanggalShiftMalamAktif, "Shift 2");
    await kirimKeSemua(
      list,
      "⏰ Reminder: waktunya patroli keliling. Jangan lupa scan & catat semua titik ya.",
      "reminder"
    );
  } else if (slotAktif.jenis === "pre-shift") {
    if (slotAktif.shift === "pagi") {
      await kirimKeSemua(
        await ambilPicShift(hariIni, "Shift 1"),
        "🔔 30 menit lagi shift kamu selesai. Pastikan patroli terakhir & laporan lengkap sebelum handover.",
        "pre-shift"
      );
      await kirimKeSemua(
        await ambilPicShift(hariIni, "Shift 2"),
        "🔔 Shift kamu mulai 30 menit lagi. Siap-siap ya.",
        "pre-shift"
      );
    } else {
      await kirimKeSemua(
        await ambilPicShift(kemarin, "Shift 2"),
        "🔔 30 menit lagi shift kamu selesai. Pastikan patroli terakhir & laporan lengkap sebelum handover.",
        "pre-shift"
      );
      await kirimKeSemua(
        await ambilPicShift(hariIni, "Shift 1"),
        "🔔 Shift kamu mulai 30 menit lagi. Siap-siap ya.",
        "pre-shift"
      );
    }
  } else if (slotAktif.jenis === "shift-start") {
    const list =
      slotAktif.shift === "malam"
        ? await ambilPicShift(hariIni, "Shift 2")
        : await ambilPicShift(hariIni, "Shift 1");
    await kirimKeSemua(list, "🚨 Shift kamu resmi mulai. Yuk mulai patroli titik pertama.", "shift-start");
  }
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch(err => {
    console.error("Error saat menjalankan reminder:", err);
    process.exit(1);
  });
