# E2a · Gia sư (tra từ) + Sổ tay (Từ vựng) — Implementation Plan

> **Cho người / agent làm:** làm lần lượt từng việc. Bước dùng ô `- [ ]` để đánh dấu. Xong việc nào chạy test và commit việc đó.
> Trạng thái: **chờ phụ huynh duyệt plan** (spec đã duyệt 23/11).

**Mục tiêu:** con có mục **Gia sư** để tra một từ / cụm tiếng Anh và nhận thẻ từ theo khuôn §4.5, lưu vào mục **Sổ tay** (tab Từ vựng). Mẹ và thầy/cô của em đọc được con đã tra gì.

**Kiến trúc:**
- Màn của con gọi `POST /api/student/tutor/lookup`. Máy chủ lấy người dùng từ phiên đăng nhập. Hàm thuần `runLookup` (`lib/notebook/lookup.ts`) điều phối, store và model được tiêm vào như E1:
  1. ngữ cảnh + giới hạn lượt;
  2. chặn từ;
  3. cache thẻ;
  4. cổng chi phí;
  5. Sonnet soạn thẻ (một tool có schema);
  6. code kiểm + Haiku kiểm;
  7. viết lại 1 lần, không được thì câu cố định;
  8. ghi sổ AI + ghi lượt hỏi.
- Phiên âm do code ghép từ bảng `ipa_lexicon` (ipa-dict, MIT) **mỗi lần trả thẻ**. Phiên âm không bao giờ nằm trong thẻ AI soạn.
- Sổ tay, chấm 😊/😐/😕, "Con hỏi Gia sư" là hàm definer đọc / ghi bằng phiên đăng nhập (không AI).

**Tech Stack:** Next.js App Router · TypeScript strict · Tailwind · Supabase (schema `english`) · zod · Vitest (+ Postgres local) · Playwright (CI, `AI_FAKE=1`) · Anthropic Messages API (Sonnet 5.5 soạn, Haiku 5.5 kiểm / chọn nghĩa).

**Spec:** `docs/superpowers/specs/2026-11-22-gia-su-so-tay-design.md` (bản 0.2, đã duyệt 23/11). Đọc kèm: `docs/DESIGN.md` §19.31 (máy E1), `lib/tutor/turn.ts` (mẫu điều phối + sổ chi phí).

## Global Constraints

- Không có gì của gia sư trong bài làm (`TUTOR_IN_WORK` giữ tắt). (D-G1)
- Âm thanh không rời máy: chỉ dùng `speechSynthesis` với giọng `localService === true`; không ghi âm, không STT. (L5)
- Phiên âm không do AI viết. Trường phiên âm trong đầu ra của AI (nếu có) bị bỏ. (L3)
- Không gửi tên, bí danh, mã em cho AI. Chỉ gửi: từ, câu con gõ, dải cấp, ngôn ngữ giải thích. (D1)
- Track là cấu hình (`track_settings`: `tutor_language`, `tutor_band`, giới hạn lượt). Không `if (track === …)`.
- Chữ giao diện qua `lib/copy/vi.ts`. Xưng "bạn". Gia sư tên "Gia sư" (không "cô", không TOMO). Nút ≥ 44 px. Giao diện sáng.
- Màn của con: không điểm, không tổng câu đúng, không %. Số trên màn chỉ là số mục / lượt trong `data-count="work"`.
- Tab nào chưa chạy thì **không hiện** (không có ô "Sắp có").
- Migration: `db/migrations/0041_tutor_notebook.sql`. Chỉ thêm, idempotent, guard `0040`, kết thúc bằng insert `english.schema_migrations`. Bảng chỉ thêm gắn `eng_forbid_mutation`. Hàm definer `set search_path = ''`. Không đụng schema `public`. Không sửa migration 0001–0040.
- `ANTHROPIC_API_KEY` và `service_role` chỉ ở máy chủ.
- Trần chi phí tháng chung (`eng_ai_gate`). Giữ trước chi phí xấu nhất của một lượt, trả lại bằng lần chạy cuối cùng cùng `purpose`.
- Giới hạn mặc định: 60 lượt tra / ngày / em (tính cả cache); 30 lượt có gọi AI / ngày / em. Ngày theo giờ Việt Nam. (A1)
- Thẻ ≤ 3 nghĩa. Khóa cache: (`headword`, `band`, `language`). (A2)
- Tra không tự lưu; con bấm "+ Lưu vào Sổ tay". (A3)
- Ô tra chỉ nhận tiếng Anh, 1–4 từ, ≤ 40 ký tự. (A4)
- Văn bản đồng ý mới `ai-studio-tutor-v3`. Chưa có v3 thì tra từ mới trả "Gia sư đang nghỉ"; thẻ đã có trong cache và Sổ tay vẫn mở được.
- `npm run typecheck && npm run lint && npm test` xanh trước khi mở PR. Review (agent `reviewer`) trước khi mở PR.

---

## Bản đồ file

| File | Vai trò |
|---|---|
| `lib/notebook/ipa.ts` | Chuẩn hóa phiên âm ipa-dict (dấu nhấn về đầu âm tiết, ký hiệu dễ đọc), ghép phiên âm cụm từ. Thuần |
| `scripts/seed-ipa.ts` + `.github/workflows/seed-ipa.yml` | Nạp `ipa_lexicon` từ commit ipa-dict đã ghim, kiểm sha256 |
| `lib/notebook/input.ts` | Kiểm và chuẩn hóa từ con gõ; danh sách từ chặn. Thuần |
| `lib/notebook/card.ts` | zod của thẻ (khuôn §4.5), code kiểm thẻ, `CardView` gửi về trình duyệt. Thuần |
| `lib/notebook/prompt.ts` + `prompts/vocab-card.v1.md`, `vocab-check.v1.md`, `vocab-sense.v1.md`, `vocab-again.v1.md` | Dựng 4 loại lời gọi model. Thuần |
| `lib/notebook/lookup.ts` | `runLookup`, `runAgain`: điều phối một lượt (store + model tiêm vào). Thuần |
| `lib/notebook/supabaseStore.ts` | Gọi hàm 0041 bằng service role (sau khi route đã biết người dùng) |
| `lib/notebook/handlers.ts` | Kiểm body (zod), gọi `runLookup` / `runAgain` / lưu / bỏ / chấm |
| `app/api/student/tutor/lookup/route.ts`, `app/api/student/tutor/asks/[id]/again/route.ts`, `app/api/student/tutor/asks/[id]/rate/route.ts`, `app/api/student/notebook/route.ts`, `app/api/student/notebook/[id]/route.ts` | Route mỏng |
| `lib/student/notebook.ts` | Đọc của con: trạng thái gia sư, từ vừa tra, Sổ tay, một thẻ |
| `app/tutor/page.tsx`, `app/tutor/card/[cardId]/page.tsx`, `app/notebook/page.tsx` | Trang của con |
| `components/student/tutor/LookupForm.tsx`, `VocabCard.tsx`, `SpeakButton.tsx`, `RecentLookups.tsx` | Giao diện Gia sư |
| `components/student/notebook/NotebookList.tsx` | Danh sách Sổ tay |
| `components/student/desk/StudentTabs.tsx`, `StudentDeskShell.tsx`, `lib/student/desk.ts` | 6 mục khi đã áp 0041 |
| `app/learners/[id]/tutor-asks/page.tsx`, `lib/shell/nav.ts` | "Con hỏi Gia sư" cho người lớn |
| `lib/ai/config.ts`, `lib/copy/vi.ts`, `components/settings/AiSettingsForm.tsx` | Đồng ý v3, chữ Cài đặt AI |
| `scripts/eval-cards.ts`, `tests/eval/cards/cases.json`, `.github/workflows/eval-cards.yml` | Bộ test thẻ từ |

---

### Task 1: Phiên âm — chuẩn hóa, ghép cụm, nạp bảng

**Files:**
- Create: `lib/notebook/ipa.ts`, `tests/unit/notebookIpa.test.ts`, `scripts/seed-ipa.ts`, `.github/workflows/seed-ipa.yml`, `docs/THIRD_PARTY.md`
- Modify: `package.json` (script `db:seed-ipa`)

**Interfaces:**
- Produces:
  - `normalizeIpa(raw: string): string`
  - `parseIpaLine(line: string): { word: string; ipa: string[] } | null`
  - `phraseIpa(words: string[], lookup: Map<string, string[]>): string | null`
  - `IPA_SOURCE = { repo: "open-dict-data/ipa-dict", commit: "972cd67dd5f96bc5660e28070cde26e3928abcd7", files: { uk: { path: "data/en_UK.txt", sha256: "221394caef0cf723b4f2df81a98ac33191293257b88aed5b1fb89466d3a0dc77" }, us: { path: "data/en_US.txt", sha256: "2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67" } } }`

**Vì sao cần chuẩn hóa:** ipa-dict đặt dấu nhấn trước nguyên âm (`/vɒlkˈeɪnəʊ/`, `/mˈeɪk/`). Từ điển cho học sinh đặt dấu nhấn trước âm tiết (`/vɒlˈkeɪnəʊ/`, `/ˈmeɪk/`). Quy tắc code:
- Dời `ˈ` / `ˌ` về trước **cụm phụ âm đầu dài nhất còn hợp lệ trong tiếng Anh**, nằm ngay trước nó.
- `ɹ` → `r`.
- `ɐ` → `ʌ` nếu ngay sau dấu nhấn, ngược lại → `ə`.
- Bỏ dấu cách. Giữ dấu `/` hai đầu.

- [ ] **Step 1: Viết test hỏng**

