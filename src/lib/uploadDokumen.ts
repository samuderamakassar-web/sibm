// Upload dokumen (PDF/Word/gambar/klip video) TANPA kompresi canvas — beda dari uploadFoto.ts yang khusus
// foto kamera. §187: disimpan di Firebase Storage (dokumen/...), bukan Cloudinary (PDF ditolak 401).
import { unggahKeStorage } from "./uploadFoto";

export async function uploadDokumen(file: File, folder: string): Promise<string> {
  if (file.size > MAX_UKURAN_DOKUMEN_MB * 1024 * 1024) throw new Error(`File ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas ${MAX_UKURAN_DOKUMEN_MB} MB.`);
  const tipe = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "application/octet-stream");
  return unggahKeStorage(file.type ? file : new Blob([file], { type: tipe }), `dokumen/${folder.replace(/^sibm\//, "")}`, file.name);
}

/** Batas ukuran dokumen (Storage rules: dokumen maks 25 MB). */
export const MAX_UKURAN_DOKUMEN_MB = 25;

/** Upload dokumen dari <input type="file"> — dipakai untuk upload SOP/IK. */
export function handleDokumenUpload(
  file: File,
  folder: string,
  onStart: () => void,
  onSuccess: (url: string, namaFile: string) => void,
  onError: (err: unknown) => void,
  onFinally: () => void
) {
  onStart();
  uploadDokumen(file, folder)
    .then((url) => onSuccess(url, file.name))
    .catch((err) => onError(err))
    .finally(() => onFinally());
}
