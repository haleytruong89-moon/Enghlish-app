import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deskCopy, home } from "@/lib/copy/vi";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), usePathname: () => "/", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { ...p, href: p.href }, p.children) }));
const loadHome = vi.fn();
vi.mock("@/lib/home/loadHome", () => ({ loadHome: () => loadHome() }));
vi.mock("@/lib/revision/load", () => ({ revisionsAvailable: async () => true }));
const requireLearnerPage = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock("@/lib/tutorwork/page", () => ({ requireLearnerPage: (...a: unknown[]) => requireLearnerPage(...a) }));
const loadDesk = vi.fn();
vi.mock("@/lib/desk/load", () => ({ loadDesk: (...a: unknown[]) => loadDesk(...a) }));
vi.mock("@/lib/work/load", () => ({ loadStudentHome: async () => ({ kind: "empty" }) }));

import HomePage from "@/app/page";

const an = { id: "a0000000-0000-4000-8000-000000000001", alias: "An (thử)", trackId: "A", status: "active", isTest: true, color: null };
const ng = { id: "b0000000-0000-4000-8000-000000000002", alias: "Nguyên (thử)", trackId: "B", status: "active", isTest: true, color: null };
const desk = { today: null, pending: { rows: [], failed: [], more: false }, intakeMissing: null, curricula: null, profile: null, recent: null, aiSettings: null };
const render = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => { loadDesk.mockResolvedValue(desk); requireLearnerPage.mockClear(); });

describe("home page", () => {
  it("student: the student home, unchanged — no staff shell", async () => {
    loadHome.mockResolvedValue({ kind: "student", displayName: "An", memberId: "s", learners: [an] });
    const h = await render();
    expect(h).toContain('data-testid="student-nav"');
    expect(h).toContain(home.studentGreeting("An (thử)"));
    expect(h).not.toContain('data-testid="staff-shell"');
  });
  it("parent: shell + desk of the hinted child, gated before loading", async () => {
    loadHome.mockResolvedValue({ kind: "parent", displayName: "Mẹ", memberId: "p", learners: [an, ng] });
    const h = await render({ learner: ng.id });
    expect(h).toContain('data-testid="staff-shell"');
    expect(h).toContain(deskCopy.title("Nguyên (thử)"));
    expect(requireLearnerPage).toHaveBeenCalledWith(ng.id, "tutorwork:read");
    expect(loadDesk).toHaveBeenCalledWith(expect.objectContaining({ role: "parent" }), expect.objectContaining({ id: ng.id }));
  });
  it("tutor without a child: the shell and the empty line", async () => {
    loadHome.mockResolvedValue({ kind: "tutor", displayName: "Thầy", memberId: "t", learners: [] });
    const h = await render();
    expect(h).toContain(home.tutorEmpty);
    expect(loadDesk).not.toHaveBeenCalled();
  });
});
