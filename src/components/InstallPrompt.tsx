"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Taruh <InstallPrompt /> sekali di root layout (src/app/layout.tsx)
// supaya muncul di semua halaman.
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [tampil, setTampil] = useState(false);

  useEffect(() => {
    // Jangan tampilkan lagi kalau user pernah dismiss dalam 7 hari terakhir
    const lastDismiss = localStorage.getItem("install_prompt_dismissed_at");
    if (lastDismiss && Date.now() - Number(lastDismiss) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTampil(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setTampil(false);
  };

  const handleTutup = () => {
    localStorage.setItem("install_prompt_dismissed_at", String(Date.now()));
    setTampil(false);
  };

  if (!tampil) return null;

  return (
    <div style={{ position: "fixed", bottom: "16px", left: "16px", right: "16px", maxWidth: "500px", margin: "0 auto", background: "#234e52", color: "white", borderRadius: "16px", padding: "16px 18px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)", zIndex: 1000 }}>
      <span style={{ fontSize: "28px" }}>📲</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: "bold", fontSize: "14px" }}>Install aplikasi ini?</div>
        <div style={{ fontSize: "12px", opacity: 0.85 }}>Biar lebih cepat diakses & bisa terima notifikasi.</div>
      </div>
      <button onClick={handleTutup} style={{ background: "transparent", border: "none", color: "white", opacity: 0.7, fontSize: "13px", cursor: "pointer", padding: "8px" }}>Nanti</button>
      <button onClick={handleInstall} style={{ background: "#319795", border: "none", color: "white", fontWeight: "bold", fontSize: "13px", padding: "10px 16px", borderRadius: "10px", cursor: "pointer" }}>Install</button>
    </div>
  );
}