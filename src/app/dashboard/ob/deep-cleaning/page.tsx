"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import Input from "../../../../components/ui/Input";
import Select from "../../../../components/ui/Select";
import Textarea from "../../../../components/ui/Textarea";
import Badge from "../../../../components/ui/Badge";

interface DeepCleaningTask {
  id: string;
  tanggal: string;
  area: string;
  tugas: string;
  status: "Belum Dikerjakan" | "Selesai";
  dibuat_oleh: string;
}

const DAFTAR_LANTAI = ["Area Basement", "Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Lantai 5", "Pelayanan Khusus OB", "Area Luar / Taman"];

function getTaskStatusInfo(tanggalTugas: string, status: string) {
  const today = new Date().toISOString().split("T")[0];

  if (status === "Selesai") {
    return { borderColor: "#38a169", tone: "success" as const, badgeText: "✔ Selesai", icon: "✨" };
  }
  if (tanggalTugas < today) {
    return { borderColor: "#e53e3e", tone: "danger" as const, badgeText: "Terlewat", icon: "⚠️" };
  }
  if (tanggalTugas === today) {
    return { borderColor: "#d69e2e", tone: "warning" as const, badgeText: "Hari Ini", icon: "🔥" };
  }
  return { borderColor: "#cbd5e0", tone: "neutral" as const, badgeText: "Mendatang", icon: "⏳" };
}

export default function DeepCleaningManager() {
  const router = useRouter();

  const [picName, setPicName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [tasks, setTasks] = useState<DeepCleaningTask[]>([]);

  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split("T")[0],
    area: DAFTAR_LANTAI[0],
    tugas: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const siapkanHalaman = async () => {
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
        router.push("/dashboard/ob");
        return;
      }
      setPicName(nama);

      const tasksRef = collection(db, "deep_cleaning_tasks");
      const q = query(tasksRef, orderBy("tanggal", "desc"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const taskList: DeepCleaningTask[] = [];
        snapshot.forEach((docSnap) => {
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
        waktu_dibuat: serverTimestamp(),
      });

      setFormData((prev) => ({ ...prev, tugas: "" }));
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
      await updateDoc(doc(db, "deep_cleaning_tasks", id), { status: newStatus });
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

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/dashboard/ob")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#faf5ff", color: "#6b46c1", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #e9d8fd" }}>👑 Koordinator: {picName}</div>
      </div>

      <div style={{ background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(124, 58, 237, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>DEEP CLEANING MANAGER</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Jadwalkan dan pantau target kebersihan ekstra di luar rutinitas harian</p>
      </div>

      <div style={{ maxWidth: "1100px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "25px", alignItems: "flex-start" }}>
          <Card style={{ flex: "1 1 350px", position: "sticky", top: "80px" }}>
            <h2 style={{ margin: "0 0 5px 0", color: "#553c9a", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📅</span> Buat Jadwal Baru
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Terbitkan instruksi pembersihan khusus.</p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <Input label="Pilih Tanggal Pelaksanaan" type="date" name="tanggal" value={formData.tanggal} onChange={handleInputChange} required />

              <Select label="Tentukan Lokasi / Area" name="area" value={formData.area} onChange={handleInputChange}>
                {DAFTAR_LANTAI.map((lantai) => (
                  <option key={lantai} value={lantai}>
                    {lantai}
                  </option>
                ))}
              </Select>

              <Textarea
                label="Instruksi Detail"
                name="tugas"
                value={formData.tugas}
                onChange={handleInputChange}
                required
                placeholder="Cth: Vakum karpet ruang rapat direksi, cuci gorden, dan poles ulang marmer lantai..."
                style={{ minHeight: "90px" }}
              />

              <Button type="submit" loading={isLoading} loadingText="Menyimpan ke Sistem..." variant="secondary" style={{ marginTop: "10px", background: "#6b46c1", color: "white", border: "none", boxShadow: "0 4px 10px rgba(107,70,193,0.3)" }}>
                🚀 Terbitkan Instruksi
              </Button>
            </form>
          </Card>

          <Card style={{ flex: "2 1 500px" }}>
            <h2 style={{ margin: "0 0 20px 0", color: "#2d3748", fontSize: "18px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px" }}>📋 Rekapitulasi Tugas Deep Cleaning</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {tasks.length > 0 ? (
                tasks.map((task) => {
                  const info = getTaskStatusInfo(task.tanggal, task.status);
                  return (
                    <div
                      key={task.id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderLeft: `6px solid ${info.borderColor}`, gap: "15px", flexWrap: "wrap" }}
                    >
                      <div style={{ flex: "1", minWidth: "250px" }}>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                          <Badge tone="neutral">📅 {task.tanggal}</Badge>
                          <Badge tone="info">📍 {task.area}</Badge>
                          <Badge tone={info.tone}>{info.icon} {info.badgeText}</Badge>
                        </div>
                        <div style={{ fontWeight: "600", fontSize: "15px", color: "#2d3748", lineHeight: "1.5" }}>{task.tugas}</div>
                        <div style={{ fontSize: "11px", color: "#718096", marginTop: "6px" }}>
                          Diinstruksikan oleh: <strong>{task.dibuat_oleh}</strong>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {task.status !== "Selesai" ? (
                          <Button fullWidth={false} variant="success" style={{ padding: "10px 15px", fontSize: "13px" }} onClick={() => handleToggleStatus(task.id, task.status)}>
                            Tandai Selesai
                          </Button>
                        ) : (
                          <Button fullWidth={false} variant="secondary" style={{ padding: "10px 15px", fontSize: "13px" }} onClick={() => handleToggleStatus(task.id, task.status)}>
                            Batal Selesai
                          </Button>
                        )}

                        <button
                          onClick={() => handleDelete(task.id, task.tugas)}
                          title="Hapus Tugas"
                          style={{ padding: "10px", borderRadius: "8px", fontSize: "14px", border: "1px solid #feb2b2", background: "#fff5f5", color: "#e53e3e", cursor: "pointer" }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "50px 20px", textAlign: "center", color: "#a0aec0", border: "2px dashed #e2e8f0", borderRadius: "16px", background: "#f8fafc" }}>
                  <div style={{ fontSize: "40px", marginBottom: "10px" }}>🧹</div>
                  <div style={{ fontSize: "16px", fontWeight: "bold", color: "#718096" }}>Area Bebas Debu!</div>
                  <div style={{ fontSize: "13px", marginTop: "5px" }}>Belum ada instruksi Deep Cleaning yang diterbitkan.</div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}