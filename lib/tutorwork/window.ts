/** Pure helpers of the S5b-1 loaders (kept apart from load.ts, which is server-only, so they can be unit-tested). */
import { addDays, daysBetween, todayVn } from "@/lib/inquiries/dates";
import type { WeakWindow } from "./schemas";
import { PARENT_TAG_WAIT_DAYS, type UntaggedItem } from "./types";

/** Start date of a window ("4" / "8" weeks, "all" = from the start). */
export function windowSince(window: WeakWindow, today: string = todayVn()): string | null {
  return window === "all" ? null : addDays(today, -7 * Number(window));
}

/**
 * Wrong items still waiting for a tag, as the viewer may see them. The tutor sees all of them. The parent sees at once what she recorded
 * herself, and what the tutor recorded only after PARENT_TAG_WAIT_DAYS (the tutor tags first, the parent is the fallback).
 * Applied on the server, never in the browser. Each item is marked `own` when the viewer recorded it.
 */
export function filterUntagged(items: UntaggedItem[], viewer: { role: "tutor" | "parent"; memberId: string }, now: Date = new Date()): UntaggedItem[] {
  const today = todayVn(now);
  return items
    .map((i) => ({ ...i, own: i.recordedByMember === viewer.memberId }))
    .filter((i) => viewer.role === "tutor" || i.own || daysBetween(todayVn(new Date(i.createdAt)), today) >= PARENT_TAG_WAIT_DAYS);
}
