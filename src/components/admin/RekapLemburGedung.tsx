"use client";

/**
 * Rekap Lembur Gedung (§112) -- siapa yang sering overtime di gedung.
 * Per nama: jumlah HARI lembur (tanggal unik) & rata-rata jam per hari; per PT; Top 5 tersering.
 * Sumber: ga_overtime_requests format gedung (bukan lembur tim), jam = durasi_tagih_jam (validasi Security,
 * dibulatkan ke atas) atau jam pengajuan. Lembur yang masih "Berlangsung" (belum check-out) dihitung harinya,
 * tapi tidak ikut rata-rata jam. Status Ditolak/Dibatalkan diabaikan.
 */

import { useState } from "react";
import * as XLSX from "xlsx";

export interface BarisLembur { nama: string; pt: string; tanggal: string; jam: number; status?: string }
interface Agregat { nama: string; pt: string; hari: number; totalJam: number; hariBerjam: number; terakhir: string }

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const fmtJam = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
const fmtTgl = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "-");
const rata = (a: Agregat) => (a.hariBerjam ? a.totalJam / a.hariBerjam : 0);

function agregasi(baris: BarisLembur[]): Agregat[] {
  const peta = new Map<string, { nama: string; pt: string; tgl: Set<string>; jamPerTgl: Map<string, number>; terakhir: string }>();
  for (const b of baris) {
    const kunci = b.nama.trim().toLowerCase();
    if (!kunci) continue;
    const x = peta.get(kunci) || { nama: b.nama.trim(), pt: b.pt || "-", tgl: new Set<string>(), jamPerTgl: new Map<string, number>(), terakhir: "" };
    x.tgl.add(b.tanggal);
    if (b.jam > 0) x.jamPerTgl.set(b.tanggal, (x.jamPerTgl.get(b.tanggal) || 0) + b.jam);
    if (b.tanggal > x.terakhir) { x.terakhir = b.tanggal; if (b.pt) x.pt = b.pt; }
    peta.set(kunci, x);
  }
  return Array.from(peta.values()).map((x) => ({
    nama: x.nama, pt: x.pt, hari: x.tgl.size, hariBerjam: x.jamPerTgl.size,
    totalJam: Array.from(x.jamPerTgl.values()).reduce((a, b) => a + b, 0), terakhir: x.terakhir,
  }));
}

