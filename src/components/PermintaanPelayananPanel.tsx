"use client";

/** Panel Dashboard OB (§122): permintaan pelayanan masuk real-time -- Terima (waktu respon) lalu Selesai. */

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useToast } from "./ui/ToastProvider";
import { labelJenis, timJenis, type PermintaanPelayanan } from "../lib/pelayanan";

export default function PermintaanPelayananPanel({ nama, peran = "" }: { nama: string; peran?: string }) {
  const showToast = useToast();
  const [daftar, setDaftar] = useState<PermintaanPelayanan[]>([]);
  const [sekarang, setSekarang] = useState(() => Date.now());

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "permintaan_pelayanan"), where("status", "in", ["Baru", "Diproses"])), (s) => {
      setDaftar(s.docs.map((d) => ({ id: d.id, ...d.data() } as PermintaanPelayanan)).sort((a, b) => (a.waktu_minta?.toMillis() || 0) - (b.waktu_minta?.toMillis() || 0)));
    }, (e) => console.error("[pelayanan]", e));
    const t = setInterval(() => setSekarang(Date.now()), 30000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  const ubah = async (p: PermintaanPelayanan, status: "Diproses" | "Selesai") => {
    try {
      await updateDoc(doc(db, "permintaan_pelayanan", p.id), status === "Diproses"
        ? { status, waktu_terima: serverTimestamp(), diterima_oleh: nama }
        : { status, waktu_selesai: serverTimestamp(), ...(p.diterima_oleh ? {} : { diterima_oleh: nama, waktu_terima: serverTimestamp() }) });
    } catch (e) { console.error(e); showToast("Gagal memperbarui permintaan.", "error"); }
  };

  // §124 permintaan tim sendiri di atas (CS Cleaning -> cleaning dulu), lainnya tetap tampil untuk backup
  const timSaya = peran === "CS Cleaning" ? "CS" : peran === "OB Pelayanan" ? "OB" : "";
  const urut = timSaya ? [...daftar].sort((a, b) => Number(timJenis(b.jenis) === timSaya) - Number(timJenis(a.jenis) === timSaya)) : daftar;
  if (daftar.length === 0) return null;
  return (
    <div style={{ marginBottom: "24px", padding: "16px", borderRadius: "20px", border: "2px solid var(--info)", background: "var(--surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
        <b style={{ fontSize: "16px", color: "var(--ink)" }}>🔔 Permintaan pelayanan & cleaning ({daftar.length})</b>
        <span style={{ fontSize: "12px", color: "var(--muted)" }}>Terima segera — waktu respon tercatat</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {urut.map((p) => {
          const menit = p.waktu_minta ? Math.floor((sekarang - p.waktu_minta.toMillis()) / 60000) : 0;
          return (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "10px", alignItems: "center", padding: "10px 12px", borderRadius: "14px", background: p.status === "Baru" ? "var(--warn-50)" : "var(--info-50)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: "14px", color: "var(--ink)" }}><span style={{ fontSize: "10.5px", fontWeight: 800, padding: "1px 6px", borderRadius: "5px", marginRight: "6px", background: timJenis(p.jenis) === "CS" ? "var(--ok-50)" : "var(--info-50)", color: timJenis(p.jenis) === "CS" ? "var(--ok)" : "var(--info)" }}>{timJenis(p.jenis) === "CS" ? "CLEANING" : "OB"}</span>{labelJenis(p.jenis)}{p.jumlah && p.jumlah > 1 ? ` × ${p.jumlah}` : ""} · {p.lokasi}</div>
                <div style={{ fontSize: "12px", color: "var(--ink-soft)" }}>{p.nama_pemohon} · {p.departemen}{p.catatan ? ` — ${p.catatan}` : ""}</div>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: p.status === "Baru" && menit >= 10 ? "var(--red-600)" : "var(--muted)" }}>{p.status === "Baru" ? `Menunggu ${menit} menit` : `Diproses ${p.diterima_oleh || ""}`}</div>
              </div>
              {p.status === "Baru"
                ? <button type="button" className="sa-btn is-primary" onClick={() => ubah(p, "Diproses")}>Terima</button>
                : <button type="button" className="sa-btn is-soft" onClick={() => ubah(p, "Selesai")}>Selesai ✓</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
