"use client";

/**
 * Evaluasi Biaya Tahunan (§164) -- khusus Super Admin. Bahan evaluasi & perencanaan tahun depan.
 * 3 kartu: (1) biaya tahun lalu, (2) tahun berjalan vs PERIODE SAMA tahun lalu (nominal & %) + proyeksi setahun,
 * (3) target reduksi tahun depan (% dipilih) dibagi per bagian + saran berbasis data.
 *
 * Pengolahan data:
 *   - Sumber = modul Anggaran (lib/realisasiBiaya): realisasi manual + otomatis (Helpdesk, Servis, ATK, Temuan).
 *   - Bagian = kelompok baris RAB (MEP, Sipil, General Affairs, ...); realisasi tanpa alokasi = "Belum dialokasikan".
 *   - Tahun lalu: rekap tutup buku (anggaran/evaluasi_biaya.rekap[tahun]) bila ada -- untuk tahun sebelum SIBM dipakai
 *     diisi manual dari Excel lama; selain itu dihitung dari data sistem.
 *   - Banding adil: tahun berjalan s.d. hari ini vs tahun lalu s.d. tanggal yang sama (rekap tanpa tanggal ->
 *     diprorata sesuai porsi hari yang sudah lewat).
 *   - Proyeksi setahun: OPEX/PL = realisasi ÷ porsi tahun berjalan (run-rate); CAPEX = maks(realisasi, rencana RAB).
 *   - Target reduksi hanya untuk OPEX/PL (CAPEX = investasi per project, direncanakan terpisah). Porsi hemat per bagian
 *     = proyeksi × (1 + kenaikan, maks 100%) -- bagian yang paling naik mendapat porsi penghematan lebih besar.
 */

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard, isSuperAdmin } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import Modal from "../../../components/ui/Modal";
import { daerahTulis } from "../../../lib/daerah";
import { LABEL_SUMBER, muatDataTahun, type DataTahun, type Jenis, type Realisasi, type Sumber } from "../../../lib/realisasiBiaya";

const DOC_EVALUASI = doc(db, "anggaran", "evaluasi_biaya");
const BELUM = "Belum dialokasikan";
interface BarisRekap { jenis: Jenis; bagian: string; jumlah: number }
interface Evaluasi { rekap?: Record<string, { baris: BarisRekap[]; oleh?: string; sumber?: string }>; target_reduksi?: Record<string, number> }

const rupiah = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));
const ringkas = (n: number) => { const a = Math.abs(n); const s = n < 0 ? "-" : ""; return a >= 1e9 ? `${s}${(a / 1e9).toFixed(2)} M` : a >= 1e6 ? `${s}${(a / 1e6).toFixed(1)} jt` : a >= 1e3 ? `${s}${Math.round(a / 1e3)} rb` : `${s}${Math.round(a)}`; };
const pct = (baru: number, lama: number) => (lama > 0 ? ((baru - lama) / lama) * 100 : null);
const fmtPct = (p: number | null) => (p === null ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);
const kunci = (j: Jenis, b: string) => `${j}|${b}`;
const hariIniWITA = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
const hariKe = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); const a = new Date(`${iso.slice(0, 4)}-01-01T12:00:00Z`); return Math.round((d.getTime() - a.getTime()) / 864e5) + 1; };
const jumlahHari = (th: number) => ((th % 4 === 0 && th % 100 !== 0) || th % 400 === 0 ? 366 : 365);

/** Realisasi -> peta "jenis|bagian" (opsional dibatasi s.d. tanggal). */
function agregat(d: DataTahun | null, sampai?: string) {
  const m = new Map<string, number>();
  if (!d) return m;
  const item = new Map(d.items.map((i) => [i.id, i]));
  d.real.forEach((r) => {
    if (sampai && r.tanggal > sampai) return;
    const i = r.item_id ? item.get(r.item_id) : undefined;
    const k = i ? kunci(i.jenis || "OPEX", i.kelompok || "Lainnya") : kunci("OPEX", BELUM);
    m.set(k, (m.get(k) || 0) + r.jumlah);
  });
  return m;
}
const total = (m: Map<string, number>, filter?: (j: Jenis) => boolean) => Array.from(m.entries()).filter(([k]) => !filter || filter(k.split("|")[0] as Jenis)).reduce((a, [, v]) => a + v, 0);
const opexLike = (j: Jenis) => j !== "CAPEX";

