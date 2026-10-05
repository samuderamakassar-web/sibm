"use client";

/**
 * Mode Serah Terima Shift (§87) -- disiplin tukar jaga Security. Dipasang di AdminShell untuk akun
 * Security (bukan magang), aktif di semua halaman kecuali /dashboard/security/tukar-shift (tempat scan).
 *
 * PETUGAS KELUAR (jadwal shift yang baru berakhir 08:00/20:00):
 *   layar terkunci, QR serah terima tampil OTOMATIS + hitungan "pengganti belum datang".
 *   Satu-satunya pilihan: EXTEND n menit -> menu dibuka sampai waktu habis, lalu terkunci lagi.
 *   Lepas bila serah terima selesai (pengganti scan) atau extend permanen (EskalasiShiftModal).
 * PETUGAS MASUK (jadwal shift berikutnya):
 *   15 menit sebelum jam jaga: hitung mundur. Saat jam jaga: tombol "Scan QR" (manual) & menu terkunci
 *   sampai serah terima selesai. Jalan darurat: "Mulai jaga tanpa serah terima" (alasan wajib) ->
 *   tercatat terlambat/tanpa serah terima & Admin GA dinotifikasi lewat cron shift-handover-escalation.
 *
 * Data: security_shift_handover/HO_{tanggal}_{ShiftX} (deterministik, sama dgn TukarShiftSecurityPage)
 *       security_shift_extend/{tanggal}_{ShiftX} (sama dgn cron eskalasi & EskalasiShiftModal).
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { hitungShiftSesi, waktuWITASekarang, AMBANG_TELAT_SERAH_TERIMA_MENIT, type ShiftLabel } from "../lib/shift";
import QrLokal from "./QrLokal";
import { daerahTulis } from "../lib/daerah";
import { logout } from "../hooks/useAuthGuard";

export const idHandover = (tanggal: string, shift: string) => `HO_${tanggal}_${shift.replace(" ", "")}`;
const idExtend = (tanggal: string, shift: string) => `${tanggal}_${shift.replace(" ", "")}`;
const MENIT_SEBELUM = 15;
const pad = (n: number) => String(n).padStart(2, "0");
const fmtDurasi = (detik: number) => {
  const d = Math.max(0, Math.floor(detik));
  const j = Math.floor(d / 3600);
  return j > 0 ? `${j}:${pad(Math.floor((d % 3600) / 60))}:${pad(d % 60)}` : `${pad(Math.floor(d / 60))}:${pad(d % 60)}`;
};
const geserTgl = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Batas shift terdekat (08:00/20:00 WITA) beserta shift lama & shift baru di batas itu. */
function batasShift(nowMs: number) {
  const now = waktuWITASekarang();
  const cur = hitungShiftSesi(now);
  // batas yang sudah lewat (awal shift berjalan)
  const awalCur = new Date(`${cur.tanggal_shift}T${cur.shift === "Shift 1" ? "08" : "20"}:00:00+08:00`).getTime();
  const prev = cur.shift === "Shift 1" ? { tanggal: geserTgl(cur.tanggal_shift, -1), shift: "Shift 2" as ShiftLabel } : { tanggal: cur.tanggal_shift, shift: "Shift 1" as ShiftLabel };
  // batas berikutnya (akhir shift berjalan)
  const next = cur.shift === "Shift 1" ? { tanggal: cur.tanggal_shift, shift: "Shift 2" as ShiftLabel } : { tanggal: geserTgl(cur.tanggal_shift, 1), shift: "Shift 1" as ShiftLabel };
  const awalNext = awalCur + 12 * 3600000;
  return { cur: { tanggal: cur.tanggal_shift, shift: cur.shift }, prev, next, awalCur, awalNext, detikSejakAwal: (nowMs - awalCur) / 1000, detikMenujuNext: (awalNext - nowMs) / 1000 };
}

