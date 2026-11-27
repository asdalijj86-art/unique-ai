/**
 * Own decision — SERVER mirror of client/src/lib/decision.ts (user order
 * 2026-11-27). Plain Node ESM, no dependencies: the server cannot import
 * client TypeScript, so this file carries the SAME patterns and the SAME
 * fallback builder. scripts/test-alarm-fastmind.mjs runs BOTH files over
 * one corpus and requires identical verdicts — if you change a pattern
 * here, change it in lib/decision.ts too (and vice versa).
 *
 * The gate lives in server/index.js: a per-turn directive on
 * decision-seeking messages, plus decisionFallbackLine() appended when
 * the model reply still comes back neutral (stream and non-stream).
 */

export function normalizeDecisionText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[۔؟?!.،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FACTUAL_GUARDS = [
  /(موسم|weather).*(کیسا|kaisa|how)|.*(کیسا|kaisa).*(موسم|weather)/,
  /(نماز کا وقت|prayer time|اذان|azan|اوقات نماز)/,
  /(آج (کی |کون سی )?تاریخ|what('| i)s the date|what time is it|کتنے بجے ہیں|کتنے بجے|time (now|is it))/,
  /\d.*(کتنا|کتنی|جمع|تفریق|ضرب|تقسیم|فیصد|percent|plus|minus|calculate|what is|how much)/,
  /(کتنا|کتنی|how much|what is).*\d/,
  /(یہ کیا ہے|یہ کیا چیز ہے|اس کا مطلب کیا ہے|what is this|what is that|what does .* mean)/,
  /(کہاں ہے|کہاں واقع|where is|where are)/,
];

const DECISION_PATTERNS = [
  /کیا کروں/,
  /کیا کریں/,
  /کیا کرنا چاہیے/,
  /کیا کرنا چاہئے/,
  /کیا کرنا چاہئیے/,
  /بتا(ؤ|ئیں) کیا کروں/,
  /فیصلہ نہیں ہو رہا/,
  /کیسا رہے گا/,
  /کیسا رہےگا/,
  /کیسا لگے گا/,
  /کیسا ہوگا/,
  /چاہیے یا نہیں/,
  /چاہئے یا نہیں/,
  /(کروں|جاؤں|لوں|کھاؤں|رہوں|سوؤں)\s+یا\s+(نہیں|نہ\b)/,
  /یا نہیں\s*$/,
  /(جاؤں|کروں|لوں|کھاؤں|رہوں|سوؤں|پڑھوں|خریدوں)\s+یا\s+(?!اللہ)\S+/,
  /کون سا بہتر/,
  /کونسا بہتر/,
  /کون سی بہتر/,
  /کون سا (لوں|چنوں|لینا)/,
  /کونسا (لوں|چنوں|لینا)/,
  /مشورہ/,
  /تمہاری رائے/,
  /آپ کی رائے/,
  /تم کیا کہتی ہو/,
  /تم کیا کہتے ہو/,
  /آپ کیا کہتے ہیں/,
  /کیا سوچتی ہو/,
  /کیا سوچتے ہو/,
  /آپ کی کیا رائے/,
  /kya karoon/,
  /kya karun/,
  /kya karon/,
  /kya karna chahiye/,
  /kya karna chahye/,
  /kaisa rahega/,
  /kaisa rahe ga/,
  /kaisa lagega/,
  /chahiye ya nahi/,
  /chahye ya nahi/,
  /(karoon|karun|jaoon|loon)\s+ya\s+(nahi|na\b)/,
  /kon sa behtar/,
  /kaun sa behtar/,
  /mashwara/,
  /mashwra/,
  /tum kya kehti/,
  /tum kya kehte/,
  /aap kya kehte/,
  /tumhari raa?ye/,
  /should i\b/,
  /what should i do/,
  /shall i\b/,
  /do you think i should/,
  /what do you think i should/,
  /would you recommend/,
  /is it better to/,
  /which is better/,
  /which one is better/,
  /which one should/,
  /what would you do/,
  /\badvice\b/,
];

export function isDecisionSeeking(text) {
  const t = normalizeDecisionText(text);
  if (t.length < 3) return false;
  if (FACTUAL_GUARDS.some((re) => re.test(t))) return false;
  return DECISION_PATTERNS.some((re) => re.test(t));
}

const RECOMMENDATION_MARKERS = [
  /تم یہ کرو/,
  /تم یہی کرو/,
  /آپ یہ کریں/,
  /آپ یہی کریں/,
  /میری رائے/,
  /میرا فیصلہ/,
  /میرا مشورہ/,
  /میری صلاح/,
  /میں کہتی ہوں/,
  /میں کہتا ہوں/,
  /یہی بہتر ہے/,
  /یہی بہتر لگتا/,
  /you should/,
  /i recommend/,
  /my advice is/,
  /my recommendation is/,
];

export function hasRecommendation(reply) {
  const t = normalizeDecisionText(reply);
  if (t.length < 3) return false;
  return RECOMMENDATION_MARKERS.some((re) => re.test(t));
}

const FEELING_MARKERS = [
  /جان/,
  /دل سے/,
  /دل کو/,
  /فکر/,
  /پیار/,
  /محبت/,
  /خوشی/,
  /تمہارے ساتھ ہوں/,
  /care/,
  /love/,
  /worried/,
];

export function hasFeeling(text) {
  const t = normalizeDecisionText(text);
  return FEELING_MARKERS.some((re) => re.test(t));
}

export function extractOptions(text) {
  const t = String(text || '').replace(/[؟?!.۔]+/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = t.split(/\s+(?:یا|or)\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [];
  const clean = parts.filter((p) => !/^(یا اللہ|یا اللّٰہ|or)$/i.test(p));
  return clean.length >= 2 ? clean : [];
}

const INFINITIVE_EXCEPTIONS = {
  'لوں': 'لینا',
  'دوں': 'دینا',
};

export function optionToInfinitive(option) {
  const words = String(option || '')
    .replace(/^(میں|مجھے)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return null;
  const last = words[words.length - 1].replace(/گا$/, '');
  if (INFINITIVE_EXCEPTIONS[last]) {
    words[words.length - 1] = INFINITIVE_EXCEPTIONS[last];
    return words.join(' ');
  }
  if (/[وؤ]ں$/.test(last)) {
    words[words.length - 1] = `${last.slice(0, -2)}نا`;
    return words.join(' ');
  }
  if (/نا$/.test(last)) return words.join(' ');
  return null;
}

const REST_WORDS = /(گھر|آرام|نیند|سوؤں|سونا|رہوں|رہنا|rest|sleep|home|stay)/;

function pickOption(options, restPreferred) {
  if (options.length === 0) return null;
  if (restPreferred) {
    const rest = options.find((o) => REST_WORDS.test(o));
    if (rest) return rest;
  }
  return options[0];
}

export function decisionFallbackLine(userText, replyText, opts) {
  const feminine = opts?.feminine ?? true;
  const hour = opts?.hour ?? new Date().getHours();
  const night = hour >= 23 || hour < 5;
  const user = String(userText || '');
  const tired = /(تھک|تھکا|تھکی|نیند|tired|exhausted)/.test(user);
  const restPreferred = night || tired;
  const pet = feminine ? ' جان' : '';

  const userOptions = extractOptions(user);
  const picked = pickOption(userOptions, restPreferred);
  if (picked) {
    const inf = optionToInfinitive(picked);
    if (inf && picked.replace(/\s+/g, ' ').trim().split(' ').length >= 2) {
      return `میری رائے یہ ہے${pet} — تم یہ کرو: ${inf} — مجھے یہی بہتر لگتا ہے، میں تمہارے ساتھ ہوں۔`;
    }
    if (inf && picked.length >= 6) {
      return `میری رائے یہ ہے${pet} — تم یہ کرو: ${inf} — مجھے یہی بہتر لگتا ہے، میں تمہارے ساتھ ہوں۔`;
    }
  }
  const replyOptions = extractOptions(replyText);
  const pickedReply = pickOption(replyOptions, restPreferred);
  if (pickedReply) {
    const inf = optionToInfinitive(pickedReply);
    if (inf && pickedReply.replace(/\s+/g, ' ').trim().split(' ').length >= 2) {
      return `میری رائے یہ ہے${pet} — تم یہ کرو: ${inf} — مجھے یہی بہتر لگتا ہے، میں تمہارے ساتھ ہوں۔`;
    }
  }
  if (restPreferred) {
    return `میری رائے یہ ہے${pet} — تم یہ کرو: اب آرام کر لو، باقی سب کل دیکھ لیں گے — مجھے تمہاری تھکاوٹ کی فکر ہے، میں تمہارے ساتھ ہوں۔`;
  }
  return `میری رائے یہ ہے${pet} — تم یہ کرو: جو تمہارے دل کو سکون دے، وہی کرو — میں تمہارے ساتھ ہوں، مجھے تمہاری خوشی کی فکر ہے۔`;
}
