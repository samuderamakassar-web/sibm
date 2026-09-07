"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconCheck = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const IconX = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
);

interface NotifikasiDadakan {
  id: string;
  tanggal: string;
  jendela: "Pagi" | "Malam";
  petugas: string;
  foto_url: string;
  waktu_upload_label?: string;
  dibuat_pada: Timestamp | null;
}

function formatTanggalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

function formatTanggalLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MonitorDadakanPage() {
  const router = useRouter();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });
  const adminName = session?.nama || "Admin";

  const [data, setData] = useState<NotifikasiDadakan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "notifikasi_dadakan_siram"), orderBy("dibuat_pada", "desc"), limit(120)),
      (snapshot) => {
        setData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as NotifikasiDadakan)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // 14 hari terakhir (termasuk hari ini), terbaru di atas -- biar keliatan jelas hari/jendela mana
  // yang BELUM ada buktinya sama sekali (bukan cuma nampilin yang ada datanya).
  const rekapPerTanggal = (() => {
    const hariIni = new Date();
    const daftarTanggal: string[] = [];
    for (let i = 0; i < 14; i++) {
      daftarTanggal.push(formatTanggalISO(new Date(hariIni.getTime() - i * 24 * 60 * 60 * 1000)));
    }
    const perTanggal: Record<string, { Pagi?: NotifikasiDadakan; Malam?: NotifikasiDadakan }> = {};
    data.forEach((item) => {
      if (!perTanggal[item.tanggal]) perTanggal[item.tanggal] = {};
      perTanggal[item.tanggal][item.jendela] = item;
    });
    return daftarTanggal.map((tanggal) => ({ tanggal, Pagi: perTanggal[tanggal]?.Pagi, Malam: perTanggal[tanggal]?.Malam }));
  })();

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .back-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px;
        }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge {
          display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info);
          padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2);
        }
        .admin-hero {
          position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff;
          padding: 34px 20px 50px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .admin-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .admin-hero-content { position: relative; }
        .dadakan-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--line); }
        .dadakan-row:last-child { border-bottom: none; }
        .dadakan-jendela { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; font-size: 11.5px; font-weight: 700; min-width: 150px; }
      `}} />
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> {adminName}
        </div>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 900, letterSpacing: "1px" }}>NOTIFIKASI DADAKAN</h1>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Bukti foto siram tanaman Security — jendela Pagi (06:00-07:00) & Malam (20:00-22:00) WITA.</p>
        </div>
      </div>

      <div style={{ maxWidth: "900px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", overflow: "hidden" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</div>
          ) : (
            rekapPerTanggal.map(({ tanggal, Pagi, Malam }) => (
              <div key={tanggal} className="dadakan-row">
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>{formatTanggalLabel(tanggal)}</div>
                {([{ label: "Pagi", item: Pagi }, { label: "Malam", item: Malam }] as const).map(({ label, item }) => (
                  <a
                    key={label}
                    href={item?.foto_url || undefined}
                    target={item?.foto_url ? "_blank" : undefined}
                    rel="noreferrer"
                    className="dadakan-jendela"
                    style={{
                      background: item ? "var(--ok-50)" : "var(--red-50)",
                      color: item ? "var(--ok)" : "var(--red-600)",
                      cursor: item ? "pointer" : "default",
                      textDecoration: "none",
                    }}
                  >
                    {item ? <IconCheck /> : <IconX />}
                    <span>{label}: {item ? `${item.petugas} (${item.waktu_upload_label || "-"})` : "Belum ada bukti"}</span>
                  </a>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
