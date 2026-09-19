"use client";

/**
 * src/components/EskalasiShiftModal.tsx
 * ------------------------------------------------------------------
 * Modal keputusan yang muncul kalau serah terima shift Security telat >10 menit (dipicu
 * scripts/shift-handover-escalation.mjs, yang menulis notifikasi_personal berjenis
 * "keputusan_extend_shift" + doc security_shift_extend). 2 pilihan (dikonfirmasi user):
 *   - "Lanjut Jaga (Extend)": permanen, roster langsung ditandai EXTEND atas nama Anda.
 *   - "Lanjut Sementara": nunggu personil pengganti datang, boleh isi estimasi menit --
 *     kalau belum juga tukar jaga beneran, script cron ingetin lagi.
 * Dipasang di dashboard/security/page.tsx (halaman utama Security), BUKAN di semua
 * subhalaman -- staf yang lagi di tengah patroli/dll akan lihatnya begitu balik ke halaman
 * utama, sambil push notification tetap mengingatkan mereka buka app.
 * ------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, getDocs, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

interface NotifKeputusan {
  id: string;
  judul: string;
  pesan: string;
  refId: string;
  waktu: Timestamp | null;
}

export default function EskalasiShiftModal({ picName }: { picName: string }) {
  const [notifAktif, setNotifAktif] = useState<NotifKeputusan | null>(null);
  const [showEstimasi, setShowEstimasi] = useState(false);
  const [estimasiMenit, setEstimasiMenit] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!picName) return;
    const unsub = onSnapshot(
      query(
        collection(db, "notifikasi_personal"),
        where("untukNama", "==", picName),
        where("dibaca", "==", false),
        where("jenis", "==", "keputusan_extend_shift"),
        orderBy("waktu", "desc"),
        limit(1)
      ),
      (snap) => {
        if (snap.empty) { setNotifAktif(null); return; }
        const d = snap.docs[0];
        setNotifAktif({ id: d.id, ...d.data() } as NotifKeputusan);
      }
    );
    return () => unsub();
  }, [picName]);

  // Sekali diputuskan (siapa pun yang klik duluan), semua notif "keputusan_extend_shift" LAIN
  // yang merujuk refId yang sama (dikirim ke beberapa petugas sekaligus) ikut ditandai dibaca --
  // supaya modal ini gak nongol lagi buat rekan lain yang sama-sama dapat notif.
  async function tutupNotifTerkait(refId: string, kecualiId: string) {
    const snap = await getDocs(query(collection(db, "notifikasi_personal"), where("refId", "==", refId), where("dibaca", "==", false)));
    await Promise.all(snap.docs.filter((d) => d.id !== kecualiId).map((d) => updateDoc(doc(db, "notifikasi_personal", d.id), { dibaca: true })));
  }

  async function handleExtendPermanen() {
    if (!notifAktif) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "security_shift_extend", notifAktif.refId), {
        status: "permanen",
        tipe: "permanen",
        personil_extend: picName,
        keputusan_pada: serverTimestamp(),
      });
      await updateDoc(doc(db, "notifikasi_personal", notifAktif.id), { dibaca: true });
      await tutupNotifTerkait(notifAktif.refId, notifAktif.id);
      setNotifAktif(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLanjutSementara() {
    if (!notifAktif) return;
    setIsSaving(true);
    try {
      const estimasi = estimasiMenit.trim() ? parseInt(estimasiMenit, 10) : null;
      await updateDoc(doc(db, "security_shift_extend", notifAktif.refId), {
        status: "aktif",
        tipe: "sementara",
        personil_extend: picName,
        estimasi_menit: Number.isFinite(estimasi) ? estimasi : null,
        keputusan_pada: serverTimestamp(),
      });
      await updateDoc(doc(db, "notifikasi_personal", notifAktif.id), { dibaca: true });
      await tutupNotifTerkait(notifAktif.refId, notifAktif.id);
      setNotifAktif(null);
      setShowEstimasi(false);
      setEstimasiMenit("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  if (!notifAktif) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", backdropFilter: "blur(3px)" }}>
      <div style={{ background: "#fff", borderRadius: "18px", maxWidth: "420px", width: "100%", padding: "26px 22px", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontSize: "34px", textAlign: "center", marginBottom: "6px" }}>⚠️</div>
        <h2 style={{ margin: "0 0 10px 0", fontSize: "16.5px", fontWeight: 800, color: "#18181b", textAlign: "center" }}>{notifAktif.judul}</h2>
        <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#3f3f46", lineHeight: 1.6, textAlign: "center" }}>{notifAktif.pesan}</p>

        {!showEstimasi ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              onClick={handleExtendPermanen} disabled={isSaving}
              style={{ padding: "13px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "13.5px", cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.6 : 1 }}
            >
              🔄 Lanjut Jaga (Extend) — Gantikan yang Izin/Sakit
            </button>
            <button
              onClick={() => setShowEstimasi(true)} disabled={isSaving}
              style={{ padding: "13px", background: "#f7f6f5", color: "#3f3f46", border: "1px solid #e7e5e4", borderRadius: "12px", fontWeight: 700, fontSize: "13.5px", cursor: isSaving ? "not-allowed" : "pointer" }}
            >
              ⏳ Lanjut Sementara — Tunggu Personil Datang
            </button>
          </div>
        ) : (
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#3f3f46", marginBottom: "6px" }}>Estimasi menunggu (menit, opsional)</label>
            <input
              type="number" min={1} value={estimasiMenit} onChange={(e) => setEstimasiMenit(e.target.value)}
              placeholder="Kosongkan kalau belum tahu"
              style={{ width: "100%", padding: "11px", borderRadius: "10px", border: "1px solid #e7e5e4", fontSize: "13.5px", marginBottom: "14px", boxSizing: "border-box", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowEstimasi(false)} disabled={isSaving} style={{ flex: 1, padding: "12px", background: "#f7f6f5", color: "#3f3f46", border: "1px solid #e7e5e4", borderRadius: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={handleLanjutSementara} disabled={isSaving} style={{ flex: 2, padding: "12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "10px", fontWeight: 700, fontSize: "13px", cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.6 : 1 }}>
                {isSaving ? "Menyimpan..." : "Konfirmasi"}
              </button>
            </div>
          </div>
        )}
        <p style={{ margin: "16px 0 0 0", fontSize: "10.5px", color: "#a1a1aa", textAlign: "center", lineHeight: 1.5 }}>
          Begitu Anda scan/discan QR serah terima resmi, ini otomatis dianggap selesai.
        </p>
      </div>
    </div>
  );
}
