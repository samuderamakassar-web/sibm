"use client";

/**
 * src/app/admin/monitor-cron/page.tsx
 * ------------------------------------------------------------------
 * "Kesehatan Notifikasi" -- daftar semua cron reminder (GitHub Actions)
 * beserta status run TERAKHIRnya, diambil LANGSUNG dari GitHub REST API
 * publik (repo ini public, jadi endpoint read-only-nya gak butuh token).
 * Dibuat setelah insiden 18-20 Sep 2026 (hampir semua cron reminder gagal
 * berhari-hari tanpa ada yang sadar sampai user forward banyak email
 * error) -- tujuannya Admin GA bisa cek sendiri kapan pun tanpa perlu
 * screenshot manual.
 *
 * CATATAN: GitHub API publik tanpa token dibatasi 60 request/jam PER IP.
 * Halaman ini fetch 1x (daftar workflow) + 1x per workflow (run terakhir)
 * -- sekitar 12 request tiap halaman dibuka. Jangan refresh berkali-kali
 * dalam waktu singkat kalau ada banyak orang yang buka bersamaan dari
 * jaringan yang sama (bisa kena rate limit sementara).
 * ------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import AdminShell from "../../../components/admin/AdminShell";

type IconProps = { size?: number; color?: string };
const IconRefresh = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></svg>
);
const IconCheckCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
);
const IconXCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m9.5 9.5 5 5M14.5 9.5l-5 5" /></svg>
);
const IconClockAlert = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);

const GH_OWNER = "samuderamakassar-web";
const GH_REPO = "sibm";

interface WorkflowInfo {
  id: number;
  name: string;
  path: string;
}
interface RunInfo {
  status: string;
  conclusion: string | null;
  run_started_at: string;
  html_url: string;
}
interface WorkflowStatus extends WorkflowInfo {
  run: RunInfo | null;
}

function formatRelatif(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const menit = Math.floor(diffMs / 60000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}

export default function MonitorCronPage() {
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });

  const [daftar, setDaftar] = useState<WorkflowStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isReady || !session) return;
    let batal = false;

    (async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const wfRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows?per_page=50`);
        if (!wfRes.ok) throw new Error(wfRes.status === 403 ? "Kena rate limit GitHub API (maks 60x/jam), coba lagi nanti." : `GitHub API error (${wfRes.status})`);
        const wfData = await wfRes.json();
        const workflows: WorkflowInfo[] = (wfData.workflows || []).map((w: { id: number; name: string; path: string }) => ({ id: w.id, name: w.name, path: w.path }));

        const hasil: WorkflowStatus[] = await Promise.all(
          workflows.map(async (wf) => {
            try {
              const runRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${wf.id}/runs?per_page=1`);
              if (!runRes.ok) return { ...wf, run: null };
              const runData = await runRes.json();
              const r = runData.workflow_runs?.[0];
              return { ...wf, run: r ? { status: r.status, conclusion: r.conclusion, run_started_at: r.run_started_at, html_url: r.html_url } : null };
            } catch {
              return { ...wf, run: null };
            }
          })
        );

        if (!batal) {
          hasil.sort((a, b) => a.name.localeCompare(b.name));
          setDaftar(hasil);
        }
      } catch (err) {
        if (!batal) setErrorMsg(err instanceof Error ? err.message : "Gagal memuat status dari GitHub.");
      } finally {
        if (!batal) setLoading(false);
      }
    })();

    return () => { batal = true; };
  }, [isReady, session, reloadKey]);

  if (!isReady || !session) return null;
  const adminName = session.nama || "Admin";

  const jumlahGagal = daftar.filter((d) => d.run?.conclusion === "failure").length;

  return (
    <AdminShell title="Kesehatan Notifikasi" subtitle="Status run terakhir tiap cron reminder — langsung dari GitHub Actions" userName={adminName}>
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        .cron-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
      `}} />

      <div>
        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ fontSize: "13px", color: "var(--ink-soft)", fontWeight: 700 }}>
              {loading ? "Memuat..." : jumlahGagal > 0 ? (
                <span style={{ color: "var(--red-600)" }}>⚠️ {jumlahGagal} dari {daftar.length} cron gagal di run terakhirnya</span>
              ) : (
                <span style={{ color: "var(--ok)" }}>✅ Semua {daftar.length} cron sukses di run terakhirnya</span>
              )}
            </div>
            <button onClick={() => setReloadKey((k) => k + 1)} disabled={loading} style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-soft)", fontWeight: 700, fontSize: "12.5px", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              <IconRefresh size={13} /> Refresh
            </button>
          </div>

          {errorMsg && (
            <div style={{ background: "var(--warn-50)", color: "var(--warn)", padding: "14px 16px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, marginBottom: "18px" }}>
              {errorMsg} — atau cek langsung di{" "}
              <a href={`https://github.com/${GH_OWNER}/${GH_REPO}/actions`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--info)" }}>tab Actions GitHub</a>.
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat status dari GitHub...</div>
          ) : (
            <div className="cron-grid">
              {daftar.map((wf) => {
                const sukses = wf.run?.conclusion === "success";
                const gagal = wf.run?.conclusion === "failure";
                const warna = sukses ? { bg: "var(--ok-50)", fg: "var(--ok)" } : gagal ? { bg: "var(--red-50)", fg: "var(--red-600)" } : { bg: "var(--warn-50)", fg: "var(--warn)" };
                return (
                  <a key={wf.id} href={wf.run?.html_url || `https://github.com/${GH_OWNER}/${GH_REPO}/actions`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", background: "var(--bg)", border: `1px solid ${warna.fg}22`, borderRadius: "14px", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ color: warna.fg }}>{sukses ? <IconCheckCircle size={16} /> : gagal ? <IconXCircle size={16} /> : <IconClockAlert size={16} />}</span>
                      <span style={{ fontSize: "13px", fontWeight: 800, color: "var(--ink)" }}>{wf.name}</span>
                    </div>
                    <div style={{ fontSize: "11.5px", fontWeight: 700, color: warna.fg }}>
                      {wf.run ? (sukses ? "Sukses" : gagal ? "Gagal" : wf.run.status) : "Belum pernah jalan"}
                    </div>
                    {wf.run && <div style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "3px" }}>{formatRelatif(wf.run.run_started_at)}</div>}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
