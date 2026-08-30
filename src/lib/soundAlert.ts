/**
 * src/lib/soundAlert.ts
 * ------------------------------------------------------------------
 * Bunyi pengingat (chime) untuk StickyBanner -- dipakai supaya reminder
 * tugas yang belum selesai (patroli/APAR/checklist) tidak cuma diam
 * menunggu dilihat, tapi juga "manggil" lewat suara. Dibangkitkan lewat
 * Web Audio API (osilator sederhana), BUKAN file audio -- gak perlu
 * nambah aset ke /public, dan tetap jalan walau offline.
 *
 * CATATAN: browser modern memblokir audio otomatis sebelum ada interaksi
 * user di halaman (autoplay policy). Fungsi ini sengaja diam-diam gagal
 * (try/catch) kalau diblokir -- banner visual tetap tampil normal, cuma
 * suaranya yang mungkin baru kedengaran setelah user klik apapun di app.
 * ------------------------------------------------------------------
 */

type NadaTone = "warning" | "urgent";

function bunyikanNada(freqSequence: { freq: number; start: number; durasi: number }[]) {
  try {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = new AudioCtxClass();

    const mulaikan = () => {
      freqSequence.forEach(({ freq, start, durasi }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + start;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durasi);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + durasi + 0.05);
      });
      const totalDurasi = Math.max(...freqSequence.map((f) => f.start + f.durasi)) + 200;
      setTimeout(() => ctx.close().catch(() => {}), totalDurasi * 1000);
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(mulaikan).catch(() => {});
    } else {
      mulaikan();
    }
  } catch {
    // Autoplay diblokir / Web Audio tidak didukung -- diamkan saja, banner visual tetap jalan.
  }
}

/** Chime pengingat tugas belum selesai. `urgent` bunyinya lebih mendesak (3 nada naik) dari `warning` (2 nada). */
export function bunyikanAlertPengingat(tone: NadaTone = "warning") {
  if (tone === "urgent") {
    bunyikanNada([
      { freq: 880, start: 0, durasi: 0.15 },
      { freq: 880, start: 0.2, durasi: 0.15 },
      { freq: 1046, start: 0.4, durasi: 0.25 },
    ]);
  } else {
    bunyikanNada([
      { freq: 784, start: 0, durasi: 0.18 },
      { freq: 659, start: 0.22, durasi: 0.18 },
    ]);
  }
}
