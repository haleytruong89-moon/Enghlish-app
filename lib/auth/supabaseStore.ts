import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessStore, Learner, Member, Relationship, Role } from "./requireAccess";

type MemberRow = { id: string; user_id: string; family_id: string; role: Role; display_name: string };
type LearnerRow = {
  id: string;
  family_id: string;
  member_id: string | null;
  alias: string;
  track_id: "A" | "B";
  is_test: boolean;
  status: "active" | "draft";
};
type RelationshipRow = {
  member_id: string;
  learner_id: string;
  relation: "parent" | "tutor";
  valid_from: string;
  valid_to: string | null;
};

export const toMember = (r: MemberRow): Member => ({
  id: r.id,
  userId: r.user_id,
  familyId: r.family_id,
  role: r.role,
  displayName: r.display_name,
});

export const toLearner = (r: LearnerRow): Learner => ({
  id: r.id,
  familyId: r.family_id,
  memberId: r.member_id,
  alias: r.alias,
  trackId: r.track_id,
  isTest: r.is_test,
  status: r.status,
});

/** AccessStore backed by the service-role client (authoritative, independent of RLS). */
export function createSupabaseAccessStore(): AccessStore {
  const db = createAdminClient();
  return {
    async getMemberByUserId(userId) {
      const { data, error } = await db
        .from("members")
        .select("id, user_id, family_id, role, display_name")
        .eq("user_id", userId)
        .maybeSingle<MemberRow>();
      if (error) throw new Error(`members lookup failed: ${error.code}`);
      return data ? toMember(data) : null;
    },
    async getLearner(learnerId) {
      const { data, error } = await db
        .from("learners")
        .select("id, family_id, member_id, alias, track_id, is_test, status")
        .eq("id", learnerId)
        .maybeSingle<LearnerRow>();
      if (error) throw new Error(`learners lookup failed: ${error.code}`);
      return data ? toLearner(data) : null;
    },
    async getRelationships(memberId, learnerId) {
      const { data, error } = await db
        .from("relationships")
        .select("member_id, learner_id, relation, valid_from, valid_to")
        .eq("member_id", memberId)
        .eq("learner_id", learnerId)
        .returns<RelationshipRow[]>();
      if (error) throw new Error(`relationships lookup failed: ${error.code}`);
      return (data ?? []).map(
        (r): Relationship => ({
          memberId: r.member_id,
          learnerId: r.learner_id,
          relation: r.relation,
          validFrom: new Date(r.valid_from),
          validTo: r.valid_to ? new Date(r.valid_to) : null,
        }),
      );
    },
  };
}
