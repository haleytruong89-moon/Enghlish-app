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
  | "work:review" //         tutor/parent review evidence (S5)
  | "consent:read" //        consents — parent only
  | "admin"; //              export / purge / settings — parent only

export const ACTIONS_BY_ROLE: Record<Role, readonly Action[]> = {
  student: ["learner:read", "work:submit"],
  tutor: ["learner:read", "work:review"],
  parent: ["learner:read", "work:review", "consent:read", "admin"],
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
): Promise<boolean> {
  if (member.role === "student") return learner.memberId === member.id;
  if (member.role === "parent" && learner.familyId === member.familyId) return true;
  const rels = await store.getRelationships(member.id, learner.id);
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

  const learner = await store.getLearner(learnerId);
  if (!learner) throw notFound();
  if (!allowReal && !learner.isTest) throw notFound();
  if (!(await inScope(member, learner, store, now))) throw notFound();

  if (!ACTIONS_BY_ROLE[member.role].includes(action)) throw new AccessError(403, "forbidden");

  return { member, learner, action };
}
