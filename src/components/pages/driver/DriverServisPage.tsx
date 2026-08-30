"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../ui/ToastProvider";
import { handleFotoUpload } from "../../../lib/uploadFoto";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

interface KendaraanMaster {
  id: string;
  kendaraan: string;
}

const sharedInputStyle = {
  width: "100%", padding: "16px", borderRadius: "14px", border: "1px solid #cbd5e0",
  fontSize: "15px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const,
  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s", color: "#2d3748"
};

export default function DriverServisPage() {
  const router = useRouter();
  const showToast = useToast();

  const { session, isReady } = useAuthGuard({
    depts: ["Driver"],
    adminBypass: false,
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Driver.",
  });
  const activeDriver = session?.nama || "Driver";
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());

  const [kendaraanMaster, setKendaraanMaster] = useState<KendaraanMaster[]>([]);
  const [kendaraanId, setKendaraanId] = useState<string>("");

  const [servisJenis, setServisJenis] = useState("");
  const [servisDeskripsi, setServisDeskripsi] = useState("");
  const [servisBiaya, setServisBiaya] = useState("");
  const [fotoEmisi, setFotoEmisi] = useState("");
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);
  const [isSavingServis, setIsSavingServis] = useState(false);

  const [odometerInput, setOdometerInput] = useState("");
  const [isSavingOdometer, setIsSavingOdometer] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "master_kendaraan"), orderBy("kendaraan", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setKendaraanMaster(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KendaraanMaster)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (kendaraanMaster.length === 0) return;
    if (!kendaraanId || !kendaraanMaster.some((k) => k.id === kendaraanId)) {
      setTimeout(() => setKendaraanId(kendaraanMaster[0].id), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kendaraanMaster]);

  const kendaraanTerpilih = kendaraanMaster.find((k) => k.id === kendaraanId);
  const kendaraan = kendaraanTerpilih?.kendaraan || "";

  const handleFotoEmisiUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFotoUpload(
      file, "sibm/emisi",
      () => setIsUploadingFoto(true),
      (url) => setFotoEmisi(url),
      (err) => { console.error(err); showToast("Gagal upload foto uji emisi, coba lagi.", "error"); },
      () => setIsUploadingFoto(false)
    );
  };

  const handleSubmitServis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraanId) return showToast("Pilih kendaraan dulu.", "warning");
    if (!servisJenis.trim()) return showToast("Jenis servis wajib diisi (misal: Ganti Oli, Uji Emisi, Servis Berkala).", "warning");
    if (isUploadingFoto) return showToast("Tunggu foto selesai diunggah dulu.", "warning");
    setIsSavingServis(true);
    try {
      await addDoc(collection(db, "kendaraan_service_logs"), {
        kendaraan_id: kendaraanId,
        kendaraan: kendaraan,
        tanggal: todayISO,
        jenis_service: servisJenis.trim(),
        deskripsi: servisDeskripsi.trim() || "-",
        biaya: servisBiaya.trim() || "-",
        foto_emisi_url: fotoEmisi || "",
        dicatat_oleh: activeDriver,
        waktu_catat: serverTimestamp(),
      });
      showToast("Laporan servis/uji emisi berhasil disimpan! Bisa dicek Admin di Riwayat Kendaraan.", "success");
      setServisJenis("");
      setServisDeskripsi("");
      setServisBiaya("");
      setFotoEmisi("");
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan laporan servis.", "error");
    } finally {
      setIsSavingServis(false);
    }
  };

  const handleSubmitOdometer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraanId) return showToast("Pilih kendaraan dulu.", "warning");
    if (!odometerInput.trim()) return showToast("Isi angka odometer dulu.", "warning");
    setIsSavingOdometer(true);
    try {
      await addDoc(collection(db, "kendaraan_odometer_logs"), {
        kendaraan_id: kendaraanId,
        kendaraan: kendaraan,
        odometer: odometerInput.trim(),
        tanggal: todayISO,
        dicatat_oleh: activeDriver,
        waktu_catat: serverTimestamp(),
      });
      showToast("Odometer berhasil dicatat!", "success");
      setOdometerInput("");
    } catch (error) {
      console.error(error);
      showToast("Gagal mencatat odometer.", "error");
    } finally {
      setIsSavingOdometer(false);
    }
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-50: #fef2f2;
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
        .pic-badge { display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info); padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: bold; border: 1px solid rgba(37,99,235,0.2); }
        .page-hero {
          position: relative; overflow: hidden; border-radius: 0 0 30px 30px; color: #fff;
          padding: 30px 20px 45px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
      `}} />

      <div className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="back-btn" onClick={() => router.push("/dashboard/driver")}><IconArrowLeft size={16} /></button>
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Servis & Odometer</span>
        </div>
        <div className="pic-badge"><IconUserCircle size={14} /> {activeDriver}</div>
      </div>

      <div className="page-hero">
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(18px, 5vw, 24px)", fontWeight: "900" }}>🛠️ SERVIS, EMISI &amp; ODOMETER</h1>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>Laporan ini langsung masuk Riwayat Kendaraan Admin</p>
      </div>

      <div style={{ maxWidth: "500px", margin: "-25px auto 0", padding: "0 15px", position: "relative", zIndex: 10 }}>
        <div style={{ background: "white", padding: "25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>

          {kendaraanMaster.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#a0aec0", fontSize: "13px", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e0" }}>
              Belum ada data kendaraan. Hubungi Admin untuk menambahkan kendaraan di Master Data.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>PILIH KENDARAAN *</label>
                <select value={kendaraanId} onChange={(e) => setKendaraanId(e.target.value)} style={{...sharedInputStyle, fontWeight:"bold", border: "2px solid #cbd5e0"}}>
                  {kendaraanMaster.map(mobil => <option key={mobil.id} value={mobil.id}>{mobil.kendaraan}</option>)}
                </select>
              </div>

              {/* Catat Odometer Cepat */}
              <form onSubmit={handleSubmitOdometer} style={{ display: "flex", gap: "10px", marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px dashed #e2e8f0" }}>
                <input
                  type="number" placeholder="Catat odometer terkini (km)" value={odometerInput}
                  onChange={(e) => setOdometerInput(e.target.value)}
                  style={{ ...sharedInputStyle, flex: 1 }}
                />
                <button type="submit" disabled={isSavingOdometer} style={{ padding: "0 20px", background: isSavingOdometer ? "#a0aec0" : "#2b6cb0", color: "white", border: "none", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: isSavingOdometer ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                  {isSavingOdometer ? "..." : "📟 Catat"}
                </button>
              </form>

              {/* Laporan Servis / Uji Emisi */}
              <form onSubmit={handleSubmitServis} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>JENIS SERVIS *</label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {["Ganti Oli", "Uji Emisi", "Servis Berkala", "Ban", "Rem", "Lainnya"].map(j => (
                      <button
                        key={j} type="button" onClick={() => setServisJenis(j)}
                        style={{ padding: "8px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", border: servisJenis === j ? "2px solid #3182ce" : "1px solid #e2e8f0", background: servisJenis === j ? "#ebf8ff" : "#f8fafc", color: servisJenis === j ? "#2b6cb0" : "#718096" }}
                      >
                        {j}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>DESKRIPSI</label>
                  <textarea placeholder="Contoh: Ganti oli mesin + filter di bengkel resmi" value={servisDeskripsi} onChange={(e) => setServisDeskripsi(e.target.value)} style={{ ...sharedInputStyle, height: "60px", resize: "none", fontSize: "13px" }} />
                </div>

                <div>
                  <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>BIAYA (OPSIONAL)</label>
                  <input type="text" placeholder="Contoh: 350000" value={servisBiaya} onChange={(e) => setServisBiaya(e.target.value)} style={sharedInputStyle} />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f8fafc", border: "1px dashed #cbd5e0", borderRadius: "12px", padding: "12px" }}>
                  {fotoEmisi ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fotoEmisi} alt="Foto bukti uji emisi" style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
                  ) : (
                    <span style={{ fontSize: "22px" }}>📸</span>
                  )}
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "inline-block", padding: "8px 14px", background: "white", border: "1px solid #cbd5e0", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "#4a5568", cursor: "pointer" }}>
                      {isUploadingFoto ? "⏳ Mengunggah..." : (fotoEmisi ? "Ganti Foto Bukti" : "Upload Bukti Servis/Emisi (opsional)")}
                      <input type="file" accept="image/*" capture="environment" onChange={handleFotoEmisiUpload} disabled={isUploadingFoto} style={{ display: "none" }} />
                    </label>
                  </div>
                </div>

                <button type="submit" disabled={isSavingServis || isUploadingFoto} style={{ width: "100%", padding: "16px", background: isSavingServis ? "#a0aec0" : "#dd6b20", color: "white", border: "none", borderRadius: "14px", fontWeight: "900", fontSize: "14px", cursor: isSavingServis ? "not-allowed" : "pointer", boxShadow: isSavingServis ? "none" : "0 4px 15px rgba(221, 107, 32, 0.3)" }}>
                  {isSavingServis ? "Menyimpan..." : "✅ Kirim Laporan Servis"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
