import "server-only";
import { allowRealLearners } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth/requireAccess";
import { visibleLearners, type LearnerSummary } from "./visible";

export type HomeData =
  | { kind: "signed-out" }
  | { kind: "no-member"; email: string | null }
  | { kind: Role; displayName: string; learners: LearnerSummary[] };

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
export async function loadHome(): Promise<HomeData> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "signed-out" };

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("role, display_name")
    .eq("user_id", user.id)
    .maybeSingle<{ role: Role; display_name: string }>();
  if (memberError) throw new Error(`members lookup failed: ${memberError.code}`);
  if (!member) return { kind: "no-member", email: user.email ?? null };

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

  return { kind: member.role, displayName: member.display_name, learners };
}
