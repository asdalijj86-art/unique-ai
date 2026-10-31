// Unique AI smart brain — intent classification for chat messages.
//
// Rule-based (zero Gemini quota): classifies the latest user message into
//   - "open_website"  → "یوٹیوب کھولو" / "youtube kholo" / "open youtube"
//   - "chat"          → everything else (normal Gemini conversation)
// (The old "build_project" website-builder intent was removed entirely
// on the user's order, 2026-10-22.)
//
// Gesture commands ("gesture_command") are emitted client-side by the hand
// tracking system, not from chat text, so the text classifier never returns it.
//
// The sacred system prompt in index.js is never modified here — this module
// only decides which action (if any) accompanies the reply.

import { parseWebsiteCommand } from './site-commands.js';
import {
  parseTimerRequest as parseTimer,
  parseNoteSave as parseNoteText,
  parseCurrencyRequest,
  parseUnitConvert,
  evaluateMath,
  normalizeMathExpression,
} from './tools.js';

// --- language detection -----------------------------------------------------
// 'ur' = Perso-Arabic script (Urdu), 'ar' = Arabic, 'roman' = Roman Urdu, 'en' = English.
// Urdu and Arabic share the Arabic script range — Urdu-specific letters
// (ٹ ڈ ڑ ں ھ ے ۓ) mark Urdu; common Arabic words mark Arabic.
const URDU_RANGE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const URDU_SPECIFIC = /[ٹڈڑںھےۓ]/;
const ARABIC_WORDS = /(مرحبا|اهلا|أهلا|شكرا|كيف|ماذا|لماذا|أين|اين|متى|متي|صباح|مساء|الخير|من فضلك|لو سمحت|بالتأكيد|ربما|دائما|أبدا|شيء|أشياء|جميل|رائع|ممتاز|صديق|عائلة|وقت|يوم|سنة|كتاب|مدرسة|جامعة|عمل|مال|بيت|سيارة|طعام|ماء|حبيبي|حبيبتي)/;
const ROMAN_URDU_WORDS = new Set([
  'mujhe', 'mujhay', 'mera', 'meri', 'mere', 'aap', 'tum', 'tumhara', 'tumhari',
  'kya', 'kaisa', 'kaisi', 'kaise', 'hai', 'hain', 'tha', 'thi', 'theen',
  'karna', 'karo', 'karen', 'kijiye', 'kholo', 'khol', 'kholein',
  'batao', 'bataen', 'batayen', 'sunao', 'sunayen', 'likho', 'likhen',
  'banao', 'banayen', 'banaiye', 'dekho', 'dekhen', 'chalao', 'chalayen',
  'phir', 'pehle', 'liye', 'nahi', 'nahin', 'acha', 'achha', 'theek',
  'shukriya', 'walekum', 'assalam', 'khuda', 'hafiz', 'meherbani',
  'ka', 'ki', 'ke', 'ko', 'mein', 'lagao', 'lagana', 'lagado', 'chahiye',
  'wala', 'wali', 'walay', 'kitna', 'kitne', 'kitni', 'dikhao', 'baj',
  'baje', 'waqt', 'mausam', 'khabar', 'khabrein',
]);

export function detectLanguage(text) {
  const t = String(text || '');
  if (URDU_RANGE.test(t)) {
    if (URDU_SPECIFIC.test(t)) return 'ur';
    if (ARABIC_WORDS.test(t)) return 'ar';
    return 'ur'; // default: user's main language
  }
  const words = t.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'ur';
  const romanHits = words.filter((w) => ROMAN_URDU_WORDS.has(w)).length;
  if (romanHits >= 1 && romanHits / words.length >= 0.2) return 'roman';
  return 'en';
}

// --- build verbs (used by the android-app build check below) ---------------
const BUILD_VERBS = [
  'بناؤ', 'بنا دو', 'بنائیں', 'بنا کر دو', 'تیار کرو', 'تیار کریں',
  'banao', 'bana do', 'bana de', 'banayen', 'banaiye', 'tayyar karo',
  'create', 'build', 'make', 'develop', 'design',
];


// --- multi-step detection ---------------------------------------------------
const MULTISTEP_HINTS = [
  'پہلے', 'پھر', 'آخر میں', 'step by step', 'steps میں', 'مرحلہ',
  'step 1', 'پہلا قدم', 'ایک ایک کر کے',
];

export function isMultiStep(text) {
  const t = String(text || '');
  const hits = MULTISTEP_HINTS.filter((h) => t.toLowerCase().includes(h.toLowerCase()));
  if (hits.length >= 1) return true;
  // "A aur B" with two action verbs often means two tasks.
  const actionVerbs = ['بناؤ', 'banao', 'کھولو', 'kholo', 'بتاؤ', 'batao', 'لکھو', 'likho', 'build', 'create', 'open', 'tell', 'write'];
  const found = actionVerbs.filter((v) => t.toLowerCase().includes(v.toLowerCase()));
  return found.length >= 2;
}

// --- tool intent extraction helpers ---------------------------------------
// Each returns a payload for its intent, or null when the message does not
// actually carry the needed data.

const APP_KEYWORDS = [
  'android', 'اینڈرائیڈ', 'موبائل ایپ', 'mobile app', 'اپلیکیشن',
  'application', 'اے پی پی',
];
const WEBSITE_NOUNS_FOR_APP_CHECK = [
  'ویب سائٹ', 'ویبسائٹ', 'website', 'ویب', 'web', 'سائٹ', 'site', 'پیج', 'page',
];

/** "android app banao" → true, but "website banao" stays a web build. */
export function containsAppBuildIntent(normalized) {
  const hasApp = APP_KEYWORDS.some((k) => normalized.includes(k.toLowerCase()));
  if (!hasApp) return false;
  const hasBuildVerb = BUILD_VERBS.some((v) => normalized.includes(v.toLowerCase()));
  if (!hasBuildVerb) return false;
  // "website" wins: "website jaisi app" is still a website.
  const hasWebsiteNoun = WEBSITE_NOUNS_FOR_APP_CHECK.some((n) =>
    normalized.includes(n.toLowerCase())
  );
  // If BOTH app and website nouns appear, website wins (existing behavior).
  if (hasWebsiteNoun) return false;
  return true;
}

/** Extract a short app description from the user message. */export function extractAppDescription(text) {
  let d = String(text || '').trim().replace(/[.؟?!,۔]+$/g, '').trim();
  d = d
    .replace(/^(میرے لیے|میرے لئے|mere liye|please|براہ کرم|براہِ کرم)\s+/i, '')
    .replace(/^(android|اینڈرائیڈ|mobile app|موبائل ایپ|اپلیکیشن|application|اے پی پی|app|ایپ)\s+/i, '')
    .replace(/\s+(بناؤ|بنا دو|بنائیں|banao|bana do|banayen|create|build|make|develop|design)\s*$/i, '')
    .replace(/\s+(android|اینڈرائیڈ|mobile app|موبائل ایپ|اپلیکیشن|application|اے پی پی|app|ایپ)\s*$/i, '')
    // "app banao X" / "banao X app" leftovers in the middle
    .replace(/^(app|ایپ)\s+(banao|بنا دو|بناؤ)\s+/i, '')
    .trim();
  return d || text.trim();
}

/** Clean a build order into the thing's description/title. */
export function extractBuildDescription(text) {
  let d = String(text || '').trim().replace(/[.؟?!,۔]+$/g, '').trim();
  d = d
    .replace(/^(میرے لیے|میرے لئے|mere liye|please|براہ کرم|براہِ کرم)\s+/i, '')
    .replace(/^(ایک|ek)\s+/i, '')
    .replace(/^(build|create|make|develop|design)\s+(a\s+|an\s+|the\s+)?/i, '')
    .replace(/\s+(بنا دو|بناؤ|بنائیں|بنا کر دو|تیار کرو|تیار کر دو|تیار کریں|bana do|banao|banayen|tayyar karo|build|create|make|develop|design)\s*$/i, '')
    .trim();
  return d || String(text || '').trim();
}

