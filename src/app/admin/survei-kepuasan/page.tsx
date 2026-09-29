"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import AdminShell from "../../../components/admin/AdminShell";


interface RatingGridData { [key: string]: number }

interface SurveiDoc {
  id: string;
  periode: string;
  waktu_submit: Timestamp | null;
  nama: string;
  perusahaan_divisi: string;
  lantai: string;
  kebersihan: RatingGridData;
  kualitas_cleaning_service: number;
  saran_kebersihan: string;
  keamanan: RatingGridData;
  kualitas_security: number;
  saran_keamanan: string;
  k3: RatingGridData;
  saran_k3: string;
  pelayanan_teknis: RatingGridData;
  saran_pelayanan_teknis: string;
  fasilitas_umum: RatingGridData;
  saran_fasilitas_umum: string;
  sarana_tambahan_harapan: string;
  pengelola_gedung: RatingGridData;
  saran_pengelola: string;
  security_favorit: string;
  pelayanan_favorit: string;
  teman_jalan_favorit: string;
}

function rataRata(docs: SurveiDoc[], grid: keyof SurveiDoc): number {
  const semuaNilai: number[] = [];
  docs.forEach((d) => {
    const g = d[grid] as unknown as RatingGridData;
    if (g) Object.values(g).forEach((v) => { if (v > 0) semuaNilai.push(v); });
  });
  if (semuaNilai.length === 0) return 0;
  return semuaNilai.reduce((a, b) => a + b, 0) / semuaNilai.length;
}

function rataRataTunggal(docs: SurveiDoc[], field: keyof SurveiDoc): number {
  const nilai = docs.map((d) => d[field] as unknown as number).filter((v) => v > 0);
  if (nilai.length === 0) return 0;
  return nilai.reduce((a, b) => a + b, 0) / nilai.length;
}

function tallySuara(docs: SurveiDoc[], field: keyof SurveiDoc): { nama: string; suara: number }[] {
  const hitung: Record<string, number> = {};
  docs.forEach((d) => {
    const v = d[field] as unknown as string;
    if (v) hitung[v] = (hitung[v] || 0) + 1;
  });
  return Object.entries(hitung).map(([nama, suara]) => ({ nama, suara })).sort((a, b) => b.suara - a.suara);
}

function periodeSekarang(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
  return `${now.getFullYear()}-${now.getMonth() < 6 ? "H1" : "H2"}`;
}

function daftarPeriodeTersedia(): string[] {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
  const tahunIni = now.getFullYear();
  const hasil: string[] = [];
  for (let y = tahunIni; y >= tahunIni - 2; y--) {
    hasil.push(`${y}-H2`, `${y}-H1`);
  }
  return hasil;
}

function KategoriRingkasan({ label, nilai }: { label: string; nilai: number }) {
  const warna = nilai >= 4 ? "var(--ok)" : nilai >= 3 ? "var(--warn)" : "var(--red-600)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0" }}>
      <div style={{ flex: "0 0 160px", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)" }}>{label}</div>
      <div style={{ flex: 1, height: "8px", background: "var(--line)", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ width: `${(nilai / 5) * 100}%`, height: "100%", background: warna, borderRadius: "4px" }} />
      </div>
      <div style={{ width: "36px", textAlign: "right", fontWeight: 800, fontSize: "13px", color: warna }}>{nilai > 0 ? nilai.toFixed(1) : "-"}</div>
    </div>
  );
}

