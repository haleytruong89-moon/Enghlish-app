import { readFileSync } from "node:fs";
import path from "node:path";
import type { StudioContext } from "@/lib/studio/context";

/** The AI-shaped fixture shared by unit, DB and e2e tests (and AI_FAKE). */
export const FAKE_EXTRACT = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/studio/fake-extract.json"), "utf8")) as unknown;

/** The review context of "Nguyên (thử)" as the fixture needs it (tags of track B used by the fixture + the QA skills of B-v1). */
export const CTX_B: StudioContext = {
  tags: [
    { key: "wish-would-rather", label: "Wish / would rather", reading: false, near: true, related: [], group: null },
    { key: "modal-suy-doan", label: "Động từ khuyết thiếu suy đoán", reading: false, near: true, related: [], group: null },
    { key: "cum-dong-tu", label: "Cụm động từ", reading: false, near: true, related: [], group: null },
    { key: "dang-tu", label: "Dạng từ", reading: false, near: true, related: [], group: null },
    { key: "bi-dong-nho-tuong-thuat", label: "Bị động tường thuật", reading: false, near: true, related: [], group: null },
    { key: "tu-vung-ngu-canh", label: "Từ vựng theo ngữ cảnh", reading: false, near: true, related: [], group: null },
    { key: "thanh-ngu", label: "Thành ngữ", reading: false, near: false, related: [], group: null },
    { key: "doc-main-idea", label: "Main Idea — Ý chính", reading: true, near: true, related: [], group: "Kỹ năng đọc" },
    { key: "doc-inference", label: "Make Inferences — Suy luận", reading: true, near: true, related: ["B-T2-ASSUME-R"], group: "Kỹ năng đọc" },
  ],
  skills: [
    { id: "B-T1-EXAM-R", label: "Đọc hiểu đoạn văn dạng đề thi vào 10" },
    { id: "B-L2-CLOZE", label: "Chọn từ, dạng từ đúng trong ngữ cảnh (điền đoạn văn)" },
    { id: "B-T1-ARG-R", label: "Đọc lập luận" },
    { id: "B-T2-ASSUME-R", label: "Nhận ra giả định" },
    { id: "B-T5-DATAOP", label: "Số liệu và ý kiến" },
  ],
};
