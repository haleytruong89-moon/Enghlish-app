import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { WorkDbError } from "@/lib/work/handlers";
import { createSupabaseWorkStore } from "@/lib/work/supabaseStore";

beforeEach(() => rpc.mockReset());

const ACT = "a0000000-0000-4000-8000-000000000001";
const CID = "0b0f6f1e-0000-4000-8000-000000000009";

describe("the work store keeps the database tag of a refused submit (D39 answers_shown)", () => {
  it("a database refusal keeps its message in the WorkDbError (the handler reads the tag; the browser never gets the message)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "eng_submit_attempt: the answers of this work were already shown (answers_shown)" } });
    const err = await createSupabaseWorkStore().submit({ activityId: ACT, clientSubmissionId: CID, content: { answers: { q1: "A" } }, assistance: ["none"], provenance: "in_app" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WorkDbError);
    expect((err as WorkDbError).code).toBe("23514");
    expect((err as WorkDbError).message).toMatch(/\(answers_shown\)$/);
  });
  // the handler side (a WorkDbError with this tag -> 409 answers_shown) is in workHandlers.test.ts
});
