# Tiến độ build — Learning OS (Family Edition)

## S0 — Nền (13/10/2026)

**Trạng thái:** phần code xong, test chạy xanh trên máy. **Chờ phụ huynh** làm các bước trên cloud (bên dưới) rồi mới ký cổng G0.

### Đã làm

| Việc | Ở đâu |
|---|---|
| Schema riêng `english` (không đụng `public` của Launcher), bảng theo dõi migration riêng | `db/migrations/0001_english_schema.sql` |
| Bảng: gia đình, thành viên (phụ huynh/gia sư/học sinh), learner (có `is_test`, `ai_enabled`, track A/B), quan hệ có thời hạn, consent có version, nhật ký `audit_log`, lỗi `app_errors` | `0002_identity.sql` |
| Hàm quyền `eng_*` + RLS mọi bảng: học sinh chỉ thấy mình; gia sư chỉ thấy em có quan hệ còn hạn; phụ huynh thấy cả nhà; consent chỉ phụ huynh; `anon` không thấy gì | `0003_access.sql` |
| Chống sửa/xóa lịch sử (`audit_log` không UPDATE/DELETE/TRUNCATE được) + hàm xóa dữ liệu một em `eng_purge_learner` (chỉ server gọi được, có biên nhận) | `0004_append_only.sql` |
| Script áp migration `npm run db:apply` (chỉ áp file chưa có, mỗi file một transaction) | `scripts/db-apply.ts` |
| Script tạo gia đình THỬ: "An (thử)" Track A, "Nguyên (thử)" Track B, 1 phụ huynh, 2 gia sư (mỗi cô một em) | `scripts/seed-dev.ts` |
| App: trang đăng nhập (tiếng Việt), đăng xuất, trang chủ theo vai trò (học sinh "Chào An!", gia sư thấy em của mình, phụ huynh thấy "An · Track A", "Nguyên · Track B") | `app/` |
| Cổng kiểm quyền `requireAccess` cho mọi route; route mẫu `GET /api/learners/:id` trả **404** khi hỏi em ngoài phạm vi | `lib/auth/`, `app/api/learners/[id]/` |
| `ALLOW_REAL_LEARNERS=false` → app chỉ hiện learner thử (dùng cho bản preview) | `lib/env.ts` |
| Mọi chữ giao diện theo UX_COPY_GUIDE v0.1 | `lib/copy/vi.ts` |
| CI (kiểm kiểu, lint, test, build, test DB), sao lưu mã hóa hằng tuần (sáng Chủ nhật), ping giữ project không ngủ | `.github/workflows/` |

**Test (chạy trên máy, Postgres 16 + bản giả lập Supabase/Launcher):** `npm run typecheck` ✓ · `npm run lint` ✓ · `npm test` ✓ (52 test). Có test: gia sư của An không đọc được Nguyên và ngược lại; học sinh không đọc được em kia; `anon` không đọc được gì; tài khoản chỉ có bên Launcher không thấy gì bên này (và ngược lại); `audit_log` chặn sửa/xóa/truncate; đường xóa chỉ đi qua hàm.

### Phụ huynh cần làm (theo thứ tự)

1. ~~**GitHub:** tạo repo riêng tư, push code.~~ ✓ 13/10 — `haleytruong89-moon/Enghlish-app`, CI chạy xanh. *Lưu ý: 2 job hằng ngày (sao lưu 02:17, ping 08:41) sẽ báo đỏ cho tới khi xong bước 11 — bình thường.*
2. **Supabase:** dùng **chung project với Study Launcher** (D14). Nếu chưa có project: tạo mới, chọn region **Singapore (ap-southeast-1)**. (Region chỉ chọn được lúc tạo.)
3. **Mở schema `english` cho API:** Supabase Dashboard → Project Settings → **Data API** → *Exposed schemas* → thêm `english` (giữ `public`). Bấm Save.
4. **Tắt tự đăng ký:** Authentication → Sign In / Providers → tắt *Allow new users to sign up*. Tài khoản do phụ huynh tạo.
5. **Lấy chuỗi kết nối:** Project Settings → Database → Connection string → **Session pooler** (cổng 5432). Chép vào file `.env.local` trên máy mình dòng `DATABASE_URL=...` (không gửi cho ai, không commit).
6. **Áp migration** (chọn 1 cách — **dễ nhất là cách GitHub**, không cài gì trên máy):
   - **Trên GitHub:** cần Secret `DATABASE_URL` (bước 11) → tab **Actions** → **Apply database migrations** → **Run workflow** → gõ `APPLY` → Run. Xem kết quả ở *Summary*; lần chạy tự kiểm tra chạy lại lần 2 là "không còn gì để áp".
   - Trên máy: `npm install` rồi `npm run db:apply`. Chạy lại lần 2 phải báo "nothing to apply".
   - Hoặc SQL Editor của Supabase: dán **lần lượt** từng file dưới đây, bấm Run từng file.
7. **Kiểm tra toàn bộ cài đặt bằng 1 thao tác** (làm sau bước 6; làm lại sau bước 11 để kiểm tra cả khóa sao lưu). Chọn 1 cách, rồi đọc bảng ✓/✗ — mỗi dòng ✗ có 1 câu chỉ cách sửa:
   - Trên máy: thêm vào `.env.local` các dòng `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project Settings → API Keys, khóa **anon/public**) và `DATABASE_URL`, rồi chạy `npm run doctor`.
   - Hoặc trên GitHub: trước hết thêm 2 **biến** (Variables, không phải Secrets — vì là giá trị công khai) tại repo → Settings → Secrets and variables → Actions → tab **Variables** → *New repository variable*: `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Rồi vào tab Actions → **Setup doctor** → Run workflow → mở lần chạy → xem bảng ở phần *Summary*. (Workflow này cũng cần Secrets `DATABASE_URL` và `BACKUP_AGE_RECIPIENT` ở bước 11.)
   - Doctor kiểm tra: đủ biến môi trường · kết nối database · đã áp đủ migration · mọi bảng bật RLS · không có gì của app nằm trong schema `public` của Launcher · phiên bản Postgres ≤ 17 · schema `english` đã mở trong Data API · đã tắt tự đăng ký · (trên GitHub) có khóa sao lưu `age1…`. Không in ra bất kỳ mật khẩu/khóa nào.
   - Mục "bỏ qua" (–) nghĩa là thiếu thông tin để kiểm tra, chưa phải lỗi. Kết quả cuối ghi "ĐẠT" là xong bước này.
