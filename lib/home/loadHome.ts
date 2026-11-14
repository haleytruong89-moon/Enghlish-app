import "server-only";
import { allowRealLearners } from "@/lib/env";
import { cache } from "react";
import { getAuthUser, getMemberByUserId } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth/requireAccess";
import { visibleLearners, type LearnerSummary } from "./visible";

export type HomeData =
  | { kind: "signed-out" }
  | { kind: "no-member"; email: string | null }
  | { kind: Role; displayName: string; memberId: string; learners: LearnerSummary[] };

type LearnerRow = {
  id: string;
  alias: string;
  track_id: "A" | "B";
  status: "active" | "draft";
  is_test: boolean;
  member: { color: string | null } | null;
};

/**
 * Resolve the signed-in user's english.members role and the learners they may see.
 * Uses the USER client: RLS decides scope (student → self, tutor → active relationships,
 * parent → family). ALLOW_REAL_LEARNERS filters on top.
 */
async function loadHomeUncached(): Promise<HomeData> {
  const user = await getAuthUser();
  if (!user) return { kind: "signed-out" };

  const member = await getMemberByUserId(user.id);
  if (!member) return { kind: "no-member", email: user.email ?? null };

  const supabase = await createUserClient();
  const { data: rows, error } = await supabase
    .from("learners")
    .select("id, alias, track_id, status, is_test, member:members!learners_member_id_fkey(color)")
    .returns<LearnerRow[]>();
  if (error) throw new Error(`learners lookup failed: ${error.code}`);

  const learners = visibleLearners(
    (rows ?? []).map((r) => ({
      id: r.id,
      alias: r.alias,
      trackId: r.track_id,
      status: r.status,
      isTest: r.is_test,
      color: r.member?.color ?? null,
    })),
    allowRealLearners(),
  );

  return { kind: member.role, displayName: member.displayName, memberId: member.id, learners };
}

/** Cached per request: the layout and the page of one route share a single read. */
export const loadHome = cache(loadHomeUncached);
