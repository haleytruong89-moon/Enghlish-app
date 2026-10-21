# Bản đồ kỹ năng A1–C2 + Hồ sơ cấp đang học + Lên cấp — Thiết kế (đã duyệt từng phần 21/10/2026)

Người soạn: Claude (Opus), brainstorm cùng phụ huynh 21/10/2026 (rà soát dữ liệu kỹ năng → phương án 1 "trái tim sớm" → rà sâu A2→C2). Nguồn: hub `studio/REVIEW_SKILL_DATA_2026-10-21.md`, `content/catalogue_v0.2.json`, `content/target_sets_v1.json`, `content/tags/*.json`, migration 0005/0014/0015/0018, UX_COPY_GUIDE §3.2, DESIGN §4 (`mastery_decisions`, chưa xây).

## 0. Mục tiêu và tiêu chí đạt

Trình độ của các con **không cố định**: tăng dần (An A2 → B1 → B2…, Nguyên B2 → C1 → C2) và **không đều giữa các mảng**. App phải (1) có **một bản đồ kỹ năng chuẩn** không sót nhóm nào từ A1 đến C2, (2) cho biết **mỗi con đang học cấp nào ở từng mảng**, (3) **chủ động đưa con lên cấp** dựa trên bài tự học + đánh giá của gia sư, gia sư xác nhận.

Đạt khi:
1. Mọi nhãn và mọi kỹ năng đang dùng (40 nhãn, 24 kỹ năng theo dõi) — và cả 70 kỹ năng danh mục — nằm đúng **1 nhóm của 1 mảng**; ô chọn nhãn không còn danh sách phẳng.
2. Phụ huynh mở trang một em thấy **7 dòng cấp đang học**, biết dòng nào là giả định, dòng nào gia sư đã xác nhận.
3. "Điểm cần chú ý" mở đầu bằng **7 ô mảng**; trả lời được "con yếu mảng nào".
4. (Sau S7) khi một mảng đủ điều kiện, gia sư nhận đề xuất lên cấp kèm bằng chứng, xác nhận trong ~1 phút; bộ kỹ năng của **riêng mảng đó** được thay bằng điểm cốt lõi của cấp mới.

## 1. Quyết định của phụ huynh (21/10/2026)

