# Learning OS — PRD DELTA "FAMILY EDITION" v1.0 (DRAFT)

*Ngày: 11/10/2026 · **v1.1: 13/10/2026 (2 track song song)** · Chủ dự án: phụ huynh · Trạng thái: phụ huynh đã đồng ý hướng đi; chờ duyệt chi tiết*
*Tài liệu gốc: Master App Architecture v1.0 + MVP PRD v1.0 (07/10/2026). File này **chỉ ghi phần khác** với PRD gốc; mọi điều không nhắc tới thì **PRD v1.0 vẫn áp dụng**. Khi hai tài liệu mâu thuẫn, file này thắng.*
*Đi kèm: `CATALOGUE_v0.2.md` + `catalogue_v0.2.json` (năng lực, rubric) · `DESIGN_v0.2.md` (kỹ thuật) · mockup 5 màn.*

---

## 0. Một câu tóm tắt

Giữ nguyên **kiến trúc** và **hợp đồng đo lường** (PRD §6). Cắt phần vận hành kiểu doanh nghiệp để **một phụ huynh + Claude Code** build và vận hành được. **Một nền tảng cho 2 con, build song song cả 2 track** (cập nhật v1.1 — 13/10/2026): Track A (An) như cũ; Track B (Nguyên) chạy **ngay**, theo hướng **pha trộn có lợi cho thi vào 10** cho đến kỳ thi, rồi chuyển sang hồ sơ B2→C1 đầy đủ (70/30) từ hè 2027.

> **v1.1 thay thế:** D12 (Track B từ hè 2027) → D23–D27 bên dưới. Mọi chỗ ghi "⏸ bật cùng Track B" nay hiểu theo bảng §2.1.

---

## 1. Quyết định (tiếp nối D1–D10 của SPEC v0.1)

| # | Quyết định | Ngày | Thay thế/sửa |
|---|---|---|---|
| D11 | Chấp nhận Master Architecture v1.0 (MA-01…MA-10) làm kim chỉ nam; triển khai theo **Family Edition** | 08/10 | Thay SPEC/DESIGN/BACKLOG v0.1 |
| D12 | Track B = **Nguyên** (lớp 9). Bây giờ chỉ soạn cấu hình + baseline; **chạy đầy đủ từ hè 2027** sau kỳ thi vào 10 | 08/10 | PRD §11.1 (pilot 2 em cùng lúc) |
| D13 | **Giữ D2: không lưu audio trên cloud.** Bài nói = transcript tạo trên máy + chỉ số. Fluency/Pronunciation do gia sư ghi trực tiếp trong buổi | 08/10 | PRD FR-09, PF-05, §10.1 (phần audio) |
| D14 | **Supabase dùng chung project với Launcher**, schema `english` riêng, lịch sử migration riêng, backup mã hóa hằng đêm; tách khi chạm ngưỡng (REVIEW §12) | 08/10 | — |
| D15 | **Duyệt evidence chia đôi:** gia sư duyệt checkpoint + bài quan sát trực tiếp trong buổi; phụ huynh duyệt phần còn lại trong pilot. Mọi quyết định ghi người duyệt + vai trò | 08/10 | PRD FR-13a ("mọi observation cần tutor approval") |
| D16 | **Không chấm chéo trong pilot.** Chỉ so AI vs người duyệt trên tập chấm mù | 08/10 | PRD §8.4, O-07 |
| D17 | AI theo track: **Track A = Reviewer + Coach**; Track B thêm Clarifier + Challenger khi bật | 11/10 | PRD FR-12 |
| D18 | Trần AI **$10/tháng** (cảnh báo ở $8); model đặt bằng biến môi trường; hết trần → chỉ làm thủ công | 11/10 | PRD O-05 |
| D19 | **8 loại hoạt động** dùng chung (mục 4) | 11/10 | PRD §11.2 "tám activity templates" |
| D20 | Catalogue v0.2 (16 dimension PRD + 2 dimension gia sư-quan sát X1 Fluency, X2 Pronunciation) thay framework v0.1 | 11/10 | Framework/Rubric v0.1 |
| D21 | **Target set pilot Track A v1 ≈ 12 target**, gia sư chốt sau baseline; mẫu số coverage = target set có version | 11/10 | — |
| D23 | **Build song song 2 track; Nguyên dùng thử ngay cùng gia sư** (thay D12) | 13/10 | D12 |
| D24 | Track B đến kỳ thi vào 10: **~60% bám đề thi** (đọc hiểu, suy luận, ngữ pháp/từ vựng trong ngữ cảnh, viết lại câu) + **~40% tư duy – lập luận** chủ đề chủ yếu xã hội. Tỷ trọng 70/30 (FR-22) áp dụng từ hè 2027 | 13/10 | Track B "draft_2027" |
| D25 | Nhịp Track B: **1 chủ đề/tuần** (như An) | 13/10 | — |
| D26 | Gia sư tiếng Anh của Nguyên **đồng ý dùng app** (duyệt bài kiểm tra trong buổi + ghi chú sau buổi) | 13/10 | — |
| D27 | **Pilot thủ công cả 2 em bắt đầu ngay** (Pilot Kit A/B v0.2), nhập vào app khi app sẵn sàng (`provenance = manual_import`) | 13/10 | — |
| D28 | App xưng "bạn" với học sinh; tên 5 bậc theo UX_COPY_GUIDE v0.1 | 13/10 | — |
| D22 | Giữ nguyên quy tắc trạng thái PRD §6.4 (Independent: ≥3 first-attempt episode, ≥2 bối cảnh, trải ≥7 ngày, ≥1 checkpoint quan sát trực tiếp; delayed ≥14 ngày từ lần luyện gần nhất) — **là cấu hình pilot có version** | 11/10 | Rubric v0.1 §7 |

