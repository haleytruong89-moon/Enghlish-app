import { describe, expect, it } from "vitest";
import { feedbackCopy, formatScore, inquiriesPage, revisionCopy, revisionReviewCopy, scoreLabels, tutorHonorific } from "@/lib/copy/vi";
import { changeCount, diffWords } from "@/lib/revision/diff";
import { findExcerpt, segmentsFor } from "@/lib/revision/excerpt";
import { checkFeedback, checkMarks, marksToSend, missingVerdicts } from "@/lib/revision/rules";
import { homeSteps, splitFeedback } from "@/lib/revision/home";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import { parseFeedbackPanel, parseMyFeedback, parseMyRevision, parseRevisionList, parseRevisionView } from "@/lib/revision/shape";
import { cleanText, isUnchanged } from "@/lib/revision/text";
import { verdictsFor } from "@/lib/revision/types";
import { SCORE_WORD_SAMPLES } from "./fixtures/scoreWords";

const TEXT = "Some volcanoes explode because the magma is thick. Other volcanoes let lava flow gently.";

describe("score words (same samples as the database)", () => {
  it("agrees with english.eng_has_score_words on every shared sample", () => {
    for (const [text, hit] of SCORE_WORD_SAMPLES) expect(hasScoreWords(text), text).toBe(hit);
    expect(hasScoreWords(null)).toBe(false);
    expect(hasScoreWords("\u0110ie\u0309m 7")).toBe(false); // "e" with a hook is not the word "điểm" (ê with a hook)
    expect(hasScoreWords("\u0111i\u00ea\u0309m 7")).toBe(true); // "điểm" written with a combining hook (NFD) is caught after NFC
    expect(hasScoreWords("x".repeat(500) + " 3/4")).toBe(true);
    expect(hasScoreWords("99999999999999999999/10")).toBe(false);
  });

  it("refuses the two upper 0-4 rubric labels of the UX guide; the three lower ones are ordinary words again (S7a amendment A)", () => {
    for (const k of ["3", "4"] as const) {
      expect(hasScoreWords(scoreLabels[k].short), scoreLabels[k].short).toBe(true);
      expect(hasScoreWords(scoreLabels[k].short.toLowerCase()), k).toBe(true);
      expect(hasScoreWords(scoreLabels[k].short.toUpperCase()), k).toBe(true);
    }
    for (const k of ["0", "1", "2"] as const) expect(hasScoreWords(scoreLabels[k].short), scoreLabels[k].short).toBe(false);
    expect(hasScoreWords(formatScore(3))).toBe(true);
  });

  it("the rule is for adult text only: an excerpt or the child's marks reason that looks like a score is not refused", () => {
    const work = "He ate 3/4 of the pizza and got 8 out of 10.";
    expect(checkFeedback("Con viết rõ.", [{ text: "Thêm câu kết.", excerpt: "3/4 of the pizza", leaf: null }] as never, work)).toBeNull();
    expect(checkMarks([{ n: 1 }], { "1": { choice: "kept", reason: "Mình thấy 8 điểm là đủ" } }, true, true)).toBeNull();
  });
});

describe("text clean-up (mirror of eng_clean_text)", () => {
  it("normalises spaces, zero-width characters and curly quotes; an edit of spacing only is 'unchanged'", () => {
    expect(cleanText("  It’s a   “volcano”.​ ")).toBe("It's a \"volcano\".");
    expect(isUnchanged("Magma rises.\n\nIt is hot.", "Magma rises. It is hot.  ")).toBe(true);
    expect(isUnchanged("Magma rises.", "Magma rises fast.")).toBe(false);
  });
});

