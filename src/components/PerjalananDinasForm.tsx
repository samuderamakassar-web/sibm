"use client";

/** §187 Form catat / ubah Perjalanan Dinas Luar Kota (dipakai Driver & Admin GA). */
import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { daerahTulis } from "@/lib/daerah";
import { tanggalISOWITASekarang } from "@/lib/shift";
import { uploadFoto } from "@/lib/uploadFoto";
import { AWAL_PENCATATAN, JENIS_BIAYA, KOLEKSI_DINAS, cekPerjalanan, jarakKm, lamaHari, rupiah, totalBiaya, type KunciBiaya, type PerjalananDinas } from "@/lib/perjalananDinas";
import Modal from "./ui/Modal";
import { useToast } from "./ui/ToastProvider";
import { bukaDokumen } from "./ui/PratinjauDokumen";

interface Props {
  open: boolean;
  awal: PerjalananDinas | null;   // null = baru
  driverTetap?: string;           // halaman Driver: nama driver terkunci
  daftarDriver?: string[];        // halaman Admin: pilih driver
  oleh: string;
  onClose: () => void;
}

type Form = {
  driver: string; tanggal_berangkat: string; tanggal_pulang: string; kota_tujuan: string; keperluan: string;
  penumpang: string; unit_bisnis: string; kendaraan: string; km_berangkat: string; km_pulang: string; catatan: string;
  biaya: Record<KunciBiaya, string>; lampiran: string[];
};

const biayaKosong = () => Object.fromEntries(JENIS_BIAYA.map((j) => [j.kunci, ""])) as Record<KunciBiaya, string>;

function keForm(p: PerjalananDinas | null, driver: string, hariIni: string): Form {
  return {
    driver: p?.driver || driver, tanggal_berangkat: p?.tanggal_berangkat || hariIni, tanggal_pulang: p?.tanggal_pulang || p?.tanggal_berangkat || hariIni,
    kota_tujuan: p?.kota_tujuan || "", keperluan: p?.keperluan || "", penumpang: p?.penumpang || "", unit_bisnis: p?.unit_bisnis || "",
    kendaraan: p?.kendaraan || "", km_berangkat: p?.km_berangkat ? String(p.km_berangkat) : "", km_pulang: p?.km_pulang ? String(p.km_pulang) : "",
    catatan: p?.catatan || "",
    biaya: { ...biayaKosong(), ...Object.fromEntries(Object.entries(p?.biaya || {}).map(([k, v]) => [k, v ? String(v) : ""])) },
    lampiran: p?.lampiran || [],
  };
}

async function kompres(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = url; });
    const s = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, gagal) => c.toBlob((b) => (b ? ok(b) : gagal(new Error("kompres"))), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}

