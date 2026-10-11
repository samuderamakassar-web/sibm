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
// §133 Senin–Rabu: gedung belum diingatkan (kasih waktu); pengingat alat tetap dicek
const awalMinggu = hariMinggu < 4;

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

// §133 aturan baru: Fasilitas Gedung diinspeksi per area (area checklist SOP, bukan plot harian) oleh petugas yang
// ditunjuk Koordinator (settings/master_kondisi_aset.petugas_gedung, bergilir); Peralatan Kebersihan oleh Koordinator
// 2x sebulan (periode_alat YYYY-MM-P1 tgl 1–15 / P2 tgl 16–akhir), diingatkan mulai tgl 10 / 25.
async function jalankan() {
  const [masterSnap, sopSnap, plotSnap] = await Promise.all([
    db.collection("settings").doc("master_kondisi_aset").get(),
    db.collection("settings").doc("checklist_ob").get(),
    db.collection("daily_plots").doc(hariIni).get(),
  ]);
  const petugasGedung = (masterSnap.data()?.petugas_gedung || []).filter(Boolean);
  const areaSop = (sopSnap.data()?.area || []).map((a) => a.area);
  const areaGedung = (areaSop.length ? areaSop : Object.keys(plotSnap.data()?.plot_lantai || {}))
    .filter((a) => a && !a.toLowerCase().includes("pelayanan"));

  // ---------- Fasilitas Gedung (mingguan, mulai Kamis) ----------
  if (!awalMinggu && areaGedung.length) {
    const inspeksiSnap = await db.collection("inspeksi_fasilitas").where("minggu_mulai", "==", seninMingguIni).get();
    const sudah = new Set(inspeksiSnap.docs.map((d) => d.data()).filter((x) => (x.jenis || "gedung") === "gedung").map((x) => x.area));
    const belum = areaGedung.filter((a) => !sudah.has(a));
    const iniHariTerakhir = hariMinggu === 5;
    if (!belum.length) console.log(`Semua area gedung sudah diinspeksi minggu ini (${formatRentangMinggu(seninMingguIni)}).`);
    else if (!petugasGedung.length) {
      console.log("Belum ada petugas inspeksi gedung ditunjuk.");
      if (iniHariTerakhir) await kirimNotifAdminGA("🧽 Petugas Inspeksi Gedung Belum Ditunjuk", `${belum.length} area belum diinspeksi minggu ini & belum ada petugas inspeksi gedung. Koordinator OB menunjuk lewat menu Plotting.`);
    } else {
      const pesan = `Inspeksi Fasilitas Gedung minggu ini (${formatRentangMinggu(seninMingguIni)}) belum untuk: ${belum.join(", ")}. Cukup tekan "Semua aman" atau lapor temuan.${iniHariTerakhir ? " Ini hari kerja terakhir minggu ini!" : ""}`;
      await tulisNotifPersonal(petugasGedung, "🧽 Inspeksi Fasilitas Gedung Belum Selesai", pesan);
      await kirimPush(petugasGedung, "🧽 Inspeksi Fasilitas Gedung Belum Selesai", pesan, "OB & CS");
      if (iniHariTerakhir) await kirimNotifAdminGA("🧽 Inspeksi Fasilitas Gedung Tertunggak", `${belum.length} area belum diinspeksi (${formatRentangMinggu(seninMingguIni)}): ${belum.join(", ")}. Petugas: ${petugasGedung.join(", ")}.`);
    }
  }

  // ---------- Peralatan Kebersihan (Koordinator, 2x sebulan) ----------
  const tgl = now.getDate();
  const paruh = tgl <= 15 ? 1 : 2;
  const periodeAlat = `${hariIni.slice(0, 7)}-P${paruh}`;
  if ((paruh === 1 && tgl >= 10) || (paruh === 2 && tgl >= 25)) {
    const alatSnap = await db.collection("inspeksi_fasilitas").where("periode_alat", "==", periodeAlat).get();
    if (alatSnap.empty) {
      const userSnap = await db.collection("users_master").where("departemen", "==", "OB & CS").get();
      const koordinator = userSnap.docs.map((d) => d.data()).filter((u) => /koordinator/i.test(u.role || "")).map((u) => u.nama).filter(Boolean);
      const pesan = `Inspeksi Peralatan Kebersihan periode ${paruh === 1 ? "1–15" : "16–akhir"} bulan ini belum dilakukan. Cukup tekan "Semua aman" atau lapor alat yang bermasalah.`;
      if (koordinator.length) {
        await tulisNotifPersonal(koordinator, "🧹 Inspeksi Alat Kebersihan", pesan);
        await kirimPush(koordinator, "🧹 Inspeksi Alat Kebersihan", pesan, "OB & CS");
      } else console.log("Tidak ada Koordinator OB & CS terdaftar.");
    } else console.log(`Inspeksi alat periode ${periodeAlat} sudah ada.`);
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
