/** Request body of POST /api/learners/:id/then-now (zod, strict). Parsed AFTER the access gate, so outsiders always get 404. */
import { z } from "zod";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const clientId = z.string().min(8).max(100);

/** The tutor picks the pair ("shown") or hides the card from the child ("hidden"; the pair stays on file). The note is checked by the handler and again by the database. */
export const pickBodySchema = z.strictObject({
  client_id: clientId,
  then_id: uuid,
  now_id: uuid,
  note: z.string().max(2000).nullable().optional(),
  status: z.enum(["shown", "hidden"]),
});
export type PickBody = z.infer<typeof pickBodySchema>;
