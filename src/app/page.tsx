"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs, Timestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";

// ==========================================
// 1. INTERFACE TYPESCRIPT
// ==========================================
interface KendaraanLog {
  kendaraan: string;
  status_kendaraan: string;
  driver_bertugas: string;
  tujuan_keperluan: string;
  waktu_catat?: Timestamp | null;
}

interface DataTamu {
  id: string;
  nama: string;
  instansi: string;
  tujuan: string;
  waktu_masuk?: Timestamp | null;
  waktu_keluar?: Timestamp | null;
}

interface DataPaket {
  id: string;
  penerima: string;
  kurir: string;
  waktu_diterima?: Timestamp | null;
  status: string;
}

// Interface baru untuk OB agar TypeScript tidak bingung
interface ObStatusData {
  nama: string;
  status: string;
  lokasi: string[];
}

export default function PortalSIBM() {
  const router = useRouter();

  // State Monitoring Real-time
  const [obBertugas, setObBertugas] = useState<ObStatusData[]>([]); // <-- Hanya ada 1 deklarasi di sini
  const [mobilStatus, setMobilStatus] = useState<KendaraanLog[]>([]);
  
  // State Modals (Mengambang)
  const [activeModal, setActiveModal] = useState<"none" | "login" | "tamu" | "paket">("none");
  
  // State Pencarian Modal
  const [searchQuery, setSearchQuery] = useState("");
  const [hasilTamu, setHasilTamu] = useState<DataTamu[]>([]);
  const [hasilPaket, setHasilPaket] = useState<DataPaket[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // State Form Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  const todayDate = new Date();
  const formatTgl = todayDate.toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const todayISO = todayDate.toISOString().split("T")[0];

  useEffect(() => {
    // Listener OB & CS (Membaca plot lantai & status absen)
    const plotRef = doc(db, "daily_plots", todayISO);
    const unsubPlot = onSnapshot(plotRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const plots = data.plot_lantai || {};
        const statuses = data.status_staf || {};
        
        const activeStaff = Object.keys(statuses);
        
        const mappedData = activeStaff.map(nama => {
          const lantaiDitugaskan = Object.keys(plots).filter(lantai => plots[lantai] === nama || plots[lantai] === "Semua / All");
          return {
            nama: nama,
            status: statuses[nama] || "Hadir / On Duty",
            lokasi: lantaiDitugaskan
          };
        });
        
        setObBertugas(mappedData);
      } else {
        setObBertugas([]);
      }
    });

    // Listener Kendaraan
    const vehRef = collection(db, "operational_vehicle_logs");
    const qVeh = query(vehRef, orderBy("waktu_catat", "desc"), limit(15));
    const unsubVeh = onSnapshot(qVeh, (snapshot) => {
      const logs = snapshot.docs.map(d => d.data() as KendaraanLog);
      const statusTerkini: Record<string, KendaraanLog> = {};
      logs.forEach(log => {
        if (!statusTerkini[log.kendaraan]) {
          statusTerkini[log.kendaraan] = log; 
        }
      });
      setMobilStatus(Object.values(statusTerkini));
    });

    return () => {
      unsubPlot();
      unsubVeh();
    };
  }, [todayISO]);

  // ==========================================
  // FUNGSI PENCARIAN (Tamu & Paket)
  // ==========================================
  const handleCariTamu = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const tamuRef = collection(db, "buku_tamu");
      const snap = await getDocs(tamuRef);
      const allTamu = snap.docs.map(d => ({ id: d.id, ...d.data() } as DataTamu));
      const filter = allTamu.filter(t => t.nama.toLowerCase().includes(searchQuery.toLowerCase()));
      setHasilTamu(filter);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCariPaket = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const paketRef = collection(db, "log_paket");
      const snap = await getDocs(paketRef);
      const allPaket = snap.docs.map(d => ({ id: d.id, ...d.data() } as DataPaket));
      const filter = allPaket.filter(p => p.penerima.toLowerCase().includes(searchQuery.toLowerCase()));
      setHasilPaket(filter);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  // ==========================================
  // FUNGSI LOGIN MENGAMBANG (KONEK KE DATABASE)
  // ==========================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== "123456") {
      alert("❌ Password salah! (Gunakan default: 123456)");
      return;
    }

    setIsLoginLoading(true);
    try {
      const usersRef = collection(db, "users_master");
      const q = query(usersRef, where("email", "==", email.toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert("❌ Email tidak terdaftar dalam sistem. Silakan hubungi Admin GA.");
        setIsLoginLoading(false);
        return;
      }

      const userData = querySnapshot.docs[0].data();
      
      localStorage.setItem("pic_nama", userData.nama);
      localStorage.setItem("pic_dept", userData.departemen);
      localStorage.setItem("pic_role", userData.role);

      switch (userData.departemen) {
        case "Admin GA":
          router.push("/admin");
          break;
        case "Management":
          router.push("/management");
          break;
        case "OB & CS":
        case "Security":
        case "Driver":
          router.push("/shift-checkin");
          break;
        default:
          alert("Departemen tidak dikenali.");
      }
    } catch (error) {
      console.error("Login Error:", error);
      alert("Terjadi gangguan koneksi. Coba lagi.");
    } finally {
      setIsLoginLoading(false);
    }
  };

  const formatJam = (timestamp: Timestamp | null | undefined) => {
    if (!timestamp) return "-";
    return new Date(timestamp.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ backgroundColor: "#f0f4f8", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: "50px", position: "relative" }}>
      
      {/* 🟡 HERO HEADER */}
      <div style={{ background: "linear-gradient(135deg, #FDB813 0%, #E69D17 100%)", padding: "40px 20px", color: "#1A365D", textAlign: "center", boxShadow: "0 4px 6px rgba(0,0,0,0.15)", borderRadius: "0 0 30px 30px", marginBottom: "30px" }}>
        <h1 style={{ margin: "0 0 10px 0", fontSize: "34px", fontWeight: "900", letterSpacing: "1px", textTransform: "uppercase" }}>🏢 Portal SIBM</h1>
        <p style={{ margin: "0 0 25px 0", fontSize: "16px", fontWeight: "bold" }}>Sistem Informasi Building Management - General Affairs</p>
        
        <div style={{ display: "flex", justifyContent: "center", gap: "15px", flexWrap: "wrap" }}>
          <div style={{ background: "rgba(26, 54, 93, 0.1)", border: "2px solid #1A365D", padding: "8px 15px", borderRadius: "50px", fontSize: "14px", fontWeight: "bold" }}>
            📅 {formatTgl}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}>
        
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "30px" }}>
          <button 
            onClick={() => setActiveModal("login")}
            style={{ background: "#1A365D", color: "white", padding: "12px 25px", border: "none", borderRadius: "50px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 6px rgba(26, 54, 93, 0.3)", display: "flex", alignItems: "center", gap: "8px" }}
          >
            🔐 Akses Pegawai (Login)
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px", marginBottom: "30px" }}>
          
          <div 
            onClick={() => { setActiveModal("tamu"); setSearchQuery(""); setHasilTamu([]); }}
            style={{ background: "white", padding: "20px", borderRadius: "16px", display: "flex", alignItems: "center", gap: "15px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "all 0.2s" }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = "#3182ce"}
            onMouseOut={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
          >
            <div style={{ background: "#ebf8ff", fontSize: "30px", padding: "15px", borderRadius: "12px" }}>🧑‍💼</div>
            <div>
              <p style={{ margin: "0", color: "#718096", fontSize: "14px", fontWeight: "bold" }}>Lacak Data Tamu</p>
              <h2 style={{ margin: "5px 0 0 0", color: "#2b6cb0", fontSize: "18px" }}>🔍 Klik untuk Mencari</h2>
            </div>
          </div>
          
          <div 
            onClick={() => { setActiveModal("paket"); setSearchQuery(""); setHasilPaket([]); }}
            style={{ background: "white", padding: "20px", borderRadius: "16px", display: "flex", alignItems: "center", gap: "15px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "all 0.2s" }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = "#dd6b20"}
            onMouseOut={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
          >
            <div style={{ background: "#feebc8", fontSize: "30px", padding: "15px", borderRadius: "12px" }}>📦</div>
            <div>
              <p style={{ margin: "0", color: "#718096", fontSize: "14px", fontWeight: "bold" }}>Lacak Resi / Paket</p>
              <h2 style={{ margin: "5px 0 0 0", color: "#dd6b20", fontSize: "18px" }}>🔍 Cari Nama Penerima</h2>
            </div>
          </div>

        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "30px" }}>
          
          {/* PANEL KENDARAAN OPERASIONAL */}
          <div style={{ background: "white", borderRadius: "16px", padding: "25px", boxShadow: "0 4px 10px rgba(0,0,0,0.03)", borderTop: "5px solid #1A365D" }}>
            <h2 style={{ margin: "0 0 5px 0", color: "#1A365D", display: "flex", alignItems: "center", gap: "10px" }}>
              <span>🚗</span> Status Armada & Driver
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Pantau ketersediaan mobil operasional secara real-time.</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {mobilStatus.length > 0 ? mobilStatus.map((mobil, idx) => {
                const isStandby = mobil.status_kendaraan?.includes("Standby");
                return (
                  <div key={idx} style={{ padding: "15px", borderRadius: "10px", border: "1px solid #e2e8f0", background: isStandby ? "#f0fff4" : "#fff5f5" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontWeight: "bold", color: "#2d3748" }}>{mobil.kendaraan}</span>
                      <span style={{ fontSize: "11px", fontWeight: "bold", padding: "4px 8px", borderRadius: "50px", background: isStandby ? "#c6f6d5" : "#fed7d7", color: isStandby ? "#22543d" : "#c53030" }}>
                        {isStandby ? "🟢 STANDBY" : "🔴 KELUAR"}
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", color: "#4a5568", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span><strong>Driver:</strong> {mobil.driver_bertugas || "-"}</span>
                      {!isStandby && <span><strong>Tujuan:</strong> {mobil.tujuan_keperluan || "-"}</span>}
                    </div>
                  </div>
                );
              }) : (
                <div style={{ textAlign: "center", padding: "20px", color: "#a0aec0", background: "#f7fafc", borderRadius: "8px", border: "1px dashed #cbd5e0" }}>
                  Belum ada data pergerakan kendaraan.
                </div>
              )}
            </div>
          </div>

          {/* PANEL OB & CS BERTUGAS */}
          <div style={{ background: "white", borderRadius: "16px", padding: "25px", boxShadow: "0 4px 10px rgba(0,0,0,0.03)", borderTop: "5px solid #319795" }}>
            <h2 style={{ margin: "0 0 5px 0", color: "#234e52", display: "flex", alignItems: "center", gap: "10px" }}>
              <span>🧹</span> Tim OB & CS Hari Ini
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Pantau lokasi area dinas dan status kehadiran petugas.</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {obBertugas.length > 0 ? obBertugas.map((ob, idx) => {
                const isHadir = ob.status.includes("Hadir");
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "15px", padding: "12px 15px", background: isHadir ? "#e6fffa" : "#fff5f5", borderRadius: "10px", border: isHadir ? "1px solid #b2f5ea" : "1px solid #feb2b2" }}>
                    
                    <div style={{ width: "38px", height: "38px", background: isHadir ? "#319795" : "#e53e3e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", flexShrink: 0 }}>
                      {ob.nama.charAt(0)}
                    </div>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "bold", color: isHadir ? "#234e52" : "#c53030", fontSize: "15px" }}>{ob.nama}</div>
                      <div style={{ fontSize: "12px", color: "#718096", marginTop: "2px" }}>
                        {isHadir ? (ob.lokasi.length > 0 ? `📍 ${ob.lokasi.join(", ")}` : "Belum diplot lantai") : "Tidak berada di area gedung"}
                      </div>
                    </div>

                    <span style={{ fontSize: "11px", background: isHadir ? "#81e6d9" : "#fed7d7", color: isHadir ? "#1d4044" : "#9b2c2c", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", textAlign: "center", minWidth: "70px" }}>
                      {isHadir ? "On Duty" : ob.status}
                    </span>
                  </div>
                );
              }) : (
                <div style={{ textAlign: "center", padding: "30px", color: "#a0aec0", background: "#f7fafc", borderRadius: "8px", border: "1px dashed #cbd5e0" }}>
                  Data tim OB & CS hari ini belum diterbitkan.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ========================================================================================= */}
      {/* 🌑 OVERLAY & MODALS (POP-UP MENGAMBANG) */}
      {/* ========================================================================================= */}
      {activeModal !== "none" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          
          <div style={{ background: "white", width: "100%", maxWidth: "600px", borderRadius: "16px", padding: "25px", boxShadow: "0 10px 25px rgba(0,0,0,0.2)", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
            
            <button onClick={() => setActiveModal("none")} style={{ position: "absolute", top: "15px", right: "20px", background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#a0aec0" }}>✖</button>

            {/* 1. MODAL LOGIN */}
            {activeModal === "login" && (
              <>
                <h2 style={{ margin: "0 0 5px 0", color: "#1A365D" }}>🔐 Portal Login Karyawan</h2>
                <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "14px" }}>Gunakan email kantor Anda untuk mengakses Dashboard SIBM.</p>
                <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  <div>
                    <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "14px" }}>Email Pegawai:</label>
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@sibm.com" style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "14px" }}>Kata Sandi (Password):</label>
                    <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
                  </div>
                  
                  <button 
                    type="submit" 
                    disabled={isLoginLoading}
                    style={{ 
                      width: "100%", 
                      padding: "15px", 
                      background: isLoginLoading ? "#a0aec0" : "#1A365D", 
                      color: "white", 
                      border: "none", 
                      borderRadius: "6px", 
                      fontWeight: "bold", 
                      fontSize: "16px", 
                      cursor: isLoginLoading ? "not-allowed" : "pointer", 
                      marginTop: "10px" 
                    }}
                  >
                    {isLoginLoading ? "Memeriksa Data..." : "Masuk ke Dashboard ➔"}
                  </button>
                </form>
              </>
            )}

            {/* 2. MODAL PENCARIAN TAMU */}
            {activeModal === "tamu" && (
              <>
                <h2 style={{ margin: "0 0 5px 0", color: "#2b6cb0" }}>🧑‍💼 Pencarian Riwayat Tamu</h2>
                <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "14px" }}>Lacak kapan saja tamu tertentu datang dan keluar dari gedung.</p>
                
                <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                  <input type="text" placeholder="Ketik nama tamu..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
                  <button onClick={handleCariTamu} disabled={isSearching} style={{ background: "#3182ce", color: "white", padding: "0 20px", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>
                    {isSearching ? "Mencari..." : "Cari Data"}
                  </button>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#edf2f7", color: "#4a5568" }}>
                        <th style={{ padding: "10px", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>Nama & Instansi</th>
                        <th style={{ padding: "10px", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>Waktu Masuk</th>
                        <th style={{ padding: "10px", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>Waktu Keluar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasilTamu.length > 0 ? hasilTamu.map((tamu) => (
                        <tr key={tamu.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "10px" }}><strong>{tamu.nama}</strong><br/><span style={{ color: "#718096" }}>{tamu.instansi}</span></td>
                          <td style={{ padding: "10px", color: "#38a169", fontWeight: "bold" }}>{formatJam(tamu.waktu_masuk)}</td>
                          <td style={{ padding: "10px", color: "#e53e3e" }}>{formatJam(tamu.waktu_keluar)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "#a0aec0" }}>{searchQuery ? "Tidak ada riwayat tamu ditemukan." : "Gunakan kolom pencarian di atas."}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* 3. MODAL PENCARIAN PAKET */}
            {activeModal === "paket" && (
              <>
                <h2 style={{ margin: "0 0 5px 0", color: "#dd6b20" }}>📦 Pelacakan Resi / Paket Karyawan</h2>
                <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "14px" }}>Cari tahu apakah paket Anda sudah tiba di resepsionis.</p>
                
                <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                  <input type="text" placeholder="Ketik nama karyawan penerima..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
                  <button onClick={handleCariPaket} disabled={isSearching} style={{ background: "#dd6b20", color: "white", padding: "0 20px", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>
                    {isSearching ? "Mencari..." : "Cari Paket"}
                  </button>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#edf2f7", color: "#4a5568" }}>
                        <th style={{ padding: "10px", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>Penerima</th>
                        <th style={{ padding: "10px", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>Ekspedisi/Kurir</th>
                        <th style={{ padding: "10px", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>Status & Waktu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasilPaket.length > 0 ? hasilPaket.map((paket) => (
                        <tr key={paket.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "10px", fontWeight: "bold", color: "#2d3748" }}>{paket.penerima}</td>
                          <td style={{ padding: "10px", color: "#718096" }}>{paket.kurir}</td>
                          <td style={{ padding: "10px" }}>
                            <span style={{ background: paket.status === "Sudah Diambil" ? "#c6f6d5" : "#feebc8", color: paket.status === "Sudah Diambil" ? "#22543d" : "#9c4221", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", display: "inline-block", marginBottom: "5px" }}>
                              {paket.status}
                            </span><br/>
                            <span style={{ color: "#a0aec0", fontSize: "11px" }}>{formatJam(paket.waktu_diterima)}</span>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "#a0aec0" }}>{searchQuery ? "Belum ada paket untuk nama tersebut." : "Gunakan kolom pencarian di atas."}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}