"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Modal from "../../../components/ui/Modal";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan admin/apar/page.tsx & shell admin
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconCar = ({ size = 20, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14" /><path d="M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M23 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M3 17v-4l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v4" /><path d="M3 13h18" /></svg>
);
const IconEdit = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);
const IconInbox = ({ size = 30, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);
const IconCheckCircle = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
);
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
);
const IconDownload = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
);

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

interface Kendaraan {
  id: string;
  kendaraan: string;
  plat_nomor: string;
  jenis: string;
  pic_kendaraan: string;
  unit_bisnis: string;
}

interface OdometerLog {
  kendaraan_id: string;
  odometer: number | string;
  tanggal: string;
  waktu_catat?: Timestamp | null;
}

interface UjiEmisi {
  odo_jadwal_emisi: string;
  tanggal_pengujian: string;
  hasil_pengujian: string;
  status: string;
  next_service: string;
  keterangan: string;
  waktu_update?: Timestamp | null;
  diupdate_oleh?: string;
}

const STATUS_OPSI = ["-", "Good", "Perlu Perhatian", "Tidak Lolos"];

const FORM_KOSONG: UjiEmisi = {
  odo_jadwal_emisi: "",
  tanggal_pengujian: "",
  hasil_pengujian: "",
  status: "-",
  next_service: "",
  keterangan: "",
};

