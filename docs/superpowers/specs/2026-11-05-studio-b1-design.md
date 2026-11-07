# Studio B1 — Đề PDF/Word → bài trong app (thiết kế, duyệt 24/10–05/11/2026)

Người soạn: Claude (Opus), brainstorm cùng phụ huynh 24/10–05/11/2026. Thay phần "PR B" của `2026-10-20-studio-design.md` (§4) bằng **B1** (spec này) + **B2** (sau). Các quyết định Q1–Q8, F1 của spec 20/10 vẫn giữ trừ chỗ ghi "thay" bên dưới. Nguồn: spec 20/10, spec S7a `2026-10-23-s7a-skill-states-design.md` (Q3: bài Studio tính cách 2 khi có Studio PR B), spec bản đồ kỹ năng `2026-10-21-skill-map-levels-design.md`, nhánh thử `feature/spike-studio-ai`, mockup canvas màn 19–21 (`StudioDuyet`, `StudioXemLai`, `CanXem`).

## 0. Mục tiêu và tiêu chí đạt

Gia sư hoặc phụ huynh **tải đề + đáp án → xem → Duyệt → Giao**; con làm trên app; app chấm, gắn nhãn, cập nhật Điểm cần chú ý và bậc kỹ năng. Mục tiêu trước mắt: **không hết bài** khi các chủ đề tuần (5 chủ đề mỗi em) dùng hết khoảng cuối tháng 11.

Đạt khi, trên gia đình thật:
1. Một đề Destination (PDF hoặc .docx) + đáp án duyệt xong trong ≤ 10 phút, sửa ≤ 5 câu.
2. Con làm trên app; câu đóng chấm ngay; con thấy câu sai + đáp án đúng + giải thích, **không thấy điểm hay số câu đúng**.
3. Khi mọi câu đã có đúng/sai: Kết quả bài + dấu nhãn được ghi; Điểm cần chú ý cập nhật; tab Kỹ năng phản ánh câu tự chấm (cách 2) mà **engine S7a không phải sửa**.
4. Chi phí AI trong tháng ≤ $10 trong mọi trường hợp.

## 1. Quyết định của phụ huynh (24/10–05/11)

| # | Câu hỏi | Quyết định |
|---|---|---|
| B-Q1 | Một PR hay chia | **Chia 2.** B1 (spec này): tải → AI nháp → duyệt (+ khung đề giấy) → giao *Luyện* → con làm → tự chấm → hàng "Cần thầy/cô xem" → con xem câu sai → Kết quả + nhãn + bậc (cách 2) · công tắc AI, trần $10, đồng ý `ai_text`. **B2**: chế độ *Kiểm tra* (đồng hồ, hết giờ tự nộp), "Kiểm tra chính thức" → Hộp duyệt chấm 0–4, chip "Vì sao mình sai?" |
| B-Q2 | Ai tải đề và Duyệt | **Gia sư hoặc phụ huynh của em đó** (thay "gia sư" của spec 20/10). Ghi rõ người duyệt; gia sư thấy mọi đề. Bậc 3–4 vẫn chỉ gia sư của em xác nhận (S7a không đổi) |
| B-Q3 | Gắn kỹ năng cho từng câu | **AI đề xuất cả nhãn và kỹ năng, người duyệt sửa.** Nhãn = lá `tag` của bản đồ, đúng mảng, trong ± 1 cấp quanh cấp đang học của em ở mảng đó. Kỹ năng = mã trong bộ kỹ năng hiện hành của em, hoặc "không có kỹ năng phù hợp". Câu đọc: kỹ năng mặc định lấy theo `related` của nhãn kỹ năng đọc. Màn duyệt có "Kỹ năng cả phần" |
| B-Q4 | Cách xây | **Đề đã duyệt = một "chủ đề 1 bước" riêng của gia đình**, chạy trên đường ray S4 (trang làm bài, tự lưu, khai báo gợi ý, biên nhận, `eng_compute_auto_checks`, `attempt_auto_checks`, `eng_engine_inputs`). Không xây hệ bảng `studio_attempts`/`studio_item_checks` của spec 20/10 |
| Mục 1–5 | Luồng, dữ liệu, AI, trường hợp khó, kiểm thử | Duyệt như §3–§7 dưới đây (01/11) |
| Mockup | Màn 19–21 | Duyệt 05/11 |

