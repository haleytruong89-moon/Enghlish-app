"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { codeOf, nextAttempt, practiceErrorText, uploadAll, type SendAttempt, type UploadCache } from "@/lib/practice/client";
import { answersToSend, canSend, type TwoAnswers } from "@/lib/practice/twoQuestions";
import { postJson } from "@/lib/tutorwork/client";
import type { usePages } from "./usePages";

/**
 * Send what the child arranged: render the turns, upload every page straight to storage (one-time links), then register the work in one call.
 * A retry after a lost answer uses the SAME client id and the files already uploaded (the database answers "already done"); anything the child
 * changes in between (pages, order, turns, answers) is new work with a new id.
 */
export function useSendWork(assignmentId: string, pagesApi: ReturnType<typeof usePages>, answers: TwoAnswers) {
  const router = useRouter();
  const [busy, setBusy] = useState<"upload" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const attempt = useRef<SendAttempt | null>(null);
  const uploaded = useRef<UploadCache>(new Map());

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const fields = answersToSend(answers);
    if (!fields || !canSend(pagesApi.pages.length, answers)) return;
    setError(null);
    setBusy("upload");
    const fin = await pagesApi.finalFiles();
    if (!fin.ok) {
      setBusy(null);
      return setError(fin.error);
    }
    const up = await uploadAll(fin.files, "/api/student/files", { assignment_id: assignmentId }, uploaded.current);
    if (!up.ok) {
      setBusy(null);
      return setError(practiceErrorText(up.error, "student"));
    }
    setBusy("send");
    const body = { ...fields, link_url: null, files: up.files };
    attempt.current = nextAttempt(attempt.current, JSON.stringify(body));
    const r = await postJson("/api/student/submissions", { assignment_id: assignmentId, client_id: attempt.current.id, ...body });
    setBusy(null);
    if (!r.ok) return setError(practiceErrorText(codeOf(r), "student"));
    attempt.current = null;
    uploaded.current = new Map();
    pagesApi.clear();
    setDone(true);
    router.refresh();
  }

  return { send, busy, error, done };
}
