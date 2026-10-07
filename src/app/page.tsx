"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { hitungShiftSesi, waktuWITASekarang } from "../lib/shift";
import { type PengumumanGedung, dalamTanggalTayang, urutkanPengumuman } from "../lib/pengumuman";
import PengumumanCarousel from "../components/PengumumanCarousel";
import { FITUR_ABSENSI_AKTIF } from "../lib/fitur";
import { gedungPortal } from "../lib/daerah";
import BookingModal from "../components/BookingModal";
import { RUANGAN_BOOKING, rentangWaktu, type Booking, type JenisBooking } from "../lib/booking";
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs, getCountFromServer, Timestamp, where, addDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { kirimEmail } from "../lib/notify";
import { buildRequestBaruEmailHtml, buildSboEmailHtml, buildOvertimeTercatatEmailHtml } from "../lib/emailTemplates";
import { useToast } from "../components/ui/ToastProvider";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Textarea from "../components/ui/Textarea";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import VehicleIcon3D from "../components/VehicleIcon3D";
import { DAFTAR_UNIT_BISNIS, DAFTAR_DEPARTEMEN_INTERNAL } from "../lib/unitBisnis";
import AdminShell from "../components/admin/AdminShell";
import { daerahTulis } from "@/lib/daerah";

// ==========================================
// INTERFACES
// ==========================================
interface KendaraanLog { kendaraan: string; status_kendaraan: string; driver_bertugas: string; tujuan_keperluan: string; petugas_security?: string; kilometer_kendaraan?: string; waktu_catat?: Timestamp | null; _riwayatTerakhir?: KendaraanLog; }
interface DriverStatusLog { nama_driver: string; status: string; waktu_ubah?: Timestamp | null; }
interface DataTamu { id: string; nama: string; instansi_dept: string; tujuan: string; waktu_masuk?: Timestamp | null; waktu_keluar?: Timestamp | null; }
interface DataPaket { id: string; penerima: string; kurir: string; waktu_diterima?: Timestamp | null; status: string; }
interface ObStatusData { nama: string; status: string; lokasi: string[]; }
interface Employee { id: string; nama: string; departemen: string; email?: string; }
const BATAS_PENCARIAN = 300;

// 📊 Seri Tren Aktivitas (§58Q). Tiap seri = 1 koleksi + 1 field waktu -> dihitung dengan
// getCountFromServer per hari (filter rentang 1 field, tidak butuh index komposit).
type SeriTren = "tamu" | "paket" | "armada" | "tiket";
const SERI_TREN: { key: SeriTren; label: string; satuan: string; warna: string; koleksi: string; field: string }[] = [
  { key: "tamu", label: "Tamu", satuan: "tamu", warna: "var(--ok)", koleksi: "security_visitor_logs", field: "waktu_masuk" },
  { key: "paket", label: "Paket", satuan: "paket", warna: "var(--accent)", koleksi: "packages", field: "waktu_diterima" },
  { key: "armada", label: "Armada", satuan: "catatan keluar/masuk", warna: "var(--info)", koleksi: "operational_vehicle_logs", field: "waktu_catat" },
  { key: "tiket", label: "Tiket selesai", satuan: "tiket selesai", warna: "var(--warn)", koleksi: "helpdesk_tickets", field: "waktu_selesai" },
];
type NilaiSeri = Record<SeriTren, number | null>;
const keNilaiSeri = (angka: (number | null)[]) => Object.fromEntries(SERI_TREN.map((s, i) => [s.key, angka[i]])) as NilaiSeri;
const totalNilaiSeri = (n: NilaiSeri | undefined) =>
  n && SERI_TREN.every((s) => n[s.key] !== null) ? SERI_TREN.reduce((a, s) => a + (n[s.key] || 0), 0) : null;

// Hitungan hari yang SUDAH LEWAT tidak berubah lagi -> disimpan di browser (localStorage), jadi tiap
// buka portal cukup menghitung hari ini (4 baca), bukan 7-31 hari x 4 seri lagi. Kalau storage tidak
// tersedia (mode privat dsb.) cuma jadi tanpa cache, tetap jalan.
const KUNCI_CACHE_HARIAN = "sibm_portal_hitungan_harian_v1";
function bacaCacheHarian(): Record<string, NilaiSeri> {
  try { return JSON.parse(localStorage.getItem(KUNCI_CACHE_HARIAN) || "{}") || {}; } catch { return {}; }
}
function simpanCacheHarian(data: Record<string, NilaiSeri>) {
  try {
    const kunci = Object.keys(data).sort().slice(-400); // simpan ~13 bulan terakhir saja
    localStorage.setItem(KUNCI_CACHE_HARIAN, JSON.stringify(Object.fromEntries(kunci.map((k) => [k, data[k]]))));
  } catch { /* storage penuh/diblokir -- abaikan */ }
}
interface KontakAdmin { nama: string; whatsapp?: string; email?: string; }
interface SecurityShift { current: string[]; next: string[]; currentName: string; nextName: string; }
interface HelpdeskTicket { id: string; nama_pelapor: string; lokasi: string; deskripsi: string; status: string; foto_awal?: string; foto_proses?: string; waktu_lapor?: Timestamp | null; }
interface MasterAtk { id: string; nama_barang: string; foto_url?: string; satuan?: string[]; }
interface AtkItemRequest { nama_barang: string; jumlah: string; deskripsi: string; satuan?: string; }
/** §103 "2 rim" -- data lama tanpa satuan cukup angkanya. */
const jumlahAtkLabel = (it: AtkItemRequest) => `${it.jumlah}${it.satuan ? ` ${it.satuan.toLowerCase()}` : ""}`;
interface AtkRequest { id: string; resi: string; nama_pemohon: string; departemen: string; items: AtkItemRequest[]; status: string; waktu_request?: Timestamp | null; alasan_batal?: string; diubah_admin?: boolean; catatan_admin?: string; }
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
const IconClipboardSurvei = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="m9 13 2 2 4-4" /></svg>
);
const IconShield = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3z" /></svg>
);

// Geser tanggal ISO (YYYY-MM-DD) sejumlah n hari, lewat komponen Y/M/D langsung (aman dari isu timezone)
// Dept -> path dashboard, dipakai handleLogin() DAN deteksi sesi staf yang masih aktif
// (lihat useEffect sesiStafAktif) -- 1 tempat biar kalau ada dept baru gak kelewat salah satu.
function pathDashboardUntukDept(dept: string): string | null {
  if (dept === "Admin GA") return "/admin";
  if (dept === "Management") return "/management";
  if (dept === "OB & CS") return "/dashboard/ob";
  if (dept === "Security") return "/dashboard/security";
  if (dept === "Driver") return "/dashboard/driver";
  if (dept === "QHSE") return "/dashboard/qhse";
  return null;
}

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

