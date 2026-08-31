import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ==========================================
// SETUP FIREBASE ADMIN
// ==========================================
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ==========================================
// WAKTU SEKARANG (WITA) & DEADLINE BULAN INI
// ==========================================
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));

function formatTanggal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

const hariIni = formatTanggal(now);
const bulanTahunIni = hariIni.substring(0, 7); // "YYYY-MM"

// Deadline inspeksi APAR: tanggal 30 tiap bulan, kecuali bulan itu tidak punya tanggal 30
// (Februari) -> pakai tanggal terakhir bulan itu.
function akhirBulan(tahun, bulanIndex0) {
  return new Date(tahun, bulanIndex0 + 1, 0).getDate();
}
const deadlineDay = Math.min(30, akhirBulan(now.getFullYear(), now.getMonth()));
const sisaHari = deadlineDay - now.getDate(); // 3..0 = dalam window reminder, negatif = sudah lewat (skip, bulan depan reset)

const DALAM_WINDOW_REMINDER = sisaHari >= 0 && sisaHari <= 3;
if (!DALAM_WINDOW_REMINDER) {
  console.log(`Hari ini tgl ${now.getDate()}, deadline APAR tgl ${deadlineDay} -- di luar window H-3, skip.`);
  process.exit(0);
}

// Guard anti-double-kirim: cukup sekali per hari (bukan per-slot seperti patroli).
const idLogHariIni = hariIni;

async function tulisNotifApp(namaPic, pesan, jenis) {
  await db.collection("notifikasi_apar").add({
    untuk_nama: namaPic,
    pesan,
    jenis,
    waktu: FieldValue.serverTimestamp(),
    dibaca: false,
  });
}

async function kirimKeSemua(picList, pesan, jenis) {
  if (picList.length === 0) {
    console.log(`Tidak ada penerima untuk jenis "${jenis}", skip kirim.`);
    return;
  }
  await Promise.all(picList.map((pic) => tulisNotifApp(pic.nama, pesan, jenis)));
  picList.forEach((pic) => console.log(`Notifikasi in-app ditulis untuk ${pic.nama}`));
}

// ==========================================
// SECURITY BERTUGAS HARI INI (Shift 1 & 2 -- inspeksi APAR tidak terikat sesi tertentu)
// ==========================================
async function ambilSecurityBertugasHariIni() {
  const bulanKey = hariIni.substring(0, 7);
  const monthSnap = await db.collection("security_monthly_schedules").doc(bulanKey).get();
  const plotHariIni = monthSnap.exists ? monthSnap.data().data_hari?.[hariIni] || {} : {};
  const namaBertugas = Object.keys(plotHariIni).filter(
    (nama) => plotHariIni[nama] === "Shift 1" || plotHariIni[nama] === "Shift 2"
  );
  if (namaBertugas.length === 0) return [];

  const usersSnap = await db.collection("users_master").where("departemen", "==", "Security").get();
  const semuaStaf = usersSnap.docs.map((d) => d.data());
  return namaBertugas
    .map((nama) => semuaStaf.find((u) => u.nama === nama))
    .filter((u) => u)
    .map((u) => ({ nama: u.nama }));
}

// ==========================================
// ADMIN GA / QHSE (monitoring, tidak terikat shift)
// ==========================================
async function ambilAdminGaQhse() {
  const snap = await db.collection("users_master").where("departemen", "in", ["Admin GA", "QHSE"]).get();
  return snap.docs.map((d) => ({ nama: d.data().nama }));
}

// ==========================================
// UNIT APAR YANG BELUM DIINSPEKSI BULAN INI
// ==========================================
async function hitungUnitBelumInspeksi() {
  const snap = await db.collection("apar_units").get();
  const semua = snap.docs.map((d) => d.data());
  const belum = semua.filter((u) => u.terakhir_inspeksi?.bulan_tahun !== bulanTahunIni);
  return { total: semua.length, belum: belum.length };
}

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

async function jalankan() {
  const logRef = db.collection("reminder_apar_log").doc(idLogHariIni);
  const logSnap = await logRef.get();
  if (logSnap.exists) {
    console.log(`Reminder APAR untuk tanggal ${hariIni} sudah pernah diproses, skip (anti-double-kirim).`);
    return;
  }

  const { total, belum } = await hitungUnitBelumInspeksi();
  if (total === 0) {
    console.log("Belum ada unit APAR terdaftar, skip.");
    return;
  }
  if (belum === 0) {
    console.log("Semua unit APAR sudah diinspeksi bulan ini, skip reminder.");
    await logRef.set({ diproses_pada: FieldValue.serverTimestamp(), catatan: "semua sudah diinspeksi" });
    return;
  }

  await logRef.set({ diproses_pada: FieldValue.serverTimestamp() });

  const namaBulan = NAMA_BULAN[now.getMonth()];
  const pesanSecurity = `🧯 Inspeksi APAR bulan ini belum lengkap: ${belum} dari ${total} unit belum diperiksa. Batas waktu: tanggal ${deadlineDay} ${namaBulan}. Segera selesaikan lewat menu Inspeksi APAR.`;
  const pesanGaQhse = `🧯 [Monitoring] ${belum} dari ${total} unit APAR belum diinspeksi bulan ini. Batas waktu: tanggal ${deadlineDay} ${namaBulan}.`;

  await kirimKeSemua(await ambilSecurityBertugasHariIni(), pesanSecurity, "apar-reminder-security");
  await kirimKeSemua(await ambilAdminGaQhse(), pesanGaQhse, "apar-reminder-monitoring");
}

jalankan()
  .then(() => {
    console.log("Selesai.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error saat menjalankan reminder APAR:", err);
    process.exit(1);
  });