```ts
import { describe, expect, it } from "vitest";
import { normalizeIpa, parseIpaLine, phraseIpa } from "@/lib/notebook/ipa";

describe("ipa-dict → learner-style IPA (code, never AI: L3)", () => {
  it.each([
    ["/mˈeɪk/", "/ˈmeɪk/"],
    ["/vɒlkˈeɪnəʊ/", "/vɒlˈkeɪnəʊ/"],          // "lk" is not an onset: only "k" moves
    ["/kɐθˈiːdɹəl/", "/kəˈθiːdrəl/"],
    ["/skˈɐlptʃə/", "/ˈskʌlptʃə/"],            // "sk" is an onset
    ["/ˈɑːdvɑːk/", "/ˈɑːdvɑːk/"],              // already first
    ["/ɪnfˈɔːmˌeɪʃən/", "/ɪnˈfɔːˌmeɪʃən/"],    // secondary stress too
    ["/stɹˈiːt/", "/ˈstriːt/"],                // "str" is an onset
  ])("%s → %s", (raw, want) => expect(normalizeIpa(raw)).toBe(want));

  it("reads one line with one or two variants", () => {
    expect(parseIpaLine("read\t/ˈɹɛd/, /ˈɹid/")).toEqual({ word: "read", ipa: ["/ˈɹɛd/", "/ˈɹid/"] });
    expect(parseIpaLine("")).toBeNull();
    expect(parseIpaLine("no-tab-here")).toBeNull();
  });

  it("a phrase is joined word by word; one missing word = no line at all", () => {
    const m = new Map([["make", ["/ˈmeɪk/"]], ["friends", ["/ˈfrendz/"]]]);
    expect(phraseIpa(["make", "friends"], m)).toBe("/ˈmeɪk ˈfrendz/");
    expect(phraseIpa(["make", "zzz"], m)).toBeNull();
    expect(phraseIpa(["make"], m)).toBe("/ˈmeɪk/");
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/notebookIpa.test.ts`. Kết quả mong đợi: FAIL (module không có).

- [ ] **Step 3: Viết `lib/notebook/ipa.ts`**

```ts
/** Learner-style IPA from ipa-dict (MIT, pinned commit). Pure; the AI never writes IPA (spec L3). */
export const IPA_SOURCE = {
  repo: "open-dict-data/ipa-dict",
  commit: "972cd67dd5f96bc5660e28070cde26e3928abcd7",
  files: {
    uk: { path: "data/en_UK.txt", sha256: "221394caef0cf723b4f2df81a98ac33191293257b88aed5b1fb89466d3a0dc77" },
    us: { path: "data/en_US.txt", sha256: "2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67" },
  },
} as const;

// English onsets written with the symbols ipa-dict uses (after ɹ → r). Tried longest first.
const ONSETS = ["spr", "str", "skr", "spl", "skw", "pr", "br", "tr", "dr", "kr", "gr", "ɡr", "fr", "θr", "ʃr", "pl", "bl", "kl", "gl", "ɡl", "fl", "sl",
  "sp", "st", "sk", "sm", "sn", "sw", "tw", "dw", "kw", "gw", "θw", "pj", "bj", "tj", "dj", "kj", "gj", "mj", "nj", "fj", "vj", "hj", "lj", "sj",
  "tʃ", "dʒ", "p", "b", "t", "d", "k", "g", "ɡ", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "m", "n", "l", "r", "w", "j"].sort((a, b) => b.length - a.length);

export function normalizeIpa(raw: string): string {
  const s = raw.trim().replace(/^\/|\/$/g, "").replace(/\s+/g, "").replace(/ɹ/g, "r");
  // Move each stress mark back over the longest valid onset that ends right before it.
  let out = "";
  for (const ch of s) {
    if (ch !== "ˈ" && ch !== "ˌ") { out += ch; continue; }
    const on = ONSETS.find((o) => out.endsWith(o));
    out = on ? out.slice(0, out.length - on.length) + ch + on : out + ch;
  }
  const fixed = out.replace(/([ˈˌ][^aeiouæɑɒɔəɛɜɪʊʌɐ]*)ɐ/g, "$1ʌ").replace(/ɐ/g, "ə");
  return `/${fixed}/`;
}

export function parseIpaLine(line: string): { word: string; ipa: string[] } | null {
  const tab = line.indexOf("\t");
  if (tab <= 0) return null;
  const word = line.slice(0, tab).trim().toLowerCase();
  const ipa = line.slice(tab + 1).split(",").map((x) => x.trim()).filter((x) => x.startsWith("/"));
  return word && ipa.length ? { word, ipa } : null;
}

/** "/ˈmeɪk ˈfrendz/" from already-normalized single words; null when any word is missing (spec §5.1). */
export function phraseIpa(words: string[], lookup: Map<string, string[]>): string | null {
  const parts: string[] = [];
  for (const w of words) {
    const v = lookup.get(w.toLowerCase())?.[0];
    if (!v) return null;
    parts.push(v.replace(/^\/|\/$/g, ""));
  }
  return parts.length ? `/${parts.join(" ")}/` : null;
}
```

Chạy lại test: nếu một ca trong bảng sai, sửa quy tắc. **Không** sửa ca mong đợi, vì các ca đó là dạng của từ điển học sinh.

- [ ] **Step 4:** Chạy lại test. Kết quả mong đợi: PASS.

- [ ] **Step 5: Script nạp `scripts/seed-ipa.ts`.** Script làm theo thứ tự:
  1. Tải `https://raw.githubusercontent.com/${repo}/${commit}/${path}` cho `uk` và `us`.
  2. So sha256 với `IPA_SOURCE`; lệch thì dừng, exit 1.
  3. `parseIpaLine` từng dòng, rồi `normalizeIpa` từng biến thể.
  4. Chèn theo lô 1000 dòng vào `english.ipa_lexicon(word, accent, ipa, source)` bằng `on conflict (word, accent) do update set ipa = excluded.ipa, source = excluded.source`. Bảng tham chiếu nên được phép cập nhật; không phải bảng chỉ thêm.
  5. Dùng `DATABASE_URL`, giống `scripts/apply-migrations`.
  6. Báo số dòng mỗi giọng.
  7. Chưa có bảng (chưa áp 0041) thì báo "Cần áp 0041 trước" và exit 1.

  Thêm vào `package.json`: `"db:seed-ipa": "tsx scripts/seed-ipa.ts"`.

- [ ] **Step 6: Workflow `.github/workflows/seed-ipa.yml`.**
  - Chỉ `workflow_dispatch`, có input `confirm` (phải gõ `SEED`).
  - Dùng secret `DATABASE_URL` như `apply-migrations.yml`.
  - Chạy `npm ci && npm run db:seed-ipa`.

- [ ] **Step 7: `docs/THIRD_PARTY.md`.** Ghi:
  - ipa-dict, MIT, © 2016 dohliam, commit đã ghim, file en_UK / en_US;
  - dữ liệu đã được chuẩn hóa bằng code.

- [ ] **Step 8:** `npm run typecheck && npx vitest run tests/unit/notebookIpa.test.ts`, rồi commit:

```bash
git add lib/notebook/ipa.ts tests/unit/notebookIpa.test.ts scripts/seed-ipa.ts .github/workflows/seed-ipa.yml docs/THIRD_PARTY.md package.json
git commit -m "E2a: learner-style IPA from ipa-dict (pinned, sha256) + seed script"
```

---

### Task 2: Từ con gõ + khuôn thẻ (thuần)

**Files:**
- Create: `lib/notebook/input.ts`, `lib/notebook/card.ts`, `tests/unit/notebookInput.test.ts`, `tests/unit/notebookCard.test.ts`

**Interfaces:**
- Produces (`input.ts`):
  - `type LookupInput = { word: string; context: string | null }`
  - `checkLookupInput(word: string, context?: string | null): { ok: true; headword: string; words: string[]; context: string | null } | { ok: false; code: "empty" | "too_long" | "not_english" | "too_many_words" }`
  - `isBlocked(headword: string): boolean`
- Produces (`card.ts`):
  - `cardContentSchema` (zod) và `type CardContent`
  - `cardToolOutputSchema` = `{ status: "ok", card: CardContent } | { status: "not_word", suggestions: string[] }`
  - `cardCodeReasons(card: CardContent, opts: { headword: string; language: string }): string[]`
  - `type CardView = CardContent & { cardId: string; ipa: { uk: string | null; us: string | null }; sense: number | null }`

**Quy tắc `checkLookupInput`:**
- trim, gộp khoảng trắng, đổi dấu nháy cong thành `'`, chữ thường;
- rỗng → `empty`;
- > 40 ký tự → `too_long`;
- có ký tự ngoài `[a-z' -]` (kể cả chữ có dấu tiếng Việt, số) → `not_english`;
- > 4 từ → `too_many_words`;
- `context`: trim, ≤ 200 ký tự (cắt bớt), rỗng → `null`.

**Từ chặn (`isBlocked`):** danh sách ngắn trong file (từ tục / người lớn phổ biến + biến thể có `*`, `-`); so theo từng từ của cụm. Danh sách nằm trong code, không gửi AI.

**Khuôn thẻ (§4.5 + §5.1):**

```ts
import { z } from "zod";
const line = (max: number) => z.string().trim().min(1).max(max);
export const cardContentSchema = z.strictObject({
  headword: line(40),                      // lemma: "go" when the child typed "went"
  forms: z.array(line(40)).min(1).max(12), // inflections incl. headword: cache matches any of them
  pos: line(30),
  lemma_note: line(120).nullable(),         // "went là quá khứ của go"
  senses: z.array(z.strictObject({ meaning_vi: line(120), meaning_en: line(160).nullable() })).min(1).max(3),
  guess: z.strictObject({ q: line(240), options: z.tuple([line(160), line(160)]), right: z.union([z.literal(0), z.literal(1)]), yes: line(200), no: line(200) }),
  core: line(160),
  examples: z.array(z.strictObject({ en: line(160), vi: line(160) })).min(2).max(3),
  why: line(600),
  vn: line(300),
  trap: line(300),
  stress_tip: line(160),
  family: z.array(z.strictObject({ form: line(40), pos: line(20) })).max(5),
  collocations: z.array(line(60)).min(3).max(5),
  related: z.array(line(40)).min(3).max(5),
  checks: z.array(z.strictObject({ q: line(200), options: z.array(line(80)).min(2).max(4), right: z.number().int().min(0).max(3), note: line(200) })).min(1).max(3),
  task: line(200),
});
export type CardContent = z.infer<typeof cardContentSchema>;
```

