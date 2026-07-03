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

interface OvertimeItemRequest {
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  area_ruangan: string;
  alasan: string;
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

export default function DriverDashboardPage() {
  const router = useRouter();
  
  const [waktuSekarang, setWaktuSekarang] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  
  // Identitas Spesifik dari Login Global
  const [activeDriver, setActiveDriver] = useState<string>("");

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

  // STATE MODAL OVERTIME
  const todayISO = new Date().toISOString().split("T")[0];
  const [activeModal, setActiveModal] = useState<"none" | "lembur">("none");
  const [isLemburLoading, setIsLemburLoading] = useState(false);
  const [periodeLembur, setPeriodeLembur] = useState("11 Juni - 10 Juli 2026");
  const [formLemburItems, setFormLemburItems] = useState<OvertimeItemRequest[]>([
    { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Perjalanan Dinas Luar Kota / Lembur", alasan: "Antar Jemput Manajemen" }
  ]);

  // 1. Cek Login Otentikasi Langsung
  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const dept = localStorage.getItem("pic_dept");
    const nama = localStorage.getItem("pic_nama");

    if (!role || dept !== "Driver") {
      alert("Akses Ditolak! Halaman ini khusus Tim Driver.");
      router.push("/");
      return;
    }
    
    // Set Identitas langsung dari LocalStorage (Bypass Check-in)
    setTimeout(() => {
      setActiveDriver(nama || "Driver");
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

  const handleLogout = () => {
    localStorage.clear();
    router.push("/");
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
        driver_bertugas: activeDriver, 
        tujuan_keperluan: tujuan || "-",
        kilometer_kendaraan: kilometer || "Tidak dicatat",
      });

      // B. AUTO-UPDATE STATUS DRIVER
      let otomatisStatusDriver = "Standby";
      if (statusMobil === "Keluar Beroperasi" || statusMobil === "Masuk Bengkel / Service") {
        otomatisStatusDriver = "Keluar Beroperasi";
      }

      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: activeDriver, 
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

  // 💡 HANDLERS MULTI-ROW OVERTIME
  const handleAddLemburRow = () => {
    setFormLemburItems([...formLemburItems, { tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Perjalanan Dinas Luar Kota / Lembur", alasan: "Antar Jemput Manajemen" }]);
  };

  const handleRemoveLemburRow = (index: number) => {
    const newItems = [...formLemburItems];
    newItems.splice(index, 1);
    setFormLemburItems(newItems);
  };

  const handleLemburRowChange = (index: number, field: keyof OvertimeItemRequest, value: string) => {
    const newItems = [...formLemburItems];
    newItems[index][field] = value;
    setFormLemburItems(newItems);
  };

  const handleSubmitLemburKolektif = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formLemburItems.some(i => !i.tanggal || !i.jam_mulai || !i.jam_selesai || !i.area_ruangan || !i.alasan)) {
      return alert("Mohon lengkapi seluruh kolom tanggal, jam, dan keterangan lembur yang Anda tambahkan!");
    }
    setIsLemburLoading(true);
    try {
      const dept = localStorage.getItem("pic_dept") || "Driver";
      await addDoc(collection(db, "ga_overtime_requests"), {
        nama_pemohon: activeDriver,
        departemen: dept,
        periode: periodeLembur, 
        items: formLemburItems,  
        status: "Menunggu Approval GA",
        waktu_request: serverTimestamp()
      });
      alert(`✅ Berhasil! ${formLemburItems.length} klaim lembur Anda untuk periode ${periodeLembur} telah dikirim ke Admin GA.`);
      setFormLemburItems([{ tanggal: todayISO, jam_mulai: "", jam_selesai: "", area_ruangan: "Perjalanan Dinas Luar Kota / Lembur", alasan: "Antar Jemput Manajemen" }]);
      setActiveModal("none");
    } catch (error) {
      console.error(error);
      alert("❌ Gagal mengirim rekapan klaim lembur.");
    } finally {
      setIsLemburLoading(false);
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

  return (
    <div style={{ backgroundColor: "#f1f5f9", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "100px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ fontWeight: "900", color: "#e53e3e", fontSize: "18px", letterSpacing: "1px" }}>SIBM <span style={{color:"#2d3748"}}>DRIVER</span></div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={handleLogout} style={{ background: "#fff5f5", color: "#e53e3e", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", border: "1px solid #fed7d7", cursor: "pointer" }}>
            Keluar ➔
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

      {/* 💡 FLOATING ACTION BUTTON (FAB) UNTUK KLAIM LEMBUR */}
      <button 
        onClick={() => setActiveModal("lembur")}
        style={{
          position: "fixed",
          bottom: "30px",
          right: "30px",
          background: "#d69e2e",
          color: "white",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          border: "none",
          boxShadow: "0 10px 25px rgba(214, 158, 46, 0.5)",
          cursor: "pointer",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "28px",
          zIndex: 90,
          transition: "transform 0.2s"
        }}
        onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.1)"}
        onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
        title="Ajukan Lembur / Perjalanan Dinas"
      >
        ⏱️
      </button>

      {/* ========================================== */}
      {/* 💡 MODAL PENGAJUAN LEMBUR MULTI-ROW BERDASARKAN PERIODE */}
      {/* ========================================== */}
      {activeModal === "lembur" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "650px", borderRadius: "24px", padding: "30px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box" }}>
            
            <button onClick={() => setActiveModal("none")} style={{ position: "absolute", top: "20px", right: "20px", background: "#edf2f7", border: "none", width: "36px", height: "36px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>✖</button>

            <div style={{ marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "20px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{background:"#fffff0", padding:"8px", borderRadius:"12px"}}>⏱️</span> Klaim Overtime Driver
              </h2>
              <p style={{ margin: 0, color: "#718096", fontSize: "13px" }}>Input tanggal lembur operasional atau perjalanan dinas dalam satu siklus payroll.</p>
            </div>

            <form onSubmit={handleSubmitLemburKolektif} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {/* Pilihan Periode Cut-Off Gaji */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Pengemudi</label>
                  <input type="text" readOnly value={activeDriver} style={{...sharedInputStyle, background: "#e2e8f0"}} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Siklus / Periode Buku *</label>
                  <select value={periodeLembur} onChange={(e) => setPeriodeLembur(e.target.value)} style={{...sharedInputStyle, cursor: "pointer", background: "white", fontWeight: "bold", color: "#2d3748"}}>
                    <option value="11 Juni - 10 Juli 2026">🗓️ 11 Juni - 10 Juli 2026 (Aktif)</option>
                    <option value="11 Mei - 10 Juni 2026">🗓️ 11 Mei - 10 Juni 2026 (Lalu)</option>
                    <option value="11 Juli - 10 Agustus 2026">🗓️ 11 Juli - 10 Agustus 2026 (Depan)</option>
                  </select>
                </div>
              </div>

              <div style={{ fontWeight: "bold", fontSize: "13px", color: "#b7791f", marginTop: "10px" }}>📍 Daftar Tanggal Kerja Overtime:</div>

              {/* Loop Form Dinamis */}
              {formLemburItems.map((item, index) => (
                <div key={index} style={{ border: "1px solid #cbd5e0", padding: "20px 15px 15px", borderRadius: "16px", background: "#f8fafc", position: "relative" }}>
                  {index > 0 && (
                    <button type="button" onClick={() => handleRemoveLemburRow(index)} style={{ position: "absolute", top: "10px", right: "10px", background: "white", color: "#e53e3e", border: "1px solid #fed7d7", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>Hapus ✖</button>
                  )}
                  
                  <span style={{ position: "absolute", top: "10px", left: "15px", fontSize: "11px", fontWeight: "900", color: "#d69e2e", background: "#fffff0", padding: "2px 8px", borderRadius: "4px", border: "1px solid #fefcbf" }}>DATA KLAIM #{index + 1}</span>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "15px", marginBottom: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Tanggal Lembur *</label>
                      <input type="date" required value={item.tanggal} onChange={(e) => handleLemburRowChange(index, "tanggal", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Jenis Lembur *</label>
                      <input type="text" required placeholder="Cth: Perjalanan Dinas Luar Kota" value={item.area_ruangan} onChange={(e) => handleLemburRowChange(index, "area_ruangan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Jam Mulai *</label>
                      <input type="time" required value={item.jam_mulai} onChange={(e) => handleLemburRowChange(index, "jam_mulai", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Jam Selesai *</label>
                      <input type="time" required value={item.jam_selesai} onChange={(e) => handleLemburRowChange(index, "jam_selesai", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Detail Tugas / Kendaraan yang Digunakan *</label>
                    <input type="text" required placeholder="Cth: Antar tamu VIP pakai B 1629 RKP" value={item.alasan} onChange={(e) => handleLemburRowChange(index, "alasan", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                  </div>
                </div>
              ))}

              <button type="button" onClick={handleAddLemburRow} style={{ background: "white", color: "#d69e2e", border: "2px dashed #feccbf", padding: "12px", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }}>
                ➕ Tambah Tanggal Lembur Lain
              </button>

              <button type="submit" disabled={isLemburLoading} style={{ width: "100%", padding: "16px", background: isLemburLoading ? "#a0aec0" : "#d69e2e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", marginTop: "10px", cursor: isLemburLoading ? "not-allowed" : "pointer", boxShadow: isLemburLoading ? "none" : "0 4px 6px rgba(214,158,46,0.3)" }}>
                {isLemburLoading ? "Sedang Mengirim..." : "Kirim Semua Klaim Overtime"}
              </button>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}