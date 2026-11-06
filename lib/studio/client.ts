"use client";
/** Browser helpers of the Studio screens: JSON calls and the one-time upload of a test / answer file. No secrets, no server imports. */
import { putToSignedUrl } from "@/lib/storage/clientUpload";
import { checkFile, type FileKind } from "@/lib/storage/rules";

export type Sent<T> = { ok: true; status: number; body: T } | { ok: false; status: number; error: string; body: unknown };

export async function sendJson<T>(url: string, method: "POST" | "PUT" | "GET", body?: unknown): Promise<Sent<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) return { ok: false, status: res.status, error: json?.error ?? "invalid", body: json };
    return { ok: true, status: res.status, body: json as T };
  } catch {
    return { ok: false, status: 0, error: "network", body: null };
  }
}

/** Ask the server for a one-time link for this file, PUT the file straight to storage, return {id, mime, bytes} for the draft. */
export async function uploadStudioFile(learnerId: string, purpose: Extract<FileKind, "studio_test" | "studio_key">, file: File) {
  const c = checkFile(purpose, file.type, file.size);
  if (!c.ok) return { ok: false as const, error: c.reason === "too_big" ? "file_too_big" : c.reason === "empty" ? "file_empty" : "file_type" };
  const t = await sendJson<{ file_id: string; upload_url: string; mime: string }>(`/api/learners/${learnerId}/studio/files`, "POST", { purpose, mime: file.type, bytes: file.size });
  if (!t.ok) return { ok: false as const, error: t.error };
  // Same request as the practice uploads (lib/storage/clientUpload.ts): storage records the file's own type, checked again on the server.
  if (!(await putToSignedUrl(t.body.upload_url, file))) return { ok: false as const, error: "file_missing" };
  return { ok: true as const, file: { id: t.body.file_id, mime: file.type, bytes: file.size } };
}
