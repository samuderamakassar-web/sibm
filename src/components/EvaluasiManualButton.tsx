"use client";

/**
 * src/components/EvaluasiManualButton.tsx
 * ------------------------------------------------------------------
 * Tombol + modal "Evaluasi" -- dipasang Admin GA di baris laporan/inspeksi
 * APA PUN (Patroli Security, Checklist OB, Inspeksi Fasilitas, Log
 * Kendaraan Driver) lewat halaman monitoring yang sudah ada. Admin kasih
 * poin +/- dengan alasan, LANGSUNG mempengaruhi total poin bulanan staf
 * itu di `staff_points_bulanan` (dokumen yang SAMA dipakai
 * scripts/points-deduction.mjs) -- desain dikonfirmasi user: "poin +/-
 * dengan alasan, ditambahkan ke total poin otomatis yang sudah ada".
 *
 * Field `riwayat[].potongan` dipertahankan APA ADANYA (bukan field baru)
 * biar gak perlu ubah scripts/points-deduction.mjs ATAU logika baca di
 * admin/monitor-poin -- cuma konvensinya diperluas: potongan POSITIF
 * (seperti sebelumnya) = pengurangan otomatis/manual, potongan NEGATIF
 * (BARU, cuma bisa dari sini) = penambahan/bonus manual. admin/monitor-poin
 * sudah disesuaikan buat nampilin tanda +/- yang benar.
 *
 * Setiap evaluasi JUGA dicatat di collection `evaluasi_manual` (audit
 * trail terpisah, nunjuk balik ke laporan sumbernya) -- staff_points_bulanan
 * cuma nyimpen TOTAL, evaluasi_manual nyimpen SIAPA nge-evaluasi APA kapan.
 * ------------------------------------------------------------------
 */

import { useState } from "react";
import { collection, addDoc, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useToast } from "./ui/ToastProvider";

type IconProps = { size?: number; color?: string };
const IconStar = ({ size = 13, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8l-6.2 3.3 1.2-6.9-5-4.9 6.9-1z" /></svg>
);

function slugNama(nama: string): string {
  return nama.trim().replace(/\//g, "-");
}

interface Props {
  nama: string;
  departemen: string;
  sumberJenis: string; // label buat audit trail, mis. "Patroli Security", "Checklist OB", "Inspeksi Fasilitas", "Log Kendaraan Driver"
  sumberId: string;
  tanggalLaporan: string; // "YYYY-MM-DD" -- nentuin bulan MANA yang kena pengaruh (bukan selalu bulan berjalan)
  dievaluasiOleh: string;
}

export default function EvaluasiManualButton({ nama, departemen, sumberJenis, sumberId, tanggalLaporan, dievaluasiOleh }: Props) {
  const showToast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [delta, setDelta] = useState("");
  const [alasan, setAlasan] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    const jumlah = Number(delta);
    if (!delta.trim() || !Number.isFinite(jumlah) || jumlah === 0) {
      return showToast("Isi jumlah poin dulu (boleh negatif, contoh: 5 atau -10).", "warning");
    }
    if (!alasan.trim()) return showToast("Isi alasan evaluasi dulu.", "warning");

    setIsSaving(true);
    try {
      const bulanKey = (tanggalLaporan || "").substring(0, 7) || new Date().toISOString().substring(0, 7);
      const docId = `${bulanKey}_${slugNama(nama)}`;
      const ref = doc(db, "staff_points_bulanan", docId);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const poinSekarang = snap.exists() ? (snap.data().poin as number) : 100;
        const poinBaru = Math.max(0, Math.min(100, poinSekarang + jumlah));
        // potongan NEGATIF = tambahan (lihat catatan di atas file).
        const entriRiwayat = { tanggal: tanggalLaporan, alasan: `[Evaluasi Manual oleh ${dievaluasiOleh}] ${alasan}`, potongan: -jumlah };
        if (snap.exists()) {
          tx.update(ref, { poin: poinBaru, riwayat: [...(snap.data().riwayat || []), entriRiwayat] });
        } else {
          tx.set(ref, { nama, departemen, bulan: bulanKey, poin: poinBaru, riwayat: [entriRiwayat] });
        }
      });

      await addDoc(collection(db, "evaluasi_manual"), {
        nama, departemen, sumberJenis, sumberId, tanggalLaporan, delta: jumlah, alasan, dievaluasiOleh, waktu: serverTimestamp(),
      });

      showToast(`Evaluasi tersimpan: ${jumlah > 0 ? `+${jumlah}` : jumlah} poin untuk ${nama}.`, "success");
      setShowModal(false);
      setDelta("");
      setAlasan("");
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan evaluasi.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{ background: "#f5f3ff", color: "var(--accent, #7c3aed)", border: "1px solid rgba(124,58,237,0.25)", padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: "inherit" }}
      >
        <IconStar size={12} /> Evaluasi
      </button>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => !isSaving && setShowModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "18px", maxWidth: "380px", width: "100%", padding: "24px 22px", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "15.5px", fontWeight: 800, color: "#18181b" }}>Evaluasi: {nama}</h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#71717a" }}>{sumberJenis} &middot; {tanggalLaporan}</p>

            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#3f3f46", marginBottom: "6px" }}>Poin (boleh negatif untuk pengurangan)</label>
            <input
              type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="Contoh: 5 atau -10"
              style={{ width: "100%", padding: "11px 12px", borderRadius: "10px", border: "1px solid #e7e5e4", fontSize: "14px", marginBottom: "14px", boxSizing: "border-box", fontFamily: "inherit" }}
            />

            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#3f3f46", marginBottom: "6px" }}>Alasan *</label>
            <textarea
              value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: Laporan sangat rapi dan detail, atau: Foto bukti tidak jelas berulang kali."
              style={{ width: "100%", minHeight: "70px", padding: "11px 12px", borderRadius: "10px", border: "1px solid #e7e5e4", fontSize: "13px", resize: "vertical", marginBottom: "18px", boxSizing: "border-box", fontFamily: "inherit" }}
            />

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowModal(false)} disabled={isSaving} style={{ flex: 1, padding: "12px", background: "#f7f6f5", color: "#3f3f46", border: "1px solid #e7e5e4", borderRadius: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={handleSubmit} disabled={isSaving} style={{ flex: 2, padding: "12px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "10px", fontWeight: 700, fontSize: "13px", cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.6 : 1 }}>
                {isSaving ? "Menyimpan..." : "Simpan Evaluasi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
