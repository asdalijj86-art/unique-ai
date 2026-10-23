/**
 * Memory voice commands (Master Plan Phase 2 — his explicit spec):
 *
 *  «یہ یاد رکھو: …»        → save a note, confirm naming it
 *  «… بھول جاؤ / ڈیلیٹ کر دو» → delete the matching note(s), confirm
 *  «یہ بھول جاؤ» (no content) → forget the MOST RECENT note
 *  «ساری میموری ڈیلیٹ کر دو»  → clear everything, confirm the count
 *  «تم نے کیا سیکھا؟»        → list the LEARNED facts (Round 5)
 *
 * Round 5 (learning memory): these commands govern BOTH stores — the
 * notes here and the learnings in lib/learnings (one shared brain).
 * A taught note is also mined for learnings; a forget clears matching
 * entries from both; the full wipe clears both; the show command
 * lists what the team has learned about the person.
 *
 * Storage is the app's EXISTING notes store — localStorage key
 * 'unique-ai-notes', the same one ToolResults' NotesView reads and
 * writes (shape {id, text, createdAt}, newest first). The brain's
 * save_note / list_notes actions keep working on the same store.
 *
 * Anti-hijack discipline (same as the router gate): these commands
 * fire ONLY on command-shaped utterances. A long message that merely
 * mentions remembering/forgetting is conversation for the brain and
 * parses to null here — word budgets are enforced inside the parser
 * (save carries content, so its budget is larger; forget is short).
 *
 * Pure module: storage is injected ({getItem,setItem}-shaped), so the
 * real command logic is unit-testable headlessly.
 */

import {
  learnFromText,
  loadLearnings,
  findLearningsToForget,
  removeLearnings,
  clearLearnings,
  formatLearning,
  type Learning,
} from './learnings';

export type Note = { id: string; text: string; createdAt: string };

