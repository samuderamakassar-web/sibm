"use client";

/**
 * Inspeksi Kondisi Aset Mingguan -- OB & CS (§113, menggantikan "temuan rusak -> tiket Helpdesk").
 * Tiga jenis (lihat src/lib/kondisiAset.ts):
 *   Fasilitas Gedung      -- per area plot harian
 *   Peralatan Kebersihan  -- alat kerja OB
 *   Utilitas Teknis       -- hanya OB tetap yang ditunjuk Admin (settings/master_kondisi_aset.petugas_utilitas)
 * Wajib: 1 foto keseluruhan area + foto tiap item (kecuali "Tidak Ada"); keterangan wajib bila kondisi bermasalah.
 * Item yang dicentang "butuh perbaikan/penggantian" -> dokumen temuan_aset untuk Admin GA (BUKAN Helpdesk).
 * Item yang temuannya sedang "Dikerjakan" terkunci; temuan "Baru/Dijadwalkan" -> pengingat, tidak membuat temuan dobel.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, doc, getDoc, getDocs, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { kirimEmail } from "@/lib/notify";
import { buildRequestBaruEmailHtml } from "@/lib/emailTemplates";
import { useToast } from "@/components/ui/ToastProvider";
import AdminShell from "../admin/AdminShell";
import Modal from "../ui/Modal";
import { daerahTulis } from "@/lib/daerah";
import {
  AREA_TETAP, KONDISI, LABEL_JENIS, LABEL_TINDAKAN, STATUS_TEMUAN_TERBUKA, WARNA_KONDISI, kodeTemuan, kondisiBermasalah, kondisiDefaultTindakan,
  useMasterKondisiAset, type HasilInspeksiItem, type InspeksiAsetLog, type JenisInspeksi, type TemuanAset,
} from "@/lib/kondisiAset";

type IconProps = { size?: number; color?: string };
const IconSearch = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
const IconMapPin = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.7 7-12a7 7 0 1 0-14 0c0 5.3 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
const IconAlertTriangle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 4.5 2.9 18a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.5 4.5a2 2 0 0 0-3 0z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
const IconCamera = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A1.5 1.5 0 0 1 9.5 3.6h5a1.5 1.5 0 0 1 1.3.8L17 6h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
const IconInbox = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);

function getTodayISOLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function isWeekend(dateISO: string): boolean {
  const hari = new Date(dateISO + "T00:00:00").getDay();
  return hari === 0 || hari === 6;
}
function getSeninMingguIni(): string {
  const d = new Date(`${getTodayISOLocal()}T00:00:00`);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatRentangMinggu(seninISO: string): string {
  const senin = new Date(`${seninISO}T00:00:00`);
  const minggu = new Date(senin);
  minggu.setDate(senin.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return `${fmt(senin)} - ${fmt(minggu)}`;
}
const tglRingkas = (ts?: Timestamp | null) => (ts ? ts.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");

async function uploadToCloudinary(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
  formData.append("folder", "sibm/inspeksi-fasilitas");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
  return (await res.json()).secure_url as string;
}
/** Kecilkan foto (lebar 700px) lalu unggah. */
function kecilkanLaluUnggah(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const skala = Math.min(1, 700 / img.width);
        canvas.width = img.width * skala;
        canvas.height = img.height * skala;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? uploadToCloudinary(blob).then(resolve, reject) : reject(new Error("blob"))), "image/jpeg", 0.65);
      };
      img.onerror = () => reject(new Error("gambar"));
      if (typeof ev.target?.result === "string") img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error("baca file"));
    reader.readAsDataURL(file);
  });
}

type ItemForm = HasilInspeksiItem & { custom?: boolean };

