import { PageSkeleton } from "@/components/ui/Skeleton";

/** Shown inside the child's workdesk shell (the layout keeps the left column) while the page reads its data. */
export default function Loading() {
  return <PageSkeleton />;
}
