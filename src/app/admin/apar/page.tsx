"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Modal from "../../../components/ui/Modal";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan shell admin (src/app/admin/page.tsx)
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconFireExtinguisher = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3v2" /><path d="M8 5h6l1 2H7z" /><path d="M9 7v3" /><path d="M15 7l4-2" /><path d="M9 10h4a3 3 0 0 1 3 3v8H8v-8a3 3 0 0 1 1-2z" /><path d="M8 15h8" /></svg>
);
const IconPlus = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
);
const IconEdit = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
);
const IconPrinter = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M6 17v4h12v-4" /></svg>
);
const IconCheckCircle = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
);
const IconInbox = ({ size = 30, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);
const IconCalendar = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>
);
const IconXCircle = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m9.5 9.5 5 5" /><path d="m14.5 9.5-5 5" /></svg>
);

const DAFTAR_LANTAI = ["Ground (Basement)", "Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Lantai 5"];
const NAMA_BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

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

interface AparInspection {
  id: string;
  apar_id: string;
  kode: string;
  lantai: string;
  bulan_tahun: string;
  petugas: string;
  waktu_inspeksi: Timestamp | null;
  kondisi_tabung: string;
  tekanan: string;
  segel_utuh: boolean;
  catatan: string;
}

const bulanTahunSekarang = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function AdminAparPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    depts: ["Admin GA", "QHSE"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA & QHSE.",
  });
  const adminName = session?.nama || "Admin";

  const [unitApar, setUnitApar] = useState<AparUnit[]>([]);
  const [filterLantai, setFilterLantai] = useState<string>("Semua");
  const [isSaving, setIsSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<AparUnit | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);

  const [form, setForm] = useState({ lantai: DAFTAR_LANTAI[0], kode: "", lokasi: "", kadaluarsa: "" });

  // 🔹 TAB & RIWAYAT INSPEKSI
  const [activeTab, setActiveTab] = useState<"MASTER" | "RIWAYAT">("MASTER");
  const [aparInspections, setAparInspections] = useState<AparInspection[]>([]);
  const [filterTahun, setFilterTahun] = useState<string>(String(new Date().getFullYear()));

  useEffect(() => {
    if (!isReady) return;
    const q = query(collection(db, "apar_units"), orderBy("lantai", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: AparUnit[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() } as AparUnit));
      setUnitApar(arr);
    });
    return () => unsub();
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    const unsub = onSnapshot(collection(db, "apar_inspections"), (snap) => {
      const arr: AparInspection[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() } as AparInspection));
      setAparInspections(arr);
    });
    return () => unsub();
  }, [isReady]);

  const bukaTambah = () => {
    setEditTarget(null);
    setForm({ lantai: DAFTAR_LANTAI[0], kode: "", lokasi: "", kadaluarsa: "" });
    setShowFormModal(true);
  };

  const bukaEdit = (unit: AparUnit) => {
    setEditTarget(unit);
    setForm({ lantai: unit.lantai, kode: unit.kode, lokasi: unit.lokasi, kadaluarsa: unit.kadaluarsa || "" });
    setShowFormModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editTarget) {
        await updateDoc(doc(db, "apar_units", editTarget.id), {
          lantai: form.lantai, kode: form.kode, lokasi: form.lokasi, kadaluarsa: form.kadaluarsa
        });
        showToast("Data APAR berhasil diperbarui.", "success");
      } else {
        await addDoc(collection(db, "apar_units"), {
          lantai: form.lantai, kode: form.kode, lokasi: form.lokasi, kadaluarsa: form.kadaluarsa,
          terakhir_inspeksi: null, dibuat: serverTimestamp()
        });
        showToast("Unit APAR baru berhasil ditambahkan.", "success");
      }
      setShowFormModal(false);
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan data APAR.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleHapus = async (unit: AparUnit) => {
    const yakin = await confirm({
      title: "Hapus Unit APAR",
      message: `Hapus "${unit.kode}" (${unit.lantai})? QR yang sudah tercetak untuk unit ini tidak akan berfungsi lagi.`,
      confirmText: "Ya, Hapus",
      variant: "danger"
    });
    if (!yakin) return;
    try {
      await deleteDoc(doc(db, "apar_units", unit.id));
      showToast("Unit APAR dihapus.", "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus unit APAR.", "error");
    }
  };

  const handlePrint = () => window.print();

  const unitTerfilter = unitApar.filter(u => filterLantai === "Semua" || u.lantai === filterLantai);
  const bulanIni = bulanTahunSekarang();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // 🔹 Daftar tahun untuk filter riwayat inspeksi (tahun sekarang selalu ada walau belum ada data)
  const tahunSekarang = new Date().getFullYear();
  const tahunTersedia = Array.from(new Set([
    tahunSekarang,
    ...aparInspections.filter(i => i.bulan_tahun).map(i => Number(i.bulan_tahun.split("-")[0]))
  ])).sort((a, b) => b - a);

  // 🔹 Status inspeksi per unit APAR per bulan (Jan-Des) untuk tahun yang difilter
  const riwayatPerUnit = unitApar.map(unit => {
    const bulanStatus = NAMA_BULAN_SINGKAT.map((_, idx) => {
      const bulanTahunKey = `${filterTahun}-${String(idx + 1).padStart(2, "0")}`;
      const records = aparInspections
        .filter(i => i.apar_id === unit.id && i.bulan_tahun === bulanTahunKey)
        .sort((a, b) => (b.waktu_inspeksi?.toMillis() || 0) - (a.waktu_inspeksi?.toMillis() || 0));
      return records[0] || null;
    });
    return { unit, bulanStatus };
  });

  if (!isReady) return null;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: "var(--bg)" }}>

      <style dangerouslySetInnerHTML={{__html: `
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

        .panel { background: var(--surface); padding: 25px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid var(--line); }
        .field-label { display: block; font-size: 12px; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
        .field-input { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line); font-size: 14px; background: var(--bg); outline: none; font-family: inherit; box-sizing: border-box; }
        .action-btn { padding: 12px 20px; background: var(--red-600); color: white; border: none; border-radius: 10px; font-weight: bold; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: inherit; box-shadow: 0 4px 6px rgba(220,38,38,0.25); }

        .qr-card { background: var(--surface); padding: 18px; border-radius: 16px; border: 2px solid rgba(220,38,38,0.2); box-shadow: 0 4px 6px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }
        .status-pill { font-size: 10px; font-weight: bold; padding: 3px 9px; border-radius: 20px; }

        @media print {
          @page { margin: 10mm; size: A4 portrait; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 15px !important; }
          .qr-card { border: 2px dashed #000 !important; box-shadow: none !important; page-break-inside: avoid !important; }
        }
        @media (max-width: 700px) {
          .apar-form-grid { grid-template-columns: 1fr !important; }
        }
      `}} />

      <div className="site-header no-print">
        <button className="back-btn" onClick={() => router.push(session?.dept === "QHSE" ? "/dashboard/qhse" : "/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge"><IconUserCircle size={14} /> {adminName}</div>
      </div>

      <div className="admin-hero no-print">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>MASTER DATA APAR</h1>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Kelola unit APAR per lantai & cetak QR untuk inspeksi bulanan Security.</p>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 20px 30px", position: "relative", zIndex: 10 }}>

        {/* 🔹 TAB NAVIGASI */}
        <div className="no-print" style={{ display: "flex", gap: "4px", marginBottom: "20px", background: "rgba(255,255,255,0.5)", padding: "5px", borderRadius: "14px", border: "1px solid var(--line)", width: "fit-content" }}>
          <button
            onClick={() => setActiveTab("MASTER")}
            style={{ padding: "10px 18px", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 800, fontSize: "13px", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "8px", background: activeTab === "MASTER" ? "var(--surface)" : "transparent", color: activeTab === "MASTER" ? "var(--red-600)" : "var(--ink-soft)", boxShadow: activeTab === "MASTER" ? "0 2px 8px rgba(0,0,0,0.08)" : "none" }}
          >
            <IconFireExtinguisher size={15} /> Master Data
          </button>
          <button
            onClick={() => setActiveTab("RIWAYAT")}
            style={{ padding: "10px 18px", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 800, fontSize: "13px", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "8px", background: activeTab === "RIWAYAT" ? "var(--surface)" : "transparent", color: activeTab === "RIWAYAT" ? "var(--red-600)" : "var(--ink-soft)", boxShadow: activeTab === "RIWAYAT" ? "0 2px 8px rgba(0,0,0,0.08)" : "none" }}
          >
            <IconCalendar size={15} /> Hasil Inspeksi
          </button>
        </div>

        {activeTab === "MASTER" && (
        <>
        <div className="panel no-print" style={{ marginBottom: "25px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink-soft)" }}>Filter Lantai:</span>
              <select value={filterLantai} onChange={(e) => setFilterLantai(e.target.value)} className="field-input" style={{ width: "auto", fontWeight: "bold" }}>
                <option value="Semua">Semua Lantai</option>
                {DAFTAR_LANTAI.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handlePrint} className="action-btn" style={{ background: "var(--accent)", boxShadow: "0 4px 6px rgba(124,58,237,0.25)" }}>
                <IconPrinter size={15} /> Cetak QR
              </button>
              <button onClick={bukaTambah} className="action-btn">
                <IconPlus size={16} /> Tambah Unit APAR
              </button>
            </div>
          </div>
        </div>

        {unitTerfilter.length === 0 ? (
          <div className="no-print" style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "16px", background: "var(--surface)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <IconInbox size={30} color="var(--muted)" />
            Belum ada unit APAR terdaftar{filterLantai !== "Semua" ? ` di ${filterLantai}` : ""}.
          </div>
        ) : (
          <div className="print-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "18px" }}>
            {unitTerfilter.map(unit => {
              const sudahBulanIni = unit.terakhir_inspeksi?.bulan_tahun === bulanIni;
              const qrPayload = `${origin}/qr-apar?id=${unit.id}`;
              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`;

              return (
                <div key={unit.id} className="qr-card">
                  <div className="no-print" style={{ position: "absolute", top: "10px", right: "10px", display: "flex", gap: "6px" }}>
                    <button onClick={() => bukaEdit(unit)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--info)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconEdit size={13} /></button>
                    <button onClick={() => handleHapus(unit)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--red-600)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconTrash size={13} /></button>
                  </div>

                  <div style={{ marginBottom: "10px", marginTop: "5px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-samudera.png" alt="Logo" style={{ height: "22px" }} />
                  </div>
                  <span style={{ fontSize: "10px", fontWeight: "900", color: "var(--red-600)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>ASSET INSPEKSI APAR</span>

                  <div style={{ padding: "8px", border: "2px dashed var(--line)", borderRadius: "12px", marginBottom: "12px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrImageUrl} alt={`QR ${unit.kode}`} style={{ width: "140px", height: "140px", display: "block" }} />
                  </div>

                  <h3 style={{ margin: "0 0 4px 0", color: "var(--ink)", fontSize: "17px" }}>{unit.kode}</h3>
                  <p style={{ margin: "0 0 8px 0", color: "var(--muted)", fontSize: "12px" }}>{unit.lokasi}</p>
                  <div style={{ fontSize: "11px", color: "white", background: "var(--ink-soft)", padding: "3px 10px", borderRadius: "20px", fontWeight: "bold", marginBottom: "10px" }}>
                    {unit.lantai}
                  </div>

                  <span className="status-pill no-print" style={sudahBulanIni ? { background: "var(--ok-50)", color: "var(--ok)" } : { background: "var(--warn-50)", color: "var(--warn)" }}>
                    {sudahBulanIni ? "✓ Diinspeksi bulan ini" : "Belum diinspeksi bulan ini"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        </>
        )}

        {activeTab === "RIWAYAT" && (
        <div className="panel no-print">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px", marginBottom: "20px" }}>
            <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px", display: "flex", alignItems: "center", gap: "8px" }}>
              <IconCalendar size={18} color="var(--red-600)" /> Hasil Inspeksi APAR
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink-soft)" }}>Filter Tahun:</span>
              <select value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)} className="field-input" style={{ width: "auto", fontWeight: "bold" }}>
                {tahunTersedia.map(th => <option key={th} value={th}>{th}</option>)}
              </select>
            </div>
          </div>

          {riwayatPerUnit.length === 0 ? (
            <div style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "16px", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              <IconInbox size={30} color="var(--muted)" />
              Belum ada unit APAR terdaftar.
            </div>
          ) : (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                    <th style={{ padding: "12px 15px", textAlign: "left", borderBottom: "2px solid var(--line)", position: "sticky", left: 0, background: "var(--bg)", minWidth: "210px" }}>Detail APAR & Lokasi</th>
                    {NAMA_BULAN_SINGKAT.map(b => (
                      <th key={b} style={{ padding: "10px 6px", textAlign: "center", borderBottom: "2px solid var(--line)", minWidth: "62px" }}>{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riwayatPerUnit.map(({ unit, bulanStatus }) => (
                    <tr key={unit.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "12px 15px", position: "sticky", left: 0, background: "var(--surface)" }}>
                        <div style={{ fontWeight: 800, color: "var(--ink)" }}>{unit.kode}</div>
                        <div style={{ color: "var(--muted)", fontSize: "12px", marginTop: "2px" }}>{unit.lokasi}</div>
                        <div style={{ display: "inline-block", marginTop: "5px", fontSize: "10px", color: "white", background: "var(--ink-soft)", padding: "2px 9px", borderRadius: "20px", fontWeight: "bold" }}>{unit.lantai}</div>
                      </td>
                      {bulanStatus.map((rec, idx) => {
                        const waktu = rec?.waktu_inspeksi?.toDate() || null;
                        return (
                          <td key={idx} style={{ padding: "8px 4px", textAlign: "center", verticalAlign: "middle" }}>
                            {waktu ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                <IconCheckCircle size={16} color="var(--ok)" />
                                <div style={{ fontSize: "9.5px", color: "var(--ink-soft)", fontWeight: "bold", lineHeight: 1.3 }}>
                                  {waktu.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit" })}
                                  <br />
                                  {waktu.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                </div>
                              </div>
                            ) : (
                              <IconXCircle size={16} color="var(--red-500)" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </div>

      {/* 🔹 MODAL TAMBAH/EDIT UNIT APAR */}
      <Modal open={showFormModal} onClose={() => setShowFormModal(false)} maxWidth="450px">
        <h3 style={{ margin: "0 0 20px 0", fontSize: "18px", fontWeight: 800, color: "var(--ink)", display: "flex", alignItems: "center", gap: "10px" }}>
          <IconFireExtinguisher size={20} color="var(--red-600)" /> {editTarget ? "Edit Unit APAR" : "Tambah Unit APAR"}
        </h3>
        <form onSubmit={handleSubmit} className="apar-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div style={{ gridColumn: "span 2" }}>
            <label className="field-label">Lantai *</label>
            <select value={form.lantai} onChange={(e) => setForm({ ...form, lantai: e.target.value })} className="field-input" required>
              {DAFTAR_LANTAI.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Kode APAR *</label>
            <input type="text" value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} className="field-input" placeholder="Cth: APAR-L1-01" required />
          </div>
          <div>
            <label className="field-label">Kadaluarsa</label>
            <input type="date" value={form.kadaluarsa} onChange={(e) => setForm({ ...form, kadaluarsa: e.target.value })} className="field-input" />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="field-label">Lokasi Detail *</label>
            <input type="text" value={form.lokasi} onChange={(e) => setForm({ ...form, lokasi: e.target.value })} className="field-input" placeholder="Cth: Dekat Lobby Utama" required />
          </div>
          <div style={{ gridColumn: "span 2", marginTop: "8px" }}>
            <button type="submit" disabled={isSaving} style={{ width: "100%", padding: "13px", background: isSaving ? "#a0aec0" : "var(--red-600)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}>
              <IconCheckCircle size={14} /> {isSaving ? "Menyimpan..." : editTarget ? "Simpan Perubahan" : "Tambah Unit"}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
