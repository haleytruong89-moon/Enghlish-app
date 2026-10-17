import type { NextRequest } from "next/server";
import { handleStudentFile } from "@/lib/practice/handlers";
import { runFileRedirectRoute } from "@/lib/practice/route";

/** GET /api/student/practice/:aid/file - redirects the student to a fresh 5-minute link of the PDF of their own assignment. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ aid: string }> }) {
  const { aid } = await ctx.params;
  return runFileRedirectRoute("GET /api/student/practice/[aid]/file", (deps) => handleStudentFile(deps, aid));
}
