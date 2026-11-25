/**
 * alarm — Uniqa sets alarms from chat (user order 2026-11-26).
 *
 * «الارم لگا دو» / «اتنے بجے مجھے اٹھنا ہے» / «کبھی بھی کام کرنا ہے
 * الارم لگا دو» / "set an alarm" — detected command-shaped only
 * (the same discipline as lib/memory and lib/persona: a long message
 * that merely mentions an alarm never gets swallowed).
 *
 * An alarm is a time + a short purpose. When it is set, a small
 * clock strip appears at the top of the front and counts down live.
 * At the alarm time Uniqa speaks (voice) and shows it on screen.
 *
 * HONEST LIMIT (absolute — also written on the strip itself): an
 * alarm fires ONLY while the laptop is on and the app is open. A
 * closed laptop or a closed tab cannot ring — there is no background
 * service, no push, no system alarm behind this. The strip says so
 * plainly; the code never claims otherwise.
 *
 * Storage: plain localStorage key (alarms hold only a time + a short
 * purpose — no secrets, no keys, no memory content). Same pattern as
 * the Awareness flag. Persists across a page refresh.
 *
 * This module is PURE (no React, no DOM at import time) so the
 * parsing can be unit-tested headlessly; storage is injected
 * ({getItem,setItem}-shaped) like lib/awareness.
 */

export type Alarm = {
  id: string;
  /** Epoch ms when it must fire. */
  fireAt: number;
  /** Short purpose in the user's own words, e.g. «اٹھنا», «نماز». */
  label: string;
  createdAt: number;
};

export const ALARM_STORAGE_KEY = 'unique-ai-alarms';

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function loadAlarms(storage: StorageLike): Alarm[] {
  try {
    const raw = storage.getItem(ALARM_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is Alarm =>
          !!a &&
          typeof a === 'object' &&
          typeof (a as Alarm).id === 'string' &&
          typeof (a as Alarm).fireAt === 'number' &&
          typeof (a as Alarm).label === 'string',
      )
      .map((a) => ({ id: a.id, fireAt: a.fireAt, label: a.label, createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now() }));
  } catch {
    return [];
  }
}

export function saveAlarms(storage: StorageLike, alarms: Alarm[]): void {
  try {
    storage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarms));
  } catch {
    // storage unavailable — the alarm just won't survive a refresh
  }
}

// ---------------------------------------------------------------------------
// Time parsing — Urdu / Roman Urdu / English.
// ---------------------------------------------------------------------------

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** Urdu number words for clock hours 1–12. */
const URDU_HOURS: Record<string, number> = {
  'ایک': 1, 'دو': 2, 'تین': 3, 'چار': 4, 'پانچ': 5, 'چھ': 6, 'سات': 7,
  'آٹھ': 8, 'اٹھ': 8, 'نو': 9, 'دس': 10, 'گیارہ': 11, 'بارہ': 12,
};

function normalizeDigits(text: string): string {
  return String(text || '').replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d);
}

/** «سات» → 7, «7» → 7, else null. */
function parseHourWord(word: string): number | null {
  const w = (word || '').trim();
  if (/^\d{1,2}$/.test(w)) {
    const n = parseInt(w, 10);
    return n >= 1 && n <= 12 ? n : null;
  }
  return URDU_HOURS[w] ?? null;
}

export type ParsedAlarmTime =
  | { kind: 'absolute'; hour24: number; minute: number; qualifier: 'morning' | 'afternoon' | 'evening' | 'night' | null }
  | { kind: 'relative'; seconds: number };

/**
 * Find a time inside free text. Returns null when no time is there.
 * Shapes handled (any script mix):
 *  - «7:30», «7:30 بجے»
 *  - «صبح 7 بجے», «سات بجے», «رات 9 بجے», «دوپہر 2 بجے», «شام 6 بجے»
 *  - «7 بج کر 30 منٹ», «سات بج کر پندرہ منٹ»
 *  - «10 منٹ بعد», «آدھے گھنٹے بعد», «ایک گھنٹے بعد», «2 گھنٹے بعد»
 *  - "in 10 minutes", "in 2 hours", "after 30 seconds", "at 7:30"
 *  - «30 سیکنڈ بعد» (seconds — for quick tests and short reminders)
 */
