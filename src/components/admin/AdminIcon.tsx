// Set ikon garis bersama untuk semua halaman admin/* -- menggantikan puluhan komponen
// IconXxx yang selama ini didefinisikan ulang di tiap file halaman. Path diambil dari set
// yang sudah dipakai di admin/page.tsx supaya tampilan ikon tidak berubah saat migrasi.
import type { CSSProperties, ReactNode } from "react";

const PATHS = {
  userCircle: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9.5 21v-6h5v6" /></>,
  idCard: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M6 16c.5-1.7 1.6-2.5 2.5-2.5s2 .8 2.5 2.5" /><path d="M14 10h5" /><path d="M14 13.5h5" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6" /><path d="M9 15h6" /><path d="M9 19h3" /></>,
  clipboardList: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 12h6M9 16h4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.6 5l-6 6 2.6 2.6 6-6a4 4 0 0 0 5.6-5.6l-3 3-2.6-2.6 3-3z" />,
  truck: <><path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13" /><rect x="3" y="13" width="18" height="5" rx="1.5" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" /></>,
  car: <><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" /><rect x="3" y="11" width="18" height="6" rx="1.5" /><circle cx="7.5" cy="17" r="1.5" /><circle cx="16.5" cy="17" r="1.5" /></>,
  shield: <path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3z" />,
  graduationCap: <><path d="m22 10-10-5L2 10l10 5 10-5z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></>,
  activity: <path d="M3 12h4l2 8 4-16 2 8h6" />,
  building: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 21v-4h6v4" /><path d="M8 7h1" /><path d="M8 11h1" /><path d="M8 15h1" /><path d="M15 7h1" /><path d="M15 11h1" /></>,
  megaphone: <><path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1z" /><path d="M15 8a4 4 0 0 1 0 8" /><path d="M18 5a7.5 7.5 0 0 1 0 14" /></>,
  broom: <><path d="M19 3 11 11" /><path d="M11 11 4 18" /><path d="M4 18l-1.5 3.5L6 20" /><path d="M6.5 15.5 8 17" /><path d="M9 12.5 10.5 14" /></>,
  printer: <><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M6 17v4h12v-4" /></>,
  fileText: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5" /><path d="M9.5 16.5h5" /></>,
  fireExtinguisher: <><path d="M11 3v2" /><path d="M8 5h6l1 2H7z" /><path d="M9 7v3" /><path d="M15 7l4-2" /><path d="M9 10h4a3 3 0 0 1 3 3v8H8v-8a3 3 0 0 1 1-2z" /><path d="M8 15h8" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  droplet: <path d="M12 2s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z" />,
  trophy: <><path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4" /><path d="M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4" /></>,
  laptop: <><rect x="4" y="4" width="16" height="11" rx="1.5" /><path d="M2 19h20" /><path d="M9 19l1-2h4l1 2" /></>,
  stamp: <><path d="M8 3h8l2 6H6l2-6z" /><path d="M10 9v4a2 2 0 0 0 4 0V9" /><path d="M4 21l1.5-5h13L20 21" /><path d="M4 21h16" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></>,
  box: <><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>,
  swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  arrowLeft: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  arrowRight: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  logOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
} satisfies Record<string, ReactNode>;

export type AdminIconName = keyof typeof PATHS;

interface AdminIconProps {
  name: AdminIconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: CSSProperties;
}

export default function AdminIcon({ name, size = 18, strokeWidth = 1.8, color = "currentColor", style }: AdminIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}
