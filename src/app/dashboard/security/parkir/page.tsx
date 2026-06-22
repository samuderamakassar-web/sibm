"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

// ==========================================
// INTERFACES
// ==========================================
interface KendaraanLog {
  id: string;
  petugas_security: string;
  kendaraan: string;
  status_kendaraan: string;
  driver_bertugas: string;
  tujuan_keperluan: string;
  kilometer_kendaraan: string;
  waktu_catat: Timestamp | null;
}

interface DriverStatusLog {
  id: string;
  nama_driver: string;
  status: string;
  waktu_ubah: Timestamp | null;
  petugas_security: string;
}

// ==========================================
// MASTER DATA (DATA ACTUAL ARMADA)
// ==========================================
const KENDARAAN_OPERASIONAL = [
  "BB 1164 XBC - Muhammad Yusuf (PT Makassar Jaya Samudera)",
  "B 2306 PZQ - Bernard Hutagaol (PT Makassar Jaya Samudera)",
  "B 2737 POJ - Agussalim (PT Samudera Agencies Indonesia)",
  "DD 1591 XBG - Saipul Mirah (PT SILkargo Indonesia)",
  "DD 1278 XCS - SML Operational (PT Samudera Makassar Logistik)",
  "DD 1412 XBO - Marketing/UMUM (PT Makassar Jaya Samudera)",
  "DD 1273 XBO - Wahyu Hermawan (PT Makassar Jaya Samudera)",
  "B 5597 KDB - Agusri (PT Samudera Makassar Logistik)",
  "B 2756 POI - Mildawaty (PT Samudera Perdana)",
  "DD 1384 XBN - PPNP OPS (PT Perusahaan Pelayaran Nusantara Panurjwan)",
  "B 1629 RKP - Mattias Hotma (PT Perusahaan Pelayaran Nusantara Panurjwan)"
];

const DAFTAR_DRIVER = [
  "Penanggung Jawab Kendaraan (PIC)",
  "Amal Setiawan",
  "Muhammad Renaldy",
  "Karyawan / Pimpinan Lainnya"
];

// Daftar Driver Murni untuk Card Manajemen Absensi Driver
const DRIVER_ONLY = ["Amal Setiawan", "Muhammad Renaldy"];

