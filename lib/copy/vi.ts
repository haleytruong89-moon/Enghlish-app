/**
 * Mọi chữ hiển thị trên giao diện — theo UX_COPY_GUIDE v0.1 (13/10/2026).
 * Không viết chữ giao diện rải rác trong component; thêm nhãn mới vào đây.
 * Học sinh: xưng "bạn", câu ngắn, không điểm, không mã (D28).
 */

// ---------- Chung ---------------------------------------------------------------
export const app = {
  name: "Learning OS",
  tagline: "Học tiếng Anh mỗi ngày",
  testBadge: "Dữ liệu thử",
  techInfo: "Thông tin kỹ thuật",
} as const;

// ---------- Đăng nhập / đăng xuất -------------------------------------------------
export const auth = {
  title: "Đăng nhập",
  intro: "Dùng email và mật khẩu bố mẹ đã tạo cho bạn.",
  email: "Email",
  password: "Mật khẩu",
  submit: "Đăng nhập",
  submitting: "Đang đăng nhập…",
  signOut: "Đăng xuất",
  errorInvalid: "Email hoặc mật khẩu chưa đúng. Bạn thử lại nhé.",
  errorMissing: "Bạn nhập cả email và mật khẩu nhé.",
  errorGeneric: "Chưa đăng nhập được. Bạn thử lại sau ít phút.",
} as const;

// ---------- Trang chủ theo vai trò (S0: placeholder) -------------------------------
export const home = {
  studentGreeting: (alias: string) => `Chào ${alias}!`,
  studentEmpty: "Hôm nay chưa có việc mới. Cô sẽ giao bài sớm thôi.",
  tutorTitle: "Học sinh của cô/thầy",
  tutorEmpty: "Chưa có học sinh nào được giao cho cô/thầy.",
  parentTitle: "Các con",
  parentSummary: (n: number) => (n === 0 ? "Chưa có con nào trong app." : `Đang theo dõi ${n} con.`),
  noAccessTitle: "Tài khoản này chưa được mở cho app tiếng Anh",
  noAccessBody: "Bố mẹ cần thêm bạn vào app trước. Nếu bạn là gia sư, hãy nhắn phụ huynh.",
  learnerDraft: "Chưa bắt đầu",
  learnerActive: "Đang học",
} as const;

/** Track: chỉ phụ huynh/gia sư thấy. Dạng "An · Track A". */
export const tracks = {
  A: "Track A",
  B: "Track B",
} as const;

export const learnerWithTrack = (alias: string, track: keyof typeof tracks) => `${alias} · ${tracks[track]}`;

// ---------- §3.1 Thang chất lượng một bài (0–4 + NULL) — chỉ gia sư/phụ huynh ----------
export type Score = 0 | 1 | 2 | 3 | 4 | null;

export const scoreLabels: Record<"0" | "1" | "2" | "3" | "4" | "null", { short: string; tooltip: string }> = {
  "0": { short: "Chưa thể hiện", tooltip: "Bài có cơ hội nhưng chưa làm được điều này" },
  "1": { short: "Còn thiếu nhiều", tooltip: "Có cố gắng nhưng thiếu phần chính" },
  "2": { short: "Được một phần", tooltip: "Làm được một phần yêu cầu" },
  "3": { short: "Đạt yêu cầu", tooltip: "Đạt mọi yêu cầu của mục này" },
  "4": { short: "Vững, rõ ràng", tooltip: "Đạt yêu cầu và làm rất chắc, rõ" },
  null: { short: "Bài này không có cơ hội thể hiện", tooltip: "Không chấm — khác với 0" },
};

/** Luôn hiển thị "3/4 · Đạt yêu cầu" — không bao giờ chỉ "3". NULL → câu riêng. */
export function formatScore(score: Score): string {
  if (score === null) return scoreLabels.null.short;
  return `${score}/4 · ${scoreLabels[String(score) as "0" | "1" | "2" | "3" | "4"].short}`;
}

// ---------- §3.2 Bậc năng lực ---------------------------------------------------------
export type CompetencyState =
  | "NOT_OBSERVED"
  | "SUPPORTED"
  | "DEVELOPING"
  | "INDEPENDENT"
  | "TRANSFERABLE"
  | "NEEDS_CONFIRMATION";

