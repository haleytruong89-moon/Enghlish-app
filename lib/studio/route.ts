// lib/studio/route.ts
import "server-only";
import { deferHook } from "@/lib/engine/defer";
import { after, NextResponse } from "next/server";
import { createToolCaller } from "@/lib/ai/anthropic";
import { studioModel, studioToolChoice } from "@/lib/ai/config";
import { loadPrompt, STUDIO_PROMPT } from "@/lib/ai/prompts";
import { apiErrors } from "@/lib/copy/vi";
import { writeHook } from "@/lib/engine/writeHook";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createFileStorage } from "@/lib/storage/server";
import { createUserClient } from "@/lib/supabase/server";
import { docxToText } from "./docx";
import type { StudioDeps } from "./handlers";
import { loadStudioContext } from "./load";
import { createSupabaseStudioStore } from "./supabaseStore";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Session → handler → JSON (no-store); 500 logged. Background jobs run in after() (the route sets maxDuration). */
export async function runStudioRoute(routeName: string, run: (deps: StudioDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({
      user,
      store: createSupabaseStudioStore(),
      storage: createFileStorage(),
      schedule: (job) => after(job),
      loadContext: loadStudioContext,
      getAi: () => ({ call: createToolCaller(), model: studioModel(), toolChoice: studioToolChoice(), prompt: { text: loadPrompt(STUDIO_PROMPT.file), version: STUDIO_PROMPT.version } }),
      docxToText,
      afterWrite: deferHook(writeHook(routeName, userId), { route: routeName, userId }),
      log: (error) => logAppError({ route: routeName, code: "studio_extract", error, userId }),
    });
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
