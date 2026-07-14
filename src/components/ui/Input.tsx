"use client";

import { InputHTMLAttributes, forwardRef, CSSProperties } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  datalistId?: string;
  datalistOptions?: string[];
  containerStyle?: CSSProperties;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, datalistId, datalistOptions, style, containerStyle, ...rest }, ref) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", ...containerStyle }}>
        {label && <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568" }}>{label}</label>}

        <input
          ref={ref}
          list={datalistId}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid #cbd5e0",
            fontSize: "14px",
            background: "#f8fafc",
            outline: "none",
            boxSizing: "border-box",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
            transition: "all 0.2s",
            ...style,
          }}
          {...rest}
        />

        {datalistId && datalistOptions && (
          <datalist id={datalistId}>
            {datalistOptions.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        )}

        {hint && <span style={{ fontSize: "11px", color: "#a0aec0" }}>{hint}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;