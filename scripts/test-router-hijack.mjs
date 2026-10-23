/**
 * test-router-hijack.mjs — regression test for the router-hijack bug
 * (2026-10-22): the user's ~100-word conversational request for a
 * written plan was answered with the canned «جی، قرآن پاک کھول رہا
 * ہوں۔» because server/brain.js substring-matched «روم» (Surah Ar-Rum)
 * inside «رومینٹک» and the Quran rule had no command-intent gate.
 *
 * What this proves:
 *  1. The EXACT reported message, plus similar long conversational
 *     Urdu/Roman messages (plan requests, questions, stories), classify
 *     as plain 'chat' on the server — they reach the Gemini brain.
 *  2. The client-side matchers agree: parseSurahReference finds no
 *     surah in the long message, parseWebsiteCommand yields no real
 *     command, and the client focus-route mirror (with the new
 *     command-shape gate) sends every long message to the brain.
 *  3. Genuine short commands still route exactly as before.
 *  4. detectDataIntents finds nothing in the plan request (no fake
 *     agent team) and finds all three tools in a real multi-request.
 *
 * Run: node scripts/test-router-hijack.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const { classifyIntent, detectDataIntents } = await import(pathToFileURL(join(repoRoot, 'server/brain.js')).href);

// Bundle the REAL client matchers (same harness as test-surah-routing).
const outDir = mkdtempSync(join(tmpdir(), 'hijack-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, [
  `export { parseSurahReference } from ${JSON.stringify(join(repoRoot, 'client/src/lib/surah-names.ts'))};`,
  `export { parseWebsiteCommand } from ${JSON.stringify(join(repoRoot, 'client/src/lib/voice-commands.ts'))};`,
  `export { parseMemoryCommand } from ${JSON.stringify(join(repoRoot, 'client/src/lib/memory.ts'))};`,
  `export { detectPersonaSummon, detectToneCommand } from ${JSON.stringify(join(repoRoot, 'client/src/lib/persona.ts'))};`,
  `export { parseBackupCommand } from ${JSON.stringify(join(repoRoot, 'client/src/lib/backup.ts'))};`,
].join('\n'));
const bundled = join(outDir, 'client-matchers.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const { parseSurahReference, parseWebsiteCommand, parseMemoryCommand, detectPersonaSummon, detectToneCommand, parseBackupCommand } = await import(pathToFileURL(bundled).href);

// Mirror of the client focus routing in chat.tsx handleFocusCommand,
// INCLUDING the new command-shape class gate (the real function is a
// component closure and cannot be imported; the mirror is kept in
// lockstep, exactly like test-surah-routing.mjs does for its branch).
const COMMAND_WORD_LIMIT = 12;
const countWords = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const isCommandShapedText = (t, limit = COMMAND_WORD_LIMIT) => {
  const n = countWords(t);
  return n > 0 && n <= limit;
};
function clientFocusRoute(text, focusView = null) {
  if (focusView && isCommandShapedText(text, 6) && /(واپس|پیچھے|بند کرو|بند کر|back|close)/i.test(text)) return 'close';
  if (!isCommandShapedText(text)) return 'brain';
  const reciteIntent = /(سناؤ|سناو|سنا دو|سنا دیں|تلاوت|پڑھ کر سنا|پڑھو|پڑھیں|سننا|recite|recitation|play|sunao|suna do|parho|tilawat)/i.test(text);
  const openIntent = /(کھول|کھولو|دکھا|open)/i.test(text);
  const namedSurah = parseSurahReference(text);
  const mentionsSurahWord = /(سورت|سورۃ|سورة|سورہ|surah)/i.test(text);
  const mentionsQuranWord = /(قرآن|quran)/i.test(text);
  if (namedSurah && (reciteIntent || openIntent)) return `quran:${namedSurah}`;
  if (reciteIntent && (mentionsQuranWord || mentionsSurahWord || /تلاوت/.test(text))) {
    return `quran:${mentionsSurahWord ? 114 : 1}`;
  }
  const hasVerb = /(دکھا|دکھاؤ|کھول|کھولو|اوپن|کرو|کر دو|show|open|چاہیے|لگاؤ|بتاؤ)/i.test(text);
  const isShort = countWords(text) <= 6;
  const isQuestion = /(کیا|کیوں|کب|کہاں|کیسے)/.test(text);
  const wantsRecite = /(سناؤ|تلاوت|پڑھو|سننا|recite|listen)/i.test(text);
  // Phase سادگی: there is NO 'tools' focus target any more — the
  // toolbox is gone, so «ٹولز کھولو» falls through to the brain.
  const focusTargets = [
    [/(نقشہ|نقشے|\bmap\b)/i, 'map'],
    [/(واٹس ایپ|واٹس‌ایپ|whatsapp)/i, 'whatsapp'],
    [/(قرآن|quran)/i, 'quran'],
  ];
  for (const [pattern, view] of focusTargets) {
    const gateOk = hasVerb || (isShort && !isQuestion) || (view === 'quran' && wantsRecite);
    if (pattern.test(text) && gateOk) {
      if (focusView === view && !(view === 'quran' && wantsRecite)) return 'brain';
      return `focus:${view}`;
    }
  }
  return 'brain';
}

let passed = 0;
let failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} (got ${JSON.stringify(actual)}${ok ? '' : `, want ${JSON.stringify(expected)}`})`);
}

// --- The exact reported message -------------------------------------------
const HIJACK_MESSAGE = 'مجھے ایسا تیار کرنا مجھے اس کے لیے پلان مکمل لکھ کے دو کہ دنیا کا سب سے تیز ترین اسے لانی ہو ٹھیک ہے لوگوں کے ساتھ فرینڈلی ہو ٹھیک ہے اور رومینٹک بھی ہو رومینٹک باتیں کرنا والا بھی ہو اور فرینڈلی باتیں کرنا والا بھی ہو اور ان کی ہر فیلنگز کو سمجھنے والا ہو اور ہر ایک کام کرنے والا ہو چاہے ایڈیٹنگ ہو کچھ بھی ایسا ہو چاہے موبائل کنٹرول کرنا ٹھیک ہو سارا کام کرتا ہو ایسا فاسٹ مجھے پلان بنا کے دو لکھ کے دو ایک سکرپٹ میں یہ جو چیزیں ہونی چاہیے اس کے اندر';

check('server: exact hijack message → chat', classifyIntent(HIJACK_MESSAGE).intent, 'chat');
check('client: no surah parsed from hijack message', parseSurahReference(HIJACK_MESSAGE), null);
const hijackSite = parseWebsiteCommand(HIJACK_MESSAGE);
check('client: no website command in hijack message', !hijackSite || hijackSite.isSearchFallback === true, true);
check('client focus route: hijack message → brain', clientFocusRoute(HIJACK_MESSAGE), 'brain');
check('server: no data intents in hijack message', detectDataIntents(HIJACK_MESSAGE).length, 0);

// --- Similar long conversational messages: ALL must reach the brain -------
const LONG_MESSAGES = [
  // plan request that mentions Quran/tilawat as CONTENT
  'مجھے ایک ایسا روزانہ کا پلان لکھ کر دو جس میں قرآن کی تلاوت، نماز کی پابندی اور پڑھائی سب شامل ہو اور دوستوں کے ساتھ گھومنے کا وقت بھی نکل آئے',
  // story mentioning a surah-name person + weather as scenery
  'کل میں بازار گیا تو وہاں یوسف ملا، اس نے کہا کہ موسم بہت اچھا ہے، پھر ہم نے چائے پی، گپ شپ لگائی اور شام کو گھر واپس آ گئے',
  // a QUESTION about a surah (knowledge ask, not a recite command)
  'مجھے سورۃ روم کے بارے میں تفصیل سے بتاؤ کہ یہ سورت کب نازل ہوئی، اس کا مرکزی موضوع کیا ہے اور ہم اس سے اپنی زندگی میں کیا سبق سیکھ سکتے ہیں',
  // Roman Urdu story request («sunao» as "narrate a story", long)
  'mujhe ek lambi si kahani sunao jisme ek larka apne doston ke saath lambi sair par jata hai aur wahan un ke saath bohat maza karta hai',
  // long video-planning request containing «اسکرپٹ لکھو» as one clause
  'میں چاہتا ہوں کہ تم میری اگلی ویڈیو کے لیے اسکرپٹ بھی لکھو، تھمب نیل کا آئیڈیا بھی دو اور ساتھ یہ بھی بتاؤ کہ ویڈیو کس وقت اپلوڈ کروں کہ زیادہ سے زیادہ لوگ دیکھیں',
  // Friday («جمعہ» is a surah name AND the weekday) in a social plan
  'جمعہ کے دن ہم سب دوست مل کر کھانا کھائیں گے، تم مجھے کوئی اچھی سی جگہ تجویز کرو جہاں کی بریانی پورے شہر میں مشہور ہو اور دام بھی مناسب ہوں',
  // long request mentioning ملک (country / Surah Al-Mulk) as a topic
  'آج کل ملک کے حالات پر ہر کوئی بات کر رہا ہے، تم مجھے سادہ الفاظ میں سمجھاؤ کہ مہنگائی کیوں بڑھ رہی ہے اور عام آدمی کو اس کا سامنا کیسے کرنا چاہیے',
];
LONG_MESSAGES.forEach((msg, i) => {
  check(`server: long conversational #${i + 1} → chat`, classifyIntent(msg).intent, 'chat');
  check(`client focus route: long #${i + 1} → brain`, clientFocusRoute(msg), 'brain');
});

// --- Genuine short commands still route (regression) -----------------------
const COMMANDS = [
  ['قرآن پاک کھولو', 'media_tool:quran'],
  ['سورۃ ناس پڑھ کر سناؤ', 'media_tool:quran'],
  ['تلاوت سناؤ', 'media_tool:quran'],
  ['یٰسین سناؤ', 'media_tool:quran'],
  ['لاہور کا موسم بتاؤ', 'weather'],
  ['یوٹیوب کھولو', 'open_website'],
  ['5 منٹ کا ٹائمر لگاؤ', 'timer'],
  ['100 ڈالر کتنے روپے ہیں', 'currency'],
];
for (const [msg, want] of COMMANDS) {
  const c = classifyIntent(msg);
  check(`server command: ${msg.slice(0, 26)}`, `${c.intent}${c.tool ? `:${c.tool}` : ''}`, want);
}
check('client focus: قرآن پاک کھولو', clientFocusRoute('قرآن پاک کھولو'), 'focus:quran');
check('client focus: سورۃ ناس پڑھ کر سناؤ', clientFocusRoute('سورۃ ناس پڑھ کر سناؤ'), 'quran:114');
check('client focus: نقشہ دکھاؤ', clientFocusRoute('نقشہ دکھاؤ'), 'focus:map');
// Repeat-fire guard: Quran already open + unrelated short input must
// NOT re-emit the canned open line — it falls through to the brain.
check('client focus: already-open quran + «قرآن» remark → brain', clientFocusRoute('قرآن بہت سکون دیتا ہے', 'quran'), 'brain');

// --- Multi-intent detection (Task D) ---------------------------------------
const multi = detectDataIntents('لاہور کا موسم بتاؤ اور تازہ خبریں بھی سناؤ اور 100 ڈالر کتنے روپے ہیں یہ بھی بتاؤ');
check('multi: 3 data intents found', multi.map((m) => m.intent).join(','), 'weather,news,currency');

// --- Phase 2: memory / persona / tone commands obey the same gate ---------
// The new local commands (lib/memory, lib/persona) must NEVER swallow a
// conversational message: every long message above parses to null on
// all three detectors, and the server class gate keeps long
// memory-flavoured text at 'chat' too.
check('memory: hijack message → null', parseMemoryCommand(HIJACK_MESSAGE), null);
check('persona: hijack message → no summon', detectPersonaSummon(HIJACK_MESSAGE, 'unique'), null);
check('tone: hijack message → no tone command', detectToneCommand(HIJACK_MESSAGE), null);
LONG_MESSAGES.forEach((msg, i) => {
  check(`memory: long #${i + 1} → null`, parseMemoryCommand(msg), null);
  check(`persona: long #${i + 1} → no summon`, detectPersonaSummon(msg, 'unique'), null);
  check(`tone: long #${i + 1} → null`, detectToneCommand(msg), null);
});
const LONG_MEMORY_STORY = 'آج دادا جی کہہ رہے تھے کہ یہ یاد رکھو بیٹا وقت کی قدر کرو، اور دادی بولیں سب کچھ بھول جاؤ بس اچھے کام یاد رکھو، پھر ہم سب نے مل کر کھانا کھایا اور دیر تک گپیں لگاتے رہے';
check('server: long story quoting یاد رکھو/بھول جاؤ → chat', classifyIntent(LONG_MEMORY_STORY).intent, 'chat');
check('memory: long story quoting یاد رکھو/بھول جاؤ → null', parseMemoryCommand(LONG_MEMORY_STORY), null);
// …while the genuine short commands DO parse (the feature works).
check('memory: «یہ یاد رکھو …» → save', parseMemoryCommand('یہ یاد رکھو میرا نام احمد ہے')?.type, 'save');
check('memory: «ساری میموری ڈیلیٹ کر دو» → forget_all', parseMemoryCommand('ساری میموری ڈیلیٹ کر دو')?.type, 'forget_all');
check('persona: «یونیکا کو بلاؤ» → uniqa', detectPersonaSummon('یونیکا کو بلاؤ', 'unique')?.target, 'uniqa');
check('tone: «رومینٹک ہو جاؤ» → romantic (no persona switch implied)', detectToneCommand('رومینٹک ہو جاؤ'), 'romantic');

// --- Phase 3: builder orders obey the same gate ---------------------------
// A build order reaches احمد's workshop ONLY when command-shaped with
// a buildable noun; build-TALK inside long messages stays chat, a
// status question needs a real build context, and «بنا دو» with a
// non-buildable object is conversation — never a hijacked build.
check('server: build order «کار والی گیم بنا دو» → build_app', classifyIntent('کار والی گیم بنا دو').intent, 'build_app');
check('server: build order «ویب سائٹ بنا دو» → build_app', classifyIntent('ویب سائٹ بنا دو').intent, 'build_app');
check('server: «میرا کام کہاں تک پہنچا؟» → build_status', classifyIntent('میرا کام کہاں تک پہنچا؟').intent, 'build_status');
check('server: «کھانا بنا دو» (not buildable) → chat', classifyIntent('کھانا بنا دو').intent, 'chat');
LONG_MESSAGES.forEach((msg, i) => {
  const ci = classifyIntent(msg).intent;
  check(`builder: long #${i + 1} not hijacked`, ci === 'build_app' || ci === 'build_status' ? 'HIJACKED' : 'safe', 'safe');
});
check('builder: long plan request mentioning سافٹ ویئر/گیم بنانا → chat', classifyIntent('میں چاہتا ہوں کہ تم میرے لیے ایک بہت اچھا سا سافٹ ویئر بنانے کا پورا پلان لکھ کر دو جس میں ساری تفصیل ہو کہ کون سی ٹیکنالوجی استعمال ہوگی، کتنا وقت لگے گا اور بچے اس گیم کو کھیل کر کیا سیکھیں گے').intent, 'chat');

// --- Phase 4: brain-backup commands obey the same gate --------------------
// «بیک اپ بنا دو» / «بیک اپ واپس لاؤ» are file actions — they may fire
// ONLY as short orders. Backup-TALK (asking HOW to back up, worrying
// about losing data) is conversation for the brain, on every layer.
const LONG_BACKUP_STORY = 'میں سوچ رہا تھا کہ اگر میرا لیپ ٹاپ خراب ہو جائے تو میری ساری باتیں اور یادیں ضائع ہو جائیں گی اس لیے تم مجھے کوئی ایسا طریقہ بتاؤ کہ میں ان کا بیک اپ بنا کر محفوظ رکھ سکوں اور جب چاہوں واپس بھی لا سکوں آسانی کے ساتھ';
check('server: long backup story → chat', classifyIntent(LONG_BACKUP_STORY).intent, 'chat');
check('backup: long backup story → null', parseBackupCommand(LONG_BACKUP_STORY), null);
check('backup: hijack message → null', parseBackupCommand(HIJACK_MESSAGE), null);
LONG_MESSAGES.forEach((msg, i) => {
  check(`backup: long #${i + 1} → null`, parseBackupCommand(msg), null);
});
check('backup: «بیک اپ بنا دو» → create', parseBackupCommand('بیک اپ بنا دو'), 'create');
check('backup: «بیک اپ واپس لاؤ» → restore', parseBackupCommand('بیک اپ واپس لاؤ'), 'restore');
check('backup: «بیک اپ ڈیلیٹ کر دو» → null (delete is not a restore)', parseBackupCommand('بیک اپ ڈیلیٹ کر دو'), null);

console.log(`\n${failed === 0 ? `ALL ${passed} HIJACK CHECKS PASS` : `${failed} FAILED / ${passed} passed`}`);
process.exit(failed === 0 ? 0 : 1);
