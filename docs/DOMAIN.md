# Luật và dữ liệu nghiệp vụ · Bàn làm việc gia sư (bản nháp 0.2 · 08/11/2026)

Trạng thái: **NHÁP 0.2 — phụ huynh đã chốt D-W1…D-W8 ngày 08/11** (mục 13); phần còn lại chờ duyệt cả bản. Viết trước spec `docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md` để chốt phần khó đổi về sau (dữ liệu, phiên bản, cách tính, trạng thái, quyền) trước khi code.
Nguồn: bản bấm thử + trang luồng (07/11), `TUTOR_WORKDESK_REVIEW_2026-11-07.md`, `AI_QUALITY_PLAN_2026-11-07.md`, câu trả lời thay gia sư của phụ huynh (08/11, mục 12), hiện trạng code đến migration `0024`.
Khi file này mâu thuẫn với PRD Family / DESIGN: **PRD và DESIGN thắng**, trừ những dòng ghi rõ "đổi so với PRD", là chỗ cần phụ huynh duyệt.

Ký hiệu: ✅ đã chốt (ghi ngày) · ❓ cần phụ huynh quyết · 🕓 chờ gia sư xác nhận.

---

## 1. Phạm vi áp dụng

| Mục của app học tập | Áp dụng? | Ghi chú |
|---|---|---|
| Giáo trình → Unit → điểm kiến thức / kỹ năng con | **Có** | Lớp mới, tầng B (mục 3) |
| Bài giao, bài nộp, nhiều lần làm, ảnh chụp bài làm | **Có** | Đã có `attempts`, `results`, Studio B1; thêm 3 cách giao bài |
| Cách tính mức (4 mức) | **Có** | Đã có cho kỹ năng (S7a); thêm cho điểm kiến thức (mục 5.2) |
| Phiên bản nội dung | **Có** | Giáo trình, lộ trình, công thức AI, chính sách ngưỡng |
| Hạn nộp, nộp muộn | **Có, nhẹ** | Ngày lịch Việt Nam; muộn không trừ điểm, chỉ ghi |
| AI trong app | **Có** | Chỉ soạn nháp; 3 lớp (mục 9) |
| Lớp/đợt (cohort), ghi danh | **Không** | Một gia đình, 2 em, mỗi em có giáo trình riêng |
| Chuỗi ngày học (streak), bảng xếp hạng | **Không** | Cấm (CLAUDE.md) |
| Chứng chỉ | **Không** | Kết quả thi ngoài (KET, PET…) chỉ là mốc, đã có `external_results` |
| Video, theo dõi xem video | **Không** | |
| Nhật ký hành vi (event log) | **Không** thêm mới | Đã có `audit_log`; đủ cho thống kê góp ý |

## 2. Vai trò và quyền

| Vai trò | Được làm | Không được |
|---|---|---|
| **Con** | Làm và nộp bài được giao (trong app, ảnh, file, ảnh trang kết quả); xem "Câu cần xem lại", góp ý, lời nhắn | Thấy điểm, x/y, %, mức, nhãn kỹ năng, nhận xét cho phụ huynh, nháp AI chưa duyệt |
| **Gia sư của em** (quan hệ còn hiệu lực) | Mọi việc chuyên môn: hồ sơ đầu vào, Ghi chú dạy học, giáo trình, lộ trình, giao bài, xem/duyệt mọi nháp AI, phán Đúng/Sai, xác nhận mức 3–4 và cấp, nhận xét tháng, góp ý cho AI, góp ý về app | Thấy hay sửa em không do mình dạy; sửa công thức AI; đổi luật cứng |
| **Phụ huynh** | Xem mọi thứ của con mình; bật AI, trần chi phí, đồng ý `ai_text`; xem "Tổng hợp góp ý"; sửa công thức AI (tạo phiên bản mới); trả lời góp ý về app; nạp bài đã làm, ghi buổi (như hiện nay) | Xác nhận mức 3–4, cấp, bài kiểm tra trong buổi (D14/D15, chỉ gia sư); duyệt nháp chuyên môn của AI thay gia sư (chỉ được **bỏ** nháp) ✅ D-W8 08/11 |
| **AI** | Đọc tài liệu được đưa vào, soạn nháp theo công thức | Ghi thẳng vào bằng chứng, mức, cấp; tự giao bài; tự đổi công thức; chấm bài viết/nói thay người |

