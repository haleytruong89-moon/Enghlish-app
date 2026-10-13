# Danh mục năng lực v0.2 - Learning OS (Family Edition)

*Competency Catalogue v0.2-draft · Ngày 11/10/2026 · Thay thế Framework v0.1 (51 micro-competency) · Trạng thái: **bản nháp**, chờ phụ huynh duyệt và gia sư rà soát · File máy đọc: `catalogue_v0.2.json`*

## 1. Tóm tắt

| | Track A - An (lớp 6, ~A2 -> B1) | Track B - Nguyên (lớp 9, ~B2 -> C1) |
|---|---:|---:|
| Trạng thái | Dùng cho pilot (active) | Bản nháp, chạy từ hè 2027 |
| Số target | 37 | 33 |
| Trong đó core (tính vào độ phủ) | 32 | 27 |
| Chỉ số aggregate (chẩn đoán) | 12 | 9 |
| Mức nhiệm vụ tư duy dùng | TL1-TL2 | TL3-TL4 |

Cả hai track dùng chung **16 chiều đo (dimension)** của PRD. Track A có thêm **2 chiều mở rộng** do gia sư quan sát trực tiếp: X1 Fluency và X2 Pronunciation. Toàn bộ **51 mã v0.1** đều đã được chuyển sang target mới hoặc chỉ số aggregate (mục 7).

## 2. Cách đọc tài liệu này

**Ba tầng:**

| Tầng | Là gì | Ví dụ |
|---|---|---|
| **Dimension** (chiều đo) | Thứ được đo, dùng chung cho cả hai track; mỗi chiều có thang 0-4 riêng | T4 Causal reasoning |
| **Target** (mục tiêu) | Một yêu cầu cụ thể của từng track, đủ hẹp để 2-3 tiêu chí đạt/không đạt chấm được | `A-T4-CAUSE`: giải thích chuỗi nhân quả ≥ 2 liên kết |
| **Aggregate indicator** | Hành vi chỉ thấy được qua nhiều bài/khoảng thời gian; **chỉ để chẩn đoán, không bao giờ là cổng xét năng lực** | Số từ nối khác nhau dùng đúng trong 7 ngày |

**Các quy tắc chấm (theo PRD §6):**

- **Điểm 0-4 chỉ nói về chất lượng bài**: 0 = có cơ hội hợp lệ nhưng không thể hiện; 1 = thiếu sót lớn; 2 = được một phần; 3 = đạt đúng yêu cầu đang kiểm; 4 = vững, rõ trong chính yêu cầu đó. **Mức hỗ trợ (AI, gia sư, mẫu câu...) ghi riêng**, không nằm trong điểm.
- **Không quan sát được = NULL (Not observed), khác điểm 0.** Mỗi target có `opportunity_rule`: nếu nhiệm vụ không tạo đủ cơ hội (vd. bài viết chỉ có 2 chỗ cần dùng quá khứ) thì ghi NULL, không ghi 0.
- **Tiêu chí đạt (success criteria)** là mốc của mức 3 cho riêng target đó: đạt **tất cả** tiêu chí = mức 3; đạt tất cả và khớp mô tả mức 4 của chiều đo = mức 4; trượt một tiêu chí thì thang 0-2 quyết định. Tiêu chí ghi *(máy)* là **code tự tính được** từ bài (đếm từ nối, so với đáp án, đọc log...); các tiêu chí khác cần người chấm (AI đề xuất nếu được phép, gia sư duyệt).
- **Khóa của một target** = `competency_id + descriptor_version + target_demand + input/output modality + assessment_policy_version`. Target ghi đầu ra "Nói hoặc viết" sẽ có **trạng thái riêng cho nói và cho viết**, không gộp.
- **Nhãn CEFR** chỉ gắn cho target Ngôn ngữ (và X1/X2), là **mức của yêu cầu đang kiểm**, không phải "con đạt B1". Target Tư duy dùng **mức nhiệm vụ nội bộ TL1-TL4** (phụ lục A), không bao giờ gọi là "B1-thinking". Target Tự chủ được mô tả theo điều kiện.
- **AI** chỉ đề xuất, gia sư xác nhận. AI **không bao giờ chấm** A1, A3, A5, X1, X2. Tương tác nói trực tiếp (L8 nói) do gia sư quan sát.
- **Không lưu audio lên cloud**: bằng chứng nói = transcript trên máy + chỉ số; Fluency và Pronunciation chỉ do gia sư đánh giá trong buổi.
- **Nghe và Đọc là modality**, không phải chiều đo; hiểu qua nghe và hiểu qua đọc là **hai target riêng**.
- **Mọi con số** (≥ 3 từ nối, 80%, 45-60 giây...) là **cấu hình pilot**, sẽ chỉnh theo dữ liệu thật; không phải ngưỡng CEFR chuẩn hóa.
- **Trạng thái năng lực** (Not observed -> Supported -> Developing -> Independent -> Transferable) vẫn theo đúng PRD §6.4: ví dụ Independent cần ≥ 3 bài làm lần đầu, ở ≥ 2 bối cảnh, trải ≥ 7 ngày, mỗi bài ≥ 3, có gia sư duyệt. Danh mục này không đổi các quy tắc đó.

## 3. Các chiều đo (16 + 2)

| ID | Nhóm | Tên | AI được đề xuất điểm? | Dùng nhãn CEFR? | Track |
|---|---|---|:-:|:-:|:-:|
| L1 | Ngôn ngữ | Grammar - Ngữ pháp | Có | Có | A, B |
| L2 | Ngôn ngữ | Lexical range & precision - Từ vựng: độ rộng và độ chính xác | Có | Có | A, B |
| L3 | Ngôn ngữ | Organisation & cohesion - Tổ chức và liên kết | Có | Có | A, B |
| L4 | Ngôn ngữ | Clarity - Độ rõ ràng | Có | Có | A, B |
| L7 | Ngôn ngữ | Mediation - Chuyển tải thông tin (Mediation) | Có | Có | A, B |
| L8 | Ngôn ngữ | Interaction - Tương tác | Có | Có | A, B |
| T1 | Tư duy | Comprehension - Hiểu nguồn | Có | Không | A, B |
| T2 | Tư duy | Inference - Suy luận | Có | Không | A, B |
| T4 | Tư duy | Causal reasoning - Lập luận nhân quả | Có | Không | A, B |
| T5 | Tư duy | Evidence evaluation - Đánh giá bằng chứng | Có | Không | A, B |
| T7 | Tư duy | Argumentation - Lập luận bảo vệ quan điểm | Có | Không | A, B |
| T9 | Tư duy | Synthesis - Tổng hợp | Có | Không | A, B |
| T11 | Tư duy | Judgement - Phán đoán, kết luận | Có | Không | A, B |
| A1 | Tự chủ | Independence (self-management) - Tự chủ (tự quản lý nhiệm vụ) | **Không** | Không | A, B |
| A3 | Tự chủ | Revision - Sửa bài | **Không** | Không | A, B |
| A5 | Tự chủ | Transfer - Vận dụng sang bối cảnh mới | **Không** | Không | A, B |
| X1 | Mở rộng (Track A) | Fluency - Độ trôi chảy | **Không** | Có | A |
| X2 | Mở rộng (Track A) | Pronunciation / intelligibility - Phát âm / mức dễ hiểu | **Không** | Có | A |

### L1 Grammar - Ngữ pháp

Độ chính xác và độ phù hợp của cấu trúc ngữ pháp trong bài con tự nói/viết, xét theo đúng các cấu trúc mà nhiệm vụ đòi hỏi.

| Mức | Mô tả |
|:-:|---|
| 0 | Nhiệm vụ cần dùng cấu trúc mục tiêu nhưng con không dùng, hoặc mọi lần dùng đều sai; ý chủ yếu dựa vào ghép từ. |
| 1 | Có dùng cấu trúc mục tiêu nhưng phần lớn sai; lỗi thường làm khó hiểu. |
| 2 | Đúng ở một số chỗ; lỗi còn nhiều hoặc lặp theo một quy tắc, dù vẫn đoán được nghĩa. |
| 3 | Đúng ở phần lớn các chỗ bắt buộc như target quy định; lỗi còn lại hiếm khi ảnh hưởng nghĩa. |
| 4 | Đúng nhất quán trong cả bài, kể cả chỗ ít quen; lỗi chỉ lẻ tẻ, không ảnh hưởng nghĩa. |

*Ranh giới:* Lỗi không làm sai nghĩa thì không bị trừ ở Clarity hay các chiều Thinking. Ngữ pháp trong bài nói (đọc từ transcript trên máy) chỉ để tham khảo vì STT có thể tự 'sửa' lỗi; target L1 chấm trên bài viết, còn độ chính xác khi nói theo dõi bằng chỉ số aggregate do gia sư gắn lỗi.

### L2 Lexical range & precision - Từ vựng: độ rộng và độ chính xác

Độ rộng, độ chính xác và cách dùng từ/cụm từ phù hợp với nhiệm vụ, gồm cả cách xoay xở bằng tiếng Anh khi thiếu từ và đoán nghĩa từ mới qua ngữ cảnh.

| Mức | Mô tả |
|:-:|---|
| 0 | Nhiệm vụ cần từ chủ đề/từ chính xác nhưng con không dùng được: bỏ trống, hoặc chuyển sang tiếng Việt ở chỗ cần từ tiếng Anh. |
| 1 | Từ rất chung chung hoặc dùng sai nhiều lần; ý chính không diễn đạt được hoặc bị sai. |
| 2 | Dùng đúng một số từ/cụm liên quan; còn nhiều từ mơ hồ, sai dạng từ hoặc kết hợp từ; đôi chỗ thiếu từ làm mất ý. |
| 3 | Đủ từ/cụm liên quan dùng đúng để nói được nội dung yêu cầu; lỗi chọn từ hiếm khi ảnh hưởng nghĩa; thiếu từ thì xoay xở bằng tiếng Anh. |
| 4 | Chọn từ chính xác, đa dạng; kết hợp từ và dạng từ đúng; xoay xở khi thiếu từ trôi chảy; không lỗi từ nào làm sai nghĩa. |

*Ranh giới:* Nội dung khoa học/xã hội đúng hay sai thuộc T1/T4, không thuộc L2. Từ trong danh sách của inquiry chỉ được đếm ở target CHUNKS, không đếm lại ở target độ chính xác.

### L3 Organisation & cohesion - Tổ chức và liên kết

Sắp xếp ý hợp lý và nối ý bằng phương tiện phù hợp (từ nối, từ thay thế, chia đoạn, báo hiệu) để người đọc/nghe dễ theo dõi.

| Mức | Mô tả |
|:-:|---|
| 0 | Cần một đoạn/lượt nói liền mạch nhưng bài chỉ là các ý rời, không thứ tự, không nối. |
| 1 | Có ý nhưng thứ tự khó theo; chỉ nối bằng 'and/then' hoặc dùng từ nối sai. |
| 2 | Thứ tự nhìn chung hợp lý; có một số từ nối đúng nhưng thiếu/sai ở chỗ quan trọng, hoặc cấu trúc đoạn chưa rõ. |
| 3 | Ý theo thứ tự rõ; dùng đúng các từ nối mà target yêu cầu; nhận ra được cấu trúc mong đợi (mở - thân - kết). |
| 4 | Cấu trúc rõ suốt bài; từ nối và từ thay thế đa dạng, chính xác; đọc/nghe một lần là theo được. |

*Ranh giới:* Quan hệ (vd. nhân quả) đúng hay sai về nội dung thuộc Thinking (T4); L3 chỉ xét quan hệ đó có được báo hiệu đúng cách hay không.

### L4 Clarity - Độ rõ ràng

Thông điệp đến người đọc/nghe rõ và đủ đến đâu: ý chính nói thẳng, chi tiết liên quan, không mơ hồ.

| Mức | Mô tả |
|:-:|---|
| 0 | Cần một thông điệp (trả lời, mô tả, giải thích) nhưng bài không truyền đạt được. |
| 1 | Khó nhận ra ý chính; thiếu hoặc mâu thuẫn thông tin quan trọng; người đọc phải đoán. |
| 2 | Nhận ra ý chính nhưng còn mơ hồ, thiếu, hoặc lẫn ý không liên quan. |
| 3 | Ý chính nói rõ; có đủ chi tiết target yêu cầu và đều liên quan; người đọc theo được không cần đoán. |
| 4 | Thông điệp chính xác, đầy đủ cho mục đích; chi tiết chọn lọc; không mơ hồ, không thừa. |