Giữ từ spec 20/10: Q3 (câu mở chấm theo đáp án + đáp án chấp nhận; câu lạ → người lớn Đúng/Sai; AI **không** chấm bài của em), Q4 (con thấy câu sai ngay sau khi nộp; câu chờ hiện sau khi người lớn xử), Q5 (khung đề giấy tự sinh), Q7 (PDF + .docx; không ảnh, không `.doc`), F1 (Sonnet 5.5). Q2 (*Kiểm tra*) và Q1 nhánh "chính thức" → B2. Q8 (nhãn kỹ năng đọc) đã có ở PR A; chip → B2.

## 2. Phạm vi

**Trong B1:** §3 luồng 0–9.

**B2:** *Kiểm tra* (đồng hồ do server giữ, `deadline_at`, tự nộp khi hết giờ), "Kiểm tra chính thức" (mục Hộp duyệt gắn 1–2 kỹ năng, chấm 0–4 → bằng chứng cách 1), chip "Vì sao mình sai?" + thống kê.

**Không làm:** AI chấm câu trả lời của em (không bao giờ); AI soạn bài bổ sung (Studio bước 2); giao một đề cho em khác (tải lại cho em đó); kho đề dùng chung; ảnh chụp đề; phần nghe trên app (âm thanh không qua app); tô câu bằng chứng trong bài đọc.

## 3. Luồng (B1)

| # | Ai | Màn | Việc |
|---|---|---|---|
| 0 | Phụ huynh | **Cài đặt AI** (`/settings/ai`, một lần) | Văn bản đồng ý ngắn ("AI chỉ đọc đề và đáp án của thầy/cô, không đọc thông tin của con") → **Đồng ý và bật** = `ai_settings.enabled = true` + một dòng `consents(scope='ai_text', granted=true)` cho **mỗi em** của gia đình. Tắt = `enabled=false` + dòng `granted=false`. Hiện chi phí tháng này / trần |
| 1 | Gia sư / phụ huynh của em | **Studio → Tạo bài từ đề** (`/studio/new`) | Chọn em; tải file đề + file đáp án (PDF/.docx, ≤ 15 MB mỗi file) qua luồng vé tải lên S5b. AI tắt / hết trần / chưa đồng ý → chỉ có **Soạn tay** (bản nháp trống) |
| 2 | Server | "AI đang đọc đề…" | Chạy nền (Next `after()` + `maxDuration`); màn kiểm tra trạng thái nháp vài giây một lần; rời trang được. ≤ 3 lần thử; hỏng → `studio_drafts.status = 'ai_failed'` + lời nhắn + **Soạn tay** |
| 3 | Gia sư / phụ huynh | **Duyệt đề** (`/studio/drafts/[id]`, màn 19) | Theo phần; câu "cần xem" lên đầu (lọc "Chỉ câu cần xem"); mỗi câu sửa được: đề, lựa chọn, loại câu, đáp án, đáp án chấp nhận, nhãn, kỹ năng, giải thích; "Kỹ năng cả phần"; thêm/xóa câu; bài đọc. **Duyệt bị chặn** khi còn lỗi kiểm tra (§5.4). Duyệt → đề khóa + mẫu chủ đề Studio + khung đề giấy |
| 4 | Gia sư / phụ huynh | **Giao bài** (ngay trên màn đề đã duyệt) | Ngày làm + hạn → `inquiry_instance` + `activity_instance` (mode `PRACTICE`). Con thấy ở "Việc tiếp theo" từ ngày làm |
| 5 | Con | Trang làm bài S4 (`/activities/[id]`) | Như bài chủ đề tuần; bài đọc cạnh câu hỏi (máy tính) / xếp chồng (điện thoại); tự lưu; khai báo gợi ý; nộp → biên nhận |
| 6 | App → người lớn | Chấm | `eng_compute_auto_checks` (mở rộng §4.3). Câu `needs_person` → **Hộp duyệt → "Cần thầy/cô xem"** (màn 21): Đúng/Sai từng câu; "Đúng" → thêm vào `accepted_additions` (áp cho lần làm sau, không chấm lại bài cũ). Hiện "chờ n ngày" |
| 7 | Con | **Câu cần xem lại** (màn 20, cùng trang bài sau khi nộp) | Câu sai: đề · câu em viết · đáp án đúng · giải thích. Câu chờ: "Thầy/cô sẽ xem câu này". Không điểm, không "x/y", không số câu đúng |
| 8 | App | Kết quả | Khi mọi câu của lần làm đã có đúng/sai/bỏ trống: ghi **Kết quả bài** (tự động, nguồn Studio · Luyện) + **dấu nhãn** câu sai (lần đầu `counts = true`, làm lại `false`) → Điểm cần chú ý; engine chạy lại (hook S7a) → cách 2 |
| 9 | Con | **Làm lại** | Bài *Luyện* làm lại được (S4: lần nộp 2, 3… cùng gia đình học tập). Lần sau không tính bậc (engine chỉ lấy lần đầu), dấu nhãn `counts = false` |

