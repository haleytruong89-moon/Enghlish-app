// lib/import/load.ts
import "server-only";
import { loadPickerMap } from "@/lib/skillmap/load";
import { createFileStorage } from "@/lib/storage/server";
import { getAuthUser, getMemberByUserId } from "@/lib/auth/session";
import { loadTags } from "@/lib/tutorwork/load";
import { buildReadContext, type ReadContext } from "./context";
import { isMissingFunction } from "@/lib/engine/runner";
import { allowRealLearners } from "@/lib/env";
import { handleGetImport, type ImportDeps } from "./handlers";
import { parseImportPending, type ImportPendingItem } from "./pending";
import type { ImportPageData } from "./shape";
import { createSupabaseImportStore } from "./supabaseStore";

/** The closed list of one child (call only after requireAccess / requireLearnerPage). */
export async function loadReadContext(learnerId: string, trackId: string): Promise<ReadContext> {
  const [map, tags] = await Promise.all([loadPickerMap(learnerId), loadTags(trackId)]);
  return buildReadContext(map, tags);
}

/** The page calls the same handler as GET /api/imports/:id (one access path). No AI and no background job from a page. */
export async function loadImportPage(batchId: string): Promise<{ kind: "ok"; data: ImportPageData } | { kind: "login" } | { kind: "not-found" }> {
  const user = await getAuthUser();
  // Warm the per-request member cache while the guard looks up the record's child; requireAccess then reuses the same read.
  if (user) void getMemberByUserId(user.id).catch(() => undefined);
  const deps: ImportDeps = {
    user,
    store: createSupabaseImportStore(),
    storage: createFileStorage(),
    schedule: () => undefined,
    loadContext: loadReadContext,
    getAi: () => {
      throw new Error("no AI from a page");
    },
    docxToText: async () => "",
  };
  const r = await handleGetImport(deps, batchId);
  if (r.status === 200) return { kind: "ok", data: r.body as ImportPageData };
  if (r.status === 401) return { kind: "login" };
  return { kind: "not-found" };
}

/** Unfinished imports for this staff member (call only after authorizeStaffPage / the child's page gate). null = migration 0027 not applied yet. */
export async function loadImportPending(memberId: string): Promise<ImportPendingItem[] | null> {
  try {
    return parseImportPending(await createSupabaseImportStore().pending({ byMemberId: memberId, allowReal: allowRealLearners() }));
  } catch (err) {
    if (isMissingFunction(err)) return null;
    throw err;
  }
}