*Ranh giới:* Lỗi ngữ pháp chỉ tính ở đây khi làm mất nghĩa. Nói trôi chảy không tự nâng điểm Clarity.

### L7 Mediation - Chuyển tải thông tin (Mediation)

Chuyển tải thông tin từ một nguồn cho người khác (kể lại, tóm tắt, giải thích số liệu, chuyển nội dung từ tiếng Việt) chính xác và bằng lời của mình.

| Mức | Mô tả |
|:-:|---|
| 0 | Cần chuyển tải nội dung nguồn nhưng bài không làm được (chép nguyên, hoặc lạc đề). |
| 1 | Chỉ chuyển được vài ý; có ý sai hoặc thiếu lớn; chủ yếu dùng lại lời của nguồn. |
| 2 | Một số ý chính đúng; còn thiếu/sai ít nhất một ý chính, hoặc dựa nhiều vào lời của nguồn. |
| 3 | Chuyển đúng các ý chính target yêu cầu, phần lớn bằng lời của mình, hợp với người nhận. |
| 4 | Chuyển chính xác và có chọn lọc (ý chính - ý phụ), diễn đạt lại rõ cho người nhận, giữ được quan hệ giữa các ý. |

*Ranh giới:* Hiểu nguồn thuộc T1; L7 chỉ xét việc chuyển tải. Hiểu mà chưa chuyển tải được thì T1 vẫn được ghi nhận, L7 ghi khoảng trống.

### L8 Interaction - Tương tác

Tham gia trao đổi nói hoặc viết: đáp đúng trọng tâm, hỏi, đề xuất, đồng ý/phản đối, nối tiếp ý người kia, và theo đúng quy ước khi viết thư/tin nhắn.

| Mức | Mô tả |
|:-:|---|
| 0 | Cuộc trao đổi mở cơ hội nhưng con không có câu đáp hay câu chủ động nào phù hợp. |
| 1 | Đáp rất ngắn hoặc hay lạc ý; không chủ động; cuộc trao đổi chỉ do người kia dẫn. |
| 2 | Phần lớn đáp đúng ý; ít chủ động; ít nối với điều người kia vừa nói. |
| 3 | Đáp đúng ý và chủ động đúng như target yêu cầu (hỏi, đề xuất, đồng ý/phản đối có lý do, hoặc trả lời thư đủ ý, đúng quy ước). |
| 4 | Đáp và chủ động tự nhiên; phát triển ý của người kia; giữ cuộc trao đổi đi tới mục tiêu; giọng điệu/quy ước phù hợp suốt. |

*Ranh giới:* Tương tác nói trực tiếp do gia sư quan sát (không lưu audio); AI chỉ đề xuất với trao đổi viết, hoặc transcript trên máy đã được gia sư xác nhận.

### T1 Comprehension - Hiểu nguồn

Hiểu điều nguồn (nghe hoặc đọc) nói ra: ý chính, chi tiết quan trọng, trình tự, quan hệ được nêu và quan điểm.

| Mức | Mô tả |
|:-:|---|
| 0 | Có câu hỏi hiểu nhưng không câu trả lời nào cho thấy con hiểu nguồn. |
| 1 | Bắt được vài chi tiết lẻ; ý chính sai hoặc bỏ sót. |
| 2 | Ý chính đúng một phần, hoặc chi tiết đúng nhưng thiếu ý chính; hiểu sai vài điểm quan trọng. |
| 3 | Xác định đúng ý chính và các chi tiết/quan hệ quan trọng mà target yêu cầu. |
| 4 | Xác định chính xác ý chính, chi tiết và mối nối giữa chúng, kể cả ý ít nổi bật; phân biệt ý chính - ý phụ. |

*Ranh giới:* Nghe và đọc là hai target riêng (theo input_modality). Có thể trả lời bằng tiếng Anh, hoặc tiếng Việt khi chẩn đoán (ghi là điều kiện); lỗi ngôn ngữ trong câu trả lời không tính là lỗi T1. Độ khó của nguồn là điều kiện nhiệm vụ, không phải nhãn CEFR của con.

### T2 Inference - Suy luận

Rút ra điều nguồn không nói thẳng, dựa trên dấu hiệu trong nguồn và chỉ ra được dấu hiệu đó (gồm đoán nghĩa từ, mục đích ngầm, giả định không nói ra).

| Mức | Mô tả |
|:-:|---|
| 0 | Có câu suy luận nhưng câu trả lời chỉ nhắc lại chữ trong bài hoặc lạc đề. |
| 1 | Suy luận phần lớn vô căn cứ hoặc trái với nguồn. |
| 2 | Có vài suy luận hợp lý nhưng không chỉ ra dấu hiệu, hoặc suy quá đà. |
| 3 | Các suy luận yêu cầu đều hợp lý và mỗi ý gắn với ít nhất một dấu hiệu liên quan trong nguồn. |
| 4 | Suy luận hợp lý, bám dấu hiệu cụ thể, và thận trọng đúng mức khi nguồn có thể hiểu nhiều cách. |

*Ranh giới:* Chọn đúng đáp án chưa đủ chứng minh suy luận tốt (FR-07a). Sai do không biết từ được ghi riêng với sai do suy luận khi đủ bằng chứng (FR-07c).

### T4 Causal reasoning - Lập luận nhân quả

Giải thích vì sao/như thế nào sự việc xảy ra: chuỗi nguyên nhân - kết quả, cơ chế, dự đoán từ quan hệ đã biết, và ở mức nhiệm vụ cao hơn là nguyên nhân khác, yếu tố gây nhiễu.

| Mức | Mô tả |
|:-:|---|
| 0 | Cần giải thích nhân quả nhưng bài chỉ mô tả hoặc liệt kê. |
| 1 | Có nêu nguyên nhân nhưng sai, ngược chiều, hoặc không gắn với hiện tượng. |
| 2 | Có ít nhất một liên kết nhân quả đúng; chuỗi chưa đủ, thiếu bước, hoặc coi tương quan là nhân quả mà không bàn. |
| 3 | Chuỗi nhân quả đúng với số liên kết/bước cơ chế mà target yêu cầu; các liên kết được nói rõ. |
| 4 | Chuỗi/cơ chế đầy đủ, chính xác, có bước trung gian; khi phù hợp, nêu điều kiện, nguyên nhân khác hoặc giới hạn. |

*Ranh giới:* Lỗi ngôn ngữ không hạ T4 trừ khi làm không hiểu được quan hệ nhân quả. Thiếu kiến thức chưa được dạy là khoảng trống nội dung, không phải 'tư duy yếu' (PRD 6.6).

### T5 Evidence evaluation - Đánh giá bằng chứng

Đánh giá điều gì là bằng chứng và bằng chứng đó đỡ cho kết luận đến đâu: sự thật hay ý kiến, độ tin cậy của nguồn, đủ hay chưa, giới hạn.

| Mức | Mô tả |
|:-:|---|
| 0 | Cần đánh giá nhưng bài chỉ nhắc lại hoặc đồng ý. |
| 1 | Đánh giá tùy tiện hoặc dựa vào đặc điểm không liên quan (vd. 'có trên mạng nên đúng'). |
| 2 | Phân biệt được một phần bằng chứng với ý kiến, hoặc nêu được điểm mạnh/yếu, nhưng lý do mơ hồ hoặc sai một phần. |
| 3 | Phân loại/đánh giá đúng như target yêu cầu, có lý do liên quan, bám vào nguồn. |
| 4 | Đánh giá chính xác, có lập luận về mức liên quan, độ tin cậy và độ đủ; nêu giới hạn mà không gạt bỏ bằng chứng còn dùng được. |

*Ranh giới:* Không bao giờ chấm quan điểm chính trị/đạo đức của con; chỉ chấm cách dùng thông tin, lý do và giới hạn (PRD 6.6).

### T7 Argumentation - Lập luận bảo vệ quan điểm

Xây dựng một quan điểm: luận điểm, lý do, bằng chứng/ví dụ và mối nối giữa chúng; xử lý ý kiến khác khi nhiệm vụ yêu cầu.

| Mức | Mô tả |
|:-:|---|
| 0 | Cần nêu quan điểm nhưng con không nêu, hoặc không có lý do nào. |
| 1 | Có quan điểm; lý do thiếu, không liên quan hoặc luẩn quẩn. |
| 2 | Có quan điểm và ít nhất một lý do liên quan; phần đỡ còn mỏng, ví dụ không gắn với lý do, hoặc lập luận có lỗ hổng. |
| 3 | Quan điểm rõ, có đủ số lý do và ví dụ/bằng chứng target yêu cầu, mỗi cái đều gắn với luận điểm. |
| 4 | Quan điểm phát triển tốt: lý do riêng biệt, có bằng chứng, mối nối rõ; xử lý ý kiến khác khi phù hợp; không nói quá. |

*Ranh giới:* Không bắt buộc 'hai phía cân bằng' trừ khi nhiệm vụ yêu cầu (PRD §16). Nói trôi chảy không tự nâng T7. Không chấm quan điểm đúng/sai.

### T9 Synthesis - Tổng hợp

Kết hợp thông tin từ hai đối tượng/nguồn trở lên thành một tổng thể mạch lạc: so sánh theo cùng tiêu chí, tích hợp, chỉ ra chỗ giống và khác.

| Mức | Mô tả |
|:-:|---|
| 0 | Cần kết hợp nguồn/đối tượng nhưng chỉ dùng một, hoặc liệt kê riêng rẽ không nối. |
| 1 | Nhắc tới cả hai nhưng mối nối sai hoặc hời hợt. |
| 2 | Có một số điểm so sánh/tích hợp đúng; tiêu chí chưa nhất quán hoặc bỏ sót khác biệt quan trọng. |
| 3 | Tích hợp thông tin từ các nguồn yêu cầu theo cùng tiêu chí; nêu đúng chỗ giống và khác. |
| 4 | Tích hợp theo tiêu chí rõ, chính xác, và rút ra được nhận định chung mà riêng từng nguồn không có. |

*Ranh giới:* Cấu trúc so sánh hơn/nhất thuộc L1; việc chọn và dùng tiêu chí so sánh thuộc T9.

### T11 Judgement - Phán đoán, kết luận

Đưa ra quyết định/kết luận phù hợp với bằng chứng và tiêu chí: cân nhắc phương án, nói rõ mức chắc chắn và điều kiện.

| Mức | Mô tả |
|:-:|---|
| 0 | Cần kết luận/quyết định nhưng con không đưa ra. |
| 1 | Kết luận không gắn với bằng chứng/tiêu chí, hoặc chắc chắn quá mức bằng chứng cho phép. |
| 2 | Kết luận gắn với một phần tiêu chí/bằng chứng; cân nhắc một chiều, hoặc mức chắc chắn chưa khớp bằng chứng. |
| 3 | Kết luận đi ra từ tiêu chí và bằng chứng đã nêu; nói rõ mức chắc chắn và điều kiện chính. |
| 4 | Kết luận được cân nhắc kỹ qua các tiêu chí, có giới hạn phù hợp, và nói rõ điều gì sẽ làm thay đổi kết luận. |

*Ranh giới:* 'Chưa đủ bằng chứng để kết luận' vẫn có thể đạt 3-4 nếu có lý lẽ (PRD 6.6).

### A1 Independence (self-management) - Tự chủ (tự quản lý nhiệm vụ)

Tự quản lý nhiệm vụ: lên kế hoạch cách làm, dùng tài nguyên được cung cấp, tự kiểm tra bài và tự nhận xét. Target A1 chấm chất lượng các hành vi này; lượng hỗ trợ nhận được ghi riêng như điều kiện và tổng hợp ở chỉ số aggregate.

