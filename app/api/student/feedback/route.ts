import { handleStudentFeedback } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** GET /api/student/feedback — the child's feedback rows (no score, verdict or skill code). */
export async function GET() {
  return runWorkRoute("GET /api/student/feedback", (deps) => handleStudentFeedback(deps));
}
