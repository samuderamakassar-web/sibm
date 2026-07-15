"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";

interface ReportSBO {
  id: string;
  nama_pelapor: string;
  tanggal_kejadian: string;
  unit_bisnis: string;
  lokasi: string;
  kategori_temuan: string;
  detail_temuan: string;
  penyebab: string;
  action_taken: string;
  komitmen_pelaku?: string;
  konsekuensi?: string;
  status_temuan: string;
  foto_bukti: string;
  foto_after?: string;
  tanggal_closed?: string;
  waktu_lapor: Timestamp | null;
}

export default function DashboardQHSE() {
  const router = useRouter();
  const [picName, setPicName] = useState("");
  const [isReady, setIsReady] = useState(false);

  // State Tabel & Laporan
  const [reports, setReports] = useState<ReportSBO[]>([]);
  const [filterStatus, setFilterStatus] = useState("Semua");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // State Modal Closing
  const [selectedReport, setSelectedReport] = useState<ReportSBO | null>(null);
  const [fotoAfter, setFotoAfter] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const showToast = useToast();
  const confirm = useConfirm();
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("pic_role");
    const nama = localStorage.getItem("pic_nama");
    const dept = localStorage.getItem("pic_dept");
    
    if (!role || dept !== "QHSE") {
      showToast("Akses Ditolak! Halaman ini khusus divisi QHSE.", "error");
      router.push("/");
      return;
    }
    setTimeout(() => { setPicName(nama || "Staf QHSE"); setIsReady(true); }, 0);

    const q = query(collection(db, "qhse_sbo_reports"), orderBy("waktu_lapor", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReportSBO)));
    });
    return () => unsub();
  }, [router]);

  // ===============================================
  // FUNGSI KOMPRESI FOTO AFTER
  // ==============================================

  async function uploadToCloudinary(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
    formData.append("folder", "sibm/qhse-sbo");

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
    const data = await res.json();
    return data.secure_url as string;
  }

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
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setIsUploadingFoto(true);
          try {
            const url = await uploadToCloudinary(blob);
            setFotoAfter(url);
          } catch (err) {
            console.error(err);
            showToast("Gagal upload foto, coba lagi.", "error");
          } finally {
            setIsUploadingFoto(false);
          }
        }, "image/jpeg", 0.6);
      };
      if (typeof ev.target?.result === 'string') img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // ===============================================
  // FUNGSI EXPORT EXCEL (CSV FORMAT)
  // ===============================================
  const handleExportExcel = () => {
    let filtered = reports;
    if (startDate) filtered = filtered.filter(r => r.tanggal_kejadian >= startDate);
    if (endDate) filtered = filtered.filter(r => r.tanggal_kejadian <= endDate);
    if (filterStatus !== "Semua") filtered = filtered.filter(r => r.status_temuan === filterStatus);

    if (filtered.length === 0) return showToast("Tidak ada data di rentang waktu/status tersebut untuk diexport.", "warning");

    const headers = ["ID Laporan", "Tanggal Kejadian", "Pelapor", "Lokasi", "Kategori", "Detail Issue", "Penyebab", "Tindakan Awal (Action Taken)", "Status", "Tanggal Selesai (Closed)"];
    
    // Gabungkan Header & Data dengan pemisah Koma (standar Excel CSV)
    const csvContent = [
      headers.join(","),
      ...filtered.map(r => [
        `SBO-${r.id.substring(0,5)}`,
        r.tanggal_kejadian,
        `"${r.nama_pelapor}"`,
        `"${r.lokasi}"`,
        r.kategori_temuan,
        `"${r.detail_temuan.replace(/"/g, '""')}"`, // Mencegah bentrok koma/kutip
        `"${r.penyebab.replace(/"/g, '""')}"`,
        `"${r.action_taken.replace(/"/g, '""')}"`,
        r.status_temuan,
        r.tanggal_closed || "Belum Selesai"
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_SBO_QHSE_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ===============================================
  // FUNGSI UPDATE TIKET MENJADI CLOSED
  // ===============================================
  const handleCloseTicket = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedReport) return;
  if (isUploadingFoto) return showToast("Tunggu foto selesai diunggah dulu.", "warning");

  const yakin = await confirm({
    title: "Tutup Laporan SBO",
    message: "Laporan yang sudah ditutup tidak bisa dibuka kembali. Lanjutkan?",
    confirmText: "Ya, Tutup Laporan",
    variant: "danger"
  });
  if (!yakin) return;

  setIsUpdating(true);
  try {
    const reportRef = doc(db, "qhse_sbo_reports", selectedReport.id);
    await updateDoc(reportRef, {
      status_temuan: "Close",
      tanggal_closed: new Date().toISOString().split("T")[0],
      foto_after: fotoAfter || null
    });

    showToast("Laporan berhasil ditutup!", "success");
    setSelectedReport(null);
    setFotoAfter("");
  } catch (error) {
    console.error(error);
    showToast("Gagal memperbarui status.", "error");
  } finally {
    setIsUpdating(false);
  }
};

  // FILTERING LOGIC
  const displayedReports = reports.filter(r => filterStatus === "Semua" || r.status_temuan === filterStatus);

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <h2 style={{ margin: 0, color: "#22543d", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}><span>🛡️</span> QHSE Command Center</h2>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ background: "#f0fff4", color: "#22543d", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #c6f6d5" }}>👷 {picName}</div>
          <button onClick={() => { localStorage.clear(); router.push("/"); }} style={{ background: "#e53e3e", color: "white", border: "none", padding: "8px 15px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>Logout</button>
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #1c4532 0%, #2f855a 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(47, 133, 90, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>SAFETY BEHAVIOR OBSERVATION</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Database Pemantauan Keselamatan Kerja Gedung (SBO)</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        {/* KONTROL PANEL (FILTER & EXPORT) */}
        <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", marginBottom: "20px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "15px" }}>
          
          <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "bold", color: "#718096", marginBottom: "5px", textTransform: "uppercase" }}>Filter Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "13px", fontWeight: "bold", color: "#2d3748", outline: "none", cursor: "pointer" }}>
                <option value="Semua">Tampilkan Semua Status</option>
                <option value="Open">🔴 Status: OPEN (Menunggu Tindakan)</option>
                <option value="Close">🟢 Status: CLOSE (Selesai)</option>
              </select>
            </div>
            
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "bold", color: "#718096", marginBottom: "5px", textTransform: "uppercase" }}>Dari Tanggal</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "13px", outline: "none" }} />
              </div>
              <span style={{ marginTop: "20px", fontWeight: "bold", color: "#a0aec0" }}>-</span>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "bold", color: "#718096", marginBottom: "5px", textTransform: "uppercase" }}>Sampai</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "13px", outline: "none" }} />
              </div>
            </div>
          </div>

          <button onClick={handleExportExcel} style={{ background: "#276749", color: "white", padding: "12px 20px", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(39, 103, 73, 0.3)" }}>
            📊 Export Data Laporan (.CSV)
          </button>
        </div>

        {/* TABEL SBO */}
        <div style={{ background: "white", padding: "20px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Tgl Kejadian & Lokasi</th>
                <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Kategori & Issue</th>
                <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Pelapor</th>
                <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Status Issue</th>
                <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Aksi Tinjauan</th>
              </tr>
            </thead>
            <tbody>
              {displayedReports.length > 0 ? displayedReports.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid #edf2f7" }}>
                  <td style={{ padding: "12px 15px" }}>
                    <div style={{ fontWeight: "bold", color: "#2d3748" }}>{r.tanggal_kejadian}</div>
                    <div style={{ color: "#718096", fontSize: "11px", marginTop: "4px" }}>📍 {r.lokasi}</div>
                  </td>
                  <td style={{ padding: "12px 15px" }}>
                    <span style={{ background: r.kategori_temuan.includes("Unsafe Act") ? "#fed7d7" : "#feebc8", color: r.kategori_temuan.includes("Unsafe Act") ? "#9b2c2c" : "#9c4221", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold" }}>{r.kategori_temuan}</span>
                    <div style={{ color: "#4a5568", marginTop: "6px", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "250px" }}>{r.detail_temuan}</div>
                  </td>
                  <td style={{ padding: "12px 15px", color: "#4a5568", fontWeight: "bold" }}>👤 {r.nama_pelapor}</td>
                  <td style={{ padding: "12px 15px", textAlign: "center" }}>
                    <span style={{ background: r.status_temuan === "Close" ? "#c6f6d5" : "#fed7d7", color: r.status_temuan === "Close" ? "#22543d" : "#c53030", padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold" }}>{r.status_temuan}</span>
                    {r.tanggal_closed && <div style={{ fontSize: "10px", color: "#38a169", marginTop: "5px" }}>Selesai: {r.tanggal_closed}</div>}
                  </td>
                  <td style={{ padding: "12px 15px", textAlign: "center" }}>
                    <button onClick={() => setSelectedReport(r)} style={{ background: "#ebf8ff", color: "#3182ce", border: "1px solid #bee3f8", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                      🔍 Tinjau Detail
                    </button>
                  </td>
                </tr>
              )) : <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#a0aec0" }}>Tidak ada laporan SBO yang ditemukan pada filter ini.</td></tr>}
            </tbody>
          </table>
        </div>

      </div>

      {/* ============================================================== */}
      {/* MODAL TINJAUAN DETAIL & CLOSE TIKET SBO */}
      {/* ============================================================== */}
      {selectedReport && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(5px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          <div style={{ background: "white", width: "100%", maxWidth: "800px", borderRadius: "24px", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
            
            <div style={{ background: "#22543d", color: "white", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: "0 0 5px 0", fontSize: "18px" }}>Detail Laporan SBO</h2>
                <div style={{ fontSize: "12px", opacity: 0.8 }}>ID: SBO-{selectedReport.id.substring(0,8).toUpperCase()}</div>
              </div>
              <button onClick={() => setSelectedReport(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer" }}>✖</button>
            </div>

            <div style={{ padding: "25px", overflowY: "auto", flex: 1, background: "#f8fafc" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "#718096", fontWeight: "bold" }}>NAMA PELAPOR</div>
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "#2d3748" }}>{selectedReport.nama_pelapor}</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#718096", fontWeight: "bold" }}>LOKASI & TANGGAL</div>
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "#2d3748" }}>{selectedReport.lokasi} • {selectedReport.tanggal_kejadian}</div>
                </div>
              </div>

              <div style={{ background: "white", border: "1px solid #e2e8f0", padding: "15px", borderRadius: "12px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#718096", fontWeight: "bold", marginBottom: "5px" }}>KATEGORI & DETAIL ISSUE</div>
                <span style={{ background: "#feebc8", color: "#9c4221", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", marginBottom: "10px", display: "inline-block" }}>{selectedReport.kategori_temuan}</span>
                <p style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#2d3748" }}>{selectedReport.detail_temuan}</p>
                <div style={{ fontSize: "11px", color: "#718096", fontWeight: "bold", marginBottom: "2px", marginTop: "15px" }}>PENYEBAB:</div>
                <div style={{ fontSize: "13px", color: "#4a5568" }}>{selectedReport.penyebab}</div>
              </div>

              {selectedReport.kategori_temuan.includes("Unsafe Act") && selectedReport.komitmen_pelaku && (
                <div style={{ background: "#fff5f5", border: "1px solid #fed7d7", padding: "15px", borderRadius: "12px", marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", color: "#c53030", fontWeight: "bold", marginBottom: "5px" }}>KOMITMEN & KONSEKUENSI PELANGGAR</div>
                  <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#2d3748" }}><strong>Komitmen:</strong> {selectedReport.komitmen_pelaku}</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#2d3748" }}><strong>Konsekuensi:</strong> {selectedReport.konsekuensi}</p>
                </div>
              )}

              {/* SECTION FOTO BUKTI SEBELUM vs SESUDAH */}
              <div style={{ display: "flex", gap: "15px", marginBottom: "20px" }}>
                <div style={{ flex: 1, background: "white", padding: "10px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "11px", color: "#e53e3e", fontWeight: "bold", marginBottom: "8px", textAlign: "center" }}>FOTO BUKTI BAHAYA</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedReport.foto_bukti} alt="Bukti Bahaya" style={{ width: "100%", height: "200px", objectFit: "contain", borderRadius: "8px", background: "#edf2f7" }} />
                </div>
                
                <div style={{ flex: 1, background: "white", padding: "10px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "11px", color: "#38a169", fontWeight: "bold", marginBottom: "8px", textAlign: "center" }}>FOTO AFTER (TELAH AMAN)</div>
                  {selectedReport.foto_after ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={selectedReport.foto_after} alt="Bukti Aman" style={{ width: "100%", height: "200px", objectFit: "contain", borderRadius: "8px", background: "#edf2f7" }} />
                  ) : (
                    <div style={{ width: "100%", height: "200px", background: "#f8fafc", borderRadius: "8px", display: "flex", justifyContent: "center", alignItems: "center", color: "#a0aec0", fontSize: "12px", border: "1px dashed #cbd5e0" }}>Belum ada foto perbaikan.</div>
                  )}
                </div>
              </div>

              {/* AREA UPDATE STATUS OLEH QHSE */}
              {selectedReport.status_temuan === "Open" ? (
                <form onSubmit={handleCloseTicket} style={{ background: "white", border: "1px solid #9ae6b4", padding: "20px", borderRadius: "12px", marginTop: "10px" }}>
                  <h3 style={{ margin: "0 0 15px 0", color: "#22543d", fontSize: "15px" }}>🟢 Tindakan Penyelesaian (Close Report)</h3>
                  
                  <div style={{ marginBottom: "15px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568", marginBottom: "5px", display: "block" }}>Unggah Foto Kondisi Terkini (After) *</label>
                    <input type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploadingFoto} required style={{ padding: "10px", border: "1px solid #cbd5e0", borderRadius: "8px", width: "100%", fontSize: "12px" }} />
                    {isUploadingFoto && <div style={{ fontSize: "11px", color: "#d69e2e", marginTop: "5px", fontWeight: "bold" }}>⏳ Sedang mengunggah foto...</div>}
                    {fotoAfter && !isUploadingFoto && <div style={{ fontSize: "11px", color: "#38a169", marginTop: "5px", fontWeight: "bold" }}>✓ Foto siap diunggah</div>}
                  </div>

                  <button type="submit" disabled={isUpdating} style={{ width: "100%", padding: "15px", background: isUpdating ? "#a0aec0" : "#2f855a", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: isUpdating ? "not-allowed" : "pointer" }}>
                    {isUpdating ? "Memproses..." : "Tutup Laporan Bahaya Ini"}
                  </button>
                </form>
              ) : (
                <div style={{ background: "#f0fff4", color: "#22543d", padding: "15px", borderRadius: "12px", textAlign: "center", border: "1px solid #c6f6d5", fontWeight: "bold" }}>
                  ✅ Laporan ini telah ditutup/diselesaikan pada {selectedReport.tanggal_closed}.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}