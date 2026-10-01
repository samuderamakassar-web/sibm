"use client";

/**
 * src/components/PengumumanCarousel.tsx
 * ------------------------------------------------------------------
 * Carousel Pengumuman Gedung di portal utama + komponen slide yang SAMA dipakai sebagai pratinjau
 * di admin/broadcast (WYSIWYG). Tiga jenis: teks, gambar (poster), video (YouTube / klip pendek).
 * Video tidak diputar di dalam carousel -- tampil sebagai sampul + tombol play, diputar di pop-up,
 * dan carousel berhenti bergeser selama pop-up terbuka atau slide sedang disentuh/disorot.
 * ------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";
import Modal from "./ui/Modal";
import {
  type PengumumanGedung,
  durasiSlide,
  gradientUntukTema,
  jenisPengumuman,
  sampulVideo,
  urlPemutar,
} from "../lib/pengumuman";

const CSS = `
  .pgm { position: relative; height: 100%; display: flex; flex-direction: column; }
  .pgm-slide { flex: 1; display: flex; flex-direction: column; min-height: 190px; }
  .pgm-teks { color: #fff; padding: 22px 24px; justify-content: center; gap: 8px; }
  .pgm-label { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.9; }
  .pgm-penting { background: rgba(255,255,255,0.22); padding: 2px 8px; border-radius: 8px; letter-spacing: 0.04em; }
  .pgm-judul { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.25; }
  .pgm-isi { margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-line; }
  .pgm-link { align-self: flex-start; margin-top: 6px; display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 14px; border-radius: 12px; background: rgba(255,255,255,0.92); color: #231f1c; font-size: 13px; font-weight: 700; text-decoration: none; }
  .pgm-media { position: relative; display: block; width: 100%; padding: 0; border: none; background: #111; cursor: pointer; aspect-ratio: 16 / 9; max-height: 340px; overflow: hidden; }
  .pgm-media img { width: 100%; height: 100%; display: block; }
  .pgm-media.is-gambar { background: var(--hover, #eee); }
  .pgm-media.is-gambar img { object-fit: contain; }
  .pgm-media.is-video img { object-fit: cover; opacity: 0.85; }
  .pgm-play { position: absolute; inset: 0; margin: auto; width: 64px; height: 64px; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; display: flex; align-items: center; justify-content: center; }
  .pgm-caption { padding: 14px 18px; background: var(--tile, #fff); color: var(--ink, #231f1c); display: flex; flex-direction: column; gap: 4px; }
  .pgm-caption .pgm-judul { font-size: 16px; }
  .pgm-caption .pgm-isi { font-size: 13px; color: var(--ink-soft, #5e5750); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .pgm-caption .pgm-link { background: var(--ink, #231f1c); color: var(--ground, #fff); }
  .pgm-caption .pgm-label { color: var(--ink-soft, #5e5750); }
  .pgm-caption .pgm-penting { background: var(--red-50, #fdeeee); color: var(--red-600, #a3122a); }
  .pgm-nav { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 10px; background: var(--tile, #fff); }
  .pgm-dot { width: 7px; height: 7px; padding: 0; border-radius: 4px; border: none; cursor: pointer; background: var(--line, #ddd); transition: width 0.25s; }
  .pgm-dot.is-aktif { width: 20px; background: var(--brand, #a3122a); }
  .pgm-arah { width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--hover, #f2f2f2); color: var(--ink, #231f1c); cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .pgm-video-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 14px; overflow: hidden; background: #000; }
  .pgm-video-frame iframe, .pgm-video-frame video { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  .pgm-gambar-besar { width: 100%; height: auto; max-height: 75vh; object-fit: contain; border-radius: 12px; display: block; }
`;

const IkonPlay = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
);
const IkonPanah = ({ kiri }: { kiri?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={kiri ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} /></svg>
);

function Label({ p }: { p: PengumumanGedung }) {
  return (
    <span className="pgm-label">
      Pengumuman{p.penting && <span className="pgm-penting">Penting</span>}
    </span>
  );
}

function TombolLink({ p }: { p: PengumumanGedung }) {
  if (!p.link_url) return null;
  return (
    <a className="pgm-link" href={p.link_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      {p.link_label?.trim() || "Selengkapnya"} &rarr;
    </a>
  );
}

/** Satu slide pengumuman. onPutar/onPerbesar kosong = pratinjau (tidak bisa diklik). */
export function PengumumanSlide({ p, onPutar, onPerbesar }: { p: PengumumanGedung; onPutar?: () => void; onPerbesar?: () => void }) {
  const jenis = jenisPengumuman(p);
  if (jenis === "gambar" && p.gambar_url) {
    return (
      <div className="pgm-slide">
        <button type="button" className="pgm-media is-gambar" onClick={onPerbesar} disabled={!onPerbesar} aria-label={`Perbesar gambar: ${p.judul}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- gambar Cloudinary, static export */}
          <img src={p.gambar_url} alt={p.judul} loading="lazy" />
        </button>
        <div className="pgm-caption">
          <Label p={p} />
          <h3 className="pgm-judul">{p.judul}</h3>
          {p.teks && <p className="pgm-isi">{p.teks}</p>}
          <TombolLink p={p} />
        </div>
      </div>
    );
  }
  if (jenis === "video") {
    const sampul = sampulVideo(p);
    return (
      <div className="pgm-slide">
        <button type="button" className="pgm-media is-video" onClick={onPutar} disabled={!onPutar} aria-label={`Putar video: ${p.judul}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- sampul YouTube/Cloudinary */}
          {sampul && <img src={sampul} alt="" loading="lazy" />}
          <span className="pgm-play"><IkonPlay /></span>
        </button>
        <div className="pgm-caption">
          <Label p={p} />
          <h3 className="pgm-judul">{p.judul}</h3>
          {p.teks && <p className="pgm-isi">{p.teks}</p>}
          <TombolLink p={p} />
        </div>
      </div>
    );
  }
  return (
    <div className="pgm-slide pgm-teks" style={{ background: gradientUntukTema(p.warnaTema) }}>
      <Label p={p} />
      <h3 className="pgm-judul">{p.judul}</h3>
      {p.teks && <p className="pgm-isi">{p.teks}</p>}
      <TombolLink p={p} />
    </div>
  );
}

