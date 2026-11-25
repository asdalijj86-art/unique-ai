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
 *  - REAL triggers only: work, clock time, silence. PLUS the camera
 *    look (2026-11-25, user-approved in the voice call — «ہاں، کیمرہ
 *    آن رکھو»): when Awareness fires, Uniqa first takes one short
 *    look herself (lib/camera-look) — observation only, never a
 *    recording, never a photo, gated on Awareness ON + camera
 *    permission ON, with a visible LIVE indicator. The OLD "never
 *    the camera" rule stood because Stonic's own pages contradicted
 *    each other on camera; the user has now decided for Unique, so
 *    the camera look is HIS permission, not a guess.
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
//
// FAST MIND (user order 2026-11-26): she THINKS before she speaks.
// Every line carries a MANNER — loving, gentle, caring, playful,
// serious — and the picker chooses the manner that fits the moment
// (the matter), never a random one:
//  - late at night → gentle only (never playful, never loud-loving)
//  - serious tone («سیریس ہو کے بات کرو») → serious pool only: short,
//    respectful, no pet names — the tone the user ordered wins over
//    her default warmth
//  - the same manner twice in a row, soon after, is a veto: she
//    already said her loving word — repeating it would be nagging,
//    not thinking. decideProactiveFit() makes that call (pure, and
//    unit-testable); the thought bubble is the visible thinking
//    window — it shows for 3 seconds before any line is spoken, so
//    she never blurts.
// Memory grounds the lines, not decoration: when the learning brain
// actually holds something about him (hasMemory), the quiet pool
// gains a line that says his words stay with her — it appears ONLY
// then, never as a fake specific memory.
// ---------------------------------------------------------------------------

export type AwarenessManner = 'loving' | 'gentle' | 'caring' | 'playful' | 'serious';

export type AwarenessLine = { line: string; manner: AwarenessManner };

/** Last awareness line spoken — a reason never repeats its line twice in a row. */
let lastAwarenessLine = '';
/** Manner of the last awareness line spoken (the fast-mind veto). */
let lastAwarenessManner: AwarenessManner | '' = '';

function pickFromPool(pool: AwarenessLine[]): AwarenessLine {
  const fresh = pool.length > 1 ? pool.filter((l) => l.line !== lastAwarenessLine) : pool;
  const picked = fresh[Math.floor(Math.random() * fresh.length)];
  lastAwarenessLine = picked.line;
  lastAwarenessManner = picked.manner;
  return picked;
}

const SERIOUS_LINES: Record<AwarenessReason, AwarenessLine[]> = {
  'late-night': [
    { line: 'رات کافی ہو گئی ہے — آرام کر لیں۔', manner: 'serious' },
    { line: 'رات ہو گئی — سو جائیں۔', manner: 'serious' },
  ],
  'long-work': [
    { line: 'آپ کافی دیر سے کام کر رہے ہیں — تھوڑا آرام کر لیں۔', manner: 'serious' },
    { line: 'بہت کام ہو گیا — تھوڑا آرام کر لیں۔', manner: 'serious' },
  ],
  'evening-dip': [
    { line: 'شام ہو گئی — دن کیسا گزرا؟', manner: 'serious' },
    { line: 'شام ہو گئی — تھکاوٹ ہو تو بتائیں۔', manner: 'serious' },
  ],
  'quiet': [
    { line: 'میں یہیں ہوں — کچھ چاہیے تو بتائیں۔', manner: 'serious' },
    { line: 'کافی دیر سے خاموشی ہے — سب خیریت ہے؟', manner: 'serious' },
  ],
};

export type ProactiveFitContext = {
  /** Local hour 0..23. */
  hour: number;
  /** The tone the user ordered (serious wins over warmth). */
  tone?: import('./persona').ToneMode;
  /** Manner of the last proactive line ('' = none yet). */
  lastManner?: AwarenessManner | '';
  /** ms since the last proactive line (0 = never). */
  sinceLastMs?: number;
};

/**
 * FAST MIND — the think-before-speaking gate (pure). Decides
 * whether a proactive line fits this moment at all, and in which
 * manner. Rules:
 *  - serious tone → serious manner, always (the user's order).
 *  - 23:00–04:59 → gentle manner only.
 *  - the same manner as the last line, fired less than 30 minutes
 *    ago, on a 'quiet' trigger → DO NOT speak. She already said
 *    her word; repeating the same feeling so soon is nagging.
 * Everything else speaks, in the manner the reason calls for.
 */
