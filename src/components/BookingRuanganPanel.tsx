"use client";

/**
 * Booking ruangan hari ini & besok untuk Security (§129) -- live (onSnapshot), pesanan baru (< 60 menit) ditandai BARU
 * agar langsung dicatat / disiapkan. Push notif tetap dari scripts/laporan-baru-reminder.mjs (per jalannya cron).
 */

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { rentangWaktu, type Booking } from "../lib/booking";

const tz = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });

export default function BookingRuanganPanel() {
  const [daftar, setDaftar] = useState<Booking[]>([]);
  const [sekarang, setSekarang] = useState(() => Date.now());

  useEffect(() => {
    const hariIni = tz.format(new Date());
    const awal = Timestamp.fromDate(new Date(`${hariIni}T00:00:00+08:00`));
    const akhir = Timestamp.fromMillis(awal.toMillis() + 2 * 86400000);
    // satu field (mulai) saja -> tanpa index komposit; jenis & status disaring di klien
    const unsub = onSnapshot(query(collection(db, "booking"), where("mulai", ">=", awal), where("mulai", "<", akhir)), (s) => {
      setDaftar(s.docs.map((d) => ({ id: d.id, ...d.data() } as Booking)).filter((b) => b.jenis === "ruangan" && b.status === "aktif").sort((a, b) => a.mulai.toMillis() - b.mulai.toMillis()));
    }, (e) => console.error("[booking security]", e));
    const t = setInterval(() => setSekarang(Date.now()), 60000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  const tampil = daftar.filter((b) => b.sampai.toMillis() > sekarang);
  if (tampil.length === 0) return null;
  return (
    <div style={{ marginBottom: "24px", padding: "16px", borderRadius: "20px", border: "1px solid var(--line)", background: "var(--surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <b style={{ fontSize: "16px", color: "var(--ink)" }}>📅 Booking ruangan ({tampil.length})</b>
        <span style={{ fontSize: "12px", color: "var(--muted)" }}>Hari ini & besok · siapkan akses & catat tamu</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {tampil.map((b) => {
          const baru = !!b.dibuat_pada && sekarang - b.dibuat_pada.toMillis() < 3600000;
          const berlangsung = b.mulai.toMillis() <= sekarang;
          return (
            <div key={b.id} style={{ padding: "10px 12px", borderRadius: "14px", background: baru ? "var(--warn-50)" : "var(--bg)", display: "flex", flexDirection: "column", gap: "2px" }}>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                {baru && <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "1px 6px", borderRadius: "5px", background: "var(--warn)", color: "#fff" }}>BARU</span>}
                {berlangsung && <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "1px 6px", borderRadius: "5px", background: "var(--ok-50)", color: "var(--ok)" }}>BERLANGSUNG</span>}
                <b style={{ fontSize: "14px", color: "var(--ink)" }}>{b.objek_nama}</b>
                <span style={{ fontSize: "13px", color: "var(--ink-soft)" }}>· {rentangWaktu(b.mulai.toDate(), b.sampai.toDate())}</span>
              </div>
              <div style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{b.nama_pemesan}{b.departemen && b.departemen !== "-" ? ` · ${b.departemen}` : ""}{b.keperluan ? ` — ${b.keperluan}` : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
