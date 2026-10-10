"use client";

/**
 * Gerbang login untuk halaman staf (§117). Beberapa halaman lama hanya membaca pic_nama/pic_dept dari
 * localStorage (bisa dipalsukan lewat DevTools). Bungkus ini memakai useAuthGuard -- memeriksa sesi Firebase Auth
 * sungguhan + departemen -- dan tidak merender isi halaman sebelum lolos. Data tetap dilindungi firestore.rules.
 */

import type { ReactNode } from "react";
import { useAuthGuard } from "../hooks/useAuthGuard";

export default function WajibLogin({ depts, roles, redirectTo = "/", pesan, children }: { depts?: string[]; roles?: string[]; redirectTo?: string; pesan?: string; children: ReactNode }) {
  const { isReady } = useAuthGuard({ depts, roles, redirectTo, deniedMessage: pesan || "Akses Ditolak! Silakan login dengan akun yang berhak." });
  if (!isReady) return null;
  return <>{children}</>;
}
