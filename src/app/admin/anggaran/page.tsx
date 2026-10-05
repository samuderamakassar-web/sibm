"use client";

/**
 * Anggaran & Realisasi (§89). Pagu tahunan per kategori di anggaran/{tahun}; realisasi digabung dari:
 *   - helpdesk_tickets (status Selesai, field biaya > 0, waktu_selesai di tahun itu) -> "Perbaikan Gedung"
 *   - kendaraan_service_logs (biaya teks bebas, diambil angkanya, tanggal di tahun itu) -> "Kendaraan & Servis"
 *   - realisasi_biaya (input manual Admin GA, kategori bebas)
 * Koleksi anggaran & realisasi_biaya tidak bisa dibaca publik (rules: hanya akun staf).
 */

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import { daerahTulis } from "../../../lib/daerah";

const KAT_PERBAIKAN = "Perbaikan Gedung";
const KAT_KENDARAAN = "Kendaraan & Servis";
const KATEGORI_BAWAAN = [KAT_PERBAIKAN, KAT_KENDARAAN, "ATK", "Kebersihan & Chemical", "Utilitas (Listrik/Air)", "Keamanan", "Lain-lain"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const rupiah = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));
const ringkas = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(Math.round(n));
const angka = (s: unknown) => Number(String(s ?? "").replace(/\D/g, "")) || 0;

interface Pos { nama: string; pagu: number }
interface Realisasi { id: string; sumber: "perbaikan" | "servis" | "manual"; kategori: string; tanggal: string; uraian: string; jumlah: number }

export default function AnggaranPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const tahunIni = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()).slice(0, 4));
  const [tahun, setTahun] = useState(tahunIni);
  const [pos, setPos] = useState<Pos[]>(KATEGORI_BAWAAN.map((nama) => ({ nama, pagu: 0 })));
  const [editPagu, setEditPagu] = useState(false);
  const [manual, setManual] = useState<Realisasi[]>([]);
  const [otomatis, setOtomatis] = useState<Realisasi[] | null>(null);
  const [form, setForm] = useState({ tanggal: "", kategori: KATEGORI_BAWAAN[2], uraian: "", jumlah: "" });
  const [katBaru, setKatBaru] = useState("");
  const [filterKat, setFilterKat] = useState("Semua");

  const awal = `${tahun}-01-01`;
  const akhir = `${tahun + 1}-01-01`;

  useEffect(() => {
    if (!isReady) return;
    const u1 = onSnapshot(doc(db, "anggaran", String(tahun)), (s) => {
      const k = s.data()?.kategori as Pos[] | undefined;
      setPos(Array.isArray(k) && k.length ? k : KATEGORI_BAWAAN.map((nama) => ({ nama, pagu: 0 })));
    });
    const u2 = onSnapshot(query(collection(db, "realisasi_biaya"), where("tanggal", ">=", awal), where("tanggal", "<", akhir)), (s) => {
      setManual(s.docs.map((d) => ({ id: d.id, sumber: "manual", ...(d.data() as Omit<Realisasi, "id" | "sumber">) })));
    }, (e) => console.error(e));
    let batal = false;
    (async () => {
      const hasil: Realisasi[] = [];
      try {
        const t = await getDocs(query(collection(db, "helpdesk_tickets"), where("waktu_selesai", ">=", Timestamp.fromDate(new Date(`${awal}T00:00:00+08:00`))), where("waktu_selesai", "<", Timestamp.fromDate(new Date(`${akhir}T00:00:00+08:00`)))));
        t.docs.forEach((d) => {
          const x = d.data();
          if (!(x.biaya > 0)) return;
          const tgl = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(x.waktu_selesai.toDate());
          hasil.push({ id: `hd-${d.id}`, sumber: "perbaikan", kategori: KAT_PERBAIKAN, tanggal: tgl, uraian: `${x.lokasi || "-"}: ${x.deskripsi || ""}`.slice(0, 140), jumlah: x.biaya });
        });
      } catch (e) { console.error("[anggaran] helpdesk:", e); }
      try {
        const s = await getDocs(query(collection(db, "kendaraan_service_logs"), where("tanggal", ">=", awal), where("tanggal", "<", akhir)));
        s.docs.forEach((d) => {
          const x = d.data();
          const n = angka(x.biaya);
          if (!n) return;
          const jenis = x.jenis_service || "Servis";
          hasil.push({ id: `sv-${d.id}`, sumber: "servis", kategori: KAT_KENDARAAN, tanggal: x.tanggal, uraian: `${String(x.kendaraan || "").split(" - ")[0]}: ${jenis}`, jumlah: n });
        });
      } catch (e) { console.error("[anggaran] servis:", e); }
      if (!batal) setOtomatis(hasil);
    })();
    return () => { batal = true; u1(); u2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, tahun]);

  if (!isReady) return null;

  const semua = [...(otomatis || []), ...manual].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  const kategoriSemua = Array.from(new Set([...pos.map((p) => p.nama), ...semua.map((r) => r.kategori)]));
  const realPer = (k: string) => semua.filter((r) => r.kategori === k).reduce((a, r) => a + r.jumlah, 0);
  const totalPagu = pos.reduce((a, p) => a + (p.pagu || 0), 0);
  const totalReal = semua.reduce((a, r) => a + r.jumlah, 0);
  const perBulan = BULAN.map((_, i) => semua.filter((r) => Number(r.tanggal.slice(5, 7)) === i + 1).reduce((a, r) => a + r.jumlah, 0));
  const maksBulan = Math.max(1, ...perBulan, totalPagu / 12);
  const bulanBerjalan = tahun === tahunIni ? Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()).slice(5, 7)) : 12;
  const warnaSerapan = (p: number) => (p > 100 ? "var(--red-600)" : p >= 80 ? "var(--warn)" : "var(--ok)");

  const simpanPagu = async () => {
    try {
      await setDoc(doc(db, "anggaran", String(tahun)), { tahun, kategori: pos.map((p) => ({ nama: p.nama.trim(), pagu: p.pagu || 0 })).filter((p) => p.nama), daerah: daerahTulis(), diperbarui_oleh: session?.nama || "-", diperbarui_pada: serverTimestamp() });
      setEditPagu(false);
      showToast("Anggaran tersimpan.", "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan anggaran.", "error"); }
  };

  const tambahRealisasi = async () => {
    const jumlah = angka(form.jumlah);
    if (!form.tanggal || !form.uraian.trim() || !jumlah) return showToast("Isi tanggal, uraian & jumlah.", "warning");
    try {
      await addDoc(collection(db, "realisasi_biaya"), { daerah: daerahTulis(), tanggal: form.tanggal, kategori: form.kategori, uraian: form.uraian.trim(), jumlah, dicatat_oleh: session?.nama || "-", dibuat_pada: serverTimestamp() });
      setForm((f) => ({ ...f, uraian: "", jumlah: "" }));
      showToast("Realisasi dicatat.", "success");
    } catch (e) { console.error(e); showToast("Gagal mencatat realisasi.", "error"); }
  };

  const hapus = async (r: Realisasi) => {
    if (!(await confirm({ title: "Hapus realisasi", message: `Hapus "${r.uraian}" (${rupiah(r.jumlah)})?`, confirmText: "Hapus", cancelText: "Batal", variant: "danger" }))) return;
    await deleteDoc(doc(db, "realisasi_biaya", r.id)).catch(() => showToast("Gagal menghapus.", "error"));
  };

  const tampil = semua.filter((r) => filterKat === "Semua" || r.kategori === filterKat);
  const inp = { padding: "9px 10px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: "13px", minWidth: 0 } as const;

  return (
    <AdminShell title="Anggaran & Realisasi" subtitle="Pagu per kategori vs biaya aktual — otomatis dari Helpdesk (perbaikan) & servis kendaraan" userName={session?.nama || "Admin"}
      actions={<select className="sa-field" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} aria-label="Tahun anggaran">{[tahunIni + 1, tahunIni, tahunIni - 1, tahunIni - 2].map((t) => <option key={t} value={t}>{t}</option>)}</select>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "16px" }}>
        {[
          ["Total anggaran", rupiah(totalPagu), `tahun ${tahun}`, "var(--ink)"],
          ["Realisasi", rupiah(totalReal), otomatis === null ? "memuat..." : `${semua.length} transaksi`, "var(--ink)"],
          ["Serapan", totalPagu ? `${Math.round((totalReal / totalPagu) * 100)}%` : "-", `target s.d. bulan ini ${Math.round((bulanBerjalan / 12) * 100)}%`, warnaSerapan(totalPagu ? (totalReal / totalPagu) * 100 : 0)],
          ["Sisa anggaran", rupiah(Math.max(0, totalPagu - totalReal)), totalReal > totalPagu && totalPagu ? `lebih ${rupiah(totalReal - totalPagu)}` : "tersedia", totalReal > totalPagu && totalPagu ? "var(--red-600)" : "var(--ok)"],
        ].map(([l, v, s, w]) => (
          <Tile key={l} compact><div style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>{l}</div><div style={{ fontSize: "21px", fontWeight: 800, color: w, fontVariantNumeric: "tabular-nums" }}>{v}</div><div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{s}</div></Tile>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))", gap: "16px", alignItems: "start" }}>
        <Tile>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>Anggaran vs realisasi per kategori</h2>
            {editPagu
              ? <div style={{ display: "flex", gap: "6px" }}><button type="button" className="sa-btn is-soft" style={{ height: "34px" }} onClick={() => setEditPagu(false)}>Batal</button><button type="button" className="sa-btn is-primary" style={{ height: "34px" }} onClick={simpanPagu}>Simpan</button></div>
              : <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} onClick={() => setEditPagu(true)}>Atur anggaran</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {(editPagu ? pos.map((p) => p.nama) : kategoriSemua).map((k, i) => {
              const pagu = pos.find((p) => p.nama === k)?.pagu || 0;
              const real = realPer(k);
              const pct = pagu ? (real / pagu) * 100 : real ? 100 : 0;
              if (editPagu) {
                return (
                  <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <input style={{ ...inp, flex: 1 }} value={pos[i].nama} onChange={(e) => setPos((l) => l.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
                    <input style={{ ...inp, width: "150px" }} inputMode="numeric" placeholder="Pagu (Rp)" value={pos[i].pagu || ""} onChange={(e) => setPos((l) => l.map((x, j) => (j === i ? { ...x, pagu: angka(e.target.value) } : x)))} />
                    <button type="button" className="sa-btn is-soft" style={{ height: "34px", color: "var(--red-600)" }} onClick={() => setPos((l) => l.filter((_, j) => j !== i))}>Hapus</button>
                  </div>
                );
              }
              return (
                <div key={k}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
                    <span style={{ fontWeight: 700 }}>{k}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-soft)", flexShrink: 0 }}>{ringkas(real)} / {pagu ? ringkas(pagu) : "—"} {pagu ? <b style={{ color: warnaSerapan(pct) }}>{Math.round(pct)}%</b> : null}</span>
                  </div>
                  <div style={{ height: "10px", borderRadius: "5px", background: "var(--line)", overflow: "hidden", marginTop: "4px" }}>
                    <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: warnaSerapan(pct) }} />
                  </div>
                </div>
              );
            })}
            {editPagu && (
              <div style={{ display: "flex", gap: "6px" }}>
                <input style={{ ...inp, flex: 1 }} placeholder="Kategori baru" value={katBaru} onChange={(e) => setKatBaru(e.target.value)} />
                <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} onClick={() => { if (!katBaru.trim()) return; setPos((l) => [...l, { nama: katBaru.trim(), pagu: 0 }]); setKatBaru(""); }}>+ Kategori</button>
              </div>
            )}
          </div>
          <p style={{ margin: "12px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>&quot;{KAT_PERBAIKAN}&quot; otomatis dari biaya tiket Helpdesk yang ditutup; &quot;{KAT_KENDARAAN}&quot; dari biaya servis yang diinput driver.</p>
        </Tile>

        <Tile>
          <h2 style={{ margin: "0 0 12px", fontSize: "16px", fontWeight: 800 }}>Realisasi per bulan</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: "4px", alignItems: "end", height: "160px", position: "relative" }}>
            {totalPagu > 0 && <div title="Rata-rata anggaran per bulan" style={{ position: "absolute", left: 0, right: 0, bottom: `${((totalPagu / 12) / maksBulan) * 100}%`, borderTop: "2px dashed var(--muted)" }} />}
            {perBulan.map((v, i) => (
              <div key={i} title={`${BULAN[i]}: ${rupiah(v)}`} style={{ height: `${Math.max(2, (v / maksBulan) * 100)}%`, background: totalPagu && v > totalPagu / 12 ? "var(--warn-solid)" : "var(--info-solid)", borderRadius: "6px 6px 2px 2px", opacity: i + 1 > bulanBerjalan ? 0.35 : 1 }} />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: "4px", marginTop: "6px" }}>
            {BULAN.map((b) => <span key={b} style={{ fontSize: "10px", textAlign: "center", color: "var(--muted)" }}>{b}</span>)}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Garis putus = rata-rata anggaran per bulan; batang oranye = bulan di atas rata-rata.</p>
        </Tile>
      </div>

      <Tile style={{ marginTop: "16px" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: 800 }}>Catat realisasi lain</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
          <input type="date" style={inp} value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} aria-label="Tanggal" />
          <select style={inp} value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} aria-label="Kategori">{pos.map((p) => <option key={p.nama}>{p.nama}</option>)}</select>
          <input style={{ ...inp, gridColumn: "span 2" }} placeholder="Uraian, mis. Beli chemical lantai 20 L" value={form.uraian} onChange={(e) => setForm({ ...form, uraian: e.target.value })} />
          <input style={inp} inputMode="numeric" placeholder="Jumlah (Rp)" value={form.jumlah} onChange={(e) => setForm({ ...form, jumlah: e.target.value })} />
          <button type="button" className="sa-btn is-primary" onClick={tambahRealisasi}>+ Catat</button>
        </div>
      </Tile>

      <Tile style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>Daftar realisasi {tahun}</h2>
          <select className="sa-field" value={filterKat} onChange={(e) => setFilterKat(e.target.value)} aria-label="Filter kategori"><option>Semua</option>{kategoriSemua.map((k) => <option key={k}>{k}</option>)}</select>
        </div>
        {tampil.length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>{otomatis === null ? "Memuat..." : "Belum ada realisasi."}</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {tampil.slice(0, 200).map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", borderRadius: "12px", background: "var(--bg)", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", color: "var(--muted)", width: "86px", flexShrink: 0 }}>{r.tanggal.split("-").reverse().join("/")}</span>
                <span style={{ flex: 1, minWidth: "180px", fontSize: "13px" }}>
                  <b>{r.kategori}</b> · {r.uraian}
                  <span style={{ marginLeft: "6px", fontSize: "10.5px", fontWeight: 800, padding: "1px 7px", borderRadius: "7px", background: r.sumber === "manual" ? "var(--hover)" : "var(--info-50)", color: r.sumber === "manual" ? "var(--muted)" : "var(--info)" }}>
                    {r.sumber === "perbaikan" ? "Helpdesk" : r.sumber === "servis" ? "Servis driver" : "Manual"}
                  </span>
                </span>
                <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{rupiah(r.jumlah)}</span>
                {r.sumber === "manual" && <button type="button" className="sa-btn is-soft" style={{ height: "30px", fontSize: "11.5px", color: "var(--red-600)" }} onClick={() => hapus(r)}>Hapus</button>}
                {r.sumber === "perbaikan" && <button type="button" className="sa-btn is-soft" style={{ height: "30px", fontSize: "11.5px" }} onClick={() => router.push("/admin/helpdesk")}>Lihat tiket</button>}
              </div>
            ))}
          </div>
        )}
      </Tile>
    </AdminShell>
  );
}
