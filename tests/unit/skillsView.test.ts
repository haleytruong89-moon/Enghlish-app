import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillCriteria } from "@/components/skills/SkillCriteria";
import { levelCopy, levelLabels, skillNames, skillStateCopy, targetsPage, tutorHonorific } from "@/lib/copy/vi";
import type { Condition } from "@/lib/engine/types";
import type { SkillInboxItem, SkillStateRow } from "@/lib/skills/types";
import {
  conditionText, conditionsFor, domainSkills, groupInbox, isPractising, isSolid, missingForIndependent, missingText, nextNeed, pickCriteria, proposalTitle, routeLabel, scaleCells, skillTabCount, skillTitle, solidByDomain,
} from "@/lib/skills/view";

const c = (id: Condition["id"], level: Condition["level"], route: 1 | 2, have: number, need: number): Condition => ({ id, level, route, have, need, met: have >= need, evidence: [] });
const row = (o: Partial<SkillStateRow> = {}): SkillStateRow => ({
  targetKey: "A-L3-CAUSE-W", titleVi: "Viết nguyên nhân", domainKey: "writing", state: "NOT_OBSERVED", auto: false, stateSince: null, flag: null,
  proposal: null, conditions: [], route: null, evaluatedAt: null, ...o,
});
const item = (o: Partial<SkillInboxItem> = {}): SkillInboxItem => ({
  id: "p1", kind: "PROPOSED", learnerId: "L1", alias: "An", isTest: true, targetKey: "A-L3-CAUSE-W", titleVi: "x", fromState: "DEVELOPING", toState: "INDEPENDENT",
  currentState: "DEVELOPING", route: 1, conditions: [], evidence: [], createdAt: "2026-10-20T12:00:00+07:00", canDecide: true, ...o,
});
const NO_DAT = /đạt/iu;
const STANDALONE_CO = /(^|[^/\p{L}])cô([^/\p{L}]|$)/iu;

describe("copy (UX_COPY_GUIDE §3.2 with tutorHonorific, D21)", () => {
  it("⚑ is 'Cần thầy/cô xem lại'; the five level names do not change; no level-page copy says 'đạt' or a standalone 'cô'", () => {
    expect(levelLabels.NEEDS_CONFIRMATION.label).toBe(`Cần ${tutorHonorific} xem lại`);
    expect(levelLabels.SUPPORTED.explain).toContain(tutorHonorific);
    expect(levelLabels.INDEPENDENT.explain).toContain(tutorHonorific);
    const texts = [...Object.values(skillStateCopy.conditions), levelCopy.solidCount(2, 5), levelCopy.pendingLine("Kỹ năng"), levelCopy.flagLine("Kỹ năng"), levelCopy.noSkillsInDomain];
    for (const t of texts) {
      expect(t).not.toMatch(NO_DAT);
      expect(t).not.toMatch(STANDALONE_CO);
    }
    expect(targetsPage.intro).toContain(tutorHonorific);
  });
});

describe("scale and lines", () => {
  it("4 labelled cells filled up to the level; none for 'Chưa đủ bài'", () => {
    expect(scaleCells("DEVELOPING").map((x) => [x.label, x.filled, x.current])).toEqual([
      [levelLabels.SUPPORTED.label, true, false],
      [levelLabels.DEVELOPING.label, true, true],
      [levelLabels.INDEPENDENT.label, false, false],
      [levelLabels.TRANSFERABLE.label, false, false],
    ]);
    expect(scaleCells("NOT_OBSERVED").some((x) => x.filled)).toBe(false);
  });

  it("titles use the staff name of UX §3.4; conditions show have/need (accuracy in %); routes and proposals read as sentences", () => {
    expect(skillTitle({ targetKey: "A-L3-CAUSE-W", titleVi: "x" })).toBe(skillNames["A-L3-CAUSE-W"]!.staff);
    expect(skillTitle({ targetKey: "B-T7-ARGUE", titleVi: "Lập luận" })).toBe("Lập luận");
    expect(conditionText(c("r1_contexts", 3, 1, 1, 2))).toBe(skillStateCopy.conditionLine(skillStateCopy.conditions.r1_contexts!, 1, 2));
    expect(conditionText(c("r2_accuracy", 3, 2, 69, 75))).toBe(skillStateCopy.percentLine(skillStateCopy.conditions.r2_accuracy!, 69, 75));
    expect([routeLabel(1), routeLabel(2), routeLabel(null)]).toEqual([skillStateCopy.routeLabels[1], skillStateCopy.routeLabels[2], null]);
    expect(proposalTitle(item())).toBe(skillStateCopy.proposalLine(skillNames["A-L3-CAUSE-W"]!.staff, levelLabels.DEVELOPING.label, levelLabels.INDEPENDENT.label));
    expect(proposalTitle(item({ kind: "FLAG", toState: "INDEPENDENT", currentState: "INDEPENDENT" }))).toBe(skillStateCopy.flagLine(skillNames["A-L3-CAUSE-W"]!.staff, levelLabels.INDEPENDENT.label));
  });

  it("a proposal shows the conditions of its level and route; a ⚑ shows none (its evidence is the low work)", () => {
    const conditions = [c("l2_unaided_first", 2, 1, 1, 1), c("r1_contexts", 3, 1, 2, 2), c("r2_items", 3, 2, 3, 8), c("l4_delayed", 4, 1, 0, 1)];
    expect(conditionsFor(item({ conditions })).map((x) => x.id)).toEqual(["r1_contexts"]);
    expect(conditionsFor(item({ conditions, route: 2 })).map((x) => x.id)).toEqual(["r2_items"]);
    expect(conditionsFor(item({ conditions, toState: "TRANSFERABLE" })).map((x) => x.id)).toEqual(["l4_delayed"]);
    expect(conditionsFor(item({ conditions, kind: "FLAG" }))).toEqual([]);
  });
});

