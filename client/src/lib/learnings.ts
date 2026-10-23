/**
 * Learning memory (Master Plan Round 5 — the user's «living brain»
 * spec, 2026-10-23 23:11): EVERYONE in the office — یونیک (boss),
 * یونیکا (manager) and all seven agents — shares ONE brain, and that
 * brain LEARNS from the person's own conversation: their name, likes
 * and dislikes, home, work, family facts, and how they like to talk.
 * The next replies then naturally show that knowledge — the assistant
 * «grows wiser with this person» — which is exactly, and only, what
 * this module implements: learned LOCAL memory + recall. It is NOT
 * model retraining, and it never leaves this device (the store is one
 * localStorage key, carried by the brain backup like every other
 * piece of brain state, API keys excluded as always).
 *
 * Two learning paths feed the store:
 *  a. AUTO — silent pattern extraction over each user message
 *     (extractLearnings): short, declarative, first-person statements
 *     in Urdu / Roman Urdu / English. Questions, jokes, quotations,
 *     hypotheticals and long stories NEVER produce a learning — the
 *     same anti-hijack discipline as the memory commands.
 *  b. TOLD — statements the user explicitly taught («یاد رکھو …» note
 *     saves and the brain's save_note action) are run through the
 *     same extractor with source 'told'.
 *
 * Control stays with the person: «تم نے کیا سیکھا؟» lists the
 * learnings (lib/memory routes it here), «… بھول جاؤ» deletes matching
 * ones, «ساری میموری ڈیلیٹ کر دو» clears them with the notes.
 *
 * Pure module: storage is injected ({getItem,setItem}-shaped), so the
 * whole system is unit-testable headlessly — see
 * scripts/test-learnings.mjs.
 */

export type LearningKind = 'name' | 'like' | 'dislike' | 'style' | 'fact';

export type Learning = {
  id: string;
  /** The learned content: the name itself for kind 'name', the liked
   *  or disliked thing for 'like'/'dislike', a short statement for
   *  'fact', a fixed soft note for 'style'. */
  text: string;
  kind: LearningKind;
  createdAt: string;
  source: 'auto' | 'told';
};

export const LEARNINGS_KEY = 'unique-ai-learnings';
export const MAX_LEARNINGS = 60;
export const RECALL_LIMIT = 12;

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function loadLearnings(storage: StorageLike): Learning[] {
  try {
    const raw = storage.getItem(LEARNINGS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (l): l is Learning =>
        !!l && typeof l.text === 'string' && typeof l.kind === 'string',
    );
  } catch {
    return [];
  }
}

export function saveLearnings(storage: StorageLike, learnings: Learning[]): void {
  try {
    storage.setItem(LEARNINGS_KEY, JSON.stringify(learnings));
  } catch {
    // storage unavailable — learning just won't persist
  }
}

function makeLearning(text: string, kind: LearningKind, source: 'auto' | 'told'): Learning {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text,
    kind,
    createdAt: new Date().toISOString(),
    source,
  };
}

