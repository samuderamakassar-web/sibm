// scripts/laptop-reminder.mjs
//
// Pengingat masa sewa laptop ke Admin GA -- 1x per hari, kirim EMAIL + PUSH begitu sebuah
// laptop (master_laptop, belum ditandai dikembalikan) tersisa <= AMBANG_HARI hari sebelum
// tanggal_berakhir sewanya. SEKALI saja per tanggal_berakhir (bukan diulang tiap hari) --
// beda dari legalitas-reminder.mjs yang sengaja berulang, laptop cukup 1x heads-up karena
// bukan dokumen legal yang wajib diurus manual bertahap. Kalau tanggal_berakhir-nya diubah
// (diperpanjang manual lewat admin/laptop), notifikasi otomatis bisa terkirim lagi karena
// checkpoint disimpan PER TANGGAL (notif_90hari_terkirim_untuk), bukan flag boolean biasa.
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

const AMBANG_HARI = 90;

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

function htmlEmailLaptop(daftar) {
  const baris = daftar.map((d) => {
    const sisaTeks = d.sisaHari < 0 ? `Lewat ${Math.abs(d.sisaHari)} hari` : `${d.sisaHari} hari lagi`;
    return `<tr><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#18181b;font-weight:700;">${d.nama_user}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#3f3f46;">${d.merk_model}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#71717a;">${d.tanggal_berakhir}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;font-weight:700;color:${d.sisaHari < 0 ? "#dc2626" : "#d97706"};">${sisaTeks}</td></tr>`;
  }).join("");
  const body = `
    <p style="margin:0 0 16px 0;font-size:13.5px;color:#3f3f46;line-height:1.6;">
      ${daftar.length} laptop sewaan akan/sudah berakhir masa sewanya dalam waktu dekat. Mohon segera diproses perpanjangan atau pengembaliannya.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">User</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Laptop</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Berakhir</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Sisa</td></tr>
      ${baris}
    </table>
  `;
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4;">
      <tr><td style="background:linear-gradient(150deg,#9f1d1d 0%,#dc2626 55%,#c62828 100%);padding:22px 26px;">
        <div style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;opacity:0.85;">SIBM &middot; PT SAMUDERA</div>
        <div style="color:#ffffff;font-size:19px;font-weight:800;margin-top:4px;">&#128187; Masa Sewa Laptop Akan Berakhir</div>
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
  const snap = await db.collection("master_laptop").get();
  const daftarDue = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.dikembalikan) return;
    if (!data.tanggal_berakhir) return;
    const sisaHari = hitungSisaHari(data.tanggal_berakhir);
    if (sisaHari > AMBANG_HARI) return;
    if (data.notif_90hari_terkirim_untuk === data.tanggal_berakhir) return; // sudah pernah, untuk tanggal ini
    daftarDue.push({ id: d.id, nama_user: data.nama_user, merk_model: data.merk_model, tanggal_berakhir: data.tanggal_berakhir, sisaHari });
  });

  if (daftarDue.length === 0) {
    console.log("Tidak ada laptop yang perlu diingatkan hari ini.");
    return;
  }
  console.log(`Ditemukan ${daftarDue.length} laptop perlu diingatkan:`, daftarDue.map((d) => `${d.nama_user} (${d.sisaHari}H)`).join(", "));

  const adminGA = await ambilEmailAdminGA();
  if (adminGA.length === 0) {
    console.log("Tidak ada email Admin GA terdaftar di users_master, skip email.");
  } else {
    const html = htmlEmailLaptop(daftarDue);
    for (const admin of adminGA) {
      try {
        await kirimEmailViaRestApi(admin.email, admin.nama, "Masa Sewa Laptop Akan Berakhir", html);
        console.log(`Email masa sewa laptop terkirim ke ${admin.nama} (${admin.email})`);
      } catch (err) {
        console.error(`Gagal kirim email masa sewa laptop ke ${admin.nama}:`, err.message);
      }
    }
  }

  const pesanPush = daftarDue.length === 1
    ? `Laptop ${daftarDue[0].merk_model} (${daftarDue[0].nama_user}) ${daftarDue[0].sisaHari < 0 ? "sudah lewat" : "sisa " + daftarDue[0].sisaHari + " hari"} masa sewanya.`
    : `${daftarDue.length} laptop mendekati/lewat masa sewa. Cek menu Master Data Laptop untuk detail.`;
  await kirimPushAdminGA("💻 Masa Sewa Laptop Akan Berakhir", pesanPush);

  await Promise.all(daftarDue.map((d) =>
    db.collection("master_laptop").doc(d.id).update({ notif_90hari_terkirim_untuk: d.tanggal_berakhir })
  ));
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan reminder laptop:", err);
    process.exit(1);
  });
