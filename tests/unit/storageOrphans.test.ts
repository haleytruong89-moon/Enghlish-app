import { describe, expect, it } from "vitest";
import { findOrphans, mayDelete, parseOrphanArgs, ORPHAN_MIN_AGE_MS, type StoredObject } from "@/lib/storage/orphans";

const FAM = "f0000000-0000-4000-8000-000000000001";
const LEA = "a0000000-0000-4000-8000-000000000001";
const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const path = (n: number, ext = "png") => `${FAM}/${LEA}/${id(n)}.${ext}`;
const NOW = new Date("2026-10-17T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const obj = (p: string, age: number | null): StoredObject => ({ path: p, bytes: 10, createdAt: age === null ? null : ago(age) });
const DAY = ORPHAN_MIN_AGE_MS;

describe("findOrphans", () => {
  it("an old object with no files row is an orphan; a registered one, a new one, a foreign path and an unknown age are not", () => {
    const r = findOrphans(
      [
        obj(path(1), 3 * DAY), // orphan
        obj(path(2), 3 * DAY), // registered
        obj(path(3), DAY / 2), // too new
        obj(`${FAM}/${LEA}/notes.txt`, 9 * DAY), // not our path
        obj(`other-bucket-style/${id(4)}.png`, 9 * DAY), // not our path
        obj(path(5), null), // age unknown
      ],
      new Set([path(2)]),
      NOW,
    );
    expect(r.orphans.map((o) => o.path)).toEqual([path(1)]);
    expect(r.registered).toBe(1);
    expect(r.tooNew).toBe(1);
    expect(r.unrecognised.map((o) => o.path)).toEqual([`${FAM}/${LEA}/notes.txt`, `other-bucket-style/${id(4)}.png`, path(5)]);
  });

  it("exactly one day old counts as old enough; the shared folder is recognised too", () => {
    const shared = `${FAM}/shared/${id(7)}.pdf`;
    expect(findOrphans([obj(path(1), DAY), obj(shared, DAY + 1)], new Set(), NOW).orphans).toHaveLength(2);
  });
});

describe("command line", () => {
  it("dry run by default; --delete alone does not delete; --delete --confirm does; anything unknown is an error", () => {
    expect(mayDelete(parseOrphanArgs([]) as never)).toBe(false);
    expect(mayDelete(parseOrphanArgs(["--delete"]) as never)).toBe(false);
    expect(mayDelete(parseOrphanArgs(["--confirm"]) as never)).toBe(false);
    expect(mayDelete(parseOrphanArgs(["--delete", "--confirm"]) as never)).toBe(true);
    expect(parseOrphanArgs(["--delet"])).toEqual({ error: "unknown option: --delet" });
  });
});
