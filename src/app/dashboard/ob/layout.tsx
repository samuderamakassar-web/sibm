// Banner in-app "Belum ada laporan checklist kebersihan dalam 3 jam terakhir"
// (ChecklistOBBanner) DICOPOT atas permintaan user -- dirasa mengganggu karena cuma
// kelihatan kalau tab/app lagi kebuka. Reminder-nya sekarang lewat push notification
// asli (FCM) yang sudah jalan tiap 30 menit, lihat scripts/fcm-reminder.mjs.
export default function DashboardOBLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