export const levelLabels: Record<CompetencyState, { label: string; step: string | null; explain: string }> = {
  NOT_OBSERVED: { label: "Chưa đủ bài để đánh giá", step: null, explain: "Cần thêm bài làm mới nhận xét được" },
  SUPPORTED: { label: "Làm được khi có gợi ý", step: "1/4", explain: "Làm được khi có câu mẫu, gợi ý hoặc cô nhắc" },
  DEVELOPING: { label: "Đang tiến bộ", step: "2/4", explain: "Đã tự làm được vài lần, chưa đủ chắc" },
  INDEPENDENT: { label: "Tự làm được", step: "3/4", explain: "Tự làm đúng nhiều lần, ở nhiều chủ đề, cô đã xác nhận" },
  TRANSFERABLE: { label: "Vận dụng được", step: "4/4", explain: "Vẫn nhớ sau ≥ 2 tuần và dùng được ở tình huống mới" },
  NEEDS_CONFIRMATION: { label: "Cần cô xem lại", step: null, explain: "Bài gần đây chưa tốt bằng trước — chưa hạ bậc" },
};

/** 5 bậc chính theo thứ tự hiển thị (thang 4 ô có chữ + "chưa đủ bài"). */
export const LEVEL_ORDER = ["NOT_OBSERVED", "SUPPORTED", "DEVELOPING", "INDEPENDENT", "TRANSFERABLE"] as const;

// ---------- §3.3 Mode ------------------------------------------------------------------
export type Mode = "PRACTICE" | "INDEPENDENT_CHECK" | "REVISION";

export const modeLabels: Record<Mode, { student: string; staff: string }> = {
  PRACTICE: { student: "Luyện tập (có gợi ý)", staff: "Bài luyện tập" },
  INDEPENDENT_CHECK: { student: "Bài tự làm — lần này chưa có gợi ý", staff: "Bài tự làm (không gợi ý)" },
  REVISION: { student: "Sửa bài", staff: "Bài sửa lại" },
};

// ---------- §3.3 Khái niệm khác (null = học sinh không thấy) ------------------------------
export const concepts = {
  inquiry: { student: "Chủ đề tuần này", staff: "Chủ đề" },
  step: { student: "Bước", staff: "Bước" },
  checkpoint: { student: null, staff: "Bài kiểm tra trong buổi học" },
  delayedCheck: { student: "Ôn lại bài cũ", staff: "Bài ôn lại sau 2 tuần" },
  transferCheck: { student: "Thử ở chủ đề mới", staff: "Bài dùng ở chủ đề mới" },
  blindReview: { student: null, staff: "Cô chấm trước, xem gợi ý của AI sau" },
  assistance: { student: "Gợi ý", staff: "Gợi ý đã dùng" },
  noAssistance: { student: null, staff: "Không dùng gợi ý" },
  sentenceFrame: { student: "Câu mẫu", staff: "Câu mẫu" },
  episode: { student: null, staff: "Bài làm được tính" },
  validation: { student: null, staff: "Duyệt" },
  transcriptRaw: { student: "Lời bạn nói (máy ghi thành chữ)", staff: "Chữ do máy ghi, chưa sửa" },
  transcriptEdit: { student: "Sửa chỗ máy nghe nhầm", staff: "Bản đã sửa chỗ máy nghe nhầm" },
  targetSet: { student: null, staff: "12 kỹ năng đang theo dõi" },
  coverage: { student: null, staff: 'Số kỹ năng đã "Tự làm được" / số đang theo dõi' },
} as const;

