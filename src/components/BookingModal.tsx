"use client";

/**
 * Modal Booking Kendaraan / Ruangan (§80) -- dipakai portal (kartu Armada & menu Booking Ruangan).
 * Menampilkan jadwal terdekat objek terpilih (termasuk "sedang dipakai"), form booking, dan modal
 * pemberitahuan bila jam yang diminta bentrok dengan booking lain (siapa, kapan, tujuan).
 */

import { useCallback, useEffect, useState } from "react";
import Modal from "./ui/Modal";
import { useToast } from "./ui/ToastProvider";
import {
  bookingObjek, buatBooking, cariBentrok, keInputWITA, rentangWaktu, waktuDariInput,
  type Booking, type JenisBooking, type ObjekBooking,
} from "../lib/booking";

interface Props {
  open: boolean;
  onClose: () => void;
  jenis: JenisBooking;
  daftarObjek: ObjekBooking[];
  objekAwal?: string | null;
  karyawan: { nama: string; departemen?: string }[];
  /** Kendaraan: tombol "Lihat riwayat kendaraan ini" di portal. */
  onLihatRiwayat?: (objek: ObjekBooking) => void;
}

function Baris({ b, tegas, jenis }: { b: Booking; tegas?: boolean; jenis: JenisBooking }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: "12px", background: tegas ? "var(--red-50)" : "var(--bg)", color: "var(--ink)" }}>
      <div style={{ fontSize: "13px", fontWeight: 800 }}>{b.nama_pemesan}{b.departemen && b.departemen !== "-" ? <span style={{ fontWeight: 600, color: "var(--muted)" }}> · {b.departemen}</span> : null}</div>
      <div style={{ fontSize: "12px", color: "var(--ink-soft)", marginTop: "2px" }}>{rentangWaktu(b.mulai.toDate(), b.sampai.toDate())}</div>
      <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", overflowWrap: "anywhere" }}>{jenis === "kendaraan" ? "Tujuan" : "Keperluan"}: {b.keperluan || "-"}</div>
    </div>
  );
}

const jamBulatBerikut = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
};