interface HO { status?: string; petugas_keluar?: string; petugas_masuk?: string | null }
interface EXT { status?: string; personil_extend?: string | null; extend_sampai?: Timestamp | null; tipe?: string | null }

export default function SerahTerimaGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const [nama, setNama] = useState("");
  const [now, setNow] = useState(0);
  const [roster, setRoster] = useState<Record<string, Record<string, string>> | null>(null);
  const [hoCur, setHoCur] = useState<HO | null | undefined>(undefined);
  const [hoNext, setHoNext] = useState<HO | null | undefined>(undefined);
  const [ext, setExt] = useState<EXT | null>(null);
  const [menitExtend, setMenitExtend] = useState("");
  const [alasan, setAlasan] = useState("");
  const [modeDarurat, setModeDarurat] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  // Identitas (hanya Security non-magang)
  useEffect(() => {
    try {
      const dept = localStorage.getItem("pic_dept") || "";
      const role = (localStorage.getItem("pic_role") || "").toLowerCase();
      const n = localStorage.getItem("pic_nama") || "";
      if (dept === "Security" && !role.includes("magang") && n) {
        const t = setTimeout(() => { setNama(n); setNow(Date.now()); }, 0);
        return () => clearTimeout(t);
      }
    } catch { /* abaikan */ }
  }, []);

  useEffect(() => {
    if (!nama) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [nama]);

  const b = now ? batasShift(now) : null;
  const kunciBatas = b ? `${b.cur.tanggal}|${b.cur.shift}` : "";

  // Roster tanggal sebelumnya..berikutnya (2 dokumen bulan bila perlu)
  useEffect(() => {
    if (!nama || !b) return;
    let batal = false;
    const bulan = Array.from(new Set([b.prev.tanggal, b.cur.tanggal, b.next.tanggal].map((t) => t.slice(0, 7))));
    Promise.all(bulan.map((m) => getDoc(doc(db, "security_monthly_schedules", m)))).then((snaps) => {
      if (batal) return;
      const gabung: Record<string, Record<string, string>> = {};
      snaps.forEach((s) => Object.assign(gabung, (s.exists() && s.data().data_hari) || {}));
      setRoster(gabung);
    }).catch(() => setRoster({}));
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dimuat ulang tiap ganti shift
  }, [nama, kunciBatas]);

  // Handover shift berjalan & shift berikutnya, extend shift berjalan
  useEffect(() => {
    if (!nama || !b) return;
    const u1 = onSnapshot(doc(db, "security_shift_handover", idHandover(b.cur.tanggal, b.cur.shift)), (s) => setHoCur(s.exists() ? (s.data() as HO) : null), () => setHoCur(null));
    const u2 = onSnapshot(doc(db, "security_shift_handover", idHandover(b.next.tanggal, b.next.shift)), (s) => setHoNext(s.exists() ? (s.data() as HO) : null), () => setHoNext(null));
    const u3 = onSnapshot(doc(db, "security_shift_extend", idExtend(b.cur.tanggal, b.cur.shift)), (s) => setExt(s.exists() ? (s.data() as EXT) : null), () => setExt(null));
    return () => { u1(); u2(); u3(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nama, kunciBatas]);

  const siap = !!(nama && b && roster && hoCur !== undefined && hoNext !== undefined);
  const jadwalMentah = (tgl: string) => (roster && nama ? String(roster[tgl]?.[nama] || "") : "");
  const jadwal = (tgl: string) => { const l = jadwalMentah(tgl); return l.includes("Shift 1") ? "Shift 1" : l.includes("Shift 2") ? "Shift 2" : l; };
  const sayaKeluarAwal = siap && b ? jadwal(b.prev.tanggal) === b.prev.shift && jadwal(b.cur.tanggal) !== b.cur.shift : false;
  const perluBuatQR = sayaKeluarAwal && hoCur === null;
  useEffect(() => {
    if (!perluBuatQR || !b) return;
    // Petugas keluar: dokumen serah terima dibuat OTOMATIS (deterministik -> 2 petugas keluar berbagi QR yang sama)
    setDoc(doc(db, "security_shift_handover", idHandover(b.cur.tanggal, b.cur.shift)), {
      daerah: daerahTulis(), tanggal_shift: b.cur.tanggal, shift: b.cur.shift, petugas_keluar: nama, petugas_masuk: null,
      status: "menunggu_scan", waktu_generate: serverTimestamp(), waktu_scan: null, dibuat_otomatis: true,
    }, { merge: true }).catch((e) => console.error("[serah terima] Gagal membuat QR:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perluBuatQR, kunciBatas]);

  if (!siap || !b || !roster) return null;
  if (pathname?.startsWith("/dashboard/security/tukar-shift")) return null;

  const sayaKeluar = jadwal(b.prev.tanggal) === b.prev.shift && jadwal(b.cur.tanggal) !== b.cur.shift; // shift lama saya baru berakhir
  const sayaMasuk = jadwal(b.cur.tanggal) === b.cur.shift && jadwal(b.prev.tanggal) !== b.prev.shift;   // shift baru saya sudah mulai
  const sayaMasukNanti = jadwal(b.next.tanggal) === b.next.shift && jadwal(b.cur.tanggal) !== b.cur.shift && b.detikMenujuNext <= MENIT_SEBELUM * 60;
  const selesai = hoCur?.status === "selesai";
  const extendSaya = ext && ext.personil_extend === nama;
  const extendPermanen = extendSaya && ext?.status === "permanen";
  const extendBerjalan = extendSaya && ext?.status === "aktif" && ext.extend_sampai && ext.extend_sampai.toMillis() > now;

  type Mode = "keluar" | "masuk" | "pra" | null;
  let mode: Mode = null;
  // Petugas keluar dikunci maks. 4 jam sejak jam ganti (mis. sudah pulang tanpa serah terima -- tetap tercatat belum selesai).
  if (sayaKeluar && !selesai && !extendPermanen && !extendBerjalan && b.detikSejakAwal < 4 * 3600) mode = "keluar";
  else if (sayaMasuk && !selesai) mode = "masuk";
  else if (sayaMasukNanti && hoNext?.status !== "selesai") mode = "pra";

  // Banner kecil saat extend berjalan (menu terbuka)
  if (!mode) {
    if (sayaKeluar && extendBerjalan && !selesai && ext?.extend_sampai) {
      return (
        <div style={{ position: "fixed", left: "50%", bottom: "92px", transform: "translateX(-50%)", zIndex: 150, background: "var(--warn-solid)", color: "#fff", padding: "10px 16px", borderRadius: "14px", fontSize: "13px", fontWeight: 800, boxShadow: "0 10px 24px -10px rgba(0,0,0,.4)" }}>
          Extend jaga: sisa {fmtDurasi((ext.extend_sampai.toMillis() - now) / 1000)} — pengganti belum scan
        </div>
      );
    }
    return null;
  }


  const extend = async () => {
    const m = parseInt(menitExtend, 10);
    if (!Number.isFinite(m) || m < 5 || m > 240) return alert("Isi menit extend antara 5 sampai 240.");
    setSibuk(true);
    try {
      const ref = doc(db, "security_shift_extend", idExtend(b.cur.tanggal, b.cur.shift));
      const ada = await getDoc(ref);
      const data = {
        tanggal_shift: b.cur.tanggal, shift: b.cur.shift, status: "aktif", tipe: "sementara", personil_extend: nama,
        estimasi_menit: m, extend_sampai: Timestamp.fromMillis(Date.now() + m * 60000), keputusan_pada: serverTimestamp(),
        jumlah_extend: ((ada.exists() && (ada.data().jumlah_extend as number)) || 0) + 1,
      };
      if (ada.exists()) await updateDoc(ref, data);
      else await setDoc(ref, { ...data, daerah: daerahTulis(), petugas_keluar: [nama], petugas_masuk: [], dibuat_pada: serverTimestamp(), selesai_pada: null });
      setMenitExtend("");
    } catch (e) { console.error(e); alert("Gagal menyimpan extend, coba lagi."); }
    finally { setSibuk(false); }
  };

  const mulaiDarurat = async () => {
    if (!alasan.trim()) return alert("Isi alasan dulu.");
    setSibuk(true);
    try {
      const menitTelat = Math.max(0, Math.round(b.detikSejakAwal / 60));
      const ref = doc(db, "security_shift_handover", idHandover(b.cur.tanggal, b.cur.shift));
      const isi = {
        petugas_masuk: nama, status: "selesai", waktu_scan: serverTimestamp(), tanpa_serah_terima: true,
        terlambat: menitTelat > AMBANG_TELAT_SERAH_TERIMA_MENIT, menit_terlambat: menitTelat > AMBANG_TELAT_SERAH_TERIMA_MENIT ? menitTelat : null,
        alasan_telat: `TANPA SERAH TERIMA QR: ${alasan.trim()}`, notif_terlambat_terkirim: false, // cron kirim notif utk terlambat ATAU tanpa_serah_terima
      };
      if (hoCur) await updateDoc(ref, isi);
      else await setDoc(ref, { ...isi, daerah: daerahTulis(), tanggal_shift: b.cur.tanggal, shift: b.cur.shift, petugas_keluar: "(tidak ada)", waktu_generate: serverTimestamp() });
      const extRef = doc(db, "security_shift_extend", idExtend(b.cur.tanggal, b.cur.shift));
      const e = await getDoc(extRef);
      if (e.exists() && e.data().status !== "selesai") await updateDoc(extRef, { status: "selesai", selesai_pada: serverTimestamp(), catatan_selesai: "Petugas masuk mulai jaga tanpa serah terima" });
    } catch (err) { console.error(err); alert("Gagal menyimpan, coba lagi."); }
    finally { setSibuk(false); }
  };

  const qr = hoCur && hoCur.status === "menunggu_scan" ? idHandover(b.cur.tanggal, b.cur.shift) : "";
  const keluarApp = () => logout(router);

  return (
    <div role="dialog" aria-modal="true" aria-label="Mode serah terima shift" style={{ position: "fixed", inset: 0, zIndex: 200, background: "color-mix(in srgb, var(--ground, #f4f1ec) 96%, transparent)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: "420px", background: "var(--tile, #fff)", borderRadius: "28px", padding: "26px 22px", textAlign: "center", boxShadow: "0 30px 60px -20px rgba(0,0,0,.35)", color: "var(--ink)" }}>
        {mode === "keluar" && (
          <>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", color: "var(--red-600)" }}>SERAH TERIMA SHIFT</div>
            <h2 style={{ margin: "6px 0 4px", fontSize: "21px", fontWeight: 800 }}>{b.prev.shift} Anda telah berakhir</h2>
            <p style={{ margin: "0 0 14px", fontSize: "13px", color: "var(--ink-soft)" }}>Tunjukkan QR ini ke petugas pengganti untuk discan.</p>
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>Pengganti belum datang</div>
            <div style={{ fontSize: "36px", fontWeight: 800, color: "var(--red-600)", fontVariantNumeric: "tabular-nums", marginBottom: "12px" }}>{fmtDurasi(b.detikSejakAwal)}</div>
            {qr ? (
              <QrLokal data={qr} style={{ padding: "10px", borderRadius: "16px", marginBottom: "16px" }} />
            ) : <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>Menyiapkan QR...</div>}
            <div style={{ textAlign: "left", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", marginBottom: "6px" }}>Pengganti belum datang? Extend jaga:</div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              {[15, 30, 60].map((m) => (
                <button key={m} type="button" className="sa-btn is-soft" style={{ flex: 1 }} onClick={() => setMenitExtend(String(m))} aria-pressed={menitExtend === String(m)}>{m} mnt</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input type="number" min={5} max={240} className="sa-field" style={{ flex: 1, cursor: "text" }} placeholder="Menit lain" value={menitExtend} onChange={(e) => setMenitExtend(e.target.value)} aria-label="Menit extend" />
              <button type="button" className="sa-btn is-primary" onClick={extend} disabled={sibuk || !menitExtend}>Extend</button>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: "11.5px", color: "var(--muted)" }}>Selama extend menu terbuka & hitung mundur berjalan. Habis waktu, layar terkunci lagi.</p>
          </>
        )}

        {mode === "pra" && (
          <>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", color: "var(--info)" }}>PERSIAPAN JAGA</div>
            <h2 style={{ margin: "6px 0 4px", fontSize: "21px", fontWeight: 800 }}>{b.next.shift} dimulai dalam</h2>
            <div style={{ fontSize: "44px", fontWeight: 800, color: "var(--info)", fontVariantNumeric: "tabular-nums", margin: "6px 0 10px" }}>{fmtDurasi(b.detikMenujuNext)}</div>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-soft)" }}>Saat waktunya tiba, tombol scan QR serah terima akan muncul. Temui petugas yang sedang jaga.</p>
          </>
        )}

        {mode === "masuk" && !modeDarurat && (
          <>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", color: "var(--ok)" }}>WAKTUNYA JAGA</div>
            <h2 style={{ margin: "6px 0 4px", fontSize: "21px", fontWeight: 800 }}>{b.cur.shift} sudah dimulai</h2>
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>Berjalan sejak jam ganti</div>
            <div style={{ fontSize: "36px", fontWeight: 800, color: b.detikSejakAwal >= (AMBANG_TELAT_SERAH_TERIMA_MENIT + 1) * 60 ? "var(--red-600)" : "var(--ok)", fontVariantNumeric: "tabular-nums", marginBottom: "12px" }}>{fmtDurasi(b.detikSejakAwal)}</div>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--ink-soft)" }}>Scan QR dari petugas sebelumnya untuk membuka menu. Lewat 10 menit tercatat terlambat.</p>
            <button type="button" className="sa-btn is-primary" style={{ width: "100%", height: "50px", fontSize: "15px" }} onClick={() => router.push("/dashboard/security/tukar-shift")}>Scan QR Serah Terima</button>
            <button type="button" className="sa-btn is-soft" style={{ width: "100%", marginTop: "10px" }} onClick={() => setModeDarurat(true)}>Petugas sebelumnya tidak ada?</button>
          </>
        )}

        {mode === "masuk" && modeDarurat && (
          <>
            <h2 style={{ margin: "0 0 6px", fontSize: "19px", fontWeight: 800 }}>Mulai jaga tanpa serah terima</h2>
            <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--ink-soft)" }}>Hanya bila petugas sebelumnya benar-benar tidak ada. Tercatat sebagai tanpa serah terima & Admin GA diberi tahu.</p>
            <textarea className="sa-field" style={{ width: "100%", height: "90px", padding: "10px", cursor: "text", resize: "vertical" }} placeholder="Alasan, mis. petugas Shift 2 tidak masuk / sudah pulang" value={alasan} onChange={(e) => setAlasan(e.target.value)} />
            <button type="button" className="sa-btn is-primary" style={{ width: "100%", marginTop: "10px" }} onClick={mulaiDarurat} disabled={sibuk}>{sibuk ? "Menyimpan..." : "Mulai jaga"}</button>
            <button type="button" className="sa-btn is-soft" style={{ width: "100%", marginTop: "8px" }} onClick={() => setModeDarurat(false)}>Kembali</button>
          </>
        )}

        <button type="button" onClick={keluarApp} style={{ marginTop: "18px", background: "none", border: "none", color: "var(--muted)", fontSize: "12px", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>Keluar dari akun</button>
      </div>
    </div>
  );
}
