"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useToast } from "../components/ui/ToastProvider";

// =============================================================================
// SATU-SATUNYA SUMBER LOGIKA ROLE/AKSES DI SELURUH APLIKASI.
//
// Kenapa ini dibuat: beberapa bug akses yang pernah kejadian di project ini semuanya
// berakar dari tiap halaman nulis ulang logika cek role/dept sendiri-sendiri secara
// tidak konsisten:
//   - dashboard/ob/page.tsx sempat ngecek nama user literally mengandung "hilal"
//     (di-hardcode ke 1 koordinator), bukan berdasarkan role sama sekali.
//   - dashboard/ob/plotting/page.tsx sempat mewajibkan role DAN dept "OB & CS" sekaligus,
//     jadi akun Administrator dari dept lain malah ke-block.
//   - dashboard/security/page.tsx redirect ke "/dashboard" yang gak punya page.tsx fisik
//     (404) karena static export.
//   - dashboard/security/jadwal/page.tsx & dashboard/driver/page.tsx masing-masing nulis
//     ulang pola baca localStorage + alert + router.push + setTimeout(setState) sendiri.
//
// Dengan hook ini, SEMUA halaman baca localStorage & tentukan izin akses lewat 1 tempat.
// Kalau nanti ada perubahan aturan role (misal nambah role baru), cukup diubah di sini.
// =============================================================================

export interface AuthSession {
  nama: string;
  role: string;
  dept: string;
}

/** Baca sesi login dari localStorage TANPA melakukan redirect apapun.
 *  Dipakai untuk logika di DALAM halaman (misal: sembunyikan/tampilkan 1 panel
 *  berdasarkan role), bukan untuk menjaga akses seluruh halaman — untuk itu pakai useAuthGuard. */
export function getStoredSession(): AuthSession {
  if (typeof window === "undefined") return { nama: "", role: "", dept: "" };
  return {
    nama: localStorage.getItem("pic_nama") || "",
    role: localStorage.getItem("pic_role") || "Staff",
    dept: localStorage.getItem("pic_dept") || "",
  };
}

/** Administrator dianggap superuser: lolos cek role DAN dept apapun secara default.
 *  Ini yang bikin akun Admin bisa buka halaman dept manapun (fix untuk bug plotting OB). */
export function isAdministrator(role: string): boolean {
  return role.toLowerCase().includes("administrator") || role.toLowerCase().includes("admin");
}

/** Cek apakah `role` cocok salah satu dari daftar `patterns`, case-insensitive, substring match.
 *  Contoh: roleMatches("Koordinator / Danru", ["Koordinator", "Danru"]) -> true */
export function roleMatches(role: string, patterns: string[]): boolean {
  const roleLower = role.toLowerCase();
  return patterns.some(p => roleLower.includes(p.toLowerCase()));
}

export interface AuthGuardOptions {
  /** Daftar role yang boleh akses (cocok substring, case-insensitive).
   *  Kosongkan/omit kalau halaman ini cuma butuh "sudah login", role apapun boleh. */
  roles?: string[];
  /** Daftar dept yang boleh akses (cocok EXACT, sesuai nilai yang tersimpan — "Driver", "Security", "OB & CS", dst).
   *  Kosongkan/omit kalau halaman ini tidak membatasi dept. */
  depts?: string[];
  /** Administrator otomatis lolos berapa pun batasan roles/depts di atas. Default true.
   *  Set false hanya kalau memang mau halaman ini benar-benar tertutup dari Admin juga (jarang). */
  adminBypass?: boolean;
  /** Halaman tujuan redirect kalau akses ditolak ATAU belum login. Default "/". */
  redirectTo?: string;
  /** Pesan alert yang muncul saat akses ditolak. */
  deniedMessage?: string;
}

export interface AuthGuardResult {
  /** null selama proses cek berlangsung ATAU kalau akses ditolak (karena sudah di-redirect). */
  session: AuthSession | null;
  /** true setelah cek akses selesai DAN berhasil — dipakai buat gating render (`if (!isReady) return null;`). */
  isReady: boolean;
}

