# Learning OS — Family Edition

Web app (Next.js) giúp **2 con học tiếng Anh trên cùng một nền tảng**: Track A (An, lớp 6, A2→B1, chủ đề khoa học) và Track B (Nguyên, lớp 9, B2→C1, đến kỳ thi vào 10 thì pha trộn ~60% bám đề + ~40% tư duy–lập luận). App **đo tiến bộ bằng bằng chứng** (bài làm gốc, mức hỗ trợ, gia sư/phụ huynh duyệt), không phải app bài tập hay chatbot.

Chủ dự án là phụ huynh, **không phải dev** — giải thích bằng tiếng Việt đơn giản; mỗi PR có hướng dẫn thử trên preview.

## Đọc trước khi làm bất cứ việc gì

1. `docs/PRD_FAMILY_EDITION.md` — phạm vi (§2, §2.1), quyết định D11–D28, target set (§3.1, §3.2), 8 loại hoạt động (§4), **lát build (§8)**.
2. `docs/DESIGN.md` — kiến trúc, schema `english`, RLS, engine, hàng đợi, STT trên máy, AI, sao lưu, **mục KHÔNG tự quyết (§17)**.
3. `docs/UX_COPY_GUIDE.md` — **mọi chữ giao diện** lấy từ `lib/copy/vi.ts` theo file này; không tự đặt nhãn.
4. `content/catalogue_v0.2.json` — danh mục năng lực (seed), đọc bằng code.
5. Tham chiếu gốc: MVP PRD v1.0 + Master Architecture v1.0 (nằm trong hub; file PRD Family thắng khi mâu thuẫn).
6. `docs/PROGRESS.md` — lát nào xong, việc phụ huynh cần làm, SQL cần áp.

## Tech stack

Next.js (App Router) + TypeScript strict + Tailwind · Supabase (Postgres + Auth) **dùng chung project với Study Launcher, mọi thứ trong schema `english`** · Vercel · Vitest (+ Postgres local cho test DB) · zod · STT chạy trong trình duyệt · Claude API từ server.

## Conventions

- Code, comment, commit: tiếng Anh. Chữ giao diện: tiếng Việt qua `lib/copy/vi.ts`. Xưng "bạn" với học sinh.
- Track là **cấu hình**: không viết `if (track === 'A')` trong logic nghiệp vụ (lint đang chặn).
- Mỗi lát = 1 nhánh `feature/sN-<ten>` = 1 PR. Mô tả PR (tiếng Việt): làm gì · cách thử trên preview · **SQL cần phụ huynh áp** · tiêu chí đạt/chưa.
- Migration: file `db/migrations/NNNN_*.sql`, idempotent, kết thúc bằng insert vào `english.schema_migrations`. Áp bằng `npm run db:apply` hoặc SQL Editor. **Không** dùng `supabase db push`. Không sửa migration đã áp.
- Bảng append-only mới phải gắn `english.eng_forbid_mutation` (xem header `0004_append_only.sql`). Không `grant … on all tables`.
- Test: `npm run typecheck && npm run lint && npm test` phải xanh trước khi mở PR.

## Key decisions (tóm tắt — chi tiết PRD Family §1)

- Audio **không bao giờ** rời máy; server chỉ nhận chữ + chỉ số.
- Evidence append-only; 3 lớp điểm riêng (AI · người chấm · quyết định); trạng thái là dữ liệu dẫn xuất, rebuild được.
- Engine chỉ **đề xuất**; người duyệt xác nhận. Không tự hạ bậc. Bài kiểm tra trong buổi chỉ gia sư duyệt; phần còn lại gia sư hoặc phụ huynh.
- Học sinh không thấy điểm số; phụ huynh/gia sư thấy điểm dạng "3/4 · Đạt yêu cầu".
- AI: Reviewer + Coach cho cả 2 track; Clarifier/Challenger cho Track B từ hè 2027. Trần $10/tháng; hết trần → làm thủ công.
- Ngưỡng nằm trong `assessment_policies` (AP-0.2-pilot), không hard-code. Delayed check: ≥14 ngày từ lần luyện gần nhất **của target đó trên cùng chủ đề/nguồn**.
- `ALLOW_REAL_LEARNERS=false` trên preview: chỉ dùng learner thử.

## Warnings — KHÔNG được làm

- Không tạo/sửa gì trong schema `public` (của Launcher). Không dùng `supabase db push`, không `db reset --linked`.
- Không đưa audio ra khỏi máy (kể cả Web Speech API, STT cloud).
- Không dùng `service_role`/`ANTHROPIC_API_KEY` ở client. Không commit secret.
- Không cho AI tự xác nhận/đổi bậc; không cho học sinh thấy điểm thô; không chép đề thi chính thức.
- Không thêm streak, bảng xếp hạng, chat mở với AI, dịch vụ trả phí hay bên thứ ba nhận dữ liệu của con.
- Không bật build đêm tự động trừ khi phụ huynh yêu cầu.
- Thấy spec thiếu/mâu thuẫn → dừng, ghi vào PR + `docs/PROGRESS.md`, hỏi phụ huynh.

