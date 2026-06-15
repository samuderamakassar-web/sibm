"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, doc, updateDoc, DocumentData, Timestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase"; // Sesuaikan path jika perlu

const DAFTAR_KARYAWAN = [
  "Budi Santoso (GA)",
  "Siti Aminah (Finance)",
  "Ahmad Hidayat (IT)",
  "Dewi Lestari (HRD)",
  "Reza (Building Management)"
];

export default function BukuTamuPage() {
  // --- State Form Input ---
  const [kategori, setKategori] = useState("visitor");
  const [namaTamu, setNamaTamu] = useState("");
  const [karyawanTerpilih, setKaryawanTerpilih] = useState("");
  const [cariKaryawan, setCariKaryawan] = useState("");
  const [instansi, setInstansi] = useState("");
  const [tujuan, setTujuan] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [waktuSekarang, setWaktuSekarang] = useState("");

  // --- State Filter / Pencarian di Tabel ---
  const [searchNamaTabel, setSearchNamaTabel] = useState("");
  const [filterTanggal, setFilterTanggal] = useState("");
  const [daftarTamu, setDaftarTamu] = useState<DocumentData[]>([]);

  // Efek Jam Real-time otomatis di Form
  useEffect(() => {
    const timer = setInterval(() => {
      const kini = new Date();
      setWaktuSekarang(kini.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Efek mengambil data dari Firestore secara Real-time
  useEffect(() => {
    const q = query(collection(db, "guest_books"), orderBy("jam_masuk", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const tamuArr: DocumentData[] = [];
      querySnapshot.forEach((doc) => {
        tamuArr.push({ id: doc.id, ...doc.data() });
      });
      setDaftarTamu(tamuArr);
    });
    return () => unsubscribe();
  }, []);

  const karyawanTerfilter = DAFTAR_KARYAWAN.filter(nama =>
    nama.toLowerCase().includes(cariKaryawan.toLowerCase())
  );

  // --- Logika Filter Data Tabel ---
  const dataTabelTerfilter = daftarTamu.filter((tamu) => {
    // 1. Cocokkan pencarian nama
    const matchNama = tamu.nama?.toLowerCase().includes(searchNamaTabel.toLowerCase());
    
    // 2. Cocokkan pencarian tanggal
    let matchTanggal = true;
    if (filterTanggal && tamu.jam_masuk) {
      const tanggalMasukFirebase = tamu.jam_masuk.toDate().toISOString().split("T")[0]; // Format: YYYY-MM-DD
      matchTanggal = tanggalMasukFirebase === filterTanggal;
    }

    return matchNama && matchTanggal;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);

    let namaFinal = "";
    if (kategori === "karyawan") {
      namaFinal = karyawanTerpilih;
    } else {
      namaFinal = namaTamu;
    }

    try {
      await addDoc(collection(db, "guest_books"), {
        kategori: kategori,
        nama: namaFinal,
        instansi: kategori === "karyawan" ? "Internal Perusahaan" : instansi,
        tujuan: tujuan,
        jam_masuk: serverTimestamp(),
        jam_keluar: null,
        status: "Masuk",
        device_access_granted: false,
        access_token: ""
      });

      setNamaTamu("");
      setInstansi("");
      setTujuan("");
      setKaryawanTerpilih("");
      setCariKaryawan("");
      setIsSuccess(true);
    } catch (error) {
      console.error("Error:", error);
      alert("Gagal menyimpan data.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePulang = async (id: string) => {
    try {
      const tamuRef = doc(db, "guest_books", id);
      await updateDoc(tamuRef, {
        jam_keluar: serverTimestamp(),
        status: "Pulang"
      });
    } catch (error) {
      console.error("Gagal update:", error);
    }
  };

  const formatWaktu = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    const date = timestamp.toDate();
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const formatTanggalTabel = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    const date = timestamp.toDate();
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit" });
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1400px", margin: "0 auto" }}>
      
      {/* HEADER UTAMA */}
      <div style={{ marginBottom: "20px", borderBottom: "2px solid #eee", paddingBottom: "10px" }}>
        <h2 style={{ margin: "0 0 5px 0", color: "#da251d" }}>🏢 SIBM - Buku Tamu Digital & Log Kehadiran</h2>
        <span style={{ fontSize: "14px", fontWeight: "bold", color: "#555" }}>
          🕒 Waktu Real-time: {waktuSekarang || "Memuat..."}
        </span>
      </div>

      {/* --- LAYOUT SPLIT SCREEN: KIRI & KANAN --- */}
      <div style={{ display: "flex", gap: "30px", flexWrap: "wrap" }}>
        
        {/* ================= SISI KIRI: FORM INPUT ================= */}
        <div style={{ flex: "1 1 400px", background: "#fdfdfd", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0", maxHeight: "fit-content" }}>
          <h3 style={{ marginTop: "0", color: "#333", borderBottom: "1px solid #ddd", paddingBottom: "8px" }}>📋 Input Data Tamu</h3>
          
          {isSuccess && (
            <div style={{ background: "#e6fffa", color: "#234e52", padding: "10px", borderRadius: "5px", marginBottom: "15px", fontSize: "14px" }}>
              ✓ Data berhasil disimpan ke Firebase!
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Kategori / Metode:</label>
              <select value={kategori} onChange={(e) => { setKategori(e.target.value); setIsSuccess(false); }} style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}>
                <option value="visitor">Visitor (Tamu Umum)</option>
                <option value="karyawan">Karyawan (Internal)</option>
                <option value="magang">Anak Magang (Intern)</option>
              </select>
            </div>

            {kategori === "karyawan" ? (
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Cari Nama Karyawan:</label>
                <input type="text" placeholder="Ketik nama karyawan..." value={cariKaryawan} onChange={(e) => setCariKaryawan(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }} />
                {cariKaryawan && (
                  <div style={{ border: "1px solid #ccc", maxHeight: "120px", overflowY: "auto", background: "#fff", position: "absolute", zIndex: 10, width: "360px" }}>
                    {karyawanTerfilter.map((nama, index) => (
                      <div key={index} onClick={() => { setKaryawanTerpilih(nama); setCariKaryawan(""); }} style={{ padding: "10px", cursor: "pointer", borderBottom: "1px solid #eee" }}>{nama}</div>
                    ))}
                  </div>
                )}
                {karyawanTerpilih && <p style={{ marginTop: "5px", color: "green", fontSize: "13px" }}>Terpilih: <strong>{karyawanTerpilih}</strong></p>}
              </div>
            ) : (
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Nama {kategori === "visitor" ? "Visitor" : "Anak Magang"}:</label>
                <input type="text" placeholder={`Masukkan nama ${kategori}...`} value={namaTamu} onChange={(e) => setNamaTamu(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }} required />
              </div>
            )}

            {kategori !== "karyawan" && (
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Asal Instansi / Perusahaan:</label>
                <input type="text" placeholder="Contoh: PT. Maju Bersama, Universitas X" value={instansi} onChange={(e) => setInstansi(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }} required />
              </div>
            )}

            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>Keperluan / Tujuan:</label>
              <textarea placeholder="Keperluan..." value={tujuan} onChange={(e) => setTujuan(e.target.value)} style={{ width: "100%", padding: "10px", height: "60px", borderRadius: "4px", border: "1px solid #ccc", resize: "none" }} required />
            </div>

            <button type="submit" disabled={isLoading || (kategori === "karyawan" && !karyawanTerpilih)} style={{ padding: "12px", background: "#da251d", color: "#fff", border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "4px", marginTop: "5px" }}>
              {isLoading ? "Menyimpan..." : "Simpan Log Tamu"}
            </button>
          </form>
        </div>

        {/* ================= SISI KANAN: TABEL LOG & FILTER PENCARIAN ================= */}
        <div style={{ flex: "2 1 600px", minWidth: "350px" }}>
          
          {/* AREA FILTER / PENCARIAN */}
          <div style={{ background: "#edf2f7", padding: "15px", borderRadius: "8px", marginBottom: "15px", display: "flex", gap: "15px", flexWrap: "wrap", alignItems: "center" }}>
            <h4 style={{ margin: "0", color: "#2d3748" }}>🔍 Filter Log:</h4>
            
            {/* Input Cari Nama */}
            <div style={{ flex: "1" }}>
              <input 
                type="text" 
                placeholder="Cari nama karyawan / visitor..." 
                value={searchNamaTabel}
                onChange={(e) => setSearchNamaTabel(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e0" }}
              />
            </div>

            {/* Input Pilih Tanggal */}
            <div>
              <input 
                type="date" 
                value={filterTanggal}
                onChange={(e) => setFilterTanggal(e.target.value)}
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e0", cursor: "pointer" }}
              />
            </div>

            {/* Tombol Reset Filter */}
            {(searchNamaTabel || filterTanggal) && (
              <button 
                onClick={() => { setSearchNamaTabel(""); setFilterTanggal(""); }}
                style={{ padding: "8px 12px", background: "#718096", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* TABEL LOG DATA */}
          <div style={{ overflowX: "auto" }}>
            <table border={1} cellPadding={8} style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#e2e8f0", color: "#2d3748" }}>
                  <th>Tgl</th>
                  <th>Nama</th>
                  <th>Kategori</th>
                  <th>Instansi/Unit</th>
                  <th>Tujuan</th>
                  <th>Masuk</th>
                  <th>Pulang</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dataTabelTerfilter.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "#718096", padding: "20px" }}>
                      Tidak ada data log yang cocok dengan kriteria pencarian.
                    </td>
                  </tr>
                ) : (
                  dataTabelTerfilter.map((tamu) => (
                    <tr key={tamu.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ color: "#4a5568" }}>{formatTanggalTabel(tamu.jam_masuk)}</td>
                      <td><strong>{tamu.nama}</strong></td>
                      <td>
                        <span style={{ 
                          padding: "2px 6px", 
                          borderRadius: "4px", 
                          fontSize: "11px",
                          background: tamu.kategori === "karyawan" ? "#ebf8ff" : tamu.kategori === "magang" ? "#feebc8" : "#edf2f7",
                          color: tamu.kategori === "karyawan" ? "#2b6cb0" : tamu.kategori === "magang" ? "#c05621" : "#4a5568"
                        }}>
                          {tamu.kategori.toUpperCase()}
                        </span>
                      </td>
                      <td>{tamu.instansi}</td>
                      <td>{tamu.tujuan}</td>
                      <td>{formatWaktu(tamu.jam_masuk)}</td>
                      <td>{tamu.jam_keluar ? formatWaktu(tamu.jam_keluar) : <span style={{ color: "#dd6b20", fontSize: "12px" }}>Di Gedung</span>}</td>
                      <td>
                        {tamu.status === "Masuk" ? (
                          <label style={{ cursor: "pointer", color: "#3182ce", display: "flex", alignItems: "center", gap: "4px", fontWeight: "bold" }}>
                            <input 
                              type="checkbox" 
                              onChange={() => handlePulang(tamu.id)} 
                              style={{ cursor: "pointer" }}
                            /> 
                            Pulang
                          </label>
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