import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * POST only (a GET link could be triggered cross-site).
 * Signs out THIS device only (scope "local": this session's refresh token is revoked, other devices stay signed in).
 * supabase-js defaults to "global", which also ended the same person's session on every other device - e.g. a parent
 * signing out on the shared family laptop would sign them out on their phone - and made e2e specs that share a seeded
 * account race each other.
 */
export async function POST(request: NextRequest) {
  const supabase = await createUserClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
