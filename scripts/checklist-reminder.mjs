import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const JAM_TOLERANSI_MS = 2 * 60 * 60 * 1000; // 2 jam

// Tanggal hari ini dalam zona WITA (UTC+8), biar konsisten sama doc ID daily_plots
function todayISO() {
  const now = new Date();
  const wita = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return wita.toISOString().split("T")[0];
}

async function kirimWA(nomor, pesan) {
  if (!nomor) return;
  try {
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: FONNTE_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target: nomor, message: pesan }),
    });
  } catch (err) {
    console.error(`Gagal kirim WA ke ${nomor}:`, err);
  }
}

async function main() {
  const tglHariIni = todayISO();
  console.log(`Cek reminder checklist OB untuk tanggal: ${tglHariIni}`);

  const plotSnap = await db.collection("daily_plots").doc(tglHariIni).get();
  if (!plotSnap.exists) {
    console.log("Belum ada plotting untuk hari ini, skip.");
    return;
  }

  const plotLantai = plotSnap.data().plot_lantai || {};

  // Kumpulkan area per nama (lewatkan "Semua / All" karena tidak individual)
  const tugasPerOrang = {};
  for (const [area, nama] of Object.entries(plotLantai)) {
    if (!nama || nama === "Semua / All") continue;
    if (!tugasPerOrang[nama]) tugasPerOrang[nama] = [];
    tugasPerOrang[nama].push(area);
  }

  const namaList = Object.keys(tugasPerOrang);
  if (namaList.length === 0) {
    console.log("Tidak ada penugasan individual hari ini, skip.");
    return;
  }

  const batasWaktu = Timestamp.fromMillis(Date.now() - JAM_TOLERANSI_MS);

  for (const nama of namaList) {
    const areaTugas = tugasPerOrang[nama];

    const lapSnap = await db
      .collection("ob_checklists")
      .where("pic_bertugas", "==", nama)
      .where("waktu_selesai", ">=", batasWaktu)
      .limit(1)
      .get();

    if (!lapSnap.empty) {
      console.log(`${nama} sudah lapor dalam 2 jam terakhir, skip.`);
      continue;
    }

    const userSnap = await db
      .collection("users_master")
      .where("departemen", "==", "OB & CS")
      .where("nama", "==", nama)
      .limit(1)
      .get();

    const nomorWA = userSnap.empty ? null : userSnap.docs[0].data().whatsapp;
    const areaTeks = areaTugas.join(", ");
    const pesan = `Halo ${nama}, ini reminder untuk upload laporan checklist di area: ${areaTeks}. Jangan lupa terus keliling & lapor foto before/after ya. 🧹`;

    await kirimWA(nomorWA, pesan);

    await db.collection("notifikasi_checklist_ob").add({
      untuk_nama: nama,
      pesan,
      area: areaTeks,
      jenis: "reminder_checklist",
      waktu: Timestamp.now(),
      dibaca: false,
    });

    console.log(`Reminder terkirim ke ${nama} (${areaTeks})`);
  }
}

main()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Gagal menjalankan reminder:", err);
    process.exit(1);
  });
