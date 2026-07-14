import { ReactNode, CSSProperties } from "react";

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_COLORS: Record<BadgeTone, { bg: string; color: string }> = {
  success: { bg: "#c6f6d5", color: "#22543d" },
  warning: { bg: "#feebc8", color: "#9c4221" },
  danger: { bg: "#fed7d7", color: "#9b2c2c" },
  info: { bg: "#bee3f8", color: "#2b6cb0" },
  neutral: { bg: "#edf2f7", color: "#4a5568" },
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