- Tiến độ, điểm, mức **do server tính**. Trình duyệt chỉ gửi sự kiện (nộp, chọn, duyệt); không gửi "đã hoàn thành" hay "đạt mức".
- Đáp án đúng **không bao giờ** gửi xuống máy của con trước khi nộp (như hiện nay).
- **Góp ý của phụ huynh cho gia sư vẫn qua Zalo** ✅ 08/11. App không làm kênh nhắn phụ huynh → gia sư. Ô "Phụ huynh góp ý" trong "Chờ duyệt" của bản bấm thử **bỏ**.

## 3. Dữ liệu nền: 3 tầng

### Tầng A · Khung chung (đã có, khóa phiên bản)
Bản đồ kỹ năng SM-1 (7 mảng · 40 nhóm), danh mục kỹ năng 0.2.1, chính sách ngưỡng AP-0.3, thang cấp (SM-2). Không đổi trong việc này.

### Tầng B · Chương trình (mới; gia sư cung cấp, AI đọc, gia sư duyệt)

| Thực thể | Là gì | Quy tắc |
|---|---|---|
| **Giáo trình** (`curriculum`) | Một quyển sách hoặc nguồn mà gia sư dạy cho **một em** (✅ D-W2 08/11): Destination C1&C2, Reading Explorer 3, SGK Global Success 6… Không giới hạn số lượng ✅ 07/11 | Có `kind`: **kiến thức** (đo bằng điểm kiến thức) hay **kỹ năng** (đo bằng dạng câu hoặc tiêu chí). Có `level_note` (vd "Quyển 3 ≈ B1+"). Thuộc đúng 1 em; giáo trình dùng chung cho 2 em thì tạo 2 bản (có nút **chép mục lục + bảng nối sang em kia**, sau đó mỗi bản đi riêng) |
| **Phiên bản giáo trình** | Mục lục + bảng nối Unit → điểm tại một thời điểm | **Nháp** thì sửa tự do. **Đã duyệt** thì bất biến; sửa = phiên bản mới (mục 4) |
| **Unit** | Một đơn vị trong mục lục (Unit, Lesson, Chapter) | Có thứ tự, tên, trang. Unit "bỏ qua" vẫn giữ trong phiên bản, chỉ đánh dấu |
| **Nối Unit → điểm** | Unit dạy những điểm nào | Mỗi dòng trỏ tới **đúng một** mục có sẵn: nhãn (`error_tags`: nhãn hạt giống hoặc nhãn riêng có nhóm SM-1), **hoặc** kỹ năng danh mục, **hoặc** dạng câu đọc/nghe (nhãn "Kỹ năng đọc" 0018 + nhãn nghe mới), **hoặc** tiêu chí viết/nói. Không có "điểm" nào ngoài danh sách đóng; điểm mới = nhãn riêng mới (bắt buộc nhóm SM-1, như hiện nay) ✅ 07/11 (danh sách đóng) |
| **Thang chấm viết/nói** | Tiêu chí Cambridge ✅ 08/11: Content · Communicative Achievement · Organisation · Language, mỗi tiêu chí 0–5 | Lưu như cấu hình có phiên bản (`CAM-WS-1`). Lưu thang 0–5 **và** nối sang kỹ năng danh mục ✅ D-W4 08/11 |

**Điểm kiến thức = nhãn.** Không tạo bảng "điểm" thứ hai. Lý do: bằng chứng hiện có (`tag_marks`, `studio_item_meta`, "Điểm cần chú ý", ô chọn nhãn) đều gắn với nhãn. Một điểm của Destination U7 "bị động vô nhân xưng" chính là một nhãn có nhóm SM-1. ✅ D-W1 08/11

### Tầng C · Hồ sơ từng em (sinh ra khi học)

