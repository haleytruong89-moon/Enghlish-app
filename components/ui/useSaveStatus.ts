"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { isDirty, snapshot, type SaveState } from "@/lib/ui/saveStatus";
import { register, unregister } from "@/lib/ui/unsavedGuard";

type SaveResult = { ok: true; savedAt?: string } | { ok: false };

/**
 * Tracks one editable value: dirty (differs from what was last saved), saving, saved at hh:mm (Vietnam time), error.
 * While dirty it blocks closing / reloading the tab (beforeunload) and registers with the leave-page guard used by GuardedLink.
 * `resetKey`: change it when an edit session starts or ends, so the value shown then counts as saved.
 * `run(save)` returns true when the save worked; the saved value is the one at the moment `run` was called.
 */
export function useSaveStatus<T>(value: T, opts: { savedAt?: string | null; resetKey?: string | number } = {}) {
  const current = snapshot(value);
  const [baseline, setBaseline] = useState(current);
  const [phase, setPhase] = useState<SaveState["phase"]>(opts.savedAt ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState<string | null>(opts.savedAt ?? null);
  // When the editing session changes (a card opens or closes), what is on screen becomes the new "saved" state. Done while rendering
  // (React's documented way to adjust state to a prop), so there is no frame where a fresh form looks edited.
  const [seenKey, setSeenKey] = useState(opts.resetKey);
  if (seenKey !== opts.resetKey) {
    setSeenKey(opts.resetKey);
    setBaseline(current);
    if (phase === "error") setPhase("idle");
  }
  const state: SaveState = { phase, savedAt, baseline, current };
  const dirty = isDirty(state);

  const dirtyRef = useRef(dirty);
  const currentRef = useRef(current);
  useEffect(() => {
    dirtyRef.current = dirty;
    currentRef.current = current;
  });
  const id = useId();

  useEffect(() => {
    register(id, () => dirtyRef.current);
    return () => unregister(id);
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const block = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", block);
    return () => window.removeEventListener("beforeunload", block);
  }, [dirty]);

  const run = useCallback(async (save: () => Promise<SaveResult>): Promise<boolean> => {
    const at = currentRef.current;
    setPhase("saving");
    let res: SaveResult;
    try {
      res = await save();
    } catch {
      res = { ok: false };
    }
    if (res.ok) {
      setBaseline(at);
      setSavedAt(res.savedAt ?? new Date().toISOString());
      setPhase("saved");
      return true;
    }
    setPhase("error");
    return false;
  }, []);

  /** For calls that already return `{ ok }` (postJson, sendJson): `const r = await track(() => postJson(...))` - same result back, status updated. */
  const track = useCallback(
    async <R extends { ok: boolean }>(call: () => Promise<R>): Promise<R> => {
      let out: R | undefined;
      await run(async () => {
        out = await call();
        return out.ok ? { ok: true } : { ok: false };
      });
      return out as R;
    },
    [run],
  );

  return { state, dirty, run, track };
}
