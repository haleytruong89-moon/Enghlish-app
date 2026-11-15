import { describe, expect, it } from "vitest";
import { allAchievements, achievementsFor, pickShown, unitLadder, type AchievementFacts, type AchievementItem, type UnitEvent, type UnitInfo } from "@/lib/student/achievements";
import type { GoalRow } from "@/lib/student/goal";
import { countsByWeek, weekHistory, type WorkWeek } from "@/lib/student/streak";

const units = (n: number, skipped: number[] = []): UnitInfo[] => Array.from({ length: n }, (_, i) => ({ code: `U${i + 1}`, ord: i + 1, skipped: skipped.includes(i + 1) }));
const ev = (u: number, s: UnitEvent["s"], at: string): UnitEvent => ({ u: `U${u}`, s, at });
const facts = (o: Partial<AchievementFacts> = {}): AchievementFacts => ({
  today: "2026-11-15", firstWorkAt: null, writes: [], topicsDone: [], revisions: [], unitEvents: [], units: units(26), flags: [], history: [], ...o,
});
const find = (items: AchievementItem[], key: string) => items.find((i) => i.key === key);
const doneEvents = (n: number): UnitEvent[] => Array.from({ length: n }, (_, i) => ev(i + 1, "done", `2026-10-${String(i + 1).padStart(2, "0")}T03:00:00Z`));

let g = 0;
const goal = (pieces: number, from: string): GoalRow => ({ id: `d${(g += 1)}`, kind: "accept", pieces, appliesFrom: from, respondsTo: `p${g}`, byRole: "tutor", createdAt: "2026-01-05T03:00:00Z" });
const metWeeks = (weeks: string[], goalFrom = weeks[0]!, current = weeks.at(-1)!) => {
  const works: WorkWeek[] = weeks.map((w) => ({ k: `a:${w}`, w }));
  return weekHistory([goal(1, goalFrom)], countsByWeek(works), current);
};
const mondays = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 7 * 86_400_000).toISOString().slice(0, 10));

describe("first_work — Bài đầu tiên", () => {
  it("earned with the Vietnam date of the first piece of work; not earned → 0/1", () => {
    expect(find(allAchievements(facts({ firstWorkAt: "2026-10-27T18:00:00Z" })), "first_work")).toMatchObject({ earned: true, date: "2026-10-28" }); // 01:00 on the 28th in Vietnam
    expect(find(allAchievements(facts()), "first_work")).toMatchObject({ earned: false, date: null, have: 0, need: 1 });
  });
});

describe("units_n — Xong n Unit đầu", () => {
  it("the ladder: 2, 4, 8, then every 4, below the number of Units; the last rung is the whole curriculum", () => {
    expect(unitLadder(26)).toEqual([2, 4, 8, 12, 16, 20, 24]);
    expect(unitLadder(10)).toEqual([2, 4, 8]);
    expect(unitLadder(8)).toEqual([2, 4]);
    expect(unitLadder(2)).toEqual([]);
    expect(unitLadder(0)).toEqual([]);
  });
  it("4 of 26 Units done: 2 and 4 earned (dated by the event that made it true), 8 is the only next one, no 12 / 16 / whole-curriculum yet", () => {
    const items = allAchievements(facts({ unitEvents: doneEvents(4) }));
    expect(find(items, "units_2")).toMatchObject({ earned: true, date: "2026-10-02" });
    expect(find(items, "units_4")).toMatchObject({ earned: true, date: "2026-10-04" });
    expect(find(items, "units_8")).toMatchObject({ earned: false, have: 4, need: 8 });
    expect(find(items, "units_12")).toBeUndefined();
    expect(find(items, "units_all")).toBeUndefined();
  });
  it("a Unit set back to 'chưa học' loses the achievement; finishing it again gives the date of the NEW stretch", () => {
    const events = [...doneEvents(4), ev(4, "not_started", "2026-10-10T03:00:00Z")];
    expect(find(allAchievements(facts({ unitEvents: events })), "units_4")).toMatchObject({ earned: false, date: null, have: 3 });
    expect(find(allAchievements(facts({ unitEvents: events })), "units_2")).toMatchObject({ earned: true, date: "2026-10-02" });
    const again = [...events, ev(4, "done", "2026-11-03T03:00:00Z")];
    expect(find(allAchievements(facts({ unitEvents: again })), "units_4")).toMatchObject({ earned: true, date: "2026-11-03" });
  });
  it("a skipped Unit is not counted, in the version or by its own event; events of Units that left the version are ignored", () => {
    const events = [ev(1, "done", "2026-10-01T03:00:00Z"), ev(2, "done", "2026-10-02T03:00:00Z"), ev(3, "skipped", "2026-10-03T03:00:00Z"), ev(4, "done", "2026-10-04T03:00:00Z"), { u: "GONE", s: "done" as const, at: "2026-10-05T03:00:00Z" }];
    expect(find(allAchievements(facts({ unitEvents: events, units: units(10, [5]) })), "units_4")).toMatchObject({ earned: false, have: 3 });
    // Unit 5 is skipped in the version: whole-curriculum of 4 Units is possible (U1, U2, U4 done + U3 skipped)
    const small = allAchievements(facts({ unitEvents: events, units: units(5, [5]) }));
    expect(find(small, "units_all")).toMatchObject({ earned: true, date: "2026-10-04" });
  });
  it("Xong cả giáo trình: earned when every counted Unit is done; the date is when the last one was", () => {
    const items = allAchievements(facts({ units: units(3), unitEvents: doneEvents(3) }));
    expect(find(items, "units_all")).toMatchObject({ earned: true, date: "2026-10-03" });
    expect(find(items, "units_2")).toMatchObject({ earned: true });
    expect(find(allAchievements(facts({ units: units(0) })), "units_all")).toBeUndefined(); // nothing to finish
  });
});

