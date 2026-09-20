// scripts/laporan-baru-reminder.mjs
//
// Notifikasi push + kotak masuk in-app tiap kali ada laporan BARU masuk dari form Menu Cepat
// portal utama (src/app/page.tsx): Bahaya SBO, Kerusakan/Helpdesk, Overtime Gedung, Request ATK.
// Sebelumnya laporan-laporan ini CUMA dikirim email lewat EmailJS client-side (best-effort,
// non-blocking, gampang gagal diam-diam kalau EmailJS lagi bermasalah -- lihat blocker EmailJS
// yang sudah didokumentasikan di §41B) -- sekarang ditambah push+in-app yang independen dari
// EmailJS sama sekali, biar tetap kelihatan walau email gagal.
//
// App ini static export (output:"export"), TIDAK ada Cloud Functions/trigger real-time server-
// side, jadi "baru" di sini artinya "belum diproses run sebelumnya" (dicek pakai checkpoint
// timestamp per jenis laporan), BUKAN instan detik itu juga -- baru kelihatan di push maks
// selambat-lambatnya AMBANG waktu antar-run cron (lihat .github/workflows/laporan-baru-reminder.yml,
// tiap 15 menit).
//
// SBO dikirim ke QHSE (domain aslinya, sama seperti email lama) DAN Admin GA (permintaan user
// eksplisit "push notif ke admin" mencakup SBO juga) -- 3 jenis lainnya cuma ke Admin GA.
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

async function kirimPushDept(dept, judul, pesan) {
  const usersSnap = await db.collection("users_master").where("departemen", "==", dept).get();
  const namaList = usersSnap.docs.map((d) => d.data().nama).filter(Boolean);
  if (namaList.length === 0) {
    console.log(`  Tidak ada staf ${dept} terdaftar di users_master, skip notifikasi.`);
    return;
  }
  await tulisNotifPersonal(namaList, judul, pesan);

  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", dept).get();
  const tokens = [];
  tokenSnap.forEach((d) => { if (d.data().token) tokens.push(d.data().token); });
  if (tokens.length === 0) {
    console.log(`  Notifikasi in-app ditulis (${dept}), tapi belum ada token FCM terdaftar, skip push.`);
    return;
  }
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: judul, body: pesan },
    webpush: { notification: { icon: "/icons/icon-192.png" } },
  });
  console.log(`  Push ke ${tokens.length} ${dept} -> ${response.successCount} sukses, ${response.failureCount} gagal.`);
}

async function ambilCheckpoint(jenis) {
  const ref = db.collection("reminder_laporan_baru_log").doc(jenis);
  const snap = await ref.get();
  return { ref, terakhir: snap.exists ? snap.data().terakhir_diproses : null };
}

// Proses 1 jenis laporan: cari dokumen dengan waktuField LEBIH BARU dari checkpoint terakhir,
// notifikasi tiap dokumen baru, lalu majukan checkpoint ke dokumen terbaru yang ditemukan.
async function prosesJenis({ jenis, collectionName, waktuField, notify, formatPesan }) {
  const { ref, terakhir } = await ambilCheckpoint(jenis);
  let q = db.collection(collectionName).orderBy(waktuField, "asc");
  if (terakhir) q = q.where(waktuField, ">", terakhir);
  const snap = await q.get();

  if (snap.empty) {
    console.log(`${jenis}: tidak ada laporan baru.`);
    return;
  }

  // Run PERTAMA kali (belum ada checkpoint sama sekali): JANGAN notifikasi seluruh histori lama
  // yang sudah ada duluan -- cukup set checkpoint ke laporan terbaru SAAT INI, notifikasi baru
  // mulai jalan dari laporan berikutnya yang masuk setelah ini.
  if (!terakhir) {
    const terbaru = snap.docs[snap.docs.length - 1].data()[waktuField];
    await ref.set({ terakhir_diproses: terbaru });
    console.log(`${jenis}: checkpoint pertama diset ke laporan terbaru yang ada sekarang (${snap.size} dokumen histori dilewati, gak dinotifikasi retroaktif).`);
    return;
  }

  for (const doc of snap.docs) {
    const pesan = formatPesan(doc.data());
    await notify(pesan);
    console.log(`${jenis}: notifikasi terkirim -- ${pesan}`);
  }

  const terbaru = snap.docs[snap.docs.length - 1].data()[waktuField];
  await ref.set({ terakhir_diproses: terbaru });
}

async function jalankan() {
  await prosesJenis({
    jenis: "sbo",
    collectionName: "qhse_sbo_reports",
    waktuField: "waktu_lapor",
    formatPesan: (d) => `${d.nama_pelapor || "Seseorang"} melaporkan bahaya di ${d.lokasi || "-"} (${d.kategori_temuan || "-"}): ${d.detail_temuan || "-"}`,
    notify: async (pesan) => {
      await kirimPushDept("QHSE", "⚠️ Laporan Bahaya SBO Baru", pesan);
      await kirimPushDept("Admin GA", "⚠️ Laporan Bahaya SBO Baru", pesan);
    },
  });

  await prosesJenis({
    jenis: "helpdesk",
    collectionName: "helpdesk_tickets",
    waktuField: "waktu_lapor",
    formatPesan: (d) => `${d.nama_pelapor || "Seseorang"} (${d.departemen || "-"}) melaporkan kerusakan di ${d.lokasi || "-"}: ${d.deskripsi || "-"}`,
    notify: async (pesan) => kirimPushDept("Admin GA", "🔧 Laporan Kerusakan Baru", pesan),
  });

  await prosesJenis({
    jenis: "overtime",
    collectionName: "ga_overtime_requests",
    waktuField: "waktu_request",
    formatPesan: (d) => `${d.nama_pemohon || "Seseorang"} (${d.departemen || "-"}) mengajukan overtime ${d.tanggal || "-"} pukul ${d.jam_mulai || "-"}-${d.jam_selesai || "-"} di ${d.area_ruangan || "-"} (${d.alasan || "-"})`,
    notify: async (pesan) => kirimPushDept("Admin GA", "🕘 Pengajuan Overtime Gedung Baru", pesan),
  });

  await prosesJenis({
    jenis: "atk",
    collectionName: "ga_atk_requests",
    waktuField: "waktu_request",
    formatPesan: (d) => {
      const items = (d.items || []).map((i) => `${i.nama_barang} x${i.jumlah}`).join(", ");
      return `${d.nama_pemohon || "Seseorang"} (${d.departemen || "-"}) request ATK: ${items || "-"}`;
    },
    notify: async (pesan) => kirimPushDept("Admin GA", "📦 Request ATK Baru", pesan),
  });
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan notifikasi laporan baru:", err);
    process.exit(1);
  });
