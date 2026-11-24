/**
 * Awareness — Unique AI speaks FIRST (Phase 1, 2026-11-22).
 *
 * The feeling Stonic proved on its own site (v3.1.10, v3.1.13):
 * after a long stretch of work, late at night, when energy dips, or
 * when it has been quiet for a while, the assistant starts speaking
 * first — and it shows a thought bubble of what it is about to say
 * BEFORE it speaks.
 *
 * OUR rules, from the user's own words (2026-11-22 voice call):
 *  - REAL triggers only: work, clock time, silence. NEVER the
 *    camera — Stonic's own pages contradict each other on camera
 *    (changelog v3.0.2 says it was removed; the privacy page says it
 *    is on by default), so camera detection is never used here.
 *  - NEVER lie: the lines are our own honest Urdu lines. The
 *    "I miss you" / "where did you go" lines were never verified
 *    (TikTok audio could not be heard) and are NOT used.
 *  - The thought bubble shows first (3 seconds); the user can tap
 *    "speak now" or dismiss it — a dismissed bubble never speaks.
 *  - Never interrupts: no firing while a reply is being generated,
 *    while speaking, while recording, while the user is typing, or
 *    while a studio/overlay is open.
 *
 * Pure module: the trigger decision is a pure function
 * (decideAwarenessTrigger) so it is unit-testable headlessly;
 * storage is injected ({getItem,setItem}-shaped).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type AwarenessReason = 'quiet' | 'late-night' | 'long-work' | 'evening-dip';

export const AWARENESS_STORAGE_KEY = 'unique-ai-awareness';
/** Quiet spell that earns a first word. */
export const AWARENESS_QUIET_MS = 10 * 60 * 1000;
/** Minimum gap between two Awareness speeches. */
export const AWARENESS_COOLDOWN_MS = 20 * 60 * 1000;
/** How long the thought bubble shows before the line is spoken. */
export const AWARENESS_BUBBLE_MS = 3000;
/** A "long stretch of work": this many user messages in the session. */
export const AWARENESS_LONG_WORK_MESSAGES = 6;
/** ...sustained for at least this long since the session started. */
export const AWARENESS_LONG_WORK_MS = 20 * 60 * 1000;

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/** Awareness is ON by default — the title-bar switch turns it off. */
export function readAwarenessEnabled(storage: StorageLike): boolean {
  try {
    const raw = storage.getItem(AWARENESS_STORAGE_KEY);
    if (raw === null) return true;
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

export function saveAwarenessEnabled(storage: StorageLike, enabled: boolean): void {
  try {
    storage.setItem(AWARENESS_STORAGE_KEY, JSON.stringify(enabled));
  } catch {
    // storage unavailable — the switch just won't persist
  }
}

// ---------------------------------------------------------------------------
// Lines — our own honest Urdu. Never Stonic's unverified spoken lines.
// ---------------------------------------------------------------------------

/** Last awareness line spoken — a reason never repeats its line twice in a row. */
let lastAwarenessLine = '';

function pickFromPool(pool: string[]): string {
  const fresh = pool.length > 1 ? pool.filter((l) => l !== lastAwarenessLine) : pool;
  const line = fresh[Math.floor(Math.random() * fresh.length)];
  lastAwarenessLine = line;
  return line;
}

export function pickAwarenessLine(reason: AwarenessReason, feminine: boolean): string {
  switch (reason) {
    case 'late-night':
      return pickFromPool(feminine ? [
        'رات کافی ہو گئی ہے جان — تھک گئے ہوں تو آرام کر لیں، میں صبح بھی یہیں ہوں گی۔',
        'رات ہو گئی جان — سو جائیں، میں یہیں ہوں گی۔',
      ] : [
        'رات کافی ہو گئی ہے — تھک گئے ہوں تو آرام کر لیں، میں صبح بھی یہیں ہوں گا۔',
        'رات ہو گئی — سو جائیں، میں یہیں ہوں گا۔',
      ]);
    case 'long-work':
      return pickFromPool(feminine ? [
        'آپ کافی دیر سے کام کر رہے ہیں جان — تھوڑا پانی پی لیں، سانس لیں، پھر جاری رکھتے ہیں۔',
        'بہت کام ہو گیا جان — تھوڑا آرام کر لیں، پھر جاری رکھتے ہیں۔',
      ] : [
        'آپ کافی دیر سے کام کر رہے ہیں — تھوڑا پانی پی لیں، سانس لیں، پھر جاری رکھتے ہیں۔',
        'بہت کام ہو گیا — تھوڑا آرام کر لیں، پھر جاری رکھتے ہیں۔',
      ]);
    case 'evening-dip':
      return pickFromPool(feminine ? [
        'شام ہو گئی جان — دن کیسا گزرا؟ تھکاوٹ ہو تو بتائیں، میں سن رہی ہوں۔',
        'شام ہو گئی جان — چائے پی لیں؟ میں آپ کے ساتھ ہوں۔',
      ] : [
        'شام ہو گئی — دن کیسا گزرا؟ تھکاوٹ ہو تو بتائیں، میں سن رہا ہوں۔',
        'شام ہو گئی — چائے پی لیں؟ میں آپ کے ساتھ ہوں۔',
      ]);
    case 'quiet':
    default:
      return pickFromPool(feminine ? [
        'میں یہیں ہوں جان — کافی دیر سے خاموشی ہے، سب خیریت تو ہے؟',
        'جان، آپ چپ ہیں — میں یہیں ہوں، کچھ چاہیے تو بتائیں۔',
        'کافی دیر سے خاموشی ہے جان — میں سن رہی ہوں، بولیں تو سہی۔',
      ] : [
        'میں یہیں ہوں — کافی دیر سے خاموشی ہے، سب خیریت تو ہے؟',
        'آپ چپ ہیں — میں یہیں ہوں، کچھ چاہیے تو بتائیں۔',
        'کافی دیر سے خاموشی ہے — میں سن رہا ہوں، بولیں تو سہی۔',
      ]);
  }
}

// ---------------------------------------------------------------------------
// Pure trigger decision — unit-testable, no timers, no DOM.
// ---------------------------------------------------------------------------

export type AwarenessSignals = {
  now: number;
  /** Last user activity (message, tap, studio use). */
  lastActivityAt: number;
  /** When this app session started. */
  sessionStartedAt: number;
  /** User messages sent this session. */
  sessionMessages: number;
  /** Last time Awareness spoke (0 = never). */
  lastFiredAt: number;
  /** Date string of the last late-night speech ('' = never). */
  lastNightFired: string;
  /** Local hour 0..23. */
  hour: number;
};

export function decideAwarenessTrigger(s: AwarenessSignals): AwarenessReason | null {
  if (s.now - s.lastFiredAt < AWARENESS_COOLDOWN_MS) return null;
  const quietFor = s.now - s.lastActivityAt;
  // Late at night — once per night, only if the app was in use
  // recently (a quiet spell of 1–60 minutes, not a dead session).
  if (
    (s.hour >= 23 || s.hour < 5) &&
    s.lastNightFired !== new Date(s.now).toDateString() &&
    quietFor >= 60 * 1000 &&
    quietFor <= 60 * 60 * 1000
  ) {
    return 'late-night';
  }
  // A long stretch of real work — many messages, sustained a while,
  // still active just now: a gentle rest nudge, not an interruption.
  if (
    s.sessionMessages >= AWARENESS_LONG_WORK_MESSAGES &&
    s.now - s.sessionStartedAt >= AWARENESS_LONG_WORK_MS &&
    quietFor <= 5 * 60 * 1000
  ) {
    return 'long-work';
  }
  // A genuine quiet spell — but not a dead session: after an hour of
  // silence the user is gone, so stop nudging (same 60-minute window
  // as late-night). Otherwise the tab would speak every 20 minutes
  // all night to an empty room.
  if (quietFor >= AWARENESS_QUIET_MS && quietFor <= 60 * 60 * 1000) return 'quiet';
  // Evening energy dip — after 21:00, quiet for a few minutes.
  // Bounded to 21:00–22:59 so it never fires in the late-night
  // window (23:00–04:59 belongs to 'late-night' alone — the dip line
  // says "شام ہو گئی", which would be wrong at 2 AM), and to a
  // 60-minute quiet spell so a dead session stays silent.
  if (s.hour >= 21 && s.hour < 23 && quietFor >= 5 * 60 * 1000 && quietFor <= 60 * 60 * 1000) return 'evening-dip';
  return null;
}

// ---------------------------------------------------------------------------
// React hook — timers, bubble, cooldown, activity tracking.
// ---------------------------------------------------------------------------

export type AwarenessBubbleState = {
  id: string;
  reason: AwarenessReason;
  line: string;
};

export function useAwareness(opts: {
  enabled: boolean;
  /** Uniqa speaks with feminine grammar; Unique with masculine. */
  feminine: boolean;
  /** True while the app must NOT interrupt (reply generating,
   *  speaking, recording, user typing, studio/overlay open). */
  paused: boolean;
  /** Called when a bubble's line is actually spoken — the caller
   *  appends it as an assistant message and speaks it aloud. */
  onSpeak: (line: string, reason: AwarenessReason) => void;
}): {
  bubble: AwarenessBubbleState | null;
  /** The user did something — reset the quiet clock, drop a bubble. */
  recordActivity: () => void;
  /** The user sent a message — counts toward the long-work stretch. */
  recordMessage: () => void;
  dismissBubble: () => void;
  /** Speak the pending bubble's line right now. */
  speakNow: () => void;
  /** Test path — the SAME full path as a real trigger (bubble first,
   *  then speak). Used by the "آزمائیں" button and by self-tests. */
  fireNow: (reason?: AwarenessReason) => void;
} {
  const [bubble, setBubble] = useState<AwarenessBubbleState | null>(null);
  const lastActivityRef = useRef(Date.now());
  const sessionStartedRef = useRef(Date.now());
  const sessionMessagesRef = useRef(0);
  const lastFiredRef = useRef(0);
  const lastNightRef = useRef('');
  const bubbleTimerRef = useRef<number | null>(null);
  const bubbleRef = useRef<AwarenessBubbleState | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const clearBubbleTimer = useCallback(() => {
    if (bubbleTimerRef.current !== null) {
      window.clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }
  }, []);

  const dismissBubble = useCallback(() => {
    clearBubbleTimer();
    bubbleRef.current = null;
    setBubble(null);
  }, [clearBubbleTimer]);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    // The user is back — a pending thought is no longer needed.
    dismissBubble();
  }, [dismissBubble]);

  const recordMessage = useCallback(() => {
    sessionMessagesRef.current += 1;
    recordActivity();
  }, [recordActivity]);

  const fire = useCallback(
    (reason: AwarenessReason) => {
      if (bubbleRef.current) return;
      const line = pickAwarenessLine(reason, optsRef.current.feminine);
      const state: AwarenessBubbleState = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        reason,
        line,
      };
      bubbleRef.current = state;
      setBubble(state);
      lastFiredRef.current = Date.now();
      if (reason === 'late-night') lastNightRef.current = new Date().toDateString();
      bubbleTimerRef.current = window.setTimeout(() => {
        bubbleRef.current = null;
        setBubble(null);
        optsRef.current.onSpeak(line, reason);
      }, AWARENESS_BUBBLE_MS);
    },
    [],
  );

  const speakNow = useCallback(() => {
    const pending = bubbleRef.current;
    if (!pending) return;
    clearBubbleTimer();
    bubbleRef.current = null;
    setBubble(null);
    optsRef.current.onSpeak(pending.line, pending.reason);
  }, [clearBubbleTimer]);

  const fireNow = useCallback(
    (reason: AwarenessReason = 'quiet') => {
      if (bubbleRef.current) return;
      fire(reason);
    },
    [fire],
  );

  // The watcher: every 20 seconds, ask the pure decider whether a
  // real trigger has earned a first word.
  useEffect(() => {
    if (!opts.enabled) {
      dismissBubble();
      return;
    }
    const check = () => {
      const o = optsRef.current;
      if (!o.enabled || o.paused || bubbleRef.current) return;
      const now = Date.now();
      const reason = decideAwarenessTrigger({
        now,
        lastActivityAt: lastActivityRef.current,
        sessionStartedAt: sessionStartedRef.current,
        sessionMessages: sessionMessagesRef.current,
        lastFiredAt: lastFiredRef.current,
        lastNightFired: lastNightRef.current,
        hour: new Date(now).getHours(),
      });
      if (reason) fire(reason);
    };
    const id = window.setInterval(check, 20_000);
    return () => window.clearInterval(id);
  }, [opts.enabled, opts.paused, fire, dismissBubble]);

  useEffect(
    () => () => {
      if (bubbleTimerRef.current !== null) window.clearTimeout(bubbleTimerRef.current);
    },
    [],
  );

  return { bubble, recordActivity, recordMessage, dismissBubble, speakNow, fireNow };
}
