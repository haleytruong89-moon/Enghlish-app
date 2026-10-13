import { runWorkRoute } from "@/lib/work/route";
import { handleStudentHome } from "@/lib/work/handlers";

/** GET /api/student/home — the signed-in student's released steps (never answers, results or scores). */
export async function GET() {
  return runWorkRoute("GET /api/student/home", (deps) => handleStudentHome(deps));
}