export default function RekapLemburGedung({ baris }: { baris: BarisLembur[] }) {
  const sah = baris.filter((b) => b.tanggal && !/ditolak|batal/i.test(b.status || ""));
  const bulanTersedia = Array.from(new Set(sah.map((b) => b.tanggal.slice(0, 7)))).sort().reverse();
  const tahunIni = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()).slice(0, 4);
  const [periode, setPeriode] = useState<string>(() => bulanTersedia[0] || "SEMUA");
  const [cari, setCari] = useState("");
  const [urut, setUrut] = useState<"hari" | "jam" | "rata">("hari");

  const tigaBulan = bulanTersedia.slice(0, 3);
  const dalamPeriode = sah.filter((b) => periode === "SEMUA" ? true : periode === "3BLN" ? tigaBulan.includes(b.tanggal.slice(0, 7)) : periode === "TAHUN" ? b.tanggal.startsWith(tahunIni) : b.tanggal.startsWith(periode));
  const perNama = agregasi(dalamPeriode);
  const top5 = [...perNama].sort((a, b) => b.hari - a.hari || b.totalJam - a.totalJam).slice(0, 5);
  const perPt = Array.from(perNama.reduce((m, a) => {
    const x = m.get(a.pt) || { pt: a.pt, orang: 0, hari: 0, totalJam: 0, hariBerjam: 0 };
    x.orang++; x.hari += a.hari; x.totalJam += a.totalJam; x.hariBerjam += a.hariBerjam;
    return m.set(a.pt, x);
  }, new Map<string, { pt: string; orang: number; hari: number; totalJam: number; hariBerjam: number }>()).values()).sort((a, b) => b.hari - a.hari);
  const maksHariPt = Math.max(1, ...perPt.map((p) => p.hari));
  const daftar = perNama
    .filter((a) => !cari.trim() || `${a.nama} ${a.pt}`.toLowerCase().includes(cari.toLowerCase()))
    .sort((a, b) => (urut === "hari" ? b.hari - a.hari || b.totalJam - a.totalJam : urut === "jam" ? b.totalJam - a.totalJam : rata(b) - rata(a)));
  const totalHari = perNama.reduce((a, x) => a + x.hari, 0);
  const totalJam = perNama.reduce((a, x) => a + x.totalJam, 0);
  const totalHariBerjam = perNama.reduce((a, x) => a + x.hariBerjam, 0);
  const labelPeriode = periode === "SEMUA" ? "Semua data" : periode === "3BLN" ? "3 bulan terakhir" : periode === "TAHUN" ? `Tahun ${tahunIni}` : `${NAMA_BULAN[Number(periode.slice(5, 7)) - 1]} ${periode.slice(0, 4)}`;

  const ekspor = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Peringkat", "Nama", "PT", "Jumlah Hari", "Total Jam", "Rata-rata Jam/Hari"], ...top5.map((a, i) => [i + 1, a.nama, a.pt, a.hari, a.totalJam, Number(rata(a).toFixed(1))])]), "Top 5");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["PT", "Jumlah Orang", "Total Hari", "Total Jam", "Rata-rata Jam/Hari"], ...perPt.map((p) => [p.pt, p.orang, p.hari, p.totalJam, Number((p.hariBerjam ? p.totalJam / p.hariBerjam : 0).toFixed(1))])]), "Per PT");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Nama", "PT", "Jumlah Hari", "Total Jam", "Rata-rata Jam/Hari", "Terakhir Lembur"], ...daftar.map((a) => [a.nama, a.pt, a.hari, a.totalJam, Number(rata(a).toFixed(1)), fmtTgl(a.terakhir)])]), "Per Nama");
    XLSX.writeFile(wb, `Rekap_Lembur_Gedung_${labelPeriode.replace(/\s+/g, "_")}.xlsx`);
  };

  const th = { padding: "10px 12px", textAlign: "left" as const, fontSize: "11.5px", fontWeight: 800, color: "var(--ink-soft)", background: "var(--bg)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" as const };
  const td = { padding: "10px 12px", borderBottom: "1px solid var(--line)", fontSize: "13px" };
  const num = { ...td, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };
  const kartu = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "18px", padding: "18px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <select className="sa-field" value={periode} onChange={(e) => setPeriode(e.target.value)} aria-label="Periode rekap">
          {bulanTersedia.map((b) => <option key={b} value={b}>{NAMA_BULAN[Number(b.slice(5, 7)) - 1]} {b.slice(0, 4)}</option>)}
          <option value="3BLN">3 bulan terakhir</option>
          <option value="TAHUN">Tahun {tahunIni}</option>
          <option value="SEMUA">Semua data</option>
        </select>
        <div style={{ flex: 1 }} />
        <button type="button" className="sa-btn is-soft" onClick={ekspor} disabled={!perNama.length}>Export Excel</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
        {([
          ["Orang lembur", String(perNama.length), `${perPt.length} PT`],
          ["Total hari lembur", String(totalHari), "hari-orang"],
          ["Total jam", fmtJam(totalJam), "jam tagih"],
          ["Rata-rata", totalHariBerjam ? `${fmtJam(totalJam / totalHariBerjam)} jam` : "—", "per hari lembur"],
        ] as const).map(([l, v, s]) => (
          <div key={l} style={{ ...kartu, padding: "14px 16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>{l}</div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{v}</div>
            <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{s}</div>
          </div>
        ))}
      </div>

      {perNama.length === 0 ? (
        <div style={{ ...kartu, textAlign: "center", color: "var(--muted)" }}>Belum ada lembur gedung pada {labelPeriode.toLowerCase()}.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))", gap: "16px", alignItems: "start" }}>
            <div style={kartu}>
              <h3 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 800 }}>5 teratas paling sering lembur</h3>
              <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--muted)" }}>{labelPeriode} · diurutkan dari jumlah hari, lalu total jam</p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>#</th><th style={th}>Nama</th><th style={{ ...th, textAlign: "right" }}>Hari</th><th style={{ ...th, textAlign: "right" }}>Rata-rata</th><th style={{ ...th, textAlign: "right" }}>Total</th></tr></thead>
                  <tbody>
                    {top5.map((a, i) => (
                      <tr key={a.nama}>
                        <td style={{ ...td, fontWeight: 900, color: i === 0 ? "var(--red-600)" : i < 3 ? "var(--warn)" : "var(--muted)", width: "28px" }}>{i + 1}</td>
                        <td style={td}><div style={{ fontWeight: 700, color: "var(--ink)" }}>{a.nama}</div><div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{a.pt}</div></td>
                        <td style={{ ...num, fontWeight: 800 }}>{a.hari} hr</td>
                        <td style={{ ...num, fontWeight: 800, color: rata(a) >= 4 ? "var(--red-600)" : "var(--ink)" }}>{a.hariBerjam ? `${fmtJam(rata(a))} jam` : "—"}</td>
                        <td style={{ ...num, color: "var(--muted)" }}>{fmtJam(a.totalJam)} jam</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Rata-rata merah = ≥ 4 jam per hari (batas lembur harian PP 35/2021).</p>
            </div>

            <div style={kartu}>
              <h3 style={{ margin: "0 0 12px", fontSize: "16px", fontWeight: 800 }}>Rekap per PT</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {perPt.map((p) => (
                  <div key={p.pt}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
                      <span style={{ fontWeight: 700, color: "var(--ink)" }}>{p.pt}</span>
                      <span style={{ color: "var(--ink-soft)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}><b>{p.hari} hr</b> · {p.orang} org · {fmtJam(p.totalJam)} jam · rata {p.hariBerjam ? fmtJam(p.totalJam / p.hariBerjam) : "—"} jam</span>
                    </div>
                    <div style={{ height: "8px", borderRadius: "4px", background: "var(--line)", overflow: "hidden", marginTop: "4px" }}><div style={{ width: `${(p.hari / maksHariPt) * 100}%`, height: "100%", background: "var(--warn-solid)" }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={kartu}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>Rekap per nama <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 700 }}>{daftar.length} orang</span></h3>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <input className="sa-field" style={{ cursor: "text" }} placeholder="Cari nama / PT..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari nama" />
                <select className="sa-field" value={urut} onChange={(e) => setUrut(e.target.value as typeof urut)} aria-label="Urutkan">
                  <option value="hari">Urut: hari terbanyak</option>
                  <option value="jam">Urut: total jam</option>
                  <option value="rata">Urut: rata-rata jam</option>
                </select>
              </div>
            </div>
            <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "620px" }}>
                <thead><tr><th style={th}>Nama</th><th style={th}>PT</th><th style={{ ...th, textAlign: "right" }}>Jumlah hari</th><th style={{ ...th, textAlign: "right" }}>Total jam</th><th style={{ ...th, textAlign: "right" }}>Rata-rata / hari</th><th style={{ ...th, textAlign: "right" }}>Terakhir</th></tr></thead>
                <tbody>
                  {daftar.map((a) => (
                    <tr key={a.nama}>
                      <td style={{ ...td, fontWeight: 700, color: "var(--ink)" }}>{a.nama}</td>
                      <td style={{ ...td, color: "var(--ink-soft)" }}>{a.pt}</td>
                      <td style={{ ...num, fontWeight: 800 }}>{a.hari}</td>
                      <td style={num}>{fmtJam(a.totalJam)}</td>
                      <td style={{ ...num, fontWeight: 700, color: rata(a) >= 4 ? "var(--red-600)" : "var(--ink)" }}>{a.hariBerjam ? `${fmtJam(rata(a))} jam` : "—"}</td>
                      <td style={{ ...num, color: "var(--muted)" }}>{fmtTgl(a.terakhir)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Hari = tanggal lembur berbeda. Jam = jam tagih hasil validasi Security (dibulatkan ke atas) atau jam pengajuan. Lembur yang belum check-out dihitung harinya, tidak ikut rata-rata.</p>
          </div>
        </>
      )}
    </div>
  );
}
