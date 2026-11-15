import Link from "next/link";
import { account, app, appFeedback, auth } from "@/lib/copy/vi";

/** `feedbackScreen` (adult pages only): the label of this screen; when given, the "Góp ý về app" link is shown and carries it to /feedback. */
export function AppHeader({ name, showTestBadge, feedbackScreen }: { name?: string; showTestBadge?: boolean; feedbackScreen?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-accent">{app.name}</span>
        {showTestBadge ? (
          <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent">
            {app.testBadge}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {name ? <span className="hidden text-sm text-muted sm:inline">{name}</span> : null}
        {feedbackScreen ? (
          <Link href={`/feedback?screen=${encodeURIComponent(feedbackScreen)}`} data-testid="feedback-link" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent underline">
            {appFeedback.link}
          </Link>
        ) : null}
        <Link
          href="/account/password"
          data-testid="change-password-link"
          className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent underline"
        >
          {account.changePassword}
        </Link>
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
