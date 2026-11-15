import type { NextRequest } from "next/server";
import { handleWithdrawGoal } from "@/lib/goal/handlers";
import { runGoalRoute } from "@/lib/goal/route";

/** POST /api/student/goal/withdraw - the child takes back a proposal nobody has answered yet. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  return runGoalRoute("POST /api/student/goal/withdraw", (deps) => handleWithdrawGoal(deps, body));
}
