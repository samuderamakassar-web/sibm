// Banner in-app "Sesi patroli minimum belum terpenuhi" (PatroliShiftBanner) & "Inspeksi APAR
// belum lengkap" (AparInspectionBanner) DICOPOT dari dashboard Security atas permintaan user --
// dirasa mengganggu karena cuma kelihatan kalau tab/app lagi kebuka. Reminder-nya sekarang lewat
// push notification asli (FCM): patroli lihat scripts/patroli-push-reminder.mjs, APAR lihat
// scripts/apar-reminder.mjs (sudah ditambah kirim FCM push, bukan cuma tulis notifikasi_apar).
// AparInspectionBanner TETAP dipasang di admin/apar/page.tsx -- itu halaman monitoring internal
// Admin GA/QHSE, bukan sesi kerja harian staf lapangan, jadi bukan sasaran keluhan user.
export default function DashboardSecurityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
