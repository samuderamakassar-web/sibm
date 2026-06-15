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

// Interface untuk data Karyawan dari Database
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

  // 1. Load Data Real-time, Identitas, dan Daftar Karyawan
  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) {
      router.push("/shift-checkin");
      return;
    }
    setTimeout(() => setPicName(nama), 0);

    // A. Listener Data Tamu
    const logsRef = collection(db, "security_visitor_logs");
    const q = query(logsRef, orderBy("waktu_masuk", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: VisitorLog[] = [];
      snapshot.forEach(docSnap => {
        logs.push({ ...docSnap.data(), id: docSnap.id } as VisitorLog);
      });
      setVisitorLogs(logs);
    });

    // B. Ambil Master Data Karyawan (Satu kali jalan)
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
            plat_kendaraan: d.plat_kendaraan || "" // Menyokong jika ada plat di DB
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
      // Langsung matikan stream kamera di sini tanpa memanggil fungsi di bawah
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Fungsi khusus saat Security memilih karyawan dari Dropdown
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

  // 2. Kendali Kamera Wajah / KTP
  const bukaKamera = async () => {
    setIsCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error(error);
      alert("Gagal mengakses kamera. Pastikan izin kamera telah diberikan di browser.");
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
    const MAX_WIDTH = 400;
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

  // 3. Eksekusi Simpan Data (Check-In)
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
      
      // Reset Form
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

  // 4. Eksekusi Tamu/Karyawan Keluar
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

  // Filter list karyawan untuk Dropdown
  const filteredKaryawan = karyawanDB.filter(emp => emp.nama.toLowerCase().includes(searchKaryawan.toLowerCase()));

  return (
    <div style={{ backgroundColor: "#f0f4f8", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: "50px" }}>
      
      {/* HEADER */}
      <div style={{ background: "white", padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={() => router.push("/dashboard/security")} style={{ background: "none", border: "none", fontSize: "16px", fontWeight: "bold", color: "#4a5568", cursor: "pointer" }}>
          ⬅ Kembali
        </button>
        <div style={{ fontWeight: "bold", color: "#3182ce" }}>📋 Log Akses Gedung</div>
        <div style={{ fontSize: "12px", fontWeight: "bold", color: "#718096" }}>👮 {picName}</div>
      </div>

      <div style={{ maxWidth: "1000px", margin: "20px auto", padding: "0 20px" }}>
        
        {/* NAVIGASI TAB */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", overflowX: "auto", paddingBottom: "5px" }}>
          <button onClick={() => setActiveTab("input")} style={{ flexShrink: 0, padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "input" ? "#3182ce" : "#e2e8f0", color: activeTab === "input" ? "white" : "#4a5568", transition: "0.2s" }}>
            ✏️ Input Kedatangan
          </button>
          <button onClick={() => setActiveTab("aktif")} style={{ flexShrink: 0, padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "aktif" ? "#3182ce" : "#e2e8f0", color: activeTab === "aktif" ? "white" : "#4a5568", transition: "0.2s" }}>
            🟢 Di Dalam Area ({pengunjungAktif.length})
          </button>
          <button onClick={() => setActiveTab("riwayat")} style={{ flexShrink: 0, padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "riwayat" ? "#3182ce" : "#e2e8f0", color: activeTab === "riwayat" ? "white" : "#4a5568", transition: "0.2s" }}>
            📜 Riwayat Keluar ({riwayatPengunjung.length})
          </button>
        </div>

        {/* TAB 1: FORM INPUT KEDATANGAN */}
        {activeTab === "input" && (
          <div style={{ background: "white", padding: "30px", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", borderTop: "5px solid #3182ce" }}>
            <h2 style={{ margin: "0 0 15px 0", color: "#2b6cb0", display: "flex", alignItems: "center", gap: "10px" }}>
              <span>✏️</span> Pencatatan Masuk
            </h2>
            
            {/* TOGGLE TAMU VS KARYAWAN */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "25px", background: "#edf2f7", padding: "5px", borderRadius: "8px" }}>
              <button type="button" onClick={() => setJenisPengunjung("Tamu Eksternal")} style={{ flex: 1, padding: "10px", borderRadius: "6px", fontWeight: "bold", border: "none", cursor: "pointer", background: jenisPengunjung === "Tamu Eksternal" ? "white" : "transparent", color: jenisPengunjung === "Tamu Eksternal" ? "#2c5282" : "#718096", boxShadow: jenisPengunjung === "Tamu Eksternal" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", transition: "0.2s" }}>
                👔 Tamu Luar
              </button>
              <button type="button" onClick={() => { setJenisPengunjung("Karyawan"); setFormData({ nama: "", instansi_dept: "", tujuan: "", bertemu_dengan: "", no_kendaraan: "" }); setSearchKaryawan(""); setFotoBukti(null); }} style={{ flex: 1, padding: "10px", borderRadius: "6px", fontWeight: "bold", border: "none", cursor: "pointer", background: jenisPengunjung === "Karyawan" ? "white" : "transparent", color: jenisPengunjung === "Karyawan" ? "#2c5282" : "#718096", boxShadow: jenisPengunjung === "Karyawan" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", transition: "0.2s" }}>
                🏢 Karyawan SIBM
              </button>
            </div>
            
            <form onSubmit={handleCheckIn} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", position: "relative" }}>
              
              <div style={{ gridColumn: "span 2", position: "relative" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Nama Lengkap *</label>
                
                {jenisPengunjung === "Karyawan" ? (
                  // INPUT AUTOCOMPLETE KARYAWAN
                  <div style={{ position: "relative" }}>
                    <input type="text" value={searchKaryawan} onChange={(e) => { setSearchKaryawan(e.target.value); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} required placeholder="Ketik nama karyawan..." style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "2px solid #63b3ed", fontSize: "15px", background: "#ebf8ff", color: "#2b6cb0", fontWeight: "bold" }} />
                    
                    {showDropdown && searchKaryawan && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: "8px", marginTop: "5px", zIndex: 50, maxHeight: "200px", overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                        {filteredKaryawan.length > 0 ? filteredKaryawan.map((emp, idx) => (
                          <div key={idx} onClick={() => pilihKaryawan(emp)} style={{ padding: "12px", borderBottom: "1px solid #edf2f7", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseOver={(e) => e.currentTarget.style.background = "#ebf8ff"} onMouseOut={(e) => e.currentTarget.style.background = "white"}>
                            <span style={{ fontWeight: "bold", color: "#2d3748" }}>{emp.nama}</span>
                            <span style={{ fontSize: "12px", color: "#718096", background: "#edf2f7", padding: "2px 8px", borderRadius: "10px" }}>{emp.departemen}</span>
                          </div>
                        )) : (
                          <div style={{ padding: "12px", color: "#a0aec0", textAlign: "center", fontSize: "13px" }}>Nama tidak ditemukan di database.</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  // INPUT NORMAL TAMU
                  <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Contoh: Budi Santoso" style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "15px" }} />
                )}
              </div>
              
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>
                  {jenisPengunjung === "Karyawan" ? "Unit Bisnis / Departemen *" : "Asal Instansi / Perusahaan *"}
                </label>
                <input type="text" name="instansi_dept" value={formData.instansi_dept} onChange={handleInputChange} required readOnly={jenisPengunjung === "Karyawan"} placeholder={jenisPengunjung === "Karyawan" ? "Otomatis Terisi..." : "Contoh: PT. Maju Bersama"} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "15px", background: jenisPengunjung === "Karyawan" ? "#edf2f7" : "white" }} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Plat Nomor Kendaraan</label>
                <input type="text" name="no_kendaraan" value={formData.no_kendaraan} onChange={handleInputChange} placeholder={jenisPengunjung === "Karyawan" ? "Kosongkan jika tidak ada" : "Contoh: DD 1234 XY"} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "15px" }} />
              </div>

              {/* HANYA TAMPIL UNTUK TAMU EKSTERNAL */}
              {jenisPengunjung === "Tamu Eksternal" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Bertemu Dengan (Host) *</label>
                    <input type="text" name="bertemu_dengan" value={formData.bertemu_dengan} onChange={handleInputChange} required placeholder="Contoh: Pak Anton (HRD)" style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "15px" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Tujuan Kunjungan *</label>
                    <input type="text" name="tujuan" value={formData.tujuan} onChange={handleInputChange} required placeholder="Contoh: Meeting / Interview" style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "15px" }} />
                  </div>
                  
                  {/* AREA FOTO HANYA UNTUK TAMU */}
                  <div style={{ gridColumn: "span 2", marginTop: "10px", background: "#f7fafc", padding: "15px", borderRadius: "8px", border: "1px dashed #cbd5e0" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "10px", color: "#4a5568" }}>📸 Foto Wajah / KTP (Wajib untuk Tamu Luar)</label>
                    {fotoBukti ? (
                      <div style={{ position: "relative", width: "fit-content" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotoBukti} alt="Bukti Kedatangan" style={{ width: "200px", borderRadius: "8px", border: "2px solid #3182ce" }} />
                        <button type="button" onClick={hapusFoto} style={{ position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "white", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontWeight: "bold" }}>✖</button>
                      </div>
                    ) : (
                      <button type="button" onClick={bukaKamera} style={{ width: "100%", padding: "15px", background: "white", border: "2px dashed #a0aec0", color: "#4a5568", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "20px" }}>📷</span> Ambil Foto dari Kamera
                      </button>
                    )}
                  </div>
                </>
              )}

              <div style={{ gridColumn: "span 2", marginTop: "15px" }}>
                <button type="submit" disabled={isLoading} style={{ width: "100%", padding: "15px", background: isLoading ? "#a0aec0" : "#3182ce", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "16px", cursor: isLoading ? "not-allowed" : "pointer", boxShadow: "0 4px 6px rgba(49, 130, 206, 0.2)" }}>
                  {isLoading ? "Memproses Data..." : `✔️ Catat Masuk ${jenisPengunjung}`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: PENGUNJUNG DI DALAM */}
        {activeTab === "aktif" && (
          <div style={{ display: "grid", gap: "15px" }}>
            {pengunjungAktif.length > 0 ? pengunjungAktif.map(visitor => (
              <div key={visitor.id} style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", borderLeft: visitor.jenis === "Karyawan" ? "5px solid #d69e2e" : "5px solid #38a169", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
                <div style={{ display: "flex", gap: "15px", alignItems: "flex-start" }}>
                  
                  {visitor.jenis === "Tamu Eksternal" ? (
                    visitor.foto_bukti ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={visitor.foto_bukti} alt="Foto" style={{ width: "60px", height: "60px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e2e8f0" }} />
                    ) : (
                      <div style={{ width: "60px", height: "60px", background: "#edf2f7", borderRadius: "8px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "20px" }}>📸</div>
                    )
                  ) : (
                    <div style={{ width: "60px", height: "60px", background: "#feebc8", color: "#d69e2e", borderRadius: "8px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px", fontWeight: "bold" }}>
                      {visitor.nama.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <h3 style={{ margin: "0 0 5px 0", color: "#2d3748", display: "flex", alignItems: "center", gap: "8px" }}>
                      {visitor.nama} 
                      <span style={{ fontSize: "11px", background: visitor.jenis === "Karyawan" ? "#faf089" : "#c6f6d5", color: visitor.jenis === "Karyawan" ? "#744210" : "#22543d", padding: "2px 6px", borderRadius: "4px" }}>
                        {visitor.jenis}
                      </span>
                    </h3>
                    
                    {visitor.jenis === "Tamu Eksternal" ? (
                      <>
                        <div style={{ fontSize: "13px", color: "#4a5568", marginBottom: "3px" }}>🏢 {visitor.instansi_dept} | 🤝 Bertemu: <b>{visitor.bertemu_dengan}</b></div>
                        <div style={{ fontSize: "13px", color: "#4a5568" }}>🎯 {visitor.tujuan} | 🚙 {visitor.no_kendaraan || "Tanpa Kendaraan"}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: "13px", color: "#4a5568", marginBottom: "3px" }}>🏢 Unit Bisnis: <b>{visitor.instansi_dept}</b> | 🚙 Plat: {visitor.no_kendaraan || "Tidak ada"}</div>
                    )}
                    
                    <div style={{ fontSize: "12px", color: "#3182ce", marginTop: "8px", fontWeight: "bold" }}>🕒 Masuk: {formatJam(visitor.waktu_masuk)}</div>
                  </div>
                </div>

                <button onClick={() => handleCheckOut(visitor.id, visitor.nama)} style={{ padding: "10px 15px", background: "#e53e3e", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 2px 4px rgba(229,62,62,0.3)" }}>
                  Keluar Area ➔
                </button>
              </div>
            )) : (
              <div style={{ textAlign: "center", padding: "40px", background: "white", borderRadius: "12px", color: "#a0aec0", border: "1px dashed #cbd5e0" }}>
                Area clear. Tidak ada tamu atau staf SIBM yang terdata di dalam area saat ini.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: RIWAYAT KELUAR */}
        {activeTab === "riwayat" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "15px" }}>
            {riwayatPengunjung.length > 0 ? riwayatPengunjung.map(visitor => (
              <div key={visitor.id} style={{ background: "white", padding: "15px 20px", borderRadius: "8px", borderTop: visitor.jenis === "Karyawan" ? "4px solid #d69e2e" : "4px solid #38a169", borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", display: "flex", gap: "15px" }}>
                
                {visitor.foto_bukti && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={visitor.foto_bukti} alt="Foto" style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e2e8f0" }} />
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <h4 style={{ margin: 0, color: "#4a5568" }}>{visitor.nama}</h4>
                    <span style={{ fontSize: "10px", background: "#edf2f7", color: "#4a5568", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>{visitor.jenis}</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#718096", marginBottom: "8px" }}>{visitor.instansi_dept}</div>
                  <div style={{ fontSize: "12px", color: "#4a5568", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px", background: "#f7fafc", padding: "8px", borderRadius: "6px" }}>
                    <div><span style={{ color: "#38a169", fontWeight: "bold" }}>In:</span> {formatJam(visitor.waktu_masuk)}</div>
                    <div><span style={{ color: "#e53e3e", fontWeight: "bold" }}>Out:</span> {formatJam(visitor.waktu_keluar)}</div>
                  </div>
                </div>
              </div>
            )) : (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "30px", background: "white", borderRadius: "8px", color: "#a0aec0", border: "1px dashed #cbd5e0" }}>
                Belum ada riwayat pergerakan keluar hari ini.
              </div>
            )}
          </div>
        )}

      </div>

      {/* OVERLAY KAMERA MENGAMBANG */}
      {isCameraOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", zIndex: 100, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "bold" }}>📸 Pindai Wajah / KTP Tamu</span>
            <button onClick={matikanKamera} style={{ background: "none", border: "none", color: "white", fontSize: "24px", cursor: "pointer" }}>✖</button>
          </div>
          <div style={{ flex: 1, position: "relative", display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
            <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80%", height: "50%", border: "2px solid rgba(255,255,255,0.7)", borderRadius: "16px" }}></div>
          </div>
          <div style={{ padding: "30px", display: "flex", justifyContent: "center" }}>
            <button onClick={ambilFoto} style={{ width: "70px", height: "70px", borderRadius: "50%", background: "white", border: "5px solid #a0aec0", cursor: "pointer" }}></button>
          </div>
        </div>
      )}

    </div>
  );
}