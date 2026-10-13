import { app, auth } from "@/lib/copy/vi";

export function AppHeader({ name, showTestBadge }: { name?: string; showTestBadge?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-accent">{app.name}</span>
        {showTestBadge ? (
          <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent">
            {app.testBadge}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {name ? <span className="hidden text-sm text-muted sm:inline">{name}</span> : null}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:border-accent"
          >
            {auth.signOut}
          </button>
        </form>
      </div>
    </header>
  );
}
