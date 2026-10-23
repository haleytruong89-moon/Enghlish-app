import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { ConditionList } from "@/components/skills/ConditionList";
import { ConfirmAllButton } from "@/components/skills/ConfirmAllButton";
import { SkillProposalCard } from "@/components/skills/SkillProposalCard";
import { skillStateCopy } from "@/lib/copy/vi";
import type { Condition } from "@/lib/engine/types";
import type { SkillInboxItem } from "@/lib/skills/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const count = (html: string, s: string) => html.split(s).length - 1;
const c = (id: Condition["id"], level: Condition["level"], route: 1 | 2, have: number, need: number): Condition => ({ id, level, route, have, need, met: have >= need, evidence: [] });
const item = (o: Partial<SkillInboxItem> = {}): SkillInboxItem => ({
  id: "d0000000-0000-4000-8000-000000000001", kind: "PROPOSED", learnerId: "a0000000-0000-4000-8000-000000000001", alias: "An", isTest: true,
  targetKey: "A-L3-CAUSE-W", titleVi: "x", fromState: "DEVELOPING", toState: "INDEPENDENT", currentState: "DEVELOPING", route: 1,
  conditions: [c("r1_first_attempts", 3, 1, 3, 3), c("r1_contexts", 3, 1, 2, 2), c("r1_span_days", 3, 1, 15, 7), c("r1_direct_checkpoint", 3, 1, 1, 1), c("l4_delayed", 4, 1, 0, 1)],
  evidence: [{ episodeId: "e0000000-0000-4000-8000-000000000001", titleVi: "Núi lửa", stepNo: 11, at: "2026-10-03T12:00:00+07:00" }],
  createdAt: "2026-10-20T12:00:00+07:00", canDecide: true, ...o,
});

describe("ReviewTabs", () => {
  it("two tabs; the active one is aria-current; the skills tab shows its count (none before 0023)", () => {
    const html = render(createElement(ReviewTabs, { active: "skills", skillsCount: 3 }));
    expect(html).toMatch(/data-testid="review-tab-skills"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="review-tab-skills"/);
    expect(html).toContain(`${skillStateCopy.tabSkills} ${skillStateCopy.tabCount(3)}`);
    expect(html).toContain('href="/review"');
    expect(render(createElement(ReviewTabs, { active: "work", skillsCount: null }))).not.toContain(skillStateCopy.tabCount(0));
  });
});

describe("SkillProposalCard", () => {
  it("a tutor's level-up: the sentence, the route, the conditions of THAT level with ✓ in words, the evidence links, Xác nhận and Chưa", () => {
    const html = render(createElement(SkillProposalCard, { item: item() }));
    expect(html).toContain('data-kind="PROPOSED"');
    expect(html).toContain(skillStateCopy.routeLabels[1]);
    expect(count(html, 'data-met="true"')).toBe(4);
    expect(html).not.toContain('data-testid="condition-l4_delayed"');
    expect(html).toContain(skillStateCopy.metLabel);
    expect(html).toContain('href="/review/e0000000-0000-4000-8000-000000000001"');
    expect(html).toContain('data-testid="skill-confirm"');
    expect(html).toContain('data-testid="skill-reject-open"');
    expect(html).not.toContain('data-testid="skill-keep"');
  });

  it("a ⚑ offers 'Giữ bậc' and 'Sửa bậc' (to the skills page), never 'Chưa'; the parent sees 'Chờ thầy/cô xác nhận' and no button", () => {
    const flag = render(createElement(SkillProposalCard, { item: item({ kind: "FLAG", toState: "INDEPENDENT", currentState: "INDEPENDENT", route: null }) }));
    expect(flag).toContain('data-testid="skill-keep"');
    expect(flag).toContain('href="/learners/a0000000-0000-4000-8000-000000000001/targets#skill-A-L3-CAUSE-W"');
    expect(flag).not.toContain('data-testid="skill-reject-open"');
    const parent = render(createElement(SkillProposalCard, { item: item({ canDecide: false }) }));
    expect(parent).toContain(skillStateCopy.waitingTutor);
    expect(parent).not.toMatch(/data-testid="skill-(confirm|reject-open|keep)"/);
  });
});

describe("ConditionList and ConfirmAllButton", () => {
  it("✓ / ✗ with the words for screen readers; 'Xác nhận tất cả (n)' says ⚑ are looked at one by one", () => {
    const html = render(createElement(ConditionList, { conditions: [c("r1_contexts", 3, 1, 1, 2)] }));
    expect(html).toContain('data-met="false"');
    expect(html).toContain(skillStateCopy.notMetLabel);
    const all = render(createElement(ConfirmAllButton, { learnerId: "L1", ids: ["a", "b"] }));
    expect(all).toContain(skillStateCopy.confirmAll(2));
    expect(all).toContain(skillStateCopy.confirmAllHint);
  });
});

// (Task 11 adds its tests below this line)
