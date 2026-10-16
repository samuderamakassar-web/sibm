"use client";

/**
 * Info jadwal otomatis (§157) -- scripts/jadwal-otomatis.mjs (workflow jadwal-otomatis.yml) setiap malam mengisi
 * tanggal yang masih KOSONG hingga 60 hari ke depan tanpa menimpa perubahan manual. Kartu ini membuat fitur itu
 * terlihat di halaman Plotting OB & Jadwal Security, plus tanggal terakhir yang sudah terisi.
 */

import { useEffect, useState } from "react";
import { collection, documentId, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";

const fmt = (iso: string) => new Date(`${iso}T12:00:00+08:00`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" });

export default function JadwalOtomatisInfo({ jenis }: { jenis: "ob" | "security" }) {
  const [sampai, setSampai] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        if (jenis === "ob") {
          const s = await getDocs(query(collection(db, "daily_plots"), orderBy(documentId(), "desc"), limit(1)));
          if (!batal) setSampai(s.docs[0]?.id || "");
        } else {
          const s = await getDocs(collection(db, "security_monthly_schedules"));
          let maks = "";
          s.docs.forEach((d) => {
            const hari = (d.data().data_hari || {}) as Record<string, Record<string, string>>;
            Object.entries(hari).forEach(([tgl, isi]) => { if (Object.values(isi || {}).some((v) => v && v !== "-") && tgl > maks) maks = tgl; });
          });
          if (!batal) setSampai(maks);
        }
      } catch (e) { console.error("[jadwal otomatis]", e); if (!batal) setSampai(""); }
    })();
    return () => { batal = true; };
  }, [jenis]);

  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "12px 14px", borderRadius: "14px", background: "var(--ok-50)", color: "var(--ink)", fontSize: "12.5px", marginBottom: "14px" }}>
      <span style={{ fontSize: "16px", lineHeight: 1 }}>🔁</span>
      <div>
        <b>Jadwal otomatis aktif.</b> Setiap malam sistem mengisi tanggal yang masih kosong hingga <b>60 hari ke depan</b> tanpa menimpa jadwal yang sudah diubah manual (izin, tukar shift, penunjukan).
        {sampai === null ? " Memeriksa…" : sampai ? <> Saat ini terisi s.d. <b>{fmt(sampai)}</b>.</> : " Belum ada jadwal tersimpan."}
        <div style={{ color: "var(--muted)", marginTop: "2px" }}>
          {jenis === "ob"
            ? "Syarat: OB Pelayanan Tetap sudah dipilih. Tombol Generate hanya perlu untuk menyusun ulang dari tanggal tertentu."
            : "Syarat: tiap staf punya minimal 1 hari jadwal (staf baru isi hari pertama manual). Tombol Generate hanya perlu untuk menyusun ulang."}
        </div>
      </div>
    </div>
  );
}
