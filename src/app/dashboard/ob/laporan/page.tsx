"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

export default function LaporanKerusakanPage() {
  const router = useRouter();
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // State Form Laporan
  const [lokasi, setLokasi] = useState<string>("");
  const [fasilitas, setFasilitas] = useState<string>("");
  const [deskripsi, setDeskripsi] = useState<string>("");
  const [urgensi, setUrgensi] = useState<string>("Sedang");

  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      if (!nama) {
        router.push("/shift-checkin");
      } else {
        setPicName(nama);
        setIsReady(true);
      }
    };
    siapkanHalaman();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);

    try {
      await addDoc(collection(db, "damage_reports"), {
        pelapor: picName,
        departemen_pelapor: "OB & CS",
        waktu_lapor: serverTimestamp(),
        lokasi: lokasi,
        fasilitas_rusak: fasilitas,
        deskripsi: deskripsi,
        urgensi: urgensi,
        status_perbaikan: "Menunggu Penanganan", // Default status untuk tim GA
      });

      setIsSuccess(true);
      // Reset form
      setLokasi("");
      setFasilitas("");
      setDeskripsi("");
      setUrgensi("Sedang");
      
    } catch (error) {
      console.error("Gagal mengirim laporan:", error);
      alert("Gagal mengirim laporan kerusakan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isReady) return null;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto", background: "#f7fafc", minHeight: "100vh" }}>
      
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button 
          onClick={() => router.push("/dashboard/ob")}
          style={{ padding: "8px 12px", background: "#e2e8f0", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", color: "#4a5568" }}
        >
          ⬅ Kembali
        </button>
        <div style={{ fontSize: "13px", fontWeight: "bold", color: "#c53030", background: "#fff5f5", padding: "5px 10px", borderRadius: "20px", border: "1px solid #feb2b2" }}>
          👤 {picName}
        </div>
      </div>

      <div style={{ background: "white", padding: "25px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: "0 0 10px 0", color: "#e53e3e" }}>🛠️ Laporan Kerusakan</h2>
        <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "14px", lineHeight: "1.5" }}>
          Segera laporkan jika Anda menemukan fasilitas gedung yang rusak, bocor, atau tidak berfungsi saat sedang bertugas.
        </p>

        {isSuccess && (
          <div style={{ background: "#c6f6d5", color: "#22543d", padding: "12px", borderRadius: "6px", marginBottom: "20px", fontWeight: "bold", fontSize: "14px" }}>
            ✓ Laporan kerusakan berhasil dikirim ke Admin/Teknisi!
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          
          <div>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", color: "#2d3748", fontSize: "14px" }}>Tingkat Urgensi:</label>
            <select 
              value={urgensi} 
              onChange={(e) => setUrgensi(e.target.value)}
              style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0", background: urgensi === "Tinggi / Bahaya" ? "#fff5f5" : "#fff" }}
            >
              <option value="Rendah">Rendah (Bisa ditunda)</option>
              <option value="Sedang">Sedang (Perlu segera diperbaiki)</option>
              <option value="Tinggi / Bahaya">Tinggi / Bahaya (Risiko keselamatan / Darurat!)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", color: "#2d3748", fontSize: "14px" }}>Lokasi Detail:</label>
            <input 
              type="text" 
              placeholder="Contoh: Toilet Pria Lantai 2, Pantry Lt 1..." 
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              required
              style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", color: "#2d3748", fontSize: "14px" }}>Fasilitas / Barang yang Rusak:</label>
            <input 
              type="text" 
              placeholder="Contoh: Keran Wastafel, Lampu Plafon, AC..." 
              value={fasilitas}
              onChange={(e) => setFasilitas(e.target.value)}
              required
              style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", color: "#2d3748", fontSize: "14px" }}>Deskripsi Kerusakan:</label>
            <textarea 
              placeholder="Jelaskan kerusakannya. Contoh: Air keran menetes terus walau sudah ditutup rapat dan menyebabkan lantai licin." 
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              required
              style={{ width: "100%", padding: "12px", height: "100px", borderRadius: "6px", border: "1px solid #cbd5e0", resize: "none" }}
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            style={{ 
              width: "100%", 
              padding: "15px", 
              background: isLoading ? "#fc8181" : "#e53e3e", 
              color: "white", 
              border: "none", 
              borderRadius: "6px", 
              fontWeight: "bold", 
              fontSize: "16px",
              cursor: isLoading ? "not-allowed" : "pointer",
              marginTop: "10px"
            }}
          >
            {isLoading ? "Mengirim..." : "🚨 Kirim Laporan Kerusakan"}
          </button>

        </form>
      </div>
    </div>
  );
}