// scripts/fcm-reminder.mjs
//
// Kirim push notification (FCM) TERTARGET ke staf OB & CS yang checklist
// kebersihannya masih pending di sesi berjalan (Pagi/Siang/Sore) -- bukan
// lagi blast generik ke semua token. Dipanggil via GitHub Actions cron
// (lihat .github/workflows/fcm-reminder.yml) tiap 30 menit, SEPANJANG hari
// -- script ini sendiri yang memutuskan skip kalau lagi di luar jendela
// sesi/weekend (biar gak perlu utak-atik cron UTC vs WITA yang rawan salah
// hitung buat "cuma weekday").
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

// Duplikat dari patroli-push-reminder.mjs -- lihat catatan sinkronisasi di sana.
async function tulisNotifPersonal(namaList, judul, pesan) {
  await Promise.all(namaList.map((nama) =>
    db.collection("notifikasi_personal").add({ untukNama: nama, judul, pesan, dibaca: false, waktu: FieldValue.serverTimestamp() })
  ));
}

// ==========================================
// WAKTU SEKARANG (WITA)
// ==========================================
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));

function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
const hariIni = formatTanggal(now);
const hariMinggu = now.getDay(); // 0 = Minggu, 6 = Sabtu

// ==========================================
// SESI CHECKLIST OB -- duplikat manual dari src/lib/shift.ts (script plain Node ESM,
// tidak bisa import TypeScript/path alias). Kalau jendela sesi berubah, ubah juga di sana.
// ==========================================
function sesiOBSekarang(d) {
  const menit = d.getHours() * 60 + d.getMinutes();
  if (menit >= 7 * 60 && menit < 10 * 60) return "Pagi";
  if (menit >= 11 * 60 + 30 && menit < 14 * 60 + 30) return "Siang";
  if (menit >= 14 * 60 + 30 && menit < 17 * 60 + 30) return "Sore";
  return null;
}

async function jalankan() {
  if (hariMinggu === 0 || hariMinggu === 6) {
    console.log("Weekend, OB & CS tidak ada jadwal, skip.");
    return;
  }

  // §177 opname stok harian (Pagi 07.00-09.00, Sore 15.30-17.00) -- jalan juga selama uji coba zona
  await pengingatOpname();

  // §169 uji coba pola zona OB: pengingat sesi lama diganti 2 pengingat per hari --
  // 12:00-12:29 & 16:30-16:59 bila ronde hari ini masih kurang dari minimal.
  const uji = (await db.collection("ob_settings").doc("uji_pola_zona").get()).data();
  if (uji?.aktif && hariIni >= uji.mulai && (uji.permanen === true || hariIni <= uji.selesai)) {
    await pengingatMisiPagi(uji);
    await pengingatZona(uji);
    return;
  }

  const sesiSekarang = sesiOBSekarang(now);
  if (!sesiSekarang) {
    console.log(`Jam ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")} WITA di luar jendela sesi checklist, skip.`);
    return;
  }

  const plotSnap = await db.collection("daily_plots").doc(hariIni).get();
  if (!plotSnap.exists) {
    console.log("Belum ada plotting hari ini, skip.");
    return;
  }
  const plotLantai = plotSnap.data().plot_lantai || {};

  // Kumpulkan area per-PIC (1 PIC bisa pegang lebih dari 1 area, mis. Basement+Lantai 1).
  const areaPerPic = {};
  for (const [area, nama] of Object.entries(plotLantai)) {
    if (!nama) continue;
    if (!areaPerPic[nama]) areaPerPic[nama] = [];
    areaPerPic[nama].push(area);
  }
  const daftarPic = Object.keys(areaPerPic);
  if (daftarPic.length === 0) {
    console.log("Tidak ada PIC terplot hari ini, skip.");
    return;
  }

  // Cek siapa yang SUDAH lapor di sesi ini (query 1x, filter di memory -- jumlah dokumen
  // per hari kecil, gak perlu query per-PIC).
  const checklistSnap = await db
    .collection("ob_checklists")
    .where("tanggal", "==", hariIni)
    .where("sesi", "==", sesiSekarang)
    .get();
  const picSudahLapor = new Set(checklistSnap.docs.map((d) => d.data().pic_bertugas));

  const picBelumLapor = daftarPic.filter((nama) => !picSudahLapor.has(nama));
  if (picBelumLapor.length === 0) {
    console.log(`Semua PIC sudah lapor sesi ${sesiSekarang} hari ini.`);
    return;
  }

  // Ambil token FCM cuma buat PIC yang belum lapor (bukan semua token OB & CS).
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "OB & CS").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => {
    const data = d.data();
    if (data.token && data.pic_nama) tokenPerNama[data.pic_nama] = data.token;
  });

  const target = picBelumLapor
    .map((nama) => ({ nama, token: tokenPerNama[nama], area: areaPerPic[nama].join(", ") }))
    .filter((t) => t.token);

  if (target.length === 0) {
    console.log("Belum lapor tapi tidak ada token FCM terdaftar untuk PIC-PIC itu, skip kirim.");
    return;
  }

  console.log(`Mengirim reminder sesi ${sesiSekarang} ke ${target.length} PIC yang belum lapor:`, target.map((t) => t.nama).join(", "));

  const bodyPesan = "Checklist kebersihan area kamu hari ini belum disubmit. Yuk selesaikan sebelum sesi berikutnya.";
  const response = await messaging.sendEachForMulticast({
    tokens: target.map((t) => t.token),
    notification: { title: `Pengingat Checklist Sesi ${sesiSekarang}`, body: bodyPesan },
    webpush: {
      notification: { icon: "/icons/icon-192.png" },
    },
  });

  console.log(`${response.successCount} sukses, ${response.failureCount} gagal.`);
  response.responses.forEach((res, idx) => {
    if (!res.success) {
      console.log(`Gagal kirim ke ${target[idx].nama}:`, res.error?.code);
    }
  });
  await tulisNotifPersonal(picBelumLapor, `Pengingat Checklist Sesi ${sesiSekarang}`, bodyPesan);
}

