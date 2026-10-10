// Kehadiran Security otomatis dari roster + tukar jaga (§115).
// Security TIDAK ikut validasi kehadiran karyawan (kartu "belum_input") -- jadwalnya sudah ada di roster
// (security_monthly_schedules). Saat serah terima shift selesai (scan QR / darurat), semua petugas roster shift
// baru tercatat CHECK-IN dan semua petugas shift lama tercatat CHECK-OUT pada jam itu:
//   kehadiran_security/{tanggal_shift}_{ShiftX}_{nama-slug} { tanggal_shift, shift, nama, check_in, check_out, ... }

import { doc, getDoc, getDocs, collection, query, where, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

export type ShiftSecurity = "Shift 1" | "Shift 2";
export interface KehadiranSecurity {
  id: string; tanggal_shift: string; shift: ShiftSecurity; nama: string;
  check_in?: { toDate: () => Date } | null; check_out?: { toDate: () => Date } | null;
  tanpa_serah_terima?: boolean;
}

const slug = (s: string) => s.trim().replace(/[/\s]+/g, "-");
export const idKehadiranSecurity = (tanggal: string, shift: string, nama: string) => `${tanggal}_${shift.replace(" ", "")}_${slug(nama)}`;
const geserTgl = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const shiftSebelumnya = (tanggal: string, shift: ShiftSecurity): { tanggal: string; shift: ShiftSecurity } =>
  shift === "Shift 1" ? { tanggal: geserTgl(tanggal, -1), shift: "Shift 2" } : { tanggal, shift: "Shift 1" };

/** data_hari roster untuk tanggal-tanggal tertentu (1-2 dokumen bulan). */
export async function rosterUntuk(tanggal: string[]): Promise<Record<string, Record<string, string>>> {
  const bulan = Array.from(new Set(tanggal.map((t) => t.slice(0, 7))));
  const snaps = await Promise.all(bulan.map((b) => getDoc(doc(db, "security_monthly_schedules", b))));
  const gabung: Record<string, Record<string, string>> = {};
  snaps.forEach((s) => Object.assign(gabung, (s.exists() && s.data().data_hari) || {}));
  return gabung;
}
export const petugasDiRoster = (roster: Record<string, Record<string, string>>, tanggal: string, shift: ShiftSecurity) =>
  Object.entries(roster[tanggal] || {}).filter(([, label]) => String(label || "").includes(shift)).map(([nama]) => nama);

/**
 * Dipanggil saat serah terima selesai (TukarShiftSecurityPage & SerahTerimaGuard darurat). Gagal di sini tidak
 * membatalkan serah terima (pemanggil menangkap error). Pemindai & pembuat QR ikut dicatat walau tidak ada di roster
 * (tukar jadwal informal).
 */
export async function catatKehadiranTukarJaga(p: { tanggal: string; shift: ShiftSecurity; handoverId: string; pemindai?: string; petugasKeluar?: string; tanpaSerahTerima?: boolean; daerah: string }) {
  const sblm = shiftSebelumnya(p.tanggal, p.shift);
  const roster = await rosterUntuk([p.tanggal, sblm.tanggal]);
  const unik = (xs: (string | undefined)[]) => Array.from(new Set(xs.map((x) => (x || "").trim()).filter((x) => x && !x.startsWith("("))));
  const masuk = unik([...petugasDiRoster(roster, p.tanggal, p.shift), p.pemindai]);
  const keluar = unik([...petugasDiRoster(roster, sblm.tanggal, sblm.shift), p.petugasKeluar]);
  const batch = writeBatch(db);
  for (const nama of masuk) {
    batch.set(doc(db, "kehadiran_security", idKehadiranSecurity(p.tanggal, p.shift, nama)), {
      daerah: p.daerah, tanggal_shift: p.tanggal, shift: p.shift, nama, check_in: serverTimestamp(), handover_masuk: p.handoverId,
      ...(p.tanpaSerahTerima ? { tanpa_serah_terima: true } : {}),
    }, { merge: true });
  }
  for (const nama of keluar) {
    batch.set(doc(db, "kehadiran_security", idKehadiranSecurity(sblm.tanggal, sblm.shift, nama)), {
      daerah: p.daerah, tanggal_shift: sblm.tanggal, shift: sblm.shift, nama, check_out: serverTimestamp(), handover_keluar: p.handoverId,
    }, { merge: true });
  }
  await batch.commit();
  return { masuk, keluar };
}

/** Nama-nama Security (akun departemen Security + semua nama di roster bulan tanggal itu) -- dikecualikan dari validasi kehadiran. */
export async function namaSecurity(tanggal: string): Promise<Set<string>> {
  const [akun, roster] = await Promise.all([
    getDocs(query(collection(db, "users_master"), where("departemen", "==", "Security"))),
    getDoc(doc(db, "security_monthly_schedules", tanggal.slice(0, 7))),
  ]);
  const hasil = new Set<string>(akun.docs.map((d) => String(d.data().nama || "").trim().toLowerCase()).filter(Boolean));
  const dataHari = (roster.exists() && (roster.data().data_hari as Record<string, Record<string, string>>)) || {};
  Object.values(dataHari).forEach((perNama) => Object.keys(perNama || {}).forEach((n) => hasil.add(n.trim().toLowerCase())));
  return hasil;
}
