# 📊 Laporan Analisis Project: Portal SIBM

**Sistem Informasi Building Management (SIBM) – General Affairs PT Samudera**

- **Repository:** `https://github.com/samuderamakassar-web/sibm.git`
- **Tanggal Analisis:** 2 Juli 2026
- **Update Terakhir:** 3 Juli 2026
- **Sifat Laporan:** Analisis & Rekomendasi + **Log Implementasi Notifikasi (in progress)**

---

## 📌 Status Implementasi Terkini (Update 3 Juli 2026)

Sejak laporan awal, implementasi **notifikasi Email & WhatsApp** (rekomendasi §5.1) sudah mulai dikerjakan mengikuti roadmap bertahap. Status per tahap:

### ✅ Tahap 1 — Fondasi (SELESAI)
| Item | Status | File Terdampak |
|---|---|---|
| Tambah field `no_wa` & `email` ke Master Data Karyawan | ✅ Selesai | `src/app/admin/karyawan/page.tsx` |
| Normalisasi nomor WA ke format `62xxxxxxxxxx` | ✅ Selesai | `src/app/admin/karyawan/page.tsx` (`normalizeNoWA()`) |
| Update form tambah manual + upload CSV massal (5 kolom: Nama, Departemen, Plat, No WA, Email) | ✅ Selesai | `src/app/admin/karyawan/page.tsx` |
| Fungsi **Edit** data karyawan (agar data lama tak perlu diinput ulang) | ✅ Selesai | `src/app/admin/karyawan/page.tsx` (`handleSubmitKaryawan`, `handleMulaiEdit`, `handleBatalEdit`) |
| Modul helper notifikasi terpusat `src/lib/notify.ts` (`kirimWA()` via Fonnte, `kirimEmail()` via EmailJS, kumpulan `template.*` pesan) | ✅ Selesai | `src/lib/notify.ts` |
| Registrasi akun **Fonnte** & **EmailJS** + konfigurasi token/key | ✅ Selesai (dikerjakan user) | `.env.local` (di sisi project, tidak di-commit) |

### ✅ Tahap 2 — Notifikasi Prioritas Tinggi (SELESAI — 4 dari 5 item, 1 item sengaja dilewati)
| No | Event | Status | File Terdampak | Catatan |
|---|---|---|---|---|
| 4 | **Overtime disetujui/ditolak** → WA + Email ke pemohon | ✅ Selesai | `src/app/admin/overtime/page.tsx` | Lookup kontak berdasarkan `nama_pemohon` vs Master Data Karyawan (cocok nama, case-insensitive). Alasan penolakan opsional via prompt, ikut masuk ke pesan. |
| 3 | **Tiket Helpdesk berubah status** → WA + Email ke pelapor | ✅ Selesai | `src/app/admin/helpdesk/page.tsx` | Notifikasi hanya terkirim kalau status **benar-benar berubah** (bukan re-save foto tanpa ganti status). |
| 4 | **ATK siap diambil** → WA + Email ke pemohon | ✅ Selesai | `src/app/admin/atk/page.tsx` | Notifikasi hanya dikirim saat transisi ke status `"Selesai / Diambil"` (bukan saat `"Sedang Disiapkan"`), sesuai prioritas dampak. |
| 1 | **Paket/dokumen baru diterima** → WA ke karyawan penerima | ✅ Selesai | `src/app/dashboard/security/paket/page.tsx` | Notifikasi dikirim otomatis begitu Security submit form input paket. Channel **WA saja** (bukan Email), sesuai prioritas "instan". Pesan gabungan jenis barang + kurir + keterangan/no resi. |
| 5 | **Tamu check-in menemui karyawan** → WA ke karyawan dituju | 🚫 Sengaja dilewati (out of scope) | — | Diputuskan tidak diperlukan untuk saat ini. Fungsi `template.tamuCheckIn()` tetap tersedia di `src/lib/notify.ts` kalau suatu saat mau diaktifkan kembali. |

### 🔄 Tahap 3 — Notifikasi ke Pengelola (SEDANG BERJALAN)
Request baru masuk ke Admin GA, SBO kritikal ke QHSE, Purchase Request ke koordinator OB. Tahap ini butuh field email/no_wa juga di `users_master` (folder `src/app/admin/users/`).

---

## 🔁 RINGKASAN UNTUK LANJUTAN DI CHAT BARU (Update 7 Juli 2026)

> Kalau kamu mulai chat baru dan mau lanjutin kerjaan ini, tinggal upload file `analisis_project.md` ini + bilang "lanjutkan dari sini", Claude bisa langsung paham konteksnya.

