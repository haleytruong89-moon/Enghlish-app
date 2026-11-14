import { checkPages, type PdfFlow } from "@/lib/pdf/limits";
import { buildPath, type AllowedMime } from "./rules";
import type { FileDownloader } from "./types";

type StoredFile = { id: string; mime: string };

/**
 * Pages of a stored PDF, counted on the server (the browser check can be bypassed, so this is the one that counts). `ignoreEncryption`: a file
 * that only has an owner password still has a readable page tree. Not a PDF → null; unreadable → null as well and the caller logs it and lets the
 * file through (the AI then judges it, as before).
 */
export async function countStoredPdfPages(storage: FileDownloader, path: string): Promise<number | null> {
  try {
    const bytes = await storage.download(path);
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return null;
  }
}

/**
 * Same limits as the picker in the browser (lib/pdf/limits.ts), enforced on arrival of an AI job. Answer-key PDFs count even when the main file
 * is Word or a picture. Returns "pages_too_long" when the job is over the hard limit, otherwise null. Files that are not PDFs have no page count.
 */
export async function overPageLimit(
  deps: { storage: FileDownloader; log?: (err: unknown) => Promise<void> },
  owner: { familyId: string; learnerId: string },
  flow: Exclude<PdfFlow, "assignment">,
  main: StoredFile | null,
  other: StoredFile | null,
): Promise<"pages_too_long" | null> {
  const count = async (f: StoredFile | null): Promise<number | null> => {
    if (!f || f.mime !== "application/pdf") return null;
    const n = await countStoredPdfPages(deps.storage, buildPath({ ...owner, fileId: f.id, mime: f.mime as AllowedMime }));
    if (n === null) await deps.log?.(new Error(`page count unreadable (${flow}, file ${f.id}): allowed through`));
    return n;
  };
  const [m, o] = [await count(main), await count(other)];
  if (m === null && o === null) return null;
  return checkPages(flow, m, o).level === "block" ? "pages_too_long" : null;
}
