"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider"; 

// Normalisasi nomor WA ke format internasional 62xxxxxxxxxx (dibutuhkan Fonnte/WA API)
// Contoh: "0812-3456-7890" atau "+62 812 3456 7890" -> "6281234567890"
function normalizeNoWA(raw: string): string {
  if (!raw) return "";
  let digits = raw.replace(/[^0-9]/g, ""); // buang selain angka
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  if (digits.startsWith("8")) digits = "62" + digits; // jaga-jaga jika user isi tanpa 0/62
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
  
  const [adminName, setAdminName] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null); // null = mode tambah baru, isi = mode edit

  const [formData, setFormData] = useState({
    nama: "",
    departemen: "",
    plat_kendaraan: "",
    no_wa: "",
    email: ""
  });

  // 1. Verifikasi Akses Admin & Load Data
  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");
    
    if (!role || (!role.includes("Admin") && !role.includes("Koordinator"))) {
      showToast("Akses Ditolak! Halaman ini khusus untuk Administrator.", "error");
      router.push("/dashboard");
      return;
    }
    
    setTimeout(() => setAdminName(nama || "Admin"), 0);

    const empRef = collection(db, "employees_directory");
    const q = query(empRef, orderBy("nama", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const empList: Employee[] = [];
      snapshot.forEach(docSnap => {
        empList.push({ ...docSnap.data(), id: docSnap.id } as Employee);
      });
      setEmployees(empList);
    });

    return () => unsubscribe();
  }, [router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 2. Fungsi Tambah / Update Karyawan (satu form, dua mode)
  const handleSubmitKaryawan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const dataToSave = {
      nama: formData.nama,
      departemen: formData.departemen,
      plat_kendaraan: formData.plat_kendaraan || "",
      no_wa: normalizeNoWA(formData.no_wa),
      email: formData.email.trim().toLowerCase()
    };

    try {
      if (editingId) {
        // Mode Update: perbarui dokumen yang sedang diedit
        await updateDoc(doc(db, "employees_directory", editingId), dataToSave);
        setEditingId(null);
        showToast(`Data ${dataToSave.nama} berhasil diperbarui.`, "success");
      } else {
        // Mode Tambah Baru
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

  // Isi form dengan data karyawan yang dipilih untuk diedit
  const handleMulaiEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setFormData({
      nama: emp.nama,
      departemen: emp.departemen,
      plat_kendaraan: emp.plat_kendaraan || "",
      no_wa: emp.no_wa || "",
      email: emp.email || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" }); // biar form kelihatan
  };

  // Batalkan mode edit, kosongkan form
  const handleBatalEdit = () => {
    setEditingId(null);
    setFormData({ nama: "", departemen: "", plat_kendaraan: "", no_wa: "", email: "" });
  };

  // 3. Fungsi Tambah Massal via File CSV
  const handleUploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lanjut = await confirm({
      title: "Import Data Karyawan",
      message: "Pastikan format file CSV Anda: Nama, Departemen, Plat Kendaraan, No WA, Email. Lanjutkan import?",
      confirmText: "Ya, Lanjutkan Import"
    });

    if (!lanjut) {
      e.target.value = ""; // Reset input file jika batal
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n");
      
      let suksesCount = 0;

      try {
        // Mulai dari i=1 untuk melompati baris judul (Header)
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
              email: email ? email.trim().toLowerCase() : ""
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
        e.target.value = ""; // Reset input file
      }
    };

    reader.readAsText(file);
  };

  // 4. Fungsi Hapus Karyawan
  const handleHapusKaryawan = async (id: string, nama: string) => {
    const yakin = await confirm({
      title: "Hapus Data Karyawan",
      message: `Yakin ingin menghapus data karyawan atas nama ${nama}? Tindakan ini tidak bisa dibatalkan.`,
      confirmText: "Ya, Hapus",
      variant: "danger"
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

  // Filter pencarian
  const filteredEmployees = employees.filter(emp => 
    emp.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
    emp.departemen.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.no_wa || "").includes(searchTerm) ||
    (emp.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Control Panel</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 Admin: {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION (TEMA MERAH SAMUDERA) */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>MASTER DATA KARYAWAN</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Manajemen direktori staf dan karyawan internal SIBM</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" }}>
          
          {/* ============================================================== */}
          {/* KOLOM KIRI: FORM TAMBAH MANUAL & UPLOAD CSV */}
          {/* ============================================================== */}
          <div style={{ flex: "1 1 350px", display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* 📝 FORM TAMBAH SATUAN */}
            <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
              <h2 style={{ margin: "0 0 20px 0", color: editingId ? "#dd6b20" : "#1a202c", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
                <span>{editingId ? "✏️" : "👤"}</span> {editingId ? "Edit Data Karyawan" : "Input Data Baru"}
              </h2>
              
              <form onSubmit={handleSubmitKaryawan} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Nama Lengkap *</label>
                  <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Rina Hapsari" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px" }} />
                </div>
                
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Unit Bisnis / Departemen *</label>
                  <input type="text" name="departemen" value={formData.departemen} onChange={handleInputChange} required placeholder="Contoh: Finance / Marketing" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px" }} />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Plat Nomor Kendaraan</label>
                  <input type="text" name="plat_kendaraan" value={formData.plat_kendaraan} onChange={handleInputChange} placeholder="Contoh: DD 5678 QA (Opsional)" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px" }} />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>No. WhatsApp *</label>
                  <input type="tel" name="no_wa" value={formData.no_wa} onChange={handleInputChange} required placeholder="Contoh: 08123456789" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px" }} />
                  <span style={{ fontSize: "11px", color: "#a0aec0" }}>Dipakai untuk kirim notifikasi paket, overtime, helpdesk, dll.</span>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="Contoh: rina@samudera.co.id (Opsional)" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px" }} />
                </div>

                <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "15px", background: isLoading ? "#a0aec0" : (editingId ? "#dd6b20" : "#3182ce"), color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "10px", boxShadow: isLoading ? "none" : `0 4px 6px ${editingId ? "rgba(221,107,32,0.3)" : "rgba(49,130,206,0.3)"}`, transition: "0.2s" }}>
                  {isLoading ? "Menyimpan..." : (editingId ? "💾 Update Data" : "➕ Simpan ke Direktori")}
                </button>

                {editingId && (
                  <button type="button" onClick={handleBatalEdit} style={{ width: "100%", padding: "12px", background: "white", color: "#718096", border: "1px solid #cbd5e0", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" }}>
                    Batal Edit
                  </button>
                )}
              </form>
            </div>

            {/* 📂 UPLOAD CSV MASSAL */}
            <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
              <h2 style={{ margin: "0 0 15px 0", color: "#dd6b20", fontSize: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>📂</span> Upload Massal (.CSV)
              </h2>
              <div style={{ fontSize: "12px", color: "#718096", marginBottom: "15px", background: "#fffaf0", padding: "12px", borderRadius: "8px", border: "1px solid #feebc8" }}>
                <strong>Format Data Wajib:</strong><br/>
                Kolom A: Nama<br/>
                Kolom B: Departemen<br/>
                Kolom C: Plat Kendaraan<br/>
                Kolom D: No. WhatsApp (mis. 08123456789)<br/>
                Kolom E: Email (opsional)
              </div>
              
              <div style={{ position: "relative", overflow: "hidden", display: "inline-block", width: "100%" }}>
                <button style={{ width: "100%", padding: "15px", background: "#edf2f7", border: "2px dashed #a0aec0", borderRadius: "10px", color: "#4a5568", fontWeight: "bold", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <span>📥</span> Pilih File CSV
                </button>
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleUploadCSV}
                  disabled={isLoading}
                  style={{ position: "absolute", left: 0, top: 0, opacity: 0, cursor: "pointer", height: "100%", width: "100%" }}
                />
              </div>
            </div>

          </div>

          {/* ============================================================== */}
          {/* KOLOM KANAN: TABEL DAFTAR KARYAWAN */}
          {/* ============================================================== */}
          <div style={{ flex: "2 1 600px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>📋</span> Direktori SIBM <span style={{ background: "#edf2f7", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", color: "#4a5568" }}>{employees.length} Karyawan</span>
              </h2>
              
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Cari nama atau departemen..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid #cbd5e0", fontSize: "13px", width: "260px", background: "#f8fafc", outline: "none" }}
                />
              </div>
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Nama Karyawan</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Departemen / Unit</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Kendaraan</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>No. WhatsApp</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Email</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length > 0 ? filteredEmployees.map((emp) => (
                    <tr key={emp.id} style={{ borderBottom: "1px solid #edf2f7", transition: "background 0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#f7fafc"} onMouseOut={(e) => e.currentTarget.style.background = "white"}>
                      <td style={{ padding: "12px 15px", fontWeight: "bold", color: "#2c5282" }}>{emp.nama}</td>
                      <td style={{ padding: "12px 15px", color: "#4a5568" }}>
                        <span style={{ background: "#ebf8ff", color: "#2b6cb0", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold" }}>{emp.departemen}</span>
                      </td>
                      <td style={{ padding: "12px 15px", color: "#718096", fontSize: "13px" }}>{emp.plat_kendaraan || <span style={{ opacity: 0.5 }}>-</span>}</td>
                      <td style={{ padding: "12px 15px", color: "#718096", fontSize: "13px" }}>{emp.no_wa || <span style={{ opacity: 0.5 }}>-</span>}</td>
                      <td style={{ padding: "12px 15px", color: "#718096", fontSize: "13px" }}>{emp.email || <span style={{ opacity: 0.5 }}>-</span>}</td>
                      <td style={{ padding: "12px 15px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <button 
                          onClick={() => handleMulaiEdit(emp)} 
                          style={{ background: "#fffaf0", color: "#dd6b20", border: "1px solid #feebc8", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s", marginRight: "6px" }}
                          onMouseOver={(e) => { e.currentTarget.style.background = "#dd6b20"; e.currentTarget.style.color = "white"; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = "#fffaf0"; e.currentTarget.style.color = "#dd6b20"; }}
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleHapusKaryawan(emp.id, emp.nama)} 
                          style={{ background: "#fff5f5", color: "#e53e3e", border: "1px solid #fed7d7", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}
                          onMouseOver={(e) => { e.currentTarget.style.background = "#e53e3e"; e.currentTarget.style.color = "white"; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = "#fff5f5"; e.currentTarget.style.color = "#e53e3e"; }}
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} style={{ padding: "50px 20px", textAlign: "center", color: "#a0aec0" }}>
                        <div style={{ fontSize: "30px", marginBottom: "10px" }}>📭</div>
                        Tidak ada data karyawan yang ditemukan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}