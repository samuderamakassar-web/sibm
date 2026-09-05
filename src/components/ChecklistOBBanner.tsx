"use client";

/**
 * src/components/ChecklistOBBanner.tsx
 * ------------------------------------------------------------------
 * Banner pengingat PERSISTEN untuk checklist kebersihan OB/CS. Memakai
 * sumber data yang SAMA dengan scripts/checklist-reminder.mjs (bukan
 * flag notif "dibaca"): baca penugasan area hari ini dari
 * daily_plots/{tanggal}.plot_lantai, lalu cek apakah ada laporan
 * ob_checklists dalam JAM_TOLERANSI_MS (3 jam) terakhir untuk nama ini.
 * Kalau belum, banner tetap tampil (bisa disembunyikan sementara, tapi
 * muncul lagi tiap kali dicek ulang) sampai ada laporan baru.
 *
 * Dipasang di src/app/dashboard/ob/layout.tsx.
 * ------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { collection, doc, getDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { usePendingTask } from "../hooks/usePendingTask";
import StickyBanner from "./ui/StickyBanner";

const JAM_TOLERANSI_MS = 3 * 60 * 60 * 1000;

function tanggalWITAHariIni(): string {
  const now = new Date();
  const wita = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return wita.toISOString().split("T")[0];
}

// OB & CS tidak ada jadwal di akhir pekan -- jangan pernah picu reminder di
// Sabtu/Minggu, apa pun isi dokumen daily_plots-nya (bisa saja masih nyimpan
// data lama, atau memang diisi manual buat kebutuhan khusus).
function isWeekend(tanggalISO: string): boolean {
  const hari = new Date(tanggalISO + "T00:00:00").getDay();
  return hari === 0 || hari === 6;
}

interface ChecklistDoc {
  waktu_selesai?: Timestamp;
}

export default function ChecklistOBBanner() {
  const [picName, setPicName] = useState("");
  const [areaTugas, setAreaTugas] = useState<string[] | null>(null);
  const tanggal = tanggalWITAHariIni();

  useEffect(() => {
    const t = setTimeout(() => setPicName(localStorage.getItem("pic_nama") || ""), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!picName) {
      const t = setTimeout(() => setAreaTugas(null), 0);
      return () => clearTimeout(t);
    }
    if (isWeekend(tanggal)) {
      const t = setTimeout(() => setAreaTugas([]), 0);
      return () => clearTimeout(t);
    }
    let dibatalkan = false;
    getDoc(doc(db, "daily_plots", tanggal))
      .then((snap) => {
        if (dibatalkan) return;
        const plotLantai: Record<string, string> = snap.exists() ? snap.data().plot_lantai || {} : {};
        const area = Object.entries(plotLantai)
          .filter(([, nama]) => nama === picName)
          .map(([areaKey]) => areaKey);
        setAreaTugas(area);
      })
      .catch(() => setAreaTugas([]));
    return () => { dibatalkan = true; };
  }, [picName, tanggal]);

  const { pending, loading } = usePendingTask<ChecklistDoc>(
    () => {
      if (!picName || !areaTugas || areaTugas.length === 0) return null;
      const batasWaktu = Timestamp.fromMillis(Date.now() - JAM_TOLERANSI_MS);
      return query(collection(db, "ob_checklists"), where("pic_bertugas", "==", picName), where("waktu_selesai", ">=", batasWaktu));
    },
    [picName, areaTugas?.length, tanggal],
    (docs) => docs.length > 0
  );

  if (loading || !areaTugas || areaTugas.length === 0 || !pending) return null;

  return (
    <StickyBanner
      tone="warning"
      message="Belum ada laporan checklist kebersihan dalam 3 jam terakhir"
      subMessage={`Area tugas hari ini: ${areaTugas.join(", ")}`}
      resetKey={tanggal}
    />
  );
}
