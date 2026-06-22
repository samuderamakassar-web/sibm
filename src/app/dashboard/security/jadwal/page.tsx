"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

interface SlotHarian {
  tanggalStr: string; 
  namaHari: string;   
  isWeekendKhusus: boolean; 
  plotKaryawan: Record<string, string>; 
}

const NAMA_HARI_IND = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export default function PengaturanJadwalSecurity() {
  const router = useRouter();
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // State Pilihan Bulan & Tahun
  const [bulanPilihan, setBulanPilihan] = useState<number>(new Date().getMonth() + 1);
  const [tahunPilihan, setTahunPilihan] = useState<number>(new Date().getFullYear());
  
  // State Utama Kalender Bulanan & Daftar Staf
  const [matriksJadwal, setMatriksJadwal] = useState<SlotHarian[]>([]);
  const [timSecurity, setTimSecurity] = useState<string[]>([]);

  // =========================================================================
  // 1. FUNGSI PENARIKAN DATA (DIBUNGKUS useCallback)
  // =========================================================================
  const generateKalenderKosong = useCallback(async (daftarStaf: string[]) => {
    const jumlahHari = new Date(tahunPilihan, bulanPilihan, 0).getDate();
    const daftarHari: SlotHarian[] = [];

    const docId = `${tahunPilihan}-${String(bulanPilihan).padStart(2, "0")}`;
    let dataSaves: Record<string, Record<string, string>> = {};
    
    try {
      const jRef = doc(db, "security_monthly_schedules", docId);
      const jSnap = await getDoc(jRef);
      if (jSnap.exists()) {
        dataSaves = jSnap.data().data_hari || {};
      }
    } catch (e) {
      console.error(e);
    }

    for (let d = 1; d <= jumlahHari; d++) {
      const tglObj = new Date(tahunPilihan, bulanPilihan - 1, d);
      const dayOfWeek = tglObj.getDay(); 
      const tglFormat = `${tahunPilihan}-${String(bulanPilihan).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      
      const isWeekendKhusus = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;

      const plotKaryawan: Record<string, string> = {};
      daftarStaf.forEach(karyawan => {
        plotKaryawan[karyawan] = dataSaves[tglFormat]?.[karyawan] || "";
      });

      daftarHari.push({
        tanggalStr: tglFormat,
        namaHari: NAMA_HARI_IND[dayOfWeek],
        isWeekendKhusus,
        plotKaryawan
      });
    }

    setMatriksJadwal(daftarHari);
    setIsReady(true);
  }, [bulanPilihan, tahunPilihan]);

  // =========================================================================
  // 2. VERIFIKASI IDENTITAS & TARIK DAFTAR SECURITY AKTIF DARI DATABASE
  // =========================================================================
  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      const role = localStorage.getItem("pic_role") || "Staff";
      const dept = localStorage.getItem("pic_dept") || "";
      
      const roleLower = role.toLowerCase();
      const isKoordinator = roleLower.includes("danru") || roleLower.includes("koordinator") || roleLower.includes("admin") || dept.includes("Admin");

      if (!nama || !isKoordinator) {
        alert("Akses Ditolak! Halaman ini khusus Komandan Regu (Danru) & Admin.");
        router.push("/dashboard/security");
        return;
      }
      setPicName(nama);

      try {
        // Tarik Anggota Security dari Database Firebase
        const q = query(collection(db, "users_master"), where("departemen", "==", "Security"));
        const snap = await getDocs(q);
        const staffList: string[] = [];
        
        snap.forEach(doc => {
          staffList.push(doc.data().nama);
        });
        
        // Urutkan Danru selalu di atas
        staffList.sort((a, b) => {
          if (a.toLowerCase().includes("danru") || a === "Awaluddin") return -1;
          if (b.toLowerCase().includes("danru") || b === "Awaluddin") return 1;
          return a.localeCompare(b);
        });
        
        setTimSecurity(staffList);
        // Lempar daftar yang ditarik ke dalam pembuat kalender
        generateKalenderKosong(staffList);

      } catch (error) {
        console.error("Gagal menarik data tim dari database:", error);
      }
    };
    siapkanHalaman();
  }, [router, generateKalenderKosong]);

  const handleSetShift = (dayIndex: number, karyawan: string, shiftValue: string) => {
    setMatriksJadwal(prev => {
      const update = [...prev];
      update[dayIndex].plotKaryawan[karyawan] = shiftValue;
      return update;
    });
  };

  const handleSimpanJadwal = async () => {
    setIsLoading(true);
    const docId = `${tahunPilihan}-${String(bulanPilihan).padStart(2, "0")}`;
    
    const dataHariKemas: Record<string, Record<string, string>> = {};
    matriksJadwal.forEach(h => {
      dataHariKemas[h.tanggalStr] = h.plotKaryawan;
    });

    try {
      await setDoc(doc(db, "security_monthly_schedules", docId), {
        bulan_tahun: docId,
        nama_bulan_id: new Date(tahunPilihan, bulanPilihan - 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
        data_hari: dataHariKemas,
        dibuat_oleh: picName,
        waktu_update: serverTimestamp()
      });

      await setDoc(doc(db, "security_schedules", "active_meta"), {
        current_doc_id: docId
      });

      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan jadwal.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR (Sama dengan Dashboard) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/dashboard/security")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 Danru Desk
        </div>
      </div>

      {/* 🔹 HERO SECTION (TEMA MERAH SAMUDERA) */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PENYUSUNAN ROSTER</h1>
        <p style={{ margin: "0", fontSize: "13px", opacity: 0.9 }}>Atur matriks dinas harian regu pengamanan SIBM</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", background: "#f8fafc", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", flexWrap: "wrap" }}>
            <span style={{ fontSize: "20px" }}>📅</span>
            <div style={{ display: "flex", gap: "10px", flex: 1, flexWrap: "wrap" }}>
              <select value={bulanPilihan} onChange={(e) => setBulanPilihan(Number(e.target.value))} style={{ flex: 1, minWidth: "150px", padding: "12px", borderRadius: "8px", fontSize: "14px", fontWeight: "bold", border: "1px solid #cbd5e0", background: "white" }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i+1} value={i+1}>{new Date(2026, i).toLocaleDateString("id-ID", { month: "long" })}</option>
                ))}
              </select>
              <select value={tahunPilihan} onChange={(e) => setTahunPilihan(Number(e.target.value))} style={{ padding: "12px", borderRadius: "8px", fontSize: "14px", fontWeight: "bold", border: "1px solid #cbd5e0", background: "white" }}>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
            </div>
          </div>

          <div style={{ background: "#fffaf0", border: "1px solid #feebc8", padding: "12px 15px", borderRadius: "12px", marginBottom: "25px", fontSize: "13px", color: "#c05621", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "18px" }}>💡</span> Info: Jumat, Sabtu, dan Minggu otomatis menggunakan skema pengamanan ganda (Masuk/Off).
          </div>

          {isSuccess && (
            <div style={{ background: "#f0fff4", border: "1px solid #c6f6d5", color: "#22543d", padding: "15px", borderRadius: "12px", marginBottom: "20px", fontWeight: "bold", textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
              <span style={{ fontSize: "20px" }}>✅</span> Roster bulan ini sukses diterbitkan ke sistem!
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {matriksJadwal.map((hari, dayIdx) => (
              <div key={hari.tanggalStr} style={{ border: hari.isWeekendKhusus ? "2px solid #feebc8" : "1px solid #e2e8f0", borderRadius: "16px", padding: "20px", background: hari.isWeekendKhusus ? "#fffaf0" : "#ffffff", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "1px solid #edf2f7", paddingBottom: "10px" }}>
                  <div style={{ fontWeight: "900", color: hari.isWeekendKhusus ? "#dd6b20" : "#2d3748", fontSize: "16px" }}>
                    {hari.namaHari}, {hari.tanggalStr.split("-")[2]}
                  </div>
                  <span style={{ fontSize: "10px", background: hari.isWeekendKhusus ? "#dd6b20" : "#e2e8f0", color: hari.isWeekendKhusus ? "white" : "#4a5568", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", textTransform: "uppercase" }}>
                    {hari.isWeekendKhusus ? "Shift Ganda" : "Reguler (3 Shift)"}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {timSecurity.map(karyawan => {
                    const shiftAktif = hari.plotKaryawan[karyawan];
                    return (
                      <div key={karyawan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", background: "#f8fafc", padding: "12px 15px", borderRadius: "10px", border: "1px solid #edf2f7" }}>
                        <span style={{ fontSize: "14px", fontWeight: "bold", color: "#1a202c", flex: 1, minWidth: "150px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "24px", height: "24px", background: "#e2e8f0", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "10px" }}>👮</span> 
                          {karyawan}
                        </span>
                        
                        <div style={{ display: "flex", gap: "5px" }}>
                          {hari.isWeekendKhusus ? (
                            <>
                              {["Masuk", "Off"].map(s => (
                                <button
                                  key={s} type="button" onClick={() => handleSetShift(dayIdx, karyawan, s)}
                                  style={{ padding: "8px 12px", fontSize: "12px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", background: shiftAktif === s ? (s === "Masuk" ? "#38a169" : "#e53e3e") : "#cbd5e0", color: "white", transition: "0.2s" }}
                                >
                                  {s === "Masuk" ? "🟢 Masuk" : "❌ Off"}
                                </button>
                              ))}
                            </>
                          ) : (
                            <>
                              {["Pagi", "Siang", "Malam", "Off"].map(s => (
                                <button
                                  key={s} type="button" onClick={() => handleSetShift(dayIdx, karyawan, s)}
                                  style={{ padding: "8px 12px", fontSize: "12px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", background: shiftAktif === s ? (s === "Off" ? "#e53e3e" : "#3182ce") : "#cbd5e0", color: "white", transition: "0.2s" }}
                                >
                                  {s}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleSimpanJadwal} disabled={isLoading}
            style={{ width: "100%", padding: "16px", background: isLoading ? "#a0aec0" : "#e53e3e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: "pointer", marginTop: "30px", boxShadow: "0 4px 6px rgba(229,62,62,0.3)", transition: "0.2s" }}
          >
            {isLoading ? "Menyimpan Data Roster..." : "🚀 Terbitkan Roster Bulanan Resmi"}
          </button>

        </div>
      </div>
    </div>
  );
}