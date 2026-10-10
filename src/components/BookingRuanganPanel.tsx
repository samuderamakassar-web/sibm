"use client";

/**
 * Booking ruangan hari ini & besok untuk Security (§129) -- live (onSnapshot). §130: Security menekan Konfirmasi
 * (opsional catatan) -> booking ditandai dikonfirmasi_oleh/pada, lalu email ke pemesan (email dari Master Karyawan).
 * Push notif booking baru tetap dari scripts/laporan-baru-reminder.mjs (per jalannya cron).
 */

import { useEffect, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { rentangWaktu, type Booking } from "../lib/booking";
import { kirimEmail } from "../lib/notify";
import { buildBookingDikonfirmasiEmailHtml } from "../lib/emailTemplates";
import { useToast } from "./ui/ToastProvider";
import Modal from "./ui/Modal";

const tz = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });
const fmtJam = (ts?: Timestamp | null) => (ts ? ts.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" }) : "");

/** Email pemesan dari Master Karyawan (nama persis, lalu cocok tanpa beda huruf besar/spasi). */
async function emailPemesan(nama: string): Promise<string> {
  const persis = await getDocs(query(collection(db, "employees_directory"), where("nama", "==", nama)));
  const e1 = persis.docs.map((d) => String(d.data().email || "")).find(Boolean);
  if (e1) return e1;
  const semua = await getDocs(collection(db, "employees_directory"));
  const n = nama.trim().toLowerCase();
  return String(semua.docs.map((d) => d.data()).find((k) => String(k.nama || "").trim().toLowerCase() === n)?.email || "");
}

export default function BookingRuanganPanel({ petugas }: { petugas: string }) {
  const showToast = useToast();
  const [daftar, setDaftar] = useState<Booking[]>([]);
  const [sekarang, setSekarang] = useState(() => Date.now());
  const [konfirm, setKonfirm] = useState<Booking | null>(null);
  const [catatan, setCatatan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    const hariIni = tz.format(new Date());
    const awal = Timestamp.fromDate(new Date(`${hariIni}T00:00:00+08:00`));
    const akhir = Timestamp.fromMillis(awal.toMillis() + 2 * 86400000);
    // satu field (mulai) saja -> tanpa index komposit; jenis & status disaring di klien
    const unsub = onSnapshot(query(collection(db, "booking"), where("mulai", ">=", awal), where("mulai", "<", akhir)), (s) => {
      setDaftar(s.docs.map((d) => ({ id: d.id, ...d.data() } as Booking)).filter((b) => b.jenis === "ruangan" && b.status === "aktif").sort((a, b) => a.mulai.toMillis() - b.mulai.toMillis()));
    }, (e) => console.error("[booking security]", e));
    const t = setInterval(() => setSekarang(Date.now()), 60000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  const simpanKonfirmasi = async () => {
    if (!konfirm || menyimpan) return;
    setMenyimpan(true);
    try {
      const b = konfirm;
      const email = await emailPemesan(b.nama_pemesan).catch(() => "");
      let status: "terkirim" | "tanpa_email" | "gagal" = "tanpa_email";
      if (email) {
        const html = buildBookingDikonfirmasiEmailHtml({
          namaPemesan: b.nama_pemesan, ruangan: b.objek_nama, waktu: rentangWaktu(b.mulai.toDate(), b.sampai.toDate()),
          keperluan: b.keperluan, namaPetugas: petugas, catatan: catatan.trim() || undefined,
        });
        const hasil = await kirimEmail(email, `Booking ${b.objek_nama} Dikonfirmasi`, html, b.nama_pemesan);
        status = hasil.sukses ? "terkirim" : "gagal";
        if (!hasil.sukses) console.error("[booking] email konfirmasi gagal:", hasil.pesanError);
      }
      await updateDoc(doc(db, "booking", b.id), {
        dikonfirmasi_oleh: petugas, dikonfirmasi_pada: serverTimestamp(), email_konfirmasi: status,
        ...(catatan.trim() ? { catatan_security: catatan.trim() } : {}),
      });
      showToast(status === "terkirim" ? `Dikonfirmasi — email terkirim ke ${b.nama_pemesan}.` : status === "gagal" ? "Dikonfirmasi, tetapi email gagal terkirim." : `Dikonfirmasi — ${b.nama_pemesan} belum punya email di Master Karyawan.`, status === "terkirim" ? "success" : "warning");
      setKonfirm(null); setCatatan("");
    } catch (e) { console.error(e); showToast("Gagal mengonfirmasi booking.", "error"); }
    finally { setMenyimpan(false); }
  };

  const tampil = daftar.filter((b) => b.sampai.toMillis() > sekarang);
  if (tampil.length === 0) return null;
  const belum = tampil.filter((b) => !b.dikonfirmasi_oleh).length;
  return (
    <div style={{ marginBottom: "24px", padding: "16px", borderRadius: "20px", border: belum ? "2px solid var(--warn)" : "1px solid var(--line)", background: "var(--surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <b style={{ fontSize: "16px", color: "var(--ink)" }}>📅 Booking ruangan ({tampil.length}){belum ? ` · ${belum} perlu konfirmasi` : ""}</b>
        <span style={{ fontSize: "12px", color: "var(--muted)" }}>Hari ini & besok · konfirmasi = email ke pemesan</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {tampil.map((b) => {
          const baru = !!b.dibuat_pada && sekarang - b.dibuat_pada.toMillis() < 3600000;
          const berlangsung = b.mulai.toMillis() <= sekarang;
          const sudah = !!b.dikonfirmasi_oleh;
          return (
            <div key={b.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "10px", alignItems: "center", padding: "10px 12px", borderRadius: "14px", background: sudah ? "var(--bg)" : "var(--warn-50)" }}>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  {baru && !sudah && <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "1px 6px", borderRadius: "5px", background: "var(--warn)", color: "#fff" }}>BARU</span>}
                  {berlangsung && <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "1px 6px", borderRadius: "5px", background: "var(--ok-50)", color: "var(--ok)" }}>BERLANGSUNG</span>}
                  <b style={{ fontSize: "14px", color: "var(--ink)" }}>{b.objek_nama}</b>
                  <span style={{ fontSize: "13px", color: "var(--ink-soft)" }}>· {rentangWaktu(b.mulai.toDate(), b.sampai.toDate())}</span>
                </div>
                <div style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{b.nama_pemesan}{b.departemen && b.departemen !== "-" ? ` · ${b.departemen}` : ""}{b.keperluan ? ` — ${b.keperluan}` : ""}</div>
                {sudah && <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--ok)" }}>✓ Dikonfirmasi {b.dikonfirmasi_oleh} {fmtJam(b.dikonfirmasi_pada)}{b.email_konfirmasi === "terkirim" ? " · email terkirim" : b.email_konfirmasi === "tanpa_email" ? " · pemesan tanpa email" : b.email_konfirmasi === "gagal" ? " · email gagal" : ""}</div>}
              </div>
              {!sudah && <button type="button" className="sa-btn is-primary" onClick={() => { setKonfirm(b); setCatatan(""); }}>Konfirmasi</button>}
            </div>
          );
        })}
      </div>

      <Modal open={!!konfirm} onClose={() => !menyimpan && setKonfirm(null)} maxWidth="440px">
        {konfirm && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "18px", color: "var(--ink)" }}>Konfirmasi booking</h3>
            <div style={{ fontSize: "13.5px", color: "var(--ink-soft)" }}><b style={{ color: "var(--ink)" }}>{konfirm.objek_nama}</b> · {rentangWaktu(konfirm.mulai.toDate(), konfirm.sampai.toDate())}<br />{konfirm.nama_pemesan}{konfirm.keperluan ? ` — ${konfirm.keperluan}` : ""}</div>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "var(--ink-soft)" }}>Catatan untuk pemesan (opsional)
              <input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Mis. kunci ruangan diambil di pos lobby" style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: "4px", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: "14px", fontFamily: "inherit" }} />
            </label>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>Email konfirmasi dikirim ke alamat pemesan di Master Karyawan.</span>
            <button type="button" className="sa-btn is-primary" style={{ height: "46px" }} disabled={menyimpan} onClick={simpanKonfirmasi}>{menyimpan ? "Menyimpan..." : "Konfirmasi & kirim email"}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
