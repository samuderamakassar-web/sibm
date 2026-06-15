"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase"; // Sesuaikan jika path firebase.ts Anda berbeda

interface DeepCleaningTask {
  id: string;
  tanggal: string; // Format YYYY-MM-DD
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
    tanggal: new Date().toISOString().split("T")[0], // Default hari ini
    area: DAFTAR_LANTAI[0],
    tugas: ""
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      
      // Validasi: Hanya Kordinator yang boleh menjadwalkan Deep Cleaning
      if (!nama || (!nama.includes("Hilal") && !nama.includes("Koordinator"))) {
        alert("Akses Ditolak! Halaman ini khusus Koordinator OB & CS.");
        router.push("/dashboard/ob");
        return;
      }
      setPicName(nama);

      // Tarik semua tugas Deep Cleaning dari Firebase (Diurutkan dari jadwal terdekat/hari ini)
      const tasksRef = collection(db, "deep_cleaning_tasks");
      const q = query(tasksRef, orderBy("tanggal", "desc"));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const taskList: DeepCleaningTask[] = [];
        snapshot.forEach(doc => {
          taskList.push({ id: doc.id, ...doc.data() } as DeepCleaningTask);
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

      // Reset form ringan
      setFormData(prev => ({ ...prev, tugas: "" }));
    } catch (error) {
      console.error("Gagal menyimpan tugas:", error);
      alert("Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fungsi untuk menandai selesai langsung dari halaman Admin
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

  // Fungsi bantu untuk mewarnai baris berdasarkan status dan tanggal (Lewat/Hari Ini/Mendatang)
  const getRowStyle = (tanggalTugas: string, status: string) => {
    const today = new Date().toISOString().split("T")[0];
    
    if (status === "Selesai") return { background: "#f0fff4", borderLeft: "4px solid #38a169", color: "#2d3748" }; // Hijau (Selesai)
    if (tanggalTugas < today) return { background: "#fff5f5", borderLeft: "4px solid #e53e3e", color: "#c53030" }; // Merah (Terlewat & Belum Selesai)
    if (tanggalTugas === today) return { background: "#fffff0", borderLeft: "4px solid #d69e2e", color: "#975a16" }; // Kuning (Jadwal Hari Ini)
    return { background: "white", borderLeft: "4px solid #cbd5e0", color: "#4a5568" }; // Abu-abu (Jadwal Mendatang)
  };

  if (!isReady) return null;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1000px", margin: "0 auto", background: "#f7fafc", minHeight: "100vh" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button onClick={() => router.push("/dashboard/ob")} style={{ padding: "8px 12px", background: "#e2e8f0", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", color: "#4a5568" }}>
          ⬅ Kembali ke Dashboard
        </button>
        <div style={{ fontSize: "13px", fontWeight: "bold", color: "#44337a", background: "#faf5ff", padding: "5px 15px", borderRadius: "20px", border: "1px solid #d6bcfa" }}>
          👑 Koordinator: {picName}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "25px", alignItems: "start" }}>
        
        {/* KOLOM KIRI: FORM PENJADWALAN */}
        <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", borderTop: "5px solid #805ad5" }}>
          <h2 style={{ margin: "0 0 5px 0", color: "#44337a", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📅</span> Jadwalkan Deep Cleaning
          </h2>
          <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Buat tugas kebersihan ekstra (bulanan/mingguan) di luar rutinitas harian.</p>
          
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Tanggal Pelaksanaan:</label>
              <input type="date" name="tanggal" value={formData.tanggal} onChange={handleInputChange} required style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0", fontWeight: "bold", color: "#2d3748" }} />
            </div>
            
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Area / Lokasi Lantai:</label>
              <select name="area" value={formData.area} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }}>
                {DAFTAR_LANTAI.map(lantai => (
                  <option key={lantai} value={lantai}>{lantai}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Deskripsi Tugas:</label>
              <textarea 
                name="tugas" value={formData.tugas} onChange={handleInputChange} required 
                placeholder="Contoh: Cuci karpet ruang rapat utama dan poles lantai marmer koridor VIP." 
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0", minHeight: "80px", resize: "vertical" }} 
              />
            </div>
            
            <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "15px", background: isLoading ? "#b794f4" : "#805ad5", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" }}>
              {isLoading ? "Menjadwalkan..." : "🚀 Terbitkan Jadwal"}
            </button>
          </form>
        </div>

        {/* KOLOM KANAN: DAFTAR SELURUH TUGAS */}
        <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <h2 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "18px" }}>📋 Rekapitulasi Jadwal Deep Cleaning</h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {tasks.length > 0 ? tasks.map((task) => {
              const rowStyle = getRowStyle(task.tanggal, task.status);
              
              return (
                <div key={task.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px", borderRadius: "8px", background: rowStyle.background, borderLeft: rowStyle.borderLeft, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", gap: "15px", flexWrap: "wrap" }}>
                  
                  {/* Info Tugas */}
                  <div style={{ flex: "1", minWidth: "200px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px" }}>
                      <span style={{ fontSize: "12px", background: "#edf2f7", color: "#4a5568", padding: "3px 8px", borderRadius: "4px", fontWeight: "bold" }}>📅 {task.tanggal}</span>
                      <span style={{ fontSize: "12px", background: "#ebf8ff", color: "#2b6cb0", padding: "3px 8px", borderRadius: "4px", fontWeight: "bold" }}>📍 {task.area}</span>
                    </div>
                    <div style={{ fontWeight: "bold", fontSize: "15px", color: rowStyle.color, lineHeight: "1.4" }}>
                      {task.tugas}
                    </div>
                  </div>

                  {/* Aksi & Status */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    
                    <button 
                      onClick={() => handleToggleStatus(task.id, task.status)}
                      style={{ padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", border: task.status === "Selesai" ? "1px solid #68d391" : "1px solid #a0aec0", background: task.status === "Selesai" ? "#c6f6d5" : "white", color: task.status === "Selesai" ? "#22543d" : "#718096", cursor: "pointer", transition: "all 0.2s" }}
                    >
                      {task.status === "Selesai" ? "✔ Selesai" : "Tandai Selesai"}
                    </button>
                    
                    <button 
                      onClick={() => handleDelete(task.id, task.tugas)}
                      style={{ padding: "8px", borderRadius: "6px", fontSize: "16px", border: "none", background: "#fed7d7", color: "#c53030", cursor: "pointer" }}
                      title="Hapus Tugas"
                    >
                      🗑️
                    </button>

                  </div>
                </div>
              );
            }) : (
              <div style={{ padding: "30px", textAlign: "center", color: "#a0aec0", border: "1px dashed #cbd5e0", borderRadius: "8px" }}>
                Belum ada jadwal Deep Cleaning yang diterbitkan.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}