describe("streak_n and weeks_n — from the weeks that met the goal", () => {
  it("4 weeks in a row earns streak_4 (dated the Sunday that closes the 4th week); weeks_10 is next for the total", () => {
    const history = metWeeks(mondays("2026-09-28", 5), "2026-09-28", "2026-10-26");
    const items = allAchievements(facts({ history, today: "2026-11-15" }));
    expect(find(items, "streak_4")).toMatchObject({ earned: true, date: "2026-10-25" });
    expect(find(items, "streak_8")).toMatchObject({ earned: false, have: 5, need: 8 });
    expect(find(items, "streak_12")).toBeUndefined();
    expect(find(items, "weeks_10")).toMatchObject({ earned: false, have: 5, need: 10 });
  });
  it("'đã từng': a broken streak keeps streak_4; the 10th week met earns weeks_10 even across a gap", () => {
    const all = mondays("2026-08-31", 14);
    const weeks = all.filter((_, i) => i !== 5); // one missed week in the middle
    const history = metWeeks(weeks, "2026-08-31", all.at(-1)!);
    const items = allAchievements(facts({ history, today: "2027-01-01" }));
    expect(find(items, "streak_8")).toMatchObject({ earned: true });
    expect(find(items, "streak_12")).toMatchObject({ earned: false, have: 8, need: 12 }); // the next rung, 8 weeks in a row at best
    expect(find(items, "weeks_10")).toMatchObject({ earned: true });
    expect(find(items, "weeks_20")).toMatchObject({ earned: false, have: 13, need: 20 });
  });
  it("the running week that has just met the goal is dated today", () => {
    const history = metWeeks(mondays("2026-10-19", 4), "2026-10-19", "2026-11-09");
    expect(find(allAchievements(facts({ history, today: "2026-11-12" })), "streak_4")).toMatchObject({ earned: true, date: "2026-11-12" });
  });
  it("no agreed goal yet → nothing earned, closest rung is the first", () => {
    const items = allAchievements(facts());
    expect(find(items, "streak_4")).toMatchObject({ earned: false, have: 0, need: 4 });
    expect(find(items, "weeks_10")).toMatchObject({ earned: false, have: 0 });
  });
});

