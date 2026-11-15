/**
 * W4c1 · pictures of paper work, prepared ON THE DEVICE before anything is sent: a quarter-turn rotation, a longest side of at most
 * 2400 px and JPEG at quality 0.85. The pure part (sizes, kinds) is unit-tested; the canvas part runs in the browser only.
 * Nothing here talks to a server: the prepared pages are uploaded afterwards through one-time links (lib/practice/client.ts).
 */
import { fitWithin, type Prepared } from "@/lib/storage/clientUpload";
import { MAX_FILE_BYTES, type AllowedMime } from "@/lib/storage/rules";
import type { Quarter } from "./pageOrder";

export const PAPER_MAX_SIDE = 2400;
export const PAPER_JPEG_QUALITY = 0.85;

/** Size of the finished picture: a quarter or three-quarter turn swaps width and height; the longest side is then cut to `max` (never enlarged). */
export function paperTargetSize(width: number, height: number, quarter: Quarter, max: number = PAPER_MAX_SIDE): { width: number; height: number } {
  const swapped = quarter % 2 === 1;
  const w = swapped ? height : width;
  const h = swapped ? width : height;
  const { width: fw, height: fh } = fitWithin(w, h, max);
  return { width: fw, height: fh };
}

export type PaperKind = "image" | "heic" | "pdf" | "other";

/** What a picked file is. iPads can hand over HEIC (type "image/heic", or no type at all with a .heic name): we try to open it, and say so if the browser cannot. */
export function paperKind(type: string, name: string): PaperKind {
  const t = type.toLowerCase();
  if (t === "application/pdf") return "pdf";
  if (t === "image/png" || t === "image/jpeg" || t === "image/webp") return "image";
  if (t === "image/heic" || t === "image/heif" || (t === "" && /\.(heic|heif)$/i.test(name))) return "heic";
  return "other";
}

export type PageResult = { ok: true; file: Prepared } | { ok: false; reason: "type" | "too_big" | "unreadable" };

/** Draw the picture turned by `quarter` onto a canvas no larger than `max` and encode it as JPEG. Browser only. */
export async function renderPaperImage(source: Blob, quarter: Quarter, name: string, max: number = PAPER_MAX_SIDE): Promise<PageResult> {
  let bitmap: ImageBitmap;
  try {
    // The browser applies the photo's own orientation (EXIF) when it opens the picture; the quarter turns are on top of that.
    bitmap = await createImageBitmap(source);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  try {
    const size = paperTargetSize(bitmap.width, bitmap.height, quarter, max);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, reason: "unreadable" };
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.translate(size.width / 2, size.height / 2);
    ctx.rotate((quarter * Math.PI) / 2);
    // Before the turn the picture has the un-swapped shape.
    const dw = quarter % 2 === 1 ? size.height : size.width;
    const dh = quarter % 2 === 1 ? size.width : size.height;
    ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PAPER_JPEG_QUALITY));
    if (!blob) return { ok: false, reason: "unreadable" };
    if (blob.size > MAX_FILE_BYTES) return { ok: false, reason: "too_big" };
    return { ok: true, file: { blob, mime: "image/jpeg" as AllowedMime, bytes: blob.size, name } };
  } finally {
    bitmap.close();
  }
}

/** A picked file → a page: a PDF passes through unchanged (size-checked), an image is shrunk to JPEG now (rotation 0). */
export async function preparePaperFile(file: File, nameHint: string): Promise<PageResult> {
  const kind = paperKind(file.type, file.name);
  if (kind === "other") return { ok: false, reason: "type" };
  const name = file.name || nameHint;
  if (kind === "pdf") {
    return file.size > MAX_FILE_BYTES ? { ok: false, reason: "too_big" } : { ok: true, file: { blob: file, mime: "application/pdf", bytes: file.size, name } };
  }
  return renderPaperImage(file, 0, name);
}