Chữ giao diện mới vào `lib/copy/vi.ts` + `docs/UX_COPY_GUIDE.md` (mục Studio). Người dạy luôn "thầy/cô" (`tutorHonorific`). Không chữ "TOMO". Giao diện luôn sáng.

## 4. Dữ liệu — migration `0024_studio_b1.sql` (chỉ thêm; cần `0023`)

### 4.1 Bảng mới

| Bảng | Cột chính | Luật |
|---|---|---|
| `ai_settings` | `family_id` PK, `enabled bool default false`, `monthly_cap_usd numeric default 10`, `soft_cap_usd numeric default 8`, `updated_by_member`, `updated_at` | Mutable; chỉ phụ huynh đổi qua hàm `eng_set_ai_settings` (service_role sau `requireAccess`) |
| `ai_runs` | `id`, `family_id`, `purpose ('studio_extract')`, `draft_id`, `model`, `prompt_version`, `input_tokens`, `output_tokens`, `cost_usd`, `status ('ok','error','refused_cap','refused_off')`, `error_code`, `by_member`, `at` | **Append-only** (`eng_forbid_mutation`). Không lưu nội dung đề hay câu trả lời. Chỉ phụ huynh đọc (qua hàm) |
| `studio_drafts` | `id`, `family_id`, `learner_id`, `track_id`, `title`, `test_file_id`, `key_file_id`, `status ('extracting','ai_failed','draft','approved','discarded')`, `payload jsonb` (parts, passages, items — §4.4), `ai_run_id`, `created_by_member`, `updated_by_member`, `updated_at`, `approved_by_member`, `approved_at`, `template_id`, `template_version`, `supersedes_draft_id` | Mutable khi `status ∈ (extracting, ai_failed, draft)`; trigger chặn mọi thay đổi khi `approved`/`discarded`. "Sửa đề đã duyệt" = nháp mới `supersedes_draft_id` → mẫu phiên bản mới |
| `studio_item_meta` | `template_id`, `template_version`, `item_id`, `n` (số in trên đề), `part`, `tag_key`, `reading_skill_key`, `out_of_app bool` | Append-only; **chỉ người lớn đọc** (con không thấy nhãn). Một câu có **đúng một** nhãn dùng cho dấu nhãn và khung đề: câu đọc dùng `reading_skill_key` (khi đó `tag_key` null), câu khác dùng `tag_key` |
| `accepted_additions` | `id`, `template_id`, `template_version`, `item_id`, `answer`, `by_member`, `at`, `from_attempt_id` | Append-only; unique (template, version, item, `eng_norm_answer(answer)`) |
| `item_decisions` | `id`, `attempt_id`, `item_id`, `result ('correct','incorrect')`, `by_member`, `by_role`, `at` | Append-only; unique (`attempt_id`, `item_id`); chỉ cho câu có `needs_person` trong `attempt_auto_checks` của lần làm đó |

### 4.2 Mở rộng bảng có sẵn

