/**
 * requireAccess(user, learnerId, action) — the single authorization gate that
 * EVERY route handler calls before touching learner data (DESIGN §7, UAT-01).
 *
 * Rules (mirror english.eng_can_read_learner, plus per-action checks):
 *   - no session                         → 401
 *   - not an english.members user        → 404 (Launcher-only accounts see nothing)
 *   - learner not in caller's scope      → 404, never 403 (do not reveal existence)
 *   - real learner while ALLOW_REAL_LEARNERS=false (Vercel previews) → 404
 *   - in scope but action not allowed for the role → 403
 *
 * The data source is an injectable AccessStore (default: service-role Supabase store,
 * loaded lazily so unit tests never import server-only code).
 */
import { allowRealLearners } from "@/lib/env";

export type Role = "parent" | "tutor" | "student";

export type Action =
  | "learner:read" //        see the learner and their (role-filtered) data
  | "work:submit" //         student submits own work (S4)
  | "work:review" //         tutor/parent review evidence (S5); the database narrows it further (D15)
  | "notes:read" //         lesson notes — tutor (all versions) and parent (published ones; RLS decides) (S5)
  | "notes:write" //        write a lesson note — tutor only (S5)
  | "tutorwork:read" //     weak points, results, tags and test frames — tutor and parent (S5b-1); never students
  | "tutorwork:write" //    record a result / a v2 session note / tags — tutor and parent; the database narrows in-class work to tutors (D15)
  | "practice:read" //      assigned practice, what the student sent, and its files - tutor and parent; never students (S5b-1 PR B)
  | "practice:write" //     give / retract practice, upload its files, submit on the student's behalf - tutor and parent
  | "levels:decide" //     confirm the starting levels / adjust one level (SM-2) - the child's tutor only; the database checks it again
  | "teaching:write" //    write teaching notes and the intake profile (W1) - the child's tutor only; the database checks it again
  | "mastery:read" //      skill states, proposals and the skills inbox (S7a) - tutor and parent; never students
  | "mastery:decide" //    confirm / "Chưa" / confirm all / set a level 1–2 by hand (S7a) - the child's tutor only; the database checks it again
  | "mastery:rebuild" //   "Tính lại từ đầu" (S7a) - tutor and parent
  | "points:read" //       knowledge-point map and proposals (W3) - tutor and parent; never students
  | "points:decide" //     confirm / "Chưa" a point level 3–4 (W3) - the child's tutor only; the database checks it again
  | "points:rebuild" //    "Tính lại từ đầu" for points (W3) - tutor and parent
  | "import:upload" //     upload and read finished paper work (W3) - tutor and parent
  | "import:confirm" //    confirm the result of imported work (W3) - the child's tutor only; the database checks it again
  | "studio:read" //       Studio drafts and tests of a child (Studio B1) - tutor and parent; never students
  | "studio:write" //      upload, edit, approve, assign a Studio test, decide "Cần thầy/cô xem" items - tutor and parent of the child
  | "curriculum:read" //   curricula, their versions, units and unit statuses (W2) - tutor and parent; never students
  | "curriculum:write" //  add a curriculum, upload its contents, edit / discard a draft, set a unit's status (W2) - tutor and parent
  | "curriculum:approve" // approve a curriculum version (W2, D-W8) - the child's tutor only; the database checks it again
  | "sessions:mark" //     record / cancel an absence, mark a lesson note Thường / Học bù / Không tính (UX 3B) - the child's tutor or the parent; the database checks it again
  | "targets:read" //        tracked-skills page (target set) — parent and tutor only
  | "inquiries:read" //     assigned inquiries + assignable templates — parent and tutor only
  | "inquiries:assign" //   assign an inquiry template — parent and tutor only
  | "activities:event" //   reschedule / skip a step, always with a reason — parent and tutor only
  | "consent:read" //        consents — parent only
  | "admin"; //              export / purge / settings — parent only