// --- brain builder orders (Phase 3) -----------------------------------------
// A build ORDER = a build verb + a BUILDABLE noun (game / software /
// app / website / AI / tool…). This is احمد's generic workshop behind
// the conversation — NOT the deleted website-builder tool and NOT the
// PWA AppBuilder («موبائل ایپ» / "android app" still route to the
// android_app branch above, untouched). A long or conversational
// message can never reach here (the class gate in classifyIntent),
// and a bare «بنا دو» with a non-buildable object («کھانا بنا دو»,
// «ایک کہانی بنا دو») is conversation, not an order.
export function parseBuildOrder(text) {
  const message = String(text || '').trim();
  if (!message) return null;
  const normalized = message.toLowerCase();
  const hasVerb = BUILD_VERBS.some((v) => normalized.includes(v.toLowerCase()));
  if (!hasVerb) return null;
  let kind = null;
  if (/(vpn|وی پی این|وی‌پی‌این)/i.test(message)) kind = 'vpn_interface';
  else if (/(گیم|کھیل|\bgame\b)/i.test(message)) kind = 'game';
  else if (/(اے آئی|مصنوعی ذہانت|چیٹ بوٹ|chatbot|\bai\b)/i.test(message)) kind = 'ai';
  else if (/(ویب سائٹ|ویبسائٹ|website|web site|ویب پیج|webpage)/i.test(message)) kind = 'website';
  else if (/(سافٹ ویئر|سافٹویئر|software|ایپ|\bapp\b|ٹول|\btool\b|گھڑی|\bclock\b|کیلکولیٹر|calculator)/i.test(message)) kind = 'app';
  if (!kind) return null;
  return { description: extractBuildDescription(message), kind };
}

// «میرا کام کہاں تک پہنچا؟» — a status ask needs BOTH a progress word
// AND a build-context word, so ordinary chat («چائے بن گئی؟», «میرا
// ہوم ورک ہو گیا») is never mistaken for it. The server answers only
// when a job actually exists; otherwise the message falls through to
// normal chat untouched.
const BUILD_STATUS_WORD = /(کہاں تک پہنچ|کتنا ہو گیا|کتنا بن گیا|بن گیا|بن گئی|بن چکا|بن چکی|بنی ہے|بنی کیا|تیار ہو گیا|ہو گیا کیا|status|progress|ready)/i;
const BUILD_CONTEXT_WORD = /(میرا کام|میری چیز|کام|گیم|کھیل|سافٹ ویئر|سافٹویئر|software|game|ایپ|\bapp\b|ویب سائٹ|ویبسائٹ|website|چیز|بلڈ|build)/i;
export function parseBuildStatusQuery(text) {
  const message = String(text || '').trim();
  if (!message) return false;
  return BUILD_STATUS_WORD.test(message) && BUILD_CONTEXT_WORD.test(message);
}

/** "لاہور کا نقشہ دکھاؤ" → { url: maps search, displayName }. */
export function parseMapCommand(text) {
  const t = String(text || '');
  if (!/(نقشہ|map|میپ)/i.test(t)) return null;
  if (!/(دکھاؤ|dikhao|دیکھو|dekho|کھولو|kholo|دکھائیں)/i.test(t)) return null;
  // Extract the place: "X کا نقشہ" / "map of X" / "X map".
  let place = '';
  let m = t.match(/(.+?)\s*(کا|کی|ka|ki)\s*(نقشہ|map|میپ)/i);
  if (m && m[1]) place = m[1].trim();
  if (!place) {
    m = t.match(/map\s+of\s+(.+)/i);
    if (m && m[1]) place = m[1].trim();
  }
  if (!place) {
    place = t
      .replace(/(نقشہ|map|میپ)\s*/gi, ' ')
      .replace(/(دکھاؤ|dikhao|دیکھو|dekho|کھولو|kholo|دکھائیں|کا|کی|ka|ki)\s*/gi, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  if (!place) return null;
  return {
    url: `https://www.google.com/maps/search/${encodeURIComponent(place)}`,
    displayName: 'گوگل میپس',
    isSearchFallback: false,
    mapQuery: place,
  };
}

/** Find a math expression like "25*4", "100 + 50", "(3+2)*4" in the text. */
export function extractMathExpression(text) {
  const t = String(text || '');
  // Look for digit-led runs containing an operator.
  const m = t.match(/(\d[\d\s.,()]*[+\-*/×÷%^][\d\s.,()+*\-/×÷%^()]+)/);
  if (!m) return null;
  const expr = normalizeMathExpression(m[1]).replace(/\s+/g, '');
  if (!expr || !/\d/.test(expr)) return null;
  const check = evaluateMath(expr);
  return check.ok ? expr : null;
}

/** "لاہور کا موسم" / "weather in Karachi" → "لاہور" / "Karachi". */
function extractCityAfterPattern(text, patterns) {
  const t = String(text || '');
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1] && m[1].trim()) return m[1].trim();
  }
  return '';
}

export function extractCityForWeather(text) {
  const city = extractCityAfterPattern(text, [
    /(.+?)\s*(کا|کی|ka|ki)\s*(موسم|mausam|weather)/i,
    /weather\s+in\s+(.+)/i,
    /موسم\s+(.+?)\s*کا/i,
  ]);
  return city || 'لاہور';
}

export function extractCityForPrayer(text) {
  const t = String(text || '');
  // "X میں نماز کے اوقات" → X
  let m = t.match(/(.+?)\s+(میں|mein|in)\s+(نماز|prayer|اذان)/i);
  if (m && m[1].trim() && !/^(نماز|پڑھنے|کے|اوقات)/.test(m[1].trim())) return m[1].trim();
  // "نماز کے اوقات X" → X (trailing city)
  m = t.match(/(نماز|prayer)\s+(کے اوقات|ke auqat|timings?)?\s*(.+)$/i);
  if (m && m[3]) {
    const city = m[3].replace(/(میں|mein|in|بتاؤ|batao|کیا|ہیں).*/i, '').trim();
    if (city && !/^(کے|اوقات|auqat)/.test(city)) return city;
  }
  return 'لاہور';
}

export function extractCityForClock(text) {
  const t = String(text || '');
  // "X میں ٹائم کیا ہے" → X
  let m = t.match(/(.+?)\s+(میں|mein)\s+(ٹائم|وقت|time)/i);
  if (m && m[1].trim()) return m[1].trim();
  m = t.match(/time\s+in\s+([a-zA-Z ]+)/i);
  if (m && m[1].trim()) return m[1].trim();
  return '';
}

/** "youtube par X search karo" → "X". */
export function extractYoutubeQuery(text) {
  let t = String(text || '').trim();
  t = t
    .replace(/(youtube|یوٹیوب)\s*(پر|par|pe|on)?\s*/i, '')
    .replace(/\s*(search|تلاش|کرو|karo|karen|کریں|video|ویڈیو|dikhao|دکھاؤ|dekho|دیکھو)\s*/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return t || null;
}

/** "بلی کی تصویر دکھاؤ" → "بلی". */
export function extractImageQuery(text) {
  let t = String(text || '').trim();
  t = t
    .replace(/(تصویر|تصویریں|tasveer|image|photo|picture)s?\s*(کی|کا|کے|ki|ka|ke|of)?\s*/gi, ' ')
    .replace(/\s*(کی|کا|کے)\s*$/gi, '')
    .replace(/\s*(دکھاؤ|dikhao|dekho|دیکھو|search|تلاش|کرو|karo|karen|کریں)\s*/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return t || null;
}

/** "youtube ke liye comedy ideas" → niche hint. */
export function extractNiche(text) {
  let t = String(text || '').trim();
  t = t
    .replace(/(یوٹیوب کے لیے|youtube ke liye|trending|وائرل|viral|آئیڈیا|ideas?|video|ویڈیو|shorts?|شارٹ|دو|de|do)\s*/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return t;
}

/** "QR banao https://x ka" → the data part. */
export function extractQrData(text) {
  const t = String(text || '').trim();
  const urlMatch = t.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) return urlMatch[0];
  const colon = t.indexOf(':');
  if (colon !== -1 && t.slice(colon + 1).trim()) return t.slice(colon + 1).trim();
  const cleaned = t
    .replace(/(qr|کیو آر)\s*(code|کوڈ)?\s*(banao|بناؤ|bana|do|بنائیں)?\s*/i, '')
    .replace(/\s*(کا|ki|ka)\s*$/i, '')
    .trim();
  return cleaned || null;
}

export function tryParseUnitConvert(text) {
  try {
    return parseUnitConvert(text);
  } catch {
    return null;
  }
}

/** "X ko English me batao" / "ترجمہ کرو: X" → {text, target}. */
export function parseTranslateRequest(text) {
  const t = String(text || '').trim();
  let target = null;
  if (/(انگریزی|english)/i.test(t)) target = 'en';
  else if (/(عربی|arabic)/i.test(t)) target = 'ar';
  else if (/(اردو|urdu)/i.test(t)) target = 'ur';
  if (!target) return null;
  const colon = t.indexOf(':');
  let src = colon !== -1 ? t.slice(colon + 1).trim() : t
    .replace(/(translate|ترجمہ|tarjuma)\s*(کرو|karo|karen|کریں)?\s*/i, '')
    .replace(/\s*(کو|ko)\s*(انگریزی|اردو|عربی|english|urdu|arabic)\s*(میں|mein|me)?\s*/i, ' ')
    .replace(/\s*(میں بتاؤ|mein batao|میں بتلاؤ)\s*/i, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!src) return null;
  return { text: src, target };
}

/** Pull the first http(s) URL out of the message. */
export function extractPageUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s\u0600-\u06FF]+/i);
  return m ? m[0].replace(/[.,؟?]+$/, '') : null;
}

