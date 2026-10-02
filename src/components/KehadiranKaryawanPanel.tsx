"use client";

/**
 * Kehadiran & Lembur Karyawan hari ini (§67) -- versi LENGKAP untuk hub Admin GA (login):
 * foto validasi Security, area lembur, alasan tidak masuk. Portal publik hanya menampilkan
 * nama & jumlah (lihat Status Operasional di src/app/page.tsx) -- keputusan privasi user.
 * Sumber: validasi_karyawan (cron scripts/validasi-karyawan.mjs + jawaban Security).
 */

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { jamWITA, tanggalWITA, type ValidasiKaryawan } from "../lib/validasiKaryawan";

const jam = (ts?: { toDate: () => Date } | null) => (ts ? jamWITA(ts.toDate()) : "-");

export default function KehadiranKaryawanPanel() {
  const [hariIni] = useState(() => tanggalWITA(new Date()));
  const kemarin = tanggalWITA(new Date(new Date(`${hariIni}T12:00:00+08:00`).getTime() - 86400000));
  const [data, setData] = useState<ValidasiKaryawan[] | null>(null);

  useEffect(() => {
    // Kemarin ikut dimuat: lembur yang lewat tengah malam bertanggal check-in.
    const unsub = onSnapshot(
      query(collection(db, "validasi_karyawan"), where("tanggal", "in", [kemarin, hariIni])),
      (snap) => setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ValidasiKaryawan))),
      (err) => { console.error("[admin] Gagal memuat kehadiran:", err); setData([]); }
    );
    return () => unsub();
  }, [hariIni, kemarin]);

  const semua = data || [];
  const lembur = semua.filter((v) => v.jenis === "lembur" && (v.status === "lanjut" || (v.status === "selesai" && v.overtime_id)));
  const tidakMasuk = semua.filter((v) => v.jenis === "belum_input" && v.tanggal === hariIni && v.status === "tidak_masuk");
  const menunggu = semua.filter((v) => v.status === "menunggu" && (v.jenis === "lembur" || v.tanggal === hariIni)).length;
  const susulan = semua.filter((v) => v.jenis === "belum_input" && v.tanggal === hariIni && v.status === "diinput_susulan").length;

  const Kartu = ({ v, isi }: { v: ValidasiKaryawan; isi: React.ReactNode }) => (
    <div style={{ display: "flex", gap: "12px", alignItems: "center", padding: "10px 12px", borderRadius: "14px", background: "var(--bg)" }}>
      {v.foto_url ? (
        <a href={v.foto_url} target="_blank" rel="noopener noreferrer" aria-label={`Foto validasi ${v.nama}`} style={{ flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto Cloudinary */}
          <img src={v.foto_url} alt="" style={{ width: "52px", height: "52px", borderRadius: "12px", objectFit: "cover", display: "block" }} />
        </a>
      ) : (
        <span style={{ width: "52px", height: "52px", borderRadius: "12px", background: "var(--hover)", flexShrink: 0 }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 800, color: "var(--ink)" }}>{v.nama}</div>
        <div style={{ fontSize: "12px", color: "var(--muted)", overflowWrap: "anywhere" }}>{isi}</div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "var(--ink)" }}>Kehadiran & lembur karyawan</h2>
        <span style={{ fontSize: "12px", color: "var(--muted)" }}>
          {data === null ? "Memuat…" : `${menunggu} menunggu validasi Security · ${susulan} input susulan`}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Lembur ({lembur.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {lembur.length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Tidak ada lembur tercatat.</div> : lembur.map((v) => (
              <Kartu key={v.id} v={v} isi={<>{v.departemen} · {v.area || "-"} · {v.status === "lanjut" ? "masih di gedung" : "sudah check-out"}<br />divalidasi {v.divalidasi_oleh || "-"} {jam(v.waktu_validasi)}</>} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Tidak masuk hari ini ({tidakMasuk.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {tidakMasuk.length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Belum ada yang ditandai tidak masuk.</div> : tidakMasuk.map((v) => (
              <Kartu key={v.id} v={v} isi={<>{v.departemen} · <b style={{ color: "var(--ink-soft)" }}>{v.alasan || "-"}</b>{v.keterangan ? ` — ${v.keterangan}` : ""}<br />dicek {v.divalidasi_oleh || "-"} {jam(v.waktu_validasi)}</>} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