// Status kendaraan dari halaman Parkir Security: "Tiba di Kantor (Standby)", "Pulang (Selesai Tugas Hari Ini)",
// "Keluar Beroperasi", "Masuk Bengkel / Service" (+ "Standby (Parkiran)" untuk unit tanpa log baru). §58U
type KategoriArmada = "siap" | "keluar" | "bengkel" | "pulang";
const kategoriArmada = (status?: string): KategoriArmada => {
  const s = (status || "").toLowerCase();
  if (s.includes("bengkel") || s.includes("service")) return "bengkel";
  if (s.includes("keluar")) return "keluar";
  if (s.includes("pulang")) return "pulang";
  return "siap";
};
const INFO_KATEGORI_ARMADA: Record<KategoriArmada, { label: string; fg: string; bg: string }> = {
  siap: { label: "Siap", fg: "var(--ok)", bg: "var(--ok-50)" },
  keluar: { label: "Keluar", fg: "var(--red-600)", bg: "var(--red-50)" },
  bengkel: { label: "Bengkel", fg: "var(--warn)", bg: "var(--warn-50)" },
  pulang: { label: "Dibawa pulang", fg: "var(--info)", bg: "var(--info-50)" },
};

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
  // Jam aktif tampil "Tim Bertugas Hari Ini" untuk OB & CS: 06:00-16:59 WITA (jam kerja OB).
  // Di luar itu (>=17:00 s/d <06:00 besok), tampilkan rencana/plot utk periode kerja berikutnya
  // sebagai gantinya. Sebelum jam 6 pagi, periode berikutnya itu masih "hari ini" (shift OB
  // belum mulai) -> target tanggalnya todayISO; setelah jam 5 sore, target tanggalnya tomorrowISO.
  const previewBesokAktif = jamWITA >= 17 || jamWITA < 6;
  const tanggalPreviewOB = jamWITA < 6 ? todayISO : tomorrowISO;

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
  // Driver diambil dari users_master (departemen "Driver"), bukan nama hardcode (§58T).
  const [daftarDriver, setDaftarDriver] = useState<string[]>([]);
  const [filterPlatArmada, setFilterPlatArmada] = useState<string | null>(null);
  // 📅 BOOKING (§80) -- modal booking kendaraan/ruangan + booking yang belum selesai (tanda "Dibooking").
  const [bookingBuka, setBookingBuka] = useState<{ jenis: JenisBooking; objekId: string | null } | null>(null);
  const [bookingBerjalan, setBookingBerjalan] = useState<Booking[]>([]);
  const [riwayatArmadaLengkap, setRiwayatArmadaLengkap] = useState(false);
  const [lemburLewatTerbuka, setLemburLewatTerbuka] = useState(false);
  const [driverStatusMap, setDriverStatusMap] = useState<Record<string, { status: string; waktu: Timestamp | null }>>({});
  // Absensi (attendance_logs) kemarin & hari ini, kunci "tanggal|nama" -- kemarin perlu utk Security Shift 2 lewat tengah malam.
  const [absensiTim, setAbsensiTim] = useState<Record<string, { masuk: Timestamp | null; pulang: Timestamp | null }>>({});
  const [overtimeMingguIni, setOvertimeMingguIni] = useState<OvertimeLog[]>([]);


  // Pengumuman Gedung -- SEKARANG bisa lebih dari 1 sekaligus, tayang bergiliran (carousel) di
  // bawah header, gantikan ticker teks tunggal lama (settings/pengumuman, sudah tidak dipakai).
  const [daftarPengumuman, setDaftarPengumuman] = useState<PengumumanGedung[]>([]);

  // Kampanye Survei Kepuasan Gedung -- admin aktifkan lewat modal di admin/survei-kepuasan
  // (pilih durasi aktif), kartu Menu Cepat di bawah cuma tampil selama aktif & belum expired.
  const [surveiCampaign, setSurveiCampaign] = useState<{ aktif: boolean; expired_at: Timestamp | null } | null>(null);
  const expiredAtMs = surveiCampaign?.expired_at ? surveiCampaign.expired_at.toMillis() : 0;
  const surveiAktif = !!surveiCampaign?.aktif && expiredAtMs > now.getTime();
  const sisaHariSurvei = surveiAktif ? Math.max(1, Math.ceil((expiredAtMs - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  // Deteksi sesi staf yang MASIH AKTIF (Firebase Auth + localStorage) begitu portal ini kebuka --
  // ketemu pas laporan user "force close app lalu kebuka lagi kayak logout, klik Home di dashboard
  // juga balik ke sini kayak logout". Root cause: PWA start_url selalu "/" (lihat manifest.json),
  // dan halaman ini SEBELUMNYA gak pernah ngecek sesi yang masih valid sama sekali -- jadi walau
  // sesi Firebase Auth-nya sendiri sebenarnya MASIH ada (persist normal), user tetap harus login
  // ULANG dari nol tiap kali balik ke "/". Sengaja BUKAN auto-redirect paksa (biar tombol "Home" di
  // bottom-nav dashboard staf tetap bisa dipakai buat akses form publik portal ini beneran), cukup
  // banner kecil dgn 1 tombol "Lanjut ke Dashboard" biar gak perlu ketik ulang email+password.
  const [sesiStafAktif, setSesiStafAktif] = useState<{ nama: string; dept: string; path: string } | null>(null);
  const [bannerSesiDitutup, setBannerSesiDitutup] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setSesiStafAktif(null);
        return;
      }
      const nama = localStorage.getItem("pic_nama") || "";
      const dept = localStorage.getItem("pic_dept") || "";
      const path = pathDashboardUntukDept(dept);
      setSesiStafAktif(nama && path ? { nama, dept, path } : null);
    });
    return () => unsub();
  }, []);

  // STATE HERO / RINGKASAN
  const [staffFotoMap, setStaffFotoMap] = useState<Record<string, string>>({});
  const [kendaraanMetaMap, setKendaraanMetaMap] = useState<Record<string, { kategori: string; warna: string }>>({});
  const [daftarSemuaKendaraan, setDaftarSemuaKendaraan] = useState<string[]>([]);

  // Tamu & paket terbaru (limit) — dipakai badge Menu Cepat. Tren & Kalender pakai hitungan server (§58Q/§58R). Dibatasi limit biar
  // gak narik seluruh histori collection tiap buka portal, konsisten sama pola limit() di halaman lain
  const [visitorLogsTrend, setVisitorLogsTrend] = useState<DataTamu[]>([]);
  const [packageLogsTrend, setPackageLogsTrend] = useState<DataPaket[]>([]);

  // STATE MODAL & SEARCH
  const [activeModal, setActiveModal] = useState<"none" | "login" | "tamu" | "paket" | "helpdesk" | "sbo" | "atk" | "overtime">("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasilTamu, setHasilTamu] = useState<DataTamu[]>([]);
  const [hasilPaket, setHasilPaket] = useState<DataPaket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [lihatSandi, setLihatSandi] = useState(false);
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

    // 1. Tarik Data OB — plot hari ini (skip kalau weekend, OB & CS gak ada jadwal, walau
    // dokumennya mungkin masih nyimpan data lama)
    let unsubPlot = () => {};
    if (!isWeekend(todayISO)) {
      unsubPlot = onSnapshot(doc(db, "daily_plots", todayISO), (docSnap) => {
        setObBertugas(parsePlotDoc(docSnap));
      });
    } else {
      const t = setTimeout(() => setObBertugas([]), 0);
      unsubPlot = () => clearTimeout(t);
    }

    // 1b. Di luar jam kerja OB & CS (>=17:00 s/d <06:00 WITA), tarik plot utk periode kerja
    // berikutnya biar staf/GA bisa lihat siapa yang akan bertugas (skip kalau tanggal targetnya
    // Sabtu/Minggu — OB & CS tidak ada jadwal, walau dokumen plot lama mungkin masih nyimpan data basi)
    let unsubPlotBesok = () => {};
    if (previewBesokAktif && !isWeekend(tanggalPreviewOB)) {
      unsubPlotBesok = onSnapshot(doc(db, "daily_plots", tanggalPreviewOB), (docSnap) => {
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

    // 4. Tarik Overtime Minggu Ini (Senin-Minggu WITA) — dulu cuma hari ini, sekarang direkap 1 minggu sekaligus
    const unsubOvertime = onSnapshot(
      query(collection(db, "ga_overtime_requests"), where("tanggal", ">=", seninMingguIni), where("tanggal", "<=", mingguMingguIni)),
      (snapshot) => {
        const otData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OvertimeLog))
          .sort((a, b) => a.tanggal === b.tanggal ? a.jam_mulai.localeCompare(b.jam_mulai) : a.tanggal.localeCompare(b.tanggal));
        setOvertimeMingguIni(otData);
      }
    );

    // 5b. Tarik Riwayat Tamu & Paket (dibatasi limit 60 — dipakai buat widget Tren Aktivitas & Kalender Aktivitas,
    // juga badge Menu Cepat; pencarian tamu/paket pakai getDocs terbatas di bukaPencarian)
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
      const driver: string[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.nama && data.foto_url) map[data.nama] = data.foto_url;
        if (data.nama && data.departemen === "Driver") driver.push(data.nama);
      });
      setStaffFotoMap(map);
      setDaftarDriver(driver.sort());
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


    // 7. Tarik Pengumuman Gedung (bisa lebih dari 1 sekaligus, tayang bergiliran)
    const unsubBroadcast = onSnapshot(
      query(collection(db, "pengumuman_gedung"), where("aktif", "==", true), orderBy("dibuatPada", "desc")),
      (snapshot) => {
        setDaftarPengumuman(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PengumumanGedung)));
      }
    );

    // 8. Tarik status kampanye Survei Kepuasan Gedung (aktif/tidak + kapan expired)
    const unsubSurveiCampaign = onSnapshot(doc(db, "settings", "survei_kepuasan_campaign"), (docSnap) => {
      if (docSnap.exists()) {
        setSurveiCampaign({ aktif: !!docSnap.data().aktif, expired_at: docSnap.data().expired_at || null });
      } else {
        setSurveiCampaign({ aktif: false, expired_at: null });
      }
    });

    return () => { unsubPlot(); unsubPlotBesok(); unsubVeh(); unsubOvertime(); unsubBroadcast(); unsubSurveiCampaign(); unsubMasterAtk(); unsubVisitorTrend(); unsubPackageTrend(); };
  }, [todayISO, tomorrowISO, previewBesokAktif, tanggalPreviewOB, seninMingguIni, mingguMingguIni]);

  // Auto-geser kartu pengumuman tiap 6 detik kalau lebih dari 1 -- "stop" dilakukan admin lewat
  // toggle Aktif/Nonaktif per pengumuman di admin/broadcast, bukan lewat kontrol di sisi user.
  // 🛡️ SHIFT SECURITY AKTIF (§58N) -- pakai hitungShiftSesi() yang sama dengan dashboard Security.
  // Shift 2 (20:00-08:00) melewati tengah malam: pukul 00:00-08:00 jadwal yang berlaku milik tanggal
  // KEMARIN (dulu portal salah mengambil jadwal hari ini = petugas yang baru masuk malam nanti).
  // Dicek ulang tiap menit supaya ikut berganti tepat 08:00/20:00 walau portal dibiarkan terbuka.
  const [infoShiftAktif, setInfoShiftAktif] = useState(() => hitungShiftSesi(waktuWITASekarang()));
  useEffect(() => {
    const id = setInterval(() => {
      const baru = hitungShiftSesi(waktuWITASekarang());
      setInfoShiftAktif((lama) => (lama.tanggal_shift === baru.tanggal_shift && lama.shift === baru.shift ? lama : baru));
    }, 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let batal = false;
    const { tanggal_shift, shift } = infoShiftAktif;
    const besok = new Date(`${tanggal_shift}T00:00:00`);
    besok.setDate(besok.getDate() + 1);
    const tglBesok = `${besok.getFullYear()}-${String(besok.getMonth() + 1).padStart(2, "0")}-${String(besok.getDate()).padStart(2, "0")}`;
    // Shift berikutnya: Shift 1 -> Shift 2 tanggal yang sama; Shift 2 -> Shift 1 besoknya.
    const shiftBerikut = shift === "Shift 1" ? "Shift 2" : "Shift 1";
    const tglBerikut = shift === "Shift 1" ? tanggal_shift : tglBesok;
    // Roster disimpan per bulan kalender; tanggal 1 dini hari butuh dokumen bulan sebelumnya.
    const bulan = Array.from(new Set([tanggal_shift.slice(0, 7), tglBerikut.slice(0, 7)]));
    Promise.all(bulan.map((bln) => getDoc(doc(db, "security_monthly_schedules", bln))))
      .then((snaps) => {
        if (batal) return;
        const dataHari: Record<string, Record<string, string>> = {};
        snaps.forEach((s) => { if (s.exists()) Object.assign(dataHari, s.data().data_hari || {}); });
        const petugas = (tgl: string, label: string) => Object.keys(dataHari[tgl] || {}).filter((nama) => dataHari[tgl][nama]?.includes(label));
        setSecurityShift({
          current: petugas(tanggal_shift, shift),
          next: petugas(tglBerikut, shiftBerikut),
          currentName: shift === "Shift 1" ? "Shift 1 (08:00 - 20:00)" : "Shift 2 (20:00 - 08:00)",
          nextName: shift === "Shift 1" ? "Shift 2 (20:00 - 08:00)" : "Shift 1 (Besok 08:00)",
        });
      })
      .catch((e) => console.error("[portal] Gagal memuat roster Security:", e));
    return () => { batal = true; };
  }, [infoShiftAktif]);

  // 🚐 STATUS DRIVER (§58T) -- dulu onSnapshot SELURUH driver_status_logs tanpa limit (ikut membesar tiap
  // hari, terbaca ulang tiap portal dibuka). Sekarang 1 dokumen terakhir per driver.
  useEffect(() => {
    const unsubs = daftarDriver.map((nama) =>
      onSnapshot(
        query(collection(db, "driver_status_logs"), where("nama_driver", "==", nama), orderBy("waktu_ubah", "desc"), limit(1)),
        (snap) => {
          const d = snap.docs[0]?.data() as DriverStatusLog | undefined;
          setDriverStatusMap((lama) => ({ ...lama, [nama]: { status: d?.status || "Standby", waktu: (d?.waktu_ubah as Timestamp | undefined) || null } }));
        },
        (err) => console.error(`[portal] Gagal memuat status driver ${nama}:`, err)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [daftarDriver]);

  // 🕘 ABSENSI TIM (§58T) -- label "Hadir" dulu cuma berarti "ada di plot", tidak dicek ke absensi.
  useEffect(() => {
    if (!FITUR_ABSENSI_AKTIF) return; // §68: fitur absensi dinonaktifkan
    const unsub = onSnapshot(
      query(collection(db, "attendance_logs"), where("tanggal", "in", [geserTanggalISO(todayISO, -1), todayISO])),
      (snap) => {
        const map: Record<string, { masuk: Timestamp | null; pulang: Timestamp | null }> = {};
        snap.docs.forEach((d) => {
          const x = d.data();
          if (x.nama && x.tanggal) map[`${x.tanggal}|${x.nama}`] = { masuk: x.waktu_checkin || null, pulang: x.waktu_checkout || null };
        });
        setAbsensiTim(map);
      },
      (err) => console.error("[portal] Gagal memuat absensi:", err)
    );
    return () => unsub();
  }, [todayISO]);

  // 🏢 GEDUNG PORTAL (§78) -- link per gedung (?gedung=makassar, dicetak jadi QR) diingat di HP supaya data
  // yang dikirim dari portal (lapor kerusakan, SBO, ATK, lembur) tertandai daerah yang benar. Tahap 1:
  // belum menyaring tampilan.
  useEffect(() => { gedungPortal(); }, []);

  // Booking yang belum selesai (koleksi kecil; filter 1 field) -> tanda "Dibooking" di kartu armada.
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "booking"), where("sampai", ">", Timestamp.fromDate(new Date()))), (snap) => {
      setBookingBerjalan(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking)).filter((b) => b.status === "aktif"));
    }, (err) => console.error("[portal] Gagal memuat booking:", err));
    return () => unsub();
  }, []);

  // 👥 KEHADIRAN KARYAWAN (§67) -- versi PUBLIK: hanya nama & jumlah (tanpa foto/alasan; itu di hub admin).
  const [kehadiranKaryawan, setKehadiranKaryawan] = useState<{ lembur: string[]; tidakMasuk: string[] }>({ lembur: [], tidakMasuk: [] });
  useEffect(() => {
    const kemarin = geserTanggalISO(todayISO, -1);
    const unsub = onSnapshot(query(collection(db, "validasi_karyawan"), where("tanggal", "in", [kemarin, todayISO])), (snap) => {
      const lembur: string[] = [];
      const tidakMasuk: string[] = [];
      snap.docs.forEach((d) => {
        const v = d.data();
        if (v.jenis === "lembur" && v.status === "lanjut") lembur.push(v.nama);
        if (v.jenis === "belum_input" && v.tanggal === todayISO && v.status === "tidak_masuk") tidakMasuk.push(v.nama);
      });
      setKehadiranKaryawan({ lembur: lembur.sort(), tidakMasuk: tidakMasuk.sort() });
    }, (err) => console.error("[portal] Gagal memuat kehadiran karyawan:", err));
    return () => unsub();
  }, [todayISO]);

  // 🛠️ TIKET HELPDESK YANG BELUM SELESAI (§58N) -- dasar judul "Ringkasan Hari Ini". Dulu judul cuma
  // melihat tiket "Sedang Dikerjakan" di 20 tiket terakhir, jadi tiket "Menunggu" tidak pernah terhitung.
  const [tiketTerbuka, setTiketTerbuka] = useState<HelpdeskTicket[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "helpdesk_tickets"), where("status", "!=", "Selesai")), (snap) => {
      setTiketTerbuka(snap.docs.map((d) => d.data() as HelpdeskTicket));
    });
    return () => unsub();
  }, []);

  // Pengumuman yang tayang HARI INI (§58O): aktif + dalam rentang tanggal mulai/berakhir, yang
  // "penting" selalu di depan. Rotasi, jeda & pemutar video diurus PengumumanCarousel.
  const pengumumanTayang = urutkanPengumuman(daftarPengumuman.filter((p) => dalamTanggalTayang(p, todayISO)));

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
      return [...prev, { nama_barang: produk.nama_barang, jumlah: "1", deskripsi: "", satuan: produk.satuan?.[0] || "PCS" }];
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

  // Broadcast notifikasi Email ke semua kontak QHSE (dipakai saat ada laporan SBO baru).
  // Sebelumnya lewat WA (Fonnte) -- diganti Email-only karena token Fonnte invalid/expired.
  const kirimNotifikasiQHSE = async (
    namaPelapor: string,
    kategori: string,
    lokasi: string,
    unitBisnis?: string,
    detailTemuan?: string,
    fotoUrl?: string
  ) => {
    if (daftarQHSE.length === 0) {
      console.warn("[notify] Tidak ada kontak QHSE (departemen 'QHSE') di users_master. Notifikasi dilewati.");
      return;
    }
    const htmlEmail = buildSboEmailHtml({ namaPelapor, kategori, lokasi, unitBisnis, detailTemuan, fotoUrl });
    for (const qhse of daftarQHSE) {
      if (!qhse.email) continue;
      const hasil = await kirimEmail(qhse.email, "Laporan SBO Baru Masuk", htmlEmail, qhse.nama);
      if (!hasil.sukses) console.error(`[notify] Gagal kirim Email ke QHSE (${qhse.nama}):`, hasil.pesanError);
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
      await addDoc(collection(db, "ga_atk_requests"), { daerah: daerahTulis(), resi: newResi, nama_pemohon: formAtkPemohon.nama, departemen: formAtkPemohon.dept, items: formAtkItems, status: "Menunggu Disiapkan", waktu_request: serverTimestamp() });

      // Notifikasi ke Admin GA (best-effort, tidak memblokir alur pemohon) — rincian per barang dalam tabel
      kirimNotifikasiAdminGA("Request ATK", formAtkPemohon.nama, formAtkPemohon.dept, [{ label: "Kode Resi", value: newResi }], {
        headers: ["Barang", "Jumlah", "Keterangan"],
        rows: formAtkItems.map((it) => [it.nama_barang, jumlahAtkLabel(it), it.deskripsi || "-"]),
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
      await addDoc(collection(db, "ga_overtime_requests"), { daerah: daerahTulis(),
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

      // Konfirmasi ke PIC yang bersangkutan SENDIRI (bukan Admin GA lagi) -- overtime sekarang
      // langsung "Tercatat" tanpa approval, jadi gak ada lagi yang perlu ditinjau Admin GA di
      // tahap ini, cukup pemohonnya sendiri yang dapat bukti pencatatan lewat email.
      const emailPemohon = employees.find(emp => emp.nama === formOvertime.nama)?.email;
      if (emailPemohon) {
        const htmlOvertime = buildOvertimeTercatatEmailHtml({
          namaPemohon: formOvertime.nama,
          departemen: formOvertime.dept,
          area: formOvertime.area,
          tanggal: formOvertime.tanggal,
          jamMulai: formOvertime.jam_mulai,
          jamSelesai: formOvertime.jam_selesai,
          alasan: formOvertime.alasan,
        });
        const hasilEmail = await kirimEmail(emailPemohon, "Overtime Gedung Tercatat", htmlOvertime, formOvertime.nama);
        if (!hasilEmail.sukses) console.error("[notify] Gagal kirim email konfirmasi overtime ke pemohon:", hasilEmail.pesanError);
      } else {
        console.warn(`[notify] ${formOvertime.nama} tidak punya email di Master Data Karyawan, konfirmasi overtime dilewati.`);
      }

      showToast("Overtime Gedung berhasil dicatat. Akan masuk rekap tagihan.", "success");
      setFormOvertime({ nama: "", dept: "", area: "", tanggal: todayISO, jam_mulai: "", jam_selesai: "", alasan: "" }); setActiveModal("none");
    } catch (error) {
      console.error(error);
      showToast("Gagal mengirim permohonan Overtime.", "error");
    } finally { setIsOvertimeLoading(false); }
  };

  // 🔎 LACAK TAMU / CEK PAKET (§58P) -- dulu tiap tombol "Cari" membaca SELURUH koleksi sejak awal
  // (biaya baca Firestore & lambat makin lama makin parah). Sekarang ambil BATAS_PENCARIAN catatan
  // terbaru sekali saat modal dibuka, penyaringan (nama/instansi/tujuan, penerima/kurir) di browser.
  const bukaPencarian = async (jenis: "tamu" | "paket") => {
    setActiveModal(jenis);
    setSearchQuery("");
    setIsSearching(true);
    try {
      if (jenis === "tamu") {
        const snap = await getDocs(query(collection(db, "security_visitor_logs"), orderBy("waktu_masuk", "desc"), limit(BATAS_PENCARIAN)));
        setHasilTamu(snap.docs.map(d => ({ id: d.id, ...d.data() } as DataTamu)));
      } else {
        const snap = await getDocs(query(collection(db, "packages"), orderBy("waktu_diterima", "desc"), limit(BATAS_PENCARIAN)));
        setHasilPaket(snap.docs.map(d => ({ id: d.id, ...d.data() } as DataPaket)));
      }
    } catch (err) {
      console.error(err);
      showToast("Gagal memuat data. Periksa koneksi lalu coba lagi.", "error");
    } finally { setIsSearching(false); }
  };

  const handleCariHelpdesk = async () => {
    if (!searchHelpdeskName.trim()) {
      showToast("Masukkan nama Anda terlebih dahulu.", "warning");
      return;
    }
    setIsSearchingHelpdesk(true);
    try {
      // §61: dulu getDocs SELURUH helpdesk_tickets tiap klik "Cari" -> 300 laporan terbaru cukup
      // (yang dicari pelapor hampir selalu laporannya yang masih baru).
      const snap = await getDocs(query(collection(db, "helpdesk_tickets"), orderBy("waktu_lapor", "desc"), limit(BATAS_PENCARIAN)));
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
      await addDoc(collection(db, "qhse_sbo_reports"), { daerah: daerahTulis(),
        ...formSbo,
        nama_pelapor: formSbo.nama_pelapor || "Anonim / Visitor",
        foto_bukti: fotoSbo,
        waktu_lapor: serverTimestamp(),
        tanggal_closed: formSbo.status_temuan === "Close" ? todayISO : null
      });

      // Notifikasi ke QHSE (best-effort, tidak memblokir alur pelapor)
      kirimNotifikasiQHSE(formSbo.nama_pelapor || "Anonim / Visitor", formSbo.kategori_temuan, formSbo.lokasi, formSbo.unit_bisnis, formSbo.detail_temuan, fotoSbo);

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
      await addDoc(collection(db, "helpdesk_tickets"), { daerah: daerahTulis(),
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
      const cred = await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password);

      const profileSnap = await getDoc(doc(db, "users_master", cred.user.uid));
      if (!profileSnap.exists()) {
        showToast("Akun ditemukan tapi profil pengguna belum lengkap. Hubungi Admin GA.", "error");
        setIsLoginLoading(false);
        return;
      }
      const uData = profileSnap.data();

      localStorage.setItem("pic_nama", uData.nama);
      localStorage.setItem("pic_dept", uData.departemen);
      localStorage.setItem("pic_role", uData.role);
      localStorage.setItem("pic_daerah", uData.daerah || "");

      const tujuan = pathDashboardUntukDept(uData.departemen);
      if (tujuan) router.push(tujuan);
      else showToast(`Akses belum tersedia untuk ${uData.departemen}`, "warning");
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        showToast("Email tidak terdaftar.", "error");
      } else if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        showToast("Password yang Anda masukkan salah!", "error");
      } else if (code === "auth/too-many-requests") {
        showToast("Terlalu banyak percobaan gagal. Coba lagi beberapa saat lagi.", "error");
      } else {
        showToast("Gagal login. Periksa koneksi internet Anda.", "error");
      }
      console.error(error);
    } finally {
      setIsLoginLoading(false);
    }
  };

  const formatJam = (ts: Timestamp | null | undefined) => ts ? new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

  // Ubah 1 baris log kendaraan jadi kalimat history biasa (bukan card per-kendaraan lagi) — dipakai di card "Status Armada Operasional"
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

  // 📋 KOTAK RINGKASAN HARI INI (§58N)
  const jumlahPerbaikanJalan = tiketTerbuka.filter((tk) => tk.status === "Sedang Dikerjakan").length;
  const jumlahLaporanMenunggu = tiketTerbuka.length - jumlahPerbaikanJalan;
  const judulRingkasan =
    jumlahPerbaikanJalan > 0 && jumlahLaporanMenunggu > 0
      ? `${jumlahPerbaikanJalan} perbaikan berjalan · ${jumlahLaporanMenunggu} laporan menunggu`
      : jumlahPerbaikanJalan > 0
      ? `${jumlahPerbaikanJalan} perbaikan sedang berjalan`
      : jumlahLaporanMenunggu > 0
      ? `${jumlahLaporanMenunggu} laporan kerusakan menunggu ditangani`
      : "Semua operasional normal";
  const jumlahArmadaSiap = mobilStatus.filter((m) => kategoriArmada(m.status_kendaraan) === "siap").length;
  const jumlahArmadaKeluar = mobilStatus.filter((m) => kategoriArmada(m.status_kendaraan) === "keluar").length;
  const jumlahArmadaPulang = mobilStatus.filter((m) => kategoriArmada(m.status_kendaraan) === "pulang").length;
  const obLibur = isWeekend(todayISO);
  const kataCari = searchQuery.toLowerCase().trim();
  const cocokCari = (...nilai: (string | undefined)[]) => !kataCari || nilai.some((v) => String(v || "").toLowerCase().includes(kataCari));
  const tamuTampil = hasilTamu.filter((tm) => cocokCari(tm.nama, tm.instansi_dept, tm.tujuan)).slice(0, 50);
  // Paket yang belum diambil di atas -- yang dicari karyawan biasanya "paket saya sudah datang?"
  const paketTampil = hasilPaket
    .filter((p) => cocokCari(p.penerima, p.kurir))
    .sort((a, b) => Number(a.status === "Sudah Diambil") - Number(b.status === "Sudah Diambil"))
    .slice(0, 50);
  const jumlahTamuDiDalam = visitorLogsTrend.filter((tm) => !tm.waktu_keluar && tm.waktu_masuk && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(tm.waktu_masuk.toDate()) === todayISO).length;
  const jumlahPaketMenunggu = packageLogsTrend.filter((p) => p.status === "Belum Diambil").length;
  // 🚗 RIWAYAT ARMADA (§58U) -- dikelompokkan per hari, bisa disaring per kendaraan.
  const riwayatArmadaTersaring = logKendaraanMentah.filter((log) => !filterPlatArmada || getPlat(log.kendaraan).toUpperCase().replace(/\s+/g, "") === filterPlatArmada.toUpperCase().replace(/\s+/g, ""));
  const BATAS_RIWAYAT_ARMADA = 8;
  const riwayatArmadaTampil = riwayatArmadaLengkap ? riwayatArmadaTersaring : riwayatArmadaTersaring.slice(0, BATAS_RIWAYAT_ARMADA);
  const grupRiwayatArmada: { tanggal: string; log: KendaraanLog[] }[] = [];
  riwayatArmadaTampil.forEach((log) => {
    const tgl = log.waktu_catat ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(log.waktu_catat.toDate()) : "-";
    const g = grupRiwayatArmada[grupRiwayatArmada.length - 1];
    if (g && g.tanggal === tgl) g.log.push(log); else grupRiwayatArmada.push({ tanggal: tgl, log: [log] });
  });
  const labelHariRiwayat = (iso: string) =>
    iso === todayISO ? "Hari ini" : iso === geserTanggalISO(todayISO, -1) ? "Kemarin"
    : iso === "-" ? "Tanpa tanggal" : new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });

  // ⏱️ LEMBUR MINGGU INI (§58V) -- pengajuan "Rejected" dulu ikut tampil; urutan Senin->Minggu bikin lembur
  // hari ini tenggelam. Sekarang: hari ini dulu, lalu mendatang, yang sudah lewat dilipat.
  const durasiMenitLembur = (mulai: string, selesai: string) => {
    const [a, b] = (mulai || "0:0").split(":").map(Number);
    const [c, d] = (selesai || "0:0").split(":").map(Number);
    const m = c * 60 + d - (a * 60 + b);
    return m > 0 ? m : m + 1440; // lewat tengah malam
  };
  const formatDurasi = (menit: number) => `${Math.floor(menit / 60)} jam${menit % 60 ? ` ${menit % 60} mnt` : ""}`;
  const lemburAktif = overtimeMingguIni.filter((ot) => ot.status !== "Rejected");
  // "Berlangsung" = lembur divalidasi Security yang belum check-out (jam selesai masih kosong, §59).
  const lemburBerlangsung = (ot: OvertimeLog) => ot.status === "Berlangsung" || !ot.jam_selesai;
  const totalMenitLembur = lemburAktif.filter((ot) => !lemburBerlangsung(ot)).reduce((a, ot) => a + durasiMenitLembur(ot.jam_mulai, ot.jam_selesai), 0);
  const kelompokkanLembur = (daftar: OvertimeLog[]) => {
    const grup: { tanggal: string; item: OvertimeLog[] }[] = [];
    daftar.forEach((ot) => {
      const g = grup[grup.length - 1];
      if (g && g.tanggal === ot.tanggal) g.item.push(ot); else grup.push({ tanggal: ot.tanggal, item: [ot] });
    });
    return grup;
  };
  const grupLemburDepan = kelompokkanLembur(lemburAktif.filter((ot) => ot.tanggal >= todayISO));
  const grupLemburLewat = kelompokkanLembur(lemburAktif.filter((ot) => ot.tanggal < todayISO).reverse());
  const jumlahLemburLewat = lemburAktif.filter((ot) => ot.tanggal < todayISO).length;
  const tanggalPendek = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  const labelHariLembur = (iso: string) =>
    iso === todayISO ? "Hari ini" : iso === tomorrowISO ? "Besok" : new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });

  // ⚙️ STATUS OPERASIONAL (§58S)
  const jumlahArmadaBengkel = mobilStatus.filter((m) => kategoriArmada(m.status_kendaraan) === "bengkel").length;
  const tiketDikerjakan = tiketTerbuka.filter((tk) => tk.status === "Sedang Dikerjakan");
  const lemburHariIni = lemburAktif.filter((ot) => ot.tanggal === todayISO);
  const lompatKe = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ==========================================
  // TIM BERTUGAS (§58T) -- dikelompokkan per unit; status dari absensi & log driver sungguhan.
  // ==========================================
  type NadaTim = "ok" | "warn" | "info" | "muted";
  type AnggotaTim = { key: string; nama: string; sub: string; label: string; nada: NadaTim; foto?: string };
  const jamTimWITA = (ts: Timestamp | null | undefined) =>
    ts ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" }).format(ts.toDate()) : "";
  const sejakWITA = (ts: Timestamp | null) => {
    if (!ts) return "";
    const tgl = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(ts.toDate());
    return tgl === todayISO ? `sejak ${jamTimWITA(ts)}` : `sejak ${ts.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Makassar" })}`;
  };
  const statusAbsen = (nama: string, tanggal: string, labelHadir: string): Pick<AnggotaTim, "label" | "nada"> & { ket: string } => {
    // §68: absensi nonaktif -> status dari jadwal saja (seperti sebelum §58T).
    if (!FITUR_ABSENSI_AKTIF) return { label: labelHadir, nada: "ok", ket: "sesuai jadwal" };
    const a = absensiTim[`${tanggal}|${nama}`];
    if (a?.pulang) return { label: "PULANG", nada: "muted", ket: `pulang ${jamTimWITA(a.pulang)}` };
    if (a?.masuk) return { label: labelHadir, nada: "ok", ket: `masuk ${jamTimWITA(a.masuk)}` };
    return { label: "TERJADWAL", nada: "muted", ket: "belum absen masuk" };
  };

  const anggotaOB: AnggotaTim[] = previewBesokAktif
    ? obBesok.map((o) => ({
        key: `ob-next-${o.nama}`, nama: o.nama, foto: staffFotoMap[o.nama], label: "RENCANA", nada: "info" as NadaTim,
        sub: o.lokasi.join(", ") || "Standby",
      }))
    : hadirOB.map((o) => {
        const s = statusAbsen(o.nama, todayISO, "HADIR");
        return { key: `ob-${o.nama}`, nama: o.nama, foto: staffFotoMap[o.nama], label: s.label, nada: s.nada, sub: `${o.lokasi.join(", ") || "Standby"} · ${s.ket}` };
      });
  const anggotaSecurity: AnggotaTim[] = securityShift.current.map((nama) => {
    const s = statusAbsen(nama, infoShiftAktif.tanggal_shift, "JAGA");
    return { key: `sec-${nama}`, nama, foto: staffFotoMap[nama], label: s.label, nada: s.nada, sub: s.ket };
  });
  const STATUS_DRIVER = (status: string): Pick<AnggotaTim, "label" | "nada"> & { ket: string } =>
    status.includes("Keluar") ? { label: "KELUAR", nada: "warn", ket: "bertugas di luar" }
    : status.includes("Bengkel") || status.includes("Service") ? { label: "BENGKEL", nada: "warn", ket: "kendaraan di bengkel" }
    : status.includes("Pulang") ? { label: "PULANG", nada: "muted", ket: "selesai tugas" }
    : { label: "STANDBY", nada: "ok", ket: "siaga di kantor" };
  const anggotaDriver: AnggotaTim[] = daftarDriver.map((nama) => {
    const st = driverStatusMap[nama];
    if (!st) return { key: `drv-${nama}`, nama, foto: staffFotoMap[nama], label: "…", nada: "muted" as NadaTim, sub: "memuat status" };
    const s = STATUS_DRIVER(st.status);
    return { key: `drv-${nama}`, nama, foto: staffFotoMap[nama], label: s.label, nada: s.nada, sub: [s.ket, sejakWITA(st.waktu)].filter(Boolean).join(" · ") };
  });
  const kelompokTim: { key: string; judul: string; ket: string; anggota: AnggotaTim[]; kosong: string }[] = [
    {
      key: "ob", judul: "OB & CS", anggota: anggotaOB,
      ket: previewBesokAktif ? `rencana plot ${tanggalPreviewOB === todayISO ? "hari ini" : "besok"} · tampil kembali 06:00` : "",
      kosong: isWeekend(previewBesokAktif ? tanggalPreviewOB : todayISO) ? "Libur akhir pekan" : "Belum ada plot",
    },
    { key: "sec", judul: "Security", ket: securityShift.currentName, anggota: anggotaSecurity, kosong: "Belum ada jadwal shift" },
    { key: "drv", judul: "Driver", ket: "", anggota: anggotaDriver, kosong: "Belum ada data driver" },
  ];
  const WARNA_NADA: Record<NadaTim, { fg: string; bg: string }> = {
    ok: { fg: "var(--ok)", bg: "var(--ok-50)" },
    warn: { fg: "var(--warn)", bg: "var(--warn-50)" },
    info: { fg: "var(--info)", bg: "var(--info-50)" },
    muted: { fg: "var(--muted)", bg: "var(--hover)" },
  };

  // ==========================================
  // TREN AKTIVITAS (7 hari) & KALENDER AKTIVITAS (per bulan) -- §58Q/§58R
  // Satu sumber: hitungan agregat server (getCountFromServer) per HARI per seri, filter rentang 1 field.
  // Dulu keduanya dihitung dari data limit(20/30/60) sehingga angka kurang & awal bulan "tidak ada data".
  // Hari lampau di-cache di browser (lihat bacaCacheHarian), hari ini selalu dihitung ulang tiap buka.
  // ==========================================
  const NAMA_HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  const [hitunganHarian, setHitunganHarian] = useState<Record<string, NilaiSeri>>({});
  const [seriTren, setSeriTren] = useState<SeriTren>("tamu");
  const [bulanKalender, setBulanKalender] = useState(() => todayISO.slice(0, 7));
  const [seriKalender, setSeriKalender] = useState<SeriTren | "semua">("semua");
  const [tanggalDipilih, setTanggalDipilih] = useState<string | null>(null);
  const tanggalSudahDiambil = useRef<Set<string>>(new Set());

  useEffect(() => {
    let batal = false;
    const dibutuhkan = new Set<string>();
    for (let i = 0; i < 14; i++) dibutuhkan.add(geserTanggalISO(todayISO, -i)); // tren 7 hari + 7 hari pembanding
    const [th, bl] = bulanKalender.split("-").map(Number);
    for (let d = 1; d <= new Date(th, bl, 0).getDate(); d++) {
      const iso = `${bulanKalender}-${String(d).padStart(2, "0")}`;
      if (iso <= todayISO) dibutuhkan.add(iso);
    }
    const awalHariWITA = (iso: string) => Timestamp.fromDate(new Date(`${iso}T00:00:00+08:00`));
    const hitungHari = (s: (typeof SERI_TREN)[number], iso: string) =>
      getCountFromServer(query(collection(db, s.koleksi), where(s.field, ">=", awalHariWITA(iso)), where(s.field, "<", awalHariWITA(geserTanggalISO(iso, 1)))))
        .then((r) => r.data().count as number | null)
        .catch((e) => { console.error(`[portal] Gagal menghitung ${s.key} ${iso}:`, e); return null; });

    Promise.resolve().then(async () => {
      const cache = bacaCacheHarian();
      const dariCache: Record<string, NilaiSeri> = {};
      const perluAmbil: string[] = [];
      dibutuhkan.forEach((iso) => {
        if (tanggalSudahDiambil.current.has(iso)) return;
        if (iso < todayISO && cache[iso]) dariCache[iso] = cache[iso];
        else perluAmbil.push(iso);
      });
      if (batal) return;
      Object.keys(dariCache).forEach((iso) => tanggalSudahDiambil.current.add(iso));
      if (Object.keys(dariCache).length) setHitunganHarian((lama) => ({ ...lama, ...dariCache }));
      if (!perluAmbil.length) return;
      const hasil = await Promise.all(
        perluAmbil.map(async (iso) => [iso, keNilaiSeri(await Promise.all(SERI_TREN.map((s) => hitungHari(s, iso))))] as const)
      );
      if (batal) return;
      setHitunganHarian((lama) => ({ ...lama, ...Object.fromEntries(hasil) }));
      const cacheBaru = { ...cache };
      hasil.forEach(([iso, n]) => {
        if (totalNilaiSeri(n) === null) return; // ada yang gagal -> coba lagi kunjungan berikutnya
        tanggalSudahDiambil.current.add(iso);
        if (iso < todayISO) cacheBaru[iso] = n;
      });
      simpanCacheHarian(cacheBaru);
    });
    return () => { batal = true; };
  }, [todayISO, bulanKalender]);

  const tanggalTren = Array.from({ length: 7 }, (_, i) => geserTanggalISO(todayISO, i - 6));
  const tanggalPembanding = Array.from({ length: 7 }, (_, i) => geserTanggalISO(todayISO, i - 13));
  const trenHarian = tanggalTren.every((tg) => hitunganHarian[tg])
    ? tanggalTren.map((tanggal) => ({ tanggal, nilai: hitunganHarian[tanggal] }))
    : null;
  const trenMingguLalu: NilaiSeri | null = tanggalPembanding.every((tg) => hitunganHarian[tg])
    ? keNilaiSeri(SERI_TREN.map((s) => tanggalPembanding.reduce<number | null>((a, tg) => {
        const v = hitunganHarian[tg][s.key];
        return a === null || v === null ? null : a + v;
      }, 0)))
    : null;

  const infoSeriTren = SERI_TREN.find((s) => s.key === seriTren) || SERI_TREN[0];
  const totalSeri = (key: SeriTren) => {
    if (!trenHarian) return null;
    let total = 0;
    for (const h of trenHarian) { const v = h.nilai[key]; if (v === null) return null; total += v; }
    return total;
  };
  const totalSeriAktif = totalSeri(seriTren);
  const totalSeriMingguLalu = trenMingguLalu?.[seriTren] ?? null;
  const maxSeriAktif = Math.max(1, ...(trenHarian || []).map((h) => h.nilai[seriTren] || 0));
  const perbandinganTren = (() => {
    if (totalSeriAktif === null || totalSeriMingguLalu === null) return null;
    if (totalSeriMingguLalu === 0) return totalSeriAktif === 0 ? "sama dengan 7 hari sebelumnya" : `naik dari 0 pada 7 hari sebelumnya`;
    const persen = Math.round(((totalSeriAktif - totalSeriMingguLalu) / totalSeriMingguLalu) * 100);
    if (persen === 0) return "sama dengan 7 hari sebelumnya";
    return `${persen > 0 ? "▲" : "▼"} ${Math.abs(persen)}% dibanding 7 hari sebelumnya (${totalSeriMingguLalu})`;
  })();
  // 🗓️ KALENDER AKTIVITAS (§58R)
  const [thnKal, blnKal] = bulanKalender.split("-").map(Number);
  const nilaiKalender = (n: NilaiSeri | undefined) => (seriKalender === "semua" ? totalNilaiSeri(n) : n ? n[seriKalender] : null);
  const hariKalender = Array.from({ length: new Date(thnKal, blnKal, 0).getDate() }, (_, i) => {
    const iso = `${bulanKalender}-${String(i + 1).padStart(2, "0")}`;
    return { tanggal: i + 1, iso, nilai: nilaiKalender(hitunganHarian[iso]), dimuat: !!hitunganHarian[iso], nanti: iso > todayISO, hariIni: iso === todayISO };
  });
  const maxKalender = Math.max(1, ...hariKalender.map((h) => h.nilai || 0));
  const levelKalender = (v: number | null) => (!v ? 0 : Math.min(4, Math.ceil((v / maxKalender) * 4)));
  const hariPertamaKal = new Date(thnKal, blnKal - 1, 1).getDay(); // 0=Minggu
  const kosongAwalKal = hariPertamaKal === 0 ? 6 : hariPertamaKal - 1; // kolom Senin..Minggu
  const totalBulanKal = hariKalender.every((h) => h.nanti || h.nilai !== null) ? hariKalender.reduce((a, h) => a + (h.nilai || 0), 0) : null;
  const bulanIni = todayISO.slice(0, 7);
  const bulanMinKal = geserTanggalISO(`${bulanIni}-01`, -335).slice(0, 7); // ~12 bulan ke belakang
  const geserBulanKal = (arah: number) => {
    const d = new Date(thnKal, blnKal - 1 + arah, 1);
    setBulanKalender(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setTanggalDipilih(null);
  };
  const tanggalDetailKal = tanggalDipilih?.startsWith(bulanKalender) ? tanggalDipilih : bulanKalender === bulanIni ? todayISO : null;
  const detailKal = tanggalDetailKal ? hitunganHarian[tanggalDetailKal] : undefined;
  const labelSeriKal = seriKalender === "semua" ? "aktivitas" : SERI_TREN.find((s) => s.key === seriKalender)?.satuan || "";

  // Level 0-4 aktivitas; level >= 2 memakai teks putih (lihat kalender-cell). Level 0-1 ikut token tema.
  const WARNA_LEVEL_KALENDER = ["var(--hover)", "var(--red-50)", "#e07a86", "#c93a4c", "#a3122a"];

  return (
    <AdminShell
      backHref={null}
      brandSub={formatTgl}
      headerExtra={
        <span className="sa-hide-mobile">
          <button type="button" className="sa-btn is-dark" onClick={() => setActiveModal("login")}>
            <IconUserCircle size={15} /> Staf Internal
          </button>
        </span>
      }
      bottomNav={
        <>
          <button type="button" className="sa-nav-item is-active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <IconHome size={21} />
            <span>Home</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => { setActiveModal("helpdesk"); setHelpdeskTab("LAPOR"); }}>
            <IconWrench size={21} />
            <span>Kerusakan</span>
          </button>
          <button type="button" className="sa-nav-fab" onClick={() => setActiveModal("sbo")} aria-label="Lapor Bahaya (SBO)">
            <IconAlertTriangle size={22} color="#fff" />
          </button>
          <button type="button" className="sa-nav-item" onClick={() => { setActiveModal("atk"); setAtkTab("REQUEST"); }}>
            <IconClipboard size={21} />
            <span>ATK</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => setActiveModal("login")}>
            <IconUserCircle size={21} />
            <span>Staf</span>
          </button>
        </>
      }
    >

      {/* 💡 DESIGN TOKENS + CSS — dashboard app-style: header ramping, ringkasan merah, menu cepat,
          tren aktivitas & kalender aktivitas, tim bertugas, bottom nav ala aplikasi native */}
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --shadow-card: none;
          --shadow-card-hover: none;
        }

        /* 🧭 HEADER */
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
          position: relative; width: 100%; display: flex; align-items: center; font-family: inherit; color: inherit;
          cursor: pointer; border-radius: 18px; background: var(--surface); border: 1px solid var(--line);
          box-shadow: var(--shadow-card); transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }
        /* Grid kolom TETAP (bukan auto-fit/minmax) — auto-fit bikin kartu terakhir yang sendirian
           di baris terakhir ikut melebar ngisi sisa kolom (gak proporsional sama kartu lain).
           3 kolom dipakai SAMA di mobile & desktop -- di mobile cuma 3 kartu yang kelihatan
           (Request ATK/Kerusakan/Bahaya SBO disembunyikan, sudah ada di bottom-nav), jadi 3
           kolom pas jadi 1 baris rapi. Sebelumnya mobile pakai 2 kolom, bikin 3 kartu itu
           kepotong jadi "2 lalu 1 sendirian" yang keliatan berantakan -- ini yang dikeluhkan. */
        .menu-cepat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .qa-card { padding: 14px 8px !important; flex-direction: column !important; text-align: center; gap: 8px !important; }
        .qa-teks { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .qa-judul { color: var(--ink); font-size: 12px; font-weight: 800; }
        .qa-sub { display: none; color: var(--muted); font-size: 11px; }
        .qa-badge { flex-shrink: 0; padding: 2px 7px; border-radius: 8px; background: var(--brand); color: #fff; font-size: 10px; font-weight: 800; white-space: nowrap; }
        .qa-card:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
        @media (min-width: 640px) {
          .menu-cepat-grid { gap: 12px; }
          .qa-card { padding: 18px !important; flex-direction: row !important; text-align: left; gap: 12px !important; }
          .qa-judul { font-size: 14px; }
          .qa-sub { display: block; }
          .qa-badge { margin-left: auto; }
        }
        .qa-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-card-hover); border-color: rgba(220,38,38,0.28); }
        /* Kartu Survei Kepuasan cuma tampil sesekali (kampanye aktif admin) & melebar 1 baris penuh
           (bukan ikut grid 3 kolom kartu lain) -- tetap tampilkan subtitle "X hari lagi" bahkan di
           mobile (beda dari .qa-card biasa yang nyembunyiin <p> di layar kecil). */
        .qa-card-survei { flex-direction: row !important; text-align: left; }
        .qa-card-survei .qa-sub { display: block !important; }
        .qa-card-survei:hover { border-color: rgba(124,58,237,0.35) !important; }
        .qa-icon-chip {
          width: 44px; height: 44px; border-radius: 13px; background: var(--red-50); color: var(--red-600);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .section-title { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
        .section-title-icon { background: var(--red-50); color: var(--red-600); padding: 10px; border-radius: 12px; display: flex; }
        /* ⏱️ LEMBUR (§58V) */
        .lembur-daftar { display: flex; flex-direction: column; gap: 12px; }
        .lembur-daftar .is-lewat { opacity: 0.7; }
        .lembur-hari-ini { color: var(--red-600) !important; }
        .lembur-item { display: flex; gap: 12px; padding: 10px 12px; border-radius: 14px; background: var(--bg); margin-bottom: 6px; }
        .lembur-jam { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; min-width: 92px; }
        .lembur-jam b { font-size: 13px; color: var(--ink); font-variant-numeric: tabular-nums; }
        .lembur-jam span { font-size: 11px; color: var(--muted); }
        .lembur-isi { flex: 1; min-width: 0; }
        .lembur-area { font-size: 13px; font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
        .lembur-pemohon { font-size: 12px; color: var(--muted); margin-top: 2px; overflow-wrap: anywhere; }
        /* 🚗 ARMADA (§58U) */
        .armada-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; margin-bottom: 14px; }
        .armada-unit { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: 16px; border: 2px solid transparent; background: var(--bg); font-family: inherit; color: inherit; cursor: pointer; min-width: 0; }
        .armada-unit.is-dipilih { border-color: var(--ink); background: var(--tile); }
        .armada-unit:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
        .armada-ikon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .armada-plat { font-size: 11.5px; font-weight: 800; color: var(--ink); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .armada-status { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
        .armada-titik { width: 6px; height: 6px; border-radius: 50%; }
        .armada-filter { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--ink-soft); margin-bottom: 10px; }
        .armada-filter button { border: none; background: none; color: var(--brand); font-weight: 700; font-family: inherit; font-size: 12px; cursor: pointer; padding: 4px 0; }
        .armada-riwayat { display: flex; flex-direction: column; gap: 12px; }
        .armada-hari { font-size: 11px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .armada-log { display: flex; align-items: stretch; gap: 10px; padding: 7px 0; }
        .armada-jam { width: 40px; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--ink-soft); font-variant-numeric: tabular-nums; padding-top: 1px; }
        .armada-garis { width: 3px; border-radius: 2px; flex-shrink: 0; }
        .armada-log-isi { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .armada-log-atas { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--ink); }
        .armada-pil { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 8px; }
        .armada-log-detail { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
        .armada-log-pencatat { font-size: 11px; opacity: 0.85; }
        .armada-booking { font-size: 10px; font-weight: 800; color: #fff; background: var(--accent-solid); padding: 1px 7px; border-radius: 8px; }
                .armada-pemakai { font-size: 10.5px; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .list-row {
          display: flex; gap: 12px; padding: 13px 15px; border-radius: 13px; background: var(--bg);
          border-left: 3px solid var(--line);
        }
        .team-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
        .tim-grup-judul { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; font-size: 12px; font-weight: 800; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; }
        .tim-grup-jumlah { font-size: 11px; color: var(--muted); }
        .tim-grup-ket { margin-left: auto; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: none; letter-spacing: 0; text-align: right; }
        .tim-label { font-size: 10px; font-weight: 800; padding: 4px 9px; border-radius: 20px; flex-shrink: 0; letter-spacing: 0.02em; }
        .tim-kosong { padding: 12px 14px; border-radius: 14px; border: 1px dashed var(--line); color: var(--muted); font-size: 12.5px; }
        .tim-berikut { font-size: 12px; color: var(--ink-soft); padding: 10px 14px; border-radius: 14px; background: var(--bg); line-height: 1.5; }
        .team-avatar { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .team-avatar-fallback { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; }
        .status-op-row { display: flex; align-items: center; gap: 12px; padding: 14px 0; border: none; border-bottom: 1px solid #f0efee; width: 100%; background: none; font-family: inherit; text-align: left; cursor: pointer; color: inherit; }
        .status-op-row:hover .status-op-judul { color: var(--brand); }
        .status-op-row:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; border-radius: 8px; }
        .status-op-teks { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .status-op-judul { font-size: 13px; font-weight: 700; color: var(--ink); }
        .status-op-sub { font-size: 11.5px; color: var(--ink-soft); line-height: 1.4; }
        .status-op-detail { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .status-op-titik { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        #riwayat-armada-section, #overtime-section { scroll-margin-top: 90px; }
        .status-op-row:last-child { border-bottom: none; }

        /* 📊 CHART BARS */
        .tren-seri { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
        .tren-chip { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px 12px; border-radius: 14px; border: 1px solid transparent; background: var(--bg); color: var(--ink-soft); font-family: inherit; cursor: pointer; text-align: left; min-width: 0; }
        .tren-chip.is-active { background: var(--tile); border-color: var(--ink); color: var(--ink); }
        .tren-chip:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
        .tren-chip-atas { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .tren-chip-angka { font-size: 19px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
        .tren-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .tren-banding { font-size: 12px; color: var(--ink-soft); font-weight: 600; margin-bottom: 14px; min-height: 16px; }
        .tren-grafik { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
        .tren-kolom { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
        .tren-nilai { font-size: 12px; font-weight: 800; color: var(--ink); min-height: 15px; font-variant-numeric: tabular-nums; }
        .tren-batang-wadah { width: 100%; max-width: 34px; height: 110px; display: flex; align-items: flex-end; border-radius: 9px; background: var(--bg); overflow: hidden; }
        .tren-batang { width: 100%; border-radius: 9px; transition: height 0.35s ease; }
        .tren-hari { font-size: 10.5px; font-weight: 700; color: var(--muted); white-space: nowrap; }
        .tren-tgl { font-size: 10px; color: var(--muted); margin-top: -3px; }
        .tren-kolom.is-hari-ini .tren-hari { color: var(--red-600); font-weight: 800; }
        @media (max-width: 520px) {
          .tren-seri { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .tren-kolom.is-hari-ini .tren-hari { font-size: 9.5px; }
        }

        /* 🗓️ KALENDER AKTIVITAS */
        .kalender-cell { aspect-ratio: 1; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-family: inherit; padding: 0; cursor: pointer; min-width: 0; }
        .kalender-cell.is-nanti { cursor: default; opacity: 0.45; }
        .kalender-cell.is-dipilih { box-shadow: 0 0 0 2px var(--tile), 0 0 0 3.5px var(--ink); }
        .kalender-cell:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
        .kal-kepala { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .kal-pilih { height: 34px; font-size: 12px; max-width: 55%; color: var(--ink); }
        .kal-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
        .kal-panah { width: 34px; height: 34px; border-radius: 50%; border: none; background: var(--bg); color: var(--ink); font-size: 18px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .kal-panah:disabled { opacity: 0.3; cursor: default; }
        .kal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
        .kal-hari { font-size: 10px; color: var(--muted); font-weight: 700; text-align: center; }
        .kal-hari.is-akhir-pekan { color: var(--red-600); opacity: 0.75; }
        .kal-detail { margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: var(--bg); min-height: 44px; }
        .kal-detail-angka { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--ink-soft); }
        .kal-detail-angka > span { display: inline-flex; align-items: center; gap: 6px; }
        .kal-detail-angka b { color: var(--ink); }
        @media (min-width: 480px) { .kalender-cell { font-size: 14px; } }

        /* 📱 BOTTOM NAV APP-STYLE */
        .mobile-only { display: none; }
        /* display:flex (bukan block) — wrapper ini adalah 1 grid item di .menu-cepat-grid yang
           sudah otomatis di-stretch penuh setinggi baris (default align-items:stretch grid), tapi
           child .qa-card di dalamnya (display:block) gak otomatis ngisi tinggi wrapper tanpa ini —
           flex container 1 child + default align-items:stretch beres-in itu tanpa perlu height:100%
           eksplisit (yang sempat dicoba tapi malah bikin kartu LAIN yang gak dibungkus jadi overflow
           keluar baris — height:100% pada grid item langsung ternyata gak konsisten sama auto-row-sizing). */
        .desktop-only-hide { display: flex; }
        @media (max-width: 768px) {
          .mobile-only { display: flex; }
          .desktop-only-hide { display: none; }
        }
      
        /* 🎨 PORTAL BENTO HANGAT (§58M) -- grid 12 kolom, token dari components/admin/admin-theme.css */
        .portal-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
        .portal-grid > * { min-width: 0; }
        .portal-sesi { grid-column: 1 / -1; order: 0; }
        .portal-ringkasan { grid-column: span 5; order: 1; }
        .portal-pengumuman { grid-column: span 7; order: 2; border-radius: 28px; overflow: hidden; display: flex; flex-direction: column; }
        .portal-pengumuman { background: var(--tile); border: 1px solid var(--line); }
        .portal-pengumuman > .pgm { flex: 1; }
        .portal-grid.tanpa-pengumuman .portal-ringkasan { grid-column: 1 / -1; }
        .portal-menu { grid-column: 1 / -1; order: 3; }
        .portal-tren { grid-column: span 5; order: 4; }
        .portal-kalender { grid-column: span 4; order: 5; }
        .portal-status { grid-column: span 3; order: 6; }
        .portal-tim { grid-column: span 4; order: 7; background: var(--tile); border-radius: 28px; padding: 22px; }
        .portal-detail { grid-column: span 8; order: 8; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .portal-tren > div, .portal-kalender > div, .portal-status > div, .portal-detail > div {
          min-width: 0; box-sizing: border-box;
          background: var(--tile) !important; border: none !important; border-radius: 28px !important; box-shadow: none !important; height: 100%; margin: 0 !important;
        }
        .ringkasan-strip { background: var(--brand) !important; border-radius: 28px !important; box-shadow: none !important; height: 100%; box-sizing: border-box; }
        .ringkasan-strip::before { display: none !important; }
        .ringkasan-chip { background: rgba(0,0,0,0.2) !important; border: none !important; border-radius: 16px !important; color: #fff; font-family: inherit; cursor: pointer; min-width: 0; transition: background 0.15s; }
        .ringkasan-chip:hover { background: rgba(0,0,0,0.3) !important; }
        .ringkasan-angka { font-size: 20px; font-weight: 800; line-height: 1.15; font-variant-numeric: tabular-nums; }
        .ringkasan-angka.is-teks { font-size: 15px; }
        .ringkasan-dari { font-size: 13px; font-weight: 700; opacity: 0.75; }
        .ringkasan-label { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.85); margin-top: 2px; }
        .ringkasan-sub { font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.72); margin-top: 3px; }
        .ringkasan-nama { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.35; }
        #tim-bertugas-section, #status-operasional-section { scroll-margin-top: 90px; }
        .qa-card { background: var(--tile) !important; border: none !important; border-radius: 22px !important; box-shadow: none !important; }
        .qa-card:hover { transform: translateY(-2px); }
        .team-row { background: var(--bg) !important; border: none !important; border-radius: 16px !important; }
        .list-row { background: var(--bg) !important; border-radius: 14px !important; }
        .status-op-row { border-bottom-color: var(--line) !important; }
        @media (min-width: 1000px) {
          .menu-cepat-grid { grid-template-columns: repeat(6, minmax(0, 1fr)) !important; }
          .qa-card { flex-direction: column !important; align-items: flex-start !important; }
          .qa-badge { margin-left: 0; }
        }
        @media (max-width: 1080px) {
          .portal-ringkasan, .portal-pengumuman { grid-column: 1 / -1; }
          .portal-tren { grid-column: span 7; }
          .portal-kalender { grid-column: span 5; }
          .portal-status, .portal-tim, .portal-detail { grid-column: 1 / -1; }
        }
        @media (max-width: 720px) {
          .portal-grid { gap: 12px; }
          .portal-grid > * { grid-column: 1 / -1 !important; }
          .portal-pengumuman { order: 1; }
          .portal-ringkasan { order: 2; }
          .portal-detail { grid-template-columns: minmax(0, 1fr); }
          .portal-tim { padding: 18px; }
        }
      `}} />


      <div className={`portal-grid${pengumumanTayang.length > 0 ? "" : " tanpa-pengumuman"}`}>
        {/* 👋 SESI STAF MASIH AKTIF -- lihat catatan lengkap di deklarasi state sesiStafAktif */}
        {sesiStafAktif && !bannerSesiDitutup && (
          <div className="portal-sesi" style={{ background: "var(--info-50, #eff6ff)", borderRadius: "20px", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", flexWrap: "wrap", fontSize: "12.5px" }}>
            <span style={{ color: "var(--info, #2563eb)", fontWeight: 700 }}>👋 Anda masih login sebagai {sesiStafAktif.nama} ({sesiStafAktif.dept})</span>
            <button
              onClick={() => router.push(sesiStafAktif.path)}
              style={{ padding: "5px 14px", background: "var(--info, #2563eb)", color: "#fff", border: "none", borderRadius: "20px", fontWeight: 700, fontSize: "11.5px", cursor: "pointer" }}
            >
              Lanjut ke Dashboard
            </button>
            <button
              onClick={() => setBannerSesiDitutup(true)}
              style={{ padding: "5px 10px", background: "none", border: "none", color: "var(--muted, #71717a)", fontWeight: 700, fontSize: "11.5px", cursor: "pointer" }}
            >
              Tutup
            </button>
          </div>
        )}

        {/* 📢 PENGUMUMAN GEDUNG (§58O) -- teks / poster gambar / video, admin kelola di admin/broadcast. */}
        {pengumumanTayang.length > 0 && (
          <div className="portal-pengumuman">
            <PengumumanCarousel daftar={pengumumanTayang} />
          </div>
        )}


        {/* 🔴 RINGKASAN HARI INI */}
        <div className="ringkasan-strip portal-ringkasan">
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>Ringkasan Hari Ini</div>
              <div style={{ fontSize: "19px", fontWeight: 800, marginTop: "5px" }}>{judulRingkasan}</div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" className="ringkasan-chip" onClick={() => lompatKe("tim-bertugas-section")} aria-label="Lihat tim OB & CS bertugas">
                <div className="ringkasan-angka">{obLibur ? "Libur" : hadirOB.length}</div>
                <div className="ringkasan-label">OB &amp; CS {obLibur ? "akhir pekan" : "bertugas"}</div>
              </button>
              <button type="button" className="ringkasan-chip" onClick={() => lompatKe("status-operasional-section")} aria-label="Lihat status armada">
                <div className="ringkasan-angka">{jumlahArmadaSiap}<span className="ringkasan-dari">/{mobilStatus.length}</span></div>
                <div className="ringkasan-label">Armada siap</div>
                <div className="ringkasan-sub">{jumlahArmadaKeluar} sedang keluar</div>
              </button>
              <button type="button" className="ringkasan-chip" onClick={() => lompatKe("tim-bertugas-section")} aria-label="Lihat Security yang sedang jaga">
                <div className="ringkasan-angka is-teks">{securityShift.currentName.split(" (")[0]}</div>
                <div className="ringkasan-label">{securityShift.currentName.match(/\(([^)]+)\)/)?.[1]?.replace(" - ", " – ") || "Security"}</div>
                <div className="ringkasan-sub ringkasan-nama">{securityShift.current.length > 0 ? securityShift.current.join(" · ") : "Belum ada jadwal"}</div>
              </button>
            </div>
          </div>
        </div>

        {/* 🧱 MENU CEPAT — satu grid dipakai HP & desktop, gantikan desktop-grid + mobile-nav lama yang isinya duplikat */}
        <div className="portal-menu" id="menu-cepat-section">
          <div style={{ fontSize: "15px", fontWeight: 800, marginBottom: "12px", color: "var(--ink)" }}>Menu Cepat</div>
          <div className="menu-cepat-grid">
            <button type="button" className="qa-card" onClick={() => bukaPencarian("tamu")}>
              <span className="qa-icon-chip"><IconIdCard size={20} /></span>
              <span className="qa-teks"><span className="qa-judul">Lacak Tamu</span><span className="qa-sub">Cek tamu yang datang</span></span>
              {jumlahTamuDiDalam > 0 && <span className="qa-badge">{jumlahTamuDiDalam} di dalam</span>}
            </button>
            <button type="button" className="qa-card" onClick={() => bukaPencarian("paket")}>
              <span className="qa-icon-chip"><IconPackage size={20} /></span>
              <span className="qa-teks"><span className="qa-judul">Cek Paket</span><span className="qa-sub">Paket kiriman untuk Anda</span></span>
              {jumlahPaketMenunggu > 0 && <span className="qa-badge">{jumlahPaketMenunggu} menunggu</span>}
            </button>
            <button type="button" className="qa-card qa-card-booking" onClick={() => setBookingBuka({ jenis: "ruangan", objekId: null })}>
              <span className="qa-icon-chip"><IconClock size={20} /></span>
              <span className="qa-teks"><span className="qa-judul">Booking Ruangan</span><span className="qa-sub">Meeting, tamu & kesehatan</span></span>
            </button>
            {/* Request ATK, Kerusakan & Bahaya SBO disembunyikan di mobile (sudah ada di bottom-nav: ATK,
                Kerusakan, FAB tengah) -- di desktop tetap muncul karena tidak ada bottom-nav. Dibungkus
                wrapper supaya display:flex bawaan .qa-card tidak ketiban class toggle-nya. */}
            <div className="desktop-only-hide">
              <button type="button" className="qa-card" onClick={() => { setActiveModal("atk"); setAtkTab("REQUEST"); }}>
                <span className="qa-icon-chip"><IconClipboard size={20} /></span>
                <span className="qa-teks"><span className="qa-judul">Request ATK</span><span className="qa-sub">Minta barang kantor ke GA</span></span>
              </button>
            </div>
            {/* §85: "Lembur AC" dihapus dari portal -- lembur kini dicatat lewat Validasi Karyawan oleh Security (§59), agar tidak dobel. */}
            <div className="desktop-only-hide">
              <button type="button" className="qa-card" onClick={() => { setActiveModal("helpdesk"); setHelpdeskTab("LAPOR"); }}>
                <span className="qa-icon-chip"><IconWrench size={20} /></span>
                <span className="qa-teks"><span className="qa-judul">Kerusakan</span><span className="qa-sub">Lapor fasilitas rusak</span></span>
              </button>
            </div>
            <div className="desktop-only-hide">
              <button type="button" className="qa-card" onClick={() => setActiveModal("sbo")}>
                <span className="qa-icon-chip"><IconAlertTriangle size={20} /></span>
                <span className="qa-teks"><span className="qa-judul">Bahaya SBO</span><span className="qa-sub">Temuan kondisi berbahaya</span></span>
              </button>
            </div>
            {surveiAktif && (
              <button type="button" className="qa-card qa-card-survei" onClick={() => router.push("/survei-kepuasan")} style={{ gridColumn: "1 / -1" }}>
                <span className="qa-icon-chip" style={{ background: "var(--accent-50, #f5f3ff)", color: "var(--accent, #7c3aed)" }}><IconClipboardSurvei size={20} /></span>
                <span className="qa-teks">
                  <span className="qa-judul">Survei Kepuasan Gedung</span>
                  <span className="qa-sub">Isi kuesioner pelayanan gedung — {sisaHariSurvei} hari lagi</span>
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 📊 TREN AKTIVITAS GEDUNG (§58Q) -- 1 seri ditampilkan per kali (pilih lewat chip), angka tiap hari terlihat tanpa hover */}
        <div id="tren-aktivitas-section" className="portal-tren">
        <Card style={{ borderRadius: "20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "var(--ink)" }}>Tren Aktivitas Gedung</h3>
            <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>7 hari terakhir</span>
          </div>
          <div className="tren-seri" role="tablist" aria-label="Pilih data tren">
            {SERI_TREN.map((s) => {
              const total = totalSeri(s.key);
              return (
                <button key={s.key} type="button" role="tab" aria-selected={seriTren === s.key} className={`tren-chip${seriTren === s.key ? " is-active" : ""}`} onClick={() => setSeriTren(s.key)}>
                  <span className="tren-chip-atas"><span className="tren-dot" style={{ background: s.warna }} />{s.label}</span>
                  <span className="tren-chip-angka">{trenHarian ? (total ?? "—") : "…"}</span>
                </button>
              );
            })}
          </div>
          <div className="tren-banding">
            {!trenHarian ? "Menghitung..." : totalSeriAktif === null ? "Sebagian data gagal dimuat." : `${totalSeriAktif} ${infoSeriTren.satuan} dalam 7 hari${perbandinganTren ? " · " + perbandinganTren : ""}`}
          </div>
          <div className="tren-grafik" role="img" aria-label={trenHarian ? `${infoSeriTren.label} per hari: ${trenHarian.map((h) => `${h.tanggal.slice(8)} = ${h.nilai[seriTren] ?? "tidak diketahui"}`).join(", ")}` : "Memuat grafik"}>
            {(trenHarian || Array.from({ length: 7 }, (_, i) => ({ tanggal: geserTanggalISO(todayISO, i - 6), nilai: null as NilaiSeri | null }))).map((h) => {
              const v = h.nilai ? h.nilai[seriTren] : null;
              const [y, m, d] = h.tanggal.split("-").map(Number);
              const hariIni = h.tanggal === todayISO;
              return (
                <div key={h.tanggal} className={`tren-kolom${hariIni ? " is-hari-ini" : ""}`}>
                  <span className="tren-nilai">{v ?? (trenHarian ? "—" : "")}</span>
                  <div className="tren-batang-wadah">
                    <div className="tren-batang" style={{ height: `${v ? Math.max(4, (v / maxSeriAktif) * 100) : 0}%`, background: infoSeriTren.warna }} />
                  </div>
                  <span className="tren-hari">{hariIni ? "Hari ini" : NAMA_HARI_PENDEK[new Date(y, m - 1, d).getDay()]}</span>
                  <span className="tren-tgl">{d}</span>
                </div>
              );
            })}
          </div>
        </Card>
        </div>

        {/* 🗓️ KALENDER AKTIVITAS (§58R) -- ketuk tanggal untuk rinciannya, bisa mundur s.d. ~12 bulan */}
        <div className="portal-kalender">
        <Card style={{ borderRadius: "20px" }}>
          <div className="kal-kepala">
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "var(--ink)" }}>Kalender Aktivitas</h3>
            <select className="sa-field kal-pilih" aria-label="Jenis aktivitas di kalender" value={seriKalender} onChange={(e) => setSeriKalender(e.target.value as SeriTren | "semua")}>
              <option value="semua">Semua aktivitas</option>
              {SERI_TREN.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div className="kal-nav">
            <button type="button" className="kal-panah" onClick={() => geserBulanKal(-1)} disabled={bulanKalender <= bulanMinKal} aria-label="Bulan sebelumnya">‹</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "13.5px", fontWeight: 800, color: "var(--ink)" }}>{new Date(thnKal, blnKal - 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>{totalBulanKal === null ? "Menghitung..." : `${totalBulanKal} ${labelSeriKal} bulan ini`}</div>
            </div>
            <button type="button" className="kal-panah" onClick={() => geserBulanKal(1)} disabled={bulanKalender >= bulanIni} aria-label="Bulan berikutnya">›</button>
          </div>
          <div className="kal-grid" style={{ marginBottom: "6px" }}>
            {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((h) => <span key={h} className={`kal-hari${h === "Sab" || h === "Min" ? " is-akhir-pekan" : ""}`}>{h}</span>)}
          </div>
          <div className="kal-grid">
            {Array.from({ length: kosongAwalKal }).map((_, idx) => <div key={`blank-${idx}`} />)}
            {hariKalender.map((h) => {
              const level = levelKalender(h.nilai);
              const gagal = h.dimuat && h.nilai === null && !h.nanti;
              return (
                <button
                  key={h.iso}
                  type="button"
                  className={`kalender-cell${h.nanti ? " is-nanti" : ""}${tanggalDetailKal === h.iso ? " is-dipilih" : ""}`}
                  disabled={h.nanti}
                  onClick={() => setTanggalDipilih(h.iso)}
                  aria-label={`${h.tanggal} ${new Date(thnKal, blnKal - 1).toLocaleDateString("id-ID", { month: "long" })}: ${h.nanti ? "belum terjadi" : h.nilai === null ? "belum dimuat" : `${h.nilai} ${labelSeriKal}`}`}
                  aria-pressed={tanggalDetailKal === h.iso}
                  style={{
                    background: h.nanti ? "transparent" : WARNA_LEVEL_KALENDER[level],
                    border: gagal ? "1px dashed var(--line)" : h.nanti ? "1px solid var(--line)" : "none",
                    color: level >= 2 ? "#fff" : h.hariIni ? "var(--red-600)" : "var(--ink-soft)",
                    fontWeight: h.hariIni ? 800 : 700,
                  }}
                >
                  {h.tanggal}
                </button>
              );
            })}
          </div>
          <div className="kal-detail" aria-live="polite">
            {tanggalDetailKal ? (
              <>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--ink)", marginBottom: "6px" }}>
                  {tanggalDetailKal === todayISO ? "Hari ini, " : ""}{new Date(`${tanggalDetailKal}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
                </div>
                <div className="kal-detail-angka">
                  {SERI_TREN.map((s) => (
                    <span key={s.key}><span className="tren-dot" style={{ background: s.warna }} />{s.label} <b>{detailKal ? (detailKal[s.key] ?? "—") : "…"}</b></span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>Ketuk tanggal untuk melihat rinciannya.</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", marginTop: "12px" }}>
            <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600 }}>Sepi</span>
            <div style={{ display: "flex", gap: "2px" }}>
              {WARNA_LEVEL_KALENDER.map((c, idx) => <div key={idx} style={{ width: "12px", height: "12px", borderRadius: "3px", background: c }} />)}
            </div>
            <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600 }}>Ramai</span>
          </div>
        </Card>
        </div>

        {/* 👥 TIM BERTUGAS (§58T) -- per unit; label dari absensi (OB/Security) & status terakhir driver */}
        <div className="portal-tim" id="tim-bertugas-section">
          <div className="section-title">
            <div className="section-title-icon"><IconShield size={18} /></div>
            <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", fontWeight: 800 }}>Tim Bertugas</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {kelompokTim.map((k) => (
              <div key={k.key}>
                <div className="tim-grup-judul">
                  <span>{k.judul}</span>
                  {k.anggota.length > 0 && <span className="tim-grup-jumlah">{k.anggota.length}</span>}
                  {k.ket && <span className="tim-grup-ket">{k.ket}</span>}
                </div>
                {k.anggota.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {k.anggota.map((a) => {
                      const w = WARNA_NADA[a.nada];
                      return (
                        <div className="team-row" key={a.key}>
                          {a.foto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.foto} alt="" className="team-avatar" />
                          ) : (
                            <div className="team-avatar-fallback" style={{ background: w.bg, color: w.fg }}>{getInitials(a.nama)}</div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>{a.nama}</div>
                            <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.sub}</div>
                          </div>
                          <span className="tim-label" style={{ color: w.fg, background: w.bg }}>{a.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="tim-kosong">{k.kosong}</div>
                )}
              </div>
            ))}
            {securityShift.next.length > 0 && (
              <div className="tim-berikut">
                <b>Security berikutnya</b> · {securityShift.nextName}: {securityShift.next.join(", ")}
              </div>
            )}
          </div>
        </div>

        {/* ⚙️ STATUS OPERASIONAL (§58S) -- tiap baris bisa diketuk ke detailnya; warna titik: hijau normal,
            oranye perlu perhatian, biru info (lembur bukan masalah, jadi tidak oranye). */}
        <div className="portal-status" id="status-operasional-section">
        <Card style={{ borderRadius: "20px", padding: "6px 20px" }}>
          <button type="button" className="status-op-row" onClick={() => lompatKe("riwayat-armada-section")}>
            <span className="section-title-icon" style={{ background: "var(--info-50)", color: "var(--info)", margin: 0, padding: "9px" }}><IconTruck size={16} /></span>
            <span className="status-op-teks">
              <span className="status-op-judul">Armada</span>
              <span className="status-op-sub">
                {mobilStatus.length === 0 ? "Belum ada data kendaraan" : `${jumlahArmadaSiap} siap · ${jumlahArmadaKeluar} keluar${jumlahArmadaBengkel ? ` · ${jumlahArmadaBengkel} di bengkel` : ""}${jumlahArmadaPulang ? ` · ${jumlahArmadaPulang} dibawa pulang` : ""}`}
              </span>
            </span>
            <span className="status-op-titik" style={{ background: mobilStatus.length > 0 && jumlahArmadaSiap === 0 ? "var(--warn)" : "var(--ok)" }} aria-hidden="true" />
          </button>
          <button type="button" className="status-op-row" onClick={() => { setActiveModal("helpdesk"); setHelpdeskTab("LACAK"); }}>
            <span className="section-title-icon" style={{ background: "var(--ok-50)", color: "var(--ok)", margin: 0, padding: "9px" }}><IconWrench size={16} /></span>
            <span className="status-op-teks">
              <span className="status-op-judul">Perbaikan Gedung</span>
              <span className="status-op-sub">
                {tiketTerbuka.length === 0
                  ? "Tidak ada laporan kerusakan terbuka"
                  : `${tiketDikerjakan.length} dikerjakan · ${tiketTerbuka.length - tiketDikerjakan.length} menunggu`}
              </span>
              {tiketDikerjakan.length > 0 && (
                <span className="status-op-sub status-op-detail">Sedang: {tiketDikerjakan.slice(0, 2).map((tk) => tk.lokasi).join(", ")}{tiketDikerjakan.length > 2 ? ` +${tiketDikerjakan.length - 2}` : ""}</span>
              )}
            </span>
            <span className="status-op-titik" style={{ background: tiketTerbuka.length > 0 ? "var(--warn)" : "var(--ok)" }} aria-hidden="true" />
          </button>
          <div className="status-op-row" style={{ cursor: "default" }}>
            <span className="section-title-icon" style={{ background: "var(--accent-50)", color: "var(--accent)", margin: 0, padding: "9px" }}><IconIdCard size={16} /></span>
            <span className="status-op-teks">
              <span className="status-op-judul">Kehadiran Karyawan</span>
              <span className="status-op-sub">
                {kehadiranKaryawan.lembur.length === 0 && kehadiranKaryawan.tidakMasuk.length === 0
                  ? "Belum ada catatan lembur / tidak masuk"
                  : `${kehadiranKaryawan.lembur.length} sedang lembur · ${kehadiranKaryawan.tidakMasuk.length} tidak masuk`}
              </span>
              {kehadiranKaryawan.lembur.length > 0 && <span className="status-op-sub status-op-detail">Lembur: {kehadiranKaryawan.lembur.join(", ")}</span>}
              {kehadiranKaryawan.tidakMasuk.length > 0 && <span className="status-op-sub status-op-detail">Tidak masuk: {kehadiranKaryawan.tidakMasuk.join(", ")}</span>}
            </span>
          </div>
          <button type="button" className="status-op-row" onClick={() => lompatKe("overtime-section")}>
            <span className="section-title-icon" style={{ background: "var(--warn-50)", color: "var(--warn)", margin: 0, padding: "9px" }}><IconClock size={16} /></span>
            <span className="status-op-teks">
              <span className="status-op-judul">Lembur Hari Ini</span>
              <span className="status-op-sub">
                {lemburHariIni.length === 0 ? "Tidak ada lembur" : `${lemburHariIni.length} area · ${lemburHariIni.map((ot) => `${ot.area_ruangan} (${ot.jam_mulai}–${lemburBerlangsung(ot) ? "sekarang" : ot.jam_selesai})`).slice(0, 2).join(", ")}${lemburHariIni.length > 2 ? "…" : ""}`}
              </span>
              <span className="status-op-sub status-op-detail">{lemburAktif.length} pengajuan minggu ini</span>
            </span>
            <span className="status-op-titik" style={{ background: lemburHariIni.length > 0 ? "var(--info)" : "var(--muted)" }} aria-hidden="true" />
          </button>
        </Card>
        </div>

        {/* 🚗 DETAIL RIWAYAT ARMADA + ⏱️ OVERTIME MINGGU INI (kartu detail, tetap dipertahankan dari versi lama) */}
        <div className="portal-detail">

          <Card style={{ borderRadius: "18px" }}>
            <div className="section-title" id="riwayat-armada-section">
              <div className="section-title-icon"><IconTruck size={18} /></div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", fontWeight: 800 }}>Armada Operasional</h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Ketuk kendaraan untuk booking & lihat jadwalnya</p>
              </div>
            </div>
            {mobilStatus.length > 0 && (
              <div className="armada-grid">
                {mobilStatus.map((k) => {
                  const info = INFO_KATEGORI_ARMADA[kategoriArmada(k.status_kendaraan)];
                  const dipilih = filterPlatArmada === k.kendaraan;
                  const bookingKini = bookingBerjalan.find((b) => b.objek_id === k.kendaraan && b.mulai.toMillis() <= Date.now());
                  return (
                    <button
                      key={k.kendaraan} type="button" className={`armada-unit${dipilih ? " is-dipilih" : ""}`}
                      onClick={() => setBookingBuka({ jenis: "kendaraan", objekId: k.kendaraan })}
                      aria-label={`${k.kendaraan}: ${info.label}${bookingKini ? `, dibooking ${bookingKini.nama_pemesan}` : ""}. Ketuk untuk booking`}
                    >
                      <span className="armada-ikon" style={{ background: info.bg }}>
                        <VehicleIcon3D jenis={kendaraanMetaMap[k.kendaraan]?.kategori} warna={kendaraanMetaMap[k.kendaraan]?.warna} size={22} />
                      </span>
                      <span className="armada-plat">{k.kendaraan}</span>
                      <span className="armada-status" style={{ color: info.fg }}><span className="armada-titik" style={{ background: info.fg }} />{info.label}</span>
                      {k.driver_bertugas && k.driver_bertugas !== "-" && <span className="armada-pemakai">{k.driver_bertugas.replace("Standby: ", "")}</span>}
                      {bookingKini && <span className="armada-booking" title={`${bookingKini.nama_pemesan} · ${rentangWaktu(bookingKini.mulai.toDate(), bookingKini.sampai.toDate())}`}>Dibooking</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {filterPlatArmada && (
              <div className="armada-filter">
                Riwayat <b>{filterPlatArmada}</b>
                <button type="button" onClick={() => setFilterPlatArmada(null)}>Tampilkan semua</button>
              </div>
            )}
            {grupRiwayatArmada.length > 0 ? (
              <div className="armada-riwayat">
                {grupRiwayatArmada.map((g) => (
                  <div key={g.tanggal}>
                    <div className="armada-hari">{labelHariRiwayat(g.tanggal)}</div>
                    {g.log.map((log, idx) => {
                      const kat = kategoriArmada(log.status_kendaraan);
                      const info = INFO_KATEGORI_ARMADA[kat];
                      const driver = log.driver_bertugas?.replace("Standby: ", "");
                      const tujuan = log.tujuan_keperluan && log.tujuan_keperluan !== "-" ? log.tujuan_keperluan : "";
                      // Keluar = yang membawa; Tiba/Pulang = pemakai terakhir (dibawa dari log sebelumnya). §58U-b
                      const pemakai = driver && driver !== "-" ? `${kat === "keluar" ? "Dibawa" : "Pemakai terakhir"}: ${driver}` : "";
                      const detail = [pemakai, kat === "keluar" && tujuan ? `ke ${tujuan}` : ""].filter(Boolean).join(" · ");
                      const pencatat = (log.petugas_security || "").replace(" (Auto-Sync Buku Tamu)", " · otomatis dari Buku Tamu");
                      return (
                        <div key={`${g.tanggal}-${idx}`} className="armada-log">
                          <span className="armada-jam">{log.waktu_catat ? jamTimWITA(log.waktu_catat) : "-"}</span>
                          <span className="armada-garis" style={{ background: info.fg }} />
                          <span className="armada-log-isi">
                            <span className="armada-log-atas">
                              <b>{getPlat(log.kendaraan)}</b>
                              <span className="armada-pil" style={{ color: info.fg, background: info.bg }}>{kat === "siap" ? "Tiba / standby" : info.label}</span>
                            </span>
                            {detail && <span className="armada-log-detail">{detail}</span>}
                            {pencatat && <span className="armada-log-detail armada-log-pencatat">Diupdate oleh {pencatat}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {riwayatArmadaTersaring.length > BATAS_RIWAYAT_ARMADA && (
                  <button type="button" className="sa-btn is-soft" style={{ width: "100%" }} onClick={() => setRiwayatArmadaLengkap((v) => !v)}>
                    {riwayatArmadaLengkap ? "Tampilkan lebih sedikit" : `Tampilkan ${riwayatArmadaTersaring.length - BATAS_RIWAYAT_ARMADA} catatan lagi`}
                  </button>
                )}
              </div>
            ) : (
              <div className="tim-kosong">{filterPlatArmada ? `Belum ada riwayat ${filterPlatArmada} di ${logKendaraanMentah.length} catatan terakhir.` : "Belum ada riwayat kendaraan tercatat."}</div>
            )}
          </Card>

          <Card style={{ borderRadius: "18px" }}>
            <div className="section-title" id="overtime-section">
              <div className="section-title-icon"><IconClock size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", fontWeight: 800 }}>Lembur Gedung Minggu Ini</h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "11.5px", color: "var(--muted)" }}>
                  {tanggalPendek(seninMingguIni)} – {tanggalPendek(mingguMingguIni)}
                  {lemburAktif.length > 0 && <> · {lemburAktif.length} pengajuan · {formatDurasi(totalMenitLembur)}</>}
                </p>
              </div>
            </div>
            {lemburAktif.length === 0 ? (
              <div className="tim-kosong" style={{ textAlign: "center", padding: "24px 14px" }}>Belum ada lembur tercatat minggu ini.</div>
            ) : (
              <div className="lembur-daftar">
                {grupLemburDepan.length === 0 && <div className="tim-kosong">Tidak ada lembur hari ini atau sisa minggu ini.</div>}
                {[...grupLemburDepan, ...(lemburLewatTerbuka ? grupLemburLewat : [])].map((g) => (
                  <div key={g.tanggal} className={g.tanggal < todayISO ? "is-lewat" : ""}>
                    <div className={`armada-hari${g.tanggal === todayISO ? " lembur-hari-ini" : ""}`}>{labelHariLembur(g.tanggal)}</div>
                    {g.item.map((ot) => (
                      <div key={ot.id} className="lembur-item">
                        <div className="lembur-jam">
                          <b>{ot.jam_mulai}–{lemburBerlangsung(ot) ? "sekarang" : ot.jam_selesai}</b>
                          <span>{lemburBerlangsung(ot) ? "berlangsung" : formatDurasi(durasiMenitLembur(ot.jam_mulai, ot.jam_selesai))}</span>
                        </div>
                        <div className="lembur-isi">
                          <div className="lembur-area">{ot.area_ruangan}</div>
                          <div className="lembur-pemohon">{ot.nama_pemohon}{ot.departemen ? ` · ${ot.departemen}` : ""}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {jumlahLemburLewat > 0 && (
                  <button type="button" className="sa-btn is-soft" style={{ width: "100%" }} onClick={() => setLemburLewatTerbuka((v) => !v)}>
                    {lemburLewatTerbuka ? "Sembunyikan yang sudah lewat" : `Lihat ${jumlahLemburLewat} lembur yang sudah lewat`}
                  </button>
                )}
              </div>
            )}
          </Card>

        </div>
      </div>


      {/* 📅 BOOKING KENDARAAN / RUANGAN (§80) */}
      <BookingModal
        open={!!bookingBuka}
        onClose={() => setBookingBuka(null)}
        jenis={bookingBuka?.jenis || "ruangan"}
        daftarObjek={bookingBuka?.jenis === "kendaraan" ? daftarSemuaKendaraan.map((p) => ({ id: p, nama: p })) : RUANGAN_BOOKING}
        objekAwal={bookingBuka?.objekId}
        karyawan={employees}
        onLihatRiwayat={(o) => { setFilterPlatArmada(o.id); setRiwayatArmadaLengkap(false); setBookingBuka(null); setTimeout(() => lompatKe("riwayat-armada-section"), 100); }}
      />

      {/* MODAL WRAPPER (via komponen Modal) */}
      <Modal
        open={activeModal !== "none"}
        onClose={() => setActiveModal("none")}
        maxWidth={(activeModal === "tamu" || activeModal === "paket" || activeModal === "sbo") ? "800px" : activeModal === "login" ? "440px" : "550px"}
      >
        {/* MODAL 1: LOGIN */}
        {activeModal === "login" && (
          <>
            {/* §84: modal login dirapikan -- logo Samudera (kartu putih: teks logo hitam tetap terbaca di mode gelap) */}
            <style dangerouslySetInnerHTML={{ __html: `
              .lg-logo { display: flex; justify-content: center; margin: 4px 0 18px; }
              .lg-logo span { background: #fff; padding: 12px 18px; border-radius: 16px; box-shadow: 0 1px 0 rgba(0,0,0,0.04), 0 8px 24px -12px rgba(0,0,0,0.25); }
              .lg-logo img { height: 34px; width: auto; display: block; }
              .lg-field { display: flex; flex-direction: column; gap: 6px; }
              .lg-field label { font-size: 12.5px; font-weight: 700; color: var(--ink-soft); }
              .lg-box { position: relative; display: flex; align-items: center; }
              .lg-box svg.lg-ik { position: absolute; left: 14px; color: var(--muted); pointer-events: none; }
              .lg-input { width: 100%; height: 50px; padding: 0 46px 0 44px; border-radius: 14px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-family: inherit; font-size: 15px; box-sizing: border-box; transition: border-color .15s, box-shadow .15s; }
              .lg-input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent); background: var(--surface); }
              .lg-mata { position: absolute; right: 8px; width: 36px; height: 36px; border: none; border-radius: 10px; background: transparent; color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
              .lg-mata:hover { background: var(--hover); color: var(--ink); }
              .lg-tombol { height: 50px; border: none; border-radius: 14px; background: var(--brand); color: #fff; font-family: inherit; font-size: 15px; font-weight: 800; cursor: pointer; margin-top: 6px; transition: filter .15s, transform .1s; }
              .lg-tombol:hover { filter: brightness(1.08); }
              .lg-tombol:active { transform: scale(0.99); }
              .lg-tombol:disabled { opacity: .65; cursor: progress; }
            `}} />
            <div className="lg-logo">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, aset lokal */}
              <span><img src="/logo-samudera.png" alt="Samudera" /></span>
            </div>
            <div style={{ textAlign: "center", marginBottom: "22px" }}>
              <h2 style={{ margin: "0 0 6px", color: "var(--ink)", fontSize: "22px", fontWeight: 800, letterSpacing: "-0.01em" }}>Masuk Staf Internal</h2>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px", lineHeight: 1.5 }}>SIBM · Sistem Informasi Bangunan &amp; Manajemen<br />Gunakan email &amp; kata sandi akun Anda.</p>
            </div>
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="lg-field">
                <label htmlFor="lg-email">Email</label>
                <div className="lg-box">
                  <svg className="lg-ik" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                  <input id="lg-email" className="lg-input" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@samudera.id" />
                </div>
              </div>
              <div className="lg-field">
                <label htmlFor="lg-sandi">Kata sandi</label>
                <div className="lg-box">
                  <svg className="lg-ik" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                  <input id="lg-sandi" className="lg-input" type={lihatSandi ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Kata sandi" />
                  <button type="button" className="lg-mata" onClick={() => setLihatSandi((v) => !v)} aria-label={lihatSandi ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}>
                    {lihatSandi
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.6M6.6 6.6A17 17 0 0 0 3 12s4 6 9 6a9.6 9.6 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="3" /></svg>}
                  </button>
                </div>
              </div>
              <button type="submit" className="lg-tombol" disabled={isLoginLoading}>{isLoginLoading ? "Memeriksa..." : "Masuk Dashboard"}</button>
              <p style={{ margin: "4px 0 0", textAlign: "center", fontSize: "12px", color: "var(--muted)" }}>Lupa kata sandi? Hubungi Admin GA untuk reset.</p>
            </form>
          </>
        )}

        {/* MODAL 2: ATK */}
        {activeModal === "atk" && (
          // `height:"100%"` DIHAPUS — sebelumnya div ini minta tinggi 100% dari Modal box yang
          // tingginya sendiri cuma `maxHeight:85vh` (auto/konten, bukan tinggi pasti). Percentage-height
          // pada flex item yang containing block-nya gak punya tinggi pasti itu area abu-abu di spec
          // CSS, dan Safari/WebKit (beda dari Chrome) rawan resolve ini jadi tinggi 0 — begitu parent
          // tingginya 0, katalog ATK di dalamnya (grid + fotonya) ikut "hilang" walau DOM-nya ada. Gak
          // ada bagian lain di modal ATK yang butuh wrapper ini setinggi 100% (gak ada flex-grow/
          // space-between yang mengandalkannya), jadi aman dihapus total.
          // ⚠️ JANGAN tambah `minHeight:0` di sini/wrapper anak-anaknya buat "jaga-jaga" — sempat dicoba
          // dan malah BIKIN katalog kolaps total (grid-auto-rows ke-compute 2px) bahkan di Chrome
          // desktop, ke-reproduce & diverifikasi langsung sebelum akhirnya dilepas lagi.
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: "15px", paddingRight: "20px" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "var(--ink)", fontSize: "22px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}><span style={{background:"#fdf4ff", padding:"8px", borderRadius:"12px"}}>🖇️</span> Gudang ATK GA</h2>
              <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "13px" }}>Pusat permintaan alat tulis kantor (Kertas, Pulpen, dll).</p>
            </div>
            <div style={{ display: "flex", background: "var(--hover)", padding: "6px", borderRadius: "14px", marginBottom: "20px", border: "1px solid var(--line)" }}>
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

                {/* KATALOG PRODUK (GRID ALA TOKO ONLINE) — minmax 100px (bukan 140px) biar tetap
                    kebagi 2 kolom di HP: modal punya padding 30px+30px + gap, jadi lebar sisa buat
                    grid di layar sekecil 375px cuma ~275px — minmax 140px bikin auto-fill nyerah
                    jadi 1 kolom raksasa (kartu tinggi 330px, total 40 kartu = scroll 13.000px+),
                    persis yang bikin katalog kerasa "gak muncul" karena harus scroll lama banget. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "12px", maxHeight: "280px", overflowY: "auto", padding: "4px" }}>
                  {masterAtkList
                    .filter(p => p.nama_barang.toLowerCase().includes(searchAtkProduk.toLowerCase()))
                    .map((produk) => (
                      <div key={produk.id} style={{ border: "1px solid var(--line)", borderRadius: "12px", overflow: "hidden", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
                        <div style={{ width: "100%", aspectRatio: "1", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {produk.foto_url ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={produk.foto_url}
                                alt={produk.nama_barang}
                                loading="lazy"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                onError={(e) => {
                                  // Koneksi HP lemah/gambar Cloudinary gagal load -> jangan biarkan kotak
                                  // gambar kosong melompong (kerasa kayak "item gak muncul"), tampilkan ikon fallback.
                                  e.currentTarget.style.display = "none";
                                  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                  if (fallback) fallback.style.display = "flex";
                                }}
                              />
                              <span style={{ fontSize: "28px", opacity: 0.3, display: "none", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>🖇️</span>
                            </>
                          ) : (
                            <span style={{ fontSize: "28px", opacity: 0.3 }}>🖇️</span>
                          )}
                        </div>
                        <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                          <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--ink)", lineHeight: "1.3" }}>{produk.nama_barang}</span>
                          <button
                            type="button"
                            onClick={() => handleTambahKeKeranjang(produk)}
                            style={{ marginTop: "auto", background: "#d53f8c", color: "#fff", border: "none", borderRadius: "8px", padding: "6px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}
                          >
                            + Keranjang
                          </button>
                        </div>
                      </div>
                    ))}
                  {masterAtkList.filter(p => p.nama_barang.toLowerCase().includes(searchAtkProduk.toLowerCase())).length === 0 && (
                    <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "13px" }}>Barang tidak ditemukan.</div>
                  )}
                </div>

                {/* KERANJANG */}
                <div style={{ borderTop: "2px solid var(--line)", paddingTop: "15px" }}>
                  <div style={{ fontWeight: "800", fontSize: "14px", color: "var(--ink)", marginBottom: "10px" }}>
                    🛒 Keranjang ({formAtkItems.length} item)
                  </div>
                  {formAtkItems.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "13px", border: "1px dashed var(--line)", borderRadius: "12px" }}>
                      Keranjang masih kosong. Pilih barang di atas.
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitAtk} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {formAtkItems.map((item, index) => (
                        <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid var(--line)", padding: "8px 10px", borderRadius: "10px", background: "var(--bg)" }}>
                          <span style={{ flex: "1 1 35%", fontSize: "12px", fontWeight: "bold", color: "var(--ink)", lineHeight: "1.3" }}>{item.nama_barang}</span>
                          <input
                            type="text" required placeholder="Jml"
                            value={item.jumlah}
                            onChange={(e) => handleAtkItemChange(index, "jumlah", e.target.value)}
                            style={{ width: "44px", padding: "7px 4px", borderRadius: "7px", border: "1px solid var(--line)", fontSize: "12px", textAlign: "center", background: "var(--surface)", outline: "none" }}
                          />
                          {/* §103 pilih satuan sesuai master (rim / pcs / dus ...) */}
                          <select value={item.satuan || "PCS"} onChange={(e) => handleAtkItemChange(index, "satuan", e.target.value)} aria-label="Satuan"
                            style={{ padding: "7px 4px", borderRadius: "7px", border: "1px solid var(--line)", fontSize: "12px", background: "var(--surface)", color: "var(--ink)", outline: "none", maxWidth: "96px" }}>
                            {Array.from(new Set([...(masterAtkList.find((m) => m.nama_barang === item.nama_barang)?.satuan || ["PCS"]), item.satuan || "PCS"])).map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <input
                            type="text" placeholder="Catatan (opsional)"
                            value={item.deskripsi}
                            onChange={(e) => handleAtkItemChange(index, "deskripsi", e.target.value)}
                            style={{ flex: "1 1 40%", padding: "7px 8px", borderRadius: "7px", border: "1px solid var(--line)", fontSize: "12px", background: "var(--surface)", outline: "none" }}
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
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)" }}>Invoice To *</label>
                          <select
                            required
                            value={formAtkPemohon.dept}
                            onChange={(e) => setFormAtkPemohon({ ...formAtkPemohon, dept: e.target.value })}
                            style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "14px", background: "var(--bg)", outline: "none", boxSizing: "border-box", cursor: "pointer" }}
                          >
                            <option value="" disabled>Pilih Invoice To...</option>
                            <optgroup label="Unit Bisnis (PT)">
                              {DAFTAR_UNIT_BISNIS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </optgroup>
                            <optgroup label="Departemen Internal Gedung">
                              {DAFTAR_DEPARTEMEN_INTERNAL.map((d) => <option key={d} value={d}>{d}</option>)}
                            </optgroup>
                          </select>
                        </div>
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
                      <Badge tone={hasilAtk.status.includes("Selesai") ? "success" : hasilAtk.status === "Dibatalkan" ? "danger" : "warning"}>{hasilAtk.status.toUpperCase()}</Badge>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--ink-soft)", lineHeight: "1.8", marginBottom: "15px" }}>
                      <div>Pemohon: <b>{hasilAtk.nama_pemohon}</b> ({hasilAtk.departemen})</div>
                      <div>Waktu Request: <b>{formatJam(hasilAtk.waktu_request)}</b></div>
                    </div>
                    <div style={{ fontWeight: "bold", fontSize: "12px", color: "#702459", marginBottom: "5px" }}>Daftar Pesanan:</div>
                    <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "var(--ink-soft)" }}>
                      {hasilAtk.items?.map((it, idx) => (
                        <li key={idx} style={{ marginBottom: "5px" }}>
                          <b style={{ color: "#d53f8c" }}>{it.nama_barang}</b> ({jumlahAtkLabel(it)})
                          {it.deskripsi && <div style={{ fontSize: "11px", color: "var(--ink-soft)", fontStyle: "italic" }}>{it.deskripsi}</div>}
                        </li>
                      ))}
                    </ul>
                    {hasilAtk.status === "Menunggu Disiapkan" && <div style={{ fontSize: "12px", color: "#dd6b20", marginTop: "15px", fontStyle: "italic" }}>* Silakan tunggu info lebih lanjut, GA sedang memproses.</div>}
                    {hasilAtk.status === "Dibatalkan" && <div style={{ fontSize: "12.5px", color: "#c53030", marginTop: "15px", fontWeight: 700 }}>Pesanan dibatalkan Admin GA{hasilAtk.alasan_batal ? `: ${hasilAtk.alasan_batal}` : "."}</div>}
                    {hasilAtk.diubah_admin && hasilAtk.status !== "Dibatalkan" && <div style={{ fontSize: "12px", color: "#b7791f", marginTop: "10px" }}>✎ Daftar barang disesuaikan Admin GA{hasilAtk.catatan_admin ? `: ${hasilAtk.catatan_admin}` : "."}</div>}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Masukkan kode resi yang Anda dapatkan saat request untuk melacak barang.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODAL 3: OVERTIME GEDUNG */}
        {activeModal === "overtime" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ marginBottom: "25px", paddingRight: "20px", borderBottom: "2px solid var(--line)", paddingBottom: "15px" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "var(--ink)", fontSize: "22px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}><span style={{background:"#fffff0", padding:"8px", borderRadius:"12px"}}>⏱️</span> Overtime Gedung</h2>
              <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "13px" }}>Formulir request lembur pemakaian AC/Listrik untuk Karyawan.</p>
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
                <Input label="Departemen / Tenant" type="text" required readOnly value={formOvertime.dept} style={{ background: "var(--hover)" }} />
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

        {/* MODAL 4 & 5: LACAK TAMU & CEK PAKET (§58P) -- data dimuat sekali saat dibuka, disaring saat mengetik */}
        {(activeModal === "tamu" || activeModal === "paket") && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ marginBottom: "16px", paddingRight: "30px" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "var(--ink)", fontSize: "21px", fontWeight: 800, display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="qa-icon-chip" style={{ width: "38px", height: "38px", borderRadius: "12px" }}>{activeModal === "tamu" ? <IconIdCard size={18} /> : <IconPackage size={18} />}</span>
                {activeModal === "tamu" ? "Lacak Tamu" : "Cek Paket"}
              </h2>
              <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "13px" }}>
                {activeModal === "tamu" ? "Cari berdasarkan nama tamu, instansi, atau tujuan." : "Cari berdasarkan nama penerima atau kurir. Paket yang belum diambil tampil paling atas."}
              </p>
            </div>
            <Input
              containerStyle={{ marginBottom: "8px" }} type="search" autoFocus
              placeholder={activeModal === "tamu" ? "Ketik nama / instansi / tujuan..." : "Ketik nama penerima / kurir..."}
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={activeModal === "tamu" ? "Cari tamu" : "Cari paket"}
            />
            <div style={{ fontSize: "11.5px", color: "var(--muted)", marginBottom: "14px" }}>
              {isSearching
                ? "Memuat data terbaru..."
                : `Menampilkan ${activeModal === "tamu" ? tamuTampil.length : paketTampil.length} dari ${BATAS_PENCARIAN} catatan terakhir${kataCari ? " yang cocok" : ""}.`}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {activeModal === "tamu" ? (
                <Table>
                  <THead>
                    <Tr><Th>Identitas</Th><Th>Tujuan</Th><Th>Waktu</Th></Tr>
                  </THead>
                  <TBody>
                    {tamuTampil.length > 0 ? tamuTampil.map(tm => (
                      <Tr key={tm.id}>
                        <Td><div style={{ fontWeight: "bold", color: "var(--ink)" }}>{tm.nama}</div><div style={{ fontSize: "11px", color: "var(--ink-soft)" }}>{tm.instansi_dept}</div></Td>
                        <Td style={{ color: "var(--ink-soft)" }}>{tm.tujuan}</Td>
                        <Td><div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "2px" }}><span><b style={{ color: "var(--ok)" }}>Masuk:</b> {formatJam(tm.waktu_masuk)}</span><span><b style={{ color: "var(--red-600)" }}>Keluar:</b> {tm.waktu_keluar ? formatJam(tm.waktu_keluar) : "Masih di dalam"}</span></div></Td>
                      </Tr>
                    )) : <Tr><Td colSpan={3} style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>{isSearching ? "Memuat..." : "Tidak ada tamu yang cocok."}</Td></Tr>}
                  </TBody>
                </Table>
              ) : (
                <Table>
                  <THead>
                    <Tr><Th>Penerima</Th><Th>Kurir</Th><Th>Tiba</Th><Th>Status</Th></Tr>
                  </THead>
                  <TBody>
                    {paketTampil.length > 0 ? paketTampil.map(p => (
                      <Tr key={p.id}>
                        <Td style={{ fontWeight: "bold", color: "var(--ink)" }}>{p.penerima}</Td>
                        <Td style={{ color: "var(--ink-soft)" }}>{p.kurir}</Td>
                        <Td style={{ color: "var(--ink-soft)", fontSize: "12px" }}>{formatJam(p.waktu_diterima)}</Td>
                        <Td><Badge tone={p.status === "Sudah Diambil" ? "success" : "warning"}>{p.status}</Badge></Td>
                      </Tr>
                    )) : <Tr><Td colSpan={4} style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>{isSearching ? "Memuat..." : "Tidak ada paket yang cocok."}</Td></Tr>}
                  </TBody>
                </Table>
              )}
            </div>
          </div>
        )}

        {/* MODAL 6: SBO */}
        {activeModal === "sbo" && (
          <form onSubmit={handleSubmitSbo} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ marginBottom: "10px", paddingRight: "30px", borderBottom: "2px solid var(--line)", paddingBottom: "20px" }}>
              <h2 style={{ margin: "0 0 8px 0", color: "#22543d", fontSize: "20px", display: "flex", alignItems: "center", gap: "10px", fontWeight: "800" }}>
                <span style={{background:"#c6f6d5", padding:"8px", borderRadius:"12px"}}>🦺</span> Lapor Bahaya (SBO)
              </h2>
              <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "13px", lineHeight: "1.5" }}>Laporan IK-QHSE-SML-001. Laporkan temuan kondisi fisik atau perilaku kerja yang berbahaya di area operasional.</p>
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
              <Input label="Unit Bisnis / Departemen *" type="text" required readOnly placeholder="Terisi otomatis dari Nama Pelapor..." value={formSbo.unit_bisnis} style={{ background: "var(--hover)" }} />
              <Input label="Lokasi Temuan *" type="text" required placeholder="Cth: Area Parkir Basement" value={formSbo.lokasi} onChange={(e) => setFormSbo({ ...formSbo, lokasi: e.target.value })} />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "6px", display: "block" }}>Kategori Temuan *</label>
              <select required value={formSbo.kategori_temuan} onChange={(e) => setFormSbo({ ...formSbo, kategori_temuan: e.target.value })} style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "14px", fontWeight: "bold", color: "var(--ink)", background: "var(--bg)", outline: "none", cursor: "pointer", boxSizing: "border-box" }}>
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

            <div style={{ background: "var(--bg)", border: "1px solid var(--line)", padding: "15px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink)" }}>Status Temuan Saat Ini:</label>
              <select required value={formSbo.status_temuan} onChange={(e) => setFormSbo({ ...formSbo, status_temuan: e.target.value })} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", fontWeight: "bold", color: formSbo.status_temuan === "Open" ? "#e53e3e" : "#38a169", outline: "none", cursor: "pointer", background: "var(--surface)" }}>
                <option value="Open">🔴 OPEN (Masih Berbahaya)</option>
                <option value="Close">🟢 CLOSE (Sudah Aman)</option>
              </select>
            </div>

            {formSbo.kategori_temuan.includes("Unsafe Act") && (
              <div style={{ background: "#fff5f5", border: "1px solid #fed7d7", padding: "20px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "12px", fontWeight: "800", color: "#c53030", letterSpacing: "0.5px" }}>[ WAJIB UNTUK UNSAFE ACT ]</div>
                <Input label="Komitmen Pelaku Kedepan?" type="text" required placeholder="Komitmen dari pelanggar..." value={formSbo.komitmen_pelaku} onChange={(e) => setFormSbo({ ...formSbo, komitmen_pelaku: e.target.value })} style={{ background: "var(--surface)" }} />
                <Input label="Konsekuensi Jika Mengulangi?" type="text" required placeholder="Cth: Diberi teguran lisan / SP1..." value={formSbo.konsekuensi} onChange={(e) => setFormSbo({ ...formSbo, konsekuensi: e.target.value })} style={{ background: "var(--surface)" }} />
              </div>
            )}

            <div style={{ background: fotoSbo ? "#f0fff4" : "#f8fafc", border: fotoSbo ? "2px solid #9ae6b4" : "2px dashed var(--line)", padding: "25px 20px", borderRadius: "16px", textAlign: "center", transition: "0.2s", marginTop: "10px" }}>
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
                  <button type="button" onClick={() => setFotoSbo("")} style={{position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "#fff", border: "none", width: "25px", height: "25px", borderRadius: "50%", cursor: "pointer", fontSize: "12px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)"}}>✖</button>
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
              <h2 style={{ margin: "0 0 5px 0", color: "var(--ink)", fontSize: "22px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}><span style={{background:"#ebf8ff", padding:"8px", borderRadius:"12px"}}>🛠️</span> Helpdesk GA</h2>
            </div>
            <div style={{ display: "flex", background: "var(--hover)", padding: "6px", borderRadius: "14px", marginBottom: "25px", border: "1px solid var(--line)" }}>
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
                <div style={{ background: fotoAwal ? "#ebf8ff" : "#f8fafc", border: fotoAwal ? "2px solid #90cdf4" : "2px dashed var(--line)", padding: "20px", borderRadius: "16px", textAlign: "center" }}>
                  <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}><span style={{ fontSize: "35px" }}>📸</span><div style={{ fontSize: "14px", fontWeight: "bold", color: "var(--ink-soft)" }}>Unggah Foto Kerusakan *</div><input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, setFotoAwal)} style={{ display: "none" }} required={!fotoAwal} /></label>
                  {isUploadingFoto ? (
                    <div style={{ fontSize: "13px", fontWeight: "bold", color: "#d69e2e", marginTop: "10px" }}>⏳ Mengunggah foto...</div>
                  ) : fotoAwal && (
                    <div style={{marginTop: "15px"}}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotoAwal} alt="Awal" style={{ width: "100%", maxHeight: "150px", objectFit: "cover", borderRadius: "10px" }} />
                      <button type="button" onClick={() => setFotoAwal("")} style={{background: "#e53e3e", color: "#fff", padding: "5px", borderRadius: "50%", marginTop: "5px"}}>✖</button>
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
                    <div key={tiket.id} style={{ border: "1px solid var(--line)", borderRadius: "12px", padding: "15px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                        <span style={{ fontWeight: "800", fontSize: "14px" }}>📍 {tiket.lokasi}</span>
                        <Badge tone="warning">{tiket.status}</Badge>
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--ink-soft)" }}>{tiket.deskripsi}</div>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>Hasil pencarian tiket akan muncul di sini.</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
