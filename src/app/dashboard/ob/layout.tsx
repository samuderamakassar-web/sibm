import ChecklistOBBanner from "../../../components/ChecklistOBBanner";

export default function DashboardOBLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ChecklistOBBanner />
      {children}
    </>
  );
}