| Mức | Mô tả |
|:-:|---|
| 0 | Nhiệm vụ có bước tự quản (lập kế hoạch, tự kiểm, tự nhận xét) nhưng con không làm. |
| 1 | Có làm nhưng không dùng được: kế hoạch lạc nhiệm vụ, tự kiểm không thấy lỗi đang có, tự nhận xét chung chung ('tốt', 'cố gắng hơn'). |
| 2 | Có ích một phần: chạm tới nhiệm vụ nhưng bỏ sót vấn đề chính, hoặc quá mơ hồ để làm theo. |
| 3 | Làm đúng bước tự quản mà target yêu cầu và khớp với bài thật (vd. nêu đúng một điểm mạnh và một ưu tiên có thật). |
| 4 | Chính xác và làm theo được: chỉ ra vấn đề quan trọng nhất và bước tiếp theo cụ thể, khớp với nhận xét riêng của gia sư. |

*Ranh giới:* AI không bao giờ chấm. 'Không thấy dùng AI trong app' chỉ là AI0-observed, không phải 'đã xác nhận tự làm' (FR-11c). Theo PRD 6.4, A1 là góc nhìn tổng hợp từ điều kiện của các target nền, không phải cổng đệ quy.

### A3 Revision - Sửa bài

Chất lượng thay đổi giữa bài gốc và bản sửa theo các điểm được chỉ ra hoặc phản hồi. Cặp trước - sau tính là một episode.

| Mức | Mô tả |
|:-:|---|
| 0 | Đã chỉ ra chỗ cần sửa nhưng bản sửa không thay đổi gì ở các chỗ đó. |
| 1 | Có sửa nhưng phần lớn không đúng chỗ được chỉ ra, hoặc phát sinh lỗi mới tương đương. |
| 2 | Sửa được một số điểm; số khác giữ nguyên hoặc sửa sai. |
| 3 | Sửa đúng các ưu tiên mà target yêu cầu, không phát sinh lỗi lớn mới. |
| 4 | Sửa đủ mọi ưu tiên; con nói được đã đổi gì và vì sao; áp dụng cách sửa cả ở chỗ không được chỉ ra. |

*Ranh giới:* AI không bao giờ chấm. Bản sửa không bao giờ được tính là first attempt cho target Language/Thinking (FR-14a). Giữ nguyên bản gốc có lý do tốt vẫn là kết quả hợp lệ với phản hồi về lập luận (PRD 6.6).

### A5 Transfer - Vận dụng sang bối cảnh mới

Dùng điều đã học vào bối cảnh mới khi đề bài không nhắc tới. Bức tranh A5 tổng thể lấy từ các bài kiểm tra delayed/transfer của target nền (chỉ số aggregate); target A5 ghi nhận việc tự dùng lại trong một episode transfer.

| Mức | Mô tả |
|:-:|---|
| 0 | Bối cảnh mới có chỗ rõ ràng để dùng điều đã học nhưng con không dùng. |
| 1 | Có dùng nhưng sai cách hoặc không hợp bối cảnh mới. |
| 2 | Có dùng nhưng y nguyên như lúc luyện, chưa điều chỉnh theo bối cảnh mới. |
| 3 | Dùng phù hợp trong bối cảnh mới dù đề bài không nhắc tới. |
| 4 | Dùng phù hợp và điều chỉnh theo yêu cầu của bối cảnh mới (thể loại, lĩnh vực hoặc người nhận khác). |

*Ranh giới:* AI không bao giờ chấm. Chỉ đổi tên chủ đề chưa đủ là transfer; gia sư ghi rõ bối cảnh/nguồn/yêu cầu khác thế nào (FR-17b). Một episode có thể vừa là delayed vừa là transfer nhưng chỉ đếm một lần.

### X1 Fluency - Độ trôi chảy

Duy trì lời nói ở nhịp người nghe theo được, ngắt nghỉ không làm đứt ý; gia sư đánh giá trực tiếp trong buổi.

| Mức | Mô tả |
|:-:|---|
| 0 | Đã yêu cầu nói một lượt dài nhưng con không tạo được lời nói liền mạch. |
| 1 | Lời nói rất rời rạc; ngắt lâu ở hầu hết các câu; khó theo ý. |
| 2 | Có những đoạn ngắn trôi chảy nhưng hay ngắt lâu hoặc nói lại từ đầu, làm đứt ý. |
| 3 | Nói được đủ độ dài target yêu cầu; ngắt chủ yếu để nghĩ và không làm đứt ý. |
| 4 | Nhịp đều trong suốt độ dài yêu cầu; ngắt nghỉ tự nhiên; diễn đạt lại trơn tru. |

*Ranh giới:* Chỉ gia sư đánh giá trực tiếp; AI không bao giờ chấm. Chỉ số trên máy (thời lượng nói, số lần ngắt dài) chỉ để tham khảo, nằm ở AGG-A-X1-SPEECH-METRICS. Không audio nào rời khỏi máy.

### X2 Pronunciation / intelligibility - Phát âm / mức dễ hiểu

Người nghe hiểu lời con nói dễ đến đâu: âm, âm cuối, trọng âm từ và ngữ điệu, xét theo mức dễ hiểu chứ không theo giọng; gia sư đánh giá trực tiếp.

| Mức | Mô tả |
|:-:|---|
| 0 | Con có nói nhưng người nghe quen giọng Anh của người Việt vẫn không hiểu được thông điệp. |
| 1 | Thường khó hiểu; phải hỏi lại nhiều lần; từ khóa phát âm sai. |
| 2 | Phần lớn hiểu được nhưng phải cố; hay mất âm cuối hoặc đuôi -s/-ed, gây hiểu nhầm đôi chỗ. |
| 3 | Gia sư hiểu được suốt lượt nói; đuôi -s/-ed và trọng âm từ khóa nghe rõ ở phần lớn chỗ cần; giọng không cản trở nghĩa. |
| 4 | Rất dễ hiểu; âm cuối và trọng âm rõ nhất quán; ngữ điệu giúp truyền đạt ý. |

*Ranh giới:* Chỉ gia sư đánh giá trực tiếp; AI không bao giờ chấm (PRD §3.3 loại chấm phát âm tự động). Không trừ điểm vì giọng.

## 4. Track A - An: 37 target (active)

Ưu tiên của Track A: nói/viết chủ động, giải thích và nhân quả, tự chủ, ghi nhớ lâu. Học liệu thiên về khoa học và tự nhiên. Target ngữ pháp (L1) chấm trên **bài viết**; độ đúng ngữ pháp khi nói được theo dõi bằng chỉ số aggregate do gia sư gắn lỗi, vì STT trên máy có thể tự 'sửa' lỗi.

#### L1 Grammar - Ngữ pháp (6)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-L1-SENT-W` | **Câu đơn, câu ghép đúng khi viết**<br><sub>Simple and compound sentence control in writing</sub> | A2 / free writing of at least 8 sentences (about 60-100 words) on a familiar topic | A2 | Không cố định -> Viết | 1. Ít nhất 80% số câu đúng trật tự từ và hòa hợp chủ - vị.<br>2. Có ít nhất 3 câu nối hai mệnh đề bằng and / but / so / because. *(máy)* | ✓ | WRT01, LNG07 |
| `A-L1-PAST-W` | **Quá khứ đơn khi viết kể/tường thuật**<br><sub>Past simple in written narrative or report</sub> | A2 / written narrative or experiment report of at least 80 words with at least 6 past-time contexts | A2 | Không cố định -> Viết | 1. Dùng đúng quá khứ đơn ở ít nhất 80% chỗ bắt buộc nói về quá khứ.<br>2. Có ít nhất 3 động từ bất quy tắc khác nhau ở dạng quá khứ (vd. went, saw, made, found). *(máy)* | ✓ | LNG01, WRT05 |
| `A-L1-COMP-W` | **So sánh hơn và so sánh nhất khi viết**<br><sub>Comparatives and superlatives in writing</sub> | A2 / written comparison of two or three things with at least 4 comparative contexts | A2 | Không cố định -> Viết | 1. Ít nhất 80% dạng so sánh hơn/nhất đúng (-er / more, than, the -est / the most).<br>2. Dùng ít nhất 2 kiểu cấu trúc so sánh khác nhau (vd. -er than, more ... than, the most, as ... as). *(máy)* | ✓ | LNG02, SPK08 |
| `A-L1-PRESPERF-W` | **Hiện tại hoàn thành: trải nghiệm và thay đổi gần đây**<br><sub>Present perfect for experience and recent change</sub> | A2 / short written text about experiences or observed changes with at least 3 present-perfect contexts | A2 | Không cố định -> Viết | 1. have / has + V3 đúng dạng ở ít nhất 75% số lần dùng.<br>2. Ít nhất 3 lần dùng đúng nghĩa (trải nghiệm, hoặc thay đổi còn kết quả ở hiện tại).<br>3. Không dùng hiện tại hoàn thành với mốc thời gian đã kết thúc (yesterday, ago, last week, in 2020). *(máy)* | ✓ | LNG05 |
| `A-L1-FUTURE-W` | **Will và going to để dự đoán, nói kế hoạch**<br><sub>Will and going to for predictions and plans</sub> | A2 / written predictions or plans with at least 4 future contexts | A2 | Không cố định -> Viết | 1. will / going to + động từ nguyên mẫu đúng dạng ở ít nhất 80% số lần dùng.<br>2. Dùng phù hợp cả will (dự đoán, quyết định) và going to (kế hoạch, dự đoán từ dấu hiệu hiện tại) ít nhất một lần mỗi loại. | ✓ | LNG04, SPK11 |
| `A-L1-PASSIVE-W` | **Câu bị động khi mô tả quá trình**<br><sub>Present and past simple passive in process descriptions</sub> | B1 / written process description (e.g. how paper is made) with at least 4 passive contexts | B1 | Không cố định -> Viết | 1. be + V3 đúng dạng ở ít nhất 75% số lần dùng bị động.<br>2. Bài có ít nhất 3 mệnh đề bị động. *(máy)* | ✓ | LNG06 |

#### L2 Lexical range & precision - Từ vựng: độ rộng và độ chính xác (3)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-L2-CHUNKS` | **Dùng từ/cụm từ mục tiêu của inquiry**<br><sub>Uses the inquiry's target words and chunks</sub> | A2+ / one production (at least 45 s spoken or 60 words written) on the inquiry topic; inquiry list of 6-10 target items | A2+ | Không cố định -> Nói hoặc viết | 1. Có ít nhất 4 mục khác nhau trong danh sách của inquiry (tính cả dạng biến đổi). *(máy)*<br>2. Ít nhất 80% số mục đã dùng đúng nghĩa và đúng dạng. | ✓ | LNG08 |
| `A-L2-PRECISE` | **Dùng từ chính xác ngoài danh sách đã học**<br><sub>Precise everyday and science words beyond the taught list</sub> | A2+ / free production of at least 80 words or 60 s on a familiar topic | A2+ | Không cố định -> Nói hoặc viết | 1. Có ít nhất 3 từ cụ thể ở chỗ có thể dùng từ chung chung, không tính từ trong danh sách inquiry.<br>2. Không quá 1 lỗi chọn từ/dạng từ làm sai hoặc mất nghĩa. | ✓ | mới |
| `A-L2-COMPENSATE-S` | **Xoay xở bằng tiếng Anh khi thiếu từ**<br><sub>Bridges a missing word in English</sub> | B1 / 2-3 min spoken explanation of a topic containing at least one concept the learner lacks a word for (tutor-checked) | B1 | Không cố định -> Nói | 1. Ít nhất 1 lần diễn đạt vòng/định nghĩa/mô tả thành công bằng tiếng Anh cho từ bị thiếu.<br>2. Không quá 1 lần chuyển sang tiếng Việt cho từ nội dung trong lượt nói. *(máy)* | ✓ | SPK14 |

