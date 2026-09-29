"use client";

import { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

type ButtonVariant = "primary" | "danger" | "warning" | "success" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

// Warna disamakan persis dengan yang sudah dipakai di seluruh Portal SIBM.
const VARIANT_COLORS: Record<ButtonVariant, { bg: string; bgHover: string; color: string; shadow: string; border?: string }> = {
  primary: { bg: "#e53e3e", bgHover: "#c53030", color: "white", shadow: "0 10px 15px -3px rgba(229,62,62,0.3)" },
  danger: { bg: "#e53e3e", bgHover: "#c53030", color: "white", shadow: "0 4px 6px rgba(229,62,62,0.2)" },
  warning: { bg: "#dd6b20", bgHover: "#c05621", color: "white", shadow: "0 4px 6px rgba(221,107,32,0.2)" },
  success: { bg: "#2f855a", bgHover: "#276749", color: "white", shadow: "0 10px 15px -3px rgba(47,133,90,0.3)" },
  secondary: { bg: "var(--ui-surface, white)", bgHover: "var(--ui-hover, #f7fafc)", color: "var(--ui-label, #718096)", shadow: "none", border: "1px solid var(--ui-field-border, #cbd5e0)" },
  ghost: { bg: "transparent", bgHover: "var(--ui-hover, #edf2f7)", color: "var(--ui-label, #4a5568)", shadow: "none" },
};

export default function Button({
  variant = "primary",
  loading = false,
  loadingText,
  fullWidth = true,
  children,
  disabled,
  style,
  onMouseOver,
  onMouseOut,
  ...rest
}: ButtonProps & { style?: CSSProperties }) {
  const isDisabled = disabled || loading;
  const colors = VARIANT_COLORS[variant];

  return (
    <button
      disabled={isDisabled}
      style={{
        width: fullWidth ? "100%" : undefined,
        padding: "14px 20px",
        borderRadius: "12px",
        border: colors.border || "none",
        fontWeight: "bold",
        fontSize: "14px",
        cursor: isDisabled ? "not-allowed" : "pointer",
        background: isDisabled ? "#a0aec0" : colors.bg,
        color: isDisabled ? "white" : colors.color,
        boxShadow: isDisabled ? "none" : colors.shadow,
        transition: "all 0.2s",
        ...style,
      }}
      onMouseOver={(e) => {
        if (!isDisabled) e.currentTarget.style.background = colors.bgHover;
        onMouseOver?.(e);
      }}
      onMouseOut={(e) => {
        if (!isDisabled) e.currentTarget.style.background = colors.bg;
        onMouseOut?.(e);
      }}
      {...rest}
    >
      {loading ? loadingText || "Memproses..." : children}
    </button>
  );
}