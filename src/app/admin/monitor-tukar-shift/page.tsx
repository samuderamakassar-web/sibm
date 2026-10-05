"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp, where } from "firebase/firestore";
import { daftarTahunSejak } from "../../../lib/rentangFilter";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";

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
  tanpa_serah_terima?: boolean;
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
  permanen: { label: "PERMANEN", bg: "var(--accent-50)", color: "var(--accent)" },
  selesai: { label: "SELESAI", bg: "var(--ok-50)", color: "var(--ok)" },
};

export default function MonitorTukarShiftPage() {
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

  // Rentang tanggal_shift ("YYYY-MM-DD") dari filter; tanpa filter -> 90 hari terakhir.
  const rentangTukar = (() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const tahun = filterTahun !== "SEMUA" ? Number(filterTahun) : null;
    const bulan = filterBulan !== "SEMUA" ? Number(filterBulan) : null;
    let dari: string;
    let sampai: string | null;
    if (tahun !== null || bulan !== null) {
      const th = tahun ?? new Date().getFullYear();
      if (bulan !== null) {
        dari = `${th}-${pad(bulan + 1)}-01`;
        sampai = bulan === 11 ? `${th + 1}-01-01` : `${th}-${pad(bulan + 2)}-01`;
      } else {
        dari = `${th}-01-01`;
        sampai = `${th + 1}-01-01`;
      }
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      dari = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      sampai = null;
    }
    return { dari, sampai, kunci: `${dari}|${sampai}` };
  })();

  useEffect(() => {
    if (!isReady || !session) return;
    // §70: dimuat per rentang filter (tanggal_shift "YYYY-MM-DD", filter 1 field) -- dulu seluruh koleksi.
    const syarat = (koleksi: string) => {
      const s = [where("tanggal_shift", ">=", rentangTukar.dari)];
      if (rentangTukar.sampai) s.push(where("tanggal_shift", "<", rentangTukar.sampai));
      return query(collection(db, koleksi), ...s, orderBy("tanggal_shift", "desc"));
    };
    const unsub1 = onSnapshot(syarat("security_shift_handover"), (snap) => {
      setHandoverList(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HandoverLog))
        .sort((a, b) => (b.waktu_generate?.toMillis?.() || 0) - (a.waktu_generate?.toMillis?.() || 0)));
    });
    const unsub2 = onSnapshot(syarat("security_shift_extend"), (snap) => {
      setExtendList(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExtendLog))
        .sort((a, b) => (b.dibuat_pada?.toMillis?.() || 0) - (a.dibuat_pada?.toMillis?.() || 0)));
    });
    return () => { unsub1(); unsub2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rentangTukar.kunci mewakili rentang
  }, [isReady, session, rentangTukar.kunci]);

  const tahunTersedia = daftarTahunSejak().map(String);

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
    <AdminShell
      title="Pantau Tukar Shift"
      subtitle="Riwayat scan serah terima, extend jaga, dan rekap keterlambatan Security"
      userName={session.nama || "Admin"}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
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
          .ts-table tr { display: block; width: 100%; margin-bottom: 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); overflow: hidden; }
          .ts-table td { display: block; width: 100%; padding: 12px 15px !important; border-bottom: 1px dashed var(--line) !important; text-align: left !important; }
          .ts-table td:last-child { border-bottom: none !important; }
          .ts-table td::before { content: attr(data-label); display: block; font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
        }
      `}} />

      <div className="sa-tabs" role="tablist" aria-label="Jenis riwayat">
        {[
          { id: "HANDOVER", label: `Serah Terima (${fHandover.length})` },
          { id: "EXTEND", label: `Extend (${fExtend.length})` },
          { id: "REKAP", label: `Rekap Keterlambatan (${rekapArr.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`sa-tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id as "HANDOVER" | "EXTEND" | "REKAP")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Tile>
          <div className="header-title-container" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <select className="sa-field" aria-label="Filter bulan" value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)}>
              <option value="SEMUA">Semua Bulan</option>
              {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
            </select>
            <select className="sa-field" aria-label="Filter tahun" value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)}>
              <option value="SEMUA">Semua Tahun</option>
              {tahunTersedia.map((th) => <option key={th} value={th}>{th}</option>)}
            </select>
            <label className="sa-search search-input-wrapper" style={{ width: "240px" }}>
              <AdminIcon name="search" size={15} strokeWidth={2} />
              <input type="search" aria-label="Cari nama petugas" placeholder="Cari nama petugas…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </label>
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
                        ) : h.tanpa_serah_terima ? (
                          <div>
                            <span style={{ background: "var(--warn-50, #fff4e5)", color: "var(--warn)", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 800 }}>TANPA QR</span>
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
                  Tidak ada keterlambatan tercatat di periode ini.
                </div>
              ) : rekapArr.map(([nama, data]) => (
                <div key={nama} style={{ background: "var(--bg)", borderRadius: "14px", border: "1px solid var(--line)", padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--ink)" }}>{nama}</span>
                    <span style={{ background: "var(--red-50)", color: "var(--red-600)", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "5px" }}>
                      <AdminIcon name="refresh" size={12} strokeWidth={2} /> {data.total}x Telat
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
      </Tile>
    </AdminShell>
  );
}
