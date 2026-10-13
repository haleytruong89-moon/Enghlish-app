import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const read = (file: string) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

/** The text of `create or replace function english.<name>(…)` up to the closing marker. */
function fnText(sql: string, name: string, endMarker?: string): string[] {
  const start = sql.indexOf(`create or replace function english.${name}(`);
  const end = endMarker ? sql.indexOf(endMarker, start) : sql.indexOf("\n$$;", start);
  if (start < 0 || end < 0) throw new Error(`${name} not found`);
  return sql.slice(start, end + (endMarker ? endMarker.length : 4)).split("\n");
}
const PURGE_END = "grant execute on function english.eng_purge_learner(uuid, uuid) to service_role;";
const isSubsequence = (old: string[], now: string[]) => {
  let i = 0;
  for (const line of now) if (i < old.length && line === old[i]) i++;
  return { i, ok: i === old.length };
};

describe("0010_review.sql", () => {
  const sql = read("0010_review.sql");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("eng_purge_learner keeps EVERY line of the 0009 version (0010 only adds) and deletes decisions before observations, notes after exposure", () => {
    const old = fnText(read("0009_student_work.sql"), "eng_purge_learner", PURGE_END);
    const now = fnText(sql, "eng_purge_learner", PURGE_END);
    const r = isSubsequence(old, now);
    expect(r.ok, `lost line: ${old[r.i]}`).toBe(true);
    expect(now.length).toBeGreaterThan(old.length);

    const body = now.join("\n");
    const order = [
      "validation_decisions",
      "observations",
      "attempt_auto_checks",
      "episodes",
      "exposure_log",
      "lesson_notes",
      "assistance_events",
      "artifact_versions",
      "attempts",
      "working_drafts",
      "activity_instance_events",
      "instance_item_keys",
      "activity_instances",
      "inquiry_instances",
      "target_sets",
      "audit_log",
    ].map((t) => body.indexOf(`delete from english.${t} `));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // children before parents, learners last
    for (const key of ["validation_decisions", "observations", "lesson_notes"]) expect(body, key).toContain(`'${key}'`);
  });

  it("eng_submit_attempt keeps S4 behaviour: the only removed lines are the counting/exposure/episode ones now done by the shared helpers", () => {
    const old = fnText(read("0009_student_work.sql"), "eng_submit_attempt");
    const now = fnText(sql, "eng_submit_attempt");
    // every old line that is NOT part of the moved counting/effects logic is still there, in order
    const moved = new Set([
      "  v_last english.attempts%rowtype;",
      "  v_source text;",
      "  select t.* into v_last from english.attempts t",
      "  where t.activity_instance_id = p_activity order by t.attempt_no desc limit 1;",
      "  if found then",
      "    if v_act.mode = 'INDEPENDENT_CHECK' then",
      "      raise exception 'eng_submit_attempt: this step is a one-time check and was already submitted' using errcode = '23505';",
      "    end if;",
      "    v_no := v_last.attempt_no + 1;",
      "    v_parent := v_last.id;",
      "    v_family := v_last.learning_family_id;",
      "  else",
      "    v_no := 1;",
      "    v_parent := null;",
      "    v_family := v_id;",
      "  end if;",
      "  v_first := v_no = 1 and v_act.mode <> 'REVISION';",
      "  v_source := case when v_no > 1 then 'retry' else 'practice' end;",
      "  insert into english.exposure_log(learner_id, target_key, at, source, attempt_id)",
      "  select distinct v_act.learner_id, k, v_at, v_source, v_id from unnest(v_act.target_ids) as k;",
      "  insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id, observed_directly, facets)",
      "  values (v_id, v_act.learner_id, v_first, v_snapshot -> 'template' ->> 'id', false,",
      "          pg_catalog.jsonb_build_object(",
      "            'baseline', v_act.purpose @> array['baseline'],",
      "            'checkpoint', v_act.purpose @> array['checkpoint'],",
      "            'delayed_check', v_act.purpose @> array['delayed_check'],",
      "            'transfer_check', v_act.purpose @> array['transfer_check']));",
    ]);
    const kept = old.filter((l) => l.trim() !== "" && !moved.has(l) && !l.trim().startsWith("--"));
    const r = isSubsequence(kept, now.filter((l) => l.trim() !== ""));
    expect(r.ok, `lost line: ${kept[r.i]}`).toBe(true);
    const body = now.join("\n");
    expect(body).toContain("eng_attempt_slot(p_activity, v_act.mode, v_id, 'eng_submit_attempt')");
    expect(body).toContain("eng_record_attempt_effects(");
    // same grants as 0009
    expect(sql).toContain("grant execute on function english.eng_submit_attempt(uuid, uuid, jsonb, text[], text) to authenticated;");
    expect(sql).toContain("revoke execute on function english.eng_submit_attempt(uuid, uuid, jsonb, text[], text) from public, anon, service_role;");
  });

  it("is idempotent and house-style: no grant on all tables, nothing in public, ends with its schema_migrations row", () => {
    expect(code).not.toMatch(/on all tables/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/supabase db push/i);
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0010') on conflict do nothing;")).toBe(true);
    for (const m of sql.matchAll(/create table (?:if not exists )?(english\.\w+)/g)) {
      expect(sql, m[0]).toContain(`create table if not exists ${m[1]}`);
      expect(sql, `RLS on ${m[1]}`).toContain(`alter table ${m[1]} enable row level security`);
    }
    for (const t of ["observations", "validation_decisions", "lesson_notes"]) {
      expect(code, t).toContain(`create table if not exists english.${t}`);
      expect(code, `select grant ${t}`).toMatch(new RegExp(`grant select on [^;]*english\\.${t}[^;]* to authenticated`));
    }
  });

  it("the three new tables are append-only (trigger + truncate trigger) and nothing can insert/update/delete them directly", () => {
    for (const t of ["observations", "validation_decisions", "lesson_notes"]) expect(sql, t).toContain(`'${t}'`);
    expect(sql).toContain("english.eng_forbid_mutation");
    expect(sql).toContain("before truncate");
    expect(code).toMatch(/revoke insert, update, delete, truncate on english\.observations, english\.validation_decisions, english\.lesson_notes\s+from public, anon, authenticated, service_role;/);
  });

  it("every function is security definer with an empty search_path; writes are service_role only, reads authenticated only", () => {
    const defs = sql.match(/create or replace function english\.\w+\([\s\S]*?\n\$\$;/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(12);
    for (const d of defs) {
      if (/security definer/.test(d)) expect(d, d.slice(0, 80)).toMatch(/set search_path = ''/);
    }
    for (const fn of [
      "eng_record_review(uuid, text, smallint, boolean, jsonb, text, uuid, text)",
      "eng_record_reviews(uuid, jsonb, uuid, text)",
      "eng_modify_decision(uuid, smallint, boolean, text, uuid, text)",
      "eng_record_observed_support(uuid, text[], text, text, uuid, text)",
      "eng_record_offline_attempt(uuid, text, text, int, int, date, text[], uuid, uuid)",
      "eng_write_lesson_note(uuid, date, text, text, text, text[], text[], boolean, uuid, uuid, text)",
    ]) {
      expect(sql, fn).toContain(`grant execute on function english.${fn} to service_role;`);
      expect(sql, fn).toMatch(new RegExp(`revoke execute on function english\\.${fn.replace(/[()[\]]/g, "\\$&")} from public, anon, authenticated`));
    }
    for (const fn of ["eng_review_inbox(boolean)", "eng_review_episode(uuid)"]) {
      expect(sql).toContain(`grant execute on function english.${fn} to authenticated;`);
    }
    expect(sql).not.toMatch(/grant execute on function [^;]* to (anon|public)\b/i);
  });

  it("the review role (D15) is decided in SQL: checkpoint or observed_directly → tutor only", () => {
    const body = fnText(sql, "eng_review_role").join("\n");
    expect(body).toContain("'checkpoint'");
    expect(body).toContain("observed_directly");
    expect(body).toMatch(/m\.role = 'parent'[\s\S]*not \(/);
  });
});
