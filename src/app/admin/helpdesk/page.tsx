"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, where } from "firebase/firestore";
import { daftarTahunSejak, rentangBulanTahun } from "../../../lib/rentangFilter";
import * as XLSX from "xlsx";
import { dataUrlKeCloudinary } from "../../../lib/uploadFoto";
import { db } from "../../../lib/firebase";
import { kirimEmail } from "../../../lib/notify";
import { buildHelpdeskUpdateEmailHtml } from "../../../lib/emailTemplates";
import { useToast } from "../../../components/ui/ToastProvider";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import Select from "../../../components/ui/Select";
import AdminShell from "../../../components/admin/AdminShell";


interface KontakKaryawan {
  nama: string;
  no_wa?: string;
  email?: string;
}

interface HelpdeskTicket {
  id: string;
  nama_pelapor: string;
  departemen: string;
  lokasi: string;
  deskripsi: string;
  status: string;
  foto_awal?: string;
  foto_proses?: string;
  waktu_lapor?: Timestamp | null;
  waktu_selesai?: Timestamp | null;
  biaya?: number;
  // §105 tidak dijalankan / dihapus (arsip)
  alasan_tidak_dijalankan?: string;
  alasan_hapus?: string;
  dihapus_oleh?: string;
  status_sebelum_hapus?: string;
}

type StatusFilterType = "Semua" | "Menunggu" | "Sedang Dikerjakan" | "Selesai" | "Tidak Dijalankan" | "Dihapus";
// §105: "Tidak Dijalankan" = ditutup tanpa perbaikan (alasan wajib, pelapor dikabari);
// "Dihapus" = arsip (laporan ganda/salah input) -- disembunyikan dari daftar & portal, bisa dipulihkan.
const STATUS_TIDAK_DIJALANKAN = "Tidak Dijalankan";
const STATUS_DIHAPUS = "Dihapus";
const STATUS_TERBUKA = ["Menunggu", "Sedang Dikerjakan"];

const STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger" | "neutral"> = {
  Menunggu: "warning",
  "Sedang Dikerjakan": "info",
  Selesai: "success",
  [STATUS_TIDAK_DIJALANKAN]: "danger",
  [STATUS_DIHAPUS]: "neutral",
};