#### L3 Organisation & cohesion - Tổ chức và liên kết (4)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-L3-SEQ-S` | **Nói theo trình tự các bước/sự việc**<br><sub>Sequences steps or events when speaking</sub> | A2 / 45-60 s spoken account of a process or past event with at least 4 steps or events | A2 | Không cố định -> Nói | 1. Có ít nhất 4 bước/sự việc theo đúng thứ tự.<br>2. Dùng ít nhất 3 từ chỉ trình tự khác nhau (first, then, next, after that, finally, when ...). *(máy)* | ✓ | SPK03, SPK04 |
| `A-L3-CAUSE-S` | **Nói có từ nối nguyên nhân - kết quả**<br><sub>Signals cause and result when speaking</sub> | A2+ / spoken explanation of at least 45 s containing at least 2 cause-effect relations | A2+ | Không cố định -> Nói | 1. Dùng ít nhất 2 từ nối nguyên nhân/kết quả khác nhau (because, so, as a result, that's why, causes, leads to). *(máy)*<br>2. Mỗi từ nối đều nối đúng chiều nguyên nhân -> kết quả. | ✓ | SPK07 |
| `A-L3-CAUSE-W` | **Viết có từ nối nguyên nhân - kết quả**<br><sub>Signals cause and result in writing</sub> | A2+ / written explanation of 80-100 words containing at least 2 cause-effect relations | A2+ | Không cố định -> Viết | 1. Dùng ít nhất 2 từ nối nguyên nhân/kết quả khác nhau (because, so, as a result, therefore, leads to). *(máy)*<br>2. Mỗi từ nối đều nối đúng chiều nguyên nhân -> kết quả. | ✓ | WRT06 |
| `A-L3-PARA-W` | **Tổ chức một đoạn văn**<br><sub>Organises a paragraph</sub> | A2+ / one paragraph of 80-100 words (describe, narrate, explain or give an opinion) | A2+ | Không cố định -> Viết | 1. Có câu chủ đề nêu ý, ít nhất 3 câu triển khai và một câu kết.<br>2. Có ít nhất 4 từ nối khác nhau thuộc ít nhất 2 chức năng (bổ sung, đối lập, nguyên nhân/kết quả, trình tự, ví dụ). *(máy)*<br>3. Không có từ nối nào trái với quan hệ giữa hai ý nó nối. | ✓ | WRT03, WRT05, WRT07, WRT08 |

#### L4 Clarity - Độ rõ ràng (3)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-L4-DESC-S` | **Mô tả rõ ràng khi nói**<br><sub>Describes something clearly when speaking</sub> | A2 / 45-60 s spoken description of an animal, object, place or picture | A2 | Không cố định -> Nói | 1. Nói rõ đó là gì (tên hoặc loại) ngay đầu.<br>2. Có ít nhất 4 chi tiết liên quan thuộc ít nhất 2 khía cạnh (hình dáng, nơi sống/vị trí, hoạt động/chức năng, đặc điểm riêng). | ✓ | SPK02 |
| `A-L4-DESC-W` | **Viết mô tả rõ ràng, có chi tiết**<br><sub>Writes a clear, detailed description</sub> | A2 / written description of 60-90 words | A2 | Không cố định -> Viết | 1. Có ít nhất 4 chi tiết liên quan thuộc ít nhất 2 khía cạnh.<br>2. Có ít nhất 3 câu được mở rộng bằng chi tiết nơi chốn, thời gian, lý do hoặc tính chất (tính từ, cụm giới từ, mệnh đề because). | ✓ | WRT02, WRT04 |
| `A-L4-PROCESS-S` | **Giải thích rõ một quá trình quen thuộc**<br><sub>Explains clearly how a familiar process works</sub> | A2+ / 45-60 s spoken explanation of a familiar, previously studied science process with at least 3 steps | A2+ | Không cố định -> Nói | 1. Nêu tên quá trình và kết quả cuối ở đầu hoặc cuối lượt nói.<br>2. Có ít nhất 3 bước theo thứ tự người nghe theo được. | ✓ | SPK06 |

#### L7 Mediation - Chuyển tải thông tin (Mediation) (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-L7-RETELL-S` | **Kể lại ý chính của bài đọc/clip**<br><sub>Retells the main points of a text or clip</sub> | A2+ / 45-90 s spoken retelling of a 150-250-word text or 1-2 min clip just studied | A2+ | Nguồn đọc/nghe -> Nói | 1. Truyền đạt đúng ý chính và ít nhất 3 ý quan trọng của nguồn.<br>2. Phần lớn bằng lời của mình: không có chuỗi từ 8 từ liên tiếp trở lên chép nguyên từ nguồn. *(máy)* | ✓ | SPK05, LRN03 |
| `A-L7-SUMMARY-W` | **Viết tóm tắt ngắn một văn bản**<br><sub>Writes a short summary of a text</sub> | B1 / 3-5-sentence written summary of a 200-300-word text | B1 | Đọc -> Viết | 1. Có ý chính và ít nhất 3/4 ý quan trọng theo đáp án của gia sư.<br>2. Không có chuỗi 8 từ liên tiếp trở lên chép nguyên từ nguồn. *(máy)*<br>3. Không thêm chi tiết phụ hoặc ý kiến riêng. | ✓ | RDG08 |

#### L8 Interaction - Tương tác (3)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-L8-EXCHANGE-S` | **Hỏi - đáp trong trao đổi ngắn**<br><sub>Answers and asks in a short spoken exchange</sub> | A2+ / live 3-4 min question-and-answer exchange with the tutor on a familiar topic | A2+ | Không cố định -> Nói | 1. Ít nhất 8/10 câu hỏi được trả lời bằng mệnh đề đầy đủ, đúng ý, không chỉ một từ.<br>2. Chủ động hỏi ít nhất 2 câu hỏi tiếp/hỏi làm rõ phù hợp mà không được mời. | ✓ | SPK01, SPK12 |
| `A-L8-DISCUSS-S` | **Đề xuất, phản hồi đề xuất để đi đến quyết định**<br><sub>Makes and responds to suggestions to reach a decision</sub> | B1 / 2-3 min collaborative decision task with the tutor (choose between options), as in a school-exam discussion part | B1 | Không cố định -> Nói | 1. Đưa ra ít nhất 2 đề xuất.<br>2. Phản hồi ít nhất 2 ý của người kia bằng đồng ý/phản đối kèm lý do.<br>3. Đề xuất hoặc chấp nhận một quyết định trước khi hết giờ. | ✓ | mới |
| `A-L8-MESSAGE-W` | **Trả lời email/tin nhắn**<br><sub>Replies to an email or message</sub> | A2+ / 50-80-word reply to an email or message containing 3 content points | A2+ | Đọc -> Viết | 1. Trả lời đủ cả 3 ý trong thư/tin nhắn nhận được.<br>2. Có lời chào mở đầu và lời chào kết. *(máy)*<br>3. Giọng văn hợp với người nhận (bạn bè hay thầy cô). | ✓ | mới |

#### T1 Comprehension - Hiểu nguồn (3)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-T1-TEXT-R` | **Hiểu một văn bản thông tin ngắn (đọc)**<br><sub>Understands a short informational text (reading)</sub> | TL2 / one 150-250-word informational text (graded source), main-idea and detail items | - | Đọc -> Nói hoặc viết | 1. Xác định đúng ý chính (chọn đáp án, hoặc tự diễn đạt và được chấm). *(máy)*<br>2. Đúng ít nhất 80% câu hỏi chi tiết, gồm cả câu về trình tự và quan hệ nhân quả được nêu. *(máy)* | ✓ | RDG01, RDG02, RDG05, RDG06, LRN03 |
| `A-T1-TEXT-L` | **Hiểu một bài nói/clip ngắn (nghe)**<br><sub>Understands a short talk or clip (listening)</sub> | TL2 / 1-2 min clear recorded talk or clip, at most 2 plays, transcript hidden | - | Nghe -> Nói hoặc viết | 1. Xác định đúng ý chính. *(máy)*<br>2. Đúng ít nhất 75% câu hỏi chi tiết (số, tên, sự kiện). *(máy)* | ✓ | LST01, LST02 |
| `A-T1-PROCESS-L` | **Theo dõi lời giải thích nhiều bước (nghe)**<br><sub>Follows a multi-step spoken explanation (listening)</sub> | TL2 / 2-3 min spoken explanation with at least 4 linked steps, at most 2 plays, transcript hidden | - | Nghe -> Nói hoặc viết | 1. Sắp xếp đúng thứ tự ít nhất 4 bước. *(máy)*<br>2. Đúng ít nhất 70% câu hỏi về mối nối giữa các bước. *(máy)* | ✓ | LST03, LST04, LST05 |

#### T2 Inference - Suy luận (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-T2-INFER-R` | **Suy luận điều không nói thẳng (đọc)**<br><sub>Infers unstated meaning from a text (reading)</sub> | TL2 / 150-300-word text with at least 3 inference items, including at least 2 unknown words to work out | - | Đọc -> Nói hoặc viết | 1. Ít nhất 2/3 câu suy luận trả lời hợp lý, mỗi câu có chỉ ra dấu hiệu trong bài.<br>2. Đoán đúng nghĩa ít nhất 2/3 từ mới nhờ ngữ cảnh. *(máy)* | ✓ | RDG03, RDG04, RDG06 |
| `A-T2-INFER-L` | **Suy luận mục đích, ý ngầm của người nói (nghe)**<br><sub>Infers speaker purpose and unstated meaning (listening)</sub> | TL2 / 1-2 min clip with at least 3 items on unstated meaning or speaker purpose, transcript hidden | - | Nghe -> Nói hoặc viết | 1. Ít nhất 2/3 câu suy luận/mục đích trả lời hợp lý. *(máy)*<br>2. Với ít nhất 1 câu, chỉ ra được lời nào của người nói làm căn cứ. |  | LST06, LST07 |

#### T4 Causal reasoning - Lập luận nhân quả (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-T4-CAUSE` | **Giải thích chuỗi nguyên nhân - kết quả**<br><sub>Explains a cause-effect chain</sub> | TL2 / explain a familiar natural phenomenon with a chain of at least 2 cause-effect links | - | Không cố định -> Nói hoặc viết | 1. Có ít nhất 2 liên kết nhân quả đúng với nội dung đã học.<br>2. Các liên kết tạo thành chuỗi (kết quả của bước trước là nguyên nhân của bước sau), không có bước ngược hoặc thiếu làm đứt chuỗi. | ✓ | SPK07, SPK06, WRT06 |
| `A-T4-PREDICT` | **Dự đoán kết quả từ quy luật nhân quả**<br><sub>Predicts an outcome from a cause-effect rule</sub> | TL2 / predict the outcome of a changed condition in a familiar system (e.g. 'what happens to the plant if ...') | - | Không cố định -> Nói hoặc viết | 1. Dự đoán khớp với quan hệ nhân quả đã học.<br>2. Nêu được lý do nối điều kiện thay đổi với kết quả. |  | SPK11 |

#### T5 Evidence evaluation - Đánh giá bằng chứng (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-T5-FACTOP-R` | **Phân biệt sự thật và ý kiến**<br><sub>Tells fact from opinion in a short text</sub> | TL1 / short text (article, advert or post) with at least 4 statements to classify | - | Đọc -> Nói hoặc viết | 1. Phân loại đúng ít nhất 75% số câu. *(máy)*<br>2. Giải thích được ít nhất 2 lựa chọn (vd. kiểm chứng được; có từ thể hiện cảm xúc/đánh giá). |  | RDG07 |

#### T7 Argumentation - Lập luận bảo vệ quan điểm (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-T7-OPINION` | **Nêu quan điểm có lý do và ví dụ**<br><sub>Gives an opinion with reasons and an example</sub> | TL2 / opinion question on a familiar topic, spoken (at least 60 s) or written (100-120 words) | - | Không cố định -> Nói hoặc viết | 1. Nêu rõ quan điểm.<br>2. Có ít nhất 2 lý do khác nhau, liên quan.<br>3. Có ít nhất 1 ví dụ cụ thể gắn với một lý do. | ✓ | SPK09, SPK10, WRT07 |

#### T9 Synthesis - Tổng hợp (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-T9-COMPARE` | **So sánh hai đối tượng theo cùng tiêu chí**<br><sub>Compares two things on shared criteria</sub> | TL2 / compare two items using two short sources or one table | - | Nguồn đọc/nghe -> Nói hoặc viết | 1. So sánh ít nhất 3 điểm, mỗi điểm dùng cùng một tiêu chí cho cả hai.<br>2. Nêu đúng ít nhất 1 điểm giống và 1 điểm khác theo nguồn. | ✓ | SPK08 |

#### A1 Independence (self-management) - Tự chủ (tự quản lý nhiệm vụ) (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-A1-SELFASSESS` | **Tự nhận xét bài sau lần làm đầu**<br><sub>Judges own work after a first attempt</sub> | Condition-based / short self-review form (English or Vietnamese) after a first attempt, before feedback is shown | - | Không cố định -> Nói hoặc viết | 1. Nêu ít nhất 1 điểm mạnh và 1 ưu tiên cụ thể gắn với bài (không phải 'tốt', 'cố gắng hơn').<br>2. Ưu tiên con nêu trùng với một trong 3 nhóm phản hồi ưu tiên của gia sư. *(máy)* |  | LRN02 |

#### A3 Revision - Sửa bài (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-A3-HINTFIX` | **Tự sửa lỗi theo gợi ý loại lỗi**<br><sub>Fixes own errors from category hints</sub> | Condition-based / revision of own text or transcript with category hints only; no corrected forms given | - | Không cố định -> Nói hoặc viết | 1. Sửa đúng ít nhất 60% số lỗi được gợi ý.<br>2. Không phát sinh lỗi mới ở những chỗ đã sửa. | ✓ | WRT09, LRN01 |
| `A-A3-REDRAFT` | **Viết lại bài theo ưu tiên phản hồi**<br><sub>Redrafts after feedback priorities</sub> | Condition-based / second draft after 1-3 named feedback priorities | - | Không cố định -> Viết | 1. Mỗi ưu tiên được nêu đều cải thiện ở bản 2.<br>2. Ghi một dòng cho mỗi ưu tiên: đã sửa gì (tiếng Anh hoặc tiếng Việt).<br>3. Không phát sinh lỗi lớn mới. | ✓ | WRT10 |

#### A5 Transfer - Vận dụng sang bối cảnh mới (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-A5-REUSE` | **Tự dùng lại điều đã học ở nhiệm vụ mới**<br><sub>Reuses a learned item or strategy in a new task</sub> | Condition-based / transfer-tagged episode; new domain or text type; task wording does not name the item | - | Không cố định -> Nói hoặc viết | 1. Xuất hiện một mục/chiến lược đã được xác nhận trong danh sách của con. *(máy)*<br>2. Được dùng phù hợp với bối cảnh mới. |  | mới |

#### X1 Fluency - Độ trôi chảy (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-X1-TURN` | **Duy trì một lượt nói dài**<br><sub>Keeps a spoken turn going</sub> | B1 / 60-90 s live turn on a familiar topic after at most 1 min planning | B1 | Không cố định -> Nói | 1. Nói được ít nhất 60 giây đúng chủ đề.<br>2. Không quá 3 lần im lặng dài (trên 3 giây) làm đứt ý.<br>3. Khi ngập ngừng thì diễn đạt lại chứ không bỏ dở câu. | ✓ | SPK13 |

#### X2 Pronunciation / intelligibility - Phát âm / mức dễ hiểu (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `A-X2-INTELL` | **Nói dễ hiểu, rõ âm cuối**<br><sub>Speaks intelligibly, with clear word endings</sub> | B1 / at least 60 s live extended turn with the tutor present | B1 | Không cố định -> Nói | 1. Gia sư phải hỏi lại không quá 1 lần mỗi phút.<br>2. Âm cuối và đuôi -s/-ed nghe rõ ở phần lớn chỗ cần trong mẫu.<br>3. Từ khóa của chủ đề (kể cả danh sách inquiry) đúng trọng âm, nhận ra được. | ✓ | mới |

## 5. Track B - Nguyên: 33 target (bản nháp 2027)

Bản nháp để rà với gia sư trước khi bật vào hè 2027. Trọng tâm: rõ ràng, kiểm soát ngữ pháp, suy luận, đánh giá bằng chứng, nhân quả, lập luận, tổng hợp, kết luận có điều kiện, vận dụng. Inquiry theo tỷ lệ 70% xã hội/nhân văn - 30% khoa học tự nhiên; với T4, T5, T9, T11, bộ bằng chứng transfer phải có ít nhất một bối cảnh khoa học tự nhiên (PRD §6.4). Ghi chú 'Inquiry n' trong JSON trỏ tới danh mục 10 inquiry gợi ý ở PRD §11.3.

#### L1 Grammar - Ngữ pháp (4)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-L1-COMPLEX-W` | **Câu phức chính xác trong bài viết dài**<br><sub>Accurate complex sentences in extended writing</sub> | B2 / 250-350-word argumentative or explanatory text | B2 | Không cố định -> Viết | 1. Có ít nhất 5 câu phức thuộc ít nhất 2 loại mệnh đề khác nhau. *(máy)*<br>2. Ít nhất 90% mệnh đề không có lỗi làm ảnh hưởng nghĩa.<br>3. Không có quy tắc ngữ pháp nào bị sai từ 3 lần trở lên trong bài. | ✓ | mới |
| `B-L1-REPORT-W` | **Dẫn lời, quy nguồn khi viết**<br><sub>Reporting and attributing source content</sub> | B2 / source-based paragraph citing at least 2 sources | B2 | Đọc -> Viết | 1. Có ít nhất 3 cấu trúc dẫn lời quy ý cho nguồn. *(máy)*<br>2. Ít nhất 80% cấu trúc động từ dẫn lời đúng ngữ pháp (vd. suggest + -ing / that, không phải *suggest to). | ✓ | mới |
| `B-L1-HYPO-W` | **Câu điều kiện, modal hoàn thành để nêu giả thuyết**<br><sub>Conditionals and modal perfects for hypotheses</sub> | B2 / written causal or hypothetical discussion with at least 3 hypothetical contexts | B2 | Không cố định -> Viết | 1. Có ít nhất 3 cấu trúc giả định/phản thực. *(máy)*<br>2. Ít nhất 80% đúng dạng và đúng mốc thời gian theo nghĩa. |  | mới |
| `B-L1-TRANSFORM-W` | **Viết lại câu giữ nguyên nghĩa**<br><sub>Rewrite sentences keeping the meaning</sub> | B1-B2 / 8-10 sentence-transformation items in exam style | B1-B2 | Không cố định -> Viết | 1. Ít nhất 80% câu giữ đúng nghĩa và đúng ngữ pháp (có danh sách đáp án chấp nhận). *(máy)*<br>2. Không có lỗi ở chính cấu trúc cần dùng trong các câu được tính đúng. | ✓ | mới |

#### L2 Lexical range & precision - Từ vựng: độ rộng và độ chính xác (3)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-L2-PRECISE` | **Từ vựng chủ đề chính xác, kết hợp từ đúng**<br><sub>Precise topic vocabulary and collocation</sub> | B2+ / 250-350-word text or 2-3 min talk on an inquiry topic | B2+ | Không cố định -> Nói hoặc viết | 1. Không quá 1 lỗi chọn từ/kết hợp từ ảnh hưởng nghĩa.<br>2. Khái niệm chính được diễn đạt bằng thuật ngữ chính xác thay vì từ chung chung.<br>3. Không có từ nội dung nào lặp quá 3 lần trong một đoạn khi có từ thay thế phù hợp. *(máy)* | ✓ | mới |
| `B-L2-STANCE` | **Ngôn ngữ rào đón, thể hiện mức chắc chắn**<br><sub>Hedging and stance language</sub> | C1 / argument or report where the evidence is mixed | C1 | Không cố định -> Nói hoặc viết | 1. Dùng ít nhất 3 phương tiện rào đón/thể hiện thái độ. *(máy)*<br>2. Không nói quá hoặc nói non ngoài ý (vd. dùng 'proves' khi định nói 'suggests'). | ✓ | mới |
| `B-L2-CLOZE` | **Chọn từ, dạng từ đúng trong ngữ cảnh (điền đoạn văn)**<br><sub>Word choice and word form in context (cloze)</sub> | B1-B2 / 150-200-word passage with 6-8 gaps (vocabulary, collocation, word form, preposition) | B1-B2 | Đọc -> Nói hoặc viết | 1. Đúng ít nhất 75% số chỗ trống. *(máy)*<br>2. Câu dạng từ (word form): đúng ít nhất 2/3. *(máy)* | ✓ | mới |

#### L3 Organisation & cohesion - Tổ chức và liên kết (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-L3-ESSAY-W` | **Tổ chức bài luận nhiều đoạn**<br><sub>Organises a multi-paragraph essay</sub> | B2 / 250-350-word multi-paragraph essay | B2 | Không cố định -> Viết | 1. Có luận đề ở mở bài; mỗi đoạn thân có câu chủ đề phát triển luận đề.<br>2. Dùng đúng ít nhất 3 loại phương tiện liên kết ngoài từ nối cơ bản (từ quy chiếu như 'this evidence', thay thế, từ nhượng bộ).<br>3. Kết bài đi ra từ thân bài, không thêm ý mới thiếu căn cứ. | ✓ | mới |
| `B-L3-TALK-S` | **Cấu trúc một bài trình bày nói**<br><sub>Structures a spoken presentation</sub> | B2 / 2-3 min spoken presentation on an inquiry question | B2 | Không cố định -> Nói | 1. Giới thiệu bố cục ngay đầu.<br>2. Có ít nhất 3 cụm báo hiệu chuyển ý (firstly, moving on to, the second reason, to sum up). *(máy)*<br>3. Các ý được triển khai đúng thứ tự đã giới thiệu. |  | mới |

#### L4 Clarity - Độ rõ ràng (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-L4-CLEAR-W` | **Viết rõ: nêu thẳng câu trả lời, không mơ hồ**<br><sub>States the answer explicitly and unambiguously in writing</sub> | B2+ / 150-300-word written answer to an inquiry question | B2+ | Không cố định -> Viết | 1. Câu trả lời/luận điểm chính được nêu thẳng trong hai câu đầu.<br>2. Không quá 1 câu bị đánh dấu mơ hồ (it/this không rõ chỉ gì, câu quá tải). | ✓ | mới |
| `B-L4-EXPLAIN-S` | **Giải thích ý phức tạp để người nghe nhắc lại được**<br><sub>Explains a complex idea so a listener can restate it</sub> | B2+ / 2-3 min spoken explanation of a concept from a source to a non-expert | B2+ | Nguồn đọc/nghe -> Nói | 1. Người nghe (gia sư) nhắc lại đúng ý chính trong một câu.<br>2. Ý trừu tượng được cụ thể hóa bằng ít nhất 1 ví dụ hoặc so sánh. | ✓ | mới |

#### L7 Mediation - Chuyển tải thông tin (Mediation) (3)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-L7-RELAY-W` | **Tóm tắt lập luận của một nguồn cho người đọc**<br><sub>Summarises a source's argument for a reader</sub> | B2 / 120-180-word summary of a 600-900-word opinion or feature article for a named reader | B2 | Đọc -> Viết | 1. Chuyển đúng luận điểm chính và ít nhất 3 lý do/bằng chứng chính của nguồn.<br>2. Thể hiện đúng lập trường của nguồn (không biến ý kiến thành sự thật).<br>3. Không có chuỗi 10 từ liên tiếp trở lên chép nguyên từ nguồn. *(máy)* | ✓ | mới |
| `B-L7-DATA` | **Giải thích số liệu từ biểu đồ/bảng**<br><sub>Explains data from a chart or table</sub> | B2 / one chart or table from an inquiry source; 120-180 words or 2 min spoken | B2 | Đọc -> Nói hoặc viết | 1. Mô tả đúng ít nhất 2 xu hướng/so sánh chính, có số liệu.<br>2. Dùng đúng ngôn ngữ mô tả số liệu (rise, fall, peak, roughly half, compared with). | ✓ | mới |
| `B-L7-XLING` | **Chuyển nội dung nguồn tiếng Việt sang tiếng Anh**<br><sub>Relays a Vietnamese source in English</sub> | B2 / 400-600-word Vietnamese text; 100-150-word English relay | B2 | Đọc -> Viết | 1. Chuyển đúng ít nhất 3 ý chính.<br>2. Không quá 1 chỗ dịch sát chữ làm khó hiểu. |  | mới |

#### L8 Interaction - Tương tác (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-L8-DISCUSS-S` | **Phát triển và phản biện ý người khác khi thảo luận**<br><sub>Builds on and challenges others in discussion</sub> | B2 / 6-10 min live discussion of an inquiry question with the tutor | B2 | Không cố định -> Nói | 1. Phát triển hoặc dẫn lại ít nhất 2 ý của người kia.<br>2. Phản đối lịch sự ít nhất 1 ý, có lý do.<br>3. Hỏi ít nhất 1 câu làm rõ/chất vấn giúp cuộc thảo luận đi tiếp. | ✓ | mới |
| `B-L8-EMAIL-W` | **Viết email trang trọng**<br><sub>Writes a formal email</sub> | B2 / 150-200-word formal email covering 3-4 content points | B2 | Đọc -> Viết | 1. Trình bày đủ các ý yêu cầu.<br>2. Giọng văn trang trọng nhất quán: không viết tắt/tiếng lóng, mở và kết trang trọng. *(máy)*<br>3. Mục đích nêu rõ ngay đoạn đầu. |  | mới |

#### T1 Comprehension - Hiểu nguồn (3)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-T1-ARG-R` | **Nhận ra luận điểm, lý do, lập trường của người viết (đọc)**<br><sub>Identifies a writer's claim, reasons and stance (reading)</sub> | TL3 / 600-900-word opinion or feature article, or two shorter texts on one issue | - | Đọc -> Nói hoặc viết | 1. Xác định đúng luận điểm chính của người viết.<br>2. Xác định đúng ít nhất 3 lý do/bằng chứng người viết dùng.<br>3. Xác định đúng lập trường/thái độ của người viết. *(máy)* | ✓ | mới |
| `B-T1-ARG-L` | **Nhận ra luận điểm, lý do, lập trường của người nói (nghe)**<br><sub>Identifies a speaker's claim, reasons and stance (listening)</sub> | TL3 / 4-6 min podcast, talk or interview, at most 2 plays, transcript hidden | - | Nghe -> Nói hoặc viết | 1. Xác định đúng luận điểm chính của người nói.<br>2. Xác định đúng ít nhất 3 lý do/bằng chứng.<br>3. Xác định đúng lập trường/thái độ của người nói. *(máy)* | ✓ | mới |
| `B-T1-EXAM-R` | **Đọc hiểu đoạn văn dạng đề thi vào 10**<br><sub>Reading comprehension in entrance-exam format</sub> | TL2-TL3 / unseen 250-350-word passage at exam difficulty, 5-8 multiple-choice items, about 12 minutes | - | Đọc -> Nói hoặc viết | 1. Đúng ít nhất 80% số câu. *(máy)*<br>2. Với ít nhất 2/3 câu suy luận hoặc đoán nghĩa từ, chỉ ra được câu trong bài làm căn cứ. | ✓ | mới |

#### T2 Inference - Suy luận (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-T2-ASSUME-R` | **Suy ra giả định, hàm ý và cách đóng khung**<br><sub>Infers assumptions, implications and framing</sub> | TL3 / one or two texts (e.g. two reports of the same event) | - | Đọc -> Nói hoặc viết | 1. Chỉ ra ít nhất 1 giả định/hàm ý/cách đóng khung hợp lý không được nói ra.<br>2. Dẫn đúng câu chữ hoặc cách chọn thông tin trong bài làm căn cứ.<br>3. Không trình bày suy luận như thể nguồn đã nói thẳng. | ✓ | mới |

#### T4 Causal reasoning - Lập luận nhân quả (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-T4-MECH` | **Giải thích cơ chế, phân biệt tương quan với nhân quả**<br><sub>Explains a mechanism and separates correlation from causation</sub> | TL3 / explain a mechanism or experiment result in a natural-science or social context | - | Nguồn đọc/nghe -> Nói hoặc viết | 1. Chuỗi nhân quả có ít nhất 1 bước cơ chế trung gian (không chỉ A -> Z).<br>2. Khi số liệu chỉ cho thấy tương quan thì nói rõ và không khẳng định nhân quả. | ✓ | mới |
| `B-T4-ALT` | **Xét giải thích khác và yếu tố gây nhiễu**<br><sub>Considers alternative explanations and confounders</sub> | TL4 / phenomenon or result with at least two plausible explanations | - | Nguồn đọc/nghe -> Nói hoặc viết | 1. Nêu ít nhất 1 giải thích khác hoặc yếu tố gây nhiễu hợp lý.<br>2. Nói được bằng chứng nào giúp phân biệt các giải thích. | ✓ | mới |

#### T5 Evidence evaluation - Đánh giá bằng chứng (3)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-T5-DATAOP` | **Tách dữ liệu khỏi bình luận**<br><sub>Separates data from commentary</sub> | TL3 / opinion piece or report mixing data and commentary, at least 6 statements | - | Đọc -> Nói hoặc viết | 1. Phân loại đúng ít nhất 80% số câu là dữ liệu/bằng chứng hay bình luận/diễn giải. *(máy)*<br>2. Giải thích được với ít nhất 2 câu vì sao đó là diễn giải chứ không phải dữ liệu. | ✓ | mới |
| `B-T5-SOURCE` | **Đánh giá độ tin cậy và giới hạn của nguồn**<br><sub>Evaluates a source's reliability and limits</sub> | TL3 / one historical or media source with metadata (author, date, purpose) | - | Đọc -> Nói hoặc viết | 1. Áp dụng ít nhất 2 yếu tố độ tin cậy phù hợp (tác giả/mục đích, phương pháp, thời điểm, đối chiếu) cho nguồn này.<br>2. Nêu ít nhất 1 giới hạn cụ thể và nguồn vẫn dùng được cho việc gì. | ✓ | mới |
| `B-T5-SUPPORT` | **Đánh giá bằng chứng đỡ kết luận đến đâu**<br><sub>Judges how far evidence supports a conclusion</sub> | TL3-TL4 / experiment description or dataset with a stated conclusion | - | Nguồn đọc/nghe -> Nói hoặc viết | 1. Nói rõ bằng chứng đỡ, đỡ một phần hay không đỡ kết luận, với lý do gắn với số liệu.<br>2. Chỉ ra ít nhất 1 giới hạn (mẫu, đối chứng, đo lường, thiếu dữ liệu). | ✓ | mới |

#### T7 Argumentation - Lập luận bảo vệ quan điểm (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-T7-ARGUE` | **Xây dựng lập luận dựa trên nguồn**<br><sub>Builds a source-based argument</sub> | TL3 / inquiry question with at least 2 sources | - | Nguồn đọc/nghe -> Nói hoặc viết | 1. Quan điểm được nêu rõ.<br>2. Ít nhất 2 lý do, mỗi lý do gắn với ít nhất 1 trích đoạn nguồn trong Canvas. *(máy)*<br>3. Với ít nhất 1 lý do, giải thích được bằng chứng đỡ lý do đó thế nào. | ✓ | mới |
| `B-T7-COUNTER` | **Xử lý công bằng một phản biện**<br><sub>Deals fairly with a counter-argument</sub> | TL4 / contested question where a counter-position is relevant | - | Nguồn đọc/nghe -> Nói hoặc viết | 1. Nêu công bằng phản biện mạnh nhất có liên quan.<br>2. Bác bỏ, nhượng bộ hoặc giới hạn luận điểm, có lý do. | ✓ | mới |

#### T9 Synthesis - Tổng hợp (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-T9-SYNTH` | **Tích hợp từ hai nguồn trở lên**<br><sub>Integrates two or more sources</sub> | TL3 / 2-3 sources on one question | - | Nguồn đọc/nghe -> Nói hoặc viết | 1. Dùng thông tin từ ít nhất 2 nguồn (liên kết trong Canvas hoặc có dẫn). *(máy)*<br>2. Tổ chức theo ý/tiêu chí chứ không trình bày lần lượt từng nguồn.<br>3. Nêu chỗ các nguồn thống nhất/khác nhau và lý do có thể. | ✓ | mới |

#### T11 Judgement - Phán đoán, kết luận (2)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-T11-QUALIFY` | **Rút ra kết luận có điều kiện**<br><sub>Draws a qualified conclusion</sub> | TL4 / question where the evidence is mixed or incomplete | - | Nguồn đọc/nghe -> Nói hoặc viết | 1. Kết luận nêu mức chắc chắn khớp với bằng chứng.<br>2. Nêu ít nhất 1 điều kiện/giới hạn mà khi đổi thì kết luận đổi. | ✓ | mới |
| `B-T11-WEIGH` | **Cân nhắc phương án theo tiêu chí rõ ràng**<br><sub>Weighs options against explicit criteria</sub> | TL4 / decision between at least 2 options with competing criteria | - | Nguồn đọc/nghe -> Nói hoặc viết | 1. Nêu ít nhất 2 tiêu chí và áp từng tiêu chí cho từng phương án.<br>2. Quyết định đi ra từ việc cân nhắc và thừa nhận được sự đánh đổi. | ✓ | mới |

#### A1 Independence (self-management) - Tự chủ (tự quản lý nhiệm vụ) (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-A1-PLAN` | **Tự lập kế hoạch cho một inquiry**<br><sub>Plans an inquiry approach</sub> | Condition-based / start of an inquiry, no planning template | - | Không cố định -> Nói hoặc viết | 1. Kế hoạch có câu hỏi nhỏ, nguồn sẽ dùng và các bước tạo sản phẩm.<br>2. Làm theo kế hoạch, hoặc điều chỉnh có ghi lý do. *(máy)* |  | mới |

#### A3 Revision - Sửa bài (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-A3-REVISE` | **Sửa lập luận sau phản biện/phản hồi**<br><sub>Revises reasoning after challenge or feedback</sub> | Condition-based / revision after Challenger or tutor feedback on reasoning | - | Không cố định -> Nói hoặc viết | 1. Mỗi điểm phản hồi có thay đổi thực chất (không chỉ đổi chữ) hoặc có lý do giữ nguyên.<br>2. Ghi lý do cho mỗi thay đổi hoặc mỗi quyết định giữ nguyên. | ✓ | mới |

#### A5 Transfer - Vận dụng sang bối cảnh mới (1)

| ID | Mục tiêu | Yêu cầu nhiệm vụ (giữ tiếng Anh) | CEFR | Vào -> Ra | Tiêu chí đạt (đạt tất cả = mức 3) | Core | Mã v0.1 |
|---|---|---|:-:|---|---|:-:|---|
| `B-A5-REUSE` | **Tự dùng lại một thao tác tư duy ở lĩnh vực mới**<br><sub>Reuses a reasoning move in a new domain</sub> | Condition-based / transfer-tagged episode in a new domain; task wording does not name the move | - | Không cố định -> Nói hoặc viết | 1. Dùng một thao tác tư duy đã được xác nhận dù đề không nhắc.<br>2. Điều chỉnh phù hợp với lĩnh vực mới. |  | mới |

## 6. Chỉ số aggregate (chỉ để chẩn đoán)

Những hành vi này chỉ thấy được qua nhiều bài hoặc một khoảng thời gian (xu hướng lỗi, độ đa dạng từ nối trong tuần, dùng lại cụm từ sau 7 ngày...). Chúng giúp gia sư chọn ưu tiên, **không** dùng để xét năng lực và luôn hiển thị dạng n/N kèm khoảng thời gian, không đổi thành %.

| ID | Track | Chiều | Định nghĩa | Cửa sổ | Nguồn dữ liệu | Mã v0.1 |
|---|:-:|:-:|---|---|---|---|
| `AGG-A-L1-FORM-ERR` | A | L1 | Tỷ lệ lỗi trên số chỗ bắt buộc, theo từng cấu trúc ngữ pháp (kể cả modal và câu điều kiện loại 1), trên các bài viết đã được duyệt. | rolling 4 weeks | Validated error_tags + opportunity counts on writing attempts | LNG03, LNG04 |
| `AGG-A-L1-ARTICLE-SVA` | A | L1 | Lỗi mạo từ và hòa hợp chủ - vị trên số chỗ bắt buộc và trên 100 từ; chỉ xem xu hướng. | rolling 4 weeks | Validated error_tags on writing attempts | LNG07 |
| `AGG-A-L1-SPOKEN-PAST` | A | L1 | Độ chính xác thì quá khứ khi kể chuyện bằng lời, từ lỗi gia sư gắn trong buổi hoặc trên transcript đã xác nhận. | rolling 4 weeks | Tutor observation log; tutor-confirmed transcript tags | LNG01, SPK04 |
| `AGG-A-L2-CHUNK-REUSE` | A | L2 | Tỷ lệ cụm từ mục tiêu của inquiry được dùng lại đúng trong bài làm sau ít nhất 7 ngày kể từ khi inquiry kết thúc. | per inquiry, checked from day 7 to day 30 | Inquiry target lists matched against later transcripts/texts | LNG08 |
| `AGG-A-L2-VI-SWITCH` | A | L2 | Số lần chuyển sang tiếng Việt trên mỗi phút nói, từ nhận diện ngôn ngữ trên transcript trong máy; chỉ xem xu hướng. | rolling 2 weeks | On-device transcript metrics (no audio leaves the device) | SPK14 |
| `AGG-A-L3-CONNECTOR-RANGE` | A | L3 | Số từ nối khác nhau được dùng đúng trên tất cả bài nói và viết. | rolling 7 days | Connector list matched against texts/transcripts + reviewer correctness tags | LNG09, WRT08 |
| `AGG-A-X1-SPEECH-METRICS` | A | X1 | Chỉ số nói trên máy: thời lượng nói, số từ/phút, số lần im lặng trên 3 giây. Chỉ để gia sư tham khảo; không bao giờ là điểm. | per episode, trend over rolling 4 weeks | On-device metrics only | SPK13 |
| `AGG-A-A1-SUPPORT-FREE` | A | A1 | Tỷ lệ episode làm lần đầu, theo từng target, không có sự kiện hỗ trợ trong app trước khi nộp (AI0-observed); hỗ trợ ngoài app tự khai báo hiển thị riêng. | rolling 4 weeks | AssistanceEvent log + declared support | - |
| `AGG-A-A1-SELFCAL` | A | A1 | Mức trùng khớp giữa ưu tiên con tự nêu và 3 nhóm phản hồi ưu tiên của gia sư. | rolling 6 weeks (at least 6 tasks) | A-A1-SELFASSESS episodes + tutor feedback categories | LRN02 |
| `AGG-A-A3-HINT-RETRY` | A | A3 | Tỷ lệ sửa thành công sau gợi ý loại lỗi (số lỗi đã sửa đúng / số lỗi được gợi ý). | rolling 2 weeks | ACT-REVISE pairs + reviewer tags | LRN01 |
| `AGG-A-A5-TRANSFER` | A | A5 | Số bài transfer đạt / số bài transfer hợp lệ, theo target và tổng; hiển thị riêng số đến hạn, đã làm, bị thiếu, không đánh giá được. | pilot to date | Transfer-tagged episodes + tutor validation | - |
| `AGG-A-RET-DELAYED` | A | nhiều chiều | Số bài kiểm tra sau thời gian (delayed) đạt / số bài hợp lệ (mặc định ít nhất 14 ngày từ lần luyện gần nhất), theo target và tổng. | pilot to date | Delayed-tagged episodes + exposure history | - |
| `AGG-B-L1-ERRORS` | B | L1 | Các nhóm lỗi lặp lại trên số chỗ bắt buộc và trên 100 từ trong bài viết; chỉ xem xu hướng. | rolling 4 weeks | Validated error_tags on writing attempts | - |
| `AGG-B-L2-LEXDIV` | B | L2 | Độ đa dạng từ vựng (vd. MTLD) trên bài từ 150 từ trở lên; chỉ tham khảo, không phải target. | rolling 6 weeks | Computed from submitted texts | - |
| `AGG-B-L4-AMBIGUITY` | B | L4 | Số chỗ bị đánh dấu mơ hồ (quy chiếu không rõ, câu quá tải) trên 100 từ trong bài viết. | rolling 4 weeks | Validated clarity flags on writing attempts | - |
| `AGG-B-T7-SOURCE-LINK` | B | T7 | Tỷ lệ lý do trong Canvas có liên kết tới ít nhất một trích đoạn nguồn. | rolling 4 inquiries | Canvas snapshots (card-source links) | - |
| `AGG-B-NS-COVERAGE` | B | nhiều chiều | Với các target T4, T5, T9, T11: bộ bằng chứng delayed/transfer đã có ít nhất một bối cảnh khoa học tự nhiên chưa. | pilot to date | Episode domain bucket (SOCIAL_HUMANITIES / NATURAL_STEM) + transfer links | - |
| `AGG-B-A1-SUPPORT-FREE` | B | A1 | Tỷ lệ episode làm lần đầu, theo target, không có sự kiện hỗ trợ trong app trước khi nộp; hỗ trợ ngoài app khai báo hiển thị riêng. | rolling 4 weeks | AssistanceEvent log + declared support | - |
| `AGG-B-A5-TRANSFER` | B | A5 | Số bài transfer đạt / số bài transfer hợp lệ, theo target và tổng. | pilot to date | Transfer-tagged episodes + tutor validation | - |
| `AGG-B-RET-DELAYED` | B | nhiều chiều | Số bài delayed đạt / số bài delayed hợp lệ, theo target và tổng. | pilot to date | Delayed-tagged episodes + exposure history | - |
| `AGG-B-EXAM-MOCK` | B | nhiều chiều | Điểm đề thử 40 câu theo dạng đề thi vào 10, tách theo phần (phát âm/trọng âm, từ vựng–ngữ pháp, giao tiếp, điền đoạn văn, đọc hiểu, viết lại câu); chỉ xem xu hướng. | monthly | Mock done outside the app (paper or practice site), section scores entered by tutor or parent | - |

## 7. Bảng chuyển đổi 51 mã v0.1

Tổng: Gộp 14, Chuyển thẳng 16, Tách 18, Thành chỉ số 2, Bỏ một phần 1 (= 51 mã). Không mã nào bị bỏ hoàn toàn; LRN03 bỏ một phần (bước tự tìm nguồn).

| Mã v0.1 | Tên v0.1 | Xử lý | Chuyển thành | Ghi chú |
|---|---|---|---|---|
| SPK01 | Answer familiar questions in full sentences | Gộp | `A-L8-EXCHANGE-S` | Trả lời câu hỏi nay thuộc Tương tác nói, gộp với SPK12. |
| SPK02 | Describe a person, animal, object or picture | Chuyển thẳng | `A-L4-DESC-S` | Chấm theo Độ rõ ràng của bài mô tả nói. |
| SPK03 | Sequence steps of a process | Chuyển thẳng | `A-L3-SEQ-S` | Trình tự = liên kết khi nói. |
| SPK04 | Narrate past events | Tách | `A-L3-SEQ-S`, `AGG-A-L1-SPOKEN-PAST` | Thứ tự sự việc -> SEQ-S; độ đúng thì quá khứ khi nói -> chỉ số aggregate do gia sư gắn (STT có thể tự sửa động từ). |
| SPK05 | Retell main points of a text or video | Chuyển thẳng | `A-L7-RETELL-S` | Kể lại thuộc Mediation; phần hiểu chấm riêng ở T1. |
| SPK06 | Explain how something works (process) | Tách | `A-L4-PROCESS-S`, `A-T4-CAUSE` | Tách độ rõ của lời giải thích và lập luận nhân quả; yêu cầu hạ xuống 45-60 giây với quá trình quen (audit M1). |
| SPK07 | Explain cause and effect | Tách | `A-T4-CAUSE`, `A-L3-CAUSE-S` | Nội dung nhân quả (tư duy) và từ nối nhân quả (ngôn ngữ) chấm riêng (audit C1). |
| SPK08 | Compare two things | Tách | `A-T9-COMPARE`, `A-L1-COMP-W` | So sánh theo tiêu chí -> T9; cấu trúc so sánh -> L1 (viết). |
| SPK09 | Give a reason and an example | Gộp | `A-T7-OPINION` | Lý do + ví dụ là tiêu chí bên trong target quan điểm. |
| SPK10 | Give and justify an opinion | Chuyển thẳng | `A-T7-OPINION` | Không còn bắt buộc nêu ý kiến trái chiều (PRD §16). |
| SPK11 | Predict and talk about possibilities | Tách | `A-T4-PREDICT`, `A-L1-FUTURE-W` | Lập luận dự đoán -> T4 (không core); dạng tương lai -> L1. |
| SPK12 | Ask follow-up and clarification questions | Gộp | `A-L8-EXCHANGE-S` | Hỏi lại là một phần của Tương tác nói, gộp với SPK01. |
| SPK13 | Sustain an extended turn with few long pauses | Tách | `A-X1-TURN`, `AGG-A-X1-SPEECH-METRICS` | Độ trôi chảy thành chiều mở rộng X1 do gia sư quan sát; chỉ số trên máy chỉ để tham khảo. |
| SPK14 | Repair breakdowns in English | Tách | `A-L2-COMPENSATE-S`, `AGG-A-L2-VI-SWITCH` | Nâng mức A2+ -> B1 (thang Compensating, audit M1); xu hướng chuyển tiếng Việt thành aggregate. |
| WRT01 | Write correct simple and compound sentences | Chuyển thẳng | `A-L1-SENT-W` |  |
| WRT02 | Expand sentences with detail | Gộp | `A-L4-DESC-W` | Mở rộng câu là tiêu chí trong bài mô tả viết; dạng bài luyện vẫn giữ để luyện tập. |
| WRT03 | Organise a paragraph | Chuyển thẳng | `A-L3-PARA-W` |  |
| WRT04 | Write a description | Chuyển thẳng | `A-L4-DESC-W` |  |
| WRT05 | Narrate events in sequence | Tách | `A-L3-PARA-W`, `A-L1-PAST-W` | Tổ chức đoạn và độ đúng thì quá khứ chấm riêng. |
| WRT06 | Explain cause and effect in writing | Tách | `A-L3-CAUSE-W`, `A-T4-CAUSE` | Tách ngôn ngữ và tư duy (audit C1). |
| WRT07 | Write an opinion with reason and example | Tách | `A-T7-OPINION`, `A-L3-PARA-W` | Chất lượng lập luận -> T7; tổ chức đoạn -> L3. |
| WRT08 | Use cohesive devices appropriately | Tách | `A-L3-PARA-W`, `AGG-A-L3-CONNECTOR-RANGE` | Kiểm tra từ nối trong một bài nằm ở PARA-W; độ đa dạng cả tuần là chỉ số chẩn đoán. |
| WRT09 | Edit own writing using hints | Chuyển thẳng | `A-A3-HINTFIX` | Sửa theo gợi ý thuộc Revision (A3), không bao giờ là bài làm lần đầu (audit C1). |
| WRT10 | Revise a draft after feedback | Chuyển thẳng | `A-A3-REDRAFT` |  |
| RDG01 | Identify the main idea | Gộp | `A-T1-TEXT-R` | Ý chính và chi tiết chấm chung trên một bài đọc. |
| RDG02 | Find key details | Gộp | `A-T1-TEXT-R` |  |
| RDG03 | Infer vocabulary meaning from context | Gộp | `A-T2-INFER-R` | Đoán nghĩa từ = một tiêu chí suy luận trong INFER-R. |
| RDG04 | Make simple inferences | Chuyển thẳng | `A-T2-INFER-R` | Câu trả lời nay phải chỉ ra dấu hiệu (FR-07a). |
| RDG05 | Follow a sequence of events/steps | Gộp | `A-T1-TEXT-R` | Câu hỏi trình tự là câu hỏi chi tiết trong TEXT-R. |
| RDG06 | Understand cause and effect in text | Tách | `A-T1-TEXT-R`, `A-T2-INFER-R` | Quan hệ được nêu -> T1; quan hệ ngầm -> T2. |
| RDG07 | Distinguish fact from opinion | Chuyển thẳng | `A-T5-FACTOP-R` | Nay thuộc Đánh giá bằng chứng; không core. |
| RDG08 | Summarise a short text | Chuyển thẳng | `A-L7-SUMMARY-W` | Tóm tắt là Mediation dạng viết. |
| LST01 | Understand the main idea of a short talk or video | Gộp | `A-T1-TEXT-L` |  |
| LST02 | Catch specific details | Gộp | `A-T1-TEXT-L` |  |
| LST03 | Recognise key words and signal words | Gộp | `A-T1-PROCESS-L` | Kỹ năng nền, quan sát qua việc theo dõi lời giải thích nhiều bước; không còn là cổng riêng. |
| LST04 | Follow the sequence of steps | Gộp | `A-T1-PROCESS-L` |  |
| LST05 | Follow a multi-step explanation | Chuyển thẳng | `A-T1-PROCESS-L` |  |
| LST06 | Understand speaker intention or attitude | Gộp | `A-T2-INFER-L` |  |
| LST07 | Infer meaning from context when listening | Gộp | `A-T2-INFER-L` |  |
| LNG01 | Past simple | Tách | `A-L1-PAST-W`, `AGG-A-L1-SPOKEN-PAST` | Cổng trên bài viết + chẩn đoán khi nói. |
| LNG02 | Comparatives and superlatives | Chuyển thẳng | `A-L1-COMP-W` |  |
| LNG03 | Modal verbs: can, must, should, might | Thành chỉ số | `AGG-A-L1-FORM-ERR` | Modal hiếm khi bắt buộc trong một bài nên khó có cơ hội quan sát hợp lệ; theo dõi bằng tỷ lệ lỗi/cơ hội. |
| LNG04 | Future forms and first conditional | Tách | `A-L1-FUTURE-W`, `AGG-A-L1-FORM-ERR` | will/going to hạ về A2, là target core (audit M1); câu điều kiện loại 1 (B1) tạm theo dõi chẩn đoán. |
| LNG05 | Present perfect (basic) | Chuyển thẳng | `A-L1-PRESPERF-W` | Hạ mức B1 -> A2 và chuyển thành core (audit M1). |
| LNG06 | Passive voice for processes | Chuyển thẳng | `A-L1-PASSIVE-W` |  |
| LNG07 | Accurate articles and subject-verb agreement | Tách | `A-L1-SENT-W`, `AGG-A-L1-ARTICLE-SVA` | Hòa hợp chủ - vị giữ trong SENT-W; bỏ ngưỡng mạo từ làm cổng (audit M1), chỉ theo dõi xu hướng. |
| LNG08 | Active science vocabulary and chunks | Tách | `A-L2-CHUNKS`, `AGG-A-L2-CHUNK-REUSE` | Dùng trong một bài là target; dùng lại sau 7 ngày là chẩn đoán. |
| LNG09 | Range of connectors for B1 reasoning | Thành chỉ số | `AGG-A-L3-CONNECTOR-RANGE` | '6 từ nối trong một tuần' là hành vi theo cửa sổ thời gian, không phải một episode (audit C1). |
| LRN01 | Self-correct after a hint | Tách | `A-A3-HINTFIX`, `AGG-A-A3-HINT-RETRY` | Chất lượng sửa từng lần là target; tỷ lệ 10 gợi ý/2 tuần là chẩn đoán. |
| LRN02 | Identify own strengths and weaknesses | Tách | `A-A1-SELFASSESS`, `AGG-A-A1-SELFCAL` | Một lần tự nhận xét là target; mức khớp với gia sư theo thời gian là chẩn đoán. |
| LRN03 | Find and use information in English | Bỏ một phần | `A-T1-TEXT-R`, `A-L7-RETELL-S` | Giữ phần hiểu và trình bày lại; bỏ bước tự tìm nguồn (Research Workspace là P1 trong kiến trúc). |

## 8. Thay đổi so với v0.1 (theo AUDIT_v0.1)

### C1 - Điểm rubric chung không còn thay cho tiêu chí riêng
- Mỗi target có **2-3 tiêu chí đạt/không đạt riêng**; tiêu chí code tính được đánh dấu *(máy)*. Mức 3 của target = đạt mọi tiêu chí. Không còn lấy "trung bình các dimension" làm điểm cho mọi competency.
- Mỗi target gắn **đúng một chiều đo**. Một bài nói "giải thích nguyên nhân" nay tạo quan sát riêng cho `A-T4-CAUSE` (nội dung nhân quả) và `A-L3-CAUSE-S` (từ nối), thay vì nhân cùng một điểm cho SPK07, SPK06, LNG01.
- Thêm `opportunity_rule`: bài không có câu quá khứ nào thì target quá khứ là **NULL**, không phải 0 và không nhận điểm chung.
- Nhóm ngữ pháp chấm theo **tỷ lệ đúng trên số chỗ bắt buộc** (`tag_ratio` từ error_tags đã duyệt).
- Hành vi theo thời gian (LNG07 xu hướng 4 tuần, LNG09 trong 1 tuần, LNG08 dùng lại, LRN01 10 gợi ý/2 tuần, LRN02 ≥ 70% bài) chuyển thành **chỉ số aggregate**, không còn là cổng.
- LRN01, WRT09, WRT10 (có sẵn gợi ý trong định nghĩa) chuyển sang **A3 Revision**; bản sửa không bao giờ được tính là bài làm lần đầu.

### H7 - Bổ sung cấu phần còn thiếu
- **Tương tác nói**: `A-L8-EXCHANGE-S` (hỏi - đáp, hỏi làm rõ) và `A-L8-DISCUSS-S` (đề xuất, đồng ý/phản đối có lý do, đi tới quyết định - kiểu phần thảo luận của đề B1).
- **Phát âm**: chiều mở rộng X2 + `A-X2-INTELL` (âm cuối, đuôi -s/-ed, trọng âm từ khóa), chỉ gia sư đánh giá trực tiếp.
- **Độ rộng/độ chính xác từ vựng**: `A-L2-PRECISE`, tách khỏi danh sách chunk (`A-L2-CHUNKS`) để không đếm trùng.
- **Viết email/tin nhắn**: `A-L8-MESSAGE-W` (Track A), `B-L8-EMAIL-W` (Track B).
- Bỏ dimension "Content" của v0.1: kiến thức khoa học không chấm trong Ngôn ngữ; `A-T4-CAUSE` chấm lập luận nhân quả trên nội dung **đã được dạy**.

### M1 - Chỉnh mức CEFR
- LNG05 present perfect cơ bản: B1 -> **A2**, và thành **core** (`A-L1-PRESPERF-W`).
- LNG04: will / going to -> **A2** (`A-L1-FUTURE-W`); câu điều kiện loại 1 (B1) tạm theo dõi ở `AGG-A-L1-FORM-ERR`.
- SPK14 diễn đạt vòng khi thiếu từ: A2+ -> **B1** theo thang Compensating (`A-L2-COMPENSATE-S`).
- LNG07: bỏ ngưỡng "≤ 1 lỗi/20 từ" cho mạo từ; hòa hợp chủ - vị giữ trong `A-L1-SENT-W`, mạo từ chỉ theo dõi xu hướng.
- SPK06: hạ xuống **45-60 giây với quá trình quen** (A2+); bản 60-90 giây với quá trình lạ để làm target B1 sau.

### Thay đổi khác
- **Thang 0-4 cũ** (0 chưa học ... 3 độc lập, 4 transfer) bị thay: 0-4 nay chỉ là chất lượng; hỗ trợ, độc lập và transfer là các lớp riêng (PRD §6.1, §6.4).
- **Nghe/Đọc** tách theo `input_modality`; mỗi target hiểu có loại hoạt động `ACT-SOURCE-QA` để tạo bằng chứng thường xuyên, không chỉ qua baseline/anchor (liên quan audit H2).
- Thêm **Track B** (30 target nháp) chạy trên cùng engine.
- Tiến bộ ngữ pháp khi nói, độ trôi chảy, phát âm: không dựa vào audio trên cloud; dùng transcript trên máy (tham khảo) và quan sát trực tiếp của gia sư.

## 9. Việc cần làm tiếp và điểm chưa chắc

1. **Gia sư của An rà mức CEFR** từng target ngôn ngữ, đặc biệt các target gắn B1: `A-L1-PASSIVE-W`, `A-L2-COMPENSATE-S`, `A-L7-SUMMARY-W`, `A-L8-DISCUSS-S`, `A-X1-TURN`, `A-X2-INTELL`.
2. **Ngưỡng là cấu hình pilot**: khóa theo giai đoạn sau pilot (audit H1), không chỉnh để "làm đẹp" kết quả.
3. **Tên loại hoạt động** `ACT-*` là tạm thời; cần khớp với bộ 8 activity template khi có spec.
4. **Độ khó nguồn** cho target Hiểu/Suy luận (TL2, TL3) cần người duyệt nguồn ghi lại như điều kiện nhiệm vụ.
5. **Track B**: rà với gia sư của Nguyên trước hè 2027; PRD (O-01) chưa tự gán học sinh Track B là lớp 9, hub đã xác nhận là Nguyên.
6. **Mức độ dày của Track A** (37 target): nếu gia sư thấy nặng, có thể chuyển thêm target sang không-core (vd. `A-L1-PASSIVE-W`, `A-L8-MESSAGE-W`) mà không đổi ID.

## Phụ lục A - Mức nhiệm vụ tư duy (không phải CEFR)

| Mức | Mô tả |
|:-:|---|
| TL1 | Một nguồn ngắn, quen hoặc bài vừa học; quan hệ phần lớn nói thẳng; một bước; Canvas Basic. |
| TL2 | Một nguồn; quan hệ ngầm một phần hoặc chuỗi hai bước; con tự chọn thông tin liên quan; Canvas Basic. |
| TL3 | Nguồn dài hơn hoặc từ hai nguồn; quan hệ ngầm; phải cân nhắc/giới hạn thông tin; Canvas Advanced. |
| TL4 | Nhiều nguồn có mâu thuẫn hoặc chưa chắc, hoặc lĩnh vực lạ; cần xét giải thích khác, giới hạn và kết luận có điều kiện; Canvas Advanced. |

Mức này mô tả **độ khó của nhiệm vụ**, không phải nhãn cho con và không quy đổi sang CEFR.

## Phụ lục B - Loại hoạt động tạo bằng chứng (tạm)

| ID | Mô tả |
|---|---|
| `ACT-SOURCE-QA` | Đọc/nghe nguồn rồi trả lời câu hỏi ý chính, chi tiết, suy luận (FR-07). |
| `ACT-CANVAS-BASIC` | Thinking Canvas Basic: ý chính - vì sao - ví dụ. |
| `ACT-CANVAS-ADV` | Thinking Canvas Advanced: luận điểm, bằng chứng, giới hạn, giải thích khác, kết luận có điều kiện. |
| `ACT-SPEAK-MONO` | Bài nói ghi trên máy: chỉ lưu transcript + chỉ số, không lưu audio lên cloud. |
| `ACT-SPEAK-LIVE` | Trao đổi trực tiếp với gia sư, ghi vào nhật ký quan sát. |
| `ACT-WRITE` | Bài viết trong app hoặc dán từ ngoài vào. |
| `ACT-REVISE` | Sửa bài của chính mình; cặp trước - sau là một episode. |
| `ACT-SELF-REVIEW` | Phiếu tự kiểm, tự nhận xét hoặc lập kế hoạch. |

## Phụ lục C - Cách kiểm tiêu chí

| Cách kiểm | Máy tự tính? | Ý nghĩa |
|---|:-:|---|
| `text_count` | Có | Code đếm/so mẫu trên bài hoặc transcript (từ nối, chuỗi chép nguyên, độ dài, đối chiếu danh sách). |
| `answer_key` | Có | Câu đóng chấm tự động theo đáp án; câu mở do người chấm. |
| `event_log` | Có | Lấy từ log sự kiện (hỗ trợ, nhóm phản hồi đã mã hóa, cập nhật kế hoạch). |
| `canvas_link` | Có | Lấy từ cấu trúc Canvas (thẻ có liên kết nguồn, số nguồn dùng). |
| `metric` | Có | Chỉ số trên máy (thời lượng, ngắt nghỉ); chỉ tham khảo. |
| `tag_ratio` | Không | Code tính tỷ lệ từ nhãn lỗi, nhưng nhãn do AI/gia sư gắn và phải được duyệt trước. |
| `rater` | Không | Người chấm đánh giá (AI đề xuất nếu chiều đo cho phép, gia sư duyệt). |
| `tutor_live` | Không | Gia sư đánh giá trực tiếp trong buổi; AI không đề xuất. |

*Nguồn tham chiếu: CEFR Companion Volume (2020) - chỉ dùng tên thang, mô tả được diễn đạt lại; English Grammar Profile / danh mục A2 Key, B1 Preliminary - chỉ dùng để xếp mức cấu trúc ngữ pháp; Learning OS MVP PRD v1.0; Master App Architecture v1.0; AUDIT_v0.1.*
