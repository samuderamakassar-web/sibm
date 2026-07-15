"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase"; // Sesuaikan path jika berbeda
import { Html5QrcodeScanner } from "html5-qrcode";
import { useToast } from "../../../../components/ui/ToastProvider";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";

// ==========================================
// 1. DATA TITIK PATROLI
// ==========================================
const GROUPED_PATROLI: Record<string, { id: string, nama: string }[]> = {
  "Ground (Basement)": [
    { id: "Ground::Parkiran Basement", nama: "Area Parkiran Basement" },
    { id: "Ground::Toilet", nama: "Toilet Basement" },
    { id: "Ground::Ruang Genset", nama: "Ruang Genset" },
    { id: "Ground::Ruang Pompa", nama: "Ruang Pompa Utama" },
    { id: "Ground::Gudang", nama: "Gudang Basement" },
    { id: "Ground::Mushallah Basement", nama: "Mushallah Basement" },
  ],
  "Lantai 1": [
    { id: "Lantai 1::Lobby", nama: "Lobby Utama" },
    { id: "Lantai 1::Asbin", nama: "Ruang Asbin" },
    { id: "Lantai 1::Ruang Meeting", nama: "Ruang Meeting Lt 1" },
    { id: "Lantai 1::Toilet", nama: "Toilet Lt 1" },
    { id: "Lantai 1::Ruang Tamu", nama: "Ruang Tamu" },
    { id: "Lantai 1::Pantry", nama: "Pantry Lt 1" },
  ],
  "Lantai 2": [
    { id: "Lantai 2::Ruang Kerja Utama", nama: "Ruang Kerja Utama" },
    { id: "Lantai 2::Pantry", nama: "Pantry Lt 2" },
    { id: "Lantai 2::Toilet", nama: "Toilet Lt 2" },
    { id: "Lantai 2::Ruang Kerja SAI", nama: "Ruang Kerja SAI" },
    { id: "Lantai 2::Ruang Direktur", nama: "Ruang Direktur" },
    { id: "Lantai 2::Ruang GM", nama: "Ruang General Manager" },
    { id: "Lantai 2::Server", nama: "Ruang Server (IT)" },
    { id: "Lantai 2::Ruang Arsip", nama: "Ruang Arsip" },
  ],
  "Lantai 3": [
    { id: "Lantai 3::Gudang", nama: "Gudang Lt 3" },
    { id: "Lantai 3::Toilet", nama: "Toilet Lt 3" },
    { id: "Lantai 3::Ruang Kesehatan", nama: "Klinik / Ruang Kesehatan" },
    { id: "Lantai 3::Ruang Meeting", nama: "Ruang Meeting Lt 3" },
    { id: "Lantai 3::Ruang Kerja Kosong", nama: "Ruang Kerja Kosong" },
    { id: "Lantai 3::Ruang Kerja PPNP", nama: "Ruang Kerja PPNP" },
  ],
  "Lantai 4": [
    { id: "Lantai 4::Ruang Kerja Kosong", nama: "Ruang Kerja Kosong" },
    { id: "Lantai 4::Toilet", nama: "Toilet Lt 4" },
    { id: "Lantai 4::Pantry", nama: "Pantry Lt 4" },
    { id: "Lantai 4::Mushallah", nama: "Mushallah Utama" },
  ],
  "Lantai 5": [
    { id: "Lantai 5::Rooftop", nama: "Area Rooftop" },
    { id: "Lantai 5::Gudang", nama: "Gudang Lt 5" },
    { id: "Lantai 5::Ruang Pompa", nama: "Ruang Pompa Air Lt 5" },
  ]
};

// ==========================================
// INTERFACES
// ==========================================
interface TitikAman {
  id: string;
  waktu_patroli: string;
  kondisi: string;
  foto: string; 
}

interface PatroliLog {
  id: string;
  waktu_laporan: Timestamp | null;
  status: string;
  catatan_shift: string;
  titik_patroli: TitikAman[];
}

