"use client";

/**
 * src/components/HandbookMagangList.tsx
 * ------------------------------------------------------------------
 * Daftar materi handbook (PDF/video) yang diupload Admin GA lewat
 * admin/handbook-magang -- dipasang di dashboard/security/page.tsx, HANYA
 * dirender untuk staf berstatus Magang (dashboard/security sengaja
 * ditaruh di paling atas konten, biar langsung kelihatan begitu login).
 * ------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

type IconProps = { size?: number; color?: string };
const IconGraduationCap = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></svg>
);
const IconFileText = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v5h5" /><path d="M6 3h8l5 5v13H6z" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>
);
const IconPlayCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m10 9 5 3-5 3z" /></svg>
);

interface HandbookItem {
  id: string;
  judul: string;
  jenis: "pdf" | "video";
  url: string;
  deskripsi: string;
  dibuatPada: Timestamp | null;
}

// Video langsung (upload file, .mp4/.webm dll) bisa diputar inline pakai <video>; link
// YouTube/Google Drive HARUS dibuka di tab baru (gak bisa langsung di-<video>).
function isVideoFileLangsung(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export default function HandbookMagangList() {
  const [daftar, setDaftar] = useState<HandbookItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "handbook_magang"), where("aktif", "==", true), orderBy("dibuatPada", "desc")),
      (snap) => {
        setDaftar(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HandbookItem)));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  if (loading || daftar.length === 0) return null;

  return (
    <div className="no-print" style={{ background: "var(--surface, #fff)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", border: "1px solid var(--line, #e7e5e4)", padding: "20px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", color: "var(--accent, #7c3aed)" }}>
        <IconGraduationCap size={20} />
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "var(--ink, #18181b)" }}>Handbook Magang</h2>
      </div>
      <p style={{ margin: "0 0 14px 0", fontSize: "12.5px", color: "var(--muted, #71717a)" }}>Materi belajar dari Admin GA — pelajari sebelum/selama masa magang Anda.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {daftar.map((item) => (
          <div key={item.id} style={{ background: "var(--bg, #f7f6f5)", borderRadius: "14px", padding: "14px 16px", border: "1px solid var(--line, #e7e5e4)" }}>
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: item.jenis === "pdf" ? "var(--red-50, #fef2f2)" : "#f5f3ff", color: item.jenis === "pdf" ? "var(--red-600, #dc2626)" : "var(--accent, #7c3aed)" }}>
                {item.jenis === "pdf" ? <IconFileText size={17} /> : <IconPlayCircle size={17} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink, #18181b)" }}>{item.judul}</div>
                {item.deskripsi && <div style={{ fontSize: "11.5px", color: "var(--muted, #71717a)", marginTop: "2px" }}>{item.deskripsi}</div>}
              </div>
              <span style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--info, #2563eb)", flexShrink: 0 }}>{item.jenis === "pdf" ? "BUKA PDF" : "TONTON"} &rarr;</span>
            </a>
            {item.jenis === "video" && isVideoFileLangsung(item.url) && (
              <video controls src={item.url} style={{ width: "100%", borderRadius: "10px", marginTop: "10px", maxHeight: "220px" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
