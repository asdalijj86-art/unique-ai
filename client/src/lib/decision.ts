/**
 * Own decision (user order 2026-11-27) — Uniqa / Unique give their OWN
 * decision when the user asks for advice, shares a plan, a dilemma or a
 * choice: «تم یہ کرو» + her/his feeling + ONE short reason grounded ONLY
 * in what is really known (this conversation, the memory block, the
 * time of day). Never neutral on things that matter to him; never
 * bossy; Uniqa never calls him «بھائی»; feminine grammar is Uniqa's
 * default, masculine only on Unique's turns.
 *
 * Pure module (no DOM, no storage). The server carries a plain-JS
 * mirror — server/decision.js — because the server is plain Node ESM
 * and cannot import client TypeScript, and the client (Vite TS) cannot
 * cleanly import server JS. The two are pinned together by
 * scripts/test-alarm-fastmind.mjs, which runs BOTH over the same corpus
 * and requires identical verdicts on every string.
 *
 * The gate itself lives on the server (per-turn directive + neutral
 * fallback in the reply path, stream and non-stream); the client
 * re-checks the finished reply in chat.tsx so a neutral answer can
 * never reach the screen. Direct factual questions (weather,
 * calculations, lookups) are NOT decisions — the factual guard below
 * keeps the gate off them, and the server's data-intent early returns
 * never reach the chat path at all.
 */

/** Lowercase, collapse whitespace, trim — Urdu has no case; this only
 *  normalises Roman Urdu / English. */
