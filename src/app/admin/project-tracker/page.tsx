"use client";

/**
 * Project Tracker BM (§107, dirombak §162) -- program kerja gedung untuk laporan ke atasan.
 * Koleksi project_tracker (1 koleksi, dibedakan field `tipe`):
 *   config/config  { lokasi[], kategori[], pic[], user[], lokasi_gedung, tahapan[]{nama,bobot,parsial} }
 *   tipe "target"  { kode, lokasi, target, kategori, user, ukuran_sukses, deadline, status, progress_est,
 *                    tahapan[]{nama,bobot,parsial,rencana,selesai,pct,catatan}, frekuensi_rencana, realisasi[]{tanggal,catatan},
 *                    riwayat[]{tanggal,oleh,isi}, kendala, (lama: catatan, kuartal[]) }
 *   tipe "task"    { kode, task, target_id, pic, due, priority, status, progress, keterangan }
 *   tipe "review"  { minggu (Senin), selesai, tidak_selesai, blocker, komitmen, refleksi, oleh }
 * §162 SATU angka progres per target, dihitung sistem:
 *   PROJECT  -> 9 tahapan baku perusahaan (Survey ... BAST) dengan bobot tetap; Pelaksanaan boleh parsial.
 *   Rutin    -> frekuensi: terlaksana ÷ rencana per tahun.
 *   Status   -> otomatis dari progres vs tanggal rencana (At Risk bila ada tahap lewat rencana / deadline lewat).
 * Target lama yang belum dipetakan tetap memakai progress_est & status manual sampai dipetakan.
 * §163 VHR (sebelum PO) opsional: boleh dilewati dengan alasan. Tab Task Mingguan disembunyikan (data tetap, ikut Export).
 * Admin GA mengisi; Eksekutif Tenant melihat ringkasan target lokasi gedung (§108).
 */

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import Modal from "../../../components/ui/Modal";
import { daerahTulis } from "../../../lib/daerah";
import {
  KONFIG_BAWAAN, STATUS_TARGET, WARNA_STATUS, TAHAPAN_BAWAAN, TAHAPAN_BAWAAN_LAMA, sidikTahapan,
  metodeProgres, progressTarget, rencanaTarget, statusOtomatis, tahapSekarang, tahapTerlambat, tahapanBaru,
  type KonfigTracker, type TargetLengkap, type TaskPT, type ReviewPT, type StatusTarget, type TahapDef, type MetodeProgres,
} from "../../../lib/projectTracker";

