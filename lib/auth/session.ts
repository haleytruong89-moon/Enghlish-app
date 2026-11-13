import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import type { Member, Role } from "./requireAccess";

type MemberRow = { id: string; user_id: string; family_id: string; role: Role; display_name: string };

export const toMember = (r: MemberRow): Member => ({
  id: r.id,
  userId: r.user_id,
  familyId: r.family_id,
  role: r.role,
  displayName: r.display_name,
});

/** Builds the two readers around an injectable memo, so tests can prove "one read per request" without React's request scope. */
export function makeSession(deps: {
  memo: <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => (...a: A) => Promise<R>;
  fetchUser: () => Promise<User | null>;
  fetchMember: (userId: string) => Promise<Member | null>;
}) {
  return {
    getAuthUser: deps.memo(() => deps.fetchUser()),
    getMemberByUserId: deps.memo((userId: string) => deps.fetchMember(userId)),
  };
}

async function fetchUser(): Promise<User | null> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

async function fetchMember(userId: string): Promise<Member | null> {
  const { data, error } = await createAdminClient()
    .from("members")
    .select("id, user_id, family_id, role, display_name")
    .eq("user_id", userId)
    .maybeSingle<MemberRow>();
  if (error) throw new Error(`members lookup failed: ${error.code}`);
  return data ? toMember(data) : null;
}

const session = makeSession({ memo: (fn) => cache(fn) as typeof fn, fetchUser, fetchMember });

/** One `supabase.auth.getUser()` per request (layout and page of the same route share it). Server components / loaders only. */
export const getAuthUser = session.getAuthUser;
/** One `members` row read per request and user id. */
export const getMemberByUserId = session.getMemberByUserId;
