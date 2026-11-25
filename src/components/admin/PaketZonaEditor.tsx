"use client";

/**
 * §182 Paket area tetap pola zona -- editor klik-pilih.
 * Isi 4 paket (Tenant A, Tenant B, Toilet, Area Lain) dibekukan; tiap pekan pemegangnya bergantian dengan pasangannya.
 * Admin cukup klik paket untuk tiap lantai pelayanan, ruang tenant pagi & area publik, lalu Simpan.
 */
import { useState } from "react";
import { deleteField, serverTimestamp, updateDoc } from "firebase/firestore";
import { useToast } from "../ui/ToastProvider";
import { useConfirm } from "../ui/ConfirmProvider";
import Tile from "./Tile";
import { lantaiDari, type LantaiOk } from "../../lib/bagiZona";
import {
  isiPaket, LABEL_PAKET, PAKET_PUBLIK, PAKET_TENANT, paketCocok, paketDariRencana, pemegangPada, SEMUA_PAKET, seninDari, tambahHariISO, WARNA_PAKET,
  type KodePaket, type PaketZona,
} from "../../lib/paketZona";
import { DOC_UJI_POLA, rencanaUntuk, tenantMinggu, type UjiPolaZona } from "../../lib/ujiPolaZona";

const tglPendek = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const pendek = (a: string) => a.replace(/^Lantai\s*/i, "Lt ").replace(/\s{2,}/g, " ");
const depan = (n: string) => n.split(" ")[0] || n;

/** Rencana otomatis (tanpa paket, semua hadir) pekan tsb dibekukan jadi paket. */
function bekukan(c: UjiPolaZona, tanggal: string, lantai: LantaiOk[]): PaketZona | null {
  const senin = seninDari(tanggal < c.mulai ? c.mulai : tanggal);
  const dasar: UjiPolaZona = { ...c, rotasi: "tetap", paket_zona: null, tidak_hadir: {} };
  const r = rencanaUntuk(dasar, senin, lantai);
  return r ? paketDariRencana(r, tenantMinggu(dasar, senin), senin) : null;
}

