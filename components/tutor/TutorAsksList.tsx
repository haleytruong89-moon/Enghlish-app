import Link from "next/link";
import { tutorAsksCopy as c, tutorPageCopy } from "@/lib/copy/vi";
import type { TutorAskRow } from "@/lib/notebook/adultLoad";

/** "23/11 19:42" in Vietnamese time (UTC+7). */
function vnTime(ts: string): string {
  const d = new Date(new Date(ts).getTime() + 7 * 3600_000);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** E2a · what the child asked the tutor (D-G8): read-only, newest first, no AI summary (that is C). */
export function TutorAsksList({ learnerId, rows }: { learnerId: string; rows: TutorAskRow[] }) {
  if (!rows.length) return <p className="rounded-2xl border border-line bg-white p-4" data-testid="tutor-asks-empty">{c.empty}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm" data-testid="tutor-asks">
        <thead className="border-b border-line bg-[#fbfbf8] text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">{c.cols.at}</th>
            <th className="px-3 py-2 font-semibold">{c.cols.kind}</th>
            <th className="px-3 py-2 font-semibold">{c.cols.asked}</th>
            <th className="px-3 py-2 font-semibold">{c.cols.answer}</th>
            <th className="px-3 py-2 font-semibold">{c.cols.saved}</th>
            <th className="px-3 py-2 font-semibold">{c.cols.rating}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top last:border-b-0" data-testid={`ask-${r.id}`}>
              <td className="whitespace-nowrap px-3 py-2">{vnTime(r.at)}</td>
              <td className="px-3 py-2">{c.kinds[r.kind] ?? r.kind}</td>
              <td className="px-3 py-2">
                <span lang="en" className="font-semibold">{r.childText}</span>
                {r.contextText ? <span className="block text-muted">{c.context} <span lang="en">{r.contextText}</span></span> : null}
              </td>
              <td className="px-3 py-2">
                {r.fixedCode && r.fixedCode !== "not_word" ? (
                  <span className="text-muted">{tutorPageCopy.fixed[r.fixedCode] ?? r.fixedCode}</span>
                ) : r.fixedCode === "not_word" ? (
                  <span className="text-muted">{tutorPageCopy.fixed.not_word}</span>
                ) : r.cardId && r.headword ? (
                  <Link href={`/learners/${learnerId}/tutor-asks/card/${r.cardId}`} className="text-accent underline">{c.card(r.headword)}</Link>
                ) : null}
                {r.guard === "cache" ? <span className="ml-1 text-xs text-muted">({c.cache})</span> : null}
              </td>
              <td className="px-3 py-2">{r.saved ? c.saved : ""}</td>
              <td className="px-3 py-2">{r.rating ? <span aria-label={c.ratingLabel[r.rating]} title={c.ratingLabel[r.rating]}>{c.rating[r.rating]}</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
