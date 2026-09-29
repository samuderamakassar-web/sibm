"use client";

import { useCallback, useSyncExternalStore } from "react";

// Pilihan tema admin disimpan PER PERANGKAT (localStorage), bukan di Firestore -- ini
// preferensi tampilan, bukan data. "system" (default) = ikut setelan HP/OS.
export type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = "sibm_admin_theme";
const CHANGE_EVENT = "sibm-admin-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // localStorage bisa diblokir (mode privat) -- anggap ikut sistem.
  }
  return "system";
}

// Snapshot berupa string "pref:resolved" supaya stabil antar-render (syarat
// useSyncExternalStore) sekaligus membawa 2 informasi yang dibutuhkan.
function getSnapshot(): string {
  const pref = readPref();
  const systemDark = window.matchMedia(DARK_QUERY).matches;
  const resolved = pref === "system" ? (systemDark ? "dark" : "light") : pref;
  return `${pref}:${resolved}`;
}

// Static export: HTML hasil build selalu dirender "ikut sistem" (tanpa data-theme), jadi
// CSS media query yang menentukan warna awal -- tidak ada kedip untuk mayoritas user.
function getServerSnapshot(): string {
  return "system:light";
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useAdminTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [pref, resolved] = snapshot.split(":") as [ThemePref, "light" | "dark"];

  const toggle = useCallback(() => {
    const next = resolved === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Gagal simpan (mode privat) -- pilihan tidak bisa diingat, tampilan tetap ikut
      // setelan sistem. Diam saja, bukan error yang perlu ditampilkan ke user.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [resolved]);

  return {
    pref,
    resolved,
    /** Nilai untuk atribut data-theme: undefined = biarkan CSS ikut setelan OS. */
    dataTheme: pref === "system" ? undefined : pref,
    toggle,
  };
}
