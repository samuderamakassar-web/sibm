"use client";

/**
 * Dokumen legal milik satu PT untuk Dashboard Eksekutif (§143) -- hanya daftar & status (tanpa file / unduh).
 * Query array-contains pt == firestore.rules master_legalitas (Eksekutif hanya PT-nya sendiri).
 */

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import Tile from "./admin/Tile";
import { KATEGORI_LEGAL, kategoriDari, type DokumenLegal } from "../lib/legalBank";

const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
const fmt = (iso?: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-");

export default function DokumenLegalPT({ pt }: { pt: string }) {
  const [daftar, setDaftar] = useState<DokumenLegal[] | null>(null);
  useEffect(() => onSnapshot(query(collection(db, "master_legalitas"), where("pt", "array-contains", pt)), (s) => {
    setDaftar(s.docs.map((d) => ({ id: d.id, ...d.data() } as DokumenLegal)));
  }, (e) => { console.error("[legal PT]", e); setDaftar([]); }), [pt]);

  const status = (d: DokumenLegal) => {
    if (d.tanpa_masa_berlaku || !d.tanggal_berakhir_aktif) return { l: "Tanpa masa berlaku", bg: "var(--line)", fg: "var(--ink-soft)", n: 0 };
    const sisa = Math.ceil((new Date(d.tanggal_berakhir_aktif).getTime() - new Date(todayISO()).getTime()) / 86400000);
    return sisa < 0 ? { l: "Kadaluarsa", bg: "var(--red-50)", fg: "var(--red-600)", n: 3 } : sisa <= 60 ? { l: `${sisa} hari lagi`, bg: "var(--warn-50)", fg: "var(--warn)", n: 2 } : { l: "Aktif", bg: "var(--ok-50)", fg: "var(--ok)", n: 1 };
  };
  const urut = (daftar || []).slice().sort((a, b) => status(b).n - status(a).n || (a.tanggal_berakhir_aktif || "9").localeCompare(b.tanggal_berakhir_aktif || "9"));
  const perlu = urut.filter((d) => status(d).n >= 2).length;

  return (
    <Tile style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800 }}>Dokumen legal {pt.replace(/^PT\s+/i, "")}</h3>
        <span style={{ fontSize: "12px", color: perlu ? "var(--warn)" : "var(--muted)", fontWeight: 700 }}>{daftar === null ? "Memuat…" : `${urut.length} dokumen${perlu ? ` · ${perlu} perlu perhatian` : ""}`}</span>
      </div>
      {daftar !== null && urut.length === 0 && <div style={{ fontSize: "13px", color: "var(--muted)" }}>Belum ada dokumen legal tercatat untuk PT ini.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: "8px" }}>
        {urut.map((d) => {
          const s = status(d);
          return (
            <div key={d.id} style={{ padding: "10px 12px", borderRadius: "12px", background: "var(--bg)", display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                <b style={{ fontSize: "13.5px" }}>{d.nama_dokumen}</b>
                <span style={{ fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "999px", background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{s.l}</span>
              </div>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>{KATEGORI_LEGAL.find((k) => k.kode === kategoriDari(d))?.label}{d.kode_arsip ? ` · ${d.kode_arsip}` : ""}</span>
              <span style={{ fontSize: "12px", color: "var(--ink-soft)" }}>{d.nomor_dokumen ? `No. ${d.nomor_dokumen} · ` : ""}{s.n === 0 ? `terbit ${fmt(d.tanggal_terbit || d.tanggal_mulai_aktif)}` : `berlaku s.d. ${fmt(d.tanggal_berakhir_aktif)}`}</span>
            </div>
          );
        })}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Hanya daftar & status. Salinan dokumen dapat diminta ke Admin GA.</p>
    </Tile>
  );
}
