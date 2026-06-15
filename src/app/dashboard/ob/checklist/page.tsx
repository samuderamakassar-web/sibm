"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

// Interface untuk Struktur Data
interface TugasDetail {
  nama_tugas: string;
  foto_before: string | null;
  foto_after: string | null;
  status: string;
}

interface ChecklistLog {
  id: string;
  area: string;
  pic_bertugas: string;
  waktu_selesai: Timestamp | null;
  detail_tugas: TugasDetail[];
}

const TUGAS_STANDAR = [
  { id: "t1", nama: "Wastafel / Kaca / Meja" },
  { id: "t2", nama: "Tempat Sampah" },
  { id: "t3", nama: "Lantai (Sapu & Pel)" }
];

export default function ChecklistKameraPage() {
  const router = useRouter();
  
  // Identitas & Navigasi Utama
  const [picName, setPicName] = useState("");
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [assignedAreas, setAssignedAreas] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedArea, setSelectedArea] = useState("");
  
  // State Data Riwayat
  const [riwayatKerja, setRiwayatKerja] = useState<ChecklistLog[]>([]);
  
  // Loading States
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);

  // State Kamera & Foto
  const [photos, setPhotos] = useState<Record<string, { before?: string, after?: string }>>({});
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeTaskConfig, setActiveTaskConfig] = useState<{ taskId: string, type: "before" | "after" } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // EFEK 1: Ambil Identitas & Data Ploting
  useEffect(() => {
    const muatDataAwal = async () => {
      const nama = localStorage.getItem("pic_nama");
      if (!nama) {
        router.push("/shift-checkin");
        return;
      }
      setPicName(nama);

      try {
        const todayISO = new Date().toISOString().split("T")[0];
        const plotRef = doc(db, "daily_plots", todayISO);
        const plotSnap = await getDoc(plotRef);

        if (plotSnap.exists()) {
          const plots = plotSnap.data().plot_lantai || {};
          const lantaiKu = Object.keys(plots).filter(
            (lantai) => plots[lantai] === nama || plots[lantai] === "Semua / All"
          );
          
          setAssignedAreas(lantaiKu);
          if (lantaiKu.length > 0) {
            setSelectedArea(lantaiKu[0]); 
          }
        }
      } catch (error) {
        console.error("Gagal memuat data plotting:", error);
      } finally {
        setIsPageLoading(false);
      }
    };

    muatDataAwal();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [router]);

  // EFEK 2: Listener Riwayat Checklist Real-time
  useEffect(() => {
    if (!picName) return;

    const checklistRef = collection(db, "ob_checklists");
    const q = query(checklistRef, where("pic_bertugas", "==", picName), orderBy("waktu_selesai", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: ChecklistLog[] = [];
      snapshot.forEach(docSnap => {
        logs.push({ ...docSnap.data(), id: docSnap.id } as ChecklistLog);
      });
      setRiwayatKerja(logs);
    });

    return () => unsubscribe();
  }, [picName]);

  // KENDALI KAMERA
  const bukaKamera = async (taskId: string, type: "before" | "after") => {
    setActiveTaskConfig({ taskId, type });
    setIsCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error(error);
      alert("Gagal mengakses kamera. Pastikan izin kamera diberikan.");
      setIsCameraOpen(false);
    }
  };

  const matikanKamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
    setActiveTaskConfig(null);
  };

  const ambilFoto = () => {
    if (!videoRef.current || !canvasRef.current || !activeTaskConfig) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    const MAX_WIDTH = 400;
    const scale = MAX_WIDTH / video.videoWidth;
    canvas.width = MAX_WIDTH;
    canvas.height = video.videoHeight * scale;
    
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photoBase64 = canvas.toDataURL("image/jpeg", 0.6); 
      
      setPhotos(prev => ({
        ...prev,
        [activeTaskConfig.taskId]: {
          ...prev[activeTaskConfig.taskId],
          [activeTaskConfig.type]: photoBase64
        }
      }));
    }
    matikanKamera();
  };

  const hapusFoto = (taskId: string, type: "before" | "after") => {
    setPhotos(prev => {
      const newPhotos = { ...prev };
      if (newPhotos[taskId]) {
        delete newPhotos[taskId][type];
      }
      return newPhotos;
    });
  };

  const handleKirimLaporan = async () => {
    const hasPhotos = Object.keys(photos).some(taskId => photos[taskId].before || photos[taskId].after);
    if (!hasPhotos) {
      return alert("Mohon lengkapi minimal satu foto bukti (Before/After) sebelum mengirim laporan!");
    }

    setIsLoading(true);
    try {
      const detailTugas = TUGAS_STANDAR.map(tugas => ({
        nama_tugas: tugas.nama,
        foto_before: photos[tugas.id]?.before || null,
        foto_after: photos[tugas.id]?.after || null,
        status: (photos[tugas.id]?.before && photos[tugas.id]?.after) ? "Selesai Sempurna" : (photos[tugas.id]?.after ? "Selesai Sebagian" : "Dilewati")
      }));

      await addDoc(collection(db, "ob_checklists"), {
        pic_bertugas: picName,
        area: selectedArea,
        waktu_selesai: serverTimestamp(),
        detail_tugas: detailTugas
      });

      alert("Laporan Kebersihan berhasil dikirim! Riwayat visual Anda telah terekam.");
      setPhotos({});
      setStep(1);
      setActiveTab("history"); 
    } catch (error) {
      console.error("Gagal mengirim laporan:", error);
      alert("Terjadi kesalahan sistem saat mengirim laporan.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatJam = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  if (isPageLoading) {
    return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "#319795", fontWeight: "bold" }}>Menyelaraskan Tugas Ploting Anda...</div>;
  }

  return (
    <div style={{ backgroundColor: "#f0f4f8", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: "50px" }}>
      
      {/* HEADER UTAMA */}
      <div style={{ background: "white", padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={() => router.push("/dashboard/ob")} style={{ background: "none", border: "none", fontSize: "16px", fontWeight: "bold", color: "#4a5568", cursor: "pointer" }}>
          ⬅ Kembali
        </button>
        
        {/* SISTEM PEMILIHAN TAB */}
        <div style={{ background: "#edf2f7", padding: "4px", borderRadius: "8px", display: "flex", gap: "5px" }}>
          <button onClick={() => setActiveTab("form")} style={{ border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", background: activeTab === "form" ? "#319795" : "transparent", color: activeTab === "form" ? "white" : "#4a5568", transition: "all 0.2s" }}>
            ✏️ Kirim Laporan
          </button>
          <button onClick={() => setActiveTab("history")} style={{ border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", background: activeTab === "history" ? "#319795" : "transparent", color: activeTab === "history" ? "white" : "#4a5568", transition: "all 0.2s" }}>
            📜 Riwayat ({riwayatKerja.length})
          </button>
        </div>

        <div style={{ fontSize: "12px", fontWeight: "bold", color: "#718096", display: "none" }}>👤 {picName}</div>
      </div>

      <div style={{ maxWidth: "800px", margin: "20px auto", padding: "0 20px" }}>
        
        {/* ========================================================================================= */}
        {/* TAB 1: FORMULIR INPUT CHEKLIST & KAMERA */}
        {/* ========================================================================================= */}
        {activeTab === "form" && (
          <>
            {step === 1 && (
              <div style={{ background: "white", padding: "30px", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", textAlign: "center" }}>
                {assignedAreas.length > 0 ? (
                  <>
                    <div style={{ fontSize: "50px", marginBottom: "15px" }}>📍</div>
                    <h2 style={{ margin: "0 0 10px 0", color: "#2d3748" }}>Mulai Laporan Kebersihan</h2>
                    <p style={{ color: "#718096", marginBottom: "25px", fontSize: "14px" }}>Pilih salah satu lokasi penugasan Anda untuk diverifikasi:</p>
                    
                    <select 
                      value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}
                      style={{ width: "100%", padding: "15px", borderRadius: "8px", border: "2px solid #319795", fontSize: "16px", fontWeight: "bold", color: "#234e52", marginBottom: "25px", cursor: "pointer", background: "#e6fffa" }}
                    >
                      {assignedAreas.map(area => <option key={area} value={area}>📍 {area}</option>)}
                    </select>

                    <button 
                      onClick={() => setStep(2)}
                      style={{ width: "100%", padding: "15px", background: "#319795", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}
                    >
                      Buka Kamera & Mulai Kerja ➔
                    </button>
                  </>
                ) : (
                  <div style={{ padding: "20px" }}>
                    <div style={{ fontSize: "50px", marginBottom: "15px" }}>⚠️</div>
                    <h3 style={{ color: "#e53e3e", margin: "0 0 10px 0" }}>Belum Ada Ploting Tugas</h3>
                    <p style={{ color: "#718096", fontSize: "14px", margin: 0 }}>
                      Koordinator belum memetakan lokasi kerja Anda hari ini. Silakan hubungi Danru Anda agar menu checklist ini bisa terbuka.
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div>
                <div style={{ background: "#e6fffa", padding: "15px 20px", borderRadius: "8px", border: "1px solid #b2f5ea", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "12px", color: "#285e61", fontWeight: "bold" }}>Lokasi Validasi Kerja:</span>
                    <h2 style={{ margin: "0", color: "#234e52", fontSize: "20px" }}>{selectedArea}</h2>
                  </div>
                  <button onClick={() => setStep(1)} style={{ background: "white", border: "1px solid #cbd5e0", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>Ganti Area</button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {TUGAS_STANDAR.map((tugas) => (
                    <div key={tugas.id} style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                      <h3 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "16px", borderBottom: "1px solid #edf2f7", paddingBottom: "10px" }}>
                        🧼 {tugas.nama}
                      </h3>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#e53e3e", marginBottom: "6px", textAlign: "center" }}>🔴 SEBELUM (BEFORE)</div>
                          {photos[tugas.id]?.before ? (
                            <div style={{ position: "relative" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photos[tugas.id].before} alt="Before" style={{ width: "100%", borderRadius: "8px", border: "2px solid #fed7d7" }} />
                              <button onClick={() => hapusFoto(tugas.id, "before")} style={{ position: "absolute", top: "5px", right: "5px", background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: "25px", height: "25px", cursor: "pointer" }}>✖</button>
                            </div>
                          ) : (
                            <button onClick={() => bukaKamera(tugas.id, "before")} style={{ width: "100%", height: "90px", background: "#fff5f5", border: "2px dashed #feb2b2", borderRadius: "8px", color: "#c53030", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", fontWeight: "bold", fontSize: "13px" }}>
                              <span>📷 Ambil Foto</span>
                            </button>
                          )}
                        </div>

                        <div>
                          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#38a169", marginBottom: "6px", textAlign: "center" }}>🟢 SESUDAH (AFTER)</div>
                          {photos[tugas.id]?.after ? (
                            <div style={{ position: "relative" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photos[tugas.id].after} alt="After" style={{ width: "100%", borderRadius: "8px", border: "2px solid #c6f6d5" }} />
                              <button onClick={() => hapusFoto(tugas.id, "after")} style={{ position: "absolute", top: "5px", right: "5px", background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: "25px", height: "25px", cursor: "pointer" }}>✖</button>
                            </div>
                          ) : (
                            <button onClick={() => bukaKamera(tugas.id, "after")} style={{ width: "100%", height: "90px", background: "#f0fff4", border: "2px dashed #9ae6b4", borderRadius: "8px", color: "#276749", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", fontWeight: "bold", fontSize: "13px" }}>
                              <span>📷 Ambil Foto</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleKirimLaporan} disabled={isLoading}
                  style={{ width: "100%", padding: "18px", background: isLoading ? "#a0aec0" : "#2c5282", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "16px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "30px", boxShadow: "0 4px 6px rgba(44, 82, 130, 0.2)" }}
                >
                  {isLoading ? "Mengirim Laporan..." : "🚀 KUKUHKAN & KIRIM LAPORAN"}
                </button>
              </div>
            )}
          </>
        )}

        {/* ========================================================================================= */}
        {/* TAB 2: GALERI & TABEL RIWAYAT VISUAL */}
        {/* ========================================================================================= */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {riwayatKerja.length > 0 ? riwayatKerja.map((log) => (
              <div key={log.id} style={{ background: "white", borderRadius: "16px", padding: "20px", boxShadow: "0 4px 10px rgba(0,0,0,0.04)", borderLeft: "6px solid #319795" }}>
                
                {/* Atas: Info Area & Jam */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "1px dashed #edf2f7", paddingBottom: "12px" }}>
                  <div>
                    <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#a0aec0", fontWeight: "bold" }}>Selesai Dibersihkan:</span>
                    <h3 style={{ margin: "2px 0 0 0", color: "#2d3748", fontSize: "18px" }}>📍 {log.area}</h3>
                  </div>
                  <span style={{ background: "#e6fffa", color: "#234e52", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "bold" }}>
                    ⏱️ {formatJam(log.waktu_selesai)}
                  </span>
                </div>

                {/* Bawah: Baris Tugas dan Tampilan Foto Rekam Jejak */}
                <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  {log.detail_tugas.map((sub, sIdx) => (
                    <div key={sIdx} style={{ background: "#f7fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: "bold", color: "#4a5568", fontSize: "14px", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                        <span>🔹 {sub.nama_tugas}</span>
                        <span style={{ fontSize: "11px", color: "#319795" }}>{sub.status}</span>
                      </div>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <div style={{ fontSize: "10px", color: "#e53e3e", fontWeight: "bold", marginBottom: "4px" }}>BEFORE:</div>
                          {sub.foto_before ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={sub.foto_before} alt="Bukti Kuno" style={{ width: "100%", borderRadius: "6px", border: "1px solid #feb2b2", aspectRatio: "4/3", objectFit: "cover" }} />
                          ) : (
                            // PERBAIKAN: italic diubah menjadi fontStyle
                            <div style={{ fontSize: "11px", color: "#a0aec0", fontStyle: "italic", padding: "10px", background: "#fff", borderRadius: "4px", textAlign: "center" }}>Tanpa foto</div>
                          )}
                        </div>

                        <div>
                          <div style={{ fontSize: "10px", color: "#38a169", fontWeight: "bold", marginBottom: "4px" }}>AFTER:</div>
                          {sub.foto_after ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={sub.foto_after} alt="Bukti Bersih" style={{ width: "100%", borderRadius: "6px", border: "1px solid #c6f6d5", aspectRatio: "4/3", objectFit: "cover" }} />
                          ) : (
                            // PERBAIKAN: italic diubah menjadi fontStyle
                            <div style={{ fontSize: "11px", color: "#a0aec0", fontStyle: "italic", padding: "10px", background: "#fff", borderRadius: "4px", textAlign: "center" }}>Tanpa foto</div>
                          )}
                        </div>
                      </div>

                    </div>
                  ))}
                </div>

              </div>
            )) : (
              <div style={{ padding: "40px", textAlign: "center", background: "white", color: "#a0aec0", borderRadius: "12px", border: "1px dashed #cbd5e0" }}>
                📭 Anda belum mengirimkan laporan kebersihan hari ini. Riwayat foto akan muncul setelah Anda mengirim laporan pertama Anda.
              </div>
            )}
          </div>
        )}

      </div>

      {/* 🌑 OVERLAY MODAL KAMERA JEPRETAN */}
      {isCameraOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000", zIndex: 100, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "15px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1a1a1a" }}>
            <span style={{ fontWeight: "bold", fontSize: "14px" }}>📸 BIDIK AREA PEMBERSIHAN</span>
            <button onClick={matikanKamera} style={{ background: "none", border: "none", color: "white", fontSize: "24px", cursor: "pointer" }}>✖</button>
          </div>
          <div style={{ flex: 1, position: "relative", display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
            <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "75%", height: "55%", border: "2px dashed rgba(255,255,255,0.6)", borderRadius: "12px", pointerEvents: "none" }}></div>
          </div>
          <div style={{ padding: "30px", display: "flex", justifyContent: "center", background: "#000" }}>
            <button onClick={ambilFoto} style={{ width: "75px", height: "75px", borderRadius: "50%", background: "white", border: "6px solid #4a5568", cursor: "pointer", boxShadow: "0 0 15px rgba(255,255,255,0.3)" }}></button>
          </div>
        </div>
      )}

    </div>
  );
}