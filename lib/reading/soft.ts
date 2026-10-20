import type { ReadingSkillsView } from "./types";

/**
 * The "Kỹ năng đọc" table is an add-on of the weak-points page: if reading it fails for any reason (a function that is not applied yet,
 * a database hiccup) the page must still render, with an empty state, instead of a 500. The failure is handed to `onError` (the page logs it).
 */
export async function loadSoft(
  load: () => Promise<ReadingSkillsView>,
  onError: (err: unknown) => void | Promise<void>,
): Promise<ReadingSkillsView | null> {
  try {
    return await load();
  } catch (err) {
    try {
      await onError(err);
    } catch {
      // logging must never break the page
    }
    return null;
  }
}
