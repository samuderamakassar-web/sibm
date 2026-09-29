"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Modal from "../../../components/ui/Modal";
import AparInspectionBanner from "../../../components/AparInspectionBanner";
import AdminShell from "../../../components/admin/AdminShell";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan shell admin (src/app/admin/page.tsx)
// ==========================================
type IconProps = { size?: number; color?: string };
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
    <AdminShell
      title="Master Data APAR"
      subtitle="Kelola unit APAR per lantai & cetak QR untuk inspeksi bulanan Security"
      userName={adminName}
      backHref={session?.dept === "QHSE" ? "/dashboard/qhse" : "/admin"}
      backLabel={session?.dept === "QHSE" ? "Dashboard QHSE" : "Control Panel"}
    >

      <style dangerouslySetInnerHTML={{__html: `
        .panel { background: var(--tile); padding: 24px; border-radius: 28px; }
        .field-label { display: block; font-size: 12px; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
        .field-input { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); font-size: 14px; background: var(--bg); outline: none; font-family: inherit; box-sizing: border-box; }
        .action-btn { height: 42px; padding: 0 18px; background: var(--brand); color: #fff; border: none; border-radius: 14px; font-weight: bold; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: inherit; }

        .qr-card { background: var(--surface); padding: 18px; border-radius: 24px; border: 1px solid var(--line); display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }
        .qr-card img.qr-img { background: #fff; border-radius: 8px; }
        .status-pill { font-size: 10.5px; font-weight: bold; padding: 4px 10px; border-radius: 20px; }
        .lantai-chip { font-size: 11px; color: var(--ink); background: var(--chip); padding: 3px 10px; border-radius: 20px; font-weight: bold; }

        @media print {
          @page { margin: 10mm; size: A4 portrait; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 15px !important; }
          .qr-card { border: 2px dashed #000 !important; box-shadow: none !important; page-break-inside: avoid !important; }
        }
        @media (max-width: 700px) {
          .apar-form-grid { grid-template-columns: 1fr !important; }
          .apar-form-grid > div { grid-column: auto !important; }
          .panel { padding: 18px; border-radius: 24px; }
        }
      `}} />

      <div className="no-print">
        <AparInspectionBanner />
      </div>

      <div>

        {/* 🔹 TAB NAVIGASI */}
        <div className="sa-tabs no-print" role="tablist" aria-label="Tampilan APAR" style={{ width: "fit-content", maxWidth: "100%" }}>
          <button type="button" role="tab" aria-selected={activeTab === "MASTER"} className={`sa-tab${activeTab === "MASTER" ? " is-active" : ""}`} onClick={() => setActiveTab("MASTER")}>
            <IconFireExtinguisher size={15} /> Master Data
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "RIWAYAT"} className={`sa-tab${activeTab === "RIWAYAT" ? " is-active" : ""}`} onClick={() => setActiveTab("RIWAYAT")}>
            <IconCalendar size={15} /> Hasil Inspeksi
          </button>
        </div>

        {activeTab === "MASTER" && (
        <>
        <div className="panel no-print" style={{ marginBottom: "16px", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink-soft)" }}>Filter Lantai:</span>
              <select className="sa-field" aria-label="Filter lantai" value={filterLantai} onChange={(e) => setFilterLantai(e.target.value)}>
                <option value="Semua">Semua Lantai</option>
                {DAFTAR_LANTAI.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" onClick={handlePrint} className="sa-btn is-dark" style={{ height: "42px" }}>
                <IconPrinter size={15} /> Cetak QR
              </button>
              <button type="button" onClick={bukaTambah} className="action-btn">
                <IconPlus size={16} /> Tambah Unit APAR
              </button>
            </div>
          </div>
        </div>

        {unitTerfilter.length === 0 ? (
          <div className="no-print" style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "24px", background: "var(--tile)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
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
                    <button type="button" aria-label={`Edit ${unit.kode}`} onClick={() => bukaEdit(unit)} style={{ width: "34px", height: "34px", borderRadius: "12px", border: "none", background: "var(--info-50)", color: "var(--info)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconEdit size={13} /></button>
                    <button type="button" aria-label={`Hapus ${unit.kode}`} onClick={() => handleHapus(unit)} style={{ width: "34px", height: "34px", borderRadius: "12px", border: "none", background: "var(--red-50)", color: "var(--red-600)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconTrash size={13} /></button>
                  </div>

                  <div style={{ marginBottom: "10px", marginTop: "5px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-samudera.png" alt="Logo" style={{ height: "22px" }} />
                  </div>
                  <span style={{ fontSize: "10px", fontWeight: "900", color: "var(--red-600)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>ASSET INSPEKSI APAR</span>

                  <div style={{ padding: "8px", border: "2px dashed var(--line)", borderRadius: "12px", marginBottom: "12px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="qr-img" src={qrImageUrl} alt={`QR ${unit.kode}`} style={{ width: "140px", height: "140px", display: "block" }} />
                  </div>

                  <h3 style={{ margin: "0 0 4px 0", color: "var(--ink)", fontSize: "17px" }}>{unit.kode}</h3>
                  <p style={{ margin: "0 0 8px 0", color: "var(--muted)", fontSize: "12px" }}>{unit.lokasi}</p>
                  <div className="lantai-chip" style={{ marginBottom: "10px" }}>
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
              <select className="sa-field" aria-label="Filter tahun" value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)}>
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
                        <div className="lantai-chip" style={{ display: "inline-block", marginTop: "5px", fontSize: "10.5px" }}>{unit.lantai}</div>
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
                              <IconXCircle size={16} color="var(--red-600)" />
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
            <button type="submit" disabled={isSaving} style={{ width: "100%", padding: "13px", background: "var(--brand)", opacity: isSaving ? 0.6 : 1, color: "#fff", border: "none", borderRadius: "14px", fontWeight: "bold", fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}>
              <IconCheckCircle size={14} /> {isSaving ? "Menyimpan..." : editTarget ? "Simpan Perubahan" : "Tambah Unit"}
            </button>
          </div>
        </form>
      </Modal>

    </AdminShell>
  );
}
