"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../ui/ToastProvider";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconChevronRight = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
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

export default function DriverArmadaPage() {
  const router = useRouter();
  const showToast = useToast();

  const { session, isReady } = useAuthGuard({
    depts: ["Driver"],
    adminBypass: false,
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Driver.",
  });
  const activeDriver = session?.nama || "Driver";

  const [kendaraanMaster, setKendaraanMaster] = useState<KendaraanMaster[]>([]);
  const [kendaraanId, setKendaraanId] = useState<string>("");
  const [statusMobil, setStatusMobil] = useState<string>("Keluar Beroperasi");
  const [tujuan, setTujuan] = useState<string>("");
  const [kilometer, setKilometer] = useState<string>("");
  const [isLoadingMobil, setIsLoadingMobil] = useState<boolean>(false);

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

  const handleSubmitMobil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraan) {
      return showToast("Belum ada kendaraan terdaftar. Hubungi Admin untuk menambahkan data kendaraan.", "warning");
    }
    if (statusMobil === "Keluar Beroperasi" && !tujuan.trim()) {
      return showToast("Tujuan/Keperluan wajib diisi jika membawa mobil keluar!", "warning");
    }

    setIsLoadingMobil(true);
    try {
      await addDoc(collection(db, "operational_vehicle_logs"), {
        petugas_security: "Aplikasi Driver",
        waktu_catat: serverTimestamp(),
        kendaraan: kendaraan,
        status_kendaraan: statusMobil,
        driver_bertugas: activeDriver,
        tujuan_keperluan: tujuan || "-",
        kilometer_kendaraan: kilometer || "Tidak dicatat",
      });

      // 💡 AUTO-UPDATE STATUS DRIVER — sinkron otomatis, gak perlu update manual lagi
      let otomatisStatusDriver = "Standby";
      if (statusMobil === "Keluar Beroperasi" || statusMobil === "Masuk Bengkel / Service") {
        otomatisStatusDriver = "Keluar Beroperasi";
      }

      await addDoc(collection(db, "driver_status_logs"), {
        nama_driver: activeDriver,
        status: otomatisStatusDriver,
        waktu_ubah: serverTimestamp(),
        petugas_security: "Aplikasi Driver (Auto-Sync)"
      });

      showToast("Log Perjalanan & KM berhasil disimpan!", "success");
      setTujuan("");
      setKilometer("");
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan data kendaraan.", "error");
    } finally {
      setIsLoadingMobil(false);
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
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Bawa Armada</span>
        </div>
        <div className="pic-badge"><IconUserCircle size={14} /> {activeDriver}</div>
      </div>

      <div className="page-hero">
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(18px, 5vw, 24px)", fontWeight: "900" }}>🚙 FORM BAWA ARMADA</h1>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>Status kesiagaan Anda otomatis tersinkron begitu log ini dikirim</p>
      </div>

      <div style={{ maxWidth: "500px", margin: "-25px auto 0", padding: "0 15px", position: "relative", zIndex: 10 }}>
        <div style={{ background: "white", padding: "25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          {kendaraanMaster.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#a0aec0", fontSize: "13px", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e0" }}>
              Belum ada data kendaraan. Hubungi Admin untuk menambahkan kendaraan di Master Data.
            </div>
          ) : (
            <form onSubmit={handleSubmitMobil} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>PILIH MOBIL OPERASIONAL *</label>
                <select value={kendaraanId} onChange={(e) => setKendaraanId(e.target.value)} style={{...sharedInputStyle, fontWeight:"bold", border: "2px solid #cbd5e0"}}>
                  {kendaraanMaster.map(mobil => <option key={mobil.id} value={mobil.id}>{mobil.kendaraan}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>AKTIVITAS *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div onClick={() => setStatusMobil("Keluar Beroperasi")} style={{ padding: "12px", borderRadius: "12px", cursor: "pointer", textAlign: "center", fontWeight: "bold", fontSize: "13px", border: statusMobil === "Keluar Beroperasi" ? "2px solid #fc8181" : "1px solid #e2e8f0", background: statusMobil === "Keluar Beroperasi" ? "#fff5f5" : "#f8fafc", color: statusMobil === "Keluar Beroperasi" ? "#c53030" : "#718096" }}>
                    🛫 Keluar Pool
                  </div>
                  <div onClick={() => setStatusMobil("Tiba di Kantor (Standby)")} style={{ padding: "12px", borderRadius: "12px", cursor: "pointer", textAlign: "center", fontWeight: "bold", fontSize: "13px", border: statusMobil === "Tiba di Kantor (Standby)" ? "2px solid #68d391" : "1px solid #e2e8f0", background: statusMobil === "Tiba di Kantor (Standby)" ? "#f0fff4" : "#f8fafc", color: statusMobil === "Tiba di Kantor (Standby)" ? "#22543d" : "#718096" }}>
                    🛬 Tiba (Selesai)
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>TUJUAN PERJALANAN</label>
                <textarea placeholder={statusMobil === "Keluar Beroperasi" ? "Wajib diisi..." : "Contoh: Selesai antar manajemen..."} value={tujuan} onChange={(e) => setTujuan(e.target.value)} style={{ ...sharedInputStyle, height: "70px", resize: "none" }} />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "#4a5568" }}>ANGKA SPEEDOMETER (KM) AWAL/AKHIR</label>
                <input type="number" placeholder="Contoh: 45200" value={kilometer} onChange={(e) => setKilometer(e.target.value)} style={{...sharedInputStyle, fontSize: "18px", fontWeight: "bold"}} />
              </div>

              <button type="submit" disabled={isLoadingMobil} style={{ width: "100%", padding: "18px", background: "#2b6cb0", color: "white", border: "none", borderRadius: "14px", fontWeight: "900", fontSize: "15px", cursor: isLoadingMobil ? "not-allowed" : "pointer", marginTop: "5px", boxShadow: "0 4px 15px rgba(43, 108, 176, 0.3)" }}>
                {isLoadingMobil ? "Menyimpan Data..." : "💾 Kirim Laporan Armada"}
              </button>
            </form>
          )}
        </div>

        <button onClick={() => router.push("/dashboard/driver/riwayat")} style={{ width: "100%", marginTop: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "white", border: "1px solid #e2e8f0", padding: "16px 20px", borderRadius: "16px", color: "#2d3748", fontWeight: "700", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
          Lihat Riwayat Armada Saya <IconChevronRight size={16} color="#a0aec0" />
        </button>
      </div>
    </div>
  );
}