export default function AdminHelpdeskPage() {
  const showToast = useToast();
  const { session, isReady: isAuthReady } = useAuthGuard({
    depts: ["Admin GA", "Management"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });
  // §69: dulu SELURUH tiket (termasuk tiket lama ber-foto base64) dibaca ulang tiap perubahan.
  // Sekarang tiket belum selesai (selalu tampil) + tiket dalam rentang filter bulan/tahun (default 90 hari).
  const [tiketTerbuka, setTiketTerbuka] = useState<HelpdeskTicket[]>([]);
  const [tiketRentang, setTiketRentang] = useState<HelpdeskTicket[]>([]);
  const tickets: HelpdeskTicket[] = (() => {
    const map = new Map<string, HelpdeskTicket>();
    [...tiketRentang, ...tiketTerbuka].forEach((tk) => map.set(tk.id, tk));
    return Array.from(map.values()).sort((a, b) => (b.waktu_lapor?.toMillis() || 0) - (a.waktu_lapor?.toMillis() || 0));
  })();
  const [isReady, setIsReady] = useState(false);
  const [daftarKontak, setDaftarKontak] = useState<KontakKaryawan[]>([]);

  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [statusUbah, setStatusUbah] = useState<string>("");
  // §89 biaya perbaikan (opsional) -> realisasi kategori "Perbaikan Gedung" di /admin/anggaran
  const [biayaPerbaikan, setBiayaPerbaikan] = useState("");
  const [fotoHasil, setFotoHasil] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [alasanTutup, setAlasanTutup] = useState("");
  const [modeHapus, setModeHapus] = useState(false);
  const [alasanHapus, setAlasanHapus] = useState("");

  const [filterStatus, setFilterStatus] = useState<StatusFilterType>("Semua");
  const [previewFoto, setPreviewFoto] = useState<string | null>(null);

  // Filter Bulan & Tahun (berdasarkan waktu_lapor) -- dipisah jadi 2 dropdown independen
  // (bukan 1 dropdown gabungan "Agustus 2026") biar bisa lihat "semua Agustus lintas tahun" dst.
  const [filterBulan, setFilterBulan] = useState<string>("SEMUA");
  const [filterTahun, setFilterTahun] = useState<string>("SEMUA");
  const rentang = rentangBulanTahun(filterBulan, filterTahun, "SEMUA", 90);
  useEffect(() => {
    if (!isAuthReady || !session) return;
    const syarat = [where("waktu_lapor", ">=", Timestamp.fromDate(rentang.dari))];
    if (rentang.sampai) syarat.push(where("waktu_lapor", "<", Timestamp.fromDate(rentang.sampai)));
    const unsub = onSnapshot(query(collection(db, "helpdesk_tickets"), ...syarat, orderBy("waktu_lapor", "desc")), (snap) => {
      setTiketRentang(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HelpdeskTicket)));
    }, (err) => console.error("[helpdesk] Gagal memuat tiket:", err));
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rentang.kunci mewakili rentang
  }, [isAuthReady, session, rentang.kunci]);

  useEffect(() => {
    if (!isAuthReady || !session) return;

    const unsubscribe = onSnapshot(query(collection(db, "helpdesk_tickets"), where("status", "in", STATUS_TERBUKA)), (snap) => {
      setTiketTerbuka(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HelpdeskTicket)));
      setIsReady(true);
    });

    const unsubscribeKontak = onSnapshot(collection(db, "employees_directory"), (snapshot) => {
      const data = snapshot.docs.map((d) => d.data() as KontakKaryawan);
      setDaftarKontak(data);
    });

    return () => {
      unsubscribe();
      unsubscribeKontak();
    };
  }, [isAuthReady, session]);

  const formatJam = (ts: Timestamp | null | undefined) => {
    if (!ts) return "-";
    return new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // §109 "2 Okt 2026 · 14.38" (kartu tiket)
  const waktuRingkas = (ts: Timestamp | null | undefined) => {
    if (!ts) return "-";
    const d = ts.toDate();
    return `${d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
  };

  const formatTanggal = (ts: Timestamp | null | undefined) => {
    if (!ts) return "-";
    return new Date(ts.toDate()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };

  // Durasi penyelesaian dalam HARI (bukan cuma jam) -- buat data KPI. Dibulatkan ke atas
  // (Math.ceil) supaya "1 jam" tetap kehitung 1 hari, bukan 0 -- lebih masuk akal buat
  // laporan tiket lama sebagai satuan yang manusiawi, bukan pecahan hari.
  const hitungDurasiHari = (lapor: Timestamp | null | undefined, selesai: Timestamp | null | undefined): string => {
    if (!lapor || !selesai) return "-";
    const ms = selesai.toDate().getTime() - lapor.toDate().getTime();
    if (ms <= 0) return "0 hari";
    const hari = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return `${hari} hari`;
  };

  const handleBukaModal = (tiket: HelpdeskTicket) => {
    setSelectedTicket(tiket);
    setStatusUbah(tiket.status);
    setFotoHasil(tiket.foto_proses || "");
    setBiayaPerbaikan(typeof tiket.biaya === "number" && tiket.biaya > 0 ? String(tiket.biaya) : "");
    setAlasanTutup(tiket.alasan_tidak_dijalankan || "");
    setModeHapus(false);
    setAlasanHapus("");
  };

  // §105 hapus = arsip (soft delete) dengan alasan; bisa dipulihkan dari filter "Arsip"
  const handleHapus = async () => {
    if (!selectedTicket) return;
    if (!alasanHapus.trim()) return showToast("Isi alasan penghapusan.", "warning");
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, "helpdesk_tickets", selectedTicket.id), {
        status: STATUS_DIHAPUS, status_sebelum_hapus: selectedTicket.status, alasan_hapus: alasanHapus.trim(),
        dihapus_oleh: session?.nama || "-", waktu_hapus: serverTimestamp(),
      });
      showToast("Laporan dipindahkan ke Arsip.", "success");
      setSelectedTicket(null);
    } catch (e) { console.error(e); showToast("Gagal menghapus laporan.", "error"); }
    finally { setIsUpdating(false); }
  };
  const handlePulihkan = async (tiket: HelpdeskTicket) => {
    try {
      await updateDoc(doc(db, "helpdesk_tickets", tiket.id), { status: tiket.status_sebelum_hapus || "Menunggu", alasan_hapus: null, dihapus_oleh: null, waktu_hapus: null });
      showToast("Laporan dipulihkan.", "success");
      setSelectedTicket(null);
    } catch (e) { console.error(e); showToast("Gagal memulihkan.", "error"); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setFotoHasil(canvas.toDataURL("image/jpeg", 0.6));
        }
      };
      if (typeof ev.target?.result === "string") img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSimpanPerubahan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    if (statusUbah === "Selesai" && !fotoHasil && !selectedTicket.foto_proses) {
      return showToast("Untuk menutup tiket (Selesai), Anda WAJIB melampirkan Foto Hasil Perbaikan!", "warning");
    }
    if (statusUbah === STATUS_TIDAK_DIJALANKAN && !alasanTutup.trim()) {
      return showToast("Isi alasan kenapa laporan tidak dijalankan.", "warning");
    }

    const statusBerubah = statusUbah !== selectedTicket.status;
    // Rekam waktu_selesai cuma sekali, pas pertama kali tiket ditutup (Selesai) -- supaya kalau admin buka lagi
    // buat lihat detail, waktu penyelesaian aslinya gak ketiban ulang.
    const baruTertutup = statusUbah === "Selesai" && selectedTicket.status !== "Selesai";

    setIsUpdating(true);
    try {
      const ref = doc(db, "helpdesk_tickets", selectedTicket.id);
      await updateDoc(ref, {
        status: statusUbah,
        foto_proses: (await dataUrlKeCloudinary(fotoHasil, "sibm/helpdesk")) || null,
        // §105 perbaikan bug: dulu /D/g (bukan \D) -> biaya selalu 0
        ...(statusUbah === "Selesai" ? { biaya: Number(biayaPerbaikan.replace(/\D/g, "")) || 0 } : {}),
        ...(statusUbah === STATUS_TIDAK_DIJALANKAN ? { alasan_tidak_dijalankan: alasanTutup.trim(), ditutup_oleh: session?.nama || "-", waktu_ditutup: serverTimestamp() } : {}),
        ...(baruTertutup ? { waktu_selesai: serverTimestamp() } : {}),
      });

      if (statusBerubah) {
        await kirimNotifikasiHelpdesk(selectedTicket, statusUbah === STATUS_TIDAK_DIJALANKAN ? `${statusUbah} — ${alasanTutup.trim()}` : statusUbah);
      }

      showToast("Status tiket berhasil diperbarui!", "success");
      setSelectedTicket(null);
    } catch (error) {
      console.error(error);
      showToast("Gagal memperbarui tiket.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const cariKontakKaryawan = (nama: string): KontakKaryawan | undefined => {
    const namaNormal = nama.trim().toLowerCase();
    return daftarKontak.find((k) => (k.nama || "").trim().toLowerCase() === namaNormal);
  };

  // Kirim Email ke pelapor saat status tiket berubah (WA sudah dihapus, token Fonnte invalid/expired)
  const kirimNotifikasiHelpdesk = async (ticket: HelpdeskTicket, statusBaru: string) => {
    const namaPelapor = ticket.nama_pelapor;
    const kontak = cariKontakKaryawan(namaPelapor);

    if (!kontak || !kontak.email) {
      console.warn(`[notify] Kontak untuk "${namaPelapor}" tidak ditemukan / belum punya email di Master Data Karyawan. Notifikasi helpdesk dilewati.`);
      return;
    }

    const kodeTiket = ticket.id.slice(0, 8).toUpperCase();

    const htmlEmail = buildHelpdeskUpdateEmailHtml({
      namaPelapor,
      kodeTiket,
      statusBaru,
      lokasi: ticket.lokasi,
      deskripsi: ticket.deskripsi,
    });
    const hasilEmail = await kirimEmail(kontak.email, `Update Tiket Helpdesk ${kodeTiket}: ${statusBaru}`, htmlEmail, namaPelapor);
    if (!hasilEmail.sukses) console.error("[notify] Gagal kirim Email helpdesk:", hasilEmail.pesanError);
  };

  const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const tahunTersedia = daftarTahunSejak().map(String);

  const filteredTickets = tickets.filter((t) => {
    const matchStatus = filterStatus === "Semua" ? t.status !== STATUS_DIHAPUS : t.status === filterStatus;
    const tglLapor = t.waktu_lapor?.toDate();
    const matchBulan = filterBulan === "SEMUA" || (tglLapor && String(tglLapor.getMonth()) === filterBulan);
    const matchTahun = filterTahun === "SEMUA" || (tglLapor && String(tglLapor.getFullYear()) === filterTahun);
    return matchStatus && matchBulan && matchTahun;
  });

  // Export ke Excel -- data KPI (durasi penyelesaian per tiket), ikutin filter yang lagi aktif.
  const handleExportExcel = () => {
    if (filteredTickets.length === 0) {
      showToast("Tidak ada data pada filter ini untuk diexport.", "warning");
      return;
    }
    const headers = ["Tanggal Lapor", "Pelapor", "Departemen", "Lokasi", "Deskripsi", "Status", "Waktu Lapor", "Waktu Selesai", "Durasi Penyelesaian"];
    const rows = filteredTickets.map((t) => [
      formatTanggal(t.waktu_lapor),
      t.nama_pelapor,
      t.departemen,
      t.lokasi,
      t.deskripsi,
      t.status,
      formatJam(t.waktu_lapor),
      formatJam(t.waktu_selesai),
      hitungDurasiHari(t.waktu_lapor, t.waktu_selesai),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = headers.map(() => ({ wch: 22 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Laporan Kerusakan");
    const sekarang = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Laporan_Kerusakan_${sekarang}.xlsx`);
  };

  if (!isAuthReady || !session || !isReady) return null;
  const adminName = session.nama || "Admin GA";

  return (
    <AdminShell title="Helpdesk & Tiket Kerusakan" subtitle="Kelola dan tindak lanjuti laporan kerusakan fasilitas gedung" userName={adminName}>
      <style dangerouslySetInnerHTML={{__html: `
        /* §109 daftar tiket berbentuk kartu (tabel 10 kolom dulu membuat teks patah-patah) */
        .hd-bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
        .hd-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .hd-chip { border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); border-radius: 999px; padding: 8px 13px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .hd-chip span { opacity: .65; margin-left: 4px; }
        .hd-chip.is-on { background: var(--ink); color: var(--surface); border-color: transparent; }
        .hd-alat { display: flex; gap: 6px; flex-wrap: wrap; }
        .hd-alat select { height: 38px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 13px; font-family: inherit; cursor: pointer; }
        .hd-list { display: flex; flex-direction: column; gap: 10px; }
        .hd-card { display: grid; grid-template-columns: 76px minmax(0, 1fr) auto; gap: 14px; align-items: start; padding: 14px; border-radius: 16px; border: 1px solid var(--line); background: var(--surface); }
        .hd-card.is-done { background: var(--bg); }
        .hd-foto { width: 76px; height: 76px; object-fit: cover; border-radius: 12px; cursor: zoom-in; display: block; background: var(--line); }
        .hd-foto.is-kosong { display: grid; place-items: center; font-size: 22px; cursor: default; }
        .hd-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .hd-lokasi { font-weight: 800; color: var(--ink); font-size: 14px; }
        .hd-waktu { margin-left: auto; font-size: 12px; color: var(--muted); white-space: nowrap; }
        .hd-tag { font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: var(--info-50); color: var(--info); white-space: nowrap; }
        .hd-keluhan { margin: 6px 0 0; font-size: 13.5px; color: var(--ink); line-height: 1.45; }
        .hd-meta { margin-top: 6px; font-size: 12px; color: var(--muted); line-height: 1.5; }
        .hd-meta b { color: var(--ink-soft); }
        .hd-info { margin-top: 8px; display: inline-block; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 8px; }
        .hd-aksi { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .hd-hasil { width: 44px; height: 44px; object-fit: cover; border-radius: 10px; cursor: zoom-in; border: 2px solid var(--ok); }
        @media (max-width: 640px) {
          .hd-card { grid-template-columns: 60px minmax(0, 1fr); }
          .hd-foto { width: 60px; height: 60px; }
          .hd-aksi { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; align-items: center; }
          .hd-waktu { margin-left: 0; width: 100%; }
        }
      `}} />
      <div>
        <div className="hd-bar">
          <div className="hd-chips" role="tablist" aria-label="Filter status tiket">
            {(["Semua", "Menunggu", "Sedang Dikerjakan", "Selesai", STATUS_TIDAK_DIJALANKAN, STATUS_DIHAPUS] as StatusFilterType[]).map((status) => {
              const count = status === "Semua" ? tickets.filter((t) => t.status !== STATUS_DIHAPUS).length : tickets.filter((t) => t.status === status).length;
              return (
                <button key={status} type="button" role="tab" aria-selected={filterStatus === status} className={`hd-chip${filterStatus === status ? " is-on" : ""}`} onClick={() => setFilterStatus(status)}>
                  {status === STATUS_DIHAPUS ? "Arsip" : status}<span>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="hd-alat">
            <select value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)} aria-label="Bulan">
              <option value="SEMUA">Semua bulan</option>
              {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
            </select>
            <select value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)} aria-label="Tahun">
              <option value="SEMUA">Semua tahun</option>
              {tahunTersedia.map((th) => <option key={th} value={th}>{th}</option>)}
            </select>
            <button type="button" onClick={handleExportExcel} className="sa-btn is-soft" style={{ height: "38px" }}>Export Excel</button>
          </div>
        </div>

        <div className="hd-list">
          {filteredTickets.length > 0 ? filteredTickets.map((tiket) => {
            const terbuka = STATUS_TERBUKA.includes(tiket.status);
            const tag = tiket.deskripsi?.match(/^\[([^\]]+)\]\s*/);
            const keluhan = tag ? tiket.deskripsi.slice(tag[0].length) : tiket.deskripsi;
            return (
              <article key={tiket.id} className={`hd-card${terbuka ? "" : " is-done"}`}>
                {tiket.foto_awal ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tiket.foto_awal} alt="Foto laporan" className="hd-foto" onClick={() => setPreviewFoto(tiket.foto_awal!)} />
                ) : <div className="hd-foto is-kosong" aria-hidden="true">📷</div>}
                <div style={{ minWidth: 0 }}>
                  <div className="hd-head">
                    <Badge tone={STATUS_TONE[tiket.status] || "neutral"}>{tiket.status}</Badge>
                    <span className="hd-lokasi">{tiket.lokasi}</span>
                    {tag && <span className="hd-tag">{tag[1]}</span>}
                    <span className="hd-waktu">{waktuRingkas(tiket.waktu_lapor)}</span>
                  </div>
                  <p className="hd-keluhan">{keluhan}</p>
                  <div className="hd-meta">
                    Pelapor <b>{tiket.nama_pelapor}</b> · {tiket.departemen}
                    {tiket.waktu_selesai && <> · Selesai <b>{waktuRingkas(tiket.waktu_selesai)}</b> ({hitungDurasiHari(tiket.waktu_lapor, tiket.waktu_selesai)})</>}
                    {typeof tiket.biaya === "number" && tiket.biaya > 0 && <> · Biaya <b>Rp {new Intl.NumberFormat("id-ID").format(tiket.biaya)}</b></>}
                  </div>
                  {tiket.status === STATUS_TIDAK_DIJALANKAN && tiket.alasan_tidak_dijalankan && <div className="hd-info" style={{ background: "var(--red-50)", color: "var(--red-600)" }}>Tidak dijalankan: {tiket.alasan_tidak_dijalankan}</div>}
                  {tiket.status === STATUS_DIHAPUS && <div className="hd-info" style={{ background: "var(--line)", color: "var(--ink-soft)" }}>Dihapus{tiket.dihapus_oleh ? ` oleh ${tiket.dihapus_oleh}` : ""}: {tiket.alasan_hapus || "-"}</div>}
                </div>
                <div className="hd-aksi">
                  {tiket.foto_proses ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tiket.foto_proses} alt="Foto hasil perbaikan" title="Foto hasil perbaikan" className="hd-hasil" onClick={() => setPreviewFoto(tiket.foto_proses!)} />
                  ) : <span />}
                  {tiket.status === STATUS_DIHAPUS ? (
                    <button type="button" className="sa-btn is-soft" onClick={() => handlePulihkan(tiket)}>Pulihkan</button>
                  ) : (
                    <button type="button" className={`sa-btn ${terbuka ? "is-primary" : "is-soft"}`} onClick={() => handleBukaModal(tiket)} style={{ whiteSpace: "nowrap" }}>
                      {terbuka ? "Tindak lanjuti" : "Lihat detail"}
                    </button>
                  )}
                </div>
              </article>
            );
          }) : (
            <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "16px" }}>
              <div style={{ fontSize: "36px", marginBottom: "8px" }}>🎉</div>
              <b style={{ color: "var(--ink-soft)" }}>Tidak ada tiket di kategori ini.</b>
            </div>
          )}
        </div>
      </div>

      {/* LIGHTBOX FOTO */}
      <Modal open={!!previewFoto} onClose={() => setPreviewFoto(null)} maxWidth="600px">
        {previewFoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewFoto} alt="Preview Foto" style={{ width: "100%", borderRadius: "12px" }} />
        )}
      </Modal>

      <Modal open={!!selectedTicket} onClose={() => setSelectedTicket(null)} maxWidth="600px">
        {selectedTicket && (
          <>
            <div style={{ marginBottom: "20px", borderBottom: "2px solid var(--line)", paddingBottom: "15px", paddingRight: "30px" }}>
              <h2 style={{ margin: "0 0 5px 0", fontSize: "18px", fontWeight: "800", color: "var(--ink)" }}>📝 Eksekusi Tiket GA</h2>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>Tiket ID: {selectedTicket.id.slice(0, 8).toUpperCase()}</div>
            </div>

            <div style={{ background: "var(--surface)", padding: "15px", borderRadius: "12px", border: "1px solid var(--line)", marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--muted)", textTransform: "uppercase", marginBottom: "8px" }}>Detail Laporan Kerusakan</div>
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "8px", fontSize: "13px" }}>
                <div style={{ color: "var(--muted)" }}>Pelapor:</div>
                <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{selectedTicket.nama_pelapor} ({selectedTicket.departemen})</div>
                <div style={{ color: "var(--muted)" }}>Lokasi:</div>
                <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{selectedTicket.lokasi}</div>
                <div style={{ color: "var(--muted)" }}>Keluhan:</div>
                <div style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>&quot;{selectedTicket.deskripsi}&quot;</div>
              </div>
            </div>

            {selectedTicket.foto_awal && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "8px" }}>📸 Foto Kondisi Awal (Dari Pelapor)</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedTicket.foto_awal} alt="Foto Awal" style={{ width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "12px", border: "1px solid var(--line)" }} />
              </div>
            )}

            <form onSubmit={handleSimpanPerubahan} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div style={{ background: "var(--info-50)", padding: "15px", borderRadius: "12px", border: "1px solid rgba(37,99,235,0.2)" }}>
                <Select label="Ubah Status Pengerjaan:" value={statusUbah} onChange={(e) => setStatusUbah(e.target.value)} style={{ border: "1px solid rgba(37,99,235,0.35)" }}>
                  <option value="Menunggu">⏳ Menunggu (Belum direspon)</option>
                  <option value="Sedang Dikerjakan">🧑‍🔧 Sedang Dikerjakan (In Progress)</option>
                  <option value="Selesai">✅ Selesai (Closed)</option>
                  <option value={STATUS_TIDAK_DIJALANKAN}>⛔ Tidak Dijalankan (dengan alasan)</option>
                </Select>
              </div>

              {statusUbah === STATUS_TIDAK_DIJALANKAN && (
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)" }}>
                  Alasan tidak dijalankan *
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {["Bukan kerusakan / sesuai fungsi", "Tanggung jawab tenant / vendor", "Menunggu anggaran / CER", "Sudah ditangani di tiket lain"].map((a) => (
                      <button key={a} type="button" onClick={() => setAlasanTutup(a)} style={{ padding: "5px 10px", borderRadius: "999px", border: "1px solid var(--line)", background: alasanTutup === a ? "var(--ink)" : "var(--bg)", color: alasanTutup === a ? "var(--surface)" : "var(--ink-soft)", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>{a}</button>
                    ))}
                  </div>
                  <textarea value={alasanTutup} onChange={(e) => setAlasanTutup(e.target.value)} placeholder="Tulis alasan (dikirim ke pelapor lewat email)" style={{ minHeight: "70px", padding: "10px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit", fontSize: "13px" }} />
                </label>
              )}

              {statusUbah === "Selesai" && (
                <div style={{ background: fotoHasil ? "var(--ok-50)" : "var(--surface)", border: fotoHasil ? "2px solid var(--ok)" : "2px dashed var(--line)", padding: "20px", borderRadius: "12px", textAlign: "center" }}>
                  <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "30px", filter: fotoHasil ? "none" : "grayscale(100%) opacity(0.5)" }}>📸</span>
                    <div style={{ fontSize: "13px", fontWeight: "bold", color: fotoHasil ? "var(--ok)" : "var(--ink-soft)" }}>
                      {fotoHasil ? "Foto Hasil Perbaikan Siap Diunggah ✓" : "Upload Foto Hasil Perbaikan (Wajib) *"}
                    </div>
                    {!fotoHasil && <div style={{ fontSize: "11px", color: "var(--muted)" }}>Sebagai bukti untuk menutup tiket ini</div>}
                    <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} style={{ display: "none" }} />
                  </label>
                  {fotoHasil && (
                    <div style={{ marginTop: "15px", position: "relative", display: "inline-block" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotoHasil} alt="Hasil" style={{ width: "100%", maxHeight: "180px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--ok-50)" }} />
                      <button type="button" onClick={() => setFotoHasil("")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "var(--red-600)", color: "var(--surface)", border: "none", width: "25px", height: "25px", borderRadius: "50%", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>✖</button>
                    </div>
                  )}
                </div>
              )}

              {statusUbah === "Selesai" && (
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)" }}>
                  Biaya perbaikan (opsional, Rp)
                  <input inputMode="numeric" value={biayaPerbaikan ? new Intl.NumberFormat("id-ID").format(Number(biayaPerbaikan)) : ""} onChange={(e) => setBiayaPerbaikan(e.target.value.replace(/\D/g, ""))} placeholder="Kosongkan bila tanpa biaya (teknisi internal)"
                    style={{ padding: "11px 12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: "14px", fontFamily: "inherit" }} />
                  <span style={{ fontWeight: 500, fontSize: "11.5px", color: "var(--muted)" }}>Tercatat otomatis sebagai realisasi anggaran &quot;Perbaikan Gedung&quot;.</span>
                </label>
              )}

              <Button type="submit" loading={isUpdating} loadingText="Menyimpan & Mengirim Notifikasi..." style={{ marginTop: "10px", background: isUpdating ? undefined : "var(--ink)" }}>
                💾 Simpan Pembaruan Tiket
              </Button>
            </form>

            {/* §105 HAPUS (ARSIP) */}
            <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed var(--line)" }}>
              {!modeHapus ? (
                <button type="button" onClick={() => setModeHapus(true)} style={{ background: "none", border: "none", color: "var(--red-600)", fontWeight: 700, fontSize: "12.5px", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>🗑 Hapus laporan ini (pindah ke Arsip)</button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)" }}>Alasan hapus * <span style={{ fontWeight: 500, color: "var(--muted)" }}>— laporan disembunyikan dari daftar & portal, tetap tersimpan di Arsip.</span></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {["Laporan ganda", "Salah input", "Laporan uji coba"].map((a) => (
                      <button key={a} type="button" onClick={() => setAlasanHapus(a)} style={{ padding: "5px 10px", borderRadius: "999px", border: "1px solid var(--line)", background: alasanHapus === a ? "var(--ink)" : "var(--bg)", color: alasanHapus === a ? "var(--surface)" : "var(--ink-soft)", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>{a}</button>
                    ))}
                  </div>
                  <input value={alasanHapus} onChange={(e) => setAlasanHapus(e.target.value)} placeholder="Tulis alasan..." style={{ padding: "10px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: "13px", fontFamily: "inherit" }} />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button type="button" className="sa-btn is-soft" style={{ flex: 1 }} onClick={() => setModeHapus(false)} disabled={isUpdating}>Batal</button>
                    <button type="button" onClick={handleHapus} disabled={isUpdating} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", background: "var(--red-600)", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{isUpdating ? "Menghapus..." : "Hapus ke Arsip"}</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>
    </AdminShell>
  );
}