import "server-only";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";

/** E2a · "Con hỏi Gia sư" (D-G8): the asks of one child for the parent and the child's tutor. The 0041 function checks who may read. */
const rowSchema = z.object({
  id: z.string(), at: z.string(), kind: z.string(), child_text: z.string(), context_text: z.string().nullable(), headword: z.string().nullable(),
  card_id: z.string().nullable(), fixed_code: z.string().nullable(), guard: z.string(), saved: z.boolean(), rating: z.string().nullable(),
});
export type TutorAskRow = { id: string; at: string; kind: string; childText: string; contextText: string | null; headword: string | null; cardId: string | null; fixedCode: string | null; guard: string; saved: boolean; rating: string | null };
export const TUTOR_ASKS_PAGE = 50;

/** null = migration 0041 not applied (the page says so softly); a refusal of the function = not this child's adult → notFound by the caller. */
export async function loadTutorAsks(learnerId: string, before: string | null): Promise<TutorAskRow[] | null | "forbidden"> {
  const { data, error } = await (await createUserClient()).rpc("eng_tutor_asks_for", { p_learner: learnerId, p_before: before, p_limit: TUTOR_ASKS_PAGE });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    if (error.code === "42501") return "forbidden";
    throw new Error(`eng_tutor_asks_for failed: ${error.code ?? "error"}`);
  }
  return z.array(rowSchema).parse(data ?? []).map((r) => ({
    id: r.id, at: r.at, kind: r.kind, childText: r.child_text, contextText: r.context_text, headword: r.headword, cardId: r.card_id,
    fixedCode: r.fixed_code, guard: r.guard, saved: r.saved, rating: r.rating,
  }));
}
