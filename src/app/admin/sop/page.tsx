"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { handleDokumenUpload, MAX_UKURAN_DOKUMEN_MB } from "@/lib/uploadDokumen";
import AdminShell from "../../../components/admin/AdminShell";
import { daerahTulis } from "@/lib/daerah";

type IconProps = { size?: number; color?: string };
const IconBook = ({ size = 20, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
);
const IconFileText = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5" /><path d="M9.5 16.5h5" /></svg>
);
const IconTrash = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" /></svg>
);
const IconInboxEmpty = ({ size = 26, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);

interface SopDoc {
  id: string;
  judul: string;
  deskripsi: string;
  target_dept: string;
  file_url: string;
  file_name: string;
  diupload_oleh: string;
  waktu_upload: Timestamp | null;
}

// Menu tujuan SOP — sesuai dashboard yang sudah punya halaman viewer SOP-nya sendiri
const TARGET_DEPT_OPSI = ["Security", "Driver", "OB & CS"];

const sharedInputStyle = {
  width: "100%", padding: "13px 15px", borderRadius: "12px", border: "1px solid var(--line)",
  fontSize: "14px", background: "var(--bg)", outline: "none", boxSizing: "border-box" as const,
  transition: "all 0.2s", color: "var(--ink)", fontFamily: "inherit",
};

export default function AdminSopPage() {
  const showToast = useToast();
  const confirm = useConfirm();

  const { session, isReady } = useAuthGuard({
    depts: ["Admin GA"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });
  const adminName = session?.nama || "Admin";

  const [daftarSop, setDaftarSop] = useState<SopDoc[]>([]);
  const [filterDept, setFilterDept] = useState<string>("Semua");

  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [targetDept, setTargetDept] = useState<string>(TARGET_DEPT_OPSI[0]);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "sop_documents"), orderBy("waktu_upload", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDaftarSop(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SopDoc)));
    });
    return () => unsub();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // biar bisa pilih file yang sama lagi kalau upload sebelumnya gagal/dibatalkan
    if (!file) return;
    if (file.size > MAX_UKURAN_DOKUMEN_MB * 1024 * 1024) {
      showToast(`Ukuran file maksimal ${MAX_UKURAN_DOKUMEN_MB}MB. File ini ${(file.size / 1024 / 1024).toFixed(1)}MB.`, "warning");
      return;
    }
    handleDokumenUpload(
      file, "sibm/sop",
      () => setIsUploadingFile(true),
      (url, namaFile) => { setFileUrl(url); setFileName(namaFile); },
      (err) => { console.error(err); showToast(err instanceof Error ? err.message : "Gagal upload dokumen, coba lagi.", "error"); },
      () => setIsUploadingFile(false)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!judul.trim()) return showToast("Judul dokumen wajib diisi.", "warning");
    if (!fileUrl) return showToast("Upload dokumen SOP/IK dulu.", "warning");
    if (isUploadingFile) return showToast("Tunggu upload dokumen selesai dulu.", "warning");

    setIsSaving(true);
    try {
      await addDoc(collection(db, "sop_documents"), { daerah: daerahTulis(),
        judul: judul.trim(),
        deskripsi: deskripsi.trim(),
        target_dept: targetDept,
        file_url: fileUrl,
        file_name: fileName,
        diupload_oleh: adminName,
        waktu_upload: serverTimestamp(),
      });
      showToast(`Dokumen SOP berhasil diterbitkan ke menu ${targetDept}!`, "success");
      setJudul("");
      setDeskripsi("");
      setFileUrl("");
      setFileName("");
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan dokumen SOP.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (sop: SopDoc) => {
    const yakin = await confirm({
      title: "Hapus Dokumen SOP",
      message: `Yakin ingin menghapus "${sop.judul}"? Dokumen ini akan hilang dari menu ${sop.target_dept}.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      variant: "danger",
    });
    if (!yakin) return;
    try {
      await deleteDoc(doc(db, "sop_documents", sop.id));
      showToast("Dokumen SOP berhasil dihapus.", "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus dokumen.", "error");
    }
  };

  const formatTanggal = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  };

  const daftarTerfilter = filterDept === "Semua" ? daftarSop : daftarSop.filter((s) => s.target_dept === filterDept);

  const deptColors: Record<string, { bg: string; color: string }> = {
    Security: { bg: "var(--red-50)", color: "var(--red-600)" },
    Driver: { bg: "var(--info-50)", color: "var(--info)" },
    "OB & CS": { bg: "var(--ok-50)", color: "var(--ok)" },
  };

  if (!isReady) return null;

  return (
    <AdminShell title="SOP & Instruksi Kerja" subtitle="Terbitkan dokumen SOP/IK ke menu Security, Driver, atau OB & CS" userName={adminName || "Admin"}>
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }
        .panel-flat { background: var(--tile); padding: 24px; border-radius: 28px; border: none; box-sizing: border-box; }
        .field-label { display: block; font-weight: 800; margin-bottom: 6px; font-size: 12px; color: var(--ink-soft); }
        .dept-filter-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
        .dept-filter-btn { padding: 8px 16px; border-radius: 10px; font-size: 12px; font-weight: 800; cursor: pointer; border: 1px solid var(--line); background: var(--surface); color: var(--muted); font-family: inherit; }
        .dept-filter-btn.active { background: var(--accent-solid); border-color: var(--accent-solid); color: #fff; }
        .sop-row { display: flex; align-items: flex-start; gap: 14px; padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--bg); }
        .dept-badge { font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 6px; display: inline-block; }
      `}} />

      <div style={{ maxWidth: "760px", display: "flex", flexDirection: "column", gap: "16px" }}>

        <div className="panel-flat">
          <h3 style={{ margin: "0 0 16px 0", color: "var(--ink)", fontSize: "15px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
            <IconBook size={18} color="var(--accent)" /> TERBITKAN DOKUMEN BARU
          </h3>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label className="field-label">JUDUL DOKUMEN *</label>
              <input type="text" required placeholder="Cth: SOP Buku Tamu Digital v2" value={judul} onChange={(e) => setJudul(e.target.value)} style={sharedInputStyle} />
            </div>
            <div>
              <label className="field-label">DESKRIPSI (OPSIONAL)</label>
              <textarea placeholder="Ringkasan singkat isi dokumen..." value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} style={{ ...sharedInputStyle, height: "60px", resize: "none" }} />
            </div>
            <div>
              <label className="field-label">TUJUKAN KE MENU *</label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {TARGET_DEPT_OPSI.map((d) => (
                  <button key={d} type="button" onClick={() => setTargetDept(d)} style={{ padding: "9px 16px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", border: targetDept === d ? "2px solid var(--accent)" : "1px solid var(--line)", background: targetDept === d ? "var(--accent-50)" : "var(--bg)", color: targetDept === d ? "var(--accent)" : "var(--ink-soft)" }}>
                    {targetDept === d ? "✓ " : ""}{d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="field-label">FILE DOKUMEN (PDF/WORD/GAMBAR) *</label>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--bg)", border: fileUrl ? "1px solid var(--line)" : "1px dashed #fc8181", borderRadius: "12px", padding: "12px" }}>
                <span style={{ fontSize: "20px" }}>{fileUrl ? "📄" : "📎"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {fileName && <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>}
                  <label style={{ display: "inline-block", marginTop: fileName ? "6px" : "0", padding: "7px 14px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", cursor: "pointer" }}>
                    {isUploadingFile ? "⏳ Mengunggah..." : (fileUrl ? "Ganti File" : "Pilih File")}
                    <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={handleFileChange} disabled={isUploadingFile} style={{ display: "none" }} />
                  </label>
                </div>
              </div>
            </div>
            <button type="submit" disabled={isSaving || isUploadingFile} style={{ width: "100%", padding: "15px", background: isSaving ? "#a0aec0" : "var(--accent-solid)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: "900", fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer" }}>
              {isSaving ? "Menerbitkan..." : "📘 Terbitkan Dokumen SOP"}
            </button>
          </form>
        </div>

        <div className="panel-flat">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "15px", fontWeight: "800" }}>DOKUMEN TERBIT ({daftarTerfilter.length})</h3>
            <div className="dept-filter-tabs">
              {["Semua", ...TARGET_DEPT_OPSI].map((d) => (
                <button key={d} className={`dept-filter-btn ${filterDept === d ? "active" : ""}`} onClick={() => setFilterDept(d)}>{d}</button>
              ))}
            </div>
          </div>

          {daftarTerfilter.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <IconInboxEmpty size={26} color="var(--muted)" /> Belum ada dokumen SOP.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {daftarTerfilter.map((sop) => {
                const dc = deptColors[sop.target_dept] || { bg: "var(--line)", color: "var(--ink-soft)" };
                return (
                  <div key={sop.id} className="sop-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                        <span className="dept-badge" style={{ background: dc.bg, color: dc.color }}>{sop.target_dept}</span>
                        <span style={{ fontSize: "11px", color: "var(--muted)" }}>{formatTanggal(sop.waktu_upload)}</span>
                      </div>
                      <div style={{ fontWeight: "800", color: "var(--ink)", fontSize: "14px" }}>{sop.judul}</div>
                      {sop.deskripsi && <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--ink-soft)" }}>{sop.deskripsi}</p>}
                      <a href={sop.file_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "8px", fontSize: "11px", fontWeight: "bold", color: "var(--info)", textDecoration: "none" }}>
                        <IconFileText size={13} /> {sop.file_name || "Lihat dokumen"}
                      </a>
                    </div>
                    <button onClick={() => handleDelete(sop)} style={{ background: "var(--red-50)", color: "var(--red-600)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "9px", width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      <IconTrash size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </AdminShell>
  );
}
