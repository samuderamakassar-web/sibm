"use client";

/**
 * Master Titik Patroli Security (§79) -- dipakai halaman Patroli (titik wajib scan) & QR Code Generator.
 * Perubahan disusun dulu (draft) lalu disimpan sekali ke settings/titik_patroli.
 * ID titik = isi QR yang ditempel -> tidak berubah saat nama diganti; titik baru perlu dicetak QR-nya.
 */

import { useEffect, useState } from "react";
import { serverTimestamp, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import { idTitikBaru, REF_TITIK_PATROLI, useTitikPatroli, type LantaiPatroli } from "../../../lib/titikPatroli";

export default function TitikPatroliPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const { daftar, dariBawaan, dimuat } = useTitikPatroli();

  const [draft, setDraft] = useState<LantaiPatroli[]>([]);
  const [berubah, setBerubah] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [titikBaru, setTitikBaru] = useState<Record<string, string>>({});
  const [lantaiBaru, setLantaiBaru] = useState("");

  // Salin data tersimpan ke draft selama admin belum mengubah apa pun.
  useEffect(() => {
    if (berubah || !dimuat) return;
    const t = setTimeout(() => setDraft(JSON.parse(JSON.stringify(daftar))), 0);
    return () => clearTimeout(t);
  }, [daftar, dimuat, berubah]);

  const ubah = (fn: (d: LantaiPatroli[]) => void) => {
    setDraft((lama) => { const d = JSON.parse(JSON.stringify(lama)) as LantaiPatroli[]; fn(d); return d; });
    setBerubah(true);
  };

  const simpan = async () => {
    setMenyimpan(true);
    try {
      const bersih = draft.map((l) => ({ lantai: l.lantai.trim(), titik: l.titik.map((x) => ({ id: x.id, nama: x.nama.trim() || x.id, aktif: x.aktif !== false, ...(x.catatan?.trim() ? { catatan: x.catatan.trim() } : {}) })) }));
      await setDoc(REF_TITIK_PATROLI(), { lantai: bersih, diperbarui_oleh: session?.nama || "-", diperbarui_pada: serverTimestamp() });
      setBerubah(false);
      showToast("Titik patroli tersimpan. Halaman Patroli Security langsung memakai daftar baru.", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan titik patroli.", "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const batal = () => { setBerubah(false); setDraft(JSON.parse(JSON.stringify(daftar))); setTitikBaru({}); };

  const tambahTitik = (li: number) => {
    const lantai = draft[li].lantai;
    const nama = (titikBaru[lantai] || "").trim();
    if (!nama) return showToast("Isi nama titik dulu.", "warning");
    const id = idTitikBaru(lantai, nama);
    if (draft.some((l) => l.titik.some((x) => x.id === id))) return showToast("Titik dengan nama itu sudah ada di lantai ini.", "warning");
    ubah((d) => { d[li].titik.push({ id, nama, aktif: true }); });
    setTitikBaru((s) => ({ ...s, [lantai]: "" }));
  };

  const hapusTitik = async (li: number, ti: number) => {
    const x = draft[li].titik[ti];
    const ok = await confirm({
      title: "Hapus Titik Patroli",
      message: `Hapus "${x.nama}" dari daftar? QR yang sudah ditempel untuk titik ini tidak akan dikenali lagi. Untuk renovasi sementara, sebaiknya pilih "Nonaktif sementara" saja.`,
      confirmText: "Ya, hapus", cancelText: "Batal", variant: "danger",
    });
    if (ok) ubah((d) => { d[li].titik.splice(ti, 1); });
  };

  const tambahLantai = () => {
    const nama = lantaiBaru.trim();
    if (!nama) return;
    if (draft.some((l) => l.lantai.toLowerCase() === nama.toLowerCase())) return showToast("Lantai/area itu sudah ada.", "warning");
    ubah((d) => { d.push({ lantai: nama, titik: [] }); });
    setLantaiBaru("");
  };

  if (!isReady) return null;

  const semua = draft.flatMap((l) => l.titik);
  const jumlahAktif = semua.filter((x) => x.aktif !== false).length;

  return (
    <AdminShell
      title="Titik Patroli"
      subtitle="Daftar titik wajib scan patroli Security per lantai — nonaktifkan sementara area renovasi"
      userName={session?.nama || "Admin"}
      actions={
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="sa-btn is-soft" onClick={() => router.push("/admin/qr-manager")}>Cetak QR</button>
          {berubah && <button type="button" className="sa-btn is-soft" onClick={batal} disabled={menyimpan}>Batalkan</button>}
          <button type="button" className="sa-btn is-primary" onClick={simpan} disabled={menyimpan || (!berubah && !dariBawaan)}>
            {menyimpan ? "Menyimpan..." : berubah ? "Simpan perubahan" : dariBawaan ? "Simpan daftar ini" : "Tersimpan"}
          </button>
        </div>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; align-items: start; }
        .tp-baris { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 14px; background: var(--bg); }
        .tp-baris.is-nonaktif { background: var(--warn-50); }
        .tp-atas { display: flex; align-items: center; gap: 8px; }
        .tp-input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 13.5px; }
        .tp-pil { border: none; border-radius: 10px; padding: 7px 10px; font-family: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; white-space: nowrap; }
        .tp-id { font-size: 10.5px; color: var(--muted); font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
      `}} />

      <div style={{ marginBottom: "14px", padding: "12px 16px", borderRadius: "16px", background: dariBawaan ? "var(--warn-50)" : "var(--info-50)", color: dariBawaan ? "var(--warn)" : "var(--info)", fontSize: "12.5px", lineHeight: 1.6 }}>
        {dariBawaan
          ? <>Masih memakai <b>daftar bawaan</b>. Ubah sesuai kondisi gedung lalu tekan <b>Simpan</b>.</>
          : <>{jumlahAktif} titik aktif · {semua.length - jumlahAktif} nonaktif sementara. Titik <b>nonaktif</b> tidak wajib discan &amp; tidak dihitung terlewat. Titik <b>baru</b> perlu dicetak QR-nya di <b>Cetak QR</b>.</>}
      </div>

      <div className="tp-grid">
        {draft.map((l, li) => (
          <Tile key={l.lantai}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "var(--ink)" }}>{l.lantai}</h2>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>{l.titik.filter((x) => x.aktif !== false).length}/{l.titik.length} aktif</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {l.titik.length === 0 && <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Belum ada titik.</div>}
              {l.titik.map((x, ti) => {
                const aktif = x.aktif !== false;
                return (
                  <div key={x.id} className={`tp-baris${aktif ? "" : " is-nonaktif"}`}>
                    <div className="tp-atas">
                      <input className="tp-input" value={x.nama} aria-label={`Nama titik ${x.nama}`} onChange={(e) => ubah((d) => { d[li].titik[ti].nama = e.target.value; })} />
                      <button type="button" className="tp-pil" onClick={() => ubah((d) => { d[li].titik[ti].aktif = !aktif; })}
                        style={aktif ? { background: "var(--ok-50)", color: "var(--ok)" } : { background: "var(--warn-solid)", color: "#fff" }}>
                        {aktif ? "Aktif" : "Nonaktif"}
                      </button>
                      <button type="button" className="tp-pil" onClick={() => hapusTitik(li, ti)} style={{ background: "var(--red-50)", color: "var(--red-600)" }} aria-label={`Hapus ${x.nama}`}>Hapus</button>
                    </div>
                    {!aktif && (
                      <input className="tp-input" value={x.catatan || ""} placeholder="Keterangan, mis. Renovasi s.d. November" onChange={(e) => ubah((d) => { d[li].titik[ti].catatan = e.target.value; })} />
                    )}
                    <span className="tp-id">QR: {x.id}</span>
                  </div>
                );
              })}
            </div>
            <div className="tp-atas" style={{ marginTop: "10px" }}>
              <input className="tp-input" placeholder="Nama titik baru" value={titikBaru[l.lantai] || ""} onChange={(e) => setTitikBaru((s) => ({ ...s, [l.lantai]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") tambahTitik(li); }} />
              <button type="button" className="sa-btn is-soft" style={{ height: "36px" }} onClick={() => tambahTitik(li)}>+ Tambah</button>
            </div>
          </Tile>
        ))}
        <Tile>
          <h2 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: 800, color: "var(--ink)" }}>Tambah lantai / area</h2>
          <div className="tp-atas">
            <input className="tp-input" placeholder="Mis. Lantai 6 / Area Luar" value={lantaiBaru} onChange={(e) => setLantaiBaru(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") tambahLantai(); }} />
            <button type="button" className="sa-btn is-soft" style={{ height: "36px" }} onClick={tambahLantai}>+ Tambah</button>
          </div>
        </Tile>
      </div>
    </AdminShell>
  );
}
