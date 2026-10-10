"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  Timestamp,
  where,
  type Query,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { tanggalISOWITASekarang } from "../../lib/shift";
import { useConfirm } from "../../components/ui/ConfirmProvider";
import { logoutWithConfirm, useAuthGuard } from "../../hooks/useAuthGuard";
import AbsensiCard from "../../components/AbsensiCard";
import KehadiranKaryawanPanel from "../../components/KehadiranKaryawanPanel";
import { FITUR_ABSENSI_AKTIF } from "../../lib/fitur";
import { useFcmSetup } from "../../hooks/useFcmSetup";
import AdminShell from "../../components/admin/AdminShell";
import AdminIcon, { type AdminIconName } from "../../components/admin/AdminIcon";
import Tile from "../../components/admin/Tile";
import styles from "./admin-hub.module.css";

type Tone = "info" | "warn" | "ok" | "red" | "accent" | "teal";

interface MenuItem {
  title: string;
  desc: string;
  path: string;
  icon: AdminIconName;
}

interface MenuGroup {
  name: string;
  tone: Tone;
  items: MenuItem[];
}

// "Pantau Laporan Tim" tidak masuk MENU_GROUPS -- grup ini tampil sebagai kotak angka live
// di bagian atas (PANTAU), jadi tidak diulang di daftar menu.
const MENU_GROUPS: MenuGroup[] = [
  {
    name: "Manajemen Dasar",
    tone: "info",
    items: [
      { title: "Manajemen Pengguna", desc: "Akun login staf operasional", path: "/admin/users", icon: "idCard" },
      { title: "Master Data Karyawan", desc: "Direktori 70+ karyawan SIBM", path: "/admin/karyawan", icon: "building" },
      { title: "Master Data Kendaraan", desc: "Foto, PIC, odometer, riwayat servis", path: "/admin/kendaraan", icon: "truck" },
      { title: "Hasil Uji Emisi", desc: "Rekap uji emisi per kendaraan", path: "/admin/uji-emisi", icon: "car" },
      { title: "Master Data Laptop", desc: "Masa sewa laptop tiap user", path: "/admin/laptop", icon: "laptop" },
      { title: "Legalitas & Perizinan", desc: "Dokumen legal + riwayat versi", path: "/admin/legalitas", icon: "stamp" },
    ],
  },
  {
    name: "Layanan GA",
    tone: "warn",
    items: [
      { title: "Pengumuman Gedung", desc: "Carousel info di portal utama", path: "/admin/broadcast", icon: "megaphone" },
      { title: "Gudang ATK", desc: "Permintaan alat tulis kantor", path: "/admin/atk", icon: "clipboard" },
      { title: "Persetujuan Overtime", desc: "Lembur AC & listrik", path: "/admin/overtime", icon: "clock" },
      { title: "Booking Kendaraan & Ruangan", desc: "Jadwal, ubah & batalkan booking", path: "/admin/booking", icon: "calendar" },
      { title: "Helpdesk & Tiket Kerusakan", desc: "Laporan kerusakan dari pengguna kantor", path: "/admin/helpdesk", icon: "wrench" },
      { title: "Temuan & Kondisi Aset", desc: "Hasil inspeksi OB: perbaikan & penggantian", path: "/admin/kondisi-aset", icon: "search" },
      { title: "Alat Kerja OB & CS", desc: "Register alat, PIC, serah terima, label", path: "/dashboard/ob/alat", icon: "box" },
    ],
  },
  {
    name: "Skor & Pengembangan",
    tone: "accent",
    items: [
      { title: "Rekap Poin Staf", desc: "Skor bulanan per departemen", path: "/admin/monitor-poin", icon: "trophy" },
      { title: "Update Dokumen SOP", desc: "SOP/IK untuk tiap menu staf", path: "/admin/sop", icon: "book" },
      { title: "Handbook Magang", desc: "Materi belajar PDF/video", path: "/admin/handbook-magang", icon: "graduationCap" },
      { title: "Survei Kepuasan Gedung", desc: "Kuesioner pelayanan 2x/tahun", path: "/admin/survei-kepuasan", icon: "clipboardList" },
    ],
  },
  {
    name: "Alat & Master",
    tone: "ok",
    items: [
      { title: "Master Data APAR", desc: "APAR per lantai & QR inspeksi", path: "/admin/apar", icon: "fireExtinguisher" },
      { title: "SOP Checklist", desc: "Checklist OB, fasilitas & inspeksi driver", path: "/admin/sop-checklist", icon: "clipboardList" },
      { title: "Titik Patroli", desc: "Titik wajib scan per lantai (renovasi)", path: "/admin/titik-patroli", icon: "shield" },
      { title: "QR Code Generator", desc: "Label titik patroli & kebersihan", path: "/admin/qr-manager", icon: "printer" },
      { title: "Hari Libur", desc: "Tanggal merah & cuti bersama", path: "/admin/hari-libur", icon: "calendar" },
    ],
  },
  {
    name: "Laporan & Sistem",
    tone: "teal",
    items: [
      { title: "Okupansi Gedung", desc: "Luas lantai, tenant & area kosong", path: "/admin/okupansi", icon: "building" },
      { title: "Anggaran & Realisasi", desc: "RAB CAPEX/OPEX vs biaya aktual", path: "/admin/anggaran", icon: "chart" },
      { title: "Project Tracker", desc: "Target, kuartal, task & review mingguan", path: "/admin/project-tracker", icon: "clipboardList" },
      { title: "Dashboard Eksekutif", desc: "Pratinjau tampilan Eksekutif Tenant", path: "/dashboard/eksekutif", icon: "activity" },
      { title: "Laporan Eksekutif", desc: "Rekap bulanan PDF/print", path: "/admin/report", icon: "fileText" },
      { title: "Kesehatan Notifikasi", desc: "Status cron reminder", path: "/admin/monitor-cron", icon: "activity" },
    ],
  },
];

