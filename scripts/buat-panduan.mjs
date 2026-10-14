// Generator panduan PDF SIBM: tulis HTML per peran -> dicetak Chrome headless (lihat cetak.ps1).
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const TGL = "Oktober 2026";
const LOGO = "https://sibm-app.web.app/logo-samudera.png";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// **tebal** sederhana
const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

const UMUM_MASUK = {
  h: "Masuk ke aplikasi",
  steps: [
    "Buka **sibm-app.web.app** di Chrome (HP atau komputer).",
    "Tekan tombol **Login** di portal, isi email & kata sandi akun Anda, lalu **Masuk**. Aplikasi langsung membuka dashboard sesuai bagian Anda.",
    "Di HP: menu Chrome ⋮ → **Tambahkan ke layar utama** agar aplikasi bisa dibuka seperti aplikasi biasa dan menerima notifikasi.",
    "Izinkan **notifikasi** saat diminta — pengingat tugas dikirim lewat notifikasi.",
  ],
  tips: [
    "Tutup lalu buka lagi aplikasi setiap mulai kerja agar memakai versi terbaru.",
    "Jangan aktifkan terjemahan otomatis Chrome (menu ⋮ → Terjemahkan → Jangan pernah terjemahkan situs ini). Terjemahan membuat halaman error.",
    "Gunakan akun sendiri. Lupa kata sandi / akun bermasalah: hubungi Admin GA.",
  ],
};

