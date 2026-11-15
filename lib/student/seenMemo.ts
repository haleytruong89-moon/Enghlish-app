/**
 * W4b · the "Mới" mark on the "Đã xem" tab (plan Q21, decided "as proposed"): remembered ON THIS DEVICE (localStorage), per child id.
 * Nothing is sent to the server: "when did the child open the tab" would be a behaviour log (DOMAIN §1). iPad and laptop may differ. Pure.
 */
export const SEEN_MEMO_PREFIX = "los.seen-opened.";

export const seenMemoKey = (learnerId: string): string => `${SEEN_MEMO_PREFIX}${learnerId}`;

/** A device that never opened the tab treats only the last 14 days as new (a new iPad must not show 40 "Mới"). */
export const FIRST_OPEN_DAYS = 14;

/** Rows the adult saw after the child last opened the tab on this device. */
export function countNew(seenAtList: readonly string[], lastOpenedIso: string | null, now: Date = new Date()): number {
  const parsed = lastOpenedIso ? Date.parse(lastOpenedIso) : NaN;
  const since = Number.isNaN(parsed) ? now.getTime() - FIRST_OPEN_DAYS * 86_400_000 : parsed;
  return seenAtList.filter((s) => Date.parse(s) > since).length;
}

export function isNew(seenAtIso: string, lastOpenedIso: string | null, now: Date = new Date()): boolean {
  return countNew([seenAtIso], lastOpenedIso, now) === 1;
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function readOpened(store: Store | null | undefined, learnerId: string): string | null {
  try {
    const v = store?.getItem(seenMemoKey(learnerId)) ?? null;
    return v && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

export function writeOpened(store: Store | null | undefined, learnerId: string, now: Date = new Date()): void {
  try {
    store?.setItem(seenMemoKey(learnerId), now.toISOString());
  } catch {
    // private mode / storage full: the mark is a nicety, never an error
  }
}
