"use client";
import { useEffect } from "react";
import { announceInboxBadge, seedInboxBadge } from "./InboxBadge";

/** Renders nothing. Hands the number the page already computed to the sidebar badge (no second count). */
export function BadgeSeed({ learnerId, count }: { learnerId: string; count: string | null }) {
  seedInboxBadge(learnerId, count); // silent write during render: the badge's own effect (same commit) then finds it and does not fetch
  useEffect(() => announceInboxBadge(), [learnerId, count]);
  return null;
}
