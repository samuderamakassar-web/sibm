"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { tanggalISOWITASekarang } from "../../../lib/shift";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

interface AbsensiLog {
  id: string;
  nama: string;
  departemen: string;
  tanggal: string;
  waktu_checkin: Timestamp | null;
  waktu_checkout: Timestamp | null;
}

const DAFTAR_DEPT = ["Semua", "OB & CS", "Security", "Driver", "QHSE", "Admin GA"];

function formatJam(ts: Timestamp | null | undefined): string {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" }).format(ts.toDate());
}

function hitungDurasiJam(masuk: Timestamp | null | undefined, pulang: Timestamp | null | undefined): string {
  if (!masuk || !pulang) return "-";
  const jam = (pulang.toMillis() - masuk.toMillis()) / (1000 * 60 * 60);
  if (jam < 0) return "-";
  return `${jam.toFixed(1)} jam`;
}

function formatTanggalLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MonitorAbsensiPage() {
  const router = useRouter();
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });
  const adminName = session?.nama || "Admin";

  const [data, setData] = useState<AbsensiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTanggal, setFilterTanggal] = useState(tanggalISOWITASekarang());
  const [filterDept, setFilterDept] = useState("Semua");

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "attendance_logs"), orderBy("tanggal", "desc"), limit(500)),
      (snapshot) => {
        setData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as AbsensiLog)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = data
    .filter((d) => d.tanggal === filterTanggal && (filterDept === "Semua" || d.departemen === filterDept))
    .sort((a, b) => a.nama.localeCompare(b.nama));

  const handleExportExcel = () => {
    if (filtered.length === 0) {
      showToast("Tidak ada data pada filter ini untuk diexport.", "warning");
      return;
    }
    const headers = ["Tanggal", "Nama", "Departemen", "Jam Masuk", "Jam Pulang", "Durasi Kerja"];
    const rows = filtered.map((d) => [
      d.tanggal,
      d.nama,
      d.departemen,
      formatJam(d.waktu_checkin),
      formatJam(d.waktu_checkout),
      hitungDurasiJam(d.waktu_checkin, d.waktu_checkout),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = headers.map(() => ({ wch: 20 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Absensi");
    XLSX.writeFile(workbook, `Absensi_${filterTanggal}.xlsx`);
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .back-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px;
        }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge {
          display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info);
          padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2);
        }
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
        .absensi-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .absensi-table th { text-align: left; padding: 10px 14px; background: var(--bg); color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--line); }
        .absensi-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); color: var(--ink-soft); }
      `}} />
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> {adminName}
        </div>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 900, letterSpacing: "1px" }}>MONITOR ABSENSI</h1>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Rekap absen masuk & pulang seluruh staf per hari.</p>
        </div>
      </div>

      <div style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", padding: "18px 20px", marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "5px" }}>Tanggal</label>
            <input
              type="date" value={filterTanggal} onChange={(e) => setFilterTanggal(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "5px" }}>Departemen</label>
            <select
              value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none" }}
            >
              {DAFTAR_DEPT.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <button onClick={handleExportExcel} style={{ padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "bold", background: "var(--ok)", color: "white", display: "flex", alignItems: "center", gap: "6px" }}>
            📊 Export ke Excel
          </button>
        </div>

        <div style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
            {formatTanggalLabel(filterTanggal)} &middot; {filtered.length} staf tercatat
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Belum ada data absensi untuk filter ini.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="absensi-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Departemen</th>
                    <th>Jam Masuk</th>
                    <th>Jam Pulang</th>
                    <th>Durasi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 700, color: "var(--ink)" }}>{d.nama}</td>
                      <td>{d.departemen}</td>
                      <td>{formatJam(d.waktu_checkin)}</td>
                      <td>{formatJam(d.waktu_checkout)}</td>
                      <td>{hitungDurasiJam(d.waktu_checkin, d.waktu_checkout)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
