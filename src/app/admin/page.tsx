"use client";

import { useRouter } from "next/navigation";

export default function AdminDashboardPage() {
  const router = useRouter();

  const menuAdmin = [
    {
      title: "👥 Manajemen Pengguna",
      desc: "Tambah, edit, hapus, dan atur role/departemen staf.",
      path: "/admin/users",
      color: "#3182ce", 
    },
    {
      title: "🖨️ QR Code Generator",
      desc: "Cetak label QR Code untuk titik patroli & kebersihan.",
      path: "/admin/qr-manager", 
      color: "#805ad5", 
    },
    {
      title: "🧹 Pantau Laporan OB & CS",
      desc: "View, edit, hapus data checklist harian dan stok gudang.",
      path: "/admin/monitor-ob", 
      color: "#319795", 
    },
    {
      title: "🛡️ Pantau Laporan Security",
      desc: "View, edit, hapus log patroli, tamu, dan kendaraan.",
      path: "/admin/monitor-security", 
      color: "#dd6b20", 
    },
  ];

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1200px", margin: "0 auto", minHeight: "100vh", background: "#f7fafc" }}>
      
      <div style={{ background: "white", padding: "25px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "5px solid #2c5282" }}>
        <div>
          <h1 style={{ margin: "0 0 5px 0", color: "#2c5282" }}>👑 Administrator Control Panel</h1>
          <p style={{ margin: "0", color: "#718096", fontSize: "14px" }}>Kelola seluruh data master, pengguna, dan aktivitas operasional gedung SIBM.</p>
        </div>
        <div>
          <button 
            onClick={() => router.push("/")}
            style={{ padding: "10px 20px", background: "#e53e3e", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
          >
            Keluar (Logout)
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px" }}>
        {menuAdmin.map((menu, index) => (
          <div 
            key={index}
            onClick={() => router.push(menu.path)}
            style={{
              background: "white",
              padding: "25px",
              borderRadius: "8px",
              boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
              cursor: "pointer",
              borderTop: `4px solid ${menu.color}`,
              transition: "transform 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-5px)")}
            onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          >
            <h2 style={{ marginTop: "0", color: menu.color, fontSize: "20px", marginBottom: "10px" }}>{menu.title}</h2>
            <p style={{ margin: "0", color: "#4a5568", fontSize: "14px", lineHeight: "1.5" }}>{menu.desc}</p>
          </div>
        ))}
      </div>

    </div>
  );
}