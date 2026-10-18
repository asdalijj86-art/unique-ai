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

// --- main classifier --------------------------------------------------------
/**
 * Classify the latest user message.
 * Returns { intent, website?, project? } where intent is one of
 * "open_website" | "build_project" | "chat".
 */
export function classifyIntent(text) {
  const message = String(text || '').trim();
  if (!message) return { intent: 'chat' };

  // Website commands win over build ("youtube kholo" is not a build).
  const website = parseWebsiteCommand(message);
  if (website) {
    return { intent: 'open_website', website };
  }

  const normalized = message.toLowerCase();
  if (containsBuildIntent(normalized)) {
    return { intent: 'build_project', project: { description: extractProjectDescription(message) } };
  }

  return { intent: 'chat' };
}

// --- confirmation texts (rule-based, no quota) ------------------------------
export function websiteConfirmation(website, lang) {
  if (lang === 'roman') {
    return website.isSearchFallback
      ? `Ji, ${website.displayName} Google par talaash kar ke khol raha hoon.`
      : `Ji, ${website.displayName} khol raha hoon.`;
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
