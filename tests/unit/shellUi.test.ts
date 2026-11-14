import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { app, appFeedback, learnerWithTrack, shellCopy } from "@/lib/copy/vi";
import type { ShellData } from "@/lib/shell/shell";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({ default: (p: Record<string, unknown> & { href: string; children: React.ReactNode }) => createElement("a", { ...p, href: p.href }, p.children) }));

import { StaffShell } from "@/components/shell/StaffShell";

const an = { id: "a0000000-0000-4000-8000-000000000001", alias: "An (thử)", trackId: "A" as const, status: "active" as const, isTest: true, color: null };
const ng = { id: "b0000000-0000-4000-8000-000000000002", alias: "Nguyên (thử)", trackId: "B" as const, status: "active" as const, isTest: true, color: null };
const shell = (over: Partial<ShellData> = {}): ShellData => ({ displayName: "Mẹ", role: "parent", memberId: "m1", learners: [an, ng], current: an, revisionsReady: true, ...over });
const render = (s: ShellData, path: string) => { pathname = path; return renderToStaticMarkup(createElement(StaffShell, { shell: s } as React.ComponentProps<typeof StaffShell>, createElement("p", null, "BODY"))); };

describe("staff shell", () => {
  it("parent with 2 children: switcher keeps the open part; test badge; body inside <main>", () => {
    const html = render(shell(), `/learners/${an.id}/weak`);
    expect(html).toContain('data-testid="staff-shell"');
    expect(html).toContain('data-testid="learner-switcher"');
    expect(html).toContain(learnerWithTrack("An (thử)", "A"));
    expect(html).toContain(`href="/learners/${ng.id}/weak"`);
    expect(html).toContain(app.testBadge);
    expect(html).toMatch(/<main[^>]*>[\s\S]*BODY[\s\S]*<\/main>/);
  });
  it("tutor with 1 child: no switcher, the child's name; no parent group", () => {
    const html = render(shell({ role: "tutor", learners: [ng], current: ng }), "/");
    expect(html).not.toContain('data-testid="learner-switcher"');
    expect(html).toContain('data-testid="shell-learner"');
    expect(html).not.toContain(shellCopy.parentGroup);
    expect(html).not.toContain('data-testid="nav-delete"');
  });
  it("marks the open section and child; shows children of the open section only", () => {
    const html = render(shell(), `/learners/${an.id}/weak`);
    expect(html).toMatch(/data-testid="nav-profile"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="nav-profile"/);
    expect(html).toContain('data-testid="nav-profile-weak"');
    expect(html).not.toContain('data-testid="nav-assign-studio"');
  });
  it("'soon' sections are not links", () => {
    const html = render(shell(), "/");
    expect(html).toMatch(/<span[^>]*data-testid="nav-roadmap"[^>]*aria-disabled="true"|<span[^>]*aria-disabled="true"[^>]*data-testid="nav-roadmap"/);
    expect(html).toContain(shellCopy.soon);
    expect(html).not.toContain("/roadmap");
  });
  it("'Góp ý về app' is always in the sidebar and carries the screen and the child", () => {
    const html = render(shell(), `/learners/${an.id}/weak`);
    expect(html).toContain('data-testid="feedback-link"');
    expect(html).toContain(`/feedback?screen=${encodeURIComponent(appFeedback.screens.weak)}&amp;learner=${an.id}`);
    expect(html).toContain(shellCopy.aiDraftNote);
  });
  it("phone: one nav (no duplicate test ids), opened by a 44px button", () => {
    const html = render(shell(), "/");
    expect(html.match(/data-testid="staff-sidebar"/g)).toHaveLength(1);
    expect(html.match(/data-testid="nav-desk"/g)).toHaveLength(1);
    expect(html).toMatch(/data-testid="nav-menu-toggle"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*data-testid="nav-menu-toggle"/);
  });
  it("hierarchy: sections 500 (open: 600), children indented with a rule, lighter, accent when open", () => {
    const html = render(shell(), `/learners/${an.id}/weak`);
    expect(html).toMatch(/<a[^>]*data-level="section"[^>]*font-medium[^>]*>(?:(?!<\/a>)[\s\S])*Bản đồ kiến thức/);
    expect(html).toMatch(/<a[^>]*data-testid="nav-profile"[^>]*font-semibold/);
    expect(html).toMatch(/<ul data-level="children"[^>]*border-l[^>]*ml-3|<ul data-level="children"[^>]*ml-3[^>]*border-l/);
    expect(html).toMatch(/data-testid="nav-profile-weak"[^>]*data-level="child"[^>]*text-\[13px\][^>]*text-accent[^>]*font-semibold|data-testid="nav-profile-weak"[^>]*data-level="child"[^>]*font-semibold[^>]*text-accent/);
    expect(html).toMatch(/data-testid="nav-profile-levels"[^>]*text-muted/);
  });
});
