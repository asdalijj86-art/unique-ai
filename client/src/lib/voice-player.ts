/**
 * Voice player — the ONE orchestration for every spoken reply
 * (2026-10-26 rebuild, user-approved: "rebuild, same voices").
 *
 * Why this module exists: the 2026-10-26 audit proved the old
 * chat.tsx voice code had FOUR speaking paths, TWO error channels,
 * and treated "synthesis succeeded" as "the user heard it". A
 * short reply whose head chunk failed, or a reply whose every leg
 * failed, could end with zero sound and zero readable message:
 * the failure lived only in a tiny top-bar X tooltip, and the
 * prefetch path's terminal branches required `restChunks.length > 0`
 * or `restSpokeAny` to show anything at all.
 *
 * This module fixes the orchestration, NOT the voices:
 *  - Voices, leg order and strict pickers are UNCHANGED. The caller
 *    supplies `synthesize` (the persona's existing chain: Unique =
 *    Gemini Charon/Fenrir + Edge Salman; Uniqa = Gemini Sulafat +
 *    Edge Uzma) and the persona-locked browser speakers. This file
 *    never names a voice, never picks a browser voice, never calls
 *    /api/tts/google, and never touches keys or the server prompt.
 *  - No concurrent chunks, no session-long mute, no speculative
 *    speech on half-spoken words: eager playback is first-SENTENCE
 *    only, exactly as before.
 *  - One state machine per reply:
 *      idle -> synthesising -> playing
 *        -> done-spoken | done-partial | done-failed | stopped
 *    and EXACTLY ONE terminal outcome, computed from the WHOLE
 *    reply (head + rest) with no length gate:
 *      - `spoken`: every chunk was heard (server or browser voice).
 *      - `partial`: some chunks heard, some dropped — the user heard
 *        part of the reply and must see which part is missing.
 *      - `failed`: nothing was heard in any form. Never silent:
 *        the caller MUST render this in the readable banner channel
 *        (speechNotice) with a plain-words reason and a Replay offer.
 *      - `stopped`: the user (or a newer reply) stopped it. The
 *        caller shows a labelled stop banner ONLY if audio had
 *        actually started; a stop before any sound shows nothing.
 *      - `duplicate-heard`: identical text already heard within 8s.
 *        Only a successfully HEARD text suppresses a repeat — a
 *        failed text is always replayable (see isDuplicateHeard).
 *  - Playback-verified: `heard` means audio actually started
 *    playing (onplaying / browser-voice onstart), never merely
 *    synthesised. A play() rejection or pre-play audio error counts
 *    as NOT heard and triggers the next fallback (the queue in
 *    lib/tts-chunks implements the same contract).
 *
 * Pure + dependency-injected (no window, no React) so the REAL
 * orchestration is headlessly testable — scripts/test-voice-player.mjs
 * drives it with stubbed legs, the same standard as lib/tts-chunks.
 */

import { speakChunksInOrder, type TtsAudio } from './tts-chunks';

export type VoicePersona = 'unique' | 'uniqa';

/** Fixed for the whole reply (captured at send / persona-switch
 *  time by the caller) — never re-picked per chunk from a device
 *  voice list. This is the session VoiceConfig the big-AI pattern
 *  uses: one identity per persona per reply. */
export interface VoiceConfig {
  persona: VoicePersona;
  /** true = Uniqa (female chain), false = Unique (male chain). */
  female: boolean;
}

export type VoiceTerminal =
  | 'spoken'
  | 'partial'
  | 'failed'
  | 'stopped'
  | 'duplicate-heard'
  | 'voice-off';

export interface VoiceOutcome {
  terminal: VoiceTerminal;
  /** True only if at least one chunk was actually heard. */
  heard: boolean;
  /** Chunks dropped after every fallback (server + browser). */
  dropped: number;
  /** Total chunks the reply was split into (head + rest). */
  totalChunks: number;
  /** Plain-words reason for a `failed` outcome (leg errorType
   *  mapped by the caller, or a generic sentence). Empty otherwise. */
  failureReason: string;
}

/** A record of a successfully HEARD reply, for duplicate suppression. */
export interface HeardRecord {
  text: string;
  at: number;
}

export const DUPLICATE_WINDOW_MS = 8000;

