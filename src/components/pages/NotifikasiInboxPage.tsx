"use client";

/**
 * src/components/pages/NotifikasiInboxPage.tsx
 * ------------------------------------------------------------------
 * Kotak masuk notifikasi IN-APP -- pelengkap push notification (FCM), bukan
 * pengganti. Setiap kali sebuah script reminder (lihat scripts/*.mjs) kirim
 * push ke seseorang, dia JUGA menulis 1 entri ke notifikasi_personal supaya
 * tetap kelihatan di sini kalau push-nya kelewat/gak keklik. Tab "Siaran"
 * nampilin pengumuman_gedung (data yang SAMA dipakai carousel portal utama).
 * ------------------------------------------------------------------
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";

type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconBell = ({ size = 32, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
);
const IconMegaphone = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a2 2 0 0 0 2 2h1l2 6h2l-1-6h4l6 4V5l-6 4H6a2 2 0 0 0-2 2z" /></svg>
);

interface NotifSistem {
  id: string;
  judul: string;
  pesan: string;
  dibaca: boolean;
  waktu: Timestamp | null;
}
interface NotifSiaran {
  id: string;
  judul: string;
  teks: string;
  dibuatPada: Timestamp | null;
}

type ItemGabungan =
  | { tipe: "sistem"; id: string; judul: string; isi: string; waktu: Timestamp | null; dibaca: boolean }
  | { tipe: "siaran"; id: string; judul: string; isi: string; waktu: Timestamp | null };

function formatWaktu(ts: Timestamp | null): string {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(ts.toDate());
}

export default function NotifikasiInboxPage() {
  const router = useRouter();
  const [picName, setPicName] = useState("");
  const [tab, setTab] = useState<"semua" | "sistem" | "siaran">("semua");
  const [sistem, setSistem] = useState<NotifSistem[]>([]);
  const [siaran, setSiaran] = useState<NotifSiaran[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setPicName(localStorage.getItem("pic_nama") || ""), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!picName) return;
    const unsub = onSnapshot(
      query(collection(db, "notifikasi_personal"), where("untukNama", "==", picName), orderBy("waktu", "desc"), limit(50)),
      (snap) => {
        setSistem(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotifSistem)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [picName]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "pengumuman_gedung"), orderBy("dibuatPada", "desc"), limit(20)), (snap) => {
      setSiaran(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotifSiaran)));
    });
    return () => unsub();
  }, []);

  const jumlahBelumDibaca = sistem.filter((n) => !n.dibaca).length;

  const gabungan: ItemGabungan[] = [
    ...sistem.map((n): ItemGabungan => ({ tipe: "sistem", id: n.id, judul: n.judul, isi: n.pesan, waktu: n.waktu, dibaca: n.dibaca })),
    ...siaran.map((n): ItemGabungan => ({ tipe: "siaran", id: n.id, judul: n.judul, isi: n.teks, waktu: n.dibuatPada })),
  ].sort((a, b) => (b.waktu?.toMillis() || 0) - (a.waktu?.toMillis() || 0));

  const ditampilkan = tab === "semua" ? gabungan : tab === "sistem" ? gabungan.filter((i) => i.tipe === "sistem") : gabungan.filter((i) => i.tipe === "siaran");

  const handleKlikItem = (item: ItemGabungan) => {
    if (item.tipe === "sistem" && !item.dibaca) {
      updateDoc(doc(db, "notifikasi_personal", item.id), { dibaca: true }).catch(() => {});
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f7f6f5)", paddingBottom: "40px" }}>
      <style dangerouslySetInnerHTML={{ __html: `:root { --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4; --bg: #f7f6f5; --surface: #ffffff; --info: #2563eb; --info-50: #eff6ff; --accent: #7c3aed; }` }} />
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}><IconArrowLeft /></button>
        <h1 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--ink)" }}>Notifikasi</h1>
        {jumlahBelumDibaca > 0 && <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 700, color: "var(--info)", background: "var(--info-50)", padding: "4px 10px", borderRadius: "20px" }}>{jumlahBelumDibaca} belum dibaca</span>}
      </div>

      <div style={{ display: "flex", gap: "8px", padding: "14px 20px 0" }}>
        {([["semua", "Semua"], ["sistem", "Sistem"], ["siaran", "Siaran"]] as const).map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            style={{ padding: "8px 16px", borderRadius: "20px", border: "1px solid var(--line)", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, background: tab === key ? "var(--info)" : "var(--surface)", color: tab === key ? "#fff" : "var(--ink-soft)" }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px", maxWidth: "560px", margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</div>
        ) : ditampilkan.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--muted)" }}>
            <IconBell size={36} />
            <div style={{ marginTop: "10px", fontWeight: 700, color: "var(--ink)" }}>Belum Ada Notifikasi</div>
            <div style={{ fontSize: "12.5px", marginTop: "4px" }}>Notifikasi sistem & pengumuman akan muncul di sini.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {ditampilkan.map((item) => (
              <div
                key={`${item.tipe}-${item.id}`} onClick={() => handleKlikItem(item)}
                style={{
                  display: "flex", gap: "12px", padding: "14px 16px", borderRadius: "14px", cursor: "pointer",
                  background: item.tipe === "sistem" && !item.dibaca ? "var(--info-50)" : "var(--surface)",
                  border: "1px solid var(--line)",
                }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: item.tipe === "siaran" ? "#f5f3ff" : "var(--info-50)", color: item.tipe === "siaran" ? "var(--accent)" : "var(--info)" }}>
                  {item.tipe === "siaran" ? <IconMegaphone size={16} /> : <IconBell size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>{item.judul}</span>
                    <span style={{ fontSize: "10.5px", color: "var(--muted)", flexShrink: 0 }}>{formatWaktu(item.waktu)}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--ink-soft)", marginTop: "3px", lineHeight: 1.5 }}>{item.isi}</div>
                </div>
                {item.tipe === "sistem" && !item.dibaca && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--info)", flexShrink: 0, marginTop: "4px" }} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
