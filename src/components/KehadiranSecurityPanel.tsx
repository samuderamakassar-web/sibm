"use client";

/**
 * Kehadiran Security per shift (§115) -- dibaca dari roster (security_monthly_schedules) + kehadiran_security
 * (check-in/out otomatis saat tukar jaga). Menampilkan shift yang relevan hari ini: Shift 2 kemarin (berakhir
 * 08:00 pagi ini), Shift 1 hari ini, Shift 2 hari ini.
 */

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { tanggalWITA, jamWITA } from "../lib/validasiKaryawan";
import { petugasDiRoster, rosterUntuk, idKehadiranSecurity, type KehadiranSecurity, type ShiftSecurity } from "../lib/kehadiranSecurity";

export default function KehadiranSecurityPanel() {
  const [hariIni] = useState(() => tanggalWITA(new Date()));
  const kemarin = tanggalWITA(new Date(new Date(`${hariIni}T12:00:00+08:00`).getTime() - 86400000));
  const [roster, setRoster] = useState<Record<string, Record<string, string>> | null>(null);
  const [catatan, setCatatan] = useState<Map<string, KehadiranSecurity>>(new Map());
  // §121 cadangan: dokumen serah terima (waktu scan QR) -- tetap tampil walau catatan kehadiran_security belum
  // terbentuk (tukar jaga sebelum §115 aktif, atau HP Security masih memakai versi aplikasi lama dari cache).
  const [sekarang] = useState(() => Date.now());
  const besok = tanggalWITA(new Date(new Date(`${hariIni}T12:00:00+08:00`).getTime() + 86400000));
  const [serahTerima, setSerahTerima] = useState<Map<string, { waktu: { toDate: () => Date } | null; tanpa?: boolean }>>(new Map());

  useEffect(() => {
    rosterUntuk([kemarin, hariIni]).then(setRoster).catch((e) => { console.error("[kehadiran security] roster:", e); setRoster({}); });
    const unsub = onSnapshot(query(collection(db, "kehadiran_security"), where("tanggal_shift", "in", [kemarin, hariIni])), (s) => {
      setCatatan(new Map(s.docs.map((d) => [d.id, { id: d.id, ...d.data() } as KehadiranSecurity])));
    }, (e) => console.error("[kehadiran security]", e));
    const unsub2 = onSnapshot(query(collection(db, "security_shift_handover"), where("tanggal_shift", "in", [kemarin, hariIni, besok])), (s) => {
      const m = new Map<string, { waktu: { toDate: () => Date } | null; tanpa?: boolean }>();
      s.docs.forEach((d) => { const x = d.data(); if (x.status === "selesai" && x.waktu_scan) m.set(`${x.tanggal_shift}|${x.shift}`, { waktu: x.waktu_scan, tanpa: !!x.tanpa_serah_terima }); });
      setSerahTerima(m);
    }, (e) => console.error("[kehadiran security] serah terima:", e));
    return () => { unsub(); unsub2(); };
  }, [hariIni, kemarin, besok]);
  /** Shift berikutnya: Shift 1 D -> Shift 2 D, Shift 2 D -> Shift 1 D+1 (serah terimanya = jam pulang). */
  const shiftBerikut = (tgl: string, sh: ShiftSecurity) => (sh === "Shift 1" ? `${tgl}|Shift 2` : `${tanggalWITA(new Date(new Date(`${tgl}T12:00:00+08:00`).getTime() + 86400000))}|Shift 1`);

  const shiftList: { tanggal: string; shift: ShiftSecurity; label: string }[] = [
    { tanggal: kemarin, shift: "Shift 2", label: "Shift 2 kemarin (20:00–08:00)" },
    { tanggal: hariIni, shift: "Shift 1", label: "Shift 1 hari ini (08:00–20:00)" },
    { tanggal: hariIni, shift: "Shift 2", label: "Shift 2 hari ini (20:00–08:00)" },
  ];
  const libur = roster ? Object.entries(roster[hariIni] || {}).filter(([, l]) => /off|izin|libur|cuti/i.test(String(l))) : [];

  return (
    <div style={{ marginTop: "18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Security — dari roster & tukar jaga</div>
        <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>Tidak perlu validasi kehadiran · check-in/out otomatis saat serah terima shift</span>
      </div>
      {roster === null ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Memuat roster…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
          {shiftList.map((s) => {
            const nama = Array.from(new Set([...petugasDiRoster(roster, s.tanggal, s.shift), ...Array.from(catatan.values()).filter((c) => c.tanggal_shift === s.tanggal && c.shift === s.shift).map((c) => c.nama)]));
            return (
              <div key={`${s.tanggal}-${s.shift}`} style={{ padding: "10px 12px", borderRadius: "14px", background: "var(--bg)" }}>
                <div style={{ fontSize: "12.5px", fontWeight: 800, color: "var(--ink)", marginBottom: "6px" }}>{s.label}</div>
                {nama.length === 0 ? <div style={{ fontSize: "12px", color: "var(--muted)" }}>Tidak ada di roster.</div> : nama.map((n) => {
                  const c = catatan.get(idKehadiranSecurity(s.tanggal, s.shift, n));
                  const stMasuk = serahTerima.get(`${s.tanggal}|${s.shift}`);
                  const stPulang = serahTerima.get(shiftBerikut(s.tanggal, s.shift));
                  const masuk = c?.check_in ? jamWITA(c.check_in.toDate()) : stMasuk?.waktu ? jamWITA(stMasuk.waktu.toDate()) : null;
                  const pulang = c?.check_out ? jamWITA(c.check_out.toDate()) : stPulang?.waktu ? jamWITA(stPulang.waktu.toDate()) : null;
                  return (
                    <div key={n} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12.5px", padding: "3px 0" }}>
                      <span style={{ color: "var(--ink)", fontWeight: 600 }}>{n}{c?.tanpa_serah_terima || stMasuk?.tanpa ? <span style={{ color: "var(--warn)", fontSize: "11px" }}> · tanpa QR</span> : null}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums", color: masuk ? "var(--ok)" : "var(--muted)", whiteSpace: "nowrap" }}>
                        {masuk ? `masuk ${masuk}` : new Date(`${s.tanggal}T${s.shift === "Shift 1" ? "08" : "20"}:00:00+08:00`).getTime() > sekarang ? `belum mulai (${s.shift === "Shift 1" ? "08:00" : "20:00"})` : "belum serah terima"}{pulang ? ` · pulang ${pulang}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {libur.length > 0 && <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--muted)" }}>Libur/izin hari ini: {libur.map(([n, l]) => `${n} (${l})`).join(", ")}</div>}
    </div>
  );
}
