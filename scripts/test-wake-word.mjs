/**
 * test-wake-word.mjs — "Hey Unique" WAKE WORD (user order 2026-11-28).
 *
 * Bundles the REAL lib/wake-word.ts with esbuild and proves:
 *  1. MATCHER: English + Urdu wake phrases fire (whole words, inside
 *     longer sentences, with punctuation); near-misses do NOT fire
 *     («uniquely», «یونیکل», empty, unrelated chat).
 *  2. SUPPORT: getWakeWordSupport reports true only when the API
 *     exists; false with a reason otherwise (headless Chrome has
 *     none — the UI must show that honestly, never fake listening).
 *  3. LANGS: wakeWordLang alternates ur-PK / en-US per restart cycle.
 *  4. WIRING (source checks): the hook owns ONE SpeechRecognition,
 *     stops it BEFORE calling onWake, and restarts only after the
 *     cooldown; chat.tsx wires the hook + indicator + Settings row;
 *     the front shows the indicator and the Settings row exists.
 *
 * Run: node scripts/test-wake-word.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'wake-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/wake-word.ts'))};\n`);
const bundled = join(outDir, 'wake-libs.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const W = await import(pathToFileURL(bundled).href);

const chatSrc = readFileSync(join(repoRoot, 'client/src/pages/chat.tsx'), 'utf8');
const frontSrc = readFileSync(join(repoRoot, 'client/src/components/StonicFront.tsx'), 'utf8');
const settingsSrc = readFileSync(join(repoRoot, 'client/src/components/SettingsPanel.tsx'), 'utf8');
const hookSrc = readFileSync(join(repoRoot, 'client/src/lib/use-wake-word.ts'), 'utf8');

let passed = 0; let failed = 0;
function check(name, ok) {
  if (ok) { passed += 1; console.log(`  PASS ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name}`); }
}
function eq(name, got, want) { check(`${name} (got ${JSON.stringify(got)})`, got === want); }

// ---------------------------------------------------------------------------
// 1. Matcher — fires.
// ---------------------------------------------------------------------------
eq('hey unique', W.isWakeWord('Hey Unique'), true);
eq('hey unique + command', W.isWakeWord('Hey Unique, what is the weather?'), true);
eq('hey unique lowercase', W.isWakeWord('hey unique'), true);
eq('hey unique with punctuation', W.isWakeWord('Hey Unique!'), true);
eq('hey uniqa', W.isWakeWord('Hey Uniqa'), true);
eq('bare unique', W.isWakeWord('Unique'), true);
eq('bare uniqa', W.isWakeWord('uniqa suno'), true);
eq('urdu hey unique', W.isWakeWord('ہے یونیک'), true);
eq('urdu bare unique', W.isWakeWord('یونیک'), true);
eq('urdu uniqa', W.isWakeWord('یونیکا'), true);
eq('urdu wake in sentence', W.isWakeWord('اے یونیکا سنو، موسم کیسا ہے؟'), true);
eq('urdu wake mid-sentence', W.isWakeWord('سنو یونیک، مجھے یاد دلاؤ'), true);

// ---------------------------------------------------------------------------
// 1b. Matcher — does NOT fire.
// ---------------------------------------------------------------------------
eq('uniquely is not a wake', W.isWakeWord('uniquely'), false);
eq('unique-ness is not a wake', W.isWakeWord('uniqueness'), false);
eq('urdu suffix is not a wake', W.isWakeWord('یونیکل'), false);
eq('empty', W.isWakeWord(''), false);
eq('spaces only', W.isWakeWord('   '), false);
eq('ordinary chat', W.isWakeWord('میرا ریاضی کا امتحان 30 نومبر کو ہے'), false);
eq('ordinary english chat', W.isWakeWord('what is the weather in Karachi'), false);
eq('hey google is not ours', W.isWakeWord('Hey Google'), false);

// ---------------------------------------------------------------------------
// 2. Normaliser + support + langs.
// ---------------------------------------------------------------------------
eq('normalise strips punctuation', W.normalizeWakeText('Hey, Unique!'), 'hey unique');
eq('normalise urdu punctuation', W.normalizeWakeText('اے یونیکا، سنو!'), 'اے یونیکا سنو');
eq('support true with webkit', W.getWakeWordSupport({ webkitSpeechRecognition: function () {} }).supported, true);
eq('support true with standard', W.getWakeWordSupport({ SpeechRecognition: function () {} }).supported, true);
eq('support false with neither', W.getWakeWordSupport({}).supported, false);
eq('support false reason named', W.getWakeWordSupport({}).reason, 'no-speech-recognition');
eq('lang cycle 0 ur', W.wakeWordLang(0), 'ur-PK');
eq('lang cycle 1 en', W.wakeWordLang(1), 'en-US');
eq('lang cycle 2 ur again', W.wakeWordLang(2), 'ur-PK');
check('reason label honest', W.wakeWordReasonLabel('no-speech-recognition').includes('Chrome'));

// ---------------------------------------------------------------------------
// 3. Hook discipline (source checks — the live trigger cannot run in
//    headless Chrome, so the code must PROVE it behaves honestly).
// ---------------------------------------------------------------------------
check('hook uses SpeechRecognition/webkit', hookSrc.includes('webkitSpeechRecognition') && hookSrc.includes('SpeechRecognition'));
check('hook stops recogniser BEFORE onWake', (() => {
  const iStop = hookSrc.indexOf('stopRec();', hookSrc.indexOf('isWakeWord(transcript)'));
  const iWake = hookSrc.indexOf('onWakeRef.current(', hookSrc.indexOf('isWakeWord(transcript)'));
  return iStop !== -1 && iWake !== -1 && iStop < iWake;
})());
check('hook restarts only after cooldown', hookSrc.includes('HEARD_COOLDOWN_MS') && hookSrc.includes('sinceHeard < HEARD_COOLDOWN_MS'));
check('hook pauses while main mic busy', hookSrc.includes('paused'));
check('hook reports unsupported honestly', hookSrc.includes("'unsupported'") && hookSrc.includes('no-speech-recognition'));
check('hook needs a user gesture first', hookSrc.includes('waiting-gesture') && hookSrc.includes('pointerdown'));
check('hook releases mic on unmount', hookSrc.includes('useEffect(() => () => stopRec()'));

// ---------------------------------------------------------------------------
// 4. Wiring: chat.tsx + front + settings.
// ---------------------------------------------------------------------------
check('chat wires useWakeWord', chatSrc.includes('useWakeWord({') && chatSrc.includes('onWake:'));
check('chat wake pauses on recording/speaking/turn', chatSrc.includes('paused: recording || continuousVoice || isSpeaking || isPreparingVoice || busy'));
check('chat wakes from terminated + greets + listens', chatSrc.includes('setAiTerminated(false)') && chatSrc.includes('جی، میں سن رہی ہوں۔ بتائیے؟') && chatSrc.includes('interruptSpeechAndListen();'));
check('chat passes wake state to front', chatSrc.includes('wakeWord={{') && chatSrc.includes('onToggle: toggleWakeWord'));
check('chat front-mode state persisted', chatSrc.includes("secureAppStorage.getItem('unique-front-mode')") && chatSrc.includes("secureAppStorage.setItem('unique-front-mode'"));
check('chat settings default wake ON', chatSrc.includes('wakeWordEnabled: true'));
check('front renders wake indicator', frontSrc.includes('wake-word-indicator') && frontSrc.includes('uwake-indicator'));
check('front indicator toggles', frontSrc.includes('wakeWord.onToggle'));
check('front status never says Love', !frontSrc.includes('love is speaking') && !frontSrc.includes('Love is speaking'));
check('front mode pills real', frontSrc.includes('button-front-mode-new') && frontSrc.includes('button-front-mode-classic') && frontSrc.includes("onFrontModeChange?.('new')"));
check('settings has wake-word row + toggle', settingsSrc.includes('setting-row-wake-word') && settingsSrc.includes('setting-toggle-wake-word') && settingsSrc.includes('wakeWordEnabled'));
check('settings states the closed-app limit', settingsSrc.includes('ایپ پوری بند ہو تو کوئی ویب سائٹ ویک ورڈ نہیں سن سکتی'));

console.log(`\ntest-wake-word: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
