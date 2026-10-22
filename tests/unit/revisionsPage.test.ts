import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LearnerCard } from "@/components/LearnerCard";
import { revisionReviewCopy } from "@/lib/copy/vi";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
vi.mock("@/lib/tutorwork/page", () => ({
  requireLearnerPage: async () => ({ member: { displayName: "Thầy/cô của An (thử)" }, learner: { id: "l1", alias: "An (thử)", trackId: "A", isTest: true } }),
}));
const rpc = vi.fn();
vi.mock("@/lib/revision/supabaseStore", () => ({ callRevisionRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import RevisionsPage from "@/app/learners/[id]/revisions/page";

const learner = { id: "l1", alias: "An (thử)", trackId: "A", isTest: true, color: "#2f5d9e" } as never;

describe("N7: 'Bài đã sửa' before migration 0021 is applied", () => {
  it("the page does not fail when the books cannot be read: it says so neutrally and shows no list", async () => {
    rpc.mockRejectedValue(new Error("eng_revision_list: function does not exist"));
    const html = renderToStaticMarkup(await RevisionsPage({ params: Promise.resolve({ id: "l1" }) }));
    expect(html).toContain('data-testid="revisions-unavailable"');
    expect(html).toContain(revisionReviewCopy.unavailable);
    expect(html).not.toContain(revisionReviewCopy.listIntro);
    expect(html).not.toContain(revisionReviewCopy.listEmpty);
  });

  it("with the books readable the page shows the list (or the empty line)", async () => {
    rpc.mockResolvedValue({ items: [] });
    const html = renderToStaticMarkup(await RevisionsPage({ params: Promise.resolve({ id: "l1" }) }));
    expect(html).not.toContain("revisions-unavailable");
    expect(html).toContain(revisionReviewCopy.listEmpty);
  });

  it("the learner card leaves the link out until 0021 is applied, and shows it after", () => {
    const off = renderToStaticMarkup(createElement(LearnerCard, { learner, today: null, role: "tutor", revisionsReady: false }));
    expect(off).not.toContain("/revisions");
    expect(off).not.toContain(revisionReviewCopy.link);
    const on = renderToStaticMarkup(createElement(LearnerCard, { learner, today: null, role: "tutor" }));
    expect(on).toContain('href="/learners/l1/revisions"');
  });
});
