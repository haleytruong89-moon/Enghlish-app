// lib/curriculum/load.ts
import "server-only";
import { loadPickerMap } from "@/lib/skillmap/load";
import { createFileStorage } from "@/lib/storage/server";
import { getAuthUser, getMemberByUserId } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { loadTags } from "@/lib/tutorwork/load";
import { buildTocContext, type TocContext } from "./context";
import { handleGetVersion, type CurriculumDeps } from "./handlers";
import { buildCards, taughtChoices, type CurriculumCard, type TaughtChoice, type VersionPageData } from "./shape";
import { createSupabaseCurriculumStore } from "./supabaseStore";
import { buildUnitChoices } from "./unitChoices";
import type { UnitChoice } from "./unitPicker";
import type { SentWorkUnit } from "./workProposal";

/** The closed list of one child (call only after requireAccess / requireLearnerPage). */
export async function loadTocContext(learnerId: string, trackId: string): Promise<TocContext> {
  const [map, tags] = await Promise.all([loadPickerMap(learnerId), loadTags(trackId)]);
  return buildTocContext(map, tags);
}

/** Every curriculum of one child with the version in use, its units, points and unit events (RLS: adults of that child only). */
export async function loadCurriculumCards(learnerId: string): Promise<CurriculumCard[]> {
  const db = await createUserClient();
  const q = async (table: string, columns: string) => {
    const { data, error } = await db.from(table).select(columns).eq("learner_id", learnerId);
    if (error) throw new Error(`${table} lookup failed: ${error.code ?? "error"}`);
    return data ?? [];
  };
  const [curricula, versions, units, points, events] = await Promise.all([
    q("curricula", "id, title, level_note, created_at"),
    q("curriculum_versions", "id, curriculum_id, version, status, error_code"),
    q("curriculum_units", "version_id, code, ord, title, section, page, skipped"),
    q("curriculum_unit_points", "version_id, code, tag_key, ord"),
    q("curriculum_unit_events", "id, curriculum_id, unit_code, status, created_at"),
  ]);
  return buildCards({ curricula, versions, units, points, events });
}

/** "Unit đã dạy hôm nay" of the session note. [] when 0026 is not applied yet (the session note must still open). */
export async function loadTaughtChoices(learnerId: string): Promise<TaughtChoice[]> {
  try {
    return taughtChoices(await loadCurriculumCards(learnerId));
  } catch {
    return [];
  }
}

/**
 * "Giao theo Unit": curricula with an approved version, their Units and Review rows (the stored payload of the version in use gives the
 * Review rows and which Units each one revises). [] when 0026 is missing or nothing is approved (the form then shows the old picker).
 */
export async function loadUnitChoices(learnerId: string): Promise<UnitChoice[]> {
  try {
    const cards = await loadCurriculumCards(learnerId);
    const ids = cards.flatMap((c) => (c.current ? [c.current.versionId] : []));
    if (ids.length === 0) return [];
    const { data, error } = await (await createUserClient()).from("curriculum_versions").select("id, payload").in("id", ids);
    if (error) return buildUnitChoices(cards, {});
    return buildUnitChoices(cards, Object.fromEntries((data ?? []).map((v) => [v.id as string, v.payload])));
  } catch {
    return [];
  }
}

/** The page calls the same handler as GET /api/curricula/versions/:id (one access path). No AI and no background job from a page. */
export async function loadVersionPage(versionId: string): Promise<{ kind: "ok"; data: VersionPageData } | { kind: "login" } | { kind: "not-found" }> {
  const user = await getAuthUser();
  // Warm the per-request member cache while the guard looks up the record's child; requireAccess then reuses the same read.
  if (user) void getMemberByUserId(user.id).catch(() => undefined);
  const deps: CurriculumDeps = {
    user,
    store: createSupabaseCurriculumStore(),
    storage: createFileStorage(),
    schedule: () => undefined,
    loadContext: loadTocContext,
    getAi: () => {
      throw new Error("no AI from a page");
    },
  };
  const res = await handleGetVersion(deps, versionId);
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  return { kind: "ok", data: res.body as VersionPageData };
}

/**
 * Units of work the child has sent (Studio tests given with Units, 0037; link / PDF work given with Units, 0029), for the
 * "Đang học" proposal. RLS: the adults of that child. A missing table (0037 not applied) or a failed read gives no rows: the page still opens.
 */
export async function loadSentWorkUnits(learnerId: string): Promise<SentWorkUnit[]> {
  const db = await createUserClient();
  const out: SentWorkUnit[] = [];
  try {
    const [su, at] = await Promise.all([
      db.from("studio_assignment_units").select("activity_id, inquiry_instance_id, curriculum_id, unit_code").eq("learner_id", learnerId)
        .returns<{ activity_id: string; inquiry_instance_id: string; curriculum_id: string; unit_code: string }[]>(),
      db.from("attempts").select("activity_instance_id, submitted_at").eq("learner_id", learnerId).returns<{ activity_instance_id: string; submitted_at: string }[]>(),
    ]);
    if (!su.error && !at.error && (su.data ?? []).length > 0) {
      const sent = new Map<string, string>();
      for (const a of at.data ?? []) if ((sent.get(a.activity_instance_id) ?? "") < a.submitted_at) sent.set(a.activity_instance_id, a.submitted_at);
      const ids = [...new Set((su.data ?? []).map((r) => r.inquiry_instance_id))];
      const inq = await db.from("inquiry_instances").select("id, title:snapshot->template->>title_vi").in("id", ids).returns<{ id: string; title: string | null }[]>();
      const titleOf = new Map((inq.error ? [] : (inq.data ?? [])).map((i) => [i.id, i.title ?? ""]));
      for (const r of su.data ?? []) {
        const at2 = sent.get(r.activity_id);
        if (at2) out.push({ curriculumId: r.curriculum_id, unitCode: r.unit_code, title: titleOf.get(r.inquiry_instance_id) ?? "", sentAt: at2 });
      }
    }
  } catch {
    /* no Studio rows */
  }
  try {
    const [au, sub, asg] = await Promise.all([
      db.from("assignment_units").select("assignment_id, curriculum_id, unit_code").eq("learner_id", learnerId)
        .returns<{ assignment_id: string; curriculum_id: string; unit_code: string }[]>(),
      db.from("submissions").select("assignment_id, created_at").eq("learner_id", learnerId).returns<{ assignment_id: string; created_at: string }[]>(),
      db.from("assignments").select("id, title").eq("learner_id", learnerId).returns<{ id: string; title: string }[]>(),
    ]);
    if (!au.error && !sub.error && !asg.error) {
      const sent = new Map<string, string>();
      for (const x of sub.data ?? []) if ((sent.get(x.assignment_id) ?? "") < x.created_at) sent.set(x.assignment_id, x.created_at);
      const titleOf = new Map((asg.data ?? []).map((a) => [a.id, a.title]));
      for (const r of au.data ?? []) {
        const at2 = sent.get(r.assignment_id);
        if (at2) out.push({ curriculumId: r.curriculum_id, unitCode: r.unit_code, title: titleOf.get(r.assignment_id) ?? "", sentAt: at2 });
      }
    }
  } catch {
    /* no link / PDF rows */
  }
  return out;
}
