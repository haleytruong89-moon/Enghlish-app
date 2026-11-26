import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { app, appFeedback, learnerWithTrack, shellCopy } from "@/lib/copy/vi";
import type { ShellData } from "@/lib/shell/shell";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({ default: (p: Record<string, unknown> & { href: string; children: React.ReactNode }) => createElement("a", { ...p, href: p.href }, p.children) }));

let counts = { count: null as string | null, work: null as string | null };
vi.mock("@/components/shell/badgeStore", () => ({ useBadgeCounts: () => counts, seedBadge: () => {}, announceBadge: () => {}, resetBadge: () => {} }));

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
    const html = render(shell(), `/learners/${an.id}/tutor-asks`);
    expect(html).toMatch(/data-testid="nav-profile"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="nav-profile"/);
    expect(html).toContain('data-testid="nav-profile-tutorAsks"');
    const weak = render(shell(), `/learners/${an.id}/weak`);
    expect(weak).toMatch(/data-testid="nav-progress"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="nav-progress"/);
    expect(weak).not.toContain('data-testid="nav-profile-tutorAsks"');
  });
  it("Kế hoạch opens the curricula (Lộ trình is its second tab); no 'Sắp có' left", () => {
    const html = render(shell(), "/");
    expect(html).toMatch(/<a[^>]*data-testid="nav-plan"[^>]*href="\/learners\/[^"]+\/curricula"|<a[^>]*href="\/learners\/[^"]+\/curricula"[^>]*data-testid="nav-plan"/);
    expect(html).not.toContain(shellCopy.soon);
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
  it("hierarchy: sections 500 with an icon; the open one bold with a bar on its left; children indented, lighter, accent when open", () => {
    const html = render(shell(), `/learners/${an.id}/tutor-asks`);
    expect(html).toMatch(/<a[^>]*data-level="section"[^>]*font-medium[^>]*>(?:(?!<\/a>)[\s\S])*Tiến bộ/);
    expect(html).toMatch(/<a[^>]*data-testid="nav-profile"[^>]*border-l-4[^>]*font-bold/);
    expect(html).toMatch(/<a[^>]*data-testid="nav-work"[^>]*>\s*<svg aria-hidden="true"/);
    expect(html).toMatch(/<ul data-level="children"[^>]*border-l[^>]*ml-3|<ul data-level="children"[^>]*ml-3[^>]*border-l/);
    expect(html).toMatch(/data-testid="nav-profile-tutorAsks"[^>]*data-level="child"[^>]*text-\[13px\][^>]*text-accent[^>]*font-semibold|data-testid="nav-profile-tutorAsks"[^>]*data-level="child"[^>]*font-semibold[^>]*text-accent/);
    expect(html).toMatch(/data-testid="nav-profile-profile"[^>]*text-muted/);
  });
  it("printing: the top bar and the left column are hidden, the page body is not", () => {
    const html = render(shell(), `/learners/${an.id}/notes/month/2026-11`);
    expect(html).toMatch(/<header[^>]*data-testid="staff-topbar"[^>]*print:hidden|<header[^>]*print:hidden[^>]*data-testid="staff-topbar"/);
    expect(html).toMatch(/data-testid="staff-sidebar-wrap" class="print:hidden"|class="print:hidden" data-testid="staff-sidebar-wrap"/);
    expect(html).toMatch(/<main[^>]*print:p-0/);
    expect(html).not.toMatch(/<main[^>]*print:hidden/);
  });
  it("hướng B: the 3 quick buttons come before the sections, also on a phone (outside the drawer)", () => {
    counts = { count: "3", work: "2" };
    const html = render(shell({ role: "tutor", learners: [ng], current: ng }), "/");
    const quick = html.indexOf('data-testid="nav-quick"');
    expect(quick).toBeGreaterThan(-1);
    expect(quick).toBeLessThan(html.indexOf('data-testid="staff-sidebar"'));
    expect(quick).toBeLessThan(html.indexOf('data-testid="nav-menu-toggle"'));
    for (const k of ["grade", "assign", "note"]) expect(html).toContain(`data-testid="quick-${k}"`);
    expect(html).toContain(`href="/learners/${ng.id}/finish"`);
    expect(html).toContain(shellCopy.quick.grade);
  });
  it("Chấm bài is red with its number when work waits; plain without; never a false 0", () => {
    counts = { count: "3", work: "2" };
    let html = render(shell({ role: "tutor", learners: [ng], current: ng }), "/");
    expect(html).toMatch(/data-testid="quick-grade"[^>]*data-waiting="yes"/);
    expect(html).toContain('data-testid="grade-badge"');
    expect(html).toContain(shellCopy.gradeBadge("2"));
    for (const w of [null, "0"]) {
      counts = { count: "1", work: w };
      html = render(shell({ role: "tutor", learners: [ng], current: ng }), "/");
      expect(html).toMatch(/data-testid="quick-grade"[^>]*data-waiting="no"/);
      expect(html).not.toContain('data-testid="grade-badge"');
    }
  });
  it("the six sections in order; Bài tập lights on Giao bài; no Chờ duyệt", () => {
    const html = render(shell(), `/learners/${an.id}/assign`);
    const at = ["desk", "work", "sessions", "progress", "plan", "profile"].map((k) => html.indexOf(`data-testid="nav-${k}"`));
    expect(at.every((x, i) => x > -1 && (i === 0 || x > at[i - 1]!))).toBe(true);
    expect(html).toMatch(/data-testid="nav-work"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="nav-work"/);
    expect(html).not.toContain('data-testid="nav-inbox"');
  });
  it("no child yet: no quick buttons", () => {
    const html = render(shell({ role: "tutor", learners: [], current: null }), "/");
    expect(html).not.toContain('data-testid="nav-quick"');
  });
  it("v2 (26/11): Giao bài is the filled main action, Ghi buổi học a thick outline; both at least 48 px with an icon", () => {
    counts = { count: "0", work: "0" };
    const html = render(shell({ role: "tutor", learners: [ng], current: ng }), "/");
    expect(html).toMatch(/data-testid="quick-assign"[^>]*data-tone="main"[^>]*class="[^"]*bg-accent[^"]*text-white/);
    expect(html).toMatch(/data-testid="quick-note"[^>]*data-tone="often"[^>]*class="[^"]*border-2 border-accent/);
    for (const k of ["grade", "assign", "note"]) expect(html).toMatch(new RegExp(`data-testid="quick-${k}"[^>]*min-h-12[^>]*>\\s*<svg aria-hidden="true"`));
  });
});
