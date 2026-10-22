import { describe, expect, it } from "vitest";
import { externalCopy, levelCopy, levelFormCopy, studentReviewCopy, tutorHonorific, tutorHonorificCap } from "@/lib/copy/vi";
import { barFraction, bandOf, currentLevels, isLevelOf, levelsOf, majorIndex, nearLevel, stepIndex, strongestWeakest } from "@/lib/levels/scale";
import { parseLevelProfile, parseRecentChanges, parseReviewByDomain } from "@/lib/levels/shape";
import type { RecentChange } from "@/lib/levels/types";
import { boxValue, dayLabel, domainSentence, groupReview, levelText, mergeRecentChanges, monthLabel, profileSummary } from "@/lib/levels/view";
import { assumedProfile, confirmedProfile } from "./fixtures/levels";

const leaf = (over: Partial<{ levelFrom: string | null; levelTo: string | null; taskFrom: number | null; taskTo: number | null }> = {}) => ({
  levelFrom: null, levelTo: null, taskFrom: null, taskTo: null, ...over,
});

describe("scale (P2-b, P4-c)", () => {
  it("knows the two scales and positions on them", () => {
    expect(levelsOf("cefr")).toEqual(["A1", "A2", "A2+", "B1", "B1+", "B2", "B2+", "C1", "C2"]);
    expect(levelsOf("task_level")).toEqual(["1", "2", "3", "4"]);
    expect([isLevelOf("cefr", "B1+"), isLevelOf("cefr", "3"), isLevelOf("task_level", "3"), isLevelOf("task_level", "B1")]).toEqual([true, false, true, false]);
    expect([stepIndex("cefr", "A1"), stepIndex("cefr", "C2"), stepIndex("task_level", "2"), stepIndex("cefr", "D1"), stepIndex("cefr", null)]).toEqual([0, 8, 1, null, null]);
    expect(["A1", "A2", "A2+", "B1", "B1+", "B2", "B2+", "C1", "C2"].map((l) => majorIndex("cefr", l))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5]);
    expect(majorIndex("task_level", "4")).toBe(3);
  });

  it("bar length and level band follow the domain's own scale", () => {
    expect([barFraction("cefr", "A1"), barFraction("cefr", "C2"), barFraction("task_level", "2"), barFraction("task_level", "4")]).toEqual([1 / 9, 1, 0.5, 1]);
    expect(["A2+", "B1+", "B2", "C2"].map((l) => bandOf("cefr", l))).toEqual(["A1-A2", "B1", "B2", "C1-C2"]);
    expect(["1", "2", "3", "4"].map((l) => bandOf("task_level", l))).toEqual(["low", "low", "high", "high"]);
    expect(bandOf("cefr", "X")).toBeNull();
  });

  it("near = within the current level ± 1 CEFR level (or ± 1 task level); no level known or no leaf level → near (D1)", () => {
    expect(nearLevel("cefr", "A2", leaf({ levelFrom: "B1", levelTo: "B1+" }))).toBe(true); // one level above
    expect(nearLevel("cefr", "A2", leaf({ levelFrom: "B2", levelTo: "B2" }))).toBe(false);
    expect(nearLevel("cefr", "B2", leaf({ levelFrom: "A2", levelTo: "A2+" }))).toBe(false);
    expect(nearLevel("cefr", "B2", leaf({ levelFrom: "A2", levelTo: "B1" }))).toBe(true); // range reaches B1
    expect(nearLevel("cefr", "B2", leaf({ levelFrom: "C1", levelTo: "C2" }))).toBe(true);
    expect(nearLevel("cefr", "A2", leaf({ levelFrom: "C2", levelTo: "C2" }))).toBe(false);
    expect(nearLevel("task_level", "2", leaf({ taskFrom: 3, taskTo: 3 }))).toBe(true);
    expect(nearLevel("task_level", "2", leaf({ taskFrom: 4, taskTo: 4 }))).toBe(false);
    expect(nearLevel("cefr", undefined, leaf({ levelFrom: "C2", levelTo: "C2" }))).toBe(true);
    expect(nearLevel("cefr", "B2", leaf())).toBe(true);
  });

  it("strongest / weakest compare the 6 CEFR domains only; all equal → even (D4)", () => {
    expect(strongestWeakest(assumedProfile().domains)).toEqual({ strongest: [], weakest: [], even: true });
    const p = confirmedProfile();
    p.domains = p.domains.map((d) => (d.key === "thinking" ? { ...d, current: "4" } : d));
    const r = strongestWeakest(p.domains);
    expect([r.strongest.map((d) => d.key), r.weakest.map((d) => d.key), r.even]).toEqual([["reading"], ["writing"], false]);
    expect(currentLevels(confirmedProfile())).toMatchObject({ reading: "B2+", writing: "B1+", grammar: "B2", thinking: "2" });
  });
});

