# SIBM — Project Analisis & Progress

Update terakhir: 29 Agustus 2026
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

## 5. NEXT STEP (mulai chat baru dari sini)

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
