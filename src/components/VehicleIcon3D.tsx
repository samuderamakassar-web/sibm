"use client";

// ==========================================
// ICON KENDARAAN 3D (isometric-style, warna dinamis)
// Dipakai di portal utama (page.tsx) & admin/kendaraan (form input + tabel)
// ==========================================

export const KATEGORI_KENDARAAN = ["Sedan", "SUV/MPV", "Pickup", "Truck", "Motor"] as const;
export type JenisKendaraan = (typeof KATEGORI_KENDARAAN)[number] | "Mobil";

export const WARNA_KENDARAAN = [
  { label: "Putih", hex: "#f1f5f9" },
  { label: "Hitam", hex: "#2d3748" },
  { label: "Silver/Abu-abu", hex: "#a0aec0" },
  { label: "Merah", hex: "#e53e3e" },
  { label: "Biru", hex: "#3182ce" },
  { label: "Hijau", hex: "#38a169" },
  { label: "Kuning", hex: "#ecc94b" },
  { label: "Oranye", hex: "#dd6b20" },
  { label: "Coklat", hex: "#8b5a2b" },
  { label: "Ungu", hex: "#805ad5" },
  { label: "Maroon", hex: "#822727" },
  { label: "Emas/Gold", hex: "#d69e2e" },
];

const WARNA_HEX_MAP: Record<string, string> = WARNA_KENDARAAN.reduce((acc, w) => {
  acc[w.label.toLowerCase()] = w.hex;
  return acc;
}, {} as Record<string, string>);
// alias tambahan biar data lama/variasi penulisan tetap cocok
WARNA_HEX_MAP["abu"] = "#a0aec0";
WARNA_HEX_MAP["abu-abu"] = "#a0aec0";
WARNA_HEX_MAP["silver"] = "#a0aec0";
WARNA_HEX_MAP["cokelat"] = "#8b5a2b";
WARNA_HEX_MAP["orange"] = "#dd6b20";
WARNA_HEX_MAP["gold"] = "#d69e2e";
WARNA_HEX_MAP["emas"] = "#d69e2e";

export function warnaToHex(warna?: string): string {
  if (!warna) return "#a0aec0";
  const w = warna.trim().toLowerCase();
  if (w.startsWith("#")) return warna;
  return WARNA_HEX_MAP[w] || "#a0aec0";
}

