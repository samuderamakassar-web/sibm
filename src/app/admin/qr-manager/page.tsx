"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

// ==============================================================
// 1. DATA MASTER OB & CS (DARI KODE ANDA)
// ==============================================================
const DATA_OB = [
  { lantai: "Area Basement", area: ["Toilet", "Taman Parkir"] },
  { lantai: "Lantai 1", area: ["Lobby", "Ruang Meeting", "Ruang Tamu", "Tenant Asbin", "Toilet", "Pantry", "Meja & Kursi"] },
  { lantai: "Lantai 2", area: ["Toilet", "Pantry", "Ruang Kerja SAI", "Ruang Kerja Besar", "Ruang Pimpinan", "Ruang GM", "Ruang Server", "Meja & Kursi"] },
  { lantai: "Lantai 3", area: ["Toilet", "Ruang Kerja PPNP", "Teras", "Meja & Kursi"] },
  { lantai: "Lantai 4", area: ["Toilet", "Ruang Kerja Kosong", "Mushallah", "Gudang"] },
  { lantai: "Lantai 5", area: ["Gudang", "Rooftop", "Tandon"] },
];

// ==============================================================
// 2. DATA MASTER SECURITY PATROLI (DISINKRONKAN DENGAN MODUL PATROLI)
// ==============================================================
const DATA_SECURITY = [
  { lantai: "Ground (Basement)", area: [{ id: "Ground::Parkiran Basement", nama: "Area Parkiran Basement" }, { id: "Ground::Toilet", nama: "Toilet Basement" }, { id: "Ground::Ruang Genset", nama: "Ruang Genset" }, { id: "Ground::Ruang Pompa", nama: "Ruang Pompa Utama" }, { id: "Ground::Gudang", nama: "Gudang Basement" }, { id: "Ground::Mushallah Basement", nama: "Mushallah Basement" }] },
  { lantai: "Lantai 1", area: [{ id: "Lantai 1::Lobby", nama: "Lobby Utama" }, { id: "Lantai 1::Asbin", nama: "Ruang Asbin" }, { id: "Lantai 1::Ruang Meeting", nama: "Ruang Meeting Lt 1" }, { id: "Lantai 1::Toilet", nama: "Toilet Lt 1" }, { id: "Lantai 1::Ruang Tamu", nama: "Ruang Tamu" }, { id: "Lantai 1::Pantry", nama: "Pantry Lt 1" }] },
  { lantai: "Lantai 2", area: [{ id: "Lantai 2::Ruang Kerja Utama", nama: "Ruang Kerja Utama" }, { id: "Lantai 2::Pantry", nama: "Pantry Lt 2" }, { id: "Lantai 2::Toilet", nama: "Toilet Lt 2" }, { id: "Lantai 2::Ruang Kerja SAI", nama: "Ruang Kerja SAI" }, { id: "Lantai 2::Ruang Direktur", nama: "Ruang Direktur" }, { id: "Lantai 2::Ruang GM", nama: "Ruang General Manager" }, { id: "Lantai 2::Server", nama: "Ruang Server (IT)" }, { id: "Lantai 2::Ruang Arsip", nama: "Ruang Arsip" }] },
  { lantai: "Lantai 3", area: [{ id: "Lantai 3::Gudang", nama: "Gudang Lt 3" }, { id: "Lantai 3::Toilet", nama: "Toilet Lt 3" }, { id: "Lantai 3::Ruang Kesehatan", nama: "Klinik / Ruang Kesehatan" }, { id: "Lantai 3::Ruang Meeting", nama: "Ruang Meeting Lt 3" }, { id: "Lantai 3::Ruang Kerja Kosong", nama: "Ruang Kerja Kosong" }, { id: "Lantai 3::Ruang Kerja PPNP", nama: "Ruang Kerja PPNP" }] },
  { lantai: "Lantai 4", area: [{ id: "Lantai 4::Ruang Kerja Kosong", nama: "Ruang Kerja Kosong" }, { id: "Lantai 4::Toilet", nama: "Toilet Lt 4" }, { id: "Lantai 4::Pantry", nama: "Pantry Lt 4" }, { id: "Lantai 4::Mushallah", nama: "Mushallah Utama" }] },
  { lantai: "Lantai 5", area: [{ id: "Lantai 5::Rooftop", nama: "Area Rooftop" }, { id: "Lantai 5::Gudang", nama: "Gudang Lt 5" }, { id: "Lantai 5::Ruang Pompa", nama: "Ruang Pompa Air Lt 5" }] }
];

