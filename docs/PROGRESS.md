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
| 5 | **B-W1…B-W4 (4 mẫu Track B) còn nháp, chưa seed, chưa giao được** — vài bước vi phạm luật danh mục (bảng ở mục S2 "Quyết định đang chờ phụ huynh"). Cách gỡ: (a) đổi loại hoạt động của bước, (b) bỏ kỹ năng đó khỏi bước, hoặc (c) thêm phiên bản danh mục cho phép | **Trước 19/10** (B-W1 bắt đầu tuần của Nguyên; B-W0 đầu vào giao được ngay) | Phụ huynh chọn (a)/(b)/(c) cho từng loại vấn đề (sửa bài ACT-REVISE; đọc-hiểu nguồn cho B-T5-SOURCE). Builder không tự sửa nội dung |

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

### Quyết định đang chờ phụ huynh (B-W1…B-W4 chưa giao được)

4 mẫu Track B giữ **nháp**, chưa seed, vì có bước vi phạm luật "loại hoạt động phải thuộc danh sách bài được tính của kỹ năng" trong danh mục v0.2.1. Builder **không đổi nội dung** (đây không phải lỗi gõ nhầm). Mỗi bước có `status: "needs_review"` + ghi chú trong file. (Sau khi sửa cách đọc danh mục ở review #3, kiểm tra lại: **đúng các bước dưới đây vẫn vi phạm, không thêm không bớt**.)

| Mẫu | Bước | Vấn đề |
|---|---|---|
| B-W1-HOMEWORK | 8 | ACT-REVISE không được tính cho B-T7-ARGUE, B-T11-QUALIFY, B-L2-PRECISE |
| B-W2-PHONES | 4 | ACT-SOURCE-QA không được tính cho B-T5-SOURCE |
| B-W2-PHONES | 8 | như B-W1 bước 8 |
| B-W3-TRANSPORT | 8 | như B-W1 bước 8 |
| B-W4-AI-HOMEWORK | 7 | như B-W1 bước 8 |
| B-W4-AI-HOMEWORK | 9 | ACT-SOURCE-QA không được tính cho B-T5-SOURCE |

Cách gỡ (chọn một cho mỗi loại vấn đề): (a) đổi loại hoạt động của bước (vd bước sửa bài → loại được tính), (b) bỏ kỹ năng đó khỏi bước (bước vẫn làm nhưng không tính cho kỹ năng đó), hoặc (c) sửa danh mục (thêm phiên bản danh mục mới cho phép loại đó — việc lớn hơn). Sau khi quyết: sửa file, bỏ `status`/`review_note` ở bước, đổi mẫu thành `published`, `npm run gen:config -- --new` → `0009`. **Lưu ý thời gian:** B-W1 bắt đầu tuần của Nguyên; B-W0 (đầu vào) giao được ngay.

### Ghi chú cho các lát sau

- **S3 (trang học sinh):** học sinh đọc bài **chỉ qua `english.eng_my_released_steps(instance_id)`** (không SELECT bảng). Còn thiếu cho S3: (a) hàm liệt kê bài của chính em (id + tiêu đề + hạn) — hiện học sinh chưa có cách biết `instance_id`; (b) đường phát bài đọc (`sources.body`) cho học sinh theo ngày bước tương ứng — bảng `sources` giờ chỉ nhân viên đọc được. Câu hỏi đóng tự chấm bằng `instance_item_keys` (kind `answer`) **ở server**, không bao giờ gửi khóa xuống trình duyệt học sinh.
- Khóa kind `sealed` (đáp án mẫu câu mở) và `note` (kịch bản gia sư): S2 chỉ lưu. S5 phải chỉ cho gia sư xem `sealed` **sau** khi em đã làm. **Lưu ý (Kit FIXLIST #1):** việc "gia sư chưa được xem ý chính / đáp án mẫu *trước khi em nói*" mới được **thực thi ở giao diện từ S5**; ở S2 phụ huynh/gia sư có thể đọc `sealed` và `note` ngay qua bảng (RLS chỉ chặn học sinh và người ngoài track/gia đình).
- Lịch hiệu lực của một bước = sự kiện mới nhất trong `activity_instance_events` (xếp theo `at`, `id`); bước "bỏ" vẫn còn trong lịch sử, không bị xóa.
