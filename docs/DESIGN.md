# Learning OS (Family Edition) — DESIGN v0.2 (DRAFT)

> Thiết kế kỹ thuật cho `PRD_FAMILY_EDITION_v1.0.md` (+ MVP PRD v1.0). Thay thế `DESIGN.md` v0.1.
> Cập nhật: 11/10/2026. Đổi quyết định kiến trúc → bàn trên Claude.ai trước, rồi sửa file này.
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
| `learners` | id, family_id, member_id (tài khoản của con), alias (`An`/`Nguyên`), track_id, external_ref (vd `skillgrow:child:an`), is_test, ai_enabled, status (`active`/`draft`) | Track B: `status = draft` đến hè 2027 |
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
| `sources` / `source_versions` | id; version, url, title, author, accessed_at, rights, modality, excerpt, review_status | PDF → P1 |
| `schema_migrations` | version, applied_at | §2 luật 3 |

Trigger: sau khi `published_at`/`status = published` thì chặn UPDATE nội dung.

## 5. Bài được giao và bài làm

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

**Purge (FR-21):** trigger cho phép xóa chỉ khi `current_setting('app.purge_learner', true) = <learner_id>`; giá trị đó chỉ được đặt bằng `set local` bên trong hàm `english.eng_purge_learner(learner_id)` (`security definer`, `search_path = ''`, `revoke execute` khỏi `public/anon/authenticated`; chỉ route server dùng service role gọi). Hàm ghi biên nhận vào `audit_log` (không chứa nội dung đã xóa). Backup cũ hết hạn theo vòng đời (§14) — giao diện nói rõ điều này.

## 7. RLS (tóm tắt)

| Vai trò | Đọc | Ghi |
|---|---|---|
| Học sinh | Bài giao, nháp, attempt, phản hồi **đã duyệt** của chính mình; cấu hình đã công bố | Không ghi trực tiếp (route server) |
| Gia sư | Mọi thứ của learner có relationship còn hiệu lực, trừ consent | Không ghi trực tiếp |
| Phụ huynh | Mọi thứ của learner trong gia đình | Bảng quản trị qua route `/api/admin/*` |
| `anon` | Không gì | Không gì |

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
| Chế độ | Track A: `reviewer`, `coach`. Track B (⏸): + `clarifier`, `challenger` |
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
| Backup | GitHub Actions hằng đêm: `pg_dump` schema `public` + `english` → mã hóa `age` (khóa công khai trong repo, khóa riêng phụ huynh giữ offline) → artifact riêng tư `retention-days: 30` |
| Khôi phục thử | 1 lần trước pilot (G0): restore vào project thử, đối chiếu số dòng/ID |
| Giữ project không ngủ | GitHub Actions ping hằng ngày (như App Toán) |
| Log | Không ghi transcript/bài làm vào log Vercel; lỗi vào `english.app_errors` |
| Consent | Bản ghi có version; đổi nội dung thông báo = version mới |
| Export/xóa | §6, §13; xóa cả dữ liệu dẫn xuất còn định danh; backup tự hết hạn sau 30 ngày |

## 15. Tách khỏi project dùng chung

**Ngưỡng:** DB chung > ~60% của 500 MB · cần backup chính thức/PITR · sự cố chéo app · khi bật Track B (hè 2027).
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
