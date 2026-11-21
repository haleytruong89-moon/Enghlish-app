import { describe, expect, it, vi } from "vitest";
import { tutorCopy } from "@/lib/copy/vi";
import { handleStudentHint } from "@/lib/tutor/handler";
import type { TutorDeps } from "@/lib/tutor/turn";

const ACT = "a1000000-0000-4000-8000-000000000001";
const deps = (user: { id: string } | null) => {
  const store = { context: vi.fn(async () => ({ replay: { kind: "hint", level: 1, shown_text: "x", fixed_code: null } })), gate: vi.fn(), logRun: vi.fn(), record: vi.fn() };
  const d: TutorDeps & { user: { id: string } | null } = { user, store, noticeVersion: "ai-studio-tutor-v2", call: vi.fn(), prompts: { hint: "", check: "" }, models: { hint: "claude-sonnet-5-5", check: "claude-haiku-5-5" }, copy: tutorCopy };
  return { d, store };
};

describe("POST /api/student/activities/:id/hints", () => {
  it("needs a login; the user id comes from the session, never from the body", async () => {
    expect((await handleStudentHint(deps(null).d, ACT, { item_id: "q1", client_id: "client-0001" })).status).toBe(401);
    const { d, store } = deps({ id: "u-child" });
    await handleStudentHint(d, ACT, { item_id: "q1", client_id: "client-0001" });
    expect(store.context).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-child", activityId: ACT, itemId: "q1" }));
    expect((await handleStudentHint(d, ACT, { item_id: "q1", client_id: "client-0001", user_id: "u-other" })).status).toBe(400);
  });
  it("a bad step id is 404; a bad item, a short client id or a question over 200 characters is 400", async () => {
    const { d, store } = deps({ id: "u" });
    expect((await handleStudentHint(d, "nope", { item_id: "q1", client_id: "client-0001" })).status).toBe(404);
    for (const b of [{ item_id: "x1", client_id: "client-0001" }, { item_id: "q1", client_id: "short" }, { item_id: "q1", client_id: "client-0001", question: "x".repeat(201) }]) {
      expect((await handleStudentHint(d, ACT, b)).status).toBe(400);
    }
    expect(store.context).not.toHaveBeenCalled();
  });
});
