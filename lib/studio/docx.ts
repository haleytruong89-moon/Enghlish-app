/**
 * A tutor's Word test or answer key (.docx) → plain text for the AI (spec §5.2). mammoth (BSD-2-Clause) reads the document XML; images,
 * tables of contents and styles are dropped. Imported only by server code (lib/studio/extract.ts); no server-only marker so unit tests can
 * load it. Never logs the text.
 */
import mammoth from "mammoth";

export class DocxError extends Error {
  constructor(public readonly code: "docx_unreadable" | "docx_empty") {
    super(code);
    this.name = "DocxError";
  }
}

/** At most this much text goes to the AI (a 60-item test is ~15 000 characters). */
export const MAX_DOCX_TEXT = 200_000;

export async function docxToText(bytes: Uint8Array): Promise<string> {
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) }));
  } catch {
    throw new DocxError("docx_unreadable");
  }
  const text = value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new DocxError("docx_empty");
  return text.slice(0, MAX_DOCX_TEXT);
}
