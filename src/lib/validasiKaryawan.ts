// Validasi Karyawan oleh Security (§59) -- menggantikan pengingat overtime 9 jam lama.
//
// Dua jenis kartu validasi di collection `validasi_karyawan` (dibuat oleh cron
// scripts/validasi-karyawan.mjs, dijawab Security di /dashboard/security/validasi):
//   1. "belum_input" -- karyawan Master Data yang BELUM check-in Buku Tamu (cek 09:00 & 13:00
//      Senin-Jumat). Security memilih: lupa diinput (check-in susulan, jam bisa diatur) atau
//      tidak masuk (alasan + foto wajib, didatangi ke mejanya).
//   2. "lembur" -- karyawan yang masih "Di Dalam Area" lewat 18:00. Security memilih: lanjut
//      lembur (foto + area -> tercatat di ga_overtime_requests, jam selesai terisi otomatis saat
//      check-out) atau akan pulang (ditanya ulang bila 45 menit kemudian belum check-out).
//
// PENTING: aturan jam di bawah ini DIDUPLIKASI di scripts/validasi-karyawan.mjs (Node ESM tidak
// bisa import TypeScript) -- kalau diubah, ubah juga di sana.
import {
  collection, doc, getDocs, limit, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { kirimEmail } from "./notify";
import { buildLemburSelesaiEmailHtml } from "./emailTemplates";
import { daerahTulis } from "@/lib/daerah";

export const JAM_MULAI_LEMBUR = "18:00";
export const BATAS_LEMBUR_JAM = 4; // PP 35/2021: lembur maks. 4 jam/hari
export const BATAS_DI_GEDUNG_JAM = 12;
export const MENIT_TANYA_ULANG_PULANG = 45;
/** Kartu "lembur" tampil sejak jam mulai lembur (18:00, keputusan user §93) sampai dijawab Security.
 *  Bisa diberi jeda (menit) bila kelak perlu. */
export const MENIT_TAMPIL_KARTU_LEMBUR = 0;
export const ALASAN_TIDAK_MASUK = ["Izin", "Sakit", "Cuti", "Dinas luar", "Tanpa kabar"] as const;

export type JenisValidasi = "belum_input" | "lembur";
export type StatusValidasi =
  | "menunggu"
  | "diinput_susulan" // belum_input -> Security check-in susulan
  | "tidak_masuk" // belum_input -> ditandai tidak masuk
  | "sudah_hadir" // belum_input -> ternyata sudah check-in (diselesaikan otomatis)
  | "libur" // belum_input -> tanggal ditandai hari libur setelah kartu dibuat (§71)
  | "lanjut" // lembur -> lanjut lembur, menunggu check-out
  | "akan_pulang" // lembur -> akan pulang, menunggu check-out
  | "selesai"; // lembur -> sudah check-out

export interface ValidasiKaryawan {
  id: string;
  jenis: JenisValidasi;
  tanggal: string;
  nama: string;
  departemen?: string;
  status: StatusValidasi;
  visitor_log_id?: string;
  waktu_masuk?: Timestamp | null;
  foto_url?: string;
  alasan?: string;
  keterangan?: string;
  area?: string;
  overtime_id?: string;
  divalidasi_oleh?: string;
  waktu_validasi?: Timestamp | null;
  ditanya_ulang?: number;
  dibuat_pada?: Timestamp | null;
}

const FMT_TANGGAL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });
const FMT_JAM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const tanggalWITA = (d: Date) => FMT_TANGGAL.format(d);
export const jamWITA = (d: Date) => FMT_JAM.format(d);
/** Timestamp untuk jam "HH:MM" WITA pada tanggal ISO tertentu. */
export const waktuWITA = (tanggalISO: string, jam: string) => new Date(`${tanggalISO}T${jam}:00+08:00`);

/** Lembur dihitung sejak 18:00 tanggal check-in, atau sejak check-in kalau masuknya setelah 18:00. */
export function mulaiLembur(waktuMasuk: Date): Date {
  const batas = waktuWITA(tanggalWITA(waktuMasuk), JAM_MULAI_LEMBUR);
  return waktuMasuk > batas ? waktuMasuk : batas;
}

/** Waktu kartu lembur sesi ini mulai tampil ke Security. */
export const tampilKartuLembur = (waktuMasuk: Date) => new Date(mulaiLembur(waktuMasuk).getTime() + MENIT_TAMPIL_KARTU_LEMBUR * 60000);

/** Jam tagih: dibulatkan ke ATAS per jam (keputusan user). 0 kalau belum melewati jam mulai. */
export function jamTagihLembur(mulai: Date, selesai: Date): number {
  const menit = (selesai.getTime() - mulai.getTime()) / 60000;
  return menit <= 0 ? 0 : Math.ceil(menit / 60);
}

export const normalNama = (n: string) => (n || "").trim().toLowerCase();
const slug = (s: string) => (s || "").trim().replace(/[/\s]+/g, "-");
export const idValidasiMasuk = (tanggal: string, nama: string) => `${tanggal}_masuk_${slug(nama)}`;
export const idValidasiLembur = (tanggal: string, visitorLogId: string) => `${tanggal}_lembur_${visitorLogId}`;

/**
 * Dipanggil Buku Tamu saat karyawan di-check-out. Kalau sesi ini punya validasi lembur:
 * - "lanjut" -> isi jam selesai + jam tagih di ga_overtime_requests, kirim email bukti ke karyawan.
 * - "menunggu"/"akan_pulang" -> cukup ditutup ("selesai").
 * Gagal di sini TIDAK membatalkan check-out (cron juga punya jalur cadangan yang sama).
 */
