"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** When the child comes back to this tab (from a link, another app), re-read the page so new work / words from the adult show up. */
export function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [router]);
  return null;
}