function Pilih<K extends KodePaket>({ kode, nilai, label, onPilih }: { kode: K[]; nilai: K | undefined; label: (k: K) => string; onPilih: (k: K) => void }) {
  return (
    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
      {kode.map((k) => {
        const on = nilai === k;
        return (
          <button key={k} type="button" onClick={() => onPilih(k)}
            style={{ height: "30px", padding: "0 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${WARNA_PAKET[k]}`, background: on ? WARNA_PAKET[k] : "transparent", color: on ? "#fff" : WARNA_PAKET[k] }}>
            {on ? "✓ " : ""}{label(k)}
          </button>
        );
      })}
    </div>
  );
}

export default function PaketZonaEditor({ config, hariIni, lantaiOk }: { config: UjiPolaZona; hariIni: string; lantaiOk: LantaiOk[] }) {
  const showToast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<PaketZona | null>(null);
  const [buka, setBuka] = useState(false);
  const [simpan, setSimpan] = useState(false);
  const tersimpan = config.paket_zona;
  const p = draft ?? tersimpan;
  const berubah = !!draft;

  if (!p) {
    return (
      <Tile style={{ marginBottom: "16px" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>📦 Paket area tetap</h3>
        <div style={{ fontSize: "13px", color: "var(--ink-soft)", marginBottom: "10px" }}>
          Bekukan pembagian area pekan ini jadi 4 paket (Tenant A, Tenant B, Toilet, Area Lain). Isi paket tidak berubah lagi; tiap pekan pemegangnya ditukar dengan pasangannya. Kalau ada yang sakit/izin, isi paketnya otomatis dibagi ke rekan.
        </div>
        <button type="button" className="sa-btn is-primary" onClick={() => {
          const b = bekukan(config, hariIni, lantaiOk);
          if (!b) return showToast("Belum ada rencana pekan ini (cek tanggal mulai & anggota zona).", "warning");
          setDraft(b); setBuka(true);
        }}>Kunci pembagian pekan ini jadi paket tetap</button>
      </Tile>
    );
  }

  const cocok = paketCocok(p, config.tim_tenant, config.tim_publik);
  const { isi, belum } = isiPaket(p, config.area_tenant, config.area_publik, config.mingguan);
  const senin = seninDari(hariIni);
  const kini = pemegangPada(p, senin), nanti = pemegangPada(p, tambahHariISO(senin, 7));
  const lbl = (k: KodePaket) => `${LABEL_PAKET[k].replace("Publik · ", "")} · ${depan(kini[k]) || "–"}`;
  const ubah = (f: (x: PaketZona) => PaketZona) => setDraft(f(structuredClone(p)));
  const lantai = Array.from(new Set(config.area_tenant.map(lantaiDari).filter((l) => l !== "Bersama"))).sort();
  const mg = new Set(config.mingguan);

  const tukarPemegang = (a: KodePaket, b: KodePaket) => ubah((x) => ({ ...x, pemegang: { ...x.pemegang, [a]: x.pemegang[b], [b]: x.pemegang[a] } }));
  const simpanPaket = async () => {
    if (!cocok) return showToast("Pemegang paket harus anggota zona masing-masing.", "warning");
    setSimpan(true);
    try {
      await updateDoc(DOC_UJI_POLA(), { paket_zona: p, rotasi: "tetap", waktu_update: serverTimestamp() });
      setDraft(null);
      showToast("Paket area tetap disimpan — langsung berlaku di Checklist Zona & halaman utama.", "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan paket.", "error"); }
    setSimpan(false);
  };
  const hapusPaket = async () => {
    if (!(await confirm({ title: "Hapus paket tetap", message: "Pembagian area kembali dihitung otomatis dari luas Okupansi setiap hari.", confirmText: "Hapus", variant: "danger" }))) return;
    try { await updateDoc(DOC_UJI_POLA(), { paket_zona: deleteField(), waktu_update: serverTimestamp() }); setDraft(null); showToast("Paket dihapus.", "success"); }
    catch (e) { console.error(e); showToast("Gagal menghapus.", "error"); }
  };

  const baris: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "7px 10px", borderRadius: "12px", background: "var(--bg)" };

  return (
    <Tile style={{ marginBottom: "16px", border: berubah ? "2px solid var(--warn)" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px" }}>📦 Paket area tetap {tersimpan && !berubah ? "· aktif" : ""}</h3>
          <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Isi paket tetap; pemegang ditukar tiap pekan (Tenant A ⇄ Tenant B, Toilet ⇄ Area Lain).</div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button type="button" className="sa-btn is-soft" onClick={() => setBuka(!buka)}>{buka ? "Tutup editor" : "✏️ Ubah isi paket"}</button>
          {berubah && <button type="button" className="sa-btn is-soft" onClick={() => setDraft(null)}>Batalkan</button>}
          {berubah && <button type="button" className="sa-btn is-primary" disabled={simpan} onClick={() => void simpanPaket()}>{simpan ? "Menyimpan…" : "💾 Simpan paket"}</button>}
        </div>
      </div>

      {!cocok && <div style={{ marginTop: "8px", padding: "8px 12px", borderRadius: "12px", background: "var(--warn-50)", fontSize: "12.5px", fontWeight: 700 }}>Anggota zona berubah — paket belum dipakai. Kunci ulang dari pembagian pekan ini.</div>}
      {belum.length > 0 && <div style={{ marginTop: "8px", padding: "8px 12px", borderRadius: "12px", background: "var(--warn-50)", fontSize: "12.5px" }}><b>Belum masuk paket ({belum.length}):</b> {belum.map(pendek).join("; ")} — sementara ikut Tenant A / Area Lain. Pilih paketnya di editor.</div>}

      {/* jadwal pemegang: pekan ini & pekan depan */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px", marginTop: "12px" }}>
        {SEMUA_PAKET.map((k) => (
          <div key={k} style={{ borderRadius: "14px", border: `1.5px solid ${WARNA_PAKET[k]}`, padding: "10px 12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: WARNA_PAKET[k] }}>{LABEL_PAKET[k]}</div>
            <div style={{ fontSize: "14px", fontWeight: 800, marginTop: "2px" }}>{kini[k] || "–"}</div>
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>pekan ini ({tglPendek(senin)}) · pekan depan: <b>{nanti[k] || "–"}</b></div>
            <div style={{ fontSize: "12px", color: "var(--ink-soft)", marginTop: "4px" }}>
              {isi[k].pelayanan.length > 0 && <>Pelayanan {isi[k].pelayanan.map(pendek).join(", ")} · </>}
              {isi[k].pagi.length} ruang pagi · {isi[k].area.length} area{isi[k].mingguan.length ? ` · ${isi[k].mingguan.length} mingguan` : ""}
            </div>
          </div>
        ))}
      </div>

      {buka && (
        <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button type="button" className="sa-btn is-soft" onClick={() => tukarPemegang("T1", "T2")}>⇄ Tukar pemegang Tenant A/B pekan ini</button>
            <button type="button" className="sa-btn is-soft" onClick={() => tukarPemegang("TOILET", "LAIN")}>⇄ Tukar pemegang Toilet/Area Lain pekan ini</button>
            <button type="button" className="sa-btn is-soft" onClick={() => { const b = bekukan(config, hariIni, lantaiOk); if (b) setDraft(b); }}>↺ Ambil ulang dari hitungan otomatis</button>
            {tersimpan && <button type="button" className="sa-btn is-soft" onClick={() => void hapusPaket()}>Hapus paket</button>}
          </div>
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>Tombol tukar hanya memperbaiki siapa memegang paket di pekan acuan; rotasi tiap pekan tetap berjalan. Klik tombol paket di tiap baris untuk memindah area, lalu <b>Simpan paket</b>.</div>

          <div>
            <b style={{ fontSize: "13.5px" }}>🛎️ Pelayanan tenant per lantai</b>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
              {lantai.map((l) => (
                <div key={l} style={baris}>
                  <span style={{ fontSize: "13px", fontWeight: 700 }}>{l} <span style={{ fontWeight: 400, color: "var(--muted)" }}>({config.area_tenant.filter((a) => lantaiDari(a) === l).length} tenant)</span></span>
                  <Pilih kode={PAKET_TENANT} nilai={p.pelayanan.find((x) => x.lantai === l)?.kode} label={lbl}
                    onPilih={(k) => ubah((x) => ({ ...x, pelayanan: [...x.pelayanan.filter((e) => e.lantai !== l), { lantai: l, kode: k }] }))} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <b style={{ fontSize: "13.5px" }}>🌅 Pagi {config.jam_pagi} · ruang tenant</b>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
              {config.area_tenant.map((a) => (
                <div key={a} style={baris}>
                  <span style={{ fontSize: "13px" }}>{pendek(a)}</span>
                  <Pilih kode={SEMUA_PAKET} nilai={p.pagi.find((x) => x.area === a)?.kode} label={lbl}
                    onPilih={(k) => ubah((x) => ({ ...x, pagi: [...x.pagi.filter((e) => e.area !== a), { area: a, kode: k }] }))} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <b style={{ fontSize: "13.5px" }}>🧹 Area publik</b>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
              {config.area_publik.map((a) => (
                <div key={a} style={baris}>
                  <span style={{ fontSize: "13px" }}>{pendek(a)}{mg.has(a) && <span style={{ marginLeft: "6px", fontSize: "11px", fontWeight: 800, color: "var(--muted)" }}>MINGGUAN</span>}</span>
                  <Pilih kode={PAKET_PUBLIK} nilai={p.publik.find((x) => x.area === a)?.kode} label={lbl}
                    onPilih={(k) => ubah((x) => ({ ...x, publik: [...x.publik.filter((e) => e.area !== a), { area: a, kode: k }] }))} />
                </div>
              ))}
            </div>
          </div>
          {berubah && <button type="button" className="sa-btn is-primary" disabled={simpan} onClick={() => void simpanPaket()}>{simpan ? "Menyimpan…" : "💾 Simpan paket"}</button>}
        </div>
      )}
    </Tile>
  );
}
