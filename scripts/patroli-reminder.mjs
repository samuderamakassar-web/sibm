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

function dekatDenganToleransi(target, toleransiMenit = 10) {
  let selisih = Math.abs(jamMenit - target);
  selisih = Math.min(selisih, 1440 - selisih); // handle wrap tengah malam (misal target 0, jam 23:55)
  return selisih <= toleransiMenit;
}

const SLOTS = [
  { target: toWaktu(11, 0), jenis: "reminder", shift: "pagi" },
  { target: toWaktu(14, 0), jenis: "reminder", shift: "pagi" },
  { target: toWaktu(17, 0), jenis: "reminder", shift: "pagi" },
  { target: toWaktu(19, 30), jenis: "pre-shift", shift: "pagi" },
  { target: toWaktu(20, 0), jenis: "shift-start", shift: "malam" },
  { target: toWaktu(23, 0), jenis: "reminder", shift: "malam" },
  { target: toWaktu(2, 0), jenis: "reminder", shift: "malam" },
  { target: toWaktu(5, 0), jenis: "reminder", shift: "malam" },
  { target: toWaktu(7, 30), jenis: "pre-shift", shift: "malam" },
  { target: toWaktu(8, 0), jenis: "shift-start", shift: "pagi" },
];

const slotAktif = SLOTS.find(s => dekatDenganToleransi(s.target));
if (!slotAktif) {
  console.log(`Jam ${now.getHours()}:${now.getMinutes()} WITA bukan waktu reminder, skip.`);
  process.exit(0);
}
console.log("Slot aktif:", slotAktif);

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
    .map(u => ({ nama: u.nama, whatsapp: u.whatsapp }));
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
  if (!res.ok) console.error(`Gagal kirim WA ke ${nomor}:`, await res.text());
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
  if (slotAktif.jenis === "reminder") {
    const list =
      slotAktif.shift === "pagi"
        ? await ambilPicShift(hariIni, "Shift 1")
        : await ambilPicShift(kemarin, "Shift 2"); // shift malam kemarin masih berjalan lewat tengah malam
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
