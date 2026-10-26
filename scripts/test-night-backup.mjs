/**
 * test-night-backup.mjs — night voice backup (2026-10-27, user-approved:
 * "rat wala backup banao", same voices).
 *
 * Proves, with stubbed network/device lists and NO real keys:
 *  1. Server-key fallback in lib/api.ts synthesizeMairaSpeech:
 *     - single user key quota -> exactly ONE env attempt (no userApiKey
 *       in its body) -> env success returns audio;
 *     - user key quota -> env quota -> throws quota after exactly
 *       2 calls (no infinite retry, no third call);
 *     - no user keys -> exactly ONE call (the env attempt itself,
 *       never duplicated);
 *     - two user keys quota -> env success on the 3rd call, after
 *       ALL user keys failed (never as the first attempt).
 *  2. Banner leg diagnostic in lib/voice-player.ts:
 *     - legDiagnosticText names Gemini quota, server Edge failure
 *       and no browser voice in plain words, with no secrets;
 *     - a failed reply whose legDiagnostic names those legs carries
 *       that sentence as its failureReason (the banner payload);
 *     - empty failures -> empty diagnostic (caller falls back to
 *       the single-detail reason).
 *  3. Device-voice diagnostic in lib/persona.ts:
 *     - describeDeviceVoices flags strict-picker passes per voice
 *       without changing the input list or any picker, and the
 *       existing pickers still pick the qualifying voices.
 *
 * Run: node scripts/test-night-backup.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = join(repoRoot, 'client/node_modules/.bin/esbuild');

function bundle(entrySource, outName) {
  const outDir = mkdtempSync(join(tmpdir(), 'nightbackup-'));
  const entry = join(outDir, 'entry.ts');
  writeFileSync(entry, entrySource);
  const bundled = join(outDir, outName);
  execSync(`${esbuild} ${entry} --bundle --format=esm --outfile=${bundled} --log-level=warning`, { stdio: 'pipe' });
  return bundled;
}

let passed = 0;
let failed = 0;
function check(label, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(want)}`); }
}

// --- Shared stubs: localStorage + fetch, installed BEFORE any call ---
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
let fetchCalls = [];
let fetchScript = [];
globalThis.fetch = async (_url, opts) => {
  const body = JSON.parse(opts?.body || '{}');
  fetchCalls.push(body);
  const next = fetchScript.shift();
  if (next instanceof Error) throw next;
  return next;
};
const okAudio = () => ({ ok: true, json: async () => ({ audioBase64: 'b64:env', mimeType: 'audio/wav' }) });
const errRes = (errorType) => ({ ok: false, json: async () => ({ errorType, error: 'stub' }) });

// --- 1) Server-key fallback (real lib/api.ts) ---
console.log('\n── 1) Server-key fallback in synthesizeMairaSpeech ────────');
{
  const apiBundle = bundle(
    `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/api.ts'))};`,
    'api-lib.mjs',
  );
  const { synthesizeMairaSpeech } = await import(pathToFileURL(apiBundle).href);

  // 1a. Single user key quota -> env success, exactly 2 calls.
  store.clear();
  store.set('unique-ai-gemini-key', 'AIzaTESTKEY123456');
  store.set('unique-ai-gemini-key-index', '0');
  fetchCalls = []; fetchScript = [errRes('quota'), okAudio()];
  const r1 = await synthesizeMairaSpeech({ text: 'سلام', female: true });
  check('single key quota -> env audio returned', r1.audioBase64, 'b64:env');
  check('exactly 2 calls (user key, then env once)', fetchCalls.length, 2);
  check('first call carried the user key', 'userApiKey' in fetchCalls[0], true);
  check('env call carried NO userApiKey', 'userApiKey' in fetchCalls[1], false);

  // 1b. User key quota -> env quota -> throws quota, exactly 2 calls.
  store.clear();
  store.set('unique-ai-gemini-key', 'AIzaTESTKEY123456');
  store.set('unique-ai-gemini-key-index', '0');
  fetchCalls = []; fetchScript = [errRes('quota'), errRes('quota')];
  let thrown = null;
  try { await synthesizeMairaSpeech({ text: 'سلام', female: true }); }
  catch (e) { thrown = e; }
  check('env quota -> throws quota', thrown?.data?.errorType, 'quota');
  check('no infinite retry: exactly 2 calls', fetchCalls.length, 2);

  // 1c. No user keys -> exactly ONE call (env itself, never duplicated).
  store.clear();
  fetchCalls = []; fetchScript = [okAudio()];
  const r3 = await synthesizeMairaSpeech({ text: 'سلام', female: true });
  check('no user keys -> audio returned', r3.audioBase64, 'b64:env');
  check('no duplicate env attempt: exactly 1 call', fetchCalls.length, 1);
  check('that call carried NO userApiKey', 'userApiKey' in fetchCalls[0], false);

  // 1d. Two user keys quota -> env success on 3rd call, after ALL keys.
  store.clear();
  store.set('unique-ai-gemini-key', 'AIzaTESTKEY111111\nAIzaTESTKEY222222');
  store.set('unique-ai-gemini-key-index', '0');
  fetchCalls = []; fetchScript = [errRes('quota'), errRes('quota'), okAudio()];
  const r4 = await synthesizeMairaSpeech({ text: 'سلام', female: true });
  check('two keys quota -> env audio returned', r4.audioBase64, 'b64:env');
  check('env was 3rd call, after all user keys', fetchCalls.length, 3);
  check('first two calls carried user keys', [!!fetchCalls[0].userApiKey, !!fetchCalls[1].userApiKey], [true, true]);
  check('third call carried NO userApiKey', 'userApiKey' in fetchCalls[2], false);
}

// --- 2) Banner leg diagnostic (real lib/voice-player.ts) ---
console.log('\n── 2) Banner leg diagnostic ───────────────────────────────');
{
  const vpBundle = bundle(
    `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/voice-player.ts'))};`,
    'voice-player-lib.mjs',
  );
  const { runVoiceReply, legDiagnosticText } = await import(pathToFileURL(vpBundle).href);
  const diag = legDiagnosticText({ gemini: 'quota', edge: true, browser: true });
  check('diagnostic names Gemini quota', diag.includes('Gemini'), true);
  check('diagnostic names server Edge', diag.includes('Edge'), true);
  check('diagnostic names device voice', diag.includes('ڈیوائس'), true);
  check('diagnostic carries no key material', diag.includes('AIza'), false);
  check('empty failures -> empty diagnostic', legDiagnosticText({ gemini: '', edge: false, browser: false }), '');

  const base = (over) => ({
    synthesize: async () => null,
    playAudio: async () => true,
    speakBrowserChunk: async () => false,
    speakBrowserWhole: async () => false,
    isStale: () => false,
    shouldSkipExtendedRetry: () => true,
    wasPlaybackBlocked: () => false,
    failureDetail: () => 'quota',
    legDiagnostic: () => diag,
    wait: async () => {},
    ...over,
  });
  const res = await runVoiceReply({
    text: 'یہ ایک مختصر جواب ہے۔',
    config: { persona: 'uniqa', female: true },
    prefetch: null,
    lastHeard: null,
    now: 100000,
    voiceEnabled: true,
  }, base());
  check('failed reply carries leg diagnostic as banner reason', res.failureReason, diag);
  check('failed terminal, never silence', res.terminal, 'failed');
}

// --- 3) Device-voice diagnostic (real lib/persona.ts, pickers unchanged) ---
console.log('\n── 3) Device-voice diagnostic ─────────────────────────────');
{
  const pBundle = bundle(
    `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/persona.ts'))};`,
    'persona-lib.mjs',
  );
  const { describeDeviceVoices, pickUrduMaleVoiceFrom, pickUrduFemaleVoiceFrom } = await import(pathToFileURL(pBundle).href);
  const voices = [
    { name: 'Google US English Male', lang: 'en-US' },
    { name: 'eSpeak Urdu', lang: 'ur-PK' },
    { name: 'Microsoft Uzma Online (Natural) - Urdu (Pakistan)', lang: 'ur-PK' },
  ];
  const before = JSON.stringify(voices);
  const described = describeDeviceVoices(voices);
  check('male voice flagged male, not female', [described[0].passesMale, described[0].passesFemale], [true, false]);
  check('unmarked eSpeak voice flagged for neither gender', [described[1].passesMale, described[1].passesFemale], [false, false]);
  check('Uzma voice flagged female, not male', [described[2].passesMale, described[2].passesFemale], [false, true]);
  check('diagnostic did not mutate the voice list', JSON.stringify(voices), before);
  check('picker still picks Uzma for Uniqa', pickUrduFemaleVoiceFrom(voices)?.name, voices[2].name);
  check('picker still picks the male voice for Unique', pickUrduMaleVoiceFrom(voices)?.name, voices[0].name);
}

console.log(`\nnight-backup: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
