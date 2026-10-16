// Project Tracker BM (§107) -- tipe & aturan progres bersama (halaman admin & dashboard Eksekutif §108).

export type StatusTarget = "Not Started" | "On Track" | "In Progress" | "At Risk" | "Done" | "Cancelled";
export type StatusTask = "Backlog" | "This Week" | "In Progress" | "Blocked" | "Done";
export type Prioritas = "High" | "Medium" | "Low";

export const STATUS_TARGET: StatusTarget[] = ["Not Started", "On Track", "In Progress", "At Risk", "Done", "Cancelled"];
export const STATUS_TASK: StatusTask[] = ["Backlog", "This Week", "In Progress", "Blocked", "Done"];
export const PRIORITAS: Prioritas[] = ["High", "Medium", "Low"];
export const BOBOT_PRIORITAS: Record<Prioritas, number> = { High: 3, Medium: 2, Low: 1 };

export const WARNA_STATUS: Record<StatusTarget | StatusTask, { bg: string; fg: string }> = {
  "Not Started": { bg: "var(--red-50)", fg: "var(--red-600)" },
  "On Track": { bg: "var(--info-50)", fg: "var(--info)" },
  "In Progress": { bg: "var(--warn-50)", fg: "var(--warn)" },
  "At Risk": { bg: "var(--red-50)", fg: "var(--red-600)" },
  Done: { bg: "var(--ok-50)", fg: "var(--ok)" },
  Cancelled: { bg: "var(--line)", fg: "var(--muted)" },
  Backlog: { bg: "var(--line)", fg: "var(--ink-soft)" },
  "This Week": { bg: "var(--info-50)", fg: "var(--info)" },
  Blocked: { bg: "var(--red-50)", fg: "var(--red-600)" },
};

export interface KonfigTracker { lokasi: string[]; kategori: string[]; pic: string[]; user: string[]; lokasi_gedung?: string; tahapan?: { nama: string; bobot: number; parsial?: boolean }[] }
export const KONFIG_BAWAAN: KonfigTracker = {
  lokasi: ["Samudera Makassar", "Samudera Kirana", "Samudera Slipi", "SLC Medan", "Soedarpo Informatika", "Samudera Surabaya", "KBB 43", "SI Cilincing", "AKMI CRBN", "Corp", "SI Lampung", "SI Cilegon"],
  kategori: ["PROJECT", "NON-PROJECT", "UNCATEGORIZED"],
  pic: ["Head of BM", "BM Team", "Engineering", "QHSE / K3", "GA", "Finance Team", "Coreporate", "Vendor"],
  user: ["BM", "Engineering", "HSE", "GA", "HC", "TR"],
  lokasi_gedung: "Samudera Makassar",
};

export interface TargetPT {
  id: string; kode: string; lokasi: string; target: string; kategori: string; user: string; ukuran_sukses: string;
  deadline: string; status: StatusTarget; catatan: string; progress_est: number; kuartal: { milestone: string; pct: number }[];
}
export interface TaskPT {
  id: string; kode: string; task: string; target_id: string; pic: string; due: string;
  priority: Prioritas; status: StatusTask; progress: number; keterangan: string;
}
export interface ReviewPT { id: string; minggu: string; selesai: string; tidak_selesai: string; blocker: string; komitmen: string; refleksi: string; oleh: string }

/** Rata-rata % milestone kuartal yang diisi (null bila belum ada milestone). */
export function progressKuartal(t: Pick<TargetPT, "kuartal">): number | null {
  const isi = (t.kuartal || []).filter((q) => q.milestone);
  return isi.length ? isi.reduce((a, q) => a + (q.pct || 0), 0) / isi.length : null;
}

/** Task Done / total dengan bobot prioritas (null bila belum ada task). */
export function progressTask(tasks: Pick<TaskPT, "priority" | "status">[]): number | null {
  if (!tasks.length) return null;
  const total = tasks.reduce((a, k) => a + (BOBOT_PRIORITAS[k.priority] || 1), 0);
  const done = tasks.filter((k) => k.status === "Done").reduce((a, k) => a + (BOBOT_PRIORITAS[k.priority] || 1), 0);
  return (done / total) * 100;
}

// ===================== §162 Progres dari tahapan baku perusahaan =====================
// PROJECT -> 9 tahapan (bobot tetap, dapat diatur di Pengaturan); NON-PROJECT rutin -> frekuensi (terlaksana ÷ rencana).
// Status dihitung sistem dari progres + tanggal rencana, bukan dipilih manual. Target lama yang belum dipetakan tetap
// memakai progress_est & status manual sampai tahapannya diisi.

