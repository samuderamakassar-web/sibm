"use client";

/**
 * src/components/AparInspectionBanner.tsx
 * ------------------------------------------------------------------
 * Banner pengingat PERSISTEN untuk inspeksi APAR: muncul mulai H-3 sebelum
 * deadline (tanggal 30, atau akhir bulan untuk Februari) sampai semua unit
 * APAR selesai diinspeksi bulan ini. Query langsung ke apar_units (bukan
 * flag notif "dibaca"), jadi otomatis hilang begitu semua unit selesai.
 *
 * Dipasang di src/app/dashboard/security/layout.tsx (Security) dan
 * src/app/admin/apar/page.tsx (Admin GA/QHSE).
 * ------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { collection, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { usePendingTask } from "../hooks/usePendingTask";
import StickyBanner from "./ui/StickyBanner";

interface AparUnitDoc {
  terakhir_inspeksi?: { bulan_tahun?: string } | null;
}

function bulanTahunSekarang(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function akhirBulan(tahun: number, bulanIndex0: number): number {
  return new Date(tahun, bulanIndex0 + 1, 0).getDate();
}

export default function AparInspectionBanner() {
  const [dalamWindow, setDalamWindow] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [deadlineDay, setDeadlineDay] = useState(30);

  useEffect(() => {
    const today = new Date();
    const deadline = Math.min(30, akhirBulan(today.getFullYear(), today.getMonth()));
    const sisaHari = deadline - today.getDate();
    const t = setTimeout(() => {
      setDeadlineDay(deadline);
      setDalamWindow(sisaHari >= 0 && sisaHari <= 3);
      setUrgent(sisaHari <= 0);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const bulanIni = bulanTahunSekarang();

  const { pending, loading } = usePendingTask<AparUnitDoc>(
    () => (dalamWindow ? query(collection(db, "apar_units")) : null),
    [dalamWindow, bulanIni],
    (docs) => docs.length === 0 || docs.every((d) => d.terakhir_inspeksi?.bulan_tahun === bulanIni)
  );

  if (!dalamWindow || loading || !pending) return null;

  return (
    <StickyBanner
      tone={urgent ? "urgent" : "warning"}
      message={urgent ? `Inspeksi APAR sudah jatuh tempo (tanggal ${deadlineDay})!` : `Inspeksi APAR harus selesai maksimal tanggal ${deadlineDay} bulan ini`}
      subMessage="Masih ada unit APAR yang belum diinspeksi bulan ini."
      resetKey={`${bulanIni}|${urgent}`}
    />
  );
}
