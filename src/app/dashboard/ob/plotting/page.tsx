"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc, collection, query, where, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
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
  
  // Rentang Tanggal (Bisa harian atau mingguan)
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    const siapkanHalaman = async () => {
      // PERBAIKAN GEMBOK KEAMANAN: Sangat toleran mengenali Koordinator & Hilal
      const nama = (localStorage.getItem("pic_nama") || "").toLowerCase();
      const role = (localStorage.getItem("pic_role") || "").toLowerCase();
      
      const isAuthorized = 
        nama.includes("hilal") || 
        nama.includes("kord") || 
        nama.includes("koordinator") || 
        role.includes("admin") || 
        role.includes("kord") ||
        role.includes("koordinator");

      if (!isAuthorized) {
        alert("Akses Ditolak! Halaman ini khusus Koordinator OB & CS.");
        router.push("/dashboard"); 
        return;
      }

      try {
        const q = query(collection(db, "users_master"), where("departemen", "==", "OB & CS"));
        const snap = await getDocs(q);
        const stafNames: string[] = [];
        const initStatus: Record<string, string> = {};
        
        snap.forEach(d => {
          const data = d.data();
          stafNames.push(data.nama);
          initStatus[data.nama] = "Hadir / On Duty";
        });
        setStafOb(stafNames);

        // Ambil template dari tanggal mulai
        const plotRef = doc(db, "daily_plots", startDate);
        const plotSnap = await getDoc(plotRef);
        if (plotSnap.exists()) {
          const data = plotSnap.data();
          setPlotData(data.plot_lantai || {});
          setStatusStaf(data.status_staf || initStatus);
        } else {
          setPlotData({});
          setStatusStaf(initStatus);
        }
      } catch (error) {
        console.error("Gagal memuat data:", error);
      }

      setIsReady(true);
    };

    siapkanHalaman();
  }, [router, startDate]); 

  const handlePlotChange = (lantai: string, namaStaf: string) => {
    setPlotData((prev) => ({ ...prev, [lantai]: namaStaf }));
  };

  const handleStatusChange = (namaStaf: string, status: string) => {
    setStatusStaf((prev) => ({ ...prev, [namaStaf]: status }));
  };

  const getDatesInRange = (start: string, end: string) => {
    const dateArray = [];
    const currentDate = new Date(start);
    const stopDate = new Date(end);
    while (currentDate <= stopDate) {
      dateArray.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dateArray;
  };

  const handleSimpanPlot = async () => {
    if (new Date(endDate) < new Date(startDate)) {
      return alert("Tanggal Akhir tidak boleh mendahului Tanggal Mulai!");
    }

    setIsLoading(true);
    setIsSuccess(false);
    
    try {
      const datesToUpdate = getDatesInRange(startDate, endDate);
      const batch = writeBatch(db); 

      datesToUpdate.forEach(dateStr => {
        const plotRef = doc(db, "daily_plots", dateStr);
        batch.set(plotRef, {
          tanggal: dateStr,
          dibuat_oleh: localStorage.getItem("pic_nama") || "Koordinator OB",
          waktu_update: serverTimestamp(),
          plot_lantai: plotData,
          status_staf: statusStaf
        }, { merge: true });
      });

      await batch.commit(); 

      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 4000); 
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Gagal simpan:", error);
      alert("Gagal menyimpan plot tugas.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isReady) return null;

  const dropdownStaf = [...stafOb, "Semua / All"];
  const totalHari = getDatesInRange(startDate, endDate).length;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Tombol kembali diarahkan ke dashboard atau history router sebelumnya */}
          <button onClick={() => router.back()} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 Panel Koordinator
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #234e52 0%, #319795 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(49, 151, 149, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>MANAJEMEN ROSTER OB</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Pengaturan plotting lantai dan presensi tim kebersihan</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "900px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ background: "white", padding: "30px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          
          {isSuccess && (
            <div style={{ background: "#c6f6d5", color: "#22543d", padding: "15px", borderRadius: "12px", marginBottom: "25px", fontWeight: "bold", fontSize: "14px", textAlign: "center", border: "1px solid #9ae6b4", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              <span>✅</span> Plotting untuk {totalHari} hari berhasil diterbitkan ke sistem!
            </div>
          )}

          {/* SECTION 0: RENTANG WAKTU (MINGGUAN/HARIAN) */}
          <div style={{ background: "#f7fafc", padding: "20px", borderRadius: "16px", marginBottom: "30px", border: "1px solid #e2e8f0" }}>
            <h2 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              📅 Tentukan Rentang Waktu
            </h2>
            <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px" }}>Dari Tanggal (Mulai)</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", cursor: "pointer" }} />
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px" }}>Sampai Tanggal (Akhir)</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", cursor: "pointer" }} />
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "#718096", marginTop: "10px", fontStyle: "italic" }}>
              *Tips: Pilih rentang waktu 7 hari, lalu atur staf di bawah. Saat disimpan, jadwal akan otomatis tersalin ke {totalHari} hari tersebut.
            </div>
          </div>

          {/* SECTION 1: STATUS KEHADIRAN */}
          <h2 style={{ margin: "0 0 5px 0", color: "#dd6b20", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🩺</span> Status Kehadiran Tim
          </h2>
          <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Setelan default kehadiran untuk rentang waktu yang dipilih.</p>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "15px", marginBottom: "40px" }}>
            {stafOb.map((staf) => (
              <div key={staf} style={{ background: "white", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                <div style={{ fontSize: "14px", fontWeight: "bold", color: "#2d3748", marginBottom: "8px" }}>{staf}</div>
                <select 
                  value={statusStaf[staf] || "Hadir / On Duty"} 
                  onChange={(e) => handleStatusChange(staf, e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: statusStaf[staf]?.includes("Hadir") ? "1px solid #9ae6b4" : "1px solid #feb2b2", fontSize: "13px", background: statusStaf[staf]?.includes("Hadir") ? "#f0fff4" : "#fff5f5", color: statusStaf[staf]?.includes("Hadir") ? "#22543d" : "#9c4221", fontWeight: "bold", cursor: "pointer" }}
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

          <hr style={{ border: "0", borderTop: "2px dashed #edf2f7", marginBottom: "30px" }} />

          {/* SECTION 2: PLOTTING LANTAI */}
          <h2 style={{ margin: "0 0 5px 0", color: "#319795", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🗺️</span> Plotting Lokasi Tugas
          </h2>
          <p style={{ margin: "0 0 25px 0", color: "#718096", fontSize: "13px" }}>Tentukan area kerja masing-masing staf.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {DAFTAR_LANTAI.map((lantai) => (
              <div key={lantai} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "15px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", gap: "10px" }}>
                <span style={{ fontWeight: "bold", color: "#2d3748", flex: "1 1 200px", fontSize: "15px" }}>📍 {lantai}</span>
                
                <select 
                  value={plotData[lantai] || ""}
                  onChange={(e) => handlePlotChange(lantai, e.target.value)}
                  style={{ flex: "1 1 200px", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e0", cursor: "pointer", fontWeight: plotData[lantai] ? "bold" : "normal", background: "white", color: plotData[lantai] === "Semua / All" ? "#e53e3e" : plotData[lantai] ? "#319795" : "#a0aec0", fontSize: "14px" }}
                >
                  <option value="" disabled>-- Belum Ditugaskan --</option>
                  {dropdownStaf.map((staf) => (
                    <option key={staf} value={staf}>{staf}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button 
            onClick={handleSimpanPlot} disabled={isLoading}
            style={{ width: "100%", padding: "18px", background: isLoading ? "#a0aec0" : "#319795", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "40px", boxShadow: isLoading ? "none" : "0 4px 6px rgba(49,151,149,0.3)", transition: "0.2s" }}
          >
            {isLoading ? "Menyimpan ke Database..." : `💾 Simpan untuk ${totalHari} Hari`}
          </button>

        </div>
      </div>
    </div>
  );
}