const KOL = "project_tracker";
const hariIni = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
const seninMingguIni = () => {
  const d = new Date(`${hariIni()}T12:00:00+08:00`);
  const geser = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - geser);
  return d.toISOString().slice(0, 10);
};
const fmtTgl = (iso?: string) => (iso ? new Date(`${iso}T12:00:00+08:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
const singkatan = (lokasi: string) => lokasi.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "BM";
const TARGET_KOSONG: TargetLengkap = { id: "", kode: "", lokasi: "", target: "", kategori: "PROJECT", user: "BM", ukuran_sukses: "Pekerjaan selesai / BAST", deadline: "", status: "Not Started", catatan: "", progress_est: 0, kuartal: [], tahapan: [], frekuensi_rencana: 0, realisasi: [], riwayat: [], kendala: "" };
const LABEL_STATUS: Record<StatusTarget, string> = { "Not Started": "Belum mulai", "On Track": "Sesuai rencana", "In Progress": "Berjalan", "At Risk": "Terlambat", Done: "Selesai", Cancelled: "Dibatalkan" };
const LABEL_METODE: Record<MetodeProgres, string> = { tahapan: "Tahapan project", frekuensi: "Frekuensi (rutin)", manual: "Manual (lama)" };

function Pill({ teks, warna }: { teks: string; warna: { bg: string; fg: string } }) {
  return <span style={{ display: "inline-block", fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "999px", background: warna.bg, color: warna.fg, whiteSpace: "nowrap" }}>{teks}</span>;
}
/** Bar realisasi + penanda garis posisi rencana. */
function BarProgres({ real, rencana, besar = false }: { real: number; rencana: number | null; besar?: boolean }) {
  const telat = rencana !== null && real + 0.5 < rencana;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "130px" }}>
      <div style={{ position: "relative", flex: 1, height: besar ? "10px" : "7px", borderRadius: "5px", background: "var(--line)" }}>
        <div style={{ width: `${Math.min(100, real)}%`, height: "100%", borderRadius: "5px", background: telat ? "var(--red-600)" : real >= 99.5 ? "var(--ok-solid, var(--ok))" : "var(--info-solid, var(--info))" }} />
        {rencana !== null && <div title={`Rencana ${Math.round(rencana)}%`} style={{ position: "absolute", top: "-3px", bottom: "-3px", left: `calc(${Math.min(100, rencana)}% - 1px)`, width: "2px", background: "var(--ink)" }} />}
      </div>
      <span style={{ fontSize: besar ? "15px" : "12px", fontWeight: 800, fontVariantNumeric: "tabular-nums", width: besar ? "44px" : "36px", textAlign: "right" }}>{Math.round(real)}%</span>
    </div>
  );
}
/** Deret tahapan: hijau selesai, biru berjalan, merah lewat rencana, abu belum. */
function Stepper({ t, hari }: { t: TargetLengkap; hari: string }) {
  if (metodeProgres(t) !== "tahapan") return null;
  const kini = tahapSekarang(t);
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {t.tahapan!.map((s, i) => {
        if (s.dilewati) return <span key={i} title={`${i + 1}. ${s.nama} — dilewati: ${s.alasan_lewati || "-"}`} style={{ flex: s.bobot || 1, height: "6px", borderRadius: "3px", border: "1px dashed var(--muted)", boxSizing: "border-box" }} />;
        const telat = !s.selesai && s.rencana && s.rencana < hari;
        const w = s.selesai ? "var(--ok)" : telat ? "var(--red-600)" : s === kini ? "var(--info)" : "var(--line)";
        return <span key={i} title={`${i + 1}. ${s.nama}${s.selesai ? ` — selesai ${fmtTgl(s.selesai)}` : s.rencana ? ` — rencana ${fmtTgl(s.rencana)}` : ""}${s.parsial && !s.selesai && s.pct ? ` (${s.pct}%)` : ""}`} style={{ flex: s.bobot || 1, height: "6px", borderRadius: "3px", background: w, opacity: s === kini && !s.selesai && !telat ? 0.75 : 1 }} />;
      })}
    </div>
  );
}
function EditorDaftar({ judul, nilai, onUbah }: { judul: string; nilai: string[]; onUbah: (v: string[]) => void }) {
  const [baru, setBaru] = useState("");
  return (
    <div>
      <div className="pt-lbl">{judul}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "6px" }}>
        {nilai.map((v) => (
          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 6px 4px 10px", borderRadius: "999px", background: "var(--bg)", border: "1px solid var(--line)", fontSize: "12px", fontWeight: 700 }}>
            {v}<button type="button" aria-label={`Hapus ${v}`} onClick={() => onUbah(nilai.filter((x) => x !== v))} style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: "13px" }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <input className="pt-in" value={baru} onChange={(e) => setBaru(e.target.value)} placeholder={`Tambah ${judul.toLowerCase()}`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (baru.trim() && !nilai.includes(baru.trim())) onUbah([...nilai, baru.trim()]); setBaru(""); } }} />
        <button type="button" className="sa-btn is-soft" onClick={() => { if (baru.trim() && !nilai.includes(baru.trim())) onUbah([...nilai, baru.trim()]); setBaru(""); }}>+</button>
      </div>
    </div>
  );
}
function EditorTahapan({ nilai, onSimpan }: { nilai: TahapDef[]; onSimpan: (v: TahapDef[]) => void }) {
  const [draf, setDraf] = useState<TahapDef[]>(nilai);
  const total = draf.reduce((a, s) => a + (Number(s.bobot) || 0), 0);
  const ubah = (i: number, p: Partial<TahapDef>) => setDraf(draf.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const geser = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= draf.length) return; const b = [...draf]; [b[i], b[j]] = [b[j], b[i]]; setDraf(b); };
  return (
    <div>
      <div className="pt-lbl">Tahapan project & bobot (%)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {draf.map((s, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 70px auto auto auto", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--muted)" }}>{i + 1}.</span>
            <input className="pt-in" value={s.nama} onChange={(e) => ubah(i, { nama: e.target.value })} aria-label={`Nama tahap ${i + 1}`} />
            <input className="pt-in" inputMode="numeric" value={s.bobot} onChange={(e) => ubah(i, { bobot: Number(e.target.value.replace(/\D/g, "")) || 0 })} aria-label={`Bobot tahap ${i + 1}`} />
            <label style={{ fontSize: "11.5px", display: "flex", gap: "4px", alignItems: "center", whiteSpace: "nowrap" }}><input type="checkbox" checked={!!s.parsial} onChange={(e) => ubah(i, { parsial: e.target.checked })} />bisa %</label>
            <label style={{ fontSize: "11.5px", display: "flex", gap: "4px", alignItems: "center", whiteSpace: "nowrap" }} title="Boleh dilewati dengan alasan"><input type="checkbox" checked={!!s.opsional} onChange={(e) => ubah(i, { opsional: e.target.checked })} />opsional</label>
            <span style={{ display: "flex", gap: "2px" }}>
              <button type="button" className="pt-chip" style={{ padding: "4px 8px" }} onClick={() => geser(i, -1)} aria-label="Naik">↑</button>
              <button type="button" className="pt-chip" style={{ padding: "4px 8px" }} onClick={() => setDraf(draf.filter((_, j) => j !== i))} aria-label="Hapus">×</button>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px", flexWrap: "wrap" }}>
        <button type="button" className="sa-btn is-soft" onClick={() => setDraf([...draf, { nama: "Tahap baru", bobot: 0 }])}>+ Tahap</button>
        <span style={{ fontSize: "12.5px", fontWeight: 800, color: total === 100 ? "var(--ok)" : "var(--red-600)" }}>Total bobot {total}%{total !== 100 ? " (harus 100)" : ""}</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="sa-btn is-soft" onClick={() => setDraf(TAHAPAN_BAWAAN.map((s) => ({ ...s })))}>Kembalikan bawaan</button>
        <button type="button" className="sa-btn is-primary" disabled={total !== 100 || draf.some((s) => !s.nama.trim())} onClick={() => onSimpan(draf.map((s) => ({ ...s, nama: s.nama.trim() })))}>Simpan tahapan</button>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Berlaku untuk target baru / target yang baru dipetakan. Target yang sudah ada tetap memakai bobot saat dibuat; buka targetnya lalu klik «Pakai tahapan terbaru» untuk menyesuaikan. Tahap opsional (mis. VHR) boleh dilewati dengan alasan & tidak dihitung.</p>
    </div>
  );
}

export default function ProjectTrackerPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA / BM." });
  const [tab, setTab] = useState<"TARGET" | "PRESENTASI" | "REVIEW" | "SETTING">("TARGET");
  const [konfig, setKonfig] = useState<KonfigTracker>(KONFIG_BAWAAN);
  const [targets, setTargets] = useState<TargetLengkap[]>([]);
  const [tasks, setTasks] = useState<TaskPT[]>([]);
  const [reviews, setReviews] = useState<ReviewPT[]>([]);
  const [filterLokasi, setFilterLokasi] = useState("Semua");
  const [filterStatus, setFilterStatus] = useState("Semua");
  const [cari, setCari] = useState("");
  const [formTarget, setFormTarget] = useState<TargetLengkap | null>(null);
  const [asliTarget, setAsliTarget] = useState<TargetLengkap | null>(null);
  const [updateBaru, setUpdateBaru] = useState("");
  const [realBaru, setRealBaru] = useState({ tanggal: "", catatan: "" });
  const [formReview, setFormReview] = useState<ReviewPT | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    const unsub = onSnapshot(collection(db, KOL), (s) => {
      const t: TargetLengkap[] = []; const k: TaskPT[] = []; const r: ReviewPT[] = [];
      s.docs.forEach((d) => {
        const x = { id: d.id, ...d.data() } as Record<string, unknown> & { id: string; tipe?: string };
        if (d.id === "config") setKonfig({ ...KONFIG_BAWAAN, ...(d.data() as Partial<KonfigTracker>) });
        else if (x.tipe === "target") t.push(x as unknown as TargetLengkap);
        else if (x.tipe === "task") k.push(x as unknown as TaskPT);
        else if (x.tipe === "review") r.push(x as unknown as ReviewPT);
      });
      t.sort((a, b) => a.kode.localeCompare(b.kode));
      k.sort((a, b) => b.kode.localeCompare(a.kode, undefined, { numeric: true }));
      r.sort((a, b) => b.minggu.localeCompare(a.minggu));
      setTargets(t); setTasks(k); setReviews(r);
    }, (e) => console.error("[tracker]", e));
    return () => unsub();
  }, [isReady]);

  if (!isReady) return null;

  const hari = hariIni();
  const tahapanKonfig = konfig.tahapan?.length && sidikTahapan(konfig.tahapan) !== TAHAPAN_BAWAAN_LAMA ? konfig.tahapan : TAHAPAN_BAWAAN;
  const st = (t: TargetLengkap) => statusOtomatis(t, hari);
  const targetPerId = new Map(targets.map((t) => [t.id, t]));
  const aktifLokasi = targets.filter((t) => filterLokasi === "Semua" || t.lokasi === filterLokasi);
  const targetTampil = aktifLokasi.filter((t) => (filterStatus === "Semua" || st(t) === filterStatus)
    && (!cari.trim() || `${t.kode} ${t.target} ${t.catatan || ""} ${t.kendala || ""}`.toLowerCase().includes(cari.toLowerCase())));
  const lokasiDipakai = Array.from(new Set([...konfig.lokasi, ...targets.map((t) => t.lokasi).filter(Boolean)]));
  const hitung = (s: StatusTarget) => aktifLokasi.filter((t) => st(t) === s).length;
  const berjalan = aktifLokasi.filter((t) => st(t) !== "Cancelled");
  const rataReal = berjalan.length ? berjalan.reduce((a, t) => a + progressTarget(t), 0) / berjalan.length : 0;
  const denganRencana = berjalan.filter((t) => rencanaTarget(t, hari) !== null);
  const rataRencana = denganRencana.length ? denganRencana.reduce((a, t) => a + (rencanaTarget(t, hari) || 0), 0) / denganRencana.length : null;
  const updateTerakhir = (t: TargetLengkap) => (t.riwayat?.length ? t.riwayat[t.riwayat.length - 1] : null);
  const ketTahap = (t: TargetLengkap) => {
    const m = metodeProgres(t);
    if (m === "frekuensi") return `${t.realisasi?.length || 0} dari ${t.frekuensi_rencana}× terlaksana`;
    if (m === "manual") return "Belum dipetakan ke tahapan";
    const s = tahapSekarang(t);
    if (!s) return "Semua tahap selesai";
    const i = t.tahapan!.indexOf(s);
    return `Tahap ${i + 1}/${t.tahapan!.length}: ${s.nama}${s.parsial && s.pct ? ` (${s.pct}%)` : ""}${s.rencana ? ` · rencana ${fmtTgl(s.rencana)}` : ""}`;
  };

  // ---------- simpan ----------
  const simpan = async (id: string, data: Record<string, unknown>, pesan: string) => {
    setMenyimpan(true);
    try {
      const isi = { ...data, daerah: daerahTulis(), diperbarui_oleh: session?.nama || "-", diperbarui_pada: serverTimestamp() };
      if (id) await setDoc(doc(db, KOL, id), isi, { merge: true });
      else await addDoc(collection(db, KOL), { ...isi, dibuat_pada: serverTimestamp() });
      showToast(pesan, "success");
      return true;
    } catch (e) { console.error(e); showToast("Gagal menyimpan.", "error"); return false; }
    finally { setMenyimpan(false); }
  };
  const hapus = async (id: string, nama: string, after: () => void) => {
    if (!(await confirm({ title: "Hapus", message: `Hapus "${nama}"?`, confirmText: "Hapus", variant: "danger" }))) return;
    try { await deleteDoc(doc(db, KOL, id)); after(); showToast("Dihapus.", "success"); } catch (e) { console.error(e); showToast("Gagal menghapus.", "error"); }
  };
  const kodeTargetBaru = (lokasi: string) => {
    const pre = singkatan(lokasi);
    const n = targets.filter((t) => t.kode.startsWith(`${pre}-`)).map((t) => Number(t.kode.split("-").pop()) || 0);
    return `${pre}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(4, "0")}`;
  };

  const bukaTarget = (t: TargetLengkap) => {
    const salin: TargetLengkap = { ...TARGET_KOSONG, ...t, tahapan: (t.tahapan || []).map((s) => ({ ...s })), realisasi: [...(t.realisasi || [])], riwayat: [...(t.riwayat || [])] };
    setFormTarget(salin); setAsliTarget(t); setUpdateBaru(""); setRealBaru({ tanggal: hari, catatan: "" });
  };
  const targetBaru = () => {
    setFormTarget({ ...TARGET_KOSONG, lokasi: filterLokasi !== "Semua" ? filterLokasi : konfig.lokasi_gedung || "", deadline: `${hari.slice(0, 4)}-12-31`, tahapan: tahapanBaru(tahapanKonfig), realisasi: [], riwayat: [] });
    setAsliTarget(null); setUpdateBaru(""); setRealBaru({ tanggal: hari, catatan: "" });
  };
  const gantiMetode = (m: MetodeProgres) => {
    if (!formTarget) return;
    if (m === "tahapan") setFormTarget({ ...formTarget, tahapan: formTarget.tahapan?.length ? formTarget.tahapan : tahapanBaru(tahapanKonfig) });
    else if (m === "frekuensi") setFormTarget({ ...formTarget, tahapan: [], frekuensi_rencana: formTarget.frekuensi_rencana || 4 });
    else setFormTarget({ ...formTarget, tahapan: [], frekuensi_rencana: 0 });
  };
  const ubahTahap = (i: number, p: Partial<NonNullable<TargetLengkap["tahapan"]>[number]>) => {
    if (!formTarget) return;
    setFormTarget({ ...formTarget, tahapan: formTarget.tahapan!.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  };
  // Cepat untuk memetakan target lama: semua tahap sebelum tahap terpilih ditandai selesai
  const sampaiTahap = (idx: number) => {
    if (!formTarget) return;
    setFormTarget({ ...formTarget, tahapan: formTarget.tahapan!.map((s, j) => (s.dilewati ? s : j < idx ? { ...s, selesai: s.selesai || hari } : { ...s, selesai: "" })) });
  };
  // §163 samakan tahapan target dengan Pengaturan terbaru (data tahap yang namanya sama dipertahankan)
  const pakaiTahapanTerbaru = () => {
    if (!formTarget) return;
    const lama = new Map((formTarget.tahapan || []).map((s) => [s.nama, s]));
    setFormTarget({ ...formTarget, tahapan: tahapanBaru(tahapanKonfig).map((s) => { const x = lama.get(s.nama); return x ? { ...s, rencana: x.rencana, selesai: x.selesai, pct: x.pct || 0, catatan: x.catatan || "", dilewati: !!x.dilewati && !!s.opsional, alasan_lewati: x.alasan_lewati || "" } : s; }) });
    showToast("Tahapan diperbarui — cek tahap baru (mis. VHR), lalu Simpan.", "info");
  };

  const simpanTarget = async () => {
    const f = formTarget;
    if (!f) return;
    if (!f.target.trim() || !f.lokasi) return showToast("Isi lokasi & target.", "warning");
    if (!f.deadline) return showToast("Isi deadline.", "warning");
    const m = metodeProgres(f);
    if (m === "manual" && f.kategori === "PROJECT" && !asliTarget) return showToast("Target PROJECT baru wajib memakai tahapan.", "warning");
    const statusBaru = f.status === "Cancelled" ? "Cancelled" : m === "manual" ? f.status : statusOtomatis({ ...f, status: "Not Started" }, hari);
    if (m === "tahapan" && f.tahapan!.some((s) => s.dilewati && !s.alasan_lewati?.trim())) return showToast("Isi alasan untuk tahap yang dilewati.", "warning");
    if (statusBaru === "At Risk" && !f.kendala?.trim()) return showToast("Target terlambat — isi Kendala (akan tampil saat presentasi).", "warning");
    // riwayat otomatis: tahap yang baru selesai + update manual
    const oleh = session?.nama || "-";
    const riwayat = [...(f.riwayat || [])];
    if (m === "tahapan") {
      const lama = new Map((asliTarget?.tahapan || []).map((s) => [s.nama, s]));
      f.tahapan!.forEach((s) => {
        if (s.selesai && !lama.get(s.nama)?.selesai && asliTarget?.tahapan?.length) riwayat.push({ tanggal: s.selesai, oleh, isi: `✓ ${s.nama} selesai${s.catatan ? ` (${s.catatan})` : ""}` });
        if (s.dilewati && !lama.get(s.nama)?.dilewati && asliTarget?.tahapan?.length) riwayat.push({ tanggal: hari, oleh, isi: `↷ ${s.nama} dilewati: ${(s.alasan_lewati || "").trim()}` });
      });
    }
    if (updateBaru.trim()) riwayat.push({ tanggal: hari, oleh, isi: updateBaru.trim() });
    const { id, ...isi } = f;
    const data = {
      ...isi, tipe: "target", kode: isi.kode.trim() || kodeTargetBaru(isi.lokasi), target: isi.target.trim(), kendala: (isi.kendala || "").trim(),
      status: statusBaru, progress_est: Math.round(progressTarget({ ...f, status: statusBaru })), riwayat,
      tahapan: m === "tahapan" ? f.tahapan : [], frekuensi_rencana: m === "frekuensi" ? f.frekuensi_rencana : 0,
    };
    if (await simpan(id, data, "Target tersimpan.")) setFormTarget(null);
  };

  const simpanReview = async () => {
    if (!formReview) return;
    if (!formReview.minggu || !formReview.selesai.trim()) return showToast("Isi minggu & yang selesai minggu ini.", "warning");
    const { id, ...isi } = formReview;
    if (await simpan(id, { ...isi, tipe: "review", oleh: isi.oleh || session?.nama || "-" }, "Review tersimpan.")) setFormReview(null);
  };
  const simpanKonfig = (k: KonfigTracker) => { setKonfig(k); simpan("config", { ...k }, "Pengaturan tersimpan."); };
  const ekspor = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Target ID", "Lokasi", "Target", "Kategori", "User", "Ukuran Sukses", "Deadline", "Cara Hitung", "Posisi Sekarang", "Rencana (%)", "Realisasi (%)", "Status", "Kendala", "Update Terakhir"],
      ...targets.map((t) => {
        const r = rencanaTarget(t, hari); const u = updateTerakhir(t);
        return [t.kode, t.lokasi, t.target, t.kategori, t.user, t.ukuran_sukses, t.deadline, LABEL_METODE[metodeProgres(t)], ketTahap(t), r === null ? "" : Math.round(r), Math.round(progressTarget(t)), LABEL_STATUS[st(t)], t.kendala || "", u ? `${u.tanggal} ${u.isi}` : t.catatan || ""];
      }),
    ]), "Target");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Target ID", "Target", "No", "Tahap", "Bobot (%)", "Rencana", "Selesai", "Progres tahap (%)", "Catatan"],
      ...targets.flatMap((t) => (t.tahapan || []).map((s, i) => [t.kode, t.target, i + 1, s.nama, s.bobot, s.dilewati ? "" : s.rencana, s.dilewati ? "Dilewati" : s.selesai, s.dilewati ? "" : s.selesai ? 100 : s.parsial ? s.pct || 0 : 0, s.dilewati ? `Dilewati: ${s.alasan_lewati || "-"}` : s.catatan || ""])),
    ]), "Tahapan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Target ID", "Target", "Tanggal", "Oleh", "Update"],
      ...targets.flatMap((t) => (t.riwayat || []).map((u) => [t.kode, t.target, u.tanggal, u.oleh, u.isi])),
    ]), "Riwayat Update");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Task ID", "Task", "Target ID", "Target", "Lokasi", "PIC", "Due Date", "Priority", "Status", "Progress (%)", "Keterangan"],
      ...tasks.map((k) => [k.kode, k.task, targetPerId.get(k.target_id)?.kode || "", targetPerId.get(k.target_id)?.target || "", targetPerId.get(k.target_id)?.lokasi || "", k.pic, k.due, k.priority, k.status, k.progress, k.keterangan]),
    ]), "Weekly Task");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Minggu (Senin)", "Yang Selesai", "Tidak Selesai (& Kenapa)", "Blocker / Eskalasi", "Komitmen Minggu Depan", "Refleksi", "Oleh"],
      ...reviews.map((r) => [r.minggu, r.selesai, r.tidak_selesai, r.blocker, r.komitmen, r.refleksi, r.oleh]),
    ]), "Weekly Review");
    XLSX.writeFile(wb, `BM_Project_Tracker_${hari}.xlsx`);
  };


  const f = formTarget;
  const mForm = f ? metodeProgres(f) : "manual";
  const statusForm = f ? (f.status === "Cancelled" ? "Cancelled" : mForm === "manual" ? f.status : statusOtomatis({ ...f, status: "Not Started" }, hari)) : "Not Started";

  return (
    <AdminShell title="Project Tracker" subtitle="Program kerja gedung — progres dihitung dari tahapan, status otomatis dari rencana" userName={session?.nama || "Admin"}
      actions={<button type="button" className="sa-btn is-soft" onClick={ekspor}>Export Excel</button>}>
      <style dangerouslySetInnerHTML={{ __html: `
        .pt-tabel { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 900px; }
        .pt-tabel th { text-align: left; padding: 9px 10px; background: var(--bg); color: var(--ink-soft); font-size: 11.5px; font-weight: 800; border-bottom: 1px solid var(--line); white-space: nowrap; }
        .pt-tabel td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
        .pt-tabel tbody tr { cursor: pointer; }
        .pt-tabel tbody tr:hover td { background: var(--bg); }
        .pt-in { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 13px; font-family: inherit; box-sizing: border-box; min-width: 0; }
        .pt-lbl { display: block; font-size: 11.5px; font-weight: 800; color: var(--ink-soft); margin-bottom: 4px; }
        .pt-board { display: grid; grid-template-columns: repeat(5, minmax(220px, 1fr)); gap: 10px; overflow-x: auto; padding-bottom: 6px; }
        .pt-kol { background: var(--bg); border-radius: 14px; padding: 10px; min-height: 120px; }
        .pt-kartu { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px; margin-top: 8px; cursor: pointer; }
        .pt-kartu:hover { border-color: var(--ink-soft); }
        .pt-chip { border: 1px solid var(--line); background: var(--bg); color: var(--ink-soft); border-radius: 999px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .pt-chip.is-on { background: var(--ink); color: var(--surface); border-color: transparent; }
        .pt-tahap { display: grid; grid-template-columns: 24px minmax(0,1fr) 128px 128px; gap: 6px; align-items: center; padding: 8px; border-radius: 10px; border: 1px solid var(--line); }
        .pt-tahap.is-done { background: var(--ok-50); border-color: transparent; }
        .pt-tahap.is-late { border-color: var(--red-600); }
        .pt-presentasi { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
        .pt-slide { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; break-inside: avoid; }
        @media (max-width: 640px) { .pt-tahap { grid-template-columns: 24px minmax(0,1fr); } .pt-tahap > .pt-tahap-tgl { grid-column: 2; } }
        @media print { .pt-noprint { display: none !important; } .pt-presentasi { grid-template-columns: 1fr 1fr; } .pt-slide { border-color: #ccc; } }
      ` }} />

      <div className="sa-tabs" role="tablist" aria-label="Bagian project tracker" style={{ width: "fit-content", maxWidth: "100%", marginBottom: "14px", overflowX: "auto" }}>
        {([["TARGET", `Target (${targets.length})`], ["PRESENTASI", "Presentasi"], ["REVIEW", "Review Mingguan"], ["SETTING", "Pengaturan"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sa-tab${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab !== "SETTING" && tab !== "REVIEW" && (
        <div className="pt-noprint">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginBottom: "12px" }}>
            {(["Not Started", "On Track", "At Risk", "Done"] as StatusTarget[]).map((s) => (
              <button key={s} type="button" onClick={() => { setFilterStatus(filterStatus === s ? "Semua" : s); }} style={{ textAlign: "left", padding: "10px 12px", borderRadius: "14px", border: `1px solid ${filterStatus === s ? WARNA_STATUS[s].fg : "var(--line)"}`, background: "var(--surface)", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ fontSize: "22px", fontWeight: 800, color: WARNA_STATUS[s].fg }}>{hitung(s)}</div>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--ink-soft)" }}>{LABEL_STATUS[s]}</div>
              </button>
            ))}
            <div style={{ padding: "10px 12px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--surface)" }}>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink)" }}>{Math.round(rataReal)}%{rataRencana !== null && <span style={{ fontSize: "13px", color: "var(--muted)", fontWeight: 700 }}> / {Math.round(rataRencana)}%</span>}</div>
              <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--ink-soft)" }}>Realisasi / rencana rata-rata</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            <select className="pt-in" style={{ width: "220px" }} value={filterLokasi} onChange={(e) => setFilterLokasi(e.target.value)} aria-label="Filter lokasi aset">
              <option value="Semua">Semua lokasi</option>
              {lokasiDipakai.map((l) => <option key={l} value={l}>{l} ({targets.filter((t) => t.lokasi === l).length})</option>)}
            </select>
            {filterStatus !== "Semua" && <button type="button" className="pt-chip is-on" onClick={() => setFilterStatus("Semua")}>Status: {LABEL_STATUS[filterStatus as StatusTarget] || filterStatus} ×</button>}
            <input className="pt-in" style={{ width: "240px" }} placeholder="Cari target / kendala..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari" />
            <div style={{ flex: 1 }} />
            {tab === "PRESENTASI" && <button type="button" className="sa-btn is-soft" onClick={() => window.print()}>Cetak / PDF</button>}
            <button type="button" className="sa-btn is-primary" onClick={targetBaru}>+ Target</button>
          </div>
        </div>
      )}

      {/* ============ TARGET ============ */}
      {tab === "TARGET" && (
        <Tile>
          {targetTampil.length === 0 ? <div style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>{targets.length ? "Tidak ada target pada filter ini." : "Belum ada target. Mulai dari + Target."}</div> : (
            <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
              <table className="pt-tabel">
                <thead><tr><th>ID</th><th>Target</th><th>Posisi sekarang</th><th>Deadline</th><th>Status</th><th>Progres (│ = rencana)</th></tr></thead>
                <tbody>
                  {targetTampil.map((t) => {
                    const s = st(t); const u = updateTerakhir(t);
                    return (
                      <tr key={t.id} onClick={() => bukaTarget(t)}>
                        <td style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{t.kode}<div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)" }}>{t.kategori}</div></td>
                        <td style={{ minWidth: "240px" }}>
                          <div style={{ fontWeight: 700, color: "var(--ink)" }}>{t.target}</div>
                          <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{t.lokasi} · {t.user}</div>
                          {u && <div style={{ fontSize: "11.5px", color: "var(--ink-soft)", marginTop: "3px" }}>{fmtTgl(u.tanggal)}: {u.isi}</div>}
                          {!u && t.catatan && <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "3px" }}>{t.catatan}</div>}
                        </td>
                        <td style={{ minWidth: "220px" }}>
                          <div style={{ fontSize: "12px", color: "var(--ink)", marginBottom: "6px" }}>{ketTahap(t)}</div>
                          <Stepper t={t} hari={hari} />
                          {s === "At Risk" && t.kendala && <div style={{ fontSize: "11.5px", color: "var(--red-600)", marginTop: "5px", fontWeight: 700 }}>Kendala: {t.kendala}</div>}
                        </td>
                        <td style={{ whiteSpace: "nowrap", color: t.deadline && t.deadline < hari && s !== "Done" ? "var(--red-600)" : "inherit" }}>{fmtTgl(t.deadline)}</td>
                        <td><Pill teks={LABEL_STATUS[s]} warna={WARNA_STATUS[s]} /></td>
                        <td><BarProgres real={progressTarget(t)} rencana={rencanaTarget(t, hari)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ margin: "8px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Progres = jumlah bobot tahap yang selesai (PROJECT) atau terlaksana ÷ rencana (rutin). Garis hitam = posisi yang seharusnya sudah dicapai hari ini menurut tanggal rencana. Klik baris untuk update.</p>
        </Tile>
      )}

      {/* ============ PRESENTASI ============ */}
      {tab === "PRESENTASI" && (
        <div>
          <Tile style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>Program Kerja Building Management {hari.slice(0, 4)}</h2>
                <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>{filterLokasi === "Semua" ? "Semua lokasi" : filterLokasi} · per {fmtTgl(hari)}</div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {(["Done", "On Track", "At Risk", "Not Started"] as StatusTarget[]).map((s) => hitung(s) > 0 && <Pill key={s} teks={`${hitung(s)} ${LABEL_STATUS[s]}`} warna={WARNA_STATUS[s]} />)}
              </div>
            </div>
            <div style={{ marginTop: "12px", maxWidth: "520px" }}>
              <div style={{ fontSize: "12px", color: "var(--ink-soft)", fontWeight: 700, marginBottom: "4px" }}>Rata-rata realisasi{rataRencana !== null ? ` (rencana ${Math.round(rataRencana)}%)` : ""}</div>
              <BarProgres real={rataReal} rencana={rataRencana} besar />
            </div>
          </Tile>
          <div className="pt-presentasi">
            {targetTampil.filter((t) => st(t) !== "Cancelled").map((t) => {
              const s = st(t); const r = rencanaTarget(t, hari); const kini = tahapSekarang(t);
              const riw = (t.riwayat || []).slice(-3).reverse();
              const telat = tahapTerlambat(t, hari);
              return (
                <div key={t.id} className="pt-slide">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 700 }}>{t.kode} · {t.kategori} · deadline {fmtTgl(t.deadline)}</div>
                      <div style={{ fontSize: "15.5px", fontWeight: 800, color: "var(--ink)", marginTop: "2px" }}>{t.target}</div>
                    </div>
                    <Pill teks={LABEL_STATUS[s]} warna={WARNA_STATUS[s]} />
                  </div>
                  <div style={{ marginTop: "12px" }}><BarProgres real={progressTarget(t)} rencana={r} besar /></div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "3px" }}>Realisasi {Math.round(progressTarget(t))}%{r !== null ? ` · rencana ${Math.round(r)}%` : ""}</div>
                  {metodeProgres(t) === "tahapan" && (
                    <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      {t.tahapan!.map((x, i) => {
                        if (x.dilewati) return <div key={i} style={{ display: "flex", gap: "6px", fontSize: "12px", color: "var(--muted)" }}><span style={{ width: "16px" }}>↷</span><span style={{ flex: 1 }}>{x.nama} <i>dilewati — {x.alasan_lewati || "-"}</i></span></div>;
                        const lewat = !x.selesai && x.rencana && x.rencana < hari;
                        return (
                          <div key={i} style={{ display: "flex", gap: "6px", fontSize: "12px", color: x.selesai ? "var(--ink-soft)" : x === kini ? "var(--ink)" : "var(--muted)", fontWeight: x === kini ? 800 : 500 }}>
                            <span style={{ width: "16px", color: x.selesai ? "var(--ok)" : lewat ? "var(--red-600)" : "inherit" }}>{x.selesai ? "✓" : x === kini ? "▶" : "○"}</span>
                            <span style={{ flex: 1 }}>{x.nama}{x.parsial && !x.selesai && x.pct ? ` (${x.pct}%)` : ""}</span>
                            <span style={{ color: lewat ? "var(--red-600)" : "inherit" }}>{x.selesai ? fmtTgl(x.selesai) : x.rencana ? `rencana ${fmtTgl(x.rencana)}` : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {metodeProgres(t) !== "tahapan" && <div style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--ink)" }}>{ketTahap(t)}</div>}
                  {(s === "At Risk" || t.kendala) && (
                    <div style={{ marginTop: "10px", padding: "8px 10px", borderRadius: "10px", background: "var(--red-50)", fontSize: "12px", color: "var(--ink)" }}>
                      <b style={{ color: "var(--red-600)" }}>Kendala:</b> {t.kendala || "-"}{telat.length ? ` · terlambat di ${telat.map((x) => x.nama).join(", ")}` : ""}
                    </div>
                  )}
                  {riw.length > 0 && (
                    <div style={{ marginTop: "10px", fontSize: "11.5px", color: "var(--ink-soft)" }}>
                      {riw.map((u, i) => <div key={i}><b>{fmtTgl(u.tanggal)}</b> — {u.isi}</div>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ REVIEW MINGGUAN ============ */}
      {tab === "REVIEW" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)" }}>Weekly check-in 30 menit: progres, blocker, komitmen minggu depan. Update minimal 1× per minggu.</p>
            <button type="button" className="sa-btn is-primary" onClick={() => setFormReview(reviews.find((r) => r.minggu === seninMingguIni()) ? { ...reviews.find((r) => r.minggu === seninMingguIni())! } : { id: "", minggu: seninMingguIni(), selesai: "", tidak_selesai: "", blocker: "", komitmen: "", refleksi: "", oleh: "" })}>Review minggu ini</button>
          </div>
          {reviews.length === 0 ? <Tile><div style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>Belum ada review.</div></Tile> : reviews.map((r) => (
            <Tile key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                <b style={{ fontSize: "14px" }}>Minggu {fmtTgl(r.minggu)}</b>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>{r.oleh} · <button type="button" className="sa-btn is-soft" style={{ height: "28px", fontSize: "11.5px" }} onClick={() => setFormReview({ ...r })}>Edit</button></span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", fontSize: "12.5px" }}>
                {([["Yang selesai", r.selesai, "var(--ok)"], ["Tidak selesai (& kenapa)", r.tidak_selesai, "var(--warn)"], ["Blocker / eskalasi", r.blocker, "var(--red-600)"], ["Komitmen minggu depan", r.komitmen, "var(--info)"], ["Refleksi", r.refleksi, "var(--ink-soft)"]] as const).filter(([, v]) => v).map(([l, v, w]) => (
                  <div key={l}><div style={{ fontSize: "11px", fontWeight: 800, color: w, textTransform: "uppercase", letterSpacing: ".03em" }}>{l}</div><div style={{ whiteSpace: "pre-wrap", color: "var(--ink)" }}>{v}</div></div>
                ))}
              </div>
            </Tile>
          ))}
        </div>
      )}

      {/* ============ PENGATURAN ============ */}
      {tab === "SETTING" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Tile>
            <EditorTahapan key={JSON.stringify(tahapanKonfig)} nilai={tahapanKonfig} onSimpan={(v) => simpanKonfig({ ...konfig, tahapan: v })} />
          </Tile>
          <Tile>
            <h2 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 800 }}>Konfigurasi dropdown</h2>
            <p style={{ margin: "0 0 14px", fontSize: "12.5px", color: "var(--muted)" }}>Pusat pilihan dropdown. Perubahan langsung tersimpan.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "18px" }}>
              <EditorDaftar judul="Lokasi Aset" nilai={konfig.lokasi} onUbah={(v) => simpanKonfig({ ...konfig, lokasi: v })} />
              <EditorDaftar judul="Kategori" nilai={konfig.kategori} onUbah={(v) => simpanKonfig({ ...konfig, kategori: v })} />
              <EditorDaftar judul="PIC" nilai={konfig.pic} onUbah={(v) => simpanKonfig({ ...konfig, pic: v })} />
              <EditorDaftar judul="User" nilai={konfig.user} onUbah={(v) => simpanKonfig({ ...konfig, user: v })} />
            </div>
            <label style={{ display: "block", marginTop: "18px", maxWidth: "360px" }}>
              <span className="pt-lbl">Lokasi gedung ini (yang ditampilkan ke Eksekutif Tenant)</span>
              <select className="pt-in" value={konfig.lokasi_gedung || ""} onChange={(e) => simpanKonfig({ ...konfig, lokasi_gedung: e.target.value })}>
                <option value="">— Pilih lokasi —</option>
                {konfig.lokasi.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <p style={{ margin: "14px 0 0", fontSize: "12px", color: "var(--muted)" }}>Status target dihitung otomatis ({STATUS_TARGET.filter((s) => s !== "In Progress").map((s) => LABEL_STATUS[s]).join(" · ")}).</p>
          </Tile>
        </div>
      )}

      {/* ============ MODAL TARGET ============ */}
      <Modal open={!!f} onClose={() => !menyimpan && setFormTarget(null)} maxWidth="760px">
        {f && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", color: "var(--ink)" }}>{f.id ? `Update ${f.kode}` : "Target baru"}</h3>
              <Pill teks={LABEL_STATUS[statusForm]} warna={WARNA_STATUS[statusForm]} />
            </div>
            <label style={{ display: "block" }}><span className="pt-lbl">Target * (1 target = 1 pekerjaan)</span><input className="pt-in" value={f.target} onChange={(e) => setFormTarget({ ...f, target: e.target.value })} placeholder="Mis. Pengadaan fire alarm system" /></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginTop: "10px" }}>
              <label><span className="pt-lbl">Lokasi aset *</span><select className="pt-in" value={f.lokasi} onChange={(e) => setFormTarget({ ...f, lokasi: e.target.value })}><option value="">Pilih...</option>{lokasiDipakai.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
              <label><span className="pt-lbl">Target ID</span><input className="pt-in" value={f.kode} onChange={(e) => setFormTarget({ ...f, kode: e.target.value.toUpperCase() })} placeholder={f.lokasi ? `otomatis: ${kodeTargetBaru(f.lokasi)}` : "otomatis"} /></label>
              <label><span className="pt-lbl">Deadline *</span><input type="date" className="pt-in" value={f.deadline} onChange={(e) => setFormTarget({ ...f, deadline: e.target.value })} /></label>
              <label><span className="pt-lbl">Kategori</span><select className="pt-in" value={f.kategori} onChange={(e) => { const k = e.target.value; const baru = { ...f, kategori: k }; if (!f.id && k === "PROJECT") baru.tahapan = f.tahapan?.length ? f.tahapan : tahapanBaru(tahapanKonfig); if (!f.id && k !== "PROJECT") { baru.tahapan = []; baru.frekuensi_rencana = f.frekuensi_rencana || 4; } setFormTarget(baru); }}>{konfig.kategori.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label><span className="pt-lbl">User</span><select className="pt-in" value={f.user} onChange={(e) => setFormTarget({ ...f, user: e.target.value })}>{konfig.user.map((k) => <option key={k}>{k}</option>)}</select></label>
            </div>
            <label style={{ display: "block", marginTop: "10px" }}><span className="pt-lbl">Ukuran sukses</span><input className="pt-in" value={f.ukuran_sukses} onChange={(e) => setFormTarget({ ...f, ukuran_sukses: e.target.value })} /></label>

            <div style={{ marginTop: "14px", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <span className="pt-lbl" style={{ margin: 0 }}>Cara hitung progres:</span>
              {(["tahapan", "frekuensi", "manual"] as MetodeProgres[]).filter((m) => m !== "manual" || mForm === "manual").map((m) => (
                <button key={m} type="button" className={`pt-chip${mForm === m ? " is-on" : ""}`} onClick={() => gantiMetode(m)}>{LABEL_METODE[m]}</button>
              ))}
            </div>

            {mForm === "manual" && (
              <div style={{ marginTop: "10px", padding: "12px", borderRadius: "12px", background: "var(--warn-50)", fontSize: "12.5px", color: "var(--ink)" }}>
                Target lama ini belum dipetakan — progres & status masih diisi manual. Klik <b>Tahapan project</b> (pekerjaan pengadaan/instalasi) atau <b>Frekuensi</b> (pekerjaan rutin) agar angkanya dihitung sistem.
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginTop: "10px" }}>
                  <label><span className="pt-lbl">Status (manual)</span><select className="pt-in" value={f.status} onChange={(e) => setFormTarget({ ...f, status: e.target.value as StatusTarget })}>{STATUS_TARGET.map((k) => <option key={k} value={k}>{LABEL_STATUS[k]}</option>)}</select></label>
                  <label><span className="pt-lbl">Progres (manual)</span><select className="pt-in" value={f.progress_est} onChange={(e) => setFormTarget({ ...f, progress_est: Number(e.target.value) })}>{[0, 25, 50, 75, 100].map((p) => <option key={p} value={p}>{p}%</option>)}</select></label>
                </div>
              </div>
            )}

            {mForm === "tahapan" && (
              <div style={{ marginTop: "10px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>Isi cepat — sekarang sedang di tahap:</span>
                  <select className="pt-in" style={{ width: "auto" }} value="" onChange={(e) => e.target.value !== "" && sampaiTahap(Number(e.target.value))} aria-label="Sedang di tahap">
                    <option value="">pilih…</option>
                    {f.tahapan!.map((s, i) => !s.dilewati && <option key={i} value={i}>{i + 1}. {s.nama}</option>)}
                    <option value={f.tahapan!.length}>Semua selesai</option>
                  </select>
                  {sidikTahapan(f.tahapan!) !== sidikTahapan(tahapanKonfig) && <button type="button" className="pt-chip" onClick={pakaiTahapanTerbaru}>Pakai tahapan terbaru ({tahapanKonfig.length} tahap)</button>}
                  <div style={{ flex: 1 }} />
                  <BarProgres real={progressTarget(f)} rencana={rencanaTarget(f, hari)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {f.tahapan!.map((s, i) => {
                    const lewat = !s.selesai && !s.dilewati && s.rencana && s.rencana < hari;
                    if (s.dilewati) {
                      return (
                        <div key={i} className="pt-tahap" style={{ borderStyle: "dashed", gridTemplateColumns: "24px minmax(0,1fr)" }}>
                          <span style={{ color: "var(--muted)", textAlign: "center" }}>↷</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink-soft)" }}>{i + 1}. {s.nama} <span style={{ fontSize: "11px", fontWeight: 600 }}>· dilewati, tidak dihitung</span></span>
                              <button type="button" className="pt-chip" style={{ padding: "3px 9px", fontSize: "11.5px" }} onClick={() => ubahTahap(i, { dilewati: false, alasan_lewati: "" })}>Batal lewati</button>
                            </div>
                            <input className="pt-in" style={{ padding: "4px 8px", fontSize: "12px", marginTop: "4px", borderColor: s.alasan_lewati?.trim() ? undefined : "var(--red-600)" }} value={s.alasan_lewati || ""} onChange={(e) => ubahTahap(i, { alasan_lewati: e.target.value })} placeholder="Alasan dilewati * (mis. vendor existing, nilai di bawah batas)" />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={i} className={`pt-tahap${s.selesai ? " is-done" : ""}${lewat ? " is-late" : ""}`}>
                        <input type="checkbox" checked={!!s.selesai} onChange={(e) => ubahTahap(i, { selesai: e.target.checked ? hari : "" })} aria-label={`${s.nama} selesai`} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>{i + 1}. {s.nama} <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>· {s.bobot}%{s.opsional ? " · opsional" : ""}</span>{lewat && <span style={{ fontSize: "11px", color: "var(--red-600)", fontWeight: 800 }}> · lewat rencana</span>}
                            {s.opsional && !s.selesai && <button type="button" className="pt-chip" style={{ padding: "2px 8px", fontSize: "11px", marginLeft: "6px" }} onClick={() => ubahTahap(i, { dilewati: true, rencana: "", pct: 0 })}>Lewati</button>}
                          </div>
                          <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                            {s.parsial && !s.selesai && (
                              <select className="pt-in" style={{ width: "auto", padding: "4px 6px", fontSize: "12px" }} value={s.pct || 0} onChange={(e) => ubahTahap(i, { pct: Number(e.target.value) })} aria-label={`Progres ${s.nama}`}>
                                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((p) => <option key={p} value={p}>{p}% berjalan</option>)}
                              </select>
                            )}
                            <input className="pt-in" style={{ padding: "4px 8px", fontSize: "12px" }} value={s.catatan || ""} onChange={(e) => ubahTahap(i, { catatan: e.target.value })} placeholder="No. CER / PO / vendor / catatan" />
                          </div>
                        </div>
                        <label className="pt-tahap-tgl" style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--muted)" }}>Rencana<input type="date" className="pt-in" style={{ padding: "4px 6px", fontSize: "12px" }} value={s.rencana} onChange={(e) => ubahTahap(i, { rencana: e.target.value })} /></label>
                        <label className="pt-tahap-tgl" style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--muted)" }}>Selesai<input type="date" className="pt-in" style={{ padding: "4px 6px", fontSize: "12px" }} value={s.selesai} max={hari} onChange={(e) => ubahTahap(i, { selesai: e.target.value })} /></label>
                      </div>
                    );
                  })}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Isi <b>tanggal rencana</b> tiap tahap sekali di awal — dari situ sistem tahu apakah target sesuai rencana atau terlambat. Centang tahap saat selesai.</p>
              </div>
            )}

            {mForm === "frekuensi" && (
              <div style={{ marginTop: "10px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label style={{ width: "160px" }}><span className="pt-lbl">Rencana per tahun (kali)</span><input className="pt-in" inputMode="numeric" value={f.frekuensi_rencana || ""} onChange={(e) => setFormTarget({ ...f, frekuensi_rencana: Number(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="mis. 4" /></label>
                  <div style={{ flex: 1, minWidth: "180px" }}><BarProgres real={progressTarget(f)} rencana={rencanaTarget(f, hari)} /></div>
                </div>
                <div className="pt-lbl" style={{ marginTop: "10px" }}>Realisasi ({f.realisasi?.length || 0} dari {f.frekuensi_rencana || 0})</div>
                {(f.realisasi || []).map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <b style={{ whiteSpace: "nowrap" }}>{i + 1}. {fmtTgl(r.tanggal)}</b><span style={{ flex: 1, color: "var(--ink-soft)" }}>{r.catatan}</span>
                    <button type="button" className="pt-chip" style={{ padding: "3px 8px" }} onClick={() => setFormTarget({ ...f, realisasi: f.realisasi!.filter((_, j) => j !== i) })} aria-label="Hapus realisasi">×</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                  <input type="date" className="pt-in" style={{ width: "160px" }} value={realBaru.tanggal} max={hari} onChange={(e) => setRealBaru({ ...realBaru, tanggal: e.target.value })} aria-label="Tanggal pelaksanaan" />
                  <input className="pt-in" style={{ flex: 1, minWidth: "160px" }} value={realBaru.catatan} onChange={(e) => setRealBaru({ ...realBaru, catatan: e.target.value })} placeholder="Mis. service rutin semua unit, vendor X" />
                  <button type="button" className="sa-btn is-soft" onClick={() => { if (!realBaru.tanggal) return; setFormTarget({ ...f, realisasi: [...(f.realisasi || []), { tanggal: realBaru.tanggal, catatan: realBaru.catatan.trim() }].sort((a, b) => a.tanggal.localeCompare(b.tanggal)) }); setRealBaru({ tanggal: hari, catatan: "" }); }}>+ Terlaksana</button>
                </div>
              </div>
            )}

            <label style={{ display: "block", marginTop: "14px" }}>
              <span className="pt-lbl" style={{ color: statusForm === "At Risk" ? "var(--red-600)" : undefined }}>Kendala / butuh dukungan atasan{statusForm === "At Risk" ? " * (target terlambat)" : ""}</span>
              <input className="pt-in" value={f.kendala || ""} onChange={(e) => setFormTarget({ ...f, kendala: e.target.value })} placeholder="Mis. CER menunggu tanda tangan Direksi" />
            </label>
            <label style={{ display: "block", marginTop: "10px" }}>
              <span className="pt-lbl">Update hari ini (masuk riwayat)</span>
              <textarea className="pt-in" style={{ minHeight: "54px" }} value={updateBaru} onChange={(e) => setUpdateBaru(e.target.value)} placeholder="Mis. penawaran 3 vendor sudah masuk, menunggu review" />
            </label>
            {((f.riwayat || []).length > 0 || f.catatan) && (
              <div style={{ marginTop: "10px", maxHeight: "160px", overflowY: "auto", padding: "8px 10px", borderRadius: "10px", background: "var(--bg)", fontSize: "12px" }}>
                <div className="pt-lbl">Riwayat update</div>
                {[...(f.riwayat || [])].reverse().map((u, i) => <div key={i} style={{ padding: "3px 0", color: "var(--ink)" }}><b>{fmtTgl(u.tanggal)}</b> · {u.isi} <span style={{ color: "var(--muted)" }}>— {u.oleh}</span></div>)}
                {f.catatan && <div style={{ padding: "3px 0", color: "var(--muted)" }}>Catatan lama: {f.catatan}</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
              {f.id && <button type="button" className="sa-btn is-soft" style={{ color: "var(--red-600)" }} disabled={menyimpan} onClick={() => hapus(f.id, `${f.kode} ${f.target}`, () => setFormTarget(null))}>Hapus</button>}
              {f.id && <button type="button" className="sa-btn is-soft" disabled={menyimpan} onClick={() => setFormTarget({ ...f, status: f.status === "Cancelled" ? "Not Started" : "Cancelled" })}>{f.status === "Cancelled" ? "Aktifkan lagi" : "Batalkan target"}</button>}
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setFormTarget(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={simpanTarget} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ============ MODAL REVIEW ============ */}
      <Modal open={!!formReview} onClose={() => !menyimpan && setFormReview(null)} maxWidth="600px">
        {formReview && (
          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: "18px", color: "var(--ink)" }}>Weekly review</h3>
            <label><span className="pt-lbl">Minggu (mulai Senin)</span><input type="date" className="pt-in" style={{ maxWidth: "200px" }} value={formReview.minggu} onChange={(e) => setFormReview({ ...formReview, minggu: e.target.value })} /></label>
            {([["selesai", "Yang selesai minggu ini *"], ["tidak_selesai", "Yang tidak selesai (& kenapa)"], ["blocker", "Blocker / eskalasi"], ["komitmen", "Komitmen minggu depan"], ["refleksi", "Refleksi (1 kalimat)"]] as const).map(([k, l]) => (
              <label key={k} style={{ display: "block", marginTop: "10px" }}><span className="pt-lbl">{l}</span><textarea className="pt-in" style={{ minHeight: k === "refleksi" ? "40px" : "64px" }} value={formReview[k]} onChange={(e) => setFormReview({ ...formReview, [k]: e.target.value })} /></label>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              {formReview.id && <button type="button" className="sa-btn is-soft" style={{ color: "var(--red-600)" }} disabled={menyimpan} onClick={() => hapus(formReview.id, `review ${formReview.minggu}`, () => setFormReview(null))}>Hapus</button>}
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setFormReview(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={simpanReview} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
