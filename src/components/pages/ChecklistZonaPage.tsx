"use client";

/**
 * Checklist Zona -- Uji Coba Pola Zona OB (§169). Staf mengisi:
 *  1. Ronde kebersihan/pelayanan: centang area zona yang dikerjakan + 2 foto (sebelum & sesudah). Minimal
 *     `min_ronde` per hari (bawaan 1), boleh lebih -- jam tiap ronde tercatat untuk evaluasi.
 *  2. Penilaian akhir shift (1x/hari, bisa diubah): beban 1-5, berapa kali membantu zona lain, kendala, jam pulang.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useToast } from "@/components/ui/ToastProvider";
import { handleFotoUpload } from "@/lib/uploadFoto";
import { tanggalISOWITASekarang } from "@/lib/shift";
import { daerahTulis } from "@/lib/daerah";
import AdminShell from "../admin/AdminShell";
import Tile from "../admin/Tile";
import {
  anggotaZona, akhirPekan, KOLEKSI_LAPORAN_ZONA, LABEL_BEBAN, mingguKe, useUjiPolaZona, zonaUntuk, type LaporanZona,
} from "@/lib/ujiPolaZona";

const jam = (l: LaporanZona) => l.waktu?.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" }) || "…";

export default function ChecklistZonaPage() {
  const router = useRouter();
  const showToast = useToast();
  const { session, isReady } = useAuthGuard({ depts: ["OB & CS"], redirectTo: "/", deniedMessage: "Akses Ditolak! Halaman ini khusus staf OB & CS." });
  const nama = session?.nama || "";
  const hariIni = tanggalISOWITASekarang();
  const { config, dimuat } = useUjiPolaZona();
  const zona = zonaUntuk(config, nama, hariIni);

  const [laporan, setLaporan] = useState<LaporanZona[]>([]);
  const [libur, setLibur] = useState<string[]>([]);
  const [areaDipilih, setAreaDipilih] = useState<string[]>([]);
  const [foto, setFoto] = useState<{ sebelum?: string; sesudah?: string }>({});
  const [uploading, setUploading] = useState<"" | "sebelum" | "sesudah">("");
  const [catatan, setCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  // penilaian akhir shift
  const [beban, setBeban] = useState(0);
  const [bantu, setBantu] = useState("0");
  const [kendala, setKendala] = useState("");
  const [jamPulang, setJamPulang] = useState("");
  const [ubahPenilaian, setUbahPenilaian] = useState(false);

  useEffect(() => {
    if (!nama) return;
    const q = query(collection(db, KOLEKSI_LAPORAN_ZONA), where("nama", "==", nama), where("tanggal", "==", hariIni));
    return onSnapshot(q, (s) => setLaporan(s.docs.map((d) => ({ id: d.id, ...d.data() } as LaporanZona))), (e) => console.error("[zona]", e));
  }, [nama, hariIni]);

  useEffect(() => onSnapshot(doc(db, "settings", "validasi_karyawan"), (s) => setLibur((s.data()?.hari_libur as string[]) || []), () => setLibur([])), []);

  const ronde = useMemo(() => laporan.filter((l) => l.jenis === "ronde").sort((a, b) => (a.waktu?.toMillis() || 0) - (b.waktu?.toMillis() || 0)), [laporan]);
  const penilaian = laporan.find((l) => l.jenis === "penilaian");
  const daftarArea = zona === "Tenant" ? config?.area_tenant || [] : config?.area_publik || [];
  const rekan = config && zona ? anggotaZona(config, zona, hariIni).filter((n) => n.trim().toLowerCase() !== nama.trim().toLowerCase()) : [];
  const hariLibur = akhirPekan(hariIni) || libur.includes(hariIni);

  const mulaiUbahPenilaian = () => {
    if (penilaian) {
      setBeban(penilaian.beban || 0);
      setBantu(String(penilaian.bantu_zona_lain ?? 0));
      setKendala(penilaian.kendala || "");
      setJamPulang(penilaian.jam_pulang || "");
    }
    setUbahPenilaian(true);
  };

  if (!isReady || !session || !dimuat) return null;

  const pilihFoto = (e: React.ChangeEvent<HTMLInputElement>, jenis: "sebelum" | "sesudah") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    handleFotoUpload(file, "sibm/zona-ob", () => setUploading(jenis), (url) => setFoto((f) => ({ ...f, [jenis]: url })),
      () => showToast("Upload foto gagal, coba lagi.", "error"), () => setUploading(""));
  };

  const kirimRonde = async () => {
    if (!config || !zona) return;
    if (areaDipilih.length === 0) return showToast("Centang minimal 1 area yang dikerjakan.", "warning");
    if (!foto.sebelum || !foto.sesudah) return showToast("Lengkapi 2 foto: sebelum & sesudah.", "warning");
    setKirim(true);
    try {
      await addDoc(collection(db, KOLEKSI_LAPORAN_ZONA), {
        jenis: "ronde", tanggal: hariIni, nama, zona, minggu: mingguKe(config, hariIni), area: areaDipilih,
        foto_sebelum: foto.sebelum, foto_sesudah: foto.sesudah, catatan: catatan.trim(), waktu: serverTimestamp(), daerah: daerahTulis(),
      });
      setAreaDipilih([]); setFoto({}); setCatatan("");
      showToast(`Ronde ${ronde.length + 1} tersimpan.`, "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan ronde.", "error"); }
    setKirim(false);
  };

  const kirimPenilaian = async () => {
    if (!config || !zona) return;
    if (!beban) return showToast("Pilih tingkat beban kerja hari ini.", "warning");
    if (!jamPulang) return showToast("Isi jam pulang.", "warning");
    setKirim(true);
    try {
      // 1 dokumen per staf per hari -> diubah, bukan dobel
      await setDoc(doc(db, KOLEKSI_LAPORAN_ZONA, `penilaian_${hariIni}_${nama.replace(/[/\s]+/g, "_")}`), {
        jenis: "penilaian", tanggal: hariIni, nama, zona, minggu: mingguKe(config, hariIni), beban,
        bantu_zona_lain: Math.max(0, Number(bantu) || 0), kendala: kendala.trim(), jam_pulang: jamPulang, waktu: serverTimestamp(), daerah: daerahTulis(),
      });
      setUbahPenilaian(false);
      showToast("Penilaian akhir shift tersimpan. Terima kasih!", "success");
    } catch (e) { console.error(e); showToast("Gagal menyimpan penilaian.", "error"); }
    setKirim(false);
  };

  const kartu: React.CSSProperties = { marginBottom: "16px" };
  const label: React.CSSProperties = { display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", margin: "12px 0 6px" };

  let isi: React.ReactNode;
  if (!config?.aktif || hariIni < (config?.mulai || "") || hariIni > (config?.selesai || "")) {
    isi = <Tile>Uji coba pola zona sedang tidak berjalan hari ini. Gunakan menu Checklist biasa.
      <div style={{ marginTop: "12px" }}><button type="button" className="sa-btn is-soft" onClick={() => router.push("/dashboard/ob/checklist")}>Buka Checklist biasa</button></div></Tile>;
  } else if (!zona) {
    isi = <Tile>Kamu tidak masuk daftar petugas uji coba pola zona. Hubungi Admin GA bila ini keliru.</Tile>;
  } else if (hariLibur) {
    isi = <Tile>Hari ini libur — tidak ada jadwal zona.</Tile>;
  } else {
    const fotoKotak = (jenis: "sebelum" | "sesudah") => (
      <label style={{ flex: 1, minWidth: "130px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", height: "130px", borderRadius: "16px", border: "2px dashed var(--line)", cursor: "pointer", overflow: "hidden", background: "var(--bg)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- foto Cloudinary */}
        {foto[jenis] ? <img src={foto[jenis]} alt={`Foto ${jenis}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--muted)" }}>{uploading === jenis ? "Mengunggah…" : `📷 Foto ${jenis}`}</span>}
        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => pilihFoto(e, jenis)} />
      </label>
    );
    isi = (
      <>
        <Tile style={kartu}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--muted)" }}>Minggu ke-{mingguKe(config, hariIni)} · uji coba {config.mulai} s.d. {config.selesai}</div>
          <h2 style={{ margin: "4px 0", fontSize: "22px" }}>Zona {zona}</h2>
          <div style={{ fontSize: "13px", color: "var(--ink-soft)" }}>
            {zona === "Tenant" ? "Melayani & membersihkan ruang tenant semua lantai, termasuk permintaan dari portal." : "Lobby, koridor, toilet, tangga, parkiran & area bersama lain."}
            {rekan.length > 0 && <> Rekan zona: <b>{rekan.join(", ")}</b>.</>}
          </div>
          <div style={{ marginTop: "10px", fontSize: "13px", fontWeight: 700, color: ronde.length >= config.min_ronde ? "var(--ok)" : "var(--warn)" }}>
            {ronde.length} ronde hari ini (minimal {config.min_ronde}) · penilaian akhir shift {penilaian ? "✓ sudah" : "belum"}
          </div>
        </Tile>

        <Tile style={kartu}>
          <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Lapor ronde {ronde.length + 1}</h3>
          <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Centang area yang selesai dikerjakan di ronde ini.</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
            <button type="button" className="sa-btn is-soft" style={{ height: "32px" }} onClick={() => setAreaDipilih(areaDipilih.length === daftarArea.length ? [] : [...daftarArea])}>
              {areaDipilih.length === daftarArea.length ? "Hapus centang" : "Centang semua"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px", marginTop: "8px" }}>
            {daftarArea.map((a) => {
              const on = areaDipilih.includes(a);
              return (
                <label key={a} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "10px 12px", borderRadius: "12px", background: on ? "var(--ok-50)" : "var(--bg)", border: `1px solid ${on ? "var(--ok)" : "var(--line)"}`, fontSize: "13px", cursor: "pointer" }}>
                  <input type="checkbox" checked={on} onChange={() => setAreaDipilih(on ? areaDipilih.filter((x) => x !== a) : [...areaDipilih, a])} />
                  {a}
                </label>
              );
            })}
          </div>
          <span style={label}>Foto (2): sebelum & sesudah</span>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>{fotoKotak("sebelum")}{fotoKotak("sesudah")}</div>
          <span style={label}>Catatan (opsional)</span>
          <textarea className="sa-field" style={{ width: "100%", height: "70px", padding: "10px", cursor: "text" }} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Cth: toilet Lt 3 tisu habis, sudah diisi" />
          <button type="button" className="sa-btn is-primary" style={{ width: "100%", marginTop: "12px" }} disabled={kirim || !!uploading} onClick={kirimRonde}>
            {kirim ? "Menyimpan…" : `Kirim ronde ${ronde.length + 1}`}
          </button>
        </Tile>

        <Tile style={kartu}>
          <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Penilaian akhir shift</h3>
          <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>Isi jujur — dipakai menilai apakah pola zona meringankan atau memberatkan. Tidak ada potongan poin selama uji coba.</div>
          {penilaian && !ubahPenilaian ? (
            <div style={{ marginTop: "10px", fontSize: "13.5px", lineHeight: 1.7 }}>
              Beban: <b>{penilaian.beban} — {LABEL_BEBAN[penilaian.beban || 0]}</b><br />
              Bantu zona lain: <b>{penilaian.bantu_zona_lain ?? 0}×</b> · Pulang: <b>{penilaian.jam_pulang}</b><br />
              {penilaian.kendala && <>Kendala: {penilaian.kendala}<br /></>}
              <button type="button" className="sa-btn is-soft" style={{ marginTop: "8px" }} onClick={mulaiUbahPenilaian}>Ubah penilaian</button>
            </div>
          ) : (
            <>
              <span style={label}>Beban kerja hari ini</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setBeban(n)} style={{ padding: "8px 4px", borderRadius: "12px", border: `2px solid ${beban === n ? "var(--brand)" : "var(--line)"}`, background: beban === n ? "var(--red-50)" : "var(--bg)", color: "var(--ink)", fontFamily: "inherit", cursor: "pointer" }}>
                    <div style={{ fontSize: "18px", fontWeight: 800 }}>{n}</div>
                    <div style={{ fontSize: "10.5px", color: "var(--muted)" }}>{LABEL_BEBAN[n]}</div>
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div><span style={label}>Bantu zona lain (kali)</span><input className="sa-field" style={{ width: "100%", cursor: "text" }} type="number" min={0} inputMode="numeric" value={bantu} onChange={(e) => setBantu(e.target.value)} /></div>
                <div><span style={label}>Jam pulang</span><input className="sa-field" style={{ width: "100%" }} type="time" value={jamPulang} onChange={(e) => setJamPulang(e.target.value)} /></div>
              </div>
              <span style={label}>Kendala hari ini (opsional)</span>
              <textarea className="sa-field" style={{ width: "100%", height: "70px", padding: "10px", cursor: "text" }} value={kendala} onChange={(e) => setKendala(e.target.value)} placeholder="Cth: permintaan tenant numpuk jam 10, area publik jadi tertunda" />
              <button type="button" className="sa-btn is-dark" style={{ width: "100%", marginTop: "12px" }} disabled={kirim} onClick={kirimPenilaian}>{kirim ? "Menyimpan…" : "Simpan penilaian"}</button>
            </>
          )}
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
