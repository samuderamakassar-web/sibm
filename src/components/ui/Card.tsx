import { ReactNode, CSSProperties } from "react";

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  padded?: boolean;
}

export default function Card({ children, style, padded = true }: CardProps) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: "20px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
        padding: padded ? "25px" : undefined,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}