import { describe, expect, it } from "vitest";
import { startCardVisible, startChecklist, type StartFacts } from "@/lib/tour/checklist";
import { tourSteps } from "@/lib/tour/steps";
import { QUICK } from "@/lib/shell/nav";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import type { LevelProfile } from "@/lib/levels/types";

const L = "b0000000-0000-4000-8000-000000000001";
const profile = (assumed: boolean) => ({ domains: [{ status: assumed ? "assumed" : "confirmed" }] }) as unknown as LevelProfile;
const card = (approved: boolean, statuses: string[] = []): CurriculumCard =>
  ({ id: "c1", title: "GS6", levelNote: null, current: approved ? { versionId: "v", version: 1, units: [] } : null, progress: approved ? { statusOf: Object.fromEntries(statuses.map((s, i) => [`U${i + 1}`, s])) } : null, open: null, events: [] }) as unknown as CurriculumCard;
const none: StartFacts = { profile: profile(true), curricula: [], assigned: { need: 0, doing: 0, done: 0, removed: 0 }, practiceGiven: 0, sessions: [] };
const byKey = (f: StartFacts) => Object.fromEntries(startChecklist(L, f).map((i) => [i.key, i.done]));

describe("27/11 · Bắt đầu với …: ticked from what is in the app", () => {
  it("a new child: nothing done, six items in the order a tutor starts", () => {
    const items = startChecklist(L, none);
    expect(items.map((i) => i.key)).toEqual(["levels", "curriculum", "unit", "assign", "feedback", "session"]);
    expect(items.every((i) => i.done === false)).toBe(true);
    expect(startCardVisible(items)).toBe(true);
  });
  it("each fact ticks its item", () => {
    const f: StartFacts = {
      profile: profile(false), curricula: [card(true, ["done", "in_progress"])], assigned: { need: 1, doing: 0, done: 2, removed: 0 }, practiceGiven: 0,
      sessions: [{ day: "2026-11-20" }] as unknown as StartFacts["sessions"],
    };
    expect(byKey(f)).toEqual({ levels: true, curriculum: true, unit: true, assign: true, feedback: true, session: true });
    expect(startCardVisible(startChecklist(L, f))).toBe(false);
  });
  it("an approved book with every Unit 'Chưa học' does not tick 'Đặt Unit đang học'; a book only in draft ticks nothing", () => {
    expect(byKey({ ...none, curricula: [card(true, ["not_started", "not_started"])] }).unit).toBe(false);
    expect(byKey({ ...none, curricula: [card(false)] }).curriculum).toBe(false);
  });
  it("link / PDF work given also counts as 'Giao bài đầu tiên'", () => {
    expect(byKey({ ...none, practiceGiven: 1 }).assign).toBe(true);
  });
  it("a fact that could not be read is unknown (never 'done', never 'to do'), and keeps the card", () => {
    const items = startChecklist(L, { profile: null, curricula: null, assigned: null, practiceGiven: null, sessions: null });
    expect(items.every((i) => i.done === null)).toBe(true);
    expect(startCardVisible(items)).toBe(true);
  });
  it("links go where the item is done", () => {
    const h = Object.fromEntries(startChecklist(L, { ...none, curricula: [card(true)] }).map((i) => [i.key, i.href]));
    expect(h).toEqual({
      levels: `/learners/${L}/levels/baseline`, curriculum: `/learners/${L}/curricula`, unit: `/learners/${L}/curricula/c1`,
      assign: `/learners/${L}/assign`, feedback: `/learners/${L}/finish`, session: `/learners/${L}/notes/new`,
    });
  });
});

describe("27/11 · the tour points at places the shell has", () => {
  it("10 steps; the three quick buttons are steps 2–4 by their real test ids", () => {
    const s = tourSteps("An");
    expect(s).toHaveLength(10);
    expect(s.slice(1, 4).map((x) => x.target)).toEqual(QUICK.map((q) => `quick-${q.key}`));
    expect(s.map((x) => x.target)).toContain("nav-work");
    expect(s[0]!.body).toContain("An");
  });
});
