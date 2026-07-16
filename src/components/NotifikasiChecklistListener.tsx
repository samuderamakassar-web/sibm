"use client";

import { useEffect } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useToast } from "./ui/ToastProvider";

export default function NotifikasiChecklistListener() {
  const showToast = useToast();

  useEffect(() => {
    const nama = localStorage.getItem("pic_nama");
    if (!nama) return;

    const q = query(
      collection(db, "notifikasi_checklist_ob"),
      where("untuk_nama", "==", nama),
      where("dibaca", "==", false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          showToast(data.pesan, "warning");
          updateDoc(doc(db, "notifikasi_checklist_ob", change.doc.id), { dibaca: true }).catch((err) =>
            console.error("Gagal menandai notifikasi terbaca:", err)
          );
        }
      });
    });

    return () => unsubscribe();
  }, [showToast]);

  return null;
}