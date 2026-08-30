"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { useAuthGuard } from "../../../../hooks/useAuthGuard";
import { useToast } from "../../../../components/ui/ToastProvider";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan dashboard/security & dashboard/ob
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconCrown = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 3 3 6-7 6 7 3-3-2 11H5z" /></svg>
);
const IconCalendar = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>
);
const IconHourglass = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 21h12" /><path d="M7 3c0 5 5 6 5 9s-5 4-5 9" /><path d="M17 3c0 5-5 6-5 9s5 4 5 9" /></svg>
);
const IconArrowRight = ({ size = 15, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
);
const IconLightbulb = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z" /></svg>
);
const IconCheckCircle = ({ size = 20, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
);
const IconWand = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 4 1.5 1.5M4 20l10-10" /><path d="M14.5 9.5 19 5" /><path d="M19 9v.01M15 3v.01M21 15v.01" /></svg>
);
const IconRocket = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 16s-1-5 4-9c4-3.4 8-3 8-3s.4 4-3 8c-4 5-9 4-9 4z" /><path d="M9 15l-4 4" /><circle cx="14.5" cy="9.5" r="1.5" /></svg>
);
const IconChart = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M11 20V4M18 20v-7" /></svg>
);

interface SlotHarian {
  tanggalStr: string;
  namaHari: string;
  plotKaryawan: Record<string, string>;
}

const NAMA_HARI_IND = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN_IND = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
// Pola Rotasi Standar 12 Jam: 2 Hari Shift 1, 2 Hari Shift 2, 2 Hari Off
const POLA_ROTASI = ["Shift 1", "Shift 1", "Shift 2", "Shift 2", "Off", "Off"];
// 3 kelompok dasar pola (tiap kelompok berisi 2 hari berturut) — dipakai untuk melacak sambungan antar periode
const KELOMPOK_POLA = ["Shift 1", "Shift 2", "Off"] as const;
type Kelompok = typeof KELOMPOK_POLA[number];
// Siklus untuk edit manual per-sel di tampilan tabel ringkas
const SIKLUS_MANUAL = ["Shift 1", "Shift 2", "Off", "Izin", ""];

// ===== Helper tanggal (semua lokal, tanpa Date.now() supaya aman dari lint react-hooks/purity) =====
const pad2 = (n: number) => String(n).padStart(2, "0");
const formatTglStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseTglStr = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const geserHari = (tglStr: string, n: number) => { const d = parseTglStr(tglStr); d.setDate(d.getDate() + n); return formatTglStr(d); };
const bulanKeyDari = (tglStr: string) => tglStr.substring(0, 7);

// Hitung jumlah hari dari tglMulai sampai tanggal 10 bulan berikutnya (inklusif) — panjangnya berubah-ubah
// tergantung jumlah hari di bulan tsb (29-31 hari), bukan dipatok 30 hari terus.
const hitungJumlahHariSampaiTgl10BulanDepan = (tglMulai: string): number => {
  const d = parseTglStr(tglMulai);
  const tglAkhir = new Date(d.getFullYear(), d.getMonth() + 1, 10);
  const selisihMs = tglAkhir.getTime() - d.getTime();
  return Math.round(selisihMs / 86400000) + 1;
};

// Tanggal 11 dari bulan setelah tglMulai — dipakai tombol "Proses Periode Berikutnya"
const tgl11BulanBerikutnya = (tglMulai: string): string => {
  const d = parseTglStr(tglMulai);
  return formatTglStr(new Date(d.getFullYear(), d.getMonth() + 1, 11));
};

const kelompokDari = (label?: string): Kelompok | null => {
  if (!label) return null;
  if (label.includes("Shift 1")) return "Shift 1";
  if (label.includes("Shift 2")) return "Shift 2";
  if (label.includes("Off") || label.includes("Izin")) return "Off"; // Izin dilacak sebagai "Off" untuk kelanjutan pola dasarnya
  return null;
};
const indexHari1 = (g: Kelompok) => KELOMPOK_POLA.indexOf(g) * 2;
const indexHari2 = (g: Kelompok) => KELOMPOK_POLA.indexOf(g) * 2 + 1;
const indexHari1GrupBerikut = (g: Kelompok) => indexHari1(KELOMPOK_POLA[(KELOMPOK_POLA.indexOf(g) + 1) % 3]);

