"use client";

/**
 * src/components/pages/SurveiKepuasanPage.tsx
 * ------------------------------------------------------------------
 * Kuesioner Pelayanan Gedung — replika dari Google Form yang sudah dipakai
 * user (2x setahun, H1 & H2), sekarang jadi form internal SIBM biar hasilnya
 * bisa langsung dipantau admin (bukan lagi di Google Forms terpisah).
 * Halaman PUBLIK, TANPA LOGIN (siapa pun penghuni gedung bisa isi) --
 * konsisten dengan halaman publik lain di app ini (portal utama "/", /qr-apar).
 * ------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { collection, addDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";

type IconProps = { size?: number; color?: string };
const IconCheckCircle = ({ size = 40, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
);

function hitungPeriodeSurvei(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
  const semester = now.getMonth() < 6 ? "H1" : "H2";
  return `${now.getFullYear()}-${semester}`;
}

// ==========================================
// STATE FORM -- struktur mengikuti persis section di form aslinya
// ==========================================
interface RatingGridState { [key: string]: number }

const initKebersihan: RatingGridState = { area_parkir: 0, halaman_gedung: 0, koridor: 0, lobby_utama: 0, musala: 0, pantry_gedung: 0, ruang_meeting: 0, toilet: 0 };
const initKeamanan: RatingGridState = { area_dalam: 0, area_luar: 0 };
const initK3: RatingGridState = { cold_fogging: 0, fire_safety_equipment: 0, safety_induction: 0, training_floor_warden: 0, rambu_rambu: 0, simulasi_tanggap_darurat: 0 };
const initPelayananTeknis: RatingGridState = { air_sanitasi: 0, ac: 0, penerangan_umum: 0, stabilitas_listrik: 0 };
const initFasilitasUmum: RatingGridState = { lobby: 0, toilet: 0, koridor: 0, area_parkir: 0 };

const LABEL_KEBERSIHAN: [string, string][] = [["area_parkir", "Area Parkir"], ["halaman_gedung", "Halaman Gedung"], ["koridor", "Koridor"], ["lobby_utama", "Lobby Utama"], ["musala", "Musala"], ["pantry_gedung", "Pantry Gedung"], ["ruang_meeting", "Ruang Meeting"], ["toilet", "Toilet"]];
const LABEL_KEAMANAN: [string, string][] = [["area_dalam", "Keamanan di area dalam gedung"], ["area_luar", "Keamanan di area luar gedung"]];
const LABEL_K3: [string, string][] = [["cold_fogging", "Cold Fogging"], ["fire_safety_equipment", "Fire & Safety Equipment"], ["safety_induction", "Safety Induction"], ["training_floor_warden", "Training Floor Warden"], ["rambu_rambu", "Rambu-rambu (signage)"], ["simulasi_tanggap_darurat", "Pelaksanaan Simulasi Tanggap Darurat"]];
const LABEL_PELAYANAN_TEKNIS: [string, string][] = [["air_sanitasi", "Air dan Sanitasi"], ["ac", "Pendingin udara (AC)"], ["penerangan_umum", "Penerangan Area Umum"], ["stabilitas_listrik", "Stabilitas Listrik"]];
const LABEL_FASILITAS_UMUM: [string, string][] = [["lobby", "Lobby"], ["toilet", "Toilet"], ["koridor", "Koridor"], ["area_parkir", "Area Parkir"]];

const OPSI_SECURITY_FAVORIT = ["Ibrahim", "Awal", "Agus"];
const OPSI_PELAYANAN_FAVORIT = ["Syahrul", "Hilal", "Enal", "Ahmad"];
const OPSI_TEMAN_JALAN_FAVORIT = ["Amal", "Naldy"];

function RatingGrid({ judul, wajib, rows, value, onChange }: { judul: string; wajib?: boolean; rows: [string, string][]; value: RatingGridState; onChange: (key: string, v: number) => void }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink)", marginBottom: "10px" }}>{judul} {wajib && <span style={{ color: "var(--red-600)" }}>*</span>}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "360px" }}>
          <thead>
            <tr>
              <th></th>
              {[1, 2, 3, 4, 5].map((n) => (
                <th key={n} style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700, padding: "4px" }}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, label]) => (
              <tr key={key}>
                <td style={{ fontSize: "12.5px", color: "var(--ink-soft)", padding: "6px 8px 6px 0", whiteSpace: "nowrap" }}>{label}</td>
                {[1, 2, 3, 4, 5].map((n) => (
                  <td key={n} style={{ textAlign: "center", padding: "4px" }}>
                    <input type="radio" name={`${judul}-${key}`} checked={value[key] === n} onChange={() => onChange(key, n)} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RatingSingle({ pertanyaan, wajib, value, onChange }: { pertanyaan: string; wajib?: boolean; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink)", marginBottom: "10px" }}>{pertanyaan} {wajib && <span style={{ color: "var(--red-600)" }}>*</span>}</div>
      <div style={{ display: "flex", gap: "18px" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--muted)", cursor: "pointer" }}>
            {n}
            <input type="radio" name={pertanyaan} checked={value === n} onChange={() => onChange(n)} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
          </label>
        ))}
      </div>
    </div>
  );
}

function KotakSaran({ pertanyaan, value, onChange }: { pertanyaan: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ fontSize: "13px", color: "var(--ink-soft)", marginBottom: "8px" }}>{pertanyaan}</div>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", minHeight: "60px", padding: "10px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", resize: "vertical", outline: "none", background: "var(--surface)", boxSizing: "border-box" }}
      />
    </div>
  );
}

function PilihanFavorit({ pertanyaan, opsi, value, onChange }: { pertanyaan: string; opsi: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink)", marginBottom: "10px" }}>{pertanyaan}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {opsi.map((o) => (
          <button
            key={o} type="button" onClick={() => onChange(o)}
            style={{
              padding: "9px 16px", borderRadius: "20px", cursor: "pointer", fontSize: "13px", fontWeight: 700,
              border: value === o ? "2px solid var(--accent)" : "1px solid var(--line)",
              background: value === o ? "#f5f3ff" : "var(--surface)",
              color: value === o ? "var(--accent)" : "var(--ink-soft)",
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#e2e8f0", color: "var(--ink)", fontWeight: 800, fontSize: "12.5px", letterSpacing: "0.5px", textTransform: "uppercase", padding: "10px 16px", borderRadius: "10px", margin: "26px 0 16px 0" }}>
      {children}
    </div>
  );
}

export default function SurveiKepuasanPage() {
  // Cek status kampanye -- admin nyalakan/matikan dari admin/survei-kepuasan. Form INI juga
  // ikut nolak submit kalau nonaktif, gak cuma nyembunyiin kartu di Menu Cepat portal utama
  // (jaga-jaga kalau link disimpan/dibagikan langsung di luar jendela aktif).
  const [campaignStatus, setCampaignStatus] = useState<"memuat" | "aktif" | "nonaktif">("memuat");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "survei_kepuasan_campaign"), (snap) => {
      const aktif = snap.exists() && !!snap.data().aktif && snap.data().expired_at && snap.data().expired_at.toMillis() > Date.now();
      setCampaignStatus(aktif ? "aktif" : "nonaktif");
    });
    return () => unsub();
  }, []);

  const [nama, setNama] = useState("");
  const [perusahaanDivisi, setPerusahaanDivisi] = useState("");
  const [lantai, setLantai] = useState("");

  const [kebersihan, setKebersihan] = useState<RatingGridState>(initKebersihan);
  const [kualitasCleaningService, setKualitasCleaningService] = useState(0);
  const [saranKebersihan, setSaranKebersihan] = useState("");

  const [keamanan, setKeamanan] = useState<RatingGridState>(initKeamanan);
  const [kualitasSecurity, setKualitasSecurity] = useState(0);
  const [saranKeamanan, setSaranKeamanan] = useState("");

  const [k3, setK3] = useState<RatingGridState>(initK3);
  const [saranK3, setSaranK3] = useState("");

  const [pelayananTeknis, setPelayananTeknis] = useState<RatingGridState>(initPelayananTeknis);
  const [saranPelayananTeknis, setSaranPelayananTeknis] = useState("");

  const [fasilitasUmum, setFasilitasUmum] = useState<RatingGridState>(initFasilitasUmum);
  const [saranFasilitasUmum, setSaranFasilitasUmum] = useState("");
  const [saranaTambahanHarapan, setSaranaTambahanHarapan] = useState("");

  const [kemudahanProsedur, setKemudahanProsedur] = useState(0);
  const [kecepatanRespon, setKecepatanRespon] = useState(0);
  const [kepuasanPenanganan, setKepuasanPenanganan] = useState(0);
  const [saranPengelola, setSaranPengelola] = useState("");

  const [securityFavorit, setSecurityFavorit] = useState("");
  const [pelayananFavorit, setPelayananFavorit] = useState("");
  const [temanJalanFavorit, setTemanJalanFavorit] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const ubahGrid = (setter: React.Dispatch<React.SetStateAction<RatingGridState>>) => (key: string, v: number) => {
    setter((prev) => ({ ...prev, [key]: v }));
  };

  const semuaTerisi = (obj: RatingGridState) => Object.values(obj).every((v) => v > 0);

  const handleSubmit = async () => {
    setErrorMsg("");
    if (!nama.trim() || !perusahaanDivisi.trim() || !lantai) {
      setErrorMsg("Mohon lengkapi Nama, Perusahaan/Divisi, dan Lantai Lokasi Kantor.");
      return;
    }
    if (!semuaTerisi(kebersihan) || !kualitasCleaningService) {
      setErrorMsg("Mohon lengkapi seluruh penilaian di bagian Kebersihan.");
      return;
    }
    if (!semuaTerisi(keamanan) || !kualitasSecurity) {
      setErrorMsg("Mohon lengkapi seluruh penilaian di bagian Keamanan.");
      return;
    }
    if (!semuaTerisi(k3)) {
      setErrorMsg("Mohon lengkapi seluruh penilaian di bagian Keselamatan & Kesehatan Lingkungan Kerja.");
      return;
    }
    if (!semuaTerisi(pelayananTeknis)) {
      setErrorMsg("Mohon lengkapi seluruh penilaian di bagian Pelayanan Teknis.");
      return;
    }
    if (!semuaTerisi(fasilitasUmum)) {
      setErrorMsg("Mohon lengkapi seluruh penilaian di bagian Fasilitas Umum.");
      return;
    }
    if (!kemudahanProsedur || !kecepatanRespon || !kepuasanPenanganan) {
      setErrorMsg("Mohon lengkapi seluruh penilaian di bagian Pengelola Gedung.");
      return;
    }

    setIsLoading(true);
    try {
      await addDoc(collection(db, "survei_kepuasan_gedung"), {
        periode: hitungPeriodeSurvei(),
        waktu_submit: serverTimestamp(),
        nama: nama.trim(),
        perusahaan_divisi: perusahaanDivisi.trim(),
        lantai,
        kebersihan,
        kualitas_cleaning_service: kualitasCleaningService,
        saran_kebersihan: saranKebersihan.trim(),
        keamanan,
        kualitas_security: kualitasSecurity,
        saran_keamanan: saranKeamanan.trim(),
        k3,
        saran_k3: saranK3.trim(),
        pelayanan_teknis: pelayananTeknis,
        saran_pelayanan_teknis: saranPelayananTeknis.trim(),
        fasilitas_umum: fasilitasUmum,
        saran_fasilitas_umum: saranFasilitasUmum.trim(),
        sarana_tambahan_harapan: saranaTambahanHarapan.trim(),
        pengelola_gedung: { kemudahan_prosedur: kemudahanProsedur, kecepatan_respon: kecepatanRespon, kepuasan_penanganan: kepuasanPenanganan },
        saran_pengelola: saranPengelola.trim(),
        security_favorit: securityFavorit,
        pelayanan_favorit: pelayananFavorit,
        teman_jalan_favorit: temanJalanFavorit,
      });
      setIsSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      setErrorMsg("Terjadi kesalahan sistem, mohon coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  if (campaignStatus === "memuat") return null;

  if (campaignStatus === "nonaktif") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg, #f7f6f5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ background: "#fff", borderRadius: "20px", padding: "40px 30px", textAlign: "center", maxWidth: "420px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>📋</div>
          <h2 style={{ margin: "0 0 10px 0", color: "#18181b" }}>Survei Sedang Tidak Aktif</h2>
          <p style={{ color: "#71717a", fontSize: "14px", lineHeight: 1.6 }}>
            Kuesioner ini cuma dibuka pada periode tertentu. Silakan cek kembali nanti atau hubungi Admin GA kalau menurut Bapak/Ibu ini seharusnya sedang aktif.
          </p>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg, #f7f6f5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ background: "#fff", borderRadius: "20px", padding: "40px 30px", textAlign: "center", maxWidth: "420px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}>
          <div style={{ color: "var(--ok, #16a34a)", marginBottom: "16px" }}><IconCheckCircle /></div>
          <h2 style={{ margin: "0 0 10px 0", color: "#18181b" }}>Terima Kasih!</h2>
          <p style={{ color: "#71717a", fontSize: "14px", lineHeight: 1.6 }}>
            Terima kasih atas partisipasi Bapak/Ibu, semoga di masa mendatang kami dapat meningkatkan kualitas pelayanan kepada seluruh penghuni Gedung Samudera Indonesia Makassar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f7f6f5)", padding: "20px 0 60px" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        :root { --ink: #18181b; --ink-soft: #3f3f46; --muted: #71717a; --line: #e7e5e4; --bg: #f7f6f5; --surface: #ffffff; --red-600: #dc2626; --ok: #16a34a; --accent: #7c3aed; }
      `}} />
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "0 16px" }}>
        <div style={{ background: "var(--surface)", borderRadius: "16px", padding: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", marginBottom: "16px" }}>
          <h1 style={{ margin: "0 0 8px 0", fontSize: "19px", fontWeight: 900, color: "var(--ink)" }}>Kuesioner Pelayanan Gedung Samudera Indonesia Makassar</h1>
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)" }}>Periode {hitungPeriodeSurvei()}</p>
        </div>

        <div style={{ background: "#e2e8f0", borderRadius: "12px", padding: "14px 16px", fontSize: "12.5px", color: "var(--ink-soft)", marginBottom: "16px", lineHeight: 1.6 }}>
          <strong>Petunjuk Pengisian:</strong> Kuesioner ini terdiri dari pertanyaan dengan pilihan jawaban skala 1-5, gambaran nilai sebagai berikut:
          <br />1 = Sangat Kurang &middot; 2 = Kurang &middot; 3 = Cukup &middot; 4 = Baik &middot; 5 = Sangat Baik
        </div>

        <div style={{ background: "var(--surface)", borderRadius: "16px", padding: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)" }}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>Nama <span style={{ color: "var(--red-600)" }}>*</span></label>
            <input value={nama} onChange={(e) => setNama(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>Perusahaan / Divisi <span style={{ color: "var(--red-600)" }}>*</span></label>
            <input value={perusahaanDivisi} onChange={(e) => setPerusahaanDivisi(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: "6px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>Lantai Lokasi Kantor <span style={{ color: "var(--red-600)" }}>*</span></label>
            <select value={lantai} onChange={(e) => setLantai(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "13px", outline: "none", background: "var(--surface)" }}>
              <option value="">Pilih lantai...</option>
              <option value="Lantai 1">Lantai 1</option>
              <option value="Lantai 2">Lantai 2</option>
              <option value="Lantai 3">Lantai 3</option>
              <option value="Lantai 4">Lantai 4</option>
            </select>
          </div>

          <SectionHeader>Kebersihan</SectionHeader>
          <RatingGrid judul="Bagaimana penilaian Bapak/Ibu terkait kebersihan gedung, sebagai berikut:" wajib rows={LABEL_KEBERSIHAN} value={kebersihan} onChange={ubahGrid(setKebersihan)} />
          <RatingSingle pertanyaan="Bagaimana penilaian Bapak/Ibu mengenai kualitas pelayanan dari Petugas Kebersihan (Cleaning Service)?" wajib value={kualitasCleaningService} onChange={setKualitasCleaningService} />
          <KotakSaran pertanyaan="Apakah Bapak/Ibu memiliki masukan/saran untuk peningkatan kebersihan di Gedung Samudera Indonesia Makassar?" value={saranKebersihan} onChange={setSaranKebersihan} />

          <SectionHeader>Keamanan</SectionHeader>
          <RatingGrid judul="Bagaimana penilaian Bapak/Ibu perihal Keamanan, sebagai berikut:" wajib rows={LABEL_KEAMANAN} value={keamanan} onChange={ubahGrid(setKeamanan)} />
          <RatingSingle pertanyaan="Bagaimana penilaian Bapak/Ibu mengenai kinerja dari Petugas Keamanan (Security)?" wajib value={kualitasSecurity} onChange={setKualitasSecurity} />
          <KotakSaran pertanyaan="Apakah Bapak/Ibu memiliki masukan/saran untuk peningkatan keamanan di Gedung Samudera Indonesia Makassar?" value={saranKeamanan} onChange={setSaranKeamanan} />

          <SectionHeader>Keselamatan &amp; Kesehatan Lingkungan Kerja</SectionHeader>
          <RatingGrid judul="Bagaimana penilaian Bapak/Ibu terkait upaya peningkatan Keselamatan dan Kesehatan Lingkungan Kerja, sebagai berikut:" wajib rows={LABEL_K3} value={k3} onChange={ubahGrid(setK3)} />
          <KotakSaran pertanyaan="Apakah Bapak/Ibu memiliki masukan/saran untuk peningkatan keselamatan dan kesehatan lingkungan di Gedung Samudera Indonesia Makassar?" value={saranK3} onChange={setSaranK3} />

          <SectionHeader>Pelayanan Teknis</SectionHeader>
          <RatingGrid judul="Bagaimana penilaian Bapak/Ibu terhadap Pelayanan Teknis, sebagai berikut:" wajib rows={LABEL_PELAYANAN_TEKNIS} value={pelayananTeknis} onChange={ubahGrid(setPelayananTeknis)} />
          <KotakSaran pertanyaan="Apakah Bapak/Ibu memiliki masukan/saran untuk peningkatan pelayanan teknis di Gedung Samudera Indonesia Makassar?" value={saranPelayananTeknis} onChange={setSaranPelayananTeknis} />

          <SectionHeader>Fasilitas Umum</SectionHeader>
          <RatingGrid judul="Bagaimana penilaian Bapak/Ibu perihal fasilitas umum yang ada di Gedung Samudera Indonesia Makassar?" wajib rows={LABEL_FASILITAS_UMUM} value={fasilitasUmum} onChange={ubahGrid(setFasilitasUmum)} />
          <KotakSaran pertanyaan="Apakah Bapak/Ibu memiliki masukan/saran untuk peningkatan Fasilitas Umum yang ada di area Gedung Samudera Indonesia Makassar?" value={saranFasilitasUmum} onChange={setSaranFasilitasUmum} />
          <KotakSaran pertanyaan="Apa sarana tambahan atau fasilitas yang Bapak/Ibu harapkan ada di area Gedung Samudera Indonesia Makassar?" value={saranaTambahanHarapan} onChange={setSaranaTambahanHarapan} />

          <SectionHeader>Pengelola Gedung</SectionHeader>
          <RatingSingle pertanyaan="Seberapa mudah prosedur pengajuan keluhan atau permintaan perbaikan/layanan di Gedung Samudera Makassar?" wajib value={kemudahanProsedur} onChange={setKemudahanProsedur} />
          <RatingSingle pertanyaan="Seberapa puas anda dengan kecepatan Pengelola Gedung dalam merespon pertanyaan, keluhan atau permintaan anda?" wajib value={kecepatanRespon} onChange={setKecepatanRespon} />
          <RatingSingle pertanyaan="Seberapa puas anda dengan hasil akhir penanganan keluhan atau permintaan anda?" wajib value={kepuasanPenanganan} onChange={setKepuasanPenanganan} />
          <KotakSaran pertanyaan="Apakah Bapak/Ibu memiliki masukan/saran untuk peningkatan pelayanan?" value={saranPengelola} onChange={setSaranPengelola} />

          <SectionHeader>Favorit Bulan Ini 🌟</SectionHeader>
          <PilihanFavorit pertanyaan="Siapa Pengamanan Favorite Anda?" opsi={OPSI_SECURITY_FAVORIT} value={securityFavorit} onChange={setSecurityFavorit} />
          <PilihanFavorit pertanyaan="Siapa Pelayanan Favorite Anda?" opsi={OPSI_PELAYANAN_FAVORIT} value={pelayananFavorit} onChange={setPelayananFavorit} />
          <PilihanFavorit pertanyaan="Siapa Teman Jalan Favorite Anda?" opsi={OPSI_TEMAN_JALAN_FAVORIT} value={temanJalanFavorit} onChange={setTemanJalanFavorit} />

          {errorMsg && (
            <div style={{ background: "#fef2f2", color: "var(--red-600)", padding: "10px 14px", borderRadius: "10px", fontSize: "12.5px", marginBottom: "14px" }}>{errorMsg}</div>
          )}

          <button
            onClick={handleSubmit} disabled={isLoading}
            style={{ width: "100%", padding: "16px", background: isLoading ? "#a0aec0" : "var(--accent)", color: "#fff", border: "none", borderRadius: "14px", fontWeight: 700, fontSize: "15px", cursor: isLoading ? "not-allowed" : "pointer", marginTop: "8px" }}
          >
            {isLoading ? "Mengirim..." : "Kirim Kuesioner"}
          </button>
        </div>
      </div>
    </div>
  );
}