describe("Hồ sơ cấp boxes (D20)", () => {
  it("Đã vững = 3–4 without ⚑; Đang luyện = 1–2 or any ⚑", () => {
    expect([isSolid(row({ state: "INDEPENDENT" })), isSolid(row({ state: "INDEPENDENT", flag: { id: "f", at: "x" } })), isSolid(row({ state: "DEVELOPING" }))]).toEqual([true, false, false]);
    expect([isPractising(row({ state: "SUPPORTED" })), isPractising(row({ state: "TRANSFERABLE", flag: { id: "f", at: "x" } })), isPractising(row())]).toEqual([true, true, false]);
  });

  it("'Còn cần' = the nearest unmet condition of the next level; at level 2 the route with more conditions met wins", () => {
    expect(nextNeed(row({ conditions: [c("l1_evidence", 1, 1, 0, 1)] }))?.id).toBe("l1_evidence");
    const level3 = [c("r1_first_attempts", 3, 1, 2, 3), c("r1_contexts", 3, 1, 1, 2), c("r1_span_days", 3, 1, 3, 7), c("r1_direct_checkpoint", 3, 1, 1, 1),
      c("r2_items", 3, 2, 2, 8), c("r2_activities", 3, 2, 1, 2), c("r2_accuracy", 3, 2, 50, 75), c("r2_review", 3, 2, 0, 1)];
    expect(nextNeed(row({ state: "DEVELOPING", conditions: level3 }))?.id).toBe("r1_first_attempts"); // route 1: 1 met vs 0; 2/3 is nearest
    expect(nextNeed(row({ state: "TRANSFERABLE" }))).toBeNull();
    // G2: level 2 also has a route by auto-checked items (reading, listening, grammar, vocab) - the route with more conditions met is shown.
    const level2 = [c("l2_unaided_first", 2, 1, 0, 1), c("l2_auto_items", 2, 2, 3, 4), c("l2_auto_accuracy", 2, 2, 100, 75)];
    expect(nextNeed(row({ state: "SUPPORTED", conditions: level2 }))?.id).toBe("l2_auto_items");
    expect(nextNeed(row({ state: "SUPPORTED", conditions: [level2[0]!] }))?.id).toBe("l2_unaided_first");
    expect(conditionText(c("l2_auto_accuracy", 2, 2, 74, 75))).toBe(skillStateCopy.percentLine(skillStateCopy.conditions.l2_auto_accuracy!, 74, 75));
  });

  it("domainSkills: n/N over the set's skills of that domain; a pending proposal is shown instead of a need", () => {
    const rows = [
      row({ targetKey: "A-L3-CAUSE-W", state: "INDEPENDENT" }),
      row({ targetKey: "A-L3-PARA-W", state: "DEVELOPING", proposal: { id: "p", toState: "INDEPENDENT", route: 1, at: "x" } }),
      row({ targetKey: "A-L1-PAST-W", domainKey: "grammar", state: "SUPPORTED", conditions: [c("l2_unaided_first", 2, 1, 0, 1)] }),
    ];
    const w = domainSkills(rows, "writing");
    expect([w.n, w.total, w.solid.length, w.practising.length]).toEqual([1, 2, 1, 1]);
    expect(w.next).toEqual([{ row: rows[1], need: null, pending: true }]);
    expect(domainSkills(rows, "grammar").next[0]?.need?.id).toBe("l2_unaided_first");
    expect(domainSkills(rows, "listening")).toMatchObject({ n: 0, total: 0 });
    expect(solidByDomain(rows)).toEqual({ writing: { n: 1, total: 2 }, grammar: { n: 0, total: 1 } });
  });
});

