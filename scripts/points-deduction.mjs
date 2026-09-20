// scripts/points-deduction.mjs
//
// Sistem poin bulanan per staf, sesuai permintaan user:
//   "setiap personel setiap bulannya mendapat poin 100 dan setiap mereka tidak
//   menyelesaikan misi/tugas/kpi dengan sempurna maka akan terus mengurangi
//   poinnya, dan setiap akhir bulan akan keluar rekap poin masing-masing
//   siapa yang paling rajin, paling malas, dan lainnya."
//
// Jalan 1x/hari (lihat .github/workflows/points-deduction.yml), evaluasi data
// KEMARIN (bukan hari ini -- data hari ini belum lengkap/final). Poin
// disimpan di collection `staff_points_bulanan`, 1 dokumen per orang per
// bulan (id `${bulan}_${slugNama(nama)}`), mulai dari 100 dan cuma berkurang
// (floor di 0, gak ada bonus poin di v1 ini -- user cuma minta skema
// pengurangan).
//
// PENTING -- SCOPE v1 (baca ini sebelum nambah/ubah aturan):
// Potongan HANYA dari sinyal yang SUDAH tercatat otomatis & bisa
// dipertanggungjawabkan ke 1 ORANG tertentu (bukan tugas kolektif tanpa PIC
// jelas). Yang masuk v1:
//   1. OB & CS  -- gak lapor checklist utk sesi (Pagi/Siang/Sore) yang
//      seharusnya dilaporkan sesuai plot harian.
//   2. Security -- kepatuhan minimum sesi patroli (2 dari 3) per shift yang
//      berakhir kemarin.
//   3. Security -- Notifikasi Dadakan (siram tanaman) jendela Pagi/Malam yang
//      tidak diselesaikan SAMA SEKALI oleh siapa pun di shift itu (dipotong
//      dari SEMUA yang terjadwal shift itu -- tugas berbasis giliran shift,
//      bukan per-individu, mirip logika kepatuhan patroli).
// YANG BELUM MASUK v1 (didokumentasikan biar jujur, bukan disembunyikan):
//   - Driver: staleness status kendaraan SUDAH ada monitoringnya
//     (driver-status-staleness.mjs) tapi belum diubah jadi sinyal potongan
//     poin harian yang reliable (butuh cara nentuin "basi di HARI TERTENTU"
//     yang gak dobel-hitung dgn push 30 menitan yang sudah ada).
//   - Absensi (check-in/out): ada datanya (attendance_logs) tapi BELUM
//     dipakai buat potongan poin karena app ini belum punya sumber data "hari
//     libur/off" yang lengkap utk SEMUA dept (Security & OB sudah ada lewat
//     jadwal, Driver/QHSE/Admin GA belum) -- resiko salah potong poin orang
//     yang sebenarnya lagi off/cuti.
//   - Inspeksi APAR: tugas kolektif tanpa PIC individual yang jelas di
//     sistem saat ini (semua Security yang jaga dapat notif yang sama),
//     jadi TIDAK masuk skema potongan individual.
// Driver/QHSE/Admin GA karena itu SEMENTARA tetap 100 poin tiap bulan sampai
// ada sinyal tugas individual yang reliable ditambahkan.
//
// NOTIFIKASI ADMIN GA (20 Sep 2026): selain potong poin, sekarang JUGA kirim push + kotak masuk
// in-app ke Admin GA tiap kali ada pelanggaran #1-#3 di atas (checklist OB/CS tidak lengkap,
// patroli Security tidak patuh, Notifikasi Dadakan/siram tanaman tidak diselesaikan) -- TIDAK
// bergantung EmailJS sama sekali (beda dari email lama di §42B yang masih diblokir), jadi tetap
// sampai walau EmailJS belum diaktifkan usernya. Notifikasi driver (status kendaraan basi) ada
// di scripts/driver-status-staleness.mjs sendiri, bukan di sini (jalan tiap 30 menit, bukan
// harian, jadi terpisah dari alur potong poin).
//
// Reuse secret yang sama kayak script reminder lain: FIREBASE_SERVICE_ACCOUNT_BASE64

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// EmailJS -- duplikat pola yang sama dengan scripts/overtime-checkin-reminder.mjs (lihat catatan
// lengkap di sana soal kenapa ID/key ini aman di-hardcode langsung, bukan GitHub Secret).
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

