"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Html5QrcodeScanner } from "html5-qrcode";
import { useToast } from "../ui/ToastProvider";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan dashboard/security & dashboard/ob
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconFireExtinguisher = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3v2" /><path d="M8 5h6l1 2H7z" /><path d="M9 7v3" /><path d="M15 7l4-2" /><path d="M9 10h4a3 3 0 0 1 3 3v8H8v-8a3 3 0 0 1 1-2z" /><path d="M8 15h8" /></svg>
);
const IconChevronDown = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
);
const IconQrCode = ({ size = 13, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01" /></svg>
);
const IconCheck = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const IconX = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
);
const IconTarget = ({ size = 17, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>
);
const IconInboxEmpty = ({ size = 30, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);

interface TerakhirInspeksi {
  petugas: string;
  waktu: Timestamp | null;
  bulan_tahun: string;
  kondisi_tabung: string;
  tekanan: string;
  segel_utuh: boolean;
}

interface AparUnit {
  id: string;
  lantai: string;
  kode: string;
  lokasi: string;
  kadaluarsa: string;
  terakhir_inspeksi: TerakhirInspeksi | null;
}

const bulanTahunSekarang = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const KONDISI_TABUNG_OPSI = ["Baik", "Berkarat", "Bocor / Rusak"];
const TEKANAN_OPSI = ["Normal", "Kurang", "Habis"];

export default function InspeksiAparPage() {
  const router = useRouter();
  const showToast = useToast();

  const [picName, setPicName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [unitApar, setUnitApar] = useState<AparUnit[]>([]);
  const [lantaiAktif, setLantaiAktif] = useState<string>("");

  const [scanTarget, setScanTarget] = useState<AparUnit | null>(null);
  const [formTarget, setFormTarget] = useState<AparUnit | null>(null);
  const [kondisiTabung, setKondisiTabung] = useState(KONDISI_TABUNG_OPSI[0]);
  const [tekanan, setTekanan] = useState(TEKANAN_OPSI[0]);
  const [segelUtuh, setSegelUtuh] = useState(true);
  const [catatan, setCatatan] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) {
      router.push("/dashboard/security");
      return;
    }
    setTimeout(() => { setPicName(nama); setIsReady(true); }, 0);
  }, [router]);

  useEffect(() => {
    const q = query(collection(db, "apar_units"), orderBy("lantai", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: AparUnit[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() } as AparUnit));
      setUnitApar(arr);
      setLantaiAktif(prev => prev || (arr[0]?.lantai ?? ""));
    });
    return () => unsub();
  }, []);

  const bulanIni = bulanTahunSekarang();

  const daftarLantai = useMemo(() => Array.from(new Set(unitApar.map(u => u.lantai))), [unitApar]);
  const totalUnit = unitApar.length;
  const totalSudah = unitApar.filter(u => u.terakhir_inspeksi?.bulan_tahun === bulanIni).length;
  const progressPersen = totalUnit > 0 ? (totalSudah / totalUnit) * 100 : 0;

  const getStatusLantai = (lantai: string) => {
    const unitLantai = unitApar.filter(u => u.lantai === lantai);
    const selesai = unitLantai.filter(u => u.terakhir_inspeksi?.bulan_tahun === bulanIni).length;
    return { total: unitLantai.length, selesai };
  };

  // ==========================================
  // SCAN QR — 2 fungsi: dari dalam app (petugas) buka form inspeksi;
  // kalau discan orang lain di luar app, URL yang sama membuka /qr-apar (halaman publik read-only).
  // ==========================================
  useEffect(() => {
    if (!scanTarget) return;
    const scanner = new Html5QrcodeScanner("reader-apar", { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }, false);
    scanner.render((decodedText) => {
      let idHasilScan = "";
      try {
        idHasilScan = new URL(decodedText).searchParams.get("id") || "";
      } catch {
        idHasilScan = "";
      }

      if (idHasilScan && idHasilScan === scanTarget.id) {
        scanner.clear();
        setFormTarget(scanTarget);
        setScanTarget(null);
      } else {
        showToast(`QR Code salah! Ini bukan QR untuk ${scanTarget.kode}.`, "warning");
      }
    }, () => {});

    return () => { scanner.clear().catch(e => console.error(e)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanTarget]);

  const handleSubmitInspeksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTarget) return;
    setIsSaving(true);

    try {
      await addDoc(collection(db, "apar_inspections"), {
        apar_id: formTarget.id,
        kode: formTarget.kode,
        lantai: formTarget.lantai,
        bulan_tahun: bulanIni,
        petugas: picName,
        waktu_inspeksi: serverTimestamp(),
        kondisi_tabung: kondisiTabung,
        tekanan: tekanan,
        segel_utuh: segelUtuh,
        catatan: catatan
      });

      await updateDoc(doc(db, "apar_units", formTarget.id), {
        terakhir_inspeksi: {
          petugas: picName,
          waktu: serverTimestamp(),
          bulan_tahun: bulanIni,
          kondisi_tabung: kondisiTabung,
          tekanan: tekanan,
          segel_utuh: segelUtuh
        }
      });

      showToast(`Inspeksi ${formTarget.kode} berhasil dicatat!`, "success");
      setFormTarget(null);
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan hasil inspeksi.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>

      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        * { box-sizing: border-box; }
        .top-bar {
          display: flex; align-items: center; gap: 12px; padding: 14px 20px;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line);
          position: sticky; top: 0; z-index: 50;
        }
        .back-btn {
          background: var(--bg); border: 1px solid var(--line); border-radius: 10px; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-soft); transition: 0.2s;
        }
        .back-btn:hover { background: var(--line); }

        .page-hero {
          position: relative; overflow: hidden; border-radius: 0 0 30px 30px; color: #fff;
          padding: 36px 20px 60px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .page-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .page-hero-content { position: relative; }

        .panel { background: var(--surface); padding: 22px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid var(--line); }
        .floor-card { background: var(--surface); border-radius: 16px; overflow: hidden; }
        .floor-head { padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .unit-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: var(--surface); border-radius: 10px; flex-wrap: wrap; gap: 10px; }
        .scan-btn { background: var(--red-600); color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 6px; font-family: inherit; }
        .status-pill { font-size: 10px; font-weight: bold; padding: 3px 9px; border-radius: 20px; display: inline-flex; align-items: center; gap: 4px; }

        .choice-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .choice-item { padding: 10px 4px; border-radius: 10px; cursor: pointer; text-align: center; font-weight: 700; font-size: 11px; transition: 0.2s; border: 1px solid var(--line); background: var(--bg); color: var(--muted); }

        @media (max-width: 640px) {
          .panel { padding: 16px !important; border-radius: 16px !important; }
        }
      `}} />

      {/* 🔹 TOP BAR */}
      <div className="top-bar">
        <button className="back-btn" onClick={() => router.push("/dashboard/security")}><IconArrowLeft size={16} /></button>
        <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Inspeksi APAR</span>
      </div>

      {/* 🔹 HERO */}
      <div className="page-hero">
        <div className="page-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>INSPEKSI APAR</h1>
          <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>Pemeriksaan bulanan kondisi alat pemadam api ringan per lantai</p>
        </div>
      </div>

      <div style={{ maxWidth: "800px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>

        {/* KARTU PROGRESS */}
        <div className="panel" style={{ marginBottom: "25px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}><IconTarget size={17} color="var(--muted)" /> Progres Inspeksi Bulan Ini</h2>
            <span style={{ fontWeight: "900", color: progressPersen === 100 ? "var(--ok)" : "var(--red-600)" }}>{totalSudah} / {totalUnit} Unit</span>
          </div>
          <div style={{ width: "100%", background: "var(--line)", borderRadius: "50px", height: "12px", overflow: "hidden" }}>
            <div style={{ height: "100%", background: progressPersen === 100 ? "var(--ok)" : "linear-gradient(90deg, var(--red-600), var(--warn))", width: `${progressPersen}%`, transition: "width 0.5s ease-in-out" }}></div>
          </div>
        </div>

        {unitApar.length === 0 ? (
          <div className="panel" style={{ textAlign: "center", padding: "50px 20px", color: "var(--muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <IconInboxEmpty size={30} color="var(--muted)" />
            Belum ada unit APAR terdaftar. Hubungi Admin GA untuk menambahkan data master APAR.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {daftarLantai.map((lantai) => {
              const stat = getStatusLantai(lantai);
              const isLengkap = stat.selesai === stat.total;
              const isAktif = lantaiAktif === lantai;

              return (
                <div key={lantai} className="floor-card" style={{ border: isLengkap ? "2px solid rgba(22,163,74,0.3)" : "1px solid var(--line)" }}>
                  <div onClick={() => setLantaiAktif(isAktif ? "" : lantai)} className="floor-head" style={{ background: isLengkap ? "var(--ok-50)" : (isAktif ? "var(--bg)" : "var(--surface)") }}>
                    <div>
                      <h3 style={{ margin: "0 0 4px 0", color: isLengkap ? "var(--ok)" : "var(--ink)", fontSize: "16px" }}>{lantai}</h3>
                      <div style={{ fontSize: "12px", color: isLengkap ? "var(--ok)" : "var(--muted)", fontWeight: "bold" }}>{stat.selesai} / {stat.total} Unit Diinspeksi</div>
                    </div>
                    <div style={{ transform: isAktif ? "rotate(180deg)" : "rotate(0deg)", transition: "0.3s", color: "var(--muted)" }}><IconChevronDown size={18} /></div>
                  </div>

                  {isAktif && (
                    <div style={{ padding: "15px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "10px", background: "var(--bg)" }}>
                      {unitApar.filter(u => u.lantai === lantai).map((unit) => {
                        const sudah = unit.terakhir_inspeksi?.bulan_tahun === bulanIni;
                        return (
                          <div key={unit.id} className="unit-row" style={{ border: sudah ? "1px solid rgba(22,163,74,0.35)" : "1px solid var(--line)" }}>
                            <div>
                              <div style={{ fontSize: "14px", color: sudah ? "var(--ok)" : "var(--ink-soft)", fontWeight: "bold" }}>{unit.kode}</div>
                              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{unit.lokasi}</div>
                              <div style={{ marginTop: "6px" }}>
                                <span className="status-pill" style={sudah ? { background: "var(--ok-50)", color: "var(--ok)" } : { background: "var(--warn-50)", color: "var(--warn)" }}>
                                  {sudah ? <><IconCheck size={10} /> Sudah diinspeksi ({unit.terakhir_inspeksi?.petugas})</> : "Belum diinspeksi bulan ini"}
                                </span>
                              </div>
                            </div>
                            <button onClick={() => setScanTarget(unit)} className="scan-btn"><IconQrCode size={13} /> Scan QR</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ======================================= */}
      {/* MODAL SCANNER QR                        */}
      {/* ======================================= */}
      {scanTarget && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.95)", zIndex: 1000, display: "flex", flexDirection: "column", backdropFilter: "blur(5px)" }}>
          <div style={{ padding: "20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontWeight: "bold", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}><IconFireExtinguisher size={16} /> Scan QR: {scanTarget.kode}</span>
            <button onClick={() => setScanTarget(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: "40px", height: "40px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={16} color="white" /></button>
          </div>
          <div style={{ padding: "20px", background: "#1a202c", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", overflowY: "auto" }}>
            <div style={{ width: "100%", maxWidth: "400px", background: "white", padding: "10px", borderRadius: "16px", overflow: "hidden", marginBottom: "20px" }}>
              <div id="reader-apar" style={{ width: "100%" }}></div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* MODAL FORM INSPEKSI                     */}
      {/* ======================================= */}
      {formTarget && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "15px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "450px", borderRadius: "24px", padding: "25px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box" }}>
            <button onClick={() => setFormTarget(null)} style={{ position: "absolute", top: "15px", right: "15px", background: "#edf2f7", border: "none", width: "36px", height: "36px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={16} /></button>

            <h2 style={{ margin: "0 0 4px 0", color: "#1a202c", fontSize: "18px", fontWeight: 800, paddingRight: "30px" }}>Form Inspeksi: {formTarget.kode}</h2>
            <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "12px" }}>{formTarget.lokasi} · {formTarget.lantai}</p>

            <form onSubmit={handleSubmitInspeksi} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "8px", display: "block" }}>Kondisi Tabung *</label>
                <div className="choice-grid">
                  {KONDISI_TABUNG_OPSI.map(opt => (
                    <div key={opt} onClick={() => setKondisiTabung(opt)} className="choice-item" style={kondisiTabung === opt ? { border: "2px solid var(--red-600)", background: "var(--red-50)", color: "var(--red-600)" } : {}}>{opt}</div>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "8px", display: "block" }}>Tekanan / Indikator *</label>
                <div className="choice-grid">
                  {TEKANAN_OPSI.map(opt => (
                    <div key={opt} onClick={() => setTekanan(opt)} className="choice-item" style={tekanan === opt ? { border: "2px solid var(--info)", background: "var(--info-50)", color: "var(--info)" } : {}}>{opt}</div>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "8px", display: "block" }}>Segel Pengaman *</label>
                <div className="choice-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div onClick={() => setSegelUtuh(true)} className="choice-item" style={segelUtuh ? { border: "2px solid var(--ok)", background: "var(--ok-50)", color: "var(--ok)" } : {}}>Utuh</div>
                  <div onClick={() => setSegelUtuh(false)} className="choice-item" style={!segelUtuh ? { border: "2px solid var(--red-600)", background: "var(--red-50)", color: "var(--red-600)" } : {}}>Rusak / Hilang</div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "8px", display: "block" }}>Catatan Tambahan (Opsional)</label>
                <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Cth: perlu isi ulang bulan depan..." style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", height: "70px", resize: "none", fontSize: "13px", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>

              <button type="submit" disabled={isSaving} style={{ width: "100%", padding: "16px", background: isSaving ? "#a0aec0" : "var(--red-600)", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isSaving ? "not-allowed" : "pointer", boxShadow: isSaving ? "none" : "0 4px 6px rgba(220,38,38,0.3)" }}>
                {isSaving ? "Menyimpan..." : "Simpan Hasil Inspeksi"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
