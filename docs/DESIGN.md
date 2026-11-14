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
- **Ai đọc gì:** nháp, nhãn câu, đáp án chấp nhận, Đúng/Sai, mẫu Studio + khóa + nguồn: chỉ phụ huynh và gia sư **của em đó** (`eng_is_staff_of`). Bảng AI: không vai nào của app đọc thẳng. Học sinh: chỉ `eng_my_studio_review(uuid)` (quyền `authenticated`) — câu sai (đề, câu em viết, đáp án, giải thích) và số thứ tự câu đang chờ; không bao giờ điểm, tổng, x/y, nhãn hay kỹ năng. Chi phí AI chỉ phụ huynh thấy.
- **Hàm (service_role sau `requireAccess` / `requireStaff`, tự kiểm lại người thao tác):** `eng_ai_gate`, `eng_ai_settings`, `eng_set_ai_settings`, `eng_log_ai_run`, `eng_studio_skills`, `eng_create_studio_draft`, `eng_edit_studio_draft`, `eng_save_studio_draft`, `eng_finish_studio_extraction`, `eng_fail_studio_extraction`, `eng_discard_studio_draft`, `eng_approve_studio_draft` (mẫu + nguồn + khóa + nhãn + khung đề giấy trong một giao dịch), `eng_assign_studio`, `eng_decide_studio_items`, `eng_studio_pending`, `eng_studio_draft(s)`. Nội bộ: `eng_record_studio_result` (idempotent mỗi lần làm, ghi `results` + `tag_marks`), `eng_compute_auto_checks` (nhánh transform / short / open chỉ cho mẫu Studio), `eng_engine_inputs` (câu `needs_person` lấy Đúng/Sai của người lớn; JSON không đổi nên `lib/engine` không đổi).
- **Kết quả bài:** trigger `AFTER INSERT` trên `episodes` gọi `eng_record_studio_result`; lỗi chỉ ghi `app_errors` (`studio_result`), không bao giờ làm hỏng lần nộp của con.
- **Xóa dữ liệu một em:** mẫu Studio đã công bố chỉ xóa được bên trong `eng_purge_learner`, cho đúng em đó (`eng_purge_allows_studio`); mẫu chủ đề tuần không bao giờ. `eng_purge_learner` và `eng_purge_preview` giữ mọi dòng của 0023 và thêm các bảng Studio.
- **AI:** `lib/ai/` (`anthropic.ts` là nơi duy nhất đọc `ANTHROPIC_API_KEY`, `request.ts` gọi Messages API bằng `fetch`, `pricing.ts` bảng giá ước tính, `cap.ts` cổng + tháng lịch Việt Nam UTC+7, `prompts.ts` đọc `prompts/studio-extract.v1.md`), `AI_FAKE=1` trả `tests/fixtures/studio/fake-extract.json` (CI, không gọi mạng). Chỉ gửi đề + đáp án của thầy/cô + danh sách nhãn / kỹ năng; không bao giờ tên, bài làm, điểm hay mã của em. AI chỉ soạn nháp; không chấm bài của con, không đổi bậc. Trần $10/tháng (báo ở $8); hết trần → chỉ "Soạn tay".
- **App:** `lib/studio/` (schema, validate, normalize, buildTemplate, summary, extract, handlers, supabaseStore, route, load, shape), API `app/api/studio/**`, `app/api/settings/ai`, `app/api/review/studio/**`, `app/api/student/activities/[id]/studio-review`; màn `/settings/ai`, `/studio/new`, `/studio/drafts/[id]`, `/review/studio`, và khối "Câu cần xem lại" trên `/activities/[id]`.

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
- **Số trên "Chờ duyệt" (U1, U2).** `GET /api/learners/[id]/pending-count` (`lib/desk/countRoute.ts`): `requireAccess(…, "work:review")` → `loadPendingRows` → `pendingView(...).count`; chỉ trả `{count}` (không tiêu đề, không id); học sinh / người ngoài 404; `no-store`. `InboxBadge` (client) đọc **sau khi trang hiện**, nhớ 30 giây mỗi em trong tab (`lib/shell/badgeMemo.ts`), đọc lại khi rời một trang duyệt hoặc đổi em; ẩn khi 0, không rõ hoặc lỗi mạng (không bao giờ hiện số sai). Khi có hàm đếm SQL (W4) chỉ thay ruột `countRoute.ts`.
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
