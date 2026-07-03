/**
 * src/lib/notify.ts
 * ------------------------------------------------------------------
 * Modul helper notifikasi terpusat untuk Portal SIBM.
 * Dipakai di semua halaman yang butuh mengirim WhatsApp / Email saat
 * status berubah (Overtime, ATK, Helpdesk, Paket, Tamu, SBO, dll).
 *
 * Kenapa dipusatkan di sini (bukan ditulis ulang tiap halaman)?
 * - 1 tempat untuk ganti provider / API key di kemudian hari
 * - Konsisten format pesan & penanganan error
 * - Mudah di-mock/disabled saat development
 *
 * PRASYARAT SEBELUM DIPAKAI:
 * 1. Daftar akun Fonnte (https://fonnte.com) -> dapatkan Device Token
 * 2. Daftar akun EmailJS (https://www.emailjs.com) -> dapatkan
 *    Service ID, Template ID, Public Key
 * 3. Isi environment variable di file .env.local (JANGAN commit ke git):
 *
 *    NEXT_PUBLIC_FONNTE_TOKEN=xxxxxxxxxxxxxxxx
 *    NEXT_PUBLIC_EMAILJS_SERVICE_ID=service_xxxxxxx
 *    NEXT_PUBLIC_EMAILJS_TEMPLATE_ID=template_xxxxxxx
 *    NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxx
 *
 *    (Karena app ini "output: export" / static, key terpaksa ada di
 *    sisi klien. Ini sesuai batasan yang sudah dijelaskan di laporan
 *    analisis -- untuk keamanan lebih baik, migrasikan pemanggilan
 *    ini ke Firebase Cloud Functions di tahap lanjutan.)
 *
 * 4. Install dependency EmailJS (Fonnte cukup pakai fetch biasa):
 *      npm install @emailjs/browser
 * ------------------------------------------------------------------
 */

import emailjs from "@emailjs/browser";

// ============================================================
// KONFIGURASI (ambil dari environment variable)
// ============================================================
const FONNTE_TOKEN = process.env.NEXT_PUBLIC_FONNTE_TOKEN || "";
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
// 📱 KIRIM WHATSAPP (via Fonnte)
// ============================================================
/**
 * Kirim pesan WhatsApp ke satu nomor.
 * @param noTujuan Nomor WA format 62xxxxxxxxxx (gunakan normalizeNoWA di halaman karyawan)
 * @param pesan Isi pesan (boleh multi-baris)
 */
export async function kirimWA(noTujuan: string, pesan: string): Promise<HasilNotifikasi> {
  if (!NOTIFIKASI_AKTIF) {
    console.log("[notify] WA dinonaktifkan (dev mode). Tujuan:", noTujuan, "Pesan:", pesan);
    return { sukses: true };
  }

  if (!noTujuan) {
    return { sukses: false, pesanError: "Nomor WA tujuan kosong." };
  }

  if (!FONNTE_TOKEN) {
    console.error("[notify] NEXT_PUBLIC_FONNTE_TOKEN belum diset.");
    return { sukses: false, pesanError: "Token Fonnte belum dikonfigurasi." };
  }

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: FONNTE_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        target: noTujuan,
        message: pesan,
      }),
    });

    const data = await response.json();

    if (!response.ok || data?.status === false) {
      console.error("[notify] Gagal kirim WA:", data);
      return { sukses: false, pesanError: data?.reason || "Gagal mengirim WhatsApp." };
    }

    return { sukses: true };
  } catch (error) {
    console.error("[notify] Error kirim WA:", error);
    return { sukses: false, pesanError: "Terjadi kesalahan jaringan saat kirim WhatsApp." };
  }
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

// ============================================================
// 🧩 TEMPLATE PESAN SIAP PAKAI (opsional, biar konsisten antar halaman)
// ============================================================
export const template = {
  paketDiterima: (namaKaryawan: string, keterangan: string) =>
    `Halo ${namaKaryawan}, ada paket/dokumen baru untuk Anda yang sudah diterima Security (${keterangan}). Silakan diambil di pos Security. - SIBM PT Samudera`,

  overtimeDisetujui: (namaPemohon: string, tanggal: string) =>
    `Halo ${namaPemohon}, pengajuan overtime gedung Anda tanggal ${tanggal} telah *DISETUJUI* Admin GA. - SIBM`,

  overtimeDitolak: (namaPemohon: string, tanggal: string, alasan?: string) =>
    `Halo ${namaPemohon}, pengajuan overtime gedung Anda tanggal ${tanggal} *DITOLAK* Admin GA.${alasan ? ` Alasan: ${alasan}` : ""} - SIBM`,

  helpdeskUpdate: (namaPelapor: string, statusBaru: string, kodeTiket: string) =>
    `Halo ${namaPelapor}, tiket kerusakan Anda (${kodeTiket}) sekarang berstatus: *${statusBaru}*. - SIBM`,

  atkSiapDiambil: (namaPemohon: string, kodeResi: string) =>
    `Halo ${namaPemohon}, permintaan ATK Anda (${kodeResi}) sudah *SIAP DIAMBIL* di gudang GA. - SIBM`,

  tamuCheckIn: (namaKaryawan: string, namaTamu: string) =>
    `Halo ${namaKaryawan}, tamu Anda (${namaTamu}) sudah check-in di lobi dan sedang menunggu. - SIBM`,

  // Tahap 3 -- notifikasi ke pengelola (Admin GA / QHSE)
  requestBaruMasuk: (jenisRequest: string, namaPemohon: string, detail: string) =>
    `🔔 Request baru masuk: *${jenisRequest}*\nDari: ${namaPemohon}\n${detail}\n\nSilakan diproses di Dashboard Admin GA. - SIBM`,

  sboBaruMasuk: (namaPelapor: string, kategori: string, lokasi: string) =>
    `⚠️ Laporan SBO baru masuk!\nKategori: *${kategori}*\nLokasi: ${lokasi}\nPelapor: ${namaPelapor}\n\nMohon segera ditinjau di Dashboard QHSE. - SIBM`,
};