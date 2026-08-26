# SIBM — Project Analisis & Progress

Update terakhir: 25 Agustus 2026
Project: SIBM (Sistem Informasi Building Management) — Next.js + Firebase (Firestore, Storage), hosting via Firebase Hosting, plan **Spark (gratis)**.
Deploy: `next.config.ts` pakai `output: "export"` (static export murni) → API Routes gak jalan di production, jadi semua kerjaan terjadwal/backend pakai GitHub Actions + Firebase Admin SDK, bukan Cloud Functions.

---

## 1. SUDAH SELESAI (ringkas — history detail ada di chat lama)

- Checklist OB: segment-based (Basement, Lantai 1-5, Pelayanan), foto before/after multi-pasang, Cloudinary buat upload foto (bukan Firebase Storage — Blaze diblokir masalah kartu).
- PWA: `manifest.json`, `InstallPrompt.tsx`, ikon masih placeholder (belum ada file asli).
- Sistem reminder terjadwal (semua via GitHub Actions cron, gak butuh Blaze, reuse secret `FIREBASE_SERVICE_ACCOUNT_BASE64`):
  - `patroli-reminder.yml` + `scripts/patroli-reminder.mjs` — WA reminder patroli security tiap 3 jam + 30 menit sebelum & pas shift ganti.
  - `checklist-reminder.yml` + `scripts/checklist-reminder.mjs` — WA reminder checklist OB tiap 2 jam kalau belum submit.
  - `fcm-reminder.yml` + `scripts/fcm-reminder.mjs` — push notif browser jam 08:30/13:00/16:00 WITA hari kerja. Belum di-deploy/test.
  - `kendaraan-reminder.yml` + `scripts/kendaraan-reminder.mjs` — sudah ada di repo tapi belum pernah dibahas, isi/tujuannya perlu dikonfirmasi ulang kalau mau disentuh.
- FCM setup: `src/hooks/useFcmSetup.ts` sudah di lokasi benar, dipanggil via `useFcmSetup(picName, !!picName)`.
- Banyak bugfix arsitektur & fitur (login, plotting OB, jadwal security, kendaraan, dsb) — lihat riwayat chat/memory untuk detail lengkap kalau perlu.

---

## 2. STRUKTUR FOLDER SAAT INI

```
sibm-app/
  .github/workflows/
    checklist-reminder.yml
    fcm-reminder.yml
    kendaraan-reminder.yml
    patroli-reminder.yml
  scripts/
    checklist-reminder.mjs
    fcm-reminder.mjs
    kendaraan-reminder.mjs
    patroli-reminder.mjs
  src/
    app/
      admin/
        atk/page.tsx
        broadcast/          ← isi belum diperiksa
        helpdesk/            ← isi belum diperiksa
        karyawan/            ← isi belum diperiksa
        kendaraan/page.tsx    ← DIROMBAK sesi 24 Agustus (lihat §3)
        monitor-ob/            ← isi belum diperiksa
        monitor-security/            ← isi belum diperiksa
        overtime/            ← isi belum diperiksa
        qr-manager/            ← isi belum diperiksa
        report/            ← isi belum diperiksa
        users/page.tsx
        page.tsx              ← dashboard admin utama
      dashboard/
        driver/page.tsx (+ subroutes?)
        ob/
          checklist/page.tsx   ← sudah migrasi ke components/pages/ (#1)
          deep-cleaning/       ← isi belum diperiksa
          laporan/       ← isi belum diperiksa
          plotting/       ← isi belum diperiksa
          stok/       ← isi belum diperiksa
          page.tsx              ← sudah migrasi ke components/pages/ (#2)
        qhse/       ← isi belum diperiksa
        security/       ← isi belum diperiksa (kemungkinan ada jadwal/, patroli/, buku-tamu/, paket/)
      layout.tsx
      page.tsx                ← portal publik utama, DIUPDATE sesi 24 & 25 Agustus (lihat §3 & §3B), belum dipecah ke components/pages/
    components/
      VehicleIcon3D.tsx        ← dibuat sesi 24 Agustus, shared component (lihat §3), dipakai lagi di redesign §3B
      ui/                     ← library komponen (Button, Card, Input, dll) — JANGAN diubah
      InstallPrompt.tsx
      NotifikasiChecklistListener.tsx
      NotifikasiKendaraanListener.tsx
      NotifikasiPatroliListener.tsx
      pages/
        ChecklistOBPage.tsx     ← migrasi #1
        DashboardOBPage.tsx     ← migrasi #2
    hooks/
      useAuthGuard.ts
      useFcmSetup.ts
      lib/                    ← isi belum diperiksa
    lib/
      firebase.ts
      notify.ts
```

