"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import EvaluasiManualButton from "../../../components/EvaluasiManualButton";

// Ikon SVG garis — konsisten dengan admin/monitor-security & admin/monitor-ob
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconTruck = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13" /><rect x="3" y="13" width="18" height="5" rx="1.5" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" /></svg>
);

interface KendaraanLog {
  id: string;
  petugas_security: string;
  kendaraan: string;
  status_kendaraan: string;
  driver_bertugas: string;
  tujuan_keperluan: string;
  kilometer_kendaraan: string;
  waktu_catat: Timestamp | null;
}

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function classifyStatus(status: string): { label: string; bg: string; color: string } {
  if (status.includes("Bengkel") || status.includes("Service")) return { label: "SERVICE", bg: "var(--line)", color: "var(--ink-soft)" };
  if (status.includes("Pulang")) return { label: "PULANG", bg: "rgba(124,58,237,0.12)", color: "var(--accent)" };
  if (status.includes("Standby") || status.includes("Tiba")) return { label: "STANDBY", bg: "var(--ok-50)", color: "var(--ok)" };
  return { label: "KELUAR", bg: "var(--red-50)", color: "var(--red-600)" };
}

export default function MonitorDriverPage() {
  const router = useRouter();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });

  const [logs, setLogs] = useState<KendaraanLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBulan, setFilterBulan] = useState<string>("SEMUA");
  const [filterTahun, setFilterTahun] = useState<string>("SEMUA");

  useEffect(() => {
    if (!isReady || !session) return;
    const unsub = onSnapshot(query(collection(db, "operational_vehicle_logs"), orderBy("waktu_catat", "desc")), (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KendaraanLog)));
    });
    return () => unsub();
  }, [isReady, session]);

  const formatWaktu = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return ts.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const tahunTersedia = Array.from(
    new Set(logs.map((l) => l.waktu_catat?.toDate().getFullYear()).filter((y): y is number => !!y))
  ).sort((a, b) => b - a);

  const fLogs = logs.filter((l) => {
    const d = l.waktu_catat?.toDate();
    const matchBulan = filterBulan === "SEMUA" || d?.getMonth() === Number(filterBulan);
    const matchTahun = filterTahun === "SEMUA" || d?.getFullYear() === Number(filterTahun);
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || l.kendaraan?.toLowerCase().includes(q) || l.driver_bertugas?.toLowerCase().includes(q) || l.petugas_security?.toLowerCase().includes(q);
    return matchBulan && matchTahun && matchSearch;
  });

  // Status TERKINI per kendaraan -- diambil dari log paling baru (logs sudah terurut desc).
  const statusTerkini = new Map<string, KendaraanLog>();
  logs.forEach((l) => {
    if (l.kendaraan && !statusTerkini.has(l.kendaraan)) statusTerkini.set(l.kendaraan, l);
  });

  if (!isReady || !session) return null;
  const adminName = session.nama || "Admin";

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px", overflowX: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        * { box-sizing: border-box; }
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .back-btn { display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px; }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge { display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info); padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2); }
        .admin-hero {
          position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff;
          padding: 34px 20px 50px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .admin-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .admin-hero-content { position: relative; }
        .drv-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .drv-table th { padding: 15px; font-weight: bold; background: var(--bg); color: var(--ink-soft); border-bottom: 2px solid var(--line); }
        .drv-table td { padding: 15px; vertical-align: middle; border-bottom: 1px solid var(--line); word-wrap: break-word; }
        .status-chip { display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); margin-bottom: 25px; }
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .header-title-container { flex-direction: column; align-items: stretch !important; gap: 15px; }
          .search-input-wrapper { width: 100% !important; margin-top: 10px; }
          .search-input-wrapper input { width: 100% !important; max-width: 100% !important; }
          .drv-table, .drv-table tbody { display: block; width: 100%; }
          .drv-table thead { display: none; }
          .drv-table tr { display: block; width: 100%; margin-bottom: 15px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; }
          .drv-table td { display: block; width: 100%; padding: 12px 15px !important; border-bottom: 1px dashed var(--line) !important; text-align: left !important; }
          .drv-table td:last-child { border-bottom: none !important; }
          .drv-table td::before { content: attr(data-label); display: block; font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
        }
      `}} />

      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> <span className="hide-mobile">Kembali ke Control Panel</span>
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> <span className="hide-mobile">Admin:</span> {adminName}
        </div>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PANTAU LAPORAN DRIVER</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Riwayat pergerakan armada & status kendaraan terkini</p>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>
        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", width: "100%" }}>

          <h2 style={{ margin: "0 0 12px 0", color: "var(--ink)", fontSize: "16px" }}><IconTruck size={16} /> Status Kendaraan Terkini</h2>
          <div className="status-chip">
            {Array.from(statusTerkini.entries()).length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: "13px" }}>Belum ada log kendaraan.</div>
            ) : Array.from(statusTerkini.entries()).map(([kendaraan, log]) => {
              const st = classifyStatus(log.status_kendaraan);
              return (
                <div key={kendaraan} style={{ background: st.bg, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "11.5px", fontWeight: 800, color: "var(--ink)", marginBottom: "3px" }}>{kendaraan}</div>
                  <div style={{ fontSize: "10.5px", fontWeight: 700, color: st.color }}>{st.label} &middot; {log.driver_bertugas || "-"}</div>
                </div>
              );
            })}
          </div>

          <div className="header-title-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>Riwayat Pergerakan Armada</h2>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <select value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                <option value="SEMUA">Semua Bulan</option>
                {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
              </select>
              <select value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                <option value="SEMUA">Semua Tahun</option>
                {tahunTersedia.map((th) => <option key={th} value={String(th)}>{th}</option>)}
              </select>
              <div className="search-input-wrapper" style={{ position: "relative", width: "220px" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input type="text" placeholder="Cari kendaraan/driver..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "100%", background: "var(--bg)", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
            <table className="drv-table">
              <thead>
                <tr>
                  <th style={{ width: "16%" }}>Waktu</th>
                  <th style={{ width: "18%" }}>Kendaraan</th>
                  <th style={{ width: "16%" }}>Driver Bertugas</th>
                  <th style={{ width: "14%" }}>Status</th>
                  <th style={{ width: "18%" }}>Tujuan/Keperluan</th>
                  <th style={{ width: "12%" }}>KM &middot; Dicatat Oleh</th>
                  <th style={{ width: "12%", textAlign: "center" }}>Evaluasi</th>
                </tr>
              </thead>
              <tbody>
                {fLogs.length > 0 ? fLogs.map((l) => {
                  const st = classifyStatus(l.status_kendaraan);
                  const tanggalLog = l.waktu_catat?.toDate().toISOString().substring(0, 10) || "";
                  return (
                    <tr key={l.id}>
                      <td data-label="Waktu" style={{ color: "var(--muted)" }}>{formatWaktu(l.waktu_catat)}</td>
                      <td data-label="Kendaraan" style={{ fontWeight: "bold", color: "var(--ink)" }}>{l.kendaraan}</td>
                      <td data-label="Driver Bertugas">{l.driver_bertugas || "-"}</td>
                      <td data-label="Status">
                        <span style={{ background: st.bg, color: st.color, padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", display: "inline-block" }}>{st.label}</span>
                      </td>
                      <td data-label="Tujuan/Keperluan" style={{ color: "var(--ink-soft)" }}>{l.tujuan_keperluan || "-"}</td>
                      <td data-label="KM · Dicatat Oleh" style={{ color: "var(--muted)", fontSize: "12px" }}>{l.kilometer_kendaraan || "-"} &middot; {l.petugas_security || "-"}</td>
                      <td data-label="Evaluasi" style={{ textAlign: "center" }}>
                        {l.driver_bertugas && l.driver_bertugas !== "-" && tanggalLog && (
                          <EvaluasiManualButton nama={l.driver_bertugas} departemen="Driver" sumberJenis="Log Kendaraan Driver" sumberId={l.id} tanggalLaporan={tanggalLog} dievaluasiOleh={adminName} />
                        )}
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada log pergerakan armada yang cocok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
