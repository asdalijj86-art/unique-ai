/**
 * agent-team — the SEVEN standing helper agents (consolidated
 * 2026-10-22 on the user's order, names chosen with him).
 *
 * The team used to be 11 fine-grained agents (one per data tool).
 * The user consolidated them into seven standing agents with
 * BALANCED duties — grouping only, no capability lost:
 *   ① دانیال 🔎 تلاش        — web + YouTube search
 *   ② حسن   🌦️ خبر و موسم   — news + weather
 *   ③ عمر   🧮 حساب کتاب     — calculator, currency, units, timer, world clock
 *   ④ علی   ✍️ لکھائی        — documents/CV/assignment/translation + download card
 *   ⑤ حمزہ  🎨 میڈیا         — image/video hubs + QR code
 *   ⑥ یوسف  🕌 قرآن و نماز    — Quran focus/recitation + prayer times
 *   ⑦ احمد  🛠️ بلڈر         — app/software building
 *
 * Every action type a chat reply can carry has exactly one owner
 * below (the 11 data types of the old roster, plus page_summary /
 * open_link → دانیال, notes → علی, video_ideas / qr_code → حمزہ,
 * doc_download / translate → علی, android_app → احمد).
 *
 * This roster is the SINGLE data source for the team: name (person),
 * icon, duty, blurb, the server action types and media/focus tools
 * each agent owns. A later phase renders these same defs as an
 * office scene (cabins + computers) — keep everything data-driven
 * here, never hard-code agent info in components.
 *
 * Honesty rule (unchanged): strip cards are created from the
 * client-side detectors below and FINALIZED only from the actions
 * the server actually returned; if the server answers with plain
 * chat, the strip is discarded, never shown as fake work. Work that
 * opens as its own screen (حمزہ's media hubs, احمد's app builder) or
 * as a focus view (یوسف's Quran reader) is never predicted for the
 * strip — those detectors return false so the strip never claims
 * it. (حمزہ's QR code is the one exception: it is a genuine data
 * action inside chat replies, so it keeps its detector.)
 */

export type AgentDef = {
  /** Stable key used for card state and scene rows. */
  key: string;
  /** Personal name, e.g. «دانیال». */
  person: string;
  icon: string;
  /** Urdu duty label, e.g. «تلاش ایجنٹ» — shown as «دانیال — تلاش ایجنٹ». */
  duty: string;
  /** One line: what this agent is responsible for (team scene). */
  blurb: string;
  /** Server action types this agent produces in chat replies. */
  actionTypes: string[];
  /** Media/focus capabilities this agent owns (opened as their own
   *  screens via the brain's open_tool action / focus commands). */
  tools?: string[];
  /** Lightweight client-side detector (mirrors the server's patterns). */
  detect: (text: string) => boolean;
};

/** Display label used everywhere the UI names an agent: «نام — ذمہ داری». */
export function agentLabel(def: AgentDef): string {
  return `${def.person} — ${def.duty}`;
}

const hasMathExpr = (t: string) => /\d[\d\s.,()]*[+\-*/×÷%][\d\s.,()+*/×÷%()-]/.test(t)
  || (/(حساب|calculate|کیلکولیٹ|hisab)/i.test(t) && /\d/.test(t));

const detectSearch = (t: string) => /(تلاش کرو|سرچ کرو|search karo|کے بارے میں بتاؤ|گوگل کرو)/i.test(t);
const detectYoutube = (t: string) => /(یوٹیوب|youtube)/i.test(t) && /(تلاش|search|ویڈیو|video|دکھاؤ|دیکھو)/i.test(t);
const detectNews = (t: string) => /(تازہ.*خبر|خبریں|اخبار|news|headlines|سرخیاں)/i.test(t);
const detectWeather = (t: string) => /(موسم|mausam|weather)/i.test(t);
const detectCurrency = (t: string) => /(ڈالر|روپے|یورو|پاؤنڈ|ریال|درہم|دینار|currency|کرنسی|dollar|rupees|euro|pound)/i.test(t) && /\d/.test(t);
const detectUnit = (t: string) => /\d/.test(t) && /(کلو\s?گرام|پاؤنڈ|کلومیٹر|میل|میٹر|سینٹی|فٹ|انچ|لیٹر|kilogram|pound|kilometer|mile|meter|feet|inch|liter)/i.test(t);
const detectTimer = (t: string) => /(ٹائمر|timer|الارم|countdown)/i.test(t) && /\d/.test(t);
const detectClock = (t: string) => /(ٹائم کیا ہے|وقت کیا ہے|کتنے بجے|ٹائم بتاؤ|time in)/i.test(t);
const detectPrayer = (t: string) => /(نماز|اذان|prayer)/i.test(t) && /(اوقات|وقت|ٹائم|time)/i.test(t);
const detectTranslate = (t: string) => /(ترجمہ|translate|tarjuma)/i.test(t);
const detectQr = (t: string) => /(qr|کیو آر)/i.test(t) && /(بناؤ|banao|code|کوڈ)/i.test(t);

