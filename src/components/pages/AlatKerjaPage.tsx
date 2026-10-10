"use client";

/**
 * Alat Kerja OB & CS (§116) -- register alat dengan PIC. Akses: Admin GA / Administrator / Koordinator OB & CS.
 * Tambah alat (kode otomatis), ganti PIC (langsung berlaku, §127 tanpa konfirmasi), tandai
 * Rusak / Hilang (kronologi wajib) / Afkir, riwayat, dan cetak label (QR + kode, atau cukup tulis kode).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuthGuard, isAdministrator } from "../../hooks/useAuthGuard";
import { useToast } from "../../components/ui/ToastProvider";
import AdminShell from "../../components/admin/AdminShell";
import Tile from "../../components/admin/Tile";
import Modal from "../../components/ui/Modal";
import QrLokal from "../../components/QrLokal";
import { daerahTulis } from "../../lib/daerah";
import { dataUrlKeCloudinary } from "../../lib/uploadFoto";
import { KATEGORI_ALAT, PEMEGANG_GUDANG, STATUS_ALAT, WARNA_STATUS_ALAT, kodeBerikut, type AlatKerja, type StatusAlat } from "../../lib/alatKerja";

const tgl = (ts?: Timestamp | null) => (ts ? ts.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
type Aksi = { jenis: "tambah" } | { jenis: "pindah"; a: AlatKerja } | { jenis: "status"; a: AlatKerja } | { jenis: "riwayat"; a: AlatKerja };

function Pill({ s }: { s: StatusAlat }) {
  return <span style={{ fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "999px", background: WARNA_STATUS_ALAT[s].bg, color: WARNA_STATUS_ALAT[s].fg, whiteSpace: "nowrap" }}>{s}</span>;
}

/** §117 dipakai di /dashboard/ob/alat (Koordinator) & /admin/alat-kerja (Admin) -- tombol kembali sesuai asal. */
export default function AlatKerjaPage({ backHref = "/dashboard/ob", backLabel = "Dashboard OB" }: { backHref?: string; backLabel?: string }) {
  const router = useRouter();
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({ redirectTo: "/", deniedMessage: "Silakan login." });
  const boleh = !!session && (session.dept === "Admin GA" || isAdministrator(session.role) || (session.dept === "OB & CS" && session.role.toLowerCase().includes("koordinator")));
  const [alat, setAlat] = useState<AlatKerja[]>([]);
  const [staf, setStaf] = useState<string[]>([]);
  const [aksi, setAksi] = useState<Aksi | null>(null);
  const [form, setForm] = useState({ nama: "", kategori: KATEGORI_ALAT[0], pemegang: PEMEGANG_GUDANG, jumlah: "1", catatan: "", ke: "", status: "Aktif" as StatusAlat, kronologi: "", foto: "" });
  const [filterPemegang, setFilterPemegang] = useState("Semua");
  const [cari, setCari] = useState("");
  const [cetak, setCetak] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    if (isReady && !boleh) { showToast("Akses Ditolak! Halaman ini untuk Admin GA & Koordinator OB.", "error"); router.push("/"); }
  }, [isReady, boleh, router, showToast]);

  useEffect(() => {
    if (!isReady || !boleh) return;
    const u1 = onSnapshot(collection(db, "aset_alat"), (s) => setAlat(s.docs.map((d) => ({ id: d.id, ...d.data() } as AlatKerja)).sort((a, b) => a.kode.localeCompare(b.kode, undefined, { numeric: true }))), (e) => console.error("[alat]", e));
    const u2 = onSnapshot(query(collection(db, "users_master"), where("departemen", "==", "OB & CS")), (s) => setStaf(s.docs.map((d) => String(d.data().nama || "").trim()).filter(Boolean).sort()));
    return () => { u1(); u2(); };
  }, [isReady, boleh]);

  if (!isReady || !boleh) return null;
  const oleh = session?.nama || "-";
  const pemegangList = [PEMEGANG_GUDANG, ...staf];
  const tampil = alat.filter((a) => a.status !== "Afkir" || filterPemegang === "Afkir")
    .filter((a) => filterPemegang === "Semua" || filterPemegang === "Afkir" ? (filterPemegang !== "Afkir" || a.status === "Afkir") : a.pemegang === filterPemegang)
    .filter((a) => !cari.trim() || `${a.kode} ${a.nama} ${a.pemegang}`.toLowerCase().includes(cari.toLowerCase()));
  const perPemegang = (p: string) => alat.filter((a) => a.pemegang === p && a.status !== "Afkir");

  const fotoPilih = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); const k = Math.min(1, 700 / img.width); c.width = img.width * k; c.height = img.height * k; c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height); setForm((x) => ({ ...x, foto: c.toDataURL("image/jpeg", 0.65) })); }; img.src = String(r.result); };
    r.readAsDataURL(f);
  };
  const riwayat = (aksiTeks: string, extra: Record<string, string> = {}) => ({ waktu: Timestamp.now(), aksi: aksiTeks, oleh, ...extra });

  const simpan = async () => {
    if (!aksi) return;
    setMenyimpan(true);
    try {
      if (aksi.jenis === "tambah") {
        if (!form.nama.trim()) return showToast("Isi nama alat.", "warning");
        const n = Math.min(30, Math.max(1, parseInt(form.jumlah, 10) || 1));
        const foto = form.foto ? await dataUrlKeCloudinary(form.foto, "sibm/alat-kerja") : "";
        const terpakai: { kode: string }[] = [...alat];
        for (let i = 0; i < n; i++) {
          const kode = kodeBerikut(form.nama, terpakai);
          terpakai.push({ kode });
          await addDoc(collection(db, "aset_alat"), {
            daerah: daerahTulis(), kode, nama: form.nama.trim(), kategori: form.kategori, pemegang: form.pemegang, status: "Aktif",
            dikonfirmasi: true, foto, catatan: form.catatan.trim(), dibuat_pada: serverTimestamp(),
            riwayat: [riwayat("Didaftarkan", { ke: form.pemegang })],
          });
        }
        showToast(`${n} alat didaftarkan.`, "success");
      } else if (aksi.jenis === "pindah") {
        if (!form.ke || form.ke === aksi.a.pemegang) return showToast("Pilih pemegang baru.", "warning");
        await updateDoc(doc(db, "aset_alat", aksi.a.id), {
          pemegang: form.ke, dikonfirmasi: true, diserahkan_pada: serverTimestamp(),
          riwayat: arrayUnion(riwayat("Ganti PIC", { dari: aksi.a.pemegang, ke: form.ke, catatan: form.catatan.trim() })),
        });
        showToast(form.ke === PEMEGANG_GUDANG ? `${aksi.a.kode} dikembalikan ke gudang.` : `PIC ${aksi.a.kode} sekarang ${form.ke}.`, "success");
      } else if (aksi.jenis === "status") {
        if (form.status === aksi.a.status) return showToast("Status tidak berubah.", "warning");
        if ((form.status === "Hilang" || form.status === "Rusak") && !form.kronologi.trim()) return showToast("Kronologi wajib diisi.", "warning");
        const foto = form.foto ? await dataUrlKeCloudinary(form.foto, "sibm/alat-kerja") : "";
        await updateDoc(doc(db, "aset_alat", aksi.a.id), {
          status: form.status,
          riwayat: arrayUnion(riwayat(`Status → ${form.status}`, { dari: aksi.a.status, catatan: `${form.kronologi.trim()}${aksi.a.pemegang ? ` (pemegang: ${aksi.a.pemegang})` : ""}`, ...(foto ? { foto } : {}) })),
        });
        showToast(`${aksi.a.kode} → ${form.status}`, "success");
      }
      setAksi(null);
    } catch (e) { console.error(e); showToast("Gagal menyimpan.", "error"); }
    finally { setMenyimpan(false); }
  };

  const buka = (a: Aksi) => { setAksi(a); setForm({ nama: "", kategori: KATEGORI_ALAT[0], pemegang: PEMEGANG_GUDANG, jumlah: "1", catatan: "", ke: "", status: a.jenis === "status" ? a.a.status : "Aktif", kronologi: "", foto: "" }); };

  if (cetak) {
    const label = tampil.filter((a) => a.status !== "Afkir");
    return (
      <div style={{ background: "#fff", color: "#000", minHeight: "100vh", padding: "16px" }}>
        <style dangerouslySetInnerHTML={{ __html: "@media print { .no-print { display: none !important; } @page { margin: 8mm; } } .lbl { break-inside: avoid; }" }} />
        <div className="no-print" style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <button type="button" onClick={() => window.print()} style={{ padding: "10px 16px", fontWeight: 800 }}>Cetak</button>
          <button type="button" onClick={() => setCetak(false)} style={{ padding: "10px 16px" }}>Kembali</button>
          <span style={{ alignSelf: "center", fontSize: "13px" }}>{label.length} label · potong & tempel di alat (atau cukup tulis kodenya di label nama biasa)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 62mm)", gap: "4mm" }}>
          {label.map((a) => (
            <div key={a.id} className="lbl" style={{ border: "1px dashed #999", borderRadius: "6px", padding: "3mm", display: "flex", gap: "3mm", alignItems: "center", height: "28mm" }}>
              <QrLokal data={`ALAT:${a.kode}`} size={80} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "16px", fontWeight: 900 }}>{a.kode}</div>
                <div style={{ fontSize: "10px" }}>{a.nama}</div>
                <div style={{ fontSize: "9px", color: "#555" }}>SIBM · OB & CS</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <AdminShell title="Alat Kerja OB & CS" subtitle="Register alat dengan penanggung jawab (PIC), serah terima, rusak/hilang & label" userName={oleh} backHref={backHref} backLabel={backLabel}
      actions={<div style={{ display: "flex", gap: "6px" }}><button type="button" className="sa-btn is-soft" onClick={() => setCetak(true)}>Cetak label</button><button type="button" className="sa-btn is-primary" onClick={() => buka({ jenis: "tambah" })}>+ Alat</button></div>}>
      <style dangerouslySetInnerHTML={{ __html: `
        .al-in { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 13px; font-family: inherit; box-sizing: border-box; }
        .al-lbl { display: block; font-size: 11.5px; font-weight: 800; color: var(--ink-soft); margin: 10px 0 4px; }
        .al-chip { border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); border-radius: 999px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .al-chip span { opacity: .65; margin-left: 4px; }
        .al-chip.on { background: var(--ink); color: var(--surface); border-color: transparent; }
        .al-row { display: grid; grid-template-columns: 44px minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
        .al-aksi { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
        .al-aksi button { border: none; background: var(--bg); color: var(--ink-soft); border-radius: 9px; padding: 6px 10px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
        @media (max-width: 640px) { .al-row { grid-template-columns: 44px minmax(0,1fr); } .al-aksi { grid-column: 1 / -1; justify-content: flex-start; } }
      ` }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", marginBottom: "12px" }}>
        {([["Total aktif", alat.filter((a) => a.status === "Aktif").length, "var(--ink)"], ["Belum diinspeksi", alat.filter((a) => a.status === "Aktif" && !a.inspeksi_terakhir).length, "var(--warn)"], ["Rusak", alat.filter((a) => a.status === "Rusak").length, "var(--warn)"], ["Hilang", alat.filter((a) => a.status === "Hilang").length, "var(--red-600)"]] as const).map(([l, n, w]) => (
          <Tile key={l} compact><div style={{ fontSize: "22px", fontWeight: 800, color: w }}>{n}</div><div style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>{l}</div></Tile>
        ))}
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" }}>
        {["Semua", ...pemegangList].map((p) => (
          <button key={p} type="button" className={`al-chip${filterPemegang === p ? " on" : ""}`} onClick={() => setFilterPemegang(p)}>{p}{p !== "Semua" && <span>{perPemegang(p).length}</span>}</button>
        ))}
        <button type="button" className={`al-chip${filterPemegang === "Afkir" ? " on" : ""}`} onClick={() => setFilterPemegang("Afkir")}>Afkir</button>
        <input className="al-in" style={{ width: "200px", marginLeft: "auto" }} placeholder="Cari kode / nama..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari alat" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {tampil.length === 0 ? <Tile><div style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>{alat.length ? "Tidak ada alat pada filter ini." : "Belum ada alat terdaftar. Tekan + Alat."}</div></Tile> : tampil.map((a) => (
          <div key={a.id} className="al-row">
            {a.foto_terakhir || a.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.foto_terakhir || a.foto} alt="" style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "10px" }} />
            ) : <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "var(--bg)", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 900, color: "var(--muted)" }}>{a.kode.split("-")[0]}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: "14px", color: "var(--ink)" }}>{a.kode}</b>
                <span style={{ fontSize: "13px", color: "var(--ink)" }}>{a.nama}</span>
                <Pill s={a.status} />
              </div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>PIC <b style={{ color: "var(--ink-soft)" }}>{a.pemegang}</b> · {a.kategori}{a.kondisi_terakhir ? ` · inspeksi ${tgl(a.inspeksi_terakhir)}: ${a.kondisi_terakhir}` : " · belum diinspeksi"}</div>
            </div>
            <div className="al-aksi">
              <button type="button" onClick={() => { buka({ jenis: "pindah", a }); }}>Ganti PIC</button>
              <button type="button" onClick={() => buka({ jenis: "status", a })}>Ubah status</button>
              <button type="button" onClick={() => buka({ jenis: "riwayat", a })}>Riwayat</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!aksi} onClose={() => !menyimpan && setAksi(null)} maxWidth="500px">
        {aksi && (
          <div>
            {aksi.jenis === "tambah" && (
              <>
                <h3 style={{ margin: 0, fontSize: "18px" }}>Daftarkan alat</h3>
                <label className="al-lbl">Nama alat *</label>
                <input className="al-in" list="al-nama" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Mis. Vacuum cleaner" />
                <datalist id="al-nama">{Array.from(new Set(alat.map((a) => a.nama))).map((n) => <option key={n} value={n} />)}</datalist>
                {form.nama.trim() && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>Kode otomatis: <b>{kodeBerikut(form.nama, alat)}</b>{Number(form.jumlah) > 1 ? ` dst.` : ""}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: "8px" }}>
                  <div><label className="al-lbl">Kategori</label><select className="al-in" value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })}>{KATEGORI_ALAT.map((k) => <option key={k}>{k}</option>)}</select></div>
                  <div><label className="al-lbl">PIC / pemegang</label><select className="al-in" value={form.pemegang} onChange={(e) => setForm({ ...form, pemegang: e.target.value })}>{pemegangList.map((p) => <option key={p}>{p}</option>)}</select></div>
                  <div><label className="al-lbl">Jumlah</label><input className="al-in" inputMode="numeric" value={form.jumlah} onChange={(e) => setForm({ ...form, jumlah: e.target.value.replace(/\D/g, "") })} /></div>
                </div>
                <label className="al-lbl">Catatan (merk, spesifikasi)</label>
                <input className="al-in" value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} />
              </>
            )}
            {aksi.jenis === "pindah" && (
              <>
                <h3 style={{ margin: 0, fontSize: "18px" }}>Ganti PIC {aksi.a.kode}</h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted)" }}>{aksi.a.nama} · PIC sekarang <b>{aksi.a.pemegang}</b>. Hanya untuk resign / mutasi / alat ditarik ke gudang — pindah lantai tidak perlu ganti PIC, alat dibawa pemiliknya.</p>
                <label className="al-lbl">PIC baru *</label>
                <select className="al-in" value={form.ke} onChange={(e) => setForm({ ...form, ke: e.target.value })}><option value="">Pilih...</option>{pemegangList.filter((p) => p !== aksi.a.pemegang).map((p) => <option key={p}>{p}</option>)}</select>
                <label className="al-lbl">Catatan</label>
                <input className="al-in" value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} placeholder="Mis. rotasi area / resign" />
              </>
            )}
            {aksi.jenis === "status" && (
              <>
                <h3 style={{ margin: 0, fontSize: "18px" }}>Ubah status {aksi.a.kode}</h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted)" }}>{aksi.a.nama} · PIC {aksi.a.pemegang}</p>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
                  {STATUS_ALAT.map((s) => <button key={s} type="button" className={`al-chip${form.status === s ? " on" : ""}`} onClick={() => setForm({ ...form, status: s })}>{s}</button>)}
                </div>
                <label className="al-lbl">Kronologi {form.status === "Hilang" || form.status === "Rusak" ? "*" : "(opsional)"}</label>
                <textarea className="al-in" style={{ minHeight: "80px" }} value={form.kronologi} onChange={(e) => setForm({ ...form, kronologi: e.target.value })} placeholder="Kapan terakhir dipakai, di mana, oleh siapa, sebab rusak/hilang..." />
                <label className="al-lbl">Foto (opsional)</label>
                <input type="file" accept="image/*" capture="environment" onChange={fotoPilih} />
                {aksi.a.foto_terakhir && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>Foto inspeksi terakhir {tgl(aksi.a.inspeksi_terakhir)} tersimpan di riwayat.</div>}
              </>
            )}
            {aksi.jenis === "riwayat" && (
              <>
                <h3 style={{ margin: "0 0 10px", fontSize: "18px" }}>Riwayat {aksi.a.kode} · {aksi.a.nama}</h3>
                {aksi.a.foto_terakhir && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={aksi.a.foto_terakhir} alt="Foto inspeksi terakhir" style={{ width: "100%", maxHeight: "180px", objectFit: "cover", borderRadius: "12px", marginBottom: "10px" }} />
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "50vh", overflowY: "auto" }}>
                  {[...(aksi.a.riwayat || [])].reverse().map((r, i) => (
                    <div key={i} style={{ padding: "8px 10px", borderRadius: "10px", background: "var(--bg)", fontSize: "12.5px" }}>
                      <b>{r.aksi}</b>{r.dari || r.ke ? ` · ${r.dari || "-"} → ${r.ke || "-"}` : ""}
                      <div style={{ color: "var(--muted)", fontSize: "11.5px" }}>{r.waktu?.toDate ? r.waktu.toDate().toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"} · {r.oleh}{r.catatan ? ` · ${r.catatan}` : ""}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {aksi.jenis !== "riwayat" && (
              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button type="button" className="sa-btn is-soft" style={{ flex: 1 }} onClick={() => setAksi(null)} disabled={menyimpan}>Batal</button>
                <button type="button" className="sa-btn is-primary" style={{ flex: 1 }} onClick={simpan} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Simpan"}</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
