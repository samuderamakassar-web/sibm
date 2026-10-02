// scripts/validasi-karyawan.mjs  (§59 -- menggantikan overtime-checkin-reminder.mjs)
//
// Jalan tiap 30 menit (GitHub Actions). Tiga tugas:
//   A. BELUM DIINPUT (Senin-Jumat, slot 09:00 & 13:00 WITA): karyawan Master Data
//      (employees_directory) yang belum check-in Buku Tamu hari ini -> kartu "belum_input" di
//      validasi_karyawan + 1 push ringkasan ke Security yang jaga. Kartu yang ternyata sudah
//      check-in diselesaikan otomatis ("sudah_hadir") tiap run.
//   B. LEMBUR (mulai 18:00 WITA): karyawan masih "Di Dalam Area" -> kartu "lembur" + push. Jawaban
//      "akan pulang" yang 45 menit kemudian belum check-out -> ditanya ulang. Kartu yang sesinya
//      sudah check-out tapi belum ditutup (mis. check-out dari perangkat lain) -> ditutup di sini,
//      termasuk mengisi jam selesai lembur (cadangan dari jalur utama di Buku Tamu).
//   C. PEMANTAUAN JAM KERJA (QHSE): lembur > 4 jam ATAU > 12 jam di gedung -> catat di
//      pemantauan_jam_kerja + push & email ke QHSE (1x), lalu rekap total saat check-out.
//
// Aturan jam DIDUPLIKASI dari src/lib/validasiKaryawan.ts -- ubah keduanya bersamaan.
// Secret: FIREBASE_SERVICE_ACCOUNT_BASE64 (sama dengan script reminder lain).

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const messaging = getMessaging();

// Lihat catatan di overtime-checkin-reminder.mjs lama: ID EmailJS ini memang publik (ada di bundle situs).
const EMAILJS = { service_id: "service_0e8e85u", template_id: "template_oriy1nw", user_id: "qnss7aeHCQGexHTDf" };

const JAM_MULAI_LEMBUR = "18:00";
const BATAS_LEMBUR_JAM = 4;
const BATAS_DI_GEDUNG_JAM = 12;
const MENIT_TANYA_ULANG_PULANG = 45;
const SLOT_CEK_MASUK = ["09", "13"];

// ---------- waktu WITA ----------
const FMT_TGL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });
const FMT_JAM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const tanggalWITA = (d) => FMT_TGL.format(d);
const jamWITA = (d) => FMT_JAM.format(d);
const waktuWITA = (tgl, jam) => new Date(`${tgl}T${jam}:00+08:00`);
const mulaiLembur = (masuk) => { const b = waktuWITA(tanggalWITA(masuk), JAM_MULAI_LEMBUR); return masuk > b ? masuk : b; };
const jamTagih = (mulai, selesai) => { const m = (selesai - mulai) / 60000; return m <= 0 ? 0 : Math.ceil(m / 60); };
const fmtJamDesimal = (j) => `${Math.floor(j)} jam ${Math.round((j % 1) * 60)} mnt`;

const now = new Date();
const hariIni = tanggalWITA(now);
const jamSekarang = Number(jamWITA(now).slice(0, 2));
const hariMinggu = new Date(`${hariIni}T12:00:00+08:00`).getUTCDay(); // 0=Minggu
const hariKerja = hariMinggu >= 1 && hariMinggu <= 5;
const slugNama = (s) => (s || "").trim().replace(/[/\s]+/g, "-");
const normal = (s) => (s || "").trim().toLowerCase();

// ---------- penerima ----------
async function securityJaga() {
  // Shift 1 08:00-20:00, Shift 2 20:00-08:00 (tanggal shift = tanggal mulai) -- sama dgn src/lib/shift.ts
  const shift = jamSekarang >= 8 && jamSekarang < 20 ? "Shift 1" : "Shift 2";
  const tglShift = jamSekarang < 8 ? tanggalWITA(new Date(now.getTime() - 86400000)) : hariIni;
  const snap = await db.collection("security_monthly_schedules").doc(tglShift.slice(0, 7)).get();
  if (!snap.exists) return [];
  const plot = snap.data().data_hari?.[tglShift] || {};
  return Object.keys(plot).filter((n) => String(plot[n]).includes(shift));
}