| Thực thể | Đã có / mới |
|---|---|
| Hồ sơ đầu vào: mục tiêu, cấp khởi điểm 7 mảng, điểm mạnh/yếu ban đầu | Cấp: có (`level_decisions`, SM-2). Mục tiêu + mạnh/yếu ban đầu: **mới** |
| **Ghi chú dạy học**: 4 ô *Đang tập trung vào · Cách giải thích hợp với con · Lỗi hay lặp lại · Cần tránh* | **Mới**, chỉ thêm (mỗi lần sửa = dòng mới) ✅ 07/11 |
| "Đang học đến" của từng giáo trình | **Mới**, dẫn xuất từ sự kiện (mục 5.1) |
| Lộ trình (nhiều dòng song song) | **Mới**, có phiên bản (mục 4) |
| Buổi học | Có (`lesson_notes`); thêm nối với Unit đã dạy |
| Bài giao (4 cách), bài làm, câu tự chấm, Đúng/Sai | Có (`inquiry_instances`, `attempts`, `results`, Studio); thêm cách ②③ và nạp bài đã làm |
| Mức từng kỹ năng | Có (S7a, `competency_state`) |
| Mức từng điểm kiến thức | **Mới**, dẫn xuất (mục 5.2) |
| Nhận xét tháng của gia sư (lớp "nhận định") | **Mới**, chỉ thêm, có cờ "Cần đối chiếu" (mục 5.4) |
| Góp ý cho AI, góp ý về app | **Mới**, chỉ thêm (mục 9.3) |

## 4. Phiên bản nội dung

| Nội dung | Luật |
|---|---|
| **Giáo trình** | Nháp → duyệt → **khóa**. Sửa mục lục hay bảng nối sau khi duyệt = phiên bản mới (v2), gia sư duyệt. **Bằng chứng cũ không đổi**: mọi bằng chứng lưu thẳng khóa nhãn / kỹ năng của từng câu (như `studio_item_meta` hiện nay), không lưu "Unit 7" rồi tra bảng nối. Đổi bảng nối không đổi mức đã tính. "Đang học đến" chuyển sang phiên bản mới theo **mã Unit ổn định** (Unit giữ mã qua các phiên bản; Unit bị bỏ ở v2 thì vẫn còn trong lịch sử) |
| **Lộ trình** | Mỗi lần duyệt = phiên bản mới, giữ bản cũ. Chỉ hiện phần thay đổi để duyệt từng dòng. **Phụ huynh được báo** mỗi phiên bản mới (trang chủ phụ huynh), không cần duyệt ✅ 07/11 |
| **Công thức AI** (`prompts/<việc>.vN.md`) | Phụ huynh giữ. Đổi = vN+1, chạy bộ đề chuẩn trước, đạt mới bật. Mỗi lần gọi AI ghi `ai_runs.prompt_version` (đã có cột). Bản cũ giữ để quay về |
| **Chính sách ngưỡng** (mức điểm kiến thức) | Theo cách của AP: file có phiên bản, sinh migration bằng `gen:config -- --new`, không sửa bản đã công bố |
| **Đề / bài đã giao** | Như hiện nay: lần làm lưu bản chụp đề + đáp án; sửa đề sau khi đã có người làm không đổi kết quả cũ. Muốn chấm lại = thao tác "chấm lại" có ghi sổ (chưa làm trong việc này) |
| **Ghi chú dạy học** | Mỗi lần lưu = dòng mới; bản hiện hành = dòng mới nhất của từng ô. AI ghi lại đã đọc bản nào (id dòng) |

## 5. Quy tắc tính (mỗi quy tắc ≥ 3 ví dụ)

Ngày = **ngày lịch Việt Nam (UTC+7)** cho mọi phép tính (như S7a).

### 5.1 "Đang học đến" và độ phủ giáo trình
- Gia sư đặt trạng thái từng Unit: *chưa học · đang học · đã học · bỏ qua*. Mỗi lần đặt = một sự kiện (chỉ thêm). Trạng thái hiện tại = sự kiện mới nhất của Unit đó.
- "Đang học đến" = Unit **đang học** có thứ tự lớn nhất; không có thì Unit **đã học** có thứ tự lớn nhất; chưa có gì thì "Chưa bắt đầu".
- Độ phủ = số Unit *đã học* ÷ số Unit **không bị bỏ qua** trong phiên bản đang dùng.
- Ghi buổi có chọn Unit thì app **đề xuất** chuyển Unit đó sang "đang học" (gia sư bấm, không tự đổi).

