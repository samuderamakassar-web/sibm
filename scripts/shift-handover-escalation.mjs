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

async function jalankan() {
  // 1. Cek status serah terima RESMI (QR scan) shift yang baru berakhir.
  const handoverSnap = await db.collection("security_shift_handover")
    .where("tanggal_shift", "==", tanggalKeluar)
    .where("shift", "==", shiftKeluar)
    .orderBy("waktu_generate", "desc")
    .limit(1)
    .get();
  const handover = handoverSnap.empty ? null : handoverSnap.docs[0].data();

  const extendRef = db.collection("security_shift_extend").doc(`${tanggalKeluar}_${shiftKeluar.replace(" ", "")}`);
  const extendSnap = await extendRef.get();

  if (handover?.status === "selesai") {
    console.log(`Serah terima ${shiftKeluar} (${tanggalKeluar}) sudah selesai (${handover.petugas_keluar} -> ${handover.petugas_masuk}). Tidak ada eskalasi.`);
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
    // Eskalasi PERTAMA KALI utk shift ini.
    console.log(`Eskalasi PERTAMA: serah terima ${shiftKeluar} (${tanggalKeluar}) -> ${shiftAktif} (${tanggalAktif}) sudah ${menitSejakBatas} menit belum selesai.`);
    await extendRef.set({
      tanggal_shift: tanggalKeluar,
      shift: shiftKeluar,
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