// §177 pengingat opname stok: 08:30-08:59 (pagi) & 16:30-16:59 (sebelum pulang) bila sesi itu belum dihitung.
// Opname dikerjakan siapa saja di tim, jadi dikirim ke semua token OB & CS. Jadwal = src/lib/stokOB.ts JADWAL_OPNAME.
async function pengingatOpname() {
  const menit = now.getHours() * 60 + now.getMinutes();
  const sesi = menit >= 8 * 60 + 30 && menit < 9 * 60 ? "Pagi" : menit >= 16 * 60 + 30 && menit < 17 * 60 ? "Sore" : null;
  if (!sesi) return;
  const libur = (await db.collection("settings").doc("validasi_karyawan").get()).data()?.hari_libur || [];
  if (libur.includes(hariIni)) return;
  const snap = await db.collection("ob_opname").where("tanggal", "==", hariIni).get();
  if (snap.docs.some((d) => d.data().sesi === sesi && d.data().status !== "Ditolak")) {
    console.log(`Opname ${sesi} sudah dihitung, skip pengingat.`);
    return;
  }
  const judul = "Pengingat Opname Stok";
  const pesan = `Opname stok ${sesi === "Pagi" ? "pagi (07.00-09.00)" : "sebelum pulang (15.30-17.00)"} belum dihitung. Buka Inventori Gudang OB.`;
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "OB & CS").get();
  let terkirim = 0;
  for (const d of tokenSnap.docs) {
    const x = d.data();
    if (!x.token) continue;
    try {
      await messaging.send({ token: x.token, notification: { title: judul, body: pesan }, webpush: { notification: { icon: "/icons/icon-192.png" } } });
      terkirim++;
    } catch (e) { console.log(`Gagal kirim ke ${x.pic_nama || d.id}: ${e.message}`); }
  }
  console.log(`Pengingat opname ${sesi}: ${terkirim} terkirim.`);
}

// §186 pengingat misi pagi (07:30-08:59 WITA, 1x per hari): tugas paket hari ini + poin bulan ini;
// poin rendah (< AMBANG_POIN_RENDAH) diberi peringatan agar rajin upload ronde + foto.
const AMBANG_POIN_RENDAH = 85;
const LABEL_PAKET = { T1: "Tenant A", T2: "Tenant B", TOILET: "Publik · Toilet", LAIN: "Publik · Area Lain" };
const PASANGAN = { T1: "T2", T2: "T1", TOILET: "LAIN", LAIN: "TOILET" };
function seninDari(iso) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; }
/** Duplikat pemegangPada (src/lib/paketZona.ts) -- kode -> nama pemegang pada tanggal tsb. */
function pemegangHariIni(paket, tanggal) {
  const n = Math.round((seninDari(tanggal) - seninDari(paket.acuan)) / (7 * 86400000));
  const tukar = ((n % 2) + 2) % 2 === 1;
  const out = {};
  for (const k of Object.keys(LABEL_PAKET)) out[k] = (tukar ? paket.pemegang?.[PASANGAN[k]] : paket.pemegang?.[k]) || "";
  return out;
}
async function pengingatMisiPagi(uji) {
  const menit = now.getHours() * 60 + now.getMinutes();
  if (menit < 7 * 60 + 30 || menit >= 9 * 60) return;
  const libur = (await db.collection("settings").doc("validasi_karyawan").get()).data()?.hari_libur || [];
  if (libur.includes(hariIni)) return;
  // kunci 1x per hari (cron 30 menit + pemicu cron-job.org bisa dobel)
  try { await db.collection("reminder_points_log").doc(`misi-ob-${hariIni}`).create({ waktu: FieldValue.serverTimestamp() }); }
  catch { console.log("Pengingat misi pagi OB sudah terkirim hari ini, skip."); return; }
  const norm = (n) => String(n || "").trim().toLowerCase();
  const absen = ((uji.tidak_hadir || {})[hariIni] || []).map(norm);
  const peserta = [...(uji.tim_tenant || []), ...(uji.tim_publik || [])].filter((n) => !absen.includes(norm(n)));
  const pemegang = uji.paket_zona?.acuan ? pemegangHariIni(uji.paket_zona, hariIni) : {};
  const minRonde = Math.max(1, Number(uji.min_ronde) || 1);
  const bulan = hariIni.slice(0, 7);
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "OB & CS").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => { const x = d.data(); if (x.token && x.pic_nama) (tokenPerNama[norm(x.pic_nama)] ||= []).push(x.token); });
  for (const nama of peserta) {
    const kode = Object.keys(pemegang).find((k) => norm(pemegang[k]) === norm(nama));
    const poinDoc = (await db.collection("staff_points_bulanan").doc(`${bulan}_${nama.trim().replace(/\//g, "-")}`).get()).data();
    const poin = poinDoc ? poinDoc.poin : 100;
    const rendah = poin < AMBANG_POIN_RENDAH;
    const judul = rendah ? "⚠️ Poin kamu rendah — ayo kejar hari ini" : "🎯 Misi hari ini";
    const pesan = [
      `Pagi ${nama.split(" ")[0]}! ${kode ? `Hari ini kamu pegang paket ${LABEL_PAKET[kode]}.` : "Cek tugasmu di Checklist Zona."}`,
      absen.length ? "Ada rekan sakit/izin, tugasmu bisa bertambah — cek Checklist Zona." : "",
      `Selesaikan misi sebanyak mungkin: minimal ${minRonde} ronde + foto (+1 poin), lebih dari ${minRonde} = +2 poin, tidak lapor = −10.`,
      rendah ? `Poin bulan ini tinggal ${poin}. Rajin upload ronde & foto tiap selesai keliling supaya naik lagi.` : `Poin bulan ini: ${poin}.`,
    ].filter(Boolean).join(" ");
    for (const token of tokenPerNama[norm(nama)] || []) {
      try { await messaging.send({ token, notification: { title: judul, body: pesan }, webpush: { notification: { icon: "/icons/icon-192.png" } } }); }
      catch (e) { console.log(`Gagal kirim misi ke ${nama}:`, e?.code); }
    }
    await tulisNotifPersonal([nama], judul, pesan);
    console.log(`Misi pagi -> ${nama} (poin ${poin}${rendah ? ", RENDAH" : ""})`);
  }
}

