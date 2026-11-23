import { describe, expect, it, vi } from "vitest";
import { childDbStatus, handleAgain, handleLookup, saveBodySchema } from "@/lib/notebook/handlers";
import type { LookupDeps } from "@/lib/notebook/lookup";

const deps = (over: Partial<LookupDeps> = {}) => ({
  store: { context: vi.fn(async () => ({ learner_id: "l", family_id: "f", language: "vi", band: "A2-B1", lookups_today: 60, lookup_limit: 60, ai_lookups_today: 0, ai_lookup_limit: 30, consent_version: "v3" })), record: vi.fn(async () => ({ id: "a", replayed: false })) },
  noticeVersion: "v3", call: vi.fn(), prompts: { card: "", check: "", sense: "", again: "" }, models: { card: "claude-sonnet-5-5", check: "claude-haiku-5-5" },
  ...over,
}) as unknown as LookupDeps;

describe("child tutor routes: bodies", () => {
  it("401 without a user, 400 on an unknown field, passes word / sentence / client id to the turn", async () => {
    expect(await handleLookup({ ...deps(), user: null }, { word: "make", client_id: "client-0001" })).toEqual({ status: 401, body: { error: "unauthenticated" } });
    expect(await handleLookup({ ...deps(), user: { id: "u" } }, { word: "make", client_id: "client-0001", learner_id: "x" })).toEqual({ status: 400, body: { error: "invalid_body" } });
    const d = deps();
    const r = await handleLookup({ ...d, user: { id: "u" } }, { word: "make", context: "I make tea.", client_id: "client-0001" });
    expect(d.store.context).toHaveBeenCalledWith({ userId: "u", clientId: "client-0001" });
    expect(r.body).toMatchObject({ kind: "fixed", fixed: "daily_limit" });
  });
  it("explain again: the ask id must be a uuid", async () => {
    expect(await handleAgain({ ...deps(), user: { id: "u" } }, "nope", { client_id: "client-0001" })).toEqual({ status: 404, body: { error: "not_found" } });
  });
  it("save needs a card uuid and a client id; database errors map to what the screen explains", () => {
    expect(saveBodySchema.safeParse({ card_id: "x", client_id: "client-0001" }).success).toBe(false);
    expect(childDbStatus({ code: "42501" })).toEqual({ status: 403, error: "forbidden" });
    expect(childDbStatus({ code: "PGRST202" })).toEqual({ status: 409, error: "notebook_unavailable" });
    expect(childDbStatus({ code: "P0002" })).toEqual({ status: 404, error: "not_found" });
  });
});
