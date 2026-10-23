/**
 * test-learnings.mjs — Master Plan Round 5 «learning memory» (the
 * user's living-brain spec, 2026-10-23 23:11): proves, with the REAL
 * client libs bundled headlessly (same pattern as the other suites):
 *  1. EXTRACTION — silent pattern learning from Urdu / Roman Urdu /
 *     English messages: name, like, dislike, origin, residence,
 *     profession, family fact, multi-clause, Roman style note.
 *  2. NEGATIVES — questions, jokes/attribution, hypotheticals, long
 *     stories, other people's facts and passing moods teach NOTHING.
 *  3. STORE — dedupe, newest-name-replaces, the 60 cap (name never
 *     evicted), source recorded ('auto' vs 'told').
 *  4. COMMANDS (via lib/memory) — a taught note also teaches; forget
 *     by topic clears both stores; bare «یہ بھول جاؤ» deletes ONE
 *     thing; «ساری میموری ڈیلیٹ کر دو» wipes notes AND learnings
 *     (clearedCount stays notes-only); «تم نے کیا سیکھا؟» parses as
 *     the show command and steals nothing from save/forget.
 *  5. RECALL — the outgoing-request block: name first, likes/facts
 *     present, capped at the limit, empty store → empty block.
 *  6. BACKUP — learnings ride the brain backup (and the summary
 *     counts them), restore brings them back, API keys never travel.
 *
 * Run: node scripts/test-learnings.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'learnings-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/learnings.ts'))};`,
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/memory.ts'))};`,
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/backup.ts'))};`,
].join('\n'));
const bundled = join(outDir, 'learnings.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const L = await import(pathToFileURL(bundled).href);
const {
  LEARNINGS_KEY, MAX_LEARNINGS,
  loadLearnings, addLearnings, learnFromText, clearLearnings,
  extractLearnings, buildRecallBlock, formatLearningsList, formatLearning,
  loadNotes, parseMemoryCommand, applyMemoryCommand, memoryConfirmation,
  collectBackup, serializeBackup, parseBackup, summarizeBackup, applyBackup,
} = L;

class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) passed++; else failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const fresh = () => new MemoryStorage();
const kinds = (items) => items.map((i) => `${i.kind}:${i.text}`);

// --- 1. Extraction: positives ---------------------------------------------
const POSITIVES = [
  ['میرا نام احمد ہے', ['name:احمد']],
  ['میرا نام احمد رضا ہے', ['name:احمد رضا']],
  ['mera naam Bilal hai', ['name:Bilal']],
  ['My name is Sarah Khan', ['name:Sarah Khan']],
  ['call me Usman', ['name:Usman']],
  ['مجھے علی کہتے ہیں', ['name:علی']],
  ['مجھے بریانی پسند ہے', ['like:بریانی']],
  ['مجھے بارش کا موسم بہت پسند ہے', ['like:بارش کا موسم']],
  ['مجھے چائے اچھی لگتی ہے', ['like:چائے']],
  ['مجھے کتابیں پڑھنا پسند ہے', ['like:کتابیں پڑھنا']],
  ['مجھے شور پسند نہیں', ['dislike:شور']],
  ['مجھے دیر سے اٹھنا اچھا نہیں لگتا', ['dislike:دیر سے اٹھنا']],
  ['mujhe cricket pasand hai', ['like:cricket']],
  ['I love travelling', ['like:travelling']],
  ["I don't like noise", ['dislike:noise']],
  ['I hate waiting in queues', ['dislike:waiting in queues']],
  ['میں لاہور سے ہوں', ['fact:لاہور سے ہے']],
  ['میں کراچی میں رہتا ہوں', ['fact:کراچی میں رہائش ہے']],
  ['میں استاد ہوں', ['fact:پیشہ: استاد']],
  ["I'm a teacher", ['fact:Profession: teacher']],
  ['میری بیٹی کا نام فاطمہ ہے', ['fact:بیٹی کا نام فاطمہ ہے']],
  ['میرا نام زید ہے اور مجھے کرکٹ پسند ہے', ['name:زید', 'like:کرکٹ']],
];
for (const [msg, wants] of POSITIVES) {
  const got = kinds(extractLearnings(msg));
  check(`extract +: ${msg}`, wants.every((w) => got.includes(w)), got.join(' + ') || '(none)');
}
check('extract: Roman Urdu talk also leaves the soft style note',
  kinds(extractLearnings('mera naam Bilal hai')).some((k) => k.startsWith('style:')));
check('extract: pure English leaves NO style note',
  !kinds(extractLearnings('My name is Sarah Khan')).some((k) => k.startsWith('style:')));

// --- 2. Extraction: negatives ----------------------------------------------
const NEGATIVES = [
  'مجھے کیا پسند ہے؟',                       // question about likes
  'کیا میرا نام احمد ہے؟',                  // question about the name
  'تمہیں کیا پسند ہے؟',                      // second person
  'Do I like pizza?',
  'What is my name?',
  'ایک لطیفہ سناؤ: ایک آدمی نے کہا میرا نام احمد ہے', // joke / attribution
  'آج دادا جی کہہ رہے تھے کہ یہ یاد رکھو بیٹا وقت کی قدر کرو اور دادی بولیں سب کچھ بھول جاؤ بس اچھے کام یاد رکھو پھر ہم سب نے مل کر کھانا کھایا اور دیر تک گپیں لگاتے رہے اور کہانیاں سناتے رہے', // long story
  'میرے دوست کا نام علی ہے',                 // someone else's name
  'اگر میرا نام احمد ہوتا تو مزہ آتا',        // hypothetical
  'میں بہت تھکا ہوا ہوں',                    // passing mood, not a bio fact
  'میں ٹھیک ہوں',
  'I am happy',
  "I'm a bit tired",
  'مجھے یہ پسند ہے',                          // content-free like
  'I like you',                               // pronoun, not a preference
  'آپ کو کیا پسند ہے؟',
  'کیا تم میرا نام جانتے ہو؟',
];
for (const msg of NEGATIVES) {
  const got = extractLearnings(msg);
  check(`extract −: ${msg.slice(0, 42)}`, got.length === 0, kinds(got).join(' + '));
}

// --- 3. Store behaviour -------------------------------------------------------
{
  const s = fresh();
  learnFromText(s, 'مجھے بریانی پسند ہے', 'auto');
  const again = learnFromText(s, 'مجھے بریانی پسند ہے', 'auto');
  check('store: dedupe — same fact twice stays one entry',
    loadLearnings(s).length === 1 && again.length === 0);
  check('store: source recorded (auto)', loadLearnings(s)[0]?.source === 'auto');

  const s2 = fresh();
  learnFromText(s2, 'میرا نام احمد ہے', 'auto');
  learnFromText(s2, 'میرا نام بلال ہے', 'auto');
  const names = loadLearnings(s2).filter((l) => l.kind === 'name');
  check('store: newest name replaces the older name',
    names.length === 1 && names[0].text === 'بلال');

  const s3 = fresh();
  learnFromText(s3, 'میرا نام احمد ہے', 'told');
  const many = Array.from({ length: 75 }, (_, i) => ({ text: `پسندیدہ چیز نمبر ${i + 1}`, kind: 'like' }));
  addLearnings(s3, many, 'auto');
  const all = loadLearnings(s3);
  check(`store: cap holds at ${MAX_LEARNINGS}`, all.length === MAX_LEARNINGS, `got ${all.length}`);
  check('store: the name survives the cap', all.some((l) => l.kind === 'name' && l.text === 'احمد'));

  const s4 = fresh();
  learnFromText(s4, 'یہ یاد رکھو میرا نام احمد ہے', 'told');
  check('store: clearLearnings returns the count and empties',
    clearLearnings(s4) === 1 && loadLearnings(s4).length === 0);
}

// --- 4. Memory commands govern both stores ------------------------------------
{
  const s = fresh();
  const cmd = parseMemoryCommand('یہ یاد رکھو میرا نام احمد ہے');
  check('cmd: «یہ یاد رکھو میرا نام احمد ہے» still parses as save', cmd?.type === 'save');
  const out = applyMemoryCommand(s, cmd);
  check('cmd: taught note saved as a note', loadNotes(s).length === 1);
  const learned = loadLearnings(s);
  check('cmd: taught note ALSO teaches the brain (source told)',
    learned.some((l) => l.kind === 'name' && l.text === 'احمد' && l.source === 'told'),
    kinds(learned).join(' + '));
  check('cmd: save confirmation text unchanged (pinned wording)',
    memoryConfirmation(cmd, out, false).includes('یاد کر لیا'));
}
{
  const s = fresh();
  learnFromText(s, 'مجھے بریانی پسند ہے', 'auto');
  applyMemoryCommand(s, parseMemoryCommand('یہ یاد رکھو کل بریانی کھانی ہے'));
  const out = applyMemoryCommand(s, parseMemoryCommand('بریانی بھول جاؤ'));
  check('cmd: forget-by-topic removes the matching note', loadNotes(s).length === 0);
  check('cmd: forget-by-topic removes the matching learning too',
    loadLearnings(s).length === 0 && (out.learningsAffected || []).length === 1);
}
{
  const s = fresh();
  learnFromText(s, 'مجھے چائے پسند ہے', 'auto');
  applyMemoryCommand(s, parseMemoryCommand('یہ یاد رکھو دوا کھانی ہے'));
  const out = applyMemoryCommand(s, parseMemoryCommand('یہ بھول جاؤ'));
  check('cmd: bare «یہ بھول جاؤ» deletes the note, NOT the learning (one utterance, one deletion)',
    loadNotes(s).length === 0 && loadLearnings(s).length === 1 && out.affected.length === 1);

  const s2 = fresh();
  learnFromText(s2, 'مجھے چائے پسند ہے', 'auto');
  learnFromText(s2, 'مجھے آم پسند ہے', 'auto');
  applyMemoryCommand(s2, parseMemoryCommand('یہ بھول جاؤ'));
  check('cmd: with no notes, bare «یہ بھول جاؤ» deletes the newest learning only',
    loadLearnings(s2).length === 1 && loadLearnings(s2)[0].text === 'چائے');
}
{
  const s = fresh();
  applyMemoryCommand(s, parseMemoryCommand('یہ یاد رکھو پہلی بات'));
  applyMemoryCommand(s, parseMemoryCommand('یہ یاد رکھو دوسری بات'));
  learnFromText(s, 'مجھے چائے پسند ہے', 'auto');
  learnFromText(s, 'مجھے آم پسند ہے', 'auto');
  learnFromText(s, 'میں لاہور سے ہوں', 'auto');
  const cmd = parseMemoryCommand('ساری میموری ڈیلیٹ کر دو');
  const out = applyMemoryCommand(s, cmd);
  check('cmd: forget_all — clearedCount stays NOTES-only (2)', out.clearedCount === 2, `got ${out.clearedCount}`);
  check('cmd: forget_all — learningsCleared reports 3', out.learningsCleared === 3, `got ${out.learningsCleared}`);
  check('cmd: forget_all — both stores empty', loadNotes(s).length === 0 && loadLearnings(s).length === 0);
  const conf = memoryConfirmation(cmd, out, false);
  check('cmd: forget_all confirmation names notes and the learnings',
    conf.includes('2 باتیں') && conf.includes('سیکھا تھا وہ بھی'), conf);
}
{
  check('cmd: «تم نے کیا سیکھا؟» parses as show', parseMemoryCommand('تم نے کیا سیکھا؟')?.type === 'show');
  check('cmd: «میری یادداشت دکھاؤ» parses as show', parseMemoryCommand('میری یادداشت دکھاؤ')?.type === 'show');
  check('cmd: «میرے بارے میں کیا یاد ہے» parses as show', parseMemoryCommand('میرے بارے میں کیا یاد ہے')?.type === 'show');
  check('cmd: «what have you learned» parses as show', parseMemoryCommand('What have you learned?')?.type === 'show');
  check('cmd: a question ABOUT a story is not the show command',
    parseMemoryCommand('اس کہانی سے تم نے کیا سیکھا؟') === null);
  check('cmd: show steals nothing from save',
    parseMemoryCommand('یہ یاد رکھو میرا نام احمد ہے')?.type === 'save');
  const s = fresh();
  learnFromText(s, 'میرا نام احمد ہے', 'auto');
  learnFromText(s, 'مجھے بریانی پسند ہے', 'auto');
  const list = formatLearningsList(loadLearnings(s), false);
  check('cmd: the learned list shows name + like in display form',
    list.includes('نام: احمد') && list.includes('پسند: بریانی'), list.split('\n')[1] || '');
  check('cmd: empty learnings list is an honest «not yet»',
    formatLearningsList([], false).includes('ابھی تک'));
  check('display: formatLearning labels name/like/dislike',
    formatLearning({ id: 'x', text: 'شور', kind: 'dislike', createdAt: '', source: 'auto' }) === 'ناپسند: شور');
}

// --- 5. Recall block -------------------------------------------------------------
{
  const s = fresh();
  check('recall: empty store → empty block', buildRecallBlock(loadLearnings(s)) === '');
  learnFromText(s, 'مجھے بریانی پسند ہے', 'auto');
  learnFromText(s, 'میرا نام احمد ہے', 'auto');
  learnFromText(s, 'میں لاہور سے ہوں', 'auto');
  learnFromText(s, 'مجھے شور پسند نہیں', 'auto');
  const block = buildRecallBlock(loadLearnings(s));
  check('recall: name comes first', block.startsWith('Name: احمد'), block);
  check('recall: likes + dislikes + facts ride along',
    block.includes('Likes: بریانی') && block.includes('Dislikes: شور') && block.includes('لاہور سے ہے'), block);

  const s2 = fresh();
  learnFromText(s2, 'میرا نام احمد ہے', 'auto');
  for (let i = 1; i <= 15; i++) learnFromText(s2, `مجھے چیز${i} پسند ہے`, 'auto');
  const capped = buildRecallBlock(loadLearnings(s2), 5);
  check('recall: cap respected (name + newest 4 of 15 likes)',
    capped.startsWith('Name: احمد') && capped.includes('چیز15') && capped.includes('چیز12') && !capped.includes('چیز11'),
    capped.slice(0, 120));
  check('recall: full block stays token-lean (< 900 chars even when full)',
    buildRecallBlock(loadLearnings(s2)).length <= 900);
}

// --- 6. Backup round-trip ----------------------------------------------------------
{
  const s = fresh();
  learnFromText(s, 'میرا نام احمد ہے', 'auto');
  learnFromText(s, 'مجھے بریانی پسند ہے', 'auto');
  s.setItem('unique-ai-gemini-key', 'SECRET-KEY-VALUE-999');
  s.setItem('unique-ai-notes', JSON.stringify([{ id: 'n1', text: 'ایک نوٹ', createdAt: 'x' }]));
  const data = collectBackup(s);
  check('backup: learnings key rides the backup', typeof data.entries[LEARNINGS_KEY] === 'string');
  check('backup: API key NEVER in the file',
    !('unique-ai-gemini-key' in data.entries) && !serializeBackup(data).includes('SECRET-KEY-VALUE-999'));
  check('backup: summary counts the learnings', summarizeBackup(data).learnings === 2,
    `got ${summarizeBackup(data).learnings}`);
  const parsed = parseBackup(serializeBackup(data));
  check('backup: file parses back', parsed.ok === true);
  const target = fresh();
  applyBackup(target, parsed.data);
  const restored = loadLearnings(target);
  check('backup: restore brings the learnings back (name + like)',
    restored.some((l) => l.kind === 'name' && l.text === 'احمد')
    && restored.some((l) => l.kind === 'like' && l.text === 'بریانی'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