| Bảng | Thay đổi |
|---|---|
| `inquiry_templates` | Cột `kind text default 'topic' check in ('topic','studio')`, `family_id uuid null`. CHECK id nới (drop + add, chỉ rộng hơn) cho `^[AB]-ST-[0-9]{6}$` khi `kind='studio'`. `target_ids` được rỗng khi `kind='studio'`. Policy select: `kind='topic'` như cũ; `kind='studio'` thêm điều kiện người đọc là người lớn của gia đình `family_id`. Mẫu Studio **không** nằm trong `content/` hay `config.lock.json` (sinh lúc chạy, không phải cấu hình công bố) |
| `sources` | Mỗi bài đọc → một nguồn `modality='text'`, id `ST-<template>-<ref>`, `author` = "Thầy/cô", `rights_note` = "Tài liệu của thầy/cô, chỉ dùng trong gia đình". Nối bằng `template_step_sources` |
| `template_item_keys` / `instance_item_keys` | Dùng như S4 (`kind='answer'`, `answer`, `explanation_vi`); đáp án chấp nhận lúc duyệt ghi theo quy ước có sẵn ` / ` trong `answer` |
| `eng_compute_auto_checks` | `transform` và `short` (câu có đáp án) so khớp như `gap` (`eng_norm_answer`) với đáp án ∪ `accepted_additions` của mẫu; không khớp → `needs_person`. `open` luôn `needs_person`. **Chỉ áp cho mẫu `kind='studio'`**; bài chủ đề tuần giữ hành vi cũ |
| `eng_engine_inputs` | Viết lại (create or replace) để mỗi item `needs_person` có dòng `item_decisions` được trả về `correct`/`incorrect`; không có quyết định → bỏ qua câu đó (không tính). Hình JSON giữ nguyên → `lib/engine` không đổi |
| `results` + `tag_marks` | Hàm mới `eng_record_studio_result(attempt)` (gọi khi câu chờ cuối cùng được xử, hoặc ngay khi nộp nếu không có câu chờ): ghi `results` mode `frame` với khung đề của mẫu, `source='practice'` (nới CHECK nếu frame đang ép `test`), `attempt` first/retry theo `attempts.is_first_attempt`, `wrong_items`; dấu nhãn từ nhãn duy nhất của câu trong `studio_item_meta` (§4.1). Idempotent theo `attempt_id` (cột mới `results.attempt_id unique`) |
| `test_frames` | Khi Duyệt: một khung `{n, part, tag_key}` cho mọi câu (kể cả `out_of_app`) |
| `files` | `kind` thêm `studio_test`, `studio_key`; MIME thêm `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (chỉ cho 2 kind này); `lib/storage/rules.ts` theo cùng luật |
| Xóa dữ liệu một em | Gồm `studio_drafts`, mẫu Studio của em (`inquiry_templates kind='studio'` + nguồn + khóa + meta + `accepted_additions`), `item_decisions`, file Studio |

### 4.3 Hàm cho con

`eng_my_studio_review(p_activity uuid)` (authenticated, tìm em bằng `auth.uid()`): chỉ khi bài thuộc mẫu `kind='studio'` **và** lần làm đã nộp. Trả các câu `incorrect` (tự chấm hoặc người lớn chấm): `n`, đề, câu em viết, đáp án đúng (phần trước ` / ` đầu tiên), giải thích; và danh sách `n` của câu còn chờ. **Không** trả số câu đúng, tổng câu, tỉ lệ, nhãn, kỹ năng. Bài chủ đề tuần: hàm trả rỗng (luật S4 giữ nguyên).

### 4.4 `studio_drafts.payload` (zod `studioDraftSchema`, `lib/studio/schema.ts`)

```
{ parts: [{key, name, instructions}],
  passages: [{ref, title, text}],
  items: [{ n, part, kind: mcq|gap|word_form|transform|short|open, out_of_app: bool,
            stem, options: [{letter, text}], passage_ref|null,
            key|null, accepted: [], tag_key|null, target_id|null, reading_skill_key|null,
            explanation_vi, needs_review: bool, review_reason|null }] }