| # | Câu hỏi | Quyết định |
|---|---|---|
| M1 | Cách làm bản đồ | **Thêm tầng Mảng → Nhóm** + gắn nhãn/kỹ năng hiện có; không phá dữ liệu đã khóa |
| M2 | Mảng | **7 mảng cố định**: Ngữ pháp · Từ vựng · Đọc · Nghe · Viết · Nói · Tư duy & tự học |
| M3 | Ai sửa bản đồ | Claude soạn → gia sư góp ý → **phụ huynh duyệt**; mỗi lần đổi = **phiên bản mới**. Gia sư thêm nhãn riêng ngay trong app, **bắt buộc chọn mảng + nhóm** |
| M4 | Cấp CEFR | Mỗi điểm mang cấp (mảng Tư duy & tự học dùng **bậc nhiệm vụ 1–4**) |
| M5 | Nhãn chung "Đọc hiểu (KET Reading)" của An | Giữ cho dữ liệu cũ, xếp Đọc · Ý chính & chi tiết, **ẩn khỏi ô chọn** |
| Q1 | Phạm vi cấp | **Khung A1–C2 ngay; điểm chi tiết đi trước con 1 cấp** (An tới B1+, Nguyên tới C1), thêm dần |
| Q2 | Bài tự học có tính để lên cấp | **Theo loại mảng**: Đọc/Nghe/Ngữ pháp/Từ vựng — bài tự chấm (đề gia sư đã duyệt) được tính; Viết/Nói/Tư duy — cần gia sư chấm |
| Q3 | Ai xác nhận lên cấp | **Gia sư của em xác nhận, phụ huynh xem** |
| PA | Cách tổ chức lên cấp | **PA1: bản đồ chung + cấp riêng từng mảng + track chỉ là "phong cách học"**, kèm **mốc thi ngoài** (KET/PET/FCE/đề thử vào 10/TOMO) để đối chiếu |
| P1-a | Ngữ pháp | Giữ **10 nhóm** |
| P1-b | "Xoay xở khi thiếu từ" | Đặt ở **Nói** (ngoại lệ duy nhất của quy tắc xếp) |
| P2-a | Cấp khởi điểm | App điền **giả định** (An ~A2, Nguyên ~B2; mảng Tư duy & tự học do Claude đề xuất: An bậc 1, Nguyên bậc 2), nhãn "giả định — chờ cô xác nhận"; gia sư xác nhận/sửa từng mảng trong buổi 30 phút |
| P2-b | Thang | **9 nấc** A1 · A2 · A2+ · B1 · B1+ · B2 · B2+ · C1 · C2; Tư duy & tự học: bậc 1–4 |
| P2-c | Hạ cấp | **Không bao giờ tự hạ**; chỉ gia sư "điều chỉnh" (lên/xuống) có lý do, phụ huynh được báo |
| P2-d | Con có thấy cấp | **Không**; con thấy "Việc cần ôn" theo mảng + lời chúc khi lên cấp |
| P3-a | Ngưỡng mảng | ≥ 80% điểm cốt lõi "Tự làm được" · không điểm cốt lõi nào "Cần cô xem lại" · ≥ 1 bài ôn sau ≥ 14 ngày đạt · mốc ngoài thấp hơn hẳn → gắn cờ, không chặn |
| P3-b | "Tự làm được" với bài tự chấm | ≥ 8 câu · ≥ 2 bài khác nhau · đúng ≥ 75% · bài ôn sau ≥ 14 ngày đúng ≥ 70% |
| P3-c | Nhịp đề xuất | Vào Hộp duyệt ngay + nhắc gộp mỗi tháng; phụ huynh được báo sau khi gia sư xác nhận |
| P3-d | Bộ kỹ năng sau lên cấp | App soạn bộ mới **chỉ đổi mảng vừa lên**; gia sư chốt |
| P4-a | Mockup | **Có**, trước khi code (4 bảng thêm vào canvas mockup) |
| P4-b | Bảng "Kỹ năng đọc" (TOMO) | Chuyển vào ô **Đọc** của Điểm cần chú ý |
| P4-c | Ô chọn nhãn | Mặc định **cấp hiện tại ± 1**, cấp khác thu gọn |

Mọi ngưỡng ở P3 là **cấu hình thử nghiệm** trong chính sách đánh giá phiên bản mới `AP-0.3`, không viết cứng; xem lại sau 3 tháng dữ liệu.

**Nguyên tắc bị thay đổi (ghi rõ):** trước đây kỹ năng gắn cứng theo track (track là trần trình độ). Từ nay **track = phong cách học** (chủ đề, mẫu canvas, chế độ AI, tỉ lệ đề thi), **không** giới hạn cấp. Kỹ năng cấp cao dùng chung cho cả hai con (danh mục v0.3, xem §6).

**Cách gọi:** app ghi **"đang học B1"**, không ghi "đạt B1" — cấp đến từ bằng chứng trong app, không phải bài thi chuẩn hóa. Chỉ mốc thi ngoài mới ghi "đạt".

## 2. Bản đồ kỹ năng `SM-1` (7 mảng · 40 nhóm)