export default function BookingModal({ open, onClose, jenis, daftarObjek, objekAwal, karyawan, onLihatRiwayat }: Props) {
  const showToast = useToast();
  const [objekId, setObjekId] = useState<string>("");
  const [jadwal, setJadwal] = useState<Booking[] | null>(null);
  const [nama, setNama] = useState("");
  const [mulai, setMulai] = useState("");
  const [sampai, setSampai] = useState("");
  const [keperluan, setKeperluan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [bentrok, setBentrok] = useState<Booking[] | null>(null);
  const [sekarang, setSekarang] = useState(0);

  // Reset setiap kali modal dibuka.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const awal = jamBulatBerikut();
      setObjekId(objekAwal || daftarObjek[0]?.id || "");
      setMulai(keInputWITA(awal));
      setSampai(keInputWITA(new Date(awal.getTime() + 60 * 60000)));
      setKeperluan("");
      setBentrok(null);
    }, 0);
    return () => clearTimeout(t);
  }, [open, objekAwal, daftarObjek]);

  const muatJadwal = useCallback((id: string) => {
    if (!id) return;
    setJadwal(null);
    bookingObjek(id, new Date())
      .then((data) => { setSekarang(Date.now()); setJadwal(data); })
      .catch((err) => { console.error("[booking] Gagal memuat jadwal:", err); setJadwal([]); });
  }, []);
  useEffect(() => {
    if (!open || !objekId) return;
    const t = setTimeout(() => muatJadwal(objekId), 0);
    return () => clearTimeout(t);
  }, [open, objekId, muatJadwal]);

  const objek = daftarObjek.find((o) => o.id === objekId) || null;
  const sedangDipakai = (jadwal || []).find((b) => b.mulai.toMillis() <= sekarang && b.sampai.toMillis() > sekarang) || null;
  const labelTujuan = jenis === "kendaraan" ? "Tujuan / keperluan" : "Keperluan";

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!objek) return showToast(`Pilih ${jenis} dulu.`, "warning");
    const emp = karyawan.find((k) => k.nama.trim().toLowerCase() === nama.trim().toLowerCase());
    if (!emp) return showToast("Pilih nama dari daftar Master Data Karyawan (ketik lalu pilih dari saran).", "warning");
    if (!mulai || !sampai) return showToast("Isi waktu mulai & selesai.", "warning");
    const m = waktuDariInput(mulai);
    const s = waktuDariInput(sampai);
    if (s <= m) return showToast("Waktu selesai harus setelah waktu mulai.", "warning");
    if (m.getTime() < Date.now() - 15 * 60000) return showToast("Waktu mulai sudah lewat.", "warning");
    if (!keperluan.trim()) return showToast(`Isi ${labelTujuan.toLowerCase()}.`, "warning");

    setMenyimpan(true);
    try {
      const tabrakan = await cariBentrok(objek.id, m, s);
      if (tabrakan.length) { setBentrok(tabrakan); return; }
      await buatBooking({ jenis, objek, nama: emp.nama, departemen: emp.departemen || "-", mulai: m, sampai: s, keperluan });
      showToast(`${objek.nama} berhasil dibooking: ${rentangWaktu(m, s)}.`, "success");
      setKeperluan("");
      muatJadwal(objek.id);
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan booking. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setMenyimpan(false);
    }
  };


  return (
    <>
      <Modal open={open} onClose={() => !menyimpan && onClose()} maxWidth="620px">
        <style dangerouslySetInnerHTML={{ __html: `
          .bk-label { display: block; font-size: 12px; font-weight: 700; color: var(--ink-soft); margin-bottom: 5px; }
          .bk-input { width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-family: inherit; font-size: 14px; box-sizing: border-box; }
          .bk-dua { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .bk-chip { padding: 8px 12px; border-radius: 12px; border: 2px solid transparent; background: var(--bg); color: var(--ink); font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
          .bk-chip.is-aktif { border-color: var(--brand); background: var(--red-50); color: var(--red-600); }
          @media (max-width: 520px) { .bk-dua { grid-template-columns: 1fr; } }
        `}} />
        <h2 style={{ margin: "0 40px 4px 0", fontSize: "19px", fontWeight: 800, color: "var(--ink)" }}>{jenis === "kendaraan" ? "Booking Kendaraan" : "Booking Ruangan"}</h2>
        <p style={{ margin: "0 0 14px", fontSize: "12.5px", color: "var(--ink-soft)" }}>Langsung tercatat. Perubahan / pembatalan mendadak hubungi Admin GA.</p>

        {jenis === "ruangan" ? (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
            {daftarObjek.map((o) => (
              <button key={o.id} type="button" className={`bk-chip${o.id === objekId ? " is-aktif" : ""}`} onClick={() => setObjekId(o.id)} aria-pressed={o.id === objekId}>{o.nama}</button>
            ))}
          </div>
        ) : (
          <div style={{ marginBottom: "14px" }}>
            <label className="bk-label" htmlFor="bk-objek">Kendaraan</label>
            <select id="bk-objek" className="bk-input" value={objekId} onChange={(e) => setObjekId(e.target.value)}>
              {daftarObjek.map((o) => <option key={o.id} value={o.id}>{o.nama}</option>)}
            </select>
          </div>
        )}

        {sedangDipakai && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--red-600)", marginBottom: "6px" }}>SEDANG DIPAKAI SEKARANG</div>
            <Baris b={sedangDipakai} tegas jenis={jenis} />
          </div>
        )}

        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Jadwal terdekat</div>
          {jadwal === null ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Memuat jadwal...</div>
            : jadwal.filter((b) => b !== sedangDipakai).length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>{sedangDipakai ? "Tidak ada booking lain." : "Belum ada booking — kosong."}</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>{jadwal.filter((b) => b !== sedangDipakai).slice(0, 8).map((b) => <Baris key={b.id} b={b} jenis={jenis} />)}</div>}
        </div>

        <form onSubmit={kirim} style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
          <div>
            <label className="bk-label" htmlFor="bk-nama">Nama pemesan *</label>
            <input id="bk-nama" className="bk-input" list="bk-karyawan" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Ketik nama Anda..." autoComplete="off" />
            <datalist id="bk-karyawan">{karyawan.map((k) => <option key={k.nama} value={k.nama} />)}</datalist>
          </div>
          <div className="bk-dua">
            <div>
              <label className="bk-label" htmlFor="bk-mulai">Mulai *</label>
              <input id="bk-mulai" type="datetime-local" className="bk-input" value={mulai} onChange={(e) => setMulai(e.target.value)} />
            </div>
            <div>
              <label className="bk-label" htmlFor="bk-sampai">Selesai *</label>
              <input id="bk-sampai" type="datetime-local" className="bk-input" value={sampai} min={mulai || undefined} onChange={(e) => setSampai(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="bk-label" htmlFor="bk-keperluan">{labelTujuan} *</label>
            <input id="bk-keperluan" className="bk-input" value={keperluan} onChange={(e) => setKeperluan(e.target.value)} maxLength={120}
              placeholder={jenis === "kendaraan" ? "Mis. Kunjungan klien ke Maros" : "Mis. Rapat koordinasi tim"} />
          </div>
          <button type="submit" className="sa-btn is-primary" disabled={menyimpan} style={{ height: "46px", opacity: menyimpan ? 0.6 : 1 }}>
            {menyimpan ? "Memeriksa jadwal..." : `Booking ${objek?.nama || ""}`}
          </button>
          {jenis === "kendaraan" && objek && onLihatRiwayat && (
            <button type="button" className="sa-btn is-soft" onClick={() => onLihatRiwayat(objek)}>Lihat riwayat keluar-masuk kendaraan ini</button>
          )}
        </form>
      </Modal>

      {/* Pemberitahuan bentrok -- siapa yang sudah booking, kapan, tujuan ke mana. */}
      <Modal open={!!bentrok} onClose={() => setBentrok(null)} maxWidth="480px">
        <h3 style={{ margin: "0 40px 6px 0", fontSize: "18px", fontWeight: 800, color: "var(--red-600)" }}>Jadwal sudah dibooking</h3>
        <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--ink-soft)" }}>{objek?.nama} pada jam yang Anda pilih sudah dibooking oleh:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
          {(bentrok || []).map((b) => <Baris key={b.id} b={b} tegas jenis={jenis} />)}
        </div>
        <button type="button" className="sa-btn is-dark" style={{ width: "100%" }} onClick={() => setBentrok(null)}>Pilih jam lain</button>
      </Modal>
    </>
  );
}
