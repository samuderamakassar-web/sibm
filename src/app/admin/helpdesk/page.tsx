"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { kirimWA, kirimEmail, template } from "../../../lib/notify";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import Select from "../../../components/ui/Select";

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
}

type StatusFilterType = "Semua" | "Menunggu" | "Sedang Dikerjakan" | "Selesai";

const STATUS_TONE: Record<string, "warning" | "info" | "success"> = {
  Menunggu: "warning",
  "Sedang Dikerjakan": "info",
  Selesai: "success",
};
const STATUS_CARD_BG: Record<string, string> = {
  Menunggu: "#fffaf0",
  "Sedang Dikerjakan": "#ebf8ff",
  Selesai: "#f0fff4",
};

export default function AdminHelpdeskPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const [adminName, setAdminName] = useState("Admin GA");
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [daftarKontak, setDaftarKontak] = useState<KontakKaryawan[]>([]);

  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [statusUbah, setStatusUbah] = useState<string>("");
  const [fotoHasil, setFotoHasil] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [filterStatus, setFilterStatus] = useState<StatusFilterType>("Semua");

  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const dept = localStorage.getItem("pic_dept");
    const nama = localStorage.getItem("pic_nama");

    if (!role || (dept !== "Admin GA" && dept !== "Management")) {
      showToast("Akses Ditolak! Halaman ini khusus Admin GA.", "error");
      router.push("/");
      return;
    }

    setTimeout(() => setAdminName(nama || "Admin GA"), 0);

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
  }, [router]);

  const formatJam = (ts: Timestamp | null | undefined) => {
    if (!ts) return "-";
    return new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

    setIsUpdating(true);
    try {
      const ref = doc(db, "helpdesk_tickets", selectedTicket.id);
      await updateDoc(ref, { status: statusUbah, foto_proses: fotoHasil || null });

      if (statusBerubah) {
        await kirimNotifikasiHelpdesk(selectedTicket.nama_pelapor, statusUbah, selectedTicket.id);
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

  const kirimNotifikasiHelpdesk = async (namaPelapor: string, statusBaru: string, ticketId: string) => {
    const kontak = cariKontakKaryawan(namaPelapor);

    if (!kontak || (!kontak.no_wa && !kontak.email)) {
      console.warn(`[notify] Kontak untuk "${namaPelapor}" tidak ditemukan / belum lengkap di Master Data Karyawan. Notifikasi helpdesk dilewati.`);
      return;
    }

    const kodeTiket = ticketId.slice(0, 8).toUpperCase();
    const pesan = template.helpdeskUpdate(namaPelapor, statusBaru, kodeTiket);

    if (kontak.no_wa) {
      const hasilWA = await kirimWA(kontak.no_wa, pesan);
      if (!hasilWA.sukses) console.error("[notify] Gagal kirim WA helpdesk:", hasilWA.pesanError);
    }

    if (kontak.email) {
      const hasilEmail = await kirimEmail(kontak.email, `Update Tiket Helpdesk ${kodeTiket}: ${statusBaru}`, pesan, namaPelapor);
      if (!hasilEmail.sukses) console.error("[notify] Gagal kirim Email helpdesk:", hasilEmail.pesanError);
    }
  };

  const filteredTickets = filterStatus === "Semua" ? tickets : tickets.filter((t) => t.status === filterStatus);

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Admin</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          🛠️ Tim GA: {adminName}
        </div>
      </div>

      <div style={{ background: "linear-gradient(135deg, #1a365d 0%, #3182ce 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(49, 130, 206, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>HELPDESK COMMAND CENTER</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Kelola dan tindak lanjuti laporan kerusakan fasilitas gedung</p>
      </div>

      <div style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <Card style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "5px" }}>
            {(["Semua", "Menunggu", "Sedang Dikerjakan", "Selesai"] as StatusFilterType[]).map((status) => {
              const count = status === "Semua" ? tickets.length : tickets.filter((t) => t.status === status).length;
              const active = filterStatus === status;
              return (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  style={{ flexShrink: 0, padding: "10px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: active ? "#3182ce" : "#edf2f7", color: active ? "white" : "#4a5568", fontSize: "13px" }}
                >
                  {status} ({count})
                </button>
              );
            })}
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
          {filteredTickets.length > 0 ? (
            filteredTickets.map((tiket) => (
              <Card key={tiket.id} padded={false} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "15px", background: STATUS_CARD_BG[tiket.status] || "white", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: "900", color: "#2d3748", fontSize: "15px", marginBottom: "3px" }}>📍 {tiket.lokasi}</div>
                    <div style={{ fontSize: "11px", color: "#718096" }}>Dilaporkan: {formatJam(tiket.waktu_lapor)}</div>
                  </div>
                  <Badge tone={STATUS_TONE[tiket.status] || "neutral"}>{tiket.status}</Badge>
                </div>

                <div style={{ padding: "15px", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#edf2f7", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "14px" }}>🧑‍💼</div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "bold", color: "#2d3748" }}>{tiket.nama_pelapor}</div>
                      <div style={{ fontSize: "11px", color: "#a0aec0" }}>{tiket.departemen}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "13px", color: "#4a5568", background: "#f8fafc", padding: "10px", borderRadius: "8px", border: "1px solid #edf2f7", fontStyle: "italic", minHeight: "50px" }}>
                    &quot;{tiket.deskripsi}&quot;
                  </div>
                </div>

                <div style={{ padding: "15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <Button variant="primary" onClick={() => handleBukaModal(tiket)}>
                    {tiket.status === "Selesai" ? "Lihat Detail Bukti" : "Tindak Lanjuti Laporan"}
                  </Button>
                </div>
              </Card>
            ))
          ) : (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "50px 20px", background: "white", borderRadius: "20px", border: "1px dashed #cbd5e0", color: "#a0aec0" }}>
              <div style={{ fontSize: "40px", marginBottom: "10px" }}>🎉</div>
              <h3 style={{ margin: "0 0 5px 0", color: "#4a5568" }}>Tidak ada tiket di kategori ini!</h3>
              <p style={{ margin: 0, fontSize: "13px" }}>Tim GA sedang bersantai atau semua fasilitas dalam kondisi prima.</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!selectedTicket} onClose={() => setSelectedTicket(null)} maxWidth="600px">
        {selectedTicket && (
          <>
            <div style={{ marginBottom: "20px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px", paddingRight: "30px" }}>
              <h2 style={{ margin: "0 0 5px 0", fontSize: "18px", fontWeight: "800", color: "#1a202c" }}>📝 Eksekusi Tiket GA</h2>
              <div style={{ fontSize: "12px", color: "#a0aec0" }}>Tiket ID: {selectedTicket.id.slice(0, 8).toUpperCase()}</div>
            </div>

            <div style={{ background: "white", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: "bold", color: "#a0aec0", textTransform: "uppercase", marginBottom: "8px" }}>Detail Laporan Kerusakan</div>
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "8px", fontSize: "13px" }}>
                <div style={{ color: "#718096" }}>Pelapor:</div>
                <div style={{ fontWeight: "bold", color: "#2d3748" }}>{selectedTicket.nama_pelapor} ({selectedTicket.departemen})</div>
                <div style={{ color: "#718096" }}>Lokasi:</div>
                <div style={{ fontWeight: "bold", color: "#2d3748" }}>{selectedTicket.lokasi}</div>
                <div style={{ color: "#718096" }}>Keluhan:</div>
                <div style={{ color: "#4a5568", fontStyle: "italic" }}>&quot;{selectedTicket.deskripsi}&quot;</div>
              </div>
            </div>

            {selectedTicket.foto_awal && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "8px" }}>📸 Foto Kondisi Awal (Dari Pelapor)</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedTicket.foto_awal} alt="Foto Awal" style={{ width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
            )}

            <form onSubmit={handleSimpanPerubahan} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div style={{ background: "#ebf8ff", padding: "15px", borderRadius: "12px", border: "1px solid #bee3f8" }}>
                <Select label="Ubah Status Pengerjaan:" value={statusUbah} onChange={(e) => setStatusUbah(e.target.value)} style={{ border: "1px solid #90cdf4" }}>
                  <option value="Menunggu">⏳ Menunggu (Belum direspon)</option>
                  <option value="Sedang Dikerjakan">🧑‍🔧 Sedang Dikerjakan (In Progress)</option>
                  <option value="Selesai">✅ Selesai (Closed)</option>
                </Select>
              </div>

              {statusUbah === "Selesai" && (
                <div style={{ background: fotoHasil ? "#f0fff4" : "white", border: fotoHasil ? "2px solid #9ae6b4" : "2px dashed #cbd5e0", padding: "20px", borderRadius: "12px", textAlign: "center" }}>
                  <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "30px", filter: fotoHasil ? "none" : "grayscale(100%) opacity(0.5)" }}>📸</span>
                    <div style={{ fontSize: "13px", fontWeight: "bold", color: fotoHasil ? "#22543d" : "#4a5568" }}>
                      {fotoHasil ? "Foto Hasil Perbaikan Siap Diunggah ✓" : "Upload Foto Hasil Perbaikan (Wajib) *"}
                    </div>
                    {!fotoHasil && <div style={{ fontSize: "11px", color: "#a0aec0" }}>Sebagai bukti untuk menutup tiket ini</div>}
                    <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} style={{ display: "none" }} />
                  </label>
                  {fotoHasil && (
                    <div style={{ marginTop: "15px", position: "relative", display: "inline-block" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotoHasil} alt="Hasil" style={{ width: "100%", maxHeight: "180px", objectFit: "cover", borderRadius: "8px", border: "1px solid #c6f6d5" }} />
                      <button type="button" onClick={() => setFotoHasil("")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "#e53e3e", color: "white", border: "none", width: "25px", height: "25px", borderRadius: "50%", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>✖</button>
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" loading={isUpdating} loadingText="Menyimpan & Mengirim Notifikasi..." style={{ marginTop: "10px", background: isUpdating ? undefined : "#2d3748" }}>
                💾 Simpan Pembaruan Tiket
              </Button>
            </form>
          </>
        )}
      </Modal>
    </div>
  );
}