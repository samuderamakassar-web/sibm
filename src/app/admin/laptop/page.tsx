"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Modal from "../../../components/ui/Modal";

// Ikon SVG garis — konsisten dengan admin/monitor-driver & shell admin lainnya
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconLaptop = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="11" rx="1.5" /><path d="M2 19h20" /><path d="M9 19l1-2h4l1 2" /></svg>
);
const IconPlus = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
);
const IconPencil = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
);
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
);
const IconCheck = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);

interface LaptopDevice {
  id: string;
  nama_user: string;
  departemen: string;
  merk_model: string;
  no_seri: string;
  tanggal_mulai: string; // "YYYY-MM-DD"
  tanggal_berakhir: string; // "YYYY-MM-DD"
  vendor: string;
  biaya_sewa: number;
  dikembalikan: boolean;
}

const FORM_KOSONG = {
  nama_user: "", departemen: "", merk_model: "", no_seri: "",
  tanggal_mulai: "", tanggal_berakhir: "", vendor: "", biaya_sewa: "",
};

const BATAS_HARI_MAU_HABIS = 30;

function todayISO(): string {
  return new Date().toISOString().substring(0, 10);
}

function hitungStatus(item: LaptopDevice): { label: string; bg: string; color: string; sisaHari: number | null } {
  if (item.dikembalikan) return { label: "DIKEMBALIKAN", bg: "var(--line)", color: "var(--ink-soft)", sisaHari: null };
  const hariIni = new Date(todayISO());
  const akhir = new Date(item.tanggal_berakhir);
  const sisaHari = Math.ceil((akhir.getTime() - hariIni.getTime()) / (1000 * 60 * 60 * 24));
  if (sisaHari < 0) return { label: "SUDAH HABIS", bg: "var(--red-50)", color: "var(--red-600)", sisaHari };
  if (sisaHari <= BATAS_HARI_MAU_HABIS) return { label: `MAU HABIS (${sisaHari}H)`, bg: "var(--warn-50)", color: "var(--warn)", sisaHari };
  return { label: "AKTIF", bg: "var(--ok-50)", color: "var(--ok)", sisaHari };
}

