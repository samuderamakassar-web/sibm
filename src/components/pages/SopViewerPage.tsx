"use client";

import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { useAuthGuard } from "@/hooks/useAuthGuard";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);
const IconBook = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
);
const IconFileText = ({ size = 20, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5" /><path d="M9.5 16.5h5" /></svg>
);
const IconInboxEmpty = ({ size = 26, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);

interface SopDoc {
  id: string;
  judul: string;
  deskripsi: string;
  file_url: string;
  file_name: string;
  waktu_upload: Timestamp | null;
}

interface SopViewerPageProps {
  /** Dept target yang dipakai untuk filter dokumen SEKALIGUS untuk auth guard (harus exact match dengan pic_dept). */
  dept: string;
  /** Halaman tujuan tombol kembali (dashboard masing-masing tim). */
  backPath: string;
  /** Label yang ditampilkan di badge & pesan akses ditolak, cth "Tim Security". */
  labelTim: string;
}

export default function SopViewerPage({ dept, backPath, labelTim }: SopViewerPageProps) {
  const router = useRouter();

  const { session, isReady } = useAuthGuard({
    depts: [dept],
    redirectTo: "/",
    deniedMessage: `Akses Ditolak! Halaman ini khusus ${labelTim}.`,
  });
  const namaAktif = session?.nama || "";

  const [daftarSop, setDaftarSop] = useState<SopDoc[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "sop_documents"), where("target_dept", "==", dept), orderBy("waktu_upload", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDaftarSop(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SopDoc)));
      setIsLoadingData(false);
    });
    return () => unsub();
  }, [dept]);

  const formatTanggal = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
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
        .sop-card {
          background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 18px 20px;
          display: flex; align-items: flex-start; gap: 14px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }
        .sop-icon { background: var(--info-50); color: var(--info); border-radius: 14px; padding: 12px; display: flex; flex-shrink: 0; }
        .sop-open-btn {
          display: inline-flex; align-items: center; gap: 6px; background: var(--info); color: white; border: none;
          padding: 9px 16px; border-radius: 10px; font-size: 12px; font-weight: 800; cursor: pointer; margin-top: 10px;
          text-decoration: none; font-family: inherit;
        }
      `}} />

      <div className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="back-btn" onClick={() => router.push(backPath)}><IconArrowLeft size={16} /></button>
          <span style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "15px" }}>SOP & Instruksi Kerja</span>
        </div>
        <div className="pic-badge"><IconUserCircle size={14} /> {namaAktif}</div>
      </div>

      <div className="page-hero">
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(18px, 5vw, 24px)", fontWeight: "900" }}>📘 SOP &amp; INSTRUKSI KERJA</h1>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>Dokumen resmi untuk {labelTim}, diterbitkan oleh Admin GA</p>
      </div>

      <div style={{ maxWidth: "650px", margin: "-25px auto 0", padding: "0 15px", position: "relative", zIndex: 10, display: "flex", flexDirection: "column", gap: "14px" }}>
        {!isLoadingData && daftarSop.length === 0 && (
          <div style={{ background: "var(--surface)", border: "1px dashed var(--line)", borderRadius: "18px", padding: "40px 20px", textAlign: "center", color: "var(--muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <IconInboxEmpty size={28} color="var(--muted)" />
            Belum ada dokumen SOP/IK untuk {labelTim}.
          </div>
        )}

        {daftarSop.map((sop) => (
          <div key={sop.id} className="sop-card">
            <div className="sop-icon"><IconBook size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: "800", color: "var(--ink)" }}>{sop.judul}</h2>
              {sop.deskripsi && <p style={{ margin: "0 0 6px 0", fontSize: "12.5px", color: "var(--ink-soft)", lineHeight: 1.5 }}>{sop.deskripsi}</p>}
              <div style={{ fontSize: "11px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "5px" }}>
                <IconFileText size={13} /> {sop.file_name || "Dokumen"} • Diterbitkan {formatTanggal(sop.waktu_upload)}
              </div>
              <a href={sop.file_url} target="_blank" rel="noopener noreferrer" className="sop-open-btn">
                <IconFileText size={13} /> Buka Dokumen
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
