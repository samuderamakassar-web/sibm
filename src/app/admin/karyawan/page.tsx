"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase"; 

interface Employee {
  id: string;
  nama: string;
  departemen: string;
  plat_kendaraan: string;
}

export default function ManajemenKaryawanPage() {
  const router = useRouter();
  
  const [adminName, setAdminName] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    nama: "",
    departemen: "",
    plat_kendaraan: ""
  });

  // 1. Verifikasi Akses Admin & Load Data
  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");
    
    if (!role || (!role.includes("Admin") && !role.includes("Koordinator"))) {
      alert("Akses Ditolak! Halaman ini khusus untuk Administrator.");
      router.push("/dashboard");
      return;
    }
    
    // PERBAIKAN: Gunakan setTimeout agar tidak memicu error linter cascading renders
    setTimeout(() => setAdminName(nama || "Admin"), 0);

    // Tarik data karyawan secara Real-time
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

  // 2. Fungsi Tambah Karyawan Manual
  const handleTambahKaryawan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await addDoc(collection(db, "employees_directory"), {
        nama: formData.nama,
        departemen: formData.departemen,
        plat_kendaraan: formData.plat_kendaraan || ""
      });

      alert("Data Karyawan berhasil ditambahkan!");
      setFormData({ nama: "", departemen: "", plat_kendaraan: "" }); 
    } catch (error) {
      console.error("Error menambah karyawan:", error);
      alert("Gagal menambahkan data.");
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Fungsi Tambah Massal via File CSV
  const handleUploadCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("Pastikan format file CSV Anda: Nama, Departemen, Plat Kendaraan. Lanjutkan import?")) return;

    setIsLoading(true);
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n");
      
      let suksesCount = 0;

      try {
        // Mulai dari i=1 untuk melompati baris judul (Header) di Excel/CSV
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const [nama, dept, plat] = line.split(",");
          
          if (nama && dept) {
            await addDoc(collection(db, "employees_directory"), {
              nama: nama.trim(),
              departemen: dept.trim(),
              plat_kendaraan: plat ? plat.trim() : ""
            });
            suksesCount++;
          }
        }
        alert(`Berhasil mengimpor ${suksesCount} data karyawan secara massal!`);
      } catch (error) {
        console.error("Error Import CSV:", error);
        alert("Gagal memproses file CSV. Pastikan format kolom sudah benar dipisahkan dengan koma.");
      } finally {
        setIsLoading(false);
        e.target.value = ""; // Reset input file
      }
    };

    reader.readAsText(file);
  };

  // 4. Fungsi Hapus Karyawan
  const handleHapusKaryawan = async (id: string, nama: string) => {
    if (!window.confirm(`PERINGATAN: Anda yakin ingin menghapus data karyawan atas nama ${nama}?`)) return;

    try {
      await deleteDoc(doc(db, "employees_directory", id));
    } catch (error) {
      console.error("Error menghapus data:", error);
      alert("Gagal menghapus data karyawan.");
    }
  };

  // Filter pencarian
  const filteredEmployees = employees.filter(emp => 
    emp.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
    emp.departemen.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ backgroundColor: "#f0f4f8", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: "50px" }}>
      
      <div style={{ background: "white", padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={() => router.push("/admin/users")} style={{ background: "none", border: "none", fontSize: "16px", fontWeight: "bold", color: "#4a5568", cursor: "pointer" }}>
          ⬅ Kembali ke Admin
        </button>
        <div style={{ fontWeight: "bold", color: "#2c5282" }}>🏢 Master Data Karyawan</div>
        <div style={{ fontSize: "12px", fontWeight: "bold", color: "#718096" }}>👑 {adminName}</div>
      </div>

      <div style={{ maxWidth: "1000px", margin: "20px auto", padding: "0 20px" }}>
        
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "flex-start" }}>
          
          {/* KOLOM KIRI: FORM TAMBAH */}
          <div style={{ flex: "1 1 300px", background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", borderTop: "5px solid #3182ce" }}>
            <h2 style={{ margin: "0 0 15px 0", color: "#2b6cb0", fontSize: "18px" }}>➕ Tambah Satu per Satu</h2>
            <form onSubmit={handleTambahKaryawan} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Nama Lengkap *</label>
                <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Rina Hapsari" style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
              </div>
              
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Unit Bisnis / Departemen *</label>
                <input type="text" name="departemen" value={formData.departemen} onChange={handleInputChange} required placeholder="Contoh: Finance" style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Plat Nomor Kendaraan</label>
                <input type="text" name="plat_kendaraan" value={formData.plat_kendaraan} onChange={handleInputChange} placeholder="Contoh: DD 5678 QA (Opsional)" style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
              </div>

              <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "12px", background: isLoading ? "#a0aec0" : "#3182ce", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "10px" }}>
                {isLoading ? "Menyimpan..." : "Simpan Data"}
              </button>
            </form>

            <hr style={{ border: "1px dashed #e2e8f0", margin: "25px 0" }} />
            
            {/* AREA UPLOAD CSV MASSAL */}
            <h2 style={{ margin: "0 0 10px 0", color: "#dd6b20", fontSize: "16px" }}>📂 Upload Massal (File CSV)</h2>
            <p style={{ fontSize: "12px", color: "#718096", marginBottom: "15px" }}>Format excel Anda harus di-Save As ke CSV dengan kolom: <br/><b>Nama, Departemen, Plat Kendaraan</b></p>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleUploadCSV}
              disabled={isLoading}
              style={{ width: "100%", padding: "10px", border: "1px dashed #dd6b20", borderRadius: "6px", fontSize: "12px", cursor: isLoading ? "not-allowed" : "pointer" }}
            />
          </div>

          {/* KOLOM KANAN: TABEL DAFTAR KARYAWAN */}
          <div style={{ flex: "2 1 500px", background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", borderTop: "5px solid #4a5568" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px" }}>📋 Direktori ({employees.length} Orang)</h2>
              
              <input 
                type="text" 
                placeholder="🔍 Cari nama atau departemen..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: "20px", border: "1px solid #cbd5e0", fontSize: "13px", width: "250px" }}
              />
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
                <thead>
                  <tr style={{ background: "#edf2f7", color: "#4a5568" }}>
                    <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e0" }}>Nama</th>
                    <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e0" }}>Dept. / Unit</th>
                    <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e0" }}>Kendaraan</th>
                    <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e0", textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length > 0 ? filteredEmployees.map((emp) => (
                    <tr key={emp.id} style={{ borderBottom: "1px solid #edf2f7" }}>
                      <td style={{ padding: "12px", fontWeight: "bold", color: "#2c5282" }}>{emp.nama}</td>
                      <td style={{ padding: "12px", color: "#4a5568" }}>
                        <span style={{ background: "#ebf8ff", padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold" }}>{emp.departemen}</span>
                      </td>
                      <td style={{ padding: "12px", color: "#718096", fontSize: "13px" }}>{emp.plat_kendaraan || "-"}</td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <button onClick={() => handleHapusKaryawan(emp.id, emp.nama)} style={{ background: "#fff5f5", color: "#e53e3e", border: "1px solid #feb2b2", padding: "5px 10px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}>Hapus</button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "#a0aec0" }}>Tidak ada data yang ditemukan.</td>
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