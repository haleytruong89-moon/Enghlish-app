/** Browser-side steps shared by the student's and the tutor's "send" screens. No server-only imports. */
import { assignPage, practiceStudent } from "@/lib/copy/vi";
import { postJson, type PostFail } from "@/lib/tutorwork/client";
import { putToSignedUrl, type Prepared } from "@/lib/storage/clientUpload";

export type UploadedFile = { id: string; mime: string; bytes: number };
export type UploadResult = { ok: true; files: UploadedFile[] } | { ok: false; error: string };
/** Files already in storage, by the prepared file that was sent: kept across retries so only the failed ones are sent again. */
export type UploadCache = Map<Prepared, UploadedFile>;

/**
 * One "send" try = one client id. A retry after a lost answer must use the SAME client id and the same files (the database then
 * recognises it as the same work and answers "already done"); if anything the child or tutor chose has changed, it is new work and
 * gets a new id.
 */
export type SendAttempt = { id: string; signature: string };
export function nextAttempt(prev: SendAttempt | null, signature: string, newId: () => string = () => crypto.randomUUID()): SendAttempt {
  return prev && prev.signature === signature ? prev : { id: newId(), signature };
}

/**
 * Upload every file: ask the server for a one-time link (it checks who you are and builds the path), PUT the file there, and
 * remember {id, mime, bytes} for the registration call. Stops at the first failure with an error code the screen can show.
 */
export async function uploadAll(files: Prepared[], endpoint: string, extra: Record<string, unknown>, cache: UploadCache = new Map()): Promise<UploadResult> {
  const done: UploadedFile[] = [];
  for (const f of files) {
    const known = cache.get(f);
    if (known) {
      done.push(known); // already in storage from an earlier try: a second PUT to its one-time link would fail
      continue;
    }
    const r = await postJson<{ file_id: string; upload_url: string }>(endpoint, { ...extra, mime: f.mime, bytes: f.bytes });
    if (!r.ok) return { ok: false, error: codeOf(r) };
    const sent = await putToSignedUrl(r.body.upload_url, f.blob);
    if (!sent) return { ok: false, error: "uploadFailed" };
    const uploaded = { id: r.body.file_id, mime: f.mime, bytes: f.bytes };
    cache.set(f, uploaded);
    done.push(uploaded);
  }
  return { ok: true, files: done };
}

/** The error code of a failed call: the server's own code when it sent one, else the HTTP class. */
export function codeOf(r: PostFail): string {
  if (r.status === 0) return "uploadFailed";
  return r.error;
}

/** A friendly sentence for an error code. `student` speaks to the child ("bạn"), staff to an adult. */
export function practiceErrorText(code: string, who: "student" | "staff"): string {
  const table = who === "student" ? (practiceStudent.errors as Record<string, unknown>) : (assignPage.errors as Record<string, unknown>);
  const hit = table[code];
  if (typeof hit === "string") return hit;
  return who === "student" ? practiceStudent.errors.generic : assignPage.errors.generic ?? "";
}
