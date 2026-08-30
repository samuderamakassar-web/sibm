"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, where, limit } from "firebase/firestore";
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
interface InspeksiTerakhir {
  tanggal: string;
  minggu_of: string;
}

const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "ban", label: "Ban & Tekanan Angin" },
  { key: "rem", label: "Rem" },
  { key: "lampu", label: "Lampu (Depan/Belakang/Sein)" },
  { key: "oli", label: "Oli Mesin" },
  { key: "air_radiator_aki", label: "Air Radiator & Aki" },
  { key: "wiper_kaca", label: "Wiper & Kaca" },
  { key: "ac", label: "AC" },
  { key: "kebersihan", label: "Kebersihan Interior/Eksterior" },
];
const STATUS_OPSI = ["Baik", "Perlu Perhatian", "Rusak"];

function getMondayOfWeek(d: Date = new Date()): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(date);
}
function checklistDefault(): Record<string, string> {
  const obj: Record<string, string> = {};
  CHECKLIST_ITEMS.forEach((item) => { obj[item.key] = "Baik"; });
  return obj;
}

const sharedInputStyle = {
  width: "100%", padding: "16px", borderRadius: "14px", border: "1px solid #cbd5e0",
  fontSize: "15px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const,
  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s", color: "#2d3748"
};

export default function DriverInspeksiPage() {
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
  const [inspeksiTerakhir, setInspeksiTerakhir] = useState<InspeksiTerakhir | null>(null);

  const [inspeksiChecklist, setInspeksiChecklist] = useState<Record<string, string>>(checklistDefault());
  const [catatanInspeksi, setCatatanInspeksi] = useState("");

  // 📸 Foto WAJIB per bagian yang diinspeksi — key: CHECKLIST_ITEMS.key, value: url foto
  const [fotoPerBagian, setFotoPerBagian] = useState<Record<string, string>>({});
  const [uploadingPerBagian, setUploadingPerBagian] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    if (!kendaraanId) return;
    const q = query(collection(db, "kendaraan_inspeksi_logs"), where("kendaraan_id", "==", kendaraanId), orderBy("tanggal", "desc"), limit(1));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setInspeksiTerakhir({ tanggal: data.tanggal, minggu_of: data.minggu_of });
      } else {
        setInspeksiTerakhir(null);
      }
    });
    return () => unsub();
  }, [kendaraanId]);

  const kendaraanTerpilih = kendaraanMaster.find((k) => k.id === kendaraanId);
  const kendaraan = kendaraanTerpilih?.kendaraan || "";
  const sudahInspeksiMingguIni = inspeksiTerakhir?.minggu_of === getMondayOfWeek();
  const adaUploadBerjalan = Object.values(uploadingPerBagian).some(Boolean);

  const handleFotoBagianUpload = (itemKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFotoUpload(
      file, "sibm/inspeksi",
      () => setUploadingPerBagian((prev) => ({ ...prev, [itemKey]: true })),
      (url) => setFotoPerBagian((prev) => ({ ...prev, [itemKey]: url })),
      (err) => { console.error(err); showToast("Gagal upload foto, coba lagi.", "error"); },
      () => setUploadingPerBagian((prev) => ({ ...prev, [itemKey]: false }))
    );
  };

  const handleSubmitInspeksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraanId) return showToast("Pilih kendaraan dulu.", "warning");
    if (adaUploadBerjalan) return showToast("Tunggu semua foto selesai diunggah dulu.", "warning");

    const itemBelumFoto = CHECKLIST_ITEMS.find((item) => !fotoPerBagian[item.key]);
    if (itemBelumFoto) {
      return showToast(`Foto untuk "${itemBelumFoto.label}" wajib dilampirkan.`, "warning");
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, "kendaraan_inspeksi_logs"), {
        kendaraan_id: kendaraanId,
        kendaraan: kendaraan,
        driver: activeDriver,
        tanggal: todayISO,
        minggu_of: getMondayOfWeek(),
        checklist: inspeksiChecklist,
        catatan: catatanInspeksi.trim(),
        checklist_foto: fotoPerBagian,
        foto_url: fotoPerBagian[CHECKLIST_ITEMS[0].key] || "",
        waktu_catat: serverTimestamp(),
      });
      showToast("Inspeksi mingguan berhasil disimpan!", "success");
      setInspeksiChecklist(checklistDefault());
      setCatatanInspeksi("");
      setFotoPerBagian({});
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan inspeksi.", "error");
    } finally {
      setIsSaving(false);
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
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Inspeksi Mingguan</span>
        </div>
        <div className="pic-badge"><IconUserCircle size={14} /> {activeDriver}</div>
      </div>

      <div className="page-hero">
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(18px, 5vw, 24px)", fontWeight: "900" }}>🔍 INSPEKSI MINGGUAN</h1>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>Cek kondisi kendaraan & lampirkan foto tiap bagian sebelum beroperasi</p>
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

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #edf2f7", paddingBottom: "12px", marginBottom: "15px" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#718096" }}>Status minggu ini:</p>
                <span style={{ fontSize: "10px", fontWeight: "bold", padding: "5px 10px", borderRadius: "8px", background: sudahInspeksiMingguIni ? "#c6f6d5" : "#feebc8", color: sudahInspeksiMingguIni ? "#22543d" : "#9c4221" }}>
                  {sudahInspeksiMingguIni ? "✅ SUDAH MINGGU INI" : "⚠️ BELUM MINGGU INI"}
                </span>
              </div>

              <form onSubmit={handleSubmitInspeksi} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {CHECKLIST_ITEMS.map((item) => {
                  const fotoItem = fotoPerBagian[item.key];
                  const uploadingItem = !!uploadingPerBagian[item.key];
                  return (
                    <div key={item.key} style={{ border: "1px solid #edf2f7", borderRadius: "14px", padding: "12px" }}>
                      <label style={{ display: "block", fontWeight: "700", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>{item.label} *</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginBottom: "10px" }}>
                        {STATUS_OPSI.map((opsi) => {
                          const dipilih = inspeksiChecklist[item.key] === opsi;
                          const warna = opsi === "Baik" ? "#38a169" : opsi === "Perlu Perhatian" ? "#d69e2e" : "#e53e3e";
                          return (
                            <button
                              type="button"
                              key={opsi}
                              onClick={() => setInspeksiChecklist((prev) => ({ ...prev, [item.key]: opsi }))}
                              style={{
                                padding: "8px 4px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer",
                                border: dipilih ? `2px solid ${warna}` : "1px solid #e2e8f0",
                                background: dipilih ? `${warna}1a` : "#f8fafc",
                                color: dipilih ? warna : "#a0aec0",
                              }}
                            >
                              {opsi}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f8fafc", border: fotoItem ? "1px solid #cbd5e0" : "1px dashed #fc8181", borderRadius: "10px", padding: "10px" }}>
                        {fotoItem ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fotoItem} alt={`Foto ${item.label}`} style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
                        ) : (
                          <span style={{ fontSize: "18px" }}>📸</span>
                        )}
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "inline-block", padding: "6px 12px", background: "white", border: "1px solid #cbd5e0", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", color: "#4a5568", cursor: "pointer" }}>
                            {uploadingItem ? "⏳ Mengunggah..." : (fotoItem ? "Ganti Foto" : "Wajib Upload Foto")}
                            <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFotoBagianUpload(item.key, e)} disabled={uploadingItem} style={{ display: "none" }} />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div>
                  <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>CATATAN TAMBAHAN</label>
                  <textarea placeholder="Opsional — jelaskan kalau ada item Perlu Perhatian/Rusak" value={catatanInspeksi} onChange={(e) => setCatatanInspeksi(e.target.value)} style={{ ...sharedInputStyle, height: "60px", resize: "none", fontSize: "13px" }} />
                </div>

                <button type="submit" disabled={isSaving || adaUploadBerjalan} style={{ width: "100%", padding: "16px", background: isSaving ? "#a0aec0" : "#38a169", color: "white", border: "none", borderRadius: "14px", fontWeight: "900", fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer", boxShadow: isSaving ? "none" : "0 4px 15px rgba(56, 161, 105, 0.3)" }}>
                  {isSaving ? "Menyimpan..." : "✅ Kirim Inspeksi Mingguan"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
