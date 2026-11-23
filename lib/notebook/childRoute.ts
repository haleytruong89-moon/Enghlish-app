import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import { createUserClient } from "@/lib/supabase/server";
import { childDbStatus } from "./handlers";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * A child's notebook write (save / remove / restore / rate): the signed-in user's own client calls a 0041 function that finds the child
 * from auth.uid() and refuses anyone else. No service role, no AI.
 */
export async function childRpc(route: string, fn: string, args: Record<string, unknown> | null): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
    if (!args) return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      const s = childDbStatus(error);
      if (s.status === 500) await logAppError({ route, code: error.code ?? "db", error, userId });
      return NextResponse.json({ error: s.error }, { status: s.status, headers: NO_STORE });
    }
    return NextResponse.json(data, { status: 200, headers: NO_STORE });
  } catch (err) {
    await logAppError({ route, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500, headers: NO_STORE });
  }
}
