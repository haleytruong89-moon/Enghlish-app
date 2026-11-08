"use client";
/** Browser helpers of the import screens: the one-time upload of the finished work and the key, and the file fingerprint (sha-256). JSON calls reuse lib/studio/client. */
import { importCopy } from "@/lib/copy/vi";
import { putToSignedUrl } from "@/lib/storage/clientUpload";
import { checkFile } from "@/lib/storage/rules";
import { sendJson } from "@/lib/studio/client";

export { sendJson };

export async function uploadImportFile(learnerId: string, purpose: "import_work" | "import_key", file: File) {
  const c = checkFile(purpose, file.type, file.size);
  if (!c.ok) return { ok: false as const, error: c.reason === "too_big" ? "file_too_big" : c.reason === "image_too_big" ? "image_too_big" : c.reason === "empty" ? "file_empty" : "file_type" };
  const t = await sendJson<{ file_id: string; upload_url: string; mime: string }>(`/api/learners/${learnerId}/imports/files`, "POST", { purpose, mime: file.type, bytes: file.size });
  if (!t.ok) return { ok: false as const, error: t.error };
  if (!(await putToSignedUrl(t.body.upload_url, file))) return { ok: false as const, error: "file_missing" };
  return { ok: true as const, file: { id: t.body.file_id, mime: file.type, bytes: file.size } };
}

/** sha-256 of the file as lower-case hex (the "same paper again?" check). */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const importErrorText = (code: string | null): string => (code && importCopy.errors[code]) || importCopy.errors.invalid_body!;
