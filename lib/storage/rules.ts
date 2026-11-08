/**
 * Rules of the private file bucket `english-work` (migration 0016). Pure: no I/O, so the same checks run on the server (the only
 * place that is trusted) and in the browser (to answer quickly). Nothing here knows about Supabase.
 *
 * Layout: {family_id}/{learner_id | shared}/{file_id}.{pdf|png|jpg|webp|docx}. The database CHECKs the same shape (files_path_shape), and
 * the path is always BUILT from ids by the server, never taken from the browser.
 */

export const BUCKET = "english-work";
/** 15 MB: the same limit is on the bucket and in the files table. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** A signed download link lives 5 minutes; every view asks for a fresh one. */
export const SIGNED_URL_TTL_SECONDS = 300;
/** Photos and screenshots are shrunk in the browser so their longest side is at most this many pixels. */
export const MAX_IMAGE_SIDE = 1600;
/** Upload links the server hands out per child per 24 hours (counted in the database; the same number is in migration 0016). */
export const UPLOAD_LINKS_PER_DAY = 60;
/** Files in one submission. */
export const MAX_FILES_PER_SUBMISSION = 6;

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
/** Word .docx: accepted ONLY for a Studio test or answer key (Studio B1; same rule as files_kind_mime in 0024). */
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
export const STUDIO_MIMES = ["application/pdf", DOCX_MIME] as const;
export const ALLOWED_MIMES = ["application/pdf", ...IMAGE_MIMES, DOCX_MIME] as const;
export type AllowedMime = (typeof ALLOWED_MIMES)[number];

/** What a stored file is for (column files.kind). */
export const FILE_KINDS = ["assignment_pdf", "answer_key", "result_image", "work_photo", "external_result", "studio_test", "studio_key", "curriculum_toc", "import_work", "import_key"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const EXTENSION: Record<AllowedMime, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function isAllowedMime(mime: unknown): mime is AllowedMime {
  return typeof mime === "string" && (ALLOWED_MIMES as readonly string[]).includes(mime);
}

export function isImageMime(mime: string): boolean {
  return (IMAGE_MIMES as readonly string[]).includes(mime);
}

export function extensionFor(mime: AllowedMime): string {
  return EXTENSION[mime];
}

export type FileCheck = { ok: true } | { ok: false; reason: "type" | "empty" | "too_big" | "kind" };

/**
 * Is this (mime, size) acceptable for this purpose? An assignment sheet must be a PDF; a result screenshot must be an image; an answer
 * key and a photo of paper work may be either.
 */
export function checkFile(kind: FileKind, mime: unknown, bytes: unknown): FileCheck {
  if (!isAllowedMime(mime)) return { ok: false, reason: "type" };
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 1) return { ok: false, reason: "empty" };
  if (bytes > MAX_FILE_BYTES) return { ok: false, reason: "too_big" };
  const studio = kind === "studio_test" || kind === "studio_key";
  if (mime === DOCX_MIME && !studio && kind !== "import_key") return { ok: false, reason: "kind" };
  if (studio && !(STUDIO_MIMES as readonly string[]).includes(mime)) return { ok: false, reason: "kind" };
  if ((kind === "assignment_pdf" || kind === "curriculum_toc") && mime !== "application/pdf") return { ok: false, reason: "kind" };
  if (kind === "import_work" && mime === DOCX_MIME) return { ok: false, reason: "kind" };
  if (kind === "result_image" && !isImageMime(mime)) return { ok: false, reason: "kind" };
  return { ok: true };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const FILE_ID_RE = new RegExp(`^${UUID}$`);
const PATH_RE = new RegExp(`^(${UUID})/(shared|${UUID})/(${UUID})\\.(pdf|png|jpg|webp|docx)$`);

export type PathParts = { familyId: string; learnerId: string | null; fileId: string; mime: AllowedMime };

/** `{family}/{learner|shared}/{file}.{ext}` - lower-case ids only, so the same file can never get two different paths. */
export function buildPath(p: PathParts): string {
  for (const id of [p.familyId, p.fileId, ...(p.learnerId !== null ? [p.learnerId] : [])]) {
    if (!FILE_ID_RE.test(id)) throw new Error("buildPath: ids must be lower-case uuids");
  }
  return `${p.familyId}/${p.learnerId ?? "shared"}/${p.fileId}.${extensionFor(p.mime)}`;
}

export function parsePath(path: string): { familyId: string; learnerId: string | null; fileId: string; ext: string } | null {
  const m = PATH_RE.exec(path);
  if (!m) return null;
  return { familyId: m[1] as string, learnerId: m[2] === "shared" ? null : (m[2] as string), fileId: m[3] as string, ext: m[4] as string };
}

/** The folder that holds every file of one child (what the purge helper deletes). */
export function learnerFolder(familyId: string, learnerId: string): string {
  if (!FILE_ID_RE.test(familyId) || !FILE_ID_RE.test(learnerId)) throw new Error("learnerFolder: ids must be lower-case uuids");
  return `${familyId}/${learnerId}`;
}

/** A file name safe to offer in the browser's "save as" box: no path pieces, no control characters, never empty. */
export function safeDownloadName(title: string, mime: AllowedMime): string {
  const base =
    title
      .normalize("NFC")
      .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)
      .trim() || "bai-luyen";
  return `${base}.${extensionFor(mime)}`;
}
