"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ==========================================
// KONFIGURASI CHECKLIST PER SEGMENT
// Edit di sini kalau mau ubah/tambah pertanyaan per lantai.
// ==========================================
interface PertanyaanItem {
  id: string;
  teks: string;
}

interface SegmentConfig {
  id: string;
  nama: string;
  pertanyaan: PertanyaanItem[];
}

const SEGMENTS_BASEMENT: SegmentConfig[] = [
  {
    id: "basement",
    nama: "Basement",
    pertanyaan: [
      { id: "bsm-1", teks: "Toilet: apakah lantai sudah di pel bersih menggunakan sabun?" },
      { id: "bsm-2", teks: "Area parkiran basement: apakah sudah disapu dengan bersih?" },
      { id: "bsm-3", teks: "Apakah area parkiran sudah tidak ada sampah berserakan?" },
      { id: "bsm-4", teks: "Area parkiran luar: apakah sudah disapu bersih?" },
      { id: "bsm-5", teks: "Area tangga basement ke lobby: apakah sudah disapu dan dipel?" },
      { id: "bsm-6", teks: "Area tangga utama ke lobby: apakah sudah disapu dan dipel?" },
    ],
  },
];

// Template segment untuk lantai 1-5 (Toilet + Area Ruang Kerja).
// Kalau ada lantai yang pertanyaannya beda, tinggal bikin array manual seperti SEGMENTS_BASEMENT di atas,
// lalu ganti isi SEGMENTS_CONFIG["Lantai X"] dengan array itu.
function buatSegmenLantai(nomorLantai: number): SegmentConfig[] {
  return [
    {
      id: `lt${nomorLantai}-toilet`,
      nama: "Toilet",
      pertanyaan: [
        { id: `lt${nomorLantai}-t1`, teks: "Apakah wastafel bagian wanita sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t2`, teks: "Apakah wastafel bagian pria sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t3`, teks: "Apakah kloset pria sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t4`, teks: "Apakah kloset wanita sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t5`, teks: "Apakah urinoir sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t6`, teks: "Apakah keseluruhan lantai toilet wanita dan pria sudah di pel?" },
      ],
    },
    {
      id: `lt${nomorLantai}-kerja`,
      nama: "Area Ruang Kerja",
      pertanyaan: [
        { id: `lt${nomorLantai}-k1`, teks: "Apakah lantai sudah disapu?" },
        { id: `lt${nomorLantai}-k2`, teks: "Apakah lantai sudah dipel?" },
        { id: `lt${nomorLantai}-k3`, teks: "Apakah area kolong meja sudah dibersihkan?" },
      ],
    },
  ];
}

const SEGMENTS_PELAYANAN: SegmentConfig[] = [
  {
    id: "pelayanan",
    nama: "Pelayanan",
    pertanyaan: [
      { id: "plyn-1", teks: "Apakah belanja / beli makan sudah dilakukan?" },
      { id: "plyn-2", teks: "Apakah meja sudah dibersihkan?" },
      { id: "plyn-3", teks: "Apakah piring sudah dicuci?" },
      { id: "plyn-4", teks: "Apakah minum sudah disajikan?" },
    ],
  },
];

const SEGMENTS_CONFIG: Record<string, SegmentConfig[]> = {
  "Basement": SEGMENTS_BASEMENT,
  "Lantai 1": buatSegmenLantai(1),
  "Lantai 2": buatSegmenLantai(2),
  "Lantai 3": buatSegmenLantai(3),
  "Lantai 4": buatSegmenLantai(4),
  "Lantai 5": buatSegmenLantai(5),
};

function getSegmenUntukArea(area: string): SegmentConfig[] {
  if (SEGMENTS_CONFIG[area]) return SEGMENTS_CONFIG[area];
  if (area.toLowerCase().includes("pelayanan")) return SEGMENTS_PELAYANAN;

  const cocok = Object.keys(SEGMENTS_CONFIG).find(
    (k) => area.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(area.toLowerCase())
  );
  return cocok ? SEGMENTS_CONFIG[cocok] : SEGMENTS_CONFIG["Lantai 1"];
}

// ==========================================
// FIX TIMEZONE: "hari ini" harus dihitung berdasarkan WITA (Asia/Makassar, UTC+8),
// bukan new Date().toISOString() yang formatnya UTC — sama seperti fix di halaman lain
// (dashboard/ob, portal, driver).
// ==========================================
function getTodayISOLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ==========================================
// INTERFACES DATA
// ==========================================
interface JawabanPertanyaan {
  pertanyaan_id: string;
  teks: string;
  jawaban: "Ya" | "Tidak";
}

interface SegmentLog {
  segment_id: string;
  nama_segment: string;
  jawaban: JawabanPertanyaan[];
}

interface FotoPasangan {
  before: string;
  after: string;
}

interface ChecklistLog {
  id: string;
  area: string;
  pic_bertugas: string;
  waktu_selesai: Timestamp | null;
  detail_segmen: SegmentLog[];
  foto_bukti: FotoPasangan[];
}

export default function ChecklistOBPage() {
  const router = useRouter();

  // Identitas & Navigasi Utama
  const [picName, setPicName] = useState("");
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [assignedAreas, setAssignedAreas] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedArea, setSelectedArea] = useState("");

  // State Data Riwayat
  const [riwayatKerja, setRiwayatKerja] = useState<ChecklistLog[]>([]);

  // Loading States
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [uploadingTask, setUploadingTask] = useState<string | null>(null);

  // State Jawaban Checklist Ya/Tidak, key = pertanyaan_id
  const [jawabanTugas, setJawabanTugas] = useState<Record<string, "Ya" | "Tidak">>({});

  // State Foto Bukti: bisa lebih dari 1 pasang before/after
  const [fotoList, setFotoList] = useState<{ before?: string; after?: string }[]>([{}]);

  // ==========================================
  // EFEK 1: Ambil Identitas & Data Ploting
  // ==========================================
  useEffect(() => {
    const muatDataAwal = async () => {
      const nama = localStorage.getItem("pic_nama") || "";
      const dept = (localStorage.getItem("pic_dept") || "").toLowerCase();

      if (!nama || !dept.includes("ob & cs")) {
        alert("Akses Ditolak! Halaman ini khusus staf OB & CS.");
        router.push("/dashboard/ob");
        return;
      }
      setPicName(nama);

      try {
        const todayISO = getTodayISOLocal();
        const plotRef = doc(db, "daily_plots", todayISO);
        const plotSnap = await getDoc(plotRef);

        if (plotSnap.exists()) {
          const plots = (plotSnap.data().plot_lantai || {}) as Record<string, string>;
          const lantaiKu = Object.keys(plots).filter(
            (lantai) => plots[lantai] === nama || plots[lantai] === "Semua / All"
          );

          setAssignedAreas(lantaiKu);
          if (lantaiKu.length > 0) setSelectedArea(lantaiKu[0]);
        }
      } catch (error) {
        console.error("Gagal memuat data plotting:", error);
      } finally {
        setIsPageLoading(false);
      }
    };

    muatDataAwal();
  }, [router]);

  // ==========================================
  // EFEK 2: Listener Riwayat Checklist Real-time
  // ==========================================
  useEffect(() => {
    if (!picName) return;

    const checklistRef = collection(db, "ob_checklists");
    const q = query(checklistRef, where("pic_bertugas", "==", picName), orderBy("waktu_selesai", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: ChecklistLog[] = [];
      snapshot.forEach(docSnap => {
        logs.push({ ...docSnap.data(), id: docSnap.id } as ChecklistLog);
      });
      setRiwayatKerja(logs);
    });

    return () => unsubscribe();
  }, [picName]);

  // ==========================================
  // UPLOAD FOTO (menggantikan live-camera)
  // ==========================================
  async function uploadToCloudinary(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
    formData.append("folder", "sibm/checklist-ob");

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
    const data = await res.json();
    return data.secure_url as string;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, index: number, type: "before" | "after") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 720;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setUploadingTask(`${index}-${type}`);
          try {
            const url = await uploadToCloudinary(blob);
            setFotoList(prev => {
              const next = [...prev];
              next[index] = { ...next[index], [type]: url };
              return next;
            });
          } catch (err) {
            console.error(err);
            alert("Gagal upload foto, coba lagi.");
          } finally {
            setUploadingTask(null);
          }
        }, "image/jpeg", 0.7);
      };
      if (typeof ev.target?.result === "string") img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const hapusFotoSatuan = (index: number, type: "before" | "after") => {
    setFotoList(prev => {
      const next = [...prev];
      const salinan = { ...next[index] };
      delete salinan[type];
      next[index] = salinan;
      return next;
    });
  };

  const tambahPasanganFoto = () => {
    setFotoList(prev => [...prev, {}]);
  };

  const hapusPasanganFoto = (index: number) => {
    setFotoList(prev => {
      if (prev.length <= 1) return [{}]; // minimal selalu ada 1 slot kosong
      return prev.filter((_, i) => i !== index);
    });
  };

  const pilihJawaban = (pertanyaanId: string, jawaban: "Ya" | "Tidak") => {
    setJawabanTugas(prev => ({ ...prev, [pertanyaanId]: jawaban }));
  };

  // ==========================================
  // SUBMIT LAPORAN
  // ==========================================
  const handleKirimLaporan = async () => {
    const daftarSegmen = getSegmenUntukArea(selectedArea);
    const semuaPertanyaan = daftarSegmen.flatMap(s => s.pertanyaan);

    const belumDijawab = semuaPertanyaan.some(p => !jawabanTugas[p.id]);
    if (belumDijawab) {
      return alert("✅ Mohon isi checklist Ya/Tidak untuk semua item di setiap segment sebelum mengirim laporan!");
    }

    const fotoValid = fotoList.filter(f => f.before && f.after) as FotoPasangan[];
    if (fotoValid.length === 0) {
      return alert("📸 Mohon lampirkan minimal 1 pasang foto BEFORE & AFTER sebelum mengirim laporan!");
    }

    setIsLoading(true);
    try {
      const detailSegmen: SegmentLog[] = daftarSegmen.map(segment => ({
        segment_id: segment.id,
        nama_segment: segment.nama,
        jawaban: segment.pertanyaan.map(p => ({
          pertanyaan_id: p.id,
          teks: p.teks,
          jawaban: jawabanTugas[p.id],
        })),
      }));

      await addDoc(collection(db, "ob_checklists"), {
        pic_bertugas: picName,
        area: selectedArea,
        waktu_selesai: serverTimestamp(),
        detail_segmen: detailSegmen,
        foto_bukti: fotoValid,
      });

      alert("Laporan Kebersihan berhasil dikirim! Riwayat visual Anda telah terekam di sistem.");
      setJawabanTugas({});
      setFotoList([{}]);
      setStep(1);
      setActiveTab("history");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan sistem saat mengirim laporan.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatJam = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  if (isPageLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#f8fafc", color: "#319795" }}>
        <div style={{ fontSize: "50px", marginBottom: "15px", animation: "spin 2s linear infinite" }}>⏳</div>
        <div style={{ fontWeight: "bold", fontSize: "16px" }}>Menyelaraskan Tugas Ploting Anda...</div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>

      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={() => router.push("/dashboard/ob")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>

        {/* TAB SWITCHER */}
        <div style={{ background: "#edf2f7", padding: "4px", borderRadius: "10px", display: "flex", gap: "5px" }}>
          <button onClick={() => setActiveTab("form")} style={{ border: "none", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", background: activeTab === "form" ? "white" : "transparent", color: activeTab === "form" ? "#319795" : "#718096", transition: "all 0.2s", boxShadow: activeTab === "form" ? "0 2px 4px rgba(0,0,0,0.05)" : "none" }}>
            ✏️ Lapor Kerja
          </button>
          <button onClick={() => setActiveTab("history")} style={{ border: "none", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer", background: activeTab === "history" ? "white" : "transparent", color: activeTab === "history" ? "#319795" : "#718096", transition: "all 0.2s", boxShadow: activeTab === "history" ? "0 2px 4px rgba(0,0,0,0.05)" : "none" }}>
            📜 Riwayat ({riwayatKerja.length})
          </button>
        </div>
      </div>

      <div style={{ maxWidth: "600px", margin: "30px auto 0", padding: "0 20px" }}>

        {/* ========================================================================================= */}
        {/* TAB 1: FORMULIR CHECKLIST PER SEGMENT & FOTO BUKTI */}
        {/* ========================================================================================= */}
        {activeTab === "form" && (
          <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
            {step === 1 && (
              <div style={{ background: "white", padding: "40px 25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", textAlign: "center", borderTop: "6px solid #319795" }}>
                {assignedAreas.length > 0 ? (
                  <>
                    <div style={{ fontSize: "60px", marginBottom: "15px" }}>📍</div>
                    <h2 style={{ margin: "0 0 10px 0", color: "#2d3748", fontSize: "22px" }}>Mulai Shift Kebersihan</h2>
                    <p style={{ color: "#718096", marginBottom: "30px", fontSize: "14px", lineHeight: "1.5" }}>Pilih salah satu lokasi penugasan Anda hari ini untuk mulai merekam progres pekerjaan.</p>

                    <select
                      value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}
                      style={{ width: "100%", padding: "18px", borderRadius: "12px", border: "2px solid #319795", fontSize: "16px", fontWeight: "bold", color: "#234e52", marginBottom: "30px", cursor: "pointer", background: "#e6fffa", outline: "none", appearance: "none", textAlign: "center" }}
                    >
                      {assignedAreas.map(area => <option key={area} value={area}>{area}</option>)}
                    </select>

                    <button
                      onClick={() => setStep(2)}
                      style={{ width: "100%", padding: "18px", background: "#319795", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: "pointer", boxShadow: "0 10px 15px -3px rgba(49, 151, 149, 0.3)", transition: "transform 0.2s" }}
                      onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"}
                      onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
                    >
                      📋 Lanjut Isi Checklist ➔
                    </button>
                  </>
                ) : (
                  <div style={{ padding: "20px" }}>
                    <div style={{ fontSize: "60px", marginBottom: "15px" }}>☕</div>
                    <h3 style={{ color: "#e53e3e", margin: "0 0 10px 0", fontSize: "20px" }}>Anda Tidak Memiliki Jadwal</h3>
                    <p style={{ color: "#718096", fontSize: "14px", margin: 0, lineHeight: "1.6" }}>
                      Koordinator belum memetakan lokasi kerja Anda untuk hari ini. Silakan hubungi koordinator Anda untuk mendapatkan plot area.
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>

                {/* HEAD CARD AREA */}
                <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", marginBottom: "25px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e2e8f0", borderLeft: "6px solid #319795" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "#718096", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Lokasi Pelaporan:</span>
                    <h2 style={{ margin: "5px 0 0 0", color: "#234e52", fontSize: "18px" }}>{selectedArea}</h2>
                  </div>
                  <button onClick={() => setStep(1)} style={{ background: "#edf2f7", border: "none", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold", color: "#4a5568" }}>Ganti Area</button>
                </div>

                {/* CHECKLIST PER SEGMENT */}
                {getSegmenUntukArea(selectedArea).map((segment) => (
                  <div key={segment.id} style={{ marginBottom: "20px" }}>
                    <h3 style={{ margin: "0 0 12px 4px", color: "#234e52", fontSize: "15px", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ background: "#319795", color: "white", width: "22px", height: "22px", borderRadius: "6px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>📋</span>
                      {segment.nama}
                    </h3>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {segment.pertanyaan.map((p) => {
                        const jawaban = jawabanTugas[p.id];
                        return (
                          <div key={p.id} style={{ background: "white", padding: "16px", borderRadius: "16px", boxShadow: "0 6px 12px -4px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <span style={{ color: "#2d3748", fontSize: "14px", flex: "1 1 200px", lineHeight: "1.4" }}>{p.teks}</span>

                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                type="button"
                                onClick={() => pilihJawaban(p.id, "Ya")}
                                style={{ padding: "9px 16px", borderRadius: "10px", border: jawaban === "Ya" ? "2px solid #38a169" : "1px solid #e2e8f0", background: jawaban === "Ya" ? "#38a169" : "white", color: jawaban === "Ya" ? "white" : "#4a5568", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}
                              >
                                ✅ Ya
                              </button>
                              <button
                                type="button"
                                onClick={() => pilihJawaban(p.id, "Tidak")}
                                style={{ padding: "9px 16px", borderRadius: "10px", border: jawaban === "Tidak" ? "2px solid #e53e3e" : "1px solid #e2e8f0", background: jawaban === "Tidak" ? "#e53e3e" : "white", color: jawaban === "Tidak" ? "white" : "#4a5568", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}
                              >
                                ❌ Tidak
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* FOTO BUKTI (BEFORE/AFTER) - BISA LEBIH DARI 1 PASANG */}
                <div style={{ marginTop: "30px" }}>
                  <h3 style={{ margin: "0 0 4px 4px", color: "#234e52", fontSize: "15px", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.5px" }}>📸 Foto Bukti</h3>
                  <p style={{ margin: "0 0 15px 4px", color: "#a0aec0", fontSize: "12px" }}>Minimal 1 pasang before/after. Bisa tambah lebih banyak sesuai kebutuhan.</p>

                  {fotoList.map((foto, index) => (
                    <div key={index} style={{ background: "white", padding: "18px", borderRadius: "18px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", marginBottom: "15px", position: "relative" }}>
                      {fotoList.length > 1 && (
                        <button
                          onClick={() => hapusPasanganFoto(index)}
                          style={{ position: "absolute", top: "10px", right: "10px", background: "#fff5f5", color: "#e53e3e", border: "1px solid #fed7d7", borderRadius: "8px", padding: "4px 10px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}
                        >
                          🗑️ Hapus
                        </button>
                      )}
                      <div style={{ fontSize: "11px", fontWeight: "900", color: "#718096", marginBottom: "12px" }}>PASANGAN FOTO #{index + 1}</div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                        {/* KOTAK BEFORE */}
                        <div style={{ background: "#fff5f5", padding: "10px", borderRadius: "16px", border: "1px dashed #feb2b2" }}>
                          <div style={{ fontSize: "11px", fontWeight: "900", color: "#c53030", marginBottom: "10px", textAlign: "center", letterSpacing: "1px" }}>SEBELUM</div>
                          {foto.before ? (
                            <div style={{ position: "relative" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={foto.before} alt="Before" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "12px", border: "2px solid #fed7d7" }} />
                              <button onClick={() => hapusFotoSatuan(index, "before")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "white", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>✖</button>
                            </div>
                          ) : (
                            <label style={{ width: "100%", aspectRatio: "3/4", background: "white", border: "none", borderRadius: "12px", color: "#e53e3e", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", transition: "0.2s" }}>
                              <span style={{ fontSize: "28px" }}>{uploadingTask === `${index}-before` ? "⏳" : "📁"}</span>
                              <span style={{ fontSize: "12px", fontWeight: "bold" }}>{uploadingTask === `${index}-before` ? "Mengunggah..." : "Upload Foto"}</span>
                              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, index, "before")} style={{ display: "none" }} disabled={uploadingTask === `${index}-before`} />
                            </label>
                          )}
                        </div>

                        {/* KOTAK AFTER */}
                        <div style={{ background: "#f0fff4", padding: "10px", borderRadius: "16px", border: "1px dashed #9ae6b4" }}>
                          <div style={{ fontSize: "11px", fontWeight: "900", color: "#276749", marginBottom: "10px", textAlign: "center", letterSpacing: "1px" }}>SESUDAH</div>
                          {foto.after ? (
                            <div style={{ position: "relative" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={foto.after} alt="After" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "12px", border: "2px solid #c6f6d5" }} />
                              <button onClick={() => hapusFotoSatuan(index, "after")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "#38a169", color: "white", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>✖</button>
                            </div>
                          ) : (
                            <label style={{ width: "100%", aspectRatio: "3/4", background: "white", border: "none", borderRadius: "12px", color: "#38a169", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", transition: "0.2s" }}>
                              <span style={{ fontSize: "28px" }}>{uploadingTask === `${index}-after` ? "⏳" : "📁"}</span>
                              <span style={{ fontSize: "12px", fontWeight: "bold" }}>{uploadingTask === `${index}-after` ? "Mengunggah..." : "Upload Foto"}</span>
                              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, index, "after")} style={{ display: "none" }} disabled={uploadingTask === `${index}-after`} />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={tambahPasanganFoto}
                    style={{ width: "100%", padding: "14px", background: "white", color: "#319795", border: "2px dashed #319795", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}
                  >
                    ➕ Tambah Pasangan Foto
                  </button>
                </div>

                <button
                  onClick={handleKirimLaporan} disabled={isLoading}
                  style={{ width: "100%", padding: "20px", background: isLoading ? "#a0aec0" : "#234e52", color: "white", border: "none", borderRadius: "16px", fontWeight: "bold", fontSize: "16px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "30px", boxShadow: isLoading ? "none" : "0 10px 20px -5px rgba(35, 78, 82, 0.4)", transition: "all 0.3s" }}
                >
                  {isLoading ? "🔄 MENGUNGGAH LAPORAN..." : "🚀 KUKUHKAN & KIRIM LAPORAN"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================================= */}
        {/* TAB 2: GALERI & RIWAYAT VISUAL */}
        {/* ========================================================================================= */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "25px", animation: "fadeIn 0.3s ease-in-out" }}>
            {riwayatKerja.length > 0 ? riwayatKerja.map((log) => (
              <div key={log.id} style={{ background: "white", borderRadius: "20px", padding: "25px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>

                {/* Header Riwayat */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#a0aec0", fontWeight: "bold" }}>Selesai Dibersihkan:</span>
                    <h3 style={{ margin: "5px 0 0 0", color: "#2d3748", fontSize: "18px", display: "flex", alignItems: "center", gap: "5px" }}><span>📍</span> {log.area}</h3>
                  </div>
                  <span style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#4a5568", padding: "8px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold" }}>
                    ⏱️ {formatJam(log.waktu_selesai)}
                  </span>
                </div>

                {/* Checklist per Segment */}
                {(log.detail_segmen || []).map((segment, segIdx) => (
                  <div key={segIdx} style={{ marginBottom: "18px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "900", color: "#319795", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{segment.nama_segment}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {segment.jawaban.map((item, itemIdx) => {
                        const isYa = item.jawaban === "Ya";
                        return (
                          <div key={itemIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: "10px", background: isYa ? "#f0fff4" : "#fff5f5", border: "1px solid #e2e8f0" }}>
                            <span style={{ fontSize: "12px", color: "#2d3748" }}>{item.teks}</span>
                            <span style={{ fontSize: "10px", fontWeight: "900", padding: "3px 8px", borderRadius: "6px", background: isYa ? "#38a169" : "#e53e3e", color: "white", whiteSpace: "nowrap", marginLeft: "8px" }}>
                              {isYa ? "✅ YA" : "❌ TIDAK"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Foto Bukti - Bisa Lebih Dari 1 Pasang */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "10px" }}>
                  {(log.foto_bukti || []).map((foto, fotoIdx) => (
                    <div key={fotoIdx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div style={{ background: "#fff5f5", padding: "8px", borderRadius: "12px", border: "1px solid #fed7d7" }}>
                        <div style={{ fontSize: "10px", color: "#e53e3e", fontWeight: "900", marginBottom: "8px", textAlign: "center" }}>BEFORE #{fotoIdx + 1}</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={foto.before} alt="Sebelum" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px" }} />
                      </div>
                      <div style={{ background: "#f0fff4", padding: "8px", borderRadius: "12px", border: "1px solid #c6f6d5" }}>
                        <div style={{ fontSize: "10px", color: "#38a169", fontWeight: "900", marginBottom: "8px", textAlign: "center" }}>AFTER #{fotoIdx + 1}</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={foto.after} alt="Sesudah" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px" }} />
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            )) : (
              <div style={{ padding: "60px 20px", textAlign: "center", background: "white", borderRadius: "20px", border: "2px dashed #cbd5e0", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: "50px", marginBottom: "15px" }}>📭</div>
                <h3 style={{ color: "#4a5568", margin: "0 0 10px 0" }}>Belum Ada Riwayat</h3>
                <p style={{ color: "#a0aec0", fontSize: "14px", margin: 0 }}>Log pekerjaan Anda akan terekam dan ditampilkan dengan apik di sini setelah Anda mengirimkan laporan pertama.</p>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}