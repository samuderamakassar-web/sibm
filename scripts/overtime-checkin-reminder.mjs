// scripts/overtime-checkin-reminder.mjs
//
// Pengingat overtime OTOMATIS berdasarkan Buku Tamu Digital (security_visitor_logs, jenis
// "Karyawan") -- BEDA dari alur "Overtime Gedung/AC" yang sudah ada (itu pengajuan manual lewat
// portal). Ini murni dari CATATAN KEHADIRAN FISIK: begitu seorang karyawan sudah check-in di
// Buku Tamu >= AMBANG_JAM (9 jam) dan BELUM check-out ("Di Dalam Area"):
//   1. Kirim EMAIL ke karyawan itu sendiri (1x per sesi check-in, ada guard) -- minta konfirmasi
//      ke Security soal berapa lama lembur, boleh diabaikan kalau mau segera pulang.
//   2. Kirim PUSH NOTIFICATION ke Security yang SEDANG JAGA (TIAP RUN, TANPA guard -- sengaja
//      terus muncul selama karyawan itu belum check-out, sama pola dgn patroli-push-reminder.mjs
//      & driver-status-staleness.mjs) -- ini bagian PALING PENTING per permintaan user, supaya
//      Security gak lupa follow-up walau emailnya diabaikan/gak dibaca karyawannya.
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

// EmailJS -- ID/key ini SEMUA berasal dari env NEXT_PUBLIC_* (lihat src/lib/notify.ts), yang
// artinya SUDAH TERTANAM PUBLIK di bundle JS situs (static export) -- gak ada nilai tambah
// disembunyikan sebagai GitHub Secret, jadi sengaja di-hardcode langsung di sini biar script ini
// gak butuh secret baru sama sekali. Update manual kalau akun EmailJS-nya pernah diganti.
const EMAILJS_SERVICE_ID = "service_0e8e85u";
const EMAILJS_TEMPLATE_ID = "template_oriy1nw";
const EMAILJS_PUBLIC_KEY = "qnss7aeHCQGexHTDf";

const AMBANG_JAM = 9;

// Duplikat MINIMAL dari emailShell()/fieldRow() di src/lib/emailTemplates.ts (fungsi sumber
// aslinya: buildOvertimeCheckinEmailHtml()) -- script plain Node ESM ini gak bisa import file
// TypeScript, sama pola duplikasi yang sudah dipakai buat shift.ts di script reminder lain. Kalau
// desain emailShell() di emailTemplates.ts berubah, samakan juga di sini.
function htmlEmailOvertime({ nama, dept, jamMasukStr, jamBerlalu }) {
  const row = (label, value) => `<tr><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:12.5px;color:#71717a;font-weight:700;white-space:nowrap;vertical-align:top;width:38%;">${label}</td><td style="padding:9px 0 9px 12px;border-bottom:1px solid #f0f0ef;font-size:13.5px;color:#18181b;font-weight:600;">${value}</td></tr>`;
  const rows = row("Jam Masuk (Buku Tamu)", jamMasukStr) + row("Sudah Berlalu Sejak", `${jamBerlalu} jam`) + row("Departemen", dept);
  const body = `
    <p style="margin:0 0 16px 0;font-size:13.5px;color:#3f3f46;line-height:1.6;">
      Halo ${nama}, Anda memasuki jam overtime (lebih dari 9 jam sejak check-in di Buku Tamu Digital gedung). Mohon segera konfirmasi ke Security sampai berapa lama Anda akan lembur. <strong>Abaikan email ini kalau Anda akan segera pulang.</strong>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
  `;
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4;">
      <tr><td style="background:linear-gradient(150deg,#9f1d1d 0%,#dc2626 55%,#c62828 100%);padding:22px 26px;">
        <div style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;opacity:0.85;">SIBM &middot; PT SAMUDERA</div>
        <div style="color:#ffffff;font-size:19px;font-weight:800;margin-top:4px;">&#8987; Pengingat Jam Overtime</div>
      </td></tr>
      <tr><td style="padding:26px;">${body}</td></tr>
      <tr><td style="padding:16px 26px;background:#f7f6f5;border-top:1px solid #e7e5e4;">
        <div style="font-size:11px;color:#71717a;">Email otomatis dari Sistem Informasi Bangunan &amp; Manajemen (SIBM). Mohon tidak membalas email ini.</div>
      </td></tr>
    </table>
  </div>`;
}

async function kirimEmailViaRestApi(toEmail, toName, subject, message) {
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: { to_email: toEmail, to_name: toName, subject, message },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailJS gagal (${res.status}): ${text}`);
  }
}

const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));

function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
const hariIni = formatTanggal(now);
const kemarin = formatTanggal(new Date(now.getTime() - 24 * 60 * 60 * 1000));

const jam = now.getHours();
let shiftLabel, tanggalShift;
if (jam >= 8 && jam < 20) {
  shiftLabel = "Shift 1";
  tanggalShift = hariIni;
} else {
  shiftLabel = "Shift 2";
  tanggalShift = jam >= 20 ? hariIni : kemarin;
}

// Duplikat dari patroli-push-reminder.mjs -- lihat catatan sinkronisasi di sana.
async function ambilSecurityJaga() {
  const bulanKey = tanggalShift.substring(0, 7);
  const monthSnap = await db.collection("security_monthly_schedules").doc(bulanKey).get();
  if (!monthSnap.exists) return [];

  const plotHariIni = monthSnap.data().data_hari?.[tanggalShift] || {};
  const namaTerjadwal = Object.keys(plotHariIni).filter((nama) => plotHariIni[nama] === shiftLabel);
  if (namaTerjadwal.length === 0) return [];

  const usersSnap = await db.collection("users_master").where("departemen", "==", "Security").get();
  const semuaStaf = usersSnap.docs.map((d) => d.data());
  return namaTerjadwal.map((nama) => semuaStaf.find((u) => u.nama === nama)).filter((u) => u).map((u) => u.nama);
}