type KunciHitungan =
  | "ob"
  | "security"
  | "driver"
  | "siram"
  | "tukarShift"
  | "overtime"
  | "helpdesk"
  | "atk"
  | "legalitas"
  | "laptop";

interface PantauItem {
  key: KunciHitungan;
  title: string;
  sub: string;
  path: string;
  icon: AdminIconName;
  tone: Tone;
}

const PANTAU: PantauItem[] = [
  { key: "ob", title: "OB & CS", sub: "checklist hari ini", path: "/admin/monitor-ob", icon: "broom", tone: "ok" },
  { key: "security", title: "Security", sub: "laporan patroli hari ini", path: "/admin/monitor-security", icon: "shield", tone: "info" },
  { key: "driver", title: "Driver", sub: "catatan armada hari ini", path: "/admin/monitor-driver", icon: "truck", tone: "warn" },
  { key: "siram", title: "Siram Tanaman", sub: "dari 2 jendela hari ini", path: "/admin/monitor-dadakan", icon: "droplet", tone: "teal" },
  { key: "tukarShift", title: "Tukar Shift", sub: "scan telat bulan ini", path: "/admin/monitor-tukar-shift", icon: "swap", tone: "red" },
];

interface TindakanItem {
  key: KunciHitungan;
  title: string;
  sub: string;
  path: string;
  icon: AdminIconName;
  tone: Tone;
}

const TINDAKAN: TindakanItem[] = [
  { key: "overtime", title: "Persetujuan overtime", sub: "Request lembur tim menunggu", path: "/admin/overtime", icon: "clock", tone: "red" },
  { key: "helpdesk", title: "Tiket helpdesk terbuka", sub: "Belum berstatus selesai", path: "/admin/helpdesk", icon: "wrench", tone: "warn" },
  { key: "atk", title: "Permintaan ATK", sub: "Menunggu disiapkan", path: "/admin/atk", icon: "clipboard", tone: "info" },
  { key: "legalitas", title: "Legalitas perlu diperpanjang", sub: "Berakhir ≤ 60 hari / lewat", path: "/admin/legalitas", icon: "stamp", tone: "warn" },
  { key: "laptop", title: "Sewa laptop mau habis", sub: "Berakhir ≤ 90 hari / lewat", path: "/admin/laptop", icon: "laptop", tone: "accent" },
];

