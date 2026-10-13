/**
 * Mọi chữ hiển thị trên giao diện — theo UX_COPY_GUIDE v0.1 (13/10/2026).
 * Không viết chữ giao diện rải rác trong component; thêm nhãn mới vào đây.
 * Học sinh: xưng "bạn", câu ngắn, không điểm, không mã (D28).
 */

// ---------- Cách gọi gia sư ---------------------------------------------------------
/**
 * Cách gọi gia sư trong chữ dành cho phụ huynh / gia sư (UX guide §2: "Cô/thầy", cấu hình được). Chưa có cài đặt
 * theo gia đình nên dùng một hằng số trung tính ở MỘT chỗ — đổi ở đây là đổi cả màn hình dành cho nhân viên.
 */
export const tutorHonorific = "thầy/cô";
/** Cùng cách gọi, viết hoa chữ đầu (đầu câu). */
export const tutorHonorificCap = tutorHonorific.charAt(0).toUpperCase() + tutorHonorific.slice(1);

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
  studentEmpty: `Hôm nay chưa có việc mới. ${tutorHonorificCap} sẽ giao bài sớm thôi.`,
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


// ---------- S5: duyệt bài, chấm từng kỹ năng, bài ngoài app, ghi chú buổi học — chỉ phụ huynh/gia sư ------------------------
/**
 * Neutral words for a code the labels do not know yet. Staff screens never print a raw code (activity type, skill id, mode...)
 * outside the collapsed "Thông tin kỹ thuật" block.
 */
export const fallbackLabels = {
  skill: "Kỹ năng khác",
  activity: "Hoạt động khác",
  mode: "Kiểu bài khác",
  provenance: "Cách ghi bài khác",
  purpose: "Mục đích khác",
  supportKind: "Gợi ý khác",
  help: "Gợi ý khác",
  keyKind: "Ghi chú",
  role: "Người duyệt",
  modality: "Tài liệu khác",
  autoResult: "Cần người xem",
} as const;

/** Nhãn nguồn của một bài (provenance). Học sinh không thấy các nhãn này. */
export const provenanceLabels: Record<string, string> = {
  in_app: "Làm trong app",
  pasted: "Dán từ nơi khác vào",
  tutor_live: `${tutorHonorificCap} ghi lại trong buổi học`,
  manual_import: "Bài trên giấy hoặc làm ngoài app",
};

/** Hỗ trợ đã khai báo / đã thấy (assistance_events.detail). */
export const assistanceLabels: Record<string, string> = {
  none: concepts.noAssistance.staff,
  notes: "Xem ghi chép",
  dictionary: "Dùng từ điển",
  asked_someone: "Hỏi người khác",
  ai_outside: "Dùng AI bên ngoài",
  pasted: "Dán từ nơi khác",
  unknown: "Chưa rõ có dùng gợi ý không",
};

/** Loại hỗ trợ người duyệt thấy (assistance_events.kind khi ghi từ màn duyệt). */
export const supportKindLabels: Record<string, string> = {
  tutor_prompt: `${tutorHonorificCap} nhắc`,
  frame: concepts.sentenceFrame.staff,
  notes: "Cho xem ghi chép",
  model_answer: "Cho xem bài mẫu",
  accessibility: "Hỗ trợ đọc/viết (ví dụ chữ to, thêm thời gian)",
  external_declared: "Hỗ trợ bên ngoài",
};

export const verificationLabels = {
  declared: (alias: string) => `${alias} tự khai`,
  observed: `${tutorHonorificCap} hoặc bố mẹ thấy tận mắt`,
  unknown: "Chưa rõ",
} as const;

