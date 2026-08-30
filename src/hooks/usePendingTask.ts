"use client";

/**
 * src/hooks/usePendingTask.ts
 * ------------------------------------------------------------------
 * Hook generik untuk banner pengingat persisten (StickyBanner). Alih-alih
 * menyimpan status "sudah dibaca" di Firestore, hook ini query LANGSUNG
 * ke koleksi sumber data (mis. security_patrols, apar_units, ob_checklists)
 * lewat onSnapshot, lalu memanggil `isComplete(docs)` untuk menentukan
 * apakah tugas sudah selesai -- reaktif, hilang otomatis begitu syarat
 * terpenuhi, tanpa perlu flag "dibaca" yang bisa ke-skip.
 *
 * `queryBuilder` dipanggil ulang tiap kali `deps` berubah (pola sama
 * seperti useEffect biasa) -- kembalikan `null` untuk menonaktifkan query
 * sementara (mis. selagi menunggu picName ter-load dari localStorage).
 * ------------------------------------------------------------------
 */

import { useEffect, useState, DependencyList } from "react";
import { onSnapshot, Query, DocumentData } from "firebase/firestore";

interface UsePendingTaskResult {
  pending: boolean;
  loading: boolean;
}

export function usePendingTask<T = DocumentData>(
  queryBuilder: () => Query<T> | null,
  deps: DependencyList,
  isComplete: (docs: T[]) => boolean
): UsePendingTaskResult {
  const [docs, setDocs] = useState<T[] | null>(null);

  useEffect(() => {
    const q = queryBuilder();
    if (!q) {
      const t = setTimeout(() => setDocs(null), 0);
      return () => clearTimeout(t);
    }
    const unsub = onSnapshot(q, (snap) => {
      setDocs(snap.docs.map((d) => d.data()));
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  if (docs === null) return { pending: false, loading: true };
  return { pending: !isComplete(docs), loading: false };
}