/** Dedupe key: case/diacritic-insensitive, whitespace-collapsed. */
export function normalizeLearningText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // Arabic diacritics
    .replace(/[.,،۔!?'؟"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Add freshly extracted items to the store. Rules:
 *  - identical (kind + normalized text) is never duplicated;
 *  - a new name REPLACES the older name (the newest statement wins);
 *  - the store is capped at MAX_LEARNINGS — oldest entries fall off
 *    first, but the (single, newest) name is never evicted by the cap.
 * Returns the learnings that were actually added.
 */
export function addLearnings(
  storage: StorageLike,
  items: Array<{ text: string; kind: LearningKind }>,
  source: 'auto' | 'told',
): Learning[] {
  if (!items.length) return [];
  let current = loadLearnings(storage);
  const added: Learning[] = [];
  for (const item of items) {
    const text = String(item.text || '').trim();
    if (!text) continue;
    if (item.kind === 'name') {
      current = current.filter((l) => l.kind !== 'name');
    }
    const key = normalizeLearningText(text);
    if (current.some((l) => l.kind === item.kind && normalizeLearningText(l.text) === key)) {
      continue;
    }
    const learning = makeLearning(text, item.kind, source);
    current = [learning, ...current];
    added.push(learning);
  }
  if (!added.length) return [];
  if (current.length > MAX_LEARNINGS) {
    // Oldest fall off first — but the person's name is never evicted
    // by the cap (it is the one fact every reply may need).
    const nameEntry = current.find((l) => l.kind === 'name');
    current = current.slice(0, MAX_LEARNINGS);
    if (nameEntry && !current.some((l) => l.id === nameEntry.id)) {
      current[current.length - 1] = nameEntry;
    }
  }
  saveLearnings(storage, current);
  return added;
}

/** Extract from one message and store silently. Returns what was added. */
export function learnFromText(
  storage: StorageLike,
  rawText: string,
  source: 'auto' | 'told',
): Learning[] {
  const items = extractLearnings(rawText);
  return addLearnings(storage, items, source);
}

export function clearLearnings(storage: StorageLike): number {
  const n = loadLearnings(storage).length;
  saveLearnings(storage, []);
  return n;
}

// ---------------------------------------------------------------------------
// Forgetting (matching mirrors lib/memory's note rules, applied to the
// learning's DISPLAY form so topic words like نام / پسند hit the right
// kind: «نام والی بات بھول جاؤ» forgets the learned name.)
// ---------------------------------------------------------------------------

export function formatLearning(l: Learning): string {
  switch (l.kind) {
    case 'name': return `نام: ${l.text}`;
    case 'like': return `پسند: ${l.text}`;
    case 'dislike': return `ناپسند: ${l.text}`;
    default: return l.text;
  }
}

export function findLearningsToForget(learnings: Learning[], query: string | null): Learning[] {
  if (!learnings.length) return [];
  if (query === null) return [learnings[0]];
  const q = normalizeLearningText(query);
  if (!q) return [learnings[0]];
  const exact = learnings.filter((l) => normalizeLearningText(formatLearning(l)).includes(q));
  if (exact.length) return exact;
  const tokens = q.split(' ').filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  return learnings.filter((l) => {
    const lt = normalizeLearningText(formatLearning(l));
    return tokens.some((t) => lt.includes(t));
  });
}

export function removeLearnings(storage: StorageLike, targets: Learning[]): void {
  if (!targets.length) return;
  const ids = new Set(targets.map((l) => l.id));
  saveLearnings(storage, loadLearnings(storage).filter((l) => !ids.has(l.id)));
}

// ---------------------------------------------------------------------------
// Display — «تم نے کیا سیکھا؟» (spoken AND on screen; the caller speaks
// exactly this text).
// ---------------------------------------------------------------------------

export function formatLearningsList(learnings: Learning[], feminine: boolean): string {
  const dun = feminine ? 'دوں گی' : 'دوں گا';
  const ga = feminine ? 'گی' : 'گا';
  if (!learnings.length) {
    return `ابھی تک میں نے آپ کے بارے میں کچھ خاص نہیں سیکھا — جیسے جیسے ہماری بات ہو گی، میں سیکھتا جاؤں ${ga}، اور جو بتائیں گے یاد رکھوں ${ga}۔`;
  }
  const lines = learnings.map((l, i) => `${i + 1}. ${formatLearning(l)}`);
  return `جو کچھ میں نے آپ کے بارے میں سیکھا ہے، وہ یہ ہے:\n${lines.join('\n')}\nان میں سے کچھ بھلوانا ہو تو بس کہہ دیں «یہ بھول جاؤ» — مٹا ${dun}۔`;
}

// ---------------------------------------------------------------------------
// Recall — the compact block attached to every outgoing request so
// the whole team (Unique, Uniqa, every agent — one shared brain)
// uses what was learned. Name first, then most recent, capped.
// ---------------------------------------------------------------------------

const RECALL_TEXT_CAP = 42;

function clipText(t: string): string {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > RECALL_TEXT_CAP ? `${s.slice(0, RECALL_TEXT_CAP)}…` : s;
}

export function buildRecallBlock(learnings: Learning[], limit: number = RECALL_LIMIT): string {
  if (!learnings.length) return '';
  const name = learnings.find((l) => l.kind === 'name');
  const rest = learnings.filter((l) => l.kind !== 'name').slice(0, Math.max(0, limit - (name ? 1 : 0)));
  const picked = [...(name ? [name] : []), ...rest].slice(0, limit);
  const likes = picked.filter((l) => l.kind === 'like').map((l) => clipText(l.text));
  const dislikes = picked.filter((l) => l.kind === 'dislike').map((l) => clipText(l.text));
  const facts = picked.filter((l) => l.kind === 'fact').map((l) => clipText(l.text));
  const style = picked.find((l) => l.kind === 'style');
  const parts: string[] = [];
  if (name) parts.push(`Name: ${clipText(name.text)}`);
  if (likes.length) parts.push(`Likes: ${likes.join('؛ ')}`);
  if (dislikes.length) parts.push(`Dislikes: ${dislikes.join('؛ ')}`);
  if (facts.length) parts.push(`Known facts: ${facts.join('؛ ')}`);
  if (style) parts.push(`Talking style: ${clipText(style.text)}`);
  return parts.join('. ');
}

// ---------------------------------------------------------------------------
// Extraction — silent pattern learning from ONE user message.
//
// Discipline (mirrors the memory commands' anti-hijack gate):
//  - only SHORT messages (≤32 words) are mined at all — a long story
//    that quotes someone's name/likes is conversation, not a fact
//    about this person;
//  - extraction runs per CLAUSE (split on sentence enders and on
//    «اور» before a first-person pronoun); a QUESTION clause is
//    never mined («مجھے کیا پسند ہے؟» teaches nothing);
//  - hypothetical / attributed / joke framing voids the whole
//    message («اگر …», «اس نے کہا …», «لطیفہ …»);
//  - captures are validated (length, no question words, no pronouns
//    standing alone, no command verbs posing as a name).
// ---------------------------------------------------------------------------

const MAX_EXTRACT_WORDS = 32;

// NOTE: «کہتے ہیں» is deliberately NOT void framing — «مجھے علی کہتے
// ہیں» is the idiomatic "I am called Ali" and must teach the name.
// True attribution («اس نے کہا …») is still voided.
const VOID_FRAMING_RE = /(اگر|شاید|فرض کرو|کہا کرتے|اس نے کہا|اس نے بتایا|انھوں نے کہا|انہوں نے کہا|لطیفہ|کہاوت|مزاح|نقل کر|quote|joke|suppose|imagine)/i;

const QUESTION_WORDS = new Set([
  'کیا', 'کون', 'کب', 'کیوں', 'کیسے', 'کہاں', 'کتنا', 'کتنی', 'کتنے', 'کس',
  'what', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'which',
]);

const NAME_STOPWORDS = new Set([
  'یہ', 'وہ', 'کچھ', 'سب', 'نہیں', 'ٹھیک', 'اچھا', 'جی', 'نام', 'ہے', 'ھے',
  'the', 'a', 'an', 'mr', 'sir', 'madam', 'hai', 'hay', 'he', 'is',
]);

// Command/verb forms that must never be mistaken for a person's name
// («کیا تم میرا نام جانتے ہو» — جانتے ہو is not a name).
const NAME_VERB_RE = /(جانت|بتاؤ|بتا|کہو|کہ|سناؤ|دکھاؤ|بولو|یاد|لکھو|پوچھ)/;

const ITEM_STOPWORDS = new Set([
  'یہ', 'وہ', 'سب', 'کچھ', 'ایسا', 'ویسا', 'آپ', 'تم', 'مجھے',
  'you', 'u', 'it', 'that', 'this', 'them', 'everything', 'anything', 'nothing', 'me',
]);

// Emotional/physical states — «میں تھکا ہوا ہوں» is a mood, not a bio
// fact for the learn store (the feelings engine handles moods live).
const STATE_STOPWORDS = new Set([
  'تھکا', 'تھکی', 'بیمار', 'خوش', 'اداس', 'ٹھیک', 'مصروف', 'فارغ', 'لیٹ',
  'یہاں', 'وہاں', 'گھر', 'تیار', 'اکیلا', 'اکیلی', 'پریشان', 'بھوکا', 'بھوکی',
  'happy', 'sad', 'tired', 'busy', 'fine', 'ok', 'okay', 'sick', 'late', 'ready', 'alone',
]);

const RELATIONS = ['بیٹی', 'بیٹا', 'اہلیہ', 'بیوی', 'شوہر', 'بھائی', 'بہن', 'والد', 'والدہ', 'والد صاحب', 'امی', 'ابو', 'دادا', 'دادی', 'نانا', 'نانی'];

function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function splitClauses(text: string): Array<{ text: string; question: boolean }> {
  const raw = String(text || '')
    .split(/(?<=[۔.!?؟\n])\s+|\n+/)
    .flatMap((part) => part.split(/\s+اور\s+(?=(?:مجھے|میرا|میری|میرے|میں)\s)/))
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.map((clause) => ({
    text: clause.replace(/[۔.!]+$/u, '').trim(),
    question: /[?؟]\s*$/.test(clause) || /^کیا\s/.test(clause.trim()),
  }));
}

function hasQuestionWord(s: string): boolean {
  return s.split(/\s+/).some((w) => QUESTION_WORDS.has(w.toLowerCase()));
}

function cleanCapture(raw: string): string {
  return String(raw || '')
    .replace(/[«»"'“”‘’()]+/g, ' ')
    .replace(/^(?:تو|بس|جی|ہاں)\s+/, '')
    .replace(/\s+(?:ہے|ھے|ہیں|گیا|گی)\s*$/, '')
    .replace(/\s+(?:بھی|بالکل)\s*$/, '')
    .replace(/[\s،,؛:۔.!?؟-]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validName(raw: string): string | null {
  const name = cleanCapture(raw);
  if (!name) return null;
  const words = name.split(/\s+/);
  if (words.length < 1 || words.length > 3) return null;
  if (name.length > 30) return null;
  if (/\d/.test(name)) return null;
  if (NAME_VERB_RE.test(name)) return null;
  if (hasQuestionWord(name)) return null;
  if (words.some((w) => NAME_STOPWORDS.has(w.toLowerCase()))) return null;
  if (!/^[\p{L}\s.'’-]+$/u.test(name)) return null;
  return name;
}

function validItem(raw: string): string | null {
  const item = cleanCapture(raw)
    .replace(/^(?:بہت|بڑا|بڑی)\s+/, '')
    .trim();
  if (!item) return null;
  const words = item.split(/\s+/);
  if (words.length < 1 || words.length > 6) return null;
  if (item.length > 42) return null;
  if (hasQuestionWord(item)) return null;
  if (words.length === 1 && ITEM_STOPWORDS.has(words[0].toLowerCase())) return null;
  if (ITEM_STOPWORDS.has(item.toLowerCase())) return null;
  return item;
}

// Roman-Urdu markers (mirrors server brain.js's detection word set).
const ROMAN_MARKERS = new Set([
  'mujhe', 'mujhay', 'mera', 'meri', 'mere', 'hai', 'hain', 'kya', 'nahi',
  'nahin', 'pasand', 'acha', 'achha', 'theek', 'batao', 'karo', 'karna',
  'liye', 'bohat', 'bahut', 'aaj', 'kal', 'ghar', 'tum', 'aap', 'ka', 'ki',
  'ke', 'ko', 'mein', 'wala', 'wali', 'lagta', 'lagti', 'naam', 'raha',
]);

function romanStyleOf(text: string): boolean {
  // Latin script overall, with several Roman-Urdu markers — a one-off
  // English sentence must NOT relabel the person's style.
  const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  const hits = words.filter((w) => ROMAN_MARKERS.has(w)).length;
  return hits >= 2;
}

export function extractLearnings(rawText: string): Array<{ text: string; kind: LearningKind }> {
  const text = String(rawText || '').trim();
  if (!text) return [];
  if (countWords(text) > MAX_EXTRACT_WORDS) return [];
  if (VOID_FRAMING_RE.test(text)) return [];

  const out: Array<{ text: string; kind: LearningKind }> = [];
  const push = (item: { text: string; kind: LearningKind } | null) => {
    if (item && !out.some((o) => o.kind === item.kind && normalizeLearningText(o.text) === normalizeLearningText(item.text))) {
      out.push(item);
    }
  };

  let nameFoundInMessage = false;

  for (const clause of splitClauses(text)) {
    if (clause.question) continue;
    const c = clause.text;
    if (!c) continue;

    // --- family fact: «میری بیٹی کا نام فاطمہ ہے» ----------------------
    const fam = new RegExp(`(?:میری|میرے)\\s+(${RELATIONS.join('|')})\\s+کا نام\\s+(.+?)(?:\\s+ہے|\\s+ھے)?$`).exec(c);
    if (fam) {
      const nm = validName(fam[2]);
      if (nm) push({ text: `${fam[1]} کا نام ${nm} ہے`, kind: 'fact' });
      continue;
    }

    // --- name ------------------------------------------------------------
    let name: string | null = null;
    const nameUr = /میرا نام\s+(.+?)(?:\s+ہے|\s+ھے)?$/.exec(c);
    const nameCall = /مجھے\s+(.+?)\s+(?:کہتے ہیں|کہا کرو|کہو|کہا کریں)$/.exec(c);
    const nameRoman = /\bmera naam\s+(.+?)(?:\s+hai|\s+hay)?\s*$/i.exec(c);
    const nameEn = /\bmy name is\s+(.+?)\s*$/i.exec(c) || /\bcall me\s+(.+?)\s*$/i.exec(c);
    if (nameUr) name = validName(nameUr[1]);
    else if (nameCall) name = validName(nameCall[1]);
    else if (nameRoman) name = validName(nameRoman[1]);
    else if (nameEn) name = validName(nameEn[1]);
    if (name) {
      push({ text: name, kind: 'name' });
      nameFoundInMessage = true;
      continue;
    }

    // --- dislike (checked before like: «پسند نہیں» contains «پسند») ----
    const disUr = /مجھے\s+(.+?)\s+(?:پسند نہیں|اچھ(?:ا|ی|ے) نہیں لگت(?:ا|ی|ے))(?:\s+ہے|\s+ھے)?$/.exec(c);
    const disRoman = /\bmujh(?:e|ay)\s+(.+?)\s+pasand\s+(?:nahi|nahin|nhi)\b/i.exec(c);
    const disEn = /\bi\s+(?:don'?t|do not|never)\s+like\s+(.+?)\s*$/i.exec(c)
      || /\bi\s+(?:hate|dislike)\s+(.+?)\s*$/i.exec(c);
    const dis = disUr || disRoman || disEn;
    if (dis) {
      const item = validItem(dis[1]);
      if (item) push({ text: item, kind: 'dislike' });
      continue;
    }

    // --- like --------------------------------------------------------------
    const likeUr = /مجھے\s+(.+?)\s+(?:بہت\s+)?(?:پسند|اچھ(?:ا|ی|ے)\s+لگت(?:ا|ی|ے))(?:\s+ہے|\s+ھے)?$/.exec(c);
    const likeRoman = /\bmujh(?:e|ay)\s+(.+?)\s+pasand\s+(?:hai|hay|he)\b/i.exec(c)
      || /\bmujh(?:e|ay)\s+(.+?)\s+ach(?:a|ha)\s+lagt(?:a|i)\s+hai\b/i.exec(c);
    const likeEn = /\bi\s+(?:really\s+)?(?:like|love)\s+(.+?)\s*$/i.exec(c)
      || /\bi\s+enjoy\s+(.+?)\s*$/i.exec(c);
    const like = likeUr || likeRoman || likeEn;
    if (like) {
      const item = validItem(like[1]);
      if (item) push({ text: item, kind: 'like' });
      continue;
    }

    // --- facts: origin / residence / profession --------------------------
    const origin = /میں\s+(.+?)\s+سے\s+ہوں$/.exec(c);
    if (origin) {
      const place = validItem(origin[1]);
      if (place && place.split(/\s+/).length <= 3) {
        push({ text: `${place} سے ہے`, kind: 'fact' });
        continue;
      }
    }
    const residence = /میں\s+(.+?)\s+میں\s+رہت(?:ا|ی|ے)\s+ہوں$/.exec(c);
    if (residence) {
      const place = validItem(residence[1]);
      if (place && place.split(/\s+/).length <= 3) {
        push({ text: `${place} میں رہائش ہے`, kind: 'fact' });
        continue;
      }
    }
    const profEn = /\bi(?:'m| am)\s+an?\s+(.+?)\s*$/i.exec(c);
    if (profEn) {
      const prof = cleanCapture(profEn[1]);
      const profWords = prof.toLowerCase().split(/\s+/).filter(Boolean);
      // «I'm a bit tired» / «I'm a happy person» are states, not jobs:
      // any state word (or softener like bit/little) anywhere in the
      // capture voids it.
      const statey = profWords.some(
        (w) => STATE_STOPWORDS.has(w) || ['bit', 'little', 'lot', 'kind', 'sort', 'just', 'very'].includes(w),
      );
      if (prof && profWords.length >= 1 && profWords.length <= 3 && !statey && !hasQuestionWord(prof)) {
        push({ text: `Profession: ${prof}`, kind: 'fact' });
        continue;
      }
    }
    // «میں X ہوں» bare — profession/role ONLY when the clause is tiny
    // and X is not a passing state (and no name was just learned from
    // this same «میں» shape).
    if (!nameFoundInMessage) {
      const profUr = /^میں\s+(?:ایک\s+)?(.+?)\s+ہوں$/.exec(c);
      if (profUr && countWords(c) <= 5) {
        const prof = cleanCapture(profUr[1]);
        const words = prof.split(/\s+/);
        if (
          prof && words.length <= 2
          && !words.some((w) => STATE_STOPWORDS.has(w))
          && !hasQuestionWord(prof)
          && !/سے|میں/.test(prof)
        ) {
          push({ text: `پیشہ: ${prof}`, kind: 'fact' });
          continue;
        }
      }
    }
  }

  // --- style (soft note, at most one, only from clearly Roman-Urdu talk)
  if (romanStyleOf(text)) {
    push({ text: 'Roman Urdu میں بات چیت پسند ہے', kind: 'style' });
  }

  return out;
}
