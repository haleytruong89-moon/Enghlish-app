// lib/curriculum/route.ts
import "server-only";
import { after, NextResponse } from "next/server";
import { createToolCaller } from "@/lib/ai/anthropic";
import { studioModel, studioToolChoice } from "@/lib/ai/config";
import { CURRICULUM_PROMPT, loadPrompt } from "@/lib/ai/prompts";
import { apiErrors } from "@/lib/copy/vi";
import { pointHook } from "@/lib/engine/points/hook";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createFileStorage } from "@/lib/storage/server";
import { createUserClient } from "@/lib/supabase/server";
import type { CurriculumDeps } from "./handlers";
import { loadTocContext } from "./load";
import { createSupabaseCurriculumStore } from "./supabaseStore";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Session → handler → JSON (no-store); 500 logged. The AI job runs in after() (routes that start it set maxDuration = 300). */
export async function runCurriculumRoute(routeName: string, run: (deps: CurriculumDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({
      user,
      store: createSupabaseCurriculumStore(),
      storage: createFileStorage(),
      schedule: (job) => after(job),
      loadContext: loadTocContext,
      afterPoints: pointHook(routeName, userId),
      // Same model and tool-choice switch as Studio B1 (one priced model, lib/ai/pricing.ts).
      getAi: () => ({ call: createToolCaller(), model: studioModel(), toolChoice: studioToolChoice(), prompt: { text: loadPrompt(CURRICULUM_PROMPT.file), version: CURRICULUM_PROMPT.version } }),
      log: (error) => logAppError({ route: routeName, code: "curriculum_toc", error, userId }),
    });
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