export default function MonitorSurveiKepuasanPage() {
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({
    roles: ["Admin", "Koordinator"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Administrator.",
  });
  const adminName = session?.nama || "Admin";

  const [filterPeriode, setFilterPeriode] = useState(periodeSekarang());
  const [data, setData] = useState<SurveiDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabAktif, setTabAktif] = useState<"RINGKASAN" | "SARAN" | "RESPONDEN">("RINGKASAN");

  // Kampanye Survei -- admin nyalakan/matikan link publik /survei-kepuasan lewat sini, kartu Menu
  // Cepat di portal utama (src/app/page.tsx) baca dokumen yang sama buat nampilkan/nyembunyikan diri.
  const [campaign, setCampaign] = useState<{ aktif: boolean; expired_at: Timestamp | null } | null>(null);
  const [showModalAktifkan, setShowModalAktifkan] = useState(false);
  const [durasiHari, setDurasiHari] = useState(14);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "survei_kepuasan_campaign"), (snap) => {
      setCampaign(snap.exists() ? { aktif: !!snap.data().aktif, expired_at: snap.data().expired_at || null } : { aktif: false, expired_at: null });
    });
    return () => unsub();
  }, []);

  const campaignAktif = !!campaign?.aktif && !!campaign.expired_at && campaign.expired_at.toMillis() > new Date().getTime();

  const handleAktifkanCampaign = async () => {
    const expiredAt = new Date(Date.now() + durasiHari * 24 * 60 * 60 * 1000);
    await setDoc(doc(db, "settings", "survei_kepuasan_campaign"), {
      aktif: true,
      expired_at: Timestamp.fromDate(expiredAt),
      dibuat_pada: serverTimestamp(),
      dibuat_oleh: adminName,
    });
    setShowModalAktifkan(false);
    showToast(`Link survei diaktifkan sampai ${expiredAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.`, "success");
  };

  const handleNonaktifkanCampaign = async () => {
    await setDoc(doc(db, "settings", "survei_kepuasan_campaign"), { aktif: false }, { merge: true });
    showToast("Link survei dinonaktifkan. Kartu di portal utama akan hilang.", "info");
  };

  useEffect(() => {
    const t = setTimeout(() => setLoading(true), 0);
    const unsub = onSnapshot(
      query(collection(db, "survei_kepuasan_gedung"), where("periode", "==", filterPeriode)),
      (snapshot) => {
        setData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SurveiDoc)));
        setLoading(false);
      }
    );
    return () => { clearTimeout(t); unsub(); };
  }, [filterPeriode]);

  const ringkasanKategori = useMemo(() => ([
    { label: "Kebersihan", nilai: rataRata(data, "kebersihan") },
    { label: "Kualitas Cleaning Service", nilai: rataRataTunggal(data, "kualitas_cleaning_service") },
    { label: "Keamanan", nilai: rataRata(data, "keamanan") },
    { label: "Kualitas Security", nilai: rataRataTunggal(data, "kualitas_security") },
    { label: "K3", nilai: rataRata(data, "k3") },
    { label: "Pelayanan Teknis", nilai: rataRata(data, "pelayanan_teknis") },
    { label: "Fasilitas Umum", nilai: rataRata(data, "fasilitas_umum") },
    { label: "Pengelola Gedung", nilai: rataRata(data, "pengelola_gedung") },
  ]), [data]);

  const tallySecurity = useMemo(() => tallySuara(data, "security_favorit"), [data]);
  const tallyPelayanan = useMemo(() => tallySuara(data, "pelayanan_favorit"), [data]);
  const tallyTemanJalan = useMemo(() => tallySuara(data, "teman_jalan_favorit"), [data]);

  const handleExportExcel = () => {
    if (data.length === 0) {
      showToast("Tidak ada data pada periode ini untuk diexport.", "warning");
      return;
    }
    const headers = [
      "Nama", "Perusahaan/Divisi", "Lantai",
      ...Object.keys(data[0].kebersihan || {}).map((k) => `Kebersihan_${k}`),
      "Kualitas_Cleaning_Service", "Saran_Kebersihan",
      ...Object.keys(data[0].keamanan || {}).map((k) => `Keamanan_${k}`),
      "Kualitas_Security", "Saran_Keamanan",
      ...Object.keys(data[0].k3 || {}).map((k) => `K3_${k}`),
      "Saran_K3",
      ...Object.keys(data[0].pelayanan_teknis || {}).map((k) => `PelayananTeknis_${k}`),
      "Saran_Pelayanan_Teknis",
      ...Object.keys(data[0].fasilitas_umum || {}).map((k) => `FasilitasUmum_${k}`),
      "Saran_Fasilitas_Umum", "Sarana_Tambahan_Harapan",
      ...Object.keys(data[0].pengelola_gedung || {}).map((k) => `PengelolaGedung_${k}`),
      "Saran_Pengelola", "Security_Favorit", "Pelayanan_Favorit", "Teman_Jalan_Favorit",
    ];
    const rows = data.map((d) => [
      d.nama, d.perusahaan_divisi, d.lantai,
      ...Object.values(d.kebersihan || {}),
      d.kualitas_cleaning_service, d.saran_kebersihan,
      ...Object.values(d.keamanan || {}),
      d.kualitas_security, d.saran_keamanan,
      ...Object.values(d.k3 || {}),
      d.saran_k3,
      ...Object.values(d.pelayanan_teknis || {}),
      d.saran_pelayanan_teknis,
      ...Object.values(d.fasilitas_umum || {}),
      d.saran_fasilitas_umum, d.sarana_tambahan_harapan,
      ...Object.values(d.pengelola_gedung || {}),
      d.saran_pengelola, d.security_favorit, d.pelayanan_favorit, d.teman_jalan_favorit,
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Survei Kepuasan");
    XLSX.writeFile(workbook, `Survei_Kepuasan_${filterPeriode}.xlsx`);
  };

  if (!isReady) return null;

  return (
    <AdminShell title="Survei Kepuasan Gedung" subtitle="Kuesioner pelayanan gedung — periodik 2x setahun (H1/H2)" userName={adminName}>
      <style dangerouslySetInnerHTML={{ __html: `
      `}} />
      <div>
        {/* 🔗 KONTROL LINK SURVEI -- aktif/nonaktifkan kartu "Survei Kepuasan Gedung" di Menu Cepat
            portal utama. Link publik /survei-kepuasan tetap ADA terus (bukan dihapus/dibuat ulang),
            cuma ditampilkan/disembunyikan dari discovery + submit diblokir kalau tidak aktif. */}
        <div style={{ background: campaignAktif ? "var(--ok-50, #f0fdf4)" : "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: `1px solid ${campaignAktif ? "rgba(22,163,74,0.3)" : "var(--line)"}`, padding: "16px 20px", marginBottom: "16px", display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 220px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: campaignAktif ? "var(--ok)" : "var(--muted)" }}>
              {campaignAktif ? "🟢 Link Survei AKTIF" : "🔴 Link Survei Tidak Aktif"}
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>
              {campaignAktif && campaign?.expired_at
                ? `Kartu tampil di Menu Cepat sampai ${campaign.expired_at.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
                : "Kartu Survei Kepuasan tidak tampil di portal utama & form tidak bisa disubmit."}
            </div>
          </div>
          {campaignAktif ? (
            <button onClick={handleNonaktifkanCampaign} style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid rgba(220,38,38,0.3)", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, background: "var(--surface)", color: "var(--red-600)" }}>
              Nonaktifkan Sekarang
            </button>
          ) : (
            <button onClick={() => setShowModalAktifkan(true)} style={{ padding: "9px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, background: "var(--accent-solid)", color: "#fff" }}>
              Aktifkan Link Survei
            </button>
          )}
        </div>

        {showModalAktifkan && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "20px" }} onClick={() => setShowModalAktifkan(false)}>
            <div style={{ background: "var(--surface)", borderRadius: "18px", padding: "24px", maxWidth: "360px", width: "100%" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "var(--ink)" }}>Aktifkan Link Survei</h3>
              <p style={{ margin: "0 0 16px 0", fontSize: "12.5px", color: "var(--muted)" }}>Kartu Survei Kepuasan akan tampil di Menu Cepat portal utama selama durasi ini.</p>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--ink-soft)", marginBottom: "6px" }}>Aktif selama</label>
              <select value={durasiHari} onChange={(e) => setDurasiHari(Number(e.target.value))} style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", marginBottom: "18px", boxSizing: "border-box" }}>
                <option value={3}>3 Hari</option>
                <option value={7}>1 Minggu</option>
                <option value={14}>2 Minggu</option>
                <option value={30}>1 Bulan</option>
                <option value={60}>2 Bulan</option>
              </select>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => setShowModalAktifkan(false)} style={{ flex: 1, padding: "11px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-soft)", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>Batal</button>
                <button onClick={handleAktifkanCampaign} style={{ flex: 1, padding: "11px", borderRadius: "10px", border: "none", background: "var(--accent-solid)", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>Aktifkan</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", padding: "18px 20px", marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "5px" }}>Periode</label>
            <select value={filterPeriode} onChange={(e) => setFilterPeriode(e.target.value)} style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--bg)", outline: "none" }}>
              {daftarPeriodeTersedia().map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button onClick={handleExportExcel} style={{ padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "bold", background: "var(--ok-solid)", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
            📊 Export ke Excel
          </button>
          <div style={{ marginLeft: "auto", fontSize: "12.5px", color: "var(--muted)", alignSelf: "center" }}>{data.length} responden</div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {(["RINGKASAN", "SARAN", "RESPONDEN"] as const).map((tab) => (
            <button
              key={tab} onClick={() => setTabAktif(tab)}
              style={{ padding: "9px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, background: tabAktif === tab ? "var(--accent)" : "var(--surface)", color: tabAktif === tab ? "#fff" : "var(--ink-soft)", boxShadow: tabAktif === tab ? "none" : "0 1px 3px rgba(0,0,0,0.08)" }}
            >
              {tab === "RINGKASAN" ? "Ringkasan Skor" : tab === "SARAN" ? "Masukan & Saran" : "Daftar Responden"}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)", background: "var(--surface)", borderRadius: "20px", border: "1px dashed var(--line)" }}>Belum ada data survei untuk periode {filterPeriode}.</div>
        ) : tabAktif === "RINGKASAN" ? (
          <div style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", padding: "20px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", marginBottom: "6px" }}>Rata-rata Skor per Kategori (skala 1-5)</div>
            {ringkasanKategori.map((k) => <KategoriRingkasan key={k.label} label={k.label} nilai={k.nilai} />)}

            <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", margin: "22px 0 10px 0" }}>🌟 Favorit Periode Ini</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              {[
                { judul: "Pengamanan Favorit", tally: tallySecurity },
                { judul: "Pelayanan Favorit", tally: tallyPelayanan },
                { judul: "Teman Jalan Favorit", tally: tallyTemanJalan },
              ].map(({ judul, tally }) => (
                <div key={judul} style={{ background: "var(--bg)", borderRadius: "12px", padding: "12px 14px", border: "1px solid var(--line)" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "8px" }}>{judul}</div>
                  {tally.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>Belum ada suara.</div>
                  ) : tally.map((t, i) => (
                    <div key={t.nama} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", padding: "3px 0", fontWeight: i === 0 ? 800 : 500, color: i === 0 ? "var(--accent)" : "var(--ink-soft)" }}>
                      <span>{i === 0 && "🏆 "}{t.nama}</span>
                      <span>{t.suara} suara</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : tabAktif === "SARAN" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {([
              ["saran_kebersihan", "Kebersihan"], ["saran_keamanan", "Keamanan"], ["saran_k3", "K3"],
              ["saran_pelayanan_teknis", "Pelayanan Teknis"], ["saran_fasilitas_umum", "Fasilitas Umum"],
              ["sarana_tambahan_harapan", "Sarana Tambahan yang Diharapkan"], ["saran_pengelola", "Pengelola Gedung"],
            ] as [keyof SurveiDoc, string][]).map(([field, judul]) => {
              const isiSaran = data.filter((d) => (d[field] as unknown as string)?.trim());
              if (isiSaran.length === 0) return null;
              return (
                <div key={field} style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--line)", padding: "16px 18px" }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 800, color: "var(--ink)", marginBottom: "10px" }}>{judul} ({isiSaran.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {isiSaran.map((d) => (
                      <div key={d.id} style={{ fontSize: "12.5px", color: "var(--ink-soft)", background: "var(--bg)", padding: "8px 12px", borderRadius: "8px" }}>
                        &quot;{d[field] as unknown as string}&quot; <span style={{ color: "var(--muted)" }}>— {d.nama} ({d.perusahaan_divisi})</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", overflow: "hidden" }}>
            {data.map((d) => (
              <div key={d.id} style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: "10px" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--ink)" }}>{d.nama}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{d.perusahaan_divisi} &middot; {d.lantai}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
