/**
 * npm run db:seed-throwaway
 *
 * Adds ONE extra TEST learner (name "Em thử xóa xxxxxx", Track A, no login of its own) to the TEST family, with a parent
 * relationship, the A-v1 skill set, one quick result and one lesson note - so you can try the "Xóa dữ liệu của em" screen on a
 * child you do not mind losing, without touching "An (thử)" / "Nguyên (thử)" or anything real.
 *
 * Refuses to run unless the test family exists and holds test learners only. Prints the created name (never a secret).
 * Needs DATABASE_URL only. Every run creates a new learner (they are meant to be deleted).
 */
import { Client } from "pg";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";
import { seedThrowawayLearner } from "./lib/seed";

async function main() {
  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  try {
    const { alias } = await seedThrowawayLearner(db);
    console.log(`Đã tạo em thử để xóa: ${alias}`);
    console.log("Cách thử: đăng nhập phụ huynh THỬ (thu-phuhuynh) → Trang chủ → thẻ của em này → 'Xóa dữ liệu của em' → gõ đúng tên trên.");
    console.log("Chỉ xóa em có tên 'Em thử xóa …'; đừng dùng An (thử) / Nguyên (thử).");
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
