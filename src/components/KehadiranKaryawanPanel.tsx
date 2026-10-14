"use client";

/**
 * Kehadiran & Lembur Karyawan (§67, §151) -- versi LENGKAP untuk hub Admin GA (login): foto validasi Security,
 * area lembur, alasan tidak masuk. Fungsi: siapa yang TIDAK HADIR dan siapa yang MASIH LEMBUR sampai malam.
 * §151 pilihan tanggal (bawaan hari ini); lembur yang tampil hanya yang masih di gedung atau pulang lewat 19:30
 * (BATAS_LEMBUR_DIHITUNG) -- yang pulang ≤ 19:30 cukup dihitung jumlahnya. Hari ini ikut menampilkan kartu kemarin
 * yang belum check-out (lembur lewat tengah malam / lupa check-out).
 * Portal publik hanya menampilkan nama & jumlah (Status Operasional di src/app/page.tsx) -- keputusan privasi user.
 */

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { jamWITA, lemburDihitung, tanggalWITA, type ValidasiKaryawan } from "../lib/validasiKaryawan";
import KehadiranSecurityPanel from "./KehadiranSecurityPanel";

const jam = (ts?: { toDate: () => Date } | null) => (ts ? jamWITA(ts.toDate()) : "-");
const geser = (iso: string, n: number) => tanggalWITA(new Date(new Date(`${iso}T12:00:00+08:00`).getTime() + n * 86400000));
type Kartu = ValidasiKaryawan & { waktu_keluar?: { toDate: () => Date } | null };

export default function KehadiranKaryawanPanel() {
  const [hariIni] = useState(() => tanggalWITA(new Date()));
  const [tgl, setTgl] = useState(hariIni);
  const sebelum = geser(tgl, -1);
  const [data, setData] = useState<Kartu[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setData(null), 0);
    const unsub = onSnapshot(
      query(collection(db, "validasi_karyawan"), where("tanggal", "in", [sebelum, tgl])),
      (snap) => setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Kartu))),
      (err) => { console.error("[admin] Gagal memuat kehadiran:", err); setData([]); }
    );
    return () => { clearTimeout(t); unsub(); };
  }, [tgl, sebelum]);

  const semua = data || [];
  const lewat1930 = (v: Kartu) => v.dihitung !== false && (!v.waktu_keluar || lemburDihitung(v.tanggal, v.waktu_keluar.toDate()));
  const lemburTgl = semua.filter((v) => v.jenis === "lembur" && v.tanggal === tgl && (v.status === "lanjut" || (v.status === "selesai" && v.overtime_id)));
  const pulangAwal = lemburTgl.filter((v) => v.status === "selesai" && !lewat1930(v));
  // hari ini: kartu kemarin yang belum check-out ikut tampil
  const lemburMentah = [...lemburTgl.filter((v) => v.status === "lanjut" || lewat1930(v)),
    ...(tgl === hariIni ? semua.filter((v) => v.jenis === "lembur" && v.tanggal === sebelum && v.status === "lanjut") : [])];
  const perOrang = new Map<string, Kartu>();
  const waktuV = (x: Kartu) => (x.waktu_validasi as { toMillis?: () => number } | null | undefined)?.toMillis?.() || 0;
  lemburMentah.forEach((v) => {
    const k = `${v.tanggal}|${v.nama.trim().toLowerCase()}`;
    const lama = perOrang.get(k);
    if (!lama || (lama.status === "selesai" && v.status === "lanjut") || (lama.status === v.status && waktuV(v) > waktuV(lama))) perOrang.set(k, v);
  });
  const lembur = Array.from(perOrang.values()).sort((a, b) => Number(b.status === "lanjut") - Number(a.status === "lanjut") || b.tanggal.localeCompare(a.tanggal) || a.nama.localeCompare(b.nama));
  const tidakMasuk = semua.filter((v) => v.jenis === "belum_input" && v.tanggal === tgl && v.status === "tidak_masuk");
  const menunggu = semua.filter((v) => v.status === "menunggu" && v.tanggal === tgl).length;
  const susulan = semua.filter((v) => v.jenis === "belum_input" && v.tanggal === tgl && v.status === "diinput_susulan").length;

  const Kotak = ({ v, isi }: { v: Kartu; isi: React.ReactNode }) => (
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
  const judulKecil = { fontSize: "12px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: "8px" };
  const labelTgl = tgl === hariIni ? "hari ini" : new Date(`${tgl}T12:00:00+08:00`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Makassar" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "var(--ink)" }}>Kehadiran & lembur karyawan</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>{data === null ? "Memuat…" : `${menunggu} menunggu validasi · ${susulan} input susulan`}</span>
          {/* §151 pilih hari */}
          <button type="button" className="sa-btn is-soft" style={{ height: "32px", padding: "0 10px" }} onClick={() => setTgl(geser(tgl, -1))} aria-label="Hari sebelumnya">‹</button>
          <input type="date" className="sa-field" value={tgl} max={hariIni} onChange={(e) => e.target.value && setTgl(e.target.value)} aria-label="Tanggal" style={{ height: "32px" }} />
          <button type="button" className="sa-btn is-soft" style={{ height: "32px", padding: "0 10px" }} onClick={() => setTgl(geser(tgl, 1))} disabled={tgl >= hariIni} aria-label="Hari berikutnya">›</button>
          {tgl !== hariIni && <button type="button" className="sa-btn is-soft" style={{ height: "32px" }} onClick={() => setTgl(hariIni)}>Hari ini</button>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: lembur.length > 0 && tidakMasuk.length > 0 ? "repeat(auto-fit, minmax(300px, 1fr))" : "minmax(0, 1fr)", gap: "16px" }}>
        <div>
          <div style={judulKecil}>Lembur {labelTgl} ({lembur.length}){pulangAwal.length > 0 && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600 }}> · {pulangAwal.length} pulang ≤ 19:30, tidak dihitung</span>}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "6px" }}>
            {lembur.length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Tidak ada yang lembur lewat 19:30.</div> : lembur.map((v) => (
              <Kotak key={v.id} v={v} isi={<>{v.tanggal !== tgl && <b style={{ color: "var(--warn)" }}>Kemarin · </b>}{v.departemen} · {v.area || "-"} · {v.status === "lanjut"
                ? <b style={{ color: "var(--ok)" }}>{v.tanggal !== tgl ? "belum check-out sejak kemarin" : "masih di gedung"}</b>
                : `pulang ${jam(v.waktu_keluar)}`}<br />divalidasi {v.divalidasi_oleh || "-"} {jam(v.waktu_validasi)}</>} />
            ))}
          </div>
        </div>
        <div>
          <div style={judulKecil}>Tidak masuk {labelTgl} ({tidakMasuk.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "6px" }}>
            {tidakMasuk.length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Belum ada yang ditandai tidak masuk.</div> : tidakMasuk.map((v) => (
              <Kotak key={v.id} v={v} isi={<>{v.departemen} · <b style={{ color: "var(--ink-soft)" }}>{v.alasan || "-"}</b>{v.keterangan ? ` — ${v.keterangan}` : ""}<br />dicek {v.divalidasi_oleh || "-"} {jam(v.waktu_validasi)}</>} />
            ))}
          </div>
        </div>
      </div>
      {tgl === hariIni && <KehadiranSecurityPanel />}
    </div>
  );
}