---

## 2. Phạm vi theo FR

**Ký hiệu:** ● Đầy đủ như PRD · ◐ Light (bản rút gọn ghi ở cột "Family") · ○ Để sau (P1) · ⏸ Bật cùng Track B (hè 2027)

| FR | Tên | Mức | Family Edition (chỉ ghi phần khác PRD) |
|---|---|:---:|---|
| FR-01 | Quyền theo quan hệ học sinh | ● | Có 2 em, 2 gia sư → test "đổi ID sang em kia" ngay lát S0 |
| FR-02 | Consent | ◐ | Một bản ghi consent có version cho mỗi người; công tắc "AI on/off" theo từng em. Không có luồng xác minh tuổi tự động (phụ huynh tạo tài khoản) |
| FR-03 | Cấu hình track, version | ● | Seed từ `catalogue_v0.2.json` |
| FR-04 | Baseline | ● | Làm ngoài app rồi nhập được. Track B: chỉ soạn bộ đề, chưa chạy |
| FR-05 | Giao inquiry từ mẫu | ◐ | Mẫu + snapshot khi giao + nháp/công bố. Chưa có preview theo vai trò |
| FR-06 | Nguồn | ◐ | Link + text được phép dán. **PDF → ○.** Video: xem mục 6.3 |
| FR-07 | Đọc/nghe + câu hỏi | ● | Annotation → ○. Mở transcript bài nghe = ghi hỗ trợ (giữ UAT-07) |
| FR-08 | Thinking Canvas | ◐ / ⏸ | Basic cho Track A. Advanced ⏸ |
| FR-09 | Nói | ◐ | **Theo D13:** ghi âm + STT trên máy → nộp transcript gốc (không sửa) + chỉ số. Sửa lỗi nhận dạng = transcript version mới, gia sư thấy diff. Không upload audio. Nếu STT trên máy không đạt (lát Sp) → gia sư gõ/ghi trong buổi |
| FR-10 | Viết + snapshot | ● | Autosave đơn giản; chống ghi đè 2 tab → ○ (chỉ cảnh báo) |
| FR-11 | Mode + mức hỗ trợ | ● | Lõi chống thổi phồng — không cắt |
| FR-12 | Chế độ AI | ◐ | D17. Mỗi lượt 1 câu hỏi, tối đa 3 lượt/vấn đề, giữ nguyên |
| FR-13 | Inbox + xác nhận | ● | D15 (người duyệt = gia sư hoặc phụ huynh). Tập chấm mù: bài checkpoint gia sư chấm trước khi thấy điểm AI |
| FR-14 | Phản hồi + retry | ● | — |
| FR-15 | Engine theo dimension + rebuild | ● | — |
| FR-16 | Next action | ◐ | 5 loại: retry, giảm scaffold, delayed check, transfer check, gia sư can thiệp |
| FR-17 | Retention + transfer | ● | — |
| FR-18 | Dashboard | ◐ | 1 màn phụ huynh, 1 màn gia sư, 1 màn "vì sao trạng thái này" |
| FR-19 | Báo cáo tháng | ◐ | Mẫu cố định, người duyệt công bố. AI soạn nháp → ○ |
| FR-20 | Comment + lesson note | ◐ | Chỉ lesson note. Comment theo bài → ○ |
| FR-21 | Export/xóa | ◐ | Export JSON (có quan hệ bài → đánh giá → quyết định). Xóa = hàm quản trị có checklist + biên nhận. Không ZIP/manifest hash |
| FR-22 | 70/30 | ⏸ | Bật cùng Track B |
| FR-23 | Vận hành AI | ◐ | Bảng `ai_runs`, budget cap, kill switch theo mode, chạy lại có kiểm soát. Không dashboard riêng |
| FR-24 | Accessibility | ◐ | Keyboard cho luồng nộp/duyệt, nhãn form, không chỉ dựa vào màu, nút ≥ 44px. Không kiểm WCAG thủ công đầy đủ |
| **FX-01** *(mới)* | Snapshot cho SkillGrow | ◐ | Nút xuất JSON chỉ đọc (mục 6.1) |
| **FX-02** *(mới)* | Dữ liệu thử | ● | Cờ `is_test` trên learner; engine/báo cáo/snapshot bỏ qua; preview chỉ dùng learner thử |
| **FX-03** *(mới)* | Tích hợp Launcher | ◐ | App slot + deep link (mục 6.2) |

