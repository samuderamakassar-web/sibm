"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { useAuthGuard } from "../../../../hooks/useAuthGuard";

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
  if (s === "Off") return "#e53e3e";
  if (s === "Izin") return "#dd6b20";
  if (s === "Shift 1" || s === "Shift 2") return "#3182ce";
  return "#cbd5e0";
};
const labelShift = (s: string) => (s === "Shift 1" ? "☀️ S1" : s === "Shift 2" ? "🌙 S2" : s === "Izin" ? "📝 Izin" : s === "Off" ? "❌ Off" : "—");

export default function PengaturanJadwalSecurity() {
  const router = useRouter();

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
  const generateKalenderKosong = useCallback(async (daftarStaf: string[]) => {
    const jumlahHari = panjangPeriode === "tahun" ? 365 : 30;
    const daftarTanggal: string[] = Array.from({ length: jumlahHari }, (_, i) => geserHari(tglMulaiPilihan, i));
    const tglSebelum1 = geserHari(tglMulaiPilihan, -1);
    const tglSebelum2 = geserHari(tglMulaiPilihan, -2);

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
        snap.forEach(docSnap => staffList.push(docSnap.data().nama));
        staffList.sort((a, b) => {
          if (a.toLowerCase().includes("danru") || a === "Awaluddin") return -1;
          if (b.toLowerCase().includes("danru") || b === "Awaluddin") return 1;
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

  const handleSetShift = (dayIndex: number, karyawan: string, shiftValue: string) => {
    setMatriksJadwal(prev => {
      const update = prev.map(h => ({ ...h, plotKaryawan: { ...h.plotKaryawan } }));
      update[dayIndex].plotKaryawan[karyawan] = update[dayIndex].plotKaryawan[karyawan] === shiftValue ? "" : shiftValue;
      return update;
    });
  };

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

  const handleAutoGenerate = () => {
    if (matriksJadwal.length === 0) return;

    setMatriksJadwal(prev => {
      const update = prev.map(h => ({ ...h, plotKaryawan: { ...h.plotKaryawan } }));
      const hariPertama = update[0].plotKaryawan;

      timSecurity.forEach(staf => {
        const shiftAwal = hariPertama[staf];
        if (!shiftAwal) return; // hari pertama belum diisi (manual atau auto-lanjut) -> lewati staf ini

        let currentIndex = getStartIndex(shiftAwal);
        for (let d = 1; d < update.length; d++) {
          currentIndex = (currentIndex + 1) % POLA_ROTASI.length;
          const sudahAda = update[d].plotKaryawan[staf];
          if (timpaData || !sudahAda) {
            update[d].plotKaryawan[staf] = POLA_ROTASI[currentIndex];
          }
        }
      });
      return update;
    });

    alert(`✨ Pola 2-2-2 terisi untuk ${matriksJadwal.length} hari (${timpaData ? "SEMUA data ditimpa" : "hanya sel kosong yang diisi, data lama tetap aman"}). Cek dulu sebelum diterbitkan.`);
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
      alert("Gagal menyimpan jadwal.");
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
  const modeRingkas = matriksJadwal.length > 35; // >35 hari (mis. generate 1 tahun) -> pakai tabel ringkas biar ringan & gampang diakses

  if (!isAuthReady || !isKalenderReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>

      {/* NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/dashboard/security")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 Danru Desk
        </div>
      </div>

      {/* HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #8b0000 0%, #e53e3e 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(229, 62, 62, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>PENYUSUNAN ROSTER</h1>
        <p style={{ margin: "0", fontSize: "13px", opacity: 0.9 }}>Pembuatan Jadwal Cerdas (Otomatis Pola 2-2-2, Auto-Lanjut Antar Periode)</p>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>

        <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>

          {/* PILIHAN TANGGAL MULAI BEBAS + PANJANG PERIODE */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "15px", background: "#f8fafc", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", minWidth: "110px" }}>📅 Tanggal Mulai:</span>
              <input
                type="date"
                value={tglMulaiPilihan}
                onChange={(e) => e.target.value && setTglMulaiPilihan(e.target.value)}
                style={{ flex: 1, minWidth: "160px", padding: "10px", borderRadius: "8px", fontSize: "14px", fontWeight: "bold", border: "1px solid #cbd5e0", background: "white", outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", minWidth: "110px" }}>⏳ Panjang Periode:</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button type="button" onClick={() => setPanjangPeriode("bulan")} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontWeight: "bold", fontSize: "12px", cursor: "pointer", background: panjangPeriode === "bulan" ? "#3182ce" : "#e2e8f0", color: panjangPeriode === "bulan" ? "white" : "#4a5568" }}>1 Bulan (30 hari)</button>
                <button type="button" onClick={() => setPanjangPeriode("tahun")} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontWeight: "bold", fontSize: "12px", cursor: "pointer", background: panjangPeriode === "tahun" ? "#3182ce" : "#e2e8f0", color: panjangPeriode === "tahun" ? "white" : "#4a5568" }}>🪄 1 Tahun Penuh (365 hari)</button>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#718096", fontWeight: "bold", cursor: "pointer" }}>
              <input type="checkbox" checked={timpaData} onChange={(e) => setTimpaData(e.target.checked)} />
              Timpa data yang sudah tersimpan (reset total periode ini) — biarkan OFF untuk aman
            </label>
            <div style={{ fontSize: "11px", color: "#a0aec0" }}>
              Periode: <b>{getPeriodeText()}</b> · {matriksJadwal.length} hari · {jumlahBulanTerlibat} dokumen bulan akan disimpan
            </div>
          </div>

          <div style={{ background: "#ebf8ff", border: "1px solid #bee3f8", padding: "12px 15px", borderRadius: "12px", marginBottom: "25px", fontSize: "12px", color: "#2b6cb0", display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold", lineHeight: "1.5" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ fontSize: "16px" }}>💡</span> Cara Pakai:</div>
            <ul style={{ margin: 0, paddingLeft: "30px", fontWeight: "normal" }}>
              <li>Hari pertama periode <b>otomatis disambung</b> dari 2 hari terakhir periode sebelumnya (kalau datanya ada). Nama staf yang auto-tersambung ditandai badge 🔄.</li>
              <li>Kalau staf baru / belum ada histori, isi manual shift hari pertamanya dulu, baru klik <b>&quot;Generate Otomatis&quot;</b> untuk mengisi sisa periode.</li>
              <li>Untuk perbaikan total (misal Agustus ini kacau), centang <b>&quot;Timpa data&quot;</b> lalu Generate Otomatis — semua hari ditulis ulang sesuai pola dari hari pertama.</li>
              <li>Pilih <b>&quot;1 Tahun Penuh&quot;</b> untuk langsung generate 12 bulan ke depan sekaligus dari titik sambung yang sama.</li>
            </ul>
          </div>

          {isSuccess && (
            <div style={{ background: "#f0fff4", border: "1px solid #c6f6d5", color: "#22543d", padding: "15px", borderRadius: "12px", marginBottom: "20px", fontWeight: "bold", textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
              <span style={{ fontSize: "20px" }}>✅</span> Roster Periode {getPeriodeText()} sukses disimpan!
            </div>
          )}

          {!modeRingkas ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>

              {/* BARIS PERTAMA — DIBEDAKAN WARNANYA UNTUK MASTER */}
              {matriksJadwal.length > 0 && (
                <div style={{ border: "2px solid #3182ce", borderRadius: "16px", padding: "20px", background: "#ebf8ff", boxShadow: "0 4px 10px rgba(49, 130, 206, 0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "1px solid #bee3f8", paddingBottom: "10px" }}>
                    <div style={{ fontWeight: "900", color: "#2b6cb0", fontSize: "16px" }}>
                      ⭐ {matriksJadwal[0].namaHari}, {matriksJadwal[0].tanggalStr.split("-").reverse().join("/")} (AWAL PERIODE)
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {timSecurity.map(karyawan => {
                      const shiftAktif = matriksJadwal[0].plotKaryawan[karyawan];
                      const autoLanjut = lanjutanInfo[karyawan];
                      return (
                        <div key={karyawan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", background: "white", padding: "12px 15px", borderRadius: "10px", border: "1px solid #bee3f8" }}>
                          <span style={{ fontSize: "14px", fontWeight: "bold", color: "#1a202c", flex: 1, minWidth: "150px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ width: "24px", height: "24px", background: "#e2e8f0", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "10px" }}>👮</span>
                            {karyawan}
                            {autoLanjut && <span style={{ fontSize: "10px", fontWeight: "bold", color: "#2b6cb0", background: "#ebf8ff", border: "1px solid #bee3f8", borderRadius: "20px", padding: "2px 8px" }} title={`Disambung otomatis dari ${autoLanjut}`}>🔄 Auto-lanjut</span>}
                          </span>

                          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                            {["Shift 1", "Shift 2", "Off", "Izin"].map(s => (
                              <button
                                key={s} type="button" onClick={() => handleSetShift(0, karyawan, s)}
                                style={{
                                  padding: "8px 12px", fontSize: "11px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", transition: "0.2s",
                                  background: shiftAktif === s ? warnaShift(s) : "#cbd5e0", color: "white"
                                }}
                              >
                                {labelShift(s)}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button onClick={handleAutoGenerate} style={{ width: "100%", padding: "14px", background: "#2b6cb0", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", marginTop: "20px", boxShadow: "0 4px 6px rgba(43,108,176,0.3)", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "18px" }}>🪄</span> Generate Otomatis Untuk Sisa Periode
                  </button>
                </div>
              )}

              {/* SISA HARI */}
              {matriksJadwal.slice(1).map((hari, idxOffset) => {
                const dayIdx = idxOffset + 1;
                return (
                  <div key={hari.tanggalStr} style={{ border: "1px solid #e2e8f0", borderRadius: "16px", padding: "20px", background: "#ffffff", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "1px solid #edf2f7", paddingBottom: "10px" }}>
                      <div style={{ fontWeight: "900", color: "#4a5568", fontSize: "15px" }}>
                        {hari.namaHari}, {hari.tanggalStr.split("-").reverse().join("/")}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {timSecurity.map(karyawan => {
                        const shiftAktif = hari.plotKaryawan[karyawan];
                        return (
                          <div key={karyawan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", background: "#f8fafc", padding: "10px 15px", borderRadius: "10px", border: "1px solid #edf2f7" }}>
                            <span style={{ fontSize: "13px", fontWeight: "bold", color: "#2d3748", flex: 1, minWidth: "150px" }}>{karyawan}</span>
                            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                              {["Shift 1", "Shift 2", "Off", "Izin"].map(s => (
                                <button
                                  key={s} type="button" onClick={() => handleSetShift(dayIdx, karyawan, s)}
                                  style={{
                                    padding: "6px 10px", fontSize: "11px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", transition: "0.2s",
                                    background: shiftAktif === s ? warnaShift(s) : "#cbd5e0", color: "white"
                                  }}
                                >
                                  {labelShift(s)}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ================= MODE RINGKAS (TABEL) — dipakai otomatis kalau periode > 35 hari, mis. generate 1 tahun ================= */
            <div>
              <div style={{ background: "#fffaf0", border: "1px solid #feebc8", padding: "12px 15px", borderRadius: "12px", marginBottom: "15px", fontSize: "12px", color: "#7b341e", fontWeight: "bold" }}>
                📊 Mode Tabel Ringkas ({matriksJadwal.length} hari) — klik sel untuk ganti shift bergantian: S1 → S2 → Off → Izin → Kosong. Hari pertama disorot biru; yang auto-lanjut ditandai 🔄 di kolom nama.
              </div>

              <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 2 }}>
                      <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #e2e8f0", position: "sticky", left: 0, background: "#f8fafc", zIndex: 3, minWidth: "110px" }}>Tanggal</th>
                      {timSecurity.map(k => (
                        <th key={k} style={{ padding: "8px 10px", textAlign: "center", borderBottom: "2px solid #e2e8f0", minWidth: "90px", whiteSpace: "nowrap" }}>
                          {k.split(" ")[0]}{lanjutanInfo[k] ? " 🔄" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matriksJadwal.map((hari, dayIdx) => {
                      const [yy, , dd] = hari.tanggalStr.split("-");
                      const bulanLabel = NAMA_BULAN_IND[parseTglStr(hari.tanggalStr).getMonth()].substring(0, 3);
                      return (
                        <tr key={hari.tanggalStr} style={{ background: dayIdx === 0 ? "#ebf8ff" : dd === "01" ? "#f8fafc" : "white" }}>
                          <td style={{ padding: "6px 10px", fontWeight: "bold", color: "#4a5568", borderBottom: "1px solid #edf2f7", position: "sticky", left: 0, background: dayIdx === 0 ? "#ebf8ff" : dd === "01" ? "#f8fafc" : "white", whiteSpace: "nowrap" }}>
                            {hari.namaHari.substring(0, 3)}, {dd} {bulanLabel} {yy}
                          </td>
                          {timSecurity.map(k => {
                            const val = hari.plotKaryawan[k] || "";
                            return (
                              <td key={k} style={{ padding: "4px", textAlign: "center", borderBottom: "1px solid #edf2f7" }}>
                                <button
                                  type="button"
                                  onClick={() => handleCycleShift(dayIdx, k)}
                                  style={{ width: "100%", padding: "6px 4px", fontSize: "10px", fontWeight: "bold", borderRadius: "6px", border: "none", cursor: "pointer", background: warnaShift(val), color: "white", opacity: val ? 1 : 0.5 }}
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

              <button onClick={handleAutoGenerate} style={{ width: "100%", padding: "14px", background: "#2b6cb0", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", marginTop: "15px", boxShadow: "0 4px 6px rgba(43,108,176,0.3)", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>🪄</span> Generate Otomatis Untuk Sisa Periode
              </button>
            </div>
          )}

          <button
            onClick={handleSimpanJadwal} disabled={isLoading}
            style={{ width: "100%", padding: "16px", background: isLoading ? "#a0aec0" : "#e53e3e", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: "pointer", marginTop: "30px", boxShadow: "0 4px 6px rgba(229,62,62,0.3)", transition: "0.2s" }}
          >
            {isLoading ? "Menyimpan Data Roster..." : `🚀 Terbitkan Roster Resmi ke Portal (${jumlahBulanTerlibat} bulan)`}
          </button>

        </div>
      </div>
    </div>
  );
}