import { StaffShell } from "@/components/shell/StaffShell";
import { requireShell } from "@/lib/shell/load";

export const dynamic = "force-dynamic";

/**
 * Every /learners/[id]/** page is a staff page about one child: the workdesk shell of that child. A student, or a child outside the
 * caller's scope (or a real child while ALLOW_REAL_LEARNERS=false) → plain 404 here; each page still checks its own action.
 */
export default async function LearnerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shell = await requireShell(id, { strict: true });
  return <StaffShell shell={shell}>{children}</StaffShell>;
}