async function kirimPush(namaList, dept, judul, isi, link) {
  if (namaList !== null && namaList.length === 0) { console.log(`  (tidak ada penerima ${dept})`); return; }
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", dept).get();
  const tokens = [];
  const penerima = [];
  tokenSnap.forEach((d) => {
    const x = d.data();
    if (!x.token || !x.pic_nama) return;
    if (namaList === null || namaList.includes(x.pic_nama)) { tokens.push(x.token); penerima.push(x.pic_nama); }
  });
  const target = namaList === null ? penerima : namaList;
  await Promise.all(target.map((nama) =>
    db.collection("notifikasi_personal").add({ untukNama: nama, judul, pesan: isi, link: link || "", dibaca: false, waktu: FieldValue.serverTimestamp() })
  ));
  if (tokens.length === 0) { console.log(`  push ${dept}: tidak ada token FCM`); return; }
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: judul, body: isi },
    data: link ? { link } : {}, // dibaca public/firebase-messaging-sw.js saat notifikasi diketuk
    webpush: { notification: { icon: "/icons/icon-192.png" }, fcmOptions: link ? { link: `https://sibm-app.web.app${link}` } : undefined },
  });
  console.log(`  push ${dept} -> ${penerima.join(", ")}: ${res.successCount} sukses, ${res.failureCount} gagal`);
}

async function kirimEmail(to, nama, subject, html) {
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...EMAILJS, template_params: { to_email: to, to_name: nama, subject, message: html } }),
  });
  if (!res.ok) throw new Error(`EmailJS ${res.status}: ${await res.text()}`);
}

