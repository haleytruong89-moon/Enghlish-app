import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { pendingCopy } from "@/lib/copy/vi";
import type { PendingRow } from "@/lib/desk/pending";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { ...p, href: p.href }, p.children) }));
vi.mock("@/lib/tutorwork/page", () => ({ requireLearnerPage: async () => ({ member: { id: "m1", role: "tutor", displayName: "Thầy" }, learner: { id: "L1", alias: "An (thử)", trackId: "A", isTest: true } }) }));
const loadPendingRows = vi.fn();
vi.mock("@/lib/desk/load", () => ({ loadPendingRows: (...a: unknown[]) => loadPendingRows(...a) }));

import PendingPage from "@/app/learners/[id]/inbox/page";

const row = (key: string, group: PendingRow["group"], since: string | null): PendingRow => ({ key, kind: group === "work" ? "work" : group === "ai" ? "studio_draft" : group === "check" ? "studio_check" : "skill", group, label: "L", title: `T-${key}`, since, need: "N", href: `/review/${key}`, waitingTutor: false });
const render = async (f?: string) => renderToStaticMarkup(await PendingPage({ params: Promise.resolve({ id: "L1" }), searchParams: Promise.resolve(f ? { f } : {}) }));

describe("Chờ duyệt page", () => {
  it("lists every row with one 'Mở' link and no button at all", async () => {
    loadPendingRows.mockResolvedValue({ rows: [row("e1", "work", "2026-11-01T00:00:00Z"), row("d1", "ai", null)], failed: [], more: false });
    const html = await render();
    expect(html).toContain('data-testid="pending-page"');
    expect(html).toContain(pendingCopy.title("An (thử)"));
    expect(html).toContain('data-testid="pending-row-e1"');
    expect(html).toContain('href="/review/e1"');
    expect(html).toContain(pendingCopy.noDate);
    expect(html).not.toMatch(/<button\b/);
  });
  it("?f= filters the rows; chips show the counts of all groups", async () => {
    loadPendingRows.mockResolvedValue({ rows: [row("e1", "work", "2026-11-01T00:00:00Z"), row("d1", "ai", null)], failed: [], more: false });
    const html = await render("ai");
    expect(html).not.toContain('data-testid="pending-row-e1"');
    expect(html).toContain('data-testid="pending-row-d1"');
    expect(html).toContain(pendingCopy.groupCount(pendingCopy.groups.work, 1));
    expect(html).toContain(pendingCopy.groupCount(pendingCopy.groups.all, 2));
  });
  it("names a source that could not be read; links to the full inbox when there is more", async () => {
    loadPendingRows.mockResolvedValue({ rows: [], failed: ["studio"], more: true });
    const html = await render();
    expect(html).toContain('data-testid="pending-failed-studio"');
    expect(html).toContain(pendingCopy.failed(pendingCopy.sources.studio));
    expect(html).toContain('data-testid="pending-more"');
    expect(html).toContain('href="/review?learner=L1"');
    expect(html).toContain('data-testid="pending-empty"');
  });
});
