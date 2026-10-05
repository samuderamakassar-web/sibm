// scripts/shift-handover-escalation.mjs
//
// Eskalasi kalau serah terima shift (security_shift_handover) belum "selesai" 10 menit
// setelah jam pergantian shift (08:00/20:00 WITA) -- permintaan user setelah lihat
// dashboard Security nunjukkin badge/kartu tukar jaga yang gak akurat waktu. Alur (SUDAH
// dikonfirmasi user lewat AskUserQuestion, bukan tebakan):
//   1. 10 menit lewat batas & belum "selesai" -> kirim PUSH + tulis notifikasi_personal
//      (jenis "keputusan_extend_shift", trigger modal keputusan di client) ke SEMUA nama
//      roster shift yang BARU SAJA BERAKHIR (petugas keluar) DAN SEMUA nama roster shift
//      yang BARU MULAI (petugas masuk) -- shift ini per-desain sudah granularitas per
//      SHIFT (bukan per-individu, sama seperti security_shift_handover & patroli), jadi
//      kalau lebih dari 1 orang terjadwal, SEMUA dapat notif, siapa pun yang klik duluan
//      yang jadi "personil_extend".
//   2. Danru/Koordinator Security SELALU dapat tembusan (push + notifikasi_personal
//      informational, TANPA modal) tiap kali eskalasi ini pertama kali terpicu.
//   3. Client (EskalasiShiftModal.tsx) nampilin modal ke penerima jenis
//      "keputusan_extend_shift" dengan 2 pilihan:
//      - "Lanjut Jaga (Extend)" -> permanen, roster langsung ditandai EXTEND.
//      - "Lanjut Sementara" -> sementara, boleh isi estimasi menit; kalau belum ada
//        keputusan/estimasi belum habis, script ini re-kirim reminder tiap kali dijalankan
//        (tiap 10 menit) sampai beneran tukar jaga (security_shift_handover jadi "selesai",
//        auto-nutup entri ini) atau di-set permanen.
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

// EmailJS -- duplikat pola yang sama dengan scripts/points-deduction.mjs & script reminder lain.
const EMAILJS_SERVICE_ID = "service_0e8e85u";
const EMAILJS_TEMPLATE_ID = "template_oriy1nw";
const EMAILJS_PUBLIC_KEY = "TCk2X3epWHvsVcTWX";

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