export interface TahapDef { nama: string; bobot: number; parsial?: boolean }
export const TAHAPAN_BAWAAN: TahapDef[] = [
  { nama: "Survey kebutuhan", bobot: 5 },
  { nama: "Pengajuan approval komparasi vendor", bobot: 10 },
  { nama: "Review doc komparasi", bobot: 10 },
  { nama: "Proses approval komparasi", bobot: 10 },
  { nama: "Pengajuan CER", bobot: 10 },
  { nama: "Pengajuan PO", bobot: 10 },
  { nama: "Pelaksanaan", bobot: 30, parsial: true },
  { nama: "Checklist item", bobot: 10 },
  { nama: "BAST", bobot: 5 },
];
export interface TahapTarget extends TahapDef { rencana: string; selesai: string; pct?: number; catatan?: string }
export interface RiwayatPT { tanggal: string; oleh: string; isi: string }
export interface RealisasiPT { tanggal: string; catatan: string }
export type MetodeProgres = "tahapan" | "frekuensi" | "manual";

export type TargetLengkap = TargetPT & {
  tahapan?: TahapTarget[]; frekuensi_rencana?: number; realisasi?: RealisasiPT[]; riwayat?: RiwayatPT[]; kendala?: string;
};

export const tahapanBaru = (defs: TahapDef[]): TahapTarget[] => defs.map((d) => ({ ...d, rencana: "", selesai: "", pct: 0, catatan: "" }));
export function metodeProgres(t: TargetLengkap): MetodeProgres {
  if (t.tahapan?.length) return "tahapan";
  if ((t.frekuensi_rencana || 0) > 0) return "frekuensi";
  return "manual";
}
const nilaiTahap = (s: TahapTarget) => (s.selesai ? 1 : s.parsial ? Math.min(100, Math.max(0, s.pct || 0)) / 100 : 0);
const totalBobot = (xs: TahapTarget[]) => xs.reduce((a, s) => a + (s.bobot || 0), 0) || 1;

/** Progres realisasi 0-100 (satu angka resmi per target). */
export function progressTarget(t: TargetLengkap): number {
  const m = metodeProgres(t);
  if (m === "tahapan") return (t.tahapan!.reduce((a, s) => a + (s.bobot || 0) * nilaiTahap(s), 0) / totalBobot(t.tahapan!)) * 100;
  if (m === "frekuensi") return Math.min(100, ((t.realisasi?.length || 0) / (t.frekuensi_rencana || 1)) * 100);
  return t.status === "Done" ? 100 : t.progress_est || 0;
}

/** Progres yang SEHARUSNYA sudah dicapai per tanggal `hari` (null bila belum ada tanggal rencana). */
export function rencanaTarget(t: TargetLengkap, hari: string): number | null {
  const m = metodeProgres(t);
  if (m === "tahapan") {
    if (!t.tahapan!.some((s) => s.rencana)) return null;
    return (t.tahapan!.filter((s) => s.rencana && s.rencana <= hari).reduce((a, s) => a + (s.bobot || 0), 0) / totalBobot(t.tahapan!)) * 100;
  }
  if (m === "frekuensi" && t.deadline) {
    const awal = `${t.deadline.slice(0, 4)}-01-01`;
    const ms = (iso: string) => new Date(`${iso}T12:00:00+08:00`).getTime();
    const f = Math.min(1, Math.max(0, (ms(hari) - ms(awal)) / Math.max(1, ms(t.deadline) - ms(awal))));
    return Math.floor((t.frekuensi_rencana || 0) * f) / (t.frekuensi_rencana || 1) * 100;
  }
  return null;
}

/** Tahap yang sedang berjalan (pertama yang belum selesai). */
export function tahapSekarang(t: TargetLengkap): TahapTarget | null {
  return metodeProgres(t) === "tahapan" ? t.tahapan!.find((s) => !s.selesai) || null : null;
}
/** Tahap yang lewat tanggal rencana tetapi belum selesai. */
export function tahapTerlambat(t: TargetLengkap, hari: string): TahapTarget[] {
  return metodeProgres(t) === "tahapan" ? t.tahapan!.filter((s) => !s.selesai && s.rencana && s.rencana < hari) : [];
}

export function statusOtomatis(t: TargetLengkap, hari: string): StatusTarget {
  if (t.status === "Cancelled") return "Cancelled";
  const m = metodeProgres(t);
  if (m === "manual") return t.status;
  const prog = progressTarget(t);
  if (prog >= 99.5) return "Done";
  const rencana = rencanaTarget(t, hari);
  const lewatDeadline = !!t.deadline && t.deadline < hari;
  if (lewatDeadline || tahapTerlambat(t, hari).length > 0 || (rencana !== null && prog + 0.5 < rencana)) return "At Risk";
  if (prog === 0) return "Not Started";
  return "On Track";
}
