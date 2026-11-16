# Khuôn file "Nhập bài soạn sẵn" (Studio)

File `.json` dùng cho thẻ **Nhập bài soạn sẵn** ở màn Tạo bài từ đề. Một file = một bản nháp Studio. Thầy/cô vẫn xem, sửa, Duyệt rồi Giao như bài AI đọc. Code: `lib/studio/importFile.ts` (vỏ) và `lib/studio/schema.ts` (`studioDraftSchema`, phần `payload`).

## Vỏ file

```json
{
  "format": "learning-os.studio-draft",
  "version": 1,
  "track": "B",
  "title": "Destination C1&C2 · Unit 14 · Idioms (L)",
  "payload": { "parts": [], "passages": [], "items": [] }
}
```

| Trường | Luật |
|---|---|
| `format` | Đúng chữ `learning-os.studio-draft` |
| `version` | `1` |
| `track` | Một chữ in hoa, phải trùng Track của em được chọn (sai → app từ chối) |
| `title` | 1–160 ký tự; thành tên bài |
| `payload` | Đúng khuôn bản nháp đã lưu (`studioDraftSchema`, **strict**: thiếu trường hay thừa trường đều bị từ chối) |

Mỗi file tối đa **1 MB**. Không có trường nào khác.

## `payload`

- `parts[]`:
  - Mỗi phần có `{ key, name, instructions }`.
  - `key` gồm chữ, số hoặc gạch ngang, tối đa 20 ký tự. `name` tối đa 120 ký tự. `instructions` tối đa 1000 ký tự, viết tiếng Anh như trên đề.
  - **Ghi trang sách vào `name`** (ví dụ `A · Topic vocabulary: Quantity · tr.114`). Con cũng thấy tên phần.
- `passages[]`: mỗi bài đọc có `{ ref, title, text }`. `ref` gồm chữ hoặc số, tối đa 10 ký tự. `text` tối đa 20 000 ký tự.
- `items[]`: **mỗi câu phải có đủ mọi trường** dưới đây.

| Trường | Luật |
|---|---|
| `n` | 1..N liền nhau, không trùng; câu của một phần phải liền nhau |
| `part` | `key` của một phần |
| `kind` | `mcq` · `gap` · `word_form` · `transform` · `short` · `open` |
| `out_of_app` | `true` = chỉ làm trên giấy (không chấm trên app) |
| `stem` | Đề, tối đa 2000 ký tự; câu làm trên app không được trống |
| `options` | Chỉ `mcq` mới có: `[{ "letter": "A", "text": "…" }]`, ≥ 2, chữ cái A–H khác nhau. Các loại khác: `[]` |
| `passage_ref` | `ref` của bài đọc hoặc `null` |
| `key` | Đáp án. `mcq`: một chữ cái có trong `options`. Bắt buộc với mọi loại trừ `open` |
| `accepted` | Các cách đúng khác (≤ 10) |
| `tag_key` / `reading_skill_key` | **Đúng một** trong hai khác `null`, và phải có trong danh sách nhãn của Track (`content/tags/tags_<Track>.json`, nhóm "Kỹ năng đọc" đi vào `reading_skill_key`) |
| `target_id` | Mã kỹ năng của em hoặc `null` |
| `explanation_vi` | ≤ 300 ký tự, **con thấy khi làm sai**; không được có chữ dạng điểm |
| `needs_review` / `review_reason` | `true` + lý do (≤ 300 ký tự) để tô vàng câu cần thầy/cô xem |

## App chấm thế nào (để soạn đáp án đúng)

- `mcq`, `gap`, `word_form`: app **tự chấm** theo `key` + `accepted` (không phân biệt hoa thường, bỏ khoảng trắng thừa). **Đáp án sai thì con bị chấm sai**, nên phải ghi đủ các cách đúng vào `accepted`.
- `transform`, `short`: khớp `key` / `accepted` thì đúng; không khớp thì **chuyển cho thầy/cô quyết**, không tự chấm sai.
- `open`: luôn để thầy/cô đọc.

## Nhập lại

- Cùng nội dung file → cùng bản nháp ("Đã nhập trước đó").
- Bản nháp cũ đã bị bỏ → tạo bản mới.
- Sửa nội dung file rồi nhập → thành bản nháp mới, vì nội dung khác.

## Kiểm trước khi đưa file

Chạy file qua `studioImportFileSchema` và `validateDraft` (`lib/studio/validate.ts`) với nhãn của Track. Yêu cầu: **0 lỗi chặn**. App vẫn nhận file có lỗi chặn nhưng sẽ báo số lỗi, và thầy/cô phải sửa trước khi bấm Duyệt.
