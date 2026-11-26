"use client";

/**
 * §186 Dashboard staf OB & CS: tugas pola zona SAYA hari ini (paket, pagi, pelayanan, area, mingguan) +
 * progres ronde hari ini + poin bulan ini. Poin < AMBANG -> peringatan agar rajin upload ronde & foto.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { tanggalISOWITASekarang } from "@/lib/shift";
import { KOLEKSI_LAPORAN_ZONA, rencanaUntuk, type UjiPolaZona } from "@/lib/ujiPolaZona";
import { KartuOrang } from "./admin/RencanaZonaKartu";

const AMBANG_POIN_RENDAH = 85; // sama dengan scripts/fcm-reminder.mjs
const sama = (a = "", b = "") => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function TugasZonaSayaPanel({ nama, config }: { nama: string; config: UjiPolaZona | null }) {
  const router = useRouter();
  const hariIni = tanggalISOWITASekarang();
  const [ronde, setRonde] = useState<number | null>(null);
  const [poin, setPoin] = useState<number | null>(null);

  useEffect(() => onSnapshot(query(collection(db, KOLEKSI_LAPORAN_ZONA), where("tanggal", "==", hariIni)),
    (s) => setRonde(s.docs.filter((d) => d.data().jenis === "ronde" && sama(String(d.data().nama || ""), nama)).length),
    () => setRonde(null)), [hariIni, nama]);
  useEffect(() => onSnapshot(doc(db, "staff_points_bulanan", `${hariIni.slice(0, 7)}_${nama.trim().replace(/\//g, "-")}`),
    (s) => setPoin(s.exists() ? Number(s.data().poin) : 100), () => setPoin(null)), [hariIni, nama]);

  const r = rencanaUntuk(config, hariIni, []);
  if (!r || !config) return null;
  const saya = r.orang.find((o) => sama(o.nama, nama));
  const absen = r.tidakHadir.some((n) => sama(n, nama));
  const min = config.min_ronde;
  const n = ronde ?? 0;
  const rendah = poin !== null && poin < AMBANG_POIN_RENDAH;

  return (
    <div style={{ marginBottom: "16px", display: "grid", gap: "10px" }}>
      <div style={{ padding: "14px 16px", borderRadius: "16px", border: `1px solid ${rendah ? "var(--red-600)" : "var(--line)"}`, background: rendah ? "var(--red-50)" : "var(--surface)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 800 }}>🎯 Misi hari ini</div>
            <div style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
              {absen ? "Kamu ditandai sakit/izin hari ini — tidak dinilai. Semoga lekas pulih." : `Ronde ${n}/${min} ${n >= min ? (n > min ? "— mantap, melebihi target (+2 poin)" : "— target tercapai (+1 poin), tambah lagi untuk +2") : `— kurang ${min - n} lagi. Tidak lapor sama sekali = −10 poin.`}`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: rendah ? "var(--red-600)" : "var(--ok)" }}>{poin ?? "…"}</div>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>poin bulan ini</div>
          </div>
        </div>
        {!absen && (
          <div style={{ height: 8, borderRadius: 4, background: "var(--line)", overflow: "hidden", marginTop: "8px" }}>
            <div style={{ width: `${Math.min(100, (n / Math.max(1, min)) * 100)}%`, height: "100%", background: n >= min ? "var(--ok)" : "var(--warn)" }} />
          </div>
        )}
        {rendah && <div style={{ marginTop: "8px", fontSize: "12.5px", fontWeight: 700, color: "var(--red-600)" }}>⚠️ Poin kamu rendah. Rajin upload ronde + foto setiap selesai keliling supaya poin naik lagi.</div>}
        {!absen && n < min && (
          <button type="button" className="sa-btn is-primary" style={{ marginTop: "10px" }} onClick={() => router.push("/dashboard/ob/zona")}>Lapor ronde sekarang</button>
        )}
      </div>
      {saya && <KartuOrang o={saya} jamPagi={config.jam_pagi} cepat={r.cepat} label={r.skenario !== "normal" ? "dibagi ulang" : undefined} />}
      {saya && r.skenario !== "normal" && <div style={{ fontSize: "12px", color: "var(--warn)" }}>⚠️ {r.judul} — tidak hadir: {r.tidakHadir.join(", ")}. Tugas di atas sudah termasuk bagian rekan.</div>}
    </div>
  );
}
