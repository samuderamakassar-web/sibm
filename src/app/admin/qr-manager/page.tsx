"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <div style={{ padding: "0", fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: "#f8fafc" }}>
      
      {/* ========================================================= */}
      {/* CSS KHUSUS PRINT (Mengatur ukuran label agar pas dipotong) */}
      {/* ========================================================= */}
      <style jsx global>{`
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
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/admin")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali ke Admin</span>
        </div>
        <div style={{ background: "#ebf8ff", color: "#3182ce", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #bee3f8" }}>
          👑 Admin GA
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "30px" }}>
        
        {/* 🔹 KONTROL PANEL (AKAN SEMBUNYI SAAT DIPRINT) */}
        <div className="no-print" style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", marginBottom: "30px" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
            <div>
              <h1 style={{ margin: "0 0 10px 0", color: "#1a202c", fontSize: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
                🖨️ Mesin Pencetak QR Code
              </h1>
              <p style={{ margin: "0", color: "#718096", fontSize: "14px" }}>Cetak label QR Code penanda lokasi fisik untuk ditempel di dinding area / pos patroli.</p>
            </div>
            
            <button 
              onClick={handlePrint}
              style={{ padding: "12px 25px", background: "#e53e3e", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(229,62,62,0.3)" }}
            >
              🖨️ Cetak {activeTab === "SECURITY" ? "Patroli Security" : "Area OB/CS"}
            </button>
          </div>

          <hr style={{ border: "1px dashed #e2e8f0", margin: "20px 0" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
            
            {/* TOGGLE MODUL */}
            <div style={{ display: "flex", gap: "10px", background: "#f8fafc", padding: "6px", borderRadius: "12px", border: "1px solid #edf2f7" }}>
              <button 
                onClick={() => { setActiveTab("SECURITY"); setFilterLantai("Semua"); }}
                style={{ padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "SECURITY" ? "#e53e3e" : "transparent", color: activeTab === "SECURITY" ? "white" : "#718096", transition: "0.2s" }}
              >
                🛡️ Patroli Security
              </button>
              <button 
                onClick={() => { setActiveTab("OB"); setFilterLantai("Semua"); }}
                style={{ padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", background: activeTab === "OB" ? "#319795" : "transparent", color: activeTab === "OB" ? "white" : "#718096", transition: "0.2s" }}
              >
                🧹 Area OB & CS
              </button>
            </div>

            {/* FILTER LANTAI */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "#4a5568" }}>Pilih Lantai:</span>
              <select 
                value={filterLantai} 
                onChange={(e) => setFilterLantai(e.target.value)}
                style={{ padding: "10px 15px", borderRadius: "8px", border: "2px solid #cbd5e0", fontWeight: "bold", cursor: "pointer", outline: "none", background: "white", color: "#2d3748" }}
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
              const themeColor = activeTab === "SECURITY" ? "#e53e3e" : "#319795";

              return (
                <div 
                  key={indexArea}
                  className="qr-card"
                  style={{
                    background: "white", padding: "20px", borderRadius: "16px", border: `2px solid ${themeColor}40`, boxShadow: "0 4px 6px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative", overflow: "hidden"
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
                  <div style={{ padding: "10px", border: "2px dashed #cbd5e0", borderRadius: "12px", background: "white", marginBottom: "15px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="qr-img" src={qrImageUrl} alt={`QR ${qrPayload}`} style={{ width: "150px", height: "150px", display: "block" }} />
                  </div>

                  {/* Info Lokasi */}
                  <h3 style={{ margin: "0 0 5px 0", color: "#1a202c", fontSize: "18px", lineHeight: "1.3" }}>
                    {namaDisplay}
                  </h3>
                  <div style={{ fontSize: "12px", color: "white", background: "#4a5568", padding: "4px 12px", borderRadius: "20px", fontWeight: "bold", marginTop: "auto" }}>
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