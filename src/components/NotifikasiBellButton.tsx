"use client";

/**
 * src/components/NotifikasiBellButton.tsx
 * ------------------------------------------------------------------
 * Tombol lonceng notifikasi + badge jumlah belum dibaca, dipasang di header
 * tiap dashboard (OB, Security, Driver, QHSE, Admin GA) -- pintu masuk ke
 * /notifikasi (NotifikasiInboxPage.tsx).
 * ------------------------------------------------------------------
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

type IconProps = { size?: number; color?: string };
const IconBell = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
);

export default function NotifikasiBellButton({ picName, variant = "gelap" }: { picName: string; variant?: "gelap" | "terang" }) {
  const router = useRouter();
  const [jumlahBelumDibaca, setJumlahBelumDibaca] = useState(0);

  useEffect(() => {
    if (!picName) return;
    const unsub = onSnapshot(
      query(collection(db, "notifikasi_personal"), where("untukNama", "==", picName), where("dibaca", "==", false)),
      (snap) => setJumlahBelumDibaca(snap.size)
    );
    return () => unsub();
  }, [picName]);

  // "terang" = dipasang di atas background gelap/berwarna (mis. hero merah) -- ikon & border putih.
  // "gelap" (default) = dipasang di atas background terang -- ikon abu gelap, border tipis.
  const warna = variant === "terang"
    ? { color: "#fff", border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.12)" }
    : { color: "var(--ink-soft, #3f3f46)", border: "1px solid var(--line, #e7e5e4)", background: "none" };

  return (
    <button
      onClick={() => router.push("/notifikasi")}
      style={{ position: "relative", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", ...warna }}
      aria-label="Notifikasi"
    >
      <IconBell size={17} />
      {jumlahBelumDibaca > 0 && (
        <span style={{ position: "absolute", top: "-4px", right: "-4px", background: "var(--red-600, #dc2626)", color: "#fff", fontSize: "9.5px", fontWeight: 800, borderRadius: "20px", minWidth: "16px", height: "16px", padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
          {jumlahBelumDibaca > 9 ? "9+" : jumlahBelumDibaca}
        </span>
      )}
    </button>
  );
}
