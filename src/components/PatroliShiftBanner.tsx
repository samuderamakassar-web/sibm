"use client";

/**
 * src/components/PatroliShiftBanner.tsx
 * ------------------------------------------------------------------
 * Banner pengingat PERSISTEN: tetap muncul (bisa disembunyikan sementara,
 * tapi kembali tampil begitu sesi berganti) selama petugas Security yang
 * sedang login belum menyelesaikan minimal 2 dari 3 sesi patroli shift
 * ini. Query langsung ke security_patrols (bukan flag notif "dibaca"),
 * jadi otomatis hilang begitu syarat terpenuhi.
 *
 * Dipasang di src/app/dashboard/security/layout.tsx.
 * ------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { usePendingTask } from "../hooks/usePendingTask";
import { hitungShiftSesi, waktuWITASekarang, sesiMinimumTerpenuhi, MINIMUM_SESI_PER_SHIFT, ShiftSesiInfo } from "../lib/shift";
import StickyBanner from "./ui/StickyBanner";

interface PatrolDoc {
  sesi?: string;
}

export default function PatroliShiftBanner() {
  const [picName, setPicName] = useState<string>("");
  const [shiftSesiInfo, setShiftSesiInfo] = useState<ShiftSesiInfo | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setPicName(localStorage.getItem("pic_nama") || ""), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const perbarui = () => setShiftSesiInfo(hitungShiftSesi(waktuWITASekarang()));
    perbarui();
    const interval = setInterval(perbarui, 60000);
    return () => clearInterval(interval);
  }, []);

  const { pending, loading } = usePendingTask<PatrolDoc>(
    () => {
      if (!picName || !shiftSesiInfo) return null;
      return query(
        collection(db, "security_patrols"),
        where("petugas", "==", picName),
        where("tanggal_shift", "==", shiftSesiInfo.tanggal_shift),
        where("shift", "==", shiftSesiInfo.shift)
      );
    },
    [picName, shiftSesiInfo?.tanggal_shift, shiftSesiInfo?.shift],
    (docs) => sesiMinimumTerpenuhi(docs.map((d) => d.sesi))
  );

  if (loading || !pending || !shiftSesiInfo) return null;

  return (
    <StickyBanner
      tone="warning"
      message={`Sesi patroli minimum belum terpenuhi — ${shiftSesiInfo.shift} · ${shiftSesiInfo.sesi} sedang berjalan`}
      subMessage={`Selesaikan minimal ${MINIMUM_SESI_PER_SHIFT} dari 3 sesi sebelum shift berakhir.`}
      resetKey={`${shiftSesiInfo.tanggal_shift}|${shiftSesiInfo.shift}|${shiftSesiInfo.sesi}`}
    />
  );
}