describe("plain-language text (never 'đạt' for a level)", () => {
  it("summary, one sentence per domain, box values, labels", () => {
    expect(profileSummary("Nguyên", assumedProfile())).toBe(
      `${levelCopy.summaryRange("Nguyên", "B2", "B2")} ${levelCopy.summaryNoneConfirmed("Nguyên")}`,
    );
    expect(profileSummary("Nguyên", confirmedProfile())).toBe(`${levelCopy.summaryRange("Nguyên", "B1+", "B2+")} ${levelCopy.summaryConfirmed(2, 7)}`);
    const p = confirmedProfile();
    expect(domainSentence("Nguyên", p.domains[2]!)).toBe(levelCopy.sentenceConfirmed("Nguyên", "Đọc", "B2+"));
    expect(domainSentence("Nguyên", p.domains[6]!)).toBe(levelCopy.sentenceAssumed("Nguyên", "Tư duy & tự học", "bậc 2"));
    expect(boxValue([p.domains[2]!, p.domains[3]!])).toBe(levelCopy.boxLine("Đọc, Nghe", "B2+"));
    expect([levelText("cefr", "B1"), levelText("task_level", "3")]).toEqual(["B1", "bậc 3"]);
    expect([monthLabel("2026-10-01"), dayLabel("2026-10-21T18:30:00+00:00")]).toEqual(["10/2026", "22/10/2026"]);
  });

  it("the student's review list keeps at most 3 labels, grouped by domain in order; no domain → 'Khác' (D12)", () => {
    expect(groupReview([
      { domainKey: "grammar", domainName: "Ngữ pháp", label: "Câu điều kiện" },
      { domainKey: "vocab", domainName: "Từ vựng", label: "Dạng từ" },
      { domainKey: "grammar", domainName: "Ngữ pháp", label: "Bị động" },
      { domainKey: null, domainName: null, label: "Nhãn riêng cũ" },
    ])).toEqual([{ name: "Ngữ pháp", labels: ["Câu điều kiện", "Bị động"] }, { name: "Từ vựng", labels: ["Dạng từ"] }]);
    expect(groupReview([{ domainKey: null, domainName: null, label: "x" }])).toEqual([{ name: studentReviewCopy.otherDomain, labels: ["x"] }]);
  });

  it("no level text, form text or student text contains 'đạt'", () => {
    const texts = (o: Record<string, unknown>): string[] =>
      Object.values(o).flatMap((v) =>
        typeof v === "string" ? [v]
          : typeof v === "function" ? [String((v as (...a: unknown[]) => unknown)("An", "B1", "B2", "Lan"))]
            : v && typeof v === "object" ? texts(v as Record<string, unknown>) : []);
    for (const t of [...texts(levelCopy), ...texts(levelFormCopy), ...texts(studentReviewCopy), ...texts(externalCopy)]) expect(t).not.toMatch(/đạt/iu);
  });

  it("A1: the tutor is always the configurable honorific; no level copy contains a standalone 'cô'", () => {
    const strings = (o: Record<string, unknown>): string[] =>
      Object.values(o).flatMap((v) =>
        typeof v === "string" ? [v]
          : typeof v === "function" ? [String((v as (...a: unknown[]) => unknown)("An", "B1", "B2", "Lan"))]
            : v && typeof v === "object" ? strings(v as Record<string, unknown>) : []);
    const all = [...strings(levelCopy), ...strings(levelFormCopy), ...strings(externalCopy), ...strings(studentReviewCopy)];
    for (const t of all) expect(t).not.toMatch(/(^|[^/\p{L}])cô([^/\p{L}]|$)/iu);
    expect(levelCopy.waiting).toBe(`Đang chờ ${tutorHonorific}`);
    expect(levelCopy.assumed).toBe(`Ước lượng — ${tutorHonorific} chưa xác nhận`);
    expect(levelCopy.confirmedOn("22/10/2026", null)).toBe(`${tutorHonorificCap} xác nhận ngày 22/10/2026`);
  });
});

