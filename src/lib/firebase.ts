import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
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

// ------------------------------------------------------------------
// Instance Auth KEDUA, terpisah dari sesi login utama di atas.
// Dipakai HANYA oleh admin/users/page.tsx saat Admin GA mendaftarkan akun
// baru: createUserWithEmailAndPassword() di instance Auth UTAMA otomatis
// mengganti sesi yang sedang login jadi akun baru itu (perilaku default
// Firebase Auth SDK) -- itu akan membuat Admin ke-logout dari sesinya
// sendiri di tengah proses. Instance kedua ini biar proses bikin akun baru
// tidak menyentuh sesi login Admin yang sedang aktif.
let secondaryApp: FirebaseApp | null = null;
let secondaryAuth: Auth | null = null;
export function getSecondaryAuth(): Auth {
  if (!secondaryAuth) {
    secondaryApp = getApps().some((a) => a.name === "AdminUserCreation")
      ? getApp("AdminUserCreation")
      : initializeApp(firebaseConfig, "AdminUserCreation");
    secondaryAuth = getAuth(secondaryApp);
  }
  return secondaryAuth;
}