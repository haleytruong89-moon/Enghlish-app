# Learning OS (Family Edition) — DESIGN v0.2 (DRAFT)

> Thiết kế kỹ thuật cho `PRD_FAMILY_EDITION_v1.0.md` (+ MVP PRD v1.0). Thay thế `DESIGN.md` v0.1.
> Cập nhật: 11/10/2026; 16/10/2026: theo PRD v1.1 (13/10) Track B chạy ngay, không còn "nháp đến hè 2027"; **18/10/2026 (S5c): thêm §19 mô tả phần đã build ở S5b/S5c (bảng, kho file, cài đặt, xóa dữ liệu, sao lưu) và sửa các chỗ lệch ở §4–§7, §13, §14, §18 — khi đoạn cũ và §19 khác nhau, §19 là thực tế.** Đổi quyết định kiến trúc → bàn trên Claude.ai trước, rồi sửa file này.
> Nguồn năng lực/rubric: `content/catalogue_v0.2.json` (đọc bằng code, không chép tay).

## 0. Tổng quan

```
 Laptop/iPad của con                    Gia sư (desktop)        Phụ huynh (iPhone)
 ├─ Home · Reader · Canvas · Viết        ├─ Inbox · Review        ├─ Tổng quan · "Vì sao"
 └─ Nói: ghi âm → STT TRÊN MÁY ──┐       └─ Lesson note           └─ Duyệt phần của mình · Export
       (audio không rời máy)     │ transcript + chỉ số
                                 ▼
   Next.js (Vercel) — route handlers = nơi DUY NHẤT ghi dữ liệu nghiệp vụ
   ├─ lib/engine/*   hàm thuần: trạng thái năng lực, retention, next action
   ├─ lib/ai/*       Reviewer · Coach (Track A) — chỉ văn bản ẩn danh, có trần chi phí
   └─ lib/jobs/*     hàng đợi trong Postgres + after() + quét bù (GitHub Actions)
                                 │
                                 ▼
   Supabase project DÙNG CHUNG với Launcher (D14)
   ├─ schema public.*   ← của Launcher, KHÔNG đụng
   └─ schema english.*  ← toàn bộ app này (RLS mọi bảng)      Auth: dùng chung auth.users
```

**Nguyên tắc (giữ từ Master Architecture + PRD):**
1. **Evidence là nguồn sự thật**; trạng thái, dashboard, báo cáo, snapshot là dữ liệu dẫn xuất, **rebuild được** mà không gọi lại AI.
2. **Track = cấu hình.** Không có `if (track === 'A')` trong logic nghiệp vụ; khác biệt nằm trong `tracks`, `target_sets`, `activity_templates`, `ai_settings`.
3. **Append-only** cho lịch sử học; sửa = bản ghi mới thay thế; xóa chỉ qua đường purge có kiểm soát (§6).
4. **Server quyết định.** Con và gia sư không ghi trực tiếp bảng nghiệp vụ.
5. **Audio không rời máy** (D13).
6. **AI nằm ngang, không phải phụ thuộc:** tắt AI thì vòng học vẫn chạy trọn (UAT-19).
7. **Ngưỡng là dữ liệu có version** (`assessment_policies`), không hard-code.

## 1. Stack

| Lớp | Chọn | Ghi chú |
|---|---|---|
| Web | Next.js (App Router) + TypeScript strict + Tailwind | Cùng hệ App Toán/Launcher |
| DB/Auth | Supabase **dùng chung project Launcher**, schema `english` | D14; ngưỡng tách ở §15 |
| Hosting | Vercel Hobby | Cron Hobby chỉ 1 lần/ngày → không dùng cho worker (§9) |
| STT | Whisper chạy trong trình duyệt (thư viện do Claude Code chọn sau lát Sp) | Không Web Speech API, không STT cloud |
| LLM | Claude API từ server; `REVIEWER_MODEL`, `COACH_MODEL` qua env | D17, D18 |
| Validate | zod | Body request + đầu ra AI |
| Test | Vitest (engine, quyền) + Playwright (luồng chính, "audio không rời máy") | |
| Múi giờ | `Asia/Ho_Chi_Minh`; lưu UTC; tuần bắt đầu thứ Hai | |

## 2. Sống chung project với Launcher — luật bắt buộc

| # | Luật | Cách làm |
|---|---|---|
| 1 | Mọi đối tượng nằm trong schema `english` | Không tạo gì trong `public`. Hàm trợ giúp tiền tố `eng_` |
| 2 | Lộ schema cho Data API | Dashboard → API → *Exposed schemas* thêm `english`; `grant usage on schema english to authenticated`; `grant select` từng bảng cần đọc; **không grant gì cho `anon`** |
| 3 | Migration riêng | File `db/migrations/NNNN_*.sql`, mỗi file kết thúc bằng `insert into english.schema_migrations(version) values ('NNNN') on conflict do nothing;`. **Không dùng `supabase db push`** (sẽ lệch lịch sử migration với repo Launcher). Phụ huynh áp bằng SQL Editor hoặc `npm run db:apply` (script đọc `DATABASE_URL`, chỉ áp file chưa có trong bảng) |
| 4 | Vai trò của app này nằm ở `english.members` | Người có tài khoản Launcher nhưng không có dòng trong `english.members` = không thấy gì ở đây; ngược lại gia sư tiếng Anh không có hồ sơ Launcher = không thấy gì bên Launcher. **Test cả hai chiều ở S0** |
| 5 | Dữ liệu thử | `english.learners.is_test = true`; preview Vercel chỉ dùng learner thử (biến `ALLOW_REAL_LEARNERS=false` trên preview) |

## 3. Danh tính, quan hệ, consent

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `families` | id, name, timezone | 1 dòng |
| `members` | user_id (= auth.users.id), family_id, role (`parent`/`tutor`/`student`), display_name, color | Một người một vai trong app này |
| `learners` | id, family_id, member_id (tài khoản của con), alias (`An`/`Nguyên`), track_id, external_ref (vd `skillgrow:child:an`), is_test, ai_enabled, status (`active`/`draft`) | Track B (PRD v1.1): `status = active` ngay — 2 track chạy song song; chỉ Clarifier/Challenger và 70/30 đầy đủ chờ hè 2027 |
| `relationships` | member_id, learner_id, relation (`parent`/`tutor`), valid_from, valid_to | Hết hạn = mất quyền với request mới (FR-01b) |
| `consents` | learner_id, subject_member_id, notice_version, scope (`data`/`ai_text`), granted, at | AI chỉ chạy khi có consent `ai_text` còn hiệu lực + `ai_enabled` |

**Hàm quyền** (`security definer stable`, `search_path = ''`): `english.eng_member_role()`, `english.eng_can_read_learner(learner_id)` (là học sinh đó, hoặc có relationship còn hiệu lực), `english.eng_is_parent()`.

## 4. Cấu hình (bất biến sau khi công bố)

| Bảng | Khóa / cột chính | Ghi chú |
|---|---|---|
| `tracks` | id (`A`/`B`), name, scaffold_level, canvas_template, domain_mix jsonb, ai_modes text[] | Track A: `ai_modes = {reviewer,coach}` |
| `catalogue_versions` | version (`0.2-draft`), published_at, source_hash | Seed từ `content/catalogue_v0.2.json` |
| `dimensions` | (id, catalogue_version), group, ai_scorable, rubric jsonb | |
| `targets` | (id, descriptor_version), track_id, dimension_id, target_demand, input_modality, output_modality, success_criteria jsonb, opportunity_rule, core, status | **PK kép** — sửa audit H9a |
| `assessment_policies` | version (`AP-0.2-pilot`), config jsonb, published_at | §8 |
| `target_sets` | id, learner_id, version, target_keys jsonb, effective_from, published_by | Mẫu số coverage; đổi = version mới (PRD §7.1) |
| `activity_templates` | id (8 loại, D19), track_ids, schema jsonb | |
| `inquiry_templates` | id, version, track_id, big_question, domain_bucket, steps jsonb, target_keys, rubric_version, status (`draft`/`published`) | |
| `sources` / `source_versions` | id; version, url, title, author, accessed_at, rights, modality, excerpt, review_status | PDF của gia sư: có từ S5b, lưu ở kho file riêng tư (§19.2), không nằm trong bảng này |
| `schema_migrations` | version, applied_at | §2 luật 3 |

Trigger: sau khi `published_at`/`status = published` thì chặn UPDATE nội dung.

## 5. Bài được giao và bài làm

> **Thực tế đã build (S2/S4/S5):** bảng tên `inquiry_instances`, `activity_instances` (kèm `activity_instance_events`), `working_drafts`, `attempts`, `artifact_versions`, `assistance_events`, `exposure_log`, `attempt_auto_checks` (kết quả tự chấm câu đóng, chỉ nhân viên đọc). Học sinh **không SELECT được bảng nào ở đây**: mọi thứ em thấy đi qua các hàm `eng_my_*` (security definer) chỉ trả nhãn và nội dung đã phát hành, không có điểm/đáp án. Bài ngoài app và bài do gia sư/phụ huynh ghi: §19.

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `inquiry_instances` | id, learner_id, template_id+version, snapshot jsonb, assigned_by, assigned_at, due_at, status | Snapshot target/rubric/mode/nguồn (FR-03c, FR-05b) |
| `activity_instances` | id, inquiry_instance_id, activity_type, step_no, mode (`PRACTICE`/`INDEPENDENT_CHECK`/`REVISION`), target_keys, purpose flags (`checkpoint`, `delayed_check`, `transfer_check`), source_task_id, skipped_reason | Gia sư đổi lịch/bỏ bước phải có lý do (FR-05c) |
| `working_drafts` | activity_instance_id, learner_id, content jsonb, updated_at | **Bảng duy nhất được sửa đè** (FR-10) |
| `attempts` | id, activity_instance_id, learner_id, attempt_no (server gán), parent_attempt_id, learning_family_id, mode, provenance (`in_app`/`pasted`/`manual_import`/`tutor_live`), submitted_at, content_hash, client_submission_id **unique** | Bất biến. Unique `(activity_instance_id, attempt_no)` |
| `artifact_versions` | id, attempt_id, kind (`text`/`transcript`/`canvas`/`answers`), version, content jsonb, is_raw, created_by, reason | Transcript gốc `is_raw = true`; sửa nhận dạng = version mới + lý do; gia sư thấy diff (FR-09) |
| `speech_metrics` | attempt_id, duration_sec, word_count, long_pauses_gt3s, stt_engine, stt_model, device | Không có cột audio |
| `assistance_events` | id, learner_id, attempt_id, kind (`ai_coach`/`ai_clarifier`/`ai_challenger`/`tutor_prompt`/`frame`/`notes`/`model_answer`/`source_open`/`transcript_open`/`external_declared`/`accessibility`), affects_target_keys, verification (`observed`/`declared`/`unknown`), at | FR-11 |
| `exposure_log` | learner_id, target_key, at, source (`practice`/`lesson`/`retry`) | Cho luật delayed "≥14 ngày từ lần luyện gần nhất" |

## 6. Evidence, đánh giá, quyết định

> **Thực tế đã build (S5):** `episodes`, `observations`, `validation_decisions` (D15 ép trong hàm database), `lesson_notes`, `audit_log`, `app_errors`. **S7a (migration 0023):** `mastery_decisions` (kind `AUTO`/`PROPOSED`/`CONFIRMED`/`REJECTED`/`MANUAL`/`FLAG` thay cho cột `status` của bảng dưới), `competency_state` và `episode_marks` (dấu "chủ đề / nguồn mới", chỉ thêm) — xem §19.10. **Chưa có** (S7b+): `retention_tasks`, `recommendations`, `published_reports`, `ai_runs`, `jobs` — các bảng này là thiết kế, không phải hiện trạng. `speech_metrics`/`artifact_versions.kind='transcript'`: chờ S10.

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `episodes` | id, attempt_id **unique**, learner_id, is_first_attempt, context_id (inquiry/source family), observed_directly, facets jsonb (`checkpoint`, `delayed_days_known`, `transfer_from_episode`, `transfer_difference`) | Một attempt = tối đa 1 episode; revision dùng chung learning family (PRD §6.3) |
| `observations` | id, episode_id, target_key, scorer (`ai`/`tutor`/`parent`), status (`PROPOSED`/`ABSTAIN`), score 0–4 or null, not_observed bool, criteria_results jsonb, evidence_refs jsonb, rationale, limitations, blind bool, rubric_version, ai_run_id | Nhiều observation/1 episode được phép; **đếm độc lập theo episode** |
| `validation_decisions` | id, episode_id, target_key, decision (`AGREE`/`MODIFY`/`INSUFFICIENT`/`REQUEST_MORE`), final_score, final_not_observed, validator_id, validator_role (`tutor`/`parent`), reason, supersedes_id | D15: checkpoint + `observed_directly` → chỉ `tutor` (kiểm ở server + constraint) |
| `mastery_decisions` | id, learner_id, target_key, from_state, to_state, status (`PROPOSED`/`CONFIRMED`/`REJECTED`/`NEEDS_CONFIRMATION`), conditions jsonb (đạt/chưa đạt), evidence_episode_ids, policy_version, engine_version, decided_by, decided_at | FR-15a |
| `competency_state` | learner_id, target_key, state, as_of, last_decision_id | **Projection** — xóa đi tính lại được (UAT-16) |
| `retention_tasks` | id, learner_id, target_key, source_episode_id, due_at, status (`scheduled`/`assigned`/`done`/`missing`/`overdue`), result_episode_id | Thiếu ≠ fail (FR-17c) |
| `recommendations` | id, learner_id, kind, target_key, reason, evidence_episode_ids, exit_condition, tutor_action (`accept`/`modify`/`reject`), at | FR-16 |
| `lesson_notes` | id, learner_id, tutor_id, session_date, goals, observed, support_level, next_actions (≤3), published | FR-20 light |
| `published_reports` | id, learner_id, period, version, content jsonb, evidence_episode_ids, published_by, supersedes_id | Parent chỉ thấy bản đã công bố |
| `ai_runs` | id, mode, model, prompt_version, input_tokens, output_tokens, est_cost_usd, latency_ms, status, error_code, correlation_id | Không lưu toàn văn input |
| `jobs` | id, kind, payload jsonb, idempotency_key **unique**, status, attempts, run_after, last_error, correlation_id | §9 |
| `audit_log` / `app_errors` | actor, action, payload (không PII nội dung) | Không dùng dịch vụ log bên thứ ba |

**Append-only:** trigger `english.eng_forbid_mutation()` trên `attempts`, `artifact_versions`, `speech_metrics`, `assistance_events`, `exposure_log`, `episodes`, `observations`, `validation_decisions`, `mastery_decisions`, `published_reports`, `ai_runs`, `audit_log` — chặn UPDATE/DELETE **và** TRUNCATE (statement trigger) + `revoke update, delete, truncate … from authenticated, anon`.

**Purge (FR-21):** trigger cho phép xóa chỉ khi `current_setting('app.purge_learner', true) = <learner_id>`; giá trị đó chỉ được đặt bằng `set local` bên trong hàm `english.eng_purge_learner(learner_id)` (`security definer`, `search_path = ''`, `revoke execute` khỏi `public/anon/authenticated`; chỉ route server dùng service role gọi). Hàm ghi biên nhận vào `audit_log` (không chứa nội dung đã xóa). Backup cũ hết hạn theo vòng đời (§14) — giao diện nói rõ điều này. Từ S5c có màn gọi hàm này (§19.5); mỗi migration thêm bảng có `learner_id` phải mở rộng hàm bằng bản `create or replace` kèm test so từng dòng với bản trước.

## 7. RLS (tóm tắt)

| Vai trò | Đọc | Ghi |
|---|---|---|
| Học sinh | Bài giao, nháp, attempt, phản hồi **đã duyệt** của chính mình; cấu hình đã công bố | Không ghi trực tiếp (route server) |
| Gia sư | Mọi thứ của learner có relationship còn hiệu lực, trừ consent | Không ghi trực tiếp |
| Phụ huynh | Mọi thứ của learner trong gia đình | Bảng quản trị qua route `/api/admin/*` |
| `anon` | Không gì | Không gì |

> **Thực tế:** học sinh không có `grant select` trên bảng nghiệp vụ; chỉ đọc qua hàm `eng_my_*`. Bảng của S5b/S5c có RLS bật và không policy cho học sinh (test: 0 dòng). Mọi route ghi đi qua `requireAccess` rồi service role; hàm SQL kiểm lại người thực hiện (`p_by`) bên trong.

Học sinh **không** đọc được: `observations` (điểm AI/gia sư), `mastery_decisions`, `ai_runs`, `jobs`, `lesson_notes` chưa công bố, nội dung `model_answer` (chỉ trả qua route có ghi `assistance_events`).
Mọi route gọi `requireAccess(user, learnerId, action)`; **test mỗi route** với user của em kia (UAT-01).

## 8. Engine — `lib/engine` (hàm thuần)

```ts
computeTargetState(input: {
  targetKey: TargetKey
  episodes: ValidatedEpisode[]      // chỉ episode có validation_decision còn hiệu lực
  exposures: Exposure[]
  priorDecisions: MasteryDecision[]
  policy: AssessmentPolicy          // từ assessment_policies
  now: Date
}): { proposedState: State; conditions: Condition[]; flags: Flag[] }
```

`State = NOT_OBSERVED | SUPPORTED | DEVELOPING | INDEPENDENT | TRANSFERABLE` (PRD §6.4). Engine **chỉ đề xuất**; `CONFIRMED` cần người duyệt. Bài yếu sau khi đã đạt → `NEEDS_CONFIRMATION`, không tự hạ.

**`AP-0.2-pilot` (cấu hình, provisional):**

```json
{
  "independent": {
    "minFirstAttemptEpisodes": 3, "distinctDays": true, "minContexts": 2, "minSpanDays": 7,
    "minScoreEach": 3, "requireValidated": true, "minDirectCheckpoint": 1,
    "allowedModes": ["INDEPENDENT_CHECK"], "maxAssistanceAffectingTarget": 0
  },
  "transferable": {
    "requires": "INDEPENDENT", "minDistinctEpisodes": 2,
    "needs": ["delayed_check", "transfer_check"], "delayedMinDaysFromLastExposure": 14,
    "transferNeedsTutorDescribedDifference": true
  },
  "supported": { "minScore": 1, "assistanceAllowed": true },
  "developing": { "minScore": 2 },
  "conflictWindowDays": 21,
  "revisionNeverFirstAttempt": true
}
```

**Quy tắc đếm:** 1 episode tính 1 lần cho 1 target dù nhiều observation/nhãn; retry trong cùng learning family không phải first attempt; assistance có `affects_target_keys` chứa target → không tính độc lập cho target đó; `verification = unknown` → không tự gán độc lập (UAT-06); delayed dùng `exposure_log` và tính **≥14 ngày từ lần luyện gần nhất của target đó trên cùng chủ đề/nguồn** (luyện xen giữa → cập nhật khoảng cách, không tuyên bố quá mức); lần làm ở baseline không tính vào Independent.

**Test bắt buộc** (table-driven): mỗi dòng PRD §6.4 + UAT-09, 10, 11, 16, 17, 18 + mốc biên (đúng 7/14 ngày, 2 vs 1 bối cảnh, episode có hỗ trợ, revision, NULL). Rebuild toàn bộ `competency_state` từ log cho kết quả giống hệt.

## 9. Nộp bài, idempotency, hàng đợi

1. Client gửi `client_submission_id` (UUID tạo khi mở bài) + nội dung.
2. Route: kiểm quyền + mode → transaction: `attempts` + `artifact_versions` (+ `speech_metrics`) + `episodes` + `exposure_log` + `jobs(kind='analyze', idempotency_key = attempt_id)` → trả **receipt** (FR-10, NFR-01). Gửi lại cùng `client_submission_id` → trả receipt cũ (UAT-03).
3. Sau khi trả lời: `after()` chạy job ngay (nếu AI bật và còn ngân sách).
4. **Quét bù:** GitHub Actions mỗi 30 phút gọi `/api/jobs/sweep` (header `CRON_SECRET`) → xử lý job `pending/failed` quá hạn, tối đa 3 lần, lock bằng `select … for update skip locked`.
5. AI hỏng/hết ngân sách → job `skipped`, bài vào Inbox với nhãn "Cần người xem", không có điểm 0 (UAT-19).

## 10. Nói — STT trên máy (D13)

