import { safeExternalUrl } from "@/lib/inquiries/format";
import { work } from "@/lib/copy/vi";
import { sourceTitle } from "@/lib/work/view";
import type { SourceView } from "@/lib/work/types";

const TITLES = { text: work.readingTitle, audio: work.listeningTitle, video: work.videoTitle } as const;
const OPEN = { text: work.openLink, audio: work.openAudio, video: work.openVideo } as const;

/**
 * Reading text inline; listening and video only as an external link (the app never plays or stores audio, and a
 * student never gets a transcript). Source text is plain text: no HTML is ever rendered from it.
 */
export function SourceReader({ sources }: { sources: SourceView[] }) {
  if (sources.length === 0) return null;
  return (
    <>
      {sources.map((s) => {
        const href = safeExternalUrl(s.url);
        return (
          <section
            key={s.id}
            aria-labelledby={`src-${s.id}`}
            data-testid={`source-${s.modality}`}
            className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-muted">{TITLES[s.modality]}</h2>
            <p id={`src-${s.id}`} lang="en" className="text-[17px] font-semibold leading-snug">
              {sourceTitle(s.title)}
            </p>
            {s.author ? <p className="text-[13px] text-muted">{work.byAuthor(s.author)}</p> : null}
            {s.modality === "text" && s.text ? (
              <div lang="en" className="flex flex-col gap-3 text-[15px] leading-relaxed">
                {s.text
                  .split(/\n{2,}/)
                  .filter((p) => p.trim() !== "")
                  .map((p, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {p}
                    </p>
                  ))}
              </div>
            ) : null}
            {s.modality !== "text" && href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center self-start rounded-xl bg-[#E3ECE8] px-4 text-sm font-semibold text-[#1F4439]"
              >
                {OPEN[s.modality]}
              </a>
            ) : null}
            {s.modality !== "text" && !href ? <p className="text-sm text-muted">{work.noLink}</p> : null}
            {s.rightsNote ? <p className="text-xs text-muted">{s.rightsNote}</p> : null}
          </section>
        );
      })}
    </>
  );
}
