# W1 · Ghi chú dạy học + Hồ sơ đầu vào + Góp ý về app — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gia sư ghi được 4 ô "Ghi chú dạy học" và hồ sơ đầu vào (mục tiêu, mạnh/yếu ban đầu) của từng em; gia sư và phụ huynh gửi được "Góp ý về app" và thấy trạng thái phụ huynh xử lý — tất cả chỉ thêm, không AI, không đổi gì con thấy.

**Architecture:** Một migration `0025_workdesk_w1.sql` thêm 4 bảng chỉ thêm (`teaching_notes`, `learner_intake`, `app_feedback`, `app_feedback_events`) với RLS đọc theo `eng_is_staff_of` / gia đình và 4 hàm ghi `security definer` kiểm người thao tác; `lib/workdesk/` (schemas · handlers · supabaseStore · route · load · shape) theo đúng mẫu `lib/levels/`; màn: thẻ trên trang Hồ sơ cấp (`/learners/[id]/levels`) + trang mới `/feedback`. Phụ huynh xử lý góp ý trên cùng trang `/feedback` (vai parent thấy thêm ô trạng thái + trả lời).

**Tech Stack:** Next.js App Router · TypeScript strict · Supabase (schema `english`, RLS, plpgsql) · zod · Vitest (unit + DB Postgres local) · Playwright (CI).

**Spec:** `docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md` (§3 màn Hồ sơ / Góp ý, §4 W1, §5 yêu cầu chung, §6 W1) · luật: `docs/DOMAIN.md` §2 (quyền), §3 tầng C, §4 Ghi chú dạy học, §6 trạng thái Góp ý về app, §7 bất biến 8–10, §9.3, §13 D-W8, §14 R8.

## Global Constraints

- Migration `db/migrations/0025_workdesk_w1.sql`: idempotent, **chỉ thêm**, kết thúc `insert into english.schema_migrations(version) values ('0025') on conflict do nothing;`. Không sửa 0001–0024. Không đụng schema `public`.
- Bảng chỉ thêm gắn `english.eng_forbid_mutation('learner_id')` (row) + `eng_forbid_mutation()` (truncate) như 0020 §1. Bảng không có `learner_id` (góp ý về app) gắn `eng_forbid_mutation()` không tham số cho cả row và truncate.
- Bảng có `learner_id` → thêm vào `eng_purge_learner` **và** `eng_purge_preview` bằng `create or replace` (mẫu 0020 §6), kèm test so từng dòng.
- `revoke insert, update, delete, truncate … from public, anon, authenticated, service_role`; ghi chỉ qua hàm `security definer set search_path = ''`, hàm tự kiểm `english.eng_actor_may_manage(p_by, p_learner)` + vai.
- Mọi chữ giao diện trong `lib/copy/vi.ts`; người dạy là "thầy/cô" qua `tutorHonorific`; không viết cứng "cô". Không chữ có dạng điểm trong ô con thấy (con không thấy gì ở W1).
- Học sinh: không SELECT được bảng nào của W1 (RLS `eng_is_staff_of` / vai ≠ student).
- Code, comment, commit: tiếng Anh. Không `if (track === 'A')`.
- `npm run typecheck && npm run lint && npm test` xanh trước khi mở PR; review Opus (`reviewer`) trước PR; PR tiếng Việt: làm gì · cách thử preview · **SQL cần phụ huynh áp: `0025`** · tiêu chí đạt/chưa.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1`.
- Nhánh: `feature/w1-notes-feedback` từ `origin/main` (sau khi PR #23 gộp; nếu chưa, rebase trước khi mở PR).

---

## File structure

| File | Trách nhiệm |
|---|---|
| `db/migrations/0025_workdesk_w1.sql` | 4 bảng, trigger, RLS, 4 hàm ghi, mở rộng purge |
| `lib/workdesk/types.ts` | hằng số: 4 khóa ô ghi chú, giới hạn độ dài, loại/trạng thái góp ý |
| `lib/workdesk/schemas.ts` | zod cho body API |
| `lib/workdesk/handlers.ts` | `handleWriteTeachingNote`, `handleWriteIntake`, `handleSendAppFeedback`, `handleUpdateAppFeedback` + interface `WorkdeskStore` |
| `lib/workdesk/supabaseStore.ts` | rpc 4 hàm (service role) |
| `lib/workdesk/route.ts` | `runWorkdeskRoute` (glue giống `lib/levels/route.ts`) |
| `lib/workdesk/shape.ts` | zod dòng DB → view (`TeachingNotesView`, `IntakeView`, `AppFeedbackView`) |
| `lib/workdesk/load.ts` | `loadTeachingNotes`, `loadIntake`, `loadAppFeedback` (user client, RLS) |
| `app/api/learners/[id]/teaching-notes/route.ts` · `.../intake/route.ts` | POST |
| `app/api/feedback/route.ts` · `app/api/feedback/[id]/route.ts` | POST gửi · POST cập nhật trạng thái (phụ huynh) |
| `components/workdesk/TeachingNotesCard.tsx` · `IntakeCard.tsx` | thẻ trên trang Hồ sơ cấp |
| `components/workdesk/FeedbackForm.tsx` · `FeedbackList.tsx` | trang `/feedback` |
| `app/feedback/page.tsx` | trang Góp ý về app (gia sư + phụ huynh) |
| `app/learners/[id]/levels/page.tsx` (modify) | thêm 2 thẻ |
| `components/AppHeader.tsx` (modify) | nút "Góp ý về app" cho người lớn |
| `lib/auth/requireAccess.ts` (modify) | action `teaching:write` (tutor) |
| `lib/copy/vi.ts` (modify) | `teachingNotes`, `intake`, `appFeedback` |
| `tests/db/workdeskW1.test.ts` · `tests/unit/workdesk*.test.ts` · `tests/e2e/workdesk.spec.ts` | test |
| `docs/PROGRESS.md`, `CLAUDE.md` (modify) | trạng thái, SQL cần áp |

---

### Task 1: Migration 0025 — bảng, trigger, RLS

**Files:**
- Create: `db/migrations/0025_workdesk_w1.sql`
- Test: `tests/db/workdeskW1.test.ts`

**Interfaces:**
- Produces: bảng `english.teaching_notes(id, learner_id, field, text, author_member, author_role, client_id, created_at)`; `english.learner_intake(id, learner_id, content jsonb, author_member, author_role, client_id, created_at)`; `english.app_feedback(id, family_id, by_member, by_role, kind, screen, text, client_id, created_at)`; `english.app_feedback_events(id, feedback_id, status, reply, by_member, client_id, created_at)`.

- [ ] **Step 1: Write the failing DB test (shape + append-only + RLS)**

```ts
// tests/db/workdeskW1.test.ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

