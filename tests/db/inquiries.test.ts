import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sourceHash } from "../../lib/config/content";
import { toKeyRows, toSafeSteps } from "../../lib/config/inquiries";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { loadContentItems, type InquiryTemplateItem } from "../../lib/config/versions";
import { buildSeedSql } from "../../scripts/lib/configSql";
import { createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const content = loadContentItems();
const catalogueItem = content.catalogues[0];
if (!catalogueItem) throw new Error("no catalogue in content/");

/** A small but complete template (all item kinds, text + audio sources) that obeys every catalogue rule. */
function miniTemplate(id: string, version = 1, title = "Test inquiry"): InquiryTemplate {
  const isA = id.startsWith("A-");
  return {
    format: "inquiry-template/1",
    id,
    version,
    track: isA ? "A" : "B",
    status: "published",
    catalogue_version: catalogueItem!.id,
    title_vi: title,
    big_question_en: "Why is the sky blue?",
    big_question_vi: "Vì sao bầu trời xanh?",
    week: 9,
    dates: { from: "2026-12-01", to: "2026-12-07" },
    domain_bucket: "science",
    target_ids: isA ? ["A-T1-TEXT-R", "A-L3-CAUSE-W"] : ["B-T1-EXAM-R"],
    sources: [
      { id: `${id}-S1`, title: "Reading", url: null, author: "me", rights_note: "self-written", modality: "text", text: "SKY-TEXT: The sky is blue because of scattering." },
      { id: `${id}-S2`, title: "Listening", url: "https://example.org/audio", author: "me", rights_note: "self-written", modality: "audio", text: "SECRET-TRANSCRIPT: Hello, today I explain scattering." },
    ],
    steps: [
      {
        step_no: 1,
        activity_type: "ACT-SOURCE-QA",
        mode: "INDEPENDENT_CHECK",
        purpose: [],
        target_ids: isA ? ["A-T1-TEXT-R"] : ["B-T1-EXAM-R"],
        prompt_en: "Read the text, then reply.",
        prompt_vi: "SECRET-NOTE: đáp án gợi ý cho bố mẹ: scattering.",
        time_min: 10,
        planned_date: "2026-12-02",
        items: [
          { id: `${id}-q1`, kind: "mcq", stem: "What makes the sky blue?", options: ["a) rain", "b) scattering"], answer: "b", explanation_vi: "SECRET-EXPLAIN: do tán xạ", target_id: isA ? "A-T1-TEXT-R" : "B-T1-EXAM-R" },
          { id: `${id}-q2`, kind: "open", stem: "Explain in one sentence.", options: [], answer: "SECRET-MODEL: Light scatters.", explanation_vi: "", target_id: null },
        ],
        self_check_vi: [],
      },
      {
        step_no: 2,
        activity_type: isA ? "ACT-WRITE" : "ACT-SOURCE-QA",
        mode: "PRACTICE",
        purpose: ["checkpoint"],
        target_ids: isA ? ["A-L3-CAUSE-W"] : ["B-T1-EXAM-R"],
        prompt_en: "Write 50 words.",
        prompt_vi: "",
        time_min: 15,
        planned_date: null,
        items: [],
        self_check_vi: ["Did you answer the question?"],
      },
    ],
  };
}

const byKey = (x: { step_no: number; item_id: string }, y: { step_no: number; item_id: string }) =>
  x.step_no - y.step_no || (x.item_id < y.item_id ? -1 : x.item_id > y.item_id ? 1 : 0);

const item = (t: InquiryTemplate): InquiryTemplateItem => ({
  kind: "inquiryTemplate",
  id: `${t.id}@${t.version}`,
  file: `inquiries/${t.id}.json`,
  hash: sourceHash(t),
  data: t,
});

/** Same SQL the real seed migration contains, for hand-made templates. */
const seedSql = (...ts: InquiryTemplate[]) =>
  buildSeedSql({
    file: "0007_seed_test.sql",
    catalogues: [],
    policies: [],
    targetSets: [],
    inquiryTemplates: ts.map(item),
    allCatalogues: content.catalogues,
  });

/** A column that exists in each inquiry table (so a failing UPDATE fails on privilege, not on a typo). */
const COLUMN: Record<string, string> = {
  sources: "title",
  source_transcripts: "transcript",
  inquiry_templates: "title_vi",
  template_item_keys: "step_no",
  inquiry_instances: "due_on",
  activity_instances: "step_no",
  instance_item_keys: "step_no",
  activity_instance_events: "reason",
};

describe("S2 inquiries (DESIGN §4, §5, §7)", () => {
  let db: TestDb;
  let s: Seeded;
  let anInstance: string;
  let nguyenInstance: string;
  let anActivities: string[];

  const count = async (sql: string, params: unknown[] = []) =>
    (await db.client.query<{ n: number }>(sql, params)).rows[0]?.n;

  /** Run owner-level work that must fail; always rolled back. Returns the error, or null when it succeeded. */
  const withTx = async (fn: () => Promise<unknown>) => {
    await db.client.query("begin");
    try {
      await fn();
      return null;
    } catch (err) {
      return err as Error & { code?: string };
    } finally {
      await db.client.query("rollback");
    }
  };
  const ownerError = (sql: string, params: unknown[] = []) => withTx(() => db.client.query(sql, params));

  /** Call a service-role function as service_role (rolled back) and return its rows or the error. */
  const svc = async (sql: string, params: unknown[]) => {
    try {
      return { rows: await rowsAs(db.client, "service_role", null, sql, params), err: null };
    } catch (err) {
      return { rows: [], err: err as Error & { code?: string } };
    }
  };
  const assignSql = "select english.eng_assign_inquiry($1, $2, $3, $4, $5, $6) as id";
  const eventSql = "select english.eng_activity_event($1, $2, $3, $4, $5) as id";

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    // Hand-made templates, seeded through the generator's own SQL.
    await db.client.query(seedSql(miniTemplate("A-W9-TEST"), miniTemplate("B-W9-TEST")));
    const a = await db.client.query<{ id: string }>(assignSql, [s.learners.an, "A-W9-TEST", 1, "2026-12-07", s.members.parent, "req-an-0001"]);
    anInstance = (a.rows[0] as { id: string }).id;
    const b = await db.client.query<{ id: string }>(assignSql, [s.learners.nguyen, "B-W9-TEST", 1, "2026-12-07", s.members.tutorNguyen, "req-ng-0001"]);
    nguyenInstance = (b.rows[0] as { id: string }).id;
    anActivities = (
      await db.client.query<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 order by step_no", [anInstance])
    ).rows.map((r) => r.id);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("templates and sources", () => {
    it("the generator SQL publishes template, sources, transcript and keys; running it again changes nothing", async () => {
      const mine = {
        templates: "select count(*)::int as n from english.inquiry_templates where id like '%-W9-TEST' and published_at is not null",
        sources: "select count(*)::int as n from english.sources where id like '%-W9-TEST-S_' and published_at is not null",
        transcripts: "select count(*)::int as n from english.source_transcripts where source_id like '%-W9-TEST-S_'",
        keys: "select count(*)::int as n from english.template_item_keys where template_id like '%-W9-TEST'",
      };
      const snapshot = async () => ({
        templates: await count(mine.templates),
        sources: await count(mine.sources),
        transcripts: await count(mine.transcripts),
        keys: await count(mine.keys),
      });
      // keys: 2 items + 1 tutor note per template (step 2 has no script)
      expect(await snapshot()).toEqual({ templates: 2, sources: 4, transcripts: 2, keys: 6 });
      await db.client.query(seedSql(miniTemplate("A-W9-TEST"), miniTemplate("B-W9-TEST")));
      expect(await snapshot()).toEqual({ templates: 2, sources: 4, transcripts: 2, keys: 6 });
    });

    it("the stored template keeps exactly the student-safe steps; keys equal the content's keys", async () => {
      const t = miniTemplate("A-W9-TEST");
      const row = (await db.client.query("select steps, sources, source_hash, status from english.inquiry_templates where id = 'A-W9-TEST'")).rows[0];
      expect(row.steps).toEqual(JSON.parse(JSON.stringify(toSafeSteps(t))));
      expect(row.status).toBe("published");
      expect(row.source_hash).toBe(sourceHash(t));
      const keys = (
        await db.client.query("select step_no, item_id, kind, answer, explanation_vi from english.template_item_keys where template_id = 'A-W9-TEST'")
      ).rows;
      expect(keys.sort(byKey)).toEqual([...toKeyRows(t)].sort(byKey));
    });

    it("the rows a student could read hold neither answers nor transcripts nor tutor notes", async () => {
      const rows = await db.client.query(
        "select steps::text as a, sources::text as b from english.inquiry_templates union all select body, null from english.sources where body is not null",
      );
      const text = JSON.stringify(rows.rows);
      for (const secret of ["SECRET-", '"answer":', "explanation_vi", "prompt_vi"]) expect(text, secret).not.toContain(secret);
      const sourceCols = (await db.client.query("select column_name from information_schema.columns where table_schema = 'english' and table_name = 'sources'")).rows.map((r) => r.column_name);
      expect(sourceCols).not.toContain("transcript");
    });

    const base = (over: Record<string, unknown> = {}) => ({
      id: "A-W7-RAW",
      steps: JSON.stringify(toSafeSteps(miniTemplate("A-W9-TEST"))),
      target_ids: ["A-T1-TEXT-R"],
      catalogue: catalogueItem!.id,
      ...over,
    });
    const insertTemplate = (o: ReturnType<typeof base>) =>
      db.client.query(
        `insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket, target_ids, steps, sources, catalogue_version, source_hash)
         values ($1, 1, 'A', 't', 'q', 'q', 7, '2026-12-01', '2026-12-07', 'science', $2, $3::jsonb, '[]'::jsonb, $4, 'h')`,
        [o.id, o.target_ids, o.steps, o.catalogue],
      );

    it("refuses a template with an unknown or other-track target, a bad activity type or a bad mode", async () => {
      for (const [label, o] of [
        ["unknown target", base({ target_ids: ["A-NOPE"] })],
        ["other-track target", base({ target_ids: ["B-T1-ARG-R"] })],
      ] as const) {
        const err = await withTx(() => insertTemplate(o));
        expect(err?.message, label).toMatch(/not a target or tracking indicator/);
      }
      const tpl = JSON.parse(base().steps) as Array<Record<string, unknown>>;
      tpl[1] = { ...tpl[1], activity_type: "ACT-CANVAS-ADV" }; // Track B only
      expect((await withTx(() => insertTemplate(base({ steps: JSON.stringify(tpl) }))))?.message).toMatch(/activity type ACT-CANVAS-ADV/);
      tpl[1] = { ...tpl[1], activity_type: "ACT-WRITE", mode: "EXAM" };
      expect((await withTx(() => insertTemplate(base({ steps: JSON.stringify(tpl) }))))?.message).toMatch(/needs mode/);
    });

    it("the student-visible columns cannot be given answers (CHECK), whatever writes them", async () => {
      const steps = JSON.parse(base().steps) as Array<{ items: Array<Record<string, unknown>> }>;
      for (const key of ["answer", "explanation_vi", "prompt_vi"]) {
        const bad = structuredClone(steps);
        (bad[0]!.items[0] as Record<string, unknown>)[key] = "x";
        const err = await withTx(() => insertTemplate(base({ steps: JSON.stringify(bad) })));
        expect(err?.message, key).toMatch(/inquiry_templates_student_safe/);
      }
      const err = await withTx(() =>
        db.client.query(
          `insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket, target_ids, steps, sources, catalogue_version, source_hash)
           values ('A-W7-RAW', 1, 'A', 't', 'q', 'q', 7, '2026-12-01', '2026-12-07', 'science', '{A-T1-TEXT-R}', $1::jsonb, '[{"id":"x","version":1,"text":"leak"}]'::jsonb, $2, 'h')`,
          [base().steps, catalogueItem!.id],
        ),
      );
      expect(err?.message).toMatch(/inquiry_templates_student_safe/);
    });

    it("publishing checks the catalogue whitelist, the sources and a key row for every item", async () => {
      // whitelist: A-L3-CAUSE-W is evidenced by ACT-WRITE only
      const steps = JSON.parse(base().steps) as Array<Record<string, unknown>>;
      steps[1] = { ...steps[1], activity_type: "ACT-SPEAK-MONO" };
      const e1 = await withTx(async () => {
        await insertTemplate(base({ steps: JSON.stringify(steps), id: "A-W7-WL" }));
        await db.client.query("update english.inquiry_templates set status = 'published', published_at = now() where id = 'A-W7-WL'");
      });
      expect(e1?.message).toMatch(/not an evidence task of that target/);
      // missing source
      const e2 = await withTx(async () => {
        await insertTemplate(base({ id: "A-W7-NS" }));
        await db.client.query(`update english.inquiry_templates set sources = '[{"id":"ghost","version":1}]'::jsonb where id = 'A-W7-NS'`);
        await db.client.query("update english.inquiry_templates set status = 'published', published_at = now() where id = 'A-W7-NS'");
      });
      expect(e2?.message).toMatch(/source ghost does not exist or is not published/);
      // missing key rows
      const e3 = await withTx(async () => {
        await insertTemplate(base({ id: "A-W7-NK" }));
        await db.client.query("update english.inquiry_templates set status = 'published', published_at = now() where id = 'A-W7-NK'");
      });
      expect(e3?.message).toMatch(/has no answer key row/);
    });

    it("publishing reads the catalogue's evidence_tasks like the TypeScript check: chains by last activity, suffixes dropped, 'any transfer check' needs the purpose", async () => {
      const publishStep = async (target: string, activity: string, purpose: string[]) => {
        const steps = [{ step_no: 1, activity_type: activity, mode: "PRACTICE", purpose, target_ids: [target], prompt_en: "p", time_min: 5, planned_date: null, items: [], self_check_vi: [] }];
        return withTx(async () => {
          await insertTemplate(base({ id: "A-W7-EV", steps: JSON.stringify(steps) }));
          await db.client.query("update english.inquiry_templates set status = 'published', published_at = now() where id = 'A-W7-EV'");
        });
      };
      const rejected = /not an evidence task of that target/;
      // chain "ACT-SOURCE-QA -> ACT-WRITE": the last activity counts, the first does not
      expect(await publishStep("A-L7-SUMMARY-W", "ACT-WRITE", [])).toBeNull();
      expect((await publishStep("A-L7-SUMMARY-W", "ACT-SOURCE-QA", []))?.message).toMatch(rejected);
      // chain + suffix on the same target: "ACT-WRITE (comparison paragraph)", "ACT-CANVAS-BASIC -> ACT-WRITE"
      expect(await publishStep("A-L1-COMP-W", "ACT-WRITE", [])).toBeNull();
      expect((await publishStep("A-L1-COMP-W", "ACT-CANVAS-BASIC", []))?.message).toMatch(rejected);
      // "any activity tagged as transfer check": any activity, but only with the purpose
      expect(await publishStep("A-A5-REUSE", "ACT-SELF-REVIEW", ["transfer_check"])).toBeNull();
      expect(await publishStep("A-A5-REUSE", "ACT-SPEAK-LIVE", ["transfer_check"])).toBeNull();
      expect((await publishStep("A-A5-REUSE", "ACT-SELF-REVIEW", []))?.message).toMatch(rejected);
      expect((await publishStep("A-A5-REUSE", "ACT-WRITE", ["checkpoint"]))?.message).toMatch(rejected);
    });

    it("a suffixed entry of Track B ('ACT-CANVAS-ADV (evidence table)') accepts ACT-CANVAS-ADV and refuses ACT-SOURCE-QA", async () => {
      const publishStep = async (activity: string) => {
        const steps = [{ step_no: 1, activity_type: activity, mode: "PRACTICE", purpose: [], target_ids: ["B-T5-SOURCE"], prompt_en: "p", time_min: 5, planned_date: null, items: [], self_check_vi: [] }];
        return withTx(async () => {
          await db.client.query(
            `insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket, target_ids, steps, sources, catalogue_version, source_hash)
             values ('B-W7-EV', 1, 'B', 't', 'q', 'q', 7, '2026-12-01', '2026-12-07', 'science', '{B-T5-SOURCE}', $1::jsonb, '[]'::jsonb, $2, 'h')`,
            [JSON.stringify(steps), catalogueItem!.id],
          );
          await db.client.query("update english.inquiry_templates set status = 'published', published_at = now() where id = 'B-W7-EV'");
        });
      };
      expect(await publishStep("ACT-CANVAS-ADV")).toBeNull();
      expect((await publishStep("ACT-SOURCE-QA"))?.message).toMatch(/not an evidence task of that target/);
    });

    it("published templates, their sources, transcripts and keys are immutable (also TRUNCATE)", async () => {
      for (const [label, sql] of [
        ["update template", "update english.inquiry_templates set title_vi = 'x' where id = 'A-W9-TEST'"],
        ["delete template", "delete from english.inquiry_templates where id = 'A-W9-TEST'"],
        ["truncate templates", "truncate english.inquiry_templates cascade"],
        ["update source", "update english.sources set title = 'x' where id = 'A-W9-TEST-S1'"],
        ["delete source", "delete from english.sources where id = 'A-W9-TEST-S1'"],
        ["truncate sources", "truncate english.sources cascade"],
        ["update key", "update english.template_item_keys set answer = 'z' where template_id = 'A-W9-TEST'"],
        ["delete key", "delete from english.template_item_keys where template_id = 'A-W9-TEST'"],
        ["insert key", "insert into english.template_item_keys(template_id, template_version, item_id, step_no, kind, answer) values ('A-W9-TEST', 1, 'extra', 1, 'answer', 'x')"],
        ["truncate keys", "truncate english.template_item_keys"],
        ["update transcript", "update english.source_transcripts set transcript = 'x'"],
        ["delete transcript", "delete from english.source_transcripts"],
        ["truncate transcripts", "truncate english.source_transcripts"],
      ] as const) {
        const err = await ownerError(sql);
        expect(err, label).not.toBeNull();
        expect(err?.code, label).toBe("42501");
      }
    });
  });

  describe("eng_assign_inquiry", () => {
    it("copies the template into an immutable snapshot, one activity row per step and a key snapshot", async () => {
      const t = miniTemplate("A-W9-TEST");
      const inst = (await db.client.query("select * from english.inquiry_instances where id = $1", [anInstance])).rows[0];
      expect(inst).toMatchObject({ learner_id: s.learners.an, template_id: "A-W9-TEST", template_version: 1, assigned_by: s.members.parent, client_request_id: "req-an-0001" });
      const due = (await db.client.query("select due_on::text as d from english.inquiry_instances where id = $1", [anInstance])).rows[0].d;
      expect(due).toBe("2026-12-07");
      const tpl = (await db.client.query("select steps, sources, target_ids from english.inquiry_templates where id = 'A-W9-TEST'")).rows[0];
      expect(inst.snapshot.steps).toEqual(tpl.steps);
      expect(inst.snapshot.sources).toEqual(tpl.sources);
      expect(inst.snapshot.target_ids).toEqual(tpl.target_ids);
      expect(inst.snapshot.template).toMatchObject({ id: "A-W9-TEST", version: 1, track_id: "A", title_vi: "Test inquiry", week: 9, date_from: "2026-12-01", date_to: "2026-12-07", catalogue_version: catalogueItem!.id });
      expect(JSON.stringify(inst.snapshot)).not.toMatch(/SECRET|"answer"|explanation_vi|prompt_vi/);

      const acts = (await db.client.query("select step_no, activity_type, mode, purpose, target_ids, scheduled_for::text as d from english.activity_instances where inquiry_instance_id = $1 order by step_no", [anInstance])).rows;
      expect(acts).toEqual([
        { step_no: 1, activity_type: "ACT-SOURCE-QA", mode: "INDEPENDENT_CHECK", purpose: [], target_ids: ["A-T1-TEXT-R"], d: "2026-12-02" },
        { step_no: 2, activity_type: "ACT-WRITE", mode: "PRACTICE", purpose: ["checkpoint"], target_ids: ["A-L3-CAUSE-W"], d: null },
      ]);

      const keys = (await db.client.query("select item_id, step_no, kind, answer, explanation_vi from english.instance_item_keys where inquiry_instance_id = $1", [anInstance])).rows;
      expect(keys.sort(byKey)).toEqual([...toKeyRows(t)].sort(byKey));

      const audit = (await db.client.query("select action, payload from english.audit_log where learner_id = $1 and action = 'inquiry.assigned'", [s.learners.an])).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({ inquiry_instance: anInstance, template: "A-W9-TEST", version: 1 });
      expect(JSON.stringify(audit[0].payload)).not.toContain("SECRET");
    });

    it("a template change after assignment does not change the snapshot (new version instead)", async () => {
      // v2 of the template with another title; v1 itself cannot be edited (immutable test above)
      await db.client.query(seedSql(miniTemplate("A-W9-TEST", 2, "Changed title")));
      try {
        const snap = (await db.client.query("select snapshot->'template'->>'title_vi' as t, snapshot->'template'->>'version' as v from english.inquiry_instances where id = $1", [anInstance])).rows[0];
        expect(snap).toEqual({ t: "Test inquiry", v: "1" });
        const r = await svc(assignSql, [s.learners.an, "A-W9-TEST", 2, "2026-12-07", s.members.parent, "req-an-v2-001"]);
        expect(r.err).toBeNull();
      } finally {
        // keep the shared database small for the other tests: v2 stays (published rows cannot be deleted), nothing else to undo
      }
      expect(await count("select count(*)::int as n from english.inquiry_instances where learner_id = $1", [s.learners.an])).toBe(1);
    });

    it("rejects a template of the other track, an unpublished or unknown template", async () => {
      const wrongTrack = await svc(assignSql, [s.learners.an, "B-W9-TEST", 1, "2026-12-07", s.members.parent, "req-wrong-001"]);
      expect(wrongTrack.err?.code).toBe("23514");
      expect(wrongTrack.err?.message).toMatch(/another track/);
      // a draft row (never published)
      await db.client.query(
        `insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket, target_ids, steps, sources, catalogue_version, source_hash)
         values ('A-W8-DRAFT', 1, 'A', 'draft', 'q', 'q', 8, '2026-12-01', '2026-12-07', 'science', '{A-T1-TEXT-R}', $1::jsonb, '[]'::jsonb, $2, 'h')`,
        [JSON.stringify(toSafeSteps(miniTemplate("A-W9-TEST"))), catalogueItem!.id],
      );
      const draft = await svc(assignSql, [s.learners.an, "A-W8-DRAFT", 1, "2026-12-07", s.members.parent, "req-draft-001"]);
      expect(draft.err?.code).toBe("P0002");
      const unknown = await svc(assignSql, [s.learners.an, "A-W0-NOPE", 1, "2026-12-07", s.members.parent, "req-nope-0001"]);
      expect(unknown.err?.code).toBe("P0002");
    });

    it("checks the actor again: students, the other child's tutor and strangers are refused; the child's own tutor and the parent are accepted", async () => {
      const cases: Array<[string, string, string, string]> = [
        ["student of An", s.members.studentAn, s.learners.an, "42501"],
        ["tutor of Nguyên → An", s.members.tutorNguyen, s.learners.an, "42501"],
        ["tutor of An → Nguyên", s.members.tutorAn, s.learners.nguyen, "42501"],
        ["unknown member", "00000000-0000-4000-8000-0000000000ff", s.learners.an, "42501"],
      ];
      for (const [label, by, learner, code] of cases) {
        const tpl = learner === s.learners.an ? "A-W9-TEST" : "B-W9-TEST";
        const r = await svc(assignSql, [learner, tpl, 1, "2026-12-07", by, `req-actor-${label.length}`]);
        expect(r.err?.code, label).toBe(code);
      }
      const own = await svc(assignSql, [s.learners.an, "A-W9-TEST", 1, "2026-12-07", s.members.tutorAn, "req-tutor-an-1"]);
      expect(own.err).toBeNull();
      const parentNguyen = await svc(assignSql, [s.learners.nguyen, "B-W9-TEST", 1, "2026-12-07", s.members.parent, "req-parent-ng-1"]);
      expect(parentNguyen.err).toBeNull();
    });

    it("a tutor whose relationship has ended can no longer assign", async () => {
      await db.client.query("begin");
      try {
        await db.client.query("update english.relationships set valid_from = now() - interval '10 days' where member_id = $1", [s.members.tutorAn]);
        await db.client.query("update english.relationships set valid_to = now() - interval '1 day' where member_id = $1", [s.members.tutorAn]);
        await expect(db.client.query(assignSql, [s.learners.an, "A-W9-TEST", 1, "2026-12-07", s.members.tutorAn, "req-expired-01"])).rejects.toThrow(/may not assign/);
      } finally {
        await db.client.query("rollback");
      }
    });

    it("is idempotent per (learner, client_request_id): same id → same instance, no second copy", async () => {
      const again = await db.client.query<{ id: string }>(assignSql, [s.learners.an, "A-W9-TEST", 1, "2026-12-07", s.members.parent, "req-an-0001"]);
      expect(again.rows[0]?.id).toBe(anInstance);
      expect(await count("select count(*)::int as n from english.activity_instances where inquiry_instance_id = $1", [anInstance])).toBe(2);
      // the same request id for a different template is a client bug, not a silent success
      const clash = await svc(assignSql, [s.learners.an, "A-W9-TEST", 2, "2026-12-07", s.members.parent, "req-an-0001"]);
      expect(clash.err?.code).toBe("23505");
      // the id is scoped to the learner
      const other = await svc(assignSql, [s.learners.nguyen, "B-W9-TEST", 1, "2026-12-07", s.members.parent, "req-an-0001"]);
      expect(other.err).toBeNull();
    });

    it("validates its arguments", async () => {
      expect((await svc(assignSql, [s.learners.an, "A-W9-TEST", 1, "2026-12-07", s.members.parent, "short"])).err?.code).toBe("22023");
      expect((await svc(assignSql, [s.learners.an, "A-W9-TEST", 1, null, s.members.parent, "req-null-due1"])).err?.code).toBe("22004");
      expect((await svc(assignSql, ["00000000-0000-4000-8000-0000000000aa", "A-W9-TEST", 1, "2026-12-07", s.members.parent, "req-no-learner"])).err?.code).toBe("P0002");
    });

    it("only the service role can call it (authenticated and anon cannot)", async () => {
      for (const [role, user] of [["authenticated", s.users.parent], ["anon", null]] as const) {
        const e1 = await errorAs(db.client, role, user, assignSql, [s.learners.an, "A-W9-TEST", 1, "2026-12-07", s.members.parent, "req-priv-0001"]);
        expect(e1?.code, role).toBe("42501");
        const e2 = await errorAs(db.client, role, user, eventSql, [anActivities[0], "skip", null, "no reason needed", s.members.parent]);
        expect(e2?.code, role).toBe("42501");
      }
    });
  });

  describe("eng_activity_event", () => {
    const ev = (kind: string, date: string | null, reason: string, by = s.members.parent, activity = () => anActivities[0]) =>
      svc(eventSql, [activity(), kind, date, reason, by]);
    // `s` is assigned in beforeAll, so members are read lazily inside each test

    it("records reschedule, skip and unskip with a reason; the effective schedule is the latest event", async () => {
      await db.client.query("begin");
      try {
        const first = activityId(0);
        await db.client.query(eventSql, [first, "reschedule", "2026-12-04", "Con ốm hôm đó", s.members.parent]);
        await db.client.query(eventSql, [first, "skip", null, "Gia đình đi xa", s.members.tutorAn]);
        await db.client.query(eventSql, [first, "unskip", null, "Đã về sớm", s.members.parent]);
        await db.client.query(eventSql, [first, "reschedule", "2026-12-06", "Dời thêm lần nữa", s.members.parent]);
        const rows = (await db.client.query("select kind, new_date::text as d, reason, by_member from english.activity_instance_events where activity_instance_id = $1 order by at, id", [first])).rows;
        expect(rows.map((r) => [r.kind, r.d])).toEqual([["reschedule", "2026-12-04"], ["skip", null], ["unskip", null], ["reschedule", "2026-12-06"]]);
        expect(rows[0].reason).toBe("Con ốm hôm đó");
        expect(rows[1].by_member).toBe(s.members.tutorAn);
        const audit = (await db.client.query("select action from english.audit_log where learner_id = $1 and action like 'activity.%' order by id", [s.learners.an])).rows;
        expect(audit.map((r) => r.action)).toEqual(["activity.reschedule", "activity.skip", "activity.unskip", "activity.reschedule"]);
      } finally {
        await db.client.query("rollback");
      }
    });

    function activityId(i: number): string {
      const id = anActivities[i];
      if (!id) throw new Error("no activity");
      return id;
    }

    it("refuses a missing or too short reason, a reschedule without a date, a date on skip, double skip, unskip of a step that is not skipped", async () => {
      const a = () => activityId(0);
      expect((await ev("skip", null, "", s.members.parent, a)).err?.code).toBe("23514");
      expect((await ev("skip", null, "  ab ", s.members.parent, a)).err?.code).toBe("23514");
      expect((await ev("reschedule", "2026-12-04", "", s.members.parent, a)).err?.code).toBe("23514");
      expect((await ev("reschedule", null, "đổi ngày", s.members.parent, a)).err?.code).toBe("23514");
      expect((await ev("skip", "2026-12-04", "bỏ bước", s.members.parent, a)).err?.code).toBe("23514");
      expect((await ev("unskip", null, "hoàn lại", s.members.parent, a)).err?.code).toBe("23514");
      expect((await ev("explode", null, "không có kiểu này", s.members.parent, a)).err?.code).toBe("22023");
      await db.client.query("begin");
      try {
        await db.client.query(eventSql, [a(), "skip", null, "bỏ bước", s.members.parent]);
        await expect(db.client.query(eventSql, [a(), "skip", null, "bỏ lần nữa", s.members.parent])).rejects.toThrow(/already skipped/);
      } finally {
        await db.client.query("rollback");
      }
      expect(await count("select count(*)::int as n from english.activity_instance_events")).toBe(0);
    });

    it("checks the actor: student, the other child's tutor, unknown member", async () => {
      const a = () => activityId(0);
      expect((await ev("skip", null, "lý do rõ ràng", s.members.studentAn, a)).err?.code).toBe("42501");
      expect((await ev("skip", null, "lý do rõ ràng", s.members.tutorNguyen, a)).err?.code).toBe("42501");
      expect((await ev("skip", null, "lý do rõ ràng", "00000000-0000-4000-8000-0000000000ff", a)).err?.code).toBe("42501");
      expect((await ev("skip", null, "lý do rõ ràng", s.members.tutorAn, a)).err).toBeNull();
      expect((await svc(eventSql, ["00000000-0000-4000-8000-0000000000aa", "skip", null, "lý do rõ ràng", s.members.parent])).err?.code).toBe("P0002");
    });
  });

  describe("append-only + purge", () => {
    it("instances, activities, key snapshots and events cannot be updated, deleted or truncated", async () => {
      await db.client.query(eventSql, [anActivities[1], "skip", null, "để thử bất biến", s.members.parent]);
      for (const [label, sql] of [
        ["update instance", "update english.inquiry_instances set due_on = '2030-01-01'"],
        ["delete instance", "delete from english.inquiry_instances"],
        ["truncate instances", "truncate english.inquiry_instances cascade"],
        ["update activity", "update english.activity_instances set scheduled_for = '2030-01-01'"],
        ["delete activity", "delete from english.activity_instances"],
        ["truncate activities", "truncate english.activity_instances cascade"],
        ["update key snapshot", "update english.instance_item_keys set answer = 'x'"],
        ["delete key snapshot", "delete from english.instance_item_keys"],
        ["truncate key snapshots", "truncate english.instance_item_keys"],
        ["update event", "update english.activity_instance_events set reason = 'xxx'"],
        ["delete event", "delete from english.activity_instance_events"],
        ["truncate events", "truncate english.activity_instance_events"],
      ] as const) {
        const err = await ownerError(sql);
        expect(err, label).not.toBeNull();
        expect(err?.code, label).toBe("42501");
      }
      // and the service role has no write privilege on any of them (only the two functions write)
      for (const t of Object.keys(COLUMN)) {
        const e = await errorAs(db.client, "service_role", null, `delete from english.${t}`);
        expect(e?.code, t).toBe("42501");
        const i = await errorAs(db.client, "service_role", null, `update english.${t} set ${COLUMN[t]} = null`);
        expect(i?.code, t).toBe("42501");
      }
    });

    it("purging one learner removes their instances, activities, key snapshots, events and receipts — and only theirs", async () => {
      const before = {
        nguyenInst: await count("select count(*)::int as n from english.inquiry_instances where learner_id = $1", [s.learners.nguyen]),
        nguyenKeys: await count("select count(*)::int as n from english.instance_item_keys where learner_id = $1", [s.learners.nguyen]),
      };
      expect(before.nguyenInst).toBeGreaterThan(0);
      await db.client.query("begin");
      try {
        const anBefore = {
          inst: await count("select count(*)::int as n from english.inquiry_instances where learner_id = $1", [s.learners.an]),
          act: await count("select count(*)::int as n from english.activity_instances where learner_id = $1", [s.learners.an]),
          keys: await count("select count(*)::int as n from english.instance_item_keys where learner_id = $1", [s.learners.an]),
          ev: await count("select count(*)::int as n from english.activity_instance_events where learner_id = $1", [s.learners.an]),
        };
        expect(anBefore.inst).toBeGreaterThan(0);
        expect(anBefore.ev).toBeGreaterThan(0);
        const receipt = (await db.client.query("select english.eng_purge_learner($1, $2) as r", [s.learners.an, s.users.parent])).rows[0].r;
        expect(receipt.deleted).toMatchObject({
          inquiry_instances: anBefore.inst,
          activity_instances: anBefore.act,
          instance_item_keys: anBefore.keys,
          activity_instance_events: anBefore.ev,
          target_sets: 1,
          learners: 1,
        });
        for (const t of ["inquiry_instances", "activity_instances", "instance_item_keys", "activity_instance_events"]) {
          expect(await count(`select count(*)::int as n from english.${t} where learner_id = $1`, [s.learners.an]), t).toBe(0);
        }
        expect(await count("select count(*)::int as n from english.inquiry_instances where learner_id = $1", [s.learners.nguyen])).toBe(before.nguyenInst);
        expect(await count("select count(*)::int as n from english.instance_item_keys where learner_id = $1", [s.learners.nguyen])).toBe(before.nguyenKeys);
        // the templates themselves are shared content and stay
        expect(await count("select count(*)::int as n from english.inquiry_templates where published_at is not null")).toBeGreaterThanOrEqual(3);
      } finally {
        await db.client.query("rollback");
      }
    });
  });

  describe("RLS: who reads what", () => {
    const rows = <R extends Record<string, unknown>>(role: "authenticated" | "anon", user: string | null, sql: string, params: unknown[] = []) =>
      rowsAs<R>(db.client, role, user, sql, params);

    it("the student reads only their own instances, steps and events", async () => {
      const mine = await rows<{ id: string }>("authenticated", s.users.studentAn, "select id from english.inquiry_instances");
      expect(mine.map((r) => r.id)).toEqual([anInstance]);
      const acts = await rows("authenticated", s.users.studentAn, "select id from english.activity_instances");
      expect(acts).toHaveLength(2);
      const other = await rows("authenticated", s.users.studentNguyen, "select id from english.inquiry_instances");
      expect(other.map((r) => r.id)).toEqual([nguyenInstance]);
    });

    it("students and anon can NOT read any key table (RLS for students, no privilege for anon)", async () => {
      for (const table of ["template_item_keys", "instance_item_keys", "source_transcripts"]) {
        for (const student of [s.users.studentAn, s.users.studentNguyen]) {
          expect(await rows("authenticated", student, `select * from english.${table}`), `${table} / student`).toEqual([]);
        }
        const err = await errorAs(db.client, "anon", null, `select * from english.${table}`);
        expect(err?.code, `${table} / anon`).toBe("42501");
      }
      // a row-level probe by key, to be sure the empty result is not just "no rows"
      expect(await count("select count(*)::int as n from english.instance_item_keys where inquiry_instance_id = $1", [anInstance])).toBeGreaterThan(0);
      expect(await rows("authenticated", s.users.studentAn, "select * from english.instance_item_keys where inquiry_instance_id = $1", [anInstance])).toEqual([]);
    });

    it("what students may read has no answers: template steps, source texts, instance snapshots", async () => {
      const t = await rows<{ steps: unknown; sources: unknown }>("authenticated", s.users.studentAn, "select steps, sources from english.inquiry_templates");
      const src = await rows("authenticated", s.users.studentAn, "select * from english.sources");
      const inst = await rows("authenticated", s.users.studentAn, "select snapshot from english.inquiry_instances");
      const text = JSON.stringify({ t, src, inst });
      expect(t.length).toBeGreaterThan(0);
      expect(text).toContain("SKY-TEXT"); // the reading text is meant to be readable
      for (const secret of ["SECRET-", '"answer":', "explanation_vi", "prompt_vi", "transcript"]) expect(text, secret).not.toContain(secret);
    });

    it("anon reads no inquiry table at all", async () => {
      for (const table of ["inquiry_templates", "sources", "inquiry_instances", "activity_instances", "activity_instance_events"]) {
        const err = await errorAs(db.client, "anon", null, `select * from english.${table}`);
        expect(err?.code, table).toBe("42501");
      }
    });

    it("drafts are invisible to every member", async () => {
      for (const u of [s.users.parent, s.users.tutorAn, s.users.studentAn]) {
        const r = await rows<{ id: string }>("authenticated", u, "select id from english.inquiry_templates where id = 'A-W8-DRAFT'");
        expect(r).toEqual([]);
      }
    });

    it("the parent reads every key; a tutor reads template keys and only their own learner's instance keys", async () => {
      const parentKeys = await rows("authenticated", s.users.parent, "select inquiry_instance_id from english.instance_item_keys");
      expect(new Set(parentKeys.map((r) => r.inquiry_instance_id))).toEqual(new Set([anInstance, nguyenInstance]));
      const tutorAn = await rows<{ inquiry_instance_id: string }>("authenticated", s.users.tutorAn, "select inquiry_instance_id from english.instance_item_keys");
      expect(new Set(tutorAn.map((r) => r.inquiry_instance_id))).toEqual(new Set([anInstance]));
      const tutorNg = await rows<{ inquiry_instance_id: string }>("authenticated", s.users.tutorNguyen, "select inquiry_instance_id from english.instance_item_keys");
      expect(new Set(tutorNg.map((r) => r.inquiry_instance_id))).toEqual(new Set([nguyenInstance]));
      const tplKeys = await rows("authenticated", s.users.tutorAn, "select item_id from english.template_item_keys");
      expect(tplKeys.length).toBeGreaterThan(0);
      const transcripts = await rows<{ transcript: string }>("authenticated", s.users.parent, "select transcript from english.source_transcripts");
      expect(transcripts.map((r) => r.transcript).join()).toContain("SECRET-TRANSCRIPT");
    });

    it("a tutor whose relationship has ended reads no keys any more", async () => {
      await db.client.query("begin");
      try {
        await db.client.query("update english.relationships set valid_from = now() - interval '10 days' where member_id = $1", [s.members.tutorAn]);
        await db.client.query("update english.relationships set valid_to = now() - interval '1 day' where member_id = $1", [s.members.tutorAn]);
        await db.client.query("set local role authenticated");
        await db.client.query("select set_config('request.jwt.claim.sub', $1, true)", [s.users.tutorAn]);
        expect((await db.client.query("select * from english.instance_item_keys")).rows).toEqual([]);
        expect((await db.client.query("select * from english.template_item_keys")).rows).toEqual([]);
        expect((await db.client.query("select * from english.source_transcripts")).rows).toEqual([]);
      } finally {
        await db.client.query("rollback");
      }
    });

    it("authenticated users cannot write any inquiry table", async () => {
      for (const t of Object.keys(COLUMN)) {
        for (const sql of [`insert into english.${t} default values`, `delete from english.${t}`, `update english.${t} set ${COLUMN[t]} = null`]) {
          const err = await errorAs(db.client, "authenticated", s.users.parent, sql);
          expect(err?.code, `${t}: ${sql}`).toBe("42501");
        }
      }
    });
  });
});