// Tebak index pola (0-5) untuk HARI PERTAMA periode baru, berdasarkan 2 hari terakhir periode SEBELUMNYA.
// Ini yang bikin plot bulan baru otomatis nyambung rapi ke bulan sebelumnya, tanpa perlu ditebak manual.
const tentukanIndexLanjutan = (shiftH1?: string, shiftH2?: string): number | null => {
  const g1 = kelompokDari(shiftH1); // 1 hari sebelum periode baru mulai
  if (!g1) return null;
  const g2 = kelompokDari(shiftH2); // 2 hari sebelum periode baru mulai
  if (g2 === g1) return indexHari1GrupBerikut(g1); // h1 = hari ke-2 pasangannya -> lanjut ke grup baru hari ke-1
  return indexHari2(g1); // h1 = hari ke-1 pasangannya (atau tak diketahui) -> lanjut hari ke-2 grup yang sama
};

const warnaShift = (s: string) => {
  if (s === "Off") return "var(--red-600)";
  if (s === "Izin") return "var(--warn)";
  if (s === "Shift 1" || s === "Shift 2") return "var(--info)";
  return "var(--line)";
};
const labelShift = (s: string) => (s === "Shift 1" ? "S1" : s === "Shift 2" ? "S2" : s === "Izin" ? "Izin" : s === "Off" ? "X" : "—");