| Bước | Cách |
|---|---|
| Ghi | MediaRecorder; audio chỉ trong bộ nhớ tab |
| STT | Whisper trong trình duyệt (WASM/WebGPU); model cache trên máy |
| Nộp | Transcript gốc (không làm sạch) + chỉ số; audio bị bỏ khi đóng tab. Không IndexedDB lưu audio trong v1 |
| Sửa nhận dạng | Tạo transcript version mới (`is_raw=false`, có lý do); chấm dựa trên bản nào phải ghi rõ; gia sư thấy diff |
| Fluency/Pronunciation | Không chấm từ transcript; chỉ gia sư trong buổi (X1/X2, ACT-SPEAK-LIVE) |
| Grammar khi nói | STT có thể "sửa hộ" → L1 Track A chỉ có target viết; ngữ pháp nói theo dõi bằng chỉ số tổng hợp do gia sư gắn tag (catalogue `AGG-A-L1-SPOKEN-PAST`) |

**Cổng spike `Sp` (định nghĩa trước khi chạy):** đo trên **thiết bị thật của An** (laptop + iPad): (a) WER trên 5 đoạn đọc to + 2 đoạn nói tự do 60–90 giây do người gõ lại; (b) thời gian xử lý đoạn 90 giây; (c) dung lượng tải lần đầu; (d) không treo tab trên iPad. Kết luận: **Đạt** → S10 như thiết kế · **Một phần** (chậm/không chạy iPad) → chỉ laptop · **Trượt** → bài nói chỉ qua ACT-SPEAK-LIVE (gia sư ghi trong buổi). Ngưỡng con số do phụ huynh chốt khi xem kết quả.

## 11. AI service — `lib/ai`

| Mục | Thiết kế |
|---|---|
| Chế độ | Track A: `reviewer`, `coach`. Track B (PRD v1.1): `reviewer`, `coach` ngay như Track A; + `clarifier`, `challenger` từ hè 2027 |
| Context tối thiểu | Task snapshot + target(s) + rubric + success_criteria + artifact (đã ẩn danh) + trích nguồn cần thiết. Reviewer **không** thấy điểm gia sư/trạng thái hiện tại (PRD §8.1) |
| Ẩn danh | Chỉ `alias`; lọc danh sách tên thật/trường (cả có dấu và không dấu) trước khi gửi |
| Đầu ra Reviewer | zod theo PRD §8.2: `target_key`, `assessment_status` (`PROPOSED`/`ABSTAIN`), `quality_score` 0–4/null, `criteria_results`, `evidence_refs` (span có thật), `rationale`, `priority_feedback` ≤3, `limitations`, `review_reasons` |
| Kiểm ở code | Span nằm trong artifact; target thuộc bài; tiêu chí `computable: true` do **code tính** và ghi đè đề xuất của AI; chiều không cho AI chấm (A*, X*) → từ chối |
| Coach | Gợi ý trước, không viết lại câu; mỗi lượt 1 câu hỏi, ≤3 lượt/vấn đề; **chặn ở backend** khi mode = `INDEPENDENT_CHECK` (UAT-05); mọi lượt ghi `assistance_events` |
| Chống injection | Nội dung học sinh/nguồn bọc trong khối dữ liệu có đánh dấu; không cấp tool; đầu ra chỉ là JSON theo schema (UAT-13) |
| Ngân sách | `ai_runs.est_cost_usd` từ bảng giá trong config; cảnh báo `AI_SOFT_CAP_USD`=8, dừng `AI_MONTHLY_CAP_USD`=10 |
| Kill switch | `english.ai_settings(mode, enabled)` + `learners.ai_enabled` + consent |
| Prompt | `prompts/<mode>.v<N>.md`; đổi = version mới + chạy bộ test 10 bài (PRD-F §5) |
| Chấm mù | Bài checkpoint: giao diện ẩn observation `scorer='ai'` đến khi gia sư lưu điểm của mình |

