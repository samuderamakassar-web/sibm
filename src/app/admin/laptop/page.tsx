"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Modal from "../../../components/ui/Modal";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";

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
    <AdminShell
      title="Master Data Laptop"
      subtitle="Data masa sewa laptop tiap user — pantau kapan harus diperpanjang"
      userName={session.nama || "Admin"}
      actions={
        <button type="button" className="sa-btn is-primary" onClick={bukaTambah}>
          <AdminIcon name="laptop" size={16} /> Tambah Laptop
        </button>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        .lap-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .lap-table th { padding: 14px 15px; font-weight: bold; background: var(--bg); color: var(--ink-soft); border-bottom: 2px solid var(--line); }
        .lap-table td { padding: 14px 15px; vertical-align: middle; border-bottom: 1px solid var(--line); word-wrap: break-word; }
        .stat-grid { display: grid; gap: 12px; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-bottom: 16px; }
        .stat-card { border-radius: 22px; padding: 16px; }
        .stat-num { font-size: 26px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
        .stat-label { font-size: 12px; font-weight: 700; margin-top: 4px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .form-field label { display: block; font-size: 12px; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
        .form-field input { width: 100%; height: 44px; padding: 0 13px; border-radius: 12px; border: 1px solid var(--line); font-size: 13.5px; background: var(--bg); outline: none; box-sizing: border-box; font-family: inherit; }
        .row-btn { width: 36px; height: 36px; border-radius: 12px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        @media (max-width: 900px) {
          .stat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 768px) {
          .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .header-title-container { flex-direction: column; align-items: stretch !important; gap: 12px; }
          .search-input-wrapper { width: 100% !important; }
          .lap-table, .lap-table tbody { display: block; width: 100%; }
          .lap-table thead { display: none; }
          .lap-table tr { display: block; width: 100%; margin-bottom: 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); overflow: hidden; }
          .lap-table td { display: block; width: 100%; padding: 12px 15px !important; border-bottom: 1px dashed var(--line) !important; text-align: left !important; }
          .lap-table td:last-child { border-bottom: none !important; }
          .lap-table td[data-label]::before { content: attr(data-label); display: block; font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
          .lap-aksi { justify-content: flex-start !important; }
          .form-grid { grid-template-columns: 1fr; }
        }
      `}} />

      <div className="stat-grid">
        {[
          { label: "Total Laptop", n: jumlah.total, bg: "var(--tile)", fg: "var(--ink)" },
          { label: "Aktif", n: jumlah.aktif, bg: "var(--ok-50)", fg: "var(--ok)" },
          { label: `Mau Habis (≤${BATAS_HARI_MAU_HABIS} hari)`, n: jumlah.mauHabis, bg: "var(--warn-50)", fg: "var(--warn)" },
          { label: "Sudah Habis", n: jumlah.sudahHabis, bg: "var(--red-50)", fg: "var(--red-600)" },
          { label: "Dikembalikan", n: jumlah.dikembalikan, bg: "var(--chip)", fg: "var(--ink-soft)" },
        ].map((s) => (
          <div key={s.label} className="stat-card" style={{ background: s.bg, color: s.fg }}>
            <div className="stat-num">{s.n}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <Tile>
        <div className="header-title-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
          <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px", fontWeight: 700 }}>Daftar Laptop</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <select className="sa-field" aria-label="Filter departemen" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
              <option value="SEMUA">Semua Departemen</option>
              {daftarDept.map((dpt) => <option key={dpt} value={dpt}>{dpt}</option>)}
            </select>
            <select className="sa-field" aria-label="Filter status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="SEMUA">Semua Status</option>
              <option value="AKTIF">Aktif</option>
              <option value="MAU">Mau Habis</option>
              <option value="SUDAH">Sudah Habis</option>
              <option value="DIKEMBALIKAN">Dikembalikan</option>
            </select>
            <label className="sa-search search-input-wrapper" style={{ width: "240px" }}>
              <AdminIcon name="search" size={15} strokeWidth={2} />
              <input type="search" aria-label="Cari laptop" placeholder="Cari user/merk/no seri…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </label>
          </div>
        </div>

        <div style={{ overflowX: "auto", borderRadius: "14px", border: "1px solid var(--line)", width: "100%" }}>
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
                      <div style={{ fontSize: "11.5px", color: "var(--ink-soft)", marginTop: "4px", background: "var(--hover)", padding: "2px 8px", borderRadius: "6px", display: "inline-block" }}>{item.departemen}</div>
                    </td>
                    <td data-label="Laptop">
                      <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{item.merk_model}</div>
                      {item.no_seri && <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "3px" }}>S/N: {item.no_seri}</div>}
                    </td>
                    <td data-label="Masa Sewa" style={{ color: "var(--ink-soft)", fontSize: "12.5px" }}>
                      {formatTanggal(item.tanggal_mulai)} &rarr; {formatTanggal(item.tanggal_berakhir)}
                      {!item.dikembalikan && st.sisaHari !== null && (
                        <div style={{ marginTop: "3px", fontSize: "11.5px", fontWeight: 700, color: st.sisaHari < 0 ? "var(--red-600)" : st.sisaHari <= BATAS_HARI_MAU_HABIS ? "var(--warn)" : "var(--muted)" }}>
                          {st.sisaHari < 0 ? `Lewat ${Math.abs(st.sisaHari)} hari` : `${st.sisaHari} hari lagi`}
                        </div>
                      )}
                    </td>
                    <td data-label="Vendor & Biaya" style={{ color: "var(--muted)", fontSize: "12px" }}>{item.vendor || "-"}<br />{formatRupiah(item.biaya_sewa)}</td>
                    <td data-label="Status">
                      <span style={{ background: st.label === "DIKEMBALIKAN" ? "var(--chip)" : st.bg, color: st.color, padding: "4px 9px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", display: "inline-block", whiteSpace: "nowrap" }}>{st.label}</span>
                    </td>
                    <td data-label="Aksi" style={{ textAlign: "center" }}>
                      <div className="lap-aksi" style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                        <button type="button" className="row-btn" onClick={() => bukaEdit(item)} title="Edit" aria-label={`Edit ${item.merk_model}`} style={{ background: "var(--info-50)", color: "var(--info)" }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                        </button>
                        <button type="button" className="row-btn" onClick={() => handleToggleDikembalikan(item)} title={item.dikembalikan ? "Aktifkan Kembali" : "Tandai Dikembalikan"} aria-label={item.dikembalikan ? "Aktifkan kembali" : "Tandai dikembalikan"} style={{ background: item.dikembalikan ? "var(--warn-50)" : "var(--ok-50)", color: item.dikembalikan ? "var(--warn)" : "var(--ok)" }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                        </button>
                        <button type="button" className="row-btn" onClick={() => handleDelete(item)} title="Hapus" aria-label={`Hapus ${item.merk_model}`} style={{ background: "var(--red-50)", color: "var(--red-600)" }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
                  {searchQuery || filterDept !== "SEMUA" || filterStatus !== "SEMUA" ? "Data tidak ditemukan." : "Belum ada data laptop. Klik \"Tambah Laptop\" untuk mulai mendata."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Tile>

      <Modal open={showModal} onClose={() => !isSaving && setShowModal(false)} maxWidth="520px">
        <h3 style={{ margin: "0 0 20px 0", fontSize: "18px", fontWeight: 800, color: "var(--ink)" }}>{editingId ? "Edit Data Laptop" : "Tambah Data Laptop"}</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="lap-user">Nama User *</label>
              <input id="lap-user" type="text" required value={formData.nama_user} onChange={(e) => setFormData({ ...formData, nama_user: e.target.value })} placeholder="Nama karyawan" />
            </div>
            <div className="form-field">
              <label htmlFor="lap-dept">Departemen / Divisi *</label>
              <input id="lap-dept" type="text" required value={formData.departemen} onChange={(e) => setFormData({ ...formData, departemen: e.target.value })} placeholder="Cth: Admin GA" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="lap-merk">Merk / Model *</label>
              <input id="lap-merk" type="text" required value={formData.merk_model} onChange={(e) => setFormData({ ...formData, merk_model: e.target.value })} placeholder="Cth: Lenovo ThinkPad E14" />
            </div>
            <div className="form-field">
              <label htmlFor="lap-seri">Nomor Seri</label>
              <input id="lap-seri" type="text" value={formData.no_seri} onChange={(e) => setFormData({ ...formData, no_seri: e.target.value })} placeholder="Opsional" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="lap-mulai">Tanggal Mulai Sewa *</label>
              <input id="lap-mulai" type="date" required value={formData.tanggal_mulai} onChange={(e) => setFormData({ ...formData, tanggal_mulai: e.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="lap-akhir">Tanggal Berakhir Sewa *</label>
              <input id="lap-akhir" type="date" required value={formData.tanggal_berakhir} onChange={(e) => setFormData({ ...formData, tanggal_berakhir: e.target.value })} />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="lap-vendor">Vendor Penyewaan</label>
              <input id="lap-vendor" type="text" value={formData.vendor} onChange={(e) => setFormData({ ...formData, vendor: e.target.value })} placeholder="Opsional" />
            </div>
            <div className="form-field">
              <label htmlFor="lap-biaya">Biaya Sewa (Rp)</label>
              <input id="lap-biaya" type="number" min="0" value={formData.biaya_sewa} onChange={(e) => setFormData({ ...formData, biaya_sewa: e.target.value })} placeholder="Opsional" />
            </div>
          </div>
          <button type="submit" className="sa-btn is-primary" disabled={isSaving} style={{ marginTop: "6px", height: "48px", fontSize: "14px", opacity: isSaving ? 0.6 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}>
            {isSaving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Data Laptop"}
          </button>
        </form>
      </Modal>
    </AdminShell>
  );
}
