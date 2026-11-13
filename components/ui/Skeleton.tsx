import { loadingCopy } from "@/lib/copy/vi";

/** A grey block that pulses while a page loads (still when the person prefers reduced motion). */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-xl bg-line/60 motion-safe:animate-pulse ${className}`} />;
}

/** The content skeleton of a staff page: a title bar and a few cards. `data-testid="page-skeleton"`, announced as "Đang tải…". */
export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" data-testid="page-skeleton" className="flex flex-col gap-4">
      <span className="sr-only">{loadingCopy.page}</span>
      <SkeletonBlock className="h-8 w-64" />
      <SkeletonBlock className="h-4 w-96 max-w-full" />
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonBlock className="h-40 w-full" />
    </div>
  );
}

/** For staff pages that sit outside the child layout: a fake top bar and left column keep the layout from jumping. */
export function StaffFrameSkeleton() {
  return (
    <div className="min-h-screen" data-testid="frame-skeleton">
      <SkeletonBlock className="h-14 w-full rounded-none" />
      <div className="flex gap-6 p-4">
        <SkeletonBlock className="hidden h-[70vh] w-56 shrink-0 lg:block" />
        <div className="min-w-0 flex-1">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}
