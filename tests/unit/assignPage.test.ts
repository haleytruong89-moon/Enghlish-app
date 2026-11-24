import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const L = "a0000000-0000-4000-8000-000000000001";
class Redirect extends Error { constructor(public to: string) { super(to); } }
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Redirect(to); }, useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => "/" }));
vi.mock("next/link", () => ({ default: (p: Record<string, unknown> & { href: string; children: React.ReactNode }) => createElement("a", { href: p.href, "data-testid": p["data-testid"] }, p.children) }));
vi.mock("@/lib/tutorwork/page", () => ({ requireLearnerPage: async () => ({ member: { id: "m" }, learner: { id: L, alias: "An", trackId: "A" } }) }));
vi.mock("@/lib/tutorwork/load", () => ({ loadTags: async () => [], loadFrames: async () => [] }));
vi.mock("@/lib/practice/load", () => ({ loadAssignments: async () => [] }));
vi.mock("@/lib/skillmap/load", async () => { const { levelledMap } = await import("./fixtures/skillMap"); return { loadPickerMap: async () => levelledMap() }; });
vi.mock("@/lib/curriculum/load", () => ({ loadUnitChoices: async () => [] }));
vi.mock("@/lib/studio/load", () => ({
  loadDraftList: async () => [
    { id: "d1", title: "U15-1", status: "draft", updatedAt: "2026-11-24T01:00:00Z", templateId: null, templateVersion: null, superseded: false, assigned: 0 },
    { id: "d2", title: "U14 cũ", status: "approved", updatedAt: "2026-11-20T01:00:00Z", templateId: "B-ST-000001", templateVersion: 1, superseded: false, assigned: 1 },
    { id: "d3", title: "Bỏ rồi", status: "discarded", updatedAt: "2026-11-20T01:00:00Z", templateId: null, templateVersion: null, superseded: false, assigned: 0 },
  ],
}));

import Page from "@/app/learners/[id]/assign/page";

const run = async (sp: Record<string, string>) => {
  try {
    const el = await Page({ params: Promise.resolve({ id: L }), searchParams: Promise.resolve(sp) });
    return { html: renderToStaticMarkup(el), to: null as string | null };
  } catch (e) {
    if (e instanceof Redirect) return { html: "", to: e.to };
    throw e;
  }
};

describe("Giao bài page", () => {
  it("no way: the four cards, the follow banner and the drafts being prepared — no assigned lists (24/11)", async () => {
    const r = await run({});
    expect(r.html).toContain('data-testid="way-cards"');
    expect(r.html).not.toContain('data-testid="assigned-list"');
    expect(r.html).not.toContain('data-testid="studio-assigned"');
    expect(r.html).toContain('data-testid="follow-banner"');
    expect(r.html).toContain(`/learners/${L}/assigned`);
    expect(r.html).toContain(`/studio/new?learner=${L}#drafts`);
    expect(r.html).toContain('data-testid="assign-drafts"');
    expect(r.html).toContain("U15-1");
    expect(r.html).not.toContain("U14 cũ");
    expect(r.html).not.toContain("Bỏ rồi");
    expect(r.html).not.toContain('data-testid="assign-form"');
  });
  it.each([["link"], ["pdf"]])("way=%s: the form with a fixed kind and the strip", async (w) => {
    const r = await run({ way: w });
    expect(r.html).toContain('data-testid="assign-form"');
    expect(r.html).toContain('data-testid="ways-strip"');
    expect(r.html).not.toContain('data-testid="kind-link"');
    expect(r.html).toContain(w === "link" ? 'data-testid="assign-url"' : 'data-testid="pdf-input"');
  });
  it("way=studio redirects to Studio keeping title and units", async () => {
    const r = await run({ way: "studio", title: "Review 2", units: "U3,U4" });
    expect(r.to).toBe(`/studio/new?learner=${L}&title=Review+2&units=U3%2CU4`);
  });
  it("way=topic redirects to the topic page", async () => {
    expect((await run({ way: "topic", title: "x" })).to).toBe(`/learners/${L}/inquiries`);
  });
  it("a bad way shows the chooser; the old prefill link still works (prefill carried into the cards)", async () => {
    const r = await run({ way: "bad", title: "Review 2" });
    expect(r.html).toContain('data-testid="way-cards"');
    expect(r.html).toContain("Review 2");
  });
});
