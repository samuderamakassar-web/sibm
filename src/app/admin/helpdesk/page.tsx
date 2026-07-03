"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { kirimWA, kirimEmail, template } from "../../../lib/notify";

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

// Menentukan tipe data khusus agar TypeScript tidak protes
type StatusFilterType = "Semua" | "Menunggu" | "Sedang Dikerjakan" | "Selesai";

export default function AdminHelpdeskPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin GA");
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [daftarKontak, setDaftarKontak] = useState<KontakKaryawan[]>([]);

  // Modal State
  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [statusUbah, setStatusUbah] = useState<string>("");
  const [fotoHasil, setFotoHasil] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter State
  const [filterStatus, setFilterStatus] = useState<StatusFilterType>("Semua");

  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const dept = localStorage.getItem("pic_dept");
    const nama = localStorage.getItem("pic_nama");

    if (!role || (dept !== "Admin GA" && dept !== "Management")) {
      alert("Akses Ditolak! Halaman ini khusus Admin GA.");
      router.push("/");
      return;
    }
    
    // Membungkus dengan setTimeout untuk menghindari error "cascading renders" dari ESLint
    setTimeout(() => setAdminName(nama || "Admin GA"), 0);

    // Tarik data tiket secara real-time
    const q = query(collection(db, "helpdesk_tickets"), orderBy("waktu_lapor", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as HelpdeskTicket));
      setTickets(data);
      setIsReady(true);
    });

    // Tarik Master Data Karyawan (untuk lookup no_wa/email saat kirim notifikasi)
    const unsubscribeKontak = onSnapshot(collection(db, "employees_directory"), (snapshot) => {
      const data = snapshot.docs.map(d => d.data() as KontakKaryawan);
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
      if (typeof ev.target?.result === 'string') img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSimpanPerubahan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    if (statusUbah === "Selesai" && !fotoHasil && !selectedTicket.foto_proses) {
      return alert("Untuk menutup tiket (Selesai), Anda WAJIB melampirkan Foto Hasil Perbaikan!");
    }

    const statusBerubah = statusUbah !== selectedTicket.status;

    setIsUpdating(true);
    try {
      const ref = doc(db, "helpdesk_tickets", selectedTicket.id);
      await updateDoc(ref, {
        status: statusUbah,
        foto_proses: fotoHasil || null
      });

      // Kirim notifikasi ke pelapor hanya jika status memang berganti (bukan sekadar simpan ulang foto)
      if (statusBerubah) {
        await kirimNotifikasiHelpdesk(selectedTicket.nama_pelapor, statusUbah, selectedTicket.id);
      }

      alert("✅ Status tiket berhasil diperbarui!");
      setSelectedTicket(null);
    } catch (error) {
      console.error(error);
      alert("Gagal memperbarui tiket.");
    } finally {
      setIsUpdating(false);
    }
  };

  // Cari kontak (no_wa/email) karyawan berdasarkan nama_pelapor (cocok tanpa peduli besar/kecil huruf)
  const cariKontakKaryawan = (nama: string): KontakKaryawan | undefined => {
    const namaNormal = nama.trim().toLowerCase();
    return daftarKontak.find(k => (k.nama || "").trim().toLowerCase() === namaNormal);
  };

  // Kirim WA + Email ke pelapor helpdesk saat status tiket berubah
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

  const filteredTickets = filterStatus === "Semua" ? tickets : tickets.filter(t => t.status === filterStatus);

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Admin</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          🛠️ Tim GA: {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #1a365d 0%, #3182ce 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(49, 130, 206, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>HELPDESK COMMAND CENTER</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Kelola dan tindak lanjuti laporan kerusakan fasilitas gedung</p>
      </div>

      {/* 🔹 KONTEN UTAMA */}
      <div style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* STATISTIK & FILTER */}
        <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "5px" }}>
            {["Semua", "Menunggu", "Sedang Dikerjakan", "Selesai"].map(status => {
              const count = status === "Semua" ? tickets.length : tickets.filter(t => t.status === status).length;
              return (
                <button 
                  key={status} onClick={() => setFilterStatus(status as StatusFilterType)}
                  style={{ flexShrink: 0, padding: "10px 20px", borderRadius: "12px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "all 0.2s", background: filterStatus === status ? "#3182ce" : "#edf2f7", color: filterStatus === status ? "white" : "#4a5568", fontSize: "13px" }}
                >
                  {status} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* DAFTAR TIKET (GRID CARDS) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
          {filteredTickets.length > 0 ? filteredTickets.map((tiket) => (
            <div key={tiket.id} style={{ background: "white", borderRadius: "20px", overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "15px", background: tiket.status === "Menunggu" ? "#fffaf0" : (tiket.status === "Sedang Dikerjakan" ? "#ebf8ff" : "#f0fff4"), borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: "900", color: "#2d3748", fontSize: "15px", marginBottom: "3px" }}>📍 {tiket.lokasi}</div>
                  <div style={{ fontSize: "11px", color: "#718096" }}>Dilaporkan: {formatJam(tiket.waktu_lapor)}</div>
                </div>
                <span style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "6px", fontWeight: "bold", background: tiket.status === "Menunggu" ? "#feebc8" : (tiket.status === "Sedang Dikerjakan" ? "#bee3f8" : "#c6f6d5"), color: tiket.status === "Menunggu" ? "#9c4221" : (tiket.status === "Sedang Dikerjakan" ? "#2b6cb0" : "#22543d"), whiteSpace: "nowrap" }}>
                  {tiket.status}
                </span>
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
                <button onClick={() => handleBukaModal(tiket)} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "none", background: "#3182ce", color: "white", fontWeight: "bold", cursor: "pointer", fontSize: "13px", boxShadow: "0 2px 4px rgba(49,130,206,0.2)", transition: "0.2s" }}>
                  {tiket.status === "Selesai" ? "Lihat Detail Bukti" : "Tindak Lanjuti Laporan"}
                </button>
              </div>
            </div>
          )) : (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "50px 20px", background: "white", borderRadius: "20px", border: "1px dashed #cbd5e0", color: "#a0aec0" }}>
              <div style={{ fontSize: "40px", marginBottom: "10px" }}>🎉</div>
              <h3 style={{ margin: "0 0 5px 0", color: "#4a5568" }}>Tidak ada tiket di kategori ini!</h3>
              <p style={{ margin: 0, fontSize: "13px" }}>Tim GA sedang bersantai atau semua fasilitas dalam kondisi prima.</p>
            </div>
          )}
        </div>
      </div>

      {/* 🔹 MODAL EKSEKUSI TIKET */}
      {selectedTicket && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(5px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "600px", borderRadius: "24px", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
            
            <div style={{ background: "#2d3748", color: "white", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: "0 0 5px 0", fontSize: "18px", fontWeight: "800" }}>📝 Eksekusi Tiket GA</h2>
                <div style={{ fontSize: "12px", color: "#a0aec0" }}>Tiket ID: {selectedTicket.id.slice(0,8).toUpperCase()}</div>
              </div>
              <button onClick={() => setSelectedTicket(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "14px" }}>✖</button>
            </div>

            <div style={{ padding: "20px", overflowY: "auto", flex: 1, background: "#f8fafc" }}>
              
              <div style={{ background: "white", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", fontWeight: "bold", color: "#a0aec0", textTransform: "uppercase", marginBottom: "8px" }}>Detail Laporan Kerusakan</div>
                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "8px", fontSize: "13px" }}>
                  <div style={{ color: "#718096" }}>Pelapor:</div><div style={{ fontWeight: "bold", color: "#2d3748" }}>{selectedTicket.nama_pelapor} ({selectedTicket.departemen})</div>
                  <div style={{ color: "#718096" }}>Lokasi:</div><div style={{ fontWeight: "bold", color: "#2d3748" }}>{selectedTicket.lokasi}</div>
                  <div style={{ color: "#718096" }}>Keluhan:</div><div style={{ color: "#4a5568", fontStyle: "italic" }}>&quot;{selectedTicket.deskripsi}&quot;</div>
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
                  <label style={{ fontSize: "13px", fontWeight: "bold", color: "#2b6cb0", display: "block", marginBottom: "8px" }}>Ubah Status Pengerjaan:</label>
                  <select value={statusUbah} onChange={(e) => setStatusUbah(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #90cdf4", fontSize: "14px", fontWeight: "bold", outline: "none", cursor: "pointer" }}>
                    <option value="Menunggu">⏳ Menunggu (Belum direspon)</option>
                    <option value="Sedang Dikerjakan">🧑‍🔧 Sedang Dikerjakan (In Progress)</option>
                    <option value="Selesai">✅ Selesai (Closed)</option>
                  </select>
                </div>

                {statusUbah === "Selesai" && (
                  <div style={{ background: fotoHasil ? "#f0fff4" : "white", border: fotoHasil ? "2px solid #9ae6b4" : "2px dashed #cbd5e0", padding: "20px", borderRadius: "12px", textAlign: "center", transition: "0.2s", animation: "fadeIn 0.3s" }}>
                    <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "30px", filter: fotoHasil ? "none" : "grayscale(100%) opacity(0.5)" }}>📸</span>
                      <div style={{ fontSize: "13px", fontWeight: "bold", color: fotoHasil ? "#22543d" : "#4a5568" }}>{fotoHasil ? "Foto Hasil Perbaikan Siap Diunggah ✓" : "Upload Foto Hasil Perbaikan (Wajib) *"}</div>
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

                <button type="submit" disabled={isUpdating} style={{ width: "100%", padding: "16px", background: isUpdating ? "#a0aec0" : "#2d3748", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "15px", cursor: isUpdating ? "not-allowed" : "pointer", marginTop: "10px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", transition: "0.2s" }}>
                  {isUpdating ? "Menyimpan & Mengirim Notifikasi..." : "💾 Simpan Pembaruan Tiket"}
                </button>
              </form>

            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}