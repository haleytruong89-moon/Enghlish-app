import { INBOX_FILTERS, type InboxCursor, type InboxFilter } from "./types";

/** The filter and the page are decided by the database (SQL); this file only reads what the URL / query says. */
export const FILTERS = INBOX_FILTERS;
export const PAGE_SIZE = 50;

export function parseFilter(v: string | string[] | undefined): InboxFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return (FILTERS as readonly string[]).includes(s ?? "") ? (s as InboxFilter) : "todo";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

export function isCursor(c: { at: unknown; id: unknown }): c is InboxCursor {
  return typeof c.at === "string" && ISO_RE.test(c.at) && !Number.isNaN(new Date(c.at).getTime()) && typeof c.id === "string" && UUID_RE.test(c.id);
}

/** URL form of a cursor: "<time>|<episode id>". Anything malformed → null (the first page). */
export function parseCursor(v: string | string[] | undefined): InboxCursor | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  const [at, id, ...rest] = s.split("|");
  if (rest.length > 0) return null;
  const c = { at, id };
  return isCursor(c) ? c : null;
}

export const cursorToParam = (c: InboxCursor): string => `${c.at}|${c.id}`;
