import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSendAppFeedback } from "@/lib/workdesk/handlers";
import { runWorkdeskRoute } from "@/lib/workdesk/route";

/** POST /api/feedback - a tutor or parent sends app feedback to the family. */
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  return runWorkdeskRoute("POST /api/feedback", (deps) => handleSendAppFeedback(deps, body));
}