| Ví dụ | Kết quả |
|---|---|
| Destination 26 Unit; U1–U12 đã học, U13 đang học, U3 bỏ qua | Đang học đến **U13**; độ phủ 11/25 = 44 % |
| Reading Explorer 3: chưa đánh dấu Unit nào | "Chưa bắt đầu"; độ phủ 0 % |
| Giáo trình lên v2, bỏ U20 (chưa học) và thêm U27 | Đang học đến không đổi (mã Unit ổn định); độ phủ tính lại trên v2 |

### 5.2 Mức từng điểm kiến thức (mới)
Cùng 4 mức và cùng tinh thần với S7a để gia sư chỉ học một luật: **Mới gặp → Đang tiến bộ → Tự làm được → Vận dụng được**. Mức 1–2 app tự đặt; **mức 3–4 app đề xuất, gia sư xác nhận**. **Không bao giờ tự hạ mức** (sai lặp lại → gắn ⚑ "cần xem", gia sư quyết). Ngưỡng nằm trong chính sách có phiên bản `PP-0.1`, không viết cứng.

"Câu được tính" = một câu có đáp án đóng, gắn đúng điểm đó, đã chấm (tự chấm hoặc gia sư phán), **lần làm đầu của em trên câu đó**, không hỗ trợ. "Dịp" = một lần làm (một bài, một ngày).

| Mức | Điều kiện (`PP-0.1`, ✅ D-W3 08/11) |
|---|---|
| 1 · Mới gặp | Điểm có trong Unit đã dạy ở một buổi, **hoặc** có ≥ 1 câu đã làm (đúng hay sai) |
| 2 · Đang tiến bộ | ≥ 1 câu được tính **đúng**, **hoặc** ≥ 1 câu đúng có hỗ trợ (bài làm cùng gia sư, bài nạp "có hỗ trợ") |
| 3 · Tự làm được (đề xuất) | ≥ 4 câu được tính, ≥ 75 % đúng, ở **≥ 2 dịp khác ngày** |
| 4 · Vận dụng được (đề xuất) | Đã ở mức 3, **và** ≥ 2 câu được tính đúng ở một dịp **≥ 14 ngày** sau dịp gần nhất trước đó, từ **nguồn khác** (giáo trình / đề khác) |
| ⚑ cần xem | Đang ở mức ≥ 3 mà 3 câu được tính gần nhất có ≥ 2 câu sai |

| Ví dụ (dữ liệu thật của Nguyên) | Kết quả |
|---|---|
| Progress Test U1–12 (23/10, **tự làm rồi chữa cùng cô** ✅ 08/11): bị động vô nhân xưng 5/5 câu, một dịp | Mức **2**. Chưa đủ "2 dịp" cho mức 3 |
| Thêm bài về nhà 05/11: bị động vô nhân xưng 4/5 đúng | 10 câu, 90 %, 2 dịp khác ngày → **đề xuất mức 3**, cô xác nhận |
| Cụm động từ "get across": câu 50 sai (23/10), bài gợi ý 25/11 đúng 3/3 | 4 câu, 75 %, 2 dịp → đề xuất mức 3 |
| Một bài làm cùng cô trong buổi, đúng 6/6 | Mức **2** (có hỗ trợ, không tính cho mức 3) |
| Ở mức 3, bài ôn 10/12 sai 2 trong 3 câu gần nhất | Giữ mức 3, gắn **⚑**; cô chọn giữ hoặc hạ |

Kỹ năng con đọc/nghe (dạng câu: ý chính, suy luận, từ vựng trong ngữ cảnh…) dùng **đúng luật này** trên câu gắn nhãn dạng câu. Bảng "Kỹ năng đọc" nhập tay theo tháng (0018) giữ làm tín hiệu, không vào luật mức.
Viết / nói: mức theo **tiêu chí Cambridge** đi qua đường bằng chứng hiện có (gia sư chấm, `observations` / `validation_decisions`, S7a). Không áp luật câu đúng/sai.

