"use client";

// §187 alamat lama (bookmark) -> /admin/pola-zona. Pola zona sudah permanen, bukan uji coba.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AlamatLamaPolaZona() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/pola-zona"); }, [router]);
  return null;
}