Quy tắc:
1. 7 mảng và 40 nhóm **dùng chung cho cả 2 con và mọi cấp**. Thêm/đổi nhóm = phiên bản bản đồ mới (`SM-2`…), phụ huynh duyệt.
2. **Lá** (điểm) = nhãn (`tag`, tín hiệu) hoặc kỹ năng danh mục (`target`, bằng chứng). Mỗi lá thuộc **đúng 1 nhóm**. Lá có cấp: `level_from`/`level_to` (CEFR 9 nấc) hoặc `task_level` (1–4, mảng Tư duy & tự học); nhãn dùng ở mọi cấp (vd. "Suy luận") để trống cấp.
3. Xếp kỹ năng theo chiều danh mục: L1 → Ngữ pháp · L2 → Từ vựng · L3/L4/L8/X1/X2 → Viết hoặc Nói theo kênh ra · T1–T2 → Đọc hoặc Nghe theo kênh vào · L7, T4 trở lên, A* → Tư duy & tự học. Ngoại lệ duy nhất: `A-L2-COMPENSATE-S` → Nói · Trôi chảy & xoay xở. Nhãn xếp theo nội dung lỗi; nhãn kỹ năng đọc TOMO luôn ở **Đọc**.
4. Nhãn và kỹ năng gần nghĩa nối **"liên quan"** (vd. 🏷 Quá khứ đơn ↔ ★ A-L1-PAST-W; 🏷 Sự kiện & ý kiến ↔ ★ B-T5-DATAOP).

| Mảng (`key`, thang) | Nhóm (`key` — tên) |
|---|---|
| **Ngữ pháp** (`grammar`, CEFR) | `gr-tense` Thì · `gr-modal` Động từ khuyết thiếu · `gr-conditional` Câu điều kiện & giả định · `gr-passive-report` Bị động, tường thuật, nhờ · `gr-clause` Mệnh đề & nối câu · `gr-noun-det` Danh từ, mạo từ, lượng từ · `gr-compare-prep` So sánh, tính từ, giới từ · `gr-verb-pattern` V-ing / to V · `gr-emphasis` Nhấn mạnh & đảo ngữ · `gr-transform` Tổng hợp & biến đổi câu |
| **Từ vựng** (`vocab`, CEFR) | `vo-topic` Từ theo chủ đề · `vo-word-form` Dạng từ · `vo-colloc-idiom` Kết hợp từ, cụm động từ, thành ngữ · `vo-context` Nghĩa trong ngữ cảnh · `vo-register` Văn phong & từ học thuật |
| **Đọc** (`reading`, CEFR) | `re-gist-detail` Ý chính & chi tiết · `re-inference` Suy luận & dự đoán · `re-purpose-tone` Mục đích, thái độ, giọng điệu · `re-structure` Cấu trúc & lập luận của bài · `re-word-ref` Từ & tham chiếu trong bài · `re-strategy` Chiến lược & đọc rộng |
| **Nghe** (`listening`, CEFR) | `li-gist-detail` Ý chính & chi tiết · `li-attitude` Thái độ & hàm ý người nói · `li-argument-notes` Theo dõi lập luận & ghi chép · `li-sound` Âm & giọng |
| **Viết** (`writing`, CEFR) | `wr-sentence-mech` Câu, chính tả, dấu câu · `wr-paragraph` Đoạn & bố cục · `wr-cohesion` Liên kết & mạch lạc · `wr-genre` Thể loại · `wr-register` Văn phong & độ rõ |
| **Nói** (`speaking`, CEFR) | `sp-pron` Phát âm & ngữ điệu · `sp-fluency` Trôi chảy & xoay xở · `sp-present` Trình bày & giải thích · `sp-interact` Tương tác & thảo luận |
| **Tư duy & tự học** (`thinking`, bậc 1–4) | `th-cause` Nguyên nhân & giải thích · `th-argue` Lập luận & kết luận · `th-evaluate` Đánh giá nguồn & bằng chứng · `th-synthesis` Tổng hợp & chuyển tải · `th-exam` Chiến lược làm bài thi · `th-self` Tự học |

Ví dụ nội dung từng nhóm theo cấp (A1–A2 / B1 / B2 / C1–C2) là phần đã duyệt ở Phần 1 của buổi brainstorm; dữ liệu đầy đủ (mô tả nhóm theo cấp, lá, cấp, liên quan) nằm trong file nội dung `content/skill_map/SM-1.json` (bản đọc bằng code; seed bằng migration, khóa phiên bản như cấu hình khác).