function htmlEmailPatroliTidakPatuh(daftar) {
  const baris = daftar
    .map((d) => `<tr><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#18181b;font-weight:700;">${d.nama}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#3f3f46;">${d.shiftLabel}</td></tr>`)
    .join("");
  const body = `
    <p style="margin:0 0 16px 0;font-size:13.5px;color:#3f3f46;line-height:1.6;">
      ${daftar.length} petugas Security tidak memenuhi minimum ${MINIMUM_SESI_PATROLI} dari 3 sesi patroli pada shift kemarin (${kemarin}). Poin bulanan mereka sudah otomatis dikurangi.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Nama</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Shift</td></tr>
      ${baris}
    </table>
  `;
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4;">
      <tr><td style="background:linear-gradient(150deg,#9f1d1d 0%,#dc2626 55%,#c62828 100%);padding:22px 26px;">
        <div style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;opacity:0.85;">SIBM &middot; PT SAMUDERA</div>
        <div style="color:#ffffff;font-size:19px;font-weight:800;margin-top:4px;">&#9888; Kepatuhan Patroli Security</div>
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

// Push + kotak masuk in-app ke Admin GA -- SENGAJA TERPISAH dari ambilEmailAdminGA() (butuh SEMUA
// nama Admin GA, bukan cuma yang punya email terdaftar) supaya notifikasi kepatuhan (patroli,
// siram tanaman, checklist OB) tetap sampai ke Admin GA meski email masih diblokir EmailJS
// (lihat catatan §41B/§42B di analisis_project.md) -- push & in-app TIDAK bergantung ke EmailJS
// sama sekali.
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
    console.log("  Tidak ada Admin GA terdaftar di users_master, skip notifikasi.");
    return;
  }
  await tulisNotifPersonal(namaAdmin, judul, pesan);

  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "Admin GA").get();
  const tokens = [];
  tokenSnap.forEach((d) => { if (d.data().token) tokens.push(d.data().token); });
  if (tokens.length === 0) {
    console.log("  Notifikasi in-app ditulis, tapi belum ada token FCM Admin GA terdaftar, skip push.");
    return;
  }
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: judul, body: pesan },
    webpush: { notification: { icon: "/icons/icon-192.png" } },
  });
  console.log(`  Push ke ${tokens.length} Admin GA -> ${response.successCount} sukses, ${response.failureCount} gagal.`);
}

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const messaging = getMessaging();

const POIN_AWAL_BULAN = 100;
const POTONGAN = {
  ob_sesi_terlewat: 5, // per sesi (Pagi/Siang/Sore) yang gak dilaporkan
  security_shift_tidak_patuh: 10, // per shift (Shift 1 / Shift 2) yang gak memenuhi minimum sesi
  security_dadakan_terlewat: 5, // per jendela (Pagi / Malam) yang gak diselesaikan
};
const MINIMUM_SESI_PATROLI = 2;

const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));

function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
const hariIni = formatTanggal(now);
const kemarin = formatTanggal(new Date(now.getTime() - 24 * 60 * 60 * 1000));
const bulanKemarin = kemarin.substring(0, 7);

function isWeekend(tanggalISO) {
  const hari = new Date(tanggalISO + "T00:00:00").getDay();
  return hari === 0 || hari === 6;
}