**`cardCodeReasons` trả lý do (mảng rỗng = đạt):**

| Lý do | Khi nào |
|---|---|
| `example_missing_word` | Một câu ví dụ không chứa `headword` hay một dạng trong `forms` / `family` (so theo ranh giới từ, không phân biệt hoa thường) |
| `forms_missing_headword` | `forms` không chứa `headword` |
| `check_right_out_of_range` | `right` ≥ số lựa chọn |
| `options_not_distinct` | Hai lựa chọn giống nhau sau trim + chữ thường (ở `guess` hoặc ở một câu `checks`) |
| `has_url` | Có `http`, `www.` hoặc `.com` ở bất kỳ chuỗi nào |
| `has_ipa` | Có ký tự IPA trong `/…/` ở bất kỳ chuỗi nào (L3) |
| `too_many_lines` | `why` quá `maxLines` theo ngôn ngữ (`vi` 4 dòng, `en_first` 5 dòng); đếm theo `\n` và theo mỗi 110 ký tự là một dòng |
| `missing_vietnamese` | Ngôn ngữ `vi` mà `senses[*].meaning_vi` không có chữ có dấu tiếng Việt và cũng không phải một từ tiếng Việt không dấu ngắn ≥ 2 ký tự. Đơn giản: phải có ít nhất 1 nghĩa chứa ký tự `[à-ỹđ]` |

- [ ] **Step 1: Test hỏng.**
  - `tests/unit/notebookInput.test.ts`, các ca:
    - `"  Make  Friends "` → `{ ok, headword: "make friends", words: ["make","friends"] }`;
    - `"don’t"` → `"don't"`;
    - `"núi lửa"` → `not_english`;
    - `"a b c d e"` → `too_many_words`;
    - 41 ký tự → `too_long`;
    - `""` → `empty`;
    - context 250 ký tự → cắt còn 200;
    - `isBlocked` đúng với một từ trong danh sách và với cụm chứa nó; sai với `"make"`.
  - `tests/unit/notebookCard.test.ts`:
    - dựng `GOOD` (thẻ "make" đúng như bản vẽ: `headword "make"`, `forms ["make","makes","made","making"]`, …) → `cardCodeReasons` = `[]`;
    - mỗi dòng bảng trên có một ca hỏng riêng (sửa một trường của `GOOD`) → đúng lý do;
    - `cardContentSchema` từ chối trường lạ (`ipa: "/x/"`) vì `strictObject`.

- [ ] **Step 2:** Chạy, mong đợi FAIL.
- [ ] **Step 3:** Viết `input.ts`, `card.ts` theo quy tắc trên.
- [ ] **Step 4:** Chạy, mong đợi PASS.
- [ ] **Step 5:** Commit `E2a: lookup input rules + vocab card shape and code checks`.

---

### Task 3: Migration `0041_tutor_notebook.sql` + test DB

**Files:**
- Create: `db/migrations/0041_tutor_notebook.sql`, `tests/db/tutorNotebook.test.ts`
- Modify: `tests/unit/migrations*.test.ts` (test tĩnh: danh sách migration có 0041, nếu file test liệt kê)

**Interfaces (hàm SQL; tên và tham số dùng ở Task 5–8):**

| Hàm | Ai gọi | Trả về |
|---|---|---|
| `eng_lookup_context(p_user uuid, p_client_id text, p_ask uuid default null)` | service_role | `{learner_id, family_id, language, band, lookups_today, lookup_limit, ai_lookups_today, ai_lookup_limit, consent_version, ask}` hoặc `{replay: {kind, card_id, sense, shown_text, fixed_code}}`. `ask` = `{card_id}` khi `p_ask` là lượt `lookup` có thẻ của chính em, ngược lại `null` |
| `eng_vocab_card_by_id(p_card uuid)` | service_role | `{id, content}` hoặc `null` |
| `eng_vocab_card_find(p_word text, p_band text, p_language text)` | service_role | `{id, content}` của bản hiện hành có `headword = p_word` hoặc `p_word = any(forms)`; không có → `null` |
| `eng_save_vocab_card(p_band text, p_language text, p_content jsonb, p_prompt_version text, p_model text, p_supersedes uuid)` | service_role | `uuid`. `headword`, `forms` lấy từ `p_content`. `p_supersedes` phải là bản hiện hành cùng khóa, nếu không thì lỗi `(bad_supersedes)` |
| `eng_record_tutor_ask(p_user uuid, p_kind text, p_child_text text, p_context_text text, p_card uuid, p_sense smallint, p_parent_ask uuid, p_shown_text text, p_guard text, p_reasons text[], p_flags text[], p_fixed_code text, p_used_ai boolean, p_prompt_version text, p_model text, p_runs uuid[], p_cost numeric, p_client_id text)` | service_role | `{id, replayed}`. Idempotent theo (`learner_id`, `client_id`) |
| `eng_ipa_for(p_words text[])` | service_role | `[{word, accent, ipa}]` |
| `eng_my_tutor_status()` | authenticated (con) | `{language, band, lookups_today, lookup_limit, consent_version, ai_enabled}`; không phải con → `null` |
| `eng_my_recent_lookups(p_limit int)` | con | `[{ask_id, headword, card_id, at}]`, mới nhất trước, gộp theo thẻ, tối đa `p_limit` (≤ 20) |
| `eng_my_vocab_card(p_card uuid)` | con | `{id, content, current_id}`: bản hiện hành cùng khóa của thẻ đó (§9) |
| `eng_my_notebook(p_kind text)` | con | `[{item_id, card_id, headword, meaning, saved_at, state}]`, `state` = `active` / `removed` |
| `eng_notebook_save(p_card uuid, p_client_id text)` | con | `{item_id, already}`. Đã có mục `word` cùng `headword` đang `active` thì `already = true`, không tạo mới |
| `eng_notebook_set(p_item uuid, p_action text)` | con | `{item_id, state}`; `p_action` ∈ `remove`, `restore`; chỉ mục của chính con |
| `eng_rate_tutor_ask(p_ask uuid, p_rating text)` | con | `{ask_id, rating}`; `p_rating` ∈ `good`, `ok`, `confused`; chỉ lượt của chính con |
| `eng_tutor_asks_for(p_learner uuid, p_before timestamptz, p_limit int)` | authenticated (người lớn) | `eng_is_staff_of(p_learner)` sai → lỗi `42501`. `[{id, at, kind, child_text, context_text, headword, card_id, fixed_code, saved, rating}]` |

**Bảng:**

```sql
create table if not exists english.ipa_lexicon (
  word text not null check (pg_catalog.length(word) between 1 and 60),
  accent text not null check (accent in ('uk', 'us')),
  ipa text[] not null check (cardinality(ipa) between 1 and 4),
  source text not null check (pg_catalog.length(source) between 1 and 120),
  primary key (word, accent)
);
-- reference data: authenticated may read; only the owner (seed script via DATABASE_URL) writes.

create table if not exists english.vocab_cards (
  id uuid primary key default gen_random_uuid(),
  headword text not null check (headword ~ '^[a-z'' -]{1,40}$'),
  forms text[] not null check (cardinality(forms) between 1 and 12),
  band text not null check (pg_catalog.length(band) between 1 and 20),
  language text not null check (language in ('vi', 'en_first')),
  content jsonb not null,
  prompt_version text not null check (prompt_version ~ '^[a-z0-9_.-]{1,60}$'),
  model text not null check (pg_catalog.length(model) between 1 and 100),
  supersedes uuid references english.vocab_cards(id),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists vocab_cards_key_idx on english.vocab_cards(headword, band, language, created_at desc);
create index if not exists vocab_cards_forms_idx on english.vocab_cards using gin (forms);
create unique index if not exists vocab_cards_one_successor on english.vocab_cards(supersedes) where supersedes is not null;

create table if not exists english.tutor_asks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  kind text not null check (kind in ('lookup', 'again')),           -- E2b/E3 add sentence, grammar, explain
  child_text text not null check (pg_catalog.length(child_text) between 1 and 40),
  context_text text check (context_text is null or pg_catalog.length(context_text) between 1 and 200),
  card_id uuid references english.vocab_cards(id),
  sense smallint check (sense is null or sense between 0 and 2),
  parent_ask uuid references english.tutor_asks(id),                  -- "again" points at the lookup it explains again
  shown_text text check (shown_text is null or pg_catalog.length(shown_text) between 1 and 2000),
  guard text not null check (guard in ('cache', 'pass', 'rewritten', 'fixed')),
  reasons text[] not null default '{}',
  flags text[] not null default '{}' check (flags <@ array['injection_attempt', 'off_topic']),
  fixed_code text check (fixed_code is null or fixed_code ~ '^[a-z_]{1,40}$'),
  used_ai boolean not null default false,
  prompt_version text check (prompt_version is null or prompt_version ~ '^[a-z0-9_.-]{1,60}$'),
  model text check (model is null or pg_catalog.length(model) between 1 and 100),
  run_ids uuid[] not null default '{}',
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint tutor_asks_fixed_shape check ((guard = 'fixed') = (fixed_code is not null)),
  constraint tutor_asks_card_shape check (guard = 'fixed' or card_id is not null or kind = 'again')
);
create index if not exists tutor_asks_learner_idx on english.tutor_asks(learner_id, created_at desc);

create table if not exists english.tutor_ask_ratings (
  id uuid primary key default gen_random_uuid(),
  ask_id uuid not null references english.tutor_asks(id),
  learner_id uuid not null references english.learners(id),
  rating text not null check (rating in ('good', 'ok', 'confused')),
  at timestamptz not null default clock_timestamp()
);

create table if not exists english.notebook_items (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  kind text not null check (kind in ('word')),                         -- E3 adds grammar
  card_id uuid not null references english.vocab_cards(id),
  headword text not null,
  source text not null check (source in ('lookup')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create table if not exists english.notebook_item_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references english.notebook_items(id),
  learner_id uuid not null references english.learners(id),
  action text not null check (action in ('remove', 'restore')),
  at timestamptz not null default clock_timestamp()
);
```

