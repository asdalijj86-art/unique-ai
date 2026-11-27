/**
 * Study system — SERVER mirror of client/src/lib/study.ts (user order
 * 2026-11-28). Plain Node ESM, no dependencies: the server cannot import
 * client TypeScript, so this file carries the SAME patterns, lists and
 * rules. scripts/test-study.mjs runs BOTH files over one corpus and
 * requires identical verdicts — if you change a pattern here, change
 * it in lib/study.ts too (and vice versa).
 *
 * The gate lives in server/index.js: a per-turn study directive on
 * study messages (complete structured answers, no-lie rule, human
 * writing for documents), plus the ADD-ONLY STUDY entries in the
 * locked prompt. The study context (picked class/subject, saved
 * exams) arrives in the request body as `study` and is framed as
 * background facts only, never instructions.
 */

export const STUDY_LEVELS = [
  { id: 'primary', label: 'پرائمری (کلاس 1–5)', classes: [1, 2, 3, 4, 5] },
  { id: 'middle', label: 'مڈل (کلاس 6–8)', classes: [6, 7, 8] },
  { id: 'matric', label: 'میٹرک (کلاس 9–10)', classes: [9, 10] },
  { id: 'inter', label: 'انٹر (کلاس 11–12)', classes: [11, 12] },
  { id: 'college', label: 'کالج / یونیورسٹی', classes: [] },
];