const PANDUAN = [
  {
    file: "01-Panduan-Input-Dokumen-Legal",
    judul: "Panduan Input Dokumen Legal",
    untuk: "Admin GA & Magang GA",
    intro: "Bank Dokumen Legal menyimpan legalitas, perizinan, perjanjian, berita acara, sertifikat, surat kuasa, polis dan surat resmi untuk setiap perusahaan. File tersimpan privat — hanya Admin GA & Magang GA yang bisa membukanya.",
    bagian: [
      UMUM_MASUK,
      { h: "Membuka Bank Dokumen Legal", steps: ["Dashboard Admin → kartu **Bank Dokumen Legal**.", "Baris atas berisi kartu tiap perusahaan (MJS, SML, KEJS, SKEL, SAG, SP, SKI, MKT, SPI). Klik satu kartu untuk melihat dokumen PT itu saja; **Semua perusahaan** untuk seluruhnya.", "Gunakan filter **kategori**, **status** (aktif, perlu diperpanjang, kadaluarsa, tanpa masa berlaku) dan kotak **cari** (nama, nomor, kode arsip, penerbit, PIC)."] },
      { h: "Menambah dokumen baru", steps: ["Tekan **Tambah Dokumen**.", "**Perusahaan**: pilih satu atau lebih PT. Bila PT tidak ada di daftar, ketik di kolom **Lainnya**.", "**Kategori**: Legalitas Perusahaan, Perizinan, Perjanjian/Kontrak, Berita Acara, Sertifikat & Riksa Uji, Surat Kuasa, Polis Asuransi, atau Surat Resmi.", "Isi **Nama dokumen** (wajib), **Nomor dokumen**, **Penerbit / pihak lawan**, **Tanggal terbit**, **PIC internal** dan **Lokasi arsip fisik** (mis. Lemari GA-2, map MJS).", "Pilih **Tingkat risiko**: Kritis (gedung/usaha bisa terhenti), Penting, atau Biasa.", "Masa berlaku: isi **Mulai berlaku** & **Berakhir**. Untuk akta, berita acara, surat resmi centang **Tanpa masa berlaku**.", "Pilih **File scan** (PDF / gambar / Word / Excel, maks 20 MB), isi catatan bila perlu, lalu **Simpan dokumen**.", "Aplikasi membuat **kode arsip** otomatis, mis. MJS-IZN-2026-001. Tulis kode yang sama di map / sampul dokumen fisik."], tips: ["Scan dokumen utuh (semua halaman) dalam satu PDF, posisi tegak & terbaca.", "Satu dokumen milik beberapa PT cukup diinput sekali dengan memilih semua PT terkait."] },
      { h: "Memperpanjang / mengganti versi", steps: ["Pada dokumen, tekan **Perbarui / perpanjang** (atau **Unggah versi baru** untuk dokumen tanpa masa berlaku).", "Isi masa berlaku baru, catatan (mis. diperpanjang via notaris X) dan pilih file baru, lalu simpan.", "Versi lama otomatis masuk **Riwayat** dan tetap bisa dibuka."] },
      { h: "Melengkapi data lama", steps: ["Dokumen yang diinput sebelum Oktober 2026 muncul di kartu **Belum ditentukan**.", "Tekan **Ubah data**, pilih perusahaan, kategori, nomor, penerbit, PIC, lokasi arsip, lalu **Simpan data**. Kode arsip dibuat otomatis.", "Bila file lama tidak bisa dibuka, unggah ulang scan-nya lewat **Perbarui / perpanjang** agar tersimpan di penyimpanan privat."] },
      { h: "Proses perpanjangan", steps: ["Saat mulai mengurus, tekan **Mulai urus perpanjangan**: isi tanggal mulai, nomor pengajuan & catatan. Status menjadi **Sedang diurus** dan pengingat berhenti.", "Bila pengurusan melewati lama proses (bawaan 60 hari) status menjadi **Diurus · macet** dan pengingat aktif lagi.", "Setelah izin terbit tekan **Selesai — unggah izin baru**, isi masa berlaku & file. Proses ditutup otomatis.", "Isi **Lama pengurusan (hari)** di Ubah data (mis. SLF 90 hari) agar pengingat datang lebih awal: lama pengurusan + 30 hari. Perjanjian memakai **Masa pemberitahuan** + 14 hari."] },
      { h: "Syarat, kewajiban berkala & biaya", steps: ["Tombol **Syarat & kewajiban** → **Checklist syarat** (mis. KTP direksi, akta, gambar teknis). Centang saat terkumpul; direset otomatis tiap perpanjangan.", "**Kewajiban berkala** (mis. riksa uji lift tiap 12 bulan, laporan lingkungan tiap 6 bulan): isi nama, interval bulan & jatuh tempo berikutnya. Setelah dikerjakan tekan **Tandai selesai** — jatuh tempo maju otomatis.", "Isi **Biaya pengurusan** saat mengunggah versi baru; biaya tercatat di menu **Anggaran & Realisasi** (kategori Legal) untuk dialokasikan ke baris RAB.", "Kartu ringkasan di atas: dokumen kritis bermasalah, sedang diurus, kewajiban ≤ 30 hari, biaya legal tahun ini."] },
      { h: "Memindahkan file lama", steps: ["Login **cloudinary.com** → Settings → Security → aktifkan **Allow delivery of PDF and ZIP files** → Save.", "Di Bank Dokumen Legal tekan **Pindahkan file lama (N)** → Mulai. Tunggu sampai selesai, jangan tutup halaman.", "Setelah muncul pesan berhasil, kembali ke Cloudinary dan **matikan lagi** pengaturan tersebut."] },
      { h: "Pengingat & aturan", steps: ["Mulai 60 hari sebelum berakhir, Admin GA menerima pengingat (notifikasi & email) dan diulang berkala sampai dokumen diperpanjang.", "Status di daftar: **Aktif**, **Perlu diperpanjang** (≤ 60 hari), **Kadaluarsa**, **Tanpa masa berlaku**.", "**Magang GA** dapat menambah, memperbarui dan mengubah data, tetapi **tidak dapat menghapus** dokumen.", "Eksekutif Tenant hanya melihat daftar & status dokumen PT-nya, tanpa file."] },
    ],
  },
  {
    file: "02-Panduan-Security",
    judul: "Panduan Aplikasi untuk Security",
    untuk: "Security & Magang Security",
    intro: "Semua alur di aplikasi adalah SOP. Pekerjaan yang tidak tercatat dianggap belum dikerjakan.",
    bagian: [
      UMUM_MASUK,
      { h: "Tukar jaga (wajib)", steps: ["Petugas yang selesai jaga membuka **Tukar Shift / Jaga** dan menampilkan QR.", "Petugas pengganti datang **sebelum jam tukar jaga** dan memindai QR tersebut. Terlambat > 10 menit tercatat.", "Sebelum scan tukar jaga, menu lain terkunci. Kehadiran Security tercatat otomatis dari tukar jaga (tidak perlu validasi kehadiran)."] },
      { h: "Patroli Area", steps: ["Buka **Patroli Area**. Kartu atas menunjukkan shift, sesi berjalan & sesi yang sudah dilaporkan (minimal 2 dari 3 sesi per shift).", "Titik berlabel **KRITIS** wajib setiap sesi; titik lain bergilir sesuai daftar yang tampil.", "Bila **Scan QR lantai** aktif: buka lantai → **Scan QR (lantai)** → pindai label QR LANTAI di lantai itu → titik terbuka.", "Pada tiap titik tekan **Foto**, pilih kondisi (Aman / Ada temuan / Pintu terbuka / Kebocoran) → **Buka Kamera** → ambil foto di lokasi.", "Titik yang tidak sempat difoto wajib diberi alasan. Tekan **Review Hasil Patroli** → kirim.", "HP terkunci di tengah patroli? Buka lagi menu Patroli — titik yang sudah difoto dipulihkan otomatis.", "Setelah sesi terkirim tampil kartu hijau; form terbuka lagi saat sesi berikutnya mulai."], tips: ["Sesi yang lewat tanpa laporan dilaporkan otomatis ke Danru.", "Target: patroli minimal 2 sesi di ≥ 90% shift."] },
      { h: "Buku Tamu Digital", steps: ["**Input Kedatangan**: pilih jenis (Tamu Eksternal / Magang / Karyawan), isi data; tamu eksternal difoto.", "Tab **Di Dalam Area**: daftar orang yang ada di gedung.", "**Keluar sebentar**: isi tujuan (opsional) & kendaraan yang dipakai (kendaraan kantor / mobil / motor pribadi / ojek / jalan kaki). Orang tersebut tidak dihitung di gedung sampai ditekan **Kembali ✓**.", "Kendaraan kantor yang sedang dipakai orang lain akan ditolak dengan pemberitahuan \"sedang digunakan oleh …\".", "**Check-Out** saat orang meninggalkan gedung."] },
      { h: "Validasi Karyawan", steps: ["Kartu **belum tercatat masuk** muncul jam 09:00 & 13:00. Pilih **Input susulan** (sudah datang) atau **Tidak masuk** (alasan + foto wajib).", "Kartu yang tidak dijawab sampai 17:00 otomatis tercatat tidak hadir.", "Mulai 18:00: karyawan yang masih di gedung → **Lanjut lembur** (foto + area) atau **Akan pulang**.", "Driver yang ditandai tidak masuk otomatis berubah status (mis. IZIN)."] },
      { h: "Paket, kendaraan & lainnya", steps: ["**Manajemen Paket**: catat resi & kurir, foto paket; penerima mendapat email. Tandai saat diambil.", "**Log Kendaraan (Parkir)**: catat Keluar (tujuan & pembawa wajib), Tiba/Standby, Pulang, Service. Kendaraan yang sedang dipakai tidak bisa dikeluarkan lagi.", "Pengingat sore **\"Driver sudah pulang?\"**: pastikan, lalu ubah status di menu Parkir.", "Kartu **Booking ruangan** di dashboard: tekan **Konfirmasi** (catatan opsional) → pemesan menerima email.", "**Inspeksi APAR** bulanan: scan QR APAR → isi kondisi.", "**Siram Tanaman**: unggah foto bukti pada jendela waktunya.", "**Klaim Lembur**: input lembur back-up shift."] },
      { h: "Magang Security", steps: ["Menu magang: Buku Tamu & Paket (+ Handbook Magang).", "Akun magang tidak dapat menghapus data."] },
    ],
  },
  {
    file: "03-Panduan-OB-dan-CS",
    judul: "Panduan Aplikasi untuk OB & CS",
    untuk: "OB Pelayanan & CS Cleaning",
    intro: "Dashboard menyesuaikan peran tugas Anda (OB Pelayanan / CS Cleaning) yang diatur Admin GA.",
    bagian: [
      UMUM_MASUK,
      { h: "Kerjaan Rutin Harian (checklist)", steps: ["Lihat **Lokasi Shift Anda Hari Ini** di dashboard (area dari plotting Koordinator).", "Buka **Kerjaan Rutin Harian**, pilih area & sesi (Pagi / Siang / Sore), centang setiap item **begitu area selesai dikerjakan**.", "Target: checklist terisi ≥ 90% sesi."] },
      { h: "Permintaan pelayanan & cleaning", steps: ["Permintaan dari karyawan muncul di panel dashboard + notifikasi. OB melihat permintaan pelayanan, CS melihat permintaan cleaning.", "Tekan **Terima** segera (waktu respon tercatat), lalu **Selesai ✓** setelah dikerjakan.", "Target respon rata-rata ≤ 10 menit."] },
      { h: "Stock Opname Gudang", steps: ["Mengambil barang: tombol **−**, isi keperluan/area; ambil 5 atau lebih wajib foto.", "Barang datang: tombol **+**, isi sumber/nota & foto.", "Jumlah stok tidak bisa diubah lewat Edit — hanya lewat transaksi atau opname yang disetujui Koordinator.", "Opname bulanan: **Mulai opname fisik**, hitung rak demi rak, isi alasan setiap selisih, kirim untuk disetujui."] },
      { h: "Inspeksi kondisi aset (yang ditunjuk)", steps: ["Menu **Inspeksi Kondisi Aset** hanya muncul bagi petugas yang ditunjuk Koordinator.", "Fasilitas gedung (mingguan, per area): **✓ Semua aman**, atau **⚠ Ada temuan** → isi hanya item bermasalah dengan **foto & keterangan wajib**.", "Petugas utilitas teknis menilai genset, panel, pompa dll. secara lengkap tiap minggu."] },
      { h: "Lainnya", steps: ["**Klaim Lembur Bulan Ini**: input lembur Anda.", "**SOP & Instruksi Kerja**: baca dokumen terbaru.", "Panel **Kinerja Saya**: checklist terisi & respon permintaan Anda sendiri."] },
    ],
  },
  {
    file: "04-Panduan-Koordinator-OB",
    judul: "Panduan Aplikasi untuk Koordinator OB & CS",
    untuk: "Koordinator OB & CS",
    intro: "Koordinator memakai semua menu staf OB & CS ditambah menu pengaturan tim.",
    bagian: [
      UMUM_MASUK,
      { h: "Plotting Tugas Harian", steps: ["Dashboard → **Plotting Tugas Harian**: atur area tiap staf (atau gunakan generate jadwal otomatis 30 hari).", "Di halaman yang sama tunjuk **Petugas Inspeksi Fasilitas Gedung** (bergilir, boleh diri sendiri) dan **Petugas Inspeksi Utilitas Teknis**."] },
      { h: "Inspeksi alat kebersihan (2x sebulan)", steps: ["Menu **Inspeksi Kondisi Aset** → Peralatan Kebersihan, periode tanggal 1–15 dan 16–akhir bulan.", "**✓ Semua aman**, atau **⚠ Ada temuan** → pilih alat bermasalah, kondisi, foto & keterangan wajib.", "Pengingat datang mulai tanggal 10 dan 25 bila belum dikerjakan."] },
      { h: "Alat Kerja Tim", steps: ["Daftarkan alat (kode otomatis), ubah status **Rusak / Hilang / Afkir** dengan kronologi, cetak label.", "Filter per status untuk memantau alat."] },
      { h: "Stock opname & gudang", steps: ["Pimpin opname bulanan; periksa sampel fisik sebelum menyetujui. **Penyetuju tidak boleh orang yang menghitung.**", "Tindak lanjuti tanda **pemakaian tidak wajar** di daftar stok.", "Hanya Koordinator/Admin yang dapat menghapus barang."] },
      { h: "Deep cleaning", steps: ["**Jadwal Deep Cleaning**: buat & pantau tugas perawatan khusus."] },
    ],
  },
  {
    file: "05-Panduan-Driver",
    judul: "Panduan Aplikasi untuk Driver",
    untuk: "Driver",
    intro: "Status kendaraan & status Anda dilihat Security, Admin dan karyawan di portal secara langsung.",
    bagian: [
      UMUM_MASUK,
      { h: "Status kesiagaan", steps: ["Di Menu Driver tekan **Keluar Pos** saat bertugas di luar dan **Kembali Standby** saat tiba.", "Selesai tugas hari itu: ubah status menjadi **Pulang**. Pengingat sore 17:30 dikirim bila status masih Standby/Keluar."] },
      { h: "Bawa Armada", steps: ["Pilih kendaraan → **Keluar**: isi tujuan (wajib) & KM.", "Kendaraan yang sedang dipakai orang lain / di bengkel tidak bisa dikeluarkan — muncul pemberitahuan \"sedang digunakan oleh …\".", "Saat kembali tekan **Tiba / Standby** atau **Pulang**. Status \"Keluar\" yang tidak diperbarui > 2 jam akan diingatkan.", "Saat Anda keluar membawa kendaraan, Buku Tamu otomatis mencatat Anda \"sedang keluar\"."] },
      { h: "Inspeksi Mingguan", steps: ["Setiap minggu (sebaiknya Senin sebelum dipakai): isi semua item checklist kendaraan beserta foto."] },
      { h: "Servis, Emisi & Odometer", steps: ["Laporan servis: pilih jenis servis, isi **biaya dalam angka** (0 bila gratis/garansi), foto bukti.", "Catat hasil uji emisi & odometer."] },
      { h: "Lainnya", steps: ["**Riwayat Armada Saya**: semua perjalanan Anda.", "**Klaim Lembur / Perjalanan Dinas**: input lembur.", "Panel **Kinerja Saya**: inspeksi mingguan & perjalanan yang ditutup (target ≥ 95%)."] },
    ],
  },
  {
    file: "06-Panduan-QHSE",
    judul: "Panduan Aplikasi untuk QHSE",
    untuk: "QHSE",
    intro: "QHSE memantau temuan bahaya, APAR dan kondisi kendaraan.",
    bagian: [
      UMUM_MASUK,
      { h: "Safety Behavior Observation (SBO)", steps: ["Laporan bahaya dari portal masuk ke **Safety Behavior Observation** + notifikasi.", "Langkah wajib: **Tanggapi** (waktu tanggap tercatat) → tindak lanjut → **Close** dengan keterangan.", "Laporan tidak bisa ditutup sebelum ditanggapi."] },
      { h: "Inspeksi APAR", steps: ["Pantau riwayat & status inspeksi APAR per lantai (diisi Security tiap bulan)."] },
      { h: "Hasil Inspeksi Kendaraan", steps: ["Rekap uji emisi & jadwal servis armada untuk evaluasi keselamatan."] },
    ],
  },
  {
    file: "07-Panduan-Admin-GA",
    judul: "Panduan Aplikasi untuk Admin GA",
    untuk: "Admin GA & Magang GA",
    intro: "Dashboard Admin menampilkan pantauan tim, hal yang perlu tindakan, kehadiran & lembur, serta menu per bidang.",
    bagian: [
      UMUM_MASUK,
      { h: "Pantauan harian", steps: ["**Pantau laporan tim**: OB & CS, Security (log patroli, kepatuhan patroli, buku tamu dengan filter tanggal & export, paket, roster), Driver, Siram Tanaman, Tukar Shift.", "**Perlu tindakan**: overtime menunggu, tiket helpdesk terbuka, permintaan ATK, legalitas perlu diperpanjang, sewa laptop.", "**Kehadiran & lembur**: lembur tervalidasi & karyawan tidak masuk hari ini."] },
      { h: "Layanan & permintaan", steps: ["**Helpdesk**: ubah status tiket (selesai/batal terkunci), tidak dijalankan wajib alasan.", "**Gudang ATK**: Mulai siapkan → Tandai selesai (pemohon dapat email), ubah barang, batalkan dengan alasan, **🖨 Dokumen** untuk arsip format PO. Isi harga per satuan di Master Barang.", "**Overtime**: setujui / tolak lembur AC & listrik.", "**Booking**: ubah / batalkan booking; status konfirmasi Security terlihat.", "**Pengumuman Gedung** & **Survei Kepuasan**."] },
      { h: "OB & CS, gedung, aset", steps: ["**Plotting OB & CS**, **Temuan & Kondisi Aset** (tindak lanjut temuan inspeksi), **Alat Kerja**.", "**Okupansi Gedung**: luas total, area bersama, unit per lantai & tenant.", "**Titik Patroli & QR**: tandai titik Kritis/Bergilir, nyalakan **Scan QR lantai**, cetak label.", "**Master APAR**, **Kendaraan & Uji Emisi**, **Master Laptop**, **Bank Dokumen Legal** (lihat panduan tersendiri)."] },
      { h: "Personel & manajemen", steps: ["**Manajemen Pengguna**: buat akun, pilih departemen, role (Staff / Koordinator / Administrator / Magang), peran tugas OB/CS, PT untuk Eksekutif.", "**Master Data Karyawan**: nama, PT/departemen, plat kendaraan, **email** (dipakai untuk notifikasi).", "**Beban Kerja & Personel**, **Rekap Poin Staf**, **SOP & Checklist**, **Handbook Magang**.", "**Dashboard Eksekutif**, **Anggaran & Realisasi**, **Project Tracker**, **Hari Libur**, **Kesehatan Notifikasi**."] },
      { h: "Magang GA", steps: ["Akun Magang GA = departemen **Admin GA** + role **Magang**.", "Menu yang terbuka: **Bank Dokumen Legal**, **Kendaraan & Uji Emisi**, **Master Data Karyawan**, **Master Data Laptop**.", "Magang dapat menambah & mengubah data, tetapi **tidak dapat menghapus**."] },
    ],
  },
  {
    file: "08-Panduan-Eksekutif-Tenant",
    judul: "Panduan Dashboard Eksekutif",
    untuk: "Eksekutif Tenant (lihat saja)",
    intro: "Akun Eksekutif hanya membaca data gedung dan PT Anda sendiri; tidak dapat mengubah data.",
    bagian: [
      UMUM_MASUK,
      { h: "Isi dashboard", steps: ["**Gedung**: kerusakan & perbaikan, okupansi, project tracker.", "**PT Anda**: kehadiran karyawan hari ini, lembur bulan ini, laporan & permintaan dari PT Anda.", "**Dokumen legal PT Anda**: daftar & status (aktif, sisa hari, kadaluarsa). Salinan dokumen diminta ke Admin GA."] },
    ],
  },
  {
    file: "09-Panduan-Karyawan-Portal",
    judul: "Panduan Portal Layanan Gedung",
    untuk: "Seluruh karyawan & tenant (tanpa login)",
    intro: "Portal sibm-app.web.app dapat dipakai semua karyawan tanpa login. Pilih nama Anda dari daftar karyawan.",
    bagian: [
      { h: "Layanan di portal", steps: ["**Minta Pelayanan OB / Cleaning**: tab Pelayanan OB (minuman, meeting, dokumen) atau Cleaning (tumpahan, sampah, toilet, ruangan); isi lokasi & catatan.", "**Booking Ruangan / Kendaraan**: pilih objek & jam; bentrok jadwal langsung diberi tahu. Email konfirmasi dikirim setelah Security mengonfirmasi.", "**Request ATK**: pilih barang, satuan & jumlah, catatan per item; status dapat dilacak dengan nomor resi.", "**Kerusakan**: laporkan fasilitas rusak dengan foto.", "**Bahaya SBO**: laporkan kondisi berbahaya ke QHSE.", "**Overtime Gedung**: ajukan lembur AC & listrik.", "**Lacak Tamu** & **Cek Paket**: cek tamu Anda dan paket kiriman.", "**Survei Kepuasan Gedung**: isi saat periode survei dibuka."], tips: ["Pastikan email Anda terdaftar di Admin GA agar menerima notifikasi (paket, booking, ATK, helpdesk)."] },
    ],
  },
];

