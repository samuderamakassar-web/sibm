"use client";

// Mirip pola NotifikasiPatroliListener.tsx / NotifikasiChecklistListener.tsx yang sudah ada.
// Dengar koleksi `notifikasi_kendaraan` (ditulis oleh scripts/kendaraan-reminder.mjs) dan
// tampilkan toast in-app kalau ada reminder baru yang belum pernah ditampilkan di device ini.
//
// PENTING: mount komponen ini di src/app/layout.tsx, sejajar dengan
// <NotifikasiPatroliListener /> dan <NotifikasiChecklistListener /> yang sudah ada di sana.

import { useEffect, useRef } from "react";
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase"; // sesuaikan path relatif kalau lokasi file berbeda
import { useToast } from "./ui/ToastProvider"; // sesuaikan sesuai nama hook toast yang sudah dipakai di project

interface NotifKendaraan {
  kendaraan: string;
  driver: string;
  tujuan: string;
  jam_keluar_str: string;
  jam_berlalu: number;
  waktu_kirim?: Timestamp | null;
}

const KEY_LOCALSTORAGE = "sibm_terakhir_notif_kendaraan";

export default function NotifikasiKendaraanListener() {
  const showToast = useToast();
  const sudahJalanPertamaKali = useRef(false);

  useEffect(() => {
    const q = query(collection(db, "notifikasi_kendaraan"), orderBy("waktu_kirim", "desc"), limit(5));
    const unsub = onSnapshot(q, (snapshot) => {
      // Lewati batch pertama (data lama yang sudah ada saat listener baru nyala),
      // supaya user tidak di-spam toast untuk reminder-reminder lama begitu buka portal
      if (!sudahJalanPertamaKali.current) {
        sudahJalanPertamaKali.current = true;
        const terbaru = snapshot.docs[0];
        if (terbaru?.data().waktu_kirim) {
          localStorage.setItem(KEY_LOCALSTORAGE, String(terbaru.data().waktu_kirim.toMillis()));
        }
        return;
      }

      const terakhirDilihat = Number(localStorage.getItem(KEY_LOCALSTORAGE) || 0);
      let terbaruBaru = terakhirDilihat;

      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const data = change.doc.data() as NotifKendaraan;
        const waktuMs = data.waktu_kirim?.toMillis() || 0;
        if (waktuMs <= terakhirDilihat) return; // sudah pernah ditampilkan

        showToast(
          `🚗 ${data.kendaraan} masih tercatat KELUAR (${data.jam_berlalu} jam) — driver ${data.driver} perlu update status Tiba.`,
          "warning"
        );
        if (waktuMs > terbaruBaru) terbaruBaru = waktuMs;
      });

      if (terbaruBaru > terakhirDilihat) {
        localStorage.setItem(KEY_LOCALSTORAGE, String(terbaruBaru));
      }
    });

    return () => unsub();
  }, [showToast]);

  return null; // komponen ini murni listener, tidak render apapun
}