### Konteks Project
Portal SIBM — Next.js + Firebase (Firestore), static export (`output: export`), di-hosting Firebase Hosting. Project **masih di plan Spark (gratis)** — Firebase Storage dan Cloud Functions belum bisa dipakai sampai upgrade ke plan Blaze. Project **tidak pakai Tailwind CSS** — seluruh styling pakai inline `style={{...}}` di setiap komponen (penting buat diingat kalau mau tambah komponen baru).

### Urutan Prioritas Perbaikan (disepakati bareng)
1. ✅ **Validasi nama pemohon di form publik** — kode sudah dikasih untuk `src/app/page.tsx` (4 fungsi `handleSubmit*`: ATK, Overtime, Helpdesk, SBO), **status: kode sudah diberikan, BELUM dikonfirmasi user sudah pasang/tes**.
2. ⏸️ **Ganti password hardcoded `"123456"`** — ditunda, disepakati belum urgent.
3. 🚧 **Migrasi foto base64 → Firebase Storage** — terblokir, butuh plan Blaze.
4. 🚧 **Migrasi notifikasi ke Firebase Cloud Functions** — terblokir, butuh plan Blaze juga.
5. 🔄 **Refactor inline style → komponen reusable** — SEDANG DIKERJAKAN, ini yang paling banyak progresnya, detail di bawah.

### Progres Detail Refactor Komponen (Prioritas #5)

**Komponen di `src/components/ui/`** (built dari nol, semua PAKAI INLINE STYLE, bukan Tailwind — sempat salah pakai Tailwind di percobaan pertama dan bikin tampilan berantakan total, sudah diperbaiki):
- `Button.tsx` — variant: primary/danger/warning/success/secondary/ghost, ada state loading
- `Card.tsx` — card putih rounded-shadow
- `Input.tsx` — field teks dengan label, hint, dukungan datalist
- `Select.tsx` — dropdown dengan label
- `Textarea.tsx` — textarea dengan label
- `Modal.tsx` — overlay + tombol close
- `Badge.tsx` — pill status (success/warning/danger/info/neutral)
- `Table.tsx` — primitif `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td`

**Halaman yang SUDAH direfactor pakai komponen di atas** (semua sudah di versi inline-style yang benar, siap dipasang & ditest ulang oleh user karena versi Tailwind sebelumnya gagal render):
- `src/app/admin/karyawan/page.tsx` ✅
- `src/app/admin/helpdesk/page.tsx` ✅
- `src/app/dashboard/security/paket/page.tsx` ✅ (bagian dropdown autocomplete karyawan & overlay kamera full-screen sengaja TIDAK diseragamkan ke komponen, tetap custom karena polanya beda)
- `src/app/dashboard/ob/deep-cleaning/page.tsx` ✅ (nama komponen asli `DeepCleaningManager`, cek path asli user kalau beda)

**Status pengetesan oleh user:** Baru sempat tes `paket/page.tsx` dan `deep-cleaning/page.tsx` di versi Tailwind (SALAH, berantakan). **Belum ada konfirmasi hasil tes dari versi inline-style yang baru.** Chat baru harus mulai dengan menanyakan: apakah 4 halaman versi inline-style ini sudah dites dan tampilannya sudah benar?

