"use client";

/**
 * src/components/ui/ToastProvider.tsx
 * ------------------------------------------------------------------
 * Pengganti alert() bawaan browser. Notifikasi kecil yang muncul di
 * pojok kanan bawah, otomatis hilang setelah beberapa detik, dan
 * tidak memblokir interaksi pengguna (beda dengan alert() yang
 * menghentikan seluruh halaman sampai user klik OK).
 *
 * CARA PAKAI:
 * 1. Bungkus aplikasi dengan <ToastProvider> di src/app/layout.tsx
 * 2. Di halaman manapun: const showToast = useToast();
 *    showToast("Data berhasil disimpan!", "success");
 *    showToast("Gagal memperbarui data.", "error");
 * ------------------------------------------------------------------
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLES: Record<ToastType, { bg: string; text: string; border: string; icon: string }> = {
  success: { bg: "#f0fff4", text: "#22543d", border: "#c6f6d5", icon: "✅" },
  error:   { bg: "#fff5f5", text: "#822727", border: "#fed7d7", icon: "⛔" },
  warning: { bg: "#fffaf0", text: "#7b341e", border: "#feebc8", icon: "⚠️" },
  info:    { bg: "#ebf8ff", text: "#2c5282", border: "#bee3f8", icon: "ℹ️" },
};

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++idCounter;
    setToasts(prev => [...prev, { id, type, message }]);
    timers.current[id] = setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      Object.values(currentTimers).forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          maxWidth: "360px",
          width: "calc(100% - 40px)",
          pointerEvents: "none",
        }}
      >
        {toasts.map(t => {
          const s = TOAST_STYLES[t.type];
          return (
            <div
              key={t.id}
              onClick={() => removeToast(t.id)}
              style={{
                background: s.bg,
                color: s.text,
                border: `1px solid ${s.border}`,
                borderRadius: "12px",
                padding: "14px 16px",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
                cursor: "pointer",
                pointerEvents: "auto",
                animation: "sibm-toast-in 0.25s ease-out",
              }}
            >
              <span style={{ fontSize: "16px", lineHeight: 1 }}>{s.icon}</span>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
              <span style={{ opacity: 0.5, fontSize: "12px" }}>✖</span>
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        @keyframes sibm-toast-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

/** Hook: const showToast = useToast(); showToast("Pesan...", "success"); */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() harus dipakai di dalam <ToastProvider>. Cek src/app/layout.tsx.");
  return ctx.showToast;
}