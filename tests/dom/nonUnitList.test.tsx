import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NonUnitList } from "@/components/curriculum/NonUnitList";
import { VersionReview } from "@/components/curriculum/VersionReview";
import { saveStatusCopy } from "@/lib/copy/vi";
import { buildTocContext } from "@/lib/curriculum/context";
import { normalizeToc } from "@/lib/curriculum/normalize";
import { relatedUnits } from "@/lib/curriculum/rows";
import { aiTocSchema } from "@/lib/curriculum/schema";
import type { VersionPageData } from "@/lib/curriculum/shape";
import { rowsToResolve, validateCurriculum } from "@/lib/curriculum/validate";
import type { TagInfo } from "@/lib/tutorwork/types";
import { fixtureMap } from "../unit/fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
afterEach(cleanup);

const TOC = aiTocSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/curriculum/fake-toc.json"), "utf8")));
const tags: TagInfo[] = ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu", "cau-dieu-kien-dao-ngu"].map((key) => ({ key, label: key, group: null, custom: false }));
const map = fixtureMap();
const ctx = buildTocContext(map, tags);
const payload = normalizeToc(TOC, ctx);
const L = "b0000000-0000-4000-8000-000000000001";
const issues = validateCurriculum(payload, ctx);
const data: VersionPageData = {
  version: { id: "v1", curriculumId: "c1", learnerId: L, title: "Destination", levelNote: null, version: 1, source: "ai", status: "draft", payload, aiPayload: payload, errorCode: null, updatedAt: "2026-11-13 03:00:00+00", approvedAt: null, review: null, stale: false, aiCostUsd: null },
  track_id: "B", context: ctx, issues, rows_to_resolve: rowsToResolve(issues), can_approve: false, is_tutor: true, stats: null,
};
const status = () => screen.getByTestId("save-status").textContent;

describe("VersionReview: 'Không phải Unit' / 'Đưa về Unit' in the draft", () => {
  it("marking U5 as 'not a Unit' moves it to the list below and shows 'Có thay đổi chưa lưu'; bringing it back restores the row", () => {
    render(<VersionReview initial={data} map={map} tags={tags} learnerId={L} />);
    const before = payload.ignored.length;
    expect(screen.getByTestId("review-ignored").querySelectorAll("li")).toHaveLength(before);
    expect(screen.getByTestId("row-U5")).toBeTruthy();
    expect(status()).toMatch(/^✓ Đã lưu lúc/); // the saved draft's time
    fireEvent.change(screen.getByTestId("row-U5-notunit"), { target: { value: "review" } });
    expect(screen.queryByTestId("row-U5")).toBeNull();
    expect(screen.getByTestId("review-ignored").querySelectorAll("li")).toHaveLength(before + 1);
    expect(status()).toBe(saveStatusCopy.dirty);
    fireEvent.click(screen.getByTestId(`ignored-to-unit-${before}`));
    expect(screen.getByTestId("row-U5")).toBeTruthy();
    expect(screen.getByTestId("review-ignored").querySelectorAll("li")).toHaveLength(before);
  });

  it("'Đưa về Unit' on 'Review 2' makes a Unit that needs a look", () => {
    render(<VersionReview initial={data} map={map} tags={tags} learnerId={L} />);
    const k = payload.ignored.findIndex((r) => r.label.startsWith("Review 2"));
    fireEvent.click(screen.getByTestId(`ignored-to-unit-${k}`));
    const title = screen.getByDisplayValue(/^Review 2/);
    expect(screen.getByTestId("review-needs").contains(title)).toBe(true);
    expect(status()).toBe(saveStatusCopy.dirty);
  });

  it("the list is open at once when it holds a Progress Test, and the test row has its badge", () => {
    render(<VersionReview initial={data} map={map} tags={tags} learnerId={L} />);
    expect((screen.getByTestId("review-ignored") as HTMLDetailsElement).open).toBe(true);
    const k = payload.ignored.findIndex((r) => r.label.startsWith("Progress Test 1"));
    expect(screen.getByTestId(`ignored-test-${k}`)).toBeTruthy();
  });
});

describe("NonUnitList in an approved version", () => {
  it("each row offers 'Tạo bài từ đề' and 'Giao bài luyện' with the prepared links, and no 'Đưa về Unit'", () => {
    render(
      <NonUnitList
        rows={payload.ignored}
        mode="approved"
        related={payload.ignored.map((_, i) => relatedUnits(payload, i))}
        links={payload.ignored.map((_, i) => ({ studio: `/studio/new?learner=${L}&i=${i}`, assign: `/learners/${L}/assign?i=${i}` }))}
      />,
    );
    const row = screen.getByTestId("ignored-row-1");
    expect(within(row).getByTestId("ignored-studio-1").getAttribute("href")).toBe(`/studio/new?learner=${L}&i=1`);
    expect(within(row).getByTestId("ignored-assign-1").getAttribute("href")).toBe(`/learners/${L}/assign?i=1`);
    expect(row.textContent).toContain("Ôn: Unit 3–4");
    expect(screen.queryByTestId("ignored-to-unit-1")).toBeNull();
  });
});
