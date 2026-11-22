# Bộ test gia sư AI — mốc E1 (21/11/2026)

Lần chạy cuối của E1 (prompt tutor-hint.v2 / tutor-check.v2). Bản đầy đủ (có chữ đề) không nằm trong repo. Đây là mốc để so với lần chạy sau.

```
# eval-hints 2026-11-21T10-28-18
models claude-sonnet-5-5 / check claude-haiku-5-5 / audit claude-haiku-5-5 · prompts tutor-hint.v2, tutor-check.v2 · spent $7.7248 · API retries 0 · audits failed 0

| set | turns | leak flagged | confirm flagged | length+ask | language | pass/rewritten/safe | ai_error | cost |
|---|---|---|---|---|---|---|---|---|
| BO_TEST | 93 | 0 | 0 | 98.9% | 100% | 86/7/0 | 0 | $0.7923 |
| Destination | 579 | 10 | 0 | 97.6% | 100% | 461/73/45 | 0 | $6.7265 |

flags/G8: 15/15 · cost per turn mean $0.01119, median $0.00974, max $0.03093 · median 7.1s
```

## Lượt bị bộ kiểm báo (chỉ mã câu; đọc tay 21/11: đều là báo nhầm)

- R7-A#2 r1 s2 [pass]
- U14-1-A#3 r1 s2 [pass]
- U14-1-C#7 r1 s2 [pass]
- U14-5-O#1 r1 s1 [pass]
- U14-5-O#3 r1 s2 [pass]
- U14-5-O#6 r1 s1 [pass]
- U14-5-O#8 r1 s1 [pass]
- U14-5-O#9 r1 s2 [pass]
- U14-5-O#10 r1 s1 [pass]
- U14-5-O#11 r1 s2 [pass]

Đọc tay: gốc của từ đã có trong đề (R7-A#2); câu phân nhóm en- có đáp án là chữ cái nhóm (U14-5-O); mô tả nghĩa cả hai lựa chọn mà không nói cái nào đúng (U14-1-A#3, U14-1-C#7).
