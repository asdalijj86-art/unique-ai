/**
 * test-night-backup.mjs — night voice backup (2026-10-27, user-approved:
 * "rat wala backup banao", same voices).
 *
 * Proves, with stubbed network/device lists and NO real keys:
 *  1. Server-key fallback in lib/api.ts synthesizeMairaSpeech
 *     (secure form, 2026-11-28 — the backup lives on the SERVER,
 *     the client never sees or sends a key):
 *     - account key quota -> exactly ONE backup attempt
 *       (useBackup: true, no key material in its body) -> backup
 *       success returns audio;
 *     - account key quota -> backup quota -> throws quota after
 *       exactly 2 calls (no infinite retry, no third call);
 *     - healthy account key -> exactly ONE call, never a backup;
 *     - non-quota failure (no key) -> throws at once, exactly
 *       1 call, never retried.
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
// NOTE (2026-10-27 cache fix, still true): every case below uses
// a DISTINCT text. The audio cache is keyed by exact text + voice,
// so reusing 'سلام' would return case 1a's cached audio with zero
// fetches. Distinct texts keep each case an independent proof of
// the fallback logic. (No key values exist any more — the 2026-11-25
// security build deleted client-side keys; the backup is a flag.)
console.log('\n── 1) Server-key fallback in synthesizeMairaSpeech ────────');
{
  const apiBundle = bundle(
    `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/api.ts'))};`,
    'api-lib.mjs',
  );
  const { synthesizeMairaSpeech } = await import(pathToFileURL(apiBundle).href);

  // 1a. Account key quota -> backup success, exactly 2 calls.
  // No key material travels in either call — the backup is a flag.
  fetchCalls = []; fetchScript = [errRes('quota'), okAudio()];
  const r1 = await synthesizeMairaSpeech({ text: 'سلام', female: true });
  check('account key quota -> backup audio returned', r1.audioBase64, 'b64:env');
  check('exactly 2 calls (account key, then backup once)', fetchCalls.length, 2);
  check('second call is the backup attempt', fetchCalls[1].useBackup, true);
  check('no key material in the first call', 'userApiKey' in fetchCalls[0], false);
  check('no key material in the backup call', 'userApiKey' in fetchCalls[1], false);

  // 1b. Account key quota -> backup quota -> throws quota, exactly 2 calls.
  fetchCalls = []; fetchScript = [errRes('quota'), errRes('quota')];
  let thrown = null;
  try { await synthesizeMairaSpeech({ text: 'سلام دوبارہ', female: true }); }
  catch (e) { thrown = e; }
  check('backup quota -> throws quota', thrown?.data?.errorType, 'quota');
  check('no infinite retry: exactly 2 calls', fetchCalls.length, 2);

  // 1c. Healthy account key -> exactly ONE call, never a backup.
  fetchCalls = []; fetchScript = [okAudio()];
  const r3 = await synthesizeMairaSpeech({ text: 'سلام تیسرا', female: true });
  check('healthy key -> audio returned', r3.audioBase64, 'b64:env');
  check('healthy key: exactly 1 call', fetchCalls.length, 1);
  check('that call is not a backup attempt', fetchCalls[0].useBackup, undefined);
  check('that call carried NO key material', 'userApiKey' in fetchCalls[0], false);

  // 1d. Quota is the ONLY retry: a non-quota failure (no key)
  // throws at once and is never retried.
  fetchCalls = []; fetchScript = [errRes('no_key')];
  let thrown4 = null;
  try { await synthesizeMairaSpeech({ text: 'سلام چوتھا', female: true }); }
  catch (e) { thrown4 = e; }
  check('no-key error throws at once', thrown4?.data?.errorType, 'no_key');
  check('non-quota errors are never retried: exactly 1 call', fetchCalls.length, 1);
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
