"use client";

/**
 * src/components/ui/StickyBanner.tsx
 * ------------------------------------------------------------------
 * Banner pengingat PERSISTEN (bukan toast sekali muncul). Dipasang oleh
 * komponen "banner" per-fitur (PatroliShiftBanner, AparInspectionBanner,
 * ChecklistOBBanner) yang menentukan sendiri kapan tugas dianggap belum
 * selesai (query langsung ke koleksi sumber data, bukan flag `dibaca`).
 *
 * Banner ini TIDAK bisa ditutup permanen -- hanya bisa "disembunyikan"
 * jadi pill kecil di pojok, dan otomatis kembali muncul penuh kalau
 * `resetKey` berubah (mis. pindah ke sesi/periode berikutnya), supaya
 * user tidak bisa mematikan pengingat selama tugas belum benar-benar
 * selesai.
 *
 * Juga bunyi (chime, lihat src/lib/soundAlert.ts) setiap kali banner
 * pertama muncul / resetKey berubah, lalu berulang tiap 10 menit selama
 * masih pending -- supaya jadi "alarm" beneran, bukan cuma visual, dan
 * TETAP bunyi walau lagi disembunyikan (collapsed) sampai tugasnya
 * kelar (parent cuma me-render StickyBanner selama pending == true).
 * ------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { bunyikanAlertPengingat } from "../../lib/soundAlert";

interface StickyBannerProps {
  message: string;
  subMessage?: string;
  tone?: "warning" | "urgent";
  /** Ganti value ini (mis. sesi aktif / tanggal) supaya banner yang sudah disembunyikan muncul lagi. */
  resetKey?: string;
}

const TONE_STYLES = {
  warning: { bg: "linear-gradient(90deg,#fff7ed,#fffaf0)", border: "#fdba74", text: "#9a3412", pill: "#d97706", icon: "⚠️" },
  urgent: { bg: "linear-gradient(90deg,#fef2f2,#fff1f2)", border: "#fca5a5", text: "#9f1d1d", pill: "#dc2626", icon: "🚨" },
};

export default function StickyBanner({ message, subMessage, tone = "warning", resetKey }: StickyBannerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const s = TONE_STYLES[tone];

  useEffect(() => {
    const t = setTimeout(() => setCollapsed(false), 0);
    return () => clearTimeout(t);
  }, [resetKey]);

  // Alarm suara: bunyi begitu banner ini pertama tampil (mount) atau resetKey berganti
  // (sesi/hari baru), lalu berulang tiap 10 menit selama komponen masih ter-mount --
  // parent (PatroliShiftBanner/AparInspectionBanner/ChecklistOBBanner) cuma me-render
  // StickyBanner selama tugasnya masih pending, jadi unmount = otomatis berhenti bunyi.
  useEffect(() => {
    bunyikanAlertPengingat(tone);
    const interval = setInterval(() => bunyikanAlertPengingat(tone), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [resetKey, tone]);

  if (collapsed) {
    return (
      <div style={{ position: "sticky", top: 0, zIndex: 60, display: "flex", justifyContent: "flex-end", padding: "8px 14px", pointerEvents: "none" }}>
        <button
          onClick={() => setCollapsed(false)}
          style={{
            pointerEvents: "auto", cursor: "pointer", background: s.pill, color: "#fff", fontSize: "12px", fontWeight: 800,
            padding: "8px 14px", borderRadius: "20px", boxShadow: "0 6px 14px rgba(0,0,0,0.18)", display: "flex",
            alignItems: "center", gap: "6px", border: "none", fontFamily: "'Inter', sans-serif",
          }}
        >
          {s.icon} Pengingat aktif
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 60, background: s.bg, borderBottom: `1px solid ${s.border}`,
        padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
        fontFamily: "'Inter', sans-serif", animation: "sibm-banner-in 0.25s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ fontSize: "18px", lineHeight: 1 }}>{s.icon}</span>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 800, color: s.text }}>{message}</div>
          {subMessage && <div style={{ fontSize: "11.5px", color: s.text, opacity: 0.85, marginTop: "2px" }}>{subMessage}</div>}
        </div>
      </div>
      <button
        onClick={() => setCollapsed(true)}
        style={{
          background: "rgba(255,255,255,0.6)", border: `1px solid ${s.border}`, color: s.text, borderRadius: "8px",
          padding: "6px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
        }}
      >
        Sembunyikan
      </button>

      <style jsx global>{`
        @keyframes sibm-banner-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
