"use client";

// §117 dibungkus WajibLogin: cek sesi Firebase Auth + departemen (dulu hanya localStorage).
import WajibLogin from "@/components/WajibLogin";
import InspeksiFasilitasPage from "@/components/pages/InspeksiFasilitasPage";

export default function Page() {
  return (
    <WajibLogin depts={["OB & CS"]} redirectTo="/" pesan="Akses Ditolak! Halaman ini khusus staf OB & CS.">
      <InspeksiFasilitasPage />
    </WajibLogin>
  );
}
