"use client";

import { useSyncExternalStore } from "react";
import { readOpened } from "@/lib/student/seenMemo";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * When the child last opened "Đã xem" ON THIS DEVICE: a time (ISO), null = never, undefined = on the server / during hydration (no marks yet).
 * localStorage only; nothing is sent anywhere (plan Q21).
 */
export function useLastOpened(learnerId: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => readOpened(window.localStorage, learnerId),
    () => undefined,
  );
}
