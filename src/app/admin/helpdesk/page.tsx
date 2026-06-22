"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

interface Ticket {
  id: string;
  nama_pelapor: string;
  departemen: string;
  lokasi: string;
  deskripsi: string;
  status: "Menunggu" | "Sedang Dikerjakan" | "Selesai";
  waktu_lapor: Timestamp | null;
  foto_awal?: string; // Link foto kerusakan dari pelapor
  foto_proses?: string; // Link foto perbaikan dari GA
  waktu_selesai?: Timestamp | null;
}

export default function AdminHelpdeskPage() {
  const router = useRouter();
  
  const [adminName, setAdminName] = useState("Admin");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // State untuk Modal Update Status
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [fotoProses, setFotoProses] = useState("");

  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");
    if (!role || (!role.includes("Admin") && !role.includes("Koordinator") && !role.includes("GA"))) {
      alert("Akses Ditolak! Halaman ini khusus Administrator / GA.");
      router.push("/dashboard");
      return;
    }
    setTimeout(() => setAdminName(nama || "Admin GA"), 0);

    const q = query(collection(db, "helpdesk_tickets"), orderBy("waktu_lapor", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Ticket[]);
    });

    return () => unsub();
  }, [router]);

  const formatWaktu = (ts: Timestamp | null | undefined) => {
    if (!ts) return "-";
    return ts.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const handleKerjakan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (!fotoProses.trim()) return alert("Mohon lampirkan link/URL foto bukti pengerjaan!");

    setIsLoading(true);
    try {
      await updateDoc(doc(db, "helpdesk_tickets", selectedTicket.id), {
        status: "Sedang Dikerjakan",
        foto_proses: fotoProses,
        waktu_update: serverTimestamp()
      });
      setSelectedTicket(null);
      setFotoProses("");
    } catch (error) {
      alert("Gagal memperbarui status tiket.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelesai = async (id: string) => {
    if (!window.confirm("Tandai perbaikan fasilitas ini sebagai SELESAI?")) return;
    try {
      await updateDoc(doc(db, "helpdesk_tickets", id), {
        status: "Selesai",
        waktu_selesai: serverTimestamp()
      });
    } catch (error) {
      alert("Gagal menyelesaikan tiket.");
    }
  };

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Admin</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 {adminName}
        </div>
      </div>

      {/* 🔹 HERO */}
      <div style={{ background: "linear-gradient(135deg, #2b6cb0 0%, #4299e1 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(66, 153, 225, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>HELPDESK FASILITAS</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Manajemen Tiket Laporan Kerusakan Gedung (Building Management)</p>
      </div>

      {/* 🔹 KONTEN UTAMA */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ margin: 0, color: "#2d3748", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              🛠️ Daftar Laporan Kerusakan
            </h2>
          </div>

          <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                  <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Pelapor</th>
                  <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Lokasi & Kendala</th>
                  <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Status & Waktu</th>
                  <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Tindakan GA</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length > 0 ? tickets.map(t => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #edf2f7" }}>
                    <td style={{ padding: "12px 15px" }}>
                      <div style={{ fontWeight: "bold", color: "#2b6cb0", fontSize: "14px" }}>{t.nama_pelapor}</div>
                      <div style={{ fontSize: "11px", color: "#718096" }}>{t.departemen}</div>
                    </td>
                    <td style={{ padding: "12px 15px", color: "#4a5568", maxWidth: "300px" }}>
                      <div style={{ fontWeight: "bold" }}>📍 {t.lokasi}</div>
                      <div style={{ fontSize: "12px", marginTop: "4px" }}>{t.deskripsi}</div>
                    </td>
                    <td style={{ padding: "12px 15px", textAlign: "center" }}>
                      <div style={{ background: t.status === "Menunggu" ? "#feebc8" : (t.status === "Sedang Dikerjakan" ? "#ebf8ff" : "#c6f6d5"), color: t.status === "Menunggu" ? "#9c4221" : (t.status === "Sedang Dikerjakan" ? "#2b6cb0" : "#22543d"), padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", marginBottom: "5px", display: "inline-block" }}>
                        {t.status === "Menunggu" ? "⏳ Menunggu Teknisi" : t.status === "Sedang Dikerjakan" ? "🧑‍🔧 Sedang Dikerjakan" : "✅ Selesai"}
                      </div>
                      <div style={{ fontSize: "10px", color: "#718096" }}>{formatWaktu(t.waktu_lapor)}</div>
                    </td>
                    <td style={{ padding: "12px 15px", textAlign: "center" }}>
                      {t.status === "Menunggu" && (
                        <button onClick={() => setSelectedTicket(t)} style={{ background: "#3182ce", color: "white", border: "none", padding: "8px 15px", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: "pointer", boxShadow: "0 4px 6px rgba(49,130,206,0.2)" }}>
                          Mulai Kerjakan
                        </button>
                      )}
                      {t.status === "Sedang Dikerjakan" && (
                        <button onClick={() => handleSelesai(t.id)} style={{ background: "#38a169", color: "white", border: "none", padding: "8px 15px", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: "pointer", boxShadow: "0 4px 6px rgba(56,161,105,0.2)" }}>
                          Tandai Selesai
                        </button>
                      )}
                      {t.status === "Selesai" && (
                        <span style={{ fontSize: "12px", fontWeight: "bold", color: "#a0aec0" }}>Closed</span>
                      )}
                    </td>
                  </tr>
                )) : <tr><td colSpan={4} style={{ padding: "50px", textAlign: "center", color: "#a0aec0" }}>Belum ada laporan kerusakan masuk.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* 🔹 MODAL KERJAKAN TIKET */}
      {selectedTicket && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", backdropFilter: "blur(5px)" }}>
          <div style={{ background: "white", padding: "25px", borderRadius: "20px", width: "100%", maxWidth: "500px" }}>
            <h2 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "18px" }}>🧑‍🔧 Update Pekerjaan</h2>
            <p style={{ fontSize: "13px", color: "#718096", marginBottom: "20px" }}>
              Anda akan memproses perbaikan untuk <strong>{selectedTicket.lokasi}</strong>. Silakan lampirkan foto dokumentasi pengerjaan.
            </p>

            <form onSubmit={handleKerjakan} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>URL Foto Proses Perbaikan *</label>
                <input type="url" required value={fotoProses} onChange={(e) => setFotoProses(e.target.value)} placeholder="https://contoh.com/foto-perbaikan.jpg" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc" }} />
                <span style={{ fontSize: "10px", color: "#a0aec0" }}>*Untuk sementara gunakan link/URL foto (Google Drive/Imgur).</span>
              </div>
              
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" disabled={isLoading} style={{ flex: 1, padding: "12px", background: isLoading ? "#a0aec0" : "#3182ce", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: isLoading ? "not-allowed" : "pointer" }}>
                  {isLoading ? "Menyimpan..." : "Simpan & Proses"}
                </button>
                <button type="button" onClick={() => { setSelectedTicket(null); setFotoProses(""); }} style={{ padding: "12px 20px", background: "#edf2f7", color: "#4a5568", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" }}>Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}