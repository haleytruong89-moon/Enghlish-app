/**
 * Pure helpers for inquiry templates (S2): validation against the catalogue and the split into
 * student-safe data (steps, source references) and staff-only data (answer keys, tutor notes, transcripts).
 * No I/O. Used by the SQL generator, the CI checks and the unit tests.
 */
import {
  CLOSED_ITEM_KINDS,
  type Catalogue,
  type InquiryItem,
  type InquiryStep,
  type InquiryTemplate,
} from "./schemas";

export type Violation = {
  rule:
    | "catalogue_version"
    | "unknown_target"
    | "wrong_track_target"
    | "whitelist"
    | "duplicate_item_id"
    | "empty_answer"
    | "mcq_answer"
    | "mcq_options"
    | "planned_date";
  stepNo: number | null;
  itemId: string | null;
  message: string;
};

/**
 * One entry of a catalogue target's `evidence_tasks`, reduced to what counts:
 *  - "ACT-SOURCE-QA (reading)"            → activity ACT-SOURCE-QA (parenthetical qualifier dropped)
 *  - "ACT-SOURCE-QA -> ACT-WRITE"          → activity ACT-WRITE (a chain counts through its LAST activity:
 *                                            the evidence is what the learner produces at the end)
 *  - "any activity tagged as transfer check" → any activity, but only in a step whose purpose has `transfer_check`
 * Anything else → null (matches nothing). The SQL check in 0007 (`eng_check_inquiry_template`) does the same.
 */
export type EvidenceEntry = { kind: "activity"; id: string } | { kind: "any_transfer" };

export function parseEvidenceTask(entry: string): EvidenceEntry | null {
  if (/^\s*any activity tagged as transfer check/i.test(entry)) return { kind: "any_transfer" };
  const stripped = entry.replace(/\s*\([^)]*\)/g, "");
  const ids = stripped.match(/ACT-[A-Z0-9-]+/g);
  const last = ids?.[ids.length - 1];
  return last ? { kind: "activity", id: last } : null;
}

/** Does `entry` make a step with this activity type and purpose count as evidence? */
export function evidenceEntryAllows(entry: string, activityType: string, purpose: readonly string[]): boolean {
  const e = parseEvidenceTask(entry);
  if (!e) return false;
  return e.kind === "any_transfer" ? purpose.includes("transfer_check") : e.id === activityType;
}

/** The activity id an entry names (null for "any transfer check" and for unrecognised text). */
export function evidenceTaskId(entry: string): string | null {
  const e = parseEvidenceTask(entry);
  return e?.kind === "activity" ? e.id : null;
}

const LABEL_RE = /^([a-z])[.)]\s/i;

/**
 * Which option does an MCQ answer point to? Accepts the exact option text, a label letter ("b" for
 * "b) …" or "h. …"), or a letter position ("D" → 4th option) when the options carry no labels.
 * Returns the option index, or null when the answer does not resolve.
 */
export function resolveMcqAnswer(options: readonly string[], answer: string): number | null {
  const a = answer.trim();
  if (!a) return null;
  const exact = options.findIndex((o) => o.trim().toLowerCase() === a.toLowerCase());
  if (exact >= 0) return exact;
  if (!/^[a-z]$/i.test(a)) return null;
  const letter = a.toLowerCase();
  const labels = options.map((o) => LABEL_RE.exec(o.trim())?.[1]?.toLowerCase() ?? null);
  if (labels.length > 0 && labels.every((l) => l !== null)) {
    const idx = labels.indexOf(letter);
    return idx >= 0 ? idx : null;
  }
  const pos = letter.charCodeAt(0) - 97;
  return pos < options.length ? pos : null;
}