Đã đối chiếu với: CEFR Companion Volume 2020 (tiếp nhận / sản sinh / tương tác / chuyển tải), Pearson GSE và Cambridge English Profile (ngữ pháp, từ vựng), các phần thi KET→CPE, dạng câu thường gặp của đề vào 10 Hà Nội (ngữ âm/trọng âm → `sp-pron`, đáp lời giao tiếp → `sp-interact`, tìm lỗi sai → `gr-transform`; **gia sư Nguyên kiểm lại theo đề các năm gần đây**).

**Phủ hiện tại** (nhóm có ≥ 1 lá đang dùng): **An 17/40**, **Nguyên 19/40**. Trống lớn: Nguyên **cả mảng Nghe**; cả hai: `wr-genre`, `sp-interact`, `th-synthesis`, `gr-noun-det`, `gr-verb-pattern`, `gr-emphasis`, `vo-register`, `re-strategy`. Đây là đầu vào cho bộ kỹ năng A-v2/B-v2 (§6).

Xếp lá hiện có (đủ 40 nhãn + 24 kỹ năng):

| Nhóm | An | Nguyên |
|---|---|---|
| `gr-tense` | 🏷 hien-tai-don, hien-tai-don-s-es, qua-khu-don · ★ A-L1-PAST-W | |
| `gr-compare-prep` | 🏷 gioi-tu-thoi-gian, so-sanh | |
| `gr-modal` | | 🏷 modal-suy-doan |
| `gr-conditional` | | 🏷 cau-dieu-kien-dao-ngu, wish-would-rather |
| `gr-passive-report` | | 🏷 bi-dong-nho-tuong-thuat |
| `gr-clause` | | ★ B-L1-COMPLEX-W |
| `gr-transform` | | ★ B-L1-TRANSFORM-W |
| `vo-topic` | 🏷 tu-vung-chu-de · ★ A-L2-CHUNKS | ★ B-L2-PRECISE |
| `vo-word-form` | | 🏷 dang-tu |
| `vo-colloc-idiom` | | 🏷 cum-dong-tu, thanh-ngu |
| `vo-context` | | 🏷 tu-vung-ngu-canh · ★ B-L2-CLOZE |
| `re-gist-detail` | 🏷 doc-main-idea, doc-details, doc-hieu (ẩn) · ★ A-T1-TEXT-R | 🏷 doc-main-idea, doc-summarize · ★ B-T1-EXAM-R |
| `re-inference` | 🏷 doc-inference | 🏷 doc-inference, doc-conclusions, doc-prediction · ★ B-T2-ASSUME-R |
| `re-purpose-tone` | 🏷 doc-author-purpose | 🏷 doc-author-purpose |
| `re-structure` | 🏷 doc-sequence | 🏷 doc-sequence, doc-cause-effect, doc-compare-contrast, doc-fact-opinion, doc-evidence · ★ B-T1-ARG-R |
| `re-word-ref` | 🏷 doc-context-clues | 🏷 doc-context-clues, doc-synonyms, doc-antonyms |
| `li-gist-detail` | 🏷 nghe · ★ A-T1-TEXT-L | |
| `wr-sentence-mech` | 🏷 viet-cau | |
| `wr-paragraph` | ★ A-L3-PARA-W | |
| `wr-cohesion` | ★ A-L3-CAUSE-W | 🏷 tu-noi-lap-luan |
| `sp-pron` | 🏷 phat-am | 🏷 phat-am |
| `sp-fluency` | ★ A-X1-TURN, A-L2-COMPENSATE-S | |
| `sp-present` | ★ A-L3-CAUSE-S, A-L4-PROCESS-S | ★ B-L4-EXPLAIN-S |
| `th-cause` | ★ A-T4-CAUSE | |
| `th-argue` | ★ A-T7-OPINION | ★ B-T7-ARGUE, B-T11-QUALIFY |
| `th-evaluate` | | ★ B-T5-DATAOP, B-T5-SOURCE |