8. **Tạo tài khoản THỬ** (để xem app) — **cách dễ nhất trên GitHub:** thêm Secrets `SUPABASE_SERVICE_ROLE_KEY` (khóa Secret `sb_secret_…`) và `SEED_DEV_PASSWORD` (≥ 12 ký tự, chữ + số) → Actions → **Seed test family** → Run workflow → gõ `SEED`. Summary in 5 email thử. Hoặc trên máy: thêm vào `.env.local` các dòng `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEED_DEV_PASSWORD` (≥12 ký tự), rồi `npm run db:seed-dev`. Script in ra 5 email thử `eng-test-…@example.com`; mật khẩu là giá trị bạn đặt.
9. **Vercel:** Import repo → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`
   - `ALLOW_REAL_LEARNERS` = `false` cho **Preview**; cho Production cũng để `false` đến khi bắt đầu pilot thật.
   - **Không** đặt `DATABASE_URL` trên Vercel.
   - Supabase → Authentication → URL Configuration: **KHÔNG đổi Site URL** (project dùng chung — Site URL là của Launcher). Chỉ thêm địa chỉ Vercel của app này vào **Redirect URLs**.
   - Đừng bấm "Add" tích hợp Supabase trên Vercel (nó tạo DB mới / chèn `DATABASE_URL`).
10. **Khóa sao lưu:** trên máy mình chạy `age-keygen -o learning-os-backup.key`. Giữ file này **offline** (USB/giấy). Dòng `Public key: age1…` là khóa công khai.
11. **GitHub Secrets** (repo → Settings → Secrets and variables → Actions): `DATABASE_URL` (chuỗi Session pooler), `BACKUP_AGE_RECIPIENT` (khóa công khai `age1…`).
12. *(Cập nhật S5c 18/10: bước diễn tập khôi phục nay nằm trong workflow — xem mục "S5c" cuối file; chỉ còn việc giải mã thử bằng khóa offline.)* **Chạy thử sao lưu:** tab Actions → *Weekly backup (encrypted)* → Run workflow → thấy artifact `learning-os-…`. Diễn tập khôi phục (G0): tải artifact, `age -d -i learning-os-backup.key file.dump.age > file.dump`, rồi `pg_restore` vào một project thử, đối chiếu số dòng.

### File SQL cần áp (đúng thứ tự)

1. `db/migrations/0001_english_schema.sql`
2. `db/migrations/0002_identity.sql`
3. `db/migrations/0003_access.sql`
4. `db/migrations/0004_append_only.sql`

**Không áp** `db/stub/supabase_stub.sql` lên Supabase thật — file đó chỉ để test trên máy/CI.

### Cổng G0 — còn thiếu gì

| Điều kiện | Trạng thái |
|---|---|
| Test chéo ID 2 em đạt | ✓ trên máy/CI (test DB + test `requireAccess`) |
| Consent ghi được | Bảng có sẵn; màn/route ghi consent → làm cùng S1 hoặc lát quản trị |
| Backup + khôi phục thử OK | **S5c (18/10):** sao lưu nay gồm `auth.users` + `auth.identities` và tự khôi phục thử vào Postgres tạm trước khi mã hóa (xem mục S5c bên dưới). Còn chờ phụ huynh: chạy sao lưu tay 1 lần, đọc bảng "Restore check", và diễn tập giải mã bằng khóa offline 1 lần |
| Câu trả lời rollback trong `CLAUDE.md` | ✓ (đã gồm `auth.users` từ S5c; áp dụng sau khi phụ huynh chạy sao lưu mới) |
| Không có audio lên server | ✓ (chưa có tính năng nói; không có cột audio) |

### Ghi chú cho các lát sau

- Bảng append-only mới: gắn trigger `english.eng_forbid_mutation('learner_id')` theo hướng dẫn ở đầu `0004_append_only.sql`, và thêm lệnh xóa bảng đó vào `english.eng_purge_learner`.
- Migration mới **không** dùng `grant … on all tables` (sẽ cấp lại quyền sửa/xóa đã thu hồi); grant theo từng bảng.
- `track_id` đang là chữ `'A'|'B'`; S1 thêm bảng `english.tracks` và khóa ngoại.

## Quyết định đang chờ phụ huynh

| # | Việc | Hạn | Đề xuất |
|---|---|---|---|
| 1 | ~~Sao lưu có kèm `auth.users`~~ — **ĐÃ QUYẾT 18/10 (A3): có**, đã làm ở S5c | — | Xong (chờ phụ huynh chạy sao lưu thử) |
| 2 | ~~Xóa dữ liệu một em có xóa luôn tài khoản đăng nhập~~ — **ĐÃ QUYẾT 18/10 (A6): không**; màn xóa đã làm ở S5c | — | Xong |
| 3 | ~~O-F1 quy tắc video~~ — **ĐÃ QUYẾT 18/10 (C4)**: chỉ dùng link YouTube/nguồn mở, không tải video lên | — | Xong |
| 4 | ~~Ngày đề thử tuần 4 của Nguyên~~ — **ĐÃ QUYẾT 18/10 (C5): 21/11** | — | Xong |
| 5 | ~~B-W1…B-W4 còn nháp~~ — **ĐÃ QUYẾT 14/10, phương án (a)**: bước sửa bài → kỹ năng `B-A3-REVISE`; câu hỏi đánh giá độ tin cậy nguồn → loại `ACT-WRITE` với `B-T5-SOURCE` (B-W2 bước 4 tách đôi, B-W4 bước 9 đổi loại). 4 mẫu đã **công bố**, seed `0011`, nguồn của bước `0012` (chi tiết ở mục "Quyết định 14/10" trong phần S2). Còn lại: xác nhận bảng bước→bài đọc của `0012` | — | Đã xong; phụ huynh chỉ cần áp `0011`, `0012` sau `0010` |
| 6 | *(18/10: B7 — phụ huynh đồng ý giữ chặt.)* **Ghi bài ngoài app ở bài kiểm tra trong buổi và bài nói trực tiếp**: chỉ thầy/cô ghi; phụ huynh không ghi được (màn hình hiện "Chỉ thầy/cô ghi bài này"). Bài nói trực tiếp chỉ ghi dạng "thầy/cô nghe trực tiếp" | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới**: nếu muốn phụ huynh ghi được bài giấy của bước kiểm tra, nói để nới sau |
| 7 | *(18/10: B8 — giữ chặt.)* **Bài do người lớn ghi giúp (bài giấy, bài nói trong buổi)**: học sinh không đọc được nội dung, người ghi hay gợi ý đi kèm; em chỉ thấy một dòng "bài này đã làm cùng thầy/cô hoặc trên giấy, đã ghi lại rồi" | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới**: nếu muốn em xem lại chữ thầy/cô đã ghi, nói để nới sau |
| 8 | *(18/10: B9 — giữ; **ngoại lệ S5c**: bài nhập từ pilot giấy được lùi tới 14 ngày trước ngày giao nếu có lý do.)* **Ngày ghi bài ngoài app** không được sớm hơn lần làm gần nhất của bước đó (kể cả bài em nộp trong app), và bước phải đã mở vào ngày ghi | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới**: nếu hay phải ghi bù theo thứ tự khác, nói để nới sau |
| 9 | *(18/10: B10 — giữ.)* **Tiêu chí "thầy/cô nghe trực tiếp"** (vd. nói trôi chảy): chỉ tick được khi bài là bài thầy/cô nghe trực tiếp; bài khác chấm theo các tiêu chí còn lại | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới** |
| 10 | *(18/10: B11 — giữ.)* **Ghi chú gợi ý quan sát được** tối đa 300 ký tự (một giới hạn ở mọi lớp: ô nhập, API, cơ sở dữ liệu) | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới** nếu thấy ngắn quá |
| 11 | Điểm "sửa bài" (`B-A3-REVISE`) của Nguyên được chấm nhưng chưa nằm trong bộ theo dõi B-v1 | Sau baseline | **Đã quyết 18/10 (C6)**: thêm vào bộ B-v2 sau baseline (S5c không làm — nội dung cấu hình mới đi qua `gen:config -- --new`) |
| 12 | *(Đã quyết 18/10, C7: KHÔNG tính kiểm tra trễ; tính là bài "chuyển sang nguồn mới".)* `B-T5-SOURCE` chỉ có 2 cơ hội: 28/10 (B-W2) và kiểm tra trễ 23/11 trên nguồn mới C. Có tính kiểm tra trễ trên **nguồn mới** không? (quy định: cùng chủ đề/nguồn) | Trước 23/11 | Chờ phụ huynh/gia sư quyết; cho đến lúc đó không tự tính là kiểm tra trễ hợp lệ |
| 13 | **(S5c: đã có BẢN NHÁP `docs/CONSENT_pilot-2026-10.md`, chờ phụ huynh duyệt — chưa nối vào giao diện.)** **Nội dung thông báo đồng ý (consent)**: app chưa có văn bản thông báo nào, bảng chỉ lưu *phiên bản*. Khi tạo gia đình thật, hệ thống ghi 1 bản đồng ý `data` cho mỗi em (do phụ huynh xác nhận) với phiên bản `pilot-2026-10`. Chưa ghi đồng ý `ai_text` (AI tắt cho cả hai em) | Trước khi bật AI | Soạn văn bản ngắn bằng tiếng Việt ứng với `pilot-2026-10`; khi đổi chữ thì đặt phiên bản mới và ghi dòng mới |

## Nền vận hành (13/10/2026, đêm)

| Việc | Kết quả |
|---|---|
| Lệnh tự kiểm tra cài đặt `npm run doctor` + workflow "Setup doctor" | ✓ — bảng ✓/✗ tiếng Việt, không in secret |
| Test giao diện tự động (Playwright) chạy trong CI trên **Supabase local thật** | ✓ — đăng nhập 5 vai, 2 em không xem chéo được (404), học sinh không thấy điểm, anon không đọc được, tắt tự đăng ký. Đồng thời chứng minh migration 0001–0004 áp được trên Postgres thật của Supabase (không chỉ bản giả lập) |
| CI ghim `ubuntu-24.04`, action lên Node 24 (`checkout@v5`, `setup-node@v5`) | ✓ (`upload-artifact` giữ v4 — chạy được, chỉ cảnh báo) |
| 3 vai model `.claude/agents/` + mục "Quay lại khi hỏng" | ✓ |

---

## S1 — Cấu hình: track, danh mục, thang chấm, bộ kỹ năng, ngưỡng (13/10/2026)

**Trạng thái:** phần code xong, test xanh trên máy. **Chờ phụ huynh** áp 2 file SQL mới (bên dưới) rồi mới thử trên preview.

### Đã làm

| Việc | Ở đâu |
|---|---|
| Bảng cấu hình trong schema `english`: `tracks`, `assessment_policies`, `catalogue_versions`, `dimensions`, `targets`, `aggregate_indicators`, `activity_templates`, `target_set_definitions`, `target_sets` | `db/migrations/0005_config.sql` |
| Đã công bố thì **không sửa/xóa/truncate được** (kể cả chủ DB): danh mục, ngưỡng, bộ kỹ năng. Muốn đổi = thêm version mới | trigger trong `0005` |
| `target_sets` (em nào đang theo bộ nào) chỉ thêm, không sửa; đã nằm trong đường xóa dữ liệu một em (`eng_purge_learner`) | `0005` |
| Quyền đọc: mọi thành viên app đọc được cấu hình đã công bố; `target_sets` chỉ đọc được theo em mình có quyền; `anon` không đọc gì; không ai ghi được từ app (kể cả service role) | RLS + grant trong `0005` |
| `learners.track_id` có khóa ngoại tới `tracks` | `0005` |
| Dữ liệu: danh mục 0.2.1 (18 chiều, 37 + 33 target, 21 chỉ số tổng hợp), ngưỡng `AP-0.2-pilot`, 8 loại hoạt động, bộ kỹ năng **A-v1** và **B-v1** (12 mỗi bộ) | `db/migrations/0006_seed_config_v0_2_1.sql` (file **sinh tự động**) |
| Sinh `0006` từ `content/*.json`. **Khóa phiên bản:** `content/config.lock.json` ghi mã băm (sha256) của từng bản đã công bố; sửa nội dung bản đã công bố hoặc sửa tay `0006` → CI báo đỏ. Bản mới → `npm run gen:config -- --new` ghi vào migration kế tiếp, không bao giờ ghi đè | `npm run gen:config` (= `--check`) · `npm run gen:config -- --new` |
| Gán bộ kỹ năng cho một em: hàm `english.eng_assign_target_set` (chỉ SQL Editor/service role; kiểm đúng track; ghi biên nhận; chạy lại không nhân đôi) | `0005` |
| Gia đình THỬ: `npm run db:seed-dev` gán A-v1 cho An (thử), B-v1 cho Nguyên (thử) | `scripts/lib/seed.ts` |
| Trang đọc-only **"Kỹ năng đang theo dõi"** cho phụ huynh và gia sư (link trên thẻ từng em): danh sách 12 kỹ năng, mỗi kỹ năng ghi "Chưa đủ bài để đánh giá"; mục "Theo dõi thêm (không tính vào đánh giá)" tách riêng. Học sinh không có trang này; ngoài phạm vi → 404 | `app/learners/[id]/targets/` |
| Zod cho danh mục/ngưỡng/bộ kỹ năng + hàm dựng `TargetKey` (target "any" tách theo kênh nói/viết) | `lib/config/` |

**Test:** `npm run typecheck` ✓ · `npm run lint` ✓ · `npm test` ✓ (203 test: 115 unit + 88 DB) · E2E trong CI: 28 test (thêm 6 test trang "Kỹ năng đang theo dõi"). Có test: khóa phiên bản (sửa bản đã công bố → đỏ; thêm `B-v2` → `0007` chỉ có B-v2, không ghi đè); số dòng khớp JSON; mọi target trong bộ có thật và đúng track; sửa/xóa/truncate dòng đã công bố bị chặn; em/gia sư này không đọc được bộ kỹ năng của em kia; `anon` không đọc gì; gán sai track bị từ chối; chạy lại migration không đổi gì; xóa dữ liệu một em kéo theo `target_sets` của em đó.

### Phụ huynh cần làm

1. **Áp 2 file SQL, đúng thứ tự** (cách nào cũng được, giống S0: `npm run db:apply`, hoặc dán từng file vào SQL Editor và bấm Run):
   1. `db/migrations/0005_config.sql`
   2. `db/migrations/0006_seed_config_v0_2_1.sql` (file lớn ~170 KB — nếu SQL Editor chậm, dùng `npm run db:apply`)
2. **Kiểm tra:** SQL Editor chạy `select version from english.schema_migrations order by 1;` → thấy thêm `0005`, `0006`. Rồi `select count(*) from english.targets;` → **70**.
3. **Xem thử trên preview:** đăng nhập bằng tài khoản phụ huynh thử → thẻ "An · Track A" có link "Kỹ năng đang theo dõi" → thấy 12 kỹ năng. Nếu chưa thấy gì ("Chưa chọn bộ kỹ năng…") thì chạy lại `npm run db:seed-dev` (gán bộ cho em THỬ). Đăng nhập gia sư của An: chỉ mở được trang của An; gõ địa chỉ trang của Nguyên → "Không tìm thấy". Học sinh: không có link.
4. **Khi bắt đầu pilot thật** (em thật đã có trong `english.learners`): gán bộ kỹ năng bằng **một dòng SQL** trong SQL Editor, cho từng em:
   ```sql
   select english.eng_assign_target_set('<id của em trong english.learners>', 'A-v1');  -- An
   select english.eng_assign_target_set('<id của em trong english.learners>', 'B-v1');  -- Nguyên
   ```
   Lấy id bằng `select id, alias, track_id from english.learners;`. Gán sai track (vd B-v1 cho An) sẽ bị từ chối. Sau buổi baseline của Nguyên (O-F7): thêm bộ mới `B-v2` = tạo **file mới** `content/target_sets_v2.json` (id `B-v2`, `version` 2; KHÔNG sửa `target_sets_v1.json`), chạy `npm run gen:config -- --new` → ra `db/migrations/0007_seed_b_v2.sql` (chỉ chứa B-v2) và tự thêm vào `content/config.lock.json`; commit cả hai, áp `0007`, rồi gán `B-v2` cho Nguyên; dòng cũ vẫn còn.

### Ghi chú cho G1 / các lát sau

- Ngưỡng `AP-0.2-pilot` đã nằm trong DB (provisional). Đổi ngưỡng = version mới (`AP-0.3-…`), **không** sửa dòng cũ (trigger sẽ từ chối).
- Mọi code đo lường phải đọc ngưỡng/target từ DB (hoặc `lib/config`), không hard-code. Mẫu số coverage = `target_ids` của bộ hiện hành; `tracking_only` **không** vào mẫu số.
- Chỉ số tổng hợp (`aggregate_indicators`) có ràng buộc `mastery_gate = false` ở mức DB.
- Chưa làm (đúng phạm vi S1): `inquiry_templates`, `sources` (S2); tính trạng thái (S7); sửa cấu hình trên giao diện; giao diện cho học sinh.
- `scaffold_level` của `tracks` để trống vì PRD/DESIGN chưa quy định giá trị; `canvas_template` lấy theo PRD §4 (A = ACT-CANVAS-BASIC, B = ACT-CANVAS-ADV). `activity_templates.schema` còn `{}` — S2/S4 điền.
- Cột `track_ids` của `activity_templates` lấy từ bảng PRD §4 (catalogue chỉ có id loại hoạt động): ACT-CANVAS-BASIC chỉ Track A, ACT-CANVAS-ADV chỉ Track B, 6 loại còn lại cả hai.

### Review Opus (14/10) — đã sửa

Reviewer (Opus) soát S1, đã sửa xong các điểm sau (chưa áp DB thật nên sửa thẳng `0005`; `0001`–`0004` không đụng):

1. **Khóa phiên bản nội dung.** `content/config.lock.json` ghi mã băm của danh mục `0.2.1-draft`, ngưỡng `AP-0.2-pilot`, bộ `A-v1`, `B-v1` và migration chứa chúng. `npm run gen:config -- --check` (chạy trong CI) báo đỏ khi: bản đã công bố bị sửa ("published version … changed — create a new version instead" / "hãy tạo phiên bản mới"), migration seed lệch nguồn, hoặc có nội dung mới chưa vào migration. Bản mới (vd `B-v2`) → `npm run gen:config -- --new` ghi vào số migration kế tiếp (`0007_seed_b_v2.sql`, chỉ chứa phần mới) và tự thêm vào lock; không bao giờ ghi đè file có sẵn. `0006` được sinh lại một lần cho khớp (mã băm theo từng bộ kỹ năng; danh mục công bố trước khi công bố bộ kỹ năng) — vì chưa áp ở đâu nên không ảnh hưởng ai.
2. **"Bộ hiện hành" xác định rõ ràng.** `target_sets` có cột `seq` (tự tăng); `eng_assign_target_set` dùng `clock_timestamp()`; chỗ nào chọn bộ hiện hành cũng xếp theo `effective_from` giảm dần rồi `seq` giảm dần (trong SQL và trong `pickCurrentAssignment`). Có test: hai lần gán trong CÙNG một transaction → lần sau là hiện hành.
3. **Chặt chẽ hơn ở DB.** Kiểm tra bộ kỹ năng chạy cả khi UPDATE; muốn công bố một bộ thì danh mục của nó phải đã công bố. Em đã được gán bộ kỹ năng thì **không đổi track được** (chưa hỗ trợ trong pilot; cần đổi thì tạo em mới đúng track). `dollarQuote` không còn bị lỗi khi chuỗi kết thúc bằng `$j`.
4. **Chữ trên giao diện.** Khi chưa gán bộ: "Chưa chọn bộ kỹ năng cho em này." (không chỉ việc cho ai). Hai mục chỉ-để-theo-dõi của Track B hiện tên ngắn: "Điểm đề thử tháng", "Lỗi ngữ pháp hay gặp".
5. **E2E** `tests/e2e/targets.spec.ts`: phụ huynh mở trang của An và Nguyên (12 dòng + mục theo dõi thêm); gia sư chỉ vào được trang của em mình, trang em kia 404; học sinh không có link, gõ địa chỉ trang của mình hoặc của em kia đều 404.

**Câu hỏi mở cho S7 (chưa quyết, cần phụ huynh/Opus):** mẫu số coverage đang tính theo **12 mã target** của bộ, nhưng target có kênh ra "any" sẽ giữ **một trạng thái cho mỗi kênh** (nói / viết). Khi tính "số kỹ năng đã Tự làm được / số đang theo dõi", một target "any" tính là 1 (khi cả hai kênh đạt? khi một kênh đạt?) hay là 2 ô? Cần quyết trước khi viết engine ở S7.

---

## S2 — Mẫu chủ đề, tài liệu, giao bài có "ảnh chụp" (14/10/2026)

**Trạng thái:** code xong và đã sửa theo review Opus (14/10/2026), test xanh (185 unit + 141 DB = 326; E2E chạy trong CI). **Chờ phụ huynh** áp 2 file SQL mới (bên dưới) rồi mới thử trên preview. Nhánh `feature/s2-inquiries`, chưa mở PR.

### Đã làm

| Việc | Ở đâu |
|---|---|
| 10 mẫu chủ đề (A-W0…W4, B-W0…W4) chuyển từ bản nháp của Pilot Kit thành file có kiểm tra bằng zod; bản nháp gốc giữ nguyên ở `drafts/` (không seed) | `content/inquiries/*.json` |
| Luật kiểm tra theo danh mục: mọi kỹ năng có thật và đúng track; loại hoạt động của bước phải nằm trong danh sách "bài được tính" của từng kỹ năng; câu đóng phải có đáp án; đáp án trắc nghiệm phải nằm trong phương án; id câu không trùng; bài đầu vào (baseline) mọi bước mang nhãn `baseline` | `lib/config/inquiries.ts`, `tests/unit/inquiries.test.ts` |
| Bảng mới trong schema `english`: `sources`, `source_transcripts`, `inquiry_templates`, `template_item_keys`, `inquiry_instances`, `activity_instances`, `instance_item_keys`, `activity_instance_events`. RLS bật hết; grant theo từng bảng; không ai ghi được từ app trừ qua 2 hàm bên dưới | `db/migrations/0007_inquiries.sql` |
| **Học sinh không đọc được đáp án, kể cả qua REST:** `steps`/`snapshot` không chứa đáp án/lời giải/kịch bản gia sư (CHECK ở DB chặn); đáp án, đáp án mẫu câu mở, kịch bản gia sư và lời thoại bài nghe nằm ở bảng riêng, chỉ phụ huynh/gia sư đọc được. (Sau review: học sinh còn không đọc trực tiếp mẫu/snapshot nữa — xem "Sau review Opus".) | `0007` |
| Mẫu đã công bố thì **không sửa được** (cùng mẫu khóa phiên bản của S1). Đổi mẫu = version mới | trigger trong `0007` |
| `english.eng_assign_inquiry`: giao bài trong **một transaction** — chụp ảnh (snapshot) mẫu, tạo từng bước, chụp khóa đáp án, ghi biên nhận; kiểm lại người giao (phụ huynh của gia đình hoặc gia sư còn quan hệ hiệu lực), đúng track, mẫu đã công bố; chạy lại cùng `client_request_id` không nhân đôi | `0007` |
| `english.eng_activity_event`: đổi ngày / bỏ bước / khôi phục bước — **bắt buộc có lý do** (≥ 3 ký tự); lịch hiệu lực = sự kiện mới nhất | `0007` |
| Bài đã giao, từng bước, khóa đáp án chụp và sự kiện: chỉ thêm, không sửa/xóa; nằm trong đường xóa dữ liệu một em (`eng_purge_learner`, giữ nguyên mọi câu lệnh của bản `0005`, chỉ thêm — có test chứng minh) | `0007` |
| Seed 6 mẫu đã công bố (A-W0…W4, B-W0) + tài liệu + khóa đáp án (file **sinh tự động**, vào khóa phiên bản như S1) | `db/migrations/0008_seed_inquiries_pilot_v1.sql`, `content/config.lock.json` |
| `npm run db:seed-dev` giao A-W1 cho An (thử) và B-W0 cho Nguyên (thử); chạy lại không nhân đôi | `scripts/lib/seed.ts` |
| 4 route cho phụ huynh/gia sư: `GET /api/learners/:id/templates`, `POST /api/learners/:id/inquiries`, `GET /api/learners/:id/inquiries`, `POST /api/activities/:id/events`. Ngoài phạm vi → 404, học sinh → 403, chưa đăng nhập → 401, body sai → 400. **Không route nào đọc được khóa đáp án** (có test quét mã nguồn) | `app/api/…`, `lib/inquiries/` |
| Trang **"Giao bài"** (link trên thẻ từng em, cho phụ huynh và gia sư): "Bài có thể giao" (chọn hạn, mặc định ngày kết thúc tuần) và "Đã giao" (từng bước: loại việc, kiểu bài, ngày làm, "Đổi ngày"/"Bỏ bước"/"Khôi phục bước" đều đòi lý do). Học sinh và người ngoài phạm vi → 404 | `app/learners/[id]/inquiries/` |

### Sau review Opus (14/10/2026) — đã sửa

`0007` được **sửa trực tiếp** (chưa áp ở đâu, chưa ai chạy). `0008` và `content/config.lock.json` **không đổi**: nội dung 6 mẫu và bộ sinh không đổi nên mã băm giữ nguyên, `npm run gen:config -- --check` xanh. (Nếu sau này phải đổi mẫu đã khóa mà `0008` vẫn chưa áp ở đâu, có thể sinh lại `0008` và băm lại 6 dòng khóa của mẫu — chỉ vì `0008` chưa từng được áp.)

| # | Lỗi review | Đã sửa thế nào |
|---|---|---|
| 1 | **Học sinh đọc trước:** lời nhắc / gợi ý tự kiểm của bước sau có thể lộ đáp án bước trước (bài kiểm tra tự làm) | Học sinh **không còn SELECT được** `inquiry_templates`, `sources`, `inquiry_instances` (kể cả `snapshot`), `activity_instances`, `activity_instance_events` (RLS chỉ phụ huynh/gia sư). Đường đọc duy nhất: `english.eng_my_released_steps(p_instance)` — chỉ cho học sinh sở hữu bài; trả tiêu đề, câu hỏi lớn, hạn và **chỉ các bước đã đến ngày** (ngày hiệu lực sau đổi ngày ≤ hôm nay giờ Việt Nam, không tính bước đã bỏ). Bước chưa có ngày thì chưa mở cho đến khi được xếp ngày. Người khác gọi (học sinh khác, phụ huynh, gia sư, id lạ) nhận `null`; `anon` bị từ chối |
| 2 | Khóa đáp án / lời thoại / bài đọc của mẫu chỉ kiểm "là nhân viên" | Chỉ đọc được khi người gọi là phụ huynh của gia đình, hoặc gia sư có quan hệ còn hiệu lực, của **ít nhất một em cùng track với mẫu** (`eng_staff_has_track`). Gia sư của An không đọc gì của Track B; phụ huynh gia đình khác không đọc gì |
| 3 | Luật "loại hoạt động phải nằm trong danh sách bài được tính" hiểu sai các dòng của danh mục | Dòng dạng chuỗi `ACT-SOURCE-QA -> ACT-WRITE` tính theo hoạt động **cuối**; bỏ chú thích trong ngoặc (`ACT-CANVAS-ADV (evidence table)`); dòng `any activity tagged as transfer check` khớp mọi loại hoạt động nếu bước có `purpose: transfer_check`. Cùng luật ở TypeScript và SQL (`0007`). 6 mẫu đã công bố vẫn hợp lệ; 4 mẫu nháp vẫn vi phạm đúng như bảng bên dưới |
| 4 | Giao muộn làm lệch lịch; hạn/ngày đổi không bị chặn | Khi giao, **mọi ngày kế hoạch dịch đi (hạn giao − ngày kết thúc của mẫu) ngày** (giữ lịch tương đối). Snapshot lưu cửa sổ ngày thực, kèm ngày gốc của mẫu và số ngày dịch. Hạn giao và ngày đổi phải nằm trong **[hôm nay − 7, hôm nay + 120]** (giờ Việt Nam) — kiểm ở SQL, zod, ô chọn ngày. Trang "Giao bài" gợi ý hạn = ngày kết thúc của mẫu, hoặc (nếu tuần của mẫu đã qua) một tuần cùng độ dài bắt đầu từ hôm nay |
| 5 | Hai mẫu có thể trùng id tài liệu | `loadContentItems` báo lỗi nêu tên **cả hai mẫu** (bộ sinh và CI dừng); id lặp trong một mẫu cũng lỗi. Các phiên bản của cùng một mẫu được giữ id |
| nit | Form giao bài | Mã yêu cầu (`client_request_id`) đổi mỗi khi đổi hạn và sau khi giao xong; giao xong thì hiện "Đã giao bài." và nút bị khóa cho tới khi đổi hạn |
| nit | Chữ giao diện | "Làm lại bước" → **"Khôi phục bước"**; "cô" cứng trong nhãn → hằng số `tutorHonorific` ("thầy/cô") ở `lib/copy/vi.ts` (UX guide §2 chưa có cài đặt theo gia đình) |
| nit | Snapshot | Thêm `descriptor_version` và `assessment_policy_version` (theo bộ kỹ năng hiện hành của em; nếu chưa có thì theo danh mục của mẫu) |

Thêm test: học sinh chỉ thấy bước N từ đúng ngày của nó (kể cả sau đổi ngày / bỏ / khôi phục); không SELECT được snapshot; học sinh khác nhận gì; nhân viên không bị ảnh hưởng; gia sư/phụ huynh đúng track; chuỗi / hậu tố / "any transfer" ở cả TypeScript và SQL; dịch lịch; cửa sổ ngày ở SQL, zod; 4 yêu cầu giao **đồng thời** cùng `client_request_id` chỉ tạo 1 dòng. Test DB dùng ngày tương đối so với hôm nay nên không hỏng theo thời gian.

### Giả định đã chọn (phụ huynh có thể đổi)

- **O-F1 — video chỉ là liên kết** (mặc định của PRD §6.3): tài liệu video chỉ hiện thành link "Mở video ở trang ngoài", app **không** nhúng trình phát, không tải video lên. Nếu muốn khác, nói lại trước S3 (trang học sinh).
- Mẫu chủ đề là **nội dung trong repo**, không soạn trên giao diện (Family Edition). Muốn mẫu mới/bản mới: thêm file trong `content/inquiries/`, `npm run gen:config -- --new`.
- Nhãn tiếng Việt cho 8 loại việc (`activityLabels` trong `lib/copy/vi.ts`) do builder đặt cùng giọng với UX guide §3.3 vì guide chưa có — nhờ phụ huynh/Opus xem lại câu chữ.

### Phụ huynh cần làm

1. **Áp 2 file SQL, đúng thứ tự** (`npm run db:apply`, hoặc dán từng file vào SQL Editor và bấm Run; `0008` lớn ~170 KB nên dùng `db:apply` nếu SQL Editor chậm):
   1. `db/migrations/0007_inquiries.sql`
   2. `db/migrations/0008_seed_inquiries_pilot_v1.sql`
2. **Kiểm tra:** `select version from english.schema_migrations order by 1;` → thêm `0007`, `0008`. `select id, version, status from english.inquiry_templates order by 1;` → **6 dòng** `published`.
3. **Xem thử trên preview:** chạy lại `npm run db:seed-dev` (giao bài mẫu cho em THỬ). Đăng nhập phụ huynh thử → thẻ từng em có link "Giao bài" → trang có "Bài có thể giao" và "Đã giao". Thử giao một mẫu khác, rồi "Đổi ngày" (để trống lý do → báo lỗi, không lưu). Gia sư của An: chỉ mở được trang của An. Học sinh: không có link; gõ địa chỉ trang → "Không tìm thấy".
4. **Giao bài cho em thật:** trang "Giao bài" của em đó (cần `ALLOW_REAL_LEARNERS=true`). Chọn mẫu, chọn hạn, bấm "Giao bài".

### Quyết định 14/10/2026 — B-W1…B-W4 đã công bố (phương án a)

Phụ huynh chọn **(a)**: đổi loại hoạt động / kỹ năng của bước cho khớp danh mục v0.2.1; **không đổi đề, lựa chọn, đáp án hay lời giải của câu nào** (có test so từng câu với bản nháp `drafts/inquiries_B_draft.json`). Lời nhắc chỉ đổi đúng ở B-W2 bước 4–5: xem mục "Cần phụ huynh biết" bên dưới; các mẫu và bước khác giữ nguyên chữ.

| Mẫu | Bước (số cũ → mới) | Đã đổi |
|---|---|---|
| B-W1-HOMEWORK | 8 | ACT-REVISE: kỹ năng → `B-A3-REVISE` |
| B-W2-PHONES | 4 | Tách đôi: bước 4 giữ ACT-SOURCE-QA với `B-T2-ASSUME-R` (câu 1–2, 15'); **bước 5 mới** = ACT-WRITE với `B-T5-SOURCE` (2 câu tin cậy nguồn, 15'; lời nhắc EN "Answer questions 1 and 2 about how far you can trust the sources. Follow the instructions in each question." — ghi "questions 1 and 2" vì màn hình em đánh số lại từ 1 trong mỗi bước, và không ghi số câu cần viết vì mỗi câu đã có hướng dẫn riêng). Các bước sau dời +1 (cũ 5–9 → mới 6–10) |
| B-W2-PHONES | 8 → 9 | ACT-REVISE → `B-A3-REVISE` |
| B-W3-TRANSPORT | 8 | ACT-REVISE → `B-A3-REVISE` |
| B-W4-AI-HOMEWORK | 7 | ACT-REVISE → `B-A3-REVISE` |
| B-W4-AI-HOMEWORK | 9 | Toàn bộ câu là `B-T5-SOURCE` → đổi loại sang ACT-WRITE (không đổi gì khác) |

Cả 4 mẫu: bỏ `status`/`review_note` ở bước, thêm `B-T5-SOURCE` (nếu thiếu) vào danh sách kỹ năng của mẫu (`B-A3-REVISE` chỉ nằm ở bước sửa bài, không nằm ở danh sách của mẫu — giống Track A với `A-A3-*`), `status: published`, version 1. Seed: `db/migrations/0011_seed_b_w1_homework_1_b_w2_phones_1_b_w3_trans.sql` (chỉ 4 mẫu này, sinh bằng `npm run gen:config -- --new`) + `content/config.lock.json`. Nguồn của bước: `db/migrations/0012_track_b_step_sources.sql` (31 dòng, chờ phụ huynh xác nhận như bảng của `0009`).

**Cần phụ huynh biết:** (1) **Lời nhắc đã đổi đúng 3 chỗ, đều ở B-W2** (còn lại giữ nguyên chữ; đề, lựa chọn, đáp án, lời giải không đổi): (a) bước 4, lời nhắc EN: thời gian "(10 minutes)… (20 minutes)" → "(10 minutes)… (5 minutes)" cho khớp bước 15'; (b) bước 5 mới, lời nhắc EN: "Answer questions 1 and 2 about how far you can trust the sources. Follow the instructions in each question."; (c) bước 5 mới, lời nhắc tiếng Việt (chỉ gia sư/phụ huynh thấy): nhận "Phụ huynh chấm; góp ý 29/10" và lưu ý về mốc `last_practice_date` của `B-T5-SOURCE` (8/11) chuyển từ bước 4 sang bước 5; bước 4 chỉ còn "Thứ Tư 28/10 · Câu hỏi về nguồn. Phụ huynh chấm; góp ý 29/10." (2) Phần tách đôi này dùng 15' + 15' như bước cũ 30'; chữ "5 minutes" của bước 4 chỉ là phần trả lời sau khi đọc 10'. (3) Pilot thủ công: cách ghi CSV đã cập nhật ở đầu Pilot Kit B v0.2.1 (bản em và bản gia sư). (4) `db:seed-dev` vẫn giao B-W0 (không B-W1) cho Nguyên (thử) để không làm vỡ test giao diện S4/S5.

**SQL phụ huynh áp (sau `0010`, đúng thứ tự):** `db/migrations/0011_seed_b_w1_homework_1_b_w2_phones_1_b_w3_trans.sql` rồi `db/migrations/0012_track_b_step_sources.sql` (`npm run db:apply`; `0012` tự báo lỗi và dừng nếu chưa có `0011` hoặc thiếu dòng nào trong 31 dòng, không bao giờ âm thầm chèn 0 dòng). Kiểm tra: `select id, version, status from english.inquiry_templates order by 1;` → **10 dòng** `published`; `select count(*) from english.template_step_sources;` → **47**.

### Ghi chú cho các lát sau

- **S3 (trang học sinh):** học sinh đọc bài **chỉ qua `english.eng_my_released_steps(instance_id)`** (không SELECT bảng). Còn thiếu cho S3: (a) hàm liệt kê bài của chính em (id + tiêu đề + hạn) — hiện học sinh chưa có cách biết `instance_id`; (b) đường phát bài đọc (`sources.body`) cho học sinh theo ngày bước tương ứng — bảng `sources` giờ chỉ nhân viên đọc được. Câu hỏi đóng tự chấm bằng `instance_item_keys` (kind `answer`) **ở server**, không bao giờ gửi khóa xuống trình duyệt học sinh.
- Khóa kind `sealed` (đáp án mẫu câu mở) và `note` (kịch bản gia sư): S2 chỉ lưu. S5 phải chỉ cho gia sư xem `sealed` **sau** khi em đã làm. **Lưu ý (Kit FIXLIST #1):** việc "gia sư chưa được xem ý chính / đáp án mẫu *trước khi em nói*" mới được **thực thi ở giao diện từ S5**; ở S2 phụ huynh/gia sư có thể đọc `sealed` và `note` ngay qua bảng (RLS chỉ chặn học sinh và người ngoài track/gia đình).
- Lịch hiệu lực của một bước = sự kiện mới nhất trong `activity_instance_events` (xếp theo `at`, `id`); bước "bỏ" vẫn còn trong lịch sử, không bị xóa.

## S4 (+ phần đọc/nghe/viết của S3) — Em làm bài trên app và nộp bài có biên nhận (14/10/2026)

**Trạng thái:** code xong và đã sửa theo review Opus (14/10), test xanh (230 unit + 179 DB = 409; E2E chạy trong CI trên nhánh). **Chờ phụ huynh** áp 1 file SQL mới (bên dưới) rồi mới thử trên preview. Nhánh `feature/s4-student-work`, chưa mở PR. Kế hoạch: `docs/plans/s4-student-work.md`.

### Em làm được gì bây giờ

An và Nguyên đăng nhập và thấy:

- **"Việc tiếp theo"** (việc đầu tiên đã đến ngày, chưa nộp, làm được trên app) và danh sách **"Chủ đề tuần này"** với 3 trạng thái: đã xong / bây giờ / chưa làm. Chỉ hiện các bước **đã đến ngày** (theo lịch sau khi đổi ngày/bỏ bước ở S2).
- **Đọc bài** (chữ hiện ngay trên trang) hoặc **bài nghe/video** (chỉ là đường dẫn mở trang mới; xem "Cần phụ huynh xác nhận" #2), **trả lời câu hỏi** (chọn đáp án / gõ chữ / ô viết dài) hoặc **viết đoạn văn** (đếm từ, tự lưu mỗi ~5 giây và khi rời ô gõ: "Đã tự lưu lúc 14:32"; mở lại trang vẫn còn bản nháp).
- **Khai báo gợi ý đã dùng** trước khi nộp (không dùng / xem ghi chép / tra từ điển hoặc dịch / hỏi người khác / hỏi AI ngoài app). Dán chữ từ chỗ khác vào ô gõ → app tự đánh dấu "dán" và không cho bỏ dấu; mỗi lựa chọn là một dòng "gợi ý đã khai báo" cho gia sư/phụ huynh.
- **Nộp bài** → màn hình "Đã nộp lúc HH:MM" + "Đã nộp! Cô sẽ xem và gửi góp ý cho bạn." **Không có điểm, không có đúng/sai, không có đáp án** trên màn hình, trong HTML hay trong API trả về cho em.
- **Bài luyện tập** có thể "Làm lại" (lần nộp thứ 2, 3… cùng một "gia đình học tập"); **bài tự làm** chỉ nộp được **một lần** (nộp lại → 409, trang không còn nút nộp).
- Bước app chưa làm được hiện nhãn trung tính, **không có nút nộp**: "Làm cùng thầy/cô trong buổi học" (nói trực tiếp) và "Sắp có trên app — làm theo phiếu" (sơ đồ ý, tự nói, tự xem lại, sửa bài).

### Còn trên giấy / chưa có (đúng phạm vi plan)

Xem điểm và góp ý (S5/S6), hộp duyệt và chấm của gia sư/phụ huynh (S5), sửa bài (S6, `REVISION` bị từ chối ở DB), sơ đồ ý (S3b), tự nói (S10), AI (S11+), mở lời thoại bài nghe (không có đường nào cho em), làm bài khi mất mạng.

### Đã làm

| Việc | Ở đâu |
|---|---|
| Bảng mới (schema `english`): `working_drafts` (bảng **duy nhất** được sửa đè), `attempts`, `artifact_versions`, `assistance_events`, `exposure_log`, `episodes`, `attempt_auto_checks`, `template_step_sources`. Mọi bảng bài nộp **chỉ thêm** (`eng_forbid_mutation` + chặn truncate) và có trong đường xóa dữ liệu một em | `db/migrations/0009_student_work.sql` |
| `eng_purge_learner` viết lại từ bản `0007`, **chỉ thêm** lệnh xóa (con trước, cha sau). Có test so từng dòng: mọi dòng của bản `0007` vẫn còn nguyên, đúng thứ tự | `tests/unit/migration0009.test.ts` |
| Hàm của học sinh (security definer, `search_path=''`, `auth.uid()` phải là chính em; chỉ `authenticated` chạy được): `eng_save_draft`, `eng_submit_attempt`, và 4 hàm đọc `eng_my_inquiries`, `eng_my_home`, `eng_my_activity`, `eng_my_step_sources`. Không ai (kể cả service role, phụ huynh, gia sư) ghi trực tiếp vào các bảng này | `0009` |
| **Nộp bài trong 1 transaction:** khóa dòng bước → kiểm hợp lệ → `attempts` (`attempt_no`, `learning_family_id` = lần đầu của bước, `mode`, hash sha256 của nội dung) → bản nội dung nguyên gốc → tự chấm → gợi ý đã khai báo → lần tiếp xúc (`practice`/`retry`) → episode → xóa nháp → ghi `audit_log` → trả biên nhận `{attempt_id, attempt_no, submitted_at, hash}`. Gửi lại **cùng** `client_submission_id` + cùng nội dung → **cùng biên nhận**, không tạo dòng mới (4 yêu cầu đồng thời chỉ ra 1 dòng); cùng id mà khác nội dung/khác bước → 409 | `0009` |
| Luật đếm theo DESIGN §8: `is_first_attempt = (attempt_no = 1) và mode ≠ REVISION`; facet `baseline`/`checkpoint`/`delayed_check`/`transfer_check` lấy từ `purpose` của bước; `observed_directly = false` cho bài làm trên app. Chưa chấm điểm gì ở lát này | `0009` |
| **Tự chấm câu đóng, phía server, chỉ gia sư/phụ huynh thấy** (bảng `attempt_auto_checks`): trắc nghiệm/điền chỗ trống có phương án = đúng phương án (chữ cái hoặc chữ, bỏ khoảng trắng/hoa thường — cùng luật với `resolveMcqAnswer` của TypeScript, có test đối chiếu trên **mọi** câu đóng thật của 6 mẫu); điền chữ tự do = khớp với một trong các đáp án cách nhau bởi " / " sau khi làm sạch chữ (không phân biệt hoa thường, gộp khoảng trắng, bỏ dấu . ! ? cuối câu, đổi nháy cong thành nháy thẳng, bỏ ký tự khoảng trắng không ngắt / rộng-0, Unicode NFC); **transform / short / open = "cần người chấm"**. Không bao giờ ra điểm 0–4 | `0009` |
| 4 route: `GET /api/student/home`, `GET /api/student/activities/:id`, `PUT /api/drafts/:activityId`, `POST /api/attempts`. Chưa đăng nhập 401; **gia sư/phụ huynh 403** (không nộp thay em được); em khác/ngoài phạm vi/chưa đến ngày 404; body sai 400; trùng id khác nội dung hoặc nộp lần 2 bài tự làm 409. Trả về chỉ qua danh sách trường cho phép (zod) — khóa, kết quả tự chấm, lời thoại, `prompt_vi`, ghi chú, mã kỹ năng không thể lọt ra | `lib/work/`, `app/api/` |
| Trang chủ của em (`/`) và trang làm bài (`/activities/[id]`), theo mockup Main/Studio: nền #F4F5F0, xanh #2B5D4F, thẻ trắng viền #D9DCD3 bo 16, ô bấm ≥ 44px, chạy tốt ở 390px. Mọi chữ qua `lib/copy/vi.ts` (mục `work`), xưng "bạn" | `app/page.tsx`, `app/activities/[id]/page.tsx`, `components/student/` |
| Dev seed bắt đầu tuần của em THỬ từ **3 ngày trước** → An có bước 1–7 của A-W1 đã mở, Nguyên có đủ 6 bước B-W0; để preview và CI có việc để làm | `scripts/lib/seed.ts` (`devDueOn`) |

### Đối chiếu với plan — chỗ khác và vì sao

| Plan nói | Đã làm | Lý do |
|---|---|---|
| `attempts.auto_checks jsonb`, học sinh không đọc cột này | Bảng riêng `attempt_auto_checks` (chỉ nhân viên đọc) | Postgres không cho "cột chỉ vai trò này đọc" khi cùng bảng mà học sinh vẫn SELECT được `attempts`; bảng riêng là cách duy nhất chắc chắn học sinh không đọc được qua REST |
| Học sinh SELECT được `assistance_events` của mình | `assistance_events` chỉ nhân viên đọc | Cột `affects_target_keys` chứa mã kỹ năng (học sinh không thấy mã). Học sinh chỉ đọc `attempts`/`artifact_versions` của mình, và hai bảng này không có kết quả nào |
| `client_submission_id` unique | Unique **theo từng em** `(learner_id, client_submission_id)` | Id do trình duyệt sinh; unique toàn cục cho phép em này "đốt" id của em kia hoặc đoán ra sự tồn tại |
| (không nói) | Bảng `template_step_sources` nối (mẫu, bước) → bài đọc/nghe | Mẫu chủ đề chỉ liệt kê nguồn của **cả tuần**, không ghi nguồn nào cho bước nào. Xem "Cần phụ huynh xác nhận" #1 |
| Route đọc dùng quyền gì | Cả 4 route dùng action `work:submit` của `requireAccess` | Các route này là của học sinh; gia sư/phụ huynh gọi nhầm nhận 403 thay vì nhìn thấy dữ liệu em qua đường này (xem dữ liệu em là việc của S5) |
| Nháp chỉ `text`/`answers` | Nháp còn nhớ ô "dán" và các gợi ý đã tick | Mở lại trang không mất khai báo |

### Sau review Opus (14/10/2026) — đã sửa (vẫn trong `0009`, chưa áp ở đâu nên sửa tại chỗ)

| # | Vấn đề | Cách sửa |
|---|---|---|
| 1 | Bước app chưa làm được (nói trực tiếp, sơ đồ ý, tự nói, tự xem lại, sửa bài) vẫn trao cho em đề, câu hỏi, gợi ý tự kiểm và nguồn (vd. B-W0 bước 6 = bài đọc lật lại) | `eng_my_activity` và `eng_my_step_sources` chỉ trả mã bước, loại, chế độ và **khóa nhãn trung tính** (`with_tutor` / `on_paper`) cho mọi bước không phải ACT-SOURCE-QA / ACT-WRITE (hoặc chế độ REVISION). API `GET /api/student/activities/:id` cũng không gọi hàm nguồn; trang chỉ hiện nhãn |
| 2 | `eng_my_released_steps` (0007) lộ `target_ids`, `target_id` của câu hỏi và `purpose` | `0009` thay hàm: chỉ trả đầu bài + các bước đã mở (mã bước, loại, chế độ, ngày hiệu lực, cờ `supported`); bước làm được kèm đề/câu hỏi đã lọc, bước không làm được không có chữ nào. Gia sư/phụ huynh đọc thẳng snapshot (RLS) nên không phụ thuộc hàm này |
| 3 | Chuẩn hóa chữ tự chấm thiếu NFC, khoảng trắng không ngắt, ký tự rộng-0, nháy cong, dấu câu cuối | `english.eng_clean_text` + `eng_norm_answer` (chỉ có ở SQL, không có bản TypeScript); áp cho cả đáp án và phần tách " / "; ô chỉ có ký tự vô hình tính là trống |
| 4 | Thiếu test 4 lần nộp đồng thời với `client_submission_id` KHÁC NHAU | Thêm: đúng 1 lần nộp, 3 lỗi 23505 (→ 409) |
| nit | Gửi lại cùng id nhưng khác hỗ trợ/nguồn gốc bài vẫn trả biên nhận cũ | Nay là 409 |
| nit | "Xong x/y" tính cả bước không làm được | y chỉ tính bước làm được trong app; các bước còn lại ghi riêng |
| nit | Ô tự kiểm 40px; chữ "Cô" viết cứng; cảnh báo hai tab không báo khi tab sau mở lúc chưa có nháp | 44px; hằng `tutorHonorific`; tab chưa có nháp báo base revision 0 |

Ghi chú cho S5 và các lát sau (đã biết, chủ ý):

- **(a) Giao lại cùng một mẫu cho cùng một em bắt đầu một "gia đình học tập" mới** (`learning_family_id` = lần nộp đầu của bước **trong instance mới**). S5 quyết cách đếm "lần đầu" khi một em làm lại cùng mẫu ở lần giao khác (DESIGN §8 nói theo gia đình học tập; hiện mỗi lần giao là một gia đình).
- **(b) Nguồn đã mở thì các bước sau vẫn đọc được** (theo thiết kế, xem lại bài là bình thường): khi bước đã đến ngày, nguồn của bước đó đọc được mãi, kể cả lúc em đang làm các bước sau của tuần. App không "đóng" nguồn lại, và không ghi lần mở nguồn (`source_open`) ở lát này.
- **(c) `template_step_sources` không nằm trong snapshot.** Thêm dòng mới về sau có thể đổi nguồn mà bài đã giao hiển thị (chỉ thêm, không sửa/xóa, nên chỉ *thêm* nguồn cho bước). Chấp nhận cho pilot; nếu cần cố định thì đưa vào snapshot ở lần giao.
- **(d) Ràng buộc `source_version = template_version`** trên `template_step_sources` hạn chế dùng lại nguồn khi mẫu lên v2 (nguồn v1 không nối được mẫu v2 mà không đổi nguồn). Cần nới ràng buộc bằng migration mới khi làm mẫu v2.
- Câu hỏi lớn của B-W0 ghi "B-v1" (nội dung mẫu, hiện cả trên trang chủ của em): nên đổi chữ ở lần soạn nội dung sau.

### Cần phụ huynh xác nhận (builder đã chọn mặc định an toàn — "đóng khi thiếu")

1. **Bước nào dùng bài đọc/nghe nào** (bảng `template_step_sources`, 16 dòng, seed trong `0009`). Mặc định builder suy ra từ chuỗi "Nghe…/Đọc…" của đề: A-W0 bước 1→bài đọc, 2→bài nghe; A-W1 bước 2→**nghe**, 3→**đọc** (bài nghe tự làm không kèm bài đọc); A-W2 2→nghe, 4→đọc; A-W3 2→đọc, 4→nghe; A-W4 2→nghe, 4→đọc; B-W0 1→2 bài (S1, S2), 2→S3, 3→S4, 4→S5, 6→S6. **Bước nào không có dòng → em không nhận nguồn nào.** B-W1…B-W4: 31 dòng trong `0012` (14/10): "Read Sources A and B" và bài viết "Sources A and B open" → Nguồn A + B; câu đọc hiểu kiểu đề → bài đọc S1; điền đoạn văn → S2; nói trực tiếp "Read Source X" → nguồn X; B-W4 bước 9 → Nguồn C; B-W2 bước 5 mới → Nguồn A + B. Xem lại bảng này trước khi cho em thật dùng; sửa = thêm migration mới (bảng chỉ thêm, không sửa).
2. **Bài nghe chưa có link/tệp** trong dữ liệu (`url = null` cho cả 5 bài nghe; tên tệp như `A_VOL_L` chỉ nằm trong tiêu đề). Hiện em thấy "Bài này chưa có đường dẫn trong app. Bạn nhờ thầy/cô mở giúp nhé." Quyết: (a) thầy/cô phát tệp trong buổi (như Pilot Kit), hoặc (b) đưa tệp lên một nơi riêng và điền `url` (nghĩa là có migration nội dung mới). **Âm thanh không đi qua app trong cả hai cách.**
3. **A-W0 bước 13, câu điền chữ tự do** (`BL-G1…`): tự chấm hiện so chữ không phân biệt hoa thường/khoảng trắng và đáp án nhiều cách cách nhau " / ". Câu cần người xem (đáp án mở) được đánh dấu "cần người chấm". Nếu kit muốn luật khác, nói trước S5.
4. **Tiêu đề bài đọc/nghe** trong nội dung có ghi chú nhân viên trong ngoặc ("(bài đọc VOL-R)", "(cloze passage, MINI-20 Q10-15)"): app cắt phần ngoặc đó khi hiện cho em. Nên chỉnh nội dung ở lần soạn sau.
5. **Nhãn chữ mới** (`work` trong `lib/copy/vi.ts`: "Bạn đã dùng gợi ý nào?", "Mình hỏi AI ngoài app"…) do builder đặt theo giọng UX guide — nhờ phụ huynh/Opus xem lại câu chữ.

### Sau review Opus (14/10/2026) — đã sửa

| Mục | Đã làm | Test |
|---|---|---|
| **Chặn:** ghi bài ngoài app ở bước kiểm tra trong buổi hoặc bước nói trực tiếp | Chỉ gia sư còn quan hệ hiệu lực; bước nói trực tiếp chỉ nhận "nghe trực tiếp". Kiểm trong `eng_record_offline_attempt`, route trả 403 `tutor_only`, phụ huynh thấy câu "Chỉ thầy/cô ghi bài này" thay cho form | A-W0 bước 8 và A-W1 bước 8: phụ huynh bị từ chối, gia sư ghi được |
| Hộp duyệt >500 bài | Lọc/sắp xếp/chia trang bằng con trỏ trong SQL; số đếm từ SQL; bài mới luôn hiện ở trang đầu của "Chưa duyệt xong" | 520 bài sinh bằng SQL: đi hết các trang không sót, không lặp; bài mới nằm ở trang đầu khi bài cũ đã duyệt |
| Ghi bài lùi ngày | Không sớm hơn lần làm gần nhất của bước (kể cả bài em nộp trong app); bước phải đã mở vào ngày ghi. Báo lỗi bằng câu rõ trong form | Có test cả hai luật |
| Học sinh đọc bài người lớn ghi | RLS `attempts` / `artifact_versions` (tạo lại trong `0010`): học sinh chỉ đọc `in_app`/`pasted` | SELECT trực tiếp bằng quyền học sinh; màn hình em chỉ nhận số lần, giờ và loại |
| Tiêu chí "nghe trực tiếp" | `eng_record_review` từ chối khi bài không quan sát trực tiếp; kỹ năng vẫn chấm được bằng tiêu chí còn lại; form không có ô tick cho tiêu chí đó | B-L4-EXPLAIN-S |
| Ghi chú hỗ trợ | Một giới hạn 300 ký tự ở ô nhập, API, cơ sở dữ liệu; câu báo lỗi riêng | 301 ký tự ở từng lớp |
| Danh sách tiêu chí | Chỉ gửi tiêu chí **người chấm đã chạm vào**: tick = đúng, tick rồi bỏ = sai (ghi rõ); chưa chạm = không ghi ("chưa đánh giá", không phải sai); không chạm gì = không ghi `criteria_results`. Ô tick cao ≥ 44px. Chọn 3–4 mà chưa tick đủ (hoặc ngược lại) → **cảnh báo, không chặn** | `tests/unit/reviewNits.test.ts` |
| Vặt khác | Sửa quyết định không biến "không có cơ hội" thành 0 và không chọn sẵn nút nào; ẩn "ghi thêm gợi ý" khi người xem không chấm được bài; "Sửa" ghi chú buổi học chỉ hiện cho gia sư đã viết; mọi nhãn lạ rơi về chữ trung tính ("Kỹ năng khác", "Hoạt động khác"…), không bao giờ hiện mã (có test quét mã nguồn); `eng_lesson_note_is_current` tự kiểm phạm vi và không còn mở cho service_role | |
| Đua nhau (2 kết nối thật) | Hai người chấm lần đầu cùng một kỹ năng → một người thắng, người kia nhận 409; học sinh nộp và người lớn ghi cùng lúc một bài một-lần → đúng 1 lần làm, 1 episode | `tests/db/reviewHardening.test.ts` |

**Việc phải xem lại ở S6/S7:** chỉ mục `validation_decisions_first_once` (mỗi bài, mỗi kỹ năng chỉ một quyết định đầu) đúng khi quyết định đầu luôn là AGREE. Khi thêm `INSUFFICIENT` / `REQUEST_MORE` ("chưa đủ bằng chứng", "xin thêm bài"), chúng cũng là quyết định không thay ai nên sẽ bị chỉ mục này chặn quyết định thứ hai. Phải thiết kế lại chuỗi quyết định **trước** khi thêm chúng (đã ghi chú ngay trong `0010`).

### Phụ huynh cần làm

1. **Áp 1 file SQL** (`npm run db:apply`, hoặc dán vào SQL Editor và bấm Run): `db/migrations/0009_student_work.sql`. (Chạy lại lần 2 không đổi gì.)
2. **Kiểm tra:** `select version from english.schema_migrations order by 1;` → thêm `0009`. `select count(*) from english.template_step_sources;` → **16**.
3. **Xem thử trên preview:** `npm run db:seed-dev` rồi đăng nhập An (thử): thấy "Việc tiếp theo". Mở bước đọc, trả lời, chọn "Mình không dùng gợi ý nào", bấm "Nộp bài" → "Đã nộp lúc …", không có điểm/đúng/sai. Về trang chủ → bước ấy "Đã xong". Gia sư/phụ huynh gọi các route của em nhận 403 (chưa có màn xem bài nộp — S5). Mở thẳng địa chỉ `/activities/<id>` của An bằng tài khoản Nguyên → "Không tìm thấy".
4. Dọn dữ liệu em THỬ khi cần: đường xóa dữ liệu một em (`english.eng_purge_learner`, S0) đã gồm các bảng mới của S4.

### Ghi chú cho S5 và các lát sau

- **Seed cấu hình kế tiếp là `0013`** (`0011` = 4 mẫu Track B, `0012` = nguồn của bước, đều 14/10).
- S5 (hộp duyệt/chấm): đọc `attempts` + `artifact_versions` + `attempt_auto_checks` + `assistance_events` + `episodes` của em. Bài nộp là bản **nguyên gốc** (`is_raw = true`); điểm AI / người chấm / quyết định là 3 lớp riêng, bảng mới (`reviews`…) — đừng thêm cột vào các bảng append-only. Chấm mù, `sealed`/`note` của khóa đáp án, tin nhắn "Đã nhận bài. Góp ý sẽ có sau." (`messages.aiPendingStudent`) đều là việc của S5.
- Câu `transform`/`short`/`open` đang là `needs_person`: S5 cần giao diện cho gia sư chấm.
- Episode đã có `is_first_attempt`, facet và `context_id` (id mẫu) nhưng **chưa có điểm**; "Bài làm được tính" (đủ điều kiện làm bằng chứng) và trạng thái dẫn xuất chưa tính — S5/S6.
- Mẫu B-W1…B-W4: dòng `template_step_sources` đã thêm ở `0012` (14/10).
- `exposure_log` đã ghi `source = 'practice' | 'retry'`; các nguồn khác (`delayed`, `transfer`…) thêm khi có các lát tương ứng.

## S5 — Hộp duyệt, chấm theo từng kỹ năng, ai được duyệt (D15), bài làm ngoài app, ghi chú buổi học (14/10/2026)

**Trạng thái:** code xong, đã sửa theo review của Opus (mục "Sau review Opus" bên dưới), test xanh (unit + DB = 527; E2E chạy trong CI trên nhánh). **Chờ phụ huynh** áp 1 file SQL mới (bên dưới) rồi mới thử trên preview. Nhánh `feature/s5-review`, chưa mở PR (cần review Opus trước). Kế hoạch: `docs/plans/s5-review.md`. **Học sinh không thấy gì mới ở lát này** (không điểm, không quyết định, không ghi chú, không khóa đáp án; bài do người lớn ghi giúp chỉ hiện là một dòng trạng thái).

### Gia sư và phụ huynh làm được gì bây giờ

- **Trang chủ** có nút **"Bài cần duyệt (n)"**; n = số bài còn kỹ năng chưa chấm mà người đang đăng nhập được phép chấm.
- **Hộp "Bài chờ xem"** (`/review`): lọc và chia trang **ngay trong cơ sở dữ liệu** (50 bài một trang, nút "Xem các bài tiếp theo"; số trên từng bộ lọc cũng do cơ sở dữ liệu đếm, nên bài mới nộp không bao giờ bị cắt mất dù có hàng trăm bài cũ): lọc "Chưa duyệt xong" (mặc định, bài cũ nhất lên đầu) / "Cần thầy/cô duyệt" / "Bài tự làm" / "Bài đầu vào" / "Bài luyện" / "Đã duyệt xong". Mỗi dòng: tên em, bước, giờ nộp, nộp trong app hay ghi ngoài app, "Đã chấm x/y kỹ năng".
- **Trang duyệt một bài** (`/review/<bài>`): bài làm của em ở trên/bên trái (câu đóng có "x/y câu đúng (máy chấm)" + ✓/✗ từng câu, chỉ nhân viên thấy), gợi ý em đã khai báo, khóa/ghi chú kín của bước **chỉ hiện sau khi em đã nộp**; bên cạnh là từng kỹ năng của bước với yêu cầu để đạt 3/4 và **6 nút có chữ**: "0/4 Chưa thể hiện" … "4/4 Vững, rõ ràng" và "Bài này không có cơ hội thể hiện" (không phải số 0). Nút Lưu chỉ sáng khi mọi kỹ năng đã chọn; ghi chú từng kỹ năng không bắt buộc.
- **Sửa quyết định:** bấm "Sửa quyết định" → chọn mức khác + **lý do (≥ 3 chữ)** → bản mới thay bản cũ, **bản cũ vẫn nằm trong "Lịch sử quyết định"** (ai, lúc nào, lý do). Không xóa, không ghi đè.
- **Hỗ trợ quan sát được:** trên trang duyệt, người duyệt có thể thêm "tôi thấy em được giúp thế này" (một dòng riêng, không đổi điểm).
- **"Ghi bài làm ngoài app"** (trang Giao bài của từng em, mỗi bước): gia sư ghi bài nói **nghe trực tiếp trong buổi**; phụ huynh hoặc gia sư ghi **bài trên giấy**. Chỉ gõ/dán chữ, **không âm thanh**. Bài ghi xong vào cùng hộp duyệt và được đếm đúng như bài nộp trong app (lần thứ mấy, "lần đầu", bài đầu vào/kiểm tra).
- **Ghi chú buổi học** (`/learners/<em>/notes`, link trên thẻ từng em): ngày, mục tiêu, điều thấy được, mức hỗ trợ, **tối đa 3 việc tiếp theo**, kỹ năng đã luyện trong buổi (mỗi kỹ năng thành một dòng "tiếp xúc" nguồn `lesson`), tick "Chia sẻ với bố mẹ". Chỉ gia sư viết; phụ huynh chỉ đọc ghi chú đã chia sẻ của con mình. Sửa = bản mới, bản cũ giữ.

### Ai được duyệt bài nào (D15), nói đơn giản

| Bài | Gia sư của em | Phụ huynh của em | Học sinh |
|---|---|---|---|
| Bài kiểm tra trong buổi (checkpoint) | Chấm | **Chỉ xem** ("Chờ thầy/cô duyệt") | Không thấy |
| Bài gia sư nghe/xem trực tiếp (ghi ngoài app, "trực tiếp") | Chấm | **Chỉ xem** | Không thấy |
| Mọi bài còn lại (luyện tập, bài đầu vào, bài tự làm, bài giấy ghi sau) | Chấm | Chấm | Không thấy |

Quy tắc nằm **trong cơ sở dữ liệu** (hàm `eng_review_role`), không chỉ ở màn hình: phụ huynh gọi thẳng API để chấm bài chỉ-gia-sư nhận 403 `tutor_only`; gia sư của em khác, gia sư hết hạn, học sinh đều bị từ chối. Điểm luôn hiện cho nhân viên dạng "3/4 · Đạt yêu cầu"; "không có cơ hội thể hiện" là câu riêng, **không bao giờ là 0**.

### Đã làm

| Việc | Ở đâu |
|---|---|
| Bảng mới (schema `english`, chỉ thêm): `observations` (một người chấm một kỹ năng của một bài: 0–4 **hoặc** không có cơ hội), `validation_decisions` (quyết định: AGREE, hoặc MODIFY có `supersedes_id` + lý do; quyết định hiện hành = bản không bị thay thế, có chỉ mục duy nhất để chuỗi không rẽ nhánh), `lesson_notes`. Mỗi bảng gắn `eng_forbid_mutation` + chặn truncate, SELECT chỉ cho nhân viên đúng phạm vi (RLS), học sinh 0 dòng | `db/migrations/0010_review.sql` |
| Hàm ghi (security definer, `search_path=''`, **chỉ service_role chạy được**, kiểm lại người ghi trong SQL): `eng_record_review(s)`, `eng_modify_decision`, `eng_record_observed_support`, `eng_record_offline_attempt`, `eng_write_lesson_note`; hàm đọc `eng_review_inbox`, `eng_review_episode` (cho `authenticated`, theo `auth.uid()`) | `0010` |
| **Dùng lại luật đếm của S4**: tách `eng_attempt_slot` và `eng_record_attempt_effects` ra khỏi `eng_submit_attempt`; bài ghi ngoài app đi qua đúng hai hàm này. Hành vi S4 không đổi (toàn bộ test S4 giữ nguyên và xanh) | `0010` |
| `eng_purge_learner` viết lại từ bản `0009`, **chỉ thêm** lệnh xóa (quyết định → quan sát → ghi chú, con trước cha sau). Test so từng dòng: mọi dòng của bản `0009` còn nguyên, đúng thứ tự; test xóa thật chứng minh biên lai đếm đủ | `tests/unit/migration0010.test.ts`, `tests/db/review.test.ts` |
| 7 route: `GET /api/review/inbox`, `GET /api/review/episodes/:id`, `POST /api/review/episodes/:id/decisions`, `POST /api/review/decisions/:id/modify`, `POST /api/review/attempts/:id/support`, `POST /api/learners/:id/offline-attempts`, `GET|POST /api/learners/:id/lesson-notes`. Chưa đăng nhập 401; ngoài phạm vi 404; học sinh 403/404; body sai 400; trùng id khác nội dung 409; bài chỉ-gia-sư với phụ huynh 403 `tutor_only`. Mọi POST có `client_id` nên gửi lại không tạo dòng mới | `lib/review/`, `app/api/review/`, `app/api/learners/[id]/` |
| Trang: hộp duyệt, trang duyệt, ghi ngoài app, ghi chú buổi học, nút trang chủ. Mọi chữ qua `lib/copy/vi.ts` (khối `reviewPage`, `offlineForm`, `notesPage`, nhãn nguồn bài/gợi ý/hỗ trợ). Mã kỹ năng/bước chỉ nằm trong khối "Thông tin kỹ thuật" gập | `app/review/`, `app/learners/[id]/notes/`, `components/review/` |
| Dữ liệu thử: `seed-dev` giao cho An chủ đề **A-W4-PLANETS** và để An nộp sẵn bước 7 (viết, luyện tập) → hộp duyệt của gia sư An có 1 bài ngay trên preview | `scripts/lib/seed.ts` (`seedDevReviewWork`) |

### Đối chiếu với plan — chỗ khác và vì sao

| Plan nói | Đã làm | Lý do |
|---|---|---|
| Seed hộp duyệt: "nộp sẵn một bài A-W1 của An" | Giao thêm **A-W4-PLANETS** cho An và nộp bước 7 | Test S2/S4 (đếm bài giao, và spec học sinh nộp bước 3, 6 của A-W1) sẽ vỡ nếu seed A-W1 đổi; cách này không đụng gì của S2/S4 |
| Bài ghi ngoài app chỉ `tutor_live` / `manual_import` | Thêm giá trị khai báo gợi ý **`unknown`** ("không rõ") cho bài giấy ghi sau | Phụ huynh ghi bài giấy thường không biết em đã dùng gợi ý gì; ép chọn "không dùng" là ghi sai bằng chứng. Vẫn là một dòng hỗ trợ riêng, không đổi điểm |
| Học sinh không thấy gì mới | Học sinh thấy bài ghi ngoài app chỉ như một dòng trạng thái trung tính ("đã làm cùng thầy/cô hoặc trên giấy, đã ghi lại rồi"; số lần và giờ), bước một-lần chuyển sang "Đã xong". Gọi thẳng REST, học sinh **không đọc được** dòng `attempts`/`artifact_versions` loại `tutor_live`/`manual_import` (chữ, người ghi, gợi ý) | Cùng luật đếm với bài nộp trong app (đúng tinh thần S4); không có điểm/nội dung/ghi chú nào đi kèm |
| Hàm `eng_record_review(…)` 1 kỹ năng | Thêm `eng_record_reviews` (cả bài trong **một** transaction) | Lưu 2 kỹ năng không được dở dang (có kỹ năng chấm, có kỹ năng không) |
| Kỹ năng nào cũng chấm được | Kỹ năng mà **mọi tiêu chí đều cần quan sát trực tiếp** chỉ chấm được khi bài là "nghe/xem trực tiếp"; chỉ số tổng như `AGG-B-EXAM-MOCK` (không phải kỹ năng) bị khóa và có chữ giải thích | Giữ đúng hợp đồng đo: không chấm điều không quan sát được; chỉ số không phải kỹ năng |

### Cần phụ huynh xác nhận / đã biết

1. **Câu chữ mới** (`reviewPage`, `offlineForm`, `notesPage`, nhãn mức hỗ trợ "Hỗ trợ ít/vừa/nhiều") do builder đặt theo giọng UX guide — nhờ xem lại.
2. **Gia sư hết hạn** (`valid_to` đã qua) không chấm, không ghi bài, không viết ghi chú được, và hộp duyệt/trang duyệt trống với người đó; bản chấm cũ giữ nguyên. Có test.
3. **Rút lại một ghi chú đã chia sẻ:** gia sư lưu một bản mới không tick "Chia sẻ" → phụ huynh chỉ thấy bản hiện hành nên không còn thấy nữa; bản cũ vẫn nằm trong bảng (gia sư thấy được trong "Bản cũ"). Nếu muốn xóa hẳn nội dung đã lỡ chia sẻ thì cần quyết định riêng.
4. Chưa có trạng thái năng lực/đề xuất bậc (S7), chưa có góp ý gửi em và sửa bài (S6), chưa có điểm AI/hiệu chỉnh (S11+), chưa có báo cáo cho phụ huynh (S9), chưa có phòng nói (S10).

### Phụ huynh cần làm

1. **Áp 1 file SQL** (`npm run db:apply`, hoặc dán vào SQL Editor và bấm Run): `db/migrations/0010_review.sql`. (Chạy lại lần 2 không đổi gì.)
2. **Kiểm tra:** `select version from english.schema_migrations order by 1;` → thêm `0010`. `select count(*) from information_schema.tables where table_schema='english' and table_name in ('observations','validation_decisions','lesson_notes');` → **3**.
3. **Xem thử trên preview:** `npm run db:seed-dev`; đăng nhập gia sư của An (thử) → "Bài cần duyệt (1)" → mở bài → bấm mức cho 2 kỹ năng (thử cả "Bài này không có cơ hội thể hiện") → Lưu → "Đã duyệt". Bấm "Sửa quyết định", đổi mức, nhập lý do → mở "Lịch sử quyết định" thấy cả hai. Vào trang Giao bài của An → "Ghi bài làm ngoài app" ở bước 6 (chọn "nghe trực tiếp") → mở bài → đăng nhập phụ huynh: trang chỉ xem, không có nút chấm. Đăng nhập An (thử) hoặc Nguyên (thử): không có nút "Bài cần duyệt", gõ thẳng `/review` → "Không tìm thấy".
4. Dọn dữ liệu em THỬ khi cần: `english.eng_purge_learner` đã gồm các bảng của S5.

### Ghi chú cho S6, S7 và các lát sau

- **Seed cấu hình kế tiếp là `0013`** (`0011`, `0012` đã dùng cho B-W1…B-W4 ngày 14/10): `npm run gen:config -- --new` sẽ tự sinh số đó.
- S6 (góp ý, sửa bài): quyết định hiện hành của một (bài, kỹ năng) lấy qua `validation_decisions` không bị thay thế (view/hàm `eng_review_episode` đã làm). Góp ý gửi em là bảng/đường riêng — đừng đưa điểm 0–4 ra học sinh.
- S7 (trạng thái, đề xuất bậc): bằng chứng đủ điều kiện = `observations` + quyết định hiện hành + `episodes` (facet, `is_first_attempt`, `observed_directly`). Bảng `exposure_log` đã có nguồn `lesson` (ghi chú buổi học). Chưa có gì tính trạng thái; cột `blind` của `observations` đã ghi sẵn cho hiệu chỉnh D16.
- Bài ghi ngoài app có `provenance` = `tutor_live` | `manual_import` (đang hiển thị cho nhân viên); nếu S10 (phòng nói) thêm đường ghi chữ nói thì dùng chung `eng_record_attempt_effects`.

## Quyết định 16/10/2026 — sao lưu hằng tuần

Phụ huynh chọn chạy sao lưu **hằng tuần** (02:17 sáng Chủ nhật) thay vì hằng đêm. Hệ quả: nếu database hỏng, có thể mất tối đa ~7 ngày dữ liệu (thay vì ~1 ngày); artifact giữ 30 ngày ≈ 4 bản. Giảm thiểu: trước mỗi lần áp SQL mới hoặc thay đổi lớn, bấm chạy tay *Weekly backup*. Có thể đổi lại hằng đêm bất cứ lúc nào (1 dòng `cron` trong `.github/workflows/backup.yml`). Ping giữ project không ngủ (*Keepalive*) vẫn chạy hằng ngày — khác việc sao lưu.

## S1b — Tạo gia đình THẬT (16/10/2026)

**Trạng thái:** code + test xong (không có migration mới); đã sửa theo review Opus (mật khẩu riêng từng người, kiểm tra trước khi tạo tài khoản, chạy lại không đảo ngược thay đổi sau này, trang **Đổi mật khẩu**). **Chờ phụ huynh** bấm chạy workflow và đặt biến trên Vercel.

### Làm gì

Một workflow bấm tay **"Create real family"** (GitHub → Actions) tạo trong schema `english`: 1 phụ huynh, em **An** (Track A, bộ A-v1), em **Nguyên** (Track B, bộ B-v1), gia sư của An, gia sư của Nguyên, quan hệ còn hiệu lực, 1 bản đồng ý dữ liệu cho mỗi em (phiên bản `pilot-2026-10`). **Không giao bài tự động** — phụ huynh giao từng tuần ở trang "Giao bài". Chạy lại lần 2 không đổi gì. Không in mật khẩu.

Quy tắc an toàn:

- **Tài khoản đã có thì dùng lại** (tìm theo email, không phân biệt hoa/thường). Launcher đã có tài khoản của phụ huynh và 2 em → gõ đúng email đăng nhập Launcher thì **một tài khoản dùng cho cả hai app**; không đổi mật khẩu, không sửa gì của tài khoản đó.
- Email chưa có tài khoản → tạo mới, **mỗi người một mật khẩu tạm riêng** (mỗi người một secret, xem dưới). Dùng chung một mật khẩu thì gia sư này đăng nhập được vào tài khoản gia sư kia — nên công cụ **từ chối** nếu hai secret giống nhau.
- **Mọi kiểm tra chạy trước khi tạo tài khoản đầu tiên** (chỉ đọc, không ghi gì): mật khẩu hợp lệ; database đã áp đủ migration và bộ A-v1/B-v1 đã công bố; không ai thuộc gia đình khác (kể cả gia đình THỬ); **email gõ vào khớp với người đã có chỗ** (nếu chỗ đó đã có người mà gõ email khác — kể cả email chưa có tài khoản — thì dừng, chưa tạo gì; đổi gia sư làm riêng). Chỗ gia sư của một em tính là **đã có người khi có BẤT KỲ dòng quan hệ gia sư nào** (đang phụ trách, đã kết thúc, hoặc ngày kết thúc ở tương lai) — gõ email gia sư khác thì dừng, không tạo tài khoản hay hồ sơ gia sư nào; hồ sơ em đã có nhưng chưa gắn tài khoản học sinh → dừng.
- **Chạy lại không đảo ngược thay đổi sau này:** bộ kỹ năng chỉ gán cho em chưa có bộ nào; quan hệ gia sư chỉ tạo khi em chưa có dòng gia sư nào (kể cả đã kết thúc). Nếu đã có lịch sử, công cụ giữ nguyên và ghi "không đổi (đã có lịch sử)".
- Nếu lỗi xảy ra **sau khi đã tạo tài khoản đăng nhập**, kết quả ghi rõ "CẢNH BÁO: đã tạo N tài khoản …"; các tài khoản đó vẫn còn, chạy lại sẽ dùng lại (không tạo trùng). Database của app (schema `english`) không bị ghi nửa chừng.
- Nếu bên Supabase có trigger trên `auth.users` ghi vào schema `public` (ví dụ Launcher tạo hồ sơ cho mỗi tài khoản mới), kết quả có dòng "Lưu ý: Launcher có thể tự tạo hồ sơ cho tài khoản mới". Công cụ **không** đụng vào `public`.
- Tên hiển thị của em cố định "An" / "Nguyên" (chỉ hai tên này mới được gửi cho AI sau này).

### Phụ huynh cần làm

1. **GitHub → Settings → Secrets and variables → Actions:** có sẵn `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, biến `NEXT_PUBLIC_SUPABASE_URL`. Thêm **mật khẩu tạm riêng cho từng người phải tạo mới** (mỗi cái ≥ 12 ký tự, **đôi một khác nhau**): `NEW_PASSWORD_PARENT`, `NEW_PASSWORD_AN`, `NEW_PASSWORD_NGUYEN`, `NEW_PASSWORD_TUTOR_AN`, `NEW_PASSWORD_TUTOR_NGUYEN`. Chỉ cần secret của người **chưa có tài khoản** (thường là 2 gia sư: `NEW_PASSWORD_TUTOR_AN`, `NEW_PASSWORD_TUTOR_NGUYEN`). Không cần secret cho người đã có tài khoản Launcher.
2. Đã áp `0001`–`0012` trên Supabase (xem các mục trên). Nên bấm chạy tay *Weekly backup* trước (thay đổi dữ liệu thật đầu tiên).
3. **Actions → "Create real family" → Run workflow**, điền: `confirm` = `CREATE`; email đăng nhập (Launcher) của phụ huynh, An, Nguyên; email + tên hiển thị (vd "Cô Lan") của gia sư An và gia sư Nguyên. 5 email phải khác nhau.
4. Mở trang kết quả (Summary): mỗi người có một dòng cho biết **tài khoản tạo mới ở lần chạy này** (kèm tên secret là mật khẩu tạm của người đó), **tạo ở lần chạy trước bởi công cụ này** (lần trước lỗi giữa chừng; dùng mật khẩu tạm của lần đó), hoặc **đã có sẵn (dùng chung Launcher)**. Lưu ý: Summary hiện đủ 5 địa chỉ email (repo riêng tư nên chỉ người có quyền vào repo thấy).
5. **Gia sư lấy mật khẩu thế nào:** Supabase không gửi được email cho địa chỉ bất kỳ, nên phụ huynh **tự đưa** mật khẩu tạm (giá trị secret của đúng người đó) cho từng gia sư — nên qua kênh riêng, không gửi nhóm. Đăng nhập xong, mỗi người bấm **Đổi mật khẩu** (đầu trang, mọi vai trò) và đặt mật khẩu của riêng mình (≥ 12 ký tự, nhập 2 lần). Sau đó có thể xóa các secret `NEW_PASSWORD_*`.
6. **Vercel → Settings → Environment Variables:** `ALLOW_REAL_LEARNERS=true` chỉ cho **Production** (Preview giữ `false`), rồi **Redeploy** Production. Không đặt `true` cho Preview.
7. Đăng nhập bằng tài khoản phụ huynh trên Production: thấy An và Nguyên; vào **Giao bài** để giao tuần đầu (baseline). Dữ liệu thử vẫn nằm riêng trong "Gia đình thử" và không lẫn.

### Kiểm tra sau khi chạy (SQL Editor)

```sql
select alias, track_id, is_test from english.learners order by alias;   -- An A false · Nguyên B false · (An (thử), Nguyên (thử) true)
select r.relation, m.display_name, l.alias from english.relationships r
  join english.members m on m.id = r.member_id join english.learners l on l.id = r.learner_id
  where l.is_test = false order by l.alias, r.relation;                  -- 4 dòng
```

### Trang "Đổi mật khẩu"

`/account/password`, có liên kết **Đổi mật khẩu** ở đầu mọi trang (phụ huynh, gia sư, học sinh). Chỉ đổi mật khẩu của phiên đang đăng nhập (không hỏi mật khẩu cũ — phiên đang mở là bằng chứng), nhập mật khẩu mới 2 lần, ≥ 12 ký tự. Chạy ngay trên trình duyệt với phiên của chính người đó (khóa công khai + cookie phiên; không dùng service role, mật khẩu không đi qua máy chủ của app). **Mật khẩu này dùng chung cho Study Launcher** (cùng một tài khoản) — trang nói rõ điều này khi đổi. Form gửi bằng POST và ô nhập không có thuộc tính `name`, nên nếu bấm gửi trước khi trang tải xong thì mật khẩu cũng không lên thanh địa chỉ. Nếu Supabase đòi xác thực lại vì lý do an toàn, trang bảo đăng xuất, đăng nhập lại rồi đổi.

### Ghi chú

- Cần quyết định #13 (văn bản thông báo đồng ý) trước khi bật AI; hiện chỉ ghi phiên bản.
- Ngoài phạm vi: email mời / quên mật khẩu, giao diện quản trị.

## S5b — Bài của gia sư: quyết định của phụ huynh (16–17/10/2026)

Kế hoạch: `docs/plans/s5b1-tutor-work.md` · mockup: canvas "Màn gia sư — S5b (mockup)".

| # | Quyết định | Ngày |
|---|---|---|
| 1 | Mức **b**: insight theo nhãn ngữ pháp/từ vựng; thư viện nguồn + gợi ý để S5b-2 | 16/10 |
| 2 | Cả gia sư và phụ huynh nhập; gắn nhãn câu sai: **gia sư trước, phụ huynh dự phòng** | 17/10 |
| 3 | Làm S5b trước S6; S5b-1 gồm luôn đăng nhập bằng tên ngắn | 17/10 |
| 4 | Gia sư dùng **máy tính**; **một thiết kế chung** cho gia sư của An và Nguyên (khác nhau chỉ bộ nhãn) | 17/10 |
| 5 | Đề PDF: gia sư tải lên, em tải về. Bài link: em gửi **ảnh trang kết quả** (+2 câu: lần đầu? có Hint?), không phải gõ số câu sai | 17/10 |
| 6 | **Chưa** dùng AI đọc ảnh kết quả (bổ sung sau nếu cần) | 17/10 |
| 7 | File tải lên (ảnh, PDF) **chưa** cần sao lưu | 17/10 |
| 8 | Tên đăng nhập: `an`, `nguyen`, `giasu-an`, `giasu-nguyen` → email `haley.truong89+…@gmail.com` (gia sư đánh số `…1`) | 17/10 |

Giả định chờ phụ huynh xác nhận khi duyệt PR: 2 ô nhận xét (lời nhắn cho em / ghi chú cho phụ huynh), câu bỏ trống =
sai, bài làm trong buổi chỉ gia sư lưu, gắn nhãn khi chấm bài viết, ghi kết quả kiểm tra lại trong "Ghi buổi học".
Thêm (17/10, sau review): ghi buổi học mới **luôn chia sẻ** cho phụ huynh; kiểm tra lại "ổn" đổi nhãn "Lặp lại" thành "Ổn" cho các dấu có ngày **trước** lần kiểm tra; `support_level` của ghi chú buổi học được để trống; đăng nhập tên ngắn có chênh lệch thời gian rất nhỏ giữa "tên có tồn tại" và "tên lạ" (cùng một câu báo lỗi, chấp nhận ở quy mô gia đình).

**Mật khẩu của các em phải mạnh** (dài, không phải ngày sinh/tên): tên đăng nhập ngắn dễ đoán nên mật khẩu là lớp bảo vệ chính.

## S5b-1 PR A — Tên đăng nhập ngắn, ghi kết quả bài, ghi buổi học, điểm cần chú ý (17/10/2026)

Nhánh `feature/s5b1a-login-results` — đã review Opus và sửa, CI xanh (gồm E2E), PR chờ phụ huynh duyệt. Kế hoạch: `docs/plans/s5b1-tutor-work.md` (bước 1–4). Phần **giao bài link/PDF, em gửi ảnh kết quả, kho file** là PR B (migration `0016`), chưa làm ở đây.

### Gia sư và phụ huynh làm được gì bây giờ

- **Đăng nhập bằng tên ngắn:** `an`, `nguyen`, `giasu-an`, `giasu-nguyen` (hoặc vẫn gõ email như cũ). Ô duy nhất tên "Tên đăng nhập hoặc email". Tên lạ và mật khẩu sai báo **cùng một câu lỗi**. Email không bao giờ gửi xuống trình duyệt.
- **Trang chủ = "Hôm nay"** (gia sư và phụ huynh): hai việc chính (**Ghi buổi học**, **Ghi kết quả bài**), mục **Cần chú ý** (điểm lặp lại ≥ 2 nguồn, câu sai chờ gắn nhãn, nhãn đến hạn kiểm tra lại), buổi học gần nhất, bài gần nhất. Câu "chờ gắn nhãn" **do chính phụ huynh ghi** hiện ngay cho phụ huynh; câu **do gia sư ghi** chỉ hiện cho phụ huynh **sau 2 ngày** (gia sư gắn trước, phụ huynh dự phòng); việc lọc này làm ở máy chủ.
- **Ghi kết quả bài** (`/learners/<em>/results/new`): *Đề có khung* — bấm các câu sai trên lưới (điểm từng phần, điểm tổng, thang của đề, "Sai theo nhãn"); *Nhập nhanh* — tên bài, tổng số câu, số đúng, số các câu sai, nhãn cho từng câu sai (để trống được → vào "Chờ gắn nhãn"); *Bài kiểm tra | Bài luyện* (mặc định Bài luyện), lần đầu/làm lại, có Hint không, ở nhà/trong buổi (**trong buổi chỉ gia sư**, phụ huynh không thấy lựa chọn này và database cũng chặn). Ô "+ nhãn khác" tạo nhãn riêng của gia đình. Mục **Chờ gắn nhãn** nằm ngay dưới. Sau khi lưu, form khóa lại tới khi bấm "Ghi bài khác" (tránh ghi trùng).
- **Ghi buổi học** (`/learners/<em>/notes/new`): ngày, hôm nay học, ≤ 3 nhãn cần củng cố (chip + tìm + thêm), lời nhắn cho em (≤ 500 ký tự), ghi chú cho phụ huynh (≤ 1000, em không thấy), khung "Đến hạn kiểm tra lại" (đã hỏi · ổn / còn sai / chưa hỏi). "Còn sai" đưa nhãn trở lại danh sách cần chú ý. Gia sư **hoặc** phụ huynh ghi được; luôn chia sẻ cho phụ huynh.
- **Điểm cần chú ý** (`/learners/<em>/weak`): bảng nhãn × nguồn (Bài kiểm tra / Buổi học / Bài viết / Bài luyện) + trạng thái Lặp lại / Theo dõi / Ổn; chọn 4 tuần / 8 tuần / từ đầu; bấm tên nhãn xem dòng thời gian và hạn kiểm tra lại. Hạn kiểm tra lại = lần gần nhất + số ngày cài đặt (*S5c: nay là cài đặt riêng "Hỏi lại điểm yếu", `tutorwork_settings.recheck_days` = 14, không còn đọc từ chính sách đánh giá*), **đọc từ database, không viết cứng**.
- **Nhãn cho bài viết** ngay trên màn duyệt bài (chỉ bài Viết / Sửa bài; tối đa 3 nhãn, đã lưu thì không bỏ được).
- Trang "Ghi chú buổi học" cũ vẫn dùng được; ghi chú viết bằng mẫu mới hiện thêm Củng cố / Lời nhắn / Ghi chú cho phụ huynh và không có nút "Sửa" (bản mới sửa bằng cách ghi buổi mới).

### Luật đo lường (ép trong database, có test)

- Kết quả bài chỉ là **tín hiệu**: không ghi vào `observations` / `validation_decisions`, không đổi bậc kỹ năng.
- **Chỉ lần làm đầu** vào "Điểm cần chú ý"; làm lại lưu `retry` (không tính). Bài bị thay thế không tính. Có Hint vẫn tính, kèm dấu "có gợi ý".
- Học sinh **không đọc được** bảng nào mới (RLS; test cho thấy 0 dòng) và không có màn mới nào cho học sinh trong PR này.
- Không lưu chữ của đề thi: khung đề chỉ có số câu → phần → nhãn.

### Đã làm (4 commit, mỗi bước plan một commit)

1. Đăng nhập tên ngắn: `0013_login_names.sql`, form đăng nhập, mở rộng "Create real family" (ô nhập tên ngắn tùy chọn, mặc định `an`/`nguyen`/`giasu-an`/`giasu-nguyen`; chạy lại an toàn).
2. `0014_tutor_work.sql` + `0015_seed_tags.sql`: nhãn lỗi (10 nhãn cho mỗi track), khung đề, kết quả, dấu nhãn, kiểm tra lại, mở rộng `lesson_notes`, các hàm ghi/đọc, mở rộng hàm xóa dữ liệu một em; 49 test database.
3. Nhập khung đề: `npm run db:import-frame`, workflow **Import test frame**, khung **Destination C1&C2 Progress Test U1–12** (60 câu, 7 phần, thang 54–60 / 45–53 / 36–44 / 0–35).
4. Màn hình (bước này): Hôm nay, Ghi kết quả bài, Chờ gắn nhãn, Ghi buổi học, Điểm cần chú ý, nhãn cho bài viết; API tương ứng (`/api/learners/<em>/results`, `/session-notes`, `/tags`, `/api/results/<id>/tags`, `/api/review/episodes/<id>/tags`); chữ giao diện trong `lib/copy/vi.ts`; 48 test đơn vị mới + 2 test database + 8 kịch bản e2e (`tests/e2e/tutorWork.spec.ts`).

### Phụ huynh cần làm (SQL cần áp, đúng thứ tự)

1. GitHub → Actions → **Apply database migrations** (gõ APPLY): áp `0013_login_names.sql`, `0014_tutor_work.sql`, `0015_seed_tags.sql` (cùng lúc với 0001–0012 nếu chưa áp). Hoặc dán từng file vào SQL Editor theo thứ tự 0013 → 0014 → 0015. Chỉ **thêm** bảng/cột/hàm, không sửa dữ liệu cũ.
2. **Tên đăng nhập ngắn cho gia đình THẬT:** chạy lại workflow **Create real family** (gõ CREATE) với các email đã dùng — tài khoản đã có được dùng lại, chỉ thêm tên ngắn. Muốn tên khác thì điền vào các ô tên đăng nhập. Gia đình **thử** (preview): chạy lại workflow seed gia đình thử, tên là `thu-an`, `thu-nguyen`, `thu-giasu-an`, `thu-giasu-nguyen`, `thu-phuhuynh`.
3. **Nhập khung đề Destination:** Actions → **Import test frame** (gõ IMPORT), chọn `family = test` để thử trước, rồi `real`. Chạy lại không đổi gì.

### Cách thử trên preview (gia đình thử)

1. Đăng nhập `thu-giasu-nguyen` (mật khẩu seed). Trang chủ là **Hôm nay · …**; thẻ Nguyên (thử) có hai nút lớn.
2. **Ghi kết quả bài** → thấy lưới 60 câu: bấm vài câu, điểm/thang đổi ngay → **Lưu kết quả**. Bấm **Nhập nhanh**: tên bài, 10 câu, đúng 8, sai "4, 7", chọn nhãn cho câu 4, để trống câu 7 → lưu → câu 7 xuất hiện ở **Chờ gắn nhãn**, chọn nhãn và lưu.
3. **Ghi buổi học**: chọn 1–3 nhãn, viết lời nhắn và ghi chú → lưu. Đăng nhập `thu-phuhuynh`, mở **Ghi chú buổi học** của Nguyên: thấy cả hai ô.
4. **Điểm cần chú ý**: bảng có các nhãn vừa ghi; bấm tên nhãn xem dòng thời gian. Một nhãn sai ở ≥ 2 nguồn → "Lặp lại".
5. Thử là học sinh (`thu-nguyen`): không có trang nào ở trên (404), và không thấy điểm/nhãn nào.
6. Là phụ huynh: ô "Trong buổi học" không xuất hiện ở Ghi kết quả bài.

### Đối chiếu với plan — chỗ khác và vì sao (cần Opus/phụ huynh xem)

- **Chưa có thẻ "Giao bài" và danh sách "Bài luyện đang mở"** trên Hôm nay, và **chưa có "Bài nào"** (chọn bài đã giao) / ảnh em gửi bên cạnh "Nhập nhanh": thuộc PR B. Hiện chỉ có "Bài trên giấy / bài link (ghi tay)".
- **Nguồn của dấu nhãn:** đề có khung → luôn `test` (Bài kiểm tra); nhập nhanh → gia sư/phụ huynh chọn *Bài kiểm tra | Bài luyện* (mặc định Bài luyện), lưu ở cột mới `results.source` (có ràng buộc: bài có khung chỉ được là `test`).
- `lesson_notes.support_level` được nới "không bắt buộc" (ghi buổi học mới không có ô này); hàm cũ vẫn truyền giá trị, ràng buộc giá trị hợp lệ giữ nguyên.
- Ghi buổi học (mới) **luôn chia sẻ** với phụ huynh vì có ô "ghi chú cho phụ huynh".
- Quy tắc "phụ huynh chỉ thấy câu chờ gắn nhãn của **gia sư** sau 2 ngày" là **quy tắc giao diện/máy chủ**, không phải database (plan ghi vậy): phụ huynh vẫn gắn được nhãn nếu gọi trực tiếp API. Câu phụ huynh tự ghi thì thấy ngay.
- Hàm ghi thêm cột `marked_on` (ngày của sự việc) và `title`/`assignment_id` ở bảng kết quả so với bản phác trong plan, để "đến hạn kiểm tra lại" tính theo ngày thật.
- Nhãn riêng của gia đình có key `x-<tên rút gọn>-<5 ký tự ngẫu nhiên>` (máy chủ tạo phần đầu, database thêm đuôi ngẫu nhiên) nên không bao giờ đụng nhãn có sẵn hay nhãn của gia đình khác.
- Số migration kế tiếp cho nội dung cấu hình mới (`npm run gen:config -- --new`) giờ là **0016** *(lỗi thời: sau S5c là 0018, vì 0017 là migration S5c)*.
- Trong môi trường này không có Docker/Supabase nên **chưa chạy được e2e và chưa mở trang thật**; đã có `next build` xanh, test database và test render. E2E chạy trong CI.

### Ghi chú cho PR B và các lát sau

- PR B (`feature/s5b1b-practice-files`): `0016` (bucket `english-work`, `files`, `assignments`, `submissions`), màn Giao bài, màn Bài luyện của em, ảnh kết quả bên cạnh "Nhập nhanh", thẻ Giao bài + danh sách bài đang mở trên Hôm nay.
- S7 (trạng thái, đề xuất bậc) **không được đọc** `results` / `tag_marks` / `recheck_events` làm bằng chứng.

### Sửa theo review Opus của PR A (17/10/2026)

Vì `0013`–`0015` chưa áp lên database thật nên sửa **ngay trong file** (không thêm migration mới). Đổi so với plan:

- **Nhãn riêng (MAJOR):** key = `x-<tên rút gọn>-<5 ký tự ngẫu nhiên>`, **duy nhất toàn hệ thống** (`unique(track_id, key)`). Plan viết "key sinh từ tên" và chỉ unique theo gia đình — đổi vì key trùng giữa 2 gia đình làm lộ nhãn của gia đình khác qua lỗi 409. Chống tạo trùng **trong một gia đình** bằng chỉ mục riêng trên tên đã chuẩn hóa (chỉ cho nhãn còn dùng; nhãn đã ngưng dùng + tên giống = nhãn mới). Tạo cùng tên lần hai trong gia đình trả lại nhãn đang có, không tạo thêm.
- **Thay thế một kết quả (`supersedes_id`) (MAJOR):** chỉ **chính người đã ghi**, cùng em, mới thay được; kết quả "trong buổi" còn cần gia sư đang có quan hệ với em. Phụ huynh không thay được kết quả lớp của gia sư; thành viên khác cũng không.
- **Lần đầu trùng (MAJOR):** với đề có khung, một em chỉ có **một** kết quả "lần đầu" còn hiệu lực cho mỗi họ khung (mọi phiên bản khung), trừ khi bản mới thay bản cũ. Trả 409 với câu "Bài này đã được ghi lần đầu — chọn “Làm lại” hoặc sửa bản đã ghi".
- **Hạn kiểm tra lại (MAJOR):** `last_recheck` và danh sách nhãn bỏ qua các lần kiểm tra thuộc **ghi chú đã bị thay**; kiểm tra lại được tính theo **ngày của buổi học** (`session_date`), và một ghi chú không được vừa đánh "cần củng cố" vừa "ổn" cho cùng một nhãn.
- **Cột mới `results.source`** (`test` / `practice`) cho Nhập nhanh, xem trên.
- **Gắn nhãn cho bài viết trong buổi / bài kiểm tra trực tiếp** (`eng_tag_episode`): chỉ gia sư (D15).
- **Ghi chú cũ (v1) không thay được ghi chú mới (v2)** — chặn cả ở máy chủ lẫn trong database. Vì `eng_write_lesson_note` (v1) được tạo lại trong `0014` (thêm đúng một kiểm tra), không sửa `0010`; có test so từng dòng như hàm xóa dữ liệu.
- **Xóa dữ liệu một em** nay cũng xóa dòng tên đăng nhập của em đó (`login_names`), và biên nhận ghi số dòng.
- `eng_valid_item_list` chỉ còn quyền cho `service_role` (đã thu lại của `authenticated`).
- `npm run db:seed-dev`: nếu tên `thu-*` đang gắn với tài khoản khác thì **cảnh báo và bỏ qua tên đó** (các phần khác vẫn tạo), không làm hỏng cả lần seed. Gia đình THẬT vẫn dừng hẳn như trước.
- Giao diện: "Chờ gắn nhãn" lưu từng phần và tự tải lại; "Bài gần nhất" không lấy bài đã bị thay; thẻ Hôm nay không hiện một nhãn hai lần (lặp lại ưu tiên hơn đến hạn); chữ thay thế khi nhãn lạ lấy từ `fallbackLabels`.
- Không chạy được e2e ở đây (không Docker/Supabase); `tests/e2e/tutorWork.spec.ts` chỉ được liệt kê (`--list`), CI sẽ chạy.

## S5b-1 PR B — Giao bài link/PDF, em gửi ảnh kết quả, kho file riêng tư (17/10/2026)

Nhánh `feature/s5b1b-practice-files` (xuất phát từ PR A `feature/s5b1a-login-results`, nên **PR A phải được duyệt/áp trước**). Kế hoạch: `docs/plans/s5b1-tutor-work.md` (bước 6–8). **Chưa có review Opus**, chưa push, chưa mở PR; chưa áp lên database thật.

### Gia sư, phụ huynh và các em làm được gì bây giờ

- **Giao bài luyện** (`/learners/<em>/assign`, nút thứ ba trên **Hôm nay**): chọn **Link** (dán link; app tự nhận nguồn *test-english*, *NotebookLM*, *Gemini*, còn lại *Link khác*; chỉ nhận `https`) hoặc **Đề PDF** (tải lên, có thể kèm đáp án chỉ gia sư/phụ huynh thấy). Có tên bài, tối đa 3 nhãn luyện, hạn nộp, khung đề (không bắt buộc). Bảng **Bài luyện đã giao**: trạng thái *Chưa làm / Em đã gửi / Đã ghi kết quả / Đã rút*, mở link/PDF/đáp án, **Ghi kết quả** (đổi thành **Sửa kết quả** khi bài đã có kết quả), **Nộp thay** (gia sư/phụ huynh gửi ảnh thay em, ghi rõ ai nộp), **Rút bài**.
- **Bài luyện** của em (`/practice`, mục thứ hai trên thanh trên cùng, cạnh "Việc tiếp theo"): **Mở bài** (link, tab mới) hoặc **Tải đề về** (PDF, qua app). Làm xong thì gửi **ảnh trang kết quả**: chụp màn hình rồi **Ctrl + V** vào khung, hoặc **Chọn ảnh từ máy**; link bài đã làm (không bắt buộc); hai cái bấm: *lần đầu?* và *có bấm Hint không?*. Bài PDF: chụp ảnh bài làm trên giấy hoặc chọn file (tối đa 6) — bài PDF chỉ hỏi *lần đầu?*, **không hỏi Hint**. Ảnh được **thu nhỏ trên máy** còn tối đa 1600 px trước khi gửi. Còn có cột **Việc cần ôn** (các nhãn gia sư đã chọn ở buổi học gần nhất) và **Lời nhắn** của gia sư. **Em không thấy điểm, số câu sai, tên nhãn nào ngoài "Việc cần ôn", cũng không thấy đáp án.** Gia sư đã xem thì em không gửi lại được nữa.
- **Ghi kết quả bài**: ô **Bài đã giao** (hoặc bấm *Ghi kết quả* từ bảng / từ dòng *Em đã gửi* trên Hôm nay). **Ảnh em gửi hiện ngay bên cạnh** form (kèm "xem to"), cùng hai ý em tự khai; gia sư/phụ huynh **tự đọc ảnh** rồi gõ điểm, câu sai, nhãn. **Không có AI đọc ảnh.** Tên bài, lần đầu/làm lại, Hint, khung đề được điền sẵn từ bài đã giao (sửa được). Kết quả lưu kèm bài đã giao nên bảng chuyển sang *Đã ghi kết quả*. **Một bài giao chỉ có một kết quả “lần đầu”**: bấm vào bài đã có kết quả thì form mở ở chế độ **Sửa kết quả** (điền sẵn số cũ; bản mới thay bản cũ, bản cũ vẫn nằm trong lịch sử nhưng không tính); muốn ghi thêm một lần làm lại thì bấm “Ghi thêm một lần làm lại (không thay bản cũ)”. Chỉ người đã ghi kết quả mới sửa được. Bài đã rút thì không ghi kết quả được.
- **Hôm nay**: nút **Giao bài luyện**, mục **Bài luyện đang mở** (chưa làm / em đã gửi) và hàng cần chú ý **Em đã gửi · cần ghi kết quả**.
- Một thiết kế chung cho gia sư của An và Nguyên (không có `if (track === …)`; chỉ bộ nhãn khác nhau). Gắn nhãn: gia sư trước, phụ huynh dự phòng (như PR A).

### Kho file (Supabase Storage) — chính xác cái gì được tạo

`0016_practice_files.sql` tạo **đúng một thứ** trong Storage:

| Thứ được tạo | Giá trị |
|---|---|
| Bucket | `english-work` — **riêng tư** (không public) |
| Giới hạn | 15 MB mỗi file; chỉ `application/pdf`, `image/png`, `image/jpeg`, `image/webp` |
| Policy trên `storage.objects` | **Không có policy nào**: không tài khoản nào (kể cả đã đăng nhập) đọc/ghi thẳng được |
| Bucket/đối tượng khác | Không đụng; không đụng schema `public` |

Cách hoạt động: máy chủ kiểm quyền ở phía `english` trước, rồi mới dùng service role (**chỉ ở máy chủ**) để cấp (a) link **tải lên** dùng một lần cho đúng một đường dẫn do máy chủ tự dựng `{family}/{em|shared}/{uuid}.{đuôi}` (trình duyệt gửi file thẳng lên, không qua máy chủ app), (b) link **tải xuống sống 300 giây** (mỗi lần xem là một link mới). Khi đăng ký bài, máy chủ **hỏi lại Storage** loại file và kích cỡ thật, lệch thì từ chối. Nếu lúc áp migration mà Storage chưa sẵn (hoặc môi trường chỉ có Postgres trơn) thì bước tạo bucket được bỏ qua, và **app tự tạo bucket** ở lần dùng đầu — cùng cấu hình trên.

**Kiểm tra tay trên Supabase (quan trọng vì dự án này dùng chung với Study Launcher):**

1. Storage → bucket `english-work` phải ghi **Private**.
2. Storage → Policies: **không có policy nào trên `storage.objects` thiếu điều kiện bucket** (kể cả mục “Other policies”). Lý do: các policy được *cộng* với nhau; chỉ cần một policy kiểu “người đã đăng nhập được đọc mọi file” mà không nhắc tới `bucket_id` là đủ để người đó đọc cả `english-work` bằng token của họ. Migration `0016` **chỉ cảnh báo** (không tự sửa) nếu thấy policy như vậy; `npm run doctor` (hoặc Actions → **Setup doctor**) có hai dòng ✓/✗: “Không có policy nào trên storage.objects thiếu điều kiện bucket” và “Bucket english-work tồn tại và riêng tư”. Nếu có ✗: đừng tự xóa policy của Launcher — nhờ dev thêm điều kiện `bucket_id = '…'` cho policy đó.

### File tải lên KHÔNG nằm trong bản sao lưu

Bản sao lưu hằng tuần (`pg_dump`) chỉ chứa **bảng**, không chứa file trong Storage (quyết định của phụ huynh 17/10: chưa cần). Hệ quả: nếu Storage hỏng/xóa nhầm thì **mất ảnh/PDF đã tải lên**, nhưng **kết quả đã ghi (số liệu, nhãn) vẫn còn** vì đó là bảng. PDF đề nên giữ bản gốc ở máy gia sư.

**Xóa dữ liệu một em — có một bước làm tay:** hàm `english.eng_purge_learner` nay cũng xóa các dòng bài giao/bài nộp/file/vé tải lên của em (chỉ thêm dòng xóa, có test so từng dòng với bản 0014). **File thật trong Storage nằm ngoài database**, nên **sau khi xóa dữ liệu một em, phải xóa thư mục `{family}/{learner}` trong Storage** (Supabase → Storage → `english-work` → thư mục của gia đình → thư mục của em → chọn tất cả → Delete), hoặc chạy helper `deleteLearnerFolder` (`lib/storage/purge.ts`, có test). *(Cập nhật S5c 18/10: đã có màn xóa `/learners/<em>/delete` gọi helper này — xem mục S5c.)*

**Giới hạn tải lên và file mồ côi:** mỗi em tối đa **60 link tải lên mỗi 24 giờ** (đếm trong database, bảng `upload_tickets`; quá thì báo “tải lên quá nhiều”). Nếu em chọn ảnh, ảnh lên Storage xong nhưng không bấm Gửi thì file nằm lại trong bucket (không có dòng trong database, không ai mở được) — gọi là *mồ côi*. Dọn tay, **không có lịch tự động**: `npm run storage:orphans` (cần `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` trong `.env.local`) **chỉ liệt kê** các file không có dòng trong `english.files` và cũ hơn 1 ngày; muốn xóa: `npm run storage:orphans -- --delete --confirm` (thiếu `--confirm` thì không xóa gì). File có đường dẫn lạ không bao giờ bị xóa.

**PDF do em/người khác gửi lên** (ảnh bài làm dạng PDF) được tải về chứ không mở ngay trong trang web (nội dung không tin cậy); ảnh và đề PDF của gia sư vẫn xem được trực tiếp.

### Đã làm (3 commit theo plan + các commit sửa theo review Opus bên dưới)

1. **Bước 6:** `0016_practice_files.sql` (bucket, bảng `files` / `assignments` / `assignment_events` / `submissions` chỉ-thêm, hàm giao/rút/nộp/xem, 3 hàm cho em, ràng buộc kết quả↔bài giao cùng một em, mở rộng hàm xóa dữ liệu), lớp lưu trữ `lib/storage/*`, nhận diện nguồn link `lib/practice/link.ts`, test database và đơn vị.
2. **Bước 7:** các màn hình trên, API tương ứng, quyền `practice:read` / `practice:write` (gia sư + phụ huynh; học sinh không có), 36 test đơn vị mới (quyền 401/403/404, file lệch loại/kích cỡ, em không dùng được đường của gia sư, đáp án không bao giờ tới em, chữ của em không có từ về điểm).
3. **Bước 8 (commit này):** kịch bản e2e `tests/e2e/practice.spec.ts` (gia sư giao PDF → em tải PDF → em gửi ảnh PNG → gia sư mở Nhập nhanh từ bài đã gửi, thấy ảnh, ghi kết quả có nhãn → nhãn hiện ở "Điểm cần chú ý"; em không thấy điểm và không mở được đường file của gia sư; em/gia sư của bạn kia nhận 404; bài đã rút biến mất và không nộp được), bật Storage trong `supabase/config.toml` cho CI, thêm bước chờ Storage trong `.github/workflows/ci.yml`.

### Phụ huynh cần làm (SQL cần áp)

1. Sau khi PR A đã áp `0013`–`0015`: GitHub → Actions → **Apply database migrations** (gõ APPLY) để áp `0016_practice_files.sql` (hoặc dán file vào SQL Editor). Chỉ **thêm**; chạy lại an toàn. Nó tạo bucket `english-work` như bảng trên.
2. Nếu SQL Editor báo cảnh báo "english-work bucket was not created here": không sao, app tự tạo bucket ở lần giao PDF đầu tiên. Kiểm tra lại bucket **Private** và **không có policy**.
3. Sau khi áp: Storage → Policies — **không có policy nào trên `storage.objects` thiếu điều kiện bucket** (kể cả mục “Other policies”); nếu SQL Editor in cảnh báo “storage.objects has policies without a bucket_id condition”, hoặc `npm run doctor` báo ✗, đừng tự xóa mà nhờ dev xem (Launcher có thể đang dùng).
4. Không cần bật gì thêm trong Supabase (không đổi Auth, không đổi `public`).

### Cách thử trên preview (gia đình thử)

1. Đăng nhập `thu-giasu-nguyen` → **Giao bài luyện**. Chọn *Đề PDF*, chọn một file PDF nhỏ, đặt tên, chọn 1 nhãn → **Giao cho Nguyên (thử)**. Bấm **Mở file đề**: PDF mở được.
2. Thử *Link*: dán `https://notebooklm.google.com/…` → dòng "Nguồn: NotebookLM" hiện ngay; dán `http://…` → báo cần `https`.
3. Đăng xuất, đăng nhập `thu-nguyen` → **Bài luyện**: thấy bài, **Tải đề về** ra file PDF. Chụp một ảnh bất kỳ, kéo vào khung hoặc **Chọn ảnh từ máy** (hoặc Ctrl + V ảnh đã chụp), bấm *Lần đầu* và *Không* (Hint) → **Nộp bài làm**. Em chỉ thấy "Đã gửi lúc …", **không** có điểm/nhãn.
4. Đăng nhập lại `thu-giasu-nguyen`: **Hôm nay** có dòng **Em đã gửi · cần ghi kết quả** → bấm vào: ảnh em gửi nằm cạnh form **Nhập nhanh**. Điền tổng 5, đúng 4, sai "2", chọn một nhãn → **Lưu kết quả**.
5. Mở **Điểm cần chú ý**: nhãn vừa chọn hiện. Mở **Giao bài luyện**: bài ở trạng thái *Đã ghi kết quả*.
6. Thử **Nộp thay** (gia sư/phụ huynh gửi ảnh thay em) và **Rút bài** (em không còn thấy bài).
7. Là `thu-an` (em kia) hoặc `thu-giasu-an`: không mở được bài/file của Nguyên (404).

### Đối chiếu với plan — chỗ khác và vì sao (cần Opus/phụ huynh xem)

- **Bài PDF chỉ hỏi "lần đầu?"**, không hỏi "có Hint?" (Hint là của trang test-english/NotebookLM): `submissions.used_hint` để **NULL** cho bài PDF (xem "Sau review Opus"); màn ghi kết quả hiện “Không áp dụng (đề PDF)”.
- **Hàm xóa dữ liệu** chỉ xóa **dòng** trong database; file thật phải xóa tay thư mục `{family}/{learner}` hoặc chạy `deleteLearnerFolder` (có sẵn, chưa gắn nút/route vì app chưa có màn xóa) — xem trên.
- **Không có policy trên `storage.objects` và không có tài khoản nào đọc thẳng được** — đúng phương án đã duyệt, nhưng khác cách làm "policy theo thư mục" thường thấy.
- Bucket tạo bằng `insert` trong `0016` **chỉ khi** schema `storage` có sẵn; có đường dự phòng app tự tạo (xem trên).
- **Không chạy được e2e ở đây** (không Docker/Supabase): `tests/e2e/practice.spec.ts` chỉ được liệt kê (`--list`), CI chạy với Storage thật. Cần CI xác nhận 2 chỗ chưa thử được: link tải lên/tải xuống ký tên đi qua `127.0.0.1:54321` đúng, và bucket do `0016` tạo khi Storage khởi động xong trước bước áp migration.
- Số migration kế tiếp cho nội dung cấu hình mới (`npm run gen:config -- --new`) giờ là **0017** *(lỗi thời: sau S5c là 0018)*.
- `0016` được **sửa tại chỗ** theo review (chưa áp ở đâu nên không thêm migration mới).

### Cần phụ huynh/Opus quyết

1. ~~Làm màn xóa dữ liệu một em~~ — **ĐÃ LÀM ở S5c** (phụ huynh quyết 18/10, A5).
2. **Sao lưu file**: hiện chưa (quyết định #7). Nếu sau này muốn, cần quyết nơi lưu (không dùng dịch vụ bên thứ ba nhận dữ liệu của con).
3. Có muốn đặt lịch tự động cho `npm run storage:orphans` không (hiện chỉ chạy tay; lịch tự động cần phụ huynh đồng ý riêng).

### Ghi chú cho S5b-2 và các lát sau

- S7 (trạng thái, đề xuất bậc) **không được đọc** `results` / `tag_marks` / `submissions` làm bằng chứng; ảnh em gửi chỉ để người đọc, không phải điểm AI/đánh giá.
- Thư viện nguồn + gợi ý (S5b-2) dùng được `assignments.source_key` và `tag_keys` đã lưu từ PR này.

### Sau review Opus của PR B (17/10/2026) — đã sửa (vẫn trong `0016`)

- **Một kết quả “lần đầu” cho mỗi bài giao** (MAJOR): trigger của bảng kết quả từ chối kết quả “lần đầu” thứ hai cho cùng bài giao trừ khi nó thay đúng bản đang có (`supersedes_id`) → trả 409 với câu “Bài này đã được ghi lần đầu — chọn ‘Làm lại’ hoặc sửa bản đã ghi”. Giao diện: dòng đã ghi kết quả có nút **Sửa kết quả**; mở bài đã có kết quả thì form ở chế độ sửa (điền sẵn). Có test database + e2e.
- **Policy dùng chung trên `storage.objects`** (MAJOR): xem mục “Kho file”; `0016` cảnh báo, `npm run doctor` có hai dòng mới.
- **Bài PDF không có câu hỏi Hint**: `submissions.used_hint` cho phép NULL (bắt buộc có giá trị cho bài link, bắt buộc NULL cho bài PDF).
- **Bài đã rút không ghi được kết quả** (trigger; có test).
- **Giới hạn 40 bài** của danh sách của em không còn chặn việc tải lên/nộp một bài cũ: `eng_my_practice(p_assignment)` tra thẳng từng bài.
- **Gửi lại sau khi mất kết nối:** màn gửi nhớ các file đã lên Storage và dùng lại cùng mã gửi; chỉ gửi lại file nào lỗi; database nhận ra cùng một lần gửi (trả “đã có”) thay vì báo lỗi trùng. Đổi bất cứ thứ gì thì là lần gửi mới.
- **Giới hạn 60 link tải lên/em/24 giờ**, **`npm run storage:orphans`** (xem trên).
- **PDF do người khác gửi** được tải về, không mở trong trang. `stat()` có đường dự phòng khi Storage không có `/object/info`. Tạo lại bucket thì đọc lại và **từ chối nếu bucket đang công khai**.
- Chữ giao diện của các lỗi gửi file chuyển hết vào `lib/copy/vi.ts`.
- E2E: so khớp tên liên kết chính xác (thẻ “Giao bài luyện” mới trên Hôm nay không còn trùng với liên kết “Giao bài” của chủ đề); thêm kịch bản sửa kết quả, “lần đầu” thứ hai bị từ chối, và link tải lên chỉ dùng được một lần.

## S5c — Sẵn sàng dùng thật (18/10/2026)

Nhánh `feature/s5c-readiness`. Kế hoạch `docs/plans/s5c-readiness.md`; kiểm toán `docs/AUDIT_2026-10-18.md`; quyết định `docs/DECISIONS_PENDING.md` (phụ huynh đồng ý A–D ngày 18/10, rồi đồng ý mục E "Studio bài tập" lúc 22:05 cùng ngày; Studio là lát riêng sau S5c nên **lát này không có việc AI nào**). **Chưa có review Opus, chưa push, chưa mở PR, chưa áp lên database thật.**

### Đã thay đổi gì (nói đơn giản)

| Việc | Vì sao | Nằm ở |
|---|---|---|
| **Ghi buổi học có ô "Kỹ năng đã luyện hôm nay"** (chọn trong bộ kỹ năng của em). Mỗi kỹ năng được ghi là một lần luyện | Sau này lịch ôn "≥ 14 ngày sau lần luyện gần nhất" (S7/S8) cần dữ liệu này; **không thể bù về sau** | `0017`, màn Ghi buổi học |
| **Một "lần đầu" mỗi (tên bài, ngày)** khi ghi nhanh không gắn bài giao | Gia sư và phụ huynh cùng nhập một đề thì không bị tính "lần đầu" hai lần. Muốn sửa thì dùng "thay bản cũ" | `0017` |
| **"Hỏi lại điểm yếu"** (đổi tên từ "Kiểm tra lại") có cài đặt số ngày **riêng** (mặc định 14), tách khỏi chính sách đánh giá | Hai khái niệm khác nhau; đổi một bên không kéo bên kia | `0017`, chữ trong `vi.ts` |
| **Nhập bài từ pilot giấy 17–19/10**: ở màn Ghi bài ngoài app, nếu chọn ngày sớm hơn ngày giao thì hiện ô **lý do** (gợi ý "Nhập từ phiếu giấy pilot 17–19/10"); cho lùi tối đa **14 ngày**, lý do được lưu vào nhật ký. **Chỉ với bước đã mở cùng lúc giao bài, và không bao giờ với bài ôn sau 2 tuần (kiểm tra trễ) hay bài chuyển sang chủ đề mới**; bước mở muộn hơn ngày giao thì vẫn phải đúng ngày | Baseline là mốc đo tiến bộ, phải vào app | `0017`, màn Ghi bài |
| **Màn "Xóa dữ liệu của em"** (chỉ phụ huynh): bấm từ thẻ của em → xem trước số dòng sẽ xóa → gõ tên em → (em thật) tick xác nhận lần hai → xóa dữ liệu, ảnh/PDF của em và tên đăng nhập ngắn. **Không xóa tài khoản đăng nhập** (dùng chung Launcher) | Cần có cách xóa an toàn trước khi dữ liệu thật vào | `0017`, `/learners/<em>/delete` |
| **Sao lưu có tài khoản đăng nhập** (`auth.users`, `auth.identities`, mã hóa cùng khóa) và **tự khôi phục thử** vào một cơ sở dữ liệu tạm ngay trong lần chạy, đối chiếu số dòng của **mọi bảng `english`** và `auth.users` trước khi mã hóa, và coi lỗi khôi phục thuộc `english`/`auth` là lỗi; chỉ in **số lượng**, không in dữ liệu. Sao lưu chính (public + english) và sao lưu tài khoản là hai bước riêng: bước tài khoản hỏng thì bản chính vẫn được kiểm tra, mã hóa, lưu, và lần chạy báo đỏ | Chưa ai thử khôi phục; thiếu bảng đăng nhập thì khôi phục xong không ai đăng nhập được | `.github/workflows/backup.yml` |
| **Nhãn "Quá hạn"** ở danh sách bài luyện của gia sư/phụ huynh và trên thẻ Hôm nay khi quá hạn nộp mà chưa có bài nộp/kết quả. Không trừ điểm, không chặn nộp, **em không thấy gì mới** | Gia sư biết để nhắc (D4) | giao diện, không migration |
| **Tài liệu đồng bộ**: PRD thêm D29–D33; DESIGN thêm §19; CLAUDE.md status; bảng quyết định ở trên; bản nháp văn bản đồng ý | Audit #10, #11, #7 | `docs/` |

### SQL cần áp

- **ÁP `0017` TRƯỚC khi thử trên preview hoặc gộp PR.** `0017` tương thích ngược với code của `main` (hàm cũ vẫn chạy với lời gọi cũ), nên áp trước không làm hỏng bản đang chạy. Ngược lại, nếu code mới chạy khi `0017` chưa áp thì: ghi buổi học/ghi bài ngoài app vẫn chạy như cũ (chỉ không có phần mới); trang "Xóa dữ liệu của em" hiện câu "cần áp 0017" thay vì báo lỗi.
- **`db/migrations/0017_readiness.sql`** — Actions → **Apply database migrations** (gõ APPLY) hoặc dán vào SQL Editor. Chỉ **thêm/thay hàm** (`create or replace`) và một bảng mới `tutorwork_settings` (có sẵn giá trị 14); chạy lại an toàn; không sửa dữ liệu cũ. Nên bấm chạy tay *Weekly backup* **trước** khi áp.
- Áp xong, **không** cần chạy lại bước nào khác. (Hàm ghi buổi học bản cũ và các lời gọi cũ vẫn chạy được.)

### Phụ huynh cần làm

1. **Vercel → Settings → Deployment Protection:** bật cho **Preview** (Standard/Vercel Authentication). Lý do: Preview dùng chung database thật với khóa toàn quyền; bật lên thì chỉ người đăng nhập Vercel mới mở được. (Audit #8, quyết định A7.)
2. **Duyệt văn bản đồng ý** `docs/CONSENT_pilot-2026-10.md` (5–7 câu): sửa chữ nếu cần rồi nói "duyệt". Văn bản chưa nối vào giao diện; khi đổi chữ thì phải đặt phiên bản mới (không sửa `pilot-2026-10` đã ghi).
   - *Ghi chú 22/10 (đã duyệt 21/10):* các dòng đồng ý `pilot-2026-10` được ghi lúc tạo gia đình (20/10), theo BẢN NHÁP. Thay đổi ngày 21/10 chỉ chạm câu 4 (AI). Bật AI vẫn cần đồng ý `ai_text` riêng (E6), nên **giữ nguyên phiên bản** `pilot-2026-10`; không đổi dữ liệu đồng ý nào.
3. **Chạy sao lưu tay một lần** sau khi PR được gộp: GitHub → Actions → *Weekly backup (encrypted)* → Run workflow. Mở lần chạy, đọc phần **Summary**: bảng *Restore check* phải ghi **OK** ở mọi dòng (mỗi bảng của `english` và `auth.users`) và "Restore check PASSED". Nếu thấy **MISMATCH**: bản sao lưu vẫn được lưu nhưng **đừng tin** cho tới khi xem nguyên nhân (nhờ dev). Chạy này cần Secrets `DATABASE_URL`, `BACKUP_AGE_RECIPIENT` như cũ; không cần thêm gì.
4. **Diễn tập giải mã một lần** (làm tay, trên máy có khóa offline): tải artifact `learning-os-…` về máy → `age -d -i learning-os-backup.key learning-os-<mốc>.dump.age > main.dump` và tương tự cho `learning-os-auth-<mốc>.dump.age` → `auth.dump`; chạy `pg_restore -l main.dump | head` để thấy danh sách đối tượng (không cần khôi phục thật). Xóa các file `.dump` sau khi xem. Mục đích: chắc rằng khóa offline thật sự giải mã được.
5. **Khôi phục thật (khi cần):** làm trên một project THỬ, không phải project thật; Claude chỉ chuẩn bị lệnh, phụ huynh quyết và bấm (xem bảng "Quay lại khi hỏng" trong `CLAUDE.md`).

### Cách thử trên preview (gia đình thử)

1. Đăng nhập `thu-giasu-nguyen` → **Ghi buổi học**: có khung **Kỹ năng đã luyện hôm nay**; chọn 1–2 kỹ năng → lưu. (Trong database: `select target_key, source from english.exposure_log where source='lesson' order by at desc limit 5;`)
2. **Ghi kết quả bài → Nhập nhanh**: ghi bài "Thử A" hôm nay lần đầu, rồi ghi lại cùng tên, cùng ngày, lần đầu → báo đã có lần đầu. Chọn "Làm lại" hoặc sửa bản đã ghi thì được.
3. **Ghi bài ngoài app** cho một bài đã giao: chọn ngày sớm hơn ngày giao 3 ngày → hiện ô lý do; để trống → báo cần lý do; điền lý do → lưu được. Sớm hơn 14 ngày → báo không được. Bước mở muộn hơn ngày giao, hoặc bước ôn sau 2 tuần / chuyển sang chủ đề mới → báo "chỉ ghi lùi được với bước đã mở cùng lúc giao bài".
4. **Tạo một em thử để xóa:** GitHub → Actions → **Seed test family** → Run workflow → `mode` = **throwaway**, `confirm` = `SEED` → Summary in tên em, dạng "Em thử xóa xxxxxx" (trên máy: `npm run db:seed-throwaway`). Công cụ **từ chối** nếu gia đình THỬ có em nào không phải em thử. Rồi đăng nhập `thu-phuhuynh` → thẻ của em **Em thử xóa …** → **Xóa dữ liệu**: số dòng hiện ra, gõ sai tên → không xóa; gõ đúng → xóa. **Không dùng "An (thử)"/"Nguyên (thử)"**. Gia sư không thấy liên kết này.
5. Bài luyện có hạn nộp là hôm qua và chưa nộp → hiện nhãn **Quá hạn** ở bảng bài giao và thẻ Hôm nay; đăng nhập là em → không có nhãn.

### Đối chiếu với plan — chỗ khác và vì sao

- **Sao lưu khi khôi phục thử lệch:** job báo đỏ (email) nhưng vẫn mã hóa và lưu file, để một bản có thể tốt không bị mất. Plan chỉ nói "fail the job".
- **"Quá hạn" chỉ áp cho bài luyện (S5b)**, không cho hạn của chủ đề S2 (S2 có luồng riêng cho em).
- **`eng_recheck_days` nay là cài đặt chung** (không theo bộ kỹ năng của em), nên em chưa có bộ kỹ năng cũng có hạn "Hỏi lại". Chưa có màn để phụ huynh đổi số ngày (đổi bằng SQL qua `eng_set_tutorwork_setting`); nếu cần màn, nói để làm sau.
- **Test e2e xóa dữ liệu** (`tests/e2e/purge.spec.ts`) chạy ở một project Playwright riêng sau các test khác và cần `DATABASE_URL` (để tạo em thử rồi xóa). Chưa chạy được ở máy này (không Docker/Supabase), chỉ `--list`; CI chạy.
- **Mục nội dung C1/C5/C6** (bảng bước→bài đọc/nghe, đề thử 21/11, B-v2) không thuộc S5c — chưa làm.
- **Không có AI**, không có Studio trong lát này. Thứ tự sau S5c theo E8 (PRD D31): spike AI → đưa gia sư vào + mockup Studio → Studio 1 → Studio 2 → S6 → S7 → S8.
- Số migration kế tiếp cho nội dung cấu hình mới (`npm run gen:config -- --new`) giờ là **0018**.

- **"Đăng xuất" chỉ đăng xuất máy đang dùng** (trước đây đăng xuất mọi máy của cùng tài khoản). Lý do: phụ huynh đăng xuất trên laptop chung không bị văng khỏi điện thoại; đồng thời sửa lỗi E2E chập chờn (test đăng xuất của phụ huynh làm rơi phiên phụ huynh ở test chạy song song). Phiên của máy này vẫn bị thu hồi trên server.

### Để sau (ghi nhận từ review Opus, không làm trong S5c)

- **Chưa có màn cho phụ huynh đổi số ngày "Hỏi lại điểm yếu"** (hiện đổi bằng SQL qua `eng_set_tutorwork_setting`; mặc định 14).
- **"Quá hạn" chỉ áp cho bài luyện (S5b)**, chưa cho hạn của chủ đề S2.
- **Kiểm tra khôi phục lệch số dòng khi có ghi đồng thời**: so sánh dùng khoảng [trước, sau] lúc sao lưu, nên một bản sao lưu trúng đúng lúc có nhiều thao tác ghi vẫn có thể báo MISMATCH giả; chạy lại là hết.
- **Khôi phục thử không kiểm tra nội dung**, chỉ số dòng của mọi bảng `english` + `auth.users` và lỗi khôi phục thuộc schema `english`/`auth`; lỗi ở schema `public` của Launcher chỉ được đếm.
- **File ảnh/PDF chưa sao lưu** (A4, xem lại sau ~1 tháng dùng thật).
- **Cài đặt "Hỏi lại điểm yếu" là chung cho cả app** (N2): `eng_set_tutorwork_setting` cho phụ huynh của bất kỳ gia đình nào đổi số ngày dùng chung, và dòng nhật ký nằm dưới gia đình đó. Hiện chưa có màn nào gọi; nếu làm màn thì đổi khóa thành (gia đình, khóa).
- **`eng_audit_purge_files` kiểm tra lỏng** (N4): không đối chiếu gia đình với biên nhận `learner.purged` và gọi lặp được. Chỉ server gọi được nên rủi ro thấp.
- **Sửa ngày của một ghi chú buổi học** (N7): ghi chú thay thế đổi `session_date` thì các lần luyện của bản cũ vẫn nằm ở ngày cũ (giống bản v1). Cần xử lý khi làm S8 (lịch ôn).

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database trên Postgres thật), `gen:config` xanh; CI (gồm E2E và bước áp migration hai lần) xanh; phụ huynh áp `0017` và chạy sao lưu thử có bảng *Restore check* ghi PASSED.

## Studio 1 · PR A — Kỹ năng đọc (20/10/2026)

Nhánh `feature/studio-1`. Thiết kế `docs/superpowers/specs/2026-10-20-studio-design.md` (§3); kế hoạch `docs/superpowers/plans/2026-10-20-studio-1a-reading-skills.md`. **Không có AI** trong PR này. Chưa review Opus, chưa mở PR, chưa áp lên database thật.

### Đã thay đổi gì (nói đơn giản)

| Việc | Vì sao | Nằm ở |
|---|---|---|
| **Bộ nhãn "Kỹ năng đọc"** (tên song ngữ như báo cáo TOMO): Track B 14 kỹ năng, Track A 6. Nhãn chung cũ của An "Đọc hiểu (KET Reading)" **vẫn dùng** (xem "Đối chiếu") | Gia sư nhận ra ngay tên kỹ năng trong báo cáo TOMO; dùng được làm nhãn lỗi ở kết quả bài và ghi buổi học như mọi nhãn khác | `0018`, `content/tags/reading_A.json`, `reading_B.json` |
| **Nhập báo cáo kỹ năng đọc tháng** (gia sư hoặc phụ huynh của em): mỗi kỹ năng một dòng, hai ô "Số câu" và "% đúng"; để trống = tháng đó không có câu. Nhập lại cùng tháng = sửa (bản cũ vẫn giữ trong lịch sử) | Thay cho việc chép tay báo cáo TOMO; không lưu Lexile/CEFR | `0018` (bảng `reading_reports`), trang `/learners/<em>/reading/new`, thẻ của em → "Nhập kỹ năng đọc tháng" |
| **Bảng "Kỹ năng đọc" trên "Điểm cần chú ý"**: % đúng và số câu của báo cáo mới nhất, so với báo cáo trước cùng nguồn (tiêu đề cột ghi đúng tháng, vd "Tháng 10/2026" / "Tháng 09/2026"), và số câu sai 6 tuần gần đây (chỉ từ **bài kiểm tra và bài luyện**; dấu nhãn ở ghi buổi học không tính). Dưới 4 câu → "Chưa đủ dữ liệu" (không tô đỏ); từ 4 câu và dưới 60% → "Cần chú ý" | Tín hiệu để gia sư biết kỹ năng nào cần thêm bài | `0018` (`eng_reading_skills`), trang Điểm cần chú ý |
| **Ngưỡng nằm trong cài đặt**, không hard-code: `reading_min_questions = 4`, `reading_weak_pct = 60` | Đổi ngưỡng không cần sửa code | `0018`, bảng `tutorwork_settings` (chưa có màn đổi) |
| **Xóa dữ liệu một em** nay xóa cả báo cáo kỹ năng đọc và đếm chúng ở bước xem trước | Dữ liệu mới của em phải xóa được | `0018` (purge + preview) |

Báo cáo kỹ năng đọc là **tín hiệu, không phải bằng chứng**: engine S7 không đọc bảng này; em **không thấy** gì mới (chỉ gia sư và phụ huynh).

### SQL cần áp

- **`db/migrations/0018_reading_skills.sql`** — Actions → **Apply database migrations** (gõ APPLY) hoặc dán vào SQL Editor, **sau khi gộp PR**. Chỉ **thêm** (nhãn, 2 dòng cài đặt, 1 bảng mới, 2 hàm mới, thay hàm xóa dữ liệu + xem trước bằng bản có thêm một bảng); không đổi hay xóa dữ liệu cũ; chạy lại an toàn. **Áp `0018` TRƯỚC khi thử preview hoặc gộp PR** (`0018` chỉ thêm, tương thích ngược với `main`). Nếu code mới chạy khi `0018` chưa áp, trang Điểm cần chú ý vẫn mở được: phần "Kỹ năng đọc" hiện thông báo "chưa xem được" (lỗi được ghi vào `app_errors`), còn trang nhập báo cáo sẽ báo lỗi. Nên bấm chạy tay *Weekly backup* trước khi áp.

### Cách thử trên preview (gia đình thử)

1. Đăng nhập `thu-giasu-nguyen` → thẻ của Nguyên (thử) → **Nhập kỹ năng đọc tháng**: thấy 14 dòng; điền "Cause and Effect" 5 câu / 40%, "Chronology/Sequence" 1 câu / 0% → **Lưu báo cáo**. Trang **Điểm cần chú ý** hiện bảng "Kỹ năng đọc": Cause and Effect = "Cần chú ý", Chronology/Sequence = "Chưa đủ dữ liệu".
2. Đăng nhập `thu-phuhuynh`, mở lại trang nhập cùng tháng: số cũ đã điền sẵn, nút là **Lưu bản sửa**; đổi 40 thành 60 → bảng hiện "Ổn".
3. Đăng nhập `thu-giasu-an`: form của An có 6 kỹ năng; gõ thẳng địa chỉ trang nhập của Nguyên → "Không tìm thấy". Đăng nhập là em → cũng không vào được.

### Đối chiếu với plan — chỗ khác và vì sao

- **Học sinh gọi thẳng API ghi báo cáo của chính mình → 403**, không phải 404 như plan viết (`requireAccess` cho học sinh đọc hồ sơ của mình nên trả 403 khi thiếu quyền ghi). Trang giao diện thì vẫn 404 cho học sinh. Test handler sửa theo.
- **Nhãn chung cũ `A/doc-hieu` KHÔNG nghỉ dùng** (khác spec §3.1 và bản đầu của PR): `eng_tag_exists` từ chối nhãn đã nghỉ, nên một lần "hỏi lại" trong ghi buổi học, "Sửa kết quả" của kết quả nhanh cũ, hoặc khung đề mới dùng `doc-hieu` sẽ bị từ chối (400). Nhãn này vẫn hoạt động; sẽ cho nghỉ dùng ở một migration sau, khi các đường ấy chấp nhận nhãn đã nghỉ. Spec §3.1 đã sửa theo. (Test cũ của S5b để nguyên, trừ MỘT chỗ: test đếm "10 nhãn mỗi track" nay loại nhóm "Kỹ năng đọc" ra, vì `0018` gieo thêm nhãn nhóm đó.)
- **Review Opus — sửa thêm:** (S3) bảng `reading_reports` thu cả quyền INSERT của `service_role` như 0010/0014/0016 (có test); (S4) sửa một bản đã bị người khác thay trước → `23505 (stale_report)` → API 409 `stale_report` → "Báo cáo tháng này vừa được người khác sửa. Tải lại trang rồi sửa lại." (sai em/tháng/nguồn vẫn là `23514`); (S5) "Câu sai 6 tuần" chỉ đếm dấu nhãn từ `test`/`practice`; (S6) báo cáo "trước" là báo cáo hiện hành mới nhất, sớm hơn, **cùng nguồn** với báo cáo mới nhất, và tiêu đề cột ghi đúng tháng; (N1) `created_at` của nhãn gieo đặt tường minh theo thứ tự báo cáo, `loadReadingTags` thêm khóa phụ `key`; (N2) gieo nhãn dùng đích xung đột `(track_id, key)` (chỉ mục duy nhất của 0014; nhãn trùng tên sẽ báo lỗi thay vì bị bỏ qua lặng lẽ); (N4) gửi lại cùng `client_id` chỉ là "gửi lại" nếu cùng người ghi, người khác → `23505`; (N5) trang nhập kẹp `?month` trong 24 tháng gần đây và ô chọn tháng có `min`; (N7) cài đặt ngưỡng không phải số nguyên → dùng mặc định 4 / 60 thay vì lỗi cả trang.
- **Số câu = 0 trong form nghĩa là "không có câu"** (N3): dòng đó bị bỏ qua, không báo lỗi (quy tắc SQL/zod `questions >= 1` giữ nguyên, số 0 không bao giờ được gửi lên).
- **Bảng "Kỹ năng đọc" không làm hỏng cả trang** (S2b): nếu không đọc được (vd `0018` chưa áp) thì ghi lỗi vào `app_errors` và hiện thông báo thay cho bảng, trang Điểm cần chú ý vẫn mở.
- **Danh sách bảng trong `tests/db/migrations.test.ts`** (RLS bật ở mọi bảng; `authenticated` chỉ SELECT) thêm `reading_reports`; **danh sách nhãn đếm xóa trong `tests/unit/purge.test.ts`** thêm `reading_reports`. (Test đối chiếu khóa xem trước = khóa biên nhận trong `readiness.test.ts` tự theo hàm nên không phải sửa.)
- **Thêm một test xóa thật** (plan chỉ kiểm tra mã nguồn hàm): tạo em thử, ghi báo cáo + bản sửa (tự tham chiếu `supersedes_id`), xem trước = 2, xóa → biên nhận 2, còn 0 dòng.
- Commit của Task 2 để `lint` đỏ tạm vì file test DB khai báo sẵn các hàm trợ giúp mà Task 3 mới dùng; Task 3 làm xanh lại. Trạng thái cuối của nhánh xanh.

### Để sau

- Lexile/CEFR (chưa lưu); màn đổi ngưỡng `reading_min_questions` / `reading_weak_pct` (đổi bằng SQL); nhập báo cáo bằng ảnh; PR B (Studio: đề PDF/Word → bài trong app).

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database trên Postgres thật), `gen:config` xanh; CI (gồm E2E `tests/e2e/reading.spec.ts` và bước áp migration hai lần) xanh; review Opus; phụ huynh áp `0018` sau khi gộp rồi làm 3 bước thử ở trên.

## SM-1 — Bản đồ kỹ năng (21/10/2026)

Nhánh `feature/skill-map`. Thiết kế `docs/superpowers/specs/2026-10-21-skill-map-levels-design.md` (§2, §5–§8, phần SM-1); kế hoạch `docs/superpowers/plans/2026-10-21-sm1-skill-map.md`. Không AI; học sinh không thấy gì mới.

### Đã thay đổi gì (nói đơn giản)

| Việc | Vì sao | Nằm ở |
|---|---|---|
| **Bản đồ kỹ năng SM-1**: 7 mảng (Ngữ pháp · Từ vựng · Đọc · Nghe · Viết · Nói · Tư duy & tự học), 40 nhóm có mô tả ngắn theo cấp; đủ 40 nhãn và 70 kỹ năng danh mục, mỗi cái đúng 1 nhóm; cấp tham khảo; cấp giả định theo track (An A2 / bậc 1, Nguyên B2 / bậc 2 — chưa hiện, dùng ở SM-2) | Biết con yếu mảng nào; ô chọn không còn danh sách phẳng | `content/skill_map/SM-1.json`, `0019` |
| **Ô chọn nhãn và "Kỹ năng đã luyện hôm nay" theo tab 7 mảng**, có tiêu đề nhóm và ô tìm nhanh; "Đọc hiểu (KET Reading)" của An ẩn khỏi ô chọn (dữ liệu cũ vẫn hiện đúng tên) | Chọn nhanh, đúng chỗ | Ghi buổi học, Ghi kết quả bài, Chờ gắn nhãn, Giao bài luyện, nhãn bài viết |
| **Nhãn riêng bắt buộc chọn mảng + nhóm**; nhãn riêng cũ nằm ở "Chưa xếp mảng" với nút "Xếp vào nhóm" | Mọi nhãn mới vào đúng bản đồ (quyết định M3) | `0019` (`eng_add_error_tag_v2`, `eng_set_tag_group`) |
| **"Điểm cần chú ý" mở đầu bằng 7 ô mảng** (số điểm cần chú ý + điểm nặng nhất); bấm ô → bảng chi tiết của mảng; bảng "Kỹ năng đọc" nằm trong ô Đọc; "Xem tất cả" = bảng cũ | Trả lời "con yếu mảng nào" | trang Điểm cần chú ý |

Bản đồ đã công bố thì **không sửa được** (cơ sở dữ liệu chặn); muốn đổi = bản `SM-2`, phụ huynh duyệt.

### SQL cần áp

- **`db/migrations/0019_skill_map.sql`** — Actions → **Apply database migrations** (gõ APPLY) hoặc dán vào SQL Editor. **Áp `0019` TRƯỚC khi thử preview hoặc gộp PR** (chỉ thêm: 4 bảng cấu hình, 1 cột trống `error_tags.group_key`, 5 hàm mới (3 hàm server gọi, 1 hàm trợ giúp nội bộ, 1 hàm chặn sửa bản đồ đã công bố); hàm cũ `eng_add_error_tag` vẫn chạy → tương thích ngược với `main`). **Lưu ý giữa lúc áp `0019` và lúc gộp PR:** `main` (production) vẫn dùng hàm thêm nhãn cũ (v1), nên nhãn riêng thêm trong khoảng đó sẽ nằm ở "Chưa xếp mảng" và cần bấm "Xếp vào nhóm" sau khi gộp. Code mới cần `0019`: chưa áp thì các trang có ô chọn nhãn và trang Điểm cần chú ý sẽ báo lỗi. `0019` cần `0015` và `0018` đã áp (nó tự kiểm và dừng nếu thiếu nhãn). Chạy lại an toàn. Nên bấm chạy tay *Weekly backup* trước khi áp.

### Cách thử trên preview (gia đình thử)

1. Đăng nhập `thu-giasu-nguyen` → Nguyên (thử) → **Ghi buổi học**: "Kỹ năng đã luyện hôm nay" và "Điểm cần củng cố" có tab 7 mảng; bấm tab **Từ vựng** chọn "Dạng từ", tab **Nói** chọn "Phát âm" → dòng "Đang chọn" liệt kê cả hai.
2. Gõ một nhãn mới ("Đảo ngữ thử"): nút thêm chỉ bấm được sau khi chọn **Mảng = Ngữ pháp, Nhóm = Nhấn mạnh & đảo ngữ**; nhãn hiện ở tab Ngữ pháp và đã được tích.
3. **Điểm cần chú ý**: thấy 7 ô + "Xem tất cả"; bấm ô **Từ vựng** → chỉ các điểm từ vựng; bấm ô **Đọc** → thấy bảng "Kỹ năng đọc".
4. Đăng nhập `thu-giasu-an` → An (thử) → **Ghi kết quả bài** → Nhập nhanh, một câu sai: ô chọn nhãn chia theo "Mảng · Nhóm", không có "Đọc hiểu (KET Reading)".

### Đối chiếu với spec — chỗ khác và vì sao

- **Cấp của mảng Tư duy & tự học** lưu bằng `task_from` / `task_to` (bậc 1–4), không phải một số `task_level`: kỹ năng `B-T5-SUPPORT` trải 2 bậc (TL3–TL4).
- **Kỹ năng L7** (nằm ở Tư duy & tự học) chưa có bậc nhiệm vụ, **kỹ năng T1/T2** (ở Đọc / Nghe) chưa có cấp CEFR: danh mục 0.2.1 chỉ ghi thang còn lại; điền ở nội dung v0.3.
- **"Hay dùng lên đầu" chưa làm**: app chưa đếm số lần dùng nhãn; làm cùng bộ lọc ± 1 cấp ở SM-2.
- **SM-1 không vào `config.lock.json` / `gen:config`**: khóa bằng `skill_maps.source_hash` + test so JSON nhúng trong `0019` với file; sửa file sau khi áp → test đỏ → phải làm SM-2.
- **Thêm dòng "Đang chọn: …"** phía trên các tab (một nhãn đã chọn có thể nằm ở tab khác).
- **Điểm cần chú ý**: 7 ô luôn hiện; bảng chi tiết hiện dưới ô đang mở; thêm ô "Xem tất cả" = bảng đầy đủ như trước.

### Để sau (SM-2 / nội dung v0.3)

Lọc ô chọn theo cấp hiện tại ± 1; "hay dùng" lên đầu; Hồ sơ cấp + sổ quyết định cấp + mốc thi ngoài; điểm cốt lõi (`core`) theo cấp; cấp CEFR cho kỹ năng L7 và bậc nhiệm vụ cho T1/T2.

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database), `gen:config` xanh; CI (gồm E2E và bước áp migration hai lần) xanh; review Opus; gia sư rà `SM-1.json` (bảng xếp 46 kỹ năng trong kế hoạch); phụ huynh áp `0019` rồi làm 4 bước thử ở trên.

### Điều chỉnh của phụ huynh 22/10/2026 (làm cùng nhánh, sau khi duyệt mockup)

- **Giao diện luôn sáng** (kể cả máy Windows/điện thoại đặt chế độ tối, kể cả trình duyệt tự làm tối trang): `colorScheme: "only light"` trong viewport + `color-scheme: only light` ở `:root` + ô nhập/chọn nền trắng. Có test `tests/unit/lightOnly.test.ts` (cấm `dark:` / `prefers-color-scheme: dark` trong `app/`, `components/`) và một test E2E "login page stays light" trong `tests/e2e/login.spec.ts`.
- **Không chữ "TOMO" trong giao diện**: lời dẫn của màn "Nhập kỹ năng đọc tháng" chỉ nói "báo cáo đọc trong tháng"; giá trị `reading_reports.source = 'TOMO'` vẫn là dữ liệu (không đổi, không migration). Test `tests/unit/copyNoProvider.test.ts` giữ cho `lib/copy/vi.ts` và các file `.tsx` không chứa chữ này. Lý do: phụ huynh dự định cho gia sư giao bài và AI chấm theo các tiêu chí này, nên giao diện không gắn với một nhà cung cấp. Danh sách kỹ năng đọc (14 / 6) giữ nguyên.

## SM-2 — Hồ sơ cấp đang học (22/10/2026)

Nhánh `feature/sm2-level-profile` (dựa trên `feature/skill-map`). Thiết kế `docs/superpowers/specs/2026-10-21-skill-map-levels-design.md` (P2-a..P2-d, P4-c, §3, §5–§6 phần SM-2); kế hoạch `docs/superpowers/plans/2026-10-22-sm2-level-profile.md`; mockup "10 · Hồ sơ cấp" phụ huynh duyệt 22/10. Không AI.

### Đã thay đổi gì (nói đơn giản)

| Việc | Vì sao | Nằm ở |
|---|---|---|
| **Hồ sơ cấp** của mỗi em: "{tên} đang ở đâu?" + 1 câu tóm tắt + 3 ô Mạnh nhất / Cần tập trung / Đang chờ thầy/cô; 7 thanh cấp (6 mảng chung thang A1→C2, mảng Tư duy thang riêng bậc 1→4); thanh **ước lượng** có sọc + chữ "Ước lượng — thầy/cô chưa xác nhận"; bấm một mảng → chi tiết (nội dung ở cấp đó, điểm cần chú ý của mảng); "Mốc ngoài & lịch sử" | Phụ huynh thấy 7 dòng cấp đang học, biết dòng nào giả định, dòng nào thầy/cô đã xác nhận | trang `/learners/…/levels`, link "Hồ sơ cấp" trên thẻ của em |
| **Sổ quyết định cấp** (`level_decisions`, chỉ thêm): thầy/cô **xác nhận cấp khởi điểm** (7 mảng một lần) hoặc **điều chỉnh** một mảng (bắt buộc lý do, lên hoặc xuống). Chỉ **gia sư của em** ghi được — cơ sở dữ liệu chặn phụ huynh. "Lên cấp" để dành cho S7 | P2-a, P2-c, Q3 | `0020` |
| **Mốc thi ngoài** (`external_results`, chỉ thêm): KET / PET / FCE / CAE / CPE / đề thử vào 10 / bài thi ở trường / khác, ngày, điểm, mảng liên quan, ảnh hoặc PDF phiếu điểm (kho riêng tư). **Không tự đổi cấp.** Nhập nhầm thì bấm **Sửa**: lưu một dòng mới thay dòng cũ (dòng cũ không bị xóa, hiện kèm "Đã sửa — trước đó: …") | Đối chiếu với cấp trong app | `0020`, "+ Thêm kết quả thi ngoài", nút "Sửa" |
| **Ô chọn nhãn**: nhãn quanh cấp đang học (± 1 cấp) lên trước; cấp khác nằm trong "Cấp khác (n)" thu gọn | P4-c | Ghi buổi học, Ghi kết quả bài, Giao bài, nhãn bài viết |
| **Trang chủ phụ huynh**: ô "Thay đổi cấp gần đây" (30 ngày, tối đa 5 dòng, kèm lý do; điều chỉnh lên trước; xác nhận cấp khởi điểm cùng ngày gộp một dòng) | Phụ huynh được báo khi thầy/cô điều chỉnh | trang chủ |
| **Trang chủ của em**: "Việc cần ôn" theo mảng — tối đa 3 điểm đã đến hạn hỏi lại, **không cấp, không điểm** | P2-d | trang chủ của em |

Học sinh không đọc được hai sổ mới (cơ sở dữ liệu chặn). Báo cáo kỹ năng đọc tháng hiện trong "Mốc ngoài" là "Báo cáo kỹ năng đọc tháng 10/2026 · Đọc", không ghi tên nguồn. Xóa dữ liệu một em xóa luôn hai sổ mới và file phiếu điểm.

### SQL cần áp

- **`db/migrations/0020_level_profile.sql`** — Actions → **Apply database migrations** (gõ APPLY) hoặc dán vào SQL Editor. **Áp `0020` TRƯỚC khi thử preview hoặc gộp PR**; cần `0019` đã áp. Chỉ thêm: 2 bảng mới, nới danh sách loại file (thêm `external_result`), 6 hàm mới (5 hàm server gọi + 1 hàm của em: danh sách "Việc cần ôn"), bản mới của hàm xóa dữ liệu một em (giữ nguyên mọi dòng cũ). Chạy lại an toàn. Nên bấm chạy tay *Weekly backup* trước khi áp. Chưa áp thì trang Hồ sơ cấp báo lỗi; ô chọn nhãn và trang chủ vẫn chạy (chỉ không sắp theo cấp / không có ô mới).

### Cách thử trên preview (gia đình thử)

1. `thu-giasu-nguyen` → thẻ Nguyên (thử) → **Hồ sơ cấp**: 7 thanh đều có sọc "Ước lượng — thầy/cô chưa xác nhận"; 3 ô ghi "Các mảng đang ngang nhau" và "Không có".
2. Bấm **Xác nhận cấp khởi điểm** (7 mảng đã điền sẵn) → đổi Ngữ pháp thành B2+ → Lưu: cả 7 thanh hết sọc; ô "Mạnh nhất" = Ngữ pháp · B2+. Mọi chữ về người dạy là "thầy/cô" (chữ này đặt một chỗ trong `lib/copy/vi.ts`).
3. Mở mảng Ngữ pháp → **Điều chỉnh cấp** → B2, lý do "thử" → Lưu: "Lịch sử cấp" có thêm dòng "Ngữ pháp: B2+ → B2 · Điều chỉnh" kèm lý do.
4. Đăng nhập phụ huynh → trang chủ có ô **Thay đổi cấp gần đây** (dòng "Điều chỉnh" có lý do ở trên cùng) → mở Hồ sơ cấp → **+ Thêm kết quả thi ngoài** (FCE, 172, mảng Đọc + Nghe, kèm ảnh) → thấy trong "Mốc ngoài" → bấm **Sửa**, đổi điểm → chỉ còn điểm mới, dòng cũ nằm trong "Đã sửa — trước đó: …". Phụ huynh không có nút Xác nhận / Điều chỉnh.
5. `thu-giasu-nguyen` → **Ghi buổi học**: tab Từ vựng — nhãn quanh B2 hiện trước, phần "Cấp khác" thu gọn.
6. Đăng nhập `thu-nguyen` (em): trang chủ không có chữ cấp nào; nếu có điểm đến hạn hỏi lại thì thấy "Việc cần ôn" theo mảng.

### Phụ huynh đã duyệt kế hoạch 22/10/2026 ("ok SM-2"), có hai thay đổi

- **A1 (thay D13):** mọi chữ về người dạy là "thầy/cô" lấy từ `tutorHonorific` ("Đang chờ thầy/cô", "Ước lượng — thầy/cô chưa xác nhận", "Thầy/cô xác nhận ngày …"). Lý do: tài khoản gia sư là chung, người dạy có thể đổi, chữ "cô" cứng có thể sai. Có test quét: không câu nào của Hồ sơ cấp chứa chữ "cô" đứng riêng.
- **A2 (thay D9):** kết quả thi ngoài **sửa được bằng dòng mới thay dòng cũ** (cột `supersedes_id`, mỗi dòng bị thay tối đa một lần, dòng cũ không bị xóa/sửa; hàm ghi nhận `p_supersedes`; ghi nhật ký `external_result.corrected`). Hồ sơ cấp chỉ liệt kê dòng còn hiệu lực, dòng thay thế hiện "Đã sửa — trước đó: …" kèm phiếu điểm cũ. Xóa dữ liệu một em đếm và xóa cả hai dòng.

### Quyết định trong kế hoạch (phụ huynh xem lại)

D1 "± 1 cấp" = ± 1 bậc CEFR lớn (A2 → A1…B1+) · D2 chỉ áp cho ô chọn nhãn · D3 ba ô "Đã vững / Đang luyện / Để lên cấp tiếp" ghi "Sẽ có khi app bắt đầu theo dõi trạng thái từng kỹ năng" tới S7 · D4 Mạnh nhất / Cần tập trung chỉ so 6 mảng ngôn ngữ · D5 thanh Tư duy thang riêng · D6 xác nhận một lần mỗi mảng, sau đó chỉ "Điều chỉnh" · D7 bằng chứng do cơ sở dữ liệu tự ghi · D8 chỉ gia sư quyết cấp · D9 (đã đổi 22/10 → A2) mốc ngoài sửa bằng dòng mới thay dòng cũ, không xóa · D10 báo cáo đọc không ghi nguồn · D11 30 ngày, 5 dòng · D12 em thấy tối đa 3 điểm · D13 (đã đổi 22/10 → A1) chữ về người dạy là "thầy/cô" lấy từ `tutorHonorific`, không viết cứng "cô" · D14 chi tiết mảng dùng mô tả nhóm của SM-1 · D15 ai mở trang nào. Chi tiết: bảng "Decisions" và mục "Amendments" trong kế hoạch.

### Phụ huynh đã trả lời 22/10/2026 (không còn câu hỏi mở)

1. Ô "Thay đổi cấp gần đây" **không cần** nút "Đã xem" (giữ: 30 ngày, tối đa 5 dòng; "Điều chỉnh" / "Lên cấp" luôn lên trước; các dòng "xác nhận cấp khởi điểm" của một thầy/cô cho một em trong cùng một ngày gộp thành MỘT dòng, vd. "Nguyên · Thầy/cô xác nhận cấp khởi điểm (7 mảng)").
2. Chưa cần **rút hẳn** một kết quả thi ngoài (không thay bằng bản khác); Claude khuyên chỉ dùng "Sửa". Ghi vào "Để sau".

### Để sau (SM-2)

- Rút hẳn một kết quả thi ngoài (không có bản thay). Chỉ làm nếu thực tế cần.

### Ghi chú khi làm

- Nhánh `feature/skill-map` đã có thêm các commit sửa sau review (nút Tab theo ARIA, `domainOfAdded`…), nên phần ô chọn nhãn (Task 8) được ghép tay vào nội dung hiện tại; các test của Task 8 là hợp đồng.
- Hàm `eng_record_external_result` có thêm tham số cuối `p_supersedes uuid default null` (chữ ký 10 tham số).
- Sau review Opus: sửa kết quả mà **không chọn ảnh mới thì vẫn dùng phiếu điểm cũ** (hồ sơ đi ngược chuỗi sửa lấy phiếu gần nhất, cờ `file_inherited`); màn "Sửa" tìm dòng theo id bằng `eng_external_result` (không giới hạn 30 dòng; không thấy → chữ trung tính "Không tìm thấy…"); ba form lưu cấp / kết quả lấy mã lưu mới sau lỗi 409 và nối chữ gợi ý / lỗi với ô nhập bằng `aria-describedby`; chip nhãn chia gần / xa theo lúc mở màn hình (chip vừa chọn không nhảy mục).

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database: ma trận vai, chỉ thêm, xóa dữ liệu, học sinh bị chặn), `gen:config` xanh; CI (E2E + áp migration hai lần) xanh; review Opus; phụ huynh áp `0020` rồi làm 6 bước thử ở trên; buổi 30 phút: gia sư xác nhận cấp khởi điểm cho cả hai em.

## S6 — Góp ý cho con + Sửa bài (trước–sau) (22/10/2026)

Nhánh `feature/s6-feedback-revision` (dựa trên `feature/sm2-level-profile`). Thiết kế `docs/superpowers/specs/2026-10-22-s6-feedback-revision-design.md` (duyệt từng phần 22/10); kế hoạch `docs/superpowers/plans/2026-10-22-s6-feedback-revision.md`; 3 mockup (thầy/cô góp ý · con sửa bài · trước–sau) phụ huynh duyệt trước khi làm giao diện. Không AI.

### Đã thay đổi gì (nói đơn giản)

| Việc | Vì sao | Nằm ở |
|---|---|---|
| **Góp ý cho con** ở màn duyệt bài viết: 1 câu khen (bắt buộc) + 1–3 góp ý (trích đoạn trong bài, gắn kỹ năng — tùy chọn), "Yêu cầu con sửa bài" hoặc "Chỉ góp ý". Câu có dạng điểm bị từ chối: phân số kiểu điểm "3/4", "7 / 10" (mẫu số 1–10, tử ≤ mẫu; không tính ngày như "hôm 5/10" và "1/2 trang"), con số sát "điểm" / "đ" ("6 điểm", "8đ"), "8 trên 10", dấu % sau con số ("80%") và các nhãn thang 0–4 ("Đạt yêu cầu"); "điểm mạnh", "22/10", "12/20" thì được (phụ huynh thu hẹp luật 22/10 — G2; cách chốt chi tiết: Claude đề xuất, phụ huynh xem lại). **Sửa góp ý** được cho tới khi con bắt đầu sửa | Q1, 1-a, 1-b, 1-c | Hộp duyệt → mở một bài viết |
| **Bước sửa**: dùng bước "Sửa bài" của chủ đề nếu là bước sửa kế tiếp, không thì app thêm bước sửa riêng ("Bước sửa bài") | PA | `0021` |
| **Con sửa bài**: dòng "Sửa bài: … · n góp ý của thầy/cô" nằm trên Việc tiếp theo; màn sửa có câu khen, góp ý đánh số, chỗ cần sửa được tô trong bài cũ, ô viết đã điền bài cũ (tự lưu), "Xem bài cũ", mỗi góp ý chọn **Đã sửa / Giữ nguyên** (Track B bắt buộc 1 câu lý do — cài đặt theo track) | Q2, Q3 | trang chủ và màn sửa của con |
| **Bài sửa lại (vòng n)** trong Hộp duyệt: bài cũ – bài sửa cạnh nhau (chữ bỏ gạch, chữ thêm tô), đánh giá **bắt buộc** từng góp ý, điểm "Sửa bài" và điểm kỹ năng ngôn ngữ **tùy chọn** (luôn ghi là "có góp ý"), nhận xét kết, **Xong** hoặc **Mở vòng 2** (tối đa 2 vòng) | 2-a, 3-a, 3-b | Hộp duyệt |
| Con thấy **"Thầy/cô đã xem bài sửa của bạn"** + nhận xét kết; **không bao giờ thấy điểm** hay đánh giá | 2-c | trang chủ của con |
| **Bài đã sửa** trên thẻ của mỗi con: danh sách cặp trước–sau, mở ra xem (chỉ xem) | 3-c | `/learners/…/revisions` |

Bài sửa **không bao giờ** là "lần đầu" và luôn nối với bài gốc (cơ sở dữ liệu ép). Xóa dữ liệu một em xóa luôn 3 sổ mới.

### SQL cần áp

- **`db/migrations/0021_feedback_revision.sql`** — Actions → **Apply database migrations** (gõ APPLY) hoặc dán vào SQL Editor. **Áp `0021` TRƯỚC khi thử preview hoặc gộp PR**; cần `0019` + `0020` đã áp. Chỉ thêm: 1 cột (`attempts.revises_attempt_id`), 1 bảng cài đặt theo track, 3 sổ mới, các hàm mới, bản mới của 3 hàm Hộp duyệt (giữ nguyên luật cũ cho bài thường) và của hàm xóa dữ liệu một em (giữ nguyên mọi dòng cũ). Chạy lại an toàn. Nên bấm chạy tay *Weekly backup* trước khi áp. Chưa áp thì khung "Góp ý cho con" và các dòng "Sửa bài" chỉ không hiện; phần còn lại vẫn chạy.

### Cách thử trên preview (gia đình thử)

1. `thu-an` (em) → mở bài viết tuần 4 (Sao Kim – Sao Hỏa, bước luyện viết) → viết vài câu → Nộp.
2. `thu-giasu-an` → Hộp duyệt → mở bài vừa nộp → khung **Góp ý cho con**: gõ câu khen "Bài được 3/4" → thấy lời nhắc không ghi điểm; sửa câu khen; góp ý 1 + bôi đen một đoạn trong bài → "Lấy đoạn đang chọn" → **Gửi góp ý cho con**. Bấm **Sửa góp ý**, đổi chữ, lưu.
3. `thu-an` → trang chủ: dòng **Sửa bài** ở trên Việc tiếp theo → mở: đoạn được tô, ô viết có sẵn bài cũ → sửa, chọn **Đã sửa**, khai báo "Mình không dùng gợi ý nào" → **Nộp bài sửa**.
4. `thu-giasu-an` → Hộp duyệt: **Bài sửa lại (vòng 1)** → thấy chữ bỏ gạch / chữ thêm tô → bấm **Cải thiện thật** → (tùy chọn) chấm "Sửa bài" → nhận xét kết → **Xong**.
5. `thu-an` → trang chủ: **"Thầy/cô đã xem bài sửa của bạn"** + nhận xét; không có điểm nào.
6. Phụ huynh → thẻ An (thử) → **Bài đã sửa** → mở cặp trước–sau (chỉ xem).

### Quyết định trong kế hoạch (phụ huynh xem lại)

D1 bước "Sửa bài" của chủ đề = bước sửa đầu tiên sau bài, không có bước viết nào xen giữa · D2 bước đó mở ngay hôm nay · D3 bước sửa riêng số 1001+ · D4 điểm "Sửa bài" (A3) ghi trên bài sửa, không vào mẫu số độ phủ · D5 bài sửa luôn là "có góp ý" · D6 số lần / gia đình học tập của bài sửa · D7 vòng 2 cùng bước sửa · D8 chỉ bài viết làm trong app · D9 góp ý và chấm độc lập · D10 "Chỉ góp ý" hiện 14 ngày ở trang chủ con · D11 đánh giá + Xong/Vòng 2 lưu một lần · D12 "đã xem" hiện 14 ngày · D13 giữ khai báo trợ giúp khi nộp bài sửa · D14 bài sửa của bài kiểm tra trong buổi: chỉ gia sư (duyệt, chấm, gắn nhãn và màn xem bài — review 22/10 làm trọn) · D15 Hộp duyệt: bài sửa xong khi bấm Xong / Mở vòng 2 · D16 kỹ năng gắn là lá của bản đồ · D17 trang "Bài đã sửa" · D18 không kiểm "điểm" trong trích đoạn / lý do của con · D19 bảng cài đặt theo track · D20 màn sửa nằm ở link bước cũ. Chi tiết: bảng "Decisions" trong kế hoạch.

### Phụ huynh đã trả lời 22/10/2026 ("ok G1–G4, ok mockup S6"; không còn câu hỏi mở)

1. **"Ngay sau" (G1) → như D1:** bước "Sửa bài" của chủ đề được dùng khi là bước sửa đầu tiên sau bài, không có bước viết (`ACT-WRITE`) nào xen giữa; bước tự xem lại ở giữa không chặn. Bản đọc đúng từng chữ ("bước kế tiếp") chỉ để làm chú thích trong `eng_open_revision_step`, không bật.
2. **Chữ "điểm" (G2) → thu hẹp luật.** Nguyên tắc của phụ huynh: em không bao giờ thấy điểm; chữ của người lớn (câu khen, góp ý, nhận xét kết) không được có dạng điểm. *Cách chốt chi tiết dưới đây là **Claude đề xuất, phụ huynh xem lại** (review 22/10 phát hiện bản trước tự mâu thuẫn ở "1/2 trang").* Từ chối đúng năm loại: (1) phân số `a/b` (cho khoảng trắng quanh "/") với `b` là số nguyên 1–10 và `0 ≤ a ≤ b` ("3/4", "7 / 10", "1/2") — **trừ** khi đứng ngay sau (chỉ cách khoảng trắng) một chữ ngày (`ngày|hôm|từ|đến|tới|trước|sau|hạn|tháng`, vd. "hôm 5/10"), hoặc theo sau là "/số" nữa (ngày đầy đủ "1/10/2026"), hoặc theo sau là chữ "trang" ("1/2 trang"); "22/10", "12/20" thì được vì tử > mẫu; (2) con số đi sát chữ "điểm", "diem" hoặc "đ" (cách nhau tối đa một chữ, hai thứ tự): "8đ", "8 đ", "6 điểm", "điểm 7", "8 diem" — "điểm mạnh", "điểm cần chú ý", "điểm yếu" thì được; (3) "N trên M" với M 1–10 ("8 trên 10"); (4) dấu % sau con số ("80%"); (5) đúng năm nhãn thang 0–4 của UX guide §3.1, không phân biệt hoa thường ("Đạt yêu cầu", "Chưa thể hiện"…). Khoảng trắng lạ (NBSP, U+202F, U+3000) được đổi thành khoảng trắng thường trước khi so. Không bao giờ áp cho chữ của em. Cơ sở dữ liệu (`eng_has_score_words`) và app (`hasScoreWords`) dùng chung danh sách mẫu hai chiều `tests/unit/fixtures/scoreWords.ts`. Đánh đổi cần phụ huynh biết: câu tự nhiên như "con làm được một phần" hay "chưa thể hiện rõ" cũng bị từ chối (trùng nhãn thang). Lời nhắc khi bị từ chối: "Góp ý cho con không ghi điểm (như “3/4”, “6 điểm”, “80%”). Bạn viết lại bằng lời nhé."
3. **"Bài viết giao lẻ" (G3) → chấp nhận.** S6 chỉ gắn vào bước viết của các chủ đề. Bài viết giao lẻ chưa có trong app; khi có sẽ dùng lại luồng này (xem "Để sau").
4. **"Chỉ góp ý" (G4) → như D10:** hiện ở ô "Góp ý của thầy/cô" trên trang chủ con 14 ngày, **và** ở trang của chính bài đó (`/activities/[id]`) chừng nào bài còn thấy được (hàm mới `eng_my_activity_note`, em chỉ đọc câu khen + góp ý + trích đoạn).
5. **3 mockup (bảng 15–17) → duyệt.**

### Để sau (S6)

- Bài viết giao lẻ (G3): khi có, gắn vào đúng luồng góp ý → sửa bài này (Studio PR B / giao bài lẻ).
- Cách nới tiếp luật chữ "điểm" nếu thực tế vẫn từ chối nhầm: "điểm mạnh 1" hay "câu 2 có điểm mạnh" (số + một chữ + "điểm") hiện bị từ chối vì luật cho phép cách nhau một chữ.
- Điểm "Sửa bài" (A3) của Track B chỉ thấy ở bài sửa và ở "Bài đã sửa": muốn liệt kê vào mục theo dõi riêng cần bộ B-v2 (B-v1 đã khóa).

### Sửa theo review Opus (22/10, cùng nhánh)

- **B1:** dòng ``` thừa làm hiện ký tự lạ trên mỗi dòng Hộp duyệt — đã bỏ; thêm test dựng trang Hộp duyệt (không dòng nào có dấu nháy ngược) và quét mọi `.tsx` tìm dòng chỉ có dấu ngược.
- **S1 (D14 trọn):** `0021` viết lại `eng_tag_episode` (bản 0014) và `eng_review_episode` (bản 0010) để dùng `eng_episode_restricted`: phụ huynh không gắn nhãn được cho bài sửa của bài kiểm tra trong buổi (42501), màn xem bài báo `restricted`.
- **S2:** sửa góp ý khóa bước sửa trước khi kiểm tra "con đã bắt đầu"; nộp bài sửa gửi `feedback_id` (góp ý cũ → "Thầy/cô vừa sửa góp ý — tải lại trang để xem bản mới."); Xong / Mở vòng 2 / trước–sau lấy góp ý theo đánh dấu của bài sửa.
- **S3/N2:** luật chữ "điểm" chốt lại (xem câu 2 ở trên) — **Claude đề xuất, phụ huynh xem lại**.
- **S4:** kiểm tra "không điểm / không verdict" của e2e dời vào bộ S6 (trang sửa bài ở trạng thái làm và đã xem, ô ở trang chủ), không còn nhánh `if (status === 200)` có thể pass rỗng.
- **S5:** dòng "Sửa bài" biến mất khi bước bị bỏ hoặc dời sang ngày sau; bài ghi ngoài app trên bước sửa đóng việc sửa của em (chọn cách này thay vì từ chối ghi, vì gia sư có thể thật sự ghi bài sửa trên giấy). Hộp duyệt / khung góp ý của người lớn không đổi.
- **N3:** so khác theo NFC + nháy thẳng; cột "Bài cũ" giữ khoảng trắng / xuống dòng của bài cũ. **N4:** dán chữ chỉ nhận ở ô viết chính. **N5:** nhóm nút và nhãn lý do ghi rõ "Góp ý n". **N6:** bước sửa của mẫu đã có bài sửa tính là xong trong "Xong x/y bước"; dòng bài sửa trong Hộp duyệt không còn "Đã chấm 0/n kỹ năng".
- **N7:** khi chưa áp `0021`, thẻ của em không hiện link "Bài đã sửa" và trang `/learners/[id]/revisions` báo nhẹ "chưa sẵn sàng" thay vì lỗi. Việc **áp `0021` trước khi thử preview hoặc gộp** vẫn là bước bắt buộc; các màn khác của S6 (Hộp duyệt, trang chủ của em) cũng cần `0021` nên chỉ phần "Bài đã sửa" được che như trên.

### Ghi chú khi làm

- `0021` có thêm hàm `eng_my_activity_note(p_activity)` (G4) — cùng kiểu với `eng_my_review_by_domain`: chỉ `authenticated`, tìm em bằng `auth.uid()`.
- Test database: `TRUNCATE feedback_notes` bị Postgres chặn trước (mã `0A000`) vì bảng khác trỏ tới nó; `DELETE` trên bảng rỗng không kích hoạt trigger — hai chỗ chỉnh nhỏ trong test của kế hoạch. Test "Track B cần lý do" dùng một chủ đề B-W1 mới vì bước 7 của chủ đề cũ là bài kiểm tra một lần.
- Màn Hộp duyệt ghi "Bước sửa bài" thay vì "Bước 1001" cho bước sửa riêng của app.

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database: ma trận vai, học sinh không thấy điểm, vòng 1–2 và chặn vòng 3, thời hạn sửa góp ý, bài sửa không bao giờ là lần đầu, xóa dữ liệu), `gen:config` xanh; CI (E2E + áp migration hai lần) xanh; review Opus; phụ huynh áp `0021` rồi làm 6 bước thử ở trên; gia sư gửi được góp ý cho một bài trong ≤ 2 phút.

## S7a — Trạng thái từng kỹ năng (23/10/2026)

App bắt đầu **tự tính bậc từng kỹ năng** từ bài đã duyệt. Bậc 1–2 app tự cập nhật; bậc 3–4 app chỉ **đề xuất**, thầy/cô của em bấm **Xác nhận** hoặc **Chưa** (bắt buộc lý do). Không bao giờ tự hạ bậc: bài gần đây kém hơn thì hiện ⚑ "Cần thầy/cô xem lại". Học sinh không thấy gì mới.

### Phụ huynh / gia sư làm được gì bây giờ

| Việc | Ở đâu |
|---|---|
| Xem đề xuất lên bậc "Tự làm được" / "Vận dụng được" và kỹ năng có ⚑; mở "Xem điều kiện" và từng bài làm được tính | Hộp duyệt → tab **Kỹ năng** |
| Thầy/cô: **Xác nhận** / **Chưa** (lý do) / **Xác nhận tất cả (n)**; với ⚑: **Giữ bậc** / **Sửa bậc** | Hộp duyệt → tab Kỹ năng |
| Thầy/cô tick **"Bài này ở chủ đề / nguồn mới (vận dụng)"** trên bài của em (lần làm đầu) để bậc 4 có thể xảy ra. **Chỉ thầy/cô của em**: phụ huynh không thấy ô này. Bước mà mẫu chủ đề đã đánh dấu là bài chủ đề mới thì ô hiện sẵn tick và không sửa được | Trang duyệt một bài |
| Thang 4 ô có chữ cho 12 kỹ năng, ⚑, "Đang chờ xác nhận: …", "App tự cập nhật"; thầy/cô **Sửa tay bậc 1–2** (lý do); **Tính lại từ đầu** (thầy/cô hoặc phụ huynh) | Kỹ năng đang theo dõi |
| "Đã vững · n/N điểm đã vững", "Đang luyện", "Để lên cấp tiếp, còn cần" theo từng mảng | Hồ sơ cấp |

Phụ huynh xem được hết nhưng **không** xác nhận bậc 3–4 (chỉ thầy/cô của em).

### SQL cần áp (đúng thứ tự)

1. **`db/migrations/0022_seed_ap_0_3.sql`** — ngưỡng AP-0.3 (sinh tự động bằng `gen:config`).
2. **`db/migrations/0023_skill_states.sql`** — sổ quyết định + trạng thái + dấu "chủ đề mới" + các hàm + bản mới của hàm xóa dữ liệu một em (giữ mọi dòng cũ) + luật chữ "điểm" thu hẹp (sửa đổi A).

Actions → **Apply database migrations** (gõ APPLY) hoặc dán vào SQL Editor. **Áp cả hai TRƯỚC khi thử preview hoặc gộp PR**; cần `0019`–`0021` đã áp. Chỉ thêm; chạy lại an toàn. Nên bấm chạy tay *Weekly backup* trước. Chưa áp thì tab Kỹ năng báo "chưa sẵn sàng", các trang khác như cũ. Migration kế tiếp: **0024**.

### Cách thử trên preview (gia đình thử)

1. `thu-giasu-an` → Hộp duyệt → mở bài viết của An (thử) → chấm `Viết "vì sao – nên"` 3/4 → lưu.
2. Vẫn tài khoản đó → thẻ An (thử) → **Kỹ năng đang theo dõi**: kỹ năng đó có ít nhất 1 ô tô và dòng "App tự cập nhật".
3. Bấm **Tính lại từ đầu** → thấy "Đã tính lại. Không có đề xuất mới." (bấm lại bao nhiêu lần cũng không tạo trùng).
4. **Sửa tay bậc 1–2** → chọn bậc, để trống lý do → thấy lời nhắc; ghi lý do → lưu → thang đổi **và giữ nguyên** (kể cả sau khi bấm Tính lại từ đầu) cho tới khi em có bài mới được duyệt (B2).
5. Phụ huynh → Hộp duyệt → tab **Kỹ năng**: thấy "Phụ huynh xem; chỉ thầy/cô của em xác nhận."; không có nút Xác nhận.
6. `thu-an` → trang chủ: không có thang, bậc, ⚑ hay chữ "Đang chờ xác nhận".
7. Thầy/cô → mở một bài làm lần đầu → thấy ô "Bài này ở chủ đề / nguồn mới (vận dụng)"; tick rồi bỏ tick đều lưu được. Phụ huynh mở cùng bài → không có ô này (S1).

Đề xuất lên "Tự làm được" cần ≥ 3 bài tự làm lần đầu ở ≥ 2 chủ đề trải ≥ 7 ngày, nên trên preview mới chưa thấy; CI kiểm luồng đó với một em thử có bài lùi ngày (e2e "S7a skill states").

### Sửa đổi A (luật chữ "điểm", phụ huynh duyệt trong spec 23/10)

Góp ý cho con giờ chỉ từ chối **hai** nhãn trên của thang 0–4: "Đạt yêu cầu", "Vững, rõ ràng". "Chưa thể hiện", "Còn thiếu nhiều", "Được một phần" là chữ thường lại ("con làm được một phần" được phép). Bốn loại kia (phân số kiểu điểm, "6 điểm", "8 trên 10", "80%") giữ nguyên.

### Phụ huynh đã trả lời (23/10/2026: "ok mockup S7a", rồi "ok r" cho G1–G4 và D4–D12)

Mockup board 18 (Hộp duyệt → tab Kỹ năng) được duyệt. D4, D5, D6, D8, D9, D10, D12 (mục §17) xác nhận đúng như kế hoạch.

| # | Quyết định | Đã làm |
|---|---|---|
| G1 | Giữ nguyên: bậc 2 cần lần làm đầu, không gợi ý, ≥ 3/4 (`developing.minScore = 3`); 2/4 không gợi ý ở bậc 1 | AP-0.3 |
| G2 | **Đổi:** câu tự chấm trong app có thể đưa kỹ năng lên **bậc 2** trước khi đủ cách 2: ≥ 4 câu được tính (D9) đúng ≥ 75 % → bậc 2 (AUTO); ít câu hơn hoặc thấp hơn nhưng có ≥ 1 câu đúng → bậc 1. Chỉ mảng Đọc / Nghe / Ngữ pháp / Từ vựng. Bậc 3 vẫn cần cách 1 hoặc cách 2. | AP-0.3 `receptiveAuto.developingMinItems = 4`, `developingMinAccuracyPct = 75` (0022 sinh lại trước khi commit); engine + test hai biên (3 vs 4 câu; 74 % vs 75 %) |
| G3 | Giữ nguyên: ⚑ có **Giữ bậc** và **Sửa bậc**; "Sửa bậc" (form sửa tay) hạ được, cần lý do, chỉ thầy/cô của em; app không bao giờ tự hạ | form sửa tay |
| G4 | **Đổi:** thầy/cô tick "Bài này ở chủ đề / nguồn mới (vận dụng)" trên trang duyệt bài (`/review/[episodeId]`) để bậc 4 xảy ra được ngay | bảng chỉ thêm `episode_marks` + hàm `eng_mark_episode_transfer` (D15, chỉ lần làm đầu và không phải bài sửa; không sửa `episodes.facets`); engine coi bài có dấu như `transfer_check`; bài có dấu không tính là bài ôn trễ (C7); đưa vào xóa dữ liệu / xem trước; test database (chỉ người được duyệt; học sinh và gia sư kia bị từ chối) + test engine (dấu + bài ôn trễ → bậc 4) |

Ghi chú G4: chọn bảng riêng thay vì thêm facet vào `validation_decisions`, vì `validation_decisions` gắn với một kỹ năng cụ thể và có chỉ mục `first_once`, còn dấu này là của cả bài. Dòng mới nhất của (bài, dấu) quyết định, nên bỏ tick là thêm một dòng `value = false`.

### Sửa sau review Opus (23/10/2026, chưa áp `0023` ở đâu nên sửa thẳng trong file)

| # | Lỗi / thay đổi | Cách sửa |
|---|---|---|
| B1 | Bậc 4 không bao giờ được đề xuất nếu bằng chứng đã có từ lúc đề xuất bậc 3, hoặc dấu "chủ đề mới" được tick sau | "Đã đề xuất rồi" tính theo **(bậc, khóa bằng chứng)** ở engine, ở `eng_apply_engine_results` và ở chỉ mục duy nhất (`mastery_decisions_evidence_once` theo `to_state`; ⚑ có chỉ mục riêng `mastery_decisions_flag_once`). Khóa bậc 4 = bài ôn trễ + bài chuyển giao + id dòng dấu đang có hiệu lực (bỏ tick rồi tick lại = bằng chứng mới). Test engine + database |
| B2 | Bậc thầy/cô sửa tay bị engine đảo ngay trong cùng yêu cầu | Dòng MANUAL lưu **khóa bằng chứng** thầy/cô đang thấy (`p_evidence_key` của `eng_set_skill_state`, tính bằng `evidenceKeyFor`). Khi dòng bậc mới nhất là MANUAL và khóa hiện tại vẫn bằng khóa đó, engine **và** SQL không ghi AUTO / PROPOSED cho kỹ năng; có bằng chứng mới thì đi tiếp. Test: 2→1 giữ nguyên sau settle và sau rebuild; ⚑ "Sửa bậc" 3→2 không mở lại đề xuất bậc 3 |
| S1 | Dấu "chủ đề mới" là việc của **thầy/cô** (ý phụ huynh, D18), không phải người duyệt nào cũng tick | `eng_mark_episode_transfer` chỉ nhận thầy/cô còn quan hệ hiệu lực với em (`tutor_only`); phụ huynh bị từ chối; ô chỉ hiện cho thầy/cô |
| S2 | Kết quả thấp được duyệt muộn không bật ⚑ | Engine nhận `validation_decisions.created_at`; "sau quyết định" = sau `max(giờ nộp, giờ duyệt)` |
| S3 | Sau "Chưa", bất kỳ bài nào cũng làm đề xuất quay lại | Khóa đề xuất = bằng chứng mà điều kiện của bậc đó thực sự dùng (cách 1: nhóm bài được tính; cách 2: các lần làm được tính; bậc 4: bài ôn trễ + chuyển giao + dấu). Bài có gợi ý, bài nháp, bài nền không đưa đề xuất quay lại |
| S4 | Ô "Sửa tay" giữ lựa chọn cũ khi bậc đổi | `key={current}` + chọn luôn lấy trong các bậc còn hợp lệ |
| S5 | Cách 2: bước `delayed_check` được coi là bài ôn dù không cách 14 ngày | Bài ôn luôn cần ≥ `reviewMinDays` (14) sau lần luyện gần nhất của kỹ năng; hai bài 4/4 cùng ngày không phải bài ôn |
| N2 | Lần tính chậm ghi đè điều kiện mới hơn | `competency_state.inputs_at`; chỉ ghi khi lần tính đọc dữ liệu mới hơn hoặc bằng |
| N3 | Lỗi tải trạng thái làm sập trang Hồ sơ cấp / Kỹ năng đang theo dõi | `loadSkillStatesSoft`: ghi lỗi, hiện trang không có trạng thái + một dòng trung tính |
| N4 | Bước mẫu đã là "chủ đề mới" vẫn hiện ô tick | Hiện sẵn tick, không sửa được, kèm ghi chú; chữ gợi ý nói rõ tick vào bước "Bài ôn lại sau 2 tuần" thì bài tính là chủ đề mới thay vì ôn lại |
| N5 | Dòng AUTO ghi sai đường | `auto_route`: đường dẫn tới bậc 1–2 (1 = thầy/cô chấm, 2 = câu tự chấm) |
| N7 | Thiếu `0022` ra lỗi khóa ngoại khó hiểu | Đầu `0023` có kiểm tra AP-0.3 và báo tiếng Việt "hãy áp 0022 trước" |
| N8 | `import "server-only"` không ở dòng đầu | Sửa ở `lib/review|revision|work/route.ts` |

### Phụ huynh đã quyết 23/10 (S7a, sau review Opus; "ok đề xuất")

1. **N1. ⚑ cách 2 cần bài trắc nghiệm đủ câu.** Một lần làm cách 2 dưới `minAccuracyPct` (75 %) chỉ bật ⚑ khi chính lần làm đó có **≥ 4 câu được tính** của kỹ năng (`AP-0.3` → `receptiveAuto.flagMinItems: 4`). 2/3 câu: không bật ⚑; 2/4 câu: bật. Số câu tính **theo từng lần làm** (hai bài 2/3 không cộng lại). ⚑ cách 1 (thầy/cô chấm) không đổi. Vì AP-0.3 thêm khóa nên `0022` được sinh lại (chưa áp ở đâu nên không phá bản đã công bố); `content/config.lock.json` đã cập nhật; SQL `eng_apply_engine_results` không kiểm số câu (engine quyết định có ⚑ hay không; SQL chỉ giữ luật "bậc ≥ 2, không ⚑ đang mở, chưa gắn cờ cùng khóa").
2. **N6. Giao lại cùng một mẫu không phải "lần làm đầu" mới.** Bước của mẫu = (`episodes.context_id` = mã mẫu bài, `activity_instances.step_no`). Với engine, một lần nộp chỉ là lần làm đầu nếu nó là lần làm đầu (`is_first_attempt`) **sớm nhất** của em trên bước đó của mẫu đó, qua mọi lần giao (kể cả bài chưa được duyệt; sớm nhất theo giờ nộp, không theo thứ tự giao). Lần giao sau của cùng bước là **bài ôn**: dùng được làm bài ôn ≥ 14 ngày (cách 2) / bằng chứng "ôn lại" bậc 4 theo khoảng cách ngày, nhưng **không** thêm lần làm đầu cho cách 1, cách 2, bậc 2, ⚑, không tính là "bài khác" (≥ 2 bài), không tính là bài chuyển giao. Mẫu khác, hoặc bước khác của cùng mẫu, vẫn tính riêng. Tính trong `english.eng_engine_inputs` (hàm phụ `eng_is_step_repeat`, trường `step_repeat`), engine đọc `stepRepeat`.

### Quyết định trong kế hoạch

D1–D23 trong `docs/superpowers/plans/2026-10-23-s7a-skill-states.md` (bảng "Decisions"). Các mục §17 đã được phụ huynh xác nhận 23/10 (xem trên).

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database: ép không hạ bậc, một đề xuất mở, Chưa → không đề xuất lại tới khi có bài mới, tính lại giống hệt, ai được làm gì, dấu "chủ đề mới", xóa dữ liệu), `gen:config` xanh; CI (E2E + áp migration hai lần) xanh; review Opus; phụ huynh áp `0022` rồi `0023` và làm các bước thử ở trên.



## Studio B1 — Đề PDF/Word → bài trong app (05/11/2026)

Code trên nhánh `feature/studio-b1`, chờ CI + review Opus + phụ huynh duyệt PR. Spec `docs/superpowers/specs/2026-11-05-studio-b1-design.md`, kế hoạch `docs/superpowers/plans/2026-11-05-studio-b1.md`. Mockup board 19–21 phụ huynh đã duyệt 05/11.

### Đã làm

| Bước | Ở đâu |
|---|---|
| Phụ huynh bật AI một lần, ghi đồng ý `ai_text` cho từng em, xem chi phí tháng / trần $10 (báo ở $8) | `/settings/ai`, ô trên trang chủ phụ huynh |
| Gia sư hoặc phụ huynh của em tải đề + đáp án (PDF hoặc .docx, ≤ 15 MB), cho AI đọc (chạy nền) hoặc soạn tay | thẻ em → "Tạo bài từ đề" (`/studio/new`) |
| Duyệt đề (board 19): sửa từng câu, nhãn, kỹ năng, đáp án chấp nhận; Duyệt bị chặn khi còn lỗi; Duyệt → mẫu Studio + khung đề giấy; Giao bài | `/studio/drafts/[id]` |
| Con làm trên trang bài như chủ đề tuần; câu đóng chấm ngay; câu không tự chấm được chờ thầy/cô | `/activities/[id]` |
| Con thấy "Câu cần xem lại" (câu sai + đáp án đúng + giải thích; số câu chờ). Không điểm, không x/y, không số câu đúng | `/activities/[id]` (board 20) |
| Hộp duyệt → tab "Cần thầy/cô xem (n)": Đúng / Sai từng câu; "Đúng" = chấp nhận cho lần làm sau | `/review/studio` (board 21) |
| Hết câu chờ → Kết quả bài + dấu nhãn câu sai → Điểm cần chú ý; engine S7a tính lại (cách 2, câu tự chấm). `lib/engine` không đổi | tự động |

### SQL cần áp

**`db/migrations/0024_studio_b1.sql`** — áp **TRƯỚC khi thử preview hoặc gộp PR** (Actions → Apply database migrations, gõ APPLY, hoặc dán vào SQL Editor). Chỉ thêm; chạy lại an toàn; cần `0022` + `0023` đã áp. Migration kế tiếp sau này là **0025**. Nên bấm chạy tay *Weekly backup* trước.

### Việc phụ huynh cần làm

1. Áp `0024`.
2. Tạo khóa API trên Anthropic Console, đặt trần $10/tháng ở đó, thêm `ANTHROPIC_API_KEY` vào Vercel (Preview + Production). **Không gửi khóa qua chat.** Kiểm Vercel → Settings → Functions: thời gian chạy tối đa 300 giây (Fluid compute).
3. Cài đặt AI → Đồng ý và bật.
4. Thử thật 1 lần trên preview: đề Destination U1–12 (.docx + đáp án) — ghi chi phí thật vào đây: _(chưa thử)_.

### Quyết định (bảng P1–P12 trong kế hoạch)

| # | Trạng thái |
|---|---|
| P1 (kỹ năng gắn được = bộ hiện hành ∩ kỹ năng mà danh mục tính ACT-SOURCE-QA) | **Phụ huynh xác nhận 06/11: giữ luật bằng chứng của danh mục (phương án A)** |
| P2, P3, P5, P6, P8, P9, P10, P12 | Làm theo đề xuất của kế hoạch |
| P4 (câu bỏ trống hiện trong "Câu cần xem lại"), P11 (bài đã tính rồi, đổi Đúng/Sai không đề xuất lại cùng khóa) | **Phụ huynh xác nhận 07/11: theo đề xuất** |
| Câu khi không có câu cần xem lại ("Không có câu nào cần xem lại lúc này.") | **Phụ huynh xác nhận 07/11: giữ nguyên (A)** |
| P7 (bảng giá `claude-sonnet-5-5`) | **Đã giải quyết 06/11: giá chính thức $2 vào / $10 ra mỗi triệu token** (platform.claude.com/docs, models/sonnet-5-5/overview). Giá tính theo model ĐƯỢC YÊU CẦU; model không có trong bảng bị từ chối (`refused_model`). Vẫn ghi chi phí thật của lần thử |

### Lệch nhỏ so với kế hoạch khi làm (đã ghi)

- `eng_purge_preview` đếm thêm ba khóa `studio_step_sources`, `studio_sources`, `studio_template_keys` (kế hoạch chỉ đếm 5 khóa): các test cũ yêu cầu bản đếm trước khi xóa có đúng các khóa của biên nhận xóa.
- Test cũ sửa theo thay đổi chủ ý: danh sách loại file của bucket có thêm `.docx` (`practiceFiles`, `fileStorage`, `storageRules`), thông báo `eng_register_file` nói "pdf, png, jpeg, webp and docx".
- Test `approve` của kế hoạch dùng `base_updated_at: "other"` (5 ký tự) bị schema từ chối trước khi tới chỗ so khóa; dùng một mốc thời gian đủ dài.

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database: RLS, tự chấm chỉ cho mẫu Studio, Đúng/Sai → engine, kết quả một lần mỗi lần làm, xóa dữ liệu một em), `gen:config`, E2E "Studio" với `AI_FAKE=1` (CI), review Opus. Chi phí AI trong tháng ≤ $10.

### Sửa sau review Opus (06/11/2026, `0024` chưa áp ở đâu nên sửa thẳng trong file)

| Nhóm | Sửa |
|---|---|
| Chi phí AI | Cổng AI khóa theo gia đình (`pg_advisory_xact_lock`) và GHI chỗ đặt trước giá xấu nhất của lần gọi ngay trong khóa; từ chối khi đã chi + giá xấu nhất ≥ trần; kiểm lại ở ĐẦU mỗi vòng thử (kể cả thử lại và đổi `tool_choice`). Thời gian mỗi lần gọi = min(240 s, còn lại − 20 s), còn dưới 60 s thì không gọi; lỗi hết giờ / 5xx ghi giá ước tính phần đầu vào (không ghi 0). Giá chính thức $2 / $10, tính theo model ĐƯỢC YÊU CẦU, model không có trong bảng bị từ chối (`refused_model`). `AI_FAKE` chỉ khi không phải production (trừ CI). Bản thử (ALLOW_REAL_LEARNERS=false) không bật AI cho gia đình có em thật. |
| Riêng tư | Khung đề giấy Studio gắn với MỘT em (`test_frames.learner_id`): gia sư em khác không đọc được; kết quả / bài giao của em khác không dùng được; xóa dữ liệu một em xóa luôn khung (đếm trước khi xóa cùng khóa `studio_frames`). Con không bao giờ thấy đáp án mẫu của câu mở. |
| Đúng đắn | Duyệt kiểm lại kỹ năng ⊆ danh sách Studio của em; "đúng" chỉ đếm kết quả `correct`; Kết quả bài không ghi được lần đầu sẽ được ghi lại khi mở tab "Cần thầy/cô xem"; khóa lạc quan so mốc thời gian (không so chữ, không phụ thuộc múi giờ phiên); không giao được bản đã có bản sửa mới hơn; trùng mã phần / bài đọc chặn Duyệt; file Word quá dài bị từ chối rõ ràng (không cắt ngầm), file Word giải nén > 20 MB bị từ chối; chữ tiếng Việt trong dữ liệu SQL đổi sang mã, hiển thị qua `lib/copy/vi.ts`. |

Vòng review thứ hai (06/11): chi phí AI của bản nháp không cộng chỗ đặt trước đã giải phóng; chỉ một chỗ đặt trước CHƯA giải phóng của đúng gia đình mới được giải phóng (một lần); lỗi hết giờ / 5xx ghi giá xấu nhất (đầu vào ước tính + toàn bộ phần đầu ra cho phép); ghi lại Kết quả bài chỉ cho lần làm đã sẵn sàng, bỏ qua em thật khi `ALLOW_REAL_LEARNERS=false`, và một lỗi chỉ ghi một dòng mỗi giờ cho mỗi lần làm; danh sách khung đề chỉ gồm khung của gia đình và khung Studio của đúng em; `eng_same_instant` là STABLE; bỏ chữ ký hàm cũ của bản nháp đầu.

**Giới hạn đã biết:** bảo vệ file Word giải nén (> 20 MB) đọc kích thước khai báo trong thư mục zip; file zip cố tình khai sai không bị chặn ở bước này. Chỉ người lớn trong gia đình tải file lên nên chấp nhận ở B1.

## Session-log quick fix (07/11/2026)

Nhánh `feature/session-log-quickfix`. Kế hoạch: `docs/superpowers/plans/2026-11-07-session-log-quickfix.md`.

**Đã làm (không đổi cơ sở dữ liệu, API, zod, giới hạn):**
- Tìm không cần dấu ở mọi ô chọn có ô tìm kiếm (`lib/text/fold.ts` → `foldVi`, dùng trong `DomainTabs`): Ghi buổi học (kỹ năng + điểm cần củng cố), duyệt bài viết (nhãn), giao bài luyện. Ghi kết quả bài và Studio dùng danh sách thường (không có ô tìm kiếm).
- "Kỹ năng đã luyện hôm nay": dòng "Đã chọn n" + thẻ đã chọn có nút ✕ (chỉ khi chưa lưu). Từ khóa tìm được giữ sau khi chọn.
- Nút "Như buổi trước": THÊM kỹ năng đã luyện (chỉ kỹ năng còn trong bộ hiện tại) và điểm củng cố (chỉ nhãn còn dùng được và không bị ẩn, tối đa 3) của buổi trước vào những gì đã chọn, không thay thế; nút ẩn khi không còn gì để thêm; dòng "Đã thêm …" mất khi bạn đổi lựa chọn. Phụ huynh bấm nút này thì chép từ buổi gần nhất mà phụ huynh thấy được (ghi chú được chia sẻ), giống khung "Buổi trước". Không chép ngày, "Hôm nay học", lời nhắn, ghi chú phụ huynh, hỏi lại. `loadLastNote` đọc thêm `practised_target_ids`.
- Giữ tối đa 3 điểm củng cố (Q1); không chép "Hôm nay học" (Q2).

**Thử trên preview:**
1. Đăng nhập gia sư thử → An (thử) hoặc Nguyên (thử) → **Ghi buổi học**.
2. Ô tìm kỹ năng: gõ `doc` hoặc `dieu kien` (không dấu) → ra kết quả.
3. Chọn 3 kỹ năng → thấy "Đã chọn 3" và 3 thẻ; bấm ✕ một thẻ → còn 2.
4. Lưu buổi. Mở "Ghi buổi học" lần nữa → bấm **Như buổi trước** → kỹ năng + điểm củng cố của buổi trước được điền sẵn.

**SQL cần phụ huynh áp:** không có.

**Trạng thái:** chờ review Opus + phụ huynh duyệt PR.
