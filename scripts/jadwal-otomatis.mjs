// scripts/jadwal-otomatis.mjs  (§82)
//
// Menjaga jadwal Security & plot OB & CS SELALU tersedia 60 hari ke depan, tanpa perlu koordinator
// menekan "Generate" tiap periode. Jalan 1x/hari (workflow jadwal-otomatis.yml).
//
// ATURAN AMAN: hanya MENGISI tanggal/sel yang masih KOSONG, mulai hari ini. Jadwal yang sudah
// dibuat / diubah manual (termasuk Izin, tukar shift) tidak pernah ditimpa.
//
// SECURITY -- pola rotasi 2-2-2 (S1,S1,S2,S2,Off,Off) per orang, DILANJUTKAN dari jadwal terakhir
//   orang itu (logika sama dgn tentukanIndexLanjutan di PengaturanJadwalSecurity.tsx). Staf tanpa
//   riwayat jadwal sama sekali dilewati (Danru isi hari pertamanya dulu). Magang tidak ikut.
// OB & CS -- Senin-Jumat; Pelayanan = ob_settings/config.pelayanan_tetap; area cleaning dibagi per
//   "paket" (nomor paket per area di /admin/sop-checklist, bawaan [[Basement,Lantai 1],[Lantai 2],[Lantai 3,Lantai 4],
//   [Lantai 5]]) ke staf cleaning secara acak, SAMA untuk 1 minggu (sama dgn generateSebulan blok 7
//   hari). Minggu yang sudah punya plot memakai susunan yang sudah ada.

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, FieldPath } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const HARI_KE_DEPAN = 60;
const POLA = ["Shift 1", "Shift 1", "Shift 2", "Shift 2", "Off", "Off"];
const PAKET_OB_BAWAAN = [["Basement", "Lantai 1"], ["Lantai 2"], ["Lantai 3", "Lantai 4"], ["Lantai 5"]];
const AREA_PELAYANAN = "Pelayanan Khusus OB"; // sinkron dgn PlottingOBPage.tsx

const FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });
const hariIni = FMT.format(new Date());
const geser = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hariMinggu = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0=Minggu
const akhirPekan = (iso) => [0, 6].includes(hariMinggu(iso));
const seninDari = (iso) => geser(iso, -((hariMinggu(iso) + 6) % 7));
const DRY = process.env.DRY_RUN === "true";

// ---------------- SECURITY ----------------
const kelompok = (l) => (!l ? null : l.includes("Shift 1") ? "S1" : l.includes("Shift 2") ? "S2" : l.includes("Off") || l.includes("Izin") ? "Off" : null);
const URUTAN = ["S1", "S2", "Off"];

async function jadwalSecurity() {
  const staf = (await db.collection("users_master").where("departemen", "==", "Security").get()).docs
    .map((d) => d.data()).filter((u) => u.nama && !String(u.role || "").toLowerCase().includes("magang")).map((u) => u.nama);
  const awal = geser(hariIni, -21);
  const akhir = geser(hariIni, HARI_KE_DEPAN);
  // Dokumen bulan yang tercakup
  const bulan = [];
  for (let d = awal; d <= akhir; d = geser(d, 1)) { const b = d.slice(0, 7); if (!bulan.includes(b)) bulan.push(b); }
  const dataHari = {};
  for (const b of bulan) {
    const s = await db.collection("security_monthly_schedules").doc(b).get();
    Object.assign(dataHari, (s.exists && s.data().data_hari) || {});
  }
  const tambahan = {}; // bulan -> tanggal -> nama -> label
  let total = 0;
  const dilewati = [];
  for (const nama of staf) {
    let idx = null;       // index POLA hari sebelumnya (bila diketahui)
    let labelLalu = null;
    let pernahAda = false;
    for (let d = awal; d <= akhir; d = geser(d, 1)) {
      const label = dataHari[d]?.[nama];
      const g = kelompok(label);
      if (g) {
        pernahAda = true;
        const gi = URUTAN.indexOf(g);
        if (idx !== null && Math.floor(((idx + 1) % 6) / 2) === gi) idx = (idx + 1) % 6;            // lanjut wajar
        else if (kelompok(labelLalu) === g) idx = gi * 2 + 1;                                         // hari ke-2 kelompok
        else idx = gi * 2;                                                                             // hari ke-1 kelompok
        labelLalu = label;
        continue;
      }
      if (idx === null) { labelLalu = null; continue; }
      idx = (idx + 1) % 6;
      if (d >= hariIni && !label) {
        const b = d.slice(0, 7);
        ((tambahan[b] ??= {})[d] ??= {})[nama] = POLA[idx];
        total++;
      }
      labelLalu = POLA[idx];
    }
    if (!pernahAda) dilewati.push(nama);
  }
  if (!DRY) {
    for (const [b, hari] of Object.entries(tambahan)) {
      // update per sel (FieldPath, aman untuk nama bertitik mis. "M. Yusuf") -> tidak menimpa sel lain
      const args = [new FieldPath("waktu_update"), FieldValue.serverTimestamp()];
      for (const [tgl, plot] of Object.entries(hari)) for (const [nama, label] of Object.entries(plot)) args.push(new FieldPath("data_hari", tgl, nama), label);
      const ref = db.collection("security_monthly_schedules").doc(b);
      if ((await ref.get()).exists) await ref.update(...args);
      else {
        const data_hari = hari;
        await ref.set({ bulan_tahun: b, data_hari, waktu_update: FieldValue.serverTimestamp(), dibuat_oleh: "Sistem (jadwal otomatis)" });
      }
    }
  }
  console.log(`SECURITY: ${staf.length} staf, ${total} sel diisi s.d. ${akhir}${dilewati.length ? ` | tanpa riwayat (dilewati): ${dilewati.join(", ")}` : ""}`);
}

