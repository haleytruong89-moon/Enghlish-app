/**
 * A tutor's Word test or answer key (.docx) → plain text for the AI (spec §5.2). mammoth (BSD-2-Clause) reads the document XML; images,
 * tables of contents and styles are dropped. Imported only by server code (lib/studio/extract.ts); no server-only marker so unit tests can
 * load it. Never logs the text.
 */
import mammoth from "mammoth";

export class DocxError extends Error {
  constructor(public readonly code: "docx_unreadable" | "docx_empty" | "docx_too_big" | "docx_too_long") {
    super(code);
    this.name = "DocxError";
  }
}

/** At most this much text goes to the AI (a 60-item test is ~15 000 characters). Longer = refused with a clear message, never cut silently. */
export const MAX_DOCX_TEXT = 200_000;
/** A .docx is a zip: its files must not unpack to more than this (zip-bomb guard, checked from the zip directory before mammoth runs). */
export const MAX_DOCX_UNZIPPED_BYTES = 20 * 1024 * 1024;

/** Sum of the declared uncompressed sizes in the zip central directory. Throws docx_unreadable when it is not a readable zip. */
export function declaredUnzippedBytes(bytes: Uint8Array): number {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i -= 1) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocxError("docx_unreadable");
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  let total = 0;
  for (let k = 0; k < count; k += 1) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new DocxError("docx_unreadable");
    total += b.readUInt32LE(p + 24);
    p += 46 + b.readUInt16LE(p + 28) + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return total;
}

export async function docxToText(bytes: Uint8Array): Promise<string> {
  if (declaredUnzippedBytes(bytes) > MAX_DOCX_UNZIPPED_BYTES) throw new DocxError("docx_too_big");
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) }));
  } catch {
    throw new DocxError("docx_unreadable");
  }
  const text = value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new DocxError("docx_empty");
  if (text.length > MAX_DOCX_TEXT) throw new DocxError("docx_too_long");
  return text;
}
