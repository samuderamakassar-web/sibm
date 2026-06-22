"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

export default function LaporanKerusakanPage() {
  const router = useRouter();
  
  const [picName, setPicName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // State Form Laporan
  const [lokasi, setLokasi] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [urgensi, setUrgensi] = useState("Sedang");
  const [fotoAwal, setFotoAwal] = useState<string>("");

  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      const dept = (localStorage.getItem("pic_dept") || "").toLowerCase();
      
      if (!nama || !dept.includes("ob & cs")) {
        alert("Akses Ditolak! Halaman ini khusus staf OB & CS.");
        router.push("/shift-checkin");
        return;
      }
      setPicName(nama);
      setIsReady(true);
    };
    siapkanHalaman();
  }, [router]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL("image/jpeg", 0.6); 
          setFotoAwal(base64);
        }
      };
      if (typeof ev.target?.result === 'string') img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);

    try {
      // PERBAIKAN: Disatukan dengan koleksi helpdesk_tickets agar masuk ke panel Admin GA
      await addDoc(collection(db, "helpdesk_tickets"), {
        nama_pelapor: picName,
        departemen: "OB & CS",
        waktu_lapor: serverTimestamp(),
        lokasi: lokasi,
        deskripsi: `[URGENSI: ${urgensi}] - ${deskripsi}`,
        foto_awal: fotoAwal,
        status: "Menunggu", // Status default Helpdesk
      });

      setIsSuccess(true);
      
      // Reset form
      setLokasi("");
      setDeskripsi("");
      setUrgensi("Sedang");
      setFotoAwal("");
      
      setTimeout(() => setIsSuccess(false), 4000);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Gagal mengirim laporan:", error);
      alert("Gagal mengirim laporan kerusakan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* TOMBOL KEMBALI FIXED KE /dashboard/ob */}
          <button onClick={() => router.push("/dashboard/ob")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#fff5f5", color: "#c53030", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #fed7d7" }}>
          👤 Pelapor: {picName}
        </div>
      </div>

      {/* 🔹 HERO SECTION (TEMA MERAH PERINGATAN) */}
      <div style={{ background: "linear-gradient(135deg, #9b2c2c 0%, #e53e3e 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>LAPOR KERUSAKAN</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Bantu jaga fasilitas gedung dengan melaporkan kerusakan secara cepat</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "700px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ background: "white", padding: "30px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          
          {isSuccess && (
            <div style={{ background: "#c6f6d5", color: "#22543d", padding: "15px", borderRadius: "12px", marginBottom: "25px", fontWeight: "bold", fontSize: "14px", textAlign: "center", border: "1px solid #9ae6b4", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              <span>✅</span> Laporan kerusakan berhasil dikirim ke Admin GA / Teknisi!
            </div>
          )}

          <div style={{ marginBottom: "25px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px" }}>
            <h2 style={{ margin: "0 0 5px 0", color: "#c53030", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🚨</span> Formulir Temuan Fasilitas
            </h2>
            <p style={{ margin: 0, color: "#718096", fontSize: "13px", lineHeight: "1.5" }}>
              Segera laporkan jika Anda menemukan fasilitas gedung yang rusak, bocor, atau tidak berfungsi saat sedang membersihkan area.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* TINGKAT URGENSI */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: "bold", color: "#4a5568" }}>Tingkat Urgensi Penanganan</label>
              <select 
                value={urgensi} 
                onChange={(e) => setUrgensi(e.target.value)}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", border: urgensi.includes("Tinggi") ? "2px solid #fc8181" : "1px solid #cbd5e0", background: urgensi.includes("Tinggi") ? "#fff5f5" : "#f8fafc", fontSize: "14px", color: urgensi.includes("Tinggi") ? "#c53030" : "#2d3748", fontWeight: urgensi.includes("Tinggi") ? "bold" : "normal", outline: "none", cursor: "pointer" }}
              >
                <option value="Rendah">🟢 Rendah (Bisa ditunda / Tidak mengganggu)</option>
                <option value="Sedang">🟡 Sedang (Perlu segera diperbaiki tim teknisi)</option>
                <option value="Tinggi / Bahaya">🔴 Tinggi / Bahaya (Risiko keselamatan / Darurat!)</option>
              </select>
            </div>

            {/* LOKASI */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: "bold", color: "#4a5568" }}>Lokasi Detail Barang</label>
              <input 
                type="text" 
                placeholder="Contoh: Toilet Pria Lantai 2 (Wastafel Ujung)..." 
                value={lokasi}
                onChange={(e) => setLokasi(e.target.value)}
                required
                style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none" }}
              />
            </div>

            {/* DESKRIPSI */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: "bold", color: "#4a5568" }}>Jelaskan Kerusakannya</label>
              <textarea 
                placeholder="Contoh: Pipa bawah wastafel bocor deras, air meluap membasahi lantai dan sangat licin..." 
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                required
                style={{ width: "100%", padding: "14px", height: "120px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", resize: "none", outline: "none" }}
              />
            </div>

            {/* FOTO BUKTI */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: "bold", color: "#4a5568" }}>Foto Bukti Kerusakan (Opsional tapi disarankan)</label>
              <div style={{ background: "#f8fafc", border: "2px dashed #cbd5e0", padding: "20px", borderRadius: "16px", textAlign: "center", transition: "0.2s" }}>
                <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "30px" }}>📸</span>
                  <span style={{ fontSize: "13px", fontWeight: "bold", color: fotoAwal ? "#38a169" : "#4a5568" }}>
                    {fotoAwal ? "Foto siap dilampirkan! Klik untuk mengganti." : "Sentuh di sini untuk mengambil foto bukti"}
                  </span>
                  <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} style={{ display: "none" }} />
                </label>
                {fotoAwal && (
                  <div style={{ marginTop: "15px", position: "relative", display: "inline-block" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoAwal} alt="Preview" style={{ maxWidth: "100%", maxHeight: "200px", objectFit: "contain", borderRadius: "8px", border: "1px solid #e2e8f0" }} />
                    <button type="button" onClick={(e) => { e.preventDefault(); setFotoAwal(""); }} style={{ position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "white", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>✖</button>
                  </div>
                )}
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <button 
              type="submit" 
              disabled={isLoading}
              style={{ 
                width: "100%", 
                padding: "18px", 
                background: isLoading ? "#fc8181" : "#e53e3e", 
                color: "white", 
                border: "none", 
                borderRadius: "12px", 
                fontWeight: "bold", 
                fontSize: "16px",
                cursor: isLoading ? "not-allowed" : "pointer",
                marginTop: "10px",
                boxShadow: isLoading ? "none" : "0 10px 15px -3px rgba(229, 62, 62, 0.3)",
                transition: "all 0.3s"
              }}
            >
              {isLoading ? "Mengunggah Laporan..." : "🚨 KIRIM LAPORAN KERUSAKAN"}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}