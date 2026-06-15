"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { Html5QrcodeScanner } from "html5-qrcode";

// Titik rawan yang wajib dipatroli oleh Security
const TITIK_PATROLI = [
  "Lantai 1::Pintu Utama Lobby",
  "Area Basement::CCTV & Parkir",
  "Lantai 2::Ruang Server",
  "Lantai 3::Pintu Darurat",
  "Lantai 4::Area Kosong & Mushallah",
  "Lantai 5::Rooftop & Tandon Air"
];

interface TitikAman {
  id: string;
  waktu_patroli: string;
  kondisi: string; // "Aman" atau "Ada Temuan"
}

export default function PatroliSecurityPage() {
  const router = useRouter();
  
  const [picName, setPicName] = useState<string>("");
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const [scannedItems, setScannedItems] = useState<TitikAman[]>([]);
  const [catatanUmum, setCatatanUmum] = useState<string>("");
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  
  // State kondisi sementara saat scan berhasil
  const [kondisiTitik, setKondisiTitik] = useState<string>("Aman Terkendali");

  useEffect(() => {
    const siapkanHalaman = async () => {
      const nama = localStorage.getItem("pic_nama");
      if (!nama) {
        router.push("/shift-checkin");
        return;
      }
      setPicName(nama);
      setIsReady(true);
    };
    siapkanHalaman();
  }, [router]);

  useEffect(() => {
    if (scanTarget) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);

      scanner.render(
        (decodedText) => {
          if (decodedText === scanTarget) {
            const jamSekarang = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
            
            // Masukkan data patroli dengan kondisi default "Aman"
            setScannedItems((prev) => [...prev, { id: scanTarget, waktu_patroli: jamSekarang, kondisi: kondisiTitik }]);
            setScanTarget(null); 
            scanner.clear();
            alert(`✅ Titik Diamankan! (Jam ${jamSekarang})`);
          } else {
            alert(`❌ QR Code Salah! Anda tidak berada di titik ${scanTarget.split("::")[1]}`);
          }
        },
        (error) => {}
      );

      return () => { scanner.clear().catch((e) => console.error(e)); };
    }
  }, [scanTarget, kondisiTitik]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scannedItems.length === 0) {
      alert("Belum ada titik yang dipatroli!");
      return;
    }

    setIsLoading(true);
    try {
      await addDoc(collection(db, "security_patrols"), {
        petugas: picName,
        waktu_laporan: serverTimestamp(),
        titik_patroli: scannedItems,
        catatan_shift: catatanUmum,
        status: "Selesai Patroli"
      });

      setIsSuccess(true);
      setScannedItems([]);
      setCatatanUmum("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Gagal menyimpan:", error);
      alert("Gagal mengirim laporan patroli.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isReady) return null;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto", background: "#f7fafc", minHeight: "100vh" }}>
      
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button onClick={() => router.push("/dashboard/security")} style={{ padding: "8px 12px", background: "#e2e8f0", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", color: "#4a5568" }}>
          ⬅ Kembali
        </button>
        <div style={{ fontSize: "13px", fontWeight: "bold", color: "#2f855a", background: "#f0fff4", padding: "5px 10px", borderRadius: "20px", border: "1px solid #9ae6b4" }}>
          👮 {picName}
        </div>
      </div>

      <div style={{ background: "white", padding: "25px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: "0 0 10px 0", color: "#276749" }}>🔦 Laporan Patroli Keliling</h2>
        <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "14px" }}>
          Scan QR Code di setiap titik rawan untuk memastikan gedung dalam keadaan aman.
        </p>

        {isSuccess && (
          <div style={{ background: "#c6f6d5", color: "#22543d", padding: "12px", borderRadius: "6px", marginBottom: "20px", fontWeight: "bold" }}>
            ✓ Laporan patroli berhasil diserahkan ke sistem!
          </div>
        )}

        {/* MODAL SCANNER */}
        {scanTarget && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <h3 style={{ color: "white", textAlign: "center", marginBottom: "10px" }}>Patroli Titik: <strong>{scanTarget.split("::")[1]}</strong></h3>
            
            <div style={{ background: "white", padding: "15px", borderRadius: "8px", marginBottom: "15px", width: "100%", maxWidth: "400px" }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px", fontSize: "14px", color: "#2d3748" }}>Kondisi Titik Ini:</label>
              <select value={kondisiTitik} onChange={(e) => setKondisiTitik(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0", fontWeight: "bold", color: kondisiTitik === "Aman Terkendali" ? "#2f855a" : "#c53030" }}>
                <option value="Aman Terkendali">✅ Aman Terkendali</option>
                <option value="Ada Temuan / Mencurigakan">⚠️ Ada Temuan / Mencurigakan</option>
                <option value="Pintu/Jendela Terbuka">🚪 Pintu/Jendela Terbuka</option>
              </select>
            </div>

            <div id="reader" style={{ width: "100%", maxWidth: "400px", background: "white", borderRadius: "8px", overflow: "hidden" }}></div>
            
            <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
              <button onClick={() => setScanTarget(null)} style={{ padding: "12px 20px", background: "#e53e3e", color: "white", border: "none", borderRadius: "50px", fontWeight: "bold", cursor: "pointer" }}>Batal</button>
              <button 
                onClick={() => {
                  const jamSekarang = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                  setScannedItems((prev) => [...prev, { id: scanTarget, waktu_patroli: jamSekarang, kondisi: kondisiTitik }]);
                  setScanTarget(null);
                }} 
                style={{ padding: "12px 20px", background: "#d69e2e", color: "white", border: "none", borderRadius: "50px", fontWeight: "bold", cursor: "pointer" }}
              >⚙️ Simulasi Sukses</button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "25px" }}>
            {TITIK_PATROLI.map((titik, index) => {
              const [lantai, namaTitik] = titik.split("::");
              const dataSelesai = scannedItems.find((item) => item.id === titik);
              const isScanned = !!dataSelesai;

              return (
                <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px", background: isScanned ? "#f0fff4" : "#fdfdfd", border: isScanned ? "1px solid #48bb78" : "1px solid #e2e8f0", borderRadius: "8px" }}>
                  <div>
                    <div style={{ fontSize: "16px", color: isScanned ? "#22543d" : "#2d3748", fontWeight: "bold" }}>{namaTitik}</div>
                    <div style={{ fontSize: "12px", color: "#718096" }}>{lantai}</div>
                    
                    {isScanned && (
                      <div style={{ fontSize: "12px", color: dataSelesai.kondisi === "Aman Terkendali" ? "#2f855a" : "#c53030", marginTop: "4px", fontWeight: "bold" }}>
                        ↳ {dataSelesai.kondisi} ({dataSelesai.waktu_patroli})
                      </div>
                    )}
                  </div>
                  
                  {!isScanned && (
                    <button 
                      type="button"
                      onClick={() => { setKondisiTitik("Aman Terkendali"); setScanTarget(titik); }}
                      style={{ background: "#276749", color: "white", border: "none", padding: "10px 15px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "5px" }}
                    >
                      <span style={{ fontSize: "16px" }}>📷</span> Scan Lokasi
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "8px", color: "#2d3748" }}>Catatan Patroli (Opsional):</label>
            <textarea 
              value={catatanUmum} onChange={(e) => setCatatanUmum(e.target.value)}
              placeholder="Tulis jika ada kejadian khusus selama patroli shift ini..."
              style={{ width: "100%", padding: "12px", height: "80px", borderRadius: "6px", border: "1px solid #cbd5e0", resize: "none" }}
            />
          </div>

          <button 
            type="submit" disabled={isLoading || scannedItems.length === 0}
            style={{ width: "100%", padding: "15px", background: (isLoading || scannedItems.length === 0) ? "#a0aec0" : "#276749", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: (isLoading || scannedItems.length === 0) ? "not-allowed" : "pointer" }}
          >
            {isLoading ? "Menyimpan Log..." : `🚨 Selesai Patroli (${scannedItems.length} Titik)`}
          </button>
        </form>
      </div>
    </div>
  );
}