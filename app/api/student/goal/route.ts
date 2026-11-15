import type { NextRequest } from "next/server";
import { handleProposeGoal } from "@/lib/goal/handlers";
import { runGoalRoute } from "@/lib/goal/route";

/** POST /api/student/goal - the child proposes a number of pieces per week. It starts only after the child's tutor agrees, from the next Monday. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  return runGoalRoute("POST /api/student/goal", (deps) => handleProposeGoal(deps, body));
}
