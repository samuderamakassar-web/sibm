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
  
  const [securityStaff, setSecurityStaff] = useState<string[]>([]);
  const [hariIniShift, setHariIniShift] = useState<string>("Tidak Ada Shift / Belum Diplot");
  const [namaBulanAktif, setNamaBulanAktif] = useState<string>("");
  const [semuaPlotBulanIni, setSemuaPlotBulanIni] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      let role = localStorage.getItem("pic_role") || "Staff"; 
      const dept = localStorage.getItem("pic_dept") || ""; 

      if (!nama || (dept !== "Security" && !dept.includes("Admin"))) {
        router.push("/shift-checkin");
        return;
      }
      
      setPicName(nama);

      try {
        const q = query(collection(db, "users_master"), where("departemen", "==", "Security"));
        const snap = await getDocs(q);
        const staffList: string[] = [];
        
        snap.forEach(doc => {
          const data = doc.data();
          staffList.push(data.nama);

          if (data.nama === nama) {
            const actualRole = data.role || "Staff";
            role = actualRole; 
            localStorage.setItem("pic_role", actualRole); 
          }
        });
        
        setPicRole(role);
        
        staffList.sort((a, b) => {
          if (a.toLowerCase().includes("danru")) return -1;
          if (b.toLowerCase().includes("danru")) return 1;
          return a.localeCompare(b);
        });
        
        setSecurityStaff(staffList);
      } catch (error) {
        console.error("Gagal menarik data staf:", error);
      }
    };

    siapkanHalaman();
  }, [router]);

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

  const handlePrint = () => {
    window.print();
  };

  // LOGIKA PEMBACAAN JAM KERJA DI KARTU DASHBOARD UTAMA
  const getWaktuShift = (shift: string) => {
    const dayOfWeek = new Date().getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; 
    
    if (isWeekend && shift === "Masuk") return "08:00 - 20:00 (12 Jam)";
    if (shift === "Pagi") return "08:00 - 14:00";
    if (shift === "Siang") return "14:00 - 22:00";
    if (shift === "Malam") return "22:00 - 08:00";
    return "";
  };

  // ==============================================================
  // LOGIKA KONVERSI INISIAL & JAM UNTUK TABEL ROSTER RINGKAS
  // ==============================================================
  const getInisialDanJam = (shiftVal: string) => {
    if (!shiftVal || shiftVal === "-") return "-";
    if (shiftVal.includes("Off")) return "OFF";

    switch (shiftVal) {
      case "Pagi":
        return "P (08-14)";
      case "Siang":
        return "S (14-22)";
      case "Malam":
        return "M (22-08)";
      case "Masuk":
        // Menggunakan "MS" (Masuk) agar tidak tertukar dengan "M" (Malam)
        return "MS (08-20)";
      default:
        return shiftVal;
    }
  };

  const isOff = hariIniShift.includes("Off") || hariIniShift.includes("Belum");
  const waktuTeks = getWaktuShift(hariIniShift);

  const menuSecurity = [
    { title: "Buku Tamu Digital", desc: "Registrasi tamu dan akses karyawan.", path: "/dashboard/security/buku-tamu", color: "#e53e3e", icon: "🧑‍💼", bg: "#fff5f5" },
    { title: "Manajemen Paket", desc: "Pencatatan resi kurir & ekspedisi.", path: "/dashboard/security/paket", color: "#dd6b20", icon: "📦", bg: "#fffaf0" },
    { title: "Patroli Area", desc: "Scan QR code & checklist keamanan.", path: "/dashboard/security/patroli", color: "#38a169", icon: "🛡️", bg: "#f0fff4" },
    { title: "Log Kendaraan", desc: "Pencatatan kendaraan keluar-masuk.", path: "/dashboard/security/parkir", color: "#3182ce", icon: "🚙", bg: "#ebf8ff" },
  ];

  if (!isReady) return null;

  const roleLower = picRole.toLowerCase();
  const isKoordinatorArea = roleLower.includes("danru") || roleLower.includes("koordinator") || roleLower.includes("admin");
  const tanggalCetak = new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 CSS PRINT: MEMASTIKAN LANDSCAPE & TABEL RINGKAS */}
      <style jsx global>{`
        @media screen { .print-only { display: none !important; } }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background-color: white !important; color: black !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-only { display: block !important; margin-bottom: 5px !important; }
          .print-only img { max-height: 35px !important; object-fit: contain; }
          .print-area { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
          table { border-collapse: collapse !important; width: 100% !important; page-break-inside: avoid !important; }
          
          /* Modifikasi Print: Huruf lebih kecil dan rapat agar muat */
          th, td { border: 1px solid black !important; color: black !important; font-size: 11px !important; padding: 4px 2px !important; text-align: center; }
          th { background-color: #f2f2f2 !important; font-weight: bold !important; }
          td.off-shift { color: red !important; }
          td.on-shift { color: #000 !important; font-weight: bold; }
        }
      `}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-samudera.png" alt="Logo" style={{ height: "30px", filter: "invert(1) brightness(0.2)" }} />
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Security Desk</span>
        </div>
        <button onClick={handleKeluar} style={{ background: "#edf2f7", color: "#4a5568", border: "none", padding: "8px 15px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}>Keluar ➔</button>
      </div>

      <div className="no-print" style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 80px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>COMMAND CENTER</h1>
        <p style={{ margin: "0 0 20px 0", fontSize: "14px", opacity: 0.9 }}>Sistem Pengamanan Terpadu SIBM</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 20px", borderRadius: "50px", fontSize: "13px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.3)" }}>
          <span>👮</span> PIC: {picName} ({picRole})
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* KARTU SHIFT HARI INI */}
        <div className="no-print" style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", marginBottom: "25px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px", border: "1px solid #e2e8f0" }}>
          <div>
            <p style={{ margin: "0 0 5px 0", color: "#718096", fontSize: "13px", fontWeight: "bold", textTransform: "uppercase" }}>Jadwal Anda Hari Ini</p>
            <h2 style={{ margin: 0, color: "#1a202c", fontSize: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
            </h2>
          </div>
          <div style={{ background: isOff ? "#fff5f5" : "#f0fff4", color: isOff ? "#c53030" : "#22543d", padding: "10px 20px", borderRadius: "12px", border: isOff ? "1px solid #fed7d7" : "1px solid #c6f6d5", fontWeight: "900", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            {isOff ? `🔴 ${hariIniShift}` : `🟢 ON DUTY : ${hariIniShift.toUpperCase()} ${waktuTeks ? `(${waktuTeks})` : ""}`}
          </div>
        </div>

        {/* MENU KHUSUS DANRU */}
        {isKoordinatorArea && (
          <div className="no-print" onClick={() => router.push("/dashboard/security/jadwal")} style={{ background: "linear-gradient(to right, #1a365d, #2c5282)", color: "white", padding: "20px", borderRadius: "20px", cursor: "pointer", marginBottom: "25px", display: "flex", alignItems: "center", gap: "20px", boxShadow: "0 10px 15px -3px rgba(44, 82, 130, 0.4)", transition: "transform 0.2s" }}>
            <div style={{ background: "rgba(255,255,255,0.2)", fontSize: "30px", padding: "15px", borderRadius: "16px" }}>📅</div>
            <div>
              <h2 style={{ margin: "0 0 5px 0", fontSize: "18px" }}>Pengaturan Roster Shift Bulanan</h2>
              <p style={{ margin: "0", fontSize: "13px", opacity: 0.8 }}>Akses khusus Koordinator/Danru untuk menyusun matriks jadwal regu keamanan.</p>
            </div>
          </div>
        )}

        <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "35px" }}>
          {menuSecurity.map((menu, index) => (
            <div key={index} onClick={() => router.push(menu.path)} style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", cursor: "pointer", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "15px" }}>
              <div style={{ background: menu.bg, color: menu.color, width: "55px", height: "55px", borderRadius: "16px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "28px" }}>{menu.icon}</div>
              <div>
                <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "17px" }}>{menu.title}</h2>
                <p style={{ margin: "0", color: "#718096", fontSize: "13px", lineHeight: "1.5" }}>{menu.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ======================================================= */}
        {/* HEADER KHUSUS PRINT (MUNCUL SAAT DI-PRINT PDF)          */}
        {/* ======================================================= */}
        <div className="print-only" style={{ textAlign: "center", borderBottom: "3px solid black", paddingBottom: "10px", marginBottom: "15px" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "15px", marginBottom: "10px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-samudera.png" alt="Logo Samudera" style={{ height: "45px" }} />
            <div>
              <h1 style={{ margin: 0, fontSize: "22px", textTransform: "uppercase" }}>Jadwal Dinas / Roster Security</h1>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "bold" }}>PT SAMUDERA INDONESIA BUILDING MANAGEMENT</p>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "bold", borderTop: "1px solid black", paddingTop: "5px" }}>
            <span>Bulan: {namaBulanAktif || "-"}</span>
            <span>Diperbarui pada: {tanggalCetak}</span>
          </div>
        </div>

        {/* 🗓️ PAPAN MONITORING ROSTER BULANAN */}
        <div className="print-area" style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span>🗓️</span> Roster Shift Security <span style={{ background: "#edf2f7", padding: "4px 10px", borderRadius: "8px", fontSize: "13px", color: "#4a5568" }}>{namaBulanAktif || "Belum Terbit"}</span>
            </h2>
            
            {/* PANDUAN WARNA & JAM UNTUK LAYAR */}
            <div style={{ display: "flex", gap: "10px", fontSize: "11px", fontWeight: "bold" }}>
              <span style={{ background: "#e2e8f0", padding: "4px 8px", borderRadius: "6px" }}>P: 08-14</span>
              <span style={{ background: "#e2e8f0", padding: "4px 8px", borderRadius: "6px" }}>S: 14-22</span>
              <span style={{ background: "#e2e8f0", padding: "4px 8px", borderRadius: "6px" }}>M: 22-08</span>
              <span style={{ background: "#e2e8f0", padding: "4px 8px", borderRadius: "6px" }}>MS (Akhir Pekan): 08-20</span>
            </div>

            {isKoordinatorArea && Object.keys(semuaPlotBulanIni).length > 0 && (
              <button onClick={handlePrint} className="no-print" style={{ padding: "8px 15px", background: "#e53e3e", color: "white", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                🖨️ Cetak Roster A4
              </button>
            )}
          </div>
          
          {Object.keys(semuaPlotBulanIni).length > 0 ? (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              {/* TABEL DIUBAH MENJADI FORMAT RINGKAS (INISIAL & JAM) */}
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                    <th style={{ padding: "10px", borderBottom: "2px solid #e2e8f0", borderRight: "1px solid #e2e8f0", textAlign: "center", width: "80px" }}>Tgl</th>
                    {securityStaff.map(staf => <th key={staf} style={{ padding: "10px", borderBottom: "2px solid #e2e8f0", borderRight: "1px solid #e2e8f0" }}>{staf}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(semuaPlotBulanIni).sort().map((tglKey) => {
                    const tglDisplay = tglKey.split("-")[2]; 
                    const dataHari = semuaPlotBulanIni[tglKey];
                    const isHariIni = tglKey === new Date().toISOString().split("T")[0];
                    const dateObj = new Date(tglKey);
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 5 || dateObj.getDay() === 6; // Jumat, Sabtu, Minggu

                    return (
                      <tr key={tglKey} style={{ background: isHariIni ? "#ebf8ff" : (isWeekend ? "#fffaf0" : "white"), borderBottom: "1px solid #edf2f7" }}>
                        <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #e2e8f0", fontWeight: "bold", color: isHariIni ? "#2b6cb0" : (isWeekend ? "#dd6b20" : "#4a5568") }}>
                          {tglDisplay}
                        </td>
                        {securityStaff.map((staf) => {
                          const sVal = dataHari[staf] || "-";
                          const isOff = sVal.includes("Off");
                          
                          // Konversi "Pagi" menjadi "P (08-14)", dsb
                          const displayShift = getInisialDanJam(sVal);

                          return (
                            <td 
                              key={staf} 
                              className={isOff ? "off-shift" : "on-shift"}
                              style={{ padding: "6px", borderRight: "1px solid #e2e8f0", color: isOff ? "#e53e3e" : "#2d3748", fontWeight: isOff ? "normal" : "bold", whiteSpace: "nowrap" }}
                            >
                              {displayShift}
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
            <div className="no-print" style={{ padding: "40px 20px", textAlign: "center", color: "#a0aec0", border: "1px dashed #cbd5e0", borderRadius: "12px", background: "#f8fafc" }}>
              <div style={{ fontSize: "30px", marginBottom: "10px" }}>📂</div>
              Jadwal Roster Belum Terbit. Silakan hubungi Danru.
            </div>
          )}

          {/* LEGENDA KETERANGAN DI BAGIAN BAWAH PRINT */}
          <div className="print-only" style={{ marginTop: "15px", borderTop: "1px solid black", paddingTop: "10px", fontSize: "11px" }}>
            <p style={{ margin: "0 0 5px 0", fontWeight: "bold" }}>Keterangan Waktu Shift:</p>
            <div style={{ display: "flex", gap: "20px" }}>
              <span><strong>P:</strong> Pagi (08:00 - 14:00)</span>
              <span><strong>S:</strong> Siang (14:00 - 22:00)</span>
              <span><strong>M:</strong> Malam (22:00 - 08:00)</span>
              <span><strong>MS:</strong> Masuk Akhir Pekan (08:00 - 20:00)</span>
              <span style={{ color: "red", fontWeight: "bold" }}>OFF: Libur</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}