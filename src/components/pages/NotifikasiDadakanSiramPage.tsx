"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { useToast } from "../ui/ToastProvider";
import { waktuWITASekarang } from "../../lib/shift";
import { handleFotoUpload } from "../../lib/uploadFoto";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan halaman Security lainnya
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconDroplet = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z" /></svg>
);
const IconCamera = ({ size = 16, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A1.5 1.5 0 0 1 9.5 3.6h5a1.5 1.5 0 0 1 1.3.8L17 6h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const IconCheck = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);

// ==========================================
// JENDELA NOTIFIKASI DADAKAN — Pagi 06:00-07:00 & Malam 20:00-22:00 WITA, tiap hari
// (dulu titik patroli weekend-only "Pantry Siram Weekend" -- dipindah kesini atas
// permintaan user, jadi notifikasi terpisah yang wajib foto bukti, bukan lagi bagian
// checklist patroli rutin). Duplikasi jendela jam ini juga ada di
// scripts/security-tugas-reminder.mjs (push notification-nya) -- kalau jendela diubah,
// ubah juga di sana.
// ==========================================
type Jendela = "Pagi" | "Malam";

function jendelaAktifSekarang(now: Date): Jendela | null {
  const menit = now.getHours() * 60 + now.getMinutes();
  const toWaktu = (h: number, m: number) => h * 60 + m;
  if (menit >= toWaktu(6, 0) && menit < toWaktu(7, 0)) return "Pagi";
  if (menit >= toWaktu(20, 0) && menit < toWaktu(22, 0)) return "Malam";
  return null;
}

function formatTanggalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

interface StatusSiram {
  petugas: string;
  foto_url: string;
  waktu_upload: string;
}

export default function NotifikasiDadakanSiramPage() {
  const router = useRouter();
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({
    depts: ["Security"],
    adminBypass: false,
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Security.",
  });
  const picName = session?.nama || "";

  const [now, setNow] = useState<Date>(() => waktuWITASekarang());
  useEffect(() => {
    const t = setInterval(() => setNow(waktuWITASekarang()), 30000);
    return () => clearInterval(t);
  }, []);

  const jendela = jendelaAktifSekarang(now);
  const tanggalISO = formatTanggalISO(now);
  const docId = jendela ? `${tanggalISO}_${jendela}` : null;

  const [statusHariIni, setStatusHariIni] = useState<StatusSiram | null | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!docId) {
      const t = setTimeout(() => setStatusHariIni(null), 0);
      return () => clearTimeout(t);
    }
    let batal = false;
    (async () => {
      const snap = await getDoc(doc(db, "notifikasi_dadakan_siram", docId));
      if (batal) return;
      if (snap.exists()) {
        const data = snap.data();
        setStatusHariIni({ petugas: data.petugas, foto_url: data.foto_url, waktu_upload: data.waktu_upload_label || "" });
      } else {
        setStatusHariIni(null);
      }
    })();
    return () => { batal = true; };
  }, [docId]);

  const handlePilihFoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !docId || !jendela) return;
    handleFotoUpload(
      file,
      "notifikasi_dadakan",
      () => setIsUploading(true),
      async (url) => {
        try {
          const label = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" }).format(new Date());
          await setDoc(doc(db, "notifikasi_dadakan_siram", docId), {
            tanggal: tanggalISO,
            jendela,
            petugas: picName,
            foto_url: url,
            waktu_upload_label: label,
            dibuat_pada: serverTimestamp(),
          });
          setStatusHariIni({ petugas: picName, foto_url: url, waktu_upload: label });
          showToast("Bukti siram tanaman berhasil dikirim. Terima kasih!", "success");
        } catch (err) {
          console.error(err);
          showToast("Gagal menyimpan bukti, coba lagi.", "error");
        }
      },
      (err) => { console.error(err); showToast("Gagal upload foto.", "error"); },
      () => setIsUploading(false)
    );
    e.target.value = "";
  };

  if (!isReady) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", paddingBottom: "40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px" }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}><IconArrowLeft /></button>
        <h1 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--ink)" }}>Notifikasi Dadakan: Siram Tanaman</h1>
      </div>
      <div style={{ padding: "0 20px" }}>
        {!jendela ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "16px" }}>
            <IconDroplet size={36} />
            <div style={{ marginTop: "10px", fontWeight: 700, color: "var(--ink)" }}>Belum Waktunya</div>
            <div style={{ fontSize: "12.5px", marginTop: "4px" }}>Menu ini hanya aktif di jendela Pagi (06:00-07:00) dan Malam (20:00-22:00) WITA.</div>
          </div>
        ) : statusHariIni === undefined ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</div>
        ) : statusHariIni ? (
          <div style={{ textAlign: "center", padding: "24px", border: "1px solid var(--line)", borderRadius: "16px" }}>
            <IconCheck size={32} color="var(--ok)" />
            <div style={{ marginTop: "10px", fontWeight: 700, color: "var(--ink)" }}>Sudah Diselesaikan</div>
            <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "4px" }}>Oleh {statusHariIni.petugas} pukul {statusHariIni.waktu_upload} WITA (jendela {jendela})</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={statusHariIni.foto_url} alt="Bukti siram tanaman" style={{ maxWidth: "100%", borderRadius: "12px", marginTop: "14px" }} />
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "24px", border: "1px dashed var(--line)", borderRadius: "16px" }}>
            <IconDroplet size={36} />
            <div style={{ marginTop: "10px", fontWeight: 700, color: "var(--ink)" }}>Jendela {jendela} Aktif</div>
            <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "4px" }}>Siram tanaman & upload foto bukti sekarang.</div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginTop: "16px", padding: "12px 22px", background: "var(--ok)", color: "#fff", borderRadius: "12px", fontWeight: 700, cursor: "pointer", opacity: isUploading ? 0.6 : 1 }}>
              <IconCamera color="#fff" /> {isUploading ? "Mengupload..." : "Upload Foto Bukti"}
              <input type="file" accept="image/*" capture="environment" onChange={handlePilihFoto} disabled={isUploading} style={{ display: "none" }} />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