describe("word diff", () => {
  it("marks removed and added words; spacing alone is not a change; identical texts are one 'same' run", () => {
    expect(diffWords("a b c", "a x c")).toEqual([
      { op: "same", text: "a ", old: "a " }, { op: "del", text: "b " }, { op: "add", text: "x " }, { op: "same", text: "c", old: "c" },
    ]);
    expect(diffWords(TEXT, TEXT)).toEqual([{ op: "same", text: TEXT, old: TEXT }]);
    expect(diffWords("", "new text")).toEqual([{ op: "add", text: "new text" }]);
    expect(diffWords("old", "")).toEqual([{ op: "del", text: "old" }]);
  });

  it("the old column keeps the OLD spacing and line breaks, the new column the new ones", () => {
    const t = diffWords("a  b\nc d", "a b c e");
    expect(t).toEqual([{ op: "same", text: "a b c ", old: "a  b\nc " }, { op: "del", text: "d" }, { op: "add", text: "e" }]);
    expect(t.filter((x) => x.op !== "add").map((x) => x.old ?? x.text).join("")).toBe("a  b\nc d");
    expect(t.filter((x) => x.op !== "del").map((x) => x.text).join("")).toBe("a b c e");
    expect(changeCount(t)).toEqual({ added: 1, removed: 1 });
  });

  it("empty and identical texts", () => {
    expect(diffWords("", "")).toEqual([]);
    expect(diffWords("   ", "")).toEqual([{ op: "del", text: "   " }]);
    expect(changeCount(diffWords("Same text.\nTwo lines.", "Same text.\nTwo lines."))).toEqual({ added: 0, removed: 0 });
  });

  it("an accent typed as one letter or as letter + combining mark is the same word (NFD vs NFC)", () => {
    const nfc = "caf\u00e9 r\u00f4le";
    const nfd = "cafe\u0301 ro\u0302le";
    expect(nfc).not.toBe(nfd);
    const t = diffWords(nfd, nfc);
    expect(t).toEqual([{ op: "same", text: nfc, old: nfd }]);
    expect(changeCount(t)).toEqual({ added: 0, removed: 0 });
    // Vietnamese diacritics: a real change is still a change
    expect(changeCount(diffWords("Vi\u1ec7t Nam", "Vie\u0302\u0323t Nam"))).toEqual({ added: 0, removed: 0 });
    expect(changeCount(diffWords("Việt Nam", "Viet Nam"))).toEqual({ added: 1, removed: 1 });
  });

  it("curly and straight quotes are the same word; punctuation that changes is a change", () => {
    expect(changeCount(diffWords("It\u2019s the \u201Cbest\u201D one.", "It's the \"best\" one."))).toEqual({ added: 0, removed: 0 });
    expect(changeCount(diffWords("It's hot", "It\u2019s hot"))).toEqual({ added: 0, removed: 0 });
    expect(changeCount(diffWords("The gas rises.", "The gas rises!"))).toEqual({ added: 1, removed: 1 });
    expect(changeCount(diffWords("hot, cold", "hot cold"))).toEqual({ added: 1, removed: 1 });
  });

  it("keeps the order of a real revision and counts the changed words", () => {
    const t = diffWords("The gas stays inside. The pressure grows.", "The gas stays inside, so the pressure grows a lot.");
    expect(t.map((x) => x.op)).toEqual(["same", "del", "add", "same", "del", "add"]);
    expect(t.filter((x) => x.op !== "del").map((x) => x.text).join("")).toBe("The gas stays inside, so the pressure grows a lot.");
    expect(t.filter((x) => x.op !== "add").map((x) => x.text).join("")).toBe("The gas stays inside. The pressure grows.");
    // added "inside, so the" + "grows a lot." (6 words); removed "inside. The" + "grows." (3 words)
    expect(changeCount(t)).toEqual({ added: 6, removed: 3 });
  });
});

describe("excerpts", () => {
  it("finds an excerpt whatever the spacing or quotes; overlapping excerpts keep the first; unknown ones are left out", () => {
    expect(findExcerpt(TEXT, "Other  volcanoes let\nlava")).toEqual({ start: TEXT.indexOf("Other"), end: TEXT.indexOf(" flow") });
    expect(findExcerpt("It’s hot.", "It's hot")).toEqual({ start: 0, end: 8 });
    expect(findExcerpt(TEXT, "not there")).toBeNull();
    const seg = segmentsFor(TEXT, [{ n: 2, excerpt: "let lava flow" }, { n: 1, excerpt: "the magma is thick" }, { n: 3, excerpt: "magma" }, { n: 4, excerpt: null }]);
    expect(seg.filter((s) => s.n !== null).map((s) => [s.n, s.text])).toEqual([[1, "the magma is thick"], [2, "let lava flow"]]);
    expect(seg.map((s) => s.text).join("")).toBe(TEXT);
  });
});

