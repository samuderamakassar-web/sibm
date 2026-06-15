"use client";

import { useState, useEffect, useRef } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, doc, updateDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../lib/firebase"; 

interface TipePaket {
  id: string;
  jenis_barang: string;
  penerima: string;
  kurir: string;
  keterangan: string;
  waktu_diterima: Timestamp | null;
  waktu_diambil: Timestamp | null;
  status: "Belum Diambil" | "Sudah Diambil";
  foto_bukti_url: string; 
}

export default function PaketPage() {
  const [jenisBarang, setJenisBarang] = useState("Paket");
  const [penerima, setPenerima] = useState("");
  const [kurir, setKurir] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [fileFoto, setFileFoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [waktuSekarang, setWaktuSekarang] = useState("");

  const [searchPenerima, setSearchPenerima] = useState("");
  const [daftarPaket, setDaftarPaket] = useState<TipePaket[]>([]);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setWaktuSekarang(new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(collection(db, "packages"), orderBy("waktu_diterima", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const paketArr: TipePaket[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        paketArr.push({
          id: docSnap.id,
          jenis_barang: data.jenis_barang,
          penerima: data.penerima,
          kurir: data.kurir,
          keterangan: data.keterangan,
          waktu_diterima: data.waktu_diterima,
          waktu_diambil: data.waktu_diambil,
          status: data.status,
          foto_bukti_url: data.foto_bukti_url || "",
        });
      });
      setDaftarPaket(paketArr);
    });
    return () => unsubscribe();
  }, []);

  const paketTerfilter = daftarPaket.filter((pkt) =>
    pkt.penerima.toLowerCase().includes(searchPenerima.toLowerCase()) ||
    pkt.kurir.toLowerCase().includes(searchPenerima.toLowerCase())
  );

  const startCamera = async () => {
    setFileFoto(null);
    setPreviewUrl("");
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Gagal mengakses kamera:", err);
      alert("Gagal mengakses kamera. Pastikan Anda memberikan izin.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach((track) => track.stop());
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
          setFileFoto(file);
          setPreviewUrl(URL.createObjectURL(file)); // Set URL aman di dalam aksi
          stopCamera();
        }
      }, "image/jpeg");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileFoto(file);
      setPreviewUrl(URL.createObjectURL(file)); // Set URL aman di dalam aksi
      stopCamera();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);

    let fotoUrl = "";

    try {
      if (fileFoto) {
        const storageRef = ref(storage, `package_photos/${Date.now()}_${fileFoto.name}`);
        await uploadBytes(storageRef, fileFoto);
        fotoUrl = await getDownloadURL(storageRef);
      }

      await addDoc(collection(db, "packages"), {
        jenis_barang: jenisBarang,
        penerima: penerima,
        kurir: kurir,
        keterangan: keterangan,
        waktu_diterima: serverTimestamp(),
        waktu_diambil: null,
        status: "Belum Diambil",
        foto_bukti_url: fotoUrl
      });

      // Reset semua form setelah sukses
      setPenerima("");
      setKurir("");
      setKeterangan("");
      setFileFoto(null);
      setPreviewUrl("");
      setIsSuccess(true);
    } catch (error) {
      console.error("Error:", error);
      alert("Gagal menyimpan data log paket.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiambil = async (id: string) => {
    try {
      const paketRef = doc(db, "packages", id);
      await updateDoc(paketRef, {
        waktu_diambil: serverTimestamp(),
        status: "Sudah Diambil"
      });
    } catch (error) {
      console.error("Gagal update:", error);
    }
  };

  const formatWaktu = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1400px", margin: "0 auto" }}>
      
      <div style={{ marginBottom: "20px", borderBottom: "2px solid #eee", paddingBottom: "10px" }}>
        <h2 style={{ margin: "0 0 5px 0", color: "#da251d" }}>📦 SIBM - Log Paket & Dokumen Masuk</h2>
        <span style={{ fontSize: "14px", fontWeight: "bold", color: "#555" }}>
          🕒 Waktu Real-time: {waktuSekarang || "Memuat..."}
        </span>
      </div>

      <div style={{ display: "flex", gap: "30px", flexWrap: "wrap" }}>
        
        <div style={{ flex: "1 1 400px", background: "#fdfdfd", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0", maxHeight: "fit-content" }}>
          <h3 style={{ marginTop: "0", color: "#333", borderBottom: "1px solid #ddd", paddingBottom: "8px" }}>📥 Input Penerimaan</h3>
          
          {isSuccess && (
            <div style={{ background: "#e6fffa", color: "#234e52", padding: "10px", borderRadius: "5px", marginBottom: "15px", fontSize: "14px" }}>
              ✓ Data penerimaan berhasil dicatat!
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Jenis Barang:</label>
              <select value={jenisBarang} onChange={(e) => setJenisBarang(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}>
                <option value="Paket">Paket / Barang</option>
                <option value="Dokumen">Dokumen / Surat</option>
                <option value="Makanan">Makanan / Minuman</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Nama Penerima (Karyawan):</label>
              <input type="text" placeholder="Untuk siapa paket ini..." value={penerima} onChange={(e) => setPenerima(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }} required />
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Kurir / Ekspedisi:</label>
              <input type="text" placeholder="Cth: JNE, GoSend, J&T, dll..." value={kurir} onChange={(e) => setKurir(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }} required />
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Foto Bukti:</label>
              
              <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} id="fileInput" />
                <label htmlFor="fileInput" style={{ padding: "8px 12px", background: "#edf2f7", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}>📁 Unggah Foto</label>
                
                {isCameraActive ? (
                  <button type="button" onClick={stopCamera} style={{ padding: "8px 12px", background: "#fc8181", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}>✖ Matikan Kamera</button>
                ) : (
                  <button type="button" onClick={startCamera} style={{ padding: "8px 12px", background: "#edf2f7", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}>📷 Buka Kamera</button>
                )}
              </div>

              {isCameraActive && (
                <div style={{ position: "relative", marginBottom: "10px" }}>
                  <video ref={videoRef} autoPlay playsInline style={{ width: "100%", borderRadius: "4px", border: "2px solid #ccc" }}></video>
                  <button type="button" onClick={capturePhoto} style={{ position: "absolute", bottom: "10px", left: "50%", transform: "translateX(-50%)", padding: "10px 20px", background: "#da251d", color: "white", border: "none", borderRadius: "4px", fontWeight: "bold", cursor: "pointer" }}>📸 Ambil Foto</button>
                  <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
                </div>
              )}

              {previewUrl && (
                <div style={{ marginBottom: "10px" }}>
                  <img src={previewUrl} alt="Preview Foto" style={{ width: "100%", borderRadius: "4px", border: "2px solid #ccc" }} />
                  <button type="button" onClick={() => { setFileFoto(null); setPreviewUrl(""); }} style={{ padding: "4px 8px", background: "#fc8181", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", marginTop: "5px" }}>Hapus Foto</button>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Keterangan / No. Resi (Opsional):</label>
              <textarea placeholder="Catatan tambahan atau nomor resi..." value={keterangan} onChange={(e) => setKeterangan(e.target.value)} style={{ width: "100%", padding: "10px", height: "60px", borderRadius: "4px", border: "1px solid #ccc", resize: "none" }} />
            </div>

            <button type="submit" disabled={isLoading} style={{ padding: "12px", background: "#da251d", color: "#fff", border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "4px", marginTop: "5px" }}>
              {isLoading ? "Menyimpan..." : "Simpan Log Paket"}
            </button>
          </form>
        </div>

        <div style={{ flex: "2 1 600px", minWidth: "350px" }}>
          <div style={{ background: "#edf2f7", padding: "15px", borderRadius: "8px", marginBottom: "15px", display: "flex", gap: "15px", alignItems: "center" }}>
            <h4 style={{ margin: "0", color: "#2d3748" }}>🔍 Cari:</h4>
            <input 
              type="text" 
              placeholder="Cari nama penerima atau kurir..." 
              value={searchPenerima}
              onChange={(e) => setSearchPenerima(e.target.value)}
              style={{ flex: "1", padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e0" }}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table border={1} cellPadding={8} style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#e2e8f0", color: "#2d3748" }}>
                  <th>Jenis</th>
                  <th>Foto Bukti</th>
                  <th>Penerima</th>
                  <th>Kurir</th>
                  <th>Diterima Pos</th>
                  <th>Diambil</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paketTerfilter.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#718096", padding: "20px" }}>Belum ada data paket masuk.</td>
                  </tr>
                ) : (
                  paketTerfilter.map((pkt) => (
                    <tr key={pkt.id} style={{ borderBottom: "1px solid #e2e8f0", background: pkt.status === "Sudah Diambil" ? "#f7fafc" : "#fff" }}>
                      <td><strong>{pkt.jenis_barang}</strong></td>
                      <td>
                        {pkt.foto_bukti_url ? (
                          <a href={pkt.foto_bukti_url} target="_blank" rel="noopener noreferrer">
                            <img src={pkt.foto_bukti_url} alt="Foto Bukti" style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "4px", border: "1px solid #ccc" }} />
                          </a>
                        ) : (
                          <span style={{ color: "#a0aec0", fontSize: "11px" }}>Tanpa Foto</span>
                        )}
                      </td>
                      <td style={{ color: "#2b6cb0", fontWeight: "bold" }}>{pkt.penerima}</td>
                      <td>{pkt.kurir}</td>
                      <td>{formatWaktu(pkt.waktu_diterima)}</td>
                      <td>{pkt.waktu_diambil ? formatWaktu(pkt.waktu_diambil) : <span style={{ color: "#dd6b20" }}>Menunggu</span>}</td>
                      <td>
                        {pkt.status === "Belum Diambil" ? (
                          <button 
                            onClick={() => handleDiambil(pkt.id)}
                            style={{ padding: "4px 8px", background: "#3182ce", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
                          >
                            Serahkan
                          </button>
                        ) : (
                          <span style={{ color: "#38a169", fontWeight: "bold" }}>✓ Selesai</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}