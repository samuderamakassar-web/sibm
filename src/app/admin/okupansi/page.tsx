"use client";

/**
 * Okupansi Gedung (§88) -- luas lantai & unit sewa per tenant (PT), Lantai 1-4 (bisa ditambah).
 * Data: okupansi_gedung/data { lantai: [{ nama, luas_total, unit: [{ id, nama, tenant, luas, status }] }] }.
 * status: "terisi" (disewa tenant) | "kosong" (siap disewa) | "bersama" (koridor/toilet/tangga, tidak disewakan).
 * Luas lantai yang belum dipetakan ke unit dihitung sebagai area kosong.
 * Okupansi % = luas terisi / (luas total - area bersama). Khusus Admin (keputusan user).
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import { DAFTAR_UNIT_BISNIS } from "../../../lib/unitBisnis";

type Status = "terisi" | "kosong" | "bersama";
interface Unit { id: string; nama: string; tenant: string; luas: number; status: Status }
interface Lantai { nama: string; luas_total: number; unit: Unit[] }

const BAWAAN: Lantai[] = ["Lantai 1", "Lantai 2", "Lantai 3", "Lantai 4"].map((nama) => ({ nama, luas_total: 0, unit: [] }));
const REF = () => doc(db, "okupansi_gedung", "data"); // privat (bukan settings yang bisa dibaca publik)
const idBaru = () => `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const fmt = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
const persen = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const WARNA: Record<Status | "sisa", string> = { terisi: "var(--ok-solid)", kosong: "var(--warn-solid)", bersama: "var(--muted-solid)", sisa: "var(--line)" };

function hitung(l: Lantai) {
  const terisi = l.unit.filter((u) => u.status === "terisi").reduce((a, u) => a + (u.luas || 0), 0);
  const kosongUnit = l.unit.filter((u) => u.status === "kosong").reduce((a, u) => a + (u.luas || 0), 0);
  const bersama = l.unit.filter((u) => u.status === "bersama").reduce((a, u) => a + (u.luas || 0), 0);
  const tercatat = terisi + kosongUnit + bersama;
  const belumDipetakan = Math.max(0, (l.luas_total || 0) - tercatat);
  const total = Math.max(l.luas_total || 0, tercatat);
  return { terisi, kosong: kosongUnit + belumDipetakan, bersama, total, sewa: total - bersama, lebih: tercatat > (l.luas_total || 0) && (l.luas_total || 0) > 0 };
}

function Kpi({ label, nilai, sub, warna }: { label: string; nilai: string; sub: string; warna?: string }) {
  return (
    <div style={{ background: "var(--bg)", borderRadius: "18px", padding: "14px 16px" }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 800, color: warna || "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{nilai}</div>
      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{sub}</div>
    </div>
  );
}

export default function OkupansiPage() {
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const [data, setData] = useState<Lantai[]>(BAWAAN);
  const [berubah, setBerubah] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [edit, setEdit] = useState(false);
  const [lantaiBaru, setLantaiBaru] = useState("");

  useEffect(() => {
    if (!isReady) return;
    const unsub = onSnapshot(REF(), (s) => {
      const l = s.data()?.lantai as Lantai[] | undefined;
      if (!berubah) setData(Array.isArray(l) && l.length ? l : BAWAAN);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const ubah = (fn: (d: Lantai[]) => void) => { setData((lama) => { const d = JSON.parse(JSON.stringify(lama)) as Lantai[]; fn(d); return d; }); setBerubah(true); };
  const simpan = async () => {
    setMenyimpan(true);
    try {
      await setDoc(REF(), { lantai: JSON.parse(JSON.stringify(data)), diperbarui_oleh: session?.nama || "-", diperbarui_pada: serverTimestamp() });
      setBerubah(false); setEdit(false);
      showToast("Data okupansi tersimpan.", "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan.", "error"); }
    finally { setMenyimpan(false); }
  };

  if (!isReady) return null;

  const per = data.map((l) => ({ l, h: hitung(l) }));
  const tot = per.reduce((a, { h }) => ({ terisi: a.terisi + h.terisi, kosong: a.kosong + h.kosong, bersama: a.bersama + h.bersama, total: a.total + h.total, sewa: a.sewa + h.sewa }), { terisi: 0, kosong: 0, bersama: 0, total: 0, sewa: 0 });
  const perTenant: Record<string, { luas: number; lantai: Set<string> }> = {};
  data.forEach((l) => l.unit.filter((u) => u.status === "terisi" && u.tenant).forEach((u) => {
    perTenant[u.tenant] ??= { luas: 0, lantai: new Set() };
    perTenant[u.tenant].luas += u.luas || 0;
    perTenant[u.tenant].lantai.add(l.nama);
  }));
  const daftarTenant = Object.entries(perTenant).sort((a, b) => b[1].luas - a[1].luas);


  return (
    <AdminShell title="Okupansi Gedung" subtitle="Luas gedung, luas sewa per tenant, dan area kosong per lantai" userName={session?.nama || "Admin"}
      actions={edit
        ? <div style={{ display: "flex", gap: "8px" }}><button type="button" className="sa-btn is-soft" onClick={() => { setEdit(false); setBerubah(false); }}>Batal</button><button type="button" className="sa-btn is-primary" onClick={simpan} disabled={menyimpan || !berubah}>{menyimpan ? "Menyimpan..." : "Simpan"}</button></div>
        : <button type="button" className="sa-btn is-dark" onClick={() => setEdit(true)}>Ubah data luas & tenant</button>}>
      <style dangerouslySetInnerHTML={{ __html: `
        .ok-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
        .ok-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--line); }
        .ok-in { padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 13px; min-width: 0; }
        .ok-row { display: grid; grid-template-columns: 1.2fr 1.4fr 90px 120px auto; gap: 6px; align-items: center; }
        @media (max-width: 720px) { .ok-row { grid-template-columns: 1fr 1fr; } }
      `}} />

      <Tile style={{ marginBottom: "16px" }}>
        <div className="ok-kpi">
          <Kpi label="Okupansi" nilai={`${persen(tot.terisi, tot.sewa)}%`} sub="luas terisi / luas yang bisa disewa" warna="var(--ok)" />
          <Kpi label="Luas total" nilai={`${fmt(tot.total)} m²`} sub={`${data.length} lantai`} />
          <Kpi label="Luas terisi tenant" nilai={`${fmt(tot.terisi)} m²`} sub={`${daftarTenant.length} tenant`} />
          <Kpi label="Area kosong" nilai={`${fmt(tot.kosong)} m²`} sub="siap disewa / belum dipetakan" warna="var(--warn)" />
          <Kpi label="Area bersama" nilai={`${fmt(tot.bersama)} m²`} sub="koridor, toilet, tangga" />
        </div>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "12px", fontSize: "12px", color: "var(--ink-soft)" }}>
          {([["terisi", "Terisi tenant"], ["kosong", "Kosong"], ["bersama", "Area bersama"]] as [Status, string][]).map(([k, l]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: 10, height: 10, borderRadius: 3, background: WARNA[k] }} />{l}</span>
          ))}
        </div>
      </Tile>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "16px", alignItems: "start" }}>
        {per.map(({ l, h }, li) => (
          <Tile key={l.nama}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "8px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>{l.nama}</h2>
              <span style={{ fontSize: "13px", fontWeight: 800, color: "var(--ok)" }}>{persen(h.terisi, h.sewa)}% terisi</span>
            </div>
            <div className="ok-bar" aria-label={`Terisi ${fmt(h.terisi)} m², kosong ${fmt(h.kosong)} m², bersama ${fmt(h.bersama)} m²`}>
              {h.total > 0 && (["terisi", "bersama"] as Status[]).map((k) => <span key={k} style={{ width: `${(h[k] / h.total) * 100}%`, background: WARNA[k] }} />)}
              {h.total > 0 && <span style={{ width: `${(h.kosong / h.total) * 100}%`, background: WARNA.kosong }} />}
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted)", margin: "6px 0 10px" }}>
              Total {fmt(h.total)} m² · terisi {fmt(h.terisi)} · kosong {fmt(h.kosong)} · bersama {fmt(h.bersama)}
              {h.lebih && <span style={{ color: "var(--red-600)", fontWeight: 700 }}> · jumlah unit melebihi luas lantai, periksa angka</span>}
            </div>

            {edit ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: "8px" }}>
                  Luas total lantai (m²)
                  <input type="number" min={0} className="ok-in" style={{ width: "120px" }} value={l.luas_total || ""} onChange={(e) => ubah((d) => { d[li].luas_total = Number(e.target.value) || 0; })} />
                </label>
                {l.unit.map((u, ui) => (
                  <div key={u.id} className="ok-row">
                    <input className="ok-in" placeholder="Nama unit / ruang" value={u.nama} onChange={(e) => ubah((d) => { d[li].unit[ui].nama = e.target.value; })} />
                    <select className="ok-in" value={u.status === "terisi" ? u.tenant : `__${u.status}`} onChange={(e) => ubah((d) => {
                      const v = e.target.value;
                      if (v.startsWith("__")) { d[li].unit[ui].status = v.slice(2) as Status; d[li].unit[ui].tenant = ""; }
                      else { d[li].unit[ui].status = "terisi"; d[li].unit[ui].tenant = v; }
                    })}>
                      <option value="__kosong">— Kosong (siap disewa) —</option>
                      <option value="__bersama">— Area bersama —</option>
                      {DAFTAR_UNIT_BISNIS.map((p) => <option key={p} value={p}>{p}</option>)}
                      {u.tenant && !DAFTAR_UNIT_BISNIS.includes(u.tenant) && <option value={u.tenant}>{u.tenant}</option>}
                    </select>
                    <input type="number" min={0} className="ok-in" placeholder="m²" value={u.luas || ""} onChange={(e) => ubah((d) => { d[li].unit[ui].luas = Number(e.target.value) || 0; })} />
                    <input className="ok-in" placeholder="Tenant lain (opsional)" value={u.status === "terisi" && !DAFTAR_UNIT_BISNIS.includes(u.tenant) ? u.tenant : ""} onChange={(e) => ubah((d) => { d[li].unit[ui].status = "terisi"; d[li].unit[ui].tenant = e.target.value; })} />
                    <button type="button" className="sa-btn is-soft" style={{ height: "34px", color: "var(--red-600)" }} onClick={() => ubah((d) => { d[li].unit.splice(ui, 1); })}>Hapus</button>
                  </div>
                ))}
                <button type="button" className="sa-btn is-soft" onClick={() => ubah((d) => { d[li].unit.push({ id: idBaru(), nama: "", tenant: "", luas: 0, status: "kosong" }); })}>+ Tambah unit / ruang</button>
              </div>
            ) : l.unit.length === 0 ? (
              <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Belum ada unit. Tekan &quot;Ubah data luas &amp; tenant&quot;.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {l.unit.map((u) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", borderRadius: "10px", background: "var(--bg)", fontSize: "13px" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: WARNA[u.status], flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}><b>{u.nama || "(tanpa nama)"}</b> <span style={{ color: "var(--muted)" }}>· {u.status === "terisi" ? u.tenant : u.status === "kosong" ? "Kosong" : "Area bersama"}</span></span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(u.luas || 0)} m²</span>
                  </div>
                ))}
              </div>
            )}
          </Tile>
        ))}
        {edit && (
          <Tile>
            <h2 style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 800 }}>Tambah lantai</h2>
            <div style={{ display: "flex", gap: "6px" }}>
              <input className="ok-in" style={{ flex: 1 }} placeholder="Mis. Lantai 5 / Basement" value={lantaiBaru} onChange={(e) => setLantaiBaru(e.target.value)} />
              <button type="button" className="sa-btn is-soft" onClick={() => { if (!lantaiBaru.trim()) return; ubah((d) => { d.push({ nama: lantaiBaru.trim(), luas_total: 0, unit: [] }); }); setLantaiBaru(""); }}>+ Tambah</button>
            </div>
          </Tile>
        )}
      </div>

      <Tile style={{ marginTop: "16px" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: 800 }}>Luas sewa per tenant</h2>
        {daftarTenant.length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Belum ada unit berstatus terisi.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {daftarTenant.map(([nama, v]) => (
              <div key={nama}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", gap: "8px" }}>
                  <span style={{ fontWeight: 700 }}>{nama} <span style={{ fontWeight: 500, color: "var(--muted)" }}>· {Array.from(v.lantai).join(", ")}</span></span>
                  <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmt(v.luas)} m² · {persen(v.luas, tot.sewa)}%</span>
                </div>
                <div className="ok-bar" style={{ height: "8px", marginTop: "4px" }}><span style={{ width: `${persen(v.luas, tot.sewa)}%`, background: WARNA.terisi }} /></div>
              </div>
            ))}
          </div>
        )}
      </Tile>
    </AdminShell>
  );
}
