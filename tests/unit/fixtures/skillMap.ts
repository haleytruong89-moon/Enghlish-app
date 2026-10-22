import type { SkillLeaf, SkillMapView } from "@/lib/skillmap/types";

const leaf = (kind: SkillLeaf["kind"], refKey: string, over: Partial<SkillLeaf> = {}): SkillLeaf => ({
  kind, trackId: "B", refKey, label: refKey, levelFrom: null, levelTo: null, taskFrom: null, taskTo: null,
  core: false, hiddenInPicker: false, related: [], custom: false, inSet: false, ...over,
});
const g = (key: string, name: string, leaves: SkillLeaf[] = []) => ({ key, name, descriptions: {}, leaves });

/** Small map for UI and grouping tests: every domain present, a hidden leaf, a family tag with a group, one without. */
export function fixtureMap(): SkillMapView {
  return {
    mapId: "SM-1",
    trackId: "B",
    assumed: { grammar: "B2", vocab: "B2", reading: "B2", listening: "B2", writing: "B2", speaking: "B2", thinking: 2 },
    domains: [
      { key: "grammar", name: "Ngữ pháp", scale: "cefr", groups: [
        g("gr-conditional", "Câu điều kiện & giả định", [leaf("tag", "cau-dieu-kien-dao-ngu")]),
        g("gr-emphasis", "Nhấn mạnh & đảo ngữ", [leaf("tag", "x-dao-ngu-phu-dinh-ab12c", { custom: true, label: "Đảo ngữ phủ định" })]),
        g("gr-transform", "Tổng hợp & biến đổi câu", [leaf("target", "B-L1-TRANSFORM-W", { inSet: true })]),
      ] },
      { key: "vocab", name: "Từ vựng", scale: "cefr", groups: [
        g("vo-word-form", "Dạng từ", [leaf("tag", "dang-tu")]),
        g("vo-colloc-idiom", "Kết hợp từ, cụm động từ, thành ngữ", [leaf("tag", "cum-dong-tu"), leaf("tag", "thanh-ngu")]),
      ] },
      { key: "reading", name: "Đọc", scale: "cefr", groups: [
        g("re-gist-detail", "Ý chính & chi tiết", [leaf("tag", "doc-main-idea"), leaf("tag", "doc-hieu", { hiddenInPicker: true })]),
      ] },
      { key: "listening", name: "Nghe", scale: "cefr", groups: [g("li-sound", "Âm & giọng")] },
      { key: "writing", name: "Viết", scale: "cefr", groups: [g("wr-cohesion", "Liên kết & mạch lạc", [leaf("tag", "tu-noi-lap-luan")])] },
      { key: "speaking", name: "Nói", scale: "cefr", groups: [g("sp-pron", "Phát âm & ngữ điệu", [leaf("tag", "phat-am")])] },
      { key: "thinking", name: "Tư duy & tự học", scale: "task_level", groups: [
        g("th-argue", "Lập luận & kết luận", [leaf("target", "B-T7-ARGUE", { inSet: true })]),
      ] },
    ],
    unassigned: [leaf("tag", "x-dao-ngu-hardly", { custom: true, label: "Đảo ngữ với hardly" })],
  };
}

/** SM-2 P4-c: the fixture map with levels on the vocab tags and a current vocab level of B2 (Nguyên). */
export function levelledMap(): SkillMapView {
  const m = fixtureMap();
  const vocab = m.domains[1]!;
  const [wordForm, colloc] = [vocab.groups[0]!, vocab.groups[1]!];
  wordForm.leaves = [{ ...wordForm.leaves[0]!, levelFrom: "B1", levelTo: "B2" }]; // dang-tu: near B2
  colloc.leaves = [
    { ...colloc.leaves[0]!, levelFrom: "A1", levelTo: "A1" }, // cum-dong-tu: two levels below B2 → far
    { ...colloc.leaves[1]!, levelFrom: "C1", levelTo: "C2" }, // thanh-ngu: C1 = B2 + 1 → near
  ];
  return { ...m, current: { vocab: "B2" } };
}
