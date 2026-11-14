import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deskCopy, fallbackLabels, home, pendingCopy, todayPage } from "@/lib/copy/vi";
import type { DeskData } from "@/lib/desk/load";
import type { ShellData } from "@/lib/shell/shell";
import type { TodayData } from "@/lib/tutorwork/load";
import { sessionDays } from "@/lib/sessions/count";
import type { NoteRow } from "@/lib/sessions/types";
import type { AssignmentView } from "@/lib/practice/types";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { ...p, href: p.href }, p.children) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
import { DeskView } from "@/components/desk/DeskView";

const L = "a0000000-0000-4000-8000-000000000001";
const learner = { id: L, alias: "Nguyên (thử)", trackId: "B" as const, status: "active" as const, isTest: true, color: null };
const shell = (role: "tutor" | "parent"): ShellData => ({ displayName: "X", role, memberId: "m", learners: [learner], current: learner, revisionsReady: true });
const asg = (over: Partial<AssignmentView>) => ({ id: "c1", kind: "link", title: "Bài 1", url: null, sourceKey: null, tagKeys: [], dueOn: null, frameId: null, createdAt: "2026-10-01T00:00:00Z", retractedAt: null, file: null, answerFile: null, submission: null, resultId: null, ...over }) as AssignmentView;
const today = (over: Partial<TodayData> = {}): TodayData => ({
  weak: { policyDays: 14, since: null, today: "2026-10-18", tags: [] }, repeats: [], due: [], untagged: [],
  lastNote: { id: "n1", sessionDate: "2026-10-15", studied: "Unit 7", weakTagKeys: ["x-gone"], practisedTargetIds: [], message: "Had it not been for + N", authorRole: "tutor" },
  recent: { id: "r0", title: "Destination U1-12", takenOn: "2026-10-16", total: 60, correct: 50 }, practice: [], tagLabels: {}, ...over,
} as TodayData);
const data = (over: Partial<DeskData> = {}): DeskData => ({ today: today(), pending: { rows: [], failed: [], more: false }, intakeMissing: false, curricula: [], profile: null, recent: null, aiSettings: null, sessions: null, ...over });
const render = (role: "tutor" | "parent", d: DeskData) => renderToStaticMarkup(createElement(DeskView, { shell: shell(role), learner, data: d, todayIso: "2026-10-18" }));

