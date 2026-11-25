import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import type { StudioAssignedRow } from "@/lib/studio/assigned";
import { loadStudioAssigned } from "@/lib/studio/assignedLoad";
import { buildActions, DESK_OPTIONS, PAGE_OPTIONS, RESULT_RULES, type ActionCard } from "./actions";
import { byTag, byUnit, scoreItems, scoreWork, type AutoChecks, type ItemMeta, type TagAgg, type UnitScore, type WorkScore } from "./score";

/** `actions` = the few cards of the desk (capped by kind); `allActions` = every card (the Results page, the session page). */
export type ResultsData = { works: WorkScore[]; units: UnitScore[]; tags: TagAgg[]; actions: ActionCard[]; allActions: ActionCard[] };

type CheckRow = { attempt_id: string; checks: AutoChecks };
type DecisionRow = { attempt_id: string; item_id: string; result: "correct" | "incorrect" };
type MetaRow = { template_id: string; template_version: number; item_id: string; n: number; part: string; tag_key: string | null; reading_skill_key: string | null; out_of_app: boolean };
type EpisodeFirstRow = { id: string; attempt_id: string; is_first_attempt: boolean };
type AttemptDateRow = { id: string; submitted_at: string };
type DraftRow = { template_id: string | null; template_version: number | null; parts: { key?: string; name?: string }[] | null };

/**
 * Results of one child's Studio tests (first attempts), by test, Unit and knowledge item, with the "Việc nên làm" cards. USER client
 * (RLS: staff of the child only: attempt_auto_checks, item_decisions, studio_item_meta, studio_drafts); call after the page gate.
 * No answer text and no answer key is read. `studioRows` may be passed when the caller already loaded them (one read per page).
 */
export async function loadResults(learnerId: string, todayIso: string, studioRows?: StudioAssignedRow[] | null): Promise<ResultsData> {
  const rows = studioRows ?? (await loadStudioAssigned(learnerId, todayIso));
  const sent = rows.filter((r) => r.firstAttemptId && r.status !== "skipped");
  if (sent.length === 0) return { works: [], units: [], tags: [], actions: [], allActions: [] };
  const db = await createUserClient();
  const [chk, dec, meta, drafts, eps, atts] = await Promise.all([
    db.from("attempt_auto_checks").select("attempt_id, checks").eq("learner_id", learnerId).returns<CheckRow[]>(),
    db.from("item_decisions").select("attempt_id, item_id, result").eq("learner_id", learnerId).returns<DecisionRow[]>(),
    db.from("studio_item_meta").select("template_id, template_version, item_id, n, part, tag_key, reading_skill_key, out_of_app").eq("learner_id", learnerId).returns<MetaRow[]>(),
    db.from("studio_drafts").select("template_id, template_version, parts:payload->parts").eq("learner_id", learnerId).eq("status", "approved").returns<DraftRow[]>(),
    // The measure's own "first attempt" (episodes.is_first_attempt, across every time the same test was given) and the sending times.
    db.from("episodes").select("id, attempt_id, is_first_attempt").eq("learner_id", learnerId).returns<EpisodeFirstRow[]>(),
    db.from("attempts").select("id, submitted_at").eq("learner_id", learnerId).returns<AttemptDateRow[]>(),
  ]);
  if (chk.error) throw new Error(`attempt_auto_checks lookup: ${chk.error.code ?? "error"}`);
  if (dec.error) throw new Error(`item_decisions lookup: ${dec.error.code ?? "error"}`);
  if (meta.error) throw new Error(`studio_item_meta lookup: ${meta.error.code ?? "error"}`);
  if (eps.error) throw new Error(`episodes lookup: ${eps.error.code ?? "error"}`);
  if (atts.error) throw new Error(`attempts lookup: ${atts.error.code ?? "error"}`);
  const episodeOf = new Map((eps.data ?? []).map((e) => [e.attempt_id, e]));
  const sentAtOf = new Map((atts.data ?? []).map((a) => [a.id, a.submitted_at]));
  // Part names are a nicety: without them the part letter is shown.
  const draftRows = drafts.error ? [] : (drafts.data ?? []);

  const checksOf = new Map((chk.data ?? []).map((r) => [r.attempt_id, r.checks]));
  const decisionsOf = new Map<string, Map<string, "correct" | "incorrect">>();
  for (const d of dec.data ?? []) decisionsOf.set(d.attempt_id, (decisionsOf.get(d.attempt_id) ?? new Map()).set(d.item_id, d.result));
  const tplKey = (id: string | null | undefined, v: number | null | undefined) => `${id ?? ""}@${v ?? ""}`;
  const metaOf = new Map<string, Map<string, ItemMeta>>();
  for (const m of meta.data ?? []) {
    const k = tplKey(m.template_id, m.template_version);
    metaOf.set(k, (metaOf.get(k) ?? new Map()).set(m.item_id, { n: m.n, part: m.part, tag: m.tag_key ?? m.reading_skill_key, outOfApp: m.out_of_app }));
  }
  const partNamesOf = new Map<string, Map<string, string>>();
  for (const d of draftRows) {
    const names = new Map<string, string>();
    for (const p of Array.isArray(d.parts) ? d.parts : []) if (p?.key && p.name) names.set(p.key, p.name);
    partNamesOf.set(tplKey(d.template_id, d.template_version), names);
  }

  const works: WorkScore[] = [];
  for (const r of sent) {
    const first = r.firstAttemptId as string;
    const ep = episodeOf.get(first);
    if (!ep) continue; // not reviewed into an episode yet: nothing to measure
    const k = tplKey(r.templateId, r.templateVersion);
    const items = scoreItems(checksOf.get(first) ?? null, decisionsOf.get(first) ?? new Map(), metaOf.get(k) ?? new Map());
    if (items.length === 0) continue;
    works.push(
      scoreWork(
        {
          instanceId: r.instanceId, activityId: r.activityId, title: r.title, units: r.units, submittedAt: sentAtOf.get(first) ?? r.lastSubmittedAt ?? r.assignedAt,
          attempts: r.attempts, firstAttemptId: first, lastAttemptId: r.lastAttemptId, episodeId: ep.id, feedbackGiven: r.feedbackGiven, feedbackReady: r.feedbackReady,
          // A test given again: its first attempt here is a retry of the measure — shown, never counted (DOMAIN: first attempts only).
          counted: ep.is_first_attempt,
          official: r.firstResult, items, partNames: partNamesOf.get(k) ?? new Map(),
        },
        todayIso,
      ),
    );
  }
  works.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const counted = works.filter((w) => w.counted);
  const units = byUnit(counted, RESULT_RULES.minItems);
  const tags = byTag(counted);
  const input = { learnerId, works, units, tags };
  return { works, units, tags, actions: buildActions(input, DESK_OPTIONS), allActions: buildActions(input, PAGE_OPTIONS) };
}