/** Saran berbasis data + kata kunci nama bagian. */
function saranBagian(bagian: string, jenis: Jenis, real: Realisasi[], naik: number | null, porsi: number, overRab: string[]): string[] {
  const s: string[] = [];
  if (naik !== null && naik > 10) s.push(`Naik ${naik.toFixed(0)}% dibanding periode yang sama tahun lalu — cari penyebab utamanya sebelum menyusun RAB.`);
  if (porsi >= 30 && jenis !== "CAPEX") s.push(`Porsi terbesar (${porsi.toFixed(0)}% biaya operasional) — prioritas negosiasi kontrak tahunan / bandingkan minimal 3 vendor.`);
  // perbaikan berulang (helpdesk & temuan) dengan uraian sama
  const ulang = new Map<string, { n: number; rp: number }>();
  real.filter((r) => r.sumber === "helpdesk" || r.sumber === "temuan_gedung" || r.sumber === "temuan_alat").forEach((r) => {
    const k = r.uraian.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    const x = ulang.get(k) || { n: 0, rp: 0 }; ulang.set(k, { n: x.n + 1, rp: x.rp + r.jumlah });
  });
  Array.from(ulang.entries()).filter(([, x]) => x.n >= 2).sort((a, b) => b[1].rp - a[1].rp).slice(0, 2)
    .forEach(([k, x]) => s.push(`Perbaikan berulang "${k}" ${x.n}× (${ringkas(x.rp)}) — bandingkan biaya ganti unit atau kontrak maintenance.`));
  const atk = real.filter((r) => r.sumber === "atk");
  if (atk.length) {
    const dept = new Map<string, number>();
    atk.forEach((r) => { const d = r.uraian.split("·").pop()?.trim() || "-"; dept.set(d, (dept.get(d) || 0) + r.jumlah); });
    const [d, rp] = Array.from(dept.entries()).sort((a, b) => b[1] - a[1])[0];
    s.push(`ATK terbesar dept ${d} (${ringkas(rp)}) — terapkan kuota per departemen & approval untuk item mahal.`);
  }
  const sv = real.filter((r) => r.sumber === "servis");
  if (sv.length) {
    const unit = new Map<string, number>();
    sv.forEach((r) => { const u = r.uraian.split(":")[0]; unit.set(u, (unit.get(u) || 0) + r.jumlah); });
    const [u, rp] = Array.from(unit.entries()).sort((a, b) => b[1] - a[1])[0];
    s.push(`Servis kendaraan terbesar ${u} (${ringkas(rp)}) — evaluasi umur unit (jual/ganti) & bandingkan bengkel.`);
  }
  overRab.slice(0, 2).forEach((o) => s.push(`${o} melebihi RAB — koreksi pagu atau kendalikan pemakaian.`));
  const b = bagian.toLowerCase();
  if (/mep|listrik|elektri|ac\b|mekanikal|genset|plumbing/.test(b)) s.push("Jadwalkan preventive maintenance AC/genset/pompa (lebih murah dari perbaikan darurat); pastikan overtime AC & listrik tenant ditagihkan.");
  else if (/sipil|bangunan|renovasi|civil/.test(b)) s.push("Gabungkan pekerjaan kecil menjadi 1 paket vendor per kuartal agar harga lebih baik.");
  else if (/general|ga\b|atk|umum|kantor/.test(b)) s.push("Kontrak harga tetap ATK/consumable setahun & pantau pemakaian per departemen.");
  else if (/kendaraan|transport|armada|bbm/.test(b)) s.push("Servis berkala sesuai KM, catat BBM per unit, pertimbangkan sewa vs milik untuk unit tua.");
  else if (/bersih|cleaning|ob\b|hygiene|chemical/.test(b)) s.push("Pantau pemakaian chemical & alat lewat inspeksi alat; standarkan takaran per area.");
  else if (/security|keamanan/.test(b)) s.push("Evaluasi kebutuhan personel per shift dari data kepatuhan patroli sebelum menambah orang.");
  if (bagian === BELUM) s.unshift("Belum dialokasikan ke baris RAB — alokasikan di Anggaran ▸ Realisasi agar analisa per bagian akurat.");
  if (!s.length) s.push(naik !== null && naik < -5 ? `Turun ${Math.abs(naik).toFixed(0)}% — pertahankan pola saat ini.` : "Stabil — pertahankan & pantau tiap kuartal.");
  return s;
}

