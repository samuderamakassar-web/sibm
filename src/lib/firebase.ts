import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ⚠️ GANTI isi di dalam objek ini dengan data yang Anda salin dari Firebase Console tadi!
const firebaseConfig = {
  apiKey: "AIzaSyCgSsts6ln11Nk1UklAyZt2YrYXu1xrMLo",
  authDomain: "sibm-app.firebaseapp.com",
  projectId: "sibm-app",
  storageBucket: "sibm-app.firebasestorage.app",
  messagingSenderId: "98949286064",
  appId: "1:98949286064:web:bf627ae1653f2d4d67d375",
  measurementId: "G-8037NKCVEJ"
};

// Inisialisasi Firebase (Logika ini mencegah error double-initialize di Next.js)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Ekspor layanan Firebase yang akan kita gunakan nanti
const auth = getAuth(app);         // Untuk Login/Authentication
const db = getFirestore(app);       // Untuk Database (Firestore)
const storage = getStorage(app);   // Untuk Simpan Foto Paket/Fasilitas Rusak

export { app, auth, db, storage };