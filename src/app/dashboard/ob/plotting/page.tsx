"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  documentId,
  setDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { useToast } from "../../../../components/ui/ToastProvider";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";

// ==========================================
// KONSTANTA
// ==========================================
const DAFTAR_LANTAI = ["Basement", "Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4", "Lantai 5"];
const AREA_PELAYANAN = "Pelayanan Khusus OB";
const SEMUA_AREA = [...DAFTAR_LANTAI, AREA_PELAYANAN];

interface StaffOB {
  id: string;
  nama: string;
}

type PlotHarian = Record<string, string>;

function toISO(d: Date) {
  return d.toISOString().split("T")[0];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Bagi rata daftar lantai ke staff cleaning yang tersedia, urutan diacak
function buatRotasiCleaning(cleaningStaff: string[]): Record<string, string> {
  const hasil: Record<string, string> = {};
  if (cleaningStaff.length === 0) return hasil;
  const lantaiAcak = shuffle(DAFTAR_LANTAI);
  const perOrang = Math.ceil(lantaiAcak.length / cleaningStaff.length);
  cleaningStaff.forEach((nama, idx) => {
    const bagian = lantaiAcak.slice(idx * perOrang, (idx + 1) * perOrang);
    bagian.forEach((lantai) => {
      hasil[lantai] = nama;
    });
  });
  return hasil;
}

export default function PlottingOBPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();

  const [adminName, setAdminName] = useState("Koordinator");
  const [isPageLoading, setIsPageLoading] = useState(true);

  const [staffList, setStaffList] = useState<StaffOB[]>([]);
  const [pelayananTetap, setPelayananTetap] = useState("");

  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [plotHariIni, setPlotHariIni] = useState<PlotHarian>({});
  const [staffIzin, setStaffIzin] = useState<string[]>([]);
  const [isLoadingHari, setIsLoadingHari] = useState(false);
  const [isSavingHari, setIsSavingHari] = useState(false);

  const [blockSize, setBlockSize] = useState<"2" | "7">("7");
  const [isGenerating, setIsGenerating] = useState(false);

  const [viewMonth, setViewMonth] = useState(toISO(new Date()).slice(0, 7)); // YYYY-MM
  const [monthPreview, setMonthPreview] = useState<Record<string, PlotHarian>>({});
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);

  // ==========================================
  // 1. Cek Akses — khusus Koordinator/Administrator dept OB & CS
  // ==========================================
  useEffect(() => {
    const role = localStorage.getItem("pic_role") || "";
    const dept = (localStorage.getItem("pic_dept") || "").toLowerCase();
    const nama = localStorage.getItem("pic_nama") || "";

    const bolehAkses = (role.includes("Koordinator") || role.includes("Administrator")) && dept.includes("ob & cs");

    if (!bolehAkses) {
      showToast("Akses Ditolak! Halaman ini khusus Koordinator OB & CS.", "error");
      router.push("/dashboard/ob");
      return;
    }
    setTimeout(() => {
      setAdminName(nama || "Koordinator");
      setIsPageLoading(false);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ==========================================
  // 2. Ambil Daftar Staff OB & CS + Setting Pelayanan Tetap
  // ==========================================
  useEffect(() => {
    const muatData = async () => {
      try {
        const qStaff = query(collection(db, "users_master"), where("departemen", "==", "OB & CS"));
        const snapStaff = await getDocs(qStaff);
        const list = snapStaff.docs.map((d) => ({ id: d.id, nama: (d.data().nama as string) || "" }));
        setStaffList(list);

        const refSetting = doc(db, "ob_settings", "config");
        const snapSetting = await getDoc(refSetting);
        if (snapSetting.exists()) {
          setPelayananTetap(snapSetting.data().pelayanan_tetap || "");
        }
      } catch (error) {
        console.error("Gagal memuat data staff/setting:", error);
        showToast("Gagal memuat data staff OB.", "error");
      }
    };
    muatData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const simpanPelayananTetap = async (nama: string) => {
    setPelayananTetap(nama);
    try {
      await setDoc(doc(db, "ob_settings", "config"), { pelayanan_tetap: nama }, { merge: true });
      showToast(`OB Pelayanan Tetap diset ke ${nama}.`, "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan setting.", "error");
    }
  };

  // ==========================================
  // 3. Ambil Plot untuk Tanggal Terpilih
  // ==========================================
  useEffect(() => {
    if (!selectedDate) return;
    const fetchPlot = async () => {
      await Promise.resolve();
      setIsLoadingHari(true);
      setStaffIzin([]);
      try {
        const ref = doc(db, "daily_plots", selectedDate);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setPlotHariIni((snap.data().plot_lantai || {}) as PlotHarian);
        } else {
          const kosong: PlotHarian = {};
          SEMUA_AREA.forEach((a) => {
            kosong[a] = a === AREA_PELAYANAN ? pelayananTetap : "";
          });
          setPlotHariIni(kosong);
        }
      } catch (error) {
        console.error("Gagal memuat plotting hari ini:", error);
      } finally {
        setIsLoadingHari(false);
      }
    };
    fetchPlot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // ==========================================
  // 4. Ambil Kalender Bulan Berjalan
  // ==========================================
  const muatBulan = async (yyyyMM: string) => {
    await Promise.resolve();
    setIsLoadingMonth(true);
    try {
      const [y, m] = yyyyMM.split("-").map(Number);
      const startISO = `${yyyyMM}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const endISO = `${yyyyMM}-${String(lastDay).padStart(2, "0")}`;

      const q = query(
        collection(db, "daily_plots"),
        where(documentId(), ">=", startISO),
        where(documentId(), "<=", endISO)
      );
      const snap = await getDocs(q);
      const hasil: Record<string, PlotHarian> = {};
      snap.forEach((d) => {
        hasil[d.id] = (d.data().plot_lantai || {}) as PlotHarian;
      });
      setMonthPreview(hasil);
    } catch (error) {
      console.error("Gagal memuat kalender bulan ini:", error);
    } finally {
      setIsLoadingMonth(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => muatBulan(viewMonth), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth]);

  // ==========================================
  // 5. Simpan Manual 1 Hari
  // ==========================================
  const simpanSatuHari = async () => {
    setIsSavingHari(true);
    try {
      await setDoc(
        doc(db, "daily_plots", selectedDate),
        { plot_lantai: plotHariIni, waktu_update: serverTimestamp() },
        { merge: true }
      );
      showToast(`Plotting tanggal ${selectedDate} tersimpan.`, "success");
      muatBulan(viewMonth);
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan plotting hari ini.", "error");
    } finally {
      setIsSavingHari(false);
    }
  };

  const handleUbahArea = (area: string, nama: string) => {
    setPlotHariIni((prev) => ({ ...prev, [area]: nama }));
  };

  // ==========================================
  // 6. Hitung Ulang Hari Ini Berdasarkan yang Izin
  // ==========================================
  const toggleIzin = (nama: string) => {
    setStaffIzin((prev) => (prev.includes(nama) ? prev.filter((n) => n !== nama) : [...prev, nama]));
  };

  const hitungUlangDenganIzin = () => {
    const semuaNama = staffList.map((s) => s.nama);
    const yangMasuk = semuaNama.filter((n) => !staffIzin.includes(n));

    if (yangMasuk.length === 0) {
      showToast("Semua OB izin — tidak ada yang bisa diplot hari ini.", "error");
      return;
    }

    let pelayananHariIni = pelayananTetap;
    let cleaningPool = yangMasuk.filter((n) => n !== pelayananTetap);

    // Kalau OB pelayanan tetap izin, salah satu cleaning yang masuk menggantikan
    if (staffIzin.includes(pelayananTetap) || !pelayananTetap) {
      if (cleaningPool.length === 0) {
        showToast("Tidak ada pengganti untuk tugas pelayanan hari ini.", "error");
        return;
      }
      pelayananHariIni = cleaningPool[0];
      cleaningPool = cleaningPool.slice(1);
    }

    const rotasi = buatRotasiCleaning(cleaningPool);
    const plotBaru: PlotHarian = { ...rotasi, [AREA_PELAYANAN]: pelayananHariIni };
    // Area yang tidak tercover (kalau cleaning pool kosong) dikosongkan, bukan dihapus
    DAFTAR_LANTAI.forEach((lantai) => {
      if (!plotBaru[lantai]) plotBaru[lantai] = "";
    });

    setPlotHariIni(plotBaru);
    showToast("Plotting hari ini dihitung ulang. Jangan lupa klik Simpan.", "success");
  };

  // ==========================================
  // 7. Generate Otomatis 1 Bulan
  // ==========================================
  const generateSebulan = async () => {
    if (!pelayananTetap) {
      showToast("Pilih dulu OB yang dedicated Pelayanan sebelum generate.", "warning");
      return;
    }
    const cleaningStaff = staffList.map((s) => s.nama).filter((n) => n !== pelayananTetap);
    if (cleaningStaff.length === 0) {
      showToast("Data staff cleaning tidak cukup untuk digenerate.", "warning");
      return;
    }

    const yakin = await confirm({
      title: "Generate Jadwal Otomatis",
      message: `Ini akan menimpa plotting mulai ${selectedDate} untuk 30 hari ke depan, acak ulang tiap ${blockSize} hari. Lanjutkan?`,
      confirmText: "Ya, Generate",
      variant: "danger",
    });
    if (!yakin) return;

    setIsGenerating(true);
    try {
      const ukuranBlok = parseInt(blockSize, 10);
      const tglMulai = new Date(selectedDate + "T00:00:00");
      const batch = writeBatch(db);
      let rotasiAktif: Record<string, string> = {};

      for (let i = 0; i < 30; i++) {
        if (i % ukuranBlok === 0) {
          rotasiAktif = buatRotasiCleaning(cleaningStaff);
        }
        const tgl = new Date(tglMulai);
        tgl.setDate(tglMulai.getDate() + i);
        const tglISO = toISO(tgl);

        const plotHari: PlotHarian = { ...rotasiAktif, [AREA_PELAYANAN]: pelayananTetap };
        const ref = doc(db, "daily_plots", tglISO);
        batch.set(ref, { plot_lantai: plotHari, waktu_update: serverTimestamp(), dibuat_otomatis: true }, { merge: true });
      }

      await batch.commit();
      showToast("Jadwal 1 bulan berhasil digenerate!", "success");

      const ref = doc(db, "daily_plots", selectedDate);
      const snap = await getDoc(ref);
      if (snap.exists()) setPlotHariIni((snap.data().plot_lantai || {}) as PlotHarian);
      muatBulan(viewMonth);
    } catch (error) {
      console.error(error);
      showToast("Gagal generate jadwal otomatis.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // ==========================================
  // Helper Kalender
  // ==========================================
  const daftarTanggalBulan = useMemo(() => {
    const [y, m] = viewMonth.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return Array.from({ length: lastDay }, (_, i) => `${viewMonth}-${String(i + 1).padStart(2, "0")}`);
  }, [viewMonth]);

  const gantiBulan = (delta: number) => {
    const [y, m] = viewMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  if (isPageLoading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#718096" }}>Memuat halaman...</div>;
  }

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        * { box-sizing: border-box; }
        .plot-wrapper { display: flex; gap: 25px; flex-wrap: wrap; align-items: flex-start; width: 100%; }
        .plot-col { flex: 1 1 400px; width: 100%; }
        .cal-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .cal-table th, .cal-table td { padding: 8px 10px; border-bottom: 1px solid #edf2f7; text-align: left; white-space: nowrap; }
        .cal-table th { background: #f1f5f9; color: #4a5568; position: sticky; top: 0; }
        @media (max-width: 768px) {
          .plot-wrapper { flex-direction: column; }
        }
      `,
        }}
      />

      {/* NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/dashboard/ob")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px" }}>Kembali ke Dashboard OB</span>
        </div>
        <div style={{ background: "#e6fffa", color: "#2c7a7b", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #b2f5ea" }}>
          👑 Koordinator: {adminName}
        </div>
      </div>

      {/* HERO */}
      <div style={{ background: "linear-gradient(135deg, #234e52 0%, #2c7a7b 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(22px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>PLOTTING HARIAN OB & CS</h1>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>Atur penugasan area kebersihan & pelayanan per hari, atau generate otomatis 1 bulan</p>
      </div>

      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 15px", position: "relative", zIndex: 10 }}>
        <div className="plot-wrapper">

          {/* KOLOM KIRI: SETTING + FORM HARIAN + GENERATE */}
          <div className="plot-col" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Setting Pelayanan Tetap */}
            <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#1a202c" }}>🍽️ OB Pelayanan Tetap</h3>
              <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#718096" }}>OB ini selalu ditugaskan ke &quot;{AREA_PELAYANAN}&quot; setiap hari, tidak ikut rotasi cleaning kecuali sedang izin.</p>
              <select
                value={pelayananTetap}
                onChange={(e) => simpanPelayananTetap(e.target.value)}
                style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px" }}
              >
                <option value="">-- Pilih OB --</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.nama}>{s.nama}</option>
                ))}
              </select>
            </div>

            {/* Form Plotting Harian */}
            <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#1a202c" }}>📅 Set Plotting per Tanggal</h3>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", marginBottom: "15px" }}
              />

              {isLoadingHari ? (
                <div style={{ textAlign: "center", color: "#a0aec0", padding: "20px 0" }}>Memuat plotting...</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {SEMUA_AREA.map((area) => (
                    <div key={area}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px" }}>{area}</label>
                      <select
                        value={plotHariIni[area] || ""}
                        onChange={(e) => handleUbahArea(area, e.target.value)}
                        style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "13px" }}
                      >
                        <option value="">-- Kosong --</option>
                        <option value="Semua / All">Semua / All</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.nama}>{s.nama}</option>
                        ))}
                      </select>
                    </div>
                  ))}

                  <button
                    onClick={simpanSatuHari}
                    disabled={isSavingHari}
                    style={{ marginTop: "10px", padding: "14px", background: isSavingHari ? "#a0aec0" : "#3182ce", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: isSavingHari ? "not-allowed" : "pointer" }}
                  >
                    {isSavingHari ? "Menyimpan..." : "💾 Simpan Tanggal Ini"}
                  </button>
                </div>
              )}
            </div>

            {/* Tandai Izin */}
            <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#1a202c" }}>🙋 Tandai Izin (Tanggal Terpilih)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                {staffList.map((s) => (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#2d3748" }}>
                    <input type="checkbox" checked={staffIzin.includes(s.nama)} onChange={() => toggleIzin(s.nama)} />
                    {s.nama} {s.nama === pelayananTetap ? "(Pelayanan Tetap)" : ""}
                  </label>
                ))}
              </div>
              <button
                onClick={hitungUlangDenganIzin}
                style={{ width: "100%", padding: "12px", background: "white", color: "#d69e2e", border: "1px solid #fbd38d", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" }}
              >
                🔄 Hitung Ulang Berdasarkan Izin
              </button>
              <p style={{ margin: "10px 0 0 0", fontSize: "11px", color: "#a0aec0" }}>Setelah dihitung ulang, cek hasilnya di form di atas lalu klik &quot;Simpan Tanggal Ini&quot;.</p>
            </div>

            {/* Generate Otomatis */}
            <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#1a202c" }}>⚡ Generate Otomatis 1 Bulan</h3>
              <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "#718096" }}>Mulai dari tanggal yang dipilih di atas, rotasi cleaning diacak ulang tiap blok waktu berikut untuk 30 hari ke depan.</p>
              <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
                <button
                  onClick={() => setBlockSize("2")}
                  style={{ flex: 1, padding: "10px", borderRadius: "10px", border: blockSize === "2" ? "2px solid #2c7a7b" : "1px solid #cbd5e0", background: blockSize === "2" ? "#e6fffa" : "white", color: "#2d3748", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}
                >
                  Tiap 2 Hari
                </button>
                <button
                  onClick={() => setBlockSize("7")}
                  style={{ flex: 1, padding: "10px", borderRadius: "10px", border: blockSize === "7" ? "2px solid #2c7a7b" : "1px solid #cbd5e0", background: blockSize === "7" ? "#e6fffa" : "white", color: "#2d3748", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}
                >
                  Tiap 1 Minggu
                </button>
              </div>
              <button
                onClick={generateSebulan}
                disabled={isGenerating}
                style={{ width: "100%", padding: "14px", background: isGenerating ? "#a0aec0" : "#234e52", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: isGenerating ? "not-allowed" : "pointer" }}
              >
                {isGenerating ? "🔄 Generating..." : "🚀 Generate 30 Hari ke Depan"}
              </button>
            </div>
          </div>

          {/* KOLOM KANAN: KALENDER BULAN */}
          <div className="plot-col" style={{ flex: "2 1 600px", background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <button onClick={() => gantiBulan(-1)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: "pointer" }}>◀</button>
              <h3 style={{ margin: 0, fontSize: "15px", color: "#1a202c" }}>📆 {viewMonth}</h3>
              <button onClick={() => gantiBulan(1)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: "pointer" }}>▶</button>
            </div>

            {isLoadingMonth ? (
              <div style={{ textAlign: "center", color: "#a0aec0", padding: "30px 0" }}>Memuat kalender...</div>
            ) : (
              <div style={{ overflowX: "auto", maxHeight: "600px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                <table className="cal-table">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      {SEMUA_AREA.map((a) => (
                        <th key={a}>{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {daftarTanggalBulan.map((tgl) => {
                      const plot = monthPreview[tgl];
                      return (
                        <tr key={tgl} style={{ background: tgl === selectedDate ? "#e6fffa" : "white", cursor: "pointer" }} onClick={() => setSelectedDate(tgl)}>
                          <td style={{ fontWeight: "bold" }}>{tgl}</td>
                          {SEMUA_AREA.map((a) => (
                            <td key={a} style={{ color: plot?.[a] ? "#2d3748" : "#cbd5e0" }}>{plot?.[a] || "-"}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}