"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Data Gedung SIBM wajib sama persis dengan yang ada di halaman Checklist OB/CS
const DATA_GEDUNG = [
  { lantai: "Area Basement", area: ["Toilet", "Taman Parkir"] },
  { lantai: "Lantai 1", area: ["Lobby", "Ruang Meeting", "Ruang Tamu", "Tenant Asbin", "Toilet", "Pantry", "Meja & Kursi"] },
  { lantai: "Lantai 2", area: ["Toilet", "Pantry", "Ruang Kerja SAI", "Ruang Kerja Besar", "Ruang Pimpinan", "Ruang GM", "Ruang Server", "Meja & Kursi"] },
  { lantai: "Lantai 3", area: ["Toilet", "Ruang Kerja PPNP", "Teras", "Meja & Kursi"] },
  { lantai: "Lantai 4", area: ["Toilet", "Ruang Kerja Kosong", "Mushallah", "Gudang"] },
  { lantai: "Lantai 5", area: ["Gudang", "Rooftop", "Tandon"] },
];

export default function AdminQRManagerPage() {
  const router = useRouter();
  const [filterLantai, setFilterLantai] = useState<string>("Semua");

  // Fungsi memicu jendela cetak printer browser (Ctrl + P)
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ padding: "30px", fontFamily: "sans-serif", maxWidth: "1200px", margin: "0 auto", minHeight: "100vh", background: "#f8fafc" }}>
      
      {/* STYLE KHUSUS PRINT: Menyembunyikan tombol & header saat dicetak ke kertas */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
            padding: 0 !important;
          }
          .qr-card {
            border: 2px dashed #333 !important;
            box-shadow: none !important;
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* HEADER - AKAN SEMBUNYI SAAT DI-PRINT */}
      <div className="no-print" style={{ background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
        <div>
          <h1 style={{ margin: "0 0 5px 0", color: "#2c5282" }}>👑 Admin GA - QR Code Generator</h1>
          <p style={{ margin: "0", color: "#718096", fontSize: "14px" }}>Cetak label QR Code penanda lokasi fisik untuk validasi checklist tim OB & CS.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <select 
            value={filterLantai} 
            onChange={(e) => setFilterLantai(e.target.value)}
            style={{ padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0", fontWeight: "bold", cursor: "pointer" }}
          >
            <option value="Semua">🗂️ Tampilkan Semua Lantai</option>
            {DATA_GEDUNG.map((g) => (
              <option key={g.lantai} value={g.lantai}>{g.lantai}</option>
            ))}
          </select>
          
          <button 
            onClick={handlePrint}
            style={{ padding: "10px 20px", background: "#2b6cb0", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
          >
            🖨️ Cetak Label QR
          </button>
        </div>
      </div>

      {/* AREA GRID QR CODE */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "25px" }}>
        {DATA_GEDUNG.filter((g) => filterLantai === "Semua" || g.lantai === filterLantai).map((lantaiObj) => 
          lantaiObj.area.map((namaArea, indexArea) => {
            // Gabungkan teks payload QR agar COCOK PERSIS dengan sistem scanner OB (Contoh: "Lantai 1::Toilet")
            const qrPayload = `${lantaiObj.lantai}::${namaArea}`;
            
            // Link API QR Code Generator Global (Aman, Cepat, dan Gratis)
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrPayload)}`;

            return (
              <div 
                key={indexArea}
                className="qr-card"
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "10px",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  backgroundColor: "#fff"
                }}
              >
                {/* Judul Atas Kartu */}
                <span style={{ fontSize: "11px", fontWeight: "bold", color: "#a0aec0", textTransform: "uppercase", letterSpacing: "1px" }}>
                SIBM INTERNAL ASSET
                </span>
                
                {/* Gambar QR Code */}
                <div style={{ margin: "15px 0", padding: "10px", border: "1px solid #edf2f7", borderRadius: "8px" }}>
                  <img 
                    src={qrImageUrl} 
                    alt={`QR ${qrPayload}`} 
                    style={{ width: "160px", height: "160px", display: "block" }} 
                  />
                </div>

                {/* Nama Lokasi Detail */}
                <h3 style={{ margin: "5px 0 2px 0", color: "#2d3748", fontSize: "18px" }}>
                  {namaArea}
                </h3>
                
                {/* Nama Lantai */}
                <span style={{ fontSize: "13px", color: "#4a5568", fontWeight: "bold", background: "#edf2f7", padding: "2px 10px", borderRadius: "50px", marginTop: "5px" }}>
                  📍 {lantaiObj.lantai}
                </span>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}