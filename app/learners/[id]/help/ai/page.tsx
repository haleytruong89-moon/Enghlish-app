import Link from "next/link";
import { aiGuideCopy } from "@/lib/copy/vi";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** 27/11 "Hướng dẫn dùng AI soạn đề": a page to read (tutor or parent of the child). Text only, from `aiGuideCopy.page`. */
export default async function AiGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { learner } = await requireLearnerPage(id, "studio:read");
  const c = aiGuideCopy.page;
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5" data-testid="ai-guide">
      <Link href={`/studio/new?learner=${learner.id}`} className="inline-flex min-h-11 items-center text-sm text-accent underline">{c.back}</Link>
      <header>
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="mt-1 text-[15px]">{c.intro}</p>
      </header>
      {c.sections.map((sec) => (
        <section key={sec.h} className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold text-[#1f4439]">{sec.h}</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">
            {sec.items.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>
      ))}
    </article>
  );
}
