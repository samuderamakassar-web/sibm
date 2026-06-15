"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../../lib/firebase"; // Sesuaikan path jika berbeda

const DAFTAR_LANTAI = ["Area Basement", "Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Lantai 5", "Pelayanan Khusus OB"];

export default function PlottingTugasPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [stafOb, setStafOb] = useState<string[]>([]);
  const [plotData, setPlotData] = useState<Record<string, string>>({});
  const [statusStaf, setStatusStaf] = useState<Record<string, string>>({});
  
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      
      if (!nama || (!nama.includes("Hilal") && !nama.includes("Koordinator"))) {
        alert("Akses Ditolak! Halaman ini khusus Koordinator OB & CS.");
        router.push("/dashboard/ob");
        return;
      }

      // 1. Tarik Data Staf OB & CS dari Users Master
      try {
        const q = query(collection(db, "users_master"), where("departemen", "==", "OB & CS"));
        const snap = await getDocs(q);
        const stafNames: string[] = [];
        const initStatus: Record<string, string> = {};
        
        snap.forEach(doc => {
          const data = doc.data();
          stafNames.push(data.nama);
          initStatus[data.nama] = "Hadir / On Duty"; // Default Status
        });
        setStafOb(stafNames);

        // 2. Ambil data plotting & status yang sudah ada hari ini (jika ada)
        const plotRef = doc(db, "daily_plots", today);
        const plotSnap = await getDoc(plotRef);
        if (plotSnap.exists()) {
          const data = plotSnap.data();
          setPlotData(data.plot_lantai || {});
          setStatusStaf(data.status_staf || initStatus);
        } else {
          setStatusStaf(initStatus);
        }
      } catch (error) {
        console.error("Gagal memuat data:", error);
      }

      setIsReady(true);
    };

    siapkanHalaman();
  }, [router, today]);

  const handlePlotChange = (lantai: string, namaStaf: string) => {
    setPlotData((prev) => ({ ...prev, [lantai]: namaStaf }));
  };

  const handleStatusChange = (namaStaf: string, status: string) => {
    setStatusStaf((prev) => ({ ...prev, [namaStaf]: status }));
  };

  const handleSimpanPlot = async () => {
    setIsLoading(true);
    setIsSuccess(false);
    try {
      const plotRef = doc(db, "daily_plots", today);
      await setDoc(plotRef, {
        tanggal: today,
        dibuat_oleh: localStorage.getItem("pic_nama"),
        waktu_update: serverTimestamp(),
        plot_lantai: plotData,
        status_staf: statusStaf // Menyimpan status kehadiran
      }, { merge: true });

      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000); 
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Gagal simpan:", error);
      alert("Gagal menyimpan plot tugas.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isReady) return null;

  // Opsi dropdown untuk plotting lantai
  const dropdownStaf = [...stafOb, "Semua / All"];

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto", background: "#f7fafc", minHeight: "100vh" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button onClick={() => router.push("/dashboard/ob")} style={{ padding: "8px 12px", background: "#e2e8f0", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", color: "#4a5568" }}>
          ⬅ Kembali
        </button>
        <div style={{ fontSize: "13px", fontWeight: "bold", color: "#2b6cb0", background: "#ebf8ff", padding: "5px 10px", borderRadius: "20px" }}>
          👑 Koordinator Area
        </div>
      </div>

      <div style={{ background: "white", padding: "25px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
        
        {isSuccess && (
          <div style={{ background: "#c6f6d5", color: "#22543d", padding: "12px", borderRadius: "6px", marginBottom: "20px", fontWeight: "bold", fontSize: "14px", textAlign: "center" }}>
            ✓ Plotting lokasi & status kehadiran berhasil diterbitkan!
          </div>
        )}

        {/* SECTION 1: STATUS KEHADIRAN */}
        <h2 style={{ margin: "0 0 5px 0", color: "#dd6b20", fontSize: "18px" }}>🩺 Status Kehadiran Tim</h2>
        <p style={{ margin: "0 0 15px 0", color: "#718096", fontSize: "13px" }}>Tandai jika ada staf yang tidak masuk hari ini.</p>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "30px" }}>
          {stafOb.map((staf) => (
            <div key={staf} style={{ background: "#fffaf0", padding: "10px", borderRadius: "6px", border: "1px solid #feebc8" }}>
              <div style={{ fontSize: "13px", fontWeight: "bold", color: "#2d3748", marginBottom: "5px" }}>{staf}</div>
              <select 
                value={statusStaf[staf] || "Hadir / On Duty"} 
                onChange={(e) => handleStatusChange(staf, e.target.value)}
                style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e0", fontSize: "12px", background: statusStaf[staf]?.includes("Hadir") ? "#c6f6d5" : "#fed7d7", fontWeight: "bold" }}
              >
                <option value="Hadir / On Duty">🟢 Hadir / On Duty</option>
                <option value="Sakit">🔴 Sakit</option>
                <option value="Izin">🟠 Izin</option>
                <option value="Cuti">🔵 Cuti</option>
                <option value="Off / Libur">⚫ Off / Libur</option>
              </select>
            </div>
          ))}
        </div>

        <hr style={{ border: "1px dashed #e2e8f0", marginBottom: "30px" }} />

        {/* SECTION 2: PLOTTING LANTAI */}
        <h2 style={{ margin: "0 0 5px 0", color: "#2c5282", fontSize: "18px" }}>🗺️ Plotting Lokasi Tugas</h2>
        <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Tentukan penempatan area kerja untuk staf yang <strong>Hadir</strong> hari ini.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {DAFTAR_LANTAI.map((lantai) => (
            <div key={lantai} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#edf2f7", padding: "12px 15px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontWeight: "bold", color: "#2d3748", flex: "1", fontSize: "14px" }}>📍 {lantai}</span>
              
              <select 
                value={plotData[lantai] || ""}
                onChange={(e) => handlePlotChange(lantai, e.target.value)}
                style={{ width: "220px", padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e0", cursor: "pointer", fontWeight: plotData[lantai] ? "bold" : "normal", color: plotData[lantai] === "Semua / All" ? "#e53e3e" : plotData[lantai] ? "#2b6cb0" : "#a0aec0" }}
              >
                <option value="" disabled>-- Pilih Staf --</option>
                {dropdownStaf.map((staf) => (
                  <option key={staf} value={staf}>{staf}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <button 
          onClick={handleSimpanPlot} disabled={isLoading}
          style={{ width: "100%", padding: "15px", background: isLoading ? "#a0aec0" : "#2c5282", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "30px" }}
        >
          {isLoading ? "Menyimpan Data..." : "💾 Simpan & Berlakukan Plotting"}
        </button>

      </div>
    </div>
  );
}