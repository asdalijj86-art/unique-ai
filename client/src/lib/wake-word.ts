/**
 * wake-word.ts — "Hey Unique" wake word (user order 2026-11-28).
 *
 * Pure, headlessly testable matcher + support check. The React hook
 * that owns the live SpeechRecognition lives in use-wake-word.ts.
 *
 * Phrases (English + Urdu, both scripts):
 *   "hey unique", "hey uniqa", "unique", "uniqa",
 *   "ہے یونیک", "یونیک", "یونیکا", "اے یونیکا", "اے یونیک"
 *
 * HONEST LIMITS (stated here, in the UI, and to the user — never
 * claimed otherwise):
 *  - When the app is FULLY CLOSED, no website can hear a wake word
 *    and open itself. "Hey Google" lives in the phone/system itself.
 *    The real behaviour is: Unique OPEN (e.g. pinned tab) + "Hey
 *    Unique" spoken = she wakes at once.
 *  - Chrome needs ONE user click before the mic can start (mic
 *    policy), so listening only starts after a gesture — the
 *    indicator says so plainly until then.
 *  - No SpeechRecognition in the browser (or no mic / no permission)
 *    means listening is OFF, with the reason shown — never faked.
 */

export type WakeWordSupport =
  | { supported: true }
  | { supported: false; reason: string };

/** English wake phrases, normalised form (lowercase, single spaces). */
export const WAKE_PHRASES_EN = ['hey unique', 'hey uniqa', 'unique', 'uniqa'] as const;
/** Urdu wake phrases, normalised form. */
export const WAKE_PHRASES_UR = ['ہے یونیک', 'یونیک', 'یونیکا', 'اے یونیکا', 'اے یونیک'] as const;

/**
 * Normalise a transcript for matching: lowercase Latin, strip
 * punctuation (both scripts) and Arabic diacritics, collapse space.
 * Keeps Urdu letters intact so «یونیک» still matches.
 */
export function normalizeWakeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـۖ-ۭ]/g, '')
    .replace(/[.,!?؛؟،:"'«»()\[\]{}—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a transcript contains a wake phrase as whole words.
 * Word-boundary matching, so «uniquely» or «یونیکل» do NOT fire,
 * but «hey unique, what is…» and «اے یونیکا سنو» DO — the wake word
 * may sit inside a longer sentence.
 */
export function isWakeWord(text: string): boolean {
  const norm = normalizeWakeText(text);
  if (!norm) return false;
  const phrases = [...WAKE_PHRASES_EN, ...WAKE_PHRASES_UR];
  return phrases.some((phrase) => {
    const idx = norm.indexOf(phrase);
    if (idx === -1) return false;
    const beforeOk = idx === 0 || norm[idx - 1] === ' ';
    const afterIdx = idx + phrase.length;
    const afterOk = afterIdx >= norm.length || norm[afterIdx] === ' ';
    return beforeOk && afterOk;
  });
}

/**
 * SpeechRecognition support in this browser. In headless Chrome
 * (and in browsers without the API) this is false — the UI then
 * shows listening as off with this reason, never as listening.
 */
export function getWakeWordSupport(w?: unknown): WakeWordSupport {
  const win = (w ?? (typeof window !== 'undefined' ? window : undefined)) as
    | { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    | undefined;
  if (!win) return { supported: false, reason: 'no-window' };
  if (win.SpeechRecognition || win.webkitSpeechRecognition) return { supported: true };
  return { supported: false, reason: 'no-speech-recognition' };
}

/**
 * Recognition language, alternating per restart cycle so BOTH
 * scripts get a chance: «Hey Unique» is English, «ہے یونیک» is
 * Urdu, and one recogniser language hears its own script best.
 * Cycle 0 → ur-PK (the user's language first), 1 → en-US, then
 * repeats. Never pretends one language hears both perfectly.
 */
export function wakeWordLang(cycle: number): string {
  return cycle % 2 === 0 ? 'ur-PK' : 'en-US';
}

/** Human-readable reason for the indicator / Settings row. */
export function wakeWordReasonLabel(reason: string): string {
  switch (reason) {
    case 'no-speech-recognition':
      return 'اس براؤزر میں آواز پہچاننے کی سہولت نہیں — Chrome استعمال کریں';
    case 'no-mic':
      return 'مائیک نہیں ملا یا اجازت نہیں ملی';
    case 'not-allowed':
      return 'مائیک کی اجازت نہیں ملی — براؤزر کی اجازت آن کریں';
    case 'waiting-gesture':
      return 'مائیک شروع کرنے کے لیے ایک بار کہیں بھی کلک کریں (Chrome کی شرط)';
    case 'off':
      return 'بند ہے — سیٹنگز سے آن کریں';
    default:
      return reason;
  }
}
