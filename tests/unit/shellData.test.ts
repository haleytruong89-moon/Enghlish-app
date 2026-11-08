import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerSummary } from "@/lib/home/visible";

vi.mock("server-only", () => ({}));
const loadHome = vi.fn();
vi.mock("@/lib/home/loadHome", () => ({ loadHome: () => loadHome() }));
vi.mock("@/lib/revision/load", () => ({ revisionsAvailable: async () => true }));
const notFound = vi.fn(() => { throw new Error("NOT_FOUND"); });
const redirect = vi.fn((_u: string) => { throw new Error("REDIRECT"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound(), redirect: (u: string) => redirect(u) }));

import { firstParam, pickLearner, toShell } from "@/lib/shell/shell";
import { loadShell, requireShell } from "@/lib/shell/load";

const an: LearnerSummary = { id: "a0000000-0000-4000-8000-000000000001", alias: "An (thử)", trackId: "A", status: "active", isTest: true, color: null };
const ng: LearnerSummary = { id: "b0000000-0000-4000-8000-000000000002", alias: "Nguyên (thử)", trackId: "B", status: "active", isTest: true, color: null };
const parent = { kind: "parent" as const, displayName: "Mẹ", memberId: "m1", learners: [an, ng] };

beforeEach(() => { loadHome.mockReset(); notFound.mockClear(); redirect.mockClear(); });

describe("shell data (pure)", () => {
  it("firstParam takes the first non-empty value", () => {
    expect(firstParam(undefined)).toBeNull();
    expect(firstParam(["  ", "x"])).toBeNull();
    expect(firstParam([" x ", "y"])).toBe("x");
  });
  it("pickLearner: the hinted child when visible, else the first; null when there is none", () => {
    expect(pickLearner([an, ng], ng.id)).toBe(ng);
    expect(pickLearner([an, ng], "not-mine")).toBe(an);
    expect(pickLearner([an, ng], null)).toBe(an);
    expect(pickLearner([], null)).toBeNull();
  });
  it("toShell: staff only", () => {
    expect(toShell({ ...parent, kind: "student" }, null, true)).toBeNull();
    expect(toShell(parent, ng.id, false)).toEqual({ displayName: "Mẹ", role: "parent", memberId: "m1", learners: [an, ng], current: ng, revisionsReady: false });
  });
});

describe("loadShell / requireShell", () => {
  it("signed out → login; no member or student → not-found", async () => {
    loadHome.mockResolvedValue({ kind: "signed-out" });
    expect(await loadShell(null)).toEqual({ kind: "login" });
    loadHome.mockResolvedValue({ kind: "no-member", email: null });
    expect(await loadShell(null)).toEqual({ kind: "not-found" });
    loadHome.mockResolvedValue({ ...parent, kind: "student", learners: [an] });
    expect(await loadShell(an.id)).toEqual({ kind: "not-found" });
  });
  it("strict: a child outside the caller's visible children → not-found (same as requireAccess: never reveal it exists)", async () => {
    loadHome.mockResolvedValue({ kind: "tutor", displayName: "Thầy", memberId: "m2", learners: [an] });
    expect(await loadShell(ng.id, { strict: true })).toEqual({ kind: "not-found" });
    const ok = await loadShell(an.id, { strict: true });
    expect(ok.kind === "ok" && ok.shell.current?.id).toBe(an.id);
  });
  it("requireShell turns the result into redirect / notFound", async () => {
    loadHome.mockResolvedValue({ kind: "signed-out" });
    await expect(requireShell(null)).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
    loadHome.mockResolvedValue({ kind: "no-member", email: null });
    await expect(requireShell(null)).rejects.toThrow("NOT_FOUND");
  });
});
