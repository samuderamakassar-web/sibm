"use client";

/**
 * src/components/AbsensiCard.tsx
 * ------------------------------------------------------------------
 * Widget Absensi Check-in/Check-out -- 1 dokumen per orang per hari di
 * `attendance_logs`, id = `${tanggal}_${slug(nama)}` (pola composite ID
 * yang sama seperti notifikasi_dadakan_siram/{tanggal}_{jendela}).
 *
 * Dipasang di halaman home tiap dashboard (OB, Security, Driver, QHSE,
 * Admin GA) -- selalu tampil (bukan modal) supaya beneran kepakai tiap
 * hari, bukan fitur yang gampang kelupaan.
 * ------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { tanggalISOWITASekarang } from "../lib/shift";
import { useToast } from "./ui/ToastProvider";

interface AbsensiDoc {
  nama: string;
  departemen: string;
  tanggal: string;
  waktu_checkin: Timestamp | null;
  waktu_checkout: Timestamp | null;
}

// Nama karyawan gak pernah mengandung "/" dalam praktiknya, tapi tetap dijaga -- "/" di doc ID
// Firestore akan dibaca sebagai pemisah path subcollection kalau tidak dibersihkan.
function slugNama(nama: string): string {
  return nama.trim().replace(/\//g, "-");
}

function formatJam(ts: Timestamp | null | undefined): string {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" }).format(ts.toDate()) + " WITA";
}

interface AbsensiCardProps {
  picName: string;
  departemen: string;
}

export default function AbsensiCard({ picName, departemen }: AbsensiCardProps) {
  const showToast = useToast();
  const [data, setData] = useState<AbsensiDoc | null | undefined>(undefined); // undefined = masih loading
  const [isSaving, setIsSaving] = useState(false);
  const tanggal = tanggalISOWITASekarang();
  const docId = picName ? `${tanggal}_${slugNama(picName)}` : null;

  useEffect(() => {
    if (!docId) {
      const t = setTimeout(() => setData(null), 0);
      return () => clearTimeout(t);
    }
    const unsub = onSnapshot(doc(db, "attendance_logs", docId), (snap) => {
      setData(snap.exists() ? (snap.data() as AbsensiDoc) : null);
    });
    return () => unsub();
  }, [docId]);

  const handleCheckIn = async () => {
    if (!docId || !picName) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, "attendance_logs", docId), {
        nama: picName,
        departemen,
        tanggal,
        waktu_checkin: serverTimestamp(),
        waktu_checkout: null,
      });
      showToast("Absen masuk berhasil dicatat. Selamat bekerja!", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal mencatat absen masuk, coba lagi.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckOut = async () => {
    if (!docId || !picName) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, "attendance_logs", docId), { waktu_checkout: serverTimestamp() }, { merge: true });
      showToast("Absen pulang berhasil dicatat. Terima kasih atas kerja hari ini!", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal mencatat absen pulang, coba lagi.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (data === undefined || !picName) return null; // masih loading / belum ada sesi, jangan flicker

  const sudahCheckin = !!data?.waktu_checkin;
  const sudahCheckout = !!data?.waktu_checkout;

  return (
    <div style={{
      background: sudahCheckout ? "var(--ok-50, #f0fdf4)" : "var(--surface, #ffffff)",
      border: "1px solid var(--line, #e7e5e4)", borderRadius: "18px", padding: "16px 18px", marginBottom: "16px",
      display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap",
    }}>
      <div style={{ flex: "1 1 180px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--muted, #71717a)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Absensi Hari Ini</div>
        <div style={{ fontSize: "13px", color: "var(--ink-soft, #3f3f46)", marginTop: "4px" }}>
          Masuk: <strong>{formatJam(data?.waktu_checkin)}</strong> &middot; Pulang: <strong>{formatJam(data?.waktu_checkout)}</strong>
        </div>
      </div>
      {!sudahCheckin ? (
        <button
          onClick={handleCheckIn} disabled={isSaving}
          style={{ padding: "10px 18px", background: "var(--ok, #16a34a)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "13px", cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? "Menyimpan..." : "✅ Absen Masuk"}
        </button>
      ) : !sudahCheckout ? (
        <button
          onClick={handleCheckOut} disabled={isSaving}
          style={{ padding: "10px 18px", background: "var(--warn, #d97706)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "13px", cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? "Menyimpan..." : "🚪 Absen Pulang"}
        </button>
      ) : (
        <span style={{ padding: "8px 14px", background: "var(--ok, #16a34a)", color: "#fff", borderRadius: "12px", fontWeight: 700, fontSize: "12px" }}>Selesai ✓</span>
      )}
    </div>
  );
}
