// scripts/legalitas-reminder.mjs
//
// Pengingat dokumen legalitas/perizinan/perjanjian (master_legalitas) ke Admin GA -- BEDA
// dari laptop-reminder.mjs, ini SENGAJA BERULANG (bukan 1x) begitu dokumen masuk jendela
// AMBANG_HARI_MULAI (60 hari / ~2 bulan) sebelum tanggal_berakhir_aktif-nya:
//   - Notif pertama: begitu SISA HARI <= 60 (baik pas masuk jendela ATAU dokumen baru dibuat
//     yang kebetulan sudah dekat/lewat tanggal berakhirnya).
//   - Notif ulang WAJIB di milestone tepat 60 & 30 hari (AMBANG_HARI_MILESTONE).
//   - Selain milestone, diulang tiap >= JEDA_ULANG_HARI (7 hari) sejak notif terakhir --
//     TERUS BERLANJUT walau sudah lewat tanggal_berakhir (sisaHari negatif), sampai user
//     benar-benar klik "Perbarui" di admin/legalitas (yang mengubah tanggal_berakhir_aktif,
//     otomatis me-reset siklus checkpoint ini karena dicocokkan PER TANGGAL, bukan flag biasa).
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

// EmailJS -- duplikat pola yang sama dengan scripts/points-deduction.mjs & overtime-checkin-reminder.mjs.
const EMAILJS_SERVICE_ID = "service_0e8e85u";
const EMAILJS_TEMPLATE_ID = "template_oriy1nw";
const EMAILJS_PUBLIC_KEY = "qnss7aeHCQGexHTDf";

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

const AMBANG_HARI_MULAI = 60;
const AMBANG_HARI_MILESTONE = [60, 30];
const JEDA_ULANG_HARI = 7;

const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
const hariIniStr = formatTanggal(now);
const hariIniTgl = new Date(hariIniStr);

function hitungSisaHari(tanggalBerakhir) {
  return Math.ceil((new Date(tanggalBerakhir).getTime() - hariIniTgl.getTime()) / (1000 * 60 * 60 * 24));
}

function perluDikirimHariIni(data, sisaHari) {
  const cp = data.notif_legalitas_terakhir;
  const sudahAdaCheckpointUntukTanggalIni = cp && cp.untuk_tanggal === data.tanggal_berakhir_aktif;
  if (!sudahAdaCheckpointUntukTanggalIni) return true; // pertama kali masuk jendela utk tanggal aktif ini
  if (AMBANG_HARI_MILESTONE.includes(sisaHari)) return true; // wajib di milestone persis 60/30 hari
  const hariSejakTerakhir = Math.floor((hariIniTgl.getTime() - new Date(cp.tanggal_kirim).getTime()) / (1000 * 60 * 60 * 24));
  return hariSejakTerakhir >= JEDA_ULANG_HARI;
}

