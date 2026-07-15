"use client";

import { useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase"; // sesuaikan path relatif kalau beda
import { useToast } from "./ui/ToastProvider";

export default function NotifikasiPatroliListener() {
  const showToast = useToast();

  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) return;

    const q = query(
      collection(db, "notifikasi_patroli"),
      where("untuk_nama", "==", nama),
      where("dibaca", "==", false)
    );

    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          showToast(data.pesan, "warning");
          updateDoc(doc(db, "notifikasi_patroli", change.doc.id), { dibaca: true });
        }
      });
    });

    return () => unsub();
  }, [showToast]);

  return null; // komponen ini gak render apa-apa, cuma "dengar" notif di background
}