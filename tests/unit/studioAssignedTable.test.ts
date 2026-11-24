import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioAssignedTable } from "@/components/studio/StudioAssignedTable";
import { studioAssignedCopy as c } from "@/lib/copy/vi";
import type { StudioAssignedRow } from "@/lib/studio/assigned";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const row = (o: Partial<StudioAssignedRow>): StudioAssignedRow => ({
  instanceId: "i1", activityId: "a1", title: "Destination C1 C2", items: 19, startOn: "2026-11-15", dueOn: "2026-11-17", assignedAt: "2026-11-15T01:00:00Z",
  status: "todo", lateDays: null, removedReason: null, attempts: 0, lastAttemptId: null, lastSubmittedAt: null, episodeId: null,
  feedbackGiven: false, feedbackReady: true, units: [], firstResult: null, ...o,
});
const html = (rows: StudioAssignedRow[]) => renderToStaticMarkup(createElement(StudioAssignedTable, { rows }));

describe("Bài làm trên app đã giao: late days, removal", () => {
  it("an overdue unsent test shows 'Quá hạn n ngày' and Gỡ bài", () => {
    const h = html([row({ status: "overdue", lateDays: 7 })]);
    expect(h).toContain(c.overdueDays(7));
    expect(h).toContain('data-late-days="7"');
    expect(h).toContain(`>${c.remove}<`);
  });
  it("a removed test shows Đã gỡ, the reason and Khôi phục, never Gỡ bài", () => {
    const h = html([row({ status: "skipped", removedReason: "Giao trùng bài" })]);
    expect(h).toContain(c.status.skipped);
    expect(h).toContain(c.removedReason("Giao trùng bài"));
    expect(h).toContain(c.restore);
    expect(h).not.toContain(`>${c.remove}<`);
  });
  it("sent work can never be removed", () => {
    for (const status of ["waiting", "checked"] as const) {
      const h = html([row({ status, attempts: 1, lastAttemptId: "t1", lastSubmittedAt: "2026-11-16T02:00:00Z", episodeId: "e1" })]);
      expect(h).not.toContain(c.remove);
      expect(h).not.toContain(c.restore);
    }
  });
});