export const reviewPage = {
  link: "Bài cần duyệt",
  linkCount: (n: number) => `Bài cần duyệt (${n})`,
  back: "Về trang chủ",
  backToInbox: "Về danh sách bài chờ xem",
  inboxTitle: "Bài chờ xem",
  inboxIntro: "Mở một bài, đọc bài làm bên cạnh yêu cầu của từng kỹ năng rồi chọn mức. Học sinh không thấy điểm.",
  inboxEmpty: "Chưa có bài nào chờ xem.",
  inboxEmptyDone: "Chưa có bài nào đã duyệt xong.",
  filtersLabel: "Lọc bài",
  filters: {
    todo: "Chưa duyệt xong",
    tutor: `Cần ${tutorHonorific} duyệt`,
    independent: "Bài tự làm",
    baseline: "Bài đầu vào",
    practice: "Bài luyện",
    done: "Đã duyệt xong",
  },
  open: "Mở bài",
  pagesLabel: "Chuyển trang",
  nextPage: "Xem các bài tiếp theo",
  firstPage: "Về đầu danh sách",
  stepOf: (alias: string, stepNo: number) => `${alias} · Bước ${stepNo}`,
  submittedAt: (when: string) => `Nộp ${when}`,
  attemptNo: (n: number) => `Lần ${n}`,
  progress: (decided: number, total: number) => (decided >= total ? `Đã duyệt xong ${total}/${total} kỹ năng` : `Đã chấm ${decided}/${total} kỹ năng`),
  waitingTutor: `Chờ ${tutorHonorific} duyệt`,
  waitingTutorWhy: `Bài kiểm tra trong buổi học hoặc bài ${tutorHonorific} nghe trực tiếp: chỉ ${tutorHonorific} duyệt. Bạn xem được nhưng không chấm.`,

  title: "Duyệt bài",
  workTitle: (alias: string) => `Bài làm của ${alias}`,
  noWork: "Chưa có nội dung bài làm.",
  itemGiven: (alias: string) => `${alias} trả lời`,
  itemBlank: "(để trống)",
  autoSummary: (correct: number, checked: number) => `${correct}/${checked} câu đúng (máy chấm)`,
  autoNeedsPerson: (n: number) => `${n} câu cần người xem`,
  autoResult: { correct: "Đúng", incorrect: "Chưa đúng", blank: "Để trống", needs_person: "Cần người xem" } as Record<string, string>,
  keyKinds: { answer: "Đáp án", sealed: "Ý chính cần có", note: "Lưu ý khi chấm" } as Record<string, string>,
  keysTitle: `Đáp án và lưu ý (chỉ ${tutorHonorific} và bố mẹ thấy)`,
  sourcesTitle: "Tài liệu của bước",
  recordedBy: (name: string) => `Ghi bởi ${name}`,
  sessionDate: (date: string) => `Ngày làm: ${date}`,
  durationWords: (sec: number | null, words: number | null) =>
    [sec !== null ? `${sec} giây` : null, words !== null ? `${words} từ` : null].filter(Boolean).join(" · "),
  supportTitle: concepts.assistance.staff,
  supportNone: concepts.noAssistance.staff,
  supportAdd: "Ghi thêm gợi ý bạn thấy",
  supportKind: "Loại gợi ý",
  supportSkills: "Gợi ý này ảnh hưởng kỹ năng nào",
  supportNote: "Ghi chú (không bắt buộc)",
  supportSeparate: "Gợi ý ghi riêng, không làm đổi mức đã chọn.",
  supportSaved: "Đã ghi gợi ý.",
  supportError: "Chưa ghi được gợi ý. Bạn thử lại sau ít phút.",
  supportNoteTooLong: (max: number) => `Ghi chú dài quá. Bạn viết ngắn lại, tối đa ${max} ký tự nhé.`,
  supportNoteCount: (n: number, max: number) => `${n}/${max} ký tự`,

  scoreTitle: "Chấm từng kỹ năng",
  scaleLegend: "Ý nghĩa thang điểm",
  criteriaTitle: "Để đạt 3/4 cần:",
  criteriaMachine: "máy kiểm tra được",
  criteriaPerson: "cần người xem",
  criteriaWarnings: {
    ticks_missing_for_pass: "Bạn chọn từ 3/4 trở lên nhưng chưa tick đủ các điều kiện ở trên. Bạn vẫn lưu được; hãy xem lại cho chắc.",
    all_ticked_below_pass: "Bạn đã tick đủ các điều kiện ở trên nhưng chọn dưới 3/4. Bạn vẫn lưu được; hãy xem lại cho chắc.",
    ticked_but_no_opportunity: "Bạn đã tick một điều kiện nhưng chọn \"không có cơ hội thể hiện\". Bạn vẫn lưu được; hãy xem lại cho chắc.",
  } as Record<string, string>,
  criteriaLive: `${tutorHonorific} nghe trực tiếp`,
  criteriaLiveLocked: `chỉ ghi được khi ${tutorHonorific} nghe trực tiếp`,
  levelsDetails: "Mô tả từng mức",
  levelOf: (n: number) => `Mức ${n}`,
  noteOptional: "Ghi chú cho kỹ năng này (không bắt buộc)",
  chosen: (formatted: string) => `${tutorHonorificCap} chấm: ${formatted}`,
  chosenParent: (formatted: string) => `Bạn chấm: ${formatted}`,
  notChosen: "Chưa chọn mức",
  liveOnly: (alias: string) => `Chỉ chấm khi ${tutorHonorific} nghe ${alias} nói trực tiếp trong buổi học. Bài này không chấm mục này.`,
  notASkill: "Chỉ số theo dõi thêm, không chấm ở đây.",
  decided: (formatted: string, who: string, when: string) => `Đã duyệt: ${formatted} · ${who}, ${when}`,
  decidedBy: { tutor: tutorHonorificCap, parent: "Bố mẹ" } as Record<string, string>,
  history: (n: number) => `Lịch sử quyết định (${n})`,
  historyReason: (reason: string) => `Lý do: ${reason}`,
  historyCurrent: "hiện hành",
  historyReplaced: "đã được thay",
  historyFirst: "Quyết định đầu",
  historyModified: "Đã sửa",
  cancel: "Thôi",
  currentDecision: (formatted: string) => `Hiện tại: ${formatted}`,
  modify: "Sửa quyết định",
  modifyReason: "Lý do sửa (bắt buộc)",
  modifyReasonRequired: "Bạn nhập lý do (ít nhất 3 chữ) nhé.",
  modifyPickRequired: "Bạn chọn mức mới nhé.",
  modifySame: "Mức mới đang trùng mức hiện tại.",
  modifySave: "Lưu thay đổi",
  modifySaved: "Đã lưu quyết định mới. Quyết định cũ vẫn nằm trong lịch sử.",
  summaryTitle: "Kết quả bài này",
  summaryNone: "Chưa chấm",
  save: "Lưu và duyệt",
  saving: "Đang lưu…",
  saveRemaining: (n: number) => `Còn ${n} kỹ năng chưa chọn mức`,
  saved: "Đã lưu và duyệt.",
  saveError: "Chưa lưu được. Bạn thử lại sau ít phút.",
  saveConflict: "Bài này vừa được duyệt ở một nơi khác. Mình tải lại trang cho bạn.",
  tutorOnlyDenied: `Bài này chỉ ${tutorHonorific} duyệt (bài kiểm tra trong buổi học hoặc bài ${tutorHonorific} nghe trực tiếp).`,
  readOnlyTutorOnly: `Bài này chỉ ${tutorHonorific} duyệt. Bạn xem được bài làm và các mức đã chấm, nhưng không chấm.`,
  blindNote: concepts.blindReview.staff,
  checkpointTag: concepts.checkpoint.staff,
  liveTag: `${tutorHonorificCap} nghe trực tiếp`,
  firstAttemptTag: "Lần đầu làm bước này",
  techInfoCodes: "Mã kỹ năng và bước",
  techInfoVersions: "Phiên bản mẫu bài, danh mục, bộ ngưỡng",
} as const;