describe("rules", () => {
  const items = [{ text: "Thêm câu kết.", excerpt: "Other volcanoes", leaf: null }, { text: "Dùng thêm từ nối.", excerpt: "", leaf: null }];
  it("feedback: praise, 1-3 items, lengths, no scores, the excerpt must be in the work", () => {
    expect(checkFeedback("Con viết rõ.", items, TEXT)).toBeNull();
    expect(checkFeedback(" ", items, TEXT)).toBe("praise_required");
    expect(checkFeedback("x".repeat(161), items, TEXT)).toBe("praise_required");
    expect(checkFeedback("Tốt", [], TEXT)).toBe("items_required");
    expect(checkFeedback("Tốt", [...items, ...items], TEXT)).toBe("items_required");
    expect(checkFeedback("Tốt", [{ text: "", excerpt: "", leaf: null }], TEXT)).toBe("items_required");
    expect(checkFeedback("Tốt", [{ text: "x".repeat(201), excerpt: "", leaf: null }], TEXT)).toBe("item_too_long");
    expect(checkFeedback("Được 3/4", items, TEXT)).toBe("score_words");
    expect(checkFeedback("Tốt", [{ text: "Sai 2 điểm", excerpt: "", leaf: null }], TEXT)).toBe("score_words");
    expect(checkFeedback("Điểm mạnh của bài là ví dụ rõ", items, TEXT)).toBeNull(); // G2: "điểm" without a number is fine
    expect(checkFeedback("Tốt", [{ text: "Sửa.", excerpt: "x".repeat(121), leaf: null }], TEXT)).toBe("excerpt_too_long");
    expect(checkFeedback("Tốt", [{ text: "Sửa.", excerpt: "Not in it", leaf: null }], TEXT)).toBe("excerpt_not_found");
    // an excerpt may quote "3/4" from the child's English: never a score-word error
    expect(checkFeedback("Tốt", [{ text: "Sửa câu này.", excerpt: "3/4 of", leaf: null }], "About 3/4 of the Earth is water.")).toBeNull();
  });

  it("marks: every item, reason as the track requires, an unchanged text means 'kept' with a reason", () => {
    const its = [{ n: 1 }, { n: 2 }];
    expect(checkMarks(its, { "1": { choice: "changed" } }, false, false)).toBe("marks_incomplete");
    expect(checkMarks(its, { "1": { choice: "changed" }, "2": { choice: "kept" } }, false, false)).toBeNull();
    expect(checkMarks(its, { "1": { choice: "changed" }, "2": { choice: "kept" } }, true, false)).toBe("reason_required");
    expect(checkMarks(its, { "1": { choice: "kept", reason: "Đúng rồi" }, "2": { choice: "changed", reason: "x" } }, false, true)).toBe("unchanged_needs_reason");
    expect(checkMarks(its, { "1": { choice: "kept", reason: "a" }, "2": { choice: "kept", reason: "b" } }, false, true)).toBeNull();
    expect(checkMarks(its, { "1": { choice: "kept", reason: "x".repeat(301) }, "2": { choice: "kept" } }, false, false)).toBe("reason_too_long");
    expect(marksToSend(its, { "1": { choice: "changed", reason: "  " }, "2": { choice: "kept", reason: " vì đúng " }, "3": { choice: "kept" } })).toEqual({
      "1": { choice: "changed" }, "2": { choice: "kept", reason: "vì đúng" },
    });
  });

  it("verdicts fit the child's choice; every item needs one", () => {
    expect(verdictsFor("changed")).toEqual(["improved", "not_yet"]);
    expect(verdictsFor("kept")).toEqual(["reason_ok", "not_yet"]);
    expect(missingVerdicts([{ n: 1 }, { n: 2 }], { 1: "improved" })).toBe(1);
  });
});

describe("parsers", () => {
  it("the child's parsers keep only what the child may see (no leaf, score, verdict or author)", () => {
    const mine = parseMyFeedback({ items: [{ feedback_id: "f", activity_id: "a", title_vi: "Núi lửa", round: 1, items_count: 2, state: "todo", seen_at: null,
      closing_note: null, praise: null, notes: null, score: 3, verdicts: ["improved"], author_name: "Cô X" }] });
    expect(mine).toEqual([{ feedbackId: "f", activityId: "a", titleVi: "Núi lửa", round: 1, itemsCount: 2, state: "todo", seenAt: null, closingNote: null, praise: null, notes: null }]);
    const page = parseMyRevision({ activity_id: "a", instance_id: "i", feedback_id: "f", title_vi: "Núi lửa", big_question_en: null, round: 1, praise: "Tốt",
      items: [{ n: 1, text: "Thêm câu kết.", excerpt: null, leaf: { kind: "tag", ref_key: "x" } }], old_text: TEXT, reason_required: true, state: "todo",
      submitted_at: null, closing_note: null, draft: { content: { text: "draft", marks: { "1": { choice: "kept" } } }, revision: 2, updated_at: "2026-10-22T01:00:00Z" } });
    expect(page?.items).toEqual([{ n: 1, text: "Thêm câu kết.", excerpt: null }]);
    expect(JSON.stringify(page)).not.toContain("leaf");
    expect(page?.draft?.content.marks).toEqual({ "1": { choice: "kept" } });
    expect(parseMyRevision(null)).toBeNull();
  });

  it("the staff parsers map the panel, the before-after view and the list", () => {
    const panel = parseFeedbackPanel({ eligible: true, can_give: false, text: TEXT, history: [],
      live: { id: "f", praise: "Tốt", items: [{ n: 1, text: "Sửa.", leaf: { kind: "tag", ref_key: "a-past" } }], requires_revision: true, round: 1,
        revision_activity_id: "r", author_name: "Cô An", author_is_me: true, created_at: "2026-10-22T01:00:00Z", editable: true, revision_state: "todo", revision_episode_id: null } });
    expect(panel?.live?.items).toEqual([{ n: 1, text: "Sửa.", excerpt: null, leaf: { kind: "tag", refKey: "a-past" } }]);
    const view = parseRevisionView({ attempt_id: "r", episode_id: "e", learner_id: "l", alias: "An", round: 1, title_vi: "Núi lửa", submitted_at: "2026-10-22T01:00:00Z",
      before: { attempt_id: "o", episode_id: "eo", text: "old", submitted_at: "2026-10-21T01:00:00Z" }, after: { text: "new" },
      feedback: { id: "f", praise: "Tốt", items: [{ n: 1, text: "Sửa." }], author_name: null, created_at: "2026-10-21T02:00:00Z" },
      marks: [{ n: 1, choice: "kept", reason: null }], checks: [], closing: null, next_round: null, reason_required: false, can_finish: true, can_open_round2: true });
    expect(view).toMatchObject({ round: 1, before: { text: "old" }, after: { text: "new" }, marks: [{ n: 1, choice: "kept", reason: null }], canOpenRound2: true });
    expect(parseRevisionList({ items: [{ attempt_id: "r", episode_id: "e", title_vi: "Núi lửa", round: 2, submitted_at: "2026-10-22T01:00:00Z", items_count: 2, state: "done", good: 1, not_yet: 1 }] }))
      .toEqual([{ attemptId: "r", episodeId: "e", titleVi: "Núi lửa", round: 2, submittedAt: "2026-10-22T01:00:00Z", itemsCount: 2, state: "done", good: 1, notYet: 1 }]);
  });
});

