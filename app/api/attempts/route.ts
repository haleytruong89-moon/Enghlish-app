import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSubmit } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** POST /api/attempts — submit work. Idempotent on client_submission_id; the reply is a receipt, never a result. */
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  return runWorkRoute("POST /api/attempts", (deps) => handleSubmit(deps, body));
}
