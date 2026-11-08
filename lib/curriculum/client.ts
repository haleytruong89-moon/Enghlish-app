"use client";
/** Browser helpers of the curriculum screens: the one-time upload of a PDF table of contents. JSON calls reuse lib/studio/client. */
import { putToSignedUrl } from "@/lib/storage/clientUpload";
import { checkFile } from "@/lib/storage/rules";
import { sendJson } from "@/lib/studio/client";
import { curriculumErrors } from "@/lib/copy/vi";

export { sendJson };

export async function uploadTocFile(learnerId: string, file: File) {
  const c = checkFile("curriculum_toc", file.type, file.size);
  if (!c.ok) return { ok: false as const, error: c.reason === "too_big" ? "file_too_big" : c.reason === "empty" ? "file_empty" : "file_type" };
  const t = await sendJson<{ file_id: string; upload_url: string; mime: string }>(`/api/learners/${learnerId}/curricula/files`, "POST", { mime: file.type, bytes: file.size });
  if (!t.ok) return { ok: false as const, error: t.error };
  if (!(await putToSignedUrl(t.body.upload_url, file))) return { ok: false as const, error: "file_missing" };
  return { ok: true as const, file: { id: t.body.file_id, mime: file.type, bytes: file.size } };
}

export const curriculumErrorText = (code: string | null): string => (code && curriculumErrors[code]) || curriculumErrors.invalid_body!;