describe("S6 copy", () => {
  const strings = (o: unknown, args: unknown[] = [2, 3]): string[] =>
    typeof o === "string" ? [o]
      : typeof o === "function" ? strings((o as (...a: unknown[]) => unknown)(...args), args)
        : o && typeof o === "object" ? Object.values(o).flatMap((v) => strings(v, args)) : [];
  it("the child's copy has no score words; the person teaching is always tutorHonorific (never a bare 'cô' / 'thầy')", () => {
    for (const s of strings(revisionCopy)) expect(hasScoreWords(s), s).toBe(false);
    const bare = /(^|[^/\p{L}])(cô|thầy|Cô|Thầy)([^/\p{L}]|$)/u;
    for (const s of [...strings(revisionCopy), ...strings(feedbackCopy), ...strings(revisionReviewCopy)]) expect(bare.test(s), s).toBe(false);
    expect(revisionCopy.seenTitle).toContain(tutorHonorific.charAt(0).toUpperCase() + tutorHonorific.slice(1));
    expect(revisionCopy.rowLine(2)).toBe(`2 góp ý của ${tutorHonorific}`);
  });
  it("labels from the spec and the UX guide", () => {
    expect(feedbackCopy.title).toBe("Góp ý cho con");
    expect([revisionCopy.changed, revisionCopy.kept]).toEqual(["Đã sửa", "Giữ nguyên"]);
    expect(revisionReviewCopy.inboxLabel(2)).toBe("Bài sửa lại (vòng 2)");
    expect(revisionCopy.receiptTitle).toBe("Đã nộp bài sửa!");
    expect(inquiriesPage.stepLabel(7)).toBe("Bước 7");
    expect(inquiriesPage.stepLabel(1001)).toBe("Bước sửa bài");
  });
});

describe("the child's home (pure)", () => {
  const f = (over: Partial<import("@/lib/revision/types").MyFeedbackItem>) => ({
    feedbackId: "f", activityId: "a", titleVi: "Núi lửa", round: 1, itemsCount: 2, state: "todo" as const, seenAt: null, closingNote: null, praise: null, notes: null, ...over,
  });
  it("todo and submitted rows go first, 'đã xem' and notes go to the box; only todo steps are open", () => {
    const s = splitFeedback([f({ feedbackId: "1", activityId: "r1" }), f({ feedbackId: "2", activityId: "r2", state: "submitted" }), f({ feedbackId: "3", state: "seen" }), f({ feedbackId: "4", state: "note" })]);
    expect(s.rows.map((x) => x.feedbackId)).toEqual(["1", "2"]);
    expect(s.box.map((x) => x.feedbackId)).toEqual(["3", "4"]);
    expect([...s.openActivityIds]).toEqual(["r1"]);
  });
  it("the app's own revision steps (1001+) are listed only while open; template revision steps always", () => {
    const step = (stepNo: number, activityId: string) => ({ activityId, stepNo, activityType: "ACT-REVISE", mode: "REVISION" as const, purpose: [], timeMin: null, date: "2026-10-22", attempts: 0 });
    expect(homeSteps([step(13, "t"), step(1001, "own-open"), step(1002, "own-old")], new Set(["own-open"])).map((s) => s.activityId)).toEqual(["t", "own-open"]);
  });
});
