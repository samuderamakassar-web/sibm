"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, Timestamp, where } from "firebase/firestore";
import { db } from "../../../../lib/firebase"; 

// ==========================================
// INTERFACES
// ==========================================
interface StockItem {
  id: string;
  nama_barang: string;
  qty: number;
  batas_minimum: number;
}

interface StockLog {
  id: string;
  nama_barang: string;
  jenis_transaksi: string;
  jumlah_perubahan: number;
  sisa_stok_akhir: number;
  pic_bertugas: string;
  waktu_transaksi: Timestamp | null;
}

// BARU: Interface untuk Pengajuan Barang
interface PurchaseRequest {
  id: string;
  nama_barang: string;
  sisa_stok: number;
  status: string; // "Menunggu", "Disetujui", "Dibelikan", "Ditolak"
  diajukan_oleh: string;
  waktu_pengajuan: Timestamp | null;
}

export default function StockOpnamePage() {
  const router = useRouter();

  const [picName, setPicName] = useState("");
  const [isReady, setIsReady] = useState(false);
  
  // Data States
  const [items, setItems] = useState<StockItem[]>([]);
  const [riwayatLogs, setRiwayatLogs] = useState<StockLog[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]); // Data PR
  
  // Form States
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ nama_barang: "", qty: 0, batas_minimum: 5 });
  const [isLoading, setIsLoading] = useState(false);

  const picRef = useRef("");

  // ==========================================
  // EFEK 1: Verifikasi Akses & Identitas
  // ==========================================
  useEffect(() => {
    const siapkanIdentitas = async () => {
      const nama = localStorage.getItem("pic_nama") || "";
      const role = (localStorage.getItem("pic_role") || "").toLowerCase();
      const dept = (localStorage.getItem("pic_dept") || "").toLowerCase();

      const isAuthorized = role.includes("admin") || role.includes("koordinator") || dept.includes("ob & cs");

      if (!isAuthorized || !nama) {
        alert("Akses Ditolak! Halaman ini khusus tim operasional OB & CS.");
        router.push("/dashboard/ob");
        return;
      }

      setPicName(nama);
      picRef.current = nama;
    };
    siapkanIdentitas();
  }, [router]);

  // ==========================================
  // EFEK 2: Listener Stok, Riwayat & PR (Real-time)
  // ==========================================
  useEffect(() => {
    if (!picName) return;

    // A. Listener Stok Utama
    const stockRef = collection(db, "ob_stock");
    const unsubscribeStock = onSnapshot(stockRef, (snapshot) => {
      const stockList: StockItem[] = [];
      snapshot.forEach(docSnap => stockList.push({ ...docSnap.data(), id: docSnap.id } as StockItem));
      stockList.sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));
      setItems(stockList);
      setIsReady(true);
    });

    // B. Listener Riwayat Transaksi (20 Terbaru)
    const logRef = collection(db, "ob_stock_logs");
    const qLog = query(logRef, orderBy("waktu_transaksi", "desc"), limit(20));
    const unsubscribeLog = onSnapshot(qLog, (snapshot) => {
      const logsData: StockLog[] = [];
      snapshot.forEach(docSnap => logsData.push({ ...docSnap.data(), id: docSnap.id } as StockLog));
      setRiwayatLogs(logsData);
    });

    // C. Listener Status Pengajuan Pembelian (Purchase Requests)
    const prRef = collection(db, "purchase_requests");
    const qPr = query(prRef, where("departemen", "==", "OB & CS"), orderBy("waktu_pengajuan", "desc"), limit(15));
    const unsubscribePr = onSnapshot(qPr, (snapshot) => {
      const prData: PurchaseRequest[] = [];
      snapshot.forEach(docSnap => prData.push({ ...docSnap.data(), id: docSnap.id } as PurchaseRequest));
      setPurchaseRequests(prData);
    });

    return () => {
      unsubscribeStock();
      unsubscribeLog();
      unsubscribePr();
    };
  }, [picName]);

  // ==========================================
  // FUNGSI HANDLER
  // ==========================================
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
          nama_barang: formData.nama_barang, qty: formData.qty, batas_minimum: formData.batas_minimum, terakhir_diupdate: serverTimestamp(), diupdate_oleh: picRef.current
        });
      } else {
        await addDoc(collection(db, "ob_stock"), {
          nama_barang: formData.nama_barang, qty: formData.qty, batas_minimum: formData.batas_minimum, terakhir_diupdate: serverTimestamp(), diupdate_oleh: picRef.current
        });
      }
      setFormData({ nama_barang: "", qty: 0, batas_minimum: 5 });
      setIsEditMode(false);
      setEditId(null);
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan sistem saat menyimpan data.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickUpdate = async (id: string, nama_barang: string, currentQty: number, change: number) => {
    const newQty = currentQty + change;
    if (newQty < 0) return; 

    try {
      await updateDoc(doc(db, "ob_stock", id), { qty: newQty, terakhir_diupdate: serverTimestamp(), diupdate_oleh: picRef.current });
      await addDoc(collection(db, "ob_stock_logs"), {
        id_barang: id, nama_barang: nama_barang, jenis_transaksi: change > 0 ? "MASUK (TAMBAH)" : "KELUAR (PAKAI)", jumlah_perubahan: Math.abs(change), sisa_stok_akhir: newQty, pic_bertugas: picRef.current, waktu_transaksi: serverTimestamp()
      });
    } catch (error) {
      console.error(error);
      alert("Gagal memproses transaksi stok.");
    }
  };

  const handleDelete = async (id: string, nama_barang: string) => {
    if (!window.confirm(`Hapus permanen item "${nama_barang}" dari daftar inventori?`)) return;
    try { await deleteDoc(doc(db, "ob_stock", id)); } catch (error) { console.error(error); }
  };

  const handleEdit = (item: StockItem) => {
    setIsEditMode(true);
    setEditId(item.id);
    setFormData({ nama_barang: item.nama_barang, qty: item.qty, batas_minimum: item.batas_minimum });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // BARU: Fungsi Ajukan Restock Barang
  const handleAjukanRestock = async (item: StockItem) => {
    if (!window.confirm(`Kirim pengajuan pembelian "${item.nama_barang}" ke Admin GA?`)) return;
    try {
      await addDoc(collection(db, "purchase_requests"), {
        departemen: "OB & CS",
        nama_barang: item.nama_barang,
        sisa_stok: item.qty,
        status: "Menunggu Approval", // Status awal saat masuk ke meja Admin
        diajukan_oleh: picRef.current,
        waktu_pengajuan: serverTimestamp()
      });
      alert(`✅ Permintaan restock ${item.nama_barang} berhasil dikirim ke Admin GA!`);
    } catch (error) {
      console.error(error);
      alert("Gagal mengirim pengajuan.");
    }
  };

  const formatJam = (timestamp: Timestamp | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  if (!isReady) return null;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      
      {/* 🔹 TOP BAR NAVBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.push("/dashboard/ob")} style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>⬅️</button>
          <span style={{ fontWeight: "bold", color: "#2d3748", fontSize: "16px", borderLeft: "2px solid #e2e8f0", paddingLeft: "10px" }}>Kembali</span>
        </div>
        <div style={{ background: "#fffaf0", color: "#dd6b20", padding: "8px 15px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", border: "1px solid #feebc8" }}>
          🧴 Petugas: {picName}
        </div>
      </div>

      {/* 🔹 HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #c05621 0%, #ed8936 100%)", padding: "40px 20px 70px 20px", color: "white", textAlign: "center", borderRadius: "0 0 30px 30px", boxShadow: "0 10px 20px rgba(237, 137, 54, 0.2)" }}>
        <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>INVENTORI GUDANG OB</h1>
        <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Kelola stok persediaan alat kebersihan dan ajukan permintaan restock barang</p>
      </div>

      {/* 🔹 MAIN CONTENT WRAPPER */}
      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ display: "flex", flexWrap: "wrap", gap: "25px", alignItems: "flex-start" }}>
          
          {/* ======================================= */}
          {/* KOLOM KIRI: FORM (STICKY)               */}
          {/* ======================================= */}
          <div style={{ flex: "1 1 350px", background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", position: "sticky", top: "80px", borderTop: isEditMode ? "5px solid #d69e2e" : "5px solid #dd6b20" }}>
            <h2 style={{ margin: "0 0 5px 0", color: isEditMode ? "#b7791f" : "#c05621", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>{isEditMode ? "✏️" : "📦"}</span> {isEditMode ? "Edit Item Gudang" : "Tambah Item Baru"}
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Pastikan data sistem sesuai dengan fisik di gudang.</p>
            
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Nama Barang</label>
                <input type="text" name="nama_barang" value={formData.nama_barang} onChange={handleInputChange} required placeholder="Contoh: Sabun Lantai" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", outline: "none", background: "#f8fafc" }} />
              </div>
              
              <div style={{ display: "flex", gap: "15px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Stok (Qty)</label>
                  <input type="number" name="qty" value={formData.qty} onChange={handleInputChange} required min="0" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", outline: "none", background: "#f8fafc" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#4a5568" }}>Limit Alert</label>
                  <input type="number" name="batas_minimum" value={formData.batas_minimum} onChange={handleInputChange} required min="1" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e0", fontSize: "14px", outline: "none", background: "#f8fafc" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" disabled={isLoading} style={{ flex: 1, padding: "15px", background: isLoading ? "#cbd5e0" : (isEditMode ? "#d69e2e" : "#dd6b20"), color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: isLoading ? "not-allowed" : "pointer", boxShadow: isLoading ? "none" : (isEditMode ? "0 4px 6px rgba(214, 158, 46, 0.3)" : "0 4px 6px rgba(221, 107, 32, 0.3)"), transition: "0.2s" }}>
                  {isLoading ? "Memproses..." : (isEditMode ? "💾 Simpan Perubahan" : "➕ Tambahkan")}
                </button>
                {isEditMode && (
                  <button type="button" onClick={() => { setIsEditMode(false); setEditId(null); setFormData({ nama_barang: "", qty: 0, batas_minimum: 5 }); }} style={{ padding: "15px 20px", background: "#edf2f7", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", color: "#4a5568", transition: "0.2s" }}>
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* ======================================= */}
          {/* KOLOM KANAN: DAFTAR STOK, PR, & LOGS    */}
          {/* ======================================= */}
          <div style={{ flex: "2 1 500px", display: "flex", flexDirection: "column", gap: "25px" }}>
            
            {/* DAFTAR STOK GUDANG */}
            <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
              <h2 style={{ margin: "0 0 15px 0", color: "#2d3748", fontSize: "18px", borderBottom: "2px solid #edf2f7", paddingBottom: "15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📋 Kondisi Stok Gudang</span>
                <span style={{ fontSize: "12px", background: "#edf2f7", color: "#4a5568", padding: "4px 10px", borderRadius: "20px" }}>{items.length} Item</span>
              </h2>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                {items.length > 0 ? items.map((item) => {
                  const isLowStock = item.qty <= item.batas_minimum;
                  return (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", borderRadius: "16px", border: isLowStock ? "2px solid #feb2b2" : "1px solid #e2e8f0", background: isLowStock ? "#fff5f5" : "#f8fafc", flexWrap: "wrap", gap: "15px", transition: "0.2s" }}>
                      
                      <div style={{ flex: "1 1 200px" }}>
                        <div style={{ fontWeight: "bold", fontSize: "16px", color: isLowStock ? "#c53030" : "#2d3748", display: "flex", alignItems: "center", gap: "8px" }}>
                          {item.nama_barang} {isLowStock && <span style={{ fontSize: "14px" }} title="Stok Menipis">⚠️</span>}
                        </div>
                        <div style={{ fontSize: "12px", color: "#718096", marginTop: "4px" }}>
                          Batas minimum: <strong style={{ color: "#4a5568" }}>{item.batas_minimum}</strong>
                        </div>
                      </div>

                      {/* Kontrol Kuantitas */}
                      <div style={{ display: "flex", alignItems: "center", gap: "15px", background: "white", padding: "8px 12px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                        <button onClick={() => handleQuickUpdate(item.id, item.nama_barang, item.qty, -1)} style={{ width: "35px", height: "35px", borderRadius: "10px", background: "#fff5f5", border: "1px solid #fed7d7", fontSize: "18px", fontWeight: "bold", cursor: "pointer", color: "#c53030", display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                        <div style={{ textAlign: "center", minWidth: "50px" }}>
                          <span style={{ display: "block", fontSize: "22px", fontWeight: "900", color: isLowStock ? "#e53e3e" : "#319795", lineHeight: "1" }}>{item.qty}</span>
                          <span style={{ fontSize: "9px", color: "#a0aec0", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "1px" }}>Sisa</span>
                        </div>
                        <button onClick={() => handleQuickUpdate(item.id, item.nama_barang, item.qty, 1)} style={{ width: "35px", height: "35px", borderRadius: "10px", background: "#f0fff4", border: "1px solid #c6f6d5", fontSize: "18px", fontWeight: "bold", cursor: "pointer", color: "#2f855a", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                      </div>

                      {/* Tombol Aksi & Restock */}
                      <div style={{ display: "flex", gap: "8px" }}>
                        {isLowStock && (
                          <button onClick={() => handleAjukanRestock(item)} style={{ background: "#ed8936", color: "white", border: "none", padding: "8px 12px", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "12px", display: "flex", alignItems: "center", gap: "5px", boxShadow: "0 2px 4px rgba(237, 137, 54, 0.3)" }}>
                            🛒 Ajukan
                          </button>
                        )}
                        <button onClick={() => handleEdit(item)} style={{ background: "transparent", color: "#d69e2e", border: "1px solid #d69e2e", width: "35px", height: "35px", borderRadius: "10px", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }} title="Edit">✏️</button>
                        <button onClick={() => handleDelete(item.id, item.nama_barang)} style={{ background: "transparent", color: "#e53e3e", border: "1px solid #e53e3e", width: "35px", height: "35px", borderRadius: "10px", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }} title="Hapus">🗑️</button>
                      </div>
                    </div>
                  );
                }) : (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "#a0aec0", border: "2px dashed #e2e8f0", borderRadius: "16px" }}>Gudang masih kosong.</div>
                )}
              </div>
            </div>

            {/* STATUS PENGAJUAN BARANG (BARU) */}
            <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", borderTop: "5px solid #ecc94b" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "#b7791f", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>📝</span> Status Pengajuan Restock (PO)
              </h2>
              <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Pantau permintaan barang yang Anda ajukan ke Admin GA.</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {purchaseRequests.length > 0 ? purchaseRequests.map((pr) => {
                  const isApproved = pr.status.includes("Disetujui") || pr.status.includes("Dibelikan");
                  const isRejected = pr.status.includes("Tolak");
                  return (
                    <div key={pr.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 15px", borderRadius: "12px", border: "1px solid #edf2f7", background: "#f8fafc" }}>
                      <div>
                        <div style={{ fontWeight: "bold", color: "#2d3748", fontSize: "14px" }}>{pr.nama_barang}</div>
                        <div style={{ fontSize: "11px", color: "#a0aec0" }}>Sisa saat diajukan: {pr.sisa_stok} | Oleh: {pr.diajukan_oleh}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ 
                          background: isApproved ? "#c6f6d5" : (isRejected ? "#fed7d7" : "#feebc8"), 
                          color: isApproved ? "#22543d" : (isRejected ? "#9b2c2c" : "#9c4221"), 
                          padding: "4px 10px", borderRadius: "8px", fontWeight: "bold", fontSize: "11px" 
                        }}>
                          {pr.status}
                        </span>
                        <div style={{ fontSize: "10px", color: "#cbd5e0", marginTop: "4px" }}>{formatJam(pr.waktu_pengajuan)}</div>
                      </div>
                    </div>
                  );
                }) : (
                  <div style={{ padding: "20px", textAlign: "center", color: "#a0aec0", border: "1px dashed #e2e8f0", borderRadius: "12px", fontSize: "13px" }}>Belum ada pengajuan pembelian yang aktif.</div>
                )}
              </div>
            </div>

            {/* RIWAYAT LOG TRANSAKSI */}
            <div style={{ background: "white", padding: "25px", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
              <h2 style={{ margin: "0 0 5px 0", color: "#2c5282", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>📜</span> Riwayat Transaksi Stok
              </h2>
              <p style={{ margin: "0 0 20px 0", color: "#718096", fontSize: "13px" }}>Audit trail pencatatan aktivitas keluar-masuk barang.</p>
              
              <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", color: "#4a5568" }}>
                      <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Waktu</th>
                      <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Petugas OB</th>
                      <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0" }}>Nama Barang</th>
                      <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", textAlign: "center" }}>Aktivitas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riwayatLogs.length > 0 ? riwayatLogs.map((log) => {
                      const isMasuk = log.jenis_transaksi.includes("MASUK");
                      return (
                        <tr key={log.id} style={{ borderBottom: "1px solid #edf2f7" }}>
                          <td style={{ padding: "12px 15px", color: "#718096", whiteSpace: "nowrap" }}>{formatJam(log.waktu_transaksi)}</td>
                          <td style={{ padding: "12px 15px", fontWeight: "bold", color: "#2b6cb0" }}>{log.pic_bertugas}</td>
                          <td style={{ padding: "12px 15px", color: "#2d3748", fontWeight: "bold" }}>{log.nama_barang}</td>
                          <td style={{ padding: "12px 15px", textAlign: "center" }}>
                            <div style={{ background: isMasuk ? "#f0fff4" : "#fff5f5", color: isMasuk ? "#22543d" : "#9b2c2c", border: isMasuk ? "1px solid #9ae6b4" : "1px solid #feb2b2", padding: "6px 10px", borderRadius: "8px", fontWeight: "bold", fontSize: "11px", display: "inline-block" }}>
                              {isMasuk ? `+${log.jumlah_perubahan}` : `-${log.jumlah_perubahan}`} (Sisa: {log.sisa_stok_akhir})
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "#a0aec0" }}>Belum ada aktivitas.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}