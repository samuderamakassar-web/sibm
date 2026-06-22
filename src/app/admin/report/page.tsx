"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase"; // PERBAIKAN: Path yang benar

// --- INTERFACES ---
interface HelpdeskTicket {
  id: string;
  lokasi: string;
  deskripsi: string;
  status: string;
  waktu_lapor: Timestamp | null;
}

interface PurchaseRequest {
  id: string;
  nama_barang: string;
  sisa_stok: number;
  status: string;
  waktu_pengajuan: Timestamp | null;
}

interface VisitorLog {
  id: string;
  nama: string;
  instansi_dept: string;
  waktu_masuk: Timestamp | null;
}

export default function LaporanBulananPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState(""); 

  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [purchases, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [visitors, setVisitors] = useState<VisitorLog[]>([]);

  useEffect(() => {
    const role = localStorage.getItem("pic_role") || "";
    const nama = localStorage.getItem("pic_nama") || "Admin GA";
    
    if (!role.includes("Admin") && !role.includes("Koordinator")) {
      alert("Akses Ditolak! Halaman ini khusus Administrator.");
      router.push("/dashboard");
      return;
    }
    
    // PERBAIKAN: Menggunakan setTimeout untuk menghindari "cascading renders" linter error
    setTimeout(() => {
      setAdminName(nama);
      setSelectedMonth(new Date().toISOString().slice(0, 7));
      setIsReady(true);
    }, 0);
  }, [router]);

  useEffect(() => {
    if (!isReady || !selectedMonth) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const tSnap = await getDocs(collection(db, "helpdesk_tickets"));
        const tData: HelpdeskTicket[] = [];
        tSnap.forEach(docSnap => {
          const data = docSnap.data() as Partial<HelpdeskTicket>;
          if (data.waktu_lapor && typeof data.waktu_lapor.toDate === 'function') {
            const yyyyMM = data.waktu_lapor.toDate().toISOString().slice(0, 7);
            if (yyyyMM === selectedMonth) tData.push({ id: docSnap.id, ...data } as HelpdeskTicket);
          }
        });
        setTickets(tData);

        const pSnap = await getDocs(collection(db, "purchase_requests"));
        const pData: PurchaseRequest[] = [];
        pSnap.forEach(docSnap => {
          const data = docSnap.data() as Partial<PurchaseRequest>;
          if (data.waktu_pengajuan && typeof data.waktu_pengajuan.toDate === 'function') {
            const yyyyMM = data.waktu_pengajuan.toDate().toISOString().slice(0, 7);
            if (yyyyMM === selectedMonth) pData.push({ id: docSnap.id, ...data } as PurchaseRequest);
          }
        });
        setPurchaseRequests(pData);

        const vSnap = await getDocs(collection(db, "security_visitor_logs"));
        const vData: VisitorLog[] = [];
        vSnap.forEach(docSnap => {
          const data = docSnap.data() as Partial<VisitorLog>;
          if (data.waktu_masuk && typeof data.waktu_masuk.toDate === 'function') {
            const yyyyMM = data.waktu_masuk.toDate().toISOString().slice(0, 7);
            if (yyyyMM === selectedMonth) vData.push({ id: docSnap.id, ...data } as VisitorLog);
          }
        });
        setVisitors(vData);

      } catch (error) {
        console.error("Gagal menarik laporan:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedMonth, isReady]);

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const formatTanggalIndo = (yyyyMM: string) => {
    if (!yyyyMM) return "-";
    const [year, month] = yyyyMM.split("-");
    const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${namaBulan[parseInt(month) - 1]} ${year}`;
  };

  const formatTanggalTabel = (ts: Timestamp | null) => {
    if (!ts || typeof ts.toDate !== 'function') return "-";
    return new Date(ts.toDate()).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  };

  if (!isReady || !selectedMonth) return null;

  return (
    <div style={{ backgroundColor: "#f1f5f9", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 CSS KHUSUS UNTUK CETAK */}
      {/* PERBAIKAN: Menggunakan dangerouslySetInnerHTML */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body { background: white !important; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .print-area { box-shadow: none !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; padding: 0 !important; border-radius: 0 !important; }
          table { width: 100% !important; page-break-inside: auto; border-collapse: collapse; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th { background-color: #f7fafc !important; -webkit-print-color-adjust: exact; color: #000 !important; }
          * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
        }
        `
      }} />

      {/* 🔹 TOP BAR NAVBAR (HANYA DI LAYAR) */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Control Panel</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 Executive: {adminName}
        </div>
      </div>

      {/* 🔹 HERO SECTION (HANYA DI LAYAR) */}
      <div className="no-print" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)", padding: "40px 20px 60px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(59, 130, 246, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>AUTOMATED REPORT GENERATOR</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Tarik data operasional dan logistik secara otomatis menjadi format cetak A4 siap presentasi</p>
      </div>

      {/* 🔹 KONTROL PANEL (HANYA DI LAYAR) */}
      <div className="no-print" style={{ maxWidth: "210mm", margin: "-30px auto 20px", background: "white", padding: "20px 25px", borderRadius: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", position: "relative", zIndex: 10, border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div style={{ background: "#eff6ff", padding: "10px", borderRadius: "10px", fontSize: "20px" }}>📅</div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#718096", marginBottom: "4px" }}>Filter Periode Laporan:</label>
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: "10px 15px", borderRadius: "8px", border: "1px solid #cbd5e0", fontWeight: "bold", outline: "none", fontSize: "14px", color: "#1e3a8a", background: "#f8fafc" }} />
          </div>
        </div>
        <button onClick={handlePrint} disabled={isLoading} style={{ background: "#2563eb", color: "white", border: "none", padding: "15px 25px", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: isLoading ? "not-allowed" : "pointer", boxShadow: "0 4px 10px rgba(37, 99, 235, 0.3)", transition: "0.2s" }}>
          {isLoading ? "🔄 Menyiapkan Data..." : "🖨️ Cetak / Simpan PDF"}
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 📄 KERTAS LAPORAN A4 (MUNCUL DI LAYAR DAN DI KERTAS CETAK)            */}
      {/* ==================================================================== */}
      <div className="print-area" style={{ maxWidth: "210mm", minHeight: "297mm", margin: "0 auto", background: "white", padding: "40px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", borderRadius: "8px", boxSizing: "border-box", border: "1px solid #cbd5e0" }}>
        
        {/* KOP SURAT */}
        <div style={{ borderBottom: "3px solid #1e293b", paddingBottom: "15px", marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ margin: "0 0 5px 0", fontSize: "26px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "1px" }}>LAPORAN GENERAL AFFAIRS</h1>
            <p style={{ margin: 0, fontSize: "14px", color: "#475569", fontWeight: "bold" }}>Building Management & Operasional Fasilitas</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Periode Laporan</p>
            <h2 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>{formatTanggalIndo(selectedMonth)}</h2>
          </div>
        </div>

        {/* RINGKASAN EKSEKUTIF */}
        <div style={{ display: "flex", gap: "20px", marginBottom: "40px" }}>
          <div style={{ flex: 1, border: "1px solid #e2e8f0", padding: "20px", borderRadius: "12px", textAlign: "center", background: "#fef2f2" }}>
            <div style={{ fontSize: "11px", color: "#991b1b", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>Kerusakan Gedung</div>
            <div style={{ fontSize: "32px", fontWeight: "900", color: "#b91c1c", marginTop: "8px" }}>{tickets.length}</div>
          </div>
          <div style={{ flex: 1, border: "1px solid #e2e8f0", padding: "20px", borderRadius: "12px", textAlign: "center", background: "#fff7ed" }}>
            <div style={{ fontSize: "11px", color: "#9a3412", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>Pengadaan Barang</div>
            <div style={{ fontSize: "32px", fontWeight: "900", color: "#c2410c", marginTop: "8px" }}>{purchases.length}</div>
          </div>
          <div style={{ flex: 1, border: "1px solid #e2e8f0", padding: "20px", borderRadius: "12px", textAlign: "center", background: "#eff6ff" }}>
            <div style={{ fontSize: "11px", color: "#1e40af", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>Akses Tamu Eksternal</div>
            <div style={{ fontSize: "32px", fontWeight: "900", color: "#1d4ed8", marginTop: "8px" }}>{visitors.length}</div>
          </div>
        </div>

        {/* BAGIAN 1: KERUSAKAN FASILITAS */}
        <div style={{ marginBottom: "40px" }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#1e293b", borderBottom: "2px solid #e2e8f0", paddingBottom: "8px", textTransform: "uppercase" }}>1. Rekapitulasi Kerusakan & Pemeliharaan Gedung</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", border: "1px solid #cbd5e1" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: "12px 10px", border: "1px solid #cbd5e1", width: "15%", color: "#334155" }}>Tanggal</th>
                <th style={{ padding: "12px 10px", border: "1px solid #cbd5e1", width: "25%", color: "#334155" }}>Lokasi</th>
                <th style={{ padding: "12px 10px", border: "1px solid #cbd5e1", width: "40%", color: "#334155" }}>Deskripsi Kendala</th>
                <th style={{ padding: "12px 10px", border: "1px solid #cbd5e1", width: "20%", color: "#334155" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length > 0 ? tickets.map(t => (
                <tr key={t.id}>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", color: "#475569" }}>{formatTanggalTabel(t.waktu_lapor)}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontWeight: "bold" }}>{t.lokasi}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", color: "#334155" }}>{t.deskripsi}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontWeight: "bold" }}>{t.status}</td>
                </tr>
              )) : <tr><td colSpan={4} style={{ padding: "20px", textAlign: "center", border: "1px solid #cbd5e1", color: "#94a3b8", fontStyle: "italic" }}>Nihil / Tidak ada laporan kerusakan di bulan ini.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* BAGIAN 2: PENGADAAN BARANG */}
        <div style={{ marginBottom: "40px" }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#1e293b", borderBottom: "2px solid #e2e8f0", paddingBottom: "8px", textTransform: "uppercase" }}>2. Pengajuan & Pengadaan Barang Logistik (OB & CS)</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", border: "1px solid #cbd5e1" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: "12px 10px", border: "1px solid #cbd5e1", width: "15%", color: "#334155" }}>Tanggal</th>
                <th style={{ padding: "12px 10px", border: "1px solid #cbd5e1", width: "45%", color: "#334155" }}>Nama Barang Logistik</th>
                <th style={{ padding: "12px 10px", border: "1px solid #cbd5e1", width: "15%", textAlign: "center", color: "#334155" }}>Sisa Limit</th>
                <th style={{ padding: "12px 10px", border: "1px solid #cbd5e1", width: "25%", color: "#334155" }}>Status Purchase Order</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length > 0 ? purchases.map(p => (
                <tr key={p.id}>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", color: "#475569" }}>{formatTanggalTabel(p.waktu_pengajuan)}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontWeight: "bold" }}>{p.nama_barang}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", color: "#b91c1c", fontWeight: "bold" }}>{p.sisa_stok}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontWeight: "bold" }}>{p.status}</td>
                </tr>
              )) : <tr><td colSpan={4} style={{ padding: "20px", textAlign: "center", border: "1px solid #cbd5e1", color: "#94a3b8", fontStyle: "italic" }}>Nihil / Tidak ada pengadaan barang di bulan ini.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* FOOTER PENGESAHAN */}
        <div style={{ marginTop: "60px", display: "flex", justifyContent: "flex-end" }}>
          <div style={{ textAlign: "center", width: "240px" }}>
            <p style={{ margin: "0 0 80px 0", fontSize: "13px", color: "#475569" }}>Dibuat & Disahkan Oleh,</p>
            <p style={{ margin: 0, fontWeight: "900", textDecoration: "underline", fontSize: "15px", color: "#0f172a", textTransform: "uppercase" }}>{adminName}</p>
            <p style={{ margin: "5px 0 0 0", fontSize: "12px", color: "#64748b" }}>General Affairs Management</p>
          </div>
        </div>

      </div>
    </div>
  );
}