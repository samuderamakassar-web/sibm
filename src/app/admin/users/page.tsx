"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

interface UserData {
  id: string;
  nama: string;
  email: string;
  departemen: string;
  role: string;
  whatsapp?: string;
  password?: string;
  foto_url?: string;
}

async function uploadFotoToCloudinary(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
  formData.append("folder", "sibm/staf");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
  const data = await res.json();
  return data.secure_url as string;
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
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);

  const [formData, setFormData] = useState({
    nama: "",
    email: "",
    departemen: "OB & CS",
    role: "Staff",
    whatsapp: "",
    password: "",
    foto_url: ""
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

  // Upload foto profil: resize ke max-width 400px sebelum kirim ke Cloudinary,
  // sama seperti pola compress yang sudah dipakai di halaman lain (helpdesk/SBO)
  const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 400 / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setIsUploadingFoto(true);
          try {
            const url = await uploadFotoToCloudinary(blob);
            setFormData((prev) => ({ ...prev, foto_url: url }));
          } catch (err) {
            console.error(err);
            showToast("Gagal upload foto, coba lagi.", "error");
          } finally {
            setIsUploadingFoto(false);
          }
        }, "image/jpeg", 0.8);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama.trim() || !formData.email.trim() || !formData.password.trim()) {
      showToast("Nama, Email, dan Password wajib diisi!", "warning");
      return;
    }
    if (isUploadingFoto) {
      showToast("Tunggu foto selesai diunggah dulu.", "warning");
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
        password: formData.password,
        foto_url: formData.foto_url || ""
      };

      if (isEditMode && editId) {
        const userRef = doc(db, "users_master", editId);
        await updateDoc(userRef, { ...userDataToSave, waktu_update: serverTimestamp() });
        showToast("Data pengguna berhasil diperbarui!", "success");
      } else {
        await addDoc(collection(db, "users_master"), { ...userDataToSave, waktu_dibuat: serverTimestamp() });
        showToast("Pengguna baru berhasil ditambahkan!", "success");
      }

      setFormData({ nama: "", email: "", departemen: "OB & CS", role: "Staff", whatsapp: "", password: "", foto_url: "" });
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
      password: user.password || "",
      foto_url: user.foto_url || ""
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

  // Helper untuk membuat Inisial Avatar (fallback kalau belum ada foto)
  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px", overflowX: "hidden" }}>
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
        .users-table th { padding: 15px; background: var(--bg); color: var(--ink-soft); font-weight: bold; border-bottom: 2px solid var(--line); }
        .users-table td { padding: 15px; border-bottom: 1px solid var(--line); vertical-align: middle; transition: background 0.2s; word-wrap: break-word; }
        .users-table tbody tr:hover td { background-color: var(--bg); }

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
            background: var(--surface); border: 1px solid var(--line);
            border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);
          }
          .users-table td {
            display: block; width: 100%; padding: 15px !important;
            border-bottom: 1px dashed var(--line) !important; text-align: left;
          }
          .users-table td:last-child { border-bottom: none !important; }

          /* Tombol di HP dibuat merentang penuh */
          .action-container { display: flex; width: 100%; gap: 10px; justify-content: space-between; }
          .action-container button { flex: 1; padding: 12px !important; font-size: 13px !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(22px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>MANAJEMEN PENGGUNA</h1>
          <p style={{ margin: "0", fontSize: "13px", opacity: 0.9 }}>Kelola akses login staf operasional (Security, OB, Driver, dll)</p>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 15px", position: "relative", zIndex: 10, width: "100%" }}>

        <div className="admin-wrapper">

          {/* ============================================================== */}
          {/* KOLOM KIRI: FORM TAMBAH / EDIT USER */}
          {/* ============================================================== */}
          <div className="form-col" style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)" }}>
            <h2 style={{ margin: "0 0 20px 0", color: isEditMode ? "var(--warn)" : "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid var(--line)", paddingBottom: "10px" }}>
              <span>{isEditMode ? "✏️" : "👤"}</span> {isEditMode ? "Edit Data Pengguna" : "Input Pengguna Baru"}
            </h2>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px", width: "100%" }}>

              {/* UPLOAD FOTO PROFIL */}
              <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                <div style={{ width: "70px", height: "70px", borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", border: "2px solid var(--line)" }}>
                  {formData.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={formData.foto_url} alt="Foto profil" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "24px", color: "var(--muted)" }}>👤</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "inline-block", padding: "8px 14px", background: "var(--bg)", border: "1px dashed var(--muted)", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", cursor: "pointer" }}>
                    {isUploadingFoto ? "⏳ Mengunggah..." : (formData.foto_url ? "📸 Ganti Foto" : "📸 Upload Foto")}
                    <input type="file" accept="image/*" capture="environment" onChange={handleFotoUpload} disabled={isUploadingFoto} style={{ display: "none" }} />
                  </label>
                  {formData.foto_url && !isUploadingFoto && (
                    <button type="button" onClick={() => setFormData((prev) => ({ ...prev, foto_url: "" }))} style={{ marginLeft: "8px", background: "none", border: "none", color: "var(--red-600)", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                      Hapus
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--ink-soft)" }}>Nama Lengkap Asli *</label>
                <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Hilal Akbar" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", fontSize: "14px", outline: "none" }} />
              </div>

              <div className="input-grid">
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--ink-soft)" }}>Departemen *</label>
                  <select name="departemen" value={formData.departemen} onChange={handleInputChange} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "13px", cursor: "pointer", outline: "none" }}>
                    <option value="OB & CS">OB & CS</option>
                    <option value="Security">Security</option>
                    <option value="Driver">Driver</option>
                    <option value="QHSE">QHSE</option>
                    <option value="Admin GA">Admin GA</option>
                    <option value="Management">Management</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--ink-soft)" }}>Role / Jabatan *</label>
                  <select name="role" value={formData.role} onChange={handleInputChange} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "13px", cursor: "pointer", outline: "none" }}>
                    <option value="Staff">Staff</option>
                    <option value="Koordinator / Danru">Koordinator</option>
                    <option value="Administrator">Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--ink-soft)" }}>Nomor WhatsApp</label>
                <input type="text" name="whatsapp" value={formData.whatsapp} onChange={handleInputChange} placeholder="081234567890" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", fontSize: "14px", outline: "none" }} />
              </div>

              <div style={{ background: "var(--bg)", padding: "15px", borderRadius: "12px", border: "1px dashed var(--line)", width: "100%" }}>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--info)", marginBottom: "10px" }}>Akses Login Karyawan</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} required placeholder="Email (contoh@sibm.com)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", outline: "none" }} />
                  <div style={{ position: "relative", width: "100%" }}>
                    <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleInputChange} required placeholder="Password Default" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", outline: "none" }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "12px" }}>
                      {showPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" disabled={isLoading || isUploadingFoto} style={{ flex: 1, padding: "15px", background: (isLoading || isUploadingFoto) ? "var(--muted)" : (isEditMode ? "var(--warn)" : "var(--info)"), color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: (isLoading || isUploadingFoto) ? "not-allowed" : "pointer", boxShadow: isLoading ? "none" : `0 4px 6px ${isEditMode ? "rgba(217,119,6,0.3)" : "rgba(37,99,235,0.3)"}`, transition: "0.2s" }}>
                  {isLoading ? "Menyimpan..." : (isEditMode ? "Simpan Perubahan" : "➕ Daftarkan Akun")}
                </button>
                {isEditMode && (
                  <button type="button" onClick={() => { setIsEditMode(false); setEditId(null); setFormData({ nama: "", email: "", departemen: "OB & CS", role: "Staff", whatsapp: "", password: "", foto_url: "" }); }} style={{ padding: "15px", background: "var(--surface)", color: "var(--red-600)", border: "1px solid var(--red-50)", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}>
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* ============================================================== */}
          {/* KOLOM KANAN: TABEL DAFTAR PENGGUNA (NATIVE HTML TABLE) */}
          {/* ============================================================== */}
          <div className="table-col" style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>📋</span> Direktori Karyawan <span style={{ background: "var(--bg)", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", color: "var(--ink-soft)" }}>{users.length} Terdaftar</span>
              </h2>

              <div style={{ position: "relative" }} className="search-input">
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                <input
                  type="text"
                  placeholder="Cari nama, email, divisi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "100%", background: "var(--bg)", outline: "none" }}
                />
              </div>
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)", width: "100%" }}>

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
                    const deptColor = user.departemen === "QHSE" ? "var(--ok)" : (user.departemen === "Security" ? "var(--red-600)" : (user.departemen.includes("OB") ? "var(--warn)" : "var(--ink-soft)"));
                    const deptBg = user.departemen === "QHSE" ? "var(--ok-50)" : (user.departemen === "Security" ? "var(--red-50)" : (user.departemen.includes("OB") ? "var(--warn-50)" : "var(--bg)"));

                    return (
                      <tr key={user.id}>

                        {/* Kolom 1: Profil */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            {user.foto_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={user.foto_url} alt={user.nama} style={{ width: "45px", height: "45px", borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${deptColor}` }} />
                            ) : (
                              <div style={{ width: "45px", height: "45px", borderRadius: "50%", background: deptColor, color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontWeight: "900", fontSize: "15px", flexShrink: 0 }}>
                                {getInitials(user.nama)}
                              </div>
                            )}
                            <div style={{ overflow: "hidden" }}>
                              <div style={{ fontWeight: "900", color: "var(--ink)", fontSize: "14px", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{user.nama}</div>
                              <div style={{ color: "var(--muted)", fontSize: "12px", marginTop: "2px", wordBreak: "break-all" }}>{user.email}</div>
                              <div style={{ color: "var(--muted)", fontSize: "11px", marginTop: "4px", fontWeight: "bold" }}>Pass: {user.password ? "********" : "Tidak diatur"}</div>
                            </div>
                          </div>
                        </td>

                        {/* Kolom 2: Divisi */}
                        <td>
                          <div style={{ marginBottom: "8px" }}>
                            <span style={{ background: deptBg, color: deptColor, padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "900", display: "inline-block" }}>{user.departemen}</span>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--ink-soft)", fontWeight: "bold", marginBottom: "4px" }}>{user.role}</div>
                          {user.whatsapp && <div style={{ fontSize: "12px", color: "var(--ok)", fontWeight: "bold" }}>📞 {user.whatsapp}</div>}
                        </td>

                        {/* Kolom 3: Aksi */}
                        <td>
                          <div className="action-container">
                            <button
                              onClick={() => handleEdit(user)}
                              style={{ background: "var(--surface)", color: "var(--warn)", border: "1px solid var(--warn)", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(user.id, user.nama)}
                              style={{ background: "var(--surface)", color: "var(--red-600)", border: "1px solid var(--red-500)", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}
                            >
                              Hapus
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={3} style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)" }}>
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