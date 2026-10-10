"use client";

// §117 dibungkus WajibLogin: cek sesi Firebase Auth + departemen (dulu hanya localStorage).
import WajibLogin from "@/components/WajibLogin";
import NotifikasiInboxPage from "@/components/pages/NotifikasiInboxPage";

export default function Page() {
  return (
    <WajibLogin redirectTo="/" pesan="Silakan login untuk melihat notifikasi.">
      <NotifikasiInboxPage />
    </WajibLogin>
  );
}
