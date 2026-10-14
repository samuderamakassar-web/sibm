"use client";

/**
 * Bank Dokumen Legal (§143, tahap 2 §147) -- multi-perusahaan: PT -> Kategori -> Dokumen (riwayat versi). Lihat src/lib/legalBank.ts.
 * Tahap 2: ringkasan risiko, status proses perpanjangan (Sedang diurus), lama proses / masa pemberitahuan (ambang pengingat
 * per dokumen), checklist syarat, kewajiban berkala, biaya versi -> realisasi_biaya (Anggaran), pemindahan file lama
 * Cloudinary -> Storage privat. Magang GA: tanpa hapus (§145).
 */

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { isMagangSaatIni, useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Modal from "../../../components/ui/Modal";
import AdminShell from "../../../components/admin/AdminShell";
import AdminIcon from "../../../components/admin/AdminIcon";
import Tile from "../../../components/admin/Tile";
import { daerahTulis } from "@/lib/daerah";
import {
  KATEGORI_LEGAL, MAX_FILE_LEGAL_MB, PERUSAHAAN_LEGAL, PT_BELUM, RISIKO_LEGAL, ambangHari, bukaFileLegal, kategoriDari, kodeArsipBerikut, kodePT,
  labelKategori, prosesMacet, tambahBulan, unggahBlobLegal, unggahFileLegal,
  type DokumenLegalT2, type KategoriLegal, type KewajibanLegal, type RisikoLegal, type VersiLegalT2,
} from "@/lib/legalBank";

type Dok = DokumenLegalT2;
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
const fmt = (iso?: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-");
const rupiah = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;
const sisaHari = (iso: string) => Math.ceil((new Date(iso).getTime() - new Date(todayISO()).getTime()) / 86400000);

type Status = { kunci: "AKTIF" | "PERLU" | "KADALUARSA" | "TETAP" | "PROSES"; label: string; bg: string; fg: string; sisa: number | null };
function statusDok(d: Dok): Status {
  if (d.tanpa_masa_berlaku || !d.tanggal_berakhir_aktif) return { kunci: "TETAP", label: "TANPA MASA BERLAKU", bg: "var(--line)", fg: "var(--ink-soft)", sisa: null };
  const sisa = sisaHari(d.tanggal_berakhir_aktif);
  if (d.proses?.status === "Sedang diurus") return { kunci: "PROSES", label: prosesMacet(d, todayISO()) ? "DIURUS · MACET" : "SEDANG DIURUS", bg: prosesMacet(d, todayISO()) ? "var(--red-50)" : "var(--info-50)", fg: prosesMacet(d, todayISO()) ? "var(--red-600)" : "var(--info)", sisa };
  if (sisa < 0) return { kunci: "KADALUARSA", label: "KADALUARSA", bg: "var(--red-50)", fg: "var(--red-600)", sisa };
  if (sisa <= ambangHari(d)) return { kunci: "PERLU", label: "PERLU DIPERPANJANG", bg: "var(--warn-50)", fg: "var(--warn)", sisa };
  return { kunci: "AKTIF", label: "AKTIF", bg: "var(--ok-50)", fg: "var(--ok)", sisa };
}
const WARNA_RISIKO: Record<RisikoLegal, { bg: string; fg: string }> = {
  Kritis: { bg: "var(--red-50)", fg: "var(--red-600)" }, Penting: { bg: "var(--warn-50)", fg: "var(--warn)" }, Biasa: { bg: "var(--line)", fg: "var(--ink-soft)" },
};

const FORM_KOSONG = {
  nama_dokumen: "", pt: [] as string[], ptLain: "", kategori: "IZN" as KategoriLegal, nomor_dokumen: "", tanggal_terbit: "",
  tanpa_masa_berlaku: false, tanggal_mulai: "", tanggal_berakhir: "", penerbit: "", pic: "", lokasi_arsip: "", risiko: "Penting" as RisikoLegal, catatan: "",
  lama_proses_hari: "", masa_pemberitahuan_hari: "", biaya: "",
};

export default function AdminLegalitasPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({ roles: ["Admin"], depts: ["Admin GA"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA." });

  const [daftar, setDaftar] = useState<Dok[]>([]);
  const [ptAktif, setPtAktif] = useState("SEMUA");
  const [kategoriAktif, setKategoriAktif] = useState("SEMUA");
  const [filterStatus, setFilterStatus] = useState("SEMUA");
  const [cari, setCari] = useState("");
  const [bukaRiwayat, setBukaRiwayat] = useState<string | null>(null);

  const [mode, setMode] = useState<"baru" | "versi" | "ubah" | null>(null);
  const [target, setTarget] = useState<Dok | null>(null);
  const [form, setForm] = useState(FORM_KOSONG);
  const [file, setFile] = useState<File | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  // §147 proses perpanjangan & detail syarat/kewajiban
  const [proses, setProses] = useState<Dok | null>(null);
  const [formProses, setFormProses] = useState({ nomor_pengajuan: "", catatan: "", sejak: "" });
  const [detail, setDetail] = useState<Dok | null>(null);
  const [syaratBaru, setSyaratBaru] = useState("");
  const [kwjBaru, setKwjBaru] = useState({ nama: "", interval_bulan: "12", jatuh_tempo: "" });
  const [migrasi, setMigrasi] = useState<{ jalan: boolean; selesai: number; total: number } | null>(null);

  useEffect(() => {
    if (!isReady || !session) return;
    return onSnapshot(query(collection(db, "master_legalitas"), orderBy("tanggal_berakhir_aktif", "asc")), (snap) => {
      setDaftar(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Dok)));
    }, (e) => console.error("[legal]", e));
  }, [isReady, session]);
  // detail modal ikut data terbaru
  const detailLive = detail ? daftar.find((d) => d.id === detail.id) || detail : null;

  const ptDari = (d: Dok) => (d.pt && d.pt.length ? d.pt : [PT_BELUM]);
  const daftarPT = useMemo(() => {
    const lain = Array.from(new Set(daftar.flatMap((d) => d.pt || []))).filter((n) => !PERUSAHAAN_LEGAL.some((p) => p.nama === n)).sort();
    return [...PERUSAHAAN_LEGAL.map((p) => p.nama), ...lain, ...(daftar.some((d) => !d.pt?.length) ? [PT_BELUM] : [])];
  }, [daftar]);

  const cocokCari = (d: Dok) => {
    const q = cari.trim().toLowerCase();
    return !q || [d.nama_dokumen, d.nomor_dokumen, d.kode_arsip, d.penerbit, d.pic, ...(d.pt || [])].some((x) => (x || "").toLowerCase().includes(q));
  };
  const dalamPT = (d: Dok) => ptAktif === "SEMUA" || ptDari(d).includes(ptAktif);
  const tampil = daftar.filter((d) => dalamPT(d) && (kategoriAktif === "SEMUA" || kategoriDari(d) === kategoriAktif)
    && (filterStatus === "SEMUA" || statusDok(d).kunci === filterStatus) && cocokCari(d));
  const ringkasPT = (nama: string) => {
    const ds = daftar.filter((d) => ptDari(d).includes(nama));
    return { total: ds.length, perlu: ds.filter((d) => statusDok(d).kunci === "PERLU").length, lewat: ds.filter((d) => statusDok(d).kunci === "KADALUARSA").length };
  };

  // §147 ringkasan risiko (mengikuti PT terpilih)
  const lingkup = daftar.filter(dalamPT);
  const tahunIni = todayISO().slice(0, 4);
  const kewajibanDekat = lingkup.flatMap((d) => (d.kewajiban || []).map((k) => ({ d, k, sisa: sisaHari(k.jatuh_tempo) }))).filter((x) => x.sisa <= 30).sort((a, b) => a.sisa - b.sisa);
  const risiko = {
    kritis: lingkup.filter((d) => d.risiko === "Kritis" && ["PERLU", "KADALUARSA"].includes(statusDok(d).kunci)).length,
    proses: lingkup.filter((d) => statusDok(d).kunci === "PROSES").length,
    macet: lingkup.filter((d) => d.proses && prosesMacet(d, todayISO())).length,
    kewajiban: kewajibanDekat.length,
    biaya: lingkup.reduce((s, d) => s + (d.riwayat || []).reduce((t, v) => t + ((v as VersiLegalT2).diupload_pada?.startsWith(tahunIni) ? Number((v as VersiLegalT2).biaya) || 0 : 0), 0), 0),
  };
  const fileLama = daftar.reduce((s, d) => s + (d.riwayat || []).filter((v) => v.file_url && !v.file_path).length, 0);

  const isiForm = (d: Dok) => ({
    ...FORM_KOSONG, nama_dokumen: d.nama_dokumen, pt: d.pt || [], kategori: kategoriDari(d), nomor_dokumen: d.nomor_dokumen || "", tanggal_terbit: d.tanggal_terbit || "",
    tanpa_masa_berlaku: !!d.tanpa_masa_berlaku, penerbit: d.penerbit || "", pic: d.pic || "", lokasi_arsip: d.lokasi_arsip || "", risiko: d.risiko || "Penting",
    lama_proses_hari: d.lama_proses_hari ? String(d.lama_proses_hari) : "", masa_pemberitahuan_hari: d.masa_pemberitahuan_hari ? String(d.masa_pemberitahuan_hari) : "",
  });
  const buka = (m: "baru" | "versi" | "ubah", d: Dok | null) => {
    setMode(m); setTarget(d); setFile(null);
    setForm(d ? isiForm(d) : { ...FORM_KOSONG, pt: ptAktif !== "SEMUA" && ptAktif !== PT_BELUM ? [ptAktif] : [], kategori: kategoriAktif !== "SEMUA" ? (kategoriAktif as KategoriLegal) : "IZN" });
  };
  const togglePT = (nama: string) => setForm((f) => ({ ...f, pt: f.pt.includes(nama) ? f.pt.filter((x) => x !== nama) : [...f.pt, nama] }));

  const simpan = async (e: React.FormEvent) => {
    e.preventDefault();
    const pt = [...form.pt, ...(form.ptLain.trim() ? [form.ptLain.trim().replace(/^(?!PT\s)/i, "PT ")] : [])].filter((v, i, a) => a.indexOf(v) === i);
    const butuhVersi = mode !== "ubah";
    if (mode !== "versi" && (!form.nama_dokumen.trim() || !pt.length)) return showToast("Isi nama dokumen & pilih minimal 1 perusahaan.", "warning");
    if (butuhVersi && !form.tanpa_masa_berlaku && (!form.tanggal_mulai || !form.tanggal_berakhir)) return showToast("Isi masa berlaku, atau centang Tanpa masa berlaku.", "warning");
    if (butuhVersi && !file) return showToast("Pilih file scan dokumen.", "warning");
    const biaya = Number(form.biaya.replace(/\D/g, "")) || 0;
    setMenyimpan(true);
    try {
      const kodeArsip = target?.kode_arsip || kodeArsipBerikut(pt[0] || PT_BELUM, form.kategori, (form.tanggal_terbit || form.tanggal_mulai || todayISO()).slice(0, 4), daftar);
      const meta = {
        nama_dokumen: form.nama_dokumen.trim(), pt, kategori: form.kategori, kode_arsip: kodeArsip, nomor_dokumen: form.nomor_dokumen.trim(), tanggal_terbit: form.tanggal_terbit,
        tanpa_masa_berlaku: form.tanpa_masa_berlaku, penerbit: form.penerbit.trim(), pic: form.pic.trim(), lokasi_arsip: form.lokasi_arsip.trim(), risiko: form.risiko,
        jenis: labelKategori(form.kategori),
        lama_proses_hari: Number(form.lama_proses_hari) || 0, masa_pemberitahuan_hari: form.kategori === "PRJ" ? Number(form.masa_pemberitahuan_hari) || 0 : 0,
      };
      if (mode === "ubah" && target) {
        await updateDoc(doc(db, "master_legalitas", target.id), { ...meta, ...(form.tanpa_masa_berlaku ? { tanggal_berakhir_aktif: "" } : {}) });
        showToast("Data dokumen diperbarui.", "success");
      } else {
        const unggah = await unggahFileLegal(file as File, kodeArsip);
        const versi: VersiLegalT2 = {
          tanggal_mulai: form.tanpa_masa_berlaku ? "" : form.tanggal_mulai, tanggal_berakhir: form.tanpa_masa_berlaku ? "" : form.tanggal_berakhir,
          catatan: form.catatan.trim(), diupload_pada: todayISO(), file_path: unggah.path, nama_file: unggah.nama, ...(biaya ? { biaya } : {}),
        };
        const aktif = { tanggal_mulai_aktif: versi.tanggal_mulai, tanggal_berakhir_aktif: versi.tanggal_berakhir, catatan_aktif: versi.catatan, file_path_aktif: versi.file_path, file_url_aktif: "" };
        let idDok = target?.id || "";
        if (mode === "baru") {
          const r = await addDoc(collection(db, "master_legalitas"), { daerah: daerahTulis(), ...meta, riwayat: [versi], ...aktif });
          idDok = r.id;
        } else if (target) {
          // versi baru = perpanjangan selesai: proses ditutup & checklist syarat direset untuk siklus berikutnya
          await updateDoc(doc(db, "master_legalitas", target.id), {
            ...meta, riwayat: [...(target.riwayat || []), versi], ...aktif, proses: null,
            ...(target.syarat?.length ? { syarat: target.syarat.map((s) => ({ ...s, selesai: false })) } : {}),
          });
        }
        // §147 biaya -> Anggaran (realisasi manual, dialokasikan ke baris RAB di menu Anggaran)
        if (biaya) {
          await addDoc(collection(db, "realisasi_biaya"), {
            daerah: daerahTulis(), tanggal: todayISO(), item_id: "", kategori: "Legal", jumlah: biaya,
            uraian: `Legal · ${kodeArsip} · ${meta.nama_dokumen || target?.nama_dokumen} (${pt.join(", ")})`, sumber_legal: idDok,
            dicatat_oleh: session?.nama || "-", dibuat_pada: serverTimestamp(),
          }).catch((err) => { console.error(err); showToast("Dokumen tersimpan, tetapi biaya gagal dicatat ke Anggaran.", "warning"); });
        }
        showToast(mode === "baru" ? `Dokumen tersimpan · kode arsip ${kodeArsip}` : "Versi baru tersimpan, versi lama masuk riwayat.", "success");
      }
      setMode(null);
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
    } finally { setMenyimpan(false); }
  };

  const hapus = async (d: Dok) => {
    if (!(await confirm({ title: "Hapus Dokumen", message: `Hapus "${d.nama_dokumen}" (${d.kode_arsip || "tanpa kode"}) beserta seluruh riwayat versinya? Tidak bisa dibatalkan.`, confirmText: "Ya, Hapus", variant: "danger" }))) return;
    try { await deleteDoc(doc(db, "master_legalitas", d.id)); showToast("Dokumen dihapus.", "success"); }
    catch (e) { console.error(e); showToast("Gagal menghapus.", "error"); }
  };
  const lihat = (v: { file_path?: string; file_url?: string }) => bukaFileLegal(v).catch((e) => { console.error(e); showToast("File tidak bisa dibuka (tidak berhak atau file hilang).", "error"); });

  // §147 proses perpanjangan
  const mulaiProses = async () => {
    if (!proses) return;
    try {
      await updateDoc(doc(db, "master_legalitas", proses.id), { proses: { status: "Sedang diurus", sejak: formProses.sejak || todayISO(), nomor_pengajuan: formProses.nomor_pengajuan.trim(), catatan: formProses.catatan.trim(), oleh: session?.nama || "-" } });
      showToast("Ditandai sedang diurus — pengingat berhenti selama proses wajar.", "success"); setProses(null);
    } catch (e) { console.error(e); showToast("Gagal menyimpan.", "error"); }
  };
  const batalProses = async (d: Dok) => {
    if (!(await confirm({ title: "Batalkan proses?", message: `Tandai "${d.nama_dokumen}" tidak lagi sedang diurus? Pengingat akan aktif kembali.`, confirmText: "Ya" }))) return;
    await updateDoc(doc(db, "master_legalitas", d.id), { proses: null }).catch(() => showToast("Gagal.", "error"));
  };
  // §147 syarat & kewajiban
  const ubahDetail = (d: Dok, patch: Partial<Dok>) => updateDoc(doc(db, "master_legalitas", d.id), patch).catch((e) => { console.error(e); showToast("Gagal menyimpan.", "error"); });
  const tambahKewajiban = (d: Dok) => {
    if (!kwjBaru.nama.trim() || !kwjBaru.jatuh_tempo) return showToast("Isi nama kewajiban & jatuh tempo berikutnya.", "warning");
    const k: KewajibanLegal = { id: `k${Date.now().toString(36)}`, nama: kwjBaru.nama.trim(), interval_bulan: Math.max(1, Number(kwjBaru.interval_bulan) || 12), jatuh_tempo: kwjBaru.jatuh_tempo };
    ubahDetail(d, { kewajiban: [...(d.kewajiban || []), k] }); setKwjBaru({ nama: "", interval_bulan: "12", jatuh_tempo: "" });
  };
  const selesaiKewajiban = (d: Dok, k: KewajibanLegal) =>
    ubahDetail(d, { kewajiban: (d.kewajiban || []).map((x) => (x.id === k.id ? { ...x, terakhir: todayISO(), jatuh_tempo: tambahBulan(x.jatuh_tempo, x.interval_bulan) } : x)) });

  // §147 pindahkan file lama Cloudinary -> Storage privat
  const pindahkanFileLama = async () => {
    if (!(await confirm({ title: "Pindahkan file lama", message: `${fileLama} file lama akan diunduh dari Cloudinary lalu disimpan ke penyimpanan privat. Pastikan pengaturan Cloudinary "Allow delivery of PDF and ZIP files" sedang AKTIF. Jangan tutup halaman sampai selesai.`, confirmText: "Mulai" }))) return;
    setMigrasi({ jalan: true, selesai: 0, total: fileLama });
    let ok = 0, gagal = 0;
    for (const d of daftar) {
      const riwayat = [...(d.riwayat || [])] as VersiLegalT2[];
      let berubah = false;
      for (let i = 0; i < riwayat.length; i++) {
        const v = riwayat[i];
        if (!v.file_url || v.file_path) continue;
        try {
          const res = await fetch(v.file_url);
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          const nama = v.file_url.split("/").pop() || `dokumen_${i}.pdf`;
          riwayat[i] = { ...v, file_path: await unggahBlobLegal(blob, nama, d.kode_arsip || d.id), nama_file: nama };
          berubah = true; ok++;
        } catch (e) { console.error("[migrasi]", d.nama_dokumen, e); gagal++; }
        setMigrasi({ jalan: true, selesai: ok + gagal, total: fileLama });
      }
      if (berubah) {
        const terakhir = riwayat[riwayat.length - 1];
        await updateDoc(doc(db, "master_legalitas", d.id), { riwayat, ...(terakhir?.file_path ? { file_path_aktif: terakhir.file_path } : {}) }).catch((e) => console.error(e));
      }
    }
    setMigrasi(null);
    showToast(gagal ? `${ok} file dipindahkan, ${gagal} gagal (cek pengaturan Cloudinary, lalu ulangi).` : `${ok} file dipindahkan. Sekarang matikan lagi pengaturan PDF di Cloudinary.`, gagal ? "warning" : "success");
  };

  if (!isReady || !session) return null;
  const magang = isMagangSaatIni();
  const kategoriTampil = KATEGORI_LEGAL.filter((k) => tampil.some((d) => kategoriDari(d) === k.kode));
  const katInfo = KATEGORI_LEGAL.find((k) => k.kode === form.kategori);
  const inp = { width: "100%", height: "38px", padding: "0 10px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: "13px", fontFamily: "inherit", boxSizing: "border-box" as const };

  return (
    <AdminShell title="Bank Dokumen Legal" subtitle="Legalitas, perizinan, perjanjian, berita acara & dokumen resmi tiap perusahaan — riwayat versi tersimpan"
      userName={session.nama || "Admin"}
      actions={<div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {fileLama > 0 && <button type="button" className="sa-btn is-soft" onClick={pindahkanFileLama} disabled={!!migrasi}>{migrasi ? `Memindahkan ${migrasi.selesai}/${migrasi.total}…` : `Pindahkan file lama (${fileLama})`}</button>}
        <button type="button" className="sa-btn is-primary" onClick={() => buka("baru", null)}><AdminIcon name="stamp" size={16} /> Tambah Dokumen</button>
      </div>}>
      <style dangerouslySetInnerHTML={{ __html: `
        .lg-risk { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; margin-bottom: 12px; }
        .lg-risk div { padding: 12px 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
        .lg-risk b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; } .lg-risk span { font-size: 12px; color: var(--muted); font-weight: 600; }
        .lg-pt { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; margin-bottom: 14px; }
        .lg-ptk { text-align: left; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--line); background: var(--surface); cursor: pointer; font-family: inherit; color: var(--ink); display: flex; flex-direction: column; gap: 2px; }
        .lg-ptk.on { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
        .lg-ptk b { font-size: 13px; } .lg-ptk small { font-size: 11.5px; color: var(--muted); }
        .lg-kode { font-size: 10.5px; font-weight: 800; letter-spacing: .04em; padding: 2px 7px; border-radius: 6px; background: var(--bg); color: var(--ink-soft); font-variant-numeric: tabular-nums; }
        .lg-chip { font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
        .lg-kartu { background: var(--bg); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
        .lg-aksi { display: flex; gap: 6px; flex-wrap: wrap; }
        .lg-btn { height: 32px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .lg-btn:hover { background: var(--hover); color: var(--ink); }
        .lg-btn.hapus { color: var(--red-600); }
        .lg-form { display: flex; flex-direction: column; gap: 12px; }
        .lg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .lg-f label { display: block; font-size: 12px; font-weight: 700; color: var(--ink-soft); margin-bottom: 5px; }
        .lg-f input, .lg-f select { width: 100%; height: 42px; padding: 0 12px; border-radius: 11px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 13.5px; font-family: inherit; box-sizing: border-box; }
        .lg-pilih { display: flex; flex-wrap: wrap; gap: 6px; }
        .lg-pilih button { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--ink-soft); font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .lg-pilih button.on { background: var(--ink); color: var(--surface); border-color: transparent; }
        .lg-baris { display: flex; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px dashed var(--line); font-size: 13px; }
        @media (max-width: 640px) { .lg-grid { grid-template-columns: 1fr; } }
      ` }} />

      {/* §147 Ringkasan risiko (ikut PT terpilih) */}
      <div className="lg-risk">
        <div><b style={{ color: risiko.kritis ? "var(--red-600)" : "var(--ink)" }}>{risiko.kritis}</b><span>Dokumen kritis perlu diperpanjang / kadaluarsa</span></div>
        <div><b style={{ color: "var(--info)" }}>{risiko.proses}</b><span>Sedang diurus{risiko.macet ? ` · ${risiko.macet} macet` : ""}</span></div>
        <div><b style={{ color: risiko.kewajiban ? "var(--warn)" : "var(--ink)" }}>{risiko.kewajiban}</b><span>Kewajiban berkala ≤ 30 hari / lewat</span></div>
        <div><b style={{ fontSize: "18px" }}>{rupiah(risiko.biaya)}</b><span>Biaya legal {tahunIni}</span></div>
      </div>
      {kewajibanDekat.length > 0 && (
        <Tile style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, marginBottom: "6px" }}>Kewajiban berkala terdekat</div>
          {kewajibanDekat.slice(0, 6).map(({ d, k, sisa }) => (
            <div key={d.id + k.id} className="lg-baris">
              <span className="lg-chip" style={{ background: sisa < 0 ? "var(--red-50)" : "var(--warn-50)", color: sisa < 0 ? "var(--red-600)" : "var(--warn)" }}>{sisa < 0 ? `lewat ${-sisa} hari` : `${sisa} hari lagi`}</span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{k.nama}</b> · {d.nama_dokumen} <span style={{ color: "var(--muted)" }}>({d.kode_arsip || "-"})</span></span>
              <button type="button" className="lg-btn" onClick={() => setDetail(d)}>Buka</button>
            </div>
          ))}
        </Tile>
      )}

      {/* Tingkat 1: Perusahaan */}
      <div className="lg-pt" role="tablist" aria-label="Perusahaan">
        <button type="button" role="tab" aria-selected={ptAktif === "SEMUA"} className={`lg-ptk${ptAktif === "SEMUA" ? " on" : ""}`} onClick={() => setPtAktif("SEMUA")}>
          <b>Semua perusahaan</b><small>{daftar.length} dokumen · {daftar.filter((d) => statusDok(d).kunci === "PERLU").length} perlu diperpanjang · {daftar.filter((d) => statusDok(d).kunci === "KADALUARSA").length} kadaluarsa</small>
        </button>
        {daftarPT.map((nama) => {
          const r = ringkasPT(nama);
          return (
            <button key={nama} type="button" role="tab" aria-selected={ptAktif === nama} className={`lg-ptk${ptAktif === nama ? " on" : ""}`} onClick={() => setPtAktif(nama)}>
              <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>{nama !== PT_BELUM && <span className="lg-kode">{kodePT(nama)}</span>}<b>{nama.replace(/^PT /, "")}</b></span>
              <small>{r.total} dokumen{r.perlu ? ` · ${r.perlu} perlu diperpanjang` : ""}{r.lewat ? ` · ${r.lewat} kadaluarsa` : ""}</small>
            </button>
          );
        })}
      </div>

      <Tile>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800 }}>{ptAktif === "SEMUA" ? "Semua perusahaan" : ptAktif} <span style={{ fontSize: "12.5px", color: "var(--muted)", fontWeight: 600 }}>· {tampil.length} dokumen</span></h2>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <select className="sa-field" aria-label="Kategori" value={kategoriAktif} onChange={(e) => setKategoriAktif(e.target.value)}>
              <option value="SEMUA">Semua kategori</option>
              {KATEGORI_LEGAL.map((k) => <option key={k.kode} value={k.kode}>{k.label}</option>)}
            </select>
            <select className="sa-field" aria-label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="SEMUA">Semua status</option><option value="AKTIF">Aktif</option><option value="PERLU">Perlu diperpanjang</option>
              <option value="PROSES">Sedang diurus</option><option value="KADALUARSA">Kadaluarsa</option><option value="TETAP">Tanpa masa berlaku</option>
            </select>
            <label className="sa-search" style={{ width: "240px" }}>
              <AdminIcon name="search" size={15} strokeWidth={2} />
              <input type="search" aria-label="Cari dokumen" placeholder="Nama, nomor, kode arsip, penerbit…" value={cari} onChange={(e) => setCari(e.target.value)} />
            </label>
          </div>
        </div>

        {tampil.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 16px", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "16px" }}>
            {daftar.length ? "Tidak ada dokumen pada filter ini." : 'Belum ada dokumen. Tekan "Tambah Dokumen".'}
          </div>
        ) : kategoriTampil.map((k) => (
          <section key={k.kode} style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", margin: "4px 0 8px" }}>{k.label} · {tampil.filter((d) => kategoriDari(d) === k.kode).length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {tampil.filter((d) => kategoriDari(d) === k.kode).map((d) => {
                const st = statusDok(d);
                const lama = (d.riwayat || []).slice(0, -1).reverse();
                const syaratOk = (d.syarat || []).filter((s) => s.selesai).length;
                const kwjBerikut = (d.kewajiban || []).slice().sort((a, b) => a.jatuh_tempo.localeCompare(b.jatuh_tempo))[0];
                return (
                  <article key={d.id} className="lg-kartu">
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      {d.kode_arsip ? <span className="lg-kode">{d.kode_arsip}</span> : <span className="lg-kode" style={{ color: "var(--warn)" }}>belum ada kode</span>}
                      <b style={{ fontSize: "15px" }}>{d.nama_dokumen}</b>
                      <span className="lg-chip" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                      {d.risiko && <span className="lg-chip" style={{ background: WARNA_RISIKO[d.risiko].bg, color: WARNA_RISIKO[d.risiko].fg }}>{d.risiko}</span>}
                    </div>
                    <div style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
                      {d.nomor_dokumen ? `No. ${d.nomor_dokumen} · ` : ""}{d.penerbit ? `${d.penerbit} · ` : ""}
                      {st.kunci === "TETAP" ? `Terbit ${fmt(d.tanggal_terbit || d.tanggal_mulai_aktif)}` : <>Berlaku {fmt(d.tanggal_mulai_aktif)} → {fmt(d.tanggal_berakhir_aktif)} <b style={{ color: st.fg }}>({(st.sisa ?? 0) < 0 ? `lewat ${Math.abs(st.sisa ?? 0)} hari` : `${st.sisa} hari lagi`})</b></>}
                    </div>
                    {d.proses && <div style={{ fontSize: "12px", color: st.fg, fontWeight: 700 }}>Diurus sejak {fmt(d.proses.sejak)}{d.proses.nomor_pengajuan ? ` · No. pengajuan ${d.proses.nomor_pengajuan}` : ""}{d.proses.oleh ? ` · ${d.proses.oleh}` : ""}{d.proses.catatan ? ` · ${d.proses.catatan}` : ""}</div>}
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {ptDari(d).join(", ")}{d.pic ? ` · PIC ${d.pic}` : ""}{d.lokasi_arsip ? ` · Arsip fisik: ${d.lokasi_arsip}` : ""}
                      {d.syarat?.length ? ` · Syarat ${syaratOk}/${d.syarat.length}` : ""}{kwjBerikut ? ` · ${kwjBerikut.nama} ${fmt(kwjBerikut.jatuh_tempo)}` : ""}
                    </div>
                    <div className="lg-aksi">
                      {(d.file_path_aktif || d.file_url_aktif) && <button type="button" className="lg-btn" onClick={() => lihat({ file_path: d.file_path_aktif, file_url: d.file_url_aktif })}>Lihat file</button>}
                      {st.kunci !== "TETAP" && !d.proses && <button type="button" className="lg-btn" onClick={() => { setProses(d); setFormProses({ nomor_pengajuan: "", catatan: "", sejak: todayISO() }); }}>Mulai urus perpanjangan</button>}
                      {d.proses && <button type="button" className="lg-btn" onClick={() => batalProses(d)}>Batalkan proses</button>}
                      <button type="button" className="lg-btn" onClick={() => buka("versi", d)}>{st.kunci === "TETAP" ? "Unggah versi baru" : d.proses ? "Selesai — unggah izin baru" : "Perbarui / perpanjang"}</button>
                      <button type="button" className="lg-btn" onClick={() => setDetail(d)}>Syarat & kewajiban</button>
                      <button type="button" className="lg-btn" onClick={() => buka("ubah", d)}>Ubah data</button>
                      {lama.length > 0 && <button type="button" className="lg-btn" aria-expanded={bukaRiwayat === d.id} onClick={() => setBukaRiwayat(bukaRiwayat === d.id ? null : d.id)}>Riwayat {lama.length} versi</button>}
                      {!magang && <button type="button" className="lg-btn hapus" onClick={() => hapus(d)}>Hapus</button>}
                    </div>
                    {bukaRiwayat === d.id && (
                      <div style={{ background: "var(--surface)", borderRadius: "12px", padding: "6px 12px" }}>
                        {lama.map((v, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "7px 0", borderBottom: i < lama.length - 1 ? "1px dashed var(--line)" : "none", fontSize: "12.5px", flexWrap: "wrap" }}>
                            <span style={{ color: "var(--ink-soft)" }}>{v.tanggal_berakhir ? `${fmt(v.tanggal_mulai)} → ${fmt(v.tanggal_berakhir)}` : `diunggah ${fmt(v.diupload_pada)}`}{v.catatan ? ` · ${v.catatan}` : ""}{(v as VersiLegalT2).biaya ? ` · ${rupiah(Number((v as VersiLegalT2).biaya))}` : ""}</span>
                            <button type="button" className="lg-btn" style={{ height: "26px" }} onClick={() => lihat(v)}>Lihat file</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </Tile>

      {/* ============ Modal tambah / versi / ubah ============ */}
      <Modal open={!!mode} onClose={() => !menyimpan && setMode(null)} maxWidth="620px">
        {mode && (
          <form onSubmit={simpan} className="lg-form">
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>
              {mode === "baru" ? "Tambah Dokumen" : mode === "versi" ? `Versi baru: ${target?.nama_dokumen}` : `Ubah data: ${target?.nama_dokumen}`}
            </h3>
            {target?.kode_arsip && <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Kode arsip <b style={{ color: "var(--ink)" }}>{target.kode_arsip}</b>{mode === "versi" ? " · versi lama otomatis masuk riwayat, proses perpanjangan ditutup" : ""}</div>}

            {mode !== "versi" && (
              <>
                <div className="lg-f"><label>Perusahaan * (bisa lebih dari satu)</label>
                  <div className="lg-pilih">
                    {PERUSAHAAN_LEGAL.map((p) => <button key={p.kode} type="button" className={form.pt.includes(p.nama) ? "on" : ""} onClick={() => togglePT(p.nama)}>{p.kode} · {p.nama.replace(/^PT /, "")}</button>)}
                    {form.pt.filter((n) => !PERUSAHAAN_LEGAL.some((p) => p.nama === n)).map((n) => <button key={n} type="button" className="on" onClick={() => togglePT(n)}>{n} ×</button>)}
                  </div>
                  <input style={{ marginTop: "6px" }} placeholder="Lainnya — ketik nama PT bila tidak ada di daftar" value={form.ptLain} onChange={(e) => setForm({ ...form, ptLain: e.target.value })} />
                </div>
                <div className="lg-f"><label>Kategori *</label>
                  <div className="lg-pilih">{KATEGORI_LEGAL.map((k) => <button key={k.kode} type="button" className={form.kategori === k.kode ? "on" : ""} onClick={() => setForm({ ...form, kategori: k.kode, tanpa_masa_berlaku: mode === "baru" ? !k.masaBerlaku : form.tanpa_masa_berlaku })}>{k.label}</button>)}</div>
                  {katInfo && <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "4px" }}>Contoh: {katInfo.contoh}</div>}
                </div>
                <div className="lg-grid">
                  <div className="lg-f"><label>Nama dokumen *</label><input value={form.nama_dokumen} onChange={(e) => setForm({ ...form, nama_dokumen: e.target.value })} placeholder="Mis. NIB, SLF Gedung, Sewa Gudang" /></div>
                  <div className="lg-f"><label>Nomor dokumen</label><input value={form.nomor_dokumen} onChange={(e) => setForm({ ...form, nomor_dokumen: e.target.value })} /></div>
                  <div className="lg-f"><label>Penerbit / pihak lawan</label><input value={form.penerbit} onChange={(e) => setForm({ ...form, penerbit: e.target.value })} placeholder="Mis. DPMPTSP Kota Makassar" /></div>
                  <div className="lg-f"><label>Tanggal terbit</label><input type="date" value={form.tanggal_terbit} onChange={(e) => setForm({ ...form, tanggal_terbit: e.target.value })} /></div>
                  <div className="lg-f"><label>PIC internal</label><input value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} /></div>
                  <div className="lg-f"><label>Lokasi arsip fisik</label><input value={form.lokasi_arsip} onChange={(e) => setForm({ ...form, lokasi_arsip: e.target.value })} placeholder="Mis. Lemari GA-2, map MJS" /></div>
                  {/* §147 ambang pengingat per dokumen */}
                  <div className="lg-f"><label>Lama pengurusan (hari)</label><input inputMode="numeric" value={form.lama_proses_hari} onChange={(e) => setForm({ ...form, lama_proses_hari: e.target.value.replace(/\D/g, "") })} placeholder="Mis. 90 untuk SLF" /></div>
                  {form.kategori === "PRJ" && <div className="lg-f"><label>Masa pemberitahuan kontrak (hari)</label><input inputMode="numeric" value={form.masa_pemberitahuan_hari} onChange={(e) => setForm({ ...form, masa_pemberitahuan_hari: e.target.value.replace(/\D/g, "") })} placeholder="Mis. 60" /></div>}
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "-6px" }}>Pengingat mulai {ambangHari({ kategori: form.kategori, lama_proses_hari: Number(form.lama_proses_hari) || 0, masa_pemberitahuan_hari: Number(form.masa_pemberitahuan_hari) || 0 })} hari sebelum berakhir{form.kategori === "PRJ" ? " (masa pemberitahuan + 14 hari)" : form.lama_proses_hari ? " (lama pengurusan + 30 hari)" : " (bawaan)"}.</div>
                <div className="lg-f"><label>Tingkat risiko bila lewat masa berlaku</label>
                  <div className="lg-pilih">{RISIKO_LEGAL.map((r) => <button key={r} type="button" className={form.risiko === r ? "on" : ""} onClick={() => setForm({ ...form, risiko: r })}>{r}</button>)}</div>
                </div>
              </>
            )}

            {mode !== "ubah" && (
              <>
                <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", fontWeight: 700, color: "var(--ink-soft)", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.tanpa_masa_berlaku} onChange={(e) => setForm({ ...form, tanpa_masa_berlaku: e.target.checked })} /> Tanpa masa berlaku (akta, berita acara, surat resmi)
                </label>
                {!form.tanpa_masa_berlaku && (
                  <div className="lg-grid">
                    <div className="lg-f"><label>Mulai berlaku *</label><input type="date" value={form.tanggal_mulai} onChange={(e) => setForm({ ...form, tanggal_mulai: e.target.value })} /></div>
                    <div className="lg-f"><label>Berakhir *</label><input type="date" value={form.tanggal_berakhir} onChange={(e) => setForm({ ...form, tanggal_berakhir: e.target.value })} /></div>
                  </div>
                )}
                <div className="lg-grid">
                  <div className="lg-f"><label>Catatan versi</label><input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} placeholder="Mis. diperpanjang via notaris X" /></div>
                  <div className="lg-f"><label>Biaya pengurusan (Rp, opsional)</label><input inputMode="numeric" value={form.biaya ? new Intl.NumberFormat("id-ID").format(Number(form.biaya)) : ""} onChange={(e) => setForm({ ...form, biaya: e.target.value.replace(/\D/g, "") })} placeholder="Masuk ke Anggaran" /></div>
                </div>
                <div className="lg-f"><label>File scan * (PDF / gambar / Word / Excel, maks {MAX_FILE_LEGAL_MB} MB — tersimpan privat)</label>
                  <input type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ height: "auto", padding: "10px" }} />
                </div>
              </>
            )}
            {mode === "ubah" && <div style={{ fontSize: "12px", color: "var(--muted)" }}>Mengubah data tidak mengganti file. Untuk file / masa berlaku baru gunakan &quot;Perbarui&quot;.</div>}

            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="sa-btn is-soft" style={{ flex: 1 }} onClick={() => setMode(null)} disabled={menyimpan}>Batal</button>
              <button type="submit" className="sa-btn is-primary" style={{ flex: 2 }} disabled={menyimpan}>{menyimpan ? "Menyimpan…" : mode === "ubah" ? "Simpan data" : "Simpan dokumen"}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ============ §147 Modal mulai urus perpanjangan ============ */}
      <Modal open={!!proses} onClose={() => setProses(null)} maxWidth="460px">
        {proses && (
          <div className="lg-form">
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>Mulai urus: {proses.nama_dokumen}</h3>
            <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)" }}>Selama sedang diurus, pengingat berhenti. Bila melewati {Number(proses.lama_proses_hari) > 0 ? proses.lama_proses_hari : 60} hari, status menjadi &quot;macet&quot; dan pengingat aktif lagi. Setelah izin terbit, unggah lewat &quot;Selesai — unggah izin baru&quot;.</p>
            <div className="lg-f"><label>Tanggal mulai diurus</label><input type="date" value={formProses.sejak} onChange={(e) => setFormProses({ ...formProses, sejak: e.target.value })} /></div>
            <div className="lg-f"><label>Nomor pengajuan / registrasi</label><input value={formProses.nomor_pengajuan} onChange={(e) => setFormProses({ ...formProses, nomor_pengajuan: e.target.value })} /></div>
            <div className="lg-f"><label>Catatan</label><input value={formProses.catatan} onChange={(e) => setFormProses({ ...formProses, catatan: e.target.value })} placeholder="Mis. via notaris X, menunggu survei lapangan" /></div>
            <button type="button" className="sa-btn is-primary" style={{ height: "44px" }} onClick={mulaiProses}>Tandai sedang diurus</button>
          </div>
        )}
      </Modal>

      {/* ============ §147 Modal syarat & kewajiban ============ */}
      <Modal open={!!detailLive} onClose={() => setDetail(null)} maxWidth="600px">
        {detailLive && (
          <div className="lg-form">
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>{detailLive.nama_dokumen} <span className="lg-kode">{detailLive.kode_arsip || "-"}</span></h3>

            <div>
              <div style={{ fontSize: "13px", fontWeight: 800 }}>Checklist syarat perpanjangan</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginBottom: "4px" }}>Dipakai ulang tiap perpanjangan — centang direset otomatis saat versi baru diunggah.</div>
              {(detailLive.syarat || []).map((s, i) => (
                <div key={i} className="lg-baris">
                  <input type="checkbox" checked={s.selesai} onChange={() => ubahDetail(detailLive, { syarat: (detailLive.syarat || []).map((x, j) => (j === i ? { ...x, selesai: !x.selesai } : x)) })} aria-label={`Syarat ${s.nama}`} />
                  <span style={{ flex: 1, textDecoration: s.selesai ? "line-through" : "none", color: s.selesai ? "var(--muted)" : "var(--ink)" }}>{s.nama}</span>
                  {!magang && <button type="button" className="lg-btn hapus" style={{ height: "26px" }} onClick={() => ubahDetail(detailLive, { syarat: (detailLive.syarat || []).filter((_, j) => j !== i) })}>×</button>}
                </div>
              ))}
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <input style={inp} value={syaratBaru} onChange={(e) => setSyaratBaru(e.target.value)} placeholder="Mis. KTP direksi, akta terakhir, gambar teknis" />
                <button type="button" className="lg-btn" onClick={() => { if (!syaratBaru.trim()) return; ubahDetail(detailLive, { syarat: [...(detailLive.syarat || []), { nama: syaratBaru.trim(), selesai: false }] }); setSyaratBaru(""); }}>+ Syarat</button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: "13px", fontWeight: 800 }}>Kewajiban berkala</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginBottom: "4px" }}>Mis. riksa uji lift tiap 12 bulan, laporan lingkungan tiap 6 bulan. Pengingat dikirim 30, 14, 7, 1 hari sebelum & saat lewat.</div>
              {(detailLive.kewajiban || []).map((k) => {
                const s = sisaHari(k.jatuh_tempo);
                return (
                  <div key={k.id} className="lg-baris" style={{ flexWrap: "wrap" }}>
                    <span style={{ flex: "1 1 200px" }}><b>{k.nama}</b> · tiap {k.interval_bulan} bln · jatuh tempo {fmt(k.jatuh_tempo)} <b style={{ color: s < 0 ? "var(--red-600)" : s <= 30 ? "var(--warn)" : "var(--muted)" }}>({s < 0 ? `lewat ${-s} hari` : `${s} hari lagi`})</b>{k.terakhir ? <span style={{ color: "var(--muted)" }}> · terakhir {fmt(k.terakhir)}</span> : ""}</span>
                    <button type="button" className="lg-btn" style={{ height: "28px" }} onClick={() => selesaiKewajiban(detailLive, k)}>Tandai selesai</button>
                    {!magang && <button type="button" className="lg-btn hapus" style={{ height: "28px" }} onClick={() => ubahDetail(detailLive, { kewajiban: (detailLive.kewajiban || []).filter((x) => x.id !== k.id) })}>×</button>}
                  </div>
                );
              })}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 90px minmax(0,1.2fr) auto", gap: "6px", marginTop: "6px" }}>
                <input style={inp} value={kwjBaru.nama} onChange={(e) => setKwjBaru({ ...kwjBaru, nama: e.target.value })} placeholder="Nama kewajiban" />
                <input style={inp} inputMode="numeric" value={kwjBaru.interval_bulan} onChange={(e) => setKwjBaru({ ...kwjBaru, interval_bulan: e.target.value.replace(/\D/g, "") })} aria-label="Interval bulan" title="Interval (bulan)" />
                <input style={inp} type="date" value={kwjBaru.jatuh_tempo} onChange={(e) => setKwjBaru({ ...kwjBaru, jatuh_tempo: e.target.value })} aria-label="Jatuh tempo berikutnya" />
                <button type="button" className="lg-btn" onClick={() => tambahKewajiban(detailLive)}>+ Tambah</button>
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px" }}>Kolom: nama · interval (bulan) · jatuh tempo berikutnya</div>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
