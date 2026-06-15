"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";

interface UserData {
  id: string;
  nama: string;
  role: string;
}

export default function ShiftCheckinPage() {
  const router = useRouter();
  
  // State Data
  const [departemen, setDepartemen] = useState<string | null>(null);
  const [stafList, setStafList] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // State Alur Check-in & Selfie
  const [step, setStep] = useState<1 | 2>(1); // 1 = Pilih Nama, 2 = Ambil Selfie
  const [selectedStaf, setSelectedStaf] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  // Referensi Kamera
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // 1. Tarik Data User Sesuai Departemen
  useEffect(() => {
    const fetchUsers = async () => {
      const dept = localStorage.getItem("pic_dept");
      if (!dept) {
        router.push("/");
        return;
      }
      setDepartemen(dept);

      try {
        const q = query(collection(db, "users_master"), where("departemen", "==", dept));
        const querySnapshot = await getDocs(q);
        
        const users: UserData[] = [];
        querySnapshot.forEach((doc) => {
          users.push({ id: doc.id, ...doc.data() } as UserData);
        });
        
        users.sort((a, b) => {
          const aKord = a.role.includes("Koordinator") || a.role.includes("Danru");
          const bKord = b.role.includes("Koordinator") || b.role.includes("Danru");
          if (aKord && !bKord) return -1;
          if (!aKord && bKord) return 1;
          return 0;
        });

        setStafList(users);
      } catch (error) {
        console.error("Gagal mengambil data staf:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, [router]);

  // 2. Nyalakan Kamera Saat Masuk Tahap 2
  useEffect(() => {
    if (step === 2) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } }) // Mengutamakan kamera depan HP
        .then((mediaStream) => {
          setStream(mediaStream);
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }
        })
        .catch((err) => {
          console.error("Akses kamera ditolak atau tidak tersedia:", err);
          alert("Gagal mengakses kamera. Pastikan Anda memberikan izin kamera.");
          setStep(1); // Kembalikan jika error
        });
    }

    // Bersihkan kamera jika komponen ditutup
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [step]);

  // Lanjut ke Tahap Selfie
  const handlePilihNama = (nama: string) => {
    setSelectedStaf(nama);
    setStep(2);
  };

  // Tangkap Foto & Rekam Absensi
  const handleAmbilSelfie = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsUploading(true);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Konversi gambar ke format base64
      const photoDataUrl = canvas.toDataURL("image/jpeg", 0.7); 

      try {
        // Simpan Data Kehadiran (Log Shift) ke Firebase
        await addDoc(collection(db, "shift_logs"), {
          nama: selectedStaf,
          departemen: departemen,
          waktu_checkin: serverTimestamp(),
          foto_selfie: photoDataUrl
        });

        // Set LocalStorage agar aplikasi tahu siapa yang aktif
        localStorage.setItem("pic_nama", selectedStaf);

        // Matikan kamera sebelum pindah halaman
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        // Arahkan ke Dashboard masing-masing
        if (departemen === "OB & CS") router.push("/dashboard/ob");
        else if (departemen === "Security") router.push("/dashboard/security");
        else if (departemen === "Driver") router.push("/dashboard/driver");
        else alert("Dashboard tidak tersedia.");

      } catch (error) {
        console.error("Gagal menyimpan absensi:", error);
        alert("Gagal merekam absensi. Coba lagi.");
        setIsUploading(false);
      }
    }
  };

  const batalkanSelfie = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStep(1);
  };

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "#2c5282", fontWeight: "bold" }}>Memuat Data Karyawan...</div>;

  return (
    <div style={{ backgroundColor: "#f0f4f8", minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", fontFamily: "sans-serif" }}>
      
      <div style={{ background: "white", padding: "40px", borderRadius: "16px", boxShadow: "0 10px 25px rgba(0,0,0,0.05)", width: "100%", maxWidth: "500px", textAlign: "center" }}>
        
        {/* TAHAP 1: PILIH NAMA */}
        {step === 1 && (
          <>
            <div style={{ fontSize: "50px", marginBottom: "10px" }}>{departemen === "Security" ? "🛡️" : departemen === "Driver" ? "🚗" : "🧹"}</div>
            <h1 style={{ margin: "0 0 10px 0", color: "#1A365D" }}>Absensi Kehadiran</h1>
            <p style={{ margin: "0 0 30px 0", color: "#718096" }}>Anda berada di gerbang <strong>{departemen}</strong>. Silakan pilih nama Anda.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {stafList.length > 0 ? stafList.map((staf) => (
                <button 
                  key={staf.id} onClick={() => handlePilihNama(staf.nama)}
                  style={{ padding: "15px", background: staf.role.includes("Koordinator") || staf.role.includes("Danru") ? "#ebf8ff" : "#f7fafc", color: staf.role.includes("Koordinator") || staf.role.includes("Danru") ? "#2b6cb0" : "#4a5568", border: staf.role.includes("Koordinator") || staf.role.includes("Danru") ? "2px solid #bee3f8" : "1px solid #e2e8f0", borderRadius: "8px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span>{staf.nama}</span>
                  {staf.role !== "Staff" && <span style={{ fontSize: "11px", background: "#3182ce", color: "white", padding: "3px 8px", borderRadius: "20px" }}>{staf.role}</span>}
                </button>
              )) : (
                <div style={{ padding: "20px", background: "#fff5f5", color: "#c53030", borderRadius: "8px", border: "1px solid #feb2b2" }}>Belum ada data untuk {departemen}. Hubungi Admin.</div>
              )}
            </div>

            <button onClick={() => { localStorage.clear(); router.push("/"); }} style={{ marginTop: "30px", background: "none", border: "none", color: "#a0aec0", textDecoration: "underline", cursor: "pointer" }}>Batal & Kembali ke Beranda</button>
          </>
        )}

        {/* TAHAP 2: KAMERA SELFIE */}
        {step === 2 && (
          <>
            <h1 style={{ margin: "0 0 10px 0", color: "#1A365D" }}>📸 Verifikasi Wajah</h1>
            <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "14px" }}>Halo, <strong>{selectedStaf}</strong>. Silakan ambil foto selfie untuk mengonfirmasi kehadiran Anda pada shift ini.</p>
            
            <div style={{ background: "#edf2f7", borderRadius: "12px", overflow: "hidden", marginBottom: "20px", border: "2px solid #cbd5e0", position: "relative", width: "100%", aspectRatio: "4/3", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}></video>
            </div>
            
            <canvas ref={canvasRef} style={{ display: "none" }}></canvas>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button 
                onClick={handleAmbilSelfie} disabled={isUploading}
                style={{ width: "100%", padding: "15px", background: isUploading ? "#a0aec0" : "#38a169", color: "white", border: "none", borderRadius: "50px", fontWeight: "bold", fontSize: "16px", cursor: isUploading ? "not-allowed" : "pointer" }}
              >
                {isUploading ? "Mengirim Data..." : "📷 Ambil Foto & Mulai Tugas"}
              </button>
              
              <button onClick={batalkanSelfie} disabled={isUploading} style={{ width: "100%", padding: "12px", background: "transparent", color: "#e53e3e", border: "1px solid #feb2b2", borderRadius: "50px", fontWeight: "bold", cursor: "pointer" }}>
                Batal (Kembali Pilih Nama)
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}