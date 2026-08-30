/**
 * src/lib/emailTemplates.ts
 * ------------------------------------------------------------------
 * Pembuat HTML email rapi (bentuk "form" digital) untuk notifikasi yang
 * dikirim lewat kirimEmail() (src/lib/notify.ts). Dipakai supaya email
 * yang diterima karyawan tidak lagi berupa teks mentah gaya WhatsApp
 * (mis. "*DISETUJUI*" dengan bintang literal), tapi tabel field yang jelas
 * + badge status berwarna.
 *
 * CATATAN: kirimEmail() mengirim string ini lewat variabel {{message}} ke
 * template EmailJS -- diasumsikan template EmailJS merender variabel
 * tersebut sebagai HTML mentah (bukan di-escape), mengikuti pola yang
 * sudah dipakai formatPesanUntukEmail() di src/app/page.tsx. Kalau nanti
 * ternyata tag HTML tampil sebagai teks di inbox, cek pengaturan template
 * di dashboard EmailJS.
 * ------------------------------------------------------------------
 */

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function emailShell(headerText: string, bodyHtml: string): string {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4;">
      <tr>
        <td style="background:linear-gradient(150deg,#9f1d1d 0%,#dc2626 55%,#c62828 100%);padding:22px 26px;">
          <div style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;opacity:0.85;">SIBM &middot; PT SAMUDERA</div>
          <div style="color:#ffffff;font-size:19px;font-weight:800;margin-top:4px;">${headerText}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:26px;">
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 26px;background:#f7f6f5;border-top:1px solid #e7e5e4;">
          <div style="font-size:11px;color:#71717a;">Email otomatis dari Sistem Informasi Bangunan &amp; Manajemen (SIBM). Mohon tidak membalas email ini.</div>
        </td>
      </tr>
    </table>
  </div>`;
}

function fieldRow(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid #f0f0ef;font-size:12.5px;color:#71717a;font-weight:700;white-space:nowrap;vertical-align:top;width:38%;">${label}</td>
    <td style="padding:9px 0 9px 12px;border-bottom:1px solid #f0f0ef;font-size:13.5px;color:#18181b;font-weight:600;">${value}</td>
  </tr>`;
}

function statusBadge(text: string, tone: "ok" | "danger"): string {
  const bg = tone === "ok" ? "#f0fdf4" : "#fef2f2";
  const color = tone === "ok" ? "#16a34a" : "#dc2626";
  const border = tone === "ok" ? "#bbf7d0" : "#fecaca";
  return `<span style="display:inline-block;padding:6px 14px;border-radius:20px;background:${bg};color:${color};font-size:12.5px;font-weight:800;border:1px solid ${border};">${text}</span>`;
}

