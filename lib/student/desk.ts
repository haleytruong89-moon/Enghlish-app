import "server-only";
import { getAuthUser, getMemberByUserId } from "@/lib/auth/session";
import { loadHome } from "@/lib/home/loadHome";
import { safeColor } from "@/lib/home/visible";
import type { ReviewItem } from "@/lib/levels/types";
import { parseReviewByDomain } from "@/lib/levels/shape";
import { loadStudentPractice } from "@/lib/practice/load";
import type { ReviewPoints, StudentPracticeItem } from "@/lib/practice/types";
import { parseReviewPoints, parseStudentPractice } from "@/lib/practice/shape";
import { createSupabasePracticeStore } from "@/lib/practice/supabaseStore";
import { createUserClient } from "@/lib/supabase/server";
import { parseHistory, parseSeen, parseToday } from "./shape";
import type { HistoryRow, SeenRow, Task } from "./types";

/** W4b · loaders of the child's desk. Every read goes through the USER client and an eng_my_* function (auth.uid() decides; no service role). */

export const DESK_PAGE = { seen: 20, done: 50 } as const;

const MISSING = new Set(["PGRST202", "42883"]);

/** Migration 0032 not applied → the function is missing: null (the page shows one soft line), never an error page. */
async function rpcOrNull<T>(fn: string, args: Record<string, unknown> | undefined, parse: (raw: unknown) => T): Promise<T | null> {
  const { data, error } = await (await createUserClient()).rpc(fn, args);
  if (error) {
    if (error.code && MISSING.has(error.code)) return null;
    throw new Error(`${fn} failed: ${error.code ?? "error"}`);
  }
  return parse(data);
}

export type DeskBase = {
  kind: "ok";
  learnerId: string;
  alias: string;
  color: string;
  isTest: boolean;
  /** The first page of "Đã xem" (null = 0032 not applied); the shell counts the "Mới" ones on this device from it. */
  seenFirst: SeenRow[] | null;
};

export type DeskBaseResult = DeskBase | { kind: "login" } | { kind: "not-found" };

/** The signed-in child of this request (staff and everyone else: not-found) + the first page of "Đã xem" for the tab badge. */
export async function loadDeskBase(): Promise<DeskBaseResult> {
  const user = await getAuthUser();
  if (!user) return { kind: "login" };
  const member = await getMemberByUserId(user.id);
  if (!member || member.role !== "student") return { kind: "not-found" };
  const home = await loadHome();
  if (home.kind !== "student") return { kind: "not-found" };
  const me = home.learners[0];
  if (!me) return { kind: "not-found" };
  const seenFirst = await rpcOrNull("eng_my_seen", { p_before: null, p_limit: DESK_PAGE.seen }, parseSeen);
  return { kind: "ok", learnerId: me.id, alias: me.alias, color: safeColor(me.color), isTest: me.isTest, seenFirst };
}

export type TodayData = {
  /** null = 0032 not applied. */
  tasks: Task[] | null;
  /** Link / PDF work the child opens and sends from the same page (the existing cards). */
  practice: StudentPracticeItem[];
  review: ReviewPoints | null;
};

export type TodayResult = ({ kind: "ok" } & TodayData) | { kind: "login" } | { kind: "not-found" };

export async function loadToday(): Promise<TodayResult> {
  const [tasks, practice] = await Promise.all([rpcOrNull("eng_my_today", undefined, parseToday), loadStudentPractice()]);
  if (practice.kind === "login") return { kind: "login" };
  if (practice.kind === "not-found") return { kind: "not-found" };
  return { kind: "ok", tasks, practice: practice.items, review: practice.review };
}

export async function loadHistory(before: string | null): Promise<HistoryRow[] | null> {
  return rpcOrNull("eng_my_history", { p_before: before, p_limit: DESK_PAGE.done }, parseHistory);
}

export async function loadSeen(before: string | null): Promise<SeenRow[] | null> {
  return rpcOrNull("eng_my_seen", { p_before: before, p_limit: DESK_PAGE.seen }, parseSeen);
}

/** "Việc cần ôn" grouped by domain (SM-2): labels and domain names only. A failed read leaves it out. */
export async function loadReviewByDomain(): Promise<ReviewItem[] | null> {
  try {
    const { data, error } = await (await createUserClient()).rpc("eng_my_review_by_domain");
    return error ? null : parseReviewByDomain(data);
  } catch {
    return null;
  }
}

/** One link / PDF assignment of the child (the existing card), for /done/[ref]; the database function checks it is the child's own. */
export async function loadPracticeItem(assignmentId: string): Promise<StudentPracticeItem | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignmentId)) return null;
  try {
    const raw = await createSupabasePracticeStore().myPractice(assignmentId);
    return parseStudentPractice(raw).find((i) => i.assignmentId === assignmentId) ?? null;
  } catch {
    return null;
  }
}

/** The labels to review + the tutor's message of the latest session note (existing function, unchanged). A failed read leaves it out. */
export async function loadReviewPoints(): Promise<ReviewPoints | null> {
  try {
    return parseReviewPoints(await createSupabasePracticeStore().myReviewPoints());
  } catch {
    return null;
  }
}
