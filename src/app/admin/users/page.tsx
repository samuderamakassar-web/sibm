"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";

interface UserData {
  id: string;
  nama: string;
  email: string;
  departemen: string;
  role: string;
  whatsapp?: string;
  password?: string;
}

export default function UserManagementPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();

  const [adminName, setAdminName] = useState("Admin");
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    nama: "",
    email: "",
    departemen: "OB & CS",
    role: "Staff",
    whatsapp: "",
    password: ""
  });

  // 1. Verifikasi Admin & Set Nama
  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");

    if (!role || (!role.includes("Admin") && !role.includes("Koordinator"))) {
      showToast("Akses Ditolak! Halaman ini khusus untuk Administrator.", "error");
      router.push("/");
      return;
    }

    setTimeout(() => setAdminName(nama || "Admin"), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!formData.nama.trim() || !formData.email.trim() || !formData.password.trim()) {
      showToast("Nama, Email, dan Password wajib diisi!", "warning");
      return;
    }

    setIsLoading(true);
    try {
      const userDataToSave = {
        nama: formData.nama,
        email: formData.email.toLowerCase(),
        departemen: formData.departemen,
        role: formData.role,
        whatsapp: formData.whatsapp,
        password: formData.password
      };

      if (isEditMode && editId) {
        const userRef = doc(db, "users_master", editId);
        await updateDoc(userRef, { ...userDataToSave, waktu_update: serverTimestamp() });
        showToast("Data pengguna berhasil diperbarui!", "success");
      } else {
        await addDoc(collection(db, "users_master"), { ...userDataToSave, waktu_dibuat: serverTimestamp() });
        showToast("Pengguna baru berhasil ditambahkan!", "success");
      }

      setFormData({ nama: "", email: "", departemen: "OB & CS", role: "Staff", whatsapp: "", password: "" });
      setIsEditMode(false);
      setEditId(null);
    } catch (error) {
      console.error("Gagal menyimpan data:", error);
      showToast("Terjadi kesalahan sistem saat menyimpan.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (user: UserData) => {
    setIsEditMode(true);
    setEditId(user.id);
    setFormData({
      nama: user.nama,
      email: user.email || "",
      departemen: user.departemen,
      role: user.role,
      whatsapp: user.whatsapp || "",
      password: user.password || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string, nama: string) => {
    const yakin = await confirm({
      title: "Hapus Akses Login",
      message: `PERINGATAN: Hapus akses login untuk ${nama}?`,
      confirmText: "Ya, Hapus",
      variant: "danger"
    });
    if (!yakin) return;

    try {
      await deleteDoc(doc(db, "users_master", id));
      showToast(`Akses login ${nama} berhasil dihapus.`, "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus data.", "error");
    }
  };

  // Filter pencarian
  const filteredUsers = users.filter(user =>
    user.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.departemen.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper untuk membuat Inisial Avatar
  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px", overflowX: "hidden" }}>

      {/* 💡 CSS RESPONSIVE & ANTI-OVERFLOW MAGIC */}
      <style dangerouslySetInnerHTML={{__html: `
        /* Reset Box Sizing Global untuk anti-overflow */
        * { box-sizing: border-box; }

        .admin-wrapper { display: flex; gap: 25px; flex-wrap: wrap; align-items: flex-start; width: 100%; }
        .form-col { flex: 1 1 350px; position: sticky; top: 80px; width: 100%; }
        .table-col { flex: 2 1 600px; min-width: 0; width: 100%; }
        .search-input { width: 260px; }
        .input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* Gaya Tabel Presisi Desktop */
        .users-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .users-table th { padding: 15px; background: #f1f5f9; color: #4a5568; font-weight: bold; border-bottom: 2px solid #e2e8f0; }
        .users-table td { padding: 15px; border-bottom: 1px solid #edf2f7; vertical-align: middle; transition: background 0.2s; word-wrap: break-word; }
        .users-table tbody tr:hover td { background-color: #f8fafc; }

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .admin-wrapper { flex-direction: column; gap: 20px; }
          .form-col { position: static; width: 100% !important; flex: none; padding: 20px !important; }
          .table-col { width: 100% !important; flex: none; padding: 20px !important; }
          .input-grid { grid-template-columns: 1fr !important; } /* Tumpuk input yang bersebelahan di HP */
          .search-input { width: 100%; max-width: 100% !important; margin-top: 10px; }
          .hide-mobile { display: none !important; }

          /* Transformasi Tabel Menjadi Kartu */
          .users-table, .users-table tbody { display: block; width: 100%; }
          .users-table thead { display: none; } /* Sembunyikan judul kolom */
          .users-table tr {
            display: block; width: 100%; margin-bottom: 15px;
            background: white; border: 1px solid #e2e8f0;
            border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);
          }
          .users-table td {
            display: block; width: 100%; padding: 15px !important;
            border-bottom: 1px dashed #edf2f7 !important; text-align: left;
          }
          .users-table td:last-child { border-bottom: none !important; }

          /* Tombol di HP dibuat merentang penuh */
          .action-container { display: flex; width: 100%; gap: 10px; justify-content: space-between; }
          .action-container button { flex: 1; padding: 12px !important; font-size: 13px !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span className="hide-mobile" style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Control Panel</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 <span className="hide-mobile">Admin:</span> {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)", width: "100%" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(22px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>MANAJEMEN PENGGUNA</h1>
        <p style={{ margin: "0", fontSize: "13px", opacity: 0.9 }}>Kelola akses login staf operasional (Security, OB, Driver, dll)</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>

        <div className="admin-wrapper">

          {/* ============================================================== */}
          {/* KOLOM KIRI: FORM TAMBAH / EDIT USER */}
          {/* ============================================================== */}
          <div className="form-col" style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            <h2 style={{ margin: "0 0 20px 0", color: isEditMode ? "#d69e2e" : "#1a202c", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
              <span>{isEditMode ? "✏️" : "👤"}</span> {isEditMode ? "Edit Data Pengguna" : "Input Pengguna Baru"}
            </h2>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px", width: "100%" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Nama Lengkap Asli *</label>
                <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Hilal Akbar" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px", outline: "none" }} />
              </div>

              <div className="input-grid">
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Departemen *</label>
                  <select name="departemen" value={formData.departemen} onChange={handleInputChange} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "white", fontSize: "13px", cursor: "pointer", outline: "none" }}>
                    <option value="OB & CS">OB & CS</option>
                    <option value="Security">Security</option>
                    <option value="Driver">Driver</option>
                    <option value="QHSE">QHSE</option>
                    <option value="Admin GA">Admin GA</option>
                    <option value="Management">Management</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Role / Jabatan *</label>
                  <select name="role" value={formData.role} onChange={handleInputChange} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "white", fontSize: "13px", cursor: "pointer", outline: "none" }}>
                    <option value="Staff">Staff</option>
                    <option value="Koordinator / Danru">Koordinator</option>
                    <option value="Administrator">Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Nomor WhatsApp</label>
                <input type="text" name="whatsapp" value={formData.whatsapp} onChange={handleInputChange} placeholder="081234567890" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", background: "#f8fafc", fontSize: "14px", outline: "none" }} />
              </div>

              <div style={{ background: "#edf2f7", padding: "15px", borderRadius: "12px", border: "1px dashed #cbd5e0", width: "100%" }}>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#2b6cb0", marginBottom: "10px" }}>Akses Login Karyawan</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} required placeholder="Email (contoh@sibm.com)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "13px", outline: "none" }} />
                  <div style={{ position: "relative", width: "100%" }}>
                    <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleInputChange} required placeholder="Password Default" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "13px", outline: "none" }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "12px" }}>
                      {showPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" disabled={isLoading} style={{ flex: 1, padding: "15px", background: isLoading ? "#a0aec0" : (isEditMode ? "#d69e2e" : "#3182ce"), color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: isLoading ? "not-allowed" : "pointer", boxShadow: isLoading ? "none" : `0 4px 6px ${isEditMode ? "rgba(214,158,46,0.3)" : "rgba(49,130,206,0.3)"}`, transition: "0.2s" }}>
                  {isLoading ? "Menyimpan..." : (isEditMode ? "Simpan Perubahan" : "➕ Daftarkan Akun")}
                </button>
                {isEditMode && (
                  <button type="button" onClick={() => { setIsEditMode(false); setEditId(null); setFormData({ nama: "", email: "", departemen: "OB & CS", role: "Staff", whatsapp: "", password: "" }); }} style={{ padding: "15px", background: "white", color: "#e53e3e", border: "1px solid #fed7d7", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}>
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* ============================================================== */}
          {/* KOLOM KANAN: TABEL DAFTAR PENGGUNA (NATIVE HTML TABLE) */}
          {/* ============================================================== */}
          <div className="table-col" style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>📋</span> Direktori Karyawan <span style={{ background: "#edf2f7", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", color: "#4a5568" }}>{users.length} Terdaftar</span>
              </h2>

              <div style={{ position: "relative" }} className="search-input">
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input
                  type="text"
                  placeholder="Cari nama, email, divisi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid #cbd5e0", fontSize: "13px", width: "100%", background: "#f8fafc", outline: "none" }}
                />
              </div>
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0", width: "100%" }}>

              <table className="users-table">
                <thead>
                  <tr>
                    <th style={{ width: "45%" }}>Profil Akun</th>
                    <th style={{ width: "35%" }}>Divisi & Kontak</th>
                    <th style={{ width: "20%", textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length > 0 ? filteredUsers.map((user) => {
                    const deptColor = user.departemen === "QHSE" ? "#38a169" : (user.departemen === "Security" ? "#e53e3e" : (user.departemen.includes("OB") ? "#dd6b20" : "#4a5568"));
                    const deptBg = user.departemen === "QHSE" ? "#f0fff4" : (user.departemen === "Security" ? "#fff5f5" : (user.departemen.includes("OB") ? "#fffaf0" : "#edf2f7"));

                    return (
                      <tr key={user.id}>

                        {/* Kolom 1: Profil */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{ width: "45px", height: "45px", borderRadius: "50%", background: deptColor, color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontWeight: "900", fontSize: "15px", flexShrink: 0 }}>
                              {getInitials(user.nama)}
                            </div>
                            <div style={{ overflow: "hidden" }}>
                              <div style={{ fontWeight: "900", color: "#1a202c", fontSize: "14px", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{user.nama}</div>
                              <div style={{ color: "#718096", fontSize: "12px", marginTop: "2px", wordBreak: "break-all" }}>{user.email}</div>
                              <div style={{ color: "#a0aec0", fontSize: "11px", marginTop: "4px", fontWeight: "bold" }}>Pass: {user.password ? "********" : "Tidak diatur"}</div>
                            </div>
                          </div>
                        </td>

                        {/* Kolom 2: Divisi */}
                        <td>
                          <div style={{ marginBottom: "8px" }}>
                            <span style={{ background: deptBg, color: deptColor, padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "900", display: "inline-block" }}>{user.departemen}</span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#4a5568", fontWeight: "bold", marginBottom: "4px" }}>{user.role}</div>
                          {user.whatsapp && <div style={{ fontSize: "12px", color: "#38a169", fontWeight: "bold" }}>📞 {user.whatsapp}</div>}
                        </td>

                        {/* Kolom 3: Aksi */}
                        <td>
                          <div className="action-container">
                            <button
                              onClick={() => handleEdit(user)}
                              style={{ background: "white", color: "#d69e2e", border: "1px solid #fbd38d", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(user.id, user.nama)}
                              style={{ background: "white", color: "#e53e3e", border: "1px solid #feb2b2", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}
                            >
                              Hapus
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={3} style={{ padding: "50px 20px", textAlign: "center", color: "#a0aec0" }}>
                        <div style={{ fontSize: "30px", marginBottom: "10px" }}>📭</div>
                        Tidak ada pengguna yang sesuai.
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