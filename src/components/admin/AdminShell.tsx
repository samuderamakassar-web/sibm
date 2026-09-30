"use client";

/**
 * src/components/admin/AdminShell.tsx
 * ------------------------------------------------------------------
 * Kerangka bersama semua halaman admin/* (gaya "Bento Hangat"): token warna terang/gelap,
 * header sticky (kembali / logo, tombol tema, lonceng notifikasi, akun, logout opsional),
 * dan judul halaman. Halaman cukup membungkus isinya:
 *
 *   <AdminShell title="Master Data Laptop" userName={session.nama}>...</AdminShell>
 *
 * Saat memigrasi halaman lama ke sini: hapus blok :root, .site-header, .admin-hero, dan
 * komponen IconXxx lokal halaman itu -- semuanya sudah disediakan di sini
 * (admin-theme.css & AdminIcon.tsx).
 * ------------------------------------------------------------------
 */

import "./admin-theme.css";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import NotifikasiBellButton from "../NotifikasiBellButton";
import AdminIcon from "./AdminIcon";
import { useAdminTheme } from "./useAdminTheme";

interface AdminShellProps {
  /** Judul besar halaman. Kosongkan kalau halaman menggambar judulnya sendiri (mis. hub). */
  title?: string;
  subtitle?: ReactNode;
  /** Nama yang login -- dipakai untuk chip akun & lonceng notifikasi. Kosong (halaman publik
   *  seperti portal utama) = lonceng & chip akun tidak ditampilkan. */
  userName?: string;
  /** Elemen tambahan di header kanan, sebelum tombol tema (mis. tombol "Masuk Staf" di portal). */
  headerExtra?: ReactNode;
  /** Tujuan tombol kembali. null = tampilkan logo SIBM (dipakai halaman hub admin). */
  backHref?: string | null;
  backLabel?: string;
  /** Kalau diisi, tombol kembali menjalankan ini (mis. router.back()) alih-alih pindah ke backHref.
   *  Dipakai halaman yang bisa dibuka dari banyak tempat (notifikasi, tukar shift, siram). */
  onBack?: () => void;
  /** Tombol tambahan di sisi kanan judul halaman (mis. "Tambah Data", "Export"). */
  actions?: ReactNode;
  /** Kalau diisi, muncul tombol logout bulat di header. */
  onLogout?: () => void;
  /** Teks kecil di samping logo SIBM (tampil kalau backHref null). Dashboard staf mengisi nama
   *  departemennya, mis. "Security" atau "OB & CS". */
  brandSub?: string;
  /** Navigasi bawah khusus HP (dashboard staf lapangan). Isinya tombol-tombol .sa-nav-item. */
  bottomNav?: ReactNode;
  children: ReactNode;
}

function inisial(nama: string): string {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return "?";
  return (kata[0][0] + (kata.length > 1 ? kata[kata.length - 1][0] : "")).toUpperCase();
}

export default function AdminShell({
  title,
  subtitle,
  userName = "",
  headerExtra,
  backHref = "/admin",
  backLabel = "Control Panel",
  onBack,
  actions,
  onLogout,
  brandSub = "Admin GA",
  bottomNav,
  children,
}: AdminShellProps) {
  const router = useRouter();
  const { resolved, dataTheme, toggle } = useAdminTheme();
  const keGelap = resolved !== "dark";

  return (
    <div className="sibm-admin" data-theme={dataTheme}>
      <header className="sa-header">
        <div className="sa-header-left">
          {backHref ? (
            <button type="button" className="sa-back-btn" onClick={() => (onBack ? onBack() : router.push(backHref))} aria-label={`Kembali ke ${backLabel}`}>
              <AdminIcon name="arrowLeft" size={18} strokeWidth={2} />
              <span className="sa-hide-mobile">{backLabel}</span>
            </button>
          ) : (
            <div className="sa-logo">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, gambar kecil lokal */}
              <img className="sa-logo-mark" src="/icons/logo-mark.png" alt="Samudera" width={38} height={38} />
              <span>
                SIBM <span className="sa-logo-sub">{brandSub}</span>
              </span>
            </div>
          )}
        </div>

        <div className="sa-header-right">
          {headerExtra}
          <button
            type="button"
            className="sa-icon-btn"
            onClick={toggle}
            aria-label={keGelap ? "Ganti ke mode gelap" : "Ganti ke mode terang"}
            title={keGelap ? "Mode gelap" : "Mode terang"}
          >
            <AdminIcon name={keGelap ? "moon" : "sun"} size={19} />
          </button>
          {userName && (
            <>
              <NotifikasiBellButton picName={userName} variant="gelap" />
              <div className="sa-account" title={userName}>
                <span className="sa-avatar">{inisial(userName)}</span>
                <span className="sa-account-name sa-hide-mobile">{userName}</span>
              </div>
            </>
          )}
          {onLogout && (
            <button type="button" className="sa-icon-btn is-danger" onClick={onLogout} aria-label="Keluar" title="Keluar">
              <AdminIcon name="logOut" size={18} />
            </button>
          )}
        </div>
      </header>

      <main className={`sa-main${bottomNav ? " has-bottom-nav" : ""}`}>
        {(title || actions) && (
          <div className="sa-page-head">
            <div>
              {title && <h1 className="sa-title">{title}</h1>}
              {subtitle && <p className="sa-subtitle">{subtitle}</p>}
            </div>
            {actions && <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>{actions}</div>}
          </div>
        )}
        {children}
      </main>

      {bottomNav && (
        <nav className="sa-bottom-nav" aria-label="Navigasi utama">
          {bottomNav}
        </nav>
      )}
    </div>
  );
}
