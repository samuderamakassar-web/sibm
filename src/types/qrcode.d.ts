// Deklarasi minimal paket `qrcode` (tanpa @types) -- hanya yang dipakai QrLokal.tsx.
declare module "qrcode" {
  interface OpsiQR { width?: number; margin?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H" }
  const QRCode: { toDataURL(data: string, opsi?: OpsiQR): Promise<string> };
  export default QRCode;
}
