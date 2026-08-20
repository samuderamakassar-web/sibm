# SIBM — Project Analisis & Progress

Update terakhir: 20 Agustus 2026
Project: SIBM (Sistem Informasi Building Management) — Next.js + Firebase (Firestore, Storage), hosting via Firebase Hosting, plan **Spark (gratis)**.
Deploy: `next.config.ts` pakai `output: "export"` (static export murni) → API Routes gak jalan di production, jadi semua kerjaan terjadwal/backend pakai GitHub Actions + Firebase Admin SDK, bukan Cloud Functions.

---

## 1. SUDAH SELESAI (ringkas — history detail ada di chat lama)

- Checklist OB: segment-based (Basement, Lantai 1-5, Pelayanan), foto before/after multi-pasang, Cloudinary buat upload foto (bukan Firebase Storage — Blaze diblokir masalah kartu).
- PWA: `manifest.json`, `InstallPrompt.tsx`, ikon masih placeholder (belum ada file asli).
- Sistem reminder terjadwal (semua via GitHub Actions cron, gak butuh Blaze, reuse secret `FIREBASE_SERVICE_ACCOUNT_BASE64`):
  - `patroli-reminder.yml` + `scripts/patroli-reminder.mjs` — WA reminder patroli security tiap 3 jam + 30 menit sebelum & pas shift ganti. Sempat 0 pesan terkirim karena delay GitHub Actions cron `:00`/`:30`, sudah diperbaiki (tolerance 45 menit, idempotency guard, dll).
  - `checklist-reminder.yml` + `scripts/checklist-reminder.mjs` — WA reminder checklist OB tiap 2 jam kalau belum submit.
  - `fcm-reminder.yml` + `scripts/fcm-reminder.mjs` — push notif browser jam 08:30/13:00/16:00 WITA hari kerja ke semua token di `fcm_tokens`. **Baru dibuat sesi ini**, belum di-deploy/test.
  - `kendaraan-reminder.yml` + `scripts/kendaraan-reminder.mjs` — **sudah ada di repo tapi belum pernah dibahas di chat**, isi/tujuannya perlu dikonfirmasi ulang kalau mau disentuh.
- FCM setup: `src/hooks/useFcmSetup.ts` sudah dipindah ke lokasi yang benar, VAPID key sudah diisi. Cara pakainya: panggil `useFcmSetup(picName, !!picName)` di level komponen halaman (sudah dikasih contoh utk `dashboard/ob/page.tsx`, taruh setelah efek baca `pic_nama` dari localStorage) — **belum dikonfirmasi user udah nempel kodenya atau belum**.
- Banyak bugfix arsitektur & fitur (login, plotting OB, jadwal security, kendaraan, dsb) — lihat riwayat chat/memory untuk detail lengkap kalau perlu.

---

## 2. STRUKTUR FOLDER SAAT INI (per screenshot 20 Agustus 2026)

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
        kendaraan/            ← isi belum diperiksa
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
          checklist/page.tsx
          deep-cleaning/       ← isi belum diperiksa
          laporan/       ← isi belum diperiksa
          plotting/       ← isi belum diperiksa
          stok/       ← isi belum diperiksa
          page.tsx
        qhse/       ← isi belum diperiksa
        security/       ← isi belum diperiksa (kemungkinan ada jadwal/, patroli/, buku-tamu/, paket/)
      layout.tsx
      page.tsx                ← portal publik utama, 1600+ baris
    components/
      ui/                     ← library komponen (Button, Card, Input, dll) — JANGAN diubah
      InstallPrompt.tsx
      NotifikasiChecklistListener.tsx
      NotifikasiKendaraanListener.tsx
      NotifikasiPatroliListener.tsx
      pages/                  ← ⚠️ BELUM ADA — ini yang mau dibuat
    hooks/
      useAuthGuard.ts
      useFcmSetup.ts
      lib/                    ← isi belum diperiksa
    lib/
      firebase.ts
      notify.ts
