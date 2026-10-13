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
6. **Áp migration** (chọn 1 cách):
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

**Test:** `npm run typecheck` ✓ · `npm run lint` ✓ · `npm test` ✓ (136 test: 61 unit + 75 DB). Có test: số dòng khớp JSON; mọi target trong bộ có thật và đúng track; sửa/xóa/truncate dòng đã công bố bị chặn; em/gia sư này không đọc được bộ kỹ năng của em kia; `anon` không đọc gì; gán sai track bị từ chối; chạy lại migration không đổi gì; xóa dữ liệu một em kéo theo `target_sets` của em đó.

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