function formatTanggal(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatRupiah(n: number): string {
  if (!n) return "-";
  return "Rp " + n.toLocaleString("id-ID");
}

export default function AdminLaptopPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin"],
    depts: ["Admin GA"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });

  const [devices, setDevices] = useState<LaptopDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState("SEMUA");
  const [filterStatus, setFilterStatus] = useState("SEMUA");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(FORM_KOSONG);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isReady || !session) return;
    const unsub = onSnapshot(query(collection(db, "master_laptop"), orderBy("tanggal_berakhir", "asc")), (snap) => {
      setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LaptopDevice)));
    });
    return () => unsub();
  }, [isReady, session]);

  const bukaTambah = () => {
    setEditingId(null);
    setFormData(FORM_KOSONG);
    setShowModal(true);
  };

  const bukaEdit = (item: LaptopDevice) => {
    setEditingId(item.id);
    setFormData({
      nama_user: item.nama_user, departemen: item.departemen, merk_model: item.merk_model,
      no_seri: item.no_seri || "", tanggal_mulai: item.tanggal_mulai, tanggal_berakhir: item.tanggal_berakhir,
      vendor: item.vendor || "", biaya_sewa: item.biaya_sewa ? String(item.biaya_sewa) : "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama_user.trim() || !formData.departemen.trim() || !formData.merk_model.trim() || !formData.tanggal_mulai || !formData.tanggal_berakhir) {
      return showToast("Lengkapi dulu Nama User, Departemen, Merk/Model, dan Masa Sewa.", "warning");
    }
    setIsSaving(true);
    try {
      const dataToSave = {
        nama_user: formData.nama_user.trim(),
        departemen: formData.departemen.trim(),
        merk_model: formData.merk_model.trim(),
        no_seri: formData.no_seri.trim(),
        tanggal_mulai: formData.tanggal_mulai,
        tanggal_berakhir: formData.tanggal_berakhir,
        vendor: formData.vendor.trim(),
        biaya_sewa: Number(formData.biaya_sewa) || 0,
      };
      if (editingId) {
        await updateDoc(doc(db, "master_laptop", editingId), dataToSave);
        showToast("Data laptop berhasil diperbarui.", "success");
      } else {
        await addDoc(collection(db, "master_laptop"), { ...dataToSave, dikembalikan: false });
        showToast("Data laptop baru berhasil ditambahkan.", "success");
      }
      setShowModal(false);
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan data laptop.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDikembalikan = async (item: LaptopDevice) => {
    const aksi = item.dikembalikan ? "aktifkan kembali" : "tandai sudah dikembalikan";
    const yakin = await confirm(`Yakin ingin ${aksi} laptop "${item.merk_model}" (${item.nama_user})?`);
    if (!yakin) return;
    try {
      await updateDoc(doc(db, "master_laptop", item.id), { dikembalikan: !item.dikembalikan });
    } catch (error) {
      console.error(error);
      showToast("Gagal mengubah status.", "error");
    }
  };

  const handleDelete = async (item: LaptopDevice) => {
    const yakin = await confirm({
      title: "Hapus Data Laptop",
      message: `Yakin ingin menghapus data laptop "${item.merk_model}" milik ${item.nama_user}? Tindakan ini tidak bisa dibatalkan.`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (!yakin) return;
    try {
      await deleteDoc(doc(db, "master_laptop", item.id));
      showToast("Data laptop berhasil dihapus.", "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus data.", "error");
    }
  };

  const daftarDept = Array.from(new Set(devices.map((d) => d.departemen).filter(Boolean))).sort();

  const filtered = devices.filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || d.nama_user.toLowerCase().includes(q) || d.merk_model.toLowerCase().includes(q) || (d.no_seri || "").toLowerCase().includes(q);
    const matchDept = filterDept === "SEMUA" || d.departemen === filterDept;
    const st = hitungStatus(d).label.split(" ")[0]; // "AKTIF" / "MAU" / "SUDAH" / "DIKEMBALIKAN"
    const matchStatus = filterStatus === "SEMUA" || st === filterStatus;
    return matchSearch && matchDept && matchStatus;
  });

  const jumlah = {
    total: devices.length,
    aktif: devices.filter((d) => hitungStatus(d).label === "AKTIF").length,
    mauHabis: devices.filter((d) => hitungStatus(d).label.startsWith("MAU HABIS")).length,
    sudahHabis: devices.filter((d) => hitungStatus(d).label === "SUDAH HABIS").length,
    dikembalikan: devices.filter((d) => d.dikembalikan).length,
  };

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
        .lap-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .lap-table th { padding: 15px; font-weight: bold; background: var(--bg); color: var(--ink-soft); border-bottom: 2px solid var(--line); }
        .lap-table td { padding: 15px; vertical-align: middle; border-bottom: 1px solid var(--line); word-wrap: break-word; }
        .stat-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); margin-bottom: 25px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .form-field label { display: block; font-size: 11.5px; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
        .form-field input { width: 100%; padding: 11px 13px; border-radius: 10px; border: 1px solid var(--line); font-size: 13px; background: var(--bg); outline: none; box-sizing: border-box; font-family: inherit; }
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .header-title-container { flex-direction: column; align-items: stretch !important; gap: 15px; }
          .search-input-wrapper { width: 100% !important; margin-top: 10px; }
          .search-input-wrapper input { width: 100% !important; max-width: 100% !important; }
          .lap-table, .lap-table tbody { display: block; width: 100%; }
          .lap-table thead { display: none; }
          .lap-table tr { display: block; width: 100%; margin-bottom: 15px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; }
          .lap-table td { display: block; width: 100%; padding: 12px 15px !important; border-bottom: 1px dashed var(--line) !important; text-align: left !important; }
          .lap-table td:last-child { border-bottom: none !important; }
          .lap-table td::before { content: attr(data-label); display: block; font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
          .form-grid { grid-template-columns: 1fr; }
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
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>MASTER DATA LAPTOP</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Data masa sewa laptop tiap user &mdash; pantau kapan harus diperpanjang.</p>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>
        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", width: "100%" }}>

          <div className="stat-grid">
            <div style={{ background: "var(--bg)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "var(--ink)" }}>{jumlah.total}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700 }}>Total Laptop</div>
            </div>
            <div style={{ background: "var(--ok-50)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "var(--ok)" }}>{jumlah.aktif}</div>
              <div style={{ fontSize: "11px", color: "var(--ok)", fontWeight: 700 }}>Aktif</div>
            </div>
            <div style={{ background: "var(--warn-50)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "var(--warn)" }}>{jumlah.mauHabis}</div>
              <div style={{ fontSize: "11px", color: "var(--warn)", fontWeight: 700 }}>Mau Habis (&le;{BATAS_HARI_MAU_HABIS}H)</div>
            </div>
            <div style={{ background: "var(--red-50)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "var(--red-600)" }}>{jumlah.sudahHabis}</div>
              <div style={{ fontSize: "11px", color: "var(--red-600)", fontWeight: 700 }}>Sudah Habis</div>
            </div>
            <div style={{ background: "var(--line)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "var(--ink-soft)" }}>{jumlah.dikembalikan}</div>
              <div style={{ fontSize: "11px", color: "var(--ink-soft)", fontWeight: 700 }}>Dikembalikan</div>
            </div>
          </div>

          <div className="header-title-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}><IconLaptop size={16} /> Daftar Laptop</h2>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                <option value="SEMUA">Semua Departemen</option>
                {daftarDept.map((dpt) => <option key={dpt} value={dpt}>{dpt}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                <option value="SEMUA">Semua Status</option>
                <option value="AKTIF">Aktif</option>
                <option value="MAU">Mau Habis</option>
                <option value="SUDAH">Sudah Habis</option>
                <option value="DIKEMBALIKAN">Dikembalikan</option>
              </select>
              <div className="search-input-wrapper" style={{ position: "relative", width: "200px" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input type="text" placeholder="Cari user/merk/no seri..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "100%", background: "var(--bg)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <button onClick={bukaTambah} style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                <IconPlus size={14} /> Tambah
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>
            <table className="lap-table">
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>User & Departemen</th>
                  <th style={{ width: "18%" }}>Laptop</th>
                  <th style={{ width: "18%" }}>Masa Sewa</th>
                  <th style={{ width: "14%" }}>Vendor & Biaya</th>
                  <th style={{ width: "14%" }}>Status</th>
                  <th style={{ width: "18%", textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((item) => {
                  const st = hitungStatus(item);
                  return (
                    <tr key={item.id}>
                      <td data-label="User & Departemen">
                        <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{item.nama_user}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px", background: "var(--line)", padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>{item.departemen}</div>
                      </td>
                      <td data-label="Laptop">
                        <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{item.merk_model}</div>
                        {item.no_seri && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px" }}>S/N: {item.no_seri}</div>}
                      </td>
                      <td data-label="Masa Sewa" style={{ color: "var(--ink-soft)", fontSize: "12.5px" }}>
                        {formatTanggal(item.tanggal_mulai)} &rarr; {formatTanggal(item.tanggal_berakhir)}
                        {!item.dikembalikan && st.sisaHari !== null && (
                          <div style={{ marginTop: "3px", fontSize: "11px", fontWeight: 700, color: st.sisaHari < 0 ? "var(--red-600)" : st.sisaHari <= BATAS_HARI_MAU_HABIS ? "var(--warn)" : "var(--muted)" }}>
                            {st.sisaHari < 0 ? `Lewat ${Math.abs(st.sisaHari)} hari` : `${st.sisaHari} hari lagi`}
                          </div>
                        )}
                      </td>
                      <td data-label="Vendor & Biaya" style={{ color: "var(--muted)", fontSize: "12px" }}>{item.vendor || "-"}<br />{formatRupiah(item.biaya_sewa)}</td>
                      <td data-label="Status">
                        <span style={{ background: st.bg, color: st.color, padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", display: "inline-block", whiteSpace: "nowrap" }}>{st.label}</span>
                      </td>
                      <td data-label="Aksi" style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                          <button onClick={() => bukaEdit(item)} title="Edit" style={{ background: "var(--info-50)", color: "var(--info)", border: "1px solid rgba(37,99,235,0.2)", width: "28px", height: "28px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <IconPencil size={13} />
                          </button>
                          <button onClick={() => handleToggleDikembalikan(item)} title={item.dikembalikan ? "Aktifkan Kembali" : "Tandai Dikembalikan"} style={{ background: item.dikembalikan ? "var(--warn-50)" : "var(--ok-50)", color: item.dikembalikan ? "var(--warn)" : "var(--ok)", border: "1px solid " + (item.dikembalikan ? "rgba(217,119,6,0.2)" : "rgba(22,163,74,0.2)"), width: "28px", height: "28px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <IconCheck size={13} />
                          </button>
                          <button onClick={() => handleDelete(item)} title="Hapus" style={{ background: "var(--red-50)", color: "var(--red-600)", border: "1px solid rgba(220,38,38,0.25)", width: "28px", height: "28px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={6} style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
                    {searchQuery || filterDept !== "SEMUA" || filterStatus !== "SEMUA" ? "Data tidak ditemukan." : "Belum ada data laptop. Klik \"Tambah\" untuk mulai mendata."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={showModal} onClose={() => !isSaving && setShowModal(false)} maxWidth="520px">
        <h3 style={{ margin: "0 0 20px 0", fontSize: "17px", fontWeight: 900, color: "var(--ink)" }}>{editingId ? "Edit Data Laptop" : "Tambah Data Laptop"}</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="form-grid">
            <div className="form-field">
              <label>Nama User *</label>
              <input type="text" required value={formData.nama_user} onChange={(e) => setFormData({ ...formData, nama_user: e.target.value })} placeholder="Nama karyawan" />
            </div>
            <div className="form-field">
              <label>Departemen / Divisi *</label>
              <input type="text" required value={formData.departemen} onChange={(e) => setFormData({ ...formData, departemen: e.target.value })} placeholder="Cth: Admin GA" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Merk / Model *</label>
              <input type="text" required value={formData.merk_model} onChange={(e) => setFormData({ ...formData, merk_model: e.target.value })} placeholder="Cth: Lenovo ThinkPad E14" />
            </div>
            <div className="form-field">
              <label>Nomor Seri</label>
              <input type="text" value={formData.no_seri} onChange={(e) => setFormData({ ...formData, no_seri: e.target.value })} placeholder="Opsional" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Tanggal Mulai Sewa *</label>
              <input type="date" required value={formData.tanggal_mulai} onChange={(e) => setFormData({ ...formData, tanggal_mulai: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Tanggal Berakhir Sewa *</label>
              <input type="date" required value={formData.tanggal_berakhir} onChange={(e) => setFormData({ ...formData, tanggal_berakhir: e.target.value })} />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Vendor Penyewaan</label>
              <input type="text" value={formData.vendor} onChange={(e) => setFormData({ ...formData, vendor: e.target.value })} placeholder="Opsional" />
            </div>
            <div className="form-field">
              <label>Biaya Sewa (Rp)</label>
              <input type="number" min="0" value={formData.biaya_sewa} onChange={(e) => setFormData({ ...formData, biaya_sewa: e.target.value })} placeholder="Opsional" />
            </div>
          </div>
          <button type="submit" disabled={isSaving} style={{ marginTop: "6px", padding: "14px", background: isSaving ? "var(--muted)" : "var(--accent)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {isSaving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Data Laptop"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