export default function LogOperasionalPage() {
  const router = useRouter();
  
  const [picName, setPicName] = useState<string>("");
  const [waktuSekarang, setWaktuSekarang] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  
  // Loading & Success States
  const [isLoadingMobil, setIsLoadingMobil] = useState<boolean>(false);
  const [isLoadingDriver, setIsLoadingDriver] = useState<boolean>(false);
  const [isSuccessMobil, setIsSuccessMobil] = useState<boolean>(false);
  const [isSuccessDriver, setIsSuccessDriver] = useState<boolean>(false);

  // 🚙 STATE FORM KENDARAAN
  const [kendaraan, setKendaraan] = useState<string>(KENDARAAN_OPERASIONAL[0]);
  const [statusMobil, setStatusMobil] = useState<string>("Keluar Beroperasi");
  const [driverMobil, setDriverMobil] = useState<string>(DAFTAR_DRIVER[0]);
  const [tujuan, setTujuan] = useState<string>("");
  const [kilometer, setKilometer] = useState<string>("");

  // 🧑‍✈️ STATE FORM STATUS DRIVER MURNI
  const [targetDriver, setTargetDriver] = useState<string>(DRIVER_ONLY[0]);
  const [statusDriver, setStatusDriver] = useState<string>("Standby");

  // STATE MONITORING (KANAN)
  const [searchTabel, setSearchTabel] = useState<string>("");
  const [daftarLogMobil, setDaftarLogMobil] = useState<KendaraanLog[]>([]);
  const [driverStatusTerkini, setDriverStatusTerkini] = useState<Record<string, DriverStatusLog>>({});

  // 1. Inisialisasi Jam Live & PIC
  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) {
      router.push("/shift-checkin");
      return;
    }
    
    setTimeout(() => {
      setPicName(nama);
      setIsReady(true);
    }, 0);

    const timer = setInterval(() => {
      setWaktuSekarang(new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" }));
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  // 2. Tarik Data Real-time (Mobil & Driver)
  useEffect(() => {
    // Stream Log Mobil
    const qMobil = query(collection(db, "operational_vehicle_logs"), orderBy("waktu_catat", "desc"));
    const unsubMobil = onSnapshot(qMobil, (snapshot) => {
      const logsArr: KendaraanLog[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        logsArr.push({
          id: docSnap.id,
          petugas_security: data.petugas_security || "-",
          kendaraan: data.kendaraan || "-",
          status_kendaraan: data.status_kendaraan || "-",
          driver_bertugas: data.driver_bertugas || "-",
          tujuan_keperluan: data.tujuan_keperluan || "-",
          kilometer_kendaraan: data.kilometer_kendaraan || "-",
          waktu_catat: data.waktu_catat || null
        });
      });
      setDaftarLogMobil(logsArr);
    });

    // Stream Status Driver
    const qDriver = query(collection(db, "driver_status_logs"), orderBy("waktu_ubah", "desc"));
    const unsubDriver = onSnapshot(qDriver, (snapshot) => {
      const statusMap: Record<string, DriverStatusLog> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const nama = data.nama_driver;
        if (nama && !statusMap[nama]) {
          statusMap[nama] = {
            id: docSnap.id,
            nama_driver: nama,
            status: data.status || "Standby",
            waktu_ubah: data.waktu_ubah || null,
            petugas_security: data.petugas_security || "-"
          };
        }
      });
      setDriverStatusTerkini(statusMap);
    });

    return () => { unsubMobil(); unsubDriver(); };
  }, []);

  // 3. Submit Log Mobil (DENGAN OTOMATISASI STATUS DRIVER)
  const handleSubmitMobil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (statusMobil === "Keluar Beroperasi" && !tujuan.trim()) {
      alert("Tujuan/Keperluan wajib diisi jika kendaraan keluar!");
      return;
    }

    setIsLoadingMobil(true);
    setIsSuccessMobil(false);

    try {
      // A. Simpan log kendaraan ke Firestore
      await addDoc(collection(db, "operational_vehicle_logs"), {
        petugas_security: picName,
        waktu_catat: serverTimestamp(),
        kendaraan: kendaraan,
        status_kendaraan: statusMobil,
        driver_bertugas: driverMobil,
        tujuan_keperluan: tujuan || "-",
        kilometer_kendaraan: kilometer || "Tidak dicatat",
      });

      // 💡 B. AUTO-UPDATE STATUS DRIVER (Hanya jika driver yang dipilih adalah Amal/Renaldy)
      if (DRIVER_ONLY.includes(driverMobil)) {
        let otomatisStatusDriver = "Standby";
        if (statusMobil === "Keluar Beroperasi" || statusMobil === "Masuk Bengkel / Service") {
          otomatisStatusDriver = "Keluar Beroperasi";
        }

        await addDoc(collection(db, "driver_status_logs"), {
          nama_driver: driverMobil,
          status: otomatisStatusDriver,
          waktu_ubah: serverTimestamp(),
          petugas_security: picName + " (Sistem Auto-Sync)"
        });
      }

      setIsSuccessMobil(true);
      setTujuan("");
      setKilometer("");
      setTimeout(() => setIsSuccessMobil(false), 4000);
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan data kendaraan.");
    } finally {
      setIsLoadingMobil(false);
    }
  };

  // 4. Submit Status Driver Murni (Manual via Card Bawah)
  const handleSubmitDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingDriver(true);
    setIsSuccessDriver(false);

    try {
      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: targetDriver,
        status: statusDriver,
        waktu_ubah: serverTimestamp(),
        petugas_security: picName
      });

      setIsSuccessDriver(true);
      setTimeout(() => setIsSuccessDriver(false), 4000);
    } catch (error) {
      console.error(error);
      alert("Gagal mengubah status driver.");
    } finally {
      setIsLoadingDriver(false);
    }
  };

  const formatWaktu = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const logMobilTerfilter = daftarLogMobil.filter((log) =>
    log.kendaraan.toLowerCase().includes(searchTabel.toLowerCase()) ||
    log.driver_bertugas.toLowerCase().includes(searchTabel.toLowerCase())
  );

  const sharedInputStyle = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "1px solid #cbd5e0",
    fontSize: "14px",
    background: "#f8fafc",
    outline: "none",
    boxSizing: "border-box" as const,
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
    transition: "all 0.2s",
    color: "#2d3748"
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
          👮 {picName}
        </div>
      </div>

      {/* HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>LOG OPERASIONAL GERBANG</h1>
        <p style={{ margin: "0 0 15px 0", fontSize: "13px", opacity: 0.9 }}>Manajemen terpisah status pergerakan armada dan kesiagaan team driver SIBM</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "6px 15px", borderRadius: "50px", fontSize: "12px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.3)" }}>
          🕒 {waktuSekarang || "Memuat waktu..."}
        </div>
      </div>

      {/* WRAPPER UTAMA SPLIT SCREEN */}
      <div style={{ maxWidth: "1250px", margin: "-20px auto 0", padding: "0 20px", position: "relative", zIndex: 10, display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" }}>
        
        {/* ============================================================== */}
        {/* SISI KIRI: KUMPULAN FORM INPUT */}
        {/* ============================================================== */}
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "25px" }}>
          
          {/* CARD 1: FORM KENDARAAN */}
          <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", boxSizing: "border-box" }}>
            <h3 style={{ marginTop: "0", color: "#2d3748", borderBottom: "2px solid #edf2f7", paddingBottom: "12px", display: "flex", alignItems: "center", gap: "10px", fontSize: "16px", fontWeight: "800" }}>
              <span style={{background:"#fff5f5", padding:"6px 10px", borderRadius:"10px"}}>🚙</span> LOG PERGERAKAN ARMADA
            </h3>
            {isSuccessMobil && (
              <div style={{ background: "#f0fff4", color: "#22543d", padding: "10px", borderRadius: "8px", marginBottom: "15px", fontSize: "12px", fontWeight: "bold", border: "1px solid #c6f6d5" }}>✓ Log armada dan status driver berhasil sinkron!</div>
            )}
            <form onSubmit={handleSubmitMobil} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "11px", color: "#718096" }}>PILIH ARMADA GEDUNG *</label>
                <select value={kendaraan} onChange={(e) => setKendaraan(e.target.value)} style={{...sharedInputStyle, fontWeight:"bold", fontSize: "13px"}}>
                  {KENDARAAN_OPERASIONAL.map(mobil => <option key={mobil} value={mobil}>{mobil}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "11px", color: "#718096" }}>AKTIVITAS MOBIL *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  {["Keluar Beroperasi", "Tiba di Kantor (Standby)", "Masuk Bengkel / Service"].map((st) => (
                    <div 
                      key={st} onClick={() => setStatusMobil(st)}
                      style={{
                        padding: "10px 5px", borderRadius: "10px", cursor: "pointer", textAlign: "center", fontWeight: "bold", fontSize: "11px", transition: "0.2s",
                        border: statusMobil === st ? "2px solid #3182ce" : "1px solid #e2e8f0",
                        background: statusMobil === st ? "#ebf8ff" : "#f8fafc",
                        color: statusMobil === st ? "#2b6cb0" : "#718096"
                      }}
                    >
                      {st === "Keluar Beroperasi" ? "🛫 Keluar" : st === "Tiba di Kantor (Standby)" ? "🛬 Standby" : "🛠️ Service"}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "11px", color: "#718096" }}>SIAPA YANG MEMBAWA KENDARAAN? *</label>
                <select value={driverMobil} onChange={(e) => setDriverMobil(e.target.value)} style={sharedInputStyle}>
                  {DAFTAR_DRIVER.map(drv => <option key={drv} value={drv}>{drv}</option>)}
                </select>
                {DRIVER_ONLY.includes(driverMobil) && (
                  <div style={{ fontSize: "10px", color: "#38a169", marginTop: "5px", fontWeight: "bold" }}>💡 Info: Status absensi driver ini akan ikut ter-update otomatis.</div>
                )}
              </div>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "11px", color: "#718096" }}>TUJUAN / KEPERLUAN PERJALANAN</label>
                <textarea placeholder="Contoh: Mengantar dokumen ke Pelabuhan..." value={tujuan} onChange={(e) => setTujuan(e.target.value)} style={{ ...sharedInputStyle, height: "60px", resize: "none" }} />
              </div>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "11px", color: "#718096" }}>SPEEDOMETER (KM)</label>
                <input type="number" placeholder="KM saat ini (Opsional)" value={kilometer} onChange={(e) => setKilometer(e.target.value)} style={sharedInputStyle} />
              </div>
              <button type="submit" disabled={isLoadingMobil} style={{ width: "100%", padding: "14px", background: "#3182ce", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer" }}>
                {isLoadingMobil ? "Menyimpan..." : "💾 Kirim Log Armada"}
              </button>
            </form>
          </div>

          {/* CARD 2: FORM STATUS DRIVER MURNI */}
          <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", boxSizing: "border-box" }}>
            <h3 style={{ marginTop: "0", color: "#2d3748", borderBottom: "2px solid #edf2f7", paddingBottom: "12px", display: "flex", alignItems: "center", gap: "10px", fontSize: "16px", fontWeight: "800" }}>
              <span style={{background:"#ebf8ff", padding:"6px 10px", borderRadius:"10px"}}>🧑‍✈️</span> KOREKSI MANUAL ABSENSI DRIVER
            </h3>
            {isSuccessDriver && (
              <div style={{ background: "#f0fff4", color: "#22543d", padding: "10px", borderRadius: "8px", marginBottom: "15px", fontSize: "12px", fontWeight: "bold", border: "1px solid #c6f6d5" }}>✓ Status kesiagaan Driver diperbarui!</div>
            )}
            <form onSubmit={handleSubmitDriver} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "11px", color: "#718096" }}>PILIH NAMA DRIVER *</label>
                <select value={targetDriver} onChange={(e) => setTargetDriver(e.target.value)} style={{...sharedInputStyle, fontWeight:"bold"}}>
                  {DRIVER_ONLY.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "11px", color: "#718096" }}>KONDISI DRIVER SAAT INI *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  {["Standby", "Keluar Beroperasi", "Off Duty / Izin"].map((sd) => (
                    <div 
                      key={sd} onClick={() => setStatusDriver(sd)}
                      style={{
                        padding: "12px 5px", borderRadius: "10px", cursor: "pointer", textAlign: "center", fontWeight: "bold", fontSize: "11px", transition: "0.2s",
                        border: statusDriver === sd ? "2px solid #2f855a" : "1px solid #e2e8f0",
                        background: statusDriver === sd ? "#e6fffa" : "#f8fafc",
                        color: statusDriver === sd ? "#234e52" : "#718096"
                      }}
                    >
                      {sd === "Standby" ? "🟢 Standby" : sd === "Keluar Beroperasi" ? "🔴 Keluar" : "⚪ Off / Izin"}
                    </div>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={isLoadingDriver} style={{ width: "100%", padding: "14px", background: "#2f855a", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", marginTop: "5px" }}>
                {isLoadingDriver ? "Memperbarui..." : "🔄 Update Manual Personel"}
              </button>
            </form>
          </div>

        </div>

        {/* ============================================================== */}
        {/* SISI KANAN: MONITORING MONITOR REAL-TIME */}
        {/* ============================================================== */}
        <div style={{ flex: "2 1 550px", display: "flex", flexDirection: "column", gap: "25px", boxSizing: "border-box" }}>
          
          {/* PANEL KANAN ATAS: MONITOR STATUS SIAGA DRIVER TERKINI */}
          <div style={{ background: "white", padding: "20px", borderRadius: "20px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
            <h4 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "15px", fontWeight: "800" }}>👥 STATUS KESIAGAAN DRIVER TERKINI (REAL-TIME)</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "15px" }}>
              {DRIVER_ONLY.map(nama => {
                const liveStatus = driverStatusTerkini[nama];
                const statusStr = liveStatus ? liveStatus.status : "Standby";
                
                return (
                  <div key={nama} style={{ padding: "15px", borderRadius: "14px", border: "1px solid #e2e8f0", background: statusStr === "Standby" ? "#f0fff4" : statusStr === "Keluar Beroperasi" ? "#fff5f5" : "#f7fafc", display: "flex", flexDirection: "column", gap: "6px", transition: "0.3s" }}>
                    <div style={{ fontWeight: "800", color: "#2d3748", fontSize: "14px" }}>🧑‍✈️ {nama}</div>
                    <div style={{ marginTop: "2px" }}>
                      <span style={{ 
                        fontSize: "10px", fontWeight: "bold", padding: "3px 8px", borderRadius: "6px",
                        background: statusStr === "Standby" ? "#c6f6d5" : statusStr === "Keluar Beroperasi" ? "#fed7d7" : "#e2e8f0",
                        color: statusStr === "Standby" ? "#22543d" : statusStr === "Keluar Beroperasi" ? "#9b2c2c" : "#4a5568"
                      }}>
                        {statusStr === "Standby" ? "🟢 STANDBY DI POS" : statusStr === "Keluar Beroperasi" ? "🔴 SEDANG KELUAR" : "⚪ OFF DUTY / IZIN"}
                      </span>
                    </div>
                    <div style={{ fontSize: "10px", color: "#cbd5e0", marginTop: "5px", fontWeight:"bold" }}>
                      Diperbarui: {liveStatus ? formatWaktu(liveStatus.waktu_ubah) : "Bawaan Sistem"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PANEL KANAN BAWAH: TABEL MONITOR PERGERAKAN MOBIL */}
          <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ margin: 0, color: "#2d3748", fontSize: "16px", fontWeight: "800" }}>📋 LOG AKTIVITAS MOBIL HARI INI</h3>
              <input 
                type="text" placeholder="🔍 Cari mobil / driver..." value={searchTabel}
                onChange={(e) => setSearchTabel(e.target.value)}
                style={{ ...sharedInputStyle, padding: "10px 15px", borderRadius: "20px", width: "220px" }}
              />
            </div>

            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                    <th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0" }}>Mobil Operasional</th>
                    <th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0" }}>Driver Pengendara</th>
                    <th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0" }}>Tujuan & KM</th>
                    <th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0" }}>Waktu & Petugas</th>
                  </tr>
                </thead>
                <tbody>
                  {logMobilTerfilter.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "#a0aec0", padding: "40px 20px" }}>📭 Belum ada riwayat pergerakan hari ini.</td>
                    </tr>
                  ) : (
                    logMobilTerfilter.map((log) => {
                      const isStandby = log.status_kendaraan.includes("Standby");
                      const isBengkel = log.status_kendaraan.includes("Bengkel");
                      
                      return (
                        <tr key={log.id} style={{ borderBottom: "1px solid #edf2f7" }}>
                          <td style={{ padding: "12px 15px" }}>
                            <div style={{ fontWeight: "bold", color: "#2d3748" }}>{log.kendaraan.split(" - ")[0]}</div>
                            <div style={{ marginTop: "4px" }}>
                              <span style={{ 
                                fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px",
                                background: isStandby ? "#c6f6d5" : isBengkel ? "#e2e8f0" : "#fff5f5",
                                color: isStandby ? "#22543d" : isBengkel ? "#4a5568" : "#c53030"
                              }}>
                                {isStandby ? "🟢 STANDBY" : isBengkel ? "🛠️ SERVICE" : "🔴 KELUAR POOL"}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: "12px 15px", color: "#2b6cb0", fontWeight: "800" }}>{log.driver_bertugas}</td>
                          <td style={{ padding: "12px 15px", color: "#4a5568" }}>
                            <div style={{ fontStyle: "italic", fontSize:"12px" }}>&quot;{log.tujuan_keperluan}&quot;</div>
                            <div style={{ fontSize: "11px", color: "#a0aec0", marginTop: "3px" }}>📟 KM: {log.kilometer_kendaraan}</div>
                          </td>
                          <td style={{ padding: "12px 15px" }}>
                            <div style={{ fontWeight: "bold", color:"#4a5568" }}>{formatWaktu(log.waktu_catat)}</div>
                            <div style={{ fontSize: "11px", color: "#cbd5e0", marginTop: "2px" }}>👮 {log.petugas_security.split(" ")[0]}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}