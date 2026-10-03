"use client";

import { useState } from "react";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import AdminShell from "../../../components/admin/AdminShell";
import { useTitikPatroli } from "../../../lib/titikPatroli";
import { useChecklistOB } from "../../../lib/sopChecklist";


// ==============================================================
// 1. DATA MASTER OB & CS (DARI KODE ANDA)
// ==============================================================
// §82: label QR area OB & CS dibuat dari master SOP Checklist (/admin/sop-checklist): 1 label per segmen
// aktif di tiap area. QR OB hanya label cetak (tidak dipindai aplikasi), jadi aman mengikuti master.

// ==============================================================
// 2. DATA SECURITY PATROLI -- dari master /admin/titik-patroli (src/lib/titikPatroli.ts, §79).
// Dulu salinan terpisah yang sudah berbeda dari halaman Patroli (tanpa Taman Belakang & Parkiran).
// ==============================================================

export default function AdminQRManagerPage() {
  // Sebelumnya halaman ini TIDAK punya pengecekan akses sama sekali (siapa pun yang tahu URL-nya
  // bisa membuka) -- disamakan dengan halaman admin lain saat migrasi AdminShell (§58I).
  const { session, isReady } = useAuthGuard({
    roles: ["Admin"],
    depts: ["Admin GA"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });
  
  const [activeTab, setActiveTab] = useState<"OB" | "SECURITY">("SECURITY");
  const [filterLantai, setFilterLantai] = useState<string>("Semua");

  const handlePrint = () => {
    window.print();
  };

  const { daftar: masterTitik } = useTitikPatroli();
  const DATA_SECURITY = masterTitik.map((l) => ({ lantai: l.lantai, area: l.titik.map((x) => ({ id: x.id, nama: x.aktif === false ? `${x.nama} (nonaktif)` : x.nama })) }));
  const { nilai: masterOB } = useChecklistOB();
  const DATA_OB = masterOB.area.filter((a) => !a.area.toLowerCase().includes("pelayanan"))
    .map((a) => ({ lantai: a.area, area: a.segmen.filter((s) => s.aktif !== false).map((s) => s.nama) }));
  const currentData = activeTab === "OB" ? DATA_OB : DATA_SECURITY;

  if (!isReady || !session) return null;

  return (
    <AdminShell title="QR Code Generator" subtitle="Cetak label QR penanda lokasi fisik untuk ditempel di dinding area / pos patroli" userName={session?.nama || "Admin"}>
      
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
      <div>

        {/* 🔹 KONTROL PANEL (AKAN SEMBUNYI SAAT DIPRINT) */}
        <div className="no-print" style={{ background: "var(--surface)", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", border: "1px solid var(--line)", marginBottom: "30px" }}>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
            <button
              onClick={handlePrint}
              style={{ padding: "12px 25px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(220,38,38,0.3)" }}
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
                    <img src="/logo-samudera.png" alt="Logo" style={{ height: "25px" }} />
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
                  <div style={{ fontSize: "12px", color: "#fff", background: "var(--muted-solid)", padding: "4px 12px", borderRadius: "20px", fontWeight: "bold", marginTop: "auto" }}>
                    Lantai: {lantaiObj.lantai}
                  </div>
                </div>
              );
            })
          )}

        </div>
      </div>
    </AdminShell>
  );
}