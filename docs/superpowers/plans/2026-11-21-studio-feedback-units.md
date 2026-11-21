# Studio: góp ý cho con + Unit của bài (bản rà 21/11 #4, #10) — Implementation Plan

> Phụ huynh duyệt 21/11: "ok đề xuất" (#4 chỉ lời nhắn, hiện ở "Đã xem" như bài link / PDF; #10 Unit tick lúc giao, tính khi con đã nộp).

**Goal:** người lớn góp ý cho một lần làm bài Studio (con đọc ở "Đã xem"); bài Studio giao kèm Unit, và khi con đã nộp thì Giáo trình
**đề xuất** đặt Unit đó "Đang học" (người lớn bấm, không tự đổi — DOMAIN §5.1).

**Architecture:** migration `0037_studio_feedback_units.sql` (chỉ thêm). Hai bảng append-only, hai hàm ghi (service_role sau requireAccess),
một hàm đọc cho người lớn, thay `eng_student_done` + `eng_my_seen` bằng bản có thêm góp ý Studio (thân = 0033 + đúng nhánh mới),
`eng_purge_learner` / `eng_purge_preview` = thân 0036 + hai bảng. App: dùng lại form góp ý bài nộp, dùng lại UnitPicker (compact) ở
Giao bài Studio, khối "Đề xuất từ bài đã nộp" trên trang Trạng thái Unit dùng lại API `unit-events` sẵn có.

## Quyết định (Claude đề xuất trong phạm vi phụ huynh đã duyệt)

| # | Quyết định |
|---|---|
| F1 | Góp ý = câu khen ≤ 400 + tối đa 3 điều cần sửa ≤ 300 (như bài link / PDF), không chữ dạng điểm (DB chặn). Một góp ý hiện hành mỗi lần làm; sửa = dòng mới, chỉ tác giả, một lần mỗi dòng |
| F2 | Ai: thầy/cô còn hiệu lực của em hoặc phụ huynh của gia đình (`eng_actor_may_manage`), như bài link / PDF |
| F3 | Chỉ lần làm của bước thuộc bài **Studio** (`inquiry_templates.kind = 'studio'`). Không yêu cầu sửa bài, không mở bước mới, không chặn con làm lại |
| F4 | Con thấy ở "Đã xem": câu khen + điều cần sửa (không điểm, không tên người viết). Góp ý làm bài Studio "đã được xem" (kể cả bài tự chấm hết, trước đây không bao giờ vào "Đã xem") |
| U1 | Unit của bài Studio lưu lúc giao (`studio_assignment_units`, theo bước), cùng luật với Giao theo Unit (0029): giáo trình của đúng em, bản đã duyệt, Unit không bị bỏ qua, ≤ 30, không trùng |
| U2 | "Tính" = **đề xuất** đặt "Đang học" cho Unit **chưa bắt đầu** khi con đã nộp ít nhất một lần; người lớn bấm (API sẵn có). Không tự đổi, không tự đặt "Đã học" (độ phủ chỉ đếm "Đã học") |
| U3 | Đề xuất gồm cả bài link / PDF giao theo Unit (0029) đã có bài nộp: cùng luật, không cần SQL thêm |
| U4 | Unit của bài hiện ở dòng của bài trong "Bài làm trên app đã giao" |

## Tasks

1. Migration 0037 + test DB (`tests/db/studioFeedbackUnits.test.ts`) + test tĩnh migration (`tests/unit/migrationStudioFeedbackUnits.test.ts`), cập nhật danh sách bảng ở `tests/db/migrations.test.ts`.
2. Server: `handleWriteStudioFeedback` (lib/studio/feedback.ts) + route `POST /api/learners/[id]/studio/attempts/[attemptId]/feedback`; đọc `eng_studio_feedback`; `assign` nhận `units` (v3 khi có Unit).
3. UI: form góp ý trên trang xem bài (`/review/[episodeId]`) cho bài Studio; UnitPicker (compact, lưu Unit) ở AssignStudioForm; Unit + "Đã góp ý" ở bảng bài đã giao; khối đề xuất trên trang Trạng thái Unit.
4. Test unit/dom, docs (DESIGN §19.29, PROGRESS, CLAUDE.md), review (Opus), PR (SQL: 0037).
