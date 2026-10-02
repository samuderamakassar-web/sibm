"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, where, limit } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../ui/ToastProvider";
import { handleFotoUpload } from "../../../lib/uploadFoto";
import AdminShell from "../../admin/AdminShell";
import { useInspeksiDriver } from "../../../lib/sopChecklist";
import { daerahTulis } from "@/lib/daerah";


interface KendaraanMaster {
  id: string;
  kendaraan: string;
}
interface InspeksiTerakhir {
  tanggal: string;
  minggu_of: string;
}

// Item inspeksi diatur Admin GA di /admin/sop-checklist (§81) -- lihat useInspeksiDriver() di komponen.
const STATUS_OPSI = ["Baik", "Perlu Perhatian", "Rusak"];

// Senin minggu berjalan dihitung dari TANGGAL WITA (§66) -- dulu hari dari jam perangkat lalu
// diformat WITA, bisa meleset sehari bila zona waktu HP berbeda.
function getMondayOfWeek(d: Date = new Date()): string {
  const [y, m, tgl] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(d).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, tgl));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}


const sharedInputStyle = {
  width: "100%", padding: "16px", borderRadius: "14px", border: "1px solid var(--line)",
  fontSize: "15px", background: "var(--bg)", outline: "none", boxSizing: "border-box" as const,
  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s", color: "var(--ink)"
};