### 5.3 Nạp bài đã làm (bài kiểm tra cũ)
- Đầu vào: file bài con làm + file đáp án + **ngày làm thật** + **mức hỗ trợ** (*tự làm* · *tự làm rồi chữa cùng cô* · *làm cùng cô*).
- AI đọc câu trả lời của con; **code so với đáp án**; câu AI không chắc → "Cần xem", gia sư phán.
- *Tự làm* và *tự làm rồi chữa cùng cô* = câu trả lời là của con → **được tính** (✅ D-W6 08/11). AI phải bỏ qua dấu chữa (mực khác màu, ghi chú) và chỉ đọc câu trả lời ban đầu; câu không tách được → "Cần xem".
- *Làm cùng cô* = có hỗ trợ → tối đa mức 2.
- Ngày tính mức = ngày làm thật, không phải ngày nạp. Ngày làm thật **không giới hạn về quá khứ** (gia sư tự cân nhắc, ✅ D-W5 08/11), không sau hôm nay.
- **Nạp trùng**: cùng mã băm file bài làm, **hoặc** cùng (tên đề, ngày làm) của cùng em → app báo "có thể đã nạp" và chặn, trừ khi gia sư chọn "Đây là lần làm khác".

| Ví dụ | Kết quả |
|---|---|
| Progress Test 23/10, tự làm rồi chữa; 51/60 | 60 câu được tính, ngày 23/10 |
| Cùng file nạp lại 10/11 | Chặn: "Bài này đã nạp ngày 08/11" |
| Đề giữa kỳ trên lớp, làm cùng cô ôn tập | Câu đúng → mức tối đa 2 |

### 5.4 Cờ "Cần đối chiếu" (nhận xét tháng ↔ bằng chứng)
- Nhận xét tháng của gia sư là lớp **nhận định**, đặt cạnh bằng chứng; không ghi đè bằng chứng.
- AI chỉ **đề xuất** nối câu trong nhận xét → điểm / mảng; gia sư duyệt.
- Cờ bật khi một điểm hoặc mảng được nhận xét **"yếu"** mà bằng chứng 60 ngày gần nhất có ≥ 4 câu được tính ở ≥ 75 %, hoặc nhận xét **"vững"** mà bằng chứng có ≥ 4 câu ở < 50 %. Gia sư đóng cờ bằng một trong hai: *bằng chứng đúng* / *nhận xét đúng (ghi lý do)*. Không ai bị "sai", chỉ đối chiếu.

| Ví dụ | Kết quả |
|---|---|
| Nhận xét T10 (viết **sau** bài test ✅ 08/11): "câu điều kiện, giả định còn yếu"; test có 24/24 câu ngữ pháp U7/U9/U11 + giả định đúng | Cờ "Cần đối chiếu" (≥ 4 câu, 100 %) |
| Nhận xét "idiom tốt"; test idiom 7/7 | Không cờ (khớp) |
| Nhận xét "nghe còn yếu"; chưa có câu nghe nào | Không cờ (chưa đủ bằng chứng); hiện "chưa có bằng chứng" |

### 5.5 Hạn nộp
Hạn là một **ngày lịch Việt Nam**; nộp trước 24:00 ngày đó là đúng hạn. Muộn chỉ ghi "nộp muộn", không trừ điểm, không chặn (trừ bài kiểm tra tháng nếu gia sư bật "khóa sau hạn").

| Ví dụ | Kết quả |
|---|---|
| Hạn 27/11, nộp 27/11 23:59 giờ VN | Đúng hạn |
| Nộp 28/11 00:01 | Nộp muộn |
| Máy của con chạy sai giờ | Server ghi giờ nộp; giờ máy bỏ qua |

## 6. Trạng thái

**Giáo trình (phiên bản):** `nháp` (AI đang đọc / gia sư đang sửa) → `đã duyệt` (đang dùng) → `thay bằng vN+1` · hoặc `lưu trữ` (thôi dạy; dữ liệu giữ nguyên).

**Bài giao (cả 4 cách):**
```
đã giao ──(con làm / nộp)──> đã nộp ──(cách ②③: AI đọc)──> cần xem ──(gia sư phán xong)──> đã xác nhận
   │                            │                                                          │
   ├── quá hạn (chỉ là nhãn)    └── (cách ①: tự chấm; câu mở → cần xem)                    └── trả lại sửa → đã nộp (lần 2)
   └── bỏ (lý do bắt buộc)
cách ④ (trong buổi / nói): gia sư nhập kết quả khi ghi buổi → đã xác nhận
```
Cách: ① đề + đáp án → bài trong app · ② giao file Word/PDF, con nộp ảnh/file · ③ link ngoài, con nộp ảnh trang kết quả · ④ trong buổi / nói. Cả 4 cách gia sư đều dùng ✅ 08/11; ưu tiên làm ① (đã có) rồi ② ③.
Cách ③ chỉ ghi **điểm theo phần** nếu trang kết quả không ghi câu sai; không bịa câu.

