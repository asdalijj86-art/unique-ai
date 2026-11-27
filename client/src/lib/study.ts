/**
 * Study system (user order 2026-11-28, voice): study help for EVERY
 * level — small classes to college/university — with COMPLETE answers
 * to any study question (2026 current curriculum AND old material),
 * assignment/CV file creation inside the study flow with full
 * permission to do the whole job ("allow" system), and NO lying —
 * a complete answer or an honest "don't know / need more detail",
 * never a made-up or half answer.
 *
 * Pure module (no DOM at import time; storage is injected, the same
 * shape as lib/learnings) so the routing is unit-testable headlessly
 * with the real code — the same standard as lib/decision.ts.
 *
 * The server carries a plain-JS mirror — server/study.js — because
 * the server is plain Node ESM and cannot import client TypeScript.
 * The two are pinned together by scripts/test-study.mjs, which runs
 * BOTH over the same corpus and requires identical verdicts on every
 * string. If you change a pattern here, change it in server/study.js
 * too (and vice versa).
 *
 * Honest limits, stated in code wherever they apply:
 *  - 2026 curriculum answers come from the live model's own
 *    knowledge; when it is unsure it must say so plainly (see
 *    STUDY_NO_LIE_GUIDANCE) — nothing here verifies a syllabus.
 *  - A video LINK is a source as given: watching/fetching it needs
 *    the live model + internet on the user's laptop; pasted text
 *    works anywhere. The UI must never claim a video was watched
 *    when it was only linked (see VIDEO_SOURCE_RULE).
 */

// ---------------------------------------------------------------------------
// Class levels + subjects — GENERAL lists. No single board's syllabus
// is hardcoded anywhere: the model answers from the picked class +
// subject + the user's own book/chapter when given.
// ---------------------------------------------------------------------------

export type StudyLevelId = 'primary' | 'middle' | 'matric' | 'inter' | 'college';

export type StudyLevel = { id: StudyLevelId; label: string; classes: number[] };

export const STUDY_LEVELS: StudyLevel[] = [
  { id: 'primary', label: 'پرائمری (کلاس 1–5)', classes: [1, 2, 3, 4, 5] },
  { id: 'middle', label: 'مڈل (کلاس 6–8)', classes: [6, 7, 8] },
  { id: 'matric', label: 'میٹرک (کلاس 9–10)', classes: [9, 10] },
  { id: 'inter', label: 'انٹر (کلاس 11–12)', classes: [11, 12] },
  { id: 'college', label: 'کالج / یونیورسٹی', classes: [] },
];

export type StudySubject = { id: string; label: string; urdu: string };

export const STUDY_SUBJECTS: StudySubject[] = [
  { id: 'urdu', label: 'Urdu', urdu: 'اردو' },
  { id: 'english', label: 'English', urdu: 'انگریزی' },
  { id: 'maths', label: 'Maths', urdu: 'ریاضی' },
  { id: 'science', label: 'Science', urdu: 'سائنس' },
  { id: 'physics', label: 'Physics', urdu: 'طبیعیات' },
  { id: 'chemistry', label: 'Chemistry', urdu: 'کیمسٹری' },
  { id: 'biology', label: 'Biology', urdu: 'حیاتیات' },
  { id: 'islamiat', label: 'Islamiat', urdu: 'اسلامیات' },
  { id: 'pakistan-studies', label: 'Pakistan Studies', urdu: 'مطالعہ پاکستان' },
  { id: 'computer', label: 'Computer', urdu: 'کمپیوٹر' },
  { id: 'history', label: 'History', urdu: 'تاریخ' },
  { id: 'geography', label: 'Geography', urdu: 'جغرافیہ' },
  { id: 'economics', label: 'Economics', urdu: 'معاشیات' },
  { id: 'art', label: 'Art', urdu: 'آرٹ' },
];

export function studyLevelForClass(cls: number): StudyLevel | null {
  return STUDY_LEVELS.find((l) => l.classes.includes(cls)) ?? null;
}

// ---------------------------------------------------------------------------
// Study context — the picked class + subject (+ saved exams) that
// rides along with every study answer and every document built from
// the study flow. Stored per-device, like notes/learnings.
// ---------------------------------------------------------------------------

