import AparInspectionBanner from "../../../components/AparInspectionBanner";

// Banner in-app "Sesi patroli minimum belum terpenuhi" (PatroliShiftBanner) DICOPOT atas
// permintaan user -- dirasa mengganggu karena cuma kelihatan kalau tab/app lagi kebuka.
// Reminder-nya sekarang lewat push notification asli (FCM), lihat
// scripts/patroli-push-reminder.mjs, bukan banner in-app lagi.
export default function DashboardSecurityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AparInspectionBanner />
      {children}
    </>
  );
}