// Nama karyawan gak pernah mengandung "/" dalam praktiknya, tapi tetap dijaga
// -- sama pola dengan slugNama() di AbsensiCard.tsx.
function slugNama(nama) {
  return nama.trim().replace(/\//g, "-");
}

async function potongPoin(nama, departemen, alasan, jumlah) {
  const docId = `${bulanKemarin}_${slugNama(nama)}`;
  const ref = db.collection("staff_points_bulanan").doc(docId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const poinSekarang = snap.exists ? snap.data().poin : POIN_AWAL_BULAN;
    const poinBaru = Math.max(0, poinSekarang - jumlah);
    const entriRiwayat = { tanggal: kemarin, alasan, potongan: jumlah };
    if (snap.exists) {
      tx.update(ref, { poin: poinBaru, riwayat: FieldValue.arrayUnion(entriRiwayat) });
    } else {
      tx.set(ref, { nama, departemen, bulan: bulanKemarin, poin: poinBaru, riwayat: [entriRiwayat] });
    }
  });
  console.log(`-${jumlah} poin untuk ${nama} (${departemen}): ${alasan}`);
}

// ==========================================
// 1. OB & CS -- sesi checklist yang gak dilaporkan kemarin
// ==========================================
async function cekOB() {
  const tidakLengkap = [];
  if (isWeekend(kemarin)) {
    console.log("OB & CS: kemarin weekend, skip (gak ada jadwal).");
    return tidakLengkap;
  }
  const plotSnap = await db.collection("daily_plots").doc(kemarin).get();
  if (!plotSnap.exists) {
    console.log("OB & CS: tidak ada plot untuk kemarin, skip.");
    return tidakLengkap;
  }
  const plotLantai = plotSnap.data().plot_lantai || {};
  const picUnik = Array.from(new Set(Object.values(plotLantai).filter((n) => n && n !== "Semua / All")));
  if (picUnik.length === 0) return tidakLengkap;

  const checklistSnap = await db.collection("ob_checklists").where("tanggal", "==", kemarin).get();
  const sesiPerNama = {};
  checklistSnap.forEach((d) => {
    const data = d.data();
    if (!data.pic_bertugas || !data.sesi) return;
    if (!sesiPerNama[data.pic_bertugas]) sesiPerNama[data.pic_bertugas] = new Set();
    sesiPerNama[data.pic_bertugas].add(data.sesi);
  });

  const SESI_LIST = ["Pagi", "Siang", "Sore"];
  for (const nama of picUnik) {
    const sesiSudah = sesiPerNama[nama] || new Set();
    const terlewat = SESI_LIST.filter((s) => !sesiSudah.has(s));
    if (terlewat.length > 0) {
      await potongPoin(
        nama,
        "OB & CS",
        `Tidak lapor checklist sesi ${terlewat.join(", ")} (${kemarin})`,
        POTONGAN.ob_sesi_terlewat * terlewat.length
      );
      tidakLengkap.push({ nama, terlewat });
    }
  }
  return tidakLengkap;
}

// ==========================================
// PIC SECURITY per shift+tanggal (duplikat pola dari patroli-push-reminder.mjs)
// ==========================================
async function ambilPicShift(tanggalShift, shiftLabel) {
  const bulanKey = tanggalShift.substring(0, 7);
  const monthSnap = await db.collection("security_monthly_schedules").doc(bulanKey).get();
  if (!monthSnap.exists) return [];
  const plotHariIni = monthSnap.data().data_hari?.[tanggalShift] || {};
  return Object.keys(plotHariIni).filter((nama) => plotHariIni[nama] === shiftLabel);
}

async function hitungSesiTerpenuhi(namaPetugas, tanggalShift, shiftLabel) {
  const snap = await db
    .collection("security_patrols")
    .where("petugas", "==", namaPetugas)
    .where("tanggal_shift", "==", tanggalShift)
    .where("shift", "==", shiftLabel)
    .get();
  const sesiUnik = new Set(snap.docs.map((d) => d.data().sesi).filter(Boolean));
  return sesiUnik.size >= MINIMUM_SESI_PATROLI;
}

