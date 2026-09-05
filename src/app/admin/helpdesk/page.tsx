"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { kirimEmail } from "../../../lib/notify";
import { buildHelpdeskUpdateEmailHtml } from "../../../lib/emailTemplates";
import { useToast } from "../../../components/ui/ToastProvider";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import Select from "../../../components/ui/Select";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

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
}

type StatusFilterType = "Semua" | "Menunggu" | "Sedang Dikerjakan" | "Selesai";

const STATUS_TONE: Record<string, "warning" | "info" | "success"> = {
  Menunggu: "warning",
  "Sedang Dikerjakan": "info",
  Selesai: "success",
};

export default function AdminHelpdeskPage() {
  const router = useRouter();
  const showToast = useToast();
  const { session, isReady: isAuthReady } = useAuthGuard({
    depts: ["Admin GA", "Management"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [daftarKontak, setDaftarKontak] = useState<KontakKaryawan[]>([]);

  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [statusUbah, setStatusUbah] = useState<string>("");
  const [fotoHasil, setFotoHasil] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [filterStatus, setFilterStatus] = useState<StatusFilterType>("Semua");
  const [previewFoto, setPreviewFoto] = useState<string | null>(null);

  // Filter Bulan & Tahun (berdasarkan waktu_lapor) -- dipisah jadi 2 dropdown independen
  // (bukan 1 dropdown gabungan "Agustus 2026") biar bisa lihat "semua Agustus lintas tahun" dst.
  const [filterBulan, setFilterBulan] = useState<string>("SEMUA");
  const [filterTahun, setFilterTahun] = useState<string>("SEMUA");

  useEffect(() => {
    if (!isAuthReady || !session) return;

    const q = query(collection(db, "helpdesk_tickets"), orderBy("waktu_lapor", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HelpdeskTicket));
      setTickets(data);
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

  const formatTanggal = (ts: Timestamp | null | undefined) => {
    if (!ts) return "-";
    return new Date(ts.toDate()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };

  const handleBukaModal = (tiket: HelpdeskTicket) => {
    setSelectedTicket(tiket);
    setStatusUbah(tiket.status);
    setFotoHasil(tiket.foto_proses || "");
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

    const statusBerubah = statusUbah !== selectedTicket.status;
    // Rekam waktu_selesai cuma sekali, pas pertama kali tiket ditutup (Selesai) -- supaya kalau admin buka lagi
    // buat lihat detail, waktu penyelesaian aslinya gak ketiban ulang.
    const baruTertutup = statusUbah === "Selesai" && selectedTicket.status !== "Selesai";

    setIsUpdating(true);
    try {
      const ref = doc(db, "helpdesk_tickets", selectedTicket.id);
      await updateDoc(ref, {
        status: statusUbah,
        foto_proses: fotoHasil || null,
        ...(baruTertutup ? { waktu_selesai: serverTimestamp() } : {}),
      });

      if (statusBerubah) {
        await kirimNotifikasiHelpdesk(selectedTicket, statusUbah);
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
  const tahunTersedia = Array.from(
    new Set(tickets.filter((t) => t.waktu_lapor).map((t) => String(t.waktu_lapor!.toDate().getFullYear())))
  ).sort().reverse();

  const filteredTickets = tickets.filter((t) => {
    const matchStatus = filterStatus === "Semua" || t.status === filterStatus;
    const tglLapor = t.waktu_lapor?.toDate();
    const matchBulan = filterBulan === "SEMUA" || (tglLapor && String(tglLapor.getMonth()) === filterBulan);
    const matchTahun = filterTahun === "SEMUA" || (tglLapor && String(tglLapor.getFullYear()) === filterTahun);
    return matchStatus && matchBulan && matchTahun;
  });

  if (!isAuthReady || !session || !isReady) return null;
  const adminName = session.nama || "Admin GA";

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .back-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px;
        }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge {
          display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info);
          padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2);
        }
        .admin-hero {
          position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff;
          padding: 34px 20px 50px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .admin-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .admin-hero-content { position: relative; }

        .helpdesk-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; table-layout: fixed; }
        .helpdesk-table th { padding: 12px 15px; font-weight: bold; }
        .helpdesk-table td { padding: 12px 15px; vertical-align: top; border-bottom: 1px solid var(--line); word-wrap: break-word; }
        .helpdesk-table tbody tr:hover td { filter: brightness(0.98); }
        .helpdesk-thumb { width: 52px; height: 52px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); cursor: zoom-in; }

        @media (max-width: 900px) {
          .helpdesk-table, .helpdesk-table tbody { display: block; width: 100%; }
          .helpdesk-table thead { display: none; }
          .helpdesk-table tr {
            display: block; width: 100%; margin-bottom: 15px;
            border: 1px solid var(--line); border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;
          }
          .helpdesk-table td {
            display: block; width: 100%; padding: 12px 15px !important;
            border-bottom: 1px dashed var(--line) !important;
          }
          .helpdesk-table td:last-child { border-bottom: none !important; }
          .helpdesk-table td::before { content: attr(data-label); display: block; font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
        }
      `}} />
      <div className="site-header">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> Tim GA: {adminName}
        </div>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>HELPDESK COMMAND CENTER</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Kelola dan tindak lanjuti laporan kerusakan fasilitas gedung</p>
        </div>
      </div>

      <div style={{ maxWidth: "1300px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <Card style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "5px" }}>
              {(["Semua", "Menunggu", "Sedang Dikerjakan", "Selesai"] as StatusFilterType[]).map((status) => {
                const count = status === "Semua" ? tickets.length : tickets.filter((t) => t.status === status).length;
                const active = filterStatus === status;
                return (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    style={{ flexShrink: 0, padding: "10px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: active ? "var(--info)" : "var(--bg)", color: active ? "var(--surface)" : "var(--ink-soft)", fontSize: "13px" }}
                  >
                    {status} ({count})
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <select
                value={filterBulan}
                onChange={(e) => setFilterBulan(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}
              >
                <option value="SEMUA">Semua Bulan</option>
                {NAMA_BULAN.map((nama, idx) => <option key={nama} value={String(idx)}>{nama}</option>)}
              </select>
              <select
                value={filterTahun}
                onChange={(e) => setFilterTahun(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none", cursor: "pointer" }}
              >
                <option value="SEMUA">Semua Tahun</option>
                {tahunTersedia.map((th) => <option key={th} value={th}>{th}</option>)}
              </select>
            </div>
          </div>
        </Card>

        <div style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--line)", overflow: "hidden" }}>
          {filteredTickets.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="helpdesk-table">
                <thead style={{ background: "var(--bg)" }}>
                  <tr>
                    <th style={{ width: "14%" }}>Pelapor</th>
                    <th style={{ width: "10%" }}>Tanggal</th>
                    <th style={{ width: "18%" }}>Keluhan</th>
                    <th style={{ width: "9%" }}>Foto Laporan</th>
                    <th style={{ width: "13%" }}>Waktu Lapor</th>
                    <th style={{ width: "13%" }}>Waktu Selesai</th>
                    <th style={{ width: "9%" }}>Foto Selesai</th>
                    <th style={{ width: "8%" }}>Status</th>
                    <th style={{ width: "10%" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((tiket) => (
                    <tr key={tiket.id}>
                      <td data-label="Pelapor">
                        <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{tiket.nama_pelapor}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)" }}>{tiket.departemen}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)" }}>📍 {tiket.lokasi}</div>
                      </td>
                      <td data-label="Tanggal">{formatTanggal(tiket.waktu_lapor)}</td>
                      <td data-label="Keluhan">
                        <span style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>&quot;{tiket.deskripsi}&quot;</span>
                      </td>
                      <td data-label="Foto Laporan">
                        {tiket.foto_awal ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={tiket.foto_awal} alt="Foto Laporan" className="helpdesk-thumb" onClick={() => setPreviewFoto(tiket.foto_awal!)} />
                        ) : <span style={{ color: "var(--muted)", fontSize: "12px" }}>-</span>}
                      </td>
                      <td data-label="Waktu Lapor" style={{ fontSize: "12px" }}>{formatJam(tiket.waktu_lapor)}</td>
                      <td data-label="Waktu Selesai" style={{ fontSize: "12px" }}>{formatJam(tiket.waktu_selesai)}</td>
                      <td data-label="Foto Selesai">
                        {tiket.foto_proses ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={tiket.foto_proses} alt="Foto Selesai" className="helpdesk-thumb" onClick={() => setPreviewFoto(tiket.foto_proses!)} />
                        ) : <span style={{ color: "var(--muted)", fontSize: "12px" }}>-</span>}
                      </td>
                      <td data-label="Status">
                        <Badge tone={STATUS_TONE[tiket.status] || "neutral"}>{tiket.status}</Badge>
                      </td>
                      <td data-label="Aksi">
                        <Button variant="primary" onClick={() => handleBukaModal(tiket)} style={{ fontSize: "12px", padding: "8px 12px" }}>
                          {tiket.status === "Selesai" ? "Lihat Detail" : "Tindak Lanjuti"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--muted)" }}>
              <div style={{ fontSize: "40px", marginBottom: "10px" }}>🎉</div>
              <h3 style={{ margin: "0 0 5px 0", color: "var(--ink-soft)" }}>Tidak ada tiket di kategori ini!</h3>
              <p style={{ margin: 0, fontSize: "13px" }}>Tim GA sedang bersantai atau semua fasilitas dalam kondisi prima.</p>
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
                </Select>
              </div>

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

              <Button type="submit" loading={isUpdating} loadingText="Menyimpan & Mengirim Notifikasi..." style={{ marginTop: "10px", background: isUpdating ? undefined : "var(--ink)" }}>
                💾 Simpan Pembaruan Tiket
              </Button>
            </form>
          </>
        )}
      </Modal>
    </div>
  );
}