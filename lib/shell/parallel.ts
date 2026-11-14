import "server-only";
import { loadHome } from "@/lib/home/loadHome";
import { revisionsAvailable } from "@/lib/revision/load";
import { toShell, type ShellData } from "./shell";

/**
 * Detail pages (a curriculum version, a Studio draft, an import) first read their own record, then need the shell (the adult and
 * their children). Reading them one after the other adds the shell's round trips to the page's. This starts the shell reads (cached
 * per request) at the same time as `load`, then builds the shell from the learner the record belongs to (`learnerOf`).
 * `shell` is null for a student / unknown account / unreadable record: the page answers not-found exactly as before.
 * The shell data is read with the USER client under RLS and is only shown after the page's own access check passed.
 */
export async function withShell<T>(load: Promise<T>, learnerOf: (t: T) => string | null): Promise<{ data: T; shell: ShellData | null }> {
  const homeP = loadHome();
  const revP = revisionsAvailable();
  // Neither side may leave an unhandled rejection behind when the other one throws first.
  homeP.catch(() => undefined);
  revP.catch(() => undefined);
  const [data, home, revisionsReady] = await Promise.all([load, homeP, revP]);
  if (home.kind === "signed-out" || home.kind === "no-member") return { data, shell: null };
  return { data, shell: toShell(home, learnerOf(data), revisionsReady) };
}