/** Everything wrong with `t` according to the catalogue it is bound to. Empty = valid. */
export function validateInquiryTemplate(t: InquiryTemplate, catalogue: Catalogue): Violation[] {
  const out: Violation[] = [];
  const add = (v: Violation) => out.push(v);

  if (catalogue.meta.version !== t.catalogue_version) {
    add({
      rule: "catalogue_version",
      stepNo: null,
      itemId: null,
      message: `template ${t.id} is bound to catalogue ${t.catalogue_version}, got ${catalogue.meta.version}`,
    });
    return out;
  }

  const targets = new Map(catalogue.targets.map((x) => [x.id, x]));
  const aggregates = new Map(catalogue.aggregate_indicators.map((x) => [x.id, x]));

  /** An id may be a target or an aggregate indicator (diagnostic only) of the template's track. */
  const checkRef = (id: string, stepNo: number | null, itemId: string | null): boolean => {
    const ref = targets.get(id) ?? aggregates.get(id);
    if (!ref) {
      add({ rule: "unknown_target", stepNo, itemId, message: `${id} is not in catalogue ${t.catalogue_version}` });
      return false;
    }
    if (ref.track !== t.track) {
      add({ rule: "wrong_track_target", stepNo, itemId, message: `${id} belongs to track ${ref.track}, template is track ${t.track}` });
      return false;
    }
    return true;
  };

  for (const id of t.target_ids) checkRef(id, null, null);

  const seenItems = new Set<string>();
  for (const step of t.steps) {
    for (const id of step.target_ids) {
      if (!checkRef(id, step.step_no, null)) continue;
      const target = targets.get(id);
      if (!target) continue; // an aggregate: no evidence-task list, never a mastery gate
      const rawTasks = (target as { evidence_tasks?: unknown }).evidence_tasks;
      const entries = Array.isArray(rawTasks) ? rawTasks.filter((e): e is string => typeof e === "string") : [];
      if (!entries.some((e) => evidenceEntryAllows(e, step.activity_type, step.purpose))) {
        add({
          rule: "whitelist",
          stepNo: step.step_no,
          itemId: null,
          message: `step ${step.step_no}: ${step.activity_type} is not an evidence task of ${id} (catalogue allows: ${entries.join("; ") || "none"})`,
        });
      }
    }

    if (step.planned_date && (step.planned_date < t.dates.from || step.planned_date > t.dates.to)) {
      add({
        rule: "planned_date",
        stepNo: step.step_no,
        itemId: null,
        message: `step ${step.step_no}: planned_date ${step.planned_date} is outside ${t.dates.from}..${t.dates.to}`,
      });
    }

    for (const item of step.items) {
      if (seenItems.has(item.id)) {
        add({ rule: "duplicate_item_id", stepNo: step.step_no, itemId: item.id, message: `item id ${item.id} is used twice in ${t.id}` });
      }
      seenItems.add(item.id);
      if (item.target_id) checkRef(item.target_id, step.step_no, item.id);

      if ((CLOSED_ITEM_KINDS as readonly string[]).includes(item.kind) && !item.answer.trim()) {
        add({ rule: "empty_answer", stepNo: step.step_no, itemId: item.id, message: `closed item ${item.id} (${item.kind}) has no answer` });
      }
      if (item.kind === "mcq") {
        if (item.options.length < 2) {
          add({ rule: "mcq_options", stepNo: step.step_no, itemId: item.id, message: `mcq ${item.id} needs at least 2 options` });
        } else if (resolveMcqAnswer(item.options, item.answer) === null) {
          add({ rule: "mcq_answer", stepNo: step.step_no, itemId: item.id, message: `mcq ${item.id}: answer "${item.answer}" is not one of the options` });
        }
      }
    }
  }
  return out;
}

// ---------- Student-safe / staff-only split -------------------------------------------------------

export type SafeItem = Pick<InquiryItem, "id" | "kind" | "stem" | "options" | "target_id">;
export type SafeStep = Pick<
  InquiryStep,
  "step_no" | "activity_type" | "mode" | "purpose" | "target_ids" | "prompt_en" | "time_min" | "planned_date" | "self_check_vi"
> & { items: SafeItem[] };

/** Steps as a student may read them: no answers, no explanations, no tutor script. */
export function toSafeSteps(t: InquiryTemplate): SafeStep[] {
  return t.steps.map((s) => ({
    step_no: s.step_no,
    activity_type: s.activity_type,
    mode: s.mode,
    purpose: s.purpose,
    target_ids: s.target_ids,
    prompt_en: s.prompt_en,
    time_min: s.time_min,
    planned_date: s.planned_date,
    items: s.items.map((i) => ({ id: i.id, kind: i.kind, stem: i.stem, options: i.options, target_id: i.target_id })),
    self_check_vi: s.self_check_vi,
  }));
}

export type KeyKind = "answer" | "sealed" | "note";
export type KeyRow = {
  step_no: number;
  item_id: string;
  kind: KeyKind;
  answer: string | null;
  explanation_vi: string | null;
};

export const noteItemId = (stepNo: number) => `step-${stepNo}:note`;

/**
 * Staff-only rows: closed items → `answer` (S3 auto-check); short/open items → `sealed` (model answers,
 * shown to staff only after the learner's attempt — S5); the tutor script of a step → `note`.
 */
export function toKeyRows(t: InquiryTemplate): KeyRow[] {
  const rows: KeyRow[] = [];
  for (const s of t.steps) {
    for (const i of s.items) {
      const closed = (CLOSED_ITEM_KINDS as readonly string[]).includes(i.kind);
      rows.push({
        step_no: s.step_no,
        item_id: i.id,
        kind: closed ? "answer" : "sealed",
        answer: i.answer.trim() ? i.answer : null,
        explanation_vi: i.explanation_vi.trim() ? i.explanation_vi : null,
      });
    }
    if (s.prompt_vi.trim()) {
      rows.push({ step_no: s.step_no, item_id: noteItemId(s.step_no), kind: "note", answer: null, explanation_vi: s.prompt_vi });
    }
  }
  return rows;
}

export type SourceRef = { id: string; version: number; title: string; modality: string; url: string | null };
export type SourceRow = {
  id: string;
  version: number;
  title: string;
  url: string | null;
  author: string;
  rights_note: string;
  modality: string;
  /** Reading text; null for audio and video. */
  body: string | null;
  /** Audio transcript (staff-only); null otherwise. */
  transcript: string | null;
};

/** Source references kept in the template (and in every snapshot) + the full rows for `sources`. */
export function toSources(t: InquiryTemplate): { refs: SourceRef[]; rows: SourceRow[] } {
  const refs: SourceRef[] = [];
  const rows: SourceRow[] = [];
  for (const s of t.sources) {
    refs.push({ id: s.id, version: t.version, title: s.title, modality: s.modality, url: s.url });
    rows.push({
      id: s.id,
      version: t.version,
      title: s.title,
      url: s.url,
      author: s.author,
      rights_note: s.rights_note,
      modality: s.modality,
      body: s.modality === "text" ? s.text : null,
      transcript: s.modality === "audio" ? s.text : null,
    });
  }
  return { refs, rows };
}