**Nháp AI (mọi việc):** `đang soạn` → `chờ duyệt` → `duyệt` · `bỏ`. Chờ duyệt mở ra màn xem; **câu AI không chắc phải xử lý xong** nút Duyệt mới bật ✅ 07/11. AI lỗi → `lỗi` + "Soạn tay".

**Lộ trình:** `nháp` → `đã duyệt (vN)` → `thay bằng vN+1`. Phụ huynh được báo mỗi vN.

**Góp ý về app:** `mới` → `đang sửa` → `đã sửa` · `không làm` (kèm lời trả lời). Gia sư thấy trạng thái.

## 7. Bất biến (code + cơ sở dữ liệu phải giữ)
1. Mỗi câu bằng chứng gắn **đúng một** điểm (nhãn / kỹ năng / dạng câu) — như Studio B1.
2. Phiên bản giáo trình đã duyệt không sửa được; bằng chứng không đổi khi bảng nối đổi.
3. Mức điểm 3–4 chỉ có khi có dòng **xác nhận của gia sư của em**; app không bao giờ tự lên 3–4, không bao giờ tự hạ.
4. Bài nạp "làm cùng cô" không bao giờ đóng góp cho mức 3–4.
5. Mức điểm, độ phủ, "đang học đến" là **dẫn xuất**: xóa đi tính lại được, kết quả giống hệt.
6. Con không bao giờ nhận điểm, x/y, %, mức hay nhãn kỹ năng (như hiện nay).
7. Mỗi lần gọi AI có `ai_runs` với `prompt_version`; mỗi nháp AI trỏ tới lần gọi đã tạo ra nó.
8. Góp ý cho AI, góp ý về app, Ghi chú dạy học, nhận xét tháng, sự kiện Unit, phiên bản lộ trình: **chỉ thêm** (`eng_forbid_mutation`).
9. Mọi bảng mới có `learner_id` nằm trong `eng_purge_learner` / `eng_purge_preview` (kèm test).
10. Không có gì ghi vào schema `public`.

## 8. Ca biên bắt buộc xét
- Giáo trình dùng cho cả 2 em (vd từ điển, sách ngữ pháp chung) → 2 bản riêng; không chia sẻ trạng thái.
- Đổi gia sư giữa chừng → giáo trình, ghi chú, lộ trình thuộc **em**, không thuộc gia sư; gia sư mới thấy hết khi có quan hệ.
- Gia sư nghỉ (hết quan hệ) → nháp AI đang chờ duyệt của người đó: giữ, gia sư khác hoặc phụ huynh **bỏ** được, không duyệt thay (✅ D-W8).
- Ảnh bài làm mờ, xoay ngược, thiếu trang → AI báo "không đọc được trang n", không đoán.
- Một câu có 2 đáp án đúng → "đáp án chấp nhận" (đã có), lần sau tự chấm.
- Con nộp 2 lần (2 thiết bị) → `client_submission_id` duy nhất (đã có); lần sau là lần làm 2.
- Mất mạng lúc nộp ảnh → nộp lại không tạo bản trùng (cùng `client_submission_id`).
- Nạp bài cũ trùng → mục 5.3.
- Hết trần AI giữa tháng → mọi việc có "Soạn tay"; nháp đang dở giữ nguyên.
- Sửa nhầm "đang học đến" → đặt lại (sự kiện mới); không xóa sự kiện cũ.
- Giáo trình có Unit trùng tên (vd "Review 1" nhiều lần) → khóa theo mã Unit, không theo tên.

## 9. AI trong việc này

### 9.1 Ba lớp ✅ 07/11
| Lớp | Ai giữ | Gồm |
|---|---|---|
| 1 Luật cứng | Phụ huynh (code) | Chỉ nháp; danh sách đóng; câu không chắc phải đánh dấu; đề xuất phải dẫn bằng chứng; con không thấy điểm; không gửi tên thật — chỉ bí danh + hồ sơ học tập (✅ D-W7 08/11) |
| 2 Công thức từng việc | Phụ huynh (`prompts/*.vN.md`) | Cách làm, khung đầu ra JSON bắt buộc, ví dụ từ tài liệu thật |
| 3 Hiểu biết về con | Gia sư | Ghi chú dạy học + câu trả lời "Câu hỏi cho cô" + 1 dòng ghi chú lần này |