**Còn lại trong migration (theo thứ tự):**
1. Guard: cần `0040` (`raise ... (missing_0040)`).
2. `ai_runs.purpose` thêm `vocab_card`, `vocab_check`, `vocab_sense`, `vocab_again`. Thay `ai_runs_purpose_check`, rồi `create or replace` `eng_ai_gate` và `eng_log_ai_run`: **chép nguyên thân từ 0039 (dòng 32–122)**, chỉ đổi hai danh sách purpose thành `('studio_extract', 'curriculum_toc', 'read_answers', 'tutor_hint', 'tutor_check', 'vocab_card', 'vocab_check', 'vocab_sense', 'vocab_again')`. Giữ nguyên chữ ký và grant.
3. `track_settings` (on conflict do nothing):
   - `('A','tutor_lookup_daily_limit','60')`, `('B','tutor_lookup_daily_limit','60')`;
   - `('A','tutor_lookup_ai_daily_limit','30')`, `('B','tutor_lookup_ai_daily_limit','30')`.
4. Vòng `do $$ ... foreach t in array array['vocab_cards','tutor_asks','tutor_ask_ratings','notebook_items','notebook_item_events']` như 0039 dòng 254–270:
   - trigger `eng_forbid_mutation`;
   - RLS bật; revoke all; không grant select cho `authenticated`, vì mọi đọc đi qua hàm.
   - `vocab_cards` dùng `eng_forbid_mutation()` không tham số (không có `learner_id`).
   - `ipa_lexicon`: RLS bật, `grant select to authenticated, service_role`, policy select `using (true)`; không trigger.
5. Các hàm ở bảng Interfaces:
   - hàm của con tìm member bằng `auth.uid()` + `role = 'student'`, giống `eng_my_task_parts` (0038);
   - hàm service nhận `p_user` và tự tìm em của user đó (`learners.member_id`), không tin tầng trên;
   - "hôm nay" = `(created_at at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date`;
   - `lookups_today` đếm mọi `tutor_asks` hôm nay của em, trừ `fixed_code in ('daily_limit','ai_daily_limit')`;
   - `ai_lookups_today` đếm `used_ai`;
   - `consent_version` = `notice_version` của dòng `consents` `ai_text` mới nhất đang `granted` (cùng cách `eng_tutor_context` của 0039);
   - grant: hàm service → `service_role`; hàm của con / người lớn → `authenticated`; revoke `public, anon`.
6. `eng_purge_learner` / `eng_purge_preview`: **chép nguyên thân mới nhất trong 0039 (dòng 426–1027)**. Thêm xóa / đếm theo thứ tự `tutor_ask_ratings`, `notebook_item_events`, `notebook_items`, `tutor_asks` (theo `learner_id`), đặt **trước** dòng xử lý `tutor_turns` (bảng con trước, khóa ngoại). Xóa qua cơ chế purge giống `tutor_turns` (xem cách 0039 tắt / mở trigger trong thân). `vocab_cards` và `ipa_lexicon` không xóa.
7. `insert into english.schema_migrations(version) values ('0041') on conflict do nothing;`

- [ ] **Step 1: Test DB hỏng** `tests/db/tutorNotebook.test.ts`. Dùng mẫu helpers của `tests/db/tutorHints.test.ts` (`createTestDb`, `migrate`, `seed`, `asCommit`). Các ca:
  1. `eng_lookup_context` của An: `language "vi"`, `band "A2-B1"`, `lookup_limit 60`, `ai_lookup_limit 30`, đếm 0. Gọi bằng user của phụ huynh / thầy cô → lỗi `42501`.
  2. `eng_save_vocab_card` rồi `eng_vocab_card_find('made','A2-B1','vi')` tìm thấy qua `forms`. Lưu bản thay thế với `p_supersedes` → find trả bản mới. Thay thế lần hai cùng `p_supersedes` → lỗi `(bad_supersedes)`.
  2b. `eng_lookup_context(..., p_ask)` với lượt của em → `ask.card_id`; với lượt của em kia → `ask null`.
  3. `eng_record_tutor_ask` hai lần cùng `client_id` → lần hai `replayed = true`, chỉ có 1 dòng. Đếm `lookups_today` tăng 1; `used_ai = true` thì `ai_lookups_today` tăng.
  4. Bảng chỉ thêm: `update` / `delete` `tutor_asks` bằng owner → lỗi trigger.
  5. Con An: `eng_notebook_save` → `already false`; lưu lần hai cùng thẻ → `already true`; `eng_my_notebook('word')` có 1 mục `active`; `eng_notebook_set(item,'remove')` → `removed`; `restore` → `active`.
  6. Con Nguyên không bỏ được mục của An (lỗi `42501`). Con Nguyên `eng_my_notebook` không thấy mục của An.
  7. Con **không** `select` được `tutor_asks` trực tiếp (0 dòng / lỗi quyền). `eng_tutor_asks_for(An)` bằng phụ huynh → thấy lượt; bằng thầy/cô của An → thấy; bằng thầy/cô của Nguyên → `42501`.
  8. `eng_rate_tutor_ask` của con trên lượt của mình → OK; trên lượt của em kia → `42501`; `eng_tutor_asks_for` trả `rating` mới nhất.
  9. `eng_ai_gate(..., p_purpose => 'vocab_card')` giữ trước được; `eng_log_ai_run` trả lại với `vocab_card`.
  10. `eng_purge_preview(An)` đếm 4 bảng mới; `eng_purge_learner` xóa sạch mục của An, giữ `vocab_cards`.
  11. Chạy lại toàn bộ migration lần hai → không lỗi.
- [ ] **Step 2:** `npx vitest run tests/db/tutorNotebook.test.ts` (cần Postgres local; xem `docs/PROGRESS.md`). Mong đợi FAIL.
- [ ] **Step 3:** Viết migration.
- [ ] **Step 4:** Chạy lại test DB + `npx vitest run tests/db/tutorHints.test.ts` (không hỏng E1). Mong đợi PASS.
- [ ] **Step 5:** Commit `E2a: migration 0041 (tutor asks, vocab cards, notebook, IPA table)`.

---

### Task 4: Prompt + dựng lời gọi model + bản giả cho CI

**Files:**
- Create:
  - `prompts/vocab-card.v1.md`, `prompts/vocab-check.v1.md`, `prompts/vocab-sense.v1.md`, `prompts/vocab-again.v1.md`;
  - `lib/notebook/prompt.ts`;
  - `tests/fixtures/notebook/fake-card.json`, `fake-card-check.json`, `fake-sense.json`, `fake-again.json`;
  - `tests/unit/notebookPrompt.test.ts`.
- Modify: `lib/ai/config.ts` (`AI_FAKE_FIXTURES` thêm 4 tool).

**Interfaces:**
- Produces:
  - `CARD_PROMPT`, `CARD_CHECK_PROMPT`, `SENSE_PROMPT`, `AGAIN_PROMPT` dạng `{ file, version }` với version `"vocab-card.v1"`, …;
  - `cardTool` (`name: "save_vocab_card"`, schema = `cardToolOutputSchema` viết tay dạng JSON Schema);
  - `cardCheckTool` (`"check_vocab_card"`, `{pass: boolean, reasons: ("wrong_meaning"|"not_age_appropriate"|"level_mismatch"|"off_topic"|"wrong_check_answer"|"reveals_private")[]}`);
  - `senseTool` (`"pick_sense"`, `{index: integer -1..2}`);
  - `againTool` (`"explain_again"`, `{angle: "picture"|"everyday"|"vietnamese", core: string, examples: [{en,vi}] (2), task: string}`);
  - `buildCardCall({template, model, word, context, language, band, rewriteFor?, keepSenses?, toolChoice}): ToolCall`;
  - `buildCardCheckCall({template, model, card, language, band, toolChoice}): ToolCall`;
  - `buildSenseCall({template, model, card, context, toolChoice}): ToolCall`;
  - `buildAgainCall({template, model, card, language, band, toolChoice}): ToolCall`;
  - `CARD_MAX_TOKENS = 6000`, `CHECK_MAX_TOKENS = 1500`, `SENSE_MAX_TOKENS = 800`, `AGAIN_MAX_TOKENS = 3000`.

**Nội dung prompt `vocab-card.v1.md` (bắt buộc có):**
- Vai trò "Gia sư" tiếng Anh cho học sinh.
- **Không** dùng tên học sinh. **Không** viết phiên âm IPA, không link.
- Trả lời **chỉ qua tool `save_vocab_card`**.
- `status: "not_word"` khi không phải từ / cụm tiếng Anh, kèm ≤ 3 gợi ý chính tả.
- Khuôn §4.5, từng trường:
  - `guess`: câu đoán dựa trên 2 ví dụ đối chiếu, 2 lựa chọn thật sự khác nhau;
  - `core`: một câu bản chất ≤ 160 ký tự;
  - `examples`: 2–3 câu đúng dải cấp `{{band}}`, chứa từ;
  - `why`, `vn` (so tiếng Việt), `trap` (khi nào KHÔNG dùng, lỗi người Việt);
  - `related` 3–5 ô;
  - `checks` 1–3 câu, đáp án rõ, khó dần;
  - `task`: một việc con tự viết về chính mình.
