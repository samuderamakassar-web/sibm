"use client";

/**
 * Project Tracker BM (§107) -- dari template Excel "BM TASK TRACKER": Annual Target -> Quarterly -> Weekly Task -> Weekly Review.
 * Koleksi project_tracker (1 koleksi, dibedakan field `tipe`):
 *   config/config  { lokasi[], kategori[], pic[], user[], lokasi_gedung }   -- pusat dropdown (sheet KONFIGURASI)
 *   tipe "target"  { kode, lokasi, target, kategori, user, ukuran_sukses, deadline, status, catatan, progress_est, kuartal[4]{milestone,pct} }
 *   tipe "task"    { kode, task, target_id, pic, due, priority, status, progress, keterangan }
 *   tipe "review"  { minggu (Senin), selesai, tidak_selesai, blocker, komitmen, refleksi, oleh }
 * 3 lensa progres target: Est (manual) · Kuartal (rata-rata Q1-Q4 %) · Task (Done/total, bobot High=3 Med=2 Low=1).
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
  KONFIG_BAWAAN, STATUS_TARGET, STATUS_TASK, PRIORITAS, BOBOT_PRIORITAS, WARNA_STATUS, progressKuartal, progressTask,
  type KonfigTracker, type TargetPT, type TaskPT, type ReviewPT, type StatusTarget, type StatusTask, type Prioritas,
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
const TARGET_KOSONG: TargetPT = { id: "", kode: "", lokasi: "", target: "", kategori: "PROJECT", user: "BM", ukuran_sukses: "Pekerjaan selesai / PO terbit", deadline: "", status: "Not Started", catatan: "", progress_est: 0, kuartal: [0, 1, 2, 3].map(() => ({ milestone: "", pct: 0 })) };
const TASK_KOSONG: TaskPT = { id: "", kode: "", task: "", target_id: "", pic: "", due: "", priority: "Medium", status: "Backlog", progress: 0, keterangan: "" };

function Pill({ teks, warna }: { teks: string; warna: { bg: string; fg: string } }) {
  return <span style={{ display: "inline-block", fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "999px", background: warna.bg, color: warna.fg, whiteSpace: "nowrap" }}>{teks}</span>;
}
function MiniBar({ pct, warna = "var(--info-solid)" }: { pct: number | null; warna?: string }) {
  if (pct === null) return <span style={{ color: "var(--muted)", fontSize: "11.5px" }}>—</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "90px" }}>
      <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: "var(--line)", overflow: "hidden" }}><div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: warna }} /></div>
      <span style={{ fontSize: "11.5px", fontWeight: 800, fontVariantNumeric: "tabular-nums", width: "34px", textAlign: "right" }}>{Math.round(pct)}%</span>
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

export default function ProjectTrackerPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA / BM." });
  const [tab, setTab] = useState<"TARGET" | "KUARTAL" | "TASK" | "REVIEW" | "SETTING">("TARGET");
  const [konfig, setKonfig] = useState<KonfigTracker>(KONFIG_BAWAAN);
  const [targets, setTargets] = useState<TargetPT[]>([]);
  const [tasks, setTasks] = useState<TaskPT[]>([]);
  const [reviews, setReviews] = useState<ReviewPT[]>([]);
  const [filterLokasi, setFilterLokasi] = useState("Semua");
  const [filterStatus, setFilterStatus] = useState("Semua");
  const [cari, setCari] = useState("");
  const [formTarget, setFormTarget] = useState<TargetPT | null>(null);
  const [formTask, setFormTask] = useState<TaskPT | null>(null);
  const [formReview, setFormReview] = useState<ReviewPT | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    const unsub = onSnapshot(collection(db, KOL), (s) => {
      const t: TargetPT[] = []; const k: TaskPT[] = []; const r: ReviewPT[] = [];
      s.docs.forEach((d) => {
        const x = { id: d.id, ...d.data() } as Record<string, unknown> & { id: string; tipe?: string };
        if (d.id === "config") setKonfig({ ...KONFIG_BAWAAN, ...(d.data() as Partial<KonfigTracker>) });
        else if (x.tipe === "target") t.push(x as unknown as TargetPT);
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

  const targetPerId = new Map(targets.map((t) => [t.id, t]));
  const progTask = (id: string) => progressTask(tasks.filter((k) => k.target_id === id));
  const targetTampil = targets.filter((t) => (filterLokasi === "Semua" || t.lokasi === filterLokasi) && (filterStatus === "Semua" || t.status === filterStatus)
    && (!cari.trim() || `${t.kode} ${t.target} ${t.catatan}`.toLowerCase().includes(cari.toLowerCase())));
  const taskTampil = tasks.filter((k) => (filterLokasi === "Semua" || targetPerId.get(k.target_id)?.lokasi === filterLokasi)
    && (!cari.trim() || `${k.kode} ${k.task} ${k.pic} ${targetPerId.get(k.target_id)?.target || ""}`.toLowerCase().includes(cari.toLowerCase())));
  const lokasiDipakai = Array.from(new Set([...konfig.lokasi, ...targets.map((t) => t.lokasi).filter(Boolean)]));
  const hitung = (s: StatusTarget) => targets.filter((t) => (filterLokasi === "Semua" || t.lokasi === filterLokasi) && t.status === s).length;
  const aktifLokasi = targets.filter((t) => filterLokasi === "Semua" || t.lokasi === filterLokasi);
  const rataEst = aktifLokasi.length ? aktifLokasi.reduce((a, t) => a + (t.status === "Done" ? 100 : t.progress_est || 0), 0) / aktifLokasi.length : 0;

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
  const kodeTaskBaru = () => `T-${String((tasks.map((k) => Number(k.kode.replace(/\D/g, "")) || 0).reduce((a, b) => Math.max(a, b), 0)) + 1).padStart(3, "0")}`;
  const simpanTarget = async () => {
    if (!formTarget) return;
    if (!formTarget.target.trim() || !formTarget.lokasi) return showToast("Isi lokasi & target.", "warning");
    const { id, ...isi } = formTarget;
    if (await simpan(id, { ...isi, tipe: "target", kode: isi.kode.trim() || kodeTargetBaru(isi.lokasi), target: isi.target.trim() }, "Target tersimpan.")) setFormTarget(null);
  };
  const simpanTask = async () => {
    if (!formTask) return;
    if (!formTask.task.trim() || !formTask.target_id) return showToast("Isi task & pilih Target ID (task wajib terhubung ke target).", "warning");
    const { id, ...isi } = formTask;
    if (await simpan(id, { ...isi, tipe: "task", kode: isi.kode || kodeTaskBaru(), task: isi.task.trim(), progress: isi.status === "Done" ? 100 : isi.progress }, "Task tersimpan.")) setFormTask(null);
  };
  const ubahStatusTask = (k: TaskPT, status: StatusTask) => simpan(k.id, { status, ...(status === "Done" ? { progress: 100 } : {}) }, `${k.kode} → ${status}`);
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
      ["Target ID", "Lokasi Aset", "Target", "Kategori", "User", "Ukuran Sukses", "Deadline", "Status", "Catatan", "Progress Est (%)", "Progress Quarterly (%)", "Progress Task (%)"],
      ...targets.map((t) => [t.kode, t.lokasi, t.target, t.kategori, t.user, t.ukuran_sukses, t.deadline, t.status, t.catatan, t.progress_est, progressKuartal(t) ?? "", progTask(t.id) ?? ""]),
    ]), "Annual Target");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Target ID", "Lokasi", "Target", "Q1", "Q1 %", "Q2", "Q2 %", "Q3", "Q3 %", "Q4", "Q4 %", "Avg %"],
      ...targets.map((t) => [t.kode, t.lokasi, t.target, ...(t.kuartal || []).flatMap((q) => [q.milestone, q.pct]), progressKuartal(t) ?? ""]),
    ]), "Quarterly");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Task ID", "Task", "Target ID", "Target", "Lokasi", "PIC", "Due Date", "Priority", "Status", "Progress (%)", "Keterangan"],
      ...tasks.map((k) => [k.kode, k.task, targetPerId.get(k.target_id)?.kode || "", targetPerId.get(k.target_id)?.target || "", targetPerId.get(k.target_id)?.lokasi || "", k.pic, k.due, k.priority, k.status, k.progress, k.keterangan]),
    ]), "Weekly Task");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Minggu (Senin)", "Yang Selesai", "Tidak Selesai (& Kenapa)", "Blocker / Eskalasi", "Komitmen Minggu Depan", "Refleksi", "Oleh"],
      ...reviews.map((r) => [r.minggu, r.selesai, r.tidak_selesai, r.blocker, r.komitmen, r.refleksi, r.oleh]),
    ]), "Weekly Review");
    XLSX.writeFile(wb, `BM_Task_Tracker_${hariIni()}.xlsx`);
  };

  const pilihTargetOptions = lokasiDipakai.map((l) => {
    const isi = targets.filter((t) => t.lokasi === l && t.status !== "Cancelled");
    return isi.length ? <optgroup key={l} label={l}>{isi.map((t) => <option key={t.id} value={t.id}>{t.kode} — {t.target}</option>)}</optgroup> : null;
  });

  return (
    <AdminShell title="Project Tracker" subtitle="Target tahunan → kuartal → task mingguan → review (Building Management)" userName={session?.nama || "Admin"}
      actions={<button type="button" className="sa-btn is-soft" onClick={ekspor}>Export Excel</button>}>
      <style dangerouslySetInnerHTML={{ __html: `
        .pt-tabel { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 980px; }
        .pt-tabel th { text-align: left; padding: 9px 10px; background: var(--bg); color: var(--ink-soft); font-size: 11.5px; font-weight: 800; border-bottom: 1px solid var(--line); white-space: nowrap; }
        .pt-tabel td { padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
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
      ` }} />

      <div className="sa-tabs" role="tablist" aria-label="Bagian project tracker" style={{ width: "fit-content", maxWidth: "100%", marginBottom: "14px", overflowX: "auto" }}>
        {([["TARGET", `Target Tahunan (${targets.length})`], ["KUARTAL", "Kuartal"], ["TASK", `Task Mingguan (${tasks.filter((k) => k.status !== "Done").length})`], ["REVIEW", "Review Mingguan"], ["SETTING", "Pengaturan"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sa-tab${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab !== "SETTING" && tab !== "REVIEW" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginBottom: "12px" }}>
            {(["Not Started", "On Track", "In Progress", "At Risk", "Done"] as StatusTarget[]).map((s) => (
              <button key={s} type="button" onClick={() => { setFilterStatus(filterStatus === s ? "Semua" : s); setTab("TARGET"); }} style={{ textAlign: "left", padding: "10px 12px", borderRadius: "14px", border: `1px solid ${filterStatus === s ? WARNA_STATUS[s].fg : "var(--line)"}`, background: "var(--surface)", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ fontSize: "22px", fontWeight: 800, color: WARNA_STATUS[s].fg }}>{hitung(s)}</div>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--ink-soft)" }}>{s}</div>
              </button>
            ))}
            <div style={{ padding: "10px 12px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--surface)" }}>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink)" }}>{Math.round(rataEst)}%</div>
              <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--ink-soft)" }}>Rata-rata progres</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            <select className="pt-in" style={{ width: "220px" }} value={filterLokasi} onChange={(e) => setFilterLokasi(e.target.value)} aria-label="Filter lokasi aset">
              <option value="Semua">Semua lokasi</option>
              {lokasiDipakai.map((l) => <option key={l} value={l}>{l} ({targets.filter((t) => t.lokasi === l).length})</option>)}
            </select>
            {filterStatus !== "Semua" && <button type="button" className="pt-chip is-on" onClick={() => setFilterStatus("Semua")}>Status: {filterStatus} ×</button>}
            <input className="pt-in" style={{ width: "240px" }} placeholder="Cari target / task / PIC..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari" />
            <div style={{ flex: 1 }} />
            {tab === "TASK"
              ? <button type="button" className="sa-btn is-primary" onClick={() => setFormTask({ ...TASK_KOSONG, due: hariIni() })} disabled={!targets.length}>+ Task</button>
              : <button type="button" className="sa-btn is-primary" onClick={() => setFormTarget({ ...TARGET_KOSONG, lokasi: filterLokasi !== "Semua" ? filterLokasi : konfig.lokasi_gedung || "", kuartal: TARGET_KOSONG.kuartal.map((q) => ({ ...q })) })}>+ Target</button>}
          </div>
        </>
      )}

      {/* ============ TARGET TAHUNAN ============ */}
      {tab === "TARGET" && (
        <Tile>
          {targetTampil.length === 0 ? <div style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>{targets.length ? "Tidak ada target pada filter ini." : "Belum ada target. Mulai dari + Target (tiap task nanti wajib terhubung ke target)."}</div> : (
            <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
              <table className="pt-tabel">
                <thead><tr><th>Target ID</th><th>Lokasi</th><th>Target</th><th>Kategori</th><th>User</th><th>Deadline</th><th>Status</th><th>Progress Est</th><th>Kuartal</th><th>Task</th></tr></thead>
                <tbody>
                  {targetTampil.map((t) => (
                    <tr key={t.id} onClick={() => setFormTarget({ ...TARGET_KOSONG, ...t, kuartal: (t.kuartal?.length === 4 ? t.kuartal : TARGET_KOSONG.kuartal).map((q) => ({ ...q })) })}>
                      <td style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{t.kode}</td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--ink-soft)" }}>{t.lokasi}</td>
                      <td style={{ minWidth: "240px" }}><div style={{ fontWeight: 700, color: "var(--ink)" }}>{t.target}</div>{t.catatan && <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{t.catatan}</div>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{t.kategori}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{t.user}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtTgl(t.deadline)}</td>
                      <td><Pill teks={t.status} warna={WARNA_STATUS[t.status]} /></td>
                      <td><MiniBar pct={t.status === "Done" ? 100 : t.progress_est || 0} /></td>
                      <td><MiniBar pct={progressKuartal(t)} warna="var(--accent)" /></td>
                      <td><MiniBar pct={progTask(t.id)} warna="var(--ok-solid)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ margin: "8px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>3 lensa progres: Est = estimasi manual · Kuartal = rata-rata % milestone Q1–Q4 · Task = task Done/total (bobot High 3, Medium 2, Low 1). Klik baris untuk edit.</p>
        </Tile>
      )}

      {/* ============ KUARTAL ============ */}
      {tab === "KUARTAL" && (
        <Tile>
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
            <table className="pt-tabel">
              <thead><tr><th>Target ID</th><th>Target</th>{["Q1 (Jan–Mar)", "Q2 (Apr–Jun)", "Q3 (Jul–Sep)", "Q4 (Okt–Des)"].map((q) => <th key={q}>{q}</th>)}<th>Avg</th><th>Status</th></tr></thead>
              <tbody>
                {targetTampil.filter((t) => t.status !== "Not Started" && t.status !== "Cancelled").map((t) => (
                  <tr key={t.id} onClick={() => setFormTarget({ ...TARGET_KOSONG, ...t, kuartal: (t.kuartal?.length === 4 ? t.kuartal : TARGET_KOSONG.kuartal).map((q) => ({ ...q })) })}>
                    <td style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{t.kode}</td>
                    <td style={{ minWidth: "180px" }}><div style={{ fontWeight: 700 }}>{t.target}</div><div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{t.lokasi}</div></td>
                    {(t.kuartal?.length === 4 ? t.kuartal : TARGET_KOSONG.kuartal).map((q, i) => (
                      <td key={i} style={{ minWidth: "150px" }}>
                        <div style={{ fontSize: "12px", color: q.milestone ? "var(--ink)" : "var(--muted)", marginBottom: "4px" }}>{q.milestone || "—"}</div>
                        {q.milestone && <MiniBar pct={q.pct} warna="var(--accent)" />}
                      </td>
                    ))}
                    <td><MiniBar pct={progressKuartal(t)} warna="var(--accent)" /></td>
                    <td><Pill teks={t.status} warna={WARNA_STATUS[t.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Muncul untuk target berstatus selain Not Started / Cancelled. Klik baris untuk isi milestone & % tiap kuartal.</p>
        </Tile>
      )}

      {/* ============ TASK MINGGUAN ============ */}
      {tab === "TASK" && (
        <div className="pt-board">
          {STATUS_TASK.map((s) => {
            const isi = taskTampil.filter((k) => k.status === s);
            return (
              <div key={s} className="pt-kol">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Pill teks={s} warna={WARNA_STATUS[s]} /><span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 700 }}>{isi.length}</span></div>
                {isi.map((k) => {
                  const t = targetPerId.get(k.target_id);
                  const telat = k.status !== "Done" && k.due && k.due < hariIni();
                  return (
                    <div key={k.id} className="pt-kartu" onClick={() => setFormTask({ ...TASK_KOSONG, ...k })}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", fontSize: "11px", color: "var(--muted)", fontWeight: 700 }}>
                        <span>{k.kode} · {t?.kode || "?"}</span>
                        <span style={{ color: k.priority === "High" ? "var(--red-600)" : k.priority === "Medium" ? "var(--warn)" : "var(--muted)" }}>{k.priority}</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--ink)", margin: "4px 0" }}>{k.task}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{t?.lokasi || "-"} · {k.pic || "PIC?"}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", gap: "6px" }}>
                        <span style={{ fontSize: "11.5px", fontWeight: 700, color: telat ? "var(--red-600)" : "var(--ink-soft)" }}>{k.due ? fmtTgl(k.due) : "-"}{telat ? " · lewat" : ""}</span>
                        <select className="pt-in" style={{ width: "auto", padding: "3px 6px", fontSize: "11.5px" }} value={k.status} onClick={(e) => e.stopPropagation()} onChange={(e) => ubahStatusTask(k, e.target.value as StatusTask)} aria-label={`Status ${k.kode}`}>
                          {STATUS_TASK.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                      {k.status !== "Done" && k.progress > 0 && <div style={{ marginTop: "6px" }}><MiniBar pct={k.progress} warna="var(--ok-solid)" /></div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
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
          <p style={{ margin: "14px 0 0", fontSize: "12px", color: "var(--muted)" }}>Status target ({STATUS_TARGET.join(" · ")}), status task ({STATUS_TASK.join(" · ")}) & prioritas ({PRIORITAS.join(" · ")}) mengikuti template, tidak diubah di sini.</p>
        </Tile>
      )}

      {/* ============ MODAL TARGET ============ */}
      <Modal open={!!formTarget} onClose={() => !menyimpan && setFormTarget(null)} maxWidth="680px">
        {formTarget && (
          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: "18px", color: "var(--ink)" }}>{formTarget.id ? `Edit target ${formTarget.kode}` : "Target baru"}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
              <label><span className="pt-lbl">Lokasi aset *</span><select className="pt-in" value={formTarget.lokasi} onChange={(e) => setFormTarget({ ...formTarget, lokasi: e.target.value })}><option value="">Pilih...</option>{lokasiDipakai.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
              <label><span className="pt-lbl">Target ID</span><input className="pt-in" value={formTarget.kode} onChange={(e) => setFormTarget({ ...formTarget, kode: e.target.value.toUpperCase() })} placeholder={formTarget.lokasi ? `otomatis: ${kodeTargetBaru(formTarget.lokasi)}` : "otomatis"} /></label>
              <label><span className="pt-lbl">Deadline</span><input type="date" className="pt-in" value={formTarget.deadline} onChange={(e) => setFormTarget({ ...formTarget, deadline: e.target.value })} /></label>
            </div>
            <label style={{ display: "block", marginTop: "10px" }}><span className="pt-lbl">Target *</span><input className="pt-in" value={formTarget.target} onChange={(e) => setFormTarget({ ...formTarget, target: e.target.value })} placeholder="Mis. Pengadaan CCTV" /></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginTop: "10px" }}>
              <label><span className="pt-lbl">Kategori</span><select className="pt-in" value={formTarget.kategori} onChange={(e) => setFormTarget({ ...formTarget, kategori: e.target.value })}>{konfig.kategori.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label><span className="pt-lbl">User</span><select className="pt-in" value={formTarget.user} onChange={(e) => setFormTarget({ ...formTarget, user: e.target.value })}>{konfig.user.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label><span className="pt-lbl">Status</span><select className="pt-in" value={formTarget.status} onChange={(e) => setFormTarget({ ...formTarget, status: e.target.value as StatusTarget })}>{STATUS_TARGET.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label><span className="pt-lbl">Progress est.</span><select className="pt-in" value={formTarget.progress_est} onChange={(e) => setFormTarget({ ...formTarget, progress_est: Number(e.target.value) })}>{[0, 25, 50, 75, 100].map((p) => <option key={p} value={p}>{p}%</option>)}</select></label>
            </div>
            <label style={{ display: "block", marginTop: "10px" }}><span className="pt-lbl">Ukuran sukses (kuantitatif)</span><input className="pt-in" value={formTarget.ukuran_sukses} onChange={(e) => setFormTarget({ ...formTarget, ukuran_sukses: e.target.value })} /></label>
            <label style={{ display: "block", marginTop: "10px" }}><span className="pt-lbl">Catatan</span><textarea className="pt-in" style={{ minHeight: "60px" }} value={formTarget.catatan} onChange={(e) => setFormTarget({ ...formTarget, catatan: e.target.value })} placeholder="[Okt] CER sudah final approve, PO terbit..." /></label>
            <div className="pt-lbl" style={{ marginTop: "14px" }}>Milestone kuartal</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
              {formTarget.kuartal.map((q, i) => (
                <div key={i} style={{ padding: "8px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)" }}>
                  <div style={{ fontSize: "11.5px", fontWeight: 800, color: "var(--ink-soft)", marginBottom: "4px" }}>Q{i + 1}</div>
                  <input className="pt-in" style={{ padding: "6px 8px", fontSize: "12px" }} value={q.milestone} placeholder={["TOR / BOQ & komparasi vendor", "Tender, evaluasi & PO", "Pelaksanaan & monitoring", "Serah terima & penutupan"][i]} onChange={(e) => setFormTarget({ ...formTarget, kuartal: formTarget.kuartal.map((x, j) => (j === i ? { ...x, milestone: e.target.value } : x)) })} />
                  <select className="pt-in" style={{ padding: "5px 8px", fontSize: "12px", marginTop: "4px" }} value={q.pct} onChange={(e) => setFormTarget({ ...formTarget, kuartal: formTarget.kuartal.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)) })} aria-label={`Progres Q${i + 1}`}>
                    {[0, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100].map((p) => <option key={p} value={p}>{p}%</option>)}
                  </select>
                </div>
              ))}
            </div>
            {formTarget.id && <div style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--ink-soft)" }}>Task terhubung: <b>{tasks.filter((k) => k.target_id === formTarget.id).length}</b> · progress task {progTask(formTarget.id) === null ? "—" : `${Math.round(progTask(formTarget.id)!)}%`}</div>}
            <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
              {formTarget.id && <button type="button" className="sa-btn is-soft" style={{ color: "var(--red-600)" }} disabled={menyimpan} onClick={() => hapus(formTarget.id, `${formTarget.kode} ${formTarget.target}`, () => setFormTarget(null))}>Hapus</button>}
              {formTarget.id && <button type="button" className="sa-btn is-soft" onClick={() => { const t = formTarget; setFormTarget(null); setFormTask({ ...TASK_KOSONG, target_id: t.id, due: t.deadline || hariIni() }); }}>+ Task untuk target ini</button>}
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setFormTarget(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={simpanTarget} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ============ MODAL TASK ============ */}
      <Modal open={!!formTask} onClose={() => !menyimpan && setFormTask(null)} maxWidth="560px">
        {formTask && (
          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: "18px", color: "var(--ink)" }}>{formTask.id ? `Edit task ${formTask.kode}` : "Task baru"}</h3>
            <label style={{ display: "block" }}><span className="pt-lbl">Task *</span><input className="pt-in" value={formTask.task} onChange={(e) => setFormTask({ ...formTask, task: e.target.value })} placeholder="Mis. Pengumpulan penawaran 3 vendor" /></label>
            <label style={{ display: "block", marginTop: "10px" }}><span className="pt-lbl">Target ID * (task wajib terhubung ke target)</span>
              <select className="pt-in" value={formTask.target_id} onChange={(e) => setFormTask({ ...formTask, target_id: e.target.value })}><option value="">Pilih target...</option>{pilihTargetOptions}</select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginTop: "10px" }}>
              <label><span className="pt-lbl">PIC</span><select className="pt-in" value={formTask.pic} onChange={(e) => setFormTask({ ...formTask, pic: e.target.value })}><option value="">—</option>{konfig.pic.map((p) => <option key={p}>{p}</option>)}</select></label>
              <label><span className="pt-lbl">Due date</span><input type="date" className="pt-in" value={formTask.due} onChange={(e) => setFormTask({ ...formTask, due: e.target.value })} /></label>
              <label><span className="pt-lbl">Priority</span><select className="pt-in" value={formTask.priority} onChange={(e) => setFormTask({ ...formTask, priority: e.target.value as Prioritas })}>{PRIORITAS.map((p) => <option key={p}>{p}</option>)}</select></label>
              <label><span className="pt-lbl">Status</span><select className="pt-in" value={formTask.status} onChange={(e) => setFormTask({ ...formTask, status: e.target.value as StatusTask })}>{STATUS_TASK.map((p) => <option key={p}>{p}</option>)}</select></label>
              <label><span className="pt-lbl">Progress</span><select className="pt-in" value={formTask.progress} onChange={(e) => setFormTask({ ...formTask, progress: Number(e.target.value) })}>{[0, 25, 50, 75, 100].map((p) => <option key={p} value={p}>{p}%</option>)}</select></label>
            </div>
            <label style={{ display: "block", marginTop: "10px" }}><span className="pt-lbl">Keterangan</span><input className="pt-in" value={formTask.keterangan} onChange={(e) => setFormTask({ ...formTask, keterangan: e.target.value })} placeholder="Mis. menunggu SRA" /></label>
            <p style={{ margin: "8px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Bobot prioritas untuk progress target: High {BOBOT_PRIORITAS.High} · Medium {BOBOT_PRIORITAS.Medium} · Low {BOBOT_PRIORITAS.Low}.</p>
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              {formTask.id && <button type="button" className="sa-btn is-soft" style={{ color: "var(--red-600)" }} disabled={menyimpan} onClick={() => hapus(formTask.id, `${formTask.kode} ${formTask.task}`, () => setFormTask(null))}>Hapus</button>}
              <div style={{ flex: 1 }} />
              <button type="button" className="sa-btn is-soft" onClick={() => setFormTask(null)} disabled={menyimpan}>Batal</button>
              <button type="button" className="sa-btn is-primary" onClick={simpanTask} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Simpan"}</button>
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