// Gelapkan/terangkan hex sekian persen — buat efek shading isometric sederhana
export function shadeHex(hex: string, percent: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const num = parseInt(h, 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

export default function VehicleIcon3D({ jenis, warna, size = 34 }: { jenis?: string; warna?: string; size?: number }) {
  const base = warnaToHex(warna);
  const light = shadeHex(base, 18);
  const dark = shadeHex(base, -22);
  const glass = "#cbd5e0";
  const j = (jenis || "Mobil") as JenisKendaraan;

  // Body kendaraan berbeda per kategori, semua pakai skema 3-tone (light/base/dark) buat kesan isometric 3D
  const renderBody = () => {
    if (j === "Motor") {
      return (
        <g>
          <ellipse cx="17" cy="26" rx="13" ry="3" fill="#000" opacity="0.12" />
          <path d="M5 20 L9 14 L18 13 L23 17 L27 18 L27 21 L23 21 L20 24 L12 24 L10 21 L6 21 Z" fill={base} stroke={dark} strokeWidth="1" />
          <path d="M9 14 L18 13 L20 16 L11 17 Z" fill={light} />
          <circle cx="10" cy="24" r="4" fill="#2d3748" />
          <circle cx="24" cy="23" r="4" fill="#2d3748" />
          <circle cx="10" cy="24" r="1.4" fill="#a0aec0" />
          <circle cx="24" cy="23" r="1.4" fill="#a0aec0" />
        </g>
      );
    }
    if (j === "Truck") {
      return (
        <g>
          <ellipse cx="17" cy="27" rx="14" ry="2.5" fill="#000" opacity="0.12" />
          <rect x="3" y="14" width="15" height="11" rx="1.5" fill={base} stroke={dark} strokeWidth="1" />
          <rect x="3" y="14" width="15" height="4" fill={light} />
          <path d="M18 16 L27 16 L30 21 L30 25 L18 25 Z" fill={dark} stroke={dark} strokeWidth="1" />
          <rect x="20" y="17.5" width="6" height="4" rx="0.5" fill={glass} />
          <circle cx="9" cy="26" r="3.2" fill="#2d3748" />
          <circle cx="25" cy="26" r="3.2" fill="#2d3748" />
          <circle cx="9" cy="26" r="1.1" fill="#a0aec0" />
          <circle cx="25" cy="26" r="1.1" fill="#a0aec0" />
        </g>
      );
    }
    if (j === "Pickup") {
      return (
        <g>
          <ellipse cx="17" cy="26" rx="14" ry="2.5" fill="#000" opacity="0.12" />
          <path d="M3 17 L11 17 L14 12 L21 12 L21 17 L20 20 L3 20 Z" fill={base} stroke={dark} strokeWidth="1" />
          <path d="M14 12 L21 12 L21 15 L12 15 Z" fill={light} />
          <rect x="12.5" y="13" width="7" height="3.5" rx="0.5" fill={glass} />
          <rect x="21" y="15" width="9" height="6" fill={dark} stroke={dark} strokeWidth="1" />
          <circle cx="9" cy="25" r="3.2" fill="#2d3748" />
          <circle cx="24" cy="25" r="3.2" fill="#2d3748" />
          <circle cx="9" cy="25" r="1.1" fill="#a0aec0" />
          <circle cx="24" cy="25" r="1.1" fill="#a0aec0" />
        </g>
      );
    }
    if (j === "SUV/MPV") {
      return (
        <g>
          <ellipse cx="17" cy="26" rx="15" ry="2.5" fill="#000" opacity="0.12" />
          <path d="M2 20 L4 13 L10 10 L24 10 L28 13 L30 20 L28 22 L4 22 Z" fill={base} stroke={dark} strokeWidth="1" />
          <path d="M6 13 L10 10.5 L24 10.5 L27 13 Z" fill={light} />
          <rect x="7" y="12" width="6.5" height="4" rx="0.5" fill={glass} />
          <rect x="19.5" y="12" width="6.5" height="4" rx="0.5" fill={glass} />
          <circle cx="9" cy="23" r="3.4" fill="#2d3748" />
          <circle cx="24" cy="23" r="3.4" fill="#2d3748" />
          <circle cx="9" cy="23" r="1.2" fill="#a0aec0" />
          <circle cx="24" cy="23" r="1.2" fill="#a0aec0" />
        </g>
      );
    }
    // Sedan / Mobil (default/fallback)
    return (
      <g>
        <ellipse cx="17" cy="25" rx="15" ry="2.5" fill="#000" opacity="0.12" />
        <path d="M2 19 L4 14 L9 11 L23 11 L27 14 L30 19 L28 21 L4 21 Z" fill={base} stroke={dark} strokeWidth="1" />
        <path d="M8 14 L11 11.5 L21 11.5 L24 14 Z" fill={light} />
        <rect x="9" y="13" width="6" height="3.5" rx="0.5" fill={glass} />
        <rect x="17" y="13" width="6" height="3.5" rx="0.5" fill={glass} />
        <circle cx="9" cy="22" r="3.2" fill="#2d3748" />
        <circle cx="23" cy="22" r="3.2" fill="#2d3748" />
        <circle cx="9" cy="22" r="1.1" fill="#a0aec0" />
        <circle cx="23" cy="22" r="1.1" fill="#a0aec0" />
      </g>
    );
  };

  return (
    <svg width={size} height={size} viewBox="0 0 34 30" style={{ flexShrink: 0 }}>
      {renderBody()}
    </svg>
  );
}