export default function EvaluasiBiayaPage() {
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const hari = hariIniWITA();
  const tahunSekarang = Number(hari.slice(0, 4));
  const [tahun, setTahun] = useState(tahunSekarang);
  const [ini, setIni] = useState<DataTahun | null>(null);
  const [lalu, setLalu] = useState<DataTahun | null>(null);
  const [evaluasi, setEvaluasi] = useState<Evaluasi>({});
  const [memuat, setMemuat] = useState(true);
  const [targetDraf, setTargetDraf] = useState<string>("");
  const [rekapForm, setRekapForm] = useState<BarisRekap[] | null>(null);
  const [caraHitung, setCaraHitung] = useState(false);
  const superAdmin = !!session && isSuperAdmin(session.role, session.daerah);

  useEffect(() => {
    if (!isReady || !superAdmin) return;
    let batal = false;
    const t = setTimeout(() => { if (!batal) setMemuat(true); }, 0);
    Promise.all([muatDataTahun(tahun), muatDataTahun(tahun - 1), getDoc(DOC_EVALUASI)]).then(([a, b, e]) => {
      if (batal) return;
      setIni(a); setLalu(b); setEvaluasi((e.data() as Evaluasi) || {}); setMemuat(false);
    }).catch((e) => { console.error("[evaluasi]", e); if (!batal) setMemuat(false); });
    return () => { batal = true; clearTimeout(t); };
  }, [isReady, superAdmin, tahun]);

  if (!isReady || !session) return null;
  if (!superAdmin) {
    return (
      <AdminShell title="Evaluasi Biaya" userName={session.nama || "Admin"}>
        <Tile><div style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>Halaman ini khusus Super Admin (akun Administrator dengan wilayah PUSAT).</div></Tile>
      </AdminShell>
    );
  }

  // ---------- olah data ----------
  const berjalan = tahun === tahunSekarang;
  const sampaiIni = berjalan ? hari : `${tahun}-12-31`;
  const porsiTahun = berjalan ? Math.min(1, hariKe(hari) / jumlahHari(tahun)) : 1;
  const tanggalSamaLalu = `${tahun - 1}${sampaiIni.slice(4)}`;
  const rekapLalu = evaluasi.rekap?.[String(tahun - 1)];
  const lewatRekap = !!rekapLalu?.baris?.length;
  const adaDataLalu = !!lalu?.real.length;

  const aIni = agregat(ini, sampaiIni);
  const aLaluFull = lewatRekap ? new Map(rekapLalu!.baris.map((b) => [kunci(b.jenis, b.bagian), b.jumlah])) : agregat(lalu);
  // periode sama tahun lalu: data bertanggal bila ada, selain itu rekap diprorata
  const proratar = !adaDataLalu || (lewatRekap && total(agregat(lalu)) < total(aLaluFull) * 0.5);
  const aLaluSama = proratar ? new Map(Array.from(aLaluFull.entries()).map(([k, v]) => [k, v * porsiTahun])) : agregat(lalu, tanggalSamaLalu);
  const rencanaCapexIni = (ini?.items || []).filter((i) => i.jenis === "CAPEX");
  const proyeksi = new Map<string, number>();
  new Set([...aIni.keys(), ...rencanaCapexIni.map((i) => kunci("CAPEX", i.kelompok || "Lainnya"))]).forEach((k) => {
    const [j] = k.split("|") as [Jenis];
    if (j === "CAPEX") {
      const rencana = rencanaCapexIni.filter((i) => kunci("CAPEX", i.kelompok || "Lainnya") === k).reduce((a, i) => a + (i.qty || 0) * (i.harga || 0), 0);
      proyeksi.set(k, Math.max(aIni.get(k) || 0, berjalan ? rencana : 0));
    } else proyeksi.set(k, (aIni.get(k) || 0) / (porsiTahun || 1));
  });

  const totLalu = total(aLaluFull), totIni = total(aIni), totLaluSama = total(aLaluSama), totProyeksi = total(proyeksi);
  const opexLalu = total(aLaluFull, opexLike), opexIni = total(aIni, opexLike), opexLaluSama = total(aLaluSama, opexLike), opexProyeksi = total(proyeksi, opexLike);
  const tahunTarget = tahun + 1;
  const targetPct = targetDraf !== "" ? Number(targetDraf) || 0 : evaluasi.target_reduksi?.[String(tahunTarget)] ?? 5;
  const hematTotal = opexProyeksi * (targetPct / 100);

  const semuaKunci = Array.from(new Set([...aLaluFull.keys(), ...aIni.keys(), ...proyeksi.keys()]));
  const itemIni = new Map((ini?.items || []).map((i) => [i.id, i]));
  const realPerKunci = (k: string) => (ini?.real || []).filter((r) => {
    if (r.tanggal > sampaiIni) return false;
    const i = r.item_id ? itemIni.get(r.item_id) : undefined;
    return (i ? kunci(i.jenis || "OPEX", i.kelompok || "Lainnya") : kunci("OPEX", BELUM)) === k;
  });
  const bobot = (k: string) => {
    const [j] = k.split("|") as [Jenis];
    if (!opexLike(j)) return 0;
    const g = pct(aIni.get(k) || 0, aLaluSama.get(k) || 0);
    return (proyeksi.get(k) || 0) * (1 + Math.min(1, Math.max(0, (g ?? 0) / 100)));
  };
  const totalBobot = semuaKunci.reduce((a, k) => a + bobot(k), 0) || 1;
  const baris = semuaKunci.map((k) => {
    const [jenis, bagian] = k.split("|") as [Jenis, string];
    const naik = pct(aIni.get(k) || 0, aLaluSama.get(k) || 0);
    const proy = proyeksi.get(k) || 0;
    const hemat = opexLike(jenis) ? hematTotal * (bobot(k) / totalBobot) : 0;
    const overRab = (ini?.items || []).filter((i) => kunci(i.jenis, i.kelompok || "Lainnya") === k).filter((i) => {
      const r = (ini?.real || []).filter((x) => x.item_id === i.id).reduce((a, x) => a + x.jumlah, 0);
      const rab = (i.qty || 0) * (i.harga || 0);
      return rab > 0 && r > rab;
    }).map((i) => i.uraian);
    return {
      k, jenis, bagian, lalu: aLaluFull.get(k) || 0, ini: aIni.get(k) || 0, laluSama: aLaluSama.get(k) || 0, naik, proy, hemat,
      target: opexLike(jenis) ? proy - hemat : null,
      saran: saranBagian(bagian, jenis, realPerKunci(k), naik, opexProyeksi > 0 && opexLike(jenis) ? (proy / opexProyeksi) * 100 : 0, overRab),
    };
  }).sort((a, b) => (a.jenis === "CAPEX" ? 1 : 0) - (b.jenis === "CAPEX" ? 1 : 0) || b.proy - a.proy);

  const perSumber = (d: DataTahun | null, sampai: string) => {
    const m = new Map<Sumber, number>();
    (d?.real || []).forEach((r) => { if (r.tanggal <= sampai) m.set(r.sumber, (m.get(r.sumber) || 0) + r.jumlah); });
    return m;
  };
  const sumberIni = perSumber(ini, sampaiIni), sumberLalu = perSumber(lalu, tanggalSamaLalu);
  const belumAlokasi = aIni.get(kunci("OPEX", BELUM)) || 0;

  // ---------- simpan ----------
  const simpanTarget = async (p: number) => {
    try {
      await setDoc(DOC_EVALUASI, { target_reduksi: { [String(tahunTarget)]: p }, daerah: daerahTulis(), diperbarui_oleh: session.nama || "-", diperbarui_pada: serverTimestamp() }, { merge: true });
      setEvaluasi((e) => ({ ...e, target_reduksi: { ...(e.target_reduksi || {}), [String(tahunTarget)]: p } }));
      setTargetDraf("");
      showToast(`Target reduksi ${tahunTarget}: ${p}%`, "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan target.", "error"); }
  };
  const bukaRekap = () => {
    const dasar = lewatRekap ? rekapLalu!.baris : Array.from(agregat(lalu).entries()).map(([k, v]) => { const [j, b] = k.split("|"); return { jenis: j as Jenis, bagian: b, jumlah: Math.round(v) }; });
    const bagianIni = Array.from(new Set((ini?.items || []).map((i) => kunci(i.jenis, i.kelompok || "Lainnya"))));
    const tambah = bagianIni.filter((k) => !dasar.some((d) => kunci(d.jenis, d.bagian) === k)).map((k) => { const [j, b] = k.split("|"); return { jenis: j as Jenis, bagian: b, jumlah: 0 }; });
    setRekapForm([...dasar, ...tambah].map((x) => ({ ...x })));
  };
  const simpanRekap = async () => {
    if (!rekapForm) return;
    const bersih = rekapForm.filter((b) => b.bagian.trim()).map((b) => ({ ...b, bagian: b.bagian.trim(), jumlah: Math.round(b.jumlah) || 0 }));
    try {
      await setDoc(DOC_EVALUASI, { rekap: { [String(tahun - 1)]: { baris: bersih, oleh: session.nama || "-", sumber: adaDataLalu ? "tutup buku" : "manual" } }, daerah: daerahTulis(), diperbarui_pada: serverTimestamp() }, { merge: true });
      setEvaluasi((e) => ({ ...e, rekap: { ...(e.rekap || {}), [String(tahun - 1)]: { baris: bersih, oleh: session.nama || "-" } } }));
      setRekapForm(null);
      showToast(`Rekap ${tahun - 1} tersimpan.`, "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan rekap.", "error"); }
  };
  const ekspor = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      [`Evaluasi Biaya ${tahun} (per ${sampaiIni})`],
      ["Jenis", "Bagian", `Total ${tahun - 1}`, `${tahun - 1} periode sama`, `${tahun} s.d. ${sampaiIni}`, "Naik/Turun (%)", `Proyeksi ${tahun}`, `Target ${tahunTarget}`, "Hemat", "Saran"],
      ...baris.map((b) => [b.jenis, b.bagian, Math.round(b.lalu), Math.round(b.laluSama), Math.round(b.ini), b.naik === null ? "" : Number(b.naik.toFixed(1)), Math.round(b.proy), b.target === null ? "" : Math.round(b.target), Math.round(b.hemat), b.saran.join(" | ")]),
      [],
      ["TOTAL", "", Math.round(totLalu), Math.round(totLaluSama), Math.round(totIni), pct(totIni, totLaluSama) === null ? "" : Number(pct(totIni, totLaluSama)!.toFixed(1)), Math.round(totProyeksi), Math.round(opexProyeksi - hematTotal), Math.round(hematTotal)],
      [`Target reduksi OPEX ${tahunTarget}: ${targetPct}%`],
    ]), "Evaluasi");
    XLSX.writeFile(wb, `Evaluasi_Biaya_${tahun}.xlsx`);
  };

  const warnaNaik = (p: number | null) => (p === null ? "var(--muted)" : p > 0 ? "var(--red-600)" : "var(--ok)");
  const kartu: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", minHeight: "190px" };
  const label: React.CSSProperties = { fontSize: "12px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em" };

  return (
    <AdminShell title="Evaluasi Biaya" subtitle="Tahun lalu · tahun berjalan · target tahun depan — khusus Super Admin" userName={session.nama || "Admin"}
      actions={<>
        <select className="ev-in" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} aria-label="Tahun evaluasi">
          {[tahunSekarang, tahunSekarang - 1, tahunSekarang - 2].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" className="sa-btn is-soft" onClick={ekspor} disabled={memuat}>Export Excel</button>
      </>}>
      <style dangerouslySetInnerHTML={{ __html: `
        .ev-in { padding: 9px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 13px; font-family: inherit; }
        .ev-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
        @media (max-width: 900px) { .ev-grid { grid-template-columns: 1fr; } }
        .ev-angka { font-size: 26px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1.15; }
        .ev-tabel { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 860px; }
        .ev-tabel th { text-align: right; padding: 9px 10px; background: var(--bg); color: var(--ink-soft); font-size: 11.5px; font-weight: 800; border-bottom: 1px solid var(--line); white-space: nowrap; }
        .ev-tabel th:first-child, .ev-tabel td:first-child { text-align: left; }
        .ev-tabel td { padding: 9px 10px; border-bottom: 1px solid var(--line); text-align: right; font-variant-numeric: tabular-nums; vertical-align: top; }
        .ev-chip { border: 1px solid var(--line); background: var(--bg); color: var(--ink-soft); border-radius: 999px; padding: 6px 12px; font-size: 12.5px; font-weight: 800; cursor: pointer; font-family: inherit; }
        .ev-chip.is-on { background: var(--ink); color: var(--surface); border-color: transparent; }
      ` }} />

      {memuat ? <Tile><div style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Mengolah data biaya {tahun - 1}–{tahun}…</div></Tile> : (
        <>
          {!lewatRekap && !adaDataLalu && (
            <Tile style={{ marginBottom: "12px", background: "var(--warn-50)" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "240px", fontSize: "13px", color: "var(--ink)" }}><b>Data {tahun - 1} belum ada di sistem.</b> Isi rekap biaya {tahun - 1} per bagian dari Excel lama sekali saja — setelah itu perbandingan & target otomatis.</div>
                <button type="button" className="sa-btn is-primary" onClick={bukaRekap}>Isi rekap {tahun - 1}</button>
              </div>
            </Tile>
          )}

          <div className="ev-grid">
            {/* KARTU 1 */}
            <Tile style={kartu}>
              <div style={label}>① Biaya {tahun - 1}</div>
              <div className="ev-angka">{rupiah(totLalu)}</div>
              <div style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>Operasional (OPEX) {rupiah(opexLalu)} · Investasi (CAPEX) {rupiah(totLalu - opexLalu)}</div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>Sumber: {lewatRekap ? `rekap ${rekapLalu?.sumber || "manual"}${rekapLalu?.oleh ? ` oleh ${rekapLalu.oleh}` : ""}` : adaDataLalu ? "data sistem (belum tutup buku)" : "belum ada"}</div>
              <div style={{ marginTop: "auto" }}><button type="button" className="sa-btn is-soft" onClick={bukaRekap}>{lewatRekap ? "Ubah rekap" : adaDataLalu ? `Tutup buku ${tahun - 1}` : `Isi rekap ${tahun - 1}`}</button></div>
            </Tile>

            {/* KARTU 2 */}
            <Tile style={kartu}>
              <div style={label}>② {tahun} s.d. {new Date(`${sampaiIni}T12:00:00+08:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</div>
              <div className="ev-angka">{rupiah(totIni)}</div>
              <div style={{ fontSize: "15px", fontWeight: 800, color: warnaNaik(pct(totIni, totLaluSama)) }}>
                {totIni - totLaluSama >= 0 ? "▲ Naik" : "▼ Turun"} {rupiah(Math.abs(totIni - totLaluSama))} ({fmtPct(pct(totIni, totLaluSama))})
              </div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>dibanding {tahun - 1} periode yang sama ({rupiah(totLaluSama)}{proratar ? ", estimasi prorata" : ""}). OPEX {fmtPct(pct(opexIni, opexLaluSama))}.</div>
              {berjalan && <div style={{ marginTop: "auto", fontSize: "12.5px", color: "var(--ink-soft)" }}>Proyeksi akhir {tahun}: <b>{rupiah(totProyeksi)}</b> <span style={{ color: warnaNaik(pct(totProyeksi, totLalu)) }}>({fmtPct(pct(totProyeksi, totLalu))} vs {tahun - 1})</span></div>}
            </Tile>

            {/* KARTU 3 */}
            <Tile style={kartu}>
              <div style={label}>③ Target {tahunTarget}</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: "12.5px", color: "var(--ink-soft)", fontWeight: 700 }}>Reduksi OPEX</span>
                {[3, 5, 10, 15].map((p) => <button key={p} type="button" className={`ev-chip${targetPct === p ? " is-on" : ""}`} onClick={() => simpanTarget(p)}>{p}%</button>)}
                <input className="ev-in" style={{ width: "64px", padding: "5px 8px" }} inputMode="decimal" value={targetDraf} placeholder="lain" onChange={(e) => setTargetDraf(e.target.value.replace(/[^\d.]/g, ""))} onBlur={() => targetDraf && simpanTarget(Number(targetDraf) || 0)} aria-label="Target reduksi lain (%)" />
              </div>
              <div className="ev-angka">{rupiah(opexProyeksi - hematTotal)}</div>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--ok)" }}>Hemat {rupiah(hematTotal)} ({targetPct}%)</div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>dari proyeksi OPEX {tahun} {rupiah(opexProyeksi)}. CAPEX direncanakan per project di RAB {tahunTarget}.</div>
              <div style={{ marginTop: "auto", fontSize: "12px", color: "var(--ink-soft)" }}>Rincian per bagian & saran ada di tabel bawah.</div>
            </Tile>
          </div>

          {/* TABEL PER BAGIAN */}
          <Tile style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline", flexWrap: "wrap", marginBottom: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>Analisa per bagian</h2>
              <button type="button" className="ev-chip" onClick={() => setCaraHitung(!caraHitung)}>{caraHitung ? "Tutup" : "Cara hitung"}</button>
            </div>
            {caraHitung && (
              <div style={{ fontSize: "12.5px", color: "var(--ink)", background: "var(--bg)", borderRadius: "12px", padding: "12px 14px", marginBottom: "12px", lineHeight: 1.6 }}>
                <b>Bagian</b> = kelompok di RAB (MEP, Sipil, General Affairs, …). Semua biaya diambil dari Anggaran & Realisasi: input manual + otomatis (Helpdesk, Servis kendaraan, ATK, Temuan aset).<br />
                <b>Naik/turun</b> dibanding <i>periode yang sama</i> tahun lalu (Jan s.d. tanggal hari ini), bukan setahun penuh — supaya adil.<br />
                <b>Proyeksi</b> OPEX = realisasi ÷ {Math.round(porsiTahun * 100)}% tahun yang sudah lewat; CAPEX = realisasi atau rencana RAB (mana yang lebih besar).<br />
                <b>Target</b> hanya OPEX: penghematan {targetPct}% dibagi ke bagian sebanding besar biaya × kenaikannya — bagian yang paling naik mendapat porsi hemat lebih besar.<br />
                <b>Rekap tahun lalu</b>: tahun sebelum SIBM dipakai diisi manual; tahun berikutnya cukup &quot;Tutup buku&quot; di awal tahun agar angka evaluasi tidak berubah.
              </div>
            )}
            <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
              <table className="ev-tabel">
                <thead><tr><th>Bagian</th><th>{tahun - 1}</th><th>{tahun - 1} periode sama</th><th>{tahun} s.d. kini</th><th>Naik/turun</th><th>Proyeksi {tahun}</th><th>Target {tahunTarget}</th><th>Hemat</th></tr></thead>
                <tbody>
                  {baris.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>Belum ada data biaya.</td></tr>}
                  {baris.map((b) => (
                    <tr key={b.k}>
                      <td style={{ minWidth: "300px" }}>
                        <div style={{ fontWeight: 800, color: "var(--ink)" }}>{b.bagian} <span style={{ fontSize: "10.5px", fontWeight: 800, color: b.jenis === "CAPEX" ? "var(--info)" : "var(--warn)" }}>{b.jenis}</span></div>
                        <ul style={{ margin: "4px 0 0", paddingLeft: "16px", fontSize: "11.5px", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                          {b.saran.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </td>
                      <td>{ringkas(b.lalu)}</td>
                      <td>{ringkas(b.laluSama)}</td>
                      <td>{ringkas(b.ini)}</td>
                      <td style={{ fontWeight: 800, color: warnaNaik(b.naik) }}>{fmtPct(b.naik)}</td>
                      <td>{ringkas(b.proy)}</td>
                      <td style={{ fontWeight: 800 }}>{b.target === null ? "—" : ringkas(b.target)}</td>
                      <td style={{ color: "var(--ok)", fontWeight: 800 }}>{b.hemat ? ringkas(b.hemat) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {belumAlokasi > 0 && totIni > 0 && belumAlokasi / totIni > 0.1 && <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--warn)", fontWeight: 700 }}>{Math.round((belumAlokasi / totIni) * 100)}% biaya {tahun} belum dialokasikan ke bagian — analisa per bagian belum akurat. Alokasikan di Anggaran ▸ Realisasi.</p>}
          </Tile>

          {/* SUMBER */}
          <Tile>
            <h2 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: 800 }}>Dari mana biaya muncul</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "8px" }}>
              {(Object.keys(LABEL_SUMBER) as Sumber[]).filter((s) => (sumberIni.get(s) || 0) + (sumberLalu.get(s) || 0) > 0).map((s) => {
                const a = sumberIni.get(s) || 0, b = sumberLalu.get(s) || 0, p = pct(a, b);
                return (
                  <div key={s} style={{ padding: "10px 12px", borderRadius: "12px", background: "var(--bg)" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>{LABEL_SUMBER[s]}</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "var(--ink)" }}>{ringkas(a)}</div>
                    <div style={{ fontSize: "11.5px", fontWeight: 700, color: warnaNaik(p) }}>{fmtPct(p)} <span style={{ color: "var(--muted)", fontWeight: 600 }}>vs {ringkas(b)}</span></div>
                  </div>
                );
              })}
            </div>
            {proratar && <p style={{ margin: "8px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Rincian sumber {tahun - 1} hanya tersedia untuk data yang tercatat di sistem.</p>}
          </Tile>
        </>
      )}

      <Modal open={!!rekapForm} onClose={() => setRekapForm(null)} maxWidth="640px">
        {rekapForm && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>Rekap biaya {tahun - 1} per bagian</h3>
            <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>{adaDataLalu ? "Terisi dari data sistem — koreksi bila perlu lalu simpan sebagai tutup buku." : "Isi dari laporan/Excel tahun lalu. Cukup total per bagian."}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "50vh", overflowY: "auto" }}>
              {rekapForm.map((b, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) 150px 30px", gap: "6px" }}>
                  <select className="ev-in" value={b.jenis} onChange={(e) => setRekapForm(rekapForm.map((x, j) => (j === i ? { ...x, jenis: e.target.value as Jenis } : x)))} aria-label="Jenis"><option>OPEX</option><option>CAPEX</option><option>PL</option></select>
                  <input className="ev-in" value={b.bagian} onChange={(e) => setRekapForm(rekapForm.map((x, j) => (j === i ? { ...x, bagian: e.target.value } : x)))} placeholder="Bagian (mis. MEP)" aria-label="Bagian" />
                  <input className="ev-in" inputMode="numeric" value={b.jumlah ? new Intl.NumberFormat("id-ID").format(b.jumlah) : ""} onChange={(e) => setRekapForm(rekapForm.map((x, j) => (j === i ? { ...x, jumlah: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} placeholder="Rp" aria-label="Jumlah" />
                  <button type="button" className="ev-chip" style={{ padding: "4px" }} onClick={() => setRekapForm(rekapForm.filter((_, j) => j !== i))} aria-label="Hapus baris">×</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="sa-btn is-soft" onClick={() => setRekapForm([...rekapForm, { jenis: "OPEX", bagian: "", jumlah: 0 }])}>+ Bagian</button>
              <span style={{ fontSize: "13px", fontWeight: 800 }}>Total {rupiah(rekapForm.reduce((a, b) => a + (b.jumlah || 0), 0))}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setRekapForm(null)}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={simpanRekap}>Simpan rekap</button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