### 9.2 Danh sách việc AI làm (mỗi việc một công thức)
| Việc | Đầu vào | Đầu ra (nháp) | Code kiểm |
|---|---|---|---|
| Đọc mục lục giáo trình | PDF mục lục + 2 trang đầu Unit | Unit (thứ tự, tên, trang) + đề xuất nối Unit → điểm trong danh sách đóng | Số Unit liền mạch; mọi điểm thuộc danh sách; Unit trùng mã |
| Đọc đề (Studio B1, đã có) | Đề + đáp án | Câu + đáp án + nhãn | Đã có |
| Đọc bài làm (ảnh / file / trang kết quả) | Ảnh + đề đã duyệt | Câu trả lời từng câu + độ chắc | **Code so đáp án**; câu không chắc → cần xem |
| Gợi ý bài luyện | Điểm yếu + Unit đang học + Ghi chú dạy học | Câu + đáp án + điểm + giải thích | Đáp án duy nhất hoặc đáp án chấp nhận; điểm thuộc danh sách |
| Lộ trình / điều chỉnh | Mục tiêu, giáo trình + độ phủ, mức điểm, số buổi | Các dòng theo tháng | Tổng buổi khớp phép tính; chỉ phần thay đổi |
| Kế hoạch buổi | Unit đang học, điểm yếu, bài chưa chữa | Dàn ý buổi | — |
| Nhận xét tháng | Bằng chứng tháng + 4 mục quen dùng của cô | Nháp 4 mục, mỗi câu dẫn bằng chứng | Câu không dẫn bằng chứng → đánh dấu |

### 9.3 Vòng góp ý ✅ 07/11
- **Ngắn:** khi duyệt, câu Sửa / Bỏ có lý do tùy chọn (*Quá khó · Quá dễ · Sai đáp án · Lệch trọng tâm · Diễn đạt lạ*); cuối màn *Tốt / Tạm / Phải sửa nhiều* + 1 dòng. App tự ghi giữ / sửa / bỏ, đáp án AI đọc sai. Lần sau cho **đúng em + đúng việc**, AI đọc 2–3 góp ý gần nhất.
- **Dài:** "Tổng hợp góp ý" (chỉ phụ huynh), hằng tháng: % câu giữ nguyên theo việc + lý do hay gặp → **Sửa công thức** (vN+1, chạy bộ đề chuẩn).
- **Góp ý về app:** nút ở cột trái; gia sư thấy trạng thái + trả lời.
- Số liệu do **code đếm**.

