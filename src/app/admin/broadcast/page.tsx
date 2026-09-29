"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuthGuard } from "../../../hooks/useAuthGuard";
import { useToast } from "../../../components/ui/ToastProvider";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import AdminShell from "../../../components/admin/AdminShell";

// Ikon SVG garis — konsisten dengan shell admin/page.tsx & portal utama
type IconProps = { size?: number; color?: string };
const IconTrash = ({ size = 14, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
);
const IconMegaphone = ({ size = 22, color = "currentColor" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a2 2 0 0 0 2 2h1l2 6h2l-1-6h4l6 4V5l-6 4H6a2 2 0 0 0-2 2z" /></svg>
);

interface Pengumuman {
  id: string;
  judul: string;
  teks: string;
  warnaTema: string;
  aktif: boolean;
  dibuatPada: Timestamp | null;
  dibuatOleh: string;
}

// Palet tema kartu pengumuman -- 6 pilihan, dipetakan ke token warna yang sama dipakai di
// seluruh app ini (bukan warna sembarangan) biar konsisten sama look-and-feel SIBM.
const PALET_TEMA = [
  { key: "merah", label: "Merah", gradient: "linear-gradient(150deg,#9f1d1d 0%,#dc2626 55%,#c62828 100%)" },
  { key: "biru", label: "Biru", gradient: "linear-gradient(150deg,#1e3a8a 0%,#2563eb 55%,#1d4ed8 100%)" },
  { key: "hijau", label: "Hijau", gradient: "linear-gradient(150deg,#14532d 0%,#16a34a 55%,#15803d 100%)" },
  { key: "kuning", label: "Kuning", gradient: "linear-gradient(150deg,#92400e 0%,#d97706 55%,#b45309 100%)" },
  { key: "ungu", label: "Ungu", gradient: "linear-gradient(150deg,#4c1d95 0%,#7c3aed 55%,#6d28d9 100%)" },
  { key: "gelap", label: "Gelap", gradient: "linear-gradient(150deg,#18181b 0%,#3f3f46 55%,#27272a 100%)" },
];
function gradientUntukTema(key: string): string {
  return PALET_TEMA.find((p) => p.key === key)?.gradient || PALET_TEMA[0].gradient;
}

export default function BroadcastAdminPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { session, isReady } = useAuthGuard({
    depts: ["Admin GA"],
    redirectTo: "/",
    deniedMessage: "Akses Ditolak! Halaman ini khusus Admin GA.",
  });
  const adminName = session?.nama || "Admin";

  const [daftar, setDaftar] = useState<Pengumuman[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [judul, setJudul] = useState("");
  const [teks, setTeks] = useState("");
  const [tema, setTema] = useState("merah");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "pengumuman_gedung"), orderBy("dibuatPada", "desc")), (snapshot) => {
      setDaftar(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Pengumuman)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleBuat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!judul.trim() || !teks.trim()) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, "pengumuman_gedung"), {
        judul: judul.trim(),
        teks: teks.trim(),
        warnaTema: tema,
        aktif: true,
        dibuatPada: serverTimestamp(),
        dibuatOleh: adminName,
      });
      setJudul("");
      setTeks("");
      setTema("merah");
      setShowForm(false);
      showToast("Pengumuman baru berhasil dibuat & langsung tayang di portal utama!", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal membuat pengumuman.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAktif = async (p: Pengumuman) => {
    try {
      await updateDoc(doc(db, "pengumuman_gedung", p.id), { aktif: !p.aktif });
    } catch (err) {
      console.error(err);
      showToast("Gagal mengubah status pengumuman.", "error");
    }
  };

  const handleHapus = async (p: Pengumuman) => {
    const yakin = await confirm({
      title: "Hapus Pengumuman",
      message: `Yakin ingin menghapus pengumuman "${p.judul}"? Tindakan ini tidak bisa dibatalkan.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      variant: "danger",
    });
    if (!yakin) return;
    try {
      await deleteDoc(doc(db, "pengumuman_gedung", p.id));
      showToast("Pengumuman dihapus.", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal menghapus pengumuman.", "error");
    }
  };

  const jumlahAktif = daftar.filter((p) => p.aktif).length;

  if (!isReady) return null;

  return (
    <AdminShell title="Pengumuman Gedung" subtitle="Kartu pengumuman tayang bergiliran di halaman utama SIBM — bisa lebih dari satu sekaligus" userName={adminName}>
      <style dangerouslySetInnerHTML={{ __html: `
        .tema-swatch { width: 36px; height: 36px; border-radius: 10px; cursor: pointer; border: 3px solid transparent; }
        .tema-swatch.aktif { border-color: var(--ink); }
      `}} />
      <div>
        <div style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", padding: "18px 20px", marginBottom: "18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontSize: "13px", color: "var(--ink-soft)", fontWeight: 700 }}>
            <IconMegaphone size={16} /> {jumlahAktif} dari {daftar.length} pengumuman sedang tayang
          </div>
          <button onClick={() => setShowForm((v) => !v)} style={{ padding: "10px 18px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 700, background: "var(--info-solid)", color: "#fff" }}>
            {showForm ? "Batal" : "+ Buat Pengumuman Baru"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleBuat} style={{ background: "var(--surface)", borderRadius: "20px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", border: "1px solid var(--line)", padding: "22px", marginBottom: "20px" }}>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", marginBottom: "6px" }}>Judul Singkat *</label>
              <input required value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Contoh: Relokasi Ruangan" style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "14px", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", marginBottom: "6px" }}>Isi Pengumuman *</label>
              <textarea required value={teks} onChange={(e) => setTeks(e.target.value)} placeholder="Contoh: Mohon maaf atas ketidaknyamanan atas relokasi ruangan Lantai 2 ke Lantai 3 & 4." style={{ width: "100%", minHeight: "90px", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "14px", resize: "vertical", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--ink-soft)", marginBottom: "8px" }}>Warna Tema Kartu</label>
              <div style={{ display: "flex", gap: "10px" }}>
                {PALET_TEMA.map((p) => (
                  <div key={p.key} className={`tema-swatch ${tema === p.key ? "aktif" : ""}`} style={{ background: p.gradient }} onClick={() => setTema(p.key)} title={p.label} />
                ))}
              </div>
            </div>
            {/* PREVIEW LIVE */}
            <div style={{ borderRadius: "16px", padding: "22px", color: "#fff", background: gradientUntukTema(tema), marginBottom: "18px" }}>
              <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "1px", opacity: 0.85, textTransform: "uppercase" }}>Pratinjau Kartu</div>
              <div style={{ fontSize: "17px", fontWeight: 900, margin: "6px 0" }}>{judul || "Judul Pengumuman"}</div>
              <div style={{ fontSize: "13px", opacity: 0.95 }}>{teks || "Isi pengumuman akan tampil di sini."}</div>
            </div>
            <button type="submit" disabled={isSaving} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", cursor: isSaving ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 700, background: isSaving ? "var(--muted-solid)" : "var(--ok-solid)", color: "#fff" }}>
              {isSaving ? "Menyimpan..." : "🚀 Terbitkan Pengumuman"}
            </button>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Memuat...</div>
          ) : daftar.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)", background: "var(--surface)", borderRadius: "20px", border: "1px dashed var(--line)" }}>Belum ada pengumuman. Buat yang pertama lewat tombol di atas.</div>
          ) : (
            daftar.map((p) => (
              <div key={p.id} style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--line)", overflow: "hidden", opacity: p.aktif ? 1 : 0.55 }}>
                <div style={{ padding: "16px 18px", color: "#fff", background: gradientUntukTema(p.warnaTema) }}>
                  <div style={{ fontSize: "15px", fontWeight: 900 }}>{p.judul}</div>
                  <div style={{ fontSize: "12.5px", opacity: 0.95, marginTop: "4px" }}>{p.teks}</div>
                </div>
                <div style={{ padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>oleh {p.dibuatOleh}</span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      onClick={() => handleToggleAktif(p)}
                      style={{ padding: "6px 14px", borderRadius: "20px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: 700, background: p.aktif ? "var(--ok-50)" : "var(--line)", color: p.aktif ? "var(--ok)" : "var(--muted)" }}
                    >
                      {p.aktif ? "🟢 Tayang" : "⚪ Berhenti"}
                    </button>
                    <button onClick={() => handleHapus(p)} style={{ padding: "6px 10px", borderRadius: "8px", border: "none", cursor: "pointer", background: "var(--red-50)", color: "var(--red-600)" }}>
                      <IconTrash />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