/** "X search karo" / "X کے بارے میں بتاؤ" → "X". */
export function extractSearchQuery(text) {
  const t = String(text || '').trim();
  const lower = t.toLowerCase();
  // "google par X ..." → X (strip the google prefix first)
  const googlePrefixed = t.match(/^(google|گوگل)\s*(پر|par|pe|on)?\s+(.+)$/i);
  const working = googlePrefixed ? googlePrefixed[3].trim() : t;
  const triggers = [
    /(.*)\s*(search karo|سرچ کرو|تلاش کرو|google karo|گوگل کرو)/i,
    /(.*)\s*(کے بارے میں بتاؤ|ke bare mein batao|ke baare mein batao)/i,
  ];
  for (const re of triggers) {
    const m = working.match(re);
    if (m) {
      const q = (m[1] || '').trim();
      if (q) return q;
    }
  }
  if (!lower.includes('search') && !/تلاش|گوگل/.test(t)) return null;
  const cleaned = working
    .replace(/(search|سرچ|تلاش|google|گوگل)\s*(کرو|karo|karen|کریں|par|پر)?\s*/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

// --- command-shape gate (router-hijack fix, 2026-10-22) --------------------
// Canned rule-based commands (open a tool / open Quran / recite / build …)
// may hijack a message ONLY when it is command-shaped: SHORT, the way a
// person actually phrases an order («قرآن پاک کھولو», «سورۃ ناس سناؤ»,
// "5 minute ka timer lagao"). A long or conversational message that
// merely MENTIONS a surah name, a tool or a buildable thing is a
// conversation for the chat brain — never a canned command.
//
// The bug this fixes: the user's ~100-word request for a written plan
// (which contained the word «رومینٹک», "romantic") was answered with
// «جی، قرآن پاک کھول رہا ہوں۔» because the old Quran rule substring-
// matched «روم» (Surah Ar-Rum) inside «رومینٹک» — and that rule had no
// intent gate at all.
export const COMMAND_WORD_LIMIT = 12;

export function wordCountOf(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function isCommandShaped(text, limit = COMMAND_WORD_LIMIT) {
  const n = wordCountOf(text);
  return n > 0 && n <= limit;
}

// --- video-maker order (DENIAL FIX, 2026-10-29) ---------------------------
// Mirror of the client matcher in lib/video-maker.ts (same semantics,
// kept in sync by tests on both sides). A video order is an EXPLICIT
// order, not a mere mention, so it bypasses the command-shape gate:
// the 2026-10-29 live denial was a 17-word order («ابھی جو کچھ کہ
// میں نے بھیجا ہے نا ٹھیک ہے یہ ویڈیو بنا کے دو مجھے») that the
// 12-word gate rejected into plain chat, where the model invented
// "no video maker engine". This runs for ANY persona — classifyIntent
// takes no persona argument, so Uniqa and Unique route identically.
// Package / upload / app-build orders and "how is a video made"
// questions are excluded here, exactly as on the client.
export function isVideoMakerOrder(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  // CHAT-ONLY FLOW (2026-10-29, user acceptance): a story prompt
  // pasted straight into chat — two or more speaker-labelled lines
  // — IS itself the video order, even with no «ویڈیو بناؤ» words.
  const speakerLines = t.split('\n').filter((line) => {
    const m = /^([^:\n]{1,30}):\s*\S/.exec(line.trim());
    return Boolean(m) && !/(ویڈیو|video|بناؤ|بنا|make|create)/i.test(m[1]);
  });
  if (speakerLines.length >= 2
    && !/(اسکرپٹ لکھو|script likho|ٹائٹل بتاؤ|title batao|ہیش ٹیگ|hashtag|ویڈیو کا پلان|video ka plan|ویڈیو پیکج|video package|پیکج بناؤ|package banao|پیکج بنا دو)/i.test(t)) return true;
  if (!/(ویڈیو|video)/i.test(t)) return false;
  if (/(اسکرپٹ لکھو|script likho|ٹائٹل بتاؤ|title batao|ہیش ٹیگ|hashtag|ویڈیو کا پلان|video ka plan|ویڈیو پیکج|video package|پیکج بناؤ|package banao|پیکج بنا دو)/i.test(t)) return false;
  if (/(اپلوڈ|upload|لگاؤ|lagao)/i.test(t)) return false;
  if (/(ایپ|گیم|سافٹ ویئر|ویب سائٹ|app|game|software|website)/i.test(t)) return false;
  if (/(کیسے|طریقہ|how to|طریقہ کار)/i.test(t)) return false;
  if (/(بن رہی|بن گئی|بن گیا|کہاں تک|کتنا ہو)/i.test(t)) return false;
  if (/(بناؤ|بنا|بنائیں|بنائیے|banao|bana|banado|make|create|میکر|maker)/i.test(t)) return true;
  if (/(جو.*بھیجا|جو کچھ|اس کی|اسی کی|یہ والی|jo bheja|is ki)/i.test(t)) return true;
  return false;
}

// --- Quran command detection -------------------------------------------------
// An explicit Quran reference (the word قرآن / سورت / تلاوت …) OR a surah
// NAME matched as a whole TOKEN — never as a substring of a longer word
// («رومینٹک» is not «روم», «ملکیت» is not «ملک»). Even then, a canned
// open/recite fires only on command shape: an intent verb, or an
// utterance that is essentially just the reference itself.
const QURAN_STRONG_REF = /(قرآن|قران|quran|تلاوت|tilawat|سورت|سورۃ|سورة|سورہ|surah|پارہ|آیت|ayah|ayat)/i;
const QURAN_COMMAND_VERB = /(کھول|کھولو|کھولیں|دکھا|دکھاؤ|سنا|سناؤ|پڑھ|شروع|open|play|recite|listen|sunao|parho|dikhao)/i;

// Surah names (Urdu/Arabic script), normalized like the client parser:
// diacritics stripped, ي→ی, ك→ک, ة/ۀ→ہ, أإآ→ا, ى→ی.
const SURAH_NAME_LIST = [
  'الفاتحہ', 'البقرہ', 'آل عمران', 'النساء', 'المائدہ', 'الانعام', 'الاعراف',
  'الانفال', 'التوبہ', 'یونس', 'ہود', 'یوسف', 'الرعد', 'ابراہیم', 'الحجر',
  'النحل', 'بنی اسرائیل', 'الکہف', 'مریم', 'طہ', 'الانبیاء', 'الحج',
  'المومنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنکبوت',
  'الروم', 'لقمان', 'السجدہ', 'الاحزاب', 'سبا', 'فاطر', 'الصافات', 'الزمر',
  'المومن', 'حم سجدہ', 'الشوری', 'الزخرف', 'الدخان', 'الجاثیہ', 'الاحقاف',
  'محمد', 'الفتح', 'الحجرات', 'ق', 'الذاریات', 'الطور', 'النجم', 'القمر',
  'الرحمن', 'الواقعہ', 'الحدید', 'المجادلہ', 'الحشر', 'الممتحنہ', 'الصف',
  'الجمعہ', 'المنافقون', 'التغابن', 'الطلاق', 'التحریم', 'الملک', 'القلم',
  'الحاقہ', 'المعارج', 'نوح', 'الجن', 'المزمل', 'المدثر', 'القیامہ',
  'الدہر', 'المرسلات', 'النبا', 'النازعات', 'عبس', 'التکویر', 'الانفطار',
  'المطففین', 'الانشقاق', 'البروج', 'الطارق', 'الاعلی', 'الغاشیہ', 'الفجر',
  'البلد', 'الشمس', 'اللیل', 'الضحی', 'الشرح', 'التین', 'العلق', 'القدر',
  'البینہ', 'الزلزال', 'العادیات', 'القارعہ', 'التکاثر', 'العصر', 'الہمزہ',
  'الفیل', 'قریش', 'الماعون', 'الکوثر', 'الکافرون', 'النصر', 'اللہب',
  'الاخلاص', 'الفلق', 'الناس', 'یٰسین', 'یاسین', 'الاسراء', 'غافر', 'فصلت', 'تبارک',
  'الانسان', 'الانشراح', 'المسد', 'الحمد',
];

function normalizeArabicTokens(text) {
  return String(text || '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةۀ]/g, 'ہ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ی')
    .replace(/[،۔؟?!.,«»"'()؛:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SURAH_NAME_CANDIDATES = (() => {
  const set = new Set();
  for (const raw of SURAH_NAME_LIST) {
    const norm = normalizeArabicTokens(raw);
    if (!norm) continue;
    set.add(norm);
    const loose = norm.replace(/^ال/, '');
    if (loose && loose !== norm && loose.length >= 2) set.add(loose);
  }
  return set;
})();

/** True when a surah name appears as a whole token (or token pair). */
export function mentionsSurahNameToken(text) {
  const tokens = normalizeArabicTokens(text).split(' ').filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    if (SURAH_NAME_CANDIDATES.has(tokens[i])) return true;
    if (i + 1 < tokens.length && SURAH_NAME_CANDIDATES.has(`${tokens[i]} ${tokens[i + 1]}`)) return true;
  }
  return false;
}

/**
 * True only when `text` is a genuine Quran open/recite COMMAND:
 * command-shaped, with an explicit reference or a token-matched surah
 * name, plus an intent verb (or an utterance that is just the reference).
 */
export function isQuranCommand(text) {
  const message = String(text || '').trim();
  if (!isCommandShaped(message)) return false;
  const words = wordCountOf(message);
  const hasVerb = QURAN_COMMAND_VERB.test(message);
  if (QURAN_STRONG_REF.test(message)) {
    return hasVerb || words <= 3;
  }
  if (mentionsSurahNameToken(message)) {
    return hasVerb || words <= 3;
  }
  return false;
}

// --- main classifier --------------------------------------------------------
/**
 * Classify the latest user message.
 * Returns { intent, ...payload } where intent is one of
 * "open_website" | "calculator" | "timer" | "currency" | "weather" |
 * "youtube_search" | "news" | "social_news" | "notes_save" | "notes_list" | "web_search" |
 * "prayer_times" | "translate" | "unit_convert" | "qr_code" |
 * "youtube_trending" | "world_clock" | "read_webpage" |
 * "android_app" | "build_app" | "build_status" |
 * "media_tool" | "video_creator" | "chat".
 */
export function classifyIntent(text) {
  const message = String(text || '').trim();
  if (!message) return { intent: 'chat' };
  // TOOLS REMOVED 2026-10-31 by user order, CANVA REMOVED 2026-10-31
  // ~00:46 by user order: every tool intent is disabled at the brain
  // gate. The app answers as chat only. The ONE new tool that remains
  // is DesignStudio (client/src/components/DesignStudio.tsx), opened
  // by a client-side intercept in chat.tsx — NOT through this gate,
  // so it is not restored here and no Canva route remains. Full
  // old-tool code is backed up at
  // ~/workspace/unique-ai-backups/tools-version-2026-10-31/.
  return { intent: 'chat' };

  // Quran Pak wins over website commands — "قرآن کھولو" opens our in-app
  // Quran panel (with Urdu translation + voice), not an external site.
  // GATED (router-hijack fix): only a command-shaped utterance with a
  // real reference + intent reaches this — never a bare substring of a
  // surah name inside an unrelated long message (see isQuranCommand).
  if (isQuranCommand(message)) {
    return { intent: 'media_tool', tool: 'quran' };
  }

  // Website commands win over everything ("youtube kholo" is not a build).
  // parseWebsiteCommand full-string-matches an open-verb structure, so a
  // long conversational message cannot match it by accident.
  const website = parseWebsiteCommand(message);
  if (website) {
    return { intent: 'open_website', website };
  }

  // Video-maker orders win over the command-shape gate below (DENIAL
  // FIX, 2026-10-29): an explicit video order at ANY length, from
  // ANY persona, opens the in-app Video Maker — it must never fall
  // through to the chat model, which invented "no video maker
  // engine" for a 17-word order the gate had rejected. The client
  // intercepts these orders locally too (and prefills / auto-starts
  // the maker from the previous message when the order refers to
  // it); this server pre-gate is the second layer for any path that
  // reaches /api/openai/chat directly.
  if (isVideoMakerOrder(message)) {
    return { intent: 'media_tool', tool: 'video_maker' };
  }

  // CLASS GATE (router-hijack fix): everything below is a canned
  // rule-based command (calculator, weather, media tools, builders …).
  // A long or conversational message is NEVER hijacked into one of
  // these — it passes through to the chat brain untouched.
  if (!isCommandShaped(message)) return { intent: 'chat' };

  const normalized = message.toLowerCase();

  // --- calculator: math expression or explicit calculate words ---------------
  const mathExpr = extractMathExpression(message);
  if (mathExpr) return { intent: 'calculator', expression: mathExpr };
  if (/(calculate|حساب کرو|کیلکولیٹ|گننا|hisab)/.test(normalized) && /\d/.test(message)) {
    const fallbackExpr = extractMathExpression(normalized.replace(/[^0-9+\-*/×÷%().\s]/g, ' '));
    if (fallbackExpr) return { intent: 'calculator', expression: fallbackExpr };
  }

  // --- timer -----------------------------------------------------------------
  if (/(timer|ٹائمر|countdown|الارم)/.test(normalized)) {
    const timer = parseTimer(message);
    if (timer) return { intent: 'timer', timer };
  }

  // --- currency ----------------------------------------------------------------
  if (/(dollar|ڈالر|rupees|روپے|euro|یورو|pound|پاؤنڈ|riyal|ریال|dirham|درہم|dinar|دینار|yen|ین|yuan|یوان|currency|کرنسی|usd|pkr|eur|gbp|sar|aed)/.test(normalized)
      && /\d/.test(message)) {
    const conv = parseCurrencyRequest(message);
    return { intent: 'currency', currency: conv };
  }

  // --- prayer times -------------------------------------------------------------
  if (/(نماز|prayer|اذان|azan|نمایز|فجر|ظہر|عصر|مغرب|عشاء)/.test(normalized)
      && /(اوقات|وقت|ٹائم|time|timing|اذان کا)/.test(normalized)) {
    return { intent: 'prayer_times', city: extractCityForPrayer(message) };
  }

  // --- weather --------------------------------------------------------------------
  if (/(موسم|mausam|weather)/.test(normalized)) {
    return { intent: 'weather', city: extractCityForWeather(message) };
  }

  // --- world clock -----------------------------------------------------------------
  if (/(ٹائم کیا ہے|وقت کیا ہے|time in|kitne baj|کتنے بجے|بجے ہیں|ٹائم بتاؤ)/.test(normalized)) {
    const city = extractCityForClock(message);
    if (city) return { intent: 'world_clock', city };
  }

  // --- youtube search --------------------------------------------------------------
  if (/(youtube|یوٹیوب)/.test(normalized)
      && /(search|تلاش|video|ویڈیو|dikhao|دکھاؤ|dekho|دیکھو)/.test(normalized)) {
    const q = extractYoutubeQuery(message);
    if (q) return { intent: 'youtube_search', query: q };
  }

  // --- image search ------------------------------------------------------------------
  if (/(تصویر|تصویریں|tasveer|image|photo|picture)/.test(normalized)
      && /(دکھاؤ|dikhao|dekho|دیکھو|search|تلاش)/.test(normalized)) {
    const q = extractImageQuery(message);
    if (q) return { intent: 'image_search', query: q };
  }

  // --- youtube trending / video ideas ------------------------------------------------
  if (/(trending|وائرل|viral|آئیڈیا|idea).*(video|ویڈیو|short|شارٹ)|(video|ویڈیو).*(idea|آئیڈیا|trending|وائرل)/.test(normalized)
      || /(یوٹیوب کے لیے|youtube ke liye)/.test(normalized)) {
    return { intent: 'youtube_trending', niche: extractNiche(message) };
  }

  // --- social-media live news (Hamza, media agent) -------------------------------
  // "Social media par is waqt kya chal raha hai" — live news from social
  // platforms. NOT video ideas (those stay youtube_trending above) and
  // NOT plain headlines (news below): it needs a social/trending marker
  // plus a news/running-now marker, or an explicit social-media ask.
  // Runs BEFORE news so a social ask never collapses into plain news.
  const socialNewsAsk =
    /(social|سوشل).*(media|میڈیا|خبر|khabar|news|viral|وائرل|trending|ٹرینڈنگ|chal raha|چل رہا|chal rahi|چل رہی)/.test(normalized)
    || /(viral|وائرل|trending|ٹرینڈنگ).*(khabar|خبر|news)/.test(normalized)
    || (/(is waqt|اس وقت)/.test(normalized)
      && /(chal raha|چل رہا|chal rahi|چل رہی)/.test(normalized)
      && /(social|سوشل|media|میڈیا|khabar|خبر|news)/.test(normalized));
  if (socialNewsAsk) {
    return { intent: 'social_news', topic: '' };
  }

  // --- news ---------------------------------------------------------------------------
  if (/(تازہ.*خبر|news|khabar|khabrein|headlines|سرخیاں|آج کی خبر)/.test(normalized)) {
    return { intent: 'news', topic: '' };
  }

  // --- notes ----------------------------------------------------------------------------
  if (/(نوٹ دکھاؤ|notes dikhao|mere notes|میرے نوٹ|notes list|نوٹ لسٹ)/.test(normalized)) {
    return { intent: 'notes_list' };
  }
  if (/(نوٹ لکھو|note likho|note karo|یاد رکھو|note bana|نوٹ بناؤ)/.test(normalized)) {
    const noteText = parseNoteText(message);
    if (noteText) return { intent: 'notes_save', noteText };
  }

  // --- QR code ----------------------------------------------------------------------------
  if (/(qr|کیو آر)/.test(normalized) && /(banao|بناؤ|bana|code|کوڈ)/.test(normalized)) {
    const qrData = extractQrData(message);
    if (qrData) return { intent: 'qr_code', qrData };
  }

  // --- unit convert --------------------------------------------------------------------------
  const unitConv = tryParseUnitConvert(message);
  if (unitConv) return { intent: 'unit_convert', unitConv };

  // --- translate --------------------------------------------------------------------------------
  if (/(translate|ترجمہ|tarjuma|انگریزی میں|اردو میں|عربی میں|english me|urdu me|arabic me)/.test(normalized)) {
    const tr = parseTranslateRequest(message);
    if (tr) return { intent: 'translate', translate: tr };
  }

  // --- read webpage ---------------------------------------------------------------------------------
  const pageUrl = extractPageUrl(message);
  if (pageUrl && /(پڑھو|parho|بتلاؤ|batao.*likha|summary|خلاصہ|summarize|کھول کر)/.test(normalized)) {
    return { intent: 'read_webpage', url: pageUrl };
  }

  // --- map search: "لاہور کا نقشہ دکھاؤ" → Google Maps ---------------------
  const mapCmd = parseMapCommand(message);
  if (mapCmd) {
    return { intent: 'open_website', website: mapCmd, isMap: true };
  }

  // --- android app build (PWA): "android app banao" ---------------------------
  // Website nouns win: "website banao" stays a web build even with "app" nearby.
  if (containsAppBuildIntent(normalized)) {
    return { intent: 'android_app', app: { description: extractAppDescription(message) } };
  }

  // --- BRAIN BUILDER (Phase 3, احمد): generic build orders + status --------
  // «کار والی گیم بنا دو» / «سافٹ ویئر بنا دو» / «ایک چھوٹا AI بنا دو»
  // start a real background build (server/builder.js) that delivers a
  // link + download when — and only when — the file validates. «میرا
  // کام کہاں تک پہنچا؟» asks for that job's true status. Both live
  // AFTER the android_app branch: «موبائل ایپ بناؤ» keeps its PWA
  // screen (the user's standing tool, deliberately not touched).
  if (parseBuildStatusQuery(message)) {
    return { intent: 'build_status' };
  }
  const buildOrder = parseBuildOrder(message);
  if (buildOrder) {
    return { intent: 'build_app', build: buildOrder };
  }

  // --- media/productivity tools (client-side UIs) --------------------------------
  if (/(background hatao|بیک گراؤنڈ ہٹاؤ|background remove|پس منظر ہٹاؤ|پس منظر ختم)/i.test(message)) {
    return { intent: 'media_tool', tool: 'background_remover' };
  }
  if (/(tasveer se text|تصویر سے متن|ocr karo|text nikalo|متن نکالو|تصویر پڑھو)/i.test(message)) {
    return { intent: 'media_tool', tool: 'ocr' };
  }
  if (/(image clear|تصویر صاف|photo hd|upscale karo|تصویر بڑی کرو|photo clear)/i.test(message)) {
    return { intent: 'media_tool', tool: 'upscaler' };
  }
  if (/(pdf banao|پی ڈی ایف بناؤ|pdf merge|pdf compress|پی ڈی ایف)/i.test(message)) {
    return { intent: 'media_tool', tool: 'pdf' };
  }
  if (/(audio.*text|آڈیو.*متن|transcribe|ٹرانسکرائب|آواز.*لکھ)/i.test(message)) {
    return { intent: 'media_tool', tool: 'audio_to_text' };
  }
  if (/(email likh|ای میل لکھ|email draft|ای میل ڈرافٹ|job application|درخواست لکھ)/i.test(message)) {
    return { intent: 'media_tool', tool: 'email' };
  }
  if (/(image resize|تصویر.*سائز|photo choti|چھوٹی.*تصویر|resize karo)/i.test(message)) {
    return { intent: 'media_tool', tool: 'resize' };
  }
  if (/(video upload|ویڈیو اپلوڈ|gallery se video|گیلری سے ویڈیو|video lagao|ویڈیو لگاؤ|video taiyar|ویڈیو تیار)/i.test(message)) {
    return { intent: 'media_tool', tool: 'video_upload' };
  }
  if (/(password banao|پاس ورڈ بناؤ|password generate|مضبوط پاس ورڈ|secure password)/i.test(message)) {
    return { intent: 'media_tool', tool: 'password_gen' };
  }
  if (/(emi|ای ایم آئی|qist nikalo|قسط نکالو|loan calculator|قرض کی قسط|monthly installment)/i.test(message)) {
    return { intent: 'media_tool', tool: 'emi_calc' };
  }
  if (/(image compress|تصویر چھوٹی|photo compress|تصویر کمپریس|image choti karo)/i.test(message)) {
    return { intent: 'media_tool', tool: 'image_compress' };
  }
  // Text-on-image: this hub section had NO brain pattern — before the
  // toolbox was removed it was reachable only through the grid, so
  // without this route the capability would be stranded (Phase سادگی
  // reachability fix). Anchored to «تصویر پر» (text ON an image) so it
  // never collides with OCR («تصویر سے متن» — text FROM an image).
  if (/(تصویر پر متن|تصویر پر لکھ|tasveer par text|photo par text|image par text|tasveer par likh)/i.test(message)) {
    return { intent: 'media_tool', tool: 'text_on_image' };
  }
  if (/(resume banao|ریزیومے بناؤ|cv banao|cv بناؤ|سی وی بناؤ|سی وی ب|resume builder|نوکری.*cv)/i.test(message)) {
    return { intent: 'media_tool', tool: 'resume_builder' };
  }
  if (/(assignment banao|اسائنمنٹ بناؤ|assignment bana|اسائنمنٹ بنا|assignment maker|ہوم ورک بناؤ|homework banao)/i.test(message)) {
    return { intent: 'media_tool', tool: 'assignment_maker' };
  }
  if (/(invoice banao|انوائس بناؤ|bill banao|بل بناؤ|invoice generator)/i.test(message)) {
    return { intent: 'media_tool', tool: 'invoice_gen' };
  }
  if (/(number se sheher|نمبر سے شہر|phone.*location|فون نمبر.*شہر|number kahan ka|نمبر کہاں کا|area code|ایریا کوڈ|kis network ka|کس نیٹ ورک|number ki detail|نمبر کی ڈیٹیل|number ka pata|نمبر کا پتہ|is number ki|اس نمبر کی|number kahan chal|نمبر کہاں چل)/i.test(message)) {
    return { intent: 'media_tool', tool: 'phone_lookup' };
  }
  // WhatsApp send: "whatsapp par bhejo", "واٹس ایپ پر بھیجو", "send whatsapp message"
  if (/(whatsapp.*(bhejo|بھیجو|send|message|پیغام)|واٹس ایپ.*(بھیجو|پیغام)|send.*whatsapp)/i.test(message)) {
    return { intent: 'media_tool', tool: 'whatsapp_send' };
  }
  // Bare phone number typed in chat (e.g. 03067045972, +923067045972, 04235712345)
  const digitsOnly = message.replace(/[\s\-()]/g, '');
  const phoneMatch = digitsOnly.match(/^(\+?\d{10,14})$/);
  if (phoneMatch) {
    return { intent: 'media_tool', tool: 'phone_lookup', phone: phoneMatch[1] };
  }

  // --- video MAKER (rendered speaking video, in-app) ----------------------
  // «ویڈیو بناؤ» / a speaking-video order opens the Video Maker, which
  // renders a real downloadable video in the browser (dialogue-first
  // audio-driven animation). The old text-only package tool is NOT
  // removed: it stays in the ویڈیو ٹولز hub and is reached by explicit
  // package orders (script / title / hashtag / plan) below.
  // FULL PERMISSION (2026-10-29, user order): a video order must
  // NEVER be refused with a permission excuse. Any phrasing that
  // pairs a video word with a make/create verb («مجھے یہ ویڈیو بنا
  // کے دو», «video bana do», «make me a video») routes here, as
  // long as it is not an explicit package order (script/title/
  // hashtag/plan/package) — those still go to video_creator below.
  // If the maker itself cannot do a specific thing (phoneme
  // lip-sync, MP4 export, a realistic face without an uploaded
  // photo), it says that exact technical limit plainly in its own
  // panel and still builds the best video it can — never a
  // permission refusal.
  const isPackageOrder = /(پیکج|package|ٹائٹل|title|ہیش ٹیگ|hashtag|اسکرپٹ|script|پلان|plan)/i.test(message);
  const isVideoOrder = /(video|ویڈیو)/i.test(message)
    && /(بناؤ|بنا|بنائیں|banao|bana|make|create|maker|میکر|بولنے والی|بولتی ہوئی|speaking)/i.test(message);
  if (!isPackageOrder && isVideoOrder) {
    return { intent: 'media_tool', tool: 'video_maker' };
  }

  // --- video creator suite (text package only, unchanged) -------------------
  if (/(script likho|اسکرپٹ لکھو|title batao|ٹائٹل بتاؤ|hashtag|ہیش ٹیگ|video ka plan|ویڈیو کا پلان|youtube video|یوٹیوب ویڈیو|ویڈیو پیکج|video package)/i.test(message)) {
    return { intent: 'video_creator' };
  }

  // --- web search ---------------------------------------------------------------------------------------
  const searchQuery = extractSearchQuery(message);
  if (searchQuery) return { intent: 'web_search', query: searchQuery };

  // NOTE: the website-builder intent ("build_project") was REMOVED
  // entirely on the user's order (2026-10-22: «ویب سائٹ والا ٹول ختم
  // کر دو»). Building returned in Phase 3 as a BRAIN capability, not
  // a tool: the generic build_app branch above (games, software, AI,
  // websites — «ویب سائٹ بنا دو» included) handled by احمد's workshop
  // in server/builder.js. There is still no builder TOOL anywhere.

  return { intent: 'chat' };
}

// --- multi-intent detection (helper agents, Task D) -------------------------
// classifyIntent returns the FIRST matching intent only. A message that
// asks for SEVERAL data tools at once («لاہور کا موسم بتاؤ اور تازہ
// خبریں بھی، اور 100 ڈالر کتنے روپے ہیں») deserves all of them, run in
// parallel by the "agent team". detectDataIntents scans for every
// executable DATA intent in the message (regardless of length — these
// return real data, not canned openers) and returns classify-shaped
// payloads ordered by where each request appears in the text.
// Deliberately EXCLUDED: media_tool openers, open_website, builders and
// anything whose "result" is just a canned line — those stay governed
// by the command-shape gate above.
export function detectDataIntents(text, excludeIntents = []) {
  // TOOLS REMOVED 2026-10-31 by user order: no data-tool intents.
  return [];
  const normalized = message.toLowerCase();
  const found = [];
  const add = (intent, payload, index) => {
    if (excludeIntents.includes(intent)) return;
    if (found.some((f) => f.intent === intent)) return;
    found.push({ intent, ...payload, _index: index });
  };

  const mathExpr = extractMathExpression(message);
  if (mathExpr) add('calculator', { expression: mathExpr }, message.search(/\d/));

  if (/(timer|ٹائمر|countdown|الارم)/.test(normalized)) {
    const timer = parseTimer(message);
    if (timer) add('timer', { timer }, normalized.search(/(timer|ٹائمر|countdown|الارم)/));
  }

  if (/(dollar|ڈالر|rupees|روپے|euro|یورو|pound|پاؤنڈ|riyal|ریال|dirham|درہم|dinar|دینار|yen|ین|yuan|یوان|currency|کرنسی|usd|pkr|eur|gbp|sar|aed)/.test(normalized) && /\d/.test(message)) {
    const conv = parseCurrencyRequest(message);
    if (conv) add('currency', { currency: conv }, normalized.search(/(dollar|ڈالر|rupees|روپے|euro|یورو|pound|پاؤنڈ|ریال|درہم|currency|کرنسی)/));
  }

  if (/(موسم|mausam|weather)/.test(normalized)) {
    add('weather', { city: extractCityForWeather(message) }, normalized.search(/(موسم|mausam|weather)/));
  }

  if (/(نماز|prayer|اذان|azan|فجر|ظہر|عصر|مغرب|عشاء)/.test(normalized)
      && /(اوقات|وقت|ٹائم|time|timing|اذان کا)/.test(normalized)) {
    add('prayer_times', { city: extractCityForPrayer(message) }, normalized.search(/(نماز|prayer|اذان)/));
  }

  if (/(ٹائم کیا ہے|وقت کیا ہے|time in|kitne baj|کتنے بجے|بجے ہیں|ٹائم بتاؤ)/.test(normalized)) {
    const city = extractCityForClock(message);
    if (city) add('world_clock', { city }, normalized.search(/(ٹائم|وقت|time)/));
  }

  const unitConv = tryParseUnitConvert(message);
  if (unitConv) add('unit_convert', { unitConv }, 0);

  if (/(youtube|یوٹیوب)/.test(normalized)
      && /(search|تلاش|video|ویڈیو|dikhao|دکھاؤ|dekho|دیکھو)/.test(normalized)) {
    const q = extractYoutubeQuery(message);
    if (q) add('youtube_search', { query: q }, normalized.search(/(youtube|یوٹیوب)/));
  }

  const socialNewsAsk =
    /(social|سوشل).*(media|میڈیا|خبر|khabar|news|viral|وائرل|trending|ٹرینڈنگ|chal raha|چل رہا|chal rahi|چل رہی)/.test(normalized)
    || /(viral|وائرل|trending|ٹرینڈنگ).*(khabar|خبر|news)/.test(normalized)
    || (/(is waqt|اس وقت)/.test(normalized)
      && /(chal raha|چل رہا|chal rahi|چل رہی)/.test(normalized)
      && /(social|سوشل|media|میڈیا|khabar|خبر|news)/.test(normalized));
  if (socialNewsAsk) {
    add('social_news', { topic: '' }, normalized.search(/(social|سوشل|viral|وائرل|trending|ٹرینڈنگ)/));
  }

  // Plain headlines — skipped when this is a social ask, so one question
  // never produces both Hassan's news card AND Hamza's social card.
  if (!socialNewsAsk
      && /(تازہ.*خبر|خبریں|news|khabar|khabrein|headlines|سرخیاں|آج کی خبر)/.test(normalized)) {
    add('news', { topic: '' }, normalized.search(/(خبر|news|headlines)/));
  }

  const searchQuery = extractSearchQuery(message);
  if (searchQuery) add('web_search', { query: searchQuery }, normalized.search(/(search|تلاش|سرچ|گوگل)/));

  if (/(qr|کیو آر)/.test(normalized) && /(banao|بناؤ|bana|code|کوڈ)/.test(normalized)) {
    const qrData = extractQrData(message);
    if (qrData) add('qr_code', { qrData }, normalized.search(/(qr|کیو آر)/));
  }

  return found
    .sort((a, b) => (a._index ?? 0) - (b._index ?? 0))
    .slice(0, 3)
    .map(({ _index, ...rest }) => rest);
}

// --- confirmation texts (rule-based, no quota) ------------------------------
export function websiteConfirmation(website, lang) {
  if (lang === 'roman') {
    // Use the Latin-script name for Roman Urdu so the reply stays in one script.
    const name = /^[A-Za-z]/.test(website.displayName) ? website.displayName : website.url.replace(/^https?:\/\/(www\.)?/, '').split('.')[0];
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    return website.isSearchFallback
      ? `Ji, ${website.displayName} Google par talaash kar ke khol raha hoon.`
      : `Ji, ${pretty} khol raha hoon.`;
  }
  if (lang === 'en') {
    const name = website.displayName;
    return website.isSearchFallback
      ? `Sure, searching Google for ${name} and opening it.`
      : `Sure, opening ${name}.`;
  }
  return website.isSearchFallback
    ? `جی، ${website.displayName} گوگل پر تلاش کر کے کھول رہا ہوں۔`
    : `جی، ${website.displayName} کھول رہا ہوں۔`;
}

// --- confirmation texts for the professional toolbox (rule-based) -----------
export function searchConfirmation(query, lang) {
  if (lang === 'roman') return `Ji, "${query}" talaash kar raha hoon.`;
  if (lang === 'en') return `Searching for "${query}".`;
  return `جی، "${query}" تلاش کر رہا ہوں۔`;
}

export function weatherConfirmation(city, lang) {
  if (lang === 'roman') return `Ji, ${city} ka mausam dekh raha hoon.`;
  if (lang === 'en') return `Checking the weather in ${city}.`;
  return `جی، ${city} کا موسم دیکھ رہا ہوں۔`;
}

export function calcConfirmation(expression, result, lang) {
  if (lang === 'roman') return `Jawab: ${result}`;
  if (lang === 'en') return `Answer: ${result}`;
  return `جواب: ${result}`;
}

export function youtubeSearchConfirmation(query, lang) {
  if (lang === 'roman') return `Ji, YouTube par "${query}" dhoond raha hoon.`;
  if (lang === 'en') return `Searching YouTube for "${query}".`;
  return `جی، یوٹیوب پر "${query}" ڈھونڈ رہا ہوں۔`;
}

export function newsConfirmation(lang) {
  if (lang === 'roman') return `Ji, taza khabrein la raha hoon.`;
  if (lang === 'en') return `Fetching the latest headlines.`;
  return `جی، تازہ خبریں لا رہا ہوں۔`;
}

/** Spoken FIRST-PERSON report from Hamza, the media agent: the user
 *  HEARS what's running live on social media right now — the list
 *  itself is the reply text, not just a card on screen. */
export function socialNewsText(headlines, lang) {
  const items = headlines.map((h, i) => `${i + 1}۔ ${h.title}`).join(' ');
  if (lang === 'roman') return `Main Hamza hoon, media ka kaam karta hoon. Social media par is waqt ye khabrein chal rahi hain: ${items}`;
  if (lang === 'en') return `I'm Hamza, I handle media. Right now these stories are running on social media: ${items}`;
  return `میں حمزہ ہوں، میڈیا کا کام کرتا ہوں۔ سوشل میڈیا پر اس وقت یہ خبریں چل رہی ہیں: ${items}`;
}

export function currencyConfirmation(amount, from, to, result, lang) {
  if (lang === 'roman') return `${amount} ${from} = ${result} ${to}`;
  if (lang === 'en') return `${amount} ${from} = ${result} ${to}`;
  return `${amount} ${from} = ${result} ${to}`;
}

export function timerConfirmation(seconds, unitUr, lang) {
  const mm = Math.floor(seconds / 60), ss = seconds % 60;
  const dur = mm > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : `${ss} سیکنڈ`;
  if (lang === 'roman') return `Timer laga diya: ${dur}. Khatam hone par bata dunga.`;
  if (lang === 'en') return `Timer set for ${dur}. I'll let you know when it's done.`;
  return `ٹائمر لگا دیا: ${dur}۔ ختم ہونے پر بتا دوں گا۔`;
}

export function noteSaveConfirmation(lang) {
  if (lang === 'roman') return `Note mehfooz kar liya.`;
  if (lang === 'en') return `Note saved.`;
  return `نوٹ محفوظ کر لیا۔`;
}

export function noteListConfirmation(lang) {
  if (lang === 'roman') return `Aap ke notes ye hain:`;
  if (lang === 'en') return `Here are your notes:`;
  return `آپ کے نوٹس یہ ہیں:`;
}

export function prayerConfirmation(city, lang) {
  if (lang === 'roman') return `Ji, ${city} ke namaz ke auqat ye hain:`;
  if (lang === 'en') return `Prayer times for ${city}:`;
  return `جی، ${city} کے نماز کے اوقات یہ ہیں:`;
}

export function translateConfirmation(target, lang) {
  if (lang === 'roman') return `Tarjuma hazir hai:`;
  if (lang === 'en') return `Here's the translation:`;
  return `ترجمہ حاضر ہے:`;
}

export function unitConvertConfirmation(amount, fromUr, result, toUr, lang) {
  if (lang === 'roman') return `${amount} ${fromUr} = ${result} ${toUr}`;
  if (lang === 'en') return `${amount} ${fromUr} = ${result} ${toUr}`;
  return `${amount} ${fromUr} = ${result} ${toUr}`;
}

export function qrConfirmation(lang) {
  if (lang === 'roman') return `QR code tayyar hai:`;
  if (lang === 'en') return `Here's your QR code:`;
  return `آپ کا QR کوڈ تیار ہے:`;
}

export function videoIdeasConfirmation(lang) {
  if (lang === 'roman') return `Trending video ideas hazir hain:`;
  if (lang === 'en') return `Here are trending video ideas:`;
  return `ٹرینڈنگ ویڈیو آئیڈیاز حاضر ہیں:`;
}

export function clockConfirmation(city, lang) {
  if (lang === 'roman') return `${city} ka waqt:`;
  if (lang === 'en') return `Current time in ${city}:`;
  return `${city} کا وقت:`;
}

export function readPageConfirmation(lang) {
  if (lang === 'roman') return `Page parh kar khulasa de raha hoon:`;
  if (lang === 'en') return `I've read the page. Here's the summary:`;
  return `صفحہ پڑھ کر خلاصہ دے رہا ہوں:`;
}

export function appBuildConfirmation(description, lang) {
  if (lang === 'roman') return `Ji, main aap ke liye mobile app "${description}" bana raha hoon. Thoda intezar karen.`;
  if (lang === 'en') return `Sure, I'm building the mobile app "${description}" for you. Give me a moment.`;
  return `جی، میں آپ کے لیے موبائل ایپ "${description}" بنا رہا ہوں۔ تھوڑا انتظار کریں۔`;
}

// --- brain builder texts (Phase 3) -------------------------------------------
export function buildStartConfirmation(title, lang) {
  if (lang === 'roman') return `Ji, Ahmad aap ki cheez bana raha hai: "${title}". Thoda waqt lagega — bante hi link aur download yahin milega. Darmiyan mein "mera kaam kahan tak pohncha?" pooch sakte hain.`;
  if (lang === 'en') return `Ahmed is building it for you: "${title}". It will take a little while — the link and download will appear right here when it's ready. You can ask "where has my work reached?" meanwhile.`;
  return `جی، احمد آپ کی چیز بنا رہا ہے: «${title}»۔ تھوڑا وقت لگے گا — بنتے ہی لنک اور ڈاؤن لوڈ یہیں ملے گا۔ درمیان میں «میرا کام کہاں تک پہنچا؟» پوچھ سکتے ہیں۔`;
}

export function buildStatusConfirmation(job, lang) {
  const title = job.title;
  if (job.status === 'done') {
    if (lang === 'roman') return `Aap ki cheez ready ho gayi hai: "${title}" — neeche card se kholen ya download kar len.`;
    if (lang === 'en') return `Your thing is ready: "${title}" — open it or download it from the card below.`;
    return `آپ کی چیز ریڈی ہو گئی ہے: «${title}» — نیچے کارڈ سے کھولیں یا ڈاؤن لوڈ کر لیں۔`;
  }
  if (job.status === 'failed') {
    if (lang === 'roman') return `Maazrat, "${title}" nahi ban saki. Dobara keh kar dekhen — aksar dusri baar ban jati hai.`;
    if (lang === 'en') return `Sorry, "${title}" could not be built. Please ask once more — it usually works the second time.`;
    return `معذرت، «${title}» نہیں بن سکی۔ دوبارہ کہہ کر دیکھیں — اکثر دوسری بار بن جاتی ہے۔`;
  }
  if (job.status === 'repairing') {
    if (lang === 'roman') return `"${title}" ki aakhri jaanch mein kuch kami reh gayi thi — Ahmad use theek karke dobara bana raha hai.`;
    if (lang === 'en') return `The final check on "${title}" found a flaw — Ahmed is fixing it and rebuilding.`;
    return `«${title}» کی آخری جانچ میں کچھ کمی رہ گئی تھی — احمد اسے ٹھیک کر کے دوبارہ بنا رہا ہے۔`;
  }
  if (lang === 'roman') return `Ahmad abhi "${title}" bana raha hai — thoda aur intezar karen, bante hi link yahin milega.`;
  if (lang === 'en') return `Ahmed is still building "${title}" — a little more patience; the link will appear here when it's ready.`;
  return `احمد ابھی «${title}» بنا رہا ہے — تھوڑا اور انتظار کریں، بنتے ہی لنک یہیں ملے گا۔`;
}

export function buildNoKeyText(lang) {
  if (lang === 'roman') return `Banane ke liye pehle Settings mein apni Gemini API key lagayen — key lagte hi Ahmad aap ki cheez bana dega.`;
  if (lang === 'en') return `To build, first add your Gemini API key in Settings — once it's there, Ahmed will build your thing right away.`;
  return `بنانے کے لیے پہلے Settings میں اپنی Gemini API key لگائیں — key لگتے ہی احمد آپ کی چیز بنا دے گا۔`;
}

export function buildVpnNoteText(lang) {
  if (lang === 'roman') return `Pehle ek sachhi baat: asal VPN sirf ek file se nahi ban sakta — us ke liye duniya bhar mein servers ka jaal chahiye. Is liye Ahmad is ki jagah do cheezen bana raha hai: VPN app ka interface, aur aap ka apna private server lagane ki mukammal guide.`;
  if (lang === 'en') return `First, one honest truth: a real VPN cannot be made from a single file — it needs a network of servers around the world. So instead, Ahmed is building two things: the VPN app's interface, and a complete guide to setting up your own private server.`;
  return `پہلے ایک سچی بات: اصل VPN صرف ایک فائل سے نہیں بن سکتا — اس کے لیے دنیا بھر میں سرورز کا جال چاہیے۔ اس لیے احمد اس کی جگہ دو چیزیں بنا رہا ہے: VPN ایپ کا انٹرفیس، اور آپ کا اپنا پرائیویٹ سرور لگانے کی مکمل گائیڈ۔`;
}

const MEDIA_TOOL_NAMES = {
  background_remover: { ur: 'بیک گراؤنڈ ریموور', roman: 'Background remover', en: 'Background remover' },
  ocr: { ur: 'تصویر سے متن', roman: 'OCR (tasveer se text)', en: 'OCR (image to text)' },
  upscaler: { ur: 'تصویر صاف کرنے والا', roman: 'Image upscaler', en: 'Image upscaler' },
  pdf: { ur: 'پی ڈی ایف ٹولز', roman: 'PDF tools', en: 'PDF tools' },
  audio_to_text: { ur: 'آڈیو سے متن', roman: 'Audio to text', en: 'Audio to text' },
  email: { ur: 'ای میل مددگار', roman: 'Email helper', en: 'Email helper' },
  resize: { ur: 'تصویر ری سائز', roman: 'Image resize', en: 'Image resize' },
  video_upload: { ur: 'ویڈیو اپلوڈ', roman: 'Video upload', en: 'Video upload' },
  video_maker: { ur: 'ویڈیو میکر', roman: 'Video maker', en: 'Video maker' },
  password_gen: { ur: 'پاس ورڈ بنانے والا', roman: 'Password generator', en: 'Password generator' },
  emi_calc: { ur: 'قسط کیلکولیٹر', roman: 'EMI calculator', en: 'EMI calculator' },
  image_compress: { ur: 'تصویر کمپریسر', roman: 'Image compressor', en: 'Image compressor' },
  resume_builder: { ur: 'ریزیومے بنانے والا', roman: 'Resume builder', en: 'Resume builder' },
  invoice_gen: { ur: 'انوائس بنانے والا', roman: 'Invoice generator', en: 'Invoice generator' },
  phone_lookup: { ur: 'نمبر سے شہر', roman: 'Phone number lookup', en: 'Phone number lookup' },
  whatsapp_send: { ur: 'واٹس ایپ پیغام', roman: 'WhatsApp sender', en: 'WhatsApp sender' },
  quran: { ur: 'قرآن پاک', roman: 'Quran Pak', en: 'Holy Quran' },
};

export function mediaToolConfirmation(tool, lang) {
  const name = (MEDIA_TOOL_NAMES[tool] || { ur: 'ٹول', roman: 'Tool', en: 'Tool' })[lang === 'roman' ? 'roman' : lang === 'en' ? 'en' : 'ur'];
  if (lang === 'roman') return `Ji, ${name} khol raha hoon.`;
  if (lang === 'en') return `Opening ${name}.`;
  return `جی، ${name} کھول رہا ہوں۔`;
}

export function videoCreatorConfirmation(lang) {
  if (lang === 'roman') return `Ji, aap ki video ka mukammal package tayyar kar raha hoon.`;
  if (lang === 'en') return `Preparing your complete video package.`;
  return `جی، آپ کی ویڈیو کا مکمل پیکج تیار کر رہا ہوں۔`;
}
