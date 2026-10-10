"use client";

/**
 * Kinerja Saya (§123, §128 + Security & Driver) -- angka pribadi staf untuk introspeksi: hanya data diri sendiri, tanpa peringkat.
 * Security: shift (roster) dengan patroli >= MINIMUM_SESI_PER_SHIFT sesi + tukar jaga tepat waktu (scan QR <= ambang telat).
 * Driver: inspeksi kendaraan mingguan + perjalanan "Keluar Beroperasi" yang ditutup log berikutnya <= 12 jam.
 * Checklist sesi dihitung sama dengan Beban Kerja (src/app/admin/sla/page.tsx): area plot hari kerja x 3 sesi.
 * Respon pelayanan = waktu_terima - waktu_minta permintaan yang ia terima.
 */

import { useEffect, useState } from "react";
import { collection, documentId, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { rosterUntuk } from "../lib/kehadiranSecurity";
import { AMBANG_TELAT_SERAH_TERIMA_MENIT, MINIMUM_SESI_PER_SHIFT } from "../lib/shift";

const tz = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const norm = (s?: string) => (s || "").trim().toLowerCase();
const f1 = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);

type Nada = "baik" | "cukup" | "kurang" | "kosong";
interface Ukuran { judul: string; nilai: string; target: string; nada: Nada; saran: string }
const WARNA: Record<Nada, { bg: string; fg: string; label: string }> = {
  baik: { bg: "var(--ok-50)", fg: "var(--ok)", label: "Sudah baik" },
  cukup: { bg: "var(--warn-50)", fg: "var(--warn)", label: "Bisa ditingkatkan" },
  kurang: { bg: "var(--red-50)", fg: "var(--red-600)", label: "Perlu perhatian" },
  kosong: { bg: "var(--surface)", fg: "var(--muted)", label: "Belum ada data" },
};

