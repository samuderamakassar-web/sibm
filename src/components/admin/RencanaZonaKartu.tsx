"use client";

/**
 * §182 Kartu rencana tugas pola zona per orang (tampilan ramah): warna per peran, tugas dikelompokkan per waktu,
 * area tampil sebagai chip pendek. Dipakai admin Pola Zona (kehadiran & pratinjau paket).
 */
import type { RencanaHari, RencanaOrang } from "../../lib/rencanaZona";

export const WARNA_PERAN: Record<string, string> = { Tenant: "#2563eb", Toilet: "#0d9488", "Area Lain": "#d97706" };
const pendek = (a: string) => a.replace(/^Lantai\s*/i, "Lt ").replace(/\s*[·.]\s+/, " · ").replace(/\s{2,}/g, " ");

function Chips({ judul, isi, warna }: { judul: string; isi: string[]; warna?: string }) {
  if (!isi.length) return null;
  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.3px", textTransform: "uppercase", color: warna || "var(--muted)" }}>{judul}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "3px" }}>
        {isi.map((a) => (
          <span key={a} style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "999px", background: "var(--bg)", border: "1px solid var(--line)", lineHeight: 1.5 }}>{pendek(a)}</span>
        ))}
      </div>
    </div>
  );
}

export function KartuOrang({ o, jamPagi, cepat, label }: { o: RencanaOrang; jamPagi: string; cepat?: boolean; label?: string }) {
  const warna = WARNA_PERAN[o.peran] || "var(--ink)";
  const areaHarian = o.area.filter((a) => !o.pagi.includes(a));
  return (
    <div style={{ borderRadius: "16px", background: "var(--surface)", border: "1px solid var(--line)", borderTop: `5px solid ${warna}`, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "start" }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 800 }}>{o.nama}</div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: warna }}>Zona {o.zona} · {o.tugas}</div>
        </div>
        {label && <span style={{ fontSize: "11px", fontWeight: 800, padding: "3px 8px", borderRadius: "999px", background: warna, color: "#fff", whiteSpace: "nowrap" }}>{label}</span>}
      </div>
      <Chips judul={`🌅 ${jamPagi}${cepat ? " (cara cepat)" : ""} · ruang tenant`} isi={o.pagi} />
      {o.pelayanan.length > 0 && (
        <div style={{ marginTop: "8px", padding: "6px 10px", borderRadius: "10px", background: "var(--info-50)", fontSize: "12.5px", fontWeight: 700, color: "var(--info)" }}>
          🛎️ Pelayanan {o.pelayanan.map(pendek).join(", ")}
        </div>
      )}
      <Chips judul="🧹 Area harian" isi={areaHarian} />
      <Chips judul="👀 Cukup dicek 1x" isi={o.cekSekali} warna="var(--warn)" />
      <Chips judul="📅 Mingguan (1x pekan ini)" isi={o.mingguan} />
      {o.cadangan && <div style={{ marginTop: "8px", fontSize: "12.5px", fontWeight: 700 }}>⏱️ Cadangan pelayanan {o.cadangan}</div>}
      {o.catatan.length > 0 && <ul style={{ margin: "8px 0 0", paddingLeft: "16px", fontSize: "12px", color: "var(--ink-soft)" }}>{o.catatan.map((c) => <li key={c}>{c}</li>)}</ul>}
    </div>
  );
}

export default function RencanaZonaKartu({ r, jamPagi, label }: { r: RencanaHari; jamPagi: string; label?: (o: RencanaOrang) => string | undefined }) {
  return (
    <>
      {r.skenario !== "normal" && (
        <div style={{ margin: "8px 0", padding: "10px 12px", borderRadius: "12px", background: "var(--warn-50)", border: "1px solid var(--warn)", fontSize: "13px" }}>
          <b>⚠️ {r.judul}</b> — tidak hadir: <b>{r.tidakHadir.join(", ")}</b>. Tugas sudah dibagi ulang otomatis ke yang hadir.
          {r.ditunda.length > 0 && <div style={{ color: "var(--muted)", marginTop: "2px" }}>Ditunda hari ini: {r.ditunda.map(pendek).join("; ")}</div>}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "10px", marginTop: "8px" }}>
        {r.orang.map((o) => <KartuOrang key={o.nama} o={o} jamPagi={jamPagi} cepat={r.cepat} label={label?.(o)} />)}
      </div>
    </>
  );
}
