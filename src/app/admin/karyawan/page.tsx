"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "../../../components/ui/Table";
import { DAFTAR_UNIT_BISNIS, DAFTAR_DEPARTEMEN_INTERNAL } from "../../../lib/unitBisnis";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";

function normalizeNoWA(raw: string): string {
  if (!raw) return "";
  let digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  if (digits.startsWith("8")) digits = "62" + digits;
  return digits;
}

interface Employee {
  id: string;
  nama: string;
  departemen: string;
  plat_kendaraan: string;
  no_wa: string;
  email: string;
}

export default function ManajemenKaryawanPage() {
  const showToast = useToast();
  const confirm = useConfirm();

  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus untuk Administrator.",
  });

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nama: "",
    departemen: "",
    plat_kendaraan: "",
    no_wa: "",
    email: "",
  });

  useEffect(() => {
    if (!isReady || !session) return;

    const empRef = collection(db, "employees_directory");
    const q = query(empRef, orderBy("nama", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const empList: Employee[] = [];
      snapshot.forEach((docSnap) => {
        empList.push({ ...docSnap.data(), id: docSnap.id } as Employee);
      });
      setEmployees(empList);
    });

    return () => unsubscribe();
  }, [isReady, session]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmitKaryawan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const dataToSave = {
      nama: formData.nama,
      departemen: formData.departemen,
      plat_kendaraan: formData.plat_kendaraan || "",
      no_wa: normalizeNoWA(formData.no_wa),
      email: formData.email.trim().toLowerCase(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, "employees_directory", editingId), dataToSave);
        setEditingId(null);
        showToast(`Data ${dataToSave.nama} berhasil diperbarui.`, "success");
      } else {
        await addDoc(collection(db, "employees_directory"), dataToSave);
        showToast(`${dataToSave.nama} berhasil ditambahkan ke direktori.`, "success");
      }

      setFormData({ nama: "", departemen: "", plat_kendaraan: "", no_wa: "", email: "" });
    } catch (error) {
      console.error("Error menyimpan karyawan:", error);
      showToast("Gagal menyimpan data.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMulaiEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setFormData({
      nama: emp.nama,
      departemen: emp.departemen,
      plat_kendaraan: emp.plat_kendaraan || "",
      no_wa: emp.no_wa || "",
      email: emp.email || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBatalEdit = () => {
    setEditingId(null);
    setFormData({ nama: "", departemen: "", plat_kendaraan: "", no_wa: "", email: "" });
  };

  const handleUploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lanjut = await confirm({
      title: "Import Data Karyawan",
      message: "Pastikan format file CSV Anda: Nama, Departemen, Plat Kendaraan, No WA, Email. Lanjutkan import?",
      confirmText: "Ya, Lanjutkan Import",
    });

    if (!lanjut) {
      e.target.value = "";
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n");
      let suksesCount = 0;

      try {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const [nama, dept, plat, noWa, email] = line.split(",");

          if (nama && dept) {
            await addDoc(collection(db, "employees_directory"), {
              nama: nama.trim(),
              departemen: dept.trim(),
              plat_kendaraan: plat ? plat.trim() : "",
              no_wa: noWa ? normalizeNoWA(noWa.trim()) : "",
              email: email ? email.trim().toLowerCase() : "",
            });
            suksesCount++;
          }
        }
        showToast(`Berhasil mengimpor ${suksesCount} data karyawan secara massal!`, "success");
      } catch (error) {
        console.error("Error Import CSV:", error);
        showToast("Gagal memproses file CSV. Pastikan format kolom dipisahkan dengan koma (,).", "error");
      } finally {
        setIsLoading(false);
        e.target.value = "";
      }
    };

    reader.readAsText(file);
  };

  const handleHapusKaryawan = async (id: string, nama: string) => {
    const yakin = await confirm({
      title: "Hapus Data Karyawan",
      message: `Yakin ingin menghapus data karyawan atas nama ${nama}? Tindakan ini tidak bisa dibatalkan.`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (!yakin) return;

    try {
      await deleteDoc(doc(db, "employees_directory", id));
      showToast(`Data ${nama} berhasil dihapus.`, "success");
    } catch (error) {
      console.error("Error menghapus data:", error);
      showToast("Gagal menghapus data karyawan.", "error");
    }
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.departemen.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.no_wa || "").includes(searchTerm) ||
      (emp.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isReady || !session) return null;
  const adminName = session.nama || "Admin";

  return (
    <AdminShell
      title="Master Data Karyawan"
      subtitle="Direktori staf dan karyawan internal SIBM — dipakai untuk notifikasi paket, overtime, helpdesk, dll."
      userName={adminName}
    >
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
          <Tile>
            <h2 style={{ margin: "0 0 18px 0", color: editingId ? "var(--warn)" : "var(--ink)", fontSize: "17px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <AdminIcon name={editingId ? "idCard" : "userCircle"} size={18} />
              {editingId ? "Edit Data Karyawan" : "Input Data Baru"}
            </h2>

            <form onSubmit={handleSubmitKaryawan} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <Input label="Nama Lengkap *" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Rina Hapsari" />
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor="kary-dept" style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)" }}>Unit Bisnis / Departemen *</label>
                <select
                  id="kary-dept"
                  name="departemen"
                  value={formData.departemen}
                  onChange={handleInputChange}
                  required
                  style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "14px", background: "var(--bg)", outline: "none", boxSizing: "border-box", cursor: "pointer" }}
                >
                  <option value="" disabled>Pilih Unit Bisnis / Departemen...</option>
                  <optgroup label="Unit Bisnis (PT)">
                    {DAFTAR_UNIT_BISNIS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </optgroup>
                  <optgroup label="Departemen Internal Gedung">
                    {DAFTAR_DEPARTEMEN_INTERNAL.map((d) => <option key={d} value={d}>{d}</option>)}
                  </optgroup>
                </select>
              </div>
              <Input label="Plat Nomor Kendaraan" name="plat_kendaraan" value={formData.plat_kendaraan} onChange={handleInputChange} placeholder="Contoh: DD 5678 QA (Opsional)" />
              <Input
                label="No. WhatsApp *"
                type="tel"
                name="no_wa"
                value={formData.no_wa}
                onChange={handleInputChange}
                required
                placeholder="Contoh: 08123456789"
                hint="Dipakai untuk kirim notifikasi paket, overtime, helpdesk, dll."
              />
              <Input label="Email" type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="Contoh: rina@samudera.co.id (Opsional)" />

              <Button type="submit" loading={isLoading} loadingText="Menyimpan..." variant={editingId ? "warning" : "primary"} style={{ marginTop: "10px" }}>
                {editingId ? "Update Data" : "Simpan ke Direktori"}
              </Button>

              {editingId && (
                <Button type="button" variant="secondary" onClick={handleBatalEdit}>
                  Batal Edit
                </Button>
              )}
            </form>
          </Tile>

          <Tile>
            <h2 style={{ margin: "0 0 14px 0", color: "var(--ink)", fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <AdminIcon name="fileText" size={18} /> Upload Massal (.CSV)
            </h2>
            <div style={{ fontSize: "12.5px", color: "var(--warn)", marginBottom: "15px", background: "var(--warn-50)", padding: "12px 14px", borderRadius: "14px", lineHeight: 1.6 }}>
              <strong>Format Data Wajib:</strong><br />
              Kolom A: Nama<br />
              Kolom B: Departemen<br />
              Kolom C: Plat Kendaraan<br />
              Kolom D: No. WhatsApp (mis. 08123456789)<br />
              Kolom E: Email (opsional)
            </div>

            <label style={{ position: "relative", display: "flex", width: "100%", minHeight: "52px", padding: "14px", background: "var(--bg)", border: "2px dashed var(--line)", borderRadius: "16px", color: "var(--ink-soft)", fontWeight: "bold", justifyContent: "center", alignItems: "center", gap: "8px", cursor: isLoading ? "not-allowed" : "pointer", boxSizing: "border-box" }}>
              <AdminIcon name="fileText" size={17} /> Pilih File CSV
              <input type="file" accept=".csv" onChange={handleUploadCSV} disabled={isLoading} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
            </label>
          </Tile>
        </div>

        <Tile style={{ flex: "2 1 600px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "12px" }}>
            <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "17px", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              Direktori SIBM <span style={{ background: "var(--hover)", padding: "4px 10px", borderRadius: "10px", fontSize: "12px", color: "var(--ink-soft)" }}>{employees.length} Karyawan</span>
            </h2>

            <label className="sa-search" style={{ width: "260px", maxWidth: "100%" }}>
              <AdminIcon name="search" size={15} strokeWidth={2} />
              <input
                type="search"
                aria-label="Cari karyawan"
                placeholder="Cari nama atau departemen…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
          </div>

          <Table>
            <THead>
              <Tr>
                <Th>Nama Karyawan</Th>
                <Th>Departemen / Unit</Th>
                <Th>Kendaraan</Th>
                <Th>No. WhatsApp</Th>
                <Th>Email</Th>
                <Th style={{ textAlign: "center" }}>Aksi</Th>
              </Tr>
            </THead>
            <TBody>
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => (
                  <Tr key={emp.id}>
                    <Td style={{ fontWeight: "bold", color: "var(--ink)" }}>{emp.nama}</Td>
                    <Td>
                      <span style={{ background: "var(--info-50)", color: "var(--info)", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold" }}>{emp.departemen}</span>
                    </Td>
                    <Td style={{ color: "var(--muted)", fontSize: "13px" }}>{emp.plat_kendaraan || <span style={{ opacity: 0.5 }}>-</span>}</Td>
                    <Td style={{ color: "var(--muted)", fontSize: "13px" }}>{emp.no_wa || <span style={{ opacity: 0.5 }}>-</span>}</Td>
                    <Td style={{ color: "var(--muted)", fontSize: "13px" }}>{emp.email || <span style={{ opacity: 0.5 }}>-</span>}</Td>
                    <Td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        onClick={() => handleMulaiEdit(emp)}
                        style={{ background: "var(--warn-50)", color: "var(--warn)", border: "none", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", marginRight: "6px" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleHapusKaryawan(emp.id, emp.nama)}
                        style={{ background: "var(--red-50)", color: "var(--red-600)", border: "none", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}
                      >
                        Hapus
                      </button>
                    </Td>
                  </Tr>
                ))
              ) : (
                <Tr>
                  <Td colSpan={6} style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)" }}>
                    Tidak ada data karyawan yang ditemukan.
                  </Td>
                </Tr>
              )}
            </TBody>
          </Table>
        </Tile>
      </div>
    </AdminShell>
  );
}
