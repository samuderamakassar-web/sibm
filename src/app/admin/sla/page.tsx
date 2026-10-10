"use client";

/**
 * SLA Personel (§118) -- pengukuran otomatis per orang per bulan dari data aplikasi.
 * Lihat src/lib/sla.ts untuk definisi indikator & target bawaan. Target bisa diubah (settings/sla_target).
 */

import { useEffect, useState } from "react";
import { collection, doc, documentId, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import Modal from "../../../components/ui/Modal";
import { BATAS_LEMBUR_MINGGU, INDIKATOR_SLA, LEMBUR_PER_SHIFT_12_JAM, PERAN_SLA, hariKerjaAntara, persen, seninDari, type PeranSla } from "../../../lib/sla";

type Nilai = { capai: number; total: number };
type Hasil = Record<string, Record<string, Nilai>>; // nama -> indikator -> nilai
interface Orang { nama: string; peran: PeranSla }

const tz = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const norm = (s?: string) => (s || "").trim().toLowerCase();

async function hitung(bulan: string, hariIni: string): Promise<{ orang: Orang[]; hasil: Hasil; catatan: string[] }> {
  const [y, m] = bulan.split("-").map(Number);
  const akhirBulan = `${bulan}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const batas = hariIni < akhirBulan ? hariIni : akhirBulan; // hanya sampai hari ini
  const tsAwal = Timestamp.fromDate(new Date(`${bulan}-01T00:00:00+08:00`));
  const tsAkhir = Timestamp.fromDate(new Date(new Date(`${akhirBulan}T00:00:00+08:00`).getTime() + 86400000));
  const hasil: Hasil = {};
  const catatan: string[] = [];
  const tambah = (nama: string, key: string, capai: number, total: number) => {
    const n = nama.trim(); if (!n || total <= 0) return;
    hasil[n] ??= {}; const x = (hasil[n][key] ??= { capai: 0, total: 0 }); x.capai += capai; x.total += total;
  };

  const users = (await getDocs(collection(db, "users_master"))).docs.map((d) => d.data() as { nama?: string; departemen?: string; role?: string });
  const orang: Orang[] = users.filter((u) => u.nama && PERAN_SLA.includes(u.departemen as PeranSla) && !/magang/i.test(u.role || "")).map((u) => ({ nama: String(u.nama).trim(), peran: u.departemen as PeranSla }));
  const daftar = (p: PeranSla) => orang.filter((o) => o.peran === p).map((o) => o.nama);
  const minggu = (dari: string, sampai: string) => { const s = new Set<string>(); for (let d = new Date(`${dari}T12:00:00Z`); d.toISOString().slice(0, 10) <= sampai; d.setUTCDate(d.getUTCDate() + 1)) s.add(seninDari(d.toISOString().slice(0, 10))); return s; };

  // ---------- OB & CS ----------
  const [plots, cek, insp, alat] = await Promise.all([
    getDocs(query(collection(db, "daily_plots"), where(documentId(), ">=", `${bulan}-01`), where(documentId(), "<=", batas))),
    getDocs(query(collection(db, "ob_checklists"), where("tanggal", ">=", `${bulan}-01`), where("tanggal", "<=", batas))),
    getDocs(query(collection(db, "inspeksi_fasilitas"), where("waktu_selesai", ">=", tsAwal), where("waktu_selesai", "<", tsAkhir))),
    getDocs(collection(db, "aset_alat")),
  ]);
  const sesiTerisi = new Set(cek.docs.map((d) => { const x = d.data(); return `${norm(x.pic_bertugas)}|${x.tanggal}|${x.area}|${x.sesi}`; }));
  const mingguTugas: Record<string, Set<string>> = {};
  plots.docs.forEach((d) => {
    const tgl = d.id; const hari = new Date(`${tgl}T12:00:00Z`).getUTCDay(); if (hari === 0 || hari === 6) return;
    Object.entries((d.data().plot_lantai || {}) as Record<string, string>).forEach(([area, nama]) => {
      if (!nama || nama === "Semua / All" || nama === "-") return;
      const sudah = ["Pagi", "Siang", "Sore"].filter((s) => sesiTerisi.has(`${norm(nama)}|${tgl}|${area}|${s}`)).length;
      tambah(nama, "ob_checklist", sudah, tgl === hariIni ? sudah : 3); // hari ini: sesi yang belum lewat tidak dihitung kurang
      (mingguTugas[nama.trim()] ??= new Set()).add(seninDari(tgl));
    });
  });
  const mingguInspeksi: Record<string, Set<string>> = {};
  insp.docs.forEach((d) => { const x = d.data(); if (x.waktu_selesai) (mingguInspeksi[norm(x.pic_bertugas)] ??= new Set()).add(seninDari(tz.format(x.waktu_selesai.toDate()))); });
  Object.entries(mingguTugas).forEach(([nama, set]) => {
    const tugas = Array.from(set).filter((s) => s !== seninDari(hariIni) || new Date(`${hariIni}T12:00:00Z`).getUTCDay() === 5); // minggu berjalan dihitung mulai Jumat
    tambah(nama, "ob_inspeksi", tugas.filter((s) => mingguInspeksi[norm(nama)]?.has(s)).length, tugas.length);
  });
  alat.docs.forEach((d) => { const x = d.data(); if (x.status === "Afkir" || !x.pemegang || x.pemegang === "Gudang OB") return; tambah(x.pemegang, "ob_alat", x.status === "Hilang" ? 0 : 1, 1); });
  if (!plots.size) catatan.push("Belum ada plotting OB pada bulan ini — indikator checklist & inspeksi OB kosong.");

  // ---------- Security ----------
  const [roster, patroli, handover] = await Promise.all([
    getDoc(doc(db, "security_monthly_schedules", bulan)),
    getDocs(query(collection(db, "security_patrols"), where("tanggal_shift", ">=", `${bulan}-01`), where("tanggal_shift", "<=", batas))),
    getDocs(query(collection(db, "security_shift_handover"), where("tanggal_shift", ">=", `${bulan}-01`), where("tanggal_shift", "<=", batas))),
  ]);
  const dataHari = ((roster.exists() && roster.data().data_hari) || {}) as Record<string, Record<string, string>>;
  const sesiPatroli: Record<string, Set<string>> = {};
  patroli.docs.forEach((d) => { const x = d.data(); if (x.sesi) (sesiPatroli[`${norm(x.petugas)}|${x.tanggal_shift}|${x.shift}`] ??= new Set()).add(x.sesi); });
  const shiftPerMinggu: Record<string, Record<string, number>> = {};
  Object.entries(dataHari).forEach(([tgl, perNama]) => {
    if (tgl > batas) return;
    Object.entries(perNama || {}).forEach(([nama, label]) => {
      const shift = String(label).includes("Shift 1") ? "Shift 1" : String(label).includes("Shift 2") ? "Shift 2" : null;
      if (!shift) return;
      if (tgl < hariIni) tambah(nama, "sec_patroli", (sesiPatroli[`${norm(nama)}|${tgl}|${shift}`]?.size || 0) >= 2 ? 1 : 0, 1);
      ((shiftPerMinggu[nama] ??= {})[seninDari(tgl)] = (shiftPerMinggu[nama]?.[seninDari(tgl)] || 0) + 1);
    });
  });
  Object.entries(shiftPerMinggu).forEach(([nama, perMinggu]) => {
    Object.values(perMinggu).forEach((n) => tambah(nama, "sec_lembur", n * LEMBUR_PER_SHIFT_12_JAM <= BATAS_LEMBUR_MINGGU ? 1 : 0, 1));
  });
  handover.docs.forEach((d) => { const x = d.data(); if (x.status === "selesai" && x.petugas_masuk && !x.tanpa_serah_terima) tambah(x.petugas_masuk, "sec_tukar", x.terlambat ? 0 : 1, 1); });
  if (!Object.keys(dataHari).length) catatan.push("Roster Security bulan ini belum ada — indikator patroli & lembur Security kosong.");

  // ---------- Driver ----------
  const [inspKend, kendaraan] = await Promise.all([
    getDocs(query(collection(db, "kendaraan_inspeksi_logs"), where("tanggal", ">=", `${bulan}-01`), where("tanggal", "<=", batas))),
    getDocs(collection(db, "master_kendaraan")),
  ]);
  const mingguDrv: Record<string, Set<string>> = {};
  inspKend.docs.forEach((d) => { const x = d.data(); if (x.driver) (mingguDrv[norm(x.driver)] ??= new Set()).add(seninDari(x.tanggal)); });
  const mingguBulan = Array.from(minggu(`${bulan}-01`, batas)).filter((s) => s !== seninDari(hariIni) || new Date(`${hariIni}T12:00:00Z`).getUTCDay() === 5);
  const armada = kendaraan.docs.map((d) => d.data()).filter((k) => k.dikelola_driver);
  const tepatServis = armada.filter((k) => !k.tanggal_servis_berikutnya || k.tanggal_servis_berikutnya >= hariIni).length;
  daftar("Driver").forEach((nama) => {
    tambah(nama, "drv_inspeksi", mingguBulan.filter((s) => mingguDrv[norm(nama)]?.has(s)).length, mingguBulan.length);
    tambah(nama, "drv_servis", tepatServis, armada.length);
  });

  // ---------- QHSE (tim) ----------
  const sbo = await getDocs(query(collection(db, "qhse_sbo_reports"), where("waktu_lapor", ">=", tsAwal), where("waktu_lapor", "<", tsAkhir)));
  let respon = 0, tutup = 0, totalSbo = 0;
  sbo.docs.forEach((d) => {
    const x = d.data(); if (!x.waktu_lapor) return; totalSbo++;
    const lapor = x.waktu_lapor.toDate().getTime();
    if (x.waktu_tanggap && x.waktu_tanggap.toDate().getTime() - lapor <= 86400000) respon++;
    if (x.status_temuan === "Close" && x.tanggal_closed && new Date(`${x.tanggal_closed}T23:59:59+08:00`).getTime() - lapor <= 7 * 86400000) tutup++;
  });
  daftar("QHSE").forEach((nama) => { tambah(nama, "qhse_respon", respon, totalSbo); tambah(nama, "qhse_tutup", tutup, totalSbo); });

  // ---------- Admin GA (tim) ----------
  const [tiket, temuan] = await Promise.all([
    getDocs(query(collection(db, "helpdesk_tickets"), where("waktu_lapor", ">=", tsAwal), where("waktu_lapor", "<", tsAkhir))),
    getDocs(query(collection(db, "temuan_aset"), where("waktu_lapor", ">=", tsAwal), where("waktu_lapor", "<", tsAkhir))),
  ]);
  let hdOk = 0, hdTot = 0;
  tiket.docs.forEach((d) => {
    const x = d.data(); if (!x.waktu_lapor || ["Dihapus", "Dipindahkan", "Tidak Dijalankan"].includes(x.status)) return;
    const lapor = x.waktu_lapor.toDate();
    if (x.status === "Selesai" && x.waktu_selesai) { hdTot++; if (hariKerjaAntara(lapor, x.waktu_selesai.toDate()) <= 3) hdOk++; }
    else if (hariKerjaAntara(lapor, new Date()) > 3) hdTot++; // belum selesai & sudah lewat batas = gagal
  });
  let tmOk = 0, tmTot = 0;
  temuan.docs.forEach((d) => {
    const x = d.data(); if (!x.waktu_lapor || x.status === "Ditolak" || x.dari_helpdesk_id) return;
    const lapor = x.waktu_lapor.toDate().getTime();
    if (x.status === "Selesai" && x.waktu_selesai) { tmTot++; if (x.waktu_selesai.toDate().getTime() - lapor <= 7 * 86400000) tmOk++; }
    else if (Date.now() - lapor > 7 * 86400000) tmTot++;
  });
  daftar("Admin GA").forEach((nama) => { tambah(nama, "ga_helpdesk", hdOk, hdTot); tambah(nama, "ga_temuan", tmOk, tmTot); });

  // nama di data yang tidak punya akun (mis. roster) tetap ikut, perannya ditebak dari indikator
  Object.keys(hasil).forEach((nama) => {
    if (orang.some((o) => norm(o.nama) === norm(nama))) return;
    const k = Object.keys(hasil[nama])[0];
    const peran = INDIKATOR_SLA.find((i) => i.key === k)?.peran;
    if (peran) orang.push({ nama, peran });
  });
  return { orang, hasil, catatan };
}

export default function SlaPage() {
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const hariIni = tz.format(new Date());
  const [bulan, setBulan] = useState(hariIni.slice(0, 7));
  const [peran, setPeran] = useState<PeranSla>("OB & CS");
  const [data, setData] = useState<{ orang: Orang[]; hasil: Hasil; catatan: string[] } | null>(null);
  const [target, setTarget] = useState<Record<string, number>>({});
  const [editTarget, setEditTarget] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!isReady) return;
    return onSnapshot(doc(db, "settings", "sla_target"), (s) => setTarget((s.data()?.target as Record<string, number>) || {}));
  }, [isReady]);
  useEffect(() => {
    if (!isReady) return;
    let batal = false;
    hitung(bulan, hariIni).then((h) => { if (!batal) setData(h); }).catch((e) => { console.error("[sla]", e); if (!batal) setData({ orang: [], hasil: {}, catatan: ["Gagal memuat data SLA."] }); });
    return () => { batal = true; setData(null); };
  }, [isReady, bulan, hariIni]);

  if (!isReady) return null;
  const tgt = (key: string) => target[key] ?? INDIKATOR_SLA.find((i) => i.key === key)!.target;
  const indikator = INDIKATOR_SLA.filter((i) => i.peran === peran);
  const orangPeran = (data?.orang || []).filter((o) => o.peran === peran).sort((a, b) => a.nama.localeCompare(b.nama));
  const nilai = (nama: string, key: string) => { const v = data?.hasil[nama]?.[key]; return v ? persen(v.capai, v.total) : null; };
  const skor = (nama: string) => {
    const ada = indikator.map((i) => ({ i, p: nilai(nama, i.key) })).filter((x) => x.p !== null);
    return { tercapai: ada.filter((x) => x.p! >= tgt(x.i.key)).length, dinilai: ada.length };
  };
  const bulanOpsi = Array.from({ length: 6 }, (_, k) => { const d = new Date(Number(hariIni.slice(0, 4)), Number(hariIni.slice(5, 7)) - 1 - k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });

  const simpanTarget = async () => {
    if (!editTarget) return;
    const t: Record<string, number> = {};
    for (const i of INDIKATOR_SLA) { const n = Number(editTarget[i.key]); if (Number.isFinite(n) && n > 0 && n <= 100) t[i.key] = n; }
    try {
      await setDoc(doc(db, "settings", "sla_target"), { target: t, diperbarui_oleh: session?.nama || "-", diperbarui_pada: serverTimestamp() });
      setEditTarget(null); showToast("Target SLA tersimpan.", "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan target.", "error"); }
  };
  const ekspor = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    for (const p of PERAN_SLA) {
      const ind = INDIKATOR_SLA.filter((i) => i.peran === p);
      const rows = data.orang.filter((o) => o.peran === p).map((o) => [o.nama, ...ind.map((i) => { const v = data.hasil[o.nama]?.[i.key]; return v ? `${persen(v.capai, v.total)}% (${v.capai}/${v.total})` : "-"; })]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Nama", ...ind.map((i) => `${i.label} (target ${tgt(i.key)}%)`)], ...rows]), p.replace(/[^A-Za-z ]/g, "").slice(0, 28) || "Peran");
    }
    XLSX.writeFile(wb, `SLA_Personel_${bulan}.xlsx`);
  };

  return (
    <AdminShell title="SLA Personel" subtitle="Pengukuran otomatis kinerja per orang dari data aplikasi — tanpa input tambahan" userName={session?.nama || "Admin"}
      actions={<div style={{ display: "flex", gap: "6px" }}>
        <select className="sa-field" value={bulan} onChange={(e) => setBulan(e.target.value)} aria-label="Bulan">{bulanOpsi.map((b) => <option key={b} value={b}>{NAMA_BULAN[Number(b.slice(5, 7)) - 1]} {b.slice(0, 4)}</option>)}</select>
        <button type="button" className="sa-btn is-soft" onClick={() => setEditTarget(Object.fromEntries(INDIKATOR_SLA.map((i) => [i.key, String(tgt(i.key))])))}>Atur target</button>
        <button type="button" className="sa-btn is-soft" onClick={ekspor} disabled={!data}>Export</button>
      </div>}>
      <div className="sa-tabs" role="tablist" style={{ width: "fit-content", maxWidth: "100%", marginBottom: "14px", overflowX: "auto" }}>
        {PERAN_SLA.map((p) => <button key={p} type="button" role="tab" aria-selected={peran === p} className={`sa-tab${peran === p ? " is-active" : ""}`} onClick={() => setPeran(p)}>{p}</button>)}
      </div>

      {data === null ? <Tile><div style={{ color: "var(--muted)", textAlign: "center", padding: "20px" }}>Menghitung SLA {NAMA_BULAN[Number(bulan.slice(5, 7)) - 1]}…</div></Tile> : (
        <>
          {data.catatan.length > 0 && <Tile style={{ marginBottom: "12px" }}>{data.catatan.map((c) => <div key={c} style={{ fontSize: "12.5px", color: "var(--warn)", fontWeight: 700 }}>⚠ {c}</div>)}</Tile>}
          <Tile>
            {orangPeran.length === 0 ? <div style={{ color: "var(--muted)", textAlign: "center", padding: "20px" }}>Belum ada akun {peran} / data pada bulan ini.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: `${260 + indikator.length * 150}px` }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "10px", fontSize: "12px", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)" }}>Nama</th>
                      {indikator.map((i) => (
                        <th key={i.key} title={i.keterangan} style={{ textAlign: "center", padding: "10px", fontSize: "11.5px", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)" }}>
                          {i.label}{i.tim ? " · tim" : ""}<div style={{ fontWeight: 500, color: "var(--muted)" }}>target {tgt(i.key)}%</div>
                        </th>
                      ))}
                      <th style={{ textAlign: "center", padding: "10px", fontSize: "12px", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)" }}>Tercapai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orangPeran.map((o) => {
                      const s = skor(o.nama);
                      return (
                        <tr key={o.nama}>
                          <td style={{ padding: "10px", fontWeight: 700, borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{o.nama}</td>
                          {indikator.map((i) => {
                            const p = nilai(o.nama, i.key); const v = data.hasil[o.nama]?.[i.key];
                            const w = p === null ? "var(--muted)" : p >= tgt(i.key) ? "var(--ok)" : p >= tgt(i.key) - 10 ? "var(--warn)" : "var(--red-600)";
                            return (
                              <td key={i.key} style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid var(--line)" }}>
                                <b style={{ fontSize: "15px", color: w, fontVariantNumeric: "tabular-nums" }}>{p === null ? "—" : `${p}%`}</b>
                                {v && <div style={{ fontSize: "11px", color: "var(--muted)" }}>{v.capai}/{v.total}</div>}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid var(--line)", fontWeight: 800, color: s.dinilai && s.tercapai === s.dinilai ? "var(--ok)" : "var(--warn)" }}>{s.dinilai ? `${s.tercapai}/${s.dinilai}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Tile>
          <Tile style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
              {indikator.map((i) => <div key={i.key}><b style={{ color: "var(--ink-soft)" }}>{i.label}</b> — {i.keterangan}{i.tim ? " (nilai tim, sama untuk semua anggota)" : ""}.</div>)}
              <div>Hijau = capai target · oranye = kurang ≤ 10 poin · merah = kurang &gt; 10 poin. Bulan berjalan dihitung sampai hari ini. Batas lembur legal: {LEMBUR_PER_SHIFT_12_JAM} jam/hari & {BATAS_LEMBUR_MINGGU} jam/minggu (PP 35/2021).</div>
            </div>
          </Tile>
        </>
      )}

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="520px">
        {editTarget && (
          <div>
            <h3 style={{ margin: "0 0 10px", fontSize: "18px" }}>Target SLA (%)</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "60vh", overflowY: "auto" }}>
              {INDIKATOR_SLA.map((i) => (
                <label key={i.key} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 70px", gap: "8px", alignItems: "center", fontSize: "12.5px" }}>
                  <span><b>{i.peran}</b> · {i.label}</span>
                  <input inputMode="numeric" value={editTarget[i.key]} onChange={(e) => setEditTarget({ ...editTarget, [i.key]: e.target.value.replace(/[^\d.]/g, "") })} style={{ padding: "7px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", textAlign: "center" }} />
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <button type="button" className="sa-btn is-soft" style={{ flex: 1 }} onClick={() => setEditTarget(null)}>Batal</button>
              <button type="button" className="sa-btn is-primary" style={{ flex: 1 }} onClick={simpanTarget}>Simpan</button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
