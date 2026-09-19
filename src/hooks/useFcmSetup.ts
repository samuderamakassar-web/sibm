"use client";

import { useEffect } from "react";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { db, app } from "@/lib/firebase"; // sesuaikan: pastikan lib/firebase.ts mengekspor `app` (hasil initializeApp)

// GANTI dengan VAPID public key dari Firebase Console
// (Project Settings > Cloud Messaging > Web Push certificates)
const VAPID_KEY = "BMuIDLfqhaGDc0ov7MR1pIwa81eZkX67mtPHQT3PWpb3ApvN0FUOhHM39VECUXsGxOEWWzDZ27A6PvRgO__9GT0";

// Panggil hook ini sekali setelah user login (tau nama & dept-nya),
// misal di halaman dashboard OB setelah localStorage pic_nama keisi.
// `dept` opsional -- disimpan bareng token supaya script reminder (fcm-reminder.mjs dkk)
// bisa kirim push TERTARGET per departemen (OB & CS vs Security), bukan blast ke semua token.
export function useFcmSetup(picName: string, aktif: boolean, dept?: string) {
  useEffect(() => {
    if (!aktif || !picName) return;

    const setup = async () => {
      const support = await isSupported().catch(() => false);
      if (!support) return;

      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Scope KHUSUS (bukan default "/") -- app ini JUGA punya service worker PWA terpisah
        // (public/sw.js, dari @ducanh2912/next-pwa, auto-register di scope "/" dan langsung
        // ambil alih semua klien lewat skipWaiting()+clientsClaim()). Kalau firebase-messaging-sw.js
        // didaftarkan tanpa scope eksplisit, dia ikut ke scope "/" yang sama dan gampang "ketiban"
        // /kalah rebutan kendali sama SW PWA yang lebih agresif -- akibatnya event push dari FCM bisa
        // gak sampai ke SW yang benar pas app-nya lagi ditutup/background. Pola scope terpisah ini
        // resmi direkomendasikan Firebase buat kasus "app sudah punya service worker lain" (ketemu
        // pas audit notifikasi 19 Sep 2026 -- BELUM bisa dikonfirmasi 100% ini penyebab pasti tanpa
        // test langsung di device asli, tapi fix ini aman & additive, gak nyentuh SW PWA sama sekali).
        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
          scope: "/firebase-cloud-messaging-push-scope",
        });
        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (token) {
          // Simpan token supaya API route reminder tau mau kirim push ke siapa.
          // Pakai nama sebagai key sementara karena app ini belum pakai Firebase Auth UID.
          await setDoc(doc(db, "fcm_tokens", picName), {
            pic_nama: picName,
            token,
            dept: dept || "",
            updated_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error("Gagal setup notifikasi:", err);
      }
    };

    setup();
  }, [picName, aktif, dept]);
}