/**
 * Gemini TTS savings (2026-10-27, user-approved cache fix).
 *
 * Two in-memory, session-only helpers — NO persistence, NO key
 * values, NO voice/picker changes:
 *
 * 1. AudioCache — successful Gemini audio keyed by EXACT text +
 *    resolved voiceName + female flag. Replay, the per-message
 *    "سنیں" button, repeated greetings/confirmations and repeated
 *    sentences then cost ZERO new Gemini calls. A different voice
 *    for the same text is a DIFFERENT key and never returns the
 *    other voice's audio (fail-closed on voice mismatch).
 *    Capped: at most 20 entries and 8,000,000 base64 chars total;
 *    oldest entries are evicted first (LRU by re-insertion on hit).
 *
 * 2. DeadKeyTracker — a quota/auth-dead user key is skipped for
 *    ~10 minutes, then probed once when its window expires. This
 *    stops the first chunk of every reply burning one fetch per
 *    dead key after exhaustion, while still allowing recovery
 *    when quota resets. It is session-only: a page reload clears
 *    it, and it never touches the chat-generation rotation (chat
 *    uses a different model and may have different quota).
 *
 * Both classes are pure (injectable clock) so they are headlessly
 * testable without React, fetch, or localStorage.
 */

export type TtsAudio = { audioBase64: string; mimeType: string };

export const TTS_CACHE_MAX_ENTRIES = 20;
export const TTS_CACHE_MAX_BYTES = 8_000_000;
export const DEAD_KEY_SKIP_MS = 10 * 60 * 1000;

/** Cache key: exact text, resolved voice, female flag. Never
 *  normalised (no trim/lowercase) — a different string is a
 *  different synthesis request, and sharing across voices is a
 *  fail-closed voice leak, so voice is part of the key. */
export function makeTtsCacheKey(text: string, voiceName: string, female: boolean): string {
  return `${female ? 'F' : 'M'}:${voiceName}:${text}`;
}

export class AudioCache {
  private entries = new Map<string, TtsAudio>();
  private totalBytes = 0;
  constructor(
    private readonly maxEntries: number = TTS_CACHE_MAX_ENTRIES,
    private readonly maxBytes: number = TTS_CACHE_MAX_BYTES,
  ) {}

  get(key: string): TtsAudio | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    // LRU: a hit refreshes recency.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  set(key: string, audio: TtsAudio): void {
    const bytes = audio.audioBase64.length;
    // One entry larger than the whole cap can never be stored.
    if (bytes > this.maxBytes) return;
    const old = this.entries.get(key);
    if (old) {
      this.totalBytes -= old.audioBase64.length;
      this.entries.delete(key);
    }
    this.entries.set(key, audio);
    this.totalBytes += bytes;
    while ((this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) && this.entries.size > 1) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      const evicted = this.entries.get(oldest.value)!;
      this.totalBytes -= evicted.audioBase64.length;
      this.entries.delete(oldest.value);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }
}

/** Session-wide singleton used by api.ts. */
export const ttsAudioCache = new AudioCache();

export class DeadKeyTracker {
  private deadUntil = new Map<string, number>();
  constructor(
    private readonly skipMs: number = DEAD_KEY_SKIP_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** True while the key is inside its skip window. Expired
   *  entries are cleared on read, so the next call re-probes. */
  isSkipped(id: string): boolean {
    const until = this.deadUntil.get(id);
    if (until === undefined) return false;
    if (this.now() >= until) {
      this.deadUntil.delete(id);
      return false;
    }
    return true;
  }

  markDead(id: string): void {
    this.deadUntil.set(id, this.now() + this.skipMs);
  }

  /** A key that just succeeded is alive again. */
  clear(id: string): void {
    this.deadUntil.delete(id);
  }

  clearAll(): void {
    this.deadUntil.clear();
  }
}

/** Session-wide singleton used by api.ts. */
export const deadKeyTracker = new DeadKeyTracker();

/** Non-reversible in-memory identifier for a key: its index plus a
 *  FNV-1a hash of the value. The hash is never persisted, logged,
 *  or sent anywhere — it only lets the tracker tell two saved keys
 *  apart if the user reorders them, instead of skipping the wrong
 *  key by index alone. It cannot reconstruct the key. */
export function deadKeyId(keyIdx: number, keyValue: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < keyValue.length; i++) {
    h ^= keyValue.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${keyIdx}:${h.toString(16)}`;
}
