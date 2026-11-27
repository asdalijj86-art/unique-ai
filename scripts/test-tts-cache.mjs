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
 *  3. the dead-key tracker still skips + re-probes on its own
 *     clock (pure unit pin — the live path no longer rotates keys;
 *     the backup is server-side now, see 5);
 *  4. cache caps: entry cap and byte cap evict oldest first;
 *  5. quota on the first attempt retries ONCE with useBackup and
 *     returns the backup audio — and NO key material ever travels
 *     in a request body (2026-11-25 security build + 2026-11-28
 *     secure backup).
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
// The client stores NO keys (2026-11-25 security build): the store
// stub exists only because secureAppStorage reads the voice name
// from it. No key is ever written here.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

let fetchCalls = 0;
const fetchLog = [];
let quotaUsed = false;
globalThis.fetch = async (url, opts) => {
  fetchCalls++;
  const body = JSON.parse(opts?.body || '{}');
  // Log the SHAPE of each call: 'backup' when the client retries
  // with useBackup, 'plain' for a normal first attempt, 'KEY-LEAK'
  // if any key material ever travels in a body (must never happen).
  fetchLog.push(body.userApiKey ? 'KEY-LEAK' : body.useBackup ? 'backup' : 'plain');
  if (url === '/api/openai/speech') {
    // The account key is quota-dead exactly ONCE (the night case);
    // every later attempt — including the backup retry — succeeds.
    if (!quotaUsed) {
      quotaUsed = true;
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
  const logBefore = fetchLog.length;
  const first = await synthesizeMairaSpeech({ text: 'hello world test', female: false });
  const afterFirst = fetchCalls;
  check('first call fetches (quota + backup)', afterFirst - before, 2);
  check('first attempt plain, retry is the backup', fetchLog.slice(logBefore), ['plain', 'backup']);
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

console.log('\n── 6) New text: one healthy call, no key material ────────────');
{
  const before = fetchCalls;
  const logBefore = fetchLog.length;
  const next = await synthesizeMairaSpeech({ text: 'a brand new sentence', female: false });
  check('new text fetches once', fetchCalls - before, 1);
  check('healthy first attempt needs no backup flag', fetchLog.slice(logBefore), ['plain']);
  check('new audio synthesised', next.audioBase64, 'b64:Charon:a brand new sentence');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
