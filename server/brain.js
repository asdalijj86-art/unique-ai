// Unique AI smart brain — intent classification for chat messages.
//
// Rule-based (zero Gemini quota): classifies the latest user message into
//   - "open_website"  → "یوٹیوب کھولو" / "youtube kholo" / "open youtube"
//   - "build_project" → "میرے لیے دکان کی ویب سائٹ بناؤ" / "ek website banao"
//   - "chat"          → everything else (normal Gemini conversation)
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
// 'ur' = Perso-Arabic script, 'roman' = Roman Urdu, 'en' = English.
const URDU_RANGE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
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
  if (URDU_RANGE.test(t)) return 'ur';
  const words = t.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'ur';
  const romanHits = words.filter((w) => ROMAN_URDU_WORDS.has(w)).length;
  if (romanHits >= 1 && romanHits / words.length >= 0.2) return 'roman';
  return 'en';
}

// --- build_project detection ------------------------------------------------
const BUILD_VERBS = [
  'بناؤ', 'بنا دو', 'بنائیں', 'بنا کر دو', 'تیار کرو', 'تیار کریں',
  'banao', 'bana do', 'bana de', 'banayen', 'banaiye', 'tayyar karo',
  'create', 'build', 'make', 'develop', 'design',
];
const BUILD_NOUNS = [
  'ویب سائٹ', 'ویبسائٹ', 'website', 'ویب', 'web',
  'ایپ', 'app', 'application',
  'پروجیکٹ', 'project',
  'پیج', 'page', 'سائٹ', 'site',
  'دکان', 'shop', 'store', 'اسٹور',
  'گیم', 'game',
  'پورٹ فولیو', 'portfolio',
  'بلاگ', 'blog',
];

function containsBuildIntent(normalized) {
  const hasVerb = BUILD_VERBS.some((v) => normalized.includes(v));
  if (!hasVerb) return false;
  // A build verb plus a buildable noun (or "mere liye" style request).
  const hasNoun = BUILD_NOUNS.some((n) => normalized.includes(n));
  const forMe = /(میرے لیے|میرے لئے|mere liye|mere liye|for me)/.test(normalized);
  return hasNoun || forMe;
}

/** Extract a short project description from the user message. */
function extractProjectDescription(text) {
  let d = String(text || '').trim().replace(/[.؟?!,۔]+$/g, '').trim();
  // Strip leading request verbs: "میرے لیے ... بناؤ" → "..."
  d = d
    .replace(/^(میرے لیے|میرے لئے|mere liye|please|براہ کرم|براہِ کرم)\s+/i, '')
    .replace(/\s+(بناؤ|بنا دو|بنائیں|banao|bana do|banayen|create|build|make|develop|design)\s*$/i, '')
    .trim();
  return d || text.trim();
}

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
  else if (/(اردو|urdu)/i.test(t)) target = 'ur';
  if (!target) return null;
  const colon = t.indexOf(':');
  let src = colon !== -1 ? t.slice(colon + 1).trim() : t
    .replace(/(translate|ترجمہ|tarjuma)\s*(کرو|karo|karen|کریں)?\s*/i, '')
    .replace(/\s*(کو|ko)\s*(انگریزی|اردو|english|urdu)\s*(میں|mein|me)?\s*/i, ' ')
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

// --- main classifier --------------------------------------------------------
/**
 * Classify the latest user message.
 * Returns { intent, ...payload } where intent is one of
 * "open_website" | "calculator" | "timer" | "currency" | "weather" |
 * "youtube_search" | "news" | "notes_save" | "notes_list" | "web_search" |
 * "prayer_times" | "translate" | "unit_convert" | "qr_code" |
 * "youtube_trending" | "world_clock" | "read_webpage" |
 * "build_project" | "chat".
 */
