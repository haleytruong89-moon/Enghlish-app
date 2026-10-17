import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleStudentUploadUrl } from "@/lib/practice/handlers";
import { runPracticeRoute } from "@/lib/practice/route";

/** POST /api/student/files - a one-time upload link for a screenshot / photo for one of the student's own assignments. */
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  return runPracticeRoute("POST /api/student/files", (deps) => handleStudentUploadUrl(deps, body));
}