```
Mẫu chủ đề sinh khi Duyệt: 1 bước, `activity_type = 'ACT-SOURCE-QA'`, `mode='PRACTICE'`, item id `q<n>`, `target_id` theo item, `target_ids` của mẫu = tập `target_id` khác null. Câu `out_of_app` không vào bước (chỉ vào khung đề giấy).

## 5. AI

1. **Gọi:** chỉ server (`lib/ai/anthropic.ts`, `ANTHROPIC_API_KEY` trên Vercel). Model `STUDIO_EXTRACT_MODEL` mặc định `claude-sonnet-5-5`. Prompt `prompts/studio-extract.v1.md` (có phiên bản; đổi = file mới).
2. **Gửi:** PDF dạng document; .docx → chữ ở server (`mammoth`); danh sách nhãn `tag` của track trong bản đồ SM-1, lọc ± 1 cấp quanh cấp đang học từng mảng; danh sách kỹ năng trong bộ hiện hành của em (mã + tên). **Không gửi** tên, tên đăng nhập, bài làm, điểm, ghi chú hay bất cứ gì về em.
3. **Nhận:** tool `save_exercise` (forced), schema = §4.4 không có `n` tự đặt (lấy số in trên đề). Đáp án **từ file của thầy/cô**, AI không tự giải. Giải thích tiếng Việt ≤ 25 chữ.
4. **Kiểm tra sau AI** (`lib/studio/validate.ts`, cũng chạy khi bấm Duyệt): số câu liên tục trong từng phần; câu đóng (`mcq`, `gap`, `word_form`, `transform`, `short`) có `key`; `mcq` có ≥ 2 lựa chọn và `key` là một chữ cái có trong lựa chọn; `tag_key` thuộc danh sách đã gửi; `target_id` thuộc bộ của em; giải thích qua `hasScoreWords` (luật S6) — vi phạm → `needs_review` + lý do. **Duyệt bị chặn** khi: câu đóng thiếu `key`, `mcq` sai lựa chọn, nhãn/kỹ năng không hợp lệ, giải thích có dạng điểm, hoặc đề không còn câu nào làm được trên app.
5. **Chặn chi phí:** trước mỗi lần gọi, cộng `ai_runs.cost_usd` tháng (giờ Việt Nam) của gia đình: ≥ `soft_cap_usd` → báo phụ huynh (ô trên trang chủ phụ huynh + màn Cài đặt AI); ≥ `monthly_cap_usd` → không gọi, ghi `refused_cap`, mở Soạn tay. Trần $10 trên Console (phụ huynh đặt). Công tắc + đồng ý: thiếu → `refused_off`.
6. **Chi phí** ước tính mỗi lần từ token thật × bảng giá trong `lib/ai/pricing.ts` (một chỗ; ghi rõ là ước tính).
7. **Test:** `AI_FAKE=1` → trả fixture (`tests/fixtures/studio/`), không gọi mạng. Đề mẫu cho test do Claude viết. Đề Destination chỉ dùng khi phụ huynh thử thật trên preview.

## 6. Trường hợp khó

| Tình huống | Xử lý |
|---|---|
| Thiếu câu, số nhảy, câu đóng thiếu đáp án | Báo đỏ ở màn duyệt; Duyệt bị chặn |
| Đáp án nhiều cách đúng / lệch đề | `needs_review` + lý do, lên đầu |
| Phần nghe, câu dựa vào hình | `out_of_app`: có trong khung đề giấy, không chấm trên app |
| `.doc`, ảnh, > 15 MB | Từ chối, lời nhắn tiếng Việt |
| AI lỗi 3 lần / tắt / hết trần / chưa đồng ý | Báo rõ lý do; Soạn tay |
| Mất mạng, đóng tab, nộp 2 lần | Đường ray S4 (tự lưu, nộp idempotent) |
| Sửa đề sau khi giao | Nháp mới → mẫu phiên bản mới; bài đã giao giữ phiên bản cũ |
| "Đúng" cho câu lạ | Áp cho lần làm sau; không chấm lại bài đã có kết quả |
| Câu chờ lâu | Hộp duyệt "chờ n ngày"; con thấy "Thầy/cô sẽ xem câu này"; Kết quả bài + dấu nhãn chỉ ghi khi hết câu chờ. Engine: câu chưa có quyết định không tính |
| Đề của An muốn giao Nguyên | Không trong B1: tải lại cho em kia |
| Ai được xử "Cần thầy/cô xem" | Gia sư hoặc phụ huynh của em (D15: bài *Luyện*) |
| Xóa dữ liệu một em | §4.2 |

## 7. Ai thấy gì

| | Em | Gia sư của em | Gia sư em khác | Phụ huynh |
|---|---|---|---|---|
| Đề, bài đọc | Khi làm bài | ✓ | ✗ | ✓ |
| Đáp án, đáp án chấp nhận | Câu mình sai, sau khi nộp | ✓ | ✗ | ✓ |
| Nhãn, kỹ năng của câu | ✗ | ✓ | ✗ | ✓ |
| Số câu đúng / Kết quả bài | ✗ | ✓ | ✗ | ✓ |
| Giải thích | Câu mình sai, sau khi nộp | ✓ | ✗ | ✓ |
| Nhật ký AI, chi phí, công tắc | ✗ | ✗ | ✗ | ✓ |

## 8. Kiểm thử

- **Unit:** `studioDraftSchema`; `validate` (từng luật chặn Duyệt); .docx → chữ; dựng mẫu từ nháp (item id, `target_ids`, bỏ `out_of_app`); chặn trần (soft/hard, ranh giới tháng giờ VN); tính chi phí; lọc nhãn ± 1 cấp; chữ giao diện không có dạng điểm.
- **DB (Postgres thật):** con không đọc được `studio_drafts`, `studio_item_meta`, đáp án, `item_decisions`, `ai_runs`; `eng_my_studio_review` chỉ trả câu sai sau khi nộp, không tổng/tỉ lệ; bài chủ đề tuần trả rỗng; mẫu Studio chỉ người lớn gia đình đó đọc; nháp đã duyệt bất biến; chấm `transform`/`short` theo đáp án ∪ `accepted_additions` chỉ cho mẫu Studio; `item_decisions` đi vào `eng_engine_inputs`; lần làm lại không phải lần đầu; `eng_record_studio_result` idempotent, đúng `counts`; ma trận vai (em · gia sư của em · gia sư em khác · phụ huynh); xóa dữ liệu một em; migration áp 2 lần không lỗi.
- **E2E (gia đình thử, `AI_FAKE=1`):** bật AI → tải đề → duyệt (bị chặn → sửa → duyệt) → giao → con làm, nộp, xem câu sai (không điểm, không x/y — `student-no-scores` mở rộng) → người lớn xử câu chờ → Điểm cần chú ý + tab Kỹ năng cập nhật.
- **Thử thật 1 lần trên preview** (phụ huynh): đề Destination U1–12 (.docx + đáp án), so với lần thử 19/10; ghi chi phí thật vào PROGRESS.

## 9. Phụ thuộc và việc của phụ huynh

1. `0022` + `0023` đã áp trên Supabase thật (S7a). `0024` áp **trước** khi thử preview hoặc gộp.
2. Khi thử: thêm `ANTHROPIC_API_KEY` vào Vercel (Preview + Production) và đặt trần $10 cho workspace trên Console. Claude gửi hướng dẫn; không bao giờ gửi khóa qua chat.
3. Bật AI ở màn Cài đặt AI (ghi đồng ý `ai_text`).

## 10. Chốt khi lên kế hoạch (không đổi thiết kế)

- `ACT-SOURCE-QA` chấp nhận bước không có nguồn (đề chỉ ngữ pháp) — kiểm trong code S4; nếu không, cho phép 0 nguồn với mẫu `kind='studio'`.
- CHECK `results` frame mode đang ép `source='test'`: nới cho `practice` khi có `attempt_id`.
- `gen:config --check` và test cấu hình bỏ qua mẫu `kind='studio'` (không phải cấu hình công bố).
- Thời gian chạy nền trên Vercel (`maxDuration`) đủ cho ~1–2 phút; nếu không, chia "gửi" và "nhận" thành 2 lần gọi route.
- Nhánh: `feature/studio-b1` từ `main` (đã có S7a). Migration kế tiếp sau `0024` là `0025`.
