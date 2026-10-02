"use client";

/**
 * Pemilih wilayah untuk Super Admin (akun daerah "PUSAT") -- multi-daerah fase 2 tahap 1 (§78).
 * Tahap 1: pilihan ini menentukan `daerah` data BARU yang ditulis Super Admin (lihat daerahTulis()).
 * Penyaringan tampilan per wilayah menyusul di tahap 2. Tidak tampil untuk akun selain PUSAT.
 */

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { DAERAH_DEFAULT, DAERAH_PUSAT, setWilayahAktifSuperAdmin, wilayahAktifSuperAdmin } from "../../lib/daerah";

export default function PemilihWilayah() {
  const [superAdmin, setSuperAdmin] = useState(false);
  const [aktif, setAktif] = useState(DAERAH_DEFAULT);
  const [daftar, setDaftar] = useState<string[]>([DAERAH_DEFAULT]);

  useEffect(() => {
    let isSuper = false;
    try { isSuper = localStorage.getItem("pic_daerah") === DAERAH_PUSAT; } catch { /* abaikan */ }
    if (!isSuper) return;
    // Daftar wilayah = daerah yang dipakai akun staf (users_master), selain PUSAT.
    getDocs(collection(db, "users_master")).then((snap) => {
      const set = new Set<string>([DAERAH_DEFAULT]);
      snap.docs.forEach((d) => { const v = d.data().daerah; if (v && v !== DAERAH_PUSAT) set.add(v); });
      setDaftar(Array.from(set).sort());
    }).catch((err) => console.error("[wilayah] Gagal memuat daftar wilayah:", err));
    const t = setTimeout(() => { setSuperAdmin(true); setAktif(wilayahAktifSuperAdmin()); }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!superAdmin) return null;
  return (
    <select
      className="sa-field sa-hide-mobile"
      aria-label="Wilayah aktif (Super Admin)"
      title="Wilayah aktif: data baru yang Anda buat dicatat untuk wilayah ini"
      value={aktif}
      onChange={(e) => { setWilayahAktifSuperAdmin(e.target.value); setAktif(e.target.value); }}
      style={{ height: "40px", fontWeight: 700, color: "var(--ink)" }}
    >
      {daftar.map((d) => <option key={d} value={d}>Wilayah: {d}</option>)}
    </select>
  );
}
