/**
 * "Nhập bài soạn sẵn": the file format of a Studio draft made outside the app (docs/STUDIO_IMPORT_FORMAT.md). Pure and browser-safe:
 * the browser only reads the size limit; the server parses the file with the strict stored-draft schema.
 */
import { z } from "zod";
import { STUDIO_LIMITS, studioDraftSchema } from "./schema";

export const STUDIO_IMPORT_FORMAT = "learning-os.studio-draft";
export const STUDIO_IMPORT_VERSION = 1;
/** Largest file the browser sends (a 300-item draft is far below this). */
export const STUDIO_IMPORT_MAX_BYTES = 1_000_000;

export const studioImportFileSchema = z.strictObject({
  format: z.literal(STUDIO_IMPORT_FORMAT),
  version: z.literal(STUDIO_IMPORT_VERSION),
  /** The track id the file was made for; must equal the child's track. */
  track: z.string().regex(/^[A-Z]$/),
  title: z.string().trim().min(1).max(STUDIO_LIMITS.title),
  payload: studioDraftSchema,
});
export type StudioImportFile = z.infer<typeof studioImportFileSchema>;
