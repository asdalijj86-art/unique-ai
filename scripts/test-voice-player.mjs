/**
 * test-voice-player.mjs — voice orchestration rebuild (2026-10-26,
 * user-approved: "rebuild, same voices").
 *
 * Drives the REAL client/src/lib/voice-player.ts (which itself uses
 * lib/tts-chunks.ts) with STUBBED legs/playback, proving the terminal
 * outcome is never silence:
 *  1. short single-chunk reply, head leg fails, no browser voice
 *     -> terminal `failed` with a reason, never silence;
 *  2. long reply, all legs fail, Chromebook voice list (browser
 *     stubs false) -> one terminal `failed`, not a tooltip X
 *     (the outcome itself is the banner payload);
 *  3. synthesis succeeds but play() rejects -> NOT counted as
 *     spoken: browser chunk attempted, then whole fallback, then
 *     `failed` if both fail (and `spoken` if the browser chunk
 *     rescues it);
 *  4. eager audio rejected -> not counted as spoken; head is
 *     rescued through the queue and the rest still attempted;
 *  5. user stop mid-reply -> terminal `stopped` (caller shows a
 *     labelled banner only if `heard` is true) and no `failed`;
 *  6. identical text re-sent after a failure -> spoken (the 8s
 *     guard suppresses only HEARD texts);
 *  7. duplicate of a HEARD text within 8s -> `duplicate-heard`,
 *     synthesis never called;
 *  8. simulated evening legs (Gemini quota + Edge 502 + client Edge
 *     403, modelled as an always-failing chain + fail-fast skip) ->
 *     fast terminal `failed`, no extended-waiting notice burned;
 *  9. partial: some chunks heard, one dropped -> `partial`;
 * 10. whole-browser fallback: queue hears nothing, whole browser
 *     voice speaks -> `spoken`, dropped cleared.
 *
 * Run: node scripts/test-voice-player.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'voiceplayer-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/voice-player.ts'))};`);
const bundled = join(outDir, 'voice-player-lib.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const { runVoiceReply, splitReplyIntoChunks, isDuplicateHeard } = await import(pathToFileURL(bundled).href);

let passed = 0;
let failed = 0;
function check(label, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(want)}`); }
}

const audio = (text) => ({ audioBase64: `b64:${text}`, mimeType: 'audio/mpeg' });
const instantWait = async () => {};
const base = (over) => ({
  synthesize: async () => null,
  playAudio: async () => true,
  speakBrowserChunk: async () => false,
  speakBrowserWhole: async () => false,
  isStale: () => false,
  shouldSkipExtendedRetry: () => true,
  wasPlaybackBlocked: () => false,
  failureDetail: () => 'network',
  wait: instantWait,
  ...over,
});
const input = (over) => ({
  text: 'یہ ایک مختصر جواب ہے۔',
  config: { persona: 'uniqa', female: true },
  prefetch: null,
  lastHeard: null,
  now: 100000,
  voiceEnabled: true,
  ...over,
});

console.log('\n── 1) Short single-chunk reply, head fails, no browser voice ──');
{
  const res = await runVoiceReply(input(), base());
  check('terminal is failed, not silence', res.terminal, 'failed');
  check('nothing heard, reason present', [res.heard, res.failureReason.length > 0], [false, true]);
  check('dropped counted', res.dropped, 1);
}

console.log('\n── 2) Long reply, all legs fail, no browser voice ───────────');
{
  const long = 'پہلا جملہ یہ ہے۔ دوسرا جملہ یہ ہے۔ تیسرا جملہ یہ ہے۔ چوتھا جملہ یہ ہے۔';
  const res = await runVoiceReply(input({ text: long }), base());
  check('terminal is failed', res.terminal, 'failed');
  check('nothing heard', res.heard, false);
  check('total chunks cover the reply', res.totalChunks, splitReplyIntoChunks(long).length);
}

console.log('\n── 3) Synthesis ok but play() rejects -> not spoken ─────────');
{
  const calls = { browserChunk: 0, whole: 0 };
  const res = await runVoiceReply(input(), base({
    synthesize: async (t) => audio(t),
    playAudio: async () => false,
    speakBrowserChunk: async () => { calls.browserChunk++; return false; },
    speakBrowserWhole: async () => { calls.whole++; return false; },
  }));
  check('terminal is failed', res.terminal, 'failed');
  check('browser chunk rescue attempted', calls.browserChunk, 1);
  check('whole browser fallback attempted', calls.whole, 1);
  const res2 = await runVoiceReply(input(), base({
    synthesize: async (t) => audio(t),
    playAudio: async () => false,
    speakBrowserChunk: async () => true,
  }));
  check('browser chunk rescue makes it spoken', res2.terminal, 'spoken');
}

console.log('\n── 4) Eager audio rejected -> head rescued, rest attempted ──');
{
  const played = [];
  const headText = 'پہلا لمبا جملہ یہ ہے کہ آواز چل رہی ہے۔';
  const res = await runVoiceReply(input({
    text: `${headText} دوسرا لمبا جملہ یہ ہے کہ باقی بھی چلے گا۔`,
    prefetch: {
      text: headText,
      promise: Promise.resolve(audio(headText)),
      eagerPlayed: true,
      playPromise: Promise.resolve({ heard: false, blocked: true }),
    },
  }), base({
    synthesize: async (t) => audio(t),
    playAudio: async (a) => { played.push(a.audioBase64); return true; },
  }));
  check('terminal is spoken', res.terminal, 'spoken');
  check('head was re-played through the queue', played.includes(`b64:${headText}`), true);
}

console.log('\n── 5) User stop mid-reply -> stopped, never failed ──────────');
{
  let stale = false;
  const res = await runVoiceReply(input({
    text: 'پہلا جملہ یہ ہے۔ دوسرا جملہ یہ ہے۔ تیسرا جملہ یہ ہے۔',
  }), base({
    synthesize: async (t) => audio(t),
    playAudio: async () => { stale = true; return true; },
    isStale: () => stale,
  }));
  check('terminal is stopped', res.terminal, 'stopped');
  check('first chunk was heard before the stop', res.heard, true);
}

console.log('\n── 6) Identical text after a FAILURE speaks again ───────────');
{
  let firstRun = true;
  const deps = base({
    // First whole run: every synthesis attempt fails (the queue's
    // resilient retries must not rescue it). Second run: it works.
    synthesize: async (t) => (firstRun ? null : audio(t)),
    speakBrowserChunk: async () => false,
  });
  const first = await runVoiceReply(input(), deps);
  check('first attempt failed', first.terminal, 'failed');
  firstRun = false;
  // Caller records heard ONLY on heard outcomes, so lastHeard stays null.
  const second = await runVoiceReply(input(), deps);
  check('identical failed text is replayable', second.terminal, 'spoken');
}

console.log('\n── 7) Duplicate of a HEARD text within 8s is suppressed ────');
{
  let calls = 0;
  const res = await runVoiceReply(input({
    lastHeard: { text: 'یہ ایک مختصر جواب ہے۔', at: 99900 },
    now: 100000,
  }), base({ synthesize: async (t) => { calls++; return audio(t); } }));
  check('terminal is duplicate-heard', res.terminal, 'duplicate-heard');
  check('synthesis never called for the duplicate', calls, 0);
  check('duplicate-heard helper agrees', isDuplicateHeard({ text: 'x', at: 100 }, 'x', 200), true);
  check('old heard text is not a duplicate', isDuplicateHeard({ text: 'x', at: 100 }, 'x', 20000), false);
}

console.log('\n── 8) Evening legs (all dead + fail-fast) -> fast failure ───');
{
  let waiting = 0;
  const res = await runVoiceReply(input(), base({
    onChunkWaiting: () => { waiting++; },
    failureDetail: () => 'quota',
  }));
  check('terminal is failed', res.terminal, 'failed');
  check('no extended waiting notice burned (fail-fast)', waiting, 0);
  check('quota reason in plain words', res.failureReason.includes('حد'), true);
}

console.log('\n── 9) Partial: some heard, one dropped ──────────────────────');
{
  const res = await runVoiceReply(input({
    text: 'اچھا جملہ۔ خراب جملہ۔ اچھا جملہ دو۔',
  }), base({
    synthesize: async (t) => (t.includes('خراب') ? null : audio(t)),
    speakBrowserChunk: async (t) => false,
  }));
  // Note: chunking groups sentences into ~700-char chunks, so the
  // three sentences form ONE chunk here; force multi-chunk by using
  // the split helper's result as separate queue inputs via a long text.
  // For this stub the whole reply is one chunk, so a failing chunk
  // with no browser voice is `failed`, not `partial` — assert that.
  check('single failing chunk -> failed (not silent partial)', res.terminal, 'failed');
  // True partial: first chunk plays, second chunk's chain + browser fail.
  const long1 = 'ا'.repeat(650) + '۔';
  const long2 = 'ب'.repeat(650) + '۔';
  const res2 = await runVoiceReply(input({ text: `${long1} ${long2}` }), base({
    synthesize: async (t) => (t.includes('ب') ? null : audio(t)),
    speakBrowserChunk: async () => false,
  }));
  check('partial terminal when one chunk drops', res2.terminal, 'partial');
  check('partial still heard something', res2.heard, true);
  check('partial dropped count', res2.dropped, 1);
}

console.log('\n── 10) Whole-browser fallback rescues a silent queue ───────');
{
  const res = await runVoiceReply(input(), base({
    speakBrowserWhole: async () => true,
  }));
  check('terminal is spoken via whole browser voice', res.terminal, 'spoken');
  check('dropped cleared after whole voice speaks', res.dropped, 0);
}

console.log(`\nvoice-player: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
