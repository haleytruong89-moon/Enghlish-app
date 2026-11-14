import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { account, app, auth, learnerWithTrack } from "@/lib/copy/vi";
import { buildNav } from "@/lib/shell/nav";
import type { ShellData } from "@/lib/shell/shell";
import { LearnerSwitcher } from "./LearnerSwitcher";
import { PhoneFeedbackLink } from "./PhoneFeedbackLink";
import { SidebarNav } from "./SidebarNav";

/** Staff pages only (tutor, parent). Students never get this shell (their pages do not import it). */
export function StaffShell({ shell, children }: { shell: ShellData; children: React.ReactNode }) {
  const learnerId = shell.current?.id ?? null;
  const nav = buildNav(shell.role, learnerId, { revisionsReady: shell.revisionsReady });
  const options = shell.learners.map((l) => ({ id: l.id, label: learnerWithTrack(l.alias, l.trackId) }));
  return (
    <div data-testid="staff-shell" className="min-h-dvh">
      <header data-testid="staff-topbar" className="print:hidden flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-white px-4 py-3 md:px-6">
        <span className="font-semibold text-accent">{app.name}</span>
        {shell.current?.isTest ? <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent">{app.testBadge}</span> : null}
        {options.length > 1 ? (
          <LearnerSwitcher options={options} currentId={learnerId} />
        ) : shell.current ? (
          <span data-testid="shell-learner" className="text-sm font-semibold">{learnerWithTrack(shell.current.alias, shell.current.trackId)}</span>
        ) : null}
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="hidden text-sm text-muted sm:inline">{shell.displayName}</span>
          <PhoneFeedbackLink learnerId={learnerId} />
          <Link href="/account/password" data-testid="change-password-link" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent underline">
            {account.changePassword}
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:border-accent">{auth.signOut}</button>
          </form>
        </div>
      </header>
      <div className="md:grid md:grid-cols-[220px_minmax(0,1fr)] print:block">
        <div data-testid="staff-sidebar-wrap" className="print:hidden">
          <SidebarNav nav={nav} learnerId={learnerId} />
        </div>
        <main className="min-w-0 px-4 py-6 md:px-7 print:p-0">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
