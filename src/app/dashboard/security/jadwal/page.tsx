"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

interface SlotHarian {
  tanggalStr: string; 
  namaHari: string;   
  isWeekendKhusus: boolean; 
  plotKaryawan: Record<string, string>; 
}

const TIM_SECURITY = ["Awaluddin (Danru)", "Agusrahman", "Ibrahim"];
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
  
  // State Utama Kalender Bulanan
  const [matriksJadwal, setMatriksJadwal] = useState<SlotHarian[]>([]);

  // =========================================================================
  // 1. DEKLARASI FUNGSI DULU (Bungkus useCallback agar linter React bahagia)
  // =========================================================================
  const generateKalenderKosong = useCallback(async () => {
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
      TIM_SECURITY.forEach(karyawan => {
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
  }, [bulanPilihan, tahunPilihan]); // Efek ini akan di-update kalau bulan/tahun diubah

  // =========================================================================
  // 2. BARU DIPANGGIL OLEH USE-EFFECT SETELAH DIDEKLARASIKAN
  // =========================================================================
  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      if (!nama || !nama.toLowerCase().includes("awaluddin")) {
        alert("Akses Ditolak! Halaman ini khusus Komandan Regu (Danru).");
        router.push("/dashboard/security");
        return;
      }
      setPicName(nama);
      
      // Sekarang aman dipanggil karena posisinya di bawah deklarasi
      generateKalenderKosong(); 
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
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1000px", margin: "0 auto", background: "#f7fafc", minHeight: "100vh" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button onClick={() => router.push("/dashboard/security")} style={{ padding: "8px 12px", background: "#e2e8f0", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
          ⬅ Kembali ke Dashboard
        </button>
        <div style={{ fontSize: "13px", fontWeight: "bold", color: "#2b6cb0", background: "#ebf8ff", padding: "5px 15px", borderRadius: "20px" }}>
          👑 Meja Roster Danru
        </div>
      </div>

      <div style={{ background: "white", padding: "25px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: "0 0 5px 0", color: "#2c5282" }}>📅 Penyusunan Roster Bulanan Security</h2>
        <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "14px" }}>Cukup klik/centang pilihan shift. Hari Jumat-Minggu otomatis dikunci menjadi 1 shift kerja bergantian.</p>

        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", background: "#edf2f7", padding: "15px", borderRadius: "6px" }}>
          <select value={bulanPilihan} onChange={(e) => setBulanPilihan(Number(e.target.value))} style={{ padding: "10px", borderRadius: "4px", fontSize: "14px", fontWeight: "bold" }}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i+1} value={i+1}>{new Date(2026, i).toLocaleDateString("id-ID", { month: "long" })}</option>
            ))}
          </select>
          <select value={tahunPilihan} onChange={(e) => setTahunPilihan(Number(e.target.value))} style={{ padding: "10px", borderRadius: "4px", fontSize: "14px", fontWeight: "bold" }}>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>

        {isSuccess && (
          <div style={{ background: "#c6f6d5", color: "#22543d", padding: "12px", borderRadius: "6px", marginBottom: "20px", fontWeight: "bold", textAlign: "center" }}>
            ✓ Roster bulanan sukses diterbitkan!
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          {matriksJadwal.map((hari, dayIdx) => (
            <div key={hari.tanggalStr} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "15px", background: hari.isWeekendKhusus ? "#fffaf0" : "#fff" }}>
              <div style={{ fontWeight: "bold", color: hari.isWeekendKhusus ? "#dd6b20" : "#2d3748", marginBottom: "10px", borderBottom: "1px solid #edf2f7", paddingBottom: "5px" }}>
                📅 {hari.namaHari}, {hari.tanggalStr.split("-")[2]} ({hari.isWeekendKhusus ? "Weekend 1 Shift" : "Weekday 3 Shift"})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {TIM_SECURITY.map(karyawan => {
                  const shiftAktif = hari.plotKaryawan[karyawan];
                  return (
                    <div key={karyawan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", background: "#f7fafc", padding: "8px 12px", borderRadius: "6px" }}>
                      <span style={{ fontSize: "14px", fontWeight: "bold", color: "#4a5568", minWidth: "150px" }}>👤 {karyawan}</span>
                      
                      <div style={{ display: "flex", gap: "5px" }}>
                        {hari.isWeekendKhusus ? (
                          <>
                            {["Masuk", "Off"].map(s => (
                              <button
                                key={s} type="button" onClick={() => handleSetShift(dayIdx, karyawan, s)}
                                style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "4px", border: "none", cursor: "pointer", fontWeight: "bold", background: shiftAktif === s ? (s === "Masuk" ? "#38a169" : "#e53e3e") : "#cbd5e0", color: "white" }}
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
                                style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "4px", border: "none", cursor: "pointer", fontWeight: "bold", background: shiftAktif === s ? (s === "Off" ? "#e53e3e" : "#3182ce") : "#cbd5e0", color: "white" }}
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
          style={{ width: "100%", padding: "15px", background: isLoading ? "#a0aec0" : "#2c5282", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer", marginTop: "30px" }}
        >
          {isLoading ? "Menyimpan Data Roster..." : "🚀 Terbitkan Roster Bulanan Resmi"}
        </button>

      </div>
    </div>
  );
}