// ==========================================
// 2. Security -- kepatuhan minimum sesi patroli, Shift 1 & Shift 2 yang
// berakhir/mulai kemarin (Shift 1: 08-20 kemarin; Shift 2: mulai 20:00
// kemarin, berakhir 08:00 hari ini -- keduanya sudah lengkap datanya begitu
// script ini jalan jam 09:00 WITA).
// ==========================================
async function cekSecurityPatroli() {
  const tidakPatuh = [];
  for (const shiftLabel of ["Shift 1", "Shift 2"]) {
    const daftarNama = await ambilPicShift(kemarin, shiftLabel);
    for (const nama of daftarNama) {
      const patuh = await hitungSesiTerpenuhi(nama, kemarin, shiftLabel);
      if (!patuh) {
        await potongPoin(
          nama,
          "Security",
          `Patroli ${shiftLabel} (${kemarin}) tidak memenuhi minimum ${MINIMUM_SESI_PATROLI} sesi`,
          POTONGAN.security_shift_tidak_patuh
        );
        tidakPatuh.push({ nama, shiftLabel });
      }
    }
  }
  return tidakPatuh;
}

// ==========================================
// 3. Security -- Notifikasi Dadakan (siram tanaman): jendela Malam KEMARIN
// dan jendela Pagi HARI INI, keduanya jadi tanggung jawab Shift 2 yang mulai
// kemarin. Dipotong dari SEMUA yang terjadwal shift itu (tugas berbasis
// giliran shift, bukan per-individu -- lihat catatan scope di atas).
// ==========================================
async function cekNotifikasiDadakan() {
  const jendelaTerlewat = [];
  const shift2Kemarin = await ambilPicShift(kemarin, "Shift 2");
  if (shift2Kemarin.length === 0) {
    console.log("Notifikasi Dadakan: tidak ada Security Shift 2 terjadwal kemarin, skip.");
    return jendelaTerlewat;
  }

  const [malamKemarinDoc, pagiHariIniDoc] = await Promise.all([
    db.collection("notifikasi_dadakan_siram").doc(`${kemarin}_Malam`).get(),
    db.collection("notifikasi_dadakan_siram").doc(`${hariIni}_Pagi`).get(),
  ]);

  if (!malamKemarinDoc.exists) {
    for (const nama of shift2Kemarin) {
      await potongPoin(nama, "Security", `Notifikasi Dadakan jendela Malam (${kemarin}) tidak diselesaikan`, POTONGAN.security_dadakan_terlewat);
    }
    jendelaTerlewat.push({ jendela: "Malam", tanggal: kemarin, petugas: shift2Kemarin });
  }
  if (!pagiHariIniDoc.exists) {
    for (const nama of shift2Kemarin) {
      await potongPoin(nama, "Security", `Notifikasi Dadakan jendela Pagi (${hariIni}) tidak diselesaikan`, POTONGAN.security_dadakan_terlewat);
    }
    jendelaTerlewat.push({ jendela: "Pagi", tanggal: hariIni, petugas: shift2Kemarin });
  }
  return jendelaTerlewat;
}

