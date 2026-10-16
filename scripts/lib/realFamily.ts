import type { ClientBase } from "pg";

/**
 * The REAL family (is_test = false). Fixed ids so re-running changes nothing.
 * Prefix "f0000000" keeps them visibly apart from the test family ("e0000000", see seed.ts).
 */
export const REAL_FAMILY_ID = "f0000000-0000-4000-8000-000000000001";
export const REAL_LEARNER_AN_ID = "f0000000-0000-4000-8000-00000000a001";
export const REAL_LEARNER_NGUYEN_ID = "f0000000-0000-4000-8000-00000000b001";

/**
 * No consent notice text or version exists in the schema or the app yet (consents holds only a version string),
 * so the pilot notice is identified by this version. Parent decision pending on the notice wording: see docs/PROGRESS.md.
 */
export const REAL_CONSENT_VERSION = "pilot-2026-10";

export type RealFamilyUsers = {
  parent: string;
  tutorAn: string;
  tutorNguyen: string;
  studentAn: string;
  studentNguyen: string;
};

export type RealFamilyNames = { tutorAn: string; tutorNguyen: string };

type Role = "parent" | "tutor" | "student";

/** Aliases are fixed on purpose: only "An" / "Nguyên" may ever reach an LLM (PRD privacy rule). */
export const REAL_ACCOUNTS: Record<keyof RealFamilyUsers, { role: Role; displayName: string | null; color: string | null }> = {
  parent: { role: "parent", displayName: "Phụ huynh", color: null },
  tutorAn: { role: "tutor", displayName: null, color: null },
  tutorNguyen: { role: "tutor", displayName: null, color: null },
  studentAn: { role: "student", displayName: "An", color: "#9A4A15" },
  studentNguyen: { role: "student", displayName: "Nguyên", color: "#2F5D9E" },
};

const ROLE_LABEL: Record<keyof RealFamilyUsers, string> = {
  parent: "phụ huynh",
  tutorAn: "gia sư của An",
  tutorNguyen: "gia sư của Nguyên",
  studentAn: "An",
  studentNguyen: "Nguyên",
};

const LEARNERS = [
  { id: REAL_LEARNER_AN_ID, key: "studentAn", tutorKey: "tutorAn", alias: "An", track: "A", ref: "skillgrow:child:an", targetSet: "A-v1" },
  { id: REAL_LEARNER_NGUYEN_ID, key: "studentNguyen", tutorKey: "tutorNguyen", alias: "Nguyên", track: "B", ref: "skillgrow:child:nguyen", targetSet: "B-v1" },
] as const;

export type RealFamilyResult = {
  familyId: string;
  learners: { an: string; nguyen: string };
  members: Record<keyof RealFamilyUsers, string>;
  /** Rows written by THIS run (0 on an idempotent re-run). */
  inserted: number;
};

/**
 * Read-only checks. Throws (with a Vietnamese message, no emails) when the real family cannot be created or
 * completed without moving a person between families or swapping someone already in place.
 * `users` may be partial: the CLI runs this with the accounts that already exist BEFORE creating any new auth user.
 */
export async function checkRealFamilyConflicts(client: ClientBase, users: Partial<RealFamilyUsers>): Promise<void> {
  const keys = Object.keys(REAL_ACCOUNTS) as (keyof RealFamilyUsers)[];
  const known = keys.filter((k) => users[k]);
  const ids = known.map((k) => users[k] as string);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Hai người dùng chung một tài khoản đăng nhập — mỗi người phải có tài khoản riêng.");
  }

  for (const key of known) {
    const res = await client.query<{ family_id: string; role: string }>(
      "select family_id, role from english.members where user_id = $1",
      [users[key]],
    );
    const row = res.rows[0];
    if (row && (row.family_id !== REAL_FAMILY_ID || row.role !== REAL_ACCOUNTS[key].role)) {
      throw new Error(
        `Tài khoản của ${ROLE_LABEL[key]} đã thuộc một gia đình/vai trò khác trong app — dừng, không chuyển người giữa các gia đình.`,
      );
    }
  }

  // The real family may already exist: refuse to swap who is already in place.
  if (users.parent) {
    const other = await client.query(
      "select 1 from english.members where family_id = $1 and role = 'parent' and user_id <> $2",
      [REAL_FAMILY_ID, users.parent],
    );
    if (other.rowCount) throw new Error("Gia đình thật đã có một phụ huynh khác — dừng, không đổi người.");
  }
  for (const l of LEARNERS) {
    const learner = await client.query<{ user_id: string | null }>(
      `select m.user_id from english.learners l left join english.members m on m.id = l.member_id where l.id = $1`,
      [l.id],
    );
    const bound = learner.rows[0]?.user_id;
    if (learner.rowCount && bound && users[l.key] && bound !== users[l.key]) {
      throw new Error(`${ROLE_LABEL[l.key]} đã gắn với một tài khoản khác — dừng, không đổi người.`);
    }
    if (users[l.tutorKey]) {
      const other = await client.query(
        `select 1 from english.relationships r join english.members m on m.id = r.member_id
         where r.learner_id = $1 and r.relation = 'tutor' and r.valid_to is null and m.user_id <> $2`,
        [l.id, users[l.tutorKey]],
      );
      if (other.rowCount) {
        throw new Error(`${ROLE_LABEL[l.tutorKey]} đã có người khác đang phụ trách — đổi gia sư làm riêng, không qua công cụ này.`);
      }
    }
  }
}

