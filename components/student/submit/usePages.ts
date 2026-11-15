"use client";

import { useEffect, useRef, useState } from "react";
import { preparePaperFile, renderPaperImage } from "@/lib/practice/image";
import { addPages, MAX_PAGES, movePage, removePage, rotatePage, type Paged } from "@/lib/practice/pageOrder";
import { submitScreenCopy as copy } from "@/lib/copy/vi";
import type { Prepared } from "@/lib/storage/clientUpload";

export type SubmitPage = Paged & { file: Prepared; preview: string | null };

/**
 * The pages the child has taken so far, on this device: pick / take (each picture is shrunk to JPEG first), move, turn, delete. Nothing is sent from
 * here. `finalFiles()` renders the turns (once per page + turn, so a retry sends the very same files) in the order of the list.
 */
export function usePages({ allowPdf, maxPages = MAX_PAGES }: { allowPdf: boolean; maxPages?: number }) {
  const [pages, setPages] = useState<SubmitPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The newest list, for adds that finish after a later add started, and for releasing preview links.
  const latest = useRef<SubmitPage[]>([]);
  const rendered = useRef(new Map<string, Prepared>());
  const serial = useRef(0);

  useEffect(
    () => () => {
      for (const p of latest.current) if (p.preview) URL.revokeObjectURL(p.preview);
    },
    [],
  );

  function commit(next: SubmitPage[]) {
    latest.current = next;
    setPages(next);
  }

  async function add(files: File[]) {
    if (files.length === 0) return;
    setNotice(null);
    setBusy(true);
    const incoming: SubmitPage[] = [];
    let problem: string | null = null;
    for (const f of files) {
      serial.current += 1;
      const isPdf = f.type === "application/pdf";
      if (isPdf && !allowPdf) {
        problem = copy.errors.pdfNotHere as string;
        continue;
      }
      const r = await preparePaperFile(f, `trang-${serial.current}`);
      if (!r.ok) {
        problem = r.reason === "type" ? (copy.errors.type as string) : r.reason === "too_big" ? (copy.errors.too_big as string) : (copy.errors.unreadable as string);
        continue;
      }
      const preview = r.file.mime === "application/pdf" ? null : URL.createObjectURL(r.file.blob);
      incoming.push({ key: crypto.randomUUID(), quarter: 0, file: r.file, preview });
    }
    const { pages: next, dropped } = addPages(latest.current, incoming, maxPages);
    if (dropped > 0) for (const p of incoming.slice(incoming.length - dropped)) if (p.preview) URL.revokeObjectURL(p.preview);
    commit(next);
    setBusy(false);
    const added = incoming.length - dropped;
    const tooMany = dropped === 0 ? null : added === 0 ? (copy.errors.tooMany as (m: number) => string)(maxPages) : (copy.errors.dropped as (a: number, m: number) => string)(added, maxPages);
    setNotice(tooMany ?? problem);
  }

  const move = (key: string, dir: "up" | "down") => commit(movePage(latest.current, key, dir));
  const turn = (key: string) => commit(rotatePage(latest.current, key));
  const remove = (key: string) => {
    const hit = latest.current.find((p) => p.key === key);
    if (hit?.preview) URL.revokeObjectURL(hit.preview);
    setNotice(null);
    commit(removePage(latest.current, key));
  };
  const clear = () => {
    for (const p of latest.current) if (p.preview) URL.revokeObjectURL(p.preview);
    rendered.current = new Map();
    commit([]);
  };

  /** The files to upload, in page order, with every turn applied. Null + a message when a picture cannot be turned. */
  async function finalFiles(): Promise<{ ok: true; files: Prepared[] } | { ok: false; error: string }> {
    const out: Prepared[] = [];
    for (const p of latest.current) {
      if (p.quarter === 0 || p.file.mime === "application/pdf") {
        out.push(p.file);
        continue;
      }
      const id = `${p.key}:${p.quarter}`;
      let done = rendered.current.get(id);
      if (!done) {
        const r = await renderPaperImage(p.file.blob, p.quarter, p.file.name);
        if (!r.ok) return { ok: false, error: r.reason === "too_big" ? (copy.errors.too_big as string) : (copy.errors.unreadable as string) };
        done = r.file;
        rendered.current.set(id, done);
      }
      out.push(done);
    }
    return { ok: true, files: out };
  }

  return { pages, busy, notice, setNotice, add, move, turn, remove, clear, finalFiles };
}
