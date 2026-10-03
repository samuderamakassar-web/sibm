"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { tanggalISOWITASekarang } from "../../../lib/shift";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";

interface RiwayatPotongan {
  tanggal: string;
  alasan: string;
  potongan: number;
}

interface StaffPointDoc {
  nama: string;
  departemen: string;
  bulan: string;
  poin: number;
  riwayat: RiwayatPotongan[];
}

interface BarisRekap {
  nama: string;
  departemen: string;
  poin: number;
  riwayat: RiwayatPotongan[];
}

const POIN_AWAL_BULAN = 100;
// Admin GA, Magang, dan QHSE SENGAJA gak ikut diskor (dikonfirmasi user 20 Sep 2026) --
// cuma OB & CS, Security, Driver yang punya sinyal tugas rutin harian/mingguan yang bisa
// dievaluasi adil. Staf Magang difilter terpisah lewat field `role` (lihat fetch semuaStaf).
const DAFTAR_DEPT_DIPANTAU = ["OB & CS", "Security", "Driver"];

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
function formatBulanLabel(bulanISO: string): string {
  const [y, m] = bulanISO.split("-").map(Number);
  return `${NAMA_BULAN[m - 1]} ${y}`;
}

// 12 bulan terakhir (termasuk bulan berjalan) buat pilihan dropdown.
function daftarBulanTersedia(): string[] {
  const hasil: string[] = [];
  const skrg = tanggalISOWITASekarang();
  const [y, m] = skrg.split("-").map(Number);
  for (let i = 0; i < 12; i++) {
    const d = new Date(y, m - 1 - i, 1);
    hasil.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return hasil;
}

export default function MonitorPoinPage() {
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });
  const adminName = session?.nama || "Admin";

  const [filterBulan, setFilterBulan] = useState(tanggalISOWITASekarang().substring(0, 7));
  // Periode "bulanan" = 1 bulan seperti sebelumnya (filterBulan berlaku, riwayat per-hari
  // bisa ditampilkan). Periode "6bulan"/"1tahun" = rata-rata poin bulanan sepanjang N bulan
  // TERAKHIR dari filterBulan (dikonfirmasi user: cukup rata-rata dari poin bulanan yang
  // sudah ada, gak perlu logika konsistensi baru) -- riwayat per-hari gak relevan lagi di
  // mode ini (beda bulan beda riwayat), jadi baris gak bisa di-expand.
  const [periode, setPeriode] = useState<"bulanan" | "6bulan" | "1tahun">("bulanan");
  const [semuaStaf, setSemuaStaf] = useState<{ nama: string; departemen: string }[]>([]);
  const [poinBulanIni, setPoinBulanIni] = useState<StaffPointDoc[]>([]);
  const [poinMultiBulan, setPoinMultiBulan] = useState<Record<string, StaffPointDoc[]>>({}); // key = bulan "YYYY-MM"
  const [loading, setLoading] = useState(true);
  const [expandedNama, setExpandedNama] = useState<string | null>(null);

  // Roster lengkap SEMUA staf yang dipantau -- ditarik sekali (bukan per-bulan), dipakai
  // supaya staf yang TIDAK PERNAH kena potongan tetap muncul dengan 100 poin, bukan hilang
  // dari rekap begitu saja.
  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "users_master"), where("departemen", "in", DAFTAR_DEPT_DIPANTAU)));
      const staf = snap.docs
        .map((d) => ({ nama: d.data().nama as string, departemen: d.data().departemen as string, role: (d.data().role || "") as string }))
        .filter((u) => !u.role.toLowerCase().includes("magang")); // anak magang gak ikut diskor
      setSemuaStaf(staf.map((u) => ({ nama: u.nama, departemen: u.departemen })));
    })();
  }, []);

  useEffect(() => {
    if (periode !== "bulanan") return;
    const t = setTimeout(() => setLoading(true), 0);
    const unsub = onSnapshot(
      query(collection(db, "staff_points_bulanan"), where("bulan", "==", filterBulan)),
      (snapshot) => {
        setPoinBulanIni(snapshot.docs.map((d) => d.data() as StaffPointDoc));
        setLoading(false);
      }
    );
    return () => { clearTimeout(t); unsub(); };
  }, [filterBulan, periode]);

  // N bulan TERAKHIR dari filterBulan (termasuk filterBulan sendiri) -- dipakai mode 6bulan/1tahun.
  function daftarBulanMundur(bulanAkhir: string, n: number): string[] {
    const [y, m] = bulanAkhir.split("-").map(Number);
    const hasil: string[] = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(y, m - 1 - i, 1);
      hasil.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return hasil;
  }

  useEffect(() => {
    if (periode === "bulanan") return;
    const daftarBulan = daftarBulanMundur(filterBulan, periode === "6bulan" ? 6 : 12);
    let batal = false;
    (async () => {
      setLoading(true);
      const hasil: Record<string, StaffPointDoc[]> = {};
      await Promise.all(daftarBulan.map(async (b) => {
        const snap = await getDocs(query(collection(db, "staff_points_bulanan"), where("bulan", "==", b)));
        hasil[b] = snap.docs.map((d) => d.data() as StaffPointDoc);
      }));
      if (!batal) {
        setPoinMultiBulan(hasil);
        setLoading(false);
      }
    })();
    return () => { batal = true; };
  }, [filterBulan, periode]);

  const rekap: BarisRekap[] = useMemo(() => {
    if (periode === "bulanan") {
      const poinPerNama: Record<string, StaffPointDoc> = {};
      poinBulanIni.forEach((p) => { poinPerNama[p.nama] = p; });

      return semuaStaf
        .map((s) => {
          const data = poinPerNama[s.nama];
          return {
            nama: s.nama,
            departemen: s.departemen,
            poin: data ? data.poin : POIN_AWAL_BULAN,
            riwayat: data ? [...data.riwayat].sort((a, b) => b.tanggal.localeCompare(a.tanggal)) : [],
          };
        })
        .sort((a, b) => b.poin - a.poin || a.nama.localeCompare(b.nama));
    }

    // Mode 6bulan/1tahun: rata-rata poin bulanan tiap staf sepanjang periode (bulan tanpa data
    // dianggap 100, konsisten dengan default bulanan) -- riwayat dikosongkan (gak relevan lintas bulan).
    const daftarBulan = Object.keys(poinMultiBulan);
    return semuaStaf
      .map((s) => {
        const totalPoin = daftarBulan.reduce((sum, b) => {
          const data = (poinMultiBulan[b] || []).find((p) => p.nama === s.nama);
          return sum + (data ? data.poin : POIN_AWAL_BULAN);
        }, 0);
        const rataRata = daftarBulan.length > 0 ? Math.round(totalPoin / daftarBulan.length) : POIN_AWAL_BULAN;
        return { nama: s.nama, departemen: s.departemen, poin: rataRata, riwayat: [] as RiwayatPotongan[] };
      })
      .sort((a, b) => b.poin - a.poin || a.nama.localeCompare(b.nama));
  }, [semuaStaf, poinBulanIni, poinMultiBulan, periode]);

  // Dikelompokkan per departemen -- tiap dept punya "Juara 1" SENDIRI (dikonfirmasi user:
  // "siapa yang juara 1 dari masing-masing OB/CS, Security, Driver"), bukan 1 juara gabungan.
  const rekapPerDept = useMemo(() => {
    const hasil: Record<string, BarisRekap[]> = {};
    DAFTAR_DEPT_DIPANTAU.forEach((dept) => {
      hasil[dept] = rekap.filter((r) => r.departemen === dept);
    });
    return hasil;
  }, [rekap]);


  const handleExportExcel = () => {
    if (rekap.length === 0) {
      showToast("Tidak ada data untuk diexport.", "warning");
      return;
    }
    const headers = ["Nama", "Departemen", "Poin", "Jumlah Potongan", "Detail Potongan"];
    const rows = rekap.map((r) => [
      r.nama,
      r.departemen,
      r.poin,
      r.riwayat.length,
      r.riwayat.map((x) => `${x.tanggal}: ${x.alasan} (${x.potongan < 0 ? `+${-x.potongan}` : `-${x.potongan}`})`).join(" | "),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 60 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Rekap Poin");
    XLSX.writeFile(workbook, `Rekap_Poin_${filterBulan}.xlsx`);
  };

  if (!isReady) return null;

  return (
    <AdminShell
      title="Rekap Poin Staf"
      subtitle="Poin awal 100/bulan, berkurang otomatis kalau misi/tugas tidak diselesaikan sempurna"
      userName={adminName}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .poin-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 12px 8px; border: none; border-bottom: 1px solid var(--line); background: transparent; color: inherit; font: inherit; text-align: left; border-radius: 0; }
        .poin-row:last-child { border-bottom: none; }
        .poin-row:hover { background: var(--hover); }
        .poin-bar-track { flex: 1; height: 8px; background: var(--hover); border-radius: 4px; overflow: hidden; }
        .poin-bar-fill { height: 100%; border-radius: 4px; }
        @media (max-width: 560px) {
          .poin-row { flex-wrap: wrap; }
          .poin-nama { flex: 1 1 100% !important; }
        }
      `}} />

      <div style={{ maxWidth: "900px" }}>
        <Tile compact style={{ marginBottom: "16px", display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <span style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", marginBottom: "6px" }}>Periode</span>
            <div className="sa-tabs" role="tablist" aria-label="Periode" style={{ marginBottom: 0, padding: "4px" }}>
              {([["bulanan", "Bulanan"], ["6bulan", "6 Bulan"], ["1tahun", "1 Tahun"]] as const).map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={periode === key} className={`sa-tab${periode === key ? " is-active" : ""}`} style={{ height: "34px" }} onClick={() => setPeriode(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", marginBottom: "6px" }}>{periode === "bulanan" ? "Bulan" : "Sampai Bulan"}</span>
            <select className="sa-field" value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)}>
              {daftarBulanTersedia().map((b) => <option key={b} value={b}>{formatBulanLabel(b)}</option>)}
            </select>
          </label>
          <button type="button" className="sa-btn is-dark" onClick={handleExportExcel}>
            <AdminIcon name="chart" size={16} /> Export ke Excel
          </button>
        </Tile>

        {/* §82: aturan potongan -- sinkron dengan POTONGAN di scripts/points-deduction.mjs */}
        <details style={{ background: "var(--tile)", borderRadius: "20px", padding: "14px 18px", marginBottom: "16px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: "14px", color: "var(--ink)" }}>Aturan potongan poin (otomatis, dihitung tiap pagi untuk hari kemarin)</summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", marginTop: "12px", fontSize: "12.5px", color: "var(--ink-soft)", lineHeight: 1.6 }}>
            <div><b style={{ color: "var(--ink)" }}>OB & CS</b><br />−5 per sesi checklist (Pagi/Siang/Sore) yang tidak dilaporkan sesuai plot.</div>
            <div><b style={{ color: "var(--ink)" }}>Security</b><br />−10 per shift di bawah minimum 2 sesi patroli.<br />−5 per jendela Siram Tanaman yang tidak diselesaikan.</div>
            <div><b style={{ color: "var(--ink)" }}>Driver</b> <span style={{ fontSize: "11px" }}>(hanya kendaraan bertanda &quot;dikelola tim Driver&quot; di Master Kendaraan)</span><br />
              −3 per trip &quot;Keluar&quot; yang tidak dicatat tiba/pulang dalam 12 jam (driver pembawa).<br />
              −2 per catatan keluar tanpa tujuan / tanpa KM (driver pembawa).<br />
              −5 per kendaraan tidak diinspeksi minggu lalu (semua driver, dicek tiap Senin).<br />
              −5 per kendaraan lewat jadwal servis tanpa catatan servis (semua driver, tiap Senin).</div>
            <div><b style={{ color: "var(--ink)" }}>Semua departemen</b><br />Evaluasi manual Admin GA (tombol Evaluasi di halaman Monitor) untuk temuan lain.</div>
          </div>
        </details>

        {periode !== "bulanan" && (
          <div style={{ background: "var(--info-50)", color: "var(--info)", padding: "12px 16px", borderRadius: "16px", fontSize: "12.5px", fontWeight: 600, marginBottom: "16px" }}>
            Rata-rata poin bulanan {periode === "6bulan" ? "6 bulan" : "1 tahun"} terakhir (sampai {formatBulanLabel(filterBulan)}). Bulan tanpa data dianggap 100 poin.
          </div>
        )}

        {loading ? (
          <Tile style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</Tile>
        ) : rekap.length === 0 ? (
          <Tile style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Belum ada data staf untuk dipantau.</Tile>
        ) : (
          // Dikelompokkan per departemen -- tiap dept punya "Juara 1" (peringkat 1) SENDIRI,
          // bukan dibandingkan lintas departemen (dikonfirmasi user).
          DAFTAR_DEPT_DIPANTAU.map((dept) => {
            const daftarDept = rekapPerDept[dept] || [];
            if (daftarDept.length === 0) return null;
            const poinTertinggiDept = daftarDept[0].poin;
            const poinTerendahDept = daftarDept[daftarDept.length - 1].poin;
            return (
              <Tile key={dept} style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", paddingBottom: "8px" }}>
                  <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>{dept}</h2>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-soft)" }}>{daftarDept.length} staf dipantau</span>
                </div>
                {daftarDept.map((r) => {
                  const isTop = r.poin === poinTertinggiDept;
                  const isBottom = r.poin === poinTerendahDept && poinTertinggiDept !== poinTerendahDept;
                  const warnaBar = r.poin >= 80 ? "var(--ok)" : r.poin >= 50 ? "var(--warn)" : "var(--red-600)";
                  return (
                    <div key={r.nama}>
                      <button
                        type="button"
                        className="poin-row"
                        disabled={periode !== "bulanan"}
                        aria-expanded={periode === "bulanan" ? expandedNama === r.nama : undefined}
                        onClick={() => periode === "bulanan" && setExpandedNama(expandedNama === r.nama ? null : r.nama)}
                        style={{ cursor: periode === "bulanan" ? "pointer" : "default" }}
                      >
                        <div className="poin-nama" style={{ flex: "0 0 170px", minWidth: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                          {isTop && <AdminIcon name="trophy" size={15} style={{ color: "var(--warn)" }} />}
                          {isBottom && <span aria-label="Perlu perhatian" title="Perlu perhatian" style={{ width: "16px", height: "16px", flexShrink: 0, borderRadius: "50%", background: "var(--red-50)", color: "var(--red-600)", fontSize: "11px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>!</span>}
                          <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: "13.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nama}</span>
                        </div>
                        <div className="poin-bar-track">
                          <div className="poin-bar-fill" style={{ width: `${r.poin}%`, background: warnaBar }} />
                        </div>
                        <div style={{ fontWeight: 800, fontSize: "15px", color: warnaBar, width: "40px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.poin}</div>
                        {periode === "bulanan" && <AdminIcon name="chevronRight" size={14} style={{ color: "var(--muted)", transform: expandedNama === r.nama ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />}
                      </button>
                      {periode === "bulanan" && expandedNama === r.nama && (
                        <div style={{ padding: "10px 12px 14px", margin: "0 -8px", background: "var(--bg)", borderRadius: "14px", fontSize: "12.5px" }}>
                          {r.riwayat.length === 0 ? (
                            <div style={{ color: "var(--muted)" }}>Tidak ada potongan bulan ini — pertahankan!</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {/* potongan NEGATIF = evaluasi manual Admin GA yang MENAMBAH poin (bonus), lihat
                                  EvaluasiManualButton.tsx -- ditampilkan hijau "+X", beda dari potongan otomatis
                                  (selalu positif, dikurangi) yang tetap merah "-X" seperti sebelumnya. */}
                              {r.riwayat.map((h, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "8px 12px", background: "var(--surface)", borderRadius: "10px" }}>
                                  <span style={{ color: "var(--ink-soft)" }}>{h.tanggal} &middot; {h.alasan}</span>
                                  <span style={{ fontWeight: 800, color: h.potongan < 0 ? "var(--ok)" : "var(--red-600)", flexShrink: 0 }}>{h.potongan < 0 ? `+${-h.potongan}` : `-${h.potongan}`}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Tile>
            );
          })
        )}
      </div>
    </AdminShell>
  );
}
