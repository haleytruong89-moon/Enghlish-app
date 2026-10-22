import { buildPath, checkFile, type AllowedMime, type FileKind } from "./rules";
import type { FileStorage } from "./types";

/** Error codes of a file that fails checkFile (shared by the practice and the level routes). */
export const FILE_ERRORS = {
  type: "file_type",
  empty: "file_empty",
  too_big: "file_too_big",
  kind: "file_type",
} as const;

/**
 * Does storage really hold this file of this child, at the path the server builds from ids, with the type and size the browser
 * claimed? Returns an error code, or null when it does. The path is never taken from the request.
 */
export async function verifyStoredFile(
  storage: FileStorage,
  owner: { familyId: string; learnerId: string },
  kind: FileKind,
  meta: { id: string; mime: AllowedMime; bytes: number },
): Promise<string | null> {
  const c = checkFile(kind, meta.mime, meta.bytes);
  if (!c.ok) return FILE_ERRORS[c.reason];
  const stat = await storage.stat(buildPath({ familyId: owner.familyId, learnerId: owner.learnerId, fileId: meta.id, mime: meta.mime }));
  if (!stat) return "file_missing";
  if (stat.bytes !== meta.bytes || stat.mime !== meta.mime) return "file_mismatch";
  return null;
}