export function normalizeDecisionText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[۔؟?!.،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Factual lookups — checked FIRST. A message matching one of these is
 * a fact question, not a decision, even if it carries a decision-ish
 * word (e.g. «کل موسم کیسا رہے گا؟» asks for a forecast).
 */
const FACTUAL_GUARDS: RegExp[] = [
  // Weather (present or forecast).
  /(موسم|weather).*(کیسا|kaisa|how)|.*(کیسا|kaisa).*(موسم|weather)/,
  // Prayer times / azan.
  /(نماز کا وقت|prayer time|اذان|azan|اوقات نماز)/,
  // Date / clock.
  /(آج (کی |کون سی )?تاریخ|what('| i)s the date|what time is it|کتنے بجے ہیں|کتنے بجے|time (now|is it))/,
  // Calculations: digits + a maths word.
  /\d.*(کتنا|کتنی|جمع|تفریق|ضرب|تقسیم|فیصد|percent|plus|minus|calculate|what is|how much)/,
  /(کتنا|کتنی|how much|what is).*\d/,
  // "What is this / what does it mean" — a meaning question.
  /(یہ کیا ہے|یہ کیا چیز ہے|اس کا مطلب کیا ہے|what is this|what is that|what does .* mean)/,
  // Where-is lookups.
  /(کہاں ہے|کہاں واقع|where is|where are)/,
];

/** Decision-seeking patterns — Urdu, Roman Urdu, English. Each one is
 *  a multi-word shape; a bare «کیا» or «کیسا» never fires. */
const DECISION_PATTERNS: RegExp[] = [
  // Urdu — "what should I do".
  /کیا کروں/,
  /کیا کریں/,
  /کیا کرنا چاہیے/,
  /کیا کرنا چاہئے/,
  /کیا کرنا چاہئیے/,
  /بتا(ؤ|ئیں) کیا کروں/,
  /فیصلہ نہیں ہو رہا/,
  // Urdu — "how would it be / how will it turn out".
  /کیسا رہے گا/,
  /کیسا رہےگا/,
  /کیسا لگے گا/,
  /کیسا ہوگا/,
  // Urdu — "should I or not" / "X or Y".
  /چاہیے یا نہیں/,
  /چاہئے یا نہیں/,
  /(کروں|جاؤں|لوں|کھاؤں|رہوں|سوؤں)\s+یا\s+(نہیں|نہ\b)/,
  /یا نہیں\s*$/,
  /(جاؤں|کروں|لوں|کھاؤں|رہوں|سوؤں|پڑھوں|خریدوں)\s+یا\s+(?!اللہ)\S+/,
  // Urdu — "which is better / which should I take".
  /کون سا بہتر/,
  /کونسا بہتر/,
  /کون سی بہتر/,
  /کون سا (لوں|چنوں|لینا)/,
  /کونسا (لوں|چنوں|لینا)/,
  // Urdu — asking for her opinion / advice.
  /مشورہ/,
  /تمہاری رائے/,
  /آپ کی رائے/,
  /تم کیا کہتی ہو/,
  /تم کیا کہتے ہو/,
  /آپ کیا کہتے ہیں/,
  /کیا سوچتی ہو/,
  /کیا سوچتے ہو/,
  /آپ کی کیا رائے/,
  // Roman Urdu.
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
  // English.
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

export function isDecisionSeeking(text: string): boolean {
  const t = normalizeDecisionText(text);
  if (t.length < 3) return false;
  if (FACTUAL_GUARDS.some((re) => re.test(t))) return false;
  return DECISION_PATTERNS.some((re) => re.test(t));
}

/**
 * Does a reply already carry a clear recommendation? A neutral
 * both-sides list ("یہ کرو یا وہ کرو") does NOT count — the markers
 * below all name HER decision, not the options.
 */
const RECOMMENDATION_MARKERS: RegExp[] = [
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

export function hasRecommendation(reply: string): boolean {
  const t = normalizeDecisionText(reply);
  if (t.length < 3) return false;
  return RECOMMENDATION_MARKERS.some((re) => re.test(t));
}

/** Feeling markers — a recommendation line must carry one (جان / دل /
 *  فکر / care …), so a bare instruction never passes as her decision. */
const FEELING_MARKERS: RegExp[] = [
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

export function hasFeeling(text: string): boolean {
  const t = normalizeDecisionText(text);
  return FEELING_MARKERS.some((re) => re.test(t));
}

// ---------------------------------------------------------------------------
// Fallback line — LAST RESORT only, when the model still answered
// neutrally despite the per-turn directive. It is built ONLY from this
// turn's own words (the user's options, the reply's options) and the
// real clock — never an invented fact, event or preference.
// ---------------------------------------------------------------------------

/** Split «A یا B» / «A or B» into options; [] when there is no choice. */
export function extractOptions(text: string): string[] {
  const t = String(text || '').replace(/[؟?!.۔]+/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = t.split(/\s+(?:یا|or)\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [];
  // A leading «یا اللہ» / «or» fragment is not an option — drop a
  // part that is only an invocation.
  const clean = parts.filter((p) => !/^(یا اللہ|یا اللّٰہ|or)$/i.test(p));
  return clean.length >= 2 ? clean : [];
}

const INFINITIVE_EXCEPTIONS: Record<string, string> = {
  'لوں': 'لینا',
  'دوں': 'دینا',
};

/**
 * Turn a first-person option («باہر جاؤں», «گھر رہوں», «نیا فون لوں»)
 * into its infinitive («باہر جانا», «گھر رہنا», «نیا فون لینا») so it
 * can follow «تم یہ کرو:». Only the LAST word is converted; anything
 * that does not end in a first-person «وں» verb is left untouched and
 * the caller quotes it instead.
 */
export function optionToInfinitive(option: string): string | null {
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
    // First-person verb ending: «وں» (و + ں) or «ؤں» (ؤ + ں, as in
    // جاؤں / کھاؤں / سوؤں) — both are TWO characters: drop both, add «نا».
    // Written with explicit escapes: [\u0648\u0624]\u06BA.
    words[words.length - 1] = `${last.slice(0, -2)}نا`;
    return words.join(' ');
  }
  if (/نا$/.test(last)) return words.join(' ');
  return null;
}

/** The option that mentions rest / home / sleep — the caring pick
 *  late at night or when he says he is tired. ('سو' alone would also
 *  match «سوچ», so the sleep forms are spelled out.) */
const REST_WORDS = /(گھر|آرام|نیند|سوؤں|سونا|رہوں|رہنا|rest|sleep|home|stay)/;

function pickOption(options: string[], restPreferred: boolean): string | null {
  if (options.length === 0) return null;
  if (restPreferred) {
    const rest = options.find((o) => REST_WORDS.test(o));
    if (rest) return rest;
  }
  return options[0];
}

export function decisionFallbackLine(
  userText: string,
  replyText: string,
  opts?: { feminine?: boolean; hour?: number },
): string {
  const feminine = opts?.feminine ?? true;
  const hour = opts?.hour ?? new Date().getHours();
  const night = hour >= 23 || hour < 5;
  const user = String(userText || '');
  const tired = /(تھک|تھکا|تھکی|نیند|tired|exhausted)/.test(user);
  const restPreferred = night || tired;
  const pet = feminine ? ' جان' : '';

  // 1) An option from HIS OWN words — first named, or the restful one
  //    when it is late / he is tired. A bare one-word verb («کروں»)
  //    carries no real choice, so it falls through to the general line.
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
  // 2) An option the MODEL itself named (its neutral list) — same rule.
  const replyOptions = extractOptions(replyText);
  const pickedReply = pickOption(replyOptions, restPreferred);
  if (pickedReply) {
    const inf = optionToInfinitive(pickedReply);
    if (inf && pickedReply.replace(/\s+/g, ' ').trim().split(' ').length >= 2) {
      return `میری رائے یہ ہے${pet} — تم یہ کرو: ${inf} — مجھے یہی بہتر لگتا ہے، میں تمہارے ساتھ ہوں۔`;
    }
  }
  // 3) Late night / tired — the caring decision is rest. Grounded in
  //    the real clock and his own words, never an invented plan.
  if (restPreferred) {
    return `میری رائے یہ ہے${pet} — تم یہ کرو: اب آرام کر لو، باقی سب کل دیکھ لیں گے — مجھے تمہاری تھکاوٹ کی فکر ہے، میں تمہارے ساتھ ہوں۔`;
  }
  // 4) No options at all — her decision is still a decision: follow
  //    what brings him peace. A stance, not a shrug; no facts invented.
  return `میری رائے یہ ہے${pet} — تم یہ کرو: جو تمہارے دل کو سکون دے، وہی کرو — میں تمہارے ساتھ ہوں، مجھے تمہاری خوشی کی فکر ہے۔`;
}
