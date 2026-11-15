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

/**
 * A PDF with its document details blanked before it leaves the device: title, author, subject, keywords, creator, producer and the
 * XMP metadata stream (/Metadata on the catalogue). Nothing else is changed. Null when the file cannot be read (damaged or encrypted).
 * Residual risk: pictures INSIDE the PDF keep whatever metadata they carry (not rewritten here); see docs/DESIGN.md 19.22.
 */
export async function scrubPdf(file: Blob): Promise<Blob | null> {
  try {
    const { PDFDocument, PDFName, PDFRef } = await import("pdf-lib");
    const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false });
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setCreator("");
    doc.setProducer("");
    // Drop the XMP stream object itself too: pdf-lib writes every registered object, so an unlinked one would still travel inside the file.
    const xmp = doc.catalog.get(PDFName.of("Metadata"));
    doc.catalog.delete(PDFName.of("Metadata"));
    if (xmp instanceof PDFRef) doc.context.delete(xmp);
    const bytes = await doc.save({ useObjectStreams: true });
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    return new Blob([buf], { type: "application/pdf" });
  } catch {
    return null;
  }
}
