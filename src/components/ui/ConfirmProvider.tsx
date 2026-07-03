"use client";

/**
 * src/components/ui/ConfirmProvider.tsx
 * ------------------------------------------------------------------
 * Pengganti window.confirm() bawaan browser. Modal konfirmasi yang
 * lebih modern & bisa dikustomisasi (judul, teks tombol, warna
 * bahaya untuk aksi hapus/tolak).
 *
 * CARA PAKAI:
 * 1. Bungkus aplikasi dengan <ConfirmProvider> di src/app/layout.tsx
 *    (boleh nested di dalam <ToastProvider>, urutan tidak masalah)
 * 2. Di halaman manapun:
 *      const confirm = useConfirm();
 *
 *      // Cara singkat (mirip window.confirm lama):
 *      const ok = await confirm("Yakin ingin menghapus data ini?");
 *
 *      // Cara lengkap dengan opsi:
 *      const ok = await confirm({
 *        title: "Hapus Karyawan",
 *        message: `Yakin ingin menghapus ${nama}?`,
 *        confirmText: "Ya, Hapus",
 *        variant: "danger"
 *      });
 *
 *      if (ok) { ...lanjutkan aksi... }
 * ------------------------------------------------------------------
 */

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm: ConfirmFn = useCallback((options) => {
    const opts: ConfirmOptions = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setState({ options: opts, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  const variant = state?.options.variant || "default";
  const accentColor = variant === "danger" ? "#e53e3e" : "#3182ce";
  const accentShadow = variant === "danger" ? "rgba(229,62,62,0.3)" : "rgba(49,130,206,0.3)";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {state && (
        <div
          onClick={() => handleClose(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 10000, padding: "20px", backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: "16px", padding: "24px",
              maxWidth: "380px", width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              fontFamily: "'Inter', sans-serif",
              animation: "sibm-confirm-in 0.2s ease-out",
            }}
          >
            {state.options.title && (
              <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#1a202c", fontWeight: 800 }}>
                {state.options.title}
              </h3>
            )}
            <p style={{ margin: "0 0 20px 0", fontSize: "14px", color: "#4a5568", lineHeight: 1.5 }}>
              {state.options.message}
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => handleClose(false)}
                style={{
                  padding: "10px 18px", borderRadius: "10px", border: "1px solid #cbd5e0",
                  background: "white", color: "#4a5568", fontWeight: 700, fontSize: "13px", cursor: "pointer",
                }}
              >
                {state.options.cancelText || "Batal"}
              </button>
              <button
                onClick={() => handleClose(true)}
                style={{
                  padding: "10px 18px", borderRadius: "10px", border: "none",
                  background: accentColor, color: "white", fontWeight: 700, fontSize: "13px", cursor: "pointer",
                  boxShadow: `0 4px 6px ${accentShadow}`,
                }}
              >
                {state.options.confirmText || "Ya, Lanjutkan"}
              </button>
            </div>
          </div>

          <style jsx global>{`
            @keyframes sibm-confirm-in {
              from { opacity: 0; transform: scale(0.95); }
              to   { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** Hook: const confirm = useConfirm(); const ok = await confirm("Yakin?"); */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm() harus dipakai di dalam <ConfirmProvider>. Cek src/app/layout.tsx.");
  return ctx;
}