### 2.1. Track B (v1.1) — bật gì ngay, gì sau kỳ thi

| Hạng mục | Từ bây giờ | Từ hè 2027 |
|---|---|---|
| FR-08 Canvas Advanced | ◐ bản gọn: claim – bằng chứng – giới hạn – kết luận có điều kiện | ● đầy đủ |
| FR-07 + bài dạng đề (MCQ, điền đoạn văn, viết lại câu) | ● tự chấm theo đáp án (`answer_key`), gia sư duyệt | Giữ |
| FR-12 AI | Reviewer + Coach (như Track A) | + Clarifier, Challenger |
| FR-22 70/30 | Không áp dụng (chỉ ghi nhãn chủ đề) | ● |
| Chỉ số đề thử 40 câu (AGG-B-EXAM-MOCK) | Nhập điểm theo phần mỗi tháng (làm ngoài app) | Bỏ sau kỳ thi |

**NFR:** NFR-01/03/04/07/08/09 giữ (đo trên thiết bị thật của An, không load test). NFR-02 rút gọn như FR-10. **NFR-05 → backup hằng đêm (RPO ~24 giờ)** + diễn tập khôi phục 1 lần trước pilot. NFR-06 như FR-24. NFR-10 giữ (không có audio nên đơn giản hơn).

---

## 3. Hợp đồng đo lường — áp dụng ra sao

PRD §6 giữ **nguyên văn**. Family Edition chỉ thêm:

| Điểm | Quy định Family |
|---|---|
| Thang chất lượng | 0–4 + NULL theo PRD §6.1; mô tả từng mức theo dimension ở `CATALOGUE_v0.2` |
| Neo cho mức 3 | Mức 3 cần **đạt tất cả success_criteria** của target; mức 4 cần thêm mô tả mức 4 của dimension (catalogue `scoring_contract`) |
| Không có cơ hội quan sát | Theo `opportunity_rule` của từng target → NULL, không phải 0 |
| Người duyệt (D15) | `validator_role ∈ {tutor, parent}`. Checkpoint và quan sát trực tiếp: **chỉ gia sư**. Engine chỉ đếm evidence đã duyệt |
| Điều kiện "checkpoint quan sát trực tiếp" của Independent | Gia sư quan sát trong buổi (ACT-SPEAK-LIVE hoặc bài làm tại buổi) |
| Target set pilot Track A v1 | Đề xuất 12 target (mục 3.1); gia sư chốt sau baseline; mọi báo cáo ghi rõ mẫu số |
| Ngưỡng (3 episode, 7/14 ngày…) | Lưu trong `assessment_policy` có version `AP-0.2-pilot`; đổi = version mới, không sửa lịch sử |
| Calibration (D16) | So AI vs người duyệt trên tập checkpoint chấm mù; báo cáo: khớp tuyệt đối, lệch trung bình theo dimension, n. **Ghi rõ giới hạn: không có người chấm thứ hai** |

