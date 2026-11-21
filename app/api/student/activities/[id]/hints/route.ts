import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createToolCaller } from "@/lib/ai/anthropic";
import { TUTOR_NOTICE_VERSION } from "@/lib/ai/config";
import { loadPrompt } from "@/lib/ai/prompts";
import { apiErrors, tutorCopy } from "@/lib/copy/vi";
import { readJson } from "@/lib/inquiries/route";
import { logAppError } from "@/lib/ops/logAppError";
import { createUserClient } from "@/lib/supabase/server";
import { tutorModels } from "@/lib/tutor/config";
import { handleStudentHint } from "@/lib/tutor/handler";
import { CHECK_PROMPT, HINT_PROMPT } from "@/lib/tutor/prompt";
import { createSupabaseTutorStore } from "@/lib/tutor/supabaseStore";

export const maxDuration = 60;

/** POST /api/student/activities/:id/hints — one turn of the AI tutor (E1). The child only; the answer never leaves the server. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const route = "POST /api/student/activities/[id]/hints";
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const body = await readJson(request);
    const caller = createToolCaller();
    const result = await handleStudentHint(
      {
        user: user ? { id: user.id } : null,
        store: createSupabaseTutorStore(),
        noticeVersion: TUTOR_NOTICE_VERSION,
        call: (c) => caller(c, { timeoutMs: 45_000 }),
        prompts: { hint: loadPrompt(HINT_PROMPT.file), check: loadPrompt(CHECK_PROMPT.file) },
        models: tutorModels(),
        copy: tutorCopy,
      },
      id,
      body,
    );
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