## 10. Ngân sách
Trần $10/tháng (đã có). Gia sư dành **~30 phút/tuần/em** ✅ 08/11 → đủ cho: chuẩn bị buổi (~5'), ghi buổi (~1'/buổi), xem kết quả và duyệt nháp (~15'), phần tháng chia đều.

## 11. Không làm trong việc này
Lớp / đợt, chứng chỉ, streak, bảng xếp hạng, video; chat tự do với AI; AI chấm viết / nói; kênh nhắn phụ huynh → gia sư (dùng Zalo); nối bài giao sang Study Launcher (để sau); Clarifier / Challenger Track B (hè 2027).

## 12. Câu trả lời thay gia sư (phụ huynh, 08/11)
| Câu | Trả lời | Ảnh hưởng |
|---|---|---|
| Reading Explorer | **Quyển 3** (≈ B1+) | Mảng Đọc của Nguyên thấp hơn hẳn mảng Ngữ pháp / Từ vựng (Destination C1–C2) → lộ trình nhiều dòng, mỗi dòng một cấp |
| Great Writing | **Quyển 4**, thỉnh thoảng ôn lại cách triển khai đoạn văn, viết câu gọn, không lặp / rối ý | Viết: tiêu chí Organisation + Language là trọng tâm; nhãn riêng cho "câu lặp ý", "triển khai đoạn" |
| Listening & Notetaking | **Quyển 1** | Mảng Nghe thấp nhất. Mục tiêu C1 ~10/2027 có rủi ro ở Nghe → đưa vào lộ trình như một dòng riêng, báo phụ huynh |
| Chấm viết / nói | **Tiêu chí Cambridge** | Thang `CAM-WS-1` (4 tiêu chí × 0–5), nối sang kỹ năng ✅ D-W4 |
| Progress Test U1–12 | **Tự làm, sau đó chữa cùng cô** | Câu trả lời là của con → được tính; AI bỏ qua dấu chữa |
| Nhận xét T10 | Viết **sau** bài test | Lệch giữa nhận xét và test là lệch thật → cờ "Cần đối chiếu" |
| Điểm cần củng cố mỗi buổi | **1–3 là đủ** | Giữ tối đa 3 (khớp PR #23) |
| Cách giao bài | **Cả 4 cách**; khi có app + AI cô sẽ tự đổi cách giao và chuẩn bị buổi | Làm đủ 4 cách, ưu tiên ① → ② → ③; ④ đi cùng ghi buổi |
| File giáo trình | **Có PDF hầu hết** | AI đọc PDF (Studio B1 đã có); ảnh chụp là đường phụ |
| Thời gian của cô | **~30 phút/tuần/em** | Mục 10 |
| Góp ý phụ huynh → cô | **Zalo như hiện tại** | Bỏ kênh này khỏi app (mục 2) |
| Giáo trình của An | **SGK Global Success 6 · Cambridge (Flyers/KET…) · sách kỹ năng đọc/viết · đề ôn thi trường** | 🕓 tên quyển Cambridge + sách kỹ năng cụ thể |

## 13. Quyết định cửa một chiều (phụ huynh chốt 08/11)
| # | Quyết định | Đã chốt | Vì sao khó đổi về sau |
|---|---|---|---|
| D-W1 | Điểm kiến thức = **nhãn** (dùng chung `error_tags`), không bảng riêng | ✅ **Dùng chung nhãn** | Mọi bằng chứng và màn hình hiện có đều theo nhãn; tách ra sau phải chuyển dữ liệu |
| D-W2 | Giáo trình thuộc **từng em** (dùng chung thì 2 bản) | ✅ **Mỗi em một bản** (+ nút chép sang em kia) | Trạng thái "đang học đến", lộ trình là của em |
| D-W3 | Luật mức điểm kiến thức `PP-0.1` như mục 5.2 (4 câu · 75 % · 2 dịp; mức 4: ≥ 14 ngày + nguồn khác; 3–4 gia sư xác nhận) | ✅ **Đồng ý** `PP-0.1`; chỉnh sau pilot bằng `PP-0.2` | Mức đã tính dựa vào bản chính sách |
| D-W4 | Tiêu chí Cambridge: lưu riêng thang 0–5 (`CAM-WS-1`) **và** nối mỗi tiêu chí sang kỹ năng danh mục để engine S7a dùng | ✅ **Lưu 0–5 + nối** (Content→L4/T, Communicative→L8, Organisation→L3, Language→L1+L2; quy đổi 0–5 → 0–4 bằng bảng cố định có phiên bản) | Đổi thang sau khi đã chấm phải quy đổi lại |
| D-W5 | Nạp bài cũ: giới hạn ngày làm thật về quá khứ | ✅ **Không giới hạn** (gia sư tự cân nhắc; ngày ≤ hôm nay) | Bài quá cũ làm sai mức hiện tại |
| D-W6 | Bài nạp "tự làm rồi chữa cùng cô" **được tính** như tự làm | ✅ **Được tính** nếu AI tách được câu trả lời gốc; không tách được → cần xem | Ảnh hưởng mức 3 của nhiều điểm ngay từ đầu |
| D-W7 | D1: có gửi **tên thật** của con cho AI không | ✅ **Không** — chỉ bí danh + hồ sơ học tập | Đổi thì phải sửa luật lọc tên trong `lib/ai` |
| D-W8 | Phụ huynh có được duyệt nháp chuyên môn của AI (bài gợi ý, lộ trình) khi gia sư bận không | ✅ **Không** — phụ huynh chỉ được bỏ nháp | Đổi về sau thì phải tách quyền duyệt theo từng việc |