export function parseAlarmTime(rawText: string): ParsedAlarmTime | null {
  const text = normalizeDigits(rawText || '');
  const lower = text.toLowerCase();

  // Relative first — but ONLY with an explicit "after / in / بعد"
  // marker. A bare «30 منٹ» inside «7 بج کر 30 منٹ» is the clock
  // time, NOT "in 30 minutes" — the marker is what makes it
  // relative (caught by scripts/test-alarm-fastmind.mjs).
  const relSec = /(?:(\d+)\s*(?:سیکنڈ|second|seconds)\s*(?:بعد|baad|later)|(?:in|after)\s+(\d+)\s*(?:second|seconds))/.exec(lower);
  if (relSec) {
    const s = parseInt(relSec[1] || relSec[2], 10);
    if (s >= 5 && s <= 3600) return { kind: 'relative', seconds: s };
  }
  const relMin = /(?:(\d+)\s*(?:منٹ|minute|minutes|min)\s*(?:بعد|baad|later)|(?:in|after)\s+(\d+)\s*(?:minute|minutes|min))/.exec(lower);
  if (relMin) {
    const m = parseInt(relMin[1] || relMin[2], 10);
    if (m >= 1 && m <= 720) return { kind: 'relative', seconds: m * 60 };
  }
  if (/آدھے گھنٹے بعد|آدھا گھنٹہ بعد|half an hour/i.test(text)) return { kind: 'relative', seconds: 30 * 60 };
  const relHour = /(?:(\d+)\s*(?:گھنٹے|گھنٹہ|hour|hours)\s*(?:بعد|baad|later)|(?:in|after)\s+(\d+)\s*(?:hour|hours))/.exec(lower);
  if (relHour) {
    const h = parseInt(relHour[1] || relHour[2], 10);
    if (h >= 1 && h <= 12) return { kind: 'relative', seconds: h * 3600 };
  }
  if (/ایک گھنٹے بعد|ایک گھنٹہ بعد|(?:in|after)\s+one hour/i.test(text)) return { kind: 'relative', seconds: 3600 };

  // Qualifier words — decide AM/PM.
  type DayPart = 'morning' | 'afternoon' | 'evening' | 'night' | null;
  let qualifier: DayPart = null;
  if (/(صبح|subah|morning)/.test(lower)) qualifier = 'morning';
  else if (/(دوپہر|dopehar|afternoon)/.test(lower)) qualifier = 'afternoon';
  else if (/(شام|shaam|evening)/.test(lower)) qualifier = 'evening';
  else if (/(رات|raat|night)/.test(lower)) qualifier = 'night';

  // «7:30» (digits, optional بجے).
  const colon = /(\d{1,2}):(\d{2})/.exec(text);
  if (colon) {
    const h = parseInt(colon[1], 10);
    const m = parseInt(colon[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { kind: 'absolute', hour24: h, minute: m, qualifier };
    }
  }

  // «7 بج کر 30 منٹ» / «سات بج کر پندرہ منٹ».
  const withMin = /([^\s]+)\s*بج\s*کر\s*([^\s]+)\s*منٹ/.exec(text);
  if (withMin) {
    const h = parseHourWord(withMin[1]);
    const mWord = withMin[2];
    const m = /^\d{1,2}$/.test(mWord) ? parseInt(mWord, 10) : { 'پندرہ': 15, 'تیس': 30, 'پینتالیس': 45 }[mWord] ?? null;
    if (h !== null && m !== null && m >= 0 && m <= 59) {
      return { kind: 'absolute', hour24: to24Hour(h, qualifier), minute: m, qualifier };
    }
  }

  // «7 بجے» / «سات بجے» — the plain hour.
  const hourOnly = /([^\s]+)\s*بجے/.exec(text);
  if (hourOnly) {
    const h = parseHourWord(hourOnly[1]);
    if (h !== null) return { kind: 'absolute', hour24: to24Hour(h, qualifier), minute: 0, qualifier };
  }

  // English "at 7" / "7 am" / "7 pm" / "7 o'clock".
  const enTime = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(lower);
  if (enTime && /(alarm|am|pm|o'clock|at\s+\d)/.test(lower)) {
    let h = parseInt(enTime[1], 10);
    const m = enTime[2] ? parseInt(enTime[2], 10) : 0;
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      if (enTime[3] === 'pm' && h !== 12) h += 12;
      if (enTime[3] === 'am' && h === 12) h = 0;
      return { kind: 'absolute', hour24: h, minute: m, qualifier };
    }
  }

  return null;
}

/** 12-hour + qualifier → 24-hour. No qualifier: keep as-is (caller
 *  resolves "already passed today" by rolling to tomorrow). */
function to24Hour(hour12: number, qualifier: 'morning' | 'afternoon' | 'evening' | 'night' | null): number {
  if (qualifier === 'morning') return hour12 === 12 ? 0 : hour12;
  if (qualifier === 'afternoon' || qualifier === 'evening' || qualifier === 'night') {
    return hour12 === 12 ? 12 : hour12 + 12;
  }
  return hour12;
}

/** Resolve a parsed time to a real fire timestamp. Absolute times
 *  already passed today roll to tomorrow (a wake-up alarm for 7 AM
 *  asked at 9 AM means tomorrow 7 AM — never "in the past"). */
export function resolveFireAt(parsed: ParsedAlarmTime, now: number = Date.now()): number {
  if (parsed.kind === 'relative') return now + parsed.seconds * 1000;
  const d = new Date(now);
  d.setHours(parsed.hour24, parsed.minute, 0, 0);
  let at = d.getTime();
  if (at <= now) at += 24 * 60 * 60 * 1000;
  return at;
}

// ---------------------------------------------------------------------------
// Command detection — command-shaped only.
// ---------------------------------------------------------------------------

export type AlarmCommand =
  | { type: 'set'; fireAt: number; label: string }
  | { type: 'list' }
  | { type: 'cancel'; scope: 'next' | 'all' };

const ALARM_WORD = /(الارم|alarm)/i;
const SET_VERB = /(لگا دو|لگا دے|لگاؤ|لگا|سیٹ کر دو|سیٹ کرو|set|lagaa|lagao|set an alarm|set alarm)/i;
const CANCEL_VERB = /(بند کر دو|بند کرو|کینسل کر دو|کینسل کرو|ہٹا دو|ختم کر دو|cancel|turn off|remove|delete)/i;
const LIST_WORD = /(دکھاؤ|دکھا دو|بتاؤ|کون سے|کتنے|show|list|which)/i;
const WAKE_WORD = /(اٹھنا ہے|اٹھنا|جاگنا ہے|جاگنا|wake (me )?up|uthna)/i;

function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

/** Strip the alarm/time words out of the message to leave the purpose
 *  («صبح 7 بجے اٹھنے کا الارم لگا دو» → «اٹھنے کا»). */
export function extractAlarmLabel(rawText: string): string {
  let t = normalizeDigits(rawText || '');
  t = t
    .replace(/\d{1,2}:\d{2}/g, ' ')
    .replace(/[^\s]+\s*بج\s*کر\s*[^\s]+\s*منٹ/g, ' ')
    .replace(/[^\s]+\s*بجے/g, ' ')
    .replace(/\d+\s*(?:منٹ|گھنٹے|گھنٹہ|سیکنڈ|minute|minutes|hour|hours|second|seconds)\s*(?:بعد|baad|later)?/gi, ' ')
    .replace(/(صبح|دوپہر|شام|رات|subah|dopehar|shaam|raat|morning|afternoon|evening|night)/gi, ' ')
    .replace(/(الارم|alarm)/gi, ' ')
    .replace(/(لگا دو|لگا دے|لگاؤ|لگا|سیٹ کر دو|سیٹ کرو|set an alarm|set alarm|set)/gi, ' ')
    .replace(/(مجھے|مجھ|mujhe|me)/gi, ' ')
    // Standalone particles only (word-boundary shaped, so «لڑکا»
    // never loses its «کا» from inside the word).
    .replace(/(^|\s)(کا|کی|کے|کو|نے|اور|پر|سے|for|to|at|in)(\s|$)/gi, ' ')
    .replace(/[،,۔.!?؟\s]+/g, ' ')
    .trim();
  return t;
}

/**
 * Detect an alarm command. Returns null for anything that is not a
 * command (long messages merely mentioning an alarm, questions about
 * alarms in general). Set needs a time in the message; a bare
 * «الارم لگا دو» with no time returns null so the brain can ask
 * which time instead of us guessing.
 */
export function parseAlarmCommand(rawText: string, now: number = Date.now()): AlarmCommand | null {
  const text = String(rawText || '').trim();
  if (!text || !ALARM_WORD.test(text)) {
    // No alarm word at all — but a wake-up line with a time still
    // counts: «صبح 7 بجے مجھے اٹھنا ہے».
    if (WAKE_WORD.test(text) && parseAlarmTime(text)) {
      const parsed = parseAlarmTime(text)!;
      const label = extractAlarmLabel(text) || 'اٹھنا';
      return { type: 'set', fireAt: resolveFireAt(parsed, now), label };
    }
    return null;
  }
  if (countWords(text) > 25) return null;

  // Cancel first: «الارم بند کر دو» / «الارم کینسل کر دو».
  if (CANCEL_VERB.test(text)) {
    const all = /(سارے|سب|تمام|all)/i.test(text);
    return { type: 'cancel', scope: all ? 'all' : 'next' };
  }
  // List: «الارم دکھاؤ» / «میرے الارم بتاؤ».
  if (LIST_WORD.test(text) && !SET_VERB.test(text)) {
    return { type: 'list' };
  }
  // Set: alarm word + set verb + a time.
  if (SET_VERB.test(text) || WAKE_WORD.test(text)) {
    const parsed = parseAlarmTime(text);
    if (!parsed) return null;
    const label = extractAlarmLabel(text) || 'الارم';
    return { type: 'set', fireAt: resolveFireAt(parsed, now), label };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers for the strip + firing.
// ---------------------------------------------------------------------------

/** The next alarm that has not fired yet (earliest first). */
export function nextAlarm(alarms: Alarm[], now: number = Date.now()): Alarm | null {
  const upcoming = alarms.filter((a) => a.fireAt > now - 1000).sort((a, b) => a.fireAt - b.fireAt);
  return upcoming[0] ?? null;
}

/** Alarms whose time has come. */
export function dueAlarms(alarms: Alarm[], now: number = Date.now()): Alarm[] {
  return alarms.filter((a) => a.fireAt <= now);
}

/** «صبح 7:00» / «رات 9:30» / «دوپہر 2:15» — 12-hour, Urdu day part.
 *  `now` is injectable so the "(کل)" (tomorrow) mark is testable. */
export function formatAlarmTime(fireAt: number, now: number = Date.now()): string {
  const d = new Date(fireAt);
  const h24 = d.getHours();
  const m = d.getMinutes();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const part = h24 < 5 ? 'رات' : h24 < 12 ? 'صبح' : h24 < 17 ? 'دوپہر' : h24 < 20 ? 'شام' : 'رات';
  const mm = m.toString().padStart(2, '0');
  const tomorrow = new Date(fireAt).toDateString() !== new Date(now).toDateString() ? ' (کل)' : '';
  return `${part} ${h12}:${mm}${tomorrow}`;
}

/** «2 گھنٹے 15 منٹ باقی» / «45 سیکنڈ باقی» / «ابھی». */
export function formatCountdown(fireAt: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((fireAt - now) / 1000));
  if (s <= 0) return 'ابھی';
  if (s < 60) return `${s} سیکنڈ باقی`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const rest = s % 60;
    return rest > 0 ? `${m} منٹ ${rest} سیکنڈ باقی` : `${m} منٹ باقی`;
  }
  const h = Math.floor(m / 60);
  const restM = m % 60;
  return restM > 0 ? `${h} گھنٹے ${restM} منٹ باقی` : `${h} گھنٹے باقی`;
}

export function makeAlarm(fireAt: number, label: string): Alarm {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fireAt,
    label,
    createdAt: Date.now(),
  };
}