**Catatan:** restrukturisasi folder (Fin-Samudera style, `components/pages/` per halaman) masih di tahap #2 dari 6 — lihat §4. Sesi 24 & 25 Agustus sempat loncat ke portal utama & admin/kendaraan buat kerjain fitur baru & perbaikan tampilan duluan (bukan urutan migrasi foldernya), jadi `page.tsx` portal & `admin/kendaraan/page.tsx` **masih dalam bentuk lama** (belum dipecah ke `components/pages/`), isinya aja yang diupdate berkali-kali.

---

## 3. FITUR BARU SESI 24 AGUSTUS 2026: Icon 3D Kendaraan + Overhaul Admin Kendaraan

### Komponen shared baru: `src/components/VehicleIcon3D.tsx`
- Icon kendaraan isometric-style SVG, 5 kategori: Sedan, SUV/MPV, Pickup, Truck, Motor.
- Warna dinamis dari field `warna` (nama warna Indonesia umum — Putih/Hitam/Silver/Merah/Biru/dst — atau hex langsung), pakai shading 3-tone (light/base/dark) buat kesan 3D.
- Export: `VehicleIcon3D` (komponen), `KATEGORI_KENDARAAN` (array 5 kategori), `WARNA_KENDARAAN` (array {label, hex}), `warnaToHex`, `shadeHex`.
- Dipakai di portal (`page.tsx`) dan admin (`admin/kendaraan/page.tsx`) — satu sumber kebenaran, gak digandakan.

### Portal utama (`page.tsx`) — versi sesi 24 Agustus
- **Slideshow manual saja**: auto-geser 6 detik dihapus total. Sekarang geser (swipe touch) atau klik arrow/dots.
- **Icon 3D kendaraan** dipasang di slide hero armada + card "Status Armada Operasional" lengkap, gantiin foto/emoji sebagai identitas visual utama. Ambil `kategori`+`warna` dari `master_kendaraan` (fallback "Sedan"/"Putih" kalau kosong, gak error di kendaraan lama).
- State `kendaraanFotoMap` (buat foto kendaraan di slideshow) dihapus karena udah gak dipakai — foto asli kendaraan sekarang cuma dokumentasi di admin, bukan identitas visual di portal.
- *(Catatan: tampilan hero & card riwayat armada di atas DIROMBAK LAGI di sesi 25 Agustus — lihat §3B. Bagian ini dibiarkan sebagai catatan sejarah.)*

### Admin Kendaraan (`admin/kendaraan/page.tsx`) — dirombak
- **Field baru** di `master_kendaraan`: `kategori` (dropdown 5 pilihan, nentuin bentuk icon), `warna` (dropdown 12 pilihan, nentuin warna icon), `no_rangka`, `no_mesin`, `tanggal_pajak` (tanggal STNK/pajak berlaku sampai).
- **Penting — konflik nama field dihindari**: field `jenis` yang lama (teks bebas, cth "Toyota Avanza") TETAP ADA apa adanya, terpisah dari `kategori` yang baru (buat icon). Jangan disatukan.
- **Preview icon 3D live** di form — update langsung pas pilih kategori/warna.
- **PIC Kendaraan pakai autocomplete**: input teks dengan datalist dari `employees_directory` (master karyawan), tapi tetap bisa isi manual kalau nama gak ada di direktori.
- **Foto dokumentasi** (upload asli ke Cloudinary) tetap ada di form sebagai field opsional terpisah — bukan lagi identitas visual utama.
- **Tabel daftar kendaraan**: icon 3D di kolom Kendaraan (gantiin foto/emoji), kolom baru "Pajak/STNK" dengan badge status (Aktif/Segera Habis ≤30 hari/Kadaluarsa/Belum diisi) dari `getPajakStatus()`, no. rangka & no. mesin ditampilkan ringkas di bawah nama kendaraan kalau diisi.
- **Riwayat maintenance** (modal 4 tab: Odometer/Servis/Pemakaian/Inspeksi) — TIDAK diubah, tetap jalan seperti sebelumnya. Tab **Pemakaian** (dari `operational_vehicle_logs`) sudah berfungsi sebagai riwayat perjalanan dasar (keluar/tiba, tujuan, driver, odometer).
- **Riwayat perjalanan lebih detail** (rute/peta, jarak tempuh, analitik) — **sengaja belum dikerjakan**, permintaan user eksplisit "mungkin kedepan" (nanti-nanti, bukan sekarang).

