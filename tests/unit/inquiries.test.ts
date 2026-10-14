import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "@/lib/config/content";
import {
  evidenceEntryAllows,
  evidenceTaskId,
  parseEvidenceTask,
  noteItemId,
  resolveMcqAnswer,
  toKeyRows,
  toSafeSteps,
  toSources,
  validateInquiryTemplate,
} from "@/lib/config/inquiries";
import {
  ACTIVITY_TYPE_IDS,
  CLOSED_ITEM_KINDS,
  inquiryTemplateSchema,
  type InquiryTemplate,
} from "@/lib/config/schemas";
import { loadContentItems } from "@/lib/config/versions";

const items = loadContentItems(CONTENT_DIR);
const catalogue = (items.catalogues[0] as { data: import("@/lib/config/schemas").Catalogue }).data;
const all = [...items.inquiryTemplates, ...items.draftInquiryTemplates].map((i) => i.data);
const byId = (id: string): InquiryTemplate => {
  const t = all.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t;
};
const clone = (id: string): InquiryTemplate => structuredClone(byId(id));

describe("inquiry template files (content/inquiries)", () => {
  it("loads the 10 pilot templates: 5 for Track A, 5 for Track B", () => {
    expect(all.map((t) => t.id).sort()).toEqual([
      "A-W0-BASELINE",
      "A-W1-VOLCANOES",
      "A-W2-WATERCYCLE",
      "A-W3-EARTHQUAKES",
      "A-W4-PLANETS",
      "B-W0-BASELINE",
      "B-W1-HOMEWORK",
      "B-W2-PHONES",
      "B-W3-TRANSPORT",
      "B-W4-AI-HOMEWORK",
    ]);
    const perTrack = new Map<string, number>();
    for (const t of all) perTrack.set(t.track, (perTrack.get(t.track) ?? 0) + 1);
    expect([...perTrack.entries()].sort()).toEqual([["A", 5], ["B", 5]]);
  });

  it("every template parses; the id prefix is the track; activity types, modes, purposes are in the allowed sets", () => {
    for (const t of all) {
      expect(inquiryTemplateSchema.safeParse(t).success, t.id).toBe(true);
      expect(t.id.startsWith(`${t.track}-`), t.id).toBe(true);
      for (const s of t.steps) {
        expect(ACTIVITY_TYPE_IDS, `${t.id}#${s.step_no}`).toContain(s.activity_type);
        expect(["PRACTICE", "INDEPENDENT_CHECK", "REVISION"], `${t.id}#${s.step_no}`).toContain(s.mode);
      }
    }
  });

  it("the catalogue's 8 activity types are exactly the ones the schema accepts", () => {
    expect([...ACTIVITY_TYPE_IDS].sort()).toEqual(catalogue.meta.activity_types.items.map((a) => a.id).sort());
  });

  it("baseline templates carry purpose 'baseline' on every step (never counts toward Independent)", () => {
    for (const id of ["A-W0-BASELINE", "B-W0-BASELINE"]) {
      for (const s of byId(id).steps) expect(s.purpose, `${id}#${s.step_no}`).toContain("baseline");
    }
    for (const t of all.filter((x) => !x.id.endsWith("-BASELINE"))) {
      for (const s of t.steps) expect(s.purpose, `${t.id}#${s.step_no}`).not.toContain("baseline");
    }
  });

  it("every template is bound to the catalogue in content/ and every closed item has a non-empty answer", () => {
    for (const t of all) {
      expect(t.catalogue_version, t.id).toBe(catalogue.meta.version);
      for (const s of t.steps) {
        for (const i of s.items) {
          if ((CLOSED_ITEM_KINDS as readonly string[]).includes(i.kind)) {
            expect(i.answer.trim().length, `${t.id} ${i.id}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("a PUBLISHED template has no rule violations at all", () => {
    expect(items.inquiryTemplates.length).toBeGreaterThanOrEqual(0);
    for (const i of items.inquiryTemplates) expect(validateInquiryTemplate(i.data, catalogue), i.id).toEqual([]);
  });

  it("a DRAFT template is a draft for a stated reason: every violation sits on a needs_review step, and no step is flagged without one", () => {
    for (const i of items.draftInquiryTemplates) {
      const t = i.data;
      const flagged = new Set(t.steps.filter((s) => s.status === "needs_review").map((s) => s.step_no));
      const violations = validateInquiryTemplate(t, catalogue);
      for (const v of violations) {
        expect(v.stepNo !== null && flagged.has(v.stepNo), `${t.id}: ${v.message}`).toBe(true);
      }
      const violatingSteps = new Set(violations.map((v) => v.stepNo));
      for (const n of flagged) expect(violatingSteps.has(n), `${t.id} step ${n} is flagged but breaks no rule`).toBe(true);
    }
  });

  it("all 10 templates are published (14/10 decision, option a): no draft, no needs_review step, no whitelist violation", () => {
    expect(items.inquiryTemplates).toHaveLength(10);
    expect(items.draftInquiryTemplates).toHaveLength(0);
    for (const t of all) {
      expect(t.status, t.id).toBe("published");
      expect(t.steps.filter((s) => s.status !== undefined || s.review_note !== undefined), t.id).toEqual([]);
      expect(validateInquiryTemplate(t, catalogue), t.id).toEqual([]);
    }
  });

  it("planned dates fall inside the template week", () => {
    for (const t of all) {
      for (const s of t.steps) {
        if (s.planned_date) {
          expect(s.planned_date >= t.dates.from && s.planned_date <= t.dates.to, `${t.id}#${s.step_no}`).toBe(true);
        }
      }
    }
  });

  it("sources: rights note present, audio has a transcript, nothing is a video embed", () => {
    for (const t of all) {
      expect(t.sources.length, t.id).toBeGreaterThan(0);
      for (const s of t.sources) {
        expect(s.rights_note.trim().length, s.id).toBeGreaterThan(0);
        expect(["text", "audio"], s.id).toContain(s.modality);
        expect(s.text.trim().length, s.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("evidenceTaskId / resolveMcqAnswer", () => {
  it("strips the qualifier of a catalogue evidence task", () => {
    expect(evidenceTaskId("ACT-SOURCE-QA (reading)")).toBe("ACT-SOURCE-QA");
    expect(evidenceTaskId("ACT-WRITE")).toBe("ACT-WRITE");
    expect(evidenceTaskId("something else")).toBeNull();
  });

  it("parses chained, suffixed and 'any transfer' catalogue entries", () => {
    expect(parseEvidenceTask("ACT-SOURCE-QA -> ACT-WRITE")).toEqual({ kind: "activity", id: "ACT-WRITE" });
    expect(parseEvidenceTask("ACT-CANVAS-BASIC -> ACT-SPEAK-MONO")).toEqual({ kind: "activity", id: "ACT-SPEAK-MONO" });
    expect(parseEvidenceTask("ACT-CANVAS-ADV (evidence table)")).toEqual({ kind: "activity", id: "ACT-CANVAS-ADV" });
    expect(parseEvidenceTask("ACT-WRITE (experience text, 'what has changed' observation log)")).toEqual({ kind: "activity", id: "ACT-WRITE" });
    expect(parseEvidenceTask("ACT-SOURCE-QA (reading) -> ACT-WRITE (summary)")).toEqual({ kind: "activity", id: "ACT-WRITE" });
    expect(parseEvidenceTask("any activity tagged as transfer check")).toEqual({ kind: "any_transfer" });
    expect(parseEvidenceTask("nothing here")).toBeNull();
  });

  it("a chain counts through its LAST activity only; 'any transfer' needs the transfer_check purpose", () => {
    expect(evidenceEntryAllows("ACT-SOURCE-QA -> ACT-WRITE", "ACT-WRITE", [])).toBe(true);
    expect(evidenceEntryAllows("ACT-SOURCE-QA -> ACT-WRITE", "ACT-SOURCE-QA", [])).toBe(false);
    expect(evidenceEntryAllows("ACT-CANVAS-ADV (evidence table)", "ACT-CANVAS-ADV", [])).toBe(true);
    expect(evidenceEntryAllows("ACT-CANVAS-ADV (evidence table)", "ACT-SOURCE-QA", [])).toBe(false);
    expect(evidenceEntryAllows("any activity tagged as transfer check", "ACT-SELF-REVIEW", ["transfer_check"])).toBe(true);
    expect(evidenceEntryAllows("any activity tagged as transfer check", "ACT-SELF-REVIEW", ["checkpoint"])).toBe(false);
    expect(evidenceEntryAllows("any activity tagged as transfer check", "ACT-WRITE", [])).toBe(false);
  });

  it("resolves labelled, positional and literal answers; refuses anything else", () => {
    const labelled = ["a) one", "b) two", "c) three"];
    expect(resolveMcqAnswer(labelled, "b")).toBe(1);
    expect(resolveMcqAnswer(labelled, "B")).toBe(1);
    expect(resolveMcqAnswer(labelled, "d")).toBeNull();
    // options whose labels do not start at a: the LABEL counts, not the position
    expect(resolveMcqAnswer(["f. x", "g. y", "h. z"], "h")).toBe(2);
    expect(resolveMcqAnswer(["f. x", "g. y", "h. z"], "c")).toBeNull();
    // unlabelled options: letter position
    expect(resolveMcqAnswer(["healthy", "breakfast", "heavy", "meaning"], "D")).toBe(3);
    expect(resolveMcqAnswer(["healthy", "breakfast"], "D")).toBeNull();
    // exact text
    expect(resolveMcqAnswer(["True", "False"], "false")).toBe(1);
    expect(resolveMcqAnswer(["True", "False"], "")).toBeNull();
    expect(resolveMcqAnswer(["True", "False"], "Maybe")).toBeNull();
  });
});

describe("validateInquiryTemplate catches what the plan lists", () => {
  const base = () => clone("A-W1-VOLCANOES");
  const rules = (t: InquiryTemplate) => validateInquiryTemplate(t, catalogue).map((v) => v.rule);

  it("the untouched draft file has no violation (A-W1 is clean)", () => {
    expect(rules(base())).toEqual([]);
  });

  it("unknown target id (a typo) and a target of the other track", () => {
    const t = base();
    t.target_ids = [...t.target_ids, "A-L3-CAUSE-X"];
    expect(rules(t)).toEqual(["unknown_target"]);
    const u = base();
    u.target_ids = [...u.target_ids, "B-T1-ARG-R"];
    expect(rules(u)).toEqual(["wrong_track_target"]);
  });

  it("evidence-task whitelist: a step whose activity type is not an evidence task of its target", () => {
    const t = base();
    const step = t.steps.find((s) => s.activity_type === "ACT-WRITE" && s.target_ids.includes("A-L3-CAUSE-W"));
    if (!step) throw new Error("fixture step missing");
    step.activity_type = "ACT-SPEAK-MONO"; // A-L3-CAUSE-W is evidenced by writing only
    expect(rules(t)).toContain("whitelist");
  });

  it("whitelist against the real catalogue: chained, suffixed and 'any transfer check' entries", () => {
    // Build one step on top of a clean template and look only at the whitelist verdict.
    const verdict = (target: string, activity: string, purpose: string[] = []) => {
      const t = base();
      const step = structuredClone(t.steps[0]);
      if (!step) throw new Error("fixture step missing");
      t.steps = [{ ...step, step_no: 1, activity_type: activity as typeof step.activity_type, purpose: purpose as typeof step.purpose, target_ids: [target], items: [] }];
      return rules(t).includes("whitelist");
    };
    // A-L7-SUMMARY-W: only "ACT-SOURCE-QA -> ACT-WRITE" → the LAST activity counts
    expect(verdict("A-L7-SUMMARY-W", "ACT-WRITE")).toBe(false);
    expect(verdict("A-L7-SUMMARY-W", "ACT-SOURCE-QA")).toBe(true);
    // A-L1-COMP-W: "ACT-WRITE (comparison paragraph)" + "ACT-CANVAS-BASIC -> ACT-WRITE"
    expect(verdict("A-L1-COMP-W", "ACT-WRITE")).toBe(false);
    expect(verdict("A-L1-COMP-W", "ACT-CANVAS-BASIC")).toBe(true);
    // Track B: "ACT-CANVAS-ADV (evidence table)" → ACT-CANVAS-ADV
    const b = (target: string, activity: string) => {
      const t = clone("B-W0-BASELINE");
      const step = structuredClone(t.steps[0]);
      if (!step) throw new Error("fixture step missing");
      t.steps = [{ ...step, step_no: 1, activity_type: activity as typeof step.activity_type, purpose: ["baseline"], target_ids: [target], items: [] }];
      return rules(t).includes("whitelist");
    };
    expect(b("B-T5-SOURCE", "ACT-CANVAS-ADV")).toBe(false);
    expect(b("B-T5-SOURCE", "ACT-SOURCE-QA")).toBe(true);
    // "any activity tagged as transfer check": any activity type, only with purpose transfer_check
    expect(verdict("A-A5-REUSE", "ACT-SELF-REVIEW", ["transfer_check"])).toBe(false);
    expect(verdict("A-A5-REUSE", "ACT-SPEAK-LIVE", ["transfer_check"])).toBe(false);
    expect(verdict("A-A5-REUSE", "ACT-SELF-REVIEW", [])).toBe(true);
    expect(verdict("A-A5-REUSE", "ACT-WRITE", ["checkpoint"])).toBe(true);
  });

  it("an aggregate indicator may be named as a diagnostic target and is not whitelist-checked", () => {
    const t = clone("B-W0-BASELINE");
    expect(t.steps.some((s) => s.target_ids.includes("AGG-B-EXAM-MOCK"))).toBe(true);
    expect(rules(t)).toEqual([]);
  });

  it("duplicate item id, empty closed answer, mcq answer outside the options, mcq with one option", () => {
    const t = clone("B-W1-HOMEWORK");
    const withItems = t.steps.filter((s) => s.items.length > 0);
    const first = withItems[0]?.items[0];
    const second = withItems[1]?.items[0];
    if (!first || !second) throw new Error("fixture items missing");
    second.id = first.id;
    expect(rules(t)).toContain("duplicate_item_id");

    const u = clone("B-W0-BASELINE");
    const mcq = u.steps.flatMap((s) => s.items).find((i) => i.kind === "mcq");
    if (!mcq) throw new Error("no mcq");
    mcq.answer = "Z";
    expect(rules(u)).toContain("mcq_answer");
    mcq.answer = "";
    expect(rules(u)).toContain("empty_answer");
    mcq.answer = "A";
    mcq.options = ["only one"];
    expect(rules(u)).toContain("mcq_options");
  });

  it("a template bound to another catalogue version is refused", () => {
    const t = base();
    t.catalogue_version = "9.9";
    expect(rules(t)).toEqual(["catalogue_version"]);
  });
});

describe("student-safe split", () => {
  const forbidden = ["answer", "explanation_vi", "prompt_vi", "review_note", "rights_note", "text", "transcript", "body"];
  const keysDeep = (v: unknown, out: Set<string> = new Set()): Set<string> => {
    if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        out.add(k);
        keysDeep(x, out);
      }
    }
    return out;
  };

  it("safe steps and source references contain no answer, explanation, tutor script or transcript", () => {
    for (const t of all) {
      const keys = keysDeep({ steps: toSafeSteps(t), sources: toSources(t).refs });
      for (const f of forbidden) expect(keys.has(f), `${t.id} leaks "${f}"`).toBe(false);
    }
  });

  it("every item has exactly one key row and tutor scripts become 'note' rows; closed → answer, others → sealed", () => {
    for (const t of all) {
      const rows = toKeyRows(t);
      const itemRows = rows.filter((r) => r.kind !== "note");
      const items = t.steps.flatMap((s) => s.items);
      expect(itemRows.map((r) => r.item_id), t.id).toEqual(items.map((i) => i.id));
      for (const r of itemRows) {
        const item = items.find((i) => i.id === r.item_id);
        const closed = (CLOSED_ITEM_KINDS as readonly string[]).includes(item?.kind ?? "");
        expect(r.kind, `${t.id} ${r.item_id}`).toBe(closed ? "answer" : "sealed");
      }
      const notes = rows.filter((r) => r.kind === "note");
      expect(notes.map((r) => r.item_id)).toEqual(t.steps.filter((s) => s.prompt_vi.trim()).map((s) => noteItemId(s.step_no)));
      expect(new Set(rows.map((r) => r.item_id)).size, `${t.id}: item_id must be unique`).toBe(rows.length);
    }
  });

  it("the audio transcript goes to the staff-only column, the reading text to the readable one", () => {
    const { rows } = toSources(byId("A-W1-VOLCANOES"));
    const text = rows.find((r) => r.modality === "text");
    const audio = rows.find((r) => r.modality === "audio");
    expect(text?.body).toBeTruthy();
    expect(text?.transcript).toBeNull();
    expect(audio?.body).toBeNull();
    expect(audio?.transcript).toBeTruthy();
  });

  it("video sources must be links and carry no text; the schema refuses an embed-like source", () => {
    const t = clone("A-W1-VOLCANOES");
    t.sources.push({ id: "A-W1-VOLCANOES-S9", title: "v", url: null, author: "x", rights_note: "r", modality: "video", text: "" });
    expect(inquiryTemplateSchema.safeParse(t).success).toBe(false);
    t.sources[t.sources.length - 1] = { id: "A-W1-VOLCANOES-S9", title: "v", url: "https://example.org/watch", author: "x", rights_note: "r", modality: "video", text: "" };
    expect(inquiryTemplateSchema.safeParse(t).success).toBe(true);
  });

  it("a published template cannot keep a needs_review step", () => {
    const t = clone("B-W1-HOMEWORK");
    t.status = "published";
    const step = t.steps[7];
    if (!step) throw new Error("fixture step missing");
    step.status = "needs_review";
    step.review_note = "waits for the parent";
    expect(inquiryTemplateSchema.safeParse(t).success).toBe(false);
  });
});

describe("Track B templates B-W1..B-W4 after the 14/10 decision (option a)", () => {
  const B_WEEKS = ["B-W1-HOMEWORK", "B-W2-PHONES", "B-W3-TRANSPORT", "B-W4-AI-HOMEWORK"];
  type DraftItem = { id: string; kind: string; stem: string; options: string[]; answer: string; explanation_vi: string; target_id: string | null };
  const draftFile = JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", "drafts", "inquiries_B_draft.json"), "utf8")) as {
    items: { inquiry_id: string; sources: { text: string; title: string }[]; steps: { items?: DraftItem[] }[] }[];
  };

  it("are published at version 1 and pass the catalogue whitelist with no violation at all", () => {
    for (const id of B_WEEKS) {
      const t = byId(id);
      expect(t.status, id).toBe("published");
      expect(t.version, id).toBe(1);
      expect(inquiryTemplateSchema.safeParse(t).success, id).toBe(true);
      expect(validateInquiryTemplate(t, catalogue), id).toEqual([]);
      for (const s of t.steps) {
        for (const tid of s.target_ids) expect(t.target_ids, `${id}#${s.step_no} ${tid}`).toContain(tid);
      }
    }
  });

  it("every revision step counts for B-A3-REVISE only; every ACT-SOURCE-QA step has no B-T5-SOURCE any more", () => {
    for (const id of B_WEEKS) {
      const t = byId(id);
      const revise = t.steps.filter((s) => s.activity_type === "ACT-REVISE");
      expect(revise, id).toHaveLength(1);
      expect(revise[0]?.target_ids, id).toEqual(["B-A3-REVISE"]);
      for (const s of t.steps.filter((x) => x.activity_type === "ACT-SOURCE-QA")) {
        expect(s.target_ids, `${id}#${s.step_no}`).not.toContain("B-T5-SOURCE");
        for (const i of s.items) expect(i.target_id, `${id} ${i.id}`).not.toBe("B-T5-SOURCE");
      }
    }
  });

  it("B-W2: the source-QA step is split in two, items and targets in the right place, steps renumbered", () => {
    const t = byId("B-W2-PHONES");
    expect(t.steps.map((s) => s.step_no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const [read, trust] = [t.steps[3], t.steps[4]];
    if (!read || !trust) throw new Error("split steps missing");
    expect(read.activity_type).toBe("ACT-SOURCE-QA");
    expect(read.target_ids).toEqual(["B-T2-ASSUME-R"]);
    expect(read.items.map((i) => [i.id, i.target_id])).toEqual([["W2-B1-1", "B-T2-ASSUME-R"], ["W2-B1-2", "B-T2-ASSUME-R"]]);
    expect(trust.activity_type).toBe("ACT-WRITE");
    expect(trust.target_ids).toEqual(["B-T5-SOURCE"]);
    expect(trust.items.map((i) => [i.id, i.target_id])).toEqual([["W2-B1-3", "B-T5-SOURCE"], ["W2-B1-4", "B-T5-SOURCE"]]);
    expect(trust.prompt_en).toBe("Answer questions 1 and 2 about how far you can trust the sources. Write 2–4 sentences for each answer.");
    expect(trust.prompt_vi).toBe("Phần đánh giá độ tin cậy của nguồn (tách từ bước đọc ở trên để tính đúng kỹ năng B-T5-SOURCE).");
    // same mode / purpose / planned date; time 30 → new step max(5, floor(30/2)) = 15, the original keeps the other 15
    expect(trust.mode).toBe(read.mode);
    expect(trust.purpose).toEqual(read.purpose);
    expect(trust.planned_date).toBe(read.planned_date);
    expect(trust.time_min).toBe(15);
    expect(read.time_min).toBe(15);
    expect(t.target_ids).toContain("B-T5-SOURCE");
    expect(t.target_ids).toContain("B-A3-REVISE");
    // the later steps moved by one
    expect(t.steps.map((s) => s.activity_type)).toEqual([
      "ACT-SOURCE-QA", "ACT-SOURCE-QA", "ACT-WRITE", "ACT-SOURCE-QA", "ACT-WRITE", "ACT-CANVAS-ADV", "ACT-SOURCE-QA", "ACT-WRITE", "ACT-REVISE", "ACT-SPEAK-LIVE",
    ]);
  });

  it("B-W4: the all-B-T5-SOURCE step (last) is now ACT-WRITE, nothing else about it changed", () => {
    const t = byId("B-W4-AI-HOMEWORK");
    expect(t.steps).toHaveLength(9);
    const last = t.steps[8];
    expect(last?.activity_type).toBe("ACT-WRITE");
    expect(last?.target_ids).toEqual(["B-T5-SOURCE"]);
    expect(last?.mode).toBe("INDEPENDENT_CHECK");
    expect(last?.time_min).toBe(10);
    expect(last?.items.map((i) => i.id)).toEqual(["W4-C-1", "W4-C-2"]);
  });

  it("no answer, stem or option changed versus the Pilot Kit draft (compared item by item); no item was added or lost", () => {
    for (const id of B_WEEKS) {
      const draft = draftFile.items.find((d) => d.inquiry_id === id);
      if (!draft) throw new Error(`no draft for ${id}`);
      const before = new Map(draft.steps.flatMap((s) => s.items ?? []).map((i) => [i.id, i]));
      const after = new Map(byId(id).steps.flatMap((s) => s.items).map((i) => [i.id, i]));
      expect([...after.keys()].sort(), id).toEqual([...before.keys()].sort());
      for (const [itemId, a] of after) {
        const b = before.get(itemId);
        expect({ kind: a.kind, stem: a.stem, options: a.options, answer: a.answer, explanation_vi: a.explanation_vi, target_id: a.target_id }, `${id} ${itemId}`).toEqual({
          kind: b?.kind,
          stem: b?.stem,
          options: b?.options,
          answer: b?.answer,
          explanation_vi: b?.explanation_vi,
          target_id: b?.target_id || null, // the Pilot Kit draft writes "" for a pure diagnostic item
        });
      }
      // sources are untouched too
      expect(byId(id).sources.map((s) => [s.title, s.text]), id).toEqual(draft.sources.map((s) => [s.title, s.text]));
    }
  });
});