function htmlEmailLegalitas(daftar) {
  const baris = daftar.map((d) => {
    const sisaTeks = d.sisaHari < 0 ? `Lewat ${Math.abs(d.sisaHari)} hari` : `${d.sisaHari} hari lagi`;
    return `<tr><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#18181b;font-weight:700;">${d.nama_dokumen}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#3f3f46;">${d.jenis}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#71717a;">${d.tanggal_berakhir_aktif}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;font-weight:700;color:${d.sisaHari < 0 ? "#dc2626" : "#d97706"};">${sisaTeks}</td></tr>`;
  }).join("");
  const body = `
    <p style="margin:0 0 16px 0;font-size:13.5px;color:#3f3f46;line-height:1.6;">
      ${daftar.length} dokumen legalitas/perizinan/perjanjian mendekati atau sudah melewati masa berlakunya. Notifikasi ini akan TERUS DIULANG tiap minggu sampai dokumennya diperbarui di menu Legalitas &amp; Perizinan.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Dokumen</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Jenis</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Berakhir</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Sisa</td></tr>
      ${baris}
    </table>
  `;
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4;">
      <tr><td style="background:linear-gradient(150deg,#9f1d1d 0%,#dc2626 55%,#c62828 100%);padding:22px 26px;">
        <div style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;opacity:0.85;">SIBM &middot; PT SAMUDERA</div>
        <div style="color:#ffffff;font-size:19px;font-weight:800;margin-top:4px;">&#128220; Dokumen Legalitas Perlu Diperpanjang</div>
      </td></tr>
      <tr><td style="padding:26px;">${body}</td></tr>
      <tr><td style="padding:16px 26px;background:#f7f6f5;border-top:1px solid #e7e5e4;">
        <div style="font-size:11px;color:#71717a;">Email otomatis dari Sistem Informasi Bangunan &amp; Manajemen (SIBM). Mohon tidak membalas email ini.</div>
      </td></tr>
    </table>
  </div>`;
}

async function ambilEmailAdminGA() {
  const snap = await db.collection("users_master").where("departemen", "==", "Admin GA").get();
  return snap.docs.map((d) => d.data()).filter((u) => u.email).map((u) => ({ nama: u.nama, email: u.email }));
}

async function ambilNamaAdminGA() {
  const snap = await db.collection("users_master").where("departemen", "==", "Admin GA").get();
  return snap.docs.map((d) => d.data().nama).filter(Boolean);
}

async function tulisNotifPersonal(namaList, judul, pesan) {
  await Promise.all(namaList.map((nama) =>
    db.collection("notifikasi_personal").add({ untukNama: nama, judul, pesan, dibaca: false, waktu: FieldValue.serverTimestamp() })
  ));
}

async function kirimPushAdminGA(judul, pesan) {
  const namaAdmin = await ambilNamaAdminGA();
  if (namaAdmin.length === 0) {
    console.log("Tidak ada Admin GA terdaftar di users_master, skip notifikasi.");
    return;
  }
  await tulisNotifPersonal(namaAdmin, judul, pesan);

  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "Admin GA").get();
  const tokens = [];
  tokenSnap.forEach((d) => { if (d.data().token) tokens.push(d.data().token); });
  if (tokens.length === 0) {
    console.log("Notifikasi in-app ditulis, tapi belum ada token FCM Admin GA terdaftar, skip push.");
    return;
  }
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: judul, body: pesan },
    webpush: { notification: { icon: "/icons/icon-192.png" } },
  });
  console.log(`Push ke ${tokens.length} Admin GA -> ${response.successCount} sukses, ${response.failureCount} gagal.`);
}

async function jalankan() {
  const snap = await db.collection("master_legalitas").get();
  const daftarDue = [];
  snap.forEach((d) => {
    const data = d.data();
    if (!data.tanggal_berakhir_aktif) return;
    const sisaHari = hitungSisaHari(data.tanggal_berakhir_aktif);
    if (sisaHari > AMBANG_HARI_MULAI) return;
    if (!perluDikirimHariIni(data, sisaHari)) return;
    daftarDue.push({ id: d.id, nama_dokumen: data.nama_dokumen, jenis: data.jenis, tanggal_berakhir_aktif: data.tanggal_berakhir_aktif, sisaHari });
  });

  if (daftarDue.length === 0) {
    console.log("Tidak ada dokumen legalitas yang perlu diingatkan hari ini.");
    return;
  }
  console.log(`Ditemukan ${daftarDue.length} dokumen perlu diingatkan:`, daftarDue.map((d) => `${d.nama_dokumen} (${d.sisaHari}H)`).join(", "));

  const adminGA = await ambilEmailAdminGA();
  if (adminGA.length === 0) {
    console.log("Tidak ada email Admin GA terdaftar di users_master, skip email.");
  } else {
    const html = htmlEmailLegalitas(daftarDue);
    for (const admin of adminGA) {
      try {
        await kirimEmailViaRestApi(admin.email, admin.nama, "Dokumen Legalitas Perlu Diperpanjang", html);
        console.log(`Email legalitas terkirim ke ${admin.nama} (${admin.email})`);
      } catch (err) {
        console.error(`Gagal kirim email legalitas ke ${admin.nama}:`, err.message);
      }
    }
  }

  const pesanPush = daftarDue.length === 1
    ? `Dokumen "${daftarDue[0].nama_dokumen}" ${daftarDue[0].sisaHari < 0 ? "sudah lewat" : "sisa " + daftarDue[0].sisaHari + " hari"} masa berlakunya.`
    : `${daftarDue.length} dokumen legalitas/perizinan perlu diperpanjang. Cek menu Legalitas & Perizinan untuk detail.`;
  await kirimPushAdminGA("📋 Dokumen Legalitas Perlu Diperpanjang", pesanPush);

  await Promise.all(daftarDue.map((d) =>
    db.collection("master_legalitas").doc(d.id).update({
      notif_legalitas_terakhir: { untuk_tanggal: d.tanggal_berakhir_aktif, tanggal_kirim: hariIniStr },
    })
  ));
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan reminder legalitas:", err);
    process.exit(1);
  });
