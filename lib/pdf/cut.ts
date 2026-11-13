/**
 * Count and cut PDF pages IN THE BROWSER (nothing is uploaded here). `pdf-lib` is loaded on demand so it never reaches a server bundle.
 * Cutting makes a new document with `updateMetadata: false`: pdf-lib otherwise stamps the current time into the file, and the same pages cut
 * twice would get different hashes (the "already imported" check compares hashes).
 */
export async function pdfInfo(file: Blob): Promise<{ ok: true; pageCount: number } | { ok: false; reason: "encrypted" | "unreadable" }> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false });
    return { ok: true, pageCount: doc.getPageCount() };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && /encrypt/i.test(e.message) ? "encrypted" : "unreadable" };
  }
}

/** `pages` are 0-based and in the order wanted. */
export async function cutPdf(file: Blob, pages: number[], name: string): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false });
  const out = await PDFDocument.create({ updateMetadata: false });
  const copied = await out.copyPages(src, pages);
  for (const p of copied) out.addPage(p);
  const bytes = await out.save({ useObjectStreams: true });
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new File([buf], name, { type: "application/pdf" });
}
