import type { ClientBase } from "pg";
import { upsertLoginNames } from "./loginNames";
import { addDays, daysBetween, dateWindow, todayVn } from "../../lib/inquiries/dates";

/** Fixed IDs so the dev seed is idempotent. Only TEST data — never real learners. */
export const TEST_FAMILY_ID = "e0000000-0000-4000-8000-000000000001";
export const TEST_LEARNER_AN_ID = "e0000000-0000-4000-8000-00000000a001";
export const TEST_LEARNER_NGUYEN_ID = "e0000000-0000-4000-8000-00000000b001";

export type SeedUsers = {
  parent: string;
  tutorAn: string;
  tutorNguyen: string;
  studentAn: string;
  studentNguyen: string;
};

export const SEED_ACCOUNTS: Record<
  keyof SeedUsers,
  { emailLocal: string; loginName: string; role: "parent" | "tutor" | "student"; displayName: string; color: string | null }
> = {
  // loginName: always "thu-…" so a test name can never collide with the real family's an / nguyen / giasu-an / giasu-nguyen.
  parent: { emailLocal: "phuhuynh", loginName: "thu-phuhuynh", role: "parent", displayName: "Phụ huynh (thử)", color: null },
  tutorAn: { emailLocal: "giasu-an", loginName: "thu-giasu-an", role: "tutor", displayName: "Cô của An (thử)", color: null },
  tutorNguyen: { emailLocal: "giasu-nguyen", loginName: "thu-giasu-nguyen", role: "tutor", displayName: "Cô của Nguyên (thử)", color: null },
  studentAn: { emailLocal: "an", loginName: "thu-an", role: "student", displayName: "An (thử)", color: "#9A4A15" },
  studentNguyen: { emailLocal: "nguyen", loginName: "thu-nguyen", role: "student", displayName: "Nguyên (thử)", color: "#2F5D9E" },
};

export type SeedResult = {
  familyId: string;
  learners: { an: string; nguyen: string };
  members: Record<keyof SeedUsers, string>;
  /** Short login names that could not be given (already used for another account): a warning, never a failure of the seed. */
  loginWarnings: string[];
};

/**
 * Create (or re-create idempotently) the TEST family:
 * learners "An (thử)" track A and "Nguyên (thử)" track B, both is_test = true;
 * one parent; two tutors, each related to exactly one learner.
 * Runs in one transaction. Requires a privileged connection (DATABASE_URL owner).
 */
