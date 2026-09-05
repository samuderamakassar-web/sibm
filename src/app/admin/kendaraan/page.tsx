"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy,
  where, Timestamp, serverTimestamp
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../../../components/ui/Table";
import VehicleIcon3D, { KATEGORI_KENDARAAN, WARNA_KENDARAAN } from "../../../components/VehicleIcon3D";
import { DAFTAR_UNIT_BISNIS } from "../../../lib/unitBisnis";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
const IconUserCircle = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
);

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

interface Employee {
  id: string;
  nama: string;
  departemen?: string;
}

interface Kendaraan {
  id: string;
  kendaraan: string; // Nama identifier - HARUS SAMA PERSIS dengan yang dipilih driver di form lapor status
  plat_nomor: string;
  jenis: string; // merk/tipe bebas, cth: "Toyota Avanza" — BEDA dari `kategori` (dipakai buat pilih bentuk icon 3D)
  kategori: string; // Sedan/SUV-MPV/Pickup/Truck/Motor — nentuin bentuk icon 3D
  warna: string; // nentuin warna icon 3D
  pic_kendaraan: string;
  unit_bisnis: string;
  no_rangka?: string;
  no_mesin?: string;
  tanggal_pajak?: string; // tanggal STNK/pajak berlaku sampai (YYYY-MM-DD)
  foto_url?: string;
  status_kepemilikan?: "Aset" | "Sewa";
  tanggal_akhir_sewa?: string; // YYYY-MM-DD, hanya relevan kalau status_kepemilikan === "Sewa"
}

interface OdometerLog {
  id: string;
  kendaraan_id: string;
  kendaraan: string;
  odometer: number;
  tanggal: string;
  dicatat_oleh?: string;
  waktu_catat?: Timestamp | null;
}

interface ServiceLog {
  id: string;
  kendaraan_id: string;
  kendaraan: string;
  tanggal: string;
  jenis_service: string;
  deskripsi: string;
  biaya?: string;
  foto_emisi_url?: string;
  waktu_catat?: Timestamp | null;
}

interface InspeksiLog {
  id: string;
  kendaraan_id: string;
  kendaraan: string;
  driver: string;
  tanggal: string;
  checklist: Record<string, string>;
  catatan?: string;
  foto_url?: string;
  waktu_catat?: Timestamp | null;
}

// Log pergerakan armada — diisi driver (lapor status via app driver) ATAU security (dashboard/security/parkir),
// keduanya menulis ke koleksi yang sama. Dicocokkan lewat field `kendaraan` (nama identifier), bukan id.
interface PergerakanLog {
  id: string;
  kendaraan: string;
  status_kendaraan: string;
  driver_bertugas: string;
  tujuan_keperluan?: string;
  kilometer_kendaraan?: string;
  petugas_security?: string;
  waktu_catat?: Timestamp | null;
}

// Dokumen tunggal per kendaraan (bukan log historis) — dikelola utuh di admin/uji-emisi,
// di sini cuma ditampilkan read-only supaya jadi 1 rekap riwayat yang lengkap.
interface UjiEmisi {
  odo_jadwal_emisi?: string;
  tanggal_pengujian?: string;
  hasil_pengujian?: string;
  status?: string;
  next_service?: string;
  keterangan?: string;
  waktu_update?: Timestamp | null;
  diupdate_oleh?: string;
}

const CHECKLIST_LABELS: Record<string, string> = {
  ban: "Ban & Tekanan Angin",
  rem: "Rem",
  lampu: "Lampu (Depan/Belakang/Sein)",
  oli: "Oli Mesin",
  air_radiator_aki: "Air Radiator & Aki",
  wiper_kaca: "Wiper & Kaca",
  ac: "AC",
  kebersihan: "Kebersihan Interior/Eksterior",
};

// Data lama yang sebelumnya hardcode di halaman driver, dipakai sekali untuk migrasi awal
const MIGRASI_KENDARAAN_LAMA = [
  "BB 1164 XBC - Muhammad Yusuf (PT Makassar Jaya Samudera)",
  "B 2306 PZQ - Bernard Hutagaol (PT Makassar Jaya Samudera)",
  "B 2137 PZA - Joko Susilo (PT Makassar Jaya Samudera)",
  "B 2737 PIW - Agussalim (PT Samudera Agencies Indonesia)",
  "DD 1591 XBG - Saipul Mirah (PT SILkargo Indonesia)",
  "DD 1278 XCS - SML Operational (PT Samudera Makassar Logistik)",
  "DD 1412 XBO - Marketing/UMUM (PT Makassar Jaya Samudera)",
  "DD 1273 XBO - Wahyu Hermawan (PT Makassar Jaya Samudera)",
  "B 5597 KDB - Agusri (PT Samudera Makassar Logistik)",
  "B 1828 DYKI - Mildawaty (PT Samudera Perdana)",
  "DD 1384 XBN - PPNP OPS (PT Perusahaan Pelayaran Nusantara Panurjwan)",
  "B 1629 RKP - Mattias Hotma (PT Perusahaan Pelayaran Nusantara Panurjwan)"
];

const FORM_KENDARAAN_KOSONG = {
  plat_nomor: "",
  jenis: "",
  kategori: "Sedan",
  warna: "Putih",
  pic_kendaraan: "",
  unit_bisnis: "",
  no_rangka: "",
  no_mesin: "",
  tanggal_pajak: "",
  foto_url: "",
  status_kepemilikan: "Aset" as "Aset" | "Sewa",
  tanggal_akhir_sewa: "",
};

function buildKendaraanId(plat: string, pic: string, unit: string): string {
  const platT = plat.trim();
  const picT = pic.trim();
  const unitT = unit.trim();
  let out = platT;
  if (picT) out += ` - ${picT}`;
  if (unitT) out += ` (${unitT})`;
  return out;
}

// Parser buat migrasi data lama: "PLAT - PIC (UNIT)" -> {plat, pic, unit}
function parseKendaraanLama(raw: string): { plat_nomor: string; pic_kendaraan: string; unit_bisnis: string } {
  const match = raw.match(/^(.*?) - (.*?) \((.*)\)$/);
  if (match) {
    return { plat_nomor: match[1].trim(), pic_kendaraan: match[2].trim(), unit_bisnis: match[3].trim() };
  }
  return { plat_nomor: raw, pic_kendaraan: "", unit_bisnis: "" };
}

async function uploadFotoToCloudinary(blob: Blob, folder: string = "sibm/kendaraan"): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
  formData.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
  const data = await res.json();
  return data.secure_url as string;
}

const todayISO = () => new Date().toISOString().split("T")[0];
const NAMA_BULAN_RIWAYAT = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const tglDariTimestamp = (ts?: Timestamp | null) => ts ? ts.toDate().toISOString().slice(0, 10) : "";
const jamDariTimestamp = (ts?: Timestamp | null) => ts ? ts.toDate().toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

// Status pajak/STNK dari tanggal berlaku (YYYY-MM-DD): Kadaluarsa / Segera Habis (<=30 hari) / Aktif
function getPajakStatus(tanggal?: string): { label: string; tone: BadgeTone } {
  if (!tanggal) return { label: "Belum diisi", tone: "neutral" };
  const target = new Date(tanggal);
  const now = new Date();
  const diffHari = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffHari < 0) return { label: "Kadaluarsa", tone: "danger" };
  if (diffHari <= 30) return { label: `${diffHari} hari lagi`, tone: "warning" };
  return { label: "Aktif", tone: "success" };
}

function getUjiEmisiStatus(emisi: UjiEmisi | null): { label: string; tone: BadgeTone } {
  if (!emisi || !emisi.status || emisi.status === "-") return { label: "Belum Diuji", tone: "neutral" };
  if (emisi.status === "Tidak Lolos") return { label: emisi.status, tone: "danger" };
  if (emisi.status === "Perlu Perhatian") return { label: emisi.status, tone: "warning" };
  return { label: emisi.status, tone: "success" };
}

