"use client";

/** Form portal "Minta Pelayanan OB" (§122) -- tanpa login (pilih nama dari Master Karyawan), status bisa dipantau. */

import { useEffect, useState } from "react";
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { daerahTulis } from "../lib/daerah";
import Modal from "./ui/Modal";
import { useToast } from "./ui/ToastProvider";
import { JENIS_PELAYANAN, LOKASI_PELAYANAN, labelJenis, timJenis, type JenisPelayanan, type PermintaanPelayanan, type TimPelayanan } from "../lib/pelayanan";

interface Karyawan { nama: string; departemen: string }

export default function PelayananModal({ open, onClose, karyawan }: { open: boolean; onClose: () => void; karyawan: Karyawan[] }) {
  const showToast = useToast();
  const [form, setForm] = useState({ nama: "", jenis: "minuman" as JenisPelayanan, lokasi: "", jumlah: "1", catatan: "" });
  const [mengirim, setMengirim] = useState(false);
  const tim = timJenis(form.jenis);
  const pilihTim = (t: TimPelayanan) => setForm((f) => ({ ...f, jenis: t === "OB" ? "minuman" : "bersih", jumlah: "1" }));
  const [milikSaya, setMilikSaya] = useState<PermintaanPelayanan[]>([]);
  const cocok = karyawan.find((k) => k.nama.toLowerCase() === form.nama.trim().toLowerCase());

  useEffect(() => {
    if (!open || !cocok) return;
    const unsub = onSnapshot(query(collection(db, "permintaan_pelayanan"), where("nama_pemohon", "==", cocok.nama)), (s) => {
      setMilikSaya(s.docs.map((d) => ({ id: d.id, ...d.data() } as PermintaanPelayanan)).filter((p) => p.status === "Baru" || p.status === "Diproses").sort((a, b) => (b.waktu_minta?.toMillis() || 0) - (a.waktu_minta?.toMillis() || 0)));
    }, () => setMilikSaya([]));
    return () => unsub();
  }, [open, cocok]);

  const kirim = async () => {
    if (!cocok) return showToast("Pilih nama Anda dari daftar karyawan.", "warning");
    if (!form.lokasi.trim()) return showToast("Isi lokasi (lantai / ruangan).", "warning");
    setMengirim(true);
    try {
      await addDoc(collection(db, "permintaan_pelayanan"), {
        daerah: daerahTulis(), jenis: form.jenis, lokasi: form.lokasi.trim(), jumlah: Math.max(1, parseInt(form.jumlah, 10) || 1), catatan: form.catatan.trim(),
        nama_pemohon: cocok.nama, departemen: cocok.departemen || "-", status: "Baru", waktu_minta: serverTimestamp(),
      });
      showToast(`Permintaan terkirim ke ${tim === "CS" ? "tim Cleaning" : "OB"}.`, "success");
      setForm((f) => ({ ...f, catatan: "", jumlah: "1" }));
    } catch (e) { console.error(e); showToast("Gagal mengirim permintaan.", "error"); }
    finally { setMengirim(false); }
  };

  const inp = { width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: "14px", fontFamily: "inherit" };
  return (
    <Modal open={open} onClose={onClose} maxWidth="480px">
      <h3 style={{ margin: "0 0 4px", fontSize: "19px", fontWeight: 800, color: "var(--ink)" }}>Minta Pelayanan / Cleaning</h3>
      <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>Petugas yang bertugas langsung menerima permintaan Anda.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", padding: "4px", borderRadius: "12px", background: "var(--bg)", marginBottom: "12px" }}>
        {(["OB", "CS"] as TimPelayanan[]).map((t) => (
          <button key={t} type="button" onClick={() => pilihTim(t)} style={{ padding: "10px", borderRadius: "9px", border: "none", background: tim === t ? "var(--surface)" : "transparent", boxShadow: tim === t ? "0 1px 3px rgba(0,0,0,0.12)" : "none", color: tim === t ? "var(--ink)" : "var(--muted)", fontSize: "13.5px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            {t === "OB" ? "Pelayanan OB" : "Cleaning (CS)"}
          </button>
        ))}
      </div>
      <label style={{ fontSize: "12px", fontWeight: 800, color: "var(--ink-soft)" }}>Nama Anda *</label>
      <input list="pel-karyawan" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Ketik & pilih nama..." style={{ ...inp, margin: "4px 0 10px" }} />
      <datalist id="pel-karyawan">{karyawan.map((k) => <option key={k.nama} value={k.nama}>{k.departemen}</option>)}</datalist>
      <label style={{ fontSize: "12px", fontWeight: 800, color: "var(--ink-soft)" }}>{tim === "CS" ? "Apa yang perlu dibersihkan? *" : "Jenis pelayanan *"}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "6px 0 10px" }}>
        {JENIS_PELAYANAN.filter((j) => j.tim === tim).map((j) => (
          <button key={j.key} type="button" onClick={() => setForm({ ...form, jenis: j.key })} style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid var(--line)", background: form.jenis === j.key ? "var(--ink)" : "var(--surface)", color: form.jenis === j.key ? "var(--surface)" : "var(--ink-soft)", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{j.label}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: tim === "OB" ? "minmax(0,1fr) 90px" : "minmax(0,1fr)", gap: "8px" }}>
        <div>
          <label style={{ fontSize: "12px", fontWeight: 800, color: "var(--ink-soft)" }}>Lokasi *</label>
          <input list="pel-lokasi" value={form.lokasi} onChange={(e) => setForm({ ...form, lokasi: e.target.value })} placeholder="Lantai / ruangan" style={{ ...inp, marginTop: "4px" }} />
          <datalist id="pel-lokasi">{LOKASI_PELAYANAN.map((l) => <option key={l} value={l} />)}</datalist>
        </div>
        {tim === "OB" && <div>
          <label style={{ fontSize: "12px", fontWeight: 800, color: "var(--ink-soft)" }}>{form.jenis === "minuman" ? "Gelas" : "Jumlah"}</label>
          <input inputMode="numeric" value={form.jumlah} onChange={(e) => setForm({ ...form, jumlah: e.target.value.replace(/\D/g, "") })} style={{ ...inp, marginTop: "4px", textAlign: "center" }} />
        </div>}
      </div>
      <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "var(--ink-soft)", marginTop: "10px" }}>Catatan</label>
      <input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} placeholder={form.jenis === "minuman" ? "Mis. 3 kopi, 2 teh tawar" : tim === "CS" ? "Mis. kopi tumpah di dekat meja rapat" : "Detail singkat"} style={{ ...inp, marginTop: "4px" }} />
      <button type="button" onClick={kirim} disabled={mengirim} className="sa-btn is-primary" style={{ width: "100%", height: "48px", marginTop: "14px", fontSize: "15px" }}>{mengirim ? "Mengirim..." : "Kirim permintaan"}</button>
      {milikSaya.length > 0 && (
        <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--muted)" }}>Permintaan Anda yang berjalan</div>
          {milikSaya.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "8px 10px", borderRadius: "10px", background: "var(--bg)", fontSize: "12.5px" }}>
              <span>{labelJenis(p.jenis)} · {p.lokasi}</span>
              <b style={{ color: p.status === "Diproses" ? "var(--info)" : "var(--warn)", whiteSpace: "nowrap" }}>{p.status === "Diproses" ? `Diproses ${p.diterima_oleh || ""}` : (timJenis(p.jenis) === "CS" ? "Menunggu CS" : "Menunggu OB")}</b>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
