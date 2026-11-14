// lib/import/route.ts
import { deferHook } from "@/lib/engine/defer";
import "server-only";
import { after, NextResponse } from "next/server";
import { createToolCaller } from "@/lib/ai/anthropic";
import { studioModel, studioToolChoice } from "@/lib/ai/config";
import { loadPrompt, READ_ANSWERS_PROMPT } from "@/lib/ai/prompts";
import { apiErrors } from "@/lib/copy/vi";
import { engineHook } from "@/lib/engine/hook";
import { pointHook } from "@/lib/engine/points/hook";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createFileStorage } from "@/lib/storage/server";
import { docxToText } from "@/lib/studio/docx";
import { createUserClient } from "@/lib/supabase/server";
import type { ImportDeps } from "./handlers";
import { loadReadContext } from "./load";
import { createSupabaseImportStore } from "./supabaseStore";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Session → handler → JSON (no-store); 500 logged. The AI read runs in after() (the route that starts it sets maxDuration = 300). */
export async function runImportRoute(routeName: string, run: (deps: ImportDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({
      user,
      store: createSupabaseImportStore(),
      storage: createFileStorage(),
      schedule: (job) => after(job),
      loadContext: loadReadContext,
      // Same model and tool-choice switch as Studio B1 (one priced model, lib/ai/pricing.ts).
      getAi: () => ({ call: createToolCaller(), model: studioModel(), toolChoice: studioToolChoice(), prompt: { text: loadPrompt(READ_ANSWERS_PROMPT.file), version: READ_ANSWERS_PROMPT.version } }),
      docxToText,
      afterPoints: deferHook(pointHook(routeName, userId), { route: routeName, userId }),
      afterSkills: deferHook(engineHook(routeName, userId), { route: routeName, userId }),
      log: (error) => logAppError({ route: routeName, code: "import_read", error, userId }),
    });
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
