"use client";

/**
 * Klaim Lembur Tim (§63) -- SATU komponen untuk Security, OB & CS, dan Driver (dulu 3 salinan
 * modal yang nyaris sama, perbaikan di satu tempat tidak ikut ke yang lain).
 * Data: ga_overtime_requests { nama_pemohon, departemen, periode, items[], status: "Menunggu Approval GA" }
 * -- format sama persis dengan sebelumnya, jadi admin/overtime (tab Tim) tidak berubah.
 */

import { useEffect, useState } from "react";
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { daftarPeriodeLembur, periodeLemburAktif, periodeUntukTanggal } from "../lib/periodeLembur";
import { tanggalISOWITASekarang } from "../lib/shift";
import { useToast } from "./ui/ToastProvider";
import { useConfirm } from "./ui/ConfirmProvider";
import Modal from "./ui/Modal";
import { daerahTulis } from "@/lib/daerah";

interface ItemLembur {
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  area_ruangan: string;
  alasan: string;
}

interface KlaimSaya {
  id: string;
  periode?: string;
  items?: ItemLembur[];
  status?: string;
  waktu_request?: { toMillis: () => number } | null;
}

export interface KlaimLemburModalProps {
  open: boolean;
  onClose: () => void;
  picName: string;
  departemen: string;
  judul?: string;
  labelArea?: string;
  placeholderArea?: string;
  areaBawaan?: string;
  alasanBawaan?: string;
  placeholderAlasan?: string;
}

const tglIndo = (iso: string) => iso.split("-").reverse().join("/");