const CSS = `
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #1f1a1a; font-size: 11pt; line-height: 1.5; margin: 0; }
.kop { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #a3122a; padding-bottom: 10px; margin-bottom: 14px; }
.kop img { height: 30px; }
.kop .meta { text-align: right; font-size: 9pt; color: #6b6160; }
h1 { font-size: 20pt; margin: 0 0 4px; color: #a3122a; }
.untuk { display: inline-block; font-size: 9.5pt; font-weight: 700; background: #fbecee; color: #a3122a; padding: 3px 10px; border-radius: 999px; }
.intro { margin: 10px 0 14px; color: #3f3837; }
h2 { font-size: 13pt; margin: 16px 0 6px; padding: 6px 10px; background: #f4efed; border-left: 4px solid #a3122a; page-break-after: avoid; }
ol { margin: 0 0 6px 0; padding-left: 22px; }
li { margin: 3px 0; page-break-inside: avoid; }
.tips { margin: 6px 0 0; padding: 8px 12px; border: 1px dashed #c9bebc; border-radius: 8px; font-size: 10pt; color: #3f3837; page-break-inside: avoid; }
.tips b.lbl { color: #1f7a4d; }
.kaki { margin-top: 18px; font-size: 8.5pt; color: #8a7f7d; border-top: 1px solid #e7e1df; padding-top: 6px; }
`;

