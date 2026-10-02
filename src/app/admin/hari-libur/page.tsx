"use client";

/**
 * Hari Libur (§71) -- tanggal merah / cuti bersama. Disimpan di settings/validasi_karyawan:
 *   hari_libur: string[]  ("YYYY-MM-DD", dibaca scripts/validasi-karyawan.mjs)
 *   keterangan_libur: Record<tanggal, keterangan>
 * Pada tanggal libur, cek "karyawan belum tercatat" (09:00 & 13:00) TIDAK dijalankan -- dulu Security
 * akan kebanjiran kartu untuk semua karyawan Master Data di tanggal merah. Sabtu-Minggu sudah otomatis.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";

const REF = () => doc(db, "settings", "validasi_karyawan");
const hariIniWITA = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
const formatTgl = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const akhirPekan = (iso: string) => [0, 6].includes(new Date(`${iso}T00:00:00`).getDay());

// Hanya libur nasional yang TANGGALNYA TETAP. Libur keagamaan (Idul Fitri, Idul Adha, Imlek, Nyepi,
// Waisak, Isra Mikraj, Maulid, Tahun Baru Islam, Kenaikan, Wafat Isa Almasih) & cuti bersama berubah
// tiap tahun -> diisi manual sesuai SKB 3 Menteri.
const LIBUR_TETAP: [string, string][] = [
  ["01-01", "Tahun Baru Masehi"],
  ["05-01", "Hari Buruh Internasional"],
  ["06-01", "Hari Lahir Pancasila"],
  ["08-17", "Hari Kemerdekaan RI"],
  ["12-25", "Hari Raya Natal"],
];

function rentangTanggal(dari: string, sampai: string): string[] {
  const hasil: string[] = [];
  const d = new Date(`${dari}T00:00:00Z`);
  const akhir = new Date(`${(sampai || dari)}T00:00:00Z`);
  for (let i = 0; d <= akhir && i < 31; i++) {
    hasil.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return hasil;
}

export default function HariLiburPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    depts: ["Admin GA"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });

  const [libur, setLibur] = useState<string[]>([]);
  const [keterangan, setKeterangan] = useState<Record<string, string>>({});
  const [dimuat, setDimuat] = useState(false);
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [ket, setKet] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [tampilLewat, setTampilLewat] = useState(false);
  const hariIni = hariIniWITA();
  const tahunIni = Number(hariIni.slice(0, 4));

  useEffect(() => {
    if (!isReady) return;
    const unsub = onSnapshot(REF(), (snap) => {
      const d = snap.data() || {};
      setLibur(((d.hari_libur as string[]) || []).slice().sort());
      setKeterangan((d.keterangan_libur as Record<string, string>) || {});
      setDimuat(true);
    }, (err) => { console.error(err); setDimuat(true); });
    return () => unsub();
  }, [isReady]);

  const simpan = async (daftarBaru: string[], ketBaru: Record<string, string>, pesan: string) => {
    setMenyimpan(true);
    try {
      const unik = Array.from(new Set(daftarBaru)).sort();
      const ketBersih = Object.fromEntries(Object.entries(ketBaru).filter(([tg]) => unik.includes(tg)));
      await setDoc(REF(), { hari_libur: unik, keterangan_libur: ketBersih }, { merge: true });
      showToast(pesan, "success");
      return true;
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan hari libur.", "error");
      return false;
    } finally {
      setMenyimpan(false);
    }
  };

  const tambah = async () => {
    if (!dari) return showToast("Pilih tanggal libur dulu.", "warning");
    if (sampai && sampai < dari) return showToast("Tanggal akhir tidak boleh sebelum tanggal awal.", "warning");
    if (!ket.trim()) return showToast("Isi keterangan, mis. \"Idul Fitri\" atau \"Cuti Bersama\".", "warning");
    const tanggal = rentangTanggal(dari, sampai);
    const ketBaru = { ...keterangan };
    tanggal.forEach((tg) => { ketBaru[tg] = ket.trim(); });
    const ok = await simpan([...libur, ...tanggal], ketBaru, `${tanggal.length} tanggal libur ditambahkan.`);
    if (ok) { setDari(""); setSampai(""); setKet(""); }
  };

  const tambahLiburTetap = async (tahun: number) => {
    const ketBaru = { ...keterangan };
    const tanggal = LIBUR_TETAP.map(([md, nama]) => { const tg = `${tahun}-${md}`; ketBaru[tg] = ketBaru[tg] || nama; return tg; });
    await simpan([...libur, ...tanggal], ketBaru, `Libur nasional bertanggal tetap ${tahun} ditambahkan.`);
  };

  const hapus = async (tg: string) => {
    const ok = await confirm({
      title: "Hapus Hari Libur",
      message: `Hapus ${formatTgl(tg)} (${keterangan[tg] || "tanpa keterangan"}) dari daftar libur? Cek karyawan belum tercatat akan berjalan lagi di tanggal itu.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "danger",
    });
    if (!ok) return;
    await simpan(libur.filter((x) => x !== tg), keterangan, "Hari libur dihapus.");
  };

  if (!isReady) return null;

  const mendatang = libur.filter((tg) => tg >= hariIni);
  const lewat = libur.filter((tg) => tg < hariIni).reverse();
  const tetapAda = (tahun: number) => LIBUR_TETAP.every(([md]) => libur.includes(`${tahun}-${md}`));

  const Baris = ({ tg }: { tg: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "14px", background: tg === hariIni ? "var(--red-50)" : "var(--bg)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--ink)" }}>{keterangan[tg] || "Hari libur"}{tg === hariIni && <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--red-600)" }}>HARI INI</span>}</div>
        <div style={{ fontSize: "12px", color: "var(--muted)" }}>{formatTgl(tg)}{akhirPekan(tg) ? " · akhir pekan (sudah otomatis libur)" : ""}</div>
      </div>
      <button type="button" className="sa-btn is-soft" style={{ height: "34px", fontSize: "12px" }} onClick={() => hapus(tg)} disabled={menyimpan}>Hapus</button>
    </div>
  );

  return (
    <AdminShell title="Hari Libur" subtitle="Tanggal merah & cuti bersama — cek karyawan belum tercatat tidak dijalankan" userName={session?.nama || "Admin"}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px", alignItems: "start" }}>
        <Tile>
          <h2 style={{ margin: "0 0 12px", fontSize: "16px", fontWeight: 800, color: "var(--ink)" }}>Tambah hari libur</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>
                Tanggal *
                <input type="date" className="sa-field" style={{ cursor: "text" }} value={dari} onChange={(e) => setDari(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>
                Sampai (opsional)
                <input type="date" className="sa-field" style={{ cursor: "text" }} value={sampai} min={dari || undefined} onChange={(e) => setSampai(e.target.value)} />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)" }}>
              Keterangan *
              <input className="sa-field" style={{ cursor: "text" }} value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Mis. Idul Fitri 1448 H / Cuti Bersama" maxLength={60} />
            </label>
            <button type="button" className="sa-btn is-primary" onClick={tambah} disabled={menyimpan}>{menyimpan ? "Menyimpan..." : "Tambah ke daftar libur"}</button>
          </div>

          <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
            <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--ink)", marginBottom: "6px" }}>Libur nasional bertanggal tetap</div>
            <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
              Tahun Baru, Hari Buruh, Hari Lahir Pancasila, 17 Agustus, Natal. Libur keagamaan lain & cuti bersama berubah tiap tahun — tambahkan manual sesuai SKB 3 Menteri.
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[tahunIni, tahunIni + 1].map((th) => (
                <button key={th} type="button" className="sa-btn is-soft" onClick={() => tambahLiburTetap(th)} disabled={menyimpan || tetapAda(th)}>
                  {tetapAda(th) ? `${th} sudah ditambahkan` : `+ Tambah untuk ${th}`}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "18px", padding: "12px 14px", borderRadius: "14px", background: "var(--info-50)", color: "var(--info)", fontSize: "12px", lineHeight: 1.6 }}>
            <b>Di tanggal libur:</b> cek &quot;karyawan belum tercatat&quot; (09:00 &amp; 13:00) tidak dijalankan. Validasi lembur (18:00) &amp; pemantauan jam kerja QHSE <b>tetap berjalan</b> untuk karyawan yang datang. Sabtu–Minggu sudah otomatis dianggap libur.
          </div>
        </Tile>

        <Tile>
          <h2 style={{ margin: "0 0 12px", fontSize: "16px", fontWeight: 800, color: "var(--ink)" }}>Libur mendatang <span style={{ fontSize: "12px", color: "var(--muted)" }}>{mendatang.length}</span></h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {!dimuat ? <div style={{ fontSize: "13px", color: "var(--muted)" }}>Memuat...</div>
              : mendatang.length === 0 ? <div style={{ padding: "14px", borderRadius: "14px", border: "1px dashed var(--line)", fontSize: "13px", color: "var(--muted)", textAlign: "center" }}>Belum ada hari libur yang dijadwalkan.</div>
              : mendatang.map((tg) => <Baris key={tg} tg={tg} />)}
          </div>
          {lewat.length > 0 && (
            <div style={{ marginTop: "14px" }}>
              <button type="button" className="sa-btn is-soft" style={{ width: "100%" }} onClick={() => setTampilLewat((v) => !v)}>
                {tampilLewat ? "Sembunyikan yang sudah lewat" : `Lihat ${lewat.length} libur yang sudah lewat`}
              </button>
              {tampilLewat && <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px", opacity: 0.75 }}>{lewat.map((tg) => <Baris key={tg} tg={tg} />)}</div>}
            </div>
          )}
        </Tile>
      </div>
    </AdminShell>
  );
}
