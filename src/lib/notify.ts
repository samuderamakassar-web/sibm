/**
 * src/lib/notify.ts
 * ------------------------------------------------------------------
 * Modul helper notifikasi terpusat untuk Portal SIBM.
 * Dipakai di semua halaman yang butuh mengirim Email saat status
 * berubah (Overtime, ATK, Helpdesk, Paket, SBO, dll).
 *
 * Kenapa dipusatkan di sini (bukan ditulis ulang tiap halaman)?
 * - 1 tempat untuk ganti provider / API key di kemudian hari
 * - Konsisten format pesan & penanganan error
 * - Mudah di-mock/disabled saat development
 *
 * CATATAN: notifikasi WhatsApp (via Fonnte) SUDAH DIHAPUS TOTAL dari modul
 * ini (dan dari semua pemanggilnya) karena token Fonnte yang dipakai app
 * ini kadaluarsa/invalid ("invalid token") dan integrasinya dirasa terlalu
 * ribet buat dikelola sehari-hari -- semua notifikasi sekarang HANYA lewat
 * Email (EmailJS). Kalau nanti mau diaktifkan lagi, lihat riwayat git file
 * ini buat referensi implementasi lamanya.
 *
 * PRASYARAT SEBELUM DIPAKAI:
 * 1. Daftar akun EmailJS (https://www.emailjs.com) -> dapatkan
 *    Service ID, Template ID, Public Key
 * 2. Isi environment variable di file .env.local (JANGAN commit ke git):
 *
 *    NEXT_PUBLIC_EMAILJS_SERVICE_ID=service_xxxxxxx
 *    NEXT_PUBLIC_EMAILJS_TEMPLATE_ID=template_xxxxxxx
 *    NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxx
 *
 *    (Karena app ini "output: export" / static, key terpaksa ada di
 *    sisi klien. Ini sesuai batasan yang sudah dijelaskan di laporan
 *    analisis -- untuk keamanan lebih baik, migrasikan pemanggilan
 *    ini ke Firebase Cloud Functions di tahap lanjutan.)
 *
 * 3. Install dependency EmailJS:
 *      npm install @emailjs/browser
 * ------------------------------------------------------------------
 */

import emailjs from "@emailjs/browser";

// ============================================================
// KONFIGURASI (ambil dari environment variable)
// ============================================================
const EMAILJS_SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || "";
const EMAILJS_TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || "";
const EMAILJS_PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || "";

// Set false untuk mematikan pengiriman notifikasi sementara
// (misalnya saat development lokal, supaya tidak spam WA/Email asli)
const NOTIFIKASI_AKTIF = true;

// ============================================================
// TIPE DATA
// ============================================================
export interface HasilNotifikasi {
  sukses: boolean;
  pesanError?: string;
}

// ============================================================
// 📧 KIRIM EMAIL (via EmailJS)
// ============================================================
/**
 * Kirim email notifikasi.
 * @param emailTujuan Alamat email penerima
 * @param subjek Judul email
 * @param pesan Isi pesan (plain text, ditampilkan sesuai template EmailJS)
 * @param namaPenerima Opsional, untuk personalisasi template
 */
export async function kirimEmail(
  emailTujuan: string,
  subjek: string,
  pesan: string,
  namaPenerima?: string
): Promise<HasilNotifikasi> {
  if (!NOTIFIKASI_AKTIF) {
    console.log("[notify] Email dinonaktifkan (dev mode). Tujuan:", emailTujuan, "Subjek:", subjek);
    return { sukses: true };
  }

  if (!emailTujuan) {
    return { sukses: false, pesanError: "Alamat email tujuan kosong." };
  }

  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    console.error("[notify] Konfigurasi EmailJS belum lengkap.");
    return { sukses: false, pesanError: "Konfigurasi EmailJS belum lengkap." };
  }

  try {
    // Sesuaikan nama variabel (to_email, subject, message, to_name) dengan
    // nama variabel {{...}} yang dipakai di template EmailJS Anda.
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email: emailTujuan,
        to_name: namaPenerima || "",
        subject: subjek,
        message: pesan,
      },
      { publicKey: EMAILJS_PUBLIC_KEY }
    );

    return { sukses: true };
  } catch (error) {
    console.error("[notify] Error kirim Email:", error);
    return { sukses: false, pesanError: "Terjadi kesalahan saat mengirim email." };
  }
}
