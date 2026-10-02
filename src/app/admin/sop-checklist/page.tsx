"use client";

/**
 * SOP Checklist (§81) -- Admin GA mengatur isi checklist tanpa ubah kode:
 *   - Checklist harian OB & CS (area -> segmen -> pertanyaan, + tugas tambahan per staf)
 *   - Inspeksi fasilitas OB (daftar fasilitas)
 *   - Inspeksi mingguan kendaraan Driver (item)
 *   - Titik patroli Security -> halaman tersendiri /admin/titik-patroli
 * Setiap tab disusun sebagai draft lalu disimpan sekali ke settings/<dokumen>.
 */

import { useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import {
  idBaru, useChecklistOB, useFasilitasOB, useInspeksiDriver,
  type AreaChecklist, type ItemInspeksiDriver, type ItemSederhana, type SegmentConfig, type TugasTambahan,
} from "../../../lib/sopChecklist";

type Tab = "ob" | "fasilitas" | "driver" | "patroli";
const salin = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Draft lokal yang mengikuti data tersimpan selama belum diubah. */
function useDraft<T>(sumber: T, dimuat: boolean) {
  const [draft, setDraft] = useState<T>(sumber);
  const [berubah, setBerubah] = useState(false);
  useEffect(() => {
    if (berubah || !dimuat) return;
    const t = setTimeout(() => setDraft(salin(sumber)), 0);
    return () => clearTimeout(t);
  }, [sumber, dimuat, berubah]);
  const ubah = (fn: (d: T) => void) => { setDraft((lama) => { const d = salin(lama); fn(d); return d; }); setBerubah(true); };
  const reset = () => { setBerubah(false); setDraft(salin(sumber)); };
  return { draft, berubah, ubah, reset, selesai: () => setBerubah(false) };
}

const CSS = `
  .sc-input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 13.5px; }
  .sc-baris { display: flex; gap: 6px; align-items: center; }
  .sc-pil { border: none; border-radius: 10px; padding: 7px 10px; font-family: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; white-space: nowrap; }
  .sc-segmen { padding: 12px; border-radius: 14px; background: var(--bg); display: flex; flex-direction: column; gap: 6px; }
  .sc-segmen.is-nonaktif { background: var(--warn-50); }
  .sc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; align-items: start; }
  @media (max-width: 520px) { .sc-grid { grid-template-columns: 1fr; } }
`;

function TombolAktif({ aktif, onClick }: { aktif: boolean; onClick: () => void }) {
  return (
    <button type="button" className="sc-pil" onClick={onClick} style={aktif ? { background: "var(--ok-50)", color: "var(--ok)" } : { background: "var(--warn-solid)", color: "#fff" }}>
      {aktif ? "Aktif" : "Nonaktif"}
    </button>
  );
}
function TombolHapus({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" className="sc-pil" onClick={onClick} style={{ background: "var(--red-50)", color: "var(--red-600)" }} aria-label={label}>Hapus</button>;
}

function EditorSegmen({ s, ubahSegmen, hapusSegmen }: { s: SegmentConfig; ubahSegmen: (fn: (s: SegmentConfig) => void) => void; hapusSegmen: () => void }) {
  const [baru, setBaru] = useState("");
  const aktif = s.aktif !== false;
  return (
    <div className={`sc-segmen${aktif ? "" : " is-nonaktif"}`}>
      <div className="sc-baris">
        <input className="sc-input" style={{ fontWeight: 800 }} value={s.nama} aria-label="Nama segmen" onChange={(e) => ubahSegmen((x) => { x.nama = e.target.value; })} />
        <TombolAktif aktif={aktif} onClick={() => ubahSegmen((x) => { x.aktif = !aktif; })} />
        <TombolHapus onClick={hapusSegmen} label={`Hapus segmen ${s.nama}`} />
      </div>
      {s.pertanyaan.map((p, pi) => (
        <div key={p.id} className="sc-baris" style={{ paddingLeft: "10px" }}>
          <span style={{ fontSize: "11px", color: "var(--muted)", width: "18px" }}>{pi + 1}.</span>
          <input className="sc-input" value={p.teks} aria-label={`Pertanyaan ${pi + 1}`} onChange={(e) => ubahSegmen((x) => { x.pertanyaan[pi].teks = e.target.value; })} />
          <TombolHapus onClick={() => ubahSegmen((x) => { x.pertanyaan.splice(pi, 1); })} label={`Hapus pertanyaan ${pi + 1}`} />
        </div>
      ))}
      <div className="sc-baris" style={{ paddingLeft: "28px" }}>
        <input className="sc-input" placeholder="Pertanyaan baru, mis. Apakah kaca jendela sudah dilap?" value={baru} onChange={(e) => setBaru(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && baru.trim()) { ubahSegmen((x) => { x.pertanyaan.push({ id: idBaru("q"), teks: baru.trim() }); }); setBaru(""); } }} />
        <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} onClick={() => { if (!baru.trim()) return; ubahSegmen((x) => { x.pertanyaan.push({ id: idBaru("q"), teks: baru.trim() }); }); setBaru(""); }}>+ Pertanyaan</button>
      </div>
    </div>
  );
}

