"use client";

/**
 * Pemilih petugas Inspeksi Utilitas Teknis (§114) -- dipakai di Plotting OB (Koordinator) & Admin Kondisi Aset.
 * Nama diambil dari akun users_master departemen "OB & CS" (bukan ketik bebas) supaya sama persis dengan nama
 * login OB. Keduanya menulis field yang sama: settings/master_kondisi_aset.petugas_utilitas (merge) -> otomatis sinkron.
 */

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useToast } from "./ui/ToastProvider";
import { useMasterKondisiAset } from "../lib/kondisiAset";

export default function PetugasUtilitasPicker({ oleh }: { oleh: string }) {
  const showToast = useToast();
  const { nilai } = useMasterKondisiAset();
  const [staf, setStaf] = useState<string[]>([]);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "users_master"), where("departemen", "==", "OB & CS")), (s) => {
      setStaf(s.docs.map((d) => String(d.data().nama || "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)));
    }, (e) => console.error("[petugas utilitas] staf:", e));
    return () => unsub();
  }, []);

  const terpilih = nilai.petugas_utilitas;
  const tanpaAkun = terpilih.filter((n) => !staf.some((s) => s.toLowerCase() === n.toLowerCase()));
  const ubah = async (nama: string) => {
    const ada = terpilih.some((n) => n.toLowerCase() === nama.toLowerCase());
    const baru = ada ? terpilih.filter((n) => n.toLowerCase() !== nama.toLowerCase()) : [...terpilih, nama];
    setMenyimpan(true);
    try {
      await setDoc(doc(db, "settings", "master_kondisi_aset"), { petugas_utilitas: baru, petugas_diubah_oleh: oleh || "-", petugas_diubah_pada: serverTimestamp() }, { merge: true });
      showToast(ada ? `${nama} dilepas dari tugas utilitas.` : `${nama} ditugaskan inspeksi utilitas.`, "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan petugas.", "error"); }
    finally { setMenyimpan(false); }
  };

  return (
    <div>
      <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--ink)" }}>Petugas Inspeksi Utilitas Teknis</div>
      <p style={{ margin: "2px 0 10px", fontSize: "12px", color: "var(--muted)" }}>OB tetap yang mengecek genset, panel, pompa, dll. tiap minggu. Pilih dari akun OB & CS — tersinkron antara Plotting (Koordinator) dan Admin.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {staf.map((n) => {
          const on = terpilih.some((x) => x.toLowerCase() === n.toLowerCase());
          return (
            <button key={n} type="button" disabled={menyimpan} onClick={() => ubah(n)} aria-pressed={on}
              style={{ padding: "7px 12px", borderRadius: "999px", border: `1px solid ${on ? "transparent" : "var(--line)"}`, background: on ? "var(--info-solid)" : "var(--bg)", color: on ? "#fff" : "var(--ink-soft)", fontSize: "12.5px", fontWeight: 700, cursor: menyimpan ? "wait" : "pointer", fontFamily: "inherit" }}>
              {on ? "✓ " : ""}{n}
            </button>
          );
        })}
        {!staf.length && <span style={{ fontSize: "12px", color: "var(--muted)" }}>Memuat akun OB & CS...</span>}
      </div>
      {tanpaAkun.length > 0 && (
        <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--red-600)", fontWeight: 700, display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          Nama tanpa akun OB & CS (tidak bisa login inspeksi):
          {tanpaAkun.map((n) => <button key={n} type="button" onClick={() => ubah(n)} style={{ border: "1px solid var(--red-600)", background: "transparent", color: "var(--red-600)", borderRadius: "999px", padding: "2px 8px", fontSize: "11.5px", cursor: "pointer", fontFamily: "inherit" }}>{n} ×</button>)}
        </div>
      )}
      {!terpilih.length && <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--warn)", fontWeight: 700 }}>Belum ada petugas — inspeksi utilitas belum muncul untuk siapa pun.</div>}
    </div>
  );
}
