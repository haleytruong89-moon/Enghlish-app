"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { isDirty, snapshot, type SaveState } from "@/lib/ui/saveStatus";
import { register, unregister } from "@/lib/ui/unsavedGuard";

type SaveResult = { ok: true; savedAt?: string } | { ok: false };

/**
 * Tracks one editable value: dirty (differs from what was last saved), saving, saved at hh:mm (Vietnam time), error.
 * While dirty it blocks closing / reloading the tab (beforeunload) and registers with the leave-page guard used by GuardedLink.
 * `run(save)` returns true when the save worked; the saved value is the one at the moment `run` was called.
 */
export function useSaveStatus<T>(value: T, opts: { savedAt?: string | null } = {}) {
  const current = snapshot(value);
  const [baseline, setBaseline] = useState(current);
  const [phase, setPhase] = useState<SaveState["phase"]>(opts.savedAt ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState<string | null>(opts.savedAt ?? null);
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

  return { state, dirty, run };
}