// ---------- §3.4 Tên kỹ năng (Track A, target set v1) -----------------------------------
export const skillNames: Record<string, { staff: string; student: string }> = {
  "A-L3-CAUSE-S": { staff: "Nói \"vì sao – nên\" (nguyên nhân – kết quả)", student: "Nói được vì sao và kết quả" },
  "A-L3-CAUSE-W": { staff: "Viết \"vì sao – nên\"", student: "Viết được vì sao và kết quả" },
  "A-L3-PARA-W": { staff: "Viết đoạn văn có câu mở đoạn rõ", student: "Viết đoạn văn rõ ý" },
  "A-L4-PROCESS-S": { staff: "Giải thích một quá trình khi nói", student: "Kể các bước của một hiện tượng" },
  "A-L1-PAST-W": { staff: "Dùng thì quá khứ khi viết", student: "Viết chuyện đã xảy ra" },
  "A-L2-CHUNKS": { staff: "Dùng từ mới của chủ đề", student: "Dùng từ mới vừa học" },
  "A-L2-COMPENSATE-S": { staff: "Xoay xở bằng tiếng Anh khi thiếu từ", student: "Nói tiếp được khi quên từ" },
  "A-T1-TEXT-R": { staff: "Đọc hiểu bài ngắn", student: "Hiểu bài đọc" },
  "A-T1-TEXT-L": { staff: "Nghe hiểu đoạn nói ngắn", student: "Hiểu bài nghe" },
  "A-T4-CAUSE": { staff: "Giải thích chuỗi nguyên nhân", student: "Giải thích vì sao" },
  "A-T7-OPINION": { staff: "Nêu ý kiến có lý do, ví dụ", student: "Nói ý kiến của mình" },
  "A-X1-TURN": { staff: "Nói trôi chảy (cô nghe trực tiếp)", student: "Nói liền mạch" },
};

// ---------- Kỹ năng đang theo dõi (S1) — chỉ phụ huynh/gia sư; học sinh không có trang này -------------
export const targetsPage = {
  link: "Kỹ năng đang theo dõi",
  title: (alias: string) => `Kỹ năng đang theo dõi · ${alias}`,
  count: (n: number) => `${n} kỹ năng đang theo dõi`,
  intro: "Đây là danh sách kỹ năng dùng để đánh giá tiến bộ. Khi có đủ bài làm đã duyệt, bậc của từng kỹ năng sẽ hiện ở đây.",
  dimension: "Nhóm",
  codeLabel: "mã",
  trackingOnlyTitle: "Theo dõi thêm (không tính vào đánh giá)",
  trackingOnlyEmpty: "Không có mục theo dõi thêm.",
  noSet: "Chưa chọn bộ kỹ năng cho em này.",
  back: "Về trang chủ",
  techInfoSet: "Bộ kỹ năng",
  techInfoCatalogue: "Danh mục",
  techInfoCodes: "Mã kỹ năng",
} as const;

// ---------- Giao bài (S2) — chỉ phụ huynh/gia sư; học sinh không có trang này ---------------------------------
export const inquiriesPage = {
  link: "Giao bài",
  title: (alias: string) => `Giao bài · ${alias}`,
  back: "Về trang chủ",
  availableTitle: "Bài có thể giao",
  availableEmpty: "Chưa có bài nào để giao cho em này.",
  weekRange: (week: number, from: string, to: string) => (week === 0 ? `Bài đầu vào · ${from} – ${to}` : `Tuần ${week} · ${from} – ${to}`),
  stepCount: (n: number) => `${n} bước`,
  dueLabel: "Hạn làm xong",
  assignButton: "Giao bài",
  assigning: "Đang giao…",
  assignDone: "Đã giao bài.",
  assignError: "Chưa giao được bài. Bạn thử lại sau ít phút.",
  assignedTitle: "Đã giao",
  assignedEmpty: "Chưa giao bài nào.",
  assignedOn: (date: string) => `Giao ngày ${date}`,
  dueOn: (date: string) => `Hạn ${date}`,
  stepLabel: (n: number) => `Bước ${n}`,
  minutes: (n: number) => `${n} phút`,
  scheduledFor: (date: string) => `Ngày làm: ${date}`,
  noDate: "Chưa xếp ngày",
  originalDate: (date: string) => `Ngày dự kiến ban đầu: ${date}`,
  skippedTag: "Đã bỏ qua",
  lastReason: (reason: string) => `Lý do gần nhất: ${reason}`,
  reschedule: "Đổi ngày",
  skip: "Bỏ bước",
  unskip: "Khôi phục bước",
  newDate: "Ngày mới",
  reasonLabel: "Lý do (bắt buộc)",
  reasonRequired: "Bạn nhập lý do (ít nhất 3 chữ) nhé.",
  dateRequired: "Bạn chọn ngày mới nhé.",
  dateOutOfRange: "Ngày này xa quá. Bạn chọn ngày từ 7 ngày trước đến 120 ngày sau hôm nay nhé.",
  save: "Lưu",
  cancel: "Thôi",
  saving: "Đang lưu…",
  eventError: "Chưa lưu được. Bạn thử lại sau ít phút.",
  sourcesTitle: "Tài liệu của chủ đề",
  sourceModality: { text: "Bài đọc", audio: "Bài nghe", video: "Video" } as Record<string, string>,
  /** Video chỉ là liên kết (O-F1): mở trang ngoài, app không nhúng trình phát. */
  videoLink: "Mở video ở trang ngoài",
  techInfoTemplate: "Mẫu bài",
  techInfoCodes: "Mã bước và kỹ năng",
} as const;

