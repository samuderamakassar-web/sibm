"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
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
const IconChevronDown = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
);

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
  const router = useRouter();
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
        .poin-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); cursor: pointer; }
        .poin-row:last-child { border-bottom: none; }
        .poin-row:hover { background: var(--bg); }
        .poin-bar-track { flex: 1; height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
        .poin-bar-fill { height: 100%; border-radius: 4px; }
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
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 900, letterSpacing: "1px" }}>REKAP POIN STAF</h1>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Poin awal 100/bulan, berkurang otomatis kalau misi/tugas tidak diselesaikan sempurna.</p>
        </div>
      </div>

      <div style={{ maxWidth: "900px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", padding: "18px 20px", marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "5px" }}>Periode</label>
            <div style={{ display: "flex", gap: "6px" }}>
              {([["bulanan", "Bulanan"], ["6bulan", "6 Bulan"], ["1tahun", "1 Tahun"]] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setPeriode(key)} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid var(--line)", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, background: periode === key ? "var(--info)" : "var(--bg)", color: periode === key ? "#fff" : "var(--ink-soft)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "5px" }}>{periode === "bulanan" ? "Bulan" : "Sampai Bulan"}</label>
            <select
              value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none" }}
            >
              {daftarBulanTersedia().map((b) => <option key={b} value={b}>{formatBulanLabel(b)}</option>)}
            </select>
          </div>
          <button onClick={handleExportExcel} style={{ padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "bold", background: "var(--ok)", color: "white", display: "flex", alignItems: "center", gap: "6px" }}>
            📊 Export ke Excel
          </button>
        </div>

        {periode !== "bulanan" && (
          <div style={{ background: "var(--info-50)", color: "var(--info)", padding: "12px 16px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, marginBottom: "16px" }}>
            Rata-rata poin bulanan {periode === "6bulan" ? "6 bulan" : "1 tahun"} terakhir (sampai {formatBulanLabel(filterBulan)}). Bulan tanpa data dianggap 100 poin.
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)", background: "var(--surface)", borderRadius: "20px", border: "1px solid var(--line)" }}>Memuat...</div>
        ) : rekap.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)", background: "var(--surface)", borderRadius: "20px", border: "1px solid var(--line)" }}>Belum ada data staf untuk dipantau.</div>
        ) : (
          // Dikelompokkan per departemen -- tiap dept punya "Juara 1" (peringkat 1) SENDIRI,
          // bukan dibandingkan lintas departemen (dikonfirmasi user).
          DAFTAR_DEPT_DIPANTAU.map((dept) => {
            const daftarDept = rekapPerDept[dept] || [];
            if (daftarDept.length === 0) return null;
            const poinTertinggiDept = daftarDept[0].poin;
            const poinTerendahDept = daftarDept[daftarDept.length - 1].poin;
            return (
              <div key={dept} style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", overflow: "hidden", marginBottom: "16px" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
                  {dept} &middot; {daftarDept.length} staf dipantau
                </div>
                {daftarDept.map((r) => {
                  const isTop = r.poin === poinTertinggiDept;
                  const isBottom = r.poin === poinTerendahDept && poinTertinggiDept !== poinTerendahDept;
                  const warnaBar = r.poin >= 80 ? "var(--ok)" : r.poin >= 50 ? "var(--warn)" : "var(--red-600)";
                  return (
                    <div key={r.nama}>
                      <div className="poin-row" onClick={() => periode === "bulanan" && setExpandedNama(expandedNama === r.nama ? null : r.nama)} style={{ cursor: periode === "bulanan" ? "pointer" : "default" }}>
                        <div style={{ flex: "0 0 150px", minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {isTop && "🏆 "}{isBottom && "⚠️ "}{r.nama}
                          </div>
                        </div>
                        <div className="poin-bar-track">
                          <div className="poin-bar-fill" style={{ width: `${r.poin}%`, background: warnaBar }} />
                        </div>
                        <div style={{ fontWeight: 800, fontSize: "14px", color: warnaBar, width: "40px", textAlign: "right" }}>{r.poin}</div>
                        {periode === "bulanan" && <IconChevronDown size={14} color="var(--muted)" />}
                      </div>
                      {periode === "bulanan" && expandedNama === r.nama && (
                        <div style={{ padding: "10px 20px 16px 20px", background: "var(--bg)", fontSize: "12px" }}>
                          {r.riwayat.length === 0 ? (
                            <div style={{ color: "var(--muted)" }}>Tidak ada potongan bulan ini — pertahankan! 🎉</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {/* potongan NEGATIF = evaluasi manual Admin GA yang MENAMBAH poin (bonus), lihat
                                  EvaluasiManualButton.tsx -- ditampilkan hijau "+X", beda dari potongan otomatis
                                  (selalu positif, dikurangi) yang tetap merah "-X" seperti sebelumnya. */}
                              {r.riwayat.map((h, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "6px 10px", background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--line)" }}>
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
