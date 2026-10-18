import { handleStudentPractice } from "@/lib/practice/handlers";
import { runPracticeRoute } from "@/lib/practice/route";

/** GET /api/student/practice - the signed-in student's practice, "Việc cần ôn" and message (never scores, counts or wrong items). */
export async function GET() {
  return runPracticeRoute("GET /api/student/practice", (deps) => handleStudentPractice(deps));
}
