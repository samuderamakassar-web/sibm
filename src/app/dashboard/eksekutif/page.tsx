"use client";

/**
 * Dashboard Eksekutif Tenant (§108) -- read-only. Keputusan user: "Gedung + PT sendiri".
 *   GEDUNG  : kerusakan & perbaikan (terbuka, selesai bulan ini, rata-rata durasi), okupansi, Project Tracker lokasi gedung.
 *   PT SAYA : kehadiran karyawan PT hari ini (Buku Tamu + validasi tidak masuk), lembur bulan ini, tiket & ATK dari PT itu.
 * PT diambil dari users_master.unit_bisnis (disimpan ke localStorage "pic_unit" saat login). Admin GA boleh membuka
 * halaman ini untuk pratinjau dengan memilih PT. Batas data di sisi server: firestore.rules isEksekutif() --
 * hanya baca koleksi publik + okupansi_gedung & project_tracker, tanpa hak tulis.
 */

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import AdminShell from "../../../components/admin/AdminShell";
import Tile from "../../../components/admin/Tile";
import { DAFTAR_UNIT_BISNIS } from "../../../lib/unitBisnis";
import { KONFIG_BAWAAN, WARNA_STATUS, progressKuartal, progressTask, type KonfigTracker, type TargetPT, type TaskPT, type StatusTarget } from "../../../lib/projectTracker";

interface Tiket { id: string; lokasi: string; deskripsi: string; status: string; departemen?: string; waktu_lapor?: Timestamp | null; waktu_selesai?: Timestamp | null }
interface Karyawan { nama: string; departemen?: string }
interface Lembur { id: string; nama_pemohon: string; departemen?: string; tanggal: string; jam_mulai?: string; jam_selesai?: string; durasi_tagih_jam?: number; status?: string }
interface Unit { nama: string; tenant: string; luas: number; status: "terisi" | "kosong" | "bersama" }
interface Lantai { nama: string; luas_total: number; unit: Unit[] }

const tz = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" });
const norm = (s?: string) => (s || "").trim().toLowerCase();
const fmt = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
const jamLembur = (l: Lembur) => {
  if (typeof l.durasi_tagih_jam === "number") return l.durasi_tagih_jam;
  if (!l.jam_mulai || !l.jam_selesai) return 0;
  const [a, b] = l.jam_mulai.split(":").map(Number); const [c, d] = l.jam_selesai.split(":").map(Number);
  const m = (c * 60 + d) - (a * 60 + b);
  return m > 0 ? Math.ceil(m / 60) : 0;
};