/** Nhãn bước theo loại hoạt động (UX guide chưa liệt kê — đặt cùng giọng với §3.3). Mã chỉ hiện trong "Thông tin kỹ thuật". */
export const activityLabels: Record<string, string> = {
  "ACT-SOURCE-QA": "Đọc hoặc nghe rồi trả lời câu hỏi",
  "ACT-CANVAS-BASIC": "Sắp xếp ý: ý chính – vì sao – ví dụ",
  "ACT-CANVAS-ADV": "Sắp xếp lập luận: ý kiến, bằng chứng, hạn chế, hướng khác",
  "ACT-SPEAK-MONO": "Tự nói và ghi lại",
  "ACT-SPEAK-LIVE": "Nói chuyện trực tiếp với cô",
  "ACT-WRITE": "Viết bài",
  "ACT-REVISE": "Sửa lại bài đã viết",
  "ACT-SELF-REVIEW": "Tự xem lại bài của mình",
};

/** Mục đích của bước (purpose) — nhãn cho phụ huynh/gia sư. */
export const purposeLabels: Record<string, string> = {
  baseline: "Bài đầu vào (không tính vào bậc)",
  checkpoint: concepts.checkpoint.staff,
  delayed_check: concepts.delayedCheck.staff,
  transfer_check: concepts.transferCheck.staff,
};

/**
 * Tên ngắn cho các chỉ số chỉ để theo dõi (aggregate_indicators). Chỉ số nào chưa có tên ở đây thì
 * hiện nguyên `definition_vi` của danh mục (câu dài, vẫn đúng nhưng nặng chữ).
 */
export const trackingNames: Record<string, string> = {
  "AGG-B-EXAM-MOCK": "Điểm đề thử tháng",
  "AGG-B-L1-ERRORS": "Lỗi ngữ pháp hay gặp",
};

// ---------- §5 Thông điệp mẫu -----------------------------------------------------------
export const messages = {
  submitted: "Đã nộp! Cô sẽ xem và gửi góp ý cho bạn.",
  aiPendingStudent: "Đã nhận bài. Góp ý sẽ có sau.",
  aiPendingStaff: "AI chưa xem được bài này — cần cô xem.",
  offline: "Mất mạng — bài vẫn đang được giữ trên máy. Đừng đóng trang nhé.",
  independentCheck: "Lần này bạn tự làm — chưa có gợi ý. Cứ nói hết ý, sai cũng không sao.",
  review: (topic: string) => `Hôm nay ôn: ${topic} Nói lại mà không xem ghi chép nhé.`,
  levelUp: (alias: string, level: string, skill: string, date: string) =>
    `${alias} đã lên '${level}' ở ${skill} — cô xác nhận ngày ${date}.`,
  needsReview: "Bài gần đây chưa tốt bằng trước. Giữ bậc hiện tại — cô xem lại khi rảnh.",
} as const;

// ---------- Lỗi API (trả về JSON, có thể hiện cho người dùng) ------------------------------
export const apiErrors = {
  400: "Thông tin gửi lên chưa đúng. Bạn kiểm tra lại nhé.",
  401: "Bạn cần đăng nhập lại.",
  403: "Tài khoản này không làm được việc đó.",
  404: "Không tìm thấy.",
  409: "Yêu cầu này bị trùng với một yêu cầu trước đó.",
  500: "Có lỗi xảy ra. Bạn thử lại sau ít phút.",
} as const;
