import "server-only";
import { notFound, redirect } from "next/navigation";
import { loadHome } from "@/lib/home/loadHome";
import { revisionsAvailable } from "@/lib/revision/load";
import { toShell, type ShellData } from "./shell";

export type ShellResult = { kind: "ok"; shell: ShellData } | { kind: "login" } | { kind: "not-found" };

/**
 * The shell of a staff page. Reads the adult and their children with the USER client (RLS decides scope, like the old home page).
 * `strict` (pages of one child): the hint must be one of those children, else not-found — the page still checks its own action.
 */
export async function loadShell(hint: string | null, opts: { strict?: boolean } = {}): Promise<ShellResult> {
  const home = await loadHome();
  if (home.kind === "signed-out") return { kind: "login" };
  if (home.kind === "no-member" || home.kind === "student") return { kind: "not-found" };
  if (opts.strict && !home.learners.some((l) => l.id === hint)) return { kind: "not-found" };
  const shell = toShell(home, hint, await revisionsAvailable());
  return shell ? { kind: "ok", shell } : { kind: "not-found" };
}

export async function requireShell(hint: string | null, opts: { strict?: boolean } = {}): Promise<ShellData> {
  const r = await loadShell(hint, opts);
  if (r.kind === "login") redirect("/login");
  if (r.kind === "not-found") notFound();
  return r.shell;
}
