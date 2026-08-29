# SIBM — Project Analisis & Progress

Update terakhir: 29 Agustus 2026 (lanjutan — overtime, helpdesk, monitor-ob, monitor-security, shell admin — SUDAH DI-DEPLOY)
Project: SIBM (Sistem Informasi Building Management) — Next.js + Firebase (Firestore, Storage), hosting via Firebase Hosting, plan **Spark (gratis)**.
Deploy: `next.config.ts` pakai `output: "export"` (static export murni) → API Routes gak jalan di production, jadi semua kerjaan terjadwal/backend pakai GitHub Actions + Firebase Admin SDK, bukan Cloud Functions.

---

## 0. 🔴 MULAI DARI SINI — Ringkasan & Lanjutan (akhir sesi 29 Agustus 2026, lanjutan — §12)

Dokumen ini di-update biar chat/sesi berikutnya langsung nyambung tanpa baca ulang semua histori di bawah. Sesi ini nerusin dari checkpoint sebelumnya (§0 versi lama — kini archived, isinya sudah tercakup di §8E-§11B) dengan fokus baru: `admin/overtime`, `admin/helpdesk`, `admin/monitor-ob` (PDF export), `admin/monitor-security` (filter + roster), dan shell `admin/page.tsx`. Detail teknis lengkap ada di **§12** (cari nomor section-nya).

### A. Apa yang dikerjakan sesi ini

1. **`admin/overtime/page.tsx`** — pisah alur Lembur Gedung/Tenant (approval DIHAPUS, sudah auto "Tercatat" dari portal, jadi tabel-only + filter bulan/tahun + export Excel asli) dari Lembur Tim (approval Setujui/Tolak TETAP jalan, tambah "Lihat Detail Tabel" via modal kalau staf input >1 hari, tambah tombol "Kirim Email Rekap" per periode begitu semua pengajuan periode itu sudah diputuskan).
2. **`admin/helpdesk/page.tsx`** — tampilan kartu grid → tabel (Pelapor, Tanggal, Keluhan, Foto Laporan, Waktu Lapor, Waktu Selesai, Foto Selesai, Status, Aksi), field `waktu_selesai` baru direkam otomatis pas status pertama kali jadi "Selesai", foto bisa diklik jadi lightbox. Notifikasi email ke pelapor pas tiket selesai **SUDAH ADA dari sebelumnya** (`kirimNotifikasiHelpdesk`, jalan berdasar Master Data Karyawan) — dikonfirmasi ulang masih utuh, tidak perlu kode baru.
3. **`admin/atk/page.tsx`** — dicek: notifikasi email ke pemohon pas ATK "Selesai/Diambil" **JUGA SUDAH ADA dari sebelumnya** (`kirimNotifikasiAtkSiap`) — dikonfirmasi masih utuh, tidak ada perubahan kode di file ini sesi ini.
4. **`admin/monitor-ob/page.tsx`** — Export PDF tab Log Pembersihan sekarang isinya laporan LENGKAP per entri (semua jawaban checklist per segmen + foto before/after), bukan cuma ringkasan status. Tab Inspeksi Fasilitas dapat tombol Export PDF baru (sebelumnya gak ada) dengan detail penuh juga. Filter bulan yang tadinya 1 dropdown gabungan ("Agustus 2026") dipecah jadi 2 dropdown independen (Bulan + Tahun) di Log Pembersihan, dan filter Bulan/Tahun baru ditambahkan di Inspeksi (sebelumnya gak ada filter periode sama sekali).
5. **`admin/monitor-security/page.tsx`** — tab Log Patroli dapat filter Bulan/Tahun + Export PDF detail (semua titik patroli, kondisi, foto, area terlewat). Tab Roster Danru: **bug nyata diperbaiki** (tabel dulu nampilin gabungan mentah 2 dokumen bulanan = kebaca ~2 bulan kalender penuh, sekarang persis 1 siklus 11→10 bulan berikutnya), ditambah dropdown pilihan periode (bisa lihat siklus lain, gak cuma yang aktif hari ini), tombol print A4 Landscape dengan kop logo Samudera + judul "ROSTER SECURITY — PERIODE ...", tampilan dipadatkan (chip warna per shift, padding lebih kecil) biar 1 periode (≤31 hari) muat 1 lembar cetak.
6. **`admin/page.tsx`** (shell Control Panel) — logo `logo-samudera.png` **ketemu bug filter CSS** (`invert(1) brightness(0.2)` bikin logo yang aslinya merah/hitam berubah jadi item legam — root cause "logo hitam" yang dilaporkan), dihapus. Tombol logout desktop diganti jadi ikon bulat kecil (bukan pill teks panjang), dan `window.confirm()` native diganti Modal konfirmasi custom (avatar ikon + 2 tombol Batal/Ya Keluar) — jauh lebih modern, konsisten sama UI lain di app ini.
7. **Dependency baru**: `xlsx` (SheetJS, dari npm registry — versi 0.18.5) buat export Excel ASLI (`.xlsx` beneran, bukan CSV berkedok `.csv` yang dinamain manual). Dipakai cuma buat MENULIS file yang datanya digenerate sendiri (bukan parsing file asing), jadi 2 advisory keamanan npm yang nempel di versi ini (prototype pollution & ReDoS, keduanya soal *parsing*) gak relevan buat cara pakai di project ini.

### B. Status: SUDAH commit, merge, push, build, DAN deploy (bukan cuma "siap deploy")

- Commit `5000ac4` di `dev` ("Rombak overtime/helpdesk/monitor-ob/monitor-security, fix logo & logout admin") → push `origin/dev` → checkout `main` → merge `dev` (bersih, 0 konflik) → push `origin/main` (`1ca38c0`) → `npm run build` (sukses, 30 halaman) → `firebase deploy` (hosting + firestore indexes, sukses) → balik ke `dev`.
- **Live di https://sibm-app.web.app**, dikonfirmasi langsung di production: logo tampil warna asli, tombol logout bulat, halaman `admin/overtime` nampilin data real dengan tampilan baru.
- `npx tsc --noEmit`: 0 error. `npx eslint .`: 0 error (101 warning, semuanya pre-existing — dicek satu-satu gak ada yang baru dari perubahan sesi ini).
- Sisa file berubah tapi TIDAK termasuk commit di atas (baru muncul lagi SETELAH commit, karena `npm run build`/`firebase deploy` regenerate artifact-nya): `public/sw.js` & `.firebase/hosting.*.cache` — bakal ikut kebawa di commit dokumentasi ini (§12), no-op fungsional (bukan perubahan kode nyata).

### C. Yang perlu dilanjutkan

1. **Bug filter logo yang sama (`invert(1) brightness(0.2)` / `invert(1) brightness(0)`) masih ada di 2 file lain**: `dashboard/security/page.tsx` dan `admin/qr-manager/page.tsx` — belum diperbaiki sesi ini (Reza cuma minta `admin/page.tsx`), kemungkinan logonya juga tampil item di situ. Tanya Reza kalau mau sekalian dibenerin.
2. **`admin/monitor-security` tab Buku Tamu & Log Paket** — belum dicek apakah butuh filter bulan/tahun & export juga (cuma Log Patroli & Roster yang diminta sesi ini).
3. Poin lama dari §0 versi sebelumnya yang masih relevan (belum berubah): migrasi struktur folder `admin/*` ke `components/pages/` (§4 poin 5) masih belum disentuh; CS masih belum punya halaman terpisah dari OB; audit performa Firestore listener (`onSnapshot` tanpa `limit()`) belum dieksekusi; bug leak `DeepCleaningPage.tsx` (`onSnapshot` gak ke-unsubscribe) belum difix.
4. Kalau nambah query Firestore baru yang gabungin `where` + `orderBy` field beda, inget bikin index-nya juga: edit `firestore.indexes.json` → `firebase deploy --only firestore:indexes`.