export default function PerjalananDinasForm({ open, awal, driverTetap, daftarDriver, oleh, onClose }: Props) {
  const showToast = useToast();
  const hariIni = tanggalISOWITASekarang();
  // dipasang ulang tiap kali dibuka (induk merender {form && <PerjalananDinasForm .../>}), jadi cukup inisialisasi sekali
  const [f, setF] = useState<Form>(() => keForm(awal, driverTetap || daftarDriver?.[0] || "", hariIni));
  const [kendaraan, setKendaraan] = useState<string[]>([]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [unggah, setUnggah] = useState(false);

  useEffect(() => {
    if (!open) return;
    return onSnapshot(query(collection(db, "master_kendaraan"), orderBy("kendaraan", "asc")), (s) => setKendaraan(s.docs.map((d) => String(d.data().kendaraan || "")).filter(Boolean)), () => setKendaraan([]));
  }, [open]);

  const ubah = (x: Partial<Form>) => setF((p) => ({ ...p, ...x }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d.]/g, "")));
  const biayaAngka = Object.fromEntries(JENIS_BIAYA.map((j) => [j.kunci, num(f.biaya[j.kunci]) || 0]).filter(([, v]) => (v as number) > 0)) as Partial<Record<KunciBiaya, number>>;
  const dataSimpan: Omit<PerjalananDinas, "id"> = {
    driver: f.driver.trim(), tanggal_berangkat: f.tanggal_berangkat, tanggal_pulang: f.tanggal_pulang || f.tanggal_berangkat,
    kota_tujuan: f.kota_tujuan.trim(), keperluan: f.keperluan.trim(), penumpang: f.penumpang.trim(), unit_bisnis: f.unit_bisnis.trim(),
    kendaraan: f.kendaraan, km_berangkat: num(f.km_berangkat), km_pulang: num(f.km_pulang), biaya: biayaAngka, catatan: f.catatan.trim(), lampiran: f.lampiran,
  };
  const jarak = jarakKm(dataSimpan);

  const simpan = async () => {
    const galat = !dataSimpan.driver ? "Pilih driver." : cekPerjalanan(dataSimpan, hariIni);
    if (galat) return showToast(galat, "warning");
    setMenyimpan(true);
    try {
      const susulan = Math.round((Date.parse(hariIni) - Date.parse(dataSimpan.tanggal_pulang)) / 86400000) > 3;
      if (awal) await updateDoc(doc(db, KOLEKSI_DINAS, awal.id), { ...dataSimpan, diubah_oleh: oleh, diubah_pada: serverTimestamp() });
      else await addDoc(collection(db, KOLEKSI_DINAS), { ...dataSimpan, susulan, daerah: daerahTulis(), dibuat_oleh: oleh, dibuat_pada: serverTimestamp() });
      showToast(awal ? "Perjalanan dinas diperbarui." : "Perjalanan dinas tercatat.", "success");
      onClose();
    } catch (e) { console.error(e); showToast("Gagal menyimpan. Cek koneksi lalu coba lagi.", "error"); }
    finally { setMenyimpan(false); }
  };

  const tambahLampiran = async (files: FileList | null) => {
    if (!files?.length) return;
    setUnggah(true);
    try {
      const url: string[] = [];
      for (const file of Array.from(files).slice(0, 5)) url.push(await uploadFoto(await kompres(file), "perjalanan-dinas"));
      setF((p) => ({ ...p, lampiran: [...p.lampiran, ...url] }));
    } catch (e) { console.error(e); showToast((e as Error).message || "Foto gagal diunggah.", "error"); }
    finally { setUnggah(false); }
  };

  const lbl: React.CSSProperties = { display: "block", fontSize: "11.5px", fontWeight: 800, color: "var(--ink-soft)", marginBottom: "4px" };
  return (
    <Modal open={open} onClose={() => !menyimpan && onClose()} maxWidth="680px">
      <style>{`.pd-in{width:100%;padding:9px 10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:13px;font-family:inherit;box-sizing:border-box;min-width:0}.pd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}`}</style>
      <div style={{ maxHeight: "82vh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 800 }}>🚗 {awal ? "Ubah" : "Catat"} perjalanan dinas luar kota</h2>
        <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>Boleh diisi susulan sejak {AWAL_PENCATATAN.split("-").reverse().join("/")}. Biaya & KM boleh dikosongkan bila tidak tahu.</div>
        <div className="pd-grid">
          {daftarDriver && !driverTetap && (
            <label><span style={lbl}>Driver</span><select className="pd-in" value={f.driver} onChange={(e) => ubah({ driver: e.target.value })}>{daftarDriver.map((d) => <option key={d}>{d}</option>)}</select></label>
          )}
          <label><span style={lbl}>Berangkat</span><input className="pd-in" type="date" min={AWAL_PENCATATAN} max={hariIni} value={f.tanggal_berangkat} onChange={(e) => ubah({ tanggal_berangkat: e.target.value, tanggal_pulang: f.tanggal_pulang < e.target.value ? e.target.value : f.tanggal_pulang })} /></label>
          <label><span style={lbl}>Pulang</span><input className="pd-in" type="date" min={f.tanggal_berangkat} value={f.tanggal_pulang} onChange={(e) => ubah({ tanggal_pulang: e.target.value })} /></label>
          <label><span style={lbl}>Kota tujuan</span><input className="pd-in" value={f.kota_tujuan} onChange={(e) => ubah({ kota_tujuan: e.target.value })} placeholder="Cth: Parepare" list="pd-kota" /></label>
        </div>
        <datalist id="pd-kota">{["Maros", "Gowa", "Takalar", "Jeneponto", "Bantaeng", "Bulukumba", "Sinjai", "Bone", "Soppeng", "Wajo", "Barru", "Parepare", "Pinrang", "Sidrap", "Enrekang", "Palopo", "Pangkep", "Toraja", "Kendari", "Palu", "Mamuju"].map((k) => <option key={k} value={k} />)}</datalist>
        <div className="pd-grid" style={{ marginTop: "10px" }}>
          <label style={{ gridColumn: "1 / -1" }}><span style={lbl}>Keperluan</span><input className="pd-in" value={f.keperluan} onChange={(e) => ubah({ keperluan: e.target.value })} placeholder="Cth: antar manajemen kunjungan pelabuhan" /></label>
          <label><span style={lbl}>Penumpang</span><input className="pd-in" value={f.penumpang} onChange={(e) => ubah({ penumpang: e.target.value })} placeholder="Cth: Pak Rival, Pak Aldi" /></label>
          <label><span style={lbl}>PT yang dilayani</span><input className="pd-in" value={f.unit_bisnis} onChange={(e) => ubah({ unit_bisnis: e.target.value })} placeholder="opsional" /></label>
          <label style={{ gridColumn: "1 / -1" }}><span style={lbl}>Kendaraan</span><select className="pd-in" value={f.kendaraan} onChange={(e) => ubah({ kendaraan: e.target.value })}><option value="">— pilih —</option>{kendaraan.map((k) => <option key={k}>{k}</option>)}{f.kendaraan && !kendaraan.includes(f.kendaraan) && <option>{f.kendaraan}</option>}</select></label>
          <label><span style={lbl}>KM berangkat</span><input className="pd-in" inputMode="numeric" value={f.km_berangkat} onChange={(e) => ubah({ km_berangkat: e.target.value })} placeholder="opsional" /></label>
          <label><span style={lbl}>KM pulang</span><input className="pd-in" inputMode="numeric" value={f.km_pulang} onChange={(e) => ubah({ km_pulang: e.target.value })} placeholder="opsional" /></label>
        </div>
        <div style={{ fontSize: "12px", fontWeight: 800, margin: "14px 0 6px" }}>Biaya (Rp)</div>
        <div className="pd-grid">
          {JENIS_BIAYA.map((j) => (
            <label key={j.kunci}><span style={lbl}>{j.label}</span><input className="pd-in" inputMode="numeric" value={f.biaya[j.kunci]} onChange={(e) => ubah({ biaya: { ...f.biaya, [j.kunci]: e.target.value } })} placeholder="0" /></label>
          ))}
        </div>
        <label style={{ display: "block", marginTop: "10px" }}><span style={lbl}>Catatan</span><textarea className="pd-in" rows={2} value={f.catatan} onChange={(e) => ubah({ catatan: e.target.value })} placeholder="Kendala di jalan, menginap di mana, dsb." /></label>
        <div style={{ marginTop: "10px" }}>
          <span style={lbl}>Foto nota / surat tugas (opsional)</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {f.lampiran.map((u, i) => (
              <span key={u} style={{ display: "inline-flex", gap: "4px", alignItems: "center", fontSize: "12px", padding: "4px 8px", borderRadius: "8px", background: "var(--bg)", border: "1px solid var(--line)" }}>
                <button type="button" style={{ background: "none", border: 0, color: "var(--info)", cursor: "pointer", padding: 0 }} onClick={() => bukaDokumen({ url: u, nama: `nota-${i + 1}.jpg` })}>📎 Foto {i + 1}</button>
                <button type="button" aria-label="Hapus foto" style={{ background: "none", border: 0, color: "var(--red-600)", cursor: "pointer", padding: 0 }} onClick={() => ubah({ lampiran: f.lampiran.filter((x) => x !== u) })}>✕</button>
              </span>
            ))}
            <label className="sa-btn is-soft" style={{ height: "32px", cursor: "pointer" }}>{unggah ? "Mengunggah…" : "+ Foto"}<input type="file" accept="image/*" multiple hidden disabled={unggah} onChange={(e) => { tambahLampiran(e.target.files); e.target.value = ""; }} /></label>
          </div>
        </div>
        <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "12px", background: "var(--bg)", fontSize: "12.5px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
          <span><b>{lamaHari(dataSimpan)}</b> hari</span>
          <span><b>{jarak !== null ? jarak.toLocaleString("id-ID") : "—"}</b> km</span>
          <span>Total biaya <b>{rupiah(totalBiaya(dataSimpan.biaya))}</b></span>
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "14px" }}>
          <button type="button" className="sa-btn is-soft" onClick={onClose} disabled={menyimpan}>Batal</button>
          <button type="button" className="sa-btn is-primary" onClick={simpan} disabled={menyimpan || unggah}>{menyimpan ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </div>
    </Modal>
  );
}
