"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { tanggalISOWITASekarang } from "../../../lib/shift";
import AdminShell from "../../../components/admin/AdminShell";


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
    <AdminShell title="Monitor Absensi" subtitle="Rekap absen masuk & pulang seluruh staf per hari" userName={adminName}>
      <style dangerouslySetInnerHTML={{ __html: `
        .absensi-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .absensi-table th { text-align: left; padding: 10px 14px; background: var(--bg); color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--line); }
        .absensi-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); color: var(--ink-soft); }
      `}} />
      <div>
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
          <button onClick={handleExportExcel} style={{ padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "bold", background: "var(--ok-solid)", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
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
    </AdminShell>
  );
}
