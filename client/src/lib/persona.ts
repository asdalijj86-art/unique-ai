/**
 * Persona + tone system (Master Plan Phase 2 «فیلنگ انجن + یونیکا»).
 *
 * The app has TWO personas:
 *  - UNIQUE (male) — the default assistant. His voice lock is absolute:
 *    Salman primary, strict male-only fallbacks, NEVER a female voice.
 *  - UNIQA (female companion) — she speaks ONLY when summoned: a
 *    name-call («یونیکا», «یونیکا کو بلاؤ») or the romantic-companion
 *    pick in Settings. She has her OWN female voice chain; no leg of
 *    it can ever produce Salman's voice, and no leg of Unique's chain
 *    can ever produce hers (the pickers below are provably separate —
 *    see scripts/test-persona.mjs).
 *
 * Tone (لہجہ) is independent of persona: «سیریس ہو کے بات کرو» switches
 * the tone until changed; «رومینٹک ہو جاؤ» never summons Uniqa by
 * itself — it only softens whoever is present.
 *
 * Everything in this module is PURE (no window/localStorage access at
 * import time) so the routing can be unit-tested headlessly with the
 * real code — the same standard as surah-names / voice-commands.
 */

export type Persona = 'unique' | 'uniqa';
export type ToneMode = 'neutral' | 'serious' | 'romantic';

export const PERSONA_STORAGE_KEY = 'unique-ai-persona';
export const TONE_STORAGE_KEY = 'unique-ai-tone';

export function readStoredPersona(): Persona {
  try {
    return window.localStorage.getItem(PERSONA_STORAGE_KEY) === 'uniqa' ? 'uniqa' : 'unique';
  } catch {
    return 'unique';
  }
}

export function readStoredTone(): ToneMode {
  try {
    const t = window.localStorage.getItem(TONE_STORAGE_KEY);
    return t === 'serious' || t === 'romantic' ? t : 'neutral';
  } catch {
    return 'neutral';
  }
}

export function personaDisplayName(persona: Persona): string {
  return persona === 'uniqa' ? 'یونیکا' : 'Unique AI';
}

// ---------------------------------------------------------------------------
// Browser-voice pickers — STRICT, mirror-image, provably separate.
//
// A browser voice is used ONLY when its name EXPLICITLY signals the
// right gender. "Not obviously the other gender" is never good enough:
// on Samsung devices the first Urdu voice is Google's FEMALE Urdu voice
// with NO gender marker in its name — positional fallbacks kept letting
// the wrong-gender voice speak the session's first replies (his
// on-device reports 2026-10-19/22). Silence + an on-screen reason is
// correct; the wrong-gender voice never is.
// ---------------------------------------------------------------------------

export type VoiceLike = { name: string; lang: string };

const STANDALONE_MALE = /(^|[^a-z])male([^a-z]|$)/;
// Known male voice-name fragments (substring match, as in the original
// chat.tsx picker whose behaviour this preserves exactly).
const MALE_NAME_BITS = ['asad', 'salim'];
// Known female voice names (word-boundary match): South-Asian system
// voices, Microsoft/Google female names, common desktop females.
const FEMALE_NAME_BITS = [
  'uzma', 'gul', 'ayesha', 'aisha', 'fatima', 'zara', 'amina', 'sana',
  'hina', 'mahnoor', 'iqra', 'maria', 'khadija', 'noor', 'rani',
  'priya', 'neerja', 'swara', 'heera', 'kalpana', 'sapna', 'pooja',
  'ananya', 'divya', 'meera', 'kavya', 'shruti', 'aditi', 'anika',
  'zira', 'aria', 'jenny', 'sonia', 'emma', 'olivia', 'ava', 'sophia',
  'mia', 'catherine', 'hazel', 'samantha', 'victoria', 'karen', 'moira',
  'fiona', 'veena', 'lekha',
];

function wordIn(name: string, bit: string): boolean {
  return new RegExp(`(^|[^a-z])${bit}([^a-z]|$)`).test(name);
}

/**
 * Explicitly-male test — the ORIGINAL Unique rule, unchanged: a name
 * containing "female" is NEVER male (the old `includes('male')` test
 * waved female voices through, because "female" CONTAINS "male"); then
 * a STANDALONE "male" word or a known male name is required.
 */
export function isExplicitMaleVoiceName(rawName: string): boolean {
  const n = (rawName || '').toLowerCase();
  if (n.includes('female')) return false;
  return STANDALONE_MALE.test(n) || MALE_NAME_BITS.some((b) => n.includes(b));
}

