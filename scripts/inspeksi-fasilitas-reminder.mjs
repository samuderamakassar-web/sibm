// scripts/inspeksi-fasilitas-reminder.mjs
//
// Pengingat Inspeksi Fasilitas MINGGUAN untuk OB & CS -- ANALOG dengan apar-reminder.mjs
// (bulanan) tapi siklusnya mingguan (Senin-Minggu, minggu dimulai Senin sama persis dengan
// getSeninMingguIni() di InspeksiFasilitasPage.tsx). Area & PIC diambil dari daily_plots hari
// ini (sama sumber data dengan ChecklistOBPage), status "sudah/belum" dicek dari collection
// inspeksi_fasilitas (field minggu_mulai == Senin minggu berjalan).
//
// Jalan tiap hari (script sendiri yang skip weekend & Senin-Rabu -- pola sama dengan
// fcm-reminder.mjs, biar gak perlu utak-atik cron UTC vs WITA). Reminder BENERAN dikirim cuma
// mulai Kamis (kasih waktu Senin-Rabu dulu tanpa diganggu, mirip filosofi "H-3" di
// apar-reminder.mjs tapi diskalakan ke minggu bukan bulan). Tembusan ke Admin GA (monitoring,
// sama pola dgn apar-reminder.mjs) cuma dikirim hari Jumat (hari kerja terakhir minggu itu)
// biar gak spam tiap hari.
//
// KETERBATASAN YANG DISENGAJA: area dengan plot value literal "Semua / All" (siapa pun boleh
// kerjakan) DILEWATI dari reminder otomatis ini -- gak ada 1 nama pasti yang bisa ditarget,
// beda dari area yang diplot ke nama spesifik. Admin GA tetap bisa lihat area mana yang belum
// diinspeksi lewat admin/monitor-ob kalau perlu cek manual.
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

async function tulisNotifPersonal(namaList, judul, pesan) {
  await Promise.all(namaList.map((nama) =>
    db.collection("notifikasi_personal").add({ untukNama: nama, judul, pesan, dibaca: false, waktu: FieldValue.serverTimestamp() })
  ));
}

async function kirimPush(namaList, judul, pesan, dept) {
  if (namaList.length === 0) return;
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", dept).get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => {
    const data = d.data();
    if (data.token && data.pic_nama) tokenPerNama[data.pic_nama] = data.token;
  });
  const tokens = namaList.map((nama) => tokenPerNama[nama]).filter(Boolean);
  if (tokens.length === 0) {
    console.log(`  Tidak ada token FCM (${dept}) utk penerima ini, skip push (in-app tetap ditulis).`);
    return;
  }
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: judul, body: pesan },
    webpush: { notification: { icon: "/icons/icon-192.png" } },
  });
  console.log(`  Push ke ${tokens.length} penerima (${dept}) -> ${response.successCount} sukses, ${response.failureCount} gagal.`);
}

async function kirimNotifAdminGA(judul, pesan) {
  const snap = await db.collection("users_master").where("departemen", "==", "Admin GA").get();
  const namaAdmin = snap.docs.map((d) => d.data().nama).filter(Boolean);
  if (namaAdmin.length === 0) {
    console.log("Tidak ada Admin GA terdaftar, skip tembusan.");
    return;
  }
  await tulisNotifPersonal(namaAdmin, judul, pesan);
  await kirimPush(namaAdmin, judul, pesan, "Admin GA");
}

const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));

function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
const hariIni = formatTanggal(now);
const hariMinggu = now.getDay(); // 0 = Minggu ... 6 = Sabtu

if (hariMinggu === 0 || hariMinggu === 6) {
  console.log("Weekend, OB & CS tidak ada jadwal, skip.");
  process.exit(0);
}
if (hariMinggu < 4) {
  console.log(`Hari ${["Minggu", "Senin", "Selasa", "Rabu"][hariMinggu]}, masih awal minggu -- kasih waktu dulu sebelum diingatkan, skip.`);
  process.exit(0);
}

// Senin minggu berjalan -- sama persis dengan getSeninMingguIni() di InspeksiFasilitasPage.tsx.
function getSeninMingguIni(d) {
  const dow = d.getDay();
  const mundur = dow === 0 ? 6 : dow - 1;
  const senin = new Date(d);
  senin.setDate(d.getDate() - mundur);
  return formatTanggal(senin);
}
const seninMingguIni = getSeninMingguIni(now);

function formatRentangMinggu(seninISO) {
  const senin = new Date(`${seninISO}T00:00:00`);
  const minggu = new Date(senin);
  minggu.setDate(senin.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return `${fmt(senin)} - ${fmt(minggu)}`;
}

async function jalankan() {
  const plotSnap = await db.collection("daily_plots").doc(hariIni).get();
  if (!plotSnap.exists) {
    console.log("Belum ada plotting hari ini, skip.");
    return;
  }
  const plotLantai = plotSnap.data().plot_lantai || {};

  const areaPerPic = {};
  for (const [area, nama] of Object.entries(plotLantai)) {
    if (!nama || nama === "Semua / All") continue; // area shared -- gak ada 1 nama pasti, lihat catatan di atas.
    if (!areaPerPic[nama]) areaPerPic[nama] = [];
    areaPerPic[nama].push(area);
  }
  const daftarPic = Object.keys(areaPerPic);
  if (daftarPic.length === 0) {
    console.log("Tidak ada PIC dengan area spesifik terplot hari ini, skip.");
    return;
  }

  const inspeksiSnap = await db.collection("inspeksi_fasilitas").where("minggu_mulai", "==", seninMingguIni).get();
  const areaSudahInspeksi = new Set(inspeksiSnap.docs.map((d) => d.data().area));

  const picBelumLengkap = [];
  for (const [nama, areaList] of Object.entries(areaPerPic)) {
    const belum = areaList.filter((a) => !areaSudahInspeksi.has(a));
    if (belum.length > 0) picBelumLengkap.push({ nama, areaBelum: belum });
  }

  if (picBelumLengkap.length === 0) {
    console.log(`Semua area sudah diinspeksi minggu ini (${formatRentangMinggu(seninMingguIni)}).`);
    return;
  }

  console.log(`${picBelumLengkap.length} PIC belum lengkap inspeksi minggu ini:`, picBelumLengkap.map((p) => `${p.nama} (${p.areaBelum.join(", ")})`).join("; "));

  const iniHariTerakhir = hariMinggu === 5; // Jumat -- hari kerja terakhir OB & CS minggu ini.
  for (const p of picBelumLengkap) {
    const pesan = `Inspeksi Fasilitas Mingguan area ${p.areaBelum.join(", ")} belum diselesaikan minggu ini (${formatRentangMinggu(seninMingguIni)}).${iniHariTerakhir ? " Ini hari kerja terakhir minggu ini!" : ""}`;
    await tulisNotifPersonal([p.nama], "🧽 Inspeksi Fasilitas Mingguan Belum Selesai", pesan);
    await kirimPush([p.nama], "🧽 Inspeksi Fasilitas Mingguan Belum Selesai", pesan, "OB & CS");
  }

  if (iniHariTerakhir) {
    const daftar = picBelumLengkap.map((p) => `${p.nama} (${p.areaBelum.join(", ")})`).join("; ");
    await kirimNotifAdminGA(
      "🧽 Inspeksi Fasilitas Mingguan Tertunggak",
      `${picBelumLengkap.length} PIC OB/CS belum menyelesaikan Inspeksi Fasilitas Mingguan (${formatRentangMinggu(seninMingguIni)}): ${daftar}.`
    );
  }
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan reminder inspeksi fasilitas:", err);
    process.exit(1);
  });
