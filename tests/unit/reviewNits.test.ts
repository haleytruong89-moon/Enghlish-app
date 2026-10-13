import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LessonNotes } from "@/components/review/LessonNotes";
import { ModifyForm } from "@/components/review/ModifyForm";
import { ScoringPanel, type PanelTarget } from "@/components/review/ScoringPanel";
import { fallbackLabels, formatScore, reviewPage } from "@/lib/copy/vi";
import { criteriaToSend, criteriaWarning } from "@/lib/review/criteria";
import { skillLabel } from "@/lib/review/format";
import type { LessonNoteView } from "@/lib/review/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const ROOT = path.resolve(__dirname, "../..");

describe("S5 review polish: ModifyForm never turns NULL into 0", () => {
  const render = (over: Partial<Parameters<typeof ModifyForm>[0]>) =>
    renderToStaticMarkup(createElement(ModifyForm, { decisionId: "d1", skill: "Viết", testKey: "k", currentScore: 3, currentNotObserved: false, initialOpen: true, ...over }));

  it("a 'no opportunity' decision is shown as such (not as 0/4) and no button starts selected", () => {
    const html = render({ currentScore: null, currentNotObserved: true });
    expect(html).toContain(reviewPage.currentDecision(formatScore(null)));
    expect(html).not.toContain(reviewPage.currentDecision(formatScore(0)));
    expect(html).not.toContain('aria-pressed="true"');
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(6);
  });

  it("a real 0 is shown as 0, and still nothing is pre-selected", () => {
    const html = render({ currentScore: 0, currentNotObserved: false });
    expect(html).toContain(reviewPage.currentDecision(formatScore(0)));
    expect(html).not.toContain('aria-pressed="true"');
  });
});

describe("S5 review polish: the checklist of a skill", () => {
  const criteria = [{ id: "c1", method: "text_count" }, { id: "c2", method: "rater" }, { id: "c3", method: "tutor_live" }];

  it("sends only the criteria the reviewer touched: true, or an explicit false; nothing touched = nothing sent", () => {
    expect(criteriaToSend(undefined)).toBeUndefined();
    expect(criteriaToSend({})).toBeUndefined();
    expect(criteriaToSend({ c1: true })).toEqual({ c1: true });
    expect(criteriaToSend({ c1: true, c2: false })).toEqual({ c1: true, c2: false });
  });

  it("warns - never blocks - when the ticks and a 3-4 score disagree; says nothing when the checklist was not used", () => {
    // not used at all
    expect(criteriaWarning(3, criteria, undefined, true)).toBeNull();
    expect(criteriaWarning(4, criteria, {}, true)).toBeNull();
    // 3-4 with a criterion not ticked (untouched or explicitly no)
    expect(criteriaWarning(3, criteria, { c1: true }, true)).toBe("ticks_missing_for_pass");
    expect(criteriaWarning(4, criteria, { c1: true, c2: true, c3: false }, true)).toBe("ticks_missing_for_pass");
    // 3-4 with everything ticked is fine
    expect(criteriaWarning(3, criteria, { c1: true, c2: true, c3: true }, true)).toBeNull();
    // the live-only criterion cannot be ticked on unwatched work, so it is not required there
    expect(criteriaWarning(3, criteria, { c1: true, c2: true }, false)).toBeNull();
    // the other direction, and "no opportunity" with ticks
    expect(criteriaWarning(2, criteria, { c1: true, c2: true, c3: true }, true)).toBe("all_ticked_below_pass");
    expect(criteriaWarning(2, criteria, { c1: true, c2: false }, true)).toBeNull();
    expect(criteriaWarning("na", criteria, { c1: true }, true)).toBe("ticked_but_no_opportunity");
    expect(criteriaWarning("na", criteria, { c1: false }, true)).toBeNull();
    expect(criteriaWarning(undefined, criteria, { c1: true }, true)).toBeNull();
    for (const w of ["ticks_missing_for_pass", "all_ticked_below_pass", "ticked_but_no_opportunity"]) expect(reviewPage.criteriaWarnings[w]).toBeTruthy();
  });

  it("each checkbox row is at least 44px high with a 20px box", () => {
    const target: PanelTarget = {
      key: "A-L3-CAUSE-W", isTarget: true, scorable: true, lockedReason: null, titleVi: "Viết", dimensionNameVi: null, rubricVi: null,
      criteria: [{ id: "c1", checkVi: "Dùng ít nhất 2 từ nối", method: "text_count", computable: true }], opportunityRule: null, decisions: [], current: null, label: "Viết",
    };
    const html = renderToStaticMarkup(createElement(ScoringPanel, { episodeId: "e1", alias: "An (thử)", viewerRole: "tutor", canDecide: true, observedDirectly: false, targets: [target] }));
    const label = html.match(/<label[^>]*>(?:(?!<\/label>)[\s\S])*<\/label>/)?.[0] ?? "";
    expect(label).toContain('type="checkbox"');
    expect(label).toContain("min-h-11");
    expect(label).toContain("size-5");
  });
});

describe("S5 review polish: lesson notes can be edited only by their author", () => {
  const note = (id: string, tutorMemberId: string): LessonNoteView => ({
    id, learnerId: "l1", tutorMemberId, sessionDate: "2026-10-14", goals: "Goal", observed: null, supportLevel: "light", nextActions: [], practisedTargetIds: [],
    published: false, supersedesId: null, createdAt: "2026-10-14T01:00:00Z", current: true,
  });
  const render = (memberId: string, canWrite = true) =>
    renderToStaticMarkup(createElement(LessonNotes, { learnerId: "l1", notes: [note("n-mine", "m-1"), note("n-other", "m-2")], targets: [], canWrite, memberId, today: "2026-10-14", minDate: "2026-06-16" }));

  it("the author sees 'Sửa' on their own note only", () => {
    const html = render("m-1");
    expect(html).toContain('data-testid="note-edit-n-mine"');
    expect(html).not.toContain('data-testid="note-edit-n-other"');
  });
  it("a parent (read-only) sees no edit button at all", () => {
    expect(render("m-1", false)).not.toContain("note-edit-");
  });
});

describe("S5 review polish: no raw code is ever shown as a label", () => {
  it("an unknown skill gets a neutral word, not its code", () => {
    expect(skillLabel("X-UNKNOWN-CODE", null)).toBe(fallbackLabels.skill);
    expect(skillLabel("X-UNKNOWN-CODE", "Tên trong danh mục")).toBe("Tên trong danh mục");
  });

  it("no label lookup in app/ components/ lib/ falls back to the raw value (the fallback is always a fallbackLabels word)", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    for (const d of ["app", "components", "lib"]) walk(path.join(ROOT, d));
    // <something>Labels[...] / Names[...] / keyKinds[...] ... followed by a chain of `?? x`: the LAST alternative must be a fallbackLabels word
    const lookup = /\b(?:\w*Labels|\w*Names|keyKinds|autoResult|helpOptions|decidedBy|sourceModality)\[[^\]]+\](?:\??\.\w+)?((?:\s*\?\?\s*[\w.]+)+)/g;
    const bad: string[] = [];
    for (const file of files) {
      // lib/targets/view.ts falls back to the catalogue's Vietnamese wording (text), not to a code
      if (path.relative(ROOT, file) === path.join("lib", "targets", "view.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(lookup)) {
        const chain = (m[1] ?? "").split("??").map((x) => x.trim()).filter(Boolean);
        const last = chain.at(-1) ?? "";
        if (!last.startsWith("fallbackLabels.")) bad.push(`${path.relative(ROOT, file)}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