/**
 * Create (or complete idempotently) the REAL family: parent, learner An (track A), learner Nguyên (track B),
 * one tutor each, active relationships, one `data` consent per learner (recorded by the parent), target sets A-v1 / B-v1.
 * No inquiries are assigned (the parent does that from the "Giao bài" page).
 * One transaction; requires a privileged connection (DATABASE_URL owner). Existing rows are never modified.
 */
export async function createRealFamily(
  client: ClientBase,
  users: RealFamilyUsers,
  names: RealFamilyNames,
): Promise<RealFamilyResult> {
  await client.query("begin");
  try {
    await checkRealFamilyConflicts(client, users);
    let inserted = 0;
    const count = (n: number | null) => {
      inserted += n ?? 0;
    };

    count(
      (
        await client.query(
          `insert into english.families(id, name) values ($1, 'Gia đình')
           on conflict (id) do nothing`,
          [REAL_FAMILY_ID],
        )
      ).rowCount,
    );

    const members = {} as Record<keyof RealFamilyUsers, string>;
    for (const key of Object.keys(REAL_ACCOUNTS) as (keyof RealFamilyUsers)[]) {
      const acc = REAL_ACCOUNTS[key];
      const existing = await client.query<{ id: string }>("select id from english.members where user_id = $1", [users[key]]);
      if (existing.rows[0]) {
        members[key] = existing.rows[0].id;
        continue;
      }
      const displayName = acc.displayName ?? (key === "tutorAn" ? names.tutorAn : names.tutorNguyen);
      const ins = await client.query<{ id: string }>(
        `insert into english.members(user_id, family_id, role, display_name, color)
         values ($1, $2, $3, $4, $5) returning id`,
        [users[key], REAL_FAMILY_ID, acc.role, displayName, acc.color],
      );
      members[key] = (ins.rows[0] as { id: string }).id;
      inserted += 1;
    }

    for (const l of LEARNERS) {
      count(
        (
          await client.query(
            `insert into english.learners(id, family_id, member_id, alias, track_id, external_ref, is_test, ai_enabled, status)
             values ($1, $2, $3, $4, $5, $6, false, false, 'active')
             on conflict (id) do nothing`,
            [l.id, REAL_FAMILY_ID, members[l.key], l.alias, l.track, l.ref],
          )
        ).rowCount,
      );
    }

    // Target sets (S1). The function does nothing when the set is already current; count rows to know.
    for (const l of LEARNERS) {
      const before = await client.query<{ n: number }>(
        "select count(*)::int as n from english.target_sets where learner_id = $1",
        [l.id],
      );
      await client.query("select english.eng_assign_target_set($1, $2)", [l.id, l.targetSet]);
      const after = await client.query<{ n: number }>(
        "select count(*)::int as n from english.target_sets where learner_id = $1",
        [l.id],
      );
      inserted += (after.rows[0]?.n ?? 0) - (before.rows[0]?.n ?? 0);
    }

    const rels: [string, string, "parent" | "tutor"][] = [
      [members.parent, REAL_LEARNER_AN_ID, "parent"],
      [members.parent, REAL_LEARNER_NGUYEN_ID, "parent"],
      [members.tutorAn, REAL_LEARNER_AN_ID, "tutor"],
      [members.tutorNguyen, REAL_LEARNER_NGUYEN_ID, "tutor"],
    ];
    for (const [memberId, learnerId, relation] of rels) {
      count(
        (
          await client.query(
            `insert into english.relationships(member_id, learner_id, relation)
             select $1, $2, $3
             where not exists (
               select 1 from english.relationships
               where member_id = $1 and learner_id = $2 and relation = $3 and valid_to is null)`,
            [memberId, learnerId, relation],
          )
        ).rowCount,
      );
    }

    for (const l of LEARNERS) {
      count(
        (
          await client.query(
            `insert into english.consents(learner_id, subject_member_id, notice_version, scope, granted, recorded_by)
             select $1, $2, $3, 'data', true, $2
             where not exists (
               select 1 from english.consents
               where learner_id = $1 and subject_member_id = $2 and notice_version = $3 and scope = 'data')`,
            [l.id, members.parent, REAL_CONSENT_VERSION],
          )
        ).rowCount,
      );
    }

    // Safety net: this family must contain no test learner, and only these two learners.
    const bad = await client.query("select 1 from english.learners where family_id = $1 and (is_test or id not in ($2, $3))", [
      REAL_FAMILY_ID,
      REAL_LEARNER_AN_ID,
      REAL_LEARNER_NGUYEN_ID,
    ]);
    if (bad.rowCount) throw new Error("Gia đình thật có học sinh ngoài dự kiến — dừng.");

    // Append-only log, only when something changed (a no-op re-run must not add rows). No emails / names in the payload.
    if (inserted > 0) {
      await client.query(
        `insert into english.audit_log(action, family_id, payload)
         values ('family.create_real', $1, jsonb_build_object('learners', 2, 'is_test', false, 'rows', $2::int, 'consent_version', $3::text))`,
        [REAL_FAMILY_ID, inserted, REAL_CONSENT_VERSION],
      );
    }

    await client.query("commit");
    return {
      familyId: REAL_FAMILY_ID,
      learners: { an: REAL_LEARNER_AN_ID, nguyen: REAL_LEARNER_NGUYEN_ID },
      members,
      inserted,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
