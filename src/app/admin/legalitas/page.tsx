"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Modal from "../../../components/ui/Modal";
import { handleDokumenUpload, MAX_UKURAN_DOKUMEN_MB } from "../../../lib/uploadDokumen";

// Ikon SVG garis — konsisten dengan admin/laptop & shell admin lainnya
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconFileText = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v5h5" /><path d="M6 3h8l5 5v13H6z" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>
);
const IconPlus = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
);
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
);
const IconChevronDown = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
);
const IconRefresh = ({ size = 13, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
);

type Jenis = "Legalitas" | "Perizinan" | "Perjanjian";

interface RiwayatVersi {
  tanggal_mulai: string;
  tanggal_berakhir: string;
  file_url: string;
  catatan: string;
  diupload_pada: string; // ISO date
}

interface Legalitas {
  id: string;
  nama_dokumen: string;
  jenis: Jenis;
  riwayat: RiwayatVersi[];
  tanggal_mulai_aktif: string;
  tanggal_berakhir_aktif: string;
  file_url_aktif: string;
  catatan_aktif: string;
}

const FORM_KOSONG = { nama_dokumen: "", jenis: "Legalitas" as Jenis, tanggal_mulai: "", tanggal_berakhir: "", file_url: "", catatan: "" };
const BATAS_HARI_PERLU_DIPERPANJANG = 60;

function todayISO(): string {
  return new Date().toISOString().substring(0, 10);
}

function hitungStatus(item: Legalitas): { label: string; bg: string; color: string; sisaHari: number } {
  const hariIni = new Date(todayISO());
  const akhir = new Date(item.tanggal_berakhir_aktif);
  const sisaHari = Math.ceil((akhir.getTime() - hariIni.getTime()) / (1000 * 60 * 60 * 24));
  if (sisaHari < 0) return { label: "KADALUARSA", bg: "var(--red-50)", color: "var(--red-600)", sisaHari };
  if (sisaHari <= BATAS_HARI_PERLU_DIPERPANJANG) return { label: "PERLU DIPERPANJANG", bg: "var(--warn-50)", color: "var(--warn)", sisaHari };
  return { label: "AKTIF", bg: "var(--ok-50)", color: "var(--ok)", sisaHari };
}

function formatTanggal(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const jenisWarna: Record<Jenis, { bg: string; color: string }> = {
  Legalitas: { bg: "#f5f3ff", color: "var(--accent)" },
  Perizinan: { bg: "var(--info-50)", color: "var(--info)" },
  Perjanjian: { bg: "var(--ok-50)", color: "var(--ok)" },
};

export default function AdminLegalitasPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin"],
    depts: ["Admin GA"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });

  const [daftar, setDaftar] = useState<Legalitas[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJenis, setFilterJenis] = useState<"SEMUA" | Jenis>("SEMUA");
  const [filterStatus, setFilterStatus] = useState("SEMUA");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"baru" | "perbarui">("baru");
  const [targetGroup, setTargetGroup] = useState<Legalitas | null>(null);
  const [formData, setFormData] = useState(FORM_KOSONG);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [namaFile, setNamaFile] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isReady || !session) return;
    const unsub = onSnapshot(query(collection(db, "master_legalitas"), orderBy("tanggal_berakhir_aktif", "asc")), (snap) => {
      setDaftar(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Legalitas)));
    });
    return () => unsub();
  }, [isReady, session]);

  const bukaTambah = () => {
    setModalMode("baru");
    setTargetGroup(null);
    setFormData(FORM_KOSONG);
    setNamaFile("");
    setShowModal(true);
  };

  const bukaPerbarui = (item: Legalitas) => {
    setModalMode("perbarui");
    setTargetGroup(item);
    setFormData({ nama_dokumen: item.nama_dokumen, jenis: item.jenis, tanggal_mulai: "", tanggal_berakhir: "", file_url: "", catatan: "" });
    setNamaFile("");
    setShowModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_UKURAN_DOKUMEN_MB * 1024 * 1024) {
      return showToast(`File terlalu besar (maks ${MAX_UKURAN_DOKUMEN_MB}MB).`, "warning");
    }
    handleDokumenUpload(
      file,
      "sibm/legalitas",
      () => setIsUploadingFile(true),
      (url, nama) => { setFormData((f) => ({ ...f, file_url: url })); setNamaFile(nama); },
      (err) => { console.error(err); showToast(err instanceof Error ? err.message : "Gagal upload file, coba lagi.", "error"); },
      () => setIsUploadingFile(false)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama_dokumen.trim() || !formData.tanggal_mulai || !formData.tanggal_berakhir || !formData.file_url) {
      return showToast("Lengkapi dulu Nama Dokumen, Masa Berlaku, dan Upload Scan.", "warning");
    }
    if (isUploadingFile) return showToast("Tunggu upload file selesai dulu.", "warning");

    setIsSaving(true);
    try {
      const versiBaru: RiwayatVersi = {
        tanggal_mulai: formData.tanggal_mulai,
        tanggal_berakhir: formData.tanggal_berakhir,
        file_url: formData.file_url,
        catatan: formData.catatan.trim(),
        diupload_pada: todayISO(),
      };
      if (modalMode === "baru") {
        await addDoc(collection(db, "master_legalitas"), {
          nama_dokumen: formData.nama_dokumen.trim(),
          jenis: formData.jenis,
          riwayat: [versiBaru],
          tanggal_mulai_aktif: versiBaru.tanggal_mulai,
          tanggal_berakhir_aktif: versiBaru.tanggal_berakhir,
          file_url_aktif: versiBaru.file_url,
          catatan_aktif: versiBaru.catatan,
        });
        showToast("Dokumen baru berhasil ditambahkan.", "success");
      } else if (targetGroup) {
        await updateDoc(doc(db, "master_legalitas", targetGroup.id), {
          riwayat: [...(targetGroup.riwayat || []), versiBaru],
          tanggal_mulai_aktif: versiBaru.tanggal_mulai,
          tanggal_berakhir_aktif: versiBaru.tanggal_berakhir,
          file_url_aktif: versiBaru.file_url,
          catatan_aktif: versiBaru.catatan,
        });
        showToast(`"${targetGroup.nama_dokumen}" berhasil diperbarui dengan versi baru.`, "success");
      }
      setShowModal(false);
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan data.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: Legalitas) => {
    const yakin = await confirm({
      title: "Hapus Dokumen",
      message: `Yakin ingin menghapus "${item.nama_dokumen}" beserta SELURUH riwayat versinya? Tindakan ini tidak bisa dibatalkan.`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (!yakin) return;
    try {
      await deleteDoc(doc(db, "master_legalitas", item.id));
      showToast("Dokumen berhasil dihapus.", "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus data.", "error");
    }
  };

  const filtered = daftar.filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || d.nama_dokumen.toLowerCase().includes(q);
    const matchJenis = filterJenis === "SEMUA" || d.jenis === filterJenis;
    const st = hitungStatus(d).label;
    const stKey = st === "AKTIF" ? "AKTIF" : st === "PERLU DIPERPANJANG" ? "PERLU" : "KADALUARSA";
    const matchStatus = filterStatus === "SEMUA" || stKey === filterStatus;
    return matchSearch && matchJenis && matchStatus;
  });

  const jumlah = {
    total: daftar.length,
    aktif: daftar.filter((d) => hitungStatus(d).label === "AKTIF").length,
    perlu: daftar.filter((d) => hitungStatus(d).label === "PERLU DIPERPANJANG").length,
    kadaluarsa: daftar.filter((d) => hitungStatus(d).label === "KADALUARSA").length,
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
        .site-header { position: sticky; top: 0; z-index: 30; display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
        .back-btn { display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px; }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge { display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info); padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2); }
        .admin-hero { position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff; padding: 34px 20px 50px; text-align: center; background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%); box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5); }
        .admin-hero::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5; background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%); }
        .admin-hero-content { position: relative; }
        .stat-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); margin-bottom: 25px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .form-field label { display: block; font-size: 11.5px; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
        .form-field input, .form-field select { width: 100%; padding: 11px 13px; border-radius: 10px; border: 1px solid var(--line); font-size: 13px; background: var(--bg); outline: none; box-sizing: border-box; font-family: inherit; }
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .header-title-container { flex-direction: column; align-items: stretch !important; gap: 15px; }
          .search-input-wrapper { width: 100% !important; margin-top: 10px; }
          .search-input-wrapper input { width: 100% !important; max-width: 100% !important; }
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
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>LEGALITAS & PERIZINAN</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Dokumen legalitas, perizinan &amp; perjanjian &mdash; tiap diperpanjang, riwayat versi lama tetap tersimpan.</p>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "-30px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>
        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", width: "100%" }}>

          <div className="stat-grid">
            <div style={{ background: "var(--bg)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "var(--ink)" }}>{jumlah.total}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700 }}>Total Dokumen</div>
            </div>
            <div style={{ background: "var(--ok-50)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "var(--ok)" }}>{jumlah.aktif}</div>
              <div style={{ fontSize: "11px", color: "var(--ok)", fontWeight: 700 }}>Aktif</div>
            </div>
            <div style={{ background: "var(--warn-50)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "var(--warn)" }}>{jumlah.perlu}</div>
              <div style={{ fontSize: "11px", color: "var(--warn)", fontWeight: 700 }}>Perlu Diperpanjang (&le;{BATAS_HARI_PERLU_DIPERPANJANG}H)</div>
            </div>
            <div style={{ background: "var(--red-50)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "var(--red-600)" }}>{jumlah.kadaluarsa}</div>
              <div style={{ fontSize: "11px", color: "var(--red-600)", fontWeight: 700 }}>Kadaluarsa</div>
            </div>
          </div>

          <div className="header-title-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}><IconFileText size={16} /> Daftar Dokumen</h2>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value as "SEMUA" | Jenis)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                <option value="SEMUA">Semua Jenis</option>
                <option value="Legalitas">Legalitas</option>
                <option value="Perizinan">Perizinan</option>
                <option value="Perjanjian">Perjanjian</option>
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}>
                <option value="SEMUA">Semua Status</option>
                <option value="AKTIF">Aktif</option>
                <option value="PERLU">Perlu Diperpanjang</option>
                <option value="KADALUARSA">Kadaluarsa</option>
              </select>
              <div className="search-input-wrapper" style={{ position: "relative", width: "200px" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input type="text" placeholder="Cari nama dokumen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "100%", background: "var(--bg)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <button onClick={bukaTambah} style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                <IconPlus size={14} /> Tambah
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px" }}>
                {searchQuery || filterJenis !== "SEMUA" || filterStatus !== "SEMUA" ? "Data tidak ditemukan." : 'Belum ada dokumen. Klik "Tambah" untuk mulai mendata.'}
              </div>
            ) : filtered.map((item) => {
              const st = hitungStatus(item);
              const isExpanded = expandedId === item.id;
              const riwayatLama = (item.riwayat || []).slice(0, -1).reverse();
              return (
                <div key={item.id} style={{ background: "var(--bg)", borderRadius: "14px", border: "1px solid var(--line)", overflow: "hidden" }}>
                  <div style={{ padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "5px" }}>
                          <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--ink)" }}>{item.nama_dokumen}</span>
                          <span style={{ background: jenisWarna[item.jenis].bg, color: jenisWarna[item.jenis].color, padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: 700 }}>{item.jenis}</span>
                          <span style={{ background: st.bg, color: st.color, padding: "2px 8px", borderRadius: "6px", fontSize: "10.5px", fontWeight: 800 }}>{st.label}</span>
                        </div>
                        <div style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
                          Berlaku {formatTanggal(item.tanggal_mulai_aktif)} &rarr; {formatTanggal(item.tanggal_berakhir_aktif)}
                          <span style={{ marginLeft: "8px", fontWeight: 700, color: st.sisaHari < 0 ? "var(--red-600)" : st.sisaHari <= BATAS_HARI_PERLU_DIPERPANJANG ? "var(--warn)" : "var(--muted)" }}>
                            ({st.sisaHari < 0 ? `lewat ${Math.abs(st.sisaHari)} hari` : `${st.sisaHari} hari lagi`})
                          </span>
                        </div>
                        {item.catatan_aktif && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px", fontStyle: "italic" }}>{item.catatan_aktif}</div>}
                        <a href={item.file_url_aktif} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11.5px", color: "var(--info)", display: "inline-block", marginTop: "6px" }}>Lihat Scan Terbaru &rarr;</a>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <button onClick={() => bukaPerbarui(item)} style={{ background: "var(--info-50)", color: "var(--info)", border: "1px solid rgba(37,99,235,0.2)", padding: "8px 12px", borderRadius: "8px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", fontFamily: "inherit" }}>
                          <IconRefresh size={12} /> Perbarui
                        </button>
                        <button onClick={() => handleDelete(item)} title="Hapus" style={{ background: "var(--red-50)", color: "var(--red-600)", border: "1px solid rgba(220,38,38,0.25)", width: "34px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <IconTrash size={13} />
                        </button>
                      </div>
                    </div>

                    {riwayatLama.length > 0 && (
                      <button onClick={() => setExpandedId(isExpanded ? null : item.id)} style={{ marginTop: "10px", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "11.5px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", padding: 0, fontFamily: "inherit" }}>
                        <IconChevronDown size={12} color="var(--muted)" /> Riwayat {riwayatLama.length} versi sebelumnya {isExpanded ? "(tutup)" : "(lihat)"}
                      </button>
                    )}
                  </div>

                  {isExpanded && riwayatLama.length > 0 && (
                    <div style={{ background: "var(--surface)", borderTop: "1px dashed var(--line)", padding: "10px 18px 14px" }}>
                      {riwayatLama.map((v, idx) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: idx < riwayatLama.length - 1 ? "1px dashed var(--line)" : "none", fontSize: "12px", flexWrap: "wrap", gap: "6px" }}>
                          <span style={{ color: "var(--ink-soft)" }}>{formatTanggal(v.tanggal_mulai)} &rarr; {formatTanggal(v.tanggal_berakhir)}{v.catatan && <span style={{ color: "var(--muted)", fontStyle: "italic" }}> &middot; {v.catatan}</span>}</span>
                          <a href={v.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--info)", flexShrink: 0 }}>Lihat Scan &rarr;</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Modal open={showModal} onClose={() => !isSaving && setShowModal(false)} maxWidth="520px">
        <h3 style={{ margin: "0 0 4px 0", fontSize: "17px", fontWeight: 900, color: "var(--ink)" }}>
          {modalMode === "baru" ? "Tambah Dokumen Baru" : `Perbarui: ${targetGroup?.nama_dokumen}`}
        </h3>
        {modalMode === "perbarui" && <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "var(--muted)" }}>Versi lama otomatis tersimpan di riwayat, versi baru ini yang jadi aktif.</p>}
        {modalMode === "baru" && <div style={{ height: "16px" }} />}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {modalMode === "baru" && (
            <div className="form-grid">
              <div className="form-field">
                <label>Nama Dokumen *</label>
                <input type="text" required value={formData.nama_dokumen} onChange={(e) => setFormData({ ...formData, nama_dokumen: e.target.value })} placeholder="Cth: PMKU" />
              </div>
              <div className="form-field">
                <label>Jenis *</label>
                <select value={formData.jenis} onChange={(e) => setFormData({ ...formData, jenis: e.target.value as Jenis })}>
                  <option value="Legalitas">Legalitas</option>
                  <option value="Perizinan">Perizinan</option>
                  <option value="Perjanjian">Perjanjian</option>
                </select>
              </div>
            </div>
          )}
          <div className="form-grid">
            <div className="form-field">
              <label>Tanggal Mulai Berlaku *</label>
              <input type="date" required value={formData.tanggal_mulai} onChange={(e) => setFormData({ ...formData, tanggal_mulai: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Tanggal Berakhir *</label>
              <input type="date" required value={formData.tanggal_berakhir} onChange={(e) => setFormData({ ...formData, tanggal_berakhir: e.target.value })} />
            </div>
          </div>
          <div className="form-field">
            <label>Catatan (opsional)</label>
            <input type="text" value={formData.catatan} onChange={(e) => setFormData({ ...formData, catatan: e.target.value })} placeholder="Cth: Diperpanjang via notaris X" />
          </div>
          <div className="form-field">
            <label>Upload Scan * (PDF/Gambar, maks {MAX_UKURAN_DOKUMEN_MB}MB)</label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 18px", borderRadius: "10px", border: "1px dashed var(--info)", background: "var(--info-50)", color: "var(--info)", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
              {isUploadingFile ? "⏳ Mengunggah..." : formData.file_url ? `✓ ${namaFile}` : "Pilih File"}
              <input type="file" accept=".pdf,image/*" onChange={handleFileChange} disabled={isUploadingFile} style={{ display: "none" }} />
            </label>
          </div>
          <button type="submit" disabled={isSaving || isUploadingFile} style={{ marginTop: "6px", padding: "14px", background: isSaving ? "var(--muted)" : "var(--accent)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {isSaving ? "Menyimpan..." : modalMode === "baru" ? "Simpan Dokumen" : "Simpan Versi Baru"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