describe("writing_n, topic_first, revision_first", () => {
  const times = (n: number) => Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}T03:00:00Z`);
  it("10 writing tasks send the badge; its date is the 10th; 25 is the next rung", () => {
    const items = allAchievements(facts({ writes: times(10) }));
    expect(find(items, "writing_10")).toMatchObject({ earned: true, date: "2026-10-10" });
    expect(find(items, "writing_25")).toMatchObject({ earned: false, have: 10, need: 25 });
    expect(find(allAchievements(facts({ writes: times(7) })), "writing_10")).toMatchObject({ earned: false, have: 7, need: 10 });
    expect(find(allAchievements(facts({ writes: times(7) })), "writing_25")).toBeUndefined();
  });
  it("the first topic work and the first revision", () => {
    const items = allAchievements(facts({ topicsDone: ["2026-11-02T03:00:00Z"], revisions: ["2026-11-05T03:00:00Z"] }));
    expect(find(items, "topic_first")).toMatchObject({ earned: true, date: "2026-11-02" });
    expect(find(items, "revision_first")).toMatchObject({ earned: true, date: "2026-11-05" });
    expect(find(allAchievements(facts()), "topic_first")).toMatchObject({ earned: false, date: null });
    expect(find(allAchievements(facts()), "revision_first")).toMatchObject({ earned: false });
  });
});

describe("milestone:<id> — a flag whose Units are all done", () => {
  const flags = [{ id: "m1", title: "Progress Test 1", afterUnit: "U3" }];
  it("earned when U1–U3 are done; dated the day the last of them was; U4+ do not matter", () => {
    const items = allAchievements(facts({ units: units(6), flags, unitEvents: [...doneEvents(3), ev(5, "done", "2026-10-20T03:00:00Z")] }));
    expect(find(items, "milestone:m1")).toMatchObject({ earned: true, date: "2026-10-03", title: "Progress Test 1" });
  });
  it("not earned: how many of its Units are done (the flag's own closeness); a Unit put back loses it", () => {
    const part = allAchievements(facts({ units: units(6), flags, unitEvents: doneEvents(2) }));
    expect(find(part, "milestone:m1")).toMatchObject({ earned: false, have: 2, need: 3 });
    const lost = allAchievements(facts({ units: units(6), flags, unitEvents: [...doneEvents(3), ev(2, "in_progress", "2026-10-15T03:00:00Z")] }));
    expect(find(lost, "milestone:m1")).toMatchObject({ earned: false, have: 2 });
  });
  it("a flag after a Unit that is not in the version is not an achievement; a flag with only skipped Units before it proves nothing", () => {
    expect(find(allAchievements(facts({ units: units(3), flags: [{ id: "m2", title: "X", afterUnit: "U9" }] })), "milestone:m2")).toBeUndefined();
    const items = allAchievements(facts({ units: units(3, [1]), flags: [{ id: "m3", title: "Y", afterUnit: "U1" }] }));
    expect(find(items, "milestone:m3")).toMatchObject({ earned: false });
  });
});

describe("what is shown: everything earned + the 3 closest", () => {
  it("earned newest first; the three unmet ones closest to done (have/need), ties in the order of the plan", () => {
    const history = metWeeks(mondays("2026-09-28", 3), "2026-09-28", "2026-10-12");
    const { earned, nearly } = achievementsFor(facts({
      firstWorkAt: "2026-09-29T03:00:00Z", unitEvents: doneEvents(4), writes: Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}T03:00:00Z`), history, today: "2026-10-20",
    }));
    expect(earned.map((e) => e.key)).toEqual(["units_4", "units_2", "first_work"]); // 04/10, 02/10, 29/09
    expect(nearly.map((e) => e.key)).toEqual(["streak_4", "writing_10", "units_8"]); // 3/4, 7/10, 4/8
  });
  it("sorting is by closeness: 3/4 is closer than 7/10", () => {
    const items: AchievementItem[] = [
      { key: "a", kind: "writing", n: 10, title: null, earned: false, date: null, have: 7, need: 10 },
      { key: "b", kind: "streak", n: 4, title: null, earned: false, date: null, have: 3, need: 4 },
      { key: "c", kind: "units", n: 8, title: null, earned: false, date: null, have: 4, need: 8 },
      { key: "d", kind: "weeks", n: 10, title: null, earned: false, date: null, have: 0, need: 10 },
    ];
    expect(pickShown(items).nearly.map((i) => i.key)).toEqual(["b", "a", "c"]);
  });
  it("an achievement with no date (the ledgers cannot tell) is listed after the dated ones", () => {
    const items: AchievementItem[] = [
      { key: "x", kind: "first_work", n: null, title: null, earned: true, date: null, have: 1, need: 1 },
      { key: "y", kind: "first_work", n: null, title: null, earned: true, date: "2026-10-01", have: 1, need: 1 },
    ];
    expect(pickShown(items).earned.map((i) => i.key)).toEqual(["y", "x"]);
  });
  it("no coins, points or ranks exist in the data: items carry only a key, a kind, a number, a title, a date and a count of the child's own work", () => {
    const item = allAchievements(facts())[0]!;
    expect(Object.keys(item).sort()).toEqual(["date", "earned", "have", "key", "kind", "n", "need", "title"]);
  });
});

describe("cando_n — n điều tự làm được (W4e)", () => {
  const times = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}T03:00:00Z`);
  it("rungs 5, 10, 20; only the next rung of the unmet ones; the date is the n-th oldest card", () => {
    const items = allAchievements(facts({ cando: times(7) }));
    expect(find(items, "cando_5")).toMatchObject({ earned: true, date: "2026-11-05", have: 5, need: 5 });
    expect(find(items, "cando_10")).toMatchObject({ earned: false, date: null, have: 7, need: 10 });
    expect(find(items, "cando_20")).toBeUndefined();
  });
  it("no cards (or no cando facts at all) → only the first rung, with have 0", () => {
    expect(find(allAchievements(facts()), "cando_5")).toMatchObject({ earned: false, have: 0, need: 5 });
    expect(find(allAchievements(facts({ cando: [] })), "cando_10")).toBeUndefined();
  });
  it("a card that is hidden later (the skill fell back) just lowers the count: the item is not earned any more", () => {
    expect(find(allAchievements(facts({ cando: times(4) })), "cando_5")).toMatchObject({ earned: false, have: 4 });
  });
});
