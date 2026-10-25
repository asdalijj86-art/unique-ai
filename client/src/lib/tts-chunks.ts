/**
 * Per-chunk TTS resilience (dropout hardening, 2026-10-23).
 *
 * The user's on-device report: both voices are beautiful, but «کبھی
 * کبھی تھوڑی missing ہو جاتی ہے» — a chunk of a reply sometimes never
 * sounds. Root cause: the Edge leg fails INTERMITTENTLY (live probes
 * saw 502s between 200s), and the old chunk loops treated a failed
 * chunk as either silently skipped (streaming path) or fatal to the
 * whole rest of the reply (fallback path's `break`). Either way words
 * the user was owed simply vanished.
 *
 * This module is the orchestration that makes a lost chunk impossible
 * by construction:
 *   1. every chunk's synthesis is RETRIED TWICE before giving up on
 *      the server chain (650ms, then 2000ms — the Edge leg's 502s are
 *      transient throttling, and a later attempt often succeeds where
 *      the first retry still hit the throttle; the user's 2026-10-24
 *      report of half-heard replies on his phone is exactly a chunk
 *      whose chain failed twice and whose device has no male browser
 *      voice to rescue it);
 *   2. a chunk whose chain still fails falls to the BROWSER VOICE for
 *      THAT CHUNK ALONE (the caller supplies the persona-locked browser
 *      speaker) — never aborting later chunks. If that browser rescue
 *      also cannot speak (no qualifying voice of this persona's gender
 *      on the device), the chunk IS counted as dropped and the caller
 *      must surface a visible notice — it must never vanish silently
 *      (2026-10-25 Uniqa hardening: a reply heard only up to its first
 *      line, with the rest silent, is exactly this case);
 *   3. the NEXT chunk's synthesis starts while the current chunk plays
 *      (prefetch), so inter-chunk gaps disappear;
 *   4. a stop/barge-in (isStale) abandons everything instantly: the
 *      prefetched, not-yet-played chunk is discarded unheard.
 *
 * Pure + dependency-injected (no window, no React) so the REAL code is
 * headlessly testable — scripts/test-tts-chunks.mjs drives it with
 * stubbed legs, the same standard as lib/persona / lib/office-handoff.
 */

export type TtsAudio = { audioBase64: string; mimeType: string };

export type ChunkOutcome =
  | { kind: 'audio'; audio: TtsAudio }
  /** Server chain failed even after two retries — the caller speaks this
   *  chunk with the persona's browser voice instead. */
  | { kind: 'browser' }
  /** Interrupted (ticket superseded) — stay silent. */
  | { kind: 'stale' };

export interface ChunkSynthDeps {
  /** One full pass of the persona's voice chain for a chunk. Resolves
   *  null when every leg failed (the chain itself has already surfaced
   *  the classified on-screen reason, as it always did). */
  synthesize: (text: string) => Promise<TtsAudio | null>;
  /** True once the speech that owns these chunks has been interrupted
   *  or superseded — nothing further may be synthesized or played. */
  isStale: () => boolean;
  /** Injectable for tests; defaults to a real timer. */
  wait?: (ms: number) => Promise<void>;
  /** Pause before the chunk's first retry (default 650ms). */
  retryDelayMs?: number;
  /** Pause before the chunk's second retry (default 2000ms) — the
   *  longer gap lets transient Edge throttling clear. */
  secondRetryDelayMs?: number;
}

const realWait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Synthesize ONE chunk with resilience: chain → (stale? stop) → brief
 * pause → chain once more → (stale? stop) → longer pause → chain a
 * third time → browser-voice verdict. Never rejects.
 */