export const offlineForm = {
  open: "Ghi bài làm ngoài app",
  title: "Ghi bài làm ngoài app",
  intro: "Dùng cho bài nói trong buổi học hoặc bài làm trên giấy. Chỉ ghi chữ, không ghi âm.",
  kind: "Bài này là",
  kindLive: `${tutorHonorificCap} nghe hoặc xem trực tiếp trong buổi học`,
  kindPaper: "Bài trên giấy hoặc làm ở chỗ khác (ghi lại sau)",
  date: "Ngày làm",
  text: "Nội dung (gõ hoặc dán chữ; nếu là bài nói, ghi lại những ý chính em nói)",
  duration: "Thời lượng (giây, không bắt buộc)",
  words: "Số từ (không bắt buộc)",
  help: "Em có dùng gợi ý không?",
  helpOptions: {
    none: "Không dùng gợi ý",
    notes: "Xem ghi chép",
    dictionary: "Dùng từ điển",
    asked_someone: "Hỏi người khác",
    ai_outside: "Dùng AI bên ngoài",
    unknown: "Chưa rõ",
  } as Record<string, string>,
  save: "Ghi lại",
  saving: "Đang ghi…",
  cancel: "Thôi",
  textRequired: "Bạn nhập nội dung bài làm nhé.",
  helpRequired: "Bạn chọn một mục về gợi ý nhé.",
  done: "Đã ghi bài.",
  openReview: "Mở bài để chấm",
  error: "Chưa ghi được. Bước này có thể chưa mở, đã làm xong (bài tự làm chỉ một lần) hoặc ngày chưa hợp lệ.",
  errorForbidden: `Chỉ ${tutorHonorific} ghi được bài do ${tutorHonorific} trực tiếp nghe hoặc xem.`,
  errorDateBeforeLast: "Ngày này sớm hơn lần làm gần nhất của bước này. Bạn chọn ngày bằng hoặc sau ngày đó nhé.",
  errorStepNotOpen: "Bước này chưa mở vào ngày bạn chọn. Bạn chọn ngày từ lúc bước mở nhé.",
  /** Shown to a parent instead of the form on a checkpoint step or a live-speaking step (D15, stricter for now). */
  tutorOnlyNote: `Chỉ ${tutorHonorific} ghi bài này.`,
} as const;