describe("Bàn làm việc", () => {
  it("order (spec §5 rule 2): title + main action → Chờ duyệt → Cần chú ý → 3 boxes", () => {
    const h = render("tutor", data());
    const at = (s: string) => h.indexOf(s);
    expect(h).toContain(deskCopy.title("Nguyên (thử)"));
    expect(at('data-testid="desk-title"')).toBeLessThan(at(`data-testid="action-note-${L}"`));
    expect(at(`data-testid="action-note-${L}"`)).toBeLessThan(at('data-testid="desk-inbox"'));
    expect(at('data-testid="desk-inbox"')).toBeLessThan(at(`data-testid="attention-${L}"`));
    expect(at(`data-testid="attention-${L}"`)).toBeLessThan(at('data-testid="desk-profile"'));
    expect(at('data-testid="desk-profile"')).toBeLessThan(at('data-testid="desk-curricula"'));
    expect(at('data-testid="desk-curricula"')).toBeLessThan(at('data-testid="desk-sessions"'));
  });
  it("quick actions keep their old targets and test ids", () => {
    const h = render("tutor", data());
    expect(h).toContain(`href="/learners/${L}/notes/new"`);
    expect(h).toContain(`href="/learners/${L}/results/new"`);
    expect(h).toContain(`href="/learners/${L}/assign"`);
    expect(h).toContain(deskCopy.logToday);
    expect(h).toContain(todayPage.resultAction);
    expect(h).toContain(todayPage.assignAction);
  });
  it("Chờ duyệt box: count, first 3 rows as links, 'Mở tất cả' → the child's inbox; no button", () => {
    const rows = ["a", "b", "c", "d"].map((k) => ({ key: k, kind: "work" as const, group: "work" as const, label: "Bài nộp", title: `T-${k}`, since: null, need: "N", href: `/review/${k}`, waitingTutor: false }));
    const h = render("tutor", data({ pending: { rows, failed: [], more: false } }));
    expect(h).toContain(pendingCopy.deskTitle(4));
    expect(h).toContain('data-testid="desk-inbox-row-c"');
    expect(h).not.toContain('data-testid="desk-inbox-row-d"');
    expect(h).toContain(pendingCopy.deskMore(1));
    expect(h).toContain(`href="/learners/${L}/inbox"`);
    expect(h.slice(h.indexOf('data-testid="desk-inbox"'), h.indexOf(`data-testid="attention-${L}"`))).not.toMatch(/<button\b/);
  });
  it("Chờ duyệt box never says 'nothing waiting' when a source failed or the list may be incomplete", () => {
    const failed = render("tutor", data({ pending: { rows: [], failed: ["studio"], more: false } }));
    expect(failed).not.toContain(pendingCopy.empty);
    expect(failed).toContain(pendingCopy.deskPartial);
    expect(failed).not.toContain(pendingCopy.deskTitle(0));
    const more = render("tutor", data({ pending: { rows: [], failed: [], more: true } }));
    expect(more).not.toContain(pendingCopy.empty);
    expect(more).toContain(pendingCopy.deskTitle("≥ 0"));
    expect(more).toContain(pendingCopy.more);
    expect(more).toContain(`href="/review?learner=${L}"`);
    const ok = render("tutor", data({ pending: { rows: [], failed: [], more: false } }));
    expect(ok).toContain(pendingCopy.empty);
  });
  it("Buổi học box: last session without a raw tag key, last result, practice counts only (spec §5 rule 6), no schedule yet", () => {
    const h = render("tutor", data({ today: today({ practice: [asg({ id: "c1", dueOn: "2026-10-10" }), asg({ id: "c2", dueOn: "2026-10-30" })] }) }));
    expect(h).toContain(`data-testid="last-session-${L}"`);
    expect(h).toContain("Had it not been for + N");
    expect(h).toContain("15/10/2026");
    expect(h).not.toContain("x-gone");
    expect(h).toContain(fallbackLabels.tag);
    expect(h).toContain(todayPage.lastResultLine("Destination U1-12", "16/10/2026"));
    expect(h).toContain(deskCopy.practiceCounts(2, 0, 1));
    expect(h).not.toContain('data-testid="overdue-c1"');
    expect(h).toContain(deskCopy.noSchedule);
  });
  it("boxes say plainly when their data could not be read", () => {
    const h = render("tutor", data({ today: null, curricula: null, profile: null }));
    expect(h).toContain('data-testid="desk-profile-unavailable"');
    expect(h).toContain(deskCopy.curriculaUnavailable);
    expect(h).toContain(deskCopy.sessionsUnavailable);
  });
  it("parent: the family summary line; tutor: none", () => {
    expect(render("parent", data())).toContain(home.parentSummary(1));
    expect(render("tutor", data())).not.toContain(home.parentSummary(1));
  });
});

describe("one line with this month's sessions (U9/U10)", () => {
  const nr = (d: string, id: string): NoteRow => ({ id, sessionDate: d, supersedesId: null, authorRole: "tutor", published: true, createdAt: d });
  const line = (rows: NoteRow[] | null) => {
    const h = render("tutor", data({ sessions: rows ? sessionDays(rows, [], () => null) : null }));
    return h.match(/data-testid="desk-month-line"[^>]*>([^<]*)</)?.[1] ?? null;
  };
  it("count and last session, linked to the sessions page", () => {
    expect(line([nr("2026-10-03", "a"), nr("2026-10-05", "b"), nr("2026-10-05", "b2"), nr("2026-10-12", "c")])).toBe(deskCopy.monthLine(10, 3, "12/10"));
    expect(render("tutor", data({ sessions: sessionDays([nr("2026-10-03", "a")], [], () => null) }))).toContain(`href="/learners/${L}/notes"`);
  });
  it("a month without a session still names the last one", () => {
    expect(line([nr("2026-09-28", "a")])).toBe(deskCopy.monthLineNone(10, "28/09"));
  });
  it("no session at all, or an unreadable count: no line", () => {
    expect(line([])).toBeNull();
    expect(line(null)).toBeNull();
  });
});