**Belum direfactor sama sekali:**
- `src/app/page.tsx` — portal publik, paling besar, berisi banyak modal (ATK, Overtime, Helpdesk, SBO, Tamu, Paket lookup, Login) — ini juga file yang sama tempat validasi nama (prioritas #1) perlu dipasang
- Halaman checklist kamera OB (`ChecklistKameraPage` / `src/app/dashboard/ob/checklist/...` — cek path asli)
- Modal-modal lain yang belum ke-cover

### Isu Teknis yang Pernah Muncul & Solusinya
- **Error casing Windows**: `Already included file name 'Button.tsx' differs from 'button.tsx' only in casing` — solusi: hapus file duplikat casing lain, atau `git mv` dua langkah (rename ke nama sementara lalu balik) + restart TS Server di VS Code.
- **Tampilan berantakan total (font default, no color/rounded)**: root cause-nya project TIDAK pakai Tailwind CSS, sementara versi awal komponen dibuat pakai className Tailwind. FIXED — semua komponen & halaman ditulis ulang pakai inline `style={{}}`.

### Isu Belum Terselesaikan — Setup Notifikasi (Fonnte + EmailJS)
User sudah isi `.env.local` sendiri (tidak diberi tahu caranya sebelumnya oleh Claude — ini gap yang perlu diperbaiki):
```
NEXT_PUBLIC_FONNTE_TOKEN=...
NEXT_PUBLIC_EMAILJS_SERVICE_ID=...
NEXT_PUBLIC_EMAILJS_TEMPLATE_ID=...
NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=...
```
tapi ada error yang **belum dijelaskan detail pesan errornya oleh user**. Sudah dikasih checklist troubleshooting umum (restart dev server, cek `npm install @emailjs/browser`, cek kecocokan nama variable template EmailJS dengan `to_email`/`to_name`/`subject`/`message` di `src/lib/notify.ts`, cek device Fonnte statusnya "Connected", cek nama file persis `.env.local`). **Chat baru perlu minta user kirim pesan error persis dari browser console (F12) untuk diagnosa pasti.**

### Yang Perlu Ditanyakan/Dikerjakan di Chat Baru (urutan disarankan)
1. Minta error message persis dari console soal Fonnte/EmailJS, diagnosa dan benerin.
2. Konfirmasi apakah 4 halaman yang direfactor (karyawan, helpdesk, paket, deep-cleaning) sudah dites di versi inline-style dan tampilannya normal.
3. Kalau sudah oke, lanjut refactor `src/app/page.tsx` (portal publik) — sekalian pasang validasi nama pemohon (prioritas #1) di 4 form-nya karena filenya sama.
4. Lanjut checklist kamera OB dan halaman lain yang belum ke-cover.
5. Tetap tunda password hardcode & migrasi Storage/Cloud Functions sampai plan Blaze aktif.

### 🧩 Pola Teknis yang Dipakai Konsisten di Semua Halaman
Untuk menjaga konsistensi, setiap halaman admin yang sudah diintegrasikan notifikasi mengikuti pola yang sama:
1. Tambah listener real-time ke koleksi `employees_directory` untuk membangun daftar kontak.
2. Fungsi `cariKontakKaryawan(nama)` — mencocokkan nama pemohon/pelapor ke Master Data Karyawan (case-insensitive).
3. Setelah `updateDoc` status berhasil, panggil `kirimWA()`/`kirimEmail()` dari `src/lib/notify.ts` — **best-effort**, tidak memblokir alur kerja admin walau notifikasi gagal terkirim (misalnya kontak tidak ketemu, hanya dicatat di console).
4. Indikator UI ("Mengirim notifikasi...") pada tombol aksi saat proses pengiriman berjalan.

> ⚠️ **Keterbatasan yang perlu diperhatikan:** Pencocokan kontak saat ini mengandalkan **kecocokan nama persis** antara nama yang diketik pemohon di form publik dan `nama` di Master Data Karyawan. Jika ada perbedaan penulisan nama (typo, singkatan, dsb), notifikasi akan gagal terkirim secara senyap. **Rekomendasi perbaikan jangka panjang:** ubah form pengajuan publik (Overtime, Helpdesk, ATK) agar nama dipilih dari dropdown `employees_directory`, bukan diketik bebas — ini akan menghilangkan celah mismatch nama sekaligus mempermudah validasi data pemohon.

### 🐛 Bug Fix Tambahan (ditemukan saat kerjakan Tahap 3)
Ditemukan mismatch nama field antara form publik dan halaman Admin, sudah diperbaiki di `src/app/page.tsx`:
- **Overtime**: field disimpan sebelumnya `nama`/`dept`/`area`, sudah dibetulkan jadi `nama_pemohon`/`departemen`/`area_ruangan` sesuai yang dibaca Admin. Efek samping: ticker "Overtime Hari Ini" di beranda publik yang sebelumnya ikut kena bug ini, sekarang ikut kebenar.
- **Helpdesk**: field disimpan sebelumnya `nama`/`dept`, sudah dibetulkan jadi `nama_pelapor`/`departemen`.

### 🔄 Tahap Tambahan — Toast/Confirm Notification (SEDANG BERJALAN)
Mengganti `alert()` & `window.confirm()` bawaan browser dengan komponen custom yang lebih modern (§5.2.A). Progres:

| File | Status |
|---|---|
| `src/components/ui/ToastProvider.tsx` (baru) | ✅ Selesai |
| `src/components/ui/ConfirmProvider.tsx` (baru) | ✅ Selesai |
| `src/app/layout.tsx` (pasang provider global) | ✅ Selesai |
| `src/app/admin/karyawan/page.tsx` | ✅ Selesai |
| `src/app/admin/overtime/page.tsx` | ✅ Selesai |
| `src/app/admin/helpdesk/page.tsx` | ✅ Selesai |
| `src/app/admin/atk/page.tsx` | ✅ Selesai |
| `src/app/dashboard/security/paket/page.tsx` | ⬜ Belum |
| `src/app/admin/users/page.tsx` | ⬜ Belum |
| `src/app/page.tsx` (portal publik — paling banyak titik alert/confirm) | ⬜ Belum |

---

## 📌 Roadmap Perbaikan Berkelanjutan (dimulai 6 Juli 2026)

Setelah Tahap 1 & 2 notifikasi selesai, disepakati urutan perbaikan lanjutan sebagai berikut:

| No | Perbaikan | Status | Catatan |
|---|---|---|---|
| 1 | Validasi nama pemohon di form publik (cegah mismatch notifikasi) | 🔄 Kode sudah diberikan, menunggu konfirmasi terpasang | Kode disiapkan untuk `src/app/page.tsx` — validasi nama harus cocok persis dengan `employees_directory` sebelum submit (ATK, Overtime, Helpdesk, SBO) |
| 2 | Ganti password login hardcoded `"123456"` | ⏸️ Ditunda (disepakati belum urgent) | — |
| 3 | Migrasi foto base64 → Firebase Storage | 🚧 Terblokir billing | Project masih di plan **Spark** (gratis). Firebase Storage butuh plan **Blaze** (pay-as-you-go) supaya bucket bisa dipakai & rules bisa di-deploy — bukan soal kode, tapi soal upgrade plan di Firebase Console dulu. |
| 4 | Migrasi pengiriman notifikasi ke Firebase Cloud Functions | 🚧 Terblokir billing | Sama seperti di atas — Cloud Functions juga wajib plan Blaze. Ditunda sampai plan di-upgrade. |
| 5 | Refactor inline style → komponen reusable | 🔄 Sedang dikerjakan | Library komponen di `src/components/ui/`: `Button`, `Card`, `Input`, `Select`, `Textarea`, `Modal`, `Badge`, `Table`. Halaman yang sudah direfactor pakai komponen ini: `admin/karyawan`, `admin/helpdesk`, `dashboard/security/paket`, `dashboard/ob/deep-cleaning` (semua di-cross-check logikanya sama persis dengan versi lama, cuma render-nya dirapikan). Sempat ada error casing filename Windows (`Button.tsx` vs `button.tsx`) — sudah dikasih langkah perbaikan (rename dua langkah via git + restart TS server). Belum dikerjakan: halaman portal publik (`app/page.tsx`), checklist kamera OB, dan modal-modal lain di dalamnya. |

### Detail Item #1 — Validasi Nama Pemohon
Sebelumnya form ATK/Overtime/Helpdesk/SBO pakai `<input list="...">` (datalist) yang cuma **menyarankan** nama, tapi tetap menerima ketikan bebas — kalau nama tidak persis cocok dengan `employees_directory`, notifikasi WA/Email gagal terkirim secara senyap.

Perbaikan: tambah pengecekan `employees.some(emp => emp.nama === namaInput)` di setiap fungsi `handleSubmit*` sebelum data disimpan ke Firestore. Kalau nama tidak ketemu persis di direktori, submit diblok dan user diminta memilih dari daftar saran yang muncul saat mengetik.

---

## 1. Ringkasan Eksekutif

Portal SIBM adalah aplikasi web **PWA (Progressive Web App)** untuk mengelola operasional gedung (Building Management) di lingkungan PT Samudera cabang Makassar. Aplikasi ini menyatukan banyak fungsi *General Affairs* (GA) dalam satu portal: layanan tamu, paket/logistik, permintaan ATK, lembur gedung, laporan kerusakan (helpdesk), laporan bahaya (SBO/QHSE), monitoring OB/Cleaning Service, Security, dan Driver.

Aplikasi terdiri dari **2 sisi**:
1. **Portal Publik / Karyawan** (halaman utama) — semua orang bisa lacak tamu, cek resi paket, request ATK, ajukan overtime, lapor kerusakan & lapor bahaya, tanpa login.
2. **Dashboard Internal** (perlu login) — dibagi per peran: Admin GA, Management, OB & CS, Security, Driver, QHSE.

**Temuan kunci untuk kebutuhan notifikasi:** Aplikasi punya **banyak alur berbasis status/approval** (ATK, Overtime, Helpdesk, Purchase Request, Paket, Tamu) yang saat ini **tidak memiliki notifikasi apa pun** — pemohon harus manual mengecek kembali status via halaman "Lacak". Bahkan sudah ada **jejak komentar `TODO: INTEGRASI EMAILJS`** di kode, menandakan kebutuhan ini memang sudah direncanakan tapi belum dikerjakan. Ini adalah peluang terbesar untuk peningkatan.

---

## 2. Teknologi & Arsitektur

| Lapisan | Teknologi | Keterangan |
|---|---|---|
| **Framework** | **Next.js 16.2.7** (App Router) | Versi terbaru, memakai `output: "export"` (static export) |
| **UI Library** | **React 19.2** | Semua halaman `"use client"` (client-side rendering) |
| **Bahasa** | **TypeScript 5** | Ada beberapa `any` yang di-disable ESLint |
| **Styling** | **Tailwind CSS v4** + **inline style** | Mayoritas UI pakai *inline style* JS, bukan class Tailwind |
| **Database** | **Firebase Firestore** (NoSQL, real-time) | Data real-time via `onSnapshot` |
| **Autentikasi** | **Firebase Auth** (di-import) + login custom | Login aktual pakai cek koleksi `users_master` + **password hardcoded `"123456"`** ⚠️ |
| **Storage** | **Firebase Storage** (di-import) | Foto disimpan sebagai **base64 di Firestore** (bukan Storage) |
| **PWA** | **@ducanh2912/next-pwa** | Bisa di-install di HP, ada `manifest.json`, service worker |
| **QR Code** | **html5-qrcode** | Untuk scan titik patroli & kebersihan |
| **Hosting** | **Firebase Hosting** | Ada `.firebaserc`, `firebase.json` |

### Struktur Folder Utama
```
src/
├── lib/firebase.ts          → Konfigurasi & inisialisasi Firebase
└── app/
    ├── page.tsx             → Portal publik (847 baris, pusat semua modal layanan)
    ├── layout.tsx           → Root layout + metadata PWA
    ├── shift-checkin/        → Check-in shift OB & Security
    ├── admin/               → 11 halaman panel Admin GA
    │   ├── page.tsx          → Control panel (menu utama admin)
    │   ├── users/            → Manajemen akun login
    │   ├── karyawan/         → Master data karyawan (upload CSV)
    │   ├── broadcast/        → Pengumuman berjalan (ticker)
    │   ├── atk/              → Proses request ATK
    │   ├── overtime/         → Approval lembur gedung & tim
    │   ├── helpdesk/         → Kelola tiket kerusakan
    │   ├── monitor-ob/       → Pantau OB + Purchase Request
    │   ├── monitor-security/ → Pantau security
    │   ├── qr-manager/       → Generator QR patroli/kebersihan
    │   └── report/           → Laporan eksekutif (PDF/print)
    └── dashboard/
        ├── ob/              → OB & CS (checklist, plotting, stok, deep-cleaning, laporan)
        ├── security/        → Security (buku tamu, paket, patroli, parkir, jadwal)
        ├── driver/          → Status & log kendaraan driver
        └── qhse/            → QHSE (laporan SBO)
```

### Koleksi Firestore (Database)
`daily_plots`, `deep_cleaning_tasks`, `driver_status_logs`, `employees_directory`, `ga_atk_requests`, `ga_overtime_requests`, `helpdesk_tickets`, `master_atk`, `ob_checklists`, `ob_stock`, `ob_stock_logs`, `operational_vehicle_logs`, `packages`, `purchase_requests`, `qhse_sbo_reports`, `security_monthly_schedules`, `security_patrols`, `security_schedules`, `security_visitor_logs`, `settings`, `shift_logs`, `users_master`.

---

## 3. Fungsi-Fungsi Utama Aplikasi

### A. Layanan Publik (tanpa login, di halaman utama)
1. **Lacak Tamu** — cari data pengunjung gedung.
2. **Cek Resi Paket** — lacak paket/dokumen berdasarkan nama penerima.
3. **Gudang ATK** — buat request alat tulis kantor + lacak via kode resi (format `ATK-YYMM-XXXX`).
4. **Overtime Gedung** — ajukan lembur (AC/ruangan), menunggu approval Admin GA.
5. **Lapor Kerusakan (Helpdesk)** — buat tiket kerusakan + foto, lacak status.
6. **Lapor Bahaya (SBO/QHSE)** — laporan temuan kondisi tidak aman + foto wajib.
7. **Live Ticker** — info real-time: pengumuman GA, shift security, plotting OB, status driver.

### B. Dashboard Internal (per peran)
- **Admin GA:** pusat kendali 11 modul — approve/tolak overtime, proses ATK, kelola helpdesk, purchase request, kelola user & karyawan, broadcast pengumuman, generate QR, laporan eksekutif.
- **Security:** buku tamu (check-in/out pengunjung), penerimaan paket, patroli (QR scan), parkir, jadwal shift.
- **OB & CS:** checklist harian, plotting area, stok gudang, deep cleaning, laporan.
- **Driver:** update status kendaraan (Standby/Keluar/Service) & tujuan.
- **QHSE:** kelola laporan SBO.

### C. Pola Alur Kerja & Status
Banyak entitas mengikuti alur status bertahap, misalnya:
- **ATK:** `Menunggu Disiapkan` → `Sedang Disiapkan` → `Selesai / Diambil`
- **Overtime:** `Menunggu Approval GA` → `Approved` / `Rejected`
- **Helpdesk:** `Menunggu` → `Sedang Dikerjakan` → `Selesai`
- **Purchase Request:** `Menunggu` → `Disetujui` / `Ditolak` / `Dibelikan`
- **Paket:** `Belum Diambil` → `Sudah Diambil`
- **Tamu:** `Di Dalam Area` → `Selesai / Keluar`

> ⚠️ **Semua perubahan status ini sekarang "diam" (silent)** — tidak ada pemberitahuan ke pemohon/karyawan terkait. Inilah celah utama yang bisa diisi notifikasi Email & WhatsApp.

---

## 4. Titik-Titik Notifikasi (Email & WhatsApp)

Berikut pemetaan lengkap **event** aplikasi yang paling bermanfaat jika diberi notifikasi. Diurutkan berdasarkan **prioritas dampak**.

### 🔴 Prioritas TINGGI (paling terasa manfaatnya)

| No | Event / Trigger | Penerima Ideal | Kanal Disarankan | Manfaat |
|---|---|---|---|---|
| 1 | **Paket/dokumen baru diterima** security untuk seorang karyawan | Karyawan penerima | **WhatsApp** (instan) | Karyawan langsung tahu ada paket, tidak menumpuk di resepsionis |
| 2 | **Overtime disetujui / ditolak** Admin GA | Pemohon lembur | **WhatsApp + Email** | Kepastian cepat, tidak perlu cek manual |
| 3 | **Tiket kerusakan (Helpdesk) berubah status** (Diproses → Selesai) | Pelapor | **WhatsApp** | Pelapor tahu progres perbaikan |
| 4 | **Request ATK selesai disiapkan / siap diambil** | Pemohon ATK | **WhatsApp** | Barang tidak menganggur di gudang GA |
| 5 | **Tamu check-in** menemui seorang karyawan (`bertemu_dengan`) | Karyawan yang dituju | **WhatsApp** | Karyawan langsung menyambut tamu, mempercepat layanan |

### 🟠 Prioritas MENENGAH

| No | Event / Trigger | Penerima Ideal | Kanal Disarankan | Manfaat |
|---|---|---|---|---|
| 6 | **Ada request baru** (Overtime / ATK / Helpdesk / SBO) masuk | Admin GA / PIC terkait | **WhatsApp/Email** ke grup GA | Admin langsung memproses, SLA lebih cepat |
| 7 | **Laporan Bahaya (SBO) baru dengan kategori kritikal** | Tim QHSE / Manajemen | **WhatsApp + Email** | Respons darurat lebih cepat |
| 8 | **Purchase Request disetujui/ditolak** | Pengaju PR (koordinator OB) | **Email** | Dokumentasi keputusan pembelian |
| 9 | **Pengumuman/broadcast baru** dari Admin GA | Semua karyawan | **Email blast** (opsional) | Menjangkau yang tidak buka portal |

### 🟢 Prioritas TAMBAHAN (nice to have)

| No | Event / Trigger | Penerima | Kanal | Manfaat |
|---|---|---|---|---|
| 10 | **Stok gudang OB menipis** (di bawah batas minimum) | Admin GA / Koordinator | **WhatsApp/Email** | Cegah kehabisan bahan pembersih |
| 11 | **Reminder shift** (H-1 / pagi hari) untuk Security & OB | Petugas ybs | **WhatsApp** | Kurangi keterlambatan/absen |
| 12 | **Rekap harian/mingguan otomatis** (tamu, paket, helpdesk) | Manajemen/Admin | **Email terjadwal** | Ringkasan operasional tanpa buka dashboard |

> 💡 **Catatan penting (prasyarat data):** Saat ini koleksi `employees_directory` **hanya menyimpan `nama`, `departemen`, `plat_kendaraan`** — **belum ada nomor WhatsApp / email karyawan**. Koleksi `users_master` hanya menyimpan email untuk staf login internal (bukan semua karyawan). **Agar notifikasi ke karyawan bisa jalan, wajib menambahkan field `no_wa` dan `email` pada master data karyawan terlebih dahulu** (lihat rekomendasi #1 di bawah).

---

## 5. Rekomendasi Konkret

### 5.1 Fitur yang Sebaiknya Ditambahkan Notifikasi (Roadmap Bertahap)

**Tahap 1 — Fondasi (wajib duluan):**
1. Tambah field **`no_wa`** dan **`email`** di form & CSV upload master karyawan (`admin/karyawan`) serta di `users_master`. Tanpa ini, notifikasi ke karyawan tidak bisa dikirim.
2. Buat 1 **modul/helper notifikasi terpusat** (misalnya `src/lib/notify.ts`) berisi fungsi `kirimWA()` dan `kirimEmail()` agar dipakai ulang di semua halaman.

**Tahap 2 — Notifikasi prioritas tinggi (dampak langsung ke karyawan):**
3. Notifikasi **paket diterima** → WhatsApp ke penerima (di `dashboard/security/paket`).
4. Notifikasi **hasil approval overtime** → WhatsApp + Email ke pemohon (di `admin/overtime`).
5. Notifikasi **update tiket helpdesk** → WhatsApp ke pelapor (di `admin/helpdesk`).
6. Notifikasi **ATK siap diambil** → WhatsApp ke pemohon (di `admin/atk`).

**Tahap 3 — Notifikasi ke pengelola (mempercepat SLA):**
7. Notifikasi **request baru masuk** (ATK/Overtime/Helpdesk/SBO) → WhatsApp/Email ke Admin GA.
8. Notifikasi **SBO kategori bahaya kritikal** → tim QHSE.

**Tahap 4 — Otomasi lanjutan:**
9. Reminder shift, alert stok menipis, dan rekap terjadwal (butuh *scheduler*, lihat catatan teknis).

### 5.2 Ide Membuat Project Lebih Menarik

**A. UI / UX**
- **Refactor styling ke Tailwind/komponen**: saat ini UI didominasi *inline style* yang panjang & sulit dirawat. Pindah ke komponen reusable (Card, Modal, Button, Badge) akan mempercepat pengembangan & konsistensi.
- **Komponen Toast/Notification** menggantikan `alert()` & `window.confirm()` bawaan browser (lebih modern, tidak mengganggu).
- **Skeleton loading** menggantikan teks "Memuat..." agar terasa lebih responsif.
- **Dark mode** — mudah diterapkan bila sudah pindah ke Tailwind.
- **Dashboard analitik visual** di panel Admin: grafik jumlah tamu/hari, tiket per status, tren overtime (pakai `recharts`/`chart.js`).
- **Badge counter** di menu admin (misal "Helpdesk (3 baru)") agar admin tahu ada pekerjaan tertunda.

**B. Fitur Tambahan**
- **Notifikasi in-app + PWA Push Notification** (Firebase Cloud Messaging) — melengkapi WA/Email, gratis, dan native untuk PWA.
- **Riwayat/timeline status** pada tiap tiket/request (audit trail: siapa mengubah, kapan).
- **Ekspor PDF** untuk resi ATK & bukti tamu (saat ini banyak ekspor masih CSV).
- **QR check-in tamu mandiri** — tamu scan QR di lobi untuk isi buku tamu sendiri.
- **Rating kepuasan** setelah tiket helpdesk selesai.

**C. Optimasi Teknis & Keamanan** ⚠️
- **Ganti password login hardcoded `"123456"`** — ini risiko keamanan serius. Gunakan Firebase Auth (email/password) sepenuhnya, atau minimal hashing + password per-user.
- **Amankan Firebase config & rules**: pastikan **Firestore Security Rules** membatasi akses (saat ini apiKey ada di kode — wajar untuk Firebase web, tapi rules harus ketat).
- **Simpan foto di Firebase Storage**, bukan base64 di Firestore — base64 memperbesar dokumen & memperlambat query. Firebase Storage sudah diinisialisasi tapi belum dipakai.
- **Pindahkan validasi/aksi penting** ke sisi server. Karena `output: "export"` (static), pertimbangkan **Firebase Cloud Functions** untuk logika terproteksi & pengiriman notifikasi.

### 5.3 Teknologi / Library untuk Implementasi Notifikasi

**Karena aplikasi memakai `output: "export"` (static, tanpa server Next.js aktif),** pengiriman notifikasi sebaiknya lewat **layanan pihak ketiga langsung dari klien** atau melalui **Firebase Cloud Functions**. Berikut opsinya:

#### 📧 Email
| Opsi | Cara Kerja | Kelebihan | Catatan |
|---|---|---|---|
| **EmailJS** | Dipanggil langsung dari browser (`@emailjs/browser`) | Paling mudah, **tanpa backend**, cocok dgn static export. **Sudah ada TODO-nya di kode!** | Ada batas kuota gratis; API key di klien |
| **Firebase Cloud Functions + Nodemailer / SendGrid** | Trigger otomatis saat dokumen Firestore berubah | Aman (kredensial di server), otomatis, andal | Perlu setup Functions (billing Blaze) |
| **Resend / SendGrid / Brevo** | API email | Deliverability bagus, ada free tier | Sebaiknya lewat Cloud Functions |

> Rekomendasi cepat: **EmailJS** untuk mulai cepat (sesuai TODO yang sudah ada), lalu migrasi ke **Cloud Functions + SendGrid/Resend** untuk skala & keamanan.

#### 💬 WhatsApp
| Opsi | Cara Kerja | Kelebihan | Catatan |
|---|---|---|---|
| **Fonnte** | REST API (populer di Indonesia) | Murah, mudah, dokumentasi Bahasa Indonesia, cocok utk UMKM/perusahaan lokal | Unofficial (pakai device/gateway) |
| **Wablas / Watzap.id** | REST API gateway lokal | Serupa Fonnte, banyak dipakai di ID | Unofficial |
| **Twilio WhatsApp API** | REST API resmi | Resmi & stabil (WhatsApp Business API) | Lebih mahal, perlu approval template |
| **WhatsApp Cloud API (Meta)** | API resmi gratis (batas tertentu) | Resmi, gratis di tier awal | Setup lebih teknis, perlu template disetujui |
| **Link `wa.me` / `https://api.whatsapp.com/send`** | Buka WA dgn pesan terisi | Gratis, tanpa API | **Manual** (petugas harus klik kirim), bukan otomatis |

> Rekomendasi cepat: **Fonnte** (atau Wablas) untuk otomatisasi WA yang murah & cepat diintegrasikan dari Indonesia. Untuk kebutuhan resmi/skala besar → **WhatsApp Cloud API (Meta)** atau **Twilio**. Panggilan API sebaiknya lewat **Cloud Functions** agar token tidak bocor di sisi klien.

#### 🔔 Bonus — Push Notification (PWA)
- **Firebase Cloud Messaging (FCM)** — karena app sudah PWA + Firebase, ini pilihan paling natural & gratis untuk notifikasi in-app/push ke HP tanpa biaya per pesan.

#### 🗓️ Untuk notifikasi terjadwal (reminder shift, rekap, alert stok)
- **Firebase Cloud Functions + Cloud Scheduler** (cron) — menjalankan pengecekan berkala lalu memicu WA/Email.

---

## 6. Kesimpulan

Portal SIBM sudah **matang secara fungsional** — mencakup hampir seluruh operasional GA gedung dalam satu PWA yang rapi dan real-time. **Kelemahan terbesarnya adalah komunikasi satu arah**: semua alur approval/status berjalan diam-diam, memaksa pengguna mengecek manual.

**Langkah paling berdampak** adalah menambahkan **notifikasi Email & WhatsApp** pada titik-titik prioritas tinggi (paket, overtime, helpdesk, ATK, tamu), dengan prasyarat **melengkapi data kontak karyawan** dan membangun **helper notifikasi terpusat**. Secara teknis, karena app berstatus *static export*, kombinasi **EmailJS + Fonnte** memberi hasil tercepat, sementara **Firebase Cloud Functions + FCM** memberi solusi paling aman & skalabel untuk jangka panjang.

Selain notifikasi, ada peluang peningkatan pada **keamanan login** (hapus password hardcoded), **penyimpanan foto** (pindah ke Firebase Storage), dan **kualitas UI** (komponen reusable, toast, dashboard analitik).

---

*Laporan ini bersifat analisis & rekomendasi. Update 3 Juli 2026: Tahap 1 & Tahap 2 (fondasi + notifikasi prioritas tinggi) sudah selesai — Overtime, Helpdesk, ATK, dan Paket Diterima terintegrasi; item Tamu Check-in sengaja dilewati (out of scope). Tahap 3 (notifikasi ke pengelola: Admin GA, QHSE, koordinator OB) baru dimulai. Lihat bagian "Status Implementasi Terkini" di atas untuk detail lengkap per file.*