export const notesPage = {
  link: "Ghi chú buổi học",
  title: (alias: string) => `Ghi chú buổi học · ${alias}`,
  back: "Về trang chủ",
  intro: `${tutorHonorificCap} ghi lại buổi học: mục tiêu, điều thấy được, mức hỗ trợ và tối đa 3 việc tiếp theo. Học sinh không thấy ghi chú này.`,
  introParent: `Các ghi chú buổi học mà ${tutorHonorific} đã chia sẻ với bố mẹ.`,
  emptyTutor: "Chưa có ghi chú nào. Viết ghi chú đầu tiên bên dưới.",
  emptyParent: `Chưa có ghi chú nào được chia sẻ.`,
  newTitle: "Viết ghi chú mới",
  editTitle: "Sửa ghi chú (lưu thành bản mới, bản cũ vẫn giữ)",
  date: "Ngày học",
  goals: "Mục tiêu buổi học",
  observed: "Điều đã thấy được",
  supportLevel: "Mức hỗ trợ trong buổi",
  supportLevels: { none: "Không cần hỗ trợ", light: "Hỗ trợ ít", moderate: "Hỗ trợ vừa", heavy: "Hỗ trợ nhiều" } as Record<string, string>,
  nextActions: "Việc tiếp theo (tối đa 3)",
  nextAction: (n: number) => `Việc ${n}`,
  practised: "Kỹ năng đã luyện trong buổi",
  practisedLocked: "Kỹ năng đã ghi thì không bỏ được.",
  noTargets: "Chưa chọn bộ kỹ năng cho em này.",
  published: "Chia sẻ với bố mẹ",
  save: "Lưu ghi chú",
  saving: "Đang lưu…",
  saved: "Đã lưu ghi chú.",
  edit: "Sửa",
  cancel: "Thôi",
  error: "Chưa lưu được. Bạn thử lại sau ít phút.",
  empty: "Bạn viết ít nhất một mục (mục tiêu, điều đã thấy hoặc việc tiếp theo) nhé.",
  sharedTag: "Đã chia sẻ với bố mẹ",
  privateTag: "Chỉ gia sư thấy",
  olderVersions: (n: number) => `Bản cũ (${n})`,
  nextActionsTitle: "Việc tiếp theo",
  practisedTitle: "Kỹ năng đã luyện",
} as const;

