"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";

// Ikon SVG garis — konsisten dengan admin/monitor-driver & shell admin lainnya
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconRefreshCw = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
);

interface HandoverLog {
  id: string;
  tanggal_shift: string;
  shift: string;
  petugas_keluar: string;
  petugas_masuk: string | null;
  status: string;
  waktu_generate: Timestamp | null;
  waktu_scan: Timestamp | null;
  terlambat?: boolean;
  menit_terlambat?: number | null;
  alasan_telat?: string | null;
}

interface ExtendLog {
  id: string;
  tanggal_shift: string;
  shift: string;
  petugas_keluar: string[];
  petugas_masuk: string[];
  status: string;
  tipe: string | null;
  personil_extend: string | null;
  estimasi_menit: number | null;
  dibuat_pada: Timestamp | null;
  keputusan_pada: Timestamp | null;
  selesai_pada: Timestamp | null;
}

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function formatWaktu(ts: Timestamp | null | undefined): string {
  if (!ts) return "-";
  return ts.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const statusExtendLabel: Record<string, { label: string; bg: string; color: string }> = {
  menunggu_keputusan: { label: "MENUNGGU KEPUTUSAN", bg: "var(--red-50)", color: "var(--red-600)" },
  aktif: { label: "SEMENTARA (AKTIF)", bg: "var(--warn-50)", color: "var(--warn)" },
  permanen: { label: "PERMANEN", bg: "#f5f3ff", color: "var(--accent)" },
  selesai: { label: "SELESAI", bg: "var(--ok-50)", color: "var(--ok)" },
};

export default function MonitorTukarShiftPage() {
  const router = useRouter();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });

  const [activeTab, setActiveTab] = useState<"HANDOVER" | "EXTEND" | "REKAP">("HANDOVER");
  const [handoverList, setHandoverList] = useState<HandoverLog[]>([]);
  const [extendList, setExtendList] = useState<ExtendLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBulan, setFilterBulan] = useState<string>(String(new Date().getMonth()));
  const [filterTahun, setFilterTahun] = useState<string>(String(new Date().getFullYear()));

  useEffect(() => {
    if (!isReady || !session) return;
    const unsub1 = onSnapshot(query(collection(db, "security_shift_handover"), orderBy("waktu_generate", "desc")), (snap) => {
      setHandoverList(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HandoverLog)));
    });
    const unsub2 = onSnapshot(query(collection(db, "security_shift_extend"), orderBy("dibuat_pada", "desc")), (snap) => {
      setExtendList(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExtendLog)));
    });
    return () => { unsub1(); unsub2(); };
  }, [isReady, session]);

  const tahunTersedia = Array.from(
    new Set(handoverList.map((h) => h.tanggal_shift?.substring(0, 4)).filter(Boolean))
  ).sort((a, b) => Number(b) - Number(a));
  if (tahunTersedia.length === 0) tahunTersedia.push(String(new Date().getFullYear()));

  const matchPeriode = (tanggalShift: string) => {
    if (!tanggalShift) return false;
    const [y, m] = tanggalShift.split("-");
    return (filterBulan === "SEMUA" || Number(m) - 1 === Number(filterBulan)) && (filterTahun === "SEMUA" || y === filterTahun);
  };

  const fHandover = handoverList.filter((h) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || h.petugas_keluar?.toLowerCase().includes(q) || (h.petugas_masuk || "").toLowerCase().includes(q);
    return matchPeriode(h.tanggal_shift) && matchSearch;
  });

  const fExtend = extendList.filter((e) => {
    const q = searchQuery.toLowerCase();
    const semuaNama = [...(e.petugas_keluar || []), ...(e.petugas_masuk || []), e.personil_extend || ""].join(" ").toLowerCase();
    const matchSearch = !q || semuaNama.includes(q);
    return matchPeriode(e.tanggal_shift) && matchSearch;
  });

  // Rekap keterlambatan per petugas_masuk (yang melakukan scan) dalam periode terpilih.
  const rekapMap = new Map<string, { total: number; daftar: HandoverLog[] }>();
  handoverList.filter((h) => h.terlambat && h.petugas_masuk && matchPeriode(h.tanggal_shift)).forEach((h) => {
    const nama = h.petugas_masuk as string;
    if (!rekapMap.has(nama)) rekapMap.set(nama, { total: 0, daftar: [] });
    const entry = rekapMap.get(nama)!;
    entry.total += 1;
    entry.daftar.push(h);
  });
  const rekapArr = Array.from(rekapMap.entries())
    .filter(([nama]) => !searchQuery || nama.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => b[1].total - a[1].total);

  if (!isReady || !session) return null;

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
        .site-header { position: sticky; top: 0; z-index: 30; display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
        .back-btn { display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px; }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge { display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info); padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2); }
        .admin-hero { position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff; padding: 34px 20px 50px; text-align: center; background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%); box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5); }
        .admin-hero::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5; background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%); }
        .admin-hero-content { position: relative; }
        .ts-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .ts-table th { padding: 15px; font-weight: bold; background: var(--bg); color: var(--ink-soft); border-bottom: 2px solid var(--line); }
        .ts-table td { padding: 15px; vertical-align: middle; border-bottom: 1px solid var(--line); word-wrap: break-word; }
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .header-title-container { flex-direction: column; align-items: stretch !important; gap: 15px; }
          .search-input-wrapper { width: 100% !important; margin-top: 10px; }
          .search-input-wrapper input { width: 100% !important; max-width: 100% !important; }
          .ts-table, .ts-table tbody { display: block; width: 100%; }
          .ts-table thead { display: none; }
          .ts-table tr { display: block; width: 100%; margin-bottom: 15px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; }
          .ts-table td { display: block; width: 100%; padding: 12px 15px !important; border-bottom: 1px dashed var(--line) !important; text-align: left !important; }
          .ts-table td:last-child { border-bottom: none !important; }
          .ts-table td::before { content: attr(data-label); display: block; font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
        }
      `}} />

      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> <span className="hide-mobile">Kembali ke Control Panel</span>
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> <span className="hide-mobile">Admin:</span> {session.nama}
        </div>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PANTAU TUKAR SHIFT</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Riwayat scan serah terima, extend jaga, dan rekap keterlambatan Security.</p>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>
        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", width: "100%" }}>

          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", overflowX: "auto", paddingBottom: "5px" }}>
            {[
              { id: "HANDOVER", label: `Riwayat Serah Terima (${fHandover.length})` },
              { id: "EXTEND", label: `Riwayat Extend (${fExtend.length})` },
              { id: "REKAP", label: `Rekap Keterlambatan (${rekapArr.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as "HANDOVER" | "EXTEND" | "REKAP")}
                style={{ flexShrink: 0, padding: "10px 16px", borderRadius: "10px", fontWeight: 700, border: "1px solid var(--line)", cursor: "pointer", fontSize: "13px", fontFamily: "inherit", background: activeTab === tab.id ? "var(--accent)" : "var(--surface)", color: activeTab === tab.id ? "#fff" : "var(--ink-soft)", borderColor: activeTab === tab.id ? "var(--accent)" : "var(--line)" }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="header-title-container" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <select value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
              <option value="SEMUA">Semua Bulan</option>
              {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
            </select>
            <select value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
              <option value="SEMUA">Semua Tahun</option>
              {tahunTersedia.map((th) => <option key={th} value={th}>{th}</option>)}
            </select>
            <div className="search-input-wrapper" style={{ position: "relative", width: "220px" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
              <input type="text" placeholder="Cari nama petugas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "100%", background: "var(--bg)", outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {activeTab === "HANDOVER" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
              <table className="ts-table">
                <thead>
                  <tr>
                    <th style={{ width: "16%" }}>Tanggal &middot; Shift</th>
                    <th style={{ width: "24%" }}>Serah Terima</th>
                    <th style={{ width: "16%" }}>Waktu Scan</th>
                    <th style={{ width: "14%" }}>Status</th>
                    <th style={{ width: "30%" }}>Keterlambatan</th>
                  </tr>
                </thead>
                <tbody>
                  {fHandover.length > 0 ? fHandover.map((h) => (
                    <tr key={h.id}>
                      <td data-label="Tanggal · Shift" style={{ color: "var(--ink-soft)" }}>{h.tanggal_shift} &middot; {h.shift}</td>
                      <td data-label="Serah Terima" style={{ fontWeight: "bold", color: "var(--ink)" }}>{h.petugas_keluar} &rarr; {h.petugas_masuk || "-"}</td>
                      <td data-label="Waktu Scan" style={{ color: "var(--muted)" }}>{formatWaktu(h.waktu_scan)}</td>
                      <td data-label="Status">
                        <span style={{ background: h.status === "selesai" ? "var(--ok-50)" : "var(--warn-50)", color: h.status === "selesai" ? "var(--ok)" : "var(--warn)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold" }}>
                          {h.status === "selesai" ? "SELESAI" : "MENUNGGU SCAN"}
                        </span>
                      </td>
                      <td data-label="Keterlambatan">
                        {h.terlambat ? (
                          <div>
                            <span style={{ background: "var(--red-50)", color: "var(--red-600)", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 800 }}>TELAT {h.menit_terlambat}M</span>
                            {h.alasan_telat && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "5px", fontStyle: "italic" }}>&ldquo;{h.alasan_telat}&rdquo;</div>}
                          </div>
                        ) : h.status === "selesai" ? (
                          <span style={{ color: "var(--ok)", fontSize: "11.5px", fontWeight: 700 }}>Tepat Waktu</span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: "11.5px" }}>-</span>
                        )}
                      </td>
                    </tr>
                  )) : <tr><td colSpan={5} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada riwayat serah terima yang cocok.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "EXTEND" && (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
              <table className="ts-table">
                <thead>
                  <tr>
                    <th style={{ width: "16%" }}>Tanggal &middot; Shift</th>
                    <th style={{ width: "22%" }}>Petugas Terkait</th>
                    <th style={{ width: "16%" }}>Status</th>
                    <th style={{ width: "20%" }}>Diputuskan Oleh</th>
                    <th style={{ width: "26%" }}>Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {fExtend.length > 0 ? fExtend.map((e) => {
                    const st = statusExtendLabel[e.status] || { label: e.status?.toUpperCase() || "-", bg: "var(--line)", color: "var(--ink-soft)" };
                    return (
                      <tr key={e.id}>
                        <td data-label="Tanggal · Shift" style={{ color: "var(--ink-soft)" }}>{e.tanggal_shift} &middot; {e.shift}</td>
                        <td data-label="Petugas Terkait" style={{ fontSize: "12px", color: "var(--muted)" }}>Keluar: {(e.petugas_keluar || []).join(", ") || "-"}<br />Masuk: {(e.petugas_masuk || []).join(", ") || "-"}</td>
                        <td data-label="Status">
                          <span style={{ background: st.bg, color: st.color, padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold" }}>{st.label}</span>
                          {e.tipe === "sementara" && e.estimasi_menit != null && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>Estimasi {e.estimasi_menit} menit</div>}
                        </td>
                        <td data-label="Diputuskan Oleh" style={{ fontWeight: "bold", color: "var(--ink)" }}>{e.personil_extend || "-"}</td>
                        <td data-label="Waktu" style={{ fontSize: "12px", color: "var(--muted)" }}>Dibuat: {formatWaktu(e.dibuat_pada)}<br />Selesai: {formatWaktu(e.selesai_pada)}</td>
                      </tr>
                    );
                  }) : <tr><td colSpan={5} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>Belum ada riwayat extend yang cocok.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "REKAP" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {rekapArr.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px" }}>
                  Tidak ada keterlambatan tercatat di periode ini. 🎉
                </div>
              ) : rekapArr.map(([nama, data]) => (
                <div key={nama} style={{ background: "var(--bg)", borderRadius: "14px", border: "1px solid var(--line)", padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--ink)" }}>{nama}</span>
                    <span style={{ background: "var(--red-50)", color: "var(--red-600)", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 800 }}>
                      <IconRefreshCw size={11} /> {data.total}x Telat
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {data.daftar.map((h) => (
                      <div key={h.id} style={{ fontSize: "12px", color: "var(--ink-soft)", padding: "6px 10px", background: "var(--surface)", borderRadius: "8px" }}>
                        <b>{h.tanggal_shift} &middot; {h.shift}</b> &mdash; telat {h.menit_terlambat} menit
                        {h.alasan_telat && <span style={{ color: "var(--muted)", fontStyle: "italic" }}> &middot; &ldquo;{h.alasan_telat}&rdquo;</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
