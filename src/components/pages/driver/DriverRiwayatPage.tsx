"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, onSnapshot, orderBy, where, limit, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconInboxEmpty = ({ size = 26, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);

interface KendaraanLog {
  id: string;
  kendaraan: string;
  status_kendaraan: string;
  tujuan_keperluan: string;
  kilometer_kendaraan: string;
  waktu_catat: Timestamp | null;
}

export default function DriverRiwayatPage() {
  const router = useRouter();

  const { session, isReady } = useAuthGuard({
    depts: ["Driver"],
    adminBypass: false,
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Driver.",
  });
  const activeDriver = session?.nama || "Driver";

  const [riwayatKu, setRiwayatKu] = useState<KendaraanLog[]>([]);

  useEffect(() => {
    if (!activeDriver) return;
    const qMobil = query(collection(db, "operational_vehicle_logs"), where("driver_bertugas", "==", activeDriver), orderBy("waktu_catat", "desc"), limit(30));
    const unsub = onSnapshot(qMobil, (snap) => {
      const logsArr: KendaraanLog[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        logsArr.push({
          id: docSnap.id,
          kendaraan: data.kendaraan,
          status_kendaraan: data.status_kendaraan,
          tujuan_keperluan: data.tujuan_keperluan,
          kilometer_kendaraan: data.kilometer_kendaraan,
          waktu_catat: data.waktu_catat
        });
      });
      setRiwayatKu(logsArr);
    });
    return () => unsub();
  }, [activeDriver]);

  const formatWaktu = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return ts.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>Riwayat Armada Saya</span>
        </div>
        <div className="pic-badge"><IconUserCircle size={14} /> {activeDriver}</div>
      </div>

      <div className="page-hero">
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(18px, 5vw, 24px)", fontWeight: "900" }}>🕒 RIWAYAT ARMADA SAYA</h1>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>30 pergerakan armada terakhir yang Anda catat</p>
      </div>

      <div style={{ maxWidth: "500px", margin: "-25px auto 0", padding: "0 15px", position: "relative", zIndex: 10 }}>
        <div style={{ background: "white", padding: "20px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {riwayatKu.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 20px", color: "#a0aec0", fontSize: "13px", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e0", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <IconInboxEmpty size={26} color="#a0aec0" /> Belum ada log armada dari Anda.
              </div>
            ) : (
              riwayatKu.map((log) => {
                const isStandby = log.status_kendaraan.includes("Standby") || log.status_kendaraan.includes("Tiba");
                const isPulang = log.status_kendaraan.includes("Pulang");
                const isBengkel = log.status_kendaraan.includes("Bengkel") || log.status_kendaraan.includes("Service");
                const label = isBengkel ? "SERVICE" : isPulang ? "PULANG" : isStandby ? "TIBA" : "KELUAR";
                const bg = isBengkel ? "#e2e8f0" : isPulang ? "#e9d8fd" : isStandby ? "#c6f6d5" : "#fed7d7";
                const color = isBengkel ? "#4a5568" : isPulang ? "#6b46c1" : isStandby ? "#22543d" : "#9b2c2c";
                return (
                  <div key={log.id} style={{ padding: "12px", border: "1px solid #edf2f7", borderRadius: "12px", background: isStandby ? "#f0fff4" : "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                      <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "13px" }}>{log.kendaraan.split(" - ")[0]}</span>
                      <span style={{ fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", background: bg, color: color }}>
                        {label}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#4a5568", fontStyle: "italic", marginBottom: "5px" }}>&quot;{log.tujuan_keperluan}&quot;</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#a0aec0", fontWeight: "bold" }}>
                      <span>📟 KM: {log.kilometer_kendaraan}</span>
                      <span>{formatWaktu(log.waktu_catat)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