describe("the tab", () => {
  it("groups items per child in order; only proposals the person can decide go to 'Xác nhận tất cả'; the count is decidable (tutor) or open (parent)", () => {
    const items = [item({ id: "a" }), item({ id: "b", kind: "FLAG" }), item({ id: "c", learnerId: "L2", alias: "Nguyên", canDecide: false })];
    const g = groupInbox(items);
    expect(g.map((x) => [x.learnerId, x.items.map((i) => i.id), x.proposalIds, x.canDecide])).toEqual([["L1", ["a", "b"], ["a"], true], ["L2", ["c"], [], false]]);
    const inbox = { open: 3, decidable: 2, items };
    expect([skillTabCount(inbox, "tutor"), skillTabCount(inbox, "parent"), skillTabCount(null, "tutor")]).toEqual([2, 3, null]);
  });
});

describe("missingForIndependent / criteria (UX round 1)", () => {
  const r1 = [c("r1_first_attempts", 3, 1, 1, 3), c("r1_contexts", 3, 1, 2, 2), c("r1_span_days", 3, 1, 2, 7), c("r1_direct_checkpoint", 3, 1, 0, 1)];
  it("lists only the unmet level-3 conditions with have/need from the stored (policy-measured) conditions", () => {
    const m = missingForIndependent({ state: "DEVELOPING", conditions: [c("l1_evidence", 1, 1, 1, 1), ...r1] });
    expect(m).toEqual([conditionText(r1[0]!), conditionText(r1[2]!), conditionText(r1[3]!)]);
    expect(missingText(m)).toBe(skillStateCopy.missingLine(m.join(skillStateCopy.missingJoin)));
    expect(missingText(m)).toContain("1/3");
  });
  it("takes the receptive route when it is closer (more met), ties go to route 1", () => {
    const r2 = [c("r2_items", 3, 2, 12, 12), c("r2_activities", 3, 2, 3, 3), c("r2_accuracy", 3, 2, 70, 80), c("r2_review", 3, 2, 0, 1)];
    const m = missingForIndependent({ state: "DEVELOPING", conditions: [...r1, ...r2] });
    expect(m).toHaveLength(2);
    expect(m[0]).toContain("70");
  });
  it("is empty at level 3+, with no stored conditions, or when all are met", () => {
    expect(missingForIndependent({ state: "INDEPENDENT", conditions: r1 })).toEqual([]);
    expect(missingForIndependent({ state: "NOT_OBSERVED", conditions: [] })).toEqual([]);
    expect(missingForIndependent({ state: "DEVELOPING", conditions: [c("r1_contexts", 3, 1, 2, 2)] })).toEqual([]);
    expect(missingText([])).toBeNull();
  });
  it("pickCriteria keeps the newest descriptor version and the Vietnamese checks", () => {
    const out = pickCriteria([
      { id: "T", descriptor_version: "0.2.0", success_criteria: [{ check_vi: "cũ" }] },
      { id: "T", descriptor_version: "0.2.1-draft", success_criteria: [{ check_vi: "Ít nhất 80% số câu đúng." }, { check_vi: " " }] },
      { id: "U", descriptor_version: "0.2.1-draft", success_criteria: null },
    ]);
    expect(out).toEqual({ T: ["Ít nhất 80% số câu đúng."], U: [] });
  });
});

describe("SkillCriteria component", () => {
  it("shows the skill's own checks under the intro line and 'Còn thiếu', nothing when empty", () => {
    const h = renderToStaticMarkup(createElement(SkillCriteria, { checks: ["Ít nhất 80% số câu đúng."], missing: ["Số ngày trải ra (lần đầu → lần cuối): 2/7"] }));
    expect(h).toContain(skillStateCopy.criteriaIntro);
    expect(h).toContain("Ít nhất 80% số câu đúng.");
    expect(h).toContain("Còn thiếu để lên Tự làm được: Số ngày trải ra");
    expect(renderToStaticMarkup(createElement(SkillCriteria, { checks: [], missing: [] }))).toBe("");
  });
});
