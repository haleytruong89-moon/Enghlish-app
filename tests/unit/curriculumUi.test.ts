import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
import { CurriculumCard } from "@/components/curriculum/CurriculumCard";
import { curriculumCopy } from "@/lib/copy/vi";
import { buildCards, taughtChoices } from "@/lib/curriculum/shape";
import { TaughtUnitsPicker } from "@/components/curriculum/TaughtUnitsPicker";
import { MapTable } from "@/components/curriculum/MapTable";

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
  it("the map table lists points by name", () => {
    const html = renderToStaticMarkup(createElement(MapTable, {
      units: [{ code: "U7", title: "Passives and causatives", section: "Grammar", page: 54, skipped: false, points: ["bi-dong-nho-tuong-thuat"], missing_points: [], needs_review: false, review_reason: null, flags: [], origin: "ai", ai_index: 6, dropped: false, edit_reason: null }],
      labelOf: { "bi-dong-nho-tuong-thuat": "Bị động, nhờ ai làm, tường thuật" },
    }));
    expect(html).toContain("Bị động, nhờ ai làm, tường thuật");
  });
  it("the session chooser offers the current unit and the next one as chips, the rest in a select (skipped U3 not offered)", () => {
    const html = renderToStaticMarkup(createElement(TaughtUnitsPicker, { choices: taughtChoices([card]), value: [], onChange: () => undefined }));
    expect(html).toContain(`data-testid="taught-${C}-U13"`);
    expect(html).toContain(`data-testid="taught-${C}-U14"`);
    expect(html).not.toContain(`data-testid="taught-${C}-U12"`);
    expect(html).not.toContain(">U3 · Unit 3<");
  });
});
