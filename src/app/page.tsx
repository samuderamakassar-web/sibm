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

    const vehRef = collection(db, "operational_vehicle_logs");
    const unsubVeh = onSnapshot(query(vehRef, orderBy("waktu_catat", "desc"), limit(20)), (snapshot) => {
      const logs = snapshot.docs.map(d => d.data() as KendaraanLog);
      const statusTerkini: Record<string, KendaraanLog> = {};
      logs.forEach(log => { if (!statusTerkini[log.kendaraan]) statusTerkini[log.kendaraan] = log; });
      setMobilStatus(Object.values(statusTerkini));
    });

    const fetchEmp = async () => {
      const empSnap = await getDocs(collection(db, "employees_directory"));
      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    };
    fetchEmp();

    // ==============================================================
    // PEMBACAAN JADWAL SECURITY (DENGAN LOGIKA JAM TERBARU)
    // ==============================================================
    const fetchSecurity = async () => {
      try {
        const metaSnap = await getDoc(doc(db, "security_schedules", "active_meta"));
        if (metaSnap.exists()) {
          const docId = metaSnap.data().current_doc_id;
          const mSnap = await getDoc(doc(db, "security_monthly_schedules", docId));
          
          if (mSnap.exists()) {
            const dataHari = ((mSnap.data().data_hari || {}) as Record<string, Record<string, string>>)[todayISO] || {};

            const jamSekarang = new Date().getHours();
            const dayOfWeek = new Date().getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Minggu(0), Jumat(5), Sabtu(6)

            if (isWeekend) {
              const masuk = Object.keys(dataHari).filter(k => dataHari[k]?.toLowerCase() === "masuk");

              if (jamSekarang >= 8 && jamSekarang < 20) {
                setSecurityShift({ current: masuk, next: [], currentName: "Shift Masuk (08:00 - 20:00)", nextName: "Off Duty (20:00 - 08:00)" });
              } else {
                setSecurityShift({ current: [], next: masuk, currentName: "Off Duty (20:00 - 08:00)", nextName: "Shift Masuk (Besok 08:00)" });
              }
            } else {
              const pagi = Object.keys(dataHari).filter(k => dataHari[k]?.toLowerCase() === "pagi");
              const siang = Object.keys(dataHari).filter(k => dataHari[k]?.toLowerCase() === "siang");
              const malam = Object.keys(dataHari).filter(k => dataHari[k]?.toLowerCase() === "malam");

              if (jamSekarang >= 8 && jamSekarang < 14) {
                setSecurityShift({ current: pagi, next: siang, currentName: "Shift Pagi (08:00 - 14:00)", nextName: "Shift Siang (14:00 - 22:00)" });
              } else if (jamSekarang >= 14 && jamSekarang < 22) {
                setSecurityShift({ current: siang, next: malam, currentName: "Shift Siang (14:00 - 22:00)", nextName: "Shift Malam (22:00 - 08:00)" });
              } else {
                setSecurityShift({ current: malam, next: pagi, currentName: "Shift Malam (22:00 - 08:00)", nextName: "Shift Pagi (Besok 08:00)" });
              }
            }
          }
        }
      } catch (e) { console.error(e); }
    };
    fetchSecurity();

    return () => { unsubPlot(); unsubVeh(); };
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
          
          <div style={{ background: "white", borderRadius: "20px", padding: "20px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
              <div style={{ background: "#f7fafc", padding: "8px", borderRadius: "10px", fontSize: "18px" }}>🚗</div>
              <h3 style={{ margin: 0, color: "#2d3748", fontSize: "16px" }}>Status Driver & Armada</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {mobilStatus.length > 0 ? mobilStatus.map((mobil, idx) => {
                const isStandby = mobil.status_kendaraan?.includes("Standby");
                return (
                  <div key={idx} style={{ padding: "12px", borderRadius: "12px", background: isStandby ? "#f0fff4" : "#f7fafc", border: isStandby ? "1px solid #c6f6d5" : "1px solid #edf2f7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "14px" }}>{mobil.kendaraan}</div>
                      <div style={{ fontSize: "12px", color: "#4a5568", marginTop: "4px" }}>🧑‍✈️ {mobil.driver_bertugas || "Tanpa Driver"}</div>
                      {!isStandby && <div style={{ fontSize: "11px", color: "#718096", marginTop: "2px" }}>📍 {mobil.tujuan_keperluan}</div>}
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: "bold", padding: "4px 8px", borderRadius: "8px", background: isStandby ? "#c6f6d5" : "#e2e8f0", color: isStandby ? "#22543d" : "#4a5568" }}>
                      {isStandby ? "STANDBY" : "KELUAR"}
                    </span>
                  </div>
                );
              }) : <div style={{ textAlign: "center", padding: "10px", color: "#a0aec0", fontSize: "13px" }}>Belum ada data armada.</div>}
            </div>
          </div>

          <div style={{ background: "white", borderRadius: "20px", padding: "20px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
              <div style={{ background: "#f7fafc", padding: "8px", borderRadius: "10px", fontSize: "18px" }}>🛡️</div>
              <h3 style={{ margin: "0", color: "#2d3748", fontSize: "16px" }}>Shift Security SIBM</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div style={{ background: "#ebf8ff", border: "1px solid #bee3f8", padding: "15px", borderRadius: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: "bold", color: "#3182ce", textTransform: "uppercase", marginBottom: "5px" }}>SEDANG BERTUGAS ({securityShift.currentName})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {securityShift.current.length > 0 ? securityShift.current.map((staf, i) => (
                    <span key={i} style={{ background: "white", color: "#2b6cb0", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", border: "1px solid #cbd5e0" }}>👮 {staf}</span>
                  )) : <span style={{ fontSize: "12px", color: "#718096" }}>Belum ada data shift</span>}
                </div>
              </div>
              <div style={{ background: "#f7fafc", border: "1px solid #edf2f7", padding: "15px", borderRadius: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: "bold", color: "#718096", textTransform: "uppercase", marginBottom: "5px" }}>SHIFT BERIKUTNYA ({securityShift.nextName})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {securityShift.next.length > 0 ? securityShift.next.map((staf, i) => (
                    <span key={i} style={{ background: "white", color: "#4a5568", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", border: "1px solid #cbd5e0" }}>{staf}</span>
                  )) : <span style={{ fontSize: "12px", color: "#a0aec0" }}>Belum ada data shift</span>}
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: "white", borderRadius: "20px", padding: "20px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "10px" }}>
              <div style={{ background: "#f7fafc", padding: "8px", borderRadius: "10px", fontSize: "18px" }}>🧹</div>
              <h3 style={{ margin: 0, color: "#2d3748", fontSize: "16px" }}>Area Tim Kebersihan</h3>
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
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "600px", borderRadius: "24px", padding: "30px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", position: "relative", maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <button onClick={() => setActiveModal("none")} style={{ position: "absolute", top: "20px", right: "20px", background: "#f7fafc", border: "none", width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, fontSize: "16px" }}>✖</button>

            {activeModal === "login" && (
              <>
                <div style={{ textAlign: "center", marginBottom: "25px" }}><div style={{ fontSize: "40px", marginBottom: "10px" }}>🏢</div><h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "20px" }}>Akses Staf Internal</h2><p style={{ margin: 0, color: "#718096", fontSize: "13px" }}>Login untuk mengakses modul operasional.</p></div>
                <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Anda" style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "14px", background: "#f8fafc", outline: "none" }} />
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Kata Sandi" style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "14px", background: "#f8fafc", outline: "none" }} />
                  <button type="submit" disabled={isLoginLoading} style={{ width: "100%", padding: "15px", background: isLoginLoading ? "#a0aec0" : "#e53e3e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isLoginLoading ? "not-allowed" : "pointer", marginTop: "10px", boxShadow: "0 4px 6px rgba(229, 62, 62, 0.3)" }}>{isLoginLoading ? "Memeriksa..." : "Masuk Dashboard"}</button>
                </form>
              </>
            )}

            {/* MODAL SBO (QHSE) */}
            {activeModal === "sbo" && (
              <form onSubmit={handleSubmitSbo} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div style={{ marginBottom: "5px", paddingRight: "30px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px" }}>
                  <h2 style={{ margin: "0 0 5px 0", color: "#22543d", fontSize: "20px", display: "flex", alignItems: "center", gap: "8px" }}><span>🦺</span> Safety Behavior Observation (SBO)</h2>
                  <p style={{ margin: 0, color: "#718096", fontSize: "13px", lineHeight: "1.4" }}>Laporan IK-QHSE-SML-001. Formulir ini diperuntukkan untuk melaporkan temuan kondisi atau tindakan tidak aman.</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Nama Lengkap *</label>
                    <input type="text" required placeholder="Nama Lengkap Anda" value={formSbo.nama_pelapor} onChange={(e) => setFormSbo({...formSbo, nama_pelapor: e.target.value})} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "13px", background: "#f8fafc", outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Tanggal Kejadian *</label>
                    <input type="date" required value={formSbo.tanggal_kejadian} onChange={(e) => setFormSbo({...formSbo, tanggal_kejadian: e.target.value})} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "13px", background: "#f8fafc", outline: "none" }} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Unit Bisnis *</label>
                    <select required value={formSbo.unit_bisnis} onChange={(e) => setFormSbo({...formSbo, unit_bisnis: e.target.value})} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "12px", background: "#f8fafc", outline: "none", cursor: "pointer" }}>
                      <option value="" disabled>-- Pilih Unit Bisnis --</option>
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
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Lokasi Temuan *</label>
                    <input type="text" required placeholder="Cth: Area Parkir Basement" value={formSbo.lokasi} onChange={(e) => setFormSbo({...formSbo, lokasi: e.target.value})} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "13px", background: "#f8fafc", outline: "none" }} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Kategori Temuan *</label>
                  <select required value={formSbo.kategori_temuan} onChange={(e) => setFormSbo({...formSbo, kategori_temuan: e.target.value})} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "13px", background: "#f8fafc", outline: "none", cursor: "pointer", marginBottom: "5px" }}>
                    <option value="Kondisi Tidak Aman (Unsafe Condition)">⚠️ Kondisi Tidak Aman (Unsafe Condition)</option>
                    <option value="Perilaku Tidak Aman (Unsafe Act)">🛑 Perilaku Tidak Aman (Unsafe Act)</option>
                    <option value="Near Miss (Hampir Celaka)">⚡ Near Miss (Hampir Celaka)</option>
                    <option value="Lingkungan (Pencemaran/Tumpahan)">💧 Lingkungan (Pencemaran/Tumpahan)</option>
                  </select>
                  
                  <div style={{ fontSize: "11px", color: "#4a5568", background: "#edf2f7", padding: "8px", borderRadius: "8px", borderLeft: "3px solid #3182ce" }}>
                    {formSbo.kategori_temuan === "Kondisi Tidak Aman (Unsafe Condition)" && "💡 Fisik area kerja yang berbahaya. Contoh: Kabel terkelupas, lantai licin, alat rusak."}
                    {formSbo.kategori_temuan === "Perilaku Tidak Aman (Unsafe Act)" && "💡 Tindakan melanggar SOP. Contoh: Tidak pakai APD (Helm/Sepatu safety), merokok di area dilarang."}
                    {formSbo.kategori_temuan === "Near Miss (Hampir Celaka)" && "💡 Kejadian hampir celaka. Contoh: Hampir terpeleset tumpahan oli, hampir tertimpa barang jatuh."}
                    {formSbo.kategori_temuan === "Lingkungan (Pencemaran/Tumpahan)" && "💡 Berdampak pada alam. Contoh: Tumpahan bahan kimia (B3) ke saluran air, asap tebal."}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Detail Temuan / Issue *</label>
                  <textarea required placeholder="Jelaskan secara spesifik bahaya yang ditemukan..." value={formSbo.detail_temuan} onChange={(e) => setFormSbo({...formSbo, detail_temuan: e.target.value})} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "13px", background: "#f8fafc", minHeight: "60px", resize: "none", outline: "none" }} />
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Apa Penyebab Temuan Tersebut? *</label>
                  <input type="text" required placeholder="Cth: Genangan air hujan, kelalaian pekerja..." value={formSbo.penyebab} onChange={(e) => setFormSbo({...formSbo, penyebab: e.target.value})} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "13px", background: "#f8fafc", outline: "none" }} />
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Save Action atau Detail Coaching yang Telah Dilakukan? *</label>
                  <input type="text" required placeholder="Tindakan langsung (Cth: Memasang rambu lantai licin)" value={formSbo.action_taken} onChange={(e) => setFormSbo({...formSbo, action_taken: e.target.value})} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "13px", background: "#f8fafc", outline: "none" }} />
                </div>

                <div style={{ background: "#edf2f7", padding: "12px", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#2d3748" }}>Status Temuan Saat Ini:</label>
                  <select required value={formSbo.status_temuan} onChange={(e) => setFormSbo({...formSbo, status_temuan: e.target.value})} style={{ padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "12px", fontWeight: "bold", color: formSbo.status_temuan === "Open" ? "#e53e3e" : "#38a169", outline: "none" }}>
                    <option value="Open">🔴 OPEN (Masih Bahaya)</option>
                    <option value="Close">🟢 CLOSE (Sudah Aman)</option>
                  </select>
                </div>

                {formSbo.kategori_temuan.includes("Unsafe Act") && (
                  <div style={{ background: "#fff5f5", border: "1px solid #fed7d7", padding: "15px", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "10px", animation: "fadeIn 0.3s" }}>
                    <div style={{ fontSize: "11px", fontWeight: "bold", color: "#c53030" }}>[ WAJIB UNTUK UNSAFE ACT / PERILAKU ]</div>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Apa Komitmen Pelaku Kedepan?</label>
                      <input type="text" required placeholder="Komitmen dari pelanggar..." value={formSbo.komitmen_pelaku} onChange={(e) => setFormSbo({...formSbo, komitmen_pelaku: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "12px", outline: "none" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Apa Konsekuensi Jika Mengulangi?</label>
                      <input type="text" required placeholder="Cth: Diberi teguran / SP1..." value={formSbo.konsekuensi} onChange={(e) => setFormSbo({...formSbo, konsekuensi: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "12px", outline: "none" }} />
                    </div>
                  </div>
                )}
                
                <div style={{ background: fotoSbo ? "#f0fff4" : "#f7fafc", border: fotoSbo ? "1px solid #9ae6b4" : "1px dashed #cbd5e0", padding: "15px", borderRadius: "12px", textAlign: "center", transition: "0.2s", marginTop: "5px" }}>
                  <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontSize: "30px" }}>📸</span>
                    <span style={{ fontSize: "13px", fontWeight: "bold", color: fotoSbo ? "#22543d" : "#4a5568" }}>{fotoSbo ? "Foto Temuan Terlampir ✓" : "Upload Bukti Foto Temuan (Wajib) *"}</span>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, setFotoSbo)} style={{ display: "none" }} required={!fotoSbo} />
                  </label>
                  {fotoSbo && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotoSbo} alt="Bukti Bahaya" style={{ width: "100%", maxHeight: "150px", objectFit: "contain", marginTop: "15px", borderRadius: "8px", border: "1px solid #c6f6d5" }} />
                    </>
                  )}
                </div>
                
                <button type="submit" disabled={isSboLoading} style={{ width: "100%", padding: "18px", background: isSboLoading ? "#a0aec0" : "#2f855a", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isSboLoading ? "not-allowed" : "pointer", marginTop: "10px", boxShadow: "0 4px 10px rgba(47, 133, 90, 0.3)" }}>
                  {isSboLoading ? "Memproses Laporan..." : "Kirim Form SBO"}
                </button>
              </form>
            )}

            {(activeModal === "tamu" || activeModal === "paket") && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ marginBottom: "20px", paddingRight: "30px" }}>
                  <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "18px" }}>{activeModal === "tamu" ? "🧑‍💼 Lacak Kehadiran" : "📦 Lacak Paket"}</h2>
                  <p style={{ margin: 0, color: "#718096", fontSize: "12px" }}>Tekan tombol cari untuk memuat daftar terbaru.</p>
                </div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                  <input type="text" placeholder={activeModal === "tamu" ? "Ketik nama..." : "Nama penerima..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, padding: "12px 15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", outline: "none" }} />
                  <button onClick={activeModal === "tamu" ? handleCariTamu : handleCariPaket} disabled={isSearching} style={{ background: activeModal === "tamu" ? "#e53e3e" : "#dd6b20", color: "white", padding: "0 20px", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>{isSearching ? "..." : "Cari"}</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {activeModal === "tamu" && hasilTamu.map(t => (
                    <div key={t.id} style={{ padding: "15px", border: "1px solid #e2e8f0", borderRadius: "16px", background: "#f8fafc", borderLeft: "4px solid #e53e3e" }}>
                      <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "14px" }}>{t.nama}</div><div style={{ fontSize: "12px", color: "#718096", marginBottom: "10px" }}>{t.instansi_dept}</div>
                      <div style={{ display: "flex", gap: "15px", fontSize: "12px" }}><div><span style={{ color: "#38a169", fontWeight: "bold" }}>In:</span> {formatJam(t.waktu_masuk)}</div><div><span style={{ color: "#e53e3e", fontWeight: "bold" }}>Out:</span> {formatJam(t.waktu_keluar)}</div></div>
                    </div>
                  ))}
                  {activeModal === "paket" && hasilPaket.map(p => (
                    <div key={p.id} style={{ padding: "15px", border: "1px solid #e2e8f0", borderRadius: "16px", background: "#f8fafc", borderLeft: "4px solid #dd6b20" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}><div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "14px" }}>{p.penerima}</div><span style={{ fontSize: "10px", background: p.status === "Sudah Diambil" ? "#c6f6d5" : "#feebc8", color: p.status === "Sudah Diambil" ? "#22543d" : "#9c4221", padding: "3px 8px", borderRadius: "8px", fontWeight: "bold" }}>{p.status}</span></div>
                      <div style={{ fontSize: "12px", color: "#718096" }}>Kurir: {p.kurir}</div><div style={{ fontSize: "11px", color: "#a0aec0" }}>{formatJam(p.waktu_diterima)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeModal === "helpdesk" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "20px", background: "#edf2f7", padding: "6px", borderRadius: "12px", marginTop: "10px" }}>
                  <button onClick={() => setHelpdeskTab("LAPOR")} style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "none", fontWeight: "bold", background: helpdeskTab === "LAPOR" ? "white" : "transparent", color: helpdeskTab === "LAPOR" ? "#3182ce" : "#718096", boxShadow: helpdeskTab === "LAPOR" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", cursor: "pointer", transition: "all 0.2s" }}>📝 Buat Laporan</button>
                  <button onClick={() => setHelpdeskTab("LACAK")} style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "none", fontWeight: "bold", background: helpdeskTab === "LACAK" ? "white" : "transparent", color: helpdeskTab === "LACAK" ? "#3182ce" : "#718096", boxShadow: helpdeskTab === "LACAK" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", cursor: "pointer", transition: "all 0.2s" }}>🔍 Lacak Laporan</button>
                </div>

                {helpdeskTab === "LAPOR" ? (
                  <form onSubmit={handleSubmitHelpdesk} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                    <div style={{ marginBottom: "5px" }}>
                      <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "18px" }}>🛠️ Lapor Kerusakan</h2>
                      <p style={{ margin: 0, color: "#718096", fontSize: "12px" }}>Laporan dikirim ke Building Management.</p>
                    </div>
                    <div>
                      <input list="emp-list" type="text" required placeholder="Cari nama Anda..." value={formHelpdesk.nama} onChange={handleNameChange} style={{ width: "100%", padding: "12px 15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none" }} />
                      <datalist id="emp-list">{employees.map(emp => <option key={emp.id} value={emp.nama} />)}</datalist>
                    </div>
                    <div>
                      <input type="text" required readOnly placeholder="Departemen (Terisi otomatis)" value={formHelpdesk.dept} style={{ width: "100%", padding: "12px 15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#e2e8f0", color: "#4a5568", cursor: "not-allowed", outline: "none" }} />
                    </div>
                    <div>
                      <input type="text" required placeholder="Lokasi (misal: Toilet Lt 2 / Ruang Meeting)" value={formHelpdesk.lokasi} onChange={(e) => setFormHelpdesk({...formHelpdesk, lokasi: e.target.value})} style={{ width: "100%", padding: "12px 15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none" }} />
                    </div>
                    <div>
                      <textarea required placeholder="Deskripsikan masalah (misal: AC bocor netes parah...)" value={formHelpdesk.deskripsi} onChange={(e) => setFormHelpdesk({...formHelpdesk, deskripsi: e.target.value})} style={{ width: "100%", padding: "12px 15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", minHeight: "70px", resize: "none", outline: "none" }} />
                    </div>
                    
                    <div style={{ background: fotoAwal ? "#ebf8ff" : "#f7fafc", border: fotoAwal ? "1px solid #90cdf4" : "1px dashed #cbd5e0", padding: "15px", borderRadius: "12px", textAlign: "center" }}>
                      <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                        <span style={{ fontSize: "24px" }}>📸</span>
                        <span style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568" }}>{fotoAwal ? "Foto berhasil dipilih!" : "Klik untuk Ambil Foto Kerusakan *"}</span>
                        <input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, setFotoAwal)} style={{ display: "none" }} required={!fotoAwal} />
                      </label>
                      {fotoAwal && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fotoAwal} alt="Preview" style={{ width: "100%", maxHeight: "150px", objectFit: "contain", marginTop: "10px", borderRadius: "8px" }} />
                        </>
                      )}
                    </div>
                    <button type="submit" disabled={isHelpdeskLoading} style={{ width: "100%", padding: "15px", background: isHelpdeskLoading ? "#a0aec0" : "#3182ce", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "14px", cursor: isHelpdeskLoading ? "not-allowed" : "pointer", marginTop: "5px" }}>
                      {isHelpdeskLoading ? "Mengunggah Laporan..." : "Kirim Laporan"}
                    </button>
                  </form>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ marginBottom: "15px" }}>
                      <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "18px" }}>🔍 Lacak Laporan Anda</h2>
                      <p style={{ margin: 0, color: "#718096", fontSize: "12px" }}>Ketik nama Anda untuk melihat status perbaikan.</p>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                      <input list="emp-list-search" type="text" placeholder="Ketik nama Anda..." value={searchHelpdeskName} onChange={(e) => setSearchHelpdeskName(e.target.value)} style={{ flex: 1, padding: "12px 15px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", outline: "none" }} />
                      <datalist id="emp-list-search">{employees.map(emp => <option key={emp.id} value={emp.nama} />)}</datalist>
                      <button onClick={handleCariHelpdesk} disabled={isSearchingHelpdesk} style={{ background: "#3182ce", color: "white", padding: "0 20px", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>
                        {isSearchingHelpdesk ? "..." : "Cari"}
                      </button>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "15px", paddingRight: "5px" }}>
                      {hasilHelpdesk.length > 0 ? hasilHelpdesk.map((tiket) => (
                        <div key={tiket.id} style={{ border: "1px solid #e2e8f0", borderRadius: "16px", overflow: "hidden", background: "white" }}>
                          <div style={{ background: "#f8fafc", padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "13px" }}>📍 {tiket.lokasi}</span>
                            <span style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", background: tiket.status === "Menunggu" ? "#feebc8" : (tiket.status === "Sedang Dikerjakan" ? "#ebf8ff" : "#c6f6d5"), color: tiket.status === "Menunggu" ? "#9c4221" : (tiket.status === "Sedang Dikerjakan" ? "#2b6cb0" : "#22543d") }}>
                              {tiket.status === "Menunggu" ? "⏳ Menunggu" : tiket.status === "Sedang Dikerjakan" ? "🧑‍🔧 Dikerjakan" : "✅ Selesai"}
                            </span>
                          </div>
                          <div style={{ padding: "15px" }}>
                            <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#4a5568", fontStyle: "italic" }}>&quot;{tiket.deskripsi}&quot;</p>
                            {(tiket.foto_awal || tiket.foto_proses) && (
                              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                                {tiket.foto_awal && (
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: "10px", color: "#718096", marginBottom: "3px", fontWeight: "bold" }}>KONDISI AWAL</div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={tiket.foto_awal} alt="Awal" style={{ width: "100%", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e2e8f0" }} />
                                  </div>
                                )}
                                {tiket.foto_proses && (
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: "10px", color: "#38a169", marginBottom: "3px", fontWeight: "bold" }}>HASIL PERBAIKAN</div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={tiket.foto_proses} alt="Proses" style={{ width: "100%", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid #c6f6d5" }} />
                                  </div>
                                )}
                              </div>
                            )}
                            <div style={{ fontSize: "10px", color: "#a0aec0", marginTop: "12px", textAlign: "right" }}>Dilaporkan: {formatJam(tiket.waktu_lapor)}</div>
                          </div>
                        </div>
                      )) : (
                        <div style={{ textAlign: "center", padding: "40px 20px", color: "#a0aec0", fontSize: "13px" }}>Hasil lacak tiket akan muncul di sini.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}