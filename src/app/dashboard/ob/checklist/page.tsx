"use client";

// §117 dibungkus WajibLogin: cek sesi Firebase Auth + departemen (dulu hanya localStorage).
import WajibLogin from "@/components/WajibLogin";
import ChecklistOBPage from "@/components/pages/ChecklistOBPage";

export default function Page() {
  return (
    <WajibLogin depts={["OB & CS"]} redirectTo="/" pesan="Akses Ditolak! Halaman ini khusus staf OB & CS.">
      <ChecklistOBPage />
    </WajibLogin>
  );
}