```

**Catatan penting:** rencana lama yang bilang `ChecklistOBPage.tsx` sudah jadi contoh di `components/pages/` — ternyata **belum benar-benar dibuat**. Folder `components/pages/` belum ada sama sekali. Jadi restrukturisasi di bawah ini mulai dari nol, termasuk checklist OB.

---

## 3. RENCANA BARU: Restrukturisasi folder mengikuti pola project **Fin-Samudera**

Reza punya project lain (Fin-Samudera, React + react-router-dom) dengan struktur yang dia anggap jauh lebih enak: `src/pages/` (satu file per halaman/route) + `src/components/` (komponen reusable — form, modal, tabel, chart, dst).

SIBM pakai Next.js App Router, yang **mengharuskan routing berbasis folder** (`app/dashboard/ob/page.tsx` otomatis jadi route `/dashboard/ob`) — jadi gak bisa 100% diratakan jadi satu folder `pages/` flat kayak Fin-Samudera. Solusi yang disepakati:

- `page.tsx` di tiap folder route **tetap wajib ada** (aturan framework), tapi dibikin **setipis mungkin** — cuma import + render.
- Isi lengkap tiap halaman (state, effect, JSX, semua logic) pindah ke `components/pages/XxxPage.tsx`, satu file per halaman — ini yang jadi analog dari `src/pages/` di Fin-Samudera.
- Komponen reusable (form, modal, listener, dll) tetap di `components/` biasa — sudah sesuai pola, gak perlu diubah.

**Status: disetujui Reza, siap jalan.**

### Urutan migrasi yang disarankan
Migrasi satu halaman per sesi/chat, biar gampang di-review dan gak numpuk risiko paste-error (bug pola lama di project ini: fungsi/kurung kurawal ke-duplikat atau salah taruh pas paste manual — selalu cek ulang lewat daftar TypeScript error kalau ada gejala aneh).

1. `dashboard/ob/checklist/page.tsx` → `components/pages/ChecklistOBPage.tsx` (paling sering disentuh, jadi contoh pola)
2. `dashboard/ob/page.tsx` → `components/pages/DashboardOBPage.tsx`
3. Sisa route di bawah `dashboard/ob/` (deep-cleaning, laporan, plotting, stok)
4. `dashboard/driver`, `dashboard/qhse`, `dashboard/security` + subroute-nya
5. Semua route di bawah `admin/`
6. Portal publik `app/page.tsx` (1600+ baris) — paling besar & berisiko, dikerjakan terakhir

### Cara kerja per halaman
User paste isi `page.tsx` yang mau dipindah → dibalikin 2 file:
- `components/pages/XxxPage.tsx` — isi lengkap, nama komponen disesuaikan
- `page.tsx` versi tipis — tinggal import & render

---

## 4. OPEN QUESTIONS

- `kendaraan-reminder.yml`/`scripts/kendaraan-reminder.mjs` — sudah ada di repo, isi & tujuannya belum pernah dibahas, perlu dikonfirmasi Reza kalau mau disentuh/didokumentasikan.
- `fcm-reminder` (workflow + script) — sudah dibuat, belum di-deploy & belum di-test manual (`workflow_dispatch`).
- Pemanggilan `useFcmSetup(picName, !!picName)` di `dashboard/ob/page.tsx` — sudah dikasih instruksinya, belum dikonfirmasi sudah ditempel atau belum.
- Icon PWA asli (192x192, 512x512, maskable 512x512) masih belum ada, `manifest.json` masih pakai placeholder.

---

## 5. KONTEKS PROJECT (biar chat baru langsung nyambung)

- Reza — kerja di IT, General Affairs (GA), dan Building Management di perusahaan Makassar yang menaungi ~10 anak perusahaan. Bikin aplikasi internal buat streamline kerja staf, terutama GA.
- Project lain milik Reza: **Fin-Samudera** (reimbursement/LPJ/Bon Sementara, React + react-router-dom + Firebase) — struktur foldernya (`src/pages/` + `src/components/`) jadi acuan buat restrukturisasi SIBM di atas.
- Gaya komunikasi Reza: santai, to the point, tidak suka bullet points kecuali perlu (dokumen ini pakai tabel/list karena sifatnya rekap teknis, bukan chat biasa).
- **Kalau buka chat baru: cukup upload file ini di awal chat, gak perlu jelasin ulang dari nol.**
