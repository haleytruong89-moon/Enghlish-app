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
  // Plain objects (no object streams): every byte of the result is readable, so a leftover would be visible to the test and to a reader of the file.
    const bytes = await out.save({ useObjectStreams: false });
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new File([buf], name, { type: "application/pdf" });
}

/**
 * A PDF with its document details removed before it leaves the device. The output is REBUILT: a new document gets only the copied pages, so the
 * Info dictionary (including custom keys), the XMP stream, orphaned objects and the catalogue extras of the original do not come along; creator /
 * producer / dates are not stamped (updateMetadata:false). Null when the file cannot be read (damaged or encrypted).
 * Residual risk: page-level /Metadata and pictures INSIDE the PDF keep whatever they carry (see docs/DESIGN.md 19.22). Digital signatures do not survive.
 */
export async function scrubPdf(file: Blob): Promise<Blob | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false });
    const out = await PDFDocument.create({ updateMetadata: false });
    for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
    // Plain objects (no object streams): every byte of the result is readable, so a leftover would be visible to the test and to a reader of the file.
    const bytes = await out.save({ useObjectStreams: false });
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    return new Blob([buf], { type: "application/pdf" });
  } catch {
    return null;
  }
}
