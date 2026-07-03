"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs, Timestamp, where, addDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase"; 
import { kirimWA, template } from "../lib/notify";

// ==========================================
// INTERFACES
// ==========================================
interface KendaraanLog { kendaraan: string; status_kendaraan: string; driver_bertugas: string; tujuan_keperluan: string; waktu_catat?: Timestamp | null; }
interface DriverStatusLog { nama_driver: string; status: string; waktu_ubah?: Timestamp | null; }
interface DataTamu { id: string; nama: string; instansi_dept: string; tujuan: string; waktu_masuk?: Timestamp | null; waktu_keluar?: Timestamp | null; }
interface DataPaket { id: string; penerima: string; kurir: string; waktu_diterima?: Timestamp | null; status: string; }
interface ObStatusData { nama: string; status: string; lokasi: string[]; }
interface Employee { id: string; nama: string; departemen: string; }
interface KontakAdmin { nama: string; whatsapp?: string; email?: string; }
interface SecurityShift { current: string[]; next: string[]; currentName: string; nextName: string; }
interface HelpdeskTicket { id: string; nama_pelapor: string; lokasi: string; deskripsi: string; status: string; foto_awal?: string; foto_proses?: string; waktu_lapor?: Timestamp | null; }
interface MasterAtk { id: string; nama_barang: string; }
interface AtkItemRequest { nama_barang: string; jumlah: string; deskripsi: string; }
interface AtkRequest { id: string; resi: string; nama_pemohon: string; departemen: string; items: AtkItemRequest[]; status: string; waktu_request?: Timestamp | null; }
interface OvertimeLog { id: string; nama_pemohon: string; departemen: string; area_ruangan: string; jam_mulai: string; jam_selesai: string; status: string; }

// FUNGSI GENERATE RESI
const generateResiCode = () => {
  const dateCode = new Date().toISOString().slice(2, 7).replace("-", ""); 
  const randomCode = Math.floor(1000 + Math.random() * 9000); 
  return `ATK-${dateCode}-${randomCode}`;
};

