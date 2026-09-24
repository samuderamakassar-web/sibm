"use client";

/**
 * src/components/EvaluasiManualButton.tsx
 * ------------------------------------------------------------------
 * Tombol + modal "Evaluasi" -- dipasang Admin GA di baris laporan/inspeksi
 * APA PUN (Patroli Security, Checklist OB, Inspeksi Fasilitas, Log
 * Kendaraan Driver) lewat halaman monitoring yang sudah ada. Admin pilih
 * poin dari preset +/-5/10/15/20/25 dengan alasan, LANGSUNG mempengaruhi
 * total poin bulanan staf itu di `staff_points_bulanan` (dokumen yang SAMA
 * dipakai scripts/points-deduction.mjs).
 *
 * Field `riwayat[].potongan` dipertahankan APA ADANYA (bukan field baru)
 * biar gak perlu ubah scripts/points-deduction.mjs ATAU logika baca di
 * admin/monitor-poin -- cuma konvensinya diperluas: potongan POSITIF
 * (seperti sebelumnya) = pengurangan otomatis/manual, potongan NEGATIF
 * (BARU, cuma bisa dari sini) = penambahan/bonus manual.
 *
 * Setiap evaluasi JUGA dicatat di collection `evaluasi_manual` (audit
 * trail terpisah) DAN ditulis balik ke field `evaluasiManual` pada
 * dokumen SUMBERnya sendiri (`sumberCollection`/`sumberId`) -- field ini
 * yang dipakai halaman monitoring buat MENYEMBUNYIKAN tombol & ganti jadi
 * badge "Sudah Dievaluasi" begitu 1 laporan sudah pernah dievaluasi
 * (dikonfirmasi user: tombol gak boleh muncul lagi setelah dievaluasi).
 * ------------------------------------------------------------------
 */

import { useState } from "react";
import { collection, addDoc, doc, updateDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useToast } from "./ui/ToastProvider";

type IconProps = { size?: number; color?: string };
const IconStar = ({ size = 13, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8l-6.2 3.3 1.2-6.9-5-4.9 6.9-1z" /></svg>
);
const IconCheck = ({ size = 12, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);

const PRESET_POIN = [5, 10, 15, 20, 25];

function slugNama(nama: string): string {
  return nama.trim().replace(/\//g, "-");
}

export interface EvaluasiManualData {
  delta: number;
  alasan: string;
  dievaluasiOleh: string;
  waktu?: { toDate: () => Date } | null;
}

interface Props {
  nama: string;
  departemen: string;
  sumberJenis: string; // label buat audit trail, mis. "Patroli Security", "Checklist OB", "Inspeksi Fasilitas", "Log Kendaraan Driver"
  sumberCollection: string; // nama collection dokumen sumber -- dipakai nulis balik field evaluasiManual
  sumberId: string;
  tanggalLaporan: string; // "YYYY-MM-DD" -- nentuin bulan MANA yang kena pengaruh (bukan selalu bulan berjalan)
  dievaluasiOleh: string;
  evaluasiSebelumnya?: EvaluasiManualData | null; // kalau sudah ada, tampilkan badge -- bukan tombol
}

export default function EvaluasiManualButton({ nama, departemen, sumberJenis, sumberCollection, sumberId, tanggalLaporan, dievaluasiOleh, evaluasiSebelumnya }: Props) {
  const showToast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [arah, setArah] = useState<"plus" | "minus">("plus");
  const [delta, setDelta] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (delta === null) return showToast("Pilih jumlah poin dulu.", "warning");
    if (!alasan.trim()) return showToast("Isi alasan evaluasi dulu.", "warning");
    const jumlah = arah === "plus" ? delta : -delta;

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

      // Tulis balik ke dokumen sumbernya -- inilah yang bikin tombol gak muncul lagi & ganti jadi
      // badge di halaman monitoring (lihat baca field ini di monitor-security/monitor-ob/monitor-driver).
      await updateDoc(doc(db, sumberCollection, sumberId), {
        evaluasiManual: { delta: jumlah, alasan, dievaluasiOleh, waktu: serverTimestamp() },
      });

      showToast(`Evaluasi tersimpan: ${jumlah > 0 ? `+${jumlah}` : jumlah} poin untuk ${nama}.`, "success");
      setShowModal(false);
      setDelta(null);
      setAlasan("");
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan evaluasi.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (evaluasiSebelumnya) {
    const d = evaluasiSebelumnya.delta;
    return (
      <span title={evaluasiSebelumnya.alasan} style={{ background: d < 0 ? "var(--red-50, #fef2f2)" : "var(--ok-50, #f0fdf4)", color: d < 0 ? "var(--red-600, #dc2626)" : "var(--ok, #16a34a)", padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "5px" }}>
        <IconCheck size={11} /> {d > 0 ? `+${d}` : d}
      </span>
    );
  }

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

            <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
              <button type="button" onClick={() => setArah("plus")} style={{ flex: 1, padding: "9px", borderRadius: "10px", border: "1px solid " + (arah === "plus" ? "var(--ok, #16a34a)" : "#e7e5e4"), background: arah === "plus" ? "var(--ok-50, #f0fdf4)" : "#fff", color: arah === "plus" ? "var(--ok, #16a34a)" : "#71717a", fontWeight: 800, fontSize: "13px", cursor: "pointer" }}>
                + Tambah Poin
              </button>
              <button type="button" onClick={() => setArah("minus")} style={{ flex: 1, padding: "9px", borderRadius: "10px", border: "1px solid " + (arah === "minus" ? "var(--red-600, #dc2626)" : "#e7e5e4"), background: arah === "minus" ? "var(--red-50, #fef2f2)" : "#fff", color: arah === "minus" ? "var(--red-600, #dc2626)" : "#71717a", fontWeight: 800, fontSize: "13px", cursor: "pointer" }}>
                − Kurangi Poin
              </button>
            </div>

            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#3f3f46", marginBottom: "8px" }}>Jumlah Poin</label>
            <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
              {PRESET_POIN.map((p) => (
                <button
                  key={p} type="button" onClick={() => setDelta(p)}
                  style={{
                    flex: "1 1 50px", padding: "10px 0", borderRadius: "10px", fontWeight: 800, fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
                    border: "1px solid " + (delta === p ? (arah === "plus" ? "var(--ok, #16a34a)" : "var(--red-600, #dc2626)") : "#e7e5e4"),
                    background: delta === p ? (arah === "plus" ? "var(--ok, #16a34a)" : "var(--red-600, #dc2626)") : "#f7f6f5",
                    color: delta === p ? "#fff" : "#3f3f46",
                  }}
                >
                  {arah === "plus" ? "+" : "−"}{p}
                </button>
              ))}
            </div>

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
