"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Modal from "../../../components/ui/Modal";
import { handleDokumenUpload, MAX_UKURAN_DOKUMEN_MB } from "../../../lib/uploadDokumen";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";

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
  Legalitas: { bg: "var(--accent-50)", color: "var(--accent)" },
  Perizinan: { bg: "var(--info-50)", color: "var(--info)" },
  Perjanjian: { bg: "var(--ok-50)", color: "var(--ok)" },
};

export default function AdminLegalitasPage() {
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
    <AdminShell
      title="Legalitas & Perizinan"
      subtitle="Dokumen legalitas, perizinan & perjanjian — tiap diperpanjang, riwayat versi lama tetap tersimpan"
      userName={session.nama || "Admin"}
      actions={
        <button type="button" className="sa-btn is-primary" onClick={bukaTambah}>
          <AdminIcon name="stamp" size={16} /> Tambah Dokumen
        </button>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        .stat-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 16px; }
        .stat-card { border-radius: 22px; padding: 16px; }
        .stat-num { font-size: 26px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
        .stat-label { font-size: 12px; font-weight: 700; margin-top: 4px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .form-field > label:first-child { display: block; font-size: 12px; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
        .form-field input:not([type="file"]), .form-field select { width: 100%; height: 44px; padding: 0 13px; border-radius: 12px; border: 1px solid var(--line); font-size: 13.5px; background: var(--bg); outline: none; box-sizing: border-box; font-family: inherit; }
        @media (max-width: 768px) {
          .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .header-title-container { flex-direction: column; align-items: stretch !important; gap: 12px; }
          .search-input-wrapper { width: 100% !important; }
          .form-grid { grid-template-columns: 1fr; }
        }
      `}} />

      <div className="stat-grid">
        {[
          { label: "Total Dokumen", n: jumlah.total, bg: "var(--tile)", fg: "var(--ink)" },
          { label: "Aktif", n: jumlah.aktif, bg: "var(--ok-50)", fg: "var(--ok)" },
          { label: `Perlu Diperpanjang (≤${BATAS_HARI_PERLU_DIPERPANJANG} hari)`, n: jumlah.perlu, bg: "var(--warn-50)", fg: "var(--warn)" },
          { label: "Kadaluarsa", n: jumlah.kadaluarsa, bg: "var(--red-50)", fg: "var(--red-600)" },
        ].map((s) => (
          <div key={s.label} className="stat-card" style={{ background: s.bg, color: s.fg }}>
            <div className="stat-num">{s.n}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <Tile>
        <div className="header-title-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
          <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px", fontWeight: 700 }}>Daftar Dokumen</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <select className="sa-field" aria-label="Filter jenis" value={filterJenis} onChange={(e) => setFilterJenis(e.target.value as "SEMUA" | Jenis)}>
              <option value="SEMUA">Semua Jenis</option>
              <option value="Legalitas">Legalitas</option>
              <option value="Perizinan">Perizinan</option>
              <option value="Perjanjian">Perjanjian</option>
            </select>
            <select className="sa-field" aria-label="Filter status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="SEMUA">Semua Status</option>
              <option value="AKTIF">Aktif</option>
              <option value="PERLU">Perlu Diperpanjang</option>
              <option value="KADALUARSA">Kadaluarsa</option>
            </select>
            <label className="sa-search search-input-wrapper" style={{ width: "240px" }}>
              <AdminIcon name="search" size={15} strokeWidth={2} />
              <input type="search" aria-label="Cari dokumen" placeholder="Cari nama dokumen…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </label>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "16px" }}>
              {searchQuery || filterJenis !== "SEMUA" || filterStatus !== "SEMUA" ? "Data tidak ditemukan." : 'Belum ada dokumen. Klik "Tambah Dokumen" untuk mulai mendata.'}
            </div>
          ) : filtered.map((item) => {
            const st = hitungStatus(item);
            const isExpanded = expandedId === item.id;
            const riwayatLama = (item.riwayat || []).slice(0, -1).reverse();
            return (
              <div key={item.id} style={{ background: "var(--bg)", borderRadius: "20px", overflow: "hidden" }}>
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                        <span style={{ fontSize: "15.5px", fontWeight: 800, color: "var(--ink)" }}>{item.nama_dokumen}</span>
                        <span style={{ background: jenisWarna[item.jenis].bg, color: jenisWarna[item.jenis].color, padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700 }}>{item.jenis}</span>
                        <span style={{ background: st.bg, color: st.color, padding: "3px 9px", borderRadius: "8px", fontSize: "11px", fontWeight: 800 }}>{st.label}</span>
                      </div>
                      <div style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
                        Berlaku {formatTanggal(item.tanggal_mulai_aktif)} &rarr; {formatTanggal(item.tanggal_berakhir_aktif)}
                        <span style={{ marginLeft: "8px", fontWeight: 700, color: st.sisaHari < 0 ? "var(--red-600)" : st.sisaHari <= BATAS_HARI_PERLU_DIPERPANJANG ? "var(--warn)" : "var(--muted)" }}>
                          ({st.sisaHari < 0 ? `lewat ${Math.abs(st.sisaHari)} hari` : `${st.sisaHari} hari lagi`})
                        </span>
                      </div>
                      {item.catatan_aktif && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px", fontStyle: "italic" }}>{item.catatan_aktif}</div>}
                      <a href={item.file_url_aktif} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", fontWeight: 600, color: "var(--info)", display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "8px" }}>
                        <AdminIcon name="fileText" size={14} /> Lihat Scan Terbaru
                      </a>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      <button type="button" className="sa-btn is-soft" onClick={() => bukaPerbarui(item)} style={{ height: "38px", fontSize: "12.5px", background: "var(--info-50)", color: "var(--info)" }}>
                        <AdminIcon name="refresh" size={14} strokeWidth={2} /> Perbarui
                      </button>
                      <button type="button" onClick={() => handleDelete(item)} title="Hapus" aria-label={`Hapus ${item.nama_dokumen}`} style={{ background: "var(--red-50)", color: "var(--red-600)", border: "none", width: "38px", height: "38px", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                      </button>
                    </div>
                  </div>

                  {riwayatLama.length > 0 && (
                    <button type="button" aria-expanded={isExpanded} onClick={() => setExpandedId(isExpanded ? null : item.id)} style={{ marginTop: "10px", background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", padding: "4px 0", fontFamily: "inherit" }}>
                      <AdminIcon name="chevronRight" size={13} strokeWidth={2.2} style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                      Riwayat {riwayatLama.length} versi sebelumnya
                    </button>
                  )}
                </div>

                {isExpanded && riwayatLama.length > 0 && (
                  <div style={{ background: "var(--surface)", margin: "0 10px 10px", borderRadius: "14px", padding: "6px 14px" }}>
                    {riwayatLama.map((v, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: idx < riwayatLama.length - 1 ? "1px dashed var(--line)" : "none", fontSize: "12.5px", flexWrap: "wrap", gap: "6px" }}>
                        <span style={{ color: "var(--ink-soft)" }}>{formatTanggal(v.tanggal_mulai)} &rarr; {formatTanggal(v.tanggal_berakhir)}{v.catatan && <span style={{ color: "var(--muted)", fontStyle: "italic" }}> &middot; {v.catatan}</span>}</span>
                        <a href={v.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--info)", fontWeight: 600, flexShrink: 0 }}>Lihat Scan &rarr;</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Tile>

      <Modal open={showModal} onClose={() => !isSaving && setShowModal(false)} maxWidth="520px">
        <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: 800, color: "var(--ink)" }}>
          {modalMode === "baru" ? "Tambah Dokumen Baru" : `Perbarui: ${targetGroup?.nama_dokumen}`}
        </h3>
        {modalMode === "perbarui" && <p style={{ margin: "0 0 16px 0", fontSize: "12.5px", color: "var(--muted)" }}>Versi lama otomatis tersimpan di riwayat, versi baru ini yang jadi aktif.</p>}
        {modalMode === "baru" && <div style={{ height: "16px" }} />}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {modalMode === "baru" && (
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="leg-nama">Nama Dokumen *</label>
                <input id="leg-nama" type="text" required value={formData.nama_dokumen} onChange={(e) => setFormData({ ...formData, nama_dokumen: e.target.value })} placeholder="Cth: PMKU" />
              </div>
              <div className="form-field">
                <label htmlFor="leg-jenis">Jenis *</label>
                <select id="leg-jenis" value={formData.jenis} onChange={(e) => setFormData({ ...formData, jenis: e.target.value as Jenis })}>
                  <option value="Legalitas">Legalitas</option>
                  <option value="Perizinan">Perizinan</option>
                  <option value="Perjanjian">Perjanjian</option>
                </select>
              </div>
            </div>
          )}
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="leg-mulai">Tanggal Mulai Berlaku *</label>
              <input id="leg-mulai" type="date" required value={formData.tanggal_mulai} onChange={(e) => setFormData({ ...formData, tanggal_mulai: e.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="leg-akhir">Tanggal Berakhir *</label>
              <input id="leg-akhir" type="date" required value={formData.tanggal_berakhir} onChange={(e) => setFormData({ ...formData, tanggal_berakhir: e.target.value })} />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="leg-catatan">Catatan (opsional)</label>
            <input id="leg-catatan" type="text" value={formData.catatan} onChange={(e) => setFormData({ ...formData, catatan: e.target.value })} placeholder="Cth: Diperpanjang via notaris X" />
          </div>
          <div className="form-field">
            <label>Upload Scan * (PDF/Gambar, maks {MAX_UKURAN_DOKUMEN_MB}MB)</label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "48px", padding: "12px 16px", borderRadius: "14px", border: "1px dashed var(--info)", background: "var(--info-50)", color: "var(--info)", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
              <AdminIcon name="fileText" size={16} />
              {isUploadingFile ? "Mengunggah..." : formData.file_url ? `✓ ${namaFile}` : "Pilih File"}
              <input type="file" accept=".pdf,image/*" onChange={handleFileChange} disabled={isUploadingFile} style={{ display: "none" }} />
            </label>
          </div>
          <button type="submit" className="sa-btn is-primary" disabled={isSaving || isUploadingFile} style={{ marginTop: "6px", height: "48px", fontSize: "14px", opacity: isSaving || isUploadingFile ? 0.6 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}>
            {isSaving ? "Menyimpan..." : modalMode === "baru" ? "Simpan Dokumen" : "Simpan Versi Baru"}
          </button>
        </form>
      </Modal>
    </AdminShell>
  );
}