### Bug yang sempat muncul & sudah difix (sesi 24 Agustus)
- TypeScript error di `page.tsx` (`kategori` does not exist in type `{jenis, warna}`) — penyebab: ada 2 tempat yang define tipe `kendaraanMetaMap`/`metaMap` sebagai `{jenis, warna}`, cuma satu yang ke-rename ke `{kategori, warna}` waktu edit pertama. Sudah disamakan semua ke `kategori`.
- ESLint unused var `kendaraanFotoMap` — state itu emang udah gak dipakai lagi setelah icon 3D gantiin foto sebagai identitas visual; dihapus.
- Status: user sudah konfirmasi baik/gak ada error lagi per sesi itu.

---

## 3B. PERBAIKAN SESI 25 AGUSTUS 2026: Redesign Tampilan Armada (Portal) + Fix Dedup Kendaraan

Konteks: user kasih feedback tampilan hero armada (merah) & card riwayat (hijau) di portal kurang menarik dan gak pas — lanjut ke bug kendaraan kehitung dobel yang kebongkar pas ngetes.

### Portal utama (`page.tsx`) — redesign bagian armada
- **Card riwayat armada (hijau, bawah)** — sebelumnya card per-kendaraan yang bisa diklik/expand buat lihat riwayat hari ini (fetch on-demand ke Firestore tiap klik). Sekarang jadi **list histori teks polos**, langsung dari `logKendaraanMentah` (30 log realtime yang udah ada di state, gak ada fetch tambahan lagi). Tiap baris: jam di kiri (bold), kalimat di kanan — misal *"B 1629 RKP keluar menuju Kantor Pusat — driver Mathias"* atau *"B 1828 DYKI tiba kembali — driver Mildawaty"*. Gak ada lagi klik/expand/badge besar per kendaraan.
  - Fungsi baru: `buatKalimatRiwayat(log)` — ubah 1 baris `KendaraanLog` jadi kalimat (handle status keluar/tiba/bengkel-service, sertakan tujuan & driver kalau ada).
- **Hero slide "armada" (merah, atas)** — sebelumnya list 4 kendaraan teratas gaya card (+ "N kendaraan lainnya di bawah"). Sekarang jadi **bulatan-bulatan (circle) icon mobil 3D**, SEMUA unit langsung kelihatan sekaligus (gak dipotong 4 lagi, auto wrap ke beberapa baris kalau unitnya banyak). Warna border bulatan nunjukin status: **hijau = Standby, merah = Keluar, abu = Service**. Di bawah tiap bulatan: plat nomor (kecil) + label status (kecil, uppercase, warna senada).
- CSS baru (inline style block yang udah ada di file, bukan file terpisah): `.hero-fleet-grid`, `.hero-fleet-circle`, `.hero-fleet-badge`, `.hero-fleet-plate`, `.hero-fleet-status`.
- State & fungsi lama yang jadi gak kepake dihapus (biar gak ESLint unused-var): `expandedKendaraan`, `riwayatKendaraan`, `isLoadingRiwayat`, `handleToggleRiwayatKendaraan`, `ringkasArmada`.