describe("parsers", () => {
  const rawDomain = (key: string, scale = "cefr") => ({
    key, name_vi: key, scale, ord: 1, assumed_level: scale === "cefr" ? "B2" : "2", current_level: scale === "cefr" ? "B2" : "2",
    status: "assumed", last_kind: null, decided_at: null, decided_by_name: null, external: null,
  });
  const raw = {
    map_id: "SM-1", track_id: "B",
    domains: [rawDomain("grammar"), rawDomain("vocab"), rawDomain("reading"), rawDomain("listening"), rawDomain("writing"), rawDomain("speaking"), rawDomain("thinking", "task_level")],
    history: [{ id: "h1", domain_key: "reading", from_level: "B2", to_level: "B2+", kind: "baseline", reason: null, decided_at: "2026-10-21T03:00:00+00:00", decided_by_name: "Cô Lan" }],
    external_results: [{ id: "e1", exam: "FCE", taken_on: "2026-09-12", score_text: "172", domains: ["reading"], note: null, file_id: null, recorded_by_name: "Phụ huynh", recorded_role: "parent", recorded_at: "2026-09-13T01:00:00+00:00", replaces: { id: "e0", exam: "FCE", taken_on: "2026-09-12", score_text: "165", file_id: null } }],
    reading_reports: [{ month: "2026-10-01", skills: 14 }],
  };

  it("maps the profile to the view and refuses anything unexpected", () => {
    const p = parseLevelProfile(raw);
    expect(p.domains).toHaveLength(7);
    expect(p.domains[6]).toEqual({ key: "thinking", name: "thinking", scale: "task_level", current: "2", assumed: "2", status: "assumed", lastKind: null, decidedAt: null, decidedBy: null, external: null });
    expect(p.history[0]).toEqual({ id: "h1", domainKey: "reading", from: "B2", to: "B2+", kind: "baseline", reason: null, decidedAt: "2026-10-21T03:00:00+00:00", decidedBy: "Cô Lan" });
    expect(p.externalResults[0]).toMatchObject({ exam: "FCE", domains: ["reading"], recordedRole: "parent", fileId: null, replaces: { id: "e0", scoreText: "165" } });
    expect(p.readingReports).toEqual([{ month: "2026-10-01", skills: 14 }]);
    expect(() => parseLevelProfile({ ...raw, domains: raw.domains.slice(0, 6) })).toThrow();
    expect(() => parseLevelProfile({ ...raw, history: [{ ...raw.history[0], kind: "promote" }] })).toThrow();
  });

  it("recent changes and the student's list (strict: an extra key is refused)", () => {
    expect(parseRecentChanges({ changes: [{ id: "c1", domain_key: "thinking", domain_name: "Tư duy & tự học", scale: "task_level", from_level: "2", to_level: "3", kind: "adjust", reason: "x", decided_at: "2026-10-22T03:00:00+00:00", decided_by_name: "Cô Lan" }] }))
      .toEqual([{ id: "c1", domainKey: "thinking", domainName: "Tư duy & tự học", scale: "task_level", from: "2", to: "3", kind: "adjust", reason: "x", decidedAt: "2026-10-22T03:00:00+00:00", decidedBy: "Cô Lan" }]);
    expect(parseReviewByDomain({ items: [{ domain_key: "vocab", domain_name: "Từ vựng", label: "Dạng từ" }] })).toEqual([{ domainKey: "vocab", domainName: "Từ vựng", label: "Dạng từ" }]);
    expect(() => parseReviewByDomain({ items: [{ domain_key: "vocab", domain_name: "Từ vựng", label: "Dạng từ", level: "B2" }] })).toThrow();
    expect(() => parseReviewByDomain({ items: [1, 2, 3, 4].map((i) => ({ domain_key: null, domain_name: null, label: `l${i}` })) })).toThrow();
  });
});

describe("mergeRecentChanges (D11)", () => {
  const c = (id: string, at: string, alias = "An"): RecentChange => ({
    id, domainKey: "grammar", domainName: "Ngữ pháp", scale: "cefr", from: "A2", to: "A2+", kind: "baseline", reason: null, decidedAt: at, decidedBy: "Cô", learnerId: "l", alias,
  });
  it("both children, newest first, at most 5; a child that failed is skipped; all failed → null; no child → []", () => {
    const merged = mergeRecentChanges([[c("a", "2026-10-20T01:00:00+00:00"), c("b", "2026-10-22T01:00:00+00:00")], null, [c("c", "2026-10-21T01:00:00+00:00", "Nguyên")]]);
    expect(merged?.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(mergeRecentChanges([Array.from({ length: 7 }, (_, i) => c(`x${i}`, `2026-10-1${i}T01:00:00+00:00`))])).toHaveLength(5);
    expect(mergeRecentChanges([null, null])).toBeNull();
    expect(mergeRecentChanges([])).toEqual([]);
  });
});