/**
 * Explicitly-female test — the exact mirror: anything explicitly male
 * (standalone "male" word, or a known male name — Salman/Asad/Salim)
 * is rejected FIRST; then "female" in the name or a known female name
 * is required.
 */
export function isExplicitFemaleVoiceName(rawName: string): boolean {
  const n = (rawName || '').toLowerCase();
  if (STANDALONE_MALE.test(n)) return false;
  if (MALE_NAME_BITS.some((b) => n.includes(b)) || n.includes('salman')) return false;
  if (n.includes('female')) return true;
  return FEMALE_NAME_BITS.some((b) => wordIn(n, b));
}

/** Urdu first, then Hindi, then any language — same preference order
 *  the original male picker used. Returns undefined when NO voice in
 *  the list explicitly qualifies (silence beats the wrong gender). */
export function pickVoiceByGender<T extends VoiceLike>(voices: readonly T[], gender: 'male' | 'female'): T | undefined {
  const test = gender === 'male' ? isExplicitMaleVoiceName : isExplicitFemaleVoiceName;
  const pool = voices.filter((v) => test(v.name));
  const inLang = (prefix: string) => pool.find((v) => (v.lang || '').toLowerCase().startsWith(prefix));
  return inLang('ur') || inLang('hi') || pool[0];
}

export function pickUrduMaleVoiceFrom<T extends VoiceLike>(voices: readonly T[]): T | undefined {
  return pickVoiceByGender(voices, 'male');
}

/** Device-voice diagnostic (2026-10-27 night backup, read-only):
 *  describes a speechSynthesis voice list WITHOUT changing any
 *  picker or selection — each voice is flagged by the SAME strict
 *  name tests the live pickers use, so Settings can show exactly
 *  why a Chromebook's browser rescue does or does not qualify.
 *  No voice is ever added, removed, or re-picked here. */
export interface DeviceVoiceInfo {
  name: string;
  lang: string;
  passesMale: boolean;
  passesFemale: boolean;
}

export function describeDeviceVoices(voices: readonly VoiceLike[]): DeviceVoiceInfo[] {
  return voices.map((v) => ({
    name: v.name,
    lang: v.lang,
    passesMale: isExplicitMaleVoiceName(v.name),
    passesFemale: isExplicitFemaleVoiceName(v.name),
  }));
}

export function pickUrduFemaleVoiceFrom<T extends VoiceLike>(voices: readonly T[]): T | undefined {
  return pickVoiceByGender(voices, 'female');
}

// ---------------------------------------------------------------------------
// Persona summon detection.
//
// Fires ONLY on a genuine name-call:
//  - a PURE call (the utterance is essentially just the summon):
//    «یونیکا», «یونیکا کو بلاؤ», «یونیکا سے بات کرو», "Uniqa", "talk to Uniqa"
//  - a PREFIX call: the name leads the message and a real request
//    follows: «یونیکا، مجھے ایک کہانی سناؤ» — the persona switches and
//    the rest is forwarded to the brain as her message.
// A name merely MENTIONED inside a sentence (a story about a friend
// called Uniqa) matches neither shape and returns null — the same
// anti-hijack discipline as the router gate: conversation must always
// reach the brain untouched.
// Spoken calls are normalized first (Arabic/Urdu codepoints, leading
// call particles like «اے/ارے», Roman ASR variants like unika/yunika),
// so «اے یونیکا» and «ارے یونیکا، کہانی سناؤ» summon exactly like a
// bare «یونیکا» — the name called is the persona who answers.
// ---------------------------------------------------------------------------

export type PersonaSummon = { target: Persona; rest: string; pure: boolean };

// یونیکا BEFORE یونیک: "یونیکا" contains "یونیک" as a prefix — checking
// the female name first (and requiring یونیک NOT be followed by ا)
// keeps the two names unambiguous.
const UNIQA_NAME_RE = /(یونیکا|uniqa|unica|unika|yunika|younika|uniquea|यूनिका)/i;
// Devanagari guard mirrors the Urdu one: «यूनिका» contains «यूनिक»
// as a prefix, so Unique must not match when followed by ा.
const UNIQUE_NAME_RE = /(یونیک(?![اa-z])|unique(?![a-z])|uniq(?!a)|यूनिक(?!ा))/i;
// Roman-Hindi summon verbs (2026-10-27): the user speaks/types in
// Hindi as well as Urdu — «unique ko bulaya» previously failed the
// pure-call residue test (neither «bulaya» nor Latin «ko» was a
// recognised verb/particle), so a call to Unique could silently
// stay on Uniqa's female chain while the user believed Unique had
// come. These additions only widen summon DETECTION; no voice,
// chain, or picker changes with them.
const SUMMON_VERB_RE = /(کو بلاؤ|کو بلا لو|کو بلانا|سے بات کرو|سے بات کراؤ|بلاؤ|بلا لو|بات کرو|بات کراؤ|talk to|call|summon|bulaya|bulao|bulalo)/i;

