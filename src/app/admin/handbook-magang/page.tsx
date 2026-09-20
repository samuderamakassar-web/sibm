"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { handleDokumenUpload, MAX_UKURAN_DOKUMEN_MB } from "../../../lib/uploadDokumen";

// Ikon SVG garis — konsisten dengan admin/broadcast & admin/sop
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
);
const IconGraduationCap = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></svg>
);
const IconFileText = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v5h5" /><path d="M6 3h8l5 5v13H6z" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>
);
const IconVideo = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="15" height="14" rx="2" /><path d="m22 8-5 4 5 4z" /></svg>
);

type Jenis = "pdf" | "video";

interface HandbookItem {
  id: string;
  judul: string;
  jenis: Jenis;
  url: string;
  deskripsi: string;
  aktif: boolean;
  dibuatPada: Timestamp | null;
  dibuatOleh: string;
}

export default function HandbookMagangAdminPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    depts: ["Admin GA"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });
  const adminName = session?.nama || "Admin";

  const [daftar, setDaftar] = useState<HandbookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [jenis, setJenis] = useState<Jenis>("pdf");
  const [videoMode, setVideoMode] = useState<"upload" | "link">("link");
  const [linkVideo, setLinkVideo] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [namaFile, setNamaFile] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "handbook_magang"), orderBy("dibuatPada", "desc")), (snapshot) => {
      setDaftar(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as HandbookItem)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const resetForm = () => {
    setJudul(""); setDeskripsi(""); setJenis("pdf"); setVideoMode("link");
    setLinkVideo(""); setFileUrl(""); setNamaFile(""); setShowForm(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_UKURAN_DOKUMEN_MB * 1024 * 1024) {
      return showToast(`File terlalu besar (maks ${MAX_UKURAN_DOKUMEN_MB}MB). Untuk video, gunakan opsi "Link Video" kalau filenya lebih besar.`, "warning");
    }
    handleDokumenUpload(
      file,
      "sibm/handbook-magang",
      () => setIsUploadingFile(true),
      (url, nama) => { setFileUrl(url); setNamaFile(nama); },
      (err) => { console.error(err); showToast(err instanceof Error ? err.message : "Gagal upload file, coba lagi.", "error"); },
      () => setIsUploadingFile(false)
    );
  };

  const handleBuat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!judul.trim()) return showToast("Isi judul dulu.", "warning");
    const urlFinal = jenis === "video" && videoMode === "link" ? linkVideo.trim() : fileUrl;
    if (!urlFinal) {
      return showToast(
        jenis === "pdf" ? "Upload file PDF dulu." : videoMode === "link" ? "Isi link video dulu." : "Upload file video dulu.",
        "warning"
      );
    }
    if (isUploadingFile) return showToast("Tunggu upload file selesai dulu.", "warning");

    setIsSaving(true);
    try {
      await addDoc(collection(db, "handbook_magang"), {
        judul: judul.trim(),
        jenis,
        url: urlFinal,
        deskripsi: deskripsi.trim(),
        aktif: true,
        dibuatPada: serverTimestamp(),
        dibuatOleh: adminName,
      });
      showToast("Materi handbook berhasil ditambahkan & langsung tampil untuk anak magang!", "success");
      resetForm();
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan materi handbook.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAktif = async (item: HandbookItem) => {
    try {
      await updateDoc(doc(db, "handbook_magang", item.id), { aktif: !item.aktif });
    } catch (err) {
      console.error(err);
      showToast("Gagal mengubah status materi.", "error");
    }
  };

  const handleHapus = async (item: HandbookItem) => {
    const yakin = await confirm({
      title: "Hapus Materi Handbook",
      message: `Yakin ingin menghapus "${item.judul}"? Tindakan ini tidak bisa dibatalkan.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      variant: "danger",
    });
    if (!yakin) return;
    try {
      await deleteDoc(doc(db, "handbook_magang", item.id));
      showToast("Materi dihapus.", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal menghapus materi.", "error");
    }
  };

  const formatTanggal = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return ts.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };

  const jumlahAktif = daftar.filter((d) => d.aktif).length;

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
        .back-btn { display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px; }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge { display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info); padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2); }
        .admin-hero { position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff; padding: 34px 20px 50px; text-align: center; background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%); box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5); }
        .admin-hero::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5; background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%); }
        .admin-hero-content { position: relative; }
        .jenis-tab { padding: 10px 18px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-family: inherit; }
        .jenis-tab.aktif { border-color: var(--info); background: var(--info-50); color: var(--info); }
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
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 900, letterSpacing: "1px" }}>HANDBOOK MAGANG</h1>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Upload materi belajar (PDF/Video) untuk anak magang — langsung tampil begitu mereka login.</p>
        </div>
      </div>

      <div style={{ maxWidth: "800px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", padding: "18px 20px", marginBottom: "18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontSize: "13px", color: "var(--ink-soft)", fontWeight: 700 }}>
            <IconGraduationCap size={16} /> {jumlahAktif} dari {daftar.length} materi sedang tampil
          </div>
          <button onClick={() => setShowForm((v) => !v)} style={{ padding: "10px 18px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 700, background: "var(--info)", color: "#fff" }}>
            {showForm ? "Batal" : "+ Tambah Materi"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleBuat} style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", padding: "22px", marginBottom: "20px" }}>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", marginBottom: "6px" }}>Judul Materi *</label>
              <input required value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Contoh: Panduan Buku Tamu Digital" style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "14px", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", marginBottom: "6px" }}>Deskripsi (opsional)</label>
              <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} placeholder="Contoh: Wajib dipelajari sebelum jaga pos hari pertama." style={{ width: "100%", minHeight: "70px", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "14px", resize: "vertical", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", marginBottom: "8px" }}>Jenis Materi</label>
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" onClick={() => { setJenis("pdf"); setFileUrl(""); setNamaFile(""); }} className={`jenis-tab ${jenis === "pdf" ? "aktif" : ""}`}><IconFileText size={15} /> PDF</button>
                <button type="button" onClick={() => { setJenis("video"); setFileUrl(""); setNamaFile(""); }} className={`jenis-tab ${jenis === "video" ? "aktif" : ""}`}><IconVideo size={15} /> Video</button>
              </div>
            </div>

            {jenis === "pdf" && (
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", marginBottom: "8px" }}>File PDF * (maks {MAX_UKURAN_DOKUMEN_MB}MB)</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 18px", borderRadius: "10px", border: "1px dashed var(--info)", background: "var(--info-50)", color: "var(--info)", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                  {isUploadingFile ? "⏳ Mengunggah..." : namaFile ? `✓ ${namaFile}` : "Pilih File PDF"}
                  <input type="file" accept=".pdf" onChange={handleFileChange} disabled={isUploadingFile} style={{ display: "none" }} />
                </label>
              </div>
            )}

            {jenis === "video" && (
              <div style={{ marginBottom: "18px" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                  <button type="button" onClick={() => { setVideoMode("link"); setFileUrl(""); setNamaFile(""); }} className={`jenis-tab ${videoMode === "link" ? "aktif" : ""}`} style={{ fontSize: "12px" }}>🔗 Link Video (YouTube/Drive)</button>
                  <button type="button" onClick={() => setVideoMode("upload")} className={`jenis-tab ${videoMode === "upload" ? "aktif" : ""}`} style={{ fontSize: "12px" }}>⬆️ Upload File</button>
                </div>
                {videoMode === "link" ? (
                  <>
                    <input value={linkVideo} onChange={(e) => setLinkVideo(e.target.value)} placeholder="https://youtu.be/... atau https://drive.google.com/..." style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "14px", boxSizing: "border-box" }} />
                    <p style={{ margin: "6px 0 0 0", fontSize: "11px", color: "var(--muted)" }}>Disarankan untuk video berdurasi panjang — tidak terbatas ukuran file, anak magang tinggal klik untuk buka link.</p>
                  </>
                ) : (
                  <>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 18px", borderRadius: "10px", border: "1px dashed var(--info)", background: "var(--info-50)", color: "var(--info)", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                      {isUploadingFile ? "⏳ Mengunggah..." : namaFile ? `✓ ${namaFile}` : "Pilih File Video"}
                      <input type="file" accept="video/*" onChange={handleFileChange} disabled={isUploadingFile} style={{ display: "none" }} />
                    </label>
                    <p style={{ margin: "6px 0 0 0", fontSize: "11px", color: "var(--warn)" }}>⚠️ Maks {MAX_UKURAN_DOKUMEN_MB}MB — video umumnya lebih besar dari itu, kalau gagal upload gunakan opsi &quot;Link Video&quot; di atas.</p>
                  </>
                )}
              </div>
            )}

            <button type="submit" disabled={isSaving || isUploadingFile} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", cursor: isSaving ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 700, background: isSaving ? "var(--muted)" : "var(--ok)", color: "#fff" }}>
              {isSaving ? "Menyimpan..." : "🚀 Terbitkan Materi"}
            </button>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</div>
          ) : daftar.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)", background: "var(--surface)", borderRadius: "20px", border: "1px dashed var(--line)" }}>Belum ada materi handbook. Tambah yang pertama lewat tombol di atas.</div>
          ) : (
            daftar.map((item) => (
              <div key={item.id} style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--line)", overflow: "hidden", opacity: item.aktif ? 1 : 0.55, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: item.jenis === "pdf" ? "var(--red-50)" : "#f5f3ff", color: item.jenis === "pdf" ? "var(--red-600)" : "var(--accent)" }}>
                    {item.jenis === "pdf" ? <IconFileText size={18} /> : <IconVideo size={18} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--ink)" }}>{item.judul}</div>
                    {item.deskripsi && <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "3px" }}>{item.deskripsi}</div>}
                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "var(--info)", display: "inline-block", marginTop: "6px" }}>Lihat file/link &rarr;</a>
                  </div>
                </div>
                <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px dashed var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>oleh {item.dibuatOleh} &middot; {formatTanggal(item.dibuatPada)}</span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      onClick={() => handleToggleAktif(item)}
                      style={{ padding: "6px 14px", borderRadius: "20px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: 700, background: item.aktif ? "var(--ok-50)" : "var(--line)", color: item.aktif ? "var(--ok)" : "var(--muted)" }}
                    >
                      {item.aktif ? "🟢 Tampil" : "⚪ Disembunyikan"}
                    </button>
                    <button onClick={() => handleHapus(item)} style={{ padding: "6px 10px", borderRadius: "8px", border: "none", cursor: "pointer", background: "var(--red-50)", color: "var(--red-600)" }}>
                      <IconTrash />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
