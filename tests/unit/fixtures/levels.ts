import type { DomainLevel, LevelProfile } from "@/lib/levels/types";

const DOMAINS: Pick<DomainLevel, "key" | "name" | "scale">[] = [
  { key: "grammar", name: "Ngữ pháp", scale: "cefr" },
  { key: "vocab", name: "Từ vựng", scale: "cefr" },
  { key: "reading", name: "Đọc", scale: "cefr" },
  { key: "listening", name: "Nghe", scale: "cefr" },
  { key: "writing", name: "Viết", scale: "cefr" },
  { key: "speaking", name: "Nói", scale: "cefr" },
  { key: "thinking", name: "Tư duy & tự học", scale: "task_level" },
];

/** Nguyên (Track B) before any decision: every domain assumed B2 / bậc 2. */
export function assumedProfile(): LevelProfile {
  return {
    mapId: "SM-1",
    trackId: "B",
    domains: DOMAINS.map((d) => {
      const lv = d.scale === "cefr" ? "B2" : "2";
      return { ...d, current: lv, assumed: lv, status: "assumed", lastKind: null, decidedAt: null, decidedBy: null, external: null };
    }),
    history: [],
    externalResults: [],
    readingReports: [],
  };
}

/** After the tutor confirmed reading B2+ and writing B2 then adjusted writing to B1+, with one FCE result and one reading report. */
export function confirmedProfile(): LevelProfile {
  const p = assumedProfile();
  const set = (key: string, over: Partial<DomainLevel>) => {
    p.domains = p.domains.map((d) => (d.key === key ? { ...d, ...over } : d));
  };
  set("reading", {
    current: "B2+", status: "confirmed", lastKind: "baseline", decidedAt: "2026-10-21T03:00:00+00:00", decidedBy: "Cô Lan",
    external: { id: "e1", exam: "FCE", takenOn: "2026-09-12", scoreText: "172 · Grade B" },
  });
  set("writing", { current: "B1+", status: "confirmed", lastKind: "adjust", decidedAt: "2026-10-22T03:00:00+00:00", decidedBy: "Cô Lan" });
  p.history = [
    { id: "h3", domainKey: "writing", from: "B2", to: "B1+", kind: "adjust", reason: "Bài luận còn thiếu liên kết", decidedAt: "2026-10-22T03:00:00+00:00", decidedBy: "Cô Lan" },
    { id: "h2", domainKey: "writing", from: "B2", to: "B2", kind: "baseline", reason: null, decidedAt: "2026-10-21T03:00:01+00:00", decidedBy: "Cô Lan" },
    { id: "h1", domainKey: "reading", from: "B2", to: "B2+", kind: "baseline", reason: null, decidedAt: "2026-10-21T03:00:00+00:00", decidedBy: "Cô Lan" },
  ];
  p.externalResults = [
    {
      id: "e1", exam: "FCE", takenOn: "2026-09-12", scoreText: "172 · Grade B", domains: ["listening", "reading"], note: null,
      fileId: "f0000000-0000-4000-8000-000000000001", fileInherited: false, recordedBy: "Phụ huynh", recordedRole: "parent", recordedAt: "2026-09-13T01:00:00+00:00", replaces: null,
    },
  ];
  p.readingReports = [{ month: "2026-10-01", skills: 14 }];
  return p;
}