export default function UjiEmisiPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    depts: ["Admin GA", "QHSE"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA & QHSE.",
  });
  const adminName = session?.nama || "Admin";
  // QHSE cuma menerima/melihat hasilnya — input & edit hasil uji emisi wewenang Admin GA
  const isQHSE = session?.dept === "QHSE";

  const [kendaraanList, setKendaraanList] = useState<Kendaraan[]>([]);
  const [odometerLatest, setOdometerLatest] = useState<Record<string, OdometerLog>>({});
  const [ujiEmisiMap, setUjiEmisiMap] = useState<Record<string, UjiEmisi>>({});

  const [filterBulan, setFilterBulan] = useState<string>("Semua");
  const [filterTahun, setFilterTahun] = useState<string>("Semua");

  const [editTarget, setEditTarget] = useState<Kendaraan | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [form, setForm] = useState<UjiEmisi>(FORM_KOSONG);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    const q = query(collection(db, "master_kendaraan"), orderBy("unit_bisnis", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: Kendaraan[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() } as Kendaraan));
      setKendaraanList(arr);
    });
    return () => unsub();
  }, [isReady]);

  // 🔹 Odometer terakhir per kendaraan — ambil seluruh log lalu simpan yang paling baru per kendaraan_id
  useEffect(() => {
    if (!isReady) return;
    const unsub = onSnapshot(collection(db, "kendaraan_odometer_logs"), (snap) => {
      const latest: Record<string, OdometerLog> = {};
      snap.forEach((d) => {
        const data = d.data() as OdometerLog;
        const existing = latest[data.kendaraan_id];
        const dataMillis = data.waktu_catat?.toMillis() || 0;
        const existingMillis = existing?.waktu_catat?.toMillis() || 0;
        if (!existing || dataMillis > existingMillis || (dataMillis === existingMillis && data.tanggal > existing.tanggal)) {
          latest[data.kendaraan_id] = data;
        }
      });
      setOdometerLatest(latest);
    });
    return () => unsub();
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    const unsub = onSnapshot(collection(db, "kendaraan_uji_emisi"), (snap) => {
      const map: Record<string, UjiEmisi> = {};
      snap.forEach((d) => { map[d.id] = d.data() as UjiEmisi; });
      setUjiEmisiMap(map);
    });
    return () => unsub();
  }, [isReady]);

  const bukaEdit = (unit: Kendaraan) => {
    setEditTarget(unit);
    setForm(ujiEmisiMap[unit.id] ? { ...FORM_KOSONG, ...ujiEmisiMap[unit.id] } : FORM_KOSONG);
    setShowFormModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, "kendaraan_uji_emisi", editTarget.id), {
        ...form,
        waktu_update: serverTimestamp(),
        diupdate_oleh: adminName,
      }, { merge: true });
      showToast("Hasil uji emisi berhasil disimpan.", "success");
      setShowFormModal(false);
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan hasil uji emisi.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleHapus = async () => {
    if (!editTarget) return;
    const yakin = await confirm({
      title: "Hapus Hasil Uji Emisi",
      message: `Hapus data hasil uji emisi untuk "${editTarget.plat_nomor}"? Statusnya akan kembali jadi "Belum Diuji".`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (!yakin) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "kendaraan_uji_emisi", editTarget.id));
      showToast("Data hasil uji emisi dihapus.", "success");
      setShowFormModal(false);
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus data.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // 🔹 Daftar tahun untuk filter (tahun sekarang selalu ada walau belum ada data)
  const tahunSekarang = new Date().getFullYear();
  const tahunTersedia = Array.from(new Set([
    tahunSekarang,
    ...Object.values(ujiEmisiMap).filter(e => e.tanggal_pengujian).map(e => Number(e.tanggal_pengujian.split("-")[0]))
  ])).sort((a, b) => b - a);

  const cocokFilter = (unit: Kendaraan) => {
    if (filterBulan === "Semua" && filterTahun === "Semua") return true;
    const tgl = ujiEmisiMap[unit.id]?.tanggal_pengujian;
    if (!tgl) return false;
    const [y, m] = tgl.split("-");
    const tahunOk = filterTahun === "Semua" || y === filterTahun;
    const bulanOk = filterBulan === "Semua" || Number(m) === Number(filterBulan);
    return tahunOk && bulanOk;
  };

  const kendaraanTerfilter = kendaraanList.filter(cocokFilter);

  const handleExportExcel = () => {
    if (kendaraanTerfilter.length === 0) return showToast("Tidak ada data pada filter ini untuk diexport.", "warning");

    const headers = ["Unit Bisnis", "Car Holder", "Nomor Polisi", "Odo Meter Terakhir/KM", "Odo Meter Jadwal Uji Emisi/KM", "Tanggal Pengujian", "Hasil Pengujian", "Status", "Next Service + Pengujian", "Keterangan"];
    const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;

    const csvContent = [
      headers.join(","),
      ...kendaraanTerfilter.map(unit => {
        const odo = odometerLatest[unit.id];
        const emisi = ujiEmisiMap[unit.id];
        return [
          esc(unit.unit_bisnis),
          esc(unit.pic_kendaraan),
          esc(unit.plat_nomor),
          odo ? Number(odo.odometer) : "",
          emisi?.odo_jadwal_emisi ? Number(emisi.odo_jadwal_emisi) : "",
          emisi?.tanggal_pengujian || "",
          esc(emisi?.hasil_pengujian || ""),
          emisi?.status && emisi.status !== "-" ? emisi.status : "Belum Diuji",
          esc(emisi?.next_service || ""),
          esc(emisi?.keterangan || ""),
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Hasil_Uji_Emisi_Kendaraan_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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

        .emisi-table th { background: #fff59d; color: #52460a; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; }

        @media (max-width: 700px) {
          .emisi-form-grid { grid-template-columns: 1fr !important; }
        }
      `}} />

      <div className="site-header">
        <button className="back-btn" onClick={() => router.push(session?.dept === "QHSE" ? "/dashboard/qhse" : "/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge"><IconUserCircle size={14} /> {adminName}</div>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>HASIL INSPEKSI KENDARAAN</h1>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Rekap hasil uji emisi & jadwal servis armada kendaraan.</p>
        </div>
      </div>

      <div style={{ maxWidth: "1400px", margin: "-30px auto 0", padding: "0 20px 30px", position: "relative", zIndex: 10 }}>

        <div className="panel" style={{ marginBottom: "20px", padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink-soft)" }}>Filter Tanggal Pengujian:</span>
              <select value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)} className="field-input" style={{ width: "auto", fontWeight: "bold" }}>
                <option value="Semua">Semua Bulan</option>
                {NAMA_BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
              </select>
              <select value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)} className="field-input" style={{ width: "auto", fontWeight: "bold" }}>
                <option value="Semua">Semua Tahun</option>
                {tahunTersedia.map(th => <option key={th} value={th}>{th}</option>)}
              </select>
            </div>
            <button onClick={handleExportExcel} style={{ padding: "12px 20px", background: "var(--ok)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(22,163,74,0.25)" }}>
              <IconDownload size={15} /> Export ke Excel (.CSV)
            </button>
          </div>
        </div>

        <div className="panel" style={{ padding: "20px" }}>
          {kendaraanTerfilter.length === 0 ? (
            <div style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "16px", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              <IconInbox size={30} color="var(--muted)" />
              {kendaraanList.length === 0 ? "Belum ada data kendaraan terdaftar." : "Tidak ada data yang cocok dengan filter ini."}
            </div>
          ) : (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table className="emisi-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "2px solid var(--line)" }}>Unit Bisnis</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "2px solid var(--line)" }}>Car Holder</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "2px solid var(--line)" }}>Nomor Polisi</th>
                    <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "2px solid var(--line)" }}>Odo Meter Terakhir/KM</th>
                    <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "2px solid var(--line)" }}>Odo Meter Jadwal Uji Emisi/KM</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "2px solid var(--line)" }}>Tanggal Pengujian</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "2px solid var(--line)", minWidth: "180px" }}>Hasil Pengujian</th>
                    <th style={{ padding: "12px 14px", textAlign: "center", borderBottom: "2px solid var(--line)" }}>Status</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "2px solid var(--line)" }}>Next Service + Pengujian</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "2px solid var(--line)" }}>Keterangan</th>
                    {!isQHSE && <th style={{ padding: "12px 14px", textAlign: "center", borderBottom: "2px solid var(--line)" }}>Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {kendaraanTerfilter.map((unit) => {
                    const odo = odometerLatest[unit.id];
                    const emisi = ujiEmisiMap[unit.id];
                    const statusColor = emisi?.status === "Good"
                      ? { bg: "var(--ok-50)", color: "var(--ok)" }
                      : emisi?.status === "Tidak Lolos"
                      ? { bg: "var(--red-50)", color: "var(--red-600)" }
                      : emisi?.status === "Perlu Perhatian"
                      ? { bg: "var(--warn-50)", color: "var(--warn)" }
                      : { bg: "var(--bg)", color: "var(--muted)" };

                    return (
                      <tr key={unit.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px 14px", color: "var(--ink)", fontWeight: 700 }}>{unit.unit_bisnis}</td>
                        <td style={{ padding: "10px 14px", color: "var(--info)", fontWeight: 700 }}>{unit.pic_kendaraan}</td>
                        <td style={{ padding: "10px 14px", color: "var(--ink-soft)" }}>{unit.plat_nomor}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--ink-soft)" }}>
                          {odo ? Number(odo.odometer).toLocaleString("id-ID") : "-"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--ink-soft)" }}>
                          {emisi?.odo_jadwal_emisi ? Number(emisi.odo_jadwal_emisi).toLocaleString("id-ID") : "-"}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--ink-soft)" }}>
                          {emisi?.tanggal_pengujian ? new Date(emisi.tanggal_pengujian).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-"}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--ink-soft)", whiteSpace: "pre-line", fontSize: "11.5px" }}>
                          {emisi?.hasil_pengujian || "-"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <span style={{ display: "inline-block", background: statusColor.bg, color: statusColor.color, padding: "4px 12px", borderRadius: "20px", fontWeight: "bold", fontSize: "11px" }}>
                            {emisi?.status && emisi.status !== "-" ? emisi.status : "Belum Diuji"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--ink-soft)" }}>{emisi?.next_service || "-"}</td>
                        <td style={{ padding: "10px 14px", color: "var(--ink-soft)" }}>{emisi?.keterangan || "-"}</td>
                        {!isQHSE && (
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <button onClick={() => bukaEdit(unit)} style={{ width: "30px", height: "30px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--info)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><IconEdit size={13} /></button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 🔹 MODAL INPUT/EDIT HASIL UJI EMISI */}
      <Modal open={showFormModal} onClose={() => setShowFormModal(false)} maxWidth="520px">
        <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: 800, color: "var(--ink)", display: "flex", alignItems: "center", gap: "10px" }}>
          <IconCar size={20} color="var(--red-600)" /> Hasil Uji Emisi
        </h3>
        {editTarget && (
          <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "var(--muted)" }}>{editTarget.plat_nomor} — {editTarget.pic_kendaraan} ({editTarget.unit_bisnis})</p>
        )}
        <form onSubmit={handleSubmit} className="emisi-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div>
            <label className="field-label">Odo Meter Jadwal Uji Emisi/KM</label>
            <input type="text" value={form.odo_jadwal_emisi} onChange={(e) => setForm({ ...form, odo_jadwal_emisi: e.target.value })} className="field-input" placeholder="Cth: 16186" />
          </div>
          <div>
            <label className="field-label">Tanggal Pengujian</label>
            <input type="date" value={form.tanggal_pengujian} onChange={(e) => setForm({ ...form, tanggal_pengujian: e.target.value })} className="field-input" />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="field-label">Hasil Pengujian</label>
            <textarea value={form.hasil_pengujian} onChange={(e) => setForm({ ...form, hasil_pengujian: e.target.value })} className="field-input" rows={5} placeholder={"CO : 0.00 %\nHC : 0 ppm\nCO2 : 19.7 %\nO2 : 10.81 %\nLAMBDA : 1.375\nAFR : 20.2\nFUEL : GASOLINE\nH/C : 1.8500\nO/C : 0.0000"} style={{ resize: "vertical", fontFamily: "inherit" }} />
          </div>
          <div>
            <label className="field-label">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="field-input">
              {STATUS_OPSI.map(s => <option key={s} value={s}>{s === "-" ? "Belum Diuji" : s}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Next Service + Pengujian</label>
            <input type="text" value={form.next_service} onChange={(e) => setForm({ ...form, next_service: e.target.value })} className="field-input" placeholder="Cth: 1 Februari 2027 (Km 20.000)" />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="field-label">Keterangan</label>
            <input type="text" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} className="field-input" placeholder="Cth: Melewati Batas KM" />
          </div>
          <div style={{ gridColumn: "span 2", marginTop: "8px", display: "flex", gap: "10px" }}>
            <button type="submit" disabled={isSaving || isDeleting} style={{ flex: 1, padding: "13px", background: isSaving ? "#a0aec0" : "var(--red-600)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}>
              <IconCheckCircle size={14} /> {isSaving ? "Menyimpan..." : "Simpan Hasil Uji Emisi"}
            </button>
            {ujiEmisiMap[editTarget?.id || ""] && (
              <button type="button" onClick={handleHapus} disabled={isSaving || isDeleting} style={{ padding: "13px 16px", background: "var(--surface)", color: "var(--red-600)", border: "1px solid var(--red-500)", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: isDeleting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit" }}>
                <IconTrash size={14} /> {isDeleting ? "..." : "Hapus"}
              </button>
            )}
          </div>
        </form>
      </Modal>

    </div>
  );
}
