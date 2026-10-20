# Studio bài tập — Thiết kế bước 1 (đã duyệt từng phần 19–20/10/2026)

Người soạn: Claude (Opus), brainstorm cùng phụ huynh 19–20/10/2026. Nguồn: `docs/DECISIONS_PENDING.md` mục E (E1–E8) và F (F1–F3), PRD D29–D33, DESIGN §19, kết quả chạy thử AI (nhánh `feature/spike-studio-ai`), mockup canvas "Màn gia sư — S5b + Studio" (màn 7–9), `THU_VIEN_KIEU_LUYEN_v0.1` (hub).

## 0. Mục tiêu và tiêu chí đạt

Gia sư chỉ **tải đề + đáp án lên → xem → bấm Duyệt**. App lo phần soạn bài trên app, chấm, gắn nhãn và cho em biết câu cần xem lại. Gia sư thấy được **vì sao** em sai, đặc biệt ở đọc hiểu (dạng câu hỏi nào, do đâu).

Đạt khi, trên gia đình thật:
1. Gia sư tải đề Destination (PDF hoặc Word) + đáp án và duyệt được trong ≤ 10 phút, phải sửa ≤ 5 câu.
2. Em làm bài trên app; câu đóng được chấm ngay; em thấy câu sai + giải thích, **không thấy điểm**.
3. "Điểm cần chú ý" tự cập nhật từ bài Studio và từ báo cáo kỹ năng đọc tháng, theo **cùng tên kỹ năng** mà gia sư đang dùng.
4. Chi phí AI trong tháng ≤ $10 trong mọi trường hợp.

## 1. Quyết định của phụ huynh (brainstorm 19–20/10)

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Kết quả Studio dùng để làm gì | **Cả hai**: mặc định là *tín hiệu* (nuôi "Điểm cần chú ý"); bài gia sư đánh dấu **"Kiểm tra chính thức"** thì thêm đường *bằng chứng* (Hộp duyệt, chấm 0–4) |
| Q2 | Cách em làm bài | **Gia sư chọn mỗi bài**: *Luyện* (không giờ, tự lưu) hoặc *Kiểm tra* (đồng hồ, hết giờ tự nộp) |
| Q3 | Câu mở | **App chấm theo đáp án + đáp án chấp nhận**; câu lạ vào hàng "Cần thầy/cô xem", gia sư bấm Đúng/Sai; Đúng → thêm vào đáp án chấp nhận. AI **không** chấm câu trả lời của em |
| Q4 | Khi nào em thấy câu cần xem lại | **Ngay sau khi nộp** (câu đóng); câu mở hiện sau khi gia sư xử xong; bài *Kiểm tra* chỉ hiện sau khi nộp cả bài |
| Q5 | Đề làm trên giấy | **Có**: duyệt xong app tự sinh **khung đề** (số câu → phần → nhãn) để gia sư chỉ bấm câu sai ở "Ghi kết quả bài" |
| Q6 | Kiến trúc | **Xây trên nền S5b** (giao bài, kết quả, nhãn, Điểm cần chú ý) + dùng lại bộ chấm tự động S4 + cầu nối bằng chứng qua Hộp duyệt S5 |
| Q7 | File nhận | **PDF và Word (.docx)**. Không nhận ảnh chụp; `.doc` cũ → nhắc lưu lại thành .docx/PDF |
| Q8 | Đọc hiểu: biết vì sao em sai | **Nhãn "kỹ năng đọc" theo khung TOMO** mà gia sư đang chấm: **Nguyên dùng đủ 14 kỹ năng**, **An dùng bản rút gọn 6**. Thêm chip "Vì sao mình sai?" cho em. **Chỉ nhập kỹ năng; Lexile/CEFR để sau** |
| F1 | Model đọc đề | **Sonnet 5.5** (chạy thử: 60/60 câu, 60/60 đáp án, nhãn 58/60, 66 giây) |

Ghi chú Q8: tin nhắn của phụ huynh viết "An dùng bản rút gọn, An dùng bản full"; Claude hiểu là **An rút gọn, Nguyên đầy đủ** (đúng với đề xuất đang hỏi). Phụ huynh xác nhận khi duyệt spec này.

## 2. Phạm vi

