/** Unfinished imports of a child as rows of "Chờ duyệt" (migration 0027 eng_import_pending). Pure (zod). */
import { z } from "zod";
import { IMPORT_STATUSES } from "./types";

const row = z.object({
  id: z.string(),
  learner_id: z.string(),
  title: z.string(),
  status: z.enum(IMPORT_STATUSES),
  taken_on: z.string(),
  updated_at: z.string(),
  can_confirm: z.boolean(),
});
export type ImportPendingItem = { id: string; learnerId: string; title: string; status: (typeof IMPORT_STATUSES)[number]; takenOn: string; updatedAt: string; canConfirm: boolean };

export function parseImportPending(raw: unknown): ImportPendingItem[] {
  return z.array(row).parse(raw ?? []).map((r) => ({ id: r.id, learnerId: r.learner_id, title: r.title, status: r.status, takenOn: r.taken_on, updatedAt: r.updated_at, canConfirm: r.can_confirm }));
}
