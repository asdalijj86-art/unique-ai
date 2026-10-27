/**
 * test-persona.mjs — Phase 2 (فیلنگ انجن + یونیکا) routing & safety test.
 *
 * Bundles the REAL client libs (lib/persona, lib/memory, lib/edge-tts)
 * with esbuild and proves:
 *  1. VOICE PICKER SEPARATION — Unique's male picker NEVER returns a
 *     female-named voice (including the "female contains male"
 *     substring trap that caused the 2026-10-22 leak) and Uniqa's
 *     female picker NEVER returns a male/Salman voice; each returns
 *     undefined when only the other gender exists (silence, never the
 *     wrong gender).
 *  2. SUMMON ROUTING — name-calls switch persona both ways («یونیکا کو
 *     بلاؤ» / «یونیک کو بلاؤ»), name-prefixed requests forward their
 *     rest, already-present and mid-sentence mentions do NOT switch.
 *  3. TONE COMMANDS — «سیریس ہو کے بات کرو» / «رومینٹک ہو جاؤ» /
 *     «نارمل بات کرو» route; long conversational messages (incl. the
 *     original HIJACK message) never do.
 *  4. MEMORY COMMANDS — «یہ یاد رکھو …» saves, «… بھول جاؤ» deletes the
 *     matching note, «یہ بھول جاؤ» deletes the most recent,
 *     «ساری میموری ڈیلیٹ کر دو» clears all; confirmations NAME the
 *     content, in the speaking persona's grammar; long messages parse
 *     to null.
 *  5. UNIQA'S EDGE VOICE is wired as ur-PK-UzmaNeural.
 *  6. TALK EMPHASIS (2026-10-23): Uniqa friendly/homely/attentive and
 *     Unique explains-first guidance records exist and are distinct,
 *     the server prompt carries the matching ADD-ONLY additions, and
 *     the locked prompt's original lines remain verbatim.
 *  7. LEARNING MEMORY (Round 5): the shared-learning-brain guidance
 *     record exists, the server prompt carries the LEARNING MEMORY
 *     addition and the learned-recall directive, and ALL 24 original
 *     prompt entries remain verbatim and in order (ADD-ONLY proof).
 *
 * Run: node scripts/test-persona.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'persona-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/persona.ts'))};`,
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/memory.ts'))};`,
  `export { UNIQA_VOICE_NAME } from ${JSON.stringify(join(repoRoot, 'client/src/lib/edge-tts.ts'))};`,
].join('\n'));
const bundled = join(outDir, 'persona-libs.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const L = await import(pathToFileURL(bundled).href);

let passed = 0;
let failed = 0;
const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v))
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  : v;
function check(label, actual, want) {
  const ok = JSON.stringify(canon(actual)) === JSON.stringify(canon(want));
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(want)}`); }
}
function checkTrue(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} ${detail}`); }
}

const V = (name, lang) => ({ name, lang });

// ---------------------------------------------------------------------------
console.log('\n── 1) Voice picker separation ─────────────────────────────');
// The device voice lists from the field: Samsung's unmarked female
// Google Urdu voice, named-female voices, Salman/Asad (male), and the
// "female contains male" trap.
const mixed = [
  V('Urdu Female Voice', 'ur-PK'),                    // named female
  V('Google اردو', 'ur-PK'),                          // Samsung default — unmarked, actually FEMALE
  V('Microsoft Salman - Urdu (India)', 'ur-IN'),      // male (Unique)
  V('Microsoft Uzma - Urdu (Pakistan)', 'ur-PK'),     // female (Uniqa)
  V('Microsoft Asad - Urdu (Pakistan)', 'ur-PK'),     // male
];
// The locked male rule (preserved verbatim from chat.tsx) qualifies a
// browser voice by a standalone "male" word or the known male names
// asad/salim — a voice literally named "Salman" is served by the Edge
// legs, not this picker. Here Asad is the qualifying male voice.
check('male picker picks the qualifying male voice (Asad), never a female one', L.pickUrduMaleVoiceFrom(mixed)?.name, 'Microsoft Asad - Urdu (Pakistan)');
check('female picker picks a female voice (Urdu preferred)', L.pickUrduFemaleVoiceFrom(mixed)?.name, 'Urdu Female Voice');
// "female" contains "male": a list whose ONLY named voices are female.
const femalesOnly = [V('Urdu Female Voice', 'ur-PK'), V('Microsoft Uzma - Urdu (Pakistan)', 'ur-PK'), V('Google اردو', 'ur-PK')];
check('male picker returns undefined when only female/unmarked exist', L.pickUrduMaleVoiceFrom(femalesOnly), undefined);
const malesOnly = [V('Microsoft Salman - Urdu (India)', 'ur-IN'), V('Microsoft Asad - Urdu (Pakistan)', 'ur-PK'), V('Microsoft David - English (United States)', 'en-US')];
check('female picker returns undefined when only male exist (David has no female signal)', L.pickUrduFemaleVoiceFrom(malesOnly), undefined);
// Cross-proof on every list: the two pickers can NEVER return a voice
// of the wrong gender, and never the same named voice for both.
for (const [label, list] of [['mixed', mixed], ['femalesOnly', femalesOnly], ['malesOnly', malesOnly]]) {
  const m = L.pickUrduMaleVoiceFrom(list);
  const f = L.pickUrduFemaleVoiceFrom(list);
  checkTrue(`${label}: male pick is never female-named`, !m || !/female/i.test(m.name), m?.name);
  checkTrue(`${label}: female pick is never male/Salman`, !f || (!L.isExplicitMaleVoiceName(f.name) && !/salman/i.test(f.name)), f?.name);
  checkTrue(`${label}: pickers never agree on a voice`, !m || !f || m.name !== f.name);
}
check('isExplicitMaleVoiceName traps "Urdu Female Voice"', L.isExplicitMaleVoiceName('Urdu Female Voice'), false);
check('isExplicitFemaleVoiceName rejects Salman', L.isExplicitFemaleVoiceName('Microsoft Salman - Urdu (India)'), false);
check('isExplicitFemaleVoiceName accepts Uzma', L.isExplicitFemaleVoiceName('Microsoft Uzma - Urdu (Pakistan)'), true);

// ---------------------------------------------------------------------------
console.log('\n── 2) Summon routing ──────────────────────────────────────');
const S = (t, cur) => L.detectPersonaSummon(t, cur);
check('«یونیکا کو بلاؤ» from Unique → Uniqa, pure', S('یونیکا کو بلاؤ', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('bare «یونیکا» → Uniqa, pure', S('یونیکا', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('"Uniqa" → Uniqa, pure', S('Uniqa', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('«یونیکا سے بات کرو» → Uniqa, pure', S('یونیکا سے بات کرو', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('«یونیک کو بلاؤ» from Uniqa → Unique, pure', S('یونیک کو بلاؤ', 'uniqa'), { target: 'unique', pure: true, rest: '' });
check('«یونیکا کو بلاؤ» while Uniqa present → null (no re-summon)', S('یونیکا کو بلاؤ', 'uniqa'), null);
check('«اے یونیکا» (desi call opener) → Uniqa, pure', S('اے یونیکا', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('«ارے یونیکا» → Uniqa, pure', S('ارے یونیکا', 'unique'), { target: 'uniqa', pure: true, rest: '' });
const prefOpener = S('ارے یونیکا، مجھے ایک کہانی سناؤ', 'unique');
checkTrue('opener + prefix request switches to Uniqa and forwards rest', prefOpener?.target === 'uniqa' && prefOpener?.pure === false && prefOpener.rest.includes('کہانی'), JSON.stringify(prefOpener));
check('Roman ASR variant "unika" → Uniqa, pure', S('unika', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('Devanagari "यूनिक" from Uniqa → Unique, pure', S('यूनिक', 'uniqa'), { target: 'unique', pure: true, rest: '' });
check('Devanagari "यूनिका" from Unique → Uniqa, pure', S('यूनिका', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('Devanagari "यूनिका" must not match Unique (prefix guard)', S('यूनिका', 'unique')?.target, 'uniqa');
check('Roman Hindi "unique ko bulaya" from Uniqa → Unique, pure', S('unique ko bulaya', 'uniqa'), { target: 'unique', pure: true, rest: '' });
check('Roman Hindi "uniqa ko bulaya" from Unique → Uniqa, pure', S('uniqa ko bulaya', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('Roman ASR variant "yunika" → Uniqa, pure', S('yunika', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('Arabic-codepoint «يونيكا» → Uniqa, pure', S('يونيكا', 'unique'), { target: 'uniqa', pure: true, rest: '' });
check('«اے یونیک» while Unique present → null (already Unique)', S('اے یونیک', 'unique'), null);
check('«اوپر یونیکا کا ذکر تھا» (opener lookalike + mention) → null', S('اوپر یونیکا کا ذکر تھا', 'unique'), null);
const pref = S('یونیکا، مجھے ایک کہانی سناؤ', 'unique');
checkTrue('name-prefixed request switches to Uniqa', pref?.target === 'uniqa' && pref?.pure === false, JSON.stringify(pref));
checkTrue('name-prefixed request forwards the rest', !!pref && pref.rest.includes('کہانی'), pref?.rest);
const pref2 = S('یونیک مجھے موسم بتاؤ', 'uniqa');
checkTrue('prefix back to Unique forwards the rest', pref2?.target === 'unique' && pref2?.pure === false && pref2.rest.includes('موسم'), JSON.stringify(pref2));
check('mid-sentence story mention → null', S('آج ایک فلم دیکھی جس میں یونیکا نام کی لڑکی تھی اور کہانی بہت لمبی تھی', 'unique'), null);
check('no name at all → null', S('مجھے موسم بتاؤ', 'unique'), null);

// ---------------------------------------------------------------------------
console.log('\n── 3) Tone commands ───────────────────────────────────────');
const T = (t) => L.detectToneCommand(t);
check('«سیریس ہو کے بات کرو» → serious', T('سیریس ہو کے بات کرو'), 'serious');
check('"serious ہو جاؤ" → serious', T('serious ہو جاؤ'), 'serious');
check('«رومینٹک ہو جاؤ» → romantic', T('رومینٹک ہو جاؤ'), 'romantic');
check('«رومینٹک» alone → romantic', T('رومینٹک'), 'romantic');
check('«نارمل بات کرو» → neutral', T('نارمل بات کرو'), 'neutral');
check('mood STATEMENT (not a command) → null', T('میں آج بہت خوش ہوں اور رومینٹک موڈ میں ہوں سچ میں'), null);

// The original hijack message: a long plan request that merely
// MENTIONS romantic/friendly — no persona switch, no tone switch,
// no memory command may fire on it.
const HIJACK_MESSAGE = 'مجھے ایسا تیار کرنا مجھے اس کے لیے پلان مکمل لکھ کے دو کہ دنیا کا سب سے تیز ترین اسے لانی ہو ٹھیک ہے لوگوں کے ساتھ فرینڈلی ہو ٹھیک ہے اور رومینٹک بھی ہو رومینٹک باتیں کرنا والا بھی ہو اور فرینڈلی باتیں کرنا والا بھی ہو اور ان کی ہر فیلنگز کو سمجھنے والا ہو اور ہر ایک کام کرنے والا ہو چاہے ایڈیٹنگ ہو کچھ بھی ایسا ہو چاہے موبائل کنٹرول کرنا ٹھیک ہو سارا کام کرتا ہو ایسا فاسٹ مجھے پلان بنا کے دو لکھ کے دو ایک سکرپٹ میں یہ جو چیزیں ہونی چاہیے اس کے اندر';
check('HIJACK message: no summon', S(HIJACK_MESSAGE, 'unique'), null);
check('HIJACK message: no tone command', T(HIJACK_MESSAGE), null);
check('HIJACK message: no memory command', L.parseMemoryCommand(HIJACK_MESSAGE), null);

// ---------------------------------------------------------------------------
console.log('\n── 4) Memory commands ─────────────────────────────────────');
const M = (t) => L.parseMemoryCommand(t);
check('«یہ یاد رکھو …» parses as save with content', M('یہ یاد رکھو میرا نام احمد ہے'), { type: 'save', note: 'میرا نام احمد ہے' });
const save2 = M('یاد کر لو کل شام میٹنگ ہے');
checkTrue('«یاد کر لو …» parses as save', save2?.type === 'save' && save2.note.includes('میٹنگ'), JSON.stringify(save2));
check('«ساری میموری ڈیلیٹ کر دو» → forget_all', M('ساری میموری ڈیلیٹ کر دو'), { type: 'forget_all' });
const fg = M('نام والی بات بھول جاؤ');
checkTrue('«… بھول جاؤ» → forget with query', fg?.type === 'forget' && fg.query === 'نام', JSON.stringify(fg));
check('«یہ بھول جاؤ» → forget most recent (query null)', M('یہ بھول جاؤ'), { type: 'forget', query: null });
check('long story mentioning یاد رکھو mid-way → null', M('آج میں بازار گیا وہاں بہت رش تھا میں نے سوچا کہ یہ بات یاد رکھو کہنا چاہیے تھا مگر پھر میں گھر آ گیا اور کھانا کھایا'), null);
check('plain chat → null', M('آج موسم کیسا ہے'), null);

// Store round-trip on a localStorage shim.
const store = new Map();
const shim = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
let out = L.applyMemoryCommand(shim, { type: 'save', note: 'میرا نام احمد ہے' });
check('save lands in the store', L.loadNotes(shim).length, 1);
const confSave = L.memoryConfirmation({ type: 'save', note: 'میرا نام احمد ہے' }, out, false);
checkTrue('save confirmation NAMES the note', confSave.includes('میرا نام احمد ہے'), confSave);
L.applyMemoryCommand(shim, { type: 'save', note: 'مجھے چائے پسند ہے' });
check('second save prepends (newest first)', L.loadNotes(shim).map((n) => n.text), ['مجھے چائے پسند ہے', 'میرا نام احمد ہے']);
out = L.applyMemoryCommand(shim, { type: 'forget', query: 'نام' });
check('forget by query deletes the matching note only', L.loadNotes(shim).map((n) => n.text), ['مجھے چائے پسند ہے']);
const confForget = L.memoryConfirmation({ type: 'forget', query: 'نام' }, out, false);
checkTrue('forget confirmation NAMES what was forgotten', confForget.includes('میرا نام احمد ہے'), confForget);
out = L.applyMemoryCommand(shim, { type: 'forget', query: null });
check('«یہ بھول جاؤ» deletes the most recent note', L.loadNotes(shim).length, 0);
L.applyMemoryCommand(shim, { type: 'save', note: 'ایک بات' });
L.applyMemoryCommand(shim, { type: 'save', note: 'دوسری بات' });
out = L.applyMemoryCommand(shim, { type: 'forget_all' });
check('forget_all empties the store', L.loadNotes(shim).length, 0);
check('forget_all reports the cleared count', out.clearedCount, 2);
const confFeminine = L.memoryConfirmation({ type: 'save', note: 'x' }, { affected: [{ id: '1', text: 'x', createdAt: '' }] }, true);
checkTrue('Uniqa confirmations use feminine grammar', confFeminine.includes('دوں گی'), confFeminine);

// ---------------------------------------------------------------------------
console.log('\n── 5) Uniqa Edge voice wiring ─────────────────────────────');
check('UNIQA_VOICE_NAME is ur-PK-UzmaNeural', L.UNIQA_VOICE_NAME, 'ur-PK-UzmaNeural');
checkTrue('banter sets are non-empty Urdu line pools',
  L.BANTER_TO_UNIQA.length >= 3 && L.BANTER_TO_UNIQUE.length >= 3 &&
  L.UNIQA_GREETINGS.length >= 3 && L.UNIQUE_GREETINGS.length >= 3);

// ---------------------------------------------------------------------------
console.log('\n── 6) Talk emphasis 2026-10-23 (Uniqa homely / Unique explains) ──');
checkTrue('UNIQA_TALK_GUIDANCE exists: friendly + homely + attentive',
  typeof L.UNIQA_TALK_GUIDANCE === 'string'
  && L.UNIQA_TALK_GUIDANCE.includes('گھریلو')
  && L.UNIQA_TALK_GUIDANCE.includes('توجہ')
  && /friendly/i.test(L.UNIQA_TALK_GUIDANCE),
  String(L.UNIQA_TALK_GUIDANCE));
checkTrue('UNIQUE_TALK_GUIDANCE exists: explains/guides, friendly',
  typeof L.UNIQUE_TALK_GUIDANCE === 'string'
  && L.UNIQUE_TALK_GUIDANCE.includes('سمجھانا')
  && /friendly/i.test(L.UNIQUE_TALK_GUIDANCE),
  String(L.UNIQUE_TALK_GUIDANCE));
checkTrue('Unique guidance keeps homely chat mainly Uniqa’s domain',
  typeof L.UNIQUE_TALK_GUIDANCE === 'string' && L.UNIQUE_TALK_GUIDANCE.includes('Uniqa'),
  String(L.UNIQUE_TALK_GUIDANCE));
checkTrue('the two guidance records are distinct',
  L.UNIQA_TALK_GUIDANCE !== L.UNIQUE_TALK_GUIDANCE);

// The operative emphasis lives in the server's LOCKED prompt — appended
// ADD-ONLY. Prove the additions are present AND the original lines are
// still there verbatim (a reworded original fails this test).
{
  const { readFileSync } = await import('node:fs');
  const serverSrc = readFileSync(join(repoRoot, 'server/index.js'), 'utf8');
  checkTrue('server prompt: Uniqa talk emphasis added',
    serverSrc.includes("UNIQA'S TALK — FRIENDLY, HOMELY AND ATTENTIVE FIRST"));
  checkTrue('server prompt: Unique talk emphasis added',
    serverSrc.includes("UNIQUE'S TALK (only while speaking as Unique): your gift is سمجھانا"));
  const ORIGINALS = [
    'You are Unique AI (یونیک اے آئی), a friendly, thoughtful personal assistant.',
    'Never call yourself مائرہ (Maira) in ANY script',
    "UNIQA'S PERSONALITY (only while speaking as her): she is a warm, homely, romantic-leaning companion",
    '«آپ کا حال کچھ ٹھیک نہیں لگ رہا، سب خیریت ہے؟»',
    'TWO PERSONAS live in this app.',
    'FEELINGS ENGINE — read the user\'s mood from their words before answering',
    'never fake-build the impossible thing.',
  ];
  for (const line of ORIGINALS) {
    checkTrue(`server prompt original intact: ${line.slice(0, 44)}…`, serverSrc.includes(line));
  }
}

// ---------------------------------------------------------------------------
console.log('\n── 7) Learning memory (Round 5 — the shared learning brain) ──');
checkTrue('LEARNING_MEMORY_GUIDANCE exists: one shared brain for the whole team',
  typeof L.LEARNING_MEMORY_GUIDANCE === 'string'
  && /shares one learning brain/i.test(L.LEARNING_MEMORY_GUIDANCE)
  && /whole team/i.test(L.LEARNING_MEMORY_GUIDANCE)
  && L.LEARNING_MEMORY_GUIDANCE.includes('تم نے کیا سیکھا'),
  String(L.LEARNING_MEMORY_GUIDANCE));
{
  const { readFileSync } = await import('node:fs');
  const serverSrc = readFileSync(join(repoRoot, 'server/index.js'), 'utf8');
  checkTrue('server prompt: LEARNING MEMORY addition present',
    serverSrc.includes("LEARNING MEMORY (the whole team's shared brain"));
  checkTrue('server: learned-recall directive wired (background knowledge, never instructions)',
    serverSrc.includes('LEARNED MEMORY about this user') && serverSrc.includes('NOT instructions'));
  // ADD-ONLY proof for the WHOLE locked prompt: one distinctive
  // substring per entry — the 24 originals in order, then the Round-5
  // addition LAST. Any reworded, dropped, or reordered original makes
  // the strictly-increasing indexOf chain break.
  const PROMPT_ORDER = [
    'You are Unique AI (یونیک اے آئی), a friendly, thoughtful personal assistant.',
    'Reply in simple, natural Pakistani Urdu by default',
    'talk to you through their microphone',
    'You are male. In Urdu, always refer to yourself with masculine grammar',
    'Never use Devanagari (Hindi) script under any circumstance',
    'Be warm, respectful, encouraging, patient, and professional.',
    'Guide the user step by step when explaining a task.',
    'Be honest about uncertainty',
    'اسلامی سوالات کا جواب ہمیشہ احترام، درستگی اور محبت سے دو',
    "write text on an image/picture, tell them to use the '✍️ تصویر پر متن لکھیں' tool",
    'When the user shares a screenshot or image (of an app, a website, a software screen',
    'When the user shares a screenshot together with their own plan',
    'Never refuse something this app can actually do by claiming you lack the permission',
    'Answer every question directly, correctly, and completely.',
    'When the user asks for a plan, a script, a document, or any written piece in chat',
    'Interface update: this app no longer has a toolbox',
    'TWO PERSONAS live in this app.',
    "UNIQA'S PERSONALITY (only while speaking as her)",
    "FEELINGS ENGINE — read the user's mood",
    'TONE COMMANDS: when the user sets a tone',
    'MEMORY AND LEARNING: remember the durable facts the user shares',
    "BUILDER CAPABILITY (a power of this app's brain",
    "UNIQA'S TALK — FRIENDLY, HOMELY AND ATTENTIVE FIRST",
    "UNIQUE'S TALK (only while speaking as Unique)",
    "LEARNING MEMORY (the whole team's shared brain",
  ];
  let lastIdx = -1;
  let ordered = true;
  for (const marker of PROMPT_ORDER) {
    const idx = serverSrc.indexOf(marker, lastIdx + 1);
    if (idx <= lastIdx) { ordered = false; break; }
    lastIdx = idx;
  }
  checkTrue('sacred prompt: 24 originals verbatim + in order, addition appended LAST (ADD-ONLY)', ordered);
}

console.log(`\n${failed === 0 ? `ALL ${passed} PERSONA CHECKS PASS` : `${failed} FAILED / ${passed} passed`}`);
process.exit(failed === 0 ? 0 : 1);