export default function PatroliSecurityPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"FORM" | "HISTORY">("FORM"); // FITUR TAB BARU

  const [scannedItems, setScannedItems] = useState<TitikAman[]>([]);
  const [catatanUmum, setCatatanUmum] = useState<string>("");
  const [riwayatSaya, setRiwayatSaya] = useState<PatroliLog[]>([]); // DATA RIWAYAT BARU
  
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [kondisiTitik, setKondisiTitik] = useState<string>("Aman Terkendali");
  const [lantaiAktif, setLantaiAktif] = useState<string>("Ground (Basement)"); 
  const [showReview, setShowReview] = useState<boolean>(false); 

  const [photoTarget, setPhotoTarget] = useState<{ id: string, nama: string } | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const totalTitikKeseluruhan = useMemo(() => Object.values(GROUPED_PATROLI).reduce((acc, curr) => acc + curr.length, 0), []);
  const progressPersen = (scannedItems.length / totalTitikKeseluruhan) * 100;

  // ==========================================
  // FUNGSI KAMERA
  // ==========================================
  const bukaKamera = useCallback(async (idTitik: string, namaTitik: string) => {
    setPhotoTarget({ id: idTitik, nama: namaTitik });
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error(error);
      showToast("Gagal mengakses kamera. Pastikan izin kamera diberikan di browser Anda.", "error");
      setPhotoTarget(null);
    }
  }, []);

  const matikanKamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setPhotoTarget(null);
  };

  async function uploadToCloudinary(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
    formData.append("folder", "sibm/patroli-security");

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
    const data = await res.json();
    return data.secure_url as string;
  }

  const ambilFotoWatermark = () => {
    if (!videoRef.current || !canvasRef.current || !photoTarget) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 720;
    canvas.height = (video.videoHeight / video.videoWidth) * 720;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, canvas.height - 90, canvas.width, 90);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Arial";
    ctx.fillText(`📍 ${photoTarget.nama}`, 20, canvas.height - 55);
    ctx.font = "18px Arial";
    ctx.fillText(`🕒 ${currentTime}`, 20, canvas.height - 25);

    ctx.fillStyle = kondisiTitik === "Aman Terkendali" ? "#86efac" : "#fca5a5";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`Status: ${kondisiTitik}`, canvas.width - 20, canvas.height - 35);

    const targetSaatIni = photoTarget;
    const jamSekarang = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    matikanKamera();

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setIsUploadingFoto(true);
      try {
        const url = await uploadToCloudinary(blob);
        setScannedItems(prev => [...prev, { id: targetSaatIni.id, waktu_patroli: jamSekarang, kondisi: kondisiTitik, foto: url }]);
      } catch (err) {
        console.error(err);
        showToast(`Gagal upload foto untuk ${targetSaatIni.nama}. Titik ini belum tercatat, coba ulangi.`, "error");
      } finally {
        setIsUploadingFoto(false);
      }
    }, "image/jpeg", 0.7);
  };

  // ==========================================
  // EFFECTS
  // ==========================================
  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) return router.push("/shift-checkin");
    
    setTimeout(() => { 
      setPicName(nama); 
      setIsReady(true); 
    }, 0);
  }, [router]);

  // Efek Tarik Riwayat (BARU)
  useEffect(() => {
    if (!picName) return;

    // Mengambil riwayat yang dilaporkan oleh user ini
    const q = query(collection(db, "security_patrols"), where("petugas", "==", picName), orderBy("waktu_laporan", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: PatroliLog[] = [];
      snapshot.forEach(docSnap => data.push({ id: docSnap.id, ...docSnap.data() } as PatroliLog));
      setRiwayatSaya(data);
    });

    return () => unsubscribe();
  }, [picName]);

  useEffect(() => {
    if (photoTarget) {
      const interval = setInterval(() => {
        setCurrentTime(new Date().toLocaleString("id-ID", { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [photoTarget]);

  useEffect(() => {
    if (scanTarget) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }, false);
      scanner.render((decodedText) => {
        if (decodedText === scanTarget) {
          scanner.clear();
          const targetNama = scanTarget.split("::")[1];
          setScanTarget(null); 
          bukaKamera(scanTarget, targetNama); 
        } else {
          showToast(`❌ QR Code Salah! Anda tidak berada di titik ${scanTarget.split("::")[1]}`, "warning");
        }
      }, () => {});

      return () => { scanner.clear().catch(e => console.error(e)); };
    }
  }, [scanTarget, kondisiTitik, bukaKamera]);

  // ==========================================
  // HANDLERS
  // ==========================================
  const handleSubmitFinal = async () => {
    setIsLoading(true);
    try {
      await addDoc(collection(db, "security_patrols"), {
        petugas: picName,
        waktu_laporan: serverTimestamp(),
        titik_patroli: scannedItems,
        catatan_shift: catatanUmum,
        status: scannedItems.length === totalTitikKeseluruhan ? "Selesai Sempurna" : "Selesai Sebagian"
      });

      setIsSuccess(true);
      setTimeout(() => { 
        setIsSuccess(false); 
        setShowReview(false);
        setScannedItems([]);
        setCatatanUmum("");
        setActiveTab("HISTORY"); // PERBAIKAN: Arahkan ke Tab Riwayat setelah submit
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 2000);
    } catch (error) {
      console.error(error);
      showToast("Gagal mengirim laporan patroli.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusLantai = (namaLantai: string) => {
    const titikLantai = GROUPED_PATROLI[namaLantai];
    const scannedDiLantai = titikLantai.filter(t => scannedItems.some(s => s.id === t.id)).length;
    return { total: titikLantai.length, selesai: scannedDiLantai };
  };

  const formatWaktu = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return new Date(ts.toDate()).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => router.push("/dashboard/security")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️ <span style={{ fontSize: "14px", fontWeight: "bold", color: "#2d3748" }}>Kembali</span></button>
        
        {/* FITUR TAB BARU (FORM VS HISTORY) */}
        <div style={{ background: "#edf2f7", padding: "4px", borderRadius: "10px", display: "flex", gap: "5px" }}>
          <button onClick={() => setActiveTab("FORM")} style={{ border: "none", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", background: activeTab === "FORM" ? "white" : "transparent", color: activeTab === "FORM" ? "#e53e3e" : "#718096", transition: "all 0.2s", boxShadow: activeTab === "FORM" ? "0 2px 4px rgba(0,0,0,0.05)" : "none" }}>
            🚨 Lapor
          </button>
          <button onClick={() => setActiveTab("HISTORY")} style={{ border: "none", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", background: activeTab === "HISTORY" ? "white" : "transparent", color: activeTab === "HISTORY" ? "#e53e3e" : "#718096", transition: "all 0.2s", boxShadow: activeTab === "HISTORY" ? "0 2px 4px rgba(0,0,0,0.05)" : "none" }}>
            📜 Riwayat
          </button>
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 80px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PATROLI AREA</h1>
        <p style={{ margin: "0", fontSize: "13px", opacity: 0.9 }}>Pemantauan keliling titik rawan Gedung SIBM</p>
      </div>

      {/* 🔹 MAIN CONTENT */}
      <div style={{ maxWidth: "800px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* ========================================================= */}
        {/* TAB 1: FORM PENGISIAN PATROLI                             */}
        {/* ========================================================= */}
        {activeTab === "FORM" && (
          <div style={{ animation: "fadeIn 0.3s" }}>
            {/* KARTU PROGRESS */}
            <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", marginBottom: "25px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h2 style={{ margin: 0, color: "#2d3748", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}><span>🎯</span> Progres Keliling</h2>
                <span style={{ fontWeight: "900", color: progressPersen === 100 ? "#38a169" : "#e53e3e" }}>{scannedItems.length} / {totalTitikKeseluruhan} Titik</span>
              </div>
              <div style={{ width: "100%", background: "#edf2f7", borderRadius: "50px", height: "12px", overflow: "hidden" }}>
                <div style={{ height: "100%", background: progressPersen === 100 ? "#38a169" : "linear-gradient(90deg, #e53e3e, #dd6b20)", width: `${progressPersen}%`, transition: "width 0.5s ease-in-out" }}></div>
              </div>
              {isSuccess && (
                <div style={{ background: "#f0fff4", color: "#22543d", padding: "12px", borderRadius: "10px", marginTop: "15px", fontSize: "13px", fontWeight: "bold", border: "1px solid #c6f6d5" }}>✅ Laporan patroli berhasil dikirim! Mengalihkan...</div>
              )}
            </div>

            {/* DAFTAR AKORDEON */}
            {!showReview && (
              <div>
                <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginBottom: "25px" }}>
                  {Object.keys(GROUPED_PATROLI).map((lantai) => {
                    const stat = getStatusLantai(lantai);
                    const isLengkap = stat.selesai === stat.total;
                    const isAktif = lantaiAktif === lantai;

                    return (
                      <div key={lantai} style={{ background: "white", borderRadius: "16px", overflow: "hidden", border: isLengkap ? "2px solid #c6f6d5" : "1px solid #e2e8f0" }}>
                        <div onClick={() => setLantaiAktif(isAktif ? "" : lantai)} style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: isLengkap ? "#f0fff4" : (isAktif ? "#f8fafc" : "white"), cursor: "pointer" }}>
                          <div>
                            <h3 style={{ margin: "0 0 4px 0", color: isLengkap ? "#22543d" : "#2d3748", fontSize: "16px" }}>{lantai}</h3>
                            <div style={{ fontSize: "12px", color: isLengkap ? "#38a169" : "#718096", fontWeight: "bold" }}>{stat.selesai} / {stat.total} Titik Selesai</div>
                          </div>
                          <div style={{ transform: isAktif ? "rotate(180deg)" : "rotate(0deg)", transition: "0.3s" }}>🔽</div>
                        </div>

                        {isAktif && (
                          <div style={{ padding: "15px", borderTop: "1px solid #edf2f7", display: "flex", flexDirection: "column", gap: "10px", background: "#fbfcfd" }}>
                            {GROUPED_PATROLI[lantai].map((titik) => {
                              const dataSelesai = scannedItems.find((item) => item.id === titik.id);
                              
                              return (
                                <div key={titik.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 15px", background: "white", border: dataSelesai ? "1px solid #9ae6b4" : "1px solid #e2e8f0", borderRadius: "10px" }}>
                                  <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                                    {dataSelesai && (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img src={dataSelesai.foto} alt="Thumb" style={{ width: "40px", height: "40px", borderRadius: "8px", objectFit: "cover", border: "1px solid #c6f6d5" }} />
                                    )}
                                    <div>
                                      <div style={{ fontSize: "14px", color: dataSelesai ? "#22543d" : "#4a5568", fontWeight: "bold" }}>{titik.nama}</div>
                                      {dataSelesai ? (
                                        <div style={{ fontSize: "11px", color: dataSelesai.kondisi === "Aman Terkendali" ? "#38a169" : "#e53e3e", marginTop: "4px", fontWeight: "bold" }}>
                                          ↳ {dataSelesai.kondisi} ({dataSelesai.waktu_patroli})
                                        </div>
                                      ) : <div style={{ fontSize: "11px", color: "#a0aec0", marginTop: "4px" }}>Belum dikunjungi</div>}
                                    </div>
                                  </div>
                                  
                                  {!dataSelesai ? (
                                    <button onClick={() => { setKondisiTitik("Aman Terkendali"); setScanTarget(titik.id); }} style={{ background: "#e53e3e", color: "white", border: "none", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>📷 Scan</button>
                                  ) : <div style={{ color: "#38a169", fontWeight: "bold" }}>✓ Selesai</div>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ background: "white", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0", marginBottom: "25px" }}>
                  <label style={{ display: "block", fontWeight: "bold", marginBottom: "10px", color: "#2d3748", fontSize: "14px" }}>📝 Catatan Akhir Shift (Opsional):</label>
                  <textarea value={catatanUmum} onChange={(e) => setCatatanUmum(e.target.value)} placeholder="Tuliskan kendala atau temuan penting..." style={{ width: "100%", padding: "15px", height: "100px", borderRadius: "10px", border: "1px solid #cbd5e0", resize: "none", fontSize: "14px" }} />
                </div>

                <button onClick={() => {
                  if (scannedItems.length === 0) return alert("Belum ada titik yang dipatroli!");
                  setShowReview(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }} style={{ width: "100%", padding: "18px", background: scannedItems.length === 0 ? "#a0aec0" : "#2b6cb0", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: scannedItems.length === 0 ? "not-allowed" : "pointer", boxShadow: "0 10px 15px -3px rgba(43, 108, 176, 0.4)" }}>
                  📋 Review Hasil Patroli ➔
                </button>
              </div>
            )}

            {/* TABEL REVIEW SEBELUM SUBMIT */}
            {showReview && (
              <div style={{ background: "white", padding: "25px", borderRadius: "20px", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", animation: "fadeIn 0.3s ease-in-out" }}>
                <h2 style={{ margin: "0 0 10px 0", color: "#2d3748", fontSize: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>📋 Verifikasi Laporan</h2>
                <p style={{ color: "#718096", fontSize: "13px", marginBottom: "20px" }}>Pastikan tidak ada titik yang terlewat sebelum mengunci laporan.</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginBottom: "30px", maxHeight: "60vh", overflowY: "auto", paddingRight: "10px" }}>
                  {scannedItems.map((item, idx) => {
                    const isAman = item.kondisi === "Aman Terkendali";
                    return (
                      <div key={idx} style={{ display: "flex", gap: "15px", padding: "15px", border: "1px solid #e2e8f0", borderRadius: "12px", background: "#f8fafc" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.foto} alt="Patroli" style={{ width: "80px", height: "100px", objectFit: "cover", borderRadius: "8px", border: "2px solid #cbd5e0" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "12px", color: "#a0aec0", fontWeight: "bold" }}>{item.id.split("::")[0]}</div>
                          <div style={{ fontSize: "15px", fontWeight: "bold", color: "#2d3748", marginBottom: "5px" }}>{item.id.split("::")[1]}</div>
                          <span style={{ fontSize: "11px", background: isAman ? "#c6f6d5" : "#fed7d7", color: isAman ? "#22543d" : "#9b2c2c", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold" }}>{item.kondisi}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: "15px" }}>
                  <button onClick={() => setShowReview(false)} style={{ flex: 1, padding: "15px", background: "#edf2f7", color: "#4a5568", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer" }}>⬅️ Cek Area Lain</button>
                  <button onClick={handleSubmitFinal} disabled={isLoading} style={{ flex: 2, padding: "15px", background: "#e53e3e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: isLoading ? "not-allowed" : "pointer", boxShadow: "0 4px 6px rgba(229, 62, 62, 0.3)" }}>
                    {isLoading ? "Mengunggah..." : "🚀 Kunci & Kirim Laporan"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: RIWAYAT SAYA (HISTORY VIEW)                        */}
        {/* ========================================================= */}
        {activeTab === "HISTORY" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "25px", animation: "fadeIn 0.3s" }}>
            {riwayatSaya.length > 0 ? riwayatSaya.map((log) => (
              <div key={log.id} style={{ background: "white", borderRadius: "20px", padding: "25px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px" }}>
                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#a0aec0", fontWeight: "bold" }}>Diserahkan Pada:</span>
                    <h3 style={{ margin: "5px 0 0 0", color: "#2d3748", fontSize: "16px" }}>{formatWaktu(log.waktu_laporan)}</h3>
                  </div>
                  <span style={{ background: log.status.includes("Sempurna") ? "#f0fff4" : "#fff5f5", color: log.status.includes("Sempurna") ? "#22543d" : "#9b2c2c", border: log.status.includes("Sempurna") ? "1px solid #c6f6d5" : "1px solid #fed7d7", padding: "8px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold" }}>
                    {log.status}
                  </span>
                </div>

                {log.catatan_shift && (
                  <div style={{ background: "#f8fafc", padding: "15px", borderRadius: "12px", marginBottom: "20px", fontSize: "13px", color: "#4a5568", border: "1px dashed #cbd5e0" }}>
                    <strong>Catatan:</strong> <i style={{ color: "#718096" }}>&quot;{log.catatan_shift}&quot;</i>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "15px" }}>
                  {log.titik_patroli.map((t, i) => {
                    const isAman = t.kondisi.includes("Aman");
                    return (
                      <div key={i} style={{ background: "white", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                        <div style={{ position: "relative" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={t.foto} alt="Titik" style={{ width: "100%", height: "200px", objectFit: "cover" }} />
                          <div style={{ position: "absolute", bottom: "8px", right: "8px", background: "rgba(0,0,0,0.7)", color: "white", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold" }}>{t.waktu_patroli}</div>
                        </div>
                        <div style={{ padding: "10px" }}>
                          <div style={{ fontSize: "10px", color: "#a0aec0", fontWeight: "bold" }}>{t.id.split("::")[0]}</div>
                          <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "13px", margin: "2px 0 8px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.id.split("::")[1]}</div>
                          <span style={{ fontSize: "10px", background: isAman ? "#c6f6d5" : "#fed7d7", color: isAman ? "#22543d" : "#9b2c2c", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold" }}>{t.kondisi}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )) : (
              <div style={{ padding: "60px 20px", textAlign: "center", background: "white", borderRadius: "20px", border: "2px dashed #cbd5e0" }}>
                <div style={{ fontSize: "50px", marginBottom: "15px" }}>📭</div>
                <h3 style={{ color: "#4a5568", margin: "0 0 10px 0" }}>Belum Ada Riwayat</h3>
                <p style={{ color: "#a0aec0", fontSize: "14px", margin: 0 }}>Catatan patroli keliling Anda akan terekam dan ditampilkan di sini.</p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ======================================= */}
      {/* MODAL SCANNER QR                        */}
      {/* ======================================= */}
      {scanTarget && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.95)", zIndex: 1000, display: "flex", flexDirection: "column", backdropFilter: "blur(5px)" }}>
          <div style={{ padding: "20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontWeight: "bold", fontSize: "16px" }}>📸 Scan Lokasi: {scanTarget.split("::")[1]}</span>
            <button onClick={() => setScanTarget(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: "40px", height: "40px", borderRadius: "50%", fontSize: "18px", cursor: "pointer" }}>✖</button>
          </div>
          <div style={{ padding: "20px", background: "#1a202c", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", overflowY: "auto" }}>
            <div style={{ background: "white", padding: "15px", borderRadius: "16px", marginBottom: "20px", width: "100%", maxWidth: "400px" }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "8px", fontSize: "14px", color: "#4a5568" }}>Pilih Kondisi Titik:</label>
              <select value={kondisiTitik} onChange={(e) => setKondisiTitik(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "2px solid #e2e8f0", fontWeight: "bold", color: kondisiTitik === "Aman Terkendali" ? "#38a169" : "#e53e3e", fontSize: "15px", outline: "none" }}>
                <option value="Aman Terkendali">✅ Aman Terkendali</option>
                <option value="Ada Temuan / Mencurigakan">⚠️ Ada Temuan / Mencurigakan</option>
                <option value="Pintu/Jendela Terbuka">🚪 Pintu/Jendela Terbuka</option>
                <option value="Kebocoran Air">💧 Kebocoran Air</option>
              </select>
            </div>
            <div style={{ width: "100%", maxWidth: "400px", background: "white", padding: "10px", borderRadius: "16px", overflow: "hidden", marginBottom: "20px" }}>
              <div id="reader" style={{ width: "100%" }}></div>
            </div>
            <button onClick={() => { const targetNama = scanTarget.split("::")[1]; setScanTarget(null); bukaKamera(scanTarget, targetNama); }} style={{ width: "100%", maxWidth: "400px", padding: "15px", background: "rgba(255,255,255,0.1)", color: "white", border: "1px dashed rgba(255,255,255,0.3)", borderRadius: "12px", cursor: "pointer" }}>
              ⚙️ By-pass QR (Simulasi Langsung Foto)
            </button>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* MODAL KAMERA WATERMARK                  */}
      {/* ======================================= */}
      {photoTarget && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000", zIndex: 1100, display: "flex", flexDirection: "column" }}>
          <div style={{ position: "absolute", top: 20, left: 20, right: 20, zIndex: 10, display: "flex", justifyContent: "space-between" }}>
            <div style={{ background: "rgba(0,0,0,0.6)", color: "white", padding: "8px 15px", borderRadius: "20px", backdropFilter: "blur(5px)", fontSize: "12px" }}>
              <div style={{ fontWeight: "bold", fontSize: "14px", color: "#fef08a" }}>📍 {photoTarget.nama}</div>
              <div>{currentTime}</div>
            </div>
            <button onClick={matikanKamera} style={{ background: "rgba(255,0,0,0.8)", border: "none", color: "white", width: "40px", height: "40px", borderRadius: "50%" }}>✖</button>
          </div>
          <div style={{ flex: 1, position: "relative", display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
            <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "120px", background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)", pointerEvents: "none" }}></div>
          </div>
          <div style={{ padding: "30px", display: "flex", justifyContent: "center", background: "#000" }}>
            <button onClick={ambilFotoWatermark} disabled={isUploadingFoto} style={{ width: "80px", height: "80px", borderRadius: "50%", background: isUploadingFoto ? "#a0aec0" : "white", border: "6px solid #e2e8f0", cursor: isUploadingFoto ? "not-allowed" : "pointer", boxShadow: "0 0 15px rgba(255,255,255,0.4)" }}></button>
          </div>
        </div>
      )}

    </div>
  );
}