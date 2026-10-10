"use client";

/**
 * Admin Booking Kendaraan & Ruangan (§80) -- lihat jadwal, ubah jadwal (cek bentrok), batalkan, dan
 * tambah booking atas nama karyawan. Booking dibuat karyawan dari portal & langsung tercatat.
 */

import { useEffect, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import Modal from "../../../components/ui/Modal";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import BookingModal from "../../../components/BookingModal";
import {
  cariBentrok, keInputWITA, rentangWaktu, RUANGAN_BOOKING, waktuDariInput,
  type Booking, type JenisBooking,
} from "../../../lib/booking";

const getPlat = (k?: string) => (k || "").split(" - ")[0].trim();
const tglWITA = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(d);

export default function AdminBookingPage() {
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({ depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });
  const admin = session?.nama || "Admin";

  const [daftar, setDaftar] = useState<Booking[] | null>(null);
  const [filterJenis, setFilterJenis] = useState<"semua" | JenisBooking>("semua");
  const [lihatLewat, setLihatLewat] = useState(false);
  const [karyawan, setKaryawan] = useState<{ nama: string; departemen?: string }[]>([]);
  const [kendaraan, setKendaraan] = useState<string[]>([]);
  const [tambah, setTambah] = useState<JenisBooking | null>(null);
  const [ubah, setUbah] = useState<Booking | null>(null);
  const [batal, setBatal] = useState<Booking | null>(null);
  const [mulai, setMulai] = useState("");
  const [sampai, setSampai] = useState("");
  const [alasan, setAlasan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [sekarang, setSekarang] = useState(0);

  useEffect(() => {
    if (!isReady) return;
    // Mendatang/berjalan (sampai >= sekarang) atau ikut 30 hari terakhir. Filter 1 field.
    const batas = new Date(Date.now() - (lihatLewat ? 30 : 0) * 86400000);
    const unsub = onSnapshot(query(collection(db, "booking"), where("sampai", ">=", Timestamp.fromDate(batas))), (snap) => {
      setSekarang(Date.now());
      setDaftar(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking)).sort((a, b) => a.mulai.toMillis() - b.mulai.toMillis()));
    }, (err) => { console.error(err); setDaftar([]); });
    return () => unsub();
  }, [isReady, lihatLewat]);

  useEffect(() => {
    if (!isReady) return;
    getDocs(collection(db, "employees_directory")).then((s) => setKaryawan(s.docs.map((d) => ({ nama: d.data().nama, departemen: d.data().departemen })).filter((k) => k.nama)));
    getDocs(collection(db, "master_kendaraan")).then((s) => setKendaraan(Array.from(new Set(s.docs.map((d) => getPlat(d.data().kendaraan)).filter(Boolean))).sort()));
  }, [isReady]);

  const bukaUbah = (b: Booking) => { setUbah(b); setMulai(keInputWITA(b.mulai.toDate())); setSampai(keInputWITA(b.sampai.toDate())); };

  const simpanUbah = async () => {
    if (!ubah) return;
    const m = waktuDariInput(mulai);
    const s = waktuDariInput(sampai);
    if (s <= m) return showToast("Waktu selesai harus setelah waktu mulai.", "warning");
    setMenyimpan(true);
    try {
      const tabrakan = await cariBentrok(ubah.objek_id, m, s, ubah.id);
      if (tabrakan.length) {
        const b = tabrakan[0];
        showToast(`Bentrok dengan booking ${b.nama_pemesan} (${rentangWaktu(b.mulai.toDate(), b.sampai.toDate())}).`, "error");
        return;
      }
      await updateDoc(doc(db, "booking", ubah.id), { mulai: Timestamp.fromDate(m), sampai: Timestamp.fromDate(s), diubah_oleh: admin, diubah_pada: serverTimestamp() });
      showToast("Jadwal booking diubah.", "success");
      setUbah(null);
    } catch (err) {
      console.error(err);
      showToast("Gagal mengubah jadwal.", "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const simpanBatal = async () => {
    if (!batal) return;
    if (!alasan.trim()) return showToast("Isi alasan pembatalan.", "warning");
    setMenyimpan(true);
    try {
      await updateDoc(doc(db, "booking", batal.id), { status: "dibatalkan", alasan_batal: alasan.trim(), dibatalkan_oleh: admin, dibatalkan_pada: serverTimestamp() });
      showToast("Booking dibatalkan.", "success");
      setBatal(null);
      setAlasan("");
    } catch (err) {
      console.error(err);
      showToast("Gagal membatalkan booking.", "error");
    } finally {
      setMenyimpan(false);
    }
  };

  if (!isReady) return null;

  const tampil = (daftar || []).filter((b) => filterJenis === "semua" || b.jenis === filterJenis);
  const grup: { tanggal: string; isi: Booking[] }[] = [];
  tampil.forEach((b) => {
    const tg = tglWITA(b.mulai.toDate());
    const g = grup[grup.length - 1];
    if (g && g.tanggal === tg) g.isi.push(b); else grup.push({ tanggal: tg, isi: [b] });
  });
  const statusDari = (b: Booking) =>
    b.status === "dibatalkan" ? { teks: "Dibatalkan", fg: "var(--muted)", bg: "var(--hover)" }
    : b.sampai.toMillis() <= sekarang ? { teks: "Selesai", fg: "var(--muted)", bg: "var(--hover)" }
    : b.mulai.toMillis() <= sekarang ? { teks: "Berjalan", fg: "var(--ok)", bg: "var(--ok-50)" }
    : { teks: "Mendatang", fg: "var(--info)", bg: "var(--info-50)" };

  return (
    <AdminShell
      title="Booking Kendaraan & Ruangan"
      subtitle="Dibuat karyawan dari portal & langsung tercatat — ubah jadwal atau batalkan bila ada perubahan mendadak"
      userName={admin}
      actions={
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="sa-btn is-soft" onClick={() => setTambah("ruangan")}>+ Booking ruangan</button>
          <button type="button" className="sa-btn is-primary" onClick={() => setTambah("kendaraan")}>+ Booking kendaraan</button>
        </div>
      }
    >
      <div className="sa-tabs" role="tablist" aria-label="Jenis booking" style={{ width: "fit-content", maxWidth: "100%" }}>
        {(["semua", "ruangan", "kendaraan"] as const).map((j) => (
          <button key={j} type="button" role="tab" aria-selected={filterJenis === j} className={`sa-tab${filterJenis === j ? " is-active" : ""}`} onClick={() => setFilterJenis(j)}>
            {j === "semua" ? "Semua" : j === "ruangan" ? "Ruangan" : "Kendaraan"}
          </button>
        ))}
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--ink-soft)", marginBottom: "14px", cursor: "pointer" }}>
        <input type="checkbox" checked={lihatLewat} onChange={(e) => setLihatLewat(e.target.checked)} /> Tampilkan juga yang sudah lewat (30 hari)
      </label>

      {daftar === null ? <Tile><div style={{ color: "var(--muted)" }}>Memuat...</div></Tile>
        : grup.length === 0 ? <Tile><div style={{ color: "var(--muted)", textAlign: "center", padding: "20px" }}>Belum ada booking.</div></Tile>
        : grup.map((g) => (
          <Tile key={g.tanggal} style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 800, color: g.tanggal === tglWITA(new Date(sekarang || 0)) ? "var(--red-600)" : "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
              {new Date(`${g.tanggal}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {g.isi.map((b) => {
                const st = statusDari(b);
                const bisaKelola = b.status === "aktif" && b.sampai.toMillis() > sekarang;
                return (
                  <div key={b.id} style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", padding: "12px 14px", borderRadius: "14px", background: "var(--bg)", opacity: b.status === "dibatalkan" ? 0.6 : 1 }}>
                    <div style={{ flex: 1, minWidth: "220px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--ink)" }}>
                        {b.objek_nama} <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "8px", marginLeft: "6px", color: st.fg, background: st.bg }}>{st.teks}</span>
                      </div>
                      <div style={{ fontSize: "12.5px", color: "var(--ink-soft)", marginTop: "2px" }}>{rentangWaktu(b.mulai.toDate(), b.sampai.toDate())} · {b.nama_pemesan}{b.departemen && b.departemen !== "-" ? ` (${b.departemen})` : ""}</div>
                      <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", overflowWrap: "anywhere" }}>
                        {b.jenis === "kendaraan" ? "Tujuan" : "Keperluan"}: {b.keperluan || "-"}
                        {b.status === "dibatalkan" && ` · Dibatalkan ${b.dibatalkan_oleh || ""}: ${b.alasan_batal || "-"}`}
                        {b.diubah_oleh && b.status === "aktif" && ` · Jadwal diubah oleh ${b.diubah_oleh}`}
                      </div>
                      {/* §130 konfirmasi Security */}
                      {b.jenis === "ruangan" && b.status === "aktif" && (
                        <div style={{ fontSize: "11.5px", fontWeight: 700, marginTop: "3px", color: b.dikonfirmasi_oleh ? "var(--ok)" : "var(--warn)" }}>
                          {b.dikonfirmasi_oleh ? `✓ Dikonfirmasi Security (${b.dikonfirmasi_oleh})${b.email_konfirmasi === "terkirim" ? " · email terkirim" : b.email_konfirmasi === "tanpa_email" ? " · pemesan tanpa email" : b.email_konfirmasi === "gagal" ? " · email gagal" : ""}` : "⏳ Belum dikonfirmasi Security"}
                        </div>
                      )}
                    </div>
                    {bisaKelola && (
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button type="button" className="sa-btn is-soft" style={{ height: "36px" }} onClick={() => bukaUbah(b)}>Ubah jadwal</button>
                        <button type="button" className="sa-btn is-soft" style={{ height: "36px", color: "var(--red-600)" }} onClick={() => { setBatal(b); setAlasan(""); }}>Batalkan</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Tile>
        ))}

      <BookingModal
        open={!!tambah}
        onClose={() => setTambah(null)}
        jenis={tambah || "ruangan"}
        daftarObjek={tambah === "kendaraan" ? kendaraan.map((p) => ({ id: p, nama: p })) : RUANGAN_BOOKING}
        karyawan={karyawan}
      />

      <Modal open={!!ubah} onClose={() => !menyimpan && setUbah(null)} maxWidth="460px">
        {ubah && (
          <div>
            <h3 style={{ margin: "0 40px 4px 0", fontSize: "18px", fontWeight: 800, color: "var(--ink)" }}>Ubah Jadwal</h3>
            <p style={{ margin: "0 0 14px", fontSize: "13px", color: "var(--ink-soft)" }}>{ubah.objek_nama} · {ubah.nama_pemesan}</p>
            <div style={{ display: "grid", gap: "10px", marginBottom: "14px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>Mulai
                <input type="datetime-local" className="sa-field" style={{ width: "100%", cursor: "text", marginTop: "4px" }} value={mulai} onChange={(e) => setMulai(e.target.value)} />
              </label>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>Selesai
                <input type="datetime-local" className="sa-field" style={{ width: "100%", cursor: "text", marginTop: "4px" }} value={sampai} onChange={(e) => setSampai(e.target.value)} />
              </label>
            </div>
            <button type="button" className="sa-btn is-primary" style={{ width: "100%" }} onClick={simpanUbah} disabled={menyimpan}>{menyimpan ? "Memeriksa..." : "Simpan jadwal"}</button>
          </div>
        )}
      </Modal>

      <Modal open={!!batal} onClose={() => !menyimpan && setBatal(null)} maxWidth="460px">
        {batal && (
          <div>
            <h3 style={{ margin: "0 40px 4px 0", fontSize: "18px", fontWeight: 800, color: "var(--red-600)" }}>Batalkan Booking</h3>
            <p style={{ margin: "0 0 14px", fontSize: "13px", color: "var(--ink-soft)" }}>{batal.objek_nama} · {batal.nama_pemesan} · {rentangWaktu(batal.mulai.toDate(), batal.sampai.toDate())}</p>
            <input className="sa-field" style={{ width: "100%", cursor: "text", marginBottom: "14px" }} placeholder="Alasan, mis. ruangan dipakai direksi" value={alasan} onChange={(e) => setAlasan(e.target.value)} />
            <button type="button" className="sa-btn is-primary" style={{ width: "100%" }} onClick={simpanBatal} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Batalkan booking"}</button>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
