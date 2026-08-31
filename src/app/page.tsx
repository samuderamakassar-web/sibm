"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs, Timestamp, where, addDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { kirimWA, kirimEmail, template } from "../lib/notify";
import { buildRequestBaruEmailHtml } from "../lib/emailTemplates";
import { useToast } from "../components/ui/ToastProvider";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Textarea from "../components/ui/Textarea";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import VehicleIcon3D from "../components/VehicleIcon3D";

// ==========================================
// INTERFACES
// ==========================================
interface KendaraanLog { kendaraan: string; status_kendaraan: string; driver_bertugas: string; tujuan_keperluan: string; kilometer_kendaraan?: string; waktu_catat?: Timestamp | null; _riwayatTerakhir?: KendaraanLog; }
interface DriverStatusLog { nama_driver: string; status: string; waktu_ubah?: Timestamp | null; }
interface DataTamu { id: string; nama: string; instansi_dept: string; tujuan: string; waktu_masuk?: Timestamp | null; waktu_keluar?: Timestamp | null; }
interface DataPaket { id: string; penerima: string; kurir: string; waktu_diterima?: Timestamp | null; status: string; }
interface ObStatusData { nama: string; status: string; lokasi: string[]; }
interface Employee { id: string; nama: string; departemen: string; }
interface KontakAdmin { nama: string; whatsapp?: string; email?: string; }
interface SecurityShift { current: string[]; next: string[]; currentName: string; nextName: string; }
interface HelpdeskTicket { id: string; nama_pelapor: string; lokasi: string; deskripsi: string; status: string; foto_awal?: string; foto_proses?: string; waktu_lapor?: Timestamp | null; }
interface MasterAtk { id: string; nama_barang: string; foto_url?: string; }
interface AtkItemRequest { nama_barang: string; jumlah: string; deskripsi: string; }
interface AtkRequest { id: string; resi: string; nama_pemohon: string; departemen: string; items: AtkItemRequest[]; status: string; waktu_request?: Timestamp | null; }
interface OvertimeLog { id: string; nama_pemohon: string; departemen: string; area_ruangan: string; tanggal: string; jam_mulai: string; jam_selesai: string; status: string; }

// ==========================================
// IKON — SVG garis (bukan emoji), 1 set dipakai bareng di header, menu cepat, & bottom nav
// ==========================================
type IconProps = { size?: number; color?: string };
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconHome = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9.5 21v-6h5v6" /></svg>
);
const IconIdCard = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M6 16c.5-1.7 1.6-2.5 2.5-2.5s2 .8 2.5 2.5" /><path d="M14 10h5" /><path d="M14 13.5h5" /></svg>
);
const IconPackage = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></svg>
);
const IconClipboard = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6" /><path d="M9 15h6" /><path d="M9 19h3" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconWrench = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.6 5l-6 6 2.6 2.6 6-6a4 4 0 0 0 5.6-5.6l-3 3-2.6-2.6 3-3z" /></svg>
);
const IconAlertTriangle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 21h20L12 3z" /><path d="M12 10v4" /><path d="M12 17.5h.01" /></svg>
);
const IconTruck = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13" /><rect x="3" y="13" width="18" height="5" rx="1.5" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" /></svg>
);
const IconShield = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3z" /></svg>
);
const IconChevronRight = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
);

// Geser tanggal ISO (YYYY-MM-DD) sejumlah n hari, lewat komponen Y/M/D langsung (aman dari isu timezone)
const geserTanggalISO = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

// Sabtu/Minggu — OB & CS tidak ada jadwal di hari ini (sama pola dengan PlottingOBPage/monitor-ob),
// dipakai buat "paksa kosong" tampilan tim bertugas walau dokumen daily_plots lama masih nyimpan data basi
const isWeekend = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
};

// Ambil plat nomor murni dari field `kendaraan` — field ini di Firestore kadang berupa
// "PLAT - NAMA DRIVER (PERUSAHAAN)" bukan cuma plat, jadi tanpa ini 1 unit fisik bisa
// kehitung dobel/lebih kalau pernah dicatat pakai driver yang beda-beda.
const getPlat = (kendaraan?: string) => (kendaraan || "").split(" - ")[0].trim();

// FUNGSI GENERATE RESI
const generateResiCode = () => {
  const dateCode = new Date().toISOString().slice(2, 7).replace("-", "");
  const randomCode = Math.floor(1000 + Math.random() * 9000);
  return `ATK-${dateCode}-${randomCode}`;
};

export default function PortalSIBM() {
  const router = useRouter();
  const showToast = useToast();
  // Pakai tanggal WITA (Asia/Makassar), BUKAN toISOString() yang UTC-based —
  // toISOString() bikin tanggal baru "ganti" jam 08:00 WITA, bukan jam 00:00 WITA (bug berulang di project ini)
  // Catatan: pakai `new Date()` (bukan Date.now()) karena react-hooks/purity menganggap Date.now() impure saat dipanggil langsung di body komponen
  const now = new Date();
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(now);
  const tomorrowISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const jamWITA = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Makassar", hour: "numeric", hourCycle: "h23" }).format(now), 10);
  const sudahMalam = jamWITA >= 20; // >= 20:00 WITA -> mulai tampilkan plot besok juga

  // Rentang Senin-Minggu (WITA) untuk widget "Overtime Gedung (Minggu Ini)" — dulu cuma tampilkan hari ini
  // Ambil angka hari dari tanggal WITA yang sudah benar (todayISO), bukan dari Date lokal browser
  const [thnW, blnW, tglW] = todayISO.split("-").map(Number);
  const hariWITA = new Date(thnW, blnW - 1, tglW).getDay(); // 0=Minggu..6=Sabtu (pemetaan tanggal->hari tidak bergantung timezone)
  const seninMingguIni = geserTanggalISO(todayISO, hariWITA === 0 ? -6 : 1 - hariWITA);
  const mingguMingguIni = geserTanggalISO(todayISO, hariWITA === 0 ? 0 : 7 - hariWITA);

  // STATE EXISTING
  const [obBertugas, setObBertugas] = useState<ObStatusData[]>([]);
  const [obBesok, setObBesok] = useState<ObStatusData[]>([]);
  const [logKendaraanMentah, setLogKendaraanMentah] = useState<KendaraanLog[]>([]);
  const [securityShift, setSecurityShift] = useState<SecurityShift>({ current: [], next: [], currentName: "Memuat...", nextName: "Memuat..." });
  const [driverStatusMap, setDriverStatusMap] = useState<Record<string, string>>({ "Amal Setiawan": "Memuat...", "Muhammad Renaldy": "Memuat..." });
  const [overtimeMingguIni, setOvertimeMingguIni] = useState<OvertimeLog[]>([]);

  // STATE INFO PEMELIHARAAN GEDUNG
  // String kosong = "belum ada info / normal", BUKAN "Memuat..." — dulu placeholder loading dipakai
  // di sini, tapi sekarang string ini juga dipakai sebagai flag boolean (Ringkasan Hari Ini & Status
  // Operasional), jadi placeholder loading yang truthy bikin sekilas salah nampilin "ada perbaikan".
  const [maintenanceInfo, setMaintenanceInfo] = useState<string>("");
  const [pengumumanGedung, setPengumumanGedung] = useState<string>("");

  // STATE HERO / RINGKASAN
  const [staffFotoMap, setStaffFotoMap] = useState<Record<string, string>>({});
  const [kendaraanMetaMap, setKendaraanMetaMap] = useState<Record<string, { kategori: string; warna: string }>>({});
  const [daftarSemuaKendaraan, setDaftarSemuaKendaraan] = useState<string[]>([]);

  // STATE TREN AKTIVITAS & KALENDER AKTIVITAS (dashboard baru) — data dibatasi (limit) biar
  // gak narik seluruh histori collection tiap buka portal, konsisten sama pola limit() di halaman lain
  const [visitorLogsTrend, setVisitorLogsTrend] = useState<DataTamu[]>([]);
  const [packageLogsTrend, setPackageLogsTrend] = useState<DataPaket[]>([]);
  const [ticketsTrend, setTicketsTrend] = useState<HelpdeskTicket[]>([]);

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
  const [formAtkItems, setFormAtkItems] = useState<AtkItemRequest[]>([]);
  const [searchAtkProduk, setSearchAtkProduk] = useState("");
  const [isAtkLoading, setIsAtkLoading] = useState(false);
  const [searchAtkResi, setSearchAtkResi] = useState("");
  const [hasilAtk, setHasilAtk] = useState<AtkRequest | null>(null);

  // OVERTIME
  const [formOvertime, setFormOvertime] = useState({ nama: "", dept: "", area: "", tanggal: todayISO, jam_mulai: "", jam_selesai: "", alasan: "" });
  const [isOvertimeLoading, setIsOvertimeLoading] = useState(false);

  const formatTgl = new Date().toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);

  useEffect(() => {
    // Helper bersama: ubah dokumen daily_plots/{tanggal} jadi daftar staf bertugas.
    // PENTING: sumber datanya adalah field `plot_lantai` (area -> nama), BUKAN `status_staf` —
    // field status_staf itu tidak pernah ditulis oleh halaman plotting, jadi kalau dipakai
    // daftarnya selalu kosong walau plot sudah diisi coordinator.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsePlotDoc = (docSnap: any) => {
      if (!docSnap.exists()) return [] as ObStatusData[];
      const plots = (docSnap.data().plot_lantai || {}) as Record<string, string>;
      const namaUnik = Array.from(new Set(Object.values(plots).filter(n => n && n !== "Semua / All")));
      return namaUnik.map(nama => ({
        nama,
        status: "Hadir / On Duty",
        lokasi: Object.keys(plots).filter(l => plots[l] === nama || plots[l] === "Semua / All"),
      }));
    };

    // 1. Tarik Data OB — plot hari ini
    const unsubPlot = onSnapshot(doc(db, "daily_plots", todayISO), (docSnap) => {
      setObBertugas(parsePlotDoc(docSnap));
    });

    // 1b. Setelah jam 20:00 WITA, tarik juga plot BESOK biar staf/GA bisa lihat plotting besok dari malam ini
    // (skip kalau besok Sabtu/Minggu — OB & CS tidak ada jadwal, walau dokumen plot lama mungkin masih nyimpan data basi)
    let unsubPlotBesok = () => {};
    if (sudahMalam && !isWeekend(tomorrowISO)) {
      unsubPlotBesok = onSnapshot(doc(db, "daily_plots", tomorrowISO), (docSnap) => {
        setObBesok(parsePlotDoc(docSnap));
      });
    } else {
      // setState langsung di body effect kena lint react-hooks/set-state-in-effect -> bungkus setTimeout(...,0) sesuai konvensi project
      setTimeout(() => setObBesok([]), 0);
    }

    // 2. Tarik Data Kendaraan (mentah — status per kendaraan + prioritas Standby dihitung di useMemo `mobilStatus` di bawah,
    // sekaligus jadi sumber angka "Kendaraan" di widget Tren Aktivitas)
    const unsubVeh = onSnapshot(query(collection(db, "operational_vehicle_logs"), orderBy("waktu_catat", "desc"), limit(30)), (snapshot) => {
      setLogKendaraanMentah(snapshot.docs.map(d => d.data() as KendaraanLog));
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

    // 4. Tarik Overtime Minggu Ini (Senin-Minggu WITA) — dulu cuma hari ini, sekarang direkap 1 minggu sekaligus
    const unsubOvertime = onSnapshot(
      query(collection(db, "ga_overtime_requests"), where("tanggal", ">=", seninMingguIni), where("tanggal", "<=", mingguMingguIni)),
      (snapshot) => {
        const otData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OvertimeLog))
          .sort((a, b) => a.tanggal === b.tanggal ? a.jam_mulai.localeCompare(b.jam_mulai) : a.tanggal.localeCompare(b.tanggal));
        setOvertimeMingguIni(otData);
      }
    );

    // 5. Tarik Info Pemeliharaan Gedung (tiket ini juga jadi sumber angka "Tiket Selesai" di widget Tren Aktivitas)
    const unsubMaintenance = onSnapshot(query(collection(db, "helpdesk_tickets"), orderBy("waktu_lapor", "desc"), limit(20)), (snapshot) => {
      const tickets = snapshot.docs.map(d => d.data() as HelpdeskTicket);
      setTicketsTrend(tickets);
      const activeMaintenance = tickets.filter(t => t.status === "Sedang Dikerjakan").slice(0, 3);
      if (activeMaintenance.length > 0) {
        const infos = activeMaintenance.map(t => `SEDANG DIKERJAKAN: Perbaikan ${t.lokasi} (${t.deskripsi})`);
        setMaintenanceInfo(infos.join("   |   "));
      } else {
        setMaintenanceInfo("");
      }
    });

    // 5b. Tarik Riwayat Tamu & Paket (dibatasi limit 60 — dipakai buat widget Tren Aktivitas & Kalender Aktivitas,
    // BUKAN pencarian; pencarian tamu/paket tetap pakai getDocs on-demand di handleCariTamu/handleCariPaket)
    const unsubVisitorTrend = onSnapshot(query(collection(db, "security_visitor_logs"), orderBy("waktu_masuk", "desc"), limit(60)), (snapshot) => {
      setVisitorLogsTrend(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DataTamu)));
    });
    const unsubPackageTrend = onSnapshot(query(collection(db, "packages"), orderBy("waktu_diterima", "desc"), limit(60)), (snapshot) => {
      setPackageLogsTrend(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DataPaket)));
    });

    getDocs(collection(db, "employees_directory")).then(snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee))));

    // Foto profil staf (untuk kartu "Tim Bertugas") & foto kendaraan (untuk armada)
    getDocs(collection(db, "users_master")).then(snap => {
      const map: Record<string, string> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.nama && data.foto_url) map[data.nama] = data.foto_url;
      });
      setStaffFotoMap(map);
    }).catch(err => console.error("[hero] Gagal memuat foto staf:", err));

    getDocs(collection(db, "master_kendaraan")).then(snap => {
      const metaMap: Record<string, { kategori: string; warna: string }> = {};
      const semuaId: string[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.kendaraan) {
          // Dedup pakai plat nomor murni — dokumen master yang secara plat sama (cuma beda
          // nama driver/PIC yang tercatat) dianggap 1 unit fisik yang sama, bukan 2 unit.
          const plat = getPlat(data.kendaraan);
          if (!semuaId.includes(plat)) semuaId.push(plat);
          if (!metaMap[plat]) metaMap[plat] = { kategori: data.kategori || "Sedan", warna: data.warna || "Putih" };
        }
      });
      setKendaraanMetaMap(metaMap);
      setDaftarSemuaKendaraan(semuaId);
    }).catch(err => console.error("[hero] Gagal memuat data kendaraan:", err));

    // Tarik kontak Admin GA & QHSE dari users_master (untuk notifikasi Tahap 3: request baru masuk & SBO baru)
    getDocs(query(collection(db, "users_master"), where("departemen", "==", "Admin GA")))
      .then(snap => setDaftarAdminGA(snap.docs.map(d => d.data() as KontakAdmin)))
      .catch(err => console.error("[notify] Gagal memuat kontak Admin GA:", err));

    getDocs(query(collection(db, "users_master"), where("departemen", "==", "QHSE")))
      .then(snap => setDaftarQHSE(snap.docs.map(d => d.data() as KontakAdmin)))
      .catch(err => console.error("[notify] Gagal memuat kontak QHSE:", err));
    const unsubMasterAtk = onSnapshot(collection(db, "master_atk"), (snap) => {
      setMasterAtkList(snap.docs.map(d => ({ id: d.id, ...d.data() } as MasterAtk)));
    });

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

    return () => { unsubPlot(); unsubPlotBesok(); unsubVeh(); unsubDriver(); unsubOvertime(); unsubMaintenance(); unsubBroadcast(); unsubMasterAtk(); unsubVisitorTrend(); unsubPackageTrend(); };
  }, [todayISO, tomorrowISO, sudahMalam, seninMingguIni, mingguMingguIni]);

  const getTime = (ts?: Timestamp | null) => ts ? ts.toMillis() : 0;

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

  async function uploadToCloudinary(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
  formData.append("folder", "sibm/portal-publik");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
  const data = await res.json();
  return data.secure_url as string;
}

