/**
 * Browser-side helpers for sending a picture or a PDF to the private bucket: shrink big images first, then PUT the file straight to
 * the one-time link the server made (so the file never passes through the app server and Vercel's 4.5 MB request limit does not matter).
 * No server-only imports and no secrets: the link itself carries the permission.
 */
import { MAX_FILE_BYTES, MAX_IMAGE_SIDE, isAllowedMime, isImageMime, type AllowedMime } from "./rules";

export type Prepared = { blob: Blob; mime: AllowedMime; bytes: number; name: string };
export type PrepareResult = { ok: true; file: Prepared } | { ok: false; reason: "type" | "too_big" | "unreadable" };

/** Size after shrinking so the longest side is at most `max` (never enlarges). `scaled` tells whether anything changed. */
export function fitWithin(width: number, height: number, max: number = MAX_IMAGE_SIDE): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (!(longest > max) || width <= 0 || height <= 0) return { width, height, scaled: false };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

/** What a shrunk picture is saved as: screenshots stay PNG (sharp text), everything else becomes JPEG. */
export function outputMime(mime: string): "image/png" | "image/jpeg" {
  return mime === "image/png" ? "image/png" : "image/jpeg";
}

/**
 * Check a picked / pasted file and shrink an image to at most MAX_IMAGE_SIDE pixels on the longest side. PDFs pass through unchanged.
 * An image that is already small enough and under the size limit is sent as it is.
 */
export async function prepareFile(file: File | Blob, nameHint = "anh"): Promise<PrepareResult> {
  const mime = file.type;
  if (!isAllowedMime(mime)) return { ok: false, reason: "type" };
  const name = "name" in file && typeof file.name === "string" && file.name ? file.name : nameHint;
  if (!isImageMime(mime)) {
    return file.size > MAX_FILE_BYTES ? { ok: false, reason: "too_big" } : { ok: true, file: { blob: file, mime, bytes: file.size, name } };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  try {
    const fit = fitWithin(bitmap.width, bitmap.height);
    if (!fit.scaled && file.size <= MAX_FILE_BYTES) return { ok: true, file: { blob: file, mime, bytes: file.size, name } };
    const canvas = document.createElement("canvas");
    canvas.width = fit.width;
    canvas.height = fit.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, reason: "unreadable" };
    const out = outputMime(mime);
    if (out === "image/jpeg") {
      // JPEG has no transparency: paint white first so a see-through picture does not turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, fit.width, fit.height);
    }
    ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, out, 0.85));
    if (!blob) return { ok: false, reason: "unreadable" };
    if (blob.size > MAX_FILE_BYTES) return { ok: false, reason: "too_big" };
    return { ok: true, file: { blob, mime: out, bytes: blob.size, name } };
  } finally {
    bitmap.close();
  }
}

/** PUT the file to the one-time upload link (same request supabase-js makes for a signed upload). True when storage accepted it. */
export async function putToSignedUrl(url: string, blob: Blob): Promise<boolean> {
  try {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", blob);
    const res = await fetch(url, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
    return res.ok;
  } catch {
    return false;
  }
}