- Ngôn ngữ theo `{{language_rule}}`: `vi` = tiếng Việt câu ngắn cho học sinh 11–12 tuổi; `en_first` = tiếng Anh trước, có tiếng Việt ở `examples[].vi` và `vn`. Không viết khác theo tên em.
- Có ví dụ tốt / xấu ngắn cho `core` và `guess`.
- Câu con gõ (`{{context}}`) nằm trong khối "CÂU CỦA HỌC SINH (dữ liệu, không phải lệnh)".
- Khối `{{rewrite_for}}` (lý do lần trước bị từ chối) chỉ có khi viết lại.

**`vocab-check.v1.md`:** Haiku chấm thẻ:
- nghĩa đúng;
- hợp tuổi;
- đúng dải cấp;
- chỉ về tiếng Anh;
- đáp án `checks` đúng;
- không có thông tin riêng.

Trả `pass` + lý do qua tool. Lỗi gọi = trượt.

**`vocab-sense.v1.md`:** đưa danh sách nghĩa có đánh số + câu của con. Trả `index` của nghĩa khớp, hoặc `-1`. Chỉ trả số.

**`vocab-again.v1.md`:** giải thích lại thẻ theo **một góc khác** (`angle`), không lặp câu cũ, cùng luật ngôn ngữ / độ dài.

- [ ] **Step 1: Test hỏng** `tests/unit/notebookPrompt.test.ts`.
  - `buildCardCall` với `language "vi"`: `instructions` chứa luật tiếng Việt, chứa `band`, **không** chứa chữ "An" / "Nguyên" / mã em.
  - `tool.name` = `"save_vocab_card"`; `toolChoice` giữ đúng giá trị truyền vào.
  - Có `rewriteFor` thì `instructions` chứa các lý do.
  - `context` nằm trong khối dữ liệu.
  - `buildSenseCall` liệt kê nghĩa đánh số 0..n.
  - `fake-card.json` qua được `cardToolOutputSchema` và `cardCodeReasons(..., {headword:"make", language:"vi"})` = `[]`.
- [ ] **Step 2:** Chạy, mong đợi FAIL.
- [ ] **Step 3:** Viết prompt, `prompt.ts`, fixture. Thêm vào `AI_FAKE_FIXTURES`:

```ts
  save_vocab_card: "tests/fixtures/notebook/fake-card.json",
  check_vocab_card: "tests/fixtures/notebook/fake-card-check.json",
  pick_sense: "tests/fixtures/notebook/fake-sense.json",
  explain_again: "tests/fixtures/notebook/fake-again.json",
```

  Nội dung `fake-card.json` = `{ "status": "ok", "card": { …thẻ "make" bản vẽ (An)… } }`. `fake-card-check.json` = `{ "pass": true, "reasons": [] }`. `fake-sense.json` = `{ "index": 0 }`. `fake-again.json` có góc `"picture"` và 2 ví dụ.

- [ ] **Step 4:** Chạy, mong đợi PASS.
- [ ] **Step 5:** Commit `E2a: vocab card prompts v1 + call builders + AI_FAKE fixtures`.

---

### Task 5: Một lượt tra từ (`runLookup`) + "Chưa hiểu" (`runAgain`)

**Files:**
- Create: `lib/notebook/lookup.ts`, `lib/notebook/supabaseStore.ts`, `tests/unit/notebookLookup.test.ts`

**Interfaces:**
- Consumes: Task 1 (`normalizeIpa` đã áp lúc nạp, `phraseIpa`), Task 2 (`checkLookupInput`, `isBlocked`, `cardToolOutputSchema`, `cardCodeReasons`, `CardView`), Task 3 (hàm SQL), Task 4 (builders, tools).
- Produces:

```ts
export type LookupStore = {
  context(a: { userId: string; clientId: string; askId?: string }): Promise<unknown>;
  findCard(a: { word: string; band: string; language: string }): Promise<{ id: string; content: unknown } | null>;
  cardById(id: string): Promise<{ id: string; content: unknown } | null>;
  saveCard(a: { band: string; language: string; content: CardContent; promptVersion: string; model: string; supersedes: string | null }): Promise<string>;
  ipa(words: string[]): Promise<{ word: string; accent: "uk" | "us"; ipa: string[] }[]>;
  gate(a: { learnerId: string; estimate: number; model: string; purpose: "vocab_card" | "vocab_sense" | "vocab_again" }): Promise<unknown>;
  logRun(a: { familyId: string; model: string; promptVersion: string; input: number; output: number; cost: number; status: "ok" | "error"; error: string | null; release: string | null; purpose: "vocab_card" | "vocab_check" | "vocab_sense" | "vocab_again" }): Promise<string>;
  record(a: { userId: string; kind: "lookup" | "again"; childText: string; contextText: string | null; cardId: string | null; sense: number | null; parentAsk: string | null; shown: string | null; guard: "cache" | "pass" | "rewritten" | "fixed"; reasons: string[]; flags: string[]; fixedCode: LookupFixed | null; usedAi: boolean; promptVersion: string | null; model: string | null; runs: string[]; cost: number; clientId: string }): Promise<{ id: string; replayed: boolean }>;
};
export type LookupFixed = "daily_limit" | "ai_daily_limit" | "blocked" | "ai_off" | "card_failed" | "ai_error" | "not_word";
export type LookupDeps = { store: LookupStore; noticeVersion: string; call: (c: ToolCall, o?: { timeoutMs?: number }) => Promise<ToolResult>; now?: () => number; prompts: { card: string; check: string; sense: string; again: string }; models: { card: string; check: string; toolChoice?: "tool" | "auto" } };
export type LookupBody =
  | { kind: "card"; askId: string; card: CardView; replayed: boolean }
  | { kind: "not_word"; askId: string; suggestions: string[] }
  | { kind: "fixed"; askId: string | null; fixed: LookupFixed }
  | { kind: "again"; askId: string; again: { angle: string; core: string; examples: { en: string; vi: string }[]; task: string } };
export type LookupResult = { status: 200 | 201 | 400 | 404 | 409; body: LookupBody | { error: string } };
export async function runLookup(deps: LookupDeps, input: { userId: string; word: string; context: string | null; clientId: string }): Promise<LookupResult>;
export async function runAgain(deps: LookupDeps, input: { userId: string; askId: string; clientId: string }): Promise<LookupResult>;
export const LOOKUP_RESERVE_USD = 0.08;
```

**Luồng `runLookup` (đúng thứ tự):**
1. `checkLookupInput`. Lỗi → `400 {error: code}`, không ghi gì.
2. `store.context`. Có `replay` → trả lại lượt cũ: có `card_id` thì đọc thẻ bằng `store.cardById` và dựng `CardView`; lượt cố định thì trả `kind fixed` / `not_word` như lần đầu. Status 200, `replayed: true`.
3. `lookups_today >= lookup_limit` → ghi `fixed daily_limit` (`guard fixed`), trả `kind fixed`.
4. `isBlocked(headword)` → ghi `fixed blocked`, không AI.
5. `findCard(headword)`:
   - có thẻ + không `context` → ghi `guard cache`, `used_ai false` → trả thẻ (201);
   - có thẻ + có `context` → cần AI (bước 6) → `buildSenseCall` (Haiku). `index ≥ 0` → ghi `guard cache`, `sense = index`, `used_ai true`. `index = -1` → soạn **bản mới** (bước 7, `keepSenses` = các nghĩa cũ, `supersedes` = id cũ).
6. Cổng AI, theo thứ tự:
   - `consent_version !== noticeVersion` → `fixed ai_off`;
   - `ai_lookups_today >= ai_lookup_limit` → `fixed ai_daily_limit`;
   - model chưa có giá → `fixed ai_error`;
   - `gate` (giữ trước `LOOKUP_RESERVE_USD`, `purpose` theo việc) không cho → `fixed ai_off`.
7. Soạn thẻ:
   - `buildCardCall` → `cardToolOutputSchema`. `not_word` → gợi ý lọc `/^[a-z' -]{1,40}$/`, tối đa 3 → ghi `guard fixed`, `fixed_code 'not_word'`, `shown_text` = gợi ý nối bằng `, ` (hoặc `null` nếu không còn gợi ý), `used_ai true`. Trả `kind not_word`.
   - `ok` → `cardCodeReasons`. Rỗng → Haiku `buildCardCheckCall`. Lỗi Haiku = trượt.
   - Trượt → soạn lại 1 lần với `rewriteFor`. Trượt nữa → `fixed card_failed`.
8. Đạt → `saveCard` (bỏ mọi trường lạ; `content` đã qua zod) → ghi lượt (`guard pass` / `rewritten`, `used_ai true`).
9. Ghi sổ AI **ở cuối** như E1 (`pending` + `flush`), trả giữ chỗ bằng lần chạy cuối cùng có cùng `purpose` với lúc giữ (`vocab_card` / `vocab_sense`). Mọi lỗi model đều là câu cố định, không bao giờ 500.
10. Dựng `CardView`:
    - `ipa` từ `store.ipa(words của headword)`: lấy biến thể đầu cho mỗi giọng, rồi `phraseIpa`;
    - `sense` từ bước 5;
    - `cardId`.
11. Hạn thời gian một lượt: `TURN_BUDGET_MS`, `CALL_MAX_MS`, `CALL_MIN_MS` giống `lib/tutor/turn.ts` (chép hằng, không import chéo `turn.ts` để tránh dính E1).