/** CSS carousel -- dipasang sekali oleh komponen yang memakai PengumumanSlide (portal & admin). */
export function PengumumanStyle() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

export default function PengumumanCarousel({ daftar }: { daftar: PengumumanGedung[] }) {
  const [indeks, setIndeks] = useState(0);
  const [disorot, setDisorot] = useState(false);
  const [video, setVideo] = useState<PengumumanGedung | null>(null);
  const [gambarBesar, setGambarBesar] = useState<PengumumanGedung | null>(null);
  const timerSentuh = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Index dibulatkan saat render (bukan effect+setState) kalau jumlah pengumuman berkurang.
  const aman = daftar.length > 0 ? indeks % daftar.length : 0;
  const aktif = daftar[aman];
  const berhenti = disorot || !!video || !!gambarBesar;

  useEffect(() => {
    if (daftar.length <= 1 || berhenti || !aktif) return;
    const t = setTimeout(() => setIndeks((i) => (i + 1) % daftar.length), durasiSlide(aktif));
    return () => clearTimeout(t);
  }, [aman, aktif, daftar.length, berhenti]);

  useEffect(() => () => { if (timerSentuh.current) clearTimeout(timerSentuh.current); }, []);

  if (!aktif) return null;

  // Sentuhan di HP: jeda 12 detik sejak sentuhan terakhir, lalu lanjut sendiri.
  const jedaSentuh = () => {
    setDisorot(true);
    if (timerSentuh.current) clearTimeout(timerSentuh.current);
    timerSentuh.current = setTimeout(() => setDisorot(false), 12000);
  };
  const geser = (arah: number) => setIndeks((aman + arah + daftar.length) % daftar.length);
  const putar = urlPemutar(video || aktif);

  return (
    <div
      className="pgm"
      role="region"
      aria-roledescription="carousel"
      aria-label="Pengumuman gedung"
      onMouseEnter={() => setDisorot(true)}
      onMouseLeave={() => setDisorot(false)}
      onTouchStart={jedaSentuh}
    >
      <PengumumanStyle />
      <PengumumanSlide p={aktif} onPutar={() => setVideo(aktif)} onPerbesar={() => setGambarBesar(aktif)} />

      {daftar.length > 1 && (
        <div className="pgm-nav">
          <button type="button" className="pgm-arah" onClick={() => geser(-1)} aria-label="Pengumuman sebelumnya"><IkonPanah kiri /></button>
          {daftar.map((p, i) => (
            <button key={p.id} type="button" className={`pgm-dot${i === aman ? " is-aktif" : ""}`} onClick={() => setIndeks(i)} aria-label={`Pengumuman ${i + 1}: ${p.judul}`} aria-current={i === aman} />
          ))}
          <button type="button" className="pgm-arah" onClick={() => geser(1)} aria-label="Pengumuman berikutnya"><IkonPanah /></button>
        </div>
      )}

      <Modal open={!!video} onClose={() => setVideo(null)} maxWidth="880px">
        {video && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h3 style={{ margin: "0 44px 0 0", fontSize: "17px", fontWeight: 800 }}>{video.judul}</h3>
            <div className="pgm-video-frame">
              {video.video_sumber === "youtube" && putar ? (
                <iframe src={putar} title={video.judul} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              ) : putar ? (
                <video src={putar} controls autoPlay playsInline />
              ) : null}
            </div>
            {video.teks && <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.6, color: "var(--ink-soft, #5e5750)", whiteSpace: "pre-line" }}>{video.teks}</p>}
          </div>
        )}
      </Modal>

      <Modal open={!!gambarBesar} onClose={() => setGambarBesar(null)} maxWidth="960px">
        {gambarBesar?.gambar_url && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h3 style={{ margin: "0 44px 0 0", fontSize: "17px", fontWeight: 800 }}>{gambarBesar.judul}</h3>
            {/* eslint-disable-next-line @next/next/no-img-element -- gambar Cloudinary */}
            <img className="pgm-gambar-besar" src={gambarBesar.gambar_url} alt={gambarBesar.judul} />
          </div>
        )}
      </Modal>
    </div>
  );
}
