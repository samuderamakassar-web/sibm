"use client";

import { SelectHTMLAttributes, forwardRef, ReactNode, CSSProperties } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
  containerStyle?: CSSProperties;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, style, containerStyle, children, ...rest }, ref) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", ...containerStyle }}>
        {label && <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568" }}>{label}</label>}
        <select
          ref={ref}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid #cbd5e0",
            fontSize: "14px",
            fontWeight: "bold",
            color: "#2d3748",
            background: "#f8fafc",
            outline: "none",
            cursor: "pointer",
            boxSizing: "border-box",
            ...style,
          }}
          {...rest}
        >
          {children}
        </select>
      </div>
    );
  }
);

Select.displayName = "Select";
export default Select;