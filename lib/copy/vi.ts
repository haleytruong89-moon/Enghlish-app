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
  intro: "Dùng tên đăng nhập (hoặc email) và mật khẩu bố mẹ đã tạo cho bạn.",
  login: "Tên đăng nhập hoặc email",
  password: "Mật khẩu",
  submit: "Đăng nhập",
  submitting: "Đang đăng nhập…",
  signOut: "Đăng xuất",
  errorInvalid: "Tên đăng nhập hoặc mật khẩu chưa đúng. Bạn thử lại nhé.",
  errorMissing: "Bạn nhập cả tên đăng nhập và mật khẩu nhé.",
  errorGeneric: "Chưa đăng nhập được. Bạn thử lại sau ít phút.",
} as const;

// ---------- Đổi mật khẩu (mọi vai trò) -----------------------------------------------
export const account = {
  changePassword: "Đổi mật khẩu",
  title: "Đổi mật khẩu",
  intro: "Đặt mật khẩu của riêng bạn (ít nhất 12 ký tự). Lần sau đăng nhập bằng mật khẩu mới. Mật khẩu này dùng chung cho Study Launcher (cùng một tài khoản).",
  newPassword: "Mật khẩu mới",
  confirmPassword: "Nhập lại mật khẩu mới",
  submit: "Lưu mật khẩu mới",
  submitting: "Đang lưu…",
  success: "Đã đổi mật khẩu. Lần sau đăng nhập bằng mật khẩu mới. Mật khẩu này dùng chung cho Study Launcher (cùng một tài khoản).",
  back: "Về trang chính",
  errorShort: "Mật khẩu mới cần có ít nhất 12 ký tự.",
  errorMismatch: "Hai ô mật khẩu chưa giống nhau. Bạn nhập lại nhé.",
  errorSame: "Mật khẩu mới cần khác mật khẩu đang dùng.",
  errorWeak: "Mật khẩu này dễ đoán quá. Bạn chọn mật khẩu khác nhé.",
  errorReauth: "Vì lý do an toàn, bạn hãy đăng xuất, đăng nhập lại rồi đổi mật khẩu.",
  errorSession: "Phiên đăng nhập đã hết. Bạn đăng nhập lại rồi thử đổi nhé.",
  errorGeneric: "Chưa đổi được mật khẩu. Bạn thử lại sau ít phút.",
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
  tag: "Nhãn khác",
  record: "Dữ liệu khác",
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
  errorStepNotOpen: "Bước này chưa mở vào ngày bạn chọn. Bạn chọn ngày từ lúc bước mở nhé. Nếu đây là bài trên giấy làm trước đó, hãy ghi lý do ở ô bên dưới.",
  backdateReason: "Lý do ghi ngày sớm hơn ngày giao",
  backdateHint: "Ví dụ: Nhập từ phiếu giấy pilot 17–19/10",
  backdateHelp: "Chỉ dùng cho bài trên giấy làm trước khi giao bài, tối đa 14 ngày trước ngày giao.",
  backdateRequired: "Bạn ghi lý do (ít nhất 5 ký tự) để lưu bài có ngày sớm hơn ngày giao nhé.",
  errorBackdateTooEarly: "Ngày này sớm hơn ngày giao quá 14 ngày. Bạn chọn ngày gần hơn nhé.",
  errorBackdateNotAllowed: "Chỉ ghi lùi ngày được với bước đã mở cùng lúc giao bài, và không với bài ôn sau 2 tuần hay bài chuyển sang chủ đề mới. Bạn chọn ngày từ lúc bước mở nhé.",
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
  // Ghi chú viết bằng "Ghi buổi học" (S5b-1)
  reinforceTitle: "Củng cố",
  messageTitle: "Lời nhắn cho em",
  noteForParentTitle: "Ghi chú cho phụ huynh",
  writeNew: "Ghi buổi học (mẫu mới, nhanh hơn)",
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
  429: "Bạn đã thử quá nhiều lần hôm nay. Bạn chờ đến mai hoặc nhờ người lớn nhé.",
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

// ---------- S5b-1: bài của gia sư - Hôm nay, ghi kết quả bài, ghi buổi học, điểm cần chú ý (chỉ phụ huynh/gia sư) ----------
/** Tên nguồn của một dấu nhãn (cột của bảng "Điểm cần chú ý"). */
export const weakSourceLabels = {
  test: "Bài kiểm tra",
  lesson: "Buổi học",
  writing: "Bài viết",
  practice: "Bài luyện",
} as const;

/** Lỗi của các form S5b-1 (khớp mã lỗi API). */
export const tutorWorkErrors = {
  generic: "Chưa lưu được. Bạn thử lại sau ít phút.",
  invalid: "Có thông tin chưa hợp lệ. Bạn kiểm tra lại số câu, ngày và nhãn nhé.",
  classTutorOnly: `Chỉ ${tutorHonorific} mới ghi được bài làm trong buổi học.`,
  forbidden: "Tài khoản này không làm được việc đó.",
  conflict: "Việc này đã được ghi trước đó (hoặc nhãn bị trùng). Bạn tải lại trang để xem.",
  duplicateFirst: "Bài này đã được ghi lần đầu — chọn “Làm lại” hoặc sửa bản đã ghi",
  offline: "Không kết nối được. Bạn kiểm tra mạng rồi thử lại nhé.",
  duplicateMonth: "Tháng này đã có báo cáo. Tải lại trang để sửa bản đã lưu.",
  badMonth: "Chọn một tháng trong 24 tháng gần đây, không phải tháng sau.",
  staleReport: "Báo cáo tháng này vừa được người khác sửa. Tải lại trang rồi sửa lại.",
  unknownGroup: "Nhóm này không có trong bản đồ kỹ năng. Tải lại trang rồi chọn lại.",
  alreadyGrouped: "Nhãn này đã được xếp vào nhóm khác. Tải lại trang để xem.",
} as const;

/** Màn "Xóa dữ liệu của em" (S5c, chỉ phụ huynh). */
export const purgePage = {
  link: "Xóa dữ liệu của em",
  title: (alias: string) => `Xóa dữ liệu · ${alias}`,
  back: "Về trang chủ",
  intro:
    "Việc này xóa vĩnh viễn bài làm, kết quả, ghi chú buổi học, bài luyện, file ảnh/PDF và tên đăng nhập ngắn của em trong app. Không hoàn tác được. App chỉ giữ lại một biên nhận nhỏ (mã và số lượng, không có nội dung) để biết ai đã xóa và khi nào.",
  keepsAccount: "Tài khoản đăng nhập (email) của em và của mọi người KHÔNG bị xóa. Phần của Study Launcher không bị đụng tới.",
  backupNote: "Bản sao lưu hằng tuần vẫn còn dữ liệu cũ cho đến khi tự hết hạn (khoảng 30 ngày).",
  needsMigration:
    "Màn này cần cập nhật cơ sở dữ liệu trước (SQL 0017). Bạn chưa xóa gì cả. Hãy áp file 0017_readiness.sql (Actions → Apply database migrations) rồi mở lại trang này.",
  countsTitle: "Sẽ bị xóa",
  countLine: (label: string, n: number) => `${label}: ${n}`,
  countsNone: "Không có dữ liệu nào để xóa ngoài hồ sơ của em.",
  countLabels: {
    audit_log: "Nhật ký thao tác về em",
    target_sets: "Bộ kỹ năng theo dõi",
    inquiry_instances: "Chủ đề được giao",
    activity_instances: "Bước trong chủ đề",
    instance_item_keys: "Khóa câu hỏi của bài",
    activity_instance_events: "Lần dời / bỏ qua bước",
    consents: "Đồng ý đã ghi",
    relationships: "Quan hệ với phụ huynh / gia sư",
    attempt_auto_checks: "Kết quả tự chấm",
    episodes: "Bài làm chờ duyệt",
    exposure_log: "Lần luyện kỹ năng",
    assistance_events: "Gợi ý đã dùng",
    artifact_versions: "Nội dung bài làm",
    attempts: "Lần nộp bài",
    working_drafts: "Bản nháp",
    validation_decisions: "Điểm do người chấm",
    observations: "Quan sát",
    lesson_notes: "Ghi chú buổi học",
    tag_marks: "Điểm cần chú ý",
    recheck_events: "Lần hỏi lại điểm yếu",
    results: "Kết quả bài",
    submissions: "Bài em gửi",
    assignment_events: "Lần giao / thu hồi bài luyện",
    assignments: "Bài luyện",
    files: "File ảnh / PDF",
    upload_tickets: "Phiếu tải file",
    reading_reports: "Báo cáo kỹ năng đọc tháng",
    login_names: "Tên đăng nhập ngắn",
    learners: "Hồ sơ của em",
    members: "Tài khoản của em trong app",
  } as Record<string, string>,
  testNote: "Đây là hồ sơ thử.",
  realTitle: "Đây là em thật, không phải hồ sơ thử",
  realConfirm: "Tôi hiểu đây là dữ liệu thật của em và việc xóa không hoàn tác được.",
  nameLabel: (alias: string) => `Gõ đúng tên “${alias}” để xác nhận`,
  submit: "Xóa dữ liệu của em",
  submitting: "Đang xóa…",
  done: "Đã xóa dữ liệu của em.",
  doneFiles: (n: number) => `Đã xóa ${n} file trong kho.`,
  filesLeft:
    "Dữ liệu trong database đã xóa, nhưng chưa xóa được file trong kho. Nhờ người hỗ trợ chạy lệnh dọn file mồ côi (npm run storage:orphans).",
  auditWarning: "Lưu ý: file đã xóa xong, nhưng chưa ghi được dòng \"đã xóa file\" vào nhật ký. Dữ liệu của em vẫn đã được xóa; bạn báo người hỗ trợ nếu cần bổ sung nhật ký.",
  homeLink: "Về trang chủ",
  errors: {
    name_mismatch: "Tên gõ chưa khớp. Bạn gõ lại đúng tên của em nhé.",
    real_needs_confirmation: "Bạn tích ô xác nhận (em thật) trước khi xóa.",
    generic: "Chưa xóa được. Bạn thử lại sau ít phút; dữ liệu chưa bị thay đổi nếu lần này báo lỗi.",
    offline: "Không kết nối được. Bạn kiểm tra mạng rồi thử lại nhé.",
  } as const,
} as const;

export const todayPage = {
  titlePrefix: "Hôm nay",
  title: (dateLabel: string) => `Hôm nay · ${dateLabel}`,
  actionsLabel: "Việc chính",
  noteAction: "Ghi buổi học",
  noteHint: "Học gì, 1–3 điểm cần củng cố, lời nhắn cho em · khoảng 3 phút",
  resultAction: "Ghi kết quả bài",
  resultHint: "Đề giấy/PDF: bấm câu sai · bài link: điểm + câu sai · khoảng 2 phút",
  assignAction: "Giao bài luyện",
  assignHint: "Dán link hoặc tải đề PDF · em gửi ảnh kết quả lại",
  practiceTitle: "Bài luyện đang mở",
  practiceNone: "Chưa có bài luyện nào đang mở.",
  practiceLine: (kind: string, due: string | null) => `${kind}${due ? ` · hạn ${due}` : ""}`,
  practiceNotDone: "Chưa làm",
  practiceOverdue: "Quá hạn",
  submittedBadge: "Em đã gửi",
  submittedLine: (title: string, when: string) => `${title} · ${when} · cần ghi kết quả`,
  submittedNote: "gắn nhãn xong sẽ vào điểm cần chú ý",
  practiceManage: "Quản lý bài luyện",
  attentionTitle: "Cần chú ý",
  seeAll: "Xem tất cả điểm cần chú ý",
  attentionEmpty: "Chưa có điểm nào cần chú ý. Khi bạn ghi kết quả bài hoặc buổi học, các điểm lặp lại sẽ hiện ở đây.",
  repeatBadge: (sources: number) => `${sources} nguồn`,
  repeatLine: (lastSeen: string | null) => (lastSeen ? `Sai ở nhiều nguồn khác nhau · gần nhất ${lastSeen}` : "Sai ở nhiều nguồn khác nhau"),
  recheckBadge: "Hỏi lại điểm yếu",
  recheckLine: (lastSeen: string | null, days: number | null) =>
    `${lastSeen ? `Lần gần nhất ${lastSeen}` : "Chưa có lần nào"}${days ? ` · đã đủ ${days} ngày` : ""}. Hỏi lại trong buổi học.`,
  untaggedBadge: "Chờ gắn nhãn",
  untaggedTutorLine: (title: string, dateLabel: string, items: string) => `${title} (${dateLabel}) · gắn nhãn cho câu ${items}`,
  untaggedParentBadge: `Chờ ${tutorHonorific}`,
  untaggedParentLine: (title: string, dateLabel: string, items: string) =>
    `${title} (${dateLabel}) · câu ${items} chưa có nhãn. Bố mẹ có thể gắn thay nếu ${tutorHonorific} chưa kịp.`,
  lastSessionTitle: (dateLabel: string) => `Buổi gần nhất · ${dateLabel}`,
  lastSessionNone: "Chưa có buổi học nào được ghi.",
  lastResultLine: (title: string, dateLabel: string) => `Bài gần nhất: ${title} · ${dateLabel}`,
  studied: "Học",
  reinforce: "Củng cố",
  message: "Nhắn em",
  writtenBy: "Người ghi",
  roleLabel: { tutor: "Gia sư", parent: "Phụ huynh" } as Record<string, string>,
  reviewBoxTitle: "Bài em đã nộp",
  reviewBoxLine: (n: number) => (n === 0 ? "Chưa có bài nào chờ xem." : `${n} bài chờ xem và chấm theo kỹ năng.`),
  reviewBoxOpen: "Mở hộp bài chờ xem",
  moreLinks: "Trang khác của em",
} as const;

export const resultPage = {
  link: "Ghi kết quả bài",
  title: (alias: string) => `Ghi kết quả bài · ${alias}`,
  back: "Về trang chủ",
  intro: "Một màn cho mọi loại bài: đề giấy/PDF và bài link (test-english, NotebookLM, Gemini). Chỉ ghi số liệu và nhãn, không lưu chữ của đề.",
  source: "Bài nào",
  paperOnly: "Bài trên giấy / bài link (ghi tay)",
  paperNote: "Chọn một bài đã giao trong app để xem ảnh em gửi bên cạnh; hoặc ghi bài trên giấy / bài link không giao qua app.",
  assignmentPick: "Bài đã giao",
  assignmentPaper: "Bài trên giấy / bài link (ghi tay)",
  assignmentOption: (title: string, waiting: boolean) => (waiting ? `${title} · em đã gửi` : title),
  supersedeTitle: "Bạn đang sửa kết quả đã ghi",
  supersedeNote: "Bài này đã có kết quả. Sửa lại cho đúng rồi lưu: bản mới thay bản cũ (bản cũ vẫn nằm trong lịch sử nhưng không tính nữa). Chỉ người đã ghi kết quả mới sửa được.",
  supersedeAgain: "Ghi thêm một lần làm lại (không thay bản cũ)",
  sentTitle: "Bài em gửi",
  sentNote: `${tutorHonorificCap} nhìn ảnh và điền số liệu bên dưới (chưa dùng AI đọc ảnh).`,
  sentNone: "Em chưa gửi gì cho bài này.",
  sentFirst: "Em khai: lần đầu",
  sentRetry: "Em khai: làm lại",
  sentHint: "Em khai: có bấm Hint",
  sentNoHint: "Em khai: không bấm Hint",
  sentHintNA: "Không áp dụng (đề PDF)",
  sentLink: "Link em gửi",
  sentImage: (n: number) => `Ảnh ${n} em gửi`,
  sentFile: (n: number) => `File ${n} em gửi`,
  sentBig: "xem to",
  sentBy: (byRole: "student" | "tutor" | "parent") => (byRole === "student" ? "" : byRole === "tutor" ? `Do ${tutorHonorific} nộp thay.` : "Do phụ huynh nộp thay."),
  sentConfirm: "Em tự khai hai ý trên: bạn kiểm tra lại trước khi lưu.",
  mode: "Cách nhập",
  modeFrame: "Đề có khung · bấm câu sai",
  modeQuick: "Nhập nhanh · điểm + câu sai",
  frame: "Đề",
  frameNone: "Chưa có khung đề nào cho em này. Dùng “Nhập nhanh”, hoặc nhờ phụ huynh nhập khung đề (workflow “Import test frame”).",
  gridTitle: "Bấm vào các câu sai",
  gridClear: "Bỏ đánh dấu hết",
  gridHelp: "Câu không bấm = đúng · câu bỏ trống = sai · nhãn của từng câu đã có sẵn trong khung đề.",
  partRange: (name: string, from: number, to: number) => `${name} · câu ${from}–${to}`,
  itemWrong: (n: number) => `Câu ${n}: sai`,
  itemRight: (n: number) => `Câu ${n}: đúng`,
  scoreTitle: "Kết quả",
  scoreOf: (correct: number, total: number) => `${correct}/${total}`,
  scaleLine: (label: string) => `Theo thang của đề: ${label}`,
  byTagTitle: "Sai theo nhãn",
  byTagLine: (items: string) => `câu ${items}`,
  noneWrong: "Chưa bấm câu nào sai.",
  quickTitle: "Tên bài",
  quickTitleHint: "Ví dụ: Unless, even if, provided… (test-english, trang 2)",
  quickTotal: "Tổng số câu",
  quickCorrect: "Số câu đúng",
  quickWrong: "Số các câu sai",
  quickWrongHint: "Gõ số câu, cách nhau bằng dấu phẩy. Ví dụ: 4, 7",
  quickWrongCount: (n: number, expected: number) => `Đã nhập ${n} câu sai · cần ${expected} (tổng trừ số câu đúng).`,
  tagEachTitle: "Gắn nhãn cho câu sai",
  tagEachHelp: "Để trống cũng được: câu chưa có nhãn sẽ hiện ở “Chờ gắn nhãn” để gắn sau.",
  tagItem: (n: number) => `Câu ${n}`,
  tagNone: "Chưa gắn nhãn",
  tagPick: "Chọn nhãn",
  kind: "Tính là",
  kindTest: "Bài kiểm tra",
  kindPractice: "Bài luyện",
  attempt: "Lần làm",
  attemptFirst: "Lần đầu",
  attemptRetry: "Làm lại",
  hint: "Có bấm Hint / xem gợi ý?",
  hintYes: "Có",
  hintNo: "Không",
  context: "Làm ở đâu",
  contextHome: "Ở nhà",
  contextClass: "Trong buổi học",
  contextClassTutorOnly: `Bài làm trong buổi học chỉ ${tutorHonorific} ghi được.`,
  date: "Ngày làm",
  howCounted: "Được tính thế nào",
  rules: [
    "Chỉ lần làm đầu vào bản đồ điểm yếu; làm lại ghi là luyện thêm.",
    "Có bấm Hint: vẫn ghi, kèm dấu “có gợi ý”.",
    "Bài kiểm tra và bài luyện chỉ là tín hiệu theo dõi: không tự đổi bậc kỹ năng.",
  ],
  cancel: "Huỷ",
  save: "Lưu kết quả",
  saving: "Đang lưu…",
  saved: (untagged: number) =>
    untagged > 0 ? `Đã lưu. Còn ${untagged} câu sai chưa có nhãn: gắn ở mục “Chờ gắn nhãn” bên dưới.` : "Đã lưu kết quả.",
  saveAnother: "Ghi bài khác",
  seeWeak: "Xem điểm cần chú ý",
  needFrame: "Bạn chọn một đề có khung nhé.",
  needTitle: "Bạn nhập tên bài nhé.",
  needTotal: "Bạn nhập tổng số câu (1–500) nhé.",
  needCorrect: "Số câu đúng phải từ 0 đến tổng số câu.",
  wrongInvalid: "Số các câu sai chưa đúng: chỉ gõ số từ 1 đến tổng số câu.",
  wrongCountMismatch: "Số câu sai phải bằng tổng số câu trừ số câu đúng.",
  // Mục "Chờ gắn nhãn"
  pendingTitle: "Chờ gắn nhãn",
  pendingIntro: (parent: boolean) =>
    parent ? `Những câu sai ${tutorHonorific} chưa kịp gắn nhãn. Bố mẹ gắn thay được.` : "Những câu sai chưa có nhãn. Gắn xong sẽ tính vào điểm cần chú ý.",
  pendingEmpty: "Không có câu nào đang chờ gắn nhãn.",
  pendingLine: (title: string, dateLabel: string) => `${title} · ${dateLabel}`,
  pendingSave: "Lưu nhãn",
  pendingSaved: "Đã gắn nhãn.",
  pendingNeed: "Bạn chọn nhãn cho ít nhất một câu nhé.",
} as const;

export const tagPicker = {
  search: "Tìm nhãn",
  searchPlaceholder: "Gõ để tìm nhãn…",
  addOther: "+ nhãn khác",
  addNamed: (label: string) => `Thêm nhãn mới “${label}”`,
  addTitle: "Nhãn riêng của gia đình",
  customGroup: "Nhãn riêng",
  added: (label: string) => `Đã thêm nhãn “${label}”.`,
  noMatch: "Không có nhãn nào khớp.",
  selected: (n: number, max: number) => `Đã chọn ${n}/${max}`,
  maxReached: (max: number) => `Chọn tối đa ${max} nhãn.`,
  customTag: "nhãn riêng",
  remove: (label: string) => `Bỏ nhãn ${label}`,
} as const;

/** SM-1: bản đồ kỹ năng trong ô chọn nhãn / kỹ năng (gia sư, phụ huynh). Tên mảng và nhóm đến từ bản đồ (cơ sở dữ liệu). */
export const skillMapCopy = {
  tabsLabel: "Mảng kỹ năng",
  unassigned: "Chưa xếp mảng",
  unassignedHelp: "Nhãn riêng thêm trước khi có bản đồ kỹ năng. Bấm “Xếp vào nhóm” để đặt vào đúng mảng.",
  emptyDomain: "Chưa có mục nào ở mảng này.",
  search: "Tìm trong mọi mảng",
  searchPlaceholder: "Gõ để tìm…",
  noMatch: "Không có mục nào khớp.",
  place: (domain: string, group: string) => `${domain} · ${group}`,
  chosen: (labels: string) => `Đang chọn: ${labels}`,
  domainLabel: "Mảng",
  groupLabel: "Nhóm",
  pickDomain: "— Chọn mảng —",
  pickGroup: "— Chọn nhóm —",
  groupRequired: "Chọn mảng và nhóm cho nhãn mới.",
  setGroup: "Xếp vào nhóm",
  setGroupSave: "Lưu nhóm",
} as const;

export const sessionNotePage = {
  link: "Ghi buổi học",
  title: (alias: string) => `Ghi buổi học · ${alias}`,
  back: "Về trang chủ",
  intro: "Khoảng 3 phút. Em đọc được “Lời nhắn cho em”; “Ghi chú cho phụ huynh” em không thấy.",
  date: "Ngày",
  studied: "Hôm nay học",
  studiedHint: "Ví dụ: Unit 7 · câu điều kiện hỗn hợp",
  practisedTitle: "Kỹ năng đã luyện hôm nay",
  practisedHelp: "Không bắt buộc. Chọn kỹ năng em đã luyện trong buổi để app tính ngày ôn lại; đã lưu thì không bỏ được.",
  practisedNone: "Em chưa có bộ kỹ năng theo dõi nên chưa chọn được.",
  weakTitle: "Điểm cần củng cố",
  weakHelp: "Chọn tối đa 3 điểm. Các điểm này sẽ được tính vào “Điểm cần chú ý”.",
  message: "Lời nhắn cho em",
  messageHelp: "Em sẽ đọc được. Nhắc một việc cụ thể, không ghi điểm.",
  messageCount: (n: number, max: number) => `${n}/${max}`,
  noteForParent: "Ghi chú cho phụ huynh",
  noteForParentHelp: "Em không thấy phần này.",
  recheckTitle: "Đến hạn hỏi lại điểm yếu",
  recheckLine: (label: string, lastSeen: string | null) => (lastSeen ? `${label} · lần gần nhất ${lastSeen}` : label),
  recheckAsk: "Hôm nay đã hỏi lại chưa?",
  recheckOptions: { ok: "Đã hỏi · ổn", still_wrong: "Còn sai", not_asked: "Chưa hỏi" } as const,
  recheckNote: "“Còn sai” sẽ đưa điểm này trở lại danh sách cần chú ý.",
  recheckConflict: "Một điểm không thể vừa “cần củng cố” vừa “đã hỏi · ổn”. Bạn bỏ một trong hai nhé.",
  recheckNone: "Chưa có điểm nào đến hạn hỏi lại.",
  homeworkTitle: "Chấm bài làm trong buổi",
  recordResult: "Ghi kết quả bài",
  save: "Lưu buổi học",
  saving: "Đang lưu…",
  saved: "Đã lưu buổi học.",
  savedNext: "Ghi thêm kết quả bài",
  empty: "Bạn ghi ít nhất một mục (học gì, kỹ năng đã luyện, nhãn cần củng cố, lời nhắn, ghi chú hoặc hỏi lại điểm yếu) nhé.",
  tooLong: "Có ô nhập dài quá giới hạn.",
  previousTitle: (dateLabel: string) => `Buổi trước · ${dateLabel}`,
  previousNone: "Chưa có buổi nào trước đó.",
  previousReinforce: "Củng cố",
  previousMessage: "Đã nhắn em",
  historyLink: "Xem tất cả ghi chú buổi học",
} as const;

export const weakPage = {
  link: "Điểm cần chú ý",
  title: (alias: string) => `Điểm cần chú ý · ${alias}`,
  back: "Về trang chủ",
  intro: "Gộp từ bài kiểm tra, ghi chú buổi học, bài viết đã chấm và bài luyện.",
  windows: { "4": "4 tuần", "8": "8 tuần", all: "Từ đầu" } as Record<string, string>,
  windowLabel: "Khoảng thời gian",
  colTag: "Điểm ngữ pháp / từ vựng",
  colRepeat: "Lặp lại",
  statusRepeat: "Lặp lại",
  statusWatch: "Theo dõi",
  statusOk: "Ổn",
  statusLine: (n: number) => (n >= 2 ? `${n} nguồn` : n === 1 ? "1 nguồn" : "—"),
  empty: "Chưa có điểm nào trong khoảng thời gian này.",
  legend:
    "“Lặp lại” = cùng một điểm sai ở ít nhất 2 nguồn khác nhau. Bài kiểm tra và bài luyện chỉ là tín hiệu theo dõi, không tự đổi bậc kỹ năng.",
  detailTitle: "Chi tiết",
  detailOpen: "Xem chi tiết",
  summary: (wrongTest: number, asked: number) => (asked > 0 ? `Trong các đề có khung: sai ${wrongTest}/${asked} câu thuộc điểm này.` : ""),
  timelineEvent: (source: string, title: string | null, items: string) =>
    `${source}${title ? ` · ${title}` : ""}${items ? ` · câu ${items}` : ""}`,
  hintTag: "có gợi ý",
  classTag: "trong buổi học",
  recheck: "Hỏi lại điểm yếu",
  recheckDue: (dueOn: string) => `Đến hạn từ ${dueOn}`,
  recheckWaiting: (dueOn: string) => `Sẽ đến hạn ${dueOn}`,
  recheckRule: (days: number) => `Cách ít nhất ${days} ngày sau lần gần nhất của điểm này.`,
  recheckNoPolicy: "Chưa có cài đặt số ngày hỏi lại nên chưa tính được hạn hỏi lại.",
  lastRecheck: (result: string, dateLabel: string) => `Lần hỏi lại gần nhất: ${result} (${dateLabel})`,
  recheckResultLabels: { ok: "ổn", still_wrong: "còn sai", not_asked: "chưa hỏi" } as const,
  pendingTitle: "Chờ gắn nhãn",
  pendingLink: "Gắn nhãn cho các câu sai",
  tilesTitle: "Theo mảng",
  tilesHint: "Bấm một mảng để xem từng điểm cần chú ý của mảng đó.",
  tileCount: (n: number) => (n === 0 ? "Chưa có điểm cần chú ý" : `${n} điểm cần chú ý`),
  tileWorst: (label: string) => `Cần chú ý nhất: ${label}`,
  tileAll: "Xem tất cả",
  tileReading: (n: number) => `${n} kỹ năng đọc cần chú ý`,
  allTitle: "Tất cả các mảng",
} as const;

export const readingPage = {
  link: "Nhập kỹ năng đọc tháng",
  title: (alias: string) => `Kỹ năng đọc tháng · ${alias}`,
  back: "Về Điểm cần chú ý",
  intro: "Nhập số câu và % đúng của từng kỹ năng theo báo cáo đọc trong tháng. Dòng để trống (hoặc số câu = 0) = tháng này không có câu.",
  monthLabel: "Tháng",
  colSkill: "Kỹ năng",
  colQuestions: "Số câu",
  colPct: "% đúng",
  noteLabel: "Ghi chú (không bắt buộc)",
  save: "Lưu báo cáo",
  saveCorrection: "Lưu bản sửa",
  saved: "Đã lưu.",
  editing: (month: string) => `Tháng ${month} đã có báo cáo. Sửa các ô rồi bấm “Lưu bản sửa” (bản cũ vẫn được giữ trong lịch sử).`,
  rowInvalid: "Số câu là số nguyên 0–500 (0 = không có câu); % đúng là số nguyên 0–100; nhập cả hai hoặc để trống cả hai.",
  needOneRow: "Nhập ít nhất một kỹ năng.",
  sectionTitle: "Kỹ năng đọc",
  sectionIntro: (month: string | null) =>
    month ? `Theo báo cáo tháng ${month}, so với báo cáo trước. Câu sai 6 tuần = từ bài kiểm tra và bài luyện.` : "Chưa có báo cáo kỹ năng đọc nào.",
  colLatest: (month: string | null) => (month ? `Tháng ${month}` : "Báo cáo mới nhất"),
  colPrev: (month: string | null) => (month ? `Tháng ${month}` : "Báo cáo trước"),
  colWrong6w: "Câu sai 6 tuần",
  status: { none: "Chưa có câu", thin: "Chưa đủ dữ liệu", weak: "Cần chú ý", ok: "Ổn" } as Record<string, string>,
  pctLine: (pct: number, q: number) => `${pct}% · ${q} câu`,
  rule: (min: number, pct: number) => `Dưới ${min} câu: chưa đủ dữ liệu để kết luận. Từ ${min} câu trở lên và dưới ${pct}%: cần chú ý. Đây là tín hiệu theo dõi, không đổi bậc kỹ năng.`,
  enter: "Nhập báo cáo tháng",
  monthGo: "Chọn",
  unavailable: "Chưa xem được bảng kỹ năng đọc lúc này. Bạn tải lại trang sau ít phút; các phần khác của trang vẫn dùng bình thường.",
};

export const writingTags = {
  title: "Nhãn cho bài viết",
  help: "Chọn tối đa 3 điểm ngữ pháp / từ vựng bài này còn sai. Chỉ lần làm đầu được tính vào “Điểm cần chú ý”.",
  save: "Lưu nhãn",
  saving: "Đang lưu…",
  saved: "Đã lưu nhãn.",
  alreadyTagged: "Nhãn đã lưu không bỏ được (để giữ lịch sử).",
  needOne: "Bạn chọn ít nhất một nhãn mới nhé.",
  tooMany: (max: number) => `Một bài viết có tối đa ${max} nhãn.`,
} as const;

// ---------- S5b-1 PR B: giao bài luyện (link / đề PDF), em gửi ảnh kết quả ----------------------------------------------------
/** Tên nguồn của một bài link (nhận ra từ tên miền). */
/** Names offered to the browser when it saves a file that someone SENT (never opened inside the site). */
export const downloadNames = {
  studentWork: "bai-em-gui",
} as const;

export const sourceLabels = {
  "test-english": "test-english",
  notebooklm: "NotebookLM",
  gemini: "Gemini",
  other: "Link khác",
} as const;

/** Giao bài luyện - dành cho phụ huynh / gia sư (máy tính là chính). */
export const assignPage = {
  link: "Giao bài luyện",
  title: (alias: string) => `Giao bài luyện · ${alias}`,
  back: "Về trang chủ",
  intro: "Giao một bài link (test-english, NotebookLM, Gemini) hoặc tải đề PDF lên cho em tải về. App chỉ lưu link và tên bài, không chép nội dung.",
  kind: "Loại bài",
  kindLink: "Link",
  kindPdf: "Đề PDF (tải lên, em tải về)",
  linkLabel: "Dán link bài luyện",
  linkPlaceholder: "https://test-english.com/…   hoặc link NotebookLM / Gemini",
  linkHelp: "App tự nhận ra nguồn: test-english, NotebookLM, Gemini (bài gia sư tự tạo). Chỉ nhận link https.",
  sourceDetected: (label: string) => `Nguồn: ${label}`,
  linkInvalid: "Link cần bắt đầu bằng https:// và không có khoảng trắng.",
  pdfLabel: "Đề PDF",
  pdfChoose: "Chọn file PDF",
  pdfHelp: "Tối đa 15 MB. Chỉ em này tải về được, không có link công khai. File tải lên chưa nằm trong bản sao lưu hằng tuần.",
  pdfChosen: (name: string) => `Đã chọn: ${name}`,
  answerLabel: "Đáp án (không bắt buộc)",
  answerChoose: "Chọn file đáp án",
  answerHelp: "Chỉ người lớn xem được, em không bao giờ thấy file đáp án. Dùng để dựng khung đề sau này.",
  titleLabel: "Tên bài",
  titlePlaceholder: "Ví dụ: Unless, even if, provided… (trang 2)",
  tagsLabel: "Luyện điểm (tối đa 3, không bắt buộc)",
  tagsHelp: "Chỉ gia sư và phụ huynh thấy nhãn này. Em không thấy.",
  dueLabel: "Hạn làm",
  frameLabel: "Khung đề (nếu bài này có khung)",
  frameNone: "Không có khung",
  studentSends: "Khi làm xong, em gửi ảnh trang kết quả (bài link) hoặc ảnh / file bài làm (đề PDF) và trả lời 2 câu: lần đầu? có bấm Hint?",
  submit: (alias: string) => `Giao cho ${alias}`,
  submitting: "Đang giao…",
  uploading: "Đang tải file lên…",
  done: "Đã giao bài. Em thấy bài này ở mục “Bài luyện”.",
  giveAnother: "Giao bài khác",
  needTitle: "Bạn nhập tên bài nhé.",
  needLink: "Bạn dán link bài (bắt đầu bằng https://) nhé.",
  needPdf: "Bạn chọn một file PDF nhé.",
  errors: {
    file_type: "File này không nhận được. Chỉ nhận PDF, ảnh png / jpg / webp.",
    file_empty: "File trống. Bạn chọn file khác nhé.",
    file_too_big: "File lớn quá (tối đa 15 MB).",
    file_missing: "File chưa tải lên xong. Bạn thử lại nhé.",
    file_mismatch: "File tải lên không khớp với file đã chọn. Bạn thử lại nhé.",
    invalid_link: "Link cần bắt đầu bằng https:// và không có khoảng trắng.",
    empty_submission: "Bạn thêm ít nhất một ảnh hoặc một link nhé.",
    already_reviewed: "Bài này đã có kết quả nên em không gửi lại được.",
    uploadFailed: "Chưa tải file lên được. Bạn kiểm tra mạng rồi thử lại nhé.",
    unreadable: "Không đọc được ảnh này. Bạn chọn ảnh khác nhé.",
    upload_limit: "Hôm nay đã tải lên quá nhiều file (tối đa 60 lần mỗi ngày cho mỗi em). Thử lại ngày mai.",
    generic: "Chưa lưu được. Bạn thử lại sau ít phút.",
  } as Record<string, string>,
  // bảng "Bài luyện đã giao"
  listTitle: "Bài luyện đã giao",
  listEmpty: "Chưa giao bài luyện nào.",
  colTitle: "Bài",
  colTags: "Luyện điểm",
  colDue: "Hạn",
  colSent: "Em đã gửi",
  colStatus: "Trạng thái",
  kindLabel: (kind: "link" | "pdf", source: string | null) => (kind === "pdf" ? "Đề PDF" : `Link · ${source ?? sourceLabels.other}`),
  statusNotDone: "Chưa làm",
  overdue: "Quá hạn",
  statusSent: "Em đã gửi",
  statusRecorded: "Đã ghi kết quả",
  statusRetracted: "Đã rút",
  sentLine: (when: string, first: boolean, hint: boolean | null, files: number, byRole: "student" | "tutor" | "parent") =>
    `${when} · ${first ? "lần đầu" : "làm lại"}${hint ? " · có Hint" : ""}${files > 0 ? ` · ${files} ảnh/file` : ""}${byRole === "student" ? "" : byRole === "tutor" ? ` · ${tutorHonorific} nộp thay` : " · phụ huynh nộp thay"}`,
  nothingSent: "—",
  recordResult: "Ghi kết quả",
  editResult: "Sửa kết quả",
  openFile: "Mở file đề",
  openAnswerKey: "Mở đáp án",
  openLink: "Mở link",
  retract: "Rút bài",
  retractConfirm: "Rút bài này? Em sẽ không còn thấy và không gửi được nữa.",
  retracting: "Đang rút…",
  retracted: "Đã rút bài.",
  submitFor: "Nộp thay",
  submitForTitle: (title: string) => `Nộp thay cho em · ${title}`,
  submitForHelp: "Dùng khi em đã làm xong nhưng chưa tự gửi được. Ảnh sẽ ghi là do người lớn nộp thay.",
  close: "Đóng",
} as const;

/** Phần dùng chung giữa em và người lớn khi gửi ảnh / file (chữ về nút, ảnh, lỗi). Xưng "bạn" với em. */
export const practiceStudent = {
  navNext: "Việc tiếp theo",
  navPractice: "Bài luyện",
  title: "Bài luyện của bạn",
  empty: `Chưa có bài luyện nào. ${tutorHonorificCap} sẽ giao bài sớm thôi.`,
  linkKind: (source: string, due: string | null) => `Bài link · ${source}${due ? ` · hạn ${due}` : ""}`,
  pdfKind: (assigned: string, due: string | null) => `Đề PDF · giao ${assigned}${due ? ` · hạn ${due}` : ""}`,
  openLink: "Mở bài",
  downloadPdf: "Tải đề về",
  // gửi bài link
  sendTitle: `Làm xong thì gửi ảnh trang kết quả cho ${tutorHonorific} nhé`,
  addImage: "Thêm ảnh kết quả",
  pasteHelp: "Chụp màn hình (Windows: Win + Shift + S) rồi bấm Ctrl + V ở đây, hoặc",
  chooseImage: "Chọn ảnh từ máy",
  cropHelp: "Chỉ chụp phần kết quả, không chụp cả màn hình.",
  pasteZone: "Khung dán ảnh: bấm Ctrl + V",
  imageAdded: (n: number) => (n === 1 ? "Đã có 1 ảnh" : `Đã có ${n} ảnh`),
  removeImage: "Bỏ ảnh này",
  changeImage: "đổi ảnh",
  imageAlt: (n: number) => `Ảnh ${n} bạn đã thêm`,
  linkOptional: "Link bài đã làm (không bắt buộc)",
  linkPlaceholder: "Dán link nếu trang có nút chia sẻ kết quả",
  firstQ: "Đây là lần làm đầu tiên của bạn?",
  firstYes: "Lần đầu",
  firstNo: "Không, mình làm lại",
  hintQ: "Bạn có bấm “Hint” không?",
  hintYes: "Có",
  hintNo: "Không",
  send: `Gửi cho ${tutorHonorific}`,
  sending: "Đang gửi…",
  uploading: "Đang tải ảnh lên…",
  // gửi bài PDF
  pdfSendTitle: "Làm xong: chụp ảnh bài làm (giấy) hoặc tải file đã điền lên đây. Được gửi nhiều ảnh.",
  chooseFiles: "Chọn ảnh hoặc file",
  pdfSend: `Nộp bài làm`,
  fileChip: (name: string) => name,
  // đã gửi
  sentAt: (time: string) => `Đã gửi lúc ${time}.`,
  sentLater: (dateLabel: string, time: string) => `Đã gửi ${dateLabel} lúc ${time}.`,
  sentWait: `${tutorHonorificCap} sẽ xem và nhắn lại những phần cần ôn.`,
  resend: "Sửa lại",
  reviewed: `${tutorHonorificCap} đã xem bài này.`,
  // cột bên
  reviewTitle: "Việc cần ôn",
  reviewNone: "Chưa có việc cần ôn nào.",
  messageTitle: `Lời nhắn của ${tutorHonorific}`,
  messageNone: "Chưa có lời nhắn.",
  // lỗi (câu ngắn, xưng "bạn")
  needImage: "Bạn thêm ít nhất một ảnh (hoặc dán link bài đã làm) nhé.",
  errors: {
    file_type: "Chỉ gửi được ảnh (png, jpg, webp) hoặc file PDF nhé.",
    file_empty: "Ảnh này trống. Bạn chọn ảnh khác nhé.",
    file_too_big: "Ảnh hoặc file lớn quá (tối đa 15 MB).",
    file_missing: "Ảnh chưa tải lên xong. Bạn thử lại nhé.",
    file_mismatch: "Ảnh tải lên chưa khớp. Bạn thử lại nhé.",
    unreadable: "Không đọc được ảnh này. Bạn chọn ảnh khác nhé.",
    invalid_link: "Link cần bắt đầu bằng https:// nhé.",
    empty_submission: "Bạn thêm ít nhất một ảnh (hoặc dán link bài đã làm) nhé.",
    already_reviewed: `${tutorHonorificCap} đã xem bài này nên bạn không gửi lại được nữa.`,
    uploadFailed: "Chưa tải ảnh lên được. Bạn kiểm tra mạng rồi thử lại nhé.",
    upload_limit: "Hôm nay bạn đã gửi quá nhiều ảnh rồi. Bạn thử lại ngày mai nhé.",
    generic: "Chưa gửi được. Bạn thử lại sau ít phút nhé.",
    tooMany: (max: number) => `Gửi tối đa ${max} ảnh một lần nhé.`,
  },
} as const;