const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setFotoState: React.Dispatch<React.SetStateAction<string>>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 600 / img.width;
      canvas.width = 600;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        setIsUploadingFoto(true);
        try {
          const url = await uploadToCloudinary(blob);
          setFotoState(url);
        } catch (err) {
          console.error(err);
          showToast("Gagal upload foto, coba lagi.", "error");
        } finally {
          setIsUploadingFoto(false);
        }
      }, "image/jpeg", 0.6);
    };
    if (typeof ev.target?.result === 'string') img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

  const handleTambahKeKeranjang = (produk: MasterAtk) => {
    setFormAtkItems(prev => {
      const idx = prev.findIndex(i => i.nama_barang === produk.nama_barang);
      if (idx >= 0) {
        const updated = [...prev];
        const jumlahLama = parseInt(updated[idx].jumlah) || 0;
        updated[idx] = { ...updated[idx], jumlah: String(jumlahLama + 1) };
        return updated;
      }
      return [...prev, { nama_barang: produk.nama_barang, jumlah: "1", deskripsi: "" }];
    });
    showToast(`${produk.nama_barang} ditambahkan ke keranjang`, "success");
  };
  const handleRemoveAtkItem = (index: number) => { const newItems = [...formAtkItems]; newItems.splice(index, 1); setFormAtkItems(newItems); };
  const handleAtkItemChange = (index: number, field: keyof AtkItemRequest, value: string) => { const newItems = [...formAtkItems]; newItems[index][field] = value; setFormAtkItems(newItems); };

  // Broadcast notifikasi Email ke semua kontak Admin GA (dipakai saat ada request baru: ATK/Overtime/Helpdesk)
  // -- HTML form rapi (buildRequestBaruEmailHtml), bukan lagi teks WA yang cuma di-convert kasar.
  const kirimNotifikasiAdminGA = async (
    jenisRequest: string,
    namaPemohon: string,
    departemen: string,
    rows: { label: string; value: string }[],
    itemsTable?: { headers: string[]; rows: string[][] },
    fotoUrl?: string
  ) => {
    if (daftarAdminGA.length === 0) {
      console.warn("[notify] Tidak ada kontak Admin GA (departemen 'Admin GA') di users_master. Notifikasi dilewati.");
      return;
    }
    const htmlEmail = buildRequestBaruEmailHtml({ jenisRequest, namaPemohon, departemen, rows, itemsTable, fotoUrl });
    for (const admin of daftarAdminGA) {
      if (admin.email) {
        const hasilEmail = await kirimEmail(admin.email, `Request Baru Masuk: ${jenisRequest}`, htmlEmail, admin.nama);
        if (!hasilEmail.sukses) console.error(`[notify] Gagal kirim Email ke Admin GA (${admin.nama}):`, hasilEmail.pesanError);
      }
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

    if (formAtkItems.length === 0) {
      showToast("Keranjang masih kosong, pilih barang dulu.", "warning");
      return;
    }
    if (formAtkItems.some(i => !i.nama_barang || !i.jumlah)) {
      showToast("Pastikan nama barang dan jumlah telah diisi!", "warning");
      return;
    }
    if (!employees.some(emp => emp.nama === formAtkPemohon.nama)) {
      showToast("⚠️ Nama tidak ditemukan di Master Data Karyawan. Mohon pilih nama dari daftar saran yang muncul saat mengetik, jangan ketik manual.", "warning");
      return;
    }

    setIsAtkLoading(true);
    const newResi = generateResiCode();
    try {
      await addDoc(collection(db, "ga_atk_requests"), { resi: newResi, nama_pemohon: formAtkPemohon.nama, departemen: formAtkPemohon.dept, items: formAtkItems, status: "Menunggu Disiapkan", waktu_request: serverTimestamp() });

      // Notifikasi ke Admin GA (best-effort, tidak memblokir alur pemohon) — rincian per barang dalam tabel
      kirimNotifikasiAdminGA("Request ATK", formAtkPemohon.nama, formAtkPemohon.dept, [{ label: "Kode Resi", value: newResi }], {
        headers: ["Barang", "Jumlah", "Keterangan"],
        rows: formAtkItems.map((it) => [it.nama_barang, it.jumlah, it.deskripsi || "-"]),
      });

      showToast(`Request ATK berhasil! Kode Resi: ${newResi} — simpan untuk melacak barang Anda.`, "success");
      setFormAtkPemohon({ nama: "", dept: "" }); setFormAtkItems([]); setSearchAtkResi(newResi); setAtkTab("LACAK"); handleCariAtk(newResi);
    } catch (error) {
      console.error(error);
      showToast("Gagal mengirim request ATK.", "error");
    } finally { setIsAtkLoading(false); }
  };

  const handleCariAtk = async (resiToSearch?: string) => {
    const resi = resiToSearch || searchAtkResi;
    if (!resi.trim()) {
      showToast("Masukkan Kode Resi ATK Anda!", "warning");
      return;
    }
    setIsAtkLoading(true);
    try {
      const q = query(collection(db, "ga_atk_requests"), where("resi", "==", resi.trim().toUpperCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setHasilAtk(null);
        showToast(`Resi ${resi} tidak ditemukan.`, "warning");
      }
      else { setHasilAtk({ id: snap.docs[0].id, ...snap.docs[0].data() } as AtkRequest); }
    } finally { setIsAtkLoading(false); }
  };

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employees.some(emp => emp.nama === formOvertime.nama)) {
      showToast("⚠️ Nama tidak ditemukan di Master Data Karyawan. Mohon pilih nama dari daftar saran yang muncul saat mengetik, jangan ketik manual.", "warning");
      return;
    }
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
        status: "Tercatat", // Tidak lagi butuh approval GA — tanggal & jam sudah jelas, langsung tercatat untuk direkap jadi tagihan
        waktu_request: serverTimestamp()
      });

      // Notifikasi ke Admin GA (best-effort, tidak memblokir alur pemohon) — sekarang sifatnya info, bukan permintaan approval
      kirimNotifikasiAdminGA("Overtime Gedung", formOvertime.nama, formOvertime.dept, [
        { label: "Tanggal", value: formOvertime.tanggal },
        { label: "Area", value: formOvertime.area },
        { label: "Jam Mulai", value: formOvertime.jam_mulai },
        { label: "Jam Selesai", value: formOvertime.jam_selesai },
        { label: "Alasan", value: formOvertime.alasan },
      ]);

      showToast("Overtime Gedung berhasil dicatat. Akan masuk rekap tagihan.", "success");
      setFormOvertime({ nama: "", dept: "", area: "", tanggal: todayISO, jam_mulai: "", jam_selesai: "", alasan: "" }); setActiveModal("none");
    } catch (error) {
      console.error(error);
      showToast("Gagal mengirim permohonan Overtime.", "error");
    } finally { setIsOvertimeLoading(false); }
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
    if (!searchHelpdeskName.trim()) {
      showToast("Masukkan nama Anda terlebih dahulu.", "warning");
      return;
    }
    setIsSearchingHelpdesk(true);
    try {
      const snap = await getDocs(collection(db, "helpdesk_tickets"));
      const rawData = snap.docs.map(d => ({ id: d.id, ...d.data() } as HelpdeskTicket));
      const filtered = rawData.filter(t => String(t.nama_pelapor).toLowerCase().includes(searchHelpdeskName.toLowerCase().trim()));
      filtered.sort((a, b) => getTime(b.waktu_lapor) - getTime(a.waktu_lapor));
      setHasilHelpdesk(filtered.slice(0, 15));
      if (filtered.length === 0) showToast(`Belum ada laporan dari: "${searchHelpdeskName}"`, "info");
    } finally { setIsSearchingHelpdesk(false); }
  };

  const handleSubmitSbo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fotoSbo) {
      if (isUploadingFoto) return showToast("Tunggu foto selesai diunggah dulu.", "warning");
      showToast("Wajib melampirkan foto!", "warning");
      return;
    }
    if (formSbo.nama_pelapor && !employees.some(emp => emp.nama === formSbo.nama_pelapor)) {
      showToast("⚠️ Nama tidak ditemukan di Master Data Karyawan. Mohon pilih nama dari daftar saran yang muncul saat mengetik, jangan ketik manual.", "warning");
      return;
    }
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

      showToast("Laporan SBO berhasil disubmit!", "success");
      setFormSbo({ nama_pelapor: "", tanggal_kejadian: todayISO, unit_bisnis: "", lokasi: "", detail_temuan: "", kategori_temuan: "Kondisi Tidak Aman (Unsafe Condition)", penyebab: "", action_taken: "", status_temuan: "Open", komitmen_pelaku: "", konsekuensi: "" });
      setFotoSbo("");
      setActiveModal("none");
    } catch (error) {
      console.error(error);
      showToast("Terjadi kesalahan.", "error");
    } finally { setIsSboLoading(false); }
  };

  const handleSubmitHelpdesk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employees.some(emp => emp.nama === formHelpdesk.nama)) {
      showToast("⚠️ Nama tidak ditemukan di Master Data Karyawan. Mohon pilih nama dari daftar saran yang muncul saat mengetik, jangan ketik manual.", "warning");
      return;
    }
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
      kirimNotifikasiAdminGA("Tiket Helpdesk", formHelpdesk.nama, formHelpdesk.dept, [
        { label: "Lokasi", value: formHelpdesk.lokasi },
        { label: "Deskripsi Masalah", value: formHelpdesk.deskripsi },
      ], undefined, fotoAwal || undefined);

      showToast("Tiket kerusakan terkirim!", "success");
      setFormHelpdesk({ nama: "", dept: "", lokasi: "", deskripsi: "" }); setFotoAwal(""); setHelpdeskTab("LACAK");
    } catch (error) {
      console.error(error);
      showToast("Gagal mengirim tiket kerusakan.", "error");
    } finally { setIsHelpdeskLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoginLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "users_master"), where("email", "==", email.toLowerCase())));
      if (snap.empty) {
        showToast("Email tidak terdaftar.", "error");
        setIsLoginLoading(false);
        return;
      }

      const uData = snap.docs[0].data();

      // Cek Password Asli dari Database
      if (password !== uData.password) {
        showToast("Password yang Anda masukkan salah!", "error");
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
      else showToast(`Akses belum tersedia untuk ${uData.departemen}`, "warning");
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoginLoading(false);
    }
  };

  const formatJam = (ts: Timestamp | null | undefined) => ts ? new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

  // Ubah 1 baris log kendaraan jadi kalimat history biasa (bukan card per-kendaraan lagi) — dipakai di card "Status Armada Operasional"
  const buatKalimatRiwayat = (log: KendaraanLog) => {
    const plat = log.kendaraan?.split(" - ")[0] || log.kendaraan;
    const driver = log.driver_bertugas?.replace("Standby: ", "") || "Karyawan";
    const status = log.status_kendaraan?.toLowerCase() || "";
    const tujuan = log.tujuan_keperluan && log.tujuan_keperluan !== "-" ? ` menuju ${log.tujuan_keperluan}` : "";
    if (status.includes("keluar")) return `${plat} keluar${tujuan} — driver ${driver}`;
    if (status.includes("tiba")) return `${plat} tiba kembali — driver ${driver}`;
    if (status.includes("bengkel") || status.includes("service")) return `${plat} masuk servis/bengkel`;
    return `${plat} — ${log.status_kendaraan} — driver ${driver}`;
  };

  const getInitials = (nama: string) => nama.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  // Status armada final yang dipakai di UI: gabungan status terkini per kendaraan (dari 30 log terakhir) +
  // kendaraan master yang TIDAK muncul di 30 log terakhir tetap dianggap Standby (bukan hilang dari daftar) +
  // kendaraan Standby diprioritaskan ke atas + kendaraan Standby dikasih info trip terakhirnya (kalau kepantau di window log yang sama)
  const isStandbyLabel = (s?: string) => !!s && (s.includes("Standby") || s.includes("Tiba"));
  const mobilStatus = useMemo(() => {
    // Peta kunci plat ternormalisasi (huruf besar + tanpa spasi) -> plat asli dari master_kendaraan.
    // Perlu ini karena field `kendaraan` di log riwayat kadang ditulis beda tipis dari master
    // (spasi ganda, huruf kecil, dst) — tanpa normalisasi, 1 unit fisik yang sama bisa kehitung
    // sebagai "kendaraan baru" di slideshow (jumlah nambah sendiri, gak sinkron sama Firestore).
    const normalizeKey = (s: string) => s.toUpperCase().replace(/\s+/g, "");
    const canonicalByKey: Record<string, string> = {};
    daftarSemuaKendaraan.forEach(plat => { canonicalByKey[normalizeKey(plat)] = plat; });

    // master_kendaraan adalah sumber kebenaran daftar unit fisik. Log riwayat cuma dipakai buat
    // nentuin status (keluar/standby) salah satu dari plat yang sudah ada di master — kalau plat
    // di log gak ketemu padanannya di master (typo lama / kendaraan sudah dihapus dari master),
    // log itu diabaikan, BUKAN ditambahin jadi unit baru.
    const statusTerkini: Record<string, KendaraanLog> = {};
    logKendaraanMentah.forEach(log => {
      const plat = canonicalByKey[normalizeKey(getPlat(log.kendaraan))];
      if (!plat) return;
      if (!statusTerkini[plat]) statusTerkini[plat] = { ...log, kendaraan: plat };
    });

    // Kendaraan yang ada di master_kendaraan tapi tidak muncul sama sekali di 30 log terakhir -> tidak ada aktivitas
    // baru-baru ini, jadi dianggap Standby di parkiran (bukan malah hilang dari tampilan)
    // (daftarSemuaKendaraan sudah berisi plat murni & sudah dedup, lihat efek master_kendaraan di atas)
    daftarSemuaKendaraan.forEach(plat => {
      if (!statusTerkini[plat]) {
        statusTerkini[plat] = { kendaraan: plat, status_kendaraan: "Standby (Parkiran)", driver_bertugas: "-", tujuan_keperluan: "-" };
      }
    });

    // Cari trip "Keluar" TERAKHIR per plat dari log yang sudah ditarik, buat ditempel ke kendaraan yang lagi Standby
    // sebagai "riwayat pakai terakhir" (best-effort — hanya sejauh yang kecover di 30 log terbaru)
    const tripTerakhirMap: Record<string, KendaraanLog> = {};
    logKendaraanMentah.forEach(log => {
      const plat = canonicalByKey[normalizeKey(getPlat(log.kendaraan))];
      if (!plat) return;
      if (log.status_kendaraan?.toLowerCase().includes("keluar") && !tripTerakhirMap[plat]) {
        tripTerakhirMap[plat] = log;
      }
    });

    const daftar = Object.values(statusTerkini).map(v =>
      isStandbyLabel(v.status_kendaraan) ? { ...v, _riwayatTerakhir: tripTerakhirMap[v.kendaraan] } : v
    );

    // Standby selalu di atas; dalam grup yang sama diurut alfabet plat biar posisinya stabil (tidak lompat-lompat)
    return daftar.sort((a, b) => {
      const aStandby = isStandbyLabel(a.status_kendaraan) ? 0 : 1;
      const bStandby = isStandbyLabel(b.status_kendaraan) ? 0 : 1;
      if (aStandby !== bStandby) return aStandby - bStandby;
      return a.kendaraan.localeCompare(b.kendaraan);
    });
  }, [logKendaraanMentah, daftarSemuaKendaraan]);

  // Sabtu/Minggu dipaksa kosong di sisi tampilan (bukan cuma andalkan data Firestore) — OB & CS
  // memang tidak ada jadwal weekend, tapi dokumen daily_plots lama yang belum di-regenerate ulang
  // masih bisa nyimpan plot basi, jadi kalau dibaca mentah-mentah tim bertugas hari ini jadi "tidak sesuai".
  const hadirOB = isWeekend(todayISO) ? [] : obBertugas.filter(o => o.status.includes("Hadir"));
  const driverEntries = Object.entries(driverStatusMap);

  // ==========================================
  // TIM BERTUGAS HARI INI — gabungan OB/CS + Security + Driver jadi satu daftar untuk dashboard baru
  // ==========================================
  type TimBertugasEntry = { key: string; nama: string; sub: string; label: string; tipe: "ob" | "security" | "driver"; foto?: string; aktif: boolean };
  // Catatan: sengaja TANPA useMemo — React Compiler (aktif di project ini, lihat eslint
  // react-hooks/preserve-manual-memoization) auto-memoize komputasi biasa, dan array dependency
  // manual di sini gampang meleset dari inferensi compiler (akses properti nested kayak
  // securityShift.current) sehingga malah bikin error build, bukan warning.
  const timBertugasHariIni: TimBertugasEntry[] = (() => {
    const daftar: TimBertugasEntry[] = [];
    hadirOB.forEach(o => {
      daftar.push({
        key: `ob-${o.nama}`, nama: o.nama, tipe: "ob", foto: staffFotoMap[o.nama], aktif: true,
        sub: `OB · ${o.lokasi.join(", ") || "Standby"}`,
        label: "HADIR",
      });
    });
    securityShift.current.forEach(nama => {
      daftar.push({
        key: `sec-${nama}`, nama, tipe: "security", foto: staffFotoMap[nama], aktif: true,
        sub: `Security · ${securityShift.currentName}`,
        label: "JAGA",
      });
    });
    driverEntries.forEach(([nama, status]) => {
      const standby = status.includes("Standby");
      daftar.push({
        key: `drv-${nama}`, nama, tipe: "driver", foto: staffFotoMap[nama], aktif: !standby,
        sub: `Driver · ${standby ? "standby di pool" : "sedang bertugas keluar"}`,
        label: standby ? "STANDBY" : "KELUAR",
      });
    });
    return daftar;
  })();

  // ==========================================
  // TREN AKTIVITAS (7 hari terakhir) & KALENDER AKTIVITAS (bulan berjalan)
  // Sumber: data yang sudah ditarik dengan limit() di atas (bukan query baru tanpa batas) —
  // jujur soal keterbatasannya: kalau volume harian tinggi, hari-hari lebih lama di kalender bisa
  // belum kecover jendela limit(60)/limit(30), makanya ditandai "tidak ada data" bukan dianggap 0.
  // ==========================================
  const tanggalWITAdariTimestamp = (ts?: Timestamp | null) => {
    if (!ts) return null;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(ts.toDate());
  };

  const NAMA_HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  const trenAktivitas7Hari = useMemo(() => {
    const hari: { tanggal: string; label: string; tamu: number; kendaraan: number; tiket: number; paket: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const iso = geserTanggalISO(todayISO, -i);
      const [y, m, d] = iso.split("-").map(Number);
      hari.push({ tanggal: iso, label: NAMA_HARI_PENDEK[new Date(y, m - 1, d).getDay()], tamu: 0, kendaraan: 0, tiket: 0, paket: 0 });
    }
    const idxByTanggal: Record<string, number> = {};
    hari.forEach((h, i) => { idxByTanggal[h.tanggal] = i; });

    visitorLogsTrend.forEach(t => {
      const tgl = tanggalWITAdariTimestamp(t.waktu_masuk);
      if (tgl && idxByTanggal[tgl] !== undefined) hari[idxByTanggal[tgl]].tamu++;
    });
    logKendaraanMentah.forEach(k => {
      const tgl = tanggalWITAdariTimestamp(k.waktu_catat);
      if (tgl && idxByTanggal[tgl] !== undefined) hari[idxByTanggal[tgl]].kendaraan++;
    });
    ticketsTrend.forEach(t => {
      if (!t.status?.toLowerCase().includes("selesai")) return;
      const tgl = tanggalWITAdariTimestamp(t.waktu_lapor);
      if (tgl && idxByTanggal[tgl] !== undefined) hari[idxByTanggal[tgl]].tiket++;
    });
    packageLogsTrend.forEach(p => {
      const tgl = tanggalWITAdariTimestamp(p.waktu_diterima);
      if (tgl && idxByTanggal[tgl] !== undefined) hari[idxByTanggal[tgl]].paket++;
    });

    return hari;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayISO, visitorLogsTrend, logKendaraanMentah, ticketsTrend, packageLogsTrend]);

  const trenMaxNilai = useMemo(() => {
    let max = 1;
    trenAktivitas7Hari.forEach(h => { max = Math.max(max, h.tamu, h.kendaraan, h.tiket, h.paket); });
    return max;
  }, [trenAktivitas7Hari]);

  // Sengaja TANPA useMemo (lihat catatan di timBertugasHariIni di atas) — pola reduce+object-literal
  // ini yang bikin React Compiler gagal mempertahankan memoization manualnya di source.
  const trenTotal = trenAktivitas7Hari.reduce((acc, h) => ({
    tamu: acc.tamu + h.tamu, kendaraan: acc.kendaraan + h.kendaraan, tiket: acc.tiket + h.tiket, paket: acc.paket + h.paket
  }), { tamu: 0, kendaraan: 0, tiket: 0, paket: 0 });

  const kalenderAktivitas = useMemo(() => {
    const [thn, bln] = todayISO.split("-").map(Number);
    const jumlahHari = new Date(thn, bln, 0).getDate();
    const counts: Record<string, number> = {};
    const prefixBulan = todayISO.slice(0, 7);
    const tambah = (tgl: string | null) => { if (tgl && tgl.startsWith(prefixBulan)) counts[tgl] = (counts[tgl] || 0) + 1; };
    visitorLogsTrend.forEach(t => tambah(tanggalWITAdariTimestamp(t.waktu_masuk)));
    logKendaraanMentah.forEach(k => tambah(tanggalWITAdariTimestamp(k.waktu_catat)));
    ticketsTrend.forEach(t => tambah(tanggalWITAdariTimestamp(t.waktu_lapor)));
    packageLogsTrend.forEach(p => tambah(tanggalWITAdariTimestamp(p.waktu_diterima)));

    const nilaiTerbesar = Math.max(1, ...Object.values(counts));
    const daftarHari: { tanggal: number; iso: string; level: number; adaData: boolean; hariIni: boolean }[] = [];
    for (let d = 1; d <= jumlahHari; d++) {
      const iso = `${prefixBulan}-${String(d).padStart(2, "0")}`;
      const c = counts[iso] || 0;
      daftarHari.push({ tanggal: d, iso, level: c === 0 ? 0 : Math.min(4, Math.ceil((c / nilaiTerbesar) * 4)), adaData: c > 0, hariIni: iso === todayISO });
    }

    const hariPertama = new Date(thn, bln - 1, 1).getDay(); // 0=Minggu..6=Sabtu
    const leadingBlanks = hariPertama === 0 ? 6 : hariPertama - 1; // konversi ke kolom Senin..Minggu

    return { daftarHari, leadingBlanks };
  }, [todayISO, visitorLogsTrend, logKendaraanMentah, ticketsTrend, packageLogsTrend]);

  const WARNA_LEVEL_KALENDER = ["#f7f6f5", "#fee2e2", "#fca5a5", "#f87171", "#dc2626"];

  return (
    <div className="main-container" style={{ backgroundColor: "#f7f6f5", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>

      {/* 💡 DESIGN TOKENS + CSS — dashboard app-style: header ramping, ringkasan merah, menu cepat,
          tren aktivitas & kalender aktivitas, tim bertugas, bottom nav ala aplikasi native */}
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
          --shadow-card: 0 1px 2px rgba(24,24,27,0.04), 0 10px 24px -14px rgba(24,24,27,0.16);
          --shadow-card-hover: 0 1px 2px rgba(24,24,27,0.05), 0 18px 34px -14px rgba(220,38,38,0.28);
        }

        /* 🧭 HEADER */
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .brand-mark { display: flex; align-items: center; gap: 10px; }
        .brand-logo-fallback {
          width: 36px; height: 36px; border-radius: 10px; background: var(--red-600);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          box-shadow: 0 4px 10px -3px rgba(220,38,38,0.5); color: #fff; font-weight: 900; font-size: 16px;
        }
        .brand-name { font-size: 14px; font-weight: 800; color: var(--ink); letter-spacing: 0.2px; line-height: 1.15; }
        .brand-sub { font-size: 10.5px; color: var(--muted); font-weight: 600; letter-spacing: 0.2px; }
        /* 🔴 RINGKASAN HARI INI — pengganti hero slideshow lama, tetap merah + motif blueprint-grid */
        .ringkasan-strip {
          position: relative; overflow: hidden; border-radius: 22px; color: #fff; padding: 22px;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .ringkasan-strip::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .ringkasan-chip { flex: 1; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); border-radius: 14px; padding: 12px 10px; text-align: center; }

        /* 🧱 QUICK ACTION + KARTU */
        .qa-card {
          cursor: pointer; border-radius: 18px; background: var(--surface); border: 1px solid var(--line);
          box-shadow: var(--shadow-card); transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
          height: 100%;
        }
        /* Grid kolom TETAP (bukan auto-fit/minmax) — auto-fit bikin kartu terakhir yang sendirian
           di baris terakhir ikut melebar ngisi sisa kolom (gak proporsional sama kartu lain). */
        .menu-cepat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        @media (min-width: 640px) { .menu-cepat-grid { grid-template-columns: repeat(3, 1fr); } }
        .qa-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-card-hover); border-color: rgba(220,38,38,0.28); }
        .qa-icon-chip {
          width: 44px; height: 44px; border-radius: 13px; background: var(--red-50); color: var(--red-600);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .section-title { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
        .section-title-icon { background: var(--red-50); color: var(--red-600); padding: 10px; border-radius: 12px; display: flex; }
        .list-row {
          display: flex; gap: 12px; padding: 13px 15px; border-radius: 13px; background: var(--bg);
          border-left: 3px solid var(--line);
        }
        .team-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
        .team-avatar { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .team-avatar-fallback { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; }
        .status-op-row { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid #f0efee; }
        .status-op-row:last-child { border-bottom: none; }

        /* 📊 CHART BARS */
        .tren-bar-col { display: flex; align-items: flex-end; gap: 3px; height: 100%; flex: 1; justify-content: center; }
        .tren-bar { width: 6px; border-radius: 2px; min-height: 2px; }

        /* 🗓️ KALENDER AKTIVITAS */
        .kalender-cell { aspect-ratio: 1; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 13px; }
        @media (min-width: 480px) { .kalender-cell { font-size: 14px; } }

        /* 📱 BOTTOM NAV APP-STYLE */
        .app-bottom-nav { display: none; }
        .mobile-only { display: none; }
        .desktop-only-hide { display: block; height: 100%; }
        @media (max-width: 768px) {
          .main-container { padding-bottom: 108px !important; }
          .mobile-only { display: flex; }
          .desktop-only-hide { display: none; }
          .app-bottom-nav {
            display: flex; position: fixed; left: 14px; right: 14px; bottom: 14px; height: 66px;
            background: rgba(255,255,255,0.97); backdrop-filter: blur(14px); border: 1px solid var(--line);
            border-radius: 24px; box-shadow: 0 14px 32px -10px rgba(24,24,27,0.2); z-index: 90;
            align-items: center; justify-content: space-around; padding: 0 6px;
          }
          .nav-item { display: flex; flex-direction: column; align-items: center; gap: 3px; color: #a1a1aa; cursor: pointer; background: none; border: none; font-family: inherit; }
          .nav-item.active { color: var(--red-600); }
          .nav-item span { font-size: 9.5px; font-weight: 700; }
          .nav-fab { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(150deg, var(--red-600), var(--red-700)); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 20px -6px rgba(220,38,38,0.6); border: 4px solid var(--bg); transform: translateY(-16px); cursor: pointer; }
        }
      `}} />

      <div className="site-header">
        <div className="brand-mark">
          <div className="brand-logo-fallback">S</div>
          <div>
            <div className="brand-name">SIBM</div>
            <div className="brand-sub">{formatTgl}</div>
          </div>
        </div>
        <div className="desktop-only-hide" style={{ alignItems: "center", gap: "10px" }}>
          <Button
            variant="ghost"
            fullWidth={false}
            onClick={() => setActiveModal("login")}
            style={{ padding: "8px 14px", color: "var(--ink-soft)", fontSize: "12px", fontWeight: 700, border: "1px solid var(--line)", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <IconUserCircle size={15} /> Staf Internal
          </Button>
        </div>
      </div>

      {/* 📢 PENGUMUMAN GA */}
      {pengumumanGedung && (
        <div style={{ background: "var(--red-700)", color: "white", padding: "10px 20px", textAlign: "center", fontSize: "13px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
          <span>INFO GA:</span> {pengumumanGedung}
        </div>
      )}

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "20px 20px 40px" }}>

        {/* 🔴 RINGKASAN HARI INI */}
        <div className="ringkasan-strip">
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>Ringkasan Hari Ini</div>
              <div style={{ fontSize: "19px", fontWeight: 800, marginTop: "5px" }}>{maintenanceInfo ? "Ada perbaikan sedang berjalan" : "Semua operasional normal"}</div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <div className="ringkasan-chip">
                <div style={{ fontSize: "18px", fontWeight: 800 }}>{hadirOB.length}</div>
                <div style={{ fontSize: "9.5px", fontWeight: 700, color: "rgba(255,255,255,0.8)", marginTop: "2px" }}>OB &amp; CS Bertugas</div>
              </div>
              <div className="ringkasan-chip">
                <div style={{ fontSize: "18px", fontWeight: 800 }}>{mobilStatus.length}</div>
                <div style={{ fontSize: "9.5px", fontWeight: 700, color: "rgba(255,255,255,0.8)", marginTop: "2px" }}>Kendaraan Aktif</div>
              </div>
              <div className="ringkasan-chip">
                <div style={{ fontSize: "13px", fontWeight: 800 }}>{securityShift.currentName.split(" (")[0]}</div>
                <div style={{ fontSize: "9.5px", fontWeight: 700, color: "rgba(255,255,255,0.8)", marginTop: "2px" }}>{securityShift.currentName.match(/\(([^)]+)\)/)?.[1] || "Security"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 🧱 MENU CEPAT — satu grid dipakai HP & desktop, gantikan desktop-grid + mobile-nav lama yang isinya duplikat */}
        <div style={{ marginTop: "24px" }} id="menu-cepat-section">
          <div style={{ fontSize: "15px", fontWeight: 800, marginBottom: "12px", color: "var(--ink)" }}>Menu Cepat</div>
          <div className="menu-cepat-grid">
            <div className="qa-card" onClick={() => { setActiveModal("tamu"); setSearchQuery(""); setHasilTamu([]); }} style={{ padding: "18px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="qa-icon-chip"><IconIdCard size={20} /></div>
              <div><h2 style={{ margin: "0 0 2px 0", color: "var(--ink)", fontSize: "14px", fontWeight: 800 }}>Lacak Tamu</h2><p style={{ margin: 0, color: "var(--muted)", fontSize: "11px" }}>Cek pengunjung gedung</p></div>
            </div>
            <div className="qa-card" onClick={() => { setActiveModal("paket"); setSearchQuery(""); setHasilPaket([]); }} style={{ padding: "18px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="qa-icon-chip"><IconPackage size={20} /></div>
              <div><h2 style={{ margin: "0 0 2px 0", color: "var(--ink)", fontSize: "14px", fontWeight: 800 }}>Resi Paket</h2><p style={{ margin: 0, color: "var(--muted)", fontSize: "11px" }}>Lacak dokumen logistik</p></div>
            </div>
            {/* Request ATK, Kerusakan & Bahaya SBO disembunyikan di mobile (sudah ada shortcut sama persis di bottom-nav
                mobile: ATK, Kerusakan, FAB tengah) — di desktop TETAP MUNCUL karena gak ada bottom-nav sama sekali.
                Dibungkus wrapper terpisah (bukan taruh class toggle langsung di .qa-card) supaya display:flex
                bawaan .qa-card gak ketiban display:block/none dari class toggle-nya. */}
            <div className="desktop-only-hide">
              <div className="qa-card" onClick={() => { setActiveModal("atk"); setAtkTab("REQUEST"); }} style={{ padding: "18px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="qa-icon-chip"><IconClipboard size={20} /></div>
                <div><h2 style={{ margin: "0 0 2px 0", color: "var(--ink)", fontSize: "14px", fontWeight: 800 }}>Request ATK</h2><p style={{ margin: 0, color: "var(--muted)", fontSize: "11px" }}>Barang kantor ke GA</p></div>
              </div>
            </div>
            <div className="qa-card" onClick={() => setActiveModal("overtime")} style={{ padding: "18px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="qa-icon-chip"><IconClock size={20} /></div>
              <div><h2 style={{ margin: "0 0 2px 0", color: "var(--ink)", fontSize: "14px", fontWeight: 800 }}>Lembur AC</h2><p style={{ margin: 0, color: "var(--muted)", fontSize: "11px" }}>Request ruang lembur</p></div>
            </div>
            <div className="desktop-only-hide">
              <div className="qa-card" onClick={() => { setActiveModal("helpdesk"); setHelpdeskTab("LAPOR"); }} style={{ padding: "18px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="qa-icon-chip"><IconWrench size={20} /></div>
                <div><h2 style={{ margin: "0 0 2px 0", color: "var(--ink)", fontSize: "14px", fontWeight: 800 }}>Kerusakan</h2><p style={{ margin: 0, color: "var(--muted)", fontSize: "11px" }}>Lapor fasilitas rusak</p></div>
              </div>
            </div>
            <div className="desktop-only-hide">
              <div className="qa-card" onClick={() => setActiveModal("sbo")} style={{ padding: "18px", display: "flex", alignItems: "center", gap: "12px", borderColor: "rgba(220,38,38,0.35)" }}>
                <div className="qa-icon-chip" style={{ background: "var(--red-600)", color: "#fff" }}><IconAlertTriangle size={20} /></div>
                <div><h2 style={{ margin: "0 0 2px 0", color: "var(--red-700)", fontSize: "14px", fontWeight: 800 }}>Bahaya SBO</h2><p style={{ margin: 0, color: "var(--red-600)", fontSize: "11px", fontWeight: 700 }}>Temuan kondisi darurat</p></div>
              </div>
            </div>
          </div>
        </div>

        {/* 📊 TREN AKTIVITAS GEDUNG */}
        <div id="tren-aktivitas-section">
        <Card style={{ borderRadius: "20px", marginTop: "22px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "var(--ink)" }}>Tren Aktivitas Gedung</h3>
            <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>7 hari terakhir</span>
          </div>
          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--ok)" }} /><span style={{ fontSize: "10.5px", color: "var(--ink-soft)", fontWeight: 600 }}>Tamu</span><span style={{ fontSize: "10.5px", color: "var(--ink)", fontWeight: 800 }}>{trenTotal.tamu}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--info)" }} /><span style={{ fontSize: "10.5px", color: "var(--ink-soft)", fontWeight: 600 }}>Kendaraan</span><span style={{ fontSize: "10.5px", color: "var(--ink)", fontWeight: 800 }}>{trenTotal.kendaraan}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--warn)" }} /><span style={{ fontSize: "10.5px", color: "var(--ink-soft)", fontWeight: 600 }}>Tiket Selesai</span><span style={{ fontSize: "10.5px", color: "var(--ink)", fontWeight: 800 }}>{trenTotal.tiket}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)" }} /><span style={{ fontSize: "10.5px", color: "var(--ink-soft)", fontWeight: 600 }}>Paket</span><span style={{ fontSize: "10.5px", color: "var(--ink)", fontWeight: 800 }}>{trenTotal.paket}</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", height: "110px", borderBottom: "1px solid var(--line)", paddingBottom: "8px" }}>
            {trenAktivitas7Hari.map((h) => (
              <div className="tren-bar-col" key={h.tanggal} title={`${h.label}: ${h.tamu} tamu, ${h.kendaraan} kendaraan, ${h.tiket} tiket, ${h.paket} paket`}>
                <div className="tren-bar" style={{ height: `${Math.max(2, (h.tamu / trenMaxNilai) * 100)}%`, background: "var(--ok)" }} />
                <div className="tren-bar" style={{ height: `${Math.max(2, (h.kendaraan / trenMaxNilai) * 100)}%`, background: "var(--info)" }} />
                <div className="tren-bar" style={{ height: `${Math.max(2, (h.tiket / trenMaxNilai) * 100)}%`, background: "var(--warn)" }} />
                <div className="tren-bar" style={{ height: `${Math.max(2, (h.paket / trenMaxNilai) * 100)}%`, background: "var(--accent)" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: "8px" }}>
            {trenAktivitas7Hari.map((h, idx) => (
              <span key={h.tanggal} style={{ flex: 1, textAlign: "center", fontSize: "10px", fontWeight: idx === 6 ? 800 : 600, color: idx === 6 ? "var(--red-600)" : "#a1a1aa" }}>{h.label}</span>
            ))}
          </div>
        </Card>
        </div>

        {/* 🗓️ KALENDER AKTIVITAS */}
        <Card style={{ borderRadius: "20px", marginTop: "18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "var(--ink)" }}>Kalender Aktivitas</h3>
            <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>{new Date(thnW, blnW - 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px", marginBottom: "6px" }}>
            {["S", "S", "R", "K", "J", "S", "M"].map((h, idx) => <span key={idx} style={{ fontSize: "9px", color: "#a1a1aa", fontWeight: 700, textAlign: "center" }}>{h}</span>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
            {Array.from({ length: kalenderAktivitas.leadingBlanks }).map((_, idx) => <div key={`blank-${idx}`} />)}
            {kalenderAktivitas.daftarHari.map((h) => (
              <div
                key={h.iso}
                className="kalender-cell"
                title={h.adaData ? `Tanggal ${h.tanggal}: ada aktivitas` : `Tanggal ${h.tanggal}: belum ada data`}
                style={{
                  background: WARNA_LEVEL_KALENDER[h.level],
                  border: h.adaData ? "none" : "1px dashed var(--line)",
                  boxShadow: h.hariIni ? "0 0 0 2px #fff, 0 0 0 3.5px var(--ink)" : "none",
                  color: h.level >= 3 ? "#fff" : h.hariIni ? "var(--red-600)" : "var(--ink-soft)",
                  fontWeight: h.hariIni ? 800 : 700,
                }}
              >
                {h.tanggal}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", marginTop: "14px" }}>
            <span style={{ fontSize: "9px", color: "#a1a1aa", fontWeight: 600 }}>Rendah</span>
            <div style={{ display: "flex", gap: "2px" }}>
              {WARNA_LEVEL_KALENDER.slice(1).map((c, idx) => <div key={idx} style={{ width: "12px", height: "12px", borderRadius: "3px", background: c }} />)}
            </div>
            <span style={{ fontSize: "9px", color: "#a1a1aa", fontWeight: 600 }}>Tinggi</span>
          </div>
        </Card>

        {/* 👥 TIM BERTUGAS HARI INI */}
        <div style={{ marginTop: "22px" }}>
          <div className="section-title">
            <div className="section-title-icon"><IconShield size={18} /></div>
            <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", fontWeight: 800 }}>Tim Bertugas Hari Ini</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {timBertugasHariIni.length > 0 ? timBertugasHariIni.map((t) => {
              const warna = t.tipe === "ob" ? { fg: "var(--red-600)", bg: "var(--red-50)" } : t.tipe === "security" ? { fg: "var(--info)", bg: "var(--info-50)" } : { fg: t.aktif ? "var(--warn)" : "var(--ok)", bg: t.aktif ? "var(--warn-50)" : "var(--ok-50)" };
              return (
                <div className="team-row" key={t.key}>
                  {t.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.foto} alt={t.nama} className="team-avatar" />
                  ) : (
                    <div className="team-avatar-fallback" style={{ background: warna.bg, color: warna.fg }}>{getInitials(t.nama)}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>{t.nama}</div>
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "1px" }}>{t.sub}</div>
                  </div>
                  <span style={{ fontSize: "9.5px", fontWeight: 800, color: warna.fg, background: warna.bg, padding: "4px 9px", borderRadius: "20px", flexShrink: 0 }}>{t.label}</span>
                </div>
              );
            }) : (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)", fontSize: "13px", border: "1px dashed var(--line)", borderRadius: "14px" }}>Belum ada staf yang terplot bertugas hari ini.</div>
            )}
          </div>
        </div>

        {/* 🌙 PLOT BESOK — cuma tampil setelah jam 20:00 WITA, biar staf/GA bisa lihat plotting besok dari malam ini */}
        {sudahMalam && obBesok.length > 0 && (
          <div style={{ marginTop: "14px", background: "var(--bg)", border: "1px dashed var(--line)", borderRadius: "16px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 800, color: "var(--ink-soft)", marginBottom: "8px" }}>
              <IconChevronRight size={14} color="var(--muted)" /> Plot Besok ({obBesok.length} OB &amp; CS terjadwal)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {obBesok.map((o) => (
                <span key={o.nama} title={o.lokasi.join(", ") || "Standby"} style={{ fontSize: "11px", fontWeight: 700, color: "var(--ink-soft)", background: "var(--surface)", border: "1px solid var(--line)", padding: "6px 12px", borderRadius: "20px" }}>{o.nama}</span>
              ))}
            </div>
          </div>
        )}

        {/* ⚙️ STATUS OPERASIONAL (ringkas) */}
        <Card style={{ borderRadius: "20px", marginTop: "18px", padding: "6px 20px" }}>
          <div className="status-op-row">
            <div className="section-title-icon" style={{ background: "var(--info-50)", color: "var(--info)", margin: 0, padding: "9px" }}><IconTruck size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)" }}>Status Armada</div>
              <div style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "1px" }}>{mobilStatus.filter(m => isStandbyLabel(m.status_kendaraan)).length} dari {mobilStatus.length} kendaraan standby</div>
            </div>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--ok)", flexShrink: 0 }} />
          </div>
          <div className="status-op-row">
            <div className="section-title-icon" style={{ background: "var(--ok-50)", color: "var(--ok)", margin: 0, padding: "9px" }}><IconWrench size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)" }}>Maintenance Gedung</div>
              <div style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "1px" }}>{maintenanceInfo || "Tidak ada perbaikan berjalan"}</div>
            </div>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: maintenanceInfo ? "var(--warn)" : "var(--ok)", flexShrink: 0 }} />
          </div>
          <div className="status-op-row">
            <div className="section-title-icon" style={{ background: "var(--warn-50)", color: "var(--warn)", margin: 0, padding: "9px" }}><IconClock size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)" }}>Overtime Minggu Ini</div>
              <div style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "1px" }}>{overtimeMingguIni.length} pengajuan &middot; {seninMingguIni.split("-").reverse().join("/")}-{mingguMingguIni.split("-").reverse().join("/")}</div>
            </div>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: overtimeMingguIni.length > 0 ? "var(--warn)" : "var(--ok)", flexShrink: 0 }} />
          </div>
        </Card>

        {/* 🚗 DETAIL RIWAYAT ARMADA + ⏱️ OVERTIME MINGGU INI (kartu detail, tetap dipertahankan dari versi lama) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "18px", marginTop: "18px" }}>

          <Card style={{ borderRadius: "18px" }}>
            <div className="section-title">
              <div className="section-title-icon"><IconTruck size={18} /></div>
              <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", fontWeight: "800" }}>Riwayat Armada Operasional</h3>
            </div>
            {mobilStatus.length > 0 && (
              <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "14px", marginBottom: "4px" }}>
                {mobilStatus.map((k) => {
                  const isBengkel = k.status_kendaraan?.includes("Bengkel") || k.status_kendaraan?.includes("Service");
                  const standby = !isBengkel && isStandbyLabel(k.status_kendaraan);
                  const statusColor = isBengkel ? "#a1a1aa" : standby ? "var(--ok)" : "var(--red-600)";
                  return (
                    <div key={k.kendaraan} title={`${k.kendaraan} — ${k.status_kendaraan}`} style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", width: "58px" }}>
                      <div style={{ width: "46px", height: "46px", borderRadius: "14px", border: `2px solid ${statusColor}`, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <VehicleIcon3D jenis={kendaraanMetaMap[k.kendaraan]?.kategori} warna={kendaraanMetaMap[k.kendaraan]?.warna} size={24} />
                      </div>
                      <div style={{ fontSize: "9px", fontWeight: 800, color: "var(--ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "56px" }}>{k.kendaraan}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto", paddingRight: "5px" }}>
              {logKendaraanMentah.length > 0 ? logKendaraanMentah.map((log, idx) => {
                const keluar = log.status_kendaraan?.toLowerCase().includes("keluar");
                return (
                  <div key={idx} className="list-row" style={{ borderLeftColor: keluar ? "var(--red-600)" : "#22c55e" }}>
                    <div style={{ minWidth: "68px", flexShrink: 0, fontWeight: "700", color: "var(--ink-soft)", fontSize: "12px" }}>{formatJam(log.waktu_catat)}</div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: "13px", color: "var(--ink-soft)", wordBreak: "break-word" }}>{buatKalimatRiwayat(log)}</div>
                  </div>
                );
              }) : <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "14px", border: "1px dashed var(--line)", borderRadius: "12px" }}>Belum ada riwayat kendaraan tercatat.</div>}
            </div>
          </Card>

          <Card style={{ borderRadius: "18px" }}>
            <div className="section-title">
              <div className="section-title-icon"><IconClock size={18} /></div>
              <div>
                <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", fontWeight: "800" }}>Overtime Gedung (Minggu Ini)</h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "var(--muted)" }}>{seninMingguIni.split("-").reverse().join("/")} - {mingguMingguIni.split("-").reverse().join("/")} — langsung tercatat, tinggal direkap untuk tagihan</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "350px", overflowY: "auto", paddingRight: "5px" }}>
              {overtimeMingguIni.length > 0 ? overtimeMingguIni.map((ot, idx) => {
                const isHariIni = ot.tanggal === todayISO;
                return (
                  <div key={idx} className="list-row" style={{ flexDirection: "column", gap: "8px", borderLeftColor: isHariIni ? "var(--red-600)" : "var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
                      <span style={{ fontWeight: "800", color: "var(--ink)", fontSize: "14px", flex: 1 }}>{ot.area_ruangan}</span>
                      <Badge tone={isHariIni ? "warning" : "neutral"} style={{ marginLeft: "10px" }}>{isHariIni ? "Hari Ini" : ot.tanggal.split("-").reverse().join("/")}</Badge>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--ink-soft)" }}>{ot.nama_pemohon} ({ot.departemen})</div>
                    <div style={{ fontSize: "13px", color: "var(--red-700)", fontWeight: "bold", background: "var(--red-50)", padding: "6px 10px", borderRadius: "8px", display: "inline-block", width: "fit-content" }}>{ot.jam_mulai} s/d {ot.jam_selesai}</div>
                  </div>
                );
              }) : (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", background: "var(--bg)", borderRadius: "16px", border: "1px dashed var(--line)" }}>
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "var(--ink-soft)" }}>Tidak Ada Lembur</div>
                  <div style={{ fontSize: "12px", marginTop: "5px" }}>Belum ada overtime tercatat minggu ini.</div>
                </div>
              )}
            </div>
          </Card>

        </div>
      </div>

      {/* 📱 BOTTOM NAV APP-STYLE (HANYA MUNCUL DI HP) */}
      <div className="app-bottom-nav">
        <button className="nav-item active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <IconHome size={21} />
          <span>Home</span>
        </button>
        <button className="nav-item" onClick={() => { setActiveModal("helpdesk"); setHelpdeskTab("LAPOR"); }}>
          <IconWrench size={21} />
          <span>Kerusakan</span>
        </button>
        <div className="nav-fab" onClick={() => setActiveModal("sbo")} role="button" aria-label="Lapor Bahaya (SBO)">
          <IconAlertTriangle size={22} color="#fff" />
        </div>
        <button className="nav-item" onClick={() => { setActiveModal("atk"); setAtkTab("REQUEST"); }}>
          <IconClipboard size={21} />
          <span>ATK</span>
        </button>
        <button className="nav-item" onClick={() => setActiveModal("login")}>
          <IconUserCircle size={21} />
          <span>Profil</span>
        </button>
      </div>

      {/* MODAL WRAPPER (via komponen Modal) */}
      <Modal
        open={activeModal !== "none"}
        onClose={() => setActiveModal("none")}
        maxWidth={(activeModal === "tamu" || activeModal === "paket" || activeModal === "sbo") ? "800px" : "550px"}
      >
        {/* MODAL 1: LOGIN */}
        {activeModal === "login" && (
          <>
            <div style={{ textAlign: "center", marginBottom: "25px", marginTop: "10px" }}><div style={{ fontSize: "45px", marginBottom: "15px" }}>🏢</div><h2 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "22px", fontWeight: "800" }}>Akses Staf Internal</h2></div>
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Anda" />
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Kata Sandi" />
              <Button type="submit" loading={isLoginLoading} loadingText="Memeriksa..." variant="primary">Masuk Dashboard</Button>
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
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

                {/* PENCARIAN PRODUK */}
                <Input
                  type="text"
                  placeholder="🔍 Cari alat tulis kantor..."
                  value={searchAtkProduk}
                  onChange={(e) => setSearchAtkProduk(e.target.value)}
                />

                {/* KATALOG PRODUK (GRID ALA TOKO ONLINE) */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px", maxHeight: "280px", overflowY: "auto", padding: "4px" }}>
                  {masterAtkList
                    .filter(p => p.nama_barang.toLowerCase().includes(searchAtkProduk.toLowerCase()))
                    .map((produk) => (
                      <div key={produk.id} style={{ border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", background: "white", display: "flex", flexDirection: "column" }}>
                        <div style={{ width: "100%", aspectRatio: "1", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {produk.foto_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={produk.foto_url} alt={produk.nama_barang} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span style={{ fontSize: "28px", opacity: 0.3 }}>🖇️</span>
                          )}
                        </div>
                        <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                          <span style={{ fontSize: "11px", fontWeight: "bold", color: "#2d3748", lineHeight: "1.3" }}>{produk.nama_barang}</span>
                          <button
                            type="button"
                            onClick={() => handleTambahKeKeranjang(produk)}
                            style={{ marginTop: "auto", background: "#d53f8c", color: "white", border: "none", borderRadius: "8px", padding: "6px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}
                          >
                            + Keranjang
                          </button>
                        </div>
                      </div>
                    ))}
                  {masterAtkList.filter(p => p.nama_barang.toLowerCase().includes(searchAtkProduk.toLowerCase())).length === 0 && (
                    <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "20px", color: "#a0aec0", fontSize: "13px" }}>Barang tidak ditemukan.</div>
                  )}
                </div>

                {/* KERANJANG */}
                <div style={{ borderTop: "2px solid #edf2f7", paddingTop: "15px" }}>
                  <div style={{ fontWeight: "800", fontSize: "14px", color: "#1a202c", marginBottom: "10px" }}>
                    🛒 Keranjang ({formAtkItems.length} item)
                  </div>
                  {formAtkItems.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px", color: "#a0aec0", fontSize: "13px", border: "1px dashed #cbd5e0", borderRadius: "12px" }}>
                      Keranjang masih kosong. Pilih barang di atas.
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitAtk} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {formAtkItems.map((item, index) => (
                        <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid #e2e8f0", padding: "8px 10px", borderRadius: "10px", background: "#f8fafc" }}>
                          <span style={{ flex: "1 1 35%", fontSize: "12px", fontWeight: "bold", color: "#2d3748", lineHeight: "1.3" }}>{item.nama_barang}</span>
                          <input
                            type="text" required placeholder="Jml"
                            value={item.jumlah}
                            onChange={(e) => handleAtkItemChange(index, "jumlah", e.target.value)}
                            style={{ width: "44px", padding: "7px 4px", borderRadius: "7px", border: "1px solid #cbd5e0", fontSize: "12px", textAlign: "center", background: "white", outline: "none" }}
                          />
                          <input
                            type="text" placeholder="Catatan (opsional)"
                            value={item.deskripsi}
                            onChange={(e) => handleAtkItemChange(index, "deskripsi", e.target.value)}
                            style={{ flex: "1 1 40%", padding: "7px 8px", borderRadius: "7px", border: "1px solid #cbd5e0", fontSize: "12px", background: "white", outline: "none" }}
                          />
                          <button type="button" onClick={() => handleRemoveAtkItem(index)} style={{ flexShrink: 0, background: "none", border: "none", color: "#e53e3e", fontSize: "16px", cursor: "pointer", padding: "2px 4px" }}>✖</button>
                        </div>
                      ))}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginTop: "5px" }}>
                        <Input
                          label="Nama Pemohon *"
                          type="text" required placeholder="Ketik nama..."
                          value={formAtkPemohon.nama}
                          onChange={(e) => handleNameChangeAtk(e.target.value)}
                          datalistId="emp-list-atk"
                          datalistOptions={employees.map(emp => emp.nama)}
                        />
                        <Input label="Departemen" type="text" required readOnly value={formAtkPemohon.dept} style={{ background: "#e2e8f0" }} />
                      </div>

                      <Button type="submit" variant="primary" loading={isAtkLoading} loadingText="Memproses..." style={{ background: isAtkLoading ? undefined : "#d53f8c", boxShadow: isAtkLoading ? undefined : "0 10px 15px -3px rgba(213,63,140,0.3)" }}>
                        Kirim Request ({formAtkItems.length} item)
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                  <Input containerStyle={{ flex: 1 }} type="text" placeholder="Masukkan Kode Resi (Cth: ATK-2606-1234)..." value={searchAtkResi} onChange={(e) => setSearchAtkResi(e.target.value)} style={{ textTransform: "uppercase" }} />
                  <Button type="button" fullWidth={false} loading={isAtkLoading} loadingText="..." onClick={() => handleCariAtk()} style={{ background: "#d53f8c" }}>Cari</Button>
                </div>
                {hasilAtk ? (
                  <div style={{ background: "#fdf4ff", border: "1px solid #fbb6ce", padding: "20px", borderRadius: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px", borderBottom: "1px solid #fed7e2", paddingBottom: "10px" }}>
                      <span style={{ fontWeight: "900", color: "#97266d", fontSize: "18px" }}>📦 {hasilAtk.resi}</span>
                      <Badge tone={hasilAtk.status.includes("Selesai") ? "success" : "warning"}>{hasilAtk.status.toUpperCase()}</Badge>
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
              <Input
                label="Nama Penanggung Jawab *"
                type="text" required placeholder="Ketik nama Anda..."
                value={formOvertime.nama}
                onChange={(e) => handleNameChangeOvertime(e.target.value)}
                datalistId="emp-list-ot"
                datalistOptions={employees.map(emp => emp.nama)}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                <Input label="Departemen / Tenant" type="text" required readOnly value={formOvertime.dept} style={{ background: "#e2e8f0" }} />
                <Input label="Tanggal Lembur *" type="date" required value={formOvertime.tanggal} onChange={(e) => setFormOvertime({ ...formOvertime, tanggal: e.target.value })} />
              </div>
              <Input label="Area / Ruangan yang Digunakan *" type="text" required placeholder="Misal: Ruang Meeting Lt.2 / Seluruh Lantai 3" value={formOvertime.area} onChange={(e) => setFormOvertime({ ...formOvertime, area: e.target.value })} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                <Input label="Jam Mulai *" type="time" required value={formOvertime.jam_mulai} onChange={(e) => setFormOvertime({ ...formOvertime, jam_mulai: e.target.value })} />
                <Input label="Jam Selesai *" type="time" required value={formOvertime.jam_selesai} onChange={(e) => setFormOvertime({ ...formOvertime, jam_selesai: e.target.value })} />
              </div>
              <Textarea label="Keperluan *" required placeholder="Jelaskan alasan lembur..." value={formOvertime.alasan} onChange={(e) => setFormOvertime({ ...formOvertime, alasan: e.target.value })} style={{ minHeight: "60px" }} />
              <div style={{ fontSize: "11px", color: "#d69e2e", background: "#fffff0", padding: "10px", borderRadius: "8px", border: "1px solid #fefcbf", marginTop: "5px" }}><b>Perhatian:</b> Data ini langsung tercatat (tanpa approval) dan akan masuk rekap tagihan departemen/tenant sesuai tarif yang berlaku — pastikan tanggal dan jam sudah benar.</div>
              <Button type="submit" loading={isOvertimeLoading} loadingText="Mengirim..." style={{ background: isOvertimeLoading ? undefined : "#d69e2e", boxShadow: isOvertimeLoading ? undefined : "0 10px 15px -3px rgba(214,158,46,0.3)", marginTop: "10px" }}>
                Submit Permintaan Overtime
              </Button>
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
              <Input containerStyle={{ flex: 1 }} type="text" placeholder={activeModal === "tamu" ? "Ketik nama tamu / instansi..." : "Ketik nama penerima paket..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <Button type="button" fullWidth={false} loading={isSearching} loadingText="..." onClick={activeModal === "tamu" ? handleCariTamu : handleCariPaket} style={{ background: activeModal === "tamu" ? "#e53e3e" : "#dd6b20" }}>Cari</Button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {activeModal === "tamu" ? (
                <Table>
                  <THead>
                    <Tr><Th>Identitas</Th><Th>Tujuan</Th><Th>Waktu Log</Th></Tr>
                  </THead>
                  <TBody>
                    {hasilTamu.length > 0 ? hasilTamu.map(t => (
                      <Tr key={t.id}>
                        <Td><div style={{ fontWeight: "bold", color: "#2d3748" }}>{t.nama}</div><div style={{ fontSize: "11px", color: "#718096" }}>{t.instansi_dept}</div></Td>
                        <Td style={{ color: "#4a5568" }}>{t.tujuan}</Td>
                        <Td><div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "2px" }}><span><b style={{color: "#38a169"}}>In:</b> {formatJam(t.waktu_masuk)}</span><span><b style={{color: "#e53e3e"}}>Out:</b> {t.waktu_keluar ? formatJam(t.waktu_keluar) : "Di Dalam"}</span></div></Td>
                      </Tr>
                    )) : <Tr><Td colSpan={3} style={{ textAlign: "center", padding: "40px", color: "#a0aec0" }}>Tidak ada riwayat ditemukan.</Td></Tr>}
                  </TBody>
                </Table>
              ) : (
                <Table>
                  <THead>
                    <Tr><Th>Penerima</Th><Th>Kurir</Th><Th>Tiba</Th><Th>Status</Th></Tr>
                  </THead>
                  <TBody>
                    {hasilPaket.length > 0 ? hasilPaket.map(p => (
                      <Tr key={p.id}>
                        <Td style={{ fontWeight: "bold", color: "#2d3748" }}>{p.penerima}</Td>
                        <Td style={{ color: "#718096" }}>{p.kurir}</Td>
                        <Td style={{ color: "#4a5568", fontSize: "12px" }}>{formatJam(p.waktu_diterima)}</Td>
                        <Td><Badge tone={p.status.includes("Diambil") ? "success" : "warning"}>{p.status}</Badge></Td>
                      </Tr>
                    )) : <Tr><Td colSpan={4} style={{ textAlign: "center", padding: "40px", color: "#a0aec0" }}>Tidak ada riwayat ditemukan.</Td></Tr>}
                  </TBody>
                </Table>
              )}
            </div>
          </div>
        )}

        {/* MODAL 6: SBO */}
        {activeModal === "sbo" && (
          <form onSubmit={handleSubmitSbo} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ marginBottom: "10px", paddingRight: "30px", borderBottom: "2px solid #edf2f7", paddingBottom: "20px" }}>
              <h2 style={{ margin: "0 0 8px 0", color: "#22543d", fontSize: "20px", display: "flex", alignItems: "center", gap: "10px", fontWeight: "800" }}>
                <span style={{background:"#c6f6d5", padding:"8px", borderRadius:"12px"}}>🦺</span> Lapor Bahaya (SBO)
              </h2>
              <p style={{ margin: 0, color: "#718096", fontSize: "13px", lineHeight: "1.5" }}>Laporan IK-QHSE-SML-001. Laporkan temuan kondisi fisik atau perilaku kerja yang berbahaya di area operasional.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <Input
                label="Nama Pelapor *"
                type="text" required placeholder="Ketik nama Anda..."
                value={formSbo.nama_pelapor}
                onChange={(e) => handleNameChangeSbo(e.target.value)}
                datalistId="emp-list-sbo"
                datalistOptions={employees.map(emp => emp.nama)}
              />
              <Input label="Tanggal Kejadian *" type="date" required value={formSbo.tanggal_kejadian} onChange={(e) => setFormSbo({ ...formSbo, tanggal_kejadian: e.target.value })} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <Input label="Unit Bisnis / Departemen *" type="text" required readOnly placeholder="Terisi otomatis dari Nama Pelapor..." value={formSbo.unit_bisnis} style={{ background: "#e2e8f0" }} />
              <Input label="Lokasi Temuan *" type="text" required placeholder="Cth: Area Parkir Basement" value={formSbo.lokasi} onChange={(e) => setFormSbo({ ...formSbo, lokasi: e.target.value })} />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "6px", display: "block" }}>Kategori Temuan *</label>
              <select required value={formSbo.kategori_temuan} onChange={(e) => setFormSbo({ ...formSbo, kategori_temuan: e.target.value })} style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", fontWeight: "bold", color: "#2d3748", background: "#f8fafc", outline: "none", cursor: "pointer", boxSizing: "border-box" }}>
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

            <Textarea label="Detail Temuan / Isu *" required placeholder="Jelaskan secara spesifik bahaya yang ditemukan..." value={formSbo.detail_temuan} onChange={(e) => setFormSbo({ ...formSbo, detail_temuan: e.target.value })} style={{ minHeight: "80px" }} />
            <Input label="Apa Penyebab Temuan Tersebut? *" type="text" required placeholder="Cth: Genangan air hujan, kelalaian pekerja..." value={formSbo.penyebab} onChange={(e) => setFormSbo({ ...formSbo, penyebab: e.target.value })} />
            <Input label="Tindakan Pengamanan (Save Action) *" type="text" required placeholder="Cth: Memasang rambu peringatan lantai licin" value={formSbo.action_taken} onChange={(e) => setFormSbo({ ...formSbo, action_taken: e.target.value })} />

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "15px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "13px", fontWeight: "bold", color: "#2d3748" }}>Status Temuan Saat Ini:</label>
              <select required value={formSbo.status_temuan} onChange={(e) => setFormSbo({ ...formSbo, status_temuan: e.target.value })} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "13px", fontWeight: "bold", color: formSbo.status_temuan === "Open" ? "#e53e3e" : "#38a169", outline: "none", cursor: "pointer", background: "white" }}>
                <option value="Open">🔴 OPEN (Masih Berbahaya)</option>
                <option value="Close">🟢 CLOSE (Sudah Aman)</option>
              </select>
            </div>

            {formSbo.kategori_temuan.includes("Unsafe Act") && (
              <div style={{ background: "#fff5f5", border: "1px solid #fed7d7", padding: "20px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "12px", fontWeight: "800", color: "#c53030", letterSpacing: "0.5px" }}>[ WAJIB UNTUK UNSAFE ACT ]</div>
                <Input label="Komitmen Pelaku Kedepan?" type="text" required placeholder="Komitmen dari pelanggar..." value={formSbo.komitmen_pelaku} onChange={(e) => setFormSbo({ ...formSbo, komitmen_pelaku: e.target.value })} style={{ background: "white" }} />
                <Input label="Konsekuensi Jika Mengulangi?" type="text" required placeholder="Cth: Diberi teguran lisan / SP1..." value={formSbo.konsekuensi} onChange={(e) => setFormSbo({ ...formSbo, konsekuensi: e.target.value })} style={{ background: "white" }} />
              </div>
            )}

            <div style={{ background: fotoSbo ? "#f0fff4" : "#f8fafc", border: fotoSbo ? "2px solid #9ae6b4" : "2px dashed #cbd5e0", padding: "25px 20px", borderRadius: "16px", textAlign: "center", transition: "0.2s", marginTop: "10px" }}>
              <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "35px", filter: fotoSbo ? "none" : "grayscale(100%) opacity(0.6)" }}>📸</span>
                <div style={{ fontSize: "14px", fontWeight: "bold", color: fotoSbo ? "#22543d" : "#4a5568" }}>{fotoSbo ? "Foto Temuan Terlampir ✓" : "Unggah Bukti Foto Temuan (Wajib) *"}</div>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, setFotoSbo)} style={{ display: "none" }} required={!fotoSbo} />
              </label>
              {isUploadingFoto ? (
                <div style={{ fontSize: "13px", fontWeight: "bold", color: "#d69e2e" }}>⏳ Mengunggah foto...</div>
              ) : fotoSbo && (
                <div style={{marginTop: "15px", position: "relative", display: "inline-block"}}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoSbo} alt="Bukti Bahaya" style={{ width: "100%", maxHeight: "180px", objectFit: "cover", borderRadius: "10px", border: "1px solid #c6f6d5", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} />
                  <button type="button" onClick={() => setFotoSbo("")} style={{position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "white", border: "none", width: "25px", height: "25px", borderRadius: "50%", cursor: "pointer", fontSize: "12px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)"}}>✖</button>
                </div>
              )}
            </div>

            <Button type="submit" loading={isSboLoading} loadingText="Memproses Laporan..." style={{ background: isSboLoading ? undefined : "#2f855a", boxShadow: isSboLoading ? undefined : "0 10px 15px -3px rgba(47, 133, 90, 0.3)", marginTop: "15px" }}>
              Kirim Form SBO
            </Button>
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
                <Input
                  label="Nama Pelapor *"
                  type="text" required
                  value={formHelpdesk.nama}
                  onChange={(e) => handleNameChangeHelpdesk(e.target.value)}
                  datalistId="emp-list"
                  datalistOptions={employees.map(emp => emp.nama)}
                />
                <Input label="Titik Lokasi *" type="text" required value={formHelpdesk.lokasi} onChange={(e) => setFormHelpdesk({ ...formHelpdesk, lokasi: e.target.value })} />
                <Textarea label="Deskripsi Masalah *" required value={formHelpdesk.deskripsi} onChange={(e) => setFormHelpdesk({ ...formHelpdesk, deskripsi: e.target.value })} style={{ minHeight: "60px" }} />
                <div style={{ background: fotoAwal ? "#ebf8ff" : "#f8fafc", border: fotoAwal ? "2px solid #90cdf4" : "2px dashed #cbd5e0", padding: "20px", borderRadius: "16px", textAlign: "center" }}>
                  <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}><span style={{ fontSize: "35px" }}>📸</span><div style={{ fontSize: "14px", fontWeight: "bold", color: "#4a5568" }}>Unggah Foto Kerusakan *</div><input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, setFotoAwal)} style={{ display: "none" }} required={!fotoAwal} /></label>
                  {isUploadingFoto ? (
                    <div style={{ fontSize: "13px", fontWeight: "bold", color: "#d69e2e", marginTop: "10px" }}>⏳ Mengunggah foto...</div>
                  ) : fotoAwal && (
                    <div style={{marginTop: "15px"}}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotoAwal} alt="Awal" style={{ width: "100%", maxHeight: "150px", objectFit: "cover", borderRadius: "10px" }} />
                      <button type="button" onClick={() => setFotoAwal("")} style={{background: "#e53e3e", color: "white", padding: "5px", borderRadius: "50%", marginTop: "5px"}}>✖</button>
                    </div>
                  )}
                </div>
                <Button type="submit" loading={isHelpdeskLoading} loadingText="Mengunggah...">Kirim Laporan</Button>
              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                  <Input containerStyle={{ flex: 1 }} type="text" placeholder="Cari nama..." value={searchHelpdeskName} onChange={(e) => setSearchHelpdeskName(e.target.value)} />
                  <Button type="button" fullWidth={false} loading={isSearchingHelpdesk} loadingText="..." onClick={handleCariHelpdesk}>Cari</Button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "15px" }}>
                  {hasilHelpdesk.length > 0 ? hasilHelpdesk.map((tiket) => (
                    <div key={tiket.id} style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "15px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                        <span style={{ fontWeight: "800", fontSize: "14px" }}>📍 {tiket.lokasi}</span>
                        <Badge tone="warning">{tiket.status}</Badge>
                      </div>
                      <div style={{ fontSize: "13px", color: "#4a5568" }}>{tiket.deskripsi}</div>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "30px", color: "#a0aec0" }}>Hasil pencarian tiket akan muncul di sini.</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
