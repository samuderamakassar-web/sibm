"use client";

/**
 * Temuan & Kondisi Aset (§113) -- Admin GA.
 *   Temuan        : item hasil inspeksi OB yang butuh perbaikan/penggantian (temuan_aset). Alur status
 *                   Baru -> Dijadwalkan -> Dikerjakan -> Selesai (foto hasil wajib, biaya opsional) / Ditolak (alasan).
 *                   Status final terkunci. Dipisah: Perbaikan Gedung · Penggantian Alat · Perbaikan Utilitas.
 *   Kondisi Terkini: kondisi terakhir tiap item per area dari inspeksi_fasilitas (foto + tanggal).
 *   Master Item   : daftar item per jenis & petugas utilitas (settings/master_kondisi_aset).
 * Pemindahan sekali jalan: tiket Helpdesk lama "[Temuan Inspeksi Mingguan]" -> temuan_aset (status dibawa),
 * tiketnya ditandai "Dipindahkan" (disembunyikan dari Helpdesk, tidak dihapus).
 */

import { useEffect, useState } from "react";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import Modal from "../../../components/ui/Modal";
import { daerahTulis } from "../../../lib/daerah";
import PetugasUtilitasPicker from "../../../components/PetugasUtilitasPicker";
import { dataUrlKeCloudinary } from "../../../lib/uploadFoto";
import {
  JENIS_INSPEKSI, KONDISI, LABEL_JENIS, LABEL_TINDAKAN, MASTER_KONDISI_BAWAAN, STATUS_TEMUAN, STATUS_TEMUAN_TERBUKA, WARNA_KONDISI, WARNA_STATUS_TEMUAN,
  kodeTemuan, kondisiBermasalah, tebakJenisDariItem, useMasterKondisiAset,
  type InspeksiAsetLog, type JenisInspeksi, type MasterKondisiAset, type StatusTemuan, type TemuanAset,
} from "../../../lib/kondisiAset";

