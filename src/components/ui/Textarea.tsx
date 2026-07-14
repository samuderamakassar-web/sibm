"use client";

import { TextareaHTMLAttributes, forwardRef, CSSProperties } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  containerStyle?: CSSProperties;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, style, containerStyle, ...rest }, ref) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", ...containerStyle }}>
        {label && <label style={{ fontSize: "12px", fontWeight: "bold", color: "#4a5568" }}>{label}</label>}
        <textarea
          ref={ref}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid #cbd5e0",
            fontSize: "14px",
            background: "#f8fafc",
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
            ...style,
          }}
          {...rest}
        />
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
export default Textarea;