"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, deleteDoc, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth, db, getSecondaryAuth } from "../../../lib/firebase";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useAuthGuard, isSuperAdmin as cekSuperAdmin } from "../../../hooks/useAuthGuard";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconPencil = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
);
const IconKey = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.6 12.4 8-8" /><path d="M17 8l3 3" /><path d="M14 11l2.5 2.5" /></svg>
);
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
);

// Daftar kota besar Indonesia buat dropdown Wilayah/Daerah -- dibuat FIXED (bukan isian
// bebas) supaya gak ada typo yang bikin scoping wilayah meleset (mis. "Makasar" vs
// "Makassar" dianggap 2 wilayah beda karena pencocokan di firestore.rules itu EXACT MATCH).
// Kota yang belum ada di daftar bisa dipilih lewat opsi "Lainnya" di bawah.
const DAFTAR_KOTA_INDONESIA = [
  "Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Palembang",
  "Depok", "Tangerang", "Bekasi", "Bogor", "Batam", "Pekanbaru", "Bandar Lampung",
  "Padang", "Malang", "Yogyakarta", "Solo (Surakarta)", "Denpasar", "Samarinda",
  "Balikpapan", "Banjarmasin", "Pontianak", "Manado", "Jayapura", "Mataram", "Kupang",
  "Ambon", "Cirebon", "Tasikmalaya", "Serang", "Cilegon", "Cikarang", "Jambi",
  "Bengkulu", "Pangkal Pinang", "Palu", "Kendari", "Gorontalo", "Ternate", "Sorong",
  "Bontang", "Bitung",
];

