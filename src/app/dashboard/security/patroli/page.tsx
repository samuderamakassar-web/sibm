"use client";

// §117 dibungkus WajibLogin: cek sesi Firebase Auth + departemen (dulu hanya localStorage).
import WajibLogin from "@/components/WajibLogin";
import PatroliSecurityPage from "@/components/pages/PatroliSecurityPage";

export default function Page() {
  return (
    <WajibLogin depts={["Security"]} redirectTo="/" pesan="Akses Ditolak! Halaman ini khusus Tim Security.">
      <PatroliSecurityPage />
    </WajibLogin>
  );
}
