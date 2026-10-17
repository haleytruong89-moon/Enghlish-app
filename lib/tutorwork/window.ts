/** Pure helpers of the S5b-1 loaders (kept apart from load.ts, which is server-only, so they can be unit-tested). */
import { addDays, daysBetween, todayVn } from "@/lib/inquiries/dates";
import type { WeakWindow } from "./schemas";
import { PARENT_TAG_WAIT_DAYS, type UntaggedItem } from "./types";

/** Start date of a window ("4" / "8" weeks, "all" = from the start). */
export function windowSince(window: WeakWindow, today: string = todayVn()): string | null {
  return window === "all" ? null : addDays(today, -7 * Number(window));
}

/**
 * Wrong items still waiting for a tag. The tutor sees all of them; the parent only those older than PARENT_TAG_WAIT_DAYS
 * (the tutor tags first, the parent is the fallback). Applied on the server, never in the browser.
 */
export function filterUntagged(items: UntaggedItem[], role: "tutor" | "parent", now: Date = new Date()): UntaggedItem[] {
  if (role === "tutor") return items;
  const today = todayVn(now);
  return items.filter((i) => daysBetween(todayVn(new Date(i.createdAt)), today) >= PARENT_TAG_WAIT_DAYS);
}
