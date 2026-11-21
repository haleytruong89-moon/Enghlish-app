import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStudioBuild } from "../../lib/studio/buildTemplate";
import type { StudioDraft, StudioItem } from "../../lib/studio/schema";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

/** E0 (migration 0038): the child reads which question belongs to which part, and that part's name + instruction only. */
describe("eng_my_task_parts (migration 0038)", () => {
  let db: TestDb;
  let s: Seeded;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const asUser = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const item = (n: number, part: string, over: Partial<StudioItem> = {}): StudioItem => ({
    n, part, kind: "gap", out_of_app: false, stem: `Sentence ${n} ____.`, options: [], passage_ref: null, key: `secret${n}`, accepted: [`alt${n}`],
    tag_key: "dang-tu", target_id: null, reading_skill_key: null, explanation_vi: `Vì sao ${n}`, needs_review: false, review_reason: null, ...over,
  });
  // The paper of 16/11 (bug E0): three parts, the first one's name repeats its instruction, word banks inside the instructions.
  const PAPER: StudioDraft = {
    parts: [
      { key: "A", name: "Complete the sentences with a suitable place:", instructions: "Complete the sentences with a suitable place:\nPlaces: museum, art gallery, library, zoo" },
      { key: "B", name: "B · Adjectives", instructions: "Choose the best adjective. Adjectives: noisy · quiet · crowded" },
      { key: "C", name: "C", instructions: "Điền dạng đúng của từ trong ngoặc." },
      { key: "D", name: "D · Writing", instructions: "Write on paper." },
    ],
    passages: [],
    items: [item(1, "A"), item(2, "A"), item(3, "B"), item(4, "B"), item(5, "C"), item(6, "C", { out_of_app: true, key: null, kind: "open" }), item(7, "D", { out_of_app: true, key: null, kind: "open" })],
  };
  let activity: string;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    const by = s.members.tutorNguyen;
    const made = await svc<{ id: string }>("select english.eng_create_studio_draft($1, 'Bài tập 16/11/2026', null, null, false, $2, $3) as r", [s.learners.nguyen, by, "e0-aaaaaaaaaa"]);
    const cur = await svc<{ updated_at: string }>("select english.eng_studio_draft($1) as r", [made.id]);
    const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, 'Bài tập 16/11/2026', $2::jsonb, $3, $4) as r", [made.id, JSON.stringify(PAPER), cur.updated_at, by]);
    await svc("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [made.id, saved.updated_at, JSON.stringify(buildStudioBuild(PAPER)), by]);
    activity = (await svc<{ activity_id: string }>("select english.eng_assign_studio($1, current_date, current_date + 3, $2, $3) as r", [made.id, by, `as-${randomUUID()}`])).activity_id;
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("the child gets each part with ITS questions only (in order), paper-only questions left out, and no key, accepted answer or explanation", async () => {
    const parts = await asUser<unknown[]>(s.users.studentNguyen, "select english.eng_my_task_parts($1) as r", [activity]);
    expect(parts).toEqual([
      { key: "A", name: "Complete the sentences with a suitable place:", instructions: "Complete the sentences with a suitable place:\nPlaces: museum, art gallery, library, zoo", items: ["q1", "q2"] },
      { key: "B", name: "B · Adjectives", instructions: "Choose the best adjective. Adjectives: noisy · quiet · crowded", items: ["q3", "q4"] },
      { key: "C", name: "C", instructions: "Điền dạng đúng của từ trong ngoặc.", items: ["q5"] },
    ]);
    expect(JSON.stringify(parts)).not.toMatch(/secret|alt\d|Vì sao|dang-tu|q6|q7|Write on paper/);
  });

  it("the other child, an adult or nobody gets null; a step that is not the child's gets null; nobody but authenticated may call it", async () => {
    expect(await asUser(s.users.studentAn, "select english.eng_my_task_parts($1) as r", [activity])).toBeNull();
    expect(await asUser(s.users.tutorNguyen, "select english.eng_my_task_parts($1) as r", [activity])).toBeNull();
    expect(await asUser(s.users.studentNguyen, "select english.eng_my_task_parts($1) as r", [randomUUID()])).toBeNull();
    const err = await svc("select english.eng_my_task_parts($1) as r", [activity]).then(() => null, (e: { code?: string }) => e.code);
    expect(err).toBe("42501");
  });

  it("a step that has not opened yet, and work that is not a Studio test, give null", async () => {
    const by = s.members.tutorNguyen;
    const made = await svc<{ id: string }>("select english.eng_create_studio_draft($1, 'Later', null, null, false, $2, $3) as r", [s.learners.nguyen, by, "e0-bbbbbbbbbb"]);
    const cur = await svc<{ updated_at: string }>("select english.eng_studio_draft($1) as r", [made.id]);
    const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, 'Later', $2::jsonb, $3, $4) as r", [made.id, JSON.stringify(PAPER), cur.updated_at, by]);
    await svc("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [made.id, saved.updated_at, JSON.stringify(buildStudioBuild(PAPER)), by]);
    const later = (await svc<{ activity_id: string }>("select english.eng_assign_studio($1, current_date + 5, current_date + 9, $2, $3) as r", [made.id, by, `as-${randomUUID()}`])).activity_id;
    expect(await asUser(s.users.studentNguyen, "select english.eng_my_task_parts($1) as r", [later])).toBeNull();
    const inst = (await db.client.query<{ id: string }>("select english.eng_assign_inquiry($1, 'B-W1-HOMEWORK', 1, current_date, $2, $3) as id", [s.learners.nguyen, s.members.parent, `wk-${randomUUID()}`])).rows[0]!.id;
    const topic = (await db.client.query<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 order by step_no limit 1", [inst])).rows[0]!.id;
    expect(await asUser(s.users.studentNguyen, "select english.eng_my_task_parts($1) as r", [topic])).toBeNull();
  });

  it("the migration can run again without error", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(new URL("../../db/migrations/0038_my_task_parts.sql", import.meta.url), "utf8");
    await db.client.query(sql);
    await db.client.query(sql);
  });
});
