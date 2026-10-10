"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { logoutWithConfirm, useAuthGuard } from "../../../hooks/useAuthGuard";
import { useFcmSetup } from "../../../hooks/useFcmSetup";
import AbsensiCard from "../../../components/AbsensiCard";
import KinerjaSayaPanel from "../../../components/KinerjaSayaPanel";
import BookingRuanganPanel from "../../../components/BookingRuanganPanel";
import EskalasiShiftModal from "../../../components/EskalasiShiftModal";
import HandbookMagangList from "../../../components/HandbookMagangList";
import { tanggalISOWITASekarang, hitungShiftSesi, waktuWITASekarang, dalamJendelaTukarJaga } from "../../../lib/shift";
import KlaimLemburModal from "../../../components/KlaimLemburModal";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan portal utama & dashboard/ob (components/pages/DashboardOBPage.tsx)
// ==========================================
type IconProps = { size?: number; color?: string };
const IconLogOut = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
);
const IconMapPin = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.7 7-12a7 7 0 1 0-14 0c0 5.3 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
const IconAlertTriangle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 4.5 2.9 18a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.5 4.5a2 2 0 0 0-3 0z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconCalendar = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>
);
const IconUserPlus = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6" /><path d="M18 8v6" /><path d="M15 11h6" /></svg>
);
const IconPackage = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></svg>
);
const IconShield = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-0.6 8-4 8-9V6z" /><path d="m9.5 12 1.8 1.8L15 10" /></svg>
);
const IconCar = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14" /><path d="M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M23 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M3 17v-4l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v4" /><path d="M3 13h18" /></svg>
);
const IconPrinter = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M6 17v4h12v-4" /></svg>
);
const IconHome = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-6h4v6" /></svg>
);
const IconLayoutGrid = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>
);
const IconInbox = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);
const IconFireExtinguisher = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3v2" /><path d="M8 5h6l1 2H7z" /><path d="M9 7v3" /><path d="M15 7l4-2" /><path d="M9 10h4a3 3 0 0 1 3 3v8H8v-8a3 3 0 0 1 1-2z" /><path d="M8 15h8" /></svg>
);
const IconBook = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
);
const IconDroplet = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z" /></svg>
);
const IconQrCode = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2" /></svg>
);

// ==========================================
// INTERFACES
// ==========================================
// ==========================================
// HELPER STATUS JAGA -- dipakai badge "Jadwal Anda Hari Ini" biar kasih info lebih dari
// sekadar ON/OFF DUTY: sudah berapa lama sejak shift terakhir berakhir (atau berapa lama
// lagi sampai shift mulai), dan kapan jadwal jaga berikutnya.
// ==========================================
function formatDurasiMenit(totalMenit: number): string {
  const jam = Math.floor(totalMenit / 60);
  const menit = totalMenit % 60;
  if (jam === 0) return `${menit} menit`;
  if (menit === 0) return `${jam} jam`;
  return `${jam} jam ${menit} menit`;
}

// Cari jadwal Shift 1/2 berikutnya (skip Off/Izin/kosong) mulai dari tanggal_shift AKTIF sekarang.
// Kalau Shift 1 hari ini SUDAH lewat (sekarang lagi jendela Shift 2), entry Shift 1 hari itu bukan
// "berikutnya" lagi -- mulai cari dari besok.
function cariJagaBerikutnya(
  finalData: Record<string, Record<string, string>>,
  picName: string,
  tanggalAktif: string,
  shiftAktif: string
): { tanggal: string; shift: string } | null {
  // Dari tanggal aktif ke depan (tidak bergantung tanggal aktif ada di data -- §62).
  const semuaTanggal = Object.keys(finalData).sort().filter((tgl) => tgl >= tanggalAktif);
  for (const tgl of semuaTanggal) {
    if (tgl === tanggalAktif && shiftAktif === "Shift 2" && finalData[tgl]?.[picName] === "Shift 1") continue;
    const val = finalData[tgl]?.[picName];
    if (val === "Shift 1" || val === "Shift 2") return { tanggal: tgl, shift: val };
  }
  return null;
}