export const NOTES_KEY = 'unique-ai-notes';

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function loadNotes(storage: StorageLike): Note[] {
  try {
    const raw = storage.getItem(NOTES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((n) => n && typeof n.text === 'string')
      : [];
  } catch {
    return [];
  }
}

export function saveNotes(storage: StorageLike, notes: Note[]): void {
  try {
    storage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    // storage unavailable — memory just won't persist
  }
}

export function makeNote(text: string): Note {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------

export type MemoryCommand =
  | { type: 'save'; note: string }
  | { type: 'forget'; query: string | null }
  | { type: 'forget_all' }
  | { type: 'show' };

function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

const SAVE_VERB_RE = /(یاد رکھو|یاد کر لو|یاد کرلیں|یاد کر لیں|یاد رکھیں|یاد رکھنا|نوٹ کر لو|نوٹ کرلو|نوٹ کرو|نوٹ لکھو|نوٹ لکھ لو)/;
const FORGET_VERB_RE = /(بھول جاؤ|بھول جاو|بھول جا|بھولا دو|ڈیلیٹ کر دو|ڈیلیٹ کرو|ڈیلیٹ کر|مٹا دو|مٹا دیں|حذف کر دو|حذف کرو|delete kar do|bhool jao|bhool ja)/i;
const FORGET_FILLER_RE = /(یہ|وہ|اسے|اس کو|میرا|میری|میرے|نوٹ|یاد|بات|والی|والا|کو|جی)/g;

export function parseMemoryCommand(rawText: string): MemoryCommand | null {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const words = countWords(text);

  // --- forget EVERYTHING -------------------------------------------------
  // Checked first: «ساری میموری ڈیلیٹ کر دو» must never degrade into
  // "forget the note whose text is ساری میموری".
  if (words <= 12) {
    const allScope = /(ساری|تمام|سب|پوری|کلی)/.test(text);
    const memoryWord = /(میموری|یاد|یادیں|نوٹ|notes|memory)/i.test(text);
    const wipeVerb = /(ڈیلیٹ|بھول|مٹا|حذف|صاف|ختم|delete|clear|forget)/i.test(text);
    if ((allScope && wipeVerb) || (memoryWord && wipeVerb && allScope)) {
      return { type: 'forget_all' };
    }
    if (/(میموری|memory).{0,14}(ڈیلیٹ کر دو|ڈیلیٹ کرو|صاف کر دو|ختم کر دو)/i.test(text)) {
      return { type: 'forget_all' };
    }
  }

  // --- show what was learned ----------------------------------------------
  // «تم نے کیا سیکھا؟» / «میری یادداشت دکھاؤ» / «میرے بارے میں کیا یاد
  // ہے» — the transparency command for the LEARNING store (Round 5).
  // Fully anchored to the whole utterance (trailing punctuation
  // stripped): a question ABOUT a story («اس کہانی سے تم نے کیا سیکھا؟»)
  // or any longer sentence parses to null and reaches the brain.
  if (words <= 12) {
    const bare = text.replace(/[۔.!?؟\s]+$/u, '').trim();
    const SHOW_RES = [
      /^(?:تم|آپ) نے (?:میرے بارے میں )?کیا (?:سیکھا|سیکھ لیا|یاد کیا|یاد رکھا)(?: ہے)?$/,
      /^کیا (?:سیکھا|یاد رکھا)(?: ہے)?$/,
      /^(?:میری |اپنی )?یادداشت (?:دکھاؤ|دکھا دو|بتاؤ|بتا دو|سناؤ)$/,
      /^جو (?:کچھ )?سیکھا(?: ہے)?(?: وہ)? (?:دکھاؤ|بتاؤ|بتا دو|سناؤ)$/,
      /^میرے بارے میں (?:تمہیں |آپ کو )?کیا یاد ہے$/,
      /^what have you (?:learned|learnt)(?: about me)?$/i,
      /^what do you (?:know|remember) about me$/i,
      /^show (?:me )?(?:what you (?:have )?(?:learned|remember)|your memory|my memory)$/i,
    ];
    if (SHOW_RES.some((re) => re.test(bare))) return { type: 'show' };
  }

  // --- forget (specific or most-recent) -----------------------------------
  if (words <= 12 && FORGET_VERB_RE.test(text)) {
    const query = text
      .replace(FORGET_VERB_RE, ' ')
      .replace(FORGET_FILLER_RE, ' ')
      .replace(/[،,۔.!?؟:\s]+/g, ' ')
      .trim();
    return { type: 'forget', query: query || null };
  }

  // --- save ----------------------------------------------------------------
  // Content-bearing, so the budget is larger than a pure order — but
  // still bounded: a 40-word story that quotes «یاد رکھو» mid-way is
  // conversation, not a save order (the verb must also lead the
  // utterance, modulo a leading «یہ»).
  if (words <= 24) {
    const m = SAVE_VERB_RE.exec(text);
    if (m) {
      const before = text.slice(0, m.index).replace(/[،,۔!\s]+/g, ' ').trim();
      const beforeOk = before === '' || /^(یہ|اچھا|ٹھیک ہے|جی)$/.test(before);
      if (beforeOk) {
        const note = text
          .slice(m.index + m[0].length)
          .replace(/^[\s،,:؛\-—]+/, '')
          .replace(/^(کہ|keh)\s+/, '')
          .trim();
        if (note) return { type: 'save', note };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Matching + application
// ---------------------------------------------------------------------------

function normalizeForMatch(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // Arabic diacritics
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Which notes a forget-order targets. query === null («یہ بھول جاؤ»)
 * means the most recent note. Otherwise: notes whose text contains
 * the query win; failing that, notes sharing a distinctive token
 * (≥3 chars) with the query.
 */
export function findNotesToForget(notes: Note[], query: string | null): Note[] {
  if (!notes.length) return [];
  if (query === null) return [notes[0]];
  const q = normalizeForMatch(query);
  if (!q) return [notes[0]];
  const exact = notes.filter((n) => normalizeForMatch(n.text).includes(q));
  if (exact.length) return exact;
  const tokens = q.split(' ').filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  return notes.filter((n) => {
    const nt = normalizeForMatch(n.text);
    return tokens.some((t) => nt.includes(t));
  });
}

export type MemoryOutcome = {
  /** Notes affected (saved note, or the notes that were deleted). */
  affected: Note[];
  /** Total notes cleared (forget_all only). */
  clearedCount?: number;
  /** Learnings (lib/learnings) added by a save, or deleted by a forget. */
  learningsAffected?: Learning[];
  /** Total learnings cleared (forget_all only). */
  learningsCleared?: number;
};

export function applyMemoryCommand(
  storage: StorageLike,
  cmd: MemoryCommand,
): MemoryOutcome {
  const notes = loadNotes(storage);
  if (cmd.type === 'show') {
    // Display is the caller's job (it loads the learnings and formats
    // them); applying a show changes nothing.
    return { affected: [] };
  }
  if (cmd.type === 'save') {
    const note = makeNote(cmd.note);
    saveNotes(storage, [note, ...notes]);
    // A taught note ALSO feeds the learning brain (Round 5): «یاد رکھو
    // میرا نام احمد ہے» teaches the team the name, not just the note.
    const learned = learnFromText(storage, cmd.note, 'told');
    return { affected: [note], learningsAffected: learned };
  }
  if (cmd.type === 'forget_all') {
    saveNotes(storage, []);
    // The wipe covers BOTH stores — notes and everything learned.
    const learningsCleared = clearLearnings(storage);
    return { affected: [], clearedCount: notes.length, learningsCleared };
  }
  const targets = findNotesToForget(notes, cmd.query);
  if (targets.length) {
    const ids = new Set(targets.map((n) => n.id));
    saveNotes(storage, notes.filter((n) => !ids.has(n.id)));
  }
  // Learnings forget with the same order: a topic-named forget clears
  // it everywhere; a bare «یہ بھول جاؤ» touches a learning ONLY when
  // no note was deleted (one utterance, one deletion).
  let learningTargets: Learning[] = [];
  if (cmd.query !== null || !targets.length) {
    learningTargets = findLearningsToForget(loadLearnings(storage), cmd.query);
    if (learningTargets.length) removeLearnings(storage, learningTargets);
  }
  return { affected: targets, learningsAffected: learningTargets };
}

// ---------------------------------------------------------------------------
// Spoken confirmations — they NAME what was saved/forgotten, in the
// speaking persona's grammar (feminine = Uniqa).
// ---------------------------------------------------------------------------

function shortText(text: string, max = 60): string {
  const t = String(text || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function memoryConfirmation(
  cmd: MemoryCommand,
  outcome: MemoryOutcome,
  feminine: boolean,
): string {
  const ga = feminine ? 'گئی' : 'گیا';
  const gi = feminine ? 'گی' : 'گا';
  if (cmd.type === 'show') {
    // Unreachable in the app (chat.tsx formats the learnings list
    // itself); kept so the function is total over the command union.
    return 'جو کچھ میں نے آپ کے بارے میں سیکھا ہے، وہ اوپر دکھایا ہے۔';
  }
  if (cmd.type === 'save') {
    return `یاد کر لیا 💛 «${shortText(outcome.affected[0]?.text || cmd.note)}» — جب پوچھیں گے تو بتا دوں ${gi}۔`;
  }
  if (cmd.type === 'forget_all') {
    const n = outcome.clearedCount || 0;
    const lc = outcome.learningsCleared || 0;
    // The pinned sentence stays EXACT when only notes were cleared;
    // the learning clause is appended only when learnings truly went.
    if (n > 0 && lc === 0) {
      return `ساری میموری صاف کر دی — ${n} باتیں بھول ${ga}۔ اب کچھ یاد نہیں۔`;
    }
    if (n > 0) {
      return `ساری میموری صاف کر دی — ${n} باتیں بھول ${ga}، اور جو کچھ سیکھا تھا وہ بھی بھول ${ga}۔ اب کچھ یاد نہیں۔`;
    }
    if (lc > 0) {
      return `ساری میموری صاف کر دی — جو کچھ سیکھا تھا وہ بھی بھول ${ga}۔ اب کچھ یاد نہیں۔`;
    }
    return 'میموری پہلے ہی خالی تھی — بھولنے کو کچھ تھا ہی نہیں۔';
  }
  // forget
  const learnedGone = outcome.learningsAffected || [];
  if (!outcome.affected.length) {
    if (learnedGone.length) {
      const firstLearned = shortText(formatLearning(learnedGone[0]));
      return learnedGone.length > 1
        ? `بھول ${ga} — سیکھی ہوئی بات «${firstLearned}» اور ${learnedGone.length - 1} مزید باتیں مٹا دیں۔`
        : `بھول ${ga} — سیکھی ہوئی بات «${firstLearned}» مٹا دی۔`;
    }
    return 'ایسی کوئی یاد نہیں ملی جو مٹائی جا سکے — میموری میں وہ بات ہے ہی نہیں۔';
  }
  const first = shortText(outcome.affected[0].text);
  const extra = outcome.affected.length - 1;
  const base = extra > 0
    ? `بھول ${ga} — «${first}» اور ${extra} مزید باتیں میموری سے مٹا دیں۔`
    : `بھول ${ga} — «${first}» میموری سے مٹا دیا۔`;
  return learnedGone.length
    ? `${base} اور ${learnedGone.length} سیکھی ہوئی باتیں بھی مٹا دیں۔`
    : base;
}
