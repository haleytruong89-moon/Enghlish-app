/**
 * Evidence for skill-state tests (S7a): one VALIDATED piece of work written straight into the evidence tables, dated `daysAgo` Vietnamese
 * days back at 12:00 - what weeks of real use would leave behind (level 3 needs work spread over ≥ 7 days). TEST learners only: it refuses
 * any other learner. The connection must be the database owner (DB tests, CI e2e), because the tables refuse direct inserts from app roles.
 * Never used by the app.
 */
import { randomUUID } from "node:crypto";
import type { ClientBase } from "pg";

export type EvidenceFacet = "baseline" | "checkpoint" | "delayed_check" | "transfer_check" | "revision";
export type EvidenceSpec = {
  /** activity_instances.id of this learner; the topic (episodes.context_id) is its inquiry's template id. */
  activityId: string;
  daysAgo: number;
  /** Skill → 0..4, or null = "không có cơ hội thể hiện". One tutor observation + one AGREE decision per skill. */
  scores: Record<string, number | null>;
  mode?: "PRACTICE" | "INDEPENDENT_CHECK" | "REVISION";
  /** Default: true when this is the first attempt on the step. */
  firstAttempt?: boolean;
  observedDirectly?: boolean;
  facets?: EvidenceFacet[];
  /** attempts.declared_assistance; default ['none']. */
  declared?: string[];
  /** assistance_events rows; each lists every scored skill. */
  help?: { kind: string; verification: "observed" | "declared" | "unknown" }[];
};
export type InsertedEvidence = { attemptId: string; episodeId: string; decisionIds: Record<string, string> };

export async function insertValidatedEpisode(client: ClientBase, learnerId: string, tutorMemberId: string, spec: EvidenceSpec): Promise<InsertedEvidence> {
  const ctx = await client.query<{ is_test: boolean; context: string }>(
    `select l.is_test, i.template_id as context
     from english.activity_instances a
     join english.learners l on l.id = a.learner_id
     join english.inquiry_instances i on i.id = a.inquiry_instance_id
     where a.id = $1 and a.learner_id = $2`,
    [spec.activityId, learnerId],
  );
  const row = ctx.rows[0];
  if (!row) throw new Error("insertValidatedEpisode: this step does not belong to this learner");
  if (!row.is_test) throw new Error("insertValidatedEpisode: refusing a learner that is not a test learner");

  const at = (
    await client.query<{ at: Date }>(
      "select ((((now() at time zone 'Asia/Ho_Chi_Minh')::date - $1::int) + time '12:00') at time zone 'Asia/Ho_Chi_Minh') as at",
      [spec.daysAgo],
    )
  ).rows[0]!.at;
  const last = (
    await client.query<{ id: string; no: number; fam: string }>(
      "select id, attempt_no as no, learning_family_id as fam from english.attempts where activity_instance_id = $1 order by attempt_no desc limit 1",
      [spec.activityId],
    )
  ).rows[0];
  const attemptId = randomUUID();
  const no = (last?.no ?? 0) + 1;
  const keys = Object.keys(spec.scores);

  await client.query(
    `insert into english.attempts(id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance,
                                  declared_assistance, submitted_at, content_hash, client_submission_id)
     values ($1, $2, $3, $4, $5, $6, $7, 'manual_import', $8::text[], $9, $10, $11)`,
    [attemptId, spec.activityId, learnerId, no, last?.id ?? null, last?.fam ?? attemptId, spec.mode ?? "INDEPENDENT_CHECK", spec.declared ?? ["none"], at, "e".repeat(64), randomUUID()],
  );
  await client.query(
    "insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by) values ($1, $2, 'text', 1, $3::jsonb, true, $4)",
    [attemptId, learnerId, JSON.stringify({ text: "Bài thử cho trạng thái kỹ năng (dữ liệu thử)." }), tutorMemberId],
  );
  const f = new Set(spec.facets ?? []);
  const facets = {
    baseline: f.has("baseline"), checkpoint: f.has("checkpoint"), delayed_check: f.has("delayed_check"), transfer_check: f.has("transfer_check"),
    ...(f.has("revision") ? { revision: true } : {}),
  };
  const episodeId = (
    await client.query<{ id: string }>(
      `insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id, observed_directly, facets, created_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7) returning id`,
      [attemptId, learnerId, spec.firstAttempt ?? no === 1, row.context, spec.observedDirectly ?? false, JSON.stringify(facets), at],
    )
  ).rows[0]!.id;
  await client.query(
    "insert into english.exposure_log(learner_id, target_key, at, source, attempt_id) select $1, k, $2, $3, $4 from unnest($5::text[]) as k",
    [learnerId, at, no > 1 ? "retry" : "practice", attemptId, keys],
  );
  for (const h of spec.help ?? []) {
    await client.query(
      "insert into english.assistance_events(learner_id, attempt_id, kind, affects_target_keys, verification, at) values ($1, $2, $3, $4::text[], $5, $6)",
      [learnerId, attemptId, h.kind, keys, h.verification, at],
    );
  }
  const decisionIds: Record<string, string> = {};
  for (const k of keys) {
    const score = spec.scores[k] ?? null;
    const obs = (
      await client.query<{ id: string }>(
        `insert into english.observations(episode_id, learner_id, target_key, scorer, scorer_member_id, status, score, not_observed, blind, rubric_version, created_at)
         values ($1, $2, $3, 'tutor', $4, 'PROPOSED', $5, $6, false, 'test', $7) returning id`,
        [episodeId, learnerId, k, tutorMemberId, score, score === null, at],
      )
    ).rows[0]!.id;
    decisionIds[k] = (
      await client.query<{ id: string }>(
        `insert into english.validation_decisions(episode_id, learner_id, target_key, observation_id, decision, final_score, final_not_observed,
                                                 validator_member_id, validator_role, created_at)
         values ($1, $2, $3, $4, 'AGREE', $5, $6, $7, 'tutor', $8) returning id`,
        [episodeId, learnerId, k, obs, score, score === null, tutorMemberId, at],
      )
    ).rows[0]!.id;
  }
  return { attemptId, episodeId, decisionIds };
}