// Status kepemilikan Aset/Sewa — kalau Sewa, hitung sisa hari (atau berapa hari sudah lewat) dari tanggal berakhir
function getKepemilikanInfo(k: Kendaraan): { label: string; tone: BadgeTone; sub?: string } {
  const status = k.status_kepemilikan || "Aset";
  if (status !== "Sewa") return { label: "Aset", tone: "info" };
  if (!k.tanggal_akhir_sewa) return { label: "Sewa", tone: "neutral", sub: "Tanggal berakhir belum diisi" };

  const target = new Date(k.tanggal_akhir_sewa);
  const now = new Date();
  const diffHari = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const tanggalLabel = k.tanggal_akhir_sewa.split("-").reverse().join("/");

  if (diffHari < 0) return { label: "Sewa Berakhir", tone: "danger", sub: `s/d ${tanggalLabel} • lewat ${Math.abs(diffHari)} hari` };
  if (diffHari <= 30) return { label: "Sewa", tone: "warning", sub: `s/d ${tanggalLabel} • ${diffHari} hari lagi` };
  return { label: "Sewa", tone: "success", sub: `s/d ${tanggalLabel} • ${diffHari} hari lagi` };
}

// Satu baris riwayat gabungan (pergerakan/odometer/servis/inspeksi/uji emisi) supaya tampil dalam 1 tabel saja
type JenisRiwayat = "Pergerakan" | "Odometer" | "Servis" | "Inspeksi" | "Uji Emisi";
interface RiwayatEntry {
  id: string;
  kendaraanId: string;
  kendaraanLabel: string;
  tanggal: string; // YYYY-MM-DD
  jenis: JenisRiwayat;
  tone: BadgeTone;
  utama: string;
  sub?: string;
  pic?: string;
  foto?: string;
}

const JENIS_ICON: Record<JenisRiwayat, string> = {
  "Pergerakan": "🚙",
  "Odometer": "🛣️",
  "Servis": "🔧",
  "Inspeksi": "🔍",
  "Uji Emisi": "🌫️",
};

// Status pergerakan yang diinput driver/security -> warna badge & label ringkas
function getPergerakanTone(status: string): BadgeTone {
  if (status.includes("Service") || status.includes("Bengkel")) return "warning";
  if (status.includes("Keluar")) return "info";
  return "success"; // Tiba di Kantor (Standby), dsb.
}

// Data riwayat per kendaraan — disimpan sebagai map supaya bisa lihat beberapa kendaraan sekaligus di tab Riwayat
interface VehicleRiwayatData {
  odometerLogs: OdometerLog[];
  serviceLogs: ServiceLog[];
  inspeksiLogs: InspeksiLog[];
  pergerakanLogs: PergerakanLog[];
  ujiEmisi: UjiEmisi | null;
}
const KOSONG_RIWAYAT_DATA: VehicleRiwayatData = { odometerLogs: [], serviceLogs: [], inspeksiLogs: [], pergerakanLogs: [], ujiEmisi: null };

function buildRiwayatEntries(kendaraanId: string, kendaraanLabel: string, data: VehicleRiwayatData): RiwayatEntry[] {
  const entriesPergerakan: RiwayatEntry[] = data.pergerakanLogs.map((l) => ({
    id: `${kendaraanId}-gerak-${l.id}`,
    kendaraanId, kendaraanLabel,
    tanggal: tglDariTimestamp(l.waktu_catat),
    jenis: "Pergerakan",
    tone: getPergerakanTone(l.status_kendaraan || ""),
    utama: [l.status_kendaraan, (l.tujuan_keperluan && l.tujuan_keperluan !== "-") ? l.tujuan_keperluan : ""].filter(Boolean).join(" — "),
    sub: [
      l.kilometer_kendaraan && l.kilometer_kendaraan !== "Tidak dicatat" ? `Odometer: ${l.kilometer_kendaraan} km` : "",
      l.petugas_security ? `Dicatat oleh: ${l.petugas_security}` : "",
      jamDariTimestamp(l.waktu_catat),
    ].filter(Boolean).join(" • ") || undefined,
    pic: (l.driver_bertugas || "").replace("Standby: ", ""),
  }));

  const entriesOdometer: RiwayatEntry[] = data.odometerLogs.map((l) => ({
    id: `${kendaraanId}-odo-${l.id}`, kendaraanId, kendaraanLabel, tanggal: l.tanggal, jenis: "Odometer", tone: "info",
    utama: `${l.odometer.toLocaleString("id-ID")} km`,
    pic: l.dicatat_oleh,
  }));

  const entriesService: RiwayatEntry[] = data.serviceLogs.map((l) => ({
    id: `${kendaraanId}-svc-${l.id}`, kendaraanId, kendaraanLabel, tanggal: l.tanggal, jenis: "Servis", tone: "warning",
    utama: l.jenis_service || "Servis",
    sub: [l.deskripsi, l.biaya ? `Rp ${l.biaya}` : ""].filter(Boolean).join(" • ") || undefined,
    foto: l.foto_emisi_url,
  }));

  const entriesInspeksi: RiwayatEntry[] = data.inspeksiLogs.map((l) => {
    const bermasalah = Object.entries(l.checklist || {}).filter(([, v]) => v !== "Baik");
    return {
      id: `${kendaraanId}-insp-${l.id}`, kendaraanId, kendaraanLabel, tanggal: l.tanggal, jenis: "Inspeksi" as const,
      tone: (bermasalah.length === 0 ? "success" : "danger") as BadgeTone,
      utama: bermasalah.length === 0 ? "Semua item kondisi Baik" : bermasalah.map(([k, v]) => `${CHECKLIST_LABELS[k] || k}: ${v}`).join("; "),
      sub: l.catatan,
      pic: l.driver,
      foto: l.foto_url,
    };
  });

  const entriesUjiEmisi: RiwayatEntry[] = (data.ujiEmisi && data.ujiEmisi.tanggal_pengujian) ? [{
    id: `${kendaraanId}-emisi-terkini`,
    kendaraanId, kendaraanLabel,
    tanggal: data.ujiEmisi.tanggal_pengujian,
    jenis: "Uji Emisi",
    tone: (data.ujiEmisi.status === "Tidak Lolos" ? "danger" : data.ujiEmisi.status === "Perlu Perhatian" ? "warning" : "success") as BadgeTone,
    utama: `Hasil: ${data.ujiEmisi.hasil_pengujian || "-"} • Status: ${data.ujiEmisi.status && data.ujiEmisi.status !== "-" ? data.ujiEmisi.status : "Belum Diuji"}`,
    sub: [data.ujiEmisi.next_service ? `Next Service: ${data.ujiEmisi.next_service}` : "", data.ujiEmisi.keterangan || ""].filter(Boolean).join(" • ") || undefined,
    pic: data.ujiEmisi.diupdate_oleh,
  }] : [];

  return [...entriesPergerakan, ...entriesOdometer, ...entriesService, ...entriesInspeksi, ...entriesUjiEmisi];
}

// ==========================================
// DROPDOWN CHECKLIST — pilih beberapa kendaraan sekaligus (dipakai di tab Daftar & tab Riwayat)
// ==========================================
interface MultiSelectOption {
  id: string;
  label: string;
  sub?: string;
}