export type StudyExam = { label: string; month: number; day: number; subject?: string };

export type StudyContext = {
  levelId?: StudyLevelId;
  classNum?: number;
  subjectId?: string;
  /** Saved upcoming exams/classes — REAL items only, told by the
   *  user («میرا ریاضی کا امتحان 15 دسمبر کو ہے»). Never invented. */
  exams: StudyExam[];
};

export const STUDY_CONTEXT_STORAGE_KEY = 'unique-ai-study-context';

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function emptyStudyContext(): StudyContext {
  return { exams: [] };
}

export function loadStudyContext(storage: StorageLike): StudyContext {
  try {
    const raw = storage.getItem(STUDY_CONTEXT_STORAGE_KEY);
    if (!raw) return emptyStudyContext();
    const parsed = JSON.parse(raw) as Partial<StudyContext>;
    const exams = Array.isArray(parsed.exams)
      ? parsed.exams.filter((e) => e && typeof e.label === 'string' && typeof e.month === 'number' && typeof e.day === 'number')
      : [];
    return {
      levelId: parsed.levelId,
      classNum: typeof parsed.classNum === 'number' ? parsed.classNum : undefined,
      subjectId: typeof parsed.subjectId === 'string' ? parsed.subjectId : undefined,
      exams,
    };
  } catch {
    return emptyStudyContext();
  }
}

