import { describe, expect, it, vi } from "vitest";
import { AccessError, type requireAccess } from "@/lib/auth/requireAccess";

vi.mock("@/lib/desk/load", () => ({ loadPendingRows: vi.fn() }));
import { handlePendingCount } from "@/lib/desk/countRoute";
import type { loadPendingRows } from "@/lib/desk/load";

const L = "a0000000-0000-4000-8000-000000000001";
const grant = (role: "tutor" | "parent") => ({ member: { id: "m1", role }, learner: { id: L }, action: "work:review" });
const accessOk = (role: "tutor" | "parent" = "tutor") => vi.fn(async () => grant(role)) as unknown as typeof requireAccess;
const accessFail = (status: 401 | 403 | 404) => vi.fn(async () => { throw new AccessError(status, status === 401 ? "unauthenticated" : status === 403 ? "forbidden" : "not_found"); }) as unknown as typeof requireAccess;
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}` }));
const load = (r: { rows: unknown[]; failed: string[]; more: boolean }) => vi.fn(async () => r) as unknown as typeof loadPendingRows;
const user = { id: "u1" };

describe("GET pending-count handler", () => {
  it("returns the number from the same pendingView as the page", async () => {
    const r = await handlePendingCount({ user, access: accessOk(), load: load({ rows: rows(3), failed: [], more: false }) }, L);
    expect(r).toEqual({ status: 200, body: { count: "3" } });
  });
  it("'≥ n' when a page remained", async () => {
    const r = await handlePendingCount({ user, access: accessOk(), load: load({ rows: rows(3), failed: [], more: true }) }, L);
    expect(r.body).toEqual({ count: "≥ 3" });
  });
  it("null when a source failed (never a false number)", async () => {
    const r = await handlePendingCount({ user, access: accessOk(), load: load({ rows: [], failed: ["work"], more: false }) }, L);
    expect(r.body).toEqual({ count: null });
  });
  it("passes (member, role, learner) with the right role", async () => {
    const l = load({ rows: [], failed: [], more: false });
    await handlePendingCount({ user, access: accessOk("parent"), load: l }, L);
    expect(l).toHaveBeenCalledWith("m1", "parent", L);
    const t = load({ rows: [], failed: [], more: false });
    await handlePendingCount({ user, access: accessOk("tutor"), load: t }, L);
    expect(t).toHaveBeenCalledWith("m1", "tutor", L);
  });
  it("401 / 404 from the gate; load is never called", async () => {
    for (const s of [401, 404] as const) {
      const l = load({ rows: [], failed: [], more: false });
      const r = await handlePendingCount({ user: s === 401 ? null : user, access: accessFail(s), load: l }, L);
      expect(r.status).toBe(s);
      expect(l).not.toHaveBeenCalled();
    }
  });
  it("a student (403 from the gate) gets 404", async () => {
    const r = await handlePendingCount({ user, access: accessFail(403), load: load({ rows: [], failed: [], more: false }) }, L);
    expect(r.status).toBe(404);
  });
  it("only the number leaves the server", async () => {
    const r = await handlePendingCount({ user, access: accessOk(), load: load({ rows: [{ key: "k", title: "SECRET" }], failed: [], more: false }) }, L);
    expect(JSON.stringify(r.body)).not.toContain("SECRET");
  });
});
