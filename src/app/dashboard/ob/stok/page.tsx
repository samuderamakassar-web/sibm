"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
// Tambahan fungsi query, orderBy, limit untuk menarik riwayat
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

interface StockItem {
  id: string;
  nama_barang: string;
  qty: number;
  batas_minimum: number;
}

// Interface untuk Riwayat (Log)
interface StockLog {
  id: string;
  nama_barang: string;
  jenis_transaksi: string;
  jumlah_perubahan: number;
  sisa_stok_akhir: number;
  pic_bertugas: string;
  waktu_transaksi: Timestamp | null;
}

export default function StockOpnamePage() {
  const router = useRouter();

  const [picName, setPicName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [items, setItems] = useState<StockItem[]>([]);
  
  // State Baru untuk Riwayat Log
  const [riwayatLogs, setRiwayatLogs] = useState<StockLog[]>([]);
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nama_barang: "",
    qty: 0,
    batas_minimum: 5
  });
  const [isLoading, setIsLoading] = useState(false);

  const picRef = useRef("");

  // EFEK 1: Pengecekan Akses
  useEffect(() => {
    const siapkanIdentitas = async () => {
      const nama = localStorage.getItem("pic_nama");
      if (!nama) {
        router.push("/shift-checkin");
      } else {
        setPicName(nama);
        picRef.current = nama;
      }
    };
    siapkanIdentitas();
  }, [router]);

  // EFEK 2: Listener Stok & Listener Riwayat Transaksi
  useEffect(() => {
    if (!picName) return;

    // A. Listener Stok Utama
    const stockRef = collection(db, "ob_stock");
    const unsubscribeStock = onSnapshot(stockRef, (snapshot) => {
      const stockList: StockItem[] = [];
      snapshot.forEach(doc => {
        stockList.push({ ...doc.data(), id: doc.id } as StockItem);
      });
      stockList.sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));
      setItems(stockList);
      setIsReady(true);
    });

    // B. Listener Riwayat Transaksi (Ambil 20 transaksi terbaru saja)
    const logRef = collection(db, "ob_stock_logs");
    const qLog = query(logRef, orderBy("waktu_transaksi", "desc"), limit(20));
    const unsubscribeLog = onSnapshot(qLog, (snapshot) => {
      const logsData: StockLog[] = [];
      snapshot.forEach(doc => {
        logsData.push({ ...doc.data(), id: doc.id } as StockLog);
      });
      setRiwayatLogs(logsData);
    });

    return () => {
      unsubscribeStock();
      unsubscribeLog();
    };
  }, [picName]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === "nama_barang" ? value : Number(value) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama_barang.trim()) return alert("Nama barang wajib diisi!");

    setIsLoading(true);
    try {
      if (isEditMode && editId) {
        await updateDoc(doc(db, "ob_stock", editId), {
          nama_barang: formData.nama_barang,
          qty: formData.qty,
          batas_minimum: formData.batas_minimum,
          terakhir_diupdate: serverTimestamp(),
          diupdate_oleh: picRef.current
        });
      } else {
        await addDoc(collection(db, "ob_stock"), {
          nama_barang: formData.nama_barang,
          qty: formData.qty,
          batas_minimum: formData.batas_minimum,
          terakhir_diupdate: serverTimestamp(),
          diupdate_oleh: picRef.current
        });
      }

      setFormData({ nama_barang: "", qty: 0, batas_minimum: 5 });
      setIsEditMode(false);
      setEditId(null);
    } catch (error) {
      alert("Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickUpdate = async (id: string, nama_barang: string, currentQty: number, change: number) => {
    const newQty = currentQty + change;
    if (newQty < 0) return; 

    try {
      await updateDoc(doc(db, "ob_stock", id), {
        qty: newQty,
        terakhir_diupdate: serverTimestamp(),
        diupdate_oleh: picRef.current
      });

      await addDoc(collection(db, "ob_stock_logs"), {
        id_barang: id,
        nama_barang: nama_barang,
        jenis_transaksi: change > 0 ? "MASUK (TAMBAH)" : "KELUAR (PAKAI)",
        jumlah_perubahan: Math.abs(change),
        sisa_stok_akhir: newQty,
        pic_bertugas: picRef.current,
        waktu_transaksi: serverTimestamp()
      });
    } catch (error) {
      alert("Gagal memproses transaksi stok.");
    }
  };

  const handleDelete = async (id: string, nama_barang: string) => {
    if (!window.confirm(`Yakin ingin menghapus item ${nama_barang} dari gudang?`)) return;
    try { await deleteDoc(doc(db, "ob_stock", id)); } catch (error) { console.error(error); }
  };

  const handleEdit = (item: StockItem) => {
    setIsEditMode(true);
    setEditId(item.id);
    setFormData({ nama_barang: item.nama_barang, qty: item.qty, batas_minimum: item.batas_minimum });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Helper format jam
  const formatJam = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  if (!isReady) return null;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1000px", margin: "0 auto", background: "#f7fafc", minHeight: "100vh" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button onClick={() => router.push("/dashboard/ob")} style={{ padding: "8px 12px", background: "#e2e8f0", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", color: "#4a5568" }}>
          ⬅ Kembali
        </button>
        <div style={{ fontSize: "13px", fontWeight: "bold", color: "#dd6b20", background: "#feebc8", padding: "5px 15px", borderRadius: "20px", border: "1px solid #fbd38d" }}>
          🧴 Petugas: {picName}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "25px", alignItems: "start" }}>
        
        {/* FORM TAMBAH / EDIT ITEM */}
        <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", borderTop: "5px solid #dd6b20" }}>
          <h2 style={{ margin: "0 0 5px 0", color: "#9c4221", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📦</span> {isEditMode ? "Edit Item Gudang" : "Tambah Item Baru"}
          </h2>
          <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Pastikan data fisik di gudang sesuai dengan data sistem.</p>
          
          <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Nama Barang:</label>
              <input type="text" name="nama_barang" value={formData.nama_barang} onChange={handleInputChange} required placeholder="Contoh: Sabun Lantai" style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Stok Saat Ini (Qty):</label>
              <input type="number" name="qty" value={formData.qty} onChange={handleInputChange} required min="0" style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "5px", color: "#4a5568" }}>Batas Minimum (Alert):</label>
              <input type="number" name="batas_minimum" value={formData.batas_minimum} onChange={handleInputChange} required min="1" style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }} />
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="submit" disabled={isLoading} style={{ flex: 1, padding: "12px", background: isEditMode ? "#d69e2e" : "#dd6b20", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>
                {isLoading ? "Menyimpan..." : (isEditMode ? "Simpan Perubahan" : "Tambahkan")}
              </button>
              {isEditMode && <button type="button" onClick={() => { setIsEditMode(false); setEditId(null); setFormData({ nama_barang: "", qty: 0, batas_minimum: 5 }); }} style={{ padding: "12px", background: "#e2e8f0", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", color: "#4a5568" }}>Batal</button>}
            </div>
          </form>
        </div>

        {/* DAFTAR STOK GUDANG */}
        <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <h2 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "18px" }}>📋 Kondisi Stok Gudang ({items.length} Item)</h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {items.length > 0 ? items.map((item) => {
              const isLowStock = item.qty <= item.batas_minimum;
              return (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px", borderRadius: "10px", border: isLowStock ? "2px solid #feb2b2" : "1px solid #e2e8f0", background: isLowStock ? "#fff5f5" : "#fff", flexWrap: "wrap", gap: "15px" }}>
                  <div style={{ flex: "1", minWidth: "200px" }}>
                    <div style={{ fontWeight: "bold", fontSize: "16px", color: isLowStock ? "#c53030" : "#2d3748", display: "flex", alignItems: "center", gap: "8px" }}>
                      {item.nama_barang} {isLowStock && <span style={{ fontSize: "14px" }}>⚠️</span>}
                    </div>
                    <div style={{ fontSize: "12px", color: "#718096", marginTop: "4px" }}>Batas peringatan: {item.batas_minimum} item</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                    <button onClick={() => handleQuickUpdate(item.id, item.nama_barang, item.qty, -1)} style={{ width: "35px", height: "35px", borderRadius: "50%", background: "#edf2f7", border: "none", fontSize: "18px", fontWeight: "bold", cursor: "pointer", color: "#4a5568" }}>-</button>
                    <div style={{ textAlign: "center", minWidth: "60px" }}>
                      <span style={{ display: "block", fontSize: "24px", fontWeight: "900", color: isLowStock ? "#e53e3e" : "#319795" }}>{item.qty}</span>
                      <span style={{ fontSize: "10px", color: "#a0aec0", textTransform: "uppercase", fontWeight: "bold" }}>Sisa</span>
                    </div>
                    <button onClick={() => handleQuickUpdate(item.id, item.nama_barang, item.qty, 1)} style={{ width: "35px", height: "35px", borderRadius: "50%", background: "#edf2f7", border: "none", fontSize: "18px", fontWeight: "bold", cursor: "pointer", color: "#4a5568" }}>+</button>
                  </div>
                  <div style={{ display: "flex", gap: "8px", borderLeft: "1px solid #e2e8f0", paddingLeft: "15px" }}>
                    <button onClick={() => handleEdit(item)} style={{ background: "#ecc94b", color: "#744210", border: "none", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>Edit</button>
                    <button onClick={() => handleDelete(item.id, item.nama_barang)} style={{ background: "#fc8181", color: "#742a2a", border: "none", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>Hapus</button>
                  </div>
                </div>
              );
            }) : (
              <div style={{ padding: "30px", textAlign: "center", color: "#a0aec0", border: "1px dashed #cbd5e0", borderRadius: "8px" }}>Belum ada data barang di gudang.</div>
            )}
          </div>
        </div>

        {/* RIWAYAT LOG TRANSAKSI */}
        <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", borderTop: "5px solid #2b6cb0" }}>
          <h2 style={{ margin: "0 0 5px 0", color: "#2c5282", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📜</span> Riwayat Transaksi Stok (Audit Trail)
          </h2>
          <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Merekam secara otomatis siapa yang mengambil atau menambah barang.</p>
          
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#edf2f7", color: "#4a5568" }}>
                  <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>Waktu</th>
                  <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>Nama Petugas</th>
                  <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>Barang</th>
                  <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>Aktivitas</th>
                </tr>
              </thead>
              <tbody>
                {riwayatLogs.length > 0 ? riwayatLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "12px", color: "#718096" }}>{formatJam(log.waktu_transaksi)}</td>
                    <td style={{ padding: "12px", fontWeight: "bold", color: "#2d3748" }}>{log.pic_bertugas}</td>
                    <td style={{ padding: "12px", color: "#2d3748" }}>{log.nama_barang}</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ 
                        background: log.jenis_transaksi.includes("MASUK") ? "#c6f6d5" : "#fed7d7", 
                        color: log.jenis_transaksi.includes("MASUK") ? "#22543d" : "#9b2c2c", 
                        padding: "4px 8px", borderRadius: "4px", fontWeight: "bold", fontSize: "11px" 
                      }}>
                        {log.jenis_transaksi} {log.jumlah_perubahan} (Sisa: {log.sisa_stok_akhir})
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} style={{ padding: "20px", textAlign: "center", color: "#a0aec0" }}>Belum ada riwayat transaksi.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}