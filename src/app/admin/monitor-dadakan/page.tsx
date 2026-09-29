"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";

interface NotifikasiDadakan {
  id: string;
  tanggal: string;
  jendela: "Pagi" | "Malam";
  petugas: string;
  foto_url: string;
  waktu_upload_label?: string;
  dibuat_pada: Timestamp | null;
}

function formatTanggalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

function formatTanggalLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MonitorDadakanPage() {
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });
  const adminName = session?.nama || "Admin";

  const [data, setData] = useState<NotifikasiDadakan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "notifikasi_dadakan_siram"), orderBy("dibuat_pada", "desc"), limit(120)),
      (snapshot) => {
        setData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as NotifikasiDadakan)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // 14 hari terakhir (termasuk hari ini), terbaru di atas -- biar keliatan jelas hari/jendela mana
  // yang BELUM ada buktinya sama sekali (bukan cuma nampilin yang ada datanya).
  const rekapPerTanggal = (() => {
    const hariIni = new Date();
    const daftarTanggal: string[] = [];
    for (let i = 0; i < 14; i++) {
      daftarTanggal.push(formatTanggalISO(new Date(hariIni.getTime() - i * 24 * 60 * 60 * 1000)));
    }
    const perTanggal: Record<string, { Pagi?: NotifikasiDadakan; Malam?: NotifikasiDadakan }> = {};
    data.forEach((item) => {
      if (!perTanggal[item.tanggal]) perTanggal[item.tanggal] = {};
      perTanggal[item.tanggal][item.jendela] = item;
    });
    return daftarTanggal.map((tanggal) => ({ tanggal, Pagi: perTanggal[tanggal]?.Pagi, Malam: perTanggal[tanggal]?.Malam }));
  })();

  if (!isReady) return null;

  return (
    <AdminShell
      title="Pantau Siram Tanaman"
      subtitle="Bukti foto siram tanaman Security — jendela Pagi (06:00–07:00) & Malam (20:00–22:00) WITA, 14 hari terakhir"
      userName={adminName}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .dadakan-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 14px 4px; border-bottom: 1px solid var(--line); }
        .dadakan-row:last-child { border-bottom: none; }
        .dadakan-jendela { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 12px; border-radius: 14px; font-size: 12px; font-weight: 700; min-width: 170px; box-sizing: border-box; }
        @media (max-width: 640px) {
          .dadakan-row { grid-template-columns: 1fr 1fr; }
          .dadakan-row > :first-child { grid-column: 1 / -1; }
          .dadakan-jendela { min-width: 0; }
        }
      `}} />

      <Tile style={{ maxWidth: "900px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</div>
        ) : (
          rekapPerTanggal.map(({ tanggal, Pagi, Malam }) => (
            <div key={tanggal} className="dadakan-row">
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink)" }}>{formatTanggalLabel(tanggal)}</div>
              {([{ label: "Pagi", item: Pagi }, { label: "Malam", item: Malam }] as const).map(({ label, item }) => (
                <a
                  key={label}
                  href={item?.foto_url || undefined}
                  target={item?.foto_url ? "_blank" : undefined}
                  rel="noreferrer"
                  className="dadakan-jendela"
                  style={{
                    background: item ? "var(--ok-50)" : "var(--red-50)",
                    color: item ? "var(--ok)" : "var(--red-600)",
                    cursor: item ? "pointer" : "default",
                    textDecoration: "none",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={item ? "M20 6 9 17l-5-5" : "M18 6 6 18M6 6l12 12"} />
                  </svg>
                  <span>{label}: {item ? `${item.petugas} (${item.waktu_upload_label || "-"})` : "Belum ada bukti"}</span>
                  {item && <AdminIcon name="chevronRight" size={14} style={{ marginLeft: "auto" }} />}
                </a>
              ))}
            </div>
          ))
        )}
      </Tile>
    </AdminShell>
  );
}
