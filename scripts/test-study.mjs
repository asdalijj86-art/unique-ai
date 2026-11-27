/**
 * test-study.mjs — STUDY SYSTEM (user order 2026-11-28) test.
 *
 * Bundles the REAL client libs (lib/study, lib/persona,
 * lib/awareness) with esbuild and proves:
 *  1. STUDY TRIGGERS fire on study words in Urdu, Roman Urdu and
 *     English, and do NOT fire on ordinary chat.
 *  2. OPEN vs QUESTION vs DOCUMENT orders are distinct: «سٹڈی
 *     کھولو» opens the panel, a study question does not, and
 *     «اسائنمنٹ بناؤ» / «سی وی بناؤ» opens Document Studio with
 *     the right kind + topic.
 *  3. CLASS / SUBJECT lists: 5 levels covering classes 1–12 exactly
 *     once, >= 10 general subjects (no board syllabus hardcoded);
 *     detection reads «کلاس 9» / "class 12" / «فزکس».
 *  4. EXAM DATES: «میرا ریاضی کا امتحان 15 دسمبر کو ہے» parses to
 *     month 12 / day 15; the awareness `upcoming` trigger fires on
 *     a REAL stored exam within 3 days (with a preparation-plan
 *     line) and stays silent for one 30 days away.
 *  5. CLIENT/SERVER MIRROR: lib/study.ts and server/study.js give
 *     IDENTICAL verdicts on every corpus string (same discipline as
 *     decision.ts / decision.js).
 *  6. PROMPT CONSTANTS: the study guidance + no-lie + human-writing
 *     records exist in lib/persona.ts and in lib/study.ts, match the
 *     server mirror, and the server's locked prompt carries the four
 *     ADD-ONLY STUDY entries AFTER the 2026-11-27 entries, with the
 *     original prompt lines still verbatim.
 *  7. HUMAN WRITING: the Document Studio draft contains NONE of the
 *     banned AI phrases, and the studio + chat wire the study
 *     prefill, the `study` request field, and the upcoming-exam
 *     trigger.
 *  8. VIDEO / TEXT SOURCE: a video link classifies as video, pasted
 *     text as text, and the honest note (never claim a video was
 *     watched when only linked) is present in the UI code.
 *
 * Run: node scripts/test-study.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'study-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/study.ts'))};`,
  // persona.ts also exports STUDY_GUIDANCE / STUDY_NO_LIE_GUIDANCE
  // (the same words, its own record) — star-exporting both would make
  // those names ambiguous, so persona's are aliased on import.
  `export { STUDY_GUIDANCE as PERSONA_STUDY_GUIDANCE, STUDY_NO_LIE_GUIDANCE as PERSONA_STUDY_NO_LIE_GUIDANCE, STUDY_HUMAN_WRITING_GUIDANCE } from ${JSON.stringify(join(repoRoot, 'client/src/lib/persona.ts'))};`,
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/awareness.ts'))};`,
].join('\n'));
const bundled = join(outDir, 'study-libs.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const C = await import(pathToFileURL(bundled).href);
const S = await import(pathToFileURL(join(repoRoot, 'server/study.js')).href);

const read = (p) => readFileSync(join(repoRoot, p), 'utf8');
const serverIndex = read('server/index.js');
const personaSrc = read('client/src/lib/persona.ts');
const studyClientSrc = read('client/src/lib/study.ts');
const docStudioSrc = read('client/src/components/DocumentStudio.tsx');
const studyStudioSrc = read('client/src/components/StudyStudio.tsx');
const chatSrc = read('client/src/pages/chat.tsx');
const apiSrc = read('client/src/lib/api.ts');

let passed = 0;
let failed = 0;
const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v))
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  : v;
function check(name, cond, extra) {
  if (cond) { passed++; }
  else { failed++; console.log(`FAIL: ${name}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); }
}
function eq(name, a, b) { check(name, JSON.stringify(canon(a)) === JSON.stringify(canon(b)), { client: a, server: b }); }

// ---------------------------------------------------------------------------
// 1. Study triggers — all three languages; ordinary chat stays quiet.
// ---------------------------------------------------------------------------
const STUDY_FIRES = [
  'مجھے ریاضی کا سوال حل کر کے دو',
  'امتحان کی تیاری کرنی ہے',
  'میرا سائنس کا ہوم ورک کروا دو',
  'میرا مضمون لکھ دو',
  'کتاب کا خلاصہ چاہیے',
  'mujhe assignment banana hai',
  'mera maths ka test hai kal',
  'parhai karni hai',
  'Help me with my physics homework',
  'I have a maths exam tomorrow',
  'Give me revision notes for biology',
];
for (const t of STUDY_FIRES) {
  check(`study fires: ${t}`, C.isStudyMessage(t) === true);
}
const STUDY_QUIET = [
  'آج موسم کیسا ہے؟',
  'مجھے ایک کہانی سناؤ',
  'الارم لگا دو صبح 7 بجے',
  'یونیکا کو بلاؤ',
  'کیا حال ہے؟',
  'what time is it',
  'I have a question about my order',
  'مجھے بھوک لگی ہے',
];
for (const t of STUDY_QUIET) {
  check(`study quiet: ${t}`, C.isStudyMessage(t) === false);
}

// ---------------------------------------------------------------------------
// 2. Open vs question vs document orders.
// ---------------------------------------------------------------------------
for (const t of ['سٹڈی کھولو', 'سٹڈی موڈ کھولو', 'open study mode', 'study mode kholo']) {
  check(`study open order: ${t}`, C.isStudyOpenOrder(t) === true);
}
for (const t of ['مجھے ریاضی کا سوال حل کر کے دو', 'امتحان کی تیاری کرنی ہے', 'مجھے کہانی سناؤ']) {
  check(`not an open order: ${t}`, C.isStudyOpenOrder(t) === false);
}
for (const t of ['اسائنمنٹ بناؤ', 'سی وی بناؤ', 'assignment banao', 'make my CV', 'میرا سی وی بنا دو']) {
  check(`study document order: ${t}`, C.isStudyDocumentOrder(t) === true);
}
for (const t of ['مجھے ریاضی پڑھاؤ', 'سٹڈی کھولو', 'مجھے کہانی سناؤ']) {
  check(`not a document order: ${t}`, C.isStudyDocumentOrder(t) === false);
}
eq('document kind cv', C.studyDocumentKind('سی وی بناؤ'), 'cv');
eq('document kind assignment', C.studyDocumentKind('اسائنمنٹ بناؤ'), 'assignment');
eq('document topic from front', C.extractDocumentTopic('فوٹوسنتھیسز پر اسائنمنٹ بناؤ'), 'فوٹوسنتھیسز');
eq('document topic empty', C.extractDocumentTopic('اسائنمنٹ بناؤ'), '');

// ---------------------------------------------------------------------------
// 3. Class / subject lists + detection.
// ---------------------------------------------------------------------------
check('5 study levels', C.STUDY_LEVELS.length === 5);
const covered = C.STUDY_LEVELS.flatMap((l) => l.classes).sort((a, b) => a - b);
eq('classes 1-12 covered exactly once', covered, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
check('>= 10 general subjects', C.STUDY_SUBJECTS.length >= 10);
check('no board syllabus hardcoded in client study lib',
  !/punjab board syllabus|federal board syllabus|karachi board syllabus/i.test(studyClientSrc));
eq('detect class 9', C.detectStudyClass('میں کلاس 9 میں ہوں'), { levelId: 'matric', classNum: 9 });
eq('detect class 12', C.detectStudyClass('I am in class 12'), { levelId: 'inter', classNum: 12 });
eq('detect class 3', C.detectStudyClass('کلاس 3 کا ہوم ورک'), { levelId: 'primary', classNum: 3 });
check('detect class none', C.detectStudyClass('مجھے کہانی سناؤ') === null);
eq('detect subject physics', C.detectStudySubject('فزکس کا سوال'), 'physics');
eq('detect subject pakistan studies', C.detectStudySubject('مطالعہ پاکستان کا مضمون'), 'pakistan-studies');
eq('detect subject maths', C.detectStudySubject('ریاضی کا سوال'), 'maths');
eq('study context block', C.buildStudyContextBlock({ levelId: 'matric', classNum: 9, subjectId: 'maths', exams: [{ label: 'ریاضی کا امتحان', month: 12, day: 15 }] }),
  'Class: کلاس 9 | Subject: ریاضی | Upcoming exam: ریاضی کا امتحان on 15/12');

// ---------------------------------------------------------------------------
// 4. Exam dates + upcoming trigger (real stored exam only).
// ---------------------------------------------------------------------------
eq('exam date urdu', C.extractExamDate('میرا ریاضی کا امتحان 15 دسمبر کو ہے'),
  { label: 'ریاضی کا امتحان', month: 12, day: 15, subject: 'maths' });
eq('exam date english', C.extractExamDate('my maths exam is on 15 December'),
  { label: 'ریاضی کا امتحان', month: 12, day: 15, subject: 'maths' });
eq('exam date slash', C.extractExamDate('میرا امتحان 15/12 کو ہے'),
  { label: 'امتحان', month: 12, day: 15, subject: undefined });
check('exam date none without date', C.extractExamDate('امتحان کی تیاری کرنی ہے') === null);
check('exam prep revision', C.isExamPrepRequest('ریویژن پلان بناؤ') === true);
check('exam prep practice', C.isExamPrepRequest('مشق سوالات دو') === true);
check('exam prep time', C.isExamPrepRequest('امتحان کے لیے وقت کا انتظام بتاؤ') === true);
check('exam prep english', C.isExamPrepRequest('give me practice questions') === true);
check('exam prep quiet', C.isExamPrepRequest('آج موسم کیسا ہے؟') === false);

// Awareness upcoming: a stored exam 2 days away fires as 'exam';
// one 30 days away stays silent (midday, nothing else coming).
const examNow = new Date(2026, 11, 13, 14, 0).getTime(); // Dec 13 2026, 14:00
const examItem = C.getUpcomingItem(examNow, { studyExams: [{ label: 'ریاضی کا امتحان', month: 12, day: 15 }] });
eq('upcoming exam fires', examItem, { kind: 'exam', label: 'ریاضی کا امتحان', daysAway: 2 });
const farItem = C.getUpcomingItem(examNow, { studyExams: [{ label: 'ریاضی کا امتحان', month: 1, day: 12 }] });
check('upcoming far exam silent', farItem === null);
check('upcoming manner exam is caring', C.upcomingManner('exam') === 'caring');
const examLine = C.pickAwarenessLine('upcoming', true, { upcomingItem: { kind: 'exam', label: 'ریاضی کا امتحان', daysAway: 2 } });
check('upcoming exam line names the exam + prep', examLine.includes('ریاضی کا امتحان') && examLine.includes('ریویژن پلان'), examLine);

// ---------------------------------------------------------------------------
// 5. Client/server mirror agreement over the whole corpus.
// ---------------------------------------------------------------------------
const CORPUS = [...STUDY_FIRES, ...STUDY_QUIET,
  'سٹڈی کھولو', 'open study mode', 'اسائنمنٹ بناؤ', 'سی وی بناؤ', 'make my CV',
  'میں کلاس 9 میں ہوں', 'I am in class 12', 'فزکس کا سوال', 'مطالعہ پاکستان کا مضمون',
  'میرا ریاضی کا امتحان 15 دسمبر کو ہے', 'my maths exam is on 15 December',
  'میرا امتحان 15/12 کو ہے', 'ریویژن پلان بناؤ', 'give me practice questions',
  'فوٹوسنتھیسز پر اسائنمنٹ بناؤ', 'https://www.youtube.com/watch?v=abc123', 'یہ میرا متن ہے',
  '', '   ', 'السلام علیکم'];
for (const t of CORPUS) {
  eq(`mirror isStudyMessage: ${t}`, C.isStudyMessage(t), S.isStudyMessage(t));
  eq(`mirror isStudyOpenOrder: ${t}`, C.isStudyOpenOrder(t), S.isStudyOpenOrder(t));
  eq(`mirror isStudyDocumentOrder: ${t}`, C.isStudyDocumentOrder(t), S.isStudyDocumentOrder(t));
  eq(`mirror studyDocumentKind: ${t}`, C.studyDocumentKind(t), S.studyDocumentKind(t));
  eq(`mirror extractDocumentTopic: ${t}`, C.extractDocumentTopic(t), S.extractDocumentTopic(t));
  eq(`mirror detectStudyClass: ${t}`, C.detectStudyClass(t), S.detectStudyClass(t));
  eq(`mirror detectStudySubject: ${t}`, C.detectStudySubject(t), S.detectStudySubject(t));
  eq(`mirror extractExamDate: ${t}`, C.extractExamDate(t), S.extractExamDate(t));
  eq(`mirror isExamPrepRequest: ${t}`, C.isExamPrepRequest(t), S.isExamPrepRequest(t));
  eq(`mirror classifyStudySource: ${t}`, C.classifyStudySource(t), S.classifyStudySource(t));
}
eq('mirror STUDY_GUIDANCE', C.STUDY_GUIDANCE, S.STUDY_GUIDANCE);
eq('mirror STUDY_NO_LIE_GUIDANCE', C.STUDY_NO_LIE_GUIDANCE, S.STUDY_NO_LIE_GUIDANCE);
eq('mirror HUMAN_WRITING_RULE', C.HUMAN_WRITING_RULE, S.HUMAN_WRITING_RULE);
eq('mirror VIDEO_SOURCE_RULE', C.VIDEO_SOURCE_RULE, S.VIDEO_SOURCE_RULE);
eq('mirror levels', C.STUDY_LEVELS, S.STUDY_LEVELS);
eq('mirror subjects', C.STUDY_SUBJECTS, S.STUDY_SUBJECTS);

// ---------------------------------------------------------------------------
// 6. Prompt constants — client mirror + server ADD-ONLY entries.
// ---------------------------------------------------------------------------
check('persona STUDY_GUIDANCE exists', typeof C.PERSONA_STUDY_GUIDANCE === 'string' && C.PERSONA_STUDY_GUIDANCE.length > 50);
check('persona STUDY_NO_LIE_GUIDANCE exists', typeof C.PERSONA_STUDY_NO_LIE_GUIDANCE === 'string' && C.PERSONA_STUDY_NO_LIE_GUIDANCE.includes('یقینی طور پر نہیں آتا'));
check('persona STUDY_HUMAN_WRITING_GUIDANCE exists', typeof C.STUDY_HUMAN_WRITING_GUIDANCE === 'string' && C.STUDY_HUMAN_WRITING_GUIDANCE.includes('In conclusion'));
check('persona human-writing matches study rule', C.STUDY_HUMAN_WRITING_GUIDANCE === C.HUMAN_WRITING_RULE);
check('persona study guidance matches study lib', C.PERSONA_STUDY_GUIDANCE === C.STUDY_GUIDANCE);
check('persona no-lie guidance matches study lib', C.PERSONA_STUDY_NO_LIE_GUIDANCE === C.STUDY_NO_LIE_GUIDANCE);
check('persona src carries study constants',
  personaSrc.includes('STUDY_GUIDANCE') && personaSrc.includes('STUDY_NO_LIE_GUIDANCE') && personaSrc.includes('STUDY_HUMAN_WRITING_GUIDANCE'));
const studyEntries = [
  'STUDY — COMPLETE ANSWERS (ADD-ONLY 2026-11-28',
  'STUDY — NO LIE (ADD-ONLY 2026-11-28',
  'STUDY WRITING — HUMAN, NOT ROBOTIC (ADD-ONLY 2026-11-28',
  'STUDY — UPCOMING / ANTICIPATORY (ADD-ONLY 2026-11-28',
];
for (const e of studyEntries) check(`server prompt has ${e}`, serverIndex.includes(e));
const anticipatoryIdx = serverIndex.indexOf('ANTICIPATORY FAST MIND (ADD-ONLY 2026-11-27');
check('server prompt: study entries come AFTER the 2026-11-27 entries',
  anticipatoryIdx > 0 && studyEntries.every((e) => serverIndex.indexOf(e) > anticipatoryIdx));
check('server prompt: 2026-11-27 entries still verbatim',
  serverIndex.includes('HER OWN DECISION (ADD-ONLY 2026-11-27') &&
  serverIndex.includes('FAST MIND (ADD-ONLY 2026-11-26'));
check('server prompt: study no-lie line verbatim', serverIndex.includes('یہ مجھے یقینی طور پر نہیں آتا'));
check('server prompt: study directive wired', serverIndex.includes('studyDirective') && serverIndex.includes("const { messages, stream, language, persona, tone, memory, team, study }"));

// ---------------------------------------------------------------------------
// 7. Human writing in the document generation path + chat wiring.
// ---------------------------------------------------------------------------
// The draft's own chapter strings (the `text: `...`` literals inside
// draftFromTopic) must contain none of the banned AI phrases. The
// rule's COMMENT mentions the phrases, so only the literals are checked
// — and only within the function body itself (the file later reuses
// `text: `...`` for the Word export).
const draftStart = docStudioSrc.indexOf('function draftFromTopic()');
const draftEnd = docStudioSrc.indexOf('\n  }\n', draftStart);
const draftFn = docStudioSrc.slice(draftStart, draftEnd);
const draftLiterals = [...draftFn.matchAll(/text: `([^`]*)`/g)].map((m) => m[1]);
check('draft has 3 chapter texts', draftLiterals.length === 3, draftLiterals.length);
for (const phrase of C.HUMAN_WRITING_BANNED_PHRASES) {
  check(`draft has no banned phrase: ${phrase}`,
    draftLiterals.every((t) => !t.toLowerCase().includes(phrase.toLowerCase())));
}
check('DocumentStudio wires the human-writing rule',
  docStudioSrc.includes('DOCUMENT_WRITING_RULE = HUMAN_WRITING_RULE'));
check('DocumentStudio accepts study prefill',
  docStudioSrc.includes('DocumentStudioInitial') && docStudioSrc.includes('initial?: DocumentStudioInitial'));
check('DocumentStudio shows the source honesty note',
  docStudioSrc.includes('document-source-note') && docStudioSrc.includes('VIDEO_SOURCE_HONEST_NOTE'));
check('StudyStudio has class + subject pickers',
  studyStudioSrc.includes('study-level-') && studyStudioSrc.includes('study-subject-'));
check('StudyStudio has assignment + CV actions',
  studyStudioSrc.includes('اسائنمنٹ بناؤ') && studyStudioSrc.includes('سی وی بناؤ'));
check('StudyStudio has exam-prep actions',
  studyStudioSrc.includes('ریویژن پلان بناؤ') && studyStudioSrc.includes('پاسٹ پیپر'));
check('StudyStudio has source input + honest note',
  studyStudioSrc.includes('study-source-input') && studyStudioSrc.includes('VIDEO_SOURCE_HONEST_NOTE'));
check('chat wires StudyStudio + study orders',
  chatSrc.includes("import StudyStudio from '@/components/StudyStudio'") &&
  chatSrc.includes('isStudyOpenOrder(text)') && chatSrc.includes('isStudyDocumentOrder(text)'));
check('chat sends study context + upcoming exams',
  chatSrc.includes('study: buildStudyContextBlock(loadStudyContext(secureAppStorage))') &&
  chatSrc.includes('upcomingStudyExams: studyContext.exams'));
check('api accepts study field', apiSrc.includes('study?: string'));

// ---------------------------------------------------------------------------
// 8. Video / text source rules.
// ---------------------------------------------------------------------------
eq('source video link', C.classifyStudySource('https://www.youtube.com/watch?v=abc123'), { kind: 'video', value: 'https://www.youtube.com/watch?v=abc123' });
eq('source pasted text', C.classifyStudySource('یہ میرا متن ہے'), { kind: 'text', value: 'یہ میرا متن ہے' });
check('source empty is null', C.classifyStudySource('') === null);
check('video rule never claims watched', C.VIDEO_SOURCE_RULE.includes('Never claim a video was watched when it was only linked'));
check('honest note in UI copy', C.VIDEO_SOURCE_HONEST_NOTE.includes('ویڈیو دیکھنا آپ کے لیپ ٹاپ پر لائیو ماڈل + انٹرنیٹ سے ہوگا'));

console.log(`\ntest-study: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
