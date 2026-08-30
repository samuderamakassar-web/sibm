// Upload dokumen (PDF/Word/gambar) ke Cloudinary TANPA kompresi canvas — beda dari uploadFoto.ts
// yang khusus foto kamera. Dipakai oleh Admin > Update Dokumen SOP.
export async function uploadDokumenToCloudinary(file: File, folder: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
  formData.append("folder", folder);

  // Endpoint /auto/upload dipakai (bukan /image/upload) supaya PDF & file Word juga diterima, bukan cuma gambar.
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/auto/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Upload dokumen gagal");
  const data = await res.json();
  return data.secure_url as string;
}

/** Kompres & upload dokumen dari <input type="file"> — dipakai untuk upload SOP/IK. */
export function handleDokumenUpload(
  file: File,
  folder: string,
  onStart: () => void,
  onSuccess: (url: string, namaFile: string) => void,
  onError: (err: unknown) => void,
  onFinally: () => void
) {
  onStart();
  uploadDokumenToCloudinary(file, folder)
    .then((url) => onSuccess(url, file.name))
    .catch((err) => onError(err))
    .finally(() => onFinally());
}
