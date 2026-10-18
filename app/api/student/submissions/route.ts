import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleStudentSubmit } from "@/lib/practice/handlers";
import { runPracticeRoute } from "@/lib/practice/route";

/** POST /api/student/submissions - the student sends the screenshot / photos and the two taps for one assignment. */
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  return runPracticeRoute("POST /api/student/submissions", (deps) => handleStudentSubmit(deps, body));
}
