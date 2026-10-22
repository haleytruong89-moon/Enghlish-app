import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0021_feedback_revision.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnText = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));

describe("0021_feedback_revision.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0021') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|drop\s+function/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("a revision points at the work it revises, is never attempt 1 and never a first attempt", () => {
    expect(code).toContain("alter table english.attempts add column if not exists revises_attempt_id uuid references english.attempts(id);");
    expect(code).toContain("or (mode = 'REVISION' and attempt_no > 1 and parent_attempt_id = revises_attempt_id and revises_attempt_id <> id)");
    expect(code).toMatch(/create trigger attempts_revision_check\s+before insert on english\.attempts/);
    expect(code).toMatch(/create trigger episodes_revision_not_first\s+before insert on english\.episodes/);
  });

  it("track settings are configuration: reason required A false / B true, the A3 target of each track; nobody reads the table directly", () => {
    expect(code).toContain("('A', 'revision_reason_required', 'false'::jsonb)");
    expect(code).toContain("('B', 'revision_reason_required', 'true'::jsonb)");
    expect(code).toContain("('A', 'revision_target_key', '\"A-A3-REDRAFT\"'::jsonb)");
    expect(code).toContain("('B', 'revision_target_key', '\"B-A3-REVISE\"'::jsonb)");
    expect(code).toContain("revoke all on english.track_settings from public, anon, authenticated, service_role;");
  });

  it("the three books are append-only, staff-read only, and nobody inserts directly", () => {
    for (const t of ["feedback_notes", "revision_marks", "revision_checks"]) {
      expect(code).toContain(`create table if not exists english.${t} (`);
      expect(code).toMatch(new RegExp(`create trigger ${t}_forbid_mutation\\s+before update or delete on english\\.${t}\\s+for each row execute function english\\.eng_forbid_mutation\\('learner_id'\\);`));
      expect(code).toMatch(new RegExp(`create trigger ${t}_forbid_truncate\\s+before truncate on english\\.${t}\\s+for each statement execute function english\\.eng_forbid_mutation\\(\\);`));
      expect(code).toMatch(new RegExp(`create policy ${t}_select on english\\.${t}\\s+for select to authenticated\\s+using \\(english\\.eng_is_staff_of\\(learner_id\\)\\);`));
      expect(code).toContain(`alter table english.${t} enable row level security;`);
    }
    expect(code).toContain(
      "revoke insert, update, delete, truncate on english.feedback_notes, english.revision_marks, english.revision_checks from public, anon, authenticated, service_role;",
    );
    expect(code).toContain("create unique index if not exists feedback_notes_supersedes_once on english.feedback_notes(supersedes_id) where supersedes_id is not null;");
    expect(code).toContain("create unique index if not exists feedback_notes_first_once on english.feedback_notes(source_attempt_id, kind) where supersedes_id is null;");
  });

  it("the score-word check is in the table: praise and item texts, never the excerpt", () => {
    const fn = fnText(sql, "eng_has_score_words");
    expect(fn).toContain("(?<![0-9])([0-9]+)[[:space:]]*/[[:space:]]*([0-9]+)(?![0-9])");
    expect(fn).toContain("m[2] ~ '^0*(10|[1-9])$' and m[1]::numeric <= m[2]::numeric");
    expect(fn).toContain("[đĐ][iI][ểỂ][mM]");
    expect(fn).toContain("[0-9][[:space:]]*%");
    expect(fnText(sql, "eng_feedback_texts_ok")).toContain("english.eng_has_score_words(x ->> 'text')");
    expect(code).toContain("not english.eng_has_score_words(praise)");
    expect(code).toContain("english.eng_feedback_texts_ok(items)");
  });

  it("the purge keeps EVERY line of the 0020 version and its preview too; the three books go before attempts", () => {
    const old20 = readFileSync(path.join(MIGRATIONS_DIR, "0020_level_profile.sql"), "utf8");
    for (const fn of ["eng_purge_learner", "eng_purge_preview"]) {
      const now = new Set(lines(fnText(sql, fn)));
      for (const l of lines(fnText(old20, fn))) expect(now.has(l), `${fn}: ${l}`).toBe(true);
    }
    const purge = fnText(sql, "eng_purge_learner");
    const at = (s: string) => purge.indexOf(s);
    expect(at("delete from english.revision_checks rc where rc.learner_id = p_learner_id;")).toBeGreaterThan(0);
    expect(at("delete from english.revision_marks rm where rm.learner_id = p_learner_id;")).toBeGreaterThan(at("delete from english.revision_checks rc"));
    expect(at("delete from english.feedback_notes fn where fn.learner_id = p_learner_id;")).toBeGreaterThan(at("delete from english.revision_marks rm"));
    expect(at("delete from english.feedback_notes fn")).toBeLessThan(at("delete from english.attempts t"));
    expect(at("delete from english.feedback_notes fn")).toBeLessThan(at("delete from english.activity_instances a"));
    for (const k of ["feedback_notes", "revision_marks", "revision_checks"]) {
      expect(purge).toContain(`'${k}', n_${k},`);
      expect(fnText(sql, "eng_purge_preview")).toContain(`'${k}', (select pg_catalog.count(*) from english.${k} x where x.learner_id = p_learner),`);
    }
  });

  it("feedback is written by the reviewer of the work (D15), in-app writing only, no scores; rounds and the edit window are in the DB", () => {
    const w = fnText(sql, "eng_write_feedback");
    expect(w).toContain("v_role := english.eng_review_role(v_ep, p_by);");
    for (const tag of ["(not_writing)", "(praise_required)", "(score_words)", "(max_rounds)", "(checks_incomplete)", "(revision_started)", "(author_only)", "(already_given)"]) {
      expect(w, tag).toContain(tag);
    }
    expect(fnText(sql, "eng_open_revision_step")).toContain("-- D1");
    expect(fnText(sql, "eng_clean_feedback_items")).toContain("(excerpt_not_found)");
  });

  it("S5 grows for revisions: D15 follows the root; a revision is scored on its own skill and on the root's skills", () => {
    expect(fnText(sql, "eng_review_role")).toContain("and not english.eng_episode_restricted(e.id) then 'parent'");
    expect(fnText(sql, "eng_episode_targets")).toContain("where at.revises_attempt_id is not null and ra.id = english.eng_revision_root(at.id)");
  });

  it("eng_write_feedback is for service_role only; the helpers for nobody", () => {
    expect(code).toContain("revoke execute on function english.eng_write_feedback(uuid, text, jsonb, boolean, uuid, uuid, text) from public, anon, authenticated;");
    expect(code).toContain("grant execute on function english.eng_write_feedback(uuid, text, jsonb, boolean, uuid, uuid, text) to service_role;");
    for (const f of ["eng_episode_restricted(uuid)", "eng_clean_feedback_items(jsonb, text, uuid)", "eng_open_revision_step(uuid, uuid)"]) {
      expect(code).toContain(`revoke execute on function english.${f} from public, anon, authenticated, service_role;`);
    }
  });

  it("the child's functions are for authenticated only and return no score, observation, decision, verdict or leaf", () => {
    for (const sig of ["eng_my_feedback()", "eng_my_revision(uuid)", "eng_save_revision_draft(uuid, jsonb, int)", "eng_submit_revision(uuid, uuid, text, jsonb, text[], text)"]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, service_role;`);
      expect(code).toContain(`grant execute on function english.${sig} to authenticated;`);
    }
    for (const fn of ["eng_my_feedback", "eng_my_revision"]) {
      const body = fnText(sql, fn);
      for (const bad of ["observations", "validation_decisions", "revision_checks", "'leaf'", "score"]) expect(body, `${fn}: ${bad}`).not.toContain(bad);
      expect(body).toContain("m.user_id = auth.uid() and m.role = 'student'");
    }
  });

  it("a submitted revision is never first, stays in the root's family, follows the revised work, and is marked as supported", () => {
    const body = fnText(sql, "eng_submit_revision");
    expect(body).toContain("values (v_id, p_activity, v_act.learner_id, v_no, v_src.id, v_src.learning_family_id, 'REVISION', p_provenance, v_assist, v_at, v_hash, p_client_id, v_src.id);");
    expect(body).toContain("values (v_id, v_act.learner_id, false, v_context, false,");
    expect(body).toContain("'revision', true");
    expect(body).toContain("'tutor_prompt', null, v_targets, 'observed'");
    expect(body).toContain("english.eng_track_setting(v_l.track_id, 'revision_reason_required')");
  });

  // (Task 4 adds its tests here)
});
