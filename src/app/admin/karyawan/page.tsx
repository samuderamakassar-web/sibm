"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Input from "../../../components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "../../../components/ui/Table";
import { DAFTAR_UNIT_BISNIS, DAFTAR_DEPARTEMEN_INTERNAL } from "../../../lib/unitBisnis";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

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
  const router = useRouter();
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
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
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
        .back-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px;
        }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge {
          display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info);
          padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2);
        }
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
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>MASTER DATA KARYAWAN</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Manajemen direktori staf dan karyawan internal SIBM</p>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 350px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <Card>
              <h2 style={{ margin: "0 0 20px 0", color: editingId ? "var(--warn)" : "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid var(--line)", paddingBottom: "10px" }}>
                <span>{editingId ? "✏️" : "👤"}</span> {editingId ? "Edit Data Karyawan" : "Input Data Baru"}
              </h2>

              <form onSubmit={handleSubmitKaryawan} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <Input label="Nama Lengkap *" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Rina Hapsari" />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568" }}>Unit Bisnis / Departemen *</label>
                  <select
                    name="departemen"
                    value={formData.departemen}
                    onChange={handleInputChange}
                    required
                    style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none", boxSizing: "border-box", cursor: "pointer" }}
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
                  {editingId ? "💾 Update Data" : "➕ Simpan ke Direktori"}
                </Button>

                {editingId && (
                  <Button type="button" variant="secondary" onClick={handleBatalEdit}>
                    Batal Edit
                  </Button>
                )}
              </form>
            </Card>

            <Card>
              <h2 style={{ margin: "0 0 15px 0", color: "var(--warn)", fontSize: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>📂</span> Upload Massal (.CSV)
              </h2>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "15px", background: "var(--warn-50)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(217,119,6,0.2)" }}>
                <strong>Format Data Wajib:</strong><br />
                Kolom A: Nama<br />
                Kolom B: Departemen<br />
                Kolom C: Plat Kendaraan<br />
                Kolom D: No. WhatsApp (mis. 08123456789)<br />
                Kolom E: Email (opsional)
              </div>

              <div style={{ position: "relative", overflow: "hidden", display: "inline-block", width: "100%" }}>
                <button style={{ width: "100%", padding: "15px", background: "var(--bg)", border: "2px dashed var(--muted)", borderRadius: "10px", color: "var(--ink-soft)", fontWeight: "bold", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <span>📥</span> Pilih File CSV
                </button>
                <input type="file" accept=".csv" onChange={handleUploadCSV} disabled={isLoading} style={{ position: "absolute", left: 0, top: 0, opacity: 0, cursor: "pointer", height: "100%", width: "100%" }} />
              </div>
            </Card>
          </div>

          <Card style={{ flex: "2 1 600px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>📋</span> Direktori SIBM <span style={{ background: "var(--bg)", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", color: "var(--ink-soft)" }}>{employees.length} Karyawan</span>
              </h2>

              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input
                  type="text"
                  placeholder="Cari nama atau departemen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "260px", background: "var(--bg)", outline: "none" }}
                />
              </div>
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
                      <Td style={{ fontWeight: "bold", color: "var(--info)" }}>{emp.nama}</Td>
                      <Td>
                        <span style={{ background: "var(--info-50)", color: "var(--info)", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold" }}>{emp.departemen}</span>
                      </Td>
                      <Td style={{ color: "var(--muted)", fontSize: "13px" }}>{emp.plat_kendaraan || <span style={{ opacity: 0.5 }}>-</span>}</Td>
                      <Td style={{ color: "var(--muted)", fontSize: "13px" }}>{emp.no_wa || <span style={{ opacity: 0.5 }}>-</span>}</Td>
                      <Td style={{ color: "var(--muted)", fontSize: "13px" }}>{emp.email || <span style={{ opacity: 0.5 }}>-</span>}</Td>
                      <Td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => handleMulaiEdit(emp)}
                          style={{ background: "var(--warn-50)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.2)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", marginRight: "6px" }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleHapusKaryawan(emp.id, emp.nama)}
                          style={{ background: "var(--red-50)", color: "var(--red-600)", border: "1px solid rgba(220,38,38,0.2)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}
                        >
                          Hapus
                        </button>
                      </Td>
                    </Tr>
                  ))
                ) : (
                  <Tr>
                    <Td colSpan={6} style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)" }}>
                      <div style={{ fontSize: "30px", marginBottom: "10px" }}>📭</div>
                      Tidak ada data karyawan yang ditemukan.
                    </Td>
                  </Tr>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
}