function emailHtml(judul, paragraf, baris) {
  const row = ([l, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:12.5px;color:#71717a;font-weight:700;white-space:nowrap;vertical-align:top;width:38%;">${l}</td><td style="padding:9px 0 9px 12px;border-bottom:1px solid #f0f0ef;font-size:13.5px;color:#18181b;font-weight:600;">${v}</td></tr>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;padding:24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4;"><tr><td style="background:linear-gradient(150deg,#9f1d1d 0%,#dc2626 55%,#c62828 100%);padding:22px 26px;"><div style="color:#fff;font-size:12px;font-weight:700;letter-spacing:1px;opacity:.85;">SIBM &middot; PT SAMUDERA</div><div style="color:#fff;font-size:19px;font-weight:800;margin-top:4px;">${judul}</div></td></tr><tr><td style="padding:26px;"><p style="margin:0 0 16px;font-size:13.5px;color:#3f3f46;line-height:1.6;">${paragraf}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${baris.map(row).join("")}</table></td></tr><tr><td style="padding:16px 26px;background:#f7f6f5;border-top:1px solid #e7e5e4;"><!-- §68 banner + tautan aplikasi (public/email/sibm-banner.png, scripts/generate-email-banner.mjs) --><a href="https://sibm-app.web.app" style="display:inline-block;background:#a3122a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:10px;margin:0 0 14px 0;">Buka Aplikasi SIBM &rarr;</a><a href="https://sibm-app.web.app" style="display:block;margin:0 0 12px 0;"><img src="https://sibm-app.web.app/email/sibm-banner.png" width="468" alt="SIBM - Sistem Informasi Bangunan &amp; Manajemen. Buka sibm-app.web.app" style="display:block;width:100%;max-width:468px;height:auto;border:0;border-radius:10px;"></a><div style="font-size:11px;color:#71717a;">Email otomatis dari SIBM. Mohon tidak membalas email ini.</div></td></tr></table></div>`;
}

async function emailQhse(subject, judul, paragraf, baris) {
  const snap = await db.collection("users_master").where("departemen", "==", "QHSE").get();
  for (const d of snap.docs) {
    const u = d.data();
    if (!u.email) continue;
    try { await kirimEmail(u.email, u.nama, subject, emailHtml(judul, paragraf, baris)); console.log(`  email QHSE -> ${u.email}`); }
    catch (e) { console.error(`  email QHSE gagal (${u.email}):`, e.message); }
  }
}

// ---------- data bersama ----------
const sesiTerbuka = (await db.collection("security_visitor_logs").where("status", "==", "Di Dalam Area").get())
  .docs.map((d) => ({ id: d.id, ...d.data() }))
  .filter((x) => x.jenis === "Karyawan" && x.waktu_masuk);

// ============ A. BELUM DIINPUT ============
async function cekBelumInput() {
  if (!hariKerja || jamSekarang < 9) return;
  const libur = (await db.collection("settings").doc("validasi_karyawan").get()).data()?.hari_libur || [];
  if (libur.includes(hariIni)) {
    // §71: libur ditambahkan SETELAH kartu terlanjur dibuat (mis. jam 09:00) -> tutup kartunya supaya
    // hilang dari halaman Validasi & banner Security.
    const sisa = (await db.collection("validasi_karyawan").where("tanggal", "==", hariIni).get())
      .docs.filter((d) => d.data().jenis === "belum_input" && d.data().status === "menunggu");
    for (let i = 0; i < sisa.length; i += 400) {
      const batch = db.batch();
      sisa.slice(i, i + 400).forEach((d) => batch.update(d.ref, { status: "libur" }));
      await batch.commit();
    }
    console.log(`A. Hari libur (settings/validasi_karyawan), skip. ${sisa.length} kartu ditutup.`);
    return;
  }

  const awalHari = Timestamp.fromDate(waktuWITA(hariIni, "00:00"));
  const masukHariIni = (await db.collection("security_visitor_logs").where("waktu_masuk", ">=", awalHari).get())
    .docs.map((d) => d.data()).filter((x) => x.jenis === "Karyawan");
  const sudahMasuk = new Set(masukHariIni.map((x) => normal(x.nama)));
  const kartu = new Map((await db.collection("validasi_karyawan").where("tanggal", "==", hariIni).get())
    .docs.filter((d) => d.data().jenis === "belum_input").map((d) => [d.id, d.data()]));

  const karyawan = (await db.collection("employees_directory").get()).docs.map((d) => d.data()).filter((e) => e.nama);
  const menunggu = [];
  const tulis = []; // [ref, data, "set"|"update"] -- di-commit per 400 (batas batch Firestore 500)
  for (const e of karyawan) {
    const id = `${hariIni}_masuk_${slugNama(e.nama)}`;
    const k = kartu.get(id);
    if (sudahMasuk.has(normal(e.nama))) {
      if (k && k.status === "menunggu") tulis.push([db.collection("validasi_karyawan").doc(id), { status: "sudah_hadir" }, "update"]);
      continue;
    }
    if (k && k.status !== "menunggu") continue; // sudah dijawab Security
    if (!k) tulis.push([db.collection("validasi_karyawan").doc(id), {
      jenis: "belum_input", tanggal: hariIni, nama: e.nama, departemen: e.departemen || "-",
      status: "menunggu", dibuat_pada: FieldValue.serverTimestamp(),
    }, "set"]);
    menunggu.push(e.nama);
  }
  for (let i = 0; i < tulis.length; i += 400) {
    const batch = db.batch();
    tulis.slice(i, i + 400).forEach(([ref, data, op]) => (op === "set" ? batch.set(ref, data) : batch.update(ref, data)));
    await batch.commit();
  }
  console.log(`A. ${karyawan.length} karyawan, ${sudahMasuk.size} sudah check-in, ${menunggu.length} menunggu validasi.`);

  const slot = [...SLOT_CEK_MASUK].reverse().find((s) => jamSekarang >= Number(s));
  const guard = db.collection("reminder_validasi_log").doc(`${hariIni}_masuk_${slot}`);
  if (menunggu.length === 0 || (await guard.get()).exists) return;
  await kirimPush(await securityJaga(), "Security", "📋 Karyawan Belum Tercatat Masuk",
    `${menunggu.length} karyawan belum check-in hari ini${menunggu.length <= 3 ? `: ${menunggu.join(", ")}` : ""}. Cek: lupa diinput atau tidak masuk?`,
    "/dashboard/security/validasi");
  await guard.set({ waktu: FieldValue.serverTimestamp(), jumlah: menunggu.length });
}

// ============ B. LEMBUR ============
async function cekLembur() {
  const baru = [];
  const tanyaUlang = [];
  let menungguTotal = 0;
  for (const s of sesiTerbuka) {
    const masuk = s.waktu_masuk.toDate();
    if (now < mulaiLembur(masuk)) continue;
    const tgl = tanggalWITA(masuk);
    const ref = db.collection("validasi_karyawan").doc(`${tgl}_lembur_${s.id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        jenis: "lembur", tanggal: tgl, nama: s.nama, departemen: s.instansi_dept || "-", status: "menunggu",
        visitor_log_id: s.id, waktu_masuk: s.waktu_masuk, dibuat_pada: FieldValue.serverTimestamp(),
      });
      baru.push(s.nama); menungguTotal++;
      continue;
    }
    const v = snap.data();
    if (v.status === "menunggu") menungguTotal++;
    if (v.status === "akan_pulang" && v.waktu_validasi && now - v.waktu_validasi.toDate() >= MENIT_TANYA_ULANG_PULANG * 60000) {
      await ref.update({ status: "menunggu", ditanya_ulang: FieldValue.increment(1) });
      tanyaUlang.push(s.nama); menungguTotal++;
    }
  }
  console.log(`B. ${sesiTerbuka.length} sesi terbuka, ${baru.length} lembur baru, ${tanyaUlang.length} ditanya ulang, ${menungguTotal} menunggu.`);

  const bagian = [];
  if (baru.length) bagian.push(`${baru.length} karyawan masih di gedung lewat 18:00${baru.length <= 3 ? ` (${baru.join(", ")})` : ""}`);
  if (tanyaUlang.length) bagian.push(`${tanyaUlang.join(", ")} bilang akan pulang tapi belum check-out`);
  // SERAH TERIMA SHIFT (§65): run pertama sejak 20:00 -> SELALU beri tahu Shift 2 sisa kartu yang belum
  // dijawab Shift 1 (dulu hanya bila tidak ada kartu baru di run itu, jadi bisa terlewat) + yang
  // masih lembur/akan pulang di dalam gedung. Kartunya sendiri tetap tampil di halaman Validasi
  // untuk siapa pun yang jaga, jadi tugas otomatis berpindah ke petugas baru.
  const guardShift = db.collection("reminder_validasi_log").doc(`${hariIni}_lembur_shift2`);
  if (jamSekarang >= 20 && !(await guardShift.get()).exists) {
    const lama = menungguTotal - baru.length - tanyaUlang.length;
    const masihDiDalam = (await db.collection("validasi_karyawan").where("tanggal", "==", hariIni).get())
      .docs.map((d) => d.data()).filter((v) => v.jenis === "lembur" && (v.status === "lanjut" || v.status === "akan_pulang")).length;
    if (lama > 0) bagian.push(`SERAH TERIMA: ${lama} karyawan belum divalidasi shift sebelumnya, mohon foto & validasi`);
    if (masihDiDalam > 0) bagian.push(`${masihDiDalam} karyawan lembur masih di gedung (pantau sampai check-out)`);
    await guardShift.set({ waktu: FieldValue.serverTimestamp(), belum_divalidasi: lama, masih_di_dalam: masihDiDalam });
  }
  if (bagian.length) {
    await kirimPush(await securityJaga(), "Security", "⏳ Validasi Lembur", `${bagian.join(". ")}. Mohon cek & foto di lokasi.`, "/dashboard/security/validasi");
  }
}

// Cadangan: sesi sudah check-out tapi kartu lembur belum ditutup (jalur utama: Buku Tamu).
async function tutupLemburSelesai() {
  for (const status of ["lanjut", "akan_pulang", "menunggu"]) {
    const snap = await db.collection("validasi_karyawan").where("status", "==", status).get();
    for (const d of snap.docs) {
      const v = d.data();
      if (v.jenis !== "lembur" || !v.visitor_log_id) continue;
      const log = await db.collection("security_visitor_logs").doc(v.visitor_log_id).get();
      const x = log.data();
      if (!x || x.status === "Di Dalam Area" || !x.waktu_keluar) continue;
      const keluar = x.waktu_keluar.toDate();
      if (status === "lanjut" && v.overtime_id) {
        const mulai = mulaiLembur(x.waktu_masuk.toDate());
        await db.collection("ga_overtime_requests").doc(v.overtime_id).update({
          jam_selesai: jamWITA(keluar), tanggal_selesai: tanggalWITA(keluar), waktu_selesai: x.waktu_keluar,
          durasi_tagih_jam: jamTagih(mulai, keluar), status: "Tercatat",
        });
      }
      await d.ref.update({ status: "selesai", waktu_keluar: x.waktu_keluar });
      console.log(`  ditutup: ${v.nama} (${status})`);
    }
  }
}

// ============ C. PEMANTAUAN JAM KERJA (QHSE) ============
async function pantauJamKerja() {
  for (const s of sesiTerbuka) {
    const masuk = s.waktu_masuk.toDate();
    const jamGedung = (now - masuk) / 3600000;
    const jamLembur = Math.max(0, (now - mulaiLembur(masuk)) / 3600000);
    const pemicu = [];
    if (jamLembur > BATAS_LEMBUR_JAM) pemicu.push(`lembur > ${BATAS_LEMBUR_JAM} jam`);
    if (jamGedung > BATAS_DI_GEDUNG_JAM) pemicu.push(`> ${BATAS_DI_GEDUNG_JAM} jam di gedung`);
    if (!pemicu.length) continue;
    const ref = db.collection("pemantauan_jam_kerja").doc(s.id);
    if ((await ref.get()).exists) continue;
    await ref.set({
      nama: s.nama, departemen: s.instansi_dept || "-", tanggal: tanggalWITA(masuk), waktu_masuk: s.waktu_masuk,
      pemicu, jam_di_gedung_saat_lapor: Math.round(jamGedung * 10) / 10, jam_lembur_saat_lapor: Math.round(jamLembur * 10) / 10,
      status: "berlangsung", dilaporkan_pada: FieldValue.serverTimestamp(),
    });
    const isi = `${s.nama} (${s.instansi_dept || "-"}) sudah ${fmtJamDesimal(jamGedung)} di gedung sejak ${jamWITA(masuk)} — melebihi batas kerja normal (${pemicu.join(", ")}). Harap perhatiannya.`;
    console.log(`C. lapor QHSE: ${s.nama} (${pemicu.join(", ")})`);
    await kirimPush(null, "QHSE", "⚠️ Jam Kerja Melebihi Batas", isi, "/dashboard/qhse");
    await emailQhse("Peringatan Jam Kerja Melebihi Batas", "&#9888; Jam Kerja Melebihi Batas Normal",
      `Karyawan berikut masih bekerja melebihi batas jam kerja normal. Mohon perhatian dan tindak lanjut dari sisi keselamatan kerja (risiko kelelahan).`,
      [["Nama", s.nama], ["Departemen", s.instansi_dept || "-"], ["Check-in", `${tanggalWITA(masuk)} ${jamWITA(masuk)}`],
       ["Di gedung", fmtJamDesimal(jamGedung)], ["Lembur (sejak 18:00)", fmtJamDesimal(jamLembur)], ["Pemicu", pemicu.join(", ")]]);
  }

  // Rekap akhir saat sudah check-out.
  const berlangsung = await db.collection("pemantauan_jam_kerja").where("status", "==", "berlangsung").get();
  for (const d of berlangsung.docs) {
    const log = (await db.collection("security_visitor_logs").doc(d.id).get()).data();
    if (!log || log.status === "Di Dalam Area" || !log.waktu_keluar) continue;
    const masuk = log.waktu_masuk.toDate();
    const keluar = log.waktu_keluar.toDate();
    const totalGedung = (keluar - masuk) / 3600000;
    const totalLembur = Math.max(0, (keluar - mulaiLembur(masuk)) / 3600000);
    await d.ref.update({
      status: "selesai", waktu_keluar: log.waktu_keluar,
      total_jam_di_gedung: Math.round(totalGedung * 10) / 10, total_jam_lembur: Math.round(totalLembur * 10) / 10,
    });
    const isi = `${log.nama} sudah check-out ${jamWITA(keluar)}. Total ${fmtJamDesimal(totalGedung)} di gedung (lembur ${fmtJamDesimal(totalLembur)}).`;
    console.log(`C. rekap akhir: ${log.nama}`);
    await kirimPush(null, "QHSE", "📋 Rekap Jam Kerja", isi, "/dashboard/qhse");
    await emailQhse("Rekap Jam Kerja Melebihi Batas", "&#128203; Rekap Jam Kerja",
      `Karyawan yang sebelumnya dilaporkan bekerja melebihi batas normal sudah check-out. Rekap totalnya:`,
      [["Nama", log.nama], ["Departemen", log.instansi_dept || "-"], ["Masuk", `${tanggalWITA(masuk)} ${jamWITA(masuk)}`],
       ["Keluar", `${tanggalWITA(keluar)} ${jamWITA(keluar)}`], ["Total di gedung", fmtJamDesimal(totalGedung)], ["Total lembur", fmtJamDesimal(totalLembur)]]);
  }
}

console.log(`validasi-karyawan ${hariIni} ${jamWITA(now)} WITA (hari kerja: ${hariKerja})`);
for (const [nama, fn] of [["belum input", cekBelumInput], ["lembur", cekLembur], ["tutup lembur", tutupLemburSelesai], ["pemantauan", pantauJamKerja]]) {
  try { await fn(); } catch (e) { console.error(`Gagal di tahap ${nama}:`, e); process.exitCode = 1; }
}
