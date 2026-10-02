"use client";

/**
 * Validasi Karyawan (§59) -- Security menjawab kartu yang dibuat cron scripts/validasi-karyawan.mjs:
 *   - Lembur (lewat 18:00): Lanjut lembur (foto + area) / Akan pulang.
 *   - Belum tercatat masuk (09:00 & 13:00 hari kerja): Lupa diinput (check-in susulan, jam diatur) /
 *     Tidak masuk (alasan + foto wajib, datangi mejanya).
 * Logika simpan ada di src/lib/validasiKaryawan.ts.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { useToast } from "../ui/ToastProvider";
import { useConfirm } from "../ui/ConfirmProvider";
import Modal from "../ui/Modal";
import AdminShell from "../admin/AdminShell";
import { handleFotoUpload } from "../../lib/uploadFoto";
import {
  ALASAN_TIDAK_MASUK, catatLanjutLembur, checkInSusulan, jamWITA, MENIT_TANYA_ULANG_PULANG, normalNama, tanggalWITA,
  type ValidasiKaryawan,
} from "../../lib/validasiKaryawan";

type IconProps = { size?: number };
const IconCamera = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A1.5 1.5 0 0 1 9.5 3.6h5a1.5 1.5 0 0 1 1.3.8L17 6h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" /><circle cx="12" cy="13" r="3.5" /></svg>
);

type Aksi =
  | { jenis: "lanjut"; v: ValidasiKaryawan }
  | { jenis: "susulan"; v: ValidasiKaryawan }
  | { jenis: "tidak_masuk"; v: ValidasiKaryawan };

const jamDari = (ts?: Timestamp | null) => (ts ? jamWITA(ts.toDate()) : "-");

export default function ValidasiKaryawanPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    depts: ["Security"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Security.",
  });
  const petugas = session?.nama || "";

  const [hariIni, setHariIni] = useState(() => tanggalWITA(new Date()));
  useEffect(() => {
    const t = setInterval(() => setHariIni(tanggalWITA(new Date())), 60000);
    return () => clearInterval(t);
  }, []);
  const kemarin = tanggalWITA(new Date(new Date(`${hariIni}T12:00:00+08:00`).getTime() - 86400000));

  const [kartu, setKartu] = useState<ValidasiKaryawan[] | null>(null);
  const [sudahMasuk, setSudahMasuk] = useState<Set<string>>(new Set());
  const [cari, setCari] = useState("");
  const [aksi, setAksi] = useState<Aksi | null>(null);
  const [foto, setFoto] = useState("");
  const [mengunggah, setMengunggah] = useState(false);
  const [area, setArea] = useState("");
  const [jamMasuk, setJamMasuk] = useState("08:00");
  const [plat, setPlat] = useState("");
  const [alasan, setAlasan] = useState<string>(ALASAN_TIDAK_MASUK[0]);
  const [keterangan, setKeterangan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  // Kartu kemarin ikut dimuat: lembur yang melewati tengah malam tanggalnya = tanggal check-in.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "validasi_karyawan"), where("tanggal", "in", [kemarin, hariIni])),
      (snap) => setKartu(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ValidasiKaryawan))),
      (err) => { console.error(err); setKartu([]); }
    );
    return () => unsub();
  }, [hariIni, kemarin]);

  // Check-in karyawan hari ini -- kartu "belum input" langsung hilang begitu karyawan di-check-in di
  // Buku Tamu, tanpa menunggu cron 30 menit berikutnya.
  useEffect(() => {
    const awal = Timestamp.fromDate(new Date(`${hariIni}T00:00:00+08:00`));
    const unsub = onSnapshot(query(collection(db, "security_visitor_logs"), where("waktu_masuk", ">=", awal)), (snap) => {
      setSudahMasuk(new Set(snap.docs.map((d) => d.data()).filter((x) => x.jenis === "Karyawan").map((x) => normalNama(x.nama))));
    });
    return () => unsub();
  }, [hariIni]);

  const bukaAksi = (a: Aksi) => {
    setAksi(a); setFoto(""); setArea(""); setJamMasuk("08:00"); setPlat(""); setAlasan(ALASAN_TIDAK_MASUK[0]); setKeterangan("");
  };

  const pilihFoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    handleFotoUpload(file, "sibm/validasi-karyawan",
      () => setMengunggah(true),
      (url) => setFoto(url),
      (err) => { console.error(err); showToast("Gagal mengunggah foto, coba lagi.", "error"); },
      () => setMengunggah(false));
  };

  const simpan = async () => {
    if (!aksi) return;
    if ((aksi.jenis === "lanjut" || aksi.jenis === "tidak_masuk") && !foto) return showToast("Foto wajib diambil dulu.", "warning");
    if (aksi.jenis === "lanjut" && !area.trim()) return showToast("Isi area / lantai lembur.", "warning");
    if (aksi.jenis === "susulan" && sudahMasuk.has(normalNama(aksi.v.nama))) {
      setAksi(null);
      return showToast(`Data sudah ada: ${aksi.v.nama} sudah tercatat check-in hari ini.`, "warning");
    }
    setMenyimpan(true);
    try {
      if (aksi.jenis === "lanjut") {
        await catatLanjutLembur(aksi.v, { area: area.trim(), fotoUrl: foto, petugas });
        showToast(`Lembur ${aksi.v.nama} dicatat. Jam selesai terisi otomatis saat check-out.`, "success");
      } else if (aksi.jenis === "susulan") {
        await checkInSusulan(aksi.v, { jamMasuk, platKendaraan: plat.trim(), petugas });
        showToast(`${aksi.v.nama} dicatat masuk pukul ${jamMasuk} (input susulan).`, "success");
      } else {
        await updateDoc(doc(db, "validasi_karyawan", aksi.v.id), {
          status: "tidak_masuk", alasan, keterangan: keterangan.trim(), foto_url: foto,
          divalidasi_oleh: petugas, waktu_validasi: serverTimestamp(),
        });
        showToast(`${aksi.v.nama} ditandai tidak masuk (${alasan}).`, "success");
      }
      setAksi(null);
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan validasi. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const akanPulang = async (v: ValidasiKaryawan) => {
    const ok = await confirm({
      title: "Akan Pulang",
      message: `${v.nama} akan segera pulang? Tidak perlu aksi lain -- tinggal check-out di Buku Tamu saat keluar. Kalau ${MENIT_TANYA_ULANG_PULANG} menit lagi belum check-out, Anda akan ditanya ulang.`,
      confirmText: "Ya, akan pulang",
    });
    if (!ok) return;
    try {
      await updateDoc(doc(db, "validasi_karyawan", v.id), { status: "akan_pulang", divalidasi_oleh: petugas, waktu_validasi: serverTimestamp() });
      showToast(`${v.nama}: menunggu check-out.`, "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan.", "error");
    }
  };

  if (!isReady) return null;

  const semua = kartu || [];
  const cocok = (v: ValidasiKaryawan) => !cari.trim() || normalNama(v.nama).includes(normalNama(cari)) || normalNama(v.departemen || "").includes(normalNama(cari));
  const lemburMenunggu = semua.filter((v) => v.jenis === "lembur" && v.status === "menunggu");
  const lemburBerjalan = semua.filter((v) => v.jenis === "lembur" && (v.status === "lanjut" || v.status === "akan_pulang"));
  const belumInput = semua
    .filter((v) => v.jenis === "belum_input" && v.tanggal === hariIni && v.status === "menunggu" && !sudahMasuk.has(normalNama(v.nama)))
    .sort((a, b) => a.nama.localeCompare(b.nama));
  const belumInputTampil = belumInput.filter(cocok);
  const sudahDijawab = semua.filter((v) => v.tanggal === hariIni && (v.status === "diinput_susulan" || v.status === "tidak_masuk" || v.status === "selesai"));

  return (
    <AdminShell title="Validasi Karyawan" subtitle="Lembur lewat 18:00 & karyawan yang belum tercatat masuk" userName={petugas || "Staf"} backHref="/dashboard/security" backLabel="Kembali" onBack={() => router.push("/dashboard/security")}>
      <style dangerouslySetInnerHTML={{ __html: `
        .vk-wrap { display: flex; flex-direction: column; gap: 18px; }
        .vk-seksi { background: var(--tile); border-radius: 24px; padding: 18px; }
        .vk-judul { display: flex; align-items: baseline; gap: 8px; margin: 0 0 12px; font-size: 15px; font-weight: 800; color: var(--ink); }
        .vk-judul span { font-size: 12px; font-weight: 700; color: var(--muted); }
        .vk-ket { font-size: 12px; color: var(--muted); margin: -6px 0 12px; line-height: 1.5; }
        .vk-kartu { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-radius: 16px; background: var(--bg); margin-bottom: 8px; }
        .vk-info { flex: 1; min-width: 160px; }
        .vk-nama { font-size: 14px; font-weight: 800; color: var(--ink); }
        .vk-sub { font-size: 12px; color: var(--muted); margin-top: 2px; overflow-wrap: anywhere; }
        .vk-aksi { display: flex; gap: 8px; flex-wrap: wrap; }
        .vk-aksi .sa-btn { height: 38px; font-size: 12.5px; }
        .vk-badge { display: inline-block; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 8px; background: var(--warn-50); color: var(--warn); margin-left: 6px; }
        .vk-kosong { padding: 14px; border-radius: 14px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px; text-align: center; }
        .vk-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .vk-field label { font-size: 12.5px; font-weight: 700; color: var(--ink-soft); }
        .vk-input { width: 100%; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-family: inherit; font-size: 14px; box-sizing: border-box; }
        .vk-foto { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .vk-foto input { display: none; }
        .vk-foto img { width: 84px; height: 84px; border-radius: 12px; object-fit: cover; }
        .vk-thumb { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
      `}} />
      <div className="vk-wrap">
        {kartu === null ? (
          <div className="vk-kosong">Memuat...</div>
        ) : (
          <>
            <section className="vk-seksi">
              <h2 className="vk-judul">Lembur — perlu dicek <span>{lemburMenunggu.length}</span></h2>
              <p className="vk-ket">Datangi karyawan, tanyakan apakah lanjut lembur. Jam lembur dihitung mulai 18:00 sampai check-out di Buku Tamu.</p>
              {lemburMenunggu.length === 0 ? <div className="vk-kosong">Tidak ada yang perlu dicek.</div> : lemburMenunggu.map((v) => (
                <div key={v.id} className="vk-kartu">
                  <div className="vk-info">
                    <div className="vk-nama">{v.nama}{(v.ditanya_ulang || 0) > 0 && <span className="vk-badge">Belum check-out</span>}</div>
                    <div className="vk-sub">{v.departemen} · masuk {jamDari(v.waktu_masuk)}{v.tanggal !== hariIni ? " (kemarin)" : ""}</div>
                  </div>
                  <div className="vk-aksi">
                    <button type="button" className="sa-btn is-primary" onClick={() => bukaAksi({ jenis: "lanjut", v })}><IconCamera /> Lanjut lembur</button>
                    <button type="button" className="sa-btn is-soft" onClick={() => akanPulang(v)}>Akan pulang</button>
                  </div>
                </div>
              ))}
            </section>

            <section className="vk-seksi">
              <h2 className="vk-judul">Belum tercatat masuk <span>{belumInput.length}</span></h2>
              <p className="vk-ket">Karyawan Master Data yang belum check-in hari ini. Lupa diinput → catat susulan dengan jam yang sesuai. Tidak masuk → datangi mejanya dan foto.</p>
              {belumInput.length > 6 && (
                <input className="vk-input" style={{ marginBottom: "10px" }} placeholder="Cari nama / departemen..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari karyawan" />
              )}
              {belumInputTampil.length === 0 ? <div className="vk-kosong">{belumInput.length === 0 ? "Semua karyawan sudah tercatat." : "Tidak ada yang cocok."}</div> : belumInputTampil.map((v) => (
                <div key={v.id} className="vk-kartu">
                  <div className="vk-info">
                    <div className="vk-nama">{v.nama}</div>
                    <div className="vk-sub">{v.departemen}</div>
                  </div>
                  <div className="vk-aksi">
                    <button type="button" className="sa-btn is-dark" onClick={() => bukaAksi({ jenis: "susulan", v })}>Lupa diinput</button>
                    <button type="button" className="sa-btn is-soft" onClick={() => bukaAksi({ jenis: "tidak_masuk", v })}><IconCamera /> Tidak masuk</button>
                  </div>
                </div>
              ))}
            </section>

            {lemburBerjalan.length > 0 && (
              <section className="vk-seksi">
                <h2 className="vk-judul">Menunggu check-out <span>{lemburBerjalan.length}</span></h2>
                {lemburBerjalan.map((v) => (
                  <div key={v.id} className="vk-kartu">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {v.foto_url && <img src={v.foto_url} alt="" className="vk-thumb" />}
                    <div className="vk-info">
                      <div className="vk-nama">{v.nama}</div>
                      <div className="vk-sub">
                        {v.status === "lanjut" ? `Lembur · ${v.area || "-"} · sejak 18:00` : "Akan pulang"} · divalidasi {v.divalidasi_oleh || "-"} {jamDari(v.waktu_validasi)}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {sudahDijawab.length > 0 && (
              <section className="vk-seksi">
                <h2 className="vk-judul">Sudah divalidasi hari ini <span>{sudahDijawab.length}</span></h2>
                {sudahDijawab.map((v) => (
                  <div key={v.id} className="vk-kartu">
                    <div className="vk-info">
                      <div className="vk-nama">{v.nama}</div>
                      <div className="vk-sub">
                        {v.status === "tidak_masuk" ? `Tidak masuk · ${v.alasan}${v.keterangan ? ` — ${v.keterangan}` : ""}`
                          : v.status === "diinput_susulan" ? `Check-in susulan pukul ${jamDari(v.waktu_masuk)}`
                          : `Lembur selesai · check-out tercatat`} · {v.divalidasi_oleh || "otomatis"}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>

      <Modal open={!!aksi} onClose={() => !menyimpan && setAksi(null)}>
        {aksi && (
          <div>
            <h3 style={{ margin: "0 40px 4px 0", fontSize: "18px", fontWeight: 800, color: "var(--ink)" }}>
              {aksi.jenis === "lanjut" ? "Lanjut Lembur" : aksi.jenis === "susulan" ? "Check-in Susulan" : "Tidak Masuk"}
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--ink-soft)" }}>{aksi.v.nama} · {aksi.v.departemen}</p>

            {aksi.jenis === "lanjut" && (
              <div className="vk-field">
                <label htmlFor="vk-area">Area / lantai lembur *</label>
                <input id="vk-area" className="vk-input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Misal: Lantai 3 / Ruang Meeting" />
              </div>
            )}

            {aksi.jenis === "susulan" && (
              <>
                <div className="vk-field">
                  <label htmlFor="vk-jam">Jam masuk sebenarnya *</label>
                  <input id="vk-jam" type="time" className="vk-input" value={jamMasuk} onChange={(e) => setJamMasuk(e.target.value)} />
                </div>
                <div className="vk-field">
                  <label htmlFor="vk-plat">Plat kendaraan (opsional)</label>
                  <input id="vk-plat" className="vk-input" value={plat} onChange={(e) => setPlat(e.target.value)} placeholder="DD 1234 XX" />
                </div>
                <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 14px" }}>Tercatat sebagai input susulan atas nama {petugas}.</p>
              </>
            )}

            {aksi.jenis === "tidak_masuk" && (
              <>
                <div className="vk-field">
                  <label htmlFor="vk-alasan">Alasan *</label>
                  <select id="vk-alasan" className="vk-input" value={alasan} onChange={(e) => setAlasan(e.target.value)}>
                    {ALASAN_TIDAK_MASUK.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="vk-field">
                  <label htmlFor="vk-ket">Keterangan</label>
                  <input id="vk-ket" className="vk-input" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Misal: info dari rekan satu ruangan" />
                </div>
              </>
            )}

            {aksi.jenis !== "susulan" && (
              <div className="vk-field">
                <label>{aksi.jenis === "lanjut" ? "Foto karyawan di lokasi *" : "Foto meja karyawan *"}</label>
                <div className="vk-foto">
                  <label className="sa-btn is-dark" style={{ opacity: mengunggah ? 0.6 : 1, pointerEvents: mengunggah ? "none" : "auto" }}>
                    <input type="file" accept="image/*" capture="environment" onChange={pilihFoto} />
                    <IconCamera /> {mengunggah ? "Mengunggah..." : foto ? "Ambil ulang" : "Ambil foto"}
                  </label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {foto && <img src={foto} alt="Foto validasi" />}
                </div>
              </div>
            )}

            <button type="button" className="sa-btn is-primary" style={{ width: "100%", height: "46px", opacity: menyimpan || mengunggah ? 0.6 : 1 }} disabled={menyimpan || mengunggah} onClick={simpan}>
              {menyimpan ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