export function classifyIntent(text) {
  const message = String(text || '').trim();
  if (!message) return { intent: 'chat' };

  // Quran Pak wins over website commands — "قرآن کھولو" opens our in-app
  // Quran panel (with Urdu translation + voice), not an external site.
  if (/(قرآن|قران|quran|سورۃ|سورت|surah|سورة|آیت|آیت الکرسی|ayat|ayah|پارہ|para|juz|تلاوت|tilawat|سورہ یٰسین|سورہ رحمٰن|سورہ ملک|سورہ واقعہ|سورہ کہف|سورہ بقرہ|سورہ فاتحہ|سورہ اخلاص|سورہ فلق|سورہ ناس|سورہ کوثر|یٰسین|رحمٰن|ملک|واقعہ|کہف|بقرہ|آل عمران|نساء|مائدہ|انعام|اعراف|انفال|توبہ|یونس|ہود|یوسف|رعد|ابراہیم|حجر|نحل|بنی اسرائیل|مریم|طٰہٰ|انبیاء|حج|مومنون|نور|فرقان|شعراء|نمل|قصص|عنکبوت|روم|لقمان|سجدہ|احزاب|سبا|فاطر|صٰفٰت|زمر|مومن|حم سجدہ|شوریٰ|زخرف|دخان|جاثیہ|احقاف|محمد|فتح|حجرات|ذاریات|طور|نجم|قمر|حدید|مجادلہ|حشر|ممتحنہ|صف|جمعہ|منافقون|تغابن|طلاق|تحریم|قلم|حاقہ|معارج|نوح|جن|مزمل|مدثر|قیامت|دہر|مرسلات|نبأ|نازعات|عبس|تکویر|انفطار|مطففین|انشقاق|بروج|طارق|اعلیٰ|غاشیہ|فجر|بلد|شمس|لیل|ضحیٰ|شرح|تین|علق|قدر|بینہ|زلزال|عادیات|قارعہ|تکاثر|عصر|ہمزہ|فیل|قریش|ماعون|کافرون|نصر|لہب)/i.test(message)) {
    return { intent: 'media_tool', tool: 'quran' };
  }

  // Website commands win over everything ("youtube kholo" is not a build).
  const website = parseWebsiteCommand(message);
  if (website) {
    return { intent: 'open_website', website };
  }

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

  // --- youtube trending / video ideas ------------------------------------------------
  if (/(trending|وائرل|viral|آئیڈیا|idea).*(video|ویڈیو|short|شارٹ)|(video|ویڈیو).*(idea|آئیڈیا|trending|وائرل)/.test(normalized)
      || /(یوٹیوب کے لیے|youtube ke liye)/.test(normalized)) {
    return { intent: 'youtube_trending', niche: extractNiche(message) };
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
  if (/(translate|ترجمہ|tarjuma|انگریزی میں|اردو میں|english me|urdu me)/.test(normalized)) {
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
  if (/(resume banao|ریزیومے بناؤ|cv banao|سی وی بناؤ|resume builder|نوکری.*cv)/i.test(message)) {
    return { intent: 'media_tool', tool: 'resume_builder' };
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

  // --- video creator suite ---------------------------------------------------
  if (/(video banao|ویڈیو بناؤ|script likho|اسکرپٹ لکھو|title batao|ٹائٹل بتاؤ|hashtag|ہیش ٹیگ|video ka plan|ویڈیو کا پلان|youtube video|یوٹیوب ویڈیو)/i.test(message)) {
    return { intent: 'video_creator' };
  }

  // --- web search ---------------------------------------------------------------------------------------
  const searchQuery = extractSearchQuery(message);
  if (searchQuery) return { intent: 'web_search', query: searchQuery };

  if (containsBuildIntent(normalized)) {
    return { intent: 'build_project', project: { description: extractProjectDescription(message) } };
  }

  return { intent: 'chat' };
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

export function buildConfirmation(description, lang) {
  if (lang === 'roman') {
    return `Ji, main aap ke liye "${description}" bana raha hoon. Thoda intezar karen.`;
  }
  if (lang === 'en') {
    return `Sure, I'm building "${description}" for you. Give me a moment.`;
  }
  return `جی، میں آپ کے لیے "${description}" بنا رہا ہوں۔ تھوڑا انتظار کریں۔`;
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

const MEDIA_TOOL_NAMES = {
  background_remover: { ur: 'بیک گراؤنڈ ریموور', roman: 'Background remover', en: 'Background remover' },
  ocr: { ur: 'تصویر سے متن', roman: 'OCR (tasveer se text)', en: 'OCR (image to text)' },
  upscaler: { ur: 'تصویر صاف کرنے والا', roman: 'Image upscaler', en: 'Image upscaler' },
  pdf: { ur: 'پی ڈی ایف ٹولز', roman: 'PDF tools', en: 'PDF tools' },
  audio_to_text: { ur: 'آڈیو سے متن', roman: 'Audio to text', en: 'Audio to text' },
  email: { ur: 'ای میل مددگار', roman: 'Email helper', en: 'Email helper' },
  resize: { ur: 'تصویر ری سائز', roman: 'Image resize', en: 'Image resize' },
  video_upload: { ur: 'ویڈیو اپلوڈ', roman: 'Video upload', en: 'Video upload' },
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