interface UserData {
  id: string; // = Firebase Auth UID (lihat migrate-users-to-auth.mjs)
  nama: string;
  email: string;
  departemen: string;
  role: string;
  whatsapp?: string;
  foto_url?: string;
  /** Wilayah akun ini (mis. "Makassar"). 'PUSAT' = Super Admin. Lihat isSuperAdmin() di
   *  hooks/useAuthGuard.ts & catatan skema di firestore.rules. */
  daerah?: string;
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

  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus untuk Administrator.",
  });

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
    foto_url: "",
    daerah: "",
  });
  const [jadikanSuperAdmin, setJadikanSuperAdmin] = useState(false);
  const [daerahLainnya, setDaerahLainnya] = useState(false);

  const akuSuperAdmin = cekSuperAdmin(session?.role || "", session?.daerah || "");
  const daerahSaya = session?.daerah || "";

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
    if (!formData.nama.trim() || !formData.email.trim() || (!isEditMode && !formData.password.trim())) {
      showToast(isEditMode ? "Nama dan Email wajib diisi!" : "Nama, Email, dan Password wajib diisi!", "warning");
      return;
    }
    if (isUploadingFoto) {
      showToast("Tunggu foto selesai diunggah dulu.", "warning");
      return;
    }

    if (akuSuperAdmin && !jadikanSuperAdmin && !formData.daerah.trim()) {
      showToast("Isi Wilayah/Daerah akun ini dulu (atau centang Jadikan Super Admin).", "warning");
      return;
    }

    setIsLoading(true);
    try {
      // Admin Daerah HANYA boleh bikin/edit akun di wilayahnya sendiri (dipaksa di sini,
      // DIPASTIKAN lagi di firestore.rules -- UI ini cuma buat gak nyoba percuma). Super Admin
      // bebas isi wilayah apa pun, atau centang "Jadikan Super Admin" utk daerah = 'PUSAT'.
      const daerahFinal = akuSuperAdmin
        ? (jadikanSuperAdmin ? "PUSAT" : formData.daerah.trim())
        : daerahSaya;

      const userDataToSave = {
        nama: formData.nama,
        email: formData.email.toLowerCase(),
        departemen: formData.departemen,
        role: formData.role,
        whatsapp: formData.whatsapp,
        foto_url: formData.foto_url || "",
        daerah: daerahFinal,
      };

      if (isEditMode && editId) {
        const userRef = doc(db, "users_master", editId);
        await updateDoc(userRef, { ...userDataToSave, waktu_update: serverTimestamp() });
        showToast("Data pengguna berhasil diperbarui!", "success");
      } else {
        // Bikin akun Firebase Auth lewat instance Auth KEDUA (lihat getSecondaryAuth di
        // lib/firebase.ts) supaya sesi login Admin yang sedang aktif tidak ikut tergantikan.
        const secondaryAuth = getSecondaryAuth();
        const cred = await createUserWithEmailAndPassword(secondaryAuth, userDataToSave.email, formData.password);
        await signOut(secondaryAuth); // bersihkan sesi di instance kedua, tidak dipakai lagi
        await setDoc(doc(db, "users_master", cred.user.uid), { ...userDataToSave, waktu_dibuat: serverTimestamp() });
        showToast("Pengguna baru berhasil ditambahkan!", "success");
      }

      setFormData({ nama: "", email: "", departemen: "OB & CS", role: "Staff", whatsapp: "", password: "", foto_url: "", daerah: "" }); setJadikanSuperAdmin(false); setDaerahLainnya(false);
      setIsEditMode(false);
      setEditId(null);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/email-already-in-use") {
        showToast("Email ini sudah terdaftar sebagai akun login.", "error");
      } else if (code === "auth/weak-password") {
        showToast("Password terlalu pendek (minimal 6 karakter).", "error");
      } else {
        console.error("Gagal menyimpan data:", error);
        showToast("Terjadi kesalahan sistem saat menyimpan.", "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (user: UserData) => {
    const yakin = await confirm({
      title: "Kirim Link Reset Password",
      message: `Kirim email reset password ke ${user.email}? ${user.nama} akan menerima link untuk membuat password baru.`,
      confirmText: "Ya, Kirim",
      variant: "danger"
    });
    if (!yakin) return;

    try {
      await sendPasswordResetEmail(auth, user.email);
      showToast(`Email reset password terkirim ke ${user.email}.`, "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal mengirim email reset password.", "error");
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
      password: "",
      foto_url: user.foto_url || "",
      daerah: user.daerah === "PUSAT" ? "" : (user.daerah || ""),
    });
    setJadikanSuperAdmin(user.daerah === "PUSAT");
    setDaerahLainnya(!!user.daerah && user.daerah !== "PUSAT" && !DAFTAR_KOTA_INDONESIA.includes(user.daerah));
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
      // Menghapus dokumen profil ini sudah cukup untuk mencabut SEMUA akses app (Firestore
      // Rules butuh dokumen users_master/{uid} untuk resolve role) -- akun Firebase Auth-nya
      // sendiri jadi "yatim" (tanpa profil = tanpa izin apa pun), tidak berbahaya. Kalau mau
      // benar-benar dihapus dari Firebase Auth, perlu script Admin SDK terpisah (bukan dari sini).
      await deleteDoc(doc(db, "users_master", id));
      showToast(`Akses login ${nama} berhasil dihapus.`, "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus data.", "error");
    }
  };

  // Filter pencarian + scoping wilayah (Admin Daerah cuma LIHAT akun wilayahnya sendiri di
  // tampilan ini -- users_master sendiri tetap "read: if true" di rules, sama seperti
  // sebelumnya, jadi ini scoping tampilan, bukan penegakan keamanan; keamanan sungguhan ada
  // di rules create/update/delete yang sudah membatasi Admin Daerah cuma bisa TULIS akun
  // wilayahnya sendiri).
  const filteredUsers = users
    .filter((user) => akuSuperAdmin || (user.daerah || "") === daerahSaya)
    .filter(user =>
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

  if (!isReady || !session) return null;
  const adminName = session.nama || "Admin";

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px", overflowX: "hidden" }}>
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #1f2328; --ink-soft: #4b5563; --muted: #8b8f97; --line: #e4e4e7;
          --bg: #f8f8f7; --surface: #ffffff;
          --red-600: #cf222e; --red-50: #fdeeee;
          --ok: #1a7f37; --ok-50: #ecf7ee; --info: #2563eb; --info-50: #eef4ff;
          --warn: #9a6700; --warn-50: #fdf6e3; --accent: #5b5bd6; --accent-50: #f0f0fc;
        }
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 24px; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .back-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 13px; font-weight: 600; font-family: inherit; padding: 6px 4px;
        }
        .back-btn:hover { color: var(--ink); }
        .admin-badge {
          display: flex; align-items: center; gap: 6px; background: var(--bg); color: var(--ink-soft);
          padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; border: 1px solid var(--line);
        }
        .admin-hero {
          background: var(--surface); border-bottom: 1px solid var(--line);
          padding: 22px 24px;
        }
        .admin-hero-content { max-width: 1200px; margin: 0 auto; }
      `}} />

      {/* 💡 CSS RESPONSIVE & ANTI-OVERFLOW MAGIC */}
      <style dangerouslySetInnerHTML={{__html: `
        /* Reset Box Sizing Global untuk anti-overflow */
        * { box-sizing: border-box; }

        .admin-wrapper { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; width: 100%; }
        .form-col { flex: 1 1 340px; position: sticky; top: 74px; width: 100%; }
        .table-col { flex: 2 1 600px; min-width: 0; width: 100%; }
        .search-input { width: 240px; }
        .input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .flat-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }

        .icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 7px; border: 1px solid var(--line);
          background: var(--surface); cursor: pointer; transition: background 0.15s, border-color 0.15s;
        }
        .icon-btn:hover { background: var(--bg); }
        .icon-btn.danger:hover { background: var(--red-50); border-color: var(--red-600); }
        .icon-btn.warn:hover { background: var(--warn-50); border-color: var(--warn); }
        .icon-btn.info:hover { background: var(--info-50); border-color: var(--info); }

        /* Gaya Tabel Presisi Desktop */
        .users-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .users-table th { padding: 10px 14px; background: var(--bg); color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid var(--line); }
        .users-table td { padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: middle; transition: background 0.15s; word-wrap: break-word; }
        .users-table tbody tr:hover td { background-color: var(--bg); }
        .users-table tbody tr:last-child td { border-bottom: none; }

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .admin-wrapper { flex-direction: column; gap: 16px; }
          .form-col { position: static; width: 100% !important; flex: none; padding: 18px !important; }
          .table-col { width: 100% !important; flex: none; padding: 16px !important; }
          .input-grid { grid-template-columns: 1fr !important; } /* Tumpuk input yang bersebelahan di HP */
          .search-input { width: 100%; max-width: 100% !important; margin-top: 10px; }
          .hide-mobile { display: none !important; }

          /* Transformasi Tabel Menjadi Kartu */
          .users-table, .users-table tbody { display: block; width: 100%; }
          .users-table thead { display: none; } /* Sembunyikan judul kolom */
          .users-table tr {
            display: block; width: 100%; margin-bottom: 10px;
            background: var(--surface); border: 1px solid var(--line);
            border-radius: 10px;
          }
          .users-table td {
            display: block; width: 100%; padding: 12px 14px !important;
            border-bottom: none !important; text-align: left;
          }

          /* Baris aksi di HP: ikon sejajar, gak perlu merentang penuh lagi */
          .action-container { display: flex; width: 100%; gap: 8px; justify-content: flex-start; padding-top: 8px; margin-top: 4px; border-top: 1px dashed var(--line); }
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
          <h1 style={{ margin: "0 0 3px 0", fontSize: "clamp(18px, 4vw, 22px)", fontWeight: 700, color: "var(--ink)" }}>Manajemen Pengguna</h1>
          <p style={{ margin: "0", fontSize: "13px", color: "var(--muted)" }}>
            {akuSuperAdmin ? "Kelola akses login SEMUA wilayah (Super Admin)" : `Kelola akses login staf wilayah ${daerahSaya || "-"}`}
          </p>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "20px auto 0", padding: "0 15px", width: "100%" }}>

        <div className="admin-wrapper">

          {/* ============================================================== */}
          {/* KOLOM KIRI: FORM TAMBAH / EDIT USER */}
          {/* ============================================================== */}
          <div className="form-col flat-card" style={{ padding: "22px" }}>
            <h2 style={{ margin: "0 0 18px 0", color: isEditMode ? "var(--warn)" : "var(--ink)", fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--line)", paddingBottom: "12px" }}>
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
                    <option value="Magang">Magang</option>
                  </select>
                </div>
              </div>

              {akuSuperAdmin && (
                <div style={{ background: "var(--accent-50)", padding: "14px", borderRadius: "10px", border: "1px solid rgba(91,91,214,0.25)" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--accent)" }}>Wilayah / Daerah {!jadikanSuperAdmin && "*"}</label>
                  {!daerahLainnya ? (
                    <select
                      value={DAFTAR_KOTA_INDONESIA.includes(formData.daerah) ? formData.daerah : ""}
                      onChange={(e) => {
                        if (e.target.value === "__LAINNYA__") { setDaerahLainnya(true); setFormData({ ...formData, daerah: "" }); }
                        else setFormData({ ...formData, daerah: e.target.value });
                      }}
                      disabled={jadikanSuperAdmin}
                      style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", background: jadikanSuperAdmin ? "var(--line)" : "var(--surface)", fontSize: "14px", outline: "none", marginBottom: "10px", boxSizing: "border-box", cursor: jadikanSuperAdmin ? "not-allowed" : "pointer" }}
                    >
                      <option value="" disabled>Pilih kota...</option>
                      {DAFTAR_KOTA_INDONESIA.map((kota) => <option key={kota} value={kota}>{kota}</option>)}
                      <option value="__LAINNYA__">Lainnya (isi manual)...</option>
                    </select>
                  ) : (
                    <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                      <input
                        type="text" value={formData.daerah} onChange={(e) => setFormData({ ...formData, daerah: e.target.value })}
                        disabled={jadikanSuperAdmin} placeholder="Ketik nama kota/wilayah"
                        style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", background: jadikanSuperAdmin ? "var(--line)" : "var(--bg)", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
                      />
                      <button type="button" onClick={() => { setDaerahLainnya(false); setFormData({ ...formData, daerah: "" }); }} style={{ padding: "0 14px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-soft)", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                        Pilih dari daftar
                      </button>
                    </div>
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", fontWeight: "bold", color: "var(--ink-soft)", cursor: "pointer" }}>
                    <input type="checkbox" checked={jadikanSuperAdmin} onChange={(e) => setJadikanSuperAdmin(e.target.checked)} />
                    Jadikan Super Admin (akses & kelola SEMUA wilayah)
                  </label>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "var(--ink-soft)" }}>Nomor WhatsApp</label>
                <input type="text" name="whatsapp" value={formData.whatsapp} onChange={handleInputChange} placeholder="081234567890" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", fontSize: "14px", outline: "none" }} />
              </div>

              <div style={{ background: "var(--info-50)", padding: "15px", borderRadius: "10px", border: "1px solid rgba(37,99,235,0.2)", width: "100%" }}>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--info)", marginBottom: "10px" }}>Akses Login Karyawan</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} required disabled={isEditMode} placeholder="Email (contoh@sibm.com)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", outline: "none", opacity: isEditMode ? 0.6 : 1, cursor: isEditMode ? "not-allowed" : "text" }} />
                  {isEditMode ? (
                    <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                      Email tidak bisa diubah dari sini (terhubung ke akun login). Untuk ganti password, pakai tombol &quot;Reset Password&quot; di daftar pengguna.
                    </div>
                  ) : (
                    <div style={{ position: "relative", width: "100%" }}>
                      <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleInputChange} required placeholder="Password Default (min. 6 karakter)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", outline: "none" }} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "12px" }}>
                        {showPassword ? "🙈" : "👁️"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" disabled={isLoading || isUploadingFoto} style={{ flex: 1, padding: "13px", background: (isLoading || isUploadingFoto) ? "var(--muted)" : (isEditMode ? "var(--warn)" : "var(--info)"), color: "white", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "13.5px", cursor: (isLoading || isUploadingFoto) ? "not-allowed" : "pointer", transition: "0.15s" }}>
                  {isLoading ? "Menyimpan..." : (isEditMode ? "Simpan Perubahan" : "➕ Daftarkan Akun")}
                </button>
                {isEditMode && (
                  <button type="button" onClick={() => { setIsEditMode(false); setEditId(null); setFormData({ nama: "", email: "", departemen: "OB & CS", role: "Staff", whatsapp: "", password: "", foto_url: "", daerah: "" }); setJadikanSuperAdmin(false); setDaerahLainnya(false); }} style={{ padding: "13px 16px", background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)", borderRadius: "8px", fontWeight: 600, fontSize: "13.5px", cursor: "pointer", transition: "0.15s" }}>
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* ============================================================== */}
          {/* KOLOM KANAN: TABEL DAFTAR PENGGUNA (NATIVE HTML TABLE) */}
          {/* ============================================================== */}
          <div className="table-col flat-card" style={{ padding: "22px" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <span>📋</span> Direktori Karyawan <span style={{ background: "var(--bg)", padding: "3px 9px", borderRadius: "6px", fontSize: "11.5px", color: "var(--muted)", fontWeight: 600 }}>{users.length} Terdaftar</span>
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

            <div style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid var(--line)", width: "100%" }}>

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
                          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                            {user.foto_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={user.foto_url} alt={user.nama} style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: deptColor, color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontWeight: 700, fontSize: "13px", flexShrink: 0 }}>
                                {getInitials(user.nama)}
                              </div>
                            )}
                            <div style={{ overflow: "hidden" }}>
                              <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "13.5px", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{user.nama}</div>
                              <div style={{ color: "var(--muted)", fontSize: "11.5px", marginTop: "1px", wordBreak: "break-all" }}>{user.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Kolom 2: Divisi */}
                        <td>
                          <div style={{ marginBottom: "6px", display: "flex", gap: "5px", flexWrap: "wrap" }}>
                            <span style={{ background: deptBg, color: deptColor, padding: "3px 8px", borderRadius: "5px", fontSize: "10.5px", fontWeight: 600, display: "inline-block" }}>{user.departemen}</span>
                            {user.daerah === "PUSAT" ? (
                              <span style={{ background: "var(--accent-50)", color: "var(--accent)", padding: "3px 8px", borderRadius: "5px", fontSize: "10.5px", fontWeight: 600 }}>⭐ Super Admin</span>
                            ) : user.daerah ? (
                              <span style={{ background: "var(--info-50)", color: "var(--info)", padding: "3px 8px", borderRadius: "5px", fontSize: "10.5px", fontWeight: 600 }}>📍 {user.daerah}</span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: "11.5px", color: "var(--ink-soft)", fontWeight: 500, marginBottom: "3px" }}>{user.role}</div>
                          {user.whatsapp && <div style={{ fontSize: "11.5px", color: "var(--ok)", fontWeight: 500 }}>📞 {user.whatsapp}</div>}
                        </td>

                        {/* Kolom 3: Aksi -- ikon compact, bukan 3 tombol teks penuh */}
                        <td>
                          <div className="action-container">
                            <button onClick={() => handleEdit(user)} title="Edit" className="icon-btn warn" style={{ color: "var(--warn)" }}>
                              <IconPencil size={13} />
                            </button>
                            <button onClick={() => handleResetPassword(user)} title="Reset Password" className="icon-btn info" style={{ color: "var(--info)" }}>
                              <IconKey size={13} />
                            </button>
                            <button onClick={() => handleDelete(user.id, user.nama)} title="Hapus" className="icon-btn danger" style={{ color: "var(--red-600)" }}>
                              <IconTrash size={13} />
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