async function ambilKaryawanOvertime() {
  const snap = await db
    .collection("security_visitor_logs")
    .where("jenis", "==", "Karyawan")
    .where("status", "==", "Di Dalam Area")
    .get();

  const nowMs = now.getTime();
  const hasil = [];
  snap.forEach((d) => {
    const data = d.data();
    if (!data.waktu_masuk) return;
    const jamBerlalu = (nowMs - data.waktu_masuk.toMillis()) / (1000 * 60 * 60);
    if (jamBerlalu >= AMBANG_JAM) {
      hasil.push({ id: d.id, nama: data.nama, dept: data.instansi_dept || "-", waktuMasuk: data.waktu_masuk.toDate(), jamBerlalu });
    }
  });
  return hasil;
}

// Duplikat dari patroli-push-reminder.mjs -- lihat catatan sinkronisasi di sana.
async function tulisNotifPersonal(namaList, judul, pesan) {
  await Promise.all(namaList.map((nama) =>
    db.collection("notifikasi_personal").add({ untukNama: nama, judul, pesan, dibaca: false, waktu: FieldValue.serverTimestamp() })
  ));
}

async function ambilEmailKaryawan(nama) {
  const snap = await db.collection("employees_directory").where("nama", "==", nama).limit(1).get();
  if (snap.empty) return "";
  return snap.docs[0].data().email || "";
}

async function jalankan() {
  const daftarOvertime = await ambilKaryawanOvertime();
  if (daftarOvertime.length === 0) {
    console.log("Tidak ada karyawan yang overtime (check-in >= 9 jam & belum check-out).");
    return;
  }
  console.log(`Ditemukan ${daftarOvertime.length} karyawan overtime:`, daftarOvertime.map((k) => `${k.nama} (${k.jamBerlalu.toFixed(1)} jam)`).join(", "));

  // 1. Email ke masing-masing karyawan -- SEKALI per sesi check-in (guard by docId visitor log)
  for (const k of daftarOvertime) {
    const guardRef = db.collection("reminder_overtime_checkin_log").doc(k.id);
    const guardSnap = await guardRef.get();
    if (guardSnap.exists) {
      console.log(`  ${k.nama}: email sudah pernah dikirim utk sesi check-in ini, skip.`);
      continue;
    }

    const email = await ambilEmailKaryawan(k.nama);
    if (!email) {
      console.log(`  ${k.nama}: tidak ada email terdaftar di Master Data Karyawan, skip email (push tetap jalan).`);
      await guardRef.set({ waktu: FieldValue.serverTimestamp(), catatan: "tidak ada email" });
      continue;
    }

    const jamMasukStr = k.waktuMasuk.toLocaleString("id-ID", { timeZone: "Asia/Makassar", dateStyle: "short", timeStyle: "short" });
    const pesan = htmlEmailOvertime({ nama: k.nama, dept: k.dept, jamMasukStr, jamBerlalu: Math.floor(k.jamBerlalu) });
    try {
      await kirimEmailViaRestApi(email, k.nama, "Pengingat Jam Overtime", pesan);
      console.log(`  ${k.nama}: email overtime terkirim ke ${email}`);
      await guardRef.set({ waktu: FieldValue.serverTimestamp(), email });
    } catch (err) {
      console.error(`  ${k.nama}: gagal kirim email ->`, err.message);
      // SENGAJA gak set guard kalau gagal kirim -- biar dicoba lagi run berikutnya (30 menit lagi).
    }
  }

  // 2. Push ke Security yang SEDANG JAGA -- diulang TIAP RUN (gak ada guard) selama masih ada
  // karyawan yang belum check-out, ini bagian PALING PENTING per permintaan user.
  const securityJaga = await ambilSecurityJaga();
  if (securityJaga.length === 0) {
    console.log("Tidak ada Security terjadwal jaga saat ini, skip push.");
    return;
  }

  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "Security").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => {
    const data = d.data();
    if (data.token && data.pic_nama) tokenPerNama[data.pic_nama] = data.token;
  });
  const tokens = securityJaga.map((nama) => tokenPerNama[nama]).filter(Boolean);
  if (tokens.length === 0) {
    console.log("Security jaga tidak punya token FCM terdaftar, skip push.");
    return;
  }

  const daftarNamaStr = daftarOvertime.map((k) => `${k.nama} (${Math.floor(k.jamBerlalu)} jam)`).join(", ");
  const body = daftarOvertime.length === 1
    ? `${daftarOvertime[0].nama} masih di gedung >9 jam kerja. Mohon konfirmasi apakah lembur atau segera pulang.`
    : `${daftarOvertime.length} staf masih di gedung >9 jam kerja: ${daftarNamaStr}. Mohon konfirmasi ke masing-masing.`;

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: "⏳ Karyawan Overtime Perlu Konfirmasi", body },
    webpush: { notification: { icon: "/icons/icon-192.png" } },
  });
  console.log(`Push overtime dikirim ke ${tokens.length} Security (${securityJaga.join(", ")}) -> ${response.successCount} sukses, ${response.failureCount} gagal.`);
  await tulisNotifPersonal(securityJaga, "Karyawan Overtime Perlu Konfirmasi", body);
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan reminder overtime check-in:", err);
    process.exit(1);
  });
