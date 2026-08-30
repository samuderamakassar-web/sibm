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

// Jenis servis yang bisa dipilih (multi-select). "Ganti Oli" dianggap sudah termasuk bagian
// Servis Berkala jadi tidak butuh foto sendiri. Selain itu & "Servis Berkala" (yang punya aturan
// foto khusus 3 lembar), tiap jenis yang dipilih wajib lampirkan 1 foto buktinya masing-masing.
const JENIS_OPSI = ["Ganti Oli", "Ganti Ban Luar", "Ganti Ban Dalam", "Tubles", "Uji Emisi", "Servis Berkala", "Rem", "Lainnya"];
const JENIS_TANPA_FOTO = "Ganti Oli";
const JENIS_SERVIS_BERKALA = "Servis Berkala";

const sharedInputStyle = {
  width: "100%", padding: "16px", borderRadius: "14px", border: "1px solid #cbd5e0",
  fontSize: "15px", background: "#f8fafc", outline: "none", boxSizing: "border-box" as const,
  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s", color: "#2d3748"
};

// Kartu upload foto generik dipakai berulang (1 per jenis servis & 3 slot khusus Servis Berkala)
function KartuUploadFoto({ label, url, isUploading, onUpload }: { label: string; url: string; isUploading: boolean; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f8fafc", border: url ? "1px solid #cbd5e0" : "1px dashed #fc8181", borderRadius: "10px", padding: "10px" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
      ) : (
        <span style={{ fontSize: "18px" }}>📸</span>
      )}
      <div style={{ flex: 1 }}>
        <label style={{ display: "block", fontWeight: "700", marginBottom: "4px", fontSize: "11px", color: "#4a5568" }}>{label} *</label>
        <label style={{ display: "inline-block", padding: "6px 12px", background: "white", border: "1px solid #cbd5e0", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", color: "#4a5568", cursor: "pointer" }}>
          {isUploading ? "⏳ Mengunggah..." : (url ? "Ganti Foto" : "Wajib Upload Foto")}
          <input type="file" accept="image/*" capture="environment" onChange={onUpload} disabled={isUploading} style={{ display: "none" }} />
        </label>
      </div>
    </div>
  );
}

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

  const [odometerInput, setOdometerInput] = useState("");
  const [servisJenisTerpilih, setServisJenisTerpilih] = useState<string[]>([]);
  const [servisDeskripsi, setServisDeskripsi] = useState("");
  const [servisBiaya, setServisBiaya] = useState("");
  const [isSavingServis, setIsSavingServis] = useState(false);

  // 📸 1 foto wajib per jenis (kecuali Ganti Oli & Servis Berkala yang punya aturan sendiri)
  const [fotoPerJenis, setFotoPerJenis] = useState<Record<string, string>>({});
  const [uploadingPerJenis, setUploadingPerJenis] = useState<Record<string, boolean>>({});

  // 📸 3 foto wajib khusus Servis Berkala: foto kendaraan, foto KM, foto buku servis
  const [fotoBerkala, setFotoBerkala] = useState({ kendaraan: "", km: "", buku_service: "" });
  const [uploadingBerkala, setUploadingBerkala] = useState({ kendaraan: false, km: false, buku_service: false });

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

  const toggleJenis = (jenis: string) => {
    setServisJenisTerpilih((prev) => {
      if (prev.includes(jenis)) {
        // Hapus juga foto yang sudah diupload untuk jenis ini biar gak nyangkut data yatim
        setFotoPerJenis((prevFoto) => {
          const next = { ...prevFoto };
          delete next[jenis];
          return next;
        });
        return prev.filter((j) => j !== jenis);
      }
      return [...prev, jenis];
    });
  };

  const handleFotoJenisUpload = (jenis: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFotoUpload(
      file, "sibm/servis",
      () => setUploadingPerJenis((prev) => ({ ...prev, [jenis]: true })),
      (url) => setFotoPerJenis((prev) => ({ ...prev, [jenis]: url })),
      (err) => { console.error(err); showToast(`Gagal upload foto ${jenis}, coba lagi.`, "error"); },
      () => setUploadingPerJenis((prev) => ({ ...prev, [jenis]: false }))
    );
  };

  const handleFotoBerkalaUpload = (bagian: "kendaraan" | "km" | "buku_service", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFotoUpload(
      file, "sibm/servis-berkala",
      () => setUploadingBerkala((prev) => ({ ...prev, [bagian]: true })),
      (url) => setFotoBerkala((prev) => ({ ...prev, [bagian]: url })),
      (err) => { console.error(err); showToast("Gagal upload foto, coba lagi.", "error"); },
      () => setUploadingBerkala((prev) => ({ ...prev, [bagian]: false }))
    );
  };

  const adaUploadBerjalan = Object.values(uploadingPerJenis).some(Boolean) || Object.values(uploadingBerkala).some(Boolean);
  const isServisBerkalaDipilih = servisJenisTerpilih.includes(JENIS_SERVIS_BERKALA);
  const jenisButuhFotoSendiri = servisJenisTerpilih.filter((j) => j !== JENIS_TANPA_FOTO && j !== JENIS_SERVIS_BERKALA);

  const handleSubmitServis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraanId) return showToast("Pilih kendaraan dulu.", "warning");
    if (!odometerInput.trim()) return showToast("Odometer wajib diisi.", "warning");
    if (servisJenisTerpilih.length === 0) return showToast("Pilih minimal 1 jenis servis.", "warning");
    if (adaUploadBerjalan) return showToast("Tunggu semua foto selesai diunggah dulu.", "warning");

    const jenisBelumFoto = jenisButuhFotoSendiri.find((j) => !fotoPerJenis[j]);
    if (jenisBelumFoto) return showToast(`Foto untuk "${jenisBelumFoto}" wajib dilampirkan.`, "warning");

    if (isServisBerkalaDipilih && (!fotoBerkala.kendaraan || !fotoBerkala.km || !fotoBerkala.buku_service)) {
      return showToast("Servis Berkala wajib lampirkan 3 foto: Kendaraan, KM, & Buku Servis.", "warning");
    }

    setIsSavingServis(true);
    try {
      const fotoDetail: Record<string, string> = { ...fotoPerJenis };
      if (isServisBerkalaDipilih) {
        fotoDetail["Servis Berkala - Foto Kendaraan"] = fotoBerkala.kendaraan;
        fotoDetail["Servis Berkala - Foto KM"] = fotoBerkala.km;
        fotoDetail["Servis Berkala - Foto Buku Servis"] = fotoBerkala.buku_service;
      }
      const fotoUtama = Object.values(fotoDetail)[0] || "";

      await addDoc(collection(db, "kendaraan_service_logs"), {
        kendaraan_id: kendaraanId,
        kendaraan: kendaraan,
        tanggal: todayISO,
        jenis_service: servisJenisTerpilih.join(", "),
        deskripsi: servisDeskripsi.trim() || "-",
        biaya: servisBiaya.trim() || "-",
        odometer: odometerInput.trim(),
        foto_emisi_url: fotoUtama,
        foto_detail: fotoDetail,
        dicatat_oleh: activeDriver,
        waktu_catat: serverTimestamp(),
      });

      // Odometer otomatis ikut tercatat begitu laporan servis dikirim — gak perlu tombol "Catat" terpisah lagi
      await addDoc(collection(db, "kendaraan_odometer_logs"), {
        kendaraan_id: kendaraanId,
        kendaraan: kendaraan,
        odometer: odometerInput.trim(),
        tanggal: todayISO,
        dicatat_oleh: activeDriver,
        waktu_catat: serverTimestamp(),
      });

      showToast("Laporan servis & odometer berhasil disimpan! Bisa dicek Admin di Riwayat Kendaraan.", "success");
      setServisJenisTerpilih([]);
      setServisDeskripsi("");
      setServisBiaya("");
      setOdometerInput("");
      setFotoPerJenis({});
      setFotoBerkala({ kendaraan: "", km: "", buku_service: "" });
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan laporan servis.", "error");
    } finally {
      setIsSavingServis(false);
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
            <form onSubmit={handleSubmitServis} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>PILIH KENDARAAN *</label>
                <select value={kendaraanId} onChange={(e) => setKendaraanId(e.target.value)} style={{...sharedInputStyle, fontWeight:"bold", border: "2px solid #cbd5e0"}}>
                  {kendaraanMaster.map(mobil => <option key={mobil.id} value={mobil.id}>{mobil.kendaraan}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>ODOMETER SAAT INI (KM) *</label>
                <input
                  type="number" required placeholder="Contoh: 45200" value={odometerInput}
                  onChange={(e) => setOdometerInput(e.target.value)}
                  style={{ ...sharedInputStyle, fontSize: "18px", fontWeight: "bold" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>JENIS SERVIS * (bisa pilih lebih dari 1)</label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {JENIS_OPSI.map(j => {
                    const dipilih = servisJenisTerpilih.includes(j);
                    return (
                      <button
                        key={j} type="button" onClick={() => toggleJenis(j)}
                        style={{ padding: "8px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", border: dipilih ? "2px solid #3182ce" : "1px solid #e2e8f0", background: dipilih ? "#ebf8ff" : "#f8fafc", color: dipilih ? "#2b6cb0" : "#718096" }}
                      >
                        {dipilih ? "✓ " : ""}{j}
                      </button>
                    );
                  })}
                </div>
                {servisJenisTerpilih.includes(JENIS_TANPA_FOTO) && (
                  <div style={{ fontSize: "10px", color: "#718096", marginTop: "6px" }}>Info: Ganti Oli tidak perlu foto terpisah — sudah termasuk bagian Servis Berkala.</div>
                )}
              </div>

              {jenisButuhFotoSendiri.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {jenisButuhFotoSendiri.map((jenis) => (
                    <KartuUploadFoto
                      key={jenis}
                      label={`Foto Bukti — ${jenis}`}
                      url={fotoPerJenis[jenis] || ""}
                      isUploading={!!uploadingPerJenis[jenis]}
                      onUpload={(e) => handleFotoJenisUpload(jenis, e)}
                    />
                  ))}
                </div>
              )}

              {isServisBerkalaDipilih && (
                <div style={{ border: "1px solid #edf2f7", borderRadius: "14px", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "900", color: "#b7791f" }}>📋 SERVIS BERKALA — WAJIB 3 FOTO</div>
                  <KartuUploadFoto label="Foto Kendaraan" url={fotoBerkala.kendaraan} isUploading={uploadingBerkala.kendaraan} onUpload={(e) => handleFotoBerkalaUpload("kendaraan", e)} />
                  <KartuUploadFoto label="Foto KM (Odometer)" url={fotoBerkala.km} isUploading={uploadingBerkala.km} onUpload={(e) => handleFotoBerkalaUpload("km", e)} />
                  <KartuUploadFoto label="Foto Buku Servis" url={fotoBerkala.buku_service} isUploading={uploadingBerkala.buku_service} onUpload={(e) => handleFotoBerkalaUpload("buku_service", e)} />
                </div>
              )}

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>DESKRIPSI</label>
                <textarea placeholder="Contoh: Ganti oli mesin + filter di bengkel resmi" value={servisDeskripsi} onChange={(e) => setServisDeskripsi(e.target.value)} style={{ ...sharedInputStyle, height: "60px", resize: "none", fontSize: "13px" }} />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>BIAYA (OPSIONAL)</label>
                <input type="text" placeholder="Contoh: 350000" value={servisBiaya} onChange={(e) => setServisBiaya(e.target.value)} style={sharedInputStyle} />
              </div>

              <button type="submit" disabled={isSavingServis || adaUploadBerjalan} style={{ width: "100%", padding: "16px", background: isSavingServis ? "#a0aec0" : "#dd6b20", color: "white", border: "none", borderRadius: "14px", fontWeight: "900", fontSize: "14px", cursor: isSavingServis ? "not-allowed" : "pointer", boxShadow: isSavingServis ? "none" : "0 4px 15px rgba(221, 107, 32, 0.3)" }}>
                {isSavingServis ? "Menyimpan..." : "✅ Kirim Laporan Servis"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