// ---------------- OB & CS ----------------
function acak(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function jadwalOB() {
  const pelayanan = (await db.collection("ob_settings").doc("config").get()).data()?.pelayanan_tetap || "";
  // Paket dari master SOP Checklist (settings/checklist_ob.area[].paket) -- sama dgn paketPlottingDari() di src/lib/sopChecklist.ts
  const areaMaster = (await db.collection("settings").doc("checklist_ob").get()).data()?.area;
  let paket = PAKET_OB_BAWAAN;
  if (Array.isArray(areaMaster) && areaMaster.length) {
    const grup = new Map();
    let bebas = 1000;
    areaMaster.filter((a) => !String(a.area).toLowerCase().includes("pelayanan")).forEach((a) => {
      const bawaan = { Basement: 1, "Lantai 1": 1, "Lantai 2": 2, "Lantai 3": 3, "Lantai 4": 3, "Lantai 5": 4 }[a.area];
      const no = typeof a.paket === "number" && a.paket > 0 ? a.paket : bawaan ?? bebas++;
      grup.set(no, [...(grup.get(no) || []), a.area]);
    });
    paket = [...grup.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
  }
  const staf = (await db.collection("users_master").where("departemen", "==", "OB & CS").get()).docs.map((d) => d.data().nama).filter(Boolean);
  const cleaning = staf.filter((n) => n !== pelayanan);
  if (!pelayanan || cleaning.length === 0) { console.log("OB: pelayanan tetap belum diatur / staf cleaning kosong -> dilewati."); return; }

  const akhir = geser(hariIni, HARI_KE_DEPAN);
  const mulaiBaca = seninDari(hariIni);
  const ada = {};
  const snap = await db.collection("daily_plots").where(FieldPath.documentId(), ">=", mulaiBaca).where(FieldPath.documentId(), "<=", akhir).get();
  snap.forEach((d) => { ada[d.id] = d.data().plot_lantai || {}; });
  const libur = (await db.collection("settings").doc("validasi_karyawan").get()).data()?.hari_libur || [];

  const susunanMinggu = {}; // senin -> plot cleaning
  const ambilSusunan = (senin) => {
    if (susunanMinggu[senin]) return susunanMinggu[senin];
    for (let i = 0; i < 5; i++) {
      const p = ada[geser(senin, i)];
      if (p && Object.keys(p).length) {
        const salin = { ...p }; delete salin[AREA_PELAYANAN];
        return (susunanMinggu[senin] = salin);
      }
    }
    const urut = acak(cleaning);
    const baru = {};
    paket.forEach((areaPaket, i) => areaPaket.forEach((a) => { baru[a] = urut[i % urut.length]; }));
    return (susunanMinggu[senin] = baru);
  };

  let total = 0;
  const batch = db.batch();
  for (let d = hariIni; d <= akhir; d = geser(d, 1)) {
    if (akhirPekan(d) || libur.includes(d)) continue; // hari libur (/admin/hari-libur) -> OB tidak dijadwalkan
    if (ada[d] && Object.keys(ada[d]).length) continue; // sudah ada -> jangan sentuh
    const plot = { ...ambilSusunan(seninDari(d)), [AREA_PELAYANAN]: pelayanan };
    ada[d] = plot;
    if (!DRY) batch.set(db.collection("daily_plots").doc(d), { plot_lantai: plot, waktu_update: FieldValue.serverTimestamp(), dibuat_otomatis: true }, { merge: true });
    total++;
  }
  if (!DRY && total) await batch.commit();
  console.log(`OB & CS: pelayanan ${pelayanan}, ${cleaning.length} staf cleaning, ${total} hari diisi s.d. ${akhir}.`);
}

console.log(`jadwal-otomatis ${hariIni}${DRY ? " (DRY RUN)" : ""}`);
for (const [nama, fn] of [["security", jadwalSecurity], ["ob", jadwalOB]]) {
  try { await fn(); } catch (e) { console.error(`Gagal ${nama}:`, e); process.exitCode = 1; }
}
