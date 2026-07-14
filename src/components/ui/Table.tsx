import { ReactNode, CSSProperties } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead style={{ background: "#f8fafc", color: "#4a5568" }}>{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <tr style={{ borderBottom: "1px solid #edf2f7", ...style }}>{children}</tr>;
}

export function Th({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <th style={{ padding: "15px", borderBottom: "2px solid #e2e8f0", ...style }}>{children}</th>;
}

export function Td({ children, style, colSpan }: { children: ReactNode; style?: CSSProperties; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ padding: "12px 15px", ...style }}>
      {children}
    </td>
  );
}