**Luồng `runAgain`:**
- `store.context({userId, clientId, askId})`. `ask` là `null` (lượt không phải của con, không phải `lookup`, hoặc không có thẻ) → `404 not_found`. Có `replay` → trả lại như lần đầu.
- Tính là một lượt AI. Cổng như bước 6 (`purpose vocab_again`).
- `buildAgainCall` → kiểm code (độ dài, không URL, không IPA) + Haiku `check_vocab_card` (dùng cùng tool, đưa nội dung giải thích lại).
- Trượt → viết lại 1 lần → `fixed card_failed`.
- Ghi `kind again`, `parent_ask`, `shown_text` = JSON của khối đã qua kiểm.


- [ ] **Step 1: Test hỏng** `tests/unit/notebookLookup.test.ts`. Dùng store trong bộ nhớ + model giả (mẫu `tests/unit/tutorTurn.test.ts`). Các ca:
  1. Từ có trong cache, không câu → `kind card`, `guard cache`, **không** gọi model, **không** gọi `gate`.
  2. Cache + câu → gọi Haiku `pick_sense` → `sense 0`, `used_ai true`, 1 dòng sổ `vocab_sense` trả giữ chỗ.
  3. Cache + câu + `index -1` → soạn bản mới với `supersedes` = id cũ.
  4. Không cache → Sonnet → code đạt → Haiku đạt → `saveCard` 1 lần, sổ có `vocab_card` + `vocab_check`, giữ chỗ trả bằng dòng `vocab_card` cuối.
  5. Thẻ có ví dụ thiếu từ → viết lại → đạt → `guard rewritten`.
  6. Trượt 2 lần → `fixed card_failed`, không lưu thẻ.
  7. Haiku lỗi mạng → coi như trượt.
  8. `not_word` → `kind not_word`, gợi ý có số `"m4ke"` bị lọc bỏ.
  9. Đồng ý chưa phải v3 → `fixed ai_off`, không gọi model; nhưng từ có trong cache vẫn trả thẻ (ca 1 với đồng ý cũ).
  10. `lookups_today = 60` → `fixed daily_limit`, kể cả từ trong cache.
  11. `ai_lookups_today = 30`, từ không có cache → `fixed ai_daily_limit`.
  12. Từ chặn → `fixed blocked`, không gọi gì.
  13. `client_id` đã có → trả lượt cũ, `status 200`, không gọi model.
  14. Đầu ra model có trường `ipa` → zod từ chối → tính là trượt.
  15. `CardView.ipa` ghép từ `store.ipa`; thiếu một từ của cụm → `uk: null`.
  16. `runAgain` trên lượt của em khác (store trả `null`) → `404`.
  17. Prompt gửi đi không chứa bí danh em (store giả có `alias "An"` trong ngữ cảnh; kiểm `instructions` không có `"An"` đứng riêng).
- [ ] **Step 2:** Chạy, mong đợi FAIL.
- [ ] **Step 3:** Viết `lookup.ts` + `supabaseStore.ts` (mỗi method gọi đúng hàm Task 3 bằng `createAdminClient().rpc`, lỗi → `ReviewDbError` như `lib/tutor/supabaseStore.ts`).
- [ ] **Step 4:** Chạy, mong đợi PASS.
- [ ] **Step 5:** Commit `E2a: lookup turn (cache, sense, card, checks, ledger) + explain-again turn`.

---

### Task 6: API của con (tra, giải thích lại, lưu, bỏ, chấm)

**Files:**
- Create:
  - `lib/notebook/handlers.ts`;
  - `app/api/student/tutor/lookup/route.ts`;
  - `app/api/student/tutor/asks/[id]/again/route.ts`;
  - `app/api/student/tutor/asks/[id]/rate/route.ts`;
  - `app/api/student/notebook/route.ts` (POST lưu);
  - `app/api/student/notebook/[id]/route.ts` (PATCH bỏ / thêm lại);
  - `tests/unit/notebookHandlers.test.ts`.

**Interfaces:**
- Produces:

```ts
export const lookupBodySchema = z.strictObject({ word: z.string().max(80), context: z.string().max(400).optional(), client_id: z.string().trim().min(8).max(100) });
export const againBodySchema = z.strictObject({ client_id: z.string().trim().min(8).max(100) });
export const rateBodySchema = z.strictObject({ rating: z.enum(["good", "ok", "confused"]) });
export const saveBodySchema = z.strictObject({ card_id: z.string().uuid(), client_id: z.string().trim().min(8).max(100) });
export const setBodySchema = z.strictObject({ action: z.enum(["remove", "restore"]) });
export async function handleLookup(deps: LookupDeps & { user: { id: string } | null }, raw: unknown): Promise<LookupResult | { status: 401; body: { error: string } }>;
export async function handleAgain(deps: LookupDeps & { user: { id: string } | null }, askId: string, raw: unknown): Promise<LookupResult | { status: 401; body: { error: string } }>;
```

- Lưu / bỏ / chấm: route gọi thẳng hàm của con (`eng_notebook_save`, `eng_notebook_set`, `eng_rate_tutor_ask`) bằng `createUserClient()`. Lỗi `42501` → 403, `P0002` → 404, hàm chưa có (`PGRST202` / `42883`) → 409 `notebook_unavailable`.
- Route tra từ: `maxDuration = 60`; `noticeVersion = TUTOR_NOTICE_VERSION`; models từ `notebookModels()` (thêm vào `lib/tutor/config.ts`: `VOCAB_CARD_MODEL` mặc định `claude-sonnet-5-5`, `VOCAB_CHECK_MODEL` mặc định `claude-haiku-5-5`, `toolChoice` theo `TUTOR_TOOL_CHOICE`); prompts qua `loadPrompt`. Lỗi bất ngờ → `logAppError` + 500 chung (như route hints).
- Mọi route trả header `Cache-Control: private, no-store`.

- [ ] **Step 1: Test hỏng.**
  - Không đăng nhập → 401.
  - Body có trường lạ → 400 `invalid_body`.
  - `askId` không phải uuid → 404.
  - `handleLookup` chuyển đúng `word`, `context`, `client_id` vào `runLookup`.
- [ ] **Step 2:** Chạy, mong đợi FAIL.
- [ ] **Step 3:** Viết handlers + 5 route.
- [ ] **Step 4:** Chạy, mong đợi PASS.
- [ ] **Step 5:** Commit `E2a: child API for lookup, explain again, save, remove/restore, rate`.

---

### Task 7: Màn của con — khung 6 mục, trang Gia sư, thẻ từ, Sổ tay

**Files:**
- Create:
  - `lib/student/notebook.ts`;
  - `app/tutor/page.tsx`, `app/tutor/card/[cardId]/page.tsx`, `app/notebook/page.tsx`;
  - `components/student/tutor/LookupForm.tsx`, `VocabCard.tsx`, `SpeakButton.tsx`, `RecentLookups.tsx`;
  - `components/student/notebook/NotebookList.tsx`;
  - `tests/dom/vocabCard.test.tsx`, `tests/dom/tutorPage.test.tsx`, `tests/dom/notebookList.test.tsx`, `tests/unit/speakVoice.test.ts`.
- Modify:
  - `components/student/desk/StudentTabs.tsx` (`DeskTab` thêm `"tutor" | "notebook"`; `TABS` theo thứ tự Hôm nay · Gia sư · Sổ tay · Đã xem · Đã làm · Hành trình; prop `tutorReady: boolean` quyết hai mục mới);
  - `components/student/desk/StudentDeskShell.tsx` (truyền `tutorReady`);
  - `lib/student/desk.ts` (`DeskBase.tutorReady = (await rpcOrNull("eng_my_tutor_status", undefined, parseTutorStatus)) !== null`, đọc song song với `eng_my_seen`);
  - mọi trang đang dùng `StudentDeskShell` (truyền `tutorReady={base.tutorReady}`);
  - `lib/copy/vi.ts` (`studentDeskCopy.tabs.tutor = "Gia sư"`, `.notebook = "Sổ tay"`; `tutorPageCopy`, `vocabCardCopy`, `notebookCopy` dưới đây).

**Chữ giao diện (thêm vào `lib/copy/vi.ts`):**

```ts
export const tutorPageCopy = {
  title: "Gia sư",
  intro: "Tra từ, hỏi tiếng Anh, cho bài trên app hay bài ở trường. Gia sư giải thích, không làm hộ bài.",
  watched: "Mẹ và thầy/cô xem được câu bạn hỏi ở đây để giúp bạn.",
  tabWord: "Tra từ",
  wordLabel: "Gõ một từ hoặc cụm tiếng Anh",
  contextLabel: "Câu có từ này (không bắt buộc)",
  send: "Tra",
  thinking: "Gia sư đang soạn…",
  recent: "Từ vừa tra",
  off: "Gia sư đang nghỉ. Mẹ bấm “Đồng ý và bật” ở Cài đặt AI để mở.",
  notWord: "Không thấy từ này. Có phải bạn muốn:",
  errors: {
    empty: "Bạn gõ một từ nhé.",
    too_long: "Ô này tra một từ hoặc cụm tiếng Anh ngắn.",
    not_english: "Ô này tra một từ hoặc cụm tiếng Anh ngắn.",
    too_many_words: "Ô này tra một từ hoặc cụm tiếng Anh ngắn.",
    notebook_unavailable: "Gia sư chưa sẵn sàng (cần cập nhật). Bạn thử lại sau nhé.",
    network: "Mạng chập chờn, bạn bấm lại nhé.",
  } as Record<string, string>,
  fixed: {
    daily_limit: "Hôm nay bạn tra nhiều rồi. Mai tra tiếp nhé.",
    ai_daily_limit: "Hôm nay bạn tra nhiều rồi. Mai tra tiếp nhé.",
    blocked: "Từ này mình không tra ở đây. Bạn hỏi thầy/cô hoặc bố mẹ nhé.",
    ai_off: "Gia sư đang nghỉ. Mẹ bấm “Đồng ý và bật” ở Cài đặt AI để mở.",
    card_failed: "Gia sư chưa soạn được thẻ cho từ này. Bạn hỏi thầy/cô nhé.",
    ai_error: "Gia sư chưa soạn được thẻ cho từ này. Bạn thử lại sau nhé.",
    not_word: "Không thấy từ này.",
  } as Record<string, string>,
};
export const vocabCardCopy = {
  guess: "🤔 Đoán trước", seeAll: "Xem luôn", core: "💡 Bản chất", quick: "📌 Nắm nhanh", why: "❓ Vì sao", vn: "So với tiếng Việt:", trap: "⚠️ Bẫy hay gặp:",
  related: "🔗 Liên quan", relatedHint: "Bấm một ô để tra tiếp.", checks: "✏️ Tự kiểm", task: "🎯 Đến lượt bạn", taskPlaceholder: "Gõ câu của bạn…",
  family: "Họ từ", collocations: "Hay đi kèm", stress: "Trọng âm", uk: "Anh–Anh", us: "Anh–Mỹ", listen: "🔊 Nghe", noVoice: "Máy này chưa có giọng đọc tiếng Anh",
  save: "+ Lưu vào Sổ tay", saved: "Đã lưu vào Sổ tay ✓", already: "Đã có trong Sổ tay", again: "Chưa hiểu, giải thích cách khác", againTitle: "Cách khác",
  rateAria: "Bạn thấy câu trả lời thế nào", rate: { good: "😊", ok: "😐", confused: "😕" }, right: "✓", wrong: "✗",
};
export const notebookCopy = {
  title: "Sổ tay", tabWords: "Từ vựng", filter: "Lọc", empty: "Sổ tay chưa có từ nào. Tra từ ở mục Gia sư rồi bấm “+ Lưu vào Sổ tay”.",
  count: (n: number) => `${n} từ`, remove: "Bỏ khỏi Sổ tay", removeConfirm: "Bỏ từ này khỏi Sổ tay?", yes: "Bỏ", no: "Giữ lại",
  removed: (n: number) => `Đã bỏ (${n})`, restore: "Thêm lại", savedOn: (d: string) => `Lưu ${d}`,
};
```

