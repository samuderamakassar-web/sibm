"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { collection, addDoc, serverTimestamp, updateDoc, doc, onSnapshot, query, orderBy, Timestamp, getDocs } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

interface VisitorLog {
  id: string;
  jenis: "Tamu Eksternal" | "Karyawan";
  nama: string;
  instansi_dept: string; 
  tujuan: string;
  bertemu_dengan: string;
  no_kendaraan: string;
  foto_bukti: string | null;
  status: "Di Dalam Area" | "Selesai / Keluar";
  waktu_masuk: Timestamp | null;
  waktu_keluar: Timestamp | null;
  pic_bertugas: string;
}

interface EmployeeData {
  nama: string;
  departemen: string;
  plat_kendaraan?: string;
}

export default function BukuTamuSecurity() {
  const router = useRouter();

  const [picName, setPicName] = useState("");
  const [activeTab, setActiveTab] = useState<"input" | "aktif" | "riwayat">("input");
  const [visitorLogs, setVisitorLogs] = useState<VisitorLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // State untuk Autocomplete Karyawan
  const [karyawanDB, setKaryawanDB] = useState<EmployeeData[]>([]);
  const [searchKaryawan, setSearchKaryawan] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // State Form & Kamera
  const [jenisPengunjung, setJenisPengunjung] = useState<"Tamu Eksternal" | "Karyawan">("Tamu Eksternal");
  const [formData, setFormData] = useState({
    nama: "",
    instansi_dept: "",
    tujuan: "",
    bertemu_dengan: "",
    no_kendaraan: ""
  });
  const [fotoBukti, setFotoBukti] = useState<string | null>(null);
  
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) {
      router.push("/shift-checkin");
      return;
    }
    setTimeout(() => setPicName(nama), 0);

    const logsRef = collection(db, "security_visitor_logs");
    const q = query(logsRef, orderBy("waktu_masuk", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: VisitorLog[] = [];
      snapshot.forEach(docSnap => {
        logs.push({ ...docSnap.data(), id: docSnap.id } as VisitorLog);
      });
      setVisitorLogs(logs);
    });

    const fetchKaryawan = async () => {
      try {
        const empRef = collection(db, "employees_directory");
        const empSnap = await getDocs(empRef);
        const empList: EmployeeData[] = [];
        empSnap.forEach(doc => {
          const d = doc.data();
          empList.push({
            nama: d.nama || "",
            departemen: d.departemen || "Umum",
            plat_kendaraan: d.plat_kendaraan || "" 
          });
        });
        setKaryawanDB(empList);
      } catch (error) {
        console.error("Gagal memuat data karyawan:", error);
      }
    };
    fetchKaryawan();

    return () => {
      unsubscribe();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const pilihKaryawan = (emp: EmployeeData) => {
    setSearchKaryawan(emp.nama);
    setFormData({
      ...formData,
      nama: emp.nama,
      instansi_dept: emp.departemen,
      no_kendaraan: emp.plat_kendaraan || ""
    });
    setShowDropdown(false);
  };

  const bukaKamera = async () => {
    setIsCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); // Diubah ke environment (Kamera belakang)
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error(error);
      alert("Gagal mengakses kamera. Pastikan izin kamera telah diberikan.");
      setIsCameraOpen(false);
    }
  };

  const matikanKamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const ambilFoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const MAX_WIDTH = 600;
    const scale = MAX_WIDTH / video.videoWidth;
    canvas.width = MAX_WIDTH;
    canvas.height = video.videoHeight * scale;
    
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photoBase64 = canvas.toDataURL("image/jpeg", 0.7); 
      setFotoBukti(photoBase64);
    }
    matikanKamera();
  };

  const hapusFoto = () => setFotoBukti(null);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await addDoc(collection(db, "security_visitor_logs"), {
        nama: jenisPengunjung === "Karyawan" ? searchKaryawan : formData.nama,
        instansi_dept: formData.instansi_dept,
        no_kendaraan: formData.no_kendaraan,
        tujuan: jenisPengunjung === "Karyawan" ? "Bekerja / Operasional" : formData.tujuan,
        bertemu_dengan: jenisPengunjung === "Karyawan" ? "-" : formData.bertemu_dengan,
        jenis: jenisPengunjung,
        foto_bukti: jenisPengunjung === "Karyawan" ? null : fotoBukti,
        status: "Di Dalam Area",
        waktu_masuk: serverTimestamp(),
        waktu_keluar: null,
        pic_bertugas: picName
      });

      alert(`${jenisPengunjung} berhasil didaftarkan (Check-In)!`);
      
      setFormData({ nama: "", instansi_dept: "", tujuan: "", bertemu_dengan: "", no_kendaraan: "" });
      setSearchKaryawan("");
      setFotoBukti(null);
      setActiveTab("aktif");
    } catch (error) {
      console.error("Gagal Check-In:", error);
      alert("Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckOut = async (id: string, namaPengunjung: string) => {
    if (!window.confirm(`Konfirmasi: Apakah ${namaPengunjung} sudah meninggalkan area SIBM?`)) return;

    try {
      await updateDoc(doc(db, "security_visitor_logs", id), {
        status: "Selesai / Keluar",
        waktu_keluar: serverTimestamp()
      });
    } catch (error) {
      console.error("Gagal Check-Out:", error);
      alert("Gagal memproses check-out pengunjung.");
    }
  };

  const formatJam = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const pengunjungAktif = visitorLogs.filter(log => log.status === "Di Dalam Area");
  const riwayatPengunjung = visitorLogs.filter(log => log.status === "Selesai / Keluar");
  const filteredKaryawan = karyawanDB.filter(emp => emp.nama.toLowerCase().includes(searchKaryawan.toLowerCase()));

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/dashboard/security")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👮 {picName}
        </div>
      </div>

      {/* 🔹 HERO SECTION (TEMA MERAH SAMUDERA) */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>BUKU TAMU DIGITAL</h1>
        <p style={{ margin: "0", fontSize: "13px", opacity: 0.9 }}>Registrasi dan pemantauan pergerakan akses area SIBM</p>
      </div>

      <div style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* 🔹 NAVIGASI TAB MODERN */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", overflowX: "auto", paddingBottom: "10px", WebkitOverflowScrolling: "touch" }}>
          <button 
            onClick={() => setActiveTab("input")} 
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "input" ? "white" : "rgba(255,255,255,0.7)", color: activeTab === "input" ? "#e53e3e" : "#718096", boxShadow: activeTab === "input" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "input" ? "3px solid #e53e3e" : "3px solid transparent" }}
          >
            ✏️ Input Kedatangan
          </button>
          <button 
            onClick={() => setActiveTab("aktif")} 
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "aktif" ? "white" : "rgba(255,255,255,0.7)", color: activeTab === "aktif" ? "#38a169" : "#718096", boxShadow: activeTab === "aktif" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "aktif" ? "3px solid #38a169" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            Di Dalam Area <span style={{ background: activeTab === "aktif" ? "#c6f6d5" : "#e2e8f0", color: activeTab === "aktif" ? "#22543d" : "#4a5568", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>{pengunjungAktif.length}</span>
          </button>
          <button 
            onClick={() => setActiveTab("riwayat")} 
            style={{ flexShrink: 0, padding: "12px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === "riwayat" ? "white" : "rgba(255,255,255,0.7)", color: activeTab === "riwayat" ? "#dd6b20" : "#718096", boxShadow: activeTab === "riwayat" ? "0 4px 6px rgba(0,0,0,0.1)" : "none", borderBottom: activeTab === "riwayat" ? "3px solid #dd6b20" : "3px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            Riwayat Keluar <span style={{ background: activeTab === "riwayat" ? "#feebc8" : "#e2e8f0", color: activeTab === "riwayat" ? "#9c4221" : "#4a5568", padding: "2px 8px", borderRadius: "20px", fontSize: "11px" }}>{riwayatPengunjung.length}</span>
          </button>
        </div>

        {/* 🔹 TAB 1: FORM INPUT KEDATANGAN */}
        {activeTab === "input" && (
          <div style={{ background: "white", padding: "30px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            
            {/* TOGGLE TAMU VS KARYAWAN */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "30px", background: "#f8fafc", padding: "8px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setJenisPengunjung("Tamu Eksternal")} style={{ flex: 1, padding: "12px", borderRadius: "10px", fontWeight: "bold", border: "none", cursor: "pointer", background: jenisPengunjung === "Tamu Eksternal" ? "#e53e3e" : "transparent", color: jenisPengunjung === "Tamu Eksternal" ? "white" : "#718096", boxShadow: jenisPengunjung === "Tamu Eksternal" ? "0 4px 6px rgba(229, 62, 62, 0.3)" : "none", transition: "0.2s" }}>
                👔 Tamu Eksternal
              </button>
              <button type="button" onClick={() => { setJenisPengunjung("Karyawan"); setFormData({ nama: "", instansi_dept: "", tujuan: "", bertemu_dengan: "", no_kendaraan: "" }); setSearchKaryawan(""); setFotoBukti(null); }} style={{ flex: 1, padding: "12px", borderRadius: "10px", fontWeight: "bold", border: "none", cursor: "pointer", background: jenisPengunjung === "Karyawan" ? "#3182ce" : "transparent", color: jenisPengunjung === "Karyawan" ? "white" : "#718096", boxShadow: jenisPengunjung === "Karyawan" ? "0 4px 6px rgba(49, 130, 206, 0.3)" : "none", transition: "0.2s" }}>
                🏢 Karyawan / Staf
              </button>
            </div>
            
            <form onSubmit={handleCheckIn} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", position: "relative" }}>
              
              <div style={{ gridColumn: "span 2", position: "relative" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Nama Lengkap *</label>
                
                {jenisPengunjung === "Karyawan" ? (
                  <div style={{ position: "relative" }}>
                    <input type="text" value={searchKaryawan} onChange={(e) => { setSearchKaryawan(e.target.value); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} required placeholder="Ketik nama karyawan..." style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "2px solid #3182ce", fontSize: "15px", background: "#ebf8ff", color: "#2b6cb0", fontWeight: "bold" }} />
                    
                    {showDropdown && searchKaryawan && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: "12px", marginTop: "8px", zIndex: 50, maxHeight: "250px", overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
                        {filteredKaryawan.length > 0 ? filteredKaryawan.map((emp, idx) => (
                          <div key={idx} onClick={() => pilihKaryawan(emp)} style={{ padding: "15px", borderBottom: "1px solid #edf2f7", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#f7fafc"} onMouseOut={(e) => e.currentTarget.style.background = "white"}>
                            <span style={{ fontWeight: "bold", color: "#2d3748" }}>{emp.nama}</span>
                            <span style={{ fontSize: "11px", color: "#718096", background: "#edf2f7", padding: "4px 8px", borderRadius: "8px", fontWeight: "bold" }}>{emp.departemen}</span>
                          </div>
                        )) : (
                          <div style={{ padding: "15px", color: "#a0aec0", textAlign: "center", fontSize: "13px" }}>Karyawan tidak ditemukan.</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Budi Santoso" style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "15px", background: "#f8fafc" }} />
                )}
              </div>
              
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>
                  {jenisPengunjung === "Karyawan" ? "Unit Bisnis / Departemen *" : "Asal Instansi / Perusahaan *"}
                </label>
                <input type="text" name="instansi_dept" value={formData.instansi_dept} onChange={handleInputChange} required readOnly={jenisPengunjung === "Karyawan"} placeholder={jenisPengunjung === "Karyawan" ? "Otomatis Terisi..." : "Contoh: PT. Maju Bersama"} style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "15px", background: jenisPengunjung === "Karyawan" ? "#edf2f7" : "#f8fafc" }} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>No. Plat Kendaraan</label>
                <input type="text" name="no_kendaraan" value={formData.no_kendaraan} onChange={handleInputChange} placeholder={jenisPengunjung === "Karyawan" ? "Opsional" : "Contoh: DD 1234 XY"} style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "15px", background: "#f8fafc" }} />
              </div>

              {/* HANYA TAMPIL UNTUK TAMU EKSTERNAL */}
              {jenisPengunjung === "Tamu Eksternal" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Bertemu Dengan (Host) *</label>
                    <input type="text" name="bertemu_dengan" value={formData.bertemu_dengan} onChange={handleInputChange} required placeholder="Contoh: Pak Anton (HRD)" style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "15px", background: "#f8fafc" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#4a5568" }}>Tujuan Kunjungan *</label>
                    <input type="text" name="tujuan" value={formData.tujuan} onChange={handleInputChange} required placeholder="Contoh: Meeting / Interview" style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "15px", background: "#f8fafc" }} />
                  </div>
                  
                  {/* AREA KAMERA (Dipercantik) */}
                  <div style={{ gridColumn: "span 2", marginTop: "10px", background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "2px dashed #cbd5e0", textAlign: "center" }}>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: "bold", marginBottom: "15px", color: "#4a5568" }}>📸 Wajib Foto Wajah / KTP Tamu</label>
                    {fotoBukti ? (
                      <div style={{ position: "relative", display: "inline-block" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotoBukti} alt="Bukti Kedatangan" style={{ height: "150px", borderRadius: "12px", border: "3px solid #e53e3e", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }} />
                        <button type="button" onClick={hapusFoto} style={{ position: "absolute", top: "-15px", right: "-15px", background: "#e53e3e", color: "white", border: "3px solid white", borderRadius: "50%", width: "40px", height: "40px", cursor: "pointer", fontWeight: "bold", fontSize: "16px", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>✖</button>
                      </div>
                    ) : (
                      <button type="button" onClick={bukaKamera} style={{ width: "100%", padding: "20px", background: "white", border: "1px solid #cbd5e0", color: "#2d3748", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", fontSize: "16px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.borderColor = "#e53e3e"}>
                        <span style={{ fontSize: "24px" }}>📷</span> Buka Kamera Perangkat
                      </button>
                    )}
                  </div>
                </>
              )}

              <div style={{ gridColumn: "span 2", marginTop: "20px" }}>
                <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "18px", background: isLoading ? "#a0aec0" : (jenisPengunjung === "Tamu Eksternal" ? "#e53e3e" : "#3182ce"), color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: isLoading ? "not-allowed" : "pointer", boxShadow: isLoading ? "none" : `0 10px 15px -3px ${jenisPengunjung === "Tamu Eksternal" ? "rgba(229,62,62,0.4)" : "rgba(49,130,206,0.4)"}`, transition: "0.2s" }}>
                  {isLoading ? "Menyimpan Data..." : `✔️ Check-In ${jenisPengunjung}`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 🔹 TAB 2: PENGUNJUNG DI DALAM AREA */}
        {activeTab === "aktif" && (
          <div style={{ display: "grid", gap: "15px" }}>
            {pengunjungAktif.length > 0 ? pengunjungAktif.map(visitor => (
              <div key={visitor.id} style={{ background: "white", padding: "20px", borderRadius: "16px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", borderLeft: visitor.jenis === "Karyawan" ? "6px solid #3182ce" : "6px solid #e53e3e", borderTop: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
                <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                  
                  {visitor.jenis === "Tamu Eksternal" ? (
                    visitor.foto_bukti ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={visitor.foto_bukti} alt="Foto" style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }} />
                    ) : (
                      <div style={{ width: "80px", height: "80px", background: "#f8fafc", borderRadius: "12px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "30px", border: "1px solid #e2e8f0" }}>📸</div>
                    )
                  ) : (
                    <div style={{ width: "80px", height: "80px", background: "#ebf8ff", color: "#3182ce", borderRadius: "12px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "30px", fontWeight: "900", border: "1px solid #bee3f8" }}>
                      {visitor.nama.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <h3 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
                      {visitor.nama} 
                      <span style={{ fontSize: "10px", background: visitor.jenis === "Karyawan" ? "#ebf8ff" : "#fff5f5", color: visitor.jenis === "Karyawan" ? "#2b6cb0" : "#c53030", padding: "4px 8px", borderRadius: "6px", textTransform: "uppercase" }}>
                        {visitor.jenis}
                      </span>
                    </h3>
                    
                    {visitor.jenis === "Tamu Eksternal" ? (
                      <>
                        <div style={{ fontSize: "13px", color: "#4a5568", marginBottom: "3px" }}>🏢 Asal: <b>{visitor.instansi_dept}</b> | 🤝 Host: <b>{visitor.bertemu_dengan}</b></div>
                        <div style={{ fontSize: "13px", color: "#4a5568" }}>🎯 {visitor.tujuan} | 🚙 {visitor.no_kendaraan || "Tanpa Kendaraan"}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: "13px", color: "#4a5568", marginBottom: "3px" }}>🏢 Unit Bisnis: <b>{visitor.instansi_dept}</b> | 🚙 Plat: {visitor.no_kendaraan || "Tidak ada"}</div>
                    )}
                    
                    <div style={{ fontSize: "12px", color: "#38a169", marginTop: "10px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#38a169", borderRadius: "50%", boxShadow: "0 0 5px #38a169" }}></span>
                      Masuk: {formatJam(visitor.waktu_masuk)}
                    </div>
                  </div>
                </div>

                <button onClick={() => handleCheckOut(visitor.id, visitor.nama)} style={{ padding: "12px 20px", background: "white", color: "#e53e3e", border: "2px solid #e53e3e", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }} onMouseOver={(e) => { e.currentTarget.style.background = "#e53e3e"; e.currentTarget.style.color = "white"; }} onMouseOut={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "#e53e3e"; }}>
                  Check-Out Area ➔
                </button>
              </div>
            )) : (
              <div style={{ textAlign: "center", padding: "60px 20px", background: "white", borderRadius: "20px", color: "#a0aec0", border: "1px dashed #cbd5e0" }}>
                <div style={{ fontSize: "40px", marginBottom: "15px" }}>🛡️</div>
                Area Clear. Tidak ada tamu atau staf yang tertahan di dalam area saat ini.
              </div>
            )}
          </div>
        )}

        {/* 🔹 TAB 3: RIWAYAT KELUAR */}
        {activeTab === "riwayat" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
            {riwayatPengunjung.length > 0 ? riwayatPengunjung.map(visitor => (
              <div key={visitor.id} style={{ background: "white", padding: "20px", borderRadius: "16px", borderTop: visitor.jenis === "Karyawan" ? "5px solid #3182ce" : "5px solid #e53e3e", borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", display: "flex", gap: "15px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
                
                {visitor.foto_bukti ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={visitor.foto_bukti} alt="Foto" style={{ width: "60px", height: "60px", objectFit: "cover", borderRadius: "10px", border: "1px solid #e2e8f0" }} />
                ) : (
                  <div style={{ width: "60px", height: "60px", background: "#f8fafc", borderRadius: "10px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px", border: "1px solid #e2e8f0" }}>{visitor.jenis === "Karyawan" ? "🏢" : "👔"}</div>
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", alignItems: "flex-start" }}>
                    <h4 style={{ margin: 0, color: "#2d3748", fontSize: "15px" }}>{visitor.nama}</h4>
                    <span style={{ fontSize: "9px", background: "#edf2f7", color: "#4a5568", padding: "3px 6px", borderRadius: "4px", fontWeight: "bold", textTransform: "uppercase" }}>{visitor.jenis}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#718096", marginBottom: "10px" }}>{visitor.instansi_dept}</div>
                  <div style={{ fontSize: "11px", color: "#4a5568", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px", background: "#f8fafc", padding: "10px", borderRadius: "8px", border: "1px solid #edf2f7" }}>
                    <div><span style={{ color: "#38a169", fontWeight: "bold" }}>In:</span><br/>{formatJam(visitor.waktu_masuk)}</div>
                    <div><span style={{ color: "#e53e3e", fontWeight: "bold" }}>Out:</span><br/>{formatJam(visitor.waktu_keluar)}</div>
                  </div>
                </div>
              </div>
            )) : (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", background: "white", borderRadius: "20px", color: "#a0aec0", border: "1px dashed #cbd5e0" }}>
                <div style={{ fontSize: "40px", marginBottom: "15px" }}>📜</div>
                Belum ada riwayat pergerakan keluar yang terekam.
              </div>
            )}
          </div>
        )}

      </div>

      {/* 🔹 OVERLAY KAMERA (Dipercantik untuk Mobile) */}
      {isCameraOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.95)", zIndex: 100, display: "flex", flexDirection: "column", backdropFilter: "blur(10px)" }}>
          <div style={{ padding: "20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontWeight: "bold", fontSize: "16px", display: "flex", alignItems: "center", gap: "10px" }}><span>📸</span> Arahkan Wajah / KTP</span>
            <button onClick={matikanKamera} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: "40px", height: "40px", borderRadius: "50%", fontSize: "18px", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center" }}>✖</button>
          </div>
          
          <div style={{ flex: 1, position: "relative", display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
            <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
            
            {/* Guide Box (Target area wajah/KTP) */}
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80%", maxWidth: "350px", height: "50%", maxHeight: "350px", border: "3px dashed rgba(255,255,255,0.7)", borderRadius: "24px", boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}></div>
          </div>
          
          <div style={{ padding: "40px", display: "flex", justifyContent: "center", background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)" }}>
            <button onClick={ambilFoto} style={{ width: "80px", height: "80px", borderRadius: "50%", background: "white", border: "6px solid rgba(255,255,255,0.3)", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.5)", transition: "transform 0.1s" }} onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.9)"} onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}></button>
          </div>
        </div>
      )}

    </div>
  );
}