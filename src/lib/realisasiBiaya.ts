/**
 * Realisasi biaya bersama (§164) -- dipakai halaman Anggaran & Realisasi dan Evaluasi Biaya (Super Admin).
 * Realisasi = realisasi_biaya (manual, item_id -> baris RAB) + sumber otomatis:
 *   helpdesk_tickets Selesai dgn biaya · kendaraan_service_logs · ga_atk_requests "Selesai / Diambil" x harga master_atk
 *   · temuan_aset Selesai dgn biaya (gedung/utilitas -> perbaikan, alat -> penggantian alat).
 * Sumber otomatis dialokasikan ke 1 baris RAB lewat peta_otomatis di anggaran_rab/{tahun}.
 */

import { collection, doc, getDoc, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import { DAERAH_DEFAULT } from "./daerah";

export type Jenis = "CAPEX" | "OPEX" | "PL";
export interface ItemRab {
  id: string; jenis: Jenis; kelompok: string; kode: string; uraian: string;
  qty: number; uom: string; harga: number; q: boolean[];
  deskripsi?: string; risiko?: string; usulan?: string;
  /** §166 alasan bila rencana meleset (lihat analisaDeviasi) */
  alasan_deviasi?: string; tindakan_deviasi?: string; deviasi_untuk?: string; q_revisi?: boolean[]; deviasi_oleh?: string; deviasi_tgl?: string;
}
export interface PetaOtomatis { helpdesk?: string; servis?: string; atk?: string; temuan_gedung?: string; temuan_alat?: string }
export type Sumber = "manual" | "helpdesk" | "servis" | "atk" | "temuan_gedung" | "temuan_alat";
/** daerah = wilayah dokumen sumber (data lama tanpa field dianggap DAERAH_DEFAULT, sesuai migrasi §78). */
export interface Realisasi { id: string; sumber: Sumber; item_id?: string; tanggal: string; uraian: string; jumlah: number; kategori?: string; daerah?: string }
export const LABEL_SUMBER: Record<Sumber, string> = { manual: "Input manual", helpdesk: "Helpdesk", servis: "Servis kendaraan", atk: "ATK", temuan_gedung: "Temuan gedung", temuan_alat: "Temuan alat" };

export const angkaRupiah = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d]/g, "")) || 0);
const tglWITA = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(d);