export const ACTIONS_BY_ROLE: Record<Role, readonly Action[]> = {
  student: ["learner:read", "work:submit"],
  tutor: [
    "learner:read",
    "targets:read",
    "inquiries:read",
    "inquiries:assign",
    "activities:event",
    "work:review",
    "notes:read",
    "notes:write",
    "tutorwork:read",
    "tutorwork:write",
    "sessions:mark",
    "practice:read",
    "practice:write",
    "levels:decide",
    "teaching:write",
    "mastery:read",
    "mastery:decide",
    "mastery:rebuild",
    "points:read",
    "points:decide",
    "points:rebuild",
    "import:upload",
    "import:confirm",
    "studio:read",
    "studio:write",
    "curriculum:read",
    "curriculum:write",
    "curriculum:approve",
  ],
  parent: [
    "learner:read",
    "targets:read",
    "inquiries:read",
    "inquiries:assign",
    "activities:event",
    "work:review",
    "notes:read",
    "tutorwork:read",
    "tutorwork:write",
    "sessions:mark",
    "practice:read",
    "practice:write",
    "consent:read",
    "mastery:read",
    "mastery:rebuild",
    "points:read",
    "points:rebuild",
    "import:upload",
    "studio:read",
    "studio:write",
    "curriculum:read",
    "curriculum:write",
    "admin",
  ],
};

export type Member = {
  id: string;
  userId: string;
  familyId: string;
  role: Role;
  displayName: string;
};

export type Learner = {
  id: string;
  familyId: string;
  memberId: string | null;
  alias: string;
  trackId: "A" | "B";
  isTest: boolean;
  status: "active" | "draft";
};

export type Relationship = {
  memberId: string;
  learnerId: string;
  relation: "parent" | "tutor";
  validFrom: Date;
  validTo: Date | null;
};

export interface AccessStore {
  getMemberByUserId(userId: string): Promise<Member | null>;
  getLearner(learnerId: string): Promise<Learner | null>;
  getRelationships(memberId: string, learnerId: string): Promise<Relationship[]>;
}

export type AccessUser = { id: string } | null | undefined;

export type AccessDeps = {
  store: AccessStore;
  allowRealLearners: boolean;
  now: Date;
};

export class AccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export type AccessGrant = { member: Member; learner: Learner; action: Action };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isActiveRelationship(r: Relationship, now: Date): boolean {
  return r.validFrom.getTime() <= now.getTime() && (r.validTo === null || r.validTo.getTime() > now.getTime());
}

/** Is the learner in the member's read scope? (same logic as english.eng_can_read_learner) */
export async function inScope(
  member: Member,
  learner: Learner,
  store: AccessStore,
  now: Date,
  /** Relationships already read (a tutor's are read in parallel with the learner); read here when not given. */
  known?: Relationship[],
): Promise<boolean> {
  if (member.role === "student") return learner.memberId === member.id;
  if (member.role === "parent" && learner.familyId === member.familyId) return true;
  const rels = known ?? (await store.getRelationships(member.id, learner.id));
  return rels.some((r) => r.memberId === member.id && r.learnerId === learner.id && isActiveRelationship(r, now));
}

async function defaultStore(): Promise<AccessStore> {
  const mod = await import("./supabaseStore");
  return mod.createSupabaseAccessStore();
}

export async function requireAccess(
  user: AccessUser,
  learnerId: string,
  action: Action,
  deps: Partial<AccessDeps> = {},
): Promise<AccessGrant> {
  if (!user?.id) throw new AccessError(401, "unauthenticated");
  const store = deps.store ?? (await defaultStore());
  const allowReal = deps.allowRealLearners ?? allowRealLearners();
  const now = deps.now ?? new Date();

  const notFound = () => new AccessError(404, "not_found");
  if (!UUID_RE.test(learnerId)) throw notFound();

  const member = await store.getMemberByUserId(user.id);
  if (!member) throw notFound();

  // The learner and a tutor's relationships do not depend on each other: read them together (one round trip less).
  const [learner, rels] = await Promise.all([
    store.getLearner(learnerId),
    member.role === "tutor" ? store.getRelationships(member.id, learnerId) : Promise.resolve(undefined),
  ]);
  if (!learner) throw notFound();
  if (!allowReal && !learner.isTest) throw notFound();
  if (!(await inScope(member, learner, store, now, rels))) throw notFound();

  if (!ACTIONS_BY_ROLE[member.role].includes(action)) throw new AccessError(403, "forbidden");

  return { member, learner, action };
}

/**
 * Staff gate for routes that are not about one learner (the review inbox): signed in, a member of this app, and not a
 * student. No session → 401; not a member → 404 (Launcher-only accounts see nothing); student → 403.
 */
export async function requireStaff(user: AccessUser, deps: Partial<AccessDeps> = {}): Promise<Member> {
  if (!user?.id) throw new AccessError(401, "unauthenticated");
  const store = deps.store ?? (await defaultStore());
  const member = await store.getMemberByUserId(user.id);
  if (!member) throw new AccessError(404, "not_found");
  if (member.role === "student") throw new AccessError(403, "forbidden");
  return member;
}