**Trong bước 1** (2 PR):
- **PR A — Kỹ năng đọc (không AI):** bộ nhãn kỹ năng đọc cho 2 track; màn "Nhập báo cáo kỹ năng đọc tháng"; "Điểm cần chú ý" gộp báo cáo tháng + kết quả bài, có cảnh báo "chưa đủ dữ liệu".
- **PR B — Studio:** tải đề + đáp án → AI soạn nháp → gia sư duyệt (sinh khung đề) → giao bài "làm trên app" → em làm → chấm → em xem câu cần xem lại + chip "Vì sao mình sai?" → gia sư xử câu mở → Kết quả + nhãn; cầu nối "Kiểm tra chính thức" → Hộp duyệt.

**Không làm ở bước 1:** gợi ý / soạn bài bổ sung (bước 2); AI chấm câu mở; AI đọc bài em làm trên giấy/Word; tô câu bằng chứng trong bài đọc (bước 2); Lexile/CEFR; kho đề dùng chung nhiều em; nhận ảnh chụp; phần nghe trên app (âm thanh không đi qua app).

## 3. Kỹ năng đọc (PR A)

### 3.1 Bộ nhãn
Thêm vào `english.error_tags` bằng migration seed mới, `group_vi = 'Kỹ năng đọc'`. Tên giữ **song ngữ như báo cáo TOMO** để gia sư nhận ra ngay.

**Track B — 14 kỹ năng (đúng thứ tự TOMO):**

| key | label_vi |
|---|---|
| `doc-author-purpose` | Author's Purpose — Mục đích của tác giả |
| `doc-compare-contrast` | Compare and Contrast — So sánh và đối lập |
| `doc-cause-effect` | Cause and Effect — Nguyên nhân – kết quả |
| `doc-sequence` | Chronology/Sequence — Trình tự thời gian / sự kiện |
| `doc-conclusions` | Draw Conclusions — Rút ra kết luận |
| `doc-fact-opinion` | Fact and Opinion — Sự kiện và ý kiến |
| `doc-main-idea` | Main Idea — Ý chính |
| `doc-inference` | Make Inferences — Suy luận |
| `doc-prediction` | Make Predictions — Dự đoán |
| `doc-summarize` | Summarize — Tóm tắt |
| `doc-evidence` | Use Evidence — Sử dụng chứng cứ |
| `doc-antonyms` | Antonyms — Từ trái nghĩa |
| `doc-context-clues` | Context Clues — Gợi ý từ văn bản |
| `doc-synonyms` | Synonyms — Từ đồng nghĩa |

**Track A — 6 kỹ năng (rút gọn, cùng key với Track B khi trùng):** `doc-main-idea`, `doc-details` (*Details — Tìm chi tiết*; không có trong TOMO, cần cho đề KET), `doc-inference`, `doc-author-purpose`, `doc-context-clues`, `doc-sequence`.

Nhãn chung cũ `A / doc-hieu` ("Đọc hiểu (KET Reading)") được **nghỉ dùng** (`retired_at`) trong cùng migration; dấu nhãn cũ (nếu có) vẫn hiển thị đúng tên. Gia sư góp ý bộ nhãn trong buổi 30 phút; đổi tên/thêm = migration seed mới, không sửa migration đã áp.

### 3.2 Báo cáo kỹ năng đọc tháng
- Bảng mới `english.reading_reports` (append-only, có `supersedes_id` để sửa): `learner_id`, `month` (ngày đầu tháng), `source` (text, mặc định `TOMO`), `rows jsonb` = `[{tag_key, questions int ≥ 0, correct_pct 0–100}]` (chỉ nhãn nhóm "Kỹ năng đọc" của track em), `note`, `recorded_by_member`, `recorded_at`, `client_id`. Một bản hiện hành mỗi (em, tháng, nguồn). Không lưu Lexile/CEFR (để sau).
- Người nhập: **gia sư hoặc phụ huynh** của em đó. Em không thấy.
- Màn nhập: 14 (hoặc 6) dòng sẵn tên kỹ năng, mỗi dòng 2 ô "Số câu" và "%". Dòng để trống = không có câu tháng đó. Mất ~2 phút.
- Hàm ghi qua `security definer`, chỉ service_role gọi, sau `requireAccess` (cùng mẫu S5b).

