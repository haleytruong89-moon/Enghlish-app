/** Shapes the S5b-1 tutor screens work with (camelCase, already validated by shape.ts). */

export const RESULT_MODES = ["frame", "quick"] as const;
export type ResultMode = (typeof RESULT_MODES)[number];
export const RESULT_CONTEXTS = ["home", "class"] as const;
export type ResultContext = (typeof RESULT_CONTEXTS)[number];
/** Where a quick result counts from: a test or a practice (framed results are always tests). */
export const RESULT_SOURCES = ["test", "practice"] as const;
export type ResultSource = (typeof RESULT_SOURCES)[number];
export const RESULT_ATTEMPTS = ["first", "retry"] as const;
export type ResultAttempt = (typeof RESULT_ATTEMPTS)[number];
export const RECHECK_RESULTS = ["ok", "still_wrong", "not_asked"] as const;
export type RecheckResult = (typeof RECHECK_RESULTS)[number];

/** Where a mark of a weak point came from (column order of the "Điểm cần chú ý" table). */
export const WEAK_SOURCES = ["test", "lesson", "writing", "practice"] as const;
export type WeakSource = (typeof WEAK_SOURCES)[number];

/** Activity types whose work can get tags on the review screen (same list as eng_tag_episode in 0014). */
export const TAGGABLE_ACTIVITIES = ["ACT-WRITE", "ACT-REVISE"] as const;
export const MAX_WEAK_TAGS_PER_NOTE = 3;
export const MAX_WRITING_TAGS = 3;
export const MESSAGE_MAX = 500;
export const PARENT_NOTE_MAX = 1000;
export const STUDIED_MAX = 300;
/** A parent sees "waiting for the tutor" items only after this many days (the tutor tags first). */
export const PARENT_TAG_WAIT_DAYS = 2;

export type TagInfo = {
  key: string;
  label: string;
  group: string | null;
  custom: boolean;
};

export type FramePart = { key: string; name: string; from: number; to: number };
export type FrameItem = { n: number; part: string; tagKey: string };
export type ScaleBand = { min: number; max: number; label: string };
export type FrameView = {
  id: string;
  title: string;
  totalItems: number;
  parts: FramePart[];
  items: FrameItem[];
  scale: ScaleBand[] | null;
};

export type WeakEvent = {
  date: string;
  source: WeakSource;
  sourceId: string;
  items: number[];
  title: string | null;
  usedHint: boolean;
  inClass: boolean;
};

export type WeakPoint = {
  tagKey: string;
  label: string;
  group: string | null;
  sources: number;
  bySource: Record<WeakSource, number>;
  itemsWrong: { test: number; practice: number };
  asked: number;
  askedWrong: number;
  lastSeen: string | null;
  recheckDueOn: string | null;
  recheckDue: boolean;
  lastRecheck: { result: RecheckResult; on: string } | null;
  status: "repeat" | "watch" | "ok";
  events: WeakEvent[];
};

export type WeakPointsView = {
  policyDays: number | null;
  since: string | null;
  today: string;
  tags: WeakPoint[];
};

export type UntaggedItem = {
  resultId: string;
  /** english.members id of who recorded the result. */
  recordedByMember: string;
  recordedRole: "tutor" | "parent";
  /** Set by filterUntagged: the viewer recorded this result himself/herself. */
  own?: boolean;
  title: string;
  takenOn: string;
  createdAt: string;
  source: "test" | "practice";
  usedHint: boolean;
  inClass: boolean;
  items: number[];
};

export type RecentResult = {
  id: string;
  title: string;
  takenOn: string;
  total: number;
  correct: number;
};

export type LastNote = {
  id: string;
  sessionDate: string;
  studied: string | null;
  weakTagKeys: string[];
  message: string | null;
  authorRole: "tutor" | "parent";
};