Open questions lama yang masih nunggu (belum berubah): lihat §6.

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
        driver/page.tsx      ← sudah migrasi ke components/pages/ (#4), tidak ada bug ditemukan (sudah pakai useAuthGuard & helper tanggal WITA)
        ob/
          checklist/page.tsx   ← sudah migrasi ke components/pages/ (#1)
          deep-cleaning/       ← sudah migrasi ke components/pages/ (#3) + fix bug timezone
          laporan/       ← sudah migrasi ke components/pages/ (#3)
          plotting/       ← sudah migrasi ke components/pages/ (#3) + fix bug timezone `toISO`
          stok/       ← sudah migrasi ke components/pages/ (#3), tidak ada bug ditemukan
          page.tsx              ← sudah migrasi ke components/pages/ (#2)
        qhse/       ← sudah migrasi ke components/pages/ (#4) + fix bug timezone (`tanggal_closed` & nama file CSV pakai `toISOString()` → diganti `getTodayISOLocal()`)
        security/
          buku-tamu/       ← sudah migrasi ke components/pages/ (#4) + fix bug timezone kecil (nama file export CSV)
          jadwal/       ← sudah migrasi ke components/pages/ (#4), tidak ada bug ditemukan (sudah pakai helper tanggal lokal & useAuthGuard)
          patroli/       ← sudah migrasi ke components/pages/ (#4), tidak ada bug ditemukan
          paket/       ← sudah migrasi ke components/pages/ (#4) (dikerjakan sesi sebelumnya, ketemu dalam kondisi sudah selesai), tidak ada bug ditemukan
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
        DeepCleaningPage.tsx    ← migrasi #3
        LaporanKerusakanPage.tsx ← migrasi #3
        PlottingOBPage.tsx      ← migrasi #3
        StockOpnamePage.tsx     ← migrasi #3
        BukuTamuSecurity.tsx    ← migrasi #4
        PengaturanJadwalSecurity.tsx ← migrasi #4
        PatroliSecurityPage.tsx ← migrasi #4
        PaketPage.tsx           ← migrasi #4
        DriverDashboardPage.tsx ← migrasi #4
        DashboardQHSEPage.tsx   ← migrasi #4
    hooks/
      useAuthGuard.ts
      useFcmSetup.ts
      lib/                    ← isi belum diperiksa
    lib/
      firebase.ts
      notify.ts
```

**Catatan:** restrukturisasi folder (Fin-Samudera style, `components/pages/` per halaman) sudah selesai tahap #3 penuh dan **#4 penuh** (dashboard/ob semua, dashboard/security semua, dashboard/driver, dashboard/qhse) — lihat §4. Sisa: #5 (`admin/*`) dan #6 (portal utama `app/page.tsx`), keduanya belum disentuh migrasi strukturnya. Sesi 24 & 25 Agustus sempat loncat ke portal utama & admin/kendaraan buat kerjain fitur baru & perbaikan tampilan duluan (bukan urutan migrasi foldernya), jadi `page.tsx` portal & `admin/kendaraan/page.tsx` **masih dalam bentuk lama** (belum dipecah ke `components/pages/`), isinya aja yang diupdate berkali-kali.

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
- **Hero slide "armada" (merah, atas)** — sebelumnya list 4 kendaraan teratas gaya card (+ "N kendaraan lainnya di bawah"). Sekarang jadi **bulatan-bulatan (circle) icon mobil 3D**, SEMUA unit langsung kelihatan sekaligus (gak dipotong 4 lagi, auto wrap ke beberapa baris kalau unitnya banyak). Warna border bulatan nunjukin status: **hijau = Standby, merah = Keluar, abu = Service**. Di bawah tiap bulatan: plat nomor (kecil) + label status (kecil, uppercase, warna senada).
  - Fungsi baru: `buatKalimatRiwayat(log)` — ubah 1 baris `KendaraanLog` jadi kalimat (handle status keluar/tiba/bengkel-service, sertakan tujuan & driver kalau ada).
- CSS baru (inline style block yang udah ada di file, bukan file terpisah): `.hero-fleet-grid`, `.hero-fleet-circle`, `.hero-fleet-badge`, `.hero-fleet-plate`, `.hero-fleet-status`.
- State & fungsi lama yang jadi gak kepake dihapus (biar gak ESLint unused-var): `expandedKendaraan`, `riwayatKendaraan`, `isLoadingRiwayat`, `handleToggleRiwayatKendaraan`, `ringkasArmada`.

### Bug ditemukan & difix: kendaraan kehitung dobel
- **Root cause**: field `kendaraan` di Firestore (baik di `master_kendaraan` maupun `operational_vehicle_logs`) ternyata bukan cuma plat nomor, tapi string gabungan **"PLAT - NAMA DRIVER (PERUSAHAAN)"**. Grouping/dedup versi lama pakai field ini mentah-mentah sebagai key, jadi 1 plat fisik yang pernah dicatat dengan driver berbeda-beda kehitung sebagai unit terpisah.
- **Fix**: helper baru `getPlat(kendaraan)` (potong string sebelum `" - "`) dipakai konsisten di efek ambil `master_kendaraan` dan `mobilStatus` (useMemo, grouping status per kendaraan).
- **Terkonfirmasi benar**: screenshot `admin/kendaraan` (tabel "10 Unit") dan Firebase Console (dokumen `master_kendaraan` sudah dedup per plat) — armada fisik memang 10 unit, dugaan "seharusnya 11" sebelumnya cuma perkiraan kasar, bukan bug nyata.

### Lanjutan (26 Agustus): bug kedua ditemukan & difix — slideshow tampil 13, Firestore cuma 10
- **Root cause**: `mobilStatus` (useMemo, dipakai slideshow armada) dedup pakai `getPlat(log.kendaraan)` mentah dari 30 log riwayat, TANPA normalisasi. Variasi kecil penulisan plat di log (spasi ganda, huruf besar/kecil beda) kehitung sebagai unit baru di luar 10 unit fisik di `master_kendaraan`.
- **Fix**: `master_kendaraan` (via `daftarSemuaKendaraan`) jadi satu-satunya sumber daftar unit. Ditambah `normalizeKey()` (uppercase + hapus semua spasi) buat cocokkan plat log ke plat canonical master — log yang platnya gak ketemu padanannya di master diabaikan, bukan ditambah jadi unit baru.
- **Status: sudah dikirim ke user, BELUM dikonfirmasi ketest langsung.**

---

## 4. RENCANA RESTRUKTURISASI FOLDER (Fin-Samudera style) — masih jalan, terpisah dari §3/§3B

Reza punya project lain (Fin-Samudera, React + react-router-dom) dengan struktur `src/pages/` (satu file per halaman) + `src/components/`. SIBM pakai Next.js App Router (routing berbasis folder wajib), solusi yang disepakati: `page.tsx` tiap folder route tetap ada tapi setipis mungkin (cuma import + render), isi lengkap pindah ke `components/pages/XxxPage.tsx`.

### Progress migrasi
- [x] 1. `dashboard/ob/checklist/page.tsx` → `components/pages/ChecklistOBPage.tsx` — selesai, sekalian fix bug timezone `todayISO`.
- [x] 2. `dashboard/ob/page.tsx` → `components/pages/DashboardOBPage.tsx` — selesai, tidak ada bug tambahan yang perlu difix.
- [x] 3. Sisa route di bawah `dashboard/ob/` — **SELESAI TOTAL**:
  - [x] `deep-cleaning` → `components/pages/DeepCleaningPage.tsx` — selesai, sekalian fix bug timezone `toISOString()` (status "Hari Ini/Terlewat" & default tanggal form) jadi `getTodayISOLocal()` berbasis WITA.
  - [x] `laporan` → `components/pages/LaporanKerusakanPage.tsx` — selesai, tidak ada bug tambahan yang perlu difix.
  - [x] `plotting` → `components/pages/PlottingOBPage.tsx` — selesai, sekalian fix bug timezone `toISO()` (sama kelas bug dengan checklist/deep-cleaning, dipakai buat default `selectedDate`/`viewMonth` & generate 30 hari).
  - [x] `stok` → `components/pages/StockOpnamePage.tsx` — selesai, tidak ada bug ditemukan (pakai Firestore `Timestamp`, bukan `toISOString()`).
- [x] 4. `dashboard/driver`, `dashboard/qhse`, `dashboard/security` + subroute-nya — **SELESAI TOTAL**:
  - [x] `security/buku-tamu` → `components/pages/BukuTamuSecurity.tsx` — selesai, sekalian fix bug timezone kecil (nama file export CSV pakai `toISOString()` → diganti `getTodayISOLocal()`).
  - [x] `security/jadwal` → `components/pages/PengaturanJadwalSecurity.tsx` — selesai, tidak ada bug ditemukan (sudah pakai helper tanggal lokal sendiri & `useAuthGuard`, bukan pola lama).
  - [x] `security/paket` → `components/pages/PaketPage.tsx` — selesai (dikerjakan sesi sebelumnya, ketemu dalam kondisi sudah selesai & belum di-commit — dikonfirmasi ulang sesi ini), tidak ada bug ditemukan.
  - [x] `security/patroli` → `components/pages/PatroliSecurityPage.tsx` — selesai, tidak ada bug ditemukan (query riwayat sudah `where(petugas==)` + `orderBy`, semua `onSnapshot` sudah ada cleanup).
  - [x] `dashboard/driver` → `components/pages/DriverDashboardPage.tsx` — selesai, tidak ada bug ditemukan (sudah pakai `useAuthGuard` & helper tanggal WITA `Intl.DateTimeFormat` untuk semua field tanggal, bukan `toISOString()`).
  - [x] `dashboard/qhse` → `components/pages/DashboardQHSEPage.tsx` — selesai, **ketemu & difix bug timezone kelas sama** (`new Date().toISOString().split("T")[0]`, basis UTC) di 2 tempat: field `tanggal_closed` yang DITULIS ke Firestore (bukan cuma nama file CSV kayak di `buku-tamu`) & nama file export CSV — sekarang keduanya pakai helper `getTodayISOLocal()` (komponen tanggal lokal device, pola sama seperti di `BukuTamuSecurity.tsx`).
- [ ] 5. Semua route di bawah `admin/` (termasuk `admin/kendaraan` yang isinya diupdate di §3 — migrasi struktur foldernya masih menyusul, terpisah dari update fitur)
- [ ] 6. Portal publik `app/page.tsx` (paling besar & berisiko, dikerjakan terakhir — isinya sudah diupdate 2x di §3 & §3B, migrasi struktur foldernya masih menyusul)

### Cara kerja per halaman (sudah terbukti di langkah 1-4)
User paste isi `page.tsx` yang mau dipindah → dibalikin 2 file:
- `components/pages/XxxPage.tsx` — isi lengkap, nama komponen disesuaikan
- `page.tsx` versi tipis — tinggal import & render

Kalau nemu bug lama di tengah jalan, sekalian dibenerin pas migrasi biar gak nambah kerjaan misah lagi nanti — selalu disebutkan eksplisit kalau ada perubahan behavior, bukan cuma pindah lokasi.

---

## 5. NEXT STEP (arsip — SUDAH DIGANTIKAN §0 di atas, dibiarkan sebagai riwayat historis)

> ⚠️ Section ini ditulis SEBELUM sesi fokus OB & CS (§8E-§10B). Banyak poin di bawah udah selesai/berubah — buat status TERKINI & lanjutan yang beneran aktif, lihat **§0** di paling atas dokumen ini. Section ini dibiarkan apa adanya buat jejak historis, bukan buat diikuti lagi.

- **Selesai**: dedup kendaraan (§3B) terkonfirmasi benar — Firestore & tabel admin sama-sama nunjukin 10 unit fisik.
- **Selesai**: fix bug kedua slideshow tampil 13 vs Firestore 10 (§3B lanjutan) — belum dikonfirmasi ketest langsung user.
- **Selesai**: redesign visual portal utama (`page.tsx`) — lihat §8 untuk detail token & scope.
- **Selesai**: migrasi #3 total (`deep-cleaning`, `laporan`, `plotting`, `stok`) + **migrasi #4 total** (`buku-tamu`, `jadwal`, `paket`, `patroli`, `driver`, `qhse`) — lihat §4. Type-check (`tsc --noEmit`) & lint bersih, 0 error.
- **Belum di-commit**: semua perubahan migrasi #4 (termasuk `paket` yang sudah selesai sebelum sesi ini) masih di working tree, belum di-`git commit`.
- **Audit performa (29 Agustus 2026)**: ada audit lengkap 54 titik `onSnapshot` di seluruh `src/` — banyak query realtime yang narik collection log/riwayat TANPA `limit()` (contoh: `driver_status_logs` di portal utama & `dashboard/security/parkir`, 3 collection di `admin/monitor-security` sekaligus, `daily_plots` di `admin/monitor-ob`, dll) jadi makin lambat seiring data menumpuk. Juga ketemu 1 bug leak nyata: `DeepCleaningPage.tsx` — `onSnapshot` gak pernah ke-unsubscribe (cleanup-nya kebungkus di async helper, gak ke-`return` ke `useEffect`). **Belum dieksekusi** — sempat ke-skip karena Reza alihkan ke redesign portal (poin di bawah), masih nunggu giliran.
- **Selesai (29 Agustus 2026)**: redesign app-style portal utama (`app/page.tsx`) — mockup direview & disetujui, diterapkan ke kode asli. Detail lengkap di §8B. Type-check & lint bersih. **Belum di-commit.**
- **Selesai (29 Agustus 2026, lanjutan)**: redesign tampilan `admin/*` — lihat §8C untuk detail lengkap. Semua 11 halaman admin (shell `admin/page.tsx` + 10 subhalaman) sekarang pakai token & pola visual yang sama satu ekosistem dengan portal (§8/§8B). Type-check & lint bersih (0 error). Diverifikasi langsung di browser (desktop & mobile). **Belum di-commit.**
- **Selesai (29 Agustus 2026, lanjutan lagi — "selesaikan semua")**: badan konten (tabel, kartu, badge status, tombol, form) di semua 10 subhalaman admin ikut direstyle ke token yang sama — bukan cuma shell/header lagi. Dikerjain paralel pakai 6 subagent (per file/pasangan file), sempat kena sesi limit di tengah jalan lalu dilanjutin otomatis pas limit reset. Detail lengkap & daftar keputusan warna per halaman ada di §8D. Verifikasi akhir: `tsc --noEmit` 0 error, `npm run lint` 0 error (103 warning semuanya pre-existing, gak nambah), dicek visual di browser untuk SEMUA 11 halaman (kendaraan, monitor-ob, monitor-security, users, overtime, atk, broadcast, helpdesk, karyawan, report) — semua render bersih, gak ada console error. **Belum di-commit** — tanya Reza dulu sebelum commit.
- **Open question ke Reza (belum dijawab)**: soal "data team ob/cs tidak sesuai" yang disebut Reza pas awal minta redesign — sudah dicek struktur baca-tulis `plot_lantai` (portal vs `PlottingOBPage.tsx`) dan KONSISTEN, jadi kemungkinan bukan bug field yang salah. Butuh detail spesifik dari Reza: nama yang salah muncul / area yang salah / data basi — belum dikonfirmasi ulang.
- Lanjutan (tanya Reza dulu di awal chat baru kalau belum jelas):
  - **Terapkan fix performa Firestore listener** (lihat poin audit di atas) — daftar lengkap file+limit yang disarankan ada di riwayat chat sesi ini.
  - **Klarifikasi bug data tim OB/CS** (poin open question di atas).
  - **Lanjut migrasi folder #5**: `admin/*` sudah diredesign TAMPILANNYA PENUH (shell + badan konten, §8C/§8D) tapi STRUKTUR foldernya (pindah `page.tsx` tipis + isi ke `components/pages/`) masih belum disentuh sama sekali — semua 11 file masih 1 file besar di `app/admin/`. Portal publik `app/page.tsx` (#6) juga sama kondisinya (tampilan sudah, struktur belum).
  - Terapkan gaya visual §8B (app-style: bottom nav, tren aktivitas, kalender aktivitas) ke halaman lain (mis. `admin/kendaraan`, dashboard OB/security) kalau diminta — jadi referensi baru buat versi web/laptop juga (sidebar nav, lihat mockup canvas sesi ini).
  - **Fitur baru lain** kalau ada yang lebih prioritas

## 6. OPEN QUESTIONS

- `kendaraan-reminder.yml`/`scripts/kendaraan-reminder.mjs` — sudah ada di repo, isi & tujuannya belum pernah dibahas, perlu dikonfirmasi Reza kalau mau disentuh/didokumentasikan.
- `fcm-reminder` (workflow + script) — sudah dibuat, belum di-deploy & belum di-test manual (`workflow_dispatch`).
- Icon PWA asli (192x192, 512x512, maskable 512x512) masih belum ada, `manifest.json` masih pakai placeholder.
- Kendaraan lama (sebelum sesi 24 Agustus) belum punya field `kategori`/`warna`/`no_rangka`/`no_mesin`/`tanggal_pajak` terisi — perlu diisi manual satu-satu lewat form edit admin kalau mau datanya lengkap (fallback default aman, gak error, cuma tampil "Sedan"/"Putih"/kosong).
- Rekomendasi `limit()` dari audit performa 29 Agustus belum dikonfirmasi Reza per-collection — beberapa (mis. `PaketPage.tsx`/`BukuTamuSecurity.tsx` yang punya fitur search) perlu dicek dulu apakah search-nya butuh riwayat penuh sebelum dibatasi, biar gak nyasar motong fitur yang jalan.

---

## 7. KONTEKS PROJECT (biar chat baru langsung nyambung)

- Reza — kerja di IT, General Affairs (GA), dan Building Management di perusahaan Makassar yang menaungi ~10 anak perusahaan. Bikin aplikasi internal buat streamline kerja staf, terutama GA.
- Project lain milik Reza: **Fin-Samudera** (reimbursement/LPJ/Bon Sementara, React + react-router-dom + Firebase) — struktur foldernya (`src/pages/` + `src/components/`) jadi acuan buat restrukturisasi SIBM (§4).
- Gaya komunikasi Reza: santai, to the point, tidak suka bullet points kecuali perlu (dokumen ini pakai tabel/list karena sifatnya rekap teknis, bukan chat biasa).
- **Kalau buka chat baru: cukup upload file ini di awal chat, gak perlu jelasin ulang dari nol.**

---

## 8. DESIGN TOKEN — REDESIGN PORTAL UTAMA

Referensi visual biar konsisten kalau mau redesign halaman lain (admin/kendaraan, dashboard, dll) ke gaya yang sama. Warna dasar tetap merah sesuai brand, cuma dirapikan jadi satu sistem token (bukan pastel warna-warni per kategori kayak sebelumnya).

### 8B. REDESIGN APP-STYLE (29 Agustus 2026) — menggantikan/melengkapi 8A di bawah

Latar belakang: Reza kirim referensi visual dari app finance ("Kazz" dkk — dark app-style UI, bottom nav, wallet balance card, chart tren, kalender heatmap) dan minta portal SIBM terasa lebih modern & app-like, gampang dipantau. Sebelum eksekusi ke kode asli, dibuatkan **mockup dulu** (canvas Claude Design, 2 artboard: mobile + desktop) buat direview — disetujui ("sudah sesuai"), baru diterapkan ke `page.tsx`.

**Perubahan struktural** (semua logic/state/handler/7 modal TIDAK berubah, cuma lapisan tampilan + 2 widget baru):
- Hero slideshow (carousel brand/OB/armada/security, swipe/arrow/dots) **dihapus total** — diganti `.ringkasan-strip` (kartu merah gradient statis, 3 angka: OB bertugas, kendaraan aktif, shift security).
- `desktop-grid` (grid 6 quick-action, desktop-only) + `mobile-nav` (bar scroll 6 ikon quick-action, mobile-only) yang isinya DUPLIKAT — disatukan jadi 1 grid **Menu Cepat** (`repeat(auto-fit, minmax(150px,1fr))`) yang dipakai di HP maupun desktop, gak ada lagi duplikasi.
- **Bottom nav app-style baru** (`.app-bottom-nav`, mobile-only, fixed): Home (scroll ke atas) · Monitor (scroll ke widget Tren Aktivitas) · FAB tengah "+" (scroll ke Menu Cepat) · Info (scroll ke atas, badge titik kalau ada pengumuman) · Profil (buka modal login) — ini KEPUTUSAN DESAIN sepihak karena belum ada halaman monitor/notifikasi/profil publik sungguhan, jadi 4 dari 5 tombol scroll ke section terkait, bukan navigasi ke route baru. Kasih tahu kalau mau behavior beda.
- Emoji ikon lama (🧑‍💼📦🖇️⏱️🛠️🦺🔒 dst) di header/menu-cepat/bottom-nav **diganti SVG line icon** (custom, di top file `page.tsx`) — biar kesan modern kayak referensi. **Emoji di dalam 7 modal SENGAJA TIDAK disentuh** (di luar scope mockup yang disetujui).
- 2 widget baru:
  - **Tren Aktivitas Gedung** — bar chart 7 hari terakhir, 4 kategori (Tamu/Kendaraan/Tiket Selesai/Paket), warna semantik (hijau/biru/amber/ungu, BUKAN dari palet merah brand — sengaja dipisah biar gak rancu sama chrome UI).
  - **Kalender Aktivitas** — heatmap kalender bulan berjalan (5 level intensitas, gradasi merah `--red-50` → `--red-700`). **Jujur soal keterbatasan data**: sumbernya dari collection yang sudah dibatasi `limit()` (30-60 dokumen terakhir per collection), BUKAN query baru tanpa batas — jadi kalau volume harian tinggi, hari-hari yang lebih lama di kalender bisa belum kecover jendela limit-nya dan ditandai "belum ada data" (kotak putus-putus), bukan dianggap 0/kosong. Kalau mau akurat penuh 1 bulan, idealnya bikin job agregasi harian (GitHub Actions + Firebase Admin SDK, pola sama kayak `scripts/*-reminder.mjs`) yang nulis rekap ke collection kecil — belum dikerjakan, next step kalau prioritas.
- Data baru yang ditarik (tambahan, semua pakai `limit()`, konsisten sama semangat audit performa §Next Step): `security_visitor_logs` limit(60), `packages` limit(60) — dipakai buat 2 widget di atas + dashboard, BUKAN buat modal pencarian tamu/paket (itu tetap pakai `getDocs` on-demand seperti sebelumnya).
- **Bug ketemu & difix sekalian**: state `maintenanceInfo` awalnya diinisialisasi string placeholder `"Memuat status operasional gedung..."` (truthy) — dulu cuma dipakai buat teks, aman. Sekarang string itu JUGA dipakai sebagai flag boolean di Ringkasan Hari Ini & Status Operasional (nampilin "Ada perbaikan sedang berjalan" kalau truthy) — placeholder loading yang truthy bikin sekilas salah nampilin status "ada perbaikan" pas pertama buka. Fix: initial value diganti `""`.
- **Fitur lama yang dipertahankan** (bukan dihapus, cuma dipindah bentuk): plot besok (muncul setelah jam 20:00 WITA) sekarang jadi strip kecil di bawah "Tim Bertugas Hari Ini", bukan slide carousel terpisah. Icon 3D kendaraan (`VehicleIcon3D`, dari §3) dipindah jadi strip horizontal scroll di kartu "Riwayat Armada Operasional", bukan hilang.
- **React Compiler**: project ini punya `react-hooks/preserve-manual-memoization` sebagai ESLint **error** (bukan warning) — kalau bikin `useMemo` baru dengan akses properti nested (`obj.field` di dalam `.forEach`/`.reduce`), gampang mismatch sama inferensi compiler dan GAGAL BUILD. Solusi yang dipakai: beberapa komputasi turunan baru (`timBertugasHariIni`, `trenTotal`) sengaja **TANPA** `useMemo` (plain const/IIFE) — sesuai rekomendasi Next.js: React Compiler otomatis memoize, jadi `useMemo` manual makin jarang perlu.
- Verifikasi: `tsc --noEmit` + `npm run lint` bersih (0 error, 0 warning baru), dicek langsung di dev server (mobile & desktop viewport) — semua data live (OB/CS, armada, security, overtime, riwayat) render normal, modal `Lacak Tamu` dkk belum diverifikasi ulang buka-tutupnya tapi kodenya tidak diubah.
- **Belum di-commit** ke git.

### 8A. Token & pola dasar (25/26 Agustus 2026, masih berlaku)

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
- **(baru 29 Agustus, khusus dipakai di widget/status, BUKAN aksen brand)**: `--ok:#16a34a`/`--ok-50`, `--info:#2563eb`/`--info-50`, `--warn:#d97706`/`--warn-50`, `--accent:#7c3aed`

### Signature element
Motif garis grid tipis (blueprint/denah bangunan) sebagai overlay — dulu di background hero slideshow, sekarang pindah ke `.ringkasan-strip::before` — relevan karena SIBM = Building Management System, jadi kesannya kayak "cetak biru gedung", bukan gradient polos.

### Pola komponen reusable
- `.qa-card` + `.qa-icon-chip` — kartu menu dengan ikon dalam chip bulat/rounded warna `--red-50`, hover naik dikit + shadow merah tipis
- `.section-title` + `.section-title-icon` — header section kartu (ikon chip + judul)
- `.list-row` — baris list dengan border kiri berwarna sebagai indikator status
- `.site-header` — header sticky, blur background, logo + nama brand + tanggal + tombol staf
- **(baru)** `.team-row` + `.team-avatar`/`.team-avatar-fallback` — baris staf bertugas (foto/inisial + nama + sub-label + badge status)
- **(baru)** `.status-op-row` — baris ringkas status operasional (icon chip + label + value + dot warna)
- **(baru)** `.tren-bar-col`/`.tren-bar` — kolom bar chart 4-series
- **(baru)** `.kalender-cell` — sel heatmap kalender
- **(baru)** `.app-bottom-nav`/`.nav-item`/`.nav-fab` — bottom nav app-style, mobile-only

### Kalau mau redesign halaman lain
Reuse token & pola di atas biar konsisten satu ekosistem SIBM. Tinggal sebut halaman mana yang mau dirapikan, upload isi file-nya, gaya visualnya tinggal dicangkokkan.

### 8C. Redesign `admin/*` (29 Agustus 2026) — sesi lanjutan, satu ekosistem sama §8/§8B

Latar belakang: sesi sebelumnya udah mulai redesign shell 9 dari 10 subhalaman admin (`atk`, `broadcast`, `helpdesk`, `karyawan`, `kendaraan`, `monitor-ob`, `monitor-security`, `overtime`, `users`) — pola konsisten: tambah token `:root` yang sama kayak §8A, ganti top navbar lama (inline style, emoji ⬅️/👑) jadi `.site-header` + `.back-btn` + `.admin-badge` (ikon SVG `IconArrowLeft`/`IconUserCircle`, didefinisikan ulang per file bukan shared component — konsisten sama pola project ini), dan ganti hero lama jadi `.admin-hero`/`.admin-hero-content` (gradient + motif grid tipis, sama kelas CSS-nya kayak `.ringkasan-strip::before` di portal). **Badan halaman (tabel/form/list di bawah hero) TIDAK disentuh** — scope-nya cuma shell/header, sama kayak pola §8/§8B yang misahin "chrome" dari konten fungsional.

Sesi ini nerusin yang masih tanggung:
- **`admin/qr-manager/page.tsx`** & **`admin/report/page.tsx`** — sebelumnya baru dapat token + back-btn doang (belum ada `.admin-hero`, `qr-manager` malah belum ada judul hero sama sekali karena strukturnya beda — panel fungsional gabung sama judul). Diselesaikan: ditambah `.admin-hero` di keduanya, `qr-manager` judul "🖨️ Mesin Pencetak QR Code" yang tadinya duplikat di dalam panel dipindah jadi hero title "QR CODE GENERATOR" (panel di bawahnya cuma sisa tombol cetak, gak ada perubahan fungsi). `report/page.tsx` pakai class `.header-bar` sendiri (bukan `.site-header`) karena butuh slot ekstra (dropdown periode + tombol cetak) — warna background disamain ke pola blur putih yang sama, hero baru ditambah `no-print` (gak ikut kecetak PDF, laporan cetak tetap pakai kop "EXECUTIVE SUMMARY" sendiri yang sudah ada).
- **`admin/page.tsx`** (Control Panel, shell utama admin) — **ternyata BELUM disentuh sama sekali** di sesi sebelumnya meskipun beberapa subhalaman udah nyebut "konsisten dengan shell admin/page.tsx" di komentar kode (aspirasional, belum match). Sekarang diredesign penuh: token `:root`, `.site-header` (logo + label "Admin Desk", tombol logout ikon `IconLogOut` gantiin emoji 🚪), `.admin-hero` (judul "CONTROL PANEL" + badge "Halo, {nama}" pakai `IconUserCircle`, gantiin badge pill lama), dan 11 kartu menu grid — icon emoji (👥🏢🚗📢🖇️⏱️🛠️🧹🛡️🖨️📑) diganti SVG line icon, warna chip icon per kartu (dulu pastel hex sembarangan per kategori) diganti rotasi token `info/warn/ok/red/accent` (sama warna yang dipakai widget Tren Aktivitas §8B) biar satu sistem warna, bukan pastel lepas-lepas. Bottom nav mobile-nya juga ikut diganti SVG.
- **Ikon SVG dipakai ulang dari set yang udah ada di portal** (`src/app/page.tsx`, lihat definisi `IconIdCard`, `IconClipboard`, `IconClock`, `IconWrench`, `IconTruck`, `IconShield`, `IconChevronRight` dst) — bukan bikin ulang dari nol, biar bentuk garis/stroke-width konsisten. Yang belum ada di portal dan baru dibikin khusus buat shell admin: `IconBuilding` (karyawan), `IconMegaphone` (broadcast/pengumuman), `IconBroom` (monitor-ob/kebersihan), `IconPrinter` (qr-manager), `IconFileText` (laporan/report), `IconLogOut` (logout). Kalau nanti portal atau halaman lain butuh ikon yang sama, tinggal copy dari `admin/page.tsx` — masih belum diekstrak ke shared component file, konsisten sama keputusan project ini (duplikasi kecil per file, bukan premature abstraction).
- Verifikasi: `tsc --noEmit` (0 error) + `npm run lint` (0 error, semua warning yang muncul udah ada sebelum sesi ini — gak ada warning baru). Dicek langsung di dev server: `admin/page.tsx` (desktop & mobile viewport, hero/grid/bottom-nav render benar, hover warna per kartu sesuai token), `admin/qr-manager` & `admin/report` (hero + header nyambung ke konten lama tanpa masalah, data live report tetap kebaca normal).
- **Belum di-commit** ke git (bareng redesign §8B yang juga belum di-commit).

### 8D. Redesign `admin/*` — badan konten (29 Agustus 2026, lanjutan lagi)

Reza minta "lanjutkan dan selesaikan semua" — jadi bagian yang di §8C sengaja di-skip (badan konten: tabel, kartu data, badge status, tombol, form di 10 subhalaman admin — di luar `admin/page.tsx` yang shell-nya udah full dikerjain §8C) sekarang ikut direstyle ke token yang sama. Cakupannya PURE STYLING — gak ada logic/state/handler/Firestore call/struktur JSX yang diubah, cuma nilai warna (hex → `var(--token)`).

**Cara kerja**: dipecah jadi 6 subagent paralel (per file/pasangan file: `atk`+`broadcast`, `helpdesk`+`karyawan`, `kendaraan` sendiri, `monitor-ob`+`monitor-security`, `overtime`+`users`, `qr-manager`+`report`), masing-masing dikasih tabel mapping warna lama→token yang sama. Sempat ke-interupsi pas lagi jalan karena kena sesi limit Claude di tengah semua subagent kerja (beberapa baru setengah jalan) — begitu limit reset, semua 6 di-resume via pesan lanjutan (bukan restart dari nol, langsung nerusin dari state terakhir), dan semuanya selesai bersih.

**Tabel mapping warna** (dipakai konsisten di semua file):
- `white`/`#fff`/`#ffffff` (card bg) → `var(--surface)`
- `#f8fafc`/`#f7fafc`/`#edf2f7`/`#f1f5f9` (bg abu muda) → `var(--bg)` untuk section full-bleed, atau literal muda dipertahankan kalau cuma stripe/hover halus dalam kartu putih (judgment call per subagent)
- `#e2e8f0`/`#cbd5e0`/`#edf2f7` (border) → `var(--line)`
- `#2d3748`/`#1a202c` (heading gelap) → `var(--ink)`
- `#4a5568`/`#718096` (teks sekunder) → `var(--ink-soft)`/`var(--muted)`
- `#a0aec0` → `var(--muted)`
- `#3182ce`/`#2b6cb0`/`#2c5282`/`#ebf8ff` (biru) → `var(--info)`/`var(--info-50)`
- `#38a169`/`#48bb78`/`#2f855a`/`#f0fff4`/`#e6fffa` (hijau) → `var(--ok)`/`var(--ok-50)`
- `#e53e3e`/`#c53030`/`#f56565`/`#fff5f5`/`#fed7d7` (merah non-brand-header) → `var(--red-600)`/`var(--red-50)` (dark-text-on-light-chip kadang dipetakan ke `var(--red-700)` biar kontrasnya tetap kebaca)
- `#d69e2e`/`#dd6b20`/`#ecc94b`/`#c05621` (amber/oranye) → `var(--warn)`/`var(--warn-50)`
- `#805ad5`/`#d53f8c`/`#97266d` (ungu/pink) → `var(--accent)`/literal `#f5f3ff` (gak ada token `--accent-50`)
- `#319795` (teal, gak ada token khusus) → dipetakan ke `var(--ok)` di kebanyakan tempat (kadang `var(--info)` tergantung konteks tab)
- Border tipis yang gak ada token persis (`#bee3f8`, `#9ae6b4`, `#feb2b2`, dst) → `rgba(token-rgb, 0.2–0.35)`, niru pola yang udah ada di `.admin-badge` (`rgba(37,99,235,0.2)`)
- `boxShadow` rgba disesuaikan ke rgb token barunya (misal `rgba(49,130,206,...)` → `rgba(37,99,235,...)` buat `--info`) tanpa ubah struktur shadow-nya

**Keputusan desain per file yang perlu dicatat** (biar konsisten kalau nanti nambah halaman serupa):
- `kendaraan/page.tsx`: TERNYATA gak ada widget `.hero-fleet-grid` circle di file ini (sempat dikira ada dari deskripsi §3) — grep konfirmasi nol match, jadi gak ada boundary hero/badan yang perlu dipisah khusus di sini. `VehicleIcon3D` & `warnaToHex`/`shadeHex` gak disentuh (itu shared component terpisah).
- `qr-manager/page.tsx`: trik lama `${themeColor}40` (hex+alpha suffix) diganti pola `themeColorRGB` constant (`"220,38,38"`/`"22,163,74"`) dipakai lewat `rgba(${themeColorRGB},0.25)` karena `var()` string gak bisa digabung alpha-suffix kayak hex literal.
- `report/page.tsx`: `@media print { ... }` block SENGAJA tidak disentuh (warna hitam/putih/abu polos buat hasil cetak PDF harus tetap apa adanya). Kontrol dropdown periode + tombol "Cetak PDF" di `.header-bar` juga dibiarkan hardcoded karena scope-nya masih dianggap "header" (batas antara §8C dan §8D agak kabur di titik ini — kalau mau dirapikan juga, tinggal minta).
- `users/page.tsx`: badge role/departemen (QHSE=hijau, Security=merah, OB=amber) dipertahankan bedanya, cuma warnanya dipetakan ke token — bukan disamain semua.
- `monitor-ob/monitor-security`: 4 tab tiap halaman sengaja dikasih 4 token warna beda (`ok`/`warn`/`red-600`/`info`) biar tetap gampang dibedain visual meski sumber warnanya (termasuk teal `#319795`) gak seragam di kode lama.

**Verifikasi akhir**: `npx tsc --noEmit` 0 error, `npm run lint` 0 error (103 warning total, semuanya pre-existing — gak ada warning baru dari perubahan ini). Dicek visual langsung di browser untuk kesebelas halaman (`kendaraan`, `monitor-ob`, `monitor-security`, `users`, `overtime`, `atk`, `broadcast`, `helpdesk`, `karyawan`, `report`, dan `admin/page.tsx` dari §8C) — semua render bersih, warna status/badge/tab konsisten satu sistem, gak ada console error.

**Belum di-commit** ke git — masih numpuk sama redesign §8B & §8C yang juga belum di-commit, semuanya di working tree yang sama.

### 8E. Redesign `dashboard/ob/page.tsx` (29 Agustus 2026) — mulai fokus OB & CS

Reza minta fokus ke bagian OB & CS dulu, mulai dari `components/pages/DashboardOBPage.tsx` (dashboard utama staf OB & CS, sudah migrasi struktur di §4 poin 2, tinggal tampilannya yang lama/beda sistem). Diredesign penuh pakai token & pola yang sama dengan §8A/§8B/§8C (bukan bikin sistem baru) — halaman ini bentuknya "menu launcher + widget" jadi pola acuannya `admin/page.tsx` (§8C): `:root` token sama persis, `.site-header`/`.logout-btn`, `.admin-hero` (judul "CLEANING CENTER", badge "PIC: {nama}"), `.admin-grid`/`.admin-card` buat 4 menu utama (warna dipetakan lewat `tokenColors` rotasi `ok/warn/red/accent`, sama pola kayak `admin/page.tsx`), ditambah beberapa class baru yang cuma dipakai di halaman ini: `.shift-card` (badge lokasi shift, ijo=`--ok` kalau sudah diplot / merah=`--red` kalau belum), `.stock-banner`+`.stock-chip` (peringatan stok menipis), `.coord-card` (2 kartu khusus Koordinator — plotting & jadwal deep cleaning, gradient `--info`→biru tua dan `--accent`→ungu tua, gantiin gradient teal/ungu lama yang gak ada di sistem token), dan `.dc-row`/`.dc-badge`/`.dc-status` (list tugas deep cleaning, warna hari-ini=`--warn`, selesai=`--ok`). Emoji lama di header/hero/menu/koordinator/bottom-nav diganti SVG line icon baru (`IconMapPin`, `IconAlertTriangle`, `IconMap`, `IconCalendar`, `IconDroplet`, `IconHome`, sisanya reuse dari set admin: `IconUserCircle`, `IconClipboard`, `IconClock`, `IconWrench`, `IconChevronRight`, `IconLogOut`).

**Modal Klaim Overtime SENGAJA TIDAK disentuh** (styling maupun emoji) — konsisten sama keputusan scope §8B/§8D yang selalu mengecualikan isi modal dari redesign shell/konten utama. Tidak ada logic/state/handler/Firestore call yang diubah sama sekali, murni styling.

Verifikasi: `npx tsc --noEmit` 0 error, `npx eslint` 0 error di file ini. Dicek langsung di dev server (desktop & mobile viewport) via Browser pane — hero, shift card, stock banner, panel koordinator, grid menu, dan bottom nav semua render sesuai token; modal Klaim Overtime dites buka dan tampil normal. **Belum di-commit.**

Next kalau lanjut fokus OB & CS: `ChecklistOBPage.tsx`, `StockOpnamePage.tsx`, `LaporanKerusakanPage.tsx`, `PlottingOBPage.tsx`, `DeepCleaningPage.tsx` (semua di `components/pages/`, migrasi struktur §4 sudah selesai tapi tampilannya belum ikut token ini) — baru lanjut ke CS (belum ada halaman terpisah, masih nyatu di OB & CS Desk yang sama).

### 8F. Redesign `ChecklistOBPage.tsx` + fix bug jadwal plot Sabtu/Minggu + KOREKSI migrasi §4 (29 Agustus 2026)

**Redesign `ChecklistOBPage.tsx`**: token & pola sama persis dengan §8A-8E (bukan cuma shell — seluruh badan halaman ikut, termasuk form 2-step, checklist per segment, upload foto before/after, dan tab riwayat). Brand warna modul checklist dipetakan dari teal lama (`#319795` dkk) ke token `--ok` (hijau), konsisten sama pemetaan yang sudah dipakai buat kartu "Kerjaan Rutin Harian" di §8E. Emoji diganti SVG line icon baru (`IconArrowLeft`, `IconCamera`, `IconUpload`, `IconTrash`, `IconCheck`, `IconX`, `IconInbox`, sisanya reuse dari set §8E). Tidak ada logic/state/handler/Firestore call yang diubah.

**⚠️ TEMUAN PENTING — klaim migrasi §4 poin 3 buat `plotting` TERNYATA SALAH**: pas mau fix bug jadwal weekend di `PlottingOBPage.tsx`, perubahan kode gak muncul sama sekali di browser walau dev server sudah di-restart bersih. Investigasi ketemu: `src/app/dashboard/ob/plotting/page.tsx` **BUKAN thin wrapper** — isinya masih 564 baris kode lengkap versi LAMA (pre-migrasi), termasuk bug timezone `toISO()` pakai `d.toISOString().split("T")[0]` (basis UTC) yang katanya sudah difix di §4. File `components/pages/PlottingOBPage.tsx` yang sudah benar (fix timezone + sekarang fix weekend juga) **selama ini orphaned, gak pernah di-import kemana-mana** — kerja migrasi/fix sesi-sesi sebelumnya nyata ada tapi gak pernah "disambungkan" ke route aslinya, jadi user selama ini masih pakai versi lama tanpa sadar. **Dicek juga `stok` (406 baris) dan `laporan` (257 baris) — SAMA-SAMA masih full kode lama, bukan thin wrapper**, sedangkan `checklist` dan `deep-cleaning` sudah benar (dikonfirmasi baca langsung). Kesimpulan: klaim "selesai" migrasi §4 poin 3 di atas TIDAK BISA dipercaya penuh untuk `stok`/`laporan` — perlu dicek ulang & disambungkan juga (belum dikerjakan sesi ini, di luar scope yang diminta Reza).

**Fix yang dikerjakan** (di `components/pages/PlottingOBPage.tsx`, lalu `app/dashboard/ob/plotting/page.tsx` diganti jadi thin wrapper yang benar-benar import dari situ — migrasi §4 poin 3 utk `plotting` BARU SEKARANG benar-benar selesai & tersambung):
- Helper baru `isWeekend(dateISO)` (Sabtu=6/Minggu=0 via `Date.getDay()`).
- `generateSebulan` (generate otomatis 30 hari): tiap tanggal yang jatuh weekend sekarang ditulis `plot_lantai: {}` (dikosongkan, bukan di-skip — biar plot lama yang mungkin nyangkut di tanggal weekend ikut ke-clear pas regenerate), bukan diisi rotasi cleaning kayak sebelumnya.
- Form manual per-tanggal: kalau `selectedDate` weekend dan belum ada dokumen plot buat tanggal itu, field "Pelayanan Khusus OB" gak lagi otomatis ke-prefill nama OB Pelayanan Tetap (dulu selalu keisi walau weekend). Ditambah banner kuning peringatan "akhir pekan" di atas form — field tetap bisa diisi manual kalau memang ada kebutuhan khusus (bukan dikunci total).
- Kalender bulan (kolom kanan): baris weekend sekarang ditandai `(Sab · Libur)`/`(Min · Libur)` di kolom tanggal, background abu, dan SEMUA kolom area dipaksa tampil "-" (bukan baca dari `monthPreview` yang mungkin masih nyimpan data lama) — jadi walau ada plot lama tersisa di Firestore buat tanggal weekend yang belum di-regenerate, tampilannya tetap konsisten "libur", gak menyesatkan koordinator.

**Verifikasi**: `npx tsc --noEmit` 0 error, `npx eslint` 0 error (1 warning unused-eslint-disable di baris 248, dikonfirmasi PRE-EXISTING lewat `git stash` — bukan dari perubahan sesi ini). Dicek di browser (dev server sempat di-restart karena awalnya nyangkut serving bundle lama dari route yang belum tersambung) — bukti nyata di data real project (tanggal 2026-08-29 itu Sabtu): banner weekend muncul, dan kalender bulan Agustus 2026 benar nunjukin tiap Sabtu/Minggu sebagai "Libur" dengan semua kolom "-". **Tombol "Generate 30 Hari ke Depan" SENGAJA TIDAK diklik pas verifikasi** karena itu batch-write sungguhan ke Firestore (bisa nimpa data real koordinator) — kebenaran logic-nya divalidasi lewat pembacaan kode + hasil tampilan kalender, bukan eksekusi langsung. **Belum di-commit.**

**Follow-up yang belum dikerjakan** (di luar scope yang diminta sesi ini, dicatat biar gak lupa): `stok` & `laporan` di `app/dashboard/ob/` perlu dicek & disambungkan ke `components/pages/` versi mereka (kalau isinya udah beda/lebih baru, perlu direkonsiliasi dulu kayak kasus `plotting` ini) sebelum redesign visualnya dilanjutkan.

### 8G. `ChecklistOBPage.tsx` — perbaikan konten area + fitur baru (29 Agustus 2026, lanjutan)

Reza kasih detail area kerja yang selama ini salah/generik (checklist per lantai pakai template default toilet pria/wanita + area kerja, padahal Lantai 1 & Lantai 5 areanya beda), plus 4 fitur baru. Semua di `components/pages/ChecklistOBPage.tsx` kecuali disebutkan lain.

**1. Konten segment per area diperbaiki**:
- `SEGMENTS_LANTAI1` (baru, ganti `buatSegmenLantai(1)`): Toilet (cuma 1, bukan pria/wanita terpisah), Gudang, Parkiran, Bagian Depan Parkiran, Taman.
- `SEGMENTS_LANTAI5` (baru, ganti `buatSegmenLantai(5)`): TANPA Toilet — Gudang, Ruang Pompa, Rooftop, Tandon Air.
- Lantai 2-4 masih pakai `buatSegmenLantai()` (toilet pria/wanita + area kerja) — gak disebut perlu diubah.

**2. Minimal 2 pasang foto before/after** (`MINIMAL_PASANGAN_FOTO = 2`, sebelumnya cuma 1): submit yang foto lengkapnya kurang dari 2 pasang gak langsung `alert()` kayak dulu, tapi munculin modal token-based "Foto Belum Cukup" (icon kamera, teks jumlah pasang yang udah ke-upload) dengan tombol "+ Tambah Foto Sekarang" (nutup modal, auto-nambah slot pasangan foto baru kalau semua slot yang ada udah lengkap, lalu scroll ke section Foto Bukti) dan "Nanti Dulu" (nutup aja).

**3. Reminder WA patroli tiap 3 jam** (`scripts/checklist-reminder.mjs` + `.github/workflows/checklist-reminder.yml`) — sebelumnya toleransi 2 jam & cron 4x jam tetap (10/12/14/16 WITA), sekarang toleransi 3 jam & cron digeser jadi ~09:00/12:00/15:00/18:00 WITA. Pesan WA diubah dari "reminder upload laporan" jadi lebih eksplisit "sudah waktunya patroli kebersihan lagi... untuk sesi berikutnya". **Ini nyentuh cron production (kirim WA sungguhan ke staf real lewat Fonnte) — belum di-commit/push, jadi belum aktif; tolong dicek jadwal jamnya udah pas sebelum di-commit.**

**4. "Sesi" di riwayat**: tiap laporan checklist sekarang dapet badge "SESI N" di header kartu riwayat (tab Riwayat), dihitung dari urutan kronologis laporan dengan area + tanggal kalender yang sama (`sesiPerLog`, plain Map dihitung tiap render dari `riwayatKerja`, bukan query baru). Kalau staf bersihin lantai yang sama 3x sehari, muncul Sesi 1/2/3. Field `tanggal: getTodayISOLocal()` ditambahkan ke dokumen `ob_checklists` pas submit (dipakai juga buat fitur #5 di bawah) — dokumen lama sebelum perubahan ini gak punya field ini, gak masalah karena cuma dipakai buat query/grouping ke depan.

**5. Lantai 5 cukup 1x/hari, hilang dari semua staf begitu ada yang selesai**: `NILAI_BERSAMA = "Semua / All"` (sinkron sama `PlottingOBPage.tsx`). State `plotMapHariIni` (plot mentah punya PIC ini hari ini) + `areaBersamaSelesai` (Set nama area ber-`NILAI_BERSAMA` yang sudah ada laporan HARI INI dari staf manapun — realtime `onSnapshot` query `where("tanggal","==",todayISO)` di collection `ob_checklists`). `assignedAreas` jadi derived value (plain const, bukan state) = area punya PIC ini DIKURANGI area bersama yang statusnya sudah `areaBersamaSelesai`. Kalau semua tugas ternyata udah selesai (karena Lantai 5 udah dikerjakan rekan), step 1 nampilin pesan positif "Tugas Hari Ini Sudah Selesai" (bukan pesan warning "Tidak Ada Jadwal" yang menyesatkan). Guard tambahan di `handleKirimLaporan`: kalau area yang lagi dikerjain ternyata baru aja diselesaikan rekan lain (race condition), submit diblok dengan alert & balik ke step 1 — checklist yang lagi diisi TIDAK di-swap otomatis pas masih di step 2 (sengaja, biar gak bikin bingung form-nya tiba-tiba ganti pertanyaan).
  - **Catatan implementasi**: awalnya pilihan area default (auto-pilih area pertama yang tersedia) dibikin pakai `useEffect` + `setState`, tapi kena error ESLint `react-hooks/set-state-in-effect` ("Calling setState synchronously within an effect"). Diganti ke pola computed-during-render (`defaultArea = assignedAreas[0] ?? ""`, dipakai di `value` select & di-commit ke state `selectedArea` cuma pas user klik tombol "Lanjut Isi Checklist" — event handler, bukan effect) — sesuai rekomendasi React buat kasus "derive state dari value lain", sekalian menghindari bug UX area ke-swap diam-diam pas user masih ngisi form.

**Verifikasi**: `npx tsc --noEmit` 0 error, `npx eslint` 0 error (termasuk sempat ketemu & difix 1 error baru dari pola effect di atas). Dicek langsung di dev server: Lantai 5 (PIC "Andi Wahyu", data real) tampil benar — Gudang/Ruang Pompa/Rooftop/Tandon Air, TANPA Toilet, teks "Minimal 2 pasang" muncul, submit dengan 0 foto berhasil munculin modal "Foto Belum Cukup" dengan angka pasang yang benar, tombol "+ Tambah Foto Sekarang" nutup modal & scroll ke section foto tanpa nambah slot kosong berlebih (karena masih ada 1 slot kosong). Fitur #4 (badge Sesi) & #5 (real-time hilang dari tim lain) diverifikasi lewat code review + type-check karena butuh submit sungguhan (upload foto asli ke Cloudinary + tulis Firestore) buat tes end-to-end penuh — **belum dites submit end-to-end nyata**, disarankan dicoba manual sebelum dianggap final. **Belum di-commit.**

### 8H. Redesign `StockOpnamePage.tsx` + rombak total pola stock opname (29 Agustus 2026, lanjutan lagi)

Reza bilang pola stock opname lama "kurang sesuai" — minta: (1) redesign visual token, (2) tabel belanja bulan depan otomatis muncul begitu stok menipis + jumlah disarankan beli, (3) analisa pemakaian rata-rata, (4) barang yang BENAR-BENAR urgent tampil di tabel terpisah dari rencana belanja bulanan, (5) hapus total fitur pengajuan pembelian (dianggap gak berfungsi).

**⚠️ Sama kayak kasus `plotting` di §8F**: `src/app/dashboard/ob/stok/page.tsx` TERNYATA juga bukan thin wrapper — masih 406 baris kode lengkap (identik sama isi lama `components/pages/StockOpnamePage.tsx`, cuma beda 1 baris import path). Sekalian dibenerin: `components/pages/StockOpnamePage.tsx` ditulis ulang penuh dengan fitur baru, `app/dashboard/ob/stok/page.tsx` diganti jadi thin wrapper yang bener. **Belum dicek apakah `laporan` (satu-satunya sisa yang dicurigai di §8F) punya masalah sama — masih PR kalau mau lanjut ke situ.**

**Fitur baru — Analisa Pemakaian** (`hitungAnalisaPemakaian()`, fungsi murni di luar komponen): dihitung dari histori `ob_stock_logs` (transaksi `KELUAR`), bukan model statistik rumit — total qty keluar dibagi rentang hari data yang ada (dari log tertua ke sekarang) = rata-rata/hari, x30 = rata-rata/bulan. Proyeksi habis = sisa stok / rata-rata per hari. Target stok sehat = batas minimum + rata-rata pemakaian/bulan (buffer + kebutuhan 1 bulan ke depan); jumlah disarankan beli = target sehat − sisa stok sekarang (minimal 0, dan kalau item belum pernah ada transaksi KELUAR sama sekali dianggap "belum ada data" — gak dipaksa proyeksi dari nol).
  - Listener log yang tadinya `limit(20)` (buat tabel Riwayat doang) dinaikkan ke `limit(400)` (`LIMIT_LOG_ANALISA`) — dipakai DOBEL: basis analisa pemakaian semua barang, dan tabel Riwayat tetap cuma nampilin 25 terbaru (`.slice(0,25)`) biar gak kepanjangan. Bukan query baru terpisah, technically masih 1 listener, 1 collection read batch — konsisten sama semangat audit performa (§Next Step lama) yang minta selalu pakai `limit()`.

**3 section baru** (semua di atas "Kondisi Stok Gudang" yang lama, urut dari paling mendesak):
1. **Pengadaan Urgent** (merah) — barang `qty <= batas_minimum` SEKARANG. Kolom: sisa stok, batas min, pemakaian/bulan, jumlah disarankan beli. Kosong → pesan positif "Aman" (bukan tabel kosong nge-blank).
2. **Rencana Belanja Bulan Depan** (amber) — barang yang MASIH aman sekarang tapi diproyeksikan turun ke/di bawah batas minimum akhir bulan (butuh data pemakaian, kalau belum ada histori gak masuk sini). Kolom tambahan "Proyeksi Akhir Bulan" — **bug ketemu & difix pas verifikasi**: item yang pemakaiannya jauh lebih cepat dari sisa stok (contoh nyata: "Tissue Toilet" pemakaian 45/bulan, sisa 11) awalnya nampilin proyeksi MINUS ("≈ -34.3", angka stok negatif gak masuk akal buat orang awam) — di-clamp jadi teks "Bakal habis sebelum akhir bulan" kalau hasil proyeksi ≤ 0.
3. **Analisa Pemakaian Gudang** (info/biru, tabel overview SEMUA barang, bukan cuma yang bermasalah) — sisa stok, rata-rata/bulan, proyeksi habis (hari), badge status (Urgent/Perlu Bulan Depan/Sehat/Belum Ada Data). Ini yang jawab poin "analisa pemakaian rata-rata selama ini".

**Dihapus total**: interface `PurchaseRequest`, listener `purchase_requests`, fungsi `handleAjukanRestock`, tombol "🛒 Ajukan" per item, dan card "Status Pengajuan Restock (PO)" — sesuai permintaan eksplisit ("hilangkan saja pola pengajuan pembelian karena tidak terlalu berfungsi"). Collection Firestore `purchase_requests` sendiri TIDAK disentuh/dihapus (data lama kalau ada dibiarkan, cuma UI-nya yang gak nampilin lagi) — kalau mau collection-nya juga dibersihkan/di-deprecate di tempat lain (misal ada halaman admin yang masih baca dari situ), perlu dicek terpisah.

**Redesign visual**: token sama persis (`:root` di §8A dst), warna brand halaman ini `--warn` (amber/oranye — sinkron sama token yang dipetakan buat kartu "Stock Opname Gudang" di menu `DashboardOBPage.tsx`, §8E). Emoji diganti SVG line icon baru (`IconPackage`, `IconShoppingCart`, `IconTrendingUp`, `IconEdit`, sisanya reuse pola dari file lain). Form tambah/edit item & CRUD (`handleSubmit`, `handleQuickUpdate`, `handleDelete`, `handleEdit`) TIDAK diubah logicnya sama sekali, cuma restyle.

**Bug layout ketemu & difix**: card kanan/kiri sempat overflow horizontal di lebar sempit (flex item classic gotcha — flex item defaultnya `min-width:auto`, jadi child lebar kayak tabel bisa maksa parent flex-nya ikut melebar alih-alih discroll di dalam `overflow-x:auto`-nya sendiri). Fix: `.form-col, .right-col { min-width: 0; }`.

**Verifikasi**: `npx tsc --noEmit` 0 error, `npx eslint` 0 error. Dicek langsung di dev server pakai data real gudang OB (12 item, histori log asli) — 6 barang kebaca benar sebagai Urgent (Kanebo, Kopi bubuk setia, Sabun cuci piring, Sabun Cuci Tangan Lifeboy, Spons, Vixal), 2 barang kebaca benar sebagai proyeksi Bulan Depan (Kantong sampah, Tissue Toilet — termasuk kasus proyeksi minus yang udah difix), tabel Analisa Pemakaian nampilin semua 12 item dengan status yang konsisten sama 2 tabel di atasnya, Riwayat Transaksi tetap jalan normal. Verifikasi mobile-width sempat kesulitan (tool emulasi viewport di sesi ini gak reliable — `resize_window` ke 375px tapi `window.innerWidth` kebaca tetap ~820px), tapi dicek `document.body.scrollWidth` vs `innerWidth` langsung lewat JS (bukan cuma screenshot) buat mastiin gak ada overflow, dan breakpoint `@media (max-width:900px)` udah kena walau lebar sebenarnya cuma bisa ditest sampai ~820px, bukan 375px murni. **Belum di-commit.**

### 8I. `dashboard/ob/laporan` — dari "Lapor Kerusakan" (form bebas) jadi "Inspeksi Fasilitas Mingguan" (checklist terstruktur) (29 Agustus 2026, lanjutan lagi)

Reza minta halaman `Laporan Kerusakan` (form bebas: lokasi + deskripsi + urgensi + 1 foto, langsung nembak ke `helpdesk_tickets`) diganti total jadi checklist inspeksi fasilitas MINGGUAN, dengan daftar fasilitas: Keran Air, Wastafel, Kloset, Meja, Kursi, AC, Kulkas, Kompor, Dispenser, Tempat Sampah, Lampu, + "dll fasilitas lainnya".

**File & routing** — sama pola kayak §8F/§8H (cek dulu sebelum nulis, ternyata orphaned duplicate lagi): `app/dashboard/ob/laporan/page.tsx` juga masih 257 baris kode lama, bukan thin wrapper. Kali ini bukan cuma dibenerin wiring-nya tapi diganti fiturnya total, jadi: file lama `components/pages/LaporanKerusakanPage.tsx` **dihapus** (`rm`, feature-nya udah gak ada lagi, bukan sekadar dipindah), diganti file baru `components/pages/InspeksiFasilitasPage.tsx`, dan `app/dashboard/ob/laporan/page.tsx` jadi thin wrapper yang import dari situ. URL routenya (`/dashboard/ob/laporan`) sengaja TIDAK diganti sesuai konteks permintaan Reza ("lanjutkan ke /dashboard/ob/laporan").

**Desain fitur baru**:
- Alur 2-step sama persis kayak `ChecklistOBPage` (pilih area dari plot hari ini → isi checklist) — dipertahankan biar staf gak belajar pola baru, area tetap dibatasi ke plot `daily_plots` hari itu (bukan bebas pilih semua area).
- 11 fasilitas standar (`DAFTAR_FASILITAS_STANDAR`) tiap area, tiap fasilitas dinilai **3 pilihan** (bukan cuma Ya/Tidak kayak checklist harian): **Baik** / **Rusak** / **N/A** ("Tidak Ada" — item ini emang gak ada secara fisik di area itu, misal Basement gak punya Kulkas/Kompor). Keputusan desain tambahan di luar permintaan literal Reza, tapi penting: tanpa opsi N/A, staf terpaksa maksa jawab Baik/Rusak buat fasilitas yang gak ada di areanya.
- "dll fasilitas gedung lainnya" ditangani tombol "+ Tambah Fasilitas Lain" (nambah baris custom dgn nama bebas) — bukan coba nebak & hardcode semua kemungkinan fasilitas gedung.
- Kalau kondisi = Rusak: textarea keterangan (WAJIB diisi sebelum submit) + upload foto (opsional) muncul inline di bawah item itu.
- **"Mingguan" diimplementasikan sebagai LABEL/PENGELOMPOKAN, BUKAN hard block** — dihitung `minggu_mulai` (Senin minggu berjalan, helper `getSeninMingguIni()`, basis WITA sama kayak halaman OB lain) & disimpan di tiap dokumen buat pengelompokan riwayat. Kalau area yang dipilih udah ada inspeksi minggu ini (dicek dari riwayat PIC sendiri), muncul notice info "sudah diinspeksi minggu ini pada {jam}" tapi staf TETAP BOLEH submit ulang (misal ada temuan baru pas dicek lagi tengah minggu) — sengaja gak di-hard-block kayak aturan Lantai 5 di §8G, karena semantiknya beda (itu "1x buat SEMUA staf sekaligus", ini "per staf per minggu", gak ada alasan kuat buat ngunci total).
- **Temuan Rusak tetap diteruskan ke `helpdesk_tickets`** (bagian paling berharga dari fitur lama dipertahankan) — 1 dokumen tiket per item Rusak (`lokasi: "{area} - {nama fasilitas}"`, `deskripsi` diisi dari catatan staf, prefix `[Temuan Inspeksi Mingguan]`), jadi Admin GA tetap dapet notifikasi kerusakan seperti biasa, cuma sumbernya sekarang checklist terstruktur bukan form bebas.
- Collection baru `inspeksi_fasilitas` (bukan reuse `ob_checklists`) — nyimpan record lengkap per inspeksi (area, pic, minggu_mulai, waktu_selesai, array hasil per fasilitas). Tab Riwayat (punya PIC sendiri) nampilin histori ini, badge "N Rusak" / "Semua Baik" per kartu.

**Dampak ke halaman lain**: `DashboardOBPage.tsx` menu card "Laporan Kerusakan" (ikon wrench, token merah, ke Admin GA) diganti "Inspeksi Fasilitas" (ikon `IconSearch` baru, token `info`/biru — geser dari merah biar kesannya "rutin/inspeksi", bukan "darurat/alarm"). Bottom-nav mobile "Lapor Rusak" → "Inspeksi". `IconWrench` yang lama udah gak dipakai di file itu, diganti definisinya jadi `IconSearch`.

**⚠️ Perlu 1 langkah manual sebelum tab Riwayat jalan**: query `where("pic_bertugas","==",picName), orderBy("waktu_selesai","desc")` di collection baru `inspeksi_fasilitas` butuh composite index Firestore yang belum ada (collection baru, index gak auto-dibikin) — kena error `failed-precondition` di console pas testing. **Sama persis pola query yang dipakai `ob_checklists`/`ob_stock_logs` di halaman lain (yang udah pasti punya index-nya dari dulu)**, jadi ini bukan bug kode, cuma collection barunya belum pernah dipakai. Firebase kasih link langsung buat bikin index-nya 1 klik: link muncul di error console (`...firestore/indexes?create_composite=...`), atau buka Firebase Console → Firestore → Indexes → tambah manual (collection `inspeksi_fasilitas`, field `pic_bertugas` Ascending + `waktu_selesai` Descending). **Belum dibikin — perlu Reza yang eksekusi langsung di Firebase Console (butuh akses project), gak bisa dikerjain dari sini.**

**Verifikasi**: `npx tsc --noEmit` 0 error, `npx eslint` 0 error. Dicek di dev server (data real, PIC "Andi Wahyu", area Lantai 5): step 1 nampilin rentang minggu berjalan dgn benar ("24 Agu - 30 Agu" buat tanggal berjalan 29 Agustus/Sabtu), step 2 nampilin 11 fasilitas standar lengkap, klik "Rusak" ngebuka textarea+foto inline dengan benar, "+ Tambah Fasilitas Lain" nambah baris custom dengan benar. Sempat ketemu error React aneh ("Element type is invalid... received a promise") di console — investigasi pakai overlay error Next.js dev (bukan cuma `read_console_messages` yang ternyata nge-cache history lama gak reliable) mastiin itu SISA dari state dev server yang udah lama jalan lintas banyak sesi edit sebelumnya (persis kasus yang sama kejadian & udah difix di §8F buat `plotting`), bukan bug dari file baru ini — hilang total setelah dev server di-restart bersih, overlay Next.js cuma nunjukin 1 issue aktif (index Firestore di atas). **Belum submit end-to-end asli** (butuh index dibikin dulu biar listener-nya gak error, plus upload foto asli ke Cloudinary) — disarankan dites manual sama Reza setelah index-nya jadi. **Belum di-commit.**

### 8J. Index Firestore `inspeksi_fasilitas` + koreksi daftar fasilitas Basement & Lantai 5 (29 Agustus 2026, lanjutan lagi)

**Index dibikinkan langsung dari sini** (bukan cuma dikasih link) — ternyata Firebase CLI (`firebase-tools`) sudah terpasang & sudah login (`samudera.makassar@gmail.com`, sama kayak email Reza) di environment ini, jadi gak perlu Reza buka Console manual. Caranya: `npx firebase firestore:indexes` buat export SEMUA index yang udah ada (214 baris, banyak banget dari fitur lain — dikonfirmasi ini pertama kalinya project ini punya `firestore.indexes.json`, sebelumnya index dikelola manual lewat klik Console, gak pernah di-IaC-kan) → disimpan sebagai `firestore.indexes.json` di root project → ditambah 1 index baru (`inspeksi_fasilitas`: `pic_bertugas` ASC + `waktu_selesai` DESC) → `firebase.json` ditambah key `"firestore": {"indexes": "firestore.indexes.json"}` → `firebase deploy --only firestore:indexes`. Deploy sukses, index ke-deploy TANPA nyentuh/menghapus index lain yang udah ada (operasinya additive). **File `firestore.indexes.json` & `firebase.json` sekarang ikut ke-commit ke repo kalau nanti di-commit** — jadi project ini sekarang punya baseline IaC buat index, bisa dipakai lagi kalau nambah query baru ke depannya (tinggal tambah entry, deploy lagi).
  - Index butuh waktu build (Firestore mem-propagate composite index baru, biasanya beberapa menit walau collection-nya masih kosong) — dicek pas verifikasi masih status "currently building" di console error, BUKAN gagal permanen. Kemungkinan besar udah selesai sendiri beberapa menit setelah sesi ini — kalau tab Riwayat masih error pas dicoba, tunggu sebentar & reload, harusnya udah kelar.

**Koreksi daftar fasilitas Basement & Lantai 5** — Reza kasih tau detail fisik yang lebih presisi: Lantai 5 gak ada toilet sama sekali (keran air dkk cuma ada di gudang mesin air & tandon), Basement HANYA punya Genset, Gudang, Mesin Air, Pompa Hydrant, dan Taman (ditegaskan dengan kata "hanya", jadi daftar diikuti persis, gak ditambah asumsi item lain kayak Lampu/Tempat Sampah yang gak disebut).
- **`InspeksiFasilitasPage.tsx`** (checklist mingguan, §8I): daftar fasilitas standar diubah dari 1 list generik flat (`DAFTAR_FASILITAS_STANDAR`) jadi per-area (`FASILITAS_PER_AREA`, fallback `FASILITAS_DEFAULT` buat Lantai 1-4 & Pelayanan yang gak diubah) — Basement: Genset/Gudang/Mesin Air/Pompa Hydrant/Taman; Lantai 5: Gudang/Ruang Pompa/Rooftop/Tandon Air (nama disamain sama segment `ChecklistOBPage` di bawah biar konsisten 2 halaman, bukan sekadar niru kata-kata Reza hari ini mentah-mentah). Ini nyebabin `hasilList` (state checklist) yang tadinya di-inisialisasi sekali pas mount harus direstrukturisasi: sekarang di-generate ulang tiap kali klik "Mulai Inspeksi" berdasarkan area yang lagi dipilih (`getFasilitasUntukArea(selectedArea)`), dan batas index "item standar vs custom" (dipakai pas validasi submit & render) ikut dihitung dinamis dari situ juga, bukan angka tetap.
- **`ChecklistOBPage.tsx`** (checklist harian, §8F): `SEGMENTS_BASEMENT` awalnya masih punya baris "Toilet: apakah lantai sudah di pel..." yang SALAH (Basement emang gak ada toilet) dan gak ada sama sekali segment buat Genset/Mesin Air/Pompa Hydrant/Taman. Direstrukturisasi jadi 6 segment: Parkiran & Tangga (baris toilet dihapus, sisa parkiran+tangga dipertahankan karena itu tetap valid), Genset, Gudang, Mesin Air, Pompa Hydrant, Taman — pola persis sama granularitas segment Lantai 1/5 yang udah ada (tiap segment 2 pertanyaan Ya/Tidak). `SEGMENTS_LANTAI5` di file ini TIDAK diubah (Gudang/Ruang Pompa/Rooftop/Tandon Air, sudah benar dari sesi sebelumnya).
- `DashboardOBPage.tsx` & bagian lain TIDAK kena dampak (gak ada referensi ke nama-nama segment/fasilitas spesifik area di situ).

**Verifikasi**: `npx tsc --noEmit` 0 error, `npx eslint` 0 error. Dicek di dev server pakai PIC real "Hilal Akbar" (satu-satunya staf yang hari ini punya plot ke Basement & Lantai 1 selain Lantai 5, dari data lama sebelum fix weekend §8F — belum di-regenerate ulang): checklist harian Basement nampilin 6 segment baru dengan benar (gak ada toilet lagi), Lantai 1 tetap normal (toilet tunggal + gudang/parkiran/taman dari §8G). Inspeksi mingguan: Basement → 5 item persis (Genset/Gudang/Mesin Air/Pompa Hydrant/Taman), Lantai 5 → 4 item persis (Gudang/Ruang Pompa/Rooftop/Tandon Air), Lantai 1 → tetap 11 item generik (gak kena dampak, dikonfirmasi gak berubah). **Belum di-commit** — `firestore.indexes.json` & `firebase.json` yang berubah TERMASUK deploy sungguhan ke Firestore production (bukan cuma kode lokal), jadi walau belum di-`git commit`, index-nya SUDAH aktif/ke-deploy di project Firebase asli.

---

## 9. COMMIT & DEPLOY PERTAMA (29 Agustus 2026)

Reza minta jalanin urutan penuh: `git checkout dev` → `git add .` → commit → `push origin dev` → `checkout main` → `merge dev` → `push origin main` → `npm run build` → `firebase deploy` → balik `checkout dev`. Semua dijalanin persis urutannya, semua sukses tanpa konflik (main sebelumnya cuma 1 merge commit di depan dev, jadi merge-nya bersih/fast-ish, gak ada conflict). Commit `0c7491f` ("Redesign & rombak modul OB & CS...") — mencakup SEMUA kerjaan §8E-§8J (dashboard/checklist/plotting/stok/inspeksi fasilitas redesign + fix bug orphaned-wrapper + index Firestore). Build lokal (`npm run build`) sukses 30 halaman static export, `firebase deploy` (hosting + firestore indexes) sukses — **live di https://sibm-app.web.app**. Sempat dicek `git status` dulu sebelum `add .` buat mastiin gak ada file secret ke-stage (`.env.local` udah bener ke-gitignore lewat pattern `.env*`), dan `.claude/launch.json` (config lokal dev-server buat Browser pane) ikut ke-commit karena gak ada alasan kuat buat di-exclude (gak sensitif).

## 10. FIX `admin/monitor-ob` — DATA GAK NYAMBUNG SAMA SEKALI (29 Agustus 2026, lanjutan)

Reza laporan "laporan yang muncul tidak sesuai" di `admin/monitor-ob` — investigasi nemuin halaman ini emang udah lama gak nyambung ke bentuk data yang REAL ditulis oleh halaman-halaman OB (sebagian dari sebelum sesi redesign hari ini, sebagian lagi jadi obsolete GARA-GARA rombakan hari ini). Rekap tiap masalah:

1. **Log Pembersihan (`ob_checklists`)**: interface lama pakai `detail_tugas: {nama_tugas, foto_before, foto_after, status}` — field ini **TIDAK PERNAH ditulis** oleh `ChecklistOBPage.tsx` manapun (baik sebelum atau sesudah redesign). Bentuk data real-nya `detail_segmen: SegmentLog[]` (jawaban Ya/Tidak per segment) + `foto_bukti: FotoPasangan[]` (array before/after terpisah, bukan per-tugas). Akibatnya `getStatusRingkas` SELALU return "Belum Ada Data" apapun isi laporannya, dan foto gak pernah ke-render sama sekali. Diperbaiki total: status dihitung dari jumlah jawaban "Tidak" di semua segment, foto ditampilkan sebagai galeri terpisah dari checklist jawaban.
2. **Stok & Pengadaan**: tab lama cuma tabel mentah `ob_stock`. Ditambah 2 section baru yang REUSE logic `hitungAnalisaPemakaian` persis dari `StockOpnamePage.tsx` (§8H) — Pengadaan Urgent & Rencana Belanja Bulan Depan — biar Admin GA lihat visibilitas yang SAMA kayak yang OB lihat sendiri di halaman mereka. Butuh tambahan listener `ob_stock_logs` (belum pernah di-fetch di halaman admin ini sebelumnya).
3. **Tab "Pengajuan Barang" (`purchase_requests`) — DIHAPUS TOTAL**: fitur ini sendiri udah dihapus dari sisi OB (§8H, "hilangkan saja pola pengajuan pembelian"), jadi tab approve/reject di admin ini otomatis jadi tab hantu (gak ada yang nulis ke situ lagi). Interface, listener, handler (`handleUpdatePR`), lonceng notifikasi PR — semua dihapus. Diganti badge count per-tab yang lebih relevan (jumlah urgent di tab Stok, jumlah temuan Rusak terakhir di tab Inspeksi).
4. **Plot Tugas Harian — BUG PALING FATAL**: dokumen `daily_plots` TIDAK PUNYA field `tanggal` maupun `dibuat_oleh` sama sekali (`PlottingOBPage.tsx` cuma nulis `plot_lantai` + `waktu_update` + `dibuat_otomatis`) — TANGGALNYA adalah ID dokumen itu sendiri (`YYYY-MM-DD`). Query lama `orderBy("tanggal", "desc")` otomatis ngefilter SEMUA dokumen keluar (Firestore exclude dokumen yang gak punya field yang di-order), jadi tab ini SELALU KOSONG dari awal — bukan bug baru, bug lama yang gak pernah ketauan. Fix: ambil collection polos (gak perlu index khusus, size collection-nya kecil), sortir & potong 90 terbaru di client pakai `doc.id`. Sekalian nambah kesadaran weekend (§8F): baris Sabtu/Minggu ditandai "Akhir pekan — OB & CS tidak ada jadwal" alih-alih nampilin tabel 7 kolom "Belum diplot" yang menyesatkan.
5. **Tab Inspeksi Fasilitas — BARU, gak ada sebelumnya**: fitur `inspeksi_fasilitas` (§8I) belum pernah punya tampilan admin. Ditambah tab baru nampilin semua laporan inspeksi (area, PIC, minggu, badge per fasilitas Baik/Rusak/Tidak Ada, detail catatan kalau ada yang Rusak).

**Fitur baru yang diminta**: filter bulan (dropdown "Semua Bulan" + daftar bulan yang beneran ada di data, dihitung dari field `tanggal` kalau ada atau fallback ke `waktu_selesai` buat dokumen lama yang belum punya field itu) + tombol "Export PDF" pakai `window.print()` + CSS `@media print` (pola PERSIS sama kayak `admin/report/page.tsx` — gak ada library PDF di project ini sama sekali, `window.print()` adalah satu-satunya pola yang udah established). **Sengaja TIDAK dikasih `limit()`** di query `ob_checklists` (beda dari kebanyakan listener lain di project ini yang selalu dibatasi) — karena ini SUMBER DATA AUDIT eksplisit yang diminta Reza, motong histori diam-diam bakal bikin fitur audit-nya gak jujur/gak lengkap.

**Bug baru ketemu & difix pas verifikasi (hydration mismatch)**: baris "Dicetak: {new Date()...}" di kop cetak dihitung langsung di render — karena project ini `output: "export"` (prerender di build time), teks jam yang di-render di server (waktu build) beda sama yang di-render di client (waktu buka beneran), bikin React hydration error. Fix: nilai jam dipindah ke state yang cuma di-set pas tombol Export PDF diklik (bukan dihitung tiap render), jadi render awal server & client SAMA (string kosong).

**Verifikasi**: `npx tsc --noEmit` 0 error, `npx eslint` 0 error, `npm run build` sukses 30 halaman. Dicek di dev server (habis di-restart bersih — kena lagi kasus stale dev-server state kayak §8F/§8I) pakai data PRODUCTION asli (bukan cuma data testing) karena Reza sempat coba fitur baru langsung di https://sibm-app.web.app pasca-deploy: Log Pembersihan nampilin histori asli dari 10 Juni sampai 28 Agustus dengan status benar (ketauan juga insight baru: dokumen sebelum ~18 Agustus emang beneran gak punya `detail_segmen`, kemungkinan dari skema lama — ini temuan data quality yang jujur, bukan bug tampilan), filter bulan jalan (Agustus/Juli/Juni kedeteksi otomatis dari data). Stok & Pengadaan nampilin 6 barang urgent + 2 barang bulan depan sama persis kayak yang OB lihat. Inspeksi Fasilitas nampilin 1 laporan asli (Lantai 5, Hilal Akbar, semua Baik) — bukti fitur §8I jalan end-to-end di production. Plot Tugas Harian nampilin 90 hari plotting asli (termasuk hasil generate otomatis yang tembus sampai Januari 2027!), weekend kedeteksi benar.

### 10B. Redesign tab Plot jadi 1 tabel per bulan + tombol Buat Plot & Export PDF (29 Agustus 2026, lanjutan)

Reza minta tab Plot (§10) yang tadinya kartu-per-hari berulang (90 kartu, masing-masing punya tabel 7 kolom sendiri — kebanyakan scroll, "kurang simple") diganti jadi 1 tabel per bulan yang lebih ringkas, plus tombol buat plot baru & export PDF, serta pilihan bulan (matching pola yang udah ada di tab Log Pembersihan §10).

- Listener `daily_plots` gak dipotong lagi ke 90 dokumen terakhir — diambil semua (collection-nya kecil, ~1 dok/hari) karena sekarang ada dropdown bulan yang bisa loncat jauh ke depan/belakang (ada data ke-generate sampai Januari 2027).
- Tabel baru: 1 baris per tanggal dalam bulan terpilih (pola sama kayak kalender di `PlottingOBPage.tsx` — `daftarTanggalBulanPlot`, `NAMA_HARI_SINGKAT`, `isWeekend`), kolom tetap 7 area. Baris weekend nampilin "· Libur" + semua kolom "-". Dropdown bulan cuma nampilin bulan yang beneran ada datanya, default ke bulan berjalan (fallback ke bulan terbaru yang ada kalau bulan ini kosong).
- **Tombol "+ Buat Plot Baru"**: navigasi ke `/dashboard/ob/plotting` — TIDAK bikin UI create/edit plot baru di dalam `monitor-ob` (itu bakal duplikasi logic rotasi staff/generate-otomatis yang udah lengkap di `PlottingOBPage.tsx`). Akses admin ke situ udah otomatis diizinkan (`bolehAkses` di `PlottingOBPage.tsx` include `role.includes("Administrator")`), jadi tinggal link, gak perlu ubah apa-apa di sisi plotting.
- **Tombol "Export PDF"** (`handlePrint`) & kop cetak sekarang dinamis ikut tab aktif (judul & label bulan beda buat Plot vs Log Pembersihan).

**Verifikasi**: `npx tsc --noEmit` 0 error, `npx eslint` 0 error, `npm run build` sukses 30 halaman. Dicek di dev server data real: dropdown nampilin 8 bulan (Juni 2026 - Januari 2027), default kebuka di Agustus 2026 (bulan berjalan), tabel Agustus nampilin 31 baris dengan weekend/weekday benar, tombol "Buat Plot Baru" dikonfirmasi navigasi ke `/dashboard/ob/plotting`.

**Commit & deploy kedua (29 Agustus 2026)**: urutan yang sama kayak §9 dijalanin lagi buat gabungan §10 (fix data monitor-ob) + §10B (redesign tab Plot) — commit `695585a` ("Perbaiki admin/monitor-ob..."), push dev, merge ke main (bersih, gak ada konflik), push main, build sukses, `firebase deploy` sukses (hosting + firestore indexes). **Live di https://sibm-app.web.app.** Balik ke branch `dev` di akhir sesuai perintah.

## 11. FIX Portal Utama `app/page.tsx` (29 Agustus 2026, lanjutan — balik dari admin/monitor-ob)

Reza minta balik dulu ke portal publik (`app/page.tsx`) sebelum lanjut ke dashboard admin, ada 6 keluhan konkret. Semua fix di file yang sama, murni tampilan + 1 bug data (gak ada perubahan skema Firestore).

1. **Kalender Aktivitas gak informatif**: sel heatmap dulu cuma kotak warna polos (tanggal cuma ada di `title` tooltip, gak kelihatan tanpa hover). Sekarang tiap sel nampilin ANGKA TANGGAL asli di dalam kotaknya (warna teks otomatis putih kalau sel gelap/level tinggi, biar tetap kebaca).
2. **Tim Bertugas Hari Ini nampilin OB padahal weekend harusnya kosong**: root cause SAMA PERSIS kelas bug yang udah difix di `PlottingOBPage.tsx`/`admin/monitor-ob` (§8F/§10) — dokumen `daily_plots/{tanggal}` lama yang belum di-regenerate ulang masih nyimpan `plot_lantai` basi buat tanggal Sabtu/Minggu, dan portal baca mentah-mentah tanpa cek weekend. Fix: helper baru `isWeekend(iso)` (pola sama kayak file lain), `hadirOB` dipaksa array kosong kalau `todayISO` weekend — regardless data Firestore.
3. **Plot Besok muncul walau besok weekend**: subscription `onSnapshot(daily_plots/{tomorrowISO})` (aktif >=20:00 WITA) sekarang di-skip total kalau `tomorrowISO` weekend (`isWeekend(tomorrowISO)`), bukan cuma ngandelin data kosong dari Firestore.
4. **Tombol "+" (FAB) tengah bottom-nav**: dulu cuma scroll ke section Menu Cepat. Sekarang langsung buka modal Lapor Bahaya (SBO) (`setActiveModal("sbo")`), ikon diganti `IconAlertTriangle` (segitiga peringatan, dari `IconPlus`). Card "Bahaya SBO" di grid Menu Cepat **dihapus** (sudah kepegang FAB, gak perlu dobel).
5. **Icon lonceng notifikasi di header atas dihapus total** (dulu cuma `window.scrollTo(top)`, gak ada halaman notifikasi publik sungguhan — dead-end button). Tombol "Staf Internal" di header tetap ada.
6. **2 tombol bottom-nav diganti fungsinya** (dari sekadar scroll-to-section jadi shortcut modal beneran):
   - "Monitor" (dulu scroll ke Tren Aktivitas) → **"Kerusakan"** (`IconWrench`), langsung buka modal Helpdesk GA (`setActiveModal("helpdesk")`) — ini yang dimaksud "lapor kerusakan fasilitas".
   - "Info" (dulu lonceng, scroll ke atas) → **"ATK"** (`IconClipboard`), langsung buka modal Request ATK (`setActiveModal("atk")`) — ini yang dimaksud "pengajuan atk".
   - Bottom-nav final: Home · Kerusakan · [FAB: Lapor SBO] · ATK · Profil.

**Dead code dibersihkan sekalian** (biar gak nambah warning lint): komponen ikon `IconBell`/`IconChart`/`IconPlus` dan fungsi `scrollKeSection` dihapus (udah gak ada pemanggil setelah perubahan di atas), CSS `.header-icon-btn`/`.header-icon-dot` dihapus. Section id `menu-cepat-section` & `tren-aktivitas-section` DIBIARKAN (masih valid sebagai anchor DOM, gak ada downside dibiarkan walau gak ada lagi yang scroll ke situ).

**Verifikasi**: `npx tsc --noEmit` 0 error, `npx eslint src/app/page.tsx` 0 error/warning baru. Dicek di dev server pakai data real (tanggal berjalan 29 Agustus 2026 = Sabtu, dikonfirmasi di §8F): "OB & CS Bertugas" nampilin `0` (bukan salah nampilin staf), Tim Bertugas Hari Ini cuma nampilin Security + 2 Driver (gak ada OB), Plot Besok gak muncul sama sekali (besok = Minggu, juga weekend). Kalender Aktivitas nampilin tanggal 1-31 asli di tiap sel. Bottom-nav mobile dites klik satu-satu via JS (`element.click()`, browser pane sempat kepakai background sehingga klik `computer` tool timeout — bukan berarti UI-nya rusak, cuma test tool yang gak reliable pas pane hidden): FAB tengah buka modal SBO, "Kerusakan" buka Helpdesk GA, "ATK" buka Gudang ATK GA — semua benar. **Belum di-commit** (nunggu instruksi lanjut ke dashboard admin selesai dulu, sesuai kebiasaan project ini nge-commit di akhir sesi/batch besar, bukan per-file).

**Catatan buat sesi lanjut ke dashboard admin**: Reza eksplisit bilang "setelah itu baru kita kembali lagi ke tampilan dashboard admin" — jadi setelah fix ini dikonfirmasi Reza, lanjut ke `app/admin/page.tsx` / subhalaman admin (redesign shell & badan konten sudah ada di §8C/§8D, tapi migrasi struktur folder #5 di §4 masih belum dikerjakan — mungkin ini yang dimaksud "kembali ke dashboard admin", perlu diklarifikasi dulu di awal chat/giliran berikutnya apakah maksudnya redesign lanjutan, migrasi struktur, atau ada keluhan baru spesifik kayak sesi ini).

### 11B. Revisi §11 — beda perilaku mobile vs web yang diminta Reza (29 Agustus 2026, lanjutan lagi)

Setelah §11 dicoba Reza, ada 4 revisi (semua di `app/page.tsx`, gak ada perubahan lain):

1. **Tombol "Staf Internal" di header** — dulu dihapus niatnya cuma icon lonceng doang, ternyata tombol login ini juga diminta hilang **TAPI HANYA DI MOBILE** (karena akses staf sudah ada di bottom-nav "Profil"). Di desktop tombolnya harus tetap ada (gak ada bottom-nav sama sekali di desktop, jadi ini satu-satunya akses login di layar lebar).
2. **Card "Request ATK" dan "Kerusakan" di grid Menu Cepat** — sama kayak "Bahaya SBO" yang udah dihapus di §11, ternyata harusnya juga cuma disembunyikan **DI MOBILE** (karena sudah ada shortcut sama-sama persis di bottom-nav: ATK, Kerusakan, FAB). §11 kemarin kelewatan menghapus totalnya padahal harusnya cuma disembunyikan kondisional.
3. **Card "Bahaya SBO" DIKEMBALIKAN** ke grid Menu Cepat (sempat dihapus total di §11) — sama alasannya, cuma perlu disembunyikan di mobile, BUKAN dihapus permanen, karena di desktop gak ada FAB/bottom-nav pengganti.
4. **Kalender Aktivitas**: angka tanggal di tiap sel (baru ditambahkan di §11) dibikin lebih besar & tegas — `font-size` 10px → 13px (14px di layar >=480px), `font-weight` non-hari-ini 600 → 700, warna teks sel kosong `var(--muted)` (abu pucat) → `var(--ink-soft)` (lebih gelap, kontras lebih baik).

**Cara implementasi poin 1-3**: dipakai ulang class `.desktop-only-hide` yang sebelumnya didefinisikan di CSS tapi gak pernah dipasang ke elemen manapun (`display:block` di layar >768px, `display:none` di <=768px — kebalikan dari `.mobile-only`). Elemen yang perlu ikut aturan ini DIBUNGKUS wrapper `<div className="desktop-only-hide">` terpisah (bukan taruh class ini langsung gabung di elemen yang sudah punya inline `style={{ display: "flex" }}` sendiri) — soalnya inline `style` React SELALU menang dibanding aturan class dari stylesheet biasa untuk properti yang sama, jadi kalau class ditaruh langsung di elemen yang punya inline `display:flex`, aturan `display:none` dari class pas mobile gak akan pernah kepakai. Wrapper div polos (gak ada inline `display` sendiri) beres masalah ini.

**Verifikasi**: `npx tsc --noEmit` 0 error, `npx eslint src/app/page.tsx` 0 error/warning baru. Dicek di dev server 2 breakpoint: mobile (375px) — header cuma logo+tanggal (gak ada tombol Staf Internal), Menu Cepat cuma 3 card (Lacak Tamu, Resi Paket, Lembur AC), bottom-nav 5 tombol lengkap (Home/Kerusakan/FAB SBO/ATK/Profil); desktop (800px) — tombol "Staf Internal" muncul di header, Menu Cepat lengkap 6 card (termasuk Request ATK, Kerusakan, Bahaya SBO). Kalender Aktivitas dicek `getComputedStyle` langsung (`font-size: 14px`, `font-weight: 700` di desktop, naik dari 10px/600 sebelumnya) + screenshot visual, angka tanggal jelas kebaca. **Belum di-commit** — masih nunggu instruksi lanjut ke dashboard admin.

---

## 12. Rombak `admin/overtime`, `admin/helpdesk`, PDF export `admin/monitor-ob`, filter+roster `admin/monitor-security`, fix shell `admin/page.tsx` (29 Agustus 2026, sesi baru — SUDAH DI-DEPLOY)

Beda dari kebanyakan section di atas: sesi ini diminta jalan sampai ke commit+push+merge+build+**deploy production**, bukan berhenti di working tree. Semua poin di bawah **sudah live di https://sibm-app.web.app** per akhir sesi ini.

### 12A. `admin/overtime/page.tsx` — pisah alur Gedung vs Tim

Reza: lembur Gedung/Tenant gak butuh approval lagi (portal publik sudah nulis status "Tercatat" otomatis sejak sesi lalu, tapi halaman admin ini masih nampilin tombol Setujui/Tolak yang gak relevan lagi), minta jadi tabel simpel + export Excel + filter bulan. Lembur Tim tetap butuh approval, tapi tambah cara lihat detail kalau staf klaim banyak hari + tombol kirim rekap by-email pas semua approval kelar.

- **Tab Gedung**: kolom Setujui/Tolak & badge status approval dihapus total dari tabel (bukan cuma disembunyikan). Kolom baru: Nama Yang Lembur, Aktivitas/Keterangan (field `alasan`), Tanggal+Hari+Jam (pakai `formatTanggalHari` baru, format "Senin, 12 Agustus 2026"), Unit Bisnis/Departemen/Lokasi. Filter Bulan+Tahun 2 dropdown terpisah (bukan gabungan) ditambah di atas tabel, plus tombol Export Excel yang ngikut filter aktif.
- **Tab Tim**: approval Setujui/Tolak (`handleProcessDecision`, kirim notif WA/Email via `employees_directory`) **TIDAK DIUBAH SAMA SEKALI**. Tambahan: kalau 1 pengajuan punya >1 hari klaim (`items.length > 1`), baris tabel nampilin ringkasan ("N hari lembur — total X jam") + tombol "Lihat Detail Tabel" yang buka Modal berisi tabel rinci (Tanggal, Hari, Jam, Jumlah Jam, Lokasi, Keterangan) — kalau cuma 1 hari, tetap tampil ringkas inline kayak sebelumnya (gak perlu modal buat 1 baris).
- **Tombol "Kirim Email Rekap"**: muncul otomatis per-periode begitu SEMUA pengajuan Tim di periode itu udah berstatus Approved/Rejected (gak ada lagi yang "Menunggu") — `semuaPeriodeSelesai(periode)`. Default periode = periode pengajuan paling baru, tapi bisa dipilih manual lewat dropdown periode yang udah ada. Klik tombol → generate Excel rekap (cuma yang Approved, kolom Nama/Departemen/Tanggal/Hari/Jam/Jumlah Jam/Lokasi/Keterangan) → auto-download → buka `mailto:` dengan subjek+isi pre-filled (ringkasan jumlah staf & total jam).
- **⚠️ Keterbatasan teknis yang disampaikan eksplisit ke Reza**: browser TIDAK BISA melampirkan file ke email secara otomatis (batasan `mailto:` di semua browser, bukan sesuatu yang bisa diakali dari kode client-side doang). Jadi alurnya: file Excel ke-download duluan, baru aplikasi email default kebuka dengan draft siap pakai — Admin GA tinggal drag file yang baru ke-download itu ke email sebelum kirim. Auto-attach beneran butuh backend (Cloud Function kirim email server-side), di luar scope app ini yang murni `output: "export"` (lihat baris 5 dokumen ini).
- **Excel asli, bukan CSV**: sebelumnya export "Excel" itu sebenarnya CSV yang dikasih nama file `.csv` doang. Sekarang pakai `xlsx` (SheetJS) buat generate `.xlsx` beneran (`XLSX.utils.aoa_to_sheet` + `XLSX.writeFile`), dipakai di export Gedung, export Tim, dan Kirim Email Rekap.
- **Fungsi baru**: `hitungDurasiJam(mulai, selesai)` (parse "HH:MM", handle lembur lewat tengah malam), `formatTanggalHari`, `labelBulan`, `unduhExcel` (generic wrapper SheetJS).

**Verifikasi**: `tsc`/`eslint` bersih. Dicek di dev server pakai data real: tab Gedung nampilin 88-99 record (angka naik antar-pengecekan karena data live production terus masuk) dengan kolom baru & tanpa tombol approval; tab Tim nampilin 1 record real (Awaluddin, 18 jam lembur lewat tengah malam — durasi 18 jam kehitung benar), tombol "Kirim Email Rekap (11 Juni - 10 Juli 2026)" muncul otomatis karena periode itu udah Approved semua (dikonfirmasi lewat kondisi `semuaPeriodeSelesai`, TIDAK diklik beneran biar gak trigger download+mailto asli di sesi otomatis).

### 12B. `admin/helpdesk/page.tsx` — kartu grid → tabel

Reza minta tampilan lebih simpel (tabel, bukan kartu), lengkap semua field, dan notifikasi email otomatis pas laporan selesai (ternyata sudah ada — lihat 12C).

- Grid kartu (`display:grid, repeat(auto-fill,...)`) diganti `<table>` responsive (jadi kartu lagi otomatis di layar <900px, pola CSS sama kayak tabel lain di project ini — `data-label` attribute buat label per baris di mobile).
- Kolom: Pelapor (+departemen+lokasi), Tanggal, Keluhan, Foto Laporan (thumbnail 52x52, klik → lightbox Modal), Waktu Lapor, Waktu Selesai, Foto Selesai (thumbnail juga), Status, Aksi.
- **Field baru `waktu_selesai`**: direkam via `serverTimestamp()` di `handleSimpanPerubahan`, TAPI cuma sekali — pas transisi PERTAMA KALI status jadi "Selesai" (`statusUbah === "Selesai" && selectedTicket.status !== "Selesai"`), biar kalau admin buka lagi tiketnya buat lihat detail, waktu penyelesaian asli gak ketiban ulang.
- Tombol "Tindak Lanjuti"/"Lihat Detail" & seluruh alur Modal update status (dropdown status, wajib upload foto kalau pilih Selesai) **TIDAK DIUBAH** — persis kayak sebelumnya sesuai permintaan eksplisit Reza ("sama seperti sebelumnya").

**Verifikasi**: dicek di dev server data real — tabel nampilin 2 tiket (1 "Sedang Dikerjakan" tanpa waktu_selesai = "-", 1 "Selesai" dengan waktu_selesai keisi wajar), modal Tindak Lanjuti dibuka & ditutup tanpa ubah data (gak disimpan, biar gak ganggu data production), mobile view (375px) transformasi ke kartu jalan benar.

### 12C. `admin/helpdesk` & `admin/atk` — notifikasi email pelapor/pemohon (SUDAH ADA, dikonfirmasi ulang)

Reza minta ditambahkan notif email otomatis ke pelapor (helpdesk) & pemohon (ATK) pas laporan/permintaan diselesaikan. **Dicek dulu sebelum nulis kode baru — ternyata KEDUANYA SUDAH ADA dari sesi-sesi sebelumnya**, gak pernah didokumentasikan eksplisit di file ini sebelumnya:

- **Helpdesk** (`kirimNotifikasiHelpdesk`, dipanggil dari `handleSimpanPerubahan` tiap kali `statusBerubah`, termasuk pas jadi "Selesai") — cari kontak dari `employees_directory` berdasar `nama_pelapor` (case-insensitive), kirim WA (Fonnte) + Email (EmailJS) pakai template `template.helpdeskUpdate`.
- **ATK** (`kirimNotifikasiAtkSiap`, dipanggil dari `handleUpdateStatus` KHUSUS pas `newStatus === "Selesai / Diambil"`) — cari kontak dari `employees_directory` berdasar `nama_pemohon`, kirim WA + Email pakai template `template.atkSiapDiambil`.

Kedua fungsi udah nge-`console.warn` (bukan gagal diam-diam) kalau kontak karyawan gak ketemu/belum lengkap di Master Data Karyawan — jadi kalau notif gak sampai ke seseorang, kemungkinan besar penyebabnya data `employees_directory` orang itu belum lengkap (no_wa/email kosong), bukan bug kode. **Tidak ada perubahan kode di kedua fungsi ini sesi ini** — cuma dikonfirmasi lewat pembacaan kode, bukan dites kirim WA/email sungguhan (biar gak spam kontak real).

### 12D. `admin/monitor-ob/page.tsx` — Export PDF lengkap + filter bulan/tahun terpisah

Reza: Log Pembersihan exportnya harus nampilin detail checklist+foto (bukan cuma ringkasan status) selama 1 bulan, dan tab Inspeksi butuh Export PDF juga. Lanjutan sesi: tambah filter bulan DAN tahun (dipisah) di Log Pembersihan & Inspeksi.

- **Print-only Log Pembersihan** diganti total: dari `<table>` flat (Waktu/Petugas/Area/Status doang) jadi 1 blok kartu per entri — header (area+waktu+petugas+status), semua segmen checklist dengan tiap pertanyaan+jawaban Ya/Tidak, dan grid foto before/after (`<img>` langsung dari URL Cloudinary, browser yang fetch pas print).
- **Print-only Inspeksi** (baru dari nol, sebelumnya gak ada Export PDF sama sekali di tab ini): kartu per sesi inspeksi — area+petugas+minggu+waktu, semua titik cek dengan kondisi (Baik/Rusak/Tidak Ada)+catatan+foto kalau ada.
- Tombol Export PDF (`handlePrint`, `window.print()`) ditambahkan ke header tab Inspeksi (sebelumnya cuma ada di Log Pembersihan & Plot).
- **Filter dipecah**: `bulanFilter` (1 dropdown gabungan "YYYY-MM" via `getBulanKeyChecklist`) diganti 2 dropdown independen `filterBulanChecklist`+`filterTahunChecklist` (helper baru `getTahunBulanChecklist`, prioritas field `tanggal` lalu fallback `waktu_selesai`). Filter Bulan+Tahun BARU ditambahkan di Inspeksi (`filterBulanInspeksi`+`filterTahunInspeksi`, dari field `minggu_mulai`) — sebelumnya tab ini cuma bisa search nama/area, gak ada filter periode.
- Kop cetak (`formatPeriodeLabel`, helper baru) otomatis nampilin label periode gabungan ("Agustus 2026" / "Agustus" / "2026" / "Semua Periode") sesuai kombinasi filter aktif, dipakai di judul PDF Log Pembersihan maupun Inspeksi.

**Verifikasi**: dicek di dev server data real — filter Log Pembersihan dari "Semua Bulan" (158 entri, 64 foto ter-embed di print-only DOM) ke "Juni" (turun ke 3 entri, benar). Filter Inspeksi dari kosong ke "Januari" (0 hasil, benar — data cuma ada di Agustus). Print-only DOM dicek langsung lewat `querySelectorAll('.print-only')` (bukan cuma screenshot), konten & jumlah `<img>` dikonfirmasi sesuai data.

### 12E. `admin/monitor-security/page.tsx` — filter+export Log Patroli, fix+redesign Roster Danru

Bagian paling banyak iterasi sesi ini — Reza kasih revisi tambahan setelah implementasi pertama.

**Log Patroli** (implementasi pertama, gak direvisi): filter Bulan+Tahun (`filterBulanPatroli`/`filterTahunPatroli`, dari `waktu_laporan`) ditambahkan, tabel di layar ikut kefilter (bukan cuma exportnya). Export PDF baru: detail penuh per patroli — petugas, status, catatan shift, semua titik dengan kondisi+waktu+foto, area terlewat dengan alasan. CSS print baru ditambahkan ke file ini dari nol (sebelumnya gak ada `@media print` sama sekali di halaman ini) — `@page` orientasinya DINAMIS ikut `activeTab` (portrait buat Patroli, landscape buat Roster — lihat di bawah), dirender langsung via template literal di style block (bukan CSS statis) karena React re-render tiap `activeTab` berubah.

**Roster Danru** (2 putaran):
- *Putaran 1*: tombol "Print Roster (A4 Landscape)" + kop cetak logo Samudera + judul "ROSTER SECURITY — PERIODE ..." ditambahkan.
- *Putaran 2 (revisi Reza)*: **bug nyata ketemu** — tabel yang tampil masih nampilin SEMUA key gabungan dari 2 dokumen bulanan (`data_hari`, masing-masing isinya 1 bulan kalender penuh), padahal siklus roster itu 11 → 10 bulan berikutnya (bukan kalender bulan biasa). Jadi yang kebaca "1 bulan penuh" itu sebenarnya lebih (potongan 2 bulan kalender berbeda). Fix: helper baru `hitungPeriodeRoster(bulanAwalStr)` hitung rentang PERSIS (`tglMulaiISO`/`tglAkhirISO`), tabel sekarang iterasi `daftarTanggalPeriode` (dibangun dari rentang itu, bukan `Object.keys(rosterData)`) — dikonfirmasi persis 31 baris, tanggal 11 sampai 10.
  - **Tambahan filter periode** (disebut Reza sebagai opsi "bisa juga"): dropdown baru pilih periode mana yang mau dilihat/dicetak (`rosterPeriodeAwal`, daftar dari `getDocs(security_monthly_schedules)` sekali di awal), bukan cuma periode yang aktif hari ini. Ganti dropdown → `useEffect` baru fetch ulang 2 dokumen terkait & recompute rentang.
  - **Tampilan dipadatkan & dimodernkan**: padding sel dipangkas, shift ditampilkan sebagai pill/chip warna kecil (biru=Shift 1, ungu=Shift 2, merah=Off) gantiin teks tebal polos.
  - **CSS print khusus roster** (`padding: 2px 4px !important; font-size: 8px !important` dst di `.roster-table`) biar 31 baris × kolom staf konsisten muat 1 lembar A4 landscape.

**Verifikasi**: dicek di dev server data real — Log Patroli filter Juni turun dari 132 ke jumlah lebih kecil dengan benar, print-only DOM Patroli "Semua Periode" nampilin 132 laporan + 2512 foto ter-embed. Roster: `document.querySelectorAll('.roster-table tbody tr').length` = 31, baris pertama tanggal "11" baris terakhir "10" (dikonfirmasi via JS, bukan cuma visual). Ganti dropdown periode dari "Agustus 2026" ke "Juni 2026" — badge & data reload benar. `@page` dicek langsung lewat regex di `<style>` terender: `A4 landscape` pas di tab Roster, balik `A4 portrait` pas pindah ke tab Patroli.

### 12F. `admin/page.tsx` — fix logo hitam, logout jadi ikon bulat + modal

- **Root cause logo hitam ditemukan**: `<img src="/logo-samudera.png" style={{ filter: "invert(1) brightness(0.2)" }}>`. Dicek file PNG-nya langsung (`Read` tool bisa baca gambar) — logo aslinya SUDAH gelap (teks "SAMUDERA" hitam + lambang "S" merah/putih di atas background transparan), BUKAN logo putih yang butuh di-invert biar keliatan di header terang. Filter invert+darken jadi bikin teks hitam → putih lalu digelapin lagi (jadi abu gelap) dan merah → cyan lalu digelapin (jadi hampir hitam juga) — hasil akhirnya blob gelap nyaris gak kebaca, persis keluhan Reza. Fix: filter dihapus total, logo tampil warna asli.
  - **⚠️ Bug yang sama (pola filter identik) masih ada di 2 file lain** yang TIDAK disentuh sesi ini (di luar scope — Reza cuma minta `admin/page.tsx`): `dashboard/security/page.tsx` (`invert(1) brightness(0.2)`) dan `admin/qr-manager/page.tsx` (`invert(1) brightness(0)`, malah lebih parah — maksa jadi solid hitam apapun warna aslinya).
- **Logout**: desktop — pill button teks "🚪 Keluar Sesi Admin" diganti tombol ikon bulat 38x38px pojok kanan atas (`.logout-icon-btn`, `title`/`aria-label` tetap ada buat aksesibilitas). Mobile bottom-nav TIDAK diubah bentuknya (tetap ikon+label "Keluar", konsisten sama 3 tombol lain di nav yang sama).
- **`window.confirm()` → Modal**: state `showLogoutModal` baru, `handleLogout` sekarang cuma `setShowLogoutModal(true)` (dipanggil dari desktop icon-button MAUPUN mobile bottom-nav — 1 fungsi buat 2 tempat), aksi konfirmasi aslinya pindah ke fungsi baru `confirmLogout`. Modal (reuse `components/ui/Modal`) isinya ikon logout dalam lingkaran merah muda, judul "Keluar dari Sesi Admin?", 2 tombol (Batal / Ya, Keluar).

**Verifikasi**: dicek di dev server & **di production** (https://sibm-app.web.app) — logo tampil merah/putih/hitam asli di kedua tempat, tombol logout bulat di pojok kanan, klik tombol itu munculin modal (bukan browser-native confirm), tombol "Batal" nutup modal tanpa logout beneran (sengaja gak diklik "Ya, Keluar" biar sesi Test Admin gak ke-invalidate di tengah verifikasi).

### 12G. Commit, deploy, dan status akhir

Urutan persis sesuai request: `git checkout dev` (sudah di situ) → `git add .` → commit `5000ac4` → `git push origin dev` → `git checkout main` → `git merge dev` (merge bersih, 0 konflik, 11 file) → `git push origin main` (`1ca38c0`) → `npm run build` (sukses, 30 halaman static export, ~8-10 detik) → `npx firebase deploy` (hosting + firestore indexes, sukses) → `git checkout dev`.

Working tree abis build+deploy balik ada 2 file berubah lagi (`public/sw.js`, `.firebase/hosting.*.cache`) — regenerated otomatis sama tooling, bukan perubahan manual, ikut kebawa di commit dokumentasi §12/§0 ini.

**Belum dikerjakan (di luar scope literal permintaan sesi ini, dicatat biar gak lupa)**: fix filter logo di 2 file lain (12F), filter/export buat tab Buku Tamu & Log Paket di `monitor-security` (cuma Log Patroli & Roster yang diminta).