function MultiSelectDropdown({
  buttonIcon = "🚗",
  allLabel = "Semua Kendaraan",
  emptyLabel = "Belum ada kendaraan",
  options,
  selectedIds,
  onChange,
  width = "300px",
}: {
  buttonIcon?: string;
  allLabel?: string;
  emptyLabel?: string;
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const allIds = options.map((o) => o.id);
  const isAllSelected = allIds.length > 0 && selectedIds.length === allIds.length;

  const toggleId = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const summaryText =
    allIds.length === 0 ? emptyLabel
    : isAllSelected ? `${allLabel} (${allIds.length})`
    : selectedIds.length === 0 ? "Tidak ada dipilih"
    : selectedIds.length === 1 ? (options.find((o) => o.id === selectedIds[0])?.label || "1 dipilih")
    : `${selectedIds.length} dari ${allIds.length} dipilih`;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "13px", fontWeight: "bold", color: "var(--ink-soft)", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
      >
        <span>{buttonIcon}</span>
        <span style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summaryText}</span>
        <span style={{ fontSize: "10px", color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 70, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "14px", boxShadow: "0 20px 40px -10px rgba(0,0,0,0.25)", width, maxHeight: "360px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", gap: "8px", padding: "10px 12px", borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
              <button type="button" onClick={() => onChange(allIds)} style={{ flex: 1, padding: "6px", borderRadius: "8px", border: "none", background: "var(--info-50)", color: "var(--info)", fontSize: "11px", fontWeight: "bold", cursor: "pointer", fontFamily: "inherit" }}>Pilih Semua</button>
              <button type="button" onClick={() => onChange([])} style={{ flex: 1, padding: "6px", borderRadius: "8px", border: "none", background: "var(--red-50)", color: "var(--red-600)", fontSize: "11px", fontWeight: "bold", cursor: "pointer", fontFamily: "inherit" }}>Kosongkan</button>
            </div>
            <div style={{ overflowY: "auto", padding: "6px" }}>
              {options.length > 0 ? options.map((o) => (
                <label key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 10px", borderRadius: "8px", cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggleId(o.id)} style={{ marginTop: "3px" }} />
                  <span style={{ fontSize: "13px" }}>
                    <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{o.label}</div>
                    {o.sub && <div style={{ fontSize: "11px", color: "var(--muted)" }}>{o.sub}</div>}
                  </span>
                </label>
              )) : (
                <div style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "var(--muted)" }}>Belum ada kendaraan.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ManajemenKendaraanPage() {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();

  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus untuk Administrator.",
  });

  const [pageTab, setPageTab] = useState<"DAFTAR" | "RIWAYAT">("DAFTAR");
  const [kendaraanList, setKendaraanList] = useState<Kendaraan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKendaraanModal, setShowKendaraanModal] = useState(false);
  // Kosong = tampilkan semua kendaraan (default) — begitu user uncheck salah satu lewat dropdown, jadi daftar eksplisit
  const [daftarSelectedIds, setDaftarSelectedIds] = useState<string[]>([]);

  const [formData, setFormData] = useState(FORM_KENDARAAN_KOSONG);
  const [isMigrating, setIsMigrating] = useState(false);

  // STATE TAB RIWAYAT KENDARAAN (level halaman, bukan modal) — bisa pilih lebih dari 1 kendaraan sekaligus
  const [riwayatSelectedIds, setRiwayatSelectedIds] = useState<string[]>([]);
  const [riwayatDataMap, setRiwayatDataMap] = useState<Record<string, VehicleRiwayatData>>({});
  const [showLogModal, setShowLogModal] = useState(false);
  const [logModalTab, setLogModalTab] = useState<"ODOMETER" | "SERVICE">("ODOMETER");
  const [logTargetId, setLogTargetId] = useState<string>("");
  const [formOdometer, setFormOdometer] = useState({ odometer: "", tanggal: todayISO() });
  const [formService, setFormService] = useState({ tanggal: todayISO(), jenis_service: "", deskripsi: "", biaya: "", foto_emisi_url: "" });
  const [riwayatFilterBulan, setRiwayatFilterBulan] = useState<string>("Semua");
  const [riwayatFilterTahun, setRiwayatFilterTahun] = useState<string>("Semua");
  const [isSavingOdometer, setIsSavingOdometer] = useState(false);
  const [isSavingService, setIsSavingService] = useState(false);
  const [isUploadingEmisi, setIsUploadingEmisi] = useState(false);

  // Kalau belum ada yang dipilih manual, jatuhkan ke kendaraan pertama di daftar biar tab Riwayat langsung terisi
  const riwayatEffectiveIds = riwayatSelectedIds.length > 0 ? riwayatSelectedIds : (kendaraanList[0] ? [kendaraanList[0].id] : []);
  const riwayatKendaraanTerpilih = kendaraanList.filter((k) => riwayatEffectiveIds.includes(k.id));
  const isSatuKendaraan = riwayatKendaraanTerpilih.length === 1;
  const kendaraanTunggal = isSatuKendaraan ? riwayatKendaraanTerpilih[0] : null;
  const dataKendaraanTunggal = kendaraanTunggal ? (riwayatDataMap[kendaraanTunggal.id] || KOSONG_RIWAYAT_DATA) : KOSONG_RIWAYAT_DATA;

  const platKeyRiwayat = riwayatEffectiveIds.map((id) => kendaraanList.find((k) => k.id === id)?.plat_nomor || "").join("|");

  useEffect(() => {
    if (!isReady || !session) return;

    const ref = collection(db, "master_kendaraan");
    const q = query(ref, orderBy("kendaraan", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Kendaraan[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Kendaraan);
      });
      setKendaraanList(list);
    });

    // Daftar karyawan master (buat autocomplete PIC Kendaraan)
    const unsubEmployees = onSnapshot(collection(db, "employees_directory"), (snapshot) => {
      const list: Employee[] = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() } as Employee));
      setEmployees(list);
    });

    return () => { unsubscribe(); unsubEmployees(); };
  }, [isReady, session]);

  // TARIK RIWAYAT UNTUK SETIAP KENDARAAN YANG DIPILIH (bisa lebih dari 1)
  useEffect(() => {
    if (riwayatEffectiveIds.length === 0) return;

    const unsubs: (() => void)[] = [];

    riwayatEffectiveIds.forEach((id) => {
      const kendaraan = kendaraanList.find((k) => k.id === id);
      const plat = kendaraan?.plat_nomor?.trim() || "";

      const patch = (updater: (d: VehicleRiwayatData) => VehicleRiwayatData) => {
        setRiwayatDataMap((prev) => ({ ...prev, [id]: updater(prev[id] || KOSONG_RIWAYAT_DATA) }));
      };

      unsubs.push(onSnapshot(
        query(collection(db, "kendaraan_odometer_logs"), where("kendaraan_id", "==", id), orderBy("tanggal", "desc")),
        (snap) => patch((d) => ({ ...d, odometerLogs: snap.docs.map((x) => ({ id: x.id, ...x.data() } as OdometerLog)) }))
      ));

      unsubs.push(onSnapshot(
        query(collection(db, "kendaraan_service_logs"), where("kendaraan_id", "==", id), orderBy("tanggal", "desc")),
        (snap) => patch((d) => ({ ...d, serviceLogs: snap.docs.map((x) => ({ id: x.id, ...x.data() } as ServiceLog)) }))
      ));

      unsubs.push(onSnapshot(
        query(collection(db, "kendaraan_inspeksi_logs"), where("kendaraan_id", "==", id), orderBy("tanggal", "desc")),
        (snap) => patch((d) => ({ ...d, inspeksiLogs: snap.docs.map((x) => ({ id: x.id, ...x.data() } as InspeksiLog)) }))
      ));

      unsubs.push(onSnapshot(doc(db, "kendaraan_uji_emisi", id), (snap) => {
        patch((d) => ({ ...d, ujiEmisi: snap.exists() ? (snap.data() as UjiEmisi) : null }));
      }));

      // Log pergerakan armada (diisi driver via app driver & security via dashboard/security/parkir) disimpan
      // dengan field `kendaraan` berisi string "PLAT - PIC (UNIT)" versi SAAT LOG DIBUAT — begitu PIC di master
      // data diganti/rename, string lama nggak akan pernah persis sama lagi. Makanya dicocokkan lewat awalan
      // plat nomor (stabil, gak pernah berubah) pakai range query, bukan exact match ke `kendaraan` penuh.
      if (plat) {
        unsubs.push(onSnapshot(
          query(
            collection(db, "operational_vehicle_logs"),
            where("kendaraan", ">=", plat),
            where("kendaraan", "<", plat + ""),
            orderBy("kendaraan")
          ),
          (snap) => {
            const list = snap.docs.map((x) => ({ id: x.id, ...x.data() } as PergerakanLog));
            list.sort((a, b) => (b.waktu_catat?.toMillis() || 0) - (a.waktu_catat?.toMillis() || 0));
            patch((d) => ({ ...d, pergerakanLogs: list }));
          }
        ));
      }
    });

    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riwayatEffectiveIds.join(","), platKeyRiwayat]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 600 / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setIsUploadingFoto(true);
          try {
            const url = await uploadFotoToCloudinary(blob);
            setFormData((prev) => ({ ...prev, foto_url: url }));
          } catch (err) {
            console.error(err);
            showToast("Gagal upload foto, coba lagi.", "error");
          } finally {
            setIsUploadingFoto(false);
          }
        }, "image/jpeg", 0.85);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const openTambahKendaraan = () => {
    setEditingId(null);
    setFormData(FORM_KENDARAAN_KOSONG);
    setShowKendaraanModal(true);
  };

  const closeKendaraanModal = () => {
    setShowKendaraanModal(false);
    setEditingId(null);
    setFormData(FORM_KENDARAAN_KOSONG);
  };

  const handleSubmitKendaraan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploadingFoto) {
      showToast("Tunggu foto selesai diunggah dulu.", "warning");
      return;
    }
    if (!formData.plat_nomor.trim() || !formData.pic_kendaraan.trim()) {
      showToast("Plat Nomor dan PIC Kendaraan wajib diisi.", "warning");
      return;
    }
    setIsLoading(true);

    const kendaraanId = buildKendaraanId(formData.plat_nomor, formData.pic_kendaraan, formData.unit_bisnis);

    const dataToSave = {
      kendaraan: kendaraanId,
      plat_nomor: formData.plat_nomor.trim(),
      jenis: formData.jenis.trim(),
      kategori: formData.kategori,
      warna: formData.warna,
      pic_kendaraan: formData.pic_kendaraan.trim(),
      unit_bisnis: formData.unit_bisnis.trim(),
      no_rangka: formData.no_rangka.trim(),
      no_mesin: formData.no_mesin.trim(),
      tanggal_pajak: formData.tanggal_pajak,
      foto_url: formData.foto_url || "",
      status_kepemilikan: formData.status_kepemilikan,
      tanggal_akhir_sewa: formData.status_kepemilikan === "Sewa" ? formData.tanggal_akhir_sewa : "",
    };

    try {
      const duplikat = kendaraanList.find(
        (k) => k.kendaraan.toLowerCase() === dataToSave.kendaraan.toLowerCase() && k.id !== editingId
      );
      if (duplikat) {
        showToast("Kombinasi Plat/PIC/Unit Bisnis ini sudah terdaftar. Cek data yang ada.", "warning");
        setIsLoading(false);
        return;
      }

      if (editingId) {
        await updateDoc(doc(db, "master_kendaraan", editingId), dataToSave);
        showToast(`Data ${dataToSave.kendaraan} berhasil diperbarui.`, "success");
      } else {
        await addDoc(collection(db, "master_kendaraan"), dataToSave);
        showToast(`${dataToSave.kendaraan} berhasil ditambahkan.`, "success");
      }

      closeKendaraanModal();
    } catch (error) {
      console.error("Error menyimpan kendaraan:", error);
      showToast("Gagal menyimpan data.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportDataLama = async () => {
    const yakin = await confirm({
      title: "Import Data Kendaraan Lama",
      message: `Ini akan menambahkan ${MIGRASI_KENDARAAN_LAMA.length} kendaraan dari data lama (yang sebelumnya hardcode di halaman driver). Data yang sudah terdaftar akan dilewati otomatis. Lanjutkan?`,
      confirmText: "Ya, Import",
    });
    if (!yakin) return;

    setIsMigrating(true);
    let sukses = 0;
    try {
      for (const raw of MIGRASI_KENDARAAN_LAMA) {
        const parsed = parseKendaraanLama(raw);
        const kendaraanId = buildKendaraanId(parsed.plat_nomor, parsed.pic_kendaraan, parsed.unit_bisnis);
        const sudahAda = kendaraanList.some((k) => k.kendaraan.toLowerCase() === kendaraanId.toLowerCase());
        if (sudahAda) continue;
        await addDoc(collection(db, "master_kendaraan"), {
          kendaraan: kendaraanId,
          plat_nomor: parsed.plat_nomor,
          jenis: "",
          kategori: "Sedan",
          warna: "Putih",
          pic_kendaraan: parsed.pic_kendaraan,
          unit_bisnis: parsed.unit_bisnis,
          no_rangka: "",
          no_mesin: "",
          tanggal_pajak: "",
          foto_url: "",
          status_kepemilikan: "Aset",
          tanggal_akhir_sewa: "",
        });
        sukses++;
      }
      showToast(`${sukses} kendaraan berhasil diimport. Sisanya sudah terdaftar sebelumnya.`, "success");
    } catch (error) {
      console.error("Error import data lama:", error);
      showToast("Gagal mengimport sebagian/semua data.", "error");
    } finally {
      setIsMigrating(false);
    }
  };

  const handleMulaiEdit = (k: Kendaraan) => {
    setEditingId(k.id);
    setFormData({
      plat_nomor: k.plat_nomor || "",
      jenis: k.jenis || "",
      kategori: k.kategori || "Sedan",
      warna: k.warna || "Putih",
      pic_kendaraan: k.pic_kendaraan || "",
      unit_bisnis: k.unit_bisnis || "",
      no_rangka: k.no_rangka || "",
      no_mesin: k.no_mesin || "",
      tanggal_pajak: k.tanggal_pajak || "",
      foto_url: k.foto_url || "",
      status_kepemilikan: k.status_kepemilikan || "Aset",
      tanggal_akhir_sewa: k.tanggal_akhir_sewa || "",
    });
    setShowKendaraanModal(true);
  };

  const handleHapusKendaraan = async (id: string, nama: string) => {
    const yakin = await confirm({
      title: "Hapus Data Kendaraan",
      message: `Yakin ingin menghapus data kendaraan "${nama}"? Riwayat odometer/servis yang tersimpan tidak ikut terhapus otomatis.`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (!yakin) return;

    try {
      await deleteDoc(doc(db, "master_kendaraan", id));
      setDaftarSelectedIds((prev) => prev.filter((x) => x !== id));
      setRiwayatSelectedIds((prev) => prev.filter((x) => x !== id));
      showToast(`Data ${nama} berhasil dihapus.`, "success");
    } catch (error) {
      console.error("Error menghapus data:", error);
      showToast("Gagal menghapus data kendaraan.", "error");
    }
  };

  const bukaRiwayat = (k: Kendaraan) => {
    setRiwayatSelectedIds([k.id]);
    setPageTab("RIWAYAT");
    setRiwayatFilterBulan("Semua");
    setRiwayatFilterTahun("Semua");
  };

  const openLogModal = (tab: "ODOMETER" | "SERVICE") => {
    setLogModalTab(tab);
    setLogTargetId(riwayatEffectiveIds[0] || "");
    setFormOdometer({ odometer: "", tanggal: todayISO() });
    setFormService({ tanggal: todayISO(), jenis_service: "", deskripsi: "", biaya: "", foto_emisi_url: "" });
    setShowLogModal(true);
  };

  const logTargetKendaraan = kendaraanList.find((k) => k.id === logTargetId) || null;

  const handleSubmitOdometer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logTargetKendaraan) return;
    if (!formOdometer.odometer || Number(formOdometer.odometer) <= 0) {
      showToast("Isi angka odometer yang valid.", "warning");
      return;
    }
    setIsSavingOdometer(true);
    try {
      await addDoc(collection(db, "kendaraan_odometer_logs"), {
        kendaraan_id: logTargetKendaraan.id,
        kendaraan: logTargetKendaraan.kendaraan,
        odometer: Number(formOdometer.odometer),
        tanggal: formOdometer.tanggal,
        dicatat_oleh: adminName,
        waktu_catat: serverTimestamp(),
      });
      showToast("Odometer berhasil dicatat.", "success");
      setFormOdometer({ odometer: "", tanggal: todayISO() });
      setShowLogModal(false);
    } catch (error) {
      console.error(error);
      showToast("Gagal mencatat odometer.", "error");
    } finally {
      setIsSavingOdometer(false);
    }
  };

  const handleFotoEmisiUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 600 / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setIsUploadingEmisi(true);
          try {
            const url = await uploadFotoToCloudinary(blob, "sibm/uji-emisi");
            setFormService((prev) => ({ ...prev, foto_emisi_url: url }));
          } catch (err) {
            console.error(err);
            showToast("Gagal upload foto uji emisi, coba lagi.", "error");
          } finally {
            setIsUploadingEmisi(false);
          }
        }, "image/jpeg", 0.85);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logTargetKendaraan) return;
    if (!formService.jenis_service.trim()) {
      showToast("Isi jenis servis (cth: Ganti Oli, Servis Berkala).", "warning");
      return;
    }
    setIsSavingService(true);
    try {
      await addDoc(collection(db, "kendaraan_service_logs"), {
        kendaraan_id: logTargetKendaraan.id,
        kendaraan: logTargetKendaraan.kendaraan,
        tanggal: formService.tanggal,
        jenis_service: formService.jenis_service.trim(),
        deskripsi: formService.deskripsi.trim(),
        biaya: formService.biaya.trim(),
        foto_emisi_url: formService.foto_emisi_url || "",
        waktu_catat: serverTimestamp(),
      });
      showToast("Riwayat servis berhasil dicatat.", "success");
      setFormService({ tanggal: todayISO(), jenis_service: "", deskripsi: "", biaya: "", foto_emisi_url: "" });
      setShowLogModal(false);
    } catch (error) {
      console.error(error);
      showToast("Gagal mencatat servis.", "error");
    } finally {
      setIsSavingService(false);
    }
  };

  // 🔹 FILTER DAFTAR KENDARAAN — cari teks + dropdown checklist kendaraan mana yang mau ditampilkan
  const daftarEffectiveIds = daftarSelectedIds.length > 0 ? daftarSelectedIds : kendaraanList.map((k) => k.id);
  const filteredKendaraan = kendaraanList.filter(
    (k) =>
      daftarEffectiveIds.includes(k.id) &&
      (
        k.kendaraan.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (k.plat_nomor || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (k.jenis || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (k.pic_kendaraan || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (k.unit_bisnis || "").toLowerCase().includes(searchTerm.toLowerCase())
      )
  );

  const dropdownOptionsKendaraan: MultiSelectOption[] = kendaraanList.map((k) => ({
    id: k.id, label: k.kendaraan, sub: [k.plat_nomor, k.pic_kendaraan].filter(Boolean).join(" • "),
  }));

  // 🔹 FILTER BULAN/TAHUN UNTUK TAB RIWAYAT — berlaku ke semua jenis riwayat sekaligus
  const cocokRiwayatFilter = (tanggalStr: string) => {
    if (riwayatFilterBulan === "Semua" && riwayatFilterTahun === "Semua") return true;
    if (!tanggalStr) return false;
    const [y, m] = tanggalStr.split("-");
    const tahunOk = riwayatFilterTahun === "Semua" || y === riwayatFilterTahun;
    const bulanOk = riwayatFilterBulan === "Semua" || Number(m) === Number(riwayatFilterBulan);
    return tahunOk && bulanOk;
  };

  // 🔹 GABUNGKAN riwayat semua kendaraan yang dipilih JADI 1 TABEL RIWAYAT
  const semuaEntriRiwayat = riwayatKendaraanTerpilih.flatMap((k) =>
    buildRiwayatEntries(k.id, k.kendaraan, riwayatDataMap[k.id] || KOSONG_RIWAYAT_DATA)
  );
  const riwayatEntries = semuaEntriRiwayat
    .filter((e) => cocokRiwayatFilter(e.tanggal))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  const tahunTersediaRiwayat = Array.from(new Set(semuaEntriRiwayat.filter((e) => e.tanggal).map((e) => e.tanggal.split("-")[0]))).sort().reverse();

  const pajakStatus = getPajakStatus(kendaraanTunggal?.tanggal_pajak);
  const emisiStatus = getUjiEmisiStatus(dataKendaraanTunggal.ujiEmisi);

  const handleExportExcel = () => {
    if (riwayatKendaraanTerpilih.length === 0) return;
    if (riwayatEntries.length === 0) return showToast("Tidak ada data pada filter ini untuk diexport.", "warning");

    const headers = isSatuKendaraan
      ? ["Tanggal", "Jenis", "Detail", "Keterangan", "Karyawan/Driver"]
      : ["Tanggal", "Kendaraan", "Jenis", "Detail", "Keterangan", "Karyawan/Driver"];
    const rows = riwayatEntries.map((e) => isSatuKendaraan
      ? [e.tanggal.split("-").reverse().join("/"), e.jenis, e.utama, e.sub || "-", e.pic || "-"]
      : [e.tanggal.split("-").reverse().join("/"), e.kendaraanLabel, e.jenis, e.utama, e.sub || "-", e.pic || "-"]
    );

    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = headers.map(() => ({ wch: 26 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Riwayat Kendaraan");
    const namaFile = isSatuKendaraan ? (kendaraanTunggal?.plat_nomor || "Kendaraan").replace(/\s/g, "") : `Multi_${riwayatKendaraanTerpilih.length}Unit`;
    XLSX.writeFile(workbook, `Riwayat_${namaFile}_${todayISO()}.xlsx`);
  };

  const handleExportPDF = () => {
    if (riwayatKendaraanTerpilih.length === 0) return;
    if (riwayatEntries.length === 0) return showToast("Tidak ada data pada filter ini untuk diexport.", "warning");
    window.print();
  };

  if (!isReady || !session) return null;
  const adminName = session.nama || "Admin";

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
          --bg: #f7f6f5; --surface: #ffffff;
          --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
          --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
          --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
        }
        .site-header {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 24px; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .back-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 13px; font-weight: 700; font-family: inherit; padding: 6px 4px;
        }
        .back-btn:hover { color: var(--red-600); }
        .admin-badge {
          display: flex; align-items: center; gap: 6px; background: var(--info-50); color: var(--info);
          padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2);
        }
        .admin-hero {
          position: relative; overflow: hidden; border-radius: 0 0 26px 26px; color: #fff;
          padding: 34px 20px 50px; text-align: center;
          background: linear-gradient(150deg, var(--red-700) 0%, var(--red-600) 55%, #c62828 100%);
          box-shadow: 0 16px 30px -16px rgba(220,38,38,0.5);
        }
        .admin-hero::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px; mask-image: linear-gradient(180deg, black, transparent 88%);
        }
        .admin-hero-content { position: relative; }

        .page-tab-nav { display: flex; gap: 6px; background: var(--surface); padding: 6px; border-radius: 16px; border: 1px solid var(--line); box-shadow: 0 10px 25px -10px rgba(0,0,0,0.1); }
        .page-tab-btn { flex: 1; padding: 12px 18px; border-radius: 12px; border: none; font-weight: 800; font-size: 13px; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.15s; }

        .print-only { display: none; }
        @media print {
          @page { margin: 12mm; size: A4 portrait; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
      `}} />
      <div className="site-header no-print">
        <button className="back-btn" onClick={() => router.push("/admin")}>
          <IconArrowLeft size={16} /> Kembali ke Control Panel
        </button>
        <div className="admin-badge">
          <IconUserCircle size={14} /> {adminName}
        </div>
      </div>

      <div className="admin-hero no-print">
        <div className="admin-hero-content">
          <h1 style={{ margin: "0 0 5px 0", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "900", letterSpacing: "1px" }}>MASTER DATA KENDARAAN</h1>
          <p style={{ margin: "0", fontSize: "14px", opacity: 0.9 }}>Kelola armada, riwayat perawatan, dan kepatuhan kendaraan operasional</p>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "-40px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div className="page-tab-nav no-print" style={{ marginBottom: "22px" }}>
          <button
            className="page-tab-btn"
            onClick={() => setPageTab("DAFTAR")}
            style={{ background: pageTab === "DAFTAR" ? "var(--red-600)" : "transparent", color: pageTab === "DAFTAR" ? "#fff" : "var(--muted)" }}
          >
            📋 Daftar Kendaraan
          </button>
          <button
            className="page-tab-btn"
            onClick={() => setPageTab("RIWAYAT")}
            style={{ background: pageTab === "RIWAYAT" ? "var(--red-600)" : "transparent", color: pageTab === "RIWAYAT" ? "#fff" : "var(--muted)" }}
          >
            🗂️ Riwayat Kendaraan
          </button>
        </div>

        {pageTab === "DAFTAR" && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>🚗</span> Daftar Kendaraan <span style={{ background: "var(--bg)", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", color: "var(--ink-soft)" }}>{filteredKendaraan.length} / {kendaraanList.length} Unit</span>
              </h2>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                {kendaraanList.length === 0 && (
                  <Button type="button" fullWidth={false} loading={isMigrating} loadingText="Mengimport..." onClick={handleImportDataLama} variant="secondary" style={{ fontSize: "12px", padding: "10px 14px" }}>
                    📥 Import Data Lama
                  </Button>
                )}
                <MultiSelectDropdown
                  buttonIcon="✅"
                  allLabel="Semua Kendaraan"
                  options={dropdownOptionsKendaraan}
                  selectedIds={daftarEffectiveIds}
                  onChange={setDaftarSelectedIds}
                />
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
                  <input
                    type="text"
                    placeholder="Cari nama, plat, PIC, unit bisnis..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ padding: "10px 15px 10px 35px", borderRadius: "50px", border: "1px solid var(--line)", fontSize: "13px", width: "240px", background: "var(--bg)", outline: "none" }}
                  />
                </div>
                <Button type="button" fullWidth={false} onClick={openTambahKendaraan} style={{ padding: "10px 18px" }}>
                  ➕ Tambah Kendaraan
                </Button>
              </div>
            </div>

            <Table>
              <THead>
                <Tr>
                  <Th>Kendaraan</Th>
                  <Th>PIC / Unit Bisnis</Th>
                  <Th>Status Kepemilikan</Th>
                  <Th>Pajak/STNK</Th>
                  <Th style={{ textAlign: "center" }}>Aksi</Th>
                </Tr>
              </THead>
              <TBody>
                {filteredKendaraan.length > 0 ? (
                  filteredKendaraan.map((k) => {
                    const pajak = getPajakStatus(k.tanggal_pajak);
                    const kepemilikan = getKepemilikanInfo(k);
                    return (
                    <Tr key={k.id}>
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "48px", height: "40px", borderRadius: "8px", background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
                            <VehicleIcon3D jenis={k.kategori} warna={k.warna} size={36} />
                          </div>
                          <div>
                            <div style={{ fontWeight: "bold", color: "var(--info)" }}>{k.kendaraan}</div>
                            <div style={{ fontSize: "12px", color: "var(--muted)" }}>{k.plat_nomor || "-"} {k.jenis ? `• ${k.jenis}` : ""}</div>
                            {(k.no_rangka || k.no_mesin) && (
                              <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                                {k.no_rangka ? `Rangka: ${k.no_rangka}` : ""}{k.no_rangka && k.no_mesin ? " • " : ""}{k.no_mesin ? `Mesin: ${k.no_mesin}` : ""}
                              </div>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td style={{ color: "var(--ink-soft)", fontSize: "13px" }}>
                        <div>{k.pic_kendaraan || <span style={{ opacity: 0.5 }}>PIC belum diisi</span>}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>{k.unit_bisnis || "-"}</div>
                      </Td>
                      <Td style={{ fontSize: "12px" }}>
                        <Badge tone={kepemilikan.tone}>{kepemilikan.label}</Badge>
                        {kepemilikan.sub && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>{kepemilikan.sub}</div>}
                      </Td>
                      <Td style={{ fontSize: "12px" }}>
                        <Badge tone={pajak.tone}>{pajak.label}</Badge>
                        {k.tanggal_pajak && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>{k.tanggal_pajak.split("-").reverse().join("/")}</div>}
                      </Td>
                      <Td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => bukaRiwayat(k)}
                          style={{ background: "var(--ok-50)", color: "var(--ok)", border: "1px solid rgba(22,163,74,0.2)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", marginRight: "6px" }}
                        >
                          📊 Riwayat
                        </button>
                        <button
                          onClick={() => handleMulaiEdit(k)}
                          style={{ background: "var(--warn-50)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.2)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", marginRight: "6px" }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleHapusKendaraan(k.id, k.kendaraan)}
                          style={{ background: "var(--red-50)", color: "var(--red-600)", border: "1px solid rgba(220,38,38,0.2)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}
                        >
                          Hapus
                        </button>
                      </Td>
                    </Tr>
                    );
                  })
                ) : (
                  <Tr>
                    <Td colSpan={5} style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)" }}>
                      <div style={{ fontSize: "30px", marginBottom: "10px" }}>🚗</div>
                      {kendaraanList.length === 0 ? "Belum ada kendaraan terdaftar." : "Tidak ada kendaraan yang cocok dengan filter/pencarian ini."}
                    </Td>
                  </Tr>
                )}
              </TBody>
            </Table>
          </Card>
        )}

        {pageTab === "RIWAYAT" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="no-print">
              <Card style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ width: "56px", height: "48px", borderRadius: "10px", background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0, border: "1px solid var(--line)" }}>
                  {kendaraanTunggal ? <VehicleIcon3D jenis={kendaraanTunggal.kategori} warna={kendaraanTunggal.warna} size={40} /> : <span style={{ fontSize: "22px" }}>🚗</span>}
                </div>
                <div style={{ flex: "1 1 260px" }}>
                  <label style={{ fontSize: "11px", fontWeight: "bold", color: "var(--muted)", display: "block", marginBottom: "4px" }}>PILIH KENDARAAN (BISA LEBIH DARI 1)</label>
                  <MultiSelectDropdown
                    buttonIcon="🚗"
                    allLabel="Semua Kendaraan"
                    options={dropdownOptionsKendaraan}
                    selectedIds={riwayatEffectiveIds}
                    onChange={(ids) => { setRiwayatSelectedIds(ids); setRiwayatFilterBulan("Semua"); setRiwayatFilterTahun("Semua"); }}
                    width="340px"
                  />
                </div>
                {kendaraanTunggal && (
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                    {kendaraanTunggal.pic_kendaraan || "PIC belum diisi"} {kendaraanTunggal.unit_bisnis ? `• ${kendaraanTunggal.unit_bisnis}` : ""}
                  </div>
                )}
              </Card>
            </div>

            {riwayatKendaraanTerpilih.length === 0 ? (
              <Card>
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
                  <div style={{ fontSize: "30px", marginBottom: "10px" }}>🗂️</div>
                  Pilih kendaraan dulu untuk melihat riwayatnya.
                </div>
              </Card>
            ) : (
              <>
                <div className="print-only" style={{ marginBottom: "12px" }}>
                  <h2 style={{ margin: "0 0 4px 0" }}>Riwayat Kendaraan: {riwayatKendaraanTerpilih.map((k) => k.kendaraan).join(", ")}</h2>
                  <div style={{ fontSize: "12px", color: "#555" }}>
                    Periode: {riwayatFilterBulan === "Semua" ? "Semua Bulan" : NAMA_BULAN_RIWAYAT[Number(riwayatFilterBulan) - 1]} {riwayatFilterTahun === "Semua" ? "" : riwayatFilterTahun} • Dicetak {new Date().toLocaleString("id-ID")}
                  </div>
                </div>

                {isSatuKendaraan ? (
                  <div className="no-print" style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                    <Card style={{ flex: "1 1 260px", padding: "16px 18px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--info)", marginBottom: "6px" }}>POSISI / AKTIVITAS TERAKHIR</div>
                      {dataKendaraanTunggal.pergerakanLogs.length > 0 ? (
                        <>
                          <Badge tone={getPergerakanTone(dataKendaraanTunggal.pergerakanLogs[0].status_kendaraan || "")}>{dataKendaraanTunggal.pergerakanLogs[0].status_kendaraan}</Badge>
                          {dataKendaraanTunggal.pergerakanLogs[0].tujuan_keperluan && dataKendaraanTunggal.pergerakanLogs[0].tujuan_keperluan !== "-" && (
                            <div style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink)", marginTop: "6px" }}>📍 {dataKendaraanTunggal.pergerakanLogs[0].tujuan_keperluan}</div>
                          )}
                          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                            👤 {(dataKendaraanTunggal.pergerakanLogs[0].driver_bertugas || "-").replace("Standby: ", "")} • {jamDariTimestamp(dataKendaraanTunggal.pergerakanLogs[0].waktu_catat)}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: "13px", color: "var(--muted)" }}>Belum ada laporan pergerakan</div>
                      )}
                    </Card>
                    <Card style={{ flex: "1 1 220px", padding: "16px 18px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--ok)", marginBottom: "4px" }}>ODOMETER TERAKHIR</div>
                      <div style={{ fontSize: "20px", fontWeight: "900", color: "var(--ok)" }}>
                        {dataKendaraanTunggal.odometerLogs.length > 0 ? `${dataKendaraanTunggal.odometerLogs[0].odometer.toLocaleString("id-ID")} km` : "Belum ada data"}
                      </div>
                      {dataKendaraanTunggal.odometerLogs.length > 0 && <div style={{ fontSize: "11px", color: "var(--muted)" }}>Dicatat {dataKendaraanTunggal.odometerLogs[0].tanggal.split("-").reverse().join("/")}</div>}
                    </Card>
                    <Card style={{ flex: "1 1 220px", padding: "16px 18px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--warn)", marginBottom: "4px" }}>SERVIS TERAKHIR</div>
                      <div style={{ fontSize: "16px", fontWeight: "900", color: "var(--warn)" }}>
                        {dataKendaraanTunggal.serviceLogs.length > 0 ? dataKendaraanTunggal.serviceLogs[0].jenis_service : "Belum ada data"}
                      </div>
                      {dataKendaraanTunggal.serviceLogs.length > 0 && <div style={{ fontSize: "11px", color: "var(--muted)" }}>{dataKendaraanTunggal.serviceLogs[0].tanggal.split("-").reverse().join("/")}</div>}
                    </Card>
                    <Card style={{ flex: "1 1 220px", padding: "16px 18px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "6px" }}>PAJAK / STNK</div>
                      <Badge tone={pajakStatus.tone}>{pajakStatus.label}</Badge>
                      {kendaraanTunggal?.tanggal_pajak && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "6px" }}>{kendaraanTunggal.tanggal_pajak.split("-").reverse().join("/")}</div>}
                    </Card>
                    <Card style={{ flex: "1 1 220px", padding: "16px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--ink-soft)" }}>UJI EMISI</span>
                        <button onClick={() => router.push("/admin/uji-emisi")} style={{ background: "none", border: "none", color: "var(--info)", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>Kelola →</button>
                      </div>
                      <Badge tone={emisiStatus.tone}>{emisiStatus.label}</Badge>
                      {dataKendaraanTunggal.ujiEmisi?.tanggal_pengujian && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "6px" }}>{dataKendaraanTunggal.ujiEmisi.tanggal_pengujian.split("-").reverse().join("/")}</div>}
                    </Card>
                  </div>
                ) : (
                  <div className="no-print" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {riwayatKendaraanTerpilih.map((k) => {
                      const data = riwayatDataMap[k.id] || KOSONG_RIWAYAT_DATA;
                      const posisi = data.pergerakanLogs[0];
                      return (
                        <Card key={k.id} style={{ flex: "1 1 220px", padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <VehicleIcon3D jenis={k.kategori} warna={k.warna} size={24} />
                            <div style={{ fontSize: "13px", fontWeight: "bold", color: "var(--info)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.kendaraan}</div>
                          </div>
                          {posisi ? (
                            <>
                              <Badge tone={getPergerakanTone(posisi.status_kendaraan || "")}>{posisi.status_kendaraan}</Badge>
                              {posisi.tujuan_keperluan && posisi.tujuan_keperluan !== "-" && (
                                <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink)", marginTop: "6px" }}>📍 {posisi.tujuan_keperluan}</div>
                              )}
                              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>{jamDariTimestamp(posisi.waktu_catat)}</div>
                            </>
                          ) : (
                            <div style={{ fontSize: "12px", color: "var(--muted)" }}>Belum ada laporan pergerakan</div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}

                <Card>
                  <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
                    <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                      🗂️ Riwayat Aktivitas <span style={{ background: "var(--bg)", padding: "3px 9px", borderRadius: "8px", fontSize: "12px", color: "var(--ink-soft)" }}>{riwayatEntries.length} entri</span>
                    </h2>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <select value={riwayatFilterBulan} onChange={(e) => setRiwayatFilterBulan(e.target.value)} style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12px", fontWeight: "bold", background: "var(--bg)", cursor: "pointer" }}>
                        <option value="Semua">Semua Bulan</option>
                        {NAMA_BULAN_RIWAYAT.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
                      </select>
                      <select value={riwayatFilterTahun} onChange={(e) => setRiwayatFilterTahun(e.target.value)} style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12px", fontWeight: "bold", background: "var(--bg)", cursor: "pointer" }}>
                        <option value="Semua">Semua Tahun</option>
                        {tahunTersediaRiwayat.map(th => <option key={th} value={th}>{th}</option>)}
                      </select>
                      <button onClick={handleExportExcel} style={{ padding: "8px 14px", background: "var(--ok)", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                        ⬇️ Excel
                      </button>
                      <button onClick={handleExportPDF} style={{ padding: "8px 14px", background: "var(--red-600)", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                        🖨️ PDF
                      </button>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => openLogModal("ODOMETER")} style={{ padding: "8px 12px", background: "var(--info-50)", color: "var(--info)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                          🛣️ + Odometer
                        </button>
                        <button onClick={() => openLogModal("SERVICE")} style={{ padding: "8px 12px", background: "var(--warn-50)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                          🔧 + Servis
                        </button>
                      </div>
                    </div>
                  </div>

                  <Table>
                    <THead>
                      <Tr>
                        <Th>Tanggal</Th>
                        {!isSatuKendaraan && <Th>Kendaraan</Th>}
                        <Th>Jenis</Th>
                        <Th>Detail</Th>
                        <Th>Karyawan / Driver</Th>
                        <Th style={{ textAlign: "center" }}>Lampiran</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {riwayatEntries.length > 0 ? riwayatEntries.map((entry) => (
                        <Tr key={entry.id}>
                          <Td style={{ whiteSpace: "nowrap", fontSize: "12px", color: "var(--muted)" }}>{entry.tanggal.split("-").reverse().join("/")}</Td>
                          {!isSatuKendaraan && <Td style={{ fontSize: "12px", fontWeight: "bold", color: "var(--info)" }}>{entry.kendaraanLabel}</Td>}
                          <Td><Badge tone={entry.tone}>{JENIS_ICON[entry.jenis]} {entry.jenis}</Badge></Td>
                          <Td>
                            <div style={{ fontWeight: "bold", color: "var(--ink)" }}>{entry.utama}</div>
                            {entry.sub && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{entry.sub}</div>}
                          </Td>
                          <Td style={{ fontSize: "12px", color: "var(--ink-soft)" }}>{entry.pic || "-"}</Td>
                          <Td style={{ textAlign: "center" }}>
                            {entry.foto ? (
                              <a href={entry.foto} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={entry.foto} alt="Lampiran" style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "8px" }} />
                              </a>
                            ) : <span style={{ color: "var(--muted)" }}>-</span>}
                          </Td>
                        </Tr>
                      )) : (
                        <Tr>
                          <Td colSpan={isSatuKendaraan ? 5 : 6} style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)" }}>
                            <div style={{ fontSize: "30px", marginBottom: "10px" }}>📭</div>
                            Belum ada riwayat pada filter ini.
                          </Td>
                        </Tr>
                      )}
                    </TBody>
                  </Table>
                </Card>
              </>
            )}
          </div>
        )}
      </div>

      {/* MODAL INPUT / EDIT KENDARAAN */}
      <Modal open={showKendaraanModal} onClose={closeKendaraanModal} maxWidth="600px">
        <h2 style={{ margin: "0 0 20px 0", color: editingId ? "var(--warn)" : "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid var(--line)", paddingBottom: "10px" }}>
          <span>{editingId ? "✏️" : "🚗"}</span> {editingId ? "Edit Data Kendaraan" : "Input Kendaraan Baru"}
        </h2>

        <form onSubmit={handleSubmitKendaraan} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>

          {/* PREVIEW ICON 3D + PILIHAN KATEGORI & WARNA */}
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <div style={{ width: "80px", height: "70px", borderRadius: "10px", overflow: "hidden", flexShrink: 0, background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", border: "2px solid var(--line)" }}>
              <VehicleIcon3D jenis={formData.kategori} warna={formData.warna} size={56} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "4px", display: "block" }}>Kategori Kendaraan</label>
                <select
                  value={formData.kategori}
                  onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--surface)", cursor: "pointer" }}
                >
                  {KATEGORI_KENDARAAN.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "4px", display: "block" }}>Warna</label>
                <select
                  value={formData.warna}
                  onChange={(e) => setFormData({ ...formData, warna: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--surface)", cursor: "pointer" }}
                >
                  {WARNA_KENDARAAN.map((w) => <option key={w.label} value={w.label}>{w.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* UPLOAD FOTO DOKUMENTASI (opsional — bukan icon utama, cuma buat referensi/arsip) */}
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <div style={{ width: "80px", height: "60px", borderRadius: "10px", overflow: "hidden", flexShrink: 0, background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "center", border: "2px solid var(--line)" }}>
              {formData.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={formData.foto_url} alt="Foto kendaraan" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: "22px", color: "var(--muted)" }}>📷</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "inline-block", padding: "8px 14px", background: "var(--bg)", border: "1px dashed var(--muted)", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", cursor: "pointer" }}>
                {isUploadingFoto ? "⏳ Mengunggah..." : (formData.foto_url ? "📸 Ganti Foto Dokumentasi" : "📸 Upload Foto Dokumentasi (opsional)")}
                <input type="file" accept="image/*" onChange={handleFotoUpload} disabled={isUploadingFoto} style={{ display: "none" }} />
              </label>
              {formData.foto_url && !isUploadingFoto && (
                <button type="button" onClick={() => setFormData((prev) => ({ ...prev, foto_url: "" }))} style={{ marginLeft: "8px", background: "none", border: "none", color: "var(--red-600)", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                  Hapus
                </button>
              )}
            </div>
          </div>

          <Input label="Plat Nomor *" name="plat_nomor" value={formData.plat_nomor} onChange={handleInputChange} required placeholder="Contoh: DD 1234 AB" />
          <Input
            label="PIC Kendaraan *"
            name="pic_kendaraan"
            value={formData.pic_kendaraan}
            onChange={handleInputChange}
            required
            placeholder="Ketik nama — bisa pilih dari master karyawan"
            datalistId="pic-kendaraan-list"
            datalistOptions={employees.map((emp) => emp.nama)}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)" }}>Unit Bisnis</label>
            <select
              name="unit_bisnis"
              value={formData.unit_bisnis}
              onChange={handleInputChange}
              style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", outline: "none", boxSizing: "border-box", cursor: "pointer" }}
            >
              <option value="">Pilih Unit Bisnis (Opsional)...</option>
              {DAFTAR_UNIT_BISNIS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <Input label="Jenis / Tipe" name="jenis" value={formData.jenis} onChange={handleInputChange} placeholder="Contoh: Toyota Avanza, Motor, dll (opsional)" />

          <div style={{ display: "flex", gap: "10px" }}>
            <Input containerStyle={{ flex: 1 }} label="No. Rangka" name="no_rangka" value={formData.no_rangka} onChange={handleInputChange} placeholder="Nomor rangka (opsional)" />
            <Input containerStyle={{ flex: 1 }} label="No. Mesin" name="no_mesin" value={formData.no_mesin} onChange={handleInputChange} placeholder="Nomor mesin (opsional)" />
          </div>
          <Input label="Pajak/STNK Berlaku Sampai" name="tanggal_pajak" type="date" value={formData.tanggal_pajak} onChange={handleInputChange} />

          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", marginBottom: "6px", display: "block" }}>Status Kepemilikan</label>
              <select
                value={formData.status_kepemilikan}
                onChange={(e) => setFormData({ ...formData, status_kepemilikan: e.target.value as "Aset" | "Sewa" })}
                style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #cbd5e0", fontSize: "14px", background: "#f8fafc", cursor: "pointer", boxSizing: "border-box" }}
              >
                <option value="Aset">Aset (Milik Sendiri)</option>
                <option value="Sewa">Sewa</option>
              </select>
            </div>
            {formData.status_kepemilikan === "Sewa" && (
              <Input containerStyle={{ flex: 1 }} label="Tanggal Berakhir Sewa" name="tanggal_akhir_sewa" type="date" value={formData.tanggal_akhir_sewa} onChange={handleInputChange} />
            )}
          </div>

          {(formData.plat_nomor || formData.pic_kendaraan) && (
            <div style={{ background: "var(--bg)", border: "1px dashed var(--line)", borderRadius: "10px", padding: "10px 14px" }}>
              <div style={{ fontSize: "10px", fontWeight: "bold", color: "var(--muted)", marginBottom: "3px" }}>IDENTIFIER OTOMATIS (dipakai driver & log)</div>
              <div style={{ fontSize: "13px", fontWeight: "bold", color: "var(--ink)" }}>{buildKendaraanId(formData.plat_nomor, formData.pic_kendaraan, formData.unit_bisnis)}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <Button type="submit" loading={isLoading} loadingText="Menyimpan..." variant={editingId ? "warning" : "primary"}>
              {editingId ? "💾 Update Data" : "➕ Simpan Kendaraan"}
            </Button>
            <Button type="button" variant="secondary" fullWidth={false} onClick={closeKendaraanModal} style={{ padding: "14px 20px" }}>
              Batal
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL CATAT ODOMETER / SERVIS */}
      <Modal open={showLogModal} onClose={() => setShowLogModal(false)} maxWidth="500px">
        <h2 style={{ margin: "0 0 6px 0", color: "var(--ink)", fontSize: "18px", fontWeight: "800" }}>Catat Riwayat</h2>

        {riwayatKendaraanTerpilih.length > 1 && (
          <div style={{ marginBottom: "14px" }}>
            <label style={{ fontSize: "11px", fontWeight: "bold", color: "var(--muted)", display: "block", marginBottom: "4px" }}>UNTUK KENDARAAN</label>
            <select
              value={logTargetId}
              onChange={(e) => setLogTargetId(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", fontWeight: "bold", background: "var(--surface)", cursor: "pointer" }}
            >
              {riwayatKendaraanTerpilih.map((k) => <option key={k.id} value={k.id}>{k.kendaraan}</option>)}
            </select>
          </div>
        )}

        {logTargetKendaraan && (
          <>
            {riwayatKendaraanTerpilih.length <= 1 && (
              <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "var(--muted)" }}>{logTargetKendaraan.kendaraan}</p>
            )}

            <div style={{ display: "flex", background: "var(--bg)", padding: "6px", borderRadius: "14px", marginBottom: "18px", border: "1px solid var(--line)" }}>
              <button onClick={() => setLogModalTab("ODOMETER")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "12px", background: logModalTab === "ODOMETER" ? "var(--surface)" : "transparent", color: logModalTab === "ODOMETER" ? "var(--ok)" : "var(--muted)", cursor: "pointer" }}>🛣️ Odometer</button>
              <button onClick={() => setLogModalTab("SERVICE")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "12px", background: logModalTab === "SERVICE" ? "var(--surface)" : "transparent", color: logModalTab === "SERVICE" ? "var(--ok)" : "var(--muted)", cursor: "pointer" }}>🔧 Servis</button>
            </div>

            {logModalTab === "ODOMETER" ? (
              <form onSubmit={handleSubmitOdometer} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <Input label="Angka Odometer (km)" type="number" value={formOdometer.odometer} onChange={(e) => setFormOdometer({ ...formOdometer, odometer: e.target.value })} placeholder="Cth: 45200" />
                <Input label="Tanggal" type="date" value={formOdometer.tanggal} onChange={(e) => setFormOdometer({ ...formOdometer, tanggal: e.target.value })} />
                <Button type="submit" loading={isSavingOdometer} loadingText="Menyimpan...">Catat Odometer</Button>
              </form>
            ) : (
              <form onSubmit={handleSubmitService} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  <Input containerStyle={{ flex: 1 }} label="Jenis Servis" value={formService.jenis_service} onChange={(e) => setFormService({ ...formService, jenis_service: e.target.value })} placeholder="Cth: Ganti Oli, Servis Berkala" />
                  <Input containerStyle={{ flex: 1 }} label="Tanggal" type="date" value={formService.tanggal} onChange={(e) => setFormService({ ...formService, tanggal: e.target.value })} />
                </div>
                <Input label="Deskripsi" value={formService.deskripsi} onChange={(e) => setFormService({ ...formService, deskripsi: e.target.value })} placeholder="Detail servis (opsional)" />
                <Input label="Biaya (opsional)" value={formService.biaya} onChange={(e) => setFormService({ ...formService, biaya: e.target.value })} placeholder="Cth: 350000" />

                <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--bg)", border: "1px dashed var(--line)", borderRadius: "10px", padding: "10px 12px" }}>
                  {formService.foto_emisi_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={formService.foto_emisi_url} alt="Hasil uji emisi" style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
                  ) : (
                    <span style={{ fontSize: "20px" }}>📎</span>
                  )}
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "inline-block", padding: "6px 12px", background: "var(--bg)", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)", cursor: "pointer" }}>
                      {isUploadingEmisi ? "⏳ Mengunggah..." : (formService.foto_emisi_url ? "Ganti Lampiran Foto" : "Upload Lampiran Foto (opsional)")}
                      <input type="file" accept="image/*" onChange={handleFotoEmisiUpload} disabled={isUploadingEmisi} style={{ display: "none" }} />
                    </label>
                    {formService.foto_emisi_url && !isUploadingEmisi && (
                      <button type="button" onClick={() => setFormService((prev) => ({ ...prev, foto_emisi_url: "" }))} style={{ marginLeft: "8px", background: "none", border: "none", color: "var(--red-600)", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                        Hapus
                      </button>
                    )}
                  </div>
                </div>

                <Button type="submit" loading={isSavingService} loadingText="Menyimpan..." disabled={isUploadingEmisi}>Catat Riwayat Servis</Button>
              </form>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