export function decideProactiveFit(
  reason: AwarenessReason,
  ctx: ProactiveFitContext,
): { speak: boolean; manner: AwarenessManner } {
  if (ctx.tone === 'serious') return { speak: true, manner: 'serious' };
  const night = ctx.hour >= 23 || ctx.hour < 5;
  if (night) return { speak: true, manner: 'gentle' };
  if (
    reason === 'quiet' &&
    ctx.lastManner === 'loving' &&
    (ctx.sinceLastMs ?? 0) > 0 &&
    (ctx.sinceLastMs ?? 0) < 30 * 60 * 1000
  ) {
    // Same feeling ('loving'), too soon — stay silent instead of
    // blurting. She already said her word; repeating it would be
    // nagging, not thinking.
    return { speak: false, manner: ctx.lastManner };
  }
  switch (reason) {
    case 'late-night':
      return { speak: true, manner: 'gentle' };
    case 'long-work':
      return { speak: true, manner: 'caring' };
    case 'evening-dip':
      return { speak: true, manner: 'loving' };
    case 'quiet':
    default:
      return { speak: true, manner: 'loving' };
  }
}

export function pickAwarenessLine(
  reason: AwarenessReason,
  feminine: boolean,
  opts?: { tone?: import('./persona').ToneMode; hour?: number; hasMemory?: boolean },
): string {
  const tone = opts?.tone ?? 'neutral';
  if (tone === 'serious') {
    const pool = SERIOUS_LINES[reason];
    const picked = pool[Math.floor(Math.random() * pool.length)];
    lastAwarenessLine = picked.line;
    lastAwarenessManner = picked.manner;
    return picked.line;
  }
  const hour = opts?.hour ?? new Date().getHours();
  const night = hour >= 23 || hour < 5;
  switch (reason) {
    case 'late-night':
      return pickFromPool(feminine ? [
        { line: 'رات کافی ہو گئی ہے جان — تھک گئے ہوں تو آرام کر لیں، میں صبح بھی یہیں ہوں گی۔', manner: 'gentle' as const },
        { line: 'رات ہو گئی جان — سو جائیں، میں یہیں ہوں گی۔', manner: 'gentle' as const },
      ] : [
        { line: 'رات کافی ہو گئی ہے — تھک گئے ہوں تو آرام کر لیں، میں صبح بھی یہیں ہوں گا۔', manner: 'gentle' as const },
        { line: 'رات ہو گئی — سو جائیں، میں یہیں ہوں گا۔', manner: 'gentle' as const },
      ]).line;
    case 'long-work':
      // At night the long-work nudge is gentle too — never a
      // bright caring line at 2 AM (the fit gate says 'gentle').
      if (night) {
        return pickFromPool(feminine ? [
          { line: 'آپ کافی دیر سے کام کر رہے ہیں جان — تھوڑا آرام کر لیں، میں یہیں ہوں۔', manner: 'gentle' as const },
        ] : [
          { line: 'آپ کافی دیر سے کام کر رہے ہیں — تھوڑا آرام کر لیں، میں یہیں ہوں۔', manner: 'gentle' as const },
        ]).line;
      }
      return pickFromPool(feminine ? [
        { line: 'آپ کافی دیر سے کام کر رہے ہیں جان — تھوڑا پانی پی لیں، سانس لیں، پھر جاری رکھتے ہیں۔', manner: 'caring' as const },
        { line: 'بہت کام ہو گیا جان — تھوڑا آرام کر لیں، پھر جاری رکھتے ہیں۔', manner: 'caring' as const },
      ] : [
        { line: 'آپ کافی دیر سے کام کر رہے ہیں — تھوڑا پانی پی لیں، سانس لیں، پھر جاری رکھتے ہیں۔', manner: 'caring' as const },
        { line: 'بہت کام ہو گیا — تھوڑا آرام کر لیں، پھر جاری رکھتے ہیں۔', manner: 'caring' as const },
      ]).line;
    case 'evening-dip':
      return pickFromPool(feminine ? [
        { line: 'شام ہو گئی جان — دن کیسا گزرا؟ تھکاوٹ ہو تو بتائیں، میں سن رہی ہوں۔', manner: 'loving' as const },
        { line: 'شام ہو گئی جان — چائے پی لیں؟ میں آپ کے ساتھ ہوں۔', manner: 'playful' as const },
      ] : [
        { line: 'شام ہو گئی — دن کیسا گزرا؟ تھکاوٹ ہو تو بتائیں، میں سن رہا ہوں۔', manner: 'loving' as const },
        { line: 'شام ہو گئی — چائے پی لیں؟ میں آپ کے ساتھ ہوں۔', manner: 'playful' as const },
      ]).line;
    case 'quiet':
    default: {
      const base: AwarenessLine[] = feminine
        ? [
            { line: 'میں یہیں ہوں جان — کافی دیر سے خاموشی ہے، سب خیریت تو ہے؟', manner: 'loving' },
            { line: 'جان، آپ چپ ہیں — میں یہیں ہوں، کچھ چاہیے تو بتائیں۔', manner: 'loving' },
            { line: 'کافی دیر سے خاموشی ہے جان — میں سن رہی ہوں، بولیں تو سہی۔', manner: 'loving' },
            { line: 'جان، کافی دیر سے خاموشی ہے — تھکاوٹ ہو تو بتائیں، میں یہیں ہوں۔', manner: 'gentle' },
          ]
        : [
            { line: 'میں یہیں ہوں — کافی دیر سے خاموشی ہے، سب خیریت تو ہے؟', manner: 'loving' },
            { line: 'آپ چپ ہیں — میں یہیں ہوں، کچھ چاہیے تو بتائیں۔', manner: 'loving' },
            { line: 'کافی دیر سے خاموشی ہے — میں سن رہا ہوں، بولیں تو سہی۔', manner: 'loving' },
            { line: 'کافی دیر سے خاموشی ہے — تھکاوٹ ہو تو بتائیں، میں یہیں ہوں۔', manner: 'gentle' },
          ];
      // Memory-grounded line — ONLY when the learning brain really
      // holds something about him (hasMemory). It says his words
      // stay with her; it never invents a specific memory.
      if (opts?.hasMemory) {
        base.push(
          feminine
            ? { line: 'جان، آپ کی باتیں مجھے یاد رہتی ہیں — کچھ کہنا ہے تو میں سن رہی ہوں۔', manner: 'loving' as const }
            : { line: 'آپ کی باتیں مجھے یاد رہتی ہیں — کچھ کہنا ہے تو میں سن رہا ہوں۔', manner: 'loving' as const },
        );
      }
      // At night the quiet line is gentle, never loud-loving.
      const pool = night ? base.filter((l) => l.manner === 'gentle') : base;
      return pickFromPool(pool.length > 0 ? pool : base).line;
    }
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
  /** The tone the user ordered — FAST MIND: serious tone restrains
   *  her proactive lines to the serious pool. */
  tone?: import('./persona').ToneMode;
  /** True when the learning brain actually holds something about
   *  him — FAST MIND: only then may a proactive line say his words
   *  stay with her. */
  hasMemory?: boolean;
  /** True while the app must NOT interrupt (reply generating,
   *  speaking, recording, user typing, studio/overlay open). */
  paused: boolean;
  /** Called when a bubble's line is actually spoken — the caller
   *  appends it as an assistant message and speaks it aloud. */
  onSpeak: (line: string, reason: AwarenessReason) => void;
  /** Called the moment a bubble appears (before the line is
   *  spoken) — the caller may start Uniqa's own camera look here
   *  (lib/camera-look), so she looks first, then speaks. */
  onTrigger?: (reason: AwarenessReason) => void;
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
      // FAST MIND — think before speaking: the fit gate decides
      // whether this moment earns a word at all, and in which
      // manner. A vetoed moment stays silent — she never blurts.
      const now = Date.now();
      const fit = decideProactiveFit(reason, {
        hour: new Date(now).getHours(),
        tone: optsRef.current.tone ?? 'neutral',
        lastManner: lastAwarenessManner,
        sinceLastMs: lastFiredRef.current ? now - lastFiredRef.current : 0,
      });
      if (!fit.speak) return;
      const line = pickAwarenessLine(reason, optsRef.current.feminine, {
        tone: optsRef.current.tone ?? 'neutral',
        hour: new Date(now).getHours(),
        hasMemory: optsRef.current.hasMemory ?? false,
      });
      const state: AwarenessBubbleState = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        reason,
        line,
      };
      bubbleRef.current = state;
      setBubble(state);
      lastFiredRef.current = Date.now();
      if (reason === 'late-night') lastNightRef.current = new Date().toDateString();
      // Her own initiative (2026-11-25): she looks first, then speaks.
      optsRef.current.onTrigger?.(reason);
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