/** Biaya dari sumber otomatis untuk 1 tahun kalender (WITA). Gagal per sumber tidak menggagalkan yang lain. */
export async function muatRealisasiOtomatis(tahun: number): Promise<Realisasi[]> {
  const awal = `${tahun}-01-01`;
  const akhir = `${tahun + 1}-01-01`;
  const tsAwal = Timestamp.fromDate(new Date(`${awal}T00:00:00+08:00`));
  const tsAkhir = Timestamp.fromDate(new Date(`${akhir}T00:00:00+08:00`));
  const hasil: Realisasi[] = [];
  try {
    const t = await getDocs(query(collection(db, "helpdesk_tickets"), where("waktu_selesai", ">=", tsAwal), where("waktu_selesai", "<", tsAkhir)));
    t.docs.forEach((d) => {
      const x = d.data();
      if (!(x.biaya > 0) || x.status !== "Selesai") return;
      hasil.push({ id: `hd-${d.id}`, daerah: x.daerah || DAERAH_DEFAULT, sumber: "helpdesk", tanggal: tglWITA(x.waktu_selesai.toDate()), uraian: `${x.lokasi || "-"}: ${x.deskripsi || ""}`.slice(0, 140), jumlah: x.biaya });
    });
  } catch (e) { console.error("[realisasi] helpdesk:", e); }
  try {
    const s = await getDocs(query(collection(db, "kendaraan_service_logs"), where("tanggal", ">=", awal), where("tanggal", "<", akhir)));
    s.docs.forEach((d) => {
      const x = d.data();
      const n = angkaRupiah(x.biaya);
      if (!n) return;
      hasil.push({ id: `sv-${d.id}`, daerah: x.daerah || DAERAH_DEFAULT, sumber: "servis", tanggal: x.tanggal, uraian: `${String(x.kendaraan || "").split(" - ")[0]}: ${x.jenis_service || "Servis"}`, jumlah: n });
    });
  } catch (e) { console.error("[realisasi] servis:", e); }
  try {
    const [mst, req] = await Promise.all([
      getDocs(collection(db, "master_atk")),
      getDocs(query(collection(db, "ga_atk_requests"), where("waktu_request", ">=", tsAwal), where("waktu_request", "<", tsAkhir))),
    ]);
    const harga = new Map(mst.docs.map((d) => [d.data().nama_barang as string, (d.data().harga || {}) as Record<string, number>]));
    const satuanDefault = new Map(mst.docs.map((d) => [d.data().nama_barang as string, ((d.data().satuan as string[]) || ["PCS"])[0]]));
    req.docs.forEach((d) => {
      const x = d.data();
      if (x.status !== "Selesai / Diambil" || !x.waktu_request) return;
      let total = 0;
      for (const it of (x.items || []) as { nama_barang: string; jumlah: string; satuan?: string }[]) {
        const h = harga.get(it.nama_barang)?.[it.satuan || satuanDefault.get(it.nama_barang) || "PCS"];
        if (h) total += h * (parseInt(it.jumlah, 10) || 0);
      }
      if (total > 0) hasil.push({ id: `atk-${d.id}`, daerah: x.daerah || DAERAH_DEFAULT, sumber: "atk", tanggal: tglWITA(x.waktu_request.toDate()), uraian: `ATK ${x.resi || ""} · ${x.departemen || "-"}`, jumlah: total });
    });
  } catch (e) { console.error("[realisasi] atk:", e); }
  try {
    // §113 temuan inspeksi OB yang selesai dengan biaya (gedung & utilitas -> perbaikan; alat -> penggantian alat)
    const tm = await getDocs(query(collection(db, "temuan_aset"), where("waktu_selesai", ">=", tsAwal), where("waktu_selesai", "<", tsAkhir)));
    tm.docs.forEach((d) => {
      const x = d.data();
      if (x.status !== "Selesai" || !(x.biaya > 0) || x.dari_helpdesk_id) return; // pindahan Helpdesk sudah terhitung di sumber helpdesk
      hasil.push({ id: `tm-${d.id}`, daerah: x.daerah || DAERAH_DEFAULT, sumber: x.jenis === "alat" ? "temuan_alat" : "temuan_gedung", tanggal: tglWITA(x.waktu_selesai.toDate()), uraian: `${x.area}: ${x.item}`, jumlah: x.biaya });
    });
  } catch (e) { console.error("[realisasi] temuan:", e); }
  return hasil;
}

export interface DataTahun { tahun: number; items: ItemRab[]; real: Realisasi[]; rabDaerah: string }

/** RAB + seluruh realisasi 1 tahun (sekali baca, untuk evaluasi lintas tahun). item_id sumber otomatis sudah diisi. */
export async function muatDataTahun(tahun: number): Promise<DataTahun> {
  let items: ItemRab[] = [];
  let peta: PetaOtomatis = {};
  let rabDaerah = DAERAH_DEFAULT;
  try {
    const s = await getDoc(doc(db, "anggaran_rab", String(tahun)));
    const d = s.data();
    items = Array.isArray(d?.items) ? (d!.items as ItemRab[]) : [];
    peta = (d?.peta_otomatis as PetaOtomatis) || {};
    rabDaerah = (d?.daerah as string) || DAERAH_DEFAULT;
  } catch (e) { console.error("[realisasi] rab:", e); }
  let manual: Realisasi[] = [];
  try {
    const s = await getDocs(query(collection(db, "realisasi_biaya"), where("tanggal", ">=", `${tahun}-01-01`), where("tanggal", "<", `${tahun + 1}-01-01`)));
    manual = s.docs.map((d) => ({ id: d.id, sumber: "manual" as const, ...(d.data() as Omit<Realisasi, "id" | "sumber">), daerah: (d.data().daerah as string) || DAERAH_DEFAULT }));
  } catch (e) { console.error("[realisasi] manual:", e); }
  const otomatis = (await muatRealisasiOtomatis(tahun)).map((r) => ({ ...r, item_id: peta[r.sumber as keyof PetaOtomatis] }));
  return { tahun, items, real: [...manual, ...otomatis], rabDaerah };
}

// ===================== §166 Rencana vs realisasi per baris RAB + alasan deviasi =====================
// Status dihitung dari pagu (qty x harga), kuartal rencana (centang Q1-Q4, atau q_revisi bila jadwal digeser)
// dan realisasi per kuartal. Status menyimpang wajib diberi alasan + tindakan; alasan tersimpan di baris RAB
// (alasan_deviasi, tindakan_deviasi, deviasi_untuk, q_revisi). deviasi_untuk = kunci status saat dijelaskan, jadi
// bila muncul penyimpangan baru (mis. jadwal revisi meleset lagi) alasan diminta ulang.