export function saveStudyContext(storage: StorageLike, ctx: StudyContext): void {
  try {
    storage.setItem(STUDY_CONTEXT_STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // storage unavailable — the reply matters, not the context
  }
}

export function studyLevelLabel(ctx: StudyContext): string {
  if (ctx.classNum) return `کلاس ${ctx.classNum}`;
  const level = STUDY_LEVELS.find((l) => l.id === ctx.levelId);
  return level ? level.label : '';
}

export function studySubjectLabel(ctx: StudyContext): string {
  const s = STUDY_SUBJECTS.find((x) => x.id === ctx.subjectId);
  return s ? s.urdu : '';
}

/**
 * Compact block attached to the chat request (the `study` field) so
 * the server's per-turn study directive knows the picked class +
 * subject + saved exams. Background facts only, never instructions.
 */
export function buildStudyContextBlock(ctx: StudyContext): string {
  const parts: string[] = [];
  const level = studyLevelLabel(ctx);
  if (level) parts.push(`Class: ${level}`);
  const subject = studySubjectLabel(ctx);
  if (subject) parts.push(`Subject: ${subject}`);
  for (const e of ctx.exams || []) {
    parts.push(`Upcoming exam: ${e.label} on ${e.day}/${e.month}`);
  }
  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// Detection — Urdu, Roman Urdu, English.
//
// Two shapes, like the persona summon rules:
//  - isStudyOpenOrder: an EXPLICIT order to open study mode
//    («سٹڈی کھولو», "open study mode") — the panel comes forward.
//  - isStudyMessage: any study intent (a question, homework, exam
//    prep, an assignment) — the message goes to the brain WITH the
//    study directive + study context; it does NOT open the panel by
//    itself, because a question deserves an answer, not a screen.
//  - isStudyDocumentOrder: «اسائنمنٹ بناؤ» / «سی وی بناؤ» — opens
//    Document Studio with the study context carried over.
// ---------------------------------------------------------------------------

function normalizeStudyText(raw: string): string {
  return String(raw || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

const STUDY_OPEN_PATTERNS: RegExp[] = [
  /سٹڈی\s*(کھولو|کھول|شروع|موڈ|سٹوڈیو)/,
  /اسٹڈی\s*(کھولو|کھول|شروع|موڈ|سٹوڈیو)/,
  /پڑھائی\s*(شروع|کھولو|موڈ)/,
  /سٹڈی\s*موڈ/,
  /study\s*(mode|studio)?\s*(kholo|khol|shuru|open|start)/i,
  /(open|start)\s+(the\s+)?study\s*(mode|studio)?/i,
  /\bstudy\s+mode\b/i,
  /\bstudy\s+studio\b/i,
];

export function isStudyOpenOrder(rawText: string): boolean {
  const text = normalizeStudyText(rawText);
  if (!text) return false;
  return STUDY_OPEN_PATTERNS.some((re) => re.test(text));
}

const STUDY_MESSAGE_PATTERNS: RegExp[] = [
  // Urdu — the study words themselves.
  /سٹڈی/,
  /اسٹڈی/,
  /پڑھائی/,
  /پڑھاؤ/,
  /کتاب/,
  /امتحان/,
  /پیپر/,
  /ہوم\s*ورک/,
  /ہومورک/,
  /سوال/,
  /مضمون/,
  /خلاصہ/,
  /ریاضی/,
  /سائنس/,
  /طبیعیات/,
  /کیمسٹری/,
  /حیاتیات/,
  /اسلامیات/,
  /مطالعہ\s*پاکستان/,
  /کمپیوٹر\s*(کا\s*)?(سوال|سبق|مضمون|کتاب|پیپر|امتحان|ٹیسٹ)/,
  /کلاس\s*\d/,
  /جماعت\s*\d/,
  /نصاب/,
  /سبق/,
  /ٹیچر\s*(نے|کا|کی)/,
  /اسکول\s*(کا|کی|میں)/,
  /کالج\s*(کا|کی|میں|والا)/,
  /یونیورسٹی\s*(کا|کی|میں|والا)/,
  /ریویژن/,
  /مشق\s*سوالات/,
  /پاسٹ\s*پیپر/,
  /ٹیسٹ\s*(ہے|دو|دیں|کی تیاری|کب)/,
  /تیاری\s*(کرنی|کرو|کرنی ہے|کرنی ھے)/,
  // Roman Urdu.
  /\bstudy\b/i,
  /\bparhai\b/i,
  /\bpadhai\b/i,
  /\bkitab\b/i,
  /\bimtihan\b/i,
  /\bhomework\b/i,
  /\bassignment\b/i,
  /\bsawal\b/i,
  /\bmazmoon\b/i,
  /\bkhulasa\b/i,
  /\btest\b/i,
  /\bexam\b/i,
  /\bquiz\b/i,
  /\bnotes\b/i,
  /\brevision\b/i,
  /\bsyllabus\b/i,
  /\btextbook\b/i,
  /\bchapter\b/i,
  /\bclass\s*\d/i,
  /\bmaths?\b/i,
  /\bscience\b/i,
  /\bphysics\b/i,
  /\bchemistry\b/i,
  /\bbiology\b/i,
  /\bislamiat\b/i,
  /\bpakistan\s+studies\b/i,
  /\bcomputer\b/i,
  /\bpast\s+paper\b/i,
  /\bmock\s+test\b/i,
  // English — word-boundary shapes only, so "latest" / "contest"
  // / "I have a question" never fire on ordinary chat.
  /\bhomework\b/i,
  /\bassignment\b/i,
  /\bexam\b/i,
  /\bquiz\b/i,
  /\brevision\b/i,
  /\bsyllabus\b/i,
  /\btextbook\b/i,
  /\bpast\s+paper\b/i,
  /\bmock\s+(test|exam|question)/i,
  /\bclass\s*\d{1,2}\b/i,
  /\bgrade\s*\d{1,2}\b/i,
  /\bsolve\s+(this|the)\b/i,
  /\bwhat\s+is\s+(photosynthesis|algebra|gravity|fractions?)\b/i,
];

export function isStudyMessage(rawText: string): boolean {
  const text = normalizeStudyText(rawText);
  if (!text) return false;
  return STUDY_MESSAGE_PATTERNS.some((re) => re.test(text));
}

const STUDY_DOCUMENT_PATTERNS: RegExp[] = [
  /اسائنمنٹ\s*بناؤ/,
  /اسائنمنٹ\s*بنا\s*(دو|دیں|دے)/,
  /اسائنمنٹ\s*لکھ/,
  /سی\s*وی\s*بناؤ/,
  /سی\s*وی\s*بنا\s*(دو|دیں|دے)/,
  /سی\s*وی\s*لکھ/,
  /cv\s*(banao|bana\s*do|banado|make|likh)/i,
  /assignment\s*(banao|bana\s*do|banado|make|likh)/i,
  /\b(make|create|write)\s+(my\s+)?(assignment|cv|resume)\b/i,
  /\bmake\s+(an?\s+)?assignment\b/i,
  /\bmake\s+(my\s+)?cv\b/i,
];

/** True for «اسائنمنٹ بناؤ» / «سی وی بناؤ» (+ Roman/English). */
export function isStudyDocumentOrder(rawText: string): boolean {
  const text = normalizeStudyText(rawText);
  if (!text) return false;
  return STUDY_DOCUMENT_PATTERNS.some((re) => re.test(text));
}

/** 'assignment' or 'cv' — which document the order asks for. */
export function studyDocumentKind(rawText: string): 'assignment' | 'cv' | null {
  const text = normalizeStudyText(rawText);
  if (!text) return null;
  if (/(سی\s*وی|cv|resume)/i.test(text)) return 'cv';
  if (/(اسائنمنٹ|assignment)/i.test(text)) return 'assignment';
  return null;
}

/**
 * The topic left after stripping the document order words, e.g.
 * «فوٹوسنتھیسز پر اسائنمنٹ بناؤ» → «فوٹوسنتھیسز». '' when the order
 * names no topic — the studio then asks for it, never invents one.
 */
export function extractDocumentTopic(rawText: string): string {
  let text = normalizeStudyText(rawText);
  text = text
    .replace(/پر\s*(اسائنمنٹ|سی\s*وی)/gi, ' ')
    .replace(/(اسائنمنٹ|assignment)\s*(بناؤ|بنا\s*(دو|دیں|دے)|لکھ\w*|banao|bana\s*do|banado|make|likh)/gi, ' ')
    .replace(/(سی\s*وی|cv|resume)\s*(بناؤ|بنا\s*(دو|دیں|دے)|لکھ\w*|banao|bana\s*do|banado|make|likh)/gi, ' ')
    .replace(/\b(make|create|write)\s+(my\s+)?(assignment|cv|resume)\b/gi, ' ')
    // A topic named FIRST («فوٹوسنتھیسز پر اسائنمنٹ بناؤ») leaves a
    // bare trailing verb once «پر اسائنمنٹ» is stripped — drop it.
    .replace(/(بناؤ|بنا\s*(دو|دیں|دے)|لکھ\w*|banao|bana\s*do|banado|make)\s*$/gi, ' ')
    .replace(/(مجھے|میرا|میری|mujhe|mera|meri|please|براہ کرم|ذرا)\s*/gi, ' ')
    .replace(/[۔؟?!.،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

// ---------------------------------------------------------------------------
// Class + subject extraction from a message — «میں کلاس 9 میں ہوں» /
// "class 9" / «فزکس کا سوال». Digits only: no guessing from words.
// ---------------------------------------------------------------------------

export function detectStudyClass(rawText: string): { levelId: StudyLevelId; classNum: number } | null {
  const text = normalizeStudyText(rawText);
  const m = text.match(/(?:کلاس|جماعت|class|grade)\s*(\d{1,2})/i);
  if (!m) return null;
  const classNum = parseInt(m[1], 10);
  if (classNum < 1 || classNum > 12) return null;
  const level = studyLevelForClass(classNum);
  if (!level) return null;
  return { levelId: level.id, classNum };
}

const SUBJECT_MATCHERS: { id: string; re: RegExp }[] = [
  { id: 'urdu', re: /(اردو|urdu)/i },
  { id: 'english', re: /(انگریزی|english)/i },
  { id: 'maths', re: /(ریاضی|maths?|algebra|الجبرا)/i },
  { id: 'science', re: /(سائنس|science)/i },
  { id: 'physics', re: /(طبیعیات|فزکس|physics)/i },
  { id: 'chemistry', re: /(کیمسٹری|chemistry)/i },
  { id: 'biology', re: /(حیاتیات|بیالوجی|biology)/i },
  { id: 'islamiat', re: /(اسلامیات|islamiat)/i },
  { id: 'pakistan-studies', re: /(مطالعہ\s*پاکستان|pakistan\s+studies)/i },
  { id: 'computer', re: /(کمپیوٹر|computer)/i },
  { id: 'history', re: /(تاریخ|history)/i },
  { id: 'geography', re: /(جغرافیہ|geography)/i },
  { id: 'economics', re: /(معاشیات|economics)/i },
  { id: 'art', re: /(آرٹ|\bart\b)/i },
];

export function detectStudySubject(rawText: string): string | null {
  const text = normalizeStudyText(rawText);
  // Pakistan Studies first: it contains no shorter subject word, but
  // keep the order explicit so a longer name always wins.
  for (const s of SUBJECT_MATCHERS) {
    if (s.re.test(text)) return s.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Exam dates — «میرا ریاضی کا امتحان 15 دسمبر کو ہے» / "my maths exam
// is on 15 December" / "15/12". A REAL stored date only: the upcoming
// trigger fires on these and nothing else.
// ---------------------------------------------------------------------------

const URDU_MONTHS: Record<string, number> = {
  'جنوری': 1, 'فروری': 2, 'مارچ': 3, 'اپریل': 4, 'مئی': 5, 'جون': 6,
  'جولائی': 7, 'اگست': 8, 'ستمبر': 9, 'اکتوبر': 10, 'نومبر': 11, 'دسمبر': 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const ROMAN_MONTHS: Record<string, number> = {
  janwari: 1, janvary: 1, farwari: 2, february: 2, march: 3, aprel: 4, april: 4,
  mayi: 5, mai: 5, june: 6, jolai: 7, july: 7, agast: 8, august: 8,
  satambar: 9, september: 9, aktobar: 10, october: 10, nawambar: 11, november: 11,
  dasambar: 12, december: 12, disambar: 12,
};

function isExamSentence(text: string): boolean {
  return /(امتحان|پیپر|ٹیسٹ|exam|paper|test|imtihan)/i.test(text);
}

export function extractExamDate(rawText: string): StudyExam | null {
  const text = normalizeStudyText(rawText);
  if (!text || !isExamSentence(text)) return null;
  // Label: the subject if named, else the exam word itself.
  const subjectId = detectStudySubject(text);
  const subjectLabel = subjectId ? (STUDY_SUBJECTS.find((s) => s.id === subjectId)?.urdu ?? '') : '';
  const label = subjectLabel ? `${subjectLabel} کا امتحان` : 'امتحان';
  // "15 دسمبر" / "15 December" / "15 disambar".
  const wordMonth = text.match(/(\d{1,2})\s*([^\s\d.,،]+)/);
  if (wordMonth) {
    const day = parseInt(wordMonth[1], 10);
    const word = wordMonth[2];
    const month = URDU_MONTHS[word] ?? EN_MONTHS[word.toLowerCase()] ?? ROMAN_MONTHS[word.toLowerCase()];
    if (month && day >= 1 && day <= 31) return { label, month, day, subject: subjectId ?? undefined };
  }
  // "15/12" / "15-12".
  const slash = text.match(/(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?/);
  if (slash) {
    const day = parseInt(slash[1], 10);
    const month = parseInt(slash[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return { label, month, day, subject: subjectId ?? undefined };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Exam preparation — revision plans, mock/past-paper practice, time
// management. Preparation help only: study, revise, practise.
// ---------------------------------------------------------------------------

const EXAM_PREP_PATTERNS: RegExp[] = [
  /ریویژن\s*پلان/,
  /ریویژن\s*(کرو|کرنی|کرنی ہے|چاہیے)/,
  /مشق\s*سوالات/,
  /مشق\s*(دو|دیں|کرو)/,
  /پاسٹ\s*پیپر/,
  /پریکٹس\s*(سوالات|ٹیسٹ|کرو)/,
  /موک\s*(ٹیسٹ|پیپر|سوالات)/,
  /وقت\s*کا\s*انتظام/,
  /ٹائم\s*مینجمنٹ/,
  /time\s*management/i,
  /revision\s*plan/i,
  /practice\s*questions?/i,
  /mock\s*(test|exam|questions?)/i,
  /past\s*papers?/i,
];

export function isExamPrepRequest(rawText: string): boolean {
  const text = normalizeStudyText(rawText);
  if (!text) return false;
  return EXAM_PREP_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// Video link OR pasted text as the assignment source (standing
// video-to-document rule): note EVERYTHING from it, copy it all
// exactly, complete the assignment from it, swapping in ONLY the
// user's own name + ID.
// ---------------------------------------------------------------------------

export type StudySource = { kind: 'video' | 'text'; value: string };

export function classifyStudySource(input: string): StudySource | null {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/https?:\/\/\S+/i.test(text) || /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)/i.test(text)) {
    const url = text.match(/https?:\/\/\S+/i)?.[0] ?? text.trim().split(/\s+/)[0];
    return { kind: 'video', value: url };
  }
  return { kind: 'text', value: text };
}

/**
 * VIDEO SOURCE RULE — the honest limit, in the UI's own words: a
 * video link is used as the source AS GIVEN. Watching/fetching the
 * video needs the live model + internet on the user's laptop; pasted
 * text works anywhere. The UI must never say a video was watched
 * when it was only linked.
 */
export const VIDEO_SOURCE_RULE =
  'A video link is a source as given: note everything from it, copy it all exactly, and complete the assignment from it, swapping in ONLY the user\u2019s own name + ID. Watching or fetching a video link needs the live model + internet on the user\u2019s laptop; pasted text works anywhere. Never claim a video was watched when it was only linked.';

export const VIDEO_SOURCE_HONEST_NOTE =
  'ویڈیو لنک ماخذ کے طور پر جڑ گیا ہے — ویڈیو دیکھنا آپ کے لیپ ٹاپ پر لائیو ماڈل + انٹرنیٹ سے ہوگا، یہاں صرف لنک بطور ماخذ محفوظ ہے۔';

export const TEXT_SOURCE_NOTE =
  'متن ماخذ کے طور پر جڑ گیا ہے — اسائنمنٹ اسی متن سے بنے گی، آپ کا نام اور رول نمبر ہی بدلے جائیں گے۔';

// ---------------------------------------------------------------------------
// Guidance records — the canonical client-side mirrors of the ADD-ONLY
// server prompt entries (same mirror pattern as FAST MIND / OWN
// DECISION in lib/persona.ts). They change NO routing.
// ---------------------------------------------------------------------------

export const STUDY_GUIDANCE =
  'Study help covers every level from small classes to college/university, any subject, 2026 current curriculum and old material. Every study answer is complete and structured — definition, clear explanation, examples, key points, and an exam-style answer where it fits; step-by-step working for maths and numericals; matched to the picked class level. If the class, subject, board, book or chapter is missing AND the answer depends on it, ask ONE clear question instead of giving a half answer. Never give a partial answer dressed up as complete.';

export const STUDY_NO_LIE_GUIDANCE =
  'Never invent facts, dates, formulas, syllabus contents or curriculum details for a study answer. Answer the 2026 curriculum from the model\u2019s own knowledge; when unsure, say so plainly in Urdu («یہ مجھے یقینی طور پر نہیں آتا») and say what detail would settle it. A complete answer or an honest «don\u2019t know / need more detail» — never a made-up or half answer.';

/**
 * HUMAN WRITING RULE — assignments/CVs must read like a person wrote
 * them: natural varied sentences, a personal voice, no robotic AI
 * phrasing, no telltale AI formatting habits (no excessive em-dashes,
 * no "moreover / furthermore" chains, no generic AI intros like
 * "In conclusion" / "It is important to note"). The Document Studio
 * draft generator follows this rule; the server prompt carries it too,
 * so chat-written assignments/CVs follow it as well.
 */
export const HUMAN_WRITING_RULE =
  'Write like a person, not like an AI: natural varied sentences, a personal voice, no robotic phrasing, no excessive em-dashes, no "moreover / furthermore" chains, no generic AI intros such as "In conclusion" or "It is important to note". An assignment or CV built here must read like a real student or job-seeker wrote it, so nobody can tell AI made it.';

/** Phrases the human-writing rule forbids in generated documents. */
export const HUMAN_WRITING_BANNED_PHRASES = [
  'In conclusion',
  'It is important to note',
  'moreover',
  'furthermore',
  'In summary',
  'delve',
];
