"use client";

/**
 * Uji Coba Pola Zona OB (§169) -- Pengaturan (tanggal, 2 orang Zona Tenant + 2 orang Zona Publik, daftar area,
 * minimal ronde) & Evaluasi (uji coba vs 2 minggu sebelumnya, Tenant vs Publik, minggu 1 vs 2 per orang).
 */

import { useEffect, useMemo, useState } from "react";
import { collection, getDoc, getDocs, doc, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import { tanggalISOWITASekarang } from "../../../lib/shift";
import { useChecklistOB } from "../../../lib/sopChecklist";
import {
  areaPublikBawaan, areaTenantBawaan, DOC_UJI_POLA, jadwalDariMulai, KOLEKSI_LAPORAN_ZONA, LABEL_BEBAN, tambahHari, useUjiPolaZona,
  type LaporanZona,
} from "../../../lib/ujiPolaZona";
import { hitungEvaluasi, type ChecklistLama, type KlaimLembur, type Permintaan } from "../../../lib/evaluasiZona";

type Pilihan = "Tenant" | "Publik" | "";
const f1 = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "–" : n.toFixed(d));
const tglIndo = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "–");

/** Senin terdekat setelah hari ini (atau hari ini bila Senin). */
function seninBerikut(hariIni: string) {
  let d = hariIni;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = tambahHari(d, 1);
  return d;
}