function Angka({ label, nilai, sub, warna }: { label: string; nilai: string; sub?: string; warna?: string }) {
  return (
    <div style={{ background: "var(--bg)", borderRadius: "16px", padding: "12px 14px" }}>
      <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 800, color: warna || "var(--ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{nilai}</div>
      {sub && <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

export default function DashboardEksekutifPage() {
  const { session, isReady } = useAuthGuard({ depts: ["Eksekutif Tenant"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus Eksekutif Tenant." });
  const [ptPilihan, setPtPilihan] = useState("");
  const [ptAkun] = useState(() => { try { return localStorage.getItem("pic_unit") || ""; } catch { return ""; } });
  const pt = ptAkun || ptPilihan;
  const hariIni = tz.format(new Date());
  const awalBulan = `${hariIni.slice(0, 7)}-01`;

  const [tiketTerbuka, setTiketTerbuka] = useState<Tiket[]>([]);
  const [tiketSelesai, setTiketSelesai] = useState<Tiket[]>([]);
  const [tiketBulan, setTiketBulan] = useState<Tiket[]>([]);
  const [karyawan, setKaryawan] = useState<Karyawan[]>([]);
  const [hadir, setHadir] = useState<Set<string>>(new Set());
  const [tidakMasuk, setTidakMasuk] = useState<{ nama: string; alasan?: string }[]>([]);
  const [lembur, setLembur] = useState<Lembur[]>([]);
  const [atkBulan, setAtkBulan] = useState<{ departemen?: string; status: string }[]>([]);
  const [lantai, setLantai] = useState<Lantai[]>([]);
  const [konfig, setKonfig] = useState<KonfigTracker>(KONFIG_BAWAAN);
  const [targets, setTargets] = useState<TargetPT[]>([]);
  const [tasks, setTasks] = useState<TaskPT[]>([]);

  useEffect(() => {
    if (!isReady) return;
    const tsBulan = Timestamp.fromDate(new Date(`${awalBulan}T00:00:00+08:00`));
    const tsHari = Timestamp.fromDate(new Date(`${hariIni}T00:00:00+08:00`));
    const map = (s: { docs: { id: string; data: () => unknown }[] }) => s.docs.map((d) => ({ id: d.id, ...(d.data() as object) }));
    const u = [
      onSnapshot(query(collection(db, "helpdesk_tickets"), where("status", "in", ["Menunggu", "Sedang Dikerjakan"])), (s) => setTiketTerbuka(map(s) as Tiket[])),
      onSnapshot(query(collection(db, "helpdesk_tickets"), where("waktu_selesai", ">=", tsBulan)), (s) => setTiketSelesai((map(s) as Tiket[]).filter((t) => t.status === "Selesai"))),
      onSnapshot(query(collection(db, "helpdesk_tickets"), where("waktu_lapor", ">=", tsBulan)), (s) => setTiketBulan((map(s) as Tiket[]).filter((t) => t.status !== "Dihapus"))),
      onSnapshot(collection(db, "employees_directory"), (s) => setKaryawan(s.docs.map((d) => d.data() as Karyawan))),
      onSnapshot(query(collection(db, "security_visitor_logs"), where("waktu_masuk", ">=", tsHari)), (s) => setHadir(new Set(s.docs.map((d) => d.data()).filter((x) => x.jenis === "Karyawan").map((x) => norm(x.nama))))),
      onSnapshot(query(collection(db, "validasi_karyawan"), where("tanggal", "==", hariIni)), (s) => setTidakMasuk(s.docs.map((d) => d.data()).filter((x) => x.jenis === "belum_input" && x.status === "tidak_masuk").map((x) => ({ nama: x.nama, alasan: x.alasan })))),
      onSnapshot(query(collection(db, "ga_overtime_requests"), where("tanggal", ">=", awalBulan)), (s) => setLembur(map(s) as Lembur[])),
      onSnapshot(query(collection(db, "ga_atk_requests"), where("waktu_request", ">=", tsBulan)), (s) => setAtkBulan(s.docs.map((d) => d.data() as { departemen?: string; status: string }))),
      onSnapshot(doc(db, "okupansi_gedung", "data"), (s) => setLantai(((s.data()?.lantai as Lantai[]) || []))),
      onSnapshot(collection(db, "project_tracker"), (s) => {
        const t: TargetPT[] = []; const k: TaskPT[] = [];
        s.docs.forEach((d) => {
          const x = { id: d.id, ...d.data() } as Record<string, unknown> & { id: string; tipe?: string };
          if (d.id === "config") setKonfig({ ...KONFIG_BAWAAN, ...(d.data() as Partial<KonfigTracker>) });
          else if (x.tipe === "target") t.push(x as unknown as TargetPT);
          else if (x.tipe === "task") k.push(x as unknown as TaskPT);
        });
        setTargets(t); setTasks(k);
      }, (e) => console.error("[eksekutif] tracker:", e)),
    ];
    return () => u.forEach((f) => f());
  }, [isReady, awalBulan, hariIni]);

  if (!isReady) return null;

  // ---------- GEDUNG ----------
  const durasiRata = tiketSelesai.length
    ? tiketSelesai.reduce((a, t) => a + Math.max(0, ((t.waktu_selesai?.toMillis() || 0) - (t.waktu_lapor?.toMillis() || 0)) / 86400000), 0) / tiketSelesai.length : 0;
  const semuaUnit = lantai.flatMap((l) => l.unit.map((u) => ({ ...u, lantai: l.nama })));
  const luasTotal = lantai.reduce((a, l) => a + Math.max(l.luas_total || 0, l.unit.reduce((b, u) => b + (u.luas || 0), 0)), 0);
  const luasBersama = semuaUnit.filter((u) => u.status === "bersama").reduce((a, u) => a + (u.luas || 0), 0);
  const luasTerisi = semuaUnit.filter((u) => u.status === "terisi").reduce((a, u) => a + (u.luas || 0), 0);
  const okupansi = luasTotal - luasBersama > 0 ? (luasTerisi / (luasTotal - luasBersama)) * 100 : 0;
  const unitPt = semuaUnit.filter((u) => u.status === "terisi" && norm(u.tenant) === norm(pt));
  const lokasiGedung = konfig.lokasi_gedung || "";
  const targetGedung = targets.filter((t) => t.lokasi === lokasiGedung && t.status !== "Cancelled").sort((a, b) => a.kode.localeCompare(b.kode));
  const hitungStatus = (s: StatusTarget) => targetGedung.filter((t) => t.status === s).length;

  // ---------- PT ----------
  const karyawanPt = karyawan.filter((k) => norm(k.departemen) === norm(pt));
  const namaPt = new Set(karyawanPt.map((k) => norm(k.nama)));
  const hadirPt = karyawanPt.filter((k) => hadir.has(norm(k.nama)));
  const tidakMasukPt = tidakMasuk.filter((x) => namaPt.has(norm(x.nama)));
  const belumTercatat = karyawanPt.length - hadirPt.length - tidakMasukPt.length;
  const lemburPt = lembur.filter((l) => norm(l.departemen) === norm(pt) || namaPt.has(norm(l.nama_pemohon)));
  const jamLemburPt = lemburPt.reduce((a, l) => a + jamLembur(l), 0);
  const perOrang = Object.entries(lemburPt.reduce<Record<string, { kali: number; jam: number }>>((acc, l) => {
    acc[l.nama_pemohon] ??= { kali: 0, jam: 0 }; acc[l.nama_pemohon].kali++; acc[l.nama_pemohon].jam += jamLembur(l); return acc;
  }, {})).sort((a, b) => b[1].jam - a[1].jam);
  const tiketPt = tiketBulan.filter((t) => norm(t.departemen) === norm(pt));
  const atkPt = atkBulan.filter((a) => norm(a.departemen) === norm(pt) && a.status !== "Dibatalkan");
  const namaBulan = new Date(`${hariIni}T12:00:00+08:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  return (
    <AdminShell title="Dashboard Eksekutif" subtitle={pt ? `${pt} · laporan gedung & produktivitas` : "Laporan gedung & produktivitas tenant"} userName={session?.nama || "Eksekutif"}>
      {!ptAkun && (
        <Tile style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            Pratinjau sebagai PT:
            <select className="sa-field" value={ptPilihan} onChange={(e) => setPtPilihan(e.target.value)}>
              <option value="">— pilih PT —</option>
              {DAFTAR_UNIT_BISNIS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span style={{ fontWeight: 500, color: "var(--muted)" }}>Akun Eksekutif Tenant otomatis memakai PT dari Manajemen Pengguna.</span>
          </label>
        </Tile>
      )}

      {/* ================= GEDUNG ================= */}
      <h2 style={{ margin: "4px 0 10px", fontSize: "13px", fontWeight: 800, letterSpacing: ".06em", color: "var(--muted)", textTransform: "uppercase" }}>Gedung</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "14px", marginBottom: "22px", alignItems: "start" }}>
        <Tile>
          <h3 style={{ margin: "0 0 10px", fontSize: "15px", fontWeight: 800 }}>Kerusakan & perbaikan</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            <Angka label="Sedang ditangani" nilai={String(tiketTerbuka.length)} sub={`${tiketTerbuka.filter((t) => t.status === "Sedang Dikerjakan").length} dikerjakan`} warna={tiketTerbuka.length ? "var(--warn)" : "var(--ok)"} />
            <Angka label="Selesai bulan ini" nilai={String(tiketSelesai.length)} sub={namaBulan} warna="var(--ok)" />
            <Angka label="Rata-rata selesai" nilai={tiketSelesai.length ? `${fmt(durasiRata)} hr` : "—"} sub="sejak dilaporkan" />
          </div>
          {tiketTerbuka.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
              {tiketTerbuka.slice(0, 6).map((t) => (
                <div key={t.id} style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "12.5px" }}>
                  <span style={{ fontWeight: 800, color: t.status === "Sedang Dikerjakan" ? "var(--info)" : "var(--warn)", whiteSpace: "nowrap" }}>{t.status === "Sedang Dikerjakan" ? "Dikerjakan" : "Menunggu"}</span>
                  <span style={{ color: "var(--ink)" }}><b>{t.lokasi}</b> · <span style={{ color: "var(--ink-soft)" }}>{t.deskripsi}</span></span>
                </div>
              ))}
            </div>
          )}
        </Tile>

        <Tile>
          <h3 style={{ margin: "0 0 10px", fontSize: "15px", fontWeight: 800 }}>Okupansi gedung</h3>
          {luasTotal > 0 ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                <Angka label="Okupansi" nilai={`${Math.round(okupansi)}%`} warna="var(--ok)" />
                <Angka label="Luas terisi" nilai={`${fmt(luasTerisi)} m²`} />
                <Angka label={pt ? "Luas sewa PT" : "Luas total"} nilai={`${fmt(pt ? unitPt.reduce((a, u) => a + (u.luas || 0), 0) : luasTotal)} m²`} sub={pt ? (unitPt.map((u) => `${u.lantai}${u.nama ? ` (${u.nama})` : ""}`).join(", ") || "belum dipetakan") : undefined} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
                {lantai.map((l) => {
                  const terisi = l.unit.filter((u) => u.status === "terisi").reduce((a, u) => a + (u.luas || 0), 0);
                  const tot = Math.max(l.luas_total || 0, l.unit.reduce((b, u) => b + (u.luas || 0), 0));
                  return (
                    <div key={l.nama} style={{ display: "grid", gridTemplateColumns: "80px 1fr 44px", gap: "8px", alignItems: "center", fontSize: "12px" }}>
                      <span style={{ fontWeight: 700 }}>{l.nama}</span>
                      <div style={{ height: "8px", borderRadius: "4px", background: "var(--line)", overflow: "hidden" }}><div style={{ width: `${tot ? (terisi / tot) * 100 : 0}%`, height: "100%", background: "var(--ok-solid)" }} /></div>
                      <span style={{ textAlign: "right", fontWeight: 700 }}>{tot ? Math.round((terisi / tot) * 100) : 0}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Data okupansi belum diisi pengelola gedung.</div>}
        </Tile>

        <Tile style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", alignItems: "baseline", marginBottom: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800 }}>Program kerja gedung {lokasiGedung && <span style={{ fontWeight: 600, color: "var(--muted)" }}>· {lokasiGedung}</span>}</h3>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(["Done", "On Track", "In Progress", "At Risk", "Not Started"] as StatusTarget[]).map((s) => hitungStatus(s) > 0 && (
                <span key={s} style={{ fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "999px", background: WARNA_STATUS[s].bg, color: WARNA_STATUS[s].fg }}>{hitungStatus(s)} {s}</span>
              ))}
            </div>
          </div>
          {targetGedung.length === 0 ? <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Belum ada program kerja untuk lokasi ini.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {targetGedung.map((t) => {
                const pk = progressKuartal(t);
                const pTask = progressTask(tasks.filter((k) => k.target_id === t.id));
                const prog = t.status === "Done" ? 100 : Math.max(t.progress_est || 0, pk ?? 0, pTask ?? 0);
                return (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 150px", gap: "10px", alignItems: "center", padding: "8px 10px", borderRadius: "12px", background: "var(--bg)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--ink)" }}>{t.target}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{t.kategori} · target {t.deadline ? new Date(`${t.deadline}T12:00:00+08:00`).toLocaleDateString("id-ID", { month: "short", year: "numeric" }) : "-"}</div>
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "999px", background: WARNA_STATUS[t.status].bg, color: WARNA_STATUS[t.status].fg, justifySelf: "start", whiteSpace: "nowrap" }}>{t.status}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: "var(--line)", overflow: "hidden" }}><div style={{ width: `${prog}%`, height: "100%", background: "var(--info-solid)" }} /></div>
                      <span style={{ fontSize: "11.5px", fontWeight: 800, width: "34px", textAlign: "right" }}>{Math.round(prog)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Tile>
      </div>

      {/* ================= PT ================= */}
      <h2 style={{ margin: "4px 0 10px", fontSize: "13px", fontWeight: 800, letterSpacing: ".06em", color: "var(--muted)", textTransform: "uppercase" }}>{pt || "PT"} · produktivitas</h2>
      {!pt ? <Tile><div style={{ fontSize: "13px", color: "var(--muted)" }}>PT belum ditentukan. Hubungi Admin GA untuk mengisi PT pada akun Anda.</div></Tile> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "14px", alignItems: "start" }}>
          <Tile>
            <h3 style={{ margin: "0 0 10px", fontSize: "15px", fontWeight: 800 }}>Kehadiran hari ini</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
              <Angka label="Hadir" nilai={`${hadirPt.length}`} sub={`dari ${karyawanPt.length} karyawan`} warna="var(--ok)" />
              <Angka label="Tidak masuk" nilai={`${tidakMasukPt.length}`} warna={tidakMasukPt.length ? "var(--red-600)" : "var(--ink)"} />
              <Angka label="Belum tercatat" nilai={`${Math.max(0, belumTercatat)}`} warna="var(--muted)" />
            </div>
            {karyawanPt.length > 0 && (
              <div style={{ height: "10px", borderRadius: "5px", background: "var(--line)", overflow: "hidden", display: "flex", marginTop: "12px" }}>
                <div style={{ width: `${(hadirPt.length / karyawanPt.length) * 100}%`, background: "var(--ok-solid)" }} />
                <div style={{ width: `${(tidakMasukPt.length / karyawanPt.length) * 100}%`, background: "var(--red-600)" }} />
              </div>
            )}
            {tidakMasukPt.length > 0 && <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--ink-soft)" }}>Tidak masuk: {tidakMasukPt.map((x) => `${x.nama}${x.alasan ? ` (${x.alasan})` : ""}`).join(", ")}</div>}
          </Tile>

          <Tile>
            <h3 style={{ margin: "0 0 10px", fontSize: "15px", fontWeight: 800 }}>Lembur · {namaBulan}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
              <Angka label="Total jam" nilai={`${jamLemburPt}`} sub="dibulatkan per jam" warna="var(--info)" />
              <Angka label="Kejadian" nilai={`${lemburPt.length}`} />
              <Angka label="Karyawan" nilai={`${perOrang.length}`} sub="pernah lembur" />
            </div>
            {perOrang.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "10px", fontSize: "12.5px" }}>
                {perOrang.slice(0, 6).map(([n, v]) => <div key={n} style={{ display: "flex", justifyContent: "space-between" }}><span>{n}</span><b style={{ fontVariantNumeric: "tabular-nums" }}>{v.jam} jam · {v.kali}×</b></div>)}
              </div>
            )}
          </Tile>

          <Tile>
            <h3 style={{ margin: "0 0 10px", fontSize: "15px", fontWeight: 800 }}>Laporan & permintaan dari {pt.replace(/^PT\s+/i, "")}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
              <Angka label="Laporan kerusakan" nilai={`${tiketPt.length}`} sub="bulan ini" />
              <Angka label="Sudah selesai" nilai={`${tiketPt.filter((t) => t.status === "Selesai").length}`} warna="var(--ok)" />
              <Angka label="Permintaan ATK" nilai={`${atkPt.length}`} sub={`${atkPt.filter((a) => a.status === "Selesai / Diambil").length} sudah diambil`} />
            </div>
          </Tile>
        </div>
      )}
    </AdminShell>
  );
}
