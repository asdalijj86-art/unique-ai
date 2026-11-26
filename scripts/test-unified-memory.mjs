/**
 * test-unified-memory.mjs — Stonic full study 2026-11-26, checklist:
 *  «old conversations unified into ONE memory» (unified recall),
 *  tile 2.6M cross-character inference (Jarvis reads Khushbo's chat),
 *  tile 144K date memories (she remembers her own birthday as a date).
 *
 * Proves, with the REAL client libs bundled headlessly (same pattern
 * as test-learnings.mjs):
 *  1. UNIFIED RECALL — getUnifiedMemoryText merges the active
 *     persona's notes + the other persona's notes + the old
 *     conversation history ('maira-ai-conversations-v1'), most
 *     recent first, de-duplicated, capped at ~1200 chars; the
 *     underlying per-persona stores are NOT touched (read-time
 *     merge only — Uniqa keeps 'unique-ai-notes', Unique keeps
 *     'unique-ai-notes-unique').
 *  2. DATE MEMORIES — save/load round-trip on the shared key,
 *     getTodaysDates filters to today, extractDateMemory spots
 *     birthday/anniversary mentions in Urdu / Roman Urdu / English
 *     and returns null when nothing is clear.
 *  3. CROSS-CHARACTER — otherPersonaRecallLine returns ONE short
 *     inferred line (never the other persona's raw notes) when the
 *     other persona's notes show she/he misses, waits for, or is
 *     fond of him — and null when there is nothing to infer.
 *  4. BACKUP — the date key rides collectBackup like every other
 *     key, and the per-persona note stores still round-trip.
 *
 * Run: node scripts/test-unified-memory.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'unified-memory-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/memory.ts'))};`,
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/backup.ts'))};`,
].join('\n'));
const bundled = join(outDir, 'unified-memory.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const L = await import(pathToFileURL(bundled).href);
const {
  NOTES_KEY, NOTES_KEY_UNIQUE, CONVERSATIONS_KEY, DATE_MEMORIES_KEY, UNIFIED_RECALL_CAP,
  loadNotes, saveNotes, makeNote,
  loadUnifiedNotes, getUnifiedMemoryText,
  loadDateMemories, saveDateMemories, makeDateMemory, getTodaysDates, extractDateMemory,
  otherPersonaRecallLine,
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

function seedNotes(s, persona, texts) {
  const notes = texts.map(([text, createdAt]) => ({
    id: `n-${Math.random().toString(36).slice(2)}`, text, createdAt,
  }));
  saveNotes(s, notes, persona);
  return notes;
}
function seedConversations(s, convs) {
  s.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
}

// --- 1. Unified recall -------------------------------------------------------
{
  const s = fresh();
  seedNotes(s, 'uniqa', [
    ['میرا نام احمد ہے', '2026-11-20T10:00:00.000Z'],
    ['مجھے بریانی پسند ہے', '2026-11-21T10:00:00.000Z'],
  ]);
  seedNotes(s, 'unique', [
    ['مجھے چائے پسند ہے', '2026-11-22T10:00:00.000Z'],
    // Same fact Uniqa already holds — the merge must keep ONE copy.
    ['مجھے بریانی پسند ہے', '2026-11-19T10:00:00.000Z'],
  ]);
  seedConversations(s, [{
    id: 'c1', title: 'پرانی بات', updatedAt: '2026-11-23T10:00:00.000Z',
    messages: [
      { id: 'm1', role: 'user', content: 'میں عمان میں رہتا ہوں', createdAt: '2026-11-23T09:00:00.000Z' },
      { id: 'm2', role: 'assistant', content: 'جی، عمان میں رہائش نوٹ کر لی', createdAt: '2026-11-23T09:01:00.000Z' },
      // A command-shaped user line: the saved note covers it, the raw order must not leak in.
      { id: 'm3', role: 'user', content: 'یہ یاد رکھو میرا نام احمد ہے', createdAt: '2026-11-23T09:02:00.000Z' },
    ],
  }]);

  const merged = loadUnifiedNotes('uniqa', s);
  check('unified: both personas\' notes merge (3 unique of 4 seeded)',
    merged.length === 3, `got ${merged.length}: ${merged.map((n) => n.text).join(' | ')}`);
  check('unified: most recent first',
    merged[0].text === 'مجھے چائے پسند ہے' && merged[merged.length - 1].text === 'میرا نام احمد ہے');
  check('unified: each merged note still knows its persona',
    merged.some((n) => n.persona === 'unique' && n.text === 'مجھے چائے پسند ہے'));

  const text = getUnifiedMemoryText('uniqa', s);
  check('unified: recall carries both personas\' notes',
    text.includes('مجھے چائے پسند ہے') && text.includes('میرا نام احمد ہے'), text.split('\n')[0] || '');
  check('unified: recall carries his own words from old conversations',
    text.includes('میں عمان میں رہتا ہوں'), text);
  check('unified: assistant replies are NOT memory (only his words)',
    !text.includes('نوٹ کر لی'));
  check('unified: the duplicate fact appears exactly once',
    (text.match(/بریانی/g) || []).length === 1, text);
  check('unified: the other persona\'s lines are tagged with her/his name',
    text.includes('[یونیک] مجھے چائے پسند ہے'), text);
  check('unified: conversation lines are tagged «گفتگو»',
    text.includes('[گفتگو] میں عمان میں رہتا ہوں'), text);
  check('unified: command-shaped user lines do not leak into recall',
    !text.includes('یہ یاد رکھو میرا نام احمد ہے'));

  // Read-time only: the stores are byte-identical afterwards.
  check('unified: Uniqa\'s store untouched by the merge',
    loadNotes(s, 'uniqa').length === 2 && loadNotes(s, 'unique').length === 2);
  check('unified: empty stores → empty recall text',
    getUnifiedMemoryText('uniqa', fresh()) === '');
  check('unified: no storage at all degrades to empty, never throws',
    getUnifiedMemoryText('uniqa', null) === '' && loadUnifiedNotes('uniqa', null).length === 0);
}
{
  // Cap: a wall of long notes still fits ~1200 chars.
  const s = fresh();
  const long = Array.from({ length: 30 }, (_, i) => [
    `یاد نمبر ${i + 1} — یہ ایک لمبی یاد ہے جس میں بہت سی تفصیل ہے اور اسے مختصر کرنا ضروری ہے تاکہ پرامپٹ بھاری نہ ہو`,
    new Date(Date.UTC(2026, 10, 1) + i * 86400000).toISOString(),
  ]);
  seedNotes(s, 'uniqa', long);
  const text = getUnifiedMemoryText('uniqa', s);
  check(`unified: recall capped at ${UNIFIED_RECALL_CAP} chars`,
    text.length <= UNIFIED_RECALL_CAP, `got ${text.length}`);
  check('unified: capped recall still keeps the newest notes',
    text.includes('یاد نمبر 30') || text.includes('یاد نمبر 29'));
}

// --- 2. Date memories ----------------------------------------------------------
{
  const s = fresh();
  check('dates: empty store loads as []', loadDateMemories(s).length === 0);
  const mems = [
    makeDateMemory('میری سالگرہ', 8, 14, 'birthday'),
    makeDateMemory('شادی کی سالگرہ', 6, 20, 'anniversary'),
  ];
  saveDateMemories(mems, s);
  const loaded = loadDateMemories(s);
  check('dates: save/load round-trip keeps both entries',
    loaded.length === 2 && loaded.some((m) => m.label === 'میری سالگرہ' && m.month === 8 && m.day === 14));
  check('dates: stored under the shared key (not per-persona)',
    typeof s.getItem(DATE_MEMORIES_KEY) === 'string'
    && s.getItem(DATE_MEMORIES_KEY).includes('میری سالگرہ'));

  const today = new Date(2026, 7, 14); // 14 August
  const todays = getTodaysDates(loaded, today);
  check('dates: getTodaysDates finds 14 August on 14 August',
    todays.length === 1 && todays[0].label === 'میری سالگرہ');
  check('dates: getTodaysDates finds nothing on another day',
    getTodaysDates(loaded, new Date(2026, 7, 15)).length === 0);

  // Corrupt / invalid entries are dropped, never crash the load.
  s.setItem(DATE_MEMORIES_KEY, JSON.stringify([
    { id: 'ok', label: 'میری سالگرہ', month: 8, day: 14, kind: 'birthday' },
    { id: 'bad-month', label: 'غلط', month: 13, day: 1, kind: 'birthday' },
    { id: 'bad-day', label: 'غلط', month: 2, day: 30, kind: 'birthday' },
    { id: 'bad-kind', label: 'غلط', month: 1, day: 1, kind: 'party' },
    'not-an-object',
  ]));
  check('dates: invalid entries are dropped on load (1 of 5 survives)',
    loadDateMemories(s).length === 1);
  s.setItem(DATE_MEMORIES_KEY, 'this is not json {{{');
  check('dates: corrupt JSON loads as []', loadDateMemories(s).length === 0);
}

const DATE_POSITIVES = [
  ['میری سالگرہ 14 اگست ہے', { month: 8, day: 14, kind: 'birthday' }],
  ['میری سالگرہ 14 اگست', { month: 8, day: 14, kind: 'birthday' }],
  ['یاد رکھو میری سالگرہ کی تاریخ 14 اگست ہے', { month: 8, day: 14, kind: 'birthday' }],
  ['اگست کی 14 تاریخ میری سالگرہ ہے', { month: 8, day: 14, kind: 'birthday' }],
  ['بھابھی کی سالگرہ 5 مئی ہے', { month: 5, day: 5, kind: 'birthday', person: 'بھابھی' }],
  ['میری شادی کی سالگرہ 20 جون ہے', { month: 6, day: 20, kind: 'anniversary' }],
  ['birthday on 3 March', { month: 3, day: 3, kind: 'birthday' }],
  ['My birthday is 3 March', { month: 3, day: 3, kind: 'birthday' }],
  ['birthday 14 August', { month: 8, day: 14, kind: 'birthday' }],
  ['August 14 is my birthday', { month: 8, day: 14, kind: 'birthday' }],
  ['meri salgirah 5 may hai', { month: 5, day: 5, kind: 'birthday' }],
  ['sara ki salgirah 5 may', { month: 5, day: 5, kind: 'birthday', person: 'sara' }],
  ["Sara's birthday is 5 May", { month: 5, day: 5, kind: 'birthday', person: 'Sara' }],
  ['our wedding anniversary is 20 June', { month: 6, day: 20, kind: 'anniversary' }],
  ['میری سالگرہ 14/8 ہے', { month: 8, day: 14, kind: 'birthday' }],
  ['میری سالگرہ ۱۴ اگست ہے', { month: 8, day: 14, kind: 'birthday' }],
];
for (const [msg, want] of DATE_POSITIVES) {
  const got = extractDateMemory(msg);
  const ok = !!got && got.month === want.month && got.day === want.day && got.kind === want.kind
    && (want.person === undefined || got.person === want.person);
  check(`dates +: ${msg}`, ok, got ? `${got.kind} ${got.day}/${got.month} person=${got.person || '—'} label=${got.label}` : '(null)');
}
const DATE_NEGATIVES = [
  'میری سالگرہ کب ہے؟',          // no date at all
  'سالگرہ مبارک',                 // greeting, no date
  'آج 14 اگست ہے',                // a date, but no birthday/anniversary word
  'کل 3 مارچ کو میٹنگ ہے',        // a date, but a meeting, not a birthday
  'میری سالگرہ فروری میں ہے',      // month, no day
  'birthday',                     // word only, no date
  'میری سالگرہ 32 اگست ہے',       // impossible day
  'میری سالگرہ 30 فروری ہے',      // impossible day for February
];
for (const msg of DATE_NEGATIVES) {
  check(`dates −: ${msg}`, extractDateMemory(msg) === null,
    JSON.stringify(extractDateMemory(msg)));
}

// --- 3. Cross-character memory -------------------------------------------------
{
  const s = fresh();
  check('cross: empty other store → null', otherPersonaRecallLine('unique', s) === null);

  // Uniqa's notes show she misses him — Unique (speaking) volunteers it.
  seedNotes(s, 'uniqa', [
    ['آپ نہیں تھے تو آپ کی یاد آتی رہی', '2026-11-25T10:00:00.000Z'],
  ]);
  const miss = otherPersonaRecallLine('unique', s);
  check('cross: miss signal → one short line naming Uniqa',
    typeof miss === 'string' && miss.includes('یونیکا') && miss.includes('یاد'), miss || '(null)');
  check('cross: the line never leaks her raw note text',
    typeof miss === 'string' && !miss.includes('آپ نہیں تھے تو'), miss || '(null)');

  // Uniqa's notes only say she likes tea — nothing about HIM → null.
  const s2 = fresh();
  seedNotes(s2, 'uniqa', [['مجھے چائے پسند ہے', '2026-11-25T10:00:00.000Z']]);
  check('cross: a like about tea is NOT a line about him',
    otherPersonaRecallLine('unique', s2) === null);

  // Waiting for him.
  const s3 = fresh();
  seedNotes(s3, 'uniqa', [['آپ کا انتظار کر رہی ہوں، کب آئیں گے؟', '2026-11-25T10:00:00.000Z']]);
  const wait = otherPersonaRecallLine('unique', s3);
  check('cross: wait signal → line about waiting',
    typeof wait === 'string' && wait.includes('انتظار'), wait || '(null)');

  // Talking fondly.
  const s4 = fresh();
  seedNotes(s4, 'uniqa', [['آپ سے بات کرنا مجھے بہت اچھا لگتا ہے', '2026-11-25T10:00:00.000Z']]);
  const talk = otherPersonaRecallLine('unique', s4);
  check('cross: fond-talk signal → line about liking his talk',
    typeof talk === 'string' && talk.includes('بات کرنا'), talk || '(null)');

  // The mirror direction: Uniqa speaking, Unique's notes show he misses him.
  const s5 = fresh();
  seedNotes(s5, 'unique', [['آپ کی یاد آتا ہے جب آپ دور ہوتے ہیں', '2026-11-25T10:00:00.000Z']]);
  const mirror = otherPersonaRecallLine('uniqa', s5);
  check('cross: mirror direction names Unique, masculine grammar',
    typeof mirror === 'string' && mirror.includes('یونیک') && mirror.includes('کرتا'), mirror || '(null)');

  // Learnings feed the inference too (a learned fond-talk fact).
  const s6 = fresh();
  s6.setItem('unique-ai-learnings-unique', JSON.stringify([
    { id: 'l1', text: 'آپ سے بات کرنا اچھا لگتا ہے', kind: 'fact', createdAt: '2026-11-25T10:00:00.000Z', source: 'told' },
  ]));
  check('cross: the other persona\'s learnings count as signal too',
    typeof otherPersonaRecallLine('uniqa', s6) === 'string');
}

// --- 4. Backup still works -------------------------------------------------------
{
  const s = fresh();
  seedNotes(s, 'uniqa', [['میرا نام احمد ہے', '2026-11-20T10:00:00.000Z']]);
  seedNotes(s, 'unique', [['مجھے چائے پسند ہے', '2026-11-22T10:00:00.000Z']]);
  saveDateMemories([makeDateMemory('میری سالگرہ', 8, 14, 'birthday')], s);
  s.setItem('unique-ai-gemini-key', 'SECRET-KEY-VALUE-999');
  const data = collectBackup(s);
  check('backup: date key rides the backup', typeof data.entries[DATE_MEMORIES_KEY] === 'string');
  check('backup: both personas\' note keys ride the backup',
    typeof data.entries[NOTES_KEY] === 'string' && typeof data.entries[NOTES_KEY_UNIQUE] === 'string');
  check('backup: API key NEVER in the file',
    !('unique-ai-gemini-key' in data.entries) && !serializeBackup(data).includes('SECRET-KEY-VALUE-999'));
  const parsed = parseBackup(serializeBackup(data));
  check('backup: file parses back', parsed.ok === true);
  const target = fresh();
  applyBackup(target, parsed.data);
  check('backup: restore brings the date memory back',
    loadDateMemories(target).some((m) => m.label === 'میری سالگرہ' && m.month === 8 && m.day === 14));
  check('backup: restore brings both personas\' notes back',
    loadNotes(target, 'uniqa').length === 1 && loadNotes(target, 'unique').length === 1);
  check('backup: summary still counts notes from both personas',
    summarizeBackup(parsed.data).notes === 2, `got ${summarizeBackup(parsed.data).notes}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
