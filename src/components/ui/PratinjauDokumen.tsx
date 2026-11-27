"use client";

/**
 * §187 Pratinjau dokumen satu pintu: modal (bukan tab baru) + Print + Unduh.
 * Dipanggil dari mana saja: bukaDokumen({ url | path | blob, nama }).
 * - path  = file privat Firebase Storage (legal/, tagihan/, asbuilt/) -> getBlob lewat rules
 * - url   = URL unduhan Storage / URL lama (Cloudinary). Cloudinary menolak PDF (401) -> pesan jelas.
 * PDF dirender per halaman dengan pdf.js (iframe PDF tidak tampil di Chrome Android), jadi sama di HP & laptop.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";

export interface SumberDokumen { url?: string; path?: string; blob?: Blob; nama?: string; judul?: string }

type Pendengar = (s: SumberDokumen) => void;
let pendengar: Pendengar | null = null;

/** Buka modal pratinjau. Bila host belum terpasang (mis. halaman di luar layout), jatuh ke tab baru. */
export function bukaDokumen(s: SumberDokumen) {
  if (pendengar) { pendengar(s); return; }
  if (s.url) window.open(s.url, "_blank", "noopener");
}

/** URL file tersimpan (Storage / Cloudinary / .pdf) -> dibuka di modal; link biasa (YouTube, Drive) tetap tab baru. */
export function adalahFileTersimpan(url?: string): boolean {
  return !!url && /firebasestorage\.googleapis\.com|res\.cloudinary\.com|\.(pdf|png|jpe?g|webp)(\?|$)/i.test(url);
}

/** Pasang di onClick <a href=...>: file tersimpan dibuka di modal, selain itu biarkan link berjalan biasa. */
export function klikDokumen(url?: string, nama?: string) {
  return (e: { preventDefault: () => void }) => {
    if (!adalahFileTersimpan(url)) return;
    e.preventDefault();
    bukaDokumen({ url, nama });
  };
}

const MAKS_HALAMAN = 40;

function jenisDari(nama: string, tipe: string): "pdf" | "gambar" | "video" | "lain" {
  const n = nama.toLowerCase().split("?")[0];
  if (tipe === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (tipe.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/.test(n)) return "gambar";
  if (tipe.startsWith("video/") || /\.(mp4|webm|mov)$/.test(n)) return "video";
  return "lain";
}

function namaDariUrl(url: string): string {
  try {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname.split("/o/").pop() || u.pathname);
    return (p.split("/").pop() || "dokumen").replace(/^\d{10,}_[a-z0-9]{5}_/, "");
  } catch { return "dokumen"; }
}

async function ambilBlob(s: SumberDokumen): Promise<Blob> {
  if (s.blob) return s.blob;
  if (s.path) return getBlob(ref(storage, s.path));
  if (!s.url) throw new Error("Dokumen tidak punya file.");
  let res: Response;
  try { res = await fetch(s.url); } catch { throw new Error("File tidak bisa diunduh (koneksi atau izin akses)."); }
  if (!res.ok) {
    if (s.url.includes("res.cloudinary.com")) throw new Error("File lama ini masih di Cloudinary dan Cloudinary menolak menampilkannya. Unggah ulang dokumennya — file baru otomatis tersimpan di Firebase Storage.");
    throw new Error(res.status === 404 ? "File sudah tidak ada." : `File ditolak server (${res.status}).`);
  }
  return res.blob();
}

