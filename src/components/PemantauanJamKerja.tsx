"use client";

/**
 * Pemantauan Jam Kerja (§59) -- dashboard QHSE. Karyawan yang lembur > 4 jam (sejak 18:00) atau
 * > 12 jam di gedung, dicatat otomatis oleh scripts/validasi-karyawan.mjs ke `pemantauan_jam_kerja`
 * (sekaligus push + email ke QHSE). Sengaja TERPISAH dari SBO supaya statistik temuan bahaya
 * yang dilaporkan manusia tidak tercampur laporan otomatis.
 */

import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useToast } from "./ui/ToastProvider";
import { jamWITA, tanggalWITA } from "../lib/validasiKaryawan";

interface CatatanJamKerja {
  id: string;
  nama: string;
  departemen?: string;
  tanggal: string;
  waktu_masuk?: Timestamp | null;
  waktu_keluar?: Timestamp | null;
  pemicu?: string[];
  status: "berlangsung" | "selesai";
  total_jam_di_gedung?: number;
  total_jam_lembur?: number;
  ditinjau_oleh?: string;
}

const fmtJam = (j: number) => `${Math.floor(j)} j ${Math.round((j % 1) * 60)} m`;

export default function PemantauanJamKerja({ petugas }: { petugas: string }) {
  const showToast = useToast();
  const [data, setData] = useState<CatatanJamKerja[] | null>(null);
  const [sekarang, setSekarang] = useState(() => Date.now());

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "pemantauan_jam_kerja"), orderBy("dilaporkan_pada", "desc"), limit(50)),
      (snap) => setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CatatanJamKerja))),
      (err) => { console.error("[qhse] Gagal memuat pemantauan jam kerja:", err); setData([]); }
    );
    const t = setInterval(() => setSekarang(Date.now()), 60000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  const tandaiDitinjau = async (c: CatatanJamKerja) => {
    try {
      await updateDoc(doc(db, "pemantauan_jam_kerja", c.id), { ditinjau_oleh: petugas, ditinjau_pada: serverTimestamp() });
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan.", "error");
    }
  };

  const bulanIni = tanggalWITA(new Date(sekarang)).slice(0, 7);
  const kejadianBulanIni: Record<string, number> = {};
  (data || []).filter((c) => c.tanggal?.startsWith(bulanIni)).forEach((c) => { kejadianBulanIni[c.nama] = (kejadianBulanIni[c.nama] || 0) + 1; });
  const berulang = Object.entries(kejadianBulanIni).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);

  return (
    <section style={{ background: "var(--tile)", borderRadius: "24px", padding: "18px", margin: "14px 0" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .pjk-baris { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-radius: 16px; background: var(--bg); margin-bottom: 8px; }
        .pjk-info { flex: 1; min-width: 180px; }
        .pjk-nama { font-size: 14px; font-weight: 800; color: var(--ink); }
        .pjk-sub { font-size: 12px; color: var(--muted); margin-top: 2px; overflow-wrap: anywhere; }
        .pjk-pil { display: inline-block; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 8px; margin: 4px 4px 0 0; }
        .pjk-angka { font-size: 16px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; text-align: right; }
      `}} />
      <h2 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 800, color: "var(--ink)" }}>Pemantauan Jam Kerja</h2>
      <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
        Karyawan yang lembur lebih dari 4 jam (sejak 18:00) atau lebih dari 12 jam di gedung. Tercatat otomatis dari Buku Tamu.
      </p>
      {berulang.length > 0 && (
        <div style={{ padding: "10px 14px", borderRadius: "14px", background: "var(--red-50)", color: "var(--red-600)", fontSize: "12.5px", fontWeight: 700, marginBottom: "10px" }}>
          Berulang bulan ini: {berulang.map(([n, k]) => `${n} (${k}x)`).join(", ")}
        </div>
      )}
      {data === null ? (
        <div className="pjk-sub">Memuat...</div>
      ) : data.length === 0 ? (
        <div style={{ padding: "14px", borderRadius: "14px", border: "1px dashed var(--line)", color: "var(--muted)", fontSize: "13px", textAlign: "center" }}>Belum ada catatan jam kerja berlebih.</div>
      ) : data.slice(0, 15).map((c) => {
        const masuk = c.waktu_masuk?.toDate();
        const jamGedung = c.status === "selesai" ? c.total_jam_di_gedung || 0 : masuk ? (sekarang - masuk.getTime()) / 3600000 : 0;
        return (
          <div key={c.id} className="pjk-baris">
            <div className="pjk-info">
              <div className="pjk-nama">{c.nama}</div>
              <div className="pjk-sub">
                {c.departemen} · masuk {masuk ? `${tanggalWITA(masuk)} ${jamWITA(masuk)}` : "-"}
                {c.waktu_keluar ? ` · keluar ${jamWITA(c.waktu_keluar.toDate())}` : ""}
              </div>
              <div>
                <span className="pjk-pil" style={c.status === "berlangsung" ? { background: "var(--warn-50)", color: "var(--warn)" } : { background: "var(--hover)", color: "var(--muted)" }}>
                  {c.status === "berlangsung" ? "Masih di gedung" : "Selesai"}
                </span>
                {(c.pemicu || []).map((p) => <span key={p} className="pjk-pil" style={{ background: "var(--red-50)", color: "var(--red-600)" }}>{p}</span>)}
                {c.ditinjau_oleh && <span className="pjk-pil" style={{ background: "var(--ok-50)", color: "var(--ok)" }}>Ditinjau {c.ditinjau_oleh}</span>}
              </div>
            </div>
            <div>
              <div className="pjk-angka">{fmtJam(jamGedung)}</div>
              <div className="pjk-sub" style={{ textAlign: "right" }}>{c.status === "selesai" && typeof c.total_jam_lembur === "number" ? `lembur ${fmtJam(c.total_jam_lembur)}` : "di gedung"}</div>
            </div>
            {!c.ditinjau_oleh && (
              <button type="button" className="sa-btn is-soft" style={{ height: "34px", fontSize: "12px" }} onClick={() => tandaiDitinjau(c)}>Tandai ditinjau</button>
            )}
          </div>
        );
      })}
    </section>
  );
}
