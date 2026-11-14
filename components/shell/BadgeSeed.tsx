"use client";
import { seedInboxBadge } from "./InboxBadge";

/** Renders nothing. Hands the number the page already computed to the sidebar badge (no second count). */
export function BadgeSeed({ learnerId, count }: { learnerId: string; count: string | null }) {
  seedInboxBadge(learnerId, count);
  return null;
}