### 3.1. Đề xuất target set pilot Track A v1 (12)

| Nhóm | Target |
|---|---|
| Language | A-L3-CAUSE-S · A-L3-CAUSE-W · A-L3-PARA-W · A-L4-PROCESS-S · A-L1-PAST-W · A-L2-CHUNKS · A-L2-COMPENSATE-S |
| Thinking | A-T1-TEXT-R · A-T1-TEXT-L · A-T4-CAUSE · A-T7-OPINION |
| Gia sư quan sát | A-X1-TURN |
| Autonomy (theo dõi, không vào mẫu số) | A3 Revision, A1, A5 hiển thị như góc nhìn tổng hợp (PRD §6.4 ngoại lệ) |

Lý do: bám nhận định gia sư (nói/viết yếu hơn), sở thích khoa học (nguyên nhân–quá trình), và đủ cả nghe/đọc tách modality.

### 3.2. Đề xuất target set pilot Track B v1 (12) — pha trộn có lợi cho thi

| Nhóm | Target | Vì sao |
|---|---|---|
| Bám đề thi (~60%) | B-T1-EXAM-R · B-L2-CLOZE · B-L1-TRANSFORM-W · B-T1-ARG-R · B-T2-ASSUME-R · B-L2-PRECISE · B-L1-COMPLEX-W | Đọc hiểu, suy luận, từ/dạng từ trong ngữ cảnh, viết lại câu — đúng dạng đề vào 10; PRD ghi Nguyên "đọc hiểu và ngữ pháp chưa chắc" |
| Tư duy – lập luận (~40%) | B-T5-DATAOP · B-T5-SOURCE · B-T7-ARGUE · B-T11-QUALIFY · B-L4-EXPLAIN-S | Nền cho D01/IELTS sau này; giữ hứng thú với chủ đề xã hội |
| Theo dõi, không vào mẫu số | AGG-B-EXAM-MOCK (đề thử 40 câu/tháng), AGG-B-L1-ERRORS | Tín hiệu sẵn sàng thi |

Gia sư của Nguyên chốt sau baseline. Catalogue 0.2.1 đã thêm 3 target bám đề (B-T1-EXAM-R, B-L1-TRANSFORM-W, B-L2-CLOZE) — câu hỏi đều **tự soạn theo dạng đề**, không chép đề chính thức.

---

## 4. Tám loại hoạt động (D19)

| ID | Hoạt động | Track | Evidence chính |
|---|---|---|---|
| ACT-SOURCE-QA | Đọc/nghe nguồn → câu hỏi ý chính/chi tiết/suy luận | A, B | T1, T2 (tách đọc/nghe) |
| ACT-CANVAS-BASIC | Canvas: ý chính – vì sao – ví dụ | A | T4, T7, T9 |
| ACT-CANVAS-ADV | Canvas: claim, bằng chứng, giới hạn, giải thích khác, kết luận có điều kiện | B ⏸ | T5, T7, T9, T11 |
| ACT-SPEAK-MONO | Nói độc thoại; STT trên máy, chỉ lưu transcript + chỉ số | A, B | L3, L4, L7, L2 |
| ACT-SPEAK-LIVE | Trao đổi trực tiếp với gia sư, ghi vào lesson note | A, B | L8, X1, X2, checkpoint |
| ACT-WRITE | Viết trong app hoặc dán từ ngoài (khai báo hỗ trợ) | A, B | L1, L3, L4, L7, L8 |
| ACT-REVISE | Sửa bài của chính mình; cặp trước–sau = 1 episode | A, B | A3 |
| ACT-SELF-REVIEW | Tự kiểm/tự đánh giá/lập kế hoạch | A, B | A1 |

