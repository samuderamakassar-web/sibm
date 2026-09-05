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

        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
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