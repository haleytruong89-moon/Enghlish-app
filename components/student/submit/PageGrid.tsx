"use client";

import { useRef } from "react";
import { submitScreenCopy as copy } from "@/lib/copy/vi";
import { degrees } from "@/lib/practice/pageOrder";
import type { SubmitPage } from "./usePages";

const tool =
  "inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-lg border border-line bg-white px-2 text-sm font-semibold text-ink disabled:opacity-40";

/**
 * The picking buttons ("Chụp ảnh" opens the camera on an iPad, "Chọn ảnh" the file picker) and the grid of pages: every page says "Trang n" and has
 * Lên · Xuống · Xoay · Xóa. The order of the grid is the order the pages are sent in. `unit` = "page" (paper) or "photo" (link result).
 */
export function PageGrid({
  pages,
  busy,
  notice,
  unit,
  allowPdf,
  onAdd,
  onMove,
  onTurn,
  onRemove,
  testPrefix,
}: {
  pages: SubmitPage[];
  busy: boolean;
  notice: string | null;
  unit: "page" | "photo";
  allowPdf: boolean;
  onAdd: (files: File[]) => void;
  onMove: (key: string, dir: "up" | "down") => void;
  onTurn: (key: string) => void;
  onRemove: (key: string) => void;
  testPrefix: string;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const label = (n: number) => (unit === "page" ? copy.page(n) : copy.photo(n));
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAdd(Array.from(e.target.files ?? []));
    e.target.value = "";
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => camera.current?.click()}
          disabled={busy}
          data-testid={`${testPrefix}-camera`}
          className="inline-flex min-h-12 items-center rounded-xl border border-accent bg-white px-5 text-base font-semibold text-accent disabled:opacity-60"
        >
          {copy.pick.camera}
        </button>
        <button
          type="button"
          onClick={() => files.current?.click()}
          disabled={busy}
          data-testid={`${testPrefix}-choose`}
          className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 text-base font-semibold text-white disabled:opacity-60"
        >
          {allowPdf ? copy.pick.chooseWithPdf : copy.pick.choose}
        </button>
        {/* capture="environment": the iPad opens the back camera; a laptop ignores it. One picture per take, so the child takes the next page. */}
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} data-testid={`${testPrefix}-camera-input`} onChange={take} />
        <input
          ref={files}
          type="file"
          multiple
          accept={allowPdf ? "image/*,application/pdf" : "image/*"}
          className="sr-only"
          tabIndex={-1}
          data-testid={`${testPrefix}-file-input`}
          onChange={take}
        />
      </div>
      {busy ? <p className="text-sm text-muted" role="status">{copy.pick.working}</p> : null}
      {notice ? (
        <p role="alert" className="text-sm text-red-700" data-testid={`${testPrefix}-notice`}>
          {notice}
        </p>
      ) : null}
      {pages.length > 0 ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={unit === "page" ? copy.pick.pagesLabel : copy.pick.photosLabel} data-testid={`${testPrefix}-pages`}>
            {pages.map((p, i) => (
              <li key={p.key} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-2" data-testid={`${testPrefix}-page`} data-page={i + 1} data-quarter={p.quarter}>
                <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-lg bg-paper">
                  {p.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the child's own picture
                    <img
                      src={p.preview}
                      alt={label(i + 1)}
                      className="max-h-full max-w-full object-contain"
                      style={{ transform: `rotate(${degrees(p.quarter)}deg)${p.quarter % 2 === 1 ? " scale(0.72)" : ""}` }}
                    />
                  ) : (
                    <span className="break-all p-2 text-center text-xs">
                      {copy.pdfPage}
                      <br />
                      <span className="text-muted">{p.file.name}</span>
                    </span>
                  )}
                  <span className="absolute left-1 top-1 rounded-md bg-ink px-2 py-0.5 text-xs font-bold text-white" data-testid={`${testPrefix}-label`}>
                    {label(i + 1)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className={tool} disabled={i === 0} onClick={() => onMove(p.key, "up")} aria-label={copy.toolAria.up(i + 1)} data-testid={`${testPrefix}-up`}>
                    {copy.tools.up}
                  </button>
                  <button type="button" className={tool} disabled={i === pages.length - 1} onClick={() => onMove(p.key, "down")} aria-label={copy.toolAria.down(i + 1)} data-testid={`${testPrefix}-down`}>
                    {copy.tools.down}
                  </button>
                  {p.preview ? (
                    <button type="button" className={tool} onClick={() => onTurn(p.key)} aria-label={copy.toolAria.turn(i + 1)} data-testid={`${testPrefix}-turn`}>
                      {copy.tools.turn}
                    </button>
                  ) : null}
                  <button type="button" className={`${tool} text-red-700`} onClick={() => onRemove(p.key)} aria-label={copy.toolAria.remove(i + 1)} data-testid={`${testPrefix}-remove`}>
                    {copy.tools.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted" data-testid={`${testPrefix}-count`}>
            <span data-count="work">{unit === "page" ? copy.countPages(pages.length) : copy.countPhotos(pages.length)}</span>
          </p>
        </>
      ) : null}
    </div>
  );
}
