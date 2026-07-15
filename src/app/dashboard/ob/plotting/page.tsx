"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

// ==========================================
// INTERFACES
// ==========================================
interface TugasDetail {
  nama_tugas: string;
  foto_before: string | null;
  foto_after: string | null;
  status: string;
}

interface ChecklistLog {
  id: string;
  area: string;
  pic_bertugas: string;
  waktu_selesai: Timestamp | null;
  detail_tugas: TugasDetail[];
}

const TUGAS_KEBERSIHAN = [
  { id: "t1", nama: "Wastafel / Kaca / Meja", icon: "🚰" },
  { id: "t2", nama: "Tempat Sampah", icon: "🗑️" },
  { id: "t3", nama: "Lantai (Sapu & Pel)", icon: "🧹" }
];

// Dipakai khusus untuk area "Pelayanan Khusus OB" (lihat DAFTAR_LANTAI di halaman Plotting Koordinator)
const TUGAS_PELAYANAN = [
  { id: "p1", nama: "Rapikan Meja & Kursi", icon: "🪑" },
  { id: "p2", nama: "Cuci Gelas / Piring", icon: "🍽️" },
  { id: "p3", nama: "Belanja / Beli Makan-Minum", icon: "🛒" }
];

export default function ChecklistKameraPage() {
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

  // State Foto (upload, bukan live-camera)
  const [photos, setPhotos] = useState<Record<string, { before?: string, after?: string }>>({});

  // Area "Pelayanan Khusus OB" pakai daftar tugas yang berbeda dari area kebersihan lantai biasa
  const isPelayanan = selectedArea.toLowerCase().includes("pelayanan");
  const TUGAS_AKTIF = isPelayanan ? TUGAS_PELAYANAN : TUGAS_KEBERSIHAN;

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
        const todayISO = new Date().toISOString().split("T")[0];
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
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, taskId: string, type: "before" | "after") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // Menggunakan resolusi HD (kompromi ukuran file & ketajaman) — sama seperti sebelumnya
        const MAX_WIDTH = 720;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const photoBase64 = canvas.toDataURL("image/jpeg", 0.7); // 70% Quality

          setPhotos(prev => ({
            ...prev,
            [taskId]: {
              ...prev[taskId],
              [type]: photoBase64
            }
          }));
        }
      };
      if (typeof ev.target?.result === "string") img.src = ev.target.result;
    };
    reader.readAsDataURL(file);

    // Reset value supaya user bisa pilih file yang sama lagi kalau mau ganti foto
    e.target.value = "";
  };

  const hapusFoto = (taskId: string, type: "before" | "after") => {
    setPhotos(prev => {
      const newPhotos = { ...prev };
      if (newPhotos[taskId]) delete newPhotos[taskId][type];
      return newPhotos;
    });
  };

  const handleKirimLaporan = async () => {
    const hasPhotos = Object.keys(photos).some(taskId => photos[taskId].before || photos[taskId].after);
    if (!hasPhotos) {
      return alert("📸 Mohon lampirkan minimal satu foto bukti (Before/After) sebelum mengirim laporan!");
    }

    setIsLoading(true);
    try {
      const detailTugas = TUGAS_AKTIF.map(tugas => ({
        nama_tugas: tugas.nama,
        foto_before: photos[tugas.id]?.before || null,
        foto_after: photos[tugas.id]?.after || null,
        status: (photos[tugas.id]?.before && photos[tugas.id]?.after) ? "Selesai Sempurna" : (photos[tugas.id]?.after ? "Selesai Sebagian" : "Dilewati")
      }));

      await addDoc(collection(db, "ob_checklists"), {
        pic_bertugas: picName,
        area: selectedArea,
        waktu_selesai: serverTimestamp(),
        detail_tugas: detailTugas
      });

      alert("Laporan Kebersihan berhasil dikirim! Riwayat visual Anda telah terekam di sistem.");
      setPhotos({});
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
        {/* TAB 1: FORMULIR INPUT CHEKLIST & UPLOAD FOTO */}
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
                      📸 Lanjut Upload Bukti Foto ➔
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
                    <span style={{ display: "inline-block", marginTop: "6px", fontSize: "10px", fontWeight: "900", padding: "3px 8px", borderRadius: "6px", background: isPelayanan ? "#fdf4ff" : "#e6fffa", color: isPelayanan ? "#97266d" : "#234e52" }}>
                      {isPelayanan ? "🍽️ CHECKLIST PELAYANAN" : "🧹 CHECKLIST KEBERSIHAN"}
                    </span>
                  </div>
                  <button onClick={() => setStep(1)} style={{ background: "#edf2f7", border: "none", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold", color: "#4a5568" }}>Ganti Area</button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
                  {TUGAS_AKTIF.map((tugas) => (
                    <div key={tugas.id} style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
                      <h3 style={{ margin: "0 0 20px 0", color: "#2d3748", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>{tugas.icon}</span> {tugas.nama}
                      </h3>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                        {/* KOTAK BEFORE */}
                        <div style={{ background: "#fff5f5", padding: "10px", borderRadius: "16px", border: "1px dashed #feb2b2" }}>
                          <div style={{ fontSize: "11px", fontWeight: "900", color: "#c53030", marginBottom: "10px", textAlign: "center", letterSpacing: "1px" }}>SEBELUM</div>
                          {photos[tugas.id]?.before ? (
                            <div style={{ position: "relative" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photos[tugas.id].before} alt="Before" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "12px", border: "2px solid #fed7d7" }} />
                              <button onClick={() => hapusFoto(tugas.id, "before")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "white", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>✖</button>
                            </div>
                          ) : (
                            <label style={{ width: "100%", aspectRatio: "3/4", background: "white", border: "none", borderRadius: "12px", color: "#e53e3e", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", transition: "0.2s" }}>
                              <span style={{ fontSize: "28px" }}>📁</span>
                              <span style={{ fontSize: "12px", fontWeight: "bold" }}>Upload Foto</span>
                              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, tugas.id, "before")} style={{ display: "none" }} />
                            </label>
                          )}
                        </div>

                        {/* KOTAK AFTER */}
                        <div style={{ background: "#f0fff4", padding: "10px", borderRadius: "16px", border: "1px dashed #9ae6b4" }}>
                          <div style={{ fontSize: "11px", fontWeight: "900", color: "#276749", marginBottom: "10px", textAlign: "center", letterSpacing: "1px" }}>SESUDAH</div>
                          {photos[tugas.id]?.after ? (
                            <div style={{ position: "relative" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photos[tugas.id].after} alt="After" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "12px", border: "2px solid #c6f6d5" }} />
                              <button onClick={() => hapusFoto(tugas.id, "after")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "#38a169", color: "white", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>✖</button>
                            </div>
                          ) : (
                            <label style={{ width: "100%", aspectRatio: "3/4", background: "white", border: "none", borderRadius: "12px", color: "#38a169", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", transition: "0.2s" }}>
                              <span style={{ fontSize: "28px" }}>📁</span>
                              <span style={{ fontSize: "12px", fontWeight: "bold" }}>Upload Foto</span>
                              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, tugas.id, "after")} style={{ display: "none" }} />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleKirimLaporan} disabled={isLoading}
                  style={{ width: "100%", padding: "20px", background: isLoading ? "#a0aec0" : "#234e52", color: "white", border: "none", borderRadius: "16px", fontWeight: "bold", fontSize: "16px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "40px", boxShadow: isLoading ? "none" : "0 10px 20px -5px rgba(35, 78, 82, 0.4)", transition: "all 0.3s" }}
                >
                  {isLoading ? "🔄 MENGUNGGAH FOTO..." : "🚀 KUKUHKAN & KIRIM LAPORAN"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================================= */}
        {/* TAB 2: GALERI & TABEL RIWAYAT VISUAL */}
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

                {/* Grid Bukti Foto */}
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {log.detail_tugas.map((sub, sIdx) => {
                    const bgStatus = sub.status.includes("Sempurna") ? "#f0fff4" : (sub.status.includes("Sebagian") ? "#fffff0" : "#fff5f5");
                    const icon = sub.nama_tugas.includes("Wastafel") ? "🚰"
                      : sub.nama_tugas.includes("Sampah") ? "🗑️"
                      : sub.nama_tugas.includes("Lantai") ? "🧹"
                      : sub.nama_tugas.includes("Meja") ? "🪑"
                      : sub.nama_tugas.includes("Gelas") ? "🍽️"
                      : sub.nama_tugas.includes("Belanja") ? "🛒"
                      : "🧽";

                    return (
                      <div key={sIdx} style={{ background: bgStatus, padding: "15px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "14px", marginBottom: "15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span>{icon}</span> {sub.nama_tugas}</span>
                          <span style={{ fontSize: "10px", padding: "4px 8px", background: "white", borderRadius: "8px", color: sub.status.includes("Sempurna") ? "#38a169" : "#d69e2e", border: "1px solid #e2e8f0" }}>{sub.status}</span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          <div style={{ background: "white", padding: "8px", borderRadius: "12px", border: "1px solid #fed7d7" }}>
                            <div style={{ fontSize: "10px", color: "#e53e3e", fontWeight: "900", marginBottom: "8px", textAlign: "center" }}>BEFORE</div>
                            {sub.foto_before ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={sub.foto_before} alt="Sebelum" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px" }} />
                            ) : (
                              <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", borderRadius: "8px", color: "#a0aec0", fontSize: "12px", fontStyle: "italic" }}>Tidak ada foto</div>
                            )}
                          </div>

                          <div style={{ background: "white", padding: "8px", borderRadius: "12px", border: "1px solid #c6f6d5" }}>
                            <div style={{ fontSize: "10px", color: "#38a169", fontWeight: "900", marginBottom: "8px", textAlign: "center" }}>AFTER</div>
                            {sub.foto_after ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={sub.foto_after} alt="Sesudah" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px" }} />
                            ) : (
                              <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", borderRadius: "8px", color: "#a0aec0", fontSize: "12px", fontStyle: "italic" }}>Tidak ada foto</div>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })}
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