const PREFIX_LAMA = "[Temuan Inspeksi Mingguan]";
const tgl = (ts?: Timestamp | null) => (ts ? ts.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
const salin = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function Pill({ teks, w }: { teks: string; w: { bg: string; fg: string } }) {
  return <span style={{ fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "999px", background: w.bg, color: w.fg, whiteSpace: "nowrap" }}>{teks}</span>;
}

function EditorItem({ judul, daftar, onUbah }: { judul: string; daftar: { nama: string; aktif: boolean }[]; onUbah: (d: { nama: string; aktif: boolean }[]) => void }) {
  const [baru, setBaru] = useState("");
  const tambah = () => { if (!baru.trim()) return; onUbah([...daftar, { nama: baru.trim(), aktif: true }]); setBaru(""); };
  return (
    <Tile>
      <h3 style={{ margin: "0 0 10px", fontSize: "15px", fontWeight: 800 }}>{judul} <span style={{ fontSize: "12px", color: "var(--muted)" }}>{daftar.filter((x) => x.aktif !== false).length} aktif</span></h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {daftar.map((x, i) => (
          <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input className="ka-in" value={x.nama} onChange={(e) => onUbah(daftar.map((y, j) => (j === i ? { ...y, nama: e.target.value } : y)))} aria-label={`Item ${i + 1}`} />
            <button type="button" className="ka-pil" style={x.aktif !== false ? { background: "var(--ok-50)", color: "var(--ok)" } : { background: "var(--warn-solid)", color: "#fff" }} onClick={() => onUbah(daftar.map((y, j) => (j === i ? { ...y, aktif: !(y.aktif !== false) } : y)))}>{x.aktif !== false ? "Aktif" : "Nonaktif"}</button>
            <button type="button" className="ka-pil" style={{ background: "var(--red-50)", color: "var(--red-600)" }} onClick={() => onUbah(daftar.filter((_, j) => j !== i))} aria-label={`Hapus ${x.nama}`}>Hapus</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
          <input className="ka-in" placeholder="Item baru" value={baru} onChange={(e) => setBaru(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tambah(); } }} />
          <button type="button" className="sa-btn is-soft" onClick={tambah}>+</button>
        </div>
      </div>
    </Tile>
  );
}

export default function KondisiAsetPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const [tab, setTab] = useState<"TEMUAN" | "KONDISI" | "MASTER">("TEMUAN");
  const [temuan, setTemuan] = useState<TemuanAset[]>([]);
  const [inspeksi, setInspeksi] = useState<InspeksiAsetLog[]>([]);
  const [filterJenis, setFilterJenis] = useState<JenisInspeksi | "SEMUA">("SEMUA");
  const [filterStatus, setFilterStatus] = useState<"TERBUKA" | "SELESAI" | "DITOLAK" | "SEMUA">("TERBUKA");
  const [pilih, setPilih] = useState<TemuanAset | null>(null);
  const [form, setForm] = useState({ status: "Baru" as StatusTemuan, rencana: "", catatan_admin: "", alasan_tolak: "", biaya: "", foto_hasil: "" });
  const [menyimpan, setMenyimpan] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [lama, setLama] = useState<{ id: string; data: Record<string, unknown> }[] | null>(null);
  const masterHook = useMasterKondisiAset();
  const [draftMaster, setDraftMaster] = useState<MasterKondisiAset | null>(null);
  const master = draftMaster || masterHook.nilai;

  useEffect(() => {
    if (!isReady) return;
    const u1 = onSnapshot(query(collection(db, "temuan_aset"), orderBy("waktu_lapor", "desc"), limit(500)), (s) => setTemuan(s.docs.map((d) => ({ id: d.id, ...d.data() } as TemuanAset))), (e) => console.error("[aset] temuan:", e));
    const u2 = onSnapshot(query(collection(db, "inspeksi_fasilitas"), orderBy("waktu_selesai", "desc"), limit(300)), (s) => setInspeksi(s.docs.map((d) => ({ id: d.id, ...d.data() } as InspeksiAsetLog))), (e) => console.error("[aset] inspeksi:", e));
    // Tiket Helpdesk lama hasil inspeksi yang belum dipindahkan
    getDocs(query(collection(db, "helpdesk_tickets"), where("deskripsi", ">=", PREFIX_LAMA), where("deskripsi", "<", PREFIX_LAMA + "")))
      .then((s) => setLama(s.docs.filter((d) => !["Dipindahkan", "Dihapus"].includes(d.data().status)).map((d) => ({ id: d.id, data: d.data() }))))
      .catch((e) => { console.error("[aset] tiket lama:", e); setLama([]); });
    return () => { u1(); u2(); };
  }, [isReady]);

  if (!isReady) return null;

  const tampil = temuan.filter((t) => (filterJenis === "SEMUA" || t.jenis === filterJenis)
    && (filterStatus === "SEMUA" || (filterStatus === "TERBUKA" ? STATUS_TEMUAN_TERBUKA.includes(t.status) : filterStatus === "SELESAI" ? t.status === "Selesai" : t.status === "Ditolak")));
  const hitung = (j: JenisInspeksi | "SEMUA") => temuan.filter((t) => (j === "SEMUA" || t.jenis === j) && STATUS_TEMUAN_TERBUKA.includes(t.status)).length;
  const final = (t: TemuanAset) => t.status === "Selesai" || t.status === "Ditolak";

  const buka = (t: TemuanAset) => { setPilih(t); setForm({ status: t.status, rencana: t.rencana || "", catatan_admin: t.catatan_admin || "", alasan_tolak: t.alasan_tolak || "", biaya: t.biaya ? String(t.biaya) : "", foto_hasil: t.foto_hasil || "" }); };
  const fotoHasil = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); const k = Math.min(1, 700 / img.width); c.width = img.width * k; c.height = img.height * k; c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height); setForm((f) => ({ ...f, foto_hasil: c.toDataURL("image/jpeg", 0.65) })); }; img.src = String(r.result); };
    r.readAsDataURL(file);
  };
  const simpan = async () => {
    if (!pilih || final(pilih)) return;
    if (form.status === "Selesai" && !form.foto_hasil) return showToast("Lampirkan foto hasil untuk menutup temuan.", "warning");
    if (form.status === "Ditolak" && !form.alasan_tolak.trim()) return showToast("Isi alasan penolakan.", "warning");
    setMenyimpan(true);
    try {
      await updateDoc(doc(db, "temuan_aset", pilih.id), {
        status: form.status, rencana: form.rencana, catatan_admin: form.catatan_admin.trim(), ditangani_oleh: session?.nama || "-",
        ...(form.status === "Ditolak" ? { alasan_tolak: form.alasan_tolak.trim(), waktu_selesai: serverTimestamp() } : {}),
        ...(form.status === "Selesai" ? { biaya: Number(form.biaya.replace(/\D/g, "")) || 0, foto_hasil: (await dataUrlKeCloudinary(form.foto_hasil, "sibm/temuan-aset")) || form.foto_hasil, waktu_selesai: serverTimestamp() } : {}),
      });
      showToast(`${kodeTemuan(pilih.id)} → ${form.status}`, "success");
      setPilih(null);
    } catch (e) { console.error(e); showToast("Gagal menyimpan.", "error"); }
    finally { setMenyimpan(false); }
  };

  const pindahkanLama = async () => {
    if (!lama?.length) return;
    if (!(await confirm({ title: "Pindahkan tiket lama", message: `Pindahkan ${lama.length} tiket Helpdesk hasil inspeksi ke daftar Temuan? Tiketnya ditandai "Dipindahkan" dan tidak tampil lagi di Helpdesk (tidak dihapus).`, confirmText: "Pindahkan" }))) return;
    setMenyimpan(true);
    try {
      const peta: Record<string, StatusTemuan> = { Menunggu: "Baru", "Sedang Dikerjakan": "Dikerjakan", Selesai: "Selesai", "Tidak Dijalankan": "Ditolak" };
      for (let i = 0; i < lama.length; i += 200) {
        const batch = writeBatch(db);
        for (const { id, data: d } of lama.slice(i, i + 200)) {
          const lokasi = String(d.lokasi || "");
          const pisah = lokasi.indexOf(" - ");
          const area = pisah > 0 ? lokasi.slice(0, pisah) : lokasi;
          const item = pisah > 0 ? lokasi.slice(pisah + 3) : lokasi;
          const ref = doc(collection(db, "temuan_aset"));
          batch.set(ref, {
            daerah: (d.daerah as string) || daerahTulis(), jenis: tebakJenisDariItem(item), area, item, kondisi: "Rusak",
            catatan: String(d.deskripsi || "").replace(PREFIX_LAMA, "").trim(), foto: d.foto_awal || "", pelapor: d.nama_pelapor || "-",
            waktu_lapor: d.waktu_lapor || serverTimestamp(), status: peta[String(d.status)] || "Baru", dari_helpdesk_id: id,
            ...(d.foto_proses ? { foto_hasil: d.foto_proses } : {}), ...(d.waktu_selesai ? { waktu_selesai: d.waktu_selesai } : {}),
            ...(typeof d.biaya === "number" ? { biaya: d.biaya } : {}), ...(d.alasan_tidak_dijalankan ? { alasan_tolak: d.alasan_tidak_dijalankan } : {}),
          });
          batch.update(doc(db, "helpdesk_tickets", id), { status: "Dipindahkan", status_sebelum_pindah: d.status || "", dipindahkan_ke: ref.id, waktu_dipindahkan: serverTimestamp() });
        }
        await batch.commit();
      }
      showToast(`${lama.length} tiket dipindahkan ke Temuan.`, "success");
      setLama([]);
    } catch (e) { console.error(e); showToast("Gagal memindahkan.", "error"); }
    finally { setMenyimpan(false); }
  };

  const simpanMaster = async () => {
    if (!draftMaster) return;
    setMenyimpan(true);
    try {
      const { petugas_utilitas: _abaikan, ...itemSaja } = salin(draftMaster); void _abaikan; // petugas disimpan terpisah (PetugasUtilitasPicker)
      await setDoc(doc(db, "settings", "master_kondisi_aset"), { ...itemSaja, diperbarui_oleh: session?.nama || "-", diperbarui_pada: serverTimestamp() }, { merge: true });
      setDraftMaster(null);
      showToast("Master item tersimpan. Halaman OB langsung memakai daftar baru.", "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan master.", "error"); }
    finally { setMenyimpan(false); }
  };
  const ubahMaster = (fn: (m: MasterKondisiAset) => void) => { const m = salin(master); fn(m); setDraftMaster(m); };

  // Kondisi terkini: hasil terbaru per (jenis, area, item)
  const terkini = new Map<string, { jenis: JenisInspeksi; area: string; item: string; kondisi: string; foto: string; catatan: string; waktu: Timestamp | null; pic: string }>();
  for (const log of inspeksi) for (const h of log.hasil || []) {
    const j = (log.jenis || "gedung") as JenisInspeksi;
    const k = `${j}|${log.area}|${h.nama.toLowerCase()}`;
    if (!terkini.has(k)) terkini.set(k, { jenis: j, area: log.area, item: h.nama, kondisi: h.kondisi, foto: h.foto, catatan: h.catatan, waktu: log.waktu_selesai, pic: log.pic_bertugas });
  }
  const daftarTerkini = Array.from(terkini.values()).filter((x) => filterJenis === "SEMUA" || x.jenis === filterJenis);
  const areaTerkini = Array.from(new Set(daftarTerkini.map((x) => `${x.jenis}|${x.area}`)));
  const fotoAreaTerakhir = (j: string, area: string) => inspeksi.find((l) => (l.jenis || "gedung") === j && l.area === area)?.foto_area;

  return (
    <AdminShell title="Temuan & Kondisi Aset" subtitle="Hasil inspeksi OB: perbaikan gedung, penggantian alat, utilitas — terpisah dari Helpdesk" userName={session?.nama || "Admin"}
      actions={tab === "MASTER" && draftMaster ? <div style={{ display: "flex", gap: "6px" }}><button type="button" className="sa-btn is-soft" onClick={() => setDraftMaster(null)}>Batal</button><button type="button" className="sa-btn is-primary" onClick={simpanMaster} disabled={menyimpan}>Simpan master</button></div> : undefined}>
      <style dangerouslySetInnerHTML={{ __html: `
        .ka-in { flex: 1; width: 100%; min-width: 0; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 13px; font-family: inherit; box-sizing: border-box; }
        .ka-pil { border: none; border-radius: 10px; padding: 7px 10px; font-family: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; white-space: nowrap; }
        .ka-chip { border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); border-radius: 999px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .ka-chip span { opacity: .65; margin-left: 4px; }
        .ka-chip.on { background: var(--ink); color: var(--surface); border-color: transparent; }
        .ka-card { display: grid; grid-template-columns: 76px minmax(0,1fr) auto; gap: 14px; align-items: start; padding: 14px; border-radius: 16px; border: 1px solid var(--line); background: var(--surface); }
        .ka-card.done { background: var(--bg); }
        .ka-foto { width: 76px; height: 76px; object-fit: cover; border-radius: 12px; cursor: zoom-in; display: block; background: var(--line); }
        @media (max-width: 640px) { .ka-card { grid-template-columns: 60px minmax(0,1fr); } .ka-foto { width: 60px; height: 60px; } .ka-card > :last-child { grid-column: 1 / -1; } }
      ` }} />

      <div className="sa-tabs" role="tablist" style={{ width: "fit-content", maxWidth: "100%", marginBottom: "14px" }}>
        {([["TEMUAN", `Temuan (${hitung("SEMUA")} terbuka)`], ["KONDISI", "Kondisi Terkini"], ["MASTER", "Master Item"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sa-tab${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {lama && lama.length > 0 && tab === "TEMUAN" && (
        <Tile style={{ marginBottom: "14px", border: "1px solid var(--warn)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: "13px", color: "var(--ink)" }}><b>{lama.length} tiket Helpdesk lama</b> berasal dari inspeksi OB ({PREFIX_LAMA}). Pindahkan ke daftar Temuan agar Helpdesk hanya berisi laporan pengguna kantor.</div>
            <button type="button" className="sa-btn is-primary" onClick={pindahkanLama} disabled={menyimpan}>{menyimpan ? "Memindahkan..." : `Pindahkan ${lama.length} tiket`}</button>
          </div>
        </Tile>
      )}

      {tab !== "MASTER" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
          {(["SEMUA", ...JENIS_INSPEKSI] as const).map((j) => (
            <button key={j} type="button" className={`ka-chip${filterJenis === j ? " on" : ""}`} onClick={() => setFilterJenis(j)}>
              {j === "SEMUA" ? "Semua" : tab === "TEMUAN" ? LABEL_TINDAKAN[j] : LABEL_JENIS[j]}{tab === "TEMUAN" && <span>{hitung(j)}</span>}
            </button>
          ))}
          {tab === "TEMUAN" && <>
            <span style={{ width: "10px" }} />
            {([["TERBUKA", "Terbuka"], ["SELESAI", "Selesai"], ["DITOLAK", "Ditolak"], ["SEMUA", "Semua status"]] as const).map(([k, l]) => (
              <button key={k} type="button" className={`ka-chip${filterStatus === k ? " on" : ""}`} onClick={() => setFilterStatus(k)}>{l}</button>
            ))}
          </>}
        </div>
      )}

      {/* ================= TEMUAN ================= */}
      {tab === "TEMUAN" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {tampil.length === 0 ? <Tile><div style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>Tidak ada temuan pada filter ini.</div></Tile> : tampil.map((t) => (
            <article key={t.id} className={`ka-card${final(t) ? " done" : ""}`}>
              {t.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.foto} alt={t.item} className="ka-foto" onClick={() => setPreview(t.foto)} />
              ) : <div className="ka-foto" />}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <Pill teks={t.status} w={WARNA_STATUS_TEMUAN[t.status]} />
                  <b style={{ fontSize: "14px", color: "var(--ink)" }}>{t.item}</b>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>· {t.area}</span>
                  <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "999px", background: "var(--bg)", color: "var(--ink-soft)" }}>{LABEL_TINDAKAN[t.jenis]}</span>
                  <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--muted)" }}>{kodeTemuan(t.id)} · {tgl(t.waktu_lapor)}</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "13.5px", color: "var(--ink)" }}><b style={{ color: (WARNA_KONDISI[t.kondisi] || WARNA_KONDISI.Rusak).fg }}>{t.kondisi}</b> — {t.catatan}</p>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                  Pelapor {t.pelapor}{t.rencana ? ` · rencana ${t.rencana.split("-").reverse().join("/")}` : ""}{t.catatan_admin ? ` · ${t.catatan_admin}` : ""}
                  {t.status === "Selesai" && <> · selesai {tgl(t.waktu_selesai)}{t.biaya ? ` · Rp ${new Intl.NumberFormat("id-ID").format(t.biaya)}` : ""}</>}
                </div>
                {t.status === "Ditolak" && t.alasan_tolak && <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>Ditolak: {t.alasan_tolak}</div>}
                {t.dari_helpdesk_id && <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--muted)" }}>Dipindahkan dari Helpdesk</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                {t.foto_hasil && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.foto_hasil} alt="Hasil" title="Foto hasil" onClick={() => setPreview(t.foto_hasil!)} style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "10px", border: "2px solid var(--ok)", cursor: "zoom-in" }} />
                )}
                <button type="button" className={`sa-btn ${final(t) ? "is-soft" : "is-primary"}`} onClick={() => buka(t)}>{final(t) ? "Lihat detail" : "Tindak lanjuti"}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ================= KONDISI TERKINI ================= */}
      {tab === "KONDISI" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "14px", alignItems: "start" }}>
          {areaTerkini.length === 0 ? <Tile><div style={{ color: "var(--muted)", textAlign: "center" }}>Belum ada data inspeksi.</div></Tile> : areaTerkini.map((ka) => {
            const [j, area] = ka.split("|");
            const isi = daftarTerkini.filter((x) => x.jenis === j && x.area === area && x.kondisi !== "Tidak Ada").sort((a, b) => a.item.localeCompare(b.item));
            const baik = isi.filter((x) => x.kondisi === "Baik").length;
            const fa = fotoAreaTerakhir(j, area);
            return (
              <Tile key={ka}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
                  {fa && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fa} alt={area} onClick={() => setPreview(fa)} style={{ width: "54px", height: "42px", objectFit: "cover", borderRadius: "8px", cursor: "zoom-in" }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>{LABEL_JENIS[j as JenisInspeksi]}</div>
                    <b style={{ fontSize: "15px" }}>{area}</b>
                  </div>
                  <b style={{ fontSize: "18px", color: baik === isi.length ? "var(--ok)" : "var(--warn)" }}>{isi.length ? Math.round((baik / isi.length) * 100) : 0}%</b>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {isi.map((x) => (
                    <div key={x.item} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) auto", gap: "8px", alignItems: "center", padding: "5px 6px", borderRadius: "10px", background: kondisiBermasalah(x.kondisi) ? "var(--red-50)" : "transparent" }}>
                      {x.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={x.foto} alt="" onClick={() => setPreview(x.foto)} style={{ width: "34px", height: "34px", objectFit: "cover", borderRadius: "8px", cursor: "zoom-in" }} />
                      ) : <span />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.item}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tgl(x.waktu)} · {x.pic}{x.catatan ? ` · ${x.catatan}` : ""}</div>
                      </div>
                      <Pill teks={x.kondisi} w={WARNA_KONDISI[x.kondisi] || WARNA_KONDISI.Baik} />
                    </div>
                  ))}
                </div>
              </Tile>
            );
          })}
        </div>
      )}

      {/* ================= MASTER ================= */}
      {tab === "MASTER" && (
        <>
          {masterHook.dariBawaan && !draftMaster && <Tile style={{ marginBottom: "12px" }}><div style={{ fontSize: "12.5px", color: "var(--warn)", fontWeight: 700 }}>Masih memakai daftar bawaan. Ubah lalu simpan untuk menyesuaikan dengan gedung.</div></Tile>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "14px", alignItems: "start" }}>
            {JENIS_INSPEKSI.map((j) => (
              <EditorItem key={j} judul={`${LABEL_JENIS[j]} · ${KONDISI[j].join(" / ")}`} daftar={master[j]} onUbah={(d) => ubahMaster((m) => { m[j] = d; })} />
            ))}
            <Tile>
              <PetugasUtilitasPicker oleh={session?.nama || "Admin"} />
            </Tile>
          </div>
          {draftMaster && <p style={{ fontSize: "12px", color: "var(--warn)", fontWeight: 700 }}>Ada perubahan belum disimpan — tekan &quot;Simpan master&quot; di atas.</p>}
          <p style={{ fontSize: "11.5px", color: "var(--muted)" }}>Bawaan awal: {MASTER_KONDISI_BAWAAN.gedung.length} item gedung, {MASTER_KONDISI_BAWAAN.alat.length} alat, {MASTER_KONDISI_BAWAAN.utilitas.length} utilitas.</p>
        </>
      )}

      {/* ================= MODAL TINDAK LANJUT ================= */}
      <Modal open={!!pilih} onClose={() => !menyimpan && setPilih(null)} maxWidth="560px">
        {pilih && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>{LABEL_TINDAKAN[pilih.jenis]} · {kodeTemuan(pilih.id)}</h3>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--muted)" }}>{pilih.area} — <b style={{ color: "var(--ink)" }}>{pilih.item}</b> · {pilih.kondisi}: {pilih.catatan}</p>
            {pilih.foto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pilih.foto} alt="Foto temuan" style={{ width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "12px", marginBottom: "12px" }} />
            )}
            {final(pilih) ? (
              <div style={{ padding: "12px 14px", borderRadius: "12px", background: pilih.status === "Selesai" ? "var(--ok-50)" : "var(--line)", fontSize: "13px" }}>
                🔒 <b>{pilih.status}</b> — status final, tidak bisa diubah. {pilih.status === "Selesai" ? `Selesai ${tgl(pilih.waktu_selesai)}${pilih.biaya ? ` · Rp ${new Intl.NumberFormat("id-ID").format(pilih.biaya)}` : ""}` : `Alasan: ${pilih.alasan_tolak || "-"}`}
                {pilih.foto_hasil && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pilih.foto_hasil} alt="Foto hasil" style={{ width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "10px", marginTop: "10px" }} />
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {STATUS_TEMUAN.map((s) => (
                    <button key={s} type="button" className={`ka-chip${form.status === s ? " on" : ""}`} onClick={() => setForm({ ...form, status: s })}>{s}</button>
                  ))}
                </div>
                {(form.status === "Dijadwalkan" || form.status === "Dikerjakan") && (
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>Rencana / target tanggal<input type="date" className="ka-in" style={{ marginTop: "4px" }} value={form.rencana} onChange={(e) => setForm({ ...form, rencana: e.target.value })} /></label>
                )}
                <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>Catatan tindakan<input className="ka-in" style={{ marginTop: "4px" }} value={form.catatan_admin} onChange={(e) => setForm({ ...form, catatan_admin: e.target.value })} placeholder={pilih.jenis === "alat" ? "Mis. dibelikan mop baru 2 pcs" : "Mis. ganti lampu oleh teknisi / vendor"} /></label>
                {form.status === "Ditolak" && (
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>Alasan ditolak *<input className="ka-in" style={{ marginTop: "4px" }} value={form.alasan_tolak} onChange={(e) => setForm({ ...form, alasan_tolak: e.target.value })} placeholder="Mis. masih layak pakai / bukan tanggung jawab gedung" /></label>
                )}
                {form.status === "Selesai" && (
                  <>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>Biaya (opsional, Rp — masuk realisasi anggaran)<input className="ka-in" inputMode="numeric" style={{ marginTop: "4px" }} value={form.biaya ? new Intl.NumberFormat("id-ID").format(Number(form.biaya)) : ""} onChange={(e) => setForm({ ...form, biaya: e.target.value.replace(/\D/g, "") })} /></label>
                    <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", borderRadius: "12px", border: `1px dashed ${form.foto_hasil ? "var(--ok)" : "var(--red-600)"}`, cursor: "pointer", fontSize: "12.5px", fontWeight: 700, color: form.foto_hasil ? "var(--ok)" : "var(--red-600)" }}>
                      {form.foto_hasil ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={form.foto_hasil} alt="Foto hasil" style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "8px" }} />
                      ) : "📷"}
                      {form.foto_hasil ? "Foto hasil terlampir — ketuk untuk ganti" : "Foto hasil (wajib untuk Selesai)"}
                      <input type="file" accept="image/*" capture="environment" onChange={fotoHasil} style={{ display: "none" }} />
                    </label>
                  </>
                )}
                <button type="button" className="sa-btn is-primary" onClick={simpan} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Simpan"}</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} maxWidth="640px">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="Foto" style={{ width: "100%", borderRadius: "12px" }} />}
      </Modal>
    </AdminShell>
  );
}