export async function synthesizeChunkResilient(
  text: string,
  deps: ChunkSynthDeps,
): Promise<ChunkOutcome> {
  const wait = deps.wait ?? realWait;
  const first = await deps.synthesize(text).catch(() => null);
  if (first) return { kind: 'audio', audio: first };
  if (deps.isStale()) return { kind: 'stale' };
  await wait(deps.retryDelayMs ?? 650);
  if (deps.isStale()) return { kind: 'stale' };
  const second = await deps.synthesize(text).catch(() => null);
  if (second) return { kind: 'audio', audio: second };
  if (deps.isStale()) return { kind: 'stale' };
  await wait(deps.secondRetryDelayMs ?? 2000);
  if (deps.isStale()) return { kind: 'stale' };
  const third = await deps.synthesize(text).catch(() => null);
  if (third) return { kind: 'audio', audio: third };
  if (deps.isStale()) return { kind: 'stale' };
  return { kind: 'browser' };
}

export interface SpeakQueueDeps extends ChunkSynthDeps {
  /** Play one synthesized chunk; resolves when playback ends/fails.
   *  The implementation must refuse to START when the speech ticket
   *  is stale (chat.tsx's playAudioChunk already does). */
  playAudio: (audio: TtsAudio) => Promise<void>;
  /** Speak ONE chunk with the persona-locked browser voice; resolves
   *  true if any of it sounded, false when no qualifying voice exists
   *  on the device (the implementation surfaces the notice) or the
   *  chunk was interrupted mid-speech. */
  speakBrowserChunk: (text: string) => Promise<boolean>;
}

/**
 * Speak every chunk in order, with next-chunk prefetch. Returns
 * `stopped: true` when a stop/barge-in cut the queue short — in that
 * case the prefetched chunk (if any) was NEVER played or spoken.
 * `spokeAny` tells the caller whether the reply sounded at all (it
 * drives the standing whole-reply browser fallback + mic resumes).
 * `dropped` counts chunks that sounded in NEITHER form: server chain
 * failed and the browser rescue could not speak them. A stopped queue
 * never counts its unplayed tail as dropped — the user stopped it.
 */
export async function speakChunksInOrder(
  chunks: readonly string[],
  deps: SpeakQueueDeps,
): Promise<{ spokeAny: boolean; stopped: boolean; dropped: number }> {
  let spokeAny = false;
  let dropped = 0;
  const outcomes: (Promise<ChunkOutcome> | null)[] = chunks.map(() => null);
  const startOutcome = (idx: number): void => {
    if (idx >= 0 && idx < chunks.length && !outcomes[idx]) {
      // synthesizeChunkResilient never rejects, so an abandoned
      // prefetch promise can never surface as an unhandled rejection.
      outcomes[idx] = synthesizeChunkResilient(chunks[idx], deps);
    }
  };
  // Chunk 0 starts now; chunk 1 prefetches alongside it, and each
  // playing chunk starts the next one's synthesis — synthesis overlaps
  // playback instead of serializing after it (the old inter-chunk gap).
  startOutcome(0);
  startOutcome(1);
  for (let i = 0; i < chunks.length; i++) {
    if (deps.isStale()) return { spokeAny, stopped: true, dropped };
    const outcome = await outcomes[i]!;
    if (deps.isStale() || outcome.kind === 'stale') {
      return { spokeAny, stopped: true, dropped };
    }
    // While chunk i plays, chunk i+1 must already be synthesizing.
    startOutcome(i + 1);
    if (outcome.kind === 'audio') {
      spokeAny = true;
      await deps.playAudio(outcome.audio);
    } else {
      // kind === 'browser': rescue THIS chunk with the browser voice;
      // the queue then moves on — later chunks are never sacrificed
      // for one chunk's failure. If the rescue cannot speak, count
      // the chunk as dropped so the caller surfaces a notice; a
      // stop that lands mid-rescue is NOT a drop.
      const ok = await deps.speakBrowserChunk(chunks[i]);
      if (deps.isStale()) return { spokeAny, stopped: true, dropped };
      if (ok) spokeAny = true;
      else dropped += 1;
    }
    if (deps.isStale()) return { spokeAny, stopped: true, dropped };
  }
  return { spokeAny, stopped: false, dropped };
}
