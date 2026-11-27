// §187 Semua foto & dokumen disimpan di Firebase Storage (Blaze), bukan Cloudinary lagi.
// Cloudinary paket gratis menolak menampilkan PDF (401), jadi dokumen SOP/legal tidak muncul.
// Path: foto/<folder>/... (akun staf login), publik/<folder>/... (portal tanpa login, gambar kecil saja).
// Yang disimpan di Firestore tetap URL unduhan (getDownloadURL) -- bisa dipakai langsung di <img>/<iframe>.
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "./firebase";

const EKSTENSI: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

/** Unggah blob/file ke Storage dan kembalikan URL unduhannya. `folder` boleh diawali "sibm/" (format lama). */
export async function unggahKeStorage(blob: Blob, folder: string, namaFile?: string): Promise<string> {
  const login = !!auth.currentUser;
  const sub = folder.replace(/^sibm\//, "").replace(/[^\w\-/]+/g, "_") || "lain";
  const tipe = blob.type || "application/octet-stream";
  const asli = (namaFile || "").replace(/[^\w.\-]+/g, "_").slice(-60);
  const nama = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}${asli ? `_${asli}` : `.${EKSTENSI[tipe] || "bin"}`}`;
  const akar = !login ? `publik/${sub}` : sub.startsWith("dokumen/") ? sub : `foto/${sub}`;
  const r = ref(storage, `${akar}/${nama}`);
  try {
    await uploadBytes(r, blob, { contentType: tipe });
  } catch (e) {
    const kode = (e as { code?: string }).code || "";
    if (kode.includes("unauthorized")) throw new Error("Upload ditolak (format/ukuran file tidak diizinkan atau belum login).");
    throw new Error("Upload file gagal. Cek koneksi lalu coba lagi.");
  }
  return getDownloadURL(r);
}

export async function uploadFoto(blob: Blob, folder: string): Promise<string> {
  return unggahKeStorage(blob, folder);
}

/** Kompres & upload foto dari <input type="file"> — dipakai untuk foto inspeksi & foto bukti servis/emisi. */
export function handleFotoUpload(
  file: File,
  folder: string,
  onStart: () => void,
  onSuccess: (url: string) => void,
  onError: (err: unknown) => void,
  onFinally: () => void
) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 600 / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        onStart();
        try {
          const url = await uploadFoto(blob, folder);
          onSuccess(url);
        } catch (err) {
          onError(err);
        } finally {
          onFinally();
        }
      }, "image/jpeg", 0.8);
    };
    img.src = ev.target?.result as string;
  };
  reader.readAsDataURL(file);
}

/**
 * §69: foto yang masih berupa data URL (base64) diunggah dan dikembalikan URL-nya (supaya dokumen
 * Firestore tidak membawa ratusan KB gambar). Nilai yang sudah URL (atau kosong) dikembalikan apa adanya.
 */
export async function dataUrlKeStorage(nilai: string, folder: string): Promise<string> {
  if (!nilai || !nilai.startsWith("data:")) return nilai;
  const blob = await (await fetch(nilai)).blob();
  return uploadFoto(blob, folder);
}
