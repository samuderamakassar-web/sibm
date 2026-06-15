"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../lib/firebase";

export default function SecurityDashboard() {
  const router = useRouter();

  const [picName, setPicName] = useState<string>("");
  const [picRole, setPicRole] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  
  // State Dinamis untuk Daftar Staf
  const [securityStaff, setSecurityStaff] = useState<string[]>([]);
  
  // State Jadwal Baru
  const [hariIniShift, setHariIniShift] = useState<string>("Tidak Ada Shift / Belum Diplot");
  const [namaBulanAktif, setNamaBulanAktif] = useState<string>("");
  const [semuaPlotBulanIni, setSemuaPlotBulanIni] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      const role = localStorage.getItem("pic_role") || "Staff";
      const dept = localStorage.getItem("pic_dept");

      if (!nama || dept !== "Security") {
        router.push("/shift-checkin");
        return;
      }
      setPicName(nama);
      setPicRole(role);

      try {
        // Tarik Daftar Staf Security dari Database secara Otomatis
        const q = query(collection(db, "users_master"), where("departemen", "==", "Security"));
        const snap = await getDocs(q);
        const staffList: string[] = [];
        snap.forEach(doc => {
          staffList.push(doc.data().nama);
        });
        
        // Urutkan Danru di awal, baru anggota
        staffList.sort((a, b) => {
          if (a.includes("Danru")) return -1;
          if (b.includes("Danru")) return 1;
          return a.localeCompare(b);
        });
        
        setSecurityStaff(staffList);
      } catch (error) {
        console.error("Gagal menarik data staf:", error);
      }
    };

    siapkanHalaman();
  }, [router]);

  // Listener sinkronisasi Roster Bulanan dari Firebase
  useEffect(() => {
    if (!picName) return;

    const metaRef = doc(db, "security_schedules", "active_meta");
    
    const unsubscribeMeta = onSnapshot(metaRef, async (metaSnap) => {
      if (metaSnap.exists()) {
        const currentDocId = metaSnap.data().current_doc_id;
        
        const monthlyRef = doc(db, "security_monthly_schedules", currentDocId);
        const mSnap = await getDoc(monthlyRef);
        
        if (mSnap.exists()) {
          const mData = mSnap.data();
          setNamaBulanAktif(mData.nama_bulan_id || "");
          const dataHari = mData.data_hari || {}; 
          setSemuaPlotBulanIni(dataHari);

          const tglHariIni = new Date().toISOString().split("T")[0];
          const shiftKuHariIni = dataHari[tglHariIni]?.[picName] || "Off / Belum Diplot";
          setHariIniShift(shiftKuHariIni);
        }
      }
      setIsReady(true);
    }, (err) => {
      console.error(err);
      setIsReady(true);
    });

    return () => unsubscribeMeta();
  }, [picName]);

  const handleKeluar = () => {
    localStorage.removeItem("pic_nama");
    localStorage.removeItem("pic_dept");
    localStorage.removeItem("pic_role");
    router.push("/shift-checkin");
  };

  const menuSecurity = [
    { title: "📋 Buku Tamu", desc: "Catat data pengunjung, tamu, dan karyawan.", path: "/dashboard/security/buku-tamu", color: "#3182ce", icon: "🧑‍💼" },
    { title: "📦 Log Paket", desc: "Catat penerimaan dan pengambilan paket.", path: "/dashboard/security/paket", color: "#dd6b20", icon: "📦" },
    { title: "🔦 Patroli Gedung", desc: "Checklist keamanan area via kamera QR.", path: "/dashboard/security/patroli", color: "#38a169", icon: "🛡️" },
    { title: "🚗 Laporan Parkir / Kendaraan", desc: "Pencatatan mobilitas kendaraan operasional.", path: "/dashboard/security/parkir", color: "#805ad5", icon: "🚙" },
  ];

  if (!isReady) return null;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1200px", margin: "0 auto", minHeight: "100vh", background: "#f0f4f8" }}>
      
      {/* HEADER DASHBOARD */}
      <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px", borderLeft: "6px solid #3182ce" }}>
        <div>
          <h1 style={{ margin: "0 0 5px 0", color: "#2c5282" }}>🛡️ Dashboard Security</h1>
          <p style={{ margin: "0", color: "#718096", fontSize: "14px" }}>Pusat operasional dan pemantauan tugas regu keamanan SIBM.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
          <div style={{ background: "#ebf8ff", color: "#2b6cb0", padding: "8px 15px", borderRadius: "50px", fontSize: "13px", fontWeight: "bold", border: "1px solid #bee3f8", display: "flex", alignItems: "center", gap: "5px" }}>
            <span>👮</span> PIC: {picName}
          </div>
          <button onClick={handleKeluar} style={{ padding: "10px 15px", background: "#edf2f7", color: "#4a5568", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", transition: "all 0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#e2e8f0"} onMouseOut={(e) => e.currentTarget.style.background = "#edf2f7"}>
            🔄 Ganti Shift / Keluar
          </button>
        </div>
      </div>

      {/* 📢 BANNER SHIFT HARI INI */}
      <div style={{ background: hariIniShift.includes("Off") ? "#fff5f5" : "#e6fffa", color: hariIniShift.includes("Off") ? "#c53030" : "#234e52", padding: "20px", borderRadius: "12px", marginBottom: "25px", border: hariIniShift.includes("Off") ? "2px solid #feb2b2" : "2px solid #38b2ac", fontWeight: "bold", fontSize: "16px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
        📢 JADWAL ANDA HARI INI ({new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long" })}): 
        <span style={{ fontSize: "18px", textDecoration: "underline", marginLeft: "8px", color: hariIniShift.includes("Off") ? "#e53e3e" : "#38a169" }}>
          {hariIniShift === "Masuk" ? "🟢 MASUK SHIFT REGU" : hariIniShift}
        </span>
      </div>

      {/* 👑 MENU KHUSUS DANRU */}
      {(picRole.includes("Danru") || picRole.includes("Koordinator")) && (
        <div 
          onClick={() => router.push("/dashboard/security/jadwal")}
          style={{ background: "#ebf8ff", border: "2px dashed #3182ce", padding: "20px", borderRadius: "12px", cursor: "pointer", marginBottom: "25px", textAlign: "center", transition: "all 0.2s" }}
          onMouseOver={(e) => e.currentTarget.style.background = "#bee3f8"}
          onMouseOut={(e) => e.currentTarget.style.background = "#ebf8ff"}
        >
          <h2 style={{ margin: "0 0 5px 0", color: "#2c5282", fontSize: "18px" }}>📅 PENGATURAN ROSTER SHIFT BULANAN (DANRU AREA)</h2>
          <p style={{ margin: "0", color: "#4a5568", fontSize: "14px" }}>Klik untuk menyusun atau merevisi plot matriks kalender shift kerja bulanan regu.</p>
        </div>
      )}

      {/* GRID MENU UTAMA */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px", marginBottom: "30px" }}>
        {menuSecurity.map((menu, index) => (
          <div 
            key={index} onClick={() => router.push(menu.path)} 
            style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", cursor: "pointer", borderTop: `5px solid ${menu.color}`, display: "flex", gap: "15px", alignItems: "flex-start", transition: "transform 0.2s" }}
            onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-5px)"}
            onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
          >
            <div style={{ fontSize: "30px" }}>{menu.icon}</div>
            <div>
              <h2 style={{ marginTop: "0", color: menu.color, fontSize: "18px", marginBottom: "8px" }}>{menu.title}</h2>
              <p style={{ margin: "0", color: "#718096", fontSize: "13px", lineHeight: "1.5" }}>{menu.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 🗓️ PAPAN MONITORING ROSTER BULANAN */}
      <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", borderTop: "4px solid #4a5568" }}>
        <h2 style={{ margin: "0 0 15px 0", color: "#2d3748" }}>🗓️ Lembar Roster Security ({namaBulanAktif || "Belum Terbit"})</h2>
        
        {Object.keys(semuaPlotBulanIni).length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#edf2f7", color: "#4a5568" }}>
                  <th style={{ padding: "12px", border: "1px solid #e2e8f0" }}>Tanggal</th>
                  {/* GENERATE KOLOM NAMA SECARA DINAMIS */}
                  {securityStaff.map(staf => (
                    <th key={staf} style={{ padding: "12px", border: "1px solid #e2e8f0" }}>{staf}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(semuaPlotBulanIni).sort().map((tglKey) => {
                  const tglDisplay = tglKey.split("-")[2]; 
                  const dataHari = semuaPlotBulanIni[tglKey];
                  const isHariIni = tglKey === new Date().toISOString().split("T")[0];

                  return (
                    <tr key={tglKey} style={{ background: isHariIni ? "#ebf8ff" : "transparent", fontWeight: isHariIni ? "bold" : "normal" }}>
                      <td style={{ padding: "10px", border: "1px solid #e2e8f0", background: "#edf2f7", fontWeight: "bold" }}>
                        Tgl {tglDisplay} {isHariIni && "⭐"}
                      </td>
                      {/* ISI DATA SHIFT SECARA DINAMIS */}
                      {securityStaff.map((staf) => {
                        const sVal = dataHari[staf] || "-";
                        return (
                          <td key={staf} style={{ padding: "10px", border: "1px solid #e2e8f0", color: sVal.includes("Off") ? "#e53e3e" : "#2b6cb0", fontWeight: sVal === "Off" ? "normal" : "bold" }}>
                            {sVal === "Masuk" ? "🟢 Masuk" : sVal}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "30px", textAlign: "center", color: "#a0aec0", border: "1px dashed #cbd5e0", borderRadius: "8px" }}>
            Jadwal Roster Belum Terbit. Silakan hubungi Danru.
          </div>
        )}
      </div>

    </div>
  );
}