/** Nhãn bước theo loại hoạt động (UX guide chưa liệt kê — đặt cùng giọng với §3.3). Mã chỉ hiện trong "Thông tin kỹ thuật". */
export const activityLabels: Record<string, string> = {
  "ACT-SOURCE-QA": "Đọc hoặc nghe rồi trả lời câu hỏi",
  "ACT-CANVAS-BASIC": "Sắp xếp ý: ý chính – vì sao – ví dụ",
  "ACT-CANVAS-ADV": "Sắp xếp lập luận: ý kiến, bằng chứng, hạn chế, hướng khác",
  "ACT-SPEAK-MONO": "Tự nói và ghi lại",
  "ACT-SPEAK-LIVE": `Nói chuyện trực tiếp với ${tutorHonorific}`,
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
  submitted: `Đã nộp! ${tutorHonorificCap} sẽ xem và gửi góp ý cho bạn.`,
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

// ---------- S4: màn hình làm bài của học sinh (UX guide §3.3 / §5; mockup Main + Studio) ------------------------------
/** Thứ trong tuần, bắt đầu từ Chủ nhật (Date#getUTCDay). */
export const weekdayNames = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"] as const;

export const work = {
  // trang chủ
  todayLine: (weekday: string, ddmm: string) => `${weekday} ${ddmm}`,
  nextTitle: "Việc tiếp theo",
  start: "Bắt đầu",
  minutes: (n: number) => `khoảng ${n} phút`,
  allDone: `Hôm nay bạn đã làm hết việc được giao. ${tutorHonorificCap} sẽ giao thêm sớm thôi.`,
  topicTitle: (title: string) => `${concepts.inquiry.student}: ${title}`,
  /** Chỉ đếm bước làm được trong app; bước làm theo phiếu / với thầy/cô tính riêng (offApp). */
  progress: (done: number, total: number) => `Xong ${done}/${total} bước`,
  offApp: (n: number) => `${n} bước làm theo phiếu hoặc với ${tutorHonorific}`,
  stateNow: "Bây giờ",
  stateDone: "Đã xong",
  stateLater: "Chưa làm",
  noAppYet: "Sắp có trên app — làm theo phiếu",
  withTutor: `Làm cùng ${tutorHonorific} trong buổi học`,
  /** Khóa nhãn trung tính do máy chủ trả cho bước app chưa làm được. */
  statusLabels: {
    with_tutor: `Làm cùng ${tutorHonorific} trong buổi học`,
    on_paper: "Sắp có trên app — làm theo phiếu",
  },
  // trang làm bài
  back: (title: string) => `‹ ${title}`,
  homeLink: "Về trang chủ",
  taskTitle: "Đề bài",
  readingTitle: "Bài đọc",
  listeningTitle: "Bài nghe",
  videoTitle: "Video",
  openAudio: "Mở bài nghe (trang mới)",
  openVideo: "Mở video (trang mới)",
  openLink: "Mở bài (trang mới)",
  noLink: `Bài này chưa có đường dẫn trong app. Bạn nhờ ${tutorHonorific} mở giúp nhé.`,
  byAuthor: (author: string) => `Tác giả: ${author}`,
  questionsTitle: "Câu hỏi",
  questionLabel: (n: number) => `Câu ${n}`,
  answerLabel: "Câu trả lời của bạn",
  answerHint: "Bạn gõ câu trả lời vào đây",
  writeTitle: "Viết bài của bạn",
  writeLabel: "Bài viết",
  writeHint: "Viết vài câu bằng tiếng Anh. Chưa chắc cũng cứ viết nhé.",
  wordCount: (n: number) => (n === 1 ? "1 từ" : `${n} từ`),
  selfCheckTitle: "Trước khi nộp, tự kiểm nhé",
  helpTitle: "Bạn đã dùng gợi ý nào?",
  helpHint: `Bạn chọn theo những gì bạn thật sự đã làm. Dùng gợi ý cũng không sao, ${tutorHonorific} chỉ cần biết để hiểu bạn đang ở đâu.`,
  help: {
    none: "Mình không dùng gợi ý nào",
    notes: "Mình xem ghi chép",
    dictionary: "Mình tra từ điển hoặc dịch",
    asked_someone: "Mình hỏi người khác",
    ai_outside: "Mình hỏi AI ngoài app",
  },
  pastedLabel: "Mình có dán chữ từ chỗ khác vào",
  pastedNote: `Bạn vừa dán chữ vào. ${tutorHonorificCap} sẽ biết đoạn đó không phải bạn tự gõ.`,
  submit: "Nộp bài",
  submitting: "Đang nộp…",
  submitAgain: "Nộp lần nữa",
  needAnswer: "Bạn trả lời ít nhất một câu rồi nộp nhé.",
  needText: "Bạn viết vài câu rồi nộp nhé.",
  needHelp: "Bạn chọn một mục về gợi ý trước khi nộp nhé.",
  submitError: "Chưa nộp được. Bài của bạn vẫn còn đây, bạn bấm nộp lại nhé.",
  submitConflict: "Bài này đã được nộp rồi. Bạn mở lại trang chủ để xem nhé.",
  submittedAt: (hhmm: string) => `Đã nộp lúc ${hhmm}`,
  alreadySubmitted: (hhmm: string) => `Bạn đã nộp bài này lúc ${hhmm}.`,
  /** Bài do người lớn ghi giúp (làm cùng thầy/cô hoặc trên giấy): chỉ một dòng trạng thái, không có nội dung. */
  doneOffline: `Bài này bạn đã làm cùng ${tutorHonorific} hoặc trên giấy, và đã được ghi lại rồi.`,
  mayRetry: "Bạn có thể làm lại để luyện thêm.",
  retry: "Làm lại",
  checkOnce: `Bài này chỉ làm một lần. ${tutorHonorificCap} sẽ xem và gửi góp ý cho bạn.`,
  savedAt: (hhmm: string) => `Đã tự lưu lúc ${hhmm}`,
  saving: "Đang lưu…",
  notSaved: "Chưa lưu được. Bài vẫn còn trên màn hình, bạn đừng đóng trang nhé.",
  otherTab: "Bài này vừa được lưu ở một chỗ khác. Bản bạn đang gõ đã được lưu đè lên.",
  notAvailable: "Bước này chưa mở hoặc không phải của bạn.",
} as const;
