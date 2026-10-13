import "server-only";
import { NextResponse } from "next/server";
import { logAppError } from "@/lib/ops/logAppError";
import { apiErrors } from "@/lib/copy/vi";
import { createUserClient } from "@/lib/supabase/server";
import type { HandlerDeps, HandlerResult } from "./handlers";
import { createSupabaseInquiryStore } from "./supabaseStore";

/** Shared glue for the four S2 route files: session → handler → JSON (no-store), 500 logged. */
export async function runRoute(
  routeName: string,
  run: (deps: HandlerDeps) => Promise<HandlerResult>,
): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({ user, store: createSupabaseInquiryStore() });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}

/** Body of a POST; anything that is not JSON becomes `undefined` (the handler answers 400). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
