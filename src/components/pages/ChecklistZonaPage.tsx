"use client";

/**
 * Checklist Zona -- Uji Coba Pola Zona OB (§169). Staf melapor RONDE: centang area yang dikerjakan + 2-3 foto
 * (kamera atau galeri) + catatan opsional. Minimal `min_ronde` per hari (bawaan 1), boleh lebih.
 * §171 tanpa penilaian dari staf. §173/§175 tugas dibagi otomatis menurut luas:
 *   1. Pagi bersama (07.00-09.00): ruang tenant dibagi ke SEMUA peserta (Tenant + Publik)
 *   2. Tugas zona: Publik = area publik bagiannya; Tenant = pelayanan + keliling ruang tenant (berdua)
 *   3. Mingguan: area yang cukup 1x/minggu (gudang, pompa, rooftop, ...)
 *   + cadangan pelayanan: 1 orang Zona Publik bergiliran per hari di jam sibuk.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useToast } from "@/components/ui/ToastProvider";
import { handleFotoUpload } from "@/lib/uploadFoto";
import { tanggalISOWITASekarang } from "@/lib/shift";
import { daerahTulis } from "@/lib/daerah";
import type { LantaiOk } from "@/lib/bagiZona";
import AdminShell from "../admin/AdminShell";
import Tile from "../admin/Tile";
import {
  akhirPekan, cadanganHariIni, FOTO_MAX, FOTO_MIN, KOLEKSI_LAPORAN_ZONA, mingguKe, tugasPagi, tugasZona, useUjiPolaZona, zonaUntuk,
  type LaporanZona,
} from "@/lib/ujiPolaZona";

const jam = (l: LaporanZona) => l.waktu?.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" }) || "…";
const samaNama = (a = "", b = "") => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function ChecklistZonaPage() {
  const router = useRouter();
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({ depts: ["OB & CS"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus staf OB & CS." });
  const nama = session?.nama || "";
  const hariIni = tanggalISOWITASekarang();
  const { config, dimuat } = useUjiPolaZona();
  const zona = zonaUntuk(config, nama, hariIni);

  const [laporanSaya, setLaporanSaya] = useState<LaporanZona[]>([]);
  const [libur, setLibur] = useState<string[]>([]);
  const [lantaiOk, setLantaiOk] = useState<LantaiOk[]>([]);
  const [areaDipilih, setAreaDipilih] = useState<string[]>([]);
  const [foto, setFoto] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [catatan, setCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [lihatRekan, setLihatRekan] = useState(false);

  // semua laporan milik sendiri (1 field -> tanpa index komposit), disaring di browser: hari ini & minggu ini
  useEffect(() => {
    if (!nama) return;
    return onSnapshot(query(collection(db, KOLEKSI_LAPORAN_ZONA), where("nama", "==", nama)),
      (s) => setLaporanSaya(s.docs.map((d) => ({ id: d.id, ...d.data() } as LaporanZona))), (e) => console.error("[zona]", e));
  }, [nama]);
  useEffect(() => onSnapshot(doc(db, "settings", "validasi_karyawan"), (s) => setLibur((s.data()?.hari_libur as string[]) || []), () => setLibur([])), []);
  useEffect(() => onSnapshot(doc(db, "okupansi_gedung", "data"), (s) => setLantaiOk((s.data()?.lantai as LantaiOk[]) || []), () => setLantaiOk([])), []);

  const ronde = laporanSaya.filter((l) => l.jenis === "ronde" && l.tanggal === hariIni)
    .sort((a, b) => (a.waktu?.toMillis() || 0) - (b.waktu?.toMillis() || 0));
  const awalMinggu = config ? (mingguKe(config, hariIni) === 1 ? config.mulai : config.tukar_mulai) : hariIni;
  const sudahHariIni = new Set(ronde.flatMap((r) => r.area || []));
  const sudahMingguIni = new Set(laporanSaya.filter((l) => l.tanggal >= awalMinggu && l.tanggal <= hariIni).flatMap((l) => l.area || []));
  const hariLibur = akhirPekan(hariIni) || libur.includes(hariIni);

  // pembagian tugas (ringan -> dihitung tiap render)
  const mingguan = new Set(config?.mingguan || []);
  const pagi = config && zona && config.pagi_bersama ? tugasPagi(config, hariIni, lantaiOk) : null;
  const pagiKu = pagi?.orang.find((o) => samaNama(o.nama, nama))?.area || [];
  const zonaBagi = config && zona ? tugasZona(config, zona, hariIni, lantaiOk) : null;
  const zonaKuSemua = zona === "Tenant" ? zonaBagi?.bersama || [] : [...(zonaBagi?.orang.find((o) => samaNama(o.nama, nama))?.area || []), ...(zonaBagi?.bersama || [])];
  const zonaKu = zonaKuSemua.filter((a) => !mingguan.has(a));
  const mingguanKu = zonaKuSemua.filter((a) => mingguan.has(a));
  const rekanPublik = zona === "Publik" ? zonaBagi?.orang.filter((o) => !samaNama(o.nama, nama)) || [] : [];
  const rekanPagi = pagi?.orang.filter((o) => !samaNama(o.nama, nama)) || [];
  const tugasHarianKu = Array.from(new Set([...pagiKu, ...zonaKu]));
  const cadangan = cadanganHariIni(config, hariIni);
  const sayaCadangan = !!cadangan && samaNama(cadangan, nama);

  if (!isReady || !session || !dimuat) return null;

  const pilihFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const sisa = FOTO_MAX - foto.length - uploading;
    if (files.length > sisa) showToast(`Maksimal ${FOTO_MAX} foto per ronde.`, "warning");
    files.slice(0, Math.max(0, sisa)).forEach((file) => {
      handleFotoUpload(file, "sibm/zona-ob", () => setUploading((n) => n + 1), (url) => setFoto((f) => (f.length < FOTO_MAX ? [...f, url] : f)),
        () => showToast("Upload foto gagal, coba lagi.", "error"), () => setUploading((n) => Math.max(0, n - 1)));
    });
  };

  const kirimRonde = async () => {
    if (!config || !zona) return;
    if (areaDipilih.length === 0) return showToast("Centang minimal 1 area yang dikerjakan.", "warning");
    if (foto.length < FOTO_MIN) return showToast(`Lampirkan minimal ${FOTO_MIN} foto (maksimal ${FOTO_MAX}).`, "warning");
    setKirim(true);
    try {
      await addDoc(collection(db, KOLEKSI_LAPORAN_ZONA), {
        jenis: "ronde", tanggal: hariIni, nama, zona, minggu: mingguKe(config, hariIni), area: areaDipilih,
        foto: foto.slice(0, FOTO_MAX), catatan: catatan.trim(), waktu: serverTimestamp(), daerah: daerahTulis(),
      });
      setAreaDipilih([]); setFoto([]); setCatatan("");
      showToast(`Ronde ${ronde.length + 1} tersimpan.`, "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan ronde.", "error"); }
    setKirim(false);
  };

  const label: React.CSSProperties = { display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", margin: "12px 0 6px" };
  const daftarCentang = (daftar: string[], sudah: Set<string> = sudahHariIni) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px", marginTop: "8px" }}>
      {daftar.map((a) => {
        const on = areaDipilih.includes(a);
        return (
          <label key={a} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "10px 12px", borderRadius: "12px", background: on ? "var(--ok-50)" : "var(--bg)", border: `1px solid ${on ? "var(--ok)" : "var(--line)"}`, fontSize: "13px", cursor: "pointer" }}>
            <input type="checkbox" checked={on} onChange={() => setAreaDipilih(on ? areaDipilih.filter((x) => x !== a) : [...areaDipilih, a])} />
            <span style={{ flex: 1 }}>{a}</span>
            {sudah.has(a) && <span style={{ color: "var(--ok)", fontWeight: 800 }}>✓</span>}
          </label>
        );
      })}
    </div>
  );
  const judulBagian = (teks: string, sub: string, daftar: string[]) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", gap: "8px" }}>
      <div><b style={{ fontSize: "14px" }}>{teks}</b><div style={{ fontSize: "12px", color: "var(--muted)" }}>{sub}</div></div>
      {daftar.length > 0 && (
        <button type="button" className="sa-btn is-soft" style={{ height: "32px", flexShrink: 0 }} onClick={() => {
          const semua = daftar.every((a) => areaDipilih.includes(a));
          setAreaDipilih(semua ? areaDipilih.filter((a) => !daftar.includes(a)) : Array.from(new Set([...areaDipilih, ...daftar])));
        }}>{daftar.every((a) => areaDipilih.includes(a)) ? "Hapus centang" : "Centang semua"}</button>
      )}
    </div>
  );

  let isi: React.ReactNode;
  if (!config?.aktif || hariIni < (config?.mulai || "") || hariIni > (config?.selesai || "")) {
    isi = <Tile>Uji coba pola zona sedang tidak berjalan hari ini. Gunakan menu Checklist biasa.
      <div style={{ marginTop: "12px" }}><button type="button" className="sa-btn is-soft" onClick={() => router.push("/dashboard/ob/checklist")}>Buka Checklist biasa</button></div></Tile>;
  } else if (!zona) {
    isi = <Tile>Kamu tidak masuk daftar petugas uji coba pola zona. Hubungi Admin GA bila ini keliru.</Tile>;
  } else if (hariLibur) {
    isi = <Tile>Hari ini libur — tidak ada jadwal zona.</Tile>;
  } else {
    const selesaiKu = tugasHarianKu.filter((a) => sudahHariIni.has(a)).length;
    isi = (
      <>
        <Tile style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--muted)" }}>Minggu ke-{mingguKe(config, hariIni)} · uji coba {config.mulai} s.d. {config.selesai}</div>
          <h2 style={{ margin: "4px 0", fontSize: "22px" }}>Zona {zona}</h2>
          <ol style={{ margin: "6px 0 0", paddingLeft: "18px", fontSize: "13px", color: "var(--ink-soft)", lineHeight: 1.7 }}>
            {config.pagi_bersama && <li><b>{config.jam_pagi}</b> — bersihkan ruang tenant bagianmu (semua tim, sebelum jam kantor).</li>}
            {zona === "Tenant"
              ? <li>Setelah itu — <b>fokus pelayanan tenant</b> (minuman, meeting, permintaan portal) + keliling ruang tenant (sampah, tumpahan).</li>
              : <li>Setelah itu — area publik bagianmu (toilet, lobby, tangga, dll){mingguanKu.length ? "; area mingguan cukup 1x minggu ini" : ""}.</li>}
            {zona === "Publik" && cadangan && <li><b>Cadangan pelayanan {config.jam_cadangan}</b> hari ini: <b>{sayaCadangan ? "KAMU" : cadangan}</b>{sayaCadangan ? " — bantu ambil permintaan tenant di jam ini." : ""}</li>}
          </ol>
          <div style={{ marginTop: "10px", fontSize: "13px", fontWeight: 700, color: ronde.length >= config.min_ronde ? "var(--ok)" : "var(--warn)" }}>
            {ronde.length} ronde hari ini (minimal {config.min_ronde}) · {selesaiKu}/{tugasHarianKu.length} area harianmu sudah dikerjakan
          </div>
        </Tile>

        <Tile style={{ marginBottom: "16px" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Lapor ronde {ronde.length + 1}</h3>
          <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Centang area yang selesai dikerjakan di ronde ini. ✓ = sudah dikerjakan (hari ini / minggu ini untuk area mingguan).</div>

          {pagiKu.length > 0 && <>{judulBagian(`1. Pagi bersama ${config.jam_pagi} · ruang tenant`, "Bagianmu, dibagi menurut luas ke semua tim", pagiKu)}{daftarCentang(pagiKu)}</>}
          {zonaKu.length > 0 && <>{judulBagian(zona === "Tenant" ? "2. Keliling ruang tenant (berdua)" : "2. Area publik bagianmu", zona === "Tenant" ? "Sampah, tumpahan, rapikan di sela pelayanan" : "Harian", zonaKu)}{daftarCentang(zonaKu)}</>}
          {mingguanKu.length > 0 && <>{judulBagian("3. Mingguan", "Cukup 1x dalam minggu ini", mingguanKu)}{daftarCentang(mingguanKu, sudahMingguIni)}</>}

          {(rekanPublik.length > 0 || rekanPagi.length > 0) && (
            <div style={{ marginTop: "12px" }}>
              <button type="button" className="sa-btn is-soft" style={{ height: "32px" }} onClick={() => setLihatRekan(!lihatRekan)}>{lihatRekan ? "▾" : "▸"} Bantu area rekan</button>
              {lihatRekan && <>
                {rekanPagi.filter((r) => r.area.length).map((r) => (
                  <div key={`p${r.nama}`} style={{ marginTop: "8px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--muted)" }}>Pagi · {r.nama} · {r.lantai.join(", ")}</div>
                    {daftarCentang(r.area)}
                  </div>
                ))}
                {rekanPublik.filter((r) => r.area.length).map((r) => (
                  <div key={`z${r.nama}`} style={{ marginTop: "8px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--muted)" }}>Publik · {r.nama} · {r.lantai.join(", ")}</div>
                    {daftarCentang(r.area)}
                  </div>
                ))}
              </>}
            </div>
          )}

          <span style={label}>Foto ({FOTO_MIN}–{FOTO_MAX}) · dari kamera atau galeri</span>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {foto.map((url, i) => (
              <div key={url} style={{ position: "relative", width: "110px", height: "110px", borderRadius: "14px", overflow: "hidden", border: "1px solid var(--line)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- foto Cloudinary */}
                <img src={url} alt={`Foto ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button type="button" aria-label={`Hapus foto ${i + 1}`} onClick={() => setFoto(foto.filter((x) => x !== url))}
                  style={{ position: "absolute", top: "4px", right: "4px", width: "26px", height: "26px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer" }}>✕</button>
              </div>
            ))}
            {Array.from({ length: uploading }).map((_, i) => (
              <div key={`u${i}`} style={{ width: "110px", height: "110px", borderRadius: "14px", border: "2px dashed var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "var(--muted)" }}>Mengunggah…</div>
            ))}
            {foto.length + uploading < FOTO_MAX && (
              <label style={{ width: "110px", height: "110px", borderRadius: "14px", border: "2px dashed var(--line)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", cursor: "pointer", background: "var(--bg)", fontSize: "12.5px", fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
                📷<span>Tambah foto</span>
                {/* tanpa capture -> HP menawarkan Kamera atau Galeri */}
                <input type="file" accept="image/*" multiple hidden onChange={pilihFoto} />
              </label>
            )}
          </div>
          <span style={label}>Catatan (opsional)</span>
          <textarea className="sa-field" style={{ width: "100%", height: "70px", padding: "10px", cursor: "text" }} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Cth: toilet Lt 3 tisu habis, sudah diisi" />
          <button type="button" className="sa-btn is-primary" style={{ width: "100%", marginTop: "12px" }} disabled={kirim || uploading > 0} onClick={kirimRonde}>
            {kirim ? "Menyimpan…" : `Kirim ronde ${ronde.length + 1}`}
          </button>
        </Tile>

        {ronde.length > 0 && (
          <Tile>
            <h3 style={{ margin: "0 0 8px", fontSize: "16px" }}>Ronde hari ini</h3>
            {ronde.map((r, i) => (
              <div key={r.id} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: "13px" }}>
                <b>Ronde {i + 1} · {jam(r)}</b> — {(r.area || []).length} area
                <div style={{ color: "var(--ink-soft)" }}>{(r.area || []).join(", ")}</div>
                {r.catatan && <div style={{ color: "var(--muted)" }}>📝 {r.catatan}</div>}
              </div>
            ))}
          </Tile>
        )}
      </>
    );
  }

  return (
    <AdminShell title="Checklist Zona" subtitle="Uji coba pola zona OB" userName={nama} backHref="/dashboard/ob" backLabel="Dashboard OB">
      {isi}
    </AdminShell>
  );
}
