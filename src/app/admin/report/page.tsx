"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";

// ==========================================
// INTERFACES UNTUK DATA RINCIAN
// ==========================================
interface BaseRecord {
  id: string;
  waktu_lapor?: Timestamp | null;
  waktu_request?: Timestamp | null;
}

export default function ExecutiveReportPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState<string>("");
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // States Filter Periode
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth()); // 0 = Jan, 11 = Des
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());

  const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const tahunTersedia = [2024, 2025, 2026, 2027, 2028];

  // States Data Analitik (Angka Summary)
  const [helpdeskStats, setHelpdeskStats] = useState({ total: 0, selesai: 0, proses: 0, menunggu: 0 });
  const [sboStats, setSboStats] = useState({ total: 0, open: 0, close: 0, unsafeCondition: 0, unsafeAct: 0, nearMiss: 0, lingkungan: 0 });
  const [atkStats, setAtkStats] = useState({ total: 0, menunggu: 0, selesai: 0 });
  const [overtimeStats, setOvertimeStats] = useState({ total: 0, approved: 0, rejected: 0, pending: 0 });

  // States Data Aktual (Tabel Detail)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [helpdeskList, setHelpdeskList] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sboList, setSboList] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [atkList, setAtkList] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [overtimeList, setOvertimeList] = useState<any[]>([]);

  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    const dept = localStorage.getItem("pic_dept");

    if (!nama || dept !== "Admin GA") {
      router.push("/shift-checkin");
      return;
    }

    const fetchAnalyticsData = async () => {
      setIsLoading(true);
      try {
        // Tentukan batas waktu berdasarkan pilihan dropdown
        const startTs = new Date(selectedYear, selectedMonth, 1).getTime();
        const endTs = new Date(selectedYear, selectedMonth + 1, 1).getTime();

        // 1. Tarik Data Helpdesk
        const snapHelpdesk = await getDocs(collection(db, "helpdesk_tickets"));
        let hTotal = 0, hSelesai = 0, hProses = 0, hMenunggu = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hList: any[] = [];
        
        snapHelpdesk.forEach(doc => {
          const d = doc.data();
          const ts = (d.waktu_lapor as Timestamp)?.toMillis() || 0;
          if (ts >= startTs && ts < endTs) {
            hTotal++;
            if (d.status === "Selesai") hSelesai++;
            else if (d.status === "Sedang Dikerjakan") hProses++;
            else hMenunggu++;
            hList.push({ id: doc.id, ...d });
          }
        });
        setHelpdeskStats({ total: hTotal, selesai: hSelesai, proses: hProses, menunggu: hMenunggu });
        setHelpdeskList(hList.sort((a, b) => b.waktu_lapor?.toMillis() - a.waktu_lapor?.toMillis()));

        // 2. Tarik Data SBO
        const snapSBO = await getDocs(collection(db, "qhse_sbo_reports"));
        let sTotal = 0, sOpen = 0, sClose = 0, sUC = 0, sUA = 0, sNM = 0, sLing = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sList: any[] = [];

        snapSBO.forEach(doc => {
          const d = doc.data();
          const ts = (d.waktu_lapor as Timestamp)?.toMillis() || 0;
          if (ts >= startTs && ts < endTs) {
            sTotal++;
            if (d.status_temuan === "Open") sOpen++; else sClose++;
            if (d.kategori_temuan?.includes("Unsafe Condition")) sUC++;
            else if (d.kategori_temuan?.includes("Unsafe Act")) sUA++;
            else if (d.kategori_temuan?.includes("Near Miss")) sNM++;
            else sLing++;
            sList.push({ id: doc.id, ...d });
          }
        });
        setSboStats({ total: sTotal, open: sOpen, close: sClose, unsafeCondition: sUC, unsafeAct: sUA, nearMiss: sNM, lingkungan: sLing });
        setSboList(sList.sort((a, b) => b.waktu_lapor?.toMillis() - a.waktu_lapor?.toMillis()));

        // 3. Tarik Data ATK
        const snapATK = await getDocs(collection(db, "ga_atk_requests"));
        let aTotal = 0, aMenunggu = 0, aSelesai = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aList: any[] = [];

        snapATK.forEach(doc => {
          const d = doc.data();
          const ts = (d.waktu_request as Timestamp)?.toMillis() || 0;
          if (ts >= startTs && ts < endTs) {
            aTotal++;
            if (d.status?.includes("Selesai")) aSelesai++;
            else aMenunggu++;
            aList.push({ id: doc.id, ...d });
          }
        });
        setAtkStats({ total: aTotal, menunggu: aMenunggu, selesai: aSelesai });
        setAtkList(aList.sort((a, b) => b.waktu_request?.toMillis() - a.waktu_request?.toMillis()));

        // 4. Tarik Data Overtime
        const snapOvertime = await getDocs(collection(db, "ga_overtime_requests"));
        let oTotal = 0, oApp = 0, oRej = 0, oPen = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oList: any[] = [];

        snapOvertime.forEach(doc => {
          const d = doc.data();
          const ts = (d.waktu_request as Timestamp)?.toMillis() || 0;
          if (ts >= startTs && ts < endTs) {
            oTotal++;
            if (d.status === "Approved") oApp++;
            else if (d.status === "Rejected") oRej++;
            else oPen++;
            oList.push({ id: doc.id, ...d });
          }
        });
        setOvertimeStats({ total: oTotal, approved: oApp, rejected: oRej, pending: oPen });
        setOvertimeList(oList.sort((a, b) => b.waktu_request?.toMillis() - a.waktu_request?.toMillis()));

      } catch (error) {
        console.error("Gagal menarik data analitik:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    setTimeout(() => {
      setAdminName(nama);
      setIsReady(true);
      fetchAnalyticsData();
    }, 0);
  }, [router, selectedMonth, selectedYear]); // Trigger ulang jika bulan/tahun berubah

  const handlePrint = () => {
    window.print();
  };

  const calcPercent = (value: number, total: number) => total === 0 ? 0 : Math.round((value / total) * 100);
  const formatTgl = (ts: Timestamp | null | undefined) => ts ? new Date(ts.toDate()).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      
      {/* 💡 CSS RESPONSIVE & ANTI-OVERFLOW MAGIC */}
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }
        
        /* Layout Desktop Murni */
        .header-bar { display: flex; justify-content: space-between; align-items: center; padding: 15px 30px; background: white; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 50; }
        .header-controls { display: flex; gap: 10px; align-items: center; }
        .metric-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
        .chart-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        
        /* Styling Tabel Screen */
        @media screen {
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; background: white; }
          th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; color: #4a5568; }
        }

        /* 📱 MEDIA QUERY UNTUK HP */
        @media (max-width: 768px) {
          .header-bar { padding: 15px; flex-direction: column; gap: 15px; align-items: flex-start; }
          .header-controls { width: 100%; justify-content: space-between; flex-wrap: wrap; }
          
          /* Merombak Grid Atas */
          .metric-cards { grid-template-columns: 1fr 1fr !important; }
          .chart-cards { grid-template-columns: 1fr !important; }
          
          /* Menyulap Tabel Menjadi Kartu Data-Label (Magic!) */
          .detail-section table, .detail-section tbody { display: block; width: 100%; }
          .detail-section thead { display: none; } /* Sembunyikan Header Kolom */
          .detail-section tr { 
            display: block; margin-bottom: 15px; background: white; 
            border: 1px solid #e2e8f0; border-radius: 12px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.05); 
          }
          .detail-section td { 
            display: flex; justify-content: space-between; align-items: flex-start; 
            border: none; border-bottom: 1px dashed #edf2f7 !important; 
            text-align: right; padding: 12px 15px !important; gap: 10px;
          }
          .detail-section td:last-child { border-bottom: none !important; }
          
          /* Label Otomatis di Sebelah Kiri menggunakan Atribut data-label */
          .detail-section td::before { 
            content: attr(data-label); font-weight: 800; color: #718096; 
            text-transform: uppercase; font-size: 10px; text-align: left; 
            flex-shrink: 0; max-width: 40%;
          }
          .detail-section td > div, .detail-section td > span, .detail-section td > b { 
            text-align: right; word-break: break-word; 
          }
        }

        /* CSS KHUSUS PRINT PDF (TIDAK BERUBAH) */
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          html, body { background-color: white !important; -webkit-print-color-adjust: exact; font-size: 11px; }
          .no-print { display: none !important; }
          .print-area { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; }
          .chart-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .detail-section { page-break-before: auto; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          th, td { border: 1px solid #cbd5e0 !important; padding: 6px 8px !important; text-align: left; display: table-cell !important; }
          th { background-color: #f1f5f9 !important; font-weight: bold !important; color: #2d3748 !important; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR (NO PRINT) */}
      <div className="no-print header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Admin Desk</span>
        </div>
        
        {/* 💡 KONTROL PERIODE BARU */}
        <div className="header-controls">
          <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "#f1f5f9", padding: "6px 12px", borderRadius: "8px", border: "1px solid #cbd5e0" }}>
            <span style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568" }}>📅 Periode:</span>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} style={{ border: "none", background: "transparent", fontWeight: "bold", color: "#2b6cb0", outline: "none", cursor: "pointer" }}>
              {namaBulan.map((bln, idx) => <option key={idx} value={idx}>{bln}</option>)}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} style={{ border: "none", background: "transparent", fontWeight: "bold", color: "#2b6cb0", outline: "none", cursor: "pointer" }}>
              {tahunTersedia.map((thn) => <option key={thn} value={thn}>{thn}</option>)}
            </select>
          </div>
          <button onClick={handlePrint} style={{ background: "#2b6cb0", color: "white", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}>
            🖨️ Cetak PDF
          </button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: "1000px", margin: "30px auto", padding: "0 20px", paddingBottom: "50px" }}>
        
        {/* KOP LAPORAN EKSKUTIF */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #e53e3e", paddingBottom: "15px", marginBottom: "25px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h1 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "24px", fontWeight: "900", letterSpacing: "1px", textTransform: "uppercase" }}>Executive Summary</h1>
            <p style={{ margin: "0", color: "#718096", fontSize: "13px" }}>Laporan Analitik & Rincian Data Building Management</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: "900", color: "#e53e3e", fontSize: "16px", textTransform: "uppercase" }}>
              PERIODE: {namaBulan[selectedMonth]} {selectedYear}
            </div>
            <div style={{ fontSize: "11px", color: "#a0aec0", marginTop: "4px" }}>Dihasilkan pada: {new Date().toLocaleString("id-ID")}</div>
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: "100px", color: "#a0aec0", fontWeight: "bold" }}>
            <div style={{ fontSize: "40px", marginBottom: "15px" }}>⏳</div>
            Menghitung kalkulasi data logistik & operasional...
          </div>
        ) : (
          <>
            {/* 🔹 4 KARTU METRIK UTAMA */}
            <div className="metric-cards">
              
              <div style={{ background: "white", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", borderLeft: "5px solid #3182ce" }}>
                <div style={{ color: "#718096", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Tiket Helpdesk Masuk</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "5px" }}>
                  <span style={{ fontSize: "28px", fontWeight: "900", color: "#2b6cb0" }}>{helpdeskStats.total}</span>
                  <span style={{ fontSize: "11px", color: "#4a5568", fontWeight: "bold" }}>Tiket</span>
                </div>
                <div style={{ fontSize: "10px", color: "#38a169", marginTop: "5px", fontWeight: "bold" }}>✔ {helpdeskStats.selesai} Diselesaikan</div>
              </div>

              <div style={{ background: "white", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", borderLeft: "5px solid #e53e3e" }}>
                <div style={{ color: "#718096", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Laporan SBO (Bahaya)</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "5px" }}>
                  <span style={{ fontSize: "28px", fontWeight: "900", color: "#c53030" }}>{sboStats.total}</span>
                  <span style={{ fontSize: "11px", color: "#4a5568", fontWeight: "bold" }}>Temuan</span>
                </div>
                <div style={{ fontSize: "10px", color: sboStats.open > 0 ? "#e53e3e" : "#38a169", marginTop: "5px", fontWeight: "bold" }}>{sboStats.open > 0 ? `⚠️ ${sboStats.open} OPEN` : "✔ Semua CLOSE"}</div>
              </div>

              <div style={{ background: "white", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", borderLeft: "5px solid #d53f8c" }}>
                <div style={{ color: "#718096", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Permintaan ATK</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "5px" }}>
                  <span style={{ fontSize: "28px", fontWeight: "900", color: "#97266d" }}>{atkStats.total}</span>
                  <span style={{ fontSize: "11px", color: "#4a5568", fontWeight: "bold" }}>Resi</span>
                </div>
                <div style={{ fontSize: "10px", color: "#d69e2e", marginTop: "5px", fontWeight: "bold" }}>⏳ {atkStats.menunggu} Pending</div>
              </div>

              <div style={{ background: "white", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", borderLeft: "5px solid #dd6b20" }}>
                <div style={{ color: "#718096", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Pengajuan Overtime</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "5px" }}>
                  <span style={{ fontSize: "28px", fontWeight: "900", color: "#c05621" }}>{overtimeStats.total}</span>
                  <span style={{ fontSize: "11px", color: "#4a5568", fontWeight: "bold" }}>Klaim</span>
                </div>
                <div style={{ fontSize: "10px", color: "#38a169", marginTop: "5px", fontWeight: "bold" }}>✔ {overtimeStats.approved} Disetujui</div>
              </div>

            </div>

            {/* 🔹 GRAFIK ANALITIK DETAIL */}
            <div className="chart-cards">
              
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "14px", fontWeight: "bold" }}>Rasio Penyelesaian Kerusakan (Helpdesk)</h3>
                  <div style={{ width: "100%", background: "#edf2f7", height: "20px", borderRadius: "10px", overflow: "hidden", display: "flex", marginBottom: "10px" }}>
                    <div className="chart-bar" style={{ width: `${calcPercent(helpdeskStats.selesai, helpdeskStats.total)}%`, background: "#38a169", display: "flex", justifyContent: "center", alignItems: "center", color: "white", fontSize: "10px", fontWeight: "bold" }}>
                      {calcPercent(helpdeskStats.selesai, helpdeskStats.total) > 5 ? `${calcPercent(helpdeskStats.selesai, helpdeskStats.total)}%` : ""}
                    </div>
                    <div className="chart-bar" style={{ width: `${calcPercent(helpdeskStats.proses, helpdeskStats.total)}%`, background: "#ecc94b", display: "flex", justifyContent: "center", alignItems: "center", color: "#744210", fontSize: "10px", fontWeight: "bold" }}>
                      {calcPercent(helpdeskStats.proses, helpdeskStats.total) > 5 ? `${calcPercent(helpdeskStats.proses, helpdeskStats.total)}%` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "bold" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ width:"8px", height:"8px", background:"#38a169", borderRadius:"2px"}}></span> Selesai</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ width:"8px", height:"8px", background:"#ecc94b", borderRadius:"2px"}}></span> Proses</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ width:"8px", height:"8px", background:"#e2e8f0", borderRadius:"2px"}}></span> Menunggu</div>
                  </div>
                </div>

                <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "14px", fontWeight: "bold" }}>Distribusi Persetujuan Lembur</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "bold", marginBottom: "4px", color: "#2f855a" }}>
                        <span>Approved</span><span>{overtimeStats.approved}</span>
                      </div>
                      <div style={{ width: "100%", background: "#f0fff4", height: "8px", borderRadius: "4px", overflow: "hidden" }}><div className="chart-bar" style={{ width: `${calcPercent(overtimeStats.approved, overtimeStats.total)}%`, background: "#48bb78", height: "100%" }}></div></div>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "bold", marginBottom: "4px", color: "#c53030" }}>
                        <span>Rejected</span><span>{overtimeStats.rejected}</span>
                      </div>
                      <div style={{ width: "100%", background: "#fff5f5", height: "8px", borderRadius: "4px", overflow: "hidden" }}><div className="chart-bar" style={{ width: `${calcPercent(overtimeStats.rejected, overtimeStats.total)}%`, background: "#f56565", height: "100%" }}></div></div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", height: "100%" }}>
                <h3 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "14px", fontWeight: "bold" }}>Kategori Temuan SBO</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "bold", marginBottom: "4px", color: "#4a5568" }}><span>Unsafe Act</span><span>{sboStats.unsafeAct}</span></div>
                    <div style={{ width: "100%", background: "#edf2f7", height: "12px", borderRadius: "6px", overflow: "hidden" }}><div className="chart-bar" style={{ width: `${calcPercent(sboStats.unsafeAct, sboStats.total)}%`, background: "#e53e3e", height: "100%" }}></div></div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "bold", marginBottom: "4px", color: "#4a5568" }}><span>Unsafe Condition</span><span>{sboStats.unsafeCondition}</span></div>
                    <div style={{ width: "100%", background: "#edf2f7", height: "12px", borderRadius: "6px", overflow: "hidden" }}><div className="chart-bar" style={{ width: `${calcPercent(sboStats.unsafeCondition, sboStats.total)}%`, background: "#dd6b20", height: "100%" }}></div></div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "bold", marginBottom: "4px", color: "#4a5568" }}><span>Near Miss</span><span>{sboStats.nearMiss}</span></div>
                    <div style={{ width: "100%", background: "#edf2f7", height: "12px", borderRadius: "6px", overflow: "hidden" }}><div className="chart-bar" style={{ width: `${calcPercent(sboStats.nearMiss, sboStats.total)}%`, background: "#d69e2e", height: "100%" }}></div></div>
                  </div>
                </div>
              </div>

            </div>

            {/* ========================================== */}
            {/* 🔹 BAGIAN RINCIAN DATA (TABEL) */}
            {/* ========================================== */}
            
            <div className="detail-section">
              <h2 style={{ fontSize: "16px", fontWeight: "bold", color: "#1a202c", marginBottom: "15px", borderBottom: "2px solid #e2e8f0", paddingBottom: "5px" }}>
                1. Rincian Laporan Helpdesk (Kerusakan)
              </h2>
              {helpdeskList.length > 0 ? (
                <table>
                  <thead>
                    <tr><th>Tanggal Lapor</th><th>Pelapor</th><th>Lokasi</th><th>Deskripsi</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {helpdeskList.map(h => (
                      <tr key={h.id}>
                        <td data-label="Tanggal Lapor"><div>{formatTgl(h.waktu_lapor)}</div></td>
                        <td data-label="Pelapor"><div>{h.nama_pelapor}</div></td>
                        <td data-label="Lokasi"><div>{h.lokasi}</div></td>
                        <td data-label="Deskripsi"><div>{h.deskripsi}</div></td>
                        <td data-label="Status"><div><span style={{ fontWeight: "bold", color: h.status === "Selesai" ? "#38a169" : "#dd6b20" }}>{h.status}</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ fontSize: "12px", color: "#a0aec0", fontStyle: "italic" }}>Tidak ada laporan kerusakan pada bulan ini.</p>}
            </div>

            <div className="detail-section">
              <h2 style={{ fontSize: "16px", fontWeight: "bold", color: "#1a202c", marginBottom: "15px", borderBottom: "2px solid #e2e8f0", paddingBottom: "5px" }}>
                2. Rincian Laporan SBO (Bahaya)
              </h2>
              {sboList.length > 0 ? (
                <table>
                  <thead>
                    <tr><th>Tanggal Lapor</th><th>Pelapor</th><th>Kategori</th><th>Lokasi & Detail</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {sboList.map(s => (
                      <tr key={s.id}>
                        <td data-label="Tanggal Lapor"><div>{formatTgl(s.waktu_lapor)}</div></td>
                        <td data-label="Pelapor"><div>{s.nama_pelapor}</div></td>
                        <td data-label="Kategori"><div>{s.kategori_temuan}</div></td>
                        <td data-label="Lokasi & Detail"><div><b>{s.lokasi}</b> - {s.detail_temuan}</div></td>
                        <td data-label="Status"><div><span style={{ fontWeight: "bold", color: s.status_temuan === "Open" ? "#e53e3e" : "#38a169" }}>{s.status_temuan}</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ fontSize: "12px", color: "#a0aec0", fontStyle: "italic" }}>Tidak ada laporan bahaya/SBO pada bulan ini.</p>}
            </div>

            <div className="detail-section">
              <h2 style={{ fontSize: "16px", fontWeight: "bold", color: "#1a202c", marginBottom: "15px", borderBottom: "2px solid #e2e8f0", paddingBottom: "5px" }}>
                3. Rincian Permintaan ATK
              </h2>
              {atkList.length > 0 ? (
                <table>
                  <thead>
                    <tr><th>Tanggal Request</th><th>Resi</th><th>Pemohon</th><th>Detail Barang</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {atkList.map(a => (
                      <tr key={a.id}>
                        <td data-label="Tanggal Request"><div>{formatTgl(a.waktu_request)}</div></td>
                        <td data-label="Resi"><div>{a.resi}</div></td>
                        <td data-label="Pemohon"><div>{a.nama_pemohon} ({a.departemen})</div></td>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <td data-label="Detail Barang"><div>{a.items ? a.items.map((i: any) => `${i.nama_barang} (${i.jumlah})`).join(", ") : "-"}</div></td>
                        <td data-label="Status"><div><span style={{ fontWeight: "bold", color: a.status?.includes("Selesai") ? "#38a169" : "#d69e2e" }}>{a.status}</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ fontSize: "12px", color: "#a0aec0", fontStyle: "italic" }}>Tidak ada permintaan ATK pada bulan ini.</p>}
            </div>

            <div className="detail-section">
              <h2 style={{ fontSize: "16px", fontWeight: "bold", color: "#1a202c", marginBottom: "15px", borderBottom: "2px solid #e2e8f0", paddingBottom: "5px" }}>
                4. Rincian Pengajuan Overtime
              </h2>
              {overtimeList.length > 0 ? (
                <table>
                  <thead>
                    <tr><th>Tanggal Request</th><th>Siklus / Tipe</th><th>Pemohon</th><th>Departemen</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {overtimeList.map(o => (
                      <tr key={o.id}>
                        <td data-label="Tanggal Request"><div>{formatTgl(o.waktu_request)}</div></td>
                        <td data-label="Siklus / Tipe"><div>{o.periode ? o.periode : "Gedung (Harian)"}</div></td>
                        <td data-label="Pemohon"><div>{o.nama_pemohon}</div></td>
                        <td data-label="Departemen"><div>{o.departemen}</div></td>
                        <td data-label="Status"><div><span style={{ fontWeight: "bold", color: o.status === "Approved" ? "#38a169" : o.status === "Rejected" ? "#e53e3e" : "#d69e2e" }}>{o.status}</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ fontSize: "12px", color: "#a0aec0", fontStyle: "italic" }}>Tidak ada klaim lembur pada bulan ini.</p>}
            </div>

          </>
        )}

        {/* FOOTER PRINT */}
        <div className="print-only" style={{ marginTop: "40px", pageBreakInside: "avoid", borderTop: "2px solid black", paddingTop: "20px", display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "bold" }}>
          <div style={{ textAlign: "center", width: "200px" }}>
            <div>Dibuat Oleh,</div>
            <div style={{ height: "60px" }}></div>
            <div style={{ textDecoration: "underline" }}>{adminName}</div>
            <div>Admin General Affairs</div>
          </div>
          <div style={{ textAlign: "center", width: "200px" }}>
            <div>Mengetahui,</div>
            <div style={{ height: "60px" }}></div>
            <div style={{ textDecoration: "underline" }}>Building Manager SIBM</div>
            <div>Management</div>
          </div>
        </div>

      </div>
    </div>
  );
}