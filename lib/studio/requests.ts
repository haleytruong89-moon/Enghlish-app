/** Request bodies of the Studio routes (zod, strict). Files are {id, mime, bytes}: the path is always built by the server. */
import { z } from "zod";
import { FILE_ID_RE } from "@/lib/storage/rules";
import { studioDraftSchema, STUDIO_LIMITS } from "./schema";

const clientId = z.string().trim().min(8).max(100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fileMeta = z.strictObject({ id: z.string().regex(FILE_ID_RE), mime: z.string().max(200), bytes: z.number().int() });
const base = z.string().min(10).max(64);

export const studioUploadBodySchema = z.strictObject({
  purpose: z.enum(["studio_test", "studio_key"]),
  mime: z.string().max(200),
  bytes: z.number().int(),
});
export const createDraftBodySchema = z.strictObject({
  title: z.string().trim().min(1).max(STUDIO_LIMITS.title),
  mode: z.enum(["ai", "manual"]),
  test_file: fileMeta.nullable(),
  key_file: fileMeta.nullable(),
  client_id: clientId,
});
export const saveDraftBodySchema = z.strictObject({
  title: z.string().trim().min(1).max(STUDIO_LIMITS.title),
  payload: studioDraftSchema,
  base_updated_at: base,
});
export const approveBodySchema = z.strictObject({ base_updated_at: base });
export const assignStudioBodySchema = z.strictObject({ start_on: isoDate, due_on: isoDate, client_id: clientId });
export const editBodySchema = z.strictObject({ client_id: clientId });
export const aiSettingsBodySchema = z.strictObject({ enabled: z.boolean() });
export const decideBodySchema = z.strictObject({
  items: z.array(z.strictObject({ item_id: z.string().regex(/^q[1-9][0-9]{0,2}$/), result: z.enum(["correct", "incorrect"]) })).min(1).max(300),
  client_id: clientId,
});
export type FileMetaBody = z.infer<typeof fileMeta>;