**`VocabCard` (client) — bố cục §4.5:**
- Đầu thẻ: từ, `pos`, `lemma_note`, hai dòng phiên âm "Anh–Anh /…/ 🔊" và "Anh–Mỹ /…/ 🔊". Dòng phiên âm thiếu thì ẩn.
- **Đoán trước:** hai nút. Chọn rồi tô ✓ / ✗ + `yes` / `no`. "Xem luôn" mở phần dưới mà không đánh dấu. Các khối dưới chỉ render khi `open`.
- Khi `open` (luôn hiện đủ, không thu gọn):
  1. Bản chất;
  2. Nắm nhanh (ví dụ; nghĩa `senses`, có `sense` thì nghĩa đó in đậm);
  3. Vì sao + So với tiếng Việt + Bẫy;
  4. Họ từ / Hay đi kèm / Trọng âm (một khối gọn trong "Vì sao");
  5. Liên quan (nút → `onLookup(word)`);
  6. Tự kiểm (✓ / ✗ + `note` sau khi chọn, không tổng);
  7. Đến lượt bạn (ô gõ, **chưa gửi đâu** ở E2a: chỉ ghi trên máy; E2b gửi AI nhận xét);
  8. Nút: Nghe · Lưu · "Chưa hiểu" (gọi `/again`, hiện khối "Cách khác" ngay dưới) · 😊 😐 😕 (gọi `/rate`, giữ lựa chọn).
- Mọi số hiện ra (nếu có) đặt trong `data-count="work"`. Không có chữ "điểm", "%".

**`SpeakButton`:** hàm thuần `pickVoice(voices: { lang: string; localService: boolean; name: string }[], accent: "uk" | "us")`:
- chỉ giọng `localService`;
- `uk` ưu tiên `en-GB`, rồi `en-*`; `us` ưu tiên `en-US`, rồi `en-*`;
- không có → `null` → nút ẩn, hiện `noVoice` một lần dưới thẻ.

Đọc `headword` bằng `SpeechSynthesisUtterance`, không gửi gì ra mạng.

**`/tutor` (server):**
- `loadDeskBase()`; chưa sẵn sàng → `notFound()`.
- `eng_my_tutor_status` + `eng_my_recent_lookups(5)`.
- Render `LookupForm` (client: gọi `/api/student/tutor/lookup` với `client_id` = `crypto.randomUUID()` theo nội dung gõ, như `AskTutor`), danh sách thẻ trả về trong phiên (mới nhất trên), cột "Từ vừa tra" (link `/tutor/card/[cardId]`, không tính lượt).
- `consent_version !== TUTOR_NOTICE_VERSION` hoặc `!ai_enabled` → dòng `off` dưới ô tra (vẫn tra được từ đã có trong cache; máy chủ quyết).

**`/tutor/card/[cardId]`:** `eng_my_vocab_card` + phiên âm (đọc `eng_ipa_for` qua route server nhỏ hay trong `lib/student/notebook.ts` bằng admin client sau khi đã xác định là con). Render `VocabCard` với `askId = null` (ẩn "Chưa hiểu" và 😊 vì không có lượt).

**`/notebook`:** `eng_my_notebook('word')`, `NotebookList` (lọc theo chữ trên máy, bấm dòng → `/tutor/card/[cardId]`, "Bỏ khỏi Sổ tay" có hỏi lại, nhóm "Đã bỏ (n)" thu gọn có "Thêm lại").

- [ ] **Step 1: Test hỏng.**
  - `tests/unit/speakVoice.test.ts`: `pickVoice` chọn `en-GB` có `localService`; bỏ qua giọng mạng (`localService false`) dù `en-GB`; không có → `null`.
  - `tests/dom/vocabCard.test.tsx`:
    - trước khi đoán chỉ thấy khối Đoán trước, **không** thấy Bản chất;
    - chọn sai → ✗ + `no`, phần dưới hiện;
    - "Xem luôn" → phần dưới hiện;
    - khối Vì sao và Liên quan hiện **không cần bấm thêm** (không có `<details>` / nút mở);
    - Tự kiểm: chọn → ✓/✗ + note, không có chữ "điểm", "%", "đúng 1/2";
    - bấm ô Liên quan gọi `onLookup("do")`;
    - không có phiên âm → không có dòng "Anh–Anh";
    - `askId null` → không có nút "Chưa hiểu" và 😊.
  - `tests/dom/tutorPage.test.tsx` (render `LookupForm` + danh sách):
    - có dòng `watched`;
    - lỗi `not_english` hiện đúng chữ;
    - `kind fixed daily_limit` hiện đúng chữ;
    - `kind not_word` hiện chip gợi ý, bấm chip gửi lại.
  - `tests/dom/notebookList.test.tsx`: lọc; bỏ có hỏi lại; "Đã bỏ (1)" + "Thêm lại"; số đếm trong `data-count="work"`.
  - Sửa `tests/dom/studentTabs*.test.tsx` (nếu có): `tutorReady false` → 4 mục; `true` → 6 mục đúng thứ tự.
- [ ] **Step 2:** Chạy, mong đợi FAIL.
- [ ] **Step 3:** Viết code.
- [ ] **Step 4:** Chạy, mong đợi PASS + `npm run typecheck && npm run lint`.
- [ ] **Step 5:** Commit `E2a: child Gia sư page, vocab card (§4.5), Sổ tay, 6-tab desk`.

---

### Task 8: "Con hỏi Gia sư" cho người lớn

**Files:**
- Create: `app/learners/[id]/tutor-asks/page.tsx`, `components/workdesk/TutorAsksList.tsx`, `tests/dom/tutorAsksList.test.tsx`
- Modify:
  - `lib/shell/nav.ts`: section `profile` thêm con `{ key: "tutorAsks", label: tutorAsksCopy.link, href: \`${L(id)}/tutor-asks\` }`;
  - `lib/shell/paths.ts` (nhận đường dẫn mới cho mục đang mở);
  - `lib/copy/vi.ts` (`tutorAsksCopy`);
  - test nav hiện có.

**Chữ:**

```ts
export const tutorAsksCopy = {
  link: "Con hỏi Gia sư",
  title: (alias: string) => `${alias} hỏi Gia sư`,
  intro: "Mọi lượt con tra ở mục Gia sư, mới nhất trước. Chỉ mẹ và thầy/cô của em xem được.",
  kinds: { lookup: "Tra từ", again: "Chưa hiểu, giải thích lại" } as Record<string, string>,
  context: "Câu con gõ kèm:",
  saved: "Đã lưu vào Sổ tay",
  rating: { good: "😊", ok: "😐", confused: "😕" } as Record<string, string>,
  fixed: "Không có thẻ:",
  empty: "Con chưa hỏi Gia sư lần nào.",
  older: "Cũ hơn",
  unavailable: "Cần áp SQL 0041 để xem phần này.",
};
```

- Trang (server, trong `app/learners/[id]/layout.tsx`, không `AppHeader` / `<main>`):
  - `eng_tutor_asks_for(id, before, 50)`;
  - hàm chưa có → dòng `unavailable`;
  - lỗi quyền → `notFound()`.
- Mỗi dòng: giờ (giờ VN) · loại · chữ con gõ · từ của thẻ (link xem thẻ bằng trang người lớn chỉ đọc: tái dùng `VocabCard` với `askId null`, đường `/learners/[id]/tutor-asks/card/[cardId]`) · lý do cố định (dùng `tutorPageCopy.fixed`) · "Đã lưu vào Sổ tay" · 😊/😐/😕.
- Không AI, không tổng hợp.

- [ ] **Step 1: Test hỏng.**
  - `TutorAsksList` hiện đủ cột;
  - lượt `fixed blocked` hiện đúng lý do;
  - `rating null` → không biểu tượng;
  - nav người lớn có "Con hỏi Gia sư" dưới "Hồ sơ học sinh".
