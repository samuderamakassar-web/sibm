import PatroliShiftBanner from "../../../components/PatroliShiftBanner";
import AparInspectionBanner from "../../../components/AparInspectionBanner";

export default function DashboardSecurityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PatroliShiftBanner />
      <AparInspectionBanner />
      {children}
    </>
  );
}