export async function seedTestFamily(client: ClientBase, users: SeedUsers): Promise<SeedResult> {
  await client.query("begin");
  try {
    await client.query(
      `insert into english.families(id, name) values ($1, 'Gia đình thử (TEST)')
       on conflict (id) do nothing`,
      [TEST_FAMILY_ID],
    );

    const members = {} as Record<keyof SeedUsers, string>;
    for (const key of Object.keys(SEED_ACCOUNTS) as (keyof SeedUsers)[]) {
      const acc = SEED_ACCOUNTS[key];
      const userId = users[key];
      const existing = await client.query<{ id: string; family_id: string; role: string }>(
        "select id, family_id, role from english.members where user_id = $1",
        [userId],
      );
      if (existing.rowCount && existing.rows[0]) {
        const row = existing.rows[0];
        if (row.family_id !== TEST_FAMILY_ID || row.role !== acc.role) {
          throw new Error(
            `User for "${key}" already belongs to another family/role — refusing to reuse it for test data`,
          );
        }
        members[key] = row.id;
        continue;
      }
      const ins = await client.query<{ id: string }>(
        `insert into english.members(user_id, family_id, role, display_name, color)
         values ($1, $2, $3, $4, $5) returning id`,
        [userId, TEST_FAMILY_ID, acc.role, acc.displayName, acc.color],
      );
      members[key] = (ins.rows[0] as { id: string }).id;
    }

    // A "thu-…" name that already belongs to another account is a warning (that name is skipped), never a failure of the whole seed.
    const loginNames = await upsertLoginNames(
      client,
      (Object.keys(SEED_ACCOUNTS) as (keyof SeedUsers)[]).map((key) => ({
        label: SEED_ACCOUNTS[key].displayName,
        name: SEED_ACCOUNTS[key].loginName,
        userId: users[key],
      })),
      { onConflict: "skip" },
    );

    const learners: [string, string, string, string, string, string][] = [
      [TEST_LEARNER_AN_ID, members.studentAn, "An (thử)", "A", "skillgrow:child:an:test", "A-v1"],
      [TEST_LEARNER_NGUYEN_ID, members.studentNguyen, "Nguyên (thử)", "B", "skillgrow:child:nguyen:test", "B-v1"],
    ];
    for (const [id, memberId, alias, track, ref] of learners) {
      await client.query(
        `insert into english.learners(id, family_id, member_id, alias, track_id, external_ref, is_test, ai_enabled, status)
         values ($1, $2, $3, $4, $5, $6, true, false, 'active')
         on conflict (id) do update set is_test = true`,
        [id, TEST_FAMILY_ID, memberId, alias, track, ref],
      );
    }

    // Target set per learner (S1). Idempotent: the function does nothing when the set is already current.
    for (const [id, , , , , targetSet] of learners) {
      await client.query("select english.eng_assign_target_set($1, $2)", [id, targetSet]);
    }

    const rels: [string, string, "parent" | "tutor"][] = [
      [members.parent, TEST_LEARNER_AN_ID, "parent"],
      [members.parent, TEST_LEARNER_NGUYEN_ID, "parent"],
      [members.tutorAn, TEST_LEARNER_AN_ID, "tutor"],
      [members.tutorNguyen, TEST_LEARNER_NGUYEN_ID, "tutor"],
    ];
    for (const [memberId, learnerId, relation] of rels) {
      await client.query(
        `insert into english.relationships(member_id, learner_id, relation)
         select $1, $2, $3
         where not exists (
           select 1 from english.relationships
           where member_id = $1 and learner_id = $2 and relation = $3 and valid_to is null)`,
        [memberId, learnerId, relation],
      );
    }

    for (const learnerId of [TEST_LEARNER_AN_ID, TEST_LEARNER_NGUYEN_ID]) {
      await client.query(
        `insert into english.consents(learner_id, subject_member_id, notice_version, scope, granted, recorded_by)
         select $1, $2, 'test-0.1', 'data', true, $2
         where not exists (
           select 1 from english.consents
           where learner_id = $1 and subject_member_id = $2 and notice_version = 'test-0.1' and scope = 'data')`,
        [learnerId, members.parent],
      );
    }

    // Safety net: this family must only ever contain test learners.
    const real = await client.query(
      "select 1 from english.learners where family_id = $1 and is_test = false",
      [TEST_FAMILY_ID],
    );
    if (real.rowCount) throw new Error("Test family contains a non-test learner — aborting");

    await client.query(
      `insert into english.audit_log(action, family_id, payload)
       values ('seed.dev', $1, jsonb_build_object('learners', 2, 'is_test', true))`,
      [TEST_FAMILY_ID],
    );

    await client.query("commit");
    return {
      familyId: TEST_FAMILY_ID,
      learners: { an: TEST_LEARNER_AN_ID, nguyen: TEST_LEARNER_NGUYEN_ID },
      members,
      loginWarnings: loginNames.skipped,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

/**
 * Inquiries handed to the TEST learners by the dev seed (S2). Fixed client_request_ids make it idempotent:
 * running the seed again returns the same instances. Nguyên gets the baseline: it is the only Track B
 * template published so far (the weekly ones wait for a content decision, see docs/PROGRESS.md).
 */
export const DEV_INQUIRIES = [
  { learner: "an", template: "A-W1-VOLCANOES", version: 1, requestId: "seed-dev:A-W1-VOLCANOES:1" },
  { learner: "nguyen", template: "B-W0-BASELINE", version: 1, requestId: "seed-dev:B-W0-BASELINE:1" },
] as const;

/** The test learners' dev week started this many days ago, so the first steps of each inquiry are already released. */
export const DEV_WEEK_STARTED_DAYS_AGO = 3;

/**
 * Due date for the dev inquiries: the template's own week, moved so that it STARTED DEV_WEEK_STARTED_DAYS_AGO days
 * ago. Steps planned in the first days are then released, so the student screens (S4) have work to show on a
 * preview and in CI, while the later ones (e.g. the second week-end steps) are still ahead. The database moves every
 * step by (due - template end date). Always inside the window it accepts.
 */
export function devDueOn(dateFrom: string, dateTo: string, now: Date = new Date()): string {
  const today = todayVn(now);
  const { min, max } = dateWindow(now);
  const due = addDays(addDays(today, -DEV_WEEK_STARTED_DAYS_AGO), Math.max(0, daysBetween(dateFrom, dateTo)));
  return due < min ? min : due > max ? max : due;
}

export type DevInquiryResult = { template: string; learner: string; instanceId: string | null; skipped?: string };

/**
 * Assign DEV_INQUIRIES to the test learners as the test parent. Skips (does not fail) when migrations
 * 0007/0008 are not applied yet or a template is not published, so an older database can still be seeded.
 */
export async function assignDevInquiries(client: ClientBase, seeded: SeedResult): Promise<DevInquiryResult[]> {
  const fn = await client.query<{ ok: boolean }>(
    "select to_regprocedure('english.eng_assign_inquiry(uuid,text,integer,date,uuid,text)') is not null as ok",
  );
  const out: DevInquiryResult[] = [];
  for (const d of DEV_INQUIRIES) {
    if (!fn.rows[0]?.ok) {
      out.push({ template: d.template, learner: d.learner, instanceId: null, skipped: "migration 0007 is not applied" });
      continue;
    }
    const tpl = await client.query<{ date_from: string; date_to: string }>(
      "select date_from::text as date_from, date_to::text as date_to from english.inquiry_templates where id = $1 and version = $2 and published_at is not null",
      [d.template, d.version],
    );
    const row = tpl.rows[0];
    if (!row) {
      out.push({ template: d.template, learner: d.learner, instanceId: null, skipped: "template not published (apply 0008)" });
      continue;
    }
    const due = devDueOn(row.date_from, row.date_to);
    const res = await client.query<{ id: string }>("select english.eng_assign_inquiry($1, $2, $3, $4, $5, $6) as id", [
      seeded.learners[d.learner],
      d.template,
      d.version,
      due,
      seeded.members.parent,
      d.requestId,
    ]);
    out.push({ template: d.template, learner: d.learner, instanceId: (res.rows[0] as { id: string }).id });
  }
  return out;
}

/**
 * S5: something to review on a preview. An (thử) also gets the week-4 inquiry (A-W4-PLANETS) and, as An, submits ONE writing
 * practice (step 7). Then the review inbox has an item for the test tutor/parent to open and score. Kept apart from
 * DEV_INQUIRIES on purpose: those are what the S2/S4 tests count. Idempotent (fixed request id / submission id: a second run
 * returns the same instance and the same receipt). Skips, never fails, when the migrations or the template are not there yet.
 */
export const DEV_REVIEW_WORK = {
  learner: "an",
  template: "A-W4-PLANETS",
  version: 1,
  requestId: "seed-dev:A-W4-PLANETS:1",
  stepNo: 7,
  submissionId: "e0000000-0000-4000-8000-0000000005a1",
  text: "The planets stay in orbit because the Sun pulls them with its gravity. As a result, they go around the Sun again and again.",
} as const;

export type DevReviewWorkResult = { instanceId: string | null; attemptId: string | null; skipped?: string };

export async function seedDevReviewWork(client: ClientBase, seeded: SeedResult, users: SeedUsers): Promise<DevReviewWorkResult> {
  const d = DEV_REVIEW_WORK;
  const fns = await client.query<{ ok: boolean }>(
    `select to_regprocedure('english.eng_assign_inquiry(uuid,text,integer,date,uuid,text)') is not null
        and to_regprocedure('english.eng_submit_attempt(uuid,uuid,jsonb,text[],text)') is not null
        and to_regprocedure('english.eng_review_inbox(boolean,text,integer,timestamptz,uuid)') is not null as ok`,
  );
  if (!fns.rows[0]?.ok) return { instanceId: null, attemptId: null, skipped: "migration 0010 is not applied" };
  const tpl = await client.query<{ date_from: string; date_to: string }>(
    "select date_from::text as date_from, date_to::text as date_to from english.inquiry_templates where id = $1 and version = $2 and published_at is not null",
    [d.template, d.version],
  );
  const row = tpl.rows[0];
  if (!row) return { instanceId: null, attemptId: null, skipped: "template not published (apply 0008)" };

  const inst = await client.query<{ id: string }>("select english.eng_assign_inquiry($1, $2, $3, $4, $5, $6) as id", [
    seeded.learners[d.learner],
    d.template,
    d.version,
    devDueOn(row.date_from, row.date_to),
    seeded.members.parent,
    d.requestId,
  ]);
  const instanceId = (inst.rows[0] as { id: string }).id;

  const act = await client.query<{ id: string; released: boolean }>(
    "select id, english.eng_activity_released(id) as released from english.activity_instances where inquiry_instance_id = $1 and step_no = $2",
    [instanceId, d.stepNo],
  );
  const step = act.rows[0];
  if (!step?.released) return { instanceId, attemptId: null, skipped: "the step is not open yet" };

  // Submit AS the child: the function identifies the caller by auth.uid() (a transaction-local claim), exactly as in the app.
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [users.studentAn]);
    await client.query("set local role authenticated");
    const r = await client.query<{ r: { attempt_id: string } }>(
      "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r",
      [step.id, d.submissionId, JSON.stringify({ text: d.text }), ["none"]],
    );
    await client.query("commit");
    return { instanceId, attemptId: (r.rows[0] as { r: { attempt_id: string } }).r.attempt_id };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
