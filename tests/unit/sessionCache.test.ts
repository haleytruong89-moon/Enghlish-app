import { describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/auth/requireAccess";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({}) }));

const { makeSession } = await import("@/lib/auth/session");

/** A per-request memo like React.cache: same args → same promise. */
function memo<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  const m = new Map<string, Promise<R>>();
  return (...a: A) => {
    const k = JSON.stringify(a);
    if (!m.has(k)) m.set(k, fn(...a));
    return m.get(k)!;
  };
}

describe("session readers", () => {
  const member: Member = { id: "m1", userId: "u1", familyId: "f", role: "tutor", displayName: "T" };
  it("reads the user and the member once per request, however many callers ask", async () => {
    const fetchUser = vi.fn(async () => ({ id: "u1" }) as never);
    const fetchMember = vi.fn(async () => member);
    const s = makeSession({ memo, fetchUser, fetchMember });
    await Promise.all([s.getAuthUser(), s.getAuthUser(), s.getMemberByUserId("u1"), s.getMemberByUserId("u1")]);
    await s.getMemberByUserId("u1");
    expect(fetchUser).toHaveBeenCalledTimes(1);
    expect(fetchMember).toHaveBeenCalledTimes(1);
  });
  it("a different user id is a different read", async () => {
    const fetchMember = vi.fn(async () => member);
    const s = makeSession({ memo, fetchUser: async () => null, fetchMember });
    await s.getMemberByUserId("u1");
    await s.getMemberByUserId("u2");
    expect(fetchMember).toHaveBeenCalledTimes(2);
  });
});
