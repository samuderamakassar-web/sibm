"use client";

/**
 * Beban Kerja & Kebutuhan Personel (§119) -- 4 penilaian (OB pelayanan, CS cleaning, Driver, Security) + resepsionis.
 * Setiap penilaian: indeks beban = kebutuhan orang / jumlah orang sekarang (100% = pas). Kebutuhan dihitung dari data
 * aplikasi (Okupansi, Master Karyawan, booking ruang meeting, plotting & checklist OB, log armada, roster & patroli,
 * Buku Tamu, paket) dengan asumsi kapasitas di src/lib/sla.ts (bisa diubah -> settings/beban_asumsi).
 */

import { useEffect, useState } from "react";
import { collection, doc, documentId, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import Modal from "../../../components/ui/Modal";
import { ASUMSI_BAWAAN, LABEL_ASUMSI, WARNA_STATUS_BEBAN, statusBeban, type AsumsiBeban } from "../../../lib/sla";
import { menitJenis } from "../../../lib/pelayanan";

const tz = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });
const tzJam = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", hourCycle: "h23" });
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const norm = (s?: string) => (s || "").trim().toLowerCase();
const f1 = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
const AREA_PELAYANAN = "Pelayanan Khusus OB";

interface Penilaian {
  kunci: "OB" | "CS" | "DRIVER" | "SECURITY"; judul: string; sekarang: number; kebutuhan: number;
  dasar: string[]; sinyal: string[]; nama: string[]; dataKurang?: string;
}
interface Resepsionis { tamuPerJam: number; puncak: { jam: string; rata: number } | null; paketPerHari: number; totalTamu: number; dasar: string[] }
interface HasilBeban { penilaian: Penilaian[]; resepsionis: Resepsionis; hariKerja: number }

/** §120 periode = rentang tanggal [dari, sampai] (per bulan, 3 bulan, YTD, 12 bulan). */
export interface Periode { kunci: string; label: string; dari: string; sampai: string }
function daftarPeriode(hariIni: string): Periode[] {
  const y = Number(hariIni.slice(0, 4)), m = Number(hariIni.slice(5, 7));
  const awalBulan = (yy: number, mm: number) => { const d = new Date(Date.UTC(yy, mm - 1, 1)); return d.toISOString().slice(0, 10); };
  const akhirBulan = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const bulan = Array.from({ length: 12 }, (_, k) => { const d = new Date(Date.UTC(y, m - 1 - k, 1)); return { yy: d.getUTCFullYear(), mm: d.getUTCMonth() + 1 }; });
  return [
    { kunci: "YTD", label: `YTD ${y} (Jan – hari ini)`, dari: `${y}-01-01`, sampai: hariIni },
    { kunci: "12BLN", label: "12 bulan terakhir (semua)", dari: awalBulan(bulan[11].yy, bulan[11].mm), sampai: hariIni },
    { kunci: "3BLN", label: "3 bulan terakhir", dari: awalBulan(bulan[2].yy, bulan[2].mm), sampai: hariIni },
    ...bulan.map(({ yy, mm }) => ({ kunci: `${yy}-${String(mm).padStart(2, "0")}`, label: `${NAMA_BULAN[mm - 1]} ${yy}`, dari: awalBulan(yy, mm), sampai: akhirBulan(yy, mm) < hariIni ? akhirBulan(yy, mm) : hariIni })),
  ];
}

