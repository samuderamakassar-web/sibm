"use client";

/**
 * src/components/pages/TukarShiftSecurityPage.tsx
 * ------------------------------------------------------------------
 * Serah Terima Shift Security via QR: petugas yang SELESAI jaga generate
 * QR (disimpan sebagai dokumen "menunggu_scan" di security_shift_handover),
 * petugas PENGGANTI scan QR itu buat konfirmasi serah terima diterima.
 * Status ditampilkan juga di dashboard utama Security (dashboard/security/page.tsx).
 * ------------------------------------------------------------------
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, doc, getDoc, updateDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp, Timestamp } from "firebase/firestore";
import { Html5QrcodeScanner } from "html5-qrcode";
import { db } from "../../lib/firebase";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { useToast } from "../ui/ToastProvider";
import { hitungShiftSesi, waktuWITASekarang, dalamJendelaTukarJaga, menitSejakBatasShift, AMBANG_TELAT_SERAH_TERIMA_MENIT, TOLERANSI_JENDELA_TUKAR_JAGA_MENIT, ShiftLabel } from "../../lib/shift";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconQrCode = ({ size = 36, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2" /></svg>
);
const IconCheckCircle = ({ size = 36, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
);

interface HandoverDoc {
  id: string;
  tanggal_shift: string;
  shift: ShiftLabel;
  petugas_keluar: string;
  petugas_masuk: string | null;
  status: "menunggu_scan" | "selesai";
  waktu_generate: Timestamp | null;
  waktu_scan: Timestamp | null;
  terlambat?: boolean;
  menit_terlambat?: number | null;
  alasan_telat?: string | null;
}

function formatJam(ts: Timestamp | null): string {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" }).format(ts.toDate()) + " WITA";
}

export default function TukarShiftSecurityPage() {
  const router = useRouter();
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({
    depts: ["Security"],
    adminBypass: false,
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Security.",
  });
  const myName = session?.nama || "";

  const [info, setInfo] = useState(() => hitungShiftSesi(waktuWITASekarang()));
  // Membuat QR serah terima cuma boleh PAS jam pergantian shift (08:00/20:00 WITA, +toleransi) --
  // di luar jendela ini, tanggal_shift/shift yang tersimpan di dokumen bisa gak sinkron dengan yang
  // dihitung petugas pengganti begitu jamnya BENERAN ganti (lihat dalamJendelaTukarJaga() di lib/shift.ts).
  const [bolehBuatQR, setBolehBuatQR] = useState(() => dalamJendelaTukarJaga(waktuWITASekarang()));
  useEffect(() => {
    const t = setInterval(() => {
      const now = waktuWITASekarang();
      setInfo(hitungShiftSesi(now));
      setBolehBuatQR(dalamJendelaTukarJaga(now));
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const [handover, setHandover] = useState<HandoverDoc | null | undefined>(undefined);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Kalau QR discan LEBIH DARI AMBANG_TELAT_SERAH_TERIMA_MENIT sejak jam pergantian shift,
  // wajib isi alasan dulu sebelum serah terima beneran ditandai selesai (permintaan user: butuh
  // rekap siapa telat kapan & kenapa, bukan cuma tau ADA yang telat lewat eskalasi extend).
  const [showAlasanTelat, setShowAlasanTelat] = useState(false);
  const [menitTerlambatPending, setMenitTerlambatPending] = useState(0);
  const [alasanTelat, setAlasanTelat] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, "security_shift_handover"),
        where("tanggal_shift", "==", info.tanggal_shift),
        where("shift", "==", info.shift),
        orderBy("waktu_generate", "desc"),
        limit(1)
      ),
      (snap) => {
        setHandover(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as HandoverDoc));
      }
    );
    return () => unsub();
  }, [info.tanggal_shift, info.shift]);

  const handleMulaiSerahTerima = async () => {
    if (!myName) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, "security_shift_handover"), {
        tanggal_shift: info.tanggal_shift,
        shift: info.shift,
        petugas_keluar: myName,
        petugas_masuk: null,
        status: "menunggu_scan",
        waktu_generate: serverTimestamp(),
        waktu_scan: null,
      });
    } catch (err) {
      console.error(err);
      showToast("Gagal membuat serah terima, coba lagi.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const selesaikanHandover = async (handoverDoc: HandoverDoc, menitTerlambat: number, alasan: string | null) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "security_shift_handover", handoverDoc.id), {
        petugas_masuk: myName,
        status: "selesai",
        waktu_scan: serverTimestamp(),
        terlambat: menitTerlambat > AMBANG_TELAT_SERAH_TERIMA_MENIT,
        menit_terlambat: menitTerlambat > AMBANG_TELAT_SERAH_TERIMA_MENIT ? menitTerlambat : null,
        alasan_telat: menitTerlambat > AMBANG_TELAT_SERAH_TERIMA_MENIT ? alasan : null,
        // Dibaca & di-set true oleh scripts/shift-handover-escalation.mjs setelah kirim
        // notifikasi (push+email) keterlambatan ke Admin GA -- lihat catatan di sana.
        notif_terlambat_terkirim: false,
      });
      showToast("Serah terima berhasil dikonfirmasi!", "success");
      // Kalau sebelumnya sempat telat & ada entri security_shift_extend aktif (lihat
      // EskalasiShiftModal.tsx / scripts/shift-handover-escalation.mjs), tutup otomatis --
      // "distop begitu tukar jaga beneran terjadi" (dikonfirmasi user). Cron juga punya
      // safety net yang sama kalau langkah ini somehow gagal.
      const extendId = `${handoverDoc.tanggal_shift}_${handoverDoc.shift.replace(" ", "")}`;
      const extendSnap = await getDoc(doc(db, "security_shift_extend", extendId));
      if (extendSnap.exists() && extendSnap.data().status !== "selesai") {
        await updateDoc(doc(db, "security_shift_extend", extendId), {
          status: "selesai", selesai_pada: serverTimestamp(), catatan_selesai: "Serah terima QR resmi selesai",
        }).catch(() => {});
      }
      setShowAlasanTelat(false);
      setAlasanTelat("");
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan konfirmasi, coba lagi.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isScanning || !handover) return;
    const scanner = new Html5QrcodeScanner("reader-handover", { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }, false);
    scanner.render((decodedText) => {
      if (decodedText.trim() !== handover.id) {
        showToast("QR tidak cocok dengan serah terima yang sedang berlangsung.", "warning");
        return;
      }
      scanner.clear().catch(() => {});
      setIsScanning(false);
      const menitTerlambat = menitSejakBatasShift(waktuWITASekarang());
      if (menitTerlambat > AMBANG_TELAT_SERAH_TERIMA_MENIT) {
        // Jangan langsung selesaikan -- minta alasan dulu lewat modal di bawah.
        setMenitTerlambatPending(menitTerlambat);
        setShowAlasanTelat(true);
      } else {
        selesaikanHandover(handover, menitTerlambat, null);
      }
    }, () => {});

    return () => { scanner.clear().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  if (!isReady || handover === undefined) return null;

  const sayaPetugasKeluar = !!handover && handover.petugas_keluar === myName;
  const qrUrl = handover && handover.status === "menunggu_scan"
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(handover.id)}`
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f7f6f5)", paddingBottom: "40px" }}>
      <style dangerouslySetInnerHTML={{ __html: `:root { --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4; --bg: #f7f6f5; --surface: #ffffff; --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff; --warn: #d97706; --warn-50: #fff7ed; }` }} />
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px" }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}><IconArrowLeft /></button>
        <h1 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--ink)" }}>Tukar Shift / Jaga</h1>
      </div>

      <div style={{ padding: "0 20px", maxWidth: "460px", margin: "0 auto" }}>
        <div style={{ background: "var(--surface)", borderRadius: "16px", padding: "14px 18px", marginBottom: "16px", border: "1px solid var(--line)", textAlign: "center" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>{info.shift} &middot; {info.tanggal_shift}</div>
        </div>

        {!handover ? (
          <div style={{ textAlign: "center", padding: "30px 20px", background: "var(--surface)", borderRadius: "18px", border: "1px dashed var(--line)" }}>
            <div style={{ color: "var(--muted)", marginBottom: "12px" }}><IconQrCode size={40} /></div>
            {bolehBuatQR ? (
              <>
                <h3 style={{ margin: "0 0 8px 0", color: "var(--ink)" }}>Belum Ada Serah Terima</h3>
                <p style={{ color: "var(--muted)", fontSize: "13px", lineHeight: 1.6, margin: "0 0 18px 0" }}>
                  Kalau Anda sudah selesai jaga, tekan tombol di bawah untuk membuat QR serah terima, lalu tunjukkan ke petugas pengganti untuk discan.
                </p>
                <button
                  onClick={handleMulaiSerahTerima} disabled={isSaving}
                  style={{ padding: "13px 22px", background: "var(--info)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.6 : 1 }}
                >
                  {isSaving ? "Membuat..." : "🔄 Selesai Jaga — Buat QR Serah Terima"}
                </button>
              </>
            ) : (
              <>
                <h3 style={{ margin: "0 0 8px 0", color: "var(--ink)" }}>Belum Waktunya Serah Terima</h3>
                <p style={{ color: "var(--muted)", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
                  QR serah terima cuma bisa dibuat pas jam pergantian shift: <b>08:00</b> atau <b>20:00 WITA</b> (sampai {TOLERANSI_JENDELA_TUKAR_JAGA_MENIT} menit sesudahnya). Silakan kembali lagi nanti pas jam segitu.
                </p>
              </>
            )}
          </div>
        ) : handover.status === "menunggu_scan" ? (
          sayaPetugasKeluar ? (
            <div style={{ textAlign: "center", padding: "24px 20px", background: "var(--surface)", borderRadius: "18px", border: "1px solid var(--line)" }}>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--warn)", marginBottom: "12px" }}>⏳ Menunggu Discan Petugas Pengganti</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR Serah Terima" style={{ width: "220px", height: "220px", margin: "0 auto", display: "block", borderRadius: "12px", border: "1px solid var(--line)" }} />
              <p style={{ color: "var(--muted)", fontSize: "12.5px", marginTop: "14px" }}>Tunjukkan QR ini ke petugas pengganti untuk discan dari halaman Tukar Shift mereka.</p>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 20px", background: "var(--surface)", borderRadius: "18px", border: "1px solid var(--line)" }}>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--info)", marginBottom: "12px" }}>📷 {handover.petugas_keluar} sudah selesai jaga</div>
              <p style={{ color: "var(--muted)", fontSize: "12.5px", marginBottom: "16px" }}>Scan QR dari layar HP {handover.petugas_keluar} untuk konfirmasi Anda menerima serah terima jaga.</p>
              {!isScanning ? (
                <button onClick={() => setIsScanning(true)} style={{ padding: "13px 22px", background: "var(--info)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>
                  📷 Scan Sekarang
                </button>
              ) : (
                <div id="reader-handover" style={{ maxWidth: "300px", margin: "0 auto" }} />
              )}
            </div>
          )
        ) : (
          <div style={{ textAlign: "center", padding: "24px 20px", background: "var(--ok-50)", borderRadius: "18px", border: "1px solid rgba(22,163,74,0.25)" }}>
            <div style={{ color: "var(--ok)", marginBottom: "10px" }}><IconCheckCircle /></div>
            <h3 style={{ margin: "0 0 6px 0", color: "var(--ok)" }}>Serah Terima Selesai</h3>
            <p style={{ color: "var(--ink-soft)", fontSize: "13px", margin: 0 }}>
              {handover.petugas_keluar} &rarr; {handover.petugas_masuk}<br />
              {formatJam(handover.waktu_scan)}
            </p>
            {bolehBuatQR && (
              <button
                onClick={handleMulaiSerahTerima} disabled={isSaving}
                style={{ marginTop: "16px", padding: "10px 18px", background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)", borderRadius: "10px", fontWeight: 700, fontSize: "12.5px", cursor: isSaving ? "not-allowed" : "pointer" }}
              >
                Mulai Serah Terima Baru
              </button>
            )}
          </div>
        )}
      </div>

      {showAlasanTelat && handover && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "18px", maxWidth: "400px", width: "100%", padding: "24px 22px", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: "30px", textAlign: "center", marginBottom: "6px" }}>⏰</div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 800, color: "var(--ink)", textAlign: "center" }}>Serah Terima Terlambat</h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "12.5px", color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}>
              Scan ini {menitTerlambatPending} menit setelah jam pergantian shift. Mohon isi alasan keterlambatan — dicatat untuk rekap bulanan Admin GA.
            </p>
            <textarea
              value={alasanTelat} onChange={(e) => setAlasanTelat(e.target.value)}
              placeholder="Cth: Macet di jalan, petugas sebelumnya masih di lokasi lain, dll."
              style={{ width: "100%", minHeight: "80px", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", resize: "vertical", marginBottom: "16px", boxSizing: "border-box", fontFamily: "inherit" }}
            />
            <button
              onClick={() => {
                if (!alasanTelat.trim()) return showToast("Isi alasan keterlambatan dulu.", "warning");
                selesaikanHandover(handover, menitTerlambatPending, alasanTelat.trim());
              }}
              disabled={isSaving}
              style={{ width: "100%", padding: "13px", background: "var(--info)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.6 : 1 }}
            >
              {isSaving ? "Menyimpan..." : "Kirim & Selesaikan Serah Terima"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
