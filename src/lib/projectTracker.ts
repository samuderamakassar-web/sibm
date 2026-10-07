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

export interface KonfigTracker { lokasi: string[]; kategori: string[]; pic: string[]; user: string[]; lokasi_gedung?: string }
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