/** The line Uniqa speaks when an alarm fires — feminine / masculine
 *  by the speaking persona. Kept here (pure) so the render test can
 *  assert the exact words. */
export function alarmFireLine(alarm: Alarm, feminine: boolean): string {
  return feminine
    ? `جان، الارم بج رہا ہے — ${alarm.label} کا وقت ہو گیا ہے، اٹھ جائیں 💛`
    : `الارم بج رہا ہے — ${alarm.label} کا وقت ہو گیا ہے، اٹھ جائیں۔`;
}

/** Confirmation after setting an alarm. */
export function alarmSetConfirmation(alarm: Alarm, feminine: boolean): string {
  return feminine
    ? `ٹھیک ہے جان 💛 الارم لگا دیا — ${formatAlarmTime(alarm.fireAt)} (${alarm.label})۔ اوپر گھڑی چل رہی ہے، وقت پر میں خود جگا دوں گی۔`
    : `ٹھیک ہے — الارم لگا دیا — ${formatAlarmTime(alarm.fireAt)} (${alarm.label})۔ اوپر گھڑی چل رہی ہے، وقت پر میں جگا دوں گا۔`;
}

/** The honest limit, shown on the strip and spoken once when the
 *  first alarm is set. */
export const ALARM_HONEST_LIMIT =
  'الارم صرف تب بجے گا جب لیپ ٹاپ آن ہو اور یہ ایپ کھلی ہو — بند لیپ ٹاپ یا بند ٹیب نہیں بجا سکتا۔';
