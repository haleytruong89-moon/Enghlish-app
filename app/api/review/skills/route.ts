// app/api/review/skills/route.ts
import { handleSkillInbox } from "@/lib/skills/handlers";
import { runSkillRoute } from "@/lib/skills/route";

/** GET /api/review/skills - open skill proposals and ⚑ of the children this person may see (Hộp duyệt → tab Kỹ năng; staff only). */
export async function GET() {
  return runSkillRoute("GET /api/review/skills", (deps) => handleSkillInbox(deps));
}
