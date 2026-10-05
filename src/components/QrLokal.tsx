"use client";

/**
 * QR digambar di perangkat (paket `qrcode`) -- tidak bergantung ke api.qrserver.com, jadi QR serah terima
 * tetap muncul walau sinyal lemah / layanan luar down (tukar shift tidak boleh tertunda karena gambar QR).
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrLokal({ data, size = 220, style }: { data: string; size?: number; style?: React.CSSProperties }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let batal = false;
    QRCode.toDataURL(data, { width: size * 2, margin: 1, errorCorrectionLevel: "M" })
      .then((u) => { if (!batal) setSrc(u); })
      .catch((e) => console.error("[QR] gagal membuat:", e));
    return () => { batal = true; };
  }, [data, size]);
  if (!src) return <div style={{ width: size, height: size, margin: "0 auto", display: "grid", placeItems: "center", fontSize: "13px", color: "var(--muted)", ...style }}>Menyiapkan QR...</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR serah terima" width={size} height={size} style={{ display: "block", margin: "0 auto", background: "#fff", ...style }} />;
}