export default function PengaturanJadwalSecurity() {
  const router = useRouter();
  const showToast = useToast();

  // Akses & sesi login sekarang dari hook terpusat (menggantikan blok localStorage manual)
  const { session, isReady: isAuthReady } = useAuthGuard({
    roles: ["Danru", "Koordinator", "Admin"],
    redirectTo: "/dashboard/security",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Komandan Regu (Danru).",
  });
  const picName = session?.nama || "";

  const [isKalenderReady, setIsKalenderReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Tanggal mulai periode BEBAS (bukan terkunci tanggal 11 lagi) + panjang periode
  const [tglMulaiPilihan, setTglMulaiPilihan] = useState<string>(() => {
    const t = new Date();
    return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-11`;
  });
  const [panjangPeriode, setPanjangPeriode] = useState<"bulan" | "tahun">("bulan");
  // Kalau dicentang, "Generate Otomatis" menimpa SEMUA data (termasuk yang sudah tersimpan/manual).
  // Default OFF supaya aman: cuma isi sel yang masih kosong, data lama/manual (termasuk Izin) tidak ketimpa.
  const [timpaData, setTimpaData] = useState<boolean>(false);

  const [matriksJadwal, setMatriksJadwal] = useState<SlotHarian[]>([]);
  const [timSecurity, setTimSecurity] = useState<string[]>([]);
  // Nama staf yang hari pertamanya berhasil di-auto-lanjut dari periode sebelumnya (buat ditandai di UI)
  const [lanjutanInfo, setLanjutanInfo] = useState<Record<string, string>>({});

  // =========================================================================
  // 1. FUNGSI PENARIKAN DATA — bentang tanggal bebas, otomatis nyambung ke periode sebelumnya
  // =========================================================================
  const generateKalenderKosong = useCallback(async (daftarStaf: string[], tglMulaiOverride?: string) => {
    const tglMulai = tglMulaiOverride || tglMulaiPilihan;
    // Periode standar: tanggal 11 bulan berjalan s/d tanggal 10 bulan berikutnya (panjangnya menyesuaikan jumlah hari bulan itu)
    const jumlahHari = panjangPeriode === "tahun" ? 365 : hitungJumlahHariSampaiTgl10BulanDepan(tglMulai);
    const daftarTanggal: string[] = Array.from({ length: jumlahHari }, (_, i) => geserHari(tglMulai, i));
    const tglSebelum1 = geserHari(tglMulai, -1);
    const tglSebelum2 = geserHari(tglMulai, -2);

    // Semua bulan yang tersentuh (termasuk 2 hari sebelum mulai, untuk deteksi sambungan)
    const bulanSet = new Set<string>();
    [...daftarTanggal, tglSebelum1, tglSebelum2].forEach(t => bulanSet.add(bulanKeyDari(t)));

    const dataSaves: Record<string, string> = {};
    try {
      const hasilSnap = await Promise.all(
        Array.from(bulanSet).map(bk => getDoc(doc(db, "security_monthly_schedules", bk)))
      );
      hasilSnap.forEach(snap => {
        if (snap.exists()) {
          const harian = snap.data().data_hari || {};
          Object.keys(harian).forEach(tgl => {
            Object.keys(harian[tgl]).forEach(nama => { dataSaves[`${tgl}_${nama}`] = harian[tgl][nama]; });
          });
        }
      });
    } catch (e) {
      console.error("Gagal menarik data lama:", e);
    }

    const daftarHari: SlotHarian[] = daftarTanggal.map(tglFormat => {
      const dow = parseTglStr(tglFormat).getDay();
      const plotKaryawan: Record<string, string> = {};
      daftarStaf.forEach(k => { plotKaryawan[k] = dataSaves[`${tglFormat}_${k}`] || ""; });
      return { tanggalStr: tglFormat, namaHari: NAMA_HARI_IND[dow], plotKaryawan };
    });

    // Auto-lanjutkan hari pertama dari akhir periode sebelumnya (kalau belum ada data tersimpan utk hari itu)
    const catatanLanjutan: Record<string, string> = {};
    daftarStaf.forEach(staf => {
      if (daftarHari[0].plotKaryawan[staf]) return; // sudah ada data tersimpan -> jangan ditimpa
      const idx = tentukanIndexLanjutan(dataSaves[`${tglSebelum1}_${staf}`], dataSaves[`${tglSebelum2}_${staf}`]);
      if (idx !== null) {
        daftarHari[0].plotKaryawan[staf] = POLA_ROTASI[idx];
        catatanLanjutan[staf] = tglSebelum1;
      }
    });

    setLanjutanInfo(catatanLanjutan);
    setMatriksJadwal(daftarHari);
    setIsKalenderReady(true);
    return daftarHari;
  }, [tglMulaiPilihan, panjangPeriode]);

  // =========================================================================
  // 2. TARIK TIM SECURITY — jalan begitu akses sudah tervalidasi oleh useAuthGuard
  // =========================================================================
  useEffect(() => {
    if (!isAuthReady) return;
    const tarikTimSecurity = async () => {
      try {
        const q = query(collection(db, "users_master"), where("departemen", "==", "Security"));
        const snap = await getDocs(q);
        const staffList: string[] = [];
        snap.forEach(docSnap => {
          const data = docSnap.data();
          const staffRole: string = data.role || "Staff";
          const isMagangStaff = staffRole.toLowerCase().includes("magang");
          // Anak magang gak ikut plotting jadwal shift (sama seperti dashboard/security/page.tsx),
          // jadi gak dimasukin ke roster -- gak perlu dijadwalkan shift/off dan gak ikut pola 2-2-2.
          if (!isMagangStaff) staffList.push(data.nama);
        });
        // Urutan kolom: Danru/Awaluddin dulu, lalu Ibrahim, lalu Agus, sisanya alfabetis
        const prioritasNama = (nama: string): number => {
          const n = nama.toLowerCase();
          if (n.includes("danru") || nama === "Awaluddin") return 0;
          if (n.includes("ibrahim")) return 1;
          if (n.includes("agus")) return 2;
          return 3;
        };
        staffList.sort((a, b) => {
          const pa = prioritasNama(a), pb = prioritasNama(b);
          if (pa !== pb) return pa - pb;
          return a.localeCompare(b);
        });
        setTimSecurity(staffList);
      } catch (error) {
        console.error(error);
      }
    };
    tarikTimSecurity();
  }, [isAuthReady]);

  // 2b. Bangun ulang kalender setiap kali daftar staf, tanggal mulai, atau panjang periode berubah
  useEffect(() => {
    if (timSecurity.length === 0) return;
    // generateKalenderKosong akhirnya memanggil beberapa setState -> bungkus setTimeout(...,0)
    // sesuai konvensi project untuk lolos lint react-hooks/set-state-in-effect
    const t = setTimeout(() => { generateKalenderKosong(timSecurity); }, 0);
    return () => clearTimeout(t);
  }, [timSecurity, generateKalenderKosong]);

  const handleCycleShift = (dayIndex: number, karyawan: string) => {
    setMatriksJadwal(prev => {
      const update = prev.map(h => ({ ...h, plotKaryawan: { ...h.plotKaryawan } }));
      const skrg = update[dayIndex].plotKaryawan[karyawan] || "";
      const idx = SIKLUS_MANUAL.indexOf(skrg);
      update[dayIndex].plotKaryawan[karyawan] = SIKLUS_MANUAL[(idx + 1) % SIKLUS_MANUAL.length];
      return update;
    });
  };

  // =========================================================================
  // 💡 3. GENERATE OTOMATIS (POLA 2-2-2) — sekarang jalan utk berapa pun panjang periodenya (1 bulan / 1 tahun),
  //    dan secara default TIDAK menimpa sel yang sudah terisi (data lama/manual/Izin aman)
  // =========================================================================
  const getStartIndex = (shift: string) => {
    if (shift.includes("Shift 1")) return 0;
    if (shift.includes("Shift 2")) return 2;
    if (shift.includes("Off") || shift.includes("Izin")) return 4;
    return 0;
  };

  const isiPolaRotasi = (dataAwal: SlotHarian[], timpa: boolean): SlotHarian[] => {
    const update = dataAwal.map(h => ({ ...h, plotKaryawan: { ...h.plotKaryawan } }));
    const hariPertama = update[0].plotKaryawan;

    timSecurity.forEach(staf => {
      const shiftAwal = hariPertama[staf];
      if (!shiftAwal) return; // hari pertama belum diisi (manual atau auto-lanjut) -> lewati staf ini

      let currentIndex = getStartIndex(shiftAwal);
      for (let d = 1; d < update.length; d++) {
        currentIndex = (currentIndex + 1) % POLA_ROTASI.length;
        const sudahAda = update[d].plotKaryawan[staf];
        if (timpa || !sudahAda) {
          update[d].plotKaryawan[staf] = POLA_ROTASI[currentIndex];
        }
      }
    });
    return update;
  };

  const handleAutoGenerate = () => {
    if (matriksJadwal.length === 0) return;
    const update = isiPolaRotasi(matriksJadwal, timpaData);
    setMatriksJadwal(update);
    showToast(`Pola 2-2-2 terisi untuk ${update.length} hari (${timpaData ? "SEMUA data ditimpa" : "hanya sel kosong yang diisi, data lama tetap aman"}). Cek dulu sebelum diterbitkan.`, "info");
  };

  // =========================================================================
  // 3b. PROSES PERIODE BERIKUTNYA — geser ke tgl 11 bulan depan, tarik data,
  //     auto-lanjut hari pertama dari periode ini, lalu langsung isi pola 2-2-2 sepanjang periode.
  // =========================================================================
  const [sedangProsesPeriode, setSedangProsesPeriode] = useState<boolean>(false);
  const handleProsesPeriodeBerikutnya = async () => {
    if (sedangProsesPeriode) return;
    setSedangProsesPeriode(true);
    try {
      const tglBerikutnya = tgl11BulanBerikutnya(tglMulaiPilihan);
      setTglMulaiPilihan(tglBerikutnya);
      const daftarHariBaru = await generateKalenderKosong(timSecurity, tglBerikutnya);
      if (daftarHariBaru && daftarHariBaru.length > 0) {
        const hasilAuto = isiPolaRotasi(daftarHariBaru, false); // jangan pernah timpa data lama pas pindah periode otomatis
        setMatriksJadwal(hasilAuto);
      }
    } finally {
      setSedangProsesPeriode(false);
    }
  };

  // =========================================================================
  // 4. SIMPAN JADWAL KE DATABASE (DIPISAH PER BULAN)
  // =========================================================================
  const handleSimpanJadwal = async () => {
    setIsLoading(true);

    const dataPerBulan: Record<string, Record<string, Record<string, string>>> = {};
    matriksJadwal.forEach(h => {
      const prefixBulan = h.tanggalStr.substring(0, 7);
      if (!dataPerBulan[prefixBulan]) dataPerBulan[prefixBulan] = {};
      dataPerBulan[prefixBulan][h.tanggalStr] = h.plotKaryawan;
    });

    try {
      for (const bulanKey of Object.keys(dataPerBulan)) {
        const jRef = doc(db, "security_monthly_schedules", bulanKey);
        const jSnap = await getDoc(jRef);
        let existingData = {};
        if (jSnap.exists()) existingData = jSnap.data().data_hari || {};
        const mergedData = { ...existingData, ...dataPerBulan[bulanKey] };

        await setDoc(jRef, {
          bulan_tahun: bulanKey,
          data_hari: mergedData,
          dibuat_oleh: picName,
          waktu_update: serverTimestamp()
        }, { merge: true });
      }

      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 4000);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan jadwal.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const getPeriodeText = () => {
    if (matriksJadwal.length === 0) return "Memuat...";
    const awal = matriksJadwal[0].tanggalStr.split("-").reverse().join("/");
    const akhir = matriksJadwal[matriksJadwal.length - 1].tanggalStr.split("-").reverse().join("/");
    return `${awal} s/d ${akhir}`;
  };

  const jumlahBulanTerlibat = new Set(matriksJadwal.map(h => bulanKeyDari(h.tanggalStr))).size;
  if (!isAuthReady || !isKalenderReady) return null;

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>

      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        * { box-sizing: border-box; }
        .top-bar {
          display: flex; justify-content: space-between; align-items: center; padding: 14px 20px;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line);
          position: sticky; top: 0; z-index: 50;
        }
        .back-btn {
          background: var(--bg); border: 1px solid var(--line); border-radius: 10px; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-soft); transition: 0.2s;
        }
        .back-btn:hover { background: var(--line); }
        .danru-badge { display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info); padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: bold; border: 1px solid rgba(37,99,235,0.2); }

        .page-hero {
          position: relative; overflow: hidden; border-radius: 0 0 30px 30px; color: #fff;
          padding: 36px 20px 60px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .page-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .page-hero-content { position: relative; }

        .panel { background: var(--surface); padding: 25px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid var(--line); }
        .config-box { display: flex; flex-direction: column; gap: 12px; margin-bottom: 15px; background: var(--bg); padding: 15px; border-radius: 12px; border: 1px solid var(--line); }
        .config-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .config-label { font-size: 12px; font-weight: bold; color: var(--ink-soft); min-width: 110px; display: flex; align-items: center; gap: 6px; }
        .period-toggle-btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: bold; font-size: 12px; cursor: pointer; font-family: inherit; transition: 0.2s; }

        .howto-box { background: var(--info-50); border: 1px solid rgba(37,99,235,0.2); padding: 12px 15px; border-radius: 12px; margin-bottom: 25px; font-size: 12px; color: var(--info); display: flex; flex-direction: column; gap: 6px; font-weight: bold; line-height: 1.5; }
        .legend-box { background: var(--warn-50); border: 1px solid rgba(217,119,6,0.25); padding: 12px 15px; border-radius: 12px; margin-bottom: 15px; font-size: 12px; color: var(--warn); font-weight: bold; }

        .matrix-cell-btn { width: 100%; padding: 5px 2px; font-size: 10px; font-weight: bold; border-radius: 5px; border: none; cursor: pointer; color: white; font-family: inherit; }
        .generate-btn { width: 100%; padding: 14px; background: var(--info); color: white; border: none; border-radius: 10px; font-weight: bold; font-size: 14px; cursor: pointer; margin-top: 15px; box-shadow: 0 4px 6px rgba(37,99,235,0.3); display: flex; justify-content: center; align-items: center; gap: 8px; font-family: inherit; }
        .publish-btn { width: 100%; padding: 16px; color: white; border: none; border-radius: 12px; font-weight: bold; font-size: 16px; cursor: pointer; margin-top: 30px; box-shadow: 0 4px 6px rgba(220,38,38,0.3); transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; }

        @media (max-width: 640px) {
          .panel { padding: 16px !important; border-radius: 16px !important; }
        }
      `}} />

      {/* NAVBAR */}
      <div className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="back-btn" onClick={() => router.push("/dashboard/security")}><IconArrowLeft size={16} /></button>
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Penyusunan Roster</span>
        </div>
        <div className="danru-badge"><IconCrown size={14} /> Danru Desk</div>
      </div>

      {/* HERO SECTION */}
      <div className="page-hero">
        <div className="page-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PENYUSUNAN ROSTER</h1>
          <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>Pembuatan Jadwal Cerdas (Otomatis Pola 2-2-2, Auto-Lanjut Antar Periode)</p>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>

        <div className="panel">

          {/* PILIHAN TANGGAL MULAI BEBAS + PANJANG PERIODE */}
          <div className="config-box">
            <div className="config-row">
              <span className="config-label"><IconCalendar size={13} /> Tanggal Mulai:</span>
              <input
                type="date"
                value={tglMulaiPilihan}
                onChange={(e) => e.target.value && setTglMulaiPilihan(e.target.value)}
                style={{ flex: 1, minWidth: "160px", padding: "10px", borderRadius: "8px", fontSize: "14px", fontWeight: "bold", border: "1px solid var(--line)", background: "var(--surface)", outline: "none", color: "var(--ink)", fontFamily: "inherit" }}
              />
            </div>
            <div className="config-row">
              <span className="config-label"><IconHourglass size={13} /> Panjang Periode:</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button type="button" onClick={() => setPanjangPeriode("bulan")} className="period-toggle-btn" style={{ background: panjangPeriode === "bulan" ? "var(--info)" : "var(--line)", color: panjangPeriode === "bulan" ? "white" : "var(--ink-soft)" }}>1 Bulan (tgl 11 s/d 10)</button>
                <button type="button" onClick={() => setPanjangPeriode("tahun")} className="period-toggle-btn" style={{ background: panjangPeriode === "tahun" ? "var(--info)" : "var(--line)", color: panjangPeriode === "tahun" ? "white" : "var(--ink-soft)" }}>1 Tahun Penuh (365 hari)</button>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--muted)", fontWeight: "bold", cursor: "pointer" }}>
              <input type="checkbox" checked={timpaData} onChange={(e) => setTimpaData(e.target.checked)} />
              Timpa data yang sudah tersimpan (reset total periode ini) — biarkan OFF untuk aman
            </label>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>
              Periode: <b>{getPeriodeText()}</b> · {matriksJadwal.length} hari · {jumlahBulanTerlibat} dokumen bulan akan disimpan
            </div>
            <button
              type="button" onClick={handleProsesPeriodeBerikutnya} disabled={sedangProsesPeriode}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "13px", cursor: sedangProsesPeriode ? "default" : "pointer", background: sedangProsesPeriode ? "#a0aec0" : "var(--ok)", color: "white", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", fontFamily: "inherit" }}
            >
              <IconArrowRight size={14} /> {sedangProsesPeriode ? "Memproses..." : "Proses Periode Berikutnya (lanjut otomatis + isi pola)"}
            </button>
          </div>

          <div className="howto-box">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><IconLightbulb size={16} /> Cara Pakai:</div>
            <ul style={{ margin: 0, paddingLeft: "26px", fontWeight: "normal" }}>
              <li>Hari pertama periode <b>otomatis disambung</b> dari 2 hari terakhir periode sebelumnya (kalau datanya ada). Nama staf yang auto-tersambung ditandai badge 🔄.</li>
              <li>Kalau staf baru / belum ada histori, isi manual shift hari pertamanya dulu, baru klik <b>&quot;Generate Otomatis&quot;</b> untuk mengisi sisa periode.</li>
              <li>Untuk perbaikan total (misal Agustus ini kacau), centang <b>&quot;Timpa data&quot;</b> lalu Generate Otomatis — semua hari ditulis ulang sesuai pola dari hari pertama.</li>
              <li>Pilih <b>&quot;1 Tahun Penuh&quot;</b> untuk langsung generate 12 bulan ke depan sekaligus dari titik sambung yang sama.</li>
            </ul>
          </div>

          {isSuccess && (
            <div style={{ background: "var(--ok-50)", border: "1px solid rgba(22,163,74,0.25)", color: "var(--ok)", padding: "15px", borderRadius: "12px", marginBottom: "20px", fontWeight: "bold", textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
              <IconCheckCircle size={20} /> Roster Periode {getPeriodeText()} sukses disimpan!
            </div>
          )}

          {/* ================= TAMPILAN TABEL LANDSCAPE — kotak-kotak kecil, satu-satunya mode tampilan ================= */}
          <div>
            <div className="legend-box">
              <IconChart size={13} /> {matriksJadwal.length} hari — klik kotak untuk ganti shift bergantian: S1 → S2 → X → Izin → Kosong. Hari pertama disorot biru; yang auto-lanjut ditandai 🔄 di kolom nama.
            </div>

            <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "12px" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", position: "sticky", top: 0, zIndex: 2 }}>
                    <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid var(--line)", position: "sticky", left: 0, background: "var(--bg)", zIndex: 3, minWidth: "90px", color: "var(--ink-soft)" }}>Tanggal</th>
                    {timSecurity.map(k => (
                      <th key={k} style={{ padding: "6px 4px", textAlign: "center", borderBottom: "2px solid var(--line)", minWidth: "48px", whiteSpace: "nowrap", color: "var(--ink-soft)" }}>
                        {k.split(" ")[0]}{lanjutanInfo[k] ? " 🔄" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matriksJadwal.map((hari, dayIdx) => {
                    const [, , dd] = hari.tanggalStr.split("-");
                    const bulanLabel = NAMA_BULAN_IND[parseTglStr(hari.tanggalStr).getMonth()].substring(0, 3);
                    const rowBg = dayIdx === 0 ? "var(--info-50)" : dd === "01" ? "var(--bg)" : "var(--surface)";
                    return (
                      <tr key={hari.tanggalStr} style={{ background: rowBg }}>
                        <td style={{ padding: "4px 8px", fontWeight: "bold", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)", position: "sticky", left: 0, background: rowBg, whiteSpace: "nowrap", fontSize: "11px" }}>
                          {hari.namaHari.substring(0, 3)}, {dd} {bulanLabel}
                        </td>
                        {timSecurity.map(k => {
                          const val = hari.plotKaryawan[k] || "";
                          return (
                            <td key={k} style={{ padding: "2px", textAlign: "center", borderBottom: "1px solid var(--line)" }}>
                              <button
                                type="button"
                                onClick={() => handleCycleShift(dayIdx, k)}
                                className="matrix-cell-btn"
                                style={{ background: warnaShift(val), opacity: val ? 1 : 0.5 }}
                              >
                                {val ? labelShift(val) : "—"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button onClick={handleAutoGenerate} className="generate-btn">
              <IconWand size={16} /> Generate Otomatis Untuk Sisa Periode
            </button>
          </div>

          <button
            onClick={handleSimpanJadwal} disabled={isLoading}
            className="publish-btn"
            style={{ background: isLoading ? "#a0aec0" : "var(--red-600)" }}
          >
            <IconRocket size={16} /> {isLoading ? "Menyimpan Data Roster..." : `Terbitkan Roster Resmi ke Portal (${jumlahBulanTerlibat} bulan)`}
          </button>

        </div>
      </div>
    </div>
  );
}
