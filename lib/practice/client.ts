/** Browser-side steps shared by the student's and the tutor's "send" screens. No server-only imports. */
import { assignPage, practiceStudent } from "@/lib/copy/vi";
import { postJson, type PostFail } from "@/lib/tutorwork/client";
import { putToSignedUrl, type Prepared } from "@/lib/storage/clientUpload";

export type UploadedFile = { id: string; mime: string; bytes: number };
export type UploadResult = { ok: true; files: UploadedFile[] } | { ok: false; error: string };

/**
 * Upload every file: ask the server for a one-time link (it checks who you are and builds the path), PUT the file there, and
 * remember {id, mime, bytes} for the registration call. Stops at the first failure with an error code the screen can show.
 */
export async function uploadAll(files: Prepared[], endpoint: string, extra: Record<string, unknown>): Promise<UploadResult> {
  const done: UploadedFile[] = [];
  for (const f of files) {
    const r = await postJson<{ file_id: string; upload_url: string }>(endpoint, { ...extra, mime: f.mime, bytes: f.bytes });
    if (!r.ok) return { ok: false, error: codeOf(r) };
    const sent = await putToSignedUrl(r.body.upload_url, f.blob);
    if (!sent) return { ok: false, error: "uploadFailed" };
    done.push({ id: r.body.file_id, mime: f.mime, bytes: f.bytes });
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
  if (code === "unreadable" && who === "staff") return practiceStudent.errors.unreadable;
  return who === "student" ? "Chưa gửi được. Bạn thử lại sau ít phút nhé." : "Chưa lưu được. Bạn thử lại sau ít phút.";
}
