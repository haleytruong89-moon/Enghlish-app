import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toKeyRows, toSafeSteps, toSources } from "../../lib/config/inquiries";
import { loadContentItems } from "../../lib/config/versions";
import { assignDevInquiries, DEV_INQUIRIES } from "../../scripts/lib/seed";
import { createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const content = loadContentItems();
const published = content.inquiryTemplates;

describe("0008 seed: the pilot inquiry templates (S2)", () => {
  let db: TestDb;
  let s: Seeded;
  const q = async <R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.client.query<R>(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => ((await q<{ n: number }>(sql, params))[0] as { n: number }).n;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("seeds exactly the published templates: 5 for Track A, the Track B baseline; drafts are not in the database", async () => {
    expect(published.map((p) => p.id)).toEqual([
      "A-W0-BASELINE@1", "A-W1-VOLCANOES@1", "A-W2-WATERCYCLE@1", "A-W3-EARTHQUAKES@1", "A-W4-PLANETS@1", "B-W0-BASELINE@1",
    ]);
    const rows = await q<{ id: string; version: number; status: string; published: boolean; source_hash: string }>(
      "select id, version, status, published_at is not null as published, source_hash from english.inquiry_templates order by id",
    );
    expect(rows.map((r) => `${r.id}@${r.version}`)).toEqual(published.map((p) => p.id));
    for (const r of rows) {
      const item = published.find((p) => p.id === `${r.id}@${r.version}`);
      expect(r.status, r.id).toBe("published");
      expect(r.published, r.id).toBe(true);
      expect(r.source_hash, r.id).toBe(item?.hash);
    }
    for (const d of content.draftInquiryTemplates) {
      expect(await count("select count(*)::int as n from english.inquiry_templates where id = $1", [d.data.id]), d.id).toBe(0);
    }
    expect(content.draftInquiryTemplates.map((d) => d.id)).toEqual(["B-W1-HOMEWORK@1", "B-W2-PHONES@1", "B-W3-TRANSPORT@1", "B-W4-AI-HOMEWORK@1"]);
  });

  it("the database holds what the content files say: safe steps, source rows, one key row per item", async () => {
    for (const p of published) {
      const t = p.data;
      const row = (await q("select * from english.inquiry_templates where id = $1 and version = $2", [t.id, t.version]))[0];
      expect(row, t.id).toBeTruthy();
      expect(row?.steps, t.id).toEqual(JSON.parse(JSON.stringify(toSafeSteps(t))));
      expect(row?.target_ids, t.id).toEqual(t.target_ids);
      expect(row?.track_id, t.id).toBe(t.track);
      expect(row?.catalogue_version, t.id).toBe(t.catalogue_version);
      expect(row?.title_vi, t.id).toBe(t.title_vi);

      const { rows: srcRows } = toSources(t);
      const stored = await q("select id, version, title, url, author, rights_note, modality, body from english.sources where id like $1 order by id", [`${t.id}-S%`]);
      expect(stored, t.id).toEqual(srcRows.map(({ transcript: _t, ...rest }) => rest).sort((a, b) => (a.id < b.id ? -1 : 1)));
      for (const r of srcRows.filter((x) => x.transcript !== null)) {
        const tr = await q("select transcript from english.source_transcripts where source_id = $1 and source_version = $2", [r.id, r.version]);
        expect(tr, r.id).toEqual([{ transcript: r.transcript }]);
      }
      const nTranscripts = await count("select count(*)::int as n from english.source_transcripts where source_id like $1", [`${t.id}-S%`]);
      expect(nTranscripts, t.id).toBe(srcRows.filter((x) => x.transcript !== null).length);

      const keys = await q("select count(*)::int as n, count(*) filter (where kind = 'answer')::int as a, count(*) filter (where kind = 'sealed')::int as sealed, count(*) filter (where kind = 'note')::int as notes from english.template_item_keys where template_id = $1", [t.id]);
      const expected = toKeyRows(t);
      expect(keys[0], t.id).toEqual({
        n: expected.length,
        a: expected.filter((k) => k.kind === "answer").length,
        sealed: expected.filter((k) => k.kind === "sealed").length,
        notes: expected.filter((k) => k.kind === "note").length,
      });
    }
    // no source text is a video / no embed: every source is text or audio, links optional
    expect(await count("select count(*)::int as n from english.sources where modality = 'video'")).toBe(0);
  });

  it("every rights note is present and every published template stands on published sources", async () => {
    expect(await count("select count(*)::int as n from english.sources where published_at is null")).toBe(0);
    expect(await count("select count(*)::int as n from english.sources where length(btrim(rights_note)) = 0")).toBe(0);
  });

  it("applying every migration again changes nothing", async () => {
    const before = await count("select (select count(*) from english.inquiry_templates) + (select count(*) from english.sources) + (select count(*) from english.template_item_keys) + (select count(*) from english.source_transcripts) as n");
    await migrate(db.client, true);
    const after = await count("select (select count(*) from english.inquiry_templates) + (select count(*) from english.sources) + (select count(*) from english.template_item_keys) + (select count(*) from english.source_transcripts) as n");
    expect(after).toBe(before);
  });

  it("the dev seed hands A-W1-VOLCANOES to An (thử) and the B baseline to Nguyên (thử); a second run changes nothing", async () => {
    const first = await assignDevInquiries(db.client, s);
    expect(first.every((r) => r.instanceId)).toBe(true);
    expect(first.map((r) => r.template)).toEqual(DEV_INQUIRIES.map((d) => d.template));
    const second = await assignDevInquiries(db.client, s);
    expect(second.map((r) => r.instanceId)).toEqual(first.map((r) => r.instanceId));
    expect(await count("select count(*)::int as n from english.inquiry_instances")).toBe(2);

    const an = (await q("select i.template_id, i.assigned_by, i.due_on::text as due, (select count(*)::int from english.activity_instances a where a.inquiry_instance_id = i.id) as steps from english.inquiry_instances i where learner_id = $1", [s.learners.an]))[0];
    expect(an).toEqual({ template_id: "A-W1-VOLCANOES", assigned_by: s.members.parent, due: "2026-10-25", steps: 13 });
    const ng = (await q("select i.template_id, (select count(*)::int from english.activity_instances a where a.inquiry_instance_id = i.id) as steps from english.inquiry_instances i where learner_id = $1", [s.learners.nguyen]))[0];
    expect(ng).toEqual({ template_id: "B-W0-BASELINE", steps: 6 });

    // the default schedule comes from the template (kit dates), and every step is there
    const dates = await q<{ step_no: number; d: string | null }>("select step_no, scheduled_for::text as d from english.activity_instances where learner_id = $1 order by step_no", [s.learners.an]);
    const volcanoes = published.find((p) => p.id === "A-W1-VOLCANOES@1")?.data;
    expect(dates.map((r) => r.d)).toEqual(volcanoes?.steps.map((st) => st.planned_date));
  });

  it("baseline steps carry purpose 'baseline' all the way into the learner's activity rows", async () => {
    const rows = await q<{ purpose: string[] }>("select a.purpose from english.activity_instances a where a.learner_id = $1", [s.learners.nguyen]);
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r.purpose).toContain("baseline");
  });

  it("students read no template, source, key or transcript table; staff read the texts but a tutor only of their child's track", async () => {
    for (const student of [s.users.studentAn, s.users.studentNguyen]) {
      for (const table of ["inquiry_templates", "sources", "template_item_keys", "instance_item_keys", "source_transcripts"]) {
        expect(await rowsAs(db.client, "authenticated", student, `select * from english.${table}`), `${table} / student`).toEqual([]);
      }
    }
    // the parent (both tracks) reads everything: 6 templates, all their sources, keys and transcripts
    const parent = s.users.parent;
    expect(await rowsAs(db.client, "authenticated", parent, "select id from english.inquiry_templates")).toHaveLength(6);
    expect((await rowsAs(db.client, "authenticated", parent, "select id from english.sources")).length).toBeGreaterThan(0);
    for (const table of ["template_item_keys", "instance_item_keys", "source_transcripts"]) {
      expect((await rowsAs(db.client, "authenticated", parent, `select * from english.${table}`)).length, table).toBeGreaterThan(0);
    }
    // what staff can read in the student-safe columns still holds no answer and no tutor script
    const text = JSON.stringify({
      templates: await rowsAs(db.client, "authenticated", parent, "select * from english.inquiry_templates"),
      sources: await rowsAs(db.client, "authenticated", parent, "select * from english.sources"),
    });
    for (const key of ['"answer":', '"explanation_vi"', '"prompt_vi"', '"transcript"', '"review_note"']) expect(text, key).not.toContain(key);
    for (const p of published) {
      for (const src of p.data.sources.filter((x) => x.modality === "audio")) {
        expect(text.includes(JSON.stringify(src.text).slice(1, 80)), `transcript of ${src.id}`).toBe(false);
      }
      for (const st of p.data.steps.filter((x) => x.prompt_vi.length > 40)) {
        expect(text.includes(JSON.stringify(st.prompt_vi).slice(1, 60)), `${p.id}#${st.step_no} script`).toBe(false);
      }
    }
    // positive control: the parent does see a reading passage
    const reading = published[1]?.data.sources.find((x) => x.modality === "text");
    expect(text.includes(JSON.stringify(reading?.text ?? "").slice(1, 80))).toBe(true);
    // Track A tutor: five Track A templates, none of Track B
    const tutor = await rowsAs<{ id: string }>(db.client, "authenticated", s.users.tutorAn, "select id from english.inquiry_templates order by id");
    expect(tutor.map((r) => r.id).every((id) => id.startsWith("A-"))).toBe(true);
    expect(tutor).toHaveLength(5);
  });
});
