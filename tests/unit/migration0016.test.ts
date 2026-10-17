import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";
import { UPLOAD_LINKS_PER_DAY } from "../../lib/storage/rules";

const read = (file: string) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

function fnText(sql: string, name: string, endMarker: string): string[] {
  const start = sql.indexOf(`create or replace function english.${name}(`);
  const end = sql.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`${name} not found`);
  return sql.slice(start, end + endMarker.length).split("\n");
}
const PURGE_END = "grant execute on function english.eng_purge_learner(uuid, uuid) to service_role;";
const isSubsequence = (old: string[], now: string[]) => {
  let i = 0;
  for (const line of now) if (i < old.length && line === old[i]) i++;
  return { i, ok: i === old.length };
};

describe("0016_practice_files.sql", () => {
  const sql = read("0016_practice_files.sql");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("eng_purge_learner keeps EVERY line of the 0014 version (0016 only adds), deleting the new tables after results and before learners", () => {
    const old = fnText(read("0014_tutor_work.sql"), "eng_purge_learner", PURGE_END);
    const now = fnText(sql, "eng_purge_learner", PURGE_END);
    const r = isSubsequence(old, now);
    expect(r.ok, `lost line: ${old[r.i]}`).toBe(true);
    expect(now.length).toBeGreaterThan(old.length);
    const body = now.join("\n");
    const order = ["results", "submissions", "assignment_events", "assignments", "files", "lesson_notes", "learners"].map((t) => body.indexOf(`delete from english.${t} `));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // children before parents (results point to assignments, assignments to files)
    for (const key of ["submissions", "assignment_events", "assignments", "files"]) expect(body, key).toContain(`'${key}'`);
  });

  it("creates ONE bucket, private, 15 MB, four types - only when storage exists - and never a policy or another bucket", () => {
    expect(code).toContain("pg_catalog.to_regclass('storage.buckets') is not null");
    expect(code.match(/insert into storage\.buckets/g)).toHaveLength(1);
    expect(code).toContain("values ('english-work', 'english-work', false, 15728640, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])");
    expect(code).not.toMatch(/create\s+policy[^;]*storage\./i);
    // the ONLY thing 0016 does with storage.objects is to READ the policies of other people and warn about them (never create / change one)
    expect([...code.matchAll(/storage\.objects/g)].length).toBeGreaterThan(0);
    expect(code).toContain("raise warning 'storage.objects has policies without a bucket_id condition");
    expect(code).not.toMatch(/(create|alter|drop)\s+policy[^;]*on\s+storage\./i);
    expect(code).not.toMatch(/(insert\s+into|update|delete\s+from)\s+storage\.objects/i);
    expect(code).not.toMatch(/delete\s+from\s+storage|update\s+storage|drop\s+\w+\s+storage/i);
  });

  it("is expand-only, never touches schema public, uses no mass grants and no production-only shortcuts", () => {
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
    const withoutPurge = code.replace(/create or replace function english\.eng_purge_learner[\s\S]*?\n\$\$;/, "");
    expect(withoutPurge).not.toMatch(/\bdelete\s+from\b/i);
    // the only ALTER of an existing table is the foreign key from results to assignments
    const alters = [...code.matchAll(/alter table (\S+) (add constraint|add column|alter column|enable row level security)/gi)].map((m) => `${m[1]} ${m[2]}`);
    expect(alters.filter((a) => !a.includes("enable row level security"))).toEqual(["english.results add constraint"]);
  });

  it("every function pins search_path, and is closed to anon; service-role functions are closed to authenticated too", () => {
    for (const m of code.matchAll(/create or replace function english\.(\w+)\(([\s\S]*?)\n\$\$;/g)) {
      expect(m[0], `${m[1]} search_path`).toMatch(/set search_path = ''/);
    }
    for (const fn of ["eng_create_assignment", "eng_retract_assignment", "eng_submit_practice", "eng_assignment_overview", "eng_issue_upload_ticket"]) {
      expect(code, fn).toMatch(new RegExp(`revoke execute on function english\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
      expect(code, fn).toMatch(new RegExp(`grant execute on function english\\.${fn}\\([^)]*\\) to service_role;`));
    }
    for (const fn of ["eng_my_practice", "eng_my_practice_file", "eng_my_review_points"]) {
      expect(code, fn).toMatch(new RegExp(`revoke execute on function english\\.${fn}\\([^)]*\\) from public, anon, service_role;`));
      expect(code, fn).toMatch(new RegExp(`grant execute on function english\\.${fn}\\([^)]*\\) to authenticated;`));
    }
    expect(code).toContain("revoke execute on function english.eng_register_file(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;");
  });

  it("the four new tables are append-only, have RLS with staff-only select, and nothing may write them directly", () => {
    expect(code).toContain("array['files', 'assignments', 'assignment_events', 'submissions', 'upload_tickets']");
    for (const t of ["files", "assignments", "assignment_events", "submissions", "upload_tickets"]) {
      expect(code).toContain(`alter table english.${t} enable row level security;`);
    }
    expect(code).toContain("revoke insert, update, delete, truncate on\n  english.files, english.assignments, english.assignment_events, english.submissions, english.upload_tickets\n  from public, anon, authenticated, service_role;");
    expect(code).not.toMatch(/to authenticated\s+using \(\s*true/i);
    // no policy mentions the student role: students have no select policy at all
    expect(code).not.toMatch(/role\s*=\s*'student'[^;]*create policy/i);
  });

  it("the student read functions return no tags, frame, result, answer key or note for the parent", () => {
    const mine = code.slice(code.indexOf("function english.eng_my_practice(p_assignment uuid default null)"), code.indexOf("function english.eng_my_practice_file"));
    for (const word of ["tag_keys", "frame_id", "result_id", "answer_file", "note_for_parent", "assigned_by"]) expect(mine, word).not.toContain(`'${word}'`);
    const review = code.slice(code.indexOf("function english.eng_my_review_points()"), code.indexOf("-- Quyền thực thi"));
    expect(review).not.toContain("note_for_parent");
  });

  it("the daily upload-link limit in the function is the number the app documents (UPLOAD_LINKS_PER_DAY)", () => {
    const fn = fnText(sql, "eng_issue_upload_ticket", "\n$$;").join("\n");
    expect(fn).toContain(`if v_n >= ${UPLOAD_LINKS_PER_DAY} then`);
    expect(fn).toContain("interval '24 hours'");
    expect(fn).toContain("(upload_limit)");
  });

  it("records its version last", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0016') on conflict do nothing;")).toBe(true);
  });
});
