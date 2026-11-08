import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { reviewPage, revisionReviewCopy } from "@/lib/copy/vi";
import type { InboxItem } from "@/lib/review/types";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), usePathname: () => "/review" }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) }));
vi.mock("@/lib/review/access", () => ({ authorizeStaffPage: async () => ({ kind: "ok", member: { displayName: "Thầy/cô của An (thử)" } }) }));

vi.mock("@/lib/shell/load", () => ({
  requireShell: async () => ({ displayName: "Thầy/cô của An (thử)", role: "tutor", memberId: "m1", learners: [], current: null, revisionsReady: true }),
}));
vi.mock("@/lib/skills/load", () => ({ loadSkillInbox: async () => null }));
vi.mock("@/lib/studio/load", () => ({ loadStudioPending: async () => null }));

const item = (over: Partial<InboxItem>): InboxItem => ({
  episodeId: "e1", attemptId: "a1", learnerId: "l1", alias: "An (thử)", isTest: true, titleVi: "Núi lửa", stepNo: 7, activityType: "ACT-WRITE", mode: "PRACTICE",
  purpose: [], provenance: "in_app", attemptNo: 1, isFirstAttempt: true, submittedAt: "2026-10-22T03:00:00Z", restricted: false, category: "practice",
  targetsTotal: 2, targetsDecided: 0, canDecide: true, revisionRound: null, ...over,
});
const loadInbox = vi.fn();
vi.mock("@/lib/review/load", () => ({ loadInbox: (...a: unknown[]) => loadInbox(...a) }));

import ReviewInboxPage from "@/app/review/page";

async function html(items: InboxItem[]): Promise<string> {
  loadInbox.mockResolvedValue({ items, next: null, counts: { todo: items.length, toDecide: items.length, tutor: 0, independent: 0, baseline: 0, practice: 0, done: 0 } });
  return renderToStaticMarkup(await ReviewInboxPage({ searchParams: Promise.resolve({}) }));
}
/** Text inside the list rows only (tags stripped). */
const rowsText = (h: string) => (h.match(/<li[^>]*data-testid="inbox-item-[\s\S]*?<\/li>/g) ?? []).map((r) => r.replace(/<[^>]*>/g, " "));

describe("review inbox page", () => {
  it("B1: no row shows a stray markdown fence or backtick", async () => {
    const rows = rowsText(await html([item({ episodeId: "e1" }), item({ episodeId: "e2", revisionRound: 1, mode: "REVISION" })]));
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r, r).not.toContain("`");
  });

  it("N6: an ordinary row shows 'Đã chấm x/y kỹ năng'; a revision row shows the neutral line instead", async () => {
    const [plain, revision] = rowsText(await html([item({ episodeId: "e1" }), item({ episodeId: "e2", revisionRound: 1, mode: "REVISION" })]));
    expect(plain).toContain(reviewPage.progress(0, 2));
    expect(revision).toContain(revisionReviewCopy.inboxLabel(1));
    expect(revision).toContain(revisionReviewCopy.inboxProgress);
    expect(revision).not.toContain(reviewPage.progress(0, 2));
    expect(revision).not.toMatch(/Đã chấm/);
  });
});
