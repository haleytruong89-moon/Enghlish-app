import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createFileStorage } from "@/lib/storage/server";
import { createUserClient } from "@/lib/supabase/server";
import type { PracticeDeps } from "./handlers";
import { createSupabasePracticeStore } from "./supabaseStore";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Shared glue for the PR B route files: session → handler → JSON (no-store), 500 logged. */
export async function runPracticeRoute(routeName: string, run: (deps: PracticeDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  const { result, error } = await execute(routeName, run);
  if (error) return error;
  return NextResponse.json((result as HandlerResult).body, { status: (result as HandlerResult).status, headers: NO_STORE });
}

/**
 * Like runPracticeRoute for the routes that hand a browser to a stored file: a 200 result `{url}` becomes a 302 to that fresh link
 * (so a page can show `<img src="/api/files/…">` and the link is made at the moment of viewing, never stored in a page).
 */
export async function runFileRedirectRoute(routeName: string, run: (deps: PracticeDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  const { result, error } = await execute(routeName, run);
  if (error) return error;
  const r = result as HandlerResult;
  const url = (r.body as { url?: unknown } | null)?.url;
  if (r.status === 200 && typeof url === "string") return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

async function execute(routeName: string, run: (deps: PracticeDeps) => Promise<HandlerResult>): Promise<{ result?: HandlerResult; error?: NextResponse }> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    return { result: await run({ user, store: createSupabasePracticeStore(), storage: createFileStorage() }) };
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return { error: NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 }) };
  }
}