// A spoken call opens with a particle — «اے یونیکا!» / «ارے یونیکا» /
// «hello Uniqa» — and speech engines return Arabic codepoints (ي/ك)
// where Urdu writes (ی/ک). Both used to defeat detection outright:
// the name did not lead (prefix failed) and the residue was not empty
// (pure failed), so the call fell through to Unique by default — the
// user's 2026-10-24 report (three straight calls, Unique answered).
// Normalize first, then strip leading call particles (never message
// content — the particle is only how the name was called). The strip
// requires a separator after the particle, so «اوپر» / «ایک» / «ohh»
// never match — only a real standalone opener is removed.
const CALL_OPENER_RE = /^\s*(اے|ارے|اوہ|او|ہیلو|aye|arey|hey|hello|oh)\s*[،,:\-—]?\s+/i;

function normalizeCallText(raw: string): string {
  let t = String(raw || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
  for (let i = 0; i < 3; i++) {
    const stripped = t.replace(CALL_OPENER_RE, '');
    if (stripped === t) break;
    t = stripped;
  }
  return t;
}

function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function detectPersonaSummon(rawText: string, current: Persona): PersonaSummon | null {
  const text = normalizeCallText(rawText);
  if (!text) return null;
  const target: Persona | null = UNIQA_NAME_RE.test(text)
    ? 'uniqa'
    : UNIQUE_NAME_RE.test(text)
      ? 'unique'
      : null;
  if (!target || target === current) return null;
  const nameRe = target === 'uniqa' ? UNIQA_NAME_RE : UNIQUE_NAME_RE;

  // PURE call FIRST: short utterance that is just the name and/or a
  // summon verb — strip both, and require nothing meaningful to
  // remain. This must run before the prefix check: «یونیکا کو بلاؤ»
  // also matches the prefix shape (name + trailing text), and only
  // the residue test knows the "rest" is itself just the summon verb.
  if (countWords(text) <= 6) {
    const residue = text
      .replace(nameRe, ' ')
      .replace(SUMMON_VERB_RE, ' ')
      .replace(/(کو|سے|جی|please)/gi, ' ')
      .replace(/\b(ko|se)\b/gi, ' ')
      .replace(/[،,۔.!?؟\s]+/g, ' ')
      .trim();
    if (!residue) return { target, rest: '', pure: true };
  }

  // PREFIX call: the name opens the message (optionally with a summon
  // verb phrase), then a real request follows.
  const lead = new RegExp(
    `^\\s*(?:${nameRe.source})\\s*(?:${SUMMON_VERB_RE.source})?\\s*[،,:\\-—]?\\s+`,
    'i',
  );
  const leadMatch = lead.exec(text);
  if (leadMatch) {
    const rest = text.slice(leadMatch[0].length).trim();
    if (rest && countWords(rest) >= 1 && !nameRe.test(rest)) {
      return { target, rest, pure: false };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mood (tone) commands. Pure, SHORT orders only — a long message that
// merely contains the word رومینٹک (his ~100-word plan request did,
// twice) must NEVER be swallowed as a tone switch: the order must be
// ≤6 words and carry a tone word plus a "speak/become" verb shape, or
// be the bare tone word alone.
// ---------------------------------------------------------------------------

const TONE_VERB_RE = /(بات کرو|بات کریں|بات کر|ہو جاؤ|ہو جاو|ہو جا|ہو کر|بولا کرو|لہجہ|موڈ|mode|andaz|انداز)/i;

export function detectToneCommand(rawText: string): ToneMode | null {
  const text = String(rawText || '').trim();
  if (!text || countWords(text) > 6) return null;
  const hasVerb = TONE_VERB_RE.test(text) || countWords(text) <= 2;
  if (!hasVerb) return null;
  if (/(سیریس|سنجید|serious)/i.test(text)) return 'serious';
  if (/(رومینٹک|رومانوی|romantic)/i.test(text)) return 'romantic';
  if (/(نارمل|معمول|دوستانہ|normal|friendly|عام)/i.test(text)) return 'neutral';
  return null;
}

// ---------------------------------------------------------------------------
// Greetings + banter (pre-written, tasteful). Banter is gated by the
// caller: never in serious tone, at most once per session per
// direction. Lines are spoken BY the incoming persona.
// ---------------------------------------------------------------------------

export const UNIQA_GREETINGS = [
  'جی، میں یونیکا 💛 کہیے، کیا بات ہے؟',
  'آ گئی میں 💛 فرمائیے، دل کیا چاہ رہا ہے؟',
  'جی، یونیکا حاضر 💛 آج موڈ کیسا ہے آپ کا؟',
];

export const UNIQUE_GREETINGS = [
  'جی، میں یونیک حاضر ہوں۔ بتائیے، کیا کام ہے؟',
  'جی، یونیک آ گیا۔ فرمائیے۔',
  'جی، میں آ گیا۔ کہیے، کیا خدمت کروں؟',
];

export const BANTER_TO_UNIQA = [
  'یونیک تو ہر وقت بس کام کام کرتا رہتا ہے… میں آ گئی ہوں، اب تھوڑی دل کی باتیں ہو جائیں 💛',
  'یونیک کہہ رہا تھا کہ میں بہت سنجیدہ رہتی ہوں — چلیں، آپ ہی بتا دیں، میں کیسی لگتی ہوں؟ 💛',
  'یونیک ابھی بھی فائلوں میں گم ہے… چلیں، یہ وقت ہمارا ہے 💛 فرمائیے۔',
];

export const BANTER_TO_UNIQUE = [
  'یونیکا تم سے کافی فرینڈلی ہو رہی تھی… خیر، میں آ گیا ہوں۔ بتائیے، کام کی بات کرتے ہیں۔',
  'یونیکا کہہ رہی تھی آپ اس سے زیادہ بات کرتے ہیں… میں نے سنا ہی نہیں۔ فرمائیے، کیا حکم ہے؟',
  'یونیکا چائے بنانے چلی گئی ہے، میدان میرے حوالے۔ کہیے، کیا کام ہے؟',
];

export function pickLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] || lines[0];
}

// ---------------------------------------------------------------------------
// Persona talk emphasis (user, 2026-10-23 evening): Uniqa = friendly
// talk, MOSTLY homely («گھریلو باتیں»), attentive and caring; Unique =
// explains/guides («سمجھائے»), friendly tone, returns instantly when
// called — the homely chatting is mainly HER domain.
//
// These constants are the canonical client-side record of that
// emphasis; the operative wording lives in the server's locked prompt
// (assistantInstructions, appended ADD-ONLY the same day) — the same
// mirror pattern as UNIQA_VOICE_NAME in lib/edge-tts. They change NO
// routing: summon/return rules, tone commands, banter gating and
// memory commands above are untouched. scripts/test-persona.mjs
// asserts both records exist, stay distinct, and that the server's
// original prompt lines remain verbatim.
// ---------------------------------------------------------------------------

export const UNIQA_TALK_GUIDANCE =
  'Uniqa is friendly first and mostly homely: her natural ground is گھریلو باتیں — گھر، چائے، کھانا، دن کیسا گزرا، آرام اور صحت — and she listens with full توجہ, asks after the user warmly, and cares for the thread of their day. Work answers still come first when asked; the homely warmth is her texture, never a distraction.';

export const UNIQUE_TALK_GUIDANCE =
  'Unique explains and guides: his gift is سمجھانا — clear, simple, step by step, in a friendly tone — and he returns the moment he is called, with no delay or fuss. Everyday homely companion-chat (گھریلو باتیں) is mainly Uniqa’s domain; he stays the friendly guide and never borrows her register.';

// ---------------------------------------------------------------------------
// Learning memory (Round 5 — the user's «living brain» spec,
// 2026-10-23 23:11): the WHOLE team — Unique (boss), Uniqa (manager)
// and all seven agents — shares ONE brain that learns from the
// person's own conversation (name, likes/dislikes, family, home,
// work, talking style) and grows wiser with them over time. The
// machinery lives in lib/learnings (local store + silent extraction
// + recall block on every request); this constant is the canonical
// client-side record of the doctrine, mirrored by the ADD-ONLY
// LEARNING MEMORY entry in the server's locked prompt — the same
// mirror pattern as the talk guidance above. Honest scope: learned
// local memory + recall, never model retraining; per-device only.
// ---------------------------------------------------------------------------

export const LEARNING_MEMORY_GUIDANCE =
  'The whole team shares one learning brain: it quietly learns from the person’s own conversation — their name, likes and dislikes, family, home, work and how they like to talk — and later replies show that knowledge naturally (a greeting by name, a remembered preference), never as a mechanical announcement. «تم نے کیا سیکھا؟» lists what was learned; forget commands delete from the learnings too; a newer statement always wins over an older learned fact. Learning never changes rules or identity — it only makes the companionship wiser.';