### Bug ditemukan & difix: kendaraan kehitung dobel
- **Root cause**: field `kendaraan` di Firestore (baik di `master_kendaraan` maupun `operational_vehicle_logs`) ternyata bukan cuma plat nomor, tapi string gabungan **"PLAT - NAMA DRIVER (PERUSAHAAN)"**. Grouping/dedup versi lama pakai field ini mentah-mentah sebagai key, jadi 1 plat fisik yang pernah dicatat dengan driver berbeda-beda kehitung sebagai unit terpisah — user cuma punya **11 unit fisik** tapi tampil lebih banyak dari itu.
- **Fix**: helper baru `getPlat(kendaraan)` (potong string sebelum `" - "`) dipakai konsisten di:
  - Efek ambil `master_kendaraan` — state `daftarSemuaKendaraan` & `kendaraanMetaMap` sekarang di-dedup & di-key pakai plat murni.
  - `mobilStatus` (useMemo) — grouping status per kendaraan (dari 30 log terakhir + trip terakhir) sekarang pakai plat murni, bukan field mentah.
- Card riwayat (hijau) TIDAK didedup (memang gak perlu — itu histori event kronologis, 1 plat boleh muncul berkali-kali sebagai baris log berbeda; yang penting kalimatnya tetap nampilin plat murni lewat `.split(" - ")[0]`).
- **Status: sudah dikirim ke user, BELUM dikonfirmasi ketest langsung.** Perlu dicek di localhost apakah sekarang pas 11 unit di hero armada.
- Kalau setelah fix ini masih lebih dari 11: kemungkinan `master_kendaraan` sendiri punya dokumen dengan plat yang beda tipis (typo/spasi/format beda) buat unit fisik yang sama — itu perlu dibersihkan manual di data Firestore, bukan lagi masalah kode.

---

## 4. RENCANA RESTRUKTURISASI FOLDER (Fin-Samudera style) — masih jalan, terpisah dari §3/§3B

Reza punya project lain (Fin-Samudera, React + react-router-dom) dengan struktur `src/pages/` (satu file per halaman) + `src/components/`. SIBM pakai Next.js App Router (routing berbasis folder wajib), solusi yang disepakati: `page.tsx` tiap folder route tetap ada tapi setipis mungkin (cuma import + render), isi lengkap pindah ke `components/pages/XxxPage.tsx`.

### Progress migrasi
- [x] 1. `dashboard/ob/checklist/page.tsx` → `components/pages/ChecklistOBPage.tsx` — selesai, sekalian fix bug timezone `todayISO`.
- [x] 2. `dashboard/ob/page.tsx` → `components/pages/DashboardOBPage.tsx` — selesai, tidak ada bug tambahan yang perlu difix.
- [ ] 3. Sisa route di bawah `dashboard/ob/` (deep-cleaning, laporan, plotting, stok) — **NEXT UP kalau lanjut migrasi**
- [ ] 4. `dashboard/driver`, `dashboard/qhse`, `dashboard/security` + subroute-nya
- [ ] 5. Semua route di bawah `admin/` (termasuk `admin/kendaraan` yang isinya diupdate di §3 — migrasi struktur foldernya masih menyusul, terpisah dari update fitur)
- [ ] 6. Portal publik `app/page.tsx` (paling besar & berisiko, dikerjakan terakhir — isinya sudah diupdate 2x di §3 & §3B, migrasi struktur foldernya masih menyusul)

### Cara kerja per halaman (sudah terbukti di langkah 1 & 2)
User paste isi `page.tsx` yang mau dipindah → dibalikin 2 file:
- `components/pages/XxxPage.tsx` — isi lengkap, nama komponen disesuaikan
- `page.tsx` versi tipis — tinggal import & render

Kalau nemu bug lama di tengah jalan, sekalian dibenerin pas migrasi biar gak nambah kerjaan misah lagi nanti — selalu disebutkan eksplisit kalau ada perubahan behavior, bukan cuma pindah lokasi.

---

## 5. NEXT STEP (mulai chat baru dari sini)

- **Selesai**: dedup kendaraan (§3B) terkonfirmasi benar — Firestore & tabel admin sama-sama nunjukin 10 unit fisik, dugaan "harusnya 11" kemarin cuma tebakan, bukan bug.
- **Selesai**: redesign visual portal utama (`page.tsx`) — lihat §8 untuk detail token & scope.
- Lanjutan (tanya Reza dulu di awal chat baru kalau belum jelas):
  - Terapkan gaya visual §8 ke halaman lain (mis. `admin/kendaraan`) kalau diminta
  - **Lanjut migrasi folder #3**: `dashboard/ob/` sisa (deep-cleaning, laporan, plotting, stok)
  - **Fitur baru lain** kalau ada yang lebih prioritas

