"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import { sesiOBSekarang, waktuWITASekarang, JENDELA_SESI_OB, SesiOB } from "@/lib/shift";

// ==========================================
// IKON — SVG garis, satu ekosistem dengan dashboard/ob (components/pages/DashboardOBPage.tsx)
// ==========================================
type IconProps = { size?: number; color?: string };
const IconArrowLeft = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const IconClipboard = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6" /><path d="M9 15h6" /><path d="M9 19h3" /></svg>
);
const IconClock = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
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
const IconUpload = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 8 5-5 5 5" /><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>
);
const IconTrash = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
);
const IconCheck = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const IconX = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
);
const IconInbox = ({ size = 18, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></svg>
);

// ==========================================
// KONFIGURASI CHECKLIST PER SEGMENT
// Edit di sini kalau mau ubah/tambah pertanyaan per lantai.
// ==========================================
interface PertanyaanItem {
  id: string;
  teks: string;
}

interface SegmentConfig {
  id: string;
  nama: string;
  pertanyaan: PertanyaanItem[];
}

// Basement gak punya toilet — isinya parkiran + tangga, ditambah ruang-ruang utilitas
// (Genset, Gudang, Mesin Air, Pompa Hydrant) dan Taman.
const SEGMENTS_BASEMENT: SegmentConfig[] = [
  {
    id: "basement-parkiran",
    nama: "Parkiran & Tangga",
    pertanyaan: [
      { id: "bsm-1", teks: "Area parkiran basement: apakah sudah disapu dengan bersih?" },
      { id: "bsm-2", teks: "Apakah area parkiran sudah tidak ada sampah berserakan?" },
      { id: "bsm-3", teks: "Area parkiran luar: apakah sudah disapu bersih?" },
      { id: "bsm-4", teks: "Area tangga basement ke lobby: apakah sudah disapu dan dipel?" },
      { id: "bsm-5", teks: "Area tangga utama ke lobby: apakah sudah disapu dan dipel?" },
    ],
  },
  {
    id: "basement-genset",
    nama: "Genset",
    pertanyaan: [
      { id: "bsm-g1", teks: "Apakah area sekitar genset sudah disapu bersih?" },
      { id: "bsm-g2", teks: "Apakah ruang genset bebas dari sampah/kotoran?" },
    ],
  },
  {
    id: "basement-gudang",
    nama: "Gudang",
    pertanyaan: [
      { id: "bsm-gd1", teks: "Apakah lantai gudang sudah disapu?" },
      { id: "bsm-gd2", teks: "Apakah barang di gudang sudah tertata rapi?" },
    ],
  },
  {
    id: "basement-mesin-air",
    nama: "Mesin Air",
    pertanyaan: [
      { id: "bsm-ma1", teks: "Apakah area ruang mesin air sudah dibersihkan dari debu?" },
      { id: "bsm-ma2", teks: "Apakah lantai ruang mesin air sudah disapu?" },
    ],
  },
  {
    id: "basement-hydrant",
    nama: "Pompa Hydrant",
    pertanyaan: [
      { id: "bsm-ph1", teks: "Apakah area ruang pompa hydrant sudah disapu bersih?" },
      { id: "bsm-ph2", teks: "Apakah ruang pompa hydrant bebas dari sampah/kotoran?" },
    ],
  },
  {
    id: "basement-taman",
    nama: "Taman",
    pertanyaan: [
      { id: "bsm-tm1", teks: "Apakah area taman sudah dibersihkan dari sampah/daun kering?" },
      { id: "bsm-tm2", teks: "Apakah tanaman & rumput taman sudah rapi?" },
    ],
  },
];

// Template segment untuk lantai 2-4 (Toilet pria+wanita terpisah + Area Ruang Kerja).
// Lantai 1 & Lantai 5 areanya beda (lihat SEGMENTS_LANTAI1/SEGMENTS_LANTAI5 di bawah), jadi
// gak ikut template ini.
function buatSegmenLantai(nomorLantai: number): SegmentConfig[] {
  return [
    {
      id: `lt${nomorLantai}-toilet`,
      nama: "Toilet",
      pertanyaan: [
        { id: `lt${nomorLantai}-t1`, teks: "Apakah wastafel bagian wanita sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t2`, teks: "Apakah wastafel bagian pria sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t3`, teks: "Apakah kloset pria sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t4`, teks: "Apakah kloset wanita sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t5`, teks: "Apakah urinoir sudah dibersihkan?" },
        { id: `lt${nomorLantai}-t6`, teks: "Apakah keseluruhan lantai toilet wanita dan pria sudah di pel?" },
      ],
    },
    {
      id: `lt${nomorLantai}-kerja`,
      nama: "Area Ruang Kerja",
      pertanyaan: [
        { id: `lt${nomorLantai}-k1`, teks: "Apakah lantai sudah disapu?" },
        { id: `lt${nomorLantai}-k2`, teks: "Apakah lantai sudah dipel?" },
        { id: `lt${nomorLantai}-k3`, teks: "Apakah area kolong meja sudah dibersihkan?" },
      ],
    },
  ];
}

// Lantai 1: cuma 1 toilet (bukan pria/wanita terpisah kayak lantai 2-4), ditambah
// Gudang, Parkiran, Bagian Depan Parkiran, dan Taman.
const SEGMENTS_LANTAI1: SegmentConfig[] = [
  {
    id: "lt1-toilet",
    nama: "Toilet",
    pertanyaan: [
      { id: "lt1-t1", teks: "Apakah wastafel toilet sudah dibersihkan?" },
      { id: "lt1-t2", teks: "Apakah kloset sudah dibersihkan?" },
      { id: "lt1-t3", teks: "Apakah lantai toilet sudah di pel?" },
    ],
  },
  {
    id: "lt1-gudang",
    nama: "Gudang",
    pertanyaan: [
      { id: "lt1-g1", teks: "Apakah lantai gudang sudah disapu?" },
      { id: "lt1-g2", teks: "Apakah barang di gudang sudah tertata rapi?" },
    ],
  },
  {
    id: "lt1-parkiran",
    nama: "Parkiran",
    pertanyaan: [
      { id: "lt1-p1", teks: "Apakah area parkiran sudah disapu bersih?" },
      { id: "lt1-p2", teks: "Apakah area parkiran sudah tidak ada sampah berserakan?" },
    ],
  },
  {
    id: "lt1-depan-parkiran",
    nama: "Bagian Depan Parkiran",
    pertanyaan: [
      { id: "lt1-dp1", teks: "Apakah bagian depan parkiran sudah disapu bersih?" },
      { id: "lt1-dp2", teks: "Apakah bagian depan parkiran sudah tidak ada sampah berserakan?" },
    ],
  },
  {
    id: "lt1-taman",
    nama: "Taman",
    pertanyaan: [
      { id: "lt1-tm1", teks: "Apakah area taman sudah dibersihkan dari sampah/daun kering?" },
      { id: "lt1-tm2", teks: "Apakah tanaman & rumput taman sudah rapi?" },
    ],
  },
];

// Lantai 5: gak ada toilet — isinya Gudang, Ruang Pompa, Rooftop, dan Tandon Air.
// Dikerjakan bersama semua staff (plot bernilai "Semua / All", lihat NILAI_BERSAMA), cukup 1x per hari.
const SEGMENTS_LANTAI5: SegmentConfig[] = [
  {
    id: "lt5-gudang",
    nama: "Gudang",
    pertanyaan: [
      { id: "lt5-g1", teks: "Apakah lantai gudang sudah disapu?" },
      { id: "lt5-g2", teks: "Apakah barang di gudang sudah tertata rapi?" },
    ],
  },
  {
    id: "lt5-pompa",
    nama: "Ruang Pompa",
    pertanyaan: [
      { id: "lt5-rp1", teks: "Apakah area ruang pompa sudah dibersihkan dari debu?" },
      { id: "lt5-rp2", teks: "Apakah lantai ruang pompa sudah disapu?" },
    ],
  },
  {
    id: "lt5-rooftop",
    nama: "Rooftop",
    pertanyaan: [
      { id: "lt5-rt1", teks: "Apakah area rooftop sudah disapu bersih?" },
      { id: "lt5-rt2", teks: "Apakah rooftop sudah tidak ada sampah/daun berserakan?" },
    ],
  },
  {
    id: "lt5-tandon",
    nama: "Tandon Air",
    pertanyaan: [
      { id: "lt5-ta1", teks: "Apakah area sekitar tandon air sudah bersih?" },
      { id: "lt5-ta2", teks: "Apakah tidak ada genangan air/sampah di sekitar tandon?" },
    ],
  },
];

// Tugas ekstra tetap buat Zainal -- apa pun area yang diplot untuknya hari itu, checklist
// hariannya selalu dapat tambahan segment ini di akhir (permintaan user, bukan bagian dari
// rotasi plotting biasa).
const NAMA_STAF_MUSHALLAH_TETAP = "Zainal";
const SEGMENT_MUSHALLAH_L4: SegmentConfig = {
  id: "mushallah-l4-zainal",
  nama: "Mushallah Lantai 4",
  pertanyaan: [
    { id: "mus-1", teks: "Apakah lantai Mushallah sudah disapu?" },
    { id: "mus-2", teks: "Apakah lantai Mushallah sudah dipel?" },
    { id: "mus-3", teks: "Apakah sajadah/karpet sudah dirapikan?" },
    { id: "mus-4", teks: "Apakah area wudhu sudah dibersihkan?" },
  ],
};

const SEGMENTS_PELAYANAN: SegmentConfig[] = [
  {
    id: "pelayanan",
    nama: "Pelayanan",
    pertanyaan: [
      { id: "plyn-1", teks: "Apakah belanja / beli makan sudah dilakukan?" },
      { id: "plyn-2", teks: "Apakah meja sudah dibersihkan?" },
      { id: "plyn-3", teks: "Apakah piring sudah dicuci?" },
      { id: "plyn-4", teks: "Apakah minum sudah disajikan?" },
    ],
  },
];

const SEGMENTS_CONFIG: Record<string, SegmentConfig[]> = {
  "Basement": SEGMENTS_BASEMENT,
  "Lantai 1": SEGMENTS_LANTAI1,
  "Lantai 2": buatSegmenLantai(2),
  "Lantai 3": buatSegmenLantai(3),
  "Lantai 4": buatSegmenLantai(4),
  "Lantai 5": SEGMENTS_LANTAI5,
};

// Sinkron sama NILAI_BERSAMA di PlottingOBPage.tsx — area dgn nilai plot ini dikerjakan
// bersama semua staff & cukup 1x checklist per hari (dipakai buat Lantai 5).
const NILAI_BERSAMA = "Semua / All";

// Minimal pasangan foto before/after yang harus lengkap sebelum laporan bisa dikirim.
const MINIMAL_PASANGAN_FOTO = 2;

function getSegmenUntukArea(area: string, picName?: string): SegmentConfig[] {
  let segmen: SegmentConfig[];
  if (SEGMENTS_CONFIG[area]) segmen = SEGMENTS_CONFIG[area];
  else if (area.toLowerCase().includes("pelayanan")) segmen = SEGMENTS_PELAYANAN;
  else {
    const cocok = Object.keys(SEGMENTS_CONFIG).find(
      (k) => area.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(area.toLowerCase())
    );
    segmen = cocok ? SEGMENTS_CONFIG[cocok] : SEGMENTS_CONFIG["Lantai 1"];
  }

  if (picName === NAMA_STAF_MUSHALLAH_TETAP) {
    segmen = [...segmen, SEGMENT_MUSHALLAH_L4];
  }
  return segmen;
}

// ==========================================
// FIX TIMEZONE: "hari ini" harus dihitung berdasarkan WITA (Asia/Makassar, UTC+8),
// bukan new Date().toISOString() yang formatnya UTC — sama seperti fix di halaman lain
// (dashboard/ob, portal, driver).
// ==========================================
function getTodayISOLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ==========================================
// INTERFACES DATA
// ==========================================
interface JawabanPertanyaan {
  pertanyaan_id: string;
  teks: string;
  jawaban: "Ya" | "Tidak";
}

interface SegmentLog {
  segment_id: string;
  nama_segment: string;
  jawaban: JawabanPertanyaan[];
}

interface FotoPasangan {
  before: string;
  after: string;
}

interface ChecklistLog {
  id: string;
  area: string;
  tanggal?: string;
  sesi?: SesiOB;
  pic_bertugas: string;
  waktu_selesai: Timestamp | null;
  detail_segmen: SegmentLog[];
  foto_bukti: FotoPasangan[];
}

export default function ChecklistOBPage() {
  const router = useRouter();
  const showToast = useToast();

  // Identitas & Navigasi Utama
  const [picName, setPicName] = useState("");
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  // Plot mentah punya PIC ini hari ini (area -> nama/"Semua / All"), belum dikurangi area
  // bersama yang sudah diselesaikan staf lain — null = belum ke-load.
  const [plotMapHariIni, setPlotMapHariIni] = useState<Record<string, string> | null>(null);
  // Area ber-NILAI_BERSAMA yang sudah ada laporannya HARI INI (dari staf manapun) — dipakai
  // buat nyembunyiin Lantai 5 dari semua staf begitu 1 orang sudah menyelesaikannya.
  const [areaBersamaSelesai, setAreaBersamaSelesai] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedArea, setSelectedArea] = useState("");

  // State Data Riwayat
  const [riwayatKerja, setRiwayatKerja] = useState<ChecklistLog[]>([]);

  // Loading States
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [uploadingTask, setUploadingTask] = useState<string | null>(null);

  // State Jawaban Checklist Ya/Tidak, key = pertanyaan_id
  const [jawabanTugas, setJawabanTugas] = useState<Record<string, "Ya" | "Tidak">>({});

  // State Foto Bukti: bisa lebih dari 1 pasang before/after
  const [fotoList, setFotoList] = useState<{ before?: string; after?: string }[]>([{}]);
  const [showFotoModal, setShowFotoModal] = useState(false);

  // Area yang tersedia buat dipilih PIC ini hari ini: punya plot ATAS namanya, DIKURANGI
  // area bersama (Lantai 5) yang sudah diselesaikan staf lain — cukup 1x per hari buat semua.
  const assignedAreas = plotMapHariIni
    ? Object.keys(plotMapHariIni).filter((area) => !(plotMapHariIni[area] === NILAI_BERSAMA && areaBersamaSelesai.has(area)))
    : [];
  // Punya plot mentah tapi semua sudah selesai (dikerjakan staf lain) — beda pesan dgn "tidak ada jadwal sama sekali".
  const semuaTugasSudahSelesai = !!plotMapHariIni && Object.keys(plotMapHariIni).length > 0 && assignedAreas.length === 0;
  // Default pilihan area di step 1 kalau user belum eksplisit milih — dihitung tiap render
  // (bukan lewat effect+setState) biar gak nge-reset pilihan yang udah "dikunci" pas masuk step 2.
  const defaultArea = assignedAreas[0] ?? "";

  // ==========================================
  // EFEK 1: Ambil Identitas & Data Ploting
  // ==========================================
  useEffect(() => {
    const muatDataAwal = async () => {
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
        const plotRef = doc(db, "daily_plots", todayISO);
        const plotSnap = await getDoc(plotRef);

        if (plotSnap.exists()) {
          const plots = (plotSnap.data().plot_lantai || {}) as Record<string, string>;
          const punyaKu: Record<string, string> = {};
          Object.keys(plots).forEach((lantai) => {
            if (plots[lantai] === nama || plots[lantai] === NILAI_BERSAMA) punyaKu[lantai] = plots[lantai];
          });
          setPlotMapHariIni(punyaKu);
        } else {
          setPlotMapHariIni({});
        }
      } catch (error) {
        console.error("Gagal memuat data plotting:", error);
      } finally {
        setIsPageLoading(false);
      }
    };

    muatDataAwal();
  }, [router]);

  // ==========================================
  // EFEK 2: Listener Riwayat Checklist Real-time (punya PIC ini sendiri)
  // ==========================================
  useEffect(() => {
    if (!picName) return;

    const checklistRef = collection(db, "ob_checklists");
    const q = query(checklistRef, where("pic_bertugas", "==", picName), orderBy("waktu_selesai", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: ChecklistLog[] = [];
      snapshot.forEach(docSnap => {
        logs.push({ ...docSnap.data(), id: docSnap.id } as ChecklistLog);
      });
      setRiwayatKerja(logs);
    });

    return () => unsubscribe();
  }, [picName]);

  // ==========================================
  // EFEK 3: Listener Area Bersama yang Sudah Diselesaikan Hari Ini (SEMUA staf, realtime)
  // ==========================================
  useEffect(() => {
    if (!picName) return;

    const todayISO = getTodayISOLocal();
    const checklistRef = collection(db, "ob_checklists");
    const q = query(checklistRef, where("tanggal", "==", todayISO));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const selesai = new Set<string>();
      snapshot.forEach((docSnap) => {
        const area = docSnap.data().area as string | undefined;
        if (area) selesai.add(area);
      });
      setAreaBersamaSelesai(selesai);
    });

    return () => unsubscribe();
  }, [picName]);

  // ==========================================
  // UPLOAD FOTO (menggantikan live-camera)
  // ==========================================
  async function uploadToCloudinary(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
    formData.append("folder", "sibm/checklist-ob");

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
    const data = await res.json();
    return data.secure_url as string;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, index: number, type: "before" | "after") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 720;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setUploadingTask(`${index}-${type}`);
          try {
            const url = await uploadToCloudinary(blob);
            setFotoList(prev => {
              const next = [...prev];
              next[index] = { ...next[index], [type]: url };
              return next;
            });
          } catch (err) {
            console.error(err);
            showToast("Gagal upload foto, coba lagi.", "error");
          } finally {
            setUploadingTask(null);
          }
        }, "image/jpeg", 0.7);
      };
      if (typeof ev.target?.result === "string") img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const hapusFotoSatuan = (index: number, type: "before" | "after") => {
    setFotoList(prev => {
      const next = [...prev];
      const salinan = { ...next[index] };
      delete salinan[type];
      next[index] = salinan;
      return next;
    });
  };

  const tambahPasanganFoto = () => {
    setFotoList(prev => [...prev, {}]);
  };

  const hapusPasanganFoto = (index: number) => {
    setFotoList(prev => {
      if (prev.length <= 1) return [{}]; // minimal selalu ada 1 slot kosong
      return prev.filter((_, i) => i !== index);
    });
  };

  const pilihJawaban = (pertanyaanId: string, jawaban: "Ya" | "Tidak") => {
    setJawabanTugas(prev => ({ ...prev, [pertanyaanId]: jawaban }));
  };

  // ==========================================
  // SUBMIT LAPORAN
  // ==========================================
  const handleKirimLaporan = async () => {
    // Guard: kalau selectedArea adalah area bersama (Lantai 5) dan barusan diselesaikan
    // staf lain (race condition — user udah mulai isi sebelum rekannya submit duluan).
    if (plotMapHariIni?.[selectedArea] === NILAI_BERSAMA && areaBersamaSelesai.has(selectedArea)) {
      showToast(`${selectedArea} baru saja diselesaikan oleh rekan tim lain. Cukup 1x per hari, tidak perlu dikerjakan ulang.`, "info");
      setStep(1);
      return;
    }

    // Wajib lapor 3x sehari dalam jendela waktu tertentu (Pagi/Siang/Sore), bukan bebas
    // kapan saja -- biar keliatan dampak & perubahannya sepanjang hari (instruksi user).
    const sesiSekarang = sesiOBSekarang(waktuWITASekarang());
    if (!sesiSekarang) {
      const daftarJam = JENDELA_SESI_OB.map(j => `${j.sesi} (${j.label})`).join(", ");
      showToast(`Belum masuk jam laporan. Jendela laporan hari ini: ${daftarJam} WITA.`, "warning");
      return;
    }

    const todayISO = getTodayISOLocal();
    const sudahLaporSesiIni = riwayatKerja.some(
      log => log.area === selectedArea && log.tanggal === todayISO && log.sesi === sesiSekarang
    );
    if (sudahLaporSesiIni) {
      showToast(`Anda sudah lapor sesi ${sesiSekarang} untuk ${selectedArea} hari ini. Tunggu jendela sesi berikutnya.`, "info");
      return;
    }

    const daftarSegmen = getSegmenUntukArea(selectedArea, picName);
    const semuaPertanyaan = daftarSegmen.flatMap(s => s.pertanyaan);

    const belumDijawab = semuaPertanyaan.some(p => !jawabanTugas[p.id]);
    if (belumDijawab) {
      return showToast("Mohon isi checklist Ya/Tidak untuk semua item di setiap segment sebelum mengirim laporan!", "warning");
    }

    const fotoValid = fotoList.filter(f => f.before && f.after) as FotoPasangan[];
    if (fotoValid.length < MINIMAL_PASANGAN_FOTO) {
      setShowFotoModal(true);
      return;
    }

    setIsLoading(true);
    try {
      const detailSegmen: SegmentLog[] = daftarSegmen.map(segment => ({
        segment_id: segment.id,
        nama_segment: segment.nama,
        jawaban: segment.pertanyaan.map(p => ({
          pertanyaan_id: p.id,
          teks: p.teks,
          jawaban: jawabanTugas[p.id],
        })),
      }));

      await addDoc(collection(db, "ob_checklists"), {
        pic_bertugas: picName,
        area: selectedArea,
        tanggal: todayISO,
        sesi: sesiSekarang,
        waktu_selesai: serverTimestamp(),
        detail_segmen: detailSegmen,
        foto_bukti: fotoValid,
      });

      showToast("Laporan Kebersihan berhasil dikirim! Riwayat visual Anda telah terekam di sistem.", "success");
      setJawabanTugas({});
      setFotoList([{}]);
      setStep(1);
      setActiveTab("history");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      showToast("Terjadi kesalahan sistem saat mengirim laporan.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Dipanggil dari modal peringatan foto kurang: tutup modal, siapkan slot kosong baru
  // kalau semua pasangan yang ada sudah lengkap, lalu scroll ke section Foto Bukti.
  const handleTambahFotoDariModal = () => {
    setShowFotoModal(false);
    const adaSlotKosong = fotoList.some(f => !f.before || !f.after);
    if (!adaSlotKosong) tambahPasanganFoto();
    document.getElementById("foto-bukti-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const formatJam = (ts: Timestamp | null) => {
    if (!ts) return "-";
    return new Date(ts.toDate()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  // Nomor "Sesi ke-N" per log riwayat — dihitung dari urutan kronologis (ascending) laporan
  // dengan area & tanggal kalender yang sama, biar keliatan ini pembersihan sesi keberapa
  // di hari itu (mis. lantai yang sama dibersihkan 3x sehari -> Sesi 1, Sesi 2, Sesi 3).
  const sesiPerLog = new Map<string, number>();
  {
    const urutanNaik = [...riwayatKerja].sort((a, b) => (a.waktu_selesai?.toMillis() ?? 0) - (b.waktu_selesai?.toMillis() ?? 0));
    const penghitung: Record<string, number> = {};
    urutanNaik.forEach((log) => {
      const tglLog = log.waktu_selesai ? new Date(log.waktu_selesai.toDate()).toLocaleDateString("id-ID") : "-";
      const kunci = `${log.area}__${tglLog}`;
      penghitung[kunci] = (penghitung[kunci] || 0) + 1;
      sesiPerLog.set(log.id, penghitung[kunci]);
    });
  }

  const rootTokenCSS = `
    :root {
      --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4;
      --bg: #f7f6f5; --surface: #ffffff;
      --red-700: #9f1d1d; --red-600: #dc2626; --red-500: #ef4444; --red-50: #fef2f2;
      --ok: #16a34a; --ok-50: #f0fdf4; --info: #2563eb; --info-50: #eff6ff;
      --warn: #d97706; --warn-50: #fff7ed; --accent: #7c3aed;
    }
  `;

  if (isPageLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "var(--bg)", fontFamily: "'Inter', sans-serif" }}>
        <style dangerouslySetInnerHTML={{ __html: `${rootTokenCSS} @keyframes spin { to { transform: rotate(360deg); } }` }} />
        <div style={{ width: "44px", height: "44px", borderRadius: "50%", border: "4px solid var(--ok-50)", borderTopColor: "var(--ok)", animation: "spin 0.8s linear infinite", marginBottom: "16px" }} />
        <div style={{ fontWeight: "bold", fontSize: "14px", color: "var(--ink-soft)" }}>Menyelaraskan Tugas Ploting Anda...</div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", paddingBottom: "50px" }}>

      <style dangerouslySetInnerHTML={{__html: `
        ${rootTokenCSS}
        * { box-sizing: border-box; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .top-bar {
          display: flex; justify-content: space-between; align-items: center; padding: 14px 20px;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line);
          position: sticky; top: 0; z-index: 20;
        }
        .back-btn {
          background: var(--bg); border: 1px solid var(--line); border-radius: 10px; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-soft); transition: 0.2s;
        }
        .back-btn:hover { background: var(--line); }
        .tab-switch { background: var(--bg); padding: 4px; border-radius: 10px; display: flex; gap: 4px; }
        .tab-btn { border: none; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; background: transparent; color: var(--muted); transition: all 0.2s; display: flex; align-items: center; gap: 6px; font-family: inherit; }
        .tab-btn.active { background: var(--surface); color: var(--ok); box-shadow: 0 2px 4px rgba(0,0,0,0.06); }
        .icon-chip { display: inline-flex; align-items: center; justify-content: center; border-radius: 16px; flex-shrink: 0; }
        .segment-title { display: flex; align-items: center; gap: 8px; margin: 0 0 12px 4px; color: var(--ink); font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
        .question-row { background: var(--surface); padding: 16px; border-radius: 16px; box-shadow: 0 6px 12px -4px rgba(0,0,0,0.05); border: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
        .answer-btn { display: flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); font-weight: bold; font-size: 13px; cursor: pointer; font-family: inherit; transition: 0.15s; }
        .answer-btn.ya.active { border-color: var(--ok); background: var(--ok); color: white; }
        .answer-btn.tidak.active { border-color: var(--red-600); background: var(--red-600); color: white; }
        .foto-dropzone { width: 100%; aspect-ratio: 3/4; background: var(--surface); border: none; border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 12px; font-weight: bold; transition: 0.2s; }
        .input-grid-mobile { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 640px) {
          .input-grid-mobile { grid-template-columns: 1fr 1fr; gap: 10px; }
        }
      `}} />

      {/* 🔹 TOP BAR NAVBAR */}
      <div className="top-bar">
        <button className="back-btn" onClick={() => router.push("/dashboard/ob")}><IconArrowLeft size={16} /></button>

        {/* TAB SWITCHER */}
        <div className="tab-switch">
          <button onClick={() => setActiveTab("form")} className={`tab-btn ${activeTab === "form" ? "active" : ""}`}>
            <IconClipboard size={14} /> Lapor Kerja
          </button>
          <button onClick={() => setActiveTab("history")} className={`tab-btn ${activeTab === "history" ? "active" : ""}`}>
            <IconClock size={14} /> Riwayat ({riwayatKerja.length})
          </button>
        </div>
      </div>

      <div style={{ maxWidth: "600px", margin: "30px auto 0", padding: "0 20px" }}>

        {/* ========================================================================================= */}
        {/* TAB 1: FORMULIR CHECKLIST PER SEGMENT & FOTO BUKTI */}
        {/* ========================================================================================= */}
        {activeTab === "form" && (
          <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
            {step === 1 && (
              <div style={{ background: "var(--surface)", padding: "40px 25px", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", textAlign: "center", borderTop: "6px solid var(--ok)" }}>
                {assignedAreas.length > 0 ? (
                  <>
                    <div className="icon-chip" style={{ width: "72px", height: "72px", background: "var(--ok-50)", color: "var(--ok)", margin: "0 auto 18px" }}><IconMapPin size={34} /></div>
                    <h2 style={{ margin: "0 0 10px 0", color: "var(--ink)", fontSize: "22px" }}>Mulai Shift Kebersihan</h2>
                    <p style={{ color: "var(--muted)", marginBottom: "30px", fontSize: "14px", lineHeight: "1.5" }}>Pilih salah satu lokasi penugasan Anda hari ini untuk mulai merekam progres pekerjaan.</p>

                    <select
                      value={selectedArea || defaultArea} onChange={(e) => setSelectedArea(e.target.value)}
                      style={{ width: "100%", padding: "18px", borderRadius: "12px", border: "2px solid var(--ok)", fontSize: "16px", fontWeight: "bold", color: "var(--ok)", marginBottom: "30px", cursor: "pointer", background: "var(--ok-50)", outline: "none", appearance: "none", textAlign: "center" }}
                    >
                      {assignedAreas.map(area => <option key={area} value={area}>{area}</option>)}
                    </select>

                    <button
                      onClick={() => { if (!selectedArea) setSelectedArea(defaultArea); setStep(2); }}
                      style={{ width: "100%", padding: "18px", background: "var(--ok)", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "16px", cursor: "pointer", boxShadow: "0 10px 15px -3px rgba(22,163,74,0.3)", transition: "transform 0.2s" }}
                      onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"}
                      onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
                    >
                      Lanjut Isi Checklist ➔
                    </button>
                  </>
                ) : semuaTugasSudahSelesai ? (
                  <div style={{ padding: "20px" }}>
                    <div className="icon-chip" style={{ width: "72px", height: "72px", background: "var(--ok-50)", color: "var(--ok)", margin: "0 auto 18px" }}><IconCheck size={30} /></div>
                    <h3 style={{ color: "var(--ok)", margin: "0 0 10px 0", fontSize: "20px" }}>Tugas Hari Ini Sudah Selesai</h3>
                    <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0, lineHeight: "1.6" }}>
                      Area bersama (Lantai 5) sudah diselesaikan oleh rekan tim Anda hari ini — cukup 1x per hari, jadi tidak perlu dikerjakan ulang. Kerja bagus! 🎉
                    </p>
                  </div>
                ) : (
                  <div style={{ padding: "20px" }}>
                    <div className="icon-chip" style={{ width: "72px", height: "72px", background: "var(--red-50)", color: "var(--red-600)", margin: "0 auto 18px" }}><IconAlertTriangle size={34} /></div>
                    <h3 style={{ color: "var(--red-700)", margin: "0 0 10px 0", fontSize: "20px" }}>Anda Tidak Memiliki Jadwal</h3>
                    <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0, lineHeight: "1.6" }}>
                      Koordinator belum memetakan lokasi kerja Anda untuk hari ini. Silakan hubungi koordinator Anda untuk mendapatkan plot area.
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>

                {/* HEAD CARD AREA */}
                <div style={{ background: "var(--surface)", padding: "20px", borderRadius: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", marginBottom: "25px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--line)", borderLeft: "6px solid var(--ok)" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Lokasi Pelaporan:</span>
                    <h2 style={{ margin: "5px 0 0 0", color: "var(--ink)", fontSize: "18px" }}>{selectedArea}</h2>
                  </div>
                  <button onClick={() => setStep(1)} style={{ background: "var(--bg)", border: "1px solid var(--line)", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold", color: "var(--ink-soft)" }}>Ganti Area</button>
                </div>

                {/* STATUS 3 SESI HARI INI (Pagi/Siang/Sore) UNTUK AREA INI */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "25px", flexWrap: "wrap" }}>
                  {JENDELA_SESI_OB.map(({ sesi, label }) => {
                    const todayISO = getTodayISOLocal();
                    const sudahLapor = riwayatKerja.some(log => log.area === selectedArea && log.tanggal === todayISO && log.sesi === sesi);
                    const sesiAktif = sesiOBSekarang(waktuWITASekarang()) === sesi;
                    return (
                      <div key={sesi} style={{
                        flex: "1 1 100px", padding: "8px 10px", borderRadius: "10px", textAlign: "center", fontSize: "11px", fontWeight: "bold",
                        background: sudahLapor ? "var(--ok-50)" : (sesiAktif ? "var(--info-50)" : "var(--bg)"),
                        color: sudahLapor ? "var(--ok)" : (sesiAktif ? "var(--info)" : "var(--muted)"),
                        border: `1px solid ${sudahLapor ? "rgba(22,163,74,0.3)" : (sesiAktif ? "rgba(37,99,235,0.3)" : "var(--line)")}`,
                      }}>
                        {sudahLapor ? "✅" : sesiAktif ? "🕒" : "⏳"} {sesi} <span style={{ display: "block", fontWeight: "normal", opacity: 0.8 }}>{label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* CHECKLIST PER SEGMENT */}
                {getSegmenUntukArea(selectedArea, picName).map((segment) => (
                  <div key={segment.id} style={{ marginBottom: "20px" }}>
                    <h3 className="segment-title">
                      <span className="icon-chip" style={{ width: "22px", height: "22px", background: "var(--ok)", color: "white", borderRadius: "6px" }}><IconClipboard size={12} /></span>
                      {segment.nama}
                    </h3>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {segment.pertanyaan.map((p) => {
                        const jawaban = jawabanTugas[p.id];
                        return (
                          <div key={p.id} className="question-row">
                            <span style={{ color: "var(--ink)", fontSize: "14px", flex: "1 1 200px", lineHeight: "1.4" }}>{p.teks}</span>

                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                type="button"
                                onClick={() => pilihJawaban(p.id, "Ya")}
                                className={`answer-btn ya ${jawaban === "Ya" ? "active" : ""}`}
                              >
                                <IconCheck size={13} /> Ya
                              </button>
                              <button
                                type="button"
                                onClick={() => pilihJawaban(p.id, "Tidak")}
                                className={`answer-btn tidak ${jawaban === "Tidak" ? "active" : ""}`}
                              >
                                <IconX size={13} /> Tidak
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* FOTO BUKTI (BEFORE/AFTER) - BISA LEBIH DARI 1 PASANG */}
                <div id="foto-bukti-section" style={{ marginTop: "30px", scrollMarginTop: "80px" }}>
                  <h3 className="segment-title" style={{ marginBottom: "4px" }}>
                    <span className="icon-chip" style={{ width: "22px", height: "22px", background: "var(--ok)", color: "white", borderRadius: "6px" }}><IconCamera size={12} /></span>
                    Foto Bukti
                  </h3>
                  <p style={{ margin: "0 0 15px 4px", color: "var(--muted)", fontSize: "12px" }}>Minimal {MINIMAL_PASANGAN_FOTO} pasang before/after. Bisa tambah lebih banyak sesuai kebutuhan.</p>

                  {fotoList.map((foto, index) => (
                    <div key={index} style={{ background: "var(--surface)", padding: "18px", borderRadius: "18px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)", border: "1px solid var(--line)", marginBottom: "15px", position: "relative" }}>
                      {fotoList.length > 1 && (
                        <button
                          onClick={() => hapusPasanganFoto(index)}
                          style={{ position: "absolute", top: "10px", right: "10px", background: "var(--red-50)", color: "var(--red-600)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "8px", padding: "4px 10px", fontSize: "11px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          <IconTrash size={12} /> Hapus
                        </button>
                      )}
                      <div style={{ fontSize: "11px", fontWeight: "900", color: "var(--muted)", marginBottom: "12px" }}>PASANGAN FOTO #{index + 1}</div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                        {/* KOTAK BEFORE */}
                        <div style={{ background: "var(--red-50)", padding: "10px", borderRadius: "16px", border: "1px dashed rgba(220,38,38,0.3)" }}>
                          <div style={{ fontSize: "11px", fontWeight: "900", color: "var(--red-700)", marginBottom: "10px", textAlign: "center", letterSpacing: "1px" }}>SEBELUM</div>
                          {foto.before ? (
                            <div style={{ position: "relative" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={foto.before} alt="Before" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "12px", border: "2px solid rgba(220,38,38,0.25)" }} />
                              <button onClick={() => hapusFotoSatuan(index, "before")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "var(--red-600)", color: "white", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>✖</button>
                            </div>
                          ) : (
                            <label className="foto-dropzone" style={{ color: "var(--red-600)" }}>
                              {uploadingTask === `${index}-before` ? (
                                <div style={{ width: "22px", height: "22px", borderRadius: "50%", border: "3px solid rgba(220,38,38,0.2)", borderTopColor: "var(--red-600)", animation: "spin 0.8s linear infinite" }} />
                              ) : (
                                <IconUpload size={22} />
                              )}
                              <span>{uploadingTask === `${index}-before` ? "Mengunggah..." : "Upload Foto"}</span>
                              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, index, "before")} style={{ display: "none" }} disabled={uploadingTask === `${index}-before`} />
                            </label>
                          )}
                        </div>

                        {/* KOTAK AFTER */}
                        <div style={{ background: "var(--ok-50)", padding: "10px", borderRadius: "16px", border: "1px dashed rgba(22,163,74,0.3)" }}>
                          <div style={{ fontSize: "11px", fontWeight: "900", color: "var(--ok)", marginBottom: "10px", textAlign: "center", letterSpacing: "1px" }}>SESUDAH</div>
                          {foto.after ? (
                            <div style={{ position: "relative" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={foto.after} alt="After" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "12px", border: "2px solid rgba(22,163,74,0.25)" }} />
                              <button onClick={() => hapusFotoSatuan(index, "after")} style={{ position: "absolute", top: "-10px", right: "-10px", background: "var(--ok)", color: "white", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>✖</button>
                            </div>
                          ) : (
                            <label className="foto-dropzone" style={{ color: "var(--ok)" }}>
                              {uploadingTask === `${index}-after` ? (
                                <div style={{ width: "22px", height: "22px", borderRadius: "50%", border: "3px solid rgba(22,163,74,0.2)", borderTopColor: "var(--ok)", animation: "spin 0.8s linear infinite" }} />
                              ) : (
                                <IconUpload size={22} />
                              )}
                              <span>{uploadingTask === `${index}-after` ? "Mengunggah..." : "Upload Foto"}</span>
                              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, index, "after")} style={{ display: "none" }} disabled={uploadingTask === `${index}-after`} />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={tambahPasanganFoto}
                    style={{ width: "100%", padding: "14px", background: "var(--surface)", color: "var(--ok)", border: "2px dashed var(--ok)", borderRadius: "14px", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}
                  >
                    ➕ Tambah Pasangan Foto
                  </button>
                </div>

                <button
                  onClick={handleKirimLaporan} disabled={isLoading}
                  style={{ width: "100%", padding: "20px", background: isLoading ? "#a0aec0" : "var(--ok)", color: "white", border: "none", borderRadius: "16px", fontWeight: "bold", fontSize: "16px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "30px", boxShadow: isLoading ? "none" : "0 10px 20px -5px rgba(22,163,74,0.4)", transition: "all 0.3s" }}
                >
                  {isLoading ? "🔄 MENGUNGGAH LAPORAN..." : "🚀 KUKUHKAN & KIRIM LAPORAN"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================================= */}
        {/* TAB 2: GALERI & RIWAYAT VISUAL */}
        {/* ========================================================================================= */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "25px", animation: "fadeIn 0.3s ease-in-out" }}>
            {riwayatKerja.length > 0 ? riwayatKerja.map((log) => (
              <div key={log.id} style={{ background: "var(--surface)", borderRadius: "20px", padding: "25px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", border: "1px solid var(--line)" }}>

                {/* Header Riwayat */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", fontWeight: "bold" }}>Selesai Dibersihkan:</span>
                    <h3 style={{ margin: "5px 0 0 0", color: "var(--ink)", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><IconMapPin size={16} color="var(--ok)" /> {log.area}</span>
                      <span style={{ fontSize: "10px", fontWeight: "900", color: "var(--ok)", background: "var(--ok-50)", padding: "3px 9px", borderRadius: "20px", letterSpacing: "0.5px" }}>SESI {sesiPerLog.get(log.id) ?? 1}</span>
                    </h3>
                  </div>
                  <span style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink-soft)", padding: "8px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "5px" }}>
                    <IconClock size={13} /> {formatJam(log.waktu_selesai)}
                  </span>
                </div>

                {/* Checklist per Segment */}
                {(log.detail_segmen || []).map((segment, segIdx) => (
                  <div key={segIdx} style={{ marginBottom: "18px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "900", color: "var(--ok)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{segment.nama_segment}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {segment.jawaban.map((item, itemIdx) => {
                        const isYa = item.jawaban === "Ya";
                        return (
                          <div key={itemIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: "10px", background: isYa ? "var(--ok-50)" : "var(--red-50)", border: "1px solid var(--line)" }}>
                            <span style={{ fontSize: "12px", color: "var(--ink)" }}>{item.teks}</span>
                            <span style={{ fontSize: "10px", fontWeight: "900", padding: "3px 8px", borderRadius: "6px", background: isYa ? "var(--ok)" : "var(--red-600)", color: "white", whiteSpace: "nowrap", marginLeft: "8px", display: "flex", alignItems: "center", gap: "3px" }}>
                              {isYa ? <><IconCheck size={9} color="white" /> YA</> : <><IconX size={9} color="white" /> TIDAK</>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Foto Bukti - Bisa Lebih Dari 1 Pasang */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "10px" }}>
                  {(log.foto_bukti || []).map((foto, fotoIdx) => (
                    <div key={fotoIdx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div style={{ background: "var(--red-50)", padding: "8px", borderRadius: "12px", border: "1px solid rgba(220,38,38,0.2)" }}>
                        <div style={{ fontSize: "10px", color: "var(--red-600)", fontWeight: "900", marginBottom: "8px", textAlign: "center" }}>BEFORE #{fotoIdx + 1}</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={foto.before} alt="Sebelum" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px" }} />
                      </div>
                      <div style={{ background: "var(--ok-50)", padding: "8px", borderRadius: "12px", border: "1px solid rgba(22,163,74,0.2)" }}>
                        <div style={{ fontSize: "10px", color: "var(--ok)", fontWeight: "900", marginBottom: "8px", textAlign: "center" }}>AFTER #{fotoIdx + 1}</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={foto.after} alt="Sesudah" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "8px" }} />
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            )) : (
              <div style={{ padding: "60px 20px", textAlign: "center", background: "var(--surface)", borderRadius: "20px", border: "2px dashed var(--line)", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)" }}>
                <div className="icon-chip" style={{ width: "60px", height: "60px", background: "var(--bg)", color: "var(--muted)", margin: "0 auto 15px" }}><IconInbox size={28} /></div>
                <h3 style={{ color: "var(--ink-soft)", margin: "0 0 10px 0" }}>Belum Ada Riwayat</h3>
                <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0 }}>Log pekerjaan Anda akan terekam dan ditampilkan dengan apik di sini setelah Anda mengirimkan laporan pertama.</p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ⚠️ MODAL: FOTO BELUM CUKUP (minimal MINIMAL_PASANGAN_FOTO pasang before/after) */}
      {showFotoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          <div style={{ background: "var(--surface)", width: "100%", maxWidth: "380px", borderRadius: "20px", padding: "28px 24px", textAlign: "center", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)" }}>
            <div className="icon-chip" style={{ width: "60px", height: "60px", background: "var(--warn-50)", color: "var(--warn)", margin: "0 auto 16px" }}><IconCamera size={28} /></div>
            <h3 style={{ margin: "0 0 8px 0", color: "var(--ink)", fontSize: "17px" }}>Foto Belum Cukup</h3>
            <p style={{ margin: "0 0 22px 0", color: "var(--muted)", fontSize: "13px", lineHeight: "1.5" }}>
              Minimal <strong>{MINIMAL_PASANGAN_FOTO} pasang foto</strong> before/after diperlukan sebagai bukti pembersihan. Anda baru melampirkan {fotoList.filter(f => f.before && f.after).length} pasang lengkap — mohon tambahkan lagi sebelum mengirim laporan.
            </p>
            <button onClick={handleTambahFotoDariModal} style={{ width: "100%", padding: "13px", background: "var(--ok)", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", marginBottom: "8px" }}>
              + Tambah Foto Sekarang
            </button>
            <button onClick={() => setShowFotoModal(false)} style={{ width: "100%", padding: "13px", background: "transparent", color: "var(--muted)", border: "none", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}>
              Nanti Dulu
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
