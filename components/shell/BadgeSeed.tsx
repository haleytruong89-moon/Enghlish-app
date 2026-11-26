"use client";
import { useEffect } from "react";
import { announceBadge, seedBadge } from "./badgeStore";

/** Renders nothing. Hands the numbers the page already computed to the sidebar (no second count). */
export function BadgeSeed({ learnerId, count, work }: { learnerId: string; count: string | null; work: string | null }) {
  seedBadge(learnerId, { count, work });
  useEffect(() => announceBadge(), [learnerId, count, work]);
  return null;
}
