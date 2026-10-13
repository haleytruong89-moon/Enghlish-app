import type { ClientBase } from "pg";

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
  { emailLocal: string; role: "parent" | "tutor" | "student"; displayName: string; color: string | null }
> = {
  parent: { emailLocal: "phuhuynh", role: "parent", displayName: "Phụ huynh (thử)", color: null },
  tutorAn: { emailLocal: "giasu-an", role: "tutor", displayName: "Cô của An (thử)", color: null },
  tutorNguyen: { emailLocal: "giasu-nguyen", role: "tutor", displayName: "Cô của Nguyên (thử)", color: null },
  studentAn: { emailLocal: "an", role: "student", displayName: "An (thử)", color: "#9A4A15" },
  studentNguyen: { emailLocal: "nguyen", role: "student", displayName: "Nguyên (thử)", color: "#2F5D9E" },
};

export type SeedResult = {
  familyId: string;
  learners: { an: string; nguyen: string };
  members: Record<keyof SeedUsers, string>;
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
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