export default function UjiPolaZonaPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ roles: ["Admin", "Koordinator"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator." });
  const hariIni = tanggalISOWITASekarang();
  const { config, dimuat } = useUjiPolaZona();
  const { nilai: masterOB } = useChecklistOB();
  const [tab, setTab] = useState<"atur" | "evaluasi">("atur");

  // ---------- form pengaturan ----------
  const [staf, setStaf] = useState<string[]>([]);
  const [pilihan, setPilihan] = useState<Record<string, Pilihan>>({});
  const [mulai, setMulai] = useState(seninBerikut(hariIni));
  const [minRonde, setMinRonde] = useState("1");
  const [areaTenant, setAreaTenant] = useState("");
  const [areaPublik, setAreaPublik] = useState("");
  const [simpan, setSimpan] = useState(false);
  const [formTerisi, setFormTerisi] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    return onSnapshot(query(collection(db, "users_master"), where("departemen", "==", "OB & CS")), (s) => {
      setStaf(s.docs.map((d) => String(d.data().nama || "")).filter(Boolean).sort());
    });
  }, [isReady]);

  const isiAreaBawaan = async () => {
    const ok = await getDoc(doc(db, "okupansi_gedung", "data")).catch(() => null);
    setAreaTenant(areaTenantBawaan(ok?.data()?.lantai).join("\n"));
    setAreaPublik(areaPublikBawaan(masterOB.area).join("\n"));
  };

  // isi form dari konfigurasi tersimpan (sekali, saat render pertama setelah dimuat)
  if (dimuat && !formTerisi) {
    setFormTerisi(true);
    if (config) {
      setMulai(config.mulai);
      setMinRonde(String(config.min_ronde));
      const p: Record<string, Pilihan> = {};
      config.tim_tenant.forEach((n) => (p[n] = "Tenant"));
      config.tim_publik.forEach((n) => (p[n] = "Publik"));
      setPilihan(p);
      setAreaTenant(config.area_tenant.join("\n"));
      setAreaPublik(config.area_publik.join("\n"));
    }
  }
  // belum pernah diatur -> daftar area bawaan dari Okupansi & SOP (async, state diisi setelah data datang)
  const perluBawaan = dimuat && !config;
  useEffect(() => {
    if (!perluBawaan) return;
    getDoc(doc(db, "okupansi_gedung", "data")).catch(() => null).then((ok) => {
      setAreaTenant(areaTenantBawaan(ok?.data()?.lantai).join("\n"));
      setAreaPublik(areaPublikBawaan(masterOB.area).join("\n"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sekali saat belum ada konfigurasi
  }, [perluBawaan]);

  const jadwal = jadwalDariMulai(mulai);
  const timTenant = Object.keys(pilihan).filter((n) => pilihan[n] === "Tenant");
  const timPublik = Object.keys(pilihan).filter((n) => pilihan[n] === "Publik");

  const simpanConfig = async (aktif: boolean) => {
    if (new Date(`${mulai}T00:00:00Z`).getUTCDay() !== 1) return showToast("Tanggal mulai harus hari Senin.", "warning");
    if (!timTenant.length || !timPublik.length) return showToast("Pilih minimal 1 orang di Zona Tenant dan 1 di Zona Publik.", "warning");
    const at = areaTenant.split("\n").map((s) => s.trim()).filter(Boolean);
    const ap = areaPublik.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!at.length || !ap.length) return showToast("Daftar area Tenant & Publik tidak boleh kosong.", "warning");
    setSimpan(true);
    try {
      await setDoc(DOC_UJI_POLA(), {
        aktif, ...jadwal, tim_tenant: timTenant, tim_publik: timPublik, area_tenant: at, area_publik: ap,
        min_ronde: Math.max(1, Number(minRonde) || 1), dibuat_oleh: session?.nama || "", waktu_update: serverTimestamp(),
      });
      showToast(aktif ? "Uji coba disimpan & aktif sesuai tanggal." : "Disimpan sebagai draf (belum aktif).", "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan.", "error"); }
    setSimpan(false);
  };

  const hentikan = async () => {
    if (!(await confirm({ title: "Hentikan uji coba", message: "Checklist lama, pengingat sesi & potong poin kembali berlaku mulai hari ini. Data uji coba tetap tersimpan untuk evaluasi.", confirmText: "Hentikan", variant: "danger" }))) return;
    try {
      // dihentikan di tengah periode -> selesai dimajukan ke hari ini supaya evaluasi hanya menghitung hari yang berjalan
      const selesaiBaru = config && hariIni >= config.mulai && hariIni < config.selesai ? { selesai: hariIni } : {};
      await updateDoc(DOC_UJI_POLA(), { aktif: false, ...selesaiBaru, waktu_update: serverTimestamp() });
      showToast("Uji coba dihentikan. Pola lama berlaku lagi.", "success");
    } catch (e) { console.error(e); showToast("Gagal menghentikan.", "error"); }
  };

  // ---------- data evaluasi ----------
  const [laporan, setLaporan] = useState<LaporanZona[]>([]);
  const [permintaan, setPermintaan] = useState<Permintaan[]>([]);
  const [lembur, setLembur] = useState<KlaimLembur[]>([]);
  const [checklistLama, setChecklistLama] = useState<ChecklistLama[]>([]);
  const [libur, setLibur] = useState<string[]>([]);
  const [muat, setMuat] = useState(false);

  useEffect(() => {
    if (!isReady || !config || tab !== "evaluasi") return;
    let batal = false;
    (async () => {
      setMuat(true);
      const lamaDari = tambahHari(config.mulai, -14);
      try {
        const [lz, pp, lb, cl, st] = await Promise.all([
          getDocs(query(collection(db, KOLEKSI_LAPORAN_ZONA), where("tanggal", ">=", config.mulai), where("tanggal", "<=", config.selesai))),
          getDocs(query(collection(db, "permintaan_pelayanan"), where("waktu_minta", ">=", Timestamp.fromDate(new Date(`${lamaDari}T00:00:00+08:00`))))),
          getDocs(query(collection(db, "ga_overtime_requests"), where("departemen", "==", "OB & CS"))),
          getDocs(query(collection(db, "ob_checklists"), where("tanggal", ">=", lamaDari), where("tanggal", "<", config.mulai))),
          getDoc(doc(db, "settings", "validasi_karyawan")),
        ]);
        if (batal) return;
        setLaporan(lz.docs.map((d) => ({ id: d.id, ...d.data() } as LaporanZona)));
        setPermintaan(pp.docs.map((d) => d.data() as Permintaan));
        setLembur(lb.docs.map((d) => d.data() as KlaimLembur));
        setChecklistLama(cl.docs.map((d) => d.data() as ChecklistLama));
        setLibur((st.data()?.hari_libur as string[]) || []);
      } catch (e) { console.error(e); showToast("Gagal memuat data evaluasi.", "error"); }
      if (!batal) setMuat(false);
    })();
    return () => { batal = true; };
  }, [isReady, config, tab, showToast]);

  const hasil = useMemo(() => (config ? hitungEvaluasi(config, hariIni, libur, laporan, permintaan, lembur, checklistLama) : null),
    [config, hariIni, libur, laporan, permintaan, lembur, checklistLama]);

  const exportExcel = () => {
    if (!hasil || !config) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Evaluasi Uji Coba Pola Zona OB", `${config.mulai} s.d. ${config.selesai}`],
      ["Kesimpulan", hasil.kesimpulan.judul], ...hasil.kesimpulan.alasan.map((a) => ["", a]), [],
      ["Ukuran", `Pola lama (${hasil.lama.dari} s.d. ${hasil.lama.sampai})`, `Uji coba (${hasil.uji.dari} s.d. ${hasil.uji.sampai})`],
      ["Hari kerja", hasil.lama.hari, hasil.uji.hari],
      ["Permintaan / hari", +hasil.lama.permintaanPerHari.toFixed(1), +hasil.uji.permintaanPerHari.toFixed(1)],
      ["Respon rata-rata (menit)", f1(hasil.lama.responMenit), f1(hasil.uji.responMenit)],
      ["% diterima ≤ 10 menit", f1(hasil.lama.persenCepat, 0), f1(hasil.uji.persenCepat, 0)],
      ["Lembur (jam)", +hasil.lama.lemburJam.toFixed(1), +hasil.uji.lemburJam.toFixed(1)],
      ["Laporan / orang / hari", f1(hasil.lama.laporanPerOrangHari), f1(hasil.uji.laporanPerOrangHari)],
    ]), "Ringkasan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hasil.orang.map((o) => ({
      Nama: o.nama, Minggu: o.minggu, Zona: o.zona, "Hari kerja": o.hari, Ronde: o.ronde, "Hari memenuhi minimal": o.hariPatuh,
      "Penilaian terisi": o.penilaian, "Beban rata-rata (1-5)": o.beban === null ? "" : +o.beban.toFixed(1), "Bantu zona lain": o.bantu,
      "Permintaan diterima": o.permintaanDiterima, "Respon rata-rata (menit)": o.responMenit === null ? "" : +o.responMenit.toFixed(0), "Lembur (jam)": +o.lemburJam.toFixed(1),
    }))), "Per Orang");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(laporan.slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal)).map((l) => ({
      Tanggal: l.tanggal, Jam: l.waktu?.toDate().toLocaleTimeString("id-ID", { timeZone: "Asia/Makassar" }) || "", Nama: l.nama, Zona: l.zona, Minggu: l.minggu,
      Jenis: l.jenis, Area: (l.area || []).join(", "), Beban: l.beban || "", "Bantu zona lain": l.bantu_zona_lain ?? "", "Jam pulang": l.jam_pulang || "",
      Catatan: l.catatan || l.kendala || "", "Foto sebelum": l.foto_sebelum || "", "Foto sesudah": l.foto_sesudah || "",
    }))), "Laporan Harian");
    XLSX.writeFile(wb, `Evaluasi_Pola_Zona_OB_${config.mulai}.xlsx`);
  };

  if (!isReady || !session) return null;

  const statusTeks = !config ? "Belum diatur" : !config.aktif ? "Tidak aktif" : hariIni < config.mulai ? `Terjadwal mulai ${tglIndo(config.mulai)}` : hariIni > config.selesai ? "Selesai" : "Sedang berjalan";
  const warnaKes = { hijau: "var(--ok)", oranye: "var(--warn)", merah: "var(--red-600)" } as const;
  const sel: React.CSSProperties = { padding: "8px 10px", borderTop: "1px solid var(--line)", fontSize: "13px", textAlign: "left" };

  return (
    <AdminShell title="Uji Coba Pola Zona OB" subtitle="Office Boy per zona: Tenant vs Publik — 2 minggu, rotasi minggu ke-2" userName={session.nama} backHref="/admin" backLabel="Control Panel">
      <div className="sa-tabs">
        <button type="button" className={`sa-tab ${tab === "atur" ? "is-active" : ""}`} onClick={() => setTab("atur")}>Pengaturan</button>
        <button type="button" className={`sa-tab ${tab === "evaluasi" ? "is-active" : ""}`} onClick={() => setTab("evaluasi")} disabled={!config}>Evaluasi</button>
      </div>

      {tab === "atur" && (
        <>
          <Tile style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--muted)" }}>Status</div>
                <div style={{ fontSize: "18px", fontWeight: 800 }}>{statusTeks}</div>
                {config && <div style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{tglIndo(config.mulai)} – {tglIndo(config.selesai)} · tukar zona {tglIndo(config.tukar_mulai)}</div>}
              </div>
              {config?.aktif && <button type="button" className="sa-btn is-soft" onClick={hentikan}>Hentikan uji coba</button>}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: "12.5px", color: "var(--muted)" }}>
              Selama berjalan: checklist per lantai & 3 sesi disembunyikan dari staf peserta, potong poin checklist & pengingat sesi lama dilewati, semua permintaan portal tampil di Zona Tenant (Zona Publik sebagai cadangan).
            </p>
          </Tile>

          <Tile style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 10px", fontSize: "16px" }}>Jadwal</h3>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "end" }}>
              <label style={{ fontSize: "12.5px", fontWeight: 700 }}>Mulai (Senin)<br /><input type="date" className="sa-field" value={mulai} onChange={(e) => setMulai(e.target.value)} /></label>
              <label style={{ fontSize: "12.5px", fontWeight: 700 }}>Minimal ronde / hari<br /><input type="number" min={1} className="sa-field" style={{ width: "90px", cursor: "text" }} value={minRonde} onChange={(e) => setMinRonde(e.target.value)} /></label>
              <div style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>Minggu 1: {tglIndo(jadwal.mulai)} – {tglIndo(tambahHari(jadwal.mulai, 4))}<br />Minggu 2 (zona ditukar): {tglIndo(jadwal.tukar_mulai)} – {tglIndo(jadwal.selesai)}</div>
            </div>
          </Tile>

          <Tile style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Pembagian zona minggu 1</h3>
            <div style={{ fontSize: "12.5px", color: "var(--muted)", marginBottom: "10px" }}>Disarankan 2 orang Tenant + 2 orang Publik. Minggu 2 otomatis ditukar.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {staf.map((n) => (
                <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "12px", background: "var(--bg)" }}>
                  <b style={{ fontSize: "13.5px" }}>{n}</b>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {(["Tenant", "Publik", ""] as Pilihan[]).map((p) => (
                      <button key={p || "x"} type="button" className={`sa-btn ${pilihan[n] === p || (!pilihan[n] && !p) ? "is-dark" : "is-soft"}`} style={{ height: "32px", padding: "0 10px" }}
                        onClick={() => setPilihan({ ...pilihan, [n]: p })}>{p || "Tidak ikut"}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "8px", fontSize: "12.5px", fontWeight: 700, color: timTenant.length === 2 && timPublik.length === 2 ? "var(--ok)" : "var(--warn)" }}>
              Tenant: {timTenant.join(", ") || "–"} · Publik: {timPublik.join(", ") || "–"}
            </div>
          </Tile>

          <Tile style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: "16px" }}>Daftar area (1 baris = 1 item centang)</h3>
              <button type="button" className="sa-btn is-soft" onClick={() => void isiAreaBawaan()}>Isi ulang dari Okupansi & SOP</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", marginTop: "10px" }}>
              <label style={{ fontSize: "12.5px", fontWeight: 700 }}>Zona Tenant (semua lantai, semua tenant)
                <textarea className="sa-field" style={{ width: "100%", height: "220px", padding: "10px", cursor: "text", marginTop: "4px" }} value={areaTenant} onChange={(e) => setAreaTenant(e.target.value)} />
              </label>
              <label style={{ fontSize: "12.5px", fontWeight: 700 }}>Zona Publik
                <textarea className="sa-field" style={{ width: "100%", height: "220px", padding: "10px", cursor: "text", marginTop: "4px" }} value={areaPublik} onChange={(e) => setAreaPublik(e.target.value)} />
              </label>
            </div>
          </Tile>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" className="sa-btn is-primary" disabled={simpan} onClick={() => simpanConfig(true)}>{simpan ? "Menyimpan…" : "Simpan & aktifkan uji coba"}</button>
            <button type="button" className="sa-btn is-soft" disabled={simpan} onClick={() => simpanConfig(false)}>Simpan sebagai draf</button>
          </div>
        </>
      )}

      {tab === "evaluasi" && config && hasil && (
        <>
          {muat && <Tile style={{ marginBottom: "16px" }}>Memuat data…</Tile>}
          <Tile style={{ marginBottom: "16px", borderLeft: `6px solid ${warnaKes[hasil.kesimpulan.warna]}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--muted)" }}>Kesimpulan sementara · {hasil.hariBerjalan} dari 10 hari kerja</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: warnaKes[hasil.kesimpulan.warna] }}>{hasil.kesimpulan.judul}</div>
              </div>
              <button type="button" className="sa-btn is-dark" onClick={exportExcel}>Export Excel</button>
            </div>
            <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "13.5px", lineHeight: 1.7 }}>{hasil.kesimpulan.alasan.map((a) => <li key={a}>{a}</li>)}</ul>
          </Tile>

          <Tile style={{ marginBottom: "16px", overflowX: "auto" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "16px" }}>Pola lama vs uji coba</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "460px" }}>
              <thead><tr><th style={sel}>Ukuran</th><th style={sel}>Pola lama<br /><small>{hasil.lama.dari} – {hasil.lama.sampai}</small></th><th style={sel}>Uji coba<br /><small>{hasil.uji.dari} – {hasil.uji.sampai}</small></th></tr></thead>
              <tbody>
                {[
                  ["Hari kerja dibandingkan", hasil.lama.hari, hasil.uji.hari],
                  ["Permintaan portal / hari", f1(hasil.lama.permintaanPerHari), f1(hasil.uji.permintaanPerHari)],
                  ["Respon rata-rata (menit)", f1(hasil.lama.responMenit, 0), f1(hasil.uji.responMenit, 0)],
                  ["Diterima ≤ 10 menit", `${f1(hasil.lama.persenCepat, 0)}%`, `${f1(hasil.uji.persenCepat, 0)}%`],
                  ["Lembur tim (jam)", f1(hasil.lama.lemburJam), f1(hasil.uji.lemburJam)],
                  ["Laporan / orang / hari", `${f1(hasil.lama.laporanPerOrangHari)} sesi (target 3)`, `${f1(hasil.uji.laporanPerOrangHari)} ronde (min ${config.min_ronde})`],
                ].map(([a, b, c]) => <tr key={String(a)}><td style={sel}>{a}</td><td style={sel}>{b}</td><td style={sel}><b>{c}</b></td></tr>)}
              </tbody>
            </table>
            <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "6px" }}>Pola lama diambil dari hari kerja terakhir sebelum uji coba, sebanyak hari uji coba yang sudah berjalan, supaya sebanding.</div>
          </Tile>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "16px" }}>
            {hasil.zona.map((z) => (
              <Tile key={z.zona}>
                <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--muted)" }}>Zona {z.zona}</div>
                <div style={{ fontSize: "26px", fontWeight: 800 }}>{f1(z.beban)}<span style={{ fontSize: "13px", color: "var(--muted)" }}> / 5 beban</span></div>
                <div style={{ fontSize: "13px", color: "var(--ink-soft)", lineHeight: 1.7 }}>
                  {z.beban !== null && <>{LABEL_BEBAN[Math.round(z.beban)]} · </>}{z.penilaian} penilaian<br />
                  Ronde/orang/hari: <b>{f1(z.rondePerOrangHari)}</b> · Permintaan diterima: <b>{z.permintaanDiterima}</b><br />
                  Bantu zona lain: <b>{z.bantu}×</b> · Lembur: <b>{f1(z.lemburJam)} jam</b>
                </div>
              </Tile>
            ))}
          </div>

          <Tile style={{ marginBottom: "16px", overflowX: "auto" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Per orang: minggu 1 vs minggu 2</h3>
            <div style={{ fontSize: "12.5px", color: "var(--muted)", marginBottom: "6px" }}>Karena zona ditukar, beban yang ikut pindah bersama zona = beban karena zonanya; yang tetap tinggi di kedua minggu = karena orangnya.</div>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "720px" }}>
              <thead><tr>{["Nama", "Mg", "Zona", "Ronde", "Hari ≥ min", "Penilaian", "Beban", "Bantu", "Permintaan", "Respon", "Lembur"].map((h) => <th key={h} style={sel}>{h}</th>)}</tr></thead>
              <tbody>
                {hasil.orang.map((o) => (
                  <tr key={`${o.nama}-${o.minggu}`}>
                    <td style={sel}><b>{o.nama}</b></td><td style={sel}>{o.minggu}</td><td style={sel}>{o.zona}</td><td style={sel}>{o.ronde}</td>
                    <td style={{ ...sel, color: o.hariPatuh < o.hari ? "var(--warn)" : "var(--ok)" }}>{o.hariPatuh}/{o.hari}</td>
                    <td style={sel}>{o.penilaian}/{o.hari}</td><td style={sel}><b>{f1(o.beban)}</b></td><td style={sel}>{o.bantu}×</td>
                    <td style={sel}>{o.permintaanDiterima}</td><td style={sel}>{o.responMenit === null ? "–" : `${o.responMenit.toFixed(0)} mnt`}</td><td style={sel}>{f1(o.lemburJam)} j</td>
                  </tr>
                ))}
                {hasil.orang.length === 0 && <tr><td style={sel} colSpan={11}>Belum ada hari uji coba yang berjalan.</td></tr>}
              </tbody>
            </table>
          </Tile>

          <Tile>
            <h3 style={{ margin: "0 0 8px", fontSize: "16px" }}>Kendala dari staf ({hasil.kendala.length})</h3>
            {hasil.kendala.length === 0 ? <div style={{ fontSize: "13px", color: "var(--muted)" }}>Belum ada kendala dilaporkan.</div>
              : hasil.kendala.map((k, i) => (
                <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: "13px" }}>
                  <b>{tglIndo(k.tanggal)} · {k.nama}</b> <span style={{ color: "var(--muted)" }}>(Zona {k.zona})</span><div>{k.teks}</div>
                </div>
              ))}
          </Tile>
        </>
      )}
    </AdminShell>
  );
}
