"use client";

/**
 * §183 Monitor OB -> tab "Ronde Zona": laporan ronde pola zona per petugas per hari (pengganti log checklist lama).
 * Per orang: tugas hari itu (paket zona), ronde masuk vs minimal, jam, area dicentang, catatan & foto.
 */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { tanggalISOWITASekarang } from "../../lib/shift";
import { ringkasTugas } from "../../lib/rencanaZona";
import { fotoLaporan, KOLEKSI_LAPORAN_ZONA, rencanaUntuk, tambahHari, useUjiPolaZona, type LaporanZona } from "../../lib/ujiPolaZona";
import { WARNA_PERAN } from "./RencanaZonaKartu";

const sama = (a = "", b = "") => a.trim().toLowerCase() === b.trim().toLowerCase();
const jam = (l: LaporanZona) => l.waktu?.toDate().toLocaleTimeString("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" }) || "–";
const pendek = (a: string) => a.replace(/^Lantai\s*/i, "Lt ").replace(/\s{2,}/g, " ");

export default function RondeZonaPanel() {
  const hariIni = tanggalISOWITASekarang();
  const [tgl, setTgl] = useState(hariIni);
  const [laporan, setLaporan] = useState<LaporanZona[]>([]);
  const [dimuatTgl, setDimuatTgl] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const { config } = useUjiPolaZona();

  useEffect(() => onSnapshot(query(collection(db, KOLEKSI_LAPORAN_ZONA), where("tanggal", "==", tgl)), (s) => {
    setLaporan(s.docs.map((d) => ({ id: d.id, ...d.data() } as LaporanZona)).filter((l) => l.jenis === "ronde")
      .sort((a, b) => (a.waktu?.toMillis() || 0) - (b.waktu?.toMillis() || 0)));
    setDimuatTgl(tgl);
  }, (e) => { console.error("[monitor ronde zona]", e); setDimuatTgl(tgl); }), [tgl]);

  const r = rencanaUntuk(config, tgl, []);
  const minRonde = config?.min_ronde || 1;
  const orang = r ? [...r.orang.map((o) => ({ nama: o.nama, o })), ...r.tidakHadir.map((nama) => ({ nama, o: null }))] : [];
  // laporan dari orang di luar rencana (mis. koordinator membantu) tetap ditampilkan
  laporan.forEach((l) => { if (!orang.some((x) => sama(x.nama, l.nama))) orang.push({ nama: l.nama, o: null }); });
  const hadir = r?.orang.length || 0;
  const masuk = laporan.filter((l) => r?.orang.some((o) => sama(o.nama, l.nama))).length;
  const target = hadir * minRonde;

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>Ronde Zona · {new Date(`${tgl}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}</h2>
          <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Laporan ronde + foto dari Checklist Zona. Minimal {minRonde} ronde per orang per hari (dasar poin harian).</div>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} onClick={() => setTgl(tambahHari(tgl, -1))}>◀</button>
          <input type="date" className="sa-field" value={tgl} max={hariIni} onChange={(e) => setTgl(e.target.value || hariIni)} />
          <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} disabled={tgl >= hariIni} onClick={() => setTgl(tambahHari(tgl, 1))}>▶</button>
          {tgl !== hariIni && <button type="button" className="sa-btn is-dark" style={{ height: "34px" }} onClick={() => setTgl(hariIni)}>Hari ini</button>}
        </div>
      </div>

      {!r ? (
        <div style={{ padding: "16px", borderRadius: "14px", background: "var(--bg)", fontSize: "13px", color: "var(--muted)" }}>
          {laporan.length ? `${laporan.length} laporan ronde (hari tanpa jadwal zona).` : "Tidak ada jadwal zona di tanggal ini (akhir pekan / sebelum pola zona berlaku)."}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
            <div style={{ padding: "10px 14px", borderRadius: "14px", background: masuk >= target ? "var(--ok-50)" : "var(--warn-50)" }}>
              <div style={{ fontSize: "22px", fontWeight: 800 }}>{masuk}/{target}</div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>ronde masuk / target ({hadir} petugas hadir)</div>
            </div>
            {r.skenario !== "normal" && (
              <div style={{ padding: "10px 14px", borderRadius: "14px", background: "var(--warn-50)", fontSize: "12.5px", maxWidth: "460px" }}>
                <b>⚠️ {r.judul}</b><br />Tidak hadir: {r.tidakHadir.join(", ")} — tugas dibagi ulang otomatis.
              </div>
            )}
          </div>
          {dimuatTgl !== tgl ? <div style={{ fontSize: "13px", color: "var(--muted)" }}>Memuat…</div> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px" }}>
              {orang.map(({ nama, o }) => {
                const milik = laporan.filter((l) => sama(l.nama, nama));
                const absen = r.tidakHadir.some((n) => sama(n, nama));
                const warna = o ? WARNA_PERAN[o.peran] || "var(--ink)" : "var(--muted)";
                const cukup = milik.length >= minRonde;
                return (
                  <div key={nama} style={{ borderRadius: "16px", border: "1px solid var(--line)", borderTop: `5px solid ${warna}`, padding: "12px 14px", background: "var(--surface)", opacity: absen ? 0.7 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                      <div>
                        <div style={{ fontSize: "15px", fontWeight: 800 }}>{nama}</div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: warna }}>{absen ? "Sakit/izin — tidak dinilai" : o ? `Zona ${o.zona} · ${ringkasTugas(o)}` : "Di luar jadwal zona"}</div>
                      </div>
                      {!absen && (
                        <span style={{ alignSelf: "start", fontSize: "12px", fontWeight: 800, padding: "3px 9px", borderRadius: "999px", whiteSpace: "nowrap",
                          background: cukup ? "var(--ok-50)" : milik.length ? "var(--warn-50)" : "var(--red-50)", color: cukup ? "var(--ok)" : milik.length ? "var(--warn)" : "var(--red-600)" }}>
                          {milik.length}/{minRonde} ronde
                        </span>
                      )}
                    </div>
                    {milik.length === 0 && !absen && <div style={{ marginTop: "8px", fontSize: "12.5px", color: "var(--muted)" }}>Belum ada laporan ronde.</div>}
                    {milik.map((l, i) => (
                      <div key={l.id} style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed var(--line)" }}>
                        <div style={{ fontSize: "12.5px", fontWeight: 700 }}>Ronde {i + 1} · {jam(l)} · {(l.area || []).length} area</div>
                        {(l.area || []).length > 0 && <div style={{ fontSize: "12px", color: "var(--ink-soft)", marginTop: "2px" }}>{(l.area || []).map(pendek).join("; ")}</div>}
                        {l.catatan && <div style={{ fontSize: "12px", marginTop: "2px" }}>💬 {l.catatan}</div>}
                        <div style={{ display: "flex", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                          {fotoLaporan(l).map((u) => (
                            <button key={u} type="button" onClick={() => setFoto(u)} style={{ padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element -- foto Storage, static export */}
                              <img src={u} alt="Foto ronde" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "10px" }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {foto && (
        <div role="dialog" onClick={() => setFoto(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px", cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto Storage, static export */}
          <img src={foto} alt="Foto ronde" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "12px" }} />
        </div>
      )}
    </div>
  );
}