export type StatusDeviasi = "Melebihi pagu" | "Terlambat" | "Di luar jadwal" | "Tanpa pagu" | "Ditunda" | "Dibatalkan" | "Terserap" | "Berjalan" | "Belum jatuh tempo";
export const STATUS_PERLU_ALASAN: StatusDeviasi[] = ["Melebihi pagu", "Terlambat", "Di luar jadwal", "Tanpa pagu"];
export const WARNA_DEVIASI: Record<StatusDeviasi, { bg: string; fg: string }> = {
  "Melebihi pagu": { bg: "var(--red-50)", fg: "var(--red-600)" },
  Terlambat: { bg: "var(--warn-50)", fg: "var(--warn)" },
  "Di luar jadwal": { bg: "var(--info-50)", fg: "var(--info)" },
  "Tanpa pagu": { bg: "var(--red-50)", fg: "var(--red-600)" },
  Ditunda: { bg: "var(--line)", fg: "var(--ink-soft)" },
  Dibatalkan: { bg: "var(--line)", fg: "var(--muted)" },
  Terserap: { bg: "var(--ok-50)", fg: "var(--ok)" },
  Berjalan: { bg: "var(--ok-50)", fg: "var(--ok)" },
  "Belum jatuh tempo": { bg: "var(--bg)", fg: "var(--muted)" },
};
/** Tindakan yang masuk akal per status (pilihan di modal alasan). */
export const TINDAKAN_DEVIASI: Record<string, string[]> = {
  "Melebihi pagu": ["Realisasi salah baris — dipindah", "Kebutuhan bertambah", "Harga naik", "Darurat / mendesak", "Realokasi dari baris lain"],
  Terlambat: ["Geser jadwal", "Ditunda ke tahun depan", "Dibatalkan", "Menunggu approval / CER / PO", "Vendor terlambat"],
  "Di luar jadwal": ["Dipercepat (mendesak)", "Mundur dari jadwal", "Realisasi salah baris — dipindah"],
  "Tanpa pagu": ["Realisasi salah baris — dipindah", "Pengeluaran di luar RAB (darurat)", "Akan dibuatkan baris RAB"],
};

export interface DeviasiRab { alasan_deviasi?: string; tindakan_deviasi?: string; deviasi_untuk?: string; q_revisi?: boolean[]; deviasi_oleh?: string; deviasi_tgl?: string }
export interface HasilDeviasi { status: StatusDeviasi; kunci: string; perluAlasan: boolean; dijelaskan: boolean; qAktif: boolean[]; selisih: number }

/**
 * @param realQ realisasi baris ini per kuartal (4 angka)
 * @param kuartalLewat jumlah kuartal yang SUDAH berakhir pada tahun anggaran (tahun lalu = 4, tahun depan = 0)
 */
export function analisaDeviasi(i: ItemRab & DeviasiRab, realQ: number[], kuartalLewat: number): HasilDeviasi {
  const pagu = (i.qty || 0) * (i.harga || 0);
  const real = realQ.reduce((a, b) => a + b, 0);
  const qAsli = i.q || [false, false, false, false];
  const qAktif = i.q_revisi?.some(Boolean) ? i.q_revisi : qAsli;
  const adaJadwal = qAktif.some(Boolean);
  let status: StatusDeviasi;
  if (real === 0 && i.tindakan_deviasi === "Ditunda ke tahun depan") status = "Ditunda";
  else if (real === 0 && i.tindakan_deviasi === "Dibatalkan") status = "Dibatalkan";
  else if (pagu === 0 && real > 0) status = "Tanpa pagu";
  else if (real > pagu + 1) status = "Melebihi pagu";
  else if (real === 0) {
    const pertama = qAktif.findIndex(Boolean);
    status = (adaJadwal ? pertama < kuartalLewat : kuartalLewat >= 4) ? "Terlambat" : "Belum jatuh tempo";
  } else if (adaJadwal && realQ.some((v, k) => v > 0 && !qAktif[k])) status = "Di luar jadwal";
  else status = real >= pagu * 0.95 ? "Terserap" : "Berjalan";
  const kunci = status === "Terlambat" ? `${status}:${qAktif.map((b) => (b ? 1 : 0)).join("")}` : status;
  const perluAlasan = STATUS_PERLU_ALASAN.includes(status);
  return { status, kunci, perluAlasan, dijelaskan: perluAlasan && !!i.alasan_deviasi && i.deviasi_untuk === kunci, qAktif, selisih: real - pagu };
}
