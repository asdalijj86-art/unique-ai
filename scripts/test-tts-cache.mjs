/**
 * test-tts-cache.mjs — Gemini TTS cache + dead-key skip (2026-10-27,
 * user-approved cache fix). No real keys, no network: fetch and
 * localStorage are stubbed, so no Gemini call ever leaves the box.
 *
 * Proves, against the REAL client/src/lib/tts-cache.ts and the REAL
 * client/src/lib/api.ts synthesizeMairaSpeech:
 *  1. second synthesis of identical text + voice returns cached
 *     audio with zero new fetches (Replay / "سنیں" is free);
 *  2. same text with a DIFFERENT voice does NOT return the cached
 *     audio (fail-closed on voice mismatch);
 *  3. a quota-dead key is skipped on the next call (no fetch for
 *     it), and the tracker re-probes it after its window expires
 *     (unit test with an injected clock);
 *  4. cache caps: entry cap and byte cap evict oldest first.
 *
 * Run: node scripts/test-tts-cache.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'ttscache-'));
const esbuild = join(repoRoot, 'client/node_modules/.bin/esbuild');

function bundle(srcRel, outName) {
  const entry = join(outDir, `${outName}-entry.ts`);
  writeFileSync(entry, `export * from ${JSON.stringify(join(repoRoot, srcRel))};`);
  const bundled = join(outDir, `${outName}.mjs`);
  execSync(`${esbuild} ${entry} --bundle --format=esm --outfile=${bundled}`, { stdio: 'pipe' });
  return bundled;
}

let passed = 0;
let failed = 0;
function check(label, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(want)}`); }
}

// ── Unit: cache + tracker (pure module, no React) ──────────────────
const cacheMod = await import(pathToFileURL(bundle('client/src/lib/tts-cache.ts', 'tts-cache')).href);
const { AudioCache, DeadKeyTracker, makeTtsCacheKey } = cacheMod;

console.log('\n── 1) Cache key separates voices ─────────────────────────────');
{
  const a = makeTtsCacheKey('same text', 'Charon', false);
  const b = makeTtsCacheKey('same text', 'Sulafat', true);
  const c = makeTtsCacheKey('same text', 'Charon', false);
  check('different voice => different key', a !== b, true);
  check('identical text+voice => identical key', a === c, true);
}

console.log('\n── 2) Cache caps evict oldest first ───────────────────────────');
{
  const cache = new AudioCache(2, 1000);
  cache.set('k1', { audioBase64: 'a'.repeat(100), mimeType: 'audio/mpeg' });
  cache.set('k2', { audioBase64: 'b'.repeat(100), mimeType: 'audio/mpeg' });
  cache.set('k3', { audioBase64: 'c'.repeat(100), mimeType: 'audio/mpeg' });
  check('entry cap holds', cache.size, 2);
  check('oldest evicted', cache.get('k1'), undefined);
  check('newest kept', !!cache.get('k3'), true);
  const byteCache = new AudioCache(20, 250);
  byteCache.set('x', { audioBase64: 'x'.repeat(200), mimeType: 'audio/mpeg' });
  byteCache.set('y', { audioBase64: 'y'.repeat(200), mimeType: 'audio/mpeg' });
  check('byte cap evicts oldest', byteCache.get('x'), undefined);
  check('oversize single entry never stored', (() => {
    const cc = new AudioCache(20, 100);
    cc.set('big', { audioBase64: 'z'.repeat(500), mimeType: 'audio/mpeg' });
    return cc.size;
  })(), 0);
}

console.log('\n── 3) Dead-key skip + timed re-probe (injected clock) ─────────');
{
  let now = 1_000_000;
  const tracker = new DeadKeyTracker(10 * 60 * 1000, () => now);
  tracker.markDead('k1');
  check('skipped inside window (9 min)', tracker.isSkipped('k1'), true);
  now += 9 * 60 * 1000;
  check('still skipped at 9 min', tracker.isSkipped('k1'), true);
  now += 2 * 60 * 1000; // 11 min total
  check('re-probed after window (11 min)', tracker.isSkipped('k1'), false);
  tracker.markDead('k2');
  tracker.clear('k2');
  check('success clears dead mark', tracker.isSkipped('k2'), false);
}

// ── Integration: real synthesizeMairaSpeech, stubbed fetch ─────────
// Stub localStorage BEFORE dynamically importing the api bundle.
const store = new Map();
const KEY_ONE = 'AIzaTestKeyOne12345';
const KEY_TWO = 'AIzaTestKeyTwo12345';
store.set('unique-ai-gemini-key', `${KEY_ONE}\n${KEY_TWO}`);
store.set('unique-ai-gemini-key-index', '0');
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

let fetchCalls = 0;
const fetchLog = [];
globalThis.fetch = async (url, opts) => {
  fetchCalls++;
  const body = JSON.parse(opts?.body || '{}');
  // NOTE: both stub keys share the "AIza" prefix, so log by identity,
  // never by prefix — a prefix check cannot tell the keys apart.
  fetchLog.push(!body.userApiKey ? 'key:none' : body.userApiKey === KEY_ONE ? 'key:ONE' : body.userApiKey === KEY_TWO ? 'key:TWO' : 'key:other');
  if (url === '/api/openai/speech') {
    // KEY_ONE is quota-dead; every other key succeeds.
    if (body.userApiKey === KEY_ONE) {
      return { ok: false, json: async () => ({ errorType: 'quota' }) };
    }
    return {
      ok: true,
      json: async () => ({ audioBase64: `b64:${body.voiceName}:${body.text}`, mimeType: 'audio/mpeg' }),
    };
  }
  return { ok: false, json: async () => ({}) };
};

const apiMod = await import(pathToFileURL(bundle('client/src/lib/api.ts', 'api')).href);
const { synthesizeMairaSpeech } = apiMod;

console.log('\n── 4) Identical text+voice: second call is a cache hit ───────');
{
  const before = fetchCalls;
  const first = await synthesizeMairaSpeech({ text: 'hello world test', female: false });
  const afterFirst = fetchCalls;
  check('first call fetches (dead key + live key)', afterFirst - before, 2);
  check('first audio is Charon voice', first.audioBase64, 'b64:Charon:hello world test');
  const second = await synthesizeMairaSpeech({ text: 'hello world test', female: false });
  check('second call adds zero fetches', fetchCalls - afterFirst, 0);
  check('cached audio identical', second.audioBase64, first.audioBase64);
}

console.log('\n── 5) Same text, different voice: NO cached audio ────────────');
{
  const before = fetchCalls;
  const uniqa = await synthesizeMairaSpeech({ text: 'hello world test', female: true });
  check('different voice fetches again', fetchCalls - before, 1);
  check('audio is Sulafat, not Charon', uniqa.audioBase64, 'b64:Sulafat:hello world test');
}

console.log('\n── 6) Dead key skipped on the next new-text call ─────────────');
{
  const before = fetchCalls;
  const logBefore = fetchLog.length;
  const next = await synthesizeMairaSpeech({ text: 'a brand new sentence', female: false });
  check('new text fetches only the live key', fetchCalls - before, 1);
  check('dead key never probed in this call', fetchLog.slice(logBefore).some((l) => l === 'key:ONE'), false);
  check('new audio synthesised', next.audioBase64, 'b64:Charon:a brand new sentence');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