function simpleTable(headers: string[], rows: string[][]): string {
  const thead = headers.map((h) => `<th style="text-align:left;padding:8px 10px;font-size:11px;color:#71717a;background:#f7f6f5;border-bottom:1px solid #e7e5e4;">${escapeHtml(h)}</th>`).join("");
  const tbody = rows
    .map((r) => `<tr>${r.map((c) => `<td style="padding:8px 10px;font-size:12.5px;color:#18181b;border-bottom:1px solid #f0f0ef;">${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px;border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

export function buildPaketEmailHtml(p: {
  namaPenerima: string;
  namaPetugas: string;
  tanggal: string;
  jam: string;
  jenisBarang: string;
  keterangan?: string;
  kurir: string;
  fotoUrl?: string;
}): string {
  const rows = [
    fieldRow("Penerima", escapeHtml(p.namaPenerima)),
    fieldRow("Diinput oleh (Security)", escapeHtml(p.namaPetugas)),
    fieldRow("Tanggal", escapeHtml(p.tanggal)),
    fieldRow("Jam Diterima", escapeHtml(p.jam)),
    fieldRow("Jenis Barang", escapeHtml(p.jenisBarang) + (p.keterangan ? ` &mdash; ${escapeHtml(p.keterangan)}` : "")),
    fieldRow("Kurir / Ekspedisi", escapeHtml(p.kurir)),
  ].join("");

  const foto = p.fotoUrl
    ? `<div style="margin-top:18px;"><div style="font-size:11.5px;color:#71717a;font-weight:700;margin-bottom:8px;">FOTO BUKTI FISIK PAKET</div><img src="${p.fotoUrl}" alt="Bukti paket" style="max-width:100%;border-radius:10px;border:1px solid #e7e5e4;display:block;" /></div>`
    : "";

  const body = `
    <p style="margin:0 0 16px 0;font-size:13.5px;color:#3f3f46;line-height:1.6;">
      Ada paket/dokumen baru untuk Anda yang sudah diterima Security dan menunggu untuk diambil. Berikut detail penerimaannya:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
    ${foto}
  `;

  return emailShell("&#128230; Notifikasi Paket Masuk", body);
}

export function buildOvertimeEmailHtml(p: {
  namaPemohon: string;
  departemen?: string;
  tanggal: string;
  jamMulai: string;
  jamSelesai: string;
  status: "Approved" | "Rejected";
  alasanTolak?: string;
}): string {
  const rows = [
    fieldRow("Nama Yang Lembur", escapeHtml(p.namaPemohon)),
    ...(p.departemen ? [fieldRow("Departemen", escapeHtml(p.departemen))] : []),
    fieldRow("Tanggal Lembur", escapeHtml(p.tanggal)),
    fieldRow("Jam Mulai", escapeHtml(p.jamMulai)),
    fieldRow("Jam Selesai", escapeHtml(p.jamSelesai)),
  ].join("");

  const badge = p.status === "Approved" ? statusBadge("&#10003; DISETUJUI", "ok") : statusBadge("&#10007; DITOLAK", "danger");
  const alasan = p.alasanTolak
    ? `<div style="margin-top:14px;padding:12px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;font-size:12.5px;color:#9f1d1d;"><b>Alasan Penolakan:</b> ${escapeHtml(p.alasanTolak)}</div>`
    : "";

  const body = `
    <p style="margin:0 0 16px 0;font-size:13.5px;color:#3f3f46;line-height:1.6;">
      Pengajuan overtime Anda sudah diputuskan oleh Admin GA:
    </p>
    <div style="margin-bottom:16px;">${badge}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
    ${alasan}
  `;

  return emailShell("&#128337; Update Pengajuan Overtime", body);
}

/**
 * Notifikasi ke Admin GA saat ada pengajuan BARU masuk (ATK / Overtime Gedung / Tiket Helpdesk)
 * dari portal publik (src/app/page.tsx). Satu builder dipakai untuk ketiganya -- bentuknya sama
 * (judul + info pemohon + rincian field), cuma isi `rows`/`itemsTable`-nya beda per jenis.
 */
export function buildRequestBaruEmailHtml(p: {
  jenisRequest: string;
  namaPemohon: string;
  departemen: string;
  rows: { label: string; value: string }[];
  itemsTable?: { headers: string[]; rows: string[][] };
  fotoUrl?: string;
}): string {
  const infoRows = [
    fieldRow("Jenis Request", escapeHtml(p.jenisRequest)),
    fieldRow("Nama Pemohon", escapeHtml(p.namaPemohon)),
    fieldRow("Departemen", escapeHtml(p.departemen)),
    ...p.rows.map((r) => fieldRow(r.label, escapeHtml(r.value))),
  ].join("");

  const tabel = p.itemsTable
    ? simpleTable(p.itemsTable.headers, p.itemsTable.rows.map((r) => r.map((c) => escapeHtml(c))))
    : "";
  const foto = p.fotoUrl
    ? `<div style="margin-top:18px;"><div style="font-size:11.5px;color:#71717a;font-weight:700;margin-bottom:8px;">FOTO LAMPIRAN</div><img src="${p.fotoUrl}" alt="Lampiran" style="max-width:100%;border-radius:10px;border:1px solid #e7e5e4;display:block;" /></div>`
    : "";

  const body = `
    <p style="margin:0 0 16px 0;font-size:13.5px;color:#3f3f46;line-height:1.6;">
      Ada pengajuan baru yang perlu diproses di Dashboard Admin GA:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${infoRows}</table>
    ${tabel}
    ${foto}
  `;

  return emailShell(`&#128276; Request Baru: ${escapeHtml(p.jenisRequest)}`, body);
}

/** Notifikasi ke pemohon saat request ATK sudah siap diambil di gudang GA. */
export function buildAtkSiapEmailHtml(p: {
  namaPemohon: string;
  kodeResi: string;
  departemen?: string;
  items: { nama_barang: string; jumlah: string; deskripsi?: string }[];
}): string {
  const rows = [
    fieldRow("Nama Pemohon", escapeHtml(p.namaPemohon)),
    ...(p.departemen ? [fieldRow("Departemen", escapeHtml(p.departemen))] : []),
    fieldRow("Kode Resi", `<b>${escapeHtml(p.kodeResi)}</b>`),
  ].join("");

  const tabel = simpleTable(
    ["Barang", "Jumlah", "Keterangan"],
    p.items.map((it) => [escapeHtml(it.nama_barang), escapeHtml(it.jumlah), escapeHtml(it.deskripsi || "-")])
  );

  const body = `
    <div style="margin-bottom:16px;">${statusBadge("&#10003; SIAP DIAMBIL", "ok")}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
    ${tabel}
    <p style="margin:16px 0 0 0;font-size:13px;color:#3f3f46;">Silakan diambil di gudang GA dengan menunjukkan kode resi di atas.</p>
  `;

  return emailShell("&#128230; ATK Siap Diambil", body);
}

/** Notifikasi ke pelapor saat status tiket helpdesk berubah. */
export function buildHelpdeskUpdateEmailHtml(p: {
  namaPelapor: string;
  kodeTiket: string;
  statusBaru: string;
  lokasi?: string;
  deskripsi?: string;
}): string {
  const selesai = p.statusBaru.toLowerCase().includes("selesai") || p.statusBaru.toLowerCase().includes("close");
  const rows = [
    fieldRow("Nama Pelapor", escapeHtml(p.namaPelapor)),
    fieldRow("Kode Tiket", `<b>${escapeHtml(p.kodeTiket)}</b>`),
    ...(p.lokasi ? [fieldRow("Lokasi", escapeHtml(p.lokasi))] : []),
    ...(p.deskripsi ? [fieldRow("Deskripsi Masalah", escapeHtml(p.deskripsi))] : []),
  ].join("");

  const body = `
    <div style="margin-bottom:16px;">${statusBadge(escapeHtml(p.statusBaru.toUpperCase()), selesai ? "ok" : "danger")}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
  `;

  return emailShell("&#128295; Update Tiket Helpdesk", body);
}
