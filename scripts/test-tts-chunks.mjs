/**
 * test-tts-chunks.mjs — TTS dropout hardening (2026-10-23): the REAL
 * chunk-resilience orchestration (client/src/lib/tts-chunks.ts, used
 * by chat.tsx's playAssistantMessage) driven with STUBBED voice legs.
 *
 * The user's report: «کبھی کبھی تھوڑی missing ہو جاتی ہے» — chunks of a
 * reply sometimes never sounded, because the Edge leg fails
 * intermittently (live probes: 502s between 200s) and the old loops
 * skipped or aborted on a failed chunk. This suite proves:
 *  1. a chunk that fails ONCE is retried and spoken by the server
 *     voice — order and text intact;
 *  2. a chunk whose chain is dead is spoken by the BROWSER voice for
 *     THAT chunk alone — later chunks keep the server voice, and NO
 *     chunk's words are lost;
 *  3. an ALWAYS-failing leg surfaces the chain's notice (the stub
 *     models synthesizeWithTimeout's setError-on-total-failure) and
 *     every chunk is still heard via the browser voice — notice,
 *     never silence;
 *  4. PREFETCH: the next chunk's synthesis starts while the current
 *     chunk is still playing;
 *  5. STOP during playback orphans the prefetched chunk — its audio
 *     is never played, its text never browser-spoken;
 *  6. STOP during synthesis / during the retry wait silences the
 *     queue at once (no retry fires after a stop).
 *
 * Run: node scripts/test-tts-chunks.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'ttschunks-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/tts-chunks.ts'))};`);
const bundled = join(outDir, 'tts-chunks-lib.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const { synthesizeChunkResilient, speakChunksInOrder } = await import(pathToFileURL(bundled).href);

let passed = 0;
let failed = 0;
function check(label, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(want)}`); }
}

const audio = (text) => ({ audioBase64: `b64:${text}`, mimeType: 'audio/mpeg' });
const instantWait = async () => {};
const tick = () => new Promise((r) => setTimeout(r, 0));

// A stub voice chain: plan maps chunk text → array of outcomes per
// attempt (true = audio, false = failure). Records every call and —
// exactly like the real synthesizeWithTimeout — flags that the
// classified on-screen notice was surfaced whenever it returns null.
function stubChain(plan) {
  const calls = [];
  const state = { noticeShown: false };
  const attempts = new Map();
  const synthesize = async (text) => {
    calls.push(text);
    const n = (attempts.get(text) || 0) + 1;
    attempts.set(text, n);
    const seq = plan[text] || [true];
    const ok = seq[Math.min(n - 1, seq.length - 1)];
    if (!ok) state.noticeShown = true;
    return ok ? audio(text) : null;
  };
  return { synthesize, calls, state, attempts };
}

function stubPlayer() {
  const played = [];
  return { played, playAudio: async (a) => { played.push(a.audioBase64); } };
}

function stubBrowser() {
  const spoken = [];
  return { spoken, speakBrowserChunk: async (t) => { spoken.push(t); return true; } };
}

console.log('\n── 1) One transient failure → retry rescues the chunk ─────');
{
  const chain = stubChain({ A: [true], B: [false, true], C: [true] });
  const player = stubPlayer();
  const browser = stubBrowser();
  const res = await speakChunksInOrder(['A', 'B', 'C'], {
    synthesize: chain.synthesize, isStale: () => false, wait: instantWait,
    playAudio: player.playAudio, speakBrowserChunk: browser.speakBrowserChunk,
  });
  check('all chunks played via server voice, in order', player.played, ['b64:A', 'b64:B', 'b64:C']);
  check('failed chunk was retried exactly once', chain.attempts.get('B'), 2);
  check('browser voice never needed', browser.spoken, []);
  check('queue completed, spoke', [res.stopped, res.spokeAny], [false, true]);
}

console.log('\n── 2) Dead chain for one chunk → browser speaks THAT chunk only ──');
{
  const chain = stubChain({ A: [true], B: [false], C: [true] }); // B fails every attempt
  const player = stubPlayer();
  const browser = stubBrowser();
  const res = await speakChunksInOrder(['A', 'B', 'C'], {
    synthesize: chain.synthesize, isStale: () => false, wait: instantWait,
    playAudio: player.playAudio, speakBrowserChunk: browser.speakBrowserChunk,
  });
  check('healthy chunks keep the server voice', player.played, ['b64:A', 'b64:C']);
  check('ONLY the failed chunk fell to the browser voice', browser.spoken, ['B']);
  check('no words lost: every chunk sounded exactly once',
    [...player.played.map((p) => p.slice(4)), ...browser.spoken].sort(), ['A', 'B', 'C']);
  check('queue completed, spoke', [res.stopped, res.spokeAny], [false, true]);
}

console.log('\n── 3) Always-failing leg → notice shown, chunks still heard ──');
{
  const chain = stubChain({ A: [false], B: [false] });
  const player = stubPlayer();
  const browser = stubBrowser();
  const res = await speakChunksInOrder(['A', 'B'], {
    synthesize: chain.synthesize, isStale: () => false, wait: instantWait,
    playAudio: player.playAudio, speakBrowserChunk: browser.speakBrowserChunk,
  });
  check('the chain surfaced its notice (not silent failure)', chain.state.noticeShown, true);
  check('every chunk still heard — via the browser voice', browser.spoken, ['A', 'B']);
  check('no server audio played', player.played, []);
  check('each chunk got its retry before falling back', [chain.attempts.get('A'), chain.attempts.get('B')], [2, 2]);
  check('queue completed, spoke', [res.stopped, res.spokeAny], [false, true]);
}

console.log('\n── 4) Prefetch: next chunk synthesizes while current plays ──');
{
  const synthStarts = [];
  let releaseA;
  const playA = new Promise((r) => { releaseA = r; });
  const queue = speakChunksInOrder(['A', 'B'], {
    synthesize: async (t) => { synthStarts.push(t); return audio(t); },
    isStale: () => false, wait: instantWait,
    playAudio: async (a) => { if (a.audioBase64 === 'b64:A') await playA; },
    speakBrowserChunk: async () => true,
  });
  await tick(); await tick();
  check('B synthesis started while A still playing', synthStarts, ['A', 'B']);
  releaseA();
  const res = await queue;
  check('queue then completed normally', [res.stopped, res.spokeAny], [false, true]);
}

console.log('\n── 5) Stop during playback → prefetched chunk NEVER plays ──');
{
  let stale = false;
  let releaseA;
  const playA = new Promise((r) => { releaseA = r; });
  const played = [];
  const browser = stubBrowser();
  const queue = speakChunksInOrder(['A', 'B', 'C'], {
    synthesize: async (t) => audio(t), // B and C prefetch-resolve instantly
    isStale: () => stale, wait: instantWait,
    playAudio: async (a) => { played.push(a.audioBase64); if (a.audioBase64 === 'b64:A') await playA; },
    speakBrowserChunk: browser.speakBrowserChunk,
  });
  await tick(); await tick();
  stale = true; // barge-in: the speech ticket is bumped mid-playback
  releaseA();
  const res = await queue;
  check('only the already-playing chunk sounded', played, ['b64:A']);
  check('prefetched chunks never browser-spoken either', browser.spoken, []);
  check('queue reports the stop', [res.stopped, res.spokeAny], [true, true]);
}

console.log('\n── 6) Stop during synthesis / retry wait → instant silence ──');
{
  let stale = false;
  let releaseSynth;
  const synthGate = new Promise((r) => { releaseSynth = r; });
  const played = [];
  const queue = speakChunksInOrder(['A', 'B'], {
    synthesize: async (t) => { if (t === 'A') await synthGate; return audio(t); },
    isStale: () => stale, wait: instantWait,
    playAudio: async (a) => { played.push(a.audioBase64); },
    speakBrowserChunk: async () => true,
  });
  await tick();
  stale = true;
  releaseSynth();
  const res = await queue;
  check('nothing played after a stop during synthesis', played, []);
  check('queue reports the stop, nothing spoke', [res.stopped, res.spokeAny], [true, false]);

  // Stale lands during the retry wait → the retry never fires.
  let calls = 0;
  let stale2 = false;
  const outcome = await synthesizeChunkResilient('X', {
    synthesize: async () => { calls++; return null; },
    isStale: () => stale2,
    wait: async () => { stale2 = true; },
  });
  check('stop during retry wait → stale outcome', outcome.kind, 'stale');
  check('the retry never fired after the stop', calls, 1);
}

console.log('\n── 7) synthesizeChunkResilient units ──────────────────────');
{
  let calls = 0;
  const ok1 = await synthesizeChunkResilient('X', {
    synthesize: async () => { calls++; return audio('X'); },
    isStale: () => false, wait: instantWait,
  });
  check('first-attempt success → audio, one call', [ok1.kind, calls], ['audio', 1]);

  calls = 0;
  const ok2 = await synthesizeChunkResilient('X', {
    synthesize: async () => { calls++; return calls === 1 ? null : audio('X'); },
    isStale: () => false, wait: instantWait,
  });
  check('fail → retry → audio, two calls', [ok2.kind, calls], ['audio', 2]);

  const dead = await synthesizeChunkResilient('X', {
    synthesize: async () => null, isStale: () => false, wait: instantWait,
  });
  check('fail → retry → fail → browser verdict', dead.kind, 'browser');

  const staleFirst = await synthesizeChunkResilient('X', {
    synthesize: async () => null, isStale: () => true, wait: instantWait,
  });
  check('already stale after first failure → stale, no wait burned', staleFirst.kind, 'stale');
}

console.log(`\n${failed === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
