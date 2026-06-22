"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, limit, Timestamp, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";

// ==========================================
// INTERFACES
// ==========================================
interface KendaraanLog {
  id: string;
  kendaraan: string;
  status_kendaraan: string;
  tujuan_keperluan: string;
  kilometer_kendaraan: string;
  waktu_catat: Timestamp | null;
}

// ==========================================
// MASTER DATA ARMADA
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

const DRIVER_ONLY = ["Amal Setiawan", "Muhammad Renaldy"];

export default function DriverDashboardPage() {
  const router = useRouter();
  
  const [waktuSekarang, setWaktuSekarang] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  
  // 💡 STATE CHECK-IN (Identitas Spesifik)
  const [activeDriver, setActiveDriver] = useState<string>("");
  const [showCheckIn, setShowCheckIn] = useState<boolean>(true);

  // States Loading & Data
  const [isLoadingPersonel, setIsLoadingPersonel] = useState<boolean>(false);
  const [isLoadingMobil, setIsLoadingMobil] = useState<boolean>(false);
  const [statusTerkini, setStatusTerkini] = useState<string>("Memuat...");

  // State Form Mobil
  const [kendaraan, setKendaraan] = useState<string>(KENDARAAN_OPERASIONAL[0]);
  const [statusMobil, setStatusMobil] = useState<string>("Keluar Beroperasi");
  const [tujuan, setTujuan] = useState<string>("");
  const [kilometer, setKilometer] = useState<string>("");

  // Riwayat Terakhir
  const [riwayatKu, setRiwayatKu] = useState<KendaraanLog[]>([]);

  // 1. Cek Login Otentikasi
  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const dept = localStorage.getItem("pic_dept");

    if (!role || dept !== "Driver") {
      alert("Akses Ditolak! Halaman ini khusus Tim Driver.");
      router.push("/");
      return;
    }
    
    // Cek apakah driver sudah memilih identitas di sesi ini
    setTimeout(() => {
      const savedDriver = localStorage.getItem("active_driver_name");
      if (savedDriver) {
        setActiveDriver(savedDriver);
        setShowCheckIn(false);
      }
      setIsReady(true);
    }, 0);

    const timer = setInterval(() => {
      setWaktuSekarang(new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" }));
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  // 2. Tarik Riwayat Real-time Khusus Driver yang Sedang Aktif
  useEffect(() => {
    if (!activeDriver) return;

    // Tarik Status Personel Terkini
    const qStatus = query(collection(db, "driver_status_logs"), where("nama_driver", "==", activeDriver), orderBy("waktu_ubah", "desc"), limit(1));
    const unsubStatus = onSnapshot(qStatus, (snap) => {
      if (!snap.empty) {
        setStatusTerkini(snap.docs[0].data().status);
      } else {
        setStatusTerkini("Standby"); // Default jika belum ada riwayat
      }
    });

    // Tarik Riwayat Bawa Mobil
    const qMobil = query(collection(db, "operational_vehicle_logs"), where("driver_bertugas", "==", activeDriver), orderBy("waktu_catat", "desc"), limit(5));
    const unsubMobil = onSnapshot(qMobil, (snap) => {
      const logsArr: KendaraanLog[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        logsArr.push({
          id: docSnap.id,
          kendaraan: data.kendaraan,
          status_kendaraan: data.status_kendaraan,
          tujuan_keperluan: data.tujuan_keperluan,
          kilometer_kendaraan: data.kilometer_kendaraan,
          waktu_catat: data.waktu_catat
        });
      });
      setRiwayatKu(logsArr);
    });

    return () => { unsubStatus(); unsubMobil(); };
  }, [activeDriver]);

  // 💡 FUNGSI CHECK-IN DRIVER
  const handlePilihIdentitas = (nama: string) => {
    localStorage.setItem("active_driver_name", nama);
    setActiveDriver(nama);
    setShowCheckIn(false);
  };

  const handleLogoutPenuh = () => {
    localStorage.clear();
    router.push("/");
  };

  const handleGantiIdentitas = () => {
    localStorage.removeItem("active_driver_name");
    setActiveDriver("");
    setShowCheckIn(true);
  };

  // 3. Fungsi Update Status Personel Cepat (Jika keluar tanpa mobil kantor)
  const handleUpdateStatusPersonel = async (statusBaru: string) => {
    setIsLoadingPersonel(true);
    try {
      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: activeDriver,
        status: statusBaru,
        waktu_ubah: serverTimestamp(),
        petugas_security: "Aplikasi Driver" 
      });
      alert(`✅ Status Anda berhasil diubah menjadi: ${statusBaru}`);
    } catch (error) {
      console.error(error);
      alert("Gagal mengupdate status.");
    } finally {
      setIsLoadingPersonel(false);
    }
  };

  // 4. Fungsi Submit Log Mobil (Sistem Auto-Sync)
  const handleSubmitMobil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (statusMobil === "Keluar Beroperasi" && !tujuan.trim()) {
      return alert("Tujuan/Keperluan wajib diisi jika membawa mobil keluar!");
    }

    setIsLoadingMobil(true);
    try {
      // A. Simpan log kendaraan
      await addDoc(collection(db, "operational_vehicle_logs"), {
        petugas_security: "Aplikasi Driver",
        waktu_catat: serverTimestamp(),
        kendaraan: kendaraan,
        status_kendaraan: statusMobil,
        driver_bertugas: activeDriver, // 💡 Mengunci nama spesifik (Amal/Renaldy)
        tujuan_keperluan: tujuan || "-",
        kilometer_kendaraan: kilometer || "Tidak dicatat",
      });

      // B. AUTO-UPDATE STATUS DRIVER
      let otomatisStatusDriver = "Standby";
      if (statusMobil === "Keluar Beroperasi" || statusMobil === "Masuk Bengkel / Service") {
        otomatisStatusDriver = "Keluar Beroperasi";
      }

      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: activeDriver, // 💡 Sinkron ke identitas spesifik
        status: otomatisStatusDriver,
        waktu_ubah: serverTimestamp(),
        petugas_security: "Aplikasi Driver (Auto-Sync)"
      });

      alert("✅ Log Perjalanan & KM berhasil disimpan!");
      setTujuan("");
      setKilometer("");
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan data kendaraan.");
    } finally {
      setIsLoadingMobil(false);
    }
  };

  const formatWaktu = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return ts.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const sharedInputStyle = {
    width: "100%", padding: "16px", borderRadius: "14px", border: "1px solid #cbd5e0",
    fontSize: "15px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const,
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s", color: "#2d3748"
  };

  if (!isReady) return null;

  // 💡 RENDER LAYAR MINI CHECK-IN
  if (showCheckIn) {
    return (
      <div style={{ backgroundColor: "#1a365d", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ background: "white", width: "100%", maxWidth: "400px", padding: "40px 30px", borderRadius: "24px", textAlign: "center", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: "50px", marginBottom: "15px" }}>🧑‍✈️</div>
          <h2 style={{ margin: "0 0 5px 0", color: "#2d3748", fontSize: "22px", fontWeight: "900" }}>Pilih Identitas Driver</h2>
          <p style={{ margin: "0 0 30px 0", color: "#718096", fontSize: "14px" }}>Siapa yang bertugas memegang alat ini?</p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {DRIVER_ONLY.map(drv => (
              <button 
                key={drv} onClick={() => handlePilihIdentitas(drv)}
                style={{ padding: "18px", borderRadius: "14px", border: "2px solid #e2e8f0", background: "#f8fafc", color: "#2b6cb0", fontSize: "16px", fontWeight: "bold", cursor: "pointer", transition: "0.2s", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}
                onMouseOver={(e) => { e.currentTarget.style.background = "#ebf8ff"; e.currentTarget.style.borderColor = "#90cdf4"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
              >
                {drv}
              </button>
            ))}
          </div>

          <button onClick={handleLogoutPenuh} style={{ marginTop: "30px", background: "transparent", border: "none", color: "#e53e3e", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}>
            ← Kembali ke Portal Utama
          </button>
        </div>
      </div>
    );
  }

  // RENDER DASHBOARD DRIVER NORMAL
  return (
    <div style={{ backgroundColor: "#f1f5f9", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "80px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ fontWeight: "900", color: "#e53e3e", fontSize: "18px", letterSpacing: "1px" }}>SIBM <span style={{color:"#2d3748"}}>DRIVER</span></div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={handleGantiIdentitas} style={{ background: "#edf2f7", color: "#4a5568", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", border: "none", cursor: "pointer" }}>
            🔄 Ganti Akun
          </button>
          <button onClick={handleLogoutPenuh} style={{ background: "#fff5f5", color: "#e53e3e", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", border: "1px solid #fed7d7", cursor: "pointer" }}>
            Log Out
          </button>
        </div>
      </div>

      {/* 🔹 HERO SECTION PROFILE */}
      <div style={{ background: "linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%)", padding: "30px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(43, 108, 176, 0.2)" }}>
        <div style={{ fontSize: "50px", marginBottom: "10px" }}>🧑‍✈️</div>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "22px", fontWeight: "900" }}>Halo, {activeDriver.split(" ")[0]}!</h1>
        <p style={{ margin: "0 0 15px 0", fontSize: "13px", opacity: 0.9 }}>Dashboard Operasional Pengemudi</p>
        <div style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 20px", borderRadius: "50px", fontSize: "12px", fontWeight: "bold", display: "inline-block", border: "1px solid rgba(255,255,255,0.3)" }}>
          {waktuSekarang}
        </div>
      </div>

      <div style={{ maxWidth: "500px", margin: "-30px auto 0", padding: "0 15px", display: "flex", flexDirection: "column", gap: "20px", position: "relative", zIndex: 10 }}>
        
        {/* 🔹 CARD 1: STATUS KESIAGAAN INSTAN */}
        <div style={{ background: "white", padding: "20px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, color: "#2d3748", fontSize: "15px", fontWeight: "800" }}>📡 Status Anda Saat Ini:</h3>
            <span style={{ fontSize: "11px", fontWeight: "bold", padding: "6px 12px", borderRadius: "8px", background: statusTerkini === "Standby" ? "#c6f6d5" : statusTerkini === "Keluar Beroperasi" ? "#fed7d7" : "#e2e8f0", color: statusTerkini === "Standby" ? "#22543d" : statusTerkini === "Keluar Beroperasi" ? "#9b2c2c" : "#4a5568" }}>
              {statusTerkini === "Standby" ? "🟢 STANDBY" : statusTerkini === "Keluar Beroperasi" ? "🔴 KELUAR" : "⚪ OFF DUTY"}
            </span>
          </div>
          
          <p style={{ fontSize: "12px", color: "#718096", marginBottom: "15px", lineHeight: "1.5" }}>Tekan tombol di bawah jika Anda keluar/pulang <b>tanpa membawa armada kantor</b> (misal: naik motor/kendaraan pribadi).</p>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button disabled={isLoadingPersonel} onClick={() => handleUpdateStatusPersonel("Keluar Beroperasi")} style={{ padding: "14px", background: "#fff5f5", color: "#c53030", border: "2px solid #feb2b2", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", transition: "0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
              <span style={{ fontSize: "20px" }}>🏃‍♂️</span> Keluar Pos
            </button>
            <button disabled={isLoadingPersonel} onClick={() => handleUpdateStatusPersonel("Standby")} style={{ padding: "14px", background: "#f0fff4", color: "#2f855a", border: "2px solid #9ae6b4", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", transition: "0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
              <span style={{ fontSize: "20px" }}>🛋️</span> Kembali Standby
            </button>
          </div>
        </div>

        {/* 🔹 CARD 2: FORM BAWA KENDARAAN */}
        <div style={{ background: "white", padding: "25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "16px", fontWeight: "900", borderBottom: "2px solid #edf2f7", paddingBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{background: "#ebf8ff", padding: "6px", borderRadius: "8px"}}>🚙</span> Form Bawa Armada
          </h3>

          <form onSubmit={handleSubmitMobil} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>PILIH MOBIL OPERASIONAL *</label>
              <select value={kendaraan} onChange={(e) => setKendaraan(e.target.value)} style={{...sharedInputStyle, fontWeight:"bold", border: "2px solid #cbd5e0"}}>
                {KENDARAAN_OPERASIONAL.map(mobil => <option key={mobil} value={mobil}>{mobil}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>AKTIVITAS *</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div onClick={() => setStatusMobil("Keluar Beroperasi")} style={{ padding: "12px", borderRadius: "12px", cursor: "pointer", textAlign: "center", fontWeight: "bold", fontSize: "13px", border: statusMobil === "Keluar Beroperasi" ? "2px solid #fc8181" : "1px solid #e2e8f0", background: statusMobil === "Keluar Beroperasi" ? "#fff5f5" : "#f8fafc", color: statusMobil === "Keluar Beroperasi" ? "#c53030" : "#718096" }}>
                  🛫 Keluar Pool
                </div>
                <div onClick={() => setStatusMobil("Tiba di Kantor (Standby)")} style={{ padding: "12px", borderRadius: "12px", cursor: "pointer", textAlign: "center", fontWeight: "bold", fontSize: "13px", border: statusMobil === "Tiba di Kantor (Standby)" ? "2px solid #68d391" : "1px solid #e2e8f0", background: statusMobil === "Tiba di Kantor (Standby)" ? "#f0fff4" : "#f8fafc", color: statusMobil === "Tiba di Kantor (Standby)" ? "#22543d" : "#718096" }}>
                  🛬 Tiba (Selesai)
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>TUJUAN PERJALANAN</label>
              <textarea placeholder={statusMobil === "Keluar Beroperasi" ? "Wajib diisi..." : "Contoh: Selesai antar manajemen..."} value={tujuan} onChange={(e) => setTujuan(e.target.value)} style={{ ...sharedInputStyle, height: "70px", resize: "none" }} />
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>ANGKA SPEEDOMETER (KM) AWAL/AKHIR</label>
              <input type="number" placeholder="Contoh: 45200" value={kilometer} onChange={(e) => setKilometer(e.target.value)} style={{...sharedInputStyle, fontSize: "18px", fontWeight: "bold"}} />
            </div>

            <button type="submit" disabled={isLoadingMobil} style={{ width: "100%", padding: "18px", background: "#2b6cb0", color: "white", border: "none", borderRadius: "14px", fontWeight: "900", fontSize: "15px", cursor: isLoadingMobil ? "not-allowed" : "pointer", marginTop: "5px", boxShadow: "0 4px 15px rgba(43, 108, 176, 0.3)" }}>
              {isLoadingMobil ? "Menyimpan Data..." : "💾 Kirim Laporan Armada"}
            </button>
          </form>
        </div>

        {/* 🔹 CARD 3: RIWAYAT SAYA HARI INI */}
        <div style={{ background: "white", padding: "20px", borderRadius: "24px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "14px", fontWeight: "800" }}>🕒 Riwayat Armada Terakhir Anda</h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {riwayatKu.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px", color: "#a0aec0", fontSize: "13px", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e0" }}>Belum ada log armada dari Anda.</div>
            ) : (
              riwayatKu.map((log) => {
                const isStandby = log.status_kendaraan.includes("Standby");
                return (
                  <div key={log.id} style={{ padding: "12px", border: "1px solid #edf2f7", borderRadius: "12px", background: isStandby ? "#f0fff4" : "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                      <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "13px" }}>{log.kendaraan.split(" - ")[0]}</span>
                      <span style={{ fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", background: isStandby ? "#c6f6d5" : "#fed7d7", color: isStandby ? "#22543d" : "#9b2c2c" }}>
                        {isStandby ? "TIBA" : "KELUAR"}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#4a5568", fontStyle: "italic", marginBottom: "5px" }}>&quot;{log.tujuan_keperluan}&quot;</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#a0aec0", fontWeight: "bold" }}>
                      <span>📟 KM: {log.kilometer_kendaraan}</span>
                      <span>{formatWaktu(log.waktu_catat)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}