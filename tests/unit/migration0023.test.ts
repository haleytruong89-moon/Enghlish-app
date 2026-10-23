import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0023_skill_states.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnText = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
/** Every callable function of 0023 is for the server only (service_role after requireAccess); internal ones for nobody. */
const grantsOf = (name: string) => [...code.matchAll(new RegExp(`grant execute on function english\\.${name}\\([^)]*\\) to ([a-z_, ]+);`, "g"))].map((m) => m[1]);

describe("0023_skill_states.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0023') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|drop\s+function/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("the engine reads AP-0.3 through an insert-only map; the locked catalogue is not touched (D2)", () => {
    expect(code).toContain("values ('0.2.1-draft', 'AP-0.3',");
    expect(code).not.toMatch(/update\s+english\.catalogue_versions/i);
    expect(code).toMatch(/create trigger engine_policy_map_immutable\s+before update or delete on english\.engine_policy_map\s+for each row execute function english\.eng_forbid_row_change\(\);/);
    expect(code).toContain("revoke all on english.engine_policy_map from public, anon, authenticated, service_role;");
    expect(fnText(sql, "eng_engine_policy")).toContain("english.engine_policy_map");
  });

  it("the decision book is append-only, staff-read only, and nobody writes it or the derived state directly", () => {
    expect(code).toMatch(/create trigger mastery_decisions_forbid_mutation\s+before update or delete on english\.mastery_decisions\s+for each row execute function english\.eng_forbid_mutation\('learner_id'\);/);
    expect(code).toMatch(/create trigger mastery_decisions_forbid_truncate\s+before truncate on english\.mastery_decisions\s+for each statement execute function english\.eng_forbid_mutation\(\);/);
    for (const t of ["mastery_decisions", "competency_state", "episode_marks"]) {
      expect(code).toContain(`alter table english.${t} enable row level security;`);
      expect(code).toMatch(new RegExp(`create policy ${t}_select on english\\.${t}\\s+for select to authenticated\\s+using \\(english\\.eng_is_staff_of\\(learner_id\\)\\);`));
    }
    expect(code).toContain("revoke insert, update, delete, truncate on english.mastery_decisions, english.competency_state, english.episode_marks from public, anon, authenticated, service_role;");
    expect(code).toContain("check (kind in ('AUTO', 'PROPOSED', 'CONFIRMED', 'REJECTED', 'MANUAL', 'FLAG'))");
    expect(code).toContain("create unique index if not exists mastery_decisions_answered_once on english.mastery_decisions(responds_to) where responds_to is not null;");
    expect(code).toContain("create unique index if not exists mastery_decisions_evidence_once on english.mastery_decisions(learner_id, target_key, kind, evidence_key) where kind in ('PROPOSED', 'FLAG');");
  });

  it("never downgrade is in the table: AUTO only up to 1–2, PROPOSED only up to 3–4, ⚑ keeps the level, MANUAL only to 1–2 with a reason", () => {
    expect(code).toContain("(kind = 'AUTO' and english.eng_skill_level(to_state) between 1 and 2 and english.eng_skill_level(to_state) > english.eng_skill_level(from_state))");
    expect(code).toContain("(kind = 'PROPOSED' and english.eng_skill_level(to_state) between 3 and 4 and english.eng_skill_level(to_state) > english.eng_skill_level(from_state))");
    expect(code).toContain("(kind = 'FLAG' and to_state = from_state and english.eng_skill_level(from_state) >= 2)");
    expect(code).toContain("(kind = 'MANUAL' and to_state in ('SUPPORTED', 'DEVELOPING') and to_state <> from_state and reason is not null)");
  });

  it("internal helpers are executable by nobody", () => {
    for (const fn of ["eng_engine_policy(uuid)", "eng_engine_scope(uuid)", "eng_uuid_array(jsonb)", "eng_attempt_assistance(uuid)", "eng_project_skill_state(uuid, text)"]) {
      expect(code).toContain(`revoke execute on function english.${fn} from public, anon, authenticated, service_role;`);
    }
    expect(grantsOf("eng_skill_level")).toEqual(["authenticated, service_role"]);
  });

  it("score words (amendment A): only 'Đạt yêu cầu' and 'Vững, rõ ràng' of the 0–4 labels are still refused", () => {
    const fn = fnText(sql, "eng_has_score_words");
    expect(fn).toContain("[đĐ][ạẠ][tT],?[[:space:]]+[yY][êÊ][uU],?[[:space:]]+[cC][ầẦ][uU]|[vV][ữỮ][nN][gG],?[[:space:]]+[rR][õÕ],?[[:space:]]+[rR][àÀ][nN][gG]");
    expect(fn).not.toContain("[cC][hH][ưƯ][aA],?");
    expect(fn).not.toContain("[cC][òÒ][nN],?");
    expect(fn).not.toContain("[pP][hH][ầẦ][nN]");
    expect(fn).toContain("pg_catalog.chr(160) || pg_catalog.chr(8239) || pg_catalog.chr(12288)");
  });

  it("the purge keeps EVERY line of the 0021 version and its preview; the state and the book go before the S5 tables", () => {
    const old21 = readFileSync(path.join(MIGRATIONS_DIR, "0021_feedback_revision.sql"), "utf8");
    for (const fn of ["eng_purge_learner", "eng_purge_preview"]) {
      const now = new Set(lines(fnText(sql, fn)));
      for (const l of lines(fnText(old21, fn))) expect(now.has(l), `${fn}: ${l}`).toBe(true);
    }
    const purge = fnText(sql, "eng_purge_learner");
    const at = (s: string) => purge.indexOf(s);
    expect(at("delete from english.competency_state cs where cs.learner_id = p_learner_id;")).toBeGreaterThan(0);
    expect(at("delete from english.mastery_decisions md where md.learner_id = p_learner_id;")).toBeGreaterThan(at("delete from english.competency_state cs"));
    expect(at("delete from english.mastery_decisions md")).toBeLessThan(at("delete from english.validation_decisions vd"));
    expect(at("delete from english.episode_marks em where em.learner_id = p_learner_id;")).toBeLessThan(at("delete from english.episodes e"));
    for (const k of ["mastery_decisions", "competency_state", "episode_marks"]) {
      expect(purge).toContain(`'${k}', n_${k},`);
      expect(fnText(sql, "eng_purge_preview")).toContain(`'${k}', (select pg_catalog.count(*) from english.${k} x where x.learner_id = p_learner),`);
    }
  });

  it("engine in / out functions are for the server only", () => {
    for (const name of ["eng_engine_inputs", "eng_apply_engine_results", "eng_reset_skill_states"]) {
      expect(grantsOf(name), name).toEqual(["service_role"]);
      expect(fnText(sql, name)).toContain("security definer set search_path = ''");
    }
  });

  it("inputs read only validated scores (current AGREE / MODIFY) and only closed items the app checked; never results / tags / reading reports", () => {
    const fn = fnText(sql, "eng_engine_inputs");
    expect(fn).toContain("vd.decision in ('AGREE', 'MODIFY')");
    expect(fn).toContain("not exists (select 1 from english.validation_decisions s where s.supersedes_id = vd.id)");
    expect(fn).toContain("in ('correct', 'incorrect', 'blank')");
    expect(fn).not.toMatch(/english\.(results|tag_marks|reading_reports|recheck_events)\b/);
  });

  it("apply repeats every guard: up only, 1–2 for AUTO, one open proposal, no proposal / flag twice for the same evidence, ⚑ only from level 2", () => {
    const fn = fnText(sql, "eng_apply_engine_results");
    expect(fn).toContain("english.eng_skill_level(v_to) between 1 and 2");
    expect(fn).toContain("english.eng_skill_level(v_to) between 3 and 4");
    expect(fn).toContain("v_cur.proposal_decision_id is null");
    expect(fn).toContain("d.kind = 'PROPOSED' and d.evidence_key = v_r ->> 'evidence_key'");
    expect(fn).toContain("d.kind = 'FLAG' and d.evidence_key = v_r ->> 'flag_key'");
    expect(fn).toContain("english.eng_skill_level(v_cur.state) >= 2");
    expect(fn).toContain("for update");
  });

  // (Task 6 adds its tests here)
});