export default function InspeksiFasilitasPage() {
  const router = useRouter();
  const showToast = useToast();
  const { nilai: master } = useMasterKondisiAset();

  const [picName, setPicName] = useState("");
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [assignedAreas, setAssignedAreas] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [jenis, setJenis] = useState<JenisInspeksi>("gedung");
  const [selectedArea, setSelectedArea] = useState("");
  const [riwayat, setRiwayat] = useState<InspeksiAsetLog[]>([]);
  const [temuanTerbuka, setTemuanTerbuka] = useState<TemuanAset[]>([]);
  const [modalTemuan, setModalTemuan] = useState<TemuanAset[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null); // "area" | index item
  const [fotoArea, setFotoArea] = useState("");
  const [items, setItems] = useState<ItemForm[]>([]);

  const seninMingguIni = getSeninMingguIni();
  const bolehUtilitas = master.petugas_utilitas.some((n) => n.trim().toLowerCase() === picName.trim().toLowerCase());
  const areaAktif = AREA_TETAP[jenis] || selectedArea;

  // Identitas & plot area hari ini
  useEffect(() => {
    const muat = async () => {
      const nama = localStorage.getItem("pic_nama") || "";
      const dept = (localStorage.getItem("pic_dept") || "").toLowerCase();
      if (!nama || !dept.includes("ob & cs")) {
        showToast("Akses Ditolak! Halaman ini khusus staf OB & CS.", "error");
        setTimeout(() => router.push("/dashboard/ob"), 1200);
        return;
      }
      setPicName(nama);
      try {
        const todayISO = getTodayISOLocal();
        if (!isWeekend(todayISO)) {
          const plotSnap = await getDoc(doc(db, "daily_plots", todayISO));
          if (plotSnap.exists()) {
            const plots = (plotSnap.data().plot_lantai || {}) as Record<string, string>;
            const lantaiKu = Object.keys(plots).filter((l) => plots[l] === nama || plots[l] === "Semua / All");
            setAssignedAreas(lantaiKu);
            if (lantaiKu.length > 0) setSelectedArea(lantaiKu[0]);
          }
        }
      } catch (error) {
        console.error("Gagal memuat data plotting:", error);
      } finally {
        setIsPageLoading(false);
      }
    };
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Riwayat milik PIC & temuan yang masih terbuka
  useEffect(() => {
    if (!picName) return;
    const u1 = onSnapshot(query(collection(db, "inspeksi_fasilitas"), where("pic_bertugas", "==", picName), orderBy("waktu_selesai", "desc"), limit(200)), (snap) => {
      setRiwayat(snap.docs.map((d) => ({ ...(d.data() as Omit<InspeksiAsetLog, "id">), id: d.id })));
    });
    const u2 = onSnapshot(query(collection(db, "temuan_aset"), where("status", "in", STATUS_TEMUAN_TERBUKA)), (snap) => {
      setTemuanTerbuka(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TemuanAset)));
    }, (e) => console.error("[inspeksi] temuan terbuka:", e));
    return () => { u1(); u2(); };
  }, [picName]);

  const temuanUntuk = (nama: string) => (nama.trim() ? temuanTerbuka.find((t) => t.jenis === jenis && t.area === areaAktif && t.item.toLowerCase() === nama.trim().toLowerCase()) : undefined);
  const sudahMingguIni = riwayat.find((l) => (l.jenis || "gedung") === jenis && l.area === areaAktif && l.minggu_mulai === seninMingguIni);
  const daftarMaster = () => master[jenis].filter((x) => x.aktif !== false).map((x) => x.nama);
  const terkaitArea = () => daftarMaster().map((n) => temuanUntuk(n)).filter((x): x is TemuanAset => !!x);

  const mulaiInspeksi = () => {
    setFotoArea("");
    setItems(daftarMaster().map((nama) => {
      const t = temuanUntuk(nama);
      return t?.status === "Dikerjakan"
        ? { nama, kondisi: t.kondisi || "Rusak", catatan: `Sedang ditangani (${kodeTemuan(t.id)})`, foto: t.foto || "", butuh_tindakan: false }
        : { nama, kondisi: "", catatan: "", foto: "", butuh_tindakan: false };
    }));
    setStep(2);
    const terkait = terkaitArea();
    if (terkait.length) setModalTemuan(terkait);
  };

  const ubahItem = (i: number, patch: Partial<ItemForm>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const pilihKondisi = (i: number, kondisi: string) => {
    const t = temuanUntuk(items[i]?.nama || "");
    if (t?.status === "Dikerjakan") { setModalTemuan([t]); return; }
    if (t && kondisiBermasalah(kondisi) && !kondisiBermasalah(items[i]?.kondisi || "")) setModalTemuan([t]);
    ubahItem(i, { kondisi, butuh_tindakan: t ? false : kondisiDefaultTindakan(kondisi) });
  };
  const unggah = (kunci: string, file: File | undefined, simpan: (url: string) => void) => {
    if (!file) return;
    setUploading(kunci);
    kecilkanLaluUnggah(file).then(simpan).catch((e) => { console.error(e); showToast("Gagal upload foto, coba lagi.", "error"); }).finally(() => setUploading(null));
  };

  const handleSubmit = async () => {
    if (!fotoArea) return showToast("Foto keseluruhan area wajib diambil dulu.", "warning");
    const jumlahStandar = daftarMaster().length;
    const standar = items.slice(0, jumlahStandar);
    const custom = items.slice(jumlahStandar).filter((h) => h.nama.trim() && h.kondisi);
    if (standar.some((h) => !h.kondisi)) return showToast("Nilai kondisi semua item dulu.", "warning");
    const semua = [...standar, ...custom];
    const tanpaFoto = semua.find((h) => h.kondisi !== "Tidak Ada" && !h.foto);
    if (tanpaFoto) return showToast(`Foto "${tanpaFoto.nama}" wajib diambil.`, "warning");
    const tanpaKet = semua.find((h) => kondisiBermasalah(h.kondisi) && !h.catatan.trim());
    if (tanpaKet) return showToast(`Isi keterangan kondisi "${tanpaKet.nama}".`, "warning");

    setIsLoading(true);
    try {
      const hasil: HasilInspeksiItem[] = semua.map((h) => ({ nama: h.nama.trim(), kondisi: h.kondisi, catatan: h.catatan.trim(), foto: h.foto, butuh_tindakan: !!h.butuh_tindakan }));
      const ref = await addDoc(collection(db, "inspeksi_fasilitas"), {
        daerah: daerahTulis(), jenis, area: areaAktif, pic_bertugas: picName, minggu_mulai: seninMingguIni,
        waktu_selesai: serverTimestamp(), foto_area: fotoArea, hasil,
      });
      // Temuan baru hanya untuk item yang dicentang & belum punya temuan terbuka (anti dobel)
      const baru = hasil.filter((h) => h.butuh_tindakan && kondisiBermasalah(h.kondisi) && !temuanUntuk(h.nama));
      await Promise.all(baru.map((h) => addDoc(collection(db, "temuan_aset"), {
        daerah: daerahTulis(), jenis, area: areaAktif, item: h.nama, kondisi: h.kondisi, catatan: h.catatan, foto: h.foto,
        pelapor: picName, waktu_lapor: serverTimestamp(), status: "Baru", inspeksi_id: ref.id,
      })));
      if (baru.length) {
        try {
          const adminSnap = await getDocs(query(collection(db, "users_master"), where("departemen", "==", "Admin GA")));
          const html = buildRequestBaruEmailHtml({
            jenisRequest: `${LABEL_TINDAKAN[jenis]} (hasil inspeksi)`, namaPemohon: picName, departemen: "OB & CS",
            rows: [{ label: "Area", value: areaAktif }, ...baru.map((h) => ({ label: h.nama, value: `${h.kondisi} — ${h.catatan}` }))],
            fotoUrl: baru[0].foto || undefined,
          });
          for (const a of adminSnap.docs.map((d) => d.data() as { nama: string; email?: string })) {
            if (a.email) await kirimEmail(a.email, `${baru.length} Temuan ${LABEL_JENIS[jenis]}: ${areaAktif}`, html, a.nama);
          }
        } catch (e) { console.error("[notify] email temuan:", e); }
      }
      showToast(baru.length ? `Inspeksi terkirim! ${baru.length} temuan diteruskan ke Admin GA.` : "Inspeksi terkirim! Kondisi tercatat.", "success");
      setItems([]); setFotoArea(""); setStep(1); setActiveTab("history");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      showToast("Terjadi kesalahan sistem saat mengirim inspeksi.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (isPageLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "var(--bg)" }}>
        <style dangerouslySetInnerHTML={{ __html: "@keyframes spin { to { transform: rotate(360deg); } }" }} />
        <div style={{ width: "44px", height: "44px", borderRadius: "50%", border: "4px solid var(--info-50)", borderTopColor: "var(--info)", animation: "spin 0.8s linear infinite", marginBottom: "16px" }} />
        <div style={{ fontWeight: "bold", fontSize: "14px", color: "var(--ink-soft)" }}>Menyiapkan Inspeksi...</div>
      </div>
    );
  }

  const jenisTersedia = (["gedung", "alat", ...(bolehUtilitas ? ["utilitas"] : [])] as JenisInspeksi[]);
  const bisaMulai = jenis !== "gedung" || assignedAreas.length > 0;

  return (
    <AdminShell title="Inspeksi Kondisi Aset" subtitle="Foto & kondisi fasilitas gedung, peralatan kebersihan, dan utilitas — mingguan" userName={picName || "Staf"} backHref={"/dashboard/ob"} backLabel={"Dashboard OB"}>
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .tab-switch { background: var(--bg); padding: 4px; border-radius: 10px; display: flex; gap: 4px; width: fit-content; margin-bottom: 16px; }
        .tab-btn { border: none; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; background: transparent; color: var(--muted); display: flex; align-items: center; gap: 6px; font-family: inherit; }
        .tab-btn.active { background: var(--surface); color: var(--info); box-shadow: 0 2px 4px rgba(0,0,0,0.06); }
        .ka-kartu { background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
        .ka-jenis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 14px; }
        .ka-jenis button { text-align: left; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); cursor: pointer; font-family: inherit; color: var(--ink); }
        .ka-jenis button.on { border-color: var(--info); box-shadow: inset 0 0 0 1px var(--info); }
        .ka-kondisi { display: flex; gap: 6px; flex-wrap: wrap; }
        .ka-kondisi button { padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); font-weight: 700; font-size: 12.5px; cursor: pointer; font-family: inherit; }
        .ka-foto { width: 84px; height: 84px; background: var(--bg); border: 1px dashed var(--line); border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 10.5px; font-weight: 700; color: var(--muted); flex-shrink: 0; overflow: hidden; }
        .ka-foto.wajib { border-color: var(--red-600); color: var(--red-600); }
        .ka-in { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 13px; font-family: inherit; }
      ` }} />

      <div className="tab-switch">
        <button onClick={() => setActiveTab("form")} className={`tab-btn ${activeTab === "form" ? "active" : ""}`}><IconSearch size={14} /> Inspeksi</button>
        <button onClick={() => setActiveTab("history")} className={`tab-btn ${activeTab === "history" ? "active" : ""}`}><IconClock size={14} /> Riwayat</button>
      </div>

      {activeTab === "form" && step === 1 && (
        <div className="ka-kartu" style={{ maxWidth: "640px" }}>
          <div style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 700 }}>Minggu ini · {formatRentangMinggu(seninMingguIni)}</div>
          <div className="ka-jenis" role="tablist" aria-label="Jenis inspeksi">
            {jenisTersedia.map((j) => (
              <button key={j} type="button" role="tab" aria-selected={jenis === j} className={jenis === j ? "on" : ""} onClick={() => setJenis(j)}>
                <div style={{ fontWeight: 800, fontSize: "14px" }}>{LABEL_JENIS[j]}</div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{master[j].filter((x) => x.aktif !== false).length} item{j === "utilitas" ? " · petugas tetap" : ""}</div>
              </button>
            ))}
          </div>

          {jenis === "gedung" ? (
            assignedAreas.length > 0 ? (
              <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)" }}>Area hari ini
                <select className="ka-in" style={{ marginTop: "4px" }} value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}>
                  {assignedAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            ) : (
              <div style={{ display: "flex", gap: "10px", alignItems: "center", padding: "12px", borderRadius: "12px", background: "var(--red-50)", color: "var(--red-600)", fontSize: "13px", fontWeight: 700 }}>
                <IconAlertTriangle size={18} /> Belum ada plot area untuk Anda hari ini — hubungi koordinator. Peralatan Kebersihan tetap bisa diinspeksi.
              </div>
            )
          ) : (
            <div style={{ fontSize: "13px", color: "var(--ink-soft)" }}><IconMapPin size={14} /> {areaAktif}</div>
          )}

          {sudahMingguIni && <div style={{ background: "var(--ok-50)", color: "var(--ok)", fontSize: "12px", fontWeight: 700, padding: "10px 12px", borderRadius: "10px" }}>✓ Sudah diinspeksi minggu ini ({tglRingkas(sudahMingguIni.waktu_selesai)}). Boleh diulang bila perlu update.</div>}
          {bisaMulai && terkaitArea().length > 0 && (
            <div style={{ background: "var(--warn-50)", color: "var(--warn)", fontSize: "12px", fontWeight: 700, padding: "10px 12px", borderRadius: "10px" }}>
              🔧 {terkaitArea().length} item sudah tercatat sebagai temuan ({terkaitArea().filter((t) => t.status === "Dikerjakan").length} sedang ditangani).
            </div>
          )}
          <button type="button" onClick={mulaiInspeksi} disabled={!bisaMulai} className="sa-btn is-primary" style={{ height: "50px", fontSize: "15px", opacity: bisaMulai ? 1 : 0.5 }}>Mulai Inspeksi {LABEL_JENIS[jenis]} ➔</button>
          <p style={{ margin: 0, fontSize: "11.5px", color: "var(--muted)" }}>Wajib: 1 foto keseluruhan area + foto setiap item. Kerusakan yang perlu perbaikan/penggantian diteruskan ke Admin GA sebagai temuan (bukan tiket Helpdesk).</p>
        </div>
      )}

      {activeTab === "form" && step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "760px" }}>
          <div className="ka-kartu" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderLeft: "6px solid var(--info)" }}>
            <div>
              <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>{LABEL_JENIS[jenis]}</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--ink)" }}>{areaAktif}</div>
            </div>
            <button type="button" className="sa-btn is-soft" onClick={() => setStep(1)}>Ganti</button>
          </div>

          <div className="ka-kartu" style={{ flexDirection: "row", alignItems: "center", gap: "14px" }}>
            <label className={`ka-foto${fotoArea ? "" : " wajib"}`} style={{ width: "110px", height: "84px" }}>
              {fotoArea ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoArea} alt="Foto area" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : uploading === "area" ? "Mengunggah..." : <><IconCamera size={18} /> Foto area *</>}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { unggah("area", e.target.files?.[0], setFotoArea); e.target.value = ""; }} />
            </label>
            <div style={{ fontSize: "13px", color: "var(--ink-soft)" }}><b>Foto keseluruhan {jenis === "alat" ? "peralatan" : "area"}</b><br /><span style={{ fontSize: "12px", color: "var(--muted)" }}>Wajib 1 foto sebagai gambaran umum kondisi.</span></div>
          </div>

          {items.map((h, i) => {
            const t = temuanUntuk(h.nama);
            const kunci = t?.status === "Dikerjakan";
            const custom = i >= daftarMaster().length;
            if (kunci && t) {
              return (
                <div key={i} className="ka-kartu" style={{ borderStyle: "dashed", opacity: 0.85, cursor: "pointer" }} onClick={() => setModalTemuan([t])}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ fontSize: "15px" }}>{h.nama}</b>
                    <span style={{ fontSize: "11.5px", fontWeight: 800, padding: "4px 10px", borderRadius: "8px", background: "var(--info-50)", color: "var(--info)" }}>🔧 Sedang ditangani · terkunci</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>{kodeTemuan(t.id)} · dilaporkan {tglRingkas(t.waktu_lapor)} — tidak perlu dinilai sampai selesai.</div>
                </div>
              );
            }
            return (
              <div key={i} className="ka-kartu">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  {custom ? <input className="ka-in" style={{ flex: "1 1 160px", fontWeight: 700 }} placeholder="Nama item lain..." value={h.nama} onChange={(e) => ubahItem(i, { nama: e.target.value })} />
                    : <b style={{ fontSize: "15px", color: "var(--ink)" }}>{h.nama}</b>}
                  <div className="ka-kondisi">
                    {KONDISI[jenis].map((k) => (
                      <button key={k} type="button" onClick={() => pilihKondisi(i, k)} style={h.kondisi === k ? { background: WARNA_KONDISI[k].fg, color: "#fff", borderColor: "transparent" } : undefined}>{k}</button>
                    ))}
                    {custom && <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} style={{ color: "var(--red-600)" }} aria-label="Hapus item"><IconTrash size={13} /></button>}
                  </div>
                </div>
                {t && <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--warn)", background: "var(--warn-50)", padding: "8px 10px", borderRadius: "10px" }}>⏳ Sudah tercatat sebagai temuan ({kodeTemuan(t.id)}, {t.status}) sejak {tglRingkas(t.waktu_lapor)} — belum ditangani. Tidak membuat temuan baru.</div>}
                {h.kondisi && h.kondisi !== "Tidak Ada" && (
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <label className={`ka-foto${h.foto ? "" : " wajib"}`}>
                      {h.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.foto} alt={`Foto ${h.nama}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : uploading === String(i) ? "Mengunggah..." : <><IconCamera size={18} /> Foto *</>}
                      <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { unggah(String(i), e.target.files?.[0], (url) => ubahItem(i, { foto: url })); e.target.value = ""; }} />
                    </label>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                      <textarea className="ka-in" style={{ minHeight: "60px", resize: "vertical", borderColor: kondisiBermasalah(h.kondisi) && !h.catatan.trim() ? "var(--red-600)" : undefined }}
                        placeholder={kondisiBermasalah(h.kondisi) ? "Keterangan kondisi (wajib), mis. lampu mati 2 titik" : jenis === "utilitas" ? "Catatan / angka (opsional), mis. level solar 70%, jam operasi 1.250" : "Catatan (opsional)"}
                        value={h.catatan} onChange={(e) => ubahItem(i, { catatan: e.target.value })} />
                      {kondisiBermasalah(h.kondisi) && !t && (
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", fontWeight: 700, color: h.butuh_tindakan ? "var(--red-600)" : "var(--ink-soft)", cursor: "pointer" }}>
                          <input type="checkbox" checked={!!h.butuh_tindakan} onChange={(e) => ubahItem(i, { butuh_tindakan: e.target.checked })} />
                          Butuh {jenis === "alat" ? "penggantian" : "perbaikan"} → teruskan ke Admin GA
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" onClick={() => setItems((l) => [...l, { nama: "", kondisi: "", catatan: "", foto: "", butuh_tindakan: false, custom: true }])} style={{ padding: "13px", background: "var(--surface)", color: "var(--info)", border: "2px dashed var(--info)", borderRadius: "14px", fontWeight: 700, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>+ Tambah item lain</button>
          <button type="button" onClick={handleSubmit} disabled={isLoading || uploading !== null} className="sa-btn is-primary" style={{ height: "54px", fontSize: "16px" }}>{isLoading ? "Mengirim..." : uploading !== null ? "Menunggu foto terunggah..." : "Kirim Hasil Inspeksi"}</button>
        </div>
      )}

      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "760px" }}>
          {riwayat.length === 0 ? (
            <div className="ka-kartu" style={{ alignItems: "center", color: "var(--muted)" }}><IconInbox size={28} /> Belum ada riwayat inspeksi.</div>
          ) : riwayat.map((log) => {
            const bermasalah = log.hasil.filter((h) => kondisiBermasalah(h.kondisi)).length;
            return (
              <div key={log.id} className="ka-kartu">
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>{LABEL_JENIS[log.jenis || "gedung"]}</div>
                    <b style={{ fontSize: "15px" }}>{log.area}</b> <span style={{ fontSize: "12px", color: "var(--muted)" }}>· {tglRingkas(log.waktu_selesai)}</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 10px", borderRadius: "8px", background: bermasalah ? "var(--red-50)" : "var(--ok-50)", color: bermasalah ? "var(--red-600)" : "var(--ok)" }}>{bermasalah ? `${bermasalah} bermasalah` : "Semua baik"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "6px" }}>
                  {log.hasil.map((h, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", borderRadius: "10px", background: "var(--bg)" }}>
                      {h.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.foto} alt="" style={{ width: "34px", height: "34px", objectFit: "cover", borderRadius: "8px" }} />
                      ) : <span style={{ width: "34px" }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "12.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.nama}</div>
                        <span style={{ fontSize: "10.5px", fontWeight: 800, color: (WARNA_KONDISI[h.kondisi] || WARNA_KONDISI.Baik).fg }}>{h.kondisi}{h.butuh_tindakan ? " · diteruskan" : ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!modalTemuan} onClose={() => setModalTemuan(null)} maxWidth="460px">
        {modalTemuan && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>{modalTemuan.every((x) => x.status === "Dikerjakan") ? "🔧 Sedang ditangani" : "⏳ Sudah tercatat sebagai temuan"}</h3>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--muted)" }}>Item berikut sudah diteruskan ke Admin GA dan belum selesai.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {modalTemuan.map((x) => {
                const proses = x.status === "Dikerjakan";
                return (
                  <div key={x.id} style={{ padding: "10px 12px", borderRadius: "12px", background: proses ? "var(--info-50)" : "var(--warn-50)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                      <b style={{ fontSize: "13.5px", color: "var(--ink)" }}>{x.item}</b>
                      <span style={{ fontSize: "11px", fontWeight: 800, color: proses ? "var(--info)" : "var(--warn)" }}>{x.status.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--ink-soft)", marginTop: "3px" }}>{x.kondisi} — {x.catatan}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "3px" }}>{kodeTemuan(x.id)} · {tglRingkas(x.waktu_lapor)}{x.rencana ? ` · rencana ${x.rencana}` : ""}</div>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: proses ? "var(--info)" : "var(--warn)", marginTop: "6px" }}>
                      {proses ? "Terkunci — tidak perlu dinilai sampai selesai ditangani." : "Pengingat: belum ditangani. Tetap nilai kondisinya; tidak membuat temuan dobel."}
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" className="sa-btn is-primary" style={{ width: "100%", marginTop: "14px" }} onClick={() => setModalTemuan(null)}>Mengerti</button>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