Mỗi inquiry Track A thường gồm: SOURCE-QA → CANVAS-BASIC → SPEAK-MONO hoặc WRITE → SELF-REVIEW → phản hồi → REVISE; sau ≥14 ngày: delayed check; khi đủ điều kiện: transfer check.

---

## 5. AI trong Family Edition

| Chế độ | Track A | Track B | Model mặc định (env, đổi được) | Ghi chú |
|---|:---:|:---:|---|---|
| Reviewer | ● | ⏸ | `REVIEWER_MODEL` (đề xuất Sonnet 5.5) | Đề xuất observation theo target; abstain khi không đủ; không ghi mastery |
| Coach | ● | ⏸ | `COACH_MODEL` (đề xuất Haiku 4.5) | Gợi ý trước, không viết hộ; bị chặn ở backend trong INDEPENDENT_CHECK |
| Clarifier | — | ⏸ | `COACH_MODEL` | Bật cùng Track B |
| Challenger | — | ⏸ | `REVIEWER_MODEL` | Bật cùng Track B |
| Báo cáo tháng nháp | ○ | ○ | — | Sau pilot |

- **Không bao giờ:** AI chấm X1/X2/A1/A3/A5; AI tự đổi trạng thái; AI nói "con đạt B1"; AI đọc dữ liệu em kia.
- **Ngân sách:** ước tính Track A ~$1–3/tháng; cảnh báo $8, dừng $10 (D18). Mỗi call ghi `ai_runs`.
- **Bộ test trước khi bật** (PRD §8.4, rút gọn): 10 bài mẫu Track A gồm mạnh/yếu, transcript sai, bài có hỗ trợ, nhiệm vụ không đủ cơ hội, prompt injection. Đổi prompt/model = chạy lại bộ test.

---

## 6. Tích hợp với hệ sinh thái hub

### 6.1. SkillGrow (FX-01)
- English OS **chỉ xuất** snapshot JSON; SkillGrow chỉ đọc; không chung database.
- Id kỹ năng tiếng Anh trong taxonomy SkillGrow: **`P1-S2`**. Ánh xạ học sinh qua `external_ref` (prototype SkillGrow đang gọi An/"Chi" — phụ huynh xác nhận khi bật).
- Nội dung snapshot: coverage theo target set (n/N, tách Language/Thinking/Autonomy), số delayed/transfer đạt/hợp lệ, 2–3 ưu tiên, ngày cập nhật, version. **Không** chứa bài làm, transcript, điểm thô.