export default function PratinjauDokumenHost() {
  const [sumber, setSumber] = useState<SumberDokumen | null>(null);
  const [blobUrl, setBlobUrl] = useState("");
  const [jenis, setJenis] = useState<"pdf" | "gambar" | "video" | "lain">("lain");
  const [halaman, setHalaman] = useState<string[]>([]);
  const [totalHal, setTotalHal] = useState(0);
  const [status, setStatus] = useState<"muat" | "siap" | "galat">("muat");
  const [galat, setGalat] = useState("");
  const blobRef = useRef("");

  const tutup = useCallback(() => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = "";
    setSumber(null); setBlobUrl(""); setHalaman([]); setTotalHal(0); setGalat("");
  }, []);

  useEffect(() => {
    pendengar = (s) => { tutup(); setStatus("muat"); setSumber(s); };
    return () => { pendengar = null; };
  }, [tutup]);

  useEffect(() => {
    if (!sumber) return;
    let batal = false;
    (async () => {
      const nama = sumber.nama || (sumber.path ? sumber.path.split("/").pop() || "" : namaDariUrl(sumber.url || ""));
      try {
        let blob: Blob;
        try { blob = await ambilBlob(sumber); }
        catch (e) {
          // foto lama yang tidak bisa di-fetch (CORS) tetap bisa ditampilkan langsung lewat <img src=url>
          if (sumber.url && jenisDari(nama, "") === "gambar" && !batal) { setBlobUrl(sumber.url); setJenis("gambar"); setStatus("siap"); return; }
          throw e;
        }
        if (batal) return;
        const j = jenisDari(nama, blob.type);
        const u = URL.createObjectURL(blob);
        blobRef.current = u;
        setBlobUrl(u); setJenis(j);
        if (j === "pdf") {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
          const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
          setTotalHal(doc.numPages);
          const hasil: string[] = [];
          for (let p = 1; p <= Math.min(doc.numPages, MAKS_HALAMAN); p++) {
            if (batal) break;
            const page = await doc.getPage(p);
            const vp = page.getViewport({ scale: 1.6 });
            const c = document.createElement("canvas");
            c.width = vp.width; c.height = vp.height;
            await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
            hasil.push(c.toDataURL("image/jpeg", 0.9));
            if (!batal) setHalaman([...hasil]);
          }
          await doc.destroy();
        }
        if (!batal) setStatus("siap");
      } catch (e) {
        console.error(e);
        if (!batal) { setGalat((e as Error).message || "Dokumen gagal dibuka."); setStatus("galat"); }
      }
    })();
    return () => { batal = true; };
  }, [sumber]);

  useEffect(() => {
    if (!sumber) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") tutup(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sumber, tutup]);

  if (!sumber) return null;
  const nama = sumber.nama || (sumber.path ? sumber.path.split("/").pop() || "dokumen" : namaDariUrl(sumber.url || ""));

  const cetak = () => {
    const gambar = jenis === "pdf" ? halaman : jenis === "gambar" ? [blobUrl] : [];
    if (!gambar.length) return;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    const d = f.contentWindow!.document;
    d.open();
    d.write(`<!doctype html><html><head><title>${nama.replace(/</g, "")}</title><style>@page{margin:8mm}body{margin:0}img{display:block;width:100%;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style></head><body>${gambar.map((g) => `<img src="${g}">`).join("")}</body></html>`);
    d.close();
    const imgs = Array.from(d.images);
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = r; i.onerror = r; })))).then(() => {
      f.contentWindow!.focus();
      f.contentWindow!.print();
      setTimeout(() => f.remove(), 60000);
    });
  };
  const unduh = () => { const a = document.createElement("a"); a.href = blobUrl; a.download = nama; a.click(); };
  const bisaCetak = status === "siap" && (jenis === "gambar" || (jenis === "pdf" && halaman.length > 0));

  return (
    <div role="dialog" aria-modal="true" aria-label={`Pratinjau ${nama}`} onClick={tutup}
      style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,15,15,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: "12px" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface, #fff)", color: "var(--ink, #111)", borderRadius: "16px", width: "min(960px, 100%)", height: "min(92vh, 100%)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderBottom: "1px solid var(--line, #e5e5e5)", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sumber.judul || nama}</div>
            {jenis === "pdf" && totalHal > 0 && <div style={{ fontSize: "11.5px", color: "var(--muted, #777)" }}>{totalHal} halaman{totalHal > MAKS_HALAMAN ? ` — pratinjau & print ${MAKS_HALAMAN} halaman pertama, unduh untuk lengkapnya` : ""}</div>}
          </div>
          <button type="button" className="sa-btn is-primary" style={{ height: "34px" }} disabled={!bisaCetak} onClick={cetak}>🖨️ Print</button>
          <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} disabled={!blobUrl} onClick={unduh}>⬇ Unduh</button>
          <button type="button" className="sa-btn is-soft" style={{ height: "34px" }} onClick={tutup} aria-label="Tutup">✕</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", background: "var(--bg, #f3f3f3)", padding: "12px" }}>
          {status === "galat" && <div style={{ padding: "24px", textAlign: "center", color: "var(--red-600, #c00)", fontSize: "13.5px", lineHeight: 1.5 }}>⚠️ {galat}</div>}
          {status === "muat" && halaman.length === 0 && <div style={{ padding: "24px", textAlign: "center", color: "var(--muted, #777)", fontSize: "13px" }}>Memuat dokumen…</div>}
          {jenis === "pdf" && halaman.map((h, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- halaman PDF hasil render pdf.js (data URL)
            <img key={i} src={h} alt={`Halaman ${i + 1}`} style={{ display: "block", width: "100%", maxWidth: "860px", margin: "0 auto 12px", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,.15)" }} />
          ))}
          {status === "siap" && jenis === "gambar" && (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL lokal
            <img src={blobUrl} alt={nama} style={{ display: "block", maxWidth: "100%", margin: "0 auto" }} />
          )}
          {status === "siap" && jenis === "video" && <video src={blobUrl} controls style={{ display: "block", maxWidth: "100%", margin: "0 auto" }} />}
          {status === "siap" && jenis === "lain" && (
            <div style={{ padding: "24px", textAlign: "center", fontSize: "13.5px", color: "var(--ink-soft, #444)" }}>
              File {nama.split(".").pop()?.toUpperCase()} tidak bisa ditampilkan di browser. Tekan <b>Unduh</b> lalu buka di Word/Excel.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