export default function KlaimLemburModal({
  open, onClose, picName, departemen,
  judul = "Klaim Lembur",
  labelArea = "Area / Lokasi",
  placeholderArea = "Cth: Lt. 2 R. Rapat",
  areaBawaan = "",
  alasanBawaan = "",
  placeholderAlasan = "Cth: Back-up rekan yang sakit",
}: KlaimLemburModalProps) {
  const showToast = useToast();
  const confirm = useConfirm();
  const barisBaru = (): ItemLembur => ({ tanggal: tanggalISOWITASekarang(), jam_mulai: "", jam_selesai: "", area_ruangan: areaBawaan, alasan: alasanBawaan });

  const [periode, setPeriode] = useState(periodeLemburAktif);
  const [items, setItems] = useState<ItemLembur[]>(() => [barisBaru()]);
  const [mengirim, setMengirim] = useState(false);
  const [klaimSaya, setKlaimSaya] = useState<KlaimSaya[]>([]);

  // Status klaim yang sudah dikirim -- dulu petugas tidak bisa melihat disetujui/ditolak.
  useEffect(() => {
    if (!open || !picName) return;
    const unsub = onSnapshot(query(collection(db, "ga_overtime_requests"), where("nama_pemohon", "==", picName)), (snap) => {
      setKlaimSaya(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KlaimSaya))
        .filter((k) => Array.isArray(k.items))
        .sort((a, b) => (b.waktu_request?.toMillis() || 0) - (a.waktu_request?.toMillis() || 0))
        .slice(0, 6));
    }, (err) => console.error("[lembur] Gagal memuat klaim:", err));
    return () => unsub();
  }, [open, picName]);

  const ubah = (idx: number, field: keyof ItemLembur, value: string) =>
    setItems((lama) => lama.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.some((i) => !i.tanggal || !i.jam_mulai || !i.jam_selesai || !i.area_ruangan.trim() || !i.alasan.trim())) {
      return showToast("Lengkapi semua kolom tanggal, jam, lokasi, dan alasan.", "warning");
    }
    // Tanggal di luar siklus terpilih dulu lolos -> masuk rekap periode yang salah.
    const diLuar = items.filter((i) => periodeUntukTanggal(i.tanggal) !== periode);
    if (diLuar.length) {
      return showToast(`Tanggal ${diLuar.map((i) => tglIndo(i.tanggal)).join(", ")} bukan bagian periode ${periode}. Pilih periode yang sesuai atau pisahkan klaimnya.`, "warning");
    }
    if (items.some((i) => i.jam_mulai === i.jam_selesai)) return showToast("Jam mulai dan jam selesai tidak boleh sama.", "warning");
    const dobel = items.map((i) => i.tanggal).filter((tg, idx, arr) => arr.indexOf(tg) !== idx);
    const pernah = klaimSaya.filter((k) => k.status !== "Rejected").flatMap((k) => (k.items || []).map((it) => it.tanggal));
    const bentrok = Array.from(new Set([...dobel, ...items.map((i) => i.tanggal).filter((tg) => pernah.includes(tg))]));
    if (bentrok.length) {
      const lanjut = await confirm({
        title: "Tanggal Sudah Diklaim?",
        message: `Tanggal ${bentrok.map(tglIndo).join(", ")} sudah ada di klaim Anda (atau tercantum 2x di form ini). Tetap kirim?`,
        confirmText: "Tetap kirim",
        cancelText: "Periksa lagi",
      });
      if (!lanjut) return;
    }
    setMengirim(true);
    try {
      await addDoc(collection(db, "ga_overtime_requests"), { daerah: daerahTulis(),
        nama_pemohon: picName,
        departemen,
        periode,
        items: items.map((i) => ({ ...i, area_ruangan: i.area_ruangan.trim(), alasan: i.alasan.trim() })),
        status: "Menunggu Approval GA",
        waktu_request: serverTimestamp(),
      });
      showToast(`${items.length} klaim lembur periode ${periode} terkirim ke Admin GA.`, "success");
      setItems([barisBaru()]);
      onClose();
    } catch (err) {
      console.error(err);
      showToast("Gagal mengirim klaim lembur.", "error");
    } finally {
      setMengirim(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !mengirim && onClose()} maxWidth="650px">
      <style dangerouslySetInnerHTML={{ __html: `
        .kl-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .kl-field label { font-size: 11.5px; font-weight: 700; color: var(--ink-soft); }
        .kl-input { width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 14px; box-sizing: border-box; }
        .kl-dua { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .kl-baris { border: 1px solid var(--line); border-radius: 16px; background: var(--bg); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
        @media (max-width: 520px) { .kl-dua { grid-template-columns: 1fr; } }
      `}} />
      <h2 style={{ margin: "0 40px 4px 0", fontSize: "18px", fontWeight: 800, color: "var(--ink)" }}>{judul}</h2>
      <p style={{ margin: "0 0 16px", fontSize: "12.5px", color: "var(--ink-soft)" }}>Input tanggal kerja lembur dalam satu siklus payroll (tanggal 11 – 10).</p>

      <form onSubmit={kirim} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="kl-dua">
          <div className="kl-field">
            <label>Nama</label>
            <input className="kl-input" readOnly value={picName} style={{ background: "var(--hover)" }} />
          </div>
          <div className="kl-field">
            <label htmlFor="kl-periode">Periode *</label>
            <select id="kl-periode" className="kl-input" value={periode} onChange={(e) => setPeriode(e.target.value)}>
              {daftarPeriodeLembur().map((p) => <option key={p.value} value={p.value}>{p.value} ({p.keterangan})</option>)}
            </select>
          </div>
        </div>

        {items.map((it, idx) => (
          <div key={idx} className="kl-baris">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--warn)", background: "var(--warn-50)", padding: "2px 8px", borderRadius: "6px" }}>Tanggal #{idx + 1}</span>
              {idx > 0 && (
                <button type="button" onClick={() => setItems((l) => l.filter((_, i) => i !== idx))} style={{ background: "var(--red-50)", color: "var(--red-600)", border: "none", borderRadius: "8px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Hapus</button>
              )}
            </div>
            <div className="kl-dua">
              <div className="kl-field">
                <label>Tanggal *</label>
                <input type="date" className="kl-input" value={it.tanggal} onChange={(e) => ubah(idx, "tanggal", e.target.value)} />
              </div>
              <div className="kl-field">
                <label>{labelArea} *</label>
                <input className="kl-input" placeholder={placeholderArea} value={it.area_ruangan} onChange={(e) => ubah(idx, "area_ruangan", e.target.value)} />
              </div>
            </div>
            <div className="kl-dua">
              <div className="kl-field">
                <label>Jam mulai *</label>
                <input type="time" className="kl-input" value={it.jam_mulai} onChange={(e) => ubah(idx, "jam_mulai", e.target.value)} />
              </div>
              <div className="kl-field">
                <label>Jam selesai *</label>
                <input type="time" className="kl-input" value={it.jam_selesai} onChange={(e) => ubah(idx, "jam_selesai", e.target.value)} />
              </div>
            </div>
            <div className="kl-field">
              <label>Alasan *</label>
              <input className="kl-input" placeholder={placeholderAlasan} value={it.alasan} onChange={(e) => ubah(idx, "alasan", e.target.value)} />
            </div>
          </div>
        ))}

        <button type="button" className="sa-btn is-soft" onClick={() => setItems((l) => [...l, barisBaru()])}>+ Tambah tanggal lembur</button>
        <button type="submit" className="sa-btn is-primary" disabled={mengirim} style={{ height: "48px", opacity: mengirim ? 0.6 : 1 }}>
          {mengirim ? "Mengirim..." : `Kirim ${items.length} Klaim Lembur`}
        </button>
      </form>

      {klaimSaya.length > 0 && (
        <div style={{ marginTop: "22px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
          <div style={{ fontWeight: 800, fontSize: "14px", color: "var(--ink)", marginBottom: "10px" }}>Klaim Saya</div>
          {klaimSaya.map((k) => {
            const st = k.status === "Approved" ? { teks: "Disetujui", fg: "var(--ok)", bg: "var(--ok-50)" }
              : k.status === "Rejected" ? { teks: "Ditolak", fg: "var(--red-600)", bg: "var(--red-50)" }
              : { teks: "Menunggu GA", fg: "var(--warn)", bg: "var(--warn-50)" };
            return (
              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "var(--bg)", marginBottom: "6px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)" }}>{k.periode || "-"}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)", overflowWrap: "anywhere" }}>
                    {(k.items || []).length} tanggal · {(k.items || []).map((it) => it.tanggal.split("-").slice(1).reverse().join("/")).join(", ")}
                  </div>
                </div>
                <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "3px 9px", borderRadius: "8px", color: st.fg, background: st.bg, flexShrink: 0 }}>{st.teks}</span>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