### 3.3 "Điểm cần chú ý" gộp
- Thêm nhóm **"Kỹ năng đọc"** vào bảng hiện có, mỗi kỹ năng một dòng: % đúng gần nhất theo **báo cáo tháng**, số câu, xu hướng so với tháng trước, và số câu sai từ **bài Studio/kết quả** trong 6 tuần.
- **Ngưỡng dữ liệu:** kỹ năng có < 4 câu trong tháng → ghi "chưa đủ dữ liệu", không tô đỏ. Ngưỡng nằm trong `tutorwork_settings` (`reading_min_questions = 4`), không hard-code.
- Tô "cần chú ý" khi ≥ 4 câu và % < 60 (cài đặt `reading_weak_pct = 60`).
- Đây là **tín hiệu**, không phải bằng chứng; engine S7 không đọc bảng này.

## 4. Studio (PR B)

### 4.1 Luồng

| # | Khối | Ai | Việc | Dùng lại |
|---|---|---|---|---|
| 1 | Tải lên & đọc đề | Gia sư → AI | Tải file đề + file đáp án (PDF/.docx, ≤ 15 MB mỗi file). Server gửi **chỉ 2 file + danh sách tên nhãn của track** cho Sonnet 5.5, nhận bản nháp có cấu trúc | Kho `english-work`, vé tải lên |
| 2 | Duyệt bản nháp | Gia sư | Sửa câu/đáp án/nhãn/kỹ năng đọc/giải thích; câu "cần xem" lên đầu; thêm/xóa câu tay; **Duyệt** → đề bất biến + tự sinh khung đề | Khung đề S5b (`test_frames`) |
| 3 | Giao bài | Gia sư | Bài giao loại **"làm trên app"**: đề nào, *Luyện*/*Kiểm tra* (+ số phút), "Kiểm tra chính thức" (+ 1–2 kỹ năng trong bộ A-v1/B-v1), hạn nộp | `assignments` S5b (thêm kind) |
| 4 | Em làm bài | Em | Trang làm bài, tự lưu; *Kiểm tra* có đồng hồ do server giữ. Đáp án **không** xuống máy em trước khi nộp | Mẫu S4 |
| 5 | Chấm | App + gia sư | Câu đóng và câu khớp đáp án/đáp án chấp nhận: tự chấm. Câu mở không khớp → "Cần thầy/cô xem" → Đúng/Sai; Đúng → thêm đáp án chấp nhận. Xử xong → ghi **Kết quả** (mode frame, khung tự sinh) + **dấu nhãn** | `eng_norm_answer`, `eng_resolve_option` (S4); `eng_record_result`, `tag_marks` (S5b) |
| 6 | Em xem lại | Em | Ngay sau khi nộp: câu sai (đề, câu em viết, đáp án đúng, giải thích đã duyệt), không điểm. Câu đọc sai có chip **"Vì sao mình sai?"** (không biết từ · không tìm ra chỗ trong bài · tìm ra nhưng hiểu sai · hiểu sai câu hỏi · đoán vì hết giờ), không bắt buộc | Mở rộng "Việc cần ôn" |
| 7 | Cầu nối bằng chứng | Gia sư | Bài "chính thức" tạo một mục trong **Hộp duyệt** gắn 1–2 kỹ năng đã chọn; gia sư chấm 0–4 như S5 → bằng chứng. Bài thường chỉ là tín hiệu | Hộp duyệt S5 |

### 4.2 Dữ liệu (schema `english`, migration kế tiếp)

| Bảng | Lưu gì | Quy tắc |
|---|---|---|
| `studio_tests` | Tên, `learner_id`, `track_id`, file đề + file đáp án (`files`), trạng thái `draft → approved → retired`, `supersedes_id`, `frame_id` (sinh khi duyệt), `ai_run_id`, người duyệt + lúc duyệt | Đã duyệt = bất biến; sửa = phiên bản mới; bài đã giao giữ phiên bản cũ |
| `studio_items` | `test_id`, `n`, `part`, `kind` (mcq · gap · transform · wordform · open · out_of_app), `stem`, `passage_ref`, `options`, `key`, `accepted[]`, `tag_key` (nhãn lỗi), `reading_skill_key` (nhãn kỹ năng đọc, chỉ câu đọc), `explanation_vi`, `needs_review`, `review_reason`, `points` | Chỉ staff đọc; đáp án không bao giờ trả cho em trước khi nộp |
| `studio_passages` | Bài đọc/đoạn văn của đề (`test_id`, `ref`, `text`) | Hiện cho em khi làm bài |
| `studio_accepted_additions` | Câu trả lời gia sư bấm Đúng (`item_id`, `answer`, người, lúc) | Append-only |
| `assignments` (+cột) | `kind = 'studio'`, `studio_test_id`, `studio_mode` (`practice`/`test`), `time_limit_min`, `official bool`, `official_target_ids` (≤ 2) | Mở rộng bảng S5b |
| `studio_attempts` | `assignment_id`, `learner_id`, `attempt` (first/retry), `started_at`, `deadline_at` (server tính), `submitted_at`, `submitted_by` (`learner`/`auto_timeout`), `answers jsonb` lúc nộp, `client_submission_id` | Nộp xong bất biến; nộp 2 lần = 1 bản |
| `studio_drafts` | Câu trả lời đang làm (tự lưu) | Mutable, xóa sau khi nộp |
| `studio_item_checks` | Kết quả từng câu: `auto_correct` · `auto_incorrect` · `blank` · `needs_tutor` → `tutor_correct`/`tutor_incorrect` (người, lúc) | Append-only |
| `studio_wrong_reasons` | Chip "Vì sao mình sai?" của em (`attempt_id`, `item_id`, `reason`) | Em ghi được, chỉ một lần mỗi câu |
| `ai_runs` | `purpose` (`studio_extract`), model, token vào/ra, chi phí ước tính USD, trạng thái, lỗi, `prompt_version` | Không lưu nội dung đề trong log |
| `ai_settings` | `enabled` (công tắc phụ huynh), `monthly_cap_usd` (10), `soft_cap_usd` (8) | Chỉ phụ huynh đổi |

Khung đề tự sinh: `test_frames.items[n] = {n, part, tag_key}`; câu đọc dùng `reading_skill_key` làm `tag_key` của khung (một câu đọc được đếm theo kỹ năng đọc). Câu `out_of_app` (phần nghe, câu hình) vẫn có trong khung để chấm giấy.

### 4.3 AI
- Chỉ gọi từ server (route Next.js, `ANTHROPIC_API_KEY` ở Vercel; không bao giờ ở client). Model `STUDIO_EXTRACT_MODEL` mặc định `claude-sonnet-5-5`.
- Đầu vào: PDF gửi thẳng dạng document; `.docx` chuyển thành chữ ở server trước khi gửi. Kèm danh sách nhãn lỗi + kỹ năng đọc của track. **Không gửi**: tên, alias, bài làm hay bất kỳ thông tin nào của em.
- Đầu ra: tool `save_exercise` với JSON schema cố định (như spike, thêm `reading_skill_key`, `passages`, `kind = out_of_app`). Prompt lưu `prompts/studio-extract.v1.md` (có số phiên bản; đổi = file mới).
- Thời gian ~1 phút: màn hiện "AI đang đọc đề…", tối đa 3 lần thử; lỗi → báo rõ + đường làm tay.
- **3 lớp chặn chi phí:** (1) trước mỗi lần gọi, cộng `ai_runs` tháng này: ≥ $8 báo phụ huynh, ≥ $10 từ chối (gia sư vẫn tạo bài/khung bằng tay); (2) trần workspace `learning-os` $10 trên Console; (3) công tắc `ai_settings.enabled` + văn bản đồng ý có câu "AI đọc đề và đáp án của gia sư, không đọc thông tin của con" — phụ huynh duyệt trước khi bật.

### 4.4 Trường hợp khó

| Tình huống | Xử lý |
|---|---|
| AI bỏ sót câu / số câu nhảy / câu đóng thiếu đáp án | Kiểm tra tự động, báo đỏ ở màn duyệt; **chưa duyệt được** khi còn câu đóng thiếu đáp án |
| Đáp án có 2 cách đúng / lệch với đề | `needs_review` + lý do, lên đầu danh sách |
| Phần nghe | `out_of_app`: "làm ngoài app", không chấm trên app |
| Câu dựa vào hình | `needs_review`; gia sư giữ (làm ngoài app) hoặc bỏ |
| `.doc`, ảnh, file > 15 MB | Từ chối với lời nhắn tiếng Việt |
| Mất mạng / đóng tab | Tự lưu ~10 giây và khi rời trang; mở lại làm tiếp; nộp idempotent |
| Hết giờ (*Kiểm tra*) | Server nộp phần đã lưu sau `deadline_at` + 60 giây (`submitted_by = auto_timeout`) |
| Sửa đề sau khi giao | Phiên bản mới; bài đã giao chấm theo phiên bản cũ |
| Gia sư bấm Đúng cho câu lạ | Áp cho bài này và các lần sau; bài đã chốt trước đó **không tự chấm lại** |
| Em làm lại | `attempt = retry`, dấu nhãn `counts = false` (đúng luật S5b) |
| AI tắt / hết trần | Báo rõ; tạo bài bằng tay hoặc dùng khung đề như hiện nay |
| Một bài chỉ một "lần đầu" | Dùng luật sẵn có của `results` theo bài giao |

### 4.5 Ai thấy gì

| | Em | Gia sư của em | Phụ huynh |
|---|---|---|---|
| Đề, bài đọc | Khi làm bài | ✓ | ✓ |
| Đáp án, đáp án chấp nhận | Chỉ câu đã sai, sau khi nộp | ✓ | ✓ |
| Điểm, số câu đúng | ✗ | ✓ | ✓ |
| Giải thích | Câu đã sai, sau khi nộp | ✓ | ✓ |
| Chip "Vì sao mình sai?" | Của mình | ✓ (thống kê) | ✓ |
| Báo cáo kỹ năng đọc tháng | ✗ | ✓ | ✓ |
| Nhật ký AI, chi phí | ✗ | ✗ | ✓ |

## 5. Kiểm thử
- **Unit:** kiểm tra đầu ra AI (số câu liên tục, câu đóng có đáp án, nhãn hợp lệ); chuyển .docx → chữ; tính hạn giờ; chặn trần chi phí; ngưỡng "chưa đủ dữ liệu".
- **DB (Postgres thật):** em không đọc được đáp án/điểm trước và sau khi nộp (chỉ câu sai + đáp án đúng + giải thích); đề đã duyệt bất biến; server tự nộp khi hết giờ; chấm xong ghi `results` + `tag_marks` đúng; một "lần đầu" mỗi bài; báo cáo đọc tháng chỉ nhận nhãn kỹ năng đọc của đúng track; RLS và quyền hàm theo mẫu S5b.
- **E2E (gia đình thử):** gia sư tải đề → duyệt → giao → em làm, nộp, xem câu cần xem lại (không điểm), chọn chip → gia sư xử câu mở → Điểm cần chú ý cập nhật; nhập báo cáo đọc tháng → bảng kỹ năng đọc.
- **AI trong test = AI giả** (trả fixture), không tốn tiền, kết quả ổn định. **Đề mẫu cho test do Claude tự viết** (ngắn, có phần đọc); đề Destination chỉ nằm ở nhánh thử.
- **Thử thật 1 lần trên preview:** phụ huynh tải đề Destination; so với kết quả chạy thử 19/10.

## 6. Thứ tự và phụ thuộc
1. Buổi 30 phút với 2 gia sư: góp ý bộ nhãn kỹ năng đọc + màn Studio.
2. PR A (kỹ năng đọc, không AI) — dùng được ngay với báo cáo TOMO.
3. Phụ huynh duyệt văn bản đồng ý (có câu về AI) và bật công tắc AI.
4. PR B (Studio).
5. Bước 2: gợi ý/soạn bài bổ sung theo "Thư viện kiểu luyện" (có nhóm kỹ năng đọc), tô câu bằng chứng.

## 7. Điểm còn mở (chốt khi lên kế hoạch, không đổi thiết kế)
- Màn duyệt trên điện thoại: chỉ xem được, sửa nên dùng máy tính (gia sư thường dùng máy tính).
- Hiển thị bài đọc dài trong *Kiểm tra*: bài đọc và câu hỏi cạnh nhau trên máy tính, xếp chồng trên điện thoại.
