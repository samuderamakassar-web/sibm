import { ReactNode, CSSProperties } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--ui-line, #e2e8f0)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead style={{ background: "var(--ui-field-bg, #f8fafc)", color: "var(--ui-label, #4a5568)" }}>{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children, style, onClick }: { children: ReactNode; style?: CSSProperties; onClick?: () => void }) {
  return <tr onClick={onClick} style={{ borderBottom: "1px solid var(--ui-hover, #edf2f7)", cursor: onClick ? "pointer" : undefined, ...style }}>{children}</tr>;
}

export function Th({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <th style={{ padding: "15px", borderBottom: "2px solid var(--ui-line, #e2e8f0)", ...style }}>{children}</th>;
}

export function Td({ children, style, colSpan }: { children: ReactNode; style?: CSSProperties; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ padding: "12px 15px", ...style }}>
      {children}
    </td>
  );
}