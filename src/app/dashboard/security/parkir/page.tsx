"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

// Daftar Mobil Operasional SIBM (Silakan sesuaikan dengan plat asli di lapangan)
const KENDARAAN_OPERASIONAL = [
  "Avanza Hitam - DD 1234 AA",
  "Innova Reborn Hitam - DD 5678 BB",
  "Hilux Putih - DD 9999 CC",
  "Grand Max (Operasional OB) - DD 1111 XX"
];

// Daftar Driver SIBM
const DAFTAR_DRIVER = [
  "Amal Setiawan",
  "Muhammad Renaldy",
  "Tanpa Driver (Dibawa Karyawan/Pimpinan Langsung)"
];

export default function LogOperasionalPage() {
  const router = useRouter();
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // State Form Log Kendaraan
  const [kendaraan, setKendaraan] = useState<string>(KENDARAAN_OPERASIONAL[0]);
  const [statusMobil, setStatusMobil] = useState<string>("Keluar Beroperasi");
  const [driver, setDriver] = useState<string>(DAFTAR_DRIVER[0]);
  const [tujuan, setTujuan] = useState<string>("");
  const [kilometer, setKilometer] = useState<string>("");

  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      if (!nama) {
        router.push("/shift-checkin");
        return;
      }
      setPicName(nama);
      setIsReady(true);
    };
    siapkanHalaman();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validasi tambahan jika mobil keluar, wajib isi tujuan
    if (statusMobil === "Keluar Beroperasi" && !tujuan.trim()) {
      alert("Tujuan/Keperluan wajib diisi jika kendaraan keluar!");
      return;
    }

    setIsLoading(true);
    setIsSuccess(false);

    try {
      await addDoc(collection(db, "operational_vehicle_logs"), {
        petugas_security: picName,
        waktu_catat: serverTimestamp(),
        kendaraan: kendaraan,
        status_kendaraan: statusMobil,
        driver_bertugas: driver,
        tujuan_keperluan: tujuan || "-",
        kilometer_kendaraan: kilometer || "Tidak dicatat",
      });

      setIsSuccess(true);
      
      // Reset form ringan
      setTujuan("");
      setKilometer("");
      
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Gagal menyimpan log:", error);
      alert("Gagal mengirim data. Silakan coba lagi.");
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
          onClick={() => router.push("/dashboard/security")}
          style={{ padding: "8px 12px", background: "#e2e8f0", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", color: "#4a5568" }}
        >
          ⬅ Kembali
        </button>
        <div style={{ fontSize: "13px", fontWeight: "bold", color: "#553c9a", background: "#faf5ff", padding: "5px 10px", borderRadius: "20px", border: "1px solid #d6bcfa" }}>
          👮 {picName}
        </div>
      </div>

      <div style={{ background: "white", padding: "25px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: "0 0 10px 0", color: "#6b46c1" }}>🚙 Log Kendaraan Operasional</h2>
        <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "14px", lineHeight: "1.5" }}>
          Pantau pergerakan mobil operasional SIBM. Data ini akan menentukan status <strong style={{ color: "#3182ce" }}>Standby / Keluar</strong> para Driver.
        </p>

        {isSuccess && (
          <div style={{ background: "#c6f6d5", color: "#22543d", padding: "12px", borderRadius: "6px", marginBottom: "20px", fontWeight: "bold", fontSize: "14px", border: "1px solid #9ae6b4" }}>
            ✓ Status kendaraan & driver berhasil diperbarui di sistem!
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          
          {/* PILIH KENDARAAN */}
          <div>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", color: "#2d3748", fontSize: "14px" }}>Pilih Mobil Operasional:</label>
            <select 
              value={kendaraan} 
              onChange={(e) => setKendaraan(e.target.value)}
              style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0", fontWeight: "bold", color: "#2c5282", background: "#ebf8ff" }}
            >
              {KENDARAAN_OPERASIONAL.map(mobil => (
                <option key={mobil} value={mobil}>{mobil}</option>
              ))}
            </select>
          </div>

          {/* STATUS PERGERAKAN */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {["Keluar Beroperasi", "Tiba di Kantor (Standby)", "Masuk Bengkel / Service"].map((status) => (
              <div 
                key={status}
                onClick={() => setStatusMobil(status)}
                style={{
                  padding: "12px",
                  borderRadius: "6px",
                  border: statusMobil === status ? "2px solid #6b46c1" : "1px solid #cbd5e0",
                  background: statusMobil === status ? "#faf5ff" : "#fff",
                  color: statusMobil === status ? "#553c9a" : "#4a5568",
                  fontWeight: "bold",
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "center",
                  gridColumn: status === "Masuk Bengkel / Service" ? "span 2" : "span 1"
                }}
              >
                {status === "Keluar Beroperasi" ? "🛫 Keluar" : status === "Tiba di Kantor (Standby)" ? "🛬 Tiba (Standby)" : "🛠️ Masuk Bengkel"}
              </div>
            ))}
          </div>

          {/* DRIVER YANG MEMBAWA */}
          <div style={{ marginTop: "5px" }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", color: "#2d3748", fontSize: "14px" }}>Siapa yang Membawa / Driver?</label>
            <select 
              value={driver} 
              onChange={(e) => setDriver(e.target.value)}
              style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0", fontWeight: driver.includes("Tanpa") ? "normal" : "bold" }}
            >
              {DAFTAR_DRIVER.map(drv => (
                <option key={drv} value={drv}>{drv}</option>
              ))}
            </select>
          </div>

          {/* TUJUAN & KEPERLUAN */}
          <div>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", color: "#2d3748", fontSize: "14px" }}>Tujuan / Keperluan:</label>
            <textarea 
              placeholder={statusMobil === "Keluar Beroperasi" ? "Wajib diisi. Contoh: Mengantar Pak GM ke Bandara..." : "Contoh: Selesai antar dari Bandara, mobil dicuci..."}
              value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              style={{ width: "100%", padding: "12px", height: "70px", borderRadius: "6px", border: "1px solid #cbd5e0", resize: "none" }}
            />
          </div>

          {/* KILOMETER */}
          <div>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", color: "#2d3748", fontSize: "14px" }}>Speedometer (KM) - Opsional:</label>
            <input 
              type="number" 
              placeholder="Contoh: 45020" 
              value={kilometer}
              onChange={(e) => setKilometer(e.target.value)}
              style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0" }}
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            style={{ 
              width: "100%", 
              padding: "15px", 
              background: isLoading ? "#b794f4" : "#6b46c1", 
              color: "white", 
              border: "none", 
              borderRadius: "6px", 
              fontWeight: "bold", 
              fontSize: "16px",
              cursor: isLoading ? "not-allowed" : "pointer",
              marginTop: "10px"
            }}
          >
            {isLoading ? "Memperbarui Status..." : "📥 Simpan Status Pergerakan"}
          </button>

        </form>
      </div>
    </div>
  );
}