export default function PortalSIBM() {
  const router = useRouter();
  const todayISO = new Date().toISOString().split("T")[0];

  // STATE EXISTING
  const [obBertugas, setObBertugas] = useState<ObStatusData[]>([]);
  const [mobilStatus, setMobilStatus] = useState<KendaraanLog[]>([]);
  const [securityShift, setSecurityShift] = useState<SecurityShift>({ current: [], next: [], currentName: "Memuat...", nextName: "Memuat..." });
  const [driverStatusMap, setDriverStatusMap] = useState<Record<string, string>>({ "Amal Setiawan": "Memuat...", "Muhammad Renaldy": "Memuat..." });
  const [overtimeHariIni, setOvertimeHariIni] = useState<OvertimeLog[]>([]);
  
  // STATE INFO PEMELIHARAAN GEDUNG
  const [maintenanceInfo, setMaintenanceInfo] = useState<string>("Memuat status operasional gedung...");
  const [pengumumanGedung, setPengumumanGedung] = useState<string>("");

  // STATE MODAL & SEARCH
  const [activeModal, setActiveModal] = useState<"none" | "login" | "tamu" | "paket" | "helpdesk" | "sbo" | "atk" | "overtime">("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasilTamu, setHasilTamu] = useState<DataTamu[]>([]);
  const [hasilPaket, setHasilPaket] = useState<DataPaket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [daftarAdminGA, setDaftarAdminGA] = useState<KontakAdmin[]>([]);
  const [daftarQHSE, setDaftarQHSE] = useState<KontakAdmin[]>([]);

  // HELPDESK
  const [helpdeskTab, setHelpdeskTab] = useState<"LAPOR" | "LACAK">("LAPOR");
  const [formHelpdesk, setFormHelpdesk] = useState({ nama: "", dept: "", lokasi: "", deskripsi: "" });
  const [fotoAwal, setFotoAwal] = useState<string>("");
  const [isHelpdeskLoading, setIsHelpdeskLoading] = useState(false);
  const [searchHelpdeskName, setSearchHelpdeskName] = useState("");
  const [hasilHelpdesk, setHasilHelpdesk] = useState<HelpdeskTicket[]>([]);
  const [isSearchingHelpdesk, setIsSearchingHelpdesk] = useState(false);

  // SBO
  const [formSbo, setFormSbo] = useState({ 
    nama_pelapor: "", tanggal_kejadian: todayISO, unit_bisnis: "", lokasi: "", detail_temuan: "", 
    kategori_temuan: "Kondisi Tidak Aman (Unsafe Condition)", penyebab: "", action_taken: "", 
    status_temuan: "Open", komitmen_pelaku: "", konsekuensi: "" 
  });
  const [fotoSbo, setFotoSbo] = useState<string>("");
  const [isSboLoading, setIsSboLoading] = useState(false);

  // ATK
  const [masterAtkList, setMasterAtkList] = useState<MasterAtk[]>([]);
  const [atkTab, setAtkTab] = useState<"REQUEST" | "LACAK">("REQUEST");
  const [formAtkPemohon, setFormAtkPemohon] = useState({ nama: "", dept: "" });
  const [formAtkItems, setFormAtkItems] = useState<AtkItemRequest[]>([{ nama_barang: "", jumlah: "", deskripsi: "" }]);
  const [isAtkLoading, setIsAtkLoading] = useState(false);
  const [searchAtkResi, setSearchAtkResi] = useState("");
  const [hasilAtk, setHasilAtk] = useState<AtkRequest | null>(null);

  // OVERTIME
  const [formOvertime, setFormOvertime] = useState({ nama: "", dept: "", area: "", tanggal: todayISO, jam_mulai: "", jam_selesai: "", alasan: "" });
  const [isOvertimeLoading, setIsOvertimeLoading] = useState(false);

  const formatTgl = new Date().toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    // 1. Tarik Data OB
    const unsubPlot = onSnapshot(doc(db, "daily_plots", todayISO), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const plots = (data.plot_lantai || {}) as Record<string, string>;
        const statuses = (data.status_staf || {}) as Record<string, string>;
        const mappedData = Object.keys(statuses).map(nama => ({ nama, status: statuses[nama] || "Hadir / On Duty", lokasi: Object.keys(plots).filter(l => plots[l] === nama || plots[l] === "Semua / All") }));
        setObBertugas(mappedData);
      } else { setObBertugas([]); }
    });

    // 2. Tarik Data Kendaraan
    const unsubVeh = onSnapshot(query(collection(db, "operational_vehicle_logs"), orderBy("waktu_catat", "desc"), limit(30)), (snapshot) => {
      const logs = snapshot.docs.map(d => d.data() as KendaraanLog);
      const statusTerkini: Record<string, KendaraanLog> = {};
      logs.forEach(log => { if (!statusTerkini[log.kendaraan]) statusTerkini[log.kendaraan] = log; });
      setMobilStatus(Object.values(statusTerkini));
    });

    // 3. Tarik Status Driver
    const unsubDriver = onSnapshot(query(collection(db, "driver_status_logs"), orderBy("waktu_ubah", "desc")), (snapshot) => {
      const latestMap: Record<string, string> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as DriverStatusLog;
        if (data.nama_driver && !latestMap[data.nama_driver]) latestMap[data.nama_driver] = data.status;
      });
      if (!latestMap["Amal Setiawan"]) latestMap["Amal Setiawan"] = "Standby";
      if (!latestMap["Muhammad Renaldy"]) latestMap["Muhammad Renaldy"] = "Standby";
      setDriverStatusMap(latestMap);
    });

    // 4. Tarik Overtime Hari Ini
    const unsubOvertime = onSnapshot(query(collection(db, "ga_overtime_requests"), where("tanggal", "==", todayISO)), (snapshot) => {
      const otData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OvertimeLog));
      setOvertimeHariIni(otData);
    });

    // 5. Tarik Info Pemeliharaan Gedung
    const unsubMaintenance = onSnapshot(query(collection(db, "helpdesk_tickets"), orderBy("waktu_lapor", "desc"), limit(20)), (snapshot) => {
      const tickets = snapshot.docs.map(d => d.data() as HelpdeskTicket);
      const activeMaintenance = tickets.filter(t => t.status === "Sedang Dikerjakan").slice(0, 3);
      if (activeMaintenance.length > 0) {
        const infos = activeMaintenance.map(t => `🛠️ SEDANG DIKERJAKAN: Perbaikan ${t.lokasi} (${t.deskripsi})`);
        setMaintenanceInfo(infos.join("   |   "));
      } else {
        setMaintenanceInfo("");
      }
    });

    getDocs(collection(db, "employees_directory")).then(snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee))));

    // Tarik kontak Admin GA & QHSE dari users_master (untuk notifikasi Tahap 3: request baru masuk & SBO baru)
    getDocs(query(collection(db, "users_master"), where("departemen", "==", "Admin GA")))
      .then(snap => setDaftarAdminGA(snap.docs.map(d => d.data() as KontakAdmin)))
      .catch(err => console.error("[notify] Gagal memuat kontak Admin GA:", err));

    getDocs(query(collection(db, "users_master"), where("departemen", "==", "QHSE")))
      .then(snap => setDaftarQHSE(snap.docs.map(d => d.data() as KontakAdmin)))
      .catch(err => console.error("[notify] Gagal memuat kontak QHSE:", err));
    getDocs(collection(db, "master_atk")).then(snap => setMasterAtkList(snap.docs.map(d => ({ id: d.id, ...d.data() } as MasterAtk))));

    // 6. Tarik Security Shift
    const fetchSecurity = async () => {
      try {
        const currentMonthId = todayISO.substring(0, 7);
        const mSnap = await getDoc(doc(db, "security_monthly_schedules", currentMonthId));
        if (mSnap.exists()) {
          const dataHari = ((mSnap.data().data_hari || {}) as Record<string, Record<string, string>>)[todayISO] || {};
          const jamSekarang = new Date().getHours();
          const shift1 = Object.keys(dataHari).filter(k => dataHari[k]?.includes("Shift 1"));
          const shift2 = Object.keys(dataHari).filter(k => dataHari[k]?.includes("Shift 2"));
          if (jamSekarang >= 8 && jamSekarang < 20) {
            setSecurityShift({ current: shift1, next: shift2, currentName: "Shift 1 (08:00 - 20:00)", nextName: "Shift 2 (20:00 - 08:00)" });
          } else {
            setSecurityShift({ current: shift2, next: shift1, currentName: "Shift 2 (20:00 - 08:00)", nextName: "Shift 1 (Besok 08:00)" });
          }
        }
      } catch (e) { console.error(e); }
    };
    fetchSecurity();

    // 7. Tarik Info Pengumuman Gedung (Broadcast dari Admin)
    const unsubBroadcast = onSnapshot(doc(db, "settings", "pengumuman"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().is_active) {
        setPengumumanGedung(docSnap.data().teks);
      } else {
        setPengumumanGedung(""); 
      }
    });

    return () => { unsubPlot(); unsubVeh(); unsubDriver(); unsubOvertime(); unsubMaintenance(); unsubBroadcast(); };
  }, [todayISO]);

  const getTime = (ts?: Timestamp | null) => ts ? ts.toMillis() : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNameChangeGeneric = (val: string, setForm: React.Dispatch<React.SetStateAction<any>>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setForm((prev: any) => ({ ...prev, nama: val }));
    const found = employees.find(emp => emp.nama === val);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (found) setForm((prev: any) => ({ ...prev, dept: found.departemen }));
  };

  const handleNameChangeAtk = (val: string) => {
    const found = employees.find(emp => emp.nama === val);
    setFormAtkPemohon({ nama: val, dept: found ? found.departemen : formAtkPemohon.dept });
  };
  const handleNameChangeHelpdesk = (val: string) => {
    const found = employees.find(emp => emp.nama === val);
    setFormHelpdesk(p => ({ ...p, nama: val, dept: found ? found.departemen : p.dept }));
  };
  const handleNameChangeOvertime = (val: string) => {
    const found = employees.find(emp => emp.nama === val);
    setFormOvertime(p => ({ ...p, nama: val, dept: found ? found.departemen : p.dept }));
  };
  const handleNameChangeSbo = (val: string) => {
    const found = employees.find(emp => emp.nama === val);
    setFormSbo(prev => ({ 
      ...prev, 
      nama_pelapor: val, 
      unit_bisnis: found ? found.departemen : prev.unit_bisnis 
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setFotoState: React.Dispatch<React.SetStateAction<string>>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 600 / img.width;
        canvas.width = 600; canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); setFotoState(canvas.toDataURL("image/jpeg", 0.6)); }
      };
      if (typeof ev.target?.result === 'string') img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleAddAtkItem = () => setFormAtkItems([...formAtkItems, { nama_barang: "", jumlah: "", deskripsi: "" }]);
  const handleRemoveAtkItem = (index: number) => { const newItems = [...formAtkItems]; newItems.splice(index, 1); setFormAtkItems(newItems); };
  const handleAtkItemChange = (index: number, field: keyof AtkItemRequest, value: string) => { const newItems = [...formAtkItems]; newItems[index][field] = value; setFormAtkItems(newItems); };

  // Broadcast notifikasi WA ke semua kontak Admin GA (dipakai saat ada request baru: ATK/Overtime/Helpdesk)
  const kirimNotifikasiAdminGA = async (jenisRequest: string, namaPemohon: string, detail: string) => {
    if (daftarAdminGA.length === 0) {
      console.warn("[notify] Tidak ada kontak Admin GA (departemen 'Admin GA') di users_master. Notifikasi dilewati.");
      return;
    }
    const pesan = template.requestBaruMasuk(jenisRequest, namaPemohon, detail);
    for (const admin of daftarAdminGA) {
      if (!admin.whatsapp) continue;
      const hasil = await kirimWA(admin.whatsapp, pesan);
      if (!hasil.sukses) console.error(`[notify] Gagal kirim WA ke Admin GA (${admin.nama}):`, hasil.pesanError);
    }
  };

  // Broadcast notifikasi WA ke semua kontak QHSE (dipakai saat ada laporan SBO baru)
  const kirimNotifikasiQHSE = async (namaPelapor: string, kategori: string, lokasi: string) => {
    if (daftarQHSE.length === 0) {
      console.warn("[notify] Tidak ada kontak QHSE (departemen 'QHSE') di users_master. Notifikasi dilewati.");
      return;
    }
    const pesan = template.sboBaruMasuk(namaPelapor, kategori, lokasi);
    for (const qhse of daftarQHSE) {
      if (!qhse.whatsapp) continue;
      const hasil = await kirimWA(qhse.whatsapp, pesan);
      if (!hasil.sukses) console.error(`[notify] Gagal kirim WA ke QHSE (${qhse.nama}):`, hasil.pesanError);
    }
  };

  const handleSubmitAtk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formAtkItems.some(i => !i.nama_barang || !i.jumlah)) return alert("Pastikan nama barang dan jumlah telah diisi!");
    setIsAtkLoading(true);
    const newResi = generateResiCode();
    try {
      await addDoc(collection(db, "ga_atk_requests"), { resi: newResi, nama_pemohon: formAtkPemohon.nama, departemen: formAtkPemohon.dept, items: formAtkItems, status: "Menunggu Disiapkan", waktu_request: serverTimestamp() });
      
      // Notifikasi ke Admin GA (best-effort, tidak memblokir alur pemohon)
      kirimNotifikasiAdminGA("Request ATK", formAtkPemohon.nama, `Resi: ${newResi}, ${formAtkItems.length} item barang.`);

      alert(`✅ Request ATK berhasil!\n\nKODE RESI: ${newResi}\nSimpan kode ini untuk melacak barang Anda.`);
      setFormAtkPemohon({ nama: "", dept: "" }); setFormAtkItems([{ nama_barang: "", jumlah: "", deskripsi: "" }]); setSearchAtkResi(newResi); setAtkTab("LACAK"); handleCariAtk(newResi);
    } catch (error) { console.error(error); alert("Gagal mengirim request ATK."); } finally { setIsAtkLoading(false); }
  };

  const handleCariAtk = async (resiToSearch?: string) => {
    const resi = resiToSearch || searchAtkResi;
    if (!resi.trim()) return alert("Masukkan Kode Resi ATK Anda!");
    setIsAtkLoading(true);
    try {
      const q = query(collection(db, "ga_atk_requests"), where("resi", "==", resi.trim().toUpperCase()));
      const snap = await getDocs(q);
      if (snap.empty) { setHasilAtk(null); alert(`Resi ${resi} tidak ditemukan.`); } 
      else { setHasilAtk({ id: snap.docs[0].id, ...snap.docs[0].data() } as AtkRequest); }
    } finally { setIsAtkLoading(false); }
  };

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsOvertimeLoading(true);
    try {
      await addDoc(collection(db, "ga_overtime_requests"), { 
        nama_pemohon: formOvertime.nama, 
        departemen: formOvertime.dept, 
        area_ruangan: formOvertime.area, 
        tanggal: formOvertime.tanggal, 
        jam_mulai: formOvertime.jam_mulai, 
        jam_selesai: formOvertime.jam_selesai, 
        alasan: formOvertime.alasan, 
        status: "Menunggu Approval GA", 
        waktu_request: serverTimestamp() 
      });
      
      // Notifikasi ke Admin GA (best-effort, tidak memblokir alur pemohon)
      kirimNotifikasiAdminGA("Overtime Gedung", formOvertime.nama, `Tanggal: ${formOvertime.tanggal}, Area: ${formOvertime.area}, Jam: ${formOvertime.jam_mulai}-${formOvertime.jam_selesai}.`);

      alert("✅ Permohonan Overtime Gedung berhasil dikirim. Menunggu persetujuan Admin GA.");
      setFormOvertime({ nama: "", dept: "", area: "", tanggal: todayISO, jam_mulai: "", jam_selesai: "", alasan: "" }); setActiveModal("none");
    } catch (error) { console.error(error); alert("Gagal mengirim permohonan Overtime."); } finally { setIsOvertimeLoading(false); }
  };

  const handleCariTamu = async () => {
    setIsSearching(true);
    try {
      const snap = await getDocs(collection(db, "security_visitor_logs"));
      const rawData = snap.docs.map(d => ({ id: d.id, ...d.data() } as DataTamu));
      const filtered = searchQuery.trim() ? rawData.filter(t => String(t.nama).toLowerCase().includes(searchQuery.toLowerCase().trim())) : rawData;
      filtered.sort((a, b) => getTime(b.waktu_masuk) - getTime(a.waktu_masuk));
      setHasilTamu(filtered.slice(0, 50));
    } finally { setIsSearching(false); }
  };

  const handleCariPaket = async () => {
    setIsSearching(true);
    try {
      const snap = await getDocs(collection(db, "packages"));
      const rawData = snap.docs.map(d => ({ id: d.id, ...d.data() } as DataPaket));
      const filtered = searchQuery.trim() ? rawData.filter(p => String(p.penerima).toLowerCase().includes(searchQuery.toLowerCase().trim())) : rawData;
      filtered.sort((a, b) => getTime(b.waktu_diterima) - getTime(a.waktu_diterima));
      setHasilPaket(filtered.slice(0, 50));
    } finally { setIsSearching(false); }
  };

  const handleCariHelpdesk = async () => {
    if (!searchHelpdeskName.trim()) return alert("Masukkan nama Anda terlebih dahulu.");
    setIsSearchingHelpdesk(true);
    try {
      const snap = await getDocs(collection(db, "helpdesk_tickets"));
      const rawData = snap.docs.map(d => ({ id: d.id, ...d.data() } as HelpdeskTicket));
      const filtered = rawData.filter(t => String(t.nama_pelapor).toLowerCase().includes(searchHelpdeskName.toLowerCase().trim()));
      filtered.sort((a, b) => getTime(b.waktu_lapor) - getTime(a.waktu_lapor));
      setHasilHelpdesk(filtered.slice(0, 15));
      if (filtered.length === 0) alert(`Belum ada laporan dari: "${searchHelpdeskName}"`);
    } finally { setIsSearchingHelpdesk(false); }
  };

  const handleSubmitSbo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fotoSbo) return alert("Wajib melampirkan foto!");
    setIsSboLoading(true);
    try {
      await addDoc(collection(db, "qhse_sbo_reports"), { 
        ...formSbo, 
        nama_pelapor: formSbo.nama_pelapor || "Anonim / Visitor", 
        foto_bukti: fotoSbo, 
        waktu_lapor: serverTimestamp(), 
        tanggal_closed: formSbo.status_temuan === "Close" ? todayISO : null 
      });
      
      // Notifikasi ke QHSE (best-effort, tidak memblokir alur pelapor)
      kirimNotifikasiQHSE(formSbo.nama_pelapor || "Anonim / Visitor", formSbo.kategori_temuan, formSbo.lokasi);

      alert("✅ Laporan SBO berhasil disubmit!");
      setFormSbo({ nama_pelapor: "", tanggal_kejadian: todayISO, unit_bisnis: "", lokasi: "", detail_temuan: "", kategori_temuan: "Kondisi Tidak Aman (Unsafe Condition)", penyebab: "", action_taken: "", status_temuan: "Open", komitmen_pelaku: "", konsekuensi: "" }); 
      setFotoSbo(""); 
      setActiveModal("none"); 
    } catch (error) { console.error(error); alert("Terjadi kesalahan."); } finally { setIsSboLoading(false); }
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
      
      // Notifikasi ke Admin GA (best-effort, tidak memblokir alur pemohon)
      kirimNotifikasiAdminGA("Tiket Helpdesk", formHelpdesk.nama, `Lokasi: ${formHelpdesk.lokasi}, Masalah: ${formHelpdesk.deskripsi}`);

      alert("✅ Tiket kerusakan terkirim!");
      setFormHelpdesk({ nama: "", dept: "", lokasi: "", deskripsi: "" }); setFotoAwal(""); setHelpdeskTab("LACAK"); 
    } catch (error) { console.error(error); } finally { setIsHelpdeskLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoginLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "users_master"), where("email", "==", email.toLowerCase())));
      if (snap.empty) { alert("❌ Email tidak terdaftar."); setIsLoginLoading(false); return; }
      
      const uData = snap.docs[0].data();
      
      // Cek Password Asli dari Database
      if (password !== uData.password) {
        alert("❌ Password yang Anda masukkan salah!");
        setIsLoginLoading(false);
        return;
      }

      localStorage.setItem("pic_nama", uData.nama); 
      localStorage.setItem("pic_dept", uData.departemen); 
      localStorage.setItem("pic_role", uData.role);
      
      if (uData.departemen === "Admin GA") router.push("/admin");
      else if (uData.departemen === "Management") router.push("/management");
      else if (uData.departemen === "OB & CS") router.push("/dashboard/ob");
      else if (uData.departemen === "Security") router.push("/dashboard/security");
      else if (uData.departemen === "Driver") router.push("/dashboard/driver");
      else if (uData.departemen === "QHSE") router.push("/dashboard/qhse");
      else alert(`Akses belum tersedia untuk ${uData.departemen}`);
    } catch (error) { 
      console.error(error); 
    } finally { 
      setIsLoginLoading(false); 
    }
  };

  const formatJam = (ts: Timestamp | null | undefined) => ts ? new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
  const sharedInputStyle = { width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const, boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s" };

  const getSecurityTicker = () => {
    const p = securityShift.current.length > 0 ? securityShift.current.join(", ") : "Belum diplot";
    const n = securityShift.next.length > 0 ? securityShift.next.join(", ") : "Belum diplot";
    return `[${securityShift.currentName}]: ${p} | Next Shift: ${n}`;
  };
  const getObTicker = () => {
    const hadir = obBertugas.filter(o => o.status.includes("Hadir"));
    if (hadir.length === 0) return "Belum ada OB Check-in";
    return hadir.map(o => `${o.nama} (${o.lokasi.length > 0 ? o.lokasi.join(", ") : "Standby"})`).join("  •  ");
  };
  const getDriverTicker = () => {
    const drivers = Object.entries(driverStatusMap);
    if (drivers.length === 0) return "Memuat data driver...";
    return drivers.map(([nama, stat]) => `${nama} (${stat.includes("Standby") ? "STANDBY" : "KELUAR"})`).join("  |  ");
  };

  return (
    <div className="main-container" style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      
      {/* 💡 CSS RESPONSIVE & MOBILE BOTTOM NAV */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ticker-scroll {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        .ticker-wrap {
          width: 100%; overflow: hidden; background-color: #1a202c; color: white; padding: 10px 0; border-bottom: 2px solid #e53e3e;
          display: flex; align-items: center; position: relative; z-index: 20; box-sizing: border-box;
        }
        .ticker-label {
          background: #e53e3e; color: white; padding: 10px 20px; font-weight: 900; font-size: 12px; position: absolute;
          left: 0; top: 0; bottom: 0; z-index: 21; display: flex; align-items: center; letter-spacing: 1px; box-shadow: 2px 0 5px rgba(0,0,0,0.5);
        }
        .ticker-content {
          display: inline-block; white-space: nowrap;
          animation: ticker-scroll 35s linear infinite; font-size: 13px; font-weight: 500;
        }
        .ticker-content:hover { animation-play-state: paused; cursor: default; }
        .ticker-item { display: inline-flex; align-items: center; gap: 8px; margin-right: 50px; }
        .t-badge { background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
        
        /* 📱 MEDIA QUERY UNTUK HP */
        .mobile-nav { display: none; }
        @media (max-width: 768px) {
          .desktop-grid { display: none !important; }
          .main-container { padding-bottom: 100px !important; }
          .mobile-nav {
            display: flex;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(15px);
            border-top: 1px solid #e2e8f0;
            z-index: 90;
            padding: 12px 15px;
            gap: 15px;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            box-shadow: 0 -10px 25px -5px rgba(0,0,0,0.1);
          }
          .mobile-nav::-webkit-scrollbar { display: none; }
          .m-nav-item {
            flex: 0 0 calc(100% / 4.8);
            scroll-snap-align: start;
            display: flex; flex-direction: column; align-items: center; gap: 6px;
            color: #4a5568; font-size: 10px; font-weight: 800; text-align: center; cursor: pointer;
          }
          .m-nav-icon {
            width: 48px; height: 48px; border-radius: 16px;
            display: flex; justify-content: center; align-items: center; font-size: 22px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05); transition: 0.2s;
          }
          .m-nav-item:active .m-nav-icon { transform: scale(0.9); }
        }
      `}} />

      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 20px", background: "white", borderBottom: "1px solid #e2e8f0" }}>
        <button onClick={() => setActiveModal("login")} style={{ background: "transparent", color: "#a0aec0", border: "none", fontSize: "12px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>🔒 Staf Internal</button>
      </div>

      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "30px 20px 40px 20px", color: "white", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "15px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-samudera.png" alt="Samudera Logo" style={{ height: "60px", objectFit: "contain", filter: "drop-shadow(0px 4px 6px rgba(0,0,0,0.3))" }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 36px)", fontWeight: "900", letterSpacing: "1px" }}>PORTAL SIBM</h1>
        <p style={{ margin: "0 0 20px 0", fontSize: "clamp(12px, 3vw, 16px)", opacity: 0.9 }}>Sistem Informasi Building Management - General Affairs</p>
        <div style={{ display: "inline-block", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(5px)", padding: "8px 20px", borderRadius: "50px", fontSize: "13px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.3)" }}>📅 {formatTgl}</div>
      </div>

      <div className="ticker-wrap">
        <div className="ticker-label">LIVE INFO</div>
        <div className="ticker-content">
          {pengumumanGedung && (
            <span className="ticker-item"><span className="t-badge" style={{color:"#fff", background:"rgba(229,62,62,0.9)"}}>📢 INFO GA</span> {pengumumanGedung}</span>
          )}
          <span className="ticker-item"><span className="t-badge" style={{color:"#fefcbf"}}>🛠️ MAINTENANCE</span> {maintenanceInfo || "✅ Normal"}</span>
          <span className="ticker-item"><span className="t-badge" style={{color:"#bee3f8"}}>🛡️ SECURITY</span> {getSecurityTicker()}</span>
          <span className="ticker-item"><span className="t-badge" style={{color:"#fed7e2"}}>🧹 OB PLOT AREA</span> {getObTicker()}</span>
          <span className="ticker-item"><span className="t-badge" style={{color:"#c6f6d5"}}>🧑‍✈️ DRIVER</span> {getDriverTicker()}</span>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "40px auto 40px", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* 💻 GRID MENU OPERASIONAL (HANYA MUNCUL DI DESKTOP/LAPTOP) */}
        <div className="desktop-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
          <div onClick={() => { setActiveModal("tamu"); setSearchQuery(""); setHasilTamu([]); }} style={{ background: "white", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "0.2s" }}>
            <div style={{ background: "#fff5f5", color: "#e53e3e", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>🧑‍💼</div>
            <div><h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "16px" }}>Lacak Tamu</h2><p style={{ margin: "0", color: "#718096", fontSize: "12px" }}>Cek pengunjung gedung.</p></div>
          </div>
          <div onClick={() => { setActiveModal("paket"); setSearchQuery(""); setHasilPaket([]); }} style={{ background: "white", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "0.2s" }}>
            <div style={{ background: "#fffaf0", color: "#dd6b20", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>📦</div>
            <div><h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "16px" }}>Cek Resi Paket</h2><p style={{ margin: "0", color: "#718096", fontSize: "12px" }}>Lacak dokumen logistik.</p></div>
          </div>
          <div onClick={() => { setActiveModal("atk"); setAtkTab("REQUEST"); }} style={{ background: "white", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "0.2s" }}>
            <div style={{ background: "#fdf4ff", color: "#d53f8c", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>🖇️</div>
            <div><h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "16px" }}>Gudang ATK</h2><p style={{ margin: "0", color: "#718096", fontSize: "12px" }}>Request barang kantor ke GA.</p></div>
          </div>
          <div onClick={() => { setActiveModal("overtime"); }} style={{ background: "white", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "0.2s" }}>
            <div style={{ background: "#fffff0", color: "#d69e2e", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>⏱️</div>
            <div><h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "16px" }}>Overtime Gedung</h2><p style={{ margin: "0", color: "#718096", fontSize: "12px" }}>Request AC / Ruang lembur.</p></div>
          </div>
          <div onClick={() => { setActiveModal("helpdesk"); setHelpdeskTab("LAPOR"); }} style={{ background: "white", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", cursor: "pointer", border: "1px solid #e2e8f0", transition: "0.2s" }}>
            <div style={{ background: "#ebf8ff", color: "#3182ce", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>🛠️</div>
            <div><h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "16px" }}>Lapor Kerusakan</h2><p style={{ margin: "0", color: "#718096", fontSize: "12px" }}>Lapor fasilitas rusak ke GA.</p></div>
          </div>
          <div onClick={() => { setActiveModal("sbo"); }} style={{ background: "#f0fff4", padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 25px -5px rgba(56, 161, 105, 0.2)", cursor: "pointer", border: "2px solid #9ae6b4", transition: "0.2s" }}>
            <div style={{ background: "#22543d", color: "#c6f6d5", width: "50px", height: "50px", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px" }}>🦺</div>
            <div><h2 style={{ margin: "0 0 5px 0", color: "#22543d", fontSize: "16px" }}>Lapor Bahaya</h2><p style={{ margin: "0", color: "#2f855a", fontSize: "12px", fontWeight: "bold" }}>Temuan kondisi darurat SBO.</p></div>
          </div>
        </div>

        {/* 2 DEDICATED CARDS UTAMA (TETAP MUNCUL DI HP) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "25px", marginTop: "35px" }}>
          
          <div style={{ background: "white", borderRadius: "20px", padding: "25px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "12px" }}>
              <div style={{ background: "#fff5f5", padding: "10px", borderRadius: "12px", fontSize: "20px" }}>🚗</div>
              <h3 style={{ margin: 0, color: "#2d3748", fontSize: "18px", fontWeight: "900" }}>Status Armada Operasional</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "350px", overflowY: "auto", paddingRight: "5px" }}>
              {mobilStatus.length > 0 ? mobilStatus.map((mobil, idx) => {
                const isStandby = mobil.status_kendaraan?.includes("Standby");
                const isBengkel = mobil.status_kendaraan?.includes("Bengkel") || mobil.status_kendaraan?.includes("Service");
                return (
                  <div key={idx} style={{ padding: "15px", borderRadius: "14px", background: isStandby ? "#f0fff4" : isBengkel ? "#f1f5f9" : "#fff5f5", border: isStandby ? "1px solid #c6f6d5" : isBengkel ? "1px solid #cbd5e0" : "1px solid #fed7d7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "900", color: "#2d3748", fontSize: "15px" }}>{mobil.kendaraan.split(" - ")[0]}</div>
                      <div style={{ fontSize: "13px", color: "#4a5568", marginTop: "6px" }}>Pengendara: <b>{mobil.driver_bertugas?.replace("Standby: ", "") || "Karyawan"}</b></div>
                      {!isStandby && !isBengkel && <div style={{ fontSize: "12px", color: "#718096", marginTop: "4px", fontStyle: "italic" }}>📍 {mobil.tujuan_keperluan}</div>}
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: "900", padding: "6px 10px", borderRadius: "8px", background: isStandby ? "#c6f6d5" : isBengkel ? "#cbd5e0" : "#fed7d7", color: isStandby ? "#22543d" : isBengkel ? "#4a5568" : "#9b2c2c" }}>{isStandby ? "STANDBY" : isBengkel ? "SERVICE" : "KELUAR"}</span>
                  </div>
                );
              }) : <div style={{ textAlign: "center", padding: "20px", color: "#a0aec0", fontSize: "14px", border: "1px dashed #cbd5e0", borderRadius: "12px" }}>Belum ada data armada operasional.</div>}
            </div>
          </div>

          <div style={{ background: "white", borderRadius: "20px", padding: "25px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "12px" }}>
              <div style={{ background: "#fffff0", padding: "10px", borderRadius: "12px", fontSize: "20px" }}>⏱️</div>
              <h3 style={{ margin: 0, color: "#2d3748", fontSize: "18px", fontWeight: "900" }}>Overtime Gedung (Hari Ini)</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "350px", overflowY: "auto", paddingRight: "5px" }}>
              {overtimeHariIni.length > 0 ? overtimeHariIni.map((ot, idx) => {
                const isApproved = ot.status === "Approved" || ot.status === "Disetujui";
                return (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "15px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #edf2f7", borderLeft: isApproved ? "4px solid #38a169" : "4px solid #d69e2e" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontWeight: "900", color: "#2d3748", fontSize: "14px", flex: 1 }}>{ot.area_ruangan}</span>
                      <span style={{ fontSize: "10px", background: isApproved ? "#c6f6d5" : "#feebc8", color: isApproved ? "#22543d" : "#9c4221", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", whiteSpace: "nowrap", marginLeft: "10px" }}>{ot.status}</span>
                    </div>
                    <div style={{ fontSize: "13px", color: "#4a5568" }}>👤 {ot.nama_pemohon} ({ot.departemen})</div>
                    <div style={{ fontSize: "13px", color: "#d69e2e", fontWeight: "bold", background: "#fffff0", padding: "6px 10px", borderRadius: "6px", display: "inline-block", width: "fit-content" }}>🕒 {ot.jam_mulai} s/d {ot.jam_selesai}</div>
                  </div>
                );
              }) : (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#a0aec0", background: "#f8fafc", borderRadius: "16px", border: "1px dashed #cbd5e0" }}>
                  <div style={{ fontSize: "35px", marginBottom: "10px" }}>🏢</div>
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "#718096" }}>Tidak Ada Lembur</div>
                  <div style={{ fontSize: "12px", marginTop: "5px" }}>Jadwal gedung beroperasi normal hari ini.</div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* 📱 BOTTOM NAVIGATION (HANYA MUNCUL DI HP) */}
      <div className="mobile-nav">
        <div className="m-nav-item" onClick={() => { setActiveModal("tamu"); setSearchQuery(""); setHasilTamu([]); }}>
          <div className="m-nav-icon" style={{ background: "#fff5f5", color: "#e53e3e" }}>🧑‍💼</div>
          <span>Lacak Tamu</span>
        </div>
        <div className="m-nav-item" onClick={() => { setActiveModal("paket"); setSearchQuery(""); setHasilPaket([]); }}>
          <div className="m-nav-icon" style={{ background: "#fffaf0", color: "#dd6b20" }}>📦</div>
          <span>Resi Paket</span>
        </div>
        <div className="m-nav-item" onClick={() => { setActiveModal("atk"); setAtkTab("REQUEST"); }}>
          <div className="m-nav-icon" style={{ background: "#fdf4ff", color: "#d53f8c" }}>🖇️</div>
          <span>Request ATK</span>
        </div>
        <div className="m-nav-item" onClick={() => setActiveModal("overtime")}>
          <div className="m-nav-icon" style={{ background: "#fffff0", color: "#d69e2e" }}>⏱️</div>
          <span>Lembur AC</span>
        </div>
        <div className="m-nav-item" onClick={() => { setActiveModal("helpdesk"); setHelpdeskTab("LAPOR"); }}>
          <div className="m-nav-icon" style={{ background: "#ebf8ff", color: "#3182ce" }}>🛠️</div>
          <span>Kerusakan</span>
        </div>
        <div className="m-nav-item" onClick={() => setActiveModal("sbo")}>
          <div className="m-nav-icon" style={{ background: "#f0fff4", color: "#2f855a", border: "1px solid #9ae6b4" }}>🦺</div>
          <span>Bahaya SBO</span>
        </div>
      </div>

      {/* MODAL WRAPPERS */}
      {activeModal !== "none" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: (activeModal === "tamu" || activeModal === "paket" || activeModal === "sbo") ? "800px" : "550px", borderRadius: "24px", padding: "30px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", maxHeight: "85vh", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
            <button onClick={() => setActiveModal("none")} style={{ position: "absolute", top: "20px", right: "20px", background: "#edf2f7", border: "none", width: "36px", height: "36px", borderRadius: "50%", cursor: "pointer", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, fontSize: "14px", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#e2e8f0"} onMouseOut={(e) => e.currentTarget.style.background = "#edf2f7"}>✖</button>

            {/* MODAL 1: LOGIN */}
            {activeModal === "login" && (
              <>
                <div style={{ textAlign: "center", marginBottom: "25px", marginTop: "10px" }}><div style={{ fontSize: "45px", marginBottom: "15px" }}>🏢</div><h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "22px", fontWeight: "800" }}>Akses Staf Internal</h2></div>
                <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Anda" style={sharedInputStyle} />
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Kata Sandi" style={sharedInputStyle} />
                  <button type="submit" disabled={isLoginLoading} style={{ width: "100%", padding: "16px", background: isLoginLoading ? "#a0aec0" : "#e53e3e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold" }}>{isLoginLoading ? "Memeriksa..." : "Masuk Dashboard"}</button>
                </form>
              </>
            )}

            {/* MODAL 2: ATK */}
            {activeModal === "atk" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ marginBottom: "15px", paddingRight: "20px" }}>
                  <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "22px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}><span style={{background:"#fdf4ff", padding:"8px", borderRadius:"12px"}}>🖇️</span> Gudang ATK GA</h2>
                  <p style={{ margin: 0, color: "#718096", fontSize: "13px" }}>Pusat permintaan alat tulis kantor (Kertas, Pulpen, dll).</p>
                </div>
                <div style={{ display: "flex", background: "#f1f5f9", padding: "6px", borderRadius: "14px", marginBottom: "20px", border: "1px solid #e2e8f0" }}>
                  <button onClick={() => setAtkTab("REQUEST")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "14px", background: atkTab === "REQUEST" ? "white" : "transparent", color: atkTab === "REQUEST" ? "#d53f8c" : "#64748b", boxShadow: atkTab === "REQUEST" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", cursor: "pointer" }}>📝 Buat Request</button>
                  <button onClick={() => setAtkTab("LACAK")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "14px", background: atkTab === "LACAK" ? "white" : "transparent", color: atkTab === "LACAK" ? "#d53f8c" : "#64748b", boxShadow: atkTab === "LACAK" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", cursor: "pointer" }}>🔍 Lacak Resi ATK</button>
                </div>

                {atkTab === "REQUEST" ? (
                  <form onSubmit={handleSubmitAtk} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Pemohon *</label>
                        <input list="emp-list-atk" type="text" required placeholder="Ketik nama..." value={formAtkPemohon.nama} onChange={(e) => handleNameChangeAtk(e.target.value)} style={sharedInputStyle} />
                        <datalist id="emp-list-atk">{employees.map(emp => <option key={emp.id} value={emp.nama} />)}</datalist>
                      </div>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Departemen</label>
                        <input type="text" required readOnly value={formAtkPemohon.dept} style={{...sharedInputStyle, background: "#e2e8f0"}} />
                      </div>
                    </div>

                    {formAtkItems.map((item, index) => (
                      <div key={index} style={{ border: "1px solid #cbd5e0", padding: "15px", borderRadius: "12px", background: "#f8fafc", position: "relative" }}>
                        {index > 0 && (
                          <button type="button" onClick={() => handleRemoveAtkItem(index)} style={{ position: "absolute", top: "10px", right: "10px", background: "white", color: "#e53e3e", border: "1px solid #fed7d7", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>Hapus ✖</button>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "10px" }}>
                          <div>
                            <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Pilih Barang {index + 1} *</label>
                            <input list="atk-master" type="text" required placeholder="Cari ATK..." value={item.nama_barang} onChange={(e) => handleAtkItemChange(index, "nama_barang", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px"}} />
                            <datalist id="atk-master">{masterAtkList.map(atk => <option key={atk.id} value={atk.nama_barang} />)}</datalist>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", display: "block" }}>Jumlah *</label>
                            <input type="text" required placeholder="Cth: 2 Rim" value={item.jumlah} onChange={(e) => handleAtkItemChange(index, "jumlah", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px"}} />
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: "11px", fontWeight: "bold", color: "#718096", marginBottom: "4px", display: "block" }}>Deskripsi / Detail Spesifik (Opsional)</label>
                          <input type="text" placeholder="Misal: Warna hitam, merk Joyko, untuk divisi HR" value={item.deskripsi} onChange={(e) => handleAtkItemChange(index, "deskripsi", e.target.value)} style={{...sharedInputStyle, padding: "10px 12px", background: "white"}} />
                        </div>
                      </div>
                    ))}

                    <button type="button" onClick={handleAddAtkItem} style={{ background: "white", color: "#d53f8c", border: "2px dashed #fbb6ce", padding: "12px", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" }}>+ Tambah Barang Lain</button>
                    <button type="submit" disabled={isAtkLoading} style={{ width: "100%", padding: "16px", background: isAtkLoading ? "#a0aec0" : "#d53f8c", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", marginTop: "5px" }}>{isAtkLoading ? "Memproses..." : "Kirim Request ATK"}</button>
                  </form>
                ) : (
                  <div>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                      <input type="text" placeholder="Masukkan Kode Resi (Cth: ATK-2606-1234)..." value={searchAtkResi} onChange={(e) => setSearchAtkResi(e.target.value)} style={{...sharedInputStyle, flex: 1, textTransform: "uppercase"}} />
                      <button onClick={() => handleCariAtk()} disabled={isAtkLoading} style={{ background: "#d53f8c", color: "white", padding: "0 20px", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer" }}>Cari</button>
                    </div>
                    {hasilAtk ? (
                      <div style={{ background: "#fdf4ff", border: "1px solid #fbb6ce", padding: "20px", borderRadius: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px", borderBottom: "1px solid #fed7e2", paddingBottom: "10px" }}>
                          <span style={{ fontWeight: "900", color: "#97266d", fontSize: "18px" }}>📦 {hasilAtk.resi}</span>
                          <span style={{ fontSize: "11px", padding: "6px 12px", borderRadius: "20px", fontWeight: "bold", background: hasilAtk.status.includes("Selesai") ? "#c6f6d5" : "#feebc8", color: hasilAtk.status.includes("Selesai") ? "#22543d" : "#9c4221" }}>{hasilAtk.status.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#4a5568", lineHeight: "1.8", marginBottom: "15px" }}>
                          <div>Pemohon: <b>{hasilAtk.nama_pemohon}</b> ({hasilAtk.departemen})</div>
                          <div>Waktu Request: <b>{formatJam(hasilAtk.waktu_request)}</b></div>
                        </div>
                        <div style={{ fontWeight: "bold", fontSize: "12px", color: "#702459", marginBottom: "5px" }}>Daftar Pesanan:</div>
                        <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#4a5568" }}>
                          {hasilAtk.items?.map((it, idx) => (
                            <li key={idx} style={{ marginBottom: "5px" }}>
                              <b style={{ color: "#d53f8c" }}>{it.nama_barang}</b> ({it.jumlah})
                              {it.deskripsi && <div style={{ fontSize: "11px", color: "#718096", fontStyle: "italic" }}>{it.deskripsi}</div>}
                            </li>
                          ))}
                        </ul>
                        {hasilAtk.status === "Menunggu Disiapkan" && <div style={{ fontSize: "12px", color: "#dd6b20", marginTop: "15px", fontStyle: "italic" }}>* Silakan tunggu info lebih lanjut, GA sedang memproses.</div>}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "40px", color: "#a0aec0" }}>Masukkan kode resi yang Anda dapatkan saat request untuk melacak barang.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MODAL 3: OVERTIME GEDUNG */}
            {activeModal === "overtime" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ marginBottom: "25px", paddingRight: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px" }}>
                  <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "22px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}><span style={{background:"#fffff0", padding:"8px", borderRadius:"12px"}}>⏱️</span> Overtime Gedung</h2>
                  <p style={{ margin: 0, color: "#718096", fontSize: "13px" }}>Formulir request lembur pemakaian AC/Listrik untuk Karyawan.</p>
                </div>
                <form onSubmit={handleSubmitOvertime} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Penanggung Jawab *</label>
                    <input list="emp-list-ot" type="text" required placeholder="Ketik nama Anda..." value={formOvertime.nama} onChange={(e) => handleNameChangeOvertime(e.target.value)} style={sharedInputStyle} />
                    <datalist id="emp-list-ot">{employees.map(emp => <option key={emp.id} value={emp.nama} />)}</datalist>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                    <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Departemen / Tenant</label><input type="text" required readOnly value={formOvertime.dept} style={{...sharedInputStyle, background: "#e2e8f0"}} /></div>
                    <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Tanggal Lembur *</label><input type="date" required value={formOvertime.tanggal} onChange={(e) => setFormOvertime({...formOvertime, tanggal: e.target.value})} style={sharedInputStyle} /></div>
                  </div>
                  <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Area / Ruangan yang Digunakan *</label><input type="text" required placeholder="Misal: Ruang Meeting Lt.2 / Seluruh Lantai 3" value={formOvertime.area} onChange={(e) => setFormOvertime({...formOvertime, area: e.target.value})} style={sharedInputStyle} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                    <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Jam Mulai *</label><input type="time" required value={formOvertime.jam_mulai} onChange={(e) => setFormOvertime({...formOvertime, jam_mulai: e.target.value})} style={sharedInputStyle} /></div>
                    <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Jam Selesai *</label><input type="time" required value={formOvertime.jam_selesai} onChange={(e) => setFormOvertime({...formOvertime, jam_selesai: e.target.value})} style={sharedInputStyle} /></div>
                  </div>
                  <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Keperluan *</label><textarea required placeholder="Jelaskan alasan lembur..." value={formOvertime.alasan} onChange={(e) => setFormOvertime({...formOvertime, alasan: e.target.value})} style={{...sharedInputStyle, minHeight: "60px"}} /></div>
                  <div style={{ fontSize: "11px", color: "#d69e2e", background: "#fffff0", padding: "10px", borderRadius: "8px", border: "1px solid #fefcbf", marginTop: "5px" }}><b>Perhatian:</b> Permintaan overtime akan masuk ke *billing* tagihan departemen/tenant sesuai tarif yang berlaku setelah di-approve GA.</div>
                  <button type="submit" disabled={isOvertimeLoading} style={{ width: "100%", padding: "16px", background: isOvertimeLoading ? "#a0aec0" : "#d69e2e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", marginTop: "10px" }}>{isOvertimeLoading ? "Mengirim..." : "Submit Permintaan Overtime"}</button>
                </form>
              </div>
            )}

            {/* MODAL 4 & 5: PELACAKAN TAMU & PAKET (TABEL) */}
            {(activeModal === "tamu" || activeModal === "paket") && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ marginBottom: "20px", paddingRight: "30px" }}>
                  <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "22px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}><span style={{background: activeModal === "tamu" ? "#fff5f5" : "#fffaf0", padding:"8px", borderRadius:"12px"}}>{activeModal === "tamu" ? "🧑‍💼" : "📦"}</span> {activeModal === "tamu" ? "Pelacakan Tamu" : "Pelacakan Paket"}</h2>
                  <p style={{ margin: 0, color: "#718096", fontSize: "13px" }}>Ketik dan cari untuk melihat riwayat log operasional.</p>
                </div>
                <div style={{ display: "flex", gap: "10px", marginBottom: "25px" }}>
                  <input type="text" placeholder={activeModal === "tamu" ? "Ketik nama tamu / instansi..." : "Ketik nama penerima paket..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{...sharedInputStyle, flex: 1}} />
                  <button onClick={activeModal === "tamu" ? handleCariTamu : handleCariPaket} disabled={isSearching} style={{ background: activeModal === "tamu" ? "#e53e3e" : "#dd6b20", color: "white", padding: "0 25px", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>{isSearching ? "..." : "Cari"}</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                  {activeModal === "tamu" ? (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                      <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                        <tr><th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0", color: "#4a5568" }}>Identitas</th><th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0", color: "#4a5568" }}>Tujuan</th><th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0", color: "#4a5568" }}>Waktu Log</th></tr>
                      </thead>
                      <tbody>
                        {hasilTamu.length > 0 ? hasilTamu.map(t => (
                          <tr key={t.id} style={{ borderBottom: "1px solid #edf2f7" }}>
                            <td style={{ padding: "12px 15px" }}><div style={{ fontWeight: "bold", color: "#2d3748" }}>{t.nama}</div><div style={{ fontSize: "11px", color: "#718096" }}>{t.instansi_dept}</div></td>
                            <td style={{ padding: "12px 15px", color: "#4a5568" }}>{t.tujuan}</td>
                            <td style={{ padding: "12px 15px" }}><div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "2px" }}><span><b style={{color: "#38a169"}}>In:</b> {formatJam(t.waktu_masuk)}</span><span><b style={{color: "#e53e3e"}}>Out:</b> {t.waktu_keluar ? formatJam(t.waktu_keluar) : "Di Dalam"}</span></div></td>
                          </tr>
                        )) : <tr><td colSpan={3} style={{ textAlign: "center", padding: "40px", color: "#a0aec0" }}>Tidak ada riwayat ditemukan.</td></tr>}
                      </tbody>
                    </table>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                      <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                        <tr><th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0", color: "#4a5568" }}>Penerima</th><th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0", color: "#4a5568" }}>Kurir</th><th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0", color: "#4a5568" }}>Tiba</th><th style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0", color: "#4a5568" }}>Status</th></tr>
                      </thead>
                      <tbody>
                        {hasilPaket.length > 0 ? hasilPaket.map(p => (
                          <tr key={p.id} style={{ borderBottom: "1px solid #edf2f7" }}>
                            <td style={{ padding: "12px 15px", fontWeight: "bold", color: "#2d3748" }}>{p.penerima}</td><td style={{ padding: "12px 15px", color: "#718096" }}>{p.kurir}</td><td style={{ padding: "12px 15px", color: "#4a5568", fontSize: "12px" }}>{formatJam(p.waktu_diterima)}</td>
                            <td style={{ padding: "12px 15px" }}><span style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", background: p.status.includes("Diambil") ? "#c6f6d5" : "#feebc8", color: p.status.includes("Diambil") ? "#22543d" : "#9c4221" }}>{p.status}</span></td>
                          </tr>
                        )) : <tr><td colSpan={4} style={{ textAlign: "center", padding: "40px", color: "#a0aec0" }}>Tidak ada riwayat ditemukan.</td></tr>}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* 💡 MODAL 6: SBO (KEMBALI 100% UTUH) */}
            {activeModal === "sbo" && (
              <form onSubmit={handleSubmitSbo} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ marginBottom: "10px", paddingRight: "30px", borderBottom: "2px solid #edf2f7", paddingBottom: "20px" }}>
                  <h2 style={{ margin: "0 0 8px 0", color: "#22543d", fontSize: "20px", display: "flex", alignItems: "center", gap: "10px", fontWeight: "800" }}>
                    <span style={{background:"#c6f6d5", padding:"8px", borderRadius:"12px"}}>🦺</span> Lapor Bahaya (SBO)
                  </h2>
                  <p style={{ margin: 0, color: "#718096", fontSize: "13px", lineHeight: "1.5" }}>Laporan IK-QHSE-SML-001. Laporkan temuan kondisi fisik atau perilaku kerja yang berbahaya di area operasional.</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Pelapor *</label>
                    <input list="emp-list-sbo" type="text" required placeholder="Ketik nama Anda..." value={formSbo.nama_pelapor} onChange={(e) => handleNameChangeSbo(e.target.value)} style={sharedInputStyle} />
                    <datalist id="emp-list-sbo">{employees.map(emp => <option key={emp.id} value={emp.nama} />)}</datalist>
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Tanggal Kejadian *</label>
                    <input type="date" required value={formSbo.tanggal_kejadian} onChange={(e) => setFormSbo({...formSbo, tanggal_kejadian: e.target.value})} style={sharedInputStyle} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Unit Bisnis / Departemen *</label>
                    <input type="text" required placeholder="Terisi otomatis..." value={formSbo.unit_bisnis} onChange={(e) => setFormSbo({...formSbo, unit_bisnis: e.target.value})} style={sharedInputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Lokasi Temuan *</label>
                    <input type="text" required placeholder="Cth: Area Parkir Basement" value={formSbo.lokasi} onChange={(e) => setFormSbo({...formSbo, lokasi: e.target.value})} style={sharedInputStyle} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Kategori Temuan *</label>
                  <select required value={formSbo.kategori_temuan} onChange={(e) => setFormSbo({...formSbo, kategori_temuan: e.target.value})} style={{...sharedInputStyle, cursor: "pointer"}}>
                    <option value="Kondisi Tidak Aman (Unsafe Condition)">⚠️ Kondisi Tidak Aman (Unsafe Condition)</option>
                    <option value="Perilaku Tidak Aman (Unsafe Act)">🛑 Perilaku Tidak Aman (Unsafe Act)</option>
                    <option value="Near Miss (Hampir Celaka)">⚡ Near Miss (Hampir Celaka)</option>
                    <option value="Lingkungan (Pencemaran/Tumpahan)">💧 Lingkungan (Pencemaran/Tumpahan)</option>
                  </select>
                  
                  <div style={{ fontSize: "12px", color: "#2b6cb0", background: "#ebf8ff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #bee3f8", display: "flex", gap: "8px", marginTop: "8px" }}>
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

            {/* MODAL 7: HELPDESK */}
            {activeModal === "helpdesk" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ marginBottom: "15px", paddingRight: "20px" }}>
                  <h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "22px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}><span style={{background:"#ebf8ff", padding:"8px", borderRadius:"12px"}}>🛠️</span> Helpdesk GA</h2>
                </div>
                <div style={{ display: "flex", background: "#f1f5f9", padding: "6px", borderRadius: "14px", marginBottom: "25px", border: "1px solid #e2e8f0" }}>
                  <button onClick={() => setHelpdeskTab("LAPOR")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", background: helpdeskTab === "LAPOR" ? "white" : "transparent", color: helpdeskTab === "LAPOR" ? "#3182ce" : "#64748b" }}>📝 Lapor</button>
                  <button onClick={() => setHelpdeskTab("LACAK")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", background: helpdeskTab === "LACAK" ? "white" : "transparent", color: helpdeskTab === "LACAK" ? "#3182ce" : "#64748b" }}>🔍 Lacak</button>
                </div>
                {helpdeskTab === "LAPOR" ? (
                  <form onSubmit={handleSubmitHelpdesk} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Nama Pelapor *</label><input list="emp-list" type="text" required value={formHelpdesk.nama} onChange={(e) => handleNameChangeHelpdesk(e.target.value)} style={sharedInputStyle} /><datalist id="emp-list">{employees.map(emp => <option key={emp.id} value={emp.nama} />)}</datalist></div>
                    <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Titik Lokasi *</label><input type="text" required value={formHelpdesk.lokasi} onChange={(e) => setFormHelpdesk({...formHelpdesk, lokasi: e.target.value})} style={sharedInputStyle} /></div>
                    <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Deskripsi Masalah *</label><textarea required value={formHelpdesk.deskripsi} onChange={(e) => setFormHelpdesk({...formHelpdesk, deskripsi: e.target.value})} style={{...sharedInputStyle, minHeight: "60px"}} /></div>
                    <div style={{ background: fotoAwal ? "#ebf8ff" : "#f8fafc", border: fotoAwal ? "2px solid #90cdf4" : "2px dashed #cbd5e0", padding: "20px", borderRadius: "16px", textAlign: "center" }}>
                      <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}><span style={{ fontSize: "35px" }}>📸</span><div style={{ fontSize: "14px", fontWeight: "bold", color: "#4a5568" }}>Unggah Foto Kerusakan *</div><input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, setFotoAwal)} style={{ display: "none" }} required={!fotoAwal} /></label>
                      {fotoAwal && <div style={{marginTop: "15px"}}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotoAwal} alt="Awal" style={{ width: "100%", maxHeight: "150px", objectFit: "cover", borderRadius: "10px" }} />
                        <button type="button" onClick={() => setFotoAwal("")} style={{background: "#e53e3e", color: "white", padding: "5px", borderRadius: "50%", marginTop: "5px"}}>✖</button>
                      </div>}
                    </div>
                    <button type="submit" disabled={isHelpdeskLoading} style={{ width: "100%", padding: "16px", background: isHelpdeskLoading ? "#a0aec0" : "#3182ce", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold" }}>{isHelpdeskLoading ? "Mengunggah..." : "Kirim Laporan"}</button>
                  </form>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}><input type="text" placeholder="Cari nama..." value={searchHelpdeskName} onChange={(e) => setSearchHelpdeskName(e.target.value)} style={{...sharedInputStyle, flex: 1}} /><button onClick={handleCariHelpdesk} disabled={isSearchingHelpdesk} style={{ background: "#3182ce", color: "white", padding: "0 20px", border: "none", borderRadius: "12px", fontWeight: "bold" }}>Cari</button></div>
                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "15px" }}>
                      {hasilHelpdesk.length > 0 ? hasilHelpdesk.map((tiket) => (
                        <div key={tiket.id} style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "15px" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}><span style={{ fontWeight: "800", fontSize: "14px" }}>📍 {tiket.lokasi}</span><span style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "6px", background: "#feebc8", color: "#9c4221", fontWeight: "bold" }}>{tiket.status}</span></div><div style={{ fontSize: "13px", color: "#4a5568" }}>{tiket.deskripsi}</div></div>
                      )) : <div style={{ textAlign: "center", padding: "30px", color: "#a0aec0" }}>Hasil pencarian tiket akan muncul di sini.</div>}
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