export default function DriverInspeksiPage() {
  const showToast = useToast();

  const { session, isReady } = useAuthGuard({
    depts: ["Driver"],
    adminBypass: false,
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Tim Driver.",
  });
  const activeDriver = session?.nama || "Driver";
  // Item inspeksi dari master /admin/sop-checklist (§81), hanya yang aktif.
  const { nilai: masterInspeksi } = useInspeksiDriver();
  const CHECKLIST_ITEMS = masterInspeksi.filter((x) => x.aktif !== false).map((x) => ({ key: x.key, label: x.label }));
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());

  const [kendaraanMaster, setKendaraanMaster] = useState<KendaraanMaster[]>([]);
  const [kendaraanId, setKendaraanId] = useState<string>("");
  const [inspeksiTerakhir, setInspeksiTerakhir] = useState<InspeksiTerakhir | null>(null);

  // Hanya menyimpan pilihan yang diubah; item lain bernilai "Baik" (lihat nilaiItem).
  const [inspeksiChecklist, setInspeksiChecklist] = useState<Record<string, string>>({});
  const nilaiItem = (key: string) => inspeksiChecklist[key] || "Baik";
  const [catatanInspeksi, setCatatanInspeksi] = useState("");

  // 📸 Foto WAJIB per bagian yang diinspeksi — key: CHECKLIST_ITEMS.key, value: url foto
  const [fotoPerBagian, setFotoPerBagian] = useState<Record<string, string>>({});
  const [uploadingPerBagian, setUploadingPerBagian] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "master_kendaraan"), orderBy("kendaraan", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setKendaraanMaster(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KendaraanMaster)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (kendaraanMaster.length === 0) return;
    if (!kendaraanId || !kendaraanMaster.some((k) => k.id === kendaraanId)) {
      setTimeout(() => setKendaraanId(kendaraanMaster[0].id), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kendaraanMaster]);

  useEffect(() => {
    if (!kendaraanId) return;
    const q = query(collection(db, "kendaraan_inspeksi_logs"), where("kendaraan_id", "==", kendaraanId), orderBy("tanggal", "desc"), limit(1));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setInspeksiTerakhir({ tanggal: data.tanggal, minggu_of: data.minggu_of });
      } else {
        setInspeksiTerakhir(null);
      }
    });
    return () => unsub();
  }, [kendaraanId]);

  const kendaraanTerpilih = kendaraanMaster.find((k) => k.id === kendaraanId);
  const kendaraan = kendaraanTerpilih?.kendaraan || "";
  const sudahInspeksiMingguIni = inspeksiTerakhir?.minggu_of === getMondayOfWeek();
  const adaUploadBerjalan = Object.values(uploadingPerBagian).some(Boolean);

  const handleFotoBagianUpload = (itemKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFotoUpload(
      file, "sibm/inspeksi",
      () => setUploadingPerBagian((prev) => ({ ...prev, [itemKey]: true })),
      (url) => setFotoPerBagian((prev) => ({ ...prev, [itemKey]: url })),
      (err) => { console.error(err); showToast("Gagal upload foto, coba lagi.", "error"); },
      () => setUploadingPerBagian((prev) => ({ ...prev, [itemKey]: false }))
    );
  };

  const handleSubmitInspeksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kendaraanId) return showToast("Pilih kendaraan dulu.", "warning");
    if (adaUploadBerjalan) return showToast("Tunggu semua foto selesai diunggah dulu.", "warning");

    const itemBelumFoto = CHECKLIST_ITEMS.find((item) => !fotoPerBagian[item.key]);
    if (itemBelumFoto) {
      return showToast(`Foto untuk "${itemBelumFoto.label}" wajib dilampirkan.`, "warning");
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, "kendaraan_inspeksi_logs"), { daerah: daerahTulis(),
        kendaraan_id: kendaraanId,
        kendaraan: kendaraan,
        driver: activeDriver,
        tanggal: todayISO,
        minggu_of: getMondayOfWeek(),
        checklist: Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, nilaiItem(i.key)])),
        // Label disimpan bersama laporan supaya item baru/berubah tetap terbaca di admin Kendaraan.
        label_checklist: Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, i.label])),
        catatan: catatanInspeksi.trim(),
        checklist_foto: fotoPerBagian,
        foto_url: (CHECKLIST_ITEMS[0] && fotoPerBagian[CHECKLIST_ITEMS[0].key]) || "",
        waktu_catat: serverTimestamp(),
      });
      showToast("Inspeksi mingguan berhasil disimpan!", "success");
      setInspeksiChecklist({});
      setCatatanInspeksi("");
      setFotoPerBagian({});
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan inspeksi.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isReady) return null;

  return (
    <AdminShell title="Inspeksi Mingguan" subtitle="Cek kondisi kendaraan & lampirkan foto tiap bagian sebelum beroperasi" userName={activeDriver || "Staf"} backHref={"/dashboard/driver"} backLabel={"Menu Driver"}>
      <style dangerouslySetInnerHTML={{__html: `
        * { box-sizing: border-box; }
      `}} />

      <div>
        <div style={{ background: "var(--surface)", padding: "25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)" }}>

          {kendaraanMaster.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "13px", background: "var(--bg)", borderRadius: "12px", border: "1px dashed var(--line)" }}>
              Belum ada data kendaraan. Hubungi Admin untuk menambahkan kendaraan di Master Data.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "var(--ink-soft)" }}>PILIH KENDARAAN *</label>
                <select value={kendaraanId} onChange={(e) => setKendaraanId(e.target.value)} style={{...sharedInputStyle, fontWeight:"bold", border: "2px solid var(--line)"}}>
                  {kendaraanMaster.map(mobil => <option key={mobil.id} value={mobil.id}>{mobil.kendaraan}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--line)", paddingBottom: "12px", marginBottom: "15px" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-soft)" }}>Status minggu ini:</p>
                <span style={{ fontSize: "10px", fontWeight: "bold", padding: "5px 10px", borderRadius: "8px", background: sudahInspeksiMingguIni ? "#c6f6d5" : "#feebc8", color: sudahInspeksiMingguIni ? "#22543d" : "#9c4221" }}>
                  {sudahInspeksiMingguIni ? "✅ SUDAH MINGGU INI" : "⚠️ BELUM MINGGU INI"}
                </span>
              </div>

              <form onSubmit={handleSubmitInspeksi} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {CHECKLIST_ITEMS.map((item) => {
                  const fotoItem = fotoPerBagian[item.key];
                  const uploadingItem = !!uploadingPerBagian[item.key];
                  return (
                    <div key={item.key} style={{ border: "1px solid var(--line)", borderRadius: "14px", padding: "12px" }}>
                      <label style={{ display: "block", fontWeight: "700", marginBottom: "6px", fontSize: "12px", color: "var(--ink-soft)" }}>{item.label} *</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginBottom: "10px" }}>
                        {STATUS_OPSI.map((opsi) => {
                          const dipilih = nilaiItem(item.key) === opsi;
                          const warna = opsi === "Baik" ? "#38a169" : opsi === "Perlu Perhatian" ? "#d69e2e" : "#e53e3e";
                          return (
                            <button
                              type="button"
                              key={opsi}
                              onClick={() => setInspeksiChecklist((prev) => ({ ...prev, [item.key]: opsi }))}
                              style={{
                                padding: "8px 4px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer",
                                border: dipilih ? `2px solid ${warna}` : "1px solid var(--line)",
                                background: dipilih ? `${warna}1a` : "var(--bg)",
                                color: dipilih ? warna : "#a0aec0",
                              }}
                            >
                              {opsi}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--bg)", border: fotoItem ? "1px solid var(--line)" : "1px dashed #fc8181", borderRadius: "10px", padding: "10px" }}>
                        {fotoItem ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fotoItem} alt={`Foto ${item.label}`} style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
                        ) : (
                          <span style={{ fontSize: "18px" }}>📸</span>
                        )}
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "inline-block", padding: "6px 12px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", color: "var(--ink-soft)", cursor: "pointer" }}>
                            {uploadingItem ? "⏳ Mengunggah..." : (fotoItem ? "Ganti Foto" : "Wajib Upload Foto")}
                            <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFotoBagianUpload(item.key, e)} disabled={uploadingItem} style={{ display: "none" }} />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div>
                  <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", fontSize: "12px", color: "var(--ink-soft)" }}>CATATAN TAMBAHAN</label>
                  <textarea placeholder="Opsional — jelaskan kalau ada item Perlu Perhatian/Rusak" value={catatanInspeksi} onChange={(e) => setCatatanInspeksi(e.target.value)} style={{ ...sharedInputStyle, height: "60px", resize: "none", fontSize: "13px" }} />
                </div>

                <button type="submit" disabled={isSaving || adaUploadBerjalan} style={{ width: "100%", padding: "16px", background: isSaving ? "#a0aec0" : "#38a169", color: "#fff", border: "none", borderRadius: "14px", fontWeight: "900", fontSize: "14px", cursor: isSaving ? "not-allowed" : "pointer", boxShadow: isSaving ? "none" : "0 4px 15px rgba(56, 161, 105, 0.3)" }}>
                  {isSaving ? "Menyimpan..." : "✅ Kirim Inspeksi Mingguan"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
