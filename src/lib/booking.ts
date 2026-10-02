// Booking Kendaraan & Ruangan (§80) -- koleksi `booking`, dibuat dari portal (tanpa login) dan dikelola
// Admin GA (/admin/booking). Keputusan user: langsung tercatat (tanpa persetujuan); bila jam bentrok
// langsung muncul pemberitahuan siapa pemesannya; perubahan/pembatalan mendadak diatur admin.
import { addDoc, collection, getDocs, query, serverTimestamp, Timestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import { daerahTulis } from "./daerah";

export type JenisBooking = "kendaraan" | "ruangan";

export interface ObjekBooking {
  id: string;
  nama: string;
}

/** Ruangan yang bisa dibooking (keputusan user, 3 Okt 2026). */
export const RUANGAN_BOOKING: ObjekBooking[] = [
  { id: "ruang-meeting-lt1", nama: "Ruang Meeting Lt 1" },
  { id: "ruang-meeting-lt3", nama: "Ruang Meeting Lt 3" },
  { id: "ruang-tamu-lt1", nama: "Ruang Tamu (Lt 1)" },
  { id: "ruang-kesehatan-lt3", nama: "Ruang Kesehatan (Lt 3)" },
];

export interface Booking {
  id: string;
  jenis: JenisBooking;
  objek_id: string;
  objek_nama: string;
  nama_pemesan: string;
  departemen?: string;
  mulai: Timestamp;
  sampai: Timestamp;
  keperluan: string;
  status: "aktif" | "dibatalkan";
  dibuat_pada?: Timestamp | null;
  dibatalkan_oleh?: string;
  alasan_batal?: string;
  diubah_oleh?: string;
}

const FMT_TGL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });
const FMT_JAM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Nilai <input type="datetime-local"> ("YYYY-MM-DDTHH:MM") dibaca sebagai jam WITA. */
export const waktuDariInput = (v: string) => new Date(`${v}:00+08:00`);
/** Date -> nilai datetime-local dalam WITA. */
export const keInputWITA = (d: Date) => `${FMT_TGL.format(d)}T${FMT_JAM.format(d)}`;

/** "Jum, 3 Okt 09:00–12:00" (tanggal kedua ditulis bila beda hari). */
export function rentangWaktu(mulai: Date, sampai: Date): string {
  const tgl = (d: Date) => d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Makassar" });
  return FMT_TGL.format(mulai) === FMT_TGL.format(sampai)
    ? `${tgl(mulai)} ${FMT_JAM.format(mulai)}–${FMT_JAM.format(sampai)}`
    : `${tgl(mulai)} ${FMT_JAM.format(mulai)} – ${tgl(sampai)} ${FMT_JAM.format(sampai)}`;
}

/** Booking aktif untuk satu objek yang belum selesai sejak `sejak` (butuh index objek_id + sampai). */
export async function bookingObjek(objekId: string, sejak: Date): Promise<Booking[]> {
  const snap = await getDocs(query(collection(db, "booking"), where("objek_id", "==", objekId), where("sampai", ">", Timestamp.fromDate(sejak))));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking))
    .filter((b) => b.status === "aktif")
    .sort((a, b) => a.mulai.toMillis() - b.mulai.toMillis());
}

/** Booking aktif yang bertabrakan dengan rentang [mulai, sampai) -- kecuali dirinya sendiri (saat ubah jadwal). */
export async function cariBentrok(objekId: string, mulai: Date, sampai: Date, kecualiId?: string): Promise<Booking[]> {
  return (await bookingObjek(objekId, mulai)).filter((b) => b.id !== kecualiId && b.mulai.toDate() < sampai);
}

export async function buatBooking(p: { jenis: JenisBooking; objek: ObjekBooking; nama: string; departemen: string; mulai: Date; sampai: Date; keperluan: string }) {
  await addDoc(collection(db, "booking"), {
    daerah: daerahTulis(),
    jenis: p.jenis,
    objek_id: p.objek.id,
    objek_nama: p.objek.nama,
    nama_pemesan: p.nama.trim(),
    departemen: p.departemen || "-",
    mulai: Timestamp.fromDate(p.mulai),
    sampai: Timestamp.fromDate(p.sampai),
    keperluan: p.keperluan.trim(),
    status: "aktif",
    dibuat_pada: serverTimestamp(),
  });
}
