"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase"; 

interface DeepCleaningTask {
  id: string;
  tanggal: string; 
  area: string;
  tugas: string;
  status: "Belum Dikerjakan" | "Selesai";
  dibuat_oleh: string;
}

const DAFTAR_LANTAI = ["Area Basement", "Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Lantai 5", "Pelayanan Khusus OB", "Area Luar / Taman"];

export default function DeepCleaningManager() {
  const router = useRouter();

  const [picName, setPicName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [tasks, setTasks] = useState<DeepCleaningTask[]>([]);
  
  // State Form
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split("T")[0], 
    area: DAFTAR_LANTAI[0],
    tugas: ""
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const siapkanHalaman = async () => {
      // 1. Verifikasi Keamanan (Sangat toleran mengenali Koordinator/Admin/Hilal)
      const nama = localStorage.getItem("pic_nama") || "";
      const role = (localStorage.getItem("pic_role") || "").toLowerCase();
      const namaLower = nama.toLowerCase();

      const isAuthorized = 
        namaLower.includes("hilal") || 
        namaLower.includes("kord") || 
        namaLower.includes("koordinator") || 
        role.includes("admin") || 
        role.includes("kord") ||
        role.includes("koordinator");

      if (!isAuthorized) {
        alert("Akses Ditolak! Halaman ini khusus Koordinator OB & CS.");
        router.push("/shift-checkin");
        return;
      }
      setPicName(nama);

      // 2. Tarik Data Tugas (Real-time)
      const tasksRef = collection(db, "deep_cleaning_tasks");
      const q = query(tasksRef, orderBy("tanggal", "desc"));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const taskList: DeepCleaningTask[] = [];
        snapshot.forEach(docSnap => {
          taskList.push({ id: docSnap.id, ...docSnap.data() } as DeepCleaningTask);
        });
        setTasks(taskList);
        setIsReady(true);
      });

      return () => unsubscribe();
    };

    siapkanHalaman();
  }, [router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tugas.trim()) return alert("Deskripsi tugas wajib diisi!");

    setIsLoading(true);
    try {
      await addDoc(collection(db, "deep_cleaning_tasks"), {
        tanggal: formData.tanggal,
        area: formData.area,
        tugas: formData.tugas,
        status: "Belum Dikerjakan",
        dibuat_oleh: picName,
        waktu_dibuat: serverTimestamp()
      });

      setFormData(prev => ({ ...prev, tugas: "" }));
    } catch (error) {
      console.error("Gagal menyimpan tugas:", error);
      alert("Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "Selesai" ? "Belum Dikerjakan" : "Selesai";
    try {
      await updateDoc(doc(db, "deep_cleaning_tasks", id), {
        status: newStatus
      });
    } catch (error) {
      console.error("Gagal update status:", error);
    }
  };

  const handleDelete = async (id: string, namaTugas: string) => {
    if (!window.confirm(`Hapus jadwal tugas: ${namaTugas}?`)) return;
    try {
      await deleteDoc(doc(db, "deep_cleaning_tasks", id));
    } catch (error) {
      console.error("Gagal menghapus:", error);
    }
  };

  // Fungsi Logika Tampilan Berdasarkan Status Waktu
  const getTaskStatusInfo = (tanggalTugas: string, status: string) => {
    const today = new Date().toISOString().split("T")[0];
    
    if (status === "Selesai") {
      return { bg: "#f0fff4", border: "#38a169", text: "#22543d", badgeBg: "#c6f6d5", badgeText: "✔ Selesai", icon: "✨" };
    }
    if (tanggalTugas < today) {
      return { bg: "#fff5f5", border: "#e53e3e", text: "#742a2a", badgeBg: "#fed7d7", badgeText: "Terlewat", icon: "⚠️" };
    }
    if (tanggalTugas === today) {
      return { bg: "#fffff0", border: "#d69e2e", text: "#7b341e", badgeBg: "#fef08a", badgeText: "Hari Ini", icon: "🔥" };
    }
    return { bg: "white", border: "#cbd5e0", text: "#2d3748", badgeBg: "#e2e8f0", badgeText: "Mendatang", icon: "⏳" };
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/dashboard/ob")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#faf5ff", color: "#6b46c1", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #e9d8fd" }}>
          👑 Koordinator: {picName}
        </div>
      </div>

      {/* 🔹 HERO SECTION (TEMA INDIGO / DEEP PURPLE) */}
      <div style={{ background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(124, 58, 237, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>DEEP CLEANING MANAGER</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Jadwalkan dan pantau target kebersihan ekstra di luar rutinitas harian</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1100px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* RESPONSIVE FLEX LAYOUT */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "25px", alignItems: "flex-start" }}>
          
          {/* KOLOM KIRI: FORM PENJADWALAN (STICKY) */}
          <div style={{ flex: "1 1 350px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", position: "sticky", top: "80px" }}>
            <h2 style={{ margin: "0 0 5px 0", color: "#553c9a", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📅</span> Buat Jadwal Baru
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Terbitkan instruksi pembersihan khusus.</p>
            
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Pilih Tanggal Pelaksanaan</label>
                <input type="date" name="tanggal" value={formData.tanggal} onChange={handleInputChange} required style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", color: "#2d3748", outline: "none", cursor: "pointer" }} />
              </div>
              
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Tentukan Lokasi / Area</label>
                <select name="area" value={formData.area} onChange={handleInputChange} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", color: "#2d3748", outline: "none", cursor: "pointer", background: "white" }}>
                  {DAFTAR_LANTAI.map(lantai => (
                    <option key={lantai} value={lantai}>{lantai}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Instruksi Detail</label>
                <textarea 
                  name="tugas" value={formData.tugas} onChange={handleInputChange} required 
                  placeholder="Cth: Vakum karpet ruang rapat direksi, cuci gorden, dan poles ulang marmer lantai..." 
                  style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", minHeight: "90px", resize: "vertical", outline: "none", background: "#f8fafc" }} 
                />
              </div>
              
              <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "15px", background: isLoading ? "#b794f4" : "#6b46c1", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "10px", transition: "0.2s", boxShadow: isLoading ? "none" : "0 4px 10px rgba(107, 70, 193, 0.3)" }}>
                {isLoading ? "Menyimpan ke Sistem..." : "🚀 Terbitkan Instruksi"}
              </button>
            </form>
          </div>

          {/* KOLOM KANAN: DAFTAR TUGAS */}
          <div style={{ flex: "2 1 500px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            <h2 style={{ margin: "0 0 20px 0", color: "#2d3748", fontSize: "18px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px" }}>
              📋 Rekapitulasi Tugas Deep Cleaning
            </h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {tasks.length > 0 ? tasks.map((task) => {
                const info = getTaskStatusInfo(task.tanggal, task.status);
                
                return (
                  <div key={task.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px", borderRadius: "12px", background: info.bg, border: `1px solid ${info.border}`, borderLeft: `6px solid ${info.border}`, gap: "15px", flexWrap: "wrap", transition: "0.2s" }}>
                    
                    {/* Info Tugas Utama */}
                    <div style={{ flex: "1", minWidth: "250px" }}>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", background: "white", color: "#4a5568", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", border: "1px solid #e2e8f0" }}>📅 {task.tanggal}</span>
                        <span style={{ fontSize: "11px", background: "#ebf8ff", color: "#2b6cb0", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", border: "1px solid #bee3f8" }}>📍 {task.area}</span>
                        <span style={{ fontSize: "11px", background: info.badgeBg, color: info.text, padding: "4px 8px", borderRadius: "6px", fontWeight: "bold" }}>{info.icon} {info.badgeText}</span>
                      </div>
                      <div style={{ fontWeight: "600", fontSize: "15px", color: info.text, lineHeight: "1.5" }}>
                        {task.tugas}
                      </div>
                      <div style={{ fontSize: "11px", color: "#718096", marginTop: "6px" }}>
                        Diinstruksikan oleh: <strong>{task.dibuat_oleh}</strong>
                      </div>
                    </div>

                    {/* Aksi & Status */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      
                      {task.status !== "Selesai" ? (
                        <button 
                          onClick={() => handleToggleStatus(task.id, task.status)}
                          style={{ padding: "10px 15px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", border: "none", background: "#38a169", color: "white", cursor: "pointer", transition: "0.2s", boxShadow: "0 2px 4px rgba(56, 161, 105, 0.2)" }}
                        >
                          Tandai Selesai
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleToggleStatus(task.id, task.status)}
                          style={{ padding: "10px 15px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", border: "1px solid #cbd5e0", background: "white", color: "#718096", cursor: "pointer", transition: "0.2s" }}
                        >
                          Batal Selesai
                        </button>
                      )}
                      
                      <button 
                        onClick={() => handleDelete(task.id, task.tugas)}
                        style={{ padding: "10px", borderRadius: "8px", fontSize: "14px", border: "1px solid #feb2b2", background: "#fff5f5", color: "#e53e3e", cursor: "pointer", transition: "0.2s" }}
                        title="Hapus Tugas"
                      >
                        🗑️
                      </button>

                    </div>
                  </div>
                );
              }) : (
                <div style={{ padding: "50px 20px", textAlign: "center", color: "#a0aec0", border: "2px dashed #e2e8f0", borderRadius: "16px", background: "#f8fafc" }}>
                  <div style={{ fontSize: "40px", marginBottom: "10px" }}>🧹</div>
                  <div style={{ fontSize: "16px", fontWeight: "bold", color: "#718096" }}>Area Bebas Debu!</div>
                  <div style={{ fontSize: "13px", marginTop: "5px" }}>Belum ada instruksi Deep Cleaning yang diterbitkan.</div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}