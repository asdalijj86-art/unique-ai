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
 *      on the device), the chunk is NOT dropped yet — see step 2b;
 *   2b. NO-DROP EXTENDED RETRY (2026-10-26, user-confirmed spontaneous
 *      stop): the 2026-10-26 live test proved the old rule wrong on
 *      this device — the banner «جواب کا کچھ حصہ آواز میں نہیں سنایا
 *      جا سکا» appeared with NO tap, NO new speech, NO chat switch,
 *      so the chunk was not interrupted, it was DROPPED: its server
 *      chain failed transiently and the browser rescue could not
 *      speak it (Chromebook's strict gender picker finds no
 *      qualifying voice, so the rescue is unavailable there — a
 *      transient server failure became a skipped chunk). A chunk
 *      whose browser rescue fails now re-runs the FULL server chain
 *      (with growing waits, so Edge throttling / a rate window can
 *      clear) and re-tries the browser voice after each pass, IN
 *      ORDER, before it is ever counted as dropped. The caller is
 *      told while this wait runs (onChunkWaiting) so the pause never
 *      reads as a stop, and told when it ends (onChunkWaitingEnd).
 *      Only after every extended pass fails is the chunk counted as
 *      dropped and the caller surfaces a visible notice — it must
 *      never vanish silently (2026-10-25 Uniqa hardening: a reply
 *      heard only up to its first line, with the rest silent, is
 *      exactly this case);
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
  /** Extended passes after a browser rescue fails, before a chunk is
   *  ever counted as dropped (default 2: 9 server attempts in total).
   *  Each pass re-runs the full resilient synthesis, then re-tries
   *  the browser voice (its voice list may have loaded by then). */
  extendedRetryPasses?: number;
  /** Waits before each extended pass (default [3000, 10000]); the
   *  growing gap lets transient throttling / a rate window clear.
   *  Waits are sliced into 250ms steps so a stop still lands fast. */
  extendedRetryDelaysMs?: number[];
  /** Called when a chunk enters extended retry (caller shows a
   *  "voice is being rebuilt, please wait" notice, never silence). */
  onChunkWaiting?: (text: string) => void;
  /** Called when a chunk's extended retry ends, recovered or not
   *  (caller clears the waiting notice; a truly dropped chunk is
   *  still reported by the caller from the returned `dropped`). */
  onChunkWaitingEnd?: () => void;
}

/**
 * Speak every chunk in order, with next-chunk prefetch. Returns
 * `stopped: true` when a stop/barge-in cut the queue short — in that
 * case the prefetched chunk (if any) was NEVER played or spoken.
 * `spokeAny` tells the caller whether the reply sounded at all (it
 * drives the standing whole-reply browser fallback + mic resumes).
 * `dropped` counts chunks that sounded in NEITHER form AFTER the
 * extended retry: server chain failed every pass and the browser
 * rescue could not speak them. A stopped queue never counts its
 * unplayed tail as dropped — the user stopped it.
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
  // Extended-retry waits, sliced so a stop during a long wait still
  // lands within ~250ms instead of after the whole delay.
  const waitInterruptible = async (ms: number): Promise<void> => {
    const wait = deps.wait ?? realWait;
    let remaining = ms;
    while (remaining > 0 && !deps.isStale()) {
      const step = Math.min(250, remaining);
      await wait(step);
      remaining -= step;
    }
  };
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
      // for one chunk's failure. If the rescue cannot speak, that is
      // NOT yet a drop (2026-10-26 no-drop rule): on a device with
      // no qualifying browser voice, a transient server failure
      // would otherwise skip the chunk for good. Re-run the full
      // server chain (with growing waits) and re-try the browser
      // voice after each pass, IN ORDER. A stop that lands anywhere
      // in this sequence is NOT a drop. Only after every pass fails
      // is the chunk counted as dropped, so the caller surfaces a
      // notice for a truly un speakable chunk — never for a chunk
      // that a few more seconds would have saved.
      const ok = await deps.speakBrowserChunk(chunks[i]);
      if (deps.isStale()) return { spokeAny, stopped: true, dropped };
      if (ok) {
        spokeAny = true;
      } else {
        const passes = deps.extendedRetryPasses ?? 2;
        const delays = deps.extendedRetryDelaysMs ?? [3000, 10000];
        let recovered = false;
        for (let pass = 0; pass < passes && !recovered; pass++) {
          if (deps.isStale()) return { spokeAny, stopped: true, dropped };
          deps.onChunkWaiting?.(chunks[i]);
          await waitInterruptible(delays[pass] ?? delays[delays.length - 1] ?? 3000);
          if (deps.isStale()) { deps.onChunkWaitingEnd?.(); return { spokeAny, stopped: true, dropped }; }
          const retry = await synthesizeChunkResilient(chunks[i], deps);
          if (deps.isStale() || retry.kind === 'stale') {
            deps.onChunkWaitingEnd?.();
            return { spokeAny, stopped: true, dropped };
          }
          if (retry.kind === 'audio') {
            spokeAny = true;
            recovered = true;
            deps.onChunkWaitingEnd?.();
            await deps.playAudio(retry.audio);
          } else {
            const okRetry = await deps.speakBrowserChunk(chunks[i]);
            if (deps.isStale()) { deps.onChunkWaitingEnd?.(); return { spokeAny, stopped: true, dropped }; }
            if (okRetry) {
              spokeAny = true;
              recovered = true;
              deps.onChunkWaitingEnd?.();
            }
          }
        }
        if (!recovered) {
          deps.onChunkWaitingEnd?.();
          dropped += 1;
        }
      }
    }
    if (deps.isStale()) return { spokeAny, stopped: true, dropped };
  }
  return { spokeAny, stopped: false, dropped };
}
