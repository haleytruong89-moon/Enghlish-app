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
npm run db:seed-throwaway # thêm 1 em THỬ "Em thử xóa …" vào gia đình thử để thử màn Xóa dữ liệu (từ chối nếu có em thật; hoặc workflow "Seed test family" mode=throwaway)
npm run db:create-family  # gia đình THẬT (An, Nguyên + 2 gia sư): dùng lại tài khoản đã có theo email; thường chạy qua workflow "Create real family" (gõ CREATE)
npm run db:reset-password # đặt lại mật khẩu MỘT thành viên (RESET_LOGIN, RESET_PASSWORD ≥ 12 ký tự, RESET_FAMILY=real|test, bắt buộc); thường chạy qua workflow "Reset password" (gõ RESET); Launcher dùng chung nên mật khẩu Launcher cũng đổi
npm run gen:config        # = --check: báo đỏ nếu bản đã công bố bị sửa, migration seed lệch, hoặc có nội dung mới chưa vào migration
npm run gen:config -- --new  # nội dung MỚI (vd B-v2) → ghi vào migration kế tiếp NNNN_seed_*.sql + khóa vào content/config.lock.json (không bao giờ ghi đè)
npm run test:e2e          # Playwright — chạy trong CI với Supabase local thật (job "E2E smoke"); máy không có Docker thì chỉ `--list`
npm run doctor            # kiểm tra cài đặt cloud 1 lần: bảng ✓/✗ tiếng Việt + cách sửa (cần .env.local; hoặc GitHub → Actions → "Setup doctor")
```

## Quay lại khi hỏng (rollback)

| Tình huống | Cách quay lại | Mất tối đa |
|---|---|---|
| Code hỏng sau khi deploy | Vercel → Deployments → chọn bản trước → **Promote to Production** (tức thì). Sau đó `git revert` PR lỗi để main sạch. | 0 dữ liệu |
| Database lỗi / xóa nhầm | Tải artifact sao lưu **hằng tuần** (sáng Chủ nhật; GitHub Actions, giữ 30 ngày ≈ 4 bản) → `age -d` bằng khóa offline → `pg_restore` vào project thử, đối chiếu, rồi mới khôi phục schema `english`. Migration chỉ thêm (expand/contract) nên không có bước "down". Từ S5c bản sao lưu **gồm `auth.users` + `auth.identities`** (file riêng `learning-os-auth-….dump.age`). Thứ tự khôi phục: **auth trước** (`pg_restore --data-only` vào project có cùng cấu trúc GoTrue), rồi `public` + `english`. Ảnh/PDF tải lên **không** nằm trong sao lưu. | ≤ ~7 ngày (phụ huynh chọn chạy hằng tuần 16/10) — trước thay đổi lớn: bấm chạy tay |
| Ai quyết | **Phụ huynh** quyết và bấm. Claude chỉ chuẩn bị lệnh/kiểm tra; không tự khôi phục, không tự xóa dữ liệu. | — |

## Phân vai model (`.claude/agents/`)

- `reviewer` (Opus): review diff cuối mỗi lát — bắt buộc trước khi mở PR cho phụ huynh.
- `builder` (Sonnet): code từng bước theo kế hoạch lát; sai 2 lần cùng chỗ → dừng, chuyển Opus.
- `chore` (Haiku): việc cơ học (đổi tên, format).
- Kế hoạch mỗi lát (Opus) ghi vào `docs/plans/sN-<ten>.md` trước khi code.

## Current status

- Repo: `haleytruong89-moon/Enghlish-app` (private). **Đã gộp vào `main` (xong, CI xanh): S0, S1, S2 (+ 4 mẫu Track B), S4, S5, S1b (tạo gia đình thật), S5b-1 PR A và PR B.** Các migration **0001–0016 đã áp** trên Supabase thật (chi tiết từng lát: `docs/PROGRESS.md`).
- **S5c (Sẵn sàng dùng thật) — ĐÃ GỘP (PR #15, 19/10) và `0017` ĐÃ ÁP** (sao lưu thật có "Restore check PASSED"). Chi tiết: mục S5c trong `docs/PROGRESS.md`.
- **Studio 1 · PR A (Kỹ năng đọc) — code xong trên nhánh `feature/studio-1`**, chờ CI + review Opus + phụ huynh duyệt PR rồi áp **`0018_reading_skills.sql`** — **áp 0018 TRƯỚC khi thử preview hoặc gộp PR (0018 chỉ thêm, tương thích ngược với `main`)**: 14 (Track B) / 6 (Track A) nhãn "Kỹ năng đọc" theo báo cáo TOMO, bảng append-only `reading_reports` (gia sư/phụ huynh nhập tháng: số câu + % mỗi kỹ năng), bảng "Kỹ năng đọc" trên Điểm cần chú ý (< 4 câu = "chưa đủ dữ liệu"; ngưỡng ở `tutorwork_settings`), xóa dữ liệu một em gồm bảng mới. Tín hiệu, không phải bằng chứng; không AI. Kế hoạch `docs/superpowers/plans/2026-10-20-studio-1a-reading-skills.md`; chi tiết `docs/PROGRESS.md`. PR B (Studio: đề → bài trong app) làm tiếp trên cùng nhánh.
- Thứ tự tiếp theo (PRD D31 = E8, phụ huynh đã đồng ý 18/10): **S5c → spike AI (nhánh `feature/spike-studio-ai`, không gộp) → đưa gia sư vào + mockup Studio → Studio bước 1 (đề PDF/Word + đáp án → bài trong app, tự chấm, tự gắn nhãn) → Studio bước 2 (gợi ý bài bổ sung theo "Thư viện kiểu luyện", gộp S5b-2) → S6 → S7 → S8**. AI chỉ soạn **nháp** cho gia sư duyệt; không gửi danh tính của em; trần $10/tháng; chỉ bật sau khi phụ huynh duyệt `ai_text` (E6).
- Chờ phụ huynh: Vercel Deployment Protection cho Preview; duyệt văn bản đồng ý (`docs/CONSENT_pilot-2026-10.md`, cần trước khi bật AI); thêm 4 mật khẩu vào GitHub Secrets rồi tạo gia đình thật; buổi 30 phút với gia sư.
- Seed cấu hình sinh tự động và **khóa phiên bản**: bản đã công bố (danh mục 0.2.1-draft, ngưỡng AP-0.2-pilot, bộ A-v1/B-v1) nằm trong `content/config.lock.json` — KHÔNG sửa nội dung của chúng (CI báo đỏ). Muốn đổi = thêm phiên bản mới (file mới, id mới như `B-v2`) rồi `npm run gen:config -- --new` để sinh migration kế tiếp (số kế tiếp, **hiện là 0019** vì 0017 là migration S5c và 0018 là kỹ năng đọc của Studio 1 PR A); không sửa tay các migration seed.
- Pilot thủ công cả 2 em chạy song song từ 17–19/10/2026 (Pilot Kit A/B v0.2 trong hub).