function emailShellSederhana(judulHeader, bodyHtml) {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4;">
      <tr><td style="background:linear-gradient(150deg,#9f1d1d 0%,#dc2626 55%,#c62828 100%);padding:22px 26px;">
        <div style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;opacity:0.85;">SIBM &middot; PT SAMUDERA</div>
        <div style="color:#ffffff;font-size:19px;font-weight:800;margin-top:4px;">${judulHeader}</div>
      </td></tr>
      <tr><td style="padding:26px;">${bodyHtml}</td></tr>
      <tr><td style="padding:16px 26px;background:#f7f6f5;border-top:1px solid #e7e5e4;">
        <!-- §68 banner + tautan aplikasi (public/email/sibm-banner.png, scripts/generate-email-banner.mjs) --><a href="https://sibm-app.web.app" style="display:inline-block;background:#a3122a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:10px;margin:0 0 14px 0;">Buka Aplikasi SIBM &rarr;</a><a href="https://sibm-app.web.app" style="display:block;margin:0 0 12px 0;"><img src="https://sibm-app.web.app/email/sibm-banner.png" width="468" alt="SIBM - Sistem Informasi Bangunan &amp; Manajemen. Buka sibm-app.web.app" style="display:block;width:100%;max-width:468px;height:auto;border:0;border-radius:10px;"></a><div style="font-size:11px;color:#71717a;">Email otomatis dari Sistem Informasi Bangunan &amp; Manajemen (SIBM). Mohon tidak membalas email ini.</div>
      </td></tr>
    </table>
  </div>`;
}

async function ambilEmailAdminGA() {
  const snap = await db.collection("users_master").where("departemen", "==", "Admin GA").get();
  return snap.docs.map((d) => d.data()).filter((u) => u.email).map((u) => ({ nama: u.nama, email: u.email }));
}

async function kirimEmailKeAdminGA(subject, bodyHtml) {
  const adminGA = await ambilEmailAdminGA();
  if (adminGA.length === 0) {
    console.log("  Tidak ada email Admin GA terdaftar, skip email.");
    return;
  }
  for (const admin of adminGA) {
    try {
      await kirimEmailViaRestApi(admin.email, admin.nama, subject, bodyHtml);
      console.log(`  Email terkirim ke ${admin.nama} (${admin.email})`);
    } catch (err) {
      console.error(`  Gagal kirim email ke ${admin.nama}:`, err.message);
    }
  }
}

async function ambilNamaAdminGA() {
  const snap = await db.collection("users_master").where("departemen", "==", "Admin GA").get();
  return snap.docs.map((d) => d.data().nama).filter(Boolean);
}

async function kirimPushAdminGA(judul, pesan) {
  const namaAdmin = await ambilNamaAdminGA();
  if (namaAdmin.length === 0) return;
  await tulisNotifPersonal(namaAdmin, judul, pesan);
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "Admin GA").get();
  const tokens = [];
  tokenSnap.forEach((d) => { if (d.data().token) tokens.push(d.data().token); });
  if (tokens.length === 0) {
    console.log("  Notifikasi in-app Admin GA ditulis, tapi belum ada token FCM, skip push.");
    return;
  }
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: judul, body: pesan },
    webpush: { notification: { icon: "/icons/icon-192.png" } },
  });
  console.log(`  Push ke ${tokens.length} Admin GA -> ${response.successCount} sukses, ${response.failureCount} gagal.`);
}

const AMBANG_ESKALASI_MENIT = 10;

// ==========================================
// SHIFT & TANGGAL -- duplikat dari lib/shift.ts / script reminder lain (lihat catatan
// sinkronisasi serupa di scripts/patroli-push-reminder.mjs).
// ==========================================
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
let shiftAktif, tanggalAktif;
if (jam >= 8 && jam < 20) {
  shiftAktif = "Shift 1";
  tanggalAktif = hariIni;
} else {
  shiftAktif = "Shift 2";
  tanggalAktif = jam >= 20 ? hariIni : kemarin;
}

const menitSekarang = jam * 60 + now.getMinutes();
const menitSejakBatas = shiftAktif === "Shift 1"
  ? menitSekarang - 480
  : (menitSekarang >= 1200 ? menitSekarang - 1200 : menitSekarang + 1440 - 1200);

// ==========================================
// §94 REKAP BULANAN (1 email ke Admin GA) -- pengganti email per kejadian. Dikirim run pertama
// setelah tgl 1 pukul 08:30 WITA (Shift 2 hari terakhir bulan lalu sudah selesai) untuk BULAN LALU.
// Guard: reminder_validasi_log/rekap_tukar_shift_{YYYY-MM} supaya hanya sekali.
// ==========================================
async function rekapBulanan() {
  if (now.getDate() === 1 && now.getHours() * 60 + now.getMinutes() < 510) return;
  const lalu = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const kunci = `${lalu.getFullYear()}-${String(lalu.getMonth() + 1).padStart(2, "0")}`;
  const guard = db.collection("reminder_validasi_log").doc(`rekap_tukar_shift_${kunci}`);
  if ((await guard.get()).exists) return;
  const awal = `${kunci}-01`;
  const akhir = formatTanggal(new Date(now.getFullYear(), now.getMonth(), 1));
  const ho = (await db.collection("security_shift_handover").where("tanggal_shift", ">=", awal).where("tanggal_shift", "<", akhir).get()).docs.map((d) => d.data());
  const ext = (await db.collection("security_shift_extend").where("tanggal_shift", ">=", awal).where("tanggal_shift", "<", akhir).get()).docs.map((d) => d.data());
  const selesai = ho.filter((h) => h.status === "selesai");
  const telat = selesai.filter((h) => h.terlambat);
  const tanpaQR = selesai.filter((h) => h.tanpa_serah_terima);
  const perPetugas = {};
  telat.forEach((h) => { const n = h.petugas_masuk || "-"; perPetugas[n] ??= { kali: 0, menit: 0 }; perPetugas[n].kali++; perPetugas[n].menit += h.menit_terlambat || 0; });
  const namaBulan = lalu.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const sel = "padding:8px 0;border-bottom:1px solid #f0f0ef;font-size:13px;";
  const kepala = (k) => `<tr>${k.map((x) => `<td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">${x}</td>`).join("")}</tr>`;
  const ringkas = [["Serah terima selesai", selesai.length], ["Tepat waktu", selesai.length - telat.length], ["Telat (> 10 menit)", telat.length], ["Tanpa QR (darurat)", tanpaQR.length], ["Kejadian extend jaga", ext.length]]
    .map(([l, v]) => `<tr><td style="${sel}color:#71717a;font-weight:700;">${l}</td><td style="${sel}color:#18181b;font-weight:800;text-align:right;">${v}</td></tr>`).join("");
  const tabelPetugas = Object.entries(perPetugas).sort((a, b) => b[1].kali - a[1].kali)
    .map(([n, v]) => `<tr><td style="${sel}font-weight:700;">${n}</td><td style="${sel}">${v.kali}x</td><td style="${sel}color:#dc2626;font-weight:700;">${v.menit} menit</td></tr>`).join("");
  const daftar = [...telat, ...tanpaQR.filter((h) => !h.terlambat)].sort((a, b) => `${a.tanggal_shift}${a.shift}`.localeCompare(`${b.tanggal_shift}${b.shift}`))
    .map((h) => `<tr><td style="${sel}">${h.tanggal_shift} &middot; ${h.shift}</td><td style="${sel}font-weight:700;">${h.petugas_keluar || "-"} &rarr; ${h.petugas_masuk || "-"}</td><td style="${sel}color:#dc2626;font-weight:700;">${h.terlambat ? `${h.menit_terlambat} mnt` : ""}${h.tanpa_serah_terima ? " tanpa QR" : ""}</td><td style="${sel}color:#3f3f46;font-style:italic;">${h.alasan_telat || "-"}</td></tr>`).join("");
  const body = `
    <p style="margin:0 0 14px 0;font-size:13.5px;color:#3f3f46;line-height:1.6;">Rekap serah terima shift Security bulan <b>${namaBulan}</b>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">${ringkas}</table>
    ${tabelPetugas ? `<p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#18181b;">Keterlambatan per petugas</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">${kepala(["Petugas", "Jumlah", "Total"])}${tabelPetugas}</table>` : ""}
    ${daftar ? `<p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#18181b;">Rincian</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${kepala(["Shift", "Petugas", "Telat", "Alasan"])}${daftar}</table>` : `<p style="font-size:13px;color:#16a34a;font-weight:700;">Tidak ada keterlambatan bulan ini.</p>`}`;
  await kirimEmailKeAdminGA(`Rekap Tukar Shift Security ${namaBulan}`, emailShellSederhana(`📊 Rekap Tukar Shift ${namaBulan}`, body));
  await guard.set({ waktu: FieldValue.serverTimestamp(), selesai: selesai.length, telat: telat.length, tanpa_qr: tanpaQR.length, extend: ext.length });
  console.log(`Rekap bulanan ${kunci} terkirim: ${selesai.length} selesai, ${telat.length} telat, ${tanpaQR.length} tanpa QR.`);
}
try { await rekapBulanan(); } catch (e) { console.error("Rekap bulanan gagal:", e); }

if (menitSejakBatas < AMBANG_ESKALASI_MENIT) {
  console.log(`Baru ${menitSejakBatas} menit sejak batas shift terakhir (ambang ${AMBANG_ESKALASI_MENIT} menit), skip.`);
  process.exit(0);
}

// Shift & tanggal_shift yang BARU SAJA BERAKHIR (kebalikan dari shiftAktif).
const tanggalKeluar = shiftAktif === "Shift 2" ? tanggalAktif : formatTanggal(new Date(now.getTime() - 24 * 60 * 60 * 1000));
const shiftKeluar = shiftAktif === "Shift 2" ? "Shift 1" : "Shift 2";

// Duplikat dari patroli-push-reminder.mjs -- lihat catatan sinkronisasi di sana.
async function ambilPicShift(tanggalShift, shiftLabel) {
  const bulanKey = tanggalShift.substring(0, 7);
  const monthSnap = await db.collection("security_monthly_schedules").doc(bulanKey).get();
  if (!monthSnap.exists) return [];
  const plotHariIni = monthSnap.data().data_hari?.[tanggalShift] || {};
  return Object.keys(plotHariIni).filter((nama) => plotHariIni[nama] === shiftLabel);
}

async function ambilDanruKoordinator() {
  const snap = await db.collection("users_master").where("departemen", "==", "Security").get();
  return snap.docs
    .map((d) => d.data())
    .filter((u) => {
      const r = (u.role || "").toLowerCase();
      return r.includes("danru") || r.includes("koordinator");
    })
    .map((u) => u.nama);
}

async function tulisNotifPersonal(namaList, judul, pesan, jenis, refId) {
  await Promise.all(namaList.map((nama) => {
    const data = { untukNama: nama, judul, pesan, dibaca: false, waktu: FieldValue.serverTimestamp() };
    if (jenis) data.jenis = jenis;
    if (refId) data.refId = refId;
    return db.collection("notifikasi_personal").add(data);
  }));
}

async function kirimPush(namaList, judul, pesan) {
  if (namaList.length === 0) return;
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "Security").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => {
    const data = d.data();
    if (data.token && data.pic_nama) tokenPerNama[data.pic_nama] = data.token;
  });
  const tokens = namaList.map((nama) => tokenPerNama[nama]).filter(Boolean);
  if (tokens.length === 0) return;
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: judul, body: pesan },
    webpush: { notification: { icon: "/icons/icon-192.png" } },
  });
  console.log(`  Push ke ${tokens.length} penerima -> ${response.successCount} sukses, ${response.failureCount} gagal.`);
}

// Notifikasi keterlambatan SCAN (beda dari eskalasi extend di bawah) -- dipicu client
// (TukarShiftSecurityPage.tsx) begitu petugas pengganti scan QR LEBIH DARI 10 menit sejak jam
// pergantian shift, dengan alasan yang mereka isi sendiri. Dicek TERPISAH dari logika
// tanggalAktif/shiftAktif di atas karena keterlambatan bisa baru "selesai" (discan) di mana pun
// dalam beberapa run terakhir -- query langsung ke flag notif_terlambat_terkirim, bukan
// terikat ke 1 shift tertentu.
async function cekHandoverTelatBelumDinotif() {
  // + "Mulai jaga tanpa serah terima" (SerahTerimaGuard): selalu dinotif walau belum lewat 10 menit
  const [snapTelat, snapTanpa] = await Promise.all([
    db.collection("security_shift_handover").where("terlambat", "==", true).where("notif_terlambat_terkirim", "==", false).get(),
    db.collection("security_shift_handover").where("tanpa_serah_terima", "==", true).where("notif_terlambat_terkirim", "==", false).get(),
  ]);
  const unik = new Map([...snapTelat.docs, ...snapTanpa.docs].map((d) => [d.id, d]));
  const snap = { empty: unik.size === 0, docs: [...unik.values()] };
  if (snap.empty) {
    console.log("Tidak ada serah terima telat yang belum dinotifikasi.");
    return;
  }

  const daftar = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Ditemukan ${daftar.length} serah terima telat yang belum dinotifikasi ke Admin GA.`);

  const baris = daftar.map((h) =>
    `<tr><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#18181b;font-weight:700;">${h.petugas_keluar} &rarr; ${h.petugas_masuk}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#71717a;">${h.tanggal_shift} &middot; ${h.shift}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;font-weight:700;color:#dc2626;">${h.menit_terlambat ? `${h.menit_terlambat} menit` : "tepat waktu"}${h.tanpa_serah_terima ? "<br>tanpa QR" : ""}</td><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:13px;color:#3f3f46;font-style:italic;">${h.alasan_telat || "-"}</td></tr>`
  ).join("");
  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:13.5px;color:#3f3f46;line-height:1.6;">${daftar.length} serah terima shift Security tercatat TELAT scan QR. Detail & alasan yang diisi petugas:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Petugas</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Shift</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Telat</td><td style="padding:6px 0;font-size:11px;color:#71717a;font-weight:800;text-transform:uppercase;">Alasan</td></tr>
      ${baris}
    </table>
  `;
  // §94: email per kejadian DIHAPUS (permintaan user) -- cukup push; email hanya rekap bulanan (rekapBulanan()).
  void bodyHtml;

  const pesanPush = daftar.length === 1
    ? `${daftar[0].petugas_masuk} ${daftar[0].tanpa_serah_terima ? "mulai jaga TANPA serah terima QR" : `telat ${daftar[0].menit_terlambat} menit scan serah terima`} (${daftar[0].tanggal_shift} ${daftar[0].shift}). Alasan: ${daftar[0].alasan_telat || "-"}`
    : `${daftar.length} serah terima tercatat telat scan. Cek menu Pantau Tukar Shift untuk detail & alasan.`;
  await kirimPushAdminGA("⏰ Serah Terima Shift Security Telat", pesanPush);

  await Promise.all(daftar.map((h) => db.collection("security_shift_handover").doc(h.id).update({ notif_terlambat_terkirim: true })));
}

async function jalankan() {
  await cekHandoverTelatBelumDinotif();

  // 1. Cek status serah terima RESMI (QR scan). PENTING: security_shift_handover disimpan
  // dengan tanggal_shift/shift hasil hitungShiftSesi() SAAT DIBUAT/DISCAN -- karena tombol
  // buatnya sekarang cuma bisa dipencet DALAM jendela tukar jaga (lihat dalamJendelaTukarJaga()
  // di lib/shift.ts), waktu itu hitungShiftSesi() SUDAH FLIP ke shift yang BARU MULAI
  // (tanggalAktif/shiftAktif), BUKAN shift yang baru berakhir (tanggalKeluar/shiftKeluar).
  // Makanya query & doc ID extend di bawah pakai tanggalAktif/shiftAktif, sama persis dengan
  // yang dipakai TukarShiftSecurityPage.tsx bikin & nutup dokumennya.
  const handoverSnap = await db.collection("security_shift_handover")
    .where("tanggal_shift", "==", tanggalAktif)
    .where("shift", "==", shiftAktif)
    .orderBy("waktu_generate", "desc")
    .limit(1)
    .get();
  const handover = handoverSnap.empty ? null : handoverSnap.docs[0].data();

  const extendRef = db.collection("security_shift_extend").doc(`${tanggalAktif}_${shiftAktif.replace(" ", "")}`);
  const extendSnap = await extendRef.get();

  if (handover?.status === "selesai") {
    console.log(`Serah terima ${shiftAktif} (${tanggalAktif}) sudah selesai (${handover.petugas_keluar} -> ${handover.petugas_masuk}). Tidak ada eskalasi.`);
    if (extendSnap.exists && extendSnap.data().status !== "selesai") {
      await extendRef.update({ status: "selesai", selesai_pada: FieldValue.serverTimestamp(), catatan_selesai: "Serah terima QR resmi selesai" });
      console.log("  Entri extend yang masih aktif ikut ditutup (safety net -- harusnya sudah ditutup client saat scan).");
    }
    return;
  }

  const petugasKeluar = handover?.petugas_keluar ? [handover.petugas_keluar] : await ambilPicShift(tanggalKeluar, shiftKeluar);
  const petugasMasuk = await ambilPicShift(tanggalAktif, shiftAktif);

  if (petugasKeluar.length === 0 && petugasMasuk.length === 0) {
    console.log("Tidak ada petugas terjadwal di kedua sisi (keluar/masuk), skip eskalasi (kemungkinan roster belum diisi).");
    return;
  }

  const daftarNamaTerkait = Array.from(new Set([...petugasKeluar, ...petugasMasuk]));

  if (!extendSnap.exists) {
    // Eskalasi PERTAMA KALI utk shift ini. tanggal_shift/shift yang DISIMPAN pakai identitas
    // shift AKTIF (tanggalAktif/shiftAktif) -- sama seperti security_shift_handover -- supaya
    // overlay roster (nandai sel petugas_masuk yang belum serah terima) nunjuk ke sel yang benar.
    console.log(`Eskalasi PERTAMA: serah terima ${shiftKeluar} (${tanggalKeluar}) -> ${shiftAktif} (${tanggalAktif}) sudah ${menitSejakBatas} menit belum selesai.`);
    await extendRef.set({
      tanggal_shift: tanggalAktif,
      shift: shiftAktif,
      petugas_keluar: petugasKeluar,
      petugas_masuk: petugasMasuk,
      status: "menunggu_keputusan",
      tipe: null,
      personil_extend: null,
      estimasi_menit: null,
      keputusan_pada: null,
      dibuat_pada: FieldValue.serverTimestamp(),
      reminder_terakhir_pada: FieldValue.serverTimestamp(),
      selesai_pada: null,
    });

    const pesanKeputusan = `Serah terima shift belum selesai (${menitSejakBatas} menit sejak jam ganti). Petugas pengganti belum konfirmasi. Buka dashboard untuk putuskan: lanjut jaga (extend) atau tunggu sementara.`;
    await tulisNotifPersonal(daftarNamaTerkait, "⚠️ Serah Terima Shift Terlambat", pesanKeputusan, "keputusan_extend_shift", extendRef.id);
    await kirimPush(daftarNamaTerkait, "⚠️ Serah Terima Shift Terlambat", pesanKeputusan);

    const danru = await ambilDanruKoordinator();
    if (danru.length > 0) {
      const pesanDanru = `Serah terima ${shiftKeluar} (${tanggalKeluar}) -> ${shiftAktif} belum selesai ${menitSejakBatas} menit. Petugas terkait: ${daftarNamaTerkait.join(", ") || "-"}.`;
      await tulisNotifPersonal(danru, "🔔 Info: Serah Terima Terlambat", pesanDanru, null, extendRef.id);
      await kirimPush(danru, "🔔 Info: Serah Terima Terlambat", pesanDanru);
    }

    // Admin GA JUGA dapat tembusan (push + email) -- permintaan user: butuh tau setiap kali ada
    // "extra time" karena keterlambatan, bukan cuma Danru/Koordinator Security.
    const pesanAdmin = `Serah terima ${shiftKeluar} (${tanggalKeluar}) &rarr; ${shiftAktif} belum selesai ${menitSejakBatas} menit. Petugas terkait: ${daftarNamaTerkait.join(", ") || "-"}. Cek menu Pantau Tukar Shift untuk detail.`;
    await kirimPushAdminGA("🔔 Serah Terima Shift Security Terlambat", pesanAdmin.replace(/&rarr;/, "->"));
    // §94: email eskalasi DIHAPUS -- rekap 1x sebulan lewat rekapBulanan().
    return;
  }

  const extend = extendSnap.data();
  if (extend.status === "selesai" || extend.status === "permanen") {
    console.log(`Entri extend shift ini sudah "${extend.status}", tidak ada aksi lagi.`);
    return;
  }

  if (extend.status === "menunggu_keputusan") {
    console.log("Masih menunggu keputusan (belum ada yang klik pilihan di modal) -- kirim ulang reminder.");
    const pesanKeputusan = `Masih menunggu keputusan Anda soal serah terima shift yang terlambat (${menitSejakBatas} menit). Buka dashboard untuk putuskan.`;
    await tulisNotifPersonal(daftarNamaTerkait, "⚠️ Serah Terima Shift Terlambat", pesanKeputusan, "keputusan_extend_shift", extendRef.id);
    await kirimPush(daftarNamaTerkait, "⚠️ Serah Terima Shift Terlambat", pesanKeputusan);
    await extendRef.update({ reminder_terakhir_pada: FieldValue.serverTimestamp() });
    return;
  }

  if (extend.status === "aktif" && extend.tipe === "sementara") {
    // Cek apakah estimasi (kalau diisi) sudah habis -- kalau sudah/gak ada estimasi, ingatkan lagi.
    const keputusanPadaMs = extend.keputusan_pada?.toMillis?.() ?? extend.dibuat_pada?.toMillis?.() ?? now.getTime();
    const menitBerlalu = Math.round((now.getTime() - keputusanPadaMs) / 60000);
    const estimasiHabis = extend.estimasi_menit != null && menitBerlalu >= extend.estimasi_menit;
    const tanpaEstimasi = extend.estimasi_menit == null;

    if (estimasiHabis || tanpaEstimasi) {
      console.log(`Perpanjangan sementara oleh ${extend.personil_extend} ${estimasiHabis ? "sudah lewat estimasi" : "tanpa estimasi"} -- kirim reminder lagi.`);
      const pesan = estimasiHabis
        ? `Estimasi waktu tunggu Anda (${extend.estimasi_menit} menit) sudah habis, tapi personil pengganti masih belum tiba. Update keputusan Anda.`
        : `Masih menunggu personil pengganti datang. Update keputusan Anda kalau masih perlu lanjut jaga.`;
      await tulisNotifPersonal([extend.personil_extend], "⏳ Update Perpanjangan Jaga", pesan, "keputusan_extend_shift", extendRef.id);
      await kirimPush([extend.personil_extend], "⏳ Update Perpanjangan Jaga", pesan);
      await extendRef.update({ reminder_terakhir_pada: FieldValue.serverTimestamp() });
    } else {
      console.log(`Perpanjangan sementara oleh ${extend.personil_extend} masih dalam estimasi (${menitBerlalu}/${extend.estimasi_menit} menit), belum perlu reminder.`);
    }
  }
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan eskalasi serah terima shift:", err);
    process.exit(1);
  });
