import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deploy order: the code of S5c may reach production BEFORE migration 0017 is applied (the SQL is applied by the parent afterwards).
 * 0017 is backward compatible with main's code, and this code must be compatible with main's database for the calls that already existed:
 * the new arguments are only sent when they carry something, and the new screen explains itself instead of failing with a 500.
 */
const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/storage/server", () => ({ createFileStorage: () => ({}) }));
vi.mock("@/lib/storage/purge", () => ({ deleteLearnerFolder: async () => 0 }));
vi.mock("@/lib/tutorwork/page", () => ({
  requireLearnerPage: async () => ({ member: { displayName: "Phụ huynh" }, learner: { id: "L1", alias: "Nguyên (thử)", isTest: true, trackId: "B" } }),
}));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("next/link", () => ({ default: (p: { children: React.ReactNode }) => p.children }));

import DeleteLearnerPage from "@/app/learners/[id]/delete/page";
import { purgePage } from "@/lib/copy/vi";
import { createSupabaseReviewStore } from "@/lib/review/supabaseStore";
import { PurgeNeedsMigrationError } from "@/lib/purge/shape";
import { loadPurgePreview } from "@/lib/purge/supabaseStore";
import { createSupabaseTutorWorkStore } from "@/lib/tutorwork/supabaseStore";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: {}, error: null });
});

const noteArgs = (practised: string[]) => ({
  learnerId: "L", sessionDate: "2026-10-18", studied: "x", weakTags: [], message: null, noteForParent: null, rechecks: [],
  practisedTargetIds: practised, supersedes: null, byMemberId: "M", clientId: "c",
});
const offlineArgs = (reason: string | null) => ({
  activityId: "A", provenance: "manual_import" as const, text: "t", durationSec: null, wordCount: null, sessionDate: "2026-10-18",
  assistance: ["none"], byMemberId: "M", clientId: "c", backdateReason: reason,
});

describe("the new SQL arguments are only sent when needed (works before AND after 0017)", () => {
  it("lesson note v2: p_practised_target_ids is left out when nothing was practised", async () => {
    await createSupabaseTutorWorkStore().writeSessionNote(noteArgs([]));
    const [name, params] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("eng_write_lesson_note_v2");
    expect(Object.keys(params)).not.toContain("p_practised_target_ids");
    expect(Object.keys(params).sort()).toEqual(["p_by", "p_client_id", "p_learner", "p_message", "p_note_for_parent", "p_rechecks", "p_session_date", "p_studied", "p_supersedes", "p_weak_tags"]);
  });
  it("lesson note v2: sent when skills were practised", async () => {
    await createSupabaseTutorWorkStore().writeSessionNote(noteArgs(["A-L3-CAUSE-S"]));
    expect((rpc.mock.calls[0] as [string, Record<string, unknown>])[1].p_practised_target_ids).toEqual(["A-L3-CAUSE-S"]);
  });
  it("offline attempt: p_backdate_reason is left out without a reason, sent with one", async () => {
    await createSupabaseReviewStore().recordOffline(offlineArgs(null));
    expect(Object.keys((rpc.mock.calls[0] as [string, Record<string, unknown>])[1])).not.toContain("p_backdate_reason");
    await createSupabaseReviewStore().recordOffline(offlineArgs("Nhập từ phiếu giấy pilot"));
    expect((rpc.mock.calls[1] as [string, Record<string, unknown>])[1].p_backdate_reason).toBe("Nhập từ phiếu giấy pilot");
  });
});

describe("the delete screen before 0017 is applied", () => {
  it("loadPurgePreview turns 'function not found' (PGRST202 / 42883) into PurgeNeedsMigrationError, other errors stay errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    await expect(loadPurgePreview("L1")).rejects.toBeInstanceOf(PurgeNeedsMigrationError);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42883", message: "no function" } });
    await expect(loadPurgePreview("L1")).rejects.toBeInstanceOf(PurgeNeedsMigrationError);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    const e = await loadPurgePreview("L1").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(PurgeNeedsMigrationError);
  });

  it("the page shows the Vietnamese 'apply 0017' message instead of throwing, and no delete form", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const html = renderToStaticMarkup(await DeleteLearnerPage({ params: Promise.resolve({ id: "L1" }) }));
    expect(html).toContain('data-testid="purge-needs-migration"');
    expect(html).toContain(purgePage.needsMigration);
    expect(purgePage.needsMigration).toContain("0017");
    expect(html).not.toContain("purge-form");
  });

  it("with 0017 applied the form is shown as before", async () => {
    rpc.mockResolvedValueOnce({ data: { learner_id: "L1", alias: "Nguyên (thử)", is_test: true, counts: { attempts: 2 } }, error: null });
    const html = renderToStaticMarkup(await DeleteLearnerPage({ params: Promise.resolve({ id: "L1" }) }));
    expect(html).toContain('data-testid="purge-form"');
    expect(html).not.toContain("purge-needs-migration");
  });

  it("any other failure still surfaces as an error (500, logged)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(DeleteLearnerPage({ params: Promise.resolve({ id: "L1" }) })).rejects.toThrow(/eng_purge_preview failed/);
  });
});