46 kỹ năng danh mục còn lại (ngoài A-v1/B-v1) cũng được xếp vào bản đồ theo quy tắc 3, để bộ kỹ năng sau chọn được theo nhóm.

## 3. Hồ sơ "cấp đang học"

- Mỗi em có **7 dòng** (một dòng/mảng): cấp đang học, trạng thái dòng (`giả định` / `đã xác nhận`), ngày + người xác nhận gần nhất, tiến độ trong cấp (`n/N điểm cốt lõi đã Tự làm được` — hiện "—" cho tới khi S7 có trạng thái kỹ năng), mốc ngoài gần nhất liên quan.
- **Sổ quyết định cấp** (`level_decisions`, append-only): mảng, cấp cũ → cấp mới, loại (`baseline` / `level_up` / `adjust`), lý do (bắt buộc với `adjust`), bằng chứng (jsonb), phiên bản bản đồ + chính sách, người quyết (member + vai), thời điểm. **Cấp hiện tại = dòng gần nhất**; chưa có dòng nào → hiện cấp giả định của track (cấu hình trong `SM-1.json`, không phải dòng dữ liệu).
- **Ai ghi:** `baseline` và `adjust` — chỉ **gia sư có quan hệ hiệu lực với em** (kiểu D15, ép trong DB); `level_up` — chỉ qua luồng xác nhận đề xuất (S7). Phụ huynh xem, không ghi.
- **Sổ mốc ngoài** (`external_results`, append-only): kỳ thi (`KET`/`PET`/`FCE`/`CAE`/`CPE`/`VAO10_MOCK`/`SCHOOL`/`OTHER`), ngày, điểm (chữ), mảng liên quan, file kèm (kho `english-work` đã có), ghi chú, người nhập (phụ huynh hoặc gia sư). Báo cáo TOMO giữ sổ `reading_reports` đã có (PR #16) và được hiển thị như mốc ngoài của mảng Đọc. Mốc ngoài **không tự đổi cấp**.
- Học sinh **không** đọc được hai sổ này.

## 4. Lên cấp (S7)

Luồng: bằng chứng mới → app tính lại từng mảng (`Đang học` → `Sắp đủ` → `Đủ điều kiện`) → ở `Sắp đủ` app gợi ý bài còn thiếu và báo "cần soạn điểm cốt lõi cho cấp tiếp" nếu chưa có → ở `Đủ điều kiện` tạo **đề xuất lên cấp** vào Hộp duyệt (tab "Lên cấp") của gia sư em đó → **Xác nhận / Chưa (lý do) / Cần thêm bài** → xác nhận ghi `level_up` + báo phụ huynh + lời chúc cho em (một lần) → app soạn **bộ kỹ năng mới chỉ đổi mảng đó** → gia sư chốt.

- "Tự làm được" của một điểm: mảng sản sinh theo thang 5 bậc đã có (UX_COPY_GUIDE §3.2); mảng tiếp nhận theo P3-b.
- Điều kiện mảng theo P3-a. Điểm cốt lõi = lá `core = true` của cấp đó trong bản đồ.
- App **không tự hạ cấp**; dữ liệu xấu đi → "Cần cô xem lại" ở điểm đó, giữ cấp.
- Chi tiết thiết kế S7 (bảng đề xuất, engine, bộ kỹ năng theo em) làm trong spec/kế hoạch S7; phần này chỉ chốt luật.

## 5. Màn hình

| Màn | Ai | Lát |
|---|---|---|
| Chọn nhãn / chọn kỹ năng theo **tab 7 mảng**, tiêu đề nhóm, tìm nhanh, "hay dùng" lên đầu; nhãn riêng bắt buộc chọn mảng + nhóm; ẩn lá `hidden_in_picker` | Gia sư, phụ huynh | SM-1 |
| Điểm cần chú ý: **7 ô mảng** → bấm ra bảng chi tiết; bảng Kỹ năng đọc nằm trong ô Đọc | Gia sư, phụ huynh | SM-1 |
| **Hồ sơ cấp** (7 dòng, chip trạng thái, bấm ra chi tiết mảng: nhóm, điểm ở cấp hiện tại, điểm cần chú ý, mốc ngoài, lịch sử) | Gia sư, phụ huynh | SM-2 |
| **Xác nhận cấp khởi điểm** / **Điều chỉnh cấp** (bắt buộc lý do) | Gia sư | SM-2 |
| **Thêm kết quả thi ngoài** | Phụ huynh, gia sư | SM-2 |
| Ô chọn nhãn sắp theo **cấp hiện tại ± 1** | Gia sư, phụ huynh | SM-2 |
| Trang chủ phụ huynh: ô **thay đổi cấp gần đây** | Phụ huynh | SM-2 |
| Trang chủ em: **Việc cần ôn theo mảng** (≤ 3, không cấp, không điểm) | Học sinh | SM-2 |
| Hộp duyệt tab **Lên cấp**, lời chúc cho em, nhắc tháng, bộ kỹ năng mới | Gia sư, học sinh | S7 |

Mockup (4 bảng: Hồ sơ cấp, Duyệt lên cấp, Chọn nhãn theo mảng, Trang chủ của em) thêm vào canvas "Màn gia sư — S5b + Studio" và **phụ huynh duyệt trước khi code UI**.

## 6. Dữ liệu và thứ tự làm

### Dữ liệu mới (chỉ thêm — expand)

| Bảng / file | Lát | Ghi chú |
|---|---|---|
| `content/skill_map/SM-1.json` | SM-1 | Nguồn sự thật của bản đồ: mảng, nhóm (mô tả theo cấp), lá (tag theo track / target), cấp, `core`, `hidden_in_picker`, liên quan, cấp giả định theo track |
| `english.skill_maps` | SM-1 | Phiên bản bản đồ (`SM-1`), trạng thái `published`, bất biến sau công bố |
| `english.skill_domains`, `english.skill_groups` | SM-1 | Khóa `(map_id, key)`; `domains.scale` ∈ `cefr` / `task_level` |
| `english.skill_leaves` | SM-1 | `(map_id, kind, track_id, ref_key)` duy nhất; `group_key`; `level_from`/`level_to` hoặc `task_level`; `core`; `hidden_in_picker`; `related text[]` |
| `english.error_tags.group_key` (cột mới, nullable) | SM-1 | Chỉ cho nhãn riêng (`origin = 'custom'`); hàm thêm nhãn mới bắt buộc `group_key` hợp lệ trong bản đồ hiện hành; nhãn riêng cũ chưa có nhóm → mục "Chưa xếp mảng" + hàm xếp nhóm |
| `english.level_decisions` (append-only) | SM-2 | §3; thêm vào `eng_purge_learner` / `eng_purge_preview` |
| `english.external_results` (append-only) | SM-2 | §3; thêm vào xóa dữ liệu một em (gồm file) |
| `assessment_policies` `AP-0.3` | S7 | Ngưỡng P3-a/P3-b |
| đề xuất lên cấp, trạng thái kỹ năng, bộ kỹ năng theo em | S7 | Theo thiết kế `mastery_decisions` / `competency_state` của DESIGN, mở rộng theo spec S7 |
| Danh mục `0.3` + bộ `A-v2`/`B-v2` | Nội dung v0.3 | Kỹ năng **dùng chung** (mã `S-…`), điểm cốt lõi theo cấp (An tới B1+, Nguyên tới C1), lấp trống §2; bỏ ràng buộc "bộ kỹ năng chỉ cùng track" của `eng_assign_target_set` theo kiểu expand (cho phép target track riêng **hoặc** chung) |

Đọc: hàm `eng_skill_map(p_learner)` trả bản đồ hiện hành cho em (mảng → nhóm → lá; nhãn theo track của em + nhãn riêng của gia đình; kỹ năng trong bộ hiện tại của em + toàn bộ kỹ năng danh mục có cờ "trong bộ"). Điểm cần chú ý **không đổi SQL**: phía app gộp kết quả `eng_weak_points` theo bản đồ. Tất cả ghi qua hàm security definer (service_role sau `requireAccess`), `search_path = ''`.

### Thứ tự làm

| # | Lát | Nội dung | Migration | Ước tính |
|---|---|---|---|---|
| 0 | Mockup | 4 bảng trên canvas → phụ huynh duyệt | — | ½–1 ngày |
| 1 | **SM-1 Bản đồ kỹ năng** | Seed bản đồ + xếp 40 nhãn, 70 kỹ năng; ô chọn theo mảng; nhãn riêng có nhóm; Điểm cần chú ý 7 ô; ẩn `doc-hieu` | `0019` | 3–4 ngày |
| 2 | **SM-2 Hồ sơ cấp** | Hai sổ mới; Hồ sơ cấp; xác nhận cấp khởi điểm / điều chỉnh; mốc ngoài; ô chọn ± 1 cấp; trang chủ phụ huynh + em | `0020` | 3 ngày |
| 3 | S6 | Góp ý cho em + làm lại (như kế hoạch cũ) | theo S6 | theo S6 |
| 4 | Nội dung v0.3 | Danh mục 0.3 (kỹ năng chung, điểm cốt lõi theo cấp), A-v2/B-v2, `SM-2` nếu cần thêm lá; gia sư rà; seed qua `gen:config -- --new` | kế tiếp | ~1 tuần (gồm thời gian gia sư rà) |
| 5 | **S7 Lõi tiến bộ** | Trạng thái kỹ năng, `AP-0.3`, engine lên cấp, tab Lên cấp, bộ kỹ năng mới theo mảng, lời chúc, nhắc tháng | kế tiếp | 1,5–2 tuần |
| 6 | Studio PR B | Studio gắn lá theo bản đồ | kế tiếp | theo spec Studio |
| 7 | S8, S9 | Như kế hoạch | | |

Mỗi lát: kế hoạch riêng (`docs/superpowers/plans/…`), builder làm, Opus review, PR tiếng Việt có hướng dẫn thử + SQL cần áp. Kế hoạch chi tiết đầu tiên: **SM-1**.

## 7. Không làm trong các lát này

- Không gán "đạt" CEFR từ bằng chứng trong app; không hiện cấp hay điểm cho học sinh.
- Không tự hạ cấp; AI không đề xuất lên cấp, không chấm Viết/Nói/Tư duy.
- Không email / thông báo đẩy (chỉ thông báo trong app).
- Không soạn điểm chi tiết C1–C2 cho An hay C2 cho Nguyên lúc này (chỉ khung nhóm).
- Không sửa migration đã áp; không sửa danh mục 0.2.1 / A-v1 / B-v1 đã khóa.

## 8. Rủi ro

| Rủi ro | Giảm |
|---|---|
| Xếp lá sai nhóm | Test: mọi nhãn seed và mọi kỹ năng danh mục có đúng 1 lá; gia sư rà `SM-1.json` trước khi công bố |
| Bản đồ phình to, ô chọn rối | Tab theo mảng + lọc ± 1 cấp + ẩn lá cũ |
| Cấp giả định bị hiểu là thật | Nhãn "giả định — chờ cô xác nhận" cho tới khi gia sư ghi `baseline` |
| Đổi nguyên tắc track gây lỗi bộ kỹ năng | Làm ở lát nội dung v0.3, expand: chỉ **cho phép thêm** kỹ năng chung, không đổi bộ cũ |
