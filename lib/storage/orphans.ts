import { parsePath } from "./rules";

/**
 * Orphan files: objects in the bucket `english-work` that no row of english.files points to (a child picked a picture and the upload
 * finished, but the "send" step never happened). Pure logic for `npm run storage:orphans`; the script does the listing and deleting.
 *
 * Safety rules (tested): only objects whose path has exactly the shape the app builds are ever considered; anything else is reported
 * as "unrecognised" and never deleted; an object whose age is unknown is never an orphan; a registered path is never an orphan.
 */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type StoredObject = { path: string; bytes: number | null; createdAt: Date | null };

export type OrphanReport = {
  orphans: StoredObject[];
  /** Not old enough yet (an upload may still be about to be registered). */
  tooNew: number;
  /** Path does not look like one of ours, or age unknown: reported, never deleted. */
  unrecognised: StoredObject[];
  registered: number;
};

export function findOrphans(objects: StoredObject[], registeredPaths: ReadonlySet<string>, now: Date, minAgeMs: number = ORPHAN_MIN_AGE_MS): OrphanReport {
  const report: OrphanReport = { orphans: [], tooNew: 0, unrecognised: [], registered: 0 };
  for (const o of objects) {
    if (parsePath(o.path) === null || o.createdAt === null || Number.isNaN(o.createdAt.getTime())) {
      report.unrecognised.push(o);
    } else if (registeredPaths.has(o.path)) {
      report.registered += 1;
    } else if (now.getTime() - o.createdAt.getTime() < minAgeMs) {
      report.tooNew += 1;
    } else {
      report.orphans.push(o);
    }
  }
  return report;
}

export type OrphanArgs = { delete: boolean; confirmed: boolean };

/** `--delete` alone only explains; deleting needs `--delete --confirm`. Unknown flags are an error (a typo must not delete). */
export function parseOrphanArgs(argv: readonly string[]): OrphanArgs | { error: string } {
  const known = new Set(["--delete", "--confirm"]);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) return { error: `unknown option: ${unknown.join(" ")}` };
  return { delete: argv.includes("--delete"), confirmed: argv.includes("--confirm") };
}

/** True only for `--delete --confirm`. */
export function mayDelete(a: OrphanArgs): boolean {
  return a.delete && a.confirmed;
}