## 6. OPEN QUESTIONS

- `kendaraan-reminder.yml`/`scripts/kendaraan-reminder.mjs` — sudah ada di repo, isi & tujuannya belum pernah dibahas, perlu dikonfirmasi Reza kalau mau disentuh/didokumentasikan.
- `fcm-reminder` (workflow + script) — sudah dibuat, belum di-deploy & belum di-test manual (`workflow_dispatch`).
- Icon PWA asli (192x192, 512x512, maskable 512x512) masih belum ada, `manifest.json` masih pakai placeholder.
- Kendaraan lama (sebelum sesi 24 Agustus) belum punya field `kategori`/`warna`/`no_rangka`/`no_mesin`/`tanggal_pajak` terisi — perlu diisi manual satu-satu lewat form edit admin kalau mau datanya lengkap (fallback default aman, gak error, cuma tampil "Sedan"/"Putih"/kosong).

---

## 7. KONTEKS PROJECT (biar chat baru langsung nyambung)

- Reza — kerja di IT, General Affairs (GA), dan Building Management di perusahaan Makassar yang menaungi ~10 anak perusahaan. Bikin aplikasi internal buat streamline kerja staf, terutama GA.
- Project lain milik Reza: **Fin-Samudera** (reimbursement/LPJ/Bon Sementara, React + react-router-dom + Firebase) — struktur foldernya (`src/pages/` + `src/components/`) jadi acuan buat restrukturisasi SIBM (§4).
- Gaya komunikasi Reza: santai, to the point, tidak suka bullet points kecuali perlu (dokumen ini pakai tabel/list karena sifatnya rekap teknis, bukan chat biasa).
- **Kalau buka chat baru: cukup upload file ini di awal chat, gak perlu jelasin ulang dari nol.**

---

## 8. DESIGN TOKEN — REDESIGN PORTAL UTAMA (25/26 Agustus 2026)

Referensi visual biar konsisten kalau mau redesign halaman lain (admin/kendaraan, dashboard, dll) ke gaya yang sama. Warna dasar tetap merah sesuai brand, cuma dirapikan jadi satu sistem token (bukan pastel warna-warni per kategori kayak sebelumnya).

**Scope redesign sesi ini**: cuma bagian landing `page.tsx` — header, hero slideshow, grid quick-action, 2 kartu utama (Status Armada & Overtime), bottom nav mobile. 7 modal (login/tamu/paket/atk/overtime/helpdesk/sbo) **sengaja belum disentuh**, styling lama, logic/state/fetch semua tidak berubah — cuma tampilan.

### Warna (CSS var, didefinisikan di `:root` dalam `<style>` blok page.tsx)
- `--ink: #18181b` — teks utama/judul
- `--ink-soft: #3f3f46` — teks isi/body
- `--muted: #71717a` — teks sekunder/caption
- `--line: #e7e5e4` — border/divider
- `--bg: #f7f6f5` — background halaman & elemen netral
- `--surface: #ffffff` — background kartu
- `--red-700: #9f1d1d` — merah gelap (gradient hero, aksen tegas)
- `--red-600: #dc2626` — merah utama/brand (tombol, ikon, badge)
- `--red-500: #ef4444` — merah terang (aksen ringan)
- `--red-50: #fef2f2` — merah sangat muda (background chip ikon)

### Signature element
Motif garis grid tipis (blueprint/denah bangunan) sebagai overlay di background hero slideshow (`.hero-slideshow::before`) — relevan karena SIBM = Building Management System, jadi kesannya kayak "cetak biru gedung", bukan gradient polos.

### Pola komponen reusable
- `.qa-card` + `.qa-icon-chip` — kartu menu dengan ikon dalam chip bulat/rounded warna `--red-50`, hover naik dikit + shadow merah tipis
- `.section-title` + `.section-title-icon` — header section kartu (ikon chip + judul)
- `.list-row` — baris list dengan border kiri berwarna sebagai indikator status
- `.site-header` — header sticky, blur background, logo + nama brand + tanggal + tombol staf

### Kalau mau redesign halaman lain
Reuse token & pola di atas biar konsisten satu ekosistem SIBM. Tinggal sebut halaman mana yang mau dirapikan, upload isi file-nya, gaya visualnya tinggal dicangkokkan.
