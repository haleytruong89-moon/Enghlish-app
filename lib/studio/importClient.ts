"use client";
/** Browser side of "Nhập bài soạn sẵn": read one file, send it, turn the answer into a result row. No server imports. */
import { studioImportCopy } from "@/lib/copy/vi";
import { STUDIO_IMPORT_MAX_BYTES } from "./importFile";
import { sendJson } from "./client";
import { studioErrorText } from "./view";

export type ImportRow =
  | { name: string; ok: true; id: string; title: string; items: number; needsReview: number; blocking: number; replayed: boolean; status: string }
  | { name: string; ok: false; message: string };
type Answer = { id: string; status: string; replayed: boolean; title: string; items: number; needs_review: number; blocking: number };

function errorText(code: string, body: unknown): string {
  if (code === "import_wrong_track") {
    const b = (body ?? {}) as { file_track?: string; learner_track?: string };
    return studioImportCopy.wrongTrack(b.file_track ?? "?", b.learner_track ?? "?");
  }
  return studioImportCopy.errors[code] ?? studioErrorText(code);
}

/** FileReader works in every browser we support (and in the jsdom tests, where Blob.text is missing). */
function readText(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsText(f, "utf-8");
  });
}

export async function importOne(learnerId: string, f: File): Promise<ImportRow> {
  if (f.size > STUDIO_IMPORT_MAX_BYTES) return { name: f.name, ok: false, message: studioImportCopy.errors.too_big ?? "" };
  let file: unknown;
  try {
    file = JSON.parse(await readText(f));
  } catch {
    return { name: f.name, ok: false, message: studioImportCopy.errors.not_json ?? "" };
  }
  const r = await sendJson<Answer>(`/api/learners/${learnerId}/studio/imports`, "POST", { file });
  if (!r.ok) return { name: f.name, ok: false, message: errorText(r.error, r.body) };
  const a = r.body;
  return { name: f.name, ok: true, id: a.id, title: a.title, items: a.items, needsReview: a.needs_review, blocking: a.blocking, replayed: a.replayed, status: a.status };
}
