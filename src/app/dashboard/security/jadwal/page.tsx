"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

interface SlotHarian {
  tanggalStr: string; 
  namaHari: string;   
  plotKaryawan: Record<string, string>; 
}

const NAMA_HARI_IND = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
// Pola Rotasi Standar 12 Jam: 2 Hari Pagi, 2 Hari Malam, 2 Hari Off
const POLA_ROTASI = ["Shift 1", "Shift 1", "Shift 2", "Shift 2", "Off", "Off"];

export default function PengaturanJadwalSecurity() {
  const router = useRouter();
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // State Pilihan Bulan & Tahun (Periode Mulai Tanggal 11)
  const [bulanPilihan, setBulanPilihan] = useState<number>(new Date().getMonth() + 1);
  const [tahunPilihan, setTahunPilihan] = useState<number>(new Date().getFullYear());
  
  // State Utama Kalender Bulanan & Daftar Staf
  const [matriksJadwal, setMatriksJadwal] = useState<SlotHarian[]>([]);
  const [timSecurity, setTimSecurity] = useState<string[]>([]);

  // =========================================================================
  // 1. FUNGSI PENARIKAN DATA (Periode Tgl 11 s/d 10)
  // =========================================================================
  const generateKalenderKosong = useCallback(async (daftarStaf: string[]) => {
    // Tentukan rentang periode: 11 Bulan Ini s/d 10 Bulan Depan
    const tglMulai = new Date(tahunPilihan, bulanPilihan - 1, 11);
    const tglSelesai = new Date(tahunPilihan, bulanPilihan, 10);
    
    const daftarHari: SlotHarian[] = [];
    const dataSaves: Record<string, string> = {}; // Flat map: "2026-06-15_Amal": "Shift 1"

    // Karena periode melintasi 2 bulan, kita tarik dokumen untuk kedua bulan tersebut
    try {
      const docBulan1 = `${tahunPilihan}-${String(bulanPilihan).padStart(2, "0")}`;
      const docBulan2 = `${new Date(tglSelesai).getFullYear()}-${String(tglSelesai.getMonth() + 1).padStart(2, "0")}`;

      const snap1 = await getDoc(doc(db, "security_monthly_schedules", docBulan1));
      if (snap1.exists()) {
        const harian = snap1.data().data_hari || {};
        Object.keys(harian).forEach(tgl => {
          Object.keys(harian[tgl]).forEach(nama => dataSaves[`${tgl}_${nama}`] = harian[tgl][nama]);
        });
      }

      const snap2 = await getDoc(doc(db, "security_monthly_schedules", docBulan2));
      if (snap2.exists()) {
        const harian = snap2.data().data_hari || {};
        Object.keys(harian).forEach(tgl => {
          Object.keys(harian[tgl]).forEach(nama => dataSaves[`${tgl}_${nama}`] = harian[tgl][nama]);
        });
      }
    } catch (e) {
      console.error("Gagal menarik data lama:", e);
    }

    // Bangun baris kalender
    for (let d = new Date(tglMulai); d <= tglSelesai; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      const tglFormat = `${y}-${m}-${date}`;
      const dayOfWeek = d.getDay(); 

      const plotKaryawan: Record<string, string> = {};
      daftarStaf.forEach(karyawan => {
        plotKaryawan[karyawan] = dataSaves[`${tglFormat}_${karyawan}`] || "";
      });

      daftarHari.push({ tanggalStr: tglFormat, namaHari: NAMA_HARI_IND[dayOfWeek], plotKaryawan });
    }

    setMatriksJadwal(daftarHari);
    setIsReady(true);
  }, [bulanPilihan, tahunPilihan]);

  // =========================================================================
  // 2. VERIFIKASI & TARIK TIM SECURITY
  // =========================================================================
  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      const role = localStorage.getItem("pic_role") || "Staff";
      const dept = localStorage.getItem("pic_dept") || "";
      
      const roleLower = role.toLowerCase();
      const isKoordinator = roleLower.includes("danru") || roleLower.includes("koordinator") || roleLower.includes("admin") || dept.includes("Admin");

      if (!nama || !isKoordinator) {
        alert("Akses Ditolak! Halaman ini khusus Komandan Regu (Danru).");
        router.push("/dashboard/security");
        return;
      }
      setTimeout(() => setPicName(nama), 0);

      try {
        const q = query(collection(db, "users_master"), where("departemen", "==", "Security"));
        const snap = await getDocs(q);
        const staffList: string[] = [];
        
        snap.forEach(doc => staffList.push(doc.data().nama));
        
        staffList.sort((a, b) => {
          if (a.toLowerCase().includes("danru") || a === "Awaluddin") return -1;
          if (b.toLowerCase().includes("danru") || b === "Awaluddin") return 1;
          return a.localeCompare(b);
        });
        
        setTimSecurity(staffList);
        generateKalenderKosong(staffList);
      } catch (error) {
        console.error(error);
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

  // =========================================================================
  // 💡 3. FITUR KEAJAIBAN GENERATE OTOMATIS (POLA 2-2-2)
  // =========================================================================
  const handleAutoGenerate = () => {
    if (matriksJadwal.length === 0) return;

    // Cari titik awal indeks berdasarkan shift di hari pertama (tgl 11)
    const getStartIndex = (shift: string) => {
      if (shift.includes("Shift 1")) return 0;
      if (shift.includes("Shift 2")) return 2;
      if (shift.includes("Off") || shift.includes("Izin")) return 4;
      return 0; // Default
    };

    setMatriksJadwal(prev => {
      const update = [...prev];
      const hariPertama = update[0].plotKaryawan; // Ambil setelan Tanggal 11

      timSecurity.forEach(staf => {
        const shiftAwal = hariPertama[staf];
        if (!shiftAwal) return; // Jika Danru belum set hari pertama, lewati staf ini

        let currentIndex = getStartIndex(shiftAwal);

        // Loop dari tanggal 12 sampai akhir periode
        for (let d = 1; d < update.length; d++) {
          currentIndex = (currentIndex + 1) % POLA_ROTASI.length;
          update[d].plotKaryawan[staf] = POLA_ROTASI[currentIndex];
        }
      });
      return update;
    });

    alert("✨ MAGIC! Jadwal otomatis terisi hingga akhir periode dengan pola rotasi 2-2-2. Anda bisa mengganti manual hari tertentu jika ada yang Izin.");
  };

  // =========================================================================
  // 4. SIMPAN JADWAL KE DATABASE (DIPISAH PER BULAN)
  // =========================================================================
  const handleSimpanJadwal = async () => {
    setIsLoading(true);
    
    // Kelompokkan data berdasarkan YYYY-MM
    const dataPerBulan: Record<string, Record<string, Record<string, string>>> = {};
    matriksJadwal.forEach(h => {
      const prefixBulan = h.tanggalStr.substring(0, 7); // Contoh: "2026-06"
      if (!dataPerBulan[prefixBulan]) dataPerBulan[prefixBulan] = {};
      dataPerBulan[prefixBulan][h.tanggalStr] = h.plotKaryawan;
    });

    try {
      // Simpan data ke masing-masing dokumen bulan agar rapi
      for (const bulanKey of Object.keys(dataPerBulan)) {
        const jRef = doc(db, "security_monthly_schedules", bulanKey);
        
        // Ambil data yang sudah ada di bulan tersebut agar tidak tertimpa
        const jSnap = await getDoc(jRef);
        let existingData = {};
        if (jSnap.exists()) existingData = jSnap.data().data_hari || {};

        const mergedData = { ...existingData, ...dataPerBulan[bulanKey] };

        await setDoc(jRef, {
          bulan_tahun: bulanKey,
          data_hari: mergedData,
          dibuat_oleh: picName,
          waktu_update: serverTimestamp()
        }, { merge: true });
      }

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

  const getPeriodeText = () => {
    if (matriksJadwal.length === 0) return "Memuat...";
    const awal = matriksJadwal[0].tanggalStr.split("-").reverse().join("/");
    const akhir = matriksJadwal[matriksJadwal.length - 1].tanggalStr.split("-").reverse().join("/");
    return `${awal} s/d ${akhir}`;
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/dashboard/security")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 Danru Desk
        </div>
      </div>

      {/* HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PENYUSUNAN ROSTER</h1>
        <p style={{ margin: "0", fontSize: "13px", opacity: 0.9 }}>Pembuatan Jadwal Cerdas (Otomatis Pola 2-2-2)</p>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px", background: "#f8fafc", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", flexWrap: "wrap" }}>
            <span style={{ fontSize: "20px" }}>📅</span>
            <div style={{ display: "flex", gap: "10px", flex: 1, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568" }}>Pilih Awal Periode (Tgl 11):</span>
              <select value={bulanPilihan} onChange={(e) => setBulanPilihan(Number(e.target.value))} style={{ flex: 1, minWidth: "150px", padding: "10px", borderRadius: "8px", fontSize: "14px", fontWeight: "bold", border: "1px solid #cbd5e0", background: "white", outline: "none", cursor: "pointer" }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i+1} value={i+1}>{new Date(2026, i).toLocaleDateString("id-ID", { month: "long" })}</option>
                ))}
              </select>
              <select value={tahunPilihan} onChange={(e) => setTahunPilihan(Number(e.target.value))} style={{ padding: "10px", borderRadius: "8px", fontSize: "14px", fontWeight: "bold", border: "1px solid #cbd5e0", background: "white", outline: "none", cursor: "pointer" }}>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
            </div>
          </div>

          <div style={{ background: "#ebf8ff", border: "1px solid #bee3f8", padding: "12px 15px", borderRadius: "12px", marginBottom: "25px", fontSize: "12px", color: "#2b6cb0", display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold", lineHeight: "1.5" }}>
            <div style={{display: "flex", alignItems: "center", gap: "8px"}}><span style={{ fontSize: "16px" }}>💡</span> Cara Cepat Susun Jadwal:</div>
            <ul style={{margin: 0, paddingLeft: "30px", fontWeight: "normal"}}>
              <li>Atur shift HANYA pada baris pertama (Tanggal 11) di bawah ini.</li>
              <li>Klik tombol <b>&quot;Generate Otomatis&quot;</b>, sistem akan mengisi sisa hari sampai tanggal 10 dengan pola Rotasi (2 Pagi, 2 Malam, 2 Off).</li>
              <li>Jika ada yang Izin/Sakit, ubah manual pada hari yang bersangkutan.</li>
            </ul>
          </div>

          {isSuccess && (
            <div style={{ background: "#f0fff4", border: "1px solid #c6f6d5", color: "#22543d", padding: "15px", borderRadius: "12px", marginBottom: "20px", fontWeight: "bold", textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
              <span style={{ fontSize: "20px" }}>✅</span> Roster Periode {getPeriodeText()} sukses disimpan!
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
            
            {/* BARIS PERTAMA (TANGGAL 11) - DIBEDAKAN WARNANYA UNTUK MASTER */}
            {matriksJadwal.length > 0 && (
              <div style={{ border: "2px solid #3182ce", borderRadius: "16px", padding: "20px", background: "#ebf8ff", boxShadow: "0 4px 10px rgba(49, 130, 206, 0.1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "1px solid #bee3f8", paddingBottom: "10px" }}>
                  <div style={{ fontWeight: "900", color: "#2b6cb0", fontSize: "16px" }}>
                    ⭐ {matriksJadwal[0].namaHari}, {matriksJadwal[0].tanggalStr.split("-")[2]} (AWAL PERIODE)
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {timSecurity.map(karyawan => {
                    const shiftAktif = matriksJadwal[0].plotKaryawan[karyawan];
                    return (
                      <div key={karyawan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", background: "white", padding: "12px 15px", borderRadius: "10px", border: "1px solid #bee3f8" }}>
                        <span style={{ fontSize: "14px", fontWeight: "bold", color: "#1a202c", flex: 1, minWidth: "150px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "24px", height: "24px", background: "#e2e8f0", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "10px" }}>👮</span> {karyawan}
                        </span>
                        
                        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                          {["Shift 1", "Shift 2", "Off", "Izin"].map(s => (
                            <button
                              key={s} type="button" onClick={() => handleSetShift(0, karyawan, s)}
                              style={{ 
                                padding: "8px 12px", fontSize: "11px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", transition: "0.2s",
                                background: shiftAktif === s ? (s === "Off" ? "#e53e3e" : s === "Izin" ? "#dd6b20" : "#3182ce") : "#cbd5e0", color: "white" 
                              }}
                            >
                              {s === "Shift 1" ? "☀️ S1" : s === "Shift 2" ? "🌙 S2" : s === "Izin" ? "📝 Izin" : "❌ Off"}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* TOMBOL GENERATE MAGIC */}
                <button onClick={handleAutoGenerate} style={{ width: "100%", padding: "14px", background: "#2b6cb0", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", marginTop: "20px", boxShadow: "0 4px 6px rgba(43,108,176,0.3)", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                  <span style={{fontSize:"18px"}}>🪄</span> Generate Otomatis Untuk Sisa Bulan
                </button>
              </div>
            )}

            {/* SISA HARI (TANGGAL 12 KE ATAS) */}
            {matriksJadwal.slice(1).map((hari, idxOffset) => {
              const dayIdx = idxOffset + 1; // Karena di-slice, index aslinya + 1
              return (
                <div key={hari.tanggalStr} style={{ border: "1px solid #e2e8f0", borderRadius: "16px", padding: "20px", background: "#ffffff", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "1px solid #edf2f7", paddingBottom: "10px" }}>
                    <div style={{ fontWeight: "900", color: "#4a5568", fontSize: "15px" }}>
                      {hari.namaHari}, {hari.tanggalStr.split("-")[2]}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {timSecurity.map(karyawan => {
                      const shiftAktif = hari.plotKaryawan[karyawan];
                      return (
                        <div key={karyawan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", background: "#f8fafc", padding: "10px 15px", borderRadius: "10px", border: "1px solid #edf2f7" }}>
                          <span style={{ fontSize: "13px", fontWeight: "bold", color: "#2d3748", flex: 1, minWidth: "150px" }}>{karyawan}</span>
                          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                            {["Shift 1", "Shift 2", "Off", "Izin"].map(s => (
                              <button
                                key={s} type="button" onClick={() => handleSetShift(dayIdx, karyawan, s)}
                                style={{ 
                                  padding: "6px 10px", fontSize: "11px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", transition: "0.2s",
                                  background: shiftAktif === s ? (s === "Off" ? "#e53e3e" : s === "Izin" ? "#dd6b20" : "#3182ce") : "#cbd5e0", color: "white" 
                                }}
                              >
                                {s === "Shift 1" ? "☀️ S1" : s === "Shift 2" ? "🌙 S2" : s === "Izin" ? "📝 Izin" : "❌ Off"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleSimpanJadwal} disabled={isLoading}
            style={{ width: "100%", padding: "16px", background: isLoading ? "#a0aec0" : "#e53e3e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: "pointer", marginTop: "30px", boxShadow: "0 4px 6px rgba(229,62,62,0.3)", transition: "0.2s" }}
          >
            {isLoading ? "Menyimpan Data Roster..." : "🚀 Terbitkan Roster Resmi ke Portal"}
          </button>

        </div>
      </div>
    </div>
  );
}