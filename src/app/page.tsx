"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs, Timestamp, where, addDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// ==========================================
// INTERFACES
// ==========================================
interface KendaraanLog {
  kendaraan: string;
  status_kendaraan: string;
  driver_bertugas: string;
  tujuan_keperluan: string;
  waktu_catat?: Timestamp | null;
}
interface DriverStatusLog {
  nama_driver: string;
  status: string;
  waktu_ubah?: Timestamp | null;
}
interface DataTamu {
  id: string;
  nama: string;
  instansi_dept: string; 
  tujuan: string;
  waktu_masuk?: Timestamp | null;
  waktu_keluar?: Timestamp | null;
}
interface DataPaket {
  id: string;
  penerima: string;
  kurir: string;
  waktu_diterima?: Timestamp | null;
  status: string;
}
interface ObStatusData {
  nama: string;
  status: string;
  lokasi: string[];
}
interface Employee {
  id: string;
  nama: string;
  departemen: string;
}
interface SecurityShift {
  current: string[];
  next: string[];
  currentName: string;
  nextName: string;
}
interface HelpdeskTicket {
  id: string;
  nama_pelapor: string;
  lokasi: string;
  deskripsi: string;
  status: string;
  foto_awal?: string;
  foto_proses?: string;
  waktu_lapor?: Timestamp | null;
}

