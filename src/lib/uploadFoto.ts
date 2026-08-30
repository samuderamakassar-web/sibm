// Helper upload foto ke Cloudinary — dipakai bareng oleh beberapa halaman Driver
// (inspeksi mingguan & laporan servis/uji emisi) yang sebelumnya nyalin fungsi yang sama.
export async function uploadFotoToCloudinary(blob: Blob, folder: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
  formData.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Upload ke Cloudinary gagal");
  const data = await res.json();
  return data.secure_url as string;
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
          const url = await uploadFotoToCloudinary(blob, folder);
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
