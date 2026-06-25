"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

export default function BroadcastAdminPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  // State untuk form
  const [teksPengumuman, setTeksPengumuman] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // State untuk preview data aktual di database
  const [liveTeks, setLiveTeks] = useState("");
  const [liveStatus, setLiveStatus] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("-");

  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    const dept = localStorage.getItem("pic_dept");

    if (!nama || dept !== "Admin GA") {
      router.push("/shift-checkin");
      return;
    }
    
    setTimeout(() => {
      setAdminName(nama);
      setIsReady(true);
    }, 0);

    // Menarik data pengumuman secara real-time dari Firestore
    const unsub = onSnapshot(doc(db, "settings", "pengumuman"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLiveTeks(data.teks || "");
        setLiveStatus(data.is_active || false);
        
        // Update form agar sama dengan database saat pertama kali load
        setTeksPengumuman(data.teks || "");
        setIsActive(data.is_active || false);

        if (data.updated_at) {
          setLastUpdate(new Date(data.updated_at.toDate()).toLocaleString("id-ID", { 
            day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" 
          }));
        }
      }
    });

    return () => unsub();
  }, [router]);

  const handleSimpan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await setDoc(doc(db, "settings", "pengumuman"), {
        teks: teksPengumuman,
        is_active: isActive,
        updated_at: serverTimestamp(),
        updated_by: adminName
      });
      alert("✅ Pengumuman berhasil diupdate dan disiarkan ke Ticker Utama!");
    } catch (error) {
      console.error(error);
      alert("❌ Gagal menyimpan pengumuman.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMatikan = async () => {
    if (!window.confirm("Yakin ingin mematikan pengumuman saat ini?")) return;
    setIsLoading(true);
    try {
      await setDoc(doc(db, "settings", "pengumuman"), {
        teks: liveTeks, // Tetap simpan teksnya agar tidak hilang
        is_active: false, // Hanya matikan statusnya
        updated_at: serverTimestamp(),
        updated_by: adminName
      });
    } catch (error) {
      console.error(error);
      alert("❌ Gagal mematikan pengumuman.");
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
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Admin Desk</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PENGUMUMAN GEDUNG</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Atur teks berjalan (News Ticker) pada Halaman Utama SIBM</p>
      </div>

      <div style={{ maxWidth: "800px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* KARTU PREVIEW LIVE */}
        <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", marginBottom: "25px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
            <h2 style={{ margin: 0, color: "#2d3748", fontSize: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{background:"#fefcbf", padding:"8px", borderRadius:"10px", fontSize: "18px"}}>📺</span> Live Preview Saat Ini
            </h2>
            <span style={{ padding: "6px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: "bold", background: liveStatus ? "#c6f6d5" : "#e2e8f0", color: liveStatus ? "#22543d" : "#4a5568" }}>
              {liveStatus ? "🟢 AKTIF TAYANG" : "⚪ TIDAK AKTIF"}
            </span>
          </div>

          <div style={{ background: "#1a202c", color: "white", padding: "15px 20px", borderRadius: "12px", fontFamily: "monospace", fontSize: "14px", letterSpacing: "0.5px", lineHeight: "1.5", borderLeft: liveStatus ? "5px solid #38a169" : "5px solid #a0aec0" }}>
            {liveStatus ? `📢 INFO GA: ${liveTeks}` : "Tidak ada pengumuman yang sedang disiarkan."}
          </div>
          <div style={{ fontSize: "11px", color: "#a0aec0", marginTop: "10px", textAlign: "right", fontWeight: "bold" }}>
            Terakhir diupdate: {lastUpdate}
          </div>
        </div>

        {/* KARTU FORM EDIT */}
        <div style={{ background: "white", padding: "30px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
          <h2 style={{ margin: "0 0 20px 0", color: "#1a202c", fontSize: "18px", fontWeight: "bold" }}>✏️ Buat / Edit Pengumuman</h2>
          
          <form onSubmit={handleSimpan} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "bold", color: "#4a5568", marginBottom: "8px", display: "block" }}>Isi Teks Pengumuman *</label>
              <textarea 
                required 
                placeholder="Contoh: Pemeliharaan AC sentral dijadwalkan pada hari Sabtu pukul 10:00 WITA. Mohon matikan PC sebelum pulang..." 
                value={teksPengumuman} 
                onChange={(e) => setTeksPengumuman(e.target.value)} 
                style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", minHeight: "100px", resize: "vertical", outline: "none", boxSizing: "border-box" }} 
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "15px", background: "#f8fafc", padding: "15px", borderRadius: "12px", border: "1px solid #edf2f7" }}>
              <input 
                type="checkbox" 
                id="aktifkan" 
                checked={isActive} 
                onChange={(e) => setIsActive(e.target.checked)} 
                style={{ width: "20px", height: "20px", cursor: "pointer" }} 
              />
              <label htmlFor="aktifkan" style={{ fontSize: "14px", fontWeight: "bold", color: "#2d3748", cursor: "pointer", userSelect: "none" }}>
                Siarkan Sekarang (Aktifkan di Ticker Halaman Utama)
              </label>
            </div>

            <div style={{ display: "flex", gap: "15px", marginTop: "10px" }}>
              {liveStatus && (
                <button type="button" onClick={handleMatikan} disabled={isLoading} style={{ flex: 1, padding: "16px", background: "white", color: "#e53e3e", border: "2px solid #fed7d7", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isLoading ? "not-allowed" : "pointer", transition: "0.2s" }}>
                  Hentikan Siaran ⏹️
                </button>
              )}
              <button type="submit" disabled={isLoading} style={{ flex: 2, padding: "16px", background: isLoading ? "#a0aec0" : "#3182ce", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isLoading ? "not-allowed" : "pointer", boxShadow: isLoading ? "none" : "0 10px 15px -3px rgba(49, 130, 206, 0.3)", transition: "0.2s" }}>
                {isLoading ? "Menyimpan..." : "Simpan & Terapkan 🚀"}
              </button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
}