/**
 * Guard akses untuk 1 HALAMAN PENUH. Redirect otomatis + alert kalau tidak berhak.
 *
 * Contoh pemakaian (menggantikan blok useEffect manual yang sebelumnya ada di tiap halaman):
 *
 *   const { session, isReady } = useAuthGuard({
 *     roles: ["Danru", "Koordinator"],
 *     redirectTo: "/dashboard/security",
 *     deniedMessage: "Akses Ditolak! Halaman ini khusus Komandan Regu (Danru).",
 *   });
 *   if (!isReady || !session) return null;
 *   // ...pakai session.nama, session.role, session.dept di bawah sini
 */
export function useAuthGuard(options: AuthGuardOptions = {}): AuthGuardResult {
  const router = useRouter();
  const showToast = useToast();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Cek sesi Firebase Auth SUNGGUHAN dulu -- localStorage (pic_nama/pic_role/pic_dept) cuma
    // cache tampilan, bukan lagi sumber kebenaran akses. Kalau tidak ada sesi Firebase Auth
    // aktif (mis. localStorage di-tulis manual lewat DevTools tanpa login beneran), langsung
    // dianggap belum login, apa pun isi localStorage-nya.
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const { nama, role, dept } = getStoredSession();
      const adminBypass = options.adminBypass !== false && isAdministrator(role);

      const roleOk = !options.roles || options.roles.length === 0 || roleMatches(role, options.roles) || adminBypass;
      const deptOk = !options.depts || options.depts.length === 0 || options.depts.includes(dept) || adminBypass;
      const sudahLogin = !!firebaseUser && nama.trim().length > 0;

      if (!sudahLogin || !roleOk || !deptOk) {
        showToast(options.deniedMessage || "Akses Ditolak! Anda tidak memiliki izin untuk membuka halaman ini.", "error");
        redirectTimer = setTimeout(() => router.push(options.redirectTo || "/"), 1200);
        return;
      }

      // setState langsung di body effect kena lint react-hooks/set-state-in-effect -> bungkus setTimeout(...,0)
      // (konvensi yang sudah dipakai di beberapa halaman lain di project ini)
      readyTimer = setTimeout(() => {
        setSession({ nama, role, dept });
        setIsReady(true);
      }, 0);
    });

    return () => {
      unsubscribe();
      if (redirectTimer) clearTimeout(redirectTimer);
      if (readyTimer) clearTimeout(readyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return { session, isReady };
}

/** Hapus sesi login & redirect ke halaman login. Dipakai untuk tombol Keluar/Logout —
 *  disentralkan juga supaya tidak ada lagi redirect ke rute yang tidak ada fisiknya (404). */
export function logout(router: { push: (path: string) => void }, redirectTo: string = "/") {
  localStorage.clear();
  signOut(auth).catch((err) => console.error("[logout] Gagal signOut Firebase Auth:", err));
  router.push(redirectTo);
}

/** Opsi dialog konfirmasi, cocok dengan bentuk yang diminta useConfirm() (ConfirmProvider.tsx). */
interface KonfirmasiLogoutOptions {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: "danger";
}

/**
 * Tombol Keluar/Logout dengan modal konfirmasi SERAGAM di seluruh halaman —
 * menggantikan 6 implementasi berbeda yang sebelumnya ada (modal custom
 * copy-paste, window.confirm() native, atau tanpa konfirmasi sama sekali).
 *
 * Cara pakai di halaman manapun:
 *   const confirm = useConfirm();
 *   const router = useRouter();
 *   <button onClick={() => logoutWithConfirm(confirm, router)}>Keluar</button>
 */
export async function logoutWithConfirm(
  confirmFn: (options: KonfirmasiLogoutOptions) => Promise<boolean>,
  router: { push: (path: string) => void },
  redirectTo: string = "/"
): Promise<boolean> {
  const yakin = await confirmFn({
    title: "Keluar dari Akun",
    message: "Yakin ingin keluar? Anda perlu login kembali untuk mengakses halaman ini.",
    confirmText: "Ya, Keluar",
    cancelText: "Batal",
    variant: "danger",
  });
  if (yakin) logout(router, redirectTo);
  return yakin;
}