export const AGENT_DEFS: AgentDef[] = [
  {
    key: 'talash', person: 'دانیال', icon: '🔎', duty: 'تلاش ایجنٹ',
    blurb: 'ویب اور یوٹیوب پر تلاش کر کے نتائج، لنک اور ویڈیوز لاتا ہے، اور دیے گئے ویب پیج کو پڑھ کر اس کا خلاصہ بھی دیتا ہے۔',
    actionTypes: ['search_results', 'youtube_results', 'page_summary', 'open_link'],
    detect: (t) => detectSearch(t) || detectYoutube(t),
  },
  {
    key: 'khabar-mausam', person: 'حسن', icon: '🌦️', duty: 'خبر و موسم ایجنٹ',
    blurb: 'تازہ ترین خبریں اور سرخیاں، اور کسی بھی شہر کا موجودہ موسم لاتا ہے۔',
    actionTypes: ['news_results', 'weather'],
    detect: (t) => detectNews(t) || detectWeather(t),
  },
  {
    key: 'hisab-kitab', person: 'عمر', icon: '🧮', duty: 'حساب کتاب ایجنٹ',
    blurb: 'حساب، کرنسی کے ریٹ، اکائیوں کی تبدیلی، ٹائمر اور دنیا بھر کا وقت — سارے عددی کام اس کے ذمے ہیں۔',
    actionTypes: ['calc_result', 'currency_result', 'unit_convert', 'set_timer', 'world_clock'],
    detect: (t) => hasMathExpr(t) || detectCurrency(t) || detectUnit(t) || detectTimer(t) || detectClock(t),
  },
  {
    key: 'likhai', person: 'علی', icon: '✍️', duty: 'لکھائی ایجنٹ',
    blurb: 'CV، اسائنمنٹ، انوائس اور ای میل لکھتا ہے، ترجمہ کرتا ہے، نوٹس محفوظ کرتا ہے — اور بنی ہوئی فائل کا PDF ڈاؤن لوڈ کارڈ بھی اسی کا کام ہے۔',
    actionTypes: ['translate_result', 'doc_download', 'save_note', 'list_notes'],
    tools: ['resume_builder', 'assignment_maker', 'invoice_gen', 'email'],
    detect: detectTranslate,
  },
  {
    key: 'media', person: 'حمزہ', icon: '🎨', duty: 'میڈیا ایجنٹ',
    blurb: 'تصویر اور ویڈیو کے سارے کام — بیک گراؤنڈ ہٹانا، تصویر صاف/ری سائز کرنا، تصویر پر متن، ویڈیو تیار کرنا — اور QR کوڈ بنانا۔ سوشل میڈیا کی لائیو خبریں بھی یہی بتاتا ہے — اس وقت کیا چل رہا ہے، کیا نہیں۔ ہب والا کام اس کی اپنی اسکرین پر کھلتا ہے۔',
    actionTypes: ['qr_code', 'video_ideas', 'social_news_results'],
    tools: ['image_tools', 'video_tools'],
    // The image/video HUBS open as their own screen from the brain's
    // single open_tool action — never predicted for the strip. The QR
    // code is different: it is a real data action that can ride a
    // multi-action reply, so it keeps its detector and its card.
    detect: detectQr,
  },
  {
    key: 'quran-namaz', person: 'یوسف', icon: '🕌', duty: 'قرآن و نماز ایجنٹ',
    blurb: 'قرآن پاک کھولتا ہے اور نام لے کر کہی گئی سورت کی تلاوت سناتا ہے، اور کسی بھی شہر کے نماز کے اوقات بتاتا ہے۔',
    actionTypes: ['prayer_times'],
    tools: ['quran'],
    detect: detectPrayer,
  },
  {
    key: 'builder', person: 'احمد', icon: '🛠️', duty: 'بلڈر ایجنٹ',
    blurb: 'کہنے پر گیم، سافٹ ویئر، ویب سائٹ اور چھوٹا AI بنا کر لنک دیتا ہے — «کار والی گیم بنا دو» کہیں، تیاری اس کے ذمے؛ موبائل PWA ایپ والی اسکرین بھی اسی کی ہے۔',
    actionTypes: ['android_app', 'build_app'],
    // Building is a single, long job with its own live card (the
    // build_app card polls the job's real status) — never part of the
    // parallel strip.
    detect: () => false,
  },
];

export function agentForActionType(actionType: string): AgentDef | undefined {
  return AGENT_DEFS.find((d) => d.actionTypes.includes(actionType));
}

/**
 * Client-side prediction of which agents a message will need. Returns
 * the matching defs (max 4). The chat shows the team strip only when
 * 2+ defs match; final states always come from the server's actions.
 */
export function detectAgentTasks(text: string): AgentDef[] {
  const t = String(text || '');
  if (!t.trim()) return [];
  const matched = AGENT_DEFS.filter((d) => {
    try { return d.detect(t); } catch { return false; }
  });
  return matched.slice(0, 4);
}

export type AgentTaskState = {
  key: string;
  icon: string;
  /** «نام — ذمہ داری», e.g. «دانیال — تلاش ایجنٹ». */
  label: string;
  status: 'working' | 'done' | 'failed';
  /** What the agent is/was actually on — the user's own request text
   *  (shortened). The office scene's close-up shows it as «ابھی: …»;
   *  the strip ignores it. Always the REAL request, never invented. */
  detail?: string;
};

/** Build the strip's initial (working) cards from predicted defs. */
export function workingCards(defs: AgentDef[], detail?: string): AgentTaskState[] {
  return defs.map((d) => ({ key: d.key, icon: d.icon, label: agentLabel(d), status: 'working' as const, detail }));
}

/**
 * Finalize the strip from the actions the server ACTUALLY returned:
 * one done card per returned action (in server order), plus a failed
 * card for any predicted agent that produced no action.
 */
export function finalizeCards(predicted: AgentDef[], actionTypes: string[], detail?: string): AgentTaskState[] {
  const cards: AgentTaskState[] = [];
  const seen = new Set<string>();
  for (const type of actionTypes) {
    const def = agentForActionType(type);
    if (!def || seen.has(def.key)) continue;
    seen.add(def.key);
    cards.push({ key: def.key, icon: def.icon, label: agentLabel(def), status: 'done', detail });
  }
  for (const def of predicted) {
    if (seen.has(def.key)) continue;
    seen.add(def.key);
    cards.push({ key: def.key, icon: def.icon, label: agentLabel(def), status: 'failed', detail });
  }
  return cards;
}
