"use client";

/** §187 Driver: catatan Perjalanan Dinas Luar Kota (isi susulan sejak Jan 2026 untuk dibandingkan dengan 2027). */
import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import AdminShell from "../../admin/AdminShell";
import PerjalananDinasForm from "../../PerjalananDinasForm";
import { useConfirm } from "../../ui/ConfirmProvider";
import { useToast } from "../../ui/ToastProvider";
import { bukaDokumen } from "../../ui/PratinjauDokumen";
import { tanggalISOWITASekarang } from "@/lib/shift";
import { BULAN_PENDEK, KOLEKSI_DINAS, dariFirestore, jarakKm, lamaHari, rekapTahun, rupiah, totalBiaya, type PerjalananDinas } from "@/lib/perjalananDinas";

const tgl = (iso: string) => (iso ? `${Number(iso.slice(8, 10))} ${BULAN_PENDEK[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "-");

export default function DriverDinasPage() {
  const { session, isReady } = useAuthGuard({ depts: ["Driver"], adminBypass: false, redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Driver." });
  const nama = session?.nama || "";
  const confirm = useConfirm();
  const showToast = useToast();
  const hariIni = tanggalISOWITASekarang();
  const tahunIni = Number(hariIni.slice(0, 4));
  const [daftar, setDaftar] = useState<PerjalananDinas[] | null>(null);
  const [form, setForm] = useState<{ awal: PerjalananDinas | null } | null>(null);

  useEffect(() => {
    if (!nama) return;
    return onSnapshot(query(collection(db, KOLEKSI_DINAS), where("driver", "==", nama)),
      (s) => setDaftar(s.docs.map((d) => dariFirestore(d.id, d.data())).sort((a, b) => b.tanggal_berangkat.localeCompare(a.tanggal_berangkat))),
      () => setDaftar([]));
  }, [nama]);

  const rekap = useMemo(() => rekapTahun(daftar || [], tahunIni), [daftar, tahunIni]);
  const bulanKosong = useMemo(() => {
    // bulan sejak Jan tahun ini yang belum ada catatan -> pengingat isi susulan (bila memang ada dinas)
    const sampai = Number(hariIni.slice(5, 7));
    return BULAN_PENDEK.slice(0, sampai).filter((_, i) => rekap.bulan[i].trip === 0);
  }, [rekap, hariIni]);

  const hapus = async (p: PerjalananDinas) => {
    if (!(await confirm({ title: "Hapus catatan", message: `Hapus perjalanan ke ${p.kota_tujuan} (${tgl(p.tanggal_berangkat)})?`, confirmText: "Hapus", variant: "danger" }))) return;
    try { await deleteDoc(doc(db, KOLEKSI_DINAS, p.id)); showToast("Catatan dihapus.", "success"); }
    catch (e) { console.error(e); showToast("Gagal menghapus.", "error"); }
  };

  if (!isReady) return null;
  const kartu: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "16px", padding: "14px 16px" };

  return (
    <AdminShell title="Perjalanan Dinas Luar Kota" subtitle="Catat setiap dinas ke luar Makassar — termasuk yang sudah lewat sejak Januari" userName={nama || "Driver"} backHref="/dashboard/driver" backLabel="Menu Driver">
      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ ...kartu, background: "var(--info-50)", borderColor: "var(--info)" }}>
          <div style={{ fontWeight: 800, fontSize: "14px" }}>📋 Mohon lengkapi dari Januari {tahunIni} sampai hari ini</div>
          <div style={{ fontSize: "12.5px", color: "var(--ink-soft)", marginTop: "4px", lineHeight: 1.5 }}>
            Data ini dipakai untuk membandingkan perjalanan dinas {tahunIni} dengan {tahunIni + 1} (berapa kali, berapa hari, KM & biaya). Kalau lupa angka pastinya, isi perkiraan dan tulis di catatan.
            {bulanKosong.length > 0 && <> Bulan yang belum ada catatan: <b>{bulanKosong.join(", ")}</b> — lewati kalau memang tidak ada dinas.</>}
          </div>
          <button type="button" className="sa-btn is-primary" style={{ marginTop: "10px" }} onClick={() => setForm({ awal: null })}>+ Catat perjalanan dinas</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
          {[["Perjalanan", String(rekap.total.trip)], ["Hari dinas", String(rekap.total.hari)], ["KM tercatat", rekap.total.km.toLocaleString("id-ID")], ["Biaya", rupiah(rekap.total.biaya)]].map(([l, v]) => (
            <div key={l} style={kartu}><div style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 700 }}>{l} {tahunIni}</div><div style={{ fontSize: "20px", fontWeight: 800 }}>{v}</div></div>
          ))}
        </div>

        <div style={kartu}>
          <div style={{ fontWeight: 800, marginBottom: "8px" }}>Riwayat saya</div>
          {daftar === null ? <div style={{ color: "var(--muted)", fontSize: "13px" }}>Memuat…</div>
            : daftar.length === 0 ? <div style={{ color: "var(--muted)", fontSize: "13px" }}>Belum ada catatan. Tekan “+ Catat perjalanan dinas”.</div>
            : <div style={{ display: "grid", gap: "8px" }}>
              {daftar.map((p) => {
                const km = jarakKm(p);
                return (
                  <div key={p.id} style={{ border: "1px solid var(--line)", borderRadius: "12px", padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800 }}>{p.kota_tujuan}</div>
                      <div style={{ fontSize: "12px", color: "var(--muted)" }}>{tgl(p.tanggal_berangkat)}{p.tanggal_pulang !== p.tanggal_berangkat ? ` – ${tgl(p.tanggal_pulang)}` : ""} · {lamaHari(p)} hari</div>
                    </div>
                    <div style={{ fontSize: "12.5px", color: "var(--ink-soft)", marginTop: "2px" }}>{p.keperluan}{p.penumpang ? ` · ${p.penumpang}` : ""}</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      {p.kendaraan && <span>🚗 {p.kendaraan.split(" - ")[0]}</span>}
                      {km !== null && <span>📟 {km.toLocaleString("id-ID")} km</span>}
                      {totalBiaya(p.biaya) > 0 && <span>💰 {rupiah(totalBiaya(p.biaya))}</span>}
                      {(p.lampiran || []).map((u, i) => <button key={u} type="button" style={{ background: "none", border: 0, color: "var(--info)", cursor: "pointer", padding: 0, fontSize: "12px" }} onClick={() => bukaDokumen({ url: u, nama: `nota-${i + 1}.jpg` })}>📎 Foto {i + 1}</button>)}
                      <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                        <button type="button" className="sa-btn is-soft" style={{ height: "28px", padding: "0 10px" }} onClick={() => setForm({ awal: p })}>Ubah</button>
                        <button type="button" className="sa-btn is-soft" style={{ height: "28px", padding: "0 10px", color: "var(--red-600)" }} onClick={() => hapus(p)}>Hapus</button>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>}
        </div>
      </div>
      {form && <PerjalananDinasForm open awal={form?.awal || null} driverTetap={nama} oleh={nama} onClose={() => setForm(null)} />}
    </AdminShell>
  );
}
