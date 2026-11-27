"use client";

/** §187 Admin GA: rekap Perjalanan Dinas Luar Kota Driver -- per bulan, per driver, per kota, banding tahun lalu. */
import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import AdminShell from "../../../components/admin/AdminShell";
import PerjalananDinasForm from "../../../components/PerjalananDinasForm";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useToast } from "../../../components/ui/ToastProvider";
import { bukaDokumen } from "../../../components/ui/PratinjauDokumen";
import { tanggalISOWITASekarang } from "@/lib/shift";
import { BULAN_PENDEK, JENIS_BIAYA, KOLEKSI_DINAS, dariFirestore, jarakKm, lamaHari, rekapTahun, rupiah, selisihPersen, totalBiaya, type PerjalananDinas, type RekapDinas } from "@/lib/perjalananDinas";

const tgl = (iso: string) => (iso ? `${Number(iso.slice(8, 10))} ${BULAN_PENDEK[Number(iso.slice(5, 7)) - 1]}` : "-");

export default function PerjalananDinasAdminPage() {
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const confirm = useConfirm();
  const showToast = useToast();
  const hariIni = tanggalISOWITASekarang();
  const tahunIni = Number(hariIni.slice(0, 4));
  const [tahun, setTahun] = useState(tahunIni);
  const [semua, setSemua] = useState<PerjalananDinas[]>([]);
  const [driver, setDriver] = useState<string[]>([]);
  const [form, setForm] = useState<{ awal: PerjalananDinas | null } | null>(null);

  useEffect(() => onSnapshot(collection(db, KOLEKSI_DINAS), (s) => setSemua(s.docs.map((d) => dariFirestore(d.id, d.data()))), (e) => console.error(e)), []);
  useEffect(() => {
    getDocs(query(collection(db, "users_master"), where("departemen", "==", "Driver")))
      .then((s) => setDriver(s.docs.map((d) => String(d.data().nama || "").trim()).filter(Boolean).sort()))
      .catch(() => setDriver([]));
  }, []);

  // banding adil: tahun berjalan dibandingkan dengan periode bulan yang sama di tahun lalu
  const sampaiBulan = tahun === tahunIni ? Number(hariIni.slice(5, 7)) : 12;
  const r = useMemo(() => rekapTahun(semua, tahun), [semua, tahun]);
  const rLalu = useMemo(() => rekapTahun(semua, tahun - 1, sampaiBulan), [semua, tahun, sampaiBulan]);
  const rLaluPenuh = useMemo(() => rekapTahun(semua, tahun - 1), [semua, tahun]);
  const daftar = useMemo(() => semua.filter((p) => p.tanggal_berangkat.startsWith(String(tahun))).sort((a, b) => b.tanggal_berangkat.localeCompare(a.tanggal_berangkat)), [semua, tahun]);
  const semuaDriver = useMemo(() => Array.from(new Set([...driver, ...Object.keys(r.driver)])).sort(), [driver, r]);
  const belumIsi = semuaDriver.filter((d) => !semua.some((p) => p.driver === d));

  const hapus = async (p: PerjalananDinas) => {
    if (!(await confirm({ title: "Hapus catatan", message: `Hapus perjalanan ${p.driver} ke ${p.kota_tujuan} (${tgl(p.tanggal_berangkat)})?`, confirmText: "Hapus", variant: "danger" }))) return;
    try { await deleteDoc(doc(db, KOLEKSI_DINAS, p.id)); showToast("Catatan dihapus.", "success"); }
    catch (e) { console.error(e); showToast("Gagal menghapus.", "error"); }
  };

  const ekspor = () => {
    const wb = XLSX.utils.book_new();
    const bulanan = BULAN_PENDEK.map((b, i) => {
      const lalu = rLaluPenuh.bulan[i];
      return { Bulan: b, [`Perjalanan ${tahun}`]: r.bulan[i].trip, [`Perjalanan ${tahun - 1}`]: lalu.trip, [`Hari ${tahun}`]: r.bulan[i].hari, [`Hari ${tahun - 1}`]: lalu.hari, [`KM ${tahun}`]: r.bulan[i].km, [`KM ${tahun - 1}`]: lalu.km, [`Biaya ${tahun}`]: r.bulan[i].biaya, [`Biaya ${tahun - 1}`]: lalu.biaya };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bulanan), "Per Bulan");
    const baris = (o: Record<string, RekapDinas>, kolom: string) => Object.entries(o).sort((a, b) => b[1].trip - a[1].trip).map(([k, v]) => ({ [kolom]: k, Perjalanan: v.trip, Hari: v.hari, KM: v.km, Biaya: v.biaya }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baris(r.driver, "Driver")), "Per Driver");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baris(r.kota, "Kota")), "Per Kota");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(daftar.map((p) => ({
      Driver: p.driver, Berangkat: p.tanggal_berangkat, Pulang: p.tanggal_pulang, Hari: lamaHari(p), Kota: p.kota_tujuan, Keperluan: p.keperluan,
      Penumpang: p.penumpang || "", PT: p.unit_bisnis || "", Kendaraan: p.kendaraan || "", "KM berangkat": p.km_berangkat || "", "KM pulang": p.km_pulang || "", Jarak: jarakKm(p) ?? "",
      ...Object.fromEntries(JENIS_BIAYA.map((j) => [j.label, p.biaya?.[j.kunci] || 0])), "Total biaya": totalBiaya(p.biaya), Susulan: p.susulan ? "ya" : "", Catatan: p.catatan || "",
    }))), "Detail");
    XLSX.writeFile(wb, `Perjalanan-Dinas-${tahun}.xlsx`);
  };

  if (!isReady) return null;
  const kartu: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "16px", padding: "14px 16px" };
  const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontSize: "11.5px", color: "var(--muted)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "6px 8px", fontSize: "12.5px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
  const banding = (a: number, b: number) => <span style={{ fontSize: "11.5px", color: "var(--muted)" }}> vs {b.toLocaleString("id-ID")} ({selisihPersen(a, b)})</span>;

  return (
    <AdminShell title="Perjalanan Dinas Driver" subtitle="Dinas luar kota: frekuensi, hari, KM & biaya — banding tahun lalu" userName={session?.nama || "Admin"}
      actions={<select className="sa-field" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} aria-label="Tahun">{[tahunIni + 1, tahunIni, tahunIni - 1].map((t) => <option key={t} value={t}>{t}</option>)}</select>}>
      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="sa-btn is-primary" onClick={() => setForm({ awal: null })}>+ Catat untuk driver</button>
          <button type="button" className="sa-btn is-soft" onClick={ekspor} disabled={!semua.length}>⬇ Excel {tahun}</button>
        </div>
        {belumIsi.length > 0 && <div style={{ ...kartu, borderColor: "var(--warn)", background: "var(--warn-50)", fontSize: "12.5px" }}>⏳ Belum ada catatan sama sekali dari: <b>{belumIsi.join(", ")}</b>. Minta isi dari menu Driver → Perjalanan Dinas Luar Kota (sejak Januari 2026).</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
          {([["Perjalanan", r.total.trip, rLalu.total.trip, (n: number) => String(n)], ["Hari dinas", r.total.hari, rLalu.total.hari, (n: number) => String(n)], ["KM tercatat", r.total.km, rLalu.total.km, (n: number) => n.toLocaleString("id-ID")], ["Biaya", r.total.biaya, rLalu.total.biaya, rupiah]] as const).map(([l, a, b, fmt]) => (
            <div key={l} style={kartu}>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 700 }}>{l} {tahun}</div>
              <div style={{ fontSize: "20px", fontWeight: 800 }}>{fmt(a)}</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{tahun - 1}{sampaiBulan < 12 ? ` (Jan–${BULAN_PENDEK[sampaiBulan - 1]})` : ""}: {fmt(b)} · {selisihPersen(a, b)}</div>
            </div>
          ))}
        </div>

        <div style={{ ...kartu, overflowX: "auto" }}>
          <div style={{ fontWeight: 800, marginBottom: "6px" }}>Per bulan ({tahun} vs {tahun - 1})</div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>{["Bulan", "Perjalanan", "Hari", "KM", "Biaya"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{BULAN_PENDEK.map((b, i) => (
              <tr key={b}>
                <td style={td}>{b}</td>
                <td style={td}><b>{r.bulan[i].trip}</b>{banding(r.bulan[i].trip, rLaluPenuh.bulan[i].trip)}</td>
                <td style={td}>{r.bulan[i].hari}{banding(r.bulan[i].hari, rLaluPenuh.bulan[i].hari)}</td>
                <td style={td}>{r.bulan[i].km.toLocaleString("id-ID")}</td>
                <td style={td}>{rupiah(r.bulan[i].biaya)}<span style={{ fontSize: "11.5px", color: "var(--muted)" }}> vs {rupiah(rLaluPenuh.bulan[i].biaya)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
          {([["Per driver", r.driver], ["Kota tujuan", r.kota]] as const).map(([judul, o]) => (
            <div key={judul} style={{ ...kartu, overflowX: "auto" }}>
              <div style={{ fontWeight: 800, marginBottom: "6px" }}>{judul}</div>
              {Object.keys(o).length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Belum ada data {tahun}.</div> : (
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr>{["", "Perjalanan", "Hari", "KM", "Biaya"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{Object.entries(o).sort((a, b) => b[1].trip - a[1].trip).map(([k, v]) => (
                    <tr key={k}><td style={{ ...td, fontWeight: 700 }}>{k}</td><td style={td}>{v.trip}</td><td style={td}>{v.hari}</td><td style={td}>{v.km.toLocaleString("id-ID")}</td><td style={td}>{rupiah(v.biaya)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          ))}
        </div>

        <div style={{ ...kartu, overflowX: "auto" }}>
          <div style={{ fontWeight: 800, marginBottom: "6px" }}>Detail {tahun} ({daftar.length})</div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>{["Tanggal", "Driver", "Kota", "Keperluan", "Hari", "KM", "Biaya", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{daftar.map((p) => (
              <tr key={p.id}>
                <td style={td}>{tgl(p.tanggal_berangkat)}{p.tanggal_pulang !== p.tanggal_berangkat ? `–${tgl(p.tanggal_pulang)}` : ""}{p.susulan && <span title="Diisi susulan" style={{ marginLeft: "4px", fontSize: "10.5px", color: "var(--warn)" }}>susulan</span>}</td>
                <td style={td}>{p.driver}</td>
                <td style={{ ...td, fontWeight: 700 }}>{p.kota_tujuan}</td>
                <td style={{ ...td, whiteSpace: "normal", minWidth: "180px" }}>{p.keperluan}{p.penumpang ? <span style={{ color: "var(--muted)" }}> · {p.penumpang}</span> : null}</td>
                <td style={td}>{lamaHari(p)}</td>
                <td style={td}>{jarakKm(p)?.toLocaleString("id-ID") ?? "—"}</td>
                <td style={td}>{rupiah(totalBiaya(p.biaya))}</td>
                <td style={td}>
                  {(p.lampiran || []).map((u, i) => <button key={u} type="button" className="sa-btn is-soft" style={{ height: "26px", padding: "0 7px", marginRight: "4px" }} onClick={() => bukaDokumen({ url: u, nama: `nota-${p.driver}-${i + 1}.jpg` })}>📎</button>)}
                  <button type="button" className="sa-btn is-soft" style={{ height: "26px", padding: "0 8px", marginRight: "4px" }} onClick={() => setForm({ awal: p })}>✎</button>
                  <button type="button" className="sa-btn is-soft" style={{ height: "26px", padding: "0 8px", color: "var(--red-600)" }} onClick={() => hapus(p)}>✕</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {form && <PerjalananDinasForm open awal={form?.awal || null} daftarDriver={semuaDriver.length ? semuaDriver : undefined} oleh={session?.nama || "Admin"} onClose={() => setForm(null)} />}
    </AdminShell>
  );
}
