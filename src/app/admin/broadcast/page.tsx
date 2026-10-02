"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";
import { PengumumanSlide, PengumumanStyle } from "../../../components/PengumumanCarousel";
import { daerahTulis } from "@/lib/daerah";
import {
  type JenisPengumuman,
  type PengumumanGedung,
  MAX_KLIP_VIDEO_MB,
  PALET_TEMA,
  ambilYoutubeId,
  jenisPengumuman,
  statusTanggal,
  uploadGambarPengumuman,
  uploadKlipPengumuman,
} from "../../../lib/pengumuman";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
);
const IconMegaphone = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a2 2 0 0 0 2 2h1l2 6h2l-1-6h4l6 4V5l-6 4H6a2 2 0 0 0-2 2z" /></svg>
);

const LABEL_JENIS: Record<JenisPengumuman, string> = { teks: "Teks", gambar: "Gambar / Poster", video: "Video" };
const LABEL_STATUS = {
  tayang: { teks: "Dalam jadwal", bg: "var(--ok-50)", fg: "var(--ok)" },
  terjadwal: { teks: "Terjadwal", bg: "var(--info-50)", fg: "var(--info)" },
  berakhir: { teks: "Sudah berakhir", bg: "var(--hover)", fg: "var(--muted)" },
};

const hariIniWITA = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
const formatTanggal = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export default function BroadcastAdminPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    depts: ["Admin GA"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });
  const adminName = session?.nama || "Admin";

  const [daftar, setDaftar] = useState<PengumumanGedung[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form
  const [jenis, setJenis] = useState<JenisPengumuman>("teks");
  const [judul, setJudul] = useState("");
  const [teks, setTeks] = useState("");
  const [tema, setTema] = useState("merah");
  const [gambarUrl, setGambarUrl] = useState("");
  const [sumberVideo, setSumberVideo] = useState<"youtube" | "upload">("youtube");
  const [linkYoutube, setLinkYoutube] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [mulai, setMulai] = useState("");
  const [berakhir, setBerakhir] = useState("");
  const [penting, setPenting] = useState(false);
  const [mengunggah, setMengunggah] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const hariIni = hariIniWITA();
  const youtubeId = ambilYoutubeId(linkYoutube);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "pengumuman_gedung"), orderBy("dibuatPada", "desc")), (snapshot) => {
      setDaftar(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PengumumanGedung)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const resetForm = () => {
    setJenis("teks"); setJudul(""); setTeks(""); setTema("merah"); setGambarUrl("");
    setSumberVideo("youtube"); setLinkYoutube(""); setVideoUrl(""); setLinkUrl(""); setLinkLabel("");
    setMulai(""); setBerakhir(""); setPenting(false);
  };

  const handlePilihGambar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMengunggah(true);
    try {
      setGambarUrl(await uploadGambarPengumuman(file));
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Gagal mengunggah gambar.", "error");
    } finally {
      setMengunggah(false);
    }
  };

  const handlePilihKlip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMengunggah(true);
    try {
      setVideoUrl(await uploadKlipPengumuman(file));
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Gagal mengunggah klip video.", "error");
    } finally {
      setMengunggah(false);
    }
  };

  // Validasi form -> pesan kesalahan pertama, atau "" kalau siap terbit.
  const linkValid = !linkUrl.trim() || /^https?:\/\/\S+$/i.test(linkUrl.trim());
  const kesalahan = !judul.trim()
    ? "Judul wajib diisi."
    : jenis === "teks" && !teks.trim()
    ? "Isi pengumuman wajib diisi."
    : jenis === "gambar" && !gambarUrl
    ? "Unggah gambar/poster dulu."
    : jenis === "video" && sumberVideo === "youtube" && !youtubeId
    ? "Tempel link YouTube yang valid."
    : jenis === "video" && sumberVideo === "upload" && !videoUrl
    ? "Unggah klip video dulu."
    : !linkValid
    ? "Link tombol harus diawali http:// atau https://"
    : mulai && berakhir && berakhir < mulai
    ? "Tanggal berakhir tidak boleh sebelum tanggal mulai."
    : "";

  // Objek pratinjau = bentuk data yang akan disimpan, dirender dengan komponen slide yang sama dgn portal.
  const pratinjau: PengumumanGedung = {
    id: "pratinjau",
    judul: judul.trim() || "Judul Pengumuman",
    teks: teks.trim() || (jenis === "teks" ? "Isi pengumuman akan tampil di sini." : ""),
    warnaTema: tema,
    jenis,
    gambar_url: jenis === "gambar" ? gambarUrl : undefined,
    video_sumber: jenis === "video" ? sumberVideo : undefined,
    youtube_id: jenis === "video" && sumberVideo === "youtube" ? youtubeId || undefined : undefined,
    video_url: jenis === "video" && sumberVideo === "upload" ? videoUrl : undefined,
    link_url: linkUrl.trim() || undefined,
    link_label: linkLabel.trim() || undefined,
    penting,
  };

  const handleBuat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kesalahan) { showToast(kesalahan, "error"); return; }
    setIsSaving(true);
    try {
      // Firestore menolak nilai undefined -> field opsional hanya ditulis kalau terisi.
      const data: Record<string, unknown> = {
        judul: judul.trim(),
        teks: teks.trim(),
        warnaTema: tema,
        jenis,
        penting,
        aktif: true,
        dibuatPada: serverTimestamp(),
        dibuatOleh: adminName,
      };
      if (jenis === "gambar") data.gambar_url = gambarUrl;
      if (jenis === "video") {
        data.video_sumber = sumberVideo;
        if (sumberVideo === "youtube") data.youtube_id = youtubeId;
        else data.video_url = videoUrl;
      }
      if (linkUrl.trim()) {
        data.link_url = linkUrl.trim();
        if (linkLabel.trim()) data.link_label = linkLabel.trim();
      }
      if (mulai) data.mulai = mulai;
      if (berakhir) data.berakhir = berakhir;
      await addDoc(collection(db, "pengumuman_gedung"), { ...data, daerah: daerahTulis() });
      resetForm();
      setShowForm(false);
      showToast(
        mulai && mulai > hariIni ? `Pengumuman dijadwalkan tayang mulai ${formatTanggal(mulai)}.` : "Pengumuman baru berhasil dibuat & langsung tayang di portal utama!",
        "success"
      );
    } catch (err) {
      console.error(err);
      showToast("Gagal membuat pengumuman.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUbah = async (p: PengumumanGedung, perubahan: Partial<PengumumanGedung>) => {
    try {
      await updateDoc(doc(db, "pengumuman_gedung", p.id), perubahan);
    } catch (err) {
      console.error(err);
      showToast("Gagal mengubah pengumuman.", "error");
    }
  };

  const handleHapus = async (p: PengumumanGedung) => {
    const yakin = await confirm({
      title: "Hapus Pengumuman",
      message: `Yakin ingin menghapus pengumuman "${p.judul}"? Tindakan ini tidak bisa dibatalkan.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      variant: "danger",
    });
    if (!yakin) return;
    try {
      await deleteDoc(doc(db, "pengumuman_gedung", p.id));
      showToast("Pengumuman dihapus.", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal menghapus pengumuman.", "error");
    }
  };

  const jumlahTayang = daftar.filter((p) => p.aktif && statusTanggal(p, hariIni) === "tayang").length;

  if (!isReady) return null;

  return (
    <AdminShell title="Pengumuman Gedung" subtitle="Teks, poster, atau video yang tayang bergiliran di halaman utama SIBM" userName={adminName}>
      <PengumumanStyle />
      <style dangerouslySetInnerHTML={{ __html: `
        .bc-panel { background: var(--surface); border-radius: 20px; border: 1px solid var(--line); padding: 18px 20px; margin-bottom: 18px; }
        .bc-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 420px); gap: 22px; align-items: start; }
        .bc-kolom { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .bc-label { display: block; font-size: 12.5px; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
        .bc-input { width: 100%; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-family: inherit; font-size: 14px; box-sizing: border-box; }
        .bc-input:focus { outline: 2px solid var(--brand); outline-offset: -1px; }
        textarea.bc-input { min-height: 90px; resize: vertical; }
        .bc-hint { font-size: 11.5px; color: var(--muted); margin-top: 5px; line-height: 1.5; }
        .bc-hint.is-error { color: var(--red-600); font-weight: 600; }
        .bc-dua { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .tema-swatch { width: 36px; height: 36px; border-radius: 10px; cursor: pointer; border: 3px solid transparent; padding: 0; }
        .tema-swatch.aktif { border-color: var(--ink); }
        .bc-upload { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .bc-upload input[type=file] { display: none; }
        .bc-cek { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--hover); cursor: pointer; font-size: 13px; color: var(--ink); }
        .bc-cek input { margin-top: 2px; width: 16px; height: 16px; accent-color: var(--brand); }
        .bc-pratinjau { position: sticky; top: 90px; }
        .bc-kartu-pratinjau { border-radius: 20px; overflow: hidden; border: 1px solid var(--line); background: var(--tile); }
        .bc-item { background: var(--surface); border-radius: 18px; border: 1px solid var(--line); overflow: hidden; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
        .bc-item .pgm-slide { min-height: 0; height: 100%; }
        .bc-item .pgm-teks { padding: 14px 16px; }
        .bc-item .pgm-teks .pgm-judul { font-size: 15px; }
        .bc-item .pgm-teks .pgm-isi, .bc-item .pgm-caption, .bc-item .pgm-link { display: none; }
        .bc-item .pgm-teks .pgm-isi { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 12.5px; }
        .bc-item .pgm-media { aspect-ratio: auto; height: 100%; min-height: 124px; }
        .bc-info { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .bc-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .bc-badge { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 8px; background: var(--hover); color: var(--ink-soft); }
        .bc-aksi { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: auto; }
        .bc-pil { padding: 6px 13px; border-radius: 20px; border: none; cursor: pointer; font-family: inherit; font-size: 11.5px; font-weight: 700; }
        @media (max-width: 860px) {
          .bc-form { grid-template-columns: 1fr; }
          .bc-pratinjau { position: static; }
        }
        @media (max-width: 560px) {
          .bc-item { grid-template-columns: 1fr; }
          .bc-item .pgm-media { height: auto; aspect-ratio: 16 / 9; }
          .bc-dua { grid-template-columns: 1fr; }
        }
      `}} />
      <div>
        <div className="bc-panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontSize: "13px", color: "var(--ink-soft)", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <IconMegaphone size={16} /> {jumlahTayang} dari {daftar.length} pengumuman sedang tayang hari ini
          </div>
          <button type="button" className={`sa-btn ${showForm ? "is-soft" : "is-primary"}`} onClick={() => { if (showForm) resetForm(); setShowForm((v) => !v); }}>
            {showForm ? "Batal" : "+ Buat Pengumuman Baru"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleBuat} className="bc-panel bc-form" noValidate>
            <div className="bc-kolom">
              <div>
                <span className="bc-label">Jenis Pengumuman</span>
                <div className="sa-tabs" role="tablist" aria-label="Jenis pengumuman" style={{ marginBottom: 0, width: "fit-content", maxWidth: "100%" }}>
                  {(Object.keys(LABEL_JENIS) as JenisPengumuman[]).map((j) => (
                    <button key={j} type="button" role="tab" aria-selected={jenis === j} className={`sa-tab${jenis === j ? " is-active" : ""}`} onClick={() => setJenis(j)}>
                      {LABEL_JENIS[j]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="bc-label" htmlFor="bc-judul">Judul *</label>
                <input id="bc-judul" className="bc-input" value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={90}
                  placeholder={jenis === "video" ? "Contoh: Video Safety Induction Gedung" : "Contoh: Relokasi Ruangan"} />
              </div>

              <div>
                <label className="bc-label" htmlFor="bc-teks">{jenis === "teks" ? "Isi Pengumuman *" : "Keterangan (opsional)"}</label>
                <textarea id="bc-teks" className="bc-input" value={teks} onChange={(e) => setTeks(e.target.value)} maxLength={600}
                  placeholder={jenis === "teks" ? "Contoh: Mohon maaf atas ketidaknyamanan relokasi ruangan Lantai 2 ke Lantai 3 & 4." : "Keterangan singkat di bawah gambar/video."} />
              </div>

              {jenis === "teks" && (
                <div>
                  <span className="bc-label">Warna Tema Kartu</span>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {PALET_TEMA.map((p) => (
                      <button key={p.key} type="button" className={`tema-swatch ${tema === p.key ? "aktif" : ""}`} style={{ background: p.gradient }} onClick={() => setTema(p.key)} title={p.label} aria-label={`Tema ${p.label}`} aria-pressed={tema === p.key} />
                    ))}
                  </div>
                </div>
              )}

              {jenis === "gambar" && (
                <div>
                  <span className="bc-label">Gambar / Poster *</span>
                  <div className="bc-upload">
                    <label className="sa-btn is-dark" style={{ opacity: mengunggah ? 0.6 : 1, pointerEvents: mengunggah ? "none" : "auto" }}>
                      <input type="file" accept="image/*" onChange={handlePilihGambar} />
                      {mengunggah ? "Mengunggah..." : gambarUrl ? "Ganti Gambar" : "Pilih Gambar"}
                    </label>
                    {gambarUrl && <button type="button" className="sa-btn is-soft" onClick={() => setGambarUrl("")}>Hapus</button>}
                  </div>
                  <div className="bc-hint">JPG/PNG, otomatis dikecilkan (maks. 1600px). Rasio 16:9 paling pas, poster tegak tetap tampil utuh.</div>
                </div>
              )}

              {jenis === "video" && (
                <div>
                  <span className="bc-label">Sumber Video *</span>
                  <div className="sa-tabs" role="tablist" aria-label="Sumber video" style={{ marginBottom: "10px", width: "fit-content", maxWidth: "100%" }}>
                    <button type="button" role="tab" aria-selected={sumberVideo === "youtube"} className={`sa-tab${sumberVideo === "youtube" ? " is-active" : ""}`} onClick={() => setSumberVideo("youtube")}>Link YouTube (disarankan)</button>
                    <button type="button" role="tab" aria-selected={sumberVideo === "upload"} className={`sa-tab${sumberVideo === "upload" ? " is-active" : ""}`} onClick={() => setSumberVideo("upload")}>Unggah klip pendek</button>
                  </div>
                  {sumberVideo === "youtube" ? (
                    <>
                      <input className="bc-input" value={linkYoutube} onChange={(e) => setLinkYoutube(e.target.value)} placeholder="https://youtu.be/..." aria-label="Link YouTube" />
                      <div className={`bc-hint${linkYoutube.trim() && !youtubeId ? " is-error" : ""}`}>
                        {linkYoutube.trim() && !youtubeId
                          ? "Link YouTube tidak dikenali. Salin dari tombol Bagikan di YouTube."
                          : "Unggah video ke YouTube dengan visibilitas Unlisted (Tidak publik): tidak muncul di pencarian, tapi bisa diputar di SIBM. Hemat kuota & lancar untuk video panjang."}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bc-upload">
                        <label className="sa-btn is-dark" style={{ opacity: mengunggah ? 0.6 : 1, pointerEvents: mengunggah ? "none" : "auto" }}>
                          <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handlePilihKlip} />
                          {mengunggah ? "Mengunggah..." : videoUrl ? "Ganti Klip" : "Pilih Klip Video"}
                        </label>
                        {videoUrl && <button type="button" className="sa-btn is-soft" onClick={() => setVideoUrl("")}>Hapus</button>}
                      </div>
                      <div className="bc-hint">MP4/WebM, maksimal {MAX_KLIP_VIDEO_MB} MB (kira-kira 1 menit). Video lebih panjang sebaiknya lewat link YouTube.</div>
                    </>
                  )}
                </div>
              )}

              <div className="bc-dua">
                <div>
                  <label className="bc-label" htmlFor="bc-mulai">Tayang mulai</label>
                  <input id="bc-mulai" type="date" className="bc-input" value={mulai} onChange={(e) => setMulai(e.target.value)} />
                </div>
                <div>
                  <label className="bc-label" htmlFor="bc-berakhir">Tayang sampai</label>
                  <input id="bc-berakhir" type="date" className="bc-input" value={berakhir} min={mulai || undefined} onChange={(e) => setBerakhir(e.target.value)} />
                </div>
              </div>
              <div className="bc-hint" style={{ marginTop: "-8px" }}>Kosongkan = langsung tayang & tanpa batas. Setelah tanggal berakhir, pengumuman otomatis hilang dari portal.</div>

              <div className="bc-dua">
                <div>
                  <label className="bc-label" htmlFor="bc-link">Link tombol (opsional)</label>
                  <input id="bc-link" className="bc-input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <label className="bc-label" htmlFor="bc-link-label">Teks tombol</label>
                  <input id="bc-link-label" className="bc-input" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Selengkapnya" maxLength={30} disabled={!linkUrl.trim()} />
                </div>
              </div>
              {!linkValid && <div className="bc-hint is-error" style={{ marginTop: "-8px" }}>Link harus diawali http:// atau https://</div>}

              <label className="bc-cek">
                <input type="checkbox" checked={penting} onChange={(e) => setPenting(e.target.checked)} />
                <span><b>Tandai penting</b><br /><span style={{ color: "var(--muted)", fontSize: "12px" }}>Selalu tampil paling depan di portal, dengan label &quot;Penting&quot;.</span></span>
              </label>
            </div>

            <div className="bc-kolom bc-pratinjau">
              <span className="bc-label" style={{ marginBottom: 0 }}>Pratinjau di Portal</span>
              <div className="bc-kartu-pratinjau">
                <PengumumanSlide p={pratinjau} />
              </div>
              {kesalahan && <div className="bc-hint">{kesalahan}</div>}
              <button type="submit" className="sa-btn is-primary" disabled={isSaving || mengunggah || !!kesalahan} style={{ width: "100%", height: "46px", opacity: isSaving || mengunggah || kesalahan ? 0.55 : 1, cursor: isSaving || mengunggah || kesalahan ? "not-allowed" : "pointer" }}>
                {isSaving ? "Menyimpan..." : mulai && mulai > hariIni ? "Jadwalkan Pengumuman" : "Terbitkan Pengumuman"}
              </button>
            </div>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</div>
          ) : daftar.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)", background: "var(--surface)", borderRadius: "20px", border: "1px dashed var(--line)" }}>Belum ada pengumuman. Buat yang pertama lewat tombol di atas.</div>
          ) : (
            daftar.map((p) => {
              const st = LABEL_STATUS[statusTanggal(p, hariIni)];
              const rentang = p.mulai || p.berakhir
                ? `${p.mulai ? formatTanggal(p.mulai) : "Sekarang"} – ${p.berakhir ? formatTanggal(p.berakhir) : "seterusnya"}`
                : "Tanpa batas tanggal";
              return (
                <div key={p.id} className="bc-item" style={{ opacity: p.aktif ? 1 : 0.55 }}>
                  <PengumumanSlide p={p} />
                  <div className="bc-info">
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--ink)" }}>{p.judul}</div>
                    <div className="bc-badges">
                      <span className="bc-badge">{LABEL_JENIS[jenisPengumuman(p)]}{p.video_sumber === "youtube" ? " · YouTube" : p.video_sumber === "upload" ? " · Klip" : ""}</span>
                      <span className="bc-badge" style={{ background: st.bg, color: st.fg }}>{st.teks}</span>
                      {p.penting && <span className="bc-badge" style={{ background: "var(--red-50)", color: "var(--red-600)" }}>Penting</span>}
                      {p.link_url && <span className="bc-badge">Ada tombol link</span>}
                    </div>
                    <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{rentang} · oleh {p.dibuatOleh || "-"}</div>
                    <div className="bc-aksi">
                      <button type="button" className="bc-pil" onClick={() => handleUbah(p, { aktif: !p.aktif })}
                        style={{ background: p.aktif ? "var(--ok-50)" : "var(--hover)", color: p.aktif ? "var(--ok)" : "var(--muted)" }}>
                        {p.aktif ? "● Aktif" : "○ Dihentikan"}
                      </button>
                      <button type="button" className="bc-pil" onClick={() => handleUbah(p, { penting: !p.penting })}
                        style={{ background: p.penting ? "var(--red-50)" : "var(--hover)", color: p.penting ? "var(--red-600)" : "var(--ink-soft)" }}>
                        {p.penting ? "★ Penting" : "☆ Tandai penting"}
                      </button>
                      <button type="button" onClick={() => handleHapus(p)} aria-label={`Hapus pengumuman ${p.judul}`} style={{ marginLeft: "auto", padding: "7px 10px", borderRadius: "10px", border: "none", cursor: "pointer", background: "var(--red-50)", color: "var(--red-600)", display: "flex" }}>
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AdminShell>
  );
}
