"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp, where } from "firebase/firestore";
import { daftarTahunSejak, rentangBulanTahun } from "../../../lib/rentangFilter";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import EvaluasiManualButton, { EvaluasiManualData } from "../../../components/EvaluasiManualButton";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";

interface KendaraanLog {
  id: string;
  petugas_security: string;
  kendaraan: string;
  status_kendaraan: string;
  driver_bertugas: string;
  tujuan_keperluan: string;
  kilometer_kendaraan: string;
  waktu_catat: Timestamp | null;
  evaluasiManual?: EvaluasiManualData | null;
}

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function classifyStatus(status: string): { label: string; bg: string; color: string } {
  if (status.includes("Bengkel") || status.includes("Service")) return { label: "SERVICE", bg: "var(--hover)", color: "var(--ink-soft)" };
  if (status.includes("Pulang")) return { label: "PULANG", bg: "var(--accent-50)", color: "var(--accent)" };
  if (status.includes("Standby") || status.includes("Tiba")) return { label: "STANDBY", bg: "var(--ok-50)", color: "var(--ok)" };
  return { label: "KELUAR", bg: "var(--red-50)", color: "var(--red-600)" };
}

export default function MonitorDriverPage() {
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });

  const [logs, setLogs] = useState<KendaraanLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBulan, setFilterBulan] = useState<string>("SEMUA");
  const [filterTahun, setFilterTahun] = useState<string>("SEMUA");

  // §61: muat rentang sesuai filter bulan/tahun (default 60 hari), bukan seluruh histori.
  const rentang = rentangBulanTahun(filterBulan, filterTahun, "SEMUA");
  useEffect(() => {
    if (!isReady || !session) return;
    const syarat = [where("waktu_catat", ">=", Timestamp.fromDate(rentang.dari))];
    if (rentang.sampai) syarat.push(where("waktu_catat", "<", Timestamp.fromDate(rentang.sampai)));
    const unsub = onSnapshot(query(collection(db, "operational_vehicle_logs"), ...syarat, orderBy("waktu_catat", "desc")), (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KendaraanLog)));
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rentang.kunci mewakili rentang
  }, [isReady, session, rentang.kunci]);

  const formatWaktu = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return ts.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const tahunTersedia = daftarTahunSejak();

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
    <AdminShell
      title="Pantau Laporan Driver"
      subtitle="Riwayat pergerakan armada & status kendaraan terkini"
      userName={adminName}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        .drv-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .drv-table th { padding: 15px; font-weight: bold; background: var(--bg); color: var(--ink-soft); border-bottom: 2px solid var(--line); }
        .drv-table td { padding: 15px; vertical-align: middle; border-bottom: 1px solid var(--line); word-wrap: break-word; }
        .status-chip { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
        @media (max-width: 768px) {
          .header-title-container { flex-direction: column; align-items: stretch !important; gap: 15px; }
          .search-input-wrapper { width: 100% !important; margin-top: 10px; }
          .search-input-wrapper input { width: 100% !important; max-width: 100% !important; }
          .drv-table, .drv-table tbody { display: block; width: 100%; }
          .drv-table thead { display: none; }
          .drv-table tr { display: block; width: 100%; margin-bottom: 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); overflow: hidden; }
          .drv-table td { display: block; width: 100%; padding: 12px 15px !important; border-bottom: 1px dashed var(--line) !important; text-align: left !important; }
          .drv-table td:last-child { border-bottom: none !important; }
          .drv-table td::before { content: attr(data-label); display: block; font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
        }
      `}} />

      <Tile style={{ marginBottom: "16px" }}>
        <h2 style={{ margin: "0 0 14px 0", color: "var(--ink)", fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <AdminIcon name="truck" size={18} /> Status Kendaraan Terkini
        </h2>
        <div className="status-chip">
          {Array.from(statusTerkini.entries()).length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: "13px" }}>Belum ada log kendaraan.</div>
          ) : Array.from(statusTerkini.entries()).map(([kendaraan, log]) => {
            const st = classifyStatus(log.status_kendaraan);
            return (
              <div key={kendaraan} style={{ background: st.bg, borderRadius: "18px", padding: "12px 14px" }}>
                <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--ink)", marginBottom: "3px" }}>{kendaraan}</div>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: st.color }}>{st.label} &middot; {log.driver_bertugas || "-"}</div>
              </div>
            );
          })}
        </div>
      </Tile>

      <Tile>
        <div className="header-title-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
          <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px", fontWeight: 700 }}>Riwayat Pergerakan Armada</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <select className="sa-field" aria-label="Filter bulan" value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)}>
              <option value="SEMUA">Semua Bulan</option>
              {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
            </select>
            <select className="sa-field" aria-label="Filter tahun" value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)}>
              <option value="SEMUA">Semua Tahun</option>
              {tahunTersedia.map((th) => <option key={th} value={String(th)}>{th}</option>)}
            </select>
            <label className="sa-search search-input-wrapper" style={{ width: "240px" }}>
              <AdminIcon name="search" size={15} strokeWidth={2} />
              <input type="search" aria-label="Cari kendaraan atau driver" placeholder="Cari kendaraan/driver…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </label>
          </div>
        </div>

        <div style={{ overflowX: "auto", borderRadius: "14px", border: "1px solid var(--line)", width: "100%" }}>
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
                      <span style={{ background: st.bg, color: st.color, padding: "4px 8px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", display: "inline-block" }}>{st.label}</span>
                    </td>
                    <td data-label="Tujuan/Keperluan" style={{ color: "var(--ink-soft)" }}>{l.tujuan_keperluan || "-"}</td>
                    <td data-label="KM · Dicatat Oleh" style={{ color: "var(--muted)", fontSize: "12px" }}>{l.kilometer_kendaraan || "-"} &middot; {l.petugas_security || "-"}</td>
                    <td data-label="Evaluasi" style={{ textAlign: "center" }}>
                      {l.driver_bertugas && l.driver_bertugas !== "-" && tanggalLog && (
                        <EvaluasiManualButton nama={l.driver_bertugas} departemen="Driver" sumberJenis="Log Kendaraan Driver" sumberCollection="operational_vehicle_logs" sumberId={l.id} tanggalLaporan={tanggalLog} dievaluasiOleh={adminName} evaluasiSebelumnya={l.evaluasiManual} />
                      )}
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada log pergerakan armada yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
      </Tile>
    </AdminShell>
  );
}