async function hitung(p: Periode, hariIni: string, a: AsumsiBeban): Promise<HasilBeban> {
  const dari = p.dari;
  const batas = p.sampai;
  const tsAwal = Timestamp.fromDate(new Date(`${dari}T00:00:00+08:00`));
  const tsAkhir = Timestamp.fromDate(new Date(new Date(`${batas}T00:00:00+08:00`).getTime() + 86400000));
  const cadangan = 1 + a.cadangan_pct / 100;
  const hariKerjaList: string[] = [];
  for (let d = new Date(`${dari}T12:00:00Z`); d.toISOString().slice(0, 10) <= batas; d.setUTCDate(d.getUTCDate() + 1)) {
    const h = d.getUTCDay(); if (h !== 0 && h !== 6) hariKerjaList.push(d.toISOString().slice(0, 10));
  }
  const hariKerja = Math.max(1, hariKerjaList.length);

  const [users, karyawan, okupansi, plots, cek, booking, gerak, roster, patroli, tamu, paket, pelayanan] = await Promise.all([
    getDocs(collection(db, "users_master")),
    getDocs(collection(db, "employees_directory")),
    getDoc(doc(db, "okupansi_gedung", "data")),
    getDocs(query(collection(db, "daily_plots"), where(documentId(), ">=", dari), where(documentId(), "<=", batas))),
    getDocs(query(collection(db, "ob_checklists"), where("tanggal", ">=", dari), where("tanggal", "<=", batas))),
    getDocs(query(collection(db, "booking"), where("mulai", ">=", tsAwal), where("mulai", "<", tsAkhir))),
    getDocs(query(collection(db, "operational_vehicle_logs"), where("waktu_catat", ">=", tsAwal), where("waktu_catat", "<", tsAkhir))),
    // §120 roster semua bulan dalam periode
    Promise.all(Array.from(new Set(Array.from({ length: 13 }, (_, k) => { const d = new Date(`${dari}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); }).filter((b) => b <= batas.slice(0, 7)))).map((b) => getDoc(doc(db, "security_monthly_schedules", b)))),
    getDocs(query(collection(db, "security_patrols"), where("tanggal_shift", ">=", dari), where("tanggal_shift", "<=", batas))),
    getDocs(query(collection(db, "security_visitor_logs"), where("waktu_masuk", ">=", tsAwal), where("waktu_masuk", "<", tsAkhir))),
    getDocs(query(collection(db, "packages"), where("waktu_diterima", ">=", tsAwal), where("waktu_diterima", "<", tsAkhir))).catch(() => null),
    getDocs(query(collection(db, "permintaan_pelayanan"), where("waktu_minta", ">=", tsAwal), where("waktu_minta", "<", tsAkhir))).catch(() => null),
  ]);
  const akun = users.docs.map((d) => d.data() as { nama?: string; departemen?: string; role?: string }).filter((u) => u.nama && !/magang/i.test(u.role || ""));
  const namaDept = (dept: string) => akun.filter((u) => u.departemen === dept).map((u) => String(u.nama).trim());

  // ---------- OB vs CS dari plotting (mayoritas hari di area pelayanan = OB) ----------
  const hariPelayanan: Record<string, number> = {}, hariLantai: Record<string, number> = {};
  const sesiTerisi = new Set(cek.docs.map((d) => { const x = d.data(); return `${norm(x.pic_bertugas)}|${x.tanggal}|${x.area}|${x.sesi}`; }));
  let csSesi = 0, csSesiTotal = 0, obSesi = 0, obSesiTotal = 0;
  plots.docs.forEach((d) => {
    const hari = new Date(`${d.id}T12:00:00Z`).getUTCDay(); if (hari === 0 || hari === 6) return;
    Object.entries((d.data().plot_lantai || {}) as Record<string, string>).forEach(([area, nama]) => {
      if (!nama || nama === "-" || nama === "Semua / All") return;
      const pel = area === AREA_PELAYANAN;
      (pel ? hariPelayanan : hariLantai)[nama.trim()] = ((pel ? hariPelayanan : hariLantai)[nama.trim()] || 0) + 1;
      const isi = ["Pagi", "Siang", "Sore"].filter((s) => sesiTerisi.has(`${norm(nama)}|${d.id}|${area}|${s}`)).length;
      const tot = d.id === hariIni ? isi : 3;
      if (pel) { obSesi += isi; obSesiTotal += tot; } else { csSesi += isi; csSesiTotal += tot; }
    });
  });
  const stafOB = namaDept("OB & CS");
  const namaOB = stafOB.filter((n) => (hariPelayanan[n] || 0) > (hariLantai[n] || 0));
  const namaCS = stafOB.filter((n) => !namaOB.includes(n));
  const pct = (x: number, t: number) => (t ? `${Math.round((x / t) * 100)}%` : "—");

  // ---------- CS: luas dari Okupansi ----------
  const lantai = ((okupansi.data()?.lantai as { nama: string; unit: { nama: string; luas: number; status: string }[] }[]) || []);
  let intensif = 0, ringan = 0, toilet = 0;
  lantai.forEach((l) => (l.unit || []).forEach((u) => {
    const n = u.nama || ""; const luas = Number(u.luas) || 0;
    if (/gudang|pompa|server|rooftop|panel/i.test(n)) return;
    if (/toilet|wc/i.test(n)) { toilet++; intensif += luas; return; }
    if (u.status === "kosong" || /parkir|teras|garden|taman/i.test(n)) ringan += luas; else intensif += luas;
  }));
  const bebanM2 = intensif + ringan * a.cs_bobot_ringan + toilet * a.cs_m2_per_toilet;
  const csPenilaian: Penilaian = {
    kunci: "CS", judul: "CS · Cleaning", sekarang: namaCS.length, nama: namaCS,
    kebutuhan: (bebanM2 / a.cs_m2_per_orang) * cadangan,
    dasar: [
      `Area intensif ${f1(intensif)} m² (kantor tenant, lobby, meeting, pantry, toilet, mushallah)`,
      `Area ringan ${f1(ringan)} m² × bobot ${a.cs_bobot_ringan} (kosong, teras, garden, parkir)`,
      `${toilet} toilet × ${a.cs_m2_per_toilet} m² setara`,
      `Beban setara ${f1(bebanM2)} m² ÷ ${a.cs_m2_per_orang} m²/orang × cadangan ${a.cadangan_pct}%`,
    ],
    sinyal: [`Checklist sesi area lantai terisi ${pct(csSesi, csSesiTotal)} (${csSesi}/${csSesiTotal})`],
    dataKurang: lantai.length ? undefined : "Isi luas lantai di menu Okupansi agar beban CS terhitung.",
  };

  // ---------- OB pelayanan ----------
  const jumlahKaryawan = karyawan.size;
  const meeting = booking.docs.map((d) => d.data()).filter((b) => b.jenis === "ruangan" && b.status !== "dibatalkan" && /meeting/i.test(String(b.objek_id || b.objek_nama || ""))).length;
  const meetingPerHari = meeting / hariKerja;
  // §122 data nyata permintaan pelayanan (bila cukup) -> menit kerja; selain itu perkiraan dari jumlah karyawan
  const perm = (pelayanan?.docs || []).map((d) => d.data()).filter((x) => x.status !== "Batal" && x.waktu_minta);
  const menitPerm = perm.reduce((s, x) => s + menitJenis(x.jenis) + (x.jenis === "minuman" ? Math.max(0, (Number(x.jumlah) || 1) - 1) * 2 : 0), 0);
  const respon = perm.filter((x) => x.waktu_terima).map((x) => (x.waktu_terima.toDate().getTime() - x.waktu_minta.toDate().getTime()) / 60000);
  const pakaiPermintaan = perm.length >= a.ob_min_permintaan;
  const obPenilaian: Penilaian = {
    kunci: "OB", judul: "OB · Pelayanan", sekarang: namaOB.length, nama: namaOB,
    kebutuhan: pakaiPermintaan
      ? ((menitPerm / hariKerja) / a.ob_menit_produktif) * cadangan
      : ((jumlahKaryawan + meetingPerHari * a.ob_karyawan_per_meeting) / a.ob_karyawan_per_orang) * cadangan,
    dasar: pakaiPermintaan ? [
      `DATA NYATA: ${perm.length} permintaan pelayanan (${f1(perm.length / hariKerja)}/hari kerja)`,
      `Total ± ${Math.round(menitPerm)} menit kerja (${f1(menitPerm / hariKerja)} menit/hari) — minuman 10, meeting 25, dokumen 15, bersih 10 menit`,
      `÷ ${a.ob_menit_produktif} menit efektif per OB per hari × cadangan ${a.cadangan_pct}%`,
    ] : [
      `${jumlahKaryawan} karyawan di Master Data`,
      `${meeting} booking ruang meeting (${f1(meetingPerHari)}/hari kerja) × ${a.ob_karyawan_per_meeting} karyawan setara`,
      `÷ ${a.ob_karyawan_per_orang} karyawan per OB × cadangan ${a.cadangan_pct}%`,
      `Perkiraan — data permintaan pelayanan baru ${perm.length} (dipakai setelah ≥ ${a.ob_min_permintaan})`,
    ],
    sinyal: [
      respon.length ? `Respon rata-rata ${f1(respon.reduce((x, y) => x + y, 0) / respon.length)} menit · ${pct(respon.filter((m) => m <= 10).length, respon.length)} direspon ≤ 10 menit` : "",
      `Checklist pelayanan terisi ${pct(obSesi, obSesiTotal)} (${obSesi}/${obSesiTotal})`,
      namaOB.length === 1 ? "Hanya 1 orang: saat cuti/sakit pelayanan berhenti total" : "",
    ].filter(Boolean),
    dataKurang: namaOB.length ? undefined : "Belum ada OB yang diplot di area Pelayanan Khusus OB pada periode ini.",
  };

  // ---------- Driver: jam di jalan dari log armada ----------
  const driverResmi = namaDept("Driver");
  const setDriver = new Set(driverResmi.map(norm));
  const logs = gerak.docs.map((d) => d.data()).filter((x) => x.waktu_catat).map((x) => ({ k: String(x.kendaraan || "").split(" - ")[0], st: String(x.status_kendaraan || ""), drv: String(x.driver_bertugas || "").replace("Standby: ", "").trim(), t: x.waktu_catat.toDate().getTime() }))
    .sort((p, q) => p.t - q.t);
  const perKend: Record<string, typeof logs> = {};
  logs.forEach((l) => (perKend[l.k] ??= []).push(l));
  let jamDriver = 0, tripDriver = 0, tripNonDriver = 0;
  Object.values(perKend).forEach((arr) => arr.forEach((l, i) => {
    if (!/Keluar|Bengkel|Service/i.test(l.st)) return;
    const next = arr[i + 1];
    const jam = Math.min(12, ((next ? next.t : Math.min(Date.now(), l.t + 4 * 3600000)) - l.t) / 3600000);
    if (setDriver.has(norm(l.drv))) { jamDriver += Math.max(0, jam); tripDriver++; } else if (l.drv && l.drv !== "-") tripNonDriver++;
  }));
  const jamPerHari = jamDriver / hariKerja;
  const bookingKend = booking.docs.map((d) => d.data()).filter((b) => b.jenis === "kendaraan" && b.status !== "dibatalkan").length;
  const drvPenilaian: Penilaian = {
    kunci: "DRIVER", judul: "Driver", sekarang: driverResmi.length, nama: driverResmi,
    kebutuhan: (jamPerHari / (a.drv_jam_kerja * a.drv_utilisasi_sehat / 100)) * cadangan,
    dasar: [
      `${tripDriver} perjalanan driver, total ${f1(jamDriver)} jam di jalan (${f1(jamPerHari)} jam/hari kerja)`,
      `÷ (${a.drv_jam_kerja} jam × utilisasi sehat ${a.drv_utilisasi_sehat}%) × cadangan ${a.cadangan_pct}%`,
    ],
    sinyal: [`${tripNonDriver} perjalanan dibawa bukan driver (kebutuhan yang tidak dilayani driver)`, `${bookingKend} booking kendaraan`],
    dataKurang: logs.length ? undefined : "Belum ada log pergerakan armada pada periode ini.",
  };

  // ---------- Security: cakupan pos 24 jam ----------
  const secResmi = namaDept("Security");
  const dataHari: Record<string, Record<string, string>> = {};
  roster.forEach((s) => Object.assign(dataHari, (s.exists() && s.data().data_hari) || {}));
  const sesiP: Record<string, number> = {};
  patroli.docs.forEach((d) => { const x = d.data(); if (x.sesi) { const k = `${norm(x.petugas)}|${x.tanggal_shift}|${x.shift}`; sesiP[k] = (sesiP[k] || 0) | (1 << ["Sesi 1", "Sesi 2", "Sesi 3"].indexOf(x.sesi)); } });
  const bit = (n: number) => [1, 2, 4].filter((b) => n & b).length;
  let s1 = 0, s1t = 0, s2 = 0, s2t = 0;
  const namaRoster = new Set<string>();
  Object.entries(dataHari).forEach(([tgl, perNama]) => {
    if (tgl >= hariIni || tgl < dari || tgl > batas) return;
    Object.entries(perNama || {}).forEach(([nama, label]) => {
      const sh = String(label).includes("Shift 1") ? "Shift 1" : String(label).includes("Shift 2") ? "Shift 2" : null;
      if (!sh) return; namaRoster.add(nama.trim());
      const ok = bit(sesiP[`${norm(nama)}|${tgl}|${sh}`] || 0) >= 2 ? 1 : 0;
      if (sh === "Shift 1") { s1 += ok; s1t++; } else { s2 += ok; s2t++; }
    });
  });
  const jumlahSec = Math.max(secResmi.length, namaRoster.size);
  const jamPos = 168 * a.sec_pos;
  const jamPerOrang = jumlahSec ? jamPos / jumlahSec : 0;
  const lemburMinggu = Math.max(0, jamPerOrang - a.sec_jam_normal);
  const secPenilaian: Penilaian = {
    kunci: "SECURITY", judul: "Security", sekarang: jumlahSec, nama: secResmi.length >= namaRoster.size ? secResmi : Array.from(namaRoster),
    kebutuhan: jamPos / (a.sec_jam_normal + a.sec_lembur_wajar),
    dasar: [
      `${a.sec_pos} pos × 24 jam × 7 hari = ${jamPos} jam/minggu harus terisi`,
      `÷ (${a.sec_jam_normal} jam normal UU + ${a.sec_lembur_wajar} jam lembur rutin wajar) per orang — sisa batas legal untuk menutup cuti/sakit`,
      jumlahSec ? `Dengan ${jumlahSec} orang: ${f1(jamPerOrang)} jam/orang/minggu → lembur ${f1(lemburMinggu)} jam/minggu (batas ${a.sec_batas_lembur})` : "Belum ada data jumlah petugas",
    ],
    sinyal: [`Patroli ≥2 sesi: Shift 1 ${pct(s1, s1t)} · Shift 2 ${pct(s2, s2t)}`, lemburMinggu > a.sec_batas_lembur ? "Lembur rutin MELEWATI batas legal 18 jam/minggu" : lemburMinggu > a.sec_batas_lembur - 4 ? "Lembur rutin mepet batas legal — cuti/sakit membuat lewat batas" : ""].filter(Boolean),
  };

  // ---------- Resepsionis: tamu jam sibuk ----------
  const perJam: Record<string, number> = {};
  let tamuSibuk = 0, totalTamu = 0;
  tamu.docs.forEach((d) => {
    const x = d.data(); if (x.jenis === "Karyawan" || !x.waktu_masuk) return;
    const t = x.waktu_masuk.toDate(); const tgl = tz.format(t); if (!hariKerjaList.includes(tgl)) return;
    totalTamu++;
    const j = Number(tzJam.format(t)); if (j >= 9 && j < 17) { tamuSibuk++; perJam[`${String(j).padStart(2, "0")}:00`] = (perJam[`${String(j).padStart(2, "0")}:00`] || 0) + 1; }
  });
  const puncakEntri = Object.entries(perJam).sort((p, q) => q[1] - p[1])[0];
  const resepsionis: Resepsionis = {
    tamuPerJam: tamuSibuk / (hariKerja * 8), totalTamu,
    puncak: puncakEntri ? { jam: puncakEntri[0], rata: puncakEntri[1] / hariKerja } : null,
    paketPerHari: (paket?.size || 0) / hariKerja,
    dasar: [`${totalTamu} tamu hari kerja (${tamuSibuk} pada 09:00–17:00)`, `Batas: ${a.res_tamu_per_jam} tamu/jam rata-rata jam sibuk → perlu petugas khusus`],
  };
  return { penilaian: [obPenilaian, csPenilaian, drvPenilaian, secPenilaian], resepsionis, hariKerja };
}

function KartuPenilaian({ p }: { p: Penilaian }) {
  const indeks = p.sekarang ? (p.kebutuhan / p.sekarang) * 100 : p.kebutuhan > 0 ? 999 : 0;
  const st = statusBeban(indeks);
  const w = WARNA_STATUS_BEBAN[st];
  const butuh = Math.ceil(p.kebutuhan - 0.15); // toleransi 0.15 orang
  const tambah = Math.max(0, butuh - p.sekarang);
  const rekom = p.dataKurang ? "Data belum cukup" : tambah > 0 ? `Perlu tambah ${tambah} ${p.kunci === "SECURITY" ? "Security" : p.kunci === "DRIVER" ? "Driver" : p.kunci}` : st === "Padat" ? `Pertimbangkan +1 ${p.kunci === "SECURITY" ? "Security" : p.kunci === "DRIVER" ? "Driver" : p.kunci}` : "Tidak perlu tambahan";
  return (
    <Tile>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>{p.judul}</h3>
        <span style={{ fontSize: "11.5px", fontWeight: 800, padding: "3px 10px", borderRadius: "999px", color: "#fff", background: w }}>{st}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "10px 0 6px" }}>
        <b style={{ fontSize: "34px", color: w, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{indeks > 500 ? "—" : `${Math.round(indeks)}%`}</b>
        <span style={{ fontSize: "12.5px", color: "var(--muted)" }}>beban · butuh <b style={{ color: "var(--ink)" }}>{f1(p.kebutuhan)}</b> orang, ada <b style={{ color: "var(--ink)" }}>{p.sekarang}</b></span>
      </div>
      <div style={{ height: "8px", borderRadius: "4px", background: "var(--line)", overflow: "hidden" }}><div style={{ width: `${Math.min(100, indeks / 1.5)}%`, height: "100%", background: w }} /></div>
      <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "12px", background: "var(--bg)", fontWeight: 800, fontSize: "14px", color: tambah > 0 ? "var(--red-600)" : st === "Padat" ? "var(--warn)" : "var(--ok)" }}>{rekom}</div>
      {p.dataKurang && <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--warn)", fontWeight: 700 }}>⚠ {p.dataKurang}</div>}
      <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--ink-soft)" }}>
        <div style={{ fontWeight: 800, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: ".04em" }}>Dasar perhitungan</div>
        {p.dasar.map((d) => <div key={d}>· {d}</div>)}
        {p.sinyal.length > 0 && <div style={{ fontWeight: 800, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: ".04em", marginTop: "6px" }}>Sinyal pendukung</div>}
        {p.sinyal.map((d) => <div key={d}>· {d}</div>)}
        {p.nama.length > 0 && <div style={{ marginTop: "6px", color: "var(--muted)" }}>Personel: {p.nama.join(", ")}</div>}
      </div>
    </Tile>
  );
}

export default function BebanKerjaPage() {
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const hariIni = tz.format(new Date());
  const periodeList = daftarPeriode(hariIni);
  const [kunciPeriode, setKunciPeriode] = useState("YTD");
  const periode = periodeList.find((p) => p.kunci === kunciPeriode) || periodeList[0];
  const [asumsi, setAsumsi] = useState<AsumsiBeban>(ASUMSI_BAWAAN);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [hasil, setHasil] = useState<HasilBeban | null>(null);

  useEffect(() => {
    if (!isReady) return;
    return onSnapshot(doc(db, "settings", "beban_asumsi"), (s) => setAsumsi({ ...ASUMSI_BAWAAN, ...((s.data()?.asumsi as Partial<AsumsiBeban>) || {}) }));
  }, [isReady]);
  useEffect(() => {
    if (!isReady) return;
    let batal = false;
    hitung(periode, hariIni, asumsi).then((h) => { if (!batal) setHasil(h); }).catch((e) => { console.error("[beban]", e); showToast("Gagal menghitung beban kerja.", "error"); });
    return () => { batal = true; setHasil(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- periode ditentukan oleh kunciPeriode
  }, [isReady, kunciPeriode, hariIni, asumsi, showToast]);

  if (!isReady) return null;
  const simpan = async () => {
    if (!edit) return;
    const baru = Object.fromEntries(Object.keys(ASUMSI_BAWAAN).map((k) => [k, Number(edit[k]) > 0 ? Number(edit[k]) : ASUMSI_BAWAAN[k as keyof AsumsiBeban]])) as unknown as AsumsiBeban;
    try { await setDoc(doc(db, "settings", "beban_asumsi"), { asumsi: baru, diperbarui_oleh: session?.nama || "-", diperbarui_pada: serverTimestamp() }); setEdit(null); showToast("Asumsi tersimpan.", "success"); }
    catch (e) { console.error(e); showToast("Gagal menyimpan asumsi.", "error"); }
  };

  const kesimpulan = (hasil?.penilaian || []).map((p) => {
    const tambah = Math.max(0, Math.ceil(p.kebutuhan - 0.15) - p.sekarang);
    const idx = p.sekarang ? (p.kebutuhan / p.sekarang) * 100 : 0;
    return { p, tambah, padat: statusBeban(idx) === "Padat" };
  });
  const r = hasil?.resepsionis;
  const perluResepsionis = !!r && (r.tamuPerJam >= asumsi.res_tamu_per_jam || (r.puncak?.rata || 0) >= asumsi.res_tamu_per_jam * 2);

  return (
    <AdminShell title="Beban Kerja & Kebutuhan Personel" subtitle="Seberapa sibuk tim OB, CS, Driver & Security — dasar keputusan tambah personel" userName={session?.nama || "Admin"}
      actions={<div style={{ display: "flex", gap: "6px" }}>
        <select className="sa-field" value={kunciPeriode} onChange={(e) => setKunciPeriode(e.target.value)} aria-label="Periode">
          <optgroup label="Rentang">{periodeList.slice(0, 3).map((p) => <option key={p.kunci} value={p.kunci}>{p.label}</option>)}</optgroup>
          <optgroup label="Per bulan">{periodeList.slice(3).map((p) => <option key={p.kunci} value={p.kunci}>{p.label}</option>)}</optgroup>
        </select>
        <button type="button" className="sa-btn is-soft" onClick={() => setEdit(Object.fromEntries(Object.entries(asumsi).map(([k, v]) => [k, String(v)])))}>Atur asumsi</button>
      </div>}>
      {hasil === null ? <Tile><div style={{ textAlign: "center", color: "var(--muted)", padding: "24px" }}>Menghitung beban kerja…</div></Tile> : (
        <>
          <Tile style={{ marginBottom: "14px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 800 }}>Kesimpulan {periode.label} <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>· {hasil.hariKerja} hari kerja dihitung ({periode.dari.split("-").reverse().join("/")} – {periode.sampai.split("-").reverse().join("/")})</span></h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13.5px" }}>
              {kesimpulan.map(({ p, tambah, padat }) => (
                <div key={p.kunci}>{p.dataKurang ? "⚪" : tambah > 0 ? "🔴" : padat ? "🟠" : "🟢"} <b>{p.judul}</b>: {p.dataKurang ? "data belum cukup" : tambah > 0 ? `perlu tambah ${tambah} orang` : padat ? "padat — pertimbangkan tambahan bila bertahan 2–3 bulan" : "cukup, tidak perlu tambahan"}</div>
              ))}
              {r && <div>{perluResepsionis ? "🟠" : "🟢"} <b>Resepsionis</b>: {perluResepsionis ? "volume tamu jam sibuk tinggi — perlu resepsionis khusus (tetap), jangan dibebankan ke Security" : "volume tamu masih bisa ditangani magang/Security, belum perlu resepsionis tetap"}</div>}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Indeks beban = kebutuhan ÷ jumlah sekarang (100% = pas). Longgar &lt; 70% · Seimbang 70–100% · Padat 100–120% · Kelebihan beban &gt; 120%. Kapasitas per orang = asumsi standar industri (bisa diubah), bukan aturan Disnaker; batas jam kerja & lembur mengikuti UU/PP 35/2021. Gunakan bulan penuh & lihat 2–3 bulan sebelum memutuskan.</p>
          </Tile>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "14px", alignItems: "start" }}>
            {hasil.penilaian.map((p) => <KartuPenilaian key={p.kunci} p={p} />)}
            {r && (
              <Tile>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>Resepsionis · Lobby</h3>
                  <span style={{ fontSize: "11.5px", fontWeight: 800, padding: "3px 10px", borderRadius: "999px", color: "#fff", background: perluResepsionis ? "var(--warn)" : "var(--ok)" }}>{perluResepsionis ? "Perlu" : "Cukup"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "10px 0 6px" }}>
                  <b style={{ fontSize: "34px", color: perluResepsionis ? "var(--warn)" : "var(--ok)", lineHeight: 1 }}>{f1(r.tamuPerJam)}</b>
                  <span style={{ fontSize: "12.5px", color: "var(--muted)" }}>tamu/jam rata-rata 09:00–17:00{r.puncak ? ` · puncak ${r.puncak.jam} (${f1(r.puncak.rata)}/hari)` : ""}</span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--ink-soft)" }}>
                  {r.dasar.map((d) => <div key={d}>· {d}</div>)}
                  <div>· {f1(r.paketPerHari)} paket/hari kerja diterima di lobby</div>
                  <div style={{ marginTop: "6px", color: "var(--muted)" }}>Saat ini jam kerja dibantu magang resepsionis. Bila perlu, rekomendasi = resepsionis tetap (bukan tambah Security) agar Security tetap bisa patroli.</div>
                </div>
              </Tile>
            )}
          </div>
        </>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} maxWidth="520px">
        {edit && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>Asumsi kapasitas</h3>
            <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--muted)" }}>Angka standar industri yang bisa disesuaikan dengan kondisi gedung. Jam normal 40 & batas lembur 18 mengikuti aturan.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "60vh", overflowY: "auto" }}>
              {(Object.keys(ASUMSI_BAWAAN) as (keyof AsumsiBeban)[]).map((k) => (
                <label key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 80px", gap: "8px", alignItems: "center", fontSize: "12.5px" }}>
                  <span>{LABEL_ASUMSI[k]} <span style={{ color: "var(--muted)" }}>(bawaan {ASUMSI_BAWAAN[k]})</span></span>
                  <input inputMode="decimal" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value.replace(/[^\d.]/g, "") })} style={{ padding: "7px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", textAlign: "center" }} />
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <button type="button" className="sa-btn is-soft" style={{ flex: 1 }} onClick={() => setEdit(null)}>Batal</button>
              <button type="button" className="sa-btn is-primary" style={{ flex: 1 }} onClick={simpan}>Simpan</button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
