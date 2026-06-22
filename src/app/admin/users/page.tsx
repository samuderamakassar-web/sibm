"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

interface UserData {
  id: string;
  nama: string;
  email: string; 
  departemen: string;
  role: string;
}

export default function UserManagementPage() {
  const router = useRouter();
  
  const [adminName, setAdminName] = useState("Admin");
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    nama: "",
    email: "", 
    departemen: "OB & CS",
    role: "Staff"
  });

  // 1. Verifikasi Admin & Set Nama
  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");
    
    if (!role || (!role.includes("Admin") && !role.includes("Koordinator"))) {
      alert("Akses Ditolak! Halaman ini khusus untuk Administrator.");
      router.push("/dashboard");
      return;
    }
    
    setTimeout(() => setAdminName(nama || "Admin"), 0);
  }, [router]);

  // 2. Tarik Data Users dari Firestore
  useEffect(() => {
    const usersRef = collection(db, "users_master");
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserData[];
      
      usersList.sort((a, b) => a.departemen.localeCompare(b.departemen));
      setUsers(usersList);
    });
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama.trim() || !formData.email.trim()) return alert("Nama dan Email wajib diisi!");
    
    setIsLoading(true);
    try {
      const userDataToSave = {
        nama: formData.nama,
        email: formData.email.toLowerCase(),
        departemen: formData.departemen,
        role: formData.role,
      };

      if (isEditMode && editId) {
        const userRef = doc(db, "users_master", editId);
        await updateDoc(userRef, { ...userDataToSave, waktu_update: serverTimestamp() });
        alert("Data pengguna berhasil diperbarui!");
      } else {
        await addDoc(collection(db, "users_master"), { ...userDataToSave, waktu_dibuat: serverTimestamp() });
        alert("Pengguna baru berhasil ditambahkan!");
      }

      setFormData({ nama: "", email: "", departemen: "OB & CS", role: "Staff" });
      setIsEditMode(false);
      setEditId(null);
    } catch (error) {
      console.error("Gagal menyimpan data:", error);
      alert("Terjadi kesalahan sistem saat menyimpan.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (user: UserData) => {
    setIsEditMode(true);
    setEditId(user.id);
    setFormData({ nama: user.nama, email: user.email || "", departemen: user.departemen, role: user.role });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string, nama: string) => {
    if (!window.confirm(`PERINGATAN: Hapus akses login untuk ${nama}?`)) return;
    try {
      await deleteDoc(doc(db, "users_master", id));
    } catch (error) {
      alert("Gagal menghapus data.");
    }
  };

  // Filter pencarian
  const filteredUsers = users.filter(user => 
    user.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.departemen.toLowerCase().includes(searchTerm.toLowerCase())
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

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>MANAJEMEN PENGGUNA</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Kelola akses login staf operasional (Security, OB, Driver, QHSE, GA)</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" }}>
          
          {/* ============================================================== */}
          {/* KOLOM KIRI: FORM TAMBAH / EDIT USER */}
          {/* ============================================================== */}
          <div style={{ flex: "1 1 350px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            <h2 style={{ margin: "0 0 20px 0", color: isEditMode ? "#d69e2e" : "#1a202c", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
              <span>{isEditMode ? "✏️" : "👤"}</span> {isEditMode ? "Edit Data Pengguna" : "Input Pengguna Baru"}
            </h2>
            
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Nama Lengkap Asli *</label>
                <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Hilal Akbar" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px", outline: "none" }} />
              </div>
              
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Email Login *</label>
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} required placeholder="contoh@sibm.com" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px", outline: "none" }} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Departemen / Divisi *</label>
                <select name="departemen" value={formData.departemen} onChange={handleInputChange} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px", cursor: "pointer", outline: "none" }}>
                  <option value="OB & CS">OB & CS</option>
                  <option value="Security">Security</option>
                  <option value="Driver">Driver</option>
                  {/* TAMBAHAN DIVISI QHSE DI SINI */}
                  <option value="QHSE">QHSE (Safety & Env)</option>
                  <option value="Admin GA">Admin GA</option>
                  <option value="Management">Management</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Role / Jabatan *</label>
                <select name="role" value={formData.role} onChange={handleInputChange} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px", cursor: "pointer", outline: "none" }}>
                  <option value="Staff">Staff / Anggota</option>
                  <option value="Koordinator / Danru">Koordinator / Danru / SPV</option>
                  <option value="Administrator">Administrator / Manager</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" disabled={isLoading} style={{ flex: 1, padding: "15px", background: isLoading ? "#a0aec0" : (isEditMode ? "#d69e2e" : "#3182ce"), color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: isLoading ? "not-allowed" : "pointer", boxShadow: isLoading ? "none" : `0 4px 6px ${isEditMode ? "rgba(214,158,46,0.3)" : "rgba(49,130,206,0.3)"}`, transition: "0.2s" }}>
                  {isLoading ? "Menyimpan..." : (isEditMode ? "Simpan Perubahan" : "➕ Tambahkan")}
                </button>
                {isEditMode && (
                  <button type="button" onClick={() => { setIsEditMode(false); setEditId(null); setFormData({ nama: "", email: "", departemen: "OB & CS", role: "Staff" }); }} style={{ padding: "15px", background: "#edf2f7", color: "#4a5568", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}>
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* ============================================================== */}
          {/* KOLOM KANAN: TABEL DAFTAR PENGGUNA */}
          {/* ============================================================== */}
          <div style={{ flex: "2 1 600px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>📋</span> Daftar Pengguna Sistem <span style={{ background: "#edf2f7", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", color: "#4a5568" }}>{users.length} Akun</span>
              </h2>
              
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Cari nama, email, atau dept..." 
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
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Nama & Email</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Departemen</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Role / Akses</th>
                    <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length > 0 ? filteredUsers.map((user) => {
                    // Warna khusus untuk label departemen
                    const deptColor = user.departemen === "QHSE" ? "#38a169" : (user.departemen === "Security" ? "#e53e3e" : (user.departemen.includes("OB") ? "#dd6b20" : "#4a5568"));
                    const deptBg = user.departemen === "QHSE" ? "#f0fff4" : (user.departemen === "Security" ? "#fff5f5" : (user.departemen.includes("OB") ? "#fffaf0" : "#edf2f7"));

                    return (
                      <tr key={user.id} style={{ borderBottom: "1px solid #edf2f7", transition: "background 0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#f7fafc"} onMouseOut={(e) => e.currentTarget.style.background = "white"}>
                        <td style={{ padding: "12px 15px" }}>
                          <div style={{ fontWeight: "bold", color: "#2c5282", marginBottom: "3px" }}>{user.nama}</div>
                          <div style={{ color: "#718096", fontSize: "12px" }}>{user.email || <span style={{ fontStyle: "italic", opacity: 0.7 }}>Email belum diset</span>}</div>
                        </td>
                        <td style={{ padding: "12px 15px" }}>
                          <span style={{ background: deptBg, color: deptColor, padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold" }}>{user.departemen}</span>
                        </td>
                        <td style={{ padding: "12px 15px" }}>
                          <span style={{ 
                            background: user.role.includes("Administrator") ? "#fff5f5" : (user.role.includes("Koordinator") ? "#fffaf0" : "#ebf8ff"), 
                            color: user.role.includes("Administrator") ? "#c53030" : (user.role.includes("Koordinator") ? "#dd6b20" : "#3182ce"), 
                            padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold" 
                          }}>
                            {user.role}
                          </span>
                        </td>
                        <td style={{ padding: "12px 15px", textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                          <button 
                            onClick={() => handleEdit(user)} 
                            style={{ background: "#fffaf0", color: "#dd6b20", border: "1px solid #feebc8", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}
                            onMouseOver={(e) => { e.currentTarget.style.background = "#dd6b20"; e.currentTarget.style.color = "white"; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = "#fffaf0"; e.currentTarget.style.color = "#dd6b20"; }}
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDelete(user.id, user.nama)} 
                            style={{ background: "#fff5f5", color: "#e53e3e", border: "1px solid #fed7d7", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}
                            onMouseOver={(e) => { e.currentTarget.style.background = "#e53e3e"; e.currentTarget.style.color = "white"; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = "#fff5f5"; e.currentTarget.style.color = "#e53e3e"; }}
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={4} style={{ padding: "50px 20px", textAlign: "center", color: "#a0aec0" }}>
                        <div style={{ fontSize: "30px", marginBottom: "10px" }}>📭</div>
                        Tidak ada pengguna yang sesuai dengan pencarian Anda.
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