export default function SopChecklistPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const [tab, setTab] = useState<Tab>("fasilitas");
  const [menyimpan, setMenyimpan] = useState(false);

  const ob = useChecklistOB();
  const fas = useFasilitasOB();
  const drv = useInspeksiDriver();
  const dOb = useDraft<{ area: AreaChecklist[]; tugas_tambahan: TugasTambahan[] }>(ob.nilai, ob.dimuat);
  const dFas = useDraft<ItemSederhana[]>(fas.nilai, fas.dimuat);
  const dDrv = useDraft<ItemInspeksiDriver[]>(drv.nilai, drv.dimuat);
  const [itemBaru, setItemBaru] = useState("");
  const [segmenBaru, setSegmenBaru] = useState<Record<string, string>>({});

  const simpan = async (id: string, data: Record<string, unknown>, selesai: () => void) => {
    setMenyimpan(true);
    try {
      await setDoc(doc(db, "settings", id), { ...data, diperbarui_oleh: session?.nama || "-", diperbarui_pada: serverTimestamp() });
      selesai();
      showToast("Tersimpan. Halaman staf langsung memakai daftar baru.", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan.", "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const yakinHapus = (nama: string) => confirm({ title: "Hapus", message: `Hapus "${nama}"? Riwayat laporan lama tetap tersimpan. Untuk sementara tidak dipakai, pilih "Nonaktif" saja.`, confirmText: "Ya, hapus", cancelText: "Batal", variant: "danger" });

  if (!isReady) return null;

  const aktifTab = tab === "ob" ? { d: dOb, bawaan: ob.dariBawaan, simpan: () => simpan("checklist_ob", dOb.draft as unknown as Record<string, unknown>, dOb.selesai) }
    : tab === "fasilitas" ? { d: dFas, bawaan: fas.dariBawaan, simpan: () => simpan("fasilitas_ob", { daftar: dFas.draft.filter((x) => x.nama.trim()) }, dFas.selesai) }
    : tab === "driver" ? { d: dDrv, bawaan: drv.dariBawaan, simpan: () => simpan("inspeksi_driver", { daftar: dDrv.draft.filter((x) => x.label.trim()) }, dDrv.selesai) }
    : null;

  return (
    <AdminShell
      title="SOP Checklist"
      subtitle="Atur isi checklist OB & CS, inspeksi fasilitas, dan inspeksi kendaraan — tanpa ubah kode"
      userName={session?.nama || "Admin"}
      actions={aktifTab ? (
        <div style={{ display: "flex", gap: "8px" }}>
          {aktifTab.d.berubah && <button type="button" className="sa-btn is-soft" onClick={aktifTab.d.reset} disabled={menyimpan}>Batalkan</button>}
          <button type="button" className="sa-btn is-primary" onClick={aktifTab.simpan} disabled={menyimpan || (!aktifTab.d.berubah && !aktifTab.bawaan)}>
            {menyimpan ? "Menyimpan..." : aktifTab.d.berubah ? "Simpan perubahan" : aktifTab.bawaan ? "Simpan daftar ini" : "Tersimpan"}
          </button>
        </div>
      ) : undefined}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sa-tabs" role="tablist" aria-label="Jenis checklist" style={{ width: "fit-content", maxWidth: "100%" }}>
        {([["fasilitas", "Inspeksi Fasilitas OB"], ["ob", "Checklist Harian OB & CS"], ["driver", "Inspeksi Kendaraan Driver"], ["patroli", "Titik Patroli Security"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sa-tab${tab === k ? " is-active" : ""}`}
            onClick={() => { if (aktifTab?.d.berubah) { showToast("Simpan atau batalkan perubahan di tab ini dulu.", "warning"); return; } setTab(k); }}>{l}</button>
        ))}
      </div>

      {aktifTab?.bawaan && (
        <div style={{ marginBottom: "14px", padding: "12px 16px", borderRadius: "16px", background: "var(--warn-50)", color: "var(--warn)", fontSize: "12.5px" }}>
          Masih memakai <b>daftar bawaan</b>. Ubah sesuai kebutuhan lalu tekan <b>Simpan</b>.
        </div>
      )}

      {tab === "fasilitas" && (
        <Tile>
          <h2 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 800 }}>Daftar fasilitas yang diinspeksi OB tiap minggu</h2>
          <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>Sama untuk semua area; fasilitas yang tidak ada di area tertentu dinilai &quot;Tidak Ada&quot; oleh OB. OB tetap bisa menambah fasilitas lain saat inspeksi.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {dFas.draft.map((x, i) => (
              <div key={i} className="sc-baris">
                <input className="sc-input" value={x.nama} aria-label={`Fasilitas ${i + 1}`} onChange={(e) => dFas.ubah((d) => { d[i].nama = e.target.value; })} />
                <TombolAktif aktif={x.aktif !== false} onClick={() => dFas.ubah((d) => { d[i].aktif = !(x.aktif !== false); })} />
                <TombolHapus label={`Hapus ${x.nama}`} onClick={async () => { if (await yakinHapus(x.nama)) dFas.ubah((d) => { d.splice(i, 1); }); }} />
              </div>
            ))}
            <div className="sc-baris" style={{ marginTop: "6px" }}>
              <input className="sc-input" placeholder="Fasilitas baru, mis. Microwave Pantry Lt 2" value={itemBaru} onChange={(e) => setItemBaru(e.target.value)} />
              <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} onClick={() => { if (!itemBaru.trim()) return; dFas.ubah((d) => { d.push({ nama: itemBaru.trim(), aktif: true }); }); setItemBaru(""); }}>+ Tambah</button>
            </div>
          </div>
        </Tile>
      )}

      {tab === "driver" && (
        <Tile>
          <h2 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 800 }}>Item inspeksi mingguan kendaraan</h2>
          <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>Tiap item wajib dinilai (Baik / Perlu Perhatian / Rusak) &amp; difoto oleh driver.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {dDrv.draft.map((x, i) => (
              <div key={x.key} className="sc-baris">
                <input className="sc-input" value={x.label} aria-label={`Item ${i + 1}`} onChange={(e) => dDrv.ubah((d) => { d[i].label = e.target.value; })} />
                <TombolAktif aktif={x.aktif !== false} onClick={() => dDrv.ubah((d) => { d[i].aktif = !(x.aktif !== false); })} />
                <TombolHapus label={`Hapus ${x.label}`} onClick={async () => { if (await yakinHapus(x.label)) dDrv.ubah((d) => { d.splice(i, 1); }); }} />
              </div>
            ))}
            <div className="sc-baris" style={{ marginTop: "6px" }}>
              <input className="sc-input" placeholder="Item baru, mis. Kotak P3K & APAR mobil" value={itemBaru} onChange={(e) => setItemBaru(e.target.value)} />
              <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} onClick={() => { if (!itemBaru.trim()) return; dDrv.ubah((d) => { d.push({ key: idBaru("item"), label: itemBaru.trim(), aktif: true }); }); setItemBaru(""); }}>+ Tambah</button>
            </div>
          </div>
        </Tile>
      )}

      {tab === "ob" && (
        <>
          <div className="sc-grid">
            {dOb.draft.area.map((a, ai) => (
              <Tile key={a.area}>
                <h2 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: 800 }}>{a.area}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {a.segmen.map((s, si) => (
                    <EditorSegmen key={s.id} s={s}
                      ubahSegmen={(fn) => dOb.ubah((d) => { fn(d.area[ai].segmen[si]); })}
                      hapusSegmen={async () => { if (await yakinHapus(s.nama)) dOb.ubah((d) => { d.area[ai].segmen.splice(si, 1); }); }} />
                  ))}
                  <div className="sc-baris">
                    <input className="sc-input" placeholder="Segmen baru, mis. Ruang Arsip" value={segmenBaru[a.area] || ""} onChange={(e) => setSegmenBaru((x) => ({ ...x, [a.area]: e.target.value }))} />
                    <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} onClick={() => {
                      const nama = (segmenBaru[a.area] || "").trim();
                      if (!nama) return;
                      dOb.ubah((d) => { d.area[ai].segmen.push({ id: idBaru("seg"), nama, pertanyaan: [] }); });
                      setSegmenBaru((x) => ({ ...x, [a.area]: "" }));
                    }}>+ Segmen</button>
                  </div>
                </div>
              </Tile>
            ))}
          </div>
          <Tile style={{ marginTop: "16px" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 800 }}>Tugas tambahan per staf</h2>
            <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>Segmen yang selalu ditambahkan ke checklist staf tertentu, apa pun area plotnya (mis. Mushallah Lt 4).</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {dOb.draft.tugas_tambahan.map((tg, ti) => (
                <div key={tg.segmen.id} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div className="sc-baris">
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>Nama staf:</span>
                    <input className="sc-input" value={tg.nama_staf} onChange={(e) => dOb.ubah((d) => { d.tugas_tambahan[ti].nama_staf = e.target.value; })} />
                    <TombolHapus label="Hapus tugas tambahan" onClick={async () => { if (await yakinHapus(`${tg.segmen.nama} (${tg.nama_staf})`)) dOb.ubah((d) => { d.tugas_tambahan.splice(ti, 1); }); }} />
                  </div>
                  <EditorSegmen s={tg.segmen} ubahSegmen={(fn) => dOb.ubah((d) => { fn(d.tugas_tambahan[ti].segmen); })} hapusSegmen={async () => { if (await yakinHapus(tg.segmen.nama)) dOb.ubah((d) => { d.tugas_tambahan.splice(ti, 1); }); }} />
                </div>
              ))}
              <button type="button" className="sa-btn is-soft" onClick={() => dOb.ubah((d) => { d.tugas_tambahan.push({ nama_staf: "", segmen: { id: idBaru("seg"), nama: "Tugas tambahan", pertanyaan: [] } }); })}>+ Tugas tambahan</button>
            </div>
          </Tile>
        </>
      )}

      {tab === "patroli" && (
        <Tile>
          <h2 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 800 }}>Titik patroli Security</h2>
          <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--muted)" }}>Diatur di halaman tersendiri karena terhubung dengan label QR di lokasi.</p>
          <button type="button" className="sa-btn is-primary" onClick={() => router.push("/admin/titik-patroli")}>Buka Titik Patroli</button>
        </Tile>
      )}
    </AdminShell>
  );
}
