import { ReactNode, CSSProperties } from "react";

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_COLORS: Record<BadgeTone, { bg: string; color: string }> = {
  // §141 token tema (admin-theme.css) + fallback warna lama bila dipakai di luar .sibm-admin
  success: { bg: "var(--ok-50, #c6f6d5)", color: "var(--ok, #22543d)" },
  warning: { bg: "var(--warn-50, #feebc8)", color: "var(--warn, #9c4221)" },
  danger: { bg: "var(--red-50, #fed7d7)", color: "var(--red-600, #9b2c2c)" },
  info: { bg: "var(--info-50, #bee3f8)", color: "var(--info, #2b6cb0)" },
  neutral: { bg: "var(--line, #edf2f7)", color: "var(--ink-soft, #4a5568)" },
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  style?: CSSProperties;
}

export default function Badge({ children, tone = "neutral", style }: BadgeProps) {
  const colors = TONE_COLORS[tone];
  return (
    <span
      style={{
        display: "inline-block",
        background: colors.bg,
        color: colors.color,
        padding: "4px 10px",
        borderRadius: "8px",
        fontSize: "11px",
        fontWeight: "bold",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}