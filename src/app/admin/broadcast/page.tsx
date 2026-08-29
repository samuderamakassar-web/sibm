"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

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
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .back-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px;
        }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge {
          display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info);
          padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2);
        }
        .admin-hero {
          position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff;
          padding: 34px 20px 50px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .admin-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .admin-hero-content { position: relative; }
      `}} />
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> {adminName}
        </div>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PENGUMUMAN GEDUNG</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Atur teks berjalan (News Ticker) pada Halaman Utama SIBM</p>
        </div>
      </div>

      <div style={{ maxWidth: "800px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* KARTU PREVIEW LIVE */}
        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", marginBottom: "25px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "2px solid var(--line)", paddingBottom: "10px" }}>
            <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{background:"var(--warn-50)", padding:"8px", borderRadius:"10px", fontSize: "18px"}}>📺</span> Live Preview Saat Ini
            </h2>
            <span style={{ padding: "6px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: "bold", background: liveStatus ? "var(--ok-50)" : "var(--line)", color: liveStatus ? "var(--ok)" : "var(--muted)" }}>
              {liveStatus ? "🟢 AKTIF TAYANG" : "⚪ TIDAK AKTIF"}
            </span>
          </div>

          <div style={{ background: "var(--ink)", color: "white", padding: "15px 20px", borderRadius: "12px", fontFamily: "monospace", fontSize: "14px", letterSpacing: "0.5px", lineHeight: "1.5", borderLeft: liveStatus ? "5px solid var(--ok)" : "5px solid var(--muted)" }}>
            {liveStatus ? `📢 INFO GA: ${liveTeks}` : "Tidak ada pengumuman yang sedang disiarkan."}
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "10px", textAlign: "right", fontWeight: "bold" }}>
            Terakhir diupdate: {lastUpdate}
          </div>
        </div>

        {/* KARTU FORM EDIT */}
        <div style={{ background: "var(--surface)", padding: "30px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid var(--line)" }}>
          <h2 style={{ margin: "0 0 20px 0", color: "var(--ink)", fontSize: "18px", fontWeight: "bold" }}>✏️ Buat / Edit Pengumuman</h2>

          <form onSubmit={handleSimpan} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "8px", display: "block" }}>Isi Teks Pengumuman *</label>
              <textarea
                required
                placeholder="Contoh: Pemeliharaan AC sentral dijadwalkan pada hari Sabtu pukul 10:00 WITA. Mohon matikan PC sebelum pulang..."
                value={teksPengumuman}
                onChange={(e) => setTeksPengumuman(e.target.value)}
                style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "14px", background: "var(--bg)", minHeight: "100px", resize: "vertical", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "15px", background: "var(--bg)", padding: "15px", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <input
                type="checkbox"
                id="aktifkan"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                style={{ width: "20px", height: "20px", cursor: "pointer" }}
              />
              <label htmlFor="aktifkan" style={{ fontSize: "14px", fontWeight: "bold", color: "var(--ink)", cursor: "pointer", userSelect: "none" }}>
                Siarkan Sekarang (Aktifkan di Ticker Halaman Utama)
              </label>
            </div>

            <div style={{ display: "flex", gap: "15px", marginTop: "10px" }}>
              {liveStatus && (
                <button type="button" onClick={handleMatikan} disabled={isLoading} style={{ flex: 1, padding: "16px", background: "var(--surface)", color: "var(--red-600)", border: "2px solid rgba(220,38,38,0.3)", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isLoading ? "not-allowed" : "pointer", transition: "0.2s" }}>
                  Hentikan Siaran ⏹️
                </button>
              )}
              <button type="submit" disabled={isLoading} style={{ flex: 2, padding: "16px", background: isLoading ? "var(--muted)" : "var(--info)", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isLoading ? "not-allowed" : "pointer", boxShadow: isLoading ? "none" : "0 10px 15px -3px rgba(37,99,235,0.3)", transition: "0.2s" }}>
                {isLoading ? "Menyimpan..." : "Simpan & Terapkan 🚀"}
              </button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
}