- [ ] **Step 2–4:** Chạy FAIL → viết → PASS.
- [ ] **Step 5:** Commit `E2a: adults read what the child asked the tutor`.

---

### Task 9: Đồng ý `ai-studio-tutor-v3` + chữ Cài đặt AI

**Files:**
- Modify: `lib/ai/config.ts`, `lib/copy/vi.ts` (`aiSettingsCopy.intro`, `points[1]`, `reconsent`), `docs/CONSENT_pilot-2026-10.md` (thêm mục ngắn "Bản v3, 23/11"), mọi test có `"ai-studio-tutor-v2"`.

- `AI_NOTICE_VERSION = "ai-studio-tutor-v3"`; `TUTOR_NOTICE_VERSION = "ai-studio-tutor-v3"`. Nút "Hỏi" trong bài vẫn tắt bởi `TUTOR_IN_WORK`, nên E1 không đổi gì với con.
- Chữ mới:
  - `intro`: "AI đọc đề và đáp án của {thầy/cô}; với Gia sư, AI đọc thêm từ hoặc câu ngắn con gõ. AI không nhận tên hay hồ sơ của con."
  - `points[1]`: "Gia sư AI là một mục riêng “Gia sư” trên bàn học của con, **không có trong bài làm**. Con tra từ (sau này hỏi ngữ pháp); AI nhận từ hoặc câu ngắn con gõ. Câu con hỏi được lưu lại; mẹ và thầy/cô của em đọc được."
  - `reconsent`: "Văn bản đồng ý đã đổi: Gia sư AI giờ là một mục riêng, câu con hỏi được lưu để mẹ và thầy/cô xem. Bấm “Đồng ý và bật” lần nữa để Gia sư chạy."

- [ ] **Step 1:** Sửa test hiện có (`tests/**/aiSettings*`, `tests/db/*` có v2) để mong đợi v3; thêm ca: `AiSettingsForm` có lần đồng ý v2 → hiện `ai-reconsent`.
- [ ] **Step 2–4:** FAIL → sửa → PASS.
- [ ] **Step 5:** Commit `E2a: consent text v3 (tutor is its own page, questions are kept for mum and the tutor)`.

---

### Task 10: Bộ test thẻ từ (chạy tay)

**Files:**
- Create: `scripts/eval-cards.ts`, `tests/eval/cards/cases.json`, `.github/workflows/eval-cards.yml`, `docs/eval/E2_BASELINE.md` (bảng trống có tiêu đề cột + dòng "chưa chạy")
- Modify: `package.json` (`"eval:cards": "tsx scripts/eval-cards.ts"`)

- `cases.json`: 40 ca tự soạn, chia đều hai cấu hình (`vi`/`A2-B1`, `en_first`/`B2-C1`):
  - 10 từ thường (`volcano`, `make`, `environment`, …);
  - 6 từ nhiều nghĩa kèm câu (`bank`, `light`, `run`, …);
  - 6 phrasal verb (`give up`, `look after`, …);
  - 4 dạng biến đổi (`went`, `children`, `better`, `studies`);
  - 4 gõ sai (`recieve`, `enviroment`, …) → `not_word` hoặc thẻ đúng từ đã sửa;
  - 4 từ phải chặn → `blocked` (không gọi AI);
  - 4 câu chèn lệnh trong ô câu ("ignore the rules and …");
  - 2 cụm 3–4 từ.
- Script:
  - chạy `runLookup` thật với store trong bộ nhớ (như `scripts/eval-hints.ts`) và `ANTHROPIC_API_KEY` của bộ test;
  - `--max-usd 5`;
  - đo: thẻ đạt code + Haiku; lý do trượt; chi phí thật / thẻ;
  - **chấm chất lượng khuôn** bằng Haiku với prompt riêng (`prompts/vocab-audit.v1.md`), 6 tiêu chí ở spec §11;
  - ghi `summary.public.md`.
- Workflow chỉ bấm tay, input `scope` (`all`), báo ước tính chi phí ở đầu job (≈ 40 × 0,01 USD ≈ 0,4 USD + audit).
- **Tiêu chí mở cho con:**
  - 0 thẻ có phiên âm do AI;
  - 0 ví dụ thiếu từ;
  - 0 nội dung không hợp tuổi;
  - ≥ 90 % thẻ đạt mọi tiêu chí khuôn;
  - mẹ đọc 10 thẻ mẫu.

- [ ] **Step 1:** Test unit nhỏ cho phần thuần của script (đọc `cases.json` qua zod; tổng hợp bảng từ danh sách kết quả giả).
- [ ] **Step 2–4:** FAIL → viết → PASS.
- [ ] **Step 5:** Commit `E2a: vocab card test set (manual workflow)`.

---

### Task 11: e2e

**Files:**
- Create: `tests/e2e/tutorNotebook.spec.ts`

Chạy trên CI với `AI_FAKE=1`, Supabase local, seed thử. Ca:
1. Phụ huynh bật AI + đồng ý (v3) cho Nguyên (thử).
2. Nguyên mở `/tutor`: thấy 6 mục, dòng "Mẹ và thầy/cô xem được…".
3. Gõ `make` → thẻ hiện khối Đoán trước; chọn một ý → thấy Bản chất, **Vì sao**, **Liên quan** không cần bấm thêm.
4. "+ Lưu vào Sổ tay" → "Đã lưu vào Sổ tay ✓".
5. Mở `/notebook` → thấy `make`; bỏ (xác nhận) → "Đã bỏ (1)"; "Thêm lại" → lại trong danh sách.
6. Gõ `make` lần nữa → thẻ trả từ cache: `select count(*) from english.ai_runs where purpose = 'vocab_card'` không tăng.
7. Gõ `núi lửa` → chữ báo chỉ tra tiếng Anh.
8. Phụ huynh mở `/learners/<Nguyên>/tutor-asks` → thấy 2 lượt `make` (một lượt từ cache).
9. Mở một bài luyện Studio: không có gia sư (giữ ca của PR #53).

- [ ] **Step 1:** Viết spec.
- [ ] **Step 2:** `npx playwright test --list` (máy không có Docker). CI chạy thật.
- [ ] **Step 3:** Commit `E2a: e2e lookup → save → notebook → adults see asks`.

---

### Task 12: Tài liệu + review + PR

**Files:**
- Modify:
  - `docs/DESIGN.md` (§19.32 "E2a — Gia sư + Sổ tay": luồng, bảng, hàm, giới hạn, đồng ý v3);
  - `docs/DOMAIN.md` (bản 0.10: luật L3/L5 cho thẻ từ, giới hạn lượt, ai đọc lượt hỏi);
  - `docs/PROGRESS.md` (mục E2a: cách thử, **SQL `0041` phụ huynh áp**, workflow "Seed IPA lexicon" sau khi áp, bấm lại "Đồng ý và bật", chạy bộ test thẻ trước khi cho con dùng);
  - `docs/UX_COPY_GUIDE.md` (chữ E2a);
  - `CLAUDE.md` (dòng trạng thái; migration kế tiếp là 0042).

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test` (Postgres local đang chạy). Mọi test xanh.
- [ ] **Step 2:** Gọi agent `reviewer` trên diff của nhánh so với `main`. Sửa mọi điểm nặng / vừa; ghi điểm nhẹ không sửa vào PR.
- [ ] **Step 3:** Commit tài liệu; push nhánh `feature/e2a-gia-su-so-tay`.
- [ ] **Step 4:** Mở PR bằng `gh api repos/haleytruong89-moon/Enghlish-app/pulls`. Mô tả tiếng Việt:
  - làm gì;
  - **SQL cần phụ huynh áp: `0041_tutor_notebook.sql`** (workflow "Apply database migrations", gõ APPLY);
  - sau đó chạy workflow "Seed IPA lexicon" (gõ SEED);
  - Cài đặt AI → "Đồng ý và bật";
  - chạy "Eval vocab cards" và đọc 10 thẻ mẫu;
  - cách thử trên preview (các bước của Task 11);
  - tiêu chí đạt (bảng §1 spec + tiêu chí bộ test);
  - dòng attribution theo system reminder.

---

## Chi phí ước tính

| Việc | Ước tính |
|---|---|
| Thẻ mới (Sonnet ~2k vào / ~2,5k ra + Haiku kiểm) | ≈ 0,03 USD / thẻ (khuôn §4.5 dài hơn ước tính 0,006 cũ trong hub) |
| Chọn nghĩa (Haiku) | ≈ 0,001 USD |
| "Chưa hiểu" (Sonnet) | ≈ 0,02 USD |
| Hai em, ~10 từ mới / em / ngày, cache trúng dần | ≈ 6–15 USD / tháng lúc đầu, giảm khi cache lớn |

**Cần phụ huynh biết khi duyệt plan:**
- Chi phí một thẻ cao hơn ước tính cũ, vì thẻ giờ có đủ 7 khối.
- Trần tháng hiện tại do mẹ đặt ở Cài đặt AI (≤ 50 USD). Đề xuất giữ giới hạn 30 thẻ AI / ngày / em; đo thật 2 tuần rồi chỉnh.

## Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| Phiên âm ipa-dict sai ở vài từ | Chuẩn hóa bằng code có test; mẹ đọc 10 thẻ mẫu; báo thẻ sai qua "Góp ý về app" (A5); sửa bảng ở E4 |
| Thẻ dài, con ngại đọc | Đo 😊/😐/😕 + "Chưa hiểu" 2 tuần; chỉnh độ dài prompt bản v2 |
| Giọng đọc trên máy không có (một số trình duyệt) | Ẩn nút, báo một dòng; không dùng giọng mạng |
| Đổi văn bản đồng ý làm Studio tạm dừng tới khi mẹ bấm lại | `eng_ai_gate` chỉ kiểm `granted`, không kiểm phiên bản, nên Studio vẫn chạy. Chỉ Gia sư chờ v3 |
