"use client";

/**
 * Error boundary aplikasi (§126). Penyebab tersering di HP staf: aplikasi masih memegang versi lama lalu file
 * chunk lama sudah hilang setelah deploy (ChunkLoadError) -> muat ulang otomatis 1x (dijaga sessionStorage
 * agar tidak berputar). Error lain: tampilkan pesannya supaya screenshot staf langsung bisa didiagnosis.
 */

import { useEffect } from "react";

const KUNCI = "sibm_reload_error";
const isChunkError = (e: Error) => /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i.test(`${e.name} ${e.message}`);

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error);
    if (!isChunkError(error)) return;
    let sudah = 0;
    try { sudah = Number(sessionStorage.getItem(KUNCI)) || 0; } catch { /* storage diblokir */ }
    if (Date.now() - sudah < 60000) return; // baru saja reload -> jangan berputar
    try { sessionStorage.setItem(KUNCI, String(Date.now())); } catch { /* abaikan */ }
    window.location.reload();
  }, [error]);

  const versiLama = isChunkError(error);
  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: "24px 16px" }}>
      <div style={{ maxWidth: "420px", width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h1 style={{ margin: 0, fontSize: "22px", color: "var(--ink)" }}>{versiLama ? "Aplikasi baru saja diperbarui" : "Halaman gagal dimuat"}</h1>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--ink-soft)" }}>
          {versiLama ? "Sedang memuat versi terbaru… Bila tidak berubah, tekan Muat ulang." : "Tekan Muat ulang. Bila masih muncul, kirim screenshot layar ini ke Admin GA."}
        </p>
        {!versiLama && (
          <code style={{ fontSize: "12px", padding: "10px 12px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)", wordBreak: "break-word" }}>
            {error.name}: {error.message || "-"}{error.digest ? ` (${error.digest})` : ""} · {typeof window !== "undefined" ? window.location.pathname : ""}
          </code>
        )}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="sa-btn is-primary" onClick={() => window.location.reload()}>Muat ulang</button>
          {!versiLama && <button type="button" className="sa-btn is-soft" onClick={() => retry()}>Coba lagi</button>}
          {/* muat penuh (bukan router.push) agar versi lama di memori ikut terbuang */}
          {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
          <button type="button" className="sa-btn is-soft" onClick={() => { window.location.href = "/"; }}>Ke beranda</button>
        </div>
      </div>
    </div>
  );
}
