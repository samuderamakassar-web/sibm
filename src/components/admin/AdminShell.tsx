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
  /** Nama admin yang login -- dipakai untuk chip akun & lonceng notifikasi. */
  userName: string;
  /** Tujuan tombol kembali. null = tampilkan logo SIBM (dipakai halaman hub admin). */
  backHref?: string | null;
  backLabel?: string;
  /** Tombol tambahan di sisi kanan judul halaman (mis. "Tambah Data", "Export"). */
  actions?: ReactNode;
  /** Kalau diisi, muncul tombol logout bulat di header. */
  onLogout?: () => void;
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
  userName,
  backHref = "/admin",
  backLabel = "Control Panel",
  actions,
  onLogout,
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
            <button type="button" className="sa-back-btn" onClick={() => router.push(backHref)} aria-label={`Kembali ke ${backLabel}`}>
              <AdminIcon name="arrowLeft" size={18} strokeWidth={2} />
              <span className="sa-hide-mobile">{backLabel}</span>
            </button>
          ) : (
            <div className="sa-logo">
              <span className="sa-logo-mark">S</span>
              <span>
                SIBM <span className="sa-logo-sub">Admin GA</span>
              </span>
            </div>
          )}
        </div>

        <div className="sa-header-right">
          <button
            type="button"
            className="sa-icon-btn"
            onClick={toggle}
            aria-label={keGelap ? "Ganti ke mode gelap" : "Ganti ke mode terang"}
            title={keGelap ? "Mode gelap" : "Mode terang"}
          >
            <AdminIcon name={keGelap ? "moon" : "sun"} size={19} />
          </button>
          <NotifikasiBellButton picName={userName} variant="gelap" />
          <div className="sa-account" title={userName}>
            <span className="sa-avatar">{inisial(userName)}</span>
            <span className="sa-account-name sa-hide-mobile">{userName}</span>
          </div>
          {onLogout && (
            <button type="button" className="sa-icon-btn is-danger" onClick={onLogout} aria-label="Keluar sesi admin" title="Keluar sesi admin">
              <AdminIcon name="logOut" size={18} />
            </button>
          )}
        </div>
      </header>

      <main className="sa-main">
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
    </div>
  );
}