### 6.2. Study Launcher (FX-03)
- English OS là một **app slot `internal`** của Launcher (domain vào allowlist).
- Việc tiếng Anh hằng ngày của An = một "kỹ năng" Phần 2 trong Launcher, deep link tới Home của English OS; thời gian tối thiểu của Launcher (20') khớp với 25–30'/ngày của English OS.
- Hai app **không** gọi dữ liệu của nhau trong v1.

### 6.3. Nguồn video (mở — cần phụ huynh xác nhận)
Launcher khi khóa chặn YouTube. **Mặc định đề xuất:** English OS chỉ lưu **link** video; An xem video trong buổi gia sư hoặc ngoài giờ khóa; **không nhúng** video để lách luật khóa. Hoạt động hằng ngày ưu tiên bài đọc + audio đã duyệt.

### 6.4. App Toán
Không chung dữ liệu. Ghi nhận: hai app có engine mastery riêng; nếu sau này hợp nhất, English OS đã tách track/target theo cấu hình nên có thể mở rộng môn khác.

---

## 7. Vai trò và khối lượng việc

| Vai trò PRD | Family Edition | Việc định kỳ (Track A chạy) |
|---|---|---|
| Product Owner, Learning Lead, Privacy | **Phụ huynh** | Soạn/duyệt inquiry ~1,5–2 giờ/tuần (Claude soạn nháp); duyệt evidence phần mình; đọc báo cáo tháng |
| Tech Lead, AI Engineer, QA | **Claude Code** + phụ huynh review PR | 2–3 lát/tuần, ~30–45'/lát review |
| Gia sư | Gia sư của An | Lesson note ~5'/buổi; duyệt checkpoint trong buổi ~15–20'; chấm mù checkpoint |
| Gia sư thứ hai | Không có (D16) | — |

---

## 8. Lộ trình build (Family)

| Increment | Lát | Nội dung | FR | Ước tính |
|---|---|---|---|---|
| **I — Vòng học thủ công** | S0 | Nền: schema `english`, migration riêng, vai trò + quan hệ, RLS + test chéo ID, `is_test`, consent light, backup đêm, CI | FR-01/02, FX-02 | |
| | S1 | Cấu hình: track, catalogue seed, rubric, target set, assessment policy (bất biến sau công bố) | FR-03 | |
| | S2 | Soạn & giao inquiry từ mẫu, nguồn link/text, snapshot khi giao | FR-05/06 | |
| | S3 | Student Home + Reader/Listening + SOURCE-QA (có bài trắc nghiệm/điền từ/viết lại câu tự chấm theo đáp án) + Canvas Basic **và Canvas Advanced gọn (Track B)** | FR-07/08 | |
| | S4 | Viết: nháp, nộp snapshot + hash, idempotency, attempt lineage, 3 mode | FR-10/11 | |
| | S5 | Review: inbox, bài–rubric song song, chấm theo target (0–4/NULL), duyệt theo vai trò, override có lịch sử, lesson note, ACT-SPEAK-LIVE | FR-13/20 | |
| | S6 | Phản hồi tối đa 3 ưu tiên + retry + so sánh trước–sau | FR-14 | **~7 lát** |
| **II — Đo lường** | S7 | Episode, observation, engine trạng thái PRD §6.4, đề xuất → xác nhận, rebuild | FR-15 | |
| | S8 | Hàng đợi delayed/transfer, exposure history, next action | FR-16/17 | |
| | S9 | Màn phụ huynh + màn "vì sao", báo cáo tháng mẫu, export JSON, xóa, snapshot SkillGrow | FR-18/19/21, FX-01 | **~3 lát** |
| **III — Nói + AI** | Sp | Spike STT trên máy (chạy song song từ sớm, không cần DB) | — | |
| | S10 | Studio nói: ghi âm cục bộ, STT, transcript version, chỉ số | FR-09 | |
| | S11 | Dịch vụ AI: bảng jobs, worker, Reviewer, `ai_runs`, budget, kill switch | FR-12/23 | |
| | S12 | Coach + chặn AI ở backend theo mode + bộ test AI | FR-12 | **~4 lát** |
| **IV — Sẵn sàng pilot** | S13 | Launcher slot, a11y cơ bản, diễn tập khôi phục backup, checklist G0–G4 | FR-24, FX-03 | **1 lát** |
| **Track B — song song (v1.1)** | — | Cấu hình B + target set B-v1 vào S1; bài dạng đề + Canvas Advanced gọn vào S3; ô nhập điểm đề thử tháng vào S9 | FR-03/07/08 | +2–3 lát |
| **Track B — hè 2027** | TB1–TB2 | Clarifier/Challenger, Canvas Advanced đầy đủ, 70/30 | FR-08/12/22 | ~2–3 lát |

**Tổng cho 2 track: ~17–18 lát.** Thứ tự ưu tiên để 2 em dùng được sớm nhất: **S0 → S1 → S2 → S4 → S5 + phần câu hỏi đọc/bài dạng đề của S3** (giao bài → làm bài đọc/bài dạng đề/bài viết → duyệt) ≈ 6 lát ≈ **khoảng 3 tuần** là bản dùng được đầu tiên cho **cả An và Nguyên**; sau đó phần còn lại của S3, S6–S9, rồi nói + AI. Toàn bộ ≈ **7–9 tuần** với nhịp 2–3 lát/tuần (ước tính, chưa phải cam kết). Trước khi có S10, bài nói vào hệ thống qua ACT-SPEAK-LIVE (gia sư ghi). Trong lúc chờ: pilot thủ công (D27).

**Cổng (rút gọn PRD §14):**

| Cổng | Người ký | Điều kiện |
|---|---|---|
| G0 Quyền & dữ liệu | Phụ huynh | Test chéo ID 2 em đạt; consent ghi được; backup + khôi phục thử OK; không có audio lên server |
| G1 Vertical slice | Phụ huynh + gia sư | Một inquiry Track A đi hết giao → nộp → duyệt → làm lại, dữ liệu thật đã duyệt nguồn |
| G2 Toàn vẹn evidence | Phụ huynh | UAT-03/04/09/10/11/14/16 đạt |
| G3 AI trong rào | Phụ huynh | UAT-05/12/13/19 đạt; budget cap + kill switch thử thật |
| G4 Sẵn sàng pilot | Phụ huynh + gia sư + An | Gia sư hiểu rubric; An thử 1 buổi; không lỗi critical về quyền/mất dữ liệu |

---

## 9. Pilot (cả 2 track — v1.1)

- **12 tuần sau G4** (PRD §11.1 giữ khung tuần 1 baseline → tuần 2–5 inquiry → tuần 6 checkpoint → tuần 7–11 → tuần 12 báo cáo).
- **Bắt đầu ngay (D27):** baseline + inquiry tuần 1–4 **thủ công** cho cả An (`PILOT_KIT_A_v0.2.md`) và Nguyên (`PILOT_KIT_B_v0.2.md`), ghi vào `evidence_log_v0.2.csv`. Khi app có bản dùng được đầu tiên, nhập lại dữ liệu (`provenance = manual_import`) và chuyển sang làm trong app.
- Track B: mỗi tháng thêm 1 đề thử 40 câu làm ngoài app, nhập điểm theo phần (AGG-B-EXAM-MOCK).

## 10. Ngoài phạm vi Family Edition (thêm vào PRD §3.3)

Load test, WCAG kiểm thủ công đầy đủ, ZIP export có manifest/hash, comment theo bài, thông báo email, PDF tự động, chống xung đột 2 tab, người chấm thứ hai, dashboard vận hành AI riêng, báo cáo AI soạn nháp, nhúng video lách luật khóa, upload audio.

## 11. Việc còn mở

| # | Việc | Ai | Khi nào |
|---|---|---|---|
| O-F1 | Xác nhận quy tắc video (mục 6.3) | Phụ huynh | Trước S2 |
| O-F2 | Gia sư An đồng ý vai trò mới (duyệt checkpoint 15–20' trong buổi + chấm mù) | Phụ huynh + gia sư | Trước G1 |
| O-F3 | Gia sư rà catalogue v0.2 Track A (nhất là các nhãn B1, gộp/tách A-L8-EXCHANGE-S) và chốt target set v1 | Gia sư | Sau baseline |
| O-F4 | Soạn **Pilot Kit A + B v0.2** (baseline + 4 inquiry đầu mỗi em) | Claude soạn, phụ huynh duyệt nguồn | Đang làm (13/10) |
| O-F7 | Gia sư Nguyên rà target set B-v1 và mức độ bài dạng đề | Gia sư Nguyên | Sau baseline B |
| O-F5 | Tạo Supabase project dùng chung (Launcher) + Anthropic API key riêng có trần | Phụ huynh | Trước S0 |
| O-F6 | Bật/tắt build đêm tự động cho repo này (mặc định **tắt**) | Phụ huynh | Khi bắt đầu S0 |

## 12. Bản đồ tài liệu

| Tài liệu | Trạng thái |
|---|---|
| Master App Architecture v1.0 | **Hiệu lực** (kim chỉ nam) |
| MVP PRD v1.0 | **Hiệu lực**, bị file này điều chỉnh |
| PRD Family Edition v1.0 (file này) | **Hiệu lực** khi phụ huynh duyệt |
| CATALOGUE v0.2 (+ JSON) | **Hiệu lực** khi gia sư rà xong |
| DESIGN v0.2 | **Hiệu lực** khi duyệt |
| Mockup 5 màn (Design canvas) | Bản nháp v2 (13/10) — claude.ai/artifact/EUquup4tsFqkAstXVHkWWq |
| UX_COPY_GUIDE v0.1 | **Hiệu lực** — mọi nhãn giao diện, thang điểm có chữ, thang bậc, giọng nói theo vai |
| SPEC/DESIGN/BACKLOG/CLAUDE.md v0.1, Framework/Rubric v0.1 | **Bị thay thế** — giữ để tra lịch sử |
| Pilot Kit v0.1, evidence_log CSV v0.1 | Bị thay thế khi có Pilot Kit v0.2 |
| AUDIT v0.1, REVIEW 2 tracks v1.0 | Tham khảo |