## Lệnh

```bash
npm run dev · npm run typecheck · npm run lint · npm test
npm run db:apply          # áp migration chưa có (cần DATABASE_URL)
npm run db:seed-dev       # gia đình THỬ (An (thử), Nguyên (thử)) + gán A-v1 / B-v1
npm run gen:config        # = --check: báo đỏ nếu bản đã công bố bị sửa, migration seed lệch, hoặc có nội dung mới chưa vào migration
npm run gen:config -- --new  # nội dung MỚI (vd B-v2) → ghi vào migration kế tiếp NNNN_seed_*.sql + khóa vào content/config.lock.json (không bao giờ ghi đè)
npm run test:e2e          # Playwright — chạy trong CI với Supabase local thật (job "E2E smoke"); máy không có Docker thì chỉ `--list`
npm run doctor            # kiểm tra cài đặt cloud 1 lần: bảng ✓/✗ tiếng Việt + cách sửa (cần .env.local; hoặc GitHub → Actions → "Setup doctor")
```

## Quay lại khi hỏng (rollback)

| Tình huống | Cách quay lại | Mất tối đa |
|---|---|---|
| Code hỏng sau khi deploy | Vercel → Deployments → chọn bản trước → **Promote to Production** (tức thì). Sau đó `git revert` PR lỗi để main sạch. | 0 dữ liệu |
| Database lỗi / xóa nhầm | Tải artifact sao lưu đêm (GitHub Actions, giữ 30 ngày) → `age -d` bằng khóa offline → `pg_restore` vào project thử, đối chiếu, rồi mới khôi phục schema `english`. Migration chỉ thêm (expand/contract) nên không có bước "down". **Chưa gồm `auth.users`** — chờ phụ huynh quyết (PROGRESS). | ≤ ~24 giờ |
| Ai quyết | **Phụ huynh** quyết và bấm. Claude chỉ chuẩn bị lệnh/kiểm tra; không tự khôi phục, không tự xóa dữ liệu. | — |

## Phân vai model (`.claude/agents/`)

- `reviewer` (Opus): review diff cuối mỗi lát — bắt buộc trước khi mở PR cho phụ huynh.
- `builder` (Sonnet): code từng bước theo kế hoạch lát; sai 2 lần cùng chỗ → dừng, chuyển Opus.
- `chore` (Haiku): việc cơ học (đổi tên, format).
- Kế hoạch mỗi lát (Opus) ghi vào `docs/plans/sN-<ten>.md` trước khi code.

## Current status

- Repo: `haleytruong89-moon/Enghlish-app` (private). S0 đã push, CI xanh. **S1 (cấu hình: track, danh mục, ngưỡng, bộ kỹ năng A-v1/B-v1, trang "Kỹ năng đang theo dõi") code xong trên nhánh `feature/s1-config`**, chờ review + phụ huynh áp `0005`, `0006` (xem `docs/PROGRESS.md`). **S2 (mẫu chủ đề + tài liệu + giao bài có snapshot, trang "Giao bài" cho phụ huynh/gia sư) code xong và đã sửa theo review Opus trên nhánh `feature/s2-inquiries`**, chờ phụ huynh áp `0007`, `0008` (học sinh chỉ đọc bài qua `eng_my_released_steps`, không SELECT bảng); 4 mẫu Track B (B-W1…W4) còn nháp vì vi phạm luật danh mục, chờ phụ huynh quyết (xem `docs/PROGRESS.md`).
- Chờ phụ huynh: Supabase (schema `english`, tắt sign-up, áp 0001–0008), Vercel, khóa sao lưu + GitHub Secrets (xem `docs/PROGRESS.md`).
- Tiếp theo theo thứ tự ưu tiên để 2 em dùng sớm: **S4 → S5 (+ phần câu hỏi đọc/bài dạng đề của S3)**.
- Seed cấu hình sinh tự động và **khóa phiên bản**: bản đã công bố (danh mục 0.2.1-draft, ngưỡng AP-0.2-pilot, bộ A-v1/B-v1) nằm trong `content/config.lock.json` — KHÔNG sửa nội dung của chúng (CI báo đỏ). Muốn đổi = thêm phiên bản mới (file mới, id mới như `B-v2`) rồi `npm run gen:config -- --new` để sinh migration kế tiếp (số kế tiếp, hiện là 0009…); không sửa tay các migration seed.
- Pilot thủ công cả 2 em chạy song song từ 17–19/10/2026 (Pilot Kit A/B v0.2 trong hub).