export const STUDY_SUBJECTS = [
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

export function studyLevelForClass(cls) {
  return STUDY_LEVELS.find((l) => l.classes.includes(cls)) ?? null;
}

export function emptyStudyContext() {
  return { exams: [] };
}

export function studyLevelLabel(ctx) {
  if (ctx.classNum) return `کلاس ${ctx.classNum}`;
  const level = STUDY_LEVELS.find((l) => l.id === ctx.levelId);
  return level ? level.label : '';
}

export function studySubjectLabel(ctx) {
  const s = STUDY_SUBJECTS.find((x) => x.id === ctx.subjectId);
  return s ? s.urdu : '';
}

export function buildStudyContextBlock(ctx) {
  const parts = [];
  const level = studyLevelLabel(ctx || {});
  if (level) parts.push(`Class: ${level}`);
  const subject = studySubjectLabel(ctx || {});
  if (subject) parts.push(`Subject: ${subject}`);
  for (const e of (ctx && ctx.exams) || []) {
    parts.push(`Upcoming exam: ${e.label} on ${e.day}/${e.month}`);
  }
  return parts.join(' | ');
}

function normalizeStudyText(raw) {
  return String(raw || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

const STUDY_OPEN_PATTERNS = [
  /سٹڈی\s*(کھولو|کھول|شروع|موڈ|سٹوڈیو)/,
  /اسٹڈی\s*(کھولو|کھول|شروع|موڈ|سٹوڈیو)/,
  /پڑھائی\s*(شروع|کھولو|موڈ)/,
  /سٹڈی\s*موڈ/,
  /study\s*(mode|studio)?\s*(kholo|khol|shuru|open|start)/i,
  /(open|start)\s+(the\s+)?study\s*(mode|studio)?/i,
  /\bstudy\s+mode\b/i,
  /\bstudy\s+studio\b/i,
];

export function isStudyOpenOrder(rawText) {
  const text = normalizeStudyText(rawText);
  if (!text) return false;
  return STUDY_OPEN_PATTERNS.some((re) => re.test(text));
}

const STUDY_MESSAGE_PATTERNS = [
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

export function isStudyMessage(rawText) {
  const text = normalizeStudyText(rawText);
  if (!text) return false;
  return STUDY_MESSAGE_PATTERNS.some((re) => re.test(text));
}

const STUDY_DOCUMENT_PATTERNS = [
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

export function isStudyDocumentOrder(rawText) {
  const text = normalizeStudyText(rawText);
  if (!text) return false;
  return STUDY_DOCUMENT_PATTERNS.some((re) => re.test(text));
}

export function studyDocumentKind(rawText) {
  const text = normalizeStudyText(rawText);
  if (!text) return null;
  if (/(سی\s*وی|cv|resume)/i.test(text)) return 'cv';
  if (/(اسائنمنٹ|assignment)/i.test(text)) return 'assignment';
  return null;
}

export function extractDocumentTopic(rawText) {
  let text = normalizeStudyText(rawText);
  text = text
    .replace(/پر\s*(اسائنمنٹ|سی\s*وی)/gi, ' ')
    .replace(/(اسائنمنٹ|assignment)\s*(بناؤ|بنا\s*(دو|دیں|دے)|لکھ\w*|banao|bana\s*do|banado|make|likh)/gi, ' ')
    .replace(/(سی\s*وی|cv|resume)\s*(بناؤ|بنا\s*(دو|دیں|دے)|لکھ\w*|banao|bana\s*do|banado|make|likh)/gi, ' ')
    .replace(/\b(make|create|write)\s+(my\s+)?(assignment|cv|resume)\b/gi, ' ')
    .replace(/(بناؤ|بنا\s*(دو|دیں|دے)|لکھ\w*|banao|bana\s*do|banado|make)\s*$/gi, ' ')
    .replace(/(مجھے|میرا|میری|mujhe|mera|meri|please|براہ کرم|ذرا)\s*/gi, ' ')
    .replace(/[۔؟?!.،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

export function detectStudyClass(rawText) {
  const text = normalizeStudyText(rawText);
  const m = text.match(/(?:کلاس|جماعت|class|grade)\s*(\d{1,2})/i);
  if (!m) return null;
  const classNum = parseInt(m[1], 10);
  if (classNum < 1 || classNum > 12) return null;
  const level = studyLevelForClass(classNum);
  if (!level) return null;
  return { levelId: level.id, classNum };
}

const SUBJECT_MATCHERS = [
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

export function detectStudySubject(rawText) {
  const text = normalizeStudyText(rawText);
  for (const s of SUBJECT_MATCHERS) {
    if (s.re.test(text)) return s.id;
  }
  return null;
}

const URDU_MONTHS = {
  'جنوری': 1, 'فروری': 2, 'مارچ': 3, 'اپریل': 4, 'مئی': 5, 'جون': 6,
  'جولائی': 7, 'اگست': 8, 'ستمبر': 9, 'اکتوبر': 10, 'نومبر': 11, 'دسمبر': 12,
};

const EN_MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const ROMAN_MONTHS = {
  janwari: 1, janvary: 1, farwari: 2, february: 2, march: 3, aprel: 4, april: 4,
  mayi: 5, mai: 5, june: 6, jolai: 7, july: 7, agast: 8, august: 8,
  satambar: 9, september: 9, aktobar: 10, october: 10, nawambar: 11, november: 11,
  dasambar: 12, december: 12, disambar: 12,
};

function isExamSentence(text) {
  return /(امتحان|پیپر|ٹیسٹ|exam|paper|test|imtihan)/i.test(text);
}

export function extractExamDate(rawText) {
  const text = normalizeStudyText(rawText);
  if (!text || !isExamSentence(text)) return null;
  const subjectId = detectStudySubject(text);
  const subjectLabel = subjectId ? (STUDY_SUBJECTS.find((s) => s.id === subjectId)?.urdu ?? '') : '';
  const label = subjectLabel ? `${subjectLabel} کا امتحان` : 'امتحان';
  const wordMonth = text.match(/(\d{1,2})\s*([^\s\d.,،]+)/);
  if (wordMonth) {
    const day = parseInt(wordMonth[1], 10);
    const word = wordMonth[2];
    const month = URDU_MONTHS[word] ?? EN_MONTHS[word.toLowerCase()] ?? ROMAN_MONTHS[word.toLowerCase()];
    if (month && day >= 1 && day <= 31) return { label, month, day, subject: subjectId ?? undefined };
  }
  const slash = text.match(/(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?/);
  if (slash) {
    const day = parseInt(slash[1], 10);
    const month = parseInt(slash[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return { label, month, day, subject: subjectId ?? undefined };
  }
  return null;
}

const EXAM_PREP_PATTERNS = [
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

export function isExamPrepRequest(rawText) {
  const text = normalizeStudyText(rawText);
  if (!text) return false;
  return EXAM_PREP_PATTERNS.some((re) => re.test(text));
}

export function classifyStudySource(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/https?:\/\/\S+/i.test(text) || /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)/i.test(text)) {
    const url = text.match(/https?:\/\/\S+/i)?.[0] ?? text.trim().split(/\s+/)[0];
    return { kind: 'video', value: url };
  }
  return { kind: 'text', value: text };
}

export const VIDEO_SOURCE_RULE =
  'A video link is a source as given: note everything from it, copy it all exactly, and complete the assignment from it, swapping in ONLY the user\u2019s own name + ID. Watching or fetching a video link needs the live model + internet on the user\u2019s laptop; pasted text works anywhere. Never claim a video was watched when it was only linked.';

export const VIDEO_SOURCE_HONEST_NOTE =
  'ویڈیو لنک ماخذ کے طور پر جڑ گیا ہے — ویڈیو دیکھنا آپ کے لیپ ٹاپ پر لائیو ماڈل + انٹرنیٹ سے ہوگا، یہاں صرف لنک بطور ماخذ محفوظ ہے۔';

export const TEXT_SOURCE_NOTE =
  'متن ماخذ کے طور پر جڑ گیا ہے — اسائنمنٹ اسی متن سے بنے گی، آپ کا نام اور رول نمبر ہی بدلے جائیں گے۔';

export const STUDY_GUIDANCE =
  'Study help covers every level from small classes to college/university, any subject, 2026 current curriculum and old material. Every study answer is complete and structured — definition, clear explanation, examples, key points, and an exam-style answer where it fits; step-by-step working for maths and numericals; matched to the picked class level. If the class, subject, board, book or chapter is missing AND the answer depends on it, ask ONE clear question instead of giving a half answer. Never give a partial answer dressed up as complete.';

export const STUDY_NO_LIE_GUIDANCE =
  'Never invent facts, dates, formulas, syllabus contents or curriculum details for a study answer. Answer the 2026 curriculum from the model\u2019s own knowledge; when unsure, say so plainly in Urdu («یہ مجھے یقینی طور پر نہیں آتا») and say what detail would settle it. A complete answer or an honest «don\u2019t know / need more detail» — never a made-up or half answer.';

export const HUMAN_WRITING_RULE =
  'Write like a person, not like an AI: natural varied sentences, a personal voice, no robotic phrasing, no excessive em-dashes, no "moreover / furthermore" chains, no generic AI intros such as "In conclusion" or "It is important to note". An assignment or CV built here must read like a real student or job-seeker wrote it, so nobody can tell AI made it.';

export const HUMAN_WRITING_BANNED_PHRASES = [
  'In conclusion',
  'It is important to note',
  'moreover',
  'furthermore',
  'In summary',
  'delve',
];