/** Only a HEARD text suppresses a repeat within 8s. A failed text
 *  is never recorded as heard by the caller, so it stays replayable
 *  — the old code recorded the text BEFORE playback succeeded, which
 *  poisoned an identical retry (including the message "سنیں" button). */
export function isDuplicateHeard(
  last: HeardRecord | null,
  text: string,
  now: number,
): boolean {
  return !!(last && last.text === text && now - last.at < DUPLICATE_WINDOW_MS);
}

/** Split a full reply into sentence groups of ~700 chars — the same
 *  chunking the old fallback path used, so no reply is truncated. */
export function splitReplyIntoChunks(text: string): string[] {
  const sentences = text.match(/[^۔.!?\n]+[۔.!?\n]*/g) || [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > 700 && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** First speakable sentence (≥20 chars + boundary, or ≥120 chars
 *  fallback) — the eager-prefetch unit, unchanged from chat.tsx. */
export function extractFirstSentence(text: string): string {
  const match = text.match(/^(.{20,}?[۔.!?\n])/);
  if (match) return match[1].trim();
  if (text.length >= 120) return text.slice(0, 120).trim();
  return '';
}

export interface PrefetchInput {
  /** The prefetched first sentence. */
  text: string;
  /** Synthesis promise for the head (resolves null on leg failure). */
  promise: Promise<TtsAudio | null>;
  /** True when the eager audio already started playing during streaming. */
  eagerPlayed: boolean;
  /** Resolves to whether the eager audio actually started playing.
   *  Null when eager playback never started. */
  playPromise: Promise<{ heard: boolean; blocked: boolean }> | null;
}

export interface VoicePlayerDeps {
  /** One full pass of the persona's voice chain (existing order). */
  synthesize: (text: string) => Promise<TtsAudio | null>;
  /** Play server audio; resolves true only on actual playback start. */
  playAudio: (audio: TtsAudio) => Promise<boolean>;
  /** Speak one chunk with the persona-locked browser voice; true
   *  only if it actually started sounding. */
  speakBrowserChunk: (text: string) => Promise<boolean>;
  /** Speak the WHOLE reply with the persona-locked browser voice
   *  (awaited — never fire-and-forget); true only if it sounded. */
  speakBrowserWhole: (text: string) => Promise<boolean>;
  /** True once this reply was interrupted / superseded. */
  isStale: () => boolean;
  /** Fail-fast: true when the caller knows the legs are dead for
   *  this reply (per-reply circuit) — skips extended retry. */
  shouldSkipExtendedRetry?: () => boolean;
  /** Fail-fast per chunk (2026-10-27 ruk-ruk fix): forwarded to the
   *  chunk queue — when true, a chunk that fails once does not burn
   *  two more chain passes on dead legs. Same condition as
   *  shouldSkipExtendedRetry; kept separate so the chunk layer can
   *  stop early instead of only skipping the extended passes. */
  failFast?: () => boolean;
  /** True when a play() was rejected (autoplay) — checked on
   *  desktop AND mobile alike, never mobile-only. */
  wasPlaybackBlocked?: () => boolean;
  /** Plain-words leg-failure detail for a `failed` banner, e.g.
   *  'quota' | 'auth' | 'network' | 'edge' | '' (generic). */
  failureDetail?: () => string;
  /** Full plain-words leg diagnostic for a `failed`/`partial`
   *  banner, e.g. 'Gemini کی آج کی حد ختم، سرور Edge کی آواز ناکام،
   *  اس ڈیوائس کی آواز نہیں ملی۔' — supplied by the caller from
   *  the legs it actually tried. When present it replaces the
   *  single-detail reason; it never carries keys or transcripts. */
  legDiagnostic?: () => string;
  /** Called while a chunk is in extended retry (waiting notice). */
  onChunkWaiting?: () => void;
  /** Called when a chunk's extended retry ends. */
  onChunkWaitingEnd?: () => void;
  /** Injectable timer for tests (defaults to a real timer). */
  wait?: (ms: number) => Promise<void>;
}

export interface VoicePlayerInput {
  text: string;
  config: VoiceConfig;
  /** Matching eager prefetch, or null (fallback path). The caller
   *  validates the match (same ticket, same gender, reply starts
   *  with the prefetched text, length ≥ 20) before passing it. */
  prefetch: PrefetchInput | null;
  /** Last successfully HEARD reply (null = none). */
  lastHeard: HeardRecord | null;
  /** Now (ms) for the duplicate window. */
  now: number;
  /** False = voice is switched off in Settings: silent by choice. */
  voiceEnabled: boolean;
}

export function failureReasonText(detail: string): string {
  if (detail === 'quota') {
    return 'تمہاری key کی آج کی حد ختم ہو گئی ہے — نئی key لگاؤ یا کل انتظار کرو۔';
  }
  if (detail === 'auth') {
    return 'تمہاری key میں مسئلہ ہے — Settings میں key دوبارہ چیک کرو۔';
  }
  if (detail === 'network' || detail === 'edge') {
    return 'نیٹ یا سرور کی آواز وقتی طور پر بند ہے — تھوڑی دیر بعد دوبارہ کوشش کرو۔';
  }
  return 'سرور کی آواز اور اس ڈیوائس کی آواز دونوں دستیاب نہیں — تھوڑی دیر بعد دوبارہ کوشش کرو۔';
}

/** Which legs failed during one reply — diagnostic only, never a
 *  key, transcript, or secret. The caller (chat.tsx) records these
 *  from the chain it actually ran; the player only renders them. */
export interface LegFailures {
  /** Gemini errorType for this reply: 'quota' | 'auth' | 'network' | '' */
  gemini: string;
  /** True when a server/client Edge attempt failed this reply. */
  edge: boolean;
  /** True when the browser-voice attempt found no qualifying voice
   *  or every sentence failed this reply. */
  browser: boolean;
}

/** Plain-Urdu leg list for a banner, e.g. 'Gemini کی آج کی حد ختم،
 *  سرور Edge کی آواز ناکام، اس ڈیوائس کی آواز نہیں ملی۔' Empty
 *  when no leg failure was recorded (caller falls back to the
 *  single-detail reason in that case). */
export function legDiagnosticText(failures: LegFailures): string {
  const parts: string[] = [];
  if (failures.gemini === 'quota') parts.push('Gemini کی آج کی حد ختم');
  else if (failures.gemini === 'auth') parts.push('Gemini key میں مسئلہ');
  else if (failures.gemini) parts.push('Gemini کی آواز ناکام');
  if (failures.edge) parts.push('سرور Edge کی آواز ناکام');
  if (failures.browser) parts.push('اس ڈیوائس کی آواز نہیں ملی');
  return parts.length ? `${parts.join('، ')}۔` : '';
}

/**
 * Speak one full reply through the single voice engine. Never
 * rejects; every exit is a terminal VoiceOutcome. The caller owns
 * rendering: `failed`/`partial` MUST go to the readable banner
 * channel, `stopped` shows a labelled banner only if `heard` is
 * true, `spoken`/`duplicate-heard`/`voice-off` show nothing.
 */
export async function runVoiceReply(
  input: VoicePlayerInput,
  deps: VoicePlayerDeps,
): Promise<VoiceOutcome> {
  const { text } = input;
  if (!input.voiceEnabled) {
    return { terminal: 'voice-off', heard: false, dropped: 0, totalChunks: 0, failureReason: '' };
  }
  if (isDuplicateHeard(input.lastHeard, text, input.now)) {
    return { terminal: 'duplicate-heard', heard: true, dropped: 0, totalChunks: 0, failureReason: '' };
  }
  if (!text.trim()) {
    return { terminal: 'failed', heard: false, dropped: 0, totalChunks: 0, failureReason: failureReasonText('') };
  }

  const queueDeps = {
    synthesize: deps.synthesize,
    isStale: deps.isStale,
    wait: deps.wait,
    playAudio: deps.playAudio,
    speakBrowserChunk: deps.speakBrowserChunk,
    shouldSkipExtendedRetry: deps.shouldSkipExtendedRetry,
    failFast: deps.failFast,
    onChunkWaiting: deps.onChunkWaiting
      ? () => deps.onChunkWaiting?.()
      : undefined,
    onChunkWaitingEnd: deps.onChunkWaitingEnd,
  };

  let heard = false;
  let dropped = 0;
  let totalChunks = 0;

  const fail = (): VoiceOutcome => {
    const diag = deps.legDiagnostic?.() ?? '';
    return {
      terminal: 'failed',
      heard,
      dropped,
      totalChunks,
      failureReason: diag || failureReasonText(deps.failureDetail?.() ?? ''),
    };
  };

  // --- Head: eager prefetch (if it matches this reply) --------------
  let restChunks: string[];
  const pf = input.prefetch;
  if (pf && text.startsWith(pf.text) && pf.text.length >= 20) {
    const head = pf.text;
    const restFull = text.slice(head.length).trim();
    restChunks = splitReplyIntoChunks(restFull);
    totalChunks = 1 + restChunks.length;
    if (pf.eagerPlayed && pf.playPromise) {
      // Eager audio already playing during streaming — wait for its
      // VERIFIED result. A rejected eager play is NOT heard: the
      // head is rescued through the queue below, never counted.
      const eager = await pf.playPromise.catch(() => ({ heard: false, blocked: true }));
      if (deps.isStale()) return { terminal: 'stopped', heard: eager.heard, dropped: 0, totalChunks, failureReason: '' };
      if (eager.heard) {
        heard = true;
      } else {
        const headQueue = await speakChunksInOrder([head], queueDeps);
        if (headQueue.stopped || deps.isStale()) return { terminal: 'stopped', heard: heard || headQueue.spokeAny, dropped, totalChunks, failureReason: '' };
        if (headQueue.spokeAny) heard = true;
        dropped += headQueue.dropped;
      }
    } else {
      const first = await pf.promise.catch(() => null);
      if (deps.isStale()) return { terminal: 'stopped', heard, dropped, totalChunks, failureReason: '' };
      if (first) {
        const played = await deps.playAudio(first);
        if (deps.isStale()) return { terminal: 'stopped', heard: heard || played, dropped, totalChunks, failureReason: '' };
        if (played) {
          heard = true;
        } else {
          const headQueue = await speakChunksInOrder([head], queueDeps);
          if (headQueue.stopped || deps.isStale()) return { terminal: 'stopped', heard: heard || headQueue.spokeAny, dropped, totalChunks, failureReason: '' };
          if (headQueue.spokeAny) heard = true;
          dropped += headQueue.dropped;
        }
      } else {
        // Head synthesis failed: rescue the head through the SAME
        // queue as the rest — never start silently from chunk two,
        // never count a head loss the rest path cannot see.
        const headQueue = await speakChunksInOrder([head], queueDeps);
        if (headQueue.stopped || deps.isStale()) return { terminal: 'stopped', heard: heard || headQueue.spokeAny, dropped, totalChunks, failureReason: '' };
        if (headQueue.spokeAny) heard = true;
        dropped += headQueue.dropped;
      }
    }
  } else {
    // --- Fallback: no usable prefetch — whole reply in chunks -------
    restChunks = splitReplyIntoChunks(text);
    totalChunks = restChunks.length;
  }

  if (deps.isStale()) return { terminal: 'stopped', heard, dropped, totalChunks, failureReason: '' };

  // --- Rest (or whole reply on the fallback path) --------------------
  if (restChunks.length > 0) {
    const restQueue = await speakChunksInOrder(restChunks, queueDeps);
    if (restQueue.stopped || deps.isStale()) return { terminal: 'stopped', heard: heard || restQueue.spokeAny, dropped, totalChunks, failureReason: '' };
    if (restQueue.spokeAny) heard = true;
    dropped += restQueue.dropped;
  }

  if (deps.isStale()) return { terminal: 'stopped', heard, dropped, totalChunks, failureReason: '' };

  // --- Whole-reply browser fallback (awaited, any device) -----------
  // If NOTHING was heard at all, the full text gets one browser-voice
  // attempt — on desktop exactly as on mobile (the old code gated
  // the playback-blocked branch to mobile only, and the prefetch
  // path gated this fallback behind `restChunks.length > 0`, which
  // is what silenced short replies outright). If the browser voice
  // speaks, the reply is heard in full and no failure banner is due.
  if (!heard) {
    const wholeHeard = await deps.speakBrowserWhole(text);
    if (deps.isStale()) return { terminal: 'stopped', heard: heard || wholeHeard, dropped, totalChunks, failureReason: '' };
    if (wholeHeard) {
      heard = true;
      dropped = 0;
    }
  }

  if (deps.isStale()) return { terminal: 'stopped', heard, dropped, totalChunks, failureReason: '' };
  if (!heard) return fail();
  if (dropped > 0) {
    return { terminal: 'partial', heard: true, dropped, totalChunks, failureReason: deps.legDiagnostic?.() ?? '' };
  }
  return { terminal: 'spoken', heard: true, dropped: 0, totalChunks, failureReason: '' };
}
