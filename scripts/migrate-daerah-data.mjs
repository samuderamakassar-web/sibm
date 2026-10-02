// scripts/migrate-daerah-data.mjs  (§78 multi-daerah fase 2, tahap 1)
//
// Mengisi field `daerah` = "Makassar" ke dokumen operasional LAMA yang belum punya. Idempotent (dokumen
// yang sudah punya `daerah` dilewati) -> aman dijalankan ulang. Dijalankan MANUAL lewat GitHub Actions
// (workflow "Migrasi Daerah Data", tombol Run workflow) dengan pilihan dry_run:
//   dry_run=true  -> hanya menghitung, TIDAK menulis apa pun (jalankan ini dulu)
//   dry_run=false -> menulis.
// Koleksi ber-ID tanggal/bulan/konfigurasi (daily_plots, security_monthly_schedules, settings, ob_settings,
// staff_points_bulanan) & users_master SENGAJA tidak disentuh -- didesain ulang per daerah di tahap 3.

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DAERAH = "Makassar";
const DRY_RUN = (process.env.DRY_RUN || "true") !== "false";

const KOLEKSI = [
  "master_atk", "master_kendaraan", "employees_directory", "sop_documents", "security_magang_directory",
  "helpdesk_tickets", "qhse_sbo_reports", "ga_atk_requests", "ga_overtime_requests", "security_visitor_logs",
  "packages", "operational_vehicle_logs", "driver_status_logs", "ob_checklists", "ob_stock", "ob_stock_logs",
  "inspeksi_fasilitas", "apar_inspections", "apar_units", "security_patrols", "kendaraan_odometer_logs",
  "kendaraan_service_logs", "kendaraan_inspeksi_logs", "kendaraan_uji_emisi", "deep_cleaning_tasks",
  "notifikasi_patroli", "notifikasi_kendaraan", "notifikasi_checklist_ob", "fcm_tokens",
  "notifikasi_dadakan_siram", "attendance_logs", "survei_kepuasan_gedung", "security_shift_handover",
  "pengumuman_gedung", "security_shift_extend", "handbook_magang", "evaluasi_manual", "master_laptop",
  "master_legalitas", "validasi_karyawan", "pemantauan_jam_kerja",
];

console.log(`Migrasi daerah="${DAERAH}" -- ${DRY_RUN ? "DRY RUN (tidak menulis)" : "MENULIS"}`);
let totalPerlu = 0;
for (const nama of KOLEKSI) {
  let terakhir = null;
  let diperiksa = 0;
  let perlu = 0;
  for (;;) {
    let q = db.collection(nama).orderBy(FieldPath.documentId()).limit(400);
    if (terakhir) q = q.startAfter(terakhir);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let n = 0;
    snap.docs.forEach((d) => {
      diperiksa++;
      if (d.get("daerah")) return;
      perlu++;
      if (!DRY_RUN) { batch.update(d.ref, { daerah: DAERAH }); n++; }
    });
    if (n) await batch.commit();
    terakhir = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }
  totalPerlu += perlu;
  console.log(`  ${nama.padEnd(28)} diperiksa ${String(diperiksa).padStart(6)} | ${DRY_RUN ? "perlu diisi" : "diisi"} ${perlu}`);
}
console.log(`SELESAI: ${totalPerlu} dokumen ${DRY_RUN ? "akan diisi (jalankan lagi dengan dry_run=false)" : "diisi"}.`);
