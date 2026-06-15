"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase"; // Pastikan path ini sesuai dengan lokasi file firebase.ts Anda

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    try {
      // Fungsi login bawaan Firebase
      await signInWithEmailAndPassword(auth, email, password);
      // Jika berhasil, arahkan kembali ke halaman Dashboard Utama
      router.push("/shift-checkin");
    } catch (error) {
      console.error(error); // Menambahkan ini agar variabel 'error' dianggap terpakai
      setErrorMsg("Email atau Password salah. Silakan coba lagi.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Kolom Kiri: Gambar Background (Disembunyikan di layar HP) */}
      <div 
        className="hidden md:block md:w-3/5 bg-cover bg-center"
        style={{ 
          // Ubah 'bg-login.jpg' dengan nama file gambar Anda di folder public
          // Atau gunakan URL gambar eksternal sementara seperti di bawah ini
          backgroundImage: "url('https://images.unsplash.com/photo-1586528116311-ad8ed7c80a30?q=80&w=2070&auto=format&fit=crop')" 
        }}
      >
        {/* Opsional: Overlay gelap agar tidak terlalu silau */}
        <div className="h-full w-full bg-black/10"></div>
      </div>

      {/* Kolom Kanan: Form Login */}
      <div className="w-full md:w-2/5 flex flex-col justify-center px-8 sm:px-16 lg:px-24">
        
        {/* Placeholder Logo */}
        <div className="mb-10 flex items-center gap-3">
          {/* Logo S Kotak Merah (Tiruan referensi) */}
          <div className="w-10 h-10 bg-white border-2 border-red-600 flex flex-col justify-center items-center relative">
            <div className="w-8 h-[2px] bg-red-600 absolute top-2"></div>
            <span className="text-red-600 font-bold text-xl z-10">S</span>
            <div className="w-8 h-[2px] bg-red-600 absolute bottom-2"></div>
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-gray-800">SIBM</h1>
        </div>

        <h2 className="text-3xl font-bold text-gray-900 mb-8">Login</h2>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          {/* Input Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              placeholder="user@gmail.com"
              className="w-full px-4 py-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-gray-900"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Input Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                className="w-full px-4 py-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-gray-900 pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {/* Tombol Toggle Mata */}
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Lupa Kata Sandi */}
          <div className="flex justify-end">
            <a href="#" className="text-sm text-red-600 hover:text-red-700 hover:underline">
              Lupa Kata Sandi?
            </a>
          </div>

          {/* Pesan Error */}
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-200">
              {errorMsg}
            </div>
          )}

          {/* Tombol Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#da251d] hover:bg-red-700 text-white font-medium py-3 rounded-md transition-colors mt-2 disabled:opacity-70"
          >
            {isLoading ? "Memproses..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}