export default function AdminQRManagerPage() {
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<"OB" | "SECURITY">("SECURITY");
  const [filterLantai, setFilterLantai] = useState<string>("Semua");

  const handlePrint = () => {
    window.print();
  };

  const currentData = activeTab === "OB" ? DATA_OB : DATA_SECURITY;

  return (
    <div style={{ padding: "0", fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: "var(--bg)" }}>
      
      {/* ========================================================= */}
      {/* CSS KHUSUS PRINT (Mengatur ukuran label agar pas dipotong) */}
      {/* ========================================================= */}
      <style jsx global>{`
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
        @media print {
          @page { margin: 10mm; size: A4 portrait; }
          .no-print { display: none !important; }
          body { background: white !important; padding: 0 !important; }
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important; /* 3 Kolom di kertas A4 */
            gap: 15px !important;
          }
          .qr-card {
            border: 2px dashed #000 !important; /* Garis bantu potong gunting */
            box-shadow: none !important;
            page-break-inside: avoid !important;
            padding: 15px !important;
          }
          .qr-img {
            width: 130px !important;
            height: 130px !important;
          }
        }
      `}</style>

      {/* 🔹 HEADER TOP BAR */}
      <div className="site-header no-print">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> Admin GA
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div className="admin-hero no-print">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(20px, 5vw, 28px)", fontWeight: "900", letterSpacing: "1px" }}>QR CODE GENERATOR</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Cetak label QR Code penanda lokasi fisik untuk ditempel di dinding area / pos patroli.</p>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 20px 30px", position: "relative", zIndex: 10 }}>

        {/* 🔹 KONTROL PANEL (AKAN SEMBUNYI SAAT DIPRINT) */}
        <div className="no-print" style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", border: "1px solid var(--line)", marginBottom: "30px" }}>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
            <button
              onClick={handlePrint}
              style={{ padding: "12px 25px", background: "var(--red-600)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(220,38,38,0.3)" }}
            >
              🖨️ Cetak {activeTab === "SECURITY" ? "Patroli Security" : "Area OB/CS"}
            </button>
          </div>

          <hr style={{ border: "1px dashed var(--line)", margin: "20px 0" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>

            {/* TOGGLE MODUL */}
            <div style={{ display: "flex", gap: "10px", background: "var(--bg)", padding: "6px", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <button
                onClick={() => { setActiveTab("SECURITY"); setFilterLantai("Semua"); }}
                style={{ padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "SECURITY" ? "var(--red-600)" : "transparent", color: activeTab === "SECURITY" ? "white" : "var(--muted)", transition: "0.2s" }}
              >
                🛡️ Patroli Security
              </button>
              <button
                onClick={() => { setActiveTab("OB"); setFilterLantai("Semua"); }}
                style={{ padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "OB" ? "var(--ok)" : "transparent", color: activeTab === "OB" ? "white" : "var(--muted)", transition: "0.2s" }}
              >
                🧹 Area OB & CS
              </button>
            </div>

            {/* FILTER LANTAI */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink-soft)" }}>Pilih Lantai:</span>
              <select
                value={filterLantai}
                onChange={(e) => setFilterLantai(e.target.value)}
                style={{ padding: "10px 15px", borderRadius: "8px", border: "2px solid var(--line)", fontWeight: "bold", cursor: "pointer", outline: "none", background: "var(--surface)", color: "var(--ink)" }}
              >
                <option value="Semua">🗂️ Tampilkan Semua Lantai</option>
                {currentData.map((g) => (
                  <option key={g.lantai} value={g.lantai}>{g.lantai}</option>
                ))}
              </select>
            </div>
          </div>

        </div>

        {/* 🔹 AREA KANVAS CETAK (Muncul di layar dan kertas) */}
        <div className="print-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "20px" }}>
          
          {currentData.filter((g) => filterLantai === "Semua" || g.lantai === filterLantai).map((lantaiObj) => 
            lantaiObj.area.map((item, indexArea) => {
              
              // Tentukan Payload sesuai tipe Tab
              let qrPayload = "";
              let namaDisplay = "";

              if (activeTab === "OB") {
                qrPayload = `${lantaiObj.lantai}::${item as string}`;
                namaDisplay = item as string;
              } else {
                const secItem = item as { id: string, nama: string };
                qrPayload = secItem.id;
                namaDisplay = secItem.nama;
              }
              
              // API QR
              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;
              const themeColor = activeTab === "SECURITY" ? "var(--red-600)" : "var(--ok)";
              const themeColorRGB = activeTab === "SECURITY" ? "220,38,38" : "22,163,74";

              return (
                <div
                  key={indexArea}
                  className="qr-card"
                  style={{
                    background: "var(--surface)", padding: "20px", borderRadius: "16px", border: `2px solid rgba(${themeColorRGB},0.25)`, boxShadow: "0 4px 6px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative", overflow: "hidden"
                  }}
                >
                  {/* Pita Warna Atas */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "6px", background: themeColor }}></div>

                  {/* Logo / Header Perusahaan */}
                  <div style={{ marginBottom: "15px", marginTop: "5px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-samudera.png" alt="Logo" style={{ height: "25px", filter: "invert(1) brightness(0)" }} />
                  </div>
                  <span style={{ fontSize: "10px", fontWeight: "900", color: themeColor, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>
                    {activeTab === "SECURITY" ? "ASSET PATROLI SECURITY" : "ASSET CHECKLIST OB/CS"}
                  </span>

                  {/* Gambar QR Code */}
                  <div style={{ padding: "10px", border: "2px dashed var(--line)", borderRadius: "12px", background: "var(--surface)", marginBottom: "15px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="qr-img" src={qrImageUrl} alt={`QR ${qrPayload}`} style={{ width: "150px", height: "150px", display: "block" }} />
                  </div>

                  {/* Info Lokasi */}
                  <h3 style={{ margin: "0 0 5px 0", color: "var(--ink)", fontSize: "18px", lineHeight: "1.3" }}>
                    {namaDisplay}
                  </h3>
                  <div style={{ fontSize: "12px", color: "white", background: "var(--ink-soft)", padding: "4px 12px", borderRadius: "20px", fontWeight: "bold", marginTop: "auto" }}>
                    Lantai: {lantaiObj.lantai}
                  </div>
                </div>
              );
            })
          )}

        </div>
      </div>
    </div>
  );
}