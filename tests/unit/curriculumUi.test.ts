import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
import { CurriculumCard } from "@/components/curriculum/CurriculumCard";
import { curriculumCopy } from "@/lib/copy/vi";
import { buildCards } from "@/lib/curriculum/shape";

const L = "b0000000-0000-4000-8000-000000000001";
const C = "c0000000-0000-4000-8000-0000000000c1";
const units = Array.from({ length: 26 }, (_, i) => ({ version_id: "v1", code: `U${i + 1}`, ord: i + 1, title: `Unit ${i + 1}`, section: null, page: null, skipped: false }));
const ev = (code: string, status: string, n: number) => ({ id: `e${String(n).padStart(3, "0")}`, curriculum_id: C, unit_code: code, status, created_at: `2026-11-0${1 + Math.floor(n / 10)}T0${n % 10}:00:00Z` });
const rows = {
  curricula: [{ id: C, title: "Destination C1&C2", level_note: "C1–C2", created_at: "2026-11-08T00:00:00Z" }],
  versions: [{ id: "v1", curriculum_id: C, version: 1, status: "approved", error_code: null }],
  units,
  points: [{ version_id: "v1", code: "U7", tag_key: "bi-dong-nho-tuong-thuat", ord: 1 }],
  events: [...Array.from({ length: 12 }, (_, i) => ev(`U${i + 1}`, "done", i + 1)), ev("U3", "skipped", 13), ev("U13", "in_progress", 14)],
};

describe("Giáo trình screens", () => {
  const card = buildCards(rows)[0]!;
  it("the card shows the level note, 'đang học đến' U13 and coverage 11/25 · 44 %, and links to the map and unit statuses", () => {
    const html = renderToStaticMarkup(createElement(CurriculumCard, { card, learnerId: L, aiAllowed: true, aiReason: null }));
    expect(html).toContain("C1–C2");
    expect(html).toContain(curriculumCopy.currentLine("U13", "Unit 13"));
    expect(html).toContain(curriculumCopy.coverage(11, 25, 44));
    expect(html).toContain(`href="/curricula/versions/v1"`);
    expect(html).toContain(`href="/learners/${L}/curricula/${C}"`);
    expect(html).toContain(curriculumCopy.loadToc);
  });
});
