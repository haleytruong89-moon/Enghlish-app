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
| CI (kiểm kiểu, lint, test, build, test DB), sao lưu mã hóa hằng đêm, ping giữ project không ngủ | `.github/workflows/` |

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
8. **Tạo tài khoản THỬ** (tùy chọn, để xem app): thêm vào `.env.local` các dòng `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEED_DEV_PASSWORD` (≥12 ký tự), rồi `npm run db:seed-dev`. Script in ra 5 email thử `eng-test-…@example.com`; mật khẩu là giá trị bạn đặt.
9. **Vercel:** Import repo → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`
   - `ALLOW_REAL_LEARNERS` = `false` cho **Preview**; cho Production cũng để `false` đến khi bắt đầu pilot thật.
   - **Không** đặt `DATABASE_URL` trên Vercel.
   - Supabase → Authentication → URL Configuration → *Site URL* = địa chỉ Vercel.
10. **Khóa sao lưu:** trên máy mình chạy `age-keygen -o learning-os-backup.key`. Giữ file này **offline** (USB/giấy). Dòng `Public key: age1…` là khóa công khai.
11. **GitHub Secrets** (repo → Settings → Secrets and variables → Actions): `DATABASE_URL` (chuỗi Session pooler), `BACKUP_AGE_RECIPIENT` (khóa công khai `age1…`).
12. **Chạy thử sao lưu:** tab Actions → *Nightly backup (encrypted)* → Run workflow → thấy artifact `learning-os-…`. Diễn tập khôi phục (G0): tải artifact, `age -d -i learning-os-backup.key file.dump.age > file.dump`, rồi `pg_restore` vào một project thử, đối chiếu số dòng.

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
| Backup + khôi phục thử OK | Chờ bước 10–12 |
| Câu trả lời rollback trong `CLAUDE.md` | ✓ (trừ `auth.users` — chờ quyết định) |
| Không có audio lên server | ✓ (chưa có tính năng nói; không có cột audio) |

### Ghi chú cho các lát sau

- Bảng append-only mới: gắn trigger `english.eng_forbid_mutation('learner_id')` theo hướng dẫn ở đầu `0004_append_only.sql`, và thêm lệnh xóa bảng đó vào `english.eng_purge_learner`.
- Migration mới **không** dùng `grant … on all tables` (sẽ cấp lại quyền sửa/xóa đã thu hồi); grant theo từng bảng.
- `track_id` đang là chữ `'A'|'B'`; S1 thêm bảng `english.tracks` và khóa ngoại.

## Quyết định đang chờ phụ huynh

| # | Việc | Hạn | Đề xuất |
|---|---|---|---|
| 1 | Sao lưu có kèm `auth.users` (mã hóa riêng) không | Trước G0 | Có — nếu không, khôi phục phải mời lại mọi tài khoản |
| 2 | Xóa dữ liệu một em có xóa luôn tài khoản đăng nhập | Trước pilot thật | Xóa dữ liệu app trước; tài khoản phụ huynh tự xóa trên Supabase |
| 3 | O-F1 quy tắc video | Trước S2 | Chỉ link YouTube/nguồn mở, không tải video lên |
| 4 | Ngày đề thử tuần 4 của Nguyên | Trước 14/11 | 21/11 |
| 5 | ~~B-W1…B-W4 còn nháp~~ — **ĐÃ QUYẾT 14/10, phương án (a)**: bước sửa bài → kỹ năng `B-A3-REVISE`; câu hỏi đánh giá độ tin cậy nguồn → loại `ACT-WRITE` với `B-T5-SOURCE` (B-W2 bước 4 tách đôi, B-W4 bước 9 đổi loại). 4 mẫu đã **công bố**, seed `0011`, nguồn của bước `0012` (chi tiết ở mục "Quyết định 14/10" trong phần S2). Còn lại: xác nhận bảng bước→bài đọc của `0012` | — | Đã xong; phụ huynh chỉ cần áp `0011`, `0012` sau `0010` |
| 6 | **Ghi bài ngoài app ở bài kiểm tra trong buổi và bài nói trực tiếp**: chỉ thầy/cô ghi; phụ huynh không ghi được (màn hình hiện "Chỉ thầy/cô ghi bài này"). Bài nói trực tiếp chỉ ghi dạng "thầy/cô nghe trực tiếp" | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới**: nếu muốn phụ huynh ghi được bài giấy của bước kiểm tra, nói để nới sau |
| 7 | **Bài do người lớn ghi giúp (bài giấy, bài nói trong buổi)**: học sinh không đọc được nội dung, người ghi hay gợi ý đi kèm; em chỉ thấy một dòng "bài này đã làm cùng thầy/cô hoặc trên giấy, đã ghi lại rồi" | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới**: nếu muốn em xem lại chữ thầy/cô đã ghi, nói để nới sau |
| 8 | **Ngày ghi bài ngoài app** không được sớm hơn lần làm gần nhất của bước đó (kể cả bài em nộp trong app), và bước phải đã mở vào ngày ghi | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới**: nếu hay phải ghi bù theo thứ tự khác, nói để nới sau |
| 9 | **Tiêu chí "thầy/cô nghe trực tiếp"** (vd. nói trôi chảy): chỉ tick được khi bài là bài thầy/cô nghe trực tiếp; bài khác chấm theo các tiêu chí còn lại | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới** |
| 10 | **Ghi chú gợi ý quan sát được** tối đa 300 ký tự (một giới hạn ở mọi lớp: ô nhập, API, cơ sở dữ liệu) | Khi nào cũng được | **Đang làm chặt — phụ huynh có thể nới** nếu thấy ngắn quá |
| 11 | Điểm "sửa bài" (`B-A3-REVISE`) của Nguyên được chấm nhưng chưa nằm trong bộ theo dõi B-v1 (Track A có A3 trong "theo dõi thêm") | Sau baseline | Khi làm B-v2 sau baseline, thêm A3 vào "theo dõi thêm" của Nguyên |
| 12 | `B-T5-SOURCE` chỉ có 2 cơ hội: 28/10 (B-W2) và kiểm tra trễ 23/11 trên nguồn mới C. Có tính kiểm tra trễ trên **nguồn mới** không? (quy định: cùng chủ đề/nguồn) | Trước 23/11 | Chờ phụ huynh/gia sư quyết; cho đến lúc đó không tự tính là kiểm tra trễ hợp lệ |

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