## 12. Snapshot cho SkillGrow (FX-01)

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-12-15T20:00:00+07:00",
  "learner": { "alias": "An", "external_ref": "skillgrow:child:an", "skillgrow_skill_id": "P1-S2" },
  "versions": { "catalogue": "0.2-draft", "policy": "AP-0.2-pilot", "target_set": "A-v1" },
  "coverage": {
    "language": { "independent_or_better": 0, "total": 7 },
    "thinking": { "independent_or_better": 0, "total": 4 },
    "tutor_observed": { "independent_or_better": 0, "total": 1 }
  },
  "checks": { "delayed": { "passed": 0, "valid": 0, "due_not_done": 0 }, "transfer": { "passed": 0, "valid": 0 } },
  "priorities": ["A-L3-CAUSE-S", "A-L2-COMPENSATE-S"],
  "notes": "Coverage = trạng thái đã xác nhận / target set có version. Không phải % B1."
}
```

Được kiểm bằng JSON Schema sinh từ zod; tăng `schema_version` khi đổi trường. Không chứa bài làm, transcript, điểm thô.

## 13. API (route handlers chính)

> **Thực tế đã build:** `/api/student/{home,activities/:id,practice,practice/:aid/file,files,submissions}`, `/api/drafts/:activityId`, `/api/attempts`, `/api/activities/:id/events`, `/api/review/{inbox,episodes/:id,episodes/:id/decisions,episodes/:id/tags,decisions/:id/modify,attempts/:id/support}`, `/api/learners/:id/{assignments,assignments/:aid/retract,assignments/:aid/submissions,files,inquiries,templates,lesson-notes,session-notes,offline-attempts,results,tags,purge}`, `/api/results/:id/tags`, `/api/files/:id`. Bảng dưới là thiết kế ban đầu; **xóa dữ liệu một em là `POST /api/learners/:id/purge`** (không phải `/api/admin/purge/…`). Chưa có: `/api/mastery/*`, `/api/reports`, `/api/coach/*`, `/api/jobs/sweep`, export, snapshot.

| Route | Ai | Việc |
|---|---|---|
| `GET /api/student/home` | học sinh | Một "việc tiếp theo" + bước inquiry + check đến hạn + phản hồi mới |
| `PUT /api/drafts/:activityId` | học sinh | Autosave |
| `POST /api/attempts` | học sinh | Nộp (idempotent) → receipt |
| `POST /api/coach/:attemptId` | học sinh | Coach (chặn theo mode) |
| `GET /api/review/inbox` | gia sư/phụ huynh | Lọc: checkpoint, delayed, transfer, cần người xem, đề xuất đổi trạng thái |
| `POST /api/review/:episodeId/observations` | gia sư/phụ huynh | Chấm theo target |
| `POST /api/review/:episodeId/decisions` | gia sư/phụ huynh | Duyệt (kiểm luật D15) |
| `POST /api/mastery/:decisionId/confirm` | gia sư/phụ huynh | Xác nhận đổi trạng thái |
| `POST /api/lesson-notes` | gia sư | Lesson note + ACT-SPEAK-LIVE |
| `GET /api/learners/:id/overview` · `/why/:targetKey` | phụ huynh/gia sư | Tổng quan · "vì sao trạng thái này" |
| `POST /api/reports` · `/publish` | gia sư/phụ huynh | Báo cáo tháng |
| `GET /api/admin/export/:learnerId` · `POST /api/admin/purge/:learnerId` | phụ huynh | Export JSON · xóa (2 bước xác nhận) |
| `POST /api/admin/snapshot/:learnerId` | phụ huynh | Snapshot SkillGrow |
| `POST /api/jobs/sweep` | GitHub Actions | Quét bù |

## 14. Riêng tư, sao lưu, vận hành

| Việc | Cách |
|---|---|
| Region | Chọn khi tạo project chung (đề xuất Singapore) |
| Backup | GitHub Actions **hằng tuần** (sáng Chủ nhật — phụ huynh quyết 16/10/2026, mất tối đa ~7 ngày; chạy tay trước thay đổi lớn): `pg_dump` schema `public` + `english` **và hai bảng đăng nhập `auth.users`, `auth.identities`** (S5c, D30) → **khôi phục thử vào Postgres 17 tạm trong chính job và đối chiếu số dòng** → mã hóa `age` (khóa công khai trong repo, khóa riêng phụ huynh giữ offline) → artifact riêng tư `retention-days: 30` |
| Khôi phục thử | **Tự động mỗi lần chạy** (S5c): restore vào container Postgres tạm, đối chiếu số dòng của **mọi bảng `english`** và `auth.users` (chỉ số lượng vào log/summary, không dữ liệu), và coi lỗi khôi phục thuộc schema `english`/`auth` là lỗi (logic ở `scripts/ops/restore-check.sh`, có unit test); lệch → job đỏ nhưng file mã hóa vẫn được lưu. Dump tài khoản là bước riêng: hỏng thì dump chính vẫn được lưu và run báo đỏ. Thêm **1 lần diễn tập giải mã bằng khóa offline** do phụ huynh làm (PROGRESS, mục S5c). File tải lên ở kho `english-work` **chưa** được sao lưu (D30) |
| Giữ project không ngủ | GitHub Actions ping hằng ngày (như App Toán) |
| Log | Không ghi transcript/bài làm vào log Vercel; lỗi vào `english.app_errors` |
| Consent | Bản ghi có version; đổi nội dung thông báo = version mới |
| Export/xóa | §6, §13; xóa cả dữ liệu dẫn xuất còn định danh; backup tự hết hạn sau 30 ngày |

## 15. Tách khỏi project dùng chung

**Ngưỡng:** DB chung > ~60% của 500 MB · cần backup chính thức/PITR · sự cố chéo app · khi bật phần Track B đầy đủ — Clarifier/Challenger, 70/30 (hè 2027).
**Cách tách:** tạo project mới (gói Pro) → `pg_dump --schema=english` → restore → chuyển tài khoản người dùng (mời lại/đặt lại mật khẩu cho 3–5 người) → đổi env → chạy song song 1 tuần đọc-only → xóa schema cũ.

## 16. Cấu trúc thư mục

```
learning-os/
├─ CLAUDE.md
├─ docs/ (PRD_FAMILY_EDITION.md, DESIGN.md, CATALOGUE.md, PROGRESS.md, UAT.md)
├─ content/ (catalogue_v0.2.json, inquiries/, baselines/)
├─ db/migrations/ (0001_init.sql …) · scripts/db-apply.ts · scripts/seed.ts
├─ app/ (student)/ (review)/ (parent)/ (admin)/ api/
├─ lib/ engine/ ai/ jobs/ auth/ stt/ snapshot/ copy/ (vi.ts — nhãn theo UX_COPY_GUIDE, không viết chữ giao diện rải rác)
├─ prompts/ (reviewer.v1.md, coach.v1.md)
├─ tests/ (engine/, access/, e2e/)
└─ .github/workflows/ (ci.yml, backup.yml, keepalive.yml, sweep.yml)
```

Biến môi trường: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (chỉ script/CI), `ANTHROPIC_API_KEY`, `REVIEWER_MODEL`, `COACH_MODEL`, `AI_SOFT_CAP_USD`, `AI_MONTHLY_CAP_USD`, `CRON_SECRET`, `ALLOW_REAL_LEARNERS`, `BACKUP_AGE_RECIPIENT`, `NEXT_PUBLIC_APP_URL`.

## 17. Claude Code tự quyết / không tự quyết

**Tự quyết:** thư viện UI, cấu trúc component, thư viện STT cụ thể (miễn audio không rời máy), cách tổ chức test, tên hàm.

**Không tự quyết — quay lại Claude.ai:** bất kỳ đường nào đưa audio ra khỏi máy; đổi quy tắc trạng thái/cách đếm episode; cho AI tự xác nhận hoặc đổi trạng thái; cho học sinh thấy điểm thô; ghi vào schema `public`/đụng bảng Launcher; dùng `supabase db push`; thêm dịch vụ trả phí hoặc bên thứ ba nhận dữ liệu của con; bật Track B; nhúng video để lách luật khóa của Launcher.

## 18. Map lát build → mục thiết kế

| Lát (PRD-F §8) | Mục DESIGN |
|---|---|
| S0 | §2, §3, §6 (append-only/purge), §7, §14 |
| S1 | §4, §8 (policy seed) |
| S2–S3 | §4–§5 (inquiry, nguồn, Reader, Canvas Basic) |
| S4 | §5, §9 |
| S5–S6 | §6, §7, §13 (review, lesson note, retry) |
| S7–S8 | §6, §8 (engine, retention, next action) |
| S9 | §12, §13, §14 (dashboard, báo cáo, export, purge, snapshot) |
| Sp, S10 | §10 |
| S11–S12 | §9, §11 |
| S13 | Launcher slot, a11y, khôi phục thử |
| S5b-1, S5c (chèn, PRD D31) | §19 |

## 19. Phần đã build ở S5b-1 / S5c (thực tế, 18/10/2026)

### 19.1. Bảng (migration 0013–0017)

| Bảng | Dùng để | Ghi chú |
|---|---|---|
| `login_names` | Tên đăng nhập ngắn (`an`, `giasu-an`…) → tài khoản | Email không bao giờ gửi xuống trình duyệt; xóa theo hàm purge; không xóa tài khoản đăng nhập |
| `error_tags` | Nhãn lỗi (10 nhãn mỗi track + nhãn riêng của gia đình `x-…`) | Seed `0015`; key duy nhất toàn hệ thống |
| `test_frames` | Khung đề (số câu → phần → nhãn; **không lưu chữ của đề**) | Nhập bằng `npm run db:import-frame` |
| `results` | Kết quả bài ghi tay / từ ảnh em gửi (tổng, đúng, sai, `attempt`: `first`/`retry`, `source`: `test`/`practice`, `supersedes_id`) | Append-only. **Tín hiệu**, không phải bằng chứng cho engine |
| `tag_marks` | Dấu nhãn trên câu sai/bài viết/buổi học | Append-only; chỉ "lần đầu" vào "Điểm cần chú ý" |
| `recheck_events` | Kết quả "Hỏi lại điểm yếu" nhập ở ghi buổi học | Gắn ghi chú; bỏ qua nếu ghi chú đã bị thay |
| `lesson_notes` (mở rộng) | Mẫu v2: củng cố, lời nhắn cho em, ghi chú cho phụ huynh, **kỹ năng đã luyện** (S5c) | Ghi `exposure_log` (source `lesson`) cho kỹ năng đã luyện, chỉ cái mới so với bản bị thay |
| `files`, `upload_tickets` | Siêu dữ liệu file ở kho riêng tư; vé tải lên dùng một lần (≤ 60/em/24 giờ) | §19.2 |
| `assignments`, `assignment_events`, `submissions` | Bài luyện gia sư giao (link/PDF), sự kiện (giao/rút/…), bài em gửi (ảnh) | Chỉ-thêm; một kết quả "lần đầu" cho mỗi bài giao; bài đã rút không ghi kết quả được |
| `tutorwork_settings` | Cài đặt của màn gia sư, hiện có `recheck_days` (mặc định 14) | RLS bật, không policy; chỉ đọc/ghi qua hàm cho nhân viên / service_role (S5c, D32) |

### 19.2. Kho file (Supabase Storage)

Bucket `english-work`: **riêng tư**, 15 MB mỗi file, chỉ PDF/PNG/JPEG/WebP, **không có policy nào** trên `storage.objects`. Máy chủ kiểm quyền ở schema `english` rồi dùng service role (chỉ ở server) để cấp link tải lên dùng một lần tới đường dẫn do server dựng `{family}/{learner|shared}/{uuid}.{đuôi}` và link tải xuống sống 300 giây. Khi đăng ký, server hỏi lại Storage loại file/kích cỡ thật. Em chỉ đi qua `eng_my_practice` (không tới đáp án). Mã: `lib/storage/*`. Dọn file mồ côi: `npm run storage:orphans` (liệt kê; `--delete --confirm` mới xóa). Doctor kiểm bucket riêng tư và không có policy thiếu điều kiện bucket.

### 19.3. Quy tắc dữ liệu thêm ở S5c

- **Ghi buổi học v2** nhận `p_practised_target_ids` (≤ 30, cùng track với em); mỗi mục mới ghi một dòng `exposure_log` source `lesson` vào lúc 12:00 giờ Việt Nam của ngày buổi học (`eng_session_ts`).
- **Một "lần đầu" mỗi (em, tên bài đã chuẩn hóa, ngày)** cho kết quả nhập nhanh không gắn bài giao/khung: lần thứ hai → `23505 duplicate_first`, trừ khi thay đúng bản đang có.
- **`eng_recheck_days`** đọc `tutorwork_settings.recheck_days` (không đọc `assessment_policies`). Không đổi ngưỡng delayed (policy AP-0.2-pilot). Nhãn giao diện "Hỏi lại điểm yếu".
- **Nhập từ pilot giấy:** `eng_record_offline_attempt(…, p_backdate_reason)` cho ngày làm sớm hơn ngày giao tối đa 14 ngày khi có lý do 5–200 ký tự (ghi vào `audit_log` và metadata); các luật ngày khác (≤ hôm nay, thứ tự theo lần làm gần nhất) giữ nguyên. **Ngoại lệ chỉ áp cho bước đã mở cùng lúc với bài giao** (ngày hiệu lực ≤ ngày giao) và **không bao giờ cho bước kiểm tra trễ / chuyển giao** (`delayed_check`, `transfer_check`) → `backdate_not_allowed_for_step`.
- **"Quá hạn":** nhãn hiển thị cho nhân viên khi `due_on` < hôm nay (giờ Việt Nam) và bài chưa có bài nộp/kết quả/chưa rút. Không trừ điểm, không chặn nộp, học sinh không thấy gì mới (D4).

### 19.4. Cài đặt

`tutorwork_settings(key, value jsonb, updated_at, updated_by)`; đọc qua `eng_tutorwork_settings(p_by)` (nhân viên), ghi qua `eng_set_tutorwork_setting(key, value, by)` (service_role; chưa có giao diện — đổi bằng SQL/hàm khi cần). Giá trị không hợp lệ bị từ chối (`22023`).

### 19.5. Xóa dữ liệu một em

Trang `/learners/<id>/delete` (chỉ phụ huynh; gia sư/học sinh 403, em ngoài phạm vi 404). Các bước: (1) **xem trước** số dòng theo nhóm bằng `eng_purge_preview` (chỉ đọc, không xóa); (2) gõ **tên em** (so khớp không phân biệt hoa/thường và khoảng trắng thừa, nhưng vẫn phải đúng dấu); (3) em **thật** (không phải `is_test`) cần thêm tick xác nhận lần hai; (4) `eng_purge_learner` (xóa dòng, biên nhận vào `audit_log`, xóa tên đăng nhập ngắn) rồi `deleteLearnerFolder` (xóa thư mục `{family}/{learner}` trong `english-work`), số file đã xóa ghi thêm bằng `eng_audit_purge_files`. **Không bao giờ xóa tài khoản đăng nhập** (dùng chung Launcher; quyết định A6 ngày 18/10). Nếu xóa file lỗi, dòng đã mất nên file thành "mồ côi" — dọn bằng `storage:orphans`. Mã: `lib/purge/*`, `components/admin/PurgeForm.tsx`; e2e `tests/e2e/purge.spec.ts` (xóa một em thử mới tạo, không đụng An/Nguyên thử).

### 19.6. Kỹ năng đọc (Studio 1 · PR A, migration 0018)

- **Nhãn:** nhóm `error_tags.group_vi = 'Kỹ năng đọc'` (14 nhãn Track B theo thứ tự báo cáo TOMO, 6 nhãn Track A; nguồn `content/tags/reading_*.json`, test đối chiếu từng dòng). `A/doc-hieu` vẫn dùng (chưa nghỉ: `eng_tag_exists` từ chối nhãn đã nghỉ); sẽ nghỉ dùng ở migration sau.
- **`reading_reports`** (append-only, `eng_forbid_mutation`): `learner_id`, `month` (ngày đầu tháng, trong 24 tháng gần đây, không phải tháng sau), `source` (mặc định `TOMO`), `rows jsonb` = `[{tag_key, questions 1..500, correct_pct 0..100}]` (chỉ nhãn nhóm "Kỹ năng đọc" của track em, số nguyên), `note`, `supersedes_id`, `recorded_by_member`, `recorded_role`, `client_id`. Một bản hiện hành mỗi (em, tháng, nguồn); sửa = `supersedes_id`. RLS: nhân viên của em đọc; không ai ghi trực tiếp.
- **`eng_record_reading_report(p_learner, p_month, p_source, p_rows, p_note, p_supersedes, p_by, p_client_id)`** (service_role, sau `requireAccess` `tutorwork:write`; gia sư của em hoặc phụ huynh): kiểm tra tháng/số liệu/nhãn, gửi lại cùng `client_id` + cùng nội dung → bản cũ (`replayed`), tháng trùng → `23505 (duplicate_month)`; ghi `audit_log` (`reading_report.recorded`, không có nội dung).
- **`eng_reading_skills(p_learner)`** (service_role, sau `requireAccess` `tutorwork:read`): mọi kỹ năng đọc đang dùng của track với số liệu báo cáo mới nhất + báo cáo trước đó **cùng nguồn**, trạng thái `none`/`thin`/`weak`/`ok` theo ngưỡng, và số câu sai 6 tuần (chỉ dấu nhãn `test`/`practice` còn hiệu lực; không tính `lesson`/`writing`). `reading_reports` thu cả INSERT của service_role: chỉ hàm ghi được. Sửa bản đã bị thay → `23505 (stale_report)`.
- **Ngưỡng** trong `tutorwork_settings`: `reading_min_questions = 4`, `reading_weak_pct = 60` (đọc trực tiếp trong hàm; chưa có màn đổi).
- **Tín hiệu, không phải bằng chứng:** engine S7 không đọc `reading_reports`. `eng_purge_learner` và `eng_purge_preview` có thêm khóa `reading_reports`.

### 19.7. Bản đồ kỹ năng (SM-1, migration 0019)

- **Nguồn:** `content/skill_map/SM-1.json` (7 mảng → 40 nhóm có mô tả theo dải cấp → lá). Migration nhúng nguyên JSON + sha256 (`skill_maps.source_hash`); test so khớp với file. Đã công bố thì bất biến (trigger `eng_forbid_published_change('self')` cho `skill_maps`, `eng_forbid_skill_map_change()` cho ba bảng con; TRUNCATE luôn bị chặn) → đổi = `SM-2`.
- **Bảng:** `skill_maps(id, title_vi, catalogue_version, assumed, source_hash, published_at)`, `skill_domains(map_id, key, ord, name_vi, scale cefr|task_level)`, `skill_groups(map_id, key, domain_key, ord, name_vi, descriptions)`, `skill_leaves(map_id, kind tag|target, track_id, ref_key, group_key, ord, level_from/level_to (9 nấc CEFR) | task_from/task_to (1–4), level_note, core, hidden_in_picker, related text[])`. RLS: thành viên đọc bản đã công bố; không ai ghi trực tiếp.
- **Nhãn riêng:** `error_tags.group_key` (chỉ `origin = 'custom'`). `eng_add_error_tag_v2(p_learner, p_key, p_label, p_group_key, p_by)` bắt buộc nhóm của bản đồ hiện hành (`23514 (unknown_group)`); `eng_set_tag_group(p_learner, p_tag_key, p_group_key, p_by)` xếp nhóm một lần cho nhãn riêng chưa có nhóm (`(already_grouped)`, audit `error_tag.grouped`). `eng_add_error_tag` (0014) giữ nguyên.
- **Đọc:** `eng_skill_map(p_learner)` (service_role, sau `requireAccess`): mảng → nhóm → lá (nhãn có sẵn của track em kể cả lá ẩn, nhãn riêng của gia đình đã có nhóm, mọi kỹ năng danh mục với cờ `in_set`) + `unassigned`. "Điểm cần chú ý" không đổi SQL: `lib/skillmap/group.ts` gộp `eng_weak_points` theo bản đồ.

### 19.8. Hồ sơ cấp đang học (SM-2, migration 0020)

- **Bảng (chỉ thêm, `eng_forbid_mutation('learner_id')`, RLS đọc `eng_is_staff_of`, không ai ghi trực tiếp):** `level_decisions(id, learner_id, domain_key, map_id, from_level, to_level, kind baseline|level_up|adjust, reason (bắt buộc với adjust), evidence jsonb, policy_version, decided_by_member, decided_role = 'tutor', client_id, decided_at)`; `external_results(id, learner_id, exam KET|PET|FCE|CAE|CPE|VAO10_MOCK|SCHOOL|OTHER, taken_on, score_text, domains text[], file_id → files (kind 'external_result'), note, recorded_by_member, recorded_role tutor|parent, supersedes_id → external_results (nullable, duy nhất khi có), client_id, recorded_at)`. **Sửa một kết quả = dòng mới có `supersedes_id`** (như `results.supersedes_id`, 0014): dòng cũ không bị sửa hay xóa, mỗi dòng bị thay tối đa một lần. Cả hai nằm trong `eng_purge_learner` / `eng_purge_preview` (mốc ngoài xóa trước `files`; file thật xóa bằng `deleteLearnerFolder`).
- **Cấp hiện tại** = dòng gần nhất của mảng; chưa có → `skill_maps.assumed` theo track (status `assumed`). Thang theo `skill_domains.scale`: CEFR 9 nấc hoặc bậc '1'..'4'.
- **Ghi (service_role sau `requireAccess`):** `eng_record_level(p_learner, p_kind, p_levels jsonb, p_reason, p_by, p_client_id)` — chỉ gia sư còn quan hệ hiệu lực (`42501 (tutor_only)`); baseline một lần mỗi mảng (`(already_confirmed)`), adjust cần baseline (`(needs_baseline)`), đúng 1 mảng, khác cấp (`(same_level)`), có lý do (`(reason_required)`); `level_up` bị từ chối (`(level_up_reserved)`, để S7); `from_level` và `evidence` do hàm tính. `eng_record_external_result(p_learner, p_exam, p_taken_on, p_score_text, p_domains, p_note, p_file, p_by, p_client_id, p_supersedes default null)` — gia sư hoặc phụ huynh; ngày ≤ hôm nay, ≥ 3660 ngày trước (`(bad_date)`); `p_supersedes` phải là dòng của chính em này (`P0002 (not_found)`) và chưa bị thay (`23505 (already_superseded)`). Audit `level.recorded` / `external_result.recorded` / `external_result.corrected` (không lý do, không điểm).
- **Đọc:** `eng_level_profile(p_learner)` (7 mảng + lịch sử 30 + mốc ngoài còn hiệu lực 30, mỗi dòng sửa kèm `replaces` = dòng cũ và `file_id` = phiếu điểm hiệu lực (của chính nó, không thì của dòng gần nhất trước nó trong chuỗi sửa; `file_inherited`), + 6 báo cáo đọc gần nhất, không tên nguồn), `eng_recent_level_changes(p_learner, p_days)` (trang chủ phụ huynh; tối đa 40 dòng mỗi em, ứng dụng xếp điều chỉnh trước, gộp xác nhận cấp khởi điểm cùng ngày và lấy 5 dòng), `eng_external_result(p_learner, p_id)` (một kết quả theo id cho màn "Sửa": `live` / `superseded` / `not_found`) — service_role; `eng_my_review_by_domain()` — **authenticated**, nhận diện em bằng `auth.uid()`, trả tối đa 3 `{domain_key, domain_name, label}` từ các nhãn đến hạn hỏi lại của `eng_weak_points`.
- **App:** `lib/levels/` (thang, ± 1 cấp, văn bản), action `levels:decide` (chỉ gia sư), `loadPickerMap` = bản đồ + `current` → `groupTags` chia `groups` / `far` (P4-c). Chữ về người dạy: `tutorHonorific` ("thầy/cô"), không viết cứng "cô" (test quét).

### 19.9. Góp ý cho con + Sửa bài (S6, migration 0021)

- **Bài sửa:** `attempts.revises_attempt_id` → bài được góp ý. Luật trong DB: `mode = 'REVISION'`, `attempt_no > 1`, `parent_attempt_id = revises_attempt_id`, cùng em và cùng `learning_family_id` với bài đó (CHECK `attempts_revision_shape` + trigger `attempts_revision_check`); episode của mọi lần REVISION có `is_first_attempt = false` (trigger `episodes_revision_not_first`, FR-14a). `attempt_no` = lớn nhất trong gia đình / trên bước + 1 (có thể trùng số với một lần làm lại ở bước gốc — số chỉ duy nhất theo bước). Episode bài sửa: `facets.revision = true`; một dòng `assistance_events` (`tutor_prompt`, `observed`, mọi kỹ năng của cặp, `recorded_by` = người góp ý) → S7 đọc là bằng chứng có hỗ trợ; lần luyện `retry`.
- **Cài đặt theo track:** `track_settings(track_id, key, value)` — `revision_reason_required` (A false, B true), `revision_target_key` (A `A-A3-REDRAFT`, B `B-A3-REVISE`). Chỉ đọc qua hàm.
- **Sổ (chỉ thêm, RLS đọc `eng_is_staff_of`, không ai ghi trực tiếp):** `feedback_notes(source_attempt_id, root_attempt_id, round 1|2, kind feedback|closing, praise, items [{n, text, excerpt?, leaf?}], requires_revision, revision_activity_id, supersedes_id, author_member, author_role, client_id)` — sửa = dòng mới thay dòng cũ (mỗi dòng bị thay tối đa 1 lần; chỉ khi con chưa có nháp / bài sửa); `revision_marks(attempt_id, feedback_id, item_n, choice changed|kept, reason)`; `revision_checks(attempt_id, item_n, verdict improved|not_yet|reason_ok, checker_member, checker_role)`. Bảng từ chối chữ có dạng điểm trong câu khen / góp ý (`eng_has_score_words`, luật thu hẹp 22/10, năm loại: phân số kiểu điểm `a/b` với `b` 1–10 và `a ≤ b` (trừ sau chữ ngày, ngày đầy đủ `a/b/c`, và "… trang"); con số sát "điểm" / "diem" / "đ"; "N trên M" với M 1–10; dấu % sau con số; hai nhãn trên của thang 0–4 — "Đạt yêu cầu", "Vững, rõ ràng" (S7a, sửa đổi A: ba nhãn dưới là chữ thường lại). Chuẩn NFC + khoảng trắng lạ → khoảng trắng thường; chỉ áp cho chữ người lớn). Cả ba nằm trong `eng_purge_learner` / `eng_purge_preview`.
- **Không để bài sửa treo:** sửa góp ý khóa cả bước sửa (cùng khóa với lưu nháp / nộp) trước khi hỏi "con đã bắt đầu chưa"; nộp bài sửa gửi kèm `feedback_id` và bị từ chối `(feedback_changed)` nếu góp ý đó không còn hiệu lực (màn báo: tải lại trang); "Xong", "Mở vòng 2" và màn trước–sau lấy góp ý theo `revision_marks.feedback_id` của chính bài sửa, không theo "dòng đang hiệu lực". Dòng "Sửa bài" ở trang chủ con chỉ hiện khi bước đã mở (không bị bỏ, không dời về sau); bài ghi NGOÀI app trên bước sửa (`eng_record_offline_attempt`) coi như đã làm xong việc đó (`eng_revision_offline_answered`).
- **Bước sửa:** `eng_open_revision_step` — bước REVISION đầu tiên sau bài, không có bước `ACT-WRITE` xen giữa, còn trống, không bị bỏ (dời về hôm nay nếu cần); không thì bước `ACT-REVISE` riêng, `step_no` 1001+, target = `revision_target_key`, mở hôm nay. Bước REVISION chỉ làm được trong app khi `eng_revision_open(activity)` (có góp ý còn hiệu lực yêu cầu sửa, chưa có bài sửa); `eng_step_supported` của S4 giữ nguyên (đường S4 vẫn từ chối REVISION).
- **S5 mở rộng:** `eng_episode_targets` trả thêm kỹ năng của bài gốc cho bài sửa (sau kỹ năng của bước sửa) → điểm A3 và điểm ngôn ngữ đi qua `observations` / `validation_decisions` như cũ; A3 không thuộc `target_ids` của A-v1 / B-v1 nên không vào mẫu số độ phủ. **D14 trọn vẹn:** `eng_review_role`, `eng_tag_episode` (gắn nhãn bài viết) và `eng_review_episode` (màn xem bài: cờ `restricted`) cùng dùng `eng_episode_restricted` — bài sửa của bài kiểm tra trong buổi / bài quan sát trực tiếp chỉ gia sư duyệt, chấm, gắn nhãn; phụ huynh không (42501 khi gắn nhãn). `eng_review_inbox`: bài sửa "xong" khi đã bấm Xong / Mở vòng 2; có `revision_round`.
- **Ghi (service_role sau `requireAccess`):** `eng_write_feedback(p_source_attempt, p_praise, p_items, p_requires_revision, p_supersedes, p_by, p_client_id)`; `eng_finish_revision(p_attempt, p_action close|round2, p_checks, p_closing, p_praise, p_items, p_by, p_client_id)` — đánh giá đủ mọi góp ý + Xong / vòng 2 trong một transaction; vòng 3 bị chặn. Lỗi có thẻ `(tag)` cuối câu để màn hình giải thích.
- **Đọc:** người lớn — `eng_feedback_panel(p_attempt, p_by)`, `eng_revision_view(p_attempt, p_by)`, `eng_revision_list(p_learner)` (service_role); học sinh — `eng_my_feedback()`, `eng_my_revision(p_activity)`, `eng_save_revision_draft`, `eng_submit_revision` (authenticated, theo `auth.uid()`): chỉ câu khen, góp ý, trích đoạn, bài cũ, trạng thái, nhận xét kết — không điểm, quan sát, quyết định, đánh giá, lá kỹ năng.
- **Chỉ góp ý:** `eng_my_activity_note(p_activity)` (authenticated, theo `auth.uid()`) — ghi chú "Chỉ góp ý" còn hiệu lực của chính bài đó, không hết hạn 14 ngày (ô ở trang chủ thì 14 ngày); chỉ câu khen + góp ý + trích đoạn.
- **App:** `lib/revision/` (so khác theo từ, tìm trích đoạn, luật đánh dấu / đánh giá, kiểm chữ có dạng điểm — cùng mẫu với DB), màn sửa tại `/activities/[id]`, "Bài đã sửa" tại `/learners/[id]/revisions`.

### 19.10. Trạng thái từng kỹ năng (S7a, migration 0022 + 0023)

- **Ngưỡng:** `AP-0.3` (`content/assessment_policy_AP-0.3.json`, sinh `0022_seed_ap_0_3.sql` bằng `gen:config -- --new`) = AP-0.2 + `receptiveAuto` (cách 2, P3-b; thêm `developingMinItems: 4` / `developingMinAccuracyPct: 75` cho bậc 2 — G2) + `flagMinItems: 4` (N1: ⚑ cách 2 chỉ khi lần làm có ≥ 4 câu được tính) + `levelGate: null` (để dành S7b) + `developing.minScore = 3` (G1). Danh mục đã khóa vẫn trỏ AP-0.2; engine đọc `engine_policy_map` (chỉ thêm, `0.2.1-draft → AP-0.3`).
- **Engine:** `lib/engine/computeTargetState.ts` — hàm thuần, `ENGINE_VERSION = "S7a-1"`, chỉ import tương đối. Vào: chính sách, bài đã duyệt (điểm hiện hành), câu tự chấm, lần luyện, dấu "chủ đề / nguồn mới", sổ quyết định. Ra: `auto` (1–2), `propose` (3–4), `raiseFlag`, điều kiện từng bậc, bằng chứng, `evidenceKey` (FNV-1a 64 trên id đã sắp xếp, `<số>-<16 hex>`). Ngày = ngày lịch Việt Nam. Không bao giờ hạ bậc. Kỹ năng thuộc mảng Đọc / Nghe / Ngữ pháp / Từ vựng: ≥ 1 câu tự chấm đúng → bậc 1; ≥ 4 câu ở ≥ 75 % → bậc 2 (AUTO, không cần xác nhận); bậc 3 vẫn cần cách 1 hoặc cách 2 đủ điều kiện + thầy/cô xác nhận.
- **Giao lại cùng mẫu (N6, phụ huynh 23/10):** bước của mẫu = (`episodes.context_id` = mã mẫu bài, `activity_instances.step_no`); lần nộp chỉ là "lần làm đầu" của engine nếu là lần làm đầu sớm nhất của em trên bước đó, qua mọi lần giao (`eng_is_step_repeat`, trường `step_repeat` của `eng_engine_inputs`; tính cả lần làm đầu chưa được duyệt, theo giờ nộp). Lần giao sau của cùng bước là bài ôn: làm được bài ôn ≥ 14 ngày (cách 2) hoặc bài "ôn lại" bậc 4 theo khoảng cách ngày, nhưng không thêm lần làm đầu (cách 1, cách 2, bậc 2, ⚑), không là "bài khác" và không là bài chuyển giao. **⚑ cách 2 (N1):** chỉ khi chính lần làm đó có ≥ `flagMinItems` (4) câu được tính; ⚑ cách 1 không đổi.
- **Sổ `mastery_decisions`** (chỉ thêm, `eng_forbid_mutation`): CHECK ép AUTO chỉ lên 1–2, PROPOSED chỉ lên 3–4, ⚑ giữ bậc (≥ 2), MANUAL chỉ về 1–2 có lý do, CONFIRMED / REJECTED trả lời đúng 1 dòng (`responds_to` unique). Một đề xuất mở cho mỗi (em, kỹ năng); "đã đề xuất rồi" tính theo **(bậc, `evidence_key`)** (chỉ mục duy nhất theo `to_state`, B1), nên bậc 4 vẫn được đề xuất khi bằng chứng của nó đã có từ lúc đề xuất bậc 3. Khóa của đề xuất = bằng chứng mà điều kiện của bậc đó thực sự dùng (S3): cách 1 = nhóm bài được tính; cách 2 = các lần làm được tính; bậc 4 = bài ôn trễ + bài chuyển giao + id dòng dấu; sau REJECTED chỉ có bằng chứng **được tính** mới đưa đề xuất quay lại. Dòng MANUAL lưu `evidence_key` (khóa chung của mọi bài đã duyệt, câu tự chấm và dấu) thầy/cô đang thấy; chừng nào dòng bậc mới nhất là MANUAL với đúng khóa đó, engine và `eng_apply_engine_results` không ghi AUTO / PROPOSED (B2). Cách 2: bài ôn cần ≥ `reviewMinDays` sau lần luyện gần nhất, không có lối tắt `delayed_check` (S5); ⚑ tính "sau quyết định" từ `max(giờ nộp, giờ duyệt)` (S2). `competency_state.inputs_at` chống lần tính chậm ghi đè điều kiện mới hơn (N2); dòng AUTO ghi `route` của đường dẫn tới bậc 1–2 (N5).
- **`competency_state`** = dẫn xuất: bậc theo dòng AUTO / CONFIRMED / MANUAL mới nhất (`seq`), ⚑ và đề xuất đang mở, điều kiện lần tính gần nhất. "Tính lại từ đầu" (`eng_reset_skill_states`) dựng lại từ sổ + bài làm, kết quả giống hệt; không tạo đề xuất trùng.
- **`episode_marks`** (G4, chỉ thêm): **chỉ thầy/cô của em** (quan hệ còn hiệu lực; phụ huynh xem, không tick — S1) tick "Bài này ở chủ đề / nguồn mới (vận dụng)" (`eng_mark_episode_transfer`, chỉ lần làm đầu, không phải bài sửa; dòng mới nhất của (bài, dấu) quyết định, bỏ tick = dòng mới). Engine coi bài đó là bước `transfer_check` (bậc 4) — như dấu của mẫu chủ đề; bài có dấu là bài chuyển giao, **không** tính là bài ôn trễ (C7).
- **Chạy:** sau mỗi lần ghi thành công (duyệt S5, sửa quyết định, hỗ trợ quan sát, dấu "chủ đề mới", bài ngoài app, em nộp bài, S6 Xong / Vòng 2) — đồng bộ, fail-soft (`app_errors` `engine_recompute`), chưa áp 0023 thì bỏ qua.
- **Hàm (service_role sau `requireAccess`):** `eng_engine_inputs`, `eng_apply_engine_results`, `eng_decide_skill` (Xác nhận / Chưa / Giữ bậc — chỉ thầy/cô của em), `eng_confirm_skill_proposals` (Xác nhận tất cả, không bao giờ ⚑), `eng_set_skill_state` (sửa tay 1–2), `eng_reset_skill_states` (thầy/cô hoặc phụ huynh), `eng_mark_episode_transfer`, đọc `eng_skill_states`, `eng_skill_inbox`. Không có hàm nào cho học sinh. Xóa dữ liệu một em xóa cả ba bảng.
- **App:** `lib/engine/` (engine, runner, hook), `lib/skills/` (API, view), Hộp duyệt → tab "Kỹ năng" (`/review/skills`), Kỹ năng đang theo dõi (thang 4 ô, ⚑, đang chờ xác nhận, sửa tay, tính lại), Hồ sơ cấp (Đã vững · n/N, Đang luyện, Còn cần), ô tick trên `/review/[episodeId]`.


### 19.11. Studio B1 — đề PDF/Word → bài trong app (migration 0024)

- **Bảng mới:** `ai_settings` (công tắc + trần của gia đình, trần ≤ $10), `ai_runs` (sổ chi phí chỉ thêm, không nội dung, không `learner_id` nên không xóa được kể cả khi xóa dữ liệu một em), `studio_drafts` (nháp, sửa được khi `extracting` / `ai_failed` / `draft`), `studio_item_meta` (đúng một nhãn mỗi câu; chỉ người lớn đọc), `accepted_additions` ("Đúng" cho câu lạ, áp cho lần làm sau), `item_decisions` (Đúng/Sai của người lớn cho câu `needs_person`). Cột mới: `inquiry_templates.kind | family_id | learner_id` (mẫu `studio` của một em, id `^[AB]-ST-[0-9]{6}$`, không nằm trong `content/`), `results.attempt_id | not_in_app_items`, `files` (kind `studio_test` / `studio_key`, `.docx`), bucket `english-work` thêm `.docx`.
- **Ai đọc gì:** nháp, nhãn câu, đáp án chấp nhận, Đúng/Sai, mẫu Studio + khóa + nguồn: chỉ phụ huynh và gia sư **của em đó** (`eng_is_staff_of`). Bảng AI: không vai nào của app đọc thẳng. Học sinh: chỉ `eng_my_studio_review(uuid)` (quyền `authenticated`) — câu sai (đề, câu em viết, đáp án, giải thích) và số thứ tự câu đang chờ; không bao giờ điểm, tổng, x/y, nhãn hay kỹ năng. **Thay ở W4c2 (§19.23):** hàm này đã bị thu quyền; con chỉ còn `eng_my_result_view` (không đáp án, không giải thích). Chi phí AI chỉ phụ huynh thấy.
- **Hàm (service_role sau `requireAccess` / `requireStaff`, tự kiểm lại người thao tác):** `eng_ai_gate`, `eng_ai_settings`, `eng_set_ai_settings`, `eng_log_ai_run`, `eng_studio_skills`, `eng_create_studio_draft`, `eng_edit_studio_draft`, `eng_save_studio_draft`, `eng_finish_studio_extraction`, `eng_fail_studio_extraction`, `eng_discard_studio_draft`, `eng_approve_studio_draft` (mẫu + nguồn + khóa + nhãn + khung đề giấy trong một giao dịch), `eng_assign_studio`, `eng_decide_studio_items`, `eng_studio_pending`, `eng_studio_draft(s)`. Nội bộ: `eng_record_studio_result` (idempotent mỗi lần làm, ghi `results` + `tag_marks`), `eng_compute_auto_checks` (nhánh transform / short / open chỉ cho mẫu Studio), `eng_engine_inputs` (câu `needs_person` lấy Đúng/Sai của người lớn; JSON không đổi nên `lib/engine` không đổi).
- **Kết quả bài:** trigger `AFTER INSERT` trên `episodes` gọi `eng_record_studio_result`; lỗi chỉ ghi `app_errors` (`studio_result`), không bao giờ làm hỏng lần nộp của con.
- **Xóa dữ liệu một em:** mẫu Studio đã công bố chỉ xóa được bên trong `eng_purge_learner`, cho đúng em đó (`eng_purge_allows_studio`); mẫu chủ đề tuần không bao giờ. `eng_purge_learner` và `eng_purge_preview` giữ mọi dòng của 0023 và thêm các bảng Studio.
- **AI:** `lib/ai/` (`anthropic.ts` là nơi duy nhất đọc `ANTHROPIC_API_KEY`, `request.ts` gọi Messages API bằng `fetch`, `pricing.ts` bảng giá ước tính, `cap.ts` cổng + tháng lịch Việt Nam UTC+7, `prompts.ts` đọc `prompts/studio-extract.v1.md`), `AI_FAKE=1` trả `tests/fixtures/studio/fake-extract.json` (CI, không gọi mạng). Chỉ gửi đề + đáp án của thầy/cô + danh sách nhãn / kỹ năng; không bao giờ tên, bài làm, điểm hay mã của em. AI chỉ soạn nháp; không chấm bài của con, không đổi bậc. Trần $10/tháng (báo ở $8); hết trần → chỉ "Soạn tay".
- **App:** `lib/studio/` (schema, validate, normalize, buildTemplate, summary, extract, handlers, supabaseStore, route, load, shape), API `app/api/studio/**`, `app/api/settings/ai`, `app/api/review/studio/**`, `app/api/student/activities/[id]/studio-review` (**thay ở W4c2 (§19.23)**: route và khối "Câu cần xem lại" đã bỏ); màn `/settings/ai`, `/studio/new`, `/studio/drafts/[id]`, `/review/studio`.

### 19.12. Ghi chú dạy học · Hồ sơ đầu vào · Góp ý về app (W1, migration 0025)

- **Bảng (chỉ thêm, không ai ghi trực tiếp; học sinh không SELECT được bảng nào):** `teaching_notes(id, learner_id, field focus|explain|errors|avoid, text ≤ 600, author_member, author_role = 'tutor', client_id, created_at)` — bản hiện hành = dòng mới nhất **của từng ô** (đọc mỗi ô một truy vấn `limit 1`); `learner_intake(id, learner_id, content jsonb {goals[], strengths{mảng}, weaknesses{mảng}, note}, author_member, author_role, client_id, created_at)` — bản hiện hành = dòng mới nhất; `app_feedback(id, family_id, by_member, by_role tutor|parent, kind bug|hard_to_use|suggestion|question, screen, text ≤ 1000, client_id 8..90, created_at)` và `app_feedback_events(id, feedback_id, status new|in_progress|done|wont_do, reply ≤ 600, by_member, client_id, created_at)` — theo **gia đình**, không có `learner_id`; trạng thái và lời trả lời = sự kiện mới nhất. Hai bảng đầu gắn `eng_forbid_mutation('learner_id')`, hai bảng sau `eng_forbid_mutation()`.
- **Hàm ghi (service_role sau `requireAccess` / `requireStaff`, tự kiểm lại người thao tác, idempotent theo `client_id`; cùng `client_id` mà nội dung khác → `23505 (client_id_reused)`):** `eng_write_teaching_note` và `eng_write_intake` — chỉ gia sư còn quan hệ hiệu lực với em (`42501 (tutor_only)`; `(bad_field)`, `(too_long)`, `(bad_content)` với trần 12000 ký tự); `eng_send_app_feedback` — phụ huynh của gia đình hoặc gia sư còn ít nhất một quan hệ hiệu lực (`eng_tutor_active_in_family`), nếu không `42501 (staff_only)`, tự tạo sự kiện `new` (`<client_id>:new`); `eng_update_app_feedback` — chỉ phụ huynh của gia đình (`(parent_only)`), `wont_do` bắt buộc có lời trả lời (`23514 (reply_required)`). Audit: `teaching_note.written`, `intake.written`, `app_feedback.sent`, `app_feedback.updated` (không có chữ của người dùng).
- **Ai đọc gì (RLS):** `teaching_notes` / `learner_intake` theo `eng_is_staff_of(learner_id)` (phụ huynh gia đình + gia sư của em). `app_feedback` / `app_feedback_events` theo `eng_may_see_feedback(family_id, by_member)`: **phụ huynh thấy mọi góp ý của gia đình; gia sư chỉ thấy góp ý do chính mình gửi (và sự kiện / trả lời của chúng), và chỉ khi còn quan hệ gia sư hiệu lực**; học sinh và gia đình khác: không thấy gì.
- **Xóa dữ liệu một em:** `eng_purge_learner` và `eng_purge_preview` thêm `teaching_notes`, `learner_intake` (giữ mọi dòng của 0024); `app_feedback*` thuộc gia đình nên không bị xóa.
- **Bản preview:** khi `ALLOW_REAL_LEARNERS=false`, `/feedback` và hai API góp ý chỉ cho gia đình không có em thật (`lib/workdesk/guard.ts`), còn lại 404.
- **App:** `lib/workdesk/` (types, schemas, handlers, supabaseStore, route, shape, load, guard, missing); `load.ts` trả `{available:false}` khi chưa áp 0025 (màn báo nhẹ, không 500); action `teaching:write` (chỉ gia sư); API `app/api/learners/[id]/{teaching-notes,intake}`, `app/api/feedback`, `app/api/feedback/[id]`; màn `/feedback` và hai thẻ trên `/learners/[id]/levels`; `AppHeader` có `feedbackScreen` cho trang người lớn.

### 19.13. Giáo trình (W2, migration 0026)

- **Bảng mới:** `curricula` (một quyển / nguồn của MỘT em; không có `kind`; `level_note`; bất biến), `curriculum_versions` (payload nháp + `ai_payload` bản AI để đếm % sửa; `extracting → draft | ai_failed → approved → superseded`, `discarded`; một nháp mở và một bản đang dùng mỗi giáo trình; trigger `eng_guard_curriculum_version`), `curriculum_units` + `curriculum_unit_points` (chỉ sinh trong `eng_approve_curriculum_version`, mã Unit ổn định, mỗi dòng nối = 1 `error_tags.key` của track / gia đình), `curriculum_unit_events` (chỉ thêm; theo giáo trình + mã Unit, không theo phiên bản), `lesson_note_units` (Unit đã dạy của một buổi, trỏ tới Unit của bản đang dùng lúc ghi). `files.kind` thêm `curriculum_toc` (chỉ PDF). `ai_runs.purpose` thêm `curriculum_toc`.
- **Ai đọc gì:** mọi bảng mới: phụ huynh và gia sư **của em đó** (`eng_is_staff_of`); học sinh không. Chi phí AI chỉ phụ huynh thấy.
- **Hàm (service_role sau `requireAccess`, tự kiểm lại người thao tác):** `eng_create_curriculum`, `eng_add_curriculum_version`, `eng_edit_curriculum`, `eng_save_curriculum_draft`, `eng_finish_curriculum_extraction`, `eng_fail_curriculum_extraction`, `eng_discard_curriculum_draft` (gia sư hoặc phụ huynh), `eng_approve_curriculum_version` (**chỉ gia sư của em**, D-W8), `eng_set_unit_status`, `eng_write_lesson_note_v3` (= v2 + Unit; v1/v2 không đổi). `eng_ai_gate` / `eng_log_ai_run` thêm tham số cuối `p_purpose` (mặc định `studio_extract`). `eng_skill_map` đặt nhãn có sẵn mang `group_key` (nhãn nghe `nghe-…`, R7) vào nhóm.
- **Dẫn xuất:** "đang học đến", độ phủ tính trong `lib/curriculum/progress.ts` từ sự kiện mỗi lần đọc (DOMAIN §5.1); không lưu.
- **AI:** `prompts/curriculum-toc.v1.md`, tool `save_curriculum_toc` (điểm = enum danh sách đóng), tối đa 3 lần, mỗi lần giữ chỗ giá xấu nhất rồi ghi sổ; chỉ gửi PDF mục lục + tên sách + ghi chú cấp + danh sách nhãn. `AI_FAKE=1` → `tests/fixtures/curriculum/fake-toc.json` (fixture theo tên tool). Bộ đề chuẩn: `tests/fixtures/curriculum/destination-c1c2.golden.json`, `npm run golden:curriculum`.
- **Xóa dữ liệu một em:** thêm 6 bảng; khóa mới của biên nhận ở object `jsonb_build_object` thứ hai (giới hạn 100 tham số).
- **App:** `lib/curriculum/*`, API `app/api/learners/[id]/curricula/**`, `app/api/curricula/**`; màn `/learners/[id]/curricula`, `/learners/[id]/curricula/[curriculumId]`, `/curricula/versions/[id]`; Ghi buổi có "Unit đã dạy hôm nay".

### 19.14. Khung bàn làm việc (không migration)

- **Chỉ giao diện + đọc:** không bảng, không route API, không AI mới. Mọi trang người lớn (gia sư, phụ huynh) nằm trong `StaffShell` (thanh trên + cột trái 220 px cố định; điện thoại: ngăn kéo). Màn của con không import `components/shell` (test canh `tests/unit/shellPages.test.ts`).
- **Cột trái là dữ liệu thuần:** `lib/shell/nav.ts` (`SECTIONS`, `buildNav`; mục của lát sau có `status: "soon"` = hiện mờ, không link) và `lib/shell/paths.ts` (một bảng đường dẫn → mục đang mở, trang con, tên màn góp ý; `switchHref` cho nút chọn em). Không rẽ nhánh theo track.
- **Khung theo em:** `app/learners/[id]/layout.tsx` gọi `requireShell(id, { strict: true })` (`lib/shell/load.ts`, đọc bằng user client như trang chủ cũ): học sinh hoặc em ngoài phạm vi → 404 trơn; mỗi trang vẫn giữ cổng riêng (`requireLearnerPage` / `authorizeLearnerPage`). 9 trang ngoài nhánh đó tự bọc `StaffShell`, lấy em từ `?learner=` hoặc từ bài / bản nháp.
- **Bàn làm việc** (`/`, người lớn): `lib/desk/load.ts` (`loadDesk`, `loadPendingRows`; mềm: một nguồn lỗi không làm sập trang, chạy sau cổng của em) + hàm thuần `lib/desk/pending.ts` (`buildPendingRows`: bài làm, Cần thầy/cô xem, kỹ năng và ⚑, nháp đề, nháp giáo trình; cũ nhất trước) và `lib/desk/alerts.ts` (`deskAlerts`). **Chờ duyệt** `/learners/[id]/inbox`: bảng chỉ có liên kết "Mở" sang trang duyệt cũ (`/review*`, `/studio/drafts/[id]`, `/curricula/versions/[id]`), không nút duyệt (DOMAIN R1).

### 19.15. Mức điểm kiến thức + Nạp bài đã làm (W3, migration 0027 + 0028)

- **Sổ điểm riêng, song song S7a:** `point_policies(version, config, source_hash)` (seed `PP-0.1` ở migration **0028**, sinh bằng `gen:config -- --new`, khóa trong `content/config.lock.json`), `point_decisions` (chỉ thêm: `AUTO · PROPOSED · CONFIRMED · REJECTED · MANUAL · FLAG`, `responds_to`, `evidence_key`) và `point_state` (dẫn xuất; xóa / tính lại được). Khóa theo `tag_key` = `error_tags.key` (nhãn kiến thức hoặc kỹ năng đọc / nghe, `coalesce(tag_key, reading_skill_key)` của `studio_item_meta`). Học sinh không SELECT được bảng nào.
- **Bằng chứng = câu đóng đã chấm** (`attempt_auto_checks` ⋈ `studio_item_meta`): được tính khi là lần làm đầu, không phải lặp bước, không hỗ trợ (`declared_assistance = {none}`), kết quả đúng / sai. Ngày = ngày lịch Việt Nam (`attempts.taken_on` nếu có). Câu có hỗ trợ nâng tối đa lên mức 2. `eng_point_inputs` trả toàn bộ đầu vào cho engine thuần.
- **Engine thuần** `lib/engine/points/` (`compute.ts`, `project.ts`, `shape.ts`, `runner.ts`): cùng kỷ luật S7a — không tự hạ bậc; AUTO mức 1–2; PROPOSED mức 3–4 do **gia sư của em** xác nhận (`eng_decide_point`); một đề xuất mở cho mỗi (em, điểm); không đề xuất lại cùng (mức, khóa bằng chứng); ⚑ khi đang ≥ mức 3 mà 2 trong 3 câu gần nhất sai; MANUAL mức 1–2 giữ khi bằng chứng chưa đổi (B2). Khóa bằng chứng chỉ gồm bằng chứng (không gồm id quyết định) để MANUAL so khớp được. `eng_apply_point_results` ghi kết quả; `eng_reset_point_states` + chạy lại = "Tính lại từ đầu" (hai lần liền → cùng trạng thái, không dòng mới).
- **Một hộp duyệt, hai sổ (R1):** `eng_point_inbox` trả đề xuất / ⚑ điểm; tab "Kỹ năng" gộp theo em (kỹ năng trước, điểm sau), số trên tab = cả hai; "Chờ duyệt" của em có dòng loại `point` chỉ **liên kết** tới tab đó (không nút duyệt).
- **Nạp bài đã làm:** `import_batches` (`reading → draft | ai_failed → confirmed | discarded`; `payload.items`; chống trùng theo `source_hash` hoặc (tên đề + ngày làm) trừ khi "lần làm khác"). `eng_create_import` (gia sư hoặc phụ huynh) → AI đọc nền (`read-answers.v1`, tool `save_read_answers`, ≤ 3 lần, đặt chỗ giá xấu nhất, `ai_runs.purpose = 'read_answers'`, trần $10) → code so đáp án (`gradeRead`; không chắc = `needs_person`) → `eng_confirm_import` (**chỉ gia sư của em**) dựng mẫu `kind = 'imported'` (id `X-IM-NNNNNN`, của riêng em, không trong danh mục giao) + một `inquiry_instance` / `activity_instance` + một lần làm `provenance = 'imported'` (có `taken_on`, `support_level`, `source_hash`) + `attempt_auto_checks`. Mẫu `imported` **không** là "lần làm đầu" của bước nào đã giao (R2) nên S7a không đổi; `eng_my_*` và RLS của `attempts` giấu bài nạp khỏi học sinh.
- **Bản đồ kiến thức:** `eng_point_map` → trang `/learners/[id]/knowledge` (mảng › nhóm › điểm, thang 4 ô có chữ, từng câu Đúng / Sai, giáo trình có dạy điểm đó).
- **Sau review Opus (08/11, sửa thẳng `0027`):** `import_batches.payload` mặc định `{"items": []}` được đọc ở mọi trạng thái (`batchPayloadSchema`); "đọc quá lâu" tính từ `touched_at` (lần đổi gần nhất). Đường **soạn tay** (`eng_create_import(p_manual)` → `draft` trống; `eng_retry_import_read` ai_failed → `reading` hoặc `draft`) và `eng_import_pending` cho "Chờ duyệt". Câu để trống = sai trong `eng_point_inputs` / `eng_point_map`; thứ tự cùng ngày theo (số mảng, mảng, số câu); `taught_unit` chỉ khi có ghi chú buổi học gắn Unit; `eng_apply_point_results` lưu tối đa 400 tham chiếu **gần nhất** và cô lập lỗi từng điểm (`failed`). `eng_decide_point` có thêm hành động `lower` (chỉ cho ⚑; ghi một dòng MANUAL về "Đang tiến bộ" có lý do, trả lời ⚑, mang `evidence_key` đang xem); phụ huynh chỉ đọc. Mọi write hook của engine kỹ năng chạy luôn engine điểm (`lib/engine/writeHook.ts`).
- **Xóa dữ liệu một em:** `eng_purge_learner` / `eng_purge_preview` thêm `point_decisions`, `point_state`, `import_batches` (+ file, mẫu và lần làm `imported`); khóa mới ở object `jsonb_build_object` thứ ba (giới hạn 100 tham số).
- **App:** `lib/engine/points/*`, `lib/points/*` (handlers, stores, route, load, shape, view), `lib/import/*` (handlers, build, review, extract, normalize, readTool, schema); action `points:read|decide|rebuild`, `import:upload|confirm`; API `app/api/review/points/[id]`, `app/api/learners/[id]/{points/rebuild,imports,imports/files}`, `app/api/imports/[id]{,/confirm,/discard}`; màn `/learners/[id]/knowledge`, `/learners/[id]/imports/new`, `/imports/[id]`; `AiDocument` thêm loại `image`.

### 19.16. UX vòng 2A (13/11/2026, không migration)

- **Tốc độ.** `vercel.json` ghim `regions: ["sin1"]` (Hobby một vùng; CSDL ở Singapore; test `tests/unit/region.test.ts` canh). Mỗi yêu cầu gọi `getAuthUser` / `getMemberByUserId` / `loadHome` qua React `cache()` nên layout và page của cùng route dùng chung một lượt; `requireAccess` đọc em ∥ quan hệ gia sư; `withShell` (`lib/shell/parallel.ts`) chạy `loadHome` song song với việc đọc của trang. Dữ liệu đọc bằng admin client vẫn chỉ sau khi `requireAccess` xong (quyền không đổi).
- **Hook sau khi trả lời.** `deferHook` (`lib/engine/defer.ts`) bọc hook tính lại kỹ năng + mức mục kiến thức trong `after()` của `next/server`; handler không đổi; lỗi được bắt và ghi `logAppError('engine_deferred')`. Các hook của cùng một em xếp hàng nối đuôi trong tiến trình (`deferHook`), nên lần chạy cũ không áp sau lần chạy mới; giữa các máy chủ khác nhau vẫn dựa vào khóa dòng của em trong CSDL, và nếu có lệch thì "Tính lại từ đầu" là đường khôi phục (rủi ro chấp nhận). Màn sau khi lưu có thể chưa thấy mức mới ngay; các e2e đọc trạng thái tính lại đều thăm dò (`toPass` + tải lại), không đọc một lần.
- **Mẫu báo lưu.** `useSaveStatus` (`run`, `track`, `resetKey` để đặt lại mốc khi form tự xóa sau khi lưu) + `SaveStatus` + `lib/ui/unsavedGuard.ts` (sổ các form còn thay đổi chưa lưu) + `GuardedLink` + `beforeunload`. Giờ hiển thị theo `Asia/Ho_Chi_Minh`. Ghi chú lint: `react-hooks/refs` cấm ghi ref lúc vẽ (cập nhật trong effect) và `set-state-in-effect` (đổi mốc bằng cách chỉnh state lúc vẽ).
- **Gửi form ngầm.** `lib/forms/enter.ts` (`blockImplicitSubmit`): Enter ở ô một dòng không gửi form; ô tìm của ô chọn mục kiến thức không bao giờ gửi.
- **PDF chỉ ở trình duyệt.** `pdf-lib` ghim `1.17.1`, chỉ import trong mã client (`lib/pdf/pages.ts`, `cut.ts`, `PdfPagePicker`), `updateMetadata: false` để byte sau khi cắt ổn định (cùng trang chọn → cùng hash). Giới hạn trang suy từ ngân sách token và thời gian ở một file duy nhất `lib/pdf/limits.ts`; máy chủ kiểm lại bằng `lib/storage/serverPages.ts` (đếm trang từ file đã lưu; ngoại lệ duy nhất: `pdf-lib` chạy ở máy chủ chỉ để đếm). Chữ hướng dẫn lấy số từ file đó. Âm thanh / file không đổi quy tắc: file chỉ lên máy chủ khi bấm gửi.
- **Nháp giáo trình.** "Không phải Unit" là chỉnh `payload` của nháp (không SQL); bản đã duyệt bất biến. Điền sẵn khi giao bài qua tham số URL (`lib/prefill.ts`).

### 19.17. UX vòng 2B · Giao theo Unit (13/11/2026, migration `0029`)

- **Bảng `english.assignment_units`** (chỉ thêm; khóa chính `(assignment_id, curriculum_id, unit_code)`; `version_id` = phiên bản **đã duyệt** lúc giao, FK `(version_id, unit_code) → curriculum_units`; `ord` 1–30). Mã Unit ổn định qua phiên bản (DOMAIN §4) nên "đã giao cho Unit nào" dùng được cho Lộ trình / độ phủ về sau. RLS `eng_is_staff_of`; học sinh không đọc; không ghi trực tiếp (kể cả `service_role`).
- **Mục kiến thức dẫn xuất lúc đọc**, không sao chép: `assignment_units (version_id, unit_code)` → `curriculum_unit_points`. `assignments.tag_keys` (≤ 3, `eng_create_assignment` không đổi) nghĩa là **mục thêm tay**. Engine điểm không đọc `assignments.tag_keys` nên không đổi.
- **`eng_create_assignment_v2(…, p_units jsonb)`** bọc v1 trong cùng giao dịch (mẫu `eng_write_lesson_note_v3`): kiểm quyền (như v1, `42501`) rồi, với bài MỚI, kiểm Unit (đúng em, phiên bản đang dùng = `approved`, không bỏ qua, không trùng, ≤ 30 → `22023 (bad_units)`), gọi v1 (quyền, file, ≤ 3 mục, `client_id`), rồi ghi Unit; phát lại cùng `client_id` so Unit yêu cầu với Unit ĐÃ LƯU (khác → `23505`). Mã lưu trữ chọn v1 khi không có Unit, nên mã chạy được trước khi áp 0029; có Unit mà hàm thiếu → `units_unavailable` (409) có chữ.
- **Purge:** `eng_purge_learner` / `eng_purge_preview` chép nguyên thân 0027 + `assignment_units` (xóa trước giáo trình vì có FK tới `curriculum_units`/`curricula`; khóa mới ở object `||` thứ tư).
- **Giao diện (người lớn):** `lib/curriculum/unitPicker.ts` (thuần: `toggleUnit`, `toggleReview` = V10, `autoTitle`, `derivedItems`, `stateFromCodes`), `unitChoices.ts` (dựng từ thẻ giáo trình + `payload.ignored` của phiên bản đang dùng), `UnitPicker` (đầy đủ ở Giao bài; dạng gọn `UnitTitlePicker` ở Tạo bài từ đề / Nạp bài đã làm, chỉ điền tên — V11). Chữ ở `unitPickerCopy` / `assignPage`.

### 19.18. UX vòng 3A (14/11/2026, không migration)

- **Cột trái.** `lib/shell/nav.ts`: 9 mục (`desk, profile, knowledge, roadmap, sessions, assign, results, curricula, inbox`); **Giao bài** là một mục không có trang con (làm sáng cho `/assign`, `/studio/*`, `/inquiries`); **Ghi kết quả** là nhóm (Nạp bài đã làm · Ghi điểm nhanh). `paths.ts`: mỗi luật có thể có `switchTo` (nút đổi em giữ đúng trang). Kiểu chữ phân cấp: `data-level="section|children|child"` (cấp 1 500/600, con thụt `ml-3 border-l`, 13 px, nhạt).
- **Số trên "Chờ duyệt" (U1, U2).** `GET /api/learners/[id]/pending-count` (`lib/desk/countRoute.ts`): `requireAccess(…, "work:review")` → `loadPendingRows` → `pendingView(...).count`; chỉ trả `{count}` (không tiêu đề, không id); học sinh / người ngoài 404; `no-store`. `InboxBadge` (client) đọc **sau khi trang hiện**, nhớ 30 giây mỗi em trong tab (`lib/shell/badgeMemo.ts`), đọc lại khi rời một trang duyệt hoặc đổi em; ẩn khi 0, không rõ hoặc lỗi mạng (không bao giờ hiện số sai). Khi có hàm đếm SQL (W5) chỉ thay ruột `countRoute.ts`.
- **Giao bài.** `lib/assign/ways.ts` (4 cách: `studio · link · pdf · topic`, `wayHref`, `chooserHref`); `/learners/[id]/assign` = trang chọn (`WayCards`; Studio nhấn "Nên dùng"); `?way=link|pdf` = `AssignForm fixedKind`; `?way=studio|topic` chuyển (307) sang trang đích; `way` sai = trang chọn. `WaysStrip` (dải "Cách giao", `GuardedLink`) ở 4 trang, mang theo điền sẵn. Thứ tự ô bước 2: Unit → tên → link/file → mục thêm tay → hạn. "Giao bài này →" ở Giáo trình = một liên kết tới trang chọn có điền sẵn (`ignored-give-*`).
- **Đếm buổi học (DOMAIN §5.6).** `lib/sessions/count.ts` (thuần: `currentNotes`, `sessionDays`, `months`, `stats`, `weekGrid`, `monthText`), `view.ts` (chữ, `parseMonth`), `load.ts` (**admin client sau cổng `notes:read` (trang Buổi học) / `tutorwork:read` (Bàn làm việc), cùng hai vai**, chỉ `id, session_date, supersedes_id, author_role, published, created_at` + `lesson_note_units`; test canh không đọc cột chữ). Trang `/notes`: thẻ số, lịch 12 tuần (`role="grid"`, ô có buổi = tô đậm **và** "●"), bảng tháng; trang `/notes/month/YYYY-MM` để in / sao chép (`print:hidden` cho thanh trên + cột trái, nút Sao chép / In). Bàn làm việc: một dòng tháng (`loadDesk` → `sessions`, `settle`).
- **Dọn:** bỏ `loadingCopy`.

### 19.19. UX vòng 3B · Buổi nghỉ, học bù, buổi tính phí (14/11/2026, migration `0030`)

- **Dữ liệu.** `session_absences` và `session_marks` chỉ thêm (`eng_forbid_mutation` + chặn TRUNCATE), RLS đọc `eng_is_staff_of(learner_id)`, `revoke insert/update/delete/truncate` cả với `service_role`; hàm ghi `security definer set search_path = ''` gọi từ máy chủ sau `requireAccess(…, "sessions:mark")` và **tự kiểm lại** người thao tác bằng `eng_session_actor` (= `eng_actor_may_manage`: phụ huynh của gia đình hoặc thầy/cô còn quan hệ) **trước mọi kiểm khác**; idempotent theo `client_id` (khác nội dung → 23505); mã lỗi có thẻ `(bad_date)`, `(reason_required)`… ở cuối thông báo. `eng_write_lesson_note_v4` bọc v3 (không đổi) và gọi `eng_mark_session` trong cùng giao dịch (dấu `client_id || ':kind'`). **Không có chốt tháng, không có số tiền.**
- **Luật ở một nơi (U22).** `lib/sessions/count.ts`: `effectiveKinds` (dấu mới nhất trên cả chuỗi sửa), `liveAbsences`, `sessionDays(…, marks)`, `monthBilling` (buổi tính phí = đã học + nghỉ tính phí − bù trỏ tới nghỉ tính phí), `months(…, absences)`, `weekGrid(…, absences)`, `monthText`. Chỉ ghi chú do thầy/cô ghi tạo buổi; luật không viết lại bằng SQL.
- **Đọc.** `loadSessionFacts` đọc thêm `session_marks` / `session_absences` (cột cấu trúc + lý do / ghi chú ngắn của người lớn) bằng admin client **sau cổng của trang**; lỗi đọc → `billing: false` (phần 3B tắt, 3A giữ nguyên).
- **API.** `lib/sessions/{schemas,errors,handlers,supabaseStore,route}.ts` + 3 route (`absences`, `absences/[absenceId]/cancel`, `marks`), `no-store`; id ghi chú / buổi nghỉ phải thuộc em trong URL (404 nếu không); thiếu hàm (PGRST202 / 42883) → 409 `sessions_unavailable`. Ghi buổi "Học bù" đi qua `eng_write_lesson_note_v4`; "Thường" giữ v2/v3 để chạy được trước khi áp 0030.
- **Giao diện.** `AbsenceForm`, `NoteMarkMenu` (dùng `useSaveStatus` / `SaveStatus`, chặn Enter gửi form), cột Học bù · Nghỉ · Buổi tính phí, ô lịch N / B (chữ + `aria-label`, không chỉ màu). Học sinh không có trang hay API nào (404 / 403).
- **Xóa dữ liệu.** `eng_purge_learner` / `eng_purge_preview` = nguyên bản 0029 + hai bảng, `session_marks` rồi `session_absences` trước `lesson_notes` (FK); khóa biên nhận = khóa bản xem trước (test canh).

### 19.20. W4a · Lộ trình mốc + Hành trình của con (14/11/2026, migration `0031`)

- **Dữ liệu.** `roadmap_milestones` (chỉ thêm: mỗi lần ghi = dòng mới `version`+1, `supersedes_id`; `eng_forbid_mutation` + chặn TRUNCATE; RLS đọc `eng_is_staff_of`) và `roadmap_main_curriculum` (chọn giáo trình chính, dòng mới nhất thắng). `track_settings.roadmap_goal_label` (A "Lên B1", B "Lên C1") là dữ liệu cấu hình, không `if track`.
- **Hàm SQL** (`security definer`, `search_path = ''`): `eng_roadmap_write` / `eng_roadmap_set_main` (chỉ thầy/cô của em, 42501 `tutor_only`; khóa dòng em `for update`; idempotent theo `client_id`, payload khác = `client_id_reused`; bỏ cần lý do; một đỉnh đã xác nhận mỗi em); `eng_roadmap` (người lớn, `service_role`); `eng_my_roadmap()` (con, chỉ `authenticated`, nhận diện bằng `auth.uid()`, chỉ trả tên mốc, tháng, Unit và trạng thái — không điểm, mức, nhãn kỹ năng). `eng_roadmap_main_id` và `pickMainCurriculum` (TS) cùng một luật; test DB so hai bên.
- **Luật thuần TS** (`lib/roadmap/*`, `lib/journey/*`): `childVersion` / `buildCards` / `buildProposals` (khóa `pt:` / `goal:` / `track:`; đề xuất không lưu cho tới khi thầy/cô bấm) / `buildJourney` (nút, người leo, tóm tắt, đỉnh).
- **Giao diện.** Thầy/cô: `/learners/[id]/roadmap` (hành động `roadmap:read` / `roadmap:write`; phụ huynh chỉ xem), một dòng "Chờ xác nhận" ở Hộp duyệt, một dòng ở Bàn làm việc, cảnh báo mốc mồ côi. Con: `/journey` (tab thứ ba "Hành trình"): núi SVG tĩnh, mỗi chấm là nút 44px có tên + trạng thái bằng chữ, danh sách thay thế cho đọc màn hình; đỉnh chưa xác nhận = "Đỉnh của bạn — {thầy/cô} sẽ đặt tên".
- **Dải xem trước** (`components/roadmap/PathStrip.tsx`, luật thuần `lib/roadmap/strip.ts`): Unit của giáo trình chính theo trạng thái, cờ ở Unit (đã xác nhận = nét liền, nháp = nét đứt), đỉnh ở cuối; chỉ xem, sửa ở trang Giáo trình.
- **Mã ghi (`client_id`).** `lib/roadmap/clientId.ts`: giữ mã khi lỗi mạng / 5xx, đổi khi thành công, 4xx rõ ràng hoặc nội dung đổi.
- **Xóa dữ liệu.** `eng_purge_learner` / `eng_purge_preview` = nguyên bản 0030 + hai bảng, xóa trước `curricula`.

### 19.21. W4b · Bàn học của con: Hôm nay · Đã xem · Đã làm (15/11/2026, migration `0032`)

- **Dữ liệu.** Chỉ hàm đọc (không bảng, không purge): `eng_my_today()`, `eng_my_today_count()`, `eng_my_history(p_before, p_before_ref, p_limit)`, `eng_my_seen(p_before, p_before_ref, p_limit)` (con trỏ keyset `(thời điểm, mã)`; `history` trả thêm `total` / `waiting` của cả em) (`security definer`, `search_path = ''`, chỉ `authenticated`, nhận diện bằng `auth.uid()`; `p_limit` 1..50). Hàm nội bộ `eng_student_done(learner)` gộp lần nộp trên app (`attempts`, không mẫu `imported`) + bài nộp link / PDF hiện hành (bản bị thay không hiện riêng; bài giao đã rút mà con đã gửi vẫn hiện, cờ `retracted`; bài rút chưa gửi không là việc) và tính `seen_at` = lúc người lớn làm gì đó **đầu tiên** trên đúng bài đó: góp ý S6 (kể cả "Chỉ góp ý", nhận xét kết), Đúng/Sai cho câu "cần xem" (`item_decisions`), kết quả đã ghi cho bài giao link / PDF sau lúc con nộp, quyết định duyệt S5 trên episode (`validation_decisions`), đánh giá bài sửa. Tự chấm của app **không** là "đã xem".
- **Không trả:** điểm, đúng/sai, %, đáp án, giải thích, nhãn kỹ năng, quan sát / quyết định, ai duyệt (test DB quét tên khóa). Số trả về là việc của chính con: số việc, `items_filled` / `items_total` (câu **đã trả lời** trong nháp, chỉ khóa có trong đề của bước).
- **Luật thuần TS** (`lib/student/*`): `sortTasks` (bài sửa → có nháp, nháp mới nhất trước → hạn sớm → ngày mở → tên), `pickContinue` ("Làm tiếp" nếu có nháp, không thì việc mở được đầu tiên), `summarize` ("còn n việc · khoảng m phút": phút chỉ cộng phần đã biết), `filterHistory`, `seenMemo` (dấu "Mới" theo `localStorage`, khóa theo mã em; máy chưa mở lần nào chỉ tính 14 ngày gần nhất). Không "quá hạn" cho con (D4).
- **Giao diện.** `components/student/desk/*`: `StudentDeskShell` (AppHeader tài khoản + `StudentTabs`: thanh dưới / cột trái từ `md`; không dùng `components/shell/*`), `TodayView` · `ContinueCard` · `TaskList` (thẻ link / PDF cũ `PracticeCard` nằm dưới danh sách, neo `#task-…`), `SeenList` (client: nhớ lần mở khi rời trang), `HistoryList` (client: lọc). Trang: `/` (nhánh học sinh), `/seen`, `/done`, `/done/[ref]`, `/journey`; `/practice` chỉ `redirect("/")`. Số đếm của con nằm trong `data-count="work"`; ngày là `<time>`.
- **Study Launcher (PRD D37).** `eng_my_today_count()` (số việc làm được trên app; NULL nếu không phải học sinh) là con số duy nhất English OS cho Launcher đọc (cùng project Supabase, phiên của con); không dữ liệu khác, không ghi vào `public`. Hai app khác tên miền nên con đăng nhập riêng từng app. Phần hiển thị ở repo Launcher.
- **Chưa áp 0032:** các trang `/`, `/seen`, `/done` của con hiện một dòng "Bàn học chưa mở được"; Hành trình và làm bài (`/activities/[id]`) không phụ thuộc.

### 19.22. W4c1 · Nộp bài giấy, bài link và góp ý bài nộp (15/11/2026, migration `0033`)

- **Dữ liệu.** `submissions.file_ids` tối đa 12 (`submissions_file_ids_max12`, thay ràng buộc ≤ 6 tìm theo danh mục). Bảng chỉ thêm `submission_feedback` (id, learner_id, submission_id, assignment_id, praise ≤ 400, items jsonb `[{n,text}]` ≤ 3, supersedes_id, author_member, author_role tutor/parent, client_id, created_at; unique (learner_id, client_id); một góp ý đầu cho mỗi bài nộp; một góp ý chỉ bị thay một lần); `eng_forbid_mutation` + chặn TRUNCATE; RLS đọc qua `eng_is_staff_of`; service_role không ghi trực tiếp.
- **Hàm.** `eng_submit_practice_v2(assignment, by, client_id, attempt, used_hint, link_url, files)` (service_role; kiểm lại người nộp; học sinh phải có `used_hint`, người lớn được null; chạy lại cùng `client_id` so thứ tự `file_ids`, khác thứ tự → 23505; học sinh bị chặn `already_reviewed` nếu đã có kết quả hoặc góp ý). `eng_write_submission_feedback` (kiểm vai trò 42501, hình dạng, từ chấm điểm `eng_has_score_words`, bài nộp phải là bài hiện hành, chỉ thay góp ý của chính mình; ghi `audit_log`; đánh số lại 1..k). `eng_submission_feedback(learner, assignment)` đọc cho người lớn. Thay `eng_student_done`, `eng_my_seen` (thêm khen / điều cần sửa, `fb_state = 'note'`), `eng_my_practice`, `eng_purge_learner` / `eng_purge_preview` (xóa `submission_feedback` trước `submissions`).
- **Luật thuần TS** (không DOM, có test): `lib/practice/pageOrder.ts` (MAX_PAGES = 12, `movePage`, `removePage`, `rotatePage`, `addPages`, `arrangement`), `twoQuestions.ts` (`missingParts`, `canSend`, `answersToSend`), `image.ts` (`paperTargetSize`, `renderPaperImage`: xoay bội 90°, cạnh dài ≤ 2400, JPEG 0.85; `preparePaperFile`).
- **Giao diện.** Trang con `app/submit/[assignmentId]/page.tsx`; `components/student/submit/*` (`PaperSubmit`, `LinkSubmit`, `PageGrid`, `TwoQuestions`, `MissingRow`, `SubmitShell`, hook `usePages` / `useSendWork`). Gửi lại dùng cùng `client_id` và không tải lại file đã lên (`UploadCache`). `PracticeSubmitArea` chỉ còn lối vào `/submit`. Người lớn: `SubmissionFeedbackForm` trong dòng mở của `AssignmentTable` (xem trang theo thứ tự con sắp).
- **API.** `POST /api/learners/[id]/assignments/[aid]/submissions/[sid]/feedback` (`practice:write`); lỗi `pages_unavailable` → 409.
- **Thứ tự triển khai.** Mã app chạy được cả khi chưa áp 0033 (lùi về hàm v1; bộ đọc góp ý chấp nhận hàm thiếu PGRST202 / 42883). Nên áp 0033 ngay sau gộp.
- **Riêng tư tệp (người lớn và con):** ảnh được vẽ lại bằng canvas (mất GPS / máy ảnh / giờ chụp), PDF qua `scrubPdf` (`lib/pdf/cut.ts`) được dựng lại thành tài liệu mới chỉ có các trang chép sang (không Info, không XMP, không ngày, không đối tượng mồ côi). Rủi ro còn lại: /Metadata ở mức trang và ảnh nhúng TRONG PDF giữ siêu dữ liệu riêng, chữ ký số mất; phiếu điểm bên ngoài giữ PDF nguyên bản. Máy chủ không đọc byte đầu để từ chối Exif (`FileStorage` chỉ có `stat`); e2e tải lại tệp đã lưu để chắc chắn.
- **"Mới":** `eng_my_seen` trả `fb_at`; dấu "Mới" theo `max(seen_at, fb_at)`, thứ tự theo `seen_at`. Góp ý ghép với bài nộp qua `submission_id`.
- **Khóa:** nộp bài và góp ý của một em cùng khóa dòng `learners` (`for no key update`).
- **Giới hạn trang:** `eng_practice_limits()` (chỉ đọc) cho màn nộp biết 12 hay 6 (chưa áp 0033).
- **Trần tải lên:** 60 đường tải lên / em / ngày (một trang = một đường).
- **Chưa kiểm trên máy thật:** camera iPad, HEIC, bộ nhớ khi 12 trang.

### 19.23. W4c2 · Làm bài từng câu, màn sau khi nộp (S-10), thử lại một câu, cờ "Bài kiểm tra" (15/11/2026, migration `0034`)

- **Dữ liệu.** Bốn bảng chỉ thêm (`work_test_marks`, `item_retries`, `item_reveals` (D39), `retry_seen`; `eng_forbid_mutation` + chặn TRUNCATE, RLS đọc qua `eng_is_staff_of`, học sinh không SELECT, service_role không ghi trực tiếp): `work_test_marks` (activity_id **hoặc** assignment_id, `is_test`, by_member / by_role, client_id; dòng mới nhất thắng; một bảng cho cả bài trên app lẫn link / PDF) và `item_retries` (attempt_id, activity_id, item_id, answer ≤ 2000, client_id; `unique (attempt_id, item_id)`); `item_reveals` (một dòng mỗi lần làm + câu); `retry_seen` (attempt_id, note ≤ 300 chỉ người lớn thấy, `seen_through` = lần thử lại mới nhất thẻ đã hiện, seen_by / seen_role, client_id). **Chốt làm lại (D39):** trigger `attempts_no_redo_after_reveal` trên `attempts` từ chối lần làm mới (`in_app` / `pasted`) của bài luyện Studio đã có `item_retries` / `item_reveals` (`answers_shown`, 23514; khóa dòng lần làm mới nhất cùng với thử lại / xem đáp án để không thắng cùng lúc); không đổi `eng_submit_attempt`. `item_id` không bắt buộc dạng `q<n>` (bài chủ đề có id riêng): hàm kiểm câu có thuộc bước (`bad_item`).
- **Hàm của người lớn (service_role):** `eng_set_test_mark` (kiểm người thao tác trước; `(already_started)` nếu em đã nộp), `eng_assign_studio_v2` (bọc v1 + cờ, cùng giao dịch), `eng_create_assignment_v3` (bọc v2 + cờ), `eng_item_retries(learner)` (đọc), `eng_retry_pending(p_by, p_allow_real)` (đọc cho Chờ duyệt và màn "Cần thầy/cô xem": lần thử lại mà **chưa có việc nào của người lớn muộn hơn** trên lần làm đó). **Của con (authenticated, `auth.uid()`):** `eng_my_result_view`, `eng_my_retry_item` (`test_no_retry`, `not_sent`, `bad_item`, `bad_answer`, `not_retryable`, `already_retried`, phát lại theo `client_id`), `eng_my_test_marks`. `eng_my_studio_review` bị **thu quyền khỏi mọi vai** (Q3); thân giữ nguyên.
- **Luật.** `eng_work_is_test` = bước `INDEPENDENT_CHECK` **hoặc** cờ mới nhất = true. Cờ **không** đổi `mode` / bằng chứng (test: inputs của `eng_engine_inputs` / `eng_point_inputs` không đổi trước / sau lần thử lại; mode của bài có cờ vẫn `PRACTICE`). Màn kết quả: JSON chỉ có `look` / `open` / `others_fine` / `is_test` (test quét khóa; TS đọc bằng `z.strictObject`: thêm khóa lạ → coi như không có).
- **TS.** `lib/student/player.ts` (thuần: đi câu, mở đúng câu, "đã trả lời", gộp tự lưu), `lib/student/result.ts`; `components/student/player/*` (Player, QuestionCard, QuestionDots, AskTutorSlot, ResultView, RetryBox); `app/activities/[id]/page.tsx` dùng `StudentDeskShell` + Player cho bước có câu hỏi (bước viết vẫn `WorkForm`; bài sửa S6 vẫn `RevisionForm`). Routes: `GET .../activities/[id]/result`, `POST .../activities/[id]/retry`; **bỏ** `.../studio-review`, `StudioReview.tsx`, `studioStudentCopy`.
- **Thứ tự triển khai.** Mã chạy khi chưa áp 0034: giao bài không cờ vẫn gọi hàm cũ; có cờ → báo "chưa sẵn sàng (cần migration 0034)"; màn kết quả lùi về biên nhận trơn; `eng_my_test_marks` thiếu → không bài nào là bài kiểm tra.
- **Người lớn thấy lần thử lại (phụ huynh quyết 15/11: bấm "Đã xem").** Bảng chỉ thêm `retry_seen` (attempt_id, ghi chú ≤ 300 không chữ kiểu điểm, người bấm / vai, client_id; RLS đọc qua `eng_is_staff_of`; học sinh không SELECT), ghi qua `eng_mark_retry_seen(attempt, note, by, client_id)` (service_role; cùng người được chấm câu Studio: phụ huynh của gia đình / gia sư còn hiệu lực của em; em khác hoặc học sinh → 42501; gửi lại cùng `client_id` = cùng biên nhận, khác nội dung → 23505; lần làm không có lần thử lại → `no_retry`). `/review/studio` có mục "Con thử lại" (câu hỏi, "Lần đầu", "Thử lại", ô ghi chú, nút "Đã xem"); Chờ duyệt có dòng "Thử lại · Con thử lại n câu" (nhóm "Cần xem câu"). **Một luật duy nhất:** `eng_retry_pending` giữ một lần thử lại cho tới khi có dòng `retry_seen` của đúng lần làm đó tạo SAU nó; góp ý, chấm câu, duyệt **không** làm hết chờ. Lần thử lại tạo sau "Đã xem" (câu khác, hay lần làm mới) chờ lại. `eng_item_retries` kèm `seen` (giờ + ghi chú). **Ghi chú chỉ người lớn thấy** (con không thấy; muốn nhắn con thì dùng góp ý bài). Xóa dữ liệu một em gồm `retry_seen`.
- **Cách xử lý khi gửi lại / lỗi.** Gửi lại cùng `client_id` mà khác loại bài (có / không cờ) → `23505 client_id_reused` (Studio v2 và link v3 giống nhau); `eng_set_test_mark` kiểm vai người thao tác trước khi tìm bài và trả `42501` cả khi không thấy bài (không lộ bài có tồn tại); `eng_my_test_marks` chỉ liệt kê bước đã mở. Làm bài: lưu khi rời ô nhập, khi bấm Thoát (chờ lưu xong), khi ẩn trang (`keepalive`); sau khi bấm Nộp không còn lưu nháp nào.
- **D39 · đáp án sau lần thử lại (15/11, cùng migration 0034).** `eng_my_result_view` trả thêm `marks` **chỉ khi** bài là LUYỆN TẬP của mẫu `studio` (không cờ, không `INDEPENDENT_CHECK`; bài chủ đề tuần và bài kiểm tra: không có khóa `marks`, test quét). Mỗi câu: `mark` (`right` / `wrong` / `waiting`), `retry {text, mark}` (so với đáp án bằng `eng_compute_auto_checks`; câu app không so được = `waiting`), `revealed`, `can_retry`, `can_reveal`, và `answer` + `why` **chỉ khi** câu đã thử lại hoặc đã "Xem đáp án" (câu `right`: chỉ `why`); không bao giờ tổng / số đếm. Hàm của con `eng_my_reveal_item(activity, item, client_id)` (`not_revealable` cho bài kiểm tra / không phải Studio, `already_retried`, `not_retryable`, `bad_item`, `not_sent`; gửi lại = cùng biên nhận); `eng_my_retry_item` từ chối câu đã xem đáp án (`already_revealed`). Bảng chỉ thêm `item_reveals` (`unique (attempt_id, item_id)`), engine không đọc (test: `eng_engine_inputs` / `eng_point_inputs` không đổi). `eng_retry_pending` / thẻ "Con thử lại" gồm cả câu `revealed` (`kind`). TS: `ResultMark` đọc bằng `z.strictObject`; một bài kiểm tra mà có `marks` thì cả phản hồi bị bỏ. Người lớn: màn bài làm (`WorkItems`) viền + chip xanh = đúng, đỏ = sai, cam = chờ thầy/cô xem (màu **và** chữ), câu sai / chờ lên đầu (số câu vẫn hiện), bộ lọc "Tất cả / Chỉ câu sai và cần xem"; màn chấm câu Studio cùng màu (cam → xanh / đỏ khi chọn Đúng / Sai).

### 19.24. W4d · Mục tiêu tuần, chuỗi tuần mềm, thành tích v1 (15/11/2026, migration `0035`)

- **Dữ liệu.** Một bảng chỉ thêm `weekly_goals` (`eng_forbid_mutation` + chặn TRUNCATE; RLS đọc qua `eng_is_staff_of`; học sinh không SELECT; service_role không ghi trực tiếp): `kind` = `propose` / `accept` / `adjust` / `withdraw`, `pieces` 1–14, `applies_from` (luôn thứ Hai; **do hàm đặt** = thứ Hai của tuần hiện tại + 7, giờ Việt Nam — client không gửi được), `responds_to` (chỉ mục duy nhất: mỗi đề xuất được trả lời đúng một lần), `client_id` (`unique (learner_id, client_id)`). Ràng buộc `weekly_goals_shape` ép hình theo `kind` (đề xuất chỉ do học sinh, đồng ý / điều chỉnh chỉ do thầy/cô). `track_settings.weekly_goal_range`: A `{2,5}`, B `{3,6}` (dữ liệu theo track, không rẽ nhánh trong mã). Không bảng phút làm bài (Q5 = i).
- **Hàm.** Của con (authenticated, nhận diện bằng `auth.uid()`; khóa `for no key update` trên dòng em để hai lần bấm không tạo hai đề xuất): `eng_my_propose_goal(pieces, client_id)` (`out_of_range`, `pending_exists`), `eng_my_withdraw_goal(goal, client_id)` (`bad_ref`). Của thầy/cô (service_role sau `requireAccess("goals:decide")`): `eng_decide_goal(goal, action, pieces, by, client_id, learner)` — **chỉ thầy/cô của em** (phụ huynh `42501 tutor_only`, Q19), `learner` bắt buộc khớp em của đề xuất (không quyết hộ em khác). Đọc: `eng_my_week()` (con) và `eng_week_facts(learner)` (người lớn, cùng hình); trả **dữ kiện**, không trả kết luận: sổ mục tiêu, các cặp (việc, tuần) đã nộp, giờ nộp đầu, các lần nộp đầu bước viết, giờ xong bài chủ đề đầu, bài sửa đầu, sự kiện Unit của giáo trình chính. Mọi hàm ghi idempotent theo `client_id` (khác nội dung → `23505 client_id_reused`).
- **Cái gì được tính (Q6).** `eng_week_work`: lần nộp trên app (`in_app` / `pasted`) của bài chủ đề và Studio, và lần nộp bài giao link / PDF **do chính con** (`submitted_by_role = 'student'`) hoặc ảnh / PDF người lớn nộp thay. Không tính: bài ghi trong buổi (`tutor_live`), bài nạp, lần thử lại câu, lượt mở app. Một việc chỉ tính một lần mỗi tuần.
- **Luật chỉ ở TypeScript** (`lib/student/{week,goal,streak,achievements,weekView}.ts`, thuần, đồng hồ duy nhất là `facts.now`; test từng ví dụ ở kế hoạch §3.6, §3.7). Tuần bắt đầu thứ Hai 00:00 giờ Việt Nam (= Chủ nhật 17:00 UTC). Mục tiêu hiệu lực của một tuần = quyết định gần nhất có `applies_from` ≤ thứ Hai của tuần đó. **Chuỗi** = số tuần đã qua liên tiếp (tính lùi từ tuần trước tuần đang chạy, tối đa 52) mà số việc ≥ mục tiêu; tuần đang chạy **cộng thêm 1 chỉ khi đã đạt, không bao giờ làm đứt**; tuần đã qua chưa có mục tiêu hoặc chưa đủ việc thì chuỗi về 0. **Thành tích** (không bảng, dẫn xuất): bài đầu, xong n Unit (2, 4, 8, 12, 16…) và xong cả giáo trình, chuỗi 4 / 8 / 12, 10 / 20 tuần đạt, 10 / 25 bài viết, bài chủ đề đầu, bài sửa đầu, mốc lộ trình; ngày đạt = đầu của đoạn đúng liên tục gần nhất (dựng lại bằng cách phát lại sự kiện Unit, nên Unit bị đặt lại thì thành tích mất và có ngày mới). Chưa có `cando_n` (W4e).
- **Màn.** Con: chip "🔥 n tuần liền" + thẻ tuần ở Hôm nay (`/`); `/journey` thêm thẻ "Mục tiêu tuần" và "Bộ sưu tập thành tích"; trang `/goal` (chọn trong khoảng, câu gợi ý từ tối đa 4 tuần gần đây, "Chờ thầy/cô đồng ý" + "Rút lại", "đã đồng ý · từ tuần sau"). Số đếm chỉ nằm trong `data-count="work"`, ngày trong `<time>`. Người lớn: hộp "Mục tiêu tuần" ở Bàn làm việc (`GoalBox`; thầy/cô có Đồng ý n bài / Điều chỉnh, phụ huynh chỉ xem) và một dòng "goal" (nhóm Lộ trình) ở Chờ duyệt; phụ huynh thấy dòng ấy là "chờ thầy/cô".
- **"Tuần làm bài" (bổ sung 15/11).** Bảng phụ chỉ thêm `submission_work_weeks(submission_id pk → submissions, learner_id, work_week date thứ Hai, by_member)` (không sửa bảng đã áp); `eng_submit_practice_v3` bọc `eng_submit_practice_v2` (cùng giao dịch) và, với "last", kiểm trong SQL: người nộp là người lớn, bài giao là PDF, lúc nộp là thứ Hai–thứ Ba giờ Việt Nam (`eng_work_week_choice(giờ, lựa chọn)` nhận giờ làm tham số để test ranh giới) → ghi tuần = thứ Hai tuần trước. `eng_week_work` lấy Chủ nhật 12:00 của tuần đó thay cho giờ nộp và thêm cột `own` (bài con tự nộp); `first_work_at` chỉ tính `own`. **Một bài giao link / PDF chỉ một tuần:** `eng_week_work` phát MỘT dòng `s:<bài giao>` mỗi bài, ở giờ SỚM NHẤT trong chuỗi nộp (giờ nộp, hoặc Chủ nhật 12:00 của "Tuần làm bài"); nộp lại không tạo tuần thứ hai. Bài chủ đề trên app giữ luật §3.6 (mỗi lần nộp tính ở tuần của nó). `first_work_at` đọc riêng từ bài con tự nộp (lần nộp trên app + bài nộp vai học sinh). Server luôn gọi v3 khi có (kiểm lựa chọn tuần khi gửi lại cả hai chiều); chưa áp 0035 → hàm v2 như cũ, riêng "Tuần trước" báo chưa dùng được. Xóa dữ liệu một em = bản 0034 + **hai bảng** (`weekly_goals`, `submission_work_weeks`). Chờ duyệt: dòng mục tiêu ở nhóm riêng "Mục tiêu tuần".
- **Thứ tự triển khai.** Mã chạy khi chưa áp 0035: màn của con không có chip / thẻ / `/goal` báo "chưa mở"; hộp ở Bàn làm việc ẩn; **đếm Chờ duyệt vẫn là số biết** (thiếu hàm = `unavailable`, không phải lỗi); lỗi thật thì nguồn "goals" được ghi là không tải được.
- **Seed thử.** `npm run db:seed-dev -- --goal-history`: 5 tuần × 3 bài + mục tiêu 3 bài/tuần cho Nguyên (thử) (chỉ em `is_test`) để thấy chip "🔥 5 tuần liền".
- **Xóa dữ liệu một em** gồm `weekly_goals` (thân `eng_purge_learner` / `eng_purge_preview` = bản 0034 + một bảng; có test so từng dòng).

### 19.25. W4e · Cấp theo mảng, "Những điều mình đã làm được", "Ngày ấy – bây giờ" (16/11/2026, migration `0036`)

- **Đổi luật (PRD D36 b, c; DOMAIN 0.8).** Con thấy **tên** cấp CEFR theo mảng và **tên** điều đã tự làm được, chỉ khi thầy/cô đã xác nhận; đảo P2-d của SM-2. Con vẫn không nhận điểm, mức / bậc dạng số, ⚑, đề xuất, bằng chứng. Bài kiểm tra `tests/e2e/student-no-scores.spec.ts` được sửa theo (cấp đã xác nhận được phép ở thẻ cấp của Hành trình; **không** ở trang chủ; không cấp giả định, không "Tư duy", không số 1–4).
- **Dữ liệu.** Một bảng chỉ thêm `then_now_picks` (`eng_forbid_mutation` + chặn TRUNCATE, RLS đọc qua `eng_is_staff_of`, học sinh không SELECT, service_role không ghi trực tiếp): hai khóa ngoại tới `attempts`, `note` ≤ 200 ký tự **không chữ dạng điểm** (CHECK `eng_has_score_words`), `status` `shown` / `hidden`, `by_role = 'tutor'`; dòng mới nhất của em thắng. Không đổi bảng nào đã áp.
- **Hàm.** Ghi: `eng_pick_then_now(learner, then, now, note, status, by, client_id)` (service_role sau `requireAccess("teaching:write")`): người ghi phải là **thầy/cô của em** (kiểm trước mọi thứ khác; phụ huynh / thầy cô em kia / học sinh → `42501 tutor_only`); idempotent theo `client_id` (khác nội dung → `23505 client_id_reused`); hai lần nộp qua `eng_pickable_write` = của đúng em, bước `ACT-WRITE` không phải bài sửa, `provenance` `in_app` / `pasted` (cả hai vai) hoặc `manual_import` **chỉ làm "ngày ấy"**, chỉ khi lần ghi chữ đầu do thầy/cô (`members.role = 'tutor'`) gõ và không có chữ dạng điểm (`eng_pickable_write(learner, attempt, role)`; hàm đọc của con kiểm lại cùng luật), không bài sửa (`mode`/`revises_attempt_id`), **không** `tutor_live`, **không** `imported`, có chữ ở lần ghi chữ đầu (`eng_attempt_text`); khác nhau; "ngày ấy" nộp trước "bây giờ" ít nhất một ngày giờ Việt Nam (`bad_pick`); lời nhắn: `too_long`, `score_words`. Đọc của người lớn: `eng_then_now_candidates(learner)` (service_role; 20 bài cũ nhất + 40 bài mới nhất + cặp đang chọn, bỏ trùng; có `provenance`). Đọc của con (authenticated, `auth.uid()`, chỉ chữ + tên + ngày): `eng_my_levels()` (chỉ mảng CEFR — Tư duy không bao giờ có mặt; `level` = `to_level` của dòng `level_decisions` mới nhất, **null** nếu chưa xác nhận: cấp giả định không gửi), `eng_my_cando()` (trả `items` + `ever` = lúc lần đầu đủ món thứ 5 / 10 / 20 cho thành tích; kỹ năng `competency_state` ở `INDEPENDENT` / `TRANSFERABLE` mà `state_decision_id` trỏ tới dòng `CONFIRMED` cùng bậc; mục kiến thức `point_state` cùng luật; tên từ `targets.title_vi` / `error_tags.label_vi`; `code` chỉ là mã kỹ năng cho máy tìm tên Track A, không hiện ra màn), `eng_my_then_now()` (cặp mới nhất `shown`, chữ gốc + ngày + lời nhắn; ẩn / chưa có → null).
- **Luật dẫn xuất ở TypeScript** (thuần, có test): `lib/student/levels.ts` (ô theo thang, chỉ tên CEFR hợp lệ, ngày), `cando.ts` (tên cho học sinh, "Mới" 7 ngày theo đồng hồ máy chủ, bỏ trùng chữ), `thenNow.ts` (lời nhắn, thứ tự), `achievements.ts` (+ `cando_n` 5 / 10 / 20, ngày = lúc xác nhận của thẻ thứ n), `growthShape.ts` (zod **strict**: một khóa lạ như `score` hay `level_num` là lỗi, không bao giờ hiện cho con). **Lệch kế hoạch:** luật "chỉ tính dòng xác nhận mới nhất, AUTO 1–2 không tính" nằm ở SQL (hàm của con không được trả trạng thái / loại quyết định), TypeScript chỉ lo tên, ngày, "Mới", bỏ trùng.
- **Màn.** Con: `/journey` thêm thẻ "Cấp hiện tại theo mảng" (cột phải, dưới "Mục tiêu tuần"), "Những điều mình đã làm được", "Bộ sưu tập thành tích" (thêm ✋), "Ngày ấy – bây giờ" (chỉ khi có cặp đang hiện). Người lớn: khối "Ngày ấy – bây giờ" ở Hồ sơ cấp (`/learners/[id]/levels`, `ThenNowPicker`): thầy/cô chọn 2 bài + lời nhắn + "Ẩn thẻ với em"; phụ huynh xem. Route `POST /api/learners/[id]/then-now` (`lib/thennow/*`).
- **Thứ tự triển khai.** Mã chạy khi chưa áp 0036: ba hàm của con không có → thẻ ẩn (không lỗi); khối ở Hồ sơ cấp báo "chưa mở"; route trả 409 `thennow_unavailable`, không 500. Lỗi thật khi tải khối của người lớn: báo "chưa tải được", trang vẫn lên.
- **Xóa dữ liệu một em** gồm `then_now_picks` (xóa trước `attempts`; thân `eng_purge_learner` / `eng_purge_preview` = bản 0035 + một bảng; có test so từng dòng).

### 19.26. Nhập bài soạn sẵn (.json) + "Đã xem ✓" (16/11/2026, không migration, không AI)

- **Mục đích.** Đề được soạn **ngoài app** (không tốn API của app), ví dụ sách Destination C1&C2, rồi nạp thành **bản nháp Studio** bình thường. Thầy/cô soát, sửa, bấm Duyệt rồi Giao ở "Duyệt đề" như bài AI đọc. Khuôn file: `docs/STUDIO_IMPORT_FORMAT.md` (`lib/studio/importFile.ts`).
- **Đường đi.** Thẻ "Nhập bài soạn sẵn" ở `/studio/new` (`components/studio/ImportForm.tsx`): chọn nhiều file .json; trình duyệt đọc (≤ 1 MB), `JSON.parse`, gửi **từng file một** tới `POST /api/learners/[id]/studio/imports` → `handleImportDraft` (`lib/studio/handlers.ts`).
- **Thứ tự trong handler.**
  1. `requireAccess("studio:write")`.
  2. Body `{ file }`.
  3. `studioImportFileSchema` (vỏ + `studioDraftSchema` strict; sai → `import_bad_file`).
  4. Track của file = track của em (khác → `import_wrong_track`).
  5. `validateDraft` với nhãn của em: **chỉ báo** số lỗi chặn, không từ chối (thầy/cô sửa ở Duyệt đề).
  6. `eng_create_studio_draft(p_extract=false)` với `client_id = imp-<sha256(file)[0..32]>`.
  7. Đọc bản nháp; nếu còn trống thì `eng_save_studio_draft` với `updated_at` của chính nó.
- **Lặp lại an toàn.**
  - Nhập lại cùng nội dung → cùng bản nháp ("Đã nhập trước đó").
  - Lần trước dừng giữa "tạo" và "lưu" (bản nháp trống **và chưa từng được lưu**: `updated_at` cách `created_at` < 1 giây) → lần sau lưu nốt. Bản nháp thầy/cô đã cố ý xóa hết câu thì không bị điền lại.
  - Hai lần nhập cùng file cùng lúc: lần lưu thua (`draft_changed`) đọc lại và trả bản nháp lần kia đã điền.
  - Bản nháp đó đã bị bỏ → tạo bản mới với `client_id` có số (`-2` … `-9`; quá 9 → `import_too_many`).
  - Bản nháp đã đổi tên (hàm 0024 báo trùng `client_id` khác tên) → đọc trạng thái theo `client_id` (`StudioStore.draftByClientId`, chỉ đọc): đã bị bỏ thì thử số kế tiếp, còn dùng thì `import_renamed` (kèm `id`).
- **Không** gọi cổng AI, không ghi `ai_runs`, không chạy việc nền; không bảng / hàm SQL mới.
- **"Đã xem ✓"** (`ItemCard`): câu có cờ "Cần xem" có nút xóa cờ (`needs_review=false`, `review_reason=null`). Chỉ sửa nội dung bản nháp và được lưu khi bấm Lưu nháp hoặc Duyệt. Bộ lọc "Chỉ câu cần xem" bỏ câu đó.
- **Bài đọc ↔ câu (16/11, sau PR #43).** Thẻ bài đọc ở Duyệt đề ghi các câu dùng nó (`lib/studio/passageUse.ts`, "Dùng cho câu 1–10"; chưa có câu nào thì nhắc). Câu có `passage_ref` mang nhãn "📖 Bài đọc P1". Chỉ hiển thị, không đổi dữ liệu. Màn của con vẫn hiện mọi bài đọc ở đầu bài (nguồn của bước, 0024).
- **Giới hạn đã biết.** Bài Studio đã giao **chưa tính vào độ phủ Giáo trình** (cần SQL, để sau). Câu `gap` / `word_form` tự chấm theo đáp án + `accepted`, nên đáp án sai sẽ chấm sai cho con: thầy/cô soát kỹ trước khi Duyệt.

### 19.27. Duyệt đề: xóa phần, tự đánh số lại, bỏ nháp có hỏi lại, lỗi chặn Duyệt ghi rõ (21/11/2026, không migration, không AI)

- **Vì sao.** 20/11 thầy/cô của Nguyên muốn giữ 2 trong 4 bài của "Word formation (M–P)": không có nút xóa phần; xóa từng câu làm số câu hụt (`numbering`) nên Duyệt bị chặn; bản nháp sau đó mất (nhiều khả năng do "Bỏ bản nháp", một cú bấm, nằm cạnh Duyệt). Tái hiện trên database cục bộ bằng đúng file đó: giữ M + N thì duyệt được; giữ O + P hoặc M + O thì bị chặn, ép duyệt thì database từ chối khung đề ("a range outside 1..total_items").
- **`lib/studio/editOps.ts`** (thuần, không đổi đầu vào): `renumber` (thứ tự phần = theo **số câu hiện có** của phần, để đề có danh sách phần lệch thứ tự vẫn giữ số của bản giấy; phần chưa có câu đứng ngay sau phần liệt kê trước nó; trong phần: số cũ, rồi vị trí cũ; số mới 1..N), `removeItem`, `removePart`, `addItem` (cuối phần của nó), `addPart` (chữ cái trống đầu tiên), `moveToPart` (cuối phần mới), `numberingBroken` (chỉ đúng khi đánh số lại sẽ **đổi số** của một câu nào đó).
- **Màn Duyệt đề** (`DraftEditor`, `ItemCard`):
  - Mỗi phần có **"Xóa phần"** (`window.confirm`, ghi mã phần và số câu).
  - Mọi thao tác cấu trúc đi qua `editOps`, nên số câu luôn 1..N. Bản nháp tới với số hỏng có nút **"Đánh số lại"**.
  - Ô "Số câu" bị bỏ (đổi `key` của React theo từng phím gõ; khi trùng số thì một lần sửa ghi vào hai câu). Mọi sửa đổi tìm câu theo **chính đối tượng**, không theo số.
  - **"Bỏ bản nháp"** hỏi lại, nằm riêng ở cuối, sau một đường kẻ.
  - Khi Duyệt bị chặn: hộp đỏ dưới nút liệt kê từng lỗi ("Câu 12: Thiếu đáp án", 8 dòng đầu + "và n lỗi khác"); bấm thì cuộn tới câu.
- **Không đổi:** đề đã duyệt (bất biến; "Sửa đề đã duyệt" vẫn tạo bản nháp + phiên bản mẫu mới), máy chủ, database, màn của con. Bài đọc của phần đã xóa vẫn nằm trong bản nháp nhưng không gửi cho con (`buildStudioBuild` chỉ lấy bài đọc có câu dùng).
- **Chưa có:** đổi thứ tự câu trong một phần; xem lại / khôi phục bản nháp đã bỏ.

### 19.28. Luồng giao bài Studio sau bản rà 21/11 (không migration, không AI)

- **Lời dẫn theo câu.** `buildStudioBuild` ghi `prompt_en` mỗi phần một dòng `Questions a–b · <tên phần>: <lời dẫn>` (xuống dòng trong lời dẫn đổi thành dấu cách; dải câu = câu làm trên app của phần). `lib/studio/promptParts.ts` đọc lại: `instructionFor(prompt, n)` cho khung trên câu (`QuestionCard` prop `lead`), `TaskLines` cho ô Đề bài (con) và `WorkPanel` (người lớn). Bài duyệt trước 21/11 không có dòng "Questions" nên hiện như cũ, không có khung trên câu.
- **Gạch nối.** Với câu không phải trắc nghiệm, khóa đáp án thêm cách viết thay gạch nối giữa hai chữ bằng dấu cách (không trùng). Không đổi `eng_norm_answer` (hàm này nằm trong chỉ mục của `accepted_additions`).
- **Bài làm trên app đã giao.** `lib/studio/assigned.ts` (thuần) + `assignedLoad.ts` (USER client, RLS chỉ người lớn của em): `inquiry_instances` mẫu `^[A-Z]-ST-\d{6}$` → bước, lịch (ngày bắt đầu = sự kiện `studio_start_chosen`), `attempts`, `episodes`, `results` (bỏ dòng đã bị thay). Trạng thái lấy theo lần nộp mới nhất; "lần đầu đúng x/y" lấy theo lần đầu (lần được tính). Bàn làm việc: `studioOverdue` → cảnh báo `studio-overdue`. Trang `/review/attempts/[attemptId]` tìm episode của lần nộp (RLS) rồi chuyển tới `/review/<episode>`.
- **Duyệt đề.** Danh sách theo `n` (bỏ `sortForReview` ở màn này); `editOps.moveWithinPart` cho ↑ Lên / ↓ Xuống trong phần (ẩn khi lọc).
- **Bản nháp đã bỏ.** Đọc qua RLS `studio_drafts` (status `discarded`, 20 bản mới nhất). `handleRestoreDraft` dùng chung `createFilled` với Nhập bài soạn sẵn: bản nháp thủ công mới, `client_id = rs-<id cũ>` (rồi `-2…-9`), cùng tên và nội dung; bản nháp đã bỏ không đổi (0024 không có đường quay lại). Bản sao là đề riêng, kể cả khi bản đã bỏ là bản sửa của đề đã duyệt.


### 19.29. Studio: góp ý cho con + Unit của bài (migration 0037, không AI)

- **Bảng.** `studio_feedback` (chỉ thêm, RLS người lớn của em, học sinh không SELECT): câu khen ≤ 400 + ≤ 3 điều cần sửa ≤ 300 cho MỘT lần làm của bài Studio; sửa = dòng mới `supersedes_id` (một lần, chỉ tác giả); chữ dạng điểm bị DB chặn. `studio_assignment_units` (chỉ thêm, RLS như trên): Unit (giáo trình đã duyệt của đúng em, không bị bỏ qua, ≤ 30, không trùng) của một bước Studio, ghi trong cùng giao dịch với `eng_assign_studio_v3` (= v2 + Unit; gửi lại cùng `client_id` phải cùng Unit).
- **Ghi / đọc.** `eng_write_studio_feedback` (service_role sau `requireAccess("practice:write")`; tự kiểm người thao tác TRƯỚC loại bài; chỉ `inquiry_templates.kind = 'studio'`) · `eng_studio_feedback` (service_role, cùng hình dạng `eng_submission_feedback`: `submission_id` = lần làm, `assignment_id` = bước) nên form `SubmissionFeedbackForm` dùng lại với `studio` (route `POST /api/learners/:id/studio/attempts/:attemptId/feedback`). Form nằm trên trang xem bài `/review/[episodeId]` khi mẫu là `X-ST-nnnnnn`.
- **Phía con.** `eng_student_done` thêm nguồn "đã xem" = góp ý Studio (bài tự chấm hết trước đây không bao giờ vào "Đã xem"); `eng_my_seen` thêm lời góp ý Studio (`fb_state = 'note'`, không tên người viết, không điểm). Thân = 0033 + đúng nhánh mới (test tĩnh so từng ký tự). Không yêu cầu làm lại, không chặn làm lại.
- **Đề xuất "Đang học".** `lib/curriculum/workProposal.ts` (thuần): Unit của bài con ĐÃ NỘP (Studio có Unit, và bài link / PDF giao theo Unit 0029) mà còn "Chưa bắt đầu" → khối "Con đã nộp bài của các Unit này" trên trang Trạng thái Unit, mỗi Unit một nút gọi `POST /api/curricula/:id/unit-events` sẵn có (`lesson_note_id: null`). Không bao giờ tự đổi, không bao giờ đề xuất "Đã học" (độ phủ chỉ đếm Unit người lớn đặt "Đã học"). DOMAIN §5.1.
- **Trước khi áp 0037.** Bảng / hàm chưa có: form góp ý ẩn; bảng bài đã giao không có Unit / "Đã góp ý"; khối đề xuất chỉ có bài link / PDF; giao kèm Unit báo `units_need_update` (giao không Unit vẫn như cũ).
- **Xóa dữ liệu một em.** Thân 0036 + `studio_assignment_units` (trước giáo trình và các bước) + `studio_feedback` (trước attempts); biên nhận và bản đếm thêm hai khóa.

### 19.30. E0 — mỗi câu chỉ hiện lời dặn của phần chứa nó (migration 0038, không AI)

- **Nguyên nhân.** `prompt_en` của bài Studio là MỘT chuỗi gộp lời dặn mọi phần (`${name}: ${instructions}` nối bằng xuống dòng; bản 21/11 thêm "Questions a–b ·" nhưng chỉ cho bài duyệt từ nay). Ô Đề bài hiện cả chuỗi, câu nào cũng thấy mọi phần; tên phần trùng lời dặn thì lặp hai lần; word bank là chữ thường trong lời dặn. Phần của từng câu đã lưu từ 0024 (`studio_item_meta.part`, bản nháp đã duyệt có tên + lời dặn) nhưng con không đọc được hai bảng đó.
- **Sửa.** `eng_my_task_parts(p_activity)` (0038, con đọc qua `auth.uid()`, chỉ bước đã mở của chính con, chỉ bài Studio): `[{key, name, instructions, items}]` theo đúng phiên bản bài đã giao; không đáp án / đáp án chấp nhận / giải thích / nhãn / câu làm trên giấy. `lib/studio/taskParts.ts` (thuần): `leadOf` bỏ tên phần khi chỉ lặp lời dặn (không phân biệt hoa thường, mã phần, dấu câu), mỗi câu một lần; `splitBanks` tách word bank ở cuối dòng ("Box: a · b", "Places: a, b, c" — nhãn khác "Box/Word bank" cần ≥ 3 mục ngắn) thành chip. `PartLeadBox` trên câu; `TaskParts` thay ô Đề bài (mỗi phần một khối "Questions 1–5" + lời dặn của phần đó).
- **Áp cho mọi bài Studio đã giao**, kể cả bài duyệt trước 21/11 (đọc phần từ dữ liệu đã lưu, không sửa bài đã khóa). Trước khi áp 0038: như cũ (đọc từ `prompt_en`).
- **Phần bị nhóm sai từ lúc đọc đề.** Thầy/cô dùng "Sửa đề đã duyệt" → đổi phần của câu ở Duyệt đề → duyệt = phiên bản mới (bài đã giao giữ bản cũ; giao lại bản mới).

### 19.31. E1 — nút "Hỏi" (gia sư AI) trong bài luyện Studio (migration 0039, AI tới thẳng con)

- **22/11: TẮT trong bài theo mặc định.** Phụ huynh quyết không có gợi ý trong lúc làm bài; `tutorInWorkEnabled()` (`lib/tutor/config.ts`) đọc `TUTOR_IN_WORK` (chỉ `on` mới bật). Tắt → Player không hiện `AskTutor` / `AskTutorSlot`, route hints trả 404 `tutor_off` trước mọi bước khác. Máy gia sư AI phía dưới giữ nguyên cho mục "Gia sư" riêng (E2).

- **Luồng một lượt** (`lib/tutor/turn.ts`, `POST /api/student/activities/[id]/hints`, `{item_id, client_id, question?}`): (1) `eng_tutor_context` — chủ bước là con đang đăng nhập, bài Studio đã mở, không phải Bài kiểm tra / `INDEPENDENT_CHECK` (403 `test_work`), chưa nộp (409 `sent`); cùng `client_id` → trả lượt cũ; (2) `planTurn` — 40 lượt / ngày / em (`track_settings.tutor_daily_limit`, giờ Việt Nam), thiếu lời dặn của phần (G8), đã H3 → câu cố định, không gọi model; (3) bản đồng ý `ai_text` của em phải là `ai-studio-tutor-v2`; (4) `eng_ai_gate` giữ chỗ 0,1 USD; (5) Sonnet `give_hint` (`prompts/tutor-hint.v2.md`); (6) code `leakReasons` (G1–G3); (7) Haiku `check_hint` (`prompts/tutor-check.v2.md`; lỗi Haiku = trượt); (8) trượt → viết lại 1 lần → trượt nữa → câu an toàn; (9) `eng_log_ai_run` từng lần gọi (`tutor_hint` / `tutor_check`), `eng_record_tutor_turn` (mức tính trong DB dưới khóa theo em: `least(3, số gợi ý + 1)`).
- **Dữ liệu (0039, chỉ thêm, cần 0038):** bảng chỉ thêm `tutor_turns` (cờ trong danh sách đóng `injection_attempt` / `off_topic` / `frustrated` / `asked_answer` / `word_meaning`; con không đọc; xóa dữ liệu một em gồm bảng này); `ai_runs.purpose` thêm `tutor_hint`, `tutor_check`; trần `ai_settings` nới ≤ 50 USD (`ai_settings_cap_max50`), `eng_set_ai_cap` chỉ phụ huynh; `eng_ai_settings` trả thêm `ai_text_version`, `tutor_today`, `tutor_month` cho từng em; `track_settings` thêm `tutor_language` (A `vi`, B `en_first`), `tutor_band`, `tutor_daily_limit`.
- **Bộ kiểm lộ đáp án** (`lib/tutor/leak.ts`, thuần): chuẩn hóa chữ, ranh giới từ `\p{L}\p{N}`; đáp án ≤ 3 chữ cái chỉ tính cạnh từ sát chỗ trống; G2 với đáp án ≤ 3 từ (không áp cho biến đổi câu); trắc nghiệm: chữ cái sau "đáp án / chọn / option / answer / letter / choice" hoặc "(B)", và chữ của lựa chọn đúng; biến đổi câu: cụm 3 từ của đáp án không có trong đề; dạng từ: tiền tố / hậu tố ghép gốc.
- **Không gọi AI** (câu cố định): câu mở (`no_answer`), câu có bài đọc (`passage`, migration 0040: `eng_tutor_context` trả thêm `has_passage` từ `passage_ref` của bản nháp đã duyệt; chưa áp 0040 thì trường không có và câu được gợi ý như trước). Hai mã này cùng `max_level` / `daily_limit` khép nút Hỏi của câu.
- **Model:** `claude-sonnet-5-5` trả lời, `claude-haiku-5-5` kiểm (env `TUTOR_MODEL`, `TUTOR_CHECK_MODEL`). `tool_choice` mặc định **auto** (`TUTOR_TOOL_CHOICE=tool` để ép): model 5.5 từ chối ép công cụ (400 `tool_choice`, đo ở bộ test 21/11); prompt dặn chỉ trả lời qua công cụ; không gọi công cụ = `ai_error`.
- **Màn của con:** `AskTutor` (khung vàng dưới câu, "Hỏi" → "Gợi ý tiếp", "Gợi ý n/3", ô hỏi ngắn ≤ 200 ký tự) chỉ ở bài luyện Studio khi đã đọc được phần (0038); bài khác giữ ô mờ cũ. **Cài đặt AI:** ô hạn mức tháng, dòng "bấm Đồng ý lần nữa" khi bản đồng ý cũ, số lượt hôm nay / tháng này mỗi em.
- **Bộ test** (`scripts/eval-hints.ts`, `tests/eval/bo-test-cases.json`, workflow "Eval AI tutor hints", chỉ bấm tay): chạy đúng `runTutorTurn` với kho trong bộ nhớ + API thật; đo lộ (code + Haiku kiểm độc lập bằng prompt khác + quét rộng hơn), độ dài / kết bằng câu hỏi, ngôn ngữ, cờ, kết quả kiểm, chi phí thật mỗi lượt. Chế độ `bo_test` (24 ca) / `full` (+ đề Destination tải từ bucket private `eval-sources` bằng `scripts/eval-sources.ts`; đề **không** ở git). Kết quả đầy đủ = artifact 90 ngày; tóm tắt công khai (`summary.public.md`) chỉ có bảng + mã câu. Mốc: `docs/eval/E1_BASELINE.md`.

### 19.32. E2a — Gia sư (tra từ) + Sổ tay (migration 0041, AI tới thẳng con)

Spec `docs/superpowers/specs/2026-11-22-gia-su-so-tay-design.md` (bản 0.2, phụ huynh duyệt 23/11); plan `docs/superpowers/plans/2026-11-23-e2a-gia-su-so-tay.md`.

- **Chỗ hỏi duy nhất ngoài bài làm** (D-G1, D-G2): con có 6 mục (Hôm nay · Gia sư · Sổ tay · Đã xem · Đã làm · Hành trình). Hai mục mới chỉ hiện khi `eng_my_tutor_status` có (0041 đã áp); trước đó giữ 4 mục, không "Sắp có".
- **Một lượt tra từ** (`lib/notebook/lookup.ts` `runLookup`, `POST /api/student/tutor/lookup`, `{word, context?, client_id}`). Các bước theo thứ tự:
  1. Kiểm chữ: tiếng Anh, 1–4 từ, ≤ 40 ký tự.
  2. `eng_lookup_context`: chỉ con; cùng `client_id` thì trả lượt cũ.
  3. Giới hạn 60 lượt / ngày (tính cả thẻ có sẵn).
  4. Từ chặn (code, trước mọi AI).
  5. Thẻ có sẵn theo (`headword` hoặc một dạng trong `forms`, `band`, `language`):
     - không có câu → trả ngay, không AI, không cần đồng ý v3;
     - có câu → Haiku `vocab-sense.v1` chỉ chọn số nghĩa; `-1` thì soạn bản mới (`supersedes`).
  6. Đồng ý `ai-studio-tutor-v3` → 30 lượt AI / ngày → model có giá → `eng_ai_gate` giữ 0,08 USD (`vocab_card` hoặc `vocab_sense`).
  7. Sonnet `vocab-card.v1` (tool `save_vocab_card`).
  8. zod chỉ giữ các trường của khuôn (trường lạ như `ipa` bị bỏ, không lưu, không hiện: L3); phần đầu của tool đọc dễ (thiếu `status` mà có thẻ vẫn nhận).
  9. Code kiểm (`cardCodeReasons`): ví dụ chứa từ (cụm động từ tách được: "turn it down"), đáp án tự kiểm, không URL / IPA, số dòng, nghĩa tiếng Việt, không lặp 5 từ liền / một tên của câu con gõ.
  10. Haiku kiểm (`vocab-check.v1`); Haiku lỗi tính là trượt.
  11. Viết lại 1 lần → không được thì câu cố định `card_failed`.
  12. `eng_save_vocab_card` → ghi sổ AI ở cuối, trả chỗ giữ bằng lần chạy cuối cùng cùng mục đích → `eng_record_tutor_ask`.
  - Lưu thẻ: bản mới luôn THAY bản hiện hành cùng khóa (khóa theo khóa thẻ), nên thẻ con thấy là thẻ được lưu và dạng mới (went → go) vào bộ tìm. Câu chỉ sang từ khác (left ≠ leave) thì thành thẻ riêng. Lưu lỗi → câu cố định `card_failed`, vẫn ghi lượt + chi phí, không bao giờ 500.
  - Câu con gõ không bao giờ vào thẻ dùng chung (§5.2): prompt cấm, code từ chối thẻ lặp 4 từ liền hoặc một từ viết hoa của câu (`copiesChildText`), Haiku nhận câu để kiểm; câu không thể đóng khối dữ liệu (`asData`).
  - Thẻ có sẵn + câu mà AI không chạy được (chưa v3, hết lượt AI, cổng từ chối): trả thẻ có sẵn, không in đậm nghĩa (§8).
- **Phiên âm** không nằm trong thẻ: mỗi lần trả thẻ, code ghép từ `ipa_lexicon` (`eng_ipa_for`, `lib/notebook/view.ts`).
  - Bảng nạp bằng `scripts/seed-ipa.ts` / workflow "Seed IPA lexicon" từ ipa-dict (MIT, commit ghim, sha256).
  - Chuẩn hóa: dấu nhấn về đầu âm tiết, `ɹ` → `r`, `ɐ` → `ʌ`/`ə`.
  - Bảng trống thì chỉ thiếu dòng phiên âm.
- **Giọng đọc:** chỉ `speechSynthesis` với giọng `localService` (`lib/notebook/voice.ts`, L5); không có giọng trên máy thì ẩn 🔊.
- **"Chưa hiểu, giải thích cách khác"** (`runAgain`, `POST /api/student/tutor/asks/:id/again`):
  - chỉ trên lượt `lookup` của chính con;
  - một lượt AI (`vocab-again.v1`, `vocab_again`), kiểm code + Haiku như thẻ;
  - lưu `kind = 'again'`, `parent_ask`, `shown_text` = JSON đã qua kiểm.
- **Sổ tay** (`/notebook`): `eng_notebook_save` (đã có thì `already`; đã bỏ thì thêm lại), `eng_notebook_set` (`remove` / `restore`), `eng_my_notebook` (nghĩa lấy từ bản hiện hành). Mở thẻ ở `/tutor/card/[cardId]`, luôn là bản hiện hành (`eng_my_vocab_card` đi theo chuỗi `supersedes`); người lớn xem đúng bản con đã thấy (`p_exact`).
- **😊 / 😐 / 😕:** `eng_rate_tutor_ask` (bảng chỉ thêm `tutor_ask_ratings`, lần mới nhất thắng).
- **Người lớn** (D-G8): trang `/learners/[id]/tutor-asks` ("Con hỏi Gia sư", con của mục Hồ sơ học sinh).
  - `eng_tutor_asks_for` kiểm `eng_is_staff_of`: phụ huynh và thầy/cô của em đọc được; thầy/cô em khác và con bị từ chối (42501).
  - Xem thẻ ở chế độ chỉ đọc. Không AI, không tổng hợp (C làm sau).
- **Dữ liệu (0041, chỉ thêm, cần 0040):**

  | Bảng | Ghi chú |
  |---|---|
  | `ipa_lexicon` | Tham chiếu, ai đăng nhập cũng đọc |
  | `vocab_cards` | Dùng chung, có phiên bản, không có gì của em |
  | `tutor_asks` | Chỉ thêm; con không đọc trực tiếp |
  | `tutor_ask_ratings` | Chỉ thêm |
  | `notebook_items` / `notebook_item_events` | Chỉ thêm; trạng thái = sự kiện mới nhất |

  - `ai_runs.purpose` thêm `vocab_card`, `vocab_check`, `vocab_sense`, `vocab_again`.
  - `track_settings` thêm `tutor_lookup_daily_limit` 60, `tutor_lookup_ai_daily_limit` 30.
  - Xóa dữ liệu một em gồm 4 bảng của em; giữ thẻ dùng chung.
- **Đồng ý:** `AI_NOTICE_VERSION` = `TUTOR_NOTICE_VERSION` = `ai-studio-tutor-v3`. Studio không đổi: cổng chỉ kiểm `granted`.
- **Bộ test:** `scripts/eval-cards.ts`, `tests/eval/cards/cases.json` (40 từ tự soạn), workflow "Eval vocab cards" (chỉ bấm tay, ≈ 1,5 USD). Audit khuôn §4.5 bằng Haiku (`vocab-audit.v1`). Mốc ghi ở `docs/eval/E2_BASELINE.md`.

### 19.33. Nhãn Destination của Track B (migration 0042, không AI)

- 23 nhãn có sẵn (`origin = 'seed'`, mã cố định) sau SM-1. Nhóm của chúng ở cột `error_tags.seed_group_key` (chỉ nhãn có sẵn, chỉ khi `group_key` null); `group_key` giữ nguyên luật 0026 (nhãn riêng + nhãn `nghe-…`).
- Bốn hàm đọc nhóm của nhãn có bản hiện hành ở 0042, dùng `coalesce(group_key, seed_group_key)`: `eng_skill_map`, `eng_point_inputs`, `eng_my_review_by_domain`, `eng_clean_feedback_items` (Góp ý nhận nhãn có sẵn có nhóm riêng, kể cả nhãn nghe). **Migration sau sửa các hàm này thì chép từ 0042.**
- Trình duyệt không đọc `seed_group_key`: ô chọn nhãn tìm nhóm qua `eng_skill_map` (`placeOfTag`).

### 19.34. Gỡ bài trên app (không SQL)

- Gỡ bài = `eng_activity_event(step, 'skip', null, lý do, người)`; Khôi phục = `unskip`. `eng_step_effective_date` trả null khi bước đang bỏ → `eng_activity_released` false → bước không có trong `eng_my_today` / `eng_my_today_count`, không mở được, không tính quá hạn (`studioOverdueCount` bỏ qua "skipped"). Test DB: `tests/db/studentDesk.test.ts` "Gỡ bài = skip".
- Chỉ hiện nút Gỡ bài khi bài chưa có lần nộp nào (`lastAttemptId` null); `handleActivityEvent` từ chối `skip` khi bước đã có attempt (409 `has_work`, `InquiryStore.stepHasWork`) — DB (0007) không chặn nên chặn ở server. Bước đang bỏ luôn hiện "Đã gỡ" + Khôi phục, kể cả khi đã có bài nộp (status "skipped" thắng). `Schedule.skipReason` = lý do của lần gỡ đang hiệu lực. Sự kiện chỉ thêm, có người + lý do; quyền = `eng_actor_may_manage` (phụ huynh, thầy/cô của em).
- `StudioAssignedRow.lateDays` = số ngày sau hạn (chỉ "overdue"); `sortStudioAssigned` đưa bài quá hạn lâu nhất lên đầu.

### 19.35. Bài đã giao (không SQL)

- Trang `/learners/[id]/assigned?tab=need|doing|done|removed` (thầy/cô của em hoặc phụ huynh, cùng cổng `practice:write` như Giao bài). `lib/assigned/board.ts` (thuần): `tabOfStudio` — đã gỡ → removed; chờ chấm → need; đã chấm mà chưa góp ý (khi 0037 đã áp) → need; đã chấm + góp ý → done; còn lại → doing. `tabOfPractice` — thu hồi → removed; chưa nộp → doing (kết quả ghi tay mà con không nộp → done); đã nộp mà chưa có kết quả hoặc chưa có góp ý còn hiệu lực → need; còn lại → done. `NEEDS_FEEDBACK_TO_FINISH` quyết phần "chưa góp ý".
- Tab "Con đang làm": bài quá hạn lâu nhất trước (Studio theo `lateDays`, link / PDF theo hạn sớm nhất). `parseTab`: tab lạ → need nếu có việc, không thì doing.
- Trang dùng lại `StudioAssignedTable` và `AssignmentTable` (lọc theo tab), không có nút mới ngoài Gỡ bài của §19.34. Đọc Studio lỗi → báo "chưa đọc được", không giả là trống.
- Giao bài (`/assign`) và Tạo bài từ đề không còn danh sách đã giao; Giao bài hiện "Bản nháp đang soạn" (`eng_studio_drafts`: chưa giao, chưa bỏ, chưa bị thay).
- `lib/assigned/duplicates.ts`: tên bài so sánh không phân biệt hoa thường / dấu cách / dấu phân cách; chỉ là cảnh báo, không chặn.


### 19.36. "Xong một bài" (L1, không SQL)

Một màn cho một lần làm bài Studio: `/learners/[id]/finish/[attemptId]` (cổng `work:review`, thầy/cô hoặc phụ huynh của em; con và người ngoài 404). Dữ liệu đọc từ những gì đã có: `loadEpisode`, `item_decisions`, `studio_item_meta` + tên phần của bản nháp đã duyệt, `eng_retry_pending`, `eng_studio_feedback`. Mô hình thuần `lib/finish/view.ts` (dùng chung server / client). Màn chỉ gọi 3 API cũ: chấm câu (`/api/review/studio/attempts/[id]`), góp ý (`/api/learners/[id]/studio/attempts/[attemptId]/feedback`), đã xem lần thử lại (`…/retry-seen`). Xong bài = hết câu chờ + có góp ý; bấm Xong ghi luôn "đã xem" lần thử lại. Hàng đợi (`lib/finish/queue.ts`): cùng ba phần Studio của Chờ duyệt, cũ nhất trước; `/learners/[id]/finish` mở bài cũ nhất. Thẻ "Chấm bài", dòng Studio ở Chờ duyệt, Bài đã giao và thẻ Khen mở màn này. Gợi ý góp ý do app soạn từ câu sai (không AI, không ghi điểm). Chấm kỹ năng / mức hỗ trợ vẫn ở màn cũ (liên kết).

### 19.37. Tiến độ tự chạy (L2, migration 0044)

- **Luật** (DOMAIN §5.1 bản 0.11): bài con nộp đặt Unit "Chưa bắt đầu" thành "Đang học" (app đặt); "Đã học" chỉ người lớn; không bao giờ hạ; người lớn đổi sau bài nộp thì thắng tới bài nộp mới.
- **SQL (0044, chỉ hàm).** `eng_unit_auto_events(learner)` (nội bộ, không ai gọi trực tiếp): mỗi Unit của giáo trình đã duyệt (không bỏ qua) có bài nộp → lúc nộp mới nhất, chỉ khi trạng thái người lớn tới lúc đó là rỗng / "Chưa bắt đầu". Unit của bài: `studio_assignment_units`, `assignment_units`, hoặc "Unit N" trong tên bài Studio không gắn Unit → mã `UN` của giáo trình chính (`eng_roadmap_main_id`; cùng luật `unitKeyOf`). `eng_unit_auto(learner)` cho người lớn (authenticated, `eng_is_staff_of`, ngoài phạm vi = rỗng). `eng_my_roadmap()` = 0031 + gộp sự kiện tự chạy.
- **App.** `curriculumProgress(units, events, auto)` + `mergeAutoEvents` (thuần; kiểm lại luật "chỉ lên"); `autoOf` → nhãn "App đặt theo bài nộp · dd/mm" trên Trạng thái Unit; Lộ trình (`parseRoadmap(raw, auto)`) và mọi nơi dùng thẻ giáo trình đi theo. Trước 0044: `loadUnitAuto` trả rỗng, mọi thứ như cũ.
- **Thẻ "có thể Đã học"** (`unit_ready`, `lib/results/actions.ts`): Unit sách đang "Đang học", không còn bài giao chưa nộp, không còn câu chờ, ≥ 4 câu đã chấm, lần làm đầu ≥ 60 % → thẻ ở Việc nên làm với nút "Đánh dấu Đã học" (gọi `POST /api/curricula/:id/unit-events` sẵn có; chỉ thầy/cô thấy nút). Không phải thẻ "Đã làm / Bỏ qua" (0043 không có loại này).

### 19.38. Hướng B: cột trái, Bài tập, Tiến bộ › Tổng quan (không SQL)

Thiết kế: `docs/superpowers/specs/2026-11-26-ia-huong-b-design.md`.

- **Cột trái (`lib/shell/nav.ts`)** là dữ liệu thuần:
  - `quick`: 3 nút. Chấm bài → `/learners/[id]/finish`; Giao bài → `/assign`; Ghi buổi học → `/notes/new`.
  - `sections`: Hôm nay · Bài tập · Buổi học · Tiến bộ · Kế hoạch · Hồ sơ học sinh.
  - Mỗi đường dẫn thuộc đúng một mục theo bảng `RULES` (`lib/shell/paths.ts`). Không trang nào bị xóa.
- **Tab:** Kế hoạch và Tiến bộ là tab dạng liên kết giữa các trang có sẵn (`lib/shell/tabs.ts`, `components/shell/SectionTabs.tsx`). Vì vậy URL luôn cho biết đang mở tab nào và trang chạy được không cần JS.
- **Số trên nút Chấm bài:** route chỉ đọc `GET /api/learners/:id/pending-count` trả `{ count, work }`.
  - `work` = số tab **Cần chấm** của Bài tập (`lib/assigned/needCount.ts`, cùng `buildBoard`), nên nút, tab và Hôm nay không lệch nhau. Một trong hai danh sách không đọc được thì `null`.
  - Hôm nay đưa sẵn số của mình (`BadgeSeed`). Trình duyệt nhớ 30 giây cho mỗi em (`components/shell/badgeStore.ts`), và đọc lại sau khi rời trang Xong một bài hoặc Bài tập, kể cả khi rời tiếp trước lúc có câu trả lời.
  - Nút mở hàng chờ Xong một bài. Hết bài trên app mà còn bài link / PDF chờ thì chuyển sang Cần chấm.
- **Bài tập › Bản nháp (`lib/assigned/draftGroups.ts`):**
  - Lấy bản nháp chưa bỏ, chưa bị thay, chưa giao (`openDrafts`), gom theo `unitKeyOf([], title)`.
  - "Kế tiếp" = Unit (`U\d+`) có số nhỏ nhất mà ở giáo trình chính chưa `done` / `skipped`. Không biết trạng thái (không có giáo trình chính, hoặc đọc lỗi) thì không ghi "Kế tiếp".
  - Giáo trình chính chọn bằng `mainCurriculum` (`lib/curriculum/main.ts`), dùng chung với Kết quả. Chỉ đọc khi mở tab này; lỗi thì nhóm vẫn hiện, chỉ không có trạng thái.
- **Tiến bộ › Tổng quan (`lib/results/overview.ts`)** dùng cùng thước đo với Kết quả: chỉ tính bài được đo (lần làm đầu), câu chỉ làm trên giấy không tính, câu chờ người không tính đúng hay sai.
  - **4 tuần** = 28 ngày giờ Việt Nam tính đến hôm nay, so với 28 ngày liền trước.
  - **Ô "Bài nộp":** số bài được đo đã nộp trong 4 tuần.
  - **Ô "Đúng lần đầu":** tổng đúng / tổng câu đã chấm của các bài đó. Chưa chấm câu nào thì hiện "—". Độ chênh tính bằng điểm %.
  - **Ô "Chờ chấm":** bài còn việc của người lớn, kèm số ngày của bài chờ lâu nhất.
  - **Ô "Đang học":** Unit đang học của giáo trình chính, kèm số Unit đã học / tổng.
  - **Biểu đồ:** mỗi bài được đo có ít nhất 1 câu đã chấm là một chấm, xếp cũ → mới, tối đa 20 bài. Có nền dưới 50 % và từ 80 % (ngưỡng `RESULT_RULES`). Rê chuột hoặc bấm phím vào chấm thì thấy tên bài. Bảng "Từng bài" ngay dưới là bản đọc được của biểu đồ.
  - **Mục kiến thức:** chỉ xét mục có ≥ `minItems` câu đã chấm. Yếu nhất là 3 mục dưới 80 %, mạnh nhất là 3 mục từ 80 %. Một mục không nằm ở cả hai.
  - `?tab=work` cũ mở Tổng quan.
- **Hồ sơ học sinh (`/learners/[id]/profile`):** Hồ sơ đầu vào, Ghi chú dạy học và "Ngày ấy – bây giờ" chuyển nguyên từ Hồ sơ cấp, cùng cổng `tutorwork:read`. Cảnh báo "Hồ sơ đầu vào" trỏ `/profile#intake`.
