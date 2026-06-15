"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

interface UserData {
  id: string;
  nama: string;
  email: string; // <-- Tambahan Field Baru
  departemen: string;
  role: string;
}

export default function UserManagementPage() {
  const router = useRouter();
  
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nama: "",
    email: "", // <-- Tambahan Field Baru
    departemen: "OB & CS",
    role: "Staff"
  });

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
      alert("Terjadi kesalahan sistem.");
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
    if (!window.confirm(`Hapus user: ${nama}?`)) return;
    try {
      await deleteDoc(doc(db, "users_master", id));
    } catch (error) {
      alert("Gagal menghapus data.");
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1200px", margin: "0 auto", background: "#f7fafc", minHeight: "100vh" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button onClick={() => router.push("/admin")} style={{ padding: "8px 12px", background: "#e2e8f0", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
          ⬅ Kembali ke Dashboard
        </button>
        <div style={{ fontSize: "14px", fontWeight: "bold", color: "#2c5282" }}>⚙️ Data Master</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "25px", alignItems: "start" }}>
        
        {/* FORM TAMBAH USER */}
        <div style={{ background: "white", padding: "25px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <h2 style={{ margin: "0 0 15px 0", color: "#2c5282", fontSize: "18px" }}>
            {isEditMode ? "✏️ Edit Pengguna" : "➕ Tambah Pengguna"}
          </h2>
          
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px" }}>Nama Lengkap Asli:</label>
              <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Hilal Akbar" style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
            </div>
            
            {/* INPUT EMAIL BARU */}
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px" }}>Email Login:</label>
              <input type="email" name="email" value={formData.email} onChange={handleInputChange} required placeholder="contoh@sibm.com" style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px" }}>Departemen:</label>
              <select name="departemen" value={formData.departemen} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }}>
                <option value="OB & CS">OB & CS</option>
                <option value="Security">Security</option>
                <option value="Driver">Driver</option>
                <option value="Admin GA">Admin GA</option>
                <option value="Management">Management</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px" }}>Role / Jabatan:</label>
              <select name="role" value={formData.role} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }}>
                <option value="Staff">Staff / Anggota</option>
                <option value="Koordinator / Danru">Koordinator / Danru</option>
                <option value="Administrator">Administrator</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button type="submit" disabled={isLoading} style={{ flex: 1, padding: "12px", background: isEditMode ? "#d69e2e" : "#3182ce", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>
                {isLoading ? "Menyimpan..." : (isEditMode ? "Simpan Perubahan" : "Tambahkan")}
              </button>
              {isEditMode && <button type="button" onClick={() => { setIsEditMode(false); setEditId(null); setFormData({ nama: "", email: "", departemen: "OB & CS", role: "Staff" }); }} style={{ padding: "12px", background: "#e2e8f0", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>Batal</button>}
            </div>
          </form>
        </div>

        {/* TABEL USERS */}
        <div style={{ background: "white", padding: "25px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <h2 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "18px" }}>📋 Daftar Pengguna Sistem ({users.length})</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#edf2f7", color: "#4a5568" }}>
                  <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>Nama & Email</th>
                  <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>Departemen</th>
                  <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>Role</th>
                  <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "12px" }}>
                      <strong style={{ color: "#2d3748" }}>{user.nama}</strong><br/>
                      <span style={{ color: "#718096", fontSize: "12px" }}>{user.email || "Email belum diset"}</span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ background: "#edf2f7", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" }}>{user.departemen}</span>
                    </td>
                    <td style={{ padding: "12px", color: "#718096" }}>{user.role}</td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <button onClick={() => handleEdit(user)} style={{ background: "#ecc94b", color: "#744210", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", marginRight: "5px", fontWeight: "bold", fontSize: "12px" }}>Edit</button>
                      <button onClick={() => handleDelete(user.id, user.nama)} style={{ background: "#fc8181", color: "#742a2a", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}