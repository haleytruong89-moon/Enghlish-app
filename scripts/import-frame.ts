/**
 * npm run db:import-frame -- <file.json> --family=real|test|<family id>
 *
 * Nhập một KHUNG ĐỀ (số câu → phần → nhãn, không có chữ đề thi) từ content/frames/<file>.json vào một gia đình.
 * Chạy lại cùng nội dung: không đổi gì. Nội dung đã sửa: thành phiên bản MỚI (bản cũ giữ nguyên, kết quả cũ vẫn trỏ về bản đã dùng).
 * Không đụng dữ liệu của em nào. Cần DATABASE_URL. Cũng chạy qua workflow "Import test frame" (gõ IMPORT).
 */
import { Client } from "pg";
import { importFrameFile, resolveFamily } from "./lib/frameImport";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const familyArg = args.find((a) => a.startsWith("--family="))?.split("=")[1];
  if (!file) throw new Error("Cách dùng: npm run db:import-frame -- <file.json> --family=real|test|<family id>");
  const family = resolveFamily(familyArg);
  if (!family) throw new Error("Thiếu hoặc sai --family (real, test, hoặc id của gia đình).");

  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  try {
    const r = await importFrameFile(db, family, file);
    const text =
      r.action === "created"
        ? "Đã nhập khung đề mới"
        : r.action === "new_version"
          ? "Nội dung đã đổi — đã tạo phiên bản MỚI của khung đề (bản cũ giữ nguyên)"
          : "Khung đề đã có đúng nội dung này — không đổi gì";
    console.log(`${text}: "${r.title}" · ${r.total} câu · track ${r.track}`);
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