function formatTanggalRelatif(tglISO: string, hariIniISO: string): string {
  if (tglISO === hariIniISO) return "Hari Ini";
  const besok = new Date(hariIniISO + "T00:00:00");
  besok.setDate(besok.getDate() + 1);
  const besokISO = `${besok.getFullYear()}-${String(besok.getMonth() + 1).padStart(2, "0")}-${String(besok.getDate()).padStart(2, "0")}`;
  if (tglISO === besokISO) return "Besok";
  return new Date(tglISO + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
}

export default function SecurityDashboard() {
  const router = useRouter();
  const confirm = useConfirm();

  const { session, isReady: isAuthReady } = useAuthGuard({
    depts: ["Security"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Security.",
  });
  const picName = session?.nama || "";
  // 🔔 Setup FCM -- Security belum pernah pasang push notif sebelum ini (cuma OB & CS),
  // dibutuhkan buat reminder siram tanaman weekend & cek AC pagi hari kerja.
  useFcmSetup(picName, !!picName, "Security");
  const [picRole, setPicRole] = useState<string>("");
  const [isDataReady, setIsDataReady] = useState<boolean>(false);

  const [securityStaff, setSecurityStaff] = useState<string[]>([]);
  const [hariIniShift, setHariIniShift] = useState<string>("Tidak Ada Shift / Belum Diplot");
  // Status jaga REAL-TIME (bukan cuma "ada plot utk tanggal kalender hari ini") -- true hanya kalau
  // shift yang terjadwal PERSIS SAMA dengan shift yang sedang aktif sekarang (lihat hitungShiftSesi()).
  // Ini yang bikin badge otomatis berubah jadi OFF DUTY begitu jam shift berakhir (mis. Shift 1
  // lewat jam 20:00), tanpa nunggu tanggal kalender berganti -- sebelumnya badge nempel "ON DUTY"
  // sepanjang tanggal kalender yang sama walau jam shift-nya sudah lewat.
  const [sedangBertugas, setSedangBertugas] = useState<boolean>(false);
  // Info tambahan pas OFF DUTY -- "Shift 1 Anda berakhir pukul 20:00 (3 jam 25 menit lalu)" dsb,
  // dan kapan jadwal jaga berikutnya. Kosong kalau lagi ON DUTY (gak relevan).
  const [statusKeterangan, setStatusKeterangan] = useState<string>("");
  const [jagaBerikutnyaTeks, setJagaBerikutnyaTeks] = useState<string>("");
  const [namaBulanAktif, setNamaBulanAktif] = useState<string>("");
  // Overlay "EXTEND" di papan roster (lihat EskalasiShiftModal.tsx) -- collection kecil, cuma
  // terisi kalau ada kejadian serah terima telat, jadi aman ditarik utuh tanpa index tambahan.
  interface EntriExtend { id: string; tanggal_shift: string; shift: string; status: string; tipe: string | null; personil_extend: string | null; petugas_masuk: string[] }
  const [daftarExtend, setDaftarExtend] = useState<EntriExtend[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "security_shift_extend"), (snap) => {
      setDaftarExtend(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EntriExtend)));
    });
    return () => unsub();
  }, []);
  const cariExtend = (tglKey: string, shiftVal: string, nama: string) =>
    daftarExtend.find((e) => e.tanggal_shift === tglKey && e.shift === shiftVal && e.status !== "selesai" && e.petugas_masuk?.includes(nama));
  const [semuaPlotBulanIni, setSemuaPlotBulanIni] = useState<Record<string, Record<string, string>>>({});
  // Gabungan MENTAH 2 dokumen bulan (tidak dipotong ke periode 11->10). Dipakai untuk status jaga &
  // jaga berikutnya (§62): malam pergantian periode (tgl 11 00:00-08:00) Shift 2 yang aktif masih
  // milik tanggal 10 -- dulu tidak ada di data periode baru sehingga petugas jaga tampil "OFF";
  // begitu pula "jaga berikutnya" kosong di tanggal 10 karena periode berikutnya terpotong.
  const [plotMentah, setPlotMentah] = useState<Record<string, Record<string, string>>>({});
  const [waktuCetak, setWaktuCetak] = useState<string>("");

  // 🔄 Status Serah Terima Shift (Tukar Shift/Jaga) -- ditampilkan di sini, diproses/discan di
  // /dashboard/security/tukar-shift (TukarShiftSecurityPage.tsx).
  const [handoverStatus, setHandoverStatus] = useState<{ status: "menunggu_scan" | "selesai"; petugas_keluar: string; petugas_masuk: string | null } | null>(null);
  // tanggal_shift+shift AKTIF dilacak lewat state (dicek ulang tiap menit), BUKAN dihitung sekali
  // pas mount -- kalau gak, listener di bawah nempel ke shift LAMA selamanya buat dashboard yang
  // dibiarkan terbuka lintas jam pergantian shift (mis. dibuka jam 19:00, dibiarkan sampai jam
  // 21:00 -- tanpa ini, status serah terima Shift 1 kemarin yang keliatan, bukan Shift 2 sekarang).
  const [infoShiftAktif, setInfoShiftAktif] = useState(() => hitungShiftSesi(waktuWITASekarang()));
  useEffect(() => {
    const interval = setInterval(() => setInfoShiftAktif(hitungShiftSesi(waktuWITASekarang())), 60000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "security_shift_handover"), where("tanggal_shift", "==", infoShiftAktif.tanggal_shift), where("shift", "==", infoShiftAktif.shift), orderBy("waktu_generate", "desc"), limit(1)),
      (snap) => {
        setHandoverStatus(snap.empty ? null : (snap.docs[0].data() as { status: "menunggu_scan" | "selesai"; petugas_keluar: string; petugas_masuk: string | null }));
      }
    );
    return () => unsub();
  }, [infoShiftAktif.tanggal_shift, infoShiftAktif.shift]);

  // Kartu "Tukar Shift/Jaga" cuma relevan & muncul PAS jam pergantian shift (08:00 & 20:00 WITA),
  // bukan sepanjang hari -- generate QR di luar jendela ini bikin tanggal_shift/shift yang tersimpan
  // gak sinkron dengan yang dihitung petugas pengganti begitu jamnya beneran ganti (lihat
  // dalamJendelaTukarJaga() di lib/shift.ts buat detail bug ini).
  const [dalamJendelaTukar, setDalamJendelaTukar] = useState(false);
  useEffect(() => {
    const cek = () => setDalamJendelaTukar(dalamJendelaTukarJaga(waktuWITASekarang()));
    cek();
    const interval = setInterval(cek, 30000);
    return () => clearInterval(interval);
  }, []);

  // 💡 STATE MODAL & MULTI-ROW OVERTIME
  // Dulu pakai new Date().toISOString() (UTC) -- salah tanggal kalau dibuka jam 00:00-07:59 WITA.
  // Diganti pakai helper WITA-safe yang sama dipakai file lain (lihat lib/shift.ts).
  const todayISO = tanggalISOWITASekarang();
  const [activeModal, setActiveModal] = useState<"none" | "lembur">("none");

  // 1. TARIK DAFTAR STAF — jalan begitu akses sudah tervalidasi oleh useAuthGuard
  useEffect(() => {
    if (!isAuthReady || !session) return;
    const nama = session.nama;
    let role = session.role;

    const siapkanHalaman = async () => {
      try {
        const q = query(collection(db, "users_master"), where("departemen", "==", "Security"));
        const snap = await getDocs(q);
        const staffList: string[] = [];

        snap.forEach(doc => {
          const data = doc.data();
          const staffRole: string = data.role || "Staff";
          const isMagangStaff = staffRole.toLowerCase().includes("magang");

          // Anak magang gak ikut plotting jadwal shift, jadi gak dimasukin ke kolom roster
          if (!isMagangStaff) {
            staffList.push(data.nama);
          }

          if (data.nama === nama) {
            role = staffRole;
            localStorage.setItem("pic_role", staffRole);
          }
        });

        setPicRole(role);

        staffList.sort((a, b) => {
          if (a.toLowerCase().includes("danru")) return -1;
          if (b.toLowerCase().includes("danru")) return 1;
          return a.localeCompare(b);
        });

        setSecurityStaff(staffList);
      } catch (error) {
        console.error("Gagal menarik data staf:", error);
      }
    };

    siapkanHalaman();
  }, [isAuthReady, session]);

  // 2. TARIK DATA JADWAL BERDASARKAN PERIODE TGL 11 S/D 10
  useEffect(() => {
    if (!picName) return;

    const getLocalDateString = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const today = new Date();
    const currentDay = today.getDate();

    let startPeriode: Date;
    let endPeriode: Date;

    if (currentDay >= 11) {
      startPeriode = new Date(today.getFullYear(), today.getMonth(), 11);
      endPeriode = new Date(today.getFullYear(), today.getMonth() + 1, 10);
    } else {
      startPeriode = new Date(today.getFullYear(), today.getMonth() - 1, 11);
      endPeriode = new Date(today.getFullYear(), today.getMonth(), 10);
    }

    const docBulan1 = `${startPeriode.getFullYear()}-${String(startPeriode.getMonth() + 1).padStart(2, "0")}`;
    const docBulan2 = `${endPeriode.getFullYear()}-${String(endPeriode.getMonth() + 1).padStart(2, "0")}`;

    const tglAwalFormat = startPeriode.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const tglAkhirFormat = endPeriode.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

    setTimeout(() => {
      setNamaBulanAktif(`Periode ${tglAwalFormat} - ${tglAkhirFormat}`);
    }, 0);

    let dataBulan1: Record<string, Record<string, string>> = {};
    let dataBulan2: Record<string, Record<string, string>> = {};

    const updateMergedData = () => {
      const merged = { ...dataBulan1, ...dataBulan2 };
      const finalData: Record<string, Record<string, string>> = {};

      for (let d = new Date(startPeriode); d <= endPeriode; d.setDate(d.getDate() + 1)) {
        const dateStr = getLocalDateString(d);
        finalData[dateStr] = merged[dateStr] || {};
      }

      setSemuaPlotBulanIni(finalData);
      setPlotMentah(merged);
      setIsDataReady(true);
    };

    const unsub1 = onSnapshot(doc(db, "security_monthly_schedules", docBulan1), (snap) => {
      dataBulan1 = snap.exists() ? snap.data().data_hari || {} : {};
      updateMergedData();
    });

    const unsub2 = onSnapshot(doc(db, "security_monthly_schedules", docBulan2), (snap) => {
      dataBulan2 = snap.exists() ? snap.data().data_hari || {} : {};
      updateMergedData();
    });

    return () => { unsub1(); unsub2(); };
  }, [picName]);

  // Status jaga dihitung ULANG tiap menit (bukan cuma pas roster berubah) -- pakai tanggal_shift
  // dari shift yang SEDANG AKTIF sekarang (bukan tanggal kalender hari ini), biar Shift 2
  // (20:00-08:00, lewat tengah malam) & momen pergantian shift kesiangan (08:00/20:00) sama-sama
  // benar. Ini yang bikin badge otomatis pindah ke OFF DUTY begitu jam shift berakhir, tanpa nunggu
  // tanggal kalender berganti atau halaman di-refresh manual.
  useEffect(() => {
    if (!picName || Object.keys(plotMentah).length === 0) return;
    const perbarui = () => {
      const now = waktuWITASekarang();
      const infoSekarang = hitungShiftSesi(now);
      const shiftTerjadwal = plotMentah[infoSekarang.tanggal_shift]?.[picName] || "";
      const sedangJaga = shiftTerjadwal === infoSekarang.shift;
      const menitSekarang = now.getHours() * 60 + now.getMinutes();

      let label: string;
      let keterangan = "";
      if (sedangJaga) {
        label = shiftTerjadwal;
      } else if (shiftTerjadwal === "Off" || shiftTerjadwal === "Izin") {
        label = shiftTerjadwal;
      } else if (shiftTerjadwal === "Shift 1" || shiftTerjadwal === "Shift 2") {
        label = shiftTerjadwal;
        if (infoSekarang.shift === "Shift 2") {
          // Shift 1 (08:00-20:00) hari ini sudah berakhir pukul 20:00 -- "sekarang" bisa masih
          // malam ini (jam >= 20:00) atau sudah lewat tengah malam (jam < 08:00), keduanya
          // dihitung dari titik 20:00 yang sama.
          const menitSejak20 = menitSekarang >= 1200 ? menitSekarang - 1200 : menitSekarang + 1440 - 1200;
          keterangan = `Shift 1 Anda berakhir pukul 20:00 (${formatDurasiMenit(menitSejak20)} lalu).`;
        } else {
          // Shift 2 (20:00-08:00) belum mulai, masih jendela Shift 1 (08:00-20:00) sekarang.
          const menitLagi = 1200 - menitSekarang;
          keterangan = `Shift 2 Anda mulai pukul 20:00 (${formatDurasiMenit(menitLagi)} lagi).`;
        }
      } else {
        label = "Off / Belum Diplot";
      }
      setHariIniShift(label);
      setSedangBertugas(sedangJaga);
      setStatusKeterangan(keterangan);

      if (!sedangJaga) {
        const berikutnya = cariJagaBerikutnya(plotMentah, picName, infoSekarang.tanggal_shift, infoSekarang.shift);
        const hariIniISO = tanggalISOWITASekarang();
        setJagaBerikutnyaTeks(
          berikutnya
            ? `Jaga berikutnya: ${formatTanggalRelatif(berikutnya.tanggal, hariIniISO)}, ${berikutnya.shift} (mulai ${berikutnya.shift === "Shift 1" ? "08:00" : "20:00"}).`
            : ""
        );
      } else {
        setJagaBerikutnyaTeks("");
      }
    };
    perbarui();
    const interval = setInterval(perbarui, 60000);
    return () => clearInterval(interval);
  }, [picName, plotMentah]);

  const handleKeluar = () => logoutWithConfirm(confirm, router);

  const handlePrint = () => {
    setWaktuCetak(new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => window.print(), 0);
  };

  // LOGIKA KONVERSI JAM UNTUK KARTU DASHBOARD
  const getWaktuShift = (shift: string) => {
    if (shift.includes("Shift 1")) return "08:00 - 20:00";
    if (shift.includes("Shift 2")) return "20:00 - 08:00";
    return "";
  };

  const getInisialDanJam = (shiftVal: string) => {
    if (!shiftVal || shiftVal === "-") return "-";
    if (shiftVal.includes("Off")) return "OFF";
    if (shiftVal.includes("Izin")) return "IZIN";
    if (shiftVal.includes("Shift 1")) return "S1 (08-20)";
    if (shiftVal.includes("Shift 2")) return "S2 (20-08)";
    return shiftVal;
  };


  const isOff = !sedangBertugas;
  const waktuTeks = getWaktuShift(hariIniShift);

  // MENU UTAMA SECURITY — warna dipetakan ke token desain (lihat tokenColors di bawah)
  // hideOnMobile: true = card disembunyikan di HP karena modulnya sudah ada shortcut permanen di bottom nav
  const menuSecurity = [
    { title: "Validasi Karyawan", desc: "Cek lembur lewat 18:00 & karyawan yang belum tercatat masuk.", path: "/dashboard/security/validasi", action: "link", token: "warn", icon: IconClock, hideOnMobile: false },
    { title: "Buku Tamu Digital", desc: "Registrasi tamu dan akses karyawan.", path: "/dashboard/security/buku-tamu", action: "link", token: "red", icon: IconUserPlus, hideOnMobile: true },
    { title: "Manajemen Paket", desc: "Pencatatan resi kurir & ekspedisi.", path: "/dashboard/security/paket", action: "link", token: "warn", icon: IconPackage, hideOnMobile: true },
    { title: "Patroli Area", desc: "Scan QR code & checklist keamanan.", path: "/dashboard/security/patroli", action: "link", token: "ok", icon: IconShield, hideOnMobile: false },
    { title: "Log Kendaraan", desc: "Pencatatan kendaraan keluar-masuk.", path: "/dashboard/security/parkir", action: "link", token: "info", icon: IconCar, hideOnMobile: false },
    { title: "Inspeksi APAR", desc: "Scan QR & catat kondisi APAR per lantai tiap bulan.", path: "/dashboard/security/inspeksi-apar", action: "link", token: "accent", icon: IconFireExtinguisher, hideOnMobile: false },
    { title: "Klaim Lembur Bulan Ini", desc: "Rekap & input lemburan (Back-up Shift).", path: "", action: "modal_lembur", token: "accent", icon: IconClock, hideOnMobile: false },
    { title: "SOP & Instruksi Kerja", desc: "Pelajari dokumen SOP/IK terbaru untuk Tim Security.", path: "/dashboard/security/sop", action: "link", token: "info", icon: IconBook, hideOnMobile: false },
    { title: "Notifikasi Dadakan: Siram Tanaman", desc: "Upload bukti foto siram tanaman (Pagi 06:00-07:00 / Malam 20:00-22:00).", path: "/dashboard/security/notifikasi-dadakan", action: "link", token: "ok", icon: IconDroplet, hideOnMobile: false },
    { title: "Tukar Shift / Jaga", desc: "Serah terima jaga wajib scan QR ke petugas pengganti.", path: "/dashboard/security/tukar-shift", action: "link", token: "info", icon: IconQrCode, hideOnMobile: false },
  ];

  // 🕘 VALIDASI KARYAWAN (§59) -- jumlah kartu yang menunggu jawaban (lembur & belum tercatat masuk).
  const [jumlahValidasi, setJumlahValidasi] = useState(0);
  useEffect(() => {
    const hariIni = tanggalISOWITASekarang();
    const kemarin = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(Date.now() - 86400000));
    const unsub = onSnapshot(query(collection(db, "validasi_karyawan"), where("tanggal", "in", [kemarin, hariIni])), (snap) => {
      setJumlahValidasi(snap.docs.filter((d) => d.data().status === "menunggu").length);
    }, (err) => console.error("[security] Gagal memuat validasi karyawan:", err));
    return () => unsub();
  }, []);

  const tokenColors: Record<string, { bg: string; color: string }> = {
    info: { bg: "var(--info-50)", color: "var(--info)" },
    warn: { bg: "var(--warn-50)", color: "var(--warn)" },
    ok: { bg: "var(--ok-50)", color: "var(--ok)" },
    red: { bg: "var(--red-50)", color: "var(--red-600)" },
    accent: { bg: "var(--accent-50)", color: "var(--accent)" },
  };

  if (!isAuthReady || !isDataReady) return null;

  const roleLower = picRole.toLowerCase();
  const isKoordinatorArea = roleLower.includes("danru") || roleLower.includes("koordinator") || roleLower.includes("admin");
  const isMagang = roleLower.includes("magang");

  // Anak magang cuma bantu-bantu Buku Tamu & Paket, menu lain (patroli, parkir, APAR, lembur) disembunyikan
  const menuUntukDitampilkan = isMagang
    ? menuSecurity.filter(menu => menu.path === "/dashboard/security/buku-tamu" || menu.path === "/dashboard/security/paket")
    : menuSecurity;


  return (
    <AdminShell
      userName={picName}
      backHref={null}
      brandSub="Security"
      onLogout={handleKeluar}
      bottomNav={
        <>
          <button type="button" className="sa-nav-item is-active" onClick={() => router.push("/")}>
            <IconHome size={21} />
            <span>Home</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/dashboard/security/buku-tamu")}>
            <IconUserPlus size={21} />
            <span>Tamu</span>
          </button>
          <button type="button" className="sa-nav-item" onClick={() => router.push("/dashboard/security/paket")}>
            <IconPackage size={21} />
            <span>Paket</span>
          </button>
          <button type="button" className="sa-nav-item is-danger" onClick={handleKeluar}>
            <IconLogOut size={21} />
            <span>Keluar</span>
          </button>
        </>
      }
    >

      {/* 💡 GAYA DASHBOARD — tema Bento Hangat (token dari components/admin/admin-theme.css, ikut terang/gelap) */}
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }

        .sec-hero { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .sec-hero-label { font-size: 13px; font-weight: 600; opacity: 0.85; }
        .sec-hero-title { margin: 0; font-size: 28px; font-weight: 800; line-height: 1.12; letter-spacing: -0.02em; }

        .section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .section-title-icon { background: var(--red-50); color: var(--red-600); padding: 9px; border-radius: 14px; display: flex; }

        .shift-card {
          background: var(--tile); padding: 20px 22px; border-radius: 28px;
          margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 14px;
        }
        .shift-badge { padding: 10px 18px; border-radius: 16px; font-weight: 800; font-size: 14.5px; display: flex; align-items: center; gap: 8px; width: fit-content; border: none; }

        .coord-card { color: #fff; padding: 20px 22px; border-radius: 28px; cursor: pointer; display: flex; align-items: center; gap: 18px; transition: transform 0.2s; margin: 16px 0; border: none; width: 100%; text-align: left; font-family: inherit; }
        .coord-card:hover { transform: translateY(-2px); }
        .coord-icon { background: rgba(255,255,255,0.2); padding: 14px; border-radius: 18px; display: flex; }

        .admin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin: 16px 0; }
        .admin-card {
          background: var(--tile); padding: 20px; border-radius: 24px; border: none;
          cursor: pointer; display: flex; flex-direction: column; gap: 14px; text-align: left; font-family: inherit; color: var(--ink);
          transition: transform 0.15s, background 0.15s;
        }
        .admin-card:hover { transform: translateY(-2px); }
        .admin-card-icon { width: 50px; height: 50px; border-radius: 16px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; }
        .admin-card-title { margin: 0 0 4px 0; color: var(--ink); font-size: 16px; font-weight: 700; }
        .admin-card-desc { margin: 0; color: var(--ink-soft); font-size: 12.5px; line-height: 1.5; }
        .admin-card-arrow { margin-top: auto; font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 4px; }

        .roster-legend { display: flex; gap: 8px; font-size: 11px; font-weight: bold; flex-wrap: wrap; }
        .roster-chip { padding: 4px 9px; border-radius: 8px; }
        .print-btn { height: 40px; padding: 0 16px; background: var(--brand); color: #fff; border: none; border-radius: 14px; font-size: 13px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: inherit; }
        .roster-panel { background: var(--tile); padding: 24px; border-radius: 28px; }

        .input-grid-mobile { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* 📱 HP */
        @media (max-width: 768px) {
          .sec-hero-title { font-size: 24px; }
          .admin-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
          .hide-card-mobile { display: none !important; }
          .admin-card { flex-direction: row !important; align-items: center !important; padding: 14px 16px !important; gap: 14px !important; border-radius: 22px !important; }
          .admin-card:active { transform: scale(0.98); }
          .admin-card-icon { width: 46px !important; height: 46px !important; border-radius: 14px !important; }
          .admin-card-title { font-size: 15px !important; margin-bottom: 2px !important; }
          .admin-card-desc { font-size: 12px !important; line-height: 1.4 !important; }
          .admin-card-arrow { display: none !important; }
          .roster-panel { padding: 16px; border-radius: 24px; }
          .input-grid-mobile { grid-template-columns: 1fr !important; gap: 10px !important; }
        }
      `}} />

      {/* 🔹 CSS PRINT — cetak roster A4 landscape, 1 halaman, dgn kop logo Samudera */}
      <style dangerouslySetInnerHTML={{__html: `
        @media screen { .print-only { display: none !important; } }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background-color: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-area { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
          .roster-wrapper { border: none !important; overflow: visible !important; }
          .roster-table { width: 100% !important; }
          .roster-table th, .roster-table td { padding: 3px 4px !important; font-size: 9px !important; }
          .roster-table span { font-size: 8.5px !important; padding: 1px 6px !important; }
        }
      `}} />

      {/* 🔹 KARTU SAPAAN (pengganti hero merah lama) */}
      <Tile variant="brand" className="sec-hero no-print">
        <span className="sec-hero-label">Security Command Center · {picRole}</span>
        <h1 className="sec-hero-title">Halo, {picName.split(/\s+/)[0]}.<br />Siap jaga hari ini?</h1>
      </Tile>

      {/* 🖨️ KOP CETAK — cuma muncul pas print, logo Samudera + judul periode roster */}
      <div className="print-only" style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px", borderBottom: "2px solid #2d3748", paddingBottom: "10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-samudera.png" alt="Logo Samudera" style={{ height: "42px", objectFit: "contain" }} />
          <div>
            <h2 style={{ margin: 0, fontSize: "17px" }}>ROSTER SECURITY — {namaBulanAktif ? namaBulanAktif.toUpperCase() : "PERIODE BELUM TERBIT"}</h2>
            <p style={{ margin: "4px 0 0", fontSize: "11px" }}>Dicetak: {waktuCetak}</p>
          </div>
        </div>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div>

        {/* 🎓 HANDBOOK MAGANG -- muncul PALING ATAS begitu anak magang login, sesuai permintaan user */}
        {isMagang && <HandbookMagangList />}

        {/* 📢 KARTU SHIFT HARI INI — gak relevan buat magang karena gak ikut plotting shift */}
        {!isMagang && (
          <div className="shift-card no-print">
            <div>
              <p style={{ margin: "0 0 5px 0", color: "var(--muted)", fontSize: "13px", fontWeight: "bold", textTransform: "uppercase" }}>Jadwal Anda Hari Ini</p>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>
                {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </h2>
            </div>
            <div className="shift-badge" style={isOff
              ? { background: "var(--red-50)", color: "var(--red-600)", borderColor: "rgba(220,38,38,0.3)" }
              : { background: "var(--ok-50)", color: "var(--ok)", borderColor: "rgba(22,163,74,0.3)" }}>
              {isOff ? (
                <><IconAlertTriangle size={16} /> OFF DUTY {hariIniShift !== "Off" && hariIniShift !== "Izin" && hariIniShift !== "Off / Belum Diplot" ? `(${hariIniShift.toUpperCase()})` : hariIniShift === "Izin" ? "(IZIN)" : ""}</>
              ) : (
                <><IconMapPin size={16} /> ON DUTY : {hariIniShift.toUpperCase()} {waktuTeks ? `(${waktuTeks})` : ""}</>
              )}
            </div>
            {isOff && (statusKeterangan || jagaBerikutnyaTeks) && (
              <div style={{ width: "100%", fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.6, paddingTop: "4px", borderTop: "1px dashed var(--line)", marginTop: "2px" }}>
                {statusKeterangan && <div>{statusKeterangan}</div>}
                {jagaBerikutnyaTeks && <div style={{ fontWeight: 700, color: "var(--ink-soft)" }}>{jagaBerikutnyaTeks}</div>}
              </div>
            )}
          </div>
        )}

        {/* 🔄 STATUS SERAH TERIMA SHIFT -- klik buat buka/scan di /dashboard/security/tukar-shift.
            Cuma muncul dalam jendela pergantian shift ATAU kalau ada serah terima yang lagi
            berjalan/baru selesai (biar gak hilang tiba-tiba di tengah proses kalau jendelanya
            keburu lewat 60 menit). */}
        {!isMagang && (dalamJendelaTukar || !!handoverStatus) && (
          <div
            className="no-print"
            onClick={() => router.push("/dashboard/security/tukar-shift")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
              background: handoverStatus?.status === "selesai" ? "var(--ok-50)" : "var(--warn-50)",
              border: `1px solid ${handoverStatus?.status === "selesai" ? "rgba(22,163,74,0.25)" : "rgba(217,119,6,0.25)"}`,
              borderRadius: "14px", padding: "12px 16px", marginTop: "10px", cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: handoverStatus?.status === "selesai" ? "var(--ok)" : "var(--warn)" }}>
              {handoverStatus?.status === "selesai"
                ? `✅ Serah Terima Selesai (${handoverStatus.petugas_keluar} → ${handoverStatus.petugas_masuk})`
                : handoverStatus?.status === "menunggu_scan"
                ? `⏳ Menunggu Serah Terima (${handoverStatus.petugas_keluar} selesai jaga)`
                : "🔄 Tukar Shift / Jaga — Belum Ada Serah Terima"}
            </span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)" }}>Buka &rarr;</span>
          </div>
        )}

        {!isMagang && <AbsensiCard picName={picName} departemen="Security" />}
        {/* §129 booking ruangan live (hari ini & besok) */}
        <BookingRuanganPanel />
        {/* §128 kinerja pribadi -- hanya angka sendiri */}
        {!isMagang && picName && <KinerjaSayaPanel nama={picName} departemen="Security" />}

        {!isMagang && jumlahValidasi > 0 && (
          <button
            type="button"
            className="no-print"
            onClick={() => router.push("/dashboard/security/validasi")}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", width: "100%", background: "var(--warn-50)", border: "none", borderRadius: "16px", padding: "14px 16px", marginTop: "10px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", fontWeight: 800, color: "var(--warn)" }}>
              <IconClock size={18} /> {jumlahValidasi} karyawan perlu divalidasi (lembur / belum tercatat masuk)
            </span>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>Buka &rarr;</span>
          </button>
        )}

        {/* 👑 MENU KHUSUS DANRU */}
        {isKoordinatorArea && (
          <div
            className="coord-card no-print"
            onClick={() => router.push("/dashboard/security/jadwal")}
            style={{ background: "linear-gradient(to right, #1a365d, #2c5282)", boxShadow: "0 10px 15px -3px rgba(44, 82, 130, 0.4)" }}
          >
            <div className="coord-icon"><IconCalendar size={28} /></div>
            <div>
              <h2 style={{ margin: "0 0 5px 0", fontSize: "18px" }}>Pembuatan Jadwal Rotasi 2-2-2</h2>
              <p style={{ margin: "0", fontSize: "13px", opacity: 0.8 }}>Akses khusus Danru untuk men-generate matriks shift otomatis periode 11-10.</p>
            </div>
          </div>
        )}

        {/* 🔹 GRID MENU UTAMA SECURITY */}
        <div className="admin-grid no-print">
          {menuUntukDitampilkan.map((menu, index) => {
            const tc = tokenColors[menu.token];
            const MenuIcon = menu.icon;
            return (
              <div
                key={index}
                className={`admin-card${menu.hideOnMobile ? " hide-card-mobile" : ""}`}
                onClick={() => menu.action === "modal_lembur" ? setActiveModal("lembur") : router.push(menu.path)}
                style={{ "--hover-color": tc.color } as React.CSSProperties}
              >
                <div className="admin-card-icon" style={{ background: tc.bg, color: tc.color }}>
                  <MenuIcon size={26} />
                </div>
                <div>
                  <h2 className="admin-card-title">{menu.title}</h2>
                  <p className="admin-card-desc">{menu.desc}</p>
                </div>
                <div className="admin-card-arrow" style={{ color: tc.color }}>Buka Modul ➔</div>
              </div>
            );
          })}
        </div>

        {/* 🗓️ PAPAN MONITORING ROSTER BULANAN — gak relevan buat magang, gak ikut sistem plotting shift */}
        {!isMagang && (
        <div className="print-area roster-panel">
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              <div className="section-title-icon"><IconLayoutGrid size={20} /></div>
              <div>
                <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px" }}>Roster Shift Security</h2>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>{namaBulanAktif || "Belum Terbit"}</p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div className="roster-legend">
                <span className="roster-chip" style={{ background: "var(--hover)", color: "var(--ink-soft)" }}>S1: 08-20</span>
                <span className="roster-chip" style={{ background: "var(--hover)", color: "var(--ink-soft)" }}>S2: 20-08</span>
                <span className="roster-chip" style={{ background: "var(--red-50)", color: "var(--red-600)" }}>Off</span>
              </div>

              {isKoordinatorArea && Object.keys(semuaPlotBulanIni).length > 0 && (
                <button onClick={handlePrint} className="print-btn">
                  <IconPrinter size={15} /> Cetak Roster A4
                </button>
              )}
            </div>
          </div>

          {Object.keys(semuaPlotBulanIni).length > 0 ? (
            <div className="roster-wrapper" style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <table className="roster-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
                    <th style={{ padding: "8px 10px", borderBottom: "2px solid var(--line)", textAlign: "left", fontSize: "11px" }}>Tgl</th>
                    {securityStaff.map(staf => <th key={staf} style={{ padding: "8px 10px", borderBottom: "2px solid var(--line)", minWidth: "84px", fontSize: "11px" }}>{staf}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(semuaPlotBulanIni).sort().map((tglKey) => {
                    const tglDisplay = tglKey.split("-")[2];
                    const dataHari = semuaPlotBulanIni[tglKey];

                    const isHariIni = tglKey === todayISO;

                    return (
                      <tr key={tglKey} style={{ background: isHariIni ? "var(--red-50)" : "var(--surface)", borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "5px 10px", textAlign: "left", fontWeight: isHariIni ? "900" : "bold", color: isHariIni ? "var(--red-700)" : "var(--muted)", fontSize: "11.5px", whiteSpace: "nowrap" }}>
                          {tglDisplay}
                          {isHariIni && <span style={{ fontSize: "8px", background: "var(--brand)", color: "#fff", padding: "1px 5px", borderRadius: "4px", marginLeft: "5px" }}>HARI INI</span>}
                        </td>
                        {securityStaff.map((staf) => {
                          const sVal = dataHari[staf] || "-";
                          const isOffCell = sVal.includes("Off");
                          const isIzin = sVal.includes("Izin");
                          const isKosong = sVal === "-";
                          const displayShift = getInisialDanJam(sVal);
                          const extend = cariExtend(tglKey, sVal, staf);

                          const chipBg = extend ? (extend.status === "menunggu_keputusan" ? "var(--red-50)" : "var(--accent-50)") : isKosong ? "transparent" : isOffCell ? "var(--red-50)" : isIzin ? "var(--warn-50)" : "var(--info-50)";
                          const chipColor = extend ? (extend.status === "menunggu_keputusan" ? "var(--red-600)" : "var(--accent)") : isKosong ? "var(--muted)" : isOffCell ? "var(--red-600)" : isIzin ? "var(--warn)" : "var(--info)";
                          const label = extend
                            ? extend.status === "menunggu_keputusan" ? "⚠️ TERLAMBAT" : `${displayShift} → ${extend.personil_extend} (EXTEND)`
                            : displayShift;

                          return (
                            <td key={staf} style={{ padding: "5px 6px" }}>
                              <span style={{ display: "inline-block", padding: isKosong ? "0" : "3px 9px", borderRadius: "20px", background: chipBg, color: chipColor, fontWeight: 700, fontSize: "10.5px", whiteSpace: "nowrap" }}>{label}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-print" style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              <IconInbox size={30} />
              Jadwal Roster Belum Terbit. Silakan hubungi Danru.
            </div>
          )}
        </div>
        )}
      </div>



      {/* Klaim lembur tim -- komponen bersama Security/OB/Driver (§63) */}
      <KlaimLemburModal open={activeModal === "lembur"} onClose={() => setActiveModal("none")} picName={picName} departemen="Security" judul="Klaim Overtime Security" labelArea="Area Penjagaan" placeholderArea="Cth: Area Pos Security Utama" areaBawaan="Area Pos Security" alasanBawaan="Lembur Back-up Shift" placeholderAlasan="Cth: Back-up shift personil yang sakit" />

      {!isMagang && <EskalasiShiftModal picName={picName} />}

    </AdminShell>
  );
}