async function jalankan() {
  // Anti-double-proses: 1x per tanggal kemarin (kalau cron re-run/telat, gak dobel potong).
  // PENTING: guard ini ditulis SETELAH ketiga cek sukses, BUKAN sebelum -- kalau ditulis duluan
  // lalu salah satu cek crash di tengah jalan, guard-nya kepasang duluan dan bikin retry manual
  // (workflow_dispatch) ditolak "sudah pernah diproses" padahal belum beneran selesai. Konsekuensi:
  // kalau retry dilakukan SETELAH sebagian deduksi sempat kepotong sebelum crash, orang yang sudah
  // kepotong di percobaan pertama bisa kepotong dobel di percobaan ulang -- resiko kecil & jarang
  // (cuma kejadian kalau crash di tengah + ada yang manual retry), diterima demi retry yang lebih
  // reliable buat kasus umum (crash di awal sebelum sempat potong apa pun).
  const logRef = db.collection("reminder_points_log").doc(kemarin);
  const logSnap = await logRef.get();
  if (logSnap.exists) {
    console.log(`Evaluasi poin untuk tanggal ${kemarin} sudah pernah diproses, skip.`);
    return;
  }

  const obTidakLengkap = await cekOB();
  const securityTidakPatuh = await cekSecurityPatroli();
  const dadakanTerlewat = await cekNotifikasiDadakan();

  // Email ke Admin GA tiap kali ada Security yang gak penuhi minimum sesi patroli (permintaan
  // user) -- 1 email rekap per hari (bisa isi >1 shift/orang), bukan 1 email per orang.
  if (securityTidakPatuh.length > 0) {
    const adminGA = await ambilEmailAdminGA();
    if (adminGA.length === 0) {
      console.log("Ada Security tidak patuh tapi tidak ada email Admin GA terdaftar di users_master, skip email.");
    } else {
      const html = htmlEmailPatroliTidakPatuh(securityTidakPatuh);
      for (const admin of adminGA) {
        try {
          await kirimEmailViaRestApi(admin.email, admin.nama, "Kepatuhan Patroli Security Tidak Terpenuhi", html);
          console.log(`Email kepatuhan patroli terkirim ke ${admin.nama} (${admin.email})`);
        } catch (err) {
          console.error(`Gagal kirim email kepatuhan patroli ke ${admin.nama}:`, err.message);
        }
      }
    }
  }

  // Push + kotak masuk in-app ke Admin GA -- TIDAK bergantung EmailJS sama sekali, jadi tetap
  // sampai walau email di atas gagal/terblokir. Permintaan user: notifikasi Admin GA setiap kali
  // ada Security yang gak patroli/gak siram tanaman, DAN OB/CS yang gak lengkap checklist.
  if (obTidakLengkap.length > 0) {
    console.log(`Kirim notifikasi Admin GA: ${obTidakLengkap.length} staf OB/CS checklist tidak lengkap.`);
    const daftar = obTidakLengkap.map((o) => `${o.nama} (${o.terlewat.join(", ")})`).join("; ");
    await kirimPushAdminGA(
      "🧹 Checklist OB/CS Tidak Lengkap",
      `${obTidakLengkap.length} staf OB/CS tidak lengkap checklist kemarin (${kemarin}): ${daftar}.`
    );
  }
  if (securityTidakPatuh.length > 0) {
    console.log(`Kirim notifikasi Admin GA: ${securityTidakPatuh.length} petugas Security tidak patroli.`);
    const daftar = securityTidakPatuh.map((s) => `${s.nama} (${s.shiftLabel})`).join("; ");
    await kirimPushAdminGA(
      "🚨 Kepatuhan Patroli Security Tidak Terpenuhi",
      `${securityTidakPatuh.length} petugas Security tidak memenuhi minimum ${MINIMUM_SESI_PATROLI} sesi patroli shift kemarin (${kemarin}): ${daftar}.`
    );
  }
  if (dadakanTerlewat.length > 0) {
    for (const d of dadakanTerlewat) {
      console.log(`Kirim notifikasi Admin GA: Notifikasi Dadakan jendela ${d.jendela} tidak diselesaikan.`);
      await kirimPushAdminGA(
        "🌱 Notifikasi Dadakan (Siram Tanaman) Tidak Diselesaikan",
        `Jendela ${d.jendela} (${d.tanggal}) tidak diselesaikan oleh Security Shift 2 yang bertugas: ${d.petugas.join(", ")}.`
      );
    }
  }

  await logRef.set({ diproses_pada: FieldValue.serverTimestamp() });
}

jalankan()
  .then(() => {
    console.log("Selesai evaluasi poin harian.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan evaluasi poin:", err);
    process.exit(1);
  });
