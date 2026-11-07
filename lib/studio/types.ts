// lib/studio/types.ts
/** Typed views of the Studio functions of migration 0024 (camelCase, already validated by shape.ts). */
import type { GateState } from "@/lib/ai/cap";
import type { StudioContext } from "./context";
import type { StudioDraft } from "./schema";
import type { DraftSummary } from "./summary";
import type { Issue } from "./validate";

export type DraftStatus = "extracting" | "ai_failed" | "draft" | "approved" | "discarded";
export type DraftView = {
  id: string; learnerId: string; familyId: string; trackId: string; title: string; status: DraftStatus; errorCode: string | null;
  payload: StudioDraft; updatedAt: string; approvedAt: string | null; templateId: string | null; templateVersion: number | null;
  supersedesDraftId: string | null; supersededBy: string | null; stale: boolean;
  testFile: { id: string; mime: string } | null; keyFile: { id: string; mime: string } | null;
  /** Parent only (spec §7); null for a tutor. */
  aiCostUsd: number | null;
  assigned: { instanceId: string; activityId: string; dueOn: string; startOn: string | null; assignedAt: string }[];
};
/** Server-only extra of a draft: where its files are stored (never sent to a browser). */
export type DraftFiles = { test: { path: string; mime: string } | null; key: { path: string; mime: string } | null };
export type DraftListItem = { id: string; title: string; status: DraftStatus; updatedAt: string; templateId: string | null; templateVersion: number | null; superseded: boolean; assigned: number };
export type PendingItem = { itemId: string; n: number; kind: string; stem: string; expected: string | null; accepted: string[]; given: string };
export type PendingAttempt = {
  attemptId: string; learnerId: string; alias: string; isTest: boolean; activityId: string; title: string; submittedAt: string; attemptNo: number;
  waitingDays: number; items: PendingItem[];
};
export type PendingInbox = { count: number; attempts: PendingAttempt[] };
export type StudioReviewView = {
  attemptNo: number; submittedAt: string;
  wrong: { n: number; stem: string; given: string; expected: string | null; explanationVi: string | null }[];
  pending: number[];
};
export type AiSettingsView = {
  enabled: boolean; monthlyCapUsd: number; softCapUsd: number; spentUsd: number; runsMonth: number; softReached: boolean; updatedAt: string | null;
  learners: { id: string; alias: string; isTest: boolean; aiText: boolean | null }[];
};

export type DraftPageData = { draft: DraftView; context: StudioContext; issues: Issue[]; summary: DraftSummary; can_approve: boolean; gate: GateState | null };
