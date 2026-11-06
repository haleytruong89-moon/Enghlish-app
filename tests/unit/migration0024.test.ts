import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0024_studio_b1.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnText = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
const grantsOf = (name: string) =>
  [...code.matchAll(new RegExp(`grant execute on function english\\.${name}\\([^)]*\\) to ([a-z_, ]+);`, "g"))].map((m) => m[1]);
const NEW_TABLES = ["ai_settings", "ai_runs", "studio_drafts", "studio_item_meta", "accepted_additions", "item_decisions"];

describe("0024_studio_b1.sql", () => {
  it("ends by recording its own version, is expand-only, never touches schema public, grants table by table", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0024') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|drop\s+function|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
    // the only statement on another schema: the private bucket's MIME list (guarded like 0016)
    expect([...code.matchAll(/\bstorage\.\w+/g)].map((m) => m[0]).sort()).toEqual(["storage.buckets", "storage.buckets"]);
  });

  it("new tables: RLS on, adults of THAT child read (eng_is_staff_of), nobody writes directly; AI tables are readable by no app role", () => {
    for (const t of NEW_TABLES) expect(code, t).toContain(`alter table english.${t} enable row level security;`);
    expect(code).toContain(
      "revoke all on english.ai_settings, english.ai_runs, english.studio_drafts, english.studio_item_meta, english.accepted_additions, english.item_decisions from public, anon, authenticated;",
    );
    expect(code).toContain(
      "revoke insert, update, delete, truncate on english.ai_settings, english.ai_runs, english.studio_drafts, english.studio_item_meta, english.accepted_additions, english.item_decisions from service_role;",
    );
    expect(code).toContain("grant select on english.studio_drafts, english.studio_item_meta, english.accepted_additions, english.item_decisions to authenticated;");
    for (const t of ["studio_drafts", "studio_item_meta", "accepted_additions", "item_decisions"]) {
      expect(code).toMatch(new RegExp(`create policy ${t}_select on english\\.${t}\\s+for select to authenticated\\s+using \\(english\\.eng_is_staff_of\\(learner_id\\)\\);`));
    }
    expect(code).not.toMatch(/create policy ai_(settings|runs)/);
    expect(code).not.toMatch(/grant select on [^;]*english\.ai_(settings|runs)/);
  });

  it("append-only tables use eng_forbid_mutation for update/delete and truncate", () => {
    for (const t of ["ai_runs", "studio_item_meta", "accepted_additions", "item_decisions"]) {
      expect(code).toContain(`'${t}'`);
    }
    expect(code).toContain("array['ai_runs', 'studio_item_meta', 'accepted_additions', 'item_decisions']");
    expect(code).toContain("'create trigger %I before update or delete on english.%I for each row execute function english.eng_forbid_mutation(%L)'");
  });

  it("CHECKs are only widened: weekly topics keep their exact rules", () => {
    expect(code).toContain("(kind = 'topic' and id ~ '^[AB]-W[0-9]+-[A-Z0-9-]+$') or (kind = 'studio' and id ~ '^[AB]-ST-[0-9]{6}$')");
    expect(code).toContain("check (kind = 'studio' or cardinality(target_ids) > 0)");
    expect(code).toContain("check (mode <> 'frame' or source = 'test' or attempt_id is not null)");
    expect(code).toContain("and cardinality(wrong_items) + cardinality(not_in_app_items) = total_items - correct");
    expect(code).toContain("check (attempt_id is not null or cardinality(not_in_app_items) = 0)");
    expect(code).toContain("or (kind in ('studio_test', 'studio_key') and mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))");
    expect(code).toContain("when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then '.docx'");
  });

  it("published Studio rows can be deleted only inside eng_purge_learner, for the child being purged; weekly topics never", () => {
    const allow = fnText(sql, "eng_purge_allows_studio");
    expect(allow).toContain("pg_catalog.to_regprocedure('english.eng_purge_learner(uuid,uuid)')");
    expect(allow).toContain("current_user <> v_owner");
    expect(allow).toContain("p_old ->> 'kind' = 'studio' and p_old ->> 'learner_id' = v_purge");
    for (const [trigger, fn] of [
      ["inquiry_templates_immutable", "eng_forbid_published_change_studio"],
      ["sources_immutable", "eng_forbid_published_change_studio"],
      ["template_item_keys_immutable", "eng_forbid_published_parent_change_studio"],
      ["template_step_sources_immutable", "eng_forbid_row_change_studio"],
    ]) {
      expect(code).toMatch(new RegExp(`create trigger ${trigger}\\s+before [a-z ]+ on english\\.\\w+\\s+for each row execute function english\\.${fn}\\(\\);`));
    }
    for (const fn of ["eng_forbid_published_change_studio", "eng_forbid_published_parent_change_studio", "eng_forbid_row_change_studio"]) {
      expect(fnText(sql, fn)).toContain("if tg_op = 'DELETE' and english.eng_purge_allows_studio(tg_table_name, pg_catalog.to_jsonb(old)) then return old; end if;");
    }
  });

  it("internal helpers and trigger functions are executable by nobody", () => {
    for (const fn of [
      "eng_purge_allows_studio(text, jsonb)",
      "eng_forbid_published_change_studio()",
      "eng_forbid_published_parent_change_studio()",
      "eng_forbid_row_change_studio()",
      "eng_guard_studio_draft()",
      "eng_check_item_decision()",
      "eng_check_studio_instance()",
    ]) {
      expect(code).toContain(`revoke execute on function english.${fn} from public, anon, authenticated, service_role;`);
    }
  });

  it("the purge keeps EVERY line of the 0023 version and its preview; Studio rows go before attempts / files, templates after the instances", () => {
    const old23 = readFileSync(path.join(MIGRATIONS_DIR, "0023_skill_states.sql"), "utf8");
    for (const fn of ["eng_purge_learner", "eng_purge_preview"]) {
      const now = new Set(lines(fnText(sql, fn)));
      for (const l of lines(fnText(old23, fn))) expect(now.has(l), `${fn}: ${l}`).toBe(true);
    }
    const purge = fnText(sql, "eng_purge_learner");
    const at = (s: string) => purge.indexOf(s);
    expect(at("delete from english.item_decisions idc")).toBeGreaterThan(0);
    expect(at("delete from english.item_decisions idc")).toBeLessThan(at("delete from english.attempts t"));
    expect(at("delete from english.accepted_additions aa")).toBeLessThan(at("delete from english.studio_item_meta sim"));
    expect(at("delete from english.studio_drafts sd")).toBeLessThan(at("delete from english.files fl"));
    expect(at("delete from english.inquiry_instances i")).toBeLessThan(at("delete from english.template_step_sources tss"));
    expect(at("delete from english.template_step_sources tss")).toBeLessThan(at("delete from english.sources so"));
    expect(at("delete from english.sources so")).toBeLessThan(at("delete from english.inquiry_templates it"));
    expect(at("delete from english.template_item_keys tik")).toBeLessThan(at("delete from english.inquiry_templates it"));
    for (const k of ["item_decisions", "accepted_additions", "studio_item_meta", "studio_drafts", "studio_step_sources", "studio_sources", "studio_template_keys", "studio_templates"]) {
      expect(purge).toContain(`'${k}', n_${k},`);
    }
    const preview = fnText(sql, "eng_purge_preview");
    for (const k of ["item_decisions", "accepted_additions", "studio_item_meta", "studio_drafts"]) {
      expect(preview).toContain(`'${k}', (select pg_catalog.count(*) from english.${k} x where x.learner_id = p_learner),`);
    }
    expect(preview).toContain("'studio_templates', (select pg_catalog.count(*) from english.inquiry_templates x where x.kind = 'studio' and x.learner_id = p_learner),");
  });

  it("Studio templates, their keys, step sources and reading texts: only the adults of THAT child; weekly topics unchanged", () => {
    expect(code).toMatch(
      /create policy inquiry_templates_select on english\.inquiry_templates\s+for select to authenticated\s+using \(published_at is not null and \(\(kind = 'topic' and english\.eng_staff_has_track\(track_id\)\) or \(kind = 'studio' and english\.eng_is_staff_of\(learner_id\)\)\)\);/,
    );
    for (const fn of ["eng_staff_may_read_template", "eng_staff_may_read_source"]) {
      const f = fnText(sql, fn);
      expect(f).toContain("(t.kind = 'topic' and english.eng_staff_has_track(t.track_id))");
      expect(f).toContain("(t.kind = 'studio' and english.eng_is_staff_of(t.learner_id))");
    }
  });

  it("auto-check: the weekly-topic branch is the 0009 text; transform / short / open get a Studio-only branch", () => {
    const old09 = readFileSync(path.join(MIGRATIONS_DIR, "0009_student_work.sql"), "utf8");
    const now = new Set(lines(fnText(sql, "eng_compute_auto_checks")));
    for (const l of lines(fnText(old09, "eng_compute_auto_checks"))) expect(now.has(l), l).toBe(true);
    const f = fnText(sql, "eng_compute_auto_checks");
    expect(f).toContain("if v_studio and v_kind in ('transform', 'short') then");
    expect(f).toContain("from english.accepted_additions aa");
    expect(f).toContain("else 'needs_person' end;");
    expect(f).toContain("elsif v_studio and v_kind = 'open' and english.eng_clean_text(v_given) = '' then");
    expect(code).toContain("revoke execute on function english.eng_compute_auto_checks(uuid, jsonb, jsonb) from public, anon, authenticated, service_role;");
  });

  it("engine input: the 0023 function with ONE changed block (decided needs_person items); same keys in the JSON", () => {
    const old23 = readFileSync(path.join(MIGRATIONS_DIR, "0023_skill_states.sql"), "utf8");
    const before = lines(fnText(old23, "eng_engine_inputs"));
    const after = lines(fnText(sql, "eng_engine_inputs"));
    const removed = before.filter((l) => !after.includes(l));
    expect(removed).toEqual([
      "'item_id', x ->> 'id', 'target_key', x ->> 'target_id', 'result', c.checks -> 'items' -> (x ->> 'id') ->> 'result')",
      "and (c.checks -> 'items' -> (x ->> 'id') ->> 'result') in ('correct', 'incorrect', 'blank')) it",
    ]);
    const f = fnText(sql, "eng_engine_inputs");
    expect(f).toContain("then (select d.result from english.item_decisions d where d.attempt_id = c.attempt_id and d.item_id = x ->> 'id')");
    expect(f).toContain("and r.res in ('correct', 'incorrect', 'blank')) it");
    expect(grantsOf("eng_engine_inputs")).toEqual(["service_role"]);
  });

  it("file register: .docx only for the two Studio kinds; the old checks stay", () => {
    const old16 = readFileSync(path.join(MIGRATIONS_DIR, "0016_practice_files.sql"), "utf8");
    const f = fnText(sql, "eng_register_file");
    const keep = lines(fnText(old16, "eng_register_file")).filter((l) => !l.includes("only pdf, png, jpeg and webp") && !l.startsWith("if v_mime not in") && !l.startsWith("v_ext :="));
    const now = new Set(lines(f));
    for (const l of keep) expect(now.has(l), l).toBe(true);
    expect(f).toContain("if v_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and p_kind not in ('studio_test', 'studio_key') then");
    expect(f).toContain("if p_kind in ('studio_test', 'studio_key') and v_mime not in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then");
  });

  it("section 3: every callable function is service_role only, re-checks the actor, and never takes a path or a learner id from the draft body", () => {
    for (const fn of [
      "eng_ai_gate", "eng_ai_settings", "eng_set_ai_settings", "eng_log_ai_run", "eng_studio_skills", "eng_create_studio_draft",
      "eng_edit_studio_draft", "eng_save_studio_draft", "eng_finish_studio_extraction", "eng_fail_studio_extraction",
      "eng_discard_studio_draft", "eng_approve_studio_draft", "eng_assign_studio", "eng_studio_draft", "eng_studio_drafts",
    ]) {
      expect(grantsOf(fn), fn).toEqual(["service_role"]);
      expect(fnText(sql, fn), fn).toContain("security definer set search_path = ''");
    }
    expect(code).toContain("revoke execute on function english.eng_ai_month_spent(uuid) from public, anon, authenticated, service_role;");
    for (const fn of ["eng_create_studio_draft", "eng_edit_studio_draft", "eng_save_studio_draft", "eng_discard_studio_draft", "eng_approve_studio_draft", "eng_assign_studio"]) {
      expect(fnText(sql, fn), fn).toContain("english.eng_actor_may_manage(p_by,");
    }
    for (const fn of ["eng_ai_settings", "eng_set_ai_settings"]) expect(fnText(sql, fn)).toContain("(parent_only)");
  });

  it("the month is the Vietnamese calendar month; consent rows are written for every child of the family", () => {
    expect(fnText(sql, "eng_ai_month_spent")).toContain(
      "(pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')",
    );
    const set = fnText(sql, "eng_set_ai_settings");
    expect(set).toContain("insert into english.consents(learner_id, subject_member_id, notice_version, scope, granted, recorded_by)");
    expect(set).toContain("'ai_text', p_enabled, p_by");
  });

  it("approve: publishes the template only after its sources and keys, writes meta and the paper frame, locks the draft", () => {
    const f = fnText(sql, "eng_approve_studio_draft");
    const at = (s: string) => f.indexOf(s);
    expect(f).toContain("for update");
    expect(f).toContain("(draft_changed)");
    expect(at("insert into english.sources(")).toBeLessThan(at("insert into english.inquiry_templates("));
    expect(at("insert into english.template_item_keys(")).toBeLessThan(at("update english.inquiry_templates set status = 'published'"));
    expect(at("update english.inquiry_templates set status = 'published'")).toBeLessThan(at("insert into english.studio_item_meta("));
    expect(f).toContain("insert into english.test_frames(");
    // no Vietnamese words in the data: stable codes, rendered by lib/copy/vi.ts
    expect(f).toContain("'studio:tutor', 'studio:private-use'");
    expect(f).toContain("target_ids");
    expect(f).toContain("(bad_skill)");
  });

  it("the child's review: student-only, own released step, Studio only; never a count, a total, a tag or a skill", () => {
    const f = fnText(sql, "eng_my_studio_review");
    expect(grantsOf("eng_my_studio_review")).toEqual(["authenticated"]);
    expect(code).toContain("revoke execute on function english.eng_my_studio_review(uuid) from public, anon, service_role;");
    expect(f).toContain("m.user_id = auth.uid() and m.role = 'student'");
    expect(f).toContain("english.eng_activity_released(p_activity)");
    expect(f).toContain("if v_kind is distinct from 'studio' then return '{}'::jsonb; end if;");
    for (const bad of ["'correct'", "'total'", "'checked'", "tag_key", "reading_skill_key", "target_id", "english.results", "studio_item_meta", "accepted_additions"]) {
      expect(f, bad).not.toContain(bad);
    }
    expect(f).toContain("r.res in ('incorrect', 'blank')");
  });

  it("results: written only when no item waits, idempotent per attempt, practice source, first / retry from the episode; tags from the item meta", () => {
    const f = fnText(sql, "eng_record_studio_result");
    expect(code).toContain("revoke execute on function english.eng_record_studio_result(uuid, uuid) from public, anon, authenticated, service_role;");
    expect(f).toContain("if v_pending > 0 then");
    expect(f).toContain("from english.results r where r.attempt_id = p_attempt");
    expect(f).toContain("'frame', 'home', case when v_first then 'first' else 'retry' end, 'practice'");
    expect(f).toContain("coalesce(m.tag_key, m.reading_skill_key)");
    expect(f).toContain("'practice', v_id, (x ->> 'n')::int, v_first, v_on, v_by");
    const trg = fnText(sql, "eng_studio_after_episode");
    expect(trg).toContain("exception when others then");
    expect(trg).toContain("'studio_result'");
    expect(code).toMatch(/create trigger episodes_studio_result\s+after insert on english\.episodes\s+for each row execute function english\.eng_studio_after_episode\(\);/);
  });

  it("verdicts: tutor or parent of the child, only waiting items, once each; 'Đúng' on transform/short adds an accepted answer for LATER attempts", () => {
    const f = fnText(sql, "eng_decide_studio_items");
    expect(grantsOf("eng_decide_studio_items")).toEqual(["service_role"]);
    expect(f).toContain("english.eng_actor_may_manage(p_by, v_t.learner_id)");
    for (const tag of ["(not_studio)", "(not_pending_item)", "(already_decided)", "(duplicate_item)"]) expect(f).toContain(tag);
    expect(f).toContain("insert into english.accepted_additions(");
    expect(f).toContain("on conflict do nothing");
    expect(f).toContain("english.eng_record_studio_result(p_attempt, p_by)");
    expect(f).not.toMatch(/update english\.attempt_auto_checks|delete from english\.results/);
    expect(grantsOf("eng_studio_pending")).toEqual(["service_role"]);
  });

  it("hard-cap safety: the gate locks the family and reserves inside the lock; the optimistic lock compares instants; frames belong to a child", () => {
    const gate = fnText(sql, "eng_ai_gate");
    expect(gate).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(gate).toContain("v_spent + v_est >= v_cap");
    expect(gate).toContain("'reserved'");
    expect(fnText(sql, "eng_ai_month_spent")).toContain("not exists (select 1 from english.ai_runs x where x.releases_run_id = r.id)");
    expect(code).not.toMatch(/updated_at::text\s*<>/);
    expect(fnText(sql, "eng_save_studio_draft")).toContain("english.eng_same_instant(v_d.updated_at, p_base)");
    expect(code).toContain("alter table english.test_frames add column if not exists learner_id uuid references english.learners(id);");
    expect(code).toContain("(learner_id is null or english.eng_is_staff_of(learner_id))");
    expect(fnText(sql, "eng_assign_studio")).toContain("(superseded)");
    expect(code).not.toMatch(/ngày làm do người giao chọn/);
    expect(grantsOf("eng_studio_retry_results")).toEqual(["service_role"]);
  });

  // (later tasks add their tests here)
});
