// Dokumen arsip Permintaan ATK (§139) -- tampilan mengikuti format Purchase Order perusahaan (kop, kotak pemohon,
// tabel barang + harga, total, pengesahan) tetapi berjudul "PERMINTAAN ATK": ini bukti permintaan internal ke
// Gudang ATK, BUKAN PO ke pemasok (nomor PO resmi tetap dari sistem pengadaan). Dibuka di tab baru lalu dicetak /
// disimpan PDF dari dialog cetak browser.

export interface BarisDokumenAtk { nama: string; keterangan: string; satuan: string; jumlah: number; harga: number | null }
export interface DataDokumenAtk {
  resi: string; tanggal: Date | null; pemohon: string; departemen: string; status: string;
  catatanAdmin?: string; alasanBatal?: string; baris: BarisDokumenAtk[]; dicetakOleh: string;
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const rp = (n: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const tgl = (d: Date | null) => (d ? d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Makassar" }) : "-");

export function htmlDokumenAtk(d: DataDokumenAtk, asal: string): string {
  const adaHarga = d.baris.some((b) => b.harga !== null);
  const total = d.baris.reduce((s, b) => s + (b.harga !== null ? b.harga * b.jumlah : 0), 0);
  const tanpaHarga = d.baris.filter((b) => b.harga === null).length;
  const baris = d.baris.map((b, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(b.nama)}${b.keterangan ? `<div class="ket">${esc(b.keterangan)}</div>` : ""}</td>
        <td class="c">${esc(b.satuan || "PCS")}</td>
        <td class="r">${b.jumlah}</td>
        <td class="r">${b.harga !== null ? rp(b.harga) : "-"}</td>
        <td class="r">${b.harga !== null ? rp(b.harga * b.jumlah) : "-"}</td>
      </tr>`).join("");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Permintaan ATK ${esc(d.resi)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; color: #000; font-size: 12px; margin: 0; padding: 16px; background: #fff; }
  .lembar { max-width: 760px; margin: 0 auto; }
  .kotak { border: 1.5px solid #000; display: grid; grid-template-columns: 1fr 1fr; }
  .kotak > div { padding: 10px 12px; }
  .kotak > div + div { border-left: 1.5px solid #000; }
  .kop img { height: 34px; }
  .judul { text-align: center; }
  .judul h1 { margin: 0; font-size: 17px; letter-spacing: .5px; }
  .judul div { font-weight: bold; }
  .judul small { font-size: 11px; }
  .sambung { border-top: none; }
  dl { margin: 0; display: grid; grid-template-columns: 110px 1fr; gap: 3px 8px; }
  dt { font-weight: normal; } dd { margin: 0; font-weight: bold; }
  .label { font-weight: bold; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: -1.5px; }
  th, td { border: 1.5px solid #000; padding: 5px 7px; vertical-align: top; }
  th { font-size: 10.5px; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  .ket { font-size: 10.5px; font-style: italic; }
  .total { border: 1.5px solid #000; border-top: none; padding: 8px 12px; display: grid; grid-template-columns: 1fr 150px; gap: 4px; text-align: right; }
  .total b { font-size: 12.5px; }
  .catatan { border: 1.5px solid #000; border-top: none; padding: 10px 12px; min-height: 54px; }
  .ttd { height: 46px; }
  .kaki { margin-top: 10px; font-size: 10.5px; display: flex; justify-content: space-between; }
  .aksi { max-width: 760px; margin: 0 auto 12px; display: flex; gap: 8px; font-family: system-ui, sans-serif; }
  .aksi button { padding: 9px 16px; border-radius: 8px; border: 1px solid #999; background: #a3122a; color: #fff; font-weight: 700; cursor: pointer; }
  .aksi button + button { background: #fff; color: #333; }
  @media print { .aksi { display: none; } body { padding: 0; } }
</style></head><body>
<div class="aksi"><button onclick="window.print()">Cetak / Simpan PDF</button><button onclick="window.close()">Tutup</button></div>
<div class="lembar">
  <div class="kotak">
    <div class="kop"><img src="${asal}/logo-samudera.png" alt="Samudera"></div>
    <div class="judul"><h1>PERMINTAAN ATK</h1><div>General Affairs &middot; SIBM Makassar</div><small>${esc(d.resi)}<br>${tgl(d.tanggal)}</small></div>
  </div>
  <div class="kotak sambung">
    <div>
      <div class="label">Pemohon :</div>
      <dl><dt>Nama</dt><dd>${esc(d.pemohon)}</dd><dt>Unit / Dept</dt><dd>${esc(d.departemen || "-")}</dd><dt>Tgl. permintaan</dt><dd>${tgl(d.tanggal)}</dd></dl>
    </div>
    <div>
      <div class="label">Diproses oleh :</div>
      <dl><dt>Bagian</dt><dd>Gudang ATK &ndash; General Affairs</dd><dt>Status</dt><dd>${esc(d.status)}</dd><dt>Mata uang</dt><dd>IDR</dd></dl>
    </div>
  </div>
  <table>
    <thead><tr><th style="width:34px">No.</th><th>Deskripsi</th><th style="width:70px">Satuan</th><th style="width:60px">Jumlah</th><th style="width:110px">Harga Satuan</th><th style="width:120px">Total</th></tr></thead>
    <tbody>${baris || `<tr><td colspan="6" class="c">Tidak ada barang.</td></tr>`}</tbody>
  </table>
  <div class="total">
    <span>TOTAL</span><span>${adaHarga ? rp(total) : "-"}</span>
    <b>GRAND TOTAL</b><b>${adaHarga ? rp(total) : "-"}</b>
  </div>
  <div class="catatan">
    <div class="label">Catatan :</div>
    ${d.alasanBatal ? `Dibatalkan: ${esc(d.alasanBatal)}<br>` : ""}${d.catatanAdmin ? `${esc(d.catatanAdmin)}<br>` : ""}${adaHarga && tanpaHarga ? `${tanpaHarga} barang belum memiliki harga di Master ATK, tidak termasuk total.` : !adaHarga ? "Harga belum diisi di Master ATK." : ""}
  </div>
  <div class="kotak sambung">
    <div>
      <div class="label">Diserahkan oleh : General Affairs</div>
      <div class="ttd"></div>
      <dl><dt>Nama</dt><dd>${esc(d.dicetakOleh)}</dd><dt>Tanggal</dt><dd>${tgl(new Date())}</dd></dl>
    </div>
    <div>
      <div class="label">Diterima oleh : Pemohon</div>
      <div class="ttd"></div>
      <dl><dt>Nama</dt><dd>${esc(d.pemohon)}</dd><dt>Tanggal</dt><dd>&nbsp;</dd></dl>
    </div>
  </div>
  <div class="kaki"><span>Dokumen arsip internal dari aplikasi SIBM &mdash; bukan Purchase Order ke pemasok.</span><span>HAL 1</span></div>
</div>
</body></html>`;
}

/** Buka dokumen di tab baru. Mengembalikan false bila popup diblokir browser. */
export function bukaDokumenAtk(d: DataDokumenAtk): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(htmlDokumenAtk(d, window.location.origin));
  w.document.close();
  return true;
}