export default function PortalSIBM() {
  const router = useRouter();

  const [obBertugas, setObBertugas] = useState<ObStatusData[]>([]);
  const [mobilStatus, setMobilStatus] = useState<KendaraanLog[]>([]);
  const [securityShift, setSecurityShift] = useState<SecurityShift>({ current: [], next: [], currentName: "Memuat...", nextName: "Memuat..." });
  
  // STATE: Menampung status siaga personil driver secara real-time
  const [driverStatusMap, setDriverStatusMap] = useState<Record<string, string>>({
    "Amal Setiawan": "Memuat...",
    "Muhammad Renaldy": "Memuat..."
  });

  const [activeModal, setActiveModal] = useState<"none" | "login" | "tamu" | "paket" | "helpdesk" | "sbo">("none");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [hasilTamu, setHasilTamu] = useState<DataTamu[]>([]);
  const [hasilPaket, setHasilPaket] = useState<DataPaket[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [helpdeskTab, setHelpdeskTab] = useState<"LAPOR" | "LACAK">("LAPOR");
  const [formHelpdesk, setFormHelpdesk] = useState({ nama: "", dept: "", lokasi: "", deskripsi: "" });
  const [fotoAwal, setFotoAwal] = useState<string>("");
  const [isHelpdeskLoading, setIsHelpdeskLoading] = useState(false);
  
  const [searchHelpdeskName, setSearchHelpdeskName] = useState("");
  const [hasilHelpdesk, setHasilHelpdesk] = useState<HelpdeskTicket[]>([]);
  const [isSearchingHelpdesk, setIsSearchingHelpdesk] = useState(false);

  // STATE: FORM SBO (SAFETY)
  const todayISO = new Date().toISOString().split("T")[0];
  const [formSbo, setFormSbo] = useState({ 
    nama_pelapor: "", 
    tanggal_kejadian: todayISO,
    unit_bisnis: "", 
    lokasi: "", 
    detail_temuan: "",
    kategori_temuan: "Kondisi Tidak Aman (Unsafe Condition)", 
    penyebab: "",
    action_taken: "",
    status_temuan: "Open",
    komitmen_pelaku: "",
    konsekuensi: ""
  });
  const [fotoSbo, setFotoSbo] = useState<string>("");
  const [isSboLoading, setIsSboLoading] = useState(false);

  const formatTgl = new Date().toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    // 1. Tarik Data OB
    const plotRef = doc(db, "daily_plots", todayISO);
    const unsubPlot = onSnapshot(plotRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const plots = (data.plot_lantai || {}) as Record<string, string>;
        const statuses = (data.status_staf || {}) as Record<string, string>;
        const mappedData = Object.keys(statuses).map(nama => {
          const lantaiDitugaskan = Object.keys(plots).filter(lantai => plots[lantai] === nama || plots[lantai] === "Semua / All");
          return { nama, status: statuses[nama] || "Hadir / On Duty", lokasi: lantaiDitugaskan };
        });
        setObBertugas(mappedData);
      } else { setObBertugas([]); }
    });

    // 2. Tarik Data Mobil Operasional
    const vehRef = collection(db, "operational_vehicle_logs");
    const unsubVeh = onSnapshot(query(vehRef, orderBy("waktu_catat", "desc"), limit(30)), (snapshot) => {
      const logs = snapshot.docs.map(d => d.data() as KendaraanLog);
      const statusTerkini: Record<string, KendaraanLog> = {};
      logs.forEach(log => { if (!statusTerkini[log.kendaraan]) statusTerkini[log.kendaraan] = log; });
      setMobilStatus(Object.values(statusTerkini));
    });

    // 3. Tarik status siaga personel driver murni
    const drvRef = collection(db, "driver_status_logs");
    const unsubDriver = onSnapshot(query(drvRef, orderBy("waktu_ubah", "desc")), (snapshot) => {
      const latestMap: Record<string, string> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as DriverStatusLog;
        if (data.nama_driver && !latestMap[data.nama_driver]) {
          latestMap[data.nama_driver] = data.status;
        }
      });
      
      if (!latestMap["Amal Setiawan"]) latestMap["Amal Setiawan"] = "Standby";
      if (!latestMap["Muhammad Renaldy"]) latestMap["Muhammad Renaldy"] = "Standby";
      
      setDriverStatusMap(latestMap);
    });

    const fetchEmp = async () => {
      const empSnap = await getDocs(collection(db, "employees_directory"));
      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    };
    fetchEmp();

    // 💡 4. PERBAIKAN LOGIKA SHIFT SECURITY (12 JAM)
    const fetchSecurity = async () => {
      try {
        const currentMonthId = todayISO.substring(0, 7); // Contoh: "2026-06"
        const mSnap = await getDoc(doc(db, "security_monthly_schedules", currentMonthId));
        
        if (mSnap.exists()) {
          const dataHari = ((mSnap.data().data_hari || {}) as Record<string, Record<string, string>>)[todayISO] || {};

          const jamSekarang = new Date().getHours();
          
          const shift1 = Object.keys(dataHari).filter(k => dataHari[k]?.includes("Shift 1"));
          const shift2 = Object.keys(dataHari).filter(k => dataHari[k]?.includes("Shift 2"));

          // Cek Jam: 08:00 - 19:59 (Shift 1), 20:00 - 07:59 (Shift 2)
          if (jamSekarang >= 8 && jamSekarang < 20) {
            setSecurityShift({ current: shift1, next: shift2, currentName: "Shift 1 (08:00 - 20:00)", nextName: "Shift 2 (20:00 - 08:00)" });
          } else {
            setSecurityShift({ current: shift2, next: shift1, currentName: "Shift 2 (20:00 - 08:00)", nextName: "Shift 1 (Besok 08:00)" });
          }
        } else {
          setSecurityShift({ current: [], next: [], currentName: "Belum Ada Jadwal", nextName: "Belum Ada Jadwal" });
        }
      } catch (e) { console.error("Error Fetch Security:", e); }
    };
    fetchSecurity();

    return () => { unsubPlot(); unsubVeh(); unsubDriver(); };
  }, [todayISO]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setFotoState: React.Dispatch<React.SetStateAction<string>>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL("image/jpeg", 0.6); 
          setFotoState(base64);
        }
      };
      if (typeof ev.target?.result === 'string') img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitSbo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fotoSbo) return alert("Wajib melampirkan foto bukti kondisi/perilaku berbahaya!");
    if (!formSbo.unit_bisnis) return alert("Silakan pilih Unit Bisnis terlebih dahulu!");
    
    setIsSboLoading(true);
    try {
      await addDoc(collection(db, "qhse_sbo_reports"), {
        ...formSbo,
        nama_pelapor: formSbo.nama_pelapor || "Anonim / Visitor",
        foto_bukti: fotoSbo,
        waktu_lapor: serverTimestamp(),
        tanggal_closed: formSbo.status_temuan === "Close" ? todayISO : null
      });

      alert("✅ Laporan Safety Behavior Observation (SBO) berhasil disubmit! Terima kasih atas kepedulian Anda.");
      setFormSbo({ 
        nama_pelapor: "", tanggal_kejadian: todayISO, unit_bisnis: "",
        lokasi: "", detail_temuan: "", kategori_temuan: "Kondisi Tidak Aman (Unsafe Condition)", 
        penyebab: "", action_taken: "", status_temuan: "Open", komitmen_pelaku: "", konsekuensi: ""
      });
      setFotoSbo("");
      setActiveModal("none"); 
    } catch (error) {
      console.error("Gagal mengirim laporan SBO:", error);
      alert("Terjadi kesalahan sistem saat mengirim laporan.");
    } finally { setIsSboLoading(false); }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormHelpdesk(prev => ({ ...prev, nama: val }));
    const found = employees.find(emp => emp.nama === val);
    if (found) setFormHelpdesk(prev => ({ ...prev, dept: found.departemen }));
  };

  const handleSubmitHelpdesk = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsHelpdeskLoading(true);

    try {
      await addDoc(collection(db, "helpdesk_tickets"), {
        nama_pelapor: formHelpdesk.nama,
        departemen: formHelpdesk.dept,
        lokasi: formHelpdesk.lokasi,
        deskripsi: formHelpdesk.deskripsi,
        foto_awal: fotoAwal, 
        status: "Menunggu",
        waktu_lapor: serverTimestamp()
      });

      alert("✅ Laporan kerusakan berhasil dikirim! Tim GA akan segera menindaklanjuti.");
      setFormHelpdesk({ nama: "", dept: "", lokasi: "", deskripsi: "" });
      setFotoAwal("");
      setHelpdeskTab("LACAK"); 
    } catch (error) {
      console.error("Gagal mengirim tiket:", error);
      alert("Terjadi kesalahan sistem saat mengirim laporan.");
    } finally { setIsHelpdeskLoading(false); }
  };

  const handleCariHelpdesk = async () => {
    if (!searchHelpdeskName.trim()) return alert("Masukkan nama Anda terlebih dahulu.");
    setIsSearchingHelpdesk(true);
    try {
      const snap = await getDocs(collection(db, "helpdesk_tickets"));
      let all = snap.docs.map(d => ({ id: d.id, ...d.data() } as HelpdeskTicket));
      all = all.filter(t => String(t.nama_pelapor).toLowerCase().includes(searchHelpdeskName.toLowerCase().trim()));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      all.sort((a, b) => ((b.waktu_lapor as any)?.toMillis?.() || 0) - ((a.waktu_lapor as any)?.toMillis?.() || 0));
      setHasilHelpdesk(all.slice(0, 15));
      if (all.length === 0) alert(`Belum ada laporan dari: "${searchHelpdeskName}"`);
    } finally { setIsSearchingHelpdesk(false); }
  };

  const handleCariTamu = async () => {
    setIsSearching(true);
    try {
      const snap = await getDocs(collection(db, "security_visitor_logs"));
      let all = snap.docs.map(d => ({ id: d.id, ...d.data() } as DataTamu));
      if (searchQuery.trim()) all = all.filter(t => String(t.nama).toLowerCase().includes(searchQuery.toLowerCase().trim()));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      all.sort((a, b) => ((b.waktu_masuk as any)?.toMillis?.() || 0) - ((a.waktu_masuk as any)?.toMillis?.() || 0));
      setHasilTamu(all.slice(0, 50));
    } finally { setIsSearching(false); }
  };

  const handleCariPaket = async () => {
    setIsSearching(true);
    try {
      const snap = await getDocs(collection(db, "packages"));
      let all = snap.docs.map(d => ({ id: d.id, ...d.data() } as DataPaket));
      if (searchQuery.trim()) all = all.filter(p => String(p.penerima).toLowerCase().includes(searchQuery.toLowerCase().trim()));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      all.sort((a, b) => ((b.waktu_diterima as any)?.toMillis?.() || 0) - ((a.waktu_diterima as any)?.toMillis?.() || 0));
      setHasilPaket(all.slice(0, 50));
    } finally { setIsSearching(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== "123456") return alert("❌ Password salah!");
    setIsLoginLoading(true);
    try {
      const q = query(collection(db, "users_master"), where("email", "==", email.toLowerCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) { 
        alert("❌ Email tidak terdaftar dalam sistem."); 
        setIsLoginLoading(false); 
        return; 
      }
      
      const uData = snap.docs[0].data();
      localStorage.setItem("pic_nama", uData.nama);
      localStorage.setItem("pic_dept", uData.departemen);
      localStorage.setItem("pic_role", uData.role);
      
      switch (uData.departemen) {
        case "Admin GA": router.push("/admin"); break;
        case "Management": router.push("/management"); break;
        case "OB & CS": case "Security": router.push("/shift-checkin"); break;
        case "Driver": router.push("/dashboard/driver"); break;
        case "QHSE": router.push("/dashboard/qhse"); break;
        default: alert(`❌ Akses gagal. Departemen "${uData.departemen}" belum memiliki jalur dashboard.`);
      }
    } catch (error) {
      console.error("Login Error:", error);
      alert("Terjadi kesalahan sistem saat mencoba login.");
    } finally { setIsLoginLoading(false); }
  };

  const formatJam = (ts: Timestamp | null | undefined) => ts ? new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

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
    transition: "all 0.2s"
  };

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 20px", background: "white", borderBottom: "1px solid #e2e8f0" }}>
        <button onClick={() => setActiveModal("login")} style={{ background: "transparent", color: "#a0aec0", border: "none", fontSize: "12px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
          🔒 Staf Internal
        </button>
      </div>

      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 80px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "15px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-samudera.png" alt="Samudera Logo" style={{ height: "60px", objectFit: "contain", filter: "drop-shadow(0px 4px 6px rgba(0,0,0,0.3))" }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 36px)", fontWeight: "900", letterSpacing: "1px" }}>PORTAL SIBM</h1>
        <p style={{ margin: "0 0 20px 0", fontSize: "clamp(12px, 3vw, 16px)", opacity: 0.9 }}>Sistem Informasi Building Management - General Affairs</p>
        <div style={{ display: "inline-block", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 20px", borderRadius: "50px", fontSize: "13px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.3)" }}>
          📅 {formatTgl}
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "-40px auto 40px", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
          <div onClick={() => { setActiveModal("tamu"); setSearchQuery(""); setHasilTamu([]); }} style={{ background: "white", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-5px)"} onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ background: "#fff5f5", color: "#e53e3e", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>🧑‍💼</div>
            <div>
              <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "16px" }}>Lacak Kehadiran</h2>
              <p style={{ margin: "0", color: "#718096", fontSize: "12px", lineHeight: "1.4" }}>Cari log tamu atau absensi.</p>
            </div>
          </div>
          
          <div onClick={() => { setActiveModal("paket"); setSearchQuery(""); setHasilPaket([]); }} style={{ background: "white", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-5px)"} onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ background: "#fffaf0", color: "#dd6b20", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>📦</div>
            <div>
              <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "16px" }}>Cek Resi Paket</h2>
              <p style={{ margin: "0", color: "#718096", fontSize: "12px", lineHeight: "1.4" }}>Lacak status dokumen pos.</p>
            </div>
          </div>

          <div onClick={() => { setActiveModal("helpdesk"); setHelpdeskTab("LAPOR"); }} style={{ background: "white", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-5px)"} onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ background: "#ebf8ff", color: "#3182ce", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>🛠️</div>
            <div>
              <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "16px" }}>Lapor Kerusakan</h2>
              <p style={{ margin: "0", color: "#718096", fontSize: "12px", lineHeight: "1.4" }}>Lapor fasilitas rusak ke GA.</p>
            </div>
          </div>

          <div onClick={() => { setActiveModal("sbo"); }} style={{ background: "#f0fff4", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(56, 161, 105, 0.2)", cursor: "pointer", border: "2px solid #9ae6b4", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-5px)"} onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ background: "#22543d", color: "#c6f6d5", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>🦺</div>
            <div>
              <h2 style={{ margin: "0 0 5px 0", color: "#22543d", fontSize: "16px" }}>Lapor Bahaya (SBO)</h2>
              <p style={{ margin: "0", color: "#2f855a", fontSize: "12px", lineHeight: "1.4", fontWeight: "bold" }}>Lapor kondisi rawan & kecelakaan.</p>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginTop: "30px" }}>
          
          {/* ========================================== */}
          {/* CARD 1: STATUS ARMADA OPERASIONAL (MURNI KENDARAAN) */}
          {/* ========================================== */}
          <div style={{ background: "white", borderRadius: "20px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
              <div style={{ background: "#fff5f5", padding: "8px", borderRadius: "10px", fontSize: "18px" }}>🚗</div>
              <h3 style={{ margin: 0, color: "#2d3748", fontSize: "16px", fontWeight: "800" }}>Status Armada Operasional</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {mobilStatus.length > 0 ? mobilStatus.map((mobil, idx) => {
                const isStandby = mobil.status_kendaraan?.includes("Standby");
                const isBengkel = mobil.status_kendaraan?.includes("Bengkel") || mobil.status_kendaraan?.includes("Service");
                
                return (
                  <div key={idx} style={{ padding: "12px", borderRadius: "12px", background: isStandby ? "#f0fff4" : isBengkel ? "#f1f5f9" : "#fff5f5", border: isStandby ? "1px solid #c6f6d5" : isBengkel ? "1px solid #cbd5e0" : "1px solid #fed7d7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, paddingRight: "10px" }}>
                      <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "14px" }}>{mobil.kendaraan.split(" - ")[0]}</div>
                      <div style={{ fontSize: "12px", color: "#4a5568", marginTop: "4px", display: "flex", alignItems: "center", gap: "5px" }}>
                        <span>📋 Pengendara:</span> <strong style={{ color: "#2b6cb0" }}>{mobil.driver_bertugas?.replace("Standby: ", "") || "Karyawan"}</strong>
                      </div>
                      {!isStandby && !isBengkel && (
                        <div style={{ fontSize: "11px", color: "#718096", marginTop: "4px", background: "white", padding: "4px 8px", borderRadius: "6px", border: "1px dashed #e2e8f0", display: "inline-block" }}>
                          📍 Keperluan: {mobil.tujuan_keperluan}
                        </div>
                      )}
                    </div>
                    <span style={{ 
                      fontSize: "10px", fontWeight: "bold", padding: "4px 8px", borderRadius: "8px", 
                      background: isStandby ? "#c6f6d5" : isBengkel ? "#cbd5e0" : "#fed7d7", 
                      color: isStandby ? "#22543d" : isBengkel ? "#4a5568" : "#9b2c2c",
                      whiteSpace: "nowrap"
                    }}>
                      {isStandby ? "STANDBY" : isBengkel ? "SERVICE" : "KELUAR"}
                    </span>
                  </div>
                );
              }) : <div style={{ textAlign: "center", padding: "10px", color: "#a0aec0", fontSize: "13px" }}>Belum ada data armada.</div>}
            </div>
          </div>

          {/* ========================================== */}
          {/* CARD 2: SATUAN PETUGAS KEAMANAN & SIAGA DRIVER */}
          {/* ========================================== */}
          <div style={{ background: "white", borderRadius: "20px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
              <div style={{ background: "#ebf8ff", padding: "8px", borderRadius: "10px", fontSize: "18px" }}>🛡️</div>
              <h3 style={{ margin: "0", color: "#2d3748", fontSize: "16px", fontWeight: "800" }}>Security & Personel Driver</h3>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {/* Blok Jadwal Security */}
              <div style={{ background: "#ebf8ff", border: "1px solid #bee3f8", padding: "14px", borderRadius: "12px" }}>
                <div style={{ fontSize: "10px", fontWeight: "bold", color: "#3182ce", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.5px" }}>🛡️ SECURITY ON DUTY ({securityShift.currentName})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {securityShift.current.length > 0 ? securityShift.current.map((staf, i) => (
                    <span key={i} style={{ background: "white", color: "#2b6cb0", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", border: "1px solid #cbd5e0" }}>👮 {staf}</span>
                  )) : <span style={{ fontSize: "12px", color: "#718096" }}>Belum ada data shift</span>}
                </div>
              </div>

              {/* 💡 INTEGRASI BARU: Monitoring Status Driver Real-time */}
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "14px", borderRadius: "12px" }}>
                <div style={{ fontSize: "10px", fontWeight: "bold", color: "#4a5568", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.5px" }}>🧑‍✈️ STATUS SIAGA TIM DRIVER</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {Object.keys(driverStatusMap).map((namaDriver) => {
                    const statusStr = driverStatusMap[namaDriver];
                    const isStandby = statusStr === "Standby";
                    const isKeluar = statusStr === "Keluar Beroperasi";
                    
                    return (
                      <div key={namaDriver} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", padding: "8px 12px", borderRadius: "8px", border: "1px solid #edf2f7", transition: "all 0.3s" }}>
                        <span style={{ fontSize: "13px", fontWeight: "bold", color: "#2d3748" }}>🧑‍✈️ {namaDriver.split(" ")[0]}</span>
                        <span style={{ 
                          fontSize: "10px", fontWeight: "bold", padding: "4px 8px", borderRadius: "6px",
                          background: isStandby ? "#c6f6d5" : isKeluar ? "#fed7d7" : "#e2e8f0",
                          color: isStandby ? "#22543d" : isKeluar ? "#9b2c2c" : "#4a5568"
                        }}>
                          {isStandby ? "🟢 STANDBY" : isKeluar ? "🔴 KELUAR" : "⚪ OFF / IZIN"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Blok Shift Security Berikutnya */}
              <div style={{ background: "#f7fafc", border: "1px solid #edf2f7", padding: "12px", borderRadius: "12px" }}>
                <div style={{ fontSize: "10px", fontWeight: "bold", color: "#718096", textTransform: "uppercase", marginBottom: "6px" }}>SHIFT SECURITY BERIKUTNYA</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {securityShift.next.length > 0 ? securityShift.next.map((staf, i) => (
                    <span key={i} style={{ background: "white", color: "#4a5568", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", border: "1px solid #cbd5e0" }}>{staf}</span>
                  )) : <span style={{ fontSize: "11px", color: "#a0aec0" }}>Off Duty / Pergantian Besok</span>}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* CARD 3: AREA TIM KEBERSIHAN */}
          {/* ========================================== */}
          <div style={{ background: "white", borderRadius: "20px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
              <div style={{ background: "#f7fafc", padding: "8px", borderRadius: "10px", fontSize: "18px" }}>🧹</div>
              <h3 style={{ margin: 0, color: "#2d3748", fontSize: "16px", fontWeight: "800" }}>Area Tim Kebersihan</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {obBertugas.length > 0 ? obBertugas.map((ob, idx) => {
                const isHadir = ob.status.includes("Hadir");
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px", borderRadius: "12px", background: isHadir ? "transparent" : "#fff5f5", border: "1px solid #edf2f7" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "13px" }}>{ob.nama}</div>
                      <div style={{ fontSize: "11px", color: "#718096" }}>{isHadir ? (ob.lokasi.length > 0 ? `📍 ${ob.lokasi.join(", ")}` : "Standby") : ob.status}</div>
                    </div>
                    {isHadir ? <span style={{ fontSize: "10px", background: "#c6f6d5", color: "#22543d", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>ON DUTY</span> : <span style={{ fontSize: "10px", background: "#fed7d7", color: "#c53030", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>OFF</span>}
                  </div>
                );
              }) : <div style={{ textAlign: "center", padding: "10px", color: "#a0aec0", fontSize: "13px" }}>Jadwal shift OB belum diterbitkan.</div>}
            </div>
          </div>
        </div>
      </div>

      {activeModal !== "none" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "550px", borderRadius: "24px", padding: "30px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", maxHeight: "85vh", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
            
            <button onClick={() => setActiveModal("none")} style={{ position: "absolute", top: "20px", right: "20px", background: "#edf2f7", border: "none", width: "36px", height: "36px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, fontSize: "14px", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#e2e8f0"} onMouseOut={(e) => e.currentTarget.style.background = "#edf2f7"}>✖</button>

            {/* MODAL LOGIN */}
            {activeModal === "login" && (
              <>
                <div style={{ textAlign: "center", marginBottom: "25px", marginTop: "10px" }}><div style={{ fontSize: "45px", marginBottom: "15px" }}>🏢</div><h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "22px", fontWeight: "800" }}>Akses Staf Internal</h2><p style={{ margin: 0, color: "#718096", fontSize: "14px" }}>Login untuk accessing modul operasional.</p></div>
                <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Anda" style={sharedInputStyle} />
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Kata Sandi" style={sharedInputStyle} />
                  <button type="submit" disabled={isLoginLoading} style={{ width: "100%", padding: "16px", background: isLoginLoading ? "#a0aec0" : "#e53e3e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isLoginLoading ? "not-allowed" : "pointer", marginTop: "15px", boxShadow: "0 4px 15px rgba(229, 62, 62, 0.3)", transition: "0.2s" }}>{isLoginLoading ? "Memeriksa..." : "Masuk Dashboard"}</button>
                </form>
              </>
            )}

            {/* MODAL SBO (QHSE) */}
            {activeModal === "sbo" && (
              <form onSubmit={handleSubmitSbo} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ marginBottom: "10px", paddingRight: "30px", borderBottom: "2px solid #edf2f7", paddingBottom: "20px" }}>
                  <h2 style={{ margin: "0 0 8px 0", color: "#22543d", fontSize: "20px", display: "flex", alignItems: "center", gap: "10px", fontWeight: "800" }}><span style={{background:"#c6f6d5", padding:"8px", borderRadius:"12px"}}>🦺</span> Lapor Bahaya (SBO)</h2>
                  <p style={{ margin: 0, color: "#718096", fontSize: "13px", lineHeight: "1.5" }}>Laporan IK-QHSE-SML-001. Laporkan temuan kondisi fisik atau perilaku kerja yang berbahaya di area operasional.</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Pelapor *</label>
                    <input type="text" required placeholder="Nama Lengkap" value={formSbo.nama_pelapor} onChange={(e) => setFormSbo({...formSbo, nama_pelapor: e.target.value})} style={sharedInputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Tanggal Kejadian *</label>
                    <input type="date" required value={formSbo.tanggal_kejadian} onChange={(e) => setFormSbo({...formSbo, tanggal_kejadian: e.target.value})} style={sharedInputStyle} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Unit Bisnis *</label>
                    <select required value={formSbo.unit_bisnis} onChange={(e) => setFormSbo({...formSbo, unit_bisnis: e.target.value})} style={{...sharedInputStyle, cursor: "pointer", padding: "13px 16px"}}>
                      <option value="" disabled>-- Pilih Unit --</option>
                      <option value="PT Makassar Jaya Samudera">PT Makassar Jaya Samudera</option>
                      <option value="PT Samudera Propertie Indonesia">PT Samudera Propertie Indonesia</option>
                      <option value="PT Samudera Indonesia">PT Samudera Indonesia</option>
                      <option value="PT Perusahaan Pelayaran Nusantara Panurjwan">PT Perusahaan Pelayaran Nusantara Panurjwan</option>
                      <option value="PT Masaji Kargo Sentra Tama (Office)">PT Masaji Kargo Sentra Tama (Office)</option>
                      <option value="PT Masaji Kargo Sentra Tama (Warehouse)">PT Masaji Kargo Sentra Tama (Warehouse)</option>
                      <option value="PT PAD Samudera Perdana (Office)">PT PAD Samudera Perdana (Office)</option>
                      <option value="PT PAD Samudera Perdana (Pool)">PT PAD Samudera Perdana (Pool)</option>
                      <option value="PT Samudera Makassar Logistik">PT Samudera Makassar Logistik</option>
                      <option value="PT Kendari Jaya Samudera">PT Kendari Jaya Samudera</option>
                      <option value="PT Samudera Kendari Logistik">PT Samudera Kendari Logistik</option>
                      <option value="PT Samudera Agencies Indonesia">PT Samudera Agencies Indonesia</option>
                      <option value="PT Silkargo Indonesia">PT Silkargo Indonesia</option>
                      <option value="Asuransi Bintang">Asuransi Bintang</option>
                      <option value="External">External</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Lokasi Temuan *</label>
                    <input type="text" required placeholder="Cth: Area Parkir Basement" value={formSbo.lokasi} onChange={(e) => setFormSbo({...formSbo, lokasi: e.target.value})} style={sharedInputStyle} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Kategori Temuan *</label>
                  <select required value={formSbo.kategori_temuan} onChange={(e) => setFormSbo({...formSbo, kategori_temuan: e.target.value})} style={{...sharedInputStyle, cursor: "pointer", padding: "13px 16px", marginBottom: "8px"}}>
                    <option value="Kondisi Tidak Aman (Unsafe Condition)">⚠️ Kondisi Tidak Aman (Unsafe Condition)</option>
                    <option value="Perilaku Tidak Aman (Unsafe Act)">🛑 Perilaku Tidak Aman (Unsafe Act)</option>
                    <option value="Near Miss (Hampir Celaka)">⚡ Near Miss (Hampir Celaka)</option>
                    <option value="Lingkungan (Pencemaran/Tumpahan)">💧 Lingkungan (Pencemaran/Tumpahan)</option>
                  </select>
                  
                  <div style={{ fontSize: "12px", color: "#2b6cb0", background: "#ebf8ff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #bee3f8", display: "flex", gap: "8px" }}>
                    <span>💡</span>
                    <span>
                      {formSbo.kategori_temuan === "Kondisi Tidak Aman (Unsafe Condition)" && "Fisik area kerja yang berbahaya. Contoh: Kabel terkelupas, lantai licin, alat rusak."}
                      {formSbo.kategori_temuan === "Perilaku Tidak Aman (Unsafe Act)" && "Tindakan melanggar SOP. Contoh: Tidak pakai APD (Helm/Sepatu safety), merokok di area dilarang."}
                      {formSbo.kategori_temuan === "Near Miss (Hampir Celaka)" && "Kejadian hampir celaka. Contoh: Hampir terpeleset tumpahan oli, nyaris tertimpa barang jatuh."}
                      {formSbo.kategori_temuan === "Lingkungan (Pencemaran/Tumpahan)" && "Berdampak pada alam. Contoh: Tumpahan bahan kimia (B3) ke saluran air, asap tebal."}
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Detail Temuan / Isu *</label>
                  <textarea required placeholder="Jelaskan secara spesifik bahaya yang ditemukan..." value={formSbo.detail_temuan} onChange={(e) => setFormSbo({...formSbo, detail_temuan: e.target.value})} style={{...sharedInputStyle, minHeight: "80px", resize: "vertical"}} />
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Apa Penyebab Temuan Tersebut? *</label>
                  <input type="text" required placeholder="Cth: Genangan air hujan, kelalaian pekerja..." value={formSbo.penyebab} onChange={(e) => setFormSbo({...formSbo, penyebab: e.target.value})} style={sharedInputStyle} />
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Tindakan Pengamanan (Save Action) *</label>
                  <input type="text" required placeholder="Cth: Memasang rambu peringatan lantai licin" value={formSbo.action_taken} onChange={(e) => setFormSbo({...formSbo, action_taken: e.target.value})} style={sharedInputStyle} />
                </div>

                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "15px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "13px", fontWeight: "bold", color: "#2d3748" }}>Status Temuan Saat Ini:</label>
                  <select required value={formSbo.status_temuan} onChange={(e) => setFormSbo({...formSbo, status_temuan: e.target.value})} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "13px", fontWeight: "bold", color: formSbo.status_temuan === "Open" ? "#e53e3e" : "#38a169", outline: "none", cursor: "pointer", background: "white" }}>
                    <option value="Open">🔴 OPEN (Masih Berbahaya)</option>
                    <option value="Close">🟢 CLOSE (Sudah Aman)</option>
                  </select>
                </div>

                {formSbo.kategori_temuan.includes("Unsafe Act") && (
                  <div style={{ background: "#fff5f5", border: "1px solid #fed7d7", padding: "20px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "12px", animation: "fadeIn 0.3s" }}>
                    <div style={{ fontSize: "12px", fontWeight: "800", color: "#c53030", letterSpacing: "0.5px" }}>[ WAJIB UNTUK UNSAFE ACT ]</div>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Komitmen Pelaku Kedepan?</label>
                      <input type="text" required placeholder="Komitmen dari pelanggar..." value={formSbo.komitmen_pelaku} onChange={(e) => setFormSbo({...formSbo, komitmen_pelaku: e.target.value})} style={{...sharedInputStyle, background: "white"}} />
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Konsekuensi Jika Mengulangi?</label>
                      <input type="text" required placeholder="Cth: Diberi teguran lisan / SP1..." value={formSbo.konsekuensi} onChange={(e) => setFormSbo({...formSbo, konsekuensi: e.target.value})} style={{...sharedInputStyle, background: "white"}} />
                    </div>
                  </div>
                )}
                
                <div style={{ background: fotoSbo ? "#f0fff4" : "#f8fafc", border: fotoSbo ? "2px solid #9ae6b4" : "2px dashed #cbd5e0", padding: "25px 20px", borderRadius: "16px", textAlign: "center", transition: "0.2s", marginTop: "10px" }}>
                  <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "35px", filter: fotoSbo ? "none" : "grayscale(100%) opacity(0.6)" }}>📸</span>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: fotoSbo ? "#22543d" : "#4a5568" }}>{fotoSbo ? "Foto Temuan Terlampir ✓" : "Unggah Bukti Foto Temuan (Wajib) *"}</div>
                    {!fotoSbo && <div style={{fontSize: "11px", color: "#a0aec0"}}>Ketuk untuk membuka kamera atau galeri</div>}
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, setFotoSbo)} style={{ display: "none" }} required={!fotoSbo} />
                  </label>
                  {fotoSbo && (
                    <div style={{marginTop: "15px", position: "relative", display: "inline-block"}}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotoSbo} alt="Bukti Bahaya" style={{ width: "100%", maxHeight: "180px", objectFit: "cover", borderRadius: "10px", border: "1px solid #c6f6d5", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} />
                      <button type="button" onClick={() => setFotoSbo("")} style={{position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "white", border: "none", width: "25px", height: "25px", borderRadius: "50%", cursor: "pointer", fontSize: "12px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)"}}>✖</button>
                    </div>
                  )}
                </div>
                
                <button type="submit" disabled={isSboLoading} style={{ width: "100%", padding: "16px", background: isSboLoading ? "#a0aec0" : "#2f855a", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: isSboLoading ? "not-allowed" : "pointer", marginTop: "15px", boxShadow: "0 10px 15px -3px rgba(47, 133, 90, 0.3)", transition: "all 0.2s" }}>
                  {isSboLoading ? "Memproses Laporan..." : "Kirim Form SBO"}
                </button>
              </form>
            )}

            {/* MODAL HELPDESK */}
            {activeModal === "helpdesk" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ marginBottom: "15px", paddingRight: "20px" }}>
                  <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "22px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}><span style={{background:"#ebf8ff", padding:"8px", borderRadius:"12px"}}>🛠️</span> Helpdesk GA</h2>
                  <p style={{ margin: 0, color: "#718096", fontSize: "13px" }}>Pusat pelaporan kerusakan dan perawatan fasilitas gedung.</p>
                </div>

                {/* Modern Segmented Control for Tabs */}
                <div style={{ display: "flex", background: "#f1f5f9", padding: "6px", borderRadius: "14px", marginBottom: "25px", border: "1px solid #e2e8f0" }}>
                  <button onClick={() => setHelpdeskTab("LAPOR")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "14px", background: helpdeskTab === "LAPOR" ? "white" : "transparent", color: helpdeskTab === "LAPOR" ? "#3182ce" : "#64748b", boxShadow: helpdeskTab === "LAPOR" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", cursor: "pointer", transition: "all 0.2s" }}>
                    📝 Buat Laporan
                  </button>
                  <button onClick={() => setHelpdeskTab("LACAK")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "14px", background: helpdeskTab === "LACAK" ? "white" : "transparent", color: helpdeskTab === "LACAK" ? "#3182ce" : "#64748b", boxShadow: helpdeskTab === "LACAK" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", cursor: "pointer", transition: "all 0.2s" }}>
                    🔍 Lacak Tiket
                  </button>
                </div>

                {helpdeskTab === "LAPOR" ? (
                  <form onSubmit={handleSubmitHelpdesk} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Pelapor *</label>
                      <input list="emp-list" type="text" required placeholder="Ketik nama Anda..." value={formHelpdesk.nama} onChange={handleNameChange} style={sharedInputStyle} />
                      <datalist id="emp-list">{employees.map(emp => <option key={emp.id} value={emp.nama} />)}</datalist>
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Departemen</label>
                      <input type="text" required readOnly placeholder="Terisi otomatis..." value={formHelpdesk.dept} style={{...sharedInputStyle, background: "#e2e8f0", color: "#4a5568", cursor: "not-allowed"}} />
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Titik Lokasi Kerusakan *</label>
                      <input type="text" required placeholder="Misal: Toilet Lt 2 / Pantry / Ruang Meeting" value={formHelpdesk.lokasi} onChange={(e) => setFormHelpdesk({...formHelpdesk, lokasi: e.target.value})} style={sharedInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Deskripsi Masalah *</label>
                      <textarea required placeholder="Jelaskan secara spesifik... (Cth: AC netes parah ke lantai)" value={formHelpdesk.deskripsi} onChange={(e) => setFormHelpdesk({...formHelpdesk, deskripsi: e.target.value})} style={{...sharedInputStyle, minHeight: "80px", resize: "vertical"}} />
                    </div>
                    
                    <div style={{ background: fotoAwal ? "#ebf8ff" : "#f8fafc", border: fotoAwal ? "2px solid #90cdf4" : "2px dashed #cbd5e0", padding: "25px 20px", borderRadius: "16px", textAlign: "center", transition: "0.2s", marginTop: "5px" }}>
                      <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "35px", filter: fotoAwal ? "none" : "grayscale(100%) opacity(0.6)" }}>📸</span>
                        <div style={{ fontSize: "14px", fontWeight: "bold", color: fotoAwal ? "#2b6cb0" : "#4a5568" }}>Foto Kerusakan Terlampir ✓</div>
                        <input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, setFotoAwal)} style={{ display: "none" }} required={!fotoAwal} />
                      </label>
                      {fotoAwal && (
                        <div style={{marginTop: "15px", position: "relative", display: "inline-block"}}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fotoAwal} alt="Preview Kerusakan" style={{ width: "100%", maxHeight: "180px", objectFit: "cover", borderRadius: "10px", border: "1px solid #90cdf4", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} />
                          <button type="button" onClick={() => setFotoAwal("")} style={{position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "white", border: "none", width: "25px", height: "25px", borderRadius: "50%", cursor: "pointer", fontSize: "12px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)"}}>✖</button>
                        </div>
                      )}
                    </div>
                    
                    <button type="submit" disabled={isHelpdeskLoading} style={{ width: "100%", padding: "16px", background: isHelpdeskLoading ? "#a0aec0" : "#3182ce", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: isHelpdeskLoading ? "not-allowed" : "pointer", marginTop: "10px", boxShadow: "0 10px 15px -3px rgba(49, 130, 206, 0.3)", transition: "all 0.2s" }}>
                      {isHelpdeskLoading ? "Mengunggah Laporan..." : "Kirim Laporan"}
                    </button>
                  </form>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                      <input list="emp-list-search" type="text" placeholder="Ketik nama Anda di sini..." value={searchHelpdeskName} onChange={(e) => setSearchHelpdeskName(e.target.value)} style={{...sharedInputStyle, flex: 1}} />
                      <datalist id="emp-list-search">{employees.map(emp => <option key={emp.id} value={emp.nama} />)}</datalist>
                      <button onClick={handleCariHelpdesk} disabled={isSearchingHelpdesk} style={{ background: "#3182ce", color: "white", padding: "0 20px", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", fontSize: "14px", boxShadow: "0 4px 6px rgba(49, 130, 206, 0.2)" }}>
                        {isSearchingHelpdesk ? "..." : "Cari Tiket"}
                      </button>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "15px", paddingRight: "5px" }}>
                      {hasilHelpdesk.length > 0 ? hasilHelpdesk.map((tiket) => (
                        <div key={tiket.id} style={{ border: "1px solid #e2e8f0", borderRadius: "16px", overflow: "hidden", background: "white", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                          <div style={{ background: "#f8fafc", padding: "15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: "800", color: "#2d3748", fontSize: "14px" }}>📍 {tiket.lokasi}</span>
                            <span style={{ fontSize: "11px", padding: "6px 10px", borderRadius: "8px", fontWeight: "bold", background: tiket.status === "Menunggu" ? "#feebc8" : (tiket.status === "Sedang Dikerjakan" ? "#ebf8ff" : "#c6f6d5"), color: tiket.status === "Menunggu" ? "#9c4221" : (tiket.status === "Sedang Dikerjakan" ? "#2b6cb0" : "#22543d") }}>
                              {tiket.status === "Menunggu" ? "⏳ Menunggu" : tiket.status === "Sedang Dikerjakan" ? "🧑‍🔧 Dikerjakan" : "✅ Selesai"}
                            </span>
                          </div>
                          <div style={{ padding: "15px" }}>
                            <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#4a5568", fontStyle: "italic", lineHeight: "1.5" }}>&quot;{tiket.deskripsi}&quot;</p>
                            {(tiket.foto_awal || tiket.foto_proses) && (
                              <div style={{ display: "flex", gap: "12px", marginTop: "15px", paddingTop: "15px", borderTop: "1px dashed #e2e8f0" }}>
                                {tiket.foto_awal && (
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: "10px", color: "#718096", marginBottom: "5px", fontWeight: "bold", letterSpacing: "0.5px" }}>KONDISI AWAL</div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={tiket.foto_awal} alt="Awal" style={{ width: "100%", height: "90px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e2e8f0" }} />
                                  </div>
                                )}
                                {tiket.foto_proses && (
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: "10px", color: "#38a169", marginBottom: "5px", fontWeight: "bold", letterSpacing: "0.5px" }}>HASIL PERBAIKAN</div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={tiket.foto_proses} alt="Proses" style={{ width: "100%", height: "90px", objectFit: "cover", borderRadius: "8px", border: "1px solid #c6f6d5" }} />
                                  </div>
                                )}
                              </div>
                            )}
                            <div style={{ fontSize: "11px", color: "#a0aec0", marginTop: "15px", textAlign: "right", fontWeight: "bold" }}>Dilaporkan: {formatJam(tiket.waktu_lapor)}</div>
                          </div>
                        </div>
                      )) : (
                        <div style={{ textAlign: "center", padding: "50px 20px", color: "#a0aec0", background: "#f8fafc", borderRadius: "16px", border: "1px dashed #cbd5e0" }}>
                          <div style={{ fontSize: "30px", marginBottom: "10px" }}>🔍</div>
                          <div style={{ fontSize: "14px", fontWeight: "bold" }}>Mulai Pencarian</div>
                          <div style={{ fontSize: "12px", marginTop: "5px" }}>Hasil pelacakan tiket perbaikan akan muncul di sini.</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MODAL TAMU & PAKET */}
            {(activeModal === "tamu" || activeModal === "paket") && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ marginBottom: "20px", paddingRight: "30px" }}>
                  <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "22px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}><span style={{background: activeModal === "tamu" ? "#fff5f5" : "#fffaf0", padding:"8px", borderRadius:"12px"}}>{activeModal === "tamu" ? "🧑‍💼" : "📦"}</span> {activeModal === "tamu" ? "Lacak Kehadiran" : "Lacak Resi Paket"}</h2>
                  <p style={{ margin: 0, color: "#718096", fontSize: "13px" }}>Tekan tombol cari untuk memuat daftar operasional terbaru.</p>
                </div>
                <div style={{ display: "flex", gap: "10px", marginBottom: "25px" }}>
                  <input type="text" placeholder={activeModal === "tamu" ? "Ketik nama tamu / instansi..." : "Ketik nama penerima paket..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{...sharedInputStyle, flex: 1}} />
                  <button onClick={activeModal === "tamu" ? handleCariTamu : handleCariPaket} disabled={isSearching} style={{ background: activeModal === "tamu" ? "#e53e3e" : "#dd6b20", color: "white", padding: "0 20px", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", fontSize: "14px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>{isSearching ? "..." : "Cari"}</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", paddingRight: "5px" }}>
                  {activeModal === "tamu" && hasilTamu.map(t => (
                    <div key={t.id} style={{ padding: "18px", border: "1px solid #e2e8f0", borderRadius: "16px", background: "#f8fafc", borderLeft: "5px solid #e53e3e", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                      <div style={{ fontWeight: "800", color: "#2d3748", fontSize: "15px" }}>{t.nama}</div>
                      <div style={{ fontSize: "13px", color: "#718096", marginBottom: "12px", marginTop: "2px" }}>{t.instansi_dept}</div>
                      <div style={{ gap: "20px", fontSize: "12px", background: "white", padding: "8px 12px", borderRadius: "8px", border: "1px solid #edf2f7", display: "inline-flex" }}>
                        <div><span style={{ color: "#38a169", fontWeight: "bold" }}>In:</span> {formatJam(t.waktu_masuk)}</div>
                        <div><span style={{ color: "#e53e3e", fontWeight: "bold" }}>Out:</span> {formatJam(t.waktu_keluar)}</div>
                      </div>
                    </div>
                  ))}
                  {activeModal === "paket" && hasilPaket.map(p => (
                    <div key={p.id} style={{ padding: "18px", border: "1px solid #e2e8f0", borderRadius: "16px", background: "#f8fafc", borderLeft: "5px solid #dd6b20", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div style={{ fontWeight: "800", color: "#2d3748", fontSize: "15px", paddingRight: "10px" }}>{p.penerima}</div>
                        <span style={{ fontSize: "11px", background: p.status === "Sudah Diambil" ? "#c6f6d5" : "#feebc8", color: p.status === "Sudah Diambil" ? "#22543d" : "#9c4221", padding: "4px 10px", borderRadius: "8px", fontWeight: "bold", whiteSpace: "nowrap" }}>{p.status}</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#718096", marginBottom: "5px" }}>Kurir: {p.kurir}</div>
                      <div style={{ fontSize: "12px", color: "#a0aec0", fontWeight: "bold" }}>Diterima: {formatJam(p.waktu_diterima)}</div>
                    </div>
                  ))}
                  {(activeModal === "tamu" && hasilTamu.length === 0) || (activeModal === "paket" && hasilPaket.length === 0) ? (
                    <div style={{ textAlign: "center", padding: "50px 20px", color: "#a0aec0", background: "#f8fafc", borderRadius: "16px", border: "1px dashed #cbd5e0" }}>
                      <div style={{ fontSize: "30px", marginBottom: "10px" }}>{activeModal === "tamu" ? "🧑‍💼" : "📦"}</div>
                      <div style={{ fontSize: "14px", fontWeight: "bold" }}>Data Kosong</div>
                      <div style={{ fontSize: "12px", marginTop: "5px" }}>Gunakan pencarian untuk memuat riwayat.</div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}