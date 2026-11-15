import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { StudentTabs, type DeskTab } from "./StudentTabs";

/**
 * The child's desk frame (W4b): the account header, the four tabs (bottom bar on a phone / portrait iPad, left column on a laptop / landscape
 * iPad) and the page. Never uses the staff workdesk frame.
 */
export function StudentDeskShell({
  active,
  learnerId,
  seenTimes,
  showTestBadge,
  children,
}: {
  active: DeskTab;
  learnerId: string;
  seenTimes: string[];
  showTestBadge?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader showTestBadge={showTestBadge} />
      <div className="mx-auto flex w-full max-w-6xl flex-col md:flex-row">
        <StudentTabs active={active} learnerId={learnerId} seenTimes={seenTimes} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10" data-testid="student-desk">
          {children}
        </main>
      </div>
    </>
  );
}