const nadaPct = (p: number, baik: number, cukup: number): Nada => (p >= baik ? "baik" : p >= cukup ? "cukup" : "kurang");
const geserTgl = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Rentang periode (WITA): bulan ini s.d. hari ini, atau bulan lalu penuh. */
function periode(bulanIni: boolean) {
  const hariIni = tz.format(new Date());
  const y = Number(hariIni.slice(0, 4)), m = Number(hariIni.slice(5, 7));
  const awal = new Date(Date.UTC(y, m - 1 - (bulanIni ? 0 : 1), 1));
  const dari = awal.toISOString().slice(0, 10);
  const akhirBulan = new Date(Date.UTC(awal.getUTCFullYear(), awal.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const sampai = bulanIni ? hariIni : akhirBulan;
  const tanggal: string[] = [];
  for (let t = dari; t <= sampai; t = geserTgl(t, 1)) tanggal.push(t);
  return {
    hariIni, dari, sampai, tanggal,
    tsAwal: Timestamp.fromDate(new Date(`${dari}T00:00:00+08:00`)),
    tsAkhir: Timestamp.fromDate(new Date(new Date(`${sampai}T00:00:00+08:00`).getTime() + 86400000)),
  };
}

async function hitungSecurity(nama: string, bulanIni: boolean): Promise<Ukuran[]> {
  const p = periode(bulanIni);
  const [roster, patroli, serah] = await Promise.all([
    rosterUntuk(p.tanggal),
    getDocs(query(collection(db, "security_patrols"), where("petugas", "==", nama))),
    getDocs(query(collection(db, "security_shift_handover"), where("petugas_masuk", "==", nama))),
  ]);
  const sesi: Record<string, Set<string>> = {};
  patroli.docs.forEach((d) => { const x = d.data(); const k = `${x.tanggal_shift}|${x.shift}`; (sesi[k] ||= new Set()).add(String(x.sesi)); });

  // Shift dari roster; shift yang belum berakhir hanya dihitung bila sudah terpenuhi (tidak menghukum shift berjalan)
  const sekarang = Date.now();
  let total = 0, penuh = 0;
  p.tanggal.forEach((tgl) => {
    const label = String(roster[tgl]?.[nama] || Object.entries(roster[tgl] || {}).find(([n]) => norm(n) === norm(nama))?.[1] || "");
    (["Shift 1", "Shift 2"] as const).filter((s) => label.includes(s)).forEach((s) => {
      const selesai = new Date(s === "Shift 1" ? `${tgl}T20:00:00+08:00` : `${geserTgl(tgl, 1)}T08:00:00+08:00`).getTime();
      const ok = (sesi[`${tgl}|${s}`]?.size || 0) >= MINIMUM_SESI_PER_SHIFT;
      if (selesai > sekarang && !ok) return;
      total++; if (ok) penuh++;
    });
  });
  const pctPatroli = total ? Math.round((penuh / total) * 100) : 0;

  const scan = serah.docs.map((d) => d.data()).filter((x) => x.waktu_scan && x.tanggal_shift >= p.dari && x.tanggal_shift <= p.sampai);
  const telat = scan.filter((x) => x.terlambat);
  const pctTepat = scan.length ? Math.round(((scan.length - telat.length) / scan.length) * 100) : 0;
  const rataTelat = telat.length ? telat.reduce((s, x) => s + (Number(x.menit_terlambat) || 0), 0) / telat.length : 0;

  return [
    {
      judul: `Shift dengan patroli ≥ ${MINIMUM_SESI_PER_SHIFT} sesi`, target: "Target ≥ 90% shift",
      nilai: total ? `${pctPatroli}% (${penuh}/${total} shift sesuai roster)` : "—",
      nada: total ? nadaPct(pctPatroli, 90, 70) : "kosong",
      saran: !total ? "Belum ada shift Anda di roster periode ini." : pctPatroli >= 90 ? "Pertahankan — kerjakan patroli di awal tiap sesi." : `Isi patroli minimal ${MINIMUM_SESI_PER_SHIFT} sesi tiap shift; mulai di awal sesi agar tidak terlewat.`,
    },
    {
      judul: "Tukar jaga tepat waktu", target: `Target ≥ 90% · telat > ${AMBANG_TELAT_SERAH_TERIMA_MENIT} menit dihitung terlambat`,
      nilai: scan.length ? `${pctTepat}% (${scan.length - telat.length}/${scan.length} serah terima)${telat.length ? ` · rata-rata telat ${f1(rataTelat)} menit` : ""}` : "—",
      nada: scan.length ? nadaPct(pctTepat, 90, 75) : "kosong",
      saran: !scan.length ? "Belum ada serah terima yang Anda scan di periode ini." : pctTepat >= 90 ? "Tepat waktu — pertahankan datang sebelum jam tukar jaga." : "Datang 10–15 menit sebelum jam tukar jaga dan langsung scan QR rekan yang selesai jaga.",
    },
  ];
}

async function hitungDriver(nama: string, bulanIni: boolean): Promise<Ukuran[]> {
  const p = periode(bulanIni);
  const [inspeksi, log] = await Promise.all([
    getDocs(query(collection(db, "kendaraan_inspeksi_logs"), where("driver", "==", nama))),
    getDocs(query(collection(db, "operational_vehicle_logs"), where("waktu_catat", ">=", p.tsAwal), where("waktu_catat", "<", Timestamp.fromMillis(p.tsAkhir.toMillis() + 86400000)))),
  ]);

  // Inspeksi mingguan: tiap Senin dalam periode; minggu berjalan hanya dihitung bila sudah diisi
  const sudah = new Set(inspeksi.docs.map((d) => String(d.data().minggu_of)));
  const senin = Array.from(new Set(p.tanggal.map((t) => { const d = new Date(`${t}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })));
  const seninIni = senin[senin.length - 1];
  const mingguDihitung = senin.filter((s) => !(bulanIni && s === seninIni && !sudah.has(s)));
  const mingguIsi = mingguDihitung.filter((s) => sudah.has(s)).length;
  const pctInsp = mingguDihitung.length ? Math.round((mingguIsi / mingguDihitung.length) * 100) : 0;

  // Perjalanan: "Keluar Beroperasi" oleh saya ditutup log berikutnya kendaraan yang sama <= 12 jam
  const semua = log.docs.map((d) => d.data()).filter((x) => x.waktu_catat).sort((a, b) => a.waktu_catat.toMillis() - b.waktu_catat.toMillis());
  const BATAS = 12 * 3600000;
  let jalan = 0, tutup = 0;
  semua.forEach((x, i) => {
    if (x.status_kendaraan !== "Keluar Beroperasi" || norm(x.driver_bertugas) !== norm(nama) || x.waktu_catat.toMillis() >= p.tsAkhir.toMillis()) return;
    const berikut = semua.slice(i + 1).find((y) => y.kendaraan === x.kendaraan);
    const jeda = (berikut ? berikut.waktu_catat.toMillis() : Date.now()) - x.waktu_catat.toMillis();
    if (!berikut && jeda <= BATAS) return; // masih berjalan
    jalan++; if (berikut && jeda <= BATAS) tutup++;
  });
  const pctTutup = jalan ? Math.round((tutup / jalan) * 100) : 0;

  return [
    {
      judul: "Inspeksi kendaraan mingguan", target: "Target setiap minggu",
      nilai: mingguDihitung.length ? `${pctInsp}% (${mingguIsi}/${mingguDihitung.length} minggu)` : "—",
      nada: mingguDihitung.length ? nadaPct(pctInsp, 100, 75) : "kosong",
      saran: !mingguDihitung.length ? "Minggu ini belum diinspeksi — isi di menu Inspeksi Mingguan." : pctInsp >= 100 ? "Lengkap — pertahankan inspeksi di awal minggu." : "Isi Inspeksi Mingguan setiap Senin sebelum kendaraan dipakai.",
    },
    {
      judul: "Perjalanan ditutup (status kembali)", target: "Target ≥ 95% · lupa update > 12 jam",
      nilai: jalan ? `${pctTutup}% (${tutup}/${jalan} perjalanan)` : "—",
      nada: jalan ? nadaPct(pctTutup, 95, 80) : "kosong",
      saran: !jalan ? "Belum ada perjalanan tercatat atas nama Anda di periode ini." : pctTutup >= 95 ? "Status selalu diperbarui — pertahankan." : "Tekan Kembali/Standby begitu kendaraan tiba agar armada terlihat tersedia.",
    },
  ];
}

async function hitung(nama: string, bulanIni: boolean, peran: string): Promise<Ukuran[]> {
  const kata = peran === "CS Cleaning" ? "cleaning" : peran === "OB Pelayanan" ? "pelayanan" : "pelayanan & cleaning";
  const hariIni = tz.format(new Date());
  const y = Number(hariIni.slice(0, 4)), m = Number(hariIni.slice(5, 7));
  const awal = new Date(Date.UTC(y, m - 1 - (bulanIni ? 0 : 1), 1));
  const dari = awal.toISOString().slice(0, 10);
  const akhirBulan = new Date(Date.UTC(awal.getUTCFullYear(), awal.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const sampai = bulanIni ? hariIni : akhirBulan;
  const tsAwal = Timestamp.fromDate(new Date(`${dari}T00:00:00+08:00`));
  const tsAkhir = Timestamp.fromDate(new Date(new Date(`${sampai}T00:00:00+08:00`).getTime() + 86400000));

  const [plots, cek, pel] = await Promise.all([
    getDocs(query(collection(db, "daily_plots"), where(documentId(), ">=", dari), where(documentId(), "<=", sampai))),
    getDocs(query(collection(db, "ob_checklists"), where("pic_bertugas", "==", nama))),
    getDocs(query(collection(db, "permintaan_pelayanan"), where("diterima_oleh", "==", nama))).catch(() => null),
  ]);

  // Checklist sesi: hari kerja yang ia diplot x 3 sesi (hari ini cukup yang sudah terisi)
  const terisi = new Set(cek.docs.map((d) => { const x = d.data(); return `${x.tanggal}|${x.area}|${x.sesi}`; }));
  let isi = 0, total = 0;
  const hariPlot = new Set<string>();
  plots.docs.forEach((d) => {
    const hari = new Date(`${d.id}T12:00:00Z`).getUTCDay(); if (hari === 0 || hari === 6) return;
    Object.entries((d.data().plot_lantai || {}) as Record<string, string>).forEach(([area, n]) => {
      if (norm(n) !== norm(nama)) return;
      hariPlot.add(d.id);
      const k = ["Pagi", "Siang", "Sore"].filter((s) => terisi.has(`${d.id}|${area}|${s}`)).length;
      isi += k; total += d.id === hariIni ? k : 3;
    });
  });
  const pctCek = total ? Math.round((isi / total) * 100) : 0;

  // Pelayanan yang ia terima pada periode ini
  const respon = (pel?.docs || []).map((d) => d.data())
    .filter((x) => x.waktu_minta && x.waktu_terima && x.status !== "Batal" && x.waktu_minta.toMillis() >= tsAwal.toMillis() && x.waktu_minta.toMillis() < tsAkhir.toMillis())
    .map((x) => (x.waktu_terima.toMillis() - x.waktu_minta.toMillis()) / 60000);
  const rata = respon.length ? respon.reduce((a, b) => a + b, 0) / respon.length : 0;
  const cepat = respon.filter((r) => r <= 10).length;

  return [
    {
      judul: "Checklist sesi terisi", target: "Target ≥ 90%",
      nilai: total ? `${pctCek}% (${isi}/${total} sesi · ${hariPlot.size} hari diplot)` : "—",
      nada: !total ? "kosong" : pctCek >= 90 ? "baik" : pctCek >= 70 ? "cukup" : "kurang",
      saran: !total ? "Belum ada plotting area untuk Anda di periode ini." : pctCek >= 90 ? "Pertahankan — isi checklist tepat di sesinya." : "Isi checklist di setiap sesi (Pagi, Siang, Sore) begitu area selesai dikerjakan, jangan ditunda ke akhir hari.",
    },
    {
      judul: `Respon permintaan ${kata}`, target: "Target rata-rata ≤ 10 menit",
      nilai: respon.length ? `${f1(rata)} menit rata-rata · ${respon.length} permintaan · ${Math.round((cepat / respon.length) * 100)}% ≤ 10 menit` : "—",
      nada: !respon.length ? "kosong" : rata <= 10 ? "baik" : rata <= 15 ? "cukup" : "kurang",
      saran: !respon.length ? `Belum ada permintaan ${kata} yang Anda terima di periode ini.` : rata <= 10 ? "Respon sudah cepat — tetap tekan Terima begitu permintaan masuk." : "Tekan Terima segera saat notifikasi masuk, walau baru akan dikerjakan beberapa menit lagi.",
    },
  ];
}

export default function KinerjaSayaPanel({ nama, peran = "", departemen = "OB & CS" }: { nama: string; peran?: string; departemen?: "OB & CS" | "Security" | "Driver" }) {
  const [bulanIni, setBulanIni] = useState(true);
  const [data, setData] = useState<Ukuran[] | null>(null);

  useEffect(() => {
    let batal = false;
    (departemen === "Security" ? hitungSecurity(nama, bulanIni) : departemen === "Driver" ? hitungDriver(nama, bulanIni) : hitung(nama, bulanIni, peran)).then((h) => { if (!batal) setData(h); }).catch((e) => { console.error("[kinerja]", e); if (!batal) setData([]); });
    return () => { batal = true; };
  }, [nama, bulanIni, peran, departemen]);

  const sekarang = new Date();
  const labelBulan = (geser: number) => NAMA_BULAN[(sekarang.getMonth() - geser + 12) % 12];
  // OB Pelayanan: respon pelayanan ditampilkan lebih dulu
  const urut = data ? (peran === "OB Pelayanan" ? [...data].reverse() : data) : null;

  return (
    <div style={{ marginBottom: "24px", padding: "16px", borderRadius: "20px", border: "1px solid var(--line)", background: "var(--surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
        <b style={{ fontSize: "16px", color: "var(--ink)" }}>Kinerja Saya</b>
        <div style={{ display: "flex", gap: "6px" }}>
          {[true, false].map((b) => (
            <button key={String(b)} type="button" className={`sa-btn ${bulanIni === b ? "is-primary" : "is-soft"}`} onClick={() => { setData(null); setBulanIni(b); }}>
              {b ? labelBulan(0) : labelBulan(1)}
            </button>
          ))}
        </div>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--muted)" }}>Hanya Anda yang melihat angka ini — bahan evaluasi diri, bukan peringkat.</p>
      {!urut ? (
        <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>Menghitung…</p>
      ) : urut.length === 0 ? (
        <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>Data kinerja belum bisa dimuat.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "10px" }}>
          {urut.map((u) => {
            const w = WARNA[u.nada];
            return (
              <div key={u.judul} style={{ padding: "12px 14px", borderRadius: "14px", background: w.bg, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>{u.judul}</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: w.fg, whiteSpace: "nowrap" }}>{w.label}</span>
                </div>
                <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--ink)" }}>{u.nilai}</span>
                <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>{u.target}</span>
                <span style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{u.saran}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
