"use client";

import { useEffect, useState } from "react";
import { collection, query, onSnapshot, orderBy, where, limit, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import AdminShell from "../../admin/AdminShell";

type IconProps = { size?: number; color?: string };
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
    <AdminShell title="Riwayat Armada Saya" subtitle="30 pergerakan armada terakhir yang Anda catat" userName={activeDriver || "Staf"} backHref={"/dashboard/driver"} backLabel={"Menu Driver"}>
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }
      `}} />

      <div>
        <div style={{ background: "var(--surface)", padding: "20px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {riwayatKu.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--muted)", fontSize: "13px", background: "var(--bg)", borderRadius: "12px", border: "1px dashed var(--line)", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
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
                  <div key={log.id} style={{ padding: "12px", border: "1px solid var(--line)", borderRadius: "12px", background: isStandby ? "var(--ok-50)" : "var(--surface)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                      <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "13px" }}>{log.kendaraan.split(" - ")[0]}</span>
                      <span style={{ fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", background: bg, color: color }}>
                        {label}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--ink-soft)", fontStyle: "italic", marginBottom: "5px" }}>&quot;{log.tujuan_keperluan}&quot;</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", fontWeight: "bold" }}>
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
    </AdminShell>
  );
}
