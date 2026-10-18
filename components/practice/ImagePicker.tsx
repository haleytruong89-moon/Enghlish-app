"use client";

import { useEffect, useRef, useState } from "react";
import { practiceStudent } from "@/lib/copy/vi";
import { prepareFile, type Prepared } from "@/lib/storage/clientUpload";
import { MAX_FILES_PER_SUBMISSION } from "@/lib/storage/rules";

export type PickedItem = { key: string; file: Prepared; preview: string | null };

/**
 * Collects pictures (and PDFs when `allowPdf`): Ctrl + V pastes a screenshot, the button opens the file picker, files can be dropped.
 * Every picture is shrunk to at most 1600 px on its longest side right here, before anything is uploaded. Items are controlled by
 * the parent form; this component only adds, previews and removes them.
 */
export function ImagePicker({
  items,
  onChange,
  onError,
  allowPdf,
  chooseLabel,
  help,
  testId,
}: {
  items: PickedItem[];
  onChange: (next: PickedItem[]) => void;
  onError: (message: string | null) => void;
  allowPdf: boolean;
  chooseLabel: string;
  help: React.ReactNode;
  testId: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Always the latest items for the cleanup below (previews are object URLs that must be released).
  const latest = useRef(items);
  useEffect(() => {
    latest.current = items;
  });
  useEffect(
    () => () => {
      for (const i of latest.current) if (i.preview) URL.revokeObjectURL(i.preview);
    },
    [],
  );

  async function add(files: File[]) {
    if (files.length === 0) return;
    onError(null);
    setBusy(true);
    const next = [...latest.current];
    for (const f of files) {
      if (next.length >= MAX_FILES_PER_SUBMISSION) {
        onError(practiceStudent.errors.tooMany(MAX_FILES_PER_SUBMISSION));
        break;
      }
      const r = await prepareFile(f, `anh-${next.length + 1}`);
      if (!r.ok) {
        onError(r.reason === "type" ? practiceStudent.errors.file_type : r.reason === "too_big" ? practiceStudent.errors.file_too_big : practiceStudent.errors.unreadable);
        continue;
      }
      const isImage = r.file.mime !== "application/pdf";
      next.push({ key: crypto.randomUUID(), file: r.file, preview: isImage ? URL.createObjectURL(r.file.blob) : null });
    }
    setBusy(false);
    onChange(next);
  }

  function remove(key: string) {
    const hit = items.find((i) => i.key === key);
    if (hit?.preview) URL.revokeObjectURL(hit.preview);
    onChange(items.filter((i) => i.key !== key));
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return; // text paste: leave it alone
    e.preventDefault();
    void add(files);
  }

  const accept = allowPdf ? "image/png,image/jpeg,image/webp,application/pdf" : "image/png,image/jpeg,image/webp";
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div
        tabIndex={0}
        role="group"
        aria-label={practiceStudent.pasteZone}
        data-testid={`${testId}-zone`}
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void add(Array.from(e.dataTransfer.files));
        }}
        className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-line bg-paper p-4 outline-none focus:border-accent"
      >
        <span className="text-sm text-ink">{help}</span>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-60"
        >
          {chooseLabel}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          data-testid={`${testId}-input`}
          onChange={(e) => {
            void add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-3" aria-label={practiceStudent.imageAdded(items.length)}>
          {items.map((i, n) => (
            <li key={i.key} className="flex w-32 flex-col gap-1" data-testid={`${testId}-item`}>
              {i.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.preview} alt={practiceStudent.imageAlt(n + 1)} className="h-24 w-32 rounded-lg border border-line object-cover" />
              ) : (
                <span className="flex h-24 w-32 items-center justify-center break-all rounded-lg border border-line bg-white p-2 text-xs">{i.file.name}</span>
              )}
              <button type="button" onClick={() => remove(i.key)} className="min-h-11 text-left text-sm text-accent underline">
                {practiceStudent.removeImage}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
