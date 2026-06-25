"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, doc, updateDoc, Timestamp, getDocs } from "firebase/firestore";
// 💡 HAPUS firebase/storage KARENA KITA TIDAK PAKAI LAGI
import { db } from "../../../../lib/firebase"; 

interface TipePaket {
  id: string;
  jenis_barang: string;
  penerima: string;
  kurir: string;
  keterangan: string;
  waktu_diterima: Timestamp | null;
  waktu_diambil: Timestamp | null;
  status: "Belum Diambil" | "Sudah Diambil";
  foto_bukti_url: string; 
}

interface EmployeeData {
  nama: string;
  departemen: string;
}

export default function PaketPage() {
  const router = useRouter();
  
  const [picName, setPicName] = useState("");
  const [waktuSekarang, setWaktuSekarang] = useState("");

  // State Form Input
  const [jenisBarang, setJenisBarang] = useState("Paket / Barang");
  const [penerima, setPenerima] = useState("");
  const [kurir, setKurir] = useState("");
  const [keterangan, setKeterangan] = useState("");
  
  // 💡 STATE FOTO DIGANTI MENJADI STRING BASE64
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // State Autocomplete Karyawan
  const [karyawanDB, setKaryawanDB] = useState<EmployeeData[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // State Status
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // State Tabel
  const [searchTabel, setSearchTabel] = useState("");
  const [daftarPaket, setDaftarPaket] = useState<TipePaket[]>([]);

  // State Kamera
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 1. Inisialisasi Halaman
  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) {
      router.push("/shift-checkin");
      return;
    }
    
    setTimeout(() => setPicName(nama), 0);

    const timer = setInterval(() => {
      setWaktuSekarang(new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" }));
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  // 2. Tarik Data Paket & Master Karyawan
  useEffect(() => {
    const q = query(collection(db, "packages"), orderBy("waktu_diterima", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const paketArr: TipePaket[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        paketArr.push({
          id: docSnap.id,
          jenis_barang: data.jenis_barang,
          penerima: data.penerima,
          kurir: data.kurir,
          keterangan: data.keterangan,
          waktu_diterima: data.waktu_diterima,
          waktu_diambil: data.waktu_diambil,
          status: data.status,
          foto_bukti_url: data.foto_bukti_url || "",
        });
      });
      setDaftarPaket(paketArr);
    });

    const fetchKaryawan = async () => {
      try {
        const empRef = collection(db, "employees_directory");
        const empSnap = await getDocs(empRef);
        const empList: EmployeeData[] = [];
        empSnap.forEach(doc => {
          empList.push({ nama: doc.data().nama, departemen: doc.data().departemen });
        });
        setKaryawanDB(empList);
      } catch (error) {
        console.error("Gagal memuat karyawan:", error);
      }
    };
    fetchKaryawan();

    return () => unsubscribe();
  }, []);

  const paketTerfilter = daftarPaket.filter((pkt) =>
    pkt.penerima.toLowerCase().includes(searchTabel.toLowerCase()) ||
    pkt.kurir.toLowerCase().includes(searchTabel.toLowerCase())
  );

  const filteredKaryawan = karyawanDB.filter(emp => emp.nama.toLowerCase().includes(penerima.toLowerCase()));

  const pilihKaryawan = (emp: EmployeeData) => {
    setPenerima(emp.nama);
    setShowDropdown(false);
  };

  // 3. Kendali Kamera & File (Diubah ke Base64)
  const startCamera = async () => {
    setPreviewUrl("");
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Gagal mengakses kamera:", err);
      alert("Gagal mengakses kamera. Pastikan Anda memberikan izin.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach((track) => track.stop());
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Mengompres ukuran foto agar tidak memberatkan database
      const MAX_WIDTH = 500;
      const scaleSize = MAX_WIDTH / video.videoWidth;
      canvas.width = MAX_WIDTH;
      canvas.height = video.videoHeight * scaleSize;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Mengubah foto menjadi teks (Base64) dengan kompresi kualitas 0.6
        const base64 = canvas.toDataURL("image/jpeg", 0.6);
        setPreviewUrl(base64); 
        stopCamera();
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 500; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL("image/jpeg", 0.6); 
          setPreviewUrl(base64);
        }
      };
      if (typeof ev.target?.result === 'string') img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 4. Submit & Update (TANPA FIREBASE STORAGE)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);

    try {
      await addDoc(collection(db, "packages"), {
        jenis_barang: jenisBarang,
        penerima: penerima,
        kurir: kurir,
        keterangan: keterangan,
        waktu_diterima: serverTimestamp(),
        waktu_diambil: null,
        status: "Belum Diambil",
        foto_bukti_url: previewUrl // Langsung menyimpan teks foto ke database teks!
      });

      setPenerima("");
      setKurir("");
      setKeterangan("");
      setPreviewUrl("");
      setIsSuccess(true);
      
      setTimeout(() => setIsSuccess(false), 4000);
    } catch (error) {
      console.error("Error:", error);
      alert("Gagal menyimpan data log paket.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiambil = async (id: string, namaPenerima: string) => {
    if (!window.confirm(`Konfirmasi: Serahkan paket ini kepada ${namaPenerima}?`)) return;

    try {
      const paketRef = doc(db, "packages", id);
      await updateDoc(paketRef, {
        waktu_diambil: serverTimestamp(),
        status: "Sudah Diambil"
      });
    } catch (error) {
      console.error("Gagal update:", error);
    }
  };

  const formatWaktu = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const sharedInputStyle = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "1px solid #cbd5e0",
    fontSize: "14px",
    background: "#f8fafc",
    outline: "none",
    boxSizing: "border-box" as const,
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
    transition: "all 0.2s"
  };

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/dashboard/security")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👮 {picName}
        </div>
      </div>

      {/* 🔹 HERO SECTION (TEMA MERAH SAMUDERA) */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>MANAJEMEN PAKET MASUK</h1>
        <p style={{ margin: "0 0 15px 0", fontSize: "13px", opacity: 0.9 }}>Pencatatan resi kurir, surat, dan paket karyawan SIBM</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "6px 15px", borderRadius: "50px", fontSize: "12px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.3)" }}>
          🕒 {waktuSekarang || "Memuat waktu..."}
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-20px auto 0", padding: "0 20px", position: "relative", zIndex: 10, display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" }}>
        
        {/* ============================================================== */}
        {/* KOLOM KIRI: FORM INPUT */}
        {/* ============================================================== */}
        <div style={{ flex: "1 1 350px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <h3 style={{ marginTop: "0", color: "#2d3748", borderBottom: "2px solid #edf2f7", paddingBottom: "12px", display: "flex", alignItems: "center", gap: "10px", fontSize: "18px" }}>
            <span style={{background:"#fff5f5", padding:"8px", borderRadius:"12px"}}>📥</span> Input Penerimaan
          </h3>
          
          {isSuccess && (
            <div style={{ background: "#f0fff4", color: "#22543d", padding: "12px", borderRadius: "12px", marginBottom: "20px", fontSize: "13px", fontWeight: "bold", border: "1px solid #c6f6d5", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>✅</span> Paket berhasil dicatat ke sistem!
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>Jenis Titipan:</label>
              <select value={jenisBarang} onChange={(e) => setJenisBarang(e.target.value)} style={{...sharedInputStyle, cursor:"pointer", padding:"13px 16px"}}>
                <option value="Paket / Barang">📦 Paket / Barang</option>
                <option value="Dokumen / Surat">✉️ Dokumen / Surat</option>
                <option value="Makanan / Minuman">🍔 Makanan / Minuman</option>
              </select>
            </div>

            <div style={{ position: "relative" }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>Karyawan Penerima *</label>
              <input type="text" placeholder="Ketik nama karyawan..." value={penerima} onChange={(e) => { setPenerima(e.target.value); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} style={{...sharedInputStyle, border: "2px solid #63b3ed", background: "#ebf8ff", color: "#2b6cb0", fontWeight: "bold"}} required />
              
              {showDropdown && penerima && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", marginTop: "5px", zIndex: 50, maxHeight: "200px", overflowY: "auto", boxShadow: "0 10px 15px rgba(0,0,0,0.1)" }}>
                  {filteredKaryawan.length > 0 ? filteredKaryawan.map((emp, idx) => (
                    <div key={idx} onClick={() => pilihKaryawan(emp)} style={{ padding: "12px", borderBottom: "1px solid #edf2f7", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseOver={(e) => e.currentTarget.style.background = "#f8fafc"} onMouseOut={(e) => e.currentTarget.style.background = "white"}>
                      <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "13px" }}>{emp.nama}</span>
                      <span style={{ fontSize: "11px", color: "#718096", background: "#edf2f7", padding: "2px 8px", borderRadius: "8px" }}>{emp.departemen}</span>
                    </div>
                  )) : (
                    <div style={{ padding: "12px", color: "#a0aec0", textAlign: "center", fontSize: "12px" }}>Nama tidak ditemukan.</div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>Nama Kurir / Ekspedisi *</label>
              <input type="text" placeholder="Cth: JNE, GoSend, SiCepat..." value={kurir} onChange={(e) => setKurir(e.target.value)} style={sharedInputStyle} required />
            </div>

            <div style={{ background: "#f8fafc", padding: "25px 20px", borderRadius: "16px", border: "2px dashed #cbd5e0", textAlign: "center" }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "12px", fontSize: "13px", color: "#4a5568" }}>📸 Bukti Fisik Paket</label>
              
              {previewUrl ? (
                <div style={{ position: "relative", display: "inline-block" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Preview" style={{ height: "150px", borderRadius: "10px", border: "1px solid #cbd5e0", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} />
                  <button type="button" onClick={() => { setPreviewUrl(""); }} style={{ position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "white", border: "none", borderRadius: "50%", width: "25px", height: "25px", cursor: "pointer", fontWeight: "bold", fontSize:"12px", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>✖</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: "none" }} id="fileInput" />
                  <label htmlFor="fileInput" style={{ padding: "12px 18px", background: "white", border: "1px solid #cbd5e0", borderRadius: "10px", cursor: "pointer", fontSize: "13px", fontWeight: "bold", color: "#4a5568", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                    <span>📁</span> Galeri
                  </label>
                  <button type="button" onClick={startCamera} style={{ padding: "12px 18px", background: "white", border: "1px solid #cbd5e0", borderRadius: "10px", cursor: "pointer", fontSize: "13px", fontWeight: "bold", color: "#4a5568", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                    <span>📷</span> Kamera
                  </button>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>Keterangan Tambahan / No. Resi</label>
              <textarea placeholder="Opsional..." value={keterangan} onChange={(e) => setKeterangan(e.target.value)} style={{ ...sharedInputStyle, height: "80px", resize: "vertical" }} />
            </div>

            <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "16px", background: isLoading ? "#a0aec0" : "#e53e3e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "10px", boxShadow: isLoading ? "none" : "0 10px 15px -3px rgba(229, 62, 62, 0.3)", transition: "0.2s" }}>
              {isLoading ? "Mengunggah Data..." : "✔️ Simpan Log Paket"}
            </button>
          </form>
        </div>

        {/* ============================================================== */}
        {/* KOLOM KANAN: DAFTAR PAKET */}
        {/* ============================================================== */}
        <div style={{ flex: "2 1 500px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <h3 style={{ margin: 0, color: "#2d3748", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📦</span> Riwayat Paket
            </h3>
            <input 
              type="text" 
              placeholder="🔍 Cari penerima / kurir..." 
              value={searchTabel}
              onChange={(e) => setSearchTabel(e.target.value)}
              style={{ ...sharedInputStyle, padding: "12px 16px", borderRadius: "20px", width: "250px" }}
            />
          </div>

          <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                  <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Barang</th>
                  <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Penerima</th>
                  <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Kurir</th>
                  <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Tiba</th>
                  <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paketTerfilter.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "#a0aec0", padding: "40px 20px" }}>
                      <div style={{ fontSize: "30px", marginBottom: "10px" }}>📭</div>
                      Belum ada pergerakan paket.
                    </td>
                  </tr>
                ) : (
                  paketTerfilter.map((pkt) => (
                    <tr key={pkt.id} style={{ borderBottom: "1px solid #edf2f7", background: pkt.status === "Sudah Diambil" ? "#fbfcfd" : "white" }}>
                      
                      <td style={{ padding: "12px 15px", display: "flex", alignItems: "center", gap: "10px" }}>
                        {pkt.foto_bukti_url ? (
                          <a href={pkt.foto_bukti_url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pkt.foto_bukti_url} alt="Foto" style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e0" }} />
                          </a>
                        ) : (
                          <div style={{ width: "40px", height: "40px", background: "#edf2f7", borderRadius: "8px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "16px" }}>📦</div>
                        )}
                        <span style={{ fontWeight: "bold", color: "#4a5568" }}>{pkt.jenis_barang}</span>
                      </td>

                      <td style={{ padding: "12px 15px", color: "#2b6cb0", fontWeight: "900" }}>{pkt.penerima}</td>
                      <td style={{ padding: "12px 15px", color: "#718096" }}>{pkt.kurir}</td>
                      <td style={{ padding: "12px 15px", color: "#4a5568" }}>{formatWaktu(pkt.waktu_diterima)}</td>
                      
                      <td style={{ padding: "12px 15px", textAlign: "center" }}>
                        {pkt.status === "Belum Diambil" ? (
                          <button 
                            onClick={() => handleDiambil(pkt.id, pkt.penerima)}
                            style={{ padding: "8px 14px", background: "#dd6b20", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "11px", fontWeight: "bold", boxShadow: "0 4px 6px rgba(221,107,32,0.2)" }}
                          >
                            Serahkan ➔
                          </button>
                        ) : (
                          <div>
                            <span style={{ background: "#c6f6d5", color: "#22543d", padding: "6px 10px", borderRadius: "8px", fontSize: "10px", fontWeight: "bold" }}>✓ DIAMBIL</span>
                            <div style={{ fontSize: "10px", color: "#a0aec0", marginTop: "6px", fontWeight:"bold" }}>{formatWaktu(pkt.waktu_diambil)}</div>
                          </div>
                        )}
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* 🔹 OVERLAY KAMERA (Layar Penuh) */}
      {isCameraActive && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.95)", zIndex: 100, display: "flex", flexDirection: "column", backdropFilter: "blur(10px)" }}>
          <div style={{ padding: "20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontWeight: "bold", fontSize: "16px", display: "flex", alignItems: "center", gap: "10px" }}><span>📸</span> Foto Fisik Paket</span>
            <button onClick={stopCamera} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: "40px", height: "40px", borderRadius: "50%", fontSize: "18px", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center" }}>✖</button>
          </div>
          
          <div style={{ flex: 1, position: "relative", display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
            <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80%", maxWidth: "400px", height: "60%", border: "3px dashed rgba(255,255,255,0.7)", borderRadius: "16px", boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}></div>
          </div>
          
          <div style={{ padding: "40px", display: "flex", justifyContent: "center", background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)" }}>
            <button onClick={capturePhoto} style={{ width: "80px", height: "80px", borderRadius: "50%", background: "white", border: "6px solid rgba(255,255,255,0.3)", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.5)", transition: "transform 0.1s" }} onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.9)"} onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}></button>
          </div>
        </div>
      )}

    </div>
  );
}