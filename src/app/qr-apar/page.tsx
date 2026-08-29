"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";

// ==========================================
// IKON — halaman publik (tanpa login), dilihat siapa saja yang scan QR fisik APAR
// ==========================================
type IconProps = { size?: number; color?: string };
const IconFireExtinguisher = ({ size = 34, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3v2" /><path d="M8 5h6l1 2H7z" /><path d="M9 7v3" /><path d="M15 7l4-2" /><path d="M9 10h4a3 3 0 0 1 3 3v8H8v-8a3 3 0 0 1 1-2z" /><path d="M8 15h8" /></svg>
);
const IconMapPin = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.7 7-12a7 7 0 1 0-14 0c0 5.3 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
const IconCheckCircle = ({ size = 34, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
);
const IconAlertTriangle = ({ size = 34, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 4.5 2.9 18a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.5 4.5a2 2 0 0 0-3 0z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
const IconUserCircle = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconClock = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);

interface TerakhirInspeksi {
  petugas: string;
  waktu: Timestamp | null;
  bulan_tahun: string;
  kondisi_tabung: string;
  tekanan: string;
  segel_utuh: boolean;
}

interface AparUnit {
  lantai: string;
  kode: string;
  lokasi: string;
  kadaluarsa: string;
  terakhir_inspeksi: TerakhirInspeksi | null;
}

const bulanTahunSekarang = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function QRAparPublicPage() {
  const [aparId, setAparId] = useState<string | null>(null);
  const [unit, setUnit] = useState<AparUnit | null | undefined>(undefined); // undefined = loading, null = tidak ditemukan

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = setTimeout(() => setAparId(params.get("id")), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!aparId) return;
    const unsub = onSnapshot(doc(db, "apar_units", aparId), (snap) => {
      setUnit(snap.exists() ? (snap.data() as AparUnit) : null);
    });
    return () => unsub();
  }, [aparId]);

  const formatWaktu = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return ts.toDate().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const sudahBulanIni = unit?.terakhir_inspeksi?.bulan_tahun === bulanTahunSekarang();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f7f6f5)", fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 15px" }}>
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --warn: #d97706; --warn-50: #fff7ed;
        }
        * { box-sizing: border-box; }
      `}} />

      <div style={{ marginBottom: "20px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-samudera.png" alt="Logo Samudera" style={{ height: "34px" }} />
      </div>

      <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "30px 25px", maxWidth: "420px", width: "100%", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", textAlign: "center" }}>

        {unit === undefined ? (
          <div style={{ padding: "30px 0", color: "var(--muted)", fontSize: "14px" }}>Memuat data APAR...</div>
        ) : unit === null ? (
          <>
            <div style={{ width: "68px", height: "68px", borderRadius: "50%", background: "var(--red-50)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <IconAlertTriangle size={32} color="var(--red-600)" />
            </div>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "var(--ink)" }}>QR Tidak Dikenali</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>Unit APAR ini tidak ditemukan di sistem SIBM. Mohon hubungi tim GA/Security gedung.</p>
          </>
        ) : (
          <>
            <div style={{ width: "68px", height: "68px", borderRadius: "50%", background: "var(--red-50)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <IconFireExtinguisher size={34} color="var(--red-600)" />
            </div>
            <h1 style={{ margin: "0 0 4px 0", fontSize: "22px", fontWeight: 900, color: "var(--ink)" }}>{unit.kode}</h1>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", color: "var(--muted)", fontSize: "13px", marginBottom: "20px" }}>
              <IconMapPin size={14} /> {unit.lokasi} · {unit.lantai}
            </div>

            <div style={{ padding: "18px", borderRadius: "16px", marginBottom: "16px", background: sudahBulanIni ? "var(--ok-50)" : "var(--warn-50)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "6px" }}>
                {sudahBulanIni ? <IconCheckCircle size={22} color="var(--ok)" /> : <IconAlertTriangle size={22} color="var(--warn)" />}
                <span style={{ fontWeight: 800, fontSize: "14px", color: sudahBulanIni ? "var(--ok)" : "var(--warn)" }}>
                  {sudahBulanIni ? "Sudah Diinspeksi Bulan Ini" : "Belum Diinspeksi Bulan Ini"}
                </span>
              </div>

              {unit.terakhir_inspeksi ? (
                <div style={{ fontSize: "13px", color: "var(--ink-soft)", lineHeight: "1.7", marginTop: "10px", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><IconUserCircle size={14} color="var(--muted)" /> Diinspeksi oleh <b>{unit.terakhir_inspeksi.petugas}</b></div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><IconClock size={14} color="var(--muted)" /> Pada {formatWaktu(unit.terakhir_inspeksi.waktu)}</div>
                  <div style={{ marginTop: "8px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", background: "var(--surface)", padding: "3px 9px", borderRadius: "20px", fontWeight: 700 }}>Tabung: {unit.terakhir_inspeksi.kondisi_tabung}</span>
                    <span style={{ fontSize: "11px", background: "var(--surface)", padding: "3px 9px", borderRadius: "20px", fontWeight: 700 }}>Tekanan: {unit.terakhir_inspeksi.tekanan}</span>
                    <span style={{ fontSize: "11px", background: "var(--surface)", padding: "3px 9px", borderRadius: "20px", fontWeight: 700 }}>Segel: {unit.terakhir_inspeksi.segel_utuh ? "Utuh" : "Rusak"}</span>
                  </div>
                </div>
              ) : (
                <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "var(--muted)" }}>Belum pernah tercatat riwayat inspeksi untuk unit ini.</p>
              )}
            </div>

            <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)" }}>Petugas Security: scan ulang QR ini dari menu Inspeksi APAR untuk mencatat inspeksi baru.</p>
          </>
        )}
      </div>
    </div>
  );
}