for (const p of PANDUAN) {
  const isi = p.bagian.map((b, i) => `
    <h2>${i + 1}. ${esc(b.h)}</h2>
    <ol>${b.steps.map((s) => `<li>${fmt(s)}</li>`).join("")}</ol>
    ${b.tips ? `<div class="tips"><b class="lbl">Catatan:</b><ul style="margin:4px 0 0;padding-left:18px">${b.tips.map((t) => `<li>${fmt(t)}</li>`).join("")}</ul></div>` : ""}`).join("");
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(p.judul)}</title><style>${CSS}</style></head><body>
  <div class="kop"><img src="${LOGO}" alt="Samudera"><div class="meta">SIBM · Building Management Makassar<br>${TGL}</div></div>
  <h1>${esc(p.judul)}</h1><span class="untuk">Untuk: ${esc(p.untuk)}</span>
  <p class="intro">${fmt(p.intro)}</p>
  ${isi}
  <div class="kaki">Aplikasi SIBM · sibm-app.web.app · Pertanyaan & kendala: hubungi Admin GA. Panduan mengikuti fitur per ${TGL}.</div>
  </body></html>`;
  fs.writeFileSync(path.join(OUT, `${p.file}.html`), html);
}
console.log(PANDUAN.map((p) => p.file).join("\n"));