const TONE_VAR: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: "var(--info-50)", fg: "var(--info)" },
  warn: { bg: "var(--warn-50)", fg: "var(--warn)" },
  ok: { bg: "var(--ok-50)", fg: "var(--ok)" },
  red: { bg: "var(--red-50)", fg: "var(--red-600)" },
  accent: { bg: "var(--accent-50)", fg: "var(--accent)" },
  teal: { bg: "var(--teal-50)", fg: "var(--teal)" },
};

type Hitungan = Partial<Record<KunciHitungan, number | null>>;

function isoTambahHari(iso: string, hari: number): string {
  const d = new Date(`${iso}T00:00:00+08:00`);
  d.setDate(d.getDate() + hari);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(d);
}

async function hitung(q: Query): Promise<number> {
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

// Angka beranda dihitung SEKALI tiap halaman dibuka (+ tombol refresh), BUKAN onSnapshot:
// hitungan agregat Firestore jauh lebih murah (1 baca per 1000 dokumen yang cocok) daripada
// listener real-time yang ikut tertagih tiap ada perubahan data. Semua filter sengaja cuma
// 1 field (atau disaring di browser untuk data kecil) supaya tidak butuh index komposit baru.
// Tiap hitungan berdiri sendiri: kalau satu gagal, yang lain tetap tampil (gagal = "—").
async function muatHitungan(): Promise<Hitungan> {
  const hariIni = tanggalISOWITASekarang();
  const awalHari = Timestamp.fromDate(new Date(`${hariIni}T00:00:00+08:00`));
  const awalBulan = new Date(`${hariIni.slice(0, 7)}-01T00:00:00+08:00`).getTime();

  const tugas: Record<KunciHitungan, () => Promise<number>> = {
    ob: () => hitung(query(collection(db, "ob_checklists"), where("tanggal", "==", hariIni))),
    security: () => hitung(query(collection(db, "security_patrols"), where("waktu_laporan", ">=", awalHari))),
    driver: () => hitung(query(collection(db, "operational_vehicle_logs"), where("waktu_catat", ">=", awalHari))),
    siram: () => hitung(query(collection(db, "notifikasi_dadakan_siram"), where("tanggal", "==", hariIni))),
    tukarShift: async () => {
      const snap = await getDocs(query(collection(db, "security_shift_handover"), where("terlambat", "==", true)));
      return snap.docs.filter((d) => {
        const w = d.data().waktu_generate as Timestamp | null | undefined;
        return !!w && w.toMillis() >= awalBulan;
      }).length;
    },
    overtime: () => hitung(query(collection(db, "ga_overtime_requests"), where("status", "==", "Menunggu Approval GA"))),
    helpdesk: () => hitung(query(collection(db, "helpdesk_tickets"), where("status", "in", ["Menunggu", "Sedang Dikerjakan"]))), // §105
    atk: () => hitung(query(collection(db, "ga_atk_requests"), where("status", "==", "Menunggu Disiapkan"))),
    legalitas: () => hitung(query(collection(db, "master_legalitas"), where("tanggal_berakhir_aktif", "<=", isoTambahHari(hariIni, 60)))),
    laptop: async () => {
      const snap = await getDocs(query(collection(db, "master_laptop"), where("tanggal_berakhir", "<=", isoTambahHari(hariIni, 90))));
      return snap.docs.filter((d) => !d.data().dikembalikan).length;
    },
  };

  const kunci = Object.keys(tugas) as KunciHitungan[];
  const hasil = await Promise.allSettled(kunci.map((k) => tugas[k]()));
  const out: Hitungan = {};
  hasil.forEach((r, i) => {
    out[kunci[i]] = r.status === "fulfilled" ? r.value : null;
    if (r.status === "rejected") console.warn(`Hitungan beranda "${kunci[i]}" gagal:`, r.reason);
  });
  return out;
}

function sapaan(): string {
  const jam = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "numeric", hour12: false }).format(new Date()));
  if (jam < 11) return "Selamat pagi";
  if (jam < 15) return "Selamat siang";
  if (jam < 18) return "Selamat sore";
  return "Selamat malam";
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin"],
    depts: ["Admin GA"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });
  // Admin GA belum pernah pasang push notif sama sekali sebelum ini -- dibutuhkan supaya
  // notifikasi kepatuhan (patroli, siram tanaman, checklist OB, status kendaraan) dari
  // scripts/points-deduction.mjs & driver-status-staleness.mjs beneran bisa nyampe sebagai
  // push, bukan cuma masuk kotak masuk in-app.
  useFcmSetup(session?.nama || "", !!session?.nama, "Admin GA");

  const [hitungan, setHitungan] = useState<Hitungan>({});
  const [memuat, setMemuat] = useState(true);
  const [diperbarui, setDiperbarui] = useState<Date | null>(null);
  const [cari, setCari] = useState("");

  const muatUlang = useCallback(async () => {
    setMemuat(true);
    const h = await muatHitungan();
    setHitungan(h);
    setDiperbarui(new Date());
    setMemuat(false);
  }, []);

  useEffect(() => {
    if (!isReady || !session) return;
    let batal = false;
    muatHitungan().then((h) => {
      if (batal) return;
      setHitungan(h);
      setDiperbarui(new Date());
      setMemuat(false);
    });
    return () => {
      batal = true;
    };
  }, [isReady, session]);

  const hasilCari = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    if (!kata) return null;
    const semua: MenuItem[] = [
      ...PANTAU.map((p) => ({ title: `Pantau ${p.title}`, desc: p.sub, path: p.path, icon: p.icon })),
      ...MENU_GROUPS.flatMap((g) => g.items),
    ];
    return semua.filter((m) => `${m.title} ${m.desc}`.toLowerCase().includes(kata));
  }, [cari]);

  if (!isReady || !session) return null;
  const adminName = session.nama || "Admin";
  const namaDepan = adminName.split(/\s+/)[0];
  const wilayah = session.daerah === "PUSAT" ? "Super Admin · Semua wilayah" : session.daerah ? `Wilayah ${session.daerah}` : "Admin GA";

  const angka = (k: KunciHitungan) => {
    if (memuat && hitungan[k] === undefined) return "…";
    const v = hitungan[k];
    return v === null || v === undefined ? "—" : String(v);
  };

  return (
    <AdminShell userName={adminName} backHref={null} onLogout={() => logoutWithConfirm(confirm, router)}>
      <label className={styles.search}>
        <AdminIcon name="search" size={17} strokeWidth={2} />
        <input
          type="search"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Mau buka apa hari ini?"
          aria-label="Cari menu admin"
        />
      </label>

      {hasilCari ? (
        <Tile>
          <h2 className={styles.tileTitle}>Hasil pencarian</h2>
          {hasilCari.length === 0 ? (
            <p className={styles.empty}>Tidak ada menu yang cocok dengan &ldquo;{cari}&rdquo;.</p>
          ) : (
            <div className={styles.menuList}>
              {hasilCari.map((m) => (
                <button key={m.path + m.title} type="button" className={styles.menuRow} onClick={() => router.push(m.path)}>
                  <span className={styles.menuIcon} style={{ background: "var(--chip)", color: "var(--ink)" }}>
                    <AdminIcon name={m.icon} size={18} />
                  </span>
                  <span className={styles.menuText}>
                    <span className={styles.menuTitle}>{m.title}</span>
                    <span className={styles.menuDesc}>{m.desc}</span>
                  </span>
                  <AdminIcon name="chevronRight" size={16} style={{ color: "var(--muted)" }} />
                </button>
              ))}
            </div>
          )}
        </Tile>
      ) : (
        <div className={styles.grid}>
          <Tile variant="brand" className={styles.hero}>
            <div>
              <span className={styles.heroLabel}>{wilayah}</span>
              <h1 className={styles.heroTitle}>
                {sapaan()}, {namaDepan}.
                <br />
                Gedung aman hari ini?
              </h1>
            </div>
            {FITUR_ABSENSI_AKTIF && (
              <div className={styles.heroAbsensi}>
                <AbsensiCard picName={adminName} departemen={session.dept || "Admin GA"} />
              </div>
            )}
          </Tile>

          <Tile className={styles.pantau}>
            <div className={styles.tileHead}>
              <h2 className={styles.tileTitle}>Pantau laporan tim</h2>
              <button type="button" className={styles.refresh} onClick={muatUlang} disabled={memuat} aria-label="Muat ulang angka">
                <AdminIcon name="refresh" size={15} strokeWidth={2} />
                <span>{memuat ? "Memuat…" : diperbarui ? `Diperbarui ${diperbarui.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "Muat ulang"}</span>
              </button>
            </div>
            <div className={styles.pantauGrid}>
              {PANTAU.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={styles.pantauCard}
                  style={{ background: TONE_VAR[p.tone].bg }}
                  onClick={() => router.push(p.path)}
                >
                  <span className={styles.pantauIcon} style={{ color: TONE_VAR[p.tone].fg }}>
                    <AdminIcon name={p.icon} size={20} strokeWidth={1.9} />
                  </span>
                  <span className={styles.pantauText}>
                    <span className={styles.pantauNum}>{angka(p.key)}</span>
                    <span className={styles.pantauTitle}>{p.title}</span>
                    <span className={styles.pantauSub}>{p.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </Tile>

          <Tile className={styles.span4}>
            <h2 className={styles.tileTitle}>Perlu tindakan</h2>
            <div className={styles.menuList}>
              {TINDAKAN.map((t) => {
                const v = hitungan[t.key];
                const ada = typeof v === "number" && v > 0;
                return (
                  <button key={t.key} type="button" className={styles.menuRow} onClick={() => router.push(t.path)}>
                    <span className={styles.menuIcon} style={{ background: TONE_VAR[t.tone].bg, color: TONE_VAR[t.tone].fg }}>
                      <AdminIcon name={t.icon} size={18} />
                    </span>
                    <span className={styles.menuText}>
                      <span className={styles.menuTitle}>{t.title}</span>
                      <span className={styles.menuDesc}>{t.sub}</span>
                    </span>
                    <span
                      className={styles.badge}
                      style={ada ? { background: TONE_VAR[t.tone].bg, color: TONE_VAR[t.tone].fg } : undefined}
                    >
                      {angka(t.key)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Tile>

          {/* §67 Kehadiran & lembur karyawan (versi lengkap: foto & alasan -- khusus login) */}
          <Tile className={styles.span8}>
            <KehadiranKaryawanPanel />
          </Tile>

          {MENU_GROUPS.map((g) => (
            <Tile key={g.name} className={styles.span4}>
              <div className={styles.tileHead}>
                <h2 className={styles.tileTitle}>{g.name}</h2>
                <span className={styles.count}>{g.items.length} menu</span>
              </div>
              <div className={styles.menuList}>
                {g.items.map((m) => (
                  <button key={m.path} type="button" className={styles.menuRow} onClick={() => router.push(m.path)}>
                    <span className={styles.menuIcon} style={{ background: TONE_VAR[g.tone].bg, color: TONE_VAR[g.tone].fg }}>
                      <AdminIcon name={m.icon} size={18} />
                    </span>
                    <span className={styles.menuText}>
                      <span className={styles.menuTitle}>{m.title}</span>
                      <span className={styles.menuDesc}>{m.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Tile>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
