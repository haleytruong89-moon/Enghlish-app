# Gia sư + Sổ tay — spec (bản 0.1 · 22/11/2026)

Trạng thái: **0.2 (23/11): thêm §4.5 Khuôn trả lời (phụ huynh duyệt 23/11: Vì sao và Liên quan luôn hiện, không phải bấm mở). Chờ phụ huynh duyệt bản viết.** Các quyết định trong §2 phụ huynh đã chốt trong chat 22/11.
Nguồn:
- Hub: `SPEC_GIA_SU_AI_TIENG_ANH_v0.1_2026-11-21.md` (§3 thẻ từ, §4 Sổ + ôn, §5 luật L1–L7, §11 thước đo, §12 O1–O5) và `HANDOVER_GIA_SU_AI_TIENG_ANH_2026-11-21.md`.
- Bản vẽ (canvas `.design/tutor/`, artifact d211e050…): Main / Ipad / Home / TestWork / Notebook.
Đi cùng: `docs/DOMAIN.md` (luật G1–G9 của gia sư AI), `docs/DESIGN.md` §19.31 (máy E1 dùng lại).

## 1. Vấn đề và mục tiêu

**Vấn đề.** E1 đặt gia sư AI *trong* bài luyện. Phụ huynh quyết ngày 22/11 không có gợi ý trong lúc làm bài, vì con dễ lười nghĩ (PR #53 đã tắt). Con vẫn cần một chỗ để hỏi tiếng Anh, cả cho bài trên lớp (sách giáo khoa) chứ không chỉ bài trong app. Con cũng cần một nơi giữ lại điều đã học để ôn.

**Mục tiêu.**
1. **Một chỗ hỏi duy nhất**: mục **Gia sư**, nằm ngoài mọi bài làm.
2. **Sổ tay là một mục riêng**: từ vựng trước, sau đó thêm ngữ pháp, lỗi hay sai, thầy/cô thêm.
3. Điều đã tra được **ôn lại giãn cách** và máy chấm. Con không tự chấm Dễ/Khó.
4. Mọi lượt hỏi được **ghi lại**, để mẹ và thầy/cô biết con hỏi gì. Phần báo cáo cho mẹ (C) thiết kế riêng sau.

**Thước đo (2 tuần sau khi mở cho con; hub §11):**
- Không có lần nào lộ đáp án của câu bài tập con dán vào (E3).
- Thẻ bị người lớn đánh dấu sai ≤ 5 %.
- Mỗi con dùng ≥ 3 ngày/tuần.
- Câu ôn trễ (≥ 7 ngày) đúng ≥ 70 %.
- Chi phí thật ≤ trần.

## 2. Quyết định đã chốt (22/11)

| # | Quyết định |
|---|---|
| D-G1 | **Không có gì của gia sư trong bài làm**, kể cả link (PR #53, công tắc `TUTOR_IN_WORK` mặc định tắt). |
| D-G2 | Gia sư là **một mục riêng** trên bàn học của con: Tra từ (E2a) · Hỏi ngữ pháp (E3). Dùng được cho cả bài trên lớp. |
| D-G3 | Câu bài tập con dán vào thì gia sư **giải thích, không điền hộ** (E3). |
| D-G4 | **Sổ tay là một mục riêng**, gồm nhiều loại mục. Loại đầu tiên là từ vựng (E2a), sau đó ngữ pháp (E3). Lỗi hay sai và Thầy/cô thêm để sau (E4). |
| D-G5 | Làm thành 3 lát: **E2a** tra từ + Sổ tay → **E2b** ôn + "Ôn n từ" ở Hôm nay + đặt câu → **E3** hỏi ngữ pháp + câu bài tập. |
| D-G6 | Ôn trong Sổ tay **không tính** vào chuỗi tuần 🔥 (O1). Có dấu nhỏ riêng "Đã ôn hôm nay". |
| D-G7 | Phiên âm **Anh–Anh, có thêm Anh–Mỹ** (hai dòng UK / US). Giọng đọc ưu tiên en-GB. Phiên âm lấy từ dữ liệu từ điển mở, **không do AI viết** (L3, O3). |
| D-G8 | Câu con hỏi ở Gia sư: **mẹ và thầy/cô của em đọc được**, và **con được báo** bằng một dòng trên trang Gia sư (O4). |
| D-G9 | Nhãn bài luyện của con đổi thành "Luyện tập". Đoạn mô tả gia sư AI ở Cài đặt AI sửa ở E2a, cùng văn bản đồng ý mới (§8). |
| D-G10 | Tên gia sư vẫn là **"Gia sư"** (không "cô", không TOMO; O2 giữ như E1). |

## 3. Không làm (trong E2a–E3)

- Chat mở. Mỗi lượt là một việc có khuôn: tra một từ, hỏi một điểm ngữ pháp, giải thích một câu.
- Tra bằng ảnh, nói / shadowing, tra Việt → Anh (để sau).
- Link học thêm, thẻ "học cách học" (E5).
- Báo cáo tuần + nhận xét AI cho mẹ (C, thiết kế riêng). E2a chỉ có danh sách đọc thô cho người lớn (§6.4).
- Điểm, mức, tổng số câu đúng cho con.
- Tab "Sắp có" mờ. Phụ huynh từng nhầm vì ô mờ (PR #52), nên tab nào chưa chạy thì **chưa hiện**.

## 4. Màn hình của con

### 4.1 Khung

Bàn học có 6 mục: Hôm nay · **Gia sư** · **Sổ tay** · Đã xem · Đã làm · Hành trình.
- Điện thoại / iPad dọc: thanh dưới. Laptop: cột trái.
- Đường dẫn `/tutor` và `/notebook`.
- Mục Gia sư và Sổ tay chỉ hiện khi đã áp migration của E2a. Chưa áp thì khung giữ 4 mục như cũ, không báo lỗi.

### 4.2 Trang Gia sư (`/tutor`)

- Đầu trang có tab **Tra từ**. Tab **Hỏi ngữ pháp** chỉ thêm ở E3.
- Dòng cố định: "Mẹ và thầy/cô xem được câu bạn hỏi ở đây để giúp bạn." (D-G8)
- **Tra từ.** Ô nhập một từ hoặc cụm tiếng Anh (1–4 từ, ≤ 40 ký tự). Ô "Câu có từ này" không bắt buộc (≤ 200 ký tự), để gia sư chọn đúng nghĩa. Nút "Tra".
- **Kết quả là thẻ từ (§5):**
  - Nút "+ Lưu vào Sổ tay", lưu xong thành "Đã lưu ✓".
  - Nút 🔊 cạnh mỗi dòng phiên âm.
- Không phải từ tiếng Anh, hoặc gõ sai: "Không thấy từ này. Có phải bạn muốn: …" kèm ≤ 3 chip gợi ý chính tả; bấm chip là tra lại.
- Từ không phù hợp để tra ở đây (tục, người lớn): câu cố định "Từ này mình không tra ở đây. Bạn hỏi thầy/cô hoặc bố mẹ nhé." Không gọi AI soạn.
- Cột phụ (laptop) / dưới trang (iPad): 5 từ vừa tra gần nhất. Bấm là mở lại thẻ, không tốn lượt.

### 4.3 Trang Sổ tay (`/notebook`)

- Tab **Từ vựng** (E2a). Tab **Ngữ pháp** thêm ở E3.
- Danh sách mới nhất trước: từ · nghĩa ngắn · ngày lưu. Có ô lọc theo chữ.
- Bấm một dòng là mở thẻ từ (luôn là bản hiện hành của thẻ, §9).
- "Bỏ khỏi Sổ tay" có hỏi lại. Mục đã bỏ hiện ở dòng gọn "Đã bỏ (n)", có "Thêm lại".
- **E2b** thêm nút "Ôn" ở đầu trang (§7) và dấu "Đã ôn hôm nay".
- Số trên màn của con chỉ là số mục / số từ cần ôn (`data-count="work"`, như W4b).

### 4.4 Hôm nay (E2b)

Có từ đến hạn ôn thì thêm thẻ "Ôn n từ trong Sổ tay" (mở `/notebook/review`). Không có thì không hiện. Thẻ này không tính vào "Còn n việc" và mục tiêu tuần (D-G6).

### 4.5 Khuôn trả lời của gia sư (✅ phụ huynh 23/11)

Mọi câu trả lời (thẻ từ, hỏi ngữ pháp, câu bài tập) có **cùng bố cục**. AI trả dữ liệu theo khuôn (tool có schema); app tự trình bày. Thiếu ô bắt buộc thì coi như trượt kiểm (§5.3). Bản vẽ: board "Laptop · trang Gia sư · khuôn trả lời" (bấm thử, xem như An / Nguyên).

| Thứ tự | Khối | Hiện thế nào | Nội dung |
|---|---|---|---|
| 1 | 🤔 **Đoán trước** | Luôn hiện. Các khối dưới **chỉ hiện sau khi con chọn một ý**, hoặc bấm "Xem luôn". Đây là lần bấm duy nhất | Một câu hỏi + 2 lựa chọn (thường là 2 câu ví dụ đối chiếu). Chọn xong hiện ✓/✗ + một câu giải thích |
| 2 | 💡 **Bản chất** | Luôn hiện | Một câu cốt lõi, dễ nhớ ("make = làm ra thứ trước đó chưa có"). Ngữ pháp về thời gian thì có **dòng thời gian** do app vẽ từ dữ liệu (AI không vẽ) |
| 3 | 📌 **Nắm nhanh** | Luôn hiện | 2–3 câu ví dụ đối chiếu, mỗi câu kèm một dòng tiếng Việt |
| 4 | ❓ **Vì sao** | **Luôn hiện** | Lý do; **So với tiếng Việt**; **⚠️ Bẫy hay gặp** (khi nào KHÔNG dùng, lỗi người Việt hay mắc) |
| 5 | 🔗 **Liên quan** | **Luôn hiện** | 3–5 ô (từ gần nghĩa, họ từ, cụm, điểm ngữ pháp kề). Bấm một ô là tra tiếp (tính một lượt) |
| 6 | ✏️ **Tự kiểm** | Luôn hiện | 1–3 câu máy chấm, khó dần (nhận ra → dùng → câu dạng đề). Con chọn xong hiện ✓/✗ + một dòng vì sao. Không tổng |
| 7 | 🎯 **Đến lượt bạn** | Luôn hiện | Một việc con tự làm: đặt câu về chính mình (E2b: AI nhận xét ≤ 2 ý) hoặc "giờ tự làm lại câu bài của bạn" |
| 8 | Nút | Luôn hiện | 🔊 Nghe (thẻ từ) · "+ Lưu vào Sổ tay" · "Chưa hiểu, giải thích cách khác" · 😊 😐 😕 |

- **"Chưa hiểu, giải thích cách khác"**: gọi AI thêm một lần, đổi góc (hình ảnh, ví dụ đời thường khác, so tiếng Việt), không lặp câu cũ. Tính một lượt có AI. (E2a cho thẻ từ; E3 cho ngữ pháp.)
- **😊 😐 😕**: con chấm một chạm, ghi vào bảng chỉ thêm `tutor_ask_ratings` (một dòng mỗi lần chấm, lần mới nhất thắng), dùng cho thước đo §1 và vòng sửa prompt.
- **Độ dài:** Bản chất ≤ 1 câu; Vì sao ≤ 4 dòng (An) / ≤ 5 dòng (Nguyên); không khối nào vượt 6 dòng. Code kiểm.
- **Theo track (cấu hình `tutor_language`, `tutor_band`):** An: tiếng Việt, hình ảnh, ví dụ đời sống / khoa học. Nguyên: tiếng Anh trước (dòng ví dụ vẫn có tiếng Việt ngắn), sắc thái, văn phong, phân biệt từ gần nghĩa, câu tự kiểm dạng đề vào 10.
- **Câu bài tập dán vào (E3):** dùng đủ khuôn, nhưng ví dụ là **câu khác** câu bài; Tự kiểm hỏi cách đọc câu (tìm chìa khóa), không hỏi đáp án câu bài; "Đến lượt bạn" là "giờ tự làm lại câu của bạn".
- **Chi phí:** khối 1–7 soạn trong **một** lần gọi; chỉ "Chưa hiểu" gọi thêm. Ước tính tăng 20–30 % so với §5.4, vẫn trong trần.

## 5. Thẻ từ

### 5.1 Nội dung

| Phần | Nguồn | Ghi chú |
|---|---|---|
| Từ gốc (lemma), từ loại | AI | Ví dụ tra "went" → thẻ "go" (v), có dòng "went là quá khứ của go". |
| Nghĩa | AI | Tối đa 3 nghĩa thường gặp ở dải cấp. An (`tutor_language = vi`): nghĩa tiếng Việt. Nguyên (`en_first`): nghĩa Anh–Anh ngắn + tiếng Việt. |
| Phiên âm UK, US | **Bảng `ipa_lexicon`** (ipa-dict, MIT) | AI không viết phiên âm; trường phiên âm trong câu trả lời của AI bị bỏ qua. Cụm từ ghép từng từ; thiếu một từ thì để trống cả dòng. |
| Nghe | Giọng máy trên thiết bị | Chỉ dùng giọng có `localService = true` (L5); ưu tiên en-GB, rồi en-US. Không có giọng trên máy thì ẩn 🔊 và hiện "Máy này chưa có giọng đọc tiếng Anh". |
| Trọng âm + âm người Việt hay sai | AI | Một dòng. |
| Họ từ | AI | Tối đa 5 dạng (n / v / adj / adv). |
| Cụm hay đi kèm | AI | 3–5 cụm. |
| Ví dụ | AI | 2–3 câu đúng dải cấp, mỗi câu chứa từ (hoặc một dạng của từ: code kiểm). |
| Lỗi hay gặp | AI | Không bắt buộc, ≤ 1 dòng. |
| Đoán trước, Bản chất, Vì sao, Liên quan, Tự kiểm, Đến lượt bạn | AI | Theo khuôn §4.5. Tự kiểm của thẻ từ dùng chung cho mọi em cùng dải cấp (nằm trong thẻ cache). |

### 5.2 Dùng lại (cache)

- **Khóa thẻ:** (`headword` chuẩn hóa, dải cấp `tutor_band`). Dải cấp lấy từ cấu hình track (A `A2-B1`, B `B2-C1`), không từ tên em. Không có `if (track === …)`.
- Tra lại một từ đã có thẻ hiện hành thì trả thẻ ngay, không gọi AI.
- Có "Câu có từ này": Haiku chỉ **chọn số thứ tự nghĩa** (`vocab-sense.v1`, đầu ra là một số hoặc "không có"); Haiku không viết gì cho con. Không nghĩa nào khớp thì Sonnet soạn **bản mới** của thẻ có thêm nghĩa đó (vẫn ≤ 3 nghĩa, nghĩa ít gặp nhất bị thay).
- Thẻ **chỉ thêm, có phiên bản** (`supersedes`). Bản hiện hành là bản mới nhất chưa bị gỡ. Câu "Câu có từ này" của con **không** nằm trong thẻ dùng chung; nó nằm trong log của em (§6).

### 5.3 Kiểm trước khi tới con

1. zod kiểm khuôn (`vocab_card` tool, tool_choice auto như E1).
2. Code kiểm:
   - ví dụ chứa từ hoặc dạng của từ;
   - An có nghĩa tiếng Việt;
   - độ dài từng phần;
   - không có URL.
3. Haiku `vocab-check.v1`: đúng nghĩa, hợp tuổi, ví dụ đúng cấp, chỉ về tiếng Anh. Lỗi gọi Haiku tính là trượt.
4. Trượt thì Sonnet viết lại 1 lần. Trượt nữa thì hiện câu cố định "Gia sư chưa soạn được thẻ cho từ này. Bạn hỏi thầy/cô nhé." và không lưu thẻ.
5. Danh sách từ chặn (code, file trong repo) chạy **trước** mọi lời gọi AI.

Mọi lần gọi đều ghi `eng_log_ai_run` (purpose mới: `vocab_card`, `vocab_check`, `vocab_sense`) và đi qua `eng_ai_gate` (trần tháng chung). Gửi AI chỉ gồm: từ, dải cấp, ngôn ngữ giải thích, câu con gõ. **Không tên, không mã em** (giữ luật cũ, D1).

### 5.4 Giới hạn lượt (cấu hình `track_settings`)

- `tutor_lookup_daily_limit` = 60 lượt tra / ngày / em, tính cả lượt lấy từ cache. Mở lại thẻ từ danh sách "vừa tra" hoặc từ Sổ tay không tính lượt.
- `tutor_lookup_ai_daily_limit` = 30 lượt có gọi AI / ngày / em.
- Ngày tính theo giờ Việt Nam. Hết lượt: "Hôm nay bạn tra nhiều rồi. Mai tra tiếp nhé." Từ vừa tra (4.2) vẫn mở được.
- Ước tính chi phí: thẻ mới ≈ 0,006 USD (hub §9), ~10 từ mới/em/ngày ≈ 3,6 USD/tháng cho 2 em, giảm dần nhờ cache.

## 6. Dữ liệu

Mỗi lát một migration, chỉ thêm, guard migration trước. Tính từ 0041 trở đi.
- Bảng chỉ thêm gắn `eng_forbid_mutation`.
- Hàm definer có `set search_path = ''`.
- Con không đọc bảng trực tiếp; mọi đọc / ghi đi qua hàm của server.

### 6.1 E2a (`0041_tutor_notebook.sql`)

| Bảng | Nội dung | Ai đọc |
|---|---|---|
| `ipa_lexicon` | `word`, `accent` (`uk` / `us`), `ipa`, `source` (`ipa-dict@<commit>`) | Mọi tài khoản đã đăng nhập (dữ liệu tham chiếu, không của con) |
| `vocab_cards` | `headword`, `band`, `content jsonb`, `prompt_version`, `model`, `supersedes`, `retracted_at` (chỉ người lớn gỡ, E4) | Qua hàm |
| `notebook_items` | `learner_id`, `kind` (`word`; sau thêm `grammar`, `mistake`, `teacher`), `card_id`, `source` (`lookup`), `client_id` | Con của em đó, mẹ, thầy/cô của em |
| `tutor_ask_ratings` | `ask_id`, `rating` (`good` / `ok` / `confused`), `at`. Chỉ thêm | Mẹ + thầy/cô của em |
| `notebook_item_events` | `item_id`, `action` (`remove` / `restore`), `at`. Trạng thái = sự kiện mới nhất | Như trên |
| `tutor_asks` | `learner_id`, `kind` (`lookup`; sau thêm `sentence`, `grammar`, `explain`), `child_text`, `context_text`, `card_id` hoặc `shown_text`, `guard`, `flags`, `fixed_code`, `cost_usd`, `model`, `prompt_version`, `client_id` | Mẹ + thầy/cô của em (D-G8). **Con không đọc log thô**, chỉ đọc "từ vừa tra" qua hàm |

- `track_settings` thêm hai giới hạn ở §5.4.
- `ai_runs.purpose` thêm ba giá trị ở §5.3.
- Xóa dữ liệu một em: gồm `notebook_items`, `notebook_item_events`, `tutor_asks`. `vocab_cards` và `ipa_lexicon` không có gì của em nên không đụng.

**Nạp `ipa_lexicon`.**
- Script `scripts/seed-ipa.ts` đọc file en_UK / en_US của ipa-dict ở **một commit đã ghim**, kiểm sha256 rồi mới chèn.
- Chạy bằng workflow chạy tay "Seed IPA lexicon" (gõ `SEED`). Chạy lại được.
- Dữ liệu không nằm trong migration vì quá lớn. Ghi giấy phép MIT vào `docs/THIRD_PARTY.md`.
- Bảng còn trống thì thẻ vẫn chạy, chỉ thiếu dòng phiên âm.

### 6.2 E2b (`0042_notebook_review.sql`)

- `review_events` chỉ thêm: `item_id`, `question_type`, `correct`, `answered_on` (ngày VN), `client_id`.
- **Lịch ôn tính trong code từ sự kiện** (dữ liệu dẫn xuất):
  - Mức 0–4 ứng với 1 → 3 → 7 → 14 → 30 ngày.
  - Đúng thì lên một mức; sai thì về mức 0 (1 ngày).
  - Một mục ôn tối đa 1 lần / ngày.
  - Mục mới lưu đến hạn từ ngày hôm sau.
  - Mục đã bỏ không vào lịch.
- `tutor_asks.kind` thêm `sentence`; `ai_runs.purpose` thêm `sentence_feedback`, `sentence_check`.

### 6.3 E3 (migration kế tiếp sau E2b)

- `notebook_items.kind` thêm `grammar` (mục ngữ pháp lưu từ câu trả lời, nội dung nằm trong `tutor_asks.shown_text` + câu luyện).
- `tutor_asks.kind` thêm `grammar`, `explain`; purpose mới tương ứng.

### 6.4 Người lớn đọc (E2a)

Trang người lớn của em có thêm mục **"Con hỏi Gia sư"**:
- Danh sách mới nhất trước: ngày giờ · loại · câu con gõ · từ / thẻ trả về · đã lưu vào Sổ tay chưa.
- Chỉ đọc, chỉ mẹ và thầy/cô của em.
- Không AI, không tổng hợp. Báo cáo tuần và nhận xét AI là việc của C.

## 7. Ôn (E2b)

- Một lượt ôn có tối đa 10 từ đến hạn, cũ nhất trước.
- Kiểu câu (code tạo từ thẻ, máy chấm):
  1. Nghĩa → chọn từ (4 lựa chọn; lựa chọn nhiễu lấy từ Sổ tay của em, thiếu thì lấy từ thẻ cùng dải cấp).
  2. Nghe → chọn từ. Chỉ khi máy có giọng đọc trên máy (L5).
  3. Điền cụm đi kèm.
  4. Điền dạng đúng trong họ từ.
- Mỗi câu hiện ✓ / ✗ và đáp án đúng ngay sau khi trả lời (đây là ôn của con, không phải bài làm). **Không** hiện tổng số câu đúng.
- Xong lượt: "Xong! Mai bạn ôn tiếp nhé." và dấu "Đã ôn hôm nay".
- **Đặt câu.** Trên thẻ có "Đặt 1 câu với từ này" (≤ 200 ký tự).
  - Sonnet nhận xét ≤ 2 ý, **không viết lại câu** (L7).
  - Code chặn: lời nhận xét có câu dài giống ≥ 80 % câu của con thì bị coi là viết lại.
  - Haiku kiểm.
  - Trượt hai lần: câu cố định "Bạn hỏi thầy/cô xem câu này nhé."
- Người lớn thấy tỷ lệ đúng ở lần ôn trễ (≥ 7 ngày) trong C, con không thấy.

## 8. Đồng ý và cài đặt AI

- Văn bản đồng ý mới **`ai-studio-tutor-v3`** (E2a) nói rõ:
  - gia sư AI là mục riêng "Gia sư", **không có trong bài làm**;
  - con tra từ / hỏi tiếng Anh;
  - câu con gõ được gửi tới AI, không kèm tên;
  - câu con hỏi được lưu, **mẹ và thầy/cô của em đọc được**;
  - trần chi phí tháng.
- Sửa luôn đoạn mô tả ở Cài đặt AI (D-G9).
- Chưa có v3: trang Gia sư hiện "Gia sư đang nghỉ. Mẹ bấm “Đồng ý và bật” ở Cài đặt AI để mở." Sổ tay và thẻ đã lưu vẫn xem được (không gọi AI).
- Hết trần tháng hoặc AI tắt: tra từ chỉ trả thẻ đã có trong cache; từ mới thì "Gia sư đang nghỉ".

## 9. Lỗi và trường hợp biên

| Tình huống | Xử lý |
|---|---|
| Bấm "Tra" hai lần / mạng chập | Cùng `client_id` → trả lượt cũ (như E1). |
| Hết thời gian một lượt | Ngân sách thời gian như E1 (`TURN_BUDGET_MS`). Quá thì câu cố định, không trừ lượt AI nếu chưa gọi được. |
| Model trả sai khuôn | Coi như trượt kiểm (§5.3 bước 4). |
| Lưu một từ đã có trong Sổ tay | Không tạo mục mới, hiện "Đã có trong Sổ tay". |
| Thẻ có bản mới sau khi con lưu | Sổ tay mở bản mới nhất; ôn dùng bản mới nhất. |
| Con gõ câu tiếng Việt / câu dài ở ô Tra từ | > 4 từ hoặc có dấu tiếng Việt: "Ô này tra một từ hoặc cụm tiếng Anh ngắn." Ở E3 thêm gợi ý "Bạn muốn hỏi ngữ pháp? Sang tab Hỏi ngữ pháp." |
| Câu có dấu hiệu chèn lệnh (prompt injection) | Cờ `injection_attempt` như E1; vẫn chỉ trả thẻ hoặc câu cố định. |

## 10. E3: Hỏi ngữ pháp và câu bài tập (luật; chi tiết ở plan E3)

- Hai kiểu (code nhận dạng trước, Haiku phân loại khi code không chắc):
  1. **Câu hỏi ngữ pháp** ("khi nào dùng present perfect?"). Trả lời: bản chất ngắn + so với tiếng Việt + 3–5 câu luyện máy chấm. Lưu được vào Sổ tay (tab Ngữ pháp).
  2. **Câu bài tập dán vào** (có chỗ trống `___` / `…`, ngoặc từ gợi ý, hoặc lựa chọn A–D). Trả lời: chỉ ra điểm ngữ pháp, giải thích, cho **một ví dụ khác** câu bài. **Không điền, không chọn, không nói lựa chọn nào đúng / sai.**
- Kiểm lộ đáp án cho kiểu 2:
  - code chặn trích lại câu bài quá 6 từ liền;
  - code chặn nhắc tên lựa chọn (A–D) cùng chữ "đúng / correct";
  - code chặn chứa chữ trong ngoặc gợi ý đã đổi dạng nằm trong câu bài;
  - Haiku `explain-check` hỏi "câu trả lời có làm hộ câu bài không";
  - trượt thì viết lại 1 lần, trượt nữa thì câu an toàn.
- Bộ test E3 (mở rộng `scripts/eval-hints.ts`) phải 0 lần lộ trước khi mở cho con.

## 11. Kiểm thử

- **Unit:**
  - chuẩn hóa từ;
  - chặn từ;
  - ghép phiên âm cụm từ;
  - chọn giọng `localService`;
  - kiểm thẻ (§5.3 bước 2);
  - lịch ôn (đúng / sai / một lần một ngày / mục đã bỏ);
  - tạo câu ôn và lựa chọn nhiễu;
  - kiểm "viết lại câu" (E2b).
- **DB:**
  - quyền (con chỉ đọc Sổ tay của mình qua hàm; con không đọc `tutor_asks`; thầy/cô em khác không đọc được);
  - chỉ thêm;
  - xóa dữ liệu một em;
  - giới hạn lượt theo ngày VN;
  - cache trả thẻ không ghi `ai_runs`.
- **DOM:**
  - 6 mục khung;
  - dòng "Mẹ và thầy/cô xem được…";
  - nút Lưu → "Đã lưu ✓";
  - không còn tab nào chưa chạy;
  - không số ngoài `data-count="work"`.
- **e2e (CI, `AI_FAKE`):** con tra một từ → lưu → mở Sổ tay thấy từ → bỏ → thêm lại; mẹ mở "Con hỏi Gia sư" thấy lượt tra. Bài làm vẫn không có gia sư.
- **Bộ test AI (chạy tay, báo phụ huynh ước tính trước):** khoảng 40 từ cho hai track:
  - từ nhiều nghĩa (kèm câu);
  - phrasal verb;
  - dạng quá khứ / số nhiều;
  - gõ sai;
  - từ phải chặn;
  - câu chèn lệnh.
  Phải đạt: 0 thẻ có phiên âm do AI, 0 ví dụ thiếu từ, 0 nội dung không hợp tuổi.
  **Chấm chất lượng khuôn (§4.5)** bằng Haiku + mẹ đọc mẫu 10 câu: có câu bản chất đúng và ngắn; câu đoán có 2 lựa chọn thật sự khác nhau; ví dụ đối chiếu; "So với tiếng Việt" và "Bẫy" đúng; câu Tự kiểm đúng đáp án (code kiểm lại); "Đến lượt bạn" buộc con tự viết. Mục tiêu ≥ 90 % câu đạt mọi tiêu chí. Mốc ghi vào `docs/eval/E2_BASELINE.md`.

## 12. Giả định (phụ huynh sửa được khi duyệt)

| # | Giả định |
|---|---|
| A1 | Giới hạn 60 lượt tra / 30 lượt có AI mỗi ngày mỗi em (§5.4). |
| A2 | Thẻ ≤ 3 nghĩa; khóa cache theo dải cấp của track. |
| A3 | Tra không tự lưu: con bấm "+ Lưu vào Sổ tay" (như bản vẽ). |
| A4 | Ô Tra từ chỉ nhận tiếng Anh, 1–4 từ. Tra Việt → Anh để sau. |
| A5 | Người lớn đánh dấu "thẻ sai", sửa thẻ, nhập từ theo Unit: E4. Trước E4, nếu thấy thẻ sai thì báo qua "Góp ý về app". |
| A6 | Đăng nhập khi mở từ Study Launcher (O5): ngoài phạm vi; giữ như hiện tại. |
