// Keluar sementara karyawan & kunci kendaraan kantor (§144).
// Karyawan yang check-in tetap ber-status "Di Dalam Area" (validasi 09:00, anti check-in ganda & lembur tetap jalan),
// tetapi diberi penanda `sedang_keluar` -> TIDAK dihitung berada di gedung. Sumber penanda:
//   1. Buku Tamu ("Keluar sebentar": tujuan opsional + moda; kendaraan kantor -> log armada Keluar Beroperasi)
//   2. Parkir (Security) & Armada (Driver): kendaraan Keluar dengan karyawan/driver X -> X ditandai sedang keluar;
//      kendaraan kembali (Tiba/Pulang) -> X ditandai kembali.
// Kendaraan kantor yang status terakhirnya Keluar/Bengkel tidak boleh dikeluarkan lagi oleh siapa pun (modal info).

import { addDoc, arrayUnion, collection, getDocs, limitToLast, orderBy, query, serverTimestamp, Timestamp, updateDoc, where, doc } from "firebase/firestore";
import { db } from "./firebase";
import { daerahTulis } from "./daerah";

export const MODA_KELUAR = ["Kendaraan kantor", "Mobil pribadi", "Motor pribadi", "Ojek / taksi online", "Jalan kaki / lainnya"] as const;
export type ModaKeluar = (typeof MODA_KELUAR)[number];
export const STATUS_KELUAR_KENDARAAN = "Keluar Beroperasi";
export const STATUS_TIBA_KENDARAAN = "Tiba di Kantor (Standby)";
export const kendaraanDiLuar = (status?: string) => status === "Keluar Beroperasi" || status === "Masuk Bengkel / Service";

export interface PemakaiKendaraan { kendaraan: string; status: string; oleh: string; tujuan: string; sejak: Date | null }

/** Status terakhir 1 kendaraan (index kendaraan + waktu_catat ASC -> limitToLast). null bila tidak sedang dipakai. */
export async function kendaraanSedangDipakai(kendaraanNama: string): Promise<PemakaiKendaraan | null> {
  const s = await getDocs(query(collection(db, "operational_vehicle_logs"), where("kendaraan", "==", kendaraanNama), orderBy("waktu_catat", "asc"), limitToLast(1)));
  const x = s.docs[0]?.data();
  if (!x || !kendaraanDiLuar(x.status_kendaraan)) return null;
  return { kendaraan: kendaraanNama, status: x.status_kendaraan, oleh: x.driver_bertugas || "-", tujuan: x.tujuan_keperluan || "-", sejak: x.waktu_catat?.toDate?.() || null };
}
export const pesanDipakai = (p: PemakaiKendaraan) =>
  `${p.kendaraan.split(" - ")[0]} sedang ${p.status === "Masuk Bengkel / Service" ? "di bengkel" : "digunakan"} oleh ${p.oleh}${p.sejak ? ` sejak ${p.sejak.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" })}` : ""}${p.tujuan && p.tujuan !== "-" ? ` (tujuan: ${p.tujuan})` : ""}. Tunggu sampai kendaraan dicatat kembali.`;

const norm = (s?: string) => (s || "").trim().toLowerCase();
async function sesiTerbuka(nama: string) {
  const s = await getDocs(query(collection(db, "security_visitor_logs"), where("status", "==", "Di Dalam Area")));
  return s.docs.filter((d) => norm(d.data().nama) === norm(nama));
}

/** Tandai karyawan sedang keluar (semua sesi terbuka atas nama itu). Tidak ada sesi -> tidak apa-apa (belum check-in). */
export async function tandaiKeluar(nama: string, info: { tujuan?: string; moda: string; kendaraan?: string; oleh: string }): Promise<number> {
  const sesi = await sesiTerbuka(nama);
  await Promise.all(sesi.filter((d) => !d.data().sedang_keluar).map((d) => updateDoc(doc(db, "security_visitor_logs", d.id), {
    sedang_keluar: true, keluar_tujuan: (info.tujuan || "").trim(), keluar_moda: info.moda, keluar_kendaraan: info.kendaraan || "",
    keluar_sejak: serverTimestamp(), keluar_dicatat_oleh: info.oleh,
  })));
  return sesi.length;
}

/** Tandai kembali: penanda dilepas & perjalanan disimpan di riwayat_keluar (untuk rekap). */
export async function tandaiKembali(nama: string, oleh: string): Promise<void> {
  const sesi = await sesiTerbuka(nama);
  await Promise.all(sesi.filter((d) => d.data().sedang_keluar).map((d) => {
    const x = d.data();
    return updateDoc(doc(db, "security_visitor_logs", d.id), {
      sedang_keluar: false,
      riwayat_keluar: arrayUnion({ tujuan: x.keluar_tujuan || "", moda: x.keluar_moda || "", kendaraan: x.keluar_kendaraan || "", keluar: x.keluar_sejak || null, kembali: Timestamp.now(), oleh }),
    });
  }));
}

/** Log armada dari Buku Tamu (kendaraan kantor dibawa karyawan). */
export async function catatKendaraanDariBukuTamu(kendaraan: string, status: string, karyawan: string, tujuan: string, petugas: string) {
  await addDoc(collection(db, "operational_vehicle_logs"), {
    daerah: daerahTulis(), petugas_security: `${petugas} (Buku Tamu)`, waktu_catat: serverTimestamp(), kendaraan, status_kendaraan: status,
    driver_bertugas: karyawan, tujuan_keperluan: tujuan || "-", kilometer_kendaraan: "Tidak dicatat",
  });
}