describe("W1 workdesk (migration 0025)", () => {
  let db: TestDb; let s: Seeded;
  const M = () => s.members; const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull(); expect(err?.code, err?.message).toBe(code); if (re) expect(err?.message).toMatch(re);
  };
  beforeAll(async () => { db = await createTestDb(); await migrate(db.client); s = await seed(db.client); });
  afterAll(async () => { await db?.drop(); });

  describe("1. tables", () => {
    it("exist, are append-only and reject direct inserts from service_role", async () => {
      for (const t of ["teaching_notes", "learner_intake", "app_feedback", "app_feedback_events"]) {
        expect((await q1("select to_regclass($1) as r", [`english.${t}`]))[0]).toEqual({ r: `english.${t}` });
      }
      await fail(svc("insert into english.teaching_notes(learner_id, field, text, author_member, author_role, client_id) values ($1,'focus','x',$2,'tutor','c-00000001')", [NG(), M().tutorNguyen]), "42501");
    });
    it("students read nothing; tutor of the child and parent of the family read", async () => {
      await q1(`insert into english.teaching_notes(learner_id, field, text, author_member, author_role, client_id) values ($1,'focus','Đảo ngữ',$2,'tutor','c-seed-0001')`, [NG(), M().tutorNguyen]);
      const read = (uid: string) => asCommit(db.client, "authenticated", uid, async (q) => (await q("select count(*)::int as n from english.teaching_notes where learner_id = $1", [NG()])).rows[0] as { n: number });
      expect((await read(s.users.studentNguyen)).n).toBe(0);
      expect((await read(s.users.tutorNguyen)).n).toBe(1);
      expect((await read(s.users.parent)).n).toBe(1);
      expect((await read(s.users.tutorAn)).n).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/db/workdeskW1.test.ts` (cần Postgres local như các test `tests/db`; không có Docker → chạy trong CI, ghi rõ trong PR)
Expected: FAIL — `to_regclass` trả `null`.

- [ ] **Step 3: Write the migration (tables, triggers, RLS)**

```sql
-- 0025_workdesk_w1.sql
-- W1 · Ghi chú dạy học + hồ sơ đầu vào + góp ý về app (spec docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md §4 W1;
-- luật docs/DOMAIN.md §2, §3 tầng C, §4, §6, §7, §13 D-W8, §14 R8).
--   1. english.teaching_notes (append-only): 4 ô — focus / explain / errors / avoid. Bản hiện hành = dòng mới nhất của từng ô.
--   2. english.learner_intake (append-only): hồ sơ đầu vào (mục tiêu + mạnh/yếu ban đầu theo mảng). Bản hiện hành = dòng mới nhất.
--   3. english.app_feedback + english.app_feedback_events (append-only, theo GIA ĐÌNH, không có learner_id): góp ý về app của
--      thầy/cô hoặc phụ huynh; trạng thái = sự kiện mới nhất (new → in_progress → done | wont_do).
--   4. Ghi: eng_write_teaching_note / eng_write_intake (CHỈ gia sư của em), eng_send_app_feedback (người lớn trong gia đình),
--      eng_update_app_feedback (CHỈ phụ huynh). Học sinh không đọc được bảng nào.
--   5. eng_purge_learner + eng_purge_preview thêm teaching_notes, learner_intake.
-- Idempotent; chỉ thêm (expand). Không đụng schema public.

create table if not exists english.teaching_notes (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  field text not null check (field in ('focus', 'explain', 'errors', 'avoid')),
  text text not null check (pg_catalog.length(text) <= 600),
  author_member uuid not null,
  author_role text not null check (author_role = 'tutor'),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id, field)
);
create index if not exists teaching_notes_learner_idx on english.teaching_notes(learner_id, field, created_at desc);

create table if not exists english.learner_intake (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  -- {goals:[{title,due}], strengths:{domain:text}, weaknesses:{domain:text}, note}; hình dạng kiểm ở hàm ghi + zod.
  content jsonb not null check (pg_catalog.jsonb_typeof(content) = 'object'),
  author_member uuid not null,
  author_role text not null check (author_role = 'tutor'),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create index if not exists learner_intake_learner_idx on english.learner_intake(learner_id, created_at desc);

create table if not exists english.app_feedback (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id),
  by_member uuid not null,
  by_role text not null check (by_role in ('tutor', 'parent')),
  kind text not null check (kind in ('bug', 'hard_to_use', 'suggestion', 'question')),
  screen text not null check (pg_catalog.length(pg_catalog.btrim(screen)) between 1 and 80),
  text text not null check (pg_catalog.length(pg_catalog.btrim(text)) between 1 and 1000),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (family_id, client_id)
);
create index if not exists app_feedback_family_idx on english.app_feedback(family_id, created_at desc);

create table if not exists english.app_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references english.app_feedback(id),
  status text not null check (status in ('new', 'in_progress', 'done', 'wont_do')),
  reply text check (reply is null or pg_catalog.length(pg_catalog.btrim(reply)) between 1 and 600),
  by_member uuid not null,
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (feedback_id, client_id)
);
create index if not exists app_feedback_events_idx on english.app_feedback_events(feedback_id, created_at desc);

-- triggers: row + truncate (bảng có learner_id dùng eng_forbid_mutation('learner_id') để purge đi qua được)
drop trigger if exists teaching_notes_forbid_mutation on english.teaching_notes;
create trigger teaching_notes_forbid_mutation before update or delete on english.teaching_notes for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists teaching_notes_forbid_truncate on english.teaching_notes;
create trigger teaching_notes_forbid_truncate before truncate on english.teaching_notes for each statement execute function english.eng_forbid_mutation();
drop trigger if exists learner_intake_forbid_mutation on english.learner_intake;
create trigger learner_intake_forbid_mutation before update or delete on english.learner_intake for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists learner_intake_forbid_truncate on english.learner_intake;
create trigger learner_intake_forbid_truncate before truncate on english.learner_intake for each statement execute function english.eng_forbid_mutation();
drop trigger if exists app_feedback_forbid_mutation on english.app_feedback;
create trigger app_feedback_forbid_mutation before update or delete on english.app_feedback for each row execute function english.eng_forbid_mutation();
drop trigger if exists app_feedback_forbid_truncate on english.app_feedback;
create trigger app_feedback_forbid_truncate before truncate on english.app_feedback for each statement execute function english.eng_forbid_mutation();
drop trigger if exists app_feedback_events_forbid_mutation on english.app_feedback_events;
create trigger app_feedback_events_forbid_mutation before update or delete on english.app_feedback_events for each row execute function english.eng_forbid_mutation();
drop trigger if exists app_feedback_events_forbid_truncate on english.app_feedback_events;
create trigger app_feedback_events_forbid_truncate before truncate on english.app_feedback_events for each statement execute function english.eng_forbid_mutation();

-- RLS
alter table english.teaching_notes enable row level security;
alter table english.learner_intake enable row level security;
alter table english.app_feedback enable row level security;
alter table english.app_feedback_events enable row level security;
revoke all on english.teaching_notes, english.learner_intake, english.app_feedback, english.app_feedback_events from public, anon, authenticated;
revoke insert, update, delete, truncate on english.teaching_notes, english.learner_intake, english.app_feedback, english.app_feedback_events from public, anon, authenticated, service_role;
grant select on english.teaching_notes, english.learner_intake, english.app_feedback, english.app_feedback_events to authenticated;
drop policy if exists teaching_notes_select on english.teaching_notes;
create policy teaching_notes_select on english.teaching_notes for select to authenticated using (english.eng_is_staff_of(learner_id));
drop policy if exists learner_intake_select on english.learner_intake;
create policy learner_intake_select on english.learner_intake for select to authenticated using (english.eng_is_staff_of(learner_id));
-- góp ý về app: người lớn (tutor/parent) cùng gia đình đọc; học sinh không
drop policy if exists app_feedback_select on english.app_feedback;
create policy app_feedback_select on english.app_feedback for select to authenticated
  using (exists (select 1 from english.members m where m.user_id = auth.uid() and m.family_id = app_feedback.family_id and m.role in ('tutor', 'parent')));
drop policy if exists app_feedback_events_select on english.app_feedback_events;
create policy app_feedback_events_select on english.app_feedback_events for select to authenticated
  using (exists (select 1 from english.app_feedback f join english.members m on m.family_id = f.family_id
                 where f.id = app_feedback_events.feedback_id and m.user_id = auth.uid() and m.role in ('tutor', 'parent')));

insert into english.schema_migrations(version) values ('0025') on conflict do nothing;
```

`eng_is_staff_of(uuid)` định nghĩa ở 0007 dòng 37; `members.user_id` là cột nối auth (xem 0020 `v_member.user_id`).

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run tests/db/workdeskW1.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0025_workdesk_w1.sql tests/db/workdeskW1.test.ts
git commit -m "feat(w1): migration 0025 — teaching notes, intake, app feedback tables (append-only, RLS)"
```

---

### Task 2: Hàm ghi `eng_write_teaching_note` và `eng_write_intake` (gia sư của em)

**Files:**
- Modify: `db/migrations/0025_workdesk_w1.sql` (thêm trước dòng `schema_migrations`)
- Test: `tests/db/workdeskW1.test.ts`

**Interfaces:**
- Produces: `english.eng_write_teaching_note(p_learner uuid, p_field text, p_text text, p_by uuid, p_client_id text) returns jsonb` → `{id, replayed}`; `english.eng_write_intake(p_learner uuid, p_content jsonb, p_by uuid, p_client_id text) returns jsonb` → `{id, replayed}`. Lỗi có thẻ `(tutor_only)` 42501, `(bad_field)` 22023, `(too_long)` 22023, `(bad_content)` 22023.

- [ ] **Step 1: Write the failing tests**

```ts
  describe("2. writing notes and intake", () => {
    const note = (by: string, o: { learner?: string; field?: string; text?: string; clientId?: string } = {}) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_write_teaching_note($1,$2,$3,$4,$5) as r",
        [o.learner ?? NG(), o.field ?? "focus", o.text ?? "Đảo ngữ, câu điều kiện hỗn hợp", by, o.clientId ?? randomUUID()]);
    const intake = (by: string, content: unknown, clientId = randomUUID()) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_write_intake($1,$2::jsonb,$3,$4) as r", [NG(), JSON.stringify(content), by, clientId]);
    it("the child's tutor writes a note field; replay returns the same id; the latest row per field is current", async () => {
      const a = await note(M().tutorNguyen, { clientId: "tn-00000001" });
      expect(a.replayed).toBe(false);
      expect(await note(M().tutorNguyen, { clientId: "tn-00000001" })).toEqual({ id: a.id, replayed: true });
      await note(M().tutorNguyen, { text: "Đảo ngữ thôi" });
      const rows = await q1<{ text: string }>("select text from english.teaching_notes where learner_id=$1 and field='focus' order by created_at desc limit 1", [NG()]);
      expect(rows[0]?.text).toBe("Đảo ngữ thôi");
    });
    it("parent and a tutor of another child cannot write; bad field / too long rejected", async () => {
      await fail(note(M().parent), "42501", /\(tutor_only\)/);
      await fail(note(M().tutorAn), "42501", /\(tutor_only\)/);
      await fail(note(M().tutorNguyen, { field: "mood" }), "22023", /\(bad_field\)/);
      await fail(note(M().tutorNguyen, { text: "x".repeat(601) }), "22023", /\(too_long\)/);
    });
    it("intake: goals + strengths/weaknesses by domain; unknown domain rejected; parent rejected", async () => {
      const ok = { goals: [{ title: "Thi vào 10", due: "2027-06" }], strengths: { vocab: "Từ vựng khá" }, weaknesses: { listening: "Nghe yếu" }, note: "" };
      expect((await intake(M().tutorNguyen, ok)).replayed).toBe(false);
      await fail(intake(M().tutorNguyen, { ...ok, strengths: { music: "x" } }), "22023", /\(bad_content\)/);
      await fail(intake(M().tutorNguyen, { goals: "no" }), "22023", /\(bad_content\)/);
      await fail(intake(M().parent, ok), "42501", /\(tutor_only\)/);
    });
  });
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/db/workdeskW1.test.ts -t "writing notes"` → FAIL (function does not exist, 42883).

- [ ] **Step 3: Write the functions**

```sql
create or replace function english.eng_write_teaching_note(p_learner uuid, p_field text, p_text text, p_by uuid, p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_member english.members%rowtype; v_text text := coalesce(p_text, ''); v_prev english.teaching_notes%rowtype; v_id uuid;
begin
  if p_learner is null or p_field is null or p_by is null or p_client_id is null then
    raise exception 'eng_write_teaching_note: learner, field, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_write_teaching_note: only a tutor of this learner writes teaching notes (tutor_only)' using errcode = '42501';
  end if;
  if p_field not in ('focus', 'explain', 'errors', 'avoid') then
    raise exception 'eng_write_teaching_note: unknown field (bad_field)' using errcode = '22023';
  end if;
  if pg_catalog.length(v_text) > 600 then
    raise exception 'eng_write_teaching_note: text over 600 characters (too_long)' using errcode = '22023';
  end if;
  select * into v_prev from english.teaching_notes t where t.learner_id = p_learner and t.client_id = p_client_id and t.field = p_field;
  if found then return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true); end if;
  insert into english.teaching_notes(learner_id, field, text, author_member, author_role, client_id)
  values (p_learner, p_field, v_text, p_by, 'tutor', p_client_id) returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'teaching_note.written', v_member.family_id, p_learner, pg_catalog.jsonb_build_object('field', p_field));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end $$;
revoke all on function english.eng_write_teaching_note(uuid, text, text, uuid, text) from public, anon, authenticated;

create or replace function english.eng_write_intake(p_learner uuid, p_content jsonb, p_by uuid, p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_member english.members%rowtype; v_prev english.learner_intake%rowtype; v_id uuid;
  v_domains text[] := array['grammar','vocab','reading','listening','writing','speaking','thinking'];
begin
  if p_learner is null or p_content is null or p_by is null or p_client_id is null then
    raise exception 'eng_write_intake: learner, content, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_write_intake: only a tutor of this learner writes the intake profile (tutor_only)' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_content) <> 'object'
     or pg_catalog.jsonb_typeof(p_content -> 'goals') is distinct from 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_content -> 'strengths', '{}'::jsonb)) <> 'object'
     or pg_catalog.jsonb_typeof(coalesce(p_content -> 'weaknesses', '{}'::jsonb)) <> 'object'
     or exists (select 1 from pg_catalog.jsonb_object_keys(coalesce(p_content -> 'strengths', '{}'::jsonb)) k where not (k = any (v_domains)))
     or exists (select 1 from pg_catalog.jsonb_object_keys(coalesce(p_content -> 'weaknesses', '{}'::jsonb)) k where not (k = any (v_domains)))
     or pg_catalog.length(p_content::text) > 6000 then
    raise exception 'eng_write_intake: content must be {goals:[], strengths:{domain}, weaknesses:{domain}, note} (bad_content)' using errcode = '22023';
  end if;
  select * into v_prev from english.learner_intake i where i.learner_id = p_learner and i.client_id = p_client_id;
  if found then return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true); end if;
  insert into english.learner_intake(learner_id, content, author_member, author_role, client_id)
  values (p_learner, p_content, p_by, 'tutor', p_client_id) returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'intake.written', v_member.family_id, p_learner, '{}'::jsonb);
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end $$;
revoke all on function english.eng_write_intake(uuid, jsonb, uuid, text) from public, anon, authenticated;
```

`audit_log` có cột `actor_user_id, actor_role, action, family_id, learner_id, payload` (0002); mẫu insert ở 0020 dòng 239.

- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(w1): eng_write_teaching_note / eng_write_intake (tutor of the child only)"`

---

### Task 3: Hàm `eng_send_app_feedback` và `eng_update_app_feedback`

**Files:** Modify `db/migrations/0025_workdesk_w1.sql`; Test `tests/db/workdeskW1.test.ts`.

**Interfaces:**
- Produces: `eng_send_app_feedback(p_kind text, p_screen text, p_text text, p_by uuid, p_client_id text) returns jsonb` → `{id, replayed}` (tự lấy `family_id` của member; tự tạo sự kiện `new`); `eng_update_app_feedback(p_feedback uuid, p_status text, p_reply text, p_by uuid, p_client_id text) returns jsonb` → `{id, replayed}`. Lỗi: `(staff_only)` 42501, `(parent_only)` 42501, `(bad_kind)` / `(bad_status)` 22023, `P0002` không tìm thấy.

- [ ] **Step 1: Failing tests**

```ts
  describe("3. app feedback", () => {
    const send = (by: string, o: { kind?: string; screen?: string; text?: string; clientId?: string } = {}) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_send_app_feedback($1,$2,$3,$4,$5) as r",
        [o.kind ?? "hard_to_use", o.screen ?? "Ghi buổi học", o.text ?? "Chọn kỹ năng phải cuộn lâu", by, o.clientId ?? randomUUID()]);
    const upd = (by: string, id: string, status: string, reply: string | null = null, clientId = randomUUID()) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_update_app_feedback($1,$2,$3,$4,$5) as r", [id, status, reply, by, clientId]);
    it("tutor or parent sends; a 'new' event is created; a student cannot", async () => {
      const r = await send(M().tutorNguyen);
      expect((await q1<{ status: string }>("select status from english.app_feedback_events where feedback_id=$1", [r.id]))[0]?.status).toBe("new");
      expect((await send(M().parent)).replayed).toBe(false);
      await fail(send(M().studentNguyen), "42501", /\(staff_only\)/);
      await fail(send(M().tutorNguyen, { kind: "praise" }), "22023", /\(bad_kind\)/);
    });
    it("only the parent changes status / replies; the latest event is current; unknown id rejected", async () => {
      const r = await send(M().tutorAn);
      await fail(upd(M().tutorAn, r.id, "done"), "42501", /\(parent_only\)/);
      await upd(M().parent, r.id, "in_progress", "Mẹ: bản sau sẽ sửa");
      await upd(M().parent, r.id, "done");
      const ev = await q1<{ status: string; reply: string | null }>("select status, reply from english.app_feedback_events where feedback_id=$1 order by created_at desc", [r.id]);
      expect(ev.map((e) => e.status)).toEqual(["done", "in_progress", "new"]);
      await fail(upd(M().parent, r.id, "fixed"), "22023", /\(bad_status\)/);
      await fail(upd(M().parent, randomUUID(), "done"), "P0002");
    });
  });
```

(Khóa member trong `Seeded`: `parent`, `tutorAn`, `tutorNguyen`, `studentAn`, `studentNguyen`.)

- [ ] **Step 2: Run → FAIL (42883).**
- [ ] **Step 3: Write functions**

```sql
create or replace function english.eng_send_app_feedback(p_kind text, p_screen text, p_text text, p_by uuid, p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_member english.members%rowtype; v_prev english.app_feedback%rowtype; v_id uuid;
begin
  if p_kind is null or p_screen is null or p_text is null or p_by is null or p_client_id is null then
    raise exception 'eng_send_app_feedback: kind, screen, text, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') then
    raise exception 'eng_send_app_feedback: only a tutor or parent sends app feedback (staff_only)' using errcode = '42501';
  end if;
  if p_kind not in ('bug', 'hard_to_use', 'suggestion', 'question') then
    raise exception 'eng_send_app_feedback: unknown kind (bad_kind)' using errcode = '22023';
  end if;
  select * into v_prev from english.app_feedback f where f.family_id = v_member.family_id and f.client_id = p_client_id;
  if found then return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true); end if;
  insert into english.app_feedback(family_id, by_member, by_role, kind, screen, text, client_id)
  values (v_member.family_id, p_by, v_member.role, p_kind, pg_catalog.btrim(p_screen), pg_catalog.btrim(p_text), p_client_id) returning id into v_id;
  insert into english.app_feedback_events(feedback_id, status, reply, by_member, client_id) values (v_id, 'new', null, p_by, p_client_id || ':new');
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end $$;
revoke all on function english.eng_send_app_feedback(text, text, text, uuid, text) from public, anon, authenticated;

create or replace function english.eng_update_app_feedback(p_feedback uuid, p_status text, p_reply text, p_by uuid, p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_member english.members%rowtype; v_fb english.app_feedback%rowtype; v_prev english.app_feedback_events%rowtype; v_id uuid;
begin
  if p_feedback is null or p_status is null or p_by is null or p_client_id is null then
    raise exception 'eng_update_app_feedback: feedback, status, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  select * into v_fb from english.app_feedback f where f.id = p_feedback;
  if v_fb.id is null then raise exception 'eng_update_app_feedback: feedback not found' using errcode = 'P0002'; end if;
  if v_member.id is null or v_member.role <> 'parent' or v_member.family_id <> v_fb.family_id then
    raise exception 'eng_update_app_feedback: only a parent of the family updates feedback (parent_only)' using errcode = '42501';
  end if;
  if p_status not in ('new', 'in_progress', 'done', 'wont_do') then
    raise exception 'eng_update_app_feedback: unknown status (bad_status)' using errcode = '22023';
  end if;
  select * into v_prev from english.app_feedback_events e where e.feedback_id = p_feedback and e.client_id = p_client_id;
  if found then return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true); end if;
  insert into english.app_feedback_events(feedback_id, status, reply, by_member, client_id)
  values (p_feedback, p_status, nullif(pg_catalog.btrim(coalesce(p_reply, '')), ''), p_by, p_client_id) returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end $$;
revoke all on function english.eng_update_app_feedback(uuid, text, text, uuid, text) from public, anon, authenticated;
```

- [ ] **Step 4: Run → PASS.** · **Step 5: Commit** `feat(w1): app feedback send/update functions`

---

### Task 4: Mở rộng `eng_purge_learner` / `eng_purge_preview`

**Files:** Modify `db/migrations/0025_workdesk_w1.sql`; Test `tests/db/workdeskW1.test.ts`.

- [ ] **Step 1: Failing test**

```ts
  describe("4. purge", () => {
    it("dry run counts teaching_notes and learner_intake; purge removes them; app_feedback untouched", async () => {
      const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử xóa W1','B',true,'active') returning id", [s.familyId]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
      await svc("select english.eng_write_teaching_note($1,'focus','x',$2,'pg-00000001') as r", [L, M().tutorNguyen]);
      await svc("select english.eng_write_intake($1,'{\"goals\":[]}'::jsonb,$2,'pg-00000002') as r", [L, M().tutorNguyen]);
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
      expect(dry.counts.teaching_notes).toBe(1); expect(dry.counts.learner_intake).toBe(1);
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
      expect(receipt.deleted.teaching_notes).toBe(1); expect(receipt.deleted.learner_intake).toBe(1);
      expect(await q1("select 1 from english.teaching_notes where learner_id=$1", [L])).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run → FAIL** (khóa `teaching_notes` không có trong `counts`).
- [ ] **Step 3: Copy toàn bộ thân `eng_purge_preview` và `eng_purge_learner` từ 0024 (`sed -n '/create or replace function english.eng_purge_preview/,/^\$\$;/p' db/migrations/0024_studio_b1.sql`), dán vào 0025, thêm 2 dòng đếm/xóa cho `teaching_notes` và `learner_intake` **ngay trước** phần xóa `learners`-dependent đầu tiên (cùng vị trí các bảng chỉ thêm khác). Không bỏ bảng nào đã có.**
- [ ] **Step 4: Run cả `tests/db/workdeskW1.test.ts` và `tests/db/studio.test.ts` (purge cũ) → PASS.**
- [ ] **Step 5: Commit** `feat(w1): purge covers teaching_notes and learner_intake`

Chạy `npm run db:apply`? **Không** — phụ huynh áp trên Supabase thật. Ghi vào PR.

---

### Task 5: `lib/workdesk` — types, schemas, handlers, store, route

**Files:**
- Create: `lib/workdesk/types.ts`, `schemas.ts`, `handlers.ts`, `supabaseStore.ts`, `route.ts`
- Modify: `lib/auth/requireAccess.ts` (thêm action `"teaching:write"` vào `Action` và `ACTIONS_BY_ROLE.tutor`)
- Test: `tests/unit/workdeskApi.test.ts`

**Interfaces:**
- Produces: `NOTE_FIELDS = ["focus","explain","errors","avoid"] as const`; `FEEDBACK_KINDS`, `FEEDBACK_STATUSES`; `teachingNoteBodySchema = z.object({ field: z.enum(NOTE_FIELDS), text: z.string().max(600), client_id: z.string().min(8).max(100) })`; `intakeBodySchema`; `appFeedbackBodySchema = z.object({ kind, screen: z.string().min(1).max(80), text: z.string().trim().min(1).max(1000), client_id })`; `feedbackUpdateBodySchema = z.object({ status, reply: z.string().max(600).optional(), client_id })`.
- `interface WorkdeskStore { writeNote(a): Promise<unknown>; writeIntake(a): Promise<unknown>; sendFeedback(a): Promise<unknown>; updateFeedback(a): Promise<unknown>; }` — tham số: `{ learnerId, field, text, byMemberId, clientId }`, `{ learnerId, content, byMemberId, clientId }`, `{ kind, screen, text, byMemberId, clientId }`, `{ feedbackId, status, reply, byMemberId, clientId }`.
- Handlers: `handleWriteTeachingNote(deps, learnerId, body)`, `handleWriteIntake(deps, learnerId, body)`, `handleSendAppFeedback(deps, body)`, `handleUpdateAppFeedback(deps, feedbackId, body)` → `HandlerResult` (201 tạo mới, 200 replay, 400/401/403/404).
- Góp ý về app không có learner: dùng `requireStaff(deps.user, deps.access)` đã có (`lib/auth/requireAccess.ts:192`, trả `Member`, từ chối student); kiểm thêm `member.role === 'parent'` trong handler cập nhật (DB cũng kiểm `(parent_only)`). Không cần action mới cho góp ý; chỉ thêm `"teaching:write"` (tutor).

- [ ] **Step 1: Failing unit tests** (mẫu `tests/unit/levelsApi.test.ts`: fake `AccessStore`, fake store ghi lại lời gọi)

```ts
describe("handleWriteTeachingNote", () => {
  it("tutor of the child → 201 and rpc args; parent → 403; other tutor → 404; bad field → 400", async () => {
    const calls: unknown[] = []; const st = store({ writeNote: async (a) => { calls.push(a); return { id: "n1", replayed: false }; } });
    const body = { field: "focus", text: "Đảo ngữ", client_id: "tn-00000001" };
    expect(await handleWriteTeachingNote(deps("tutorNguyen", st), NGUYEN, body)).toEqual({ status: 201, body: { id: "n1", replayed: false } });
    expect(calls[0]).toMatchObject({ learnerId: NGUYEN, field: "focus", text: "Đảo ngữ", clientId: "tn-00000001" });
    expect((await handleWriteTeachingNote(deps("parent", st), NGUYEN, body)).status).toBe(403);
    expect((await handleWriteTeachingNote(deps("tutorAn", st), NGUYEN, body)).status).toBe(404);
    expect((await handleWriteTeachingNote(deps("tutorNguyen", st), NGUYEN, { ...body, field: "mood" })).status).toBe(400);
  });
});
describe("handleSendAppFeedback / handleUpdateAppFeedback", () => {
  it("tutor and parent send (201); student 403; only parent updates", async () => { /* same shape; assert 201 / 403 / 201 for update by parent, 403 by tutor */ });
});
```

- [ ] **Step 2: Run → FAIL** (module missing).
- [ ] **Step 3: Implement** theo mẫu `lib/levels/handlers.ts` (guard → parse body → store → map lỗi `(tutor_only)`→403 `teaching_tutor_only`, `(parent_only)`→403, `(staff_only)`→403, `(bad_field)|(bad_content)|(bad_kind)|(bad_status)|(too_long)`→400, `P0002`→404). `route.ts` sao `lib/levels/route.ts` không cần `storage`. `supabaseStore.ts` gọi 4 rpc với tên tham số `p_*` đúng như SQL.
- [ ] **Step 4: Run → PASS**, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(w1): lib/workdesk handlers, schemas, store, route; access actions`

---

### Task 6: API routes + load/shape

**Files:**
- Create: `app/api/learners/[id]/teaching-notes/route.ts`, `app/api/learners/[id]/intake/route.ts`, `app/api/feedback/route.ts`, `app/api/feedback/[id]/route.ts`, `lib/workdesk/shape.ts`, `lib/workdesk/load.ts`
- Test: `tests/unit/workdeskShape.test.ts`

**Interfaces:**
- `loadTeachingNotes(learnerId): Promise<TeachingNotesView>` với `TeachingNotesView = { fields: Record<NoteField, { text: string; at: string; authorName: string } | null>; updatedAt: string | null }` — lấy dòng mới nhất mỗi `field` (select 40 dòng mới nhất, gom trong code bằng `parseTeachingNotes(rows)`).
- `loadIntake(learnerId): Promise<IntakeView | null>` — dòng mới nhất; `IntakeView = { goals: {title: string; due: string|null}[]; strengths: Partial<Record<DomainKey,string>>; weaknesses: ...; note: string; at: string }`.
- `loadAppFeedback(): Promise<AppFeedbackView[]>` — mọi góp ý gia đình (RLS lọc) + sự kiện mới nhất: `{ id, kind, screen, text, byName, byRole, at, status, reply, statusAt }`, sắp `status='new'` trước rồi mới nhất trước.

- [ ] **Step 1: Failing shape tests** — `parseTeachingNotes` lấy dòng mới nhất mỗi ô, ô thiếu = `null`; `parseIntake` chịu được `content` thiếu `note`; `parseFeedback` lấy sự kiện mới nhất và sắp đúng.
- [ ] **Step 2: Run → FAIL.** · **Step 3: Implement** (`shape.ts` bằng zod như `lib/tutorwork/shape.ts`; `load.ts` dùng `createUserClient()` + `fail()` như `lib/tutorwork/load.ts`; tên người: join `members(display_name)` qua `author_member`/`by_member` **không** FK → query `members` riêng theo danh sách id).
- [ ] **Step 4: Routes**: 4 file theo mẫu `app/api/learners/[id]/levels/route.ts` (`readJson` + `runWorkdeskRoute`).
- [ ] **Step 5: Run unit + typecheck → PASS.** · **Commit** `feat(w1): API routes and loaders for notes, intake, feedback`

---

### Task 7: Chữ giao diện + thẻ "Ghi chú dạy học" và "Hồ sơ đầu vào" trên trang Hồ sơ cấp

**Files:**
- Modify: `lib/copy/vi.ts` (thêm `teachingNotes`, `intake`, `appFeedback`), `app/learners/[id]/levels/page.tsx`
- Create: `components/workdesk/TeachingNotesCard.tsx`, `components/workdesk/IntakeCard.tsx`
- Test: `tests/unit/workdeskUi.test.ts` (render tĩnh như `tests/unit/tutorWorkUi.test.ts`), `tests/e2e/workdesk.spec.ts`

**Copy (đặt trong vi.ts, không viết cứng trong component):**

```ts
export const teachingNotes = {
  title: "Ghi chú dạy học",
  intro: (name: string) => `Điều chỉ ${tutorHonorific} biết về ${name}. AI sẽ đọc mục này khi soạn nháp; phụ huynh cũng xem được.`,
  fields: { focus: "Đang tập trung vào", explain: "Cách giải thích hợp với con", errors: "Lỗi hay lặp lại", avoid: "Cần tránh" } as const,
  hints: { focus: "Ví dụ: đề vào 10 — đảo ngữ, câu điều kiện hỗn hợp", explain: "Ví dụ: giải thích tiếng Việt ngắn, ví dụ 1 câu", errors: "Ví dụ: nhầm take on / take up", avoid: "Ví dụ: không dạy mới tuần có bài thi trên lớp" } as const,
  empty: "—", edit: "Sửa", save: "Lưu", cancel: "Hủy", saving: "Đang lưu…", saved: "Đã lưu. AI dùng từ lần soạn sau.",
  updated: (at: string, by: string) => `Cập nhật ${at} · ${by}`,
  readOnly: `Chỉ ${tutorHonorific} của em sửa được mục này.`,
  noPrompt: `Không cần viết prompt. Cách AI làm việc do phụ huynh cài; ${tutorHonorific} chỉ ghi về con.`,
  tooLong: "Mỗi ô tối đa 600 ký tự.",
} as const;
export const intakeCopy = {
  title: "Hồ sơ đầu vào", goals: "Mục tiêu", goalTitle: "Mục tiêu", goalDue: "Mốc (tháng/năm)", addGoal: "+ Thêm mục tiêu", removeGoal: (t: string) => `Bỏ mục tiêu ${t}`,
  strengths: "Điểm mạnh ban đầu", weaknesses: "Điểm yếu ban đầu", byDomainHint: "Theo mảng; để trống nếu chưa rõ.", note: "Ghi chú",
  empty: `Chưa có hồ sơ đầu vào. ${tutorHonorific} ghi lần đầu khi bắt đầu dạy; sau đó app tự rút điểm mạnh / yếu từ bằng chứng.`,
  edit: "Cập nhật hồ sơ", save: "Lưu hồ sơ", cancel: "Hủy", saved: "Đã lưu hồ sơ đầu vào.", recorded: (at: string, by: string) => `Ghi ${at} · ${by}`,
} as const;
export const appFeedback = {
  link: "Góp ý về app", title: "Góp ý về app", intro: "Gửi thẳng cho phụ huynh (người dựng app). Không cần viết dài.",
  kinds: { bug: "Lỗi", hard_to_use: "Khó dùng", suggestion: "Đề xuất", question: "Câu hỏi" } as const,
  screen: "Ở màn", text: "Bạn gặp gì / muốn gì?", textHint: "Ví dụ: chọn kỹ năng phải cuộn lâu; muốn chọn lại như buổi trước",
  send: "Gửi", sent: "Đã gửi cho phụ huynh.", empty: "Chưa có góp ý nào.", mine: "Góp ý đã gửi", all: "Góp ý của thầy/cô và phụ huynh",
  statuses: { new: "Mới", in_progress: "Đang sửa", done: "Đã sửa", wont_do: "Không làm" } as const,
  status: "Trạng thái", reply: "Trả lời", replyHint: "Trả lời thầy/cô…", update: "Cập nhật", updated: "Đã cập nhật · thầy/cô thấy ngay.",
  parentOnly: "Chỉ phụ huynh đổi trạng thái.", required: "Viết vài chữ trước đã.",
} as const;
```

(Thêm vào `docs/UX_COPY_GUIDE.md` một mục "W1" liệt kê các khóa mới.)

- [ ] **Step 1: Failing UI tests** — `TeachingNotesCard` render 4 nhãn ô, "—" khi trống, nút Sửa chỉ khi `canEdit`; `IntakeCard` render `empty` khi `null`.
- [ ] **Step 2: Run → FAIL.** · **Step 3: Implement**: `TeachingNotesCard` (client component; lưới 2 cột, nhãn trên ô; Sửa → 4 `<textarea rows=2 maxLength=600>` → Lưu gửi **từng ô có thay đổi** `POST /api/learners/:id/teaching-notes` với `client_id = crypto.randomUUID()`; thông báo `saved`). `IntakeCard` (mục tiêu danh sách thêm/bỏ, 7 mảng × 2 ô text; Lưu → `POST .../intake`). `canEdit = grant.role === 'tutor'` truyền từ page.
- [ ] **Step 4: Sửa `app/learners/[id]/levels/page.tsx`**: `Promise.all` thêm `loadTeachingNotes(learner.id)`, `loadIntake(learner.id)`; render `IntakeCard` rồi `TeachingNotesCard` **trên** 7 thanh cấp (theo spec §5 quy tắc 2: việc cần ghi ở trên).
- [ ] **Step 5: E2E** (`tests/e2e/workdesk.spec.ts`, mẫu `tests/e2e/tutorWork.spec.ts`): đăng nhập gia sư thử → `/learners/<nguyen>/levels` → bấm `[data-testid="notes-edit"]` → gõ vào `#tn_focus` → Lưu → thấy chữ vừa gõ; đăng nhập phụ huynh → thấy chữ, **không** thấy nút Sửa; đăng nhập em → `/learners/<id>/levels` bị chặn như hiện nay (giữ test cũ).
- [ ] **Step 6: `npm run typecheck && npm run lint && npx vitest run tests/unit` → PASS; `npm run test:e2e -- --list` liệt kê test mới.** · **Commit** `feat(w1): teaching notes and intake cards on the level profile page`

---

### Task 8: Trang `/feedback` + nút ở AppHeader

**Files:**
- Create: `app/feedback/page.tsx`, `components/workdesk/FeedbackForm.tsx`, `components/workdesk/FeedbackList.tsx`
- Modify: `components/AppHeader.tsx` (nút `appFeedback.link` cho vai tutor/parent; prop mới `staffNav?: boolean` hoặc đọc vai từ page), trang chủ người lớn (`app/page.tsx`) truyền prop.
- Test: `tests/unit/workdeskUi.test.ts`, `tests/e2e/workdesk.spec.ts`

- [ ] **Step 1: Failing UI tests** — `FeedbackList` với vai `parent` render `<select data-testid="fb-status-{id}">` + ô trả lời; vai `tutor` chỉ render nhãn trạng thái; danh sách sắp `new` trước.
- [ ] **Step 2: Run → FAIL.** · **Step 3: Implement**: page server: `requireStaff` (401 → đăng nhập; student → 403 trang "Không có quyền" như các trang người lớn khác), `loadAppFeedback()`, render `FeedbackForm` (chip 4 loại — nút `aria-pressed`; ô `screen` điền sẵn từ `?screen=` trên URL hoặc "Trang chủ"; textarea; Gửi → `POST /api/feedback`) + `FeedbackList` (vai parent: select trạng thái + input trả lời + Cập nhật → `POST /api/feedback/:id`). Nút trong `AppHeader`: `<Link href={"/feedback?screen=" + encodeURIComponent(currentScreenLabel)}>` — mỗi page người lớn truyền `screenLabel` (chuỗi từ copy của trang đó); không có thì bỏ tham số.
- [ ] **Step 4: E2E**: gia sư gửi góp ý → thấy trong danh sách với "Mới"; phụ huynh đổi sang "Đang sửa" + trả lời → gia sư tải lại thấy "Đang sửa" và lời trả lời.
- [ ] **Step 5: Checks xanh.** · **Commit** `feat(w1): app feedback page with parent status/reply`

---

### Task 9: Tài liệu, review, PR

**Files:** Modify `docs/PROGRESS.md`, `CLAUDE.md`, `docs/DESIGN.md` (§19.12 mới: 4 bảng, 4 hàm, RLS, purge), `docs/UX_COPY_GUIDE.md`.

- [ ] **Step 1: PROGRESS.md** thêm "## W1 · Ghi chú dạy học + Hồ sơ đầu vào + Góp ý về app (08/11/2026)": làm gì; **SQL cần phụ huynh áp: `0025_workdesk_w1.sql` TRƯỚC khi thử preview** (chỉ thêm; cần 0024); cách thử (4 bước Task 7–8); tiêu chí đạt (spec §6 W1); trạng thái "chờ review Opus + phụ huynh duyệt PR".
- [ ] **Step 2: CLAUDE.md** Current status: dòng W1 (nhánh, migration 0025, chờ), số migration kế tiếp → **0026**.
- [ ] **Step 3: DESIGN.md §19.12** tóm tắt như §19.8.
- [ ] **Step 4: Chạy đủ** `npm run typecheck && npm run lint && npm test` (DB tests cần Postgres; nếu không có thì ghi rõ "chạy trong CI"). Commit `docs(w1): progress, design §19.12, status`.
- [ ] **Step 5: Review Opus** bằng agent `reviewer` trên `git diff origin/main...HEAD`, đối chiếu DOMAIN §2/§4/§6/§7 và spec §5; sửa mọi lỗi cao/trung bình; commit.
- [ ] **Step 6: Mở PR** `feature/w1-notes-feedback → main`, tiêu đề "W1 · Ghi chú dạy học, hồ sơ đầu vào, góp ý về app", mô tả tiếng Việt 4 mục + dòng "SQL cần phụ huynh áp: `0025`" + trailer. Không gộp.

---

## Khung W2–W6 (lên kế hoạch riêng khi lát trước gộp)

| Lát | Việc chính | Dữ liệu (migration) | AI / công thức | Phụ thuộc · tiêu chí (spec §6) |
|---|---|---|---|---|
| **W2 Giáo trình** | Thêm giáo trình (tên, `level_note`, PDF mục lục) → AI đọc → nháp Unit + nối Unit→nhãn → duyệt → phiên bản khóa; "đang học đến" bằng sự kiện Unit; Ghi buổi chọn Unit; seed nhãn dạng câu nghe (R7) | `0026`: `curricula`, `curriculum_versions`, `curriculum_units` (mã Unit ổn định), `curriculum_unit_points` (→ `error_tags.key` của track), `curriculum_unit_events` (chỉ thêm); `lesson_notes.unit_refs text[]`; `files.kind` thêm `curriculum_toc`; seed nhãn nghe | `prompts/curriculum-toc.v1.md`; `ai_runs` kind `curriculum_toc`; `AI_FAKE` fixture = mục lục Destination 26 Unit | Sau W1 gộp. Đạt: 26 Unit đúng thứ tự trên bộ đề chuẩn; nối chỉ trong danh sách đóng; 3 ví dụ DOMAIN §5.1; v2 không đổi bằng chứng; **lần nạp thật đầu tiên = lần thử AI** (ghi chi phí + % sửa vào PROGRESS) |
| **W3 Mức điểm + Bản đồ + Nạp bài** | `PP-0.1` seed (`gen:config -- --new`); engine thuần `lib/engine/points/` đọc câu đã chấm theo nhãn; đề xuất 3–4 vào **tab "Kỹ năng"** chung (R1); ⚑; Bản đồ kiến thức theo giáo trình/mảng; Nạp bài đã làm: mẫu `kind='imported'` không thuộc bước (R2), ngày làm thật, mức hỗ trợ, mã băm chống trùng, phụ huynh tải / gia sư xác nhận (R8) | `0027` seed PP-0.1 + `0028`: `point_decisions` (chỉ thêm, cùng CHECK kiểu `mastery_decisions`), `point_state` (dẫn xuất), `attempts.provenance` thêm `'imported'`, cột `taken_on`, `support_level`, `source_hash`; `inquiry_templates.kind` thêm `'imported'` | `prompts/read-answers.v1.md` (ảnh/PDF bài làm → câu trả lời + độ chắc; bỏ dấu chữa) | Sau W2. Đạt: 60 câu Progress Test đúng ngày 23/10; 5 ví dụ §5.2; nạp trùng chặn; "làm cùng cô" ≤ mức 2; tính lại giống hệt; S7a không đổi sau nạp |
| **W4 Bốn cách giao bài** | ② file → con nộp ảnh/file; ③ link → ảnh trang kết quả → điểm theo phần; ④ nhập nhanh khi ghi buổi; Chờ duyệt gom mọi cách nộp (bảng gọn, lọc); vòng góp ý ngắn cho AI; thang `CAM-WS-1` + quy đổi 0–4 (R6) | `0029`: `submission_files`, `ai_feedback` (chỉ thêm), seed `CAM-WS-1`, `files.kind` thêm `work_file` | `read-answers.v1` (dùng lại), `read-result-page.v1`, góp ý bài viết nháp theo tiêu chí | Sau W3. Đạt: ảnh bài giấy → AI đọc → code chấm; câu mờ → gia sư phán; trang kết quả không bịa câu; góp ý ghi đủ |
| **W5 Lộ trình nhiều dòng + KT tháng** | Lộ trình 12 tháng, mỗi dòng một giáo trình/mảng, có phiên bản, duyệt phần thay đổi, phụ huynh được báo (trang chủ); Studio B1 đánh dấu "kiểm tra tháng" | `0030`: `roadmap_versions` (chỉ thêm, jsonb các dòng), `parent_notices` (hoặc dùng cơ chế trang chủ hiện có) | `roadmap.v1` (hỏi lại khi thiếu buổi) | Sau W2–W3. Đạt: ≥ 4 dòng cho Nguyên; tổng buổi khớp; duyệt phần thay đổi; phụ huynh thấy thông báo vN |
| **W6 Vòng tháng + Tổng hợp góp ý** | Nhận xét tháng nháp (4 mục, mỗi câu dẫn bằng chứng) + cờ "Cần đối chiếu"; kế hoạch buổi sau; gợi ý bài luyện (Studio bước 2); màn Tổng hợp góp ý (chỉ phụ huynh): % câu giữ nguyên theo việc, Sửa công thức (vN+1 + bộ đề chuẩn) | `0031`: `monthly_comments`, `comment_point_links`, `consistency_flags` (chỉ thêm); `ai_feedback` thống kê bằng view/hàm | `monthly-comment.v1`, `session-plan.v1`, `practice-suggest.v1` | Sau W3–W5. Đạt: 4 mục có bằng chứng; 3 ví dụ §5.4; tổng hợp đếm đúng |

Mỗi lát: kế hoạch riêng `docs/superpowers/plans/2026-MM-DD-wN-*.md` theo đúng khuôn này (migration → hàm → lib → API → màn → docs → review → PR), có mockup/preview cho gia sư thử trước khi gộp.
