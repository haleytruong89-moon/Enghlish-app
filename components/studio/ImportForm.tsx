"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilePicker } from "@/components/ui/FilePicker";
import { studioImportCopy } from "@/lib/copy/vi";
import { importOne, type ImportRow } from "@/lib/studio/importClient";

/** "Nhập bài soạn sẵn": several .json files → one Studio draft each (sent one by one), one result row per file. */
export function ImportForm({ learnerId }: { learnerId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [progress, setProgress] = useState<number | null>(null);

  async function run() {
    const out: ImportRow[] = [];
    setRows([]);
    for (let k = 0; k < files.length; k++) {
      setProgress(k + 1);
      out.push(await importOne(learnerId, files[k]!));
      setRows([...out]);
    }
    setProgress(null);
    setFiles([]);
    router.refresh();
  }

  return (
    <section aria-labelledby="studio-import-title" data-testid="studio-import" className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
      <h2 id="studio-import-title" className="text-lg font-semibold">{studioImportCopy.title}</h2>
      <p className="text-sm">{studioImportCopy.intro}</p>
      <div className="flex flex-col gap-1 text-sm font-semibold">
        {studioImportCopy.fileLabel}
        <FilePicker
          testId="studio-import-file"
          accept=".json,application/json"
          multiple
          name={files.length === 0 ? null : files.length === 1 ? files[0]!.name : studioImportCopy.chosen(files.length)}
          onPickMany={(fs) => {
            setFiles(fs);
            setRows([]);
          }}
          ariaLabel={studioImportCopy.fileLabel}
          disabled={progress !== null}
        />
      </div>
      <button
        type="button"
        disabled={files.length === 0 || progress !== null}
        onClick={() => void run()}
        data-testid="studio-import-start"
        className="min-h-12 self-start rounded-xl border border-accent bg-white px-5 font-semibold text-accent disabled:opacity-60"
      >
        {progress !== null ? studioImportCopy.importing(progress, files.length) : studioImportCopy.start}
      </button>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {rows.map((r, k) => (
            <li
              key={`${r.name}-${k}`}
              data-testid={`studio-import-row-${k}`}
              className={`rounded-xl px-3.5 py-2 text-sm ${r.ok ? "bg-[#eef3ef]" : "bg-[#FBF1DC] text-[#6B4600]"}`}
            >
              {r.ok ? (
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="font-semibold">{studioImportCopy.rowOk(r.title, r.items)}</span>
                  {r.needsReview > 0 ? <span>· {studioImportCopy.rowFlagged(r.needsReview)}</span> : null}
                  {r.blocking > 0 ? <span className="text-[#8A1C12]">· {studioImportCopy.rowBlocking(r.blocking)}</span> : null}
                  {r.status === "approved" ? <span>· {studioImportCopy.rowApproved}</span> : r.replayed ? <span>· {studioImportCopy.rowAgain}</span> : null}
                  <Link href={`/studio/drafts/${r.id}`} className="ml-auto inline-flex min-h-11 items-center text-accent underline">
                    {studioImportCopy.open}
                  </Link>
                </span>
              ) : (
                <span>
                  <span className="font-semibold">{studioImportCopy.rowFailed(r.name)}</span> · {r.message}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
