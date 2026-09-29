// Kotak "bento" dasar untuk isi halaman admin -- pengganti Card lama (shadow tebal) di
// halaman yang sudah dimigrasi ke AdminShell. Warna ikut token tema (terang/gelap).
import type { CSSProperties, ElementType, ReactNode } from "react";

interface TileProps {
  children: ReactNode;
  /** "brand" = latar merah SIBM dengan teks putih (dipakai hemat, mis. kartu sapaan). */
  variant?: "plain" | "brand";
  compact?: boolean;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

export default function Tile({ children, variant = "plain", compact = false, as: Tag = "section", className, style }: TileProps) {
  const kelas = ["sa-tile", variant === "brand" ? "is-brand" : "", compact ? "is-compact" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={kelas} style={style}>
      {children}
    </Tag>
  );
}