export async function selesaikanLemburSaatCheckout(visitorLogId: string, waktuMasuk: Date | null, waktuKeluar: Date) {
  if (!waktuMasuk) return;
  const tanggal = tanggalWITA(waktuMasuk);
  // Kartu "belum_input" yang dicatat susulan juga menyimpan visitor_log_id -> saring jenis "lembur".
  const snap = await getDocs(query(collection(db, "validasi_karyawan"), where("visitor_log_id", "==", visitorLogId)));
  const d = snap.docs.find((x) => x.data().jenis === "lembur");
  if (!d) return;
  const v = { id: d.id, ...d.data() } as ValidasiKaryawan;
  if (v.status === "selesai") return;

  if (v.status === "lanjut" && v.overtime_id) {
    const mulai = mulaiLembur(waktuMasuk);
    const jamTagih = jamTagihLembur(mulai, waktuKeluar);
    await updateDoc(doc(db, "ga_overtime_requests", v.overtime_id), {
      jam_selesai: jamWITA(waktuKeluar),
      tanggal_selesai: tanggalWITA(waktuKeluar),
      waktu_selesai: Timestamp.fromDate(waktuKeluar),
      durasi_tagih_jam: jamTagih,
      status: "Tercatat",
    });
    try {
      const emp = await getDocs(query(collection(db, "employees_directory"), where("nama", "==", v.nama), limit(1)));
      const email = emp.empty ? "" : (emp.docs[0].data().email as string) || "";
      if (email) {
        await kirimEmail(email, "Lembur Gedung Tercatat", buildLemburSelesaiEmailHtml({
          nama: v.nama, departemen: v.departemen || "-", area: v.area || "-", tanggal,
          jamMulai: jamWITA(mulai), jamSelesai: jamWITA(waktuKeluar), jamTagih, divalidasiOleh: v.divalidasi_oleh || "Security",
        }), v.nama);
      }
    } catch (err) {
      console.error("[lembur] Gagal kirim email bukti lembur:", err);
    }
  }
  await updateDoc(doc(db, "validasi_karyawan", v.id), {
    status: "selesai",
    waktu_keluar: Timestamp.fromDate(waktuKeluar),
  });
}

/**
 * "Lanjut lembur": sambungkan ke pengajuan portal hari itu (kalau ada) atau buat catatan baru.
 * Jam mulai selalu 18:00 (atau jam check-in kalau masuk setelah 18:00) -- keputusan user.
 */
export async function catatLanjutLembur(v: ValidasiKaryawan, p: { area: string; fotoUrl: string; petugas: string }) {
  const waktuMasuk = v.waktu_masuk?.toDate() || null;
  const mulai = waktuMasuk ? mulaiLembur(waktuMasuk) : waktuWITA(v.tanggal, JAM_MULAI_LEMBUR);
  const validasi = { oleh: p.petugas, foto_url: p.fotoUrl, waktu: serverTimestamp() };

  const ada = await getDocs(query(collection(db, "ga_overtime_requests"), where("nama_pemohon", "==", v.nama), where("tanggal", "==", v.tanggal), limit(1)));
  let overtimeId: string;
  if (!ada.empty) {
    overtimeId = ada.docs[0].id;
    const lama = ada.docs[0].data();
    await updateDoc(doc(db, "ga_overtime_requests", overtimeId), {
      jam_mulai_rencana: lama.jam_mulai || "",
      jam_selesai_rencana: lama.jam_selesai || "",
      jam_mulai: jamWITA(mulai),
      jam_selesai: "",
      area_ruangan: lama.area_ruangan || p.area,
      status: "Berlangsung",
      sumber: "portal+validasi_security",
      validasi_security: validasi,
      visitor_log_id: v.visitor_log_id || "",
    });
  } else {
    const baru = await addDoc(collection(db, "ga_overtime_requests"), { daerah: daerahTulis(),
      nama_pemohon: v.nama,
      departemen: v.departemen || "-",
      area_ruangan: p.area,
      tanggal: v.tanggal,
      jam_mulai: jamWITA(mulai),
      jam_selesai: "",
      alasan: "Lembur divalidasi Security",
      status: "Berlangsung",
      sumber: "validasi_security",
      validasi_security: validasi,
      visitor_log_id: v.visitor_log_id || "",
      waktu_request: serverTimestamp(),
    });
    overtimeId = baru.id;
  }
  await updateDoc(doc(db, "validasi_karyawan", v.id), {
    status: "lanjut", area: p.area, foto_url: p.fotoUrl, overtime_id: overtimeId,
    divalidasi_oleh: p.petugas, waktu_validasi: serverTimestamp(),
  });
}

/** Check-in susulan (lupa diinput) dengan jam yang diatur Security. */
export async function checkInSusulan(v: ValidasiKaryawan, p: { jamMasuk: string; platKendaraan?: string; petugas: string }) {
  const waktu = waktuWITA(v.tanggal, p.jamMasuk);
  const log = await addDoc(collection(db, "security_visitor_logs"), { daerah: daerahTulis(),
    nama: v.nama,
    instansi_dept: v.departemen || "-",
    no_kendaraan: p.platKendaraan || "",
    tujuan: "Bekerja / Operasional",
    bertemu_dengan: "-",
    jenis: "Karyawan",
    foto_bukti: null,
    status: "Di Dalam Area",
    waktu_masuk: Timestamp.fromDate(waktu),
    waktu_keluar: null,
    pic_bertugas: p.petugas,
    input_susulan: true,
    dicatat_pada: serverTimestamp(),
  });
  await setDoc(doc(db, "validasi_karyawan", v.id), { daerah: daerahTulis(),
    status: "diinput_susulan", visitor_log_id: log.id, waktu_masuk: Timestamp.fromDate(waktu),
    divalidasi_oleh: p.petugas, waktu_validasi: serverTimestamp(),
  }, { merge: true });
}