async function pengingatZona(uji) {
  const menit = now.getHours() * 60 + now.getMinutes();
  const siang = menit >= 12 * 60 && menit < 12 * 60 + 30;
  const sore = menit >= 16 * 60 + 30 && menit < 17 * 60;
  if (!siang && !sore) {
    console.log("Uji coba pola zona: di luar jam pengingat (12:00 & 16:30 WITA), skip.");
    return;
  }
  const libur = (await db.collection("settings").doc("validasi_karyawan").get()).data()?.hari_libur || [];
  if (libur.includes(hariIni)) {
    console.log("Uji coba pola zona: hari libur, skip.");
    return;
  }
  // §176 yang ditandai tidak hadir (sakit/izin) hari ini tidak diingatkan
  const absen = ((uji.tidak_hadir || {})[hariIni] || []).map((n) => String(n).trim().toLowerCase());
  const peserta = [...(uji.tim_tenant || []), ...(uji.tim_publik || [])].filter((n) => !absen.includes(n.trim().toLowerCase()));
  const laporan = (await db.collection("ob_zona_laporan").where("tanggal", "==", hariIni).get()).docs.map((d) => d.data());
  const minRonde = Math.max(1, Number(uji.min_ronde) || 1);
  const pesanPer = {};
  for (const nama of peserta) {
    const milik = laporan.filter((l) => String(l.nama || "").trim().toLowerCase() === nama.trim().toLowerCase());
    const ronde = milik.filter((l) => l.jenis === "ronde").length;
    // §171 tanpa penilaian dari staf -- yang diingatkan hanya ronde
    if (ronde < minRonde) pesanPer[nama] = `Checklist Zona hari ini belum lengkap: ronde ${ronde}/${minRonde}. Isi di menu Checklist Zona.`;
  }
  const namaKirim = Object.keys(pesanPer);
  if (namaKirim.length === 0) {
    console.log("Uji coba pola zona: semua peserta sudah lengkap.");
    return;
  }
  const tokenSnap = await db.collection("fcm_tokens").where("dept", "==", "OB & CS").get();
  const tokenPerNama = {};
  tokenSnap.forEach((d) => { const x = d.data(); if (x.token && x.pic_nama) tokenPerNama[x.pic_nama] = x.token; });
  const judul = "Pengingat Checklist Zona";
  for (const nama of namaKirim) {
    const token = tokenPerNama[nama];
    if (!token) { console.log(`Tanpa token FCM: ${nama}`); continue; }
    try {
      await messaging.send({ token, notification: { title: judul, body: pesanPer[nama] }, webpush: { notification: { icon: "/icons/icon-192.png" } } });
      console.log(`Terkirim ke ${nama}`);
    } catch (e) { console.log(`Gagal kirim ke ${nama}:`, e?.code); }
  }
  await Promise.all(namaKirim.map((nama) => tulisNotifPersonal([nama], judul, pesanPer[nama])));
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FCM reminder gagal jalan:", err);
    process.exit(1);
  });
