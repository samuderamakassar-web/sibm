// §184 Ambil teks PDF di browser (pdf.js, tanpa server/OCR). Teks dikelompokkan per baris berdasarkan posisi Y
// supaya label & nilai di baris yang sama tergabung ("kWh LWBP : 5,925"). PDF hasil scan/foto tidak punya
// lapisan teks -> hasilnya kosong, admin isi manual.

interface ItemTeks { str: string; transform: number[] }

export async function bacaBarisPdf(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const semua: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 5); p++) {
    const isi = await (await doc.getPage(p)).getTextContent();
    const potong = (isi.items as ItemTeks[]).filter((i) => typeof i.str === "string" && i.str.trim())
      .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));
    potong.sort((a, b) => b.y - a.y || a.x - b.x);
    const baris: { y: number; isi: { s: string; x: number }[] }[] = [];
    potong.forEach((t) => {
      const b = baris.find((r) => Math.abs(r.y - t.y) <= 3);
      if (b) b.isi.push(t); else baris.push({ y: t.y, isi: [t] });
    });
    baris.forEach((b) => semua.push(b.isi.sort((a, c) => a.x - c.x).map((t) => t.s).join(" ")));
  }